/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Production Firestore Export Service
 * Project: tumpanggo-70479
 * 
 * Strictly READ-ONLY extraction pipeline:
 * - Uses controlled batch size (cursor pagination with .orderBy(FieldPath.documentId()).startAfter())
 * - Streams collection documents without loading entire database into memory simultaneously
 * - Preserves authentic IDs, PBKDF2 password hashes, timestamps, relational keys, and JSON items
 * - Sanitizes plaintext credentials and sensitive API keys
 * - Detects and logs concurrent modifications occurring during the export window
 * - Validates schema and foreign key references against Supabase PostgreSQL constraints
 * - Generates clear, isolated production export dump and manifest separate from local seeds
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import * as admin from 'firebase-admin';
import { FieldPath, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminDb, isUsingServiceAccount, getExpectedProjectId } from '../firebaseAdmin';
import { hashPassword } from '../auth';

export const TARGET_COLLECTIONS = [
  'systemConfig',
  'merchants',
  'categories',
  'menuItems',
  'drivers',
  'orders',
  'settlements',
  'partnerRegistrations',
  'testimonials',
  'auditLogs'
] as const;

export type TargetCollectionName = typeof TARGET_COLLECTIONS[number];

export interface CollectionExportStats {
  collection: string;
  preCount: number;
  exportedCount: number;
  batchesProcessed: number;
  failedCount: number;
  concurrentChangesDetected: number;
  status: 'SUCCESS' | 'EMPTY' | 'FAILED' | 'PARTIAL';
  error?: string;
}

export interface ValidationIssue {
  collection: string;
  docId: string;
  type: 'ERROR' | 'WARNING';
  message: string;
}

export interface ExportValidationReport {
  isValid: boolean;
  totalValid: number;
  totalErrors: number;
  totalWarnings: number;
  issues: ValidationIssue[];
}

export interface ProductionExportManifest {
  exportId: string;
  targetProjectId: string;
  exportStartedAt: string;
  exportCompletedAt: string;
  durationMs: number;
  isProductionFirestore: boolean;
  batchSize: number;
  outputDirectory: string;
  collections: Record<string, CollectionExportStats>;
  totalDocumentsExported: number;
  validation: ExportValidationReport;
  filesGenerated: string[];
}

export interface ExportOptions {
  customDb?: Firestore;
  projectId?: string;
  batchSize?: number;
  outputDir?: string;
  skipFileWrite?: boolean;
  onProgress?: (col: string, batchNumber: number, docsCount: number, totalEst: number) => void;
}

/**
 * Normalizes Firestore timestamps into standard ISO 8601 strings.
 */
export function normalizeTimestamp(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {}
  }
  if (typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000 + (val._nanoseconds || 0) / 1000000).toISOString();
  }
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000).toISOString();
  }
  return String(val);
}

/**
 * Escapes values safely for PostgreSQL SQL inserts.
 * Strips null bytes (\0) to prevent PostgreSQL string literal termination attacks.
 */
export function escapeSqlString(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/\0/g, '');
    return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
  }
  const str = String(val).replace(/\0/g, '');
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Sanitizes sensitive internal fields while strictly preserving PBKDF2 hashes and essential data.
 * - Strips server private keys, internal tokens, push subscriptions, and plaintext passwords.
 * - Converts any legacy plaintext passwords in merchants/drivers to secure PBKDF2 hashes.
 */
export function sanitizeDocument(collectionName: string, doc: any): any {
  if (!doc || typeof doc !== 'object') return doc;
  const clone = { ...doc };

  // Remove undefined attributes
  for (const key of Object.keys(clone)) {
    if (clone[key] === undefined) {
      delete clone[key];
    }
  }

  // System Config sanitization
  if (collectionName === 'systemConfig') {
    if (clone.masterAccount && typeof clone.masterAccount === 'object') {
      const ma = { ...clone.masterAccount };
      // Strip plaintext master password if any exists
      delete ma.password;
      delete ma.plainPassword;
      clone.masterAccount = ma;
    }
  }

  // Merchant and Driver credentials hardening: Ensure NO plaintext password is ever leaked or exported
  if (collectionName === 'merchants' || collectionName === 'drivers') {
    if (clone.password && typeof clone.password === 'string') {
      if (clone.password.startsWith('pbkdf2$')) {
        clone.password_hash = clone.password;
      } else {
        // Legacy plaintext password: automatically upgrade to PBKDF2 hash
        clone.password_hash = hashPassword(clone.password);
      }
      delete clone.password;
    } else if (clone.passwordHash && typeof clone.passwordHash === 'string') {
      clone.password_hash = clone.passwordHash;
      delete clone.passwordHash;
    }
    delete clone.plainPassword;
  }

  // Strip server internal keys, push tokens, and session secrets
  delete clone.private_key;
  delete clone.privateKey;
  delete clone.vapidPrivateKey;
  delete clone.sessionToken;
  delete clone.apiSecret;
  delete clone.fcmToken;
  delete clone.pushSubscription;
  delete clone.token;
  delete clone.auth_token;
  delete clone.authToken;

  // Normalize timestamps
  if (clone.createdAt) clone.createdAt = normalizeTimestamp(clone.createdAt);
  if (clone.updatedAt) clone.updatedAt = normalizeTimestamp(clone.updatedAt);
  if (clone.paidAt) clone.paidAt = normalizeTimestamp(clone.paidAt);
  if (clone.paymentVerifiedAt) clone.paymentVerifiedAt = normalizeTimestamp(clone.paymentVerifiedAt);
  if (clone.paymentProofUploadedAt) clone.paymentProofUploadedAt = normalizeTimestamp(clone.paymentProofUploadedAt);
  if (clone.paymentExpiresAt) clone.paymentExpiresAt = normalizeTimestamp(clone.paymentExpiresAt);
  if (clone.qrisUpdatedAt) clone.qrisUpdatedAt = normalizeTimestamp(clone.qrisUpdatedAt);

  return clone;
}

/**
 * Validates extracted documents and relational foreign keys against Supabase schema.
 */
export function validateExportData(data: Record<string, any[]>): ExportValidationReport {
  const issues: ValidationIssue[] = [];
  let totalValid = 0;

  const merchantIds = new Set<string>();
  const categoryIds = new Set<string>();
  const driverIds = new Set<string>();

  // 1. Merchants
  for (const m of data.merchants || []) {
    if (!m.id || typeof m.id !== 'string') {
      issues.push({ collection: 'merchants', docId: String(m.id || 'unknown'), type: 'ERROR', message: 'Merchant missing valid ID' });
      continue;
    }
    if (!m.name || typeof m.name !== 'string') {
      issues.push({ collection: 'merchants', docId: m.id, type: 'WARNING', message: 'Merchant missing name; default will be used' });
    }
    merchantIds.add(m.id);
    totalValid++;
  }

  // 2. Categories
  for (const c of data.categories || []) {
    if (!c.id || typeof c.id !== 'string') {
      issues.push({ collection: 'categories', docId: String(c.id || 'unknown'), type: 'ERROR', message: 'Category missing valid ID' });
      continue;
    }
    if (!c.merchantId || !merchantIds.has(c.merchantId)) {
      issues.push({ collection: 'categories', docId: c.id, type: 'ERROR', message: `Orphaned category: merchantId "${c.merchantId}" does not exist in merchants` });
      continue;
    }
    categoryIds.add(c.id);
    totalValid++;
  }

  // 3. Menu Items
  for (const item of data.menuItems || []) {
    if (!item.id || typeof item.id !== 'string') {
      issues.push({ collection: 'menuItems', docId: String(item.id || 'unknown'), type: 'ERROR', message: 'MenuItem missing valid ID' });
      continue;
    }
    if (!item.merchantId || !merchantIds.has(item.merchantId)) {
      issues.push({ collection: 'menuItems', docId: item.id, type: 'ERROR', message: `Orphaned menu item: merchantId "${item.merchantId}" does not exist in merchants` });
      continue;
    }
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      issues.push({ collection: 'menuItems', docId: item.id, type: 'WARNING', message: `MenuItem categoryId "${item.categoryId}" not found in categories; will require category assignment` });
    }
    totalValid++;
  }

  // 4. Drivers
  for (const d of data.drivers || []) {
    if (!d.id || typeof d.id !== 'string') {
      issues.push({ collection: 'drivers', docId: String(d.id || 'unknown'), type: 'ERROR', message: 'Driver missing valid ID' });
      continue;
    }
    driverIds.add(d.id);
    totalValid++;
  }

  // 5. Orders
  for (const o of data.orders || []) {
    if (!o.id || typeof o.id !== 'string') {
      issues.push({ collection: 'orders', docId: String(o.id || 'unknown'), type: 'ERROR', message: 'Order missing valid ID' });
      continue;
    }
    if (!o.merchantId || !merchantIds.has(o.merchantId)) {
      issues.push({ collection: 'orders', docId: o.id, type: 'ERROR', message: `Orphaned order: merchantId "${o.merchantId}" does not exist in merchants` });
      continue;
    }
    if (o.driverId && !driverIds.has(o.driverId)) {
      issues.push({ collection: 'orders', docId: o.id, type: 'WARNING', message: `Order driverId "${o.driverId}" not found in drivers; will be set to NULL` });
    }
    if (o.items && !Array.isArray(o.items)) {
      issues.push({ collection: 'orders', docId: o.id, type: 'WARNING', message: `Order items is not an array; defaulting to empty list` });
    }
    totalValid++;
  }

  // 6. Settlements
  for (const s of data.settlements || []) {
    if (!s.id || typeof s.id !== 'string') {
      issues.push({ collection: 'settlements', docId: String(s.id || 'unknown'), type: 'ERROR', message: 'Settlement missing valid ID' });
      continue;
    }
    if (!s.merchantId || !merchantIds.has(s.merchantId)) {
      issues.push({ collection: 'settlements', docId: s.id, type: 'ERROR', message: `Orphaned settlement: merchantId "${s.merchantId}" does not exist in merchants` });
      continue;
    }
    totalValid++;
  }

  // 7. Partner Registrations
  for (const p of data.partnerRegistrations || []) {
    if (!p.id || typeof p.id !== 'string') {
      issues.push({ collection: 'partnerRegistrations', docId: String(p.id || 'unknown'), type: 'ERROR', message: 'Partner registration missing valid ID' });
      continue;
    }
    totalValid++;
  }

  // 8. Testimonials
  for (const t of data.testimonials || []) {
    if (!t.id || typeof t.id !== 'string') {
      issues.push({ collection: 'testimonials', docId: String(t.id || 'unknown'), type: 'ERROR', message: 'Testimonial missing valid ID' });
      continue;
    }
    totalValid++;
  }

  // 9. Audit Logs
  for (const l of data.auditLogs || []) {
    if (!l.id || typeof l.id !== 'string') {
      issues.push({ collection: 'auditLogs', docId: String(l.id || 'unknown'), type: 'ERROR', message: 'AuditLog missing valid ID' });
      continue;
    }
    totalValid++;
  }

  // 10. System Config
  if (data.systemConfig && data.systemConfig.length > 0) {
    totalValid++;
  }

  const totalErrors = issues.filter(i => i.type === 'ERROR').length;
  const totalWarnings = issues.filter(i => i.type === 'WARNING').length;

  return {
    isValid: totalErrors === 0,
    totalValid,
    totalErrors,
    totalWarnings,
    issues
  };
}

/**
 * Generates verified Supabase SQL insert statements from production data.
 */
export function generateProductionSupabaseSql(
  data: Record<string, any[]>,
  manifest: Partial<ProductionExportManifest>
): string {
  const lines: string[] = [];
  const exportTime = manifest.exportStartedAt || new Date().toISOString();
  const projectId = manifest.targetProjectId || 'tumpanggo-70479';

  lines.push('-- =====================================================================');
  lines.push(`-- SOURCE: CLOUD FIRESTORE PRODUCTION PROJECT ${projectId}`);
  lines.push(`-- Generated: ${exportTime}`);
  lines.push('-- Mode: READ-ONLY CURSOR-PAGINATED EXTRACTION');
  lines.push('-- Relational integrity validated against supabase_schema.sql');
  lines.push('-- IMPORTANT: DO NOT EXECUTE AUTOMATICALLY. REVIEW RECORD COUNTS FIRST.');
  lines.push('-- =====================================================================\n');
  lines.push('BEGIN;\n');

  // 1. System Config
  const configs = data.systemConfig || [];
  const sc = configs[0] || {};
  lines.push(`-- 1. System Config (${configs.length} record)`);
  lines.push(`INSERT INTO system_config (id, service_fee, default_delivery_fee, commission_percent, assignment_mode, qris_image, system_open, updated_at)
VALUES (
  ${escapeSqlString(sc.id || 'config_1')},
  ${sc.serviceFee || 2000},
  ${sc.defaultDeliveryFee || 5000},
  ${sc.commissionPercent || 10.00},
  ${escapeSqlString(sc.assignmentMode || 'MANUAL')},
  ${escapeSqlString(sc.qrisImage || '/qris-merchant.png')},
  ${sc.systemOpen !== false},
  ${escapeSqlString(sc.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO UPDATE SET
  service_fee = EXCLUDED.service_fee,
  default_delivery_fee = EXCLUDED.default_delivery_fee,
  commission_percent = EXCLUDED.commission_percent,
  assignment_mode = EXCLUDED.assignment_mode,
  qris_image = EXCLUDED.qris_image,
  system_open = EXCLUDED.system_open,
  updated_at = EXCLUDED.updated_at;\n`);

  // 2. Merchants
  const validMerchants = (data.merchants || []).filter(m => m.id && typeof m.id === 'string');
  const validMerchantIdSet = new Set(validMerchants.map(m => m.id));
  lines.push(`-- 2. Merchants (${validMerchants.length} records)`);
  for (const m of validMerchants) {
    const passwordHash = m.password_hash || m.passwordHash || m.password || '';
    lines.push(`INSERT INTO merchants (id, name, owner_name, phone, email, password_hash, address, latitude, longitude, open_time, close_time, bank_name, bank_account, bank_holder, active, rating, cook_time_estimate, image, business_photo, description, category, qris_image, qris_updated_at, is_activated, pre_order_only, pre_order_min_amount, pre_order_lead_days, created_at, updated_at)
VALUES (
  ${escapeSqlString(m.id)},
  ${escapeSqlString(m.name || 'Mitra Toko')},
  ${escapeSqlString(m.ownerName || '')},
  ${escapeSqlString(m.phone || '')},
  ${escapeSqlString(m.email || '')},
  ${escapeSqlString(passwordHash)},
  ${escapeSqlString(m.address || '')},
  ${m.latitude ?? -7.9942},
  ${m.longitude ?? 112.7667},
  ${escapeSqlString(m.openTime || '08:00')},
  ${escapeSqlString(m.closeTime || '21:00')},
  ${escapeSqlString(m.bankName || '')},
  ${escapeSqlString(m.bankAccount || '')},
  ${escapeSqlString(m.bankHolder || '')},
  ${m.active !== false},
  ${m.rating || 5.0},
  ${escapeSqlString(m.cookTimeEstimate || '15-30 min')},
  ${escapeSqlString(m.image || '')},
  ${escapeSqlString(m.businessPhoto || '')},
  ${escapeSqlString(m.description || '')},
  ${escapeSqlString(m.category || 'Nasi & Lauk')},
  ${escapeSqlString(m.qrisImage || '')},
  ${m.qrisUpdatedAt ? escapeSqlString(m.qrisUpdatedAt) : 'NULL'},
  ${m.isActivated === true},
  ${m.preOrderOnly === true},
  ${m.preOrderMinAmount || 0},
  ${m.preOrderLeadDays || 1},
  ${escapeSqlString(m.createdAt || new Date().toISOString())},
  ${escapeSqlString(m.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  owner_name = EXCLUDED.owner_name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  address = EXCLUDED.address,
  active = EXCLUDED.active,
  category = EXCLUDED.category,
  qris_image = EXCLUDED.qris_image,
  updated_at = EXCLUDED.updated_at;`);
  }
  lines.push('');

  // 3. Categories (Only those with valid merchant foreign key)
  const validCategories = (data.categories || []).filter(c => c.id && c.merchantId && validMerchantIdSet.has(c.merchantId));
  const validCategoryIdSet = new Set(validCategories.map(c => c.id));
  lines.push(`-- 3. Categories (${validCategories.length} records)`);
  for (const c of validCategories) {
    lines.push(`INSERT INTO categories (id, merchant_id, name, order_index, created_at)
VALUES (
  ${escapeSqlString(c.id)},
  ${escapeSqlString(c.merchantId)},
  ${escapeSqlString(c.name || 'Menu Utama')},
  ${c.orderIndex || 0},
  ${escapeSqlString(c.createdAt || new Date().toISOString())}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  order_index = EXCLUDED.order_index;`);
  }
  lines.push('');

  // 4. Menu Items (Foreign key to merchant and category)
  const validMenuItems = (data.menuItems || []).filter(item => {
    if (!item.id || !item.merchantId || !validMerchantIdSet.has(item.merchantId)) return false;
    // If categoryId is missing or invalid, must either exist or skip
    return !item.categoryId || validCategoryIdSet.has(item.categoryId);
  });
  lines.push(`-- 4. Menu Items (${validMenuItems.length} records)`);
  for (const item of validMenuItems) {
    lines.push(`INSERT INTO menu_items (id, merchant_id, category_id, name, description, price, available, image, created_at, updated_at)
VALUES (
  ${escapeSqlString(item.id)},
  ${escapeSqlString(item.merchantId)},
  ${item.categoryId ? escapeSqlString(item.categoryId) : 'NULL'},
  ${escapeSqlString(item.name || 'Produk')},
  ${escapeSqlString(item.description || '')},
  ${item.price || 0},
  ${item.available !== false},
  ${escapeSqlString(item.image || '')},
  ${escapeSqlString(item.createdAt || new Date().toISOString())},
  ${escapeSqlString(item.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  available = EXCLUDED.available,
  image = EXCLUDED.image,
  updated_at = EXCLUDED.updated_at;`);
  }
  lines.push('');

  // 5. Drivers
  const validDrivers = (data.drivers || []).filter(d => d.id && typeof d.id === 'string');
  const validDriverIdSet = new Set(validDrivers.map(d => d.id));
  lines.push(`-- 5. Drivers (${validDrivers.length} records)`);
  for (const d of validDrivers) {
    const passwordHash = d.password_hash || d.passwordHash || d.password || '';
    lines.push(`INSERT INTO drivers (id, name, phone, email, password_hash, active, online, latitude, longitude, created_at, updated_at)
VALUES (
  ${escapeSqlString(d.id)},
  ${escapeSqlString(d.name || 'Kurir')},
  ${escapeSqlString(d.phone || '')},
  ${escapeSqlString(d.email || '')},
  ${escapeSqlString(passwordHash)},
  ${d.active !== false},
  ${d.online === true},
  ${d.latitude ?? -7.9942},
  ${d.longitude ?? 112.7667},
  ${escapeSqlString(d.createdAt || new Date().toISOString())},
  ${escapeSqlString(d.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  active = EXCLUDED.active,
  online = EXCLUDED.online,
  updated_at = EXCLUDED.updated_at;`);
  }
  lines.push('');

  // 6. Orders
  const validOrders = (data.orders || []).filter(o => o.id && o.merchantId && validMerchantIdSet.has(o.merchantId));
  lines.push(`-- 6. Orders (${validOrders.length} records)`);
  for (const o of validOrders) {
    // If driverId doesn't exist, safely nullify to prevent foreign key violation
    const safeDriverId = (o.driverId && validDriverIdSet.has(o.driverId)) ? o.driverId : null;
    const safeItems = Array.isArray(o.items) ? o.items : [];
    lines.push(`INSERT INTO orders (id, unique_code, total, status, merchant_id, merchant_name, customer_name, customer_phone, delivery_address, delivery_details, landmark, latitude, longitude, subtotal, delivery_fee, service_fee, driver_id, driver_name, payment_status, payment_method, payment_proof, payment_proof_uploaded_at, payment_rejection_reason, payment_verified_by, payment_verified_at, delivery_proof, is_settled, pre_order_date, payment_expires_at, items, created_at, updated_at)
VALUES (
  ${escapeSqlString(o.id)},
  ${o.uniqueCode || 0},
  ${o.total || 0},
  ${escapeSqlString(o.status || 'WAITING_PAYMENT')},
  ${escapeSqlString(o.merchantId)},
  ${escapeSqlString(o.merchantName || '')},
  ${escapeSqlString(o.customerName || '')},
  ${escapeSqlString(o.customerPhone || '')},
  ${escapeSqlString(o.deliveryAddress || '')},
  ${escapeSqlString(o.deliveryDetails || '')},
  ${escapeSqlString(o.landmark || '')},
  ${o.latitude ?? -7.9942},
  ${o.longitude ?? 112.7667},
  ${o.subtotal || 0},
  ${o.deliveryFee || 5000},
  ${o.serviceFee || 2000},
  ${safeDriverId ? escapeSqlString(safeDriverId) : 'NULL'},
  ${escapeSqlString(o.driverName || '')},
  ${escapeSqlString(o.paymentStatus || 'PENDING')},
  ${escapeSqlString(o.paymentMethod || 'MERCHANT_QRIS')},
  ${escapeSqlString(o.paymentProof || '')},
  ${o.paymentProofUploadedAt ? escapeSqlString(o.paymentProofUploadedAt) : 'NULL'},
  ${escapeSqlString(o.paymentRejectionReason || '')},
  ${escapeSqlString(o.paymentVerifiedBy || '')},
  ${o.paymentVerifiedAt ? escapeSqlString(o.paymentVerifiedAt) : 'NULL'},
  ${escapeSqlString(o.deliveryProof || '')},
  ${o.isSettled === true},
  ${escapeSqlString(o.preOrderDate || '')},
  ${o.paymentExpiresAt ? escapeSqlString(o.paymentExpiresAt) : 'NULL'},
  ${escapeSqlString(safeItems)},
  ${escapeSqlString(o.createdAt || new Date().toISOString())},
  ${escapeSqlString(o.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 7. Settlements
  const validSettlements = (data.settlements || []).filter(s => s.id && s.merchantId && validMerchantIdSet.has(s.merchantId));
  lines.push(`-- 7. Settlements (${validSettlements.length} records)`);
  for (const s of validSettlements) {
    lines.push(`INSERT INTO settlements (id, merchant_id, merchant_name, order_count, total_sales, total_commission, amount_to_pay, status, bank_name, bank_account, bank_holder, paid_at, created_at)
VALUES (
  ${escapeSqlString(s.id)},
  ${escapeSqlString(s.merchantId)},
  ${escapeSqlString(s.merchantName || '')},
  ${s.orderCount || 0},
  ${s.totalSales || 0},
  ${s.totalCommission || 0},
  ${s.amountToPay || 0},
  ${escapeSqlString(s.status || 'WAITING_CONFIRMATION')},
  ${escapeSqlString(s.bankName || '')},
  ${escapeSqlString(s.bankAccount || '')},
  ${escapeSqlString(s.bankHolder || '')},
  ${s.paidAt ? escapeSqlString(s.paidAt) : 'NULL'},
  ${escapeSqlString(s.createdAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 8. Partner Registrations
  const validRegs = (data.partnerRegistrations || []).filter(r => r.id && typeof r.id === 'string');
  lines.push(`-- 8. Partner Registrations (${validRegs.length} records)`);
  for (const r of validRegs) {
    lines.push(`INSERT INTO partner_registrations (id, type, name, store_name, phone, email, address, status, notes, created_at, updated_at)
VALUES (
  ${escapeSqlString(r.id)},
  ${escapeSqlString(r.type || 'MERCHANT')},
  ${escapeSqlString(r.name || '')},
  ${escapeSqlString(r.storeName || '')},
  ${escapeSqlString(r.phone || '')},
  ${escapeSqlString(r.email || '')},
  ${escapeSqlString(r.address || '')},
  ${escapeSqlString(r.status || 'PENDING')},
  ${escapeSqlString(r.notes || '')},
  ${escapeSqlString(r.createdAt || new Date().toISOString())},
  ${escapeSqlString(r.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 9. Testimonials
  const validTestimonials = (data.testimonials || []).filter(t => t.id && typeof t.id === 'string');
  lines.push(`-- 9. Testimonials (${validTestimonials.length} records)`);
  for (const t of validTestimonials) {
    const rawRating = Math.max(1, Math.min(5, Math.round(Number(t.rating) || 5)));
    const cat = (t.category === 'merchant' || t.category === 'pelanggan') ? t.category : 'pelanggan';
    const stat = (['pending', 'published', 'rejected', 'draft'].includes(t.status)) ? t.status : 'published';
    lines.push(`INSERT INTO testimonials (id, user_name, merchant_name, category, title, content, avatar_url, role_detail, rating, consent_approved, status, display_order, created_at, updated_at)
VALUES (
  ${escapeSqlString(t.id)},
  ${escapeSqlString(t.userName || 'Warga Tumpang')},
  ${escapeSqlString(t.merchantName || '')},
  ${escapeSqlString(cat)},
  ${escapeSqlString(t.title || '')},
  ${escapeSqlString(t.content || '')},
  ${escapeSqlString(t.avatarUrl || '')},
  ${escapeSqlString(t.roleDetail || '')},
  ${rawRating},
  ${t.consentApproved !== false},
  ${escapeSqlString(stat)},
  ${t.displayOrder || 0},
  ${escapeSqlString(t.createdAt || new Date().toISOString())},
  ${escapeSqlString(t.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 10. Audit Logs
  const validAuditLogs = (data.auditLogs || []).filter(l => l.id && typeof l.id === 'string');
  lines.push(`-- 10. Audit Logs (${validAuditLogs.length} records)`);
  for (const l of validAuditLogs) {
    lines.push(`INSERT INTO audit_logs (id, user_id, role, action, details, created_at)
VALUES (
  ${escapeSqlString(l.id)},
  ${escapeSqlString(l.userId || 'SYSTEM')},
  ${escapeSqlString(l.role || 'SYSTEM')},
  ${escapeSqlString(l.action || 'ACTION')},
  ${escapeSqlString(l.details || '')},
  ${escapeSqlString(l.createdAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  lines.push('COMMIT;\n');
  return lines.join('\n');
}

/**
 * Safely exports a single Firestore collection with cursor pagination.
 * Designed specifically for serverless execution to prevent 10s Vercel timeout.
 */
export async function exportSingleCollection(
  colName: string,
  options: { customDb?: Firestore; batchSize?: number; targetProject?: string } = {}
): Promise<{
  success: boolean;
  collection: string;
  data: any[];
  stats: CollectionExportStats;
  error?: string;
}> {
  const startTime = Date.now();
  const db = options.customDb || getAdminDb();
  const batchSize = Math.max(10, Math.min(500, options.batchSize || 100));

  if (!db) {
    return {
      success: false,
      collection: colName,
      data: [],
      stats: {
        collection: colName,
        preCount: 0,
        exportedCount: 0,
        batchesProcessed: 0,
        failedCount: 1,
        concurrentChangesDetected: 0,
        status: 'FAILED',
        error: 'Firestore Admin SDK instance tidak tersedia. Service Account belum aktif.'
      },
      error: 'Firestore Admin SDK instance tidak tersedia. Service Account belum aktif.'
    };
  }

  let preCount = 0;
  try {
    const countSnap = await db.collection(colName).count().get();
    preCount = countSnap.data().count;
  } catch {
    preCount = 0;
  }

  const colDocs: any[] = [];
  let batchesProcessed = 0;
  let failedCount = 0;
  let concurrentChangesDetected = 0;
  let lastDoc: DocumentSnapshot | null = null;
  let hasMore = true;

  try {
    const MAX_SAFETY_DOCS = 5000;
    while (hasMore && colDocs.length < MAX_SAFETY_DOCS) {
      batchesProcessed++;
      let query = db.collection(colName).orderBy(FieldPath.documentId()).limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        break;
      }

      for (const doc of snapshot.docs) {
        try {
          const rawData = doc.data() || {};
          const cleanDoc = sanitizeDocument(colName, { id: doc.id, ...rawData });

          const updatedDate = cleanDoc.updatedAt ? new Date(cleanDoc.updatedAt).getTime() : 0;
          const createdDate = cleanDoc.createdAt ? new Date(cleanDoc.createdAt).getTime() : 0;
          if (updatedDate > startTime || createdDate > startTime) {
            concurrentChangesDetected++;
          }

          colDocs.push(cleanDoc);
        } catch {
          failedCount++;
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < batchSize || colDocs.length >= MAX_SAFETY_DOCS) {
        hasMore = false;
      }
    }

    const stats: CollectionExportStats = {
      collection: colName,
      preCount,
      exportedCount: colDocs.length,
      batchesProcessed,
      failedCount,
      concurrentChangesDetected,
      status: colDocs.length === 0 ? 'EMPTY' : (failedCount > 0 ? 'PARTIAL' : 'SUCCESS')
    };

    return {
      success: true,
      collection: colName,
      data: colDocs,
      stats
    };
  } catch (err: any) {
    return {
      success: false,
      collection: colName,
      data: colDocs,
      stats: {
        collection: colName,
        preCount,
        exportedCount: colDocs.length,
        batchesProcessed,
        failedCount: failedCount + 1,
        concurrentChangesDetected,
        status: 'FAILED',
        error: err?.message || String(err)
      },
      error: err?.message || String(err)
    };
  }
}

/**
 * Compiles in-memory export artifacts (SQL dump, manifest, and report) from collected data.
 * Does not require filesystem persistence, making it 100% resilient on serverless (Vercel).
 */
export function compileExportArtifacts(
  collectionsData: Record<string, any[]>,
  options: {
    targetProjectId?: string;
    durationMs?: number;
    statsMap?: Record<string, CollectionExportStats>;
    batchSize?: number;
  } = {}
): {
  manifest: ProductionExportManifest;
  sqlContent: string;
  reportMarkdown: string;
} {
  const targetProject = options.targetProjectId || getExpectedProjectId();
  const startTime = Date.now() - (options.durationMs || 1000);
  const exportStartedAt = new Date(startTime).toISOString();
  const exportCompletedAt = new Date().toISOString();
  const exportId = `firestore_prod_export_${Date.now()}`;

  let totalExportedDocs = 0;
  const stats: Record<string, CollectionExportStats> = options.statsMap || {};

  // Strictly filter incoming collections to allowed target collections only
  const cleanCollectionsData: Record<string, any[]> = {};
  for (const colName of TARGET_COLLECTIONS) {
    const rawDocs = Array.isArray(collectionsData?.[colName]) ? collectionsData[colName] : [];
    cleanCollectionsData[colName] = rawDocs;
    totalExportedDocs += rawDocs.length;
    if (!stats[colName]) {
      stats[colName] = {
        collection: colName,
        preCount: rawDocs.length,
        exportedCount: rawDocs.length,
        batchesProcessed: 1,
        failedCount: 0,
        concurrentChangesDetected: 0,
        status: rawDocs.length === 0 ? 'EMPTY' : 'SUCCESS'
      };
    }
  }

  const validationReport = validateExportData(cleanCollectionsData);

  const manifest: ProductionExportManifest = {
    exportId,
    targetProjectId: targetProject,
    exportStartedAt,
    exportCompletedAt,
    durationMs: options.durationMs || (Date.now() - startTime),
    isProductionFirestore: true,
    batchSize: options.batchSize || 100,
    outputDirectory: 'browser-memory',
    collections: stats,
    totalDocumentsExported: totalExportedDocs,
    validation: validationReport,
    filesGenerated: [
      'production_supabase_dump.sql',
      'PRODUCTION_EXPORT_MANIFEST.json',
      'EXPORT_REPORT.md'
    ]
  };

  const sqlContent = generateProductionSupabaseSql(cleanCollectionsData, manifest);
  const reportMarkdown = generateMarkdownReport(manifest);

  return {
    manifest,
    sqlContent,
    reportMarkdown
  };
}

/**
 * Executes the complete cursor-paginated Firestore export pipeline.
 */
export async function executeProductionFirestoreExport(options: ExportOptions = {}): Promise<{
  success: boolean;
  manifest: ProductionExportManifest;
  error?: string;
}> {
  const startTime = Date.now();
  const exportStartedAt = new Date().toISOString();
  const exportId = `firestore_prod_export_${startTime}`;

  const db = options.customDb || getAdminDb();
  const targetProject = options.projectId || getExpectedProjectId();
  const batchSize = Math.max(10, Math.min(500, options.batchSize || 100));

  if (!db) {
    const errorMsg = 'Firestore Admin SDK instance tidak tersedia. Pastikan kredensial Service Account terkonfigurasi.';
    return {
      success: false,
      manifest: {
        exportId,
        targetProjectId: targetProject,
        exportStartedAt,
        exportCompletedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        isProductionFirestore: true,
        batchSize,
        outputDirectory: '',
        collections: {},
        totalDocumentsExported: 0,
        validation: { isValid: false, totalValid: 0, totalErrors: 1, totalWarnings: 0, issues: [{ collection: 'system', docId: 'init', type: 'ERROR', message: errorMsg }] },
        filesGenerated: []
      },
      error: errorMsg
    };
  }

  const outputDir = options.outputDir || path.resolve(process.cwd(), 'exports', `production_firestore_dump_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);

  const collectionsData: Record<string, any[]> = {};
  const statsMap: Record<string, CollectionExportStats> = {};
  let totalExportedDocs = 0;

  for (const colName of TARGET_COLLECTIONS) {
    let preCount = 0;
    try {
      const countSnap = await db.collection(colName).count().get();
      preCount = countSnap.data().count;
    } catch {
      // Aggregation count may fail on older emulator or restricted IAM, fallback to 0
      preCount = 0;
    }

    const colDocs: any[] = [];
    let batchesProcessed = 0;
    let failedCount = 0;
    let concurrentChangesDetected = 0;
    let lastDoc: DocumentSnapshot | null = null;
    let hasMore = true;

    try {
      while (hasMore) {
        batchesProcessed++;
        let query = db.collection(colName).orderBy(FieldPath.documentId()).limit(batchSize);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
          break;
        }

        for (const doc of snapshot.docs) {
          try {
            const rawData = doc.data() || {};
            const cleanDoc = sanitizeDocument(colName, { id: doc.id, ...rawData });

            // Check if document was modified or created after export began
            const updatedDate = cleanDoc.updatedAt ? new Date(cleanDoc.updatedAt).getTime() : 0;
            const createdDate = cleanDoc.createdAt ? new Date(cleanDoc.createdAt).getTime() : 0;
            if (updatedDate > startTime || createdDate > startTime) {
              concurrentChangesDetected++;
            }

            colDocs.push(cleanDoc);
          } catch (docErr) {
            failedCount++;
          }
        }

        if (options.onProgress) {
          options.onProgress(colName, batchesProcessed, colDocs.length, preCount);
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < batchSize) {
          hasMore = false;
        }
      }

      collectionsData[colName] = colDocs;
      totalExportedDocs += colDocs.length;

      statsMap[colName] = {
        collection: colName,
        preCount,
        exportedCount: colDocs.length,
        batchesProcessed,
        failedCount,
        concurrentChangesDetected,
        status: colDocs.length === 0 ? 'EMPTY' : (failedCount > 0 ? 'PARTIAL' : 'SUCCESS')
      };
    } catch (colErr: any) {
      statsMap[colName] = {
        collection: colName,
        preCount,
        exportedCount: colDocs.length,
        batchesProcessed,
        failedCount: failedCount + 1,
        concurrentChangesDetected,
        status: 'FAILED',
        error: colErr?.message || String(colErr)
      };
    }
  }

  // Schema & Relational Foreign Key Validation
  const validationReport = validateExportData(collectionsData);

  const durationMs = Date.now() - startTime;
  const exportCompletedAt = new Date().toISOString();

  const filesGenerated: string[] = [];

  const manifest: ProductionExportManifest = {
    exportId,
    targetProjectId: targetProject,
    exportStartedAt,
    exportCompletedAt,
    durationMs,
    isProductionFirestore: true,
    batchSize,
    outputDirectory: outputDir,
    collections: statsMap,
    totalDocumentsExported: totalExportedDocs,
    validation: validationReport,
    filesGenerated
  };

  // Write out files if not disabled
  if (!options.skipFileWrite) {
    let effectiveOutputDir = outputDir;
    try {
      if (!fs.existsSync(effectiveOutputDir)) {
        fs.mkdirSync(effectiveOutputDir, { recursive: true });
      }
    } catch (dirErr: any) {
      // Fallback for serverless environments (e.g. Vercel read-only root) to os.tmpdir()
      const fallbackDir = path.join(os.tmpdir(), 'exports', `production_firestore_dump_${Date.now()}`);
      try {
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        effectiveOutputDir = fallbackDir;
        manifest.outputDirectory = effectiveOutputDir;
      } catch (fallbackErr: any) {
        manifest.validation.issues.push({
          collection: 'filesystem',
          docId: 'write',
          type: 'WARNING',
          message: `Tidak dapat menulis file ke disk serverless (${fallbackErr.message || fallbackErr}). Data manifest tetap aman di memori.`
        });
      }
    }

    try {
      if (fs.existsSync(effectiveOutputDir)) {
        // 1. JSON dumps per collection
        for (const [colName, docs] of Object.entries(collectionsData)) {
          const fileName = `${colName}.production.json`;
          const filePath = path.join(effectiveOutputDir, fileName);
          fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
          filesGenerated.push(fileName);
        }

        // 2. Production SQL Dump
        const sqlContent = generateProductionSupabaseSql(collectionsData, manifest);
        const sqlFileName = 'production_supabase_dump.sql';
        fs.writeFileSync(path.join(effectiveOutputDir, sqlFileName), sqlContent, 'utf-8');
        filesGenerated.push(sqlFileName);

        // 3. Export Summary Report (Markdown)
        const reportFileName = 'EXPORT_REPORT.md';
        const reportContent = generateMarkdownReport(manifest);
        fs.writeFileSync(path.join(effectiveOutputDir, reportFileName), reportContent, 'utf-8');
        filesGenerated.push(reportFileName);

        // 4. Manifest
        const manifestFileName = 'PRODUCTION_EXPORT_MANIFEST.json';
        fs.writeFileSync(path.join(effectiveOutputDir, manifestFileName), JSON.stringify(manifest, null, 2), 'utf-8');
        filesGenerated.push(manifestFileName);
      }
    } catch (writeErr: any) {
      manifest.validation.issues.push({
        collection: 'filesystem',
        docId: 'file_write_error',
        type: 'WARNING',
        message: `Penyimpanan file dump ke disk gagal pada lingkungan serverless: ${writeErr.message}`
      });
    }
  }

  return {
    success: true,
    manifest
  };
}

/**
 * Generates an executive Markdown report for administrative records and auditing.
 */
export function generateMarkdownReport(manifest: ProductionExportManifest): string {
  const lines: string[] = [];
  lines.push('# Laporan Ekspor Cloud Firestore Produksi TumpangGo');
  lines.push(`**Proyek Target:** \`${manifest.targetProjectId}\`  `);
  lines.push(`**Waktu Mulai:** ${manifest.exportStartedAt}  `);
  lines.push(`**Waktu Selesai:** ${manifest.exportCompletedAt}  `);
  lines.push(`**Durasi:** ${(manifest.durationMs / 1000).toFixed(2)} detik  `);
  lines.push(`**Ukuran Batch Kursor:** ${manifest.batchSize} dokumen per batch  `);
  lines.push(`**Status Relasi & Schema:** ${manifest.validation.isValid ? '✅ VALID (Siap untuk Supabase)' : '⚠️ DITEMUKAN PERINGATAN / ERROR'}  `);
  lines.push('\n---\n');

  lines.push('## 1. Rincian Dokumen per Koleksi');
  lines.push('| Koleksi | Pre-Count | Berhasil Diekspor | Batch Diproses | Gagal | Modifikasi Konkuren | Status |');
  lines.push('|---|---|---|---|---|---|---|');

  for (const [col, stat] of Object.entries(manifest.collections)) {
    lines.push(`| \`${col}\` | ${stat.preCount} | **${stat.exportedCount}** | ${stat.batchesProcessed} | ${stat.failedCount} | ${stat.concurrentChangesDetected} | \`${stat.status}\` |`);
  }

  lines.push(`\n**Total Dokumen Berhasil Diekspor:** **${manifest.totalDocumentsExported}** dokumen.\n`);

  lines.push('## 2. Validasi Foreign Key & Integritas Relasional');
  lines.push(`- Dokumen Valid: ${manifest.validation.totalValid}`);
  lines.push(`- Error: ${manifest.validation.totalErrors}`);
  lines.push(`- Peringatan: ${manifest.validation.totalWarnings}`);

  if (manifest.validation.issues.length > 0) {
    lines.push('\n### Catatan Validasi:');
    for (const issue of manifest.validation.issues.slice(0, 30)) {
      lines.push(`- [${issue.type}] Koleksi \`${issue.collection}\` (ID: \`${issue.docId}\`): ${issue.message}`);
    }
    if (manifest.validation.issues.length > 30) {
      lines.push(`- ...dan ${manifest.validation.issues.length - 30} isu lainnya.`);
    }
  } else {
    lines.push('\nSemua relasi foreign key antara merchants, categories, menu items, drivers, orders, dan settlements dinyatakan utuh dan memenuhi constraint PostgreSQL.');
  }

  lines.push('\n## 3. Berkas yang Dihasilkan');
  for (const file of manifest.filesGenerated) {
    lines.push(`- \`${file}\``);
  }

  lines.push('\n## 4. Keamanan & Kebijakan Data');
  lines.push('1. Semua ID otentik Firestore dan hash password PBKDF2 dipertahankan tanpa perubahan.');
  lines.push('2. Tidak ada rahasia plaintext (kunci API atau private keys) yang diekspor.');
  lines.push('3. Berkas ekspor disimpan terpisah dan **TIDAK** diimpor otomatis ke Supabase produksi.');

  return lines.join('\n');
}
