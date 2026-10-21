/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Fail-Safe & Contract Verification Test
 * 
 * Verifies that:
 * 1. When Firestore is configured in production mode, transactions fail safely if cloud write fails.
 * 2. Unpersisted transactions are completely rolled back and NOT silently committed to local storage.
 * 3. Connection failures (e.g. IAM permission denial) safely reject new order creation.
 * 4. preOrderDate is excluded from new order creation contract and never copied to new orders.
 * 5. Historical orders retain readability without data loss.
 */

import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import { __setFirestoreMockForTesting } from '../src/server/firebaseAdmin';

async function testProductionFailSafe() {
  console.log('======================================================================');
  console.log('🧪 PENGUJIAN FAIL-SAFE PRODUKSI & KONTRAK PESANAN BARU');
  console.log('======================================================================\n');

  // Temporarily simulate strict production environment
  const originalIsProduction = foodConfig.isProduction;
  const originalNodeEnv = process.env.NODE_ENV;
  (foodConfig as any).isProduction = true;
  process.env.NODE_ENV = 'production';

  const initialOrders = foodDb.getOrders();
  const initialOrderCount = initialOrders.length;
  console.log(`ℹ️  Jumlah pesanan awal di database: ${initialOrderCount}`);

  try {
    // -------------------------------------------------------------------------
    // Skenario 1: Firestore terkonfigurasi & terhubung, tetapi cloud write gagal (persisted = false)
    // -------------------------------------------------------------------------
    console.log('\n📦 Skenario 1: Firestore terkonfigurasi tetapi penulisan cloud write gagal (persisted = false)');
    __setFirestoreMockForTesting({
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
        diagnosticDetail: 'Mock connection active'
      },
      writeSuccess: false // Cloud write fails
    });

    let scenario1Rejected = false;
    let scenario1ErrorMsg = '';
    const dynamicPhone1 = '0812' + Math.floor(10000000 + Math.random() * 90000000);

    try {
      await foodDb.createOrder({
        merchantId: 'm1',
        customerName: 'Fail-Safe Write Tester',
        customerPhone: dynamicPhone1,
        deliveryAddress: 'Jl. Raya Tumpang No. 10, Tumpang',
        latitude: -7.9812,
        longitude: 112.6315,
        preOrderDate: '2026-10-25', // Client attempts to send preOrderDate
        items: [{ menuItemId: 'menu_1', quantity: 1 }]
      });
      console.error('❌ [FAIL] Skenario 1: createOrder seharusnya ditolak jika cloud write gagal!');
      process.exit(1);
    } catch (err: any) {
      scenario1Rejected = true;
      scenario1ErrorMsg = err.message || String(err);
      console.log(`  ✅ [PASS] Skenario 1 createOrder ditolak secara aman: "${scenario1ErrorMsg}"`);
    }

    const orderCountAfterScenario1 = foodDb.getOrders().length;
    if (scenario1Rejected && orderCountAfterScenario1 === initialOrderCount) {
      console.log(`  ✅ [PASS] Skenario 1 Rollback terverifikasi: jumlah pesanan lokal tetap (${orderCountAfterScenario1} pesanan). Data transaksi palsu tidak tersimpan.`);
    } else {
      console.error(`❌ [FAIL] Skenario 1 Rollback gagal: pesanan lokal berubah (${orderCountAfterScenario1} vs ${initialOrderCount})!`);
      process.exit(1);
    }

    // -------------------------------------------------------------------------
    // Skenario 2: Firestore terkonfigurasi tetapi probe koneksi gagal (PERMISSION_DENIED / IAM) pada mode produksi
    // -------------------------------------------------------------------------
    console.log('\n📦 Skenario 2: Firestore terkonfigurasi tetapi koneksi cloud ditolak (PERMISSION_DENIED)');
    __setFirestoreMockForTesting({
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
        diagnosticDetail: 'Mock IAM permission denial'
      },
      writeSuccess: false
    });

    let scenario2Rejected = false;
    let scenario2ErrorMsg = '';
    const dynamicPhone2 = '0812' + Math.floor(10000000 + Math.random() * 90000000);

    try {
      await foodDb.createOrder({
        merchantId: 'm1',
        customerName: 'Fail-Safe IAM Tester',
        customerPhone: dynamicPhone2,
        deliveryAddress: 'Jl. Raya Tumpang No. 20, Tumpang',
        latitude: -7.9812,
        longitude: 112.6315,
        preOrderDate: '2026-10-25',
        items: [{ menuItemId: 'menu_1', quantity: 1 }]
      });
      console.error('❌ [FAIL] Skenario 2: createOrder seharusnya ditolak pada mode produksi jika koneksi cloud gagal!');
      process.exit(1);
    } catch (err: any) {
      scenario2Rejected = true;
      scenario2ErrorMsg = err.message || String(err);
      console.log(`  ✅ [PASS] Skenario 2 createOrder ditolak secara aman: "${scenario2ErrorMsg}"`);
    }

    const orderCountAfterScenario2 = foodDb.getOrders().length;
    if (scenario2Rejected && orderCountAfterScenario2 === initialOrderCount) {
      console.log(`  ✅ [PASS] Skenario 2 Rollback terverifikasi: jumlah pesanan lokal tetap (${orderCountAfterScenario2} pesanan).`);
    } else {
      console.error(`❌ [FAIL] Skenario 2 Rollback gagal: pesanan lokal berubah (${orderCountAfterScenario2} vs ${initialOrderCount})!`);
      process.exit(1);
    }

    // -------------------------------------------------------------------------
    // Skenario 3: Verifikasi Kontrak Pesanan Baru — preOrderDate Dihapus dan Diabaikan
    // -------------------------------------------------------------------------
    console.log('\n📦 Skenario 3: Verifikasi Kontrak Pesanan Baru — preOrderDate diabaikan & tidak disalin');
    __setFirestoreMockForTesting({
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
        diagnosticDetail: 'Mock connection active'
      },
      writeSuccess: true // Penulisan sukses
    });

    const dynamicPhone3 = '0812' + Math.floor(10000000 + Math.random() * 90000000);
    const testOrderWithPreOrderInput = await foodDb.createOrder({
      merchantId: 'm1',
      customerName: 'Tester PreOrder Ignored',
      customerPhone: dynamicPhone3,
      deliveryAddress: 'Jl. Raya Tumpang No. 30, Tumpang',
      latitude: -7.9812,
      longitude: 112.6315,
      preOrderDate: '2026-11-01', // Client sends legacy preOrderDate
      items: [{ menuItemId: 'menu_1', quantity: 1 }]
    });

    const hasPreOrderDate = Object.prototype.hasOwnProperty.call(testOrderWithPreOrderInput, 'preOrderDate') &&
      (testOrderWithPreOrderInput as any).preOrderDate !== undefined;

    if (!hasPreOrderDate) {
      console.log(`  ✅ [PASS] preOrderDate berhasil diabaikan dan TIDAK disalin ke pesanan baru (ID: ${testOrderWithPreOrderInput.id})`);
    } else {
      console.error(`❌ [FAIL] preOrderDate masih tersalin ke pesanan baru: ${(testOrderWithPreOrderInput as any).preOrderDate}`);
      process.exit(1);
    }

    // Bersihkan pesanan uji coba skenario 3 agar database tetap bersih
    const ordersList = (foodDb as any).data.orders;
    const testIdx = ordersList.findIndex((o: any) => o.id === testOrderWithPreOrderInput.id);
    if (testIdx !== -1) {
      ordersList.splice(testIdx, 1);
      (foodDb as any).save();
      console.log(`  ℹ️  Pesanan uji coba skenario 3 berhasil dibersihkan dari database lokal.`);
    }

    // -------------------------------------------------------------------------
    // Skenario 4: Verifikasi Pembacaan Transaksi Historis
    // -------------------------------------------------------------------------
    console.log('\n📦 Skenario 4: Verifikasi Integritas Riwayat Transaksi Historis');
    const existingOrders = foodDb.getOrders();
    console.log(`  ✅ [PASS] Riwayat pesanan (${existingOrders.length} pesanan) dapat dibaca tanpa error schema.`);

  } finally {
    // Selalu pulihkan mock dan konfigurasi lingkungan ke keadaan semula
    __setFirestoreMockForTesting(null);
    (foodConfig as any).isProduction = originalIsProduction;
    process.env.NODE_ENV = originalNodeEnv;
  }

  console.log('\n======================================================================');
  console.log('🏁 PENGUJIAN FAIL-SAFE & KONTRAK PESANAN BARU BERHASIL 100%!');
  console.log('======================================================================\n');
}

testProductionFailSafe().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
