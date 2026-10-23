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
