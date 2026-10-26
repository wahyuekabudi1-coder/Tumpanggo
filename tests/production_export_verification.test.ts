/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Production Firestore Export Verification Test Suite
 * 
 * Tests the export pipeline locally without touching live production Firestore:
 * 1. Confirms legacy scripts/export_to_supabase.ts only read local JSON snapshots.
 * 2. Tests cursor-based pagination and controlled batch querying using Firestore mock.
 * 3. Tests preservation of authentic IDs, PBKDF2 password hashes, timestamps, and order items JSON.
 * 4. Tests sanitization of secrets and plaintext credentials.
 * 5. Tests concurrent modification detection during the export window.
 * 6. Tests foreign key and schema validation against Supabase constraints.
 * 7. Tests PostgreSQL SQL dump generation and relational dependency ordering.
 * 8. Confirms export manifests and dumps are stored in dedicated export directories without auto-importing.
 */

import fs from 'fs';
import path from 'path';
import {
  executeProductionFirestoreExport,
  validateExportData,
  sanitizeDocument,
  normalizeTimestamp,
  generateProductionSupabaseSql,
  TARGET_COLLECTIONS
} from '../src/server/services/firestoreProductionExportService';
import { requireRole } from '../src/server/auth';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

/**
 * Creates an in-memory mock Firestore instance supporting cursor pagination (.orderBy, .limit, .startAfter, .count).
 */
function createMockFirestore(collectionsMap: Record<string, any[]>) {
  return {
    collection: (colName: string) => {
      const allDocs = [...(collectionsMap[colName] || [])];
      // Sort docs by id as Firestore does when ordering by documentId
      allDocs.sort((a, b) => (a.id > b.id ? 1 : -1));

      return {
        count: () => ({
          get: async () => ({
            data: () => ({ count: allDocs.length })
          })
        }),
        orderBy: (field: any) => {
          let currentDocs = [...allDocs];
          let queryLimit = allDocs.length;
          let afterId: string | null = null;

          const queryObj: any = {
            limit: (n: number) => {
              queryLimit = n;
              return queryObj;
            },
            startAfter: (lastDocSnap: any) => {
              afterId = lastDocSnap?.id || null;
              return queryObj;
            },
            get: async () => {
              let sliced = currentDocs;
              if (afterId) {
                const idx = sliced.findIndex(d => d.id === afterId);
                if (idx !== -1) {
                  sliced = sliced.slice(idx + 1);
                }
              }
              const resultDocs = sliced.slice(0, queryLimit).map(d => ({
                id: d.id,
                data: () => ({ ...d })
              }));
              return {
                empty: resultDocs.length === 0,
                docs: resultDocs
              };
            }
          };

          return queryObj;
        }
      };
    }
  } as any;
}

async function runTestSuite() {
  console.log('=====================================================================');
  console.log('   TUMPANGGO PRODUCTION FIRESTORE EXPORT AUDIT & VERIFICATION');
  console.log('   Local Test Execution - ZERO Calls to Live Production Database');
  console.log('=====================================================================\n');

  // TEST 1: Verification of legacy export_to_supabase.ts
  console.log('--- TEST SUITE 1: Verifikasi Skrip Ekspor Lama ---');
  const legacyScriptPath = path.resolve(process.cwd(), 'scripts/export_to_supabase.ts');
  const legacyContent = fs.readFileSync(legacyScriptPath, 'utf-8');
  assert(
    legacyContent.includes('tumpang_food_db.json'),
    'Skrip lama terbukti membaca file JSON lokal tumpang_food_db.json'
  );
  assert(
    !legacyContent.includes('firebase-admin') && !legacyContent.includes('getFirestore'),
    'Skrip lama terbukti TIDAK menggunakan Firestore Admin SDK atau koneksi live cloud'
  );

  // TEST 2: Target Collection Coverage
  console.log('\n--- TEST SUITE 2: Kelengkapan Koleksi yang Diekspor ---');
  const expectedCollections = [
    'systemConfig', 'merchants', 'categories', 'menuItems', 'drivers',
    'orders', 'settlements', 'partnerRegistrations', 'testimonials', 'auditLogs'
  ];
  for (const col of expectedCollections) {
    assert(
      (TARGET_COLLECTIONS as readonly string[]).includes(col),
      `Target koleksi mencakup "${col}"`
    );
  }

  // TEST 3: Cursor Pagination with Controlled Batch Size
  console.log('\n--- TEST SUITE 3: Pengujian Cursor Pagination & Streaming Query ---');
  // Generate 235 mock merchant documents
  const mockMerchants: any[] = [];
  for (let i = 1; i <= 235; i++) {
    const id = `m_store_${String(i).padStart(3, '0')}`;
    mockMerchants.push({
      id,
      name: `Warung Mitra ${i}`,
      phone: `08123456${String(i).padStart(4, '0')}`,
      password_hash: `pbkdf2_sha256$260000$salt${i}$authentic_hash_string`,
      category: 'Nasi & Lauk',
      active: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    });
  }

  const mockDb = createMockFirestore({
    merchants: mockMerchants,
    categories: [],
    menuItems: [],
    drivers: [],
    orders: [],
    settlements: [],
    partnerRegistrations: [],
    testimonials: [],
    auditLogs: [],
    systemConfig: [{ id: 'config_1', serviceFee: 2000, defaultDeliveryFee: 5000 }]
  });

  const batchesReceived: number[] = [];
  const exportResult = await executeProductionFirestoreExport({
    customDb: mockDb,
    batchSize: 50,
    skipFileWrite: true,
    onProgress: (col, batchNum, count) => {
      if (col === 'merchants') {
        batchesReceived.push(count);
      }
    }
  });

  assert(exportResult.success, 'Ekspor paginasi kursor berhasil dijalankan');
  assert(
    exportResult.manifest.collections.merchants.exportedCount === 235,
    'Seluruh 235 dokumen merchant berhasil diekstraksi tanpa terpotong'
  );
  assert(
    exportResult.manifest.collections.merchants.batchesProcessed === 5,
    'Paginasi memproses dokumen dalam 5 batch terkendali (batch size 50)'
  );

  // TEST 4: PBKDF2 Password Hash Preservation & Secret Sanitization
  console.log('\n--- TEST SUITE 4: Preservasi Password Hash & Sanitasi Rahasia ---');
  const rawMerchantDoc = {
    id: 'm_authentic_1',
    name: 'Warung Bu Sri Tumpang',
    password_hash: 'pbkdf2_sha256$260000$randomSalt$verySecurePBKDF2HashPayload123==',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----',
    apiSecret: 'secret_live_api_token_12345',
    createdAt: new Date('2025-01-10T10:00:00Z')
  };

  const sanitized = sanitizeDocument('merchants', rawMerchantDoc);
  assert(
    sanitized.password_hash === rawMerchantDoc.password_hash,
    'Hash password PBKDF2 merchant tetap dipertahankan 100% utuh'
  );
  assert(
    sanitized.private_key === undefined,
    'Kunci privat sistem berhasil dibersihkan dari dokumen ekspor'
  );
  assert(
    sanitized.apiSecret === undefined,
    'Kunci API rahasia berhasil dibersihkan dari dokumen ekspor'
  );
  assert(
    typeof sanitized.createdAt === 'string' && sanitized.createdAt === '2025-01-10T10:00:00.000Z',
    'Timestamp Firestore berhasil dinormalisasi menjadi ISO 8601 string'
  );

  // System config sanitization check
  const rawSysConfig = {
    id: 'config_1',
    serviceFee: 2000,
    masterAccount: {
      email: 'master@tumpanggo.com',
      password: 'plain_master_password_must_be_stripped',
      passwordHash: 'pbkdf2_sha256$260000$masterSalt$masterHash'
    }
  };
  const sanitizedConfig = sanitizeDocument('systemConfig', rawSysConfig);
  assert(
    sanitizedConfig.masterAccount.password === undefined,
    'Password master akun dalam plaintext berhasil dibersihkan'
  );
  assert(
    sanitizedConfig.masterAccount.passwordHash === rawSysConfig.masterAccount.passwordHash,
    'Password hash master akun tetap dipertahankan'
  );

  // TEST 5: Concurrent Modification Detection
  console.log('\n--- TEST SUITE 5: Deteksi Modifikasi Data Konkuren Selama Ekspor ---');
  const futureTimestamp = new Date(Date.now() + 100000).toISOString();
  const mockWithConcurrentChanges = createMockFirestore({
    merchants: [
      { id: 'm_c1', name: 'M1', updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'm_c2', name: 'M2', updatedAt: futureTimestamp } // modified concurrently
    ],
    categories: [], menuItems: [], drivers: [], orders: [], settlements: [],
    partnerRegistrations: [], testimonials: [], auditLogs: [], systemConfig: []
  });

  const concurrentTestResult = await executeProductionFirestoreExport({
    customDb: mockWithConcurrentChanges,
    skipFileWrite: true
  });
  assert(
    concurrentTestResult.manifest.collections.merchants.concurrentChangesDetected === 1,
    'Sistem berhasil mendeteksi dan mencatat 1 dokumen yang berubah secara konkuren saat ekspor'
  );

  // TEST 6: Schema and Foreign Key Validation
  console.log('\n--- TEST SUITE 6: Validasi Schema dan Foreign Key Supabase ---');
  // Scenario A: Valid relational graph
  const validGraph = {
    merchants: [{ id: 'm_100', name: 'Toko Berkah' }],
    categories: [{ id: 'cat_100', merchantId: 'm_100', name: 'Makanan' }],
    menuItems: [{ id: 'item_100', merchantId: 'm_100', categoryId: 'cat_100', name: 'Bakso' }],
    drivers: [{ id: 'drv_100', name: 'Pak Budi' }],
    orders: [{ id: 'ord_100', merchantId: 'm_100', driverId: 'drv_100', items: [{ name: 'Bakso', qty: 1 }] }],
    settlements: [{ id: 'set_100', merchantId: 'm_100' }],
    partnerRegistrations: [{ id: 'reg_100', type: 'MERCHANT' }],
    testimonials: [{ id: 'rev_100', rating: 5 }],
    auditLogs: [{ id: 'log_100', action: 'INIT' }],
    systemConfig: [{ id: 'config_1' }]
  };
  const validReport = validateExportData(validGraph);
  assert(validReport.isValid, 'Graf relasi yang valid lulus validasi schema Supabase (0 error)');
  assert(validReport.totalErrors === 0, 'Jumlah error relasional adalah 0');

  // Scenario B: Broken foreign key (orphaned category and orphaned order)
  const brokenGraph = {
    merchants: [{ id: 'm_200', name: 'Toko Sah' }],
    categories: [
      { id: 'cat_201', merchantId: 'm_NON_EXISTENT', name: 'Kategori Yatim' }
    ],
    menuItems: [
      { id: 'item_201', merchantId: 'm_NON_EXISTENT', categoryId: 'cat_201', name: 'Menu Yatim' }
    ],
    drivers: [],
    orders: [
      { id: 'ord_201', merchantId: 'm_NON_EXISTENT', driverId: 'drv_missing' }
    ],
    settlements: [], partnerRegistrations: [], testimonials: [], auditLogs: [], systemConfig: []
  };
  const brokenReport = validateExportData(brokenGraph);
  assert(!brokenReport.isValid, 'Graf data yatim (orphaned FK) ditandai tidak valid');
  assert(brokenReport.totalErrors >= 3, `Ditemukan ${brokenReport.totalErrors} error integritas referensial`);

  // TEST 7: Supabase SQL Generation & Dependency Order
  console.log('\n--- TEST SUITE 7: Pengecekan Sintaks dan Urutan SQL Dump ---');
  const sqlDump = generateProductionSupabaseSql(validGraph, {
    targetProjectId: 'tumpanggo-70479',
    exportStartedAt: '2026-10-26T12:00:00.000Z'
  });

  assert(
    sqlDump.includes('SOURCE: CLOUD FIRESTORE PRODUCTION PROJECT tumpanggo-70479'),
    'Header SQL mencantumkan penanda sumber Cloud Firestore produksi'
  );
  assert(
    sqlDump.includes('BEGIN;') && sqlDump.includes('COMMIT;'),
    'SQL dump dibungkus dalam transaksi atomik BEGIN dan COMMIT'
  );

  const idxMerchants = sqlDump.indexOf('INSERT INTO merchants');
  const idxCategories = sqlDump.indexOf('INSERT INTO categories');
  const idxMenuItems = sqlDump.indexOf('INSERT INTO menu_items');
  const idxOrders = sqlDump.indexOf('INSERT INTO orders');

  assert(
    idxMerchants < idxCategories && idxCategories < idxMenuItems && idxMenuItems < idxOrders,
    'Urutan INSERT mematuhi foreign key dependency: merchants -> categories -> menu_items -> orders'
  );

  // TEST 8: Output Directory Isolation Verification
  console.log('\n--- TEST SUITE 8: Isolasi File Ekspor dari Seed Lokal ---');
  const testOutputDir = path.resolve(process.cwd(), 'exports', 'test_isolation_verification');
  if (fs.existsSync(testOutputDir)) {
    fs.rmSync(testOutputDir, { recursive: true, force: true });
  }

  const fileWriteResult = await executeProductionFirestoreExport({
    customDb: mockDb,
    outputDir: testOutputDir,
    skipFileWrite: false
  });

  assert(fileWriteResult.success, 'Ekspor dengan penulisan file berhasil');
  assert(
    fs.existsSync(path.join(testOutputDir, 'PRODUCTION_EXPORT_MANIFEST.json')),
    'File manifest PRODUCTION_EXPORT_MANIFEST.json tercipta'
  );
  assert(
    fs.existsSync(path.join(testOutputDir, 'production_supabase_dump.sql')),
    'File production_supabase_dump.sql tercipta di direktori ekspor terpisah'
  );
  assert(
    fs.existsSync(path.join(testOutputDir, 'EXPORT_REPORT.md')),
    'File ringkasan laporan audit EXPORT_REPORT.md tercipta'
  );

  // Clean up test verification directory
  fs.rmSync(testOutputDir, { recursive: true, force: true });

  // TEST 9: Strict RBAC Authorization Verification
  console.log('\n--- TEST SUITE 9: Otorisasi Server MASTER_ADMIN vs ADMIN ---');
  const masterOnlyMiddleware = requireRole(['MASTER_ADMIN']);
  const adminAllowedMiddleware = requireRole(['ADMIN']);

  let unauthBlocked = false;
  const mockReqUnauth: any = { user: undefined };
  const mockResUnauth: any = {
    status: (code: number) => {
      if (code === 401) unauthBlocked = true;
      return { json: () => {} };
    }
  };
  masterOnlyMiddleware(mockReqUnauth, mockResUnauth, () => {});
  assert(unauthBlocked, 'Permintaan tanpa otentikasi ditolak dengan HTTP 401');

  let regularAdminBlocked = false;
  const mockReqAdmin: any = { user: { userId: 'admin_1', role: 'ADMIN' } };
  const mockResAdmin: any = {
    status: (code: number) => {
      if (code === 403) regularAdminBlocked = true;
      return { json: () => {} };
    }
  };
  masterOnlyMiddleware(mockReqAdmin, mockResAdmin, () => {});
  assert(regularAdminBlocked, 'Peran ADMIN biasa diblokir dengan HTTP 403 pada endpoint MASTER_ADMIN');

  let masterPassed = false;
  const mockReqMaster: any = { user: { userId: 'master_1', role: 'MASTER_ADMIN' } };
  const mockResMaster: any = {
    status: () => ({ json: () => {} })
  };
  masterOnlyMiddleware(mockReqMaster, mockResMaster, () => {
    masterPassed = true;
  });
  assert(masterPassed, 'Peran MASTER_ADMIN diizinkan mengakses endpoint khusus MASTER_ADMIN');

  let regularAdminAllowedForGeneralAdmin = false;
  adminAllowedMiddleware(mockReqAdmin, mockResAdmin, () => {
    regularAdminAllowedForGeneralAdmin = true;
  });
  assert(regularAdminAllowedForGeneralAdmin, 'Peran ADMIN tetap diizinkan pada endpoint umum ADMIN');

  console.log('\n=====================================================================');
  console.log(`HASIL AKHIR: ${passedTests}/${totalTests} PENGUJIAN BERHASIL.`);
  if (passedTests === totalTests) {
    console.log('✓ SELURUH MEKANISME EKSPOR FIRESTORE PRODUKSI TERVERIFIKASI.');
  } else {
    console.error(`✗ ADA ${totalTests - passedTests} PENGUJIAN GAGAL.`);
    process.exit(1);
  }
  console.log('=====================================================================\n');
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
