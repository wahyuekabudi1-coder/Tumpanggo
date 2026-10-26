/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Production FCM Native Push Notification & Outbox Integration Test Suite
 * Covers:
 * 1. Authenticated FCM token registration & cross-store authorization guards (/api/push/subscribe)
 * 2. Token deduplication, token rotation (oldFcmToken), and account-switch cleanup
 * 3. Authoritative backend trigger on foodDb.createOrder() AFTER persistence (high-priority data-only FCM)
 * 4. Strict non-trigger on status transitions (foodDb.updateOrder -> PAYMENT_VERIFIED / COOKING)
 * 5. Event deduplication (eventId = new_order:<orderId>)
 * 6. Multi-order count & grouping ("1 Pesanan Baru" -> "3 Pesanan Baru") + dynamic reduction after handling
 * 7. Cross-store isolation (Toko B orders never notify Toko A)
 * 8. Push failure resilience (never rolls back saved order), outbox RETRYING -> SENT recovery, & invalid token pruning
 * 9. Logout token unbinding (/api/push/unsubscribe)
 */

import { foodDb, PushSubscriptionRecord } from '../src/server/db';
import {
  pushService,
  MERCHANT_ORDER_CHANNEL_ID,
  MERCHANT_ORDER_CHANNEL_NAME,
  MERCHANT_ORDER_SOUND_NAME
} from '../src/server/services/pushService';
import { pushRouter } from '../src/server/routes/pushRoutes';
import { __setMessagingMockForTesting } from '../src/server/firebaseAdmin';
import { MenuItem, Merchant, Order, OrderStatus } from '../src/types';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    failedTests++;
    throw new Error(msg);
  } else {
    console.log(`✅ ${msg}`);
    passedTests++;
  }
}

async function invokeRouter(
  method: 'POST' | 'GET',
  path: string,
  options: { body?: any; query?: any; user?: any } = {}
): Promise<{ status: number; jsonBody: any }> {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const req: any = {
      method,
      url: path,
      path,
      body: options.body || {},
      query: options.query || {},
      headers: { 'user-agent': 'TumpangGoMerchantAndroid/1.1.0' },
      user: options.user
    };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        resolve({ status: statusCode, jsonBody: payload });
        return this;
      }
    };
    (pushRouter as any).handle(req, res, (err: any) => {
      if (err) reject(err);
      else resolve({ status: statusCode, jsonBody: null });
    });
  });
}

async function runTests() {
  console.log('\n=== RUNNING PRODUCTION FCM NATIVE PUSH NOTIFICATION TESTS ===\n');

  const suffix = Date.now().toString(36);
  const merchantAId = `merchant_fcm_toko_a_${suffix}`;
  const merchantBId = `merchant_fcm_toko_b_${suffix}`;
  const menuAId = `menu_fcm_a_${suffix}`;
  const menuBId = `menu_fcm_b_${suffix}`;

  const tokenA1 = `fcm_toko_a_device_token_initial_${suffix}_123456`;
  const tokenA2 = `fcm_toko_a_device_token_rotated_${suffix}_654321`;
  const tokenB1 = `fcm_toko_b_device_token_primary_${suffix}_999999`;

  const createdOrderIds: string[] = [];
  const createdEventIds: string[] = [];

  // Seed test merchants & menus in Tumpang area (-8.0065, 112.7615)
  const testMerchantA: Merchant = {
    id: merchantAId,
    name: 'Warung Barokah Tumpang',
    category: 'Makanan Berat',
    address: 'Jl. Raya Tumpang No. 12, Kecamatan Tumpang',
    phone: '081230001111',
    openTime: '08:00',
    closeTime: '22:00',
    active: true,
    rating: 4.9,
    imageUrl: '',
    latitude: -8.0065,
    longitude: 112.7615
  };

  const testMerchantB: Merchant = {
    id: merchantBId,
    name: 'Kopi Nusantara Tumpang',
    category: 'Minuman',
    address: 'Jl. Pasar Tumpang No. 5, Kecamatan Tumpang',
    phone: '081230002222',
    openTime: '08:00',
    closeTime: '22:00',
    active: true,
    rating: 4.8,
    imageUrl: '',
    latitude: -8.0070,
    longitude: 112.7620
  };

  const testMenuA: MenuItem = {
    id: menuAId,
    merchantId: merchantAId,
    name: 'Nasi Rawon Spesial',
    description: 'Rawon daging sapi khas Tumpang',
    price: 18000,
    category: 'Makanan Utama',
    imageUrl: '',
    available: true
  };

  const testMenuB: MenuItem = {
    id: menuBId,
    merchantId: merchantBId,
    name: 'Es Kopi Susu Gula Aren',
    description: 'Kopi dingin segar',
    price: 12000,
    category: 'Minuman',
    imageUrl: '',
    available: true
  };

  (foodDb as any).data.merchants.push(testMerchantA, testMerchantB);
  (foodDb as any).data.menuItems.push(testMenuA, testMenuB);

  try {
    // -------------------------------------------------------------------------
    // 1. Authorization Guards on /api/push/subscribe
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Route Authorization & Store Ownership Guards ---');
    const unauthRes = await invokeRouter('POST', '/subscribe', {
      body: { role: 'MERCHANT', entityId: merchantAId, fcmToken: tokenA1 }
    });
    assert(unauthRes.status === 401, 'Unauthenticated merchant token registration must be rejected with 401');

    const wrongStoreRes = await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantBId, userId: merchantBId },
      body: { role: 'MERCHANT', entityId: merchantAId, fcmToken: tokenA1 }
    });
    assert(wrongStoreRes.status === 403, 'Merchant B must be forbidden (403) from registering push token on Merchant A');

    const validSubRes = await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantAId, userId: merchantAId },
      body: {
        role: 'MERCHANT',
        entityId: merchantAId,
        fcmToken: tokenA1,
        deviceInfo: 'Samsung Galaxy A54 (Android 14)',
        appVersion: '1.1.0'
      }
    });
    assert(validSubRes.status === 200 && validSubRes.jsonBody?.success === true, 'Authenticated Merchant A registration must succeed');

    const subsA = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(subsA.length === 1 && subsA[0].fcmToken === tokenA1, 'Merchant A should have 1 active FCM token');

    // -------------------------------------------------------------------------
    // 2. Token Deduplication, Rotation (oldFcmToken), and Account-Switch Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Token Deduplication & FCM Token Rotation ---');
    const canonicalSubId = subsA[0].id;
    await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantAId, userId: merchantAId },
      body: {
        role: 'MERCHANT',
        entityId: merchantAId,
        fcmToken: tokenA1,
        appVersion: '1.1.1'
      }
    });
    const subsAfterDup = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(subsAfterDup.length === 1, 'Re-registering identical FCM token must not create duplicate rows');
    assert(subsAfterDup[0].id === canonicalSubId, 'Canonical subscription primary key must be preserved on update');
    assert(subsAfterDup[0].appVersion === '1.1.1', 'Subscription metadata must update in-place');

    // Rotate tokenA1 -> tokenA2
    await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantAId, userId: merchantAId },
      body: {
        role: 'MERCHANT',
        entityId: merchantAId,
        fcmToken: tokenA2,
        oldFcmToken: tokenA1,
        appVersion: '1.1.1'
      }
    });
    const subsAfterRotate = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(subsAfterRotate.length === 1, 'Token rotation with oldFcmToken must leave exactly 1 active token');
    assert(subsAfterRotate[0].fcmToken === tokenA2, 'Rotated token must replace old token');

    // Register Merchant B on its own device tokenB1
    await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantBId, userId: merchantBId },
      body: {
        role: 'MERCHANT',
        entityId: merchantBId,
        fcmToken: tokenB1,
        deviceInfo: 'Redmi Note 13 (Android 14)'
      }
    });

    // -------------------------------------------------------------------------
    // 3. End-to-End createOrder() Trigger & High-Priority Data-Only FCM Payload
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Authoritative createOrder() Push Trigger (Data-Only High Priority) ---');
    const dispatchedMessages: any[] = [];
    __setMessagingMockForTesting({
      send: async (msg: any) => {
        dispatchedMessages.push(msg);
        return `projects/tumpanggo-70479/messages/${Date.now()}`;
      }
    });

    const order1 = await foodDb.createOrder({
      merchantId: merchantAId,
      customerName: 'Budi Santoso',
      customerPhone: '081299990001',
      deliveryAddress: 'Jl. Raya Tumpang No. 45, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0080,
      longitude: 112.7630,
      clientRequestId: `req_1_${suffix}`,
      items: [{ menuItemId: menuAId, quantity: 2 }]
    });
    createdOrderIds.push(order1.id);
    createdEventIds.push(`new_order:${order1.id}`);

    assert(order1.status === OrderStatus.WAITING_PAYMENT, 'Newly created order starts as WAITING_PAYMENT');
    assert(dispatchedMessages.length === 1, 'createOrder() must immediately trigger 1 FCM push after DB persistence');

    const msg1 = dispatchedMessages[0];
    assert(msg1.token === tokenA2, 'Push must target Merchant A current rotated FCM token');
    assert(msg1.notification === undefined, 'FCM message MUST be data-only (no top-level notification block) so Android service always runs');
    assert(msg1.android?.priority === 'high', 'FCM Android transport priority must be "high" to wake Doze/locked devices');
    assert(msg1.data.title === '1 Pesanan Baru', 'Single unhandled order title must be "1 Pesanan Baru"');
    assert(msg1.data.channelId === MERCHANT_ORDER_CHANNEL_ID, `Channel ID must be ${MERCHANT_ORDER_CHANNEL_ID}`);
    assert(msg1.data.channelName === MERCHANT_ORDER_CHANNEL_NAME, `Channel name must be "${MERCHANT_ORDER_CHANNEL_NAME}"`);
    assert(msg1.data.sound === MERCHANT_ORDER_SOUND_NAME, `Custom sound must be "${MERCHANT_ORDER_SOUND_NAME}"`);
    assert(msg1.data.orderId === order1.id, 'Data payload must carry exact orderId for deep-linking');
    assert(msg1.data.merchantId === merchantAId, 'Data payload must carry merchantId for client ownership verification');
    assert(msg1.data.eventId === `new_order:${order1.id}`, 'Data payload must carry deterministic eventId');
    assert(msg1.data.pendingCount === '1', 'Data pendingCount must be "1"');
    assert(msg1.data.click_action === 'OPEN_ORDER_DETAIL', 'Data click_action must be OPEN_ORDER_DETAIL');

    // -------------------------------------------------------------------------
    // 4. Status Changes Must NOT Trigger "Pesanan Baru" Push
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Status Updates (updateOrder) Must NOT Re-Trigger New Order Push ---');
    await foodDb.updateOrder('admin_1', order1.id, { status: OrderStatus.PAYMENT_VERIFIED }, 'ADMIN');
    assert(dispatchedMessages.length === 1, 'Updating status to PAYMENT_VERIFIED must NOT emit another Pesanan Baru push');

    // -------------------------------------------------------------------------
    // 5. Event Deduplication Guard
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Event Deduplication Guard (eventId = new_order:<id>) ---');
    const dupDispatch = await pushService.notifyNewOrder(order1);
    assert(dupDispatch.deduplicated === true && dupDispatch.totalSent === 0, 'Duplicate notifyNewOrder for same order must be suppressed');
    assert(dispatchedMessages.length === 1, 'No extra FCM message sent on duplicate call');

    // -------------------------------------------------------------------------
    // 6. Multi-Order Count ("3 Pesanan Baru") & Dynamic Count Reduction
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Multi-Order Grouping ("3 Pesanan Baru") & Dynamic Count Calculation ---');
    const order2 = await foodDb.createOrder({
      merchantId: merchantAId,
      customerName: 'Siti Aminah',
      customerPhone: '081299990002',
      deliveryAddress: 'Jl. Kebonsari No. 10, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0090,
      longitude: 112.7640,
      clientRequestId: `req_2_${suffix}`,
      items: [{ menuItemId: menuAId, quantity: 1 }]
    });
    createdOrderIds.push(order2.id);
    createdEventIds.push(`new_order:${order2.id}`);

    const order3 = await foodDb.createOrder({
      merchantId: merchantAId,
      customerName: 'Rudi Hartono',
      customerPhone: '081299990003',
      deliveryAddress: 'Jl. Malangsuko No. 8, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0100,
      longitude: 112.7650,
      clientRequestId: `req_3_${suffix}`,
      items: [{ menuItemId: menuAId, quantity: 3 }]
    });
    createdOrderIds.push(order3.id);
    createdEventIds.push(`new_order:${order3.id}`);

    assert(dispatchedMessages.length === 3, '3 new orders should have dispatched 3 distinct FCM events');
    const msg3 = dispatchedMessages[2];
    assert(msg3.data.title === '3 Pesanan Baru', 'Third unhandled order title must be "3 Pesanan Baru"');
    assert(
      msg3.data.body.includes('Ada 3 pesanan baru yang perlu diperiksa'),
      'Third unhandled order body must state that 3 orders need to be checked'
    );
    const unhandledList3 = JSON.parse(msg3.data.unhandledOrderIds);
    assert(Array.isArray(unhandledList3) && unhandledList3.length === 3, 'unhandledOrderIds must contain all 3 pending order IDs');

    // Merchant handles order1 (COOKING) and order2 is cancelled -> only order3 remains unhandled
    await foodDb.updateOrder(merchantAId, order1.id, { status: OrderStatus.COOKING }, 'MERCHANT');
    await foodDb.updateOrder('admin_1', order2.id, { status: OrderStatus.CANCELLED }, 'ADMIN');

    const order4 = await foodDb.createOrder({
      merchantId: merchantAId,
      customerName: 'Dewi Lestari',
      customerPhone: '081299990004',
      deliveryAddress: 'Jl. Tumpang Wetan No. 3, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0075,
      longitude: 112.7625,
      clientRequestId: `req_4_${suffix}`,
      items: [{ menuItemId: menuAId, quantity: 1 }]
    });
    createdOrderIds.push(order4.id);
    createdEventIds.push(`new_order:${order4.id}`);

    const msg4 = dispatchedMessages[3];
    assert(
      msg4.data.title === '2 Pesanan Baru' && msg4.data.pendingCount === '2',
      'Count must reflect authoritative unhandled orders (order3 + order4 = 2), not total historical FCM packets'
    );

    // -------------------------------------------------------------------------
    // 7. Cross-Store Isolation (Toko B Order Never Notifies Toko A)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Cross-Store Isolation ---');
    const beforeStoreBCount = dispatchedMessages.length;
    const orderStoreB = await foodDb.createOrder({
      merchantId: merchantBId,
      customerName: 'Andi Wijaya',
      customerPhone: '081299990005',
      deliveryAddress: 'Jl. Pasar Tumpang No. 9, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0072,
      longitude: 112.7622,
      clientRequestId: `req_b1_${suffix}`,
      items: [{ menuItemId: menuBId, quantity: 2 }]
    });
    createdOrderIds.push(orderStoreB.id);
    createdEventIds.push(`new_order:${orderStoreB.id}`);

    assert(dispatchedMessages.length === beforeStoreBCount + 1, 'Store B order must send 1 push only');
    const msgStoreB = dispatchedMessages[dispatchedMessages.length - 1];
    assert(msgStoreB.token === tokenB1, 'Store B order push must ONLY go to Store B token (never Store A)');
    assert(msgStoreB.data.title === '1 Pesanan Baru', 'Store B has its own isolated unhandled count ("1 Pesanan Baru")');

    // -------------------------------------------------------------------------
    // 8. Push Failure Resilience, Outbox Retry, & Invalid Token Pruning
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Outbox Retry on Transient Failure & Invalid Token Pruning ---');
    const deadToken = `invalid_dead_fcm_token_${suffix}`;
    await foodDb.savePushSubscription({
      id: `fcm_dead_${suffix}`,
      type: 'FCM',
      role: 'MERCHANT',
      entityId: merchantBId,
      fcmToken: deadToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Simulate transient outage for Store A, and dead token error for deadToken
    __setMessagingMockForTesting({
      send: async (msg: any) => {
        if (msg.token === deadToken) {
          const err: any = new Error('The registration token is not registered');
          err.code = 'messaging/registration-token-not-registered';
          throw err;
        }
        const transientErr: any = new Error('FCM service temporarily unavailable');
        transientErr.code = 'messaging/server-unavailable';
        throw transientErr;
      }
    });

    // Order creation MUST succeed even when FCM completely fails
    const orderResilient = await foodDb.createOrder({
      merchantId: merchantAId,
      customerName: 'Pelanggan Saat Gangguan FCM',
      customerPhone: '081299990006',
      deliveryAddress: 'Jl. Raya Tumpang No. 88, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0068,
      longitude: 112.7618,
      clientRequestId: `req_resilient_${suffix}`,
      items: [{ menuItemId: menuAId, quantity: 1 }]
    });
    createdOrderIds.push(orderResilient.id);
    const resilientEventId = `new_order:${orderResilient.id}`;
    createdEventIds.push(resilientEventId);

    const savedOrderCheck = foodDb.getOrderById(orderResilient.id);
    assert(Boolean(savedOrderCheck), 'Saved order MUST NOT be rolled back or cancelled when FCM fails');

    const outboxEvent = await foodDb.getPushEventByIdAsync(resilientEventId);
    assert(outboxEvent?.status === 'RETRYING', 'Transient FCM failure must mark outbox event as RETRYING');

    // Test invalid token pruning on Store B
    await pushService.sendToMerchant(merchantBId, {
      title: 'Tes Pruning Token',
      body: 'Memastikan token mati dihapus otomatis'
    });
    const subsBAfterPrune = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantBId);
    assert(!subsBAfterPrune.some(s => s.fcmToken === deadToken), 'Unregistered FCM token must be pruned automatically');

    // Restore healthy FCM and run outbox recovery for Store A
    const recoveredMessages: any[] = [];
    __setMessagingMockForTesting({
      send: async (msg: any) => {
        recoveredMessages.push(msg);
        return 'projects/tumpanggo-70479/messages/recovered';
      }
    });

    const retryRes = await invokeRouter('POST', '/retry-pending', {
      user: { role: 'MERCHANT', entityId: merchantAId, userId: merchantAId },
      body: { entityId: merchantAId }
    });
    assert(
      retryRes.status === 200 && retryRes.jsonBody?.delivered === 1 && recoveredMessages.length === 1,
      'Outbox retry endpoint must deliver pending RETRYING event once FCM recovers'
    );
    const outboxAfterRecovery = await foodDb.getPushEventByIdAsync(resilientEventId);
    assert(outboxAfterRecovery?.status === 'SENT', 'Recovered outbox event must transition to SENT');

    // -------------------------------------------------------------------------
    // 9. Logout Unbinding (/api/push/unsubscribe)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Logout Unsubscribe / Token Unbinding ---');
    const unsubRes = await invokeRouter('POST', '/unsubscribe', {
      body: { fcmToken: tokenA2, entityId: merchantAId }
    });
    assert(unsubRes.status === 200 && unsubRes.jsonBody?.removed === true, 'Logout unsubscribe must remove token binding');

    const subsAAfterLogout = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(subsAAfterLogout.length === 0, 'Merchant A must have 0 active tokens after logout');
  } finally {
    // Clean up all test fixtures & persist clean state
    await foodDb.removePushSubscription(tokenA1).catch(() => {});
    await foodDb.removePushSubscription(tokenA2).catch(() => {});
    await foodDb.removePushSubscription(tokenB1).catch(() => {});

    (foodDb as any).data.orders = (foodDb as any).data.orders.filter(
      (o: Order) => !createdOrderIds.includes(o.id)
    );
    (foodDb as any).data.merchants = (foodDb as any).data.merchants.filter(
      (m: Merchant) => m.id !== merchantAId && m.id !== merchantBId
    );
    (foodDb as any).data.menuItems = (foodDb as any).data.menuItems.filter(
      (mi: MenuItem) => mi.id !== menuAId && mi.id !== menuBId
    );
    if (Array.isArray((foodDb as any).data.pushNotificationEvents)) {
      (foodDb as any).data.pushNotificationEvents = (foodDb as any).data.pushNotificationEvents.filter(
        (ev: any) => !createdEventIds.includes(ev.id)
      );
    }
    (foodDb as any).save?.();
    __setMessagingMockForTesting(null);
  }

  console.log(`\n========================================`);
  console.log(`FCM NOTIFICATION TESTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log(`========================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
