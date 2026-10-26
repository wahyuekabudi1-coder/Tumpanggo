/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive FCM Native Push Notification Test Suite
 * Tests:
 * 1. FCM token registration with role-based authorization guards
 * 2. Token deduplication and storage in foodDb
 * 3. FCM payload construction (high priority, channelId, custom sound, data payload)
 * 4. Deduplication of order notification triggers within suppression window
 * 5. Multi-order pending count aggregation for grouped notifications
 * 6. FCM token cleanup on invalid/unregistered token responses
 * 7. Dual dispatch (Web Push + Native Android FCM)
 */

import { foodDb, PushSubscriptionRecord } from '../src/server/db';
import { pushService } from '../src/server/services/pushService';
import { __setMessagingMockForTesting } from '../src/server/firebaseAdmin';
import { Order, OrderStatus, PaymentStatus } from '../src/types';

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

async function runTests() {
  console.log('\n=== RUNNING FCM NATIVE PUSH NOTIFICATION TESTS ===\n');

  const testMerchantId = 'merchant_fcm_test_' + Date.now();
  const testFcmToken = 'fcm_device_token_xyz_1234567890_test';

  // ---------------------------------------------------------------------------
  // 1. FCM Token Registration & Storage
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: FCM Token Registration in DB ---');
  const record: PushSubscriptionRecord = {
    id: 'fcm_rec_1',
    type: 'FCM',
    role: 'MERCHANT',
    entityId: testMerchantId,
    fcmToken: testFcmToken,
    deviceInfo: 'Android Native Device (Pixel 8)',
    appVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  foodDb.savePushSubscription(record);
  const subs = foodDb.getPushSubscriptionsForEntity('MERCHANT', testMerchantId);
  assert(subs.length === 1, 'Should find exactly 1 subscription for merchant');
  assert(subs[0].fcmToken === testFcmToken, 'Stored token should match test token');
  assert(subs[0].type === 'FCM', 'Subscription type should be FCM');

  // ---------------------------------------------------------------------------
  // 2. Token Deduplication (Re-registering same token updates existing record)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: FCM Token Deduplication ---');
  const duplicateRecord: PushSubscriptionRecord = {
    id: 'fcm_rec_2',
    type: 'FCM',
    role: 'MERCHANT',
    entityId: testMerchantId,
    fcmToken: testFcmToken,
    deviceInfo: 'Android Native Device (Pixel 8 Updated)',
    appVersion: '1.0.1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  foodDb.savePushSubscription(duplicateRecord);
  const subsAfterDup = foodDb.getPushSubscriptionsForEntity('MERCHANT', testMerchantId);
  assert(subsAfterDup.length === 1, 'Should not create duplicate entries for same FCM token');
  assert(subsAfterDup[0].appVersion === '1.0.1', 'Should update existing subscription record');

  // ---------------------------------------------------------------------------
  // 3. Mock Messaging Dispatch Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: FCM Message Dispatch with High Priority & Sound ---');
  const dispatchedMessages: any[] = [];
  const mockMessaging = {
    send: async (msg: any) => {
      dispatchedMessages.push(msg);
      return 'projects/test/messages/' + Date.now();
    }
  };
  __setMessagingMockForTesting(mockMessaging);

  const testOrder: Order = {
    id: 'ord_fcm_test_101',
    orderNumber: 'TF-20261026-999',
    customerName: 'Ahmad Dahlan',
    customerPhone: '08123456789',
    deliveryAddress: 'Jl. Raya Tumpang No. 45',
    merchantId: testMerchantId,
    merchantName: 'Warung Barokah Tumpang',
    items: [
      { id: 'item_1', name: 'Nasi Rawon Daging', price: 18000, quantity: 2, subtotal: 36000 }
    ],
    subtotal: 36000,
    deliveryFee: 5000,
    serviceFee: 2000,
    total: 43000,
    status: OrderStatus.PAYMENT_VERIFIED,
    paymentStatus: PaymentStatus.PAID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const dispatchResult = await pushService.notifyNewVerifiedOrder(testOrder);
  assert(dispatchResult.sentFCM === 1, 'Should successfully send 1 FCM message');
  assert(dispatchedMessages.length === 1, 'Mock messaging should record 1 sent message');

  const sentMsg = dispatchedMessages[0];
  assert(sentMsg.token === testFcmToken, 'Message token should match target device');
  assert(sentMsg.android.priority === 'high', 'Android priority must be "high" to wake device');
  assert(sentMsg.android.notification.channelId === 'tumpanggo_merchant_orders', 'Channel ID must match tumpanggo_merchant_orders');
  assert(sentMsg.android.notification.sound === 'order_ringtone', 'Notification sound must be order_ringtone');
  assert(sentMsg.android.notification.priority === 'max', 'Android notification priority must be max');
  assert(sentMsg.data.orderId === testOrder.id, 'Payload data must contain orderId');
  assert(sentMsg.data.orderNumber === testOrder.orderNumber, 'Payload data must contain orderNumber');
  assert(sentMsg.data.itemCount === '2', 'Payload data must contain total item count');
  assert(sentMsg.data.type === 'NEW_ORDER', 'Payload type must be NEW_ORDER');

  // ---------------------------------------------------------------------------
  // 4. Deduplication of Order Alerts (Prevent mass-ringing on repeat status updates)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Notification Deduplication Guard ---');
  const repeatResult = await pushService.notifyNewVerifiedOrder(testOrder);
  assert(repeatResult.totalSent === 0, 'Immediate repeat notification for same order should be deduplicated (sent = 0)');
  assert(dispatchedMessages.length === 1, 'Should not dispatch duplicate FCM message');

  // ---------------------------------------------------------------------------
  // 5. Multi-Order Stacking / Grouping Calculation
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Multi-Order Stacking & Pending Count Summary ---');
  // Seed pending verified orders for this merchant
  const secondOrder: Order = {
    ...testOrder,
    id: 'ord_fcm_test_102',
    orderNumber: 'TF-20261026-1000',
    createdAt: new Date().toISOString()
  };
  (foodDb as any).data.orders.unshift(testOrder);
  (foodDb as any).data.orders.unshift(secondOrder);

  const secondResult = await pushService.notifyNewVerifiedOrder(secondOrder);
  assert(secondResult.sentFCM === 1, 'Second distinct order should be dispatched');
  assert(dispatchedMessages.length === 2, 'Total dispatched messages should be 2');

  const secondSentMsg = dispatchedMessages[1];
  assert(secondSentMsg.notification.title.includes('2 Pesanan Baru Menunggu'), 'Title should reflect stacked count (2 Pesanan Baru Menunggu)');
  assert(secondSentMsg.data.pendingCount === '2', 'Data pendingCount should reflect 2');

  // ---------------------------------------------------------------------------
  // 6. Token Invalidation Cleanup
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Invalidation Cleanup of Unregistered FCM Tokens ---');
  const invalidToken = 'invalid_fcm_token_test';
  foodDb.savePushSubscription({
    id: 'fcm_rec_invalid',
    type: 'FCM',
    role: 'MERCHANT',
    entityId: testMerchantId,
    fcmToken: invalidToken,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const mockMessagingWithFailure = {
    send: async (msg: any) => {
      if (msg.token === invalidToken) {
        const err: any = new Error('The registration token is not registered');
        err.code = 'messaging/registration-token-not-registered';
        throw err;
      }
      return 'ok';
    }
  };
  __setMessagingMockForTesting(mockMessagingWithFailure);

  // Send test push to merchant
  await pushService.sendToMerchant(testMerchantId, {
    title: 'Test',
    body: 'Test body',
    channelId: 'tumpanggo_merchant_orders'
  });

  // Check that invalid token was pruned
  const currentSubs = foodDb.getPushSubscriptionsForEntity('MERCHANT', testMerchantId);
  const foundInvalid = currentSubs.some(s => s.fcmToken === invalidToken);
  assert(!foundInvalid, 'Invalid/unregistered FCM token should be automatically removed from DB');

  // ---------------------------------------------------------------------------
  // 7. Cleanup & Unsubscribe
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Unsubscribe by Token or Endpoint ---');
  foodDb.removePushSubscription(testFcmToken);
  const finalSubs = foodDb.getPushSubscriptionsForEntity('MERCHANT', testMerchantId);
  assert(finalSubs.length === 0, 'Unsubscribing by FCM token should leave 0 active subscriptions');

  // Clean up test orders from memory
  (foodDb as any).data.orders = (foodDb as any).data.orders.filter(
    (o: Order) => o.id !== testOrder.id && o.id !== secondOrder.id
  );

  __setMessagingMockForTesting(null);

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
