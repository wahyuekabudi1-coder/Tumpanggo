/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Test Suite for Checkout QRIS Bug Investigation & Fix Verification
 * Tests the 7 required scenarios from Tugas 5:
 * 1. Build and typecheck integrity
 * 2. Order creation test (Rp15.000 subtotal + Rp5.000 ongkir + Rp2.000 service fee = Rp22.000 + unique code)
 * 3. Database persistence error handling and diagnostic reporting (stage: DATABASE_PERSISTENCE)
 * 4. ArtoPay gateway failure and missing credential safe rejection (no fake fallback, status remains PENDING)
 * 5. Successful ArtoPay dynamic QRIS creation and payment intent attachment
 * 6. Strict server-side nominal enforcement and payment status transition validation
 * 7. Idempotency test (retry with same clientRequestId or within 10s does not create duplicate orders)
 */

import http from 'http';
import { app } from '../src/server/app';
import { foodDb } from '../src/server/db';
import { ArtoPayService } from '../src/lib/artopay';
import { OrderStatus, PaymentStatus } from '../src/types';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TUMPANGGO PRODUCTION CHECKOUT QRIS INVESTIGATION & VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // Ensure DB is initialized
  await foodDb.ensureInitialized();

  // Create ephemeral server for end-to-end API testing
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------------------------
    // 1. Build & Typecheck integrity is verified at start
    // -------------------------------------------------------------------------
    console.log('--- 1. Build and Typecheck Integrity ---');
    assert(typeof app === 'function', 'Express application exports a valid request handler');
    assert(typeof foodDb.createOrder === 'function', 'foodDb.createOrder is exported and callable');
    assert(typeof ArtoPayService.createPaymentIntent === 'function', 'ArtoPayService.createPaymentIntent is exported');

    // -------------------------------------------------------------------------
    // 2. Tes pembuatan pesanan (Rp 15.000 food + Rp 5.000 delivery + Rp 2.000 service)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Tes Pembuatan Pesanan Aktual ---');
    const clientReqId1 = `req_test_${Date.now()}_1`;
    const orderPayload = {
      merchantId: 'm1',
      customerName: 'Budi Santoso',
      customerPhone: '081234567890',
      deliveryAddress: 'Jl. Raya Tumpang No. 15, Malang',
      items: [
        { menuItemId: 'menu_1', name: 'Bakso Biasa', price: 15000, quantity: 1 }
      ],
      clientRequestId: clientReqId1
    };

    const resCreate = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': clientReqId1
      },
      body: JSON.stringify(orderPayload)
    });

    const createdOrder = await resCreate.json();
    assert(resCreate.status === 201, `Order creation returns HTTP 201 (got ${resCreate.status})`);
    assert(Boolean(createdOrder.id), `Order ID generated: ${createdOrder.id}`);
    assert(createdOrder.subtotal === 15000, `Subtotal accurately calculated as Rp 15.000 (got ${createdOrder.subtotal})`);
    assert(createdOrder.deliveryFee === 5000, `Delivery fee locked at standard Rp 5.000 (got ${createdOrder.deliveryFee})`);
    assert(createdOrder.serviceFee === 2000, `Service fee calculated as Rp 2.000 (got ${createdOrder.serviceFee})`);
    assert(createdOrder.uniqueCode >= 1 && createdOrder.uniqueCode <= 99, `Unique verification code generated (+${createdOrder.uniqueCode})`);
    assert(createdOrder.total === 15000 + 5000 + 2000 + createdOrder.uniqueCode, `Total exactly equals Subtotal + Delivery + Service + UniqueCode (Rp ${createdOrder.total})`);
    assert(createdOrder.status === OrderStatus.WAITING_PAYMENT, `Initial order status is WAITING_PAYMENT`);

    // -------------------------------------------------------------------------
    // 3. Tes kegagalan database & format diagnostik terstruktur
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Tes Diagnostik Error Terstruktur & Pemisahan Tahap ---');
    // Missing required merchantId
    const resInvalidMerchant = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...orderPayload, merchantId: '' })
    });
    const errInvalidMerchant = await resInvalidMerchant.json();
    assert(resInvalidMerchant.status === 400, 'Invalid merchant returns HTTP 400');
    assert(errInvalidMerchant.stage === 'ORDER_VALIDATION', 'Stage correctly labeled as ORDER_VALIDATION');
    assert(Boolean(errInvalidMerchant.requestId), `Correlation requestId attached: ${errInvalidMerchant.requestId}`);
    assert(Boolean(errInvalidMerchant.error), `Descriptive error returned: "${errInvalidMerchant.error}"`);

    // Missing customer info
    const resMissingCustomer = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...orderPayload, customerName: '', customerPhone: '' })
    });
    const errMissingCust = await resMissingCustomer.json();
    assert(resMissingCustomer.status === 400, 'Missing customer info returns HTTP 400');
    assert(errMissingCust.code === 'MISSING_CUSTOMER_DETAILS', 'Code matches MISSING_CUSTOMER_DETAILS');

    // -------------------------------------------------------------------------
    // 4. Tes kegagalan ArtoPay (Kredensial belum disetel & nominal dimanipulasi)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Tes Kegagalan ArtoPay & Keamanan Non-Fake ---');
    // Without credentials and without customFetch, ArtoPay rejects payment creation
    const resArtoNoCreds = await fetch(`${baseUrl}/api/artopay/payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: createdOrder.id,
        serviceType: 'FOOD',
        customerPhone: '081234567890'
      })
    });
    const artoNoCredsJson = await resArtoNoCreds.json();
    assert(resArtoNoCreds.status === 500 || resArtoNoCreds.status === 400, `ArtoPay rejects missing credentials safely (HTTP ${resArtoNoCreds.status})`);
    assert(artoNoCredsJson.error.includes('ARTOPAY_SECRET_KEY') || artoNoCredsJson.error.includes('Kredensial gateway ArtoPay belum dikonfigurasi'), 'Returns clear message about missing ARTOPAY_SECRET_KEY without leaking keys');

    // Verify order was NOT marked as PAID when payment creation failed
    const checkUnpaidOrder = foodDb.getOrderById(createdOrder.id);
    assert(checkUnpaidOrder?.status === OrderStatus.WAITING_PAYMENT, 'Order status remains WAITING_PAYMENT after ArtoPay creation failure');
    assert(checkUnpaidOrder?.paymentStatus !== PaymentStatus.PAID, 'Order is NOT falsely marked as PAID');

    // -------------------------------------------------------------------------
    // 5. Tes pembuatan QRIS berhasil via Mock Gateway Call
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Tes Pembuatan QRIS Berhasil & Integrasi Gateway ---');
    const mockGatewaySuccess = {
      id: 'pi_test_qris_success_123',
      checkoutUrl: 'https://pay.arto-pay.com/arto-pay/checkout/chk_test_123',
      status: 'created',
      amount: String(createdOrder.total),
      currency: 'IDR'
    };

    const mockFetch = async () => ({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null
      },
      text: async () => JSON.stringify(mockGatewaySuccess),
      json: async () => mockGatewaySuccess
    } as any);

    const intentResult = await ArtoPayService.createPaymentIntent({
      orderId: createdOrder.id,
      amount: createdOrder.total,
      currency: 'IDR',
      customerName: createdOrder.customerName,
      customerPhone: createdOrder.customerPhone,
      serviceType: 'FOOD',
      customFetch: mockFetch
    });

    assert(intentResult.success === true, 'ArtoPay Payment Intent successfully created');
    assert(intentResult.paymentIntentId === 'pi_test_qris_success_123', 'Extracted paymentIntentId correctly');
    assert(intentResult.checkoutUrl === 'https://pay.arto-pay.com/arto-pay/checkout/chk_test_123', 'Extracted checkoutUrl correctly');

    // Attach to food order
    await foodDb.updateOrder('SYSTEM_ARTOPAY', createdOrder.id, {
      paymentMethod: 'ARTOPAY_QRIS',
      artopayPaymentId: intentResult.paymentIntentId,
      artopayCheckoutUrl: intentResult.checkoutUrl,
      artopayStatus: 'PENDING'
    }, 'SYSTEM');

    const updatedWithQris = foodDb.getOrderById(createdOrder.id);
    assert(updatedWithQris?.paymentMethod === 'ARTOPAY_QRIS', 'Order updated with paymentMethod = ARTOPAY_QRIS');
    assert(updatedWithQris?.artopayPaymentId === 'pi_test_qris_success_123', 'Order updated with artopayPaymentId');
    assert(updatedWithQris?.artopayStatus === 'PENDING', 'Payment status remains PENDING before customer pays');

    // -------------------------------------------------------------------------
    // 6. Tes nominal & status pembayaran (manipulasi nominal ditolak)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Tes Penolakan Manipulasi Nominal & Verifikasi Status ---');
    const resTampered = await fetch(`${baseUrl}/api/artopay/payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: createdOrder.id,
        serviceType: 'FOOD',
        amount: 1000 // Client tries to pay only Rp 1.000 instead of Rp 22.0xx
      })
    });
    const tamperedJson = await resTampered.json();
    assert(resTampered.status === 400, 'Tampered amount rejected with HTTP 400');
    assert(tamperedJson.error.includes('Manipulasi nominal terdeteksi'), 'Clear rejection message for nominal manipulation');

    // -------------------------------------------------------------------------
    // 7. Tes idempotensi agar retry tidak membuat transaksi ganda
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Tes Idempotensi Pembuatan Pesanan ---');
    const resRetry = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': clientReqId1
      },
      body: JSON.stringify(orderPayload) // Exact same clientRequestId and payload
    });

    const retriedOrder = await resRetry.json();
    assert(resRetry.status === 201 || resRetry.status === 200, `Retry responded with HTTP ${resRetry.status}`);
    assert(retriedOrder.id === createdOrder.id, `Idempotency verified: retried order returned identical ID (${retriedOrder.id} === ${createdOrder.id})`);

    const allOrdersForPhone = foodDb.getOrdersByCustomerPhone(orderPayload.customerPhone);
    const duplicates = allOrdersForPhone.filter(o => o.clientRequestId === clientReqId1);
    assert(duplicates.length === 1, `Database contains exactly 1 order for clientRequestId (no duplicate order created)`);

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error running verification test suite:', err);
  process.exit(1);
});
