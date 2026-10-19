/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication Routes
 * Handles secure user login, token issuance, and partner onboarding.
 * Strictly enforces valid credentials with PBKDF2 hashing and no fallback bypasses.
 */

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { foodDb } from '../db';
import { foodConfig, updateRuntimeMasterPassword } from '../config';
import { createAuthToken, verifyPassword, hashPassword, isAdminEmail, requireRole } from '../auth';

export const authRouter = Router();

/**
 * POST /api/login
 * Authenticates Admin, Merchant, or Driver credentials and issues a signed token.
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Email dan kata sandi wajib diisi.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password).trim();

  // 0. MASTER ACCOUNT (SUPER ADMIN) LOGIN
  // Unrestricted cross-portal super administrator identity: tumpanggo@gmail.com
  if (cleanUser === foodConfig.masterAccount.email) {
    const masterPass = foodConfig.masterAccount.password;
    const isMasterPassValid = Boolean(
      masterPass &&
      cleanPass.length === masterPass.length &&
      crypto.timingSafeEqual(Buffer.from(cleanPass), Buffer.from(masterPass))
    );

    if (!isMasterPassValid) {
      return res.status(401).json({ error: 'Email atau kata sandi tidak valid. Silakan periksa kembali.' });
    }

    const token = createAuthToken({
      userId: 'master-admin',
      role: 'MASTER_ADMIN',
      email: cleanUser,
      isMasterAdmin: true
    });

    foodDb.log('master-admin', `Master Account ${cleanUser} logged in with unrestricted cross-portal access`, 'MASTER_ADMIN');

    return res.json({
      token,
      role: 'MASTER_ADMIN',
      isMasterAdmin: true,
      user: {
        id: 'master-admin',
        name: 'Master Account TumpangGo',
        email: cleanUser,
        isMasterAdmin: true
      },
      availablePortals: ['ADMIN', 'MERCHANT', 'DRIVER', 'CUSTOMER', 'SHOP_ADMIN']
    });
  }

  // 1. ADMIN LOGIN
  if (role === 'ADMIN') {
    if (foodConfig.isProduction) {
      if (!foodConfig.adminPassword || foodConfig.adminPassword.length < 8) {
        return res.status(500).json({ error: 'Autentikasi admin dinonaktifkan: FOOD_ADMIN_PASSWORD belum dikonfigurasi di Environment Variables Vercel.' });
      }
      if (!foodConfig.jwtSecret || foodConfig.jwtSecret.length < 32) {
        return res.status(500).json({ error: 'Autentikasi admin dinonaktifkan: FOOD_AUTH_SECRET belum dikonfigurasi di Environment Variables Vercel.' });
      }
      if (cleanPass === 'TumpangGoAdmin#2026') {
        return res.status(401).json({ error: 'Kata sandi default ditolak pada lingkungan produksi demi keamanan. Atur FOOD_ADMIN_PASSWORD di environment variable.' });
      }
    }

    const isTargetAdmin = isAdminEmail(cleanUser);
    const isValidAdminPass = foodConfig.adminPassword && cleanPass === foodConfig.adminPassword;

    if (!isTargetAdmin || !isValidAdminPass) {
      return res.status(401).json({ error: 'Email atau kata sandi Administrator salah.' });
    }

    const token = createAuthToken({
      userId: 'admin',
      role: 'ADMIN',
      email: cleanUser
    });

    foodDb.log('admin', `Admin ${cleanUser} logged in successfully`, 'ADMIN');
    return res.json({
      token,
      role: 'ADMIN',
      user: { id: 'admin', name: 'Administrator Tumpang Go', username: cleanUser }
    });
  }

  // 2. MERCHANT LOGIN
  if (role === 'MERCHANT') {
    const merchant = foodDb.getMerchantByEmailOrPhone(username);
    if (!merchant) {
      return res.status(401).json({ error: 'Email atau No. Telepon ini tidak terdaftar sebagai Merchant Toko.' });
    }

    let isPasswordValid = false;
    if (merchant.password) {
      const { valid, needsRehash } = verifyPassword(cleanPass, merchant.password);
      isPasswordValid = valid;
      if (needsRehash) {
        foodDb.updateMerchant('SYSTEM', merchant.id, { password: hashPassword(cleanPass) }, 'MERCHANT');
      }
    } else {
      return res.status(401).json({ error: 'Akun toko belum memiliki kata sandi aktif. Silakan lakukan aktivasi akun terlebih dahulu.' });
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Kata sandi toko salah. Silakan periksa kembali.' });
    }

    const token = createAuthToken({
      userId: merchant.id,
      role: 'MERCHANT',
      email: merchant.email,
      entityId: merchant.id
    });

    foodDb.log(merchant.id, `Merchant ${merchant.name} logged in`, 'MERCHANT');
    return res.json({
      token,
      role: 'MERCHANT',
      user: { id: merchant.id, name: merchant.name, phone: merchant.phone, email: merchant.email }
    });
  }

  // 3. DRIVER LOGIN
  if (role === 'DRIVER') {
    const driver = foodDb.getDriverByEmailOrPhone(username);
    if (!driver) {
      return res.status(401).json({ error: 'No. WhatsApp atau Email ini tidak terdaftar sebagai Driver / Kurir.' });
    }

    let isDriverPassValid = false;
    if ((driver as any).password) {
      const { valid, needsRehash } = verifyPassword(cleanPass, (driver as any).password);
      isDriverPassValid = valid;
      if (needsRehash) {
        foodDb.updateDriver('SYSTEM', driver.id, { password: hashPassword(cleanPass) } as any, 'DRIVER');
      }
    } else {
      return res.status(401).json({ error: 'Akun driver belum memiliki kata sandi aktif. Silakan hubungi admin untuk aktivasi.' });
    }

    if (!isDriverPassValid) {
      return res.status(401).json({ error: 'Kata sandi driver salah. Silakan periksa kembali.' });
    }

    const token = createAuthToken({
      userId: driver.id,
      role: 'DRIVER',
      email: driver.email,
      entityId: driver.id
    });

    foodDb.log(driver.id, `Driver ${driver.name} logged in`, 'DRIVER');
    return res.json({
      token,
      role: 'DRIVER',
      user: { id: driver.id, name: driver.name, phone: driver.phone }
    });
  }

  return res.status(400).json({ error: 'Peran akun tidak dikenali.' });
});

/**
 * POST /api/merchants/register
 */
authRouter.post('/merchants/register', async (req: Request, res: Response) => {
  const { name, ownerName, phone, email, category, address, description, password } = req.body;

  if (!name || !ownerName || !phone || !password) {
    return res.status(400).json({ error: 'Mohon lengkapi Nama Toko, Nama Pemilik, No. WhatsApp, dan Kata Sandi.' });
  }

  try {
    const cleanPhone = String(phone).trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const existingMerchants = foodDb.getMerchants();
    const duplicate = existingMerchants.find(m =>
      (m.phone && m.phone === cleanPhone) ||
      (cleanEmail && m.email && m.email.toLowerCase() === cleanEmail)
    );

    if (duplicate) {
      return res.status(400).json({ error: 'No. HP/WhatsApp atau Email ini sudah terdaftar sebagai Merchant.' });
    }

    const newMerchant = await foodDb.createMerchant('SYSTEM_REGISTER', {
      name: String(name).trim(),
      ownerName: String(ownerName).trim(),
      phone: cleanPhone,
      email: cleanEmail || undefined,
      category: category || 'Nasi & Lauk',
      address: address ? String(address).trim() : 'Kecamatan Tumpang, Kabupaten Malang',
      description: description ? String(description).trim() : 'Mitra Kuliner UMKM Kecamatan Tumpang',
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=60',
      bannerImage: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=60',
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'Bank BRI',
      bankAccount: '1234567890',
      bankHolder: String(ownerName).trim(),
      active: true,
      isActivated: true,
      cookTimeEstimate: '15-30 min',
      password: String(password).trim(),
      latitude: -7.9482,
      longitude: 112.7612
    });

    const token = createAuthToken({
      userId: newMerchant.id,
      role: 'MERCHANT',
      email: newMerchant.email,
      entityId: newMerchant.id
    });

    return res.status(201).json({
      success: true,
      message: 'Pendaftaran Merchant berhasil!',
      merchant: newMerchant,
      token
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Gagal mendaftarkan toko.' });
  }
});

/**
 * POST /api/merchants/activate
 */
authRouter.post('/merchants/activate', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }

  try {
    const result = await foodDb.activateMerchant(email, password);
    if (result.success) {
      res.json({ success: true, merchant: result.merchant });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/me or /api/auth/me
 * Validates token from headers and returns current user identity, role, and master status.
 */
authRouter.get(['/me', '/auth/me'], (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ authenticated: false, error: 'Sesi belum terautentikasi atau telah kedaluwarsa.' });
  }

  const isMaster = user.role === 'MASTER_ADMIN' || (user.email && user.email.toLowerCase() === foodConfig.masterAccount.email);

  return res.json({
    authenticated: true,
    user: {
      id: user.userId,
      role: user.role,
      email: user.email,
      entityId: user.entityId,
      isMasterAdmin: Boolean(isMaster)
    },
    availablePortals: isMaster ? ['ADMIN', 'MERCHANT', 'DRIVER', 'CUSTOMER', 'SHOP_ADMIN'] : [user.role]
  });
});

/**
 * POST /api/master/rotate-password or /api/auth/master/rotate-password
 * Allows the Master Admin to rotate the runtime Master Account password securely.
 */
authRouter.post(['/master/rotate-password', '/auth/master/rotate-password'], requireRole(['MASTER_ADMIN']), (req: Request, res: Response) => {
  const { newPassword, currentPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return res.status(400).json({ error: 'Kata sandi baru minimal harus terdiri dari 8 karakter.' });
  }

  const cleanCurrent = String(currentPassword || '').trim();
  const masterPass = foodConfig.masterAccount.password;
  const isCurrentValid = Boolean(
    masterPass &&
    cleanCurrent.length === masterPass.length &&
    crypto.timingSafeEqual(Buffer.from(cleanCurrent), Buffer.from(masterPass))
  );

  if (!isCurrentValid) {
    return res.status(401).json({ error: 'Kata sandi saat ini tidak cocok.' });
  }

  updateRuntimeMasterPassword(newPassword.trim());
  foodDb.log('master-admin', 'Master Account password rotated successfully', 'MASTER_ADMIN');

  return res.json({ success: true, message: 'Kata sandi Master Account berhasil diperbarui.' });
});

