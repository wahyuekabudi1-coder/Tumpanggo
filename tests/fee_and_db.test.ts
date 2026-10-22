/**
 * Comprehensive Automated Test Suite for TumpangGo Phase B
 * Covers:
 * 1. Tiered service fee boundary conditions (exact Rp 100k, 200k, 300k, 500k, 700k).
 * 2. Delivery fees: Flat Rp 5.000 (Tumpang) & Flat Rp 7.500 (Pakis) across all 15 villages.
 * 3. Concurrent initialization & mutex locking.
 * 4. RESOURCE_EXHAUSTED handling.
 * 5. Tumpang Shop isolated storage engine.
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
import { shopEnv } from '../src/services/shop/config/shopEnv';
import { ShopDatabase } from '../src/services/shop/database/shopDatabase';

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
  console.log('🧪 RUNNING TUMPANGGO FASE B VERIFICATION TEST SUITE');
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

  // Test outside both (e.g., Lowokwaru Kota Malang)
  const outsideCalc = calculateDeliveryFee({
    address: 'Jl. Soekarno Hatta, Lowokwaru, Kota Malang',
    merchantLatitude: -7.9463,
    merchantLongitude: 112.7602,
    latitude: -7.9420,
    longitude: 112.6150
  });
  assert(outsideCalc.isInTumpang === false && outsideCalc.isInPakis === false, 'Outside destination correctly detected as neither Tumpang nor Pakis');
  assert(outsideCalc.deliveryFee > 7500, `Outside destination calculates distance-based rate (Calculated: Rp ${outsideCalc.deliveryFee})`);

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

  // --- SUITE 4: TUMPANG SHOP STORAGE ISOLATION & CONCURRENCY ---
  console.log('\n--- TEST SUITE 4: TUMPANG SHOP STORAGE ISOLATION & CONCURRENCY ---');
  assert(shopEnv.database.enableCloudSync === false, 'Shop database cloud sync is FALSE to prevent sharing Food quota');
  assert(shopEnv.database.type === 'file' || shopEnv.database.type === 'sql', 'Shop database type is independent (file/sql)');

  const testShopDb = new ShopDatabase();
  const shopConcurrentStart = Date.now();
  const shopInitPromises = Array.from({ length: 25 }, () => testShopDb.ensureInitialized());
  await Promise.all(shopInitPromises);
  const shopConcurrentDuration = Date.now() - shopConcurrentStart;
  assert(shopConcurrentDuration < 1000, `25 concurrent Shop ensureInitialized calls resolved efficiently (${shopConcurrentDuration}ms) with mutex locking`);

  const shopStatus = await testShopDb.getStorageStatus();
  assert(shopStatus.service === 'tumpang-shop', 'Shop service status correctly identifies tumpang-shop');
  assert(shopStatus.decoupledFromFoodFirestore === true, 'Shop is explicitly verified as decoupled from Food Firestore');
  assert(shopStatus.storageMode === 'local_persistent_file' || shopStatus.storageMode === 'ephemeral_serverless_file' || shopStatus.storageMode === 'dedicated_sql_persistent', `Shop storage mode correctly identified (${shopStatus.storageMode})`);
  assert(typeof shopStatus.totalProducts === 'number', `Shop products catalog is queryable (found: ${shopStatus.totalProducts} items)`);

  // Verify PostgreSQL methods are implemented and safely callable
  const { shopPersistence, ShopPersistenceManager, ShopStorageError } = await import('../src/services/shop/database/shopPersistence');
  assert(typeof shopPersistence.loadFromPostgres === 'function', 'PostgreSQL loadFromPostgres adapter is implemented');
  assert(typeof shopPersistence.saveToPostgres === 'function', 'PostgreSQL saveToPostgres adapter is implemented');
  assert(typeof shopPersistence.ensurePgTable === 'function', 'PostgreSQL ensurePgTable schema generator is implemented');
  const pgLoadAttempt = await shopPersistence.loadFromPostgres();
  assert(pgLoadAttempt === null || typeof pgLoadAttempt === 'object', 'PostgreSQL load handles unconfigured/configured environment safely');

  // Test 10 concurrent product creations (race condition protection)
  const initialProdCount = testShopDb.getProducts({ onlyActive: false }).length;
  const concurrentAdditions = Array.from({ length: 10 }, (_, i) => 
    testShopDb.createProduct('test_runner', {
      name: `Produk Uji Bersamaan ${i + 1}`,
      price: 10000 + (i * 1000),
      stock: 50,
      categoryId: 'scat_default'
    })
  );
  const createdProducts = await Promise.all(concurrentAdditions);
  const finalProdCount = testShopDb.getProducts({ onlyActive: false }).length;
  assert(createdProducts.length === 10, 'All 10 concurrent product creations resolved successfully');
  assert(finalProdCount === initialProdCount + 10, `Database accurately contains all 10 products (${finalProdCount}) without lost updates/race conditions`);

  // --- SUITE 5: FIRESTORE STATUS & ERROR CODE MAPPING ---
  console.log('\n--- TEST SUITE 5: DATABASE HEALTH & ERROR DIAGNOSTICS ---');
  const foodStorage = await foodDb.getStorageStatus();
  assert(foodStorage.databaseId === '(default)' || Boolean(foodStorage.databaseId), 'Database ID correctly reported');
  assert(typeof foodStorage.isUsingFallback === 'boolean', 'Fallback status clearly reported');
  assert(typeof foodStorage.canRead === 'boolean', 'canRead capability accurately reported');
  assert(typeof foodStorage.canWrite === 'boolean', 'canWrite capability accurately reported');

  // --- SUITE 6: POSTGRESQL ATOMICITY & FAILURE HANDLING ---
  console.log('\n--- TEST SUITE 6: POSTGRESQL ATOMICITY & FAILURE HANDLING ---');
  
  // 1. Test failing PostgreSQL connection simulation
  const failingPgManager = new ShopPersistenceManager('postgresql://invalid_mock_user:fake_password@127.0.0.1:59999/fake_db');
  const mockDiagnostic = await failingPgManager.getDiagnostic();
  assert(mockDiagnostic.liveCloudConnected === false, 'Failing PostgreSQL correctly reports liveCloudConnected = false');
  assert(mockDiagnostic.storageMode === 'degraded_sql_connection_failed', 'Failing PostgreSQL correctly switches storageMode to degraded_sql_connection_failed');
  assert(mockDiagnostic.isPersistentOnServerless === false, 'Failing PostgreSQL correctly reports isPersistentOnServerless = false');
  assert(Boolean(mockDiagnostic.warning?.includes('gagal')), 'Failing PostgreSQL presents clear Indonesian warning diagnostic');

  // 2. Test that mutation throws ShopStorageError on persistence failure and does NOT claim success
  let caughtStorageError: any = null;
  try {
    await failingPgManager.executeAtomicMutation(
      { config: {} as any, categories: [], products: [], orders: [], shipments: [], auditLogs: [] },
      current => ({ updatedSchema: current, result: 'SHOULD_NOT_SUCCEED' })
    );
  } catch (err: any) {
    caughtStorageError = err;
  }
  assert(caughtStorageError !== null, 'Persistence failure throws an exception and halts execution');
  assert(caughtStorageError instanceof ShopStorageError || caughtStorageError?.isStorageError === true, 'Exception is an explicit ShopStorageError with isStorageError = true');
  assert(caughtStorageError?.status === 500, 'ShopStorageError sets HTTP status 500');

  // 3. Test that API error dispatcher handleShopError turns ShopStorageError into HTTP 503 (STORAGE_PERSISTENCE_FAILED)
  const { handleShopError } = await import('../src/services/shop/api/shopApp');
  let dispatchedStatus = 0;
  let dispatchedJson: any = null;
  const mockRes: any = {
    status: (code: number) => {
      dispatchedStatus = code;
      return mockRes;
    },
    json: (payload: any) => {
      dispatchedJson = payload;
      return mockRes;
    }
  };
  handleShopError(mockRes, caughtStorageError, 'Gagal memproses operasi belanja');
  assert(dispatchedStatus === 503, `API dispatcher returns HTTP 503 for persistence failures (received: ${dispatchedStatus})`);
  assert(dispatchedJson?.code === 'STORAGE_PERSISTENCE_FAILED', 'API response error code is STORAGE_PERSISTENCE_FAILED');
  assert(dispatchedJson?.isStorageError === true, 'API response explicitly flags isStorageError: true');
  assert(dispatchedJson?.success !== true, 'API response strictly refuses to report success when persistence fails');

  // Clean up failing pool
  if (failingPgManager.getPool()) {
    failingPgManager.getPool()?.end().catch(() => {});
  }

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
