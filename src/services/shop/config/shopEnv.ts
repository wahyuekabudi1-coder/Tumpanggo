/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop - Independent Environment & Connection Configuration
 * Dedicated exclusively to Tumpang Shop microservice.
 * Completely decoupled from Tumpang Food and any other future services.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Safely read explicit .env files to preserve special characters
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

// Load root environment files
dotenv.config();
loadEnvExplicit(path.resolve(process.cwd(), '.env'));
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
  loadEnvExplicit(localEnvPath);
}

// Serverless / Vercel filesystem adaptation
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Dedicated database file for Tumpang Shop
const defaultShopDbFile = isServerless 
  ? path.join('/tmp', 'tumpang_shop_db.json')
  : path.join(process.cwd(), 'tumpang_shop_db.json');

// Dedicated Shop Admin credentials & JWT secret
const runtimeShopAdminEmail = (process.env.SHOP_ADMIN_EMAIL || 'shopadmin@tumpanggo.com').toLowerCase().trim();
const runtimeShopAdminPassword = (process.env.SHOP_ADMIN_PASSWORD || 'TumpangShopAdmin#2026').trim();

let runtimeShopAuthSecret = (process.env.SHOP_AUTH_SECRET || '').trim();
if (!runtimeShopAuthSecret || runtimeShopAuthSecret.length < 32) {
  runtimeShopAuthSecret = 'shop_secret_fallback_dev_min_32_characters_ok';
}

// Dedicated Port for Standalone Shop Microservice
function resolveShopPort(): number {
  if (process.env.SHOP_PORT) {
    const parsed = parseInt(process.env.SHOP_PORT, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3001; // Independent default port for standalone Shop backend
}

export interface ShopDatabaseConnectionConfig {
  type: 'file' | 'firestore' | 'sql';
  filePath: string;
  databaseUrl?: string;
  firestoreDatabaseId?: string;
  firestoreCollectionPrefix: string;
  enableCloudSync: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export const shopEnv = {
  isProduction: process.env.NODE_ENV === 'production',
  port: resolveShopPort(),
  
  // Database Configuration
  database: {
    type: (process.env.SHOP_DATABASE_TYPE || 'file') as 'file' | 'firestore' | 'sql',
    filePath: process.env.SHOP_DB_FILE ? path.resolve(process.cwd(), process.env.SHOP_DB_FILE) : defaultShopDbFile,
    databaseUrl: process.env.SHOP_DATABASE_URL || '',
    firestoreDatabaseId: process.env.SHOP_FIRESTORE_DATABASE_ID || '(default)',
    firestoreCollectionPrefix: process.env.SHOP_FIRESTORE_PREFIX || 'shop_',
    enableCloudSync: process.env.SHOP_ENABLE_CLOUD_SYNC === 'true' || process.env.NODE_ENV === 'production',
    maxRetries: 3,
    retryDelayMs: 1000
  } as ShopDatabaseConnectionConfig,

  // Authentication & Security
  auth: {
    jwtSecret: runtimeShopAuthSecret,
    adminEmail: runtimeShopAdminEmail,
    adminPassword: runtimeShopAdminPassword,
    tokenExpiryHours: 24
  },

  // Collections (Firestore / Document Store Schema)
  collections: {
    config: 'shop_config',
    categories: 'shop_categories',
    products: 'shop_products',
    orders: 'shop_orders',
    shipments: 'shop_shipments',
    auditLogs: 'shop_audit_logs',
    migrations: 'shop_migrations'
  },

  // Business Operational Defaults
  defaults: {
    storeName: 'Tumpang Shop Mart',
    storeAddress: 'Area Pasar Tumpang, Kec. Tumpang, Malang',
    storePhone: '081234567890',
    isOpen: true,
    qrisImage: '/qris-merchant.png',
    defaultDeliveryFee: 4000,
    serviceFee: 1500,
    minOrderAmount: 10000,
    paymentExpiryMinutes: 30,
  }
};

// Aliased export for legacy/drop-in compatibility
export const shopConfig = {
  isProduction: shopEnv.isProduction,
  localDbFile: shopEnv.database.filePath,
  jwtSecret: shopEnv.auth.jwtSecret,
  adminEmail: shopEnv.auth.adminEmail,
  adminPassword: shopEnv.auth.adminPassword,
  collections: shopEnv.collections,
  defaults: shopEnv.defaults,
};
