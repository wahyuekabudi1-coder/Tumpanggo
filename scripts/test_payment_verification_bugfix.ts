/**
 * Comprehensive Test Suite: Order Payment Verification Bug Fix
 * Validates:
 * 1. Order Creation & Payment Proof Upload (status: WAITING_PAYMENT_VERIFICATION)
 * 2. Admin Booking List retrieval (GET /api/orders)
 * 3. Authoritative Payment Verification (POST /api/orders/:id/verify-payment)
 * 4. Multi-tier ID resolution (trimmed, case-insensitive, prefix/no-prefix, disk/remote sync)
 * 5. Database persistence check (retrieval confirms PAYMENT_VERIFIED, PAID, E-Receipt generated)
 * 6. Payment Rejection flow (POST /api/orders/:id/reject-payment)
 * 7. Non-existent order error handling (400 "Pesanan tidak ditemukan.")
 */

import { createAuthToken } from '../src/server/auth';
import { foodDb } from '../src/server/db';

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

async function runTests() {
  console.log('===================================================================');
  console.log('   TESTING ORDER PAYMENT VERIFICATION & DATABASE QUERY RESOLUTION   ');
  console.log('===================================================================\n');

  let passed = 0;
  let failed = 0;

  // Generate valid admin token
  const adminToken = createAuthToken({
    userId: 'admin_test_1',
    role: 'ADMIN',
    email: 'tumpanggo@gmail.com'
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
    'x-auth-token': adminToken
  };

  // STEP 1: Create a test order
  console.log('--- 1. Creating Order for Payment Verification ---');
  let orderId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Budi Test Verifikasi',
        customerPhone: '081234567800',
        deliveryAddress: 'Jl. Raya Tumpang No. 100, Kec. Tumpang, Malang',
        items: [
          { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 2 }
        ],
        merchantId: 'm1'
      })
    });

    if (!res.ok) throw new Error(`Create order failed: HTTP ${res.status}`);
    const order = await res.json();
    orderId = order.id;
    console.log(`✅ [PASS] Created order ID: "${orderId}", total: Rp ${order.total.toLocaleString('id-ID')}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Create order failed:`, err.message);
    failed++;
  }

  // STEP 2: Upload payment proof
  console.log('\n--- 2. Uploading Payment Proof ---');
  try {
    const sampleProof = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzx5t7aAAAAABJRU5ErkJggg==';
    const res = await fetch(`${BASE_URL}/api/orders/${orderId}/upload-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentProof: sampleProof })
    });

    if (!res.ok) throw new Error(`Upload payment proof failed: HTTP ${res.status}`);
    const updated = await res.json();
    if (updated.status === 'WAITING_PAYMENT_VERIFICATION' && updated.paymentStatus === 'WAITING_VERIFICATION') {
      console.log(`✅ [PASS] Payment proof uploaded. Order #${orderId} status: WAITING_PAYMENT_VERIFICATION`);
      passed++;
    } else {
      throw new Error(`Unexpected status after proof upload: ${updated.status} / ${updated.paymentStatus}`);
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Upload proof failed:`, err.message);
    failed++;
  }

  // STEP 3: Admin Booking List (GET /api/orders)
  console.log('\n--- 3. Verifying Order in Admin Booking List (GET /api/orders) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders`, { headers: authHeaders });
    if (!res.ok) throw new Error(`GET /api/orders failed: HTTP ${res.status}`);
    const list = await res.json();
    const foundInList = Array.isArray(list) && list.some(o => o.id === orderId);
    if (foundInList) {
      console.log(`✅ [PASS] Order #${orderId} is confirmed visible in Admin booking list!`);
      passed++;
    } else {
      throw new Error(`Order #${orderId} not found in booking list (total items: ${list.length})`);
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Admin list verification failed:`, err.message);
    failed++;
  }

  // STEP 4: Call POST /api/orders/:id/verify-payment
  console.log('\n--- 4. Calling Payment Verification (POST /api/orders/:id/verify-payment) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ role: 'ADMIN' })
    });

    const json = await res.json();
    if (res.ok && json.success && json.order && json.order.paymentStatus === 'PAID') {
      console.log(`✅ [PASS] verify-payment succeeded! Order #${orderId} paymentStatus: ${json.order.paymentStatus}, status: ${json.order.status}, receipt: ${json.order.receiptNumber}`);
      passed++;
    } else {
      throw new Error(`verify-payment failed (HTTP ${res.status}): ${json.error || JSON.stringify(json)}`);
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] verify-payment call failed:`, err.message);
    failed++;
  }

  // STEP 5: Verify Database Persistence & E-Receipt Generation
  console.log('\n--- 5. Verifying Database Persistence and E-Receipt ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders/${orderId}`);
    if (!res.ok) throw new Error(`GET /api/orders/${orderId} failed: HTTP ${res.status}`);
    const persisted = await res.json();

    if (
      persisted.id === orderId &&
      persisted.paymentStatus === 'PAID' &&
      persisted.status === 'PAYMENT_VERIFIED' &&
      persisted.receipt &&
      persisted.receipt.receiptNumber
    ) {
      console.log(`✅ [PASS] Order #${orderId} verified persistently stored with PAID status and official receipt #${persisted.receipt.receiptNumber}!`);
      passed++;
    } else {
      throw new Error(`Persistence validation failed: status=${persisted.status}, paymentStatus=${persisted.paymentStatus}`);
    }

    // Check dedicated E-Receipt endpoint
    const receiptRes = await fetch(`${BASE_URL}/api/orders/${orderId}/receipt`, { headers: authHeaders });
    if (!receiptRes.ok) throw new Error(`GET /api/orders/${orderId}/receipt failed: HTTP ${receiptRes.status}`);
    const receiptData = await receiptRes.json();
    if (receiptData.receipt && receiptData.receipt.status === 'PAID') {
      console.log(`✅ [PASS] Dedicated E-Receipt endpoint confirmed functional for order #${orderId}`);
      passed++;
    } else {
      throw new Error('E-Receipt payload invalid or not marked PAID');
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Persistence or E-Receipt test failed:`, err.message);
    failed++;
  }

  // STEP 6: Flexible ID matching test (Testing whitespace, lowercase, and prefix variations)
  console.log('\n--- 6. Testing Flexible Multi-Tier ID Matching ---');
  try {
    // Test with whitespace padding
    const paddedId = `   ${orderId}   `;
    const foundPadded = await foodDb.findOrder(paddedId);
    if (foundPadded && foundPadded.id === orderId) {
      console.log(`✅ [PASS] findOrder resolved padded whitespace ID "${paddedId}" correctly to "${foundPadded.id}"`);
      passed++;
    } else {
      throw new Error('findOrder failed on whitespace padded ID');
    }

    // Test without ord_ prefix
    const bareId = orderId.replace(/^ord_/, '');
    const foundBare = await foodDb.findOrder(bareId);
    if (foundBare && foundBare.id === orderId) {
      console.log(`✅ [PASS] findOrder resolved bare ID "${bareId}" correctly to "${foundBare.id}"`);
      passed++;
    } else {
      throw new Error('findOrder failed on bare ID without ord_ prefix');
    }

    // Test uppercase ID
    const upperId = orderId.toUpperCase();
    const foundUpper = await foodDb.findOrder(upperId);
    if (foundUpper && foundUpper.id === orderId) {
      console.log(`✅ [PASS] findOrder resolved uppercase ID "${upperId}" correctly to "${foundUpper.id}"`);
      passed++;
    } else {
      throw new Error('findOrder failed on uppercase ID');
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Flexible ID matching failed:`, err.message);
    failed++;
  }

  // STEP 7: Rejection Flow Test
  console.log('\n--- 7. Testing Payment Rejection Flow (POST /api/orders/:id/reject-payment) ---');
  try {
    // Create another order to test rejection
    const createRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Siti Test Tolak',
        customerPhone: '081234567801',
        deliveryAddress: 'Jl. Melati No. 5, Malangsuko, Tumpang',
        items: [{ menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 1 }],
        merchantId: 'm1'
      })
    });
    const rejOrder = await createRes.json();
    const rejOrderId = rejOrder.id;

    // Upload proof
    await fetch(`${BASE_URL}/api/orders/${rejOrderId}/upload-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzx5t7aAAAAABJRU5ErkJggg==' })
    });

    // Call reject payment
    const reasonText = 'Nominal transfer tidak sesuai dengan 3 digit kode unik.';
    const rejRes = await fetch(`${BASE_URL}/api/orders/${rejOrderId}/reject-payment`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ reason: reasonText, role: 'ADMIN' })
    });

    const rejJson = await rejRes.json();
    if (rejRes.ok && rejJson.success && rejJson.order.paymentStatus === 'REJECTED' && rejJson.order.paymentRejectionReason === reasonText) {
      console.log(`✅ [PASS] reject-payment succeeded! Order #${rejOrderId} status: ${rejJson.order.status}, reason: "${rejJson.order.paymentRejectionReason}"`);
      passed++;
    } else {
      throw new Error(`reject-payment failed: ${rejJson.error || JSON.stringify(rejJson)}`);
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Rejection flow test failed:`, err.message);
    failed++;
  }

  // STEP 8: Non-existent order test (Ensure proper error message)
  console.log('\n--- 8. Testing Non-existent Order Handling ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders/ord_nonexistent_99999/verify-payment`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ role: 'ADMIN' })
    });
    const json = await res.json();
    if (res.status === 400 && json.error === 'Pesanan tidak ditemukan.') {
      console.log(`✅ [PASS] Non-existent order returned expected 400 with "Pesanan tidak ditemukan." without crash.`);
      passed++;
    } else {
      throw new Error(`Expected 400 with "Pesanan tidak ditemukan.", got ${res.status}: ${json.error}`);
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Non-existent order test failed:`, err.message);
    failed++;
  }

  console.log('\n===================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
