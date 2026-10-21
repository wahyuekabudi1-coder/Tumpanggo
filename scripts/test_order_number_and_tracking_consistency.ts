/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Test Suite for TumpangGo Food Order Number & Tracking Consistency
 * Verifies canonical public order identifier generation, tracking lookup by canonical code & legacy ID,
 * immutability during status updates, E-receipt consistency, and isolation from other services.
 */

import { foodDb } from '../src/server/db';
import { OrderStatus, PaymentStatus } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, detail: string = '') {
  results.push({
    name,
    passed: condition,
    detail: condition ? detail || 'OK' : `FAIL: ${detail}`
  });
  const symbol = condition ? '✅' : '❌';
  console.log(`${symbol} [${condition ? 'PASS' : 'FAIL'}] ${name} ${detail ? `- ${detail}` : ''}`);
}

async function runTestSuite() {
  console.log('=== STARTING TUMPANGGO ORDER NUMBER & TRACKING CONSISTENCY TEST ===\n');

  // Test 1: Verification of existing legacy order backfill
  console.log('--- Test Group 1: Idempotent Legacy Order Backfill ---');
  const existingOrders = foodDb.getOrders();
  assert(existingOrders.length > 0, 'Orders exist in database', `Found ${existingOrders.length} orders`);

  const allHaveOrderNumber = existingOrders.every(o => Boolean(o.orderNumber && o.orderNumber.startsWith('TF-')));
  assert(allHaveOrderNumber, 'All existing orders have canonical TF- orderNumber', `Count: ${existingOrders.length}`);

  const sampleExisting = existingOrders[0];
  console.log(`Sample existing order: id=${sampleExisting.id}, orderNumber=${sampleExisting.orderNumber}`);
  assert(Boolean(sampleExisting.orderNumber), 'Sample legacy order has orderNumber', `orderNumber: ${sampleExisting.orderNumber}`);

  // Test 2: Flexible Lookup for Legacy Order
  console.log('\n--- Test Group 2: Flexible Lookup for Existing Order ---');
  const foundByFullNum = await foodDb.findOrder(sampleExisting.orderNumber!);
  assert(Boolean(foundByFullNum && foundByFullNum.id === sampleExisting.id), 'Lookup by exact orderNumber succeeds', `Found: ${foundByFullNum?.orderNumber}`);

  const foundByHashNum = await foodDb.findOrder(`#${sampleExisting.orderNumber}`);
  assert(Boolean(foundByHashNum && foundByHashNum.id === sampleExisting.id), 'Lookup with leading # succeeds (#TF-...)', `Found: ${foundByHashNum?.id}`);

  const foundByInternalId = await foodDb.findOrder(sampleExisting.id);
  assert(Boolean(foundByInternalId && foundByInternalId.orderNumber === sampleExisting.orderNumber), 'Lookup by internal database id succeeds', `Found: ${foundByInternalId?.id}`);

  const foundByHashInternalId = await foodDb.findOrder(`#${sampleExisting.id}`);
  assert(Boolean(foundByHashInternalId && foundByHashInternalId.id === sampleExisting.id), 'Lookup by #ord_... succeeds', `Found: ${foundByHashInternalId?.id}`);

  const strippedOrd = sampleExisting.id.replace(/^ord_/, '');
  const foundByStripped = await foodDb.findOrder(strippedOrd);
  assert(Boolean(foundByStripped && foundByStripped.id === sampleExisting.id), 'Lookup by stripped ID suffix succeeds', `Query: ${strippedOrd}`);

  // Test 3: Creation of new Order generates Canonical orderNumber (TF-YYYYMMDD-XXX)
  console.log('\n--- Test Group 3: Canonical Order Creation ---');
  const merchants = foodDb.getMerchants();
  assert(merchants.length > 0, 'Merchants exist for order test');
  const testMerchant = merchants[0];
  const menuItems = foodDb.getMenuItemsByMerchant(testMerchant.id);
  assert(menuItems.length > 0, 'Menu items exist for order test');
  const testItem = menuItems[0];

  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');

  const newOrder1 = await foodDb.createOrder({
    merchantId: testMerchant.id,
    customerName: 'Budi Test Konsistensi',
    customerPhone: '081299998888',
    deliveryAddress: 'Jl. Raya Tumpang No. 99, Tumpang',
    latitude: -8.001,
    longitude: 112.768,
    items: [{ menuItemId: testItem.id, quantity: 2 }]
  });

  assert(Boolean(newOrder1 && newOrder1.id), 'New order created successfully', `ID: ${newOrder1.id}`);
  assert(Boolean(newOrder1.orderNumber), 'New order has orderNumber field', `orderNumber: ${newOrder1.orderNumber}`);
  assert(newOrder1.orderNumber!.startsWith(`TF-${datePrefix}-`), 'orderNumber follows TF-YYYYMMDD-XXX pattern', `Pattern matched: ${newOrder1.orderNumber}`);

  // Create second order to verify sequence & uniqueness
  const newOrder2 = await foodDb.createOrder({
    merchantId: testMerchant.id,
    customerName: 'Siti Test Konsistensi 2',
    customerPhone: '081299998889',
    deliveryAddress: 'Jl. Kebonsari No. 10, Tumpang',
    latitude: -8.002,
    longitude: 112.769,
    items: [{ menuItemId: testItem.id, quantity: 1 }]
  });

  assert(Boolean(newOrder2.orderNumber), 'Second order created with orderNumber', `orderNumber: ${newOrder2.orderNumber}`);
  assert(newOrder1.orderNumber !== newOrder2.orderNumber, 'Unique order numbers across orders', `${newOrder1.orderNumber} !== ${newOrder2.orderNumber}`);
  assert(newOrder1.id !== newOrder2.id, 'Unique database IDs across orders', `${newOrder1.id} !== ${newOrder2.id}`);

  // Test 4: Tracking Lookup of New Order
  console.log('\n--- Test Group 4: Tracking Lookup for New Order ---');
  const trackByNum = await foodDb.findOrder(newOrder1.orderNumber!);
  assert(Boolean(trackByNum && trackByNum.id === newOrder1.id), 'Customer tracking by orderNumber finds correct order');

  const trackByHashNum = await foodDb.findOrder(`#${newOrder1.orderNumber}`);
  assert(Boolean(trackByHashNum && trackByHashNum.id === newOrder1.id), 'Customer tracking by #orderNumber finds correct order');

  const trackByLower = await foodDb.findOrder(newOrder1.orderNumber!.toLowerCase());
  assert(Boolean(trackByLower && trackByLower.id === newOrder1.id), 'Customer tracking case-insensitively finds correct order');

  // Test 5: Immutability of orderNumber during State Machine Transitions
  console.log('\n--- Test Group 5: Immutability During Status Transitions ---');
  const originalNumber = newOrder1.orderNumber;
  const originalId = newOrder1.id;

  // Step A: Payment verification
  const verifiedOrder = await foodDb.updateOrder('ADMIN_TEST', originalId, {
    status: OrderStatus.PAYMENT_VERIFIED,
    paymentStatus: PaymentStatus.PAID
  }, 'ADMIN');

  assert(verifiedOrder.orderNumber === originalNumber, 'orderNumber unchanged after payment verification', `${verifiedOrder.orderNumber}`);
  assert(verifiedOrder.id === originalId, 'Database id unchanged after payment verification');
  assert(verifiedOrder.status === OrderStatus.PAYMENT_VERIFIED, 'Order status is now PAYMENT_VERIFIED');

  // Step B: Merchant acceptance / cooking
  const cookingOrder = await foodDb.updateOrder('MERCHANT_TEST', originalId, {
    status: OrderStatus.COOKING,
    cookingTimeMinutes: 20
  }, 'MERCHANT');

  assert(cookingOrder.orderNumber === originalNumber, 'orderNumber unchanged after cooking transition', `${cookingOrder.orderNumber}`);
  assert(cookingOrder.status === OrderStatus.COOKING, 'Order status is now COOKING');

  // Step C: Driver Assignment & Ready
  const readyOrder = await foodDb.updateOrder('SYSTEM_TEST', originalId, {
    status: OrderStatus.READY_FOR_PICKUP,
    driverId: 'd1',
    driverName: 'Budi Santoso'
  }, 'SYSTEM');

  assert(readyOrder.orderNumber === originalNumber, 'orderNumber unchanged after driver assignment & ready', `${readyOrder.orderNumber}`);

  // Step D: Order Picked Up by Driver
  const pickedUpOrder = await foodDb.updateOrder('DRIVER_TEST', originalId, {
    status: OrderStatus.ORDER_PICKED_UP
  }, 'DRIVER');

  assert(pickedUpOrder.orderNumber === originalNumber, 'orderNumber unchanged after driver pickup', `${pickedUpOrder.orderNumber}`);
  assert(pickedUpOrder.status === OrderStatus.ORDER_PICKED_UP, 'Order status is now ORDER_PICKED_UP');

  // Step E: Order Completed by Driver
  const completedOrder = await foodDb.updateOrder('DRIVER_TEST', originalId, {
    status: OrderStatus.COMPLETED
  }, 'DRIVER');

  assert(completedOrder.orderNumber === originalNumber, 'orderNumber unchanged after driver completion', `${completedOrder.orderNumber}`);
  assert(completedOrder.status === OrderStatus.COMPLETED, 'Order status is now COMPLETED');

  // Test 6: E-Receipt Consistency with Canonical orderNumber
  console.log('\n--- Test Group 6: E-Receipt Consistency ---');
  const fetchedForReceipt = await foodDb.findOrder(originalNumber!);
  assert(Boolean(fetchedForReceipt && fetchedForReceipt.receipt), 'Receipt auto-generated on verified order');
  assert(Boolean(fetchedForReceipt?.receipt?.orderNumber === originalNumber), 'Receipt orderNumber matches canonical orderNumber', `Receipt: ${fetchedForReceipt?.receipt?.orderNumber}`);
  assert(Boolean(fetchedForReceipt?.receipt?.orderId === originalId), 'Receipt orderId matches database ID');

  // Test 7: Non-existent / Invalid Order Code
  console.log('\n--- Test Group 7: Invalid Code Security & Guard ---');
  const invalidOrder = await foodDb.findOrder('TF-INVALID-999');
  assert(invalidOrder === undefined, 'Invalid order number returns undefined (not random order)');

  const emptyOrder = await foodDb.findOrder('');
  assert(emptyOrder === undefined, 'Empty search string returns undefined');

  // Test 8: Food vs Shop Separation Integrity
  console.log('\n--- Test Group 8: Food vs Shop Order Number Prefix Isolation ---');
  assert(newOrder1.orderNumber!.startsWith('TF-'), 'Food order starts with TF- prefix');
  // Verify that an invalid Shop-like code does not accidentally match a Food order
  const shopFormatLookup = await foodDb.findOrder('TS-20261021-999');
  assert(shopFormatLookup === undefined, 'Shop order prefix TS- does not match Food orders in Food DB');

  // Summary
  console.log('\n========================================');
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('========================================\n');

  if (failCount > 0) {
    console.error('TEST SUITE FAILED!');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
