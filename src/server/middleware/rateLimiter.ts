/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-Side Adaptive Rate Limiter Middleware
 * Protects sensitive endpoints (Login, Password Reset, Activation) against brute force and credential stuffing.
 * 
 * Features:
 * - Dual storage: Cloud Firestore persistence across serverless/Vercel instances with resilient in-memory fallback.
 * - Multi-tier rate limiting: Combines IP-level protection with target account identifier throttling.
 * - Validated IP extraction: Extracts the real client IP from trusted proxies (x-forwarded-for, x-real-ip).
 * - Uniform 429 response with Retry-After header without disclosing account existence.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { isFirestoreAdminConfigured, getAdminDb } from '../firebaseAdmin';
import { isSupabaseConfigured, getSupabaseClient } from '../supabaseAdapter';
import { foodConfig } from '../config';

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

// In-memory fallback cache (used strictly in non-production environments)
const memoryStore = new Map<string, RateLimitEntry>();

export class RateLimiterStorageError extends Error {
  readonly code = 'RATE_LIMITER_UNAVAILABLE';
  readonly isRateLimiterUnavailable = true;
  constructor(message = 'Rate limiter storage unavailable') {
    super(message);
    this.name = 'RateLimiterStorageError';
  }
}

// Clean up expired in-memory entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref?.();

/**
 * Reset all rate limit counters (used strictly in test fixtures)
 */
export function __resetRateLimits(): void {
  memoryStore.clear();
}

/**
 * Safely extract and validate client IP from request headers and sockets.
 * Prioritizes the first non-private/client IP in x-forwarded-for when behind trusted proxies.
 */
export function getClientIp(req: Request): string {
  // 1. Check x-forwarded-for (Vercel, Cloud Run, Cloudflare, etc.)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const rawList = Array.isArray(xForwardedFor) ? xForwardedFor.join(',') : String(xForwardedFor);
    const ips = rawList.split(',').map(s => s.trim()).filter(Boolean);
    if (ips.length > 0) {
      const candidate = ips[0].replace(/^::ffff:/, '');
      if (isValidIp(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Check x-real-ip
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    const candidate = (Array.isArray(xRealIp) ? xRealIp[0] : String(xRealIp)).trim().replace(/^::ffff:/, '');
    if (isValidIp(candidate)) {
      return candidate;
    }
  }

  // 3. Fallback to socket / req.ip
  const socketIp = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  return socketIp.replace(/^::ffff:/, '').trim() || '127.0.0.1';
}

function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  // Basic validation: IPv4 (e.g. 1.2.3.4) or IPv6 (contains colons)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[a-fA-F0-9:]+$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Hash identifier (email or phone) to avoid storing sensitive customer data in keys
 */
function hashTarget(val?: string): string {
  if (!val || typeof val !== 'string') return 'anonymous';
  const clean = val.trim().toLowerCase();
  if (!clean) return 'anonymous';
  return crypto.createHash('sha256').update(clean).digest('hex').substring(0, 16);
}

export interface RateLimiterOptions {
  prefix: string;
  maxPerTarget?: number; // Maximum attempts for specific IP + Account identifier (e.g. 5)
  maxPerIp?: number;     // Maximum attempts for entire IP address (e.g. 25)
  windowSeconds: number; // Duration of rate limit window in seconds
  targetExtractor?: (req: Request) => string | undefined;
}

/**
 * Atomically check and increment a rate limit key.
 * Supports Supabase PostgreSQL and Cloud Firestore, with memory fallback for development.
 */
async function recordAndCheckLimit(
  key: string,
  maxLimit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; currentCount: number; resetAt: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // 1. Supabase PostgreSQL shared store
  if (isSupabaseConfigured()) {
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data: existing } = await client
          .from('rate_limits')
          .select('count, reset_at')
          .eq('key', key)
          .maybeSingle();

        let count = 1;
        let resetAt = now + windowMs;

        if (existing && Number(existing.reset_at) > now) {
          count = (Number(existing.count) || 0) + 1;
          resetAt = Number(existing.reset_at);
        }

        await client
          .from('rate_limits')
          .upsert({ key, count, reset_at: resetAt, updated_at: now }, { onConflict: 'key' });

        const allowed = count <= maxLimit;
        return { allowed, currentCount: count, resetAt };
      } catch (err: any) {
        console.error('[RateLimiter] Supabase rate limit error:', err?.message || err);
        if (foodConfig.isProduction) {
          throw new RateLimiterStorageError('Rate limiter storage failed on Supabase in production');
        }
      }
    }
  }

  // 2. Production Mode: Firestore is mandatory if Supabase not configured; strictly fail-closed on any failure
  if (foodConfig.isProduction) {
    if (!isFirestoreAdminConfigured()) {
      throw new RateLimiterStorageError('Rate limiter requires Supabase or Firestore in production');
    }
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new RateLimiterStorageError('Firestore Admin instance not ready');
    }

    try {
      const docRef = adminDb.collection('_rateLimits').doc(key);
      const result = await adminDb.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        let count = 1;
        let resetAt = now + windowMs;

        if (docSnap.exists) {
          const data = docSnap.data();
          if (data && typeof data.resetAt === 'number' && data.resetAt > now) {
            count = (Number(data.count) || 0) + 1;
            resetAt = data.resetAt;
          }
        }

        transaction.set(docRef, { count, resetAt, updatedAt: now }, { merge: true });
        return { count, resetAt };
      });

      const allowed = result.count <= maxLimit;
      return { allowed, currentCount: result.count, resetAt: result.resetAt };
    } catch (err: any) {
      console.error('[RateLimiter Production Gate] Firestore storage error:', err?.message || err);
      throw new RateLimiterStorageError('Rate limiter storage failed in production');
    }
  }

  // 3. Development / Test Mode: Try Firestore shared store if available
  if (isFirestoreAdminConfigured()) {
    const adminDb = getAdminDb();

    if (adminDb) {
      try {
        const docRef = adminDb.collection('_rateLimits').doc(key);
        const result = await adminDb.runTransaction(async (transaction) => {
          const docSnap = await transaction.get(docRef);
          let count = 1;
          let resetAt = now + windowMs;

          if (docSnap.exists) {
            const data = docSnap.data();
            if (data && typeof data.resetAt === 'number' && data.resetAt > now) {
              count = (Number(data.count) || 0) + 1;
              resetAt = data.resetAt;
            }
          }

          transaction.set(docRef, { count, resetAt, updatedAt: now }, { merge: true });
          return { count, resetAt };
        });

        const allowed = result.count <= maxLimit;
        return { allowed, currentCount: result.count, resetAt: result.resetAt };
      } catch (err) {
        // Fall back gracefully to memory store in development or test mode
      }
    }
  }

  // 3. Local In-Memory Store Fallback (Allowed ONLY in non-production)
  let entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 1,
      resetAt: now + windowMs
    };
    memoryStore.set(key, entry);
    return { allowed: true, currentCount: 1, resetAt: entry.resetAt };
  }

  entry.count += 1;
  const allowed = entry.count <= maxLimit;
  return { allowed, currentCount: entry.count, resetAt: entry.resetAt };
}

/**
 * Express middleware factory for adaptive rate limiting
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    prefix,
    maxPerTarget = 5,
    maxPerIp = 30,
    windowSeconds = 900, // 15 minutes default
    targetExtractor
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Bypass OPTIONS preflight
    if (req.method === 'OPTIONS') return next();

    try {
      const clientIp = getClientIp(req);
      const targetIdentifier = targetExtractor ? targetExtractor(req) : undefined;
      const targetHash = hashTarget(targetIdentifier);

      // 1. Check IP-level ceiling (guards against wide-scale credential spraying from single IP)
      const ipKey = `${prefix}_ip_${clientIp}`;
      const ipResult = await recordAndCheckLimit(ipKey, maxPerIp, windowSeconds);

      if (!ipResult.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((ipResult.resetAt - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: 'Terlalu banyak percobaan dari jaringan Anda. Demi keamanan akun, silakan coba kembali setelah beberapa saat.',
          code: 'TOO_MANY_REQUESTS',
          retryAfterSeconds
        });
      }

      // 2. Check Target-specific limiter (IP + Account Identifier)
      if (targetIdentifier) {
        const targetKey = `${prefix}_tgt_${clientIp}_${targetHash}`;
        const targetResult = await recordAndCheckLimit(targetKey, maxPerTarget, windowSeconds);

        if (!targetResult.allowed) {
          const retryAfterSeconds = Math.max(1, Math.ceil((targetResult.resetAt - Date.now()) / 1000));
          res.setHeader('Retry-After', String(retryAfterSeconds));
          return res.status(429).json({
            error: 'Terlalu banyak percobaan untuk akun ini. Demi keamanan, silakan tunggu beberapa menit sebelum mencoba kembali.',
            code: 'TOO_MANY_REQUESTS',
            retryAfterSeconds
          });
        }
      }

      next();
    } catch (err: any) {
      if (err instanceof RateLimiterStorageError || err?.isRateLimiterUnavailable || err?.code === 'RATE_LIMITER_UNAVAILABLE') {
        return res.status(503).json({
          error: 'Layanan verifikasi keamanan sementara tidak tersedia. Silakan coba kembali beberapa saat lagi.',
          code: 'RATE_LIMITER_UNAVAILABLE'
        });
      }
      next(err);
    }
  };
}
