/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Order Routes
 * Handles order placements, recalculations, driver assignments, and payment proofs.
 * Enforces payment expiration rules, terminal state guards, and RBAC order visibility.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import sharp from 'sharp';
import { foodDb } from '../db';
import { foodConfig } from '../config';
import { OrderStatus, PaymentStatus } from '../../types';
import { requireRole } from '../auth';

export const orderRouter = Router();

/**
 * Generates an HMAC-SHA256 order proof authorization token for verified customer access
 */
export function generateOrderProofToken(orderId: string): string {
  const secret = foodConfig.jwtSecret;
  if (!secret || secret.length < 32) {
    throw new Error('Gagal membuat token bukti pesanan: secret otentikasi belum dikonfigurasi dengan aman.');
  }
  return crypto.createHmac('sha256', secret).update(`proof:${orderId}`).digest('hex');
}

/**
 * Validates whether an order proof authorization token is authentic
 */
export function verifyOrderProofToken(orderId: string, token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (!foodConfig.jwtSecret || foodConfig.jwtSecret.length < 32) return false;
  try {
    const expected = generateOrderProofToken(orderId);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Order list - Protected by RBAC
orderRouter.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Autentikasi diperlukan untuk melihat daftar pesanan.' });
  }

  if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN') {
    foodDb.reloadFromDiskIfNeeded();
    return res.json(foodDb.getOrders());
  }

  if (user.role === 'MERCHANT') {
    const merchantId = user.entityId || user.userId;
    if (merchantId) {
      const orders = await foodDb.findOrdersByMerchant(merchantId);
      return res.json(orders);
    }
  }

  if (user.role === 'DRIVER') {
    const driverId = user.entityId || user.userId;
    if (driverId) {
      foodDb.reloadFromDiskIfNeeded();
      return res.json(foodDb.getOrdersByDriver(driverId));
    }
  }

  return res.status(403).json({ error: 'Akses ditolak.' });
});

// Dedicated E-Receipt endpoint - strictly accessible only after admin payment verification (PAID)
// Hardened with anti-enumeration security to protect customer privacy
orderRouter.get('/:id/receipt', async (req: Request, res: Response) => {
  try {
    const o = await foodDb.findOrder(req.params.id);
    if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    // Validate payment status: must be PAID or verified forward states
    const isPaid = o.paymentStatus === PaymentStatus.PAID || 
      [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP, OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(o.status);

    if (!isPaid) {
      return res.status(403).json({
        error: 'E-Receipt belum dapat diterbitkan. Pembayaran belum diverifikasi atau belum lunas.',
        code: 'PAYMENT_NOT_VERIFIED',
        orderId: o.id,
        paymentStatus: o.paymentStatus || 'PENDING',
        orderStatus: o.status
      });
    }

    // Ownership & Anti-Enumeration Security Guard:
    // Check if user is authenticated with privileged or owner role
    const user = req.user;
    const isPrivilegedUser = user && (
      user.role === 'ADMIN' ||
      user.role === 'MASTER_ADMIN' ||
      (user.role === 'MERCHANT' && user.entityId === o.merchantId) ||
      (user.role === 'DRIVER' && user.entityId === o.driverId) ||
      (user.role === 'CUSTOMER' && (user.userId === (o as any).customerId || (user.email && o.customerPhone && user.email === o.customerPhone)))
    );

    // If unauthenticated / public customer tracking, verify phone ownership
    if (!isPrivilegedUser) {
      const queryPhone = req.query.phone ? String(req.query.phone).trim() : '';
      const headerPhone = req.headers['x-customer-phone'] ? String(req.headers['x-customer-phone']).trim() : '';
      const providedPhone = queryPhone || headerPhone;

      const normOrderPhone = String(o.customerPhone || '').replace(/\D/g, '');
      const normProvidedPhone = providedPhone.replace(/\D/g, '');

      const phoneMatches = Boolean(
        normProvidedPhone.length >= 4 &&
        (normOrderPhone.endsWith(normProvidedPhone) || normProvidedPhone.endsWith(normOrderPhone))
      );

      if (!phoneMatches) {
        return res.status(403).json({
          error: 'Akses ditolak: Verifikasi nomor WhatsApp pemesan diperlukan untuk mengakses rincian E-Receipt.',
          code: 'RECEIPT_VERIFICATION_REQUIRED',
          orderId: o.id
        });
      }
    }

    // Ensure receipt object is present
    let receipt = o.receipt;
    if (!receipt) {
      const canonicalCode = o.orderNumber || o.id;
      const cleanRef = canonicalCode.replace(/^ord_/, '').replace(/^TF-/, '').toUpperCase();
      const receiptNumber = o.receiptNumber || `TG-RCP-${cleanRef}`;
      const issuedAt = o.paymentVerifiedAt || o.updatedAt || o.createdAt;
      receipt = {
        receiptNumber,
        orderId: o.id,
        orderNumber: canonicalCode,
        issuedAt,
        confirmedBy: o.paymentVerifiedBy || 'Admin TumpangGo',
        paymentMethod: o.paymentMethod || 'MERCHANT_QRIS',
        transactionRef: `QRIS-TG-${cleanRef}`,
        subtotal: o.subtotal,
        deliveryFee: o.deliveryFee,
        serviceFee: o.serviceFee,
        uniqueCode: o.uniqueCode || 0,
        total: o.total,
        customerName: o.customerName,
        merchantName: o.merchantName,
        status: 'PAID'
      };
    }

    // Return sanitized data protecting customer sensitive personal details
    res.json({
      receipt,
      receiptNumber: receipt.receiptNumber,
      orderNumber: receipt.orderNumber,
      ...receipt,
      order: {
        id: o.id,
        orderNumber: o.orderNumber || o.id,
        customerName: o.customerName,
        customerPhoneMasked: o.customerPhone ? o.customerPhone.substring(0, 4) + '****' + o.customerPhone.slice(-3) : '',
        deliveryAddress: o.deliveryAddress,
        merchantId: o.merchantId,
        merchantName: o.merchantName,
        items: o.items,
        subtotal: o.subtotal,
        deliveryFee: o.deliveryFee,
        serviceFee: o.serviceFee,
        uniqueCode: o.uniqueCode || 0,
        total: o.total,
        paymentStatus: o.paymentStatus,
        status: o.status,
        paymentMethod: o.paymentMethod || 'MERCHANT_QRIS',
        paymentVerifiedAt: o.paymentVerifiedAt,
        paymentVerifiedBy: o.paymentVerifiedBy || 'Admin TumpangGo',
        createdAt: o.createdAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat E-Receipt.' });
  }
});

/**
 * Strict allowlist serializer for public order tracking (Lacak Order).
 * Protects customer privacy by masking phone numbers across the network,
 * omitting full names, home addresses, landmarks, private delivery details,
 * stripping raw GPS coordinates, and omitting paymentProofUrl and internal settlement fields.
 */
export function serializePublicOrderTracking(order: any) {
  if (!order) return null;

  // Mask phone number: e.g. "081234567899" -> "0812****899"
  const rawPhone = String(order.customerPhone || '').trim();
  let maskedPhone = '';
  if (rawPhone.length >= 7) {
    maskedPhone = rawPhone.substring(0, 4) + '****' + rawPhone.slice(-3);
  } else if (rawPhone.length > 0) {
    maskedPhone = rawPhone.substring(0, 2) + '****';
  }

  // Sanitize items with strict allowlist
  const sanitizedItems = Array.isArray(order.items)
    ? order.items.map((item: any) => ({
        id: item.id || item.menuItemId || '',
        menuItemId: item.menuItemId || item.id || '',
        name: String(item.name || ''),
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
        notes: item.notes ? String(item.notes) : ''
      }))
    : [];

  const canonicalCode = order.orderNumber || order.id;
  const cleanRef = String(canonicalCode).replace(/^ord_/, '').replace(/^TF-/, '').toUpperCase();
  const receiptNumber = order.receiptNumber || (order.receipt?.receiptNumber) || `TG-RCP-${cleanRef}`;

  return {
    id: order.id,
    orderNumber: canonicalCode,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod || 'MERCHANT_QRIS',
    merchantId: order.merchantId,
    merchantName: order.merchantName,
    cookingTimeMinutes: typeof order.cookingTimeMinutes === 'number' ? order.cookingTimeMinutes : null,
    cookingDurationMinutes: typeof order.cookingDurationMinutes === 'number' ? order.cookingDurationMinutes : (typeof order.cookingTimeMinutes === 'number' ? order.cookingTimeMinutes : null),
    cookingStartedAt: order.cookingStartedAt || null,
    cookingEndsAt: order.cookingEndsAt || null,
    driverName: order.driverName || null,
    customerPhone: maskedPhone,
    customerPhoneMasked: maskedPhone,
    items: sanitizedItems,
    subtotal: Number(order.subtotal) || 0,
    deliveryFee: Number(order.deliveryFee) || 0,
    serviceFee: Number(order.serviceFee) || 0,
    uniqueCode: Number(order.uniqueCode) || 0,
    total: Number(order.total) || 0,
    receiptNumber: receiptNumber,
    receipt: order.receipt ? {
      receiptNumber: order.receipt.receiptNumber || receiptNumber,
      orderNumber: canonicalCode,
      issuedAt: order.receipt.issuedAt || order.paymentVerifiedAt || order.createdAt,
      status: order.receipt.status || 'PAID',
      paymentMethod: order.receipt.paymentMethod || 'MERCHANT_QRIS',
      total: Number(order.receipt.total || order.total) || 0
    } : null,
    cancelReason: order.cancelReason || null,
    paymentRejectionReason: order.paymentRejectionReason || null,
    hasPaymentProof: Boolean(order.paymentProof && String(order.paymentProof).trim().length > 10),
    isPublicTracking: true
  };
}

// Single order tracking & retrieval
// Strict RBAC: Authenticated internal roles (Admin, Assigned Merchant, Assigned/Eligible Driver)
// receive the full operational order entity. Public callers (Customer Lacak Order) receive
// a sanitized, allowlisted PublicTrackingOrderDTO with masked phone and no private credentials/coordinates.
orderRouter.get('/:id', async (req: Request, res: Response) => {
  const o = await foodDb.findOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan. Periksa kembali kode order Anda.' });

  const user = req.user;

  // 1. Authenticated ADMIN / MASTER_ADMIN: Full authorized operational access
  if (user && (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN')) {
    return res.json(o);
  }

  // 2. Authenticated MERCHANT: Full operational access if order belongs to their store
  if (user && user.role === 'MERCHANT') {
    const merchantId = user.entityId || user.userId;
    if (merchantId && o.merchantId === merchantId) {
      return res.json(o);
    }
    return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki izin untuk melihat rincian pesanan toko lain.' });
  }

  // 3. Authenticated DRIVER (STRICT: via verified JWT token only, NEVER via x-driver-id header or query param)
  if (user && user.role === 'DRIVER') {
    const verifiedDriverId = user.entityId || user.userId;
    const isAssigned = o.driverId === verifiedDriverId;
    const isAvailableBroadcast = !o.driverId && [
      OrderStatus.COOKING,
      OrderStatus.READY_FOR_PICKUP
    ].includes(o.status);

    if (isAssigned || isAvailableBroadcast) {
      return res.json(o);
    }
    // Driver cannot read orders assigned to another driver or not in broadcast
    return res.status(403).json({
      error: 'Akses ditolak: Anda tidak memiliki izin untuk melihat rincian pesanan driver lain.'
    });
  }

  // 4. Default for Customer / Public Tracking:
  // Return allowlist-only Public Tracking DTO with masked customer phone, no raw coordinates, and no private proofs
  return res.json(serializePublicOrderTracking(o));
});

// Dedicated endpoint to query order QRIS metadata and availability
orderRouter.get('/:id/qris', async (req: Request, res: Response) => {
  try {
    const order = await foodDb.findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const merchant = foodDb.getMerchantById(order.merchantId);
    const rawQris = order.merchantQrisImage || merchant?.qrisImage;
    const hasQris = Boolean(rawQris && typeof rawQris === 'string' && rawQris.trim().length > 3 && !rawQris.includes('unsplash'));
    res.json({
      orderId: order.id,
      merchantId: order.merchantId,
      merchantName: order.merchantName,
      total: order.total,
      hasQris,
      qrisImage: hasQris ? rawQris : null,
      qrisImageUrl: hasQris ? `/api/orders/${order.id}/qris-image` : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat status QRIS pesanan.' });
  }
});

// Dedicated endpoint to stream order QRIS image
orderRouter.get('/:id/qris-image', async (req: Request, res: Response) => {
  try {
    const order = await foodDb.findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const merchant = foodDb.getMerchantById(order.merchantId);
    const rawQris = order.merchantQrisImage || merchant?.qrisImage;
    if (!rawQris || typeof rawQris !== 'string' || rawQris.trim().length < 3 || rawQris.includes('unsplash')) {
      return res.status(404).json({ error: `Toko "${order.merchantName}" belum memiliki QRIS statis resmi.` });
    }

    const cleanQris = rawQris.trim();

    // 1. Base64 Data URL
    if (cleanQris.startsWith('data:image/')) {
      const matches = cleanQris.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
      if (matches) {
        res.setHeader('Content-Type', matches[1]);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(matches[2], 'base64'));
      }
    }

    // 2. Relative static asset path (e.g. /qris-merchant.png)
    if (cleanQris.startsWith('/')) {
      const candidatePaths = [
        path.resolve(process.cwd(), 'dist', cleanQris.replace(/^\//, '')),
        path.resolve(process.cwd(), 'public', cleanQris.replace(/^\//, '')),
        path.resolve('/var/task', 'dist', cleanQris.replace(/^\//, '')),
        path.resolve('/var/task', 'public', cleanQris.replace(/^\//, ''))
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const ext = path.extname(p).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(p);
        }
      }
    }

    // 3. Absolute URL redirect
    if (cleanQris.startsWith('http://') || cleanQris.startsWith('https://')) {
      return res.redirect(cleanQris);
    }

    return res.status(404).json({ error: 'Gambar QRIS pesanan tidak dapat diakses.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat gambar QRIS pesanan.' });
  }
});

// Dedicated endpoint to stream uploaded payment proof image binary directly
// Protected: Only Admin, Order Merchant, Assigned Driver, or verified Customer with proof token can access
orderRouter.get('/:id/payment-proof', async (req: Request, res: Response) => {
  try {
    const order = await foodDb.findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });

    const proof = order.paymentProof;
    if (!proof || typeof proof !== 'string' || proof.trim().length < 10) {
      return res.status(404).json({ error: 'Bukti pembayaran belum diunggah untuk pesanan ini.' });
    }

    // Role-based authorization & proof token verification
    const user = req.user;
    const proofToken = (req.query.proofToken as string) || (req.query.token as string) || (req.headers['x-order-token'] as string);
    const hasValidProofToken = Boolean(proofToken && verifyOrderProofToken(order.id, proofToken));

    if (!user && !hasValidProofToken) {
      return res.status(401).json({
        error: 'Akses ditolak: Autentikasi server diperlukan untuk melihat bukti pembayaran.'
      });
    }

    if (user) {
      if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN') {
        // Allowed: Administrators
      } else if (user.role === 'MERCHANT') {
        const merchantId = user.entityId || user.userId;
        if (merchantId !== order.merchantId) {
          return res.status(403).json({
            error: 'Akses ditolak: Anda tidak memiliki izin untuk melihat bukti pembayaran pesanan toko lain.'
          });
        }
      } else if (user.role === 'DRIVER') {
        const driverId = user.entityId || user.userId;
        if (!order.driverId || order.driverId !== driverId) {
          return res.status(403).json({
            error: 'Akses ditolak: Anda bukan kurir yang ditugaskan untuk pesanan ini.'
          });
        }
      } else if (user.role === 'CUSTOMER') {
        const customerId = user.userId;
        const customerPhone = user.email || user.entityId;
        const normOrderPhone = String(order.customerPhone || '').replace(/\D/g, '');
        const normUserPhone = String(customerPhone || '').replace(/\D/g, '');
        const isOwner = customerId === (order as any).customerId || (normUserPhone.length >= 8 && normOrderPhone.endsWith(normUserPhone));
        if (!isOwner && !hasValidProofToken) {
          return res.status(403).json({
            error: 'Akses ditolak: Anda bukan pemilik pesanan ini.'
          });
        }
      } else {
        return res.status(403).json({ error: 'Akses ditolak.' });
      }
    }

    const cleanProof = proof.trim();
    if (cleanProof.startsWith('data:image/')) {
      const matches = cleanProof.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
      if (matches) {
        res.setHeader('Content-Type', matches[1]);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.send(Buffer.from(matches[2], 'base64'));
      }
    }

    if (cleanProof.startsWith('http://') || cleanProof.startsWith('https://')) {
      return res.redirect(cleanProof);
    }

    return res.status(404).json({ error: 'Format bukti pembayaran tidak valid.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat bukti pembayaran.' });
  }
});

// In-memory sliding window rate limiter for customer history queries
const customerHistoryRateLimiter = new Map<string, { count: number; resetAt: number }>();

export function resetCustomerHistoryRateLimit(key?: string): void {
  if (key) {
    customerHistoryRateLimiter.delete(key);
  } else {
    customerHistoryRateLimiter.clear();
  }
}

export function checkCustomerHistoryRateLimit(key: string, limit = 5, windowMs = 60000): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = customerHistoryRateLimiter.get(key);
  if (!entry || now > entry.resetAt) {
    customerHistoryRateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

// Customer order history by phone number
// Protected: Rate limited and restricted to authenticated Admins or verified Customers
orderRouter.get('/customer/:phone', (req: Request, res: Response) => {
  const rawPhone = String(req.params.phone || '').trim();
  const clientIp = String(req.ip || req.headers['x-forwarded-for'] || 'client');

  // Rate Limiting Guard: Max 5 requests per minute per IP
  const rateKey = `hist_${clientIp}`;
  const rateCheck = checkCustomerHistoryRateLimit(rateKey, 5, 60000);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter));
    return res.status(429).json({
      error: 'Terlalu banyak permintaan riwayat pesanan. Silakan coba kembali dalam beberapa saat.',
      retryAfter: rateCheck.retryAfter
    });
  }

  const user = req.user;
  const isPrivileged = user && (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN');
  const normParam = rawPhone.replace(/\D/g, '');
  const isVerifiedCustomer = user && user.role === 'CUSTOMER' && (
    (user.email && user.email.replace(/\D/g, '') === normParam) ||
    (user.entityId && user.entityId.replace(/\D/g, '') === normParam)
  );

  if (!isPrivileged && !isVerifiedCustomer) {
    return res.status(403).json({
      error: 'Akses ditolak: Akses riwayat pesanan berdasarkan nomor telepon tanpa verifikasi kepemilikan dinonaktifkan demi privasi pelanggan. Silakan gunakan fitur Lacak Order dengan kode pesanan resmi Anda.',
      code: 'UNVERIFIED_CUSTOMER_HISTORY_DISABLED'
    });
  }

  const orders = foodDb.getOrdersByCustomerPhone(rawPhone);
  const sanitized = orders.map(o => serializePublicOrderTracking(o));
  res.json(sanitized);
});

// Order creation - Recalculates official prices with structured stage diagnostics
orderRouter.post('/', async (req: Request, res: Response) => {
  const reqId = (req as any).id || (req.headers['x-request-id'] as string) || 'req_' + Math.random().toString(36).substring(2, 9);

  try {
    const { merchantId, customerName, customerPhone, deliveryAddress, items } = req.body || {};

    // Stage 1: Validation
    if (!merchantId || typeof merchantId !== 'string' || merchantId.trim().length === 0) {
      console.warn(`[Order Validation Error] [${reqId}] Merchant ID is missing`);
      return res.status(400).json({
        error: 'Toko / Merchant kuliner wajib dipilih.',
        code: 'MISSING_MERCHANT_ID',
        stage: 'ORDER_VALIDATION',
        requestId: reqId
      });
    }

    if (!customerName || !customerPhone || !deliveryAddress) {
      console.warn(`[Order Validation Error] [${reqId}] Customer details missing (Name: ${Boolean(customerName)}, Phone: ${Boolean(customerPhone)}, Address: ${Boolean(deliveryAddress)})`);
      return res.status(400).json({
        error: 'Nama pemesan, nomor WhatsApp, dan alamat pengantaran wajib diisi lengkap.',
        code: 'MISSING_CUSTOMER_DETAILS',
        stage: 'ORDER_VALIDATION',
        requestId: reqId
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      console.warn(`[Order Validation Error] [${reqId}] Cart items empty`);
      return res.status(400).json({
        error: 'Keranjang belanja Anda kosong. Silakan pilih menu makanan terlebih dahulu.',
        code: 'EMPTY_CART',
        stage: 'ORDER_VALIDATION',
        requestId: reqId
      });
    }

    // Stage 2: Database Persistence
    const created = await foodDb.createOrder(req.body);

    const proofToken = generateOrderProofToken(created.id);
    console.log(`[Order Placed Successfully] [${reqId}] ID: ${created.id}, Total: Rp ${created.total.toLocaleString('id-ID')}, Merchant: ${created.merchantId}, UniqueCode: ${created.uniqueCode}`);
    return res.status(201).json({
      ...created,
      proofToken,
      orderToken: proofToken
    });

  } catch (e: any) {
    const errorMsg = e.message || 'Gagal membuat pesanan.';
    const isDbError = errorMsg.includes('Firestore') || errorMsg.includes('database') || errorMsg.includes('penyimpanan');

    console.error(`[Order Creation Failed] [${reqId}] Stage: ${isDbError ? 'DATABASE_PERSISTENCE' : 'ORDER_VALIDATION'}, Error: ${errorMsg}`);

    return res.status(isDbError ? 500 : 400).json({
      error: errorMsg,
      code: isDbError ? 'DATABASE_PERSISTENCE_ERROR' : 'ORDER_VALIDATION_ERROR',
      stage: isDbError ? 'DATABASE_PERSISTENCE' : 'ORDER_VALIDATION',
      requestId: reqId
    });
  }
});

// Order status/details update handler (supports both PUT and PATCH)
const handleOrderUpdate = async (req: Request, res: Response) => {
  const user = req.user;
  const currentOrder = await foodDb.findOrder(req.params.id);
  if (!currentOrder) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const { userId, role, customerPhone, cancelReason, overrideExpired, ...rawUpdates } = req.body;
  const updates: any = { ...rawUpdates };

  // STRIP SENSITIVE / TAMPER-PRONE FIELDS
  delete updates.isSettled;
  delete updates.settlementId;
  delete updates.settledAt;
  delete updates.total;
  delete updates.subtotal;
  delete updates.serviceFee;
  delete updates.deliveryFee;
  delete updates.merchantId;
  delete updates.id;

  // Prevent unauthorized payment verification or rejection
  if (
    updates.status === OrderStatus.PAYMENT_VERIFIED ||
    updates.paymentStatus === PaymentStatus.PAID
  ) {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER_ADMIN')) {
      return res.status(403).json({
        error: 'Akses ditolak: Hanya Admin yang berwenang memverifikasi pembayaran menjadi lunas (PAID).'
      });
    }
  }

  if (
    updates.status === OrderStatus.PAYMENT_REJECTED ||
    updates.paymentStatus === PaymentStatus.REJECTED
  ) {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER_ADMIN')) {
      return res.status(403).json({
        error: 'Akses ditolak: Hanya Admin yang berwenang menolak bukti pembayaran.'
      });
    }
  }

  // 1. UNAUTHENTICATED REQUEST (Customer Cancellation only)
  if (!user) {
    const isCustomerCancel =
      updates.status === OrderStatus.CANCELLED &&
      customerPhone &&
      String(customerPhone).trim() === String(currentOrder.customerPhone).trim() &&
      (currentOrder.status === OrderStatus.WAITING_PAYMENT ||
        currentOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION);

    if (!isCustomerCancel) {
      return res.status(401).json({
        error: 'Akses ditolak: Autentikasi diperlukan untuk mengubah status atau data pesanan.'
      });
    }

    try {
      const updated = await foodDb.updateOrder(
        'CUSTOMER',
        req.params.id,
        {
          status: OrderStatus.CANCELLED,
          cancelReason: cancelReason || 'Dibatalkan oleh Pelanggan'
        },
        'CUSTOMER'
      );
      return res.json(updated);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  }

  // 2. MERCHANT ROLE ENFORCEMENT
  if (user.role === 'MERCHANT') {
    if (user.entityId !== currentOrder.merchantId && user.userId !== currentOrder.merchantId) {
      return res.status(403).json({
        error: 'Akses ditolak: Anda tidak memiliki izin untuk mengelola pesanan milik toko lain.'
      });
    }

    // Only allow cooking, ready for pickup, or cancellation
    if (updates.status) {
      const allowedMerchantStatuses: OrderStatus[] = [
        OrderStatus.COOKING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED
      ];
      if (!allowedMerchantStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Merchant tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
      }
    }

    // Cooking duration validation and server timestamp calculations
    const rawDuration = updates.cookingDurationMinutes ?? updates.cookingTimeMinutes;
    if (rawDuration !== undefined && rawDuration !== null) {
      const numDuration = Number(rawDuration);
      if (![15, 30, 45, 60].includes(numDuration)) {
        return res.status(400).json({
          error: 'Pilihan estimasi waktu memasak tidak valid. Pilihan yang diizinkan: 15, 30, 45, atau 60 menit.'
        });
      }
      updates.cookingDurationMinutes = numDuration;
      updates.cookingTimeMinutes = numDuration;
    }

    if (updates.status === OrderStatus.COOKING) {
      if (currentOrder.status !== OrderStatus.PAYMENT_VERIFIED && currentOrder.status !== OrderStatus.COOKING) {
        return res.status(400).json({
          error: 'Pesanan belum dapat dimasak karena pembayaran belum diverifikasi lunas oleh Admin.'
        });
      }

      const duration = updates.cookingDurationMinutes || updates.cookingTimeMinutes || currentOrder.cookingDurationMinutes || currentOrder.cookingTimeMinutes || 15;

      // Idempotency check: if order is already cooking with same duration, preserve timestamps
      const isAlreadyCooking = currentOrder.status === OrderStatus.COOKING && Boolean(currentOrder.cookingStartedAt && currentOrder.cookingEndsAt);
      const currentDuration = currentOrder.cookingDurationMinutes || currentOrder.cookingTimeMinutes;
      const durationChanged = Boolean(currentDuration && currentDuration !== duration);

      if (!isAlreadyCooking || durationChanged) {
        const now = new Date();
        const startedAt = (isAlreadyCooking && currentOrder.cookingStartedAt) ? currentOrder.cookingStartedAt : now.toISOString();
        const startMs = new Date(startedAt).getTime();
        const endsAt = new Date(startMs + duration * 60 * 1000).toISOString();

        updates.cookingDurationMinutes = duration;
        updates.cookingTimeMinutes = duration;
        updates.cookingStartedAt = startedAt;
        updates.cookingEndsAt = endsAt;
        updates.cookingEstimatedReadyAt = endsAt;
      } else {
        updates.cookingDurationMinutes = currentOrder.cookingDurationMinutes || duration;
        updates.cookingTimeMinutes = currentOrder.cookingTimeMinutes || duration;
        updates.cookingStartedAt = currentOrder.cookingStartedAt;
        updates.cookingEndsAt = currentOrder.cookingEndsAt;
        updates.cookingEstimatedReadyAt = currentOrder.cookingEstimatedReadyAt || currentOrder.cookingEndsAt;
      }
    }
  }

  // 2b. ADMIN & MASTER_ADMIN COOKING HANDLING
  if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN') {
    const rawDuration = updates.cookingDurationMinutes ?? updates.cookingTimeMinutes;
    if (rawDuration !== undefined && rawDuration !== null) {
      const numDuration = Number(rawDuration);
      if (![15, 30, 45, 60].includes(numDuration)) {
        return res.status(400).json({
          error: 'Pilihan estimasi waktu memasak tidak valid. Pilihan yang diizinkan: 15, 30, 45, atau 60 menit.'
        });
      }
      updates.cookingDurationMinutes = numDuration;
      updates.cookingTimeMinutes = numDuration;
    }

    if (updates.status === OrderStatus.COOKING) {
      const duration = updates.cookingDurationMinutes || updates.cookingTimeMinutes || currentOrder.cookingDurationMinutes || currentOrder.cookingTimeMinutes || 15;
      const isAlreadyCooking = currentOrder.status === OrderStatus.COOKING && Boolean(currentOrder.cookingStartedAt && currentOrder.cookingEndsAt);
      const currentDuration = currentOrder.cookingDurationMinutes || currentOrder.cookingTimeMinutes;
      const durationChanged = Boolean(currentDuration && currentDuration !== duration);

      if (!isAlreadyCooking || durationChanged) {
        const now = new Date();
        const startedAt = (isAlreadyCooking && currentOrder.cookingStartedAt) ? currentOrder.cookingStartedAt : now.toISOString();
        const startMs = new Date(startedAt).getTime();
        const endsAt = new Date(startMs + duration * 60 * 1000).toISOString();

        updates.cookingDurationMinutes = duration;
        updates.cookingTimeMinutes = duration;
        updates.cookingStartedAt = startedAt;
        updates.cookingEndsAt = endsAt;
        updates.cookingEstimatedReadyAt = endsAt;
      } else {
        updates.cookingDurationMinutes = currentOrder.cookingDurationMinutes || duration;
        updates.cookingTimeMinutes = currentOrder.cookingTimeMinutes || duration;
        updates.cookingStartedAt = currentOrder.cookingStartedAt;
        updates.cookingEndsAt = currentOrder.cookingEndsAt;
        updates.cookingEstimatedReadyAt = currentOrder.cookingEstimatedReadyAt || currentOrder.cookingEndsAt;
      }
    }
  }

  // 3. DRIVER ROLE ENFORCEMENT
  if (user.role === 'DRIVER') {
    const isAssigned = currentOrder.driverId === user.entityId || currentOrder.driverId === user.userId;
    const canAcceptTask =
      !currentOrder.driverId &&
      [OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP].includes(currentOrder.status);

    if (!isAssigned && !canAcceptTask) {
      if (currentOrder.driverId && currentOrder.driverId !== (user.entityId || user.userId)) {
        return res.status(409).json({
          error: 'Pesanan ini sudah diambil oleh kurir lain.'
        });
      }
      return res.status(403).json({
        error: 'Akses ditolak: Pesanan ini bukan tugas pengantaran Anda atau belum memasuki tahap memasak.'
      });
    }

    // If driver is accepting an unassigned task
    if (!currentOrder.driverId && canAcceptTask) {
      const driver = foodDb.getDriverById(user.entityId || user.userId);
      if (!driver) {
        return res.status(404).json({ error: 'Data identitas kurir tidak ditemukan di sistem.' });
      }
      if (!driver.active) {
        return res.status(403).json({
          error: 'Akun kurir Anda belum disetujui atau dinonaktifkan oleh Administrator.'
        });
      }
      if (!driver.online) {
        return res.status(400).json({
          error: 'Status Anda sedang Offline. Aktifkan status Online terlebih dahulu untuk menerima tugas.'
        });
      }
      updates.driverId = driver.id;
      updates.driverName = driver.name;
    }

    if (updates.status) {
      const allowedDriverStatuses: OrderStatus[] = [
        OrderStatus.ORDER_PICKED_UP,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED
      ];
      if (!allowedDriverStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Driver tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
      }

      // Pickup guard: food must be marked ready for pickup by merchant
      if (updates.status === OrderStatus.ORDER_PICKED_UP) {
        if (currentOrder.status === OrderStatus.COOKING || currentOrder.status === OrderStatus.PAYMENT_VERIFIED) {
          return res.status(400).json({
            error: 'Pesanan masih dalam proses memasak oleh merchant. Silakan tunggu hingga merchant menandai status pesanan "Siap Diambil".'
          });
        }
      }

      // Delivery completion guard: photo proof is required when completing delivery
      if (updates.status === OrderStatus.DELIVERED) {
        const hasDeliveryProof = Boolean(updates.deliveryProof || currentOrder.deliveryProof);
        if (!hasDeliveryProof) {
          return res.status(400).json({
            error: 'Foto bukti pengantaran wajib diunggah sebelum menandai pesanan selesai diantar.'
          });
        }
      }
    }
  }

  // 4. EXPIRED / CANCELLED ORDERS GUARD
  if (currentOrder.status === OrderStatus.EXPIRED || currentOrder.status === OrderStatus.CANCELLED) {
    if (updates.status && updates.status !== currentOrder.status) {
      if ((user.role === 'ADMIN' || user.role === 'MASTER_ADMIN') && currentOrder.status === OrderStatus.EXPIRED) {
        if (!overrideExpired) {
          return res.status(400).json({
            error:
              'Pesanan telah KEDALUWARSA (EXPIRED). Verifikasi pembayaran tidak dapat dilakukan secara tidak sengaja. Sertakan persetujuan eksplisit pembayaran terlambat (overrideExpired: true) beserta catatan administrasi.'
          });
        }
        foodDb.log(
          user.userId,
          `Admin explicitly approved late payment for expired order ${currentOrder.id}`,
          'ADMIN'
        );
      } else {
        return res.status(400).json({
          error: `Pesanan yang telah ${currentOrder.status} tidak dapat diaktifkan kembali secara langsung.`
        });
      }
    }
  }

  // Preserve cancel reason if provided
  if (cancelReason) {
    updates.cancelReason = cancelReason;
  }

  try {
    const updated = await foodDb.updateOrder(
      user.userId || user.entityId || 'system',
      req.params.id,
      updates,
      user.role
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

orderRouter.put('/:id', handleOrderUpdate);
orderRouter.patch('/:id', handleOrderUpdate);

// Admin manual driver assignment
orderRouter.post('/:id/assign-driver', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { driverId } = req.body;
  if (!driverId) {
    return res.status(400).json({ error: 'Driver ID wajib disertakan.' });
  }
  try {
    const updated = await foodDb.manualAssignDriver(req.user?.userId || 'admin', req.params.id, driverId);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Driver accepts an unassigned order task atomically (Strict: driver ID derived from verified token)
orderRouter.post('/:id/accept-task', requireRole(['DRIVER', 'ADMIN', 'MASTER_ADMIN']), async (req: Request, res: Response) => {
  let driverId = '';
  if (req.user?.role === 'DRIVER') {
    driverId = req.user.entityId || req.user.userId;
  } else if (req.user?.role === 'ADMIN' || req.user?.role === 'MASTER_ADMIN') {
    driverId = req.body?.driverId || req.user.entityId || req.user.userId;
  }
  if (!driverId) {
    return res.status(400).json({ error: 'Identitas driver tidak valid atau belum terautentikasi.' });
  }
  try {
    const updated = await foodDb.acceptDriverTask(driverId, req.params.id);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal menerima tugas pesanan.' });
  }
});

// Customer payment proof upload - Enforces ownership token, file validation & privacy sanitization
orderRouter.post('/:id/upload-payment', async (req: Request, res: Response) => {
  const { paymentProof, orderToken, proofToken } = req.body || {};
  if (!paymentProof || typeof paymentProof !== 'string' || paymentProof.trim().length < 10) {
    return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah dalam format gambar atau foto yang sah.' });
  }

  const order = await foodDb.findOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  // 1. Ownership & Authorization Verification:
  // - Admin or Master Admin
  // - Authenticated customer owning the order
  // - Valid cryptographic HMAC order proof token (MANDATORY for unauthenticated/guest customers)
  const user = req.user;
  const tokenCandidate = (req.headers['x-order-token'] as string) || 
                         (req.headers['authorization']?.replace(/^Bearer\s+/i, '')) || 
                         orderToken || 
                         proofToken || 
                         (req.query.token as string);

  const isValidToken = Boolean(tokenCandidate && verifyOrderProofToken(order.id, tokenCandidate));
  const isAdmin = user && (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN');
  const isCustomerOwner = user && user.role === 'CUSTOMER' && (
    user.userId === (order as any).customerId ||
    (user.email && user.email === order.customerPhone)
  );

  const isAuthorized = isAdmin || isCustomerOwner || isValidToken;

  if (!isAuthorized) {
    return res.status(403).json({
      error: 'Akses ditolak: Anda tidak memiliki wewenang atau token kepemilikan HMAC yang sah untuk mengunggah bukti pembayaran pesanan ini.'
    });
  }

  // 2. State & Expiration Guards:
  // Cannot upload proof if already verified as PAID or progressed into kitchen/delivery
  const alreadyPaidStatuses: OrderStatus[] = [
    OrderStatus.PAYMENT_VERIFIED,
    OrderStatus.COOKING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.ORDER_PICKED_UP,
    OrderStatus.DELIVERED,
    OrderStatus.COMPLETED
  ];

  if (alreadyPaidStatuses.includes(order.status) || order.paymentStatus === PaymentStatus.PAID) {
    return res.status(400).json({
      error: 'Pembayaran untuk pesanan ini sudah diverifikasi lunas (PAID). Tidak dapat mengunggah bukti pembayaran ulang.'
    });
  }

  if (order.status === OrderStatus.CANCELLED) {
    return res.status(400).json({
      error: 'Pesanan ini telah dibatalkan dan tidak dapat menerima bukti pembayaran.'
    });
  }

  const now = Date.now();
  const expiryTime = order.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : 0;

  if (expiryTime && now > expiryTime && order.status === OrderStatus.WAITING_PAYMENT) {
    await foodDb.updateOrder('SYSTEM', order.id, { 
      status: OrderStatus.EXPIRED,
      paymentStatus: PaymentStatus.EXPIRED
    }, 'SYSTEM');
    return res.status(400).json({
      error: 'Waktu pembayaran untuk pesanan ini telah kedaluwarsa. Pesanan ditandai sebagai KEDALUWARSA dan tidak dapat diproses lagi.'
    });
  }

  if (order.status === OrderStatus.EXPIRED) {
    return res.status(400).json({
      error: 'Pesanan ini telah kedaluwarsa dan tidak dapat menerima bukti pembayaran lagi.'
    });
  }

  // 3. Strict Server-Side File Type & Size Validation
  const cleanProof = paymentProof.trim();
  const isDataUri = cleanProof.startsWith('data:image/');

  if (!isDataUri) {
    return res.status(400).json({
      error: 'Bukti pembayaran wajib berupa file gambar yang diunggah langsung (Data URI base64). URL eksternal HTTP/HTTPS tidak diizinkan demi alasan keamanan.'
    });
  }

  // Size limit: Max ~5MB raw image binary (~7MB base64 string)
  if (cleanProof.length > 7 * 1024 * 1024) {
    return res.status(400).json({
      error: 'Ukuran file gambar bukti transfer melebihi batas maksimal 5MB. Silakan pilih foto dengan resolusi lebih kecil.'
    });
  }

  let finalProof = cleanProof;
  const proofUrl = `/api/orders/${order.id}/payment-proof`;

  if (isDataUri) {
    const mimeMatch = cleanProof.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
    if (!mimeMatch) {
      return res.status(400).json({ error: 'Format data gambar base64 tidak valid.' });
    }

    const declaredMime = mimeMatch[1].toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(declaredMime)) {
      return res.status(400).json({ error: `Format file "${declaredMime}" tidak didukung. Mohon unggah gambar berformat JPG, PNG, atau WebP.` });
    }

    try {
      const rawBuffer = Buffer.from(mimeMatch[2], 'base64');
      if (rawBuffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Ukuran file gambar melebihi batas maksimal 5MB.' });
      }

      // Check file magic numbers for raster image types
      const isJpeg = rawBuffer.length >= 3 && rawBuffer[0] === 0xFF && rawBuffer[1] === 0xD8 && rawBuffer[2] === 0xFF;
      const isPng = rawBuffer.length >= 4 && rawBuffer[0] === 0x89 && rawBuffer[1] === 0x50 && rawBuffer[2] === 0x4E && rawBuffer[3] === 0x47;
      const isWebp = rawBuffer.length >= 12 && rawBuffer.toString('ascii', 0, 4) === 'RIFF' && rawBuffer.toString('ascii', 8, 12) === 'WEBP';

      if (!isJpeg && !isPng && !isWebp) {
        return res.status(400).json({ error: 'Header binary file tidak cocok dengan format gambar JPG, PNG, atau WebP yang valid.' });
      }

      // Strict Sharp decoding and dimension verification
      const metadata = await sharp(rawBuffer).metadata();
      if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
        return res.status(400).json({ error: 'Data gambar tidak dapat didekode atau korup. Silakan pilih foto screenshot yang valid.' });
      }

      const optimizedBuffer = await sharp(rawBuffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      finalProof = `data:image/webp;base64,${optimizedBuffer.toString('base64')}`;
    } catch (sharpErr: any) {
      console.warn('[OrderRoutes] Image validation warning:', sharpErr?.message || sharpErr);
      return res.status(400).json({ error: 'File gambar yang dipilih tidak valid atau rusak. Silakan pilih foto screenshot yang sah.' });
    }
  }

  // 4. Update order state to WAITING_PAYMENT_VERIFICATION (Never mark as PAID here; verification requires authorized Admin action)
  try {
    const updated = await foodDb.updateOrder(
      'CUSTOMER',
      req.params.id,
      {
        paymentProof: finalProof,
        paymentProofUrl: proofUrl,
        paymentProofUploadedAt: new Date().toISOString(),
        paymentStatus: PaymentStatus.WAITING_VERIFICATION,
        status: OrderStatus.WAITING_PAYMENT_VERIFICATION,
        paymentRejectionReason: undefined
      },
      'CUSTOMER'
    );

    // 5. Return sanitized public tracking DTO to protect customer privacy
    const publicTracking = serializePublicOrderTracking(updated);
    const newProofToken = generateOrderProofToken(updated.id);

    res.json({
      success: true,
      message: 'Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.',
      order: publicTracking,
      id: updated.id,
      orderNumber: updated.orderNumber || updated.id,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      paymentProofUploadedAt: updated.paymentProofUploadedAt,
      proofToken: newProofToken,
      orderToken: newProofToken
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Gagal menyimpan bukti pembayaran.' });
  }
});

// Admin payment verification endpoint - Authoritative verification
orderRouter.post('/:id/verify-payment', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const reqId = (req as any).id || 'req_' + Math.random().toString(36).substring(2, 8);
  const rawOrderId = String(req.params.id || '').trim();
  const adminId = req.user?.userId || req.user?.email || 'admin';

  console.log(`[Order Verification Request] [${reqId}] POST /api/orders/:id/verify-payment received. Target order ID: "${rawOrderId}", Admin: "${adminId}"`);

  if (!rawOrderId) {
    console.warn(`[Order Verification Warning] [${reqId}] Missing order ID in route parameter.`);
    return res.status(400).json({ error: 'ID pesanan wajib disertakan dalam parameter permintaan.' });
  }

  try {
    const updated = await foodDb.verifyOrderPayment(adminId, rawOrderId);
    console.log(`[Order Verification Success] [${reqId}] Order "${updated.id}" successfully verified to PAID. Receipt issued: ${updated.receiptNumber || 'None'}`);
    res.json({ success: true, order: updated });
  } catch (e: any) {
    console.error(`[Order Verification Error] [${reqId}] Failed verifying order "${rawOrderId}":`, e.message);
    res.status(400).json({ error: e.message || 'Gagal memverifikasi pembayaran.' });
  }
});

// Admin payment rejection endpoint with mandatory reason
orderRouter.post('/:id/reject-payment', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const reqId = (req as any).id || 'req_' + Math.random().toString(36).substring(2, 8);
  const rawOrderId = String(req.params.id || '').trim();
  const adminId = req.user?.userId || req.user?.email || 'admin';
  const { reason } = req.body || {};

  console.log(`[Order Rejection Request] [${reqId}] POST /api/orders/:id/reject-payment received. Target order ID: "${rawOrderId}", Admin: "${adminId}"`);

  if (!rawOrderId) {
    console.warn(`[Order Rejection Warning] [${reqId}] Missing order ID in route parameter.`);
    return res.status(400).json({ error: 'ID pesanan wajib disertakan dalam parameter permintaan.' });
  }

  if (!reason || !String(reason).trim()) {
    console.warn(`[Order Rejection Warning] [${reqId}] Rejection reason is missing for order "${rawOrderId}".`);
    return res.status(400).json({ error: 'Alasan penolakan bukti pembayaran wajib disertakan agar pelanggan dapat memperbaikinya.' });
  }

  try {
    const updated = await foodDb.rejectOrderPayment(adminId, rawOrderId, String(reason).trim());
    console.log(`[Order Rejection Success] [${reqId}] Order "${updated.id}" status set to PAYMENT_REJECTED. Reason: "${String(reason).trim()}"`);
    res.json({ success: true, order: updated });
  } catch (e: any) {
    console.error(`[Order Rejection Error] [${reqId}] Failed rejecting order "${rawOrderId}":`, e.message);
    res.status(400).json({ error: e.message || 'Gagal menolak bukti pembayaran.' });
  }
});

// Driver delivery proof upload - Protected
orderRouter.post('/:id/upload-delivery', requireRole(['DRIVER', 'ADMIN', 'MASTER_ADMIN']), async (req: Request, res: Response) => {
  const { deliveryProof } = req.body;
  if (!deliveryProof) {
    return res.status(400).json({ error: 'Bukti foto pengantaran wajib disertakan.' });
  }

  const order = await foodDb.findOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const user = req.user!;
  if (user.role === 'DRIVER') {
    if (order.driverId !== user.entityId && order.driverId !== user.userId) {
      return res.status(403).json({ error: 'Akses ditolak: Anda bukan kurir yang ditugaskan untuk pesanan ini.' });
    }
  }

  try {
    const updated = await foodDb.updateOrder(
      user.userId || user.entityId || 'driver',
      req.params.id,
      {
        deliveryProof,
        status: OrderStatus.COMPLETED
      },
      user.role
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
