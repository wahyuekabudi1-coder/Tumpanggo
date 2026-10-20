/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Verifies that in production mode, transactions fail safely when Firestore is unreachable or write fails.
 * Proves that unpersisted transactions are NOT silently committed to local JSON.
 */

import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import { __setFirestoreMockForTesting } from '../src/server/firebaseAdmin';

async function testProductionFailSafe() {
  console.log('🧪 Menguji Fail-Safe Mode Produksi saat Firestore Cloud Offline atau Penulisan Gagal...');

  // Temporarily simulate production mode
  const originalIsProduction = foodConfig.isProduction;
  (foodConfig as any).isProduction = true;

  const initialOrderCount = foodDb.getOrders().length;

  try {
    // ---------------------------------------------------------
    // Skenario 1: Firestore terkonfigurasi & terhubung, tetapi penulisan dokumen pesanan gagal
    // ---------------------------------------------------------
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
    try {
      await foodDb.createOrder({
        merchantId: 'm1',
        customerName: 'Fail-Safe Write Tester',
        customerPhone: '081299991111',
        deliveryAddress: 'Jl. Uji Fail Safe Write',
        latitude: -7.98,
        longitude: 112.63,
        items: [{ menuItemId: 'menu_1', quantity: 1 }]
      });
      console.error('❌ [FAIL] Skenario 1: createOrder seharusnya ditolak jika cloud write gagal!');
      process.exit(1);
    } catch (err: any) {
      scenario1Rejected = true;
      console.log(`  ✅ [PASS] Skenario 1 createOrder ditolak secara aman: "${err.message}"`);
    }

    const orderCountAfterScenario1 = foodDb.getOrders().length;
    if (scenario1Rejected && orderCountAfterScenario1 === initialOrderCount) {
      console.log(`  ✅ [PASS] Skenario 1 Rollback terverifikasi: jumlah pesanan lokal tetap (${orderCountAfterScenario1} pesanan). Data transaksi tidak tersimpan secara palsu.`);
    } else {
      console.error('❌ [FAIL] Skenario 1 Rollback gagal: pesanan lokal bertambah meskipun cloud write gagal!');
      process.exit(1);
    }

    // ---------------------------------------------------------
    // Skenario 2: Firestore terkonfigurasi tetapi probe koneksi gagal (PERMISSION_DENIED / IAM) pada mode produksi
    // ---------------------------------------------------------
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
    try {
      await foodDb.createOrder({
        merchantId: 'm1',
        customerName: 'Fail-Safe IAM Tester',
        customerPhone: '081299992222',
        deliveryAddress: 'Jl. Uji Fail Safe IAM',
        latitude: -7.98,
        longitude: 112.63,
        items: [{ menuItemId: 'menu_1', quantity: 1 }]
      });
      console.error('❌ [FAIL] Skenario 2: createOrder seharusnya ditolak pada mode produksi jika koneksi cloud gagal!');
      process.exit(1);
    } catch (err: any) {
      scenario2Rejected = true;
      console.log(`  ✅ [PASS] Skenario 2 createOrder ditolak secara aman: "${err.message}"`);
    }

    const orderCountAfterScenario2 = foodDb.getOrders().length;
    if (scenario2Rejected && orderCountAfterScenario2 === initialOrderCount) {
      console.log(`  ✅ [PASS] Skenario 2 Rollback terverifikasi: jumlah pesanan lokal tetap (${orderCountAfterScenario2} pesanan).`);
    } else {
      console.error('❌ [FAIL] Skenario 2 Rollback gagal: pesanan lokal bertambah meskipun probe koneksi gagal!');
      process.exit(1);
    }

  } finally {
    // Selalu pulihkan mock dan konfigurasi lingkungan
    __setFirestoreMockForTesting(null);
    (foodConfig as any).isProduction = originalIsProduction;
  }

  console.log('\n🏁 Uji Fail-Safe Mode Produksi SELESAI DENGAN SUKSES!\n');
}

testProductionFailSafe().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
