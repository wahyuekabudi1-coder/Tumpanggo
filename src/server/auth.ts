/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Authentication & RBAC Authorization Module
 * Provides password hashing, token creation/verification, and strict security middleware.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { foodConfig } from './config';

export interface AuthUser {
  userId: string;
  role: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER' | 'MASTER_ADMIN';
  email?: string;
  entityId?: string; // Merchant ID or Driver ID
  isMasterAdmin?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Hash password using PBKDF2 with random salt.
 * Output format: "pbkdf2$iterations$salt$hash"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

/**
 * Verify password against stored hash or plaintext password.
 * Returns { valid: boolean, needsRehash: boolean }
 */
export function verifyPassword(password: string, storedHash?: string): { valid: boolean; needsRehash: boolean } {
  if (!storedHash || typeof storedHash !== 'string' || !password || typeof password !== 'string') {
    return { valid: false, needsRehash: false };
  }

  try {
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 4) return { valid: false, needsRehash: false };
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const originalHash = parts[3];
      if (isNaN(iterations) || iterations < 1 || !salt || !originalHash) {
        return { valid: false, needsRehash: false };
      }
      const derived = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
      const bufDerived = Buffer.from(derived, 'hex');
      const bufOriginal = Buffer.from(originalHash, 'hex');
      if (bufDerived.length !== bufOriginal.length) {
        return { valid: false, needsRehash: false };
      }
      const valid = crypto.timingSafeEqual(bufDerived, bufOriginal);
      return { valid, needsRehash: false };
    }

    // Legacy plaintext match
    const valid = password.trim() === storedHash.trim();
    return { valid, needsRehash: valid };
  } catch (err) {
    console.warn('[TumpangFood Auth] Error during password verification:', err);
    return { valid: false, needsRehash: false };
  }
}

/**
 * Create HMAC-SHA256 signed JWT token.
 * Fails securely in production if FOOD_AUTH_SECRET is not configured or uses a fallback.
 */
export function createAuthToken(user: AuthUser, expiresInHours = 72): string {
  const secret = foodConfig.jwtSecret || (process.env.FOOD_AUTH_SECRET || '').trim();
  let effectiveSecret = secret;

  if (foodConfig.isProduction) {
    if (!secret || secret.length < 32 || secret.includes('fallback') || secret.includes('dev_secret')) {
      throw new Error('Gagal menerbitkan token: FOOD_AUTH_SECRET belum dikonfigurasi untuk lingkungan produksi (wajib minimal 32 karakter dan bukan fallback).');
    }
  } else {
    if (!effectiveSecret || effectiveSecret.length < 32) {
      effectiveSecret = 'dev_secret_fallback_do_not_use_in_prod_min_32_characters_long';
    }
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', effectiveSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify signed token and return AuthUser.
 * Rejects fallback secrets in production.
 */
export function verifyAuthToken(token: string): AuthUser | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    let isValid = false;

    // Check with food secret if secret is configured and valid for current mode
    const foodSecret = foodConfig.jwtSecret || (process.env.FOOD_AUTH_SECRET || '').trim();
    const isFoodSecretValid = Boolean(
      foodSecret && 
      foodSecret.length >= 16 && 
      (!foodConfig.isProduction || (!foodSecret.includes('fallback') && !foodSecret.includes('dev_secret')))
    );

    if (isFoodSecretValid) {
      const foodSig = crypto
        .createHmac('sha256', foodSecret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (signature.length === foodSig.length) {
        isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(foodSig));
      }
    }

    if (!isValid) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      userId: data.userId,
      role: data.role,
      email: data.email,
      entityId: data.entityId,
      isMasterAdmin: data.isMasterAdmin || data.role === 'MASTER_ADMIN'
    };
  } catch {
    return null;
  }
}

/**
 * Express middleware to authenticate token from headers.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']);
  }

  if (token) {
    const verified = verifyAuthToken(token);
    if (verified) {
      req.user = verified;
    }
  }

  next();
}

/**
 * Check if an email has administrative privileges
 */
export function isAdminEmail(email?: string): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (
    e === foodConfig.masterAccount.email ||
    e === foodConfig.adminEmail ||
    e === 'suaiimokeras@gmail.com' ||
    e === 'suaiimokeras' ||
    e === 'tumpanggo@gmail.com' ||
    e === 'tumpanggo' ||
    e === 'admin@tumpanggo.com' ||
    e === 'sawahjayagroup@gmail.com' ||
    e === 'sawahjayatrans@gmail.com' ||
    e === 'admin'
  );
}

/**
 * Strict role-based access control middleware
 */
export function requireRole(allowedRoles: Array<'ADMIN' | 'MERCHANT' | 'DRIVER' | 'CUSTOMER' | 'MASTER_ADMIN'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    }

    if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN') {
      return next(); // Admin and Master Admin have universal administrative access
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: `Akses ditolak: Peran ${user.role} tidak memiliki izin untuk tindakan ini.` });
    }

    next();
  };
}

/**
 * Restrict merchant operations strictly to the verified store owner or admin.
 * Verifies against req.user.entityId from the cryptographically signed token.
 * Master Admin has unrestricted cross-merchant management access without modifying owner identity.
 */
export function requireMerchantOwner(paramName = 'merchantId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const targetMerchantId = req.params[paramName] || req.params.merchantId || req.params.id || req.body[paramName];
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    }

    if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN' || user.isMasterAdmin) {
      return next(); // Unrestricted cross-merchant administrative access
    }

    if (user.role === 'MERCHANT') {
      const cleanTarget = String(targetMerchantId || '').trim().toLowerCase();
      const userEntity = String(user.entityId || '').trim().toLowerCase();
      const userId = String(user.userId || '').trim().toLowerCase();

      // Support 'me' alias, direct match, or strip 'merchant_' prefix
      if (cleanTarget === 'me' || cleanTarget === userEntity || cleanTarget === userId) {
        return next();
      }

      const stripPrefix = (str: string) => str.replace(/^merchant_/, '');
      if (stripPrefix(cleanTarget) === stripPrefix(userEntity) || stripPrefix(cleanTarget) === stripPrefix(userId)) {
        return next();
      }
    }

    return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki izin untuk mengakses atau memodifikasi data toko ini.' });
  };
}

/**
 * Restrict driver operations strictly to the verified driver themselves or admin.
 * Master Admin has unrestricted cross-driver oversight access without modifying driver identity.
 */
export function requireDriverSelf(paramName = 'driverId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const targetDriverId = req.params[paramName] || req.params.driverId || req.params.id || req.body[paramName];
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan. Silakan login terlebih dahulu.' });
    }

    if (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN' || user.isMasterAdmin) {
      return next(); // Unrestricted cross-driver oversight access
    }

    if (user.role === 'DRIVER' && (user.entityId === targetDriverId || user.userId === targetDriverId)) {
      return next();
    }

    return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki izin untuk tugas kurir ini.' });
  };
}
