/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Validation & Transaction Service
 * Enforces price recalculations, menu availability checks, and order state machine rules.
 */

import { Order, OrderItem, OrderStatus, PaymentStatus, MenuItem, Merchant, SystemConfig, calculateTieredServiceFee, AssignmentMode } from '../../types';
import { calculateDeliveryFee, FLAT_TUMPANG_DELIVERY_FEE, normalizeOrderDeliveryFee } from '../../utils/deliveryFee';

// NOTE: preOrderDate is strictly excluded from CreateOrderInput contract.
// New orders are instant on-demand orders. Any client attempting to send preOrderDate
// will have that field completely ignored, and it will never be copied to the new Order record.
export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDetails?: string;
  landmark?: string;
  destinationDistrict?: string;
  district?: string;
  latitude: number;
  longitude: number;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string;
  }>;
  merchantId: string;
}

export class OrderService {
  /**
   * Validates and recalculates an incoming order against official database records.
   * Prevents customer-side price tampering.
   * Guarantees that preOrderDate is never copied from input to the resulting order.
   */
  public static validateAndBuildOrder(
    input: CreateOrderInput,
    merchant: Merchant,
    menuItems: MenuItem[],
    systemConfig: SystemConfig,
    activeUniqueCodes: number[]
  ): Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'preOrderDate'> {
    if (!merchant) {
      throw new Error('Merchant tidak ditemukan.');
    }

    if (!merchant.active) {
      throw new Error(`Toko "${merchant.name}" saat ini sedang tutup dan tidak menerima pesanan.`);
    }

    if (!merchant.latitude || !merchant.longitude || Number(merchant.latitude) === 0 || Number(merchant.longitude) === 0) {
      throw new Error(`Data koordinat toko "${merchant.name}" tidak lengkap atau tidak valid.`);
    }

    if (!input.items || input.items.length === 0) {
      throw new Error('Keranjang belanja kosong. Silakan pilih menu terlebih dahulu.');
    }

    if (!input.customerName || !input.customerPhone || !input.deliveryAddress) {
      throw new Error('Mohon lengkapi Nama Pemesan, Nomor WhatsApp, dan Alamat Pengiriman.');
    }

    // Validate each menu item against official catalog
    const validatedItems: OrderItem[] = [];
    let calculatedSubtotal = 0;

    for (const orderItemInput of input.items) {
      const quantity = Math.max(1, Math.floor(Number(orderItemInput.quantity) || 1));
      const menuItem = menuItems.find(m => m.id === orderItemInput.menuItemId && m.merchantId === merchant.id);

      if (!menuItem) {
        throw new Error(`Menu dengan ID "${orderItemInput.menuItemId}" tidak ditemukan pada toko ini.`);
      }

      if (!menuItem.available) {
        throw new Error(`Maaf, menu "${menuItem.name}" saat ini sedang habis.`);
      }

      const officialPrice = Number(menuItem.price) || 0;
      calculatedSubtotal += officialPrice * quantity;

      validatedItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: officialPrice,
        quantity: quantity
      });
    }

    // Recalculate tiered service fee based on verified subtotal
    const calculatedServiceFee = calculateTieredServiceFee(calculatedSubtotal);

    // Authoritatively calculate delivery fee via single source of truth.
    // Business rule: Kecamatan Tumpang = Rp 5.000, Kecamatan Pakis = Rp 7.500. Outside = Unsupported.
    const deliveryCalc = calculateDeliveryFee({
      address: input.deliveryAddress,
      details: input.deliveryDetails,
      landmark: input.landmark,
      district: input.district,
      destinationDistrict: input.destinationDistrict,
      latitude: input.latitude,
      longitude: input.longitude,
      merchantLatitude: merchant.latitude,
      merchantLongitude: merchant.longitude,
      systemConfig
    });

    if (deliveryCalc.isSupported === false) {
      throw new Error('Alamat pengantaran berada di luar wilayah jangkauan. Saat ini tumpangGo hanya melayani pengantaran di area Kecamatan Tumpang (Rp 5.000) dan Kecamatan Pakis (Rp 7.500).');
    }

    const calculatedDeliveryFee = deliveryCalc.deliveryFee;
    const finalDistrict = deliveryCalc.isInPakis ? 'Kecamatan Pakis' : 'Kecamatan Tumpang';

    // Generate unique code (01 - 99) not currently used by pending payment orders
    const uniqueCode = this.generateUniqueCode(activeUniqueCodes);

    // Final total calculation
    const total = calculatedSubtotal + calculatedDeliveryFee + calculatedServiceFee + uniqueCode;

    // Payment expiry window (10 minutes)
    const paymentExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    return normalizeOrderDeliveryFee({
      uniqueCode,
      total,
      status: OrderStatus.WAITING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'MERCHANT_QRIS',
      merchantId: merchant.id,
      merchantName: merchant.name,
      merchantQrisImage: merchant.qrisImage || '',
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      deliveryAddress: input.deliveryAddress.trim(),
      deliveryDetails: input.deliveryDetails ? input.deliveryDetails.trim() : '',
      landmark: input.landmark ? input.landmark.trim() : '',
      destinationDistrict: finalDistrict,
      latitude: input.latitude,
      longitude: input.longitude,
      items: validatedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: calculatedDeliveryFee,
      serviceFee: calculatedServiceFee,
      paymentExpiresAt
    });
  }

  /**
   * Generates a unique 2-digit verification code avoiding conflicts.
   */
  public static generateUniqueCode(activeCodes: number[]): number {
    for (let attempts = 0; attempts < 100; attempts++) {
      const code = Math.floor(Math.random() * 99) + 1;
      if (!activeCodes.includes(code)) {
        return code;
      }
    }
    return Math.floor(Math.random() * 99) + 1;
  }

  /**
   * Haversine formula to compute distance in km
   */
  public static calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Validates state machine status transition
   */
  public static isValidStatusTransition(
    currentStatus: OrderStatus,
    targetStatus: OrderStatus,
    role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER' | 'SYSTEM' | 'MASTER_ADMIN'
  ): { allowed: boolean; reason?: string } {
    // Admin & Master Admin have master override for legitimate administrative actions
    if (role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'SYSTEM') {
      return { allowed: true };
    }

    if (currentStatus === targetStatus) {
      return { allowed: true };
    }

    // Terminal states cannot be changed by non-admins
    if (
      currentStatus === OrderStatus.COMPLETED ||
      currentStatus === OrderStatus.CANCELLED ||
      currentStatus === OrderStatus.EXPIRED
    ) {
      return { allowed: false, reason: `Pesanan telah berada pada status final (${currentStatus}).` };
    }

    // Role-specific allowed transitions:
    switch (role) {
      case 'CUSTOMER':
        // Customer can only upload proof, re-upload after rejection, or cancel before payment verification
        if (
          (currentStatus === OrderStatus.WAITING_PAYMENT || currentStatus === OrderStatus.PAYMENT_REJECTED) &&
          (targetStatus === OrderStatus.WAITING_PAYMENT_VERIFICATION || targetStatus === OrderStatus.CANCELLED)
        ) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'Pelanggan hanya dapat mengunggah bukti pembayaran atau membatalkan pesanan baru/ditolak.' };

      case 'MERCHANT':
        // Merchant can accept verified payment order and begin cooking
        if (currentStatus === OrderStatus.PAYMENT_VERIFIED && targetStatus === OrderStatus.COOKING) {
          return { allowed: true };
        }
        // Merchant can mark ready for pickup
        if (currentStatus === OrderStatus.COOKING && targetStatus === OrderStatus.READY_FOR_PICKUP) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Merchant tidak diizinkan mengubah status dari ${currentStatus} ke ${targetStatus}.` };

      case 'DRIVER':
        // Driver can pick up ready order
        if (
          (currentStatus === OrderStatus.READY_FOR_PICKUP || currentStatus === OrderStatus.COOKING) &&
          targetStatus === OrderStatus.ORDER_PICKED_UP
        ) {
          return { allowed: true };
        }
        // Driver can mark delivered / completed
        if (
          currentStatus === OrderStatus.ORDER_PICKED_UP &&
          (targetStatus === OrderStatus.DELIVERED || targetStatus === OrderStatus.COMPLETED)
        ) {
          return { allowed: true };
        }
        if (
          currentStatus === OrderStatus.DELIVERED &&
          targetStatus === OrderStatus.COMPLETED
        ) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Driver tidak diizinkan mengubah status dari ${currentStatus} ke ${targetStatus}.` };

      default:
        return { allowed: false, reason: 'Peran tidak dikenali.' };
    }
  }
}
