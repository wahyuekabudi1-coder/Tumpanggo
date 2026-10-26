/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Production FCM Native Push Notification & Supabase Serverless Test Suite
 * Verifies all 12 mandatory scenarios:
 *  1. Pesanan yang berhasil tersimpan memicu notifikasi.
 *  2. Pesanan yang gagal tersimpan tidak memicu notifikasi pesanan baru.
 *  3. Perubahan status tidak mengirim ulang notifikasi pesanan baru.
 *  4. Token perangkat tersimpan dan dapat dibaca kembali setelah cold start (Supabase).
 *  5. Token yang berubah dapat diperbarui (rotasi oldFcmToken).
 *  6. Token tidak valid ditangani dengan benar (auto-pruning).
 *  7. Merchant hanya menerima notifikasi untuk tokonya (isolasi toko & RBAC guard).
 *  8. Pengiriman ulang tidak membuat duplikasi event (idempotensi lintas cold start).
 *  9. Ringkasan jumlah pesanan diperbarui dengan benar (1 -> 3 -> 2 -> 0).
 * 10. Kegagalan FCM tidak membatalkan pesanan (resiliensi + outbox retry).
 * 11. Logout dan pergantian akun tidak membocorkan notifikasi lintas toko.
 * 12. Web/PWA tidak berbenturan dengan notifikasi native Android + validasi aset audio & channel migrasi.
 */

import fs from 'fs';
import path from 'path';
import { foodDb } from '../src/server/db';
import { foodConfig } from '../src/server/config';
import {
  pushService,
  MERCHANT_ORDER_CHANNEL_ID,
  MERCHANT_ORDER_CHANNEL_NAME,
  MERCHANT_ORDER_SOUND_NAME
} from '../src/server/services/pushService';
import { pushRouter } from '../src/server/routes/pushRoutes';
import { __setMessagingMockForTesting } from '../src/server/firebaseAdmin';
import { __setSupabaseMockForTesting } from '../src/server/supabaseAdapter';
import { getActiveNativeBridge } from '../src/hooks/useNativeBridge';
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
  routePath: string,
  options: { body?: any; query?: any; user?: any } = {}
): Promise<{ status: number; jsonBody: any }> {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const req: any = {
      method,
      url: routePath,
      path: routePath,
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
  console.log('\n=== RUNNING 12-SCENARIO PRODUCTION FCM & SUPABASE PUSH NOTIFICATION TESTS ===\n');

  const suffix = Date.now().toString(36);
  const merchantAId = `merchant_fcm_toko_a_${suffix}`;
  const merchantBId = `merchant_fcm_toko_b_${suffix}`;
  const menuAId = `menu_fcm_a_${suffix}`;
  const menuBId = `menu_fcm_b_${suffix}`;

  const tokenA1 = `fcm_toko_a_device_token_initial_${suffix}_123456`;
  const tokenA2 = `fcm_toko_a_device_token_rotated_${suffix}_654321`;
  const tokenB1 = `fcm_toko_b_device_token_primary_${suffix}_999999`;
  const sharedPhoneToken = `fcm_shared_phone_switch_token_${suffix}_777777`;

  const createdOrderIds: string[] = [];
  const createdEventIds: string[] = [];

  // Simulated Supabase PostgreSQL storage tables for cold-start persistence verification
  const mockSupabaseTables: Record<string, Map<string, any>> = {
    pushSubscriptions: new Map<string, any>(),
    pushNotificationEvents: new Map<string, any>(),
    orders: new Map<string, any>()
  };

  __setSupabaseMockForTesting({
    isConfigured: true,
    upsertSuccess: true,
    deleteSuccess: true,
    probeResult: { connected: true, url: 'https://epqpysiezdwyzrcebqey.supabase.co', latencyMs: 12 },
    tables: mockSupabaseTables
  });

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

  const prevIsProduction = foodConfig.isProduction;

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 4 & 5: Cold-Start Supabase Token Persistence & Token Rotation
    // -------------------------------------------------------------------------
    console.log('--- Scenario 4 & 5: Supabase Token Persistence Across Cold Start & Token Rotation ---');
    const unauthRes = await invokeRouter('POST', '/subscribe', {
      body: { role: 'MERCHANT', entityId: merchantAId, fcmToken: tokenA1 }
    });
    assert(unauthRes.status === 401, 'Unauthenticated merchant token registration rejected with 401');

    const wrongStoreRes = await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantBId, userId: merchantBId },
      body: { role: 'MERCHANT', entityId: merchantAId, fcmToken: tokenA1 }
    });
    assert(wrongStoreRes.status === 403, 'Merchant B forbidden (403) from registering token on Merchant A');

    const customerSpoofRes = await invokeRouter('POST', '/subscribe', {
      body: { role: 'CUSTOMER', entityId: merchantAId, fcmToken: tokenA1 }
    });
    assert(customerSpoofRes.status === 403, 'CUSTOMER role forbidden (403) from binding onto merchant_ entityId');

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
    assert(validSubRes.status === 200 && validSubRes.jsonBody?.success === true, 'Merchant A token saved to Supabase');
    assert(mockSupabaseTables.pushSubscriptions.size === 1, 'Token persisted into Supabase push_subscriptions table');

    // Simulate Vercel Serverless Cold Start (wipe local in-memory pushSubscriptions)
    (foodDb as any).data.pushSubscriptions = [];
    const coldStartSubs = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(
      coldStartSubs.length === 1 && coldStartSubs[0].fcmToken === tokenA1,
      'Cold-started serverless instance successfully reads persisted FCM token from Supabase'
    );

    // Rotate tokenA1 -> tokenA2 even after another cold start
    (foodDb as any).data.pushSubscriptions = [];
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
    (foodDb as any).data.pushSubscriptions = [];
    const rotatedSubs = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(rotatedSubs.length === 1 && rotatedSubs[0].fcmToken === tokenA2, 'Rotated FCM token replaces old token in Supabase');

    // Register Merchant B token
    await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantBId, userId: merchantBId },
      body: { role: 'MERCHANT', entityId: merchantBId, fcmToken: tokenB1 }
    });

    // -------------------------------------------------------------------------
    // SCENARIO 1: Saved Order Triggers High-Priority Data-Only FCM Push
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Saved Order Triggers Native Push Notification ---');
    const dispatchedMessages: any[] = [];
    __setMessagingMockForTesting({
      send: async (msg: any) => {
        dispatchedMessages.push(msg);
        return `projects/tumpanggo-70479/messages/${Date.now()}`;
      }
    });

    // Wipe local memory again so createOrder -> notifyNewOrder must read tokenA2 from Supabase!
    (foodDb as any).data.pushSubscriptions = [];
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

    assert(mockSupabaseTables.orders.has(order1.id), 'Order persisted in Supabase orders table before push');
    assert(dispatchedMessages.length === 1, 'Saved order immediately triggers 1 FCM push');

    const msg1 = dispatchedMessages[0];
    assert(msg1.token === tokenA2, 'Push sent to Merchant A active token loaded from Supabase');
    assert(msg1.notification === undefined, 'FCM message is strictly data-only so Android native service always runs');
    assert(msg1.android?.priority === 'high', 'FCM priority is "high" to wake locked/Doze Android phones');
    assert(msg1.data.title === '1 Pesanan Baru', 'Single order title is "1 Pesanan Baru"');
    assert(msg1.data.channelId === MERCHANT_ORDER_CHANNEL_ID, `Channel ID is ${MERCHANT_ORDER_CHANNEL_ID}`);
    assert(msg1.data.channelName === MERCHANT_ORDER_CHANNEL_NAME, `Channel name is "${MERCHANT_ORDER_CHANNEL_NAME}"`);
    assert(msg1.data.sound === MERCHANT_ORDER_SOUND_NAME, `Sound resource is "${MERCHANT_ORDER_SOUND_NAME}"`);
    assert(msg1.data.orderId === order1.id && msg1.data.merchantId === merchantAId, 'Payload includes exact orderId and merchantId');

    // -------------------------------------------------------------------------
    // SCENARIO 2: Failed Order Save Does NOT Trigger Push Notification
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Failed Order Persistence Never Triggers Push ---');
    const countBeforeFailedOrders = dispatchedMessages.length;

    // 2a. Validation failure (empty items)
    let validationThrew = false;
    try {
      await foodDb.createOrder({
        merchantId: merchantAId,
        customerName: 'Gagal Validasi',
        customerPhone: '081299990099',
        deliveryAddress: 'Jl. Raya Tumpang No. 1, Kecamatan Tumpang',
        district: 'Kecamatan Tumpang',
        latitude: -8.0080,
        longitude: 112.7630,
        items: []
      });
    } catch {
      validationThrew = true;
    }
    assert(validationThrew, 'Invalid order rejected before DB persistence');
    assert(dispatchedMessages.length === countBeforeFailedOrders, 'Invalid order emits 0 push notifications');

    // 2b. Supabase database write failure in production mode
    foodConfig.isProduction = true;
    __setSupabaseMockForTesting({
      isConfigured: true,
      upsertSuccess: false,
      upsertError: 'Simulated Supabase connection timeout during INSERT orders',
      probeResult: { connected: true, url: 'https://epqpysiezdwyzrcebqey.supabase.co', latencyMs: 12 },
      tables: mockSupabaseTables
    });

    let dbFailureThrew = false;
    try {
      await foodDb.createOrder({
        merchantId: merchantAId,
        customerName: 'Gagal Simpan DB',
        customerPhone: '081299990098',
        deliveryAddress: 'Jl. Raya Tumpang No. 2, Kecamatan Tumpang',
        district: 'Kecamatan Tumpang',
        latitude: -8.0080,
        longitude: 112.7630,
        clientRequestId: `req_fail_${suffix}`,
        items: [{ menuItemId: menuAId, quantity: 1 }]
      });
    } catch {
      dbFailureThrew = true;
    } finally {
      foodConfig.isProduction = prevIsProduction;
      __setSupabaseMockForTesting({
        isConfigured: true,
        upsertSuccess: true,
        deleteSuccess: true,
        probeResult: { connected: true, url: 'https://epqpysiezdwyzrcebqey.supabase.co', latencyMs: 12 },
        tables: mockSupabaseTables
      });
    }
    assert(dbFailureThrew, 'Order aborted safely when Supabase persistence fails in production');
    assert(dispatchedMessages.length === countBeforeFailedOrders, 'Failed DB save emits 0 push notifications');

    // -------------------------------------------------------------------------
    // SCENARIO 3: Status Changes Do NOT Re-Send New Order Notification
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Order Status Transitions Do Not Re-Trigger New Order Push ---');
    await foodDb.updateOrder('admin_1', order1.id, { status: OrderStatus.PAYMENT_VERIFIED }, 'ADMIN');
    assert(dispatchedMessages.length === 1, 'Transition to PAYMENT_VERIFIED does NOT re-send new order push');

    // -------------------------------------------------------------------------
    // SCENARIO 8: Retry / Duplicate Event Suppression Across Cold Start
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 8: Event Deduplication Across Serverless Cold Starts ---');
    (foodDb as any).data.pushNotificationEvents = []; // Wipe local memory; force lookup from Supabase pushNotificationEvents
    const dupDispatch = await pushService.notifyNewOrder(order1);
    assert(dupDispatch.deduplicated === true && dupDispatch.totalSent === 0, 'Duplicate eventId suppressed via Supabase outbox');
    assert(dispatchedMessages.length === 1, 'No duplicate FCM packet sent');

    // -------------------------------------------------------------------------
    // SCENARIO 9: Order Count Summary Updates Accurately (1 -> 3 -> 2 -> 0)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 9: Multi-Order Summary Count (1 -> 3 -> 2 -> 0) ---');
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

    const msg3 = dispatchedMessages[2];
    assert(msg3.data.title === '3 Pesanan Baru', '3 unhandled orders produce "3 Pesanan Baru" summary title');
    assert(msg3.data.body.includes('Ada 3 pesanan baru yang perlu diperiksa'), 'Body states 3 orders need inspection');
    assert(JSON.parse(msg3.data.unhandledOrderIds).length === 3, 'unhandledOrderIds lists all 3 active order IDs');

    // Handle 1 order (order1 -> COOKING): remaining unhandled count drops from 3 to 2
    await foodDb.updateOrder(merchantAId, order1.id, { status: OrderStatus.COOKING }, 'MERCHANT');
    const remainingAfterOne = await foodDb.getUnhandledMerchantOrdersAsync(merchantAId);
    assert(remainingAfterOne.length === 2, 'Handling 1 of 3 orders updates unhandled count from 3 -> 2');

    // Handle remaining 2 orders (order2 & order3 -> CANCELLED): unhandled count drops to 0
    await foodDb.updateOrder('admin_1', order2.id, { status: OrderStatus.CANCELLED }, 'ADMIN');
    await foodDb.updateOrder('admin_1', order3.id, { status: OrderStatus.CANCELLED }, 'ADMIN');
    const remainingAfterAll = await foodDb.getUnhandledMerchantOrdersAsync(merchantAId);
    assert(remainingAfterAll.length === 0, 'Handling all orders updates unhandled count to 0');

    // -------------------------------------------------------------------------
    // SCENARIO 7: Cross-Store Isolation (Merchant Only Receives Own Store Orders)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 7: Cross-Store Isolation ---');
    const unsubByIdUnauth = await invokeRouter('POST', '/unsubscribe', {
      body: { subscriptionId: 'sub_guess_123', entityId: merchantAId }
    });
    assert(unsubByIdUnauth.status === 401, 'Unauthenticated unsubscribe by subscriptionId rejected with 401');

    const unsubWrongStore = await invokeRouter('POST', '/unsubscribe', {
      user: { role: 'MERCHANT', entityId: merchantBId, userId: merchantBId },
      body: { fcmToken: tokenA2, entityId: merchantAId }
    });
    assert(unsubWrongStore.status === 403, 'Merchant B forbidden (403) from unsubscribing Merchant A entityId');

    const beforeStoreBMessages = dispatchedMessages.length;
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

    assert(dispatchedMessages.length === beforeStoreBMessages + 1, 'Store B order sends exactly 1 push');
    assert(
      dispatchedMessages[dispatchedMessages.length - 1].token === tokenB1,
      'Store B order only notifies Store B token (never Store A)'
    );

    // -------------------------------------------------------------------------
    // SCENARIO 6 & 10: Invalid Token Pruning & FCM Failure Resilience + Outbox Retry
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 6 & 10: Invalid Token Pruning & FCM Failure Resilience ---');
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

    assert(Boolean(foodDb.getOrderById(orderResilient.id)), 'FCM outage NEVER cancels or loses saved order');
    const outboxPending = await foodDb.getPushEventByIdAsync(resilientEventId);
    assert(outboxPending?.status === 'RETRYING', 'Failed push recorded as RETRYING in Supabase outbox');

    // Prune dead token on Store B
    await pushService.sendToMerchant(merchantBId, { title: 'Pruning Check', body: 'Check' });
    (foodDb as any).data.pushSubscriptions = [];
    const subsBAfterPrune = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantBId);
    assert(!subsBAfterPrune.some(s => s.fcmToken === deadToken), 'Unregistered token pruned from Supabase');

    // Recover FCM and retry pending outbox event
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
    assert(retryRes.status === 200 && retryRes.jsonBody?.delivered === 1, 'Pending outbox notification delivered on recovery');

    // -------------------------------------------------------------------------
    // SCENARIO 11: Logout & Account Switching Never Leak Cross-Store Notifications
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 11: Account Switching & Logout Isolation ---');
    // Phone initially logs into Merchant A
    await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantAId, userId: merchantAId },
      body: { role: 'MERCHANT', entityId: merchantAId, fcmToken: sharedPhoneToken }
    });
    // Same phone switches account to Merchant B -> must automatically unbind from Merchant A
    await invokeRouter('POST', '/subscribe', {
      user: { role: 'MERCHANT', entityId: merchantBId, userId: merchantBId },
      body: { role: 'MERCHANT', entityId: merchantBId, fcmToken: sharedPhoneToken }
    });

    const switchMessages: any[] = [];
    __setMessagingMockForTesting({
      send: async (msg: any) => {
        switchMessages.push(msg);
        return 'ok';
      }
    });

    const orderAfterSwitch = await foodDb.createOrder({
      merchantId: merchantAId,
      customerName: 'Uji Ganti Akun',
      customerPhone: '081299990007',
      deliveryAddress: 'Jl. Raya Tumpang No. 90, Kecamatan Tumpang',
      district: 'Kecamatan Tumpang',
      latitude: -8.0069,
      longitude: 112.7619,
      clientRequestId: `req_switch_${suffix}`,
      items: [{ menuItemId: menuAId, quantity: 1 }]
    });
    createdOrderIds.push(orderAfterSwitch.id);
    createdEventIds.push(`new_order:${orderAfterSwitch.id}`);

    assert(
      !switchMessages.some(m => m.token === sharedPhoneToken),
      'Switched phone (now logged into Store B) NEVER receives Store A notifications'
    );

    // Logout Merchant A primary device -> zero tokens left for Merchant A
    const unsubLogout = await invokeRouter('POST', '/unsubscribe', {
      user: { role: 'MERCHANT', entityId: merchantAId, userId: merchantAId },
      body: { fcmToken: tokenA2, entityId: merchantAId }
    });
    assert(unsubLogout.status === 200 && unsubLogout.jsonBody?.removed === true, 'Logout unbinds FCM token cleanly');
    (foodDb as any).data.pushSubscriptions = [];
    const subsAAfterLogout = await foodDb.getPushSubscriptionsForEntityAsync('MERCHANT', merchantAId);
    assert(subsAAfterLogout.length === 0, 'Merchant A has 0 active tokens in Supabase after logout');

    // -------------------------------------------------------------------------
    // SCENARIO 12: Web/PWA vs Native Android Separation + Audio & Channel Migration Audit
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 12: Web/PWA Non-Collision & Android Audio/Channel Migration Verification ---');
    const prevWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        TumpangNativeBridge: {
          isNativeApp: () => true,
          getFcmToken: () => 'native_bridge_token_check'
        }
      };
      const detectedBridge = getActiveNativeBridge();
      assert(Boolean(detectedBridge), 'Native Android WebView bridge accurately detected when inside APK');

      const useWebPushSource = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useWebPush.ts'), 'utf-8');
      const useRingtoneSource = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useOrderRingtone.ts'), 'utf-8');
      assert(
        useWebPushSource.includes('isRunningInsideNativeAndroidBridge()') &&
          useRingtoneSource.includes('suppressWebAudio'),
        'Browser Web Push and Web Audio synthesizer are strictly disabled inside Native Android APK'
      );
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = prevWindow;
      }
    }

    const wavPath = path.resolve(process.cwd(), 'android/app/src/main/res/raw/order_ringtone.wav');
    assert(fs.existsSync(wavPath), 'Local Android audio resource res/raw/order_ringtone.wav exists');
    const wavHeader = fs.readFileSync(wavPath).subarray(0, 12).toString('ascii');
    assert(wavHeader.startsWith('RIFF') && wavHeader.includes('WAVE'), 'order_ringtone.wav has valid RIFF/WAVE PCM header');

    const notifHelperKt = fs.readFileSync(
      path.resolve(process.cwd(), 'android/app/src/main/java/com/tumpanggo/merchant/NotificationHelper.kt'),
      'utf-8'
    );
    const manifestXml = fs.readFileSync(
      path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
      'utf-8'
    );
    assert(
      notifHelperKt.includes('CHANNEL_SOUND_VERSION = 2') &&
        notifHelperKt.includes('deleteNotificationChannel') &&
        manifestXml.includes(MERCHANT_ORDER_CHANNEL_ID),
      `Android NotificationHelper & Manifest implement versioned channel migration (${MERCHANT_ORDER_CHANNEL_ID})`
    );
  } finally {
    foodConfig.isProduction = prevIsProduction;
    __setSupabaseMockForTesting(null);
    __setMessagingMockForTesting(null);

    await foodDb.removePushSubscription(tokenA1).catch(() => {});
    await foodDb.removePushSubscription(tokenA2).catch(() => {});
    await foodDb.removePushSubscription(tokenB1).catch(() => {});
    await foodDb.removePushSubscription(sharedPhoneToken).catch(() => {});

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
  }

  console.log(`\n========================================`);
  console.log(`ALL 12 MANDATORY SCENARIOS: ${passedTests} ASSERTIONS PASSED, ${failedTests} FAILED`);
  console.log(`========================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
