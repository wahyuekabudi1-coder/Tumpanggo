/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test Suite: QRIS Merchant Payment & Proof Upload Flow
 * Verifies public asset accessibility, checkout flow, QRIS placard resolution,
 * payment proof uploading, and backend persistence.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

async function runQrisTests() {
  console.log('===============================================================');
  console.log('   TUMPANGGO QRIS MERCHANT & PAYMENT PROOF VERIFICATION SUITE   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Check physical asset placement
  console.log('--- 1. VERIFYING QRIS STATIC ASSET PLACEMENT ---');
  const publicFile = path.resolve(process.cwd(), 'public', 'qris-merchant.png');
  const srcFile = path.resolve(process.cwd(), 'src', 'assets', 'images', 'qris-merchant.png');

  if (fs.existsSync(publicFile) && fs.statSync(publicFile).size > 1000) {
    console.log(`✅ [PASS] Public asset exists: ${publicFile} (${fs.statSync(publicFile).size} bytes)`);
    passed++;
  } else {
    console.error(`❌ [FAIL] Missing or empty public asset: ${publicFile}`);
    failed++;
  }

  if (fs.existsSync(srcFile) && fs.statSync(srcFile).size > 1000) {
    console.log(`✅ [PASS] Src assets copy exists: ${srcFile} (${fs.statSync(srcFile).size} bytes)`);
    passed++;
  } else {
    console.error(`❌ [FAIL] Missing or empty src asset: ${srcFile}`);
    failed++;
  }

  // 2. Verify HTTP accessibility of /qris-merchant.png
  console.log('\n--- 2. VERIFYING HTTP ACCESSIBILITY (GET /qris-merchant.png) ---');
  try {
    const res = await fetch(`${BASE_URL}/qris-merchant.png`);
    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.arrayBuffer();

    if (res.ok && contentType.includes('image') && buffer.byteLength > 1000) {
      console.log(`✅ [PASS] GET /qris-merchant.png -> HTTP ${res.status}, Content-Type: ${contentType}, Size: ${buffer.byteLength} bytes`);
      passed++;
    } else {
      console.error(`❌ [FAIL] GET /qris-merchant.png -> HTTP ${res.status}, Content-Type: ${contentType}, Size: ${buffer.byteLength} bytes`);
      failed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Failed to fetch /qris-merchant.png:`, err.message);
    failed++;
  }

  // 3. Checkout Order Creation & QRIS linkage
  console.log('\n--- 3. VERIFYING CHECKOUT ORDER CREATION & QRIS LINKAGE ---');
  let orderId = '';
  try {
    const orderPayload = {
      customerName: 'Test Pelanggan QRIS',
      customerPhone: '081234567899',
      deliveryAddress: 'Jl. Melati No. 12, Malangsuko, Kec. Tumpang',
      items: [
        { menuItemId: 'menu_1', name: 'Bakso Spesial Tumpang', price: 15000, quantity: 2 }
      ],
      merchantId: 'm1',
      subtotal: 30000,
      deliveryFee: 5000,
      serviceFee: 2000
    };

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    if (!res.ok) {
      throw new Error(`Failed to create order: HTTP ${res.status}`);
    }

    const order = await res.json();
    orderId = order.id;

    if (order.id && order.deliveryFee === 5000 && order.total > 37000) {
      console.log(`✅ [PASS] Order Created successfully: ID=${order.id}, Ongkir=Rp ${order.deliveryFee}, Total=Rp ${order.total}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Unexpected order creation response:`, order);
      failed++;
    }

    // Check QRIS image assigned to order
    if (order.merchantQrisImage) {
      console.log(`✅ [PASS] Order merchantQrisImage resolved: "${order.merchantQrisImage}"`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Order missing merchantQrisImage`);
      failed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Checkout error:`, err.message);
    failed++;
  }

  // 4. Payment Proof Upload Test
  console.log('\n--- 4. TESTING PAYMENT PROOF UPLOAD (POST /api/orders/:id/upload-payment) ---');
  try {
    // Generate sample mock base64 receipt
    const mockReceiptBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzx5t7aAAAAABJRU5ErkJggg==';

    const res = await fetch(`${BASE_URL}/api/orders/${orderId}/upload-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentProof: mockReceiptBase64
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Upload failed: HTTP ${res.status} - ${errBody}`);
    }

    const updated = await res.json();

    if (
      updated.status === 'WAITING_PAYMENT_VERIFICATION' &&
      updated.paymentStatus === 'WAITING_VERIFICATION' &&
      updated.paymentProof === mockReceiptBase64
    ) {
      console.log(`✅ [PASS] Payment proof uploaded successfully! Order #${orderId} status transitioned to WAITING_PAYMENT_VERIFICATION.`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Unexpected upload response:`, updated);
      failed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Payment proof upload error:`, err.message);
    failed++;
  }

  // 5. Persistence verification
  console.log('\n--- 5. TESTING ORDER PERSISTENCE WITH PAYMENT PROOF ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders/${orderId}`);
    const fetched = await res.json();

    if (
      fetched.id === orderId &&
      fetched.status === 'WAITING_PAYMENT_VERIFICATION' &&
      Boolean(fetched.paymentProof) &&
      fetched.deliveryFee === 5000
    ) {
      console.log(`✅ [PASS] Database persistence verified: Order #${orderId} correctly retains payment proof and flat deliveryFee.`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Persistence mismatch:`, fetched);
      failed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] Order retrieval error:`, err.message);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runQrisTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
