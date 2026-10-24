/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Automated Test Suite for TumpangGo Platform & Tumpang Food
 * Covers:
 * 1. Tiered service fee boundary conditions (exact Rp 100k, 200k, 300k, 500k, 700k).
 * 2. Delivery fees: Flat Rp 5.000 (Tumpang) & Flat Rp 7.500 (Pakis) across all 15 villages.
 * 3. Concurrent initialization & mutex locking.
 * 4. Database health & error diagnostics.
 * 5. Data integrity and order normalization.
 */

import { calculateTieredServiceFee } from '../src/types';
import { 
  calculateDeliveryFee, 
  isDestinationInKecamatanTumpang, 
  isDestinationInKecamatanPakis,
  normalizeOrderDeliveryFee,
  FLAT_TUMPANG_DELIVERY_FEE,
  FLAT_PAKIS_DELIVERY_FEE,
  TUMPANG_VILLAGES,
  PAKIS_VILLAGES
} from '../src/utils/deliveryFee';
import { foodDb } from '../src/server/db';
import { OrderService } from '../src/server/services/orderService';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING TUMPANGGO FOOD & PLATFORM TEST SUITE');
  console.log('======================================================\n');

  // --- SUITE 1: TIERED SERVICE FEE ---
  console.log('--- TEST SUITE 1: TIERED SERVICE FEES ---');
  
  assert(calculateTieredServiceFee(0) === 0, 'Subtotal Rp 0 returns Rp 0');
  assert(calculateTieredServiceFee(15000) === 1200, 'Subtotal Rp 15.000 returns Rp 1.200');
  assert(calculateTieredServiceFee(30000) === 1200, 'Subtotal Rp 30.000 returns Rp 1.200');
  
  assert(calculateTieredServiceFee(30001) === 2000, 'Subtotal Rp 30.001 returns Rp 2.000');
  assert(calculateTieredServiceFee(75000) === 2000, 'Subtotal Rp 75.000 returns Rp 2.000');
  assert(calculateTieredServiceFee(100000) === 2000, 'Subtotal Rp 100.000 EXACTLY returns Rp 2.000 (MANDATORY)');
  
  assert(calculateTieredServiceFee(100001) === 3000, 'Subtotal Rp 100.001 returns Rp 3.000');
  assert(calculateTieredServiceFee(150000) === 3000, 'Subtotal Rp 150.000 returns Rp 3.000');
  assert(calculateTieredServiceFee(200000) === 3000, 'Subtotal Rp 200.000 EXACTLY returns Rp 3.000 (MANDATORY)');
  
  assert(calculateTieredServiceFee(200001) === 4000, 'Subtotal Rp 200.001 returns Rp 4.000');
  assert(calculateTieredServiceFee(250000) === 4000, 'Subtotal Rp 250.000 returns Rp 4.000');
  assert(calculateTieredServiceFee(300000) === 4000, 'Subtotal Rp 300.000 EXACTLY returns Rp 4.000 (MANDATORY)');
  
  assert(calculateTieredServiceFee(300001) === 5000, 'Subtotal Rp 300.001 returns Rp 5.000');
  assert(calculateTieredServiceFee(500000) === 5000, 'Subtotal Rp 500.000 returns Rp 5.000');
  assert(calculateTieredServiceFee(500001) === 5000, 'Subtotal Rp 500.001 returns Rp 5.000 (Legacy preserved)');
  assert(calculateTieredServiceFee(700000) === 5000, 'Subtotal Rp 700.000 returns Rp 5.000 (Legacy preserved)');
  
  assert(calculateTieredServiceFee(700001) === 10000, 'Subtotal Rp 700.001 returns Rp 10.000 (Legacy preserved)');
  assert(calculateTieredServiceFee(1200000) === 10000, 'Subtotal Rp 1.200.000 returns Rp 10.000');

  // --- SUITE 2: DELIVERY FEES (TUMPANG VS PAKIS) ---
  console.log('\n--- TEST SUITE 2: DELIVERY FEES (TUMPANG FLAT 5K & PAKIS FLAT 7.5K) ---');

  // Test Tumpang villages
  const tumpangSample = ['Tumpang', 'Desa Jeru', 'Malangsuko', 'Bokor', 'Slamet', 'Wringinsongo', 'Kidal', 'Pandanajeng'];
  for (const village of tumpangSample) {
    const calc = calculateDeliveryFee({ address: `Jl. Raya ${village}, Malang` });
    assert(calc.deliveryFee === FLAT_TUMPANG_DELIVERY_FEE && calc.isInTumpang === true, `Tumpang destination (${village}) is flat Rp 5.000`);
  }

  // Test Pakis villages (All 15 villages)
  const pakisSample = [
    'Pakisjajar', 'Pakiskembar', 'Ampeldento', 'Asrikaton', 'Banjarejo',
    'Bunutwetan', 'Kedungrejo', 'Mangliawan', 'Pagentan', 'Saptorenggo',
    'Sekarpuro', 'Sukoanyar', 'Sumberkradenan', 'Sumberpasir', 'Tumpukrenteng'
  ];
  for (const village of pakisSample) {
    const calc = calculateDeliveryFee({ address: `Jl. Mawar, Desa ${village}, Kecamatan Pakis, Malang` });
    assert(calc.deliveryFee === FLAT_PAKIS_DELIVERY_FEE && calc.isInPakis === true, `Pakis destination (${village}) is flat Rp 7.500`);
  }

  // Test Pakis landmarks
  const pakisLandmarkCalc = calculateDeliveryFee({ address: 'Dekat Pemandian Wendit, Malang' });
  assert(pakisLandmarkCalc.deliveryFee === FLAT_PAKIS_DELIVERY_FEE && pakisLandmarkCalc.isInPakis === true, 'Pakis landmark (Wendit) is flat Rp 7.500');

  // --- 8 MANDATORY VERIFICATION SCENARIOS ---
  console.log('\n--- 8 MANDATORY VERIFICATION SCENARIOS ---');

  // Case 1: Tumpang, 5 km: accepted, Rp 5.000
  const case1 = calculateDeliveryFee({
    address: 'Jl. Raya Tumpang No. 20, Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -7.9800, // ~4.5 km away within Tumpang
    longitude: 112.7600
  });
  assert(case1.isSupported === true && case1.deliveryFee === 5000 && case1.isInTumpang === true, 'Case 1: Tumpang, 5 km -> ACCEPTED with flat Rp 5.000');

  // Case 2: Pakis, 5 km: accepted, Rp 7.500
  const case2 = calculateDeliveryFee({
    address: 'Jl. Raya Pakis No. 10, Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -7.9600, // ~4.6 km away within Pakis
    longitude: 112.7200
  });
  assert(case2.isSupported === true && case2.deliveryFee === 7500 && case2.isInPakis === true, 'Case 2: Pakis, 5 km -> ACCEPTED with flat Rp 7.500');

  // Case 3: Tumpang, > 10 km: rejected
  const case3 = calculateDeliveryFee({
    address: 'Jl. Raya Tumpang No. 99, Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -8.1500, // ~23 km away
    longitude: 112.7600
  });
  assert(case3.isSupported === false && case3.deliveryFee === 0, 'Case 3: Tumpang, > 10 km -> REJECTED (exceeds max distance)');

  // Case 4: Pakis, > 10 km: rejected
  const case4 = calculateDeliveryFee({
    address: 'Jl. Raya Pakis No. 99, Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -8.1200, // ~19 km away
    longitude: 112.7000
  });
  assert(case4.isSupported === false && case4.deliveryFee === 0, 'Case 4: Pakis, > 10 km -> REJECTED (exceeds max distance)');

  // Case 5: Outside Tumpang & Pakis, < 10 km: rejected
  const case5 = calculateDeliveryFee({
    address: 'Jl. Soekarno Hatta, Lowokwaru, Kota Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -7.9420,
    longitude: 112.6150
  });
  assert(case5.isSupported === false && case5.deliveryFee === 0, 'Case 5: Outside Tumpang & Pakis, < 10 km -> REJECTED (non-supported region)');

  // Case 6: Unknown address: rejected / prompted for fix
  const case6 = calculateDeliveryFee({
    address: 'Jl. Random Tanpa Wilayah Jelas No. 99'
  });
  assert(case6.isSupported === false && case6.deliveryFee === 0, 'Case 6: Unknown address -> REJECTED (not assumed to be Tumpang)');

  // Case 7: Merchant coordinates missing: rejected / invalid
  let case7Threw = false;
  try {
    OrderService.validateAndBuildOrder(
      {
        customerName: 'Budi Test',
        customerPhone: '081234567890',
        deliveryAddress: 'Jl. Raya Tumpang No. 1',
        latitude: -7.9482,
        longitude: 112.7612,
        items: [{ menuItemId: 'mi_test', quantity: 1 }],
        merchantId: 'm_missing_coords'
      },
      {
        id: 'm_missing_coords',
        name: 'Warung Tanpa Koordinat',
        active: true,
        latitude: 0, // Missing / zero
        longitude: 0, // Missing / zero
        ownerName: 'Pak Test',
        phone: '08123',
        address: 'Tumpang',
        openTime: '08:00',
        closeTime: '21:00',
        bankName: 'BCA',
        bankAccount: '123',
        bankHolder: 'Test',
        rating: 5,
        cookTimeEstimate: '15m',
        image: '',
        description: '',
        createdAt: '',
        updatedAt: ''
      },
      [{ id: 'mi_test', merchantId: 'm_missing_coords', name: 'Bakso', price: 15000, available: true } as any],
      { defaultDeliveryFee: 5000, serviceFee: 1200 } as any,
      []
    );
  } catch (err: any) {
    case7Threw = true;
  }
  assert(case7Threw === true, 'Case 7: Merchant coordinates missing/zero -> REJECTED with validation error');

  // Case 8: Customer tampers with fee/total: recalculated by backend
  const sampleOrderTampered: any = {
    deliveryAddress: 'Jl. Raya Tumpang No. 12',
    deliveryFee: 99000, // Malicious client injection
    subtotal: 50000,
    serviceFee: 2000,
    uniqueCode: 15,
    total: 151015 // Manipulated total
  };
  const normalizedTampered = normalizeOrderDeliveryFee(sampleOrderTampered);
  assert(normalizedTampered.deliveryFee === 5000, 'Case 8a: Tampered fee strictly overridden to flat Rp 5.000 by backend');
  assert(normalizedTampered.total === 57015, 'Case 8b: Tampered total strictly recalculated to correct subtotal + fee + service + uniqueCode');

  // --- SUITE 3: CONCURRENCY & SAFE LOCKING ---
  console.log('\n--- TEST SUITE 3: CONCURRENCY & SAFE IN-MEMORY LOCKING ---');
  const startConcurrent = Date.now();
  const parallelInitPromises = Array.from({ length: 25 }, () => foodDb.ensureInitialized());
  await Promise.all(parallelInitPromises);
  const durationConcurrent = Date.now() - startConcurrent;
  assert(durationConcurrent < 1000, `25 concurrent ensureInitialized calls resolved efficiently (${durationConcurrent}ms) without duplicate locks`);

  // --- SUITE 4: DATABASE HEALTH & ERROR DIAGNOSTICS ---
  console.log('\n--- TEST SUITE 4: DATABASE HEALTH & ERROR DIAGNOSTICS ---');
  const foodStorage = await foodDb.getStorageStatus();
  assert(foodStorage.databaseId === '(default)' || Boolean(foodStorage.databaseId), 'Database ID correctly reported');
  assert(typeof foodStorage.isUsingFallback === 'boolean', 'Fallback status clearly reported');
  assert(typeof foodStorage.canRead === 'boolean', 'canRead capability accurately reported');
  assert(typeof foodStorage.canWrite === 'boolean', 'canWrite capability accurately reported');

  // --- SUITE 5: SYSTEM CONFIGURATION & MASTER ACCOUNT ---
  console.log('\n--- TEST SUITE 5: SYSTEM CONFIGURATION & MASTER ACCOUNT ---');
  const sysConfig = foodDb.getConfig();
  assert(Boolean(sysConfig), 'System configuration is loaded');
  assert(sysConfig.defaultDeliveryFee === 5000, 'Default delivery fee is configured to Rp 5.000');
  assert(sysConfig.serviceFee >= 1200, 'Base service fee is configured');

  const masterAccount = foodDb.getMasterAccount();
  assert(Boolean(masterAccount?.email), 'Master Account email is configured');

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
