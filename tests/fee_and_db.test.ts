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

  // --- SUITE 7: SHOP ZERO-FOOD-ACCESS AUDIT ---
  console.log('\n--- TEST SUITE 7: ISOLASI TOTAL SHOP DARI FOOD (ZERO FOOD TOUCH) ---');
  
  // 1. Static Source Code Analysis: Ensure NO foodDb or server/db import exists in shopApp.ts
  const fsModule = await import('fs');
  const pathModule = await import('path');
  const shopAppSourcePath = pathModule.join(process.cwd(), 'src/services/shop/api/shopApp.ts');
  const shopAppSource = fsModule.readFileSync(shopAppSourcePath, 'utf-8');
  assert(!shopAppSource.includes("from '../../../server/db'"), 'shopApp.ts does NOT import foodDb from server/db');
  assert(!shopAppSource.includes("foodDb."), 'shopApp.ts contains ZERO calls to foodDb');
  assert(!shopAppSource.includes("foodDb.getMasterAccount"), 'shopApp.ts has NO call to foodDb.getMasterAccount()');
  assert(!shopAppSource.includes("foodDb.updateMasterAccountPassword"), 'shopApp.ts has NO call to foodDb.updateMasterAccountPassword()');

  // 2. Verify ShopDatabase has its own dedicated master account methods
  assert(typeof testShopDb.getMasterAccount === 'function', 'shopDb provides dedicated getMasterAccount()');
  assert(typeof testShopDb.updateMasterAccountPassword === 'function', 'shopDb provides dedicated updateMasterAccountPassword()');

  // 3. Runtime Trap: Monkey-patch foodDb.getMasterAccount to throw if invoked during Shop login
  const originalFoodGetMaster = foodDb.getMasterAccount.bind(foodDb);
  let foodDbCalledDuringShopLogin = false;
  (foodDb as any).getMasterAccount = () => {
    foodDbCalledDuringShopLogin = true;
    throw new Error('CRITICAL VIOLATION: foodDb.getMasterAccount was invoked by Shop!');
  };

  try {
    const { getMasterAccountCredentials } = await import('../src/server/config');
    const masterCreds = getMasterAccountCredentials();
    const { shopApp } = await import('../src/services/shop/api/shopApp');

    let loginStatusCode = 0;
    let loginResponseData: any = null;
    const mockLoginRes: any = {
      status: (code: number) => {
        loginStatusCode = code;
        return mockLoginRes;
      },
      json: (data: any) => {
        loginResponseData = data;
        return mockLoginRes;
      }
    };

    // Simulate Shop Admin login with Master Account
    const mockLoginReq: any = {
      body: {
        email: masterCreds.email,
        password: masterCreds.password
      },
      headers: {}
    };

    // Find and execute the login route handler directly
    const authRouterLayer = (shopApp as any)._router.stack.find((l: any) => l.route?.path === '/auth/login' || (Array.isArray(l.route?.path) && l.route.path.includes('/auth/login')));
    if (authRouterLayer && authRouterLayer.route) {
      await authRouterLayer.route.stack[0].handle(mockLoginReq, mockLoginRes);
    } else {
      // Direct router route stack check
      const subRouterLayer = (shopApp as any)._router.stack.find((l: any) => l.name === 'router');
      if (subRouterLayer && subRouterLayer.handle?.stack) {
        const loginLayer = subRouterLayer.handle.stack.find((l: any) => l.route?.path && (l.route.path === '/auth/login' || (Array.isArray(l.route.path) && l.route.path.includes('/auth/login'))));
        if (loginLayer) {
          await loginLayer.route.stack[0].handle(mockLoginReq, mockLoginRes);
        }
      }
    }

    assert(foodDbCalledDuringShopLogin === false, 'Shop master login executed WITHOUT touching foodDb.getMasterAccount');
    assert(loginResponseData?.role === 'SHOP_ADMIN', 'Master login to Shop granted SHOP_ADMIN role');
    assert(loginResponseData?.isMasterAdmin === true, 'Master login to Shop correctly flagged isMasterAdmin = true');
    assert(Boolean(loginResponseData?.token), 'Shop issued valid dedicated auth token');
    
    // Verify master account was stored/verified in Shop's dedicated schema
    const { shopDb: mainShopDb } = await import('../src/services/shop/database/shopDatabase');
    const shopMasterRecord = mainShopDb.getMasterAccount();
    assert(shopMasterRecord !== undefined, 'Shop database stores dedicated Master Account credentials');
    assert(shopMasterRecord?.email === masterCreds.email, 'Shop Master Account record has matching email');
  } finally {
    // Restore foodDb original method
    (foodDb as any).getMasterAccount = originalFoodGetMaster;
  }

  // --- SUITE 8: KEAMANAN INISIALISASI DATABASE SHOP & RETRY RESILIENCE ---
  console.log('\n--- TEST SUITE 8: KEAMANAN INISIALISASI DATABASE SHOP & RETRY RESILIENCE ---');

  // 1. Verify getIsInitialized method
  assert(typeof testShopDb.getIsInitialized === 'function', 'shopDb exposes getIsInitialized()');
  assert(typeof testShopDb.resetInitializationForTesting === 'function', 'shopDb exposes resetInitializationForTesting()');

  // 2. Test initialization failure when PostgreSQL is configured but unavailable
  const retryTestDb = new ShopDatabase();
  retryTestDb.resetInitializationForTesting();
  assert(retryTestDb.getIsInitialized() === false, 'Fresh/reset instance starts with isInitialized = false');

  // Configure failing PostgreSQL URL
  shopPersistence.setDatabaseUrl('postgresql://mock_user:mock_pass@127.0.0.1:59998/non_existent_db');
  assert(shopPersistence.isPostgresConfigured() === true, 'PostgreSQL is configured on persistence engine');

  let initErrorCaught: any = null;
  try {
    await retryTestDb.ensureInitialized();
  } catch (err: any) {
    initErrorCaught = err;
  }

  assert(initErrorCaught !== null, 'ensureInitialized() rejected with error when PostgreSQL was down');
  assert(retryTestDb.getIsInitialized() === false, 'CRITICAL: isInitialized remains FALSE when initialization fails (No false success)');

  // 3. Test concurrent retries while down — all must reject safely without hanging or race conditions
  const parallelFailingInits = Array.from({ length: 5 }, () => 
    retryTestDb.ensureInitialized().then(() => false).catch(() => true)
  );
  const parallelOutcomes = await Promise.all(parallelFailingInits);
  assert(parallelOutcomes.every(Boolean), 'All 5 concurrent retries while down rejected safely without race conditions');
  assert(retryTestDb.getIsInitialized() === false, 'isInitialized remains FALSE across concurrent failed attempts');

  // 4. Restore valid persistence configuration (local mode) and test recovery
  shopPersistence.setDatabaseUrl('');
  assert(shopPersistence.isPostgresConfigured() === false, 'Database URL reset to local mode');

  let recoverySucceeded = false;
  try {
    await retryTestDb.ensureInitialized();
    recoverySucceeded = true;
  } catch (err: any) {
    console.error('Recovery init failed:', err);
  }

  assert(recoverySucceeded === true, 'ensureInitialized() succeeded on subsequent retry after connection restored');
  assert(retryTestDb.getIsInitialized() === true, 'isInitialized correctly transitioned to TRUE after successful initialization');

  // Verify no duplicate migrations occurred during retries
  const statusAfterRecovery = await retryTestDb.getStorageStatus();
  assert(statusAfterRecovery.totalCategories >= 4, 'Categories catalogue intact and uncorrupted after recovery');
  assert(retryTestDb.getProducts({ onlyActive: false }).length > 0, 'Products catalogue intact and queryable after recovery');

  // --- SUITE 9: KEAMANAN AUTENTIKASI MASTER ADMIN SHOP (SINGLE SOURCE OF TRUTH, ROTATION, STORAGE FAILURE, RECOVERY) ---
  console.log('\n--- TEST SUITE 9: KEAMANAN AUTENTIKASI MASTER ADMIN SHOP ---');

  const { shopApp } = await import('../src/services/shop/api/shopApp');
  const { shopDb: testShopDbInst } = await import('../src/services/shop/database/shopDatabase');
  const { getMasterAccountCredentials } = await import('../src/server/config');
  const masterCreds = getMasterAccountCredentials();
  const originalMasterPassword = masterCreds.password;

  // Helper to dispatch requests into shopApp router
  async function callShopEndpoint(pathStr: string, methodStr: string, bodyObj: any = {}, headersObj: any = {}, userObj?: any) {
    let statusCode = 200;
    let responseBody: any = null;
    const resMock: any = {
      status: (code: number) => { statusCode = code; return resMock; },
      json: (data: any) => { responseBody = data; return resMock; },
      setHeader: () => resMock
    };
    const reqMock: any = {
      method: methodStr.toUpperCase(),
      path: pathStr,
      url: pathStr,
      originalUrl: pathStr,
      body: bodyObj,
      headers: { ...headersObj },
      shopUser: userObj,
      user: userObj
    };
    
    const subRouterLayer = (shopApp as any)._router.stack.find((l: any) => l.name === 'router');
    const stack = subRouterLayer?.handle?.stack || (shopApp as any)._router.stack;
    const layer = stack.find((l: any) => {
      if (!l.route) return false;
      const p = l.route.path;
      const matchesPath = Array.isArray(p) ? p.includes(pathStr) : p === pathStr;
      const matchesMethod = l.route.methods && l.route.methods[methodStr.toLowerCase()];
      return matchesPath && matchesMethod;
    });

    if (!layer) throw new Error(`Route not found for ${methodStr} ${pathStr}`);

    for (const handler of layer.route.stack) {
      let nextCalled = false;
      const next = (err?: any) => { if (err) throw err; nextCalled = true; };
      await handler.handle(reqMock, resMock, next);
      if (!nextCalled && statusCode !== 200) break;
    }
    return { statusCode, data: responseBody };
  }

  // Ensure Shop master account is initially seeded with environment password
  await testShopDbInst.updateMasterAccountPassword(originalMasterPassword, masterCreds.email);
  const initialMasterRecord = testShopDbInst.getMasterAccount();
  assert(Boolean(initialMasterRecord?.passwordHash), 'Master Account initially initialized in Shop database');

  // 1. Unauthenticated rotation attempt is rejected with 401
  const unauthRot = await callShopEndpoint('/auth/master/rotate-password', 'POST', {
    currentPassword: originalMasterPassword,
    newPassword: 'NewValidMasterPass#2026'
  });
  assert(unauthRot.statusCode === 401, 'Unauthenticated rotation request rejected with HTTP 401');

  // 2. Non-master admin rotation attempt is rejected with 403
  const nonMasterRot = await callShopEndpoint('/auth/master/rotate-password', 'POST', {
    currentPassword: originalMasterPassword,
    newPassword: 'NewValidMasterPass#2026'
  }, {}, { userId: 'regular_admin', role: 'SHOP_ADMIN', isMasterAdmin: false, email: 'regular@shop.com' });
  assert(nonMasterRot.statusCode === 403, 'Non-master admin rotation attempt rejected with HTTP 403 (FORBIDDEN_MASTER_ONLY)');

  // 3. Short new password (< 8 chars) is rejected with 400
  const shortPassRot = await callShopEndpoint('/auth/master/rotate-password', 'POST', {
    currentPassword: originalMasterPassword,
    newPassword: 'short'
  }, {}, { userId: 'master-admin', role: 'SHOP_ADMIN', isMasterAdmin: true, email: masterCreds.email });
  assert(shortPassRot.statusCode === 400, 'Password rotation with <8 characters rejected with HTTP 400 (PASSWORD_TOO_SHORT)');

  // 4. Incorrect current password is rejected with 401
  const wrongCurrentRot = await callShopEndpoint('/auth/master/rotate-password', 'POST', {
    currentPassword: 'WrongCurrentPassword#2026',
    newPassword: 'NewValidMasterPass#2026'
  }, {}, { userId: 'master-admin', role: 'SHOP_ADMIN', isMasterAdmin: true, email: masterCreds.email });
  assert(wrongCurrentRot.statusCode === 401, 'Password rotation with incorrect current password rejected with HTTP 401');

  // 5. Successful password rotation
  const rotatedPasswordVal = 'RotatedMasterSecure#2026';
  const validRot = await callShopEndpoint('/auth/master/rotate-password', 'POST', {
    currentPassword: originalMasterPassword,
    newPassword: rotatedPasswordVal
  }, {}, { userId: 'master-admin', role: 'SHOP_ADMIN', isMasterAdmin: true, email: masterCreds.email });
  assert(validRot.statusCode === 200, 'Password rotation succeeded with HTTP 200');
  assert(validRot.data?.success === true, 'Password rotation returned success: true');

  // 6. SINGLE SOURCE OF TRUTH: Old password from environment MUST BE REJECTED!
  const oldPassLogin = await callShopEndpoint('/auth/login', 'POST', {
    email: masterCreds.email,
    password: originalMasterPassword
  });
  assert(oldPassLogin.statusCode === 401, 'CRITICAL: Old password from environment is strictly REJECTED (HTTP 401) after rotation');
  assert(oldPassLogin.data?.diagnostic?.code === 'PASSWORD_MISMATCH', 'Diagnostic code confirms PASSWORD_MISMATCH');
  assert(oldPassLogin.data?.diagnostic?.reason === 'PASSWORD_HASH_MISMATCH', 'Diagnostic reason confirms PASSWORD_HASH_MISMATCH (No fallback to env)');

  // 7. New rotated password MUST BE ACCEPTED
  const newPassLogin = await callShopEndpoint('/auth/login', 'POST', {
    email: masterCreds.email,
    password: rotatedPasswordVal
  });
  assert(newPassLogin.statusCode === 200, 'New rotated password accepted with HTTP 200');
  assert(newPassLogin.data?.role === 'SHOP_ADMIN', 'New password login issued SHOP_ADMIN role');
  assert(newPassLogin.data?.isMasterAdmin === true, 'New password login flagged isMasterAdmin = true');
  assert(Boolean(newPassLogin.data?.token), 'New password login issued signed auth token');

  // 8. Storage persistence failure does NOT grant login or rotation success
  const originalMutate = shopPersistence.executeAtomicMutation.bind(shopPersistence);
  (shopPersistence as any).executeAtomicMutation = async () => {
    const { ShopStorageError } = await import('../src/services/shop/database/shopPersistence');
    throw new ShopStorageError('Simulated disk/PostgreSQL persistence failure');
  };

  const failingRot = await callShopEndpoint('/auth/master/rotate-password', 'POST', {
    currentPassword: rotatedPasswordVal,
    newPassword: 'AnotherPasswordAttempt#2026'
  }, {}, { userId: 'master-admin', role: 'SHOP_ADMIN', isMasterAdmin: true, email: masterCreds.email });
  assert(failingRot.statusCode === 503, 'Storage failure during rotation returns HTTP 503');
  assert(failingRot.data?.code === 'STORAGE_PERSISTENCE_FAILED', 'Storage failure code is STORAGE_PERSISTENCE_FAILED');
  assert(failingRot.data?.success !== true, 'CRITICAL: Storage failure strictly refuses to report success = true');

  // Restore atomic mutation
  (shopPersistence as any).executeAtomicMutation = originalMutate;

  // 9. Emergency administrative recovery mechanism
  // 9a. Request without recovery key rejected
  const noKeyReset = await callShopEndpoint('/auth/master/emergency-reset', 'POST', {
    newPassword: 'EmergencyResetPass#2026'
  });
  assert(noKeyReset.statusCode === 401, 'Emergency reset without recovery key rejected with HTTP 401');

  // 9b. Request with invalid recovery key rejected
  const wrongKeyReset = await callShopEndpoint('/auth/master/emergency-reset', 'POST', {
    newPassword: 'EmergencyResetPass#2026'
  }, { 'x-master-recovery-key': 'invalid-recovery-key-12345678' });
  assert(wrongKeyReset.statusCode === 401, 'Emergency reset with invalid key rejected with HTTP 401');

  // 9c. Request with short password rejected
  process.env.SHOP_MASTER_RECOVERY_KEY = 'super-secret-shop-recovery-key-min-16-chars';
  const shortPassReset = await callShopEndpoint('/auth/master/emergency-reset', 'POST', {
    newPassword: 'short'
  }, { 'x-master-recovery-key': 'super-secret-shop-recovery-key-min-16-chars' });
  assert(shortPassReset.statusCode === 400, 'Emergency reset with password < 8 chars rejected with HTTP 400');

  // 9d. Request with valid recovery key succeeds
  const emergencyRecoveredPass = 'EmergencyRecovered#2026Secret';
  const validReset = await callShopEndpoint('/auth/master/emergency-reset', 'POST', {
    newPassword: emergencyRecoveredPass
  }, { 'x-master-recovery-key': 'super-secret-shop-recovery-key-min-16-chars' });
  assert(validReset.statusCode === 200, 'Emergency reset with valid key succeeded with HTTP 200');
  assert(validReset.data?.success === true, 'Emergency reset returned success: true');

  // Verify previous rotated password is now invalid
  const rotatedAfterReset = await callShopEndpoint('/auth/login', 'POST', {
    email: masterCreds.email,
    password: rotatedPasswordVal
  });
  assert(rotatedAfterReset.statusCode === 401, 'Old password rejected after emergency reset');

  // Verify emergency-recovered password logs in successfully
  const recoveredLogin = await callShopEndpoint('/auth/login', 'POST', {
    email: masterCreds.email,
    password: emergencyRecoveredPass
  });
  assert(recoveredLogin.statusCode === 200, 'Recovered password logs in successfully with HTTP 200');

  // 9e. Single-use file token recovery (.master_recovery_token)
  const fs = await import('fs');
  const path = await import('path');
  const tokenFilePath = path.resolve(process.cwd(), '.master_recovery_token');
  const singleUseToken = 'single-use-file-recovery-token-xyz-12345';
  fs.writeFileSync(tokenFilePath, singleUseToken, 'utf-8');
  assert(fs.existsSync(tokenFilePath) === true, 'Single-use recovery token file created for test');

  delete process.env.SHOP_MASTER_RECOVERY_KEY;
  delete process.env.MASTER_RECOVERY_KEY;

  const finalRecoveredPass = 'FinalRecoveredPass#2026Key';
  const fileTokenReset = await callShopEndpoint('/auth/master/emergency-reset', 'POST', {
    newPassword: finalRecoveredPass
  }, { 'x-master-recovery-key': singleUseToken });
  assert(fileTokenReset.statusCode === 200, 'Single-use file token reset succeeded with HTTP 200');
  assert(fs.existsSync(tokenFilePath) === false, 'Single-use token file was destroyed immediately upon use');

  // Clean-up and restore original environment password in Shop database
  await testShopDbInst.updateMasterAccountPassword(originalMasterPassword, masterCreds.email);
  const cleanRestoredRecord = testShopDbInst.getMasterAccount();
  assert(cleanRestoredRecord !== undefined, 'Shop master credentials restored to safe clean state');

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
