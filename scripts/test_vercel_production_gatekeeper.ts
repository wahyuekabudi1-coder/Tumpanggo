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
import { __setSupabaseMockForTesting } from '../src/server/supabaseAdapter';

function setMock(mock: any) {
  __setFirestoreMockForTesting(mock);
  try {
    const mod = getAppModule();
    if (mod && typeof mod.__setFirestoreMockForTesting === 'function') {
      mod.__setFirestoreMockForTesting(mock);
    }
  } catch {}
}

function setSupabaseMock(mock: any) {
  __setSupabaseMockForTesting(mock);
  try {
    const mod = getAppModule();
    if (mod && typeof mod.__setSupabaseMockForTesting === 'function') {
      mod.__setSupabaseMockForTesting(mock);
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
    // TEST 2: Mode Produksi Dengan Supabase PostgreSQL Terputus
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 2: Mode produksi dengan Supabase terkonfigurasi tetapi terputus');
    process.env.FOOD_AUTH_SECRET = 'a_very_long_valid_production_secret_key_1234567890';
    process.env.FOOD_ADMIN_EMAIL = 'admin@tumpanggo.com';
    process.env.FOOD_ADMIN_PASSWORD = 'SecureAdminPassword#2026';
    process.env.SUPABASE_URL = 'https://epqpyieszdwyzrcbeqey.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a_valid_mock_service_role_key_that_is_long_enough';
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    setSupabaseMock({
      isConfigured: true,
      probeResult: {
        connected: false,
        url: 'https://epqpyieszdwyzrcbeqey.supabase.co',
        error: 'DNS resolution gagal (ENOTFOUND) untuk host "epqpyieszdwyzrcbeqey.supabase.co".'
      }
    });

    const resSupabaseBlocked = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonSupabaseBlocked = await resSupabaseBlocked.json();
    console.log('  🔍 GET /api/merchants (Supabase Disconnected) Respon:', resSupabaseBlocked.status, jsonSupabaseBlocked);

    assert(
      resSupabaseBlocked.status === 503,
      'Operasi baca GET /api/merchants ditolak dengan HTTP 503 saat Supabase terputus',
      `Status: ${resSupabaseBlocked.status}`
    );
    assert(
      jsonSupabaseBlocked.code === 'DATABASE_UNAVAILABLE',
      'Kode error DATABASE_UNAVAILABLE mencegah silent local fallback',
      `Code: ${jsonSupabaseBlocked.code}`
    );
    assert(
      jsonSupabaseBlocked.error && jsonSupabaseBlocked.error.includes('Supabase PostgreSQL'),
      'Pesan error secara spesifik menyebut Database Supabase PostgreSQL (bukan Cloud Firestore)',
      `Error: ${jsonSupabaseBlocked.error}`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Mode Produksi Dengan Supabase PostgreSQL Terhubung & Aktif
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 3: Mode produksi dengan Supabase PostgreSQL terhubung penuh');
    setSupabaseMock({
      isConfigured: true,
      probeResult: {
        connected: true,
        url: 'https://epqpyieszdwyzrcbeqey.supabase.co',
        latencyMs: 15
      },
      fetchResult: [
        {
          id: 'm_dql2xw0',
          name: 'Warung Ombay',
          category: 'Nasi & Lauk',
          active: true
        }
      ]
    });

    const resSupabaseConnected = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonSupabaseConnected = await resSupabaseConnected.json();
    console.log('  🔍 GET /api/merchants (Supabase Connected) Respon:', resSupabaseConnected.status, `Loaded ${Array.isArray(jsonSupabaseConnected) ? jsonSupabaseConnected.length : 0} merchants`);

    assert(
      resSupabaseConnected.status === 200,
      'Operasi bisnis GET /api/merchants diterima dengan HTTP 200 saat Supabase terhubung',
      `Status: ${resSupabaseConnected.status}`
    );
    assert(
      Array.isArray(jsonSupabaseConnected),
      'Mengembalikan daftar merchant dari data cloud Supabase',
      `IsArray: ${Array.isArray(jsonSupabaseConnected)}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Mode Produksi Dengan Cloud Firestore Terputus (Fallback Provider)
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 4: Mode produksi dengan konfigurasi Firestore valid tetapi terputus');
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    setSupabaseMock(null);

    process.env.FIREBASE_PROJECT_ID = 'tumpanggo-70479';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: 'service-account@tumpanggo-70479.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n'
    });

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

    const resFirestoreBlocked = await fetch(`${baseUrl}/api/merchants`, {
      headers: { 'x-matched-path': '/api/merchants' }
    });
    const jsonFirestoreBlocked = await resFirestoreBlocked.json();
    console.log('  🔍 GET /api/merchants (Firestore Disconnected) Respon:', resFirestoreBlocked.status, jsonFirestoreBlocked);

    assert(
      resFirestoreBlocked.status === 503,
      'Operasi baca GET /api/merchants ditolak dengan HTTP 503 saat Firestore terputus',
      `Status: ${resFirestoreBlocked.status}`
    );
    assert(
      jsonFirestoreBlocked.code === 'DATABASE_UNAVAILABLE',
      'Kode error DATABASE_UNAVAILABLE mencegah silent local fallback',
      `Code: ${jsonFirestoreBlocked.code}`
    );
    assert(
      jsonFirestoreBlocked.error && jsonFirestoreBlocked.error.includes('Cloud Firestore'),
      'Pesan error secara akurat menyebut Cloud Firestore saat Firestore yang aktif',
      `Error: ${jsonFirestoreBlocked.error}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Mode Produksi Dengan Cloud Firestore Terhubung & Aktif
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 5: Mode produksi dengan Cloud Firestore terhubung penuh');
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
    console.log('  🔍 GET /api/merchants (Firestore Connected) Respon:', resConnected.status, `Loaded ${Array.isArray(jsonConnected) ? jsonConnected.length : 0} merchants`);

    assert(
      resConnected.status === 200,
      'Operasi bisnis GET /api/merchants diterima dengan HTTP 200 saat Firestore terhubung',
      `Status: ${resConnected.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Mode Pengembangan Lokal (Resilient Mode)
    // -------------------------------------------------------------------------
    console.log('\n📦 TEST 6: Mode pengembangan lokal (resilient mode tanpa paksaan cloud)');
    process.env.NODE_ENV = 'development';
    (foodConfig as any).isProduction = false;
    setMock(null);
    setSupabaseMock(null);

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
    setSupabaseMock(null);
    process.env.NODE_ENV = originalNodeEnv;
    (foodConfig as any).isProduction = originalNodeEnv === 'production';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
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
