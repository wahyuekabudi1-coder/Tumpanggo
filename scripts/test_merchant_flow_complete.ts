/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Verification: Merchant Dashboard Order Flow, Verification & UI Isolation
 */

import { foodDb } from '../src/server/db';
import { createAuthToken } from '../src/server/auth';
import { OrderStatus, PaymentStatus } from '../src/types';

async function runVerification() {
  console.log('===============================================================');
  console.log('TUMPANGGO MERCHANT DASHBOARD FLOW & AUDIT VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}${detail ? ` - ${detail}` : ''}`);
    }
  }

  const BASE_URL = 'http://127.0.0.1:3000';

  // 1. Merchant m1 login
  console.log('--- Step 1: Merchant & Admin Authentication ---');
  const m1LoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'm1@tumpanggo.com',
      username: 'm1@tumpanggo.com',
      password: 'm1123',
      role: 'MERCHANT'
    })
  });
  const m1Auth = await m1LoginRes.json();
  assert(m1LoginRes.ok && Boolean(m1Auth.token), 'Merchant m1 authenticates successfully', JSON.stringify(m1Auth));
  const m1Token = m1Auth.token;

  // Merchant m2 login
  const m2LoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'm2@tumpanggo.com',
      username: 'm2@tumpanggo.com',
      password: 'm2123',
      role: 'MERCHANT'
    })
  });
  const m2Auth = await m2LoginRes.json();
  assert(m2LoginRes.ok && Boolean(m2Auth.token), 'Merchant m2 authenticates successfully', JSON.stringify(m2Auth));
  const m2Token = m2Auth.token;

  // Admin token
  const adminToken = createAuthToken({
    userId: 'admin_test_1',
    role: 'ADMIN',
    email: 'tumpanggo@gmail.com'
  });
  assert(Boolean(adminToken), 'Admin cryptographically signed token generated');

  // 2. Customer creates an order for m1
  console.log('\n--- Step 2: Customer Checkout for Merchant m1 ---');
  const orderPayload = {
    customerName: 'Budi Santoso',
    customerPhone: '081298765432',
    deliveryAddress: 'Jl. Raya Tumpang No. 100, Tumpang',
    deliveryDetails: 'Depan Alfamart',
    landmark: 'Gapura Tumpang',
    latitude: -7.9984,
    longitude: 112.7663,
    items: [
      { menuItemId: 'menu_1', quantity: 2 }
    ],
    merchantId: 'm1',
    clientRequestId: 'req_test_' + Date.now()
  };

  const createRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  });
  const newOrder = await createRes.json();
  assert(createRes.ok && Boolean(newOrder.id), 'Customer places order for m1', JSON.stringify(newOrder));
  assert(newOrder.merchantId === 'm1', 'Order belongs to merchant m1');
  assert(newOrder.status === OrderStatus.WAITING_PAYMENT, 'Order initial status is WAITING_PAYMENT');

  // 3. Customer uploads payment proof
  console.log('\n--- Step 3: Customer Uploads Payment Proof ---');
  const dummyProof = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzx5t7aAAAAABJRU5ErkJggg==';
  const proofRes = await fetch(`${BASE_URL}/api/orders/${newOrder.id}/upload-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentProof: dummyProof
    })
  });
  const proofOrder = await proofRes.json();
  assert(proofRes.ok && proofOrder.status === OrderStatus.WAITING_PAYMENT_VERIFICATION, 'Payment proof uploaded, status becomes WAITING_PAYMENT_VERIFICATION');

  // 4. Admin verifies payment
  console.log('\n--- Step 4: Admin Verifies Payment ---');
  const verifyRes = await fetch(`${BASE_URL}/api/orders/${newOrder.id}/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'x-auth-token': adminToken
    },
    body: JSON.stringify({ role: 'ADMIN' })
  });
  const verifyData = await verifyRes.json();
  assert(verifyRes.ok && verifyData.success, 'Admin verifies payment successfully', JSON.stringify(verifyData));
  assert(verifyData.order.status === OrderStatus.PAYMENT_VERIFIED, 'Order operational status is PAYMENT_VERIFIED');
  assert(verifyData.order.paymentStatus === PaymentStatus.PAID, 'Order payment status is PAID');
  assert(Boolean(verifyData.order.receiptNumber), 'E-Receipt number issued: ' + verifyData.order.receiptNumber);

  // 5. Merchant m1 fetches orders
  console.log('\n--- Step 5: Merchant m1 Fetches Orders ---');
  const m1OrdersRes = await fetch(`${BASE_URL}/api/merchants/m1/orders`, {
    headers: {
      'Authorization': `Bearer ${m1Token}`
    }
  });
  const m1Orders = await m1OrdersRes.json();
  assert(m1OrdersRes.ok && Array.isArray(m1Orders), 'GET /api/merchants/m1/orders returns 200 OK array');
  
  const foundOrder = m1Orders.find((o: any) => o.id === newOrder.id);
  assert(Boolean(foundOrder), 'Newly verified order appears in Merchant m1 Dashboard');
  assert(foundOrder?.status === OrderStatus.PAYMENT_VERIFIED, 'Order has status PAYMENT_VERIFIED in merchant list');
  assert(foundOrder?.paymentStatus === PaymentStatus.PAID, 'Order has status PAID in merchant list');
  assert(foundOrder?.receiptNumber === verifyData.order.receiptNumber, 'E-Receipt number matches verified receipt');

  // 6. Data Isolation & RBAC
  console.log('\n--- Step 6: Strict RBAC & Data Isolation ---');
  // Merchant m2 should NOT see m1's order
  const m2OrdersRes = await fetch(`${BASE_URL}/api/merchants/m2/orders`, {
    headers: {
      'Authorization': `Bearer ${m2Token}`
    }
  });
  const m2Orders = await m2OrdersRes.json();
  const leakOrder = m2Orders.find((o: any) => o.id === newOrder.id);
  assert(!leakOrder, 'Merchant m2 CANNOT see m1 orders (strict data isolation)');

  // Merchant m2 tries to query m1 endpoint directly -> 403 Forbidden
  const forbiddenRes = await fetch(`${BASE_URL}/api/merchants/m1/orders`, {
    headers: {
      'Authorization': `Bearer ${m2Token}`
    }
  });
  assert(forbiddenRes.status === 403, 'Merchant m2 forbidden from accessing /api/merchants/m1/orders (HTTP 403)');

  // 7. Kitchen Operational Transitions
  console.log('\n--- Step 7: Kitchen Lifecycle (Cooking -> Ready) ---');
  // Merchant m1 accepts order
  const cookingRes = await fetch(`${BASE_URL}/api/orders/${newOrder.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.COOKING,
      cookingTimeMinutes: 20,
      role: 'MERCHANT',
      userId: 'm1'
    })
  });
  const cookingOrder = await cookingRes.json();
  assert(cookingRes.ok && cookingOrder.status === OrderStatus.COOKING, 'Merchant starts cooking (status becomes COOKING)');

  // Merchant m1 marks order ready for pickup
  const readyRes = await fetch(`${BASE_URL}/api/orders/${newOrder.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({
      status: OrderStatus.READY_FOR_PICKUP,
      role: 'MERCHANT',
      userId: 'm1'
    })
  });
  const readyOrder = await readyRes.json();
  assert(readyRes.ok && readyOrder.status === OrderStatus.READY_FOR_PICKUP, 'Merchant marks ready (status becomes READY_FOR_PICKUP)');

  // 8. E-Receipt Verification
  console.log('\n--- Step 8: E-Receipt Retrieval ---');
  const receiptRes = await fetch(`${BASE_URL}/api/orders/${newOrder.id}/receipt`, {
    headers: {
      'Authorization': `Bearer ${m1Token}`
    }
  });
  const receiptData = await receiptRes.json();
  assert(receiptRes.ok && Boolean(receiptData.receipt), 'E-Receipt accessible for verified order', JSON.stringify(receiptData));
  assert(receiptData.receipt.subtotal === newOrder.subtotal, 'E-Receipt subtotal matches order');

  // 9. Menu Product Operations
  console.log('\n--- Step 9: Menu Catalog Availability Toggle ---');
  const toggleRes = await fetch(`${BASE_URL}/api/merchants/m1/menu/menu_1`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({ available: false })
  });
  const toggleItem = await toggleRes.json();
  assert(toggleRes.ok && toggleItem.available === false, 'Merchant toggles menu availability to false (Habis)');

  // Re-enable for safety
  await fetch(`${BASE_URL}/api/merchants/m1/menu/menu_1`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m1Token}`
    },
    body: JSON.stringify({ available: true })
  });

  // Summary
  console.log('\n===============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('===============================================================');

  if (passed === total) {
    console.log('ALL MERCHANT DASHBOARD TESTS PASSED SUCCESSFULLY! (100%)');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED!');
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
