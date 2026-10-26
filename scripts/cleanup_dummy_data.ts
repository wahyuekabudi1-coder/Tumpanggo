/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Safe Dummy Data Cleanup Utility
 * 
 * Direct Cloud Firestore & Local Database Scanner and Sanitizer.
 * Scans connected Cloud Firestore collections directly and local JSON database.
 * Identifies dummy records via verifiable seed IDs and demo markers.
 * Strictly preserves Master Admin, system configs, universal categories, and real operational data.
 * Enforces strict project identity verification (target: tumpanggo-70479).
 * Never assumes unverified/failed cloud scan is clean (CLOUD_SCAN_NOT_COMPLETED).
 * Creates and verifies persistent Cloud and Local backups before any live deletion.
 * 
 * Usage:
 *   npx tsx scripts/cleanup_dummy_data.ts --dry-run
 *   npx tsx scripts/cleanup_dummy_data.ts --execute
 *   npx tsx scripts/cleanup_dummy_data.ts --execute --force
 *   npx tsx scripts/cleanup_dummy_data.ts --cloud-only --dry-run
 *   npx tsx scripts/cleanup_dummy_data.ts --local-only --dry-run
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { foodConfig } from '../src/server/config';
import {
  getAdminDb,
  getAdminApp,
  testFirestoreConnection,
  safeAdminDeleteDoc,
  safeAdminGetDoc,
  getExpectedProjectId,
  getActiveProjectId
} from '../src/server/firebaseAdmin';

export const TARGET_EXPECTED_PROJECT_ID = 'tumpanggo-70479';

export const TARGET_COLLECTIONS = [
  'merchants',
  'categories',
  'menuItems',
  'drivers',
  'orders',
  'settlements',
  'testimonials',
  'partnerRegistrations'
] as const;

export type TargetCollectionName = typeof TARGET_COLLECTIONS[number];

export type RecordClassification = 'DUMMY_CONFIRMED' | 'REAL_PRESERVED' | 'MANUAL_REVIEW_REQUIRED';

export interface ScannedRecord {
  collection: string;
  id: string;
  classification: RecordClassification;
  reason: string;
  intendedAction: 'DELETE' | 'PRESERVE' | 'FLAG_FOR_REVIEW';
  summaryText: string;
  rawPayload: any;
  source: 'LOCAL' | 'CLOUD';
}

export interface CollectionScanSummary {
  collection: string;
  totalScanned: number;
  dummyCount: number;
  preservedRealCount: number;
  manualReviewCount: number;
  items: ScannedRecord[];
}

export interface CollectionScanStatus {
  collection: string;
  success: boolean;
  count: number;
  error?: string;
}

export interface CloudScanResult {
  connected: boolean;
  isComplete: boolean;
  diagnostic: string;
  projectId: string;
  adminAppProjectId?: string;
  collectionStatuses: Record<string, CollectionScanStatus>;
  failedCollections: string[];
  summary: Record<string, CollectionScanSummary>;
  cloudDocsMap: Record<string, any[]>;
  dummyMerchantIds: Set<string>;
  totalDummy: number | null;
  totalReal: number;
  totalReview: number;
}

export interface CloudDeletionRecordResult {
  collection: string;
  docId: string;
  deleteSuccess: boolean;
  verifiedAbsence: boolean;
  error?: string;
}

export interface CloudDeletionSummary {
  totalTargeted: number;
  deletedCount: number;
  failedCount: number;
  verifiedAbsenceCount: number;
  unverifiedCount: number;
}

export interface FullAuditReport {
  timestamp: string;
  projectValidation: {
    valid: boolean;
    expectedProject: string;
    activeProject: string;
    adminAppProject?: string;
    reason?: string;
  };
  environment: {
    expectedProjectId: string;
    activeProjectId: string;
    targetDatabaseId: string;
    localDbFile: string;
    cloudConnected: boolean;
    cloudScanComplete: boolean;
    cloudDiagnostic: string;
    cloudFailedCollections: string[];
  };
  preservedSystem: {
    masterAdminEmail: string;
    pricing: {
      defaultDeliveryFee: number;
      pakisDeliveryFee: number;
      commissionPercent: number;
      tieredServiceFee: string;
      qrisImage: string;
    };
    systemConfig: any;
  };
  localSummary: Record<string, CollectionScanSummary>;
  cloudSummary: Record<string, CollectionScanSummary>;
  cloudStatuses: Record<string, CollectionScanStatus>;
  totalLocalDummy: number;
  totalCloudDummy: number | null;
  totalManualReview: number;
  executionStatus: 'DRY_RUN' | 'EXECUTED_SUCCESS' | 'EXECUTED_PARTIAL' | 'EXECUTED_WITH_ERRORS' | 'BLOCKED_SAFETY_CHECK' | 'CANCELLED_BY_USER';
  cloudBackupStatus?: {
    attempted: boolean;
    success: boolean;
    cloudVerified: boolean;
    backupId?: string;
    error?: string;
  };
  cloudDeletionResults?: CloudDeletionRecordResult[];
  cloudDeletionSummary?: CloudDeletionSummary;
}

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

/**
 * Validates project identity before any mutations or operations.
 * Compares expected Project ID, active Project ID, and actual Firebase Admin client project.
 */
export function validateTargetProject(opts?: {
  expectedProject?: string;
  activeProject?: string;
  adminAppProject?: string;
  requireAdminApp?: boolean;
}): {
  valid: boolean;
  reason?: string;
  details: {
    expected: string;
    active: string;
    adminApp?: string;
    targetOfficial: string;
  };
} {
  const expected = (opts?.expectedProject !== undefined ? opts.expectedProject : getExpectedProjectId()).trim();
  const active = (opts?.activeProject !== undefined ? opts.activeProject : getActiveProjectId()).trim();
  const adminApp = getAdminApp();
  const adminAppProject = (opts?.adminAppProject !== undefined ? opts.adminAppProject : (adminApp?.options?.projectId || '')).trim();

  const details = {
    expected,
    active,
    adminApp: adminAppProject || undefined,
    targetOfficial: TARGET_EXPECTED_PROJECT_ID
  };

  if (expected !== TARGET_EXPECTED_PROJECT_ID) {
    return {
      valid: false,
      reason: `Expected Project ID ("${expected}") tidak cocok dengan target proyek resmi ("${TARGET_EXPECTED_PROJECT_ID}").`,
      details
    };
  }

  if (active !== TARGET_EXPECTED_PROJECT_ID) {
    return {
      valid: false,
      reason: `Active Project ID ("${active}") tidak cocok dengan target proyek resmi ("${TARGET_EXPECTED_PROJECT_ID}").`,
      details
    };
  }

  // Admin Project ID verification for Cloud operations
  if (opts?.requireAdminApp) {
    if (!adminAppProject) {
      return {
        valid: false,
        reason: `Project ID Admin Firebase aktif kosong atau tidak dapat diverifikasi dari getAdminApp().`,
        details
      };
    }
    if (adminAppProject !== TARGET_EXPECTED_PROJECT_ID) {
      return {
        valid: false,
        reason: `Koneksi Firebase Admin aktif menggunakan Project ID ("${adminAppProject}"), bukan target resmi ("${TARGET_EXPECTED_PROJECT_ID}").`,
        details
      };
    }
  } else if (adminAppProject && adminAppProject !== TARGET_EXPECTED_PROJECT_ID) {
    return {
      valid: false,
      reason: `Koneksi Firebase Admin aktif menggunakan Project ID ("${adminAppProject}"), bukan target resmi ("${TARGET_EXPECTED_PROJECT_ID}").`,
      details
    };
  }

  return { valid: true, details };
}

/**
 * Classifies an individual record based on verifiable seed IDs and demo markers.
 * Strictly preserves Warung Ombay, Master Admin, system configs, universal categories, and real operational data.
 */
export function classifyRecord(collection: string, doc: any, dummyMerchantIds: Set<string>): {
  classification: RecordClassification;
  reason: string;
  intendedAction: 'DELETE' | 'PRESERVE' | 'FLAG_FOR_REVIEW';
  summaryText: string;
} {
  const docId = String(doc?.id || '');
  const idLower = docId.toLowerCase();
  const name = String(doc?.name || doc?.title || doc?.author || doc?.customerName || '').trim();
  const nameLower = name.toLowerCase();

  // 0. WARUNG OMBAY STRICT PRESERVATION (Owner's official business - WAJIB DIPERTAHANKAN)
  const isWarungOmbay = 
    nameLower.includes('ombay') || 
    idLower.includes('ombay') || 
    idLower === 'm_dql2xw0' ||
    idLower === 'item_dc1ut1c' ||
    doc?.merchantId === 'm_dql2xw0' ||
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
    const isTiedToDummyMerchant = isMerchantBound && dummyMerchantIds.has(doc.merchantId);
    const isUniversal = !isMerchantBound || UNIVERSAL_SYSTEM_CATEGORIES.has(nameLower);

    if (doc.isDemo === true || idLower.startsWith('cat_demo') || isTiedToDummyMerchant) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: isTiedToDummyMerchant 
          ? `Category bound to dummy merchant ID (${doc.merchantId})` 
          : 'Demo category marker / seed ID detected',
        intendedAction: 'DELETE',
        summaryText: `Category: "${name}" (ID: ${docId}, Merchant: ${doc.merchantId || 'system'})`
      };
    }

    if (isUniversal) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Universal system category required for catalog navigation',
        intendedAction: 'PRESERVE',
        summaryText: `Universal Category: "${name}" (ID: ${docId})`
      };
    }

    if (isMerchantBound && !isTiedToDummyMerchant) {
      return {
        classification: 'REAL_PRESERVED',
        reason: `Custom category belonging to active real merchant (${doc.merchantId})`,
        intendedAction: 'PRESERVE',
        summaryText: `Merchant Category: "${name}" (ID: ${docId}, Merchant: ${doc.merchantId})`
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
        reason: isSeedId ? `Known seed merchant ID "${docId}"` : 'Demo marker / seed business profile matched',
        intendedAction: 'DELETE',
        summaryText: `Merchant: "${name}" (${doc.ownerName || 'No Owner'}, ${doc.phone || 'No Phone'})`
      };
    }

    // Real registered merchant
    if (doc.phone && doc.address && !hasDemoMarker && !isDemoName) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Legitimate registered merchant with verified business details',
        intendedAction: 'PRESERVE',
        summaryText: `Merchant: "${name}" (${doc.ownerName}, Phone: ${doc.phone}, Address: ${doc.address})`
      };
    }

    // Ambiguous
    return {
      classification: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Incomplete record or uncertain origin. Requires human confirmation.',
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
          ? `Belongs to dummy merchant (${doc.merchantId})` 
          : isSeedId ? `Known seed menu ID "${docId}"` : 'Demo food item marker matched',
        intendedAction: 'DELETE',
        summaryText: `Menu Item: "${name}" (Rp ${doc.price || 0}, Merchant: ${doc.merchantId || 'none'})`
      };
    }

    if (doc.merchantId && !isBoundToDummyMerchant) {
      return {
        classification: 'REAL_PRESERVED',
        reason: `Menu item bound to active merchant (${doc.merchantId})`,
        intendedAction: 'PRESERVE',
        summaryText: `Menu Item: "${name}" (Rp ${doc.price || 0}, Merchant: ${doc.merchantId})`
      };
    }

    return {
      classification: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Unlinked menu item. Requires manual inspection.',
      intendedAction: 'FLAG_FOR_REVIEW',
      summaryText: `Menu Item: "${name}" (ID: ${docId})`
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
        reason: isSeedId ? `Known seed driver ID "${docId}"` : 'Demo driver profile or demo email matched',
        intendedAction: 'DELETE',
        summaryText: `Driver: "${name}" (${doc.phone || 'No Phone'}, Email: ${doc.email || 'None'})`
      };
    }

    if (doc.phone && doc.vehiclePlate) {
      return {
        classification: 'REAL_PRESERVED',
        reason: 'Real driver profile with registered vehicle plate',
        intendedAction: 'PRESERVE',
        summaryText: `Driver: "${name}" (${doc.vehiclePlate}, Phone: ${doc.phone})`
      };
    }

    return {
      classification: 'MANUAL_REVIEW_REQUIRED',
      reason: 'Incomplete driver registration. Retained for manual check.',
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
        reason: isDummyMerchant ? `Order placed at dummy merchant (${doc.merchantId})` : 'Seed order ID or test customer data',
        intendedAction: 'DELETE',
        summaryText: `Order: #${doc.orderNumber || docId} (${name}, Total: Rp ${doc.total || doc.pricing?.grandTotal || 0})`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Legitimate customer order transaction',
      intendedAction: 'PRESERVE',
      summaryText: `Order: #${doc.orderNumber || docId} (${name}, Total: Rp ${doc.total || doc.pricing?.grandTotal || 0})`
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
        reason: isDummyMerchant ? `Settlement for dummy merchant (${doc.merchantId})` : 'Seed settlement fixture',
        intendedAction: 'DELETE',
        summaryText: `Settlement: ID ${docId} (Merchant: ${doc.merchantId}, Rp ${doc.amount || 0})`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Valid operational merchant settlement record',
      intendedAction: 'PRESERVE',
      summaryText: `Settlement: ID ${docId} (Merchant: ${doc.merchantId}, Rp ${doc.amount || 0})`
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
        reason: 'Demo testimonial fixture / example review flag',
        intendedAction: 'DELETE',
        summaryText: `Testimonial: from "${name}" (ID: ${docId}, Rating: ${doc.rating || 5}★)`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Authentic customer testimonial',
      intendedAction: 'PRESERVE',
      summaryText: `Testimonial: from "${name}" (ID: ${docId})`
    };
  }

  // 10. PARTNER REGISTRATIONS
  if (collection === 'partnerRegistrations') {
    const isSeedId = idLower.startsWith('reg_test') || idLower.startsWith('demo-');
    const hasDemoMarker = doc.isDemo === true;
    const storeNameLower = String(doc.storeName || '').toLowerCase();
    const isDemoName = nameLower.includes('warung demo') || nameLower.includes('driver demo') || nameLower.includes('bu siti') || nameLower.includes('cak ahmad') || nameLower.includes('concurrency') || storeNameLower.includes('bu siti') || storeNameLower.includes('cak ahmad') || storeNameLower.includes('4619');
    const isDemoEmail = doc.email && (doc.email.includes('example.com') || doc.email.includes('demo.com') || doc.email.includes('dummy') || doc.email.includes('busiti_') || doc.email.includes('cak.ahmad') || /\d{6}/.test(doc.email));

    if (isSeedId || hasDemoMarker || isDemoName || isDemoEmail) {
      return {
        classification: 'DUMMY_CONFIRMED',
        reason: 'Test partner registration submission',
        intendedAction: 'DELETE',
        summaryText: `Registration: "${name}" (${doc.email}, Phone: ${doc.phone})`
      };
    }

    return {
      classification: 'REAL_PRESERVED',
      reason: 'Genuine partner onboarding registration waiting for review',
      intendedAction: 'PRESERVE',
      summaryText: `Registration: "${name}" (${doc.email}, Status: ${doc.status})`
    };
  }

  // Fallback for unspecified collections
  return {
    classification: 'MANUAL_REVIEW_REQUIRED',
    reason: `Unspecified collection "${collection}". Protected from automated cleanup.`,
    intendedAction: 'FLAG_FOR_REVIEW',
    summaryText: `Doc ${docId} in ${collection}`
  };
}

/**
 * Scans local JSON database file (tumpang_food_db.json).
 */
export function scanLocalDatabase(customFilePath?: string): {
  summary: Record<string, CollectionScanSummary>;
  preservedConfig: any;
  dummyMerchantIds: Set<string>;
} {
  const diskPath = customFilePath || foodConfig.localDbFile;
  let dbContent: any = {
    merchants: [],
    categories: [],
    menuItems: [],
    orders: [],
    drivers: [],
    settlements: [],
    partnerRegistrations: [],
    testimonials: [],
    systemConfig: null
  };

  if (fs.existsSync(diskPath)) {
    try {
      dbContent = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));
    } catch (e: any) {
      console.warn(`[LocalScan] Warning reading ${diskPath}:`, e.message);
    }
  }

  const dummyMerchantIds = new Set<string>();
  for (const m of (dbContent.merchants || [])) {
    const classified = classifyRecord('merchants', m, dummyMerchantIds);
    if (classified.classification === 'DUMMY_CONFIRMED') {
      dummyMerchantIds.add(m.id);
    }
  }

  const summary: Record<string, CollectionScanSummary> = {};

  for (const col of TARGET_COLLECTIONS) {
    const rawItems: any[] = dbContent[col] || [];
    const scannedItems: ScannedRecord[] = [];
    let dummyCount = 0;
    let preservedRealCount = 0;
    let manualReviewCount = 0;

    for (const item of rawItems) {
      const result = classifyRecord(col, item, dummyMerchantIds);
      if (result.classification === 'DUMMY_CONFIRMED') dummyCount++;
      if (result.classification === 'REAL_PRESERVED') preservedRealCount++;
      if (result.classification === 'MANUAL_REVIEW_REQUIRED') manualReviewCount++;

      scannedItems.push({
        collection: col,
        id: String(item.id),
        classification: result.classification,
        reason: result.reason,
        intendedAction: result.intendedAction,
        summaryText: result.summaryText,
        rawPayload: item,
        source: 'LOCAL'
      });
    }

    summary[col] = {
      collection: col,
      totalScanned: rawItems.length,
      dummyCount,
      preservedRealCount,
      manualReviewCount,
      items: scannedItems
    };
  }

  return {
    summary,
    preservedConfig: dbContent.systemConfig,
    dummyMerchantIds
  };
}

/**
 * Scans connected Cloud Firestore collections directly.
 * CRITICAL AUDIT RULE:
 * Never catch read errors and silently replace with [] to claim a collection is clean.
 * Every collection's status is individually recorded.
 * If any collection read fails or credentials are missing, mark entire cloud scan
 * as CLOUD_SCAN_NOT_COMPLETED and never conclude dummy count is zero.
 */
export async function scanCloudFirestore(customDb?: any): Promise<CloudScanResult> {
  const adminDb = customDb || getAdminDb();
  const adminApp = getAdminApp();
  const activeProject = getActiveProjectId();
  const adminAppProject = (customDb?.app?.options?.projectId ?? adminApp?.options?.projectId ?? '').trim();

  const collectionStatuses: Record<string, CollectionScanStatus> = {};
  for (const col of TARGET_COLLECTIONS) {
    collectionStatuses[col] = { collection: col, success: false, count: 0 };
  }

  // 1. Enforce Admin Project ID verification for Cloud operations
  const adminValidation = validateTargetProject({
    adminAppProject,
    requireAdminApp: true
  });

  if (!adminValidation.valid) {
    return {
      connected: false,
      isComplete: false,
      diagnostic: adminValidation.reason || 'ADMIN_PROJECT_INVALID',
      projectId: activeProject,
      adminAppProjectId: adminAppProject || undefined,
      collectionStatuses,
      failedCollections: [...TARGET_COLLECTIONS],
      summary: {},
      cloudDocsMap: {},
      dummyMerchantIds: new Set<string>(),
      totalDummy: null, // Strictly null: never report 0 dummy if credentials missing, invalid or disconnected!
      totalReal: 0,
      totalReview: 0
    };
  }

  // Probe live connection if no custom test db is passed
  let probe = {
    connected: Boolean(adminDb),
    diagnosticReason: adminDb ? 'OK' : 'MISSING_CREDENTIALS',
    projectId: activeProject
  };

  if (!customDb) {
    probe = await testFirestoreConnection();
  }

  if (!probe.connected || !adminDb) {
    return {
      connected: false,
      isComplete: false,
      diagnostic: probe.diagnosticReason || 'CLOUD_SCAN_NOT_COMPLETED',
      projectId: probe.projectId || activeProject,
      adminAppProjectId: adminAppProject || undefined,
      collectionStatuses,
      failedCollections: [...TARGET_COLLECTIONS],
      summary: {},
      cloudDocsMap: {},
      dummyMerchantIds: new Set<string>(),
      totalDummy: null, // Strictly null: never report 0 dummy if credentials missing or disconnected!
      totalReal: 0,
      totalReview: 0
    };
  }

  const cloudDocsMap: Record<string, any[]> = {};
  const dummyMerchantIds = new Set<string>();
  const failedCollections: string[] = [];

  // 1. Scan merchants first to resolve dummy merchant dependencies
  try {
    const snap = await adminDb.collection('merchants').get();
    const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    cloudDocsMap['merchants'] = docs;
    collectionStatuses['merchants'] = { collection: 'merchants', success: true, count: docs.length };

    for (const m of docs) {
      const classified = classifyRecord('merchants', m, dummyMerchantIds);
      if (classified.classification === 'DUMMY_CONFIRMED') {
        dummyMerchantIds.add(m.id);
      }
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn(`[CloudScan] Gagal memindai koleksi "merchants": ${errMsg}`);
    failedCollections.push('merchants');
    collectionStatuses['merchants'] = { collection: 'merchants', success: false, count: 0, error: errMsg };
    cloudDocsMap['merchants'] = [];
  }

  // 2. Scan remaining target collections
  for (const col of TARGET_COLLECTIONS) {
    if (col === 'merchants') continue;
    try {
      const snap = await adminDb.collection(col).get();
      const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      cloudDocsMap[col] = docs;
      collectionStatuses[col] = { collection: col, success: true, count: docs.length };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[CloudScan] Gagal memindai koleksi "${col}": ${errMsg}`);
      failedCollections.push(col);
      collectionStatuses[col] = { collection: col, success: false, count: 0, error: errMsg };
      cloudDocsMap[col] = [];
    }
  }

  const isComplete = failedCollections.length === 0;
  const diagnostic = isComplete ? 'OK' : 'CLOUD_SCAN_NOT_COMPLETED';

  // Build summary per collection
  const summary: Record<string, CollectionScanSummary> = {};
  let totalDummyCount = 0;
  let totalRealCount = 0;
  let totalReviewCount = 0;

  for (const col of TARGET_COLLECTIONS) {
    const status = collectionStatuses[col];
    if (!status.success) {
      summary[col] = {
        collection: col,
        totalScanned: 0,
        dummyCount: 0,
        preservedRealCount: 0,
        manualReviewCount: 0,
        items: []
      };
      continue;
    }

    const docs = cloudDocsMap[col] || [];
    const scannedItems: ScannedRecord[] = [];
    let dummyCount = 0;
    let preservedRealCount = 0;
    let manualReviewCount = 0;

    for (const doc of docs) {
      const result = classifyRecord(col, doc, dummyMerchantIds);
      if (result.classification === 'DUMMY_CONFIRMED') dummyCount++;
      if (result.classification === 'REAL_PRESERVED') preservedRealCount++;
      if (result.classification === 'MANUAL_REVIEW_REQUIRED') manualReviewCount++;

      scannedItems.push({
        collection: col,
        id: String(doc.id),
        classification: result.classification,
        reason: result.reason,
        intendedAction: result.intendedAction,
        summaryText: result.summaryText,
        rawPayload: doc,
        source: 'CLOUD'
      });
    }

    totalDummyCount += dummyCount;
    totalRealCount += preservedRealCount;
    totalReviewCount += manualReviewCount;

    summary[col] = {
      collection: col,
      totalScanned: docs.length,
      dummyCount,
      preservedRealCount,
      manualReviewCount,
      items: scannedItems
    };
  }

  return {
    connected: true,
    isComplete,
    diagnostic,
    projectId: probe.projectId || activeProject,
    adminAppProjectId: adminAppProject,
    collectionStatuses,
    failedCollections,
    summary,
    cloudDocsMap,
    dummyMerchantIds,
    totalDummy: isComplete ? totalDummyCount : null,
    totalReal: totalRealCount,
    totalReview: totalReviewCount
  };
}

/**
 * Creates and verifies persistent Cloud and Local backups before any live deletion.
 * CRITICAL AUDIT RULE:
 * 1. Must ensure all target collections were successfully scanned.
 * 2. Writes persistent backup to Cloud Firestore /admin_backups/{backupId} and subcollections.
 * 3. Reads back metadata document and records from Cloud Firestore to verify existence and counts.
 * 4. NEVER claims Cloud backup succeeded if only local file was written.
 * 5. If Cloud backup verification fails, blocks deletion, even if 0 dummy documents were found.
 */
export async function createAndVerifyCloudBackup(
  cloudDocsMap: Record<string, any[]>,
  activeProjectId: string,
  isScanComplete = true,
  customDb?: any
): Promise<{
  success: boolean;
  cloudVerified: boolean;
  backupId: string;
  backupFilePath: string;
  recordCount: number;
  error?: string;
}> {
  // Pre-condition: Scan completeness
  if (!isScanComplete) {
    return {
      success: false,
      cloudVerified: false,
      backupId: '',
      backupFilePath: '',
      recordCount: 0,
      error: 'Scan Cloud belum lengkap (CLOUD_SCAN_NOT_COMPLETED). Pembuatan backup Cloud ditolak demi keselamatan data.'
    };
  }

  const adminDb = customDb || getAdminDb();
  const adminApp = getAdminApp();
  const adminAppProject = (customDb?.app?.options?.projectId ?? adminApp?.options?.projectId ?? '').trim();

  // Pre-condition: Admin Project ID must be verified for Cloud backup
  const adminValidation = validateTargetProject({
    adminAppProject,
    requireAdminApp: true
  });
  if (!adminValidation.valid) {
    return {
      success: false,
      cloudVerified: false,
      backupId: '',
      backupFilePath: '',
      recordCount: 0,
      error: `Validasi identitas Cloud Admin gagal: ${adminValidation.reason}`
    };
  }

  if (!adminDb) {
    return {
      success: false,
      cloudVerified: false,
      backupId: '',
      backupFilePath: '',
      recordCount: 0,
      error: 'Koneksi Cloud Firestore Admin tidak tersedia. Tidak dapat membuat atau memverifikasi backup Cloud di admin_backups.'
    };
  }

  const timestamp = Date.now();
  const backupId = `pre_cleanup_${timestamp}`;
  const backupDir = path.join(process.cwd(), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const localExportPath = path.join(backupDir, `cloud_firestore_backup_${backupId}.json`);

  // Count total documents across all scanned collections
  let totalDocs = 0;
  const countsPerCollection: Record<string, number> = {};
  for (const col of TARGET_COLLECTIONS) {
    const list = cloudDocsMap[col] || [];
    countsPerCollection[col] = list.length;
    totalDocs += list.length;
  }

  const metadata = {
    source: 'Tumpang Food Safe Dummy Cleanup Utility',
    activeProjectId,
    expectedProjectId: TARGET_EXPECTED_PROJECT_ID,
    databaseId: foodConfig.databaseId,
    documentCount: totalDocs,
    createdAt: new Date().toISOString()
  };

  try {
    // 1. Write root metadata document to Cloud Firestore
    const backupRootRef = adminDb.collection('admin_backups').doc(backupId);
    await backupRootRef.set({
      id: backupId,
      createdAt: metadata.createdAt,
      metadata,
      summary: countsPerCollection
    });

    // 2. Write individual document records into subcollection admin_backups/{backupId}/records
    const allRecords: { id: string; targetCollection: string; data: any }[] = [];
    for (const col of TARGET_COLLECTIONS) {
      const list = cloudDocsMap[col] || [];
      for (const item of list) {
        if (item && item.id) {
          allRecords.push({
            id: `${col}__${item.id}`,
            targetCollection: col,
            data: item
          });
        }
      }
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allRecords.length; i += CHUNK_SIZE) {
      const chunk = allRecords.slice(i, i + CHUNK_SIZE);
      const batch = adminDb.batch();
      for (const rec of chunk) {
        const itemRef = backupRootRef.collection('records').doc(rec.id);
        batch.set(itemRef, {
          targetCollection: rec.targetCollection,
          docId: rec.data.id,
          payload: rec.data,
          backedUpAt: new Date().toISOString()
        });
      }
      await batch.commit();
    }

    // 3. READ-BACK VERIFICATION directly against Cloud Firestore
    const rootSnap = await backupRootRef.get();
    if (!rootSnap.exists) {
      throw new Error(`Dokumen metadata Cloud backup di admin_backups/${backupId} tidak dapat diverifikasi (tidak ditemukan setelah penulisan).`);
    }

    const rootData = rootSnap.data();
    if (!rootData || rootData.id !== backupId) {
      throw new Error(`Integritas root backup Cloud Firestore cacat: ID tidak cocok.`);
    }

    if (rootData.metadata?.documentCount !== totalDocs) {
      throw new Error(`Integritas metadata Cloud backup tidak cocok: tercatat ${rootData.metadata?.documentCount}, diharapkan ${totalDocs}.`);
    }

    // Verify records subcollection if totalDocs > 0
    if (totalDocs > 0) {
      const recordsSnap = await backupRootRef.collection('records').get();
      if (recordsSnap.docs.length !== totalDocs) {
        throw new Error(`Verifikasi kelengkapan record Cloud backup gagal: ditemukan ${recordsSnap.docs.length} record, diharapkan ${totalDocs}.`);
      }
    }

    // 4. Save local JSON replica as secondary audit copy
    const serialized = JSON.stringify({
      backupId,
      cloudVerified: true,
      metadata,
      collections: cloudDocsMap
    }, null, 2);
    fs.writeFileSync(localExportPath, serialized, 'utf-8');

    console.log(`🔒 [VERIFIED CLOUD BACKUP] Persistent backup tersimpan dan diverifikasi penuh di admin_backups/${backupId} (${totalDocs} dokumen).`);
    console.log(`🔒 [LOCAL REPLICA] Salinan cadangan lokal: ${localExportPath}`);

    return {
      success: true,
      cloudVerified: true,
      backupId,
      backupFilePath: localExportPath,
      recordCount: totalDocs
    };
  } catch (err: any) {
    const errorMsg = `Verifikasi Cloud Backup GAGAL: ${err.message || String(err)}`;
    console.error(`❌ [BACKUP VERIFICATION FAILURE] ${errorMsg}`);
    return {
      success: false,
      cloudVerified: false,
      backupId,
      backupFilePath: localExportPath,
      recordCount: totalDocs,
      error: errorMsg
    };
  }
}

/**
 * Creates and verifies local database backup file.
 */
export function createAndVerifyLocalBackup(customFilePath?: string): { success: boolean; backupFilePath: string; error?: string } {
  const diskPath = customFilePath || foodConfig.localDbFile;
  if (!fs.existsSync(diskPath)) {
    return { success: true, backupFilePath: '' };
  }

  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, `local_db_backup_${Date.now()}.json`);
  try {
    fs.copyFileSync(diskPath, backupPath);
    const stat = fs.statSync(backupPath);
    if (stat.size === 0) throw new Error('File backup lokal kosong (0 bytes).');
    JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

    return { success: true, backupFilePath: backupPath };
  } catch (err: any) {
    return { success: false, backupFilePath: backupPath, error: err.message };
  }
}

async function promptInteractiveConfirm(promptMsg: string): Promise<boolean> {
  // If running in non-interactive environment (CI/test/cron), never hang on stdin; safely reject
  if (!process.stdin || !process.stdin.isTTY) {
    console.log('ℹ️ Lingkungan non-interaktif terdeteksi tanpa --force. Eksekusi otomatis dibatalkan.');
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(promptMsg, answer => {
      rl.close();
      const clean = answer.trim().toUpperCase();
      resolve(clean === 'HAPUS' || clean === 'YES' || clean === 'Y');
    });
  });
}

/**
 * Main execution entry point.
 */
export async function runCleanup(
  args = process.argv.slice(2),
  customOptions?: {
    customDb?: any;
    customLocalDbPath?: string;
    customDeleteDoc?: (col: string, id: string) => Promise<boolean>;
    customVerifyDocAbsence?: (col: string, id: string) => Promise<boolean>;
  }
): Promise<FullAuditReport> {
  const isExecute = args.includes('--execute') || args.includes('-e');
  const isForce = args.includes('--force') || args.includes('-f') || args.includes('--confirm-production');
  const isCloudOnly = args.includes('--cloud-only');
  const isLocalOnly = args.includes('--local-only');
  const isDryRun = !isExecute || args.includes('--dry-run');

  const expectedProject = getExpectedProjectId();
  const activeProject = getActiveProjectId();
  const localTargetFile = customOptions?.customLocalDbPath || foodConfig.localDbFile;

  console.log('========================================================================');
  console.log('    TUMPANG FOOD — SAFE OPERATIONAL CLEANUP & DIRECT CLOUD SCANNER     ');
  console.log('========================================================================');
  console.log(`Mode:                 ${isDryRun ? '🔍 DRY RUN (Simulasi — TIDAK ADA DATA DIHAPUS)' : '⚡ LIVE EXECUTE (Penghapusan Sebenarnya)'}`);
  console.log(`Expected Project:     ${expectedProject}`);
  console.log(`Active Project:       ${activeProject}`);
  console.log(`Target Official:      ${TARGET_EXPECTED_PROJECT_ID}`);
  console.log(`Target Database ID:   ${foodConfig.databaseId}`);
  console.log(`Target Local File:    ${localTargetFile}`);
  console.log(`Timestamp:            ${new Date().toISOString()}\n`);

  // 1. Mandatory Project Validation BEFORE any operations
  const projectValidation = validateTargetProject({
    adminAppProject: customOptions?.customDb?.app?.options?.projectId
  });
  if (!projectValidation.valid) {
    console.error('------------------------------------------------------------------------');
    console.error('❌ [BLOCKED] VALIDASI PROJECT GAGAL SEBELUM PEMINDAIAN/MUTASI:');
    console.error(`   ${projectValidation.reason}`);
    console.error(`   Ekspektasi: "${TARGET_EXPECTED_PROJECT_ID}"`);
    console.error(`   Aktif:      "${activeProject}"`);
    console.error('⛔ Seluruh operasi pembersihan DIHENTIKAN untuk menjaga integritas project!');
    console.error('------------------------------------------------------------------------\n');
  }

  // 2. Scan Local Database (unless --cloud-only)
  const localScan = isCloudOnly 
    ? { summary: {}, preservedConfig: null, dummyMerchantIds: new Set<string>() } 
    : scanLocalDatabase(localTargetFile);

  // 3. Scan Cloud Firestore Directly (unless --local-only)
  const cloudScan = isLocalOnly 
    ? {
        connected: false,
        isComplete: false,
        diagnostic: 'SKIPPED_LOCAL_ONLY',
        projectId: activeProject,
        collectionStatuses: {},
        failedCollections: [],
        summary: {},
        cloudDocsMap: {},
        dummyMerchantIds: new Set<string>(),
        totalDummy: null,
        totalReal: 0,
        totalReview: 0
      }
    : await scanCloudFirestore(customOptions?.customDb);

  let totalLocalDummy = 0;
  let totalManualReview = 0;

  // Print Local Scan Results
  if (!isCloudOnly) {
    console.log('------------------------------------------------------------------------');
    console.log('📁 HASIL PEMINDAIAN DATABASE LOKAL (tumpang_food_db.json):');
    console.log('------------------------------------------------------------------------');
    for (const [col, summary] of Object.entries(localScan.summary)) {
      totalLocalDummy += summary.dummyCount;
      totalManualReview += summary.manualReviewCount;
      console.log(`• Koleksi: ${col.padEnd(22)} | Total: ${String(summary.totalScanned).padStart(3)} | Dummy: ${String(summary.dummyCount).padStart(3)} | Nyata: ${String(summary.preservedRealCount).padStart(3)} | Review: ${String(summary.manualReviewCount).padStart(3)}`);
      
      const dummies = summary.items.filter(i => i.classification === 'DUMMY_CONFIRMED');
      if (dummies.length > 0) {
        for (const item of dummies) {
          console.log(`   ❌ [WILL DELETE]  ID: ${item.id.padEnd(12)} -> ${item.summaryText} (${item.reason})`);
        }
      }
      const reviews = summary.items.filter(i => i.classification === 'MANUAL_REVIEW_REQUIRED');
      if (reviews.length > 0) {
        for (const item of reviews) {
          console.log(`   ⚠️ [MANUAL REVIEW] ID: ${item.id.padEnd(12)} -> ${item.summaryText} (${item.reason})`);
        }
      }
    }
  }

  // Print Cloud Firestore Scan Results (Honest & Granular)
  if (!isLocalOnly) {
    console.log('\n------------------------------------------------------------------------');
    console.log(`☁️ HASIL PEMINDAIAN LANGSUNG CLOUD FIRESTORE (Project: ${cloudScan.projectId}):`);
    console.log('------------------------------------------------------------------------');
    if (!cloudScan.connected) {
      console.log(`ℹ️ Status Cloud Firestore: OFFLINE / KREDENSIAL TIDAK TERSEDIA (${cloudScan.diagnostic}).`);
      console.log('   ⚠️ Status Scan Cloud:    CLOUD_SCAN_NOT_COMPLETED');
      console.log('   ⚠️ Kesimpulan Dummy:     TIDAK DAPAT DIHITUNG (Kredensial belum ada / offline).');
      console.log('   Hanya database lokal yang dapat diperiksa/dibersihkan. Semua penghapusan Cloud DIBLOKIR.');
    } else if (!cloudScan.isComplete) {
      console.log(`⚠️ Status Pemindaian: PEMINDAIAN PARSIAL / TIDAK LENGKAP (Status: CLOUD_SCAN_NOT_COMPLETED)`);
      console.log(`   Koleksi Gagal Dibaca: ${cloudScan.failedCollections.join(', ')}`);
      console.log(`   ⚠️ Kesimpulan Dummy:  TIDAK DAPAT DIHITUNG KARENA ADA KOLEKSI GAGAL DIPINDAI.`);
      for (const [col, status] of Object.entries(cloudScan.collectionStatuses)) {
        console.log(`• Status Koleksi: ${col.padEnd(20)} | Terbaca: ${status.success ? '✅ OK' : '❌ GAGAL'} | Dokumen: ${status.count}${status.error ? ` (${status.error})` : ''}`);
      }
    } else {
      console.log(`✅ Status Pemindaian: LENGKAP & TERHUBUNG (${TARGET_COLLECTIONS.length} koleksi terbaca sukses)`);
      for (const [col, summary] of Object.entries(cloudScan.summary)) {
        totalManualReview += summary.manualReviewCount;
        console.log(`• Koleksi Cloud: ${col.padEnd(20)} | Total: ${String(summary.totalScanned).padStart(3)} | Dummy: ${String(summary.dummyCount).padStart(3)} | Nyata: ${String(summary.preservedRealCount).padStart(3)} | Review: ${String(summary.manualReviewCount).padStart(3)}`);
        
        const dummies = summary.items.filter(i => i.classification === 'DUMMY_CONFIRMED');
        if (dummies.length > 0) {
          for (const item of dummies) {
            console.log(`   ❌ [WILL DELETE CLOUD]  ID: ${item.id.padEnd(12)} -> ${item.summaryText} (${item.reason})`);
          }
        }
        const reviews = summary.items.filter(i => i.classification === 'MANUAL_REVIEW_REQUIRED');
        if (reviews.length > 0) {
          for (const item of reviews) {
            console.log(`   ⚠️ [FLAGGED CLOUD REVIEW] ID: ${item.id.padEnd(12)} -> ${item.summaryText} (${item.reason})`);
          }
        }
      }
    }
  }

  // Protected Core Verification Display
  console.log('\n------------------------------------------------------------------------');
  console.log('🛡️ DATA SISTEM INTI YANG DIJAMIN 100% AMAN & DIPERTAHANKAN:');
  console.log('------------------------------------------------------------------------');
  console.log(`• Akun Master Admin:         ${foodConfig.masterAccount.email} (DIPERTAHANKAN)`);
  console.log(`• Tarif Pengiriman Flat:     Rp 5.000 (Tumpang) / Rp 7.500 (Pakis) (DIPERTAHANKAN)`);
  console.log(`• Biaya Layanan Berjenjang:  Tier 1-4 Aktif (DIPERTAHANKAN)`);
  console.log(`• Komisi Merchant:           10% (DIPERTAHANKAN)`);
  console.log(`• Konfigurasi QRIS Statis:   /qris-merchant.png (DIPERTAHANKAN)`);
  console.log(`• Kategori Sistem Universal: Makanan, Minuman, Cemilan, Aneka Nasi, dll. (DIPERTAHANKAN)`);
  console.log(`• Record Review Manual:      ${totalManualReview} dokumen (DIPERTAHANKAN — Tidak Dihapus)`);

  const report: FullAuditReport = {
    timestamp: new Date().toISOString(),
    projectValidation: {
      valid: projectValidation.valid,
      expectedProject: projectValidation.details.expected,
      activeProject: projectValidation.details.active,
      adminAppProject: projectValidation.details.adminApp,
      reason: projectValidation.reason
    },
    environment: {
      expectedProjectId: expectedProject,
      activeProjectId: activeProject,
      targetDatabaseId: foodConfig.databaseId,
      localDbFile: localTargetFile,
      cloudConnected: cloudScan.connected,
      cloudScanComplete: cloudScan.isComplete,
      cloudDiagnostic: cloudScan.diagnostic,
      cloudFailedCollections: cloudScan.failedCollections
    },
    preservedSystem: {
      masterAdminEmail: foodConfig.masterAccount.email,
      pricing: {
        defaultDeliveryFee: 5000,
        pakisDeliveryFee: 7500,
        commissionPercent: 10,
        tieredServiceFee: 'Tier 1 (Rp 1.000) s/d Tier 4 (Rp 4.000)',
        qrisImage: '/qris-merchant.png'
      },
      systemConfig: localScan.preservedConfig
    },
    localSummary: localScan.summary,
    cloudSummary: cloudScan.summary,
    cloudStatuses: cloudScan.collectionStatuses,
    totalLocalDummy,
    totalCloudDummy: cloudScan.totalDummy,
    totalManualReview,
    executionStatus: 'DRY_RUN'
  };

  // Dry-run mode termination
  if (isDryRun) {
    console.log('\n========================================================================');
    console.log('                      HASIL DRY-RUN SELESAI                             ');
    console.log('========================================================================');
    console.log(`• Status Project:                        ${projectValidation.valid ? '✅ VALID (tumpanggo-70479)' : '❌ INVALID'}`);
    console.log(`• Total Dokumen Dummy Lokal Terdeteksi:  ${totalLocalDummy}`);
    if (!cloudScan.connected || !cloudScan.isComplete) {
      console.log(`• Status Pemindaian Cloud Firestore:     ⚠️ CLOUD_SCAN_NOT_COMPLETED (${cloudScan.diagnostic})`);
      console.log(`• Total Dokumen Dummy Cloud Terdeteksi:  ⚠️ TIDAK DAPAT DISIMPULKAN (Belum dipindai penuh)`);
    } else {
      console.log(`• Status Pemindaian Cloud Firestore:     ✅ SELESAI & LENGKAP`);
      console.log(`• Total Dokumen Dummy Cloud Terdeteksi:  ${cloudScan.totalDummy}`);
    }
    console.log(`• Total Dokumen Memerlukan Review:       ${totalManualReview} (DIPERTAHANKAN)`);
    console.log(`• Mutasi Data Saat Ini:                  0 (Nol — AMAN, tidak ada data diubah)`);
    console.log('========================================================================\n');
    return report;
  }

  // EXECUTE MODE SAFEGUARDS
  console.log('\n========================================================================');
  console.log('             MEMULAI VALIDASI KESELAMATAN SEBELUM EKSEKUSI              ');
  console.log('========================================================================');

  // Check 1: Global Project Identity Validation
  if (!projectValidation.valid) {
    console.error(`❌ [BLOCKED] EKSEKUSI DIBATALKAN: Validasi Project ID gagal: ${projectValidation.reason}`);
    report.executionStatus = 'BLOCKED_SAFETY_CHECK';
    return report;
  }

  // Check 2: GLOBAL EXECUTION GATE (Combined run vs --local-only)
  if (!isLocalOnly) {
    // For any execution involving Cloud (default hybrid or --cloud-only):
    // Admin Project ID must be non-empty and strictly equal to 'tumpanggo-70479'
    const adminValidation = validateTargetProject({
      adminAppProject: cloudScan.adminAppProjectId,
      requireAdminApp: true
    });

    if (!adminValidation.valid || !cloudScan.connected || !cloudScan.isComplete) {
      console.error('\n------------------------------------------------------------------------');
      console.error('❌ [BLOCKED] GLOBAL EXECUTION GATE: EKSEKUSI DIHENTIKAN TOTAL SEBELUM MUTASI!');
      if (!adminValidation.valid) {
        console.error(`   Identitas Project Admin Cloud tidak terverifikasi: ${adminValidation.reason}`);
      }
      if (!cloudScan.connected) {
        console.error(`   Koneksi Cloud Firestore gagal atau kredensial belum ada (Status: ${cloudScan.diagnostic}).`);
      } else if (!cloudScan.isComplete) {
        console.error(`   Pemindaian Cloud Firestore tidak lengkap (Status: ${cloudScan.diagnostic}).`);
        console.error(`   Koleksi Cloud gagal dipindai: ${cloudScan.failedCollections.join(', ')}.`);
      }
      console.error('⛔ DATABASE LOKAL TIDAK BOLEH BERUBAH KETIKA EKSEKUSI GABUNGAN DIBLOKIR KARENA CLOUD TIDAK AMAN.');
      console.error('   Gunakan flag --local-only jika Anda bermaksud hanya membersihkan database lokal.');
      console.error('------------------------------------------------------------------------\n');

      report.executionStatus = 'BLOCKED_SAFETY_CHECK';
      return report;
    }
  }

  // Interactive confirmation
  if (!isForce) {
    console.log('\n⚠️ PERINGATAN KESELAMATAN EKSEKUSI:');
    console.log(`Target: ${!isCloudOnly ? `${totalLocalDummy} dummy lokal` : ''} ${!isLocalOnly && cloudScan.isComplete ? `dan ${cloudScan.totalDummy} dummy cloud` : ''}`);
    const confirmed = await promptInteractiveConfirm("Ketik 'HAPUS' untuk menyetujui eksekusi pembersihan: ");
    if (!confirmed) {
      console.log('❌ Eksekusi dibatalkan oleh pengguna.');
      report.executionStatus = 'CANCELLED_BY_USER';
      return report;
    }
  }

  // ============================================================================
  // PREREQUISITE BACKUP & VERIFICATION PHASE (Zero Mutations Guaranteed)
  // All required backups must be created and verified before ANY mutation begins!
  // ============================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('📦 FASE 1: PEMBUATAN & VERIFIKASI BACKUP (MUTASI BELUM DILAKUKAN)');
  console.log('------------------------------------------------------------------------');

  // Prerequisite 1: Local Database Backup (if run touches local DB)
  if (!isCloudOnly && fs.existsSync(localTargetFile)) {
    console.log('• Membuat dan memverifikasi backup keselamatan database lokal...');
    const localBackup = createAndVerifyLocalBackup(localTargetFile);
    if (!localBackup.success || !localBackup.backupFilePath) {
      console.error(`❌ [BLOCKED] Gagal membuat/memverifikasi backup lokal: ${localBackup.error || 'Backup path kosong'}.`);
      console.error('⛔ SELURUH OPERASI DIBATALKAN SEBELUM MUTASI DATA APA PUN!');
      report.executionStatus = 'BLOCKED_SAFETY_CHECK';
      return report;
    }
    console.log(`  ✅ Backup lokal terverifikasi sukses: ${localBackup.backupFilePath}`);
  }

  // Prerequisite 2: Cloud Firestore Persistent Backup (if run touches Cloud)
  if (!isLocalOnly) {
    console.log('• Membuat dan memverifikasi persistent backup di Cloud Firestore...');
    const cloudBackup = await createAndVerifyCloudBackup(
      cloudScan.cloudDocsMap,
      activeProject,
      cloudScan.isComplete,
      customOptions?.customDb
    );
    report.cloudBackupStatus = {
      attempted: true,
      success: cloudBackup.success,
      cloudVerified: cloudBackup.cloudVerified,
      backupId: cloudBackup.backupId,
      error: cloudBackup.error
    };

    if (!cloudBackup.success || !cloudBackup.cloudVerified) {
      console.error('\n------------------------------------------------------------------------');
      console.error(`❌ [BLOCKED] VERIFIKASI BACKUP CLOUD GAGAL: ${cloudBackup.error}`);
      console.error('⛔ SELURUH OPERASI EKSEKUSI DIBATALKAN SEBELUM MUTASI DATA APA PUN!');
      console.error('⛔ DATABASE LOKAL DAN CLOUD TETAP DALAM KONDISI ASLI (TIDAK ADA DATA DIUBAH).');
      console.error('------------------------------------------------------------------------\n');
      report.executionStatus = 'BLOCKED_SAFETY_CHECK';
      return report;
    }
    console.log(`  ✅ Backup Cloud terverifikasi sukses: ${cloudBackup.backupId}`);
  }

  // ============================================================================
  // MUTATION PHASE (Executed ONLY when ALL required backups are verified)
  // ============================================================================
  console.log('\n------------------------------------------------------------------------');
  console.log('⚡ FASE 2: MUTASI PEMBERSIHAN DATA (SEMUA BACKUP SUDAH TERVERIFIKASI)');
  console.log('------------------------------------------------------------------------');

  // Mutation Step 1: Local Database Sanitization
  if (!isCloudOnly && fs.existsSync(localTargetFile)) {
    console.log('\n1. Melakukan sanitasi database lokal...');
    const raw = fs.readFileSync(localTargetFile, 'utf-8');
    const dbData = JSON.parse(raw);

    // Relational safe order: child records (orders, settlements, menuItems, categories) before parent merchants
    for (const col of SAFE_DELETION_ORDER) {
      const summary = localScan.summary[col];
      if (!summary) continue;
      const dummyIds = new Set(summary.items.filter(i => i.classification === 'DUMMY_CONFIRMED').map(i => i.id));
      if (dummyIds.size > 0 && Array.isArray(dbData[col])) {
        const beforeCount = dbData[col].length;
        dbData[col] = dbData[col].filter((item: any) => !dummyIds.has(String(item.id)));
        const removed = beforeCount - dbData[col].length;
        console.log(`   ✅ Lokal: ${removed} dummy record dihapus dari ${col}`);
      }
    }

    fs.writeFileSync(localTargetFile, JSON.stringify(dbData, null, 2), 'utf-8');
    console.log(`   ✅ File ${localTargetFile} berhasil diperbarui.`);
  }

  // Mutation Step 2: Cloud Firestore Live Sanitization
  if (!isLocalOnly && cloudScan.connected && cloudScan.isComplete) {
    console.log('\n2. Melakukan penghapusan Cloud Firestore (Urutan Aman: Anak -> Induk)...');
    const cloudDeletionResults: CloudDeletionRecordResult[] = [];

    // Relational safe order: orders, settlements, menuItems, categories, drivers, testimonials, partnerRegistrations, merchants
    for (const col of SAFE_DELETION_ORDER) {
      const summary = cloudScan.summary[col];
      if (!summary) continue;
      const dummyItems = summary.items.filter(i => i.classification === 'DUMMY_CONFIRMED');
      for (const d of dummyItems) {
        let deleteSuccess = false;
        let verifiedAbsence = false;
        let deleteError: string | undefined;

        // 1. Execute Deletion
        try {
          if (customOptions?.customDeleteDoc) {
            deleteSuccess = await customOptions.customDeleteDoc(col, d.id);
            if (!deleteSuccess) {
              deleteError = `safeAdminDeleteDoc/customDeleteDoc mengembalikan false untuk ${col}/${d.id}`;
            }
          } else if (customOptions?.customDb) {
            await customOptions.customDb.collection(col).doc(d.id).delete();
            deleteSuccess = true;
          } else {
            const deleted = await safeAdminDeleteDoc(col, d.id);
            if (deleted) {
              deleteSuccess = true;
            } else {
              deleteSuccess = false;
              deleteError = `safeAdminDeleteDoc mengembalikan false untuk ${col}/${d.id}`;
            }
          }
        } catch (err: any) {
          deleteSuccess = false;
          deleteError = err?.message || String(err);
        }

        if (deleteSuccess) {
          console.log(`   🗑️ Cloud Firestore: Perintah hapus berhasil diproses untuk ${col}/${d.id}`);
        } else {
          console.error(`   ❌ [DELETE FAILED] Cloud Firestore: Gagal menghapus dokumen ${col}/${d.id}: ${deleteError}`);
        }

        // 2. Post-Deletion Absence Verification
        if (deleteSuccess) {
          try {
            if (customOptions?.customVerifyDocAbsence) {
              verifiedAbsence = await customOptions.customVerifyDocAbsence(col, d.id);
              if (!verifiedAbsence) {
                deleteError = `Dokumen ${col}/${d.id} masih ditemukan setelah penghapusan (verifikasi ketiadaan gagal).`;
              }
            } else if (customOptions?.customDb) {
              const checkSnap = await customOptions.customDb.collection(col).doc(d.id).get();
              if (!checkSnap.exists) {
                verifiedAbsence = true;
              } else {
                verifiedAbsence = false;
                deleteError = `Dokumen masih ditemukan di Cloud Firestore setelah penghapusan (${col}/${d.id}).`;
              }
            } else {
              const checkDoc = await safeAdminGetDoc(col, d.id);
              if (checkDoc === null) {
                verifiedAbsence = true;
              } else {
                verifiedAbsence = false;
                deleteError = `Dokumen masih ditemukan di Cloud Firestore setelah penghapusan (${col}/${d.id}).`;
              }
            }
          } catch (err: any) {
            verifiedAbsence = false;
            deleteError = `Gagal memverifikasi ketiadaan dokumen ${col}/${d.id}: ${err?.message || String(err)}`;
          }

          if (verifiedAbsence) {
            console.log(`   ✅ [VERIFIED ABSENCE] Dokumen ${col}/${d.id} terverifikasi benar-benar telah terhapus.`);
          } else {
            console.error(`   ❌ [UNVERIFIED] Dokumen ${col}/${d.id} gagal diverifikasi ketiadaannya: ${deleteError}`);
          }
        }

        cloudDeletionResults.push({
          collection: col,
          docId: d.id,
          deleteSuccess,
          verifiedAbsence,
          error: deleteError
        });
      }
    }

    const totalTargeted = cloudDeletionResults.length;
    const deletedCount = cloudDeletionResults.filter(r => r.deleteSuccess).length;
    const failedCount = cloudDeletionResults.filter(r => !r.deleteSuccess).length;
    const verifiedAbsenceCount = cloudDeletionResults.filter(r => r.verifiedAbsence).length;
    const unverifiedCount = cloudDeletionResults.filter(r => r.deleteSuccess && !r.verifiedAbsence).length;

    report.cloudDeletionResults = cloudDeletionResults;
    report.cloudDeletionSummary = {
      totalTargeted,
      deletedCount,
      failedCount,
      verifiedAbsenceCount,
      unverifiedCount
    };

    console.log('\n------------------------------------------------------------------------');
    console.log('📊 REKAPITULASI HASIL PENGHAPUSAN CLOUD FIRESTORE:');
    console.log(`• Target Dokumen Dummy:          ${totalTargeted}`);
    console.log(`• Berhasil Dihapus:              ${deletedCount}`);
    console.log(`• Gagal Dihapus:                 ${failedCount}`);
    console.log(`• Terverifikasi Ketiadaannya:    ${verifiedAbsenceCount}`);
    console.log(`• Tidak Terverifikasi/Masih Ada: ${unverifiedCount}`);
    console.log('------------------------------------------------------------------------');

    if (failedCount > 0 || unverifiedCount > 0) {
      report.executionStatus = (verifiedAbsenceCount > 0) ? 'EXECUTED_PARTIAL' : 'EXECUTED_WITH_ERRORS';
      console.error(`⚠️ Operasi penghapusan Cloud selesai dengan kegagalan (Status: ${report.executionStatus}).`);
    } else {
      report.executionStatus = 'EXECUTED_SUCCESS';
    }
  } else {
    report.executionStatus = 'EXECUTED_SUCCESS';
  }

  console.log('\n========================================================================');
  console.log('           PEMBERSIHAN DATA OPERASIONAL SELESAI DENGAN AMAN             ');
  console.log('========================================================================\n');

  return report;
}

// Auto-run when invoked directly from CLI
if (process.argv[1] && (process.argv[1].endsWith('cleanup_dummy_data.ts') || process.argv[1].endsWith('cleanup_dummy_data.js'))) {
  runCleanup().catch(err => {
    console.error('Fatal cleanup error:', err);
    process.exit(1);
  });
}
