/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop - Independent Authentication & Authorization Module
 * Handles token issuance, verification, and role-based access control (RBAC)
 * strictly for Tumpang Shop administrative and customer operations.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { shopEnv } from '../config/shopEnv';

export interface ShopAuthUser {
  userId: string;
  role: 'SHOP_ADMIN' | 'SHOP_CUSTOMER';
  email?: string;
  scope: 'shop';
}

declare global {
  namespace Express {
    interface Request {
      shopUser?: ShopAuthUser;
    }
  }
}

/**
 * Issue signed HMAC-SHA256 token for Shop Admin
 */
export function createShopAuthToken(user: { userId: string; email?: string; role?: 'SHOP_ADMIN' | 'SHOP_CUSTOMER' }, expiresInHours = 24): string {
  const secret = shopEnv.auth.jwtSecret;
  if (!secret || secret.length < 32) {
    throw new Error('SHOP_AUTH_SECRET belum dikonfigurasi dengan aman (minimal 32 karakter).');
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId: user.userId,
      email: user.email,
      role: user.role || 'SHOP_ADMIN',
      scope: 'shop',
      exp: Math.floor(Date.now() / 1000) + expiresInHours * 3600
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify signed token strictly against Shop secret
 */
export function verifyShopAuthToken(token: string): ShopAuthUser | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const secret = shopEnv.auth.jwtSecret;
    if (!secret) return null;

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature.length !== expectedSig.length) return null;
    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!isValid) return null;

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      scope: 'shop'
    };
  } catch {
    return null;
  }
}

/**
 * Middleware: Attach authenticated shopUser if bearer token present
 */
export function attachShopUser(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verified = verifyShopAuthToken(token);
    if (verified) {
      req.shopUser = verified;
      (req as any).user = verified; // Backwards compatibility for shared handler
    }
  }
  next();
}

/**
 * Middleware: Require valid Shop Admin token
 */
export function requireShopAdmin(req: Request, res: Response, next: NextFunction) {
  // Check req.shopUser or fallback req.user
  const user = req.shopUser || (req as any).user;

  if (!user) {
    return res.status(401).json({
      error: 'Autentikasi diperlukan. Silakan login sebagai Admin Tumpang Shop.'
    });
  }

  // Strictly enforce SHOP_ADMIN or MASTER_ADMIN role
  if (user.role !== 'SHOP_ADMIN' && user.role !== 'MASTER_ADMIN') {
    return res.status(403).json({
      error: 'Akses ditolak: Operasi ini membutuhkan hak akses Admin Tumpang Shop atau Master Admin.'
    });
  }

  next();
}
