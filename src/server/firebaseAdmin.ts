/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Firebase Admin SDK Module
 * Server-side trusted administrative database client.
 * Implements IAM credential loading, custom database targeting, and atomic transactions.
 * Strict zero-ADC enforcement on serverless environments to prevent "Could not load the default credentials".
 * Granular diagnostics for missing keys, JSON parse errors, project mismatches, IAM denials, and timeouts.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as admin from 'firebase-admin';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { foodConfig } from './config';

/**
 * Safely compresses base64 image data URIs server-side using sharp without replacing with stock photos.
 */
async function compressDataUriIfNeeded(dataUri: string, maxDim = 800, maxBytes = 150 * 1024): Promise<string> {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
    return dataUri;
  }
  if (dataUri.length <= maxBytes) {
    return dataUri;
  }
  try {
    const rawData = dataUri.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const inBuf = Buffer.from(rawData, 'base64');
    const outBuf = await sharp(inBuf)
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 65, progressive: true })
      .toBuffer();
    return 'data:image/jpeg;base64,' + outBuf.toString('base64');
  } catch (err) {
    console.warn('[Server Image Compression] Preserving original image buffer, sharp compression error:', err);
    return dataUri;
  }
}

export type DiagnosticReason = 
  | 'OK'
  | 'MISSING_CREDENTIALS'
  | 'INVALID_JSON'
  | 'MALFORMED_SERVICE_ACCOUNT'
  | 'PROJECT_ID_MISMATCH'
  | 'INIT_FAILED'
  | 'IAM_PERMISSION_DENIED'
  | 'DATABASE_NOT_FOUND'
  | 'INVALID_PROJECT'
  | 'NETWORK_OR_TIMEOUT'
  | 'RESOURCE_EXHAUSTED'
  | 'UNKNOWN';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let isConfiguredWithServiceAccount = false;
let isFirestoreVerified = false;
let activeProjectId = 'tumpanggo-70479';
let activeClientEmailMasked: string | null = null;

let lastDiagnosticReason: DiagnosticReason = 'MISSING_CREDENTIALS';
let lastDiagnosticDetail = 'Variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel.';
let lastRemediationStep: string | undefined = 'Tambahkan variabel lingkungan FIREBASE_SERVICE_ACCOUNT_KEY di Vercel Project Settings > Environment Variables berisi JSON Service Account dari Firebase Console.';
let lastProbeResult: { timestamp: number; result: any } | null = null;

export function getActiveProjectId(): string {
  return activeProjectId;
}

// Helper to remove undefined fields recursively for Firestore compatibility
export function removeUndefinedFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedFields);
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = removeUndefinedFields(val);
    }
  }
  return cleaned;
}

export interface ParsedServiceAccount {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  [key: string]: any;
}

export interface ParseServiceAccountResult {
  account: ParsedServiceAccount | null;
  reason: DiagnosticReason;
  error?: string;
  remediation?: string;
  projectId?: string;
  clientEmailMasked?: string;
}

/**
 * Safely sanitizes error messages so private keys, tokens, or sensitive values are never logged or exposed.
 */
function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/-----BEGIN[^-]+-----[\s\S]+?-----END[^-]+-----/g, '[PROTECTED_PRIVATE_KEY]')
    .replace(/(private_key|token|secret|password)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1: [REDACTED]')
    .replace(/(\/Users\/|\/home\/|\/var\/task\/)[^\s:]+/g, '[system-path]');
}

/**
 * Safely masks an email address (e.g. fir***@tumpanggo-70479.iam.gserviceaccount.com)
 */
export function maskClientEmail(email: string): string {
  if (!email || !email.includes('@')) return 'configured_account';
  const parts = email.split('@');
  const user = parts[0];
  const domain = parts[1];
  const visibleLen = Math.min(3, user.length);
  return `${user.substring(0, visibleLen)}***@${domain}`;
}

/**
 * Reads expected target project ID from config or environment.
 */
export function getExpectedProjectId(): string {
  let expected = (process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || '').trim();
  if (!expected) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (raw.projectId) expected = raw.projectId.trim();
      }
    } catch {}
  }
  return expected || 'tumpanggo-70479';
}

/**
 * Safely parses and normalizes Service Account credentials from environment variables.
 * Handles:
 * - Direct JSON string
 * - Surrounding single or double quotes (common in Vercel UI copy-paste)
 * - Base64 encoded JSON string
 * - Escaped newline characters in private_key (\\n -> \n)
 * - File reading fallback for GOOGLE_APPLICATION_CREDENTIALS
 * Validates project_id match against expected target project.
 * Never logs or exposes private_key.
 */
export function parseServiceAccountKey(rawInput: string, expectedProjectId?: string): ParseServiceAccountResult {
  if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
    return {
      account: null,
