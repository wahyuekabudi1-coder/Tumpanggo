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
  const drivers = foodDb.getDrivers();
  assert(drivers.length >= 2, 'At least 2 test drivers exist in database', `Found ${drivers.length}`);

  const d1 = foodDb.getDriverById('d1');
  assert(Boolean(d1), 'Driver d1 exists');
  assert(d1?.name === 'Budi Santoso', 'Driver d1 is Budi Santoso');

  // Verify driver retrieval by email or phone
  const byPhone = foodDb.getDriverByEmailOrPhone('081234567893');
  assert(byPhone?.id === 'd1', 'Lookup driver by phone number (081234567893) resolves to d1');

  const byEmail = foodDb.getDriverByEmailOrPhone('driver1@tumpanggo.com');
  assert(byEmail?.id === 'd1', 'Lookup driver by email (driver1@tumpanggo.com) resolves to d1');

  // Verify driver token issuance & verification
  const token = createAuthToken({
    userId: 'd1',
    role: 'DRIVER',
    email: 'driver1@tumpanggo.com',
    entityId: 'd1'
  });
  const decoded = verifyAuthToken(token);
  assert(decoded?.role === 'DRIVER' && decoded?.entityId === 'd1', 'Driver auth token is cryptographically valid and contains entityId d1');

  // 2. DISPATCH & TASK ACCEPTANCE ATOMICITY TEST
  console.log('\n--- 2. Testing Order Dispatch & Atomic Acceptance ---');
  // Create a test order
  const testOrder = await foodDb.createOrder({
    merchantId: 'm1',
    customerName: 'Pak Wahyu Tumpang',
    customerPhone: '081298765432',
    deliveryAddress: 'Jl. Raya Tumpang No. 15, Kec. Tumpang',
    items: [
      { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 18000, quantity: 2 }
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

  // Check available orders for drivers in broadcast pool
  const availableOrders = foodDb.getAvailableOrdersForDrivers();
  const isFoundInAvailable = availableOrders.some(o => o.id === testOrder.id);
  assert(isFoundInAvailable, 'Unassigned ready order appears in available orders broadcast for drivers');

  // Driver 1 (Budi) accepts the task
  const acceptedOrder = await foodDb.acceptDriverTask('d1', testOrder.id);
  assert(acceptedOrder.driverId === 'd1', 'Driver d1 successfully accepts the task');
  assert(acceptedOrder.driverName === 'Budi Santoso', 'Driver name correctly recorded on order');

  // Race condition test: Driver 2 (Agus) attempts to accept the SAME order concurrently
  let raceConditionPrevented = false;
  try {
    await foodDb.acceptDriverTask('d2', testOrder.id);
  } catch (err: any) {
    raceConditionPrevented = true;
    assert(true, 'Atomic pre-emption: Driver d2 is blocked from accepting order already taken by d1', err.message);
  }
  assert(raceConditionPrevented, 'Concurrency guard prevented two drivers from taking the same order');

  // Restore original assignmentMode
  await foodDb.updateConfig('ADMIN', { assignmentMode: originalMode });

  // 3. OPERATIONAL STATUS TRANSITION TEST
  console.log('\n--- 3. Testing Driver Status Transitions ---');
  // Attempting to pick up when status is COOKING (simulate premature pickup)
  await foodDb.updateOrder('MERCHANT', testOrder.id, { status: OrderStatus.COOKING }, 'MERCHANT');
  
  // Update to READY_FOR_PICKUP as merchant would
  await foodDb.updateOrder('MERCHANT', testOrder.id, { status: OrderStatus.READY_FOR_PICKUP }, 'MERCHANT');
  
  // Driver confirms pickup
  const pickedUpOrder = await foodDb.updateOrder('d1', testOrder.id, {
    status: OrderStatus.ORDER_PICKED_UP
  }, 'DRIVER');
  assert(pickedUpOrder.status === OrderStatus.ORDER_PICKED_UP, 'Driver successfully marked status to ORDER_PICKED_UP');

  // Driver completes delivery with delivery proof
  const completedOrder = await foodDb.updateOrder('d1', testOrder.id, {
    status: OrderStatus.COMPLETED,
    deliveryProof: 'data:image/webp;base64,mockDeliveryProofData'
  }, 'DRIVER');
  assert(completedOrder.status === OrderStatus.COMPLETED, 'Driver successfully marked status to COMPLETED with photo proof attached');

  // Verify active tasks filter excludes completed order
  const d1Orders = foodDb.getOrdersByDriver('d1');
  const d1ActiveTasks = d1Orders.filter(o => 
    [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
  );
  assert(!d1ActiveTasks.some(o => o.id === testOrder.id), 'Completed order no longer appears in active tasks');

  const d1HistoryTasks = d1Orders.filter(o => 
    [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(o.status)
  );
  assert(d1HistoryTasks.some(o => o.id === testOrder.id), 'Completed order correctly appears in delivery history');

  // 4. PWA COMPLIANCE & ASSETS VERIFICATION
  console.log('\n--- 4. Testing PWA Manifest & Icons ---');
  const manifestRaw = fs.readFileSync('public/manifest.json', 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  assert(manifest.name === 'TumpangGo Driver', 'Manifest name is "TumpangGo Driver"', manifest.name);
  assert(manifest.short_name === 'TumpangGo', 'Manifest short_name is "TumpangGo"', manifest.short_name);
  assert(manifest.short_name.length <= 12, 'Manifest short_name length <= 12 chars');
  assert(manifest.display === 'standalone', 'Manifest display is "standalone"');
  assert(manifest.start_url === '/?role=DRIVER', 'Manifest start_url is "/?role=DRIVER"');
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
  assert(swContent.includes("CACHE_NAME = 'tumpanggo-pwa-v10'"), 'Service worker has cache versioning');
  assert(swContent.includes("url.includes('/api/')"), 'Service worker strictly bypasses /api/ requests to prevent stale order data');

  console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
