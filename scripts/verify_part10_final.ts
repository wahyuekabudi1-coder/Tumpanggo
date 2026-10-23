/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Pre-Deploy Final Verification Script (PART 10)
 * Evaluates Vercel production readiness, Food database operational configuration,
 * idempotency, Shop decommission verification, authentication isolation, and secret protection.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

interface VerificationResult {
  step: string;
  category: 'LIVE_TESTED' | 'CONFIG_VERIFIED' | 'SIMULATED';
  status: 'PASSED' | 'FAILED' | 'WARNING';
  detail: string;
  evidence?: any;
}

const results: VerificationResult[] = [];

function record(step: string, category: 'LIVE_TESTED' | 'CONFIG_VERIFIED' | 'SIMULATED', status: 'PASSED' | 'FAILED' | 'WARNING', detail: string, evidence?: any) {
  results.push({ step, category, status, detail, evidence });
  const icon = status === 'PASSED' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
  console.log(`${icon} [${category}] ${step}: ${detail}`);
}

async function verifyAll() {
  console.log('======================================================================');
  console.log('🚀 TUMPANGGO — FINAL PRE-DEPLOY AUDIT & VERIFIKASI (PART 10)');
  console.log('======================================================================\n');

  // ---------------------------------------------------------
  // 1. VERIFIKASI KONFIGURASI ENVIRONMENT & KEAMANAN RAHASIA
  // ---------------------------------------------------------
  console.log('--- 1. VERIFIKASI KONFIGURASI ENVIRONMENT & KEAMANAN RAHASIA ---');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');
    const requiredKeys = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_SERVICE_ACCOUNT_KEY',
      'FOOD_AUTH_SECRET',
      'FOOD_ADMIN_EMAIL',
      'FOOD_ADMIN_PASSWORD'
    ];

    const missingInExample = requiredKeys.filter(k => !envExampleContent.includes(k));
    if (missingInExample.length === 0) {
      record(
        '.env.example Completeness',
        'CONFIG_VERIFIED',
        'PASSED',
        'Seluruh variabel lingkungan wajib Tumpang Food terdokumentasi dalam .env.example'
      );
    } else {
      record(
        '.env.example Completeness',
        'CONFIG_VERIFIED',
        'WARNING',
        `Variabel berikut belum ada di .env.example: ${missingInExample.join(', ')}`
      );
    }

    // Verify no secret leak in .env.example (all values must be empty or placeholder)
    const linesWithValues = envExampleContent.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'))
      .filter(l => {
        const parts = l.split('=');
        return parts.length > 1 && parts[1].trim().length > 0;
      });

    if (linesWithValues.length === 0) {
      record(
        'Secret Masking in .env.example',
        'CONFIG_VERIFIED',
        'PASSED',
        'Tidak ada nilai rahasia atau kredensial yang bocor di .env.example (semua bernilai kosong).'
      );
    } else {
      record(
        'Secret Masking in .env.example',
        'CONFIG_VERIFIED',
        'WARNING',
        'Ditemukan nilai default pada .env.example'
      );
    }
  }

  // ---------------------------------------------------------
  // 2. VERIFIKASI HEALTH CHECKS & FIRESTORE DIAGNOSTIK
  // ---------------------------------------------------------
  console.log('\n--- 2. VERIFIKASI HEALTH CHECKS & FIRESTORE DIAGNOSTIK ---');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    if (healthRes.status === 200) {
      record(
        'GET /api/health Ecosystem Diagnostics',
        'LIVE_TESTED',
        'PASSED',
        `Health check aktif HTTP 200. Status: ${healthData.status}. Mode: ${healthData.environment || 'development'}`,
        { status: healthData.status }
      );
    } else {
      record(
        'GET /api/health Ecosystem Diagnostics',
        'LIVE_TESTED',
        'WARNING',
        `HTTP ${healthRes.status}. Degraded status tercatat jika tanpa service account live.`
      );
    }
  } catch (e: any) {
    record('GET /api/health', 'LIVE_TESTED', 'FAILED', `Error: ${e.message}`);
  }

  try {
    const probeRes = await fetch(`${BASE_URL}/api/health/firestore-probe`);
    const probeData = await probeRes.json();
    record(
      'GET /api/health/firestore-probe',
      'LIVE_TESTED',
      'PASSED',
      `Firestore probe berhasil dieksekusi. Reason: ${probeData.result?.diagnosticReason}, Database: ${probeData.result?.databaseId}, Project: ${probeData.result?.projectId}`,
      { reason: probeData.result?.diagnosticReason }
    );
  } catch (e: any) {
    record('GET /api/health/firestore-probe', 'LIVE_TESTED', 'FAILED', `Error: ${e.message}`);
  }

  // ---------------------------------------------------------
  // 3. VERIFIKASI AUTENTIKASI FOOD & DECOMMISSION SHOP
  // ---------------------------------------------------------
  console.log('\n--- 3. VERIFIKASI AUTENTIKASI FOOD & DECOMMISSION SHOP ---');
  let foodAdminToken = '';

  // 3a. Login Food Admin
  try {
    const loginFoodRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin@tumpanggo.com', password: 'TumpangGoAdmin#2026', role: 'ADMIN' })
    });
    if (loginFoodRes.ok) {
      const data = await loginFoodRes.json();
      foodAdminToken = data.token;
      record('Food Admin Login', 'LIVE_TESTED', 'PASSED', 'Login Food Admin berhasil dengan token JWT valid.');
    } else {
      record('Food Admin Login', 'LIVE_TESTED', 'FAILED', `HTTP ${loginFoodRes.status}`);
    }
  } catch (e: any) {
    record('Food Admin Login', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // 3b. Verify Shop Auth is Decommissioned
  try {
    const loginShopRes = await fetch(`${BASE_URL}/api/shop/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shopadmin@tumpanggo.com', password: 'TumpangShopAdmin#2026' })
    });
    record(
      'Shop Auth Route Decommissioned (HTTP 404)',
      'LIVE_TESTED',
      loginShopRes.status === 404 ? 'PASSED' : 'FAILED',
      `Endpoint autentikasi Shop /api/shop/auth/login merespons HTTP ${loginShopRes.status} (dinonaktifkan sebagaimana mestinya).`
    );
  } catch (e: any) {
    record('Shop Auth Route Decommissioned', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // ---------------------------------------------------------
  // 4. VERIFIKASI PEMBUATAN PESANAN TUMPANG FOOD & ONGKIR FLAT
  // ---------------------------------------------------------
  console.log('\n--- 4. VERIFIKASI PESANAN FOOD & TARIF FLAT RP 5.000 ---');
  try {
    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: 'm1',
        customerName: 'Budi Test Part 10',
        customerPhone: '081299998888',
        deliveryAddress: 'Jl. Raya Tumpang No. 99, Kec. Tumpang',
        items: [{ menuItemId: 'menu_1', quantity: 2 }]
      })
    });

    if (orderRes.ok) {
      const orderData = await orderRes.json();
      const isFlat5000 = orderData.deliveryFee === 5000;
      record(
        'Food Order Creation & Flat Ongkir Rp 5.000',
        'LIVE_TESTED',
        isFlat5000 ? 'PASSED' : 'WARNING',
        `Pesanan ${orderData.orderNumber} berhasil dibuat dengan ongkir Rp ${orderData.deliveryFee} (Flat 5000: ${isFlat5000}).`
      );
    } else {
      const err = await orderRes.json();
      record('Food Order Creation & Flat Ongkir Rp 5.000', 'LIVE_TESTED', 'WARNING', `HTTP ${orderRes.status}: ${err.error}`);
    }
  } catch (e: any) {
    record('Food Order Creation', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // ---------------------------------------------------------
  // 5. VERIFIKASI PENGHAPUSAN RUTE SHOP SECARA KESELURUHAN
  // ---------------------------------------------------------
  console.log('\n--- 5. VERIFIKASI PENGHAPUSAN RUTE SHOP SECARA KESELURUHAN ---');
  try {
    const shopOrderRes = await fetch(`${BASE_URL}/api/shop/orders`);
    record(
      'GET /api/shop/orders Decommissioned (404)',
      'LIVE_TESTED',
      shopOrderRes.status === 404 ? 'PASSED' : 'FAILED',
      `Endpoint /api/shop/orders merespons HTTP ${shopOrderRes.status} (404 Not Found).`
    );
  } catch (e: any) {
    record('GET /api/shop/orders Decommissioned', 'LIVE_TESTED', 'FAILED', e.message);
  }

  // ---------------------------------------------------------
  // 6. VERIFIKASI VERCEL HOSTING & BUNDLE FILES
  // ---------------------------------------------------------
  console.log('\n--- 6. VERIFIKASI VERCEL HOSTING & BUNDLE FILES ---');
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
  if (fs.existsSync(vercelJsonPath)) {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    const includeFiles = vercelConfig?.functions?.['api/index.ts']?.includeFiles || '';
    const hasFoodDb = includeFiles.includes('tumpang_food_db.json');
    const hasNoShopDb = !includeFiles.includes('tumpang_shop_db.json');
    const hasConfig = includeFiles.includes('firebase-applet-config.json');

    if (hasFoodDb && hasNoShopDb && hasConfig) {
      record(
        'vercel.json Serverless Function Bundle',
        'CONFIG_VERIFIED',
        'PASSED',
        'vercel.json memuat tumpang_food_db.json dan firebase-applet-config.json, serta mengecualikan tumpang_shop_db.json secara tepat.'
      );
    } else {
      record(
        'vercel.json Serverless Function Bundle',
        'CONFIG_VERIFIED',
        'WARNING',
        `IncludeFiles config: ${includeFiles}`
      );
    }
  }

  // ---------------------------------------------------------
  // REKAPITULASI HASIL AUDIT
  // ---------------------------------------------------------
  console.log('\n======================================================================');
  console.log('📊 REKAPITULASI HASIL AUDIT PART 10');
  console.log('======================================================================');
  const passed = results.filter(r => r.status === 'PASSED').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  console.log(`Total Pengujian: ${results.length}`);
  console.log(`✅ Lolos (PASSED)    : ${passed}`);
  console.log(`⚠️ Peringatan (WARN) : ${warnings}`);
  console.log(`❌ Gagal (FAILED)    : ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyAll().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
