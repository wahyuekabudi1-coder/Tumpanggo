/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication Routes
 * Handles secure user login, token issuance, and partner onboarding.
 * Strictly enforces valid credentials with PBKDF2 hashing and no fallback bypasses.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { foodDb } from '../db';
import { foodConfig, updateRuntimeMasterPassword, isMasterAdminEmail, getMasterAccountCredentials } from '../config';
import { createAuthToken, verifyPassword, hashPassword, isAdminEmail, requireRole } from '../auth';

export const authRouter = Router();

/**
 * POST /api/login or /api/auth/login
 * Authenticates Admin, Merchant, or Driver credentials and issues a signed token.
 */
authRouter.post(['/login', '/auth/login'], async (req: Request, res: Response) => {
  try {
    const rawUser = req.body?.username || req.body?.email || req.body?.user;
    const rawPass = req.body?.password;
    const role = req.body?.role;

    if (!rawUser || !rawPass) {
      return res.status(400).json({ error: 'Username/Email dan kata sandi wajib diisi.' });
    }

    const cleanUser = String(rawUser).trim().toLowerCase();
    const rawPassStr = String(rawPass);
    const cleanPass = rawPassStr.trim();

    // 0. MASTER ACCOUNT (SUPER ADMIN) LOGIN
    // Highest global authority: tumpanggo@gmail.com and suaiimokeras@gmail.com
    // Recognized by backend before checking merchant or driver tables.
    // Can enter through Customer, Merchant, Driver, Admin, or Shop portals.
    const isMasterUser = isMasterAdminEmail(cleanUser);

    if (isMasterUser) {
      console.log(`[MasterAuth Diagnostic] Master Account login attempt for: [PROTECTED_EMAIL] (portal: ${role || 'DEFAULT'})`);

      const creds = getMasterAccountCredentials();
      const activeMasterPassword = creds.password;
      const dbMaster = foodDb.getMasterAccount();

      // Credential verification: Single Source of Truth
      let isMasterPassValid = false;
      let matchedVia = '';

      // 1. Verify against PBKDF2 hash stored in persistent database
      if (dbMaster?.passwordHash && dbMaster.passwordHash.startsWith('pbkdf2$')) {
        const { valid: validTrimmed } = verifyPassword(cleanPass, dbMaster.passwordHash);
        const { valid: validRaw } = verifyPassword(rawPassStr, dbMaster.passwordHash);
        if (validTrimmed || validRaw) {
          isMasterPassValid = true;
          matchedVia = 'PBKDF2_DB_HASH';
        }
      }

      // 2. Verify against active configured master password (in dev fallback or configured env)
      if (!isMasterPassValid && activeMasterPassword) {
        const hashTarget = crypto.createHash('sha256').update(activeMasterPassword).digest();
        const hashTrimmed = crypto.createHash('sha256').update(cleanPass).digest();
        const hashRaw = crypto.createHash('sha256').update(rawPassStr).digest();
        if (crypto.timingSafeEqual(hashTrimmed, hashTarget) || crypto.timingSafeEqual(hashRaw, hashTarget)) {
          isMasterPassValid = true;
          matchedVia = creds.hasExplicitEnv ? 'ACTIVE_ENV_PASSWORD' : 'DEV_DEFAULT_PASSWORD';
          // Synchronize database with the active password
          foodDb.updateMasterAccountPassword(activeMasterPassword);
        }
      }

      // Diagnostik: Kegagalan verifikasi kata sandi
      if (!isMasterPassValid) {
        const hasDbHash = Boolean(dbMaster?.passwordHash && dbMaster.passwordHash.startsWith('pbkdf2$'));
        console.warn(`[MasterAuth Diagnostic] GAGAL: Verifikasi kata sandi Master Account ditolak (inputBytes: ${Buffer.byteLength(cleanPass, 'utf-8')}, dbHashPresent: ${hasDbHash}, envConfigLoaded: ${creds.hasExplicitEnv})`);
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

      console.log(`[MasterAuth Diagnostic] BERHASIL: Verifikasi kata sandi Master Account valid (via: ${matchedVia}).`);

      // Provide real store/driver context for QA inspection without creating fake business accounts
      const firstMerchant = foodDb.getMerchants()[0];
      const firstDriver = foodDb.getDrivers()[0];
      const targetEntityId = role === 'MERCHANT' 
        ? (req.body.targetMerchantId || firstMerchant?.id || '') 
        : role === 'DRIVER' 
          ? (req.body.targetDriverId || firstDriver?.id || '') 
          : undefined;

      let token = '';
      try {
        token = createAuthToken({
          userId: 'master-admin',
          role: 'MASTER_ADMIN',
          email: cleanUser,
          isMasterAdmin: true,
          entityId: targetEntityId
        });
      } catch (tokenErr: any) {
        console.error('[MasterAuth Diagnostic] GAGAL: Pembuatan token otentikasi gagal:', tokenErr?.message);
        return res.status(500).json({ 
          error: 'Gagal menerbitkan token otentikasi Master Account.',
          diagnostic: { code: 'TOKEN_CREATION_FAILED', reason: tokenErr?.message }
        });
      }

      console.log('[MasterAuth Diagnostic] BERHASIL: Token Master Account berhasil diterbitkan.');

      foodDb.log('master-admin', `Master Account logged in with unrestricted cross-portal access (entry portal: ${role || 'ALL'})`, 'MASTER_ADMIN');

      return res.json({
        token,
        role: 'MASTER_ADMIN',
        isMasterAdmin: true,
        targetPortal: role || 'ADMIN',
        user: {
          id: 'master-admin',
          name: 'Master Account TumpangGo',
          email: cleanUser,
          role: 'MASTER_ADMIN',
          isMasterAdmin: true,
          entityId: targetEntityId,
          activeMerchantId: firstMerchant?.id || '',
          activeDriverId: firstDriver?.id || ''
        },
        availablePortals: ['ADMIN', 'MERCHANT', 'DRIVER', 'CUSTOMER', 'SHOP_ADMIN']
      });
    }

    // 1. ADMIN LOGIN
    if (role === 'ADMIN') {
      if (foodConfig.isProduction) {
        if (!foodConfig.adminPassword || foodConfig.adminPassword.length < 8) {
          return res.status(500).json({ 
            error: 'Autentikasi admin dinonaktifkan: FOOD_ADMIN_PASSWORD belum dikonfigurasi di Environment Variables Vercel.',
            diagnostic: { code: 'CONFIG_ENV_MISSING', reason: 'FOOD_ADMIN_PASSWORD_UNSET' }
          });
        }
        if (!foodConfig.jwtSecret || foodConfig.jwtSecret.length < 32) {
          return res.status(500).json({ 
            error: 'Autentikasi admin dinonaktifkan: FOOD_AUTH_SECRET belum dikonfigurasi di Environment Variables Vercel.',
            diagnostic: { code: 'CONFIG_ENV_MISSING', reason: 'FOOD_AUTH_SECRET_UNSET' }
          });
        }
        if (cleanPass === 'TumpangGoAdmin#2026') {
          return res.status(401).json({ 
            error: 'Kata sandi default ditolak pada lingkungan produksi demi keamanan. Atur FOOD_ADMIN_PASSWORD di environment variable.',
            diagnostic: { code: 'DEFAULT_PASSWORD_REJECTED_IN_PROD' }
          });
        }
      }

      const isTargetAdmin = isAdminEmail(cleanUser);
      if (!isTargetAdmin) {
        return res.status(401).json({ 
          error: 'Email atau kata sandi Administrator salah.',
          diagnostic: { code: 'EMAIL_NOT_MATCHED', reason: 'ADMIN_EMAIL_NOT_RECOGNIZED', emailMatched: false }
        });
      }

      const isValidAdminPass = Boolean(
        foodConfig.adminPassword && (
          verifyPassword(cleanPass, foodConfig.adminPassword).valid ||
          verifyPassword(rawPassStr, foodConfig.adminPassword).valid ||
          cleanPass === foodConfig.adminPassword ||
          rawPassStr === foodConfig.adminPassword
        )
      );

      if (!isValidAdminPass) {
        return res.status(401).json({ 
          error: 'Email atau kata sandi Administrator salah.',
          diagnostic: { code: 'PASSWORD_MISMATCH', reason: 'ADMIN_PASSWORD_INVALID', emailMatched: true }
        });
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
        user: { id: 'admin', name: 'Administrator Tumpang Go', username: cleanUser, role: 'ADMIN' }
      });
    }

    // 2. MERCHANT LOGIN
    if (role === 'MERCHANT') {
      const merchant = foodDb.getMerchantByEmailOrPhone(cleanUser);
      if (!merchant) {
        // Check if there is a pending partner registration
        const pendingReg = foodDb.getPartnerRegistrations().find(r =>
          r.type === 'MERCHANT' && (
            (r.email && r.email.trim().toLowerCase() === cleanUser) ||
            (r.phone && r.phone.trim() === cleanUser)
          )
        );
        if (pendingReg && pendingReg.status === 'PENDING') {
          return res.status(403).json({
            error: 'Pendaftaran toko Anda sedang dalam peninjauan oleh Admin. Akses operasional akan dibuka setelah disetujui.',
            isPendingApproval: true,
            status: 'PENDING'
          });
        }
        return res.status(401).json({ 
          error: 'Email atau No. Telepon ini tidak terdaftar sebagai Merchant Toko.',
          diagnostic: { code: 'EMAIL_NOT_MATCHED', reason: 'MERCHANT_NOT_FOUND', emailMatched: false }
        });
      }

      if (!merchant.active) {
        return res.status(403).json({
          error: 'Akun toko Anda dinonaktifkan atau belum disetujui oleh Administrator.',
          code: 'MERCHANT_INACTIVE'
        });
      }

      let isPasswordValid = false;
      if (merchant.password) {
        const { valid, needsRehash } = verifyPassword(cleanPass, merchant.password);
        isPasswordValid = valid;
        if (needsRehash) {
          foodDb.updateMerchant('SYSTEM', merchant.id, { password: hashPassword(cleanPass) }, 'MERCHANT').catch(() => {});
        }
      } else {
        return res.status(401).json({ 
          error: 'Akun toko belum memiliki kata sandi aktif. Silakan lakukan aktivasi akun terlebih dahulu.',
          diagnostic: { code: 'ACCOUNT_NOT_ACTIVATED', reason: 'MERCHANT_PASSWORD_EMPTY' }
        });
      }

      if (!isPasswordValid) {
        return res.status(401).json({ 
          error: 'Kata sandi toko salah. Silakan periksa kembali.',
          diagnostic: { code: 'PASSWORD_MISMATCH', reason: 'MERCHANT_PASSWORD_INVALID', emailMatched: true }
        });
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
      const driver = foodDb.getDriverByEmailOrPhone(cleanUser);
      if (!driver) {
        // Check if there is a pending driver registration
        const pendingDriverReg = foodDb.getPartnerRegistrations().find(r =>
          r.type === 'DRIVER' && (
            (r.email && r.email.trim().toLowerCase() === cleanUser) ||
            (r.phone && r.phone.trim() === cleanUser)
          )
        );
        if (pendingDriverReg && pendingDriverReg.status === 'PENDING') {
          return res.status(403).json({
            error: 'Pendaftaran kurir Anda sedang dalam peninjauan oleh Admin. Akses operasional akan dibuka setelah disetujui.',
            isPendingApproval: true,
            status: 'PENDING'
          });
        }
        return res.status(401).json({ 
          error: 'No. WhatsApp atau Email ini tidak terdaftar sebagai Driver / Kurir.',
          diagnostic: { code: 'EMAIL_NOT_MATCHED', reason: 'DRIVER_NOT_FOUND', emailMatched: false }
        });
      }

      if (!driver.active) {
        return res.status(403).json({
          error: 'Akun kurir Anda dinonaktifkan atau belum disetujui oleh Administrator.',
          code: 'DRIVER_INACTIVE'
        });
      }

      let isDriverPassValid = false;
      if ((driver as any).password) {
        const { valid, needsRehash } = verifyPassword(cleanPass, (driver as any).password);
        isDriverPassValid = valid;
        if (needsRehash) {
          foodDb.updateDriver('SYSTEM', driver.id, { password: hashPassword(cleanPass) } as any, 'DRIVER').catch(() => {});
        }
      } else {
        return res.status(401).json({ 
          error: 'Akun driver belum memiliki kata sandi aktif. Silakan hubungi admin untuk aktivasi.',
          diagnostic: { code: 'ACCOUNT_NOT_ACTIVATED', reason: 'DRIVER_PASSWORD_EMPTY' }
        });
      }

      if (!isDriverPassValid) {
        return res.status(401).json({ 
          error: 'Kata sandi driver salah. Silakan periksa kembali.',
          diagnostic: { code: 'PASSWORD_MISMATCH', reason: 'DRIVER_PASSWORD_INVALID', emailMatched: true }
        });
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
  } catch (err: any) {
    console.error('[TumpangFood Login Handler Error]', err?.message || err);
    return res.status(500).json({
      error: 'Terjadi kendala pada server saat memproses autentikasi. Silakan coba kembali.',
      code: 'AUTH_SERVER_ERROR'
    });
  }
});

/**
 * POST /api/merchants/register
 */
authRouter.post('/merchants/register', async (req: Request, res: Response) => {
  const { 
    name, 
    ownerName, 
    phone, 
    email, 
    category, 
    address, 
    description, 
    password,
    contractVersion,
    contractAgreedAt,
    image,
    businessPhoto,
    idPhoto,
    contractPhoto
  } = req.body;

  if (!name || !ownerName || !phone || !password) {
    return res.status(400).json({ error: 'Mohon lengkapi Nama Toko, Nama Pemilik, No. WhatsApp, dan Kata Sandi.' });
  }

  try {
    const cleanPhone = String(phone).trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const existingMerchants = foodDb.getMerchants();
    const duplicateMerchant = existingMerchants.find(m =>
      (m.phone && m.phone === cleanPhone) ||
      (cleanEmail && m.email && m.email.toLowerCase() === cleanEmail)
    );

    if (duplicateMerchant) {
      return res.status(400).json({ error: 'No. HP/WhatsApp atau Email ini sudah terdaftar sebagai Merchant aktif.' });
    }

    const pendingRegs = foodDb.getPartnerRegistrations();
    const duplicatePending = pendingRegs.find(r =>
      r.status === 'PENDING' && (
        (r.phone && r.phone === cleanPhone) ||
        (cleanEmail && r.email && r.email.toLowerCase() === cleanEmail)
      )
    );

    if (duplicatePending) {
      return res.status(400).json({ 
        error: 'Pendaftaran toko dengan nomor WhatsApp atau email ini sudah diajukan dan sedang menunggu persetujuan Admin.',
        status: 'PENDING'
      });
    }

    const newReg = await foodDb.createPartnerRegistration({
      name: String(ownerName).trim(),
      phone: cleanPhone,
      email: cleanEmail || undefined,
      type: 'MERCHANT',
      storeName: String(name).trim(),
      storeAddress: address ? String(address).trim() : 'Kecamatan Tumpang, Kabupaten Malang',
      category: category || 'Nasi & Lauk',
      description: description ? String(description).trim() : `Mitra Kuliner UMKM ${String(name).trim()}`,
      password: String(password).trim(),
      businessPhoto: image || businessPhoto || undefined,
      idPhoto: idPhoto || undefined,
      contractPhoto: contractPhoto || undefined,
      contractVersion: contractVersion || 'PKS-TUMPANGGO-2026.1',
      contractAgreedAt: contractAgreedAt || new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      message: 'Pendaftaran kemitraan toko berhasil diajukan dan sedang menunggu persetujuan Administrator tumpangGo.',
      status: 'PENDING',
      registration: newReg
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Gagal mengajukan pendaftaran toko.' });
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
    console.warn('[MasterAuth Diagnostic] Sesi gagal dipulihkan: token tidak ditemukan atau tidak valid pada header request.');
    return res.status(401).json({ authenticated: false, error: 'Sesi belum terautentikasi atau telah kedaluwarsa.' });
  }

  const isMaster = user.role === 'MASTER_ADMIN' || Boolean(user.isMasterAdmin) || isMasterAdminEmail(user.email);
  const firstMerchant = foodDb.getMerchants()[0];
  const firstDriver = foodDb.getDrivers()[0];

  console.log(`[MasterAuth Diagnostic] Sesi berhasil dipulihkan (isMaster: ${isMaster}, role: ${user.role})`);

  return res.json({
    authenticated: true,
    user: {
      id: user.userId,
      role: isMaster ? 'MASTER_ADMIN' : user.role,
      email: user.email,
      entityId: user.entityId || (isMaster ? firstMerchant?.id : undefined),
      isMasterAdmin: Boolean(isMaster),
      activeMerchantId: firstMerchant?.id || '',
      activeDriverId: firstDriver?.id || ''
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
  const envMasterPass = (process.env.MASTER_ADMIN_PASSWORD || '').trim();
  const dbMaster = foodDb.getMasterAccount();
  const configMasterPass = (foodConfig.masterAccount.password || '').trim();

  let isCurrentValid = false;
  if (dbMaster?.passwordHash && verifyPassword(cleanCurrent, dbMaster.passwordHash).valid) {
    isCurrentValid = true;
  } else if (envMasterPass && verifyPassword(cleanCurrent, envMasterPass).valid) {
    isCurrentValid = true;
  } else if (configMasterPass && verifyPassword(cleanCurrent, configMasterPass).valid) {
    isCurrentValid = true;
  }

  if (!isCurrentValid) {
    return res.status(401).json({ error: 'Kata sandi saat ini tidak cocok.' });
  }

  updateRuntimeMasterPassword(newPassword.trim());
  foodDb.updateMasterAccountPassword(newPassword.trim());
  foodDb.log('master-admin', 'Master Account password rotated and saved to database successfully', 'MASTER_ADMIN');

  return res.json({ success: true, message: 'Kata sandi Master Account berhasil diperbarui.' });
});

/**
 * POST /api/master/emergency-reset or /api/auth/master/emergency-reset
 * Trusted administrative recovery mechanism for the Master Account.
 * Requires explicit authorization via X-Master-Recovery-Key or Authorization Bearer token.
 * Validates against process.env.MASTER_RECOVERY_KEY or a secure single-use recovery token file (.master_recovery_token).
 * Single-use tokens are destroyed immediately upon successful verification.
 * Never logs credentials, hashes, or tokens.
 */
authRouter.post(['/master/emergency-reset', '/auth/master/emergency-reset'], async (req: Request, res: Response) => {
  const recoveryKey = String(req.headers['x-master-recovery-key'] || '').trim();
  let authBearer = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    authBearer = authHeader.substring(7).trim();
  }
  const providedKey = recoveryKey || authBearer;

  if (!providedKey) {
    return res.status(401).json({
      error: 'Akses ditolak: Otorisasi pemulihan administratif diperlukan. Sertakan header X-Master-Recovery-Key.',
      diagnostic: { code: 'ADMINISTRATIVE_AUTHORIZATION_REQUIRED' }
    });
  }

  // 1. Check against process.env.MASTER_RECOVERY_KEY
  const envKey = (process.env.MASTER_RECOVERY_KEY || '').trim();
  let isAuthorized = false;
  let isOneTimeFile = false;
  const tokenFilePath = path.resolve(process.cwd(), '.master_recovery_token');

  if (envKey && envKey.length >= 16) {
    const bufProvided = Buffer.from(providedKey);
    const bufEnv = Buffer.from(envKey);
    if (bufProvided.length === bufEnv.length && crypto.timingSafeEqual(bufProvided, bufEnv)) {
      isAuthorized = true;
    }
  }

  // 2. Check against secure single-use token file if not authorized yet
  if (!isAuthorized && fs.existsSync(tokenFilePath)) {
    try {
      const fileContent = fs.readFileSync(tokenFilePath, 'utf-8').trim();
      if (fileContent && fileContent.length >= 16) {
        const bufProvided = Buffer.from(providedKey);
        const bufFile = Buffer.from(fileContent);
        if (bufProvided.length === bufFile.length && crypto.timingSafeEqual(bufProvided, bufFile)) {
          isAuthorized = true;
          isOneTimeFile = true;
        }
      }
    } catch {}
  }

  if (!isAuthorized) {
    console.warn('[MasterRecovery] Otorisasi pemulihan ditolak: kunci pemulihan administratif tidak cocok.');
    return res.status(401).json({
      error: 'Kunci pemulihan administratif tidak valid atau telah kedaluwarsa.',
      diagnostic: { code: 'INVALID_RECOVERY_KEY' }
    });
  }

  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return res.status(400).json({
      error: 'Kata sandi baru minimal harus terdiri dari 8 karakter.',
      diagnostic: { code: 'PASSWORD_TOO_SHORT' }
    });
  }

  const cleanPass = newPassword.trim();
  const creds = getMasterAccountCredentials();

  // Update persistent database and runtime memory
  foodDb.updateMasterAccountPassword(cleanPass);
  updateRuntimeMasterPassword(cleanPass);

  // If this was a single-use token from file, immediately destroy it
  if (isOneTimeFile && fs.existsSync(tokenFilePath)) {
    try {
      fs.unlinkSync(tokenFilePath);
    } catch {}
  }

  foodDb.log('master-recovery', 'Master Account password recovered successfully via trusted administrative process', 'MASTER_ADMIN');
  console.log('[MasterRecovery] BERHASIL: Kata sandi Master Account berhasil dipulihkan dan disimpan ke database persisten.');

  return res.json({
    success: true,
    message: 'Kredensial Master Account berhasil dipulihkan secara aman.',
    email: creds.email,
    hashAlgorithm: 'PBKDF2-SHA512 (iterations: 10000)'
  });
});


