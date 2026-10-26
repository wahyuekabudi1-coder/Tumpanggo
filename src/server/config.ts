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
import dns from 'dns';
import dotenv from 'dotenv';

// Prioritize IPv4 DNS lookups on Node.js 18+ to prevent serverless IPv6 connection timeout / fetch failed
try {
  if (typeof (dns as any).setDefaultResultOrder === 'function') {
    (dns as any).setDefaultResultOrder('ipv4first');
  }
} catch {}

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

// Production detection for credential safety
const isProductionRuntime = process.env.NODE_ENV === 'production' && !process.env.VERCEL_DEV;

// Dynamic ephemeral development secret generated per process runtime if none provided
const ephemeralDevSecret = crypto.randomBytes(32).toString('hex');

// Determine runtime JWT Secret
let runtimeJwtSecret = (process.env.FOOD_AUTH_SECRET || '').trim();
if (!runtimeJwtSecret || runtimeJwtSecret.length < 32) {
  runtimeJwtSecret = isProductionRuntime ? '' : ephemeralDevSecret;
}

// Serverless / Vercel filesystem adaptation
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const localDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_food_db.json')
  : path.join(process.cwd(), 'tumpang_food_db.json');

export function cleanEnvSecret(val?: string, fallback = ''): string {
  if (!val) return fallback;
  // Strip control characters, carriage returns, newlines, and tabs that break Node.js HTTP header parsing
  let clean = val.replace(/[\r\n\t]/g, '').trim();
  // Strip surrounding quotes or backticks iteratively
  while (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'")) ||
    (clean.startsWith('`') && clean.endsWith('`'))
  ) {
    clean = clean.slice(1, -1).trim();
  }
  return clean || fallback;
}

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
  // If explicitly running in production container with PORT set, honor it
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  // In development and AI Studio environment, port 3000 is the required and only accessible port
  return 3000;
}

export function extractSupabaseProjectRef(val?: string): string | null {
  if (!val || typeof val !== 'string') return null;
  const clean = cleanEnvSecret(val);

  // 1. Check if string itself is a direct project ref (e.g. 20-character alphanumeric)
  if (/^[a-z0-9_-]{15,40}$/i.test(clean) && !clean.includes('.') && !clean.includes('/') && !clean.includes(':')) {
    return clean.toLowerCase();
  }

  // 2. Check for db.<ref>.supabase.co or <ref>.supabase.co in URLs
  const subMatch = clean.match(/(?:db\.)?([a-z0-9_-]{15,40})\.supabase\.co/i);
  if (subMatch && subMatch[1] && !subMatch[1].includes('project-ref') && !subMatch[1].includes('your-project')) {
    return subMatch[1].toLowerCase();
  }

  // 3. Check for postgres.<ref>@ or postgres.<ref>: (Supabase pooler URI)
  const poolerMatch = clean.match(/postgres\.([a-z0-9_-]{15,40})[:@]/i);
  if (poolerMatch && poolerMatch[1]) {
    return poolerMatch[1].toLowerCase();
  }

  // 4. JWT service_role or anon key payload ref
  const parts = clean.split('.');
  if (parts.length >= 2) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      if (payload && typeof payload.ref === 'string' && /^[a-z0-9_-]{10,40}$/i.test(payload.ref)) {
        return payload.ref.toLowerCase();
      }
    } catch {}
  }
  return null;
}

export function normalizeSupabaseUrl(raw?: string, key?: string): string {
  let url = cleanEnvSecret(raw);

  // If url is a placeholder like https://<project-ref>.supabase.co or <project-ref>
  if (url && (url.includes('<') || url.includes('>') || url.includes('[') || url.includes(']') || url.toLowerCase().includes('project-ref') || url.toLowerCase().includes('your-project'))) {
    url = '';
  }

  // If url is a postgres/postgresql connection URI, extract ref from it
  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    const extracted = extractSupabaseProjectRef(url);
    if (extracted) {
      return `https://${extracted}.supabase.co`;
    }
    url = '';
  }

  if (!url) {
    const derivedRef = extractSupabaseProjectRef(
      key || 
      process.env.SUPABASE_SERVICE_ROLE_KEY || 
      process.env.SUPABASE_SECRET_KEY || 
      process.env.SUPABASE_KEY ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL
    );
    if (derivedRef) {
      return `https://${derivedRef}.supabase.co`;
    }
    return '';
  }

  // Handle direct ref string (e.g. "epqpyieszdwyzrcbeqey")
  if (/^[a-z0-9_-]{15,40}$/i.test(url) && !url.includes('.')) {
    return `https://${url.toLowerCase()}.supabase.co`;
  }

  // If url has db.<ref>.supabase.co, strip the "db." as REST API is hosted on root domain
  url = url.replace(/^(https?:\/\/)?db\.([a-z0-9_-]+\.supabase\.co)/i, '$1$2');

  // Prepend https:// if protocol is missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    // Origin cleanly discards any sub-path (e.g. /rest/v1 or trailing slashes), giving pure canonical origin
    return parsed.origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

// Production Strict Verification
export function validateProductionEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const secret = cleanEnvSecret(process.env.FOOD_AUTH_SECRET);
  if (!secret || secret.length < 32) {
    errors.push('FOOD_AUTH_SECRET wajib disetel dan memiliki minimal 32 karakter.');
  } else if (secret.includes('dev_secret_fallback') || secret.includes('fallback_do_not_use')) {
    errors.push('FOOD_AUTH_SECRET tidak boleh menggunakan string fallback/development pada mode produksi.');
  }

  const adminEmail = (process.env.FOOD_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail || !adminEmail.includes('@')) {
    errors.push('FOOD_ADMIN_EMAIL wajib disetel dengan alamat email yang sah.');
  }

  const adminPassword = cleanEnvSecret(process.env.FOOD_ADMIN_PASSWORD);
  if (!adminPassword || adminPassword.length < 8) {
    errors.push('FOOD_ADMIN_PASSWORD wajib disetel dengan minimal 8 karakter.');
  } else if (adminPassword === 'TumpangGoAdmin#2026') {
    errors.push('FOOD_ADMIN_PASSWORD tidak boleh menggunakan kata sandi default/contoh ("TumpangGoAdmin#2026") pada mode produksi.');
  }

  const rawSupabaseKey = cleanEnvSecret(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY);
  const rawSupabaseUrl = cleanEnvSecret(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_REST_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const derivedRef = extractSupabaseProjectRef(rawSupabaseKey) || extractSupabaseProjectRef(process.env.DATABASE_URL) || extractSupabaseProjectRef(process.env.POSTGRES_URL);
  const hasSupabaseKey = Boolean(rawSupabaseKey && rawSupabaseKey.length >= 20);
  const hasSupabaseUrl = Boolean(rawSupabaseUrl || derivedRef);

  if (hasSupabaseKey || rawSupabaseUrl) {
    if (!hasSupabaseKey) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY wajib disetel pada lingkungan produksi (minimal 20 karakter).');
    }
    if (!hasSupabaseUrl) {
      errors.push('SUPABASE_URL wajib disetel pada lingkungan produksi (contoh: https://<project-ref>.supabase.co).');
    } else {
      const origRaw = process.env.SUPABASE_URL || '';
      if (origRaw.includes('<') || origRaw.includes('>') || origRaw.includes('[') || origRaw.includes(']')) {
        errors.push(`SUPABASE_URL mengandung karakter placeholder literal ("${origRaw}"). Masukkan URL proyek Supabase asli dari Supabase Dashboard -> Project Settings -> API.`);
      }

      const normalized = normalizeSupabaseUrl(rawSupabaseUrl, rawSupabaseKey);
      try {
        const parsed = new URL(normalized);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push('SUPABASE_URL wajib menggunakan protokol https://.');
        }
        if (!parsed.hostname || !parsed.hostname.includes('.')) {
          errors.push('SUPABASE_URL memiliki format hostname yang tidak sah.');
        }
      } catch {
        errors.push('SUPABASE_URL tidak berformat URL yang sah.');
      }
    }
  } else {
    // Supabase is not configured; check if Firestore fallback credentials exist
    let projectId = cleanEnvSecret(process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT);
    if (!projectId) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          projectId = cleanEnvSecret(raw.projectId);
        }
      } catch {}
    }

    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!projectId && !serviceAccount) {
      errors.push('SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY wajib disetel pada lingkungan produksi (atau FIREBASE_SERVICE_ACCOUNT_KEY).');
    } else {
      if (!projectId) {
        errors.push('FIREBASE_PROJECT_ID atau SUPABASE_URL wajib disetel pada lingkungan produksi.');
      }

      if (!serviceAccount || serviceAccount.trim().length === 0) {
        errors.push('FIREBASE_SERVICE_ACCOUNT_KEY atau SUPABASE_SERVICE_ROLE_KEY wajib disetel untuk database produksi.');
      } else {
        // Validate format without leaking contents
        const raw = serviceAccount.trim();
        let parsed: any = null;
        try {
          let cleanRaw = cleanEnvSecret(raw);
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
    }
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
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  set isProduction(val: boolean) {
    if (val) {
      process.env.NODE_ENV = 'production';
    } else {
      process.env.NODE_ENV = 'development';
    }
  },
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
  projectId: (() => {
    let pId = (process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || '').trim();
    if (!pId) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (raw.projectId) pId = raw.projectId;
        }
      } catch {}
    }
    return pId || 'tumpanggo-70479';
  })(),
  localDbFile,
  legacyDbFile: path.join(process.cwd(), 'tumpang_db.json'),
  
  // Security & Authentication
  jwtSecret: runtimeJwtSecret,
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
  
  // Supabase PostgreSQL Configuration
  supabase: {
    get url(): string {
      const key = cleanEnvSecret(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY);
      const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_REST_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
      return normalizeSupabaseUrl(raw, key);
    },
    get projectId(): string {
      const u = this.url;
      try {
        if (u) {
          const host = new URL(u).hostname;
          const sub = host.split('.')[0];
          if (sub && sub !== 'supabase' && sub !== 'db') return sub;
        }
      } catch {}
      const key = cleanEnvSecret(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY);
      return extractSupabaseProjectRef(key) || 
             extractSupabaseProjectRef(process.env.DATABASE_URL) || 
             extractSupabaseProjectRef(process.env.POSTGRES_URL) || 
             'supabase';
    },
    get serviceRoleKey(): string {
      return cleanEnvSecret(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY);
    },
    get anonKey(): string {
      return cleanEnvSecret(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    },
    get isConfigured(): boolean {
      const key = cleanEnvSecret(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY);
      const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_REST_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
      const url = normalizeSupabaseUrl(raw, key);
      return Boolean(key && key.length >= 20 && url && url.startsWith('http'));
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

export function reloadEnv() {
  dotenv.config();
  loadEnvExplicit(path.resolve(process.cwd(), '.env'));
  const localEnvPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: true });
    loadEnvExplicit(localEnvPath);
  }
}

// --- WEB PUSH VAPID CONFIGURATION ---
// Default stable VAPID keypair for resilient development & production override
const DEFAULT_VAPID_PUBLIC_KEY = 'BEuS1NHSG0NnOTTmUk3sW77YGpZVvPkiedLernPntUDsmgE1zGT5O1I3VjP0lgtsETjI2PgRxJvMTKTWoaxqYWM';
const DEFAULT_VAPID_PRIVATE_KEY = 'p100JN70gOKnd9VOPRl9HaK6ntLmZXA_VwcA9IH2B5M';

export const vapidConfig = {
  get publicKey(): string {
    return cleanEnvSecret(process.env.VAPID_PUBLIC_KEY, DEFAULT_VAPID_PUBLIC_KEY);
  },
  get privateKey(): string {
    return cleanEnvSecret(process.env.VAPID_PRIVATE_KEY, DEFAULT_VAPID_PRIVATE_KEY);
  },
  get subject(): string {
    return (process.env.VAPID_SUBJECT || 'mailto:admin@tumpanggo.com').trim();
  },
  get isConfigured(): boolean {
    return Boolean(this.publicKey && this.privateKey);
  }
};

