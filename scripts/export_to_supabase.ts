/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Database Migration Utility: Firestore/Local Snapshot to Supabase PostgreSQL
 * Generates SQL insert dumps and verifies record counts and integrity.
 */

import fs from 'fs';
import path from 'path';
import { classifyRecord } from '../src/server/services/cleanupService';

interface MigrationData {
  merchants?: any[];
  categories?: any[];
  menuItems?: any[];
  drivers?: any[];
  orders?: any[];
  settlements?: any[];
  partnerRegistrations?: any[];
  testimonials?: any[];
  auditLogs?: any[];
  systemConfig?: any;
}

function escapeSqlString(val: any): string {
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

export function generateSupabaseSqlDump(data: MigrationData): string {
  // Pre-classification pass: identify dummy merchants
  const dummyMerchantIds = new Set<string>();
  for (const m of (data.merchants || [])) {
    const res = classifyRecord('merchants', m, dummyMerchantIds);
    if (res.classification === 'DUMMY_CONFIRMED') {
      dummyMerchantIds.add(m.id);
    }
  }

  // Filter valid real records
  const validMerchants = (data.merchants || []).filter(m => {
    if (!m.id) return false;
    const res = classifyRecord('merchants', m, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });
  const validMerchantIdSet = new Set(validMerchants.map(m => m.id));

  const validCategories = (data.categories || []).filter(c => {
    if (!c.id || !c.merchantId || !validMerchantIdSet.has(c.merchantId)) return false;
    const res = classifyRecord('categories', c, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });
  const validCategoryIdSet = new Set(validCategories.map(c => c.id));

  const validMenuItems = (data.menuItems || []).filter(item => {
    if (!item.id || !item.merchantId || !validMerchantIdSet.has(item.merchantId)) return false;
    if (item.categoryId && !validCategoryIdSet.has(item.categoryId)) return false;
    const res = classifyRecord('menuItems', item, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });

  const validDrivers = (data.drivers || []).filter(d => {
    if (!d.id) return false;
    const res = classifyRecord('drivers', d, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });

  const validOrders = (data.orders || []).filter(o => {
    if (!o.id || !o.merchantId || !validMerchantIdSet.has(o.merchantId)) return false;
    const res = classifyRecord('orders', o, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });

  const validSettlements = (data.settlements || []).filter(s => {
    if (!s.id || !s.merchantId || !validMerchantIdSet.has(s.merchantId)) return false;
    const res = classifyRecord('settlements', s, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });

  const validTestimonials = (data.testimonials || []).filter(t => {
    if (!t.id) return false;
    const res = classifyRecord('testimonials', t, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });

  const validRegs = (data.partnerRegistrations || []).filter(r => {
    if (!r.id) return false;
    const res = classifyRecord('partnerRegistrations', r, dummyMerchantIds);
    return res.classification === 'REAL_PRESERVED';
  });

  const lines: string[] = [];
  lines.push('-- =====================================================================');
  lines.push('-- TUMPANGGO SUPABASE PRODUCTION DATA IMPORT DUMP');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('-- Strict Foreign Key & Anti-Dummy Sanitization Active');
  lines.push('-- Warung Ombay & Core Operational Data Protected');
  lines.push('-- =====================================================================\n');
  lines.push('BEGIN;\n');

  // 1. System Config
  if (data.systemConfig) {
    const sc = data.systemConfig;
    lines.push(`-- 1. System Config`);
    lines.push(`INSERT INTO system_config (id, service_fee, default_delivery_fee, commission_percent, assignment_mode, qris_image, system_open)
VALUES (
  ${escapeSqlString(sc.id || 'config_1')},
  ${sc.serviceFee || 2000},
  ${sc.defaultDeliveryFee || 5000},
  ${sc.commissionPercent || 10.00},
  ${escapeSqlString(sc.assignmentMode || 'MANUAL')},
  ${escapeSqlString(sc.qrisImage || '/qris-merchant.png')},
  ${sc.systemOpen !== false}
)
ON CONFLICT (id) DO UPDATE SET
  service_fee = EXCLUDED.service_fee,
  default_delivery_fee = EXCLUDED.default_delivery_fee,
  commission_percent = EXCLUDED.commission_percent,
  assignment_mode = EXCLUDED.assignment_mode,
  qris_image = EXCLUDED.qris_image,
  system_open = EXCLUDED.system_open;\n`);
  }

  // 2. Merchants
  lines.push(`-- 2. Merchants (${validMerchants.length} real records)`);
  for (const m of validMerchants) {
    lines.push(`INSERT INTO merchants (id, name, owner_name, phone, email, password_hash, address, latitude, longitude, open_time, close_time, bank_name, bank_account, bank_holder, active, rating, cook_time_estimate, image, business_photo, description, category, qris_image, is_activated, created_at, updated_at)
VALUES (
  ${escapeSqlString(m.id)},
  ${escapeSqlString(m.name || 'Mitra Toko')},
  ${escapeSqlString(m.ownerName || '')},
  ${escapeSqlString(m.phone || '')},
  ${escapeSqlString(m.email || '')},
  ${escapeSqlString(m.password || m.password_hash || m.passwordHash || '')},
  ${escapeSqlString(m.address || '')},
  ${m.latitude || -7.9942},
  ${m.longitude || 112.7667},
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
  ${m.isActivated === true},
  ${escapeSqlString(m.createdAt || new Date().toISOString())},
  ${escapeSqlString(m.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 3. Categories
  lines.push(`-- 3. Categories (${validCategories.length} records)`);
  for (const c of validCategories) {
    lines.push(`INSERT INTO categories (id, merchant_id, name, order_index)
VALUES (
  ${escapeSqlString(c.id)},
  ${escapeSqlString(c.merchantId)},
  ${escapeSqlString(c.name || 'Menu Utama')},
  ${c.orderIndex || 0}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 4. Menu Items
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
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 5. Drivers
  lines.push(`-- 5. Drivers (${validDrivers.length} records)`);
  for (const d of validDrivers) {
    lines.push(`INSERT INTO drivers (id, name, phone, email, password_hash, active, online, latitude, longitude, created_at, updated_at)
VALUES (
  ${escapeSqlString(d.id)},
  ${escapeSqlString(d.name || 'Kurir')},
  ${escapeSqlString(d.phone || '')},
  ${escapeSqlString(d.email || '')},
  ${escapeSqlString(d.password || d.password_hash || '')},
  ${d.active !== false},
  ${d.online === true},
  ${d.latitude || -7.9942},
  ${d.longitude || 112.7667},
  ${escapeSqlString(d.createdAt || new Date().toISOString())},
  ${escapeSqlString(d.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 6. Testimonials
  lines.push(`-- 6. Testimonials (${validTestimonials.length} records)`);
  for (const t of validTestimonials) {
    lines.push(`INSERT INTO testimonials (id, user_name, merchant_name, category, title, content, avatar_url, role_detail, rating, consent_approved, status, display_order, created_at, updated_at)
VALUES (
  ${escapeSqlString(t.id)},
  ${escapeSqlString(t.userName || 'Warga Tumpang')},
  ${escapeSqlString(t.merchantName || '')},
  ${escapeSqlString(t.category || 'pelanggan')},
  ${escapeSqlString(t.title || '')},
  ${escapeSqlString(t.content || '')},
  ${escapeSqlString(t.avatarUrl || '')},
  ${escapeSqlString(t.roleDetail || '')},
  ${t.rating || 5},
  ${t.consentApproved !== false},
  ${escapeSqlString(t.status || 'published')},
  ${t.displayOrder || 0},
  ${escapeSqlString(t.createdAt || new Date().toISOString())},
  ${escapeSqlString(t.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 7. Orders
  lines.push(`-- 7. Orders (${validOrders.length} records)`);
  for (const o of validOrders) {
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
  ${o.latitude || -7.9942},
  ${o.longitude || 112.7667},
  ${o.subtotal || 0},
  ${o.deliveryFee || 5000},
  ${o.serviceFee || 2000},
  ${escapeSqlString(o.driverId || null)},
  ${escapeSqlString(o.driverName || '')},
  ${escapeSqlString(o.paymentStatus || 'UNPAID')},
  ${escapeSqlString(o.paymentMethod || 'MERCHANT_QRIS')},
  ${escapeSqlString(o.paymentProof || '')},
  ${escapeSqlString(o.paymentProofUploadedAt || null)},
  ${escapeSqlString(o.paymentRejectionReason || '')},
  ${escapeSqlString(o.paymentVerifiedBy || '')},
  ${escapeSqlString(o.paymentVerifiedAt || null)},
  ${escapeSqlString(o.deliveryProof || '')},
  ${o.isSettled === true},
  ${escapeSqlString(o.preOrderDate || '')},
  ${escapeSqlString(o.paymentExpiresAt || null)},
  ${escapeSqlString(o.items || [])},
  ${escapeSqlString(o.createdAt || new Date().toISOString())},
  ${escapeSqlString(o.updatedAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 8. Settlements
  lines.push(`-- 8. Settlements (${validSettlements.length} records)`);
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
  ${escapeSqlString(s.status || 'PENDING')},
  ${escapeSqlString(s.bankName || '')},
  ${escapeSqlString(s.bankAccount || '')},
  ${escapeSqlString(s.bankHolder || '')},
  ${escapeSqlString(s.paidAt || null)},
  ${escapeSqlString(s.createdAt || new Date().toISOString())}
)
ON CONFLICT (id) DO NOTHING;`);
  }
  lines.push('');

  // 9. Partner Registrations
  lines.push(`-- 9. Partner Registrations (${validRegs.length} records)`);
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

  // 10. Audit Logs (Recent only)
  const logs = (data.auditLogs || []).slice(0, 100);
  lines.push(`-- 10. Audit Logs (${logs.length} records)`);
  for (const l of logs) {
    if (!l.id) continue;
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

// Execution entry point
if (process.argv[1]?.endsWith('export_to_supabase.ts')) {
  const localDbPath = path.resolve(process.cwd(), 'tumpang_food_db.json');
  let data: MigrationData = {};

  if (fs.existsSync(localDbPath)) {
    try {
      data = JSON.parse(fs.readFileSync(localDbPath, 'utf-8'));
      console.log('[Export] Loaded data from tumpang_food_db.json');
    } catch (e: any) {
      console.error('[Export] Error reading local db:', e.message);
    }
  }

  const dumpSql = generateSupabaseSqlDump(data);
  const outPath = path.resolve(process.cwd(), 'supabase_data_seed.sql');
  fs.writeFileSync(outPath, dumpSql, 'utf-8');
  console.log(`[Export] Successfully generated Supabase SQL seed at: ${outPath}`);
  console.log(`[Export] Statistics:
- Merchants: ${(data.merchants || []).length}
- Categories: ${(data.categories || []).length}
- Menu Items: ${(data.menuItems || []).length}
- Drivers: ${(data.drivers || []).length}
- Testimonials: ${(data.testimonials || []).length}
- Orders: ${(data.orders || []).length}`);
}
