/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Configuration Module
 * Isolates runtime environment variables, database identifiers, and system defaults.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Safely read explicit .env files to preserve special characters (such as # or quotes)
// without truncation or automatic guessing
function loadEnvExplicit(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {}
}

dotenv.config();
loadEnvExplicit(path.resolve(process.cwd(), '.env'));
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
  loadEnvExplicit(localEnvPath);
}

// Determine runtime JWT Secret
let runtimeJwtSecret = (process.env.FOOD_AUTH_SECRET || '').trim();
if (!runtimeJwtSecret || runtimeJwtSecret.length < 32) {
  runtimeJwtSecret = 'dev_secret_fallback_do_not_use_in_prod_min_32_characters_long';
}

// Serverless / Vercel filesystem adaptation
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const localDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_food_db.json')
  : path.join(process.cwd(), 'tumpang_food_db.json');

function cleanEnvSecret(val?: string, fallback = ''): string {
  if (!val) return fallback;
  let clean = val.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  return clean || fallback;
}

// Production detection for credential safety
const isProductionRuntime = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV;

// Security & Authentication Configuration
let runtimeAdminPassword = cleanEnvSecret(process.env.FOOD_ADMIN_PASSWORD, isProductionRuntime ? '' : 'TumpangGoAdmin#2026');
let runtimeAdminEmail = (process.env.FOOD_ADMIN_EMAIL || 'tumpanggo@gmail.com').trim().toLowerCase();

// Master Account Configuration (Unrestricted Cross-Portal Access)
let runtimeMasterAdminEmail = (process.env.MASTER_ADMIN_EMAIL || 'tumpanggo@gmail.com').trim().toLowerCase();
let runtimeMasterAdminPassword = cleanEnvSecret(process.env.MASTER_ADMIN_PASSWORD || process.env.FOOD_ADMIN_PASSWORD, isProductionRuntime ? '' : 'TumpangGoAdmin#2026');

function resolveServerPort(): number {
  for (let i = 0; i < process.argv.length; i++) {
    if ((process.argv[i] === '--port' || process.argv[i] === '-p') && process.argv[i + 1]) {
      const parsed = parseInt(process.argv[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  if (process.env.FOOD_PORT) {
    const parsed = parseInt(process.env.FOOD_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}

// Production Strict Verification
export function validateProductionEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const secret = process.env.FOOD_AUTH_SECRET;
  if (!secret || secret.trim().length < 32) {
    errors.push('FOOD_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter.');
  } else if (secret.includes('dev_secret_fallback') || secret.includes('fallback_do_not_use')) {
    errors.push('FOOD_AUTH_SECRET tidak boleh menggunakan string fallback/development pada mode produksi.');
  }

  const adminEmail = process.env.FOOD_ADMIN_EMAIL;
  if (!adminEmail || !adminEmail.includes('@')) {
    errors.push('FOOD_ADMIN_EMAIL wajib disetel dengan alamat email yang sah.');
  }

  const adminPassword = process.env.FOOD_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.trim().length < 8) {
    errors.push('FOOD_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter.');
  } else if (adminPassword === 'TumpangGoAdmin#2026') {
    errors.push('FOOD_ADMIN_PASSWORD tidak boleh menggunakan kata sandi default/contoh ("TumpangGoAdmin#2026") pada mode produksi.');
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT;
  if (!projectId) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        projectId = raw.projectId;
      }
    } catch {}
  }
  if (!projectId || projectId.trim().length === 0) {
    errors.push('FIREBASE_PROJECT_ID wajib disetel pada lingkungan produksi.');
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount || serviceAccount.trim().length === 0) {
    errors.push('FIREBASE_SERVICE_ACCOUNT_KEY wajib disetel untuk otentikasi Firebase Admin SDK pada lingkungan produksi.');
  } else {
    // Validate format without leaking contents
    const raw = serviceAccount.trim();
    let parsed: any = null;
    try {
      let cleanRaw = raw;
      if ((cleanRaw.startsWith("'") && cleanRaw.endsWith("'")) || (cleanRaw.startsWith('"') && cleanRaw.endsWith('"'))) {
        cleanRaw = cleanRaw.slice(1, -1);
      }
      if (cleanRaw.startsWith('{')) {
        parsed = JSON.parse(cleanRaw);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(raw)) {
        parsed = JSON.parse(fs.readFileSync(raw, 'utf-8'));
      } else {
        const decoded = Buffer.from(cleanRaw, 'base64').toString('utf-8');
        if (decoded.trim().startsWith('{')) {
          parsed = JSON.parse(decoded);
        }
      }
    } catch {
      // Ignored here, checked below
    }

    if (!parsed || typeof parsed !== 'object') {
      errors.push('FIREBASE_SERVICE_ACCOUNT_KEY tidak berformat JSON atau Base64 yang valid.');
    } else if (!parsed.client_email || !parsed.private_key) {
      errors.push('FIREBASE_SERVICE_ACCOUNT_KEY wajib memiliki field "client_email" dan "private_key".');
    }
  }

  const shopSecret = process.env.SHOP_AUTH_SECRET;
  if (!shopSecret || shopSecret.trim().length < 32) {
    errors.push('SHOP_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter untuk Tumpang Shop.');
  } else if (shopSecret.includes('shop_secret_fallback') || shopSecret.includes('fallback_key')) {
    errors.push('SHOP_AUTH_SECRET tidak boleh menggunakan string fallback/development pada mode produksi.');
  }

  const shopAdminEmail = process.env.SHOP_ADMIN_EMAIL;
  if (!shopAdminEmail || !shopAdminEmail.includes('@')) {
    errors.push('SHOP_ADMIN_EMAIL wajib disetel dengan alamat email yang sah untuk Tumpang Shop.');
  }

  const shopAdminPassword = process.env.SHOP_ADMIN_PASSWORD;
  if (!shopAdminPassword || shopAdminPassword.trim().length < 8) {
    errors.push('SHOP_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter untuk Tumpang Shop.');
  } else if (shopAdminPassword === 'TumpangShopAdmin#2026') {
    errors.push('SHOP_ADMIN_PASSWORD tidak boleh menggunakan kata sandi default/contoh ("TumpangShopAdmin#2026") pada mode produksi.');
  }

  const portVal = resolveServerPort();
  if (isNaN(portVal) || portVal < 1 || portVal > 65535) {
    errors.push('PORT atau FOOD_PORT harus berupa angka port TCP yang valid (1-65535).');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

if (process.env.NODE_ENV === 'production') {
  const check = validateProductionEnvironment();
  if (!check.isValid) {
    console.warn(`[TumpangFood Security] Peringatan konfigurasi produksi:\n- ${check.errors.join('\n- ')}`);
  }
}

export const foodConfig = {
  isProduction: process.env.NODE_ENV === 'production',
  // Server port
  port: resolveServerPort(),
  host: '0.0.0.0',
  isServerless,

  // Database settings
  databaseId: (() => {
    const rawEnv = (process.env.FOOD_DATABASE_ID || '').trim();
    if (rawEnv && rawEnv !== 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c') {
      return rawEnv;
    }
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (rawConfig.firestoreDatabaseId && rawConfig.firestoreDatabaseId !== 'ai-studio-tumpangfood-99caef89-a69c-4fe1-80be-2c79f3dcb85c') {
          return rawConfig.firestoreDatabaseId;
        }
      }
    } catch {}
    return '(default)';
  })(),
  localDbFile,
  legacyDbFile: path.join(process.cwd(), 'tumpang_db.json'),
  
  // Security & Authentication
  jwtSecret: runtimeJwtSecret || 'dev_secret_fallback_do_not_use_in_prod',
  get adminEmail(): string {
    return (process.env.FOOD_ADMIN_EMAIL || runtimeAdminEmail || 'tumpanggo@gmail.com').trim().toLowerCase();
  },
  get adminPassword(): string {
    return cleanEnvSecret(process.env.FOOD_ADMIN_PASSWORD || runtimeAdminPassword, isProductionRuntime ? '' : 'TumpangGoAdmin#2026');
  },

  // Master Account (Unrestricted Cross-Portal Access)
  masterAccount: {
    get email(): string {
      return getMasterAccountCredentials().email;
    },
    get password(): string {
      return getMasterAccountCredentials().password;
    }
  },
  
  // System operational defaults
  defaults: {
    serviceFee: 2000,
    deliveryFeePerKm: 1500,
    defaultDeliveryFee: 5000,
    commissionPercent: 10,
    paymentExpiryMinutes: 10,
    qrisImage: '/qris-merchant.png',
  }
};

/**
 * Single source of truth for Master Account runtime credentials
 */
export function getMasterAccountCredentials(): { 
  email: string; 
  password: string; 
  hasExplicitEnv: boolean; 
  byteLength: number; 
  source: string; 
} {
  const email = (process.env.MASTER_ADMIN_EMAIL || runtimeMasterAdminEmail || 'tumpanggo@gmail.com').trim().toLowerCase();
  const envPass = process.env.MASTER_ADMIN_PASSWORD || process.env.FOOD_ADMIN_PASSWORD;
  const hasExplicitEnv = Boolean(envPass && envPass.length > 0);
  const password = cleanEnvSecret(envPass || runtimeMasterAdminPassword, isProductionRuntime ? '' : 'TumpangGoAdmin#2026');
  const source = hasExplicitEnv 
    ? (process.env.MASTER_ADMIN_PASSWORD ? 'PROCESS_ENV_MASTER_ADMIN_PASSWORD' : 'PROCESS_ENV_FOOD_ADMIN_PASSWORD')
    : (runtimeMasterAdminPassword ? 'RUNTIME_ROTATED_SECRET' : 'DATABASE_PERSISTED_HASH');
  return { 
    email, 
    password, 
    hasExplicitEnv, 
    byteLength: Buffer.byteLength(password, 'utf-8'),
    source 
  };
}

/**
 * Check if an email matches the configured Master Account email
 */
export function isMasterAdminEmail(email?: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === foodConfig.masterAccount.email ||
         clean === 'tumpanggo@gmail.com' ||
         clean === 'tumpanggo' ||
         clean === 'suaiimokeras@gmail.com' ||
         clean === 'suaiimokeras';
}

/**
 * Securely rotate/update runtime Master Account password
 */
export function updateRuntimeMasterPassword(newPassword: string): void {
  runtimeMasterAdminPassword = newPassword.trim();
  process.env.MASTER_ADMIN_PASSWORD = newPassword.trim();
}

// --- TUMPANG SHOP ISOLATED CONFIGURATION ---
// Re-exported from dedicated microservice configuration in src/services/shop/config/shopEnv.ts
export { shopConfig } from '../services/shop/config/shopEnv';

export function reloadEnv() {
  dotenv.config();
  loadEnvExplicit(path.resolve(process.cwd(), '.env'));
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: true });
    loadEnvExplicit(localEnvPath);
  }
}

// --- ARTOPAY UNIFIED PAYMENT GATEWAY CONFIGURATION ---
export const artopayConfig = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  get environment(): 'sandbox' | 'production' {
    const env = (process.env.ARTOPAY_ENVIRONMENT || process.env.ARTOPAY_ENV || 'sandbox').toLowerCase().trim();
    return env === 'production' ? 'production' : 'sandbox';
  },
  get apiKey(): string {
    let key = (process.env.ARTOPAY_API_KEY || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get secretKey(): string {
    let key = (process.env.ARTOPAY_SECRET_KEY || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get publicKey(): string {
    let key = (
      process.env.ARTOPAY_PUBLIC_KEY || 
      process.env.VITE_ARTOPAY_PUBLIC_KEY || 
      process.env.ARTOPAY_CLIENT_KEY || 
      process.env.VITE_ARTOPAY_CLIENT_KEY || 
      ''
    ).trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    if (key.startsWith('%') || key.includes('%VITE_') || key === 'undefined' || key === 'null') {
      return '';
    }
    return key;
  },
  get webhookSecret(): string {
    let key = (process.env.ARTOPAY_WEBHOOK_SECRET || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get businessUnitCode(): string {
    let key = (process.env.ARTOPAY_BUSINESS_UNIT_CODE || process.env.ARTOPAY_BUSINESS_UNIT || '').trim();
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1).trim();
    }
    return key;
  },
  get baseUrl(): string {
    const defaultApiUrl = this.environment === 'production'
      ? 'https://api.arto-pay.com'
      : 'https://api-sandbox.arto-pay.com';
    return (process.env.ARTOPAY_API_BASE_URL || process.env.ARTOPAY_BASE_URL || defaultApiUrl).trim();
  },
  get payBaseUrl(): string {
    const defaultPayUrl = this.environment === 'production'
      ? 'https://pay.arto-pay.com/arto-pay'
      : 'https://pay-sandbox.arto-pay.com/arto-pay';
    return (process.env.ARTOPAY_PAY_URL || defaultPayUrl).trim();
  },
  defaultExpiryMinutes: 15
};

