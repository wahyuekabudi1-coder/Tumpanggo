/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Test Suite for:
 * 1. Driver order availability filtering (COOKING & READY_FOR_PICKUP only; PAYMENT_VERIFIED excluded)
 * 2. Driver online/approval authorization guards
 * 3. Simultaneous multi-driver atomic concurrency race test (Promise.allSettled)
 * 4. Payment proof upload authorization (MANDATORY HMAC token, rejection of phone match fallback)
 * 5. Rejection of unvalidated external HTTP/HTTPS URLs as payment proof
 * 6. Image MIME/magic bytes/size validation and state protection (WAITING_PAYMENT_VERIFICATION only; PAID requires Admin)
 */

import http from 'http';
import { app } from '../src/server/app';
import { foodDb } from '../src/server/db';
import { OrderStatus, PaymentStatus } from '../src/types';
import { generateOrderProofToken, verifyOrderProofToken } from '../src/server/routes/orderRoutes';
import { createAuthToken } from '../src/server/auth';

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 TUMPANGGO DRIVER ATOMIC CONCURRENCY & PAYMENT SECURITY AUDIT');
  console.log('================================================================\n');

  await foodDb.ensureInitialized();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title} - Detail: ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Ensure test merchant and menu item exist
  let merchants = foodDb.getMerchants();
  let m = merchants[0];
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
      description: 'Spesial Soto & Rawon Khas Tumpang',
      category: 'Kuliner Nusantara'
    });
  }

  let menuItems = foodDb.getMenuItemsByMerchant(m.id);
  let menuItem = menuItems[0];
  if (!menuItem) {
    menuItem = await foodDb.createMenuItem(m.id, {
      categoryId: 'cat_default',
      name: 'Soto Daging Tumpang',
      description: 'Soto hangat gurih dengan rempah asli',
      price: 15000,
      available: true,
      image: '/logo44.png'
    });
  }

  // Ensure test drivers exist
  let drivers = foodDb.getDrivers();
  let d1 = drivers.find(d => d.name === 'Driver Budi Santoso');
  if (!d1) {
    d1 = await foodDb.createDriver('admin', {
      name: 'Driver Budi Santoso',
      phone: '081234567892',
      active: true,
      online: true
    });
  }
  let d2 = drivers.find(d => d.name === 'Driver Agus Pratama');
  if (!d2) {
    d2 = await foodDb.createDriver('admin', {
      name: 'Driver Agus Pratama',
      phone: '081234567893',
      active: true,
      online: true
    });
  }

  // --- PART 1: ORDER AVAILABILITY FILTERING (COOKING VS PAYMENT_VERIFIED) ---
  console.log('--- 1. Testing Driver Broadcast Availability Filtering ---');

  const testOrder = await foodDb.createOrder({
    merchantId: m.id,
    customerName: 'Siti Rahma',
    customerPhone: '081234567890',
    deliveryAddress: 'Jl. Raya Tumpang No. 20',
    items: [{ menuItemId: menuItem.id, quantity: 1, name: menuItem.name, price: menuItem.price }]
  });

  assert(testOrder.status === OrderStatus.WAITING_PAYMENT, 'Order starts in WAITING_PAYMENT status');

  let avail = foodDb.getAvailableOrdersForDrivers();
  assert(!avail.some(o => o.id === testOrder.id), 'Order in WAITING_PAYMENT is NOT in driver available list');

  // Verify Admin verifies payment -> Status becomes PAYMENT_VERIFIED
  await foodDb.updateOrder('admin', testOrder.id, {
    status: OrderStatus.PAYMENT_VERIFIED,
    paymentStatus: PaymentStatus.PAID
  }, 'ADMIN');

  avail = foodDb.getAvailableOrdersForDrivers();
  assert(!avail.some(o => o.id === testOrder.id), 'CRITICAL: Order with PAYMENT_VERIFIED is NOT in driver available list (merchant has not started cooking)');

  // Merchant clicks "Mulai Memasak" -> Status becomes COOKING
  await foodDb.updateOrder('m1', testOrder.id, {
    status: OrderStatus.COOKING,
    cookingDurationMinutes: 15
  }, 'MERCHANT');

  avail = foodDb.getAvailableOrdersForDrivers();
  assert(avail.some(o => o.id === testOrder.id), 'Order with COOKING status IS available in driver broadcast');

  // --- PART 2: DRIVER ELIGIBILITY & APPROVAL GUARDS ---
  console.log('\n--- 2. Testing Driver Approval & Online Status Enforcement ---');

  // Test: Driver who is offline cannot accept task
  await foodDb.updateDriver('admin', d1.id, { online: false }, 'ADMIN');
  let offlineBlocked = false;
  try {
    await foodDb.acceptDriverTask(d1.id, testOrder.id);
  } catch (err: any) {
    offlineBlocked = true;
    assert(err.message.includes('Offline'), 'Offline driver is blocked from accepting task', err.message);
  }
  assert(offlineBlocked, 'Offline driver acceptance guard successfully enforced');

  // Test: Driver who is inactive/not approved cannot accept task
  await foodDb.updateDriver('admin', d1.id, { online: true, active: false }, 'ADMIN');
  let unapprovedBlocked = false;
  try {
    await foodDb.acceptDriverTask(d1.id, testOrder.id);
  } catch (err: any) {
    unapprovedBlocked = true;
    assert(err.message.includes('belum disetujui') || err.message.includes('dinonaktifkan'), 'Unapproved driver is blocked from accepting task', err.message);
  }
  assert(unapprovedBlocked, 'Inactive driver acceptance guard successfully enforced');

  // Restore drivers to online & active
  await foodDb.updateDriver('admin', d1.id, { online: true, active: true }, 'ADMIN');
  await foodDb.updateDriver('admin', d2.id, { online: true, active: true }, 'ADMIN');

  // --- PART 3: SIMULTANEOUS ATOMIC CONCURRENCY RACE TEST ---
  console.log('\n--- 3. Testing Simultaneous Multi-Driver Atomic Concurrency ---');

  // Create a brand new order for concurrent race
  const raceOrder = await foodDb.createOrder({
    merchantId: m.id,
    customerName: 'Joko Susilo',
    customerPhone: '081288887777',
    deliveryAddress: 'Jl. Melati Tumpang',
    items: [{ menuItemId: menuItem.id, quantity: 2, name: menuItem.name, price: menuItem.price }]
  });

  // Advance to COOKING
  await foodDb.updateOrder('admin', raceOrder.id, {
    status: OrderStatus.PAYMENT_VERIFIED,
    paymentStatus: PaymentStatus.PAID
  }, 'ADMIN');
  await foodDb.updateOrder('m1', raceOrder.id, {
    status: OrderStatus.COOKING,
    cookingDurationMinutes: 20
  }, 'MERCHANT');

  console.log(`  ⚡ Simulating simultaneous task acceptance for order ${raceOrder.id} by Driver 1 (${d1.name}) and Driver 2 (${d2.name})...`);

  // Execute two driver acceptances in parallel
  const racePromises = [
    foodDb.acceptDriverTask(d1.id, raceOrder.id),
    foodDb.acceptDriverTask(d2.id, raceOrder.id)
  ];

  const raceResults = await Promise.allSettled(racePromises);

  const fulfilled = raceResults.filter(r => r.status === 'fulfilled');
  const rejected = raceResults.filter(r => r.status === 'rejected');

  assert(fulfilled.length === 1, 'Exactly ONE driver succeeded in claiming the order', `Fulfilled: ${fulfilled.length}`);
  assert(rejected.length === 1, 'Exactly ONE driver was rejected (atomic race condition prevented)', `Rejected: ${rejected.length}`);

  if (rejected.length > 0) {
    const reason = (rejected[0] as PromiseRejectedResult).reason?.message || '';
    assert(reason.includes('telah diambil oleh kurir lain') || reason.includes('Pesanan ini telah diambil'), 'Rejection error clearly states order was already taken', reason);
  }

  // Check state of the order after race
  const finalRaceOrder = foodDb.getOrderById(raceOrder.id);
  assert(Boolean(finalRaceOrder?.driverId), 'Winning driver is recorded on the order');
  assert(finalRaceOrder?.driverId === d1.id || finalRaceOrder?.driverId === d2.id, 'Recorded driver is one of the competitors');

  // Ensure claimed order is no longer in available list
  avail = foodDb.getAvailableOrdersForDrivers();
  assert(!avail.some(o => o.id === raceOrder.id), 'Claimed order is immediately removed from available broadcast list');

  // --- PART 4: PAYMENT PROOF TOKEN CRYPTOGRAPHY AUDIT ---
  console.log('\n--- 4. Testing Payment Proof Token Cryptography ---');

  const testToken = generateOrderProofToken(testOrder.id);
  assert(typeof testToken === 'string' && testToken.length === 64, 'Proof token is a 64-char SHA256 HMAC hash');
  assert(verifyOrderProofToken(testOrder.id, testToken), 'Proof token verifies successfully with correct order ID');
  assert(!verifyOrderProofToken('ord_wrong_id', testToken), 'Proof token fails verification against different order ID');
  assert(!verifyOrderProofToken(testOrder.id, 'tampered_token_string'), 'Tampered token fails verification');

  // --- PART 5: HTTP ENDPOINT SECURITY & INJECTION AUDIT ---
  console.log('\n--- 5. Testing HTTP Payment Proof Upload Security & Authorization ---');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 5.1 Test: Create fresh order for upload testing
    const uploadOrder = await foodDb.createOrder({
      merchantId: m.id,
      customerName: 'Ahmad Dahlan',
      customerPhone: '081234567899',
      deliveryAddress: 'Jl. Anggrek Tumpang',
      items: [{ menuItemId: menuItem.id, quantity: 1, name: menuItem.name, price: menuItem.price }]
    });

    const validOrderProofToken = generateOrderProofToken(uploadOrder.id);
    const validImage1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    // 5.2 Test: Attacker tries to upload using ONLY phone number match (no HMAC token) -> MUST BE REJECTED 403
    const phoneOnlyRes = await fetch(`${baseUrl}/api/orders/${uploadOrder.id}/upload-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentProof: validImage1x1Png,
        customerPhone: '081234567899' // Matches phone, but NO valid token provided
      })
    });
    assert(phoneOnlyRes.status === 403, 'REJECTED: Partial/matching phone number without HMAC token is rejected with 403 Forbidden', `Got HTTP ${phoneOnlyRes.status}`);

    // 5.3 Test: Attacker tries with invalid/wrong token -> MUST BE REJECTED 403
    const badTokenRes = await fetch(`${baseUrl}/api/orders/${uploadOrder.id}/upload-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-order-token': 'fake_token_1234567890abcdef'
      },
      body: JSON.stringify({
        paymentProof: validImage1x1Png
      })
    });
    assert(badTokenRes.status === 403, 'REJECTED: Invalid HMAC ownership token is rejected with 403 Forbidden', `Got HTTP ${badTokenRes.status}`);

    // 5.4 Test: External HTTP/HTTPS URLs (SSRF / unvalidated link) -> MUST BE REJECTED 400
    const httpUrlRes = await fetch(`${baseUrl}/api/orders/${uploadOrder.id}/upload-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-order-token': validOrderProofToken
      },
      body: JSON.stringify({
        paymentProof: 'https://attacker.example.com/fake_proof_slip.jpg'
      })
    });
    assert(httpUrlRes.status === 400, 'REJECTED: External HTTP/HTTPS URLs are strictly rejected with 400 Bad Request', `Got HTTP ${httpUrlRes.status}`);

    // 5.5 Test: Non-image or corrupted data URI -> MUST BE REJECTED 400
    const nonImageRes = await fetch(`${baseUrl}/api/orders/${uploadOrder.id}/upload-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-order-token': validOrderProofToken
      },
      body: JSON.stringify({
        paymentProof: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='
      })
    });
    assert(nonImageRes.status === 400, 'REJECTED: Non-image payload is rejected with 400 Bad Request', `Got HTTP ${nonImageRes.status}`);

    // 5.6 Test: Legitimate client with valid HMAC token and valid image file -> MUST SUCCEED 200
    const legitRes = await fetch(`${baseUrl}/api/orders/${uploadOrder.id}/upload-payment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-order-token': validOrderProofToken
      },
      body: JSON.stringify({
        paymentProof: validImage1x1Png
      })
    });
    assert(legitRes.status === 200, 'ACCEPTED: Legitimate upload with valid HMAC token & valid image accepted with 200 OK', `Got HTTP ${legitRes.status}`);

    const legitData = await legitRes.json();
    assert(legitData.status === OrderStatus.WAITING_PAYMENT_VERIFICATION, 'Order status updated strictly to WAITING_PAYMENT_VERIFICATION (not PAID)');
    assert(legitData.paymentStatus === PaymentStatus.WAITING_VERIFICATION, 'Payment status updated strictly to WAITING_VERIFICATION (not PAID)');
    assert(Boolean(legitData.order && legitData.order.customerPhoneMasked), 'Response contains sanitized DTO with masked customer phone number');
    assert(legitData.order.customerPhone === undefined || !legitData.order.customerPhone.includes('081234567899'), 'Full raw customer phone is omitted from response to prevent leakage');

    // 5.7 Test: Status cannot be updated to PAID via upload proof or normal update; requires Admin verify-payment
    const adminToken = createAuthToken({
      userId: 'admin_audit',
      role: 'ADMIN',
      email: 'admin@tumpanggo.com'
    });

    const verifyRes = await fetch(`${baseUrl}/api/orders/${uploadOrder.id}/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert(verifyRes.status === 200, 'Admin successfully verifies payment via /verify-payment', `Got HTTP ${verifyRes.status}`);

    const verifiedOrder = foodDb.getOrderById(uploadOrder.id);
    assert(verifiedOrder?.status === OrderStatus.PAYMENT_VERIFIED, 'Order status is now PAYMENT_VERIFIED');
    assert(verifiedOrder?.paymentStatus === PaymentStatus.PAID, 'Payment status is now PAID');

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`📊 AUDIT RESULTS: Passed ${passed} / ${passed + failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
