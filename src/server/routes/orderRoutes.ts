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
import { Router, Request, Response } from 'express';
import sharp from 'sharp';
import { foodDb } from '../db';
import { OrderStatus, PaymentStatus } from '../../types';
import { requireRole } from '../auth';

export const orderRouter = Router();

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
      const receiptNumber = o.receiptNumber || `TG-RCP-${o.id.replace(/^ord_/, '').toUpperCase()}`;
      const issuedAt = o.paymentVerifiedAt || o.updatedAt || o.createdAt;
      receipt = {
        receiptNumber,
        orderId: o.id,
        issuedAt,
        confirmedBy: o.paymentVerifiedBy || 'Admin TumpangGo',
        paymentMethod: o.paymentMethod || 'MERCHANT_QRIS',
        transactionRef: o.artopayPaymentId || `QRIS-TG-${o.id.replace(/^ord_/, '').toUpperCase()}`,
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
      order: {
        id: o.id,
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

// Single order tracking (Public tracking with ID)
orderRouter.get('/:id', async (req: Request, res: Response) => {
  const o = await foodDb.findOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(o);
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

// Dedicated endpoint to stream order QRIS image binary directly
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
orderRouter.get('/:id/payment-proof', async (req: Request, res: Response) => {
  try {
    const order = await foodDb.findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    const proof = order.paymentProof;
    if (!proof || typeof proof !== 'string' || proof.trim().length < 10) {
      return res.status(404).json({ error: 'Bukti pembayaran belum diunggah untuk pesanan ini.' });
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

// Customer order history by phone number
orderRouter.get('/customer/:phone', (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByCustomerPhone(req.params.phone));
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

    console.log(`[Order Placed Successfully] [${reqId}] ID: ${created.id}, Total: Rp ${created.total.toLocaleString('id-ID')}, Merchant: ${created.merchantId}, UniqueCode: ${created.uniqueCode}`);
    return res.status(201).json(created);

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

// Order status/details update
orderRouter.put('/:id', async (req: Request, res: Response) => {
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
  }

  // 3. DRIVER ROLE ENFORCEMENT
  if (user.role === 'DRIVER') {
    const isAssigned = currentOrder.driverId === user.entityId || currentOrder.driverId === user.userId;
    const canAcceptTask =
      !currentOrder.driverId && currentOrder.status === OrderStatus.READY_FOR_PICKUP;

    if (!isAssigned && !canAcceptTask) {
      return res.status(403).json({
        error: 'Akses ditolak: Pesanan ini bukan tugas pengantaran Anda.'
      });
    }

    if (updates.status) {
      const allowedDriverStatuses: OrderStatus[] = [
        OrderStatus.ORDER_PICKED_UP,
        OrderStatus.COMPLETED
      ];
      if (!allowedDriverStatuses.includes(updates.status)) {
        return res.status(403).json({
          error: `Driver tidak diizinkan mengubah status pesanan ke ${updates.status}.`
        });
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
});

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

// Customer payment proof upload - Enforces 10-minute expiry & serverless image optimization
orderRouter.post('/:id/upload-payment', async (req: Request, res: Response) => {
  const { paymentProof } = req.body;
  if (!paymentProof || typeof paymentProof !== 'string' || paymentProof.trim().length < 10) {
    return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah dalam format gambar atau foto yang sah.' });
  }

  const cleanProof = paymentProof.trim();
  const isDataUri = cleanProof.startsWith('data:image/');
  const isHttpUrl = cleanProof.startsWith('http://') || cleanProof.startsWith('https://');

  if (!isDataUri && !isHttpUrl) {
    return res.status(400).json({ error: 'Format file tidak didukung. Mohon unggah bukti berformat gambar (JPG, PNG, atau WebP).' });
  }

  // Size guard: max ~8MB base64
  if (isDataUri && cleanProof.length > 11 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran file gambar bukti transfer melebihi batas maksimal 8MB. Silakan pilih foto dengan resolusi lebih kecil.' });
  }

  const order = await foodDb.findOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  // Validate payment expiration window
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

  if (order.status === OrderStatus.CANCELLED) {
    return res.status(400).json({
      error: 'Pesanan ini telah dibatalkan dan tidak dapat menerima bukti pembayaran.'
    });
  }

  let finalProof = cleanProof;
  const proofUrl = `/api/orders/${order.id}/payment-proof`;

  // Server-side image optimization with sharp (safe for Vercel Serverless & Firestore 1MB limits)
  if (isDataUri) {
    try {
      const match = cleanProof.match(/^data:image\/([a-zA-Z0-9.+_-]+);base64,(.+)$/);
      if (match) {
        const rawBuffer = Buffer.from(match[2], 'base64');
        const optimizedBuffer = await sharp(rawBuffer)
          .rotate() // Auto-rotate according to EXIF
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        finalProof = `data:image/webp;base64,${optimizedBuffer.toString('base64')}`;
      }
    } catch (sharpErr: any) {
      console.warn('[OrderRoutes] Sharp optimization warning, falling back to original client image:', sharpErr?.message || sharpErr);
      // If sharp failed because the input was not a valid image
      if (sharpErr?.message?.includes('unsupported') || sharpErr?.message?.includes('Input buffer')) {
        return res.status(400).json({ error: 'File gambar yang dipilih tidak valid atau rusak. Silakan pilih foto screenshot yang sah.' });
      }
    }
  }

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
    res.json(updated);
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
