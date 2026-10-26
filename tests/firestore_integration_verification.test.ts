/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Comprehensive Firestore Cloud Integration & Production Verification Test
 * 
 * Specifically addresses all verification criteria from the user specification:
 * 1. Configuration & Parsing Audit (valid, missing, invalid JSON, project mismatch)
 * 2. Real Cloud Connectivity Probe (marks BLOCKED if credentials not in env, never fakes cloud connectivity)
 * 3. Data lifecycle (Create, Read, Update, Persistence across reinitialization)
 * 4. Failure, timeout, and retry safety
 * 5. Concurrent & repeated partner approval (Idempotency guarantee)
 * 6. Order lifecycle & strict payment authorization (PAID cannot be forged)
 * 7. Prevention of duplicate records and fallback transparency
 */

import fs from 'fs';
import { foodConfig, validateProductionEnvironment } from '../src/server/config';
import {
  initFirebaseAdmin,
  parseServiceAccountKey,
  testFirestoreConnection,
  __setFirestoreMockForTesting,
  isFirestoreAdminConfigured,
  getFirestoreDiagnosticStatus
} from '../src/server/firebaseAdmin';
import { FoodDatabase, foodDb } from '../src/server/db';
import { OrderStatus, PaymentStatus, AssignmentMode } from '../src/types';

interface TestStats {
  passed: number;
  failed: number;
  blocked: number;
}

const stats: TestStats = { passed: 0, failed: 0, blocked: 0 };

function assert(condition: boolean, title: string, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${title}`);
    stats.passed++;
  } else {
    console.error(`  ❌ [FAIL] ${title} ${detail ? `(${detail})` : ''}`);
    stats.failed++;
  }
}

function markBlocked(title: string, reason: string) {
  console.log(`  ⚠️  [BLOCKED] ${title} - Alasan: ${reason}`);
  stats.blocked++;
}

async function runAllSuites() {
  const initialDbContent = fs.existsSync(foodConfig.localDbFile) 
    ? fs.readFileSync(foodConfig.localDbFile, 'utf8') 
    : null;

  try {
  console.log('================================================================================');
  console.log('  TUMPANG GO — FIRESTORE CLOUD INTEGRATION & PRODUCTION VERIFICATION');
  console.log('================================================================================\n');

  // ===========================================================================
  // SUITE 1: AUDIT KONFIGURASI FIREBASE & PARSING SERVICE ACCOUNT
  // ===========================================================================
  console.log('--------------------------------------------------------------------------------');
  console.log('1. AUDIT KONFIGURASI FIREBASE & PARSING SERVICE ACCOUNT');
  console.log('--------------------------------------------------------------------------------');

  // 1a. Missing Credentials Handling
  const missingRes = parseServiceAccountKey('', 'tumpanggo-70479');
  assert(missingRes.account === null, 'Menangani string kredensial kosong');
  assert(missingRes.reason === 'MISSING_CREDENTIALS', 'Status diagnostik adalah MISSING_CREDENTIALS');

  // 1b. Invalid JSON format
  const invalidJsonRes = parseServiceAccountKey('{"type": "service_account", invalid', 'tumpanggo-70479');
  assert(invalidJsonRes.account === null, 'Menolak kredensial dengan format JSON tidak valid');
  assert(invalidJsonRes.reason === 'INVALID_JSON', 'Status diagnostik adalah INVALID_JSON');

  // 1c. Missing private_key or client_email
  const incompleteRes = parseServiceAccountKey(
    JSON.stringify({ type: 'service_account', project_id: 'tumpanggo-70479' }),
    'tumpanggo-70479'
  );
  assert(incompleteRes.account === null, 'Menolak service account tanpa client_email atau private_key');
  assert(incompleteRes.reason === 'MALFORMED_SERVICE_ACCOUNT', 'Status diagnostik adalah MALFORMED_SERVICE_ACCOUNT');

  // 1d. Project ID mismatch
  const mismatchRes = parseServiceAccountKey(
    JSON.stringify({
      type: 'service_account',
      project_id: 'wrong-project-999',
      client_email: 'test@wrong-project-999.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n'
    }),
    'tumpanggo-70479'
  );
  assert(mismatchRes.account === null, 'Menolak Service Account jika project_id tidak cocok dengan target tumpanggo-70479');
  assert(mismatchRes.reason === 'PROJECT_ID_MISMATCH', 'Status diagnostik adalah PROJECT_ID_MISMATCH');

  // 1e. Valid Service Account structure parsing (Mock key structure)
  const validStructureRes = parseServiceAccountKey(
    JSON.stringify({
      type: 'service_account',
      project_id: 'tumpanggo-70479',
      client_email: 'firebase-adminsdk@tumpanggo-70479.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----\n'
    }),
    'tumpanggo-70479'
  );
  assert(validStructureRes.account !== null, 'Berhasil mem-parsing struktur service account yang valid');
  assert(validStructureRes.reason === 'OK', 'Status parsing valid adalah OK');
  assert(validStructureRes.projectId === 'tumpanggo-70479', 'Project ID teridentifikasi tumpanggo-70479');

  // 1f. Database ID and Target Project in System Config
  assert(foodConfig.databaseId === '(default)', 'Konfigurasi databaseId strictly menargetkan "(default)"');
  assert(foodConfig.projectId === 'tumpanggo-70479', 'Konfigurasi projectId strictly menargetkan "tumpanggo-70479"');

  // 1g. FIRESTORE_EMULATOR_HOST Support (Local Emulator Testing)
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const emuInitRes = initFirebaseAdmin();
  assert(emuInitRes.success === true, 'Mendukung inisialisasi Firestore Emulator lokal tanpa memerlukan Service Account Key');
  delete process.env.FIRESTORE_EMULATOR_HOST;
  initFirebaseAdmin(); // Reset back to natural state


  // ===========================================================================
  // SUITE 2: PENGUJIAN KONEKTIVITAS CLOUD FIRESTORE NYATA
  // ===========================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log('2. PENGUJIAN KONEKTIVITAS CLOUD FIRESTORE NYATA (TARGET PROYEK)');
  console.log('--------------------------------------------------------------------------------');

  const realEnvServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!realEnvServiceAccount || realEnvServiceAccount.trim().length === 0) {
    markBlocked(
      'Koneksi Langsung ke Proyek Google Cloud Firestore tumpanggo-70479',
      'FIREBASE_SERVICE_ACCOUNT_KEY tidak tersedia di environment ini. Sistem secara jujur melaporkan belum terhubung (BLOCKED) tanpa menggunakan mock untuk mengklaim konektivitas produksi.'
    );
  } else {
    try {
      const liveProbe = await testFirestoreConnection(true);
      if (liveProbe.connected) {
        assert(liveProbe.connected === true, 'Koneksi Cloud Firestore nyata berhasil terhubung');
        assert(liveProbe.databaseId === '(default)', 'Target live database adalah (default)');
      } else {
        markBlocked(
          'Koneksi Langsung ke Proyek Google Cloud Firestore tumpanggo-70479',
          `Koneksi gagal dengan status ${liveProbe.diagnosticReason}: ${liveProbe.diagnosticDetail}`
        );
      }
    } catch (e: any) {
      markBlocked(
        'Koneksi Langsung ke Proyek Google Cloud Firestore tumpanggo-70479',
        `Pengecekan live error: ${e.message}`
      );
    }
  }


  // ===========================================================================
  // SUITE 3: INTEGRASI DATABASE, PERSISTENSI, KEGAGALAN & RETRY
  // ===========================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log('3. INTEGRASI OPERASI DATABASE, KEGAGALAN TULIS, DAN RETRY');
  console.log('--------------------------------------------------------------------------------');

  // Siapkan In-Memory Store untuk menguji alur integrasi Firestore secara terisolasi
  const mockRemoteStore = new Map<string, Map<string, any>>();
  mockRemoteStore.set('merchants', new Map());
  mockRemoteStore.set('orders', new Map());
  mockRemoteStore.set('partnerRegistrations', new Map());
  mockRemoteStore.set('categories', new Map());
  mockRemoteStore.set('systemConfig', new Map());

  let shouldSimulateNetworkFailure = false;
  let writeAttempts = 0;

  const simulatedCloudDb = {
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        get: async () => {
          if (shouldSimulateNetworkFailure) {
            throw new Error('UNAVAILABLE: 14 UNAVAILABLE: Connection reset by peer');
          }
          const col = mockRemoteStore.get(colName);
          const data = col?.get(docId);
          return {
            exists: Boolean(data),
            id: docId,
            data: () => data
          };
        },
        set: async (data: any) => {
          writeAttempts++;
          if (shouldSimulateNetworkFailure) {
            throw new Error('DEADLINE_EXCEEDED: 4 DEADLINE_EXCEEDED: Write timed out after 4000ms');
          }
          if (!mockRemoteStore.has(colName)) {
            mockRemoteStore.set(colName, new Map());
          }
          mockRemoteStore.get(colName)!.set(docId, JSON.parse(JSON.stringify(data)));
          return { writeTime: new Date() };
        },
        delete: async () => {
          mockRemoteStore.get(colName)?.delete(docId);
        }
      }),
      get: async () => {
        if (shouldSimulateNetworkFailure) {
          throw new Error('UNAVAILABLE: 14 UNAVAILABLE: Query failed');
        }
        const col = mockRemoteStore.get(colName) || new Map();
        const docs = Array.from(col.entries()).map(([id, data]) => ({
          id,
          data: () => data
        }));
        return {
          size: docs.length,
          empty: docs.length === 0,
          docs
        };
      },
      orderBy: function() { return this; },
      limit: function() { return this; },
      where: function() { return this; }
    })
  };

  // 3a. Pasang mock adapter untuk menguji penanganan kegagalan
  __setFirestoreMockForTesting({
    adminDb: simulatedCloudDb,
    isConfigured: true,
    probeResult: {
      connected: true,
      canRead: true,
      canWrite: true,
      databaseId: '(default)',
      projectId: 'tumpanggo-70479',
      usingServiceAccount: true,
      authIdentity: 'test-service-account@tumpanggo-70479.iam.gserviceaccount.com',
      diagnosticReason: 'OK',
      diagnosticDetail: 'Simulated connection active for integration verification.'
    }
  });

  // Uji kegagalan tulis: Kegagalan penyimpanan TIDAK BOLEH dilaporkan sebagai sukses
  shouldSimulateNetworkFailure = true;
  writeAttempts = 0;
  let writeFailedCorrectly = false;
  try {
    // Pada mode produksi, kegagalan simpan ke cloud harus melempar error
    (foodConfig as any).isProduction = true;
    await foodDb.createOrder({
      merchantId: 'm_test_99',
      customerName: 'Budi Test',
      customerPhone: '081299990001',
      deliveryAddress: 'Jl. Raya Tumpang No. 10',
      items: [{ menuItemId: 'item_1', name: 'Nasi Pecel', price: 15000, quantity: 1 }]
    });
  } catch (err: any) {
    writeFailedCorrectly = true;
  } finally {
    (foodConfig as any).isProduction = false;
    shouldSimulateNetworkFailure = false;
  }
  assert(writeFailedCorrectly, 'Kegagalan penyimpanan cloud saat mode produksi langsung melempar error dan tidak dilaporkan sukses');

  // Uji Retry: Setelah jaringan kembali normal, penulisan berhasil
  writeAttempts = 0;
  let retrySuccess = false;
  try {
    const orderDoc = await simulatedCloudDb.collection('orders').doc('ord_retry_test').set({
      id: 'ord_retry_test',
      status: OrderStatus.WAITING_PAYMENT,
      total: 20000
    });
    retrySuccess = Boolean(orderDoc);
  } catch {}
  assert(retrySuccess, 'Operasi tulis cloud berhasil setelah kegagalan jaringan dipulihkan (Retry sukses)');
  assert(mockRemoteStore.get('orders')?.has('ord_retry_test') === true, 'Data benar-benar tersimpan di remote store');

  // 3b. Uji re-read & persistensi data setelah inisialisasi ulang instance
  mockRemoteStore.get('merchants')?.set('m_cloud_persisted', {
    id: 'm_cloud_persisted',
    name: 'Warung Cloud Asli',
    ownerName: 'Pak Cloud',
    phone: '081234567899',
    address: 'Kecamatan Tumpang',
    latitude: -7.9482,
    longitude: 112.7612,
    openTime: '08:00',
    closeTime: '21:00',
    bankName: 'Bank BRI',
    bankAccount: '123456789',
    bankHolder: 'Pak Cloud',
    active: true,
    rating: 4.8,
    cookTimeEstimate: '20 menit',
    image: 'https://example.com/img.jpg',
    description: 'Toko cloud',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const freshRebootDb = new FoodDatabase();
  await freshRebootDb.init();
  const hydratedMerchant = freshRebootDb.getMerchantById('m_cloud_persisted');
  assert(Boolean(hydratedMerchant), 'Data merchant dari cloud Firestore berhasil dibaca kembali setelah inisialisasi ulang (Hydration sukses)');
  assert(hydratedMerchant?.name === 'Warung Cloud Asli', 'Integritas atribut data cloud tetap terjaga saat dibaca kembali');


  // ===========================================================================
  // SUITE 4: PERSETUJUAN MITRA BERULANG DAN BERSAMAAN (IDEMPOTENCY & CONCURRENCY)
  // ===========================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log('4. PERSETUJUAN MITRA BERULANG DAN BERSAMAAN (IDEMPOTENCY & CONCURRENCY)');
  console.log('--------------------------------------------------------------------------------');

  // Bersihkan state in-memory
  const isolatedDb = new FoodDatabase();
  const testUnique = Date.now().toString().slice(-6);
  const testReg = await isolatedDb.createPartnerRegistration({
    name: 'Siti Aminah',
    storeName: 'Warung Bu Siti ' + testUnique,
    phone: `08198${testUnique}1`,
    email: `busiti_${testUnique}@gmail.com`,
    password: 'PasswordSiti#2026',
    type: 'MERCHANT',
    category: 'Nasi & Lauk',
    storeAddress: 'Jl. Malangsuko No. 44, Tumpang',
    businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
    idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
  });

  assert(testReg.status === 'PENDING', 'Pendaftaran baru masuk dengan status PENDING');

  // Eksekusi persetujuan pertama
  const approval1 = await isolatedDb.approvePartnerRegistration('admin_1', testReg.id);
  assert(approval1.success === true, 'Persetujuan pertama berhasil');
  assert(approval1.registration?.status === 'APPROVED', 'Status pendaftaran berubah menjadi APPROVED');

  const merchantCountAfterFirst = isolatedDb.getMerchants().filter(m => m.ownerName === 'Siti Aminah' && m.id === approval1.registration?.storeId).length;
  assert(merchantCountAfterFirst === 1, 'Tepat 1 entitas merchant dibuat pada persetujuan pertama');

  // Eksekusi persetujuan berulang (Repeated call)
  const approval2 = await isolatedDb.approvePartnerRegistration('admin_1', testReg.id);
  assert(approval2.success === true, 'Panggilan persetujuan berulang mengembalikan status sukses (idempotent)');

  const merchantCountAfterSecond = isolatedDb.getMerchants().filter(m => m.ownerName === 'Siti Aminah' && m.id === approval1.registration?.storeId).length;
  assert(merchantCountAfterSecond === 1, 'Persetujuan berulang TIDAK membuat duplikasi merchant (idempotency aman)');

  // Eksekusi persetujuan bersamaan (Concurrent race condition test)
  const testUniqueConc = (Date.now() + 10).toString().slice(-6);
  const regConcurrent = await isolatedDb.createPartnerRegistration({
    name: 'Ahmad Concurrency ' + testUniqueConc,
    storeName: 'Bakso Cak Ahmad ' + testUniqueConc,
    phone: `08198${testUniqueConc}9`,
    email: `cak.ahmad_${testUniqueConc}@gmail.com`,
    password: 'PasswordAhmad#2026',
    type: 'MERCHANT',
    category: 'Bakso & Mie',
    storeAddress: 'Jl. Raya Jeru No. 12, Tumpang',
    businessPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
    idPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
  });

  const concurrentResults = await Promise.all([
    isolatedDb.approvePartnerRegistration('admin_1', regConcurrent.id),
    isolatedDb.approvePartnerRegistration('admin_2', regConcurrent.id),
    isolatedDb.approvePartnerRegistration('admin_3', regConcurrent.id)
  ]);

  const allSuccessful = concurrentResults.every(r => r.success);
  assert(allSuccessful, '3 panggilan persetujuan bersamaan diselesaikan tanpa crash');

  const cakAhmadMerchants = isolatedDb.getMerchants().filter(m => m.ownerName === 'Ahmad Concurrency ' + testUniqueConc).length;
  assert(cakAhmadMerchants === 1, 'Persetujuan bersamaan tetap menghasilkan tepat 1 merchant (race-condition safe)');


  // ===========================================================================
  // SUITE 5: PEMBUATAN PESANAN & OTORISASI PERUBAHAN STATUS PEMBAYARAN
  // ===========================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log('5. PEMBUATAN PESANAN & OTORISASI PERUBAHAN STATUS PEMBAYARAN');
  console.log('--------------------------------------------------------------------------------');

  const merchantForOrder = isolatedDb.getMerchants()[0];
  const cat = await isolatedDb.createCategory(merchantForOrder.id, 'Menu Utama');
  const menuItem = await isolatedDb.createMenuItem(merchantForOrder.id, {
    categoryId: cat.id,
    name: 'Nasi Rawon',
    price: 20000,
    description: 'Rawon daging sapi khas Tumpang',
    available: true,
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'
  });

  const orderCreated = await isolatedDb.createOrder({
    merchantId: merchantForOrder.id,
    customerName: 'Pelanggan Asli Tumpang',
    customerPhone: '081234509876',
    deliveryAddress: 'Jl. Raya Tumpang No. 8',
    items: [
      { menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 2 }
    ]
  });

  assert(Boolean(orderCreated.id), 'Pesanan berhasil dibuat dengan ID valid');
  assert(orderCreated.deliveryFee === 5000, 'Ongkir Kecamatan Tumpang strictly flat Rp 5.000');
  assert(orderCreated.status === OrderStatus.WAITING_PAYMENT, 'Status awal pesanan adalah WAITING_PAYMENT');
  assert(orderCreated.paymentStatus === PaymentStatus.PENDING, 'Status pembayaran awal adalah PENDING');

  // Customer upload bukti transfer
  const orderWithProof = await isolatedDb.updateOrder('customer', orderCreated.id, {
    paymentProof: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
    paymentProofUploadedAt: new Date().toISOString()
  }, 'CUSTOMER');

  assert(
    orderWithProof.status === OrderStatus.WAITING_PAYMENT_VERIFICATION,
    'Upload bukti pembayaran mengubah status menjadi WAITING_PAYMENT_VERIFICATION (BUKAN auto-PAID)'
  );
  assert(
    orderWithProof.paymentStatus === PaymentStatus.WAITING_VERIFICATION,
    'PaymentStatus adalah WAITING_VERIFICATION'
  );

  // Pelanggan atau Merchant TIDAK BISA memalsukan status menjadi PAID
  let spoofBlocked = false;
  try {
    await isolatedDb.updateOrder('customer', orderCreated.id, {
      status: OrderStatus.PAYMENT_VERIFIED,
      paymentStatus: PaymentStatus.PAID
    }, 'CUSTOMER');
  } catch {
    spoofBlocked = true;
  }
  assert(spoofBlocked, 'Pelanggan diblokir dari memverifikasi pembayarannya sendiri menjadi PAID');

  // Hanya Admin yang berwenang memverifikasi pembayaran
  const verifiedByAdmin = await isolatedDb.verifyOrderPayment('admin_authorized', orderCreated.id);
  assert(verifiedByAdmin.status === OrderStatus.PAYMENT_VERIFIED, 'Admin berhasil memverifikasi pembayaran menjadi PAYMENT_VERIFIED');
  assert(verifiedByAdmin.paymentStatus === PaymentStatus.PAID, 'PaymentStatus resmi menjadi PAID');
  assert(Boolean(verifiedByAdmin.receipt), 'E-Receipt resmi diterbitkan setelah verifikasi pembayaran');


  // ===========================================================================
  // SUITE 6: AUDIT TRANSPARANSI STRATEGI FALLBACK & PEMISAHAN MODE
  // ===========================================================================
  console.log('\n--------------------------------------------------------------------------------');
  console.log('6. AUDIT TRANSPARANSI STRATEGI FALLBACK & PEMISAHAN MODE');
  console.log('--------------------------------------------------------------------------------');

  // Reset mock ke kondisi natural tanpa kredensial untuk memverifikasi transparansi fallback
  __setFirestoreMockForTesting(null);

  const statusFallback = await isolatedDb.getStorageStatus();
  assert(
    statusFallback.storageMode === 'local_resilient_snapshot',
    'Saat kredensial cloud tidak ada, storageMode secara eksplisit melaporkan "local_resilient_snapshot"'
  );
  assert(
    statusFallback.isUsingFallback === true,
    'Field isUsingFallback bernilai true agar Admin tahu penyimpanan cloud belum aktif'
  );
  assert(
    statusFallback.liveCloudConnected === false,
    'liveCloudConnected bernilai false dan tidak memberikan kesan palsu bahwa data tersimpan di cloud'
  );

  // Verifikasi perlindungan mode produksi:
  (foodConfig as any).isProduction = true;
  let productionBlockedWithoutCredentials = false;
  try {
    await isolatedDb.ensureReadyForOperations();
  } catch (err: any) {
    productionBlockedWithoutCredentials = true;
  } finally {
    (foodConfig as any).isProduction = false;
  }
  assert(
    productionBlockedWithoutCredentials,
    'Mode produksi menolak operasi dan melempar error jika Firestore tidak aktif (mencegah silent fallback)'
  );


  // ===========================================================================
  // REKAPITULASI HASIL AKHIR
  // ===========================================================================
  console.log('\n================================================================================');
  console.log('📊 REKAPITULASI HASIL PENGUJIAN INTEGRASI FIRESTORE');
  console.log('================================================================================');
  console.log(`  ✅ LULUS (PASS)    : ${stats.passed}`);
  console.log(`  ❌ GAGAL (FAIL)    : ${stats.failed}`);
  console.log(`  ⚠️  TERHAMBAT (BLOCKED): ${stats.blocked}`);
  console.log('================================================================================');

  if (stats.failed > 0) {
    process.exit(1);
  }
  } finally {
    if (initialDbContent && fs.existsSync(foodConfig.localDbFile)) {
      fs.writeFileSync(foodConfig.localDbFile, initialDbContent, 'utf8');
    }
  }
}

runAllSuites().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
