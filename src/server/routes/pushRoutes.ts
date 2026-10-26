/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Push Notification Routes for TumpangGo
 * Manages VAPID public key retrieval, Android FCM / Web Push device token registration,
 * token rotation (`oldFcmToken`), logout unbinding, status diagnostics, outbox retry,
 * and authenticated test notification dispatch.
 */

import { Router } from 'express';
import { pushService, MERCHANT_ORDER_CHANNEL_ID, MERCHANT_ORDER_SOUND_NAME } from '../services/pushService';
import { foodDb, PushSubscriptionRecord } from '../db';

export const pushRouter = Router();

function isAuthorizedForEntity(user: any, role: string, entityId: string): boolean {
  if (!user) return false;
  const isMasterOrAdmin = user.role === 'ADMIN' || user.role === 'MASTER_ADMIN' || user.isMasterAdmin;
  if (isMasterOrAdmin) return true;

  const cleanTarget = String(entityId || '').trim();
  const targetBare = cleanTarget.replace(/^merchant_/, '').replace(/^driver_/, '');
  const userEntity = String(user.entityId || user.userId || '').trim();
  const userBare = userEntity.replace(/^merchant_/, '').replace(/^driver_/, '');

  if (role === 'MERCHANT') {
    return user.role === 'MERCHANT' && (userEntity === cleanTarget || userBare === targetBare);
  }
  if (role === 'DRIVER') {
    return user.role === 'DRIVER' && (userEntity === cleanTarget || userBare === targetBare);
  }
  return false;
}

// 1. Get VAPID Public Key & FCM Server readiness for client subscription setup
pushRouter.get('/vapid-key', (req, res) => {
  const publicKey = pushService.getVapidPublicKey();
  res.json({
    success: true,
    publicKey,
    fcmServerConfigured: pushService.isFcmServerConfigured()
  });
});

// 2. Subscribe or Rotate a device token (Native Android FCM token or Browser Web Push Subscription)
pushRouter.post('/subscribe', async (req: any, res) => {
  try {
    const {
      role,
      entityId,
      subscription,
      fcmToken,
      oldFcmToken,
      deviceInfo,
      appVersion,
      userAgent
    } = req.body || {};
    const user = req.user;

    if (!role || !['MERCHANT', 'DRIVER', 'CUSTOMER'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid untuk langganan push notification.' });
    }

    if (!entityId || typeof entityId !== 'string' || !entityId.trim()) {
      return res.status(400).json({ error: 'entityId (ID toko atau ID driver) wajib disertakan.' });
    }

    const hasFcm = Boolean(fcmToken && typeof fcmToken === 'string' && fcmToken.trim().length > 10);
    const hasWebPush = Boolean(subscription && subscription.endpoint && subscription.keys?.p256dh && subscription.keys?.auth);

    if (!hasFcm && !hasWebPush) {
      return res.status(400).json({
        error: 'Pendaftaran memerlukan salah satu: fcmToken (Android FCM) atau subscription { endpoint, keys } (Web Push).'
      });
    }

    const cleanEntityId = entityId.trim();
    if (cleanEntityId.length > 128) {
      return res.status(400).json({ error: 'entityId melebihi batas panjang karakter yang diizinkan.' });
    }

    if (hasFcm && fcmToken.trim().length > 4096) {
      return res.status(400).json({ error: 'Format fcmToken melebihi batas panjang yang sah.' });
    }

    // Prevent unprivileged CUSTOMER role from binding onto merchant_ or driver_ store namespaces
    if (role === 'CUSTOMER' && (/^merchant_/i.test(cleanEntityId) || /^driver_/i.test(cleanEntityId))) {
      return res.status(403).json({ error: 'Akses ditolak: Role CUSTOMER tidak diizinkan mendaftarkan notifikasi toko atau driver.' });
    }

    // Strict authentication & store/driver ownership check
    if (role === 'MERCHANT' || role === 'DRIVER') {
      if (!user) {
        return res.status(401).json({
          error: `Akses ditolak: Autentikasi diperlukan untuk mendaftarkan notifikasi ${role === 'MERCHANT' ? 'toko' : 'driver'}.`
        });
      }
      if (!isAuthorizedForEntity(user, role, cleanEntityId)) {
        return res.status(403).json({
          error: `Akses ditolak: Anda tidak memiliki wewenang untuk mendaftarkan notifikasi ${role === 'MERCHANT' ? 'toko' : 'driver'} ini.`
        });
      }
    }

    const subType = hasFcm ? 'FCM' : 'WEB_PUSH';
    const nowIso = new Date().toISOString();

    const record: PushSubscriptionRecord = {
      id: (hasFcm ? 'fcm_' : 'sub_') + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      type: subType,
      role: role as 'MERCHANT' | 'DRIVER' | 'CUSTOMER',
      entityId: cleanEntityId,
      fcmToken: hasFcm ? fcmToken.trim() : undefined,
      subscription: hasWebPush ? {
        endpoint: String(subscription.endpoint).trim(),
        keys: {
          p256dh: String(subscription.keys.p256dh),
          auth: String(subscription.keys.auth)
        }
      } : undefined,
      deviceInfo: deviceInfo || (hasFcm ? 'Android Native Device' : 'Web Browser'),
      appVersion: appVersion || '1.1.0',
      userAgent: userAgent || req.headers['user-agent'] || '',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const saved = await foodDb.savePushSubscription(
      record,
      typeof oldFcmToken === 'string' ? oldFcmToken.trim() : undefined
    );

    // Opportunistically flush any pending/retrying outbox events for this merchant on reconnect
    let retriedEvents = 0;
    if (role === 'MERCHANT') {
      const retrySummary = await pushService.retryPendingEventsForMerchant(cleanEntityId).catch(() => ({
        inspected: 0,
        retried: 0,
        delivered: 0
      }));
      retriedEvents = retrySummary.delivered;
    }

    res.json({
      success: true,
      type: subType,
      fcmServerConfigured: pushService.isFcmServerConfigured(),
      retriedEvents,
      message: hasFcm
        ? 'Perangkat Android APK berhasil didaftarkan untuk FCM Push Notification.'
        : 'Browser Web Push berhasil didaftarkan untuk notifikasi pesanan TumpangGo.',
      subscriptionId: saved.id
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error saving subscription:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Gagal menyimpan langganan notifikasi.' });
  }
});

// 3. Unsubscribe / Unbind a device on logout or token invalidation
pushRouter.post('/unsubscribe', async (req: any, res) => {
  try {
    const { endpoint, fcmToken, subscriptionId, entityId } = req.body || {};
    const user = req.user;
    const cleanEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
    const cleanFcmToken = typeof fcmToken === 'string' ? fcmToken.trim() : '';
    const cleanSubId = typeof subscriptionId === 'string' ? subscriptionId.trim() : '';
    const cleanEntityId = typeof entityId === 'string' && entityId.trim() ? entityId.trim() : undefined;

    const hasValidDeviceSecret =
      cleanFcmToken.length > 10 ||
      cleanEndpoint.startsWith('https://') ||
      cleanEndpoint.startsWith('http://');

    if (!hasValidDeviceSecret && !cleanSubId) {
      return res.status(400).json({
        error: 'Salah satu identifier yang sah (fcmToken, endpoint URL, atau subscriptionId) wajib disertakan.'
      });
    }

    // Unsubscribing by internal row ID (without possession of cryptographic device token/endpoint)
    // strictly requires authentication and verified ownership of the target store/driver.
    if (!hasValidDeviceSecret && cleanSubId) {
      if (!user) {
        return res.status(401).json({
          error: 'Autentikasi diperlukan untuk menghapus langganan berdasarkan subscriptionId.'
        });
      }
      if (cleanEntityId && (user.role === 'MERCHANT' || user.role === 'DRIVER')) {
        if (!isAuthorizedForEntity(user, user.role, cleanEntityId)) {
          return res.status(403).json({
            error: 'Akses ditolak: Anda tidak berwenang menghapus langganan milik akun lain.'
          });
        }
      }
    }

    // If an authenticated merchant/driver explicitly supplies an entityId, verify it belongs to them
    if (user && cleanEntityId && (user.role === 'MERCHANT' || user.role === 'DRIVER')) {
      if (!isAuthorizedForEntity(user, user.role, cleanEntityId)) {
        return res.status(403).json({
          error: 'Akses ditolak: entityId tidak sesuai dengan akun yang sedang login.'
        });
      }
    }

    const identifier = cleanEndpoint || cleanFcmToken || cleanSubId;
    const removed = await foodDb.removePushSubscription(identifier, cleanEntityId);

    res.json({
      success: true,
      removed,
      message: 'Langganan notifikasi perangkat berhasil dilepas dari akun.'
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error unsubscribing:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Gagal menghapus langganan notifikasi.' });
  }
});

// 4. Diagnostic status for authenticated Merchant / Driver device registration
pushRouter.get('/status', async (req: any, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    }

    const role = String(req.query.role || user.role || 'MERCHANT').toUpperCase();
    const entityId = String(req.query.entityId || user.entityId || user.userId || '').trim();
    if (!entityId || !['MERCHANT', 'DRIVER'].includes(role)) {
      return res.status(400).json({ error: 'Parameter role dan entityId diperlukan.' });
    }

    if (!isAuthorizedForEntity(user, role, entityId)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const subs = await foodDb.getPushSubscriptionsForEntityAsync(role as 'MERCHANT' | 'DRIVER', entityId);
    const fcmDevices = subs.filter(s => Boolean(s.fcmToken)).length;
    const webPushDevices = subs.filter(s => Boolean(s.subscription?.endpoint)).length;

    res.json({
      success: true,
      role,
      entityId,
      fcmServerConfigured: pushService.isFcmServerConfigured(),
      vapidConfigured: Boolean(pushService.getVapidPublicKey()),
      fcmDevices,
      webPushDevices,
      totalDevices: subs.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memeriksa status push notification.' });
  }
});

// 5. Retry pending outbox notifications (e.g. when device recovers from offline to online)
pushRouter.post('/retry-pending', async (req: any, res) => {
  try {
    const user = req.user;
    const entityId = String(req.body?.entityId || user?.entityId || user?.userId || '').trim();
    if (!user || !entityId) {
      return res.status(401).json({ error: 'Autentikasi toko diperlukan.' });
    }
    if (!isAuthorizedForEntity(user, 'MERCHANT', entityId)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const summary = await pushService.retryPendingEventsForMerchant(entityId);
    res.json({
      success: true,
      ...summary
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memproses ulang antrean notifikasi.' });
  }
});

// 6. Test Push Notification - Strictly restricted to verified entity owners or admins
pushRouter.post('/test', async (req: any, res) => {
  try {
    const { role, entityId } = req.body || {};
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan untuk mengirim tes notifikasi push.' });
    }

    if (!role || !entityId) {
      return res.status(400).json({ error: 'Role dan entityId wajib disertakan untuk tes notifikasi.' });
    }

    if (!['MERCHANT', 'DRIVER'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak didukung untuk tes notifikasi.' });
    }

    if (!isAuthorizedForEntity(user, role, entityId)) {
      return res.status(403).json({
        error: `Akses ditolak: Anda tidak memiliki wewenang untuk mengetes notifikasi ${role === 'MERCHANT' ? 'toko' : 'driver'} ini.`
      });
    }

    let result;
    const testEventId = `test_push:${entityId}:${Date.now()}`;

    if (role === 'MERCHANT') {
      result = await pushService.sendToMerchant(entityId, {
        title: 'Tes Notifikasi TumpangGo Merchant',
        body: 'Push notification native aktif! Anda akan menerima nada dering pesanan baru meskipun aplikasi ditutup atau layar terkunci.',
        url: `/merchant?id=${encodeURIComponent(entityId)}`,
        tag: 'test-push-' + Date.now(),
        channelId: MERCHANT_ORDER_CHANNEL_ID,
        sound: MERCHANT_ORDER_SOUND_NAME,
        eventId: testEventId,
        data: {
          eventId: testEventId,
          role: 'MERCHANT',
          type: 'TEST_NOTIFICATION',
          merchantId: entityId,
          click_action: 'OPEN_MERCHANT_DASHBOARD'
        }
      });
    } else {
      result = await pushService.sendToDriver(entityId, {
        title: 'Tes Notifikasi Driver TumpangGo',
        body: 'Push notification aktif! Anda akan menerima peringatan saat ditugaskan pesanan pengantaran.',
        url: `/driver?id=${encodeURIComponent(entityId)}`,
        tag: 'test-push-' + Date.now(),
        channelId: 'tumpanggo_driver_orders',
        sound: MERCHANT_ORDER_SOUND_NAME,
        eventId: testEventId,
        data: {
          eventId: testEventId,
          role: 'DRIVER',
          type: 'TEST_NOTIFICATION',
          driverId: entityId,
          click_action: 'OPEN_DRIVER_DASHBOARD'
        }
      });
    }

    const detailMsg: string[] = [];
    if (result.sentFCM > 0) detailMsg.push(`${result.sentFCM} perangkat Android (FCM)`);
    if (result.sentWebPush > 0) detailMsg.push(`${result.sentWebPush} browser (Web Push)`);

    res.json({
      success: result.totalSent > 0,
      fcmServerConfigured: pushService.isFcmServerConfigured(),
      subscriberCount: result.subscriberCount || 0,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed,
      sentFCM: result.sentFCM,
      sentWebPush: result.sentWebPush,
      lastError: result.lastError,
      message: result.totalSent > 0
        ? `Notifikasi tes berhasil terkirim ke ${detailMsg.join(' dan ')}!`
        : !pushService.isFcmServerConfigured() && (result.subscriberCount || 0) > 0
          ? 'Perangkat terdaftar, tetapi FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi pada server.'
          : 'Belum ada perangkat Android (FCM) atau browser yang terdaftar untuk menerima notifikasi toko ini.'
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error sending test push:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Gagal mengirim tes notifikasi push.' });
  }
});
