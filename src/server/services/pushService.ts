/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified Production Push Notification Service for TumpangGo
 * Dispatches notifications across:
 * 1. Native Android Firebase Cloud Messaging (FCM) — High-priority DATA-ONLY messages
 *    so TumpangFirebaseMessagingService.onMessageReceived() always runs in foreground,
 *    background, locked screen, swipe-closed, and OS process-killed states to render
 *    grouped notifications ("1 Pesanan Baru" / "3 Pesanan Baru"), custom sound
 *    ('order_ringtone'), store-ownership verification, and deep-link PendingIntents.
 * 2. Web Push (VAPID) — Browser / PWA service worker push notifications.
 *
 * Includes serverless-safe outbox persistence (push_notification_events) for deduplication
 * and safe retry on transient network/FCM failures without duplicating orders.
 */

import webpush from 'web-push';
import { vapidConfig } from '../config';
import { foodDb, PushNotificationEventRecord, PushSubscriptionRecord } from '../db';
import { getAdminMessaging, isFirestoreAdminConfigured } from '../firebaseAdmin';
import { Order, OrderStatus } from '../../types';

export const MERCHANT_ORDER_CHANNEL_ID = 'tumpanggo_merchant_orders';
export const MERCHANT_ORDER_CHANNEL_NAME = 'Pesanan Baru TumpangGo Merchant';
export const MERCHANT_ORDER_SOUND_NAME = 'order_ringtone';

export interface UnifiedPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  sound?: string;
  channelId?: string;
  pendingCount?: number;
  eventId?: string;
  data?: Record<string, string>;
}

export interface PushDispatchResult {
  sentWebPush: number;
  failedWebPush: number;
  sentFCM: number;
  failedFCM: number;
  totalSent: number;
  totalFailed: number;
  transientFailures?: number;
  deduplicated?: boolean;
  subscriberCount?: number;
  eventId?: string;
  lastError?: string;
}

const PERMANENT_INVALID_FCM_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

const TRANSIENT_FCM_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'messaging/quota-exceeded'
]);

function maskToken(tokenOrEndpoint: string): string {
  if (!tokenOrEndpoint) return '<empty>';
  if (tokenOrEndpoint.length <= 16) return `${tokenOrEndpoint.slice(0, 4)}...`;
  return `${tokenOrEndpoint.slice(0, 10)}...${tokenOrEndpoint.slice(-4)}`;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class PushNotificationService {
  private vapidInitialized = false;
  private inFlightEvents = new Set<string>();

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
      } catch (err: any) {
        console.warn('[PushService] Failed to initialize VAPID details:', err?.message || err);
      }
    }
  }

  public getVapidPublicKey(): string {
    return vapidConfig.publicKey;
  }

  public isFcmServerConfigured(): boolean {
    return Boolean(getAdminMessaging()) || isFirestoreAdminConfigured();
  }

  private emptyResult(extra?: Partial<PushDispatchResult>): PushDispatchResult {
    return {
      sentWebPush: 0,
      failedWebPush: 0,
      sentFCM: 0,
      failedFCM: 0,
      totalSent: 0,
      totalFailed: 0,
      transientFailures: 0,
      ...extra
    };
  }

  /**
   * Send push notification to all devices (Native Android FCM + Web Push) registered for a specific Merchant.
   * Uses stateless cloud lookup so cold-started Vercel serverless functions always find registered tokens.
   */
  public async sendToMerchant(
    merchantId: string,
    payload: UnifiedPushPayload
  ): Promise<PushDispatchResult> {
    const cleanMerchantId = String(merchantId || '').trim();
    if (!cleanMerchantId) {
      return this.emptyResult({ subscriberCount: 0 });
    }

    const subs = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', cleanMerchantId);
    if (!subs || subs.length === 0) {
      return this.emptyResult({ subscriberCount: 0, eventId: payload.eventId });
    }

    return this.dispatchUnified(subs, {
      ...payload,
      channelId: payload.channelId || MERCHANT_ORDER_CHANNEL_ID,
      sound: payload.sound || MERCHANT_ORDER_SOUND_NAME
    });
  }

  /**
   * Send push notification to all devices registered for a specific Driver.
   */
  public async sendToDriver(
    driverId: string,
    payload: UnifiedPushPayload
  ): Promise<PushDispatchResult> {
    const cleanDriverId = String(driverId || '').trim();
    if (!cleanDriverId) {
      return this.emptyResult({ subscriberCount: 0 });
    }

    const subs = await foodDb.getPushSubscriptionsForEntityAsync('DRIVER', cleanDriverId);
    if (!subs || subs.length === 0) {
      return this.emptyResult({ subscriberCount: 0, eventId: payload.eventId });
    }

    return this.dispatchUnified(subs, {
      ...payload,
      channelId: payload.channelId || 'tumpanggo_driver_orders',
      sound: payload.sound || MERCHANT_ORDER_SOUND_NAME
    });
  }

  /**
   * Authoritative New Order Push Trigger.
   * Invoked strictly AFTER a new order has been persisted to the database in `foodDb.createOrder()`.
   * Never invoked on mere status transitions (`updateOrder`), and never rolls back saved orders on push failure.
   */
  public async notifyNewOrder(
    order: Order,
    options?: { allowRetryOfExistingEvent?: boolean }
  ): Promise<PushDispatchResult> {
    if (!order || !order.id || !order.merchantId) {
      return this.emptyResult();
    }

    const eventId = `new_order:${order.id}`;

    // Prevent concurrent duplicate dispatches in the same runtime
    if (this.inFlightEvents.has(eventId)) {
      return this.emptyResult({ deduplicated: true, eventId });
    }
    this.inFlightEvents.add(eventId);

    try {
      const existingEvent = await foodDb.getPushEventByIdAsync(eventId);
      if (existingEvent && existingEvent.status === 'SENT' && !options?.allowRetryOfExistingEvent) {
        console.log(`[PushService] Deduplicating already-sent order push event ${eventId}.`);
        return this.emptyResult({ deduplicated: true, eventId });
      }

      const nowIso = new Date().toISOString();
      const orderNum = order.orderNumber || order.id;
      const itemCount = (order.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
      const displayAmount = Number(order.total || order.subtotal || 0);
      const amountFormatted = 'Rp ' + displayAmount.toLocaleString('id-ID');
      const customerName = order.customerName || 'Pelanggan';

      // Calculate authoritative unhandled orders for THIS merchant store from DB
      const unhandledOrders = await foodDb.getUnhandledMerchantOrdersAsync(order.merchantId);
      const unhandledIdSet = new Set<string>(unhandledOrders.map(o => o.id));
      // Ensure this newly saved order is included if still in an unhandled state
      if (
        order.status === OrderStatus.WAITING_PAYMENT ||
        order.status === OrderStatus.WAITING_PAYMENT_VERIFICATION ||
        order.status === OrderStatus.PAYMENT_VERIFIED
      ) {
        unhandledIdSet.add(order.id);
      }

      const unhandledOrderIds = Array.from(unhandledIdSet);
      const pendingCount = Math.max(1, unhandledOrderIds.length);

      const title = pendingCount === 1
        ? '1 Pesanan Baru'
        : `${pendingCount} Pesanan Baru`;

      const body = pendingCount === 1
        ? `Ada 1 pesanan baru (#${orderNum} • ${itemCount} menu • ${amountFormatted}) dari ${customerName} yang perlu diperiksa.`
        : `Ada ${pendingCount} pesanan baru yang perlu diperiksa untuk toko Anda. Terbaru: #${orderNum} dari ${customerName} (${amountFormatted}).`;

      const targetUrl = `/merchant?id=${encodeURIComponent(order.merchantId)}&orderId=${encodeURIComponent(order.id)}`;

      const pushPayload: UnifiedPushPayload = {
        title,
        body,
        url: targetUrl,
        tag: `order-${order.id}`,
        channelId: MERCHANT_ORDER_CHANNEL_ID,
        sound: MERCHANT_ORDER_SOUND_NAME,
        pendingCount,
        eventId,
        data: {
          eventId,
          orderId: order.id,
          orderNumber: orderNum,
          merchantId: order.merchantId,
          merchantName: order.merchantName || '',
          customerName,
          itemCount: String(itemCount),
          subtotal: String(order.subtotal || 0),
          total: String(displayAmount),
          orderStatus: String(order.status),
          pendingCount: String(pendingCount),
          unhandledOrderIds: JSON.stringify(unhandledOrderIds),
          role: 'MERCHANT',
          type: 'NEW_ORDER',
          click_action: 'OPEN_ORDER_DETAIL',
          createdAt: order.createdAt || nowIso
        }
      };

      const attemptNumber = (existingEvent?.attempts || 0) + 1;
      const pendingRecord: PushNotificationEventRecord = {
        id: eventId,
        eventType: 'NEW_ORDER',
        orderId: order.id,
        merchantId: order.merchantId,
        status: 'PENDING',
        attempts: attemptNumber,
        sentCount: existingEvent?.sentCount || 0,
        failedCount: existingEvent?.failedCount || 0,
        payload: {
          orderNumber: orderNum,
          pendingCount,
          unhandledOrderIds
        },
        createdAt: existingEvent?.createdAt || nowIso,
        updatedAt: nowIso
      };
      await foodDb.savePushEventAsync(pendingRecord);

      const result = await this.sendToMerchant(order.merchantId, pushPayload);

      let finalStatus: PushNotificationEventRecord['status'] = 'SENT';
      if (result.totalSent > 0) {
        finalStatus = 'SENT';
      } else if ((result.subscriberCount || 0) === 0) {
        finalStatus = 'FAILED_NO_SUBSCRIBERS';
      } else if ((result.transientFailures || 0) > 0 && attemptNumber < 5) {
        finalStatus = 'RETRYING';
      } else {
        finalStatus = attemptNumber < 5 ? 'RETRYING' : 'FAILED_PERMANENT';
      }

      await foodDb.savePushEventAsync({
        ...pendingRecord,
        status: finalStatus,
        sentCount: (existingEvent?.sentCount || 0) + result.totalSent,
        failedCount: (existingEvent?.failedCount || 0) + result.totalFailed,
        lastError: result.lastError,
        updatedAt: new Date().toISOString(),
        sentAt: result.totalSent > 0 ? new Date().toISOString() : existingEvent?.sentAt
      });

      console.log(
        `[PushService] Event ${eventId} (merchant=${order.merchantId}, pending=${pendingCount}) -> status=${finalStatus}, sentFCM=${result.sentFCM}, sentWeb=${result.sentWebPush}, failed=${result.totalFailed}`
      );

      return {
        ...result,
        eventId
      };
    } catch (err: any) {
      console.warn('[PushService] Non-fatal error in notifyNewOrder:', err?.message || err);
      return this.emptyResult({ eventId, lastError: err?.message || 'Unknown push error' });
    } finally {
      this.inFlightEvents.delete(eventId);
    }
  }

  /**
   * Backwards-compatible alias delegating to `notifyNewOrder`.
   */
  public async notifyNewVerifiedOrder(order: Order): Promise<PushDispatchResult> {
    return this.notifyNewOrder(order);
  }

  /**
   * Serverless-safe outbox retry for transient push failures or devices coming back online.
   * Re-checks authoritative order state in DB so handled/cancelled orders are never notified late.
   */
  public async retryPendingEventsForMerchant(merchantId: string): Promise<{
    inspected: number;
    retried: number;
    delivered: number;
  }> {
    const cleanMerchantId = String(merchantId || '').trim();
    if (!cleanMerchantId) return { inspected: 0, retried: 0, delivered: 0 };

    const candidates = await foodDb.getRetryablePushEventsAsync(cleanMerchantId, 10);
    if (candidates.length === 0) {
      return { inspected: 0, retried: 0, delivered: 0 };
    }

    const unhandledOrders = await foodDb.getUnhandledMerchantOrdersAsync(cleanMerchantId);
    const unhandledMap = new Map<string, Order>(unhandledOrders.map(o => [o.id, o]));

    let retried = 0;
    let delivered = 0;

    for (const ev of candidates) {
      if (!ev.orderId) continue;
      const liveOrder = unhandledMap.get(ev.orderId);
      if (!liveOrder) {
        // Order was already handled, cooked, or cancelled -> mark permanent skip without sending push
        await foodDb.savePushEventAsync({
          ...ev,
          status: 'SENT',
          lastError: 'Skipped retry: order already handled or no longer pending',
          updatedAt: new Date().toISOString()
        });
        continue;
      }

      retried++;
      const res = await this.notifyNewOrder(liveOrder, { allowRetryOfExistingEvent: true });
      if (res.totalSent > 0) {
        delivered++;
      }
    }

    return {
      inspected: candidates.length,
      retried,
      delivered
    };
  }

  /**
   * Dedicated notification trigger when a driver is assigned an order.
   */
  public async notifyDriverAssignedOrder(driverId: string, order: Order): Promise<PushDispatchResult> {
    try {
      const orderNum = order.orderNumber || order.id;
      const eventId = `driver_assign:${order.id}:${driverId}`;
      return await this.sendToDriver(driverId, {
        title: `Tugas Pengantaran Baru #${orderNum}`,
        body: `Antar pesanan dari ${order.merchantName} ke ${order.deliveryAddress}. Buka aplikasi driver Anda.`,
        url: `/driver?id=${encodeURIComponent(driverId)}&orderId=${encodeURIComponent(order.id)}`,
        tag: `driver-order-${order.id}`,
        channelId: 'tumpanggo_driver_orders',
        sound: MERCHANT_ORDER_SOUND_NAME,
        eventId,
        data: {
          eventId,
          orderId: order.id,
          orderNumber: orderNum,
          driverId,
          role: 'DRIVER',
          type: 'DRIVER_ASSIGNMENT',
          click_action: 'OPEN_DRIVER_TASK'
        }
      });
    } catch (err: any) {
      console.warn('[PushService] Error dispatching driver assignment notification:', err?.message || err);
      return this.emptyResult({ lastError: err?.message });
    }
  }

  /**
   * Dispatches notifications across both Web Push subscriptions and Native Android FCM tokens.
   */
  private async dispatchUnified(
    subs: PushSubscriptionRecord[],
    payload: UnifiedPushPayload
  ): Promise<PushDispatchResult> {
    const webPushSubs: PushSubscriptionRecord[] = [];
    const fcmTargets: { token: string; recordId: string; entityId: string }[] = [];
    const seenTokens = new Set<string>();
    const seenEndpoints = new Set<string>();

    for (const sub of subs) {
      if (sub.fcmToken && sub.fcmToken.trim().length > 10) {
        const cleanToken = sub.fcmToken.trim();
        if (!seenTokens.has(cleanToken)) {
          seenTokens.add(cleanToken);
          fcmTargets.push({ token: cleanToken, recordId: sub.id, entityId: sub.entityId });
        }
      } else if (sub.subscription?.endpoint && sub.subscription?.keys) {
        const cleanEndpoint = sub.subscription.endpoint.trim();
        if (!seenEndpoints.has(cleanEndpoint)) {
          seenEndpoints.add(cleanEndpoint);
          webPushSubs.push(sub);
        }
      }
    }

    const [webResult, fcmResult] = await Promise.all([
      this.dispatchWebPush(webPushSubs, payload),
      this.dispatchFCM(fcmTargets, payload)
    ]);

    return {
      sentWebPush: webResult.sent,
      failedWebPush: webResult.failed,
      sentFCM: fcmResult.sent,
      failedFCM: fcmResult.failed,
      totalSent: webResult.sent + fcmResult.sent,
      totalFailed: webResult.failed + fcmResult.failed,
      transientFailures: webResult.transientFailures + fcmResult.transientFailures,
      subscriberCount: fcmTargets.length + webPushSubs.length,
      eventId: payload.eventId,
      lastError: fcmResult.lastError || webResult.lastError
    };
  }

  /**
   * Dispatch to Browser / PWA Web Push subscriptions (VAPID).
   */
  private async dispatchWebPush(
    subs: PushSubscriptionRecord[],
    payload: UnifiedPushPayload
  ): Promise<{ sent: number; failed: number; transientFailures: number; lastError?: string }> {
    if (subs.length === 0) return { sent: 0, failed: 0, transientFailures: 0 };

    this.ensureVapidConfigured();
    if (!vapidConfig.isConfigured) {
      return {
        sent: 0,
        failed: subs.length,
        transientFailures: 0,
        lastError: 'VAPID keys not configured on server'
      };
    }

    let sent = 0;
    let failed = 0;
    let transientFailures = 0;
    let lastError: string | undefined;

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      pendingCount: payload.pendingCount,
      eventId: payload.eventId,
      data: payload.data
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            sub.subscription as any,
            notificationPayload,
            {
              TTL: 60 * 60,
              urgency: 'high'
            }
          );
          sent++;
        } catch (err: any) {
          failed++;
          const statusCode = Number(err?.statusCode || 0);
          lastError = `WebPush(${statusCode || 'ERR'}): ${err?.message || 'delivery failed'}`;

          if (statusCode === 404 || statusCode === 410) {
            console.log(`[PushService] Pruning expired Web Push endpoint ${maskToken(sub.subscription?.endpoint || '')}`);
            if (sub.subscription?.endpoint) {
              await foodDb.removePushSubscription(sub.subscription.endpoint, sub.entityId).catch(() => {});
            }
          } else if (statusCode >= 500 || statusCode === 429 || statusCode === 0) {
            transientFailures++;
            console.warn(`[PushService] Transient Web Push failure for ${maskToken(sub.subscription?.endpoint || '')}: ${lastError}`);
          } else {
            console.warn(`[PushService] Web Push error (${statusCode}): ${err?.message}`);
          }
        }
      })
    );

    return { sent, failed, transientFailures, lastError };
  }

  /**
   * Dispatch to Native Android APK devices via Firebase Cloud Messaging (FCM).
   *
   * CRITICAL ARCHITECTURAL REQUIREMENT:
   * Uses HIGH-PRIORITY DATA-ONLY FCM messages (NO top-level `notification` object).
   * If `notification` were included, Android's Google Play Services would intercept background
   * messages and post flat OS notifications without invoking `TumpangFirebaseMessagingService`,
   * breaking multi-order grouping ("3 Pesanan Baru"), custom channel sound control,
   * store-account ownership verification, and deep-link PendingIntent extras.
   */
  private async dispatchFCM(
    targets: { token: string; recordId: string; entityId: string }[],
    payload: UnifiedPushPayload
  ): Promise<{ sent: number; failed: number; transientFailures: number; lastError?: string }> {
    if (targets.length === 0) return { sent: 0, failed: 0, transientFailures: 0 };

    const messaging = getAdminMessaging();
    if (!messaging) {
      const msg = 'Firebase Admin Messaging is not initialized (missing FIREBASE_SERVICE_ACCOUNT_KEY).';
      console.warn(`[PushService] ${msg}`);
      return {
        sent: 0,
        failed: targets.length,
        transientFailures: targets.length,
        lastError: msg
      };
    }

    let sent = 0;
    let failed = 0;
    let transientFailures = 0;
    let lastError: string | undefined;

    // FCM `data` map requires every key and value to be a string
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
    if (payload.eventId) stringifiedData.eventId = payload.eventId;
    if (payload.pendingCount !== undefined) stringifiedData.pendingCount = String(payload.pendingCount);
    stringifiedData.channelId = payload.channelId || MERCHANT_ORDER_CHANNEL_ID;
    stringifiedData.channelName = MERCHANT_ORDER_CHANNEL_NAME;
    stringifiedData.sound = payload.sound || MERCHANT_ORDER_SOUND_NAME;

    await Promise.all(
      targets.map(async ({ token, entityId }) => {
        const message: any = {
          token,
          data: stringifiedData,
          android: {
            priority: 'high',
            ttl: 3600 * 1000 // 1 hour TTL in ms
          }
        };

        const sendOnce = async () => {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error('FCM request timeout (8s)'), { code: 'messaging/timeout' })), 8000)
          );
          return Promise.race([messaging.send(message), timeoutPromise]);
        };

        try {
          await sendOnce();
          sent++;
        } catch (firstErr: any) {
          const errCode = String(firstErr?.code || firstErr?.errorInfo?.code || '');
          const isTransient =
            TRANSIENT_FCM_CODES.has(errCode) ||
            errCode === 'messaging/timeout' ||
            /timeout|network|ECONNRESET|ETIMEDOUT|503|502|500/i.test(String(firstErr?.message || ''));

          // Perform 1 fast retry within serverless execution window for transient errors
          if (isTransient) {
            try {
              await sleepMs(350);
              await sendOnce();
              sent++;
              return;
            } catch (retryErr: any) {
              failed++;
              transientFailures++;
              const retryCode = String(retryErr?.code || retryErr?.errorInfo?.code || errCode || 'TRANSIENT_ERR');
              lastError = `FCM(${retryCode}): ${retryErr?.message || 'transient failure'}`;
              console.warn(`[PushService] Transient FCM failure after retry for token ${maskToken(token)}:`, retryCode);
              return;
            }
          }

          failed++;
          lastError = `FCM(${errCode || 'ERR'}): ${firstErr?.message || 'send error'}`;
          console.warn(`[PushService] FCM delivery failed for token ${maskToken(token)}:`, errCode || firstErr?.message);

          // Prune strictly invalid / unregistered device tokens
          if (PERMANENT_INVALID_FCM_CODES.has(errCode)) {
            console.log(`[PushService] Pruning unregistered/invalid FCM token ${maskToken(token)}`);
            await foodDb.removePushSubscription(token, entityId).catch(() => {});
          }
        }
      })
    );

    return { sent, failed, transientFailures, lastError };
  }
}

export const pushService = new PushNotificationService();
