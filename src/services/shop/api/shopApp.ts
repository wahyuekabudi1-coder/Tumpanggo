/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop - Standalone Backend Application
 * Isolated Express microservice application for Tumpang Shop marketplace.
 * Operates with its own routing, authentication, business logic, and database.
 */

import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import { shopDb } from '../database/shopDatabase';
import { shopEnv } from '../config/shopEnv';
import { createShopAuthToken, attachShopUser, requireShopAdmin } from './shopAuth';
import { 
  ShopPaymentStatus, ShopOrderStatus, ShopShipmentStatus 
} from '../../../types/shop';
import { ArtoPayService } from '../../../lib/artopay';
import { isMasterAdminEmail, getMasterAccountCredentials } from '../../../server/config';
import { verifyPassword } from '../../../server/auth';
import { foodDb } from '../../../server/db';

export const shopApp = express();

// 1. Independent Middleware
shopApp.use(express.json({ limit: '15mb' }));
shopApp.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Request logging for Shop Microservice
shopApp.use((req: any, res, next) => {
  const reqId = req.headers['x-request-id'] || 'shop_' + Math.random().toString(36).substring(2, 9);
  req.id = String(reqId);
  res.setHeader('X-Shop-Request-Id', req.id);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const logFn = status >= 500 ? console.error : (status >= 400 ? console.warn : console.log);
    logFn(`[SHOP-API] [${req.id}] ${req.method} ${req.originalUrl || req.url} -> ${status} (${duration}ms)`);
  });
  next();
});

// Initialize Shop Database safely in background on startup (no per-request blocking)
shopDb.ensureInitialized().catch((err: any) => {
  console.warn('[Shop Database Startup Init Warning]', err?.message || err);
});

// Attach authenticated Shop user
shopApp.use(attachShopUser);

// Router defining all Shop endpoints
const router = express.Router();

export function handleShopError(res: Response, err: any, defaultMessage: string) {
  const isStorage = Boolean(
    err?.isStorageError || 
    err?.code === 'STORAGE_PERSISTENCE_FAILED' || 
    err?.name === 'ShopStorageError' ||
    err?.message?.includes('PostgreSQL')
  );
  const status = isStorage ? 503 : (typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 400);
  res.status(status).json({
    error: err?.message || defaultMessage,
    code: err?.code || (isStorage ? 'STORAGE_PERSISTENCE_FAILED' : 'INVALID_REQUEST'),
    isStorageError: isStorage
  });
}

// ==========================================
// 1. HEALTH & METRICS
// ==========================================
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const status = await shopDb.getStorageStatus();
    const isDegraded = status.storageMode === 'degraded_sql_connection_failed';
    res.status(isDegraded ? 503 : 200).json({
      service: 'tumpang-shop-service',
      status: isDegraded ? 'degraded' : 'healthy',
      database: status,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      service: 'tumpang-shop-service',
      status: 'error',
      error: err?.message || 'Gagal memeriksa kesehatan service shop.'
    });
  }
});

// ==========================================
// 2. AUTHENTICATION (SHOP ADMIN ONLY)
// ==========================================
router.post(['/auth/login', '/login'], (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const targetUser = (username || email || '').trim().toLowerCase();
  const rawPassStr = String(password || '');
  const targetPass = rawPassStr.trim();

  if (!targetUser || !targetPass) {
    return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
  }

  if (shopEnv.isProduction) {
    if (!shopEnv.auth.adminPassword || shopEnv.auth.adminPassword.length < 8) {
      return res.status(500).json({ 
        error: 'Autentikasi Shop Admin dinonaktifkan: SHOP_ADMIN_PASSWORD belum dikonfigurasi di Environment Variables.',
        diagnostic: { code: 'CONFIG_ENV_MISSING', reason: 'SHOP_ADMIN_PASSWORD_UNSET' }
      });
    }
    if (!shopEnv.auth.jwtSecret || shopEnv.auth.jwtSecret.length < 32) {
      return res.status(500).json({ 
        error: 'Autentikasi Shop Admin dinonaktifkan: SHOP_AUTH_SECRET belum dikonfigurasi di Environment Variables.',
        diagnostic: { code: 'CONFIG_ENV_MISSING', reason: 'SHOP_AUTH_SECRET_UNSET' }
      });
    }
    if (targetPass === 'TumpangShopAdmin#2026') {
      return res.status(401).json({ 
        error: 'Kata sandi default ditolak pada lingkungan produksi demi keamanan. Atur SHOP_ADMIN_PASSWORD di environment variable.',
        diagnostic: { code: 'DEFAULT_PASSWORD_REJECTED_IN_PROD' }
      });
    }
  }

  // Master Account Cross-Portal Login
  const isMasterUser = isMasterAdminEmail(targetUser);
  if (isMasterUser) {
    const creds = getMasterAccountCredentials();
    const activeMasterPassword = creds.password;
    const dbMaster = foodDb.getMasterAccount();
    let isMasterPassValid = false;

    // 1. Verify against PBKDF2 hash stored in persistent database
    if (dbMaster?.passwordHash && dbMaster.passwordHash.startsWith('pbkdf2$')) {
      const { valid: validTrimmed } = verifyPassword(targetPass, dbMaster.passwordHash);
      const { valid: validRaw } = verifyPassword(rawPassStr, dbMaster.passwordHash);
      if (validTrimmed || validRaw) isMasterPassValid = true;
    }

    // 2. Verify against active configured master password
    if (!isMasterPassValid && activeMasterPassword) {
      const hashTarget = crypto.createHash('sha256').update(activeMasterPassword).digest();
      const hashTrimmed = crypto.createHash('sha256').update(targetPass).digest();
      const hashRaw = crypto.createHash('sha256').update(rawPassStr).digest();
      if (crypto.timingSafeEqual(hashTrimmed, hashTarget) || crypto.timingSafeEqual(hashRaw, hashTarget)) {
        isMasterPassValid = true;
        foodDb.updateMasterAccountPassword(activeMasterPassword);
      }
    }

    if (isMasterPassValid) {
      const token = createShopAuthToken({
        userId: 'master-admin',
        role: 'SHOP_ADMIN',
        email: targetUser
      });
      shopDb.logAudit('SHOP_ADMIN_LOGIN', `Master Account ${targetUser} login ke portal Shop`, 'master-admin');
      return res.json({
        token,
        role: 'SHOP_ADMIN',
        isMasterAdmin: true,
        user: {
          id: 'master-admin',
          name: 'Master Account TumpangGo',
          email: targetUser
        }
      });
    } else {
      const hasDbHash = Boolean(dbMaster?.passwordHash && dbMaster.passwordHash.startsWith('pbkdf2$'));
      return res.status(401).json({
        error: 'Email atau kata sandi tidak valid. Silakan periksa kembali.',
        diagnostic: {
          code: 'PASSWORD_MISMATCH',
          reason: hasDbHash ? 'PASSWORD_HASH_MISMATCH' : 'NO_PASSWORD_CONFIGURED',
          emailMatched: true,
          dbHashPresent: hasDbHash,
          envConfigLoaded: creds.hasExplicitEnv,
          configSource: creds.source,
          envPasswordByteLength: creds.byteLength
        }
      });
    }
  }

  const isMatchingEmail = targetUser === shopEnv.auth.adminEmail || targetUser === 'shopadmin';
  const isMatchingPassword = shopEnv.auth.adminPassword && (targetPass === shopEnv.auth.adminPassword || rawPassStr === shopEnv.auth.adminPassword);

  if (!isMatchingEmail || !isMatchingPassword) {
    return res.status(401).json({ 
      error: 'Kredensial Administrator Tumpang Shop salah. Pastikan menggunakan akun khusus Tumpang Shop.',
      diagnostic: {
        code: !isMatchingEmail ? 'EMAIL_NOT_MATCHED' : 'PASSWORD_MISMATCH',
        reason: !isMatchingEmail ? 'SHOP_ADMIN_EMAIL_NOT_RECOGNIZED' : 'SHOP_ADMIN_PASSWORD_INVALID',
        emailMatched: isMatchingEmail
      }
    });
  }

  const token = createShopAuthToken({
    userId: 'shop_admin_master',
    role: 'SHOP_ADMIN',
    email: targetUser
  });

  shopDb.logAudit('SHOP_ADMIN_LOGIN', `Admin ${targetUser} berhasil login ke portal Shop`, 'shop_admin_master');

  return res.json({
    token,
    role: 'SHOP_ADMIN',
    user: {
      id: 'shop_admin_master',
      name: 'Administrator Tumpang Shop',
      email: shopEnv.auth.adminEmail
    }
  });
});

router.get('/auth/me', requireShopAdmin, (req: Request, res: Response) => {
  return res.json({
    user: req.shopUser || (req as any).user,
    store: shopDb.getConfig().storeName
  });
});

// ==========================================
// 3. STORE CONFIGURATION
// ==========================================
router.get('/config', (_req: Request, res: Response) => {
  try {
    res.json(shopDb.getConfig());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat konfigurasi toko belanja.' });
  }
});

const handleUpdateConfig = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const updated = await shopDb.updateConfig(actor, req.body);
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal memperbarui pengaturan toko belanja.');
  }
};
router.put('/config', requireShopAdmin, handleUpdateConfig);
router.put('/admin/config', requireShopAdmin, handleUpdateConfig);

// ==========================================
// 4. CATEGORIES
// ==========================================
router.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = shopDb.getCategories().filter(c => c.isActive);
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat kategori toko belanja.' });
  }
});

router.get('/admin/categories', requireShopAdmin, (_req: Request, res: Response) => {
  res.json(shopDb.getCategories());
});

const handleCreateCategory = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const created = await shopDb.createCategory(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal membuat kategori baru.');
  }
};
router.post('/categories', requireShopAdmin, handleCreateCategory);
router.post('/admin/categories', requireShopAdmin, handleCreateCategory);

const handleUpdateCategory = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const updated = await shopDb.updateCategory(actor, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal memperbarui kategori.');
  }
};
router.put('/categories/:id', requireShopAdmin, handleUpdateCategory);
router.put('/admin/categories/:id', requireShopAdmin, handleUpdateCategory);

const handleDeleteCategory = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const success = await shopDb.deleteCategory(actor, req.params.id);
    if (!success) {
      return res.status(404).json({ error: `Kategori ${req.params.id} tidak ditemukan.` });
    }
    res.json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (err: any) {
    handleShopError(res, err, 'Gagal menghapus kategori.');
  }
};
router.delete('/categories/:id', requireShopAdmin, handleDeleteCategory);
router.delete('/admin/categories/:id', requireShopAdmin, handleDeleteCategory);

// ==========================================
// 5. PRODUCTS
// ==========================================
router.get('/products', (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string;
    let targetCatId = categoryParam;

    if (categoryParam) {
      const matchSlug = shopDb.getCategories().find(c => c.slug === categoryParam || c.id === categoryParam);
      if (matchSlug) targetCatId = matchSlug.id;
    }

    const products = shopDb.getProducts({
      categoryId: targetCatId,
      search: req.query.q as string,
      onlyActive: true
    });
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat katalog produk toko belanja.' });
  }
});

router.get('/products/:id', (req: Request, res: Response) => {
  try {
    const product = shopDb.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produk belanja tidak ditemukan.' });
    }
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal mengambil detail produk belanja.' });
  }
});

router.get('/admin/products', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const products = shopDb.getProducts({
      categoryId: req.query.category as string,
      search: req.query.q as string,
      onlyActive: false
    });
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat produk admin.' });
  }
});

const handleCreateProduct = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const created = await shopDb.createProduct(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal membuat produk baru.');
  }
};
router.post('/products', requireShopAdmin, handleCreateProduct);
router.post('/admin/products', requireShopAdmin, handleCreateProduct);

const handleUpdateProduct = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const updated = await shopDb.updateProduct(actor, req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal memperbarui produk.');
  }
};
router.put('/products/:id', requireShopAdmin, handleUpdateProduct);
router.put('/admin/products/:id', requireShopAdmin, handleUpdateProduct);

const handleDeleteProduct = async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const success = await shopDb.deleteProduct(actor, req.params.id);
    if (!success) {
      return res.status(404).json({ error: `Produk ${req.params.id} tidak ditemukan.` });
    }
    res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (err: any) {
    handleShopError(res, err, 'Gagal menghapus produk.');
  }
};
router.delete('/products/:id', requireShopAdmin, handleDeleteProduct);
router.delete('/admin/products/:id', requireShopAdmin, handleDeleteProduct);

// ==========================================
// 6. ORDERS & CHECKOUT
// ==========================================
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const newOrder = await shopDb.createOrder(req.body);
    res.status(201).json(newOrder);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal membuat pesanan belanja.');
  }
});

router.get('/orders/track/:id', async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) {
      return res.status(403).json({
        error: 'Privasi Terlindungi: Nomor WhatsApp pemesan diperlukan untuk melacak pesanan belanja.'
      });
    }

    const order = await shopDb.findOrderByNumberAndPhone(req.params.id, phone.trim());
    if (!order) {
      return res.status(404).json({
        error: 'Pesanan tidak ditemukan atau nomor WhatsApp tidak cocok dengan data pemesanan.'
      });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal melacak pesanan.' });
  }
});

router.post('/orders/lookup', async (req: Request, res: Response) => {
  try {
    const { orderNumber, customerPhone } = req.body;
    if (!orderNumber || !customerPhone) {
      return res.status(400).json({ error: 'Nomor pesanan dan nomor WhatsApp pemesan wajib diisi.' });
    }

    const order = await shopDb.findOrderByNumberAndPhone(String(orderNumber).trim(), String(customerPhone).trim());
    if (!order) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan. Periksa kembali nomor pesanan dan WhatsApp Anda.' });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal mencari pesanan.' });
  }
});

router.get('/orders/customer/:phone', (req: Request, res: Response) => {
  try {
    const phone = req.params.phone;
    if (!phone || phone.length < 8) {
      return res.status(400).json({ error: 'Nomor WhatsApp tidak valid.' });
    }
    const orders = shopDb.getOrdersByCustomerPhone(phone.trim());
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat riwayat pesanan pelanggan.' });
  }
});

router.post('/orders/:id/payment-proof', async (req: Request, res: Response) => {
  try {
    const { paymentProof, customerPhone } = req.body;
    if (!paymentProof || typeof paymentProof !== 'string' || paymentProof.trim().length === 0) {
      return res.status(400).json({ error: 'Gambar atau bukti transfer wajib dilampirkan.' });
    }

    if (customerPhone) {
      const existing = await shopDb.findOrderByNumberAndPhone(req.params.id, customerPhone);
      if (!existing) {
        return res.status(403).json({ error: 'Verifikasi gagal: Nomor telepon tidak cocok dengan pemesan.' });
      }
    }

    const updated = await shopDb.uploadPaymentProof(req.params.id, paymentProof.trim());
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal mengunggah bukti pembayaran.');
  }
});

router.get('/orders', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const paymentStatus = req.query.paymentStatus as ShopPaymentStatus;
    const orderStatus = req.query.orderStatus as ShopOrderStatus;
    const orders = shopDb.getOrders({ paymentStatus, orderStatus });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat daftar pesanan.' });
  }
});

router.post('/orders/:id/verify-payment', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const { approved, reason } = req.body;
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Status persetujuan (approved: boolean) wajib ditentukan.' });
    }

    const actor = req.shopUser?.email || 'admin_shop';
    const updated = await shopDb.verifyPayment(actor, req.params.id, approved, reason);
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal memproses verifikasi pembayaran.');
  }
});

router.patch('/orders/:id/status', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status pesanan baru wajib ditentukan.' });
    }

    const actor = req.shopUser?.email || 'admin_shop';
    const updated = await shopDb.updateOrderStatus(actor, req.params.id, status as ShopOrderStatus, reason);
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal mengubah status pesanan.');
  }
});

// ==========================================
// 7. SHIPPING & SHIPMENTS
// ==========================================
router.get('/shipping/options', (_req: Request, res: Response) => {
  try {
    const options = shopDb.getShippingOptions();
    res.json(options);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat opsi pengiriman.' });
  }
});

router.get('/shipping/track/:trackingNumber', async (req: Request, res: Response) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const phone = req.query.phone as string;

    if (!phone) {
      return res.status(403).json({
        error: 'Privasi Terlindungi: Nomor WhatsApp penerima/pemesan diperlukan untuk melacak status paket.'
      });
    }

    const shipment = shopDb.getShipmentByTrackingNumber(trackingNumber);
    if (!shipment) {
      return res.status(404).json({
        error: `Nomor resi ${trackingNumber} tidak ditemukan di sistem logistik Tumpang Shop.`
      });
    }

    const associatedOrder = await shopDb.findOrderById(shipment.orderId);
    if (!associatedOrder) {
      return res.status(404).json({ error: 'Pesanan terkait paket ini tidak ditemukan.' });
    }

    const cleanInputPhone = phone.replace(/[^0-9]/g, '');
    const cleanOrderPhone = associatedOrder.customerPhone.replace(/[^0-9]/g, '');

    const isAuthorized = cleanOrderPhone === cleanInputPhone || 
      cleanOrderPhone.endsWith(cleanInputPhone) || 
      cleanInputPhone.endsWith(cleanOrderPhone);

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Nomor WhatsApp tidak cocok dengan penerima nomor resi ini.'
      });
    }

    res.json(shipment);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal melacak nomor resi paket.' });
  }
});

router.get('/admin/shipments', requireShopAdmin, (_req: Request, res: Response) => {
  res.json(shopDb.getShipments());
});

router.get('/admin/shipments/:id', requireShopAdmin, (req: Request, res: Response) => {
  const shipment = shopDb.getShipmentById(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Data pengiriman tidak ditemukan.' });
  res.json(shipment);
});

router.get('/admin/shipments/order/:orderId', requireShopAdmin, (req: Request, res: Response) => {
  const shipment = shopDb.getShipmentByOrderId(req.params.orderId);
  if (!shipment) return res.status(404).json({ error: 'Pengiriman untuk pesanan ini belum dibuat.' });
  res.json(shipment);
});

router.post('/admin/shipments', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const actor = req.shopUser?.email || 'admin_shop';
    const created = await shopDb.createShipment(actor, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal membuat data pengiriman.');
  }
});

router.patch('/admin/shipments/:id/status', requireShopAdmin, async (req: Request, res: Response) => {
  try {
    const { status, location, description, note } = req.body;
    if (!status) return res.status(400).json({ error: 'Status pengiriman baru wajib ditentukan.' });

    const actor = req.shopUser?.email || 'admin_shop';
    const updated = await shopDb.updateShipmentStatus(actor, req.params.id, status as ShopShipmentStatus, {
      location,
      description,
      note
    });
    res.json(updated);
  } catch (err: any) {
    handleShopError(res, err, 'Gagal memperbarui status pengiriman.');
  }
});

// ==========================================
// 8. REPORTS & METRICS
// ==========================================
router.get('/reports/summary', requireShopAdmin, (_req: Request, res: Response) => {
  res.json(shopDb.getSummaryMetrics());
});

router.get('/reports/transactions', requireShopAdmin, (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const report = shopDb.getTransactionReport(startDate, endDate);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat laporan transaksi.' });
  }
});

// ==========================================
// 9. INTER-SERVICE PAYMENT ENDPOINTS (ARTOPAY)
// ==========================================
router.post('/payments/artopay/intent', async (req: Request, res: Response) => {
  try {
    const { orderId, customerPhone, clientAmount } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID wajib diisi.' });
    }

    let order = await shopDb.findOrderById(orderId);
    if (!order && customerPhone) {
      order = await shopDb.findOrderByNumberAndPhone(orderId, String(customerPhone).trim());
    }

    if (!order) {
      return res.status(404).json({ error: `Pesanan Tumpang Shop dengan ID "${orderId}" tidak ditemukan.` });
    }

    if (order.paymentStatus === ShopPaymentStatus.PAID) {
      return res.status(400).json({ error: 'Pesanan belanja ini sudah lunas.' });
    }

    if (order.paymentStatus === ShopPaymentStatus.EXPIRED || order.orderStatus === ShopOrderStatus.CANCELLED) {
      return res.status(400).json({ error: 'Pesanan belanja sudah kedaluwarsa atau dibatalkan.' });
    }

    const serverAmount = Math.round(Number(order.total));
    if (clientAmount !== undefined && Number(clientAmount) !== serverAmount) {
      return res.status(400).json({
        error: `Manipulasi nominal terdeteksi: nominal client (${clientAmount}) berbeda dengan total server (${serverAmount}).`
      });
    }

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const origin = `${proto}://${host}`;

    const intent = await ArtoPayService.createPaymentIntent({
      orderId: order.orderNumber || order.id,
      amount: serverAmount,
      currency: 'IDR',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      serviceType: 'SHOP',
      description: `Pembayaran Tumpang Shop #${order.orderNumber || order.id}`,
      expiryMinutes: 20,
      callbackUrl: `${origin}/api/artopay/webhook`,
      returnUrl: `${origin}/?page=shop&orderId=${order.orderNumber || order.id}&tab=tracking`,
      allowSdkModal: true
    });

    await shopDb.attachArtopayPayment(order.id, {
      paymentMethod: 'ARTOPAY_QRIS',
      artopayPaymentId: intent.paymentIntentId,
      artopayCheckoutUrl: intent.checkoutUrl,
      artopayStatus: 'PENDING',
      artopayExpiredAt: intent.expiresAt,
      artopayClientSecret: intent.clientSecret,
      artopayCustomerToken: intent.customerToken,
      artopayPublicKey: intent.publicKey,
      artopayOrderId: intent.orderId,
      artopaySandbox: intent.sandbox
    });

    return res.json(intent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gagal membuat payment intent ArtoPay untuk pesanan Shop.' });
  }
});

router.post('/payments/artopay/webhook-sync', async (req: Request, res: Response) => {
  try {
    const { orderId, paymentIntentId, amountPaid } = req.body;
    let order = await shopDb.findOrderById(orderId) || shopDb.getOrders().find(o => o.orderNumber === orderId || o.artopayPaymentId === paymentIntentId);

    if (!order) {
      return res.status(404).json({ error: `Pesanan Shop ${orderId} tidak ditemukan.` });
    }

    if (order.artopayPaymentId && paymentIntentId && order.artopayPaymentId !== paymentIntentId) {
      return res.status(400).json({ error: 'ID transaksi ArtoPay tidak cocok.' });
    }

    const serverTotal = Math.round(Number(order.total));
    if (amountPaid !== undefined && Math.round(Number(amountPaid)) !== serverTotal) {
      return res.status(400).json({ error: `Nominal bayar tidak cocok dengan total pesanan server.` });
    }

    await shopDb.verifyPayment('SYSTEM_ARTOPAY_INTERSERVICE', order.id, true);
    await shopDb.attachArtopayPayment(order.id, {
      artopayStatus: 'SUCCESS',
      artopayPaidAt: new Date().toISOString()
    });

    shopDb.logAudit('INTERSERVICE_PAYMENT_SYNC', `Webhook pembayaran disinkronisasi untuk #${order.orderNumber}`, 'SYSTEM');
    return res.json({ success: true, orderId: order.id, status: 'PAID' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Gagal sinkronisasi pembayaran inter-service.' });
  }
});

// Dual mounting: router mounted at root '/' (for sub-app usage) and at '/api/shop' (for standalone dev)
shopApp.use('/', router);
shopApp.use('/api/shop', router);

// Error handling
shopApp.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Shop App Unhandled Error]', err);
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: err.message || 'Terjadi kesalahan pada backend Tumpang Shop.'
  });
});
