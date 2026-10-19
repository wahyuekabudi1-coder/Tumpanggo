/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop - Database Schema & Validation Rules
 * Explicit schema definitions and data validation for Shop business entities.
 * Strictly decoupled from Food entities.
 */

import {
  ShopProduct, ShopCategory, ShopOrder, ShopConfig, ShopAuditLog,
  ShopPaymentStatus, ShopOrderStatus, ShopOrderItem,
  ShopShipment, ShopTrackingEvent, ShopShipmentStatus, ShopShipmentScope,
  ShopProductVariant
} from '../../../types/shop';

export interface ShopMigrationRecord {
  id: string;
  version: number;
  name: string;
  appliedAt: string;
  source: string;
  notes?: string;
}

export interface ShopDatabaseSchema {
  config: ShopConfig;
  categories: ShopCategory[];
  products: ShopProduct[];
  orders: ShopOrder[];
  shipments: ShopShipment[];
  auditLogs: ShopAuditLog[];
  migrations?: ShopMigrationRecord[];
}

export class ShopSchemaValidator {
  /**
   * Validate Category Creation/Update
   */
  static validateCategory(data: Partial<ShopCategory>): { isValid: boolean; error?: string } {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return { isValid: false, error: 'Nama kategori wajib diisi.' };
    }
    if (data.name.trim().length > 100) {
      return { isValid: false, error: 'Nama kategori maksimal 100 karakter.' };
    }
    return { isValid: true };
  }

  /**
   * Validate Product Creation/Update
   */
  static validateProduct(data: Partial<ShopProduct> & { basePrice?: number }): { isValid: boolean; error?: string } {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return { isValid: false, error: 'Nama produk belanja wajib diisi.' };
    }
    const effectivePrice = typeof data.price === 'number' ? data.price : typeof data.basePrice === 'number' ? data.basePrice : undefined;
    if (typeof effectivePrice !== 'number' || isNaN(effectivePrice) || effectivePrice < 0) {
      return { isValid: false, error: 'Harga produk harus berupa angka valid non-negatif.' };
    }
    if (typeof data.stock !== 'number' || isNaN(data.stock) || data.stock < 0) {
      return { isValid: false, error: 'Stok produk harus berupa angka non-negatif.' };
    }
    if (!data.categoryId || typeof data.categoryId !== 'string') {
      return { isValid: false, error: 'Kategori produk belanja wajib dipilih.' };
    }
    return { isValid: true };
  }

  /**
   * Validate Order Creation Payload
   */
  static validateOrderPayload(data: any): { isValid: boolean; error?: string } {
    if (!data) return { isValid: false, error: 'Payload pesanan belanja tidak boleh kosong.' };
    if (!data.customerName || typeof data.customerName !== 'string' || data.customerName.trim().length === 0) {
      return { isValid: false, error: 'Nama pemesan wajib diisi.' };
    }
    if (!data.customerPhone || typeof data.customerPhone !== 'string' || data.customerPhone.trim().length < 8) {
      return { isValid: false, error: 'Nomor WhatsApp pemesan harus sah minimal 8 digit.' };
    }
    const address = data.deliveryAddress || data.customerAddress;
    if (!address || typeof address !== 'string' || address.trim().length < 3) {
      return { isValid: false, error: 'Alamat pengantaran belanja wajib diisi.' };
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return { isValid: false, error: 'Keranjang belanja tidak boleh kosong.' };
    }
    for (const item of data.items) {
      if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
        return { isValid: false, error: 'Setiap item belanja harus memiliki produk dan jumlah yang sah.' };
      }
    }
    return { isValid: true };
  }

  /**
   * Validate Shipment Status Update
   */
  static validateShipmentStatus(status: any): { isValid: boolean; error?: string } {
    const validStatuses = Object.values(ShopShipmentStatus) as string[];
    if (!status || !validStatuses.includes(String(status))) {
      return { isValid: false, error: `Status pengiriman '${status}' tidak dikenali.` };
    }
    return { isValid: true };
  }
}
