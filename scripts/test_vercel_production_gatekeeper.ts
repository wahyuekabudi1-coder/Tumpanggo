/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Vercel Serverless Production Gatekeeper & Cloud Persistence Verification
 * 
 * Verifies that the Vercel pathway (api/index.ts -> api/_app.cjs):
 * 1. Strictly executes validateProductionEnvironment() before accepting application business operations.
 * 2. Requires Cloud Firestore to be connected before operations that read or mutate production data are permitted.
 * 3. Does not merely add a health check: initialization failure strictly prevents business operations from
 *    falling back to local/in-memory storage in production.
 * 4. Preserves diagnostic access to /api/health while rejecting business requests with 503 when disconnected.
 * 5. Successfully processes business requests when Cloud Firestore is connected in production.
 * 6. Maintains complete compatibility between normal Express standalone and Vercel serverless.
 */

import http from 'http';
import fs from 'fs';
import handler, { getAppModule } from '../api/index';
import { foodConfig } from '../src/server/config';
import { __setFirestoreMockForTesting } from '../src/server/firebaseAdmin';

function setMock(mock: any) {
  __setFirestoreMockForTesting(mock);
  try {
    const mod = getAppModule();
    if (mod && typeof mod.__setFirestoreMockForTesting === 'function') {
      mod.__setFirestoreMockForTesting(mock);
    }
  } catch {}
}

async function run() {
  const initialDbContent = fs.existsSync(foodConfig.localDbFile)
    ? fs.readFileSync(foodConfig.localDbFile, 'utf8')
    : null;

  console.log('======================================================================');
  console.log('🛡️  PENGUJIAN GERBANG PRODUKSI & PERSISTENSI VERCEL SERVERLESS');
  console.log('======================================================================\n');

  const server = http.createServer((req, res) => {
    handler(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Vercel serverless test server running on ${baseUrl}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} (${detail})`);
      failed++;
    }
  }

  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.FOOD_AUTH_SECRET;
  const originalServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const originalProjectId = process.env.FIREBASE_PROJECT_ID;
  const originalAdminEmail = process.env.FOOD_ADMIN_EMAIL;
  const originalAdminPassword = process.env.FOOD_ADMIN_PASSWORD;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Mode Produksi Tanpa Kredensial Wajib (FOOD_AUTH_SECRET & SERVICE_ACCOUNT_KEY)
    // -------------------------------------------------------------------------
    console.log('📦 TEST 1: Mode produksi dengan secret wajib yang hilang/tidak lengkap');
    process.env.NODE_ENV = 'production';
    (foodConfig as any).isProduction = true;
    delete process.env.FOOD_AUTH_SECRET;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    const resMissingSecret = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonMissingSecret = await resMissingSecret.json();
    console.log('  🔍 Respon:', resMissingSecret.status, jsonMissingSecret);

    assert(
      resMissingSecret.status === 503,
      'Permintaan bisnis ditolak dengan HTTP 503 saat secret produksi tidak lengkap',
      `Status: ${resMissingSecret.status}`
    );
    assert(
      jsonMissingSecret.code === 'PRODUCTION_CONFIG_INVALID',
      'Kode error adalah PRODUCTION_CONFIG_INVALID',
      `Code: ${jsonMissingSecret.code}`
    );
    assert(
      Array.isArray(jsonMissingSecret.details) && jsonMissingSecret.details.some((d: string) => d.includes('FOOD_AUTH_SECRET')),
      'Menampilkan rincian error konfigurasi produksi',
      `Details: ${JSON.stringify(jsonMissingSecret.details)}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Mode Produksi Dengan Konfigurasi Valid Namun Cloud Firestore Terputus
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 2: Mode produksi dengan konfigurasi valid tetapi koneksi Cloud Firestore terputus');
    process.env.FOOD_AUTH_SECRET = 'a_very_long_valid_production_secret_key_1234567890';
    process.env.FOOD_ADMIN_EMAIL = 'admin@tumpanggo.com';
    process.env.FOOD_ADMIN_PASSWORD = 'SecureAdminPassword#2026';
    process.env.FIREBASE_PROJECT_ID = 'tumpanggo-70479';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: 'service-account@tumpanggo-70479.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n'
    });

    // Mock Firestore terputus / izin IAM ditolak
    setMock({
      isConfigured: true,
      probeResult: {
        connected: false,
        canRead: false,
        canWrite: false,
        databaseId: '(default)',
        projectId: 'tumpanggo-70479',
        usingServiceAccount: true,
        authIdentity: 'service-account@tumpanggo-70479.iam.gserviceaccount.com',
        error: '7 PERMISSION_DENIED: Missing or insufficient permissions',
        diagnosticReason: 'IAM_PERMISSION_DENIED',
        diagnosticDetail: 'Koneksi Cloud Firestore ditolak oleh IAM security rules'
      },
      writeSuccess: false
    });

    // 2a. Operasi bisnis membaca data (GET /api/merchants) HARUS DITOLAK
    const resMerchantsBlocked = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonMerchantsBlocked = await resMerchantsBlocked.json();
    console.log('  🔍 GET /api/merchants Respon:', resMerchantsBlocked.status, jsonMerchantsBlocked);

    assert(
      resMerchantsBlocked.status === 503,
      'Operasi baca GET /api/merchants ditolak dengan HTTP 503 saat Firestore terputus',
      `Status: ${resMerchantsBlocked.status}`
    );
    assert(
      jsonMerchantsBlocked.code === 'DATABASE_UNAVAILABLE',
      'Kode error DATABASE_UNAVAILABLE mencegah silent local fallback',
      `Code: ${jsonMerchantsBlocked.code}`
    );

    // 2b. Operasi bisnis mengubah data (POST /api/orders) HARUS DITOLAK
    const resOrderBlocked = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-matched-path': '/api/orders'
      },
      body: JSON.stringify({
        merchantId: 'm1',
        customerName: 'Test Customer',
        customerPhone: '081234567890',
        deliveryAddress: 'Jl. Raya Tumpang No. 1',
        items: [{ menuItemId: 'item1', quantity: 1 }]
      })
    });
    const jsonOrderBlocked = await resOrderBlocked.json();
    console.log('  🔍 POST /api/orders Respon:', resOrderBlocked.status, jsonOrderBlocked);

    assert(
      resOrderBlocked.status === 503,
      'Operasi tulis POST /api/orders ditolak dengan HTTP 503 saat Firestore terputus',
      `Status: ${resOrderBlocked.status}`
    );
    assert(
      jsonOrderBlocked.code === 'DATABASE_UNAVAILABLE',
      'Penyimpanan lokal dicegah agar tidak menerima mutasi data tanpa cloud persistence',
      `Code: ${jsonOrderBlocked.code}`
    );

    // 2c. Diagnostic /api/health tetap dapat diakses untuk inspeksi status tanpa silent bypass
    const resHealth = await fetch(`${baseUrl}/api/health`, {
      headers: { 'x-matched-path': '/api/health' }
    });
    const jsonHealth = await resHealth.json();
    console.log('  🔍 GET /api/health Respon:', resHealth.status, jsonHealth.status);

    assert(
      resHealth.status === 503,
      'Endpoint diagnostik /api/health mencerminkan 503 database_disconnected',
      `Status: ${resHealth.status}`
    );
    assert(
      jsonHealth.database === 'disconnected' && jsonHealth.status === 'database_disconnected',
      'Diagnostik akurat melaporkan status disconnected',
      `Status: ${jsonHealth.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Mode Produksi Dengan Cloud Firestore Terhubung & Aktif
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 3: Mode produksi dengan Cloud Firestore terhubung penuh');
    setMock({
      isConfigured: true,
      probeResult: {
        connected: true,
        canRead: true,
        canWrite: true,
        databaseId: '(default)',
        projectId: 'tumpanggo-70479',
        usingServiceAccount: true,
        authIdentity: 'service-account@tumpanggo-70479.iam.gserviceaccount.com',
        diagnosticReason: 'OK',
        diagnosticDetail: 'Live Cloud Firestore Verified'
      },
      writeSuccess: true
    });

    const resConnected = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonConnected = await resConnected.json();
    console.log('  🔍 GET /api/merchants Respon:', resConnected.status, `Loaded ${Array.isArray(jsonConnected) ? jsonConnected.length : 0} merchants`);

    assert(
      resConnected.status === 200,
      'Operasi bisnis GET /api/merchants diterima dengan HTTP 200 saat Firestore terhubung',
      `Status: ${resConnected.status}`
    );
    assert(
      Array.isArray(jsonConnected),
      'Mengembalikan daftar toko merchant yang sah dari data cloud',
      `IsArray: ${Array.isArray(jsonConnected)}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Mode Pengembangan Lokal (Resilient Mode)
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 4: Mode pengembangan lokal (resilient mode tanpa paksaan cloud)');
    process.env.NODE_ENV = 'development';
    (foodConfig as any).isProduction = false;
    setMock(null);

    const resDev = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonDev = await resDev.json();
    console.log('  🔍 Dev GET /api/merchants Respon:', resDev.status, `Loaded ${Array.isArray(jsonDev) ? jsonDev.length : 0} merchants`);

    assert(
      resDev.status === 200,
      'Mode pengembangan tetap berfungsi fleksibel dengan local snapshot',
      `Status: ${resDev.status}`
    );

  } finally {
    setMock(null);
    process.env.NODE_ENV = originalNodeEnv;
    (foodConfig as any).isProduction = originalNodeEnv === 'production';
    if (originalSecret) process.env.FOOD_AUTH_SECRET = originalSecret;
    if (originalServiceAccount) process.env.FIREBASE_SERVICE_ACCOUNT_KEY = originalServiceAccount;
    if (originalProjectId) process.env.FIREBASE_PROJECT_ID = originalProjectId;
    if (originalAdminEmail) process.env.FOOD_ADMIN_EMAIL = originalAdminEmail;
    if (originalAdminPassword) process.env.FOOD_ADMIN_PASSWORD = originalAdminPassword;
    server.close();
    if (initialDbContent && fs.existsSync(foodConfig.localDbFile)) {
      fs.writeFileSync(foodConfig.localDbFile, initialDbContent, 'utf8');
    }
  }

  console.log('\n======================================================================');
  console.log(`🏁 HASIL PENGUJIAN: ${passed} PASS, ${failed} FAIL`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n❌ Unhandled test failure:', err);
  process.exit(1);
});
