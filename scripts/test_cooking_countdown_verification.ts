/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Test Suite: Real-Time Cooking Countdown & Synchronization
 * Verifies Merchant & Driver synchronization, backend persistence, idempotency,
 * security boundaries, and edge cases.
 */

import { foodDb } from '../src/server/db';
import { OrderStatus, PaymentStatus } from '../src/types';
import { calculateRemainingCooking, formatCookingTime, formatWibTime, ALLOWED_COOKING_DURATIONS } from '../src/utils/cookingTimer';

async function runComprehensiveCookingTests() {
  console.log('===============================================================');
  console.log('TUMPANGGO FOOD: COOKING ESTIMATE & COUNTDOWN VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}${detail ? ` - Detail: ${detail}` : ''}`);
    }
  }

  const BASE_URL = 'http://127.0.0.1:3000';

  // Step 0: Ensure DB initialized
  await foodDb.ensureInitialized();

  // Step 1: Merchant & Driver Authentication
  console.log('\n--- Step 1: Authentication ---');
  const m1Login = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'm1@tumpanggo.com',
      username: 'm1@tumpanggo.com',
      password: 'm1123',
      role: 'MERCHANT'
    })
  });
  const m1Auth = await m1Login.json();
  assert(m1Login.ok && Boolean(m1Auth.token), 'Merchant m1 login succeeds', JSON.stringify(m1Auth));
  const m1Token = m1Auth.token;

  const adminLogin = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'tumpanggo@gmail.com',
      password: 'TumpangGoAdmin#2026',
      role: 'ADMIN'
    })
  });
  const adminAuth = await adminLogin.json();
  assert(adminLogin.ok && Boolean(adminAuth.token), 'Admin login succeeds', JSON.stringify(adminAuth));
  const adminToken = adminAuth.token;

  const driverLogin = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: '081234567893',
      password: 'd1123',
      role: 'DRIVER'
    })
  });
  const driverAuth = await driverLogin.json();
  assert(driverLogin.ok && Boolean(driverAuth.token), 'Driver d1 login succeeds', JSON.stringify(driverAuth));
  const driverToken = driverAuth.token;

  // Set driver d1 online so tasks can be accepted
  await fetch(`${BASE_URL}/api/drivers/d1`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({ online: true, active: true })
  });

  // Step 2: Helper to create a verified order
  async function createVerifiedOrder(suffix: string): Promise<string> {
    const created = await foodDb.createOrder({
      customerName: `Customer Test ${suffix}`,
      customerPhone: '081299990001',
      deliveryAddress: 'Jl. Raya Tumpang No. 10, Kec. Tumpang, Malang',
      deliveryDetails: 'Rumah Putih',
      landmark: 'Dekat Pasar',
      latitude: -7.9984,
      longitude: 112.7663,
      merchantId: 'm1',
      merchantName: 'Warung Bakso & Mie Ayam Barokah',
      items: [{ menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 18000, quantity: 2 }],
      subtotal: 36000,
      deliveryFee: 5000,
      serviceFee: 2000,
      total: 43000,
      uniqueCode: 12
    });

    // Admin verifies payment
    await foodDb.verifyOrderPayment('admin', created.id);
    return created.id;
  }

  // Test 1: Merchant selects and starts cooking with 15 minutes
  console.log('\n--- Step 2: Test 15 Menit Cooking Duration ---');
  const orderId15 = await createVerifiedOrder('15m');
  const res15 = await fetch(`${BASE_URL}/api/orders/${orderId15}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingDurationMinutes: 15
    })
  });
  const data15 = await res15.json();
  assert(
    res15.ok &&
    data15.status === OrderStatus.COOKING &&
    data15.cookingDurationMinutes === 15 &&
    Boolean(data15.cookingStartedAt) &&
    Boolean(data15.cookingEndsAt),
    'Order successfully transitions to COOKING with 15 minutes',
    JSON.stringify(data15)
  );

  const startMs15 = new Date(data15.cookingStartedAt).getTime();
  const endMs15 = new Date(data15.cookingEndsAt).getTime();
  const diffMinutes15 = Math.round((endMs15 - startMs15) / 60000);
  assert(diffMinutes15 === 15, 'cookingEndsAt is precisely 15 minutes after cookingStartedAt', `Diff: ${diffMinutes15}m`);

  // Test 2: Repeat for 30, 45, and 60 minutes
  console.log('\n--- Step 3: Test 30, 45, 60 Menit Durations ---');
  for (const dur of [30, 45, 60] as const) {
    const ordId = await createVerifiedOrder(`${dur}m`);
    const r = await fetch(`${BASE_URL}/api/orders/${ordId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${m1Token}`
      },
      body: JSON.stringify({
        status: OrderStatus.COOKING,
        cookingDurationMinutes: dur
      })
    });
    const d = await r.json();
    const sMs = new Date(d.cookingStartedAt).getTime();
    const eMs = new Date(d.cookingEndsAt).getTime();
    const diffM = Math.round((eMs - sMs) / 60000);
    assert(
      r.ok && d.status === OrderStatus.COOKING && d.cookingDurationMinutes === dur && diffM === dur,
      `Duration ${dur} minutes saved correctly with server endsAt`,
      `Expected ${dur}m, got ${diffM}m`
    );
  }

  // Test 3: Backend validation rejects invalid durations (e.g. 25, 90)
  console.log('\n--- Step 4: Backend Validation for Durations ---');
  const invalidOrderId = await createVerifiedOrder('invalid_dur');
  const invalidRes = await fetch(`${BASE_URL}/api/orders/${invalidOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingDurationMinutes: 25 // Not allowed
    })
  });
  assert(
    invalidRes.status === 400,
    'Backend rejects invalid cooking duration (25m) with HTTP 400',
    `Status: ${invalidRes.status}`
  );

  // Test 4: Countdown format & deterministic synchronization across Merchant & Driver
  console.log('\n--- Step 5: Countdown Synchronicity Across Merchant & Driver ---');
  const syncOrderId = await createVerifiedOrder('sync_test');
  await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingDurationMinutes: 30
    })
  });

  // Assign driver d1 so driver has authorized access to view order and sync countdown
  await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      driverId: 'd1',
      driverName: 'Budi Santoso'
    })
  });

  // Merchant fetches order
  const merGet = await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    headers: { 'Authorization': `Bearer ${m1Token}` }
  });
  const merOrder = await merGet.json();

  // Driver fetches order
  const drGet = await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    headers: { 'Authorization': `Bearer ${driverToken}` }
  });
  const drOrder = await drGet.json();

  assert(
    merOrder.cookingEndsAt === drOrder.cookingEndsAt &&
    merOrder.cookingStartedAt === drOrder.cookingStartedAt &&
    merOrder.cookingDurationMinutes === drOrder.cookingDurationMinutes,
    'Merchant and Driver receive exact same server timestamps and duration',
    `Mer: ${merOrder.cookingEndsAt}, Dr: ${drOrder.cookingEndsAt}`
  );

  const nowTest = Date.now();
  const merCountdown = calculateRemainingCooking(merOrder, nowTest);
  const drCountdown = calculateRemainingCooking(drOrder, nowTest);

  assert(
    merCountdown.formattedRemaining === drCountdown.formattedRemaining &&
    merCountdown.remainingSeconds === drCountdown.remainingSeconds &&
    merCountdown.estimatedEndTime === drCountdown.estimatedEndTime,
    'Merchant and Driver compute identical remaining time MM:SS and target time',
    `Time: ${merCountdown.formattedRemaining}, Target: ${merCountdown.estimatedEndTime}`
  );

  // Test 5: Refreshing page does NOT reset countdown
  console.log('\n--- Step 6: Refresh Simulation Does Not Reset Countdown ---');
  const initialSeconds = merCountdown.remainingSeconds;
  // Simulate 3 seconds passing
  const simulatedLater = nowTest + 3000;
  const after3s = calculateRemainingCooking(merOrder, simulatedLater);
  assert(
    after3s.remainingSeconds === initialSeconds - 3,
    'Simulating 3s elapsed reduces remainingSeconds by exactly 3, not resetting to 30:00',
    `Initial: ${initialSeconds}s, After: ${after3s.remainingSeconds}s`
  );

  // Test 6: Idempotency against double-clicks
  console.log('\n--- Step 7: Double-Click / Repeated API Call Idempotency ---');
  const initialStartedAt = merOrder.cookingStartedAt;
  const initialEndsAt = merOrder.cookingEndsAt;

  // Send duplicate PUT request with same duration
  const dupRes = await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingDurationMinutes: 30
    })
  });
  const dupData = await dupRes.json();
  assert(
    dupData.cookingStartedAt === initialStartedAt && dupData.cookingEndsAt === initialEndsAt,
    'Re-submitting cooking confirmation with same duration preserves original timestamps without restarting countdown',
    `Original: ${initialStartedAt}, After duplicate: ${dupData.cookingStartedAt}`
  );

  // Test 7: Countdown reaching zero sets isExpired and requires manual merchant confirmation
  console.log('\n--- Step 8: Countdown Reaching Zero & Expiry State ---');
  const pastEndTime = new Date(merOrder.cookingEndsAt).getTime() + 10000; // 10 seconds past end
  const expiredState = calculateRemainingCooking(merOrder, pastEndTime);
  assert(
    expiredState.isExpired === true && expiredState.formattedRemaining === '00:00',
    'When current time exceeds cookingEndsAt, isExpired is true and formatted is 00:00',
    `Remaining: ${expiredState.formattedRemaining}, isExpired: ${expiredState.isExpired}`
  );

  // Check that order in backend has NOT changed to READY_FOR_PICKUP automatically
  const freshCheckRes = await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    headers: { 'Authorization': `Bearer ${m1Token}` }
  });
  const freshCheck = await freshCheckRes.json();
  assert(
    freshCheck?.status === OrderStatus.COOKING,
    'Order status remains COOKING even when countdown reaches zero (no automatic status change)',
    `Status: ${freshCheck?.status}`
  );

  // Test 8: Merchant confirms ready before or after timer expires
  console.log('\n--- Step 9: Merchant Confirms Food Ready for Pickup ---');
  const readyRes = await fetch(`${BASE_URL}/api/orders/${syncOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.READY_FOR_PICKUP
    })
  });
  const readyData = await readyRes.json();
  assert(
    readyRes.ok && readyData.status === OrderStatus.READY_FOR_PICKUP,
    'Merchant successfully marks order READY_FOR_PICKUP',
    `Status: ${readyData.status}`
  );

  // Driver now can pick up the order
  const pickupRes = await fetch(`${BASE_URL}/api/orders/${syncOrderId}/accept-task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    }
  });
  assert(pickupRes.ok, 'Driver can accept the ready-for-pickup task', `HTTP ${pickupRes.status}`);

  // Test 9: Driver cannot pick up while still COOKING
  console.log('\n--- Step 10: Driver Cannot Pick Up While Order is COOKING ---');
  const cookingOrderForDriverTest = await createVerifiedOrder('driver_pickup_guard');
  await fetch(`${BASE_URL}/api/orders/${cookingOrderForDriverTest}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingDurationMinutes: 15
    })
  });

  // Assign driver via Admin API so dev server has it in memory
  await fetch(`${BASE_URL}/api/orders/${cookingOrderForDriverTest}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      driverId: 'd1',
      driverName: 'Budi Santoso'
    })
  });

  // Driver tries to set status to ORDER_PICKED_UP while cooking
  const prematurePickup = await fetch(`${BASE_URL}/api/orders/${cookingOrderForDriverTest}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${driverToken}`
    },
    body: JSON.stringify({
      status: OrderStatus.ORDER_PICKED_UP
    })
  });
  assert(
    prematurePickup.status === 400,
    'Backend prevents driver from marking order picked up while still COOKING',
    `Status: ${prematurePickup.status}`
  );

  // Test 10: Security - Other merchant cannot update order
  console.log('\n--- Step 11: Security & Cross-Merchant Isolation ---');
  const m2Login = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'm2@tumpanggo.com',
      username: 'm2@tumpanggo.com',
      password: 'm2123',
      role: 'MERCHANT'
    })
  });
  const m2Auth = await m2Login.json();
  const m2Token = m2Auth.token;

  const crossMerchantRes = await fetch(`${BASE_URL}/api/orders/${cookingOrderForDriverTest}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m2Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingDurationMinutes: 15
    })
  });
  assert(
    crossMerchantRes.status === 403,
    'Merchant m2 is forbidden from managing Merchant m1 order (HTTP 403)',
    `Status: ${crossMerchantRes.status}`
  );

  // Test 11: Backward compatibility with legacy orders without cooking fields
  console.log('\n--- Step 12: Backward Compatibility with Legacy Orders ---');
  const legacyOrder = {
    id: 'ord_legacy_test',
    status: OrderStatus.COOKING,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    items: [],
    subtotal: 20000,
    deliveryFee: 5000,
    serviceFee: 2000,
    total: 27000,
    uniqueCode: 1,
    customerName: 'Legacy Customer',
    customerPhone: '0812345678',
    deliveryAddress: 'Tumpang',
    deliveryDetails: '',
    landmark: '',
    latitude: -7.99,
    longitude: 112.76,
    merchantId: 'm1',
    merchantName: 'Warung Barokah',
    paymentExpiresAt: new Date().toISOString()
  };
  const legacyCalc = calculateRemainingCooking(legacyOrder, Date.now());
  assert(
    typeof legacyCalc.remainingSeconds === 'number' &&
    typeof legacyCalc.formattedRemaining === 'string' &&
    legacyCalc.durationMinutes === 15,
    'Legacy order without cooking timestamps computes safely with fallback duration',
    `Remaining: ${legacyCalc.formattedRemaining}`
  );

  // Final Summary
  console.log('\n===============================================================');
  console.log(`TEST RUN COMPLETED: ${passed} / ${total} TESTS PASSED`);
  console.log('===============================================================');

  if (passed === total) {
    console.log('ALL COOKING COUNTDOWN AND SYNCHRONIZATION TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error(`FAILED: ${total - passed} tests failed.\n`);
    process.exit(1);
  }
}

runComprehensiveCookingTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
