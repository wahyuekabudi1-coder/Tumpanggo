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

  // Test outside both (e.g., Lowokwaru Kota Malang) - MUST BE REJECTED even if distance < 10 km
  const outsideCalc = calculateDeliveryFee({
    address: 'Jl. Soekarno Hatta, Lowokwaru, Kota Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -7.9420,
    longitude: 112.6150
  });
  assert(outsideCalc.isInTumpang === false && outsideCalc.isInPakis === false, 'Outside destination correctly detected as neither Tumpang nor Pakis');
  assert(outsideCalc.isSupported === false && outsideCalc.deliveryFee === 0, 'Outside destination is strictly REJECTED (isSupported: false, deliveryFee: 0)');

  // Test maximum distance limit (> 10 km from merchant)
  const tooFarCalc = calculateDeliveryFee({
    address: 'Jl. Raya Tumpang, Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -8.1500, // ~23 km away
    longitude: 112.7600
  });
  assert(tooFarCalc.isSupported === false && tooFarCalc.deliveryFee === 0, 'Destination exceeding 10 km limit is strictly REJECTED (isSupported: false)');

  // Test unknown / unspecified destination without coordinates
  const unknownCalc = calculateDeliveryFee({
    address: 'Jl. Random Tanpa Kecamatan No. 99'
  });
  assert(unknownCalc.isSupported === false && unknownCalc.deliveryFee === 0, 'Unknown destination without region is strictly REJECTED (not assumed to be Tumpang)');

  // Test normalization
  const sampleOrderTumpang: any = {
    deliveryAddress: 'Jl. Raya Tumpang No. 12',
    deliveryFee: 15000, // Tampered
    subtotal: 50000,
    serviceFee: 2000,
    uniqueCode: 15,
    total: 67015
  };
  const normalizedTumpang = normalizeOrderDeliveryFee(sampleOrderTumpang);
  assert(normalizedTumpang.deliveryFee === 5000, 'Tampered Tumpang order normalized to flat Rp 5.000');
  assert(normalizedTumpang.total === 57015, 'Tumpang order total recalculated accurately with flat Rp 5.000');

  const sampleOrderPakis: any = {
    deliveryAddress: 'Jl. Ampeldento No. 8, Kecamatan Pakis',
    deliveryFee: 20000, // Tampered
    subtotal: 50000,
    serviceFee: 2000,
    uniqueCode: 22,
    total: 72022
  };
  const normalizedPakis = normalizeOrderDeliveryFee(sampleOrderPakis);
  assert(normalizedPakis.deliveryFee === 7500, 'Tampered Pakis order normalized to flat Rp 7.500');
  assert(normalizedPakis.total === 59522, 'Pakis order total recalculated accurately with flat Rp 7.500');

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
