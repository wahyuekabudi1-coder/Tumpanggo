/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Web Push Notification Service for TumpangGo
 * Sends push notifications to Merchant & Driver devices when new orders arrive
 * or when orders are assigned/updated, even when the browser dashboard is closed.
 */

import webpush from 'web-push';
import { vapidConfig } from '../config';
import { foodDb, PushSubscriptionRecord } from '../db';
import { Order } from '../../types';

class PushNotificationService {
  private initialized = false;

  private ensureVapidConfigured() {
    if (this.initialized) return;

    if (vapidConfig.isConfigured) {
      try {
        webpush.setVapidDetails(
          vapidConfig.subject,
          vapidConfig.publicKey,
          vapidConfig.privateKey
        );
        this.initialized = true;
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
   * Send push notification to all devices registered for a specific Merchant
   */
  public async sendToMerchant(merchantId: string, payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    data?: any;
  }): Promise<{ sent: number; failed: number }> {
    this.ensureVapidConfigured();
    const subs = foodDb.getPushSubscriptionsForEntity('MERCHANT', merchantId);
    if (!subs || subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    return this.dispatchToSubscriptions(subs, payload);
  }

  /**
   * Send push notification to all devices registered for a specific Driver
   */
  public async sendToDriver(driverId: string, payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    data?: any;
  }): Promise<{ sent: number; failed: number }> {
    this.ensureVapidConfigured();
    const subs = foodDb.getPushSubscriptionsForEntity('DRIVER', driverId);
    if (!subs || subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    return this.dispatchToSubscriptions(subs, payload);
  }

  /**
   * Dedicated notification trigger when an order status reaches PAYMENT_VERIFIED
   */
  public async notifyNewVerifiedOrder(order: Order): Promise<void> {
    try {
      const orderNum = order.orderNumber || order.id;
      const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);
      const subtotalFormatted = 'Rp ' + (order.subtotal || 0).toLocaleString('id-ID');

      await this.sendToMerchant(order.merchantId, {
        title: `🔔 Pesanan Baru Masuk! #${orderNum}`,
        body: `${itemCount} item siap dimasak (${subtotalFormatted}) dari ${order.customerName}. Buka dapur TumpangGo sekarang!`,
        url: `/?role=MERCHANT&id=${encodeURIComponent(order.merchantId)}`,
        tag: `order-${order.id}`,
        data: {
          orderId: order.id,
          orderNumber: orderNum,
          role: 'MERCHANT'
        }
      });
    } catch (err) {
      console.warn('[PushService] Error dispatching verified order notification:', err);
    }
  }

  /**
   * Dedicated notification trigger when a driver is assigned an order
   */
  public async notifyDriverAssignedOrder(driverId: string, order: Order): Promise<void> {
    try {
      const orderNum = order.orderNumber || order.id;
      await this.sendToDriver(driverId, {
        title: `🛵 Tugas Pengantaran Baru! #${orderNum}`,
        body: `Antar pesanan dari ${order.merchantName} ke ${order.deliveryAddress}. Buka aplikasi driver Anda.`,
        url: `/?role=DRIVER&id=${encodeURIComponent(driverId)}`,
        tag: `driver-order-${order.id}`,
        data: {
          orderId: order.id,
          orderNumber: orderNum,
          role: 'DRIVER'
        }
      });
    } catch (err) {
      console.warn('[PushService] Error dispatching driver assignment notification:', err);
    }
  }

  private async dispatchToSubscriptions(
    subs: PushSubscriptionRecord[],
    payload: { title: string; body: string; url?: string; tag?: string; data?: any }
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    const notificationPayload = JSON.stringify(payload);

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
          // If the subscription has expired or is unsubscribed (404 or 410 Gone), automatically clean it up
          if (statusCode === 404 || statusCode === 410) {
            console.log(`[PushService] Removing expired push subscription: ${sub.subscription.endpoint.slice(0, 40)}...`);
            foodDb.removePushSubscription(sub.subscription.endpoint);
          } else {
            console.warn(`[PushService] Push delivery warning (${statusCode || err?.message}):`, err?.message);
          }
        }
      })
    );

    return { sent, failed };
  }
}

export const pushService = new PushNotificationService();
