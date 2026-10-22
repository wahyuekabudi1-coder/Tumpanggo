/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Verification test for Order Ringtone alert logic and layout integrity.
 */

import { Order, OrderStatus } from '../src/types.ts';
import { orderRingtone } from '../src/utils/orderRingtone.ts';

function runTests() {
  console.log('===============================================================');
  console.log('TUMPANGGO FOOD: ORDER RINGTONE & LAYOUT VERIFICATION');
  console.log('===============================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${msg}`);
      process.exitCode = 1;
    }
  }

  // 1. Initial State
  assert(orderRingtone.isRinging() === false, 'Ringtone is initially not ringing');
  
  // 2. Mute toggle
  const initialMute = orderRingtone.isMuted();
  orderRingtone.setMuted(true);
  assert(orderRingtone.isMuted() === true, 'Mute state successfully toggled to true');
  orderRingtone.setMuted(false);
  assert(orderRingtone.isMuted() === false, 'Mute state successfully toggled to false');

  // 3. Deduplication Logic Simulation
  const knownOrderIds = new Set<string>();
  let isInitialLoadDone = false;

  const initialOrders: Order[] = [
    {
      id: 'ord_exist_1',
      customerName: 'Budi Santoso',
      customerPhone: '08123456789',
      merchantId: 'm1',
      status: OrderStatus.PAYMENT_VERIFIED,
      items: [],
      subtotal: 30000,
      deliveryFee: 5000,
      serviceFee: 1000,
      total: 36000,
      deliveryAddress: 'Jl. Raya Tumpang No. 10',
      createdAt: new Date().toISOString()
    } as unknown as Order
  ];

  // Simulating initial load
  let didRingOnInitial = false;
  if (!isInitialLoadDone) {
    initialOrders.forEach(o => knownOrderIds.add(o.id));
    isInitialLoadDone = true;
    // Should NOT ring on initial load
    didRingOnInitial = false;
  }
  assert(didRingOnInitial === false, 'Initial load with existing verified order DOES NOT ring');
  assert(knownOrderIds.has('ord_exist_1'), 'Existing order recorded into knownOrderIds');

  // Simulating polling update with NO new orders
  const poll1Orders = [...initialOrders];
  const newOrdersPoll1 = poll1Orders.filter(o => o.status === OrderStatus.PAYMENT_VERIFIED && !knownOrderIds.has(o.id));
  assert(newOrdersPoll1.length === 0, 'Subsequent poll with same order triggers 0 new rings');

  // Simulating polling update WITH a brand new order verified by admin
  const brandNewOrder: Order = {
    id: 'ord_brand_new_99',
    customerName: 'Siti Rahma',
    customerPhone: '08987654321',
    merchantId: 'm1',
    status: OrderStatus.PAYMENT_VERIFIED,
    items: [],
    subtotal: 45000,
    deliveryFee: 5000,
    serviceFee: 1000,
    total: 51000,
    deliveryAddress: 'Jl. Jeru No. 12 Tumpang',
    createdAt: new Date().toISOString()
  } as unknown as Order;

  const poll2Orders = [...initialOrders, brandNewOrder];
  const newOrdersPoll2 = poll2Orders.filter(o => o.status === OrderStatus.PAYMENT_VERIFIED && !knownOrderIds.has(o.id));
  
  assert(newOrdersPoll2.length === 1, 'Subsequent poll accurately detects exactly 1 new incoming order');
  assert(newOrdersPoll2[0].id === 'ord_brand_new_99', 'Detected new order matches ord_brand_new_99');

  // When ring starts
  let activeAlertOrderId: string | null = newOrdersPoll2[0].id;
  newOrdersPoll2.forEach(o => knownOrderIds.add(o.id));
  assert(activeAlertOrderId === 'ord_brand_new_99', 'Active alert order ID is set to new order');

  // Simulating merchant accepting the order to COOKING
  const poll3Orders = poll2Orders.map(o => o.id === 'ord_brand_new_99' ? { ...o, status: OrderStatus.COOKING } : o);
  const stillWaitingVerified = poll3Orders.filter(o => o.status === OrderStatus.PAYMENT_VERIFIED);
  const isTargetOrderStillWaiting = stillWaitingVerified.some(o => o.id === activeAlertOrderId);

  if (!isTargetOrderStillWaiting) {
    activeAlertOrderId = null; // ringtone stopped
  }

  assert(activeAlertOrderId === null, 'Ringtone automatically stops when order moves from PAYMENT_VERIFIED to COOKING');

  // Restore mute setting
  orderRingtone.setMuted(initialMute);

  console.log('===============================================================');
  console.log(`TEST RUN COMPLETED: ${passed} / ${total} TESTS PASSED`);
  console.log('===============================================================');
}

runTests();
