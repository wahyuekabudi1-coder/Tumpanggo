/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop - Explicit Inter-Service Client
 * Enables other services (e.g., Tumpang Food, Main Gateway, Payment Webhooks)
 * to communicate with Tumpang Shop via explicit API calls, without direct database access.
 */

import { shopDb } from '../database/shopDatabase';
import { shopEnv } from '../config/shopEnv';
import { ShopOrder } from '../../../types/shop';

export class ShopApiClient {
  private serviceUrl: string;

  constructor(serviceUrl?: string) {
    this.serviceUrl = serviceUrl || process.env.SHOP_SERVICE_URL || '';
  }

  /**
   * Safe Inter-service Health Check
   */
  public async getHealth(): Promise<any> {
    if (this.serviceUrl) {
      const res = await fetch(`${this.serviceUrl}/health`);
      return res.json();
    }
    return shopDb.getStorageStatus();
  }

  /**
   * Safe Inter-service Order Lookup
   */
  public async findOrder(orderId: string, phone?: string): Promise<ShopOrder | undefined> {
    if (phone) {
      return shopDb.findOrderByNumberAndPhone(orderId, phone);
    }
    return shopDb.findOrderById(orderId);
  }

  /**
   * Safe Inter-service Payment Intent Processing
   */
  public async createArtopayPaymentIntent(payload: {
    orderId: string;
    customerPhone?: string;
    clientAmount?: number;
    origin?: string;
  }): Promise<any> {
    if (this.serviceUrl) {
      const res = await fetch(`${this.serviceUrl}/payments/artopay/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error dari Shop Service' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    }

    // Direct in-process adapter using Shop's isolated database
    let order = await shopDb.findOrderById(payload.orderId);
    if (!order && payload.customerPhone) {
      order = await shopDb.findOrderByNumberAndPhone(payload.orderId, String(payload.customerPhone).trim());
    }

    if (!order) {
      throw new Error(`Pesanan Tumpang Shop dengan ID "${payload.orderId}" tidak ditemukan.`);
    }

    return { order, verifiedOrderId: order.orderNumber || order.id };
  }

  /**
   * Safe Inter-service Payment Sync (e.g. Webhook processing)
   */
  public async syncPaymentStatus(payload: {
    orderId: string;
    paymentIntentId: string;
    amountPaid: number;
  }): Promise<{ success: boolean; orderId: string }> {
    if (this.serviceUrl) {
      const res = await fetch(`${this.serviceUrl}/payments/artopay/webhook-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.json();
    }

    let order = await shopDb.findOrderById(payload.orderId) || 
      shopDb.getOrders().find(o => o.orderNumber === payload.orderId || o.artopayPaymentId === payload.paymentIntentId);

    if (!order) {
      throw new Error(`Pesanan Shop ${payload.orderId} tidak ditemukan.`);
    }

    await shopDb.verifyPayment('SYSTEM_INTERSERVICE_SYNC', order.id, true);
    await shopDb.attachArtopayPayment(order.id, {
      artopayStatus: 'SUCCESS',
      artopayPaidAt: new Date().toISOString()
    });

    return { success: true, orderId: order.id };
  }

  /**
   * Safe Inter-service Update of ArtoPay details
   */
  public async attachPaymentDetails(orderId: string, details: Partial<ShopOrder>): Promise<ShopOrder> {
    return shopDb.attachArtopayPayment(orderId, details);
  }
}

export const shopApiClient = new ShopApiClient();
