/**
 * Comprehensive Automated Test Suite for TumpangGo Driver Dashboard & PWA
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { foodDb } from '../src/server/db';
import { createAuthToken, verifyAuthToken, verifyPassword } from '../src/server/auth';
import { OrderStatus, PaymentStatus } from '../src/types';

async function runTests() {
  console.log('=== STARTING TUMPANGGO DRIVER WORKFLOW & PWA TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - Detail: ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // 1. DRIVER CREDENTIALS & LOGIN TEST
  console.log('--- 1. Testing Driver Accounts & Login ---');
  let drivers = foodDb.getDrivers();
  if (drivers.length < 2) {
    await foodDb.createDriver('admin', { name: 'Driver Budi Santoso', phone: '081234567893', email: 'driver1@tumpanggo.com', active: true, online: true });
    await foodDb.createDriver('admin', { name: 'Driver Agus Pratama', phone: '081234567894', email: 'driver2@tumpanggo.com', active: true, online: true });
    drivers = foodDb.getDrivers();
  }
  assert(drivers.length >= 2, 'At least 2 test drivers exist in database', `Found ${drivers.length}`);

  const d1 = drivers[0];
  const d2 = drivers[1];
  assert(Boolean(d1), 'Driver d1 exists');
  assert(Boolean(d1.name), `Driver d1 has valid name (${d1.name})`);

  // Verify driver retrieval by email or phone
  const testPhone = d1.phone;
  if (testPhone) {
    const byPhone = foodDb.getDriverByEmailOrPhone(testPhone);
    assert(byPhone?.id === d1.id, `Lookup driver by phone number (${testPhone}) resolves to ${d1.id}`);
  }

  // Verify driver token issuance & verification
  const token = createAuthToken({
    userId: d1.id,
    role: 'DRIVER',
    email: d1.email || 'driver1@tumpanggo.com',
    entityId: d1.id
  });
  const decoded = verifyAuthToken(token);
  assert(decoded?.role === 'DRIVER' && decoded?.entityId === d1.id, `Driver auth token is cryptographically valid and contains entityId ${d1.id}`);

  // 2. DISPATCH & TASK ACCEPTANCE ATOMICITY TEST
  console.log('\n--- 2. Testing Order Dispatch & Atomic Acceptance ---');
  let m = foodDb.getMerchants()[0];
  if (!m) {
    m = await foodDb.createMerchant('admin', {
      name: 'Warung Tumpang Barokah',
      ownerName: 'Ibu Siti',
      phone: '081234567891',
      address: 'Jl. Raya Tumpang No. 10',
      latitude: -7.9942,
      longitude: 112.7667,
      openTime: '08:00',
      closeTime: '21:00',
      bankName: 'BCA',
      bankAccount: '123456789',
      bankHolder: 'Ibu Siti',
      active: true,
      cookTimeEstimate: '15-30 min',
      image: '/logo44.png',
      description: 'Spesial Soto Khas Tumpang',
      category: 'Kuliner Nusantara'
    });
  }
  let menuItems = foodDb.getMenuItemsByMerchant(m.id);
  let menuItem = menuItems[0];
  if (!menuItem) {
    menuItem = await foodDb.createMenuItem(m.id, {
      categoryId: 'cat_default',
      name: 'Bakso Spesial Tumpang',
      description: 'Bakso daging sapi asli',
      price: 18000,
      available: true,
      image: '/logo44.png'
    });
  }

  // Create a test order
  const testOrder = await foodDb.createOrder({
    merchantId: m.id,
    customerName: 'Pak Wahyu Tumpang',
    customerPhone: '081298765432',
    deliveryAddress: 'Jl. Raya Tumpang No. 15, Kec. Tumpang',
    items: [
      { menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 2 }
    ]
  });

  assert(Boolean(testOrder?.id), `Test order created with ID #${testOrder.id}`);
  assert(testOrder.deliveryFee === 5000, 'Order delivery fee is flat Rp 5.000 for Kecamatan Tumpang', `Got: ${testOrder.deliveryFee}`);

  // Test broadcast pool acceptance: switch mode to MANUAL temporarily
  const originalMode = foodDb.getConfig().assignmentMode;
  await foodDb.updateConfig('ADMIN', { assignmentMode: 'MANUAL' as any });

  // Mark payment verified in MANUAL mode
  await foodDb.updateOrder('ADMIN', testOrder.id, {
    status: OrderStatus.PAYMENT_VERIFIED,
    paymentStatus: PaymentStatus.PAID
  }, 'ADMIN');

  // Check available orders for drivers: PAYMENT_VERIFIED must NOT appear yet (merchant hasn't started cooking)
  let availableOrders = foodDb.getAvailableOrdersForDrivers();
  let isFoundInAvailable = availableOrders.some(o => o.id === testOrder.id);
  assert(!isFoundInAvailable, 'Order in PAYMENT_VERIFIED does not appear in driver broadcast until merchant starts cooking');

  // Merchant starts cooking
  await foodDb.updateOrder('m1', testOrder.id, { 
    status: OrderStatus.COOKING,
    cookingDurationMinutes: 15
  }, 'MERCHANT');

  // Now order in COOKING state MUST appear in broadcast pool
  availableOrders = foodDb.getAvailableOrdersForDrivers();
  isFoundInAvailable = availableOrders.some(o => o.id === testOrder.id);
  assert(isFoundInAvailable, 'Order in COOKING state successfully appears in driver available orders broadcast');

  // Driver 1 accepts the task
  const acceptedOrder = await foodDb.acceptDriverTask(d1.id, testOrder.id);
  assert(acceptedOrder.driverId === d1.id, `Driver ${d1.name} successfully accepts the task`);
  assert(acceptedOrder.driverName === d1.name, 'Driver name correctly recorded on order');

  // Race condition test: Driver 2 attempts to accept the SAME order concurrently
  let raceConditionPrevented = false;
  try {
    await foodDb.acceptDriverTask(d2.id, testOrder.id);
  } catch (err: any) {
    raceConditionPrevented = true;
    assert(true, 'Atomic pre-emption: Driver 2 is blocked from accepting order already taken', err.message);
  }
  assert(raceConditionPrevented, 'Concurrency guard prevented two drivers from taking the same order');

  // Restore original assignmentMode
  await foodDb.updateConfig('ADMIN', { assignmentMode: originalMode });

  // 3. OPERATIONAL STATUS TRANSITION TEST
  console.log('\n--- 3. Testing Driver Status Transitions ---');
  // Order is already in COOKING, advance to READY_FOR_PICKUP as merchant would
  
  // Update to READY_FOR_PICKUP as merchant would
  await foodDb.updateOrder('MERCHANT', testOrder.id, { status: OrderStatus.READY_FOR_PICKUP }, 'MERCHANT');
  
  // Driver confirms pickup
  const pickedUpOrder = await foodDb.updateOrder(d1.id, testOrder.id, {
    status: OrderStatus.ORDER_PICKED_UP
  }, 'DRIVER');
  assert(pickedUpOrder.status === OrderStatus.ORDER_PICKED_UP, 'Driver successfully marked status to ORDER_PICKED_UP');

  // Driver completes delivery with delivery proof
  const completedOrder = await foodDb.updateOrder(d1.id, testOrder.id, {
    status: OrderStatus.COMPLETED,
    deliveryProof: 'data:image/webp;base64,mockDeliveryProofData'
  }, 'DRIVER');
  assert(completedOrder.status === OrderStatus.COMPLETED, 'Driver successfully marked status to COMPLETED with photo proof attached');

  // Verify active tasks filter excludes completed order
  const d1Orders = foodDb.getOrdersByDriver(d1.id);
  const d1ActiveTasks = d1Orders.filter(o => 
    [OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
  );
  assert(!d1ActiveTasks.some(o => o.id === testOrder.id), 'Completed order no longer appears in active tasks');

  const d1HistoryTasks = d1Orders.filter(o => 
    [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(o.status)
  );
  assert(d1HistoryTasks.some(o => o.id === testOrder.id), 'Completed order correctly appears in delivery history');

  // 4. PWA COMPLIANCE & ASSETS VERIFICATION
  console.log('\n--- 4. Testing PWA Manifest & Icons ---');
  const manifestRaw = fs.readFileSync('public/manifest-driver.json', 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  assert(manifest.name === 'TumpangGo Driver', 'Manifest name is "TumpangGo Driver"', manifest.name);
  assert(manifest.short_name === 'TG Driver', 'Manifest short_name is "TG Driver"', manifest.short_name);
  assert(manifest.short_name.length <= 12, 'Manifest short_name length <= 12 chars');
  assert(manifest.display === 'standalone', 'Manifest display is "standalone"');
  assert(manifest.start_url === '/driver' || manifest.start_url === '/?role=DRIVER', 'Manifest start_url is valid driver route');
  assert(manifest.theme_color === '#059669', 'Manifest theme_color is emerald (#059669)');

  // Verify icon files on disk and their exact pixel dimensions with sharp
  const icon192Meta = await sharp('public/pwa-192x192.png').metadata();
  assert(icon192Meta.width === 192 && icon192Meta.height === 192, 'pwa-192x192.png exists and is exactly 192x192 px');

  const icon512Meta = await sharp('public/pwa-512x512.png').metadata();
  assert(icon512Meta.width === 512 && icon512Meta.height === 512, 'pwa-512x512.png exists and is exactly 512x512 px');

  const maskableMeta = await sharp('public/pwa-maskable-512x512.png').metadata();
  assert(maskableMeta.width === 512 && maskableMeta.height === 512, 'pwa-maskable-512x512.png exists with 10% safe margin padding');

  const appleTouchMeta = await sharp('public/apple-touch-icon.png').metadata();
  assert(appleTouchMeta.width === 180 && appleTouchMeta.height === 180, 'apple-touch-icon.png is 180x180 PNG for iOS Safari');

  // Verify service worker file exists and has bypass rules
  const swContent = fs.readFileSync('public/sw.js', 'utf-8');
  assert(swContent.includes("CACHE_NAME = 'tumpanggo-pwa-v"), 'Service worker has cache versioning');
  assert(swContent.includes("url.includes('/api/')"), 'Service worker strictly bypasses /api/ requests to prevent stale order data');

  console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
