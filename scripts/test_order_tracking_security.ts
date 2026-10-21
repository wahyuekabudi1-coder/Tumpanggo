/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test Suite: Order Tracking Security Hardening & RBAC Isolation
 * Tests the allowlisted PublicTrackingOrderDTO, masking of sensitive customer data,
 * role-based privilege isolation (Admin, Merchant, Driver), and non-regression of tracking.
 */

import { foodDb } from '../src/server/db';
import { app } from '../src/server/app';
import { createAuthToken, AuthUser } from '../src/server/auth';
import { OrderStatus, PaymentStatus } from '../src/types';
import http from 'http';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, failureDetails?: any) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, passed: false, error: 'Assertion failed', details: failureDetails });
    console.error(`  ✗ ${name}`, failureDetails ? JSON.stringify(failureDetails) : '');
  }
}

async function requestJson(
  server: http.Server,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; data: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as any;
    const port = address.port;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode || 200, data, rawBody: raw });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runSecurityTests() {
  console.log('\n=== TUMPANGGO ORDER TRACKING SECURITY & PRIVACY VERIFICATION ===\n');

  await foodDb.ensureInitialized();

  // Create a test server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const merchants = foodDb.getMerchants();
    if (!merchants || merchants.length === 0) {
      throw new Error('No merchants found in database for test setup.');
    }
    const testMerchant = merchants[0];
    const merchantMenu = foodDb.getMenuItemsByMerchant(testMerchant.id);
    const testMenu = merchantMenu[0] || {
      id: 'menu_test_1',
      name: 'Menu Spesial Tumpang',
      price: 20000
    };

    const rawCustomerPhone = '081298765432';
    const mockOrder = await foodDb.createOrder({
      merchantId: testMerchant.id,
      customerName: 'Budi Santoso Rahasia',
      customerPhone: rawCustomerPhone,
      deliveryAddress: 'Jl. Merdeka No. 12, Krajan, Tumpang',
      landmark: 'Depan musholla hijau',
      items: [
        {
          menuItemId: testMenu.id,
          name: testMenu.name,
          price: testMenu.price,
          quantity: 2,
          notes: 'Kuah dipisah, pedas sedang'
        }
      ],
      paymentMethod: 'MERCHANT_QRIS',
      deliveryFee: 5000,
      serviceFee: 2000,
      uniqueCode: 123
    });

    // Attach sensitive internal and payment attributes
    const testOrderId = mockOrder.id;
    const testCanonicalCode = mockOrder.orderNumber || mockOrder.id;
    
    // Simulate payment proof upload and admin verification
    await foodDb.updateOrder('SYSTEM', testOrderId, {
      paymentProof: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/SUPER_SECRET_PAYMENT_PROOF_BASE64_STREAM_TEST',
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.COOKING,
      cookingTimeMinutes: 20
    });

    console.log(`[Test Setup] Created test order ${testCanonicalCode} (ID: ${testOrderId}) with phone ${rawCustomerPhone}`);

    // --- TEST GROUP 1: PUBLIC ACCESS SANITIZATION (ANONYMOUS CALLER) ---
    console.log('\n--- Test Group 1: Public Tracking Security & Privacy ---');

    const publicRes = await requestJson(server, `/api/orders/${encodeURIComponent(testCanonicalCode)}`);
    assert(publicRes.status === 200, 'Public tracking returns HTTP 200 for canonical order number', { status: publicRes.status });

    const pubData = publicRes.data;
    assert(pubData.isPublicTracking === true, 'Response is marked as public tracking DTO');
    assert(pubData.customerPhone !== rawCustomerPhone, 'Raw unmasked customer phone is NOT exposed');
    assert(pubData.customerPhone.includes('****'), 'customerPhone field contains masked phone string', { val: pubData.customerPhone });
    assert(pubData.customerPhoneMasked === pubData.customerPhone, 'customerPhoneMasked is consistent with customerPhone');
    assert(!publicRes.rawBody.includes(rawCustomerPhone), 'Raw phone number is completely absent from the network JSON body');
    assert(!publicRes.rawBody.includes('SUPER_SECRET_PAYMENT_PROOF_BASE64'), 'Raw base64 payment proof image is omitted from public response');
    assert(pubData.hasPaymentProof === true, 'Public DTO provides safe boolean hasPaymentProof flag');
    assert(pubData.paymentProofUrl === undefined, 'Public DTO strips paymentProofUrl to prevent unauthorized access');
    assert(pubData.isSettled === undefined, 'Internal settlement status is omitted from public response');
    assert(pubData.settlementId === undefined, 'Internal settlement ID is omitted from public response');

    // Verify vital tracking fields exist
    assert(pubData.orderNumber === testCanonicalCode, 'Canonical order number is preserved');
    assert(pubData.merchantName === testMerchant.name, 'Merchant name is present');
    assert(pubData.status === OrderStatus.COOKING, 'Operational status is preserved');
    assert(pubData.paymentStatus === PaymentStatus.PAID, 'Payment status is preserved');
    assert(pubData.cookingTimeMinutes === 20, 'Cooking time estimate is present');
    assert(Array.isArray(pubData.items) && pubData.items.length === 1, 'Sanitized items array is present');
    assert(pubData.items[0].name === testMenu.name, 'Item name is preserved');
    assert(pubData.items[0].quantity === 2, 'Item quantity is preserved');
    assert(typeof pubData.items[0].notes === 'string', 'Item customer notes field is a valid string');
    assert(pubData.total > 0, 'Total bill is present');

    // --- TEST GROUP 2: FLEXIBLE CODE QUERY (LOWERCASE, # PREFIX) ---
    console.log('\n--- Test Group 2: Canonical Normalization Compatibility ---');

    const hashRes = await requestJson(server, `/api/orders/%23${testCanonicalCode}`);
    assert(hashRes.status === 200, 'Search with "#" prefix succeeds and returns sanitized DTO', { status: hashRes.status });

    const lowerRes = await requestJson(server, `/api/orders/${testCanonicalCode.toLowerCase()}`);
    assert(lowerRes.status === 200, 'Search with lowercase code succeeds and returns sanitized DTO', { status: lowerRes.status });

    const notFoundRes = await requestJson(server, '/api/orders/TF-99999999-999');
    assert(notFoundRes.status === 404, 'Non-existent order returns HTTP 404', { status: notFoundRes.status });
    assert(notFoundRes.data.error === 'Pesanan tidak ditemukan. Periksa kembali kode order Anda.', '404 error message matches standard requirement');

    // --- TEST GROUP 3: AUTHENTICATED INTERNAL ROLES ACCESS ---
    console.log('\n--- Test Group 3: Authenticated Roles Authorization ---');

    // Admin token
    const adminUser: AuthUser = {
      userId: 'admin_security_test',
      role: 'ADMIN',
      email: 'admin@tumpanggo.com'
    };
    const adminToken = createAuthToken(adminUser);

    const adminRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(adminRes.status === 200, 'Admin receives HTTP 200');
    assert(adminRes.data.customerPhone === rawCustomerPhone, 'Admin receives unmasked raw phone number for operations');
    assert(adminRes.data.isPublicTracking === undefined, 'Admin receives full database object, not public DTO');

    // Owning Merchant token
    const merchantUser: AuthUser = {
      userId: testMerchant.id,
      role: 'MERCHANT',
      entityId: testMerchant.id
    };
    const merchantToken = createAuthToken(merchantUser);

    const merchantRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'Authorization': `Bearer ${merchantToken}`
    });
    assert(merchantRes.status === 200, 'Owning merchant receives HTTP 200');
    assert(merchantRes.data.customerPhone === rawCustomerPhone, 'Owning merchant receives operational customer phone for cooking clarification');

    // Non-owning Merchant token
    const otherMerchantUser: AuthUser = {
      userId: 'merch_other_store_999',
      role: 'MERCHANT',
      entityId: 'merch_other_store_999'
    };
    const otherMerchantToken = createAuthToken(otherMerchantUser);

    const otherMerchantRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'Authorization': `Bearer ${otherMerchantToken}`
    });
    assert(otherMerchantRes.status === 403, 'Non-owning merchant gets HTTP 403 Forbidden for another store order');
    assert(otherMerchantRes.data.error?.includes('Akses ditolak'), 'Error message confirms forbidden access to other store');

    // --- TEST GROUP 4: DRIVER VERIFICATION (STRICT JWT, NO SPOOFING) ---
    console.log('\n--- Test Group 4: Driver Role Authorization & Anti-Spoofing ---');

    // Ensure driver exists in database
    const driverList = foodDb.getDrivers();
    const testDriver = driverList[0] || { id: 'drv_test_courier', name: 'Pak Slamet' };
    const driverToken = createAuthToken({
      userId: testDriver.id,
      role: 'DRIVER',
      entityId: testDriver.id
    });

    // When order is available for pickup (unassigned & cooking)
    const driverQueryRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'Authorization': `Bearer ${driverToken}`
    });
    assert(driverQueryRes.status === 200, 'Eligible courier with JWT receives HTTP 200');
    assert(driverQueryRes.data.customerPhone === rawCustomerPhone, 'Eligible courier receives full delivery details');

    // Driver spoofing via header without JWT is rejected
    const spoofRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'x-driver-id': testDriver.id
    });
    assert(spoofRes.status === 200 && spoofRes.data.isPublicTracking === true, 'Header spoofing without JWT is rejected to public DTO');
    assert(spoofRes.data.customerPhone.includes('****'), 'Spoofed request cannot see raw phone');

    // Assigned to a specific driver
    await foodDb.updateOrder('SYSTEM', testOrderId, {
      driverId: testDriver.id,
      driverName: testDriver.name,
      status: OrderStatus.ORDER_PICKED_UP
    });

    // Query with correct assigned driver JWT
    const assignedCourierRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'Authorization': `Bearer ${driverToken}`
    });
    assert(assignedCourierRes.data.customerPhone === rawCustomerPhone, 'Assigned courier retains full delivery details');

    // Query with different driver when already claimed
    const otherDriverToken = createAuthToken({
      userId: 'drv_other_rival_courier_999',
      role: 'DRIVER',
      entityId: 'drv_other_rival_courier_999'
    });
    const otherCourierRes = await requestJson(server, `/api/orders/${testOrderId}`, 'GET', {
      'Authorization': `Bearer ${otherDriverToken}`
    });
    assert(otherCourierRes.status === 403, 'Unassigned driver receives HTTP 403 Forbidden for another driver order');

    // --- TEST GROUP 5: CUSTOMER HISTORY SANITIZATION & PRIVACY ---
    console.log('\n--- Test Group 5: Customer Phone History Sanitization & Privacy ---');

    // 5.1 Unverified public caller is rejected with 403
    const unverifiedRes = await requestJson(server, `/api/orders/customer/${rawCustomerPhone}`);
    assert(unverifiedRes.status === 403, 'Unverified customer phone history access returns HTTP 403');
    assert(unverifiedRes.data.code === 'UNVERIFIED_CUSTOMER_HISTORY_DISABLED', 'Unverified error code is UNVERIFIED_CUSTOMER_HISTORY_DISABLED');

    // 5.2 Authenticated Admin can view customer history
    const historyRes = await requestJson(server, `/api/orders/customer/${rawCustomerPhone}`, 'GET', {
      'Authorization': `Bearer ${adminToken}`
    });
    assert(historyRes.status === 200, 'Authenticated admin customer order history returns HTTP 200');
    assert(Array.isArray(historyRes.data) && historyRes.data.length > 0, 'History contains order list');
    assert(historyRes.data[0].customerPhone.includes('****'), 'History orders have masked customer phone');
    assert(!historyRes.rawBody.includes('SUPER_SECRET_PAYMENT_PROOF_BASE64'), 'History orders do not leak payment proof base64');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // --- FINAL SUMMARY ---
  console.log('\n=== TEST SUMMARY ===');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total tests: ${total}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);

  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(` - ${r.name}: ${JSON.stringify(r.details)}`));
    process.exit(1);
  } else {
    console.log('\nALL SECURITY TESTS PASSED SUCCESSFULLY!\n');
  }
}

runSecurityTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
