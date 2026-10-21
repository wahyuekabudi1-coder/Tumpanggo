/**
 * Comprehensive Automated Test Suite:
 * 1. Driver Order Selection & Polling Cycle Stability (Zero Flicker Proof)
 * 2. Cross-Driver Order Pre-emption Detection & Alerting
 * 3. Food Admin Access Denial to Shop Admin Endpoints
 * 4. Zero Data Contamination between Food and Shop Databases
 * 5. End-to-End Order Lifecycle Integrity
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { app } from '../src/server/app';
import { foodDb } from '../src/server/db';
import { shopDb } from '../src/services/shop/database/shopDatabase';
import { createAuthToken, verifyAuthToken } from '../src/server/auth';
import { createShopAuthToken } from '../src/services/shop/api/shopAuth';
import { foodConfig, shopConfig } from '../src/server/config';
import { shopEnv } from '../src/services/shop/config/shopEnv';
import { OrderStatus, PaymentStatus } from '../src/types';
import { ShopOrderStatus } from '../src/types/shop';

async function runAuditTests() {
  console.log('================================================================');
  console.log('🧪 PENGUJIAN MENYELURUH: DRIVER FLICKER FIX & SHOP ISOLATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Initialize databases
  await Promise.all([foodDb.ensureInitialized(), shopDb.ensureInitialized()]);

  // Start test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Server running on ${baseUrl}\n`);

  // --- BAGIAN 1: AUDIT DASHBOARD DRIVER & STABILITAS POLLING ---
  console.log('--- BAGIAN 1: Audit Stabilitas Dashboard Driver & Polling ---');

  // Test driver accounts
  const d1Token = createAuthToken({
    userId: 'd1',
    role: 'DRIVER',
    email: 'driver1@tumpanggo.com',
    entityId: 'd1'
  });
  const d2Token = createAuthToken({
    userId: 'd2',
    role: 'DRIVER',
    email: 'driver2@tumpanggo.com',
    entityId: 'd2'
  });

  // Ensure drivers are online and active
  await foodDb.updateDriver('ADMIN', 'd1', { online: true, active: true });
  await foodDb.updateDriver('ADMIN', 'd2', { online: true, active: true });

  // Temporarily set assignment mode to MANUAL so the ready order enters the broadcast pool
  const originalMode = foodDb.getConfig().assignmentMode;
  await foodDb.updateConfig('ADMIN', { assignmentMode: 'MANUAL' as any });

  // Create an order for driver testing
  const testOrder = await foodDb.createOrder({
    merchantId: 'm1',
    customerName: 'Ibu Ratna Tumpang',
    customerPhone: '081333444555',
    deliveryAddress: 'Jl. Malangsuko No. 20, Kec. Tumpang',
    items: [
      { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 2 }
    ]
  });

  assert(Boolean(testOrder?.id), `Pesanan uji #${testOrder.id} berhasil dibuat.`);

  // Verify initial order status
  await foodDb.updateOrder('ADMIN', testOrder.id, {
    status: OrderStatus.READY_FOR_PICKUP,
    paymentStatus: PaymentStatus.PAID
  }, 'ADMIN');

  // Endpoint: GET /api/drivers/:id/orders
  const resD1Orders = await fetch(`${baseUrl}/api/drivers/d1/orders`, {
    headers: { 'Authorization': `Bearer ${d1Token}` }
  });
  assert(resD1Orders.status === 200, 'GET /api/drivers/d1/orders merespons 200 OK');

  // Endpoint: GET /api/drivers/:id/available-orders
  const resD1Avail = await fetch(`${baseUrl}/api/drivers/d1/available-orders`, {
    headers: { 'Authorization': `Bearer ${d1Token}` }
  });
  const availList = await resD1Avail.json();
  const foundInAvail = Array.isArray(availList) && availList.some((o: any) => o.id === testOrder.id);
  assert(foundInAvail, `Pesanan siap jemput #${testOrder.id} muncul pada daftar tugas siap jemput`);

  // Simulate multiple polling cycles while order is being viewed
  console.log('   Simulasi 5 siklus polling berkala saat pesanan sedang dibuka (Zero-Flicker Regression Test)...');
  let pollingStable = true;
  let detailConsistent = true;

  for (let cycle = 1; cycle <= 5; cycle++) {
    const cycleRes = await fetch(`${baseUrl}/api/drivers/d1/available-orders`, {
      headers: { 'Authorization': `Bearer ${d1Token}` }
    });
    if (!cycleRes.ok) pollingStable = false;

    const singleRes = await fetch(`${baseUrl}/api/orders/${testOrder.id}`, {
      headers: { 'Authorization': `Bearer ${d1Token}` }
    });
    if (!singleRes.ok) {
      pollingStable = false;
    } else {
      const orderData = await singleRes.json();
      if (orderData.id !== testOrder.id || orderData.customerName !== 'Ibu Ratna Tumpang') {
        detailConsistent = false;
      }
    }
  }

  assert(pollingStable, 'Siklus polling 5x berturut-turut berjalan stabil tanpa error HTTP 5xx');
  assert(detailConsistent, 'Detail pesanan yang sedang dibuka mempertahankan konsistensi identitas (Zero Detail Loss)');

  // Driver 1 accepts the task
  const resAccept = await fetch(`${baseUrl}/api/orders/${testOrder.id}/accept-task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${d1Token}`
    },
    body: JSON.stringify({ driverId: 'd1' })
  });
  const acceptData = await resAccept.json();
  assert(resAccept.status === 200 && acceptData.success, 'Driver d1 berhasil menerima tugas pengantaran');

  // Concurrency check: Driver 2 attempts to accept the SAME task
  const resAcceptD2 = await fetch(`${baseUrl}/api/orders/${testOrder.id}/accept-task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${d2Token}`
    },
    body: JSON.stringify({ driverId: 'd2' })
  });
  assert(resAcceptD2.status === 400, 'Driver d2 DITOLAK saat mencoba menerima tugas yang sudah diambil d1 (400 Bad Request)');

  // Poll driver 2 view: verify order no longer in available-orders
  const resD2Avail = await fetch(`${baseUrl}/api/drivers/d2/available-orders`, {
    headers: { 'Authorization': `Bearer ${d2Token}` }
  });
  const d2AvailList = await resD2Avail.json();
  const d2StillSees = Array.isArray(d2AvailList) && d2AvailList.some((o: any) => o.id === testOrder.id);
  assert(!d2StillSees, 'Pesanan yang telah diambil d1 otomatis HILANG dari daftar siap jemput driver lain');

  // Check single order endpoint accessed by d2 returns order with d1 as driver
  const resSingleCheck = await fetch(`${baseUrl}/api/orders/${testOrder.id}`, {
    headers: { 'Authorization': `Bearer ${d2Token}` }
  });
  const singleCheckData = await resSingleCheck.json();
  assert(singleCheckData.driverId === 'd1', 'Detail pesanan mencatat driverId d1 secara konsisten saat dipantau');

  // Driver 1 confirms pickup
  const resPickup = await fetch(`${baseUrl}/api/orders/${testOrder.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${d1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.ORDER_PICKED_UP,
      role: 'DRIVER',
      userId: 'd1'
    })
  });
  const pickupData = await resPickup.json();
  assert(resPickup.status === 200, 'Driver d1 berhasil mengonfirmasi status ORDER_PICKED_UP', JSON.stringify(pickupData));

  // Driver 1 completes delivery with proof
  const resComplete = await fetch(`${baseUrl}/api/orders/${testOrder.id}/upload-delivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${d1Token}`
    },
    body: JSON.stringify({
      deliveryProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      userId: 'd1'
    })
  });
  const completeData = await resComplete.json();
  assert(resComplete.status === 200, 'Driver d1 berhasil mengunggah bukti pengantaran dan menyelesaikan order', JSON.stringify(completeData));

  // Restore original assignment mode
  await foodDb.updateConfig('ADMIN', { assignmentMode: originalMode });

  // --- BAGIAN 2: AUDIT PEMISAHAN OTORISASI & DATABASE FOOD VS SHOP ---
  console.log('\n--- BAGIAN 2: Audit Otorisasi & Pemisahan Akses Food vs Shop ---');

  const foodAdminToken = createAuthToken({
    userId: 'admin_food_official',
    role: 'ADMIN',
    email: 'admin@tumpanggo.com'
  });

  const shopAdminToken = createShopAuthToken({
    userId: 'admin_shop_official',
    role: 'SHOP_ADMIN',
    email: 'shopadmin@tumpanggo.com'
  });

  const masterAdminToken = createAuthToken({
    userId: 'master_super_admin',
    role: 'MASTER_ADMIN',
    email: 'tumpanggo@gmail.com',
    isMasterAdmin: true
  });

  // Test 1: Food Admin attempting to access Shop Admin endpoint (MUST BE REJECTED 401/403)
  const resFoodAdminOnShop = await fetch(`${baseUrl}/api/shop/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${foodAdminToken}`
    },
    body: JSON.stringify({ storeName: 'Hacked by Food Admin' })
  });
  assert(
    resFoodAdminOnShop.status === 401 || resFoodAdminOnShop.status === 403,
    `Admin Food DITOLAK mengakses pengaturan Admin Shop (${resFoodAdminOnShop.status}) — Hak akses tidak bocor`
  );

  // Test 2: Shop Admin accessing Shop Admin endpoint (MUST SUCCEED 200)
  const resShopAdminOnShop = await fetch(`${baseUrl}/api/shop/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shopAdminToken}`
    },
    body: JSON.stringify({ storeName: 'Tumpang Shop Mart Resmi' })
  });
  assert(resShopAdminOnShop.status === 200, 'Admin Shop RESMI berhasil memperbarui pengaturan toko Shop (200 OK)');

  // Test 3: Master Admin global override (MUST SUCCEED 200)
  const resMasterOnShop = await fetch(`${baseUrl}/api/shop/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${masterAdminToken}`
    },
    body: JSON.stringify({ storeName: 'Tumpang Shop Mart Ekosistem' })
  });
  assert(resMasterOnShop.status === 200, 'Master Admin resmi dapat mengelola Shop melalui otorisasi universal (200 OK)');

  // Test 4: Shop Admin attempting to access Food Admin endpoint (MUST BE REJECTED 401/403)
  const resShopAdminOnFood = await fetch(`${baseUrl}/api/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shopAdminToken}`
    },
    body: JSON.stringify({ serviceFee: 9999 })
  });
  assert(
    resShopAdminOnFood.status === 401 || resShopAdminOnFood.status === 403,
    `Admin Shop DITOLAK mengakses konfigurasi Food Admin (${resShopAdminOnFood.status}) — Otorisasi Food aman`
  );

  // Test 5: Verify Database Storage Isolation
  const foodStorageStatus = await foodDb.getStorageStatus();
  const shopStorageStatus = await shopDb.getStorageStatus();

  assert(foodStorageStatus.storageMode !== undefined, 'Food database memiliki storage mode sendiri');
  assert(shopStorageStatus.service === 'tumpang-shop', 'Shop database memiliki identitas service "tumpang-shop"');
  assert(shopStorageStatus.filePath.endsWith('tumpang_shop_db.json'), 'Shop database tersimpan pada file terpisah: tumpang_shop_db.json');

  // Verify zero leak of shop orders into food orders collection
  const allFoodOrders = foodDb.getOrders();
  const anyShopOrderInFood = allFoodOrders.some((o: any) => o.orderNumber && o.orderNumber.startsWith('TS-'));
  assert(!anyShopOrderInFood, 'Tidak ada satu pun order berformat "TS-" yang tersimpan di dalam Food Database (Zero Leakage)');

  // --- BAGIAN 3: AUDIT KEAMANAN SECRET & FAIL-SECURE BEHAVIOUR ---
  console.log('\n--- BAGIAN 3: Audit Keamanan Secret & Fail-Secure Behaviour in Production ---');

  // Test 3.1: Token creation in production must throw if FOOD_AUTH_SECRET is absent or fallback
  const originalFoodIsProd = foodConfig.isProduction;
  const originalFoodSecret = foodConfig.jwtSecret;
  const originalEnvFoodSecret = process.env.FOOD_AUTH_SECRET;

  (foodConfig as any).isProduction = true;
  (foodConfig as any).jwtSecret = '';
  delete process.env.FOOD_AUTH_SECRET;

  let foodSecretThrew = false;
  try {
    createAuthToken({ userId: 'test_user', role: 'ADMIN' });
  } catch (err: any) {
    foodSecretThrew = true;
    assert(err.message.includes('FOOD_AUTH_SECRET'), 'createAuthToken gagal secara aman (fail-secure) di mode produksi jika secret belum disetel');
  }
  if (!foodSecretThrew) {
    assert(false, 'createAuthToken HARUS melempar error di mode produksi jika secret belum disetel');
  }

  // Test 3.2: Shop token creation in production must throw if SHOP_AUTH_SECRET is absent or fallback
  const originalShopIsProd = shopConfig.isProduction;
  const originalShopEnvIsProd = shopEnv.isProduction;
  const originalShopSecret = shopConfig.jwtSecret;
  const originalEnvShopSecret = process.env.SHOP_AUTH_SECRET;

  (shopConfig as any).isProduction = true;
  (shopEnv as any).isProduction = true;
  (shopConfig as any).jwtSecret = '';
  (shopEnv.auth as any).jwtSecret = '';
  delete process.env.SHOP_AUTH_SECRET;

  let shopSecretThrew = false;
  try {
    createShopAuthToken({ userId: 'test_shop_user', role: 'SHOP_ADMIN' });
  } catch (err: any) {
    shopSecretThrew = true;
    assert(err.message.includes('SHOP_AUTH_SECRET'), 'createShopAuthToken gagal secara aman (fail-secure) di mode produksi jika secret belum disetel');
  }
  if (!shopSecretThrew) {
    assert(false, 'createShopAuthToken HARUS melempar error di mode produksi jika secret belum disetel');
  }

  // Restore configurations
  (foodConfig as any).isProduction = originalFoodIsProd;
  (foodConfig as any).jwtSecret = originalFoodSecret;
  if (originalEnvFoodSecret) process.env.FOOD_AUTH_SECRET = originalEnvFoodSecret;

  (shopConfig as any).isProduction = originalShopIsProd;
  (shopEnv as any).isProduction = originalShopEnvIsProd;
  (shopConfig as any).jwtSecret = originalShopSecret;
  (shopEnv.auth as any).jwtSecret = originalShopSecret;
  if (originalEnvShopSecret) process.env.SHOP_AUTH_SECRET = originalEnvShopSecret;

  // Close server
  server.close();

  console.log('\n================================================================');
  console.log(`📊 TOTAL HASIL AUDIT: ${passed} BERHASIL | ${failed} GAGAL`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runAuditTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
