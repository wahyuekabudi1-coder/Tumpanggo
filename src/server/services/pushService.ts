/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unified Push Notification Service for TumpangGo
 * Dispatches notifications across both:
 * 1. Native Android Firebase Cloud Messaging (FCM) - delivers background alerts,
 *    wakes device, triggers custom sound ('order_ringtone') even when app/screen is closed.
 * 2. Web Push (VAPID) - delivers to desktop & mobile browser service workers.
 */

import webpush from 'web-push';
import { vapidConfig } from '../config';
import { foodDb, PushSubscriptionRecord } from '../db';
import { getAdminMessaging } from '../firebaseAdmin';
import { Order, OrderStatus } from '../../types';

export interface UnifiedPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  sound?: string;
  channelId?: string;
  pendingCount?: number;
  data?: Record<string, string>;
}

export interface PushDispatchResult {
  sentWebPush: number;
  failedWebPush: number;
  sentFCM: number;
  failedFCM: number;
  totalSent: number;
  totalFailed: number;
}

class PushNotificationService {
  private vapidInitialized = false;
  // Deduplication cache to prevent mass ringing or duplicate triggers
  private recentlyNotifiedOrders = new Map<string, number>();

  private ensureVapidConfigured() {
    if (this.vapidInitialized) return;

    if (vapidConfig.isConfigured) {
      try {
        webpush.setVapidDetails(
          vapidConfig.subject,
          vapidConfig.publicKey,
          vapidConfig.privateKey
        );
        this.vapidInitialized = true;
        console.log('[PushService] Web Push VAPID successfully initialized.');
      } catch (err) {
        console.warn('[PushService] Failed to set VAPID details:', err);
      }
    }
  }

  public getVapidPublicKey(): string {
    return vapidConfig.publicKey;
  }

  /**
   * Send push notification to all devices (Web Push + Android FCM) registered for a specific Merchant
   */
  public async sendToMerchant(
    merchantId: string,
    payload: UnifiedPushPayload
  ): Promise<PushDispatchResult> {
    const subs = foodDb.getPushSubscriptionsForEntity('MERCHANT', merchantId);
    if (!subs || subs.length === 0) {
      return {
        sentWebPush: 0,
        failedWebPush: 0,
        sentFCM: 0,
        failedFCM: 0,
        totalSent: 0,
        totalFailed: 0
      };
    }

    return this.dispatchUnified(subs, {
      ...payload,
      channelId: payload.channelId || 'tumpanggo_merchant_orders',
      sound: payload.sound || 'order_ringtone'
    });
  }

  /**
   * Send push notification to all devices (Web Push + Android FCM) registered for a specific Driver
   */
  public async sendToDriver(
    driverId: string,
    payload: UnifiedPushPayload
  ): Promise<PushDispatchResult> {
    const subs = foodDb.getPushSubscriptionsForEntity('DRIVER', driverId);
    if (!subs || subs.length === 0) {
      return {
        sentWebPush: 0,
        failedWebPush: 0,
        sentFCM: 0,
        failedFCM: 0,
        totalSent: 0,
        totalFailed: 0
      };
    }

    return this.dispatchUnified(subs, {
      ...payload,
      channelId: payload.channelId || 'tumpanggo_driver_orders',
      sound: payload.sound || 'order_ringtone'
    });
  }

  /**
   * Dedicated notification trigger when an order status reaches PAYMENT_VERIFIED
   * Includes strict deduplication and multi-order pending summaries
   */
  public async notifyNewVerifiedOrder(order: Order): Promise<PushDispatchResult> {
    const orderId = order.id;
    const now = Date.now();

    // 1. Deduplication guard: ignore re-triggers within 45 seconds for same order
    const lastSent = this.recentlyNotifiedOrders.get(orderId);
    if (lastSent && now - lastSent < 45000) {
      console.log(`[PushService] Deduplicating order notification for ${orderId} (sent ${Math.round((now - lastSent) / 1000)}s ago).`);
      return {
        sentWebPush: 0,
        failedWebPush: 0,
        sentFCM: 0,
        failedFCM: 0,
        totalSent: 0,
        totalFailed: 0
      };
    }
    this.recentlyNotifiedOrders.set(orderId, now);

    // Housekeeping: clean entries older than 10 minutes
    if (this.recentlyNotifiedOrders.size > 200) {
      for (const [k, timestamp] of this.recentlyNotifiedOrders.entries()) {
        if (now - timestamp > 600000) {
          this.recentlyNotifiedOrders.delete(k);
        }
      }
    }

    try {
      const orderNum = order.orderNumber || order.id;
      const itemCount = (order.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
      const subtotalFormatted = 'Rp ' + (order.subtotal || 0).toLocaleString('id-ID');

      // Calculate pending verified orders for this merchant to support notification stacking/grouping
      const merchantOrders = foodDb.getOrders().filter(
        o => o.merchantId === order.merchantId && o.status === OrderStatus.PAYMENT_VERIFIED
      );
      const pendingCount = Math.max(1, merchantOrders.length);

      let title = `🔔 Pesanan Baru Masuk! #${orderNum}`;
      let body = `${itemCount} item siap dimasak (${subtotalFormatted}) dari ${order.customerName}. Buka dapur TumpangGo sekarang!`;

      if (pendingCount > 1) {
        title = `🔔 ${pendingCount} Pesanan Baru Menunggu! (#${orderNum})`;
        body = `Ada ${pendingCount} pesanan menunggu konfirmasi. Terbaru: #${orderNum} (${itemCount} item, ${subtotalFormatted}) dari ${order.customerName}.`;
      }

      const result = await this.sendToMerchant(order.merchantId, {
        title,
        body,
        url: `/merchant?id=${encodeURIComponent(order.merchantId)}&orderId=${encodeURIComponent(order.id)}`,
        tag: `order-${order.id}`,
        channelId: 'tumpanggo_merchant_orders',
        sound: 'order_ringtone',
        pendingCount,
        data: {
          orderId: order.id,
          orderNumber: orderNum,
          merchantId: order.merchantId,
          customerName: order.customerName || 'Pelanggan',
          itemCount: String(itemCount),
          subtotal: String(order.subtotal || 0),
          pendingCount: String(pendingCount),
          role: 'MERCHANT',
          type: 'NEW_ORDER',
          click_action: 'OPEN_ORDER_DETAIL'
        }
      });

      console.log(`[PushService] Dispatched new verified order alert for ${orderId}: ${result.totalSent} sent, ${result.totalFailed} failed.`);
      return result;
    } catch (err) {
      console.warn('[PushService] Error dispatching verified order notification:', err);
      return {
        sentWebPush: 0,
        failedWebPush: 0,
        sentFCM: 0,
        failedFCM: 0,
        totalSent: 0,
        totalFailed: 0
      };
    }
  }

  /**
   * Dedicated notification trigger when a driver is assigned an order
   */
  public async notifyDriverAssignedOrder(driverId: string, order: Order): Promise<PushDispatchResult> {
    try {
      const orderNum = order.orderNumber || order.id;
      return await this.sendToDriver(driverId, {
        title: `🛵 Tugas Pengantaran Baru! #${orderNum}`,
        body: `Antar pesanan dari ${order.merchantName} ke ${order.deliveryAddress}. Buka aplikasi driver Anda.`,
        url: `/driver?id=${encodeURIComponent(driverId)}&orderId=${encodeURIComponent(order.id)}`,
        tag: `driver-order-${order.id}`,
        channelId: 'tumpanggo_driver_orders',
        sound: 'order_ringtone',
        data: {
          orderId: order.id,
          orderNumber: orderNum,
          driverId,
          role: 'DRIVER',
          type: 'DRIVER_ASSIGNMENT',
          click_action: 'OPEN_DRIVER_TASK'
        }
      });
    } catch (err) {
      console.warn('[PushService] Error dispatching driver assignment notification:', err);
      return {
        sentWebPush: 0,
        failedWebPush: 0,
        sentFCM: 0,
        failedFCM: 0,
        totalSent: 0,
        totalFailed: 0
      };
    }
  }

  /**
   * Dispatches notifications to both Web Push subscriptions and FCM tokens
   */
  private async dispatchUnified(
    subs: PushSubscriptionRecord[],
    payload: UnifiedPushPayload
  ): Promise<PushDispatchResult> {
    const webPushSubs: PushSubscriptionRecord[] = [];
    const fcmTokens: { token: string; recordId: string }[] = [];

    for (const sub of subs) {
      if (sub.fcmToken) {
        fcmTokens.push({ token: sub.fcmToken, recordId: sub.id });
      } else if (sub.subscription && sub.subscription.endpoint && sub.subscription.keys) {
        webPushSubs.push(sub);
      }
    }

    const [webResult, fcmResult] = await Promise.all([
      this.dispatchWebPush(webPushSubs, payload),
      this.dispatchFCM(fcmTokens, payload)
    ]);

    return {
      sentWebPush: webResult.sent,
      failedWebPush: webResult.failed,
      sentFCM: fcmResult.sent,
      failedFCM: fcmResult.failed,
      totalSent: webResult.sent + fcmResult.sent,
      totalFailed: webResult.failed + fcmResult.failed
    };
  }

  /**
   * Dispatch to Web Push subscriptions (VAPID)
   */
  private async dispatchWebPush(
    subs: PushSubscriptionRecord[],
    payload: UnifiedPushPayload
  ): Promise<{ sent: number; failed: number }> {
    if (subs.length === 0) return { sent: 0, failed: 0 };

    this.ensureVapidConfigured();
    let sent = 0;
    let failed = 0;

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      data: payload.data
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            sub.subscription as any,
            notificationPayload,
            {
              TTL: 60 * 60, // 1 hour TTL
              urgency: 'high'
            }
          );
          sent++;
        } catch (err: any) {
          failed++;
          const statusCode = err?.statusCode;
          // Clean up expired or unregistered subscription endpoints
          if (statusCode === 404 || statusCode === 410) {
            console.log(`[PushService] Removing expired Web Push subscription: ${sub.subscription?.endpoint.slice(0, 40)}...`);
            if (sub.subscription?.endpoint) {
              foodDb.removePushSubscription(sub.subscription.endpoint);
            }
          } else {
            console.warn(`[PushService] Web Push delivery notice (${statusCode || err?.message}):`, err?.message);
          }
        }
      })
    );

    return { sent, failed };
  }

  /**
   * Dispatch to Android devices via Firebase Cloud Messaging (FCM)
   */
  private async dispatchFCM(
    targets: { token: string; recordId: string }[],
    payload: UnifiedPushPayload
  ): Promise<{ sent: number; failed: number }> {
    if (targets.length === 0) return { sent: 0, failed: 0 };

    const messaging = getAdminMessaging();
    if (!messaging) {
      console.warn('[PushService] Firebase Messaging is not initialized (missing Service Account or not configured). Skipping FCM dispatch.');
      return { sent: 0, failed: targets.length };
    }

    let sent = 0;
    let failed = 0;

    // Normalize data fields so all values are strings (required by FCM data payload)
    const stringifiedData: Record<string, string> = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringifiedData[k] = v !== undefined && v !== null ? String(v) : '';
      }
    }
    stringifiedData.title = payload.title;
    stringifiedData.body = payload.body;
    if (payload.url) stringifiedData.url = payload.url;
    if (payload.tag) stringifiedData.tag = payload.tag;
    if (payload.channelId) stringifiedData.channelId = payload.channelId;
    if (payload.sound) stringifiedData.sound = payload.sound;

    const channelId = payload.channelId || 'tumpanggo_merchant_orders';
    const soundName = payload.sound || 'order_ringtone';

    // Batch send using sendEach
    await Promise.all(
      targets.map(async ({ token, recordId }) => {
        try {
          const message: any = {
            token,
            notification: {
              title: payload.title,
              body: payload.body
            },
            data: stringifiedData,
            android: {
              priority: 'high',
              ttl: 3600 * 1000, // 1 hour in ms
              notification: {
                channelId,
                sound: soundName,
                priority: 'max',
                visibility: 'public',
                tag: payload.tag,
                defaultVibrateTimings: true,
                clickAction: stringifiedData.click_action || 'OPEN_ORDER_DETAIL'
              }
            }
          };

          await messaging.send(message);
          sent++;
        } catch (err: any) {
          failed++;
          const errCode = err?.code || err?.errorInfo?.code || '';
          console.warn(`[PushService] FCM send error for token ${token.slice(0, 15)}...:`, errCode || err?.message);

          // If token is invalid or uninstalled, remove from database
          if (
            errCode === 'messaging/registration-token-not-registered' ||
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/invalid-argument'
          ) {
            console.log(`[PushService] Removing invalid FCM token: ${token.slice(0, 20)}...`);
            foodDb.removePushSubscription(token);
          }
        }
      })
    );

    return { sent, failed };
  }
}

export const pushService = new PushNotificationService();
