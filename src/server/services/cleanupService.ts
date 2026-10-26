/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Safe Dummy Data Cleanup & Audit Service
 * Identifies and safely purges only confirmed demo/seed records across all collections.
 * Strictly preserves Master Admin, system configs, universal categories, and real customer/merchant data.
 */

import fs from 'fs';
import path from 'path';
import { foodConfig } from '../config';
import {
  getAdminDb,
  safeAdminDeleteDoc,
  createFirestoreBackup,
  isFirestoreAdminConfigured,
  testFirestoreConnection
} from '../firebaseAdmin';

// Universal system categories that must never be deleted
export const UNIVERSAL_SYSTEM_CATEGORIES = new Set([
  'makanan',
  'minuman',
  'cemilan',
  'snack',
  'aneka nasi',
  'mie & bakso',
  'ayam & bebek',
  'kopi & teh',
  'jus & buah',
  'lainnya',
  'nasi & lauk',
  'sarapan',
  'seafood',
  'dessert'
]);

// Known seed IDs from demo fixtures, testing suites, and mock data
export const KNOWN_SEED_MERCHANT_IDS = new Set([
  'm1', 'm2', 'm3',
  'merch_dummy',
  'dummy_merchant_99'
]);
export const KNOWN_SEED_MENU_IDS = new Set([
  'menu_1', 'menu_2', 'menu_3',
  'menu_siti_1', 'menu_ahmad_1',
  'menu_dummy'
]);
export const KNOWN_SEED_DRIVER_IDS = new Set([
  'd1', 'd2', 'd3',
  'd_driver_1', 'd_driver_2'
]);
export const KNOWN_SEED_ORDER_IDS = new Set([
  'ord_1', 'ord_2', 'ord_live_test_1', 'ord_test'
]);
export const KNOWN_SEED_SETTLEMENT_IDS = new Set([
  'settle_1', 'settle_2', 'set_test'
]);
export const KNOWN_SEED_TESTIMONIAL_IDS = new Set([
  'demo-1', 'demo-2', 't1', 't2'
]);

// Relational Safe Deletion Order: Child records first, then categories/menus, then parent merchants
export const SAFE_DELETION_ORDER = [
  'orders',
  'settlements',
  'menuItems',
  'categories',
  'drivers',
  'testimonials',
  'partnerRegistrations',
  'merchants'
] as const;

export type RecordClassification = 'DUMMY_CONFIRMED' | 'REAL_PRESERVED' | 'MANUAL_REVIEW_REQUIRED';

export interface RecordClassificationResult {
  classification: RecordClassification;
  reason: string;
  intendedAction: 'DELETE' | 'PRESERVE' | 'FLAG_FOR_REVIEW';
  summaryText: string;
}

/**
 * Classifies an individual record based on verifiable seed IDs, demo markers, and business rules.
 * Strictly preserves Warung Ombay, Master Admin, system configs, universal categories, and real operational data.
 */
export function classifyRecord(
  collection: string, 
  doc: any, 
  dummyMerchantIds: Set<string> = new Set()
): RecordClassificationResult {
  const docId = String(doc?.id || '');
  const idLower = docId.toLowerCase();
  const name = String(doc?.name || doc?.title || doc?.author || doc?.customerName || '').trim();
  const nameLower = name.toLowerCase();

  // 0. WARUNG OMBAY STRICT PRESERVATION (Owner's official business - WAJIB DIPERTAHANKAN)
  const isWarungOmbay = 
    nameLower.includes('ombay') || 
    idLower.includes('ombay') || 
    (doc?.merchantId && String(doc.merchantId).toLowerCase().includes('ombay')) ||
    (doc?.merchantName && String(doc.merchantName).toLowerCase().includes('ombay'));

  if (isWarungOmbay) {
    return {
      classification: 'REAL_PRESERVED',
      reason: 'Toko resmi Warung Ombay milik pemilik sistem (WAJIB DIPERTAHANKAN 100%)',
      intendedAction: 'PRESERVE',
      summaryText: `Warung Ombay [${collection}: ${docId}] - Usaha Resmi Pemilik Sistem (DIPERTAHANKAN)`
    };
  }

  // 1. SYSTEM CONFIG (Always protected)
  if (collection === 'systemConfig' || docId === 'config_1' || docId === 'system_config') {
    return {
      classification: 'REAL_PRESERVED',
      reason: 'Protected core system configuration (pricing, delivery rules, QRIS)',
      intendedAction: 'PRESERVE',
      summaryText: `System Config [Tarif: Rp ${doc.defaultDeliveryFee || 5000}, Komisi: ${doc.commissionPercent || 10}%]`
    };
  }

  // 2. MASTER ADMIN (Always protected)
  if (collection === 'users' || collection === 'admins') {
    if (doc.email === foodConfig.masterAccount.email || doc.username === foodConfig.masterAccount.email) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Protected Master Admin account',
        intendedAction: 'PRESERVE',
        summaryText: `Master Admin: ${doc.email || doc.username}`
      };
    }
  }

  // 3. CATEGORIES
  if (collection === 'categories') {
    const isMerchantBound = Boolean(doc.merchantId);
    const isTiedToDummyMerchant = isMerchantBound && (KNOWN_SEED_MERCHANT_IDS.has(doc.merchantId) || dummyMerchantIds.has(doc.merchantId));
    const isUniversal = !isMerchantBound || UNIVERSAL_SYSTEM_CATEGORIES.has(nameLower);

    if (doc.isDemo === true || idLower.startsWith('cat_demo') || isTiedToDummyMerchant) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isTiedToDummyMerchant 
          ? `Kategori terkait dengan ID merchant dummy (${doc.merchantId})` 
          : 'Marker demo category / seed ID terdeteksi',
        intendedAction: 'DELETE',
        summaryText: `Kategori: "${name}" (ID: ${docId}, Merchant: ${doc.merchantId || 'system'})`
      };
    }

    if (isUniversal) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Kategori sistem universal untuk navigasi katalog',
        intendedAction: 'PRESERVE',
        summaryText: `Kategori Universal: "${name}" (ID: ${docId})`
      };
    }

    if (isMerchantBound && !isTiedToDummyMerchant) {
      return {
        classification: 'REAL_PRESERVED',
        reason: `Kategori toko milik merchant aktif (${doc.merchantId})`,
        intendedAction: 'PRESERVE',
        summaryText: `Kategori Toko: "${name}" (ID: ${docId}, Merchant: ${doc.merchantId})`
      };
    }
  }

  // 4. MERCHANTS
  if (collection === 'merchants') {
    const isSeedId = KNOWN_SEED_MERCHANT_IDS.has(docId) || /^m[1-9]$/i.test(docId);
    const hasDemoMarker = doc.isDemo === true || doc.isExample === true;
    const isDemoName = nameLower.includes('barokah bu siti') || nameLower.includes('warung demo') || nameLower.includes('warung dummy');
    const isDemoEmail = doc.email && (doc.email.includes('example.com') || doc.email.includes('demo.com') || doc.email.includes('dummy') || doc.email.includes('busiti_') || doc.email.includes('cak.ahmad'));
    const isDemoPhone = doc.phone === '081234567890' || (doc.phone && doc.phone.startsWith('08198') && doc.phone.length === 12);

    if (isSeedId || hasDemoMarker || isDemoName || isDemoEmail || (isDemoPhone && !nameLower.includes('ombay'))) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isSeedId ? `Seed ID merchant contoh "${docId}"` : 'Marker demo / profil usaha contoh teridentifikasi',
        intendedAction: 'DELETE',
        summaryText: `Merchant Dummy: "${name}" (${doc.ownerName || 'No Owner'}, Phone: ${doc.phone || 'No Phone'})`
      };
    }

    // Real registered merchant
    if (doc.phone && doc.address && !hasDemoMarker && !isDemoName) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Mitra merchant resmi terdaftar dengan data usaha lengkap',
        intendedAction: 'PRESERVE',
        summaryText: `Merchant Resmi: "${name}" (${doc.ownerName}, Phone: ${doc.phone}, Address: ${doc.address})`
      };
    }

    return {
      classification: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Data belum lengkap atau asal-usul tidak terverifikasi.',
      intendedAction: 'FLAG_FOR_REVIEW',
      summaryText: `Merchant: "${name}" (ID: ${docId})`
    };
  }

  // 5. MENU ITEMS
  if (collection === 'menuItems') {
    const isSeedId = KNOWN_SEED_MENU_IDS.has(docId) || /^menu_[1-9]$/i.test(docId);
    const isBoundToDummyMerchant = doc.merchantId && (KNOWN_SEED_MERCHANT_IDS.has(doc.merchantId) || dummyMerchantIds.has(doc.merchantId));
    const hasDemoMarker = doc.isDemo === true || doc.isExample === true;
    const isDemoName = nameLower.includes('bakso malang spesial') || nameLower.includes('es teh manis jumbo') || nameLower.includes('(demo)');

    if (isSeedId || isBoundToDummyMerchant || hasDemoMarker || isDemoName) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isBoundToDummyMerchant 
          ? `Terkait dengan merchant dummy (${doc.merchantId})` 
          : isSeedId ? `Seed menu ID contoh "${docId}"` : 'Marker menu makanan demo',
        intendedAction: 'DELETE',
        summaryText: `Menu Dummy: "${name}" (Rp ${doc.price || 0}, Merchant: ${doc.merchantId || 'none'})`
      };
    }

    if (doc.merchantId && !isBoundToDummyMerchant) {
      return {
        classification: 'REAL_PRESERVED',
        reason: `Menu makanan milik merchant aktif (${doc.merchantId})`,
        intendedAction: 'PRESERVE',
        summaryText: `Menu: "${name}" (Rp ${doc.price || 0}, Merchant: ${doc.merchantId})`
      };
    }

    return {
      classification: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Menu tanpa relasi merchant yang jelas.',
      intendedAction: 'FLAG_FOR_REVIEW',
      summaryText: `Menu: "${name}" (ID: ${docId})`
    };
  }

  // 6. DRIVERS
  if (collection === 'drivers') {
    const isSeedId = KNOWN_SEED_DRIVER_IDS.has(docId) || /^d[1-9]$/i.test(docId);
    const hasDemoMarker = doc.isDemo === true;
    const isDemoEmail = doc.email === 'driver1@tumpanggo.com' || doc.email === 'driver2@tumpanggo.com' || (doc.email && doc.email.includes('example.com'));
    const isDemoName = (nameLower === 'budi santoso' || nameLower === 'agus setiawan') && (doc.phone === '081234567891' || doc.phone === '081234567892');

    if (isSeedId || hasDemoMarker || isDemoEmail || isDemoName) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isSeedId ? `Seed driver ID contoh "${docId}"` : 'Profil driver demo atau email testing teridentifikasi',
        intendedAction: 'DELETE',
        summaryText: `Driver Dummy: "${name}" (${doc.phone || 'No Phone'}, Email: ${doc.email || 'None'})`
      };
    }

    if (doc.phone && doc.vehiclePlate) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Mitra driver resmi dengan nomor plat kendaraan terdaftar',
        intendedAction: 'PRESERVE',
        summaryText: `Driver Resmi: "${name}" (${doc.vehiclePlate}, Phone: ${doc.phone})`
      };
    }

    return {
      classification: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Pendaftaran driver belum lengkap. Memerlukan tinjauan manual.',
      intendedAction: 'FLAG_FOR_REVIEW',
      summaryText: `Driver: "${name}" (ID: ${docId})`
    };
  }

  // 7. ORDERS / TRANSACTIONS
  if (collection === 'orders') {
    const isSeedId = KNOWN_SEED_ORDER_IDS.has(docId) || idLower.startsWith('ord_test') || idLower.startsWith('demo-') || idLower.includes('test') || idLower.includes('retry');
    const isDummyMerchant = doc.merchantId && (KNOWN_SEED_MERCHANT_IDS.has(doc.merchantId) || dummyMerchantIds.has(doc.merchantId));
    const hasDemoMarker = doc.isDemo === true || nameLower.includes('test customer') || nameLower.includes('pelanggan demo') || !doc.merchantId;

    if (isSeedId || isDummyMerchant || hasDemoMarker) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isDummyMerchant ? `Pesanan dibuat pada merchant dummy (${doc.merchantId})` : 'ID pesanan seed atau data testing',
        intendedAction: 'DELETE',
        summaryText: `Pesanan Dummy: #${doc.orderNumber || docId} (${name}, Total: Rp ${doc.total || doc.pricing?.grandTotal || 0})`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Transaksi pesanan pelanggan asli',
      intendedAction: 'PRESERVE',
      summaryText: `Pesanan Riil: #${doc.orderNumber || docId} (${name}, Total: Rp ${doc.total || doc.pricing?.grandTotal || 0})`
    };
  }

  // 8. SETTLEMENTS
  if (collection === 'settlements') {
    const isSeedId = KNOWN_SEED_SETTLEMENT_IDS.has(docId) || idLower.startsWith('set_test') || idLower.startsWith('settle_test');
    const isDummyMerchant = doc.merchantId && (KNOWN_SEED_MERCHANT_IDS.has(doc.merchantId) || dummyMerchantIds.has(doc.merchantId));
    const hasDemoMarker = doc.isDemo === true;

    if (isSeedId || isDummyMerchant || hasDemoMarker) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isDummyMerchant ? `Settlement untuk merchant dummy (${doc.merchantId})` : 'Settlement testing/seed',
        intendedAction: 'DELETE',
        summaryText: `Settlement Dummy: ID ${docId} (Merchant: ${doc.merchantId}, Rp ${doc.amount || 0})`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Rekap pencairan dana operasional merchant asli',
      intendedAction: 'PRESERVE',
      summaryText: `Settlement Riil: ID ${docId} (Merchant: ${doc.merchantId}, Rp ${doc.amount || 0})`
    };
  }

  // 9. TESTIMONIALS / REVIEWS
  if (collection === 'testimonials') {
    const isSeedId = KNOWN_SEED_TESTIMONIAL_IDS.has(docId) || idLower.startsWith('demo-') || idLower.startsWith('testi_demo');
    const hasDemoMarker = doc.isExample === true || doc.isDemo === true;
    const isDemoAuthor = ['budi s.', 'siti a.', 'ahmad k.', 'test user'].includes(nameLower);

    if (isSeedId || hasDemoMarker || isDemoAuthor) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: 'Contoh review/testimoni dummy bawaan testing',
        intendedAction: 'DELETE',
        summaryText: `Testimoni Dummy: dari "${name}" (ID: ${docId}, Rating: ${doc.rating || 5}★)`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Testimoni asli dari pengguna',
      intendedAction: 'PRESERVE',
      summaryText: `Testimoni Asli: dari "${name}" (ID: ${docId})`
    };
  }

  // 10. PARTNER REGISTRATIONS
  if (collection === 'partnerRegistrations') {
    const isSeedId = idLower.startsWith('reg_test') || idLower.startsWith('demo-');
    const hasDemoMarker = doc.isDemo === true;
    const storeNameLower = String(doc.storeName || '').toLowerCase();
    const isDemoName = nameLower.includes('warung demo') || nameLower.includes('driver demo') || nameLower.includes('bu siti') || nameLower.includes('cak ahmad') || nameLower.includes('concurrency') || storeNameLower.includes('bu siti') || storeNameLower.includes('cak ahmad') || storeNameLower.includes('4619');
    const isDemoEmail = doc.email && (doc.email.includes('example.com') || doc.email.includes('demo.com') || doc.email.includes('dummy') || doc.email.includes('busiti_') || doc.email.includes('cak.ahmad') || /\d{6}/.test(doc.email));

    if (hasDemoMarker || isDemoEmail || isDemoName || isSeedId) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: 'Pendaftaran mitra dummy atau email testing',
        intendedAction: 'DELETE',
        summaryText: `Pendaftaran Dummy: "${name}" (${doc.email})`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Pendaftaran kemitraan asli dari pengguna',
      intendedAction: 'PRESERVE',
      summaryText: `Pendaftaran Asli: "${name}" (${doc.email})`
    };
  }

  return {
    classification: 'REAL_PRESERVED',
    reason: 'Dokumen dipertahankan secara default',
    intendedAction: 'PRESERVE',
    summaryText: `${collection}: ID ${docId}`
  };
}
