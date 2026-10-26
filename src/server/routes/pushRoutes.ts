/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Push Notification Routes for TumpangGo
 * Manages VAPID public key retrieval, Android FCM / Web Push device token registration,
 * unsubscription, and test notification dispatch.
 */

import { Router } from 'express';
import { pushService } from '../services/pushService';
import { foodDb, PushSubscriptionRecord } from '../db';

export const pushRouter = Router();

// 1. Get VAPID Public Key for client subscription setup
pushRouter.get('/vapid-key', (req, res) => {
  const publicKey = pushService.getVapidPublicKey();
  res.json({
    success: true,
    publicKey
  });
});

// 2. Subscribe a device (Native Android FCM token or Web Push Subscription)
pushRouter.post('/subscribe', (req: any, res) => {
  try {
    const { role, entityId, subscription, fcmToken, deviceInfo, appVersion, userAgent } = req.body;
    const user = req.user;

    if (!role || !['MERCHANT', 'DRIVER', 'CUSTOMER'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid untuk langganan push notification.' });
    }

    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'entityId (ID toko atau ID driver) wajib disertakan.' });
    }

    // Must provide either an Android FCM token or a browser Web Push subscription
    const hasFcm = Boolean(fcmToken && typeof fcmToken === 'string' && fcmToken.trim().length > 10);
    const hasWebPush = Boolean(subscription && subscription.endpoint && subscription.keys);

    if (!hasFcm && !hasWebPush) {
      return res.status(400).json({
        error: 'Pendaftaran memerlukan salah satu: fcmToken (Android FCM) atau subscription { endpoint, keys } (Web Push).'
      });
    }

    // Role-based authorization guard
    if (role === 'MERCHANT') {
      if (!user) {
        return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan untuk mendaftarkan notifikasi toko.' });
      }
      const isMasterOrAdmin = user.role === 'ADMIN' || user.role === 'MASTER_ADMIN' || user.isMasterAdmin;
      const isOwner = user.role === 'MERCHANT' && (
        user.entityId === entityId || 
        user.userId === entityId ||
        String(user.entityId || '').replace(/^merchant_/, '') === String(entityId).replace(/^merchant_/, '')
      );
      if (!isMasterOrAdmin && !isOwner) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mendaftarkan notifikasi toko ini.' });
      }
    } else if (role === 'DRIVER') {
      if (!user) {
        return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan untuk mendaftarkan notifikasi driver.' });
      }
      const isMasterOrAdmin = user.role === 'ADMIN' || user.role === 'MASTER_ADMIN' || user.isMasterAdmin;
      const isSelf = user.role === 'DRIVER' && (user.entityId === entityId || user.userId === entityId);
      if (!isMasterOrAdmin && !isSelf) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mendaftarkan notifikasi driver ini.' });
      }
    }

    const subType = hasFcm ? 'FCM' : 'WEB_PUSH';
    const cleanEntityId = entityId.trim();

    const record: PushSubscriptionRecord = {
      id: (hasFcm ? 'fcm_' : 'sub_') + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      type: subType,
      role: role as 'MERCHANT' | 'DRIVER' | 'CUSTOMER',
      entityId: cleanEntityId,
      fcmToken: hasFcm ? fcmToken.trim() : undefined,
      subscription: hasWebPush ? {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      } : undefined,
      deviceInfo: deviceInfo || (hasFcm ? 'Android Native Device' : 'Web Browser'),
      appVersion: appVersion || '1.0.0',
      userAgent: userAgent || req.headers['user-agent'] || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    foodDb.savePushSubscription(record);

    res.json({
      success: true,
      type: subType,
      message: hasFcm 
        ? 'Perangkat Android APK berhasil didaftarkan untuk FCM Push Notification.'
        : 'Browser Web Push berhasil didaftarkan untuk notifikasi pesanan TumpangGo.',
      subscriptionId: record.id
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error saving subscription:', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan langganan notifikasi.' });
  }
});

// 3. Unsubscribe a device (Supports endpoint, fcmToken, or subscriptionId)
pushRouter.post('/unsubscribe', (req, res) => {
  try {
    const { endpoint, fcmToken, subscriptionId } = req.body;
    const identifier = endpoint || fcmToken || subscriptionId;

    if (!identifier) {
      return res.status(400).json({ error: 'Salah satu identifier (endpoint, fcmToken, atau subscriptionId) wajib disertakan.' });
    }

    foodDb.removePushSubscription(identifier);
    res.json({ success: true, message: 'Langganan notifikasi berhasil dihapus.' });
  } catch (err: any) {
    console.error('[PushRoutes] Error unsubscribing:', err);
    res.status(500).json({ error: err.message || 'Gagal menghapus langganan notifikasi.' });
  }
});

// 4. Test Push Notification - Strictly restricted to verified entity owners or admins
pushRouter.post('/test', async (req: any, res) => {
  try {
    const { role, entityId } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Akses ditolak: Autentikasi diperlukan untuk mengirim tes notifikasi push.' });
    }

    if (!role || !entityId) {
      return res.status(400).json({ error: 'Role dan entityId wajib disertakan untuk tes notifikasi.' });
    }

    const isMasterOrAdmin = user.role === 'ADMIN' || user.role === 'MASTER_ADMIN' || user.isMasterAdmin;

    if (role === 'MERCHANT') {
      const isOwner = user.role === 'MERCHANT' && (
        user.entityId === entityId || 
        user.userId === entityId ||
        String(user.entityId || '').replace(/^merchant_/, '') === String(entityId).replace(/^merchant_/, '')
      );
      if (!isMasterOrAdmin && !isOwner) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mengetes notifikasi toko ini.' });
      }
    } else if (role === 'DRIVER') {
      const isSelf = user.role === 'DRIVER' && (user.entityId === entityId || user.userId === entityId);
      if (!isMasterOrAdmin && !isSelf) {
        return res.status(403).json({ error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mengetes notifikasi driver ini.' });
      }
    } else {
      return res.status(400).json({ error: 'Role tidak didukung untuk tes notifikasi.' });
    }

    let result;

    if (role === 'MERCHANT') {
      result = await pushService.sendToMerchant(entityId, {
        title: '🔔 Tes Notifikasi Toko TumpangGo',
        body: 'Notifikasi push berhasil terhubung! Anda akan menerima nada dering panggilan saat pesanan baru masuk meskipun aplikasi ditutup.',
        url: `/merchant?id=${encodeURIComponent(entityId)}`,
        tag: 'test-push-' + Date.now(),
        channelId: 'tumpanggo_merchant_orders',
        sound: 'order_ringtone',
        data: {
          role: 'MERCHANT',
          type: 'TEST_NOTIFICATION',
          merchantId: entityId
        }
      });
    } else if (role === 'DRIVER') {
      result = await pushService.sendToDriver(entityId, {
        title: '🛵 Tes Notifikasi Driver TumpangGo',
        body: 'Notifikasi push berhasil terhubung! Anda akan menerima peringatan saat ditugaskan pesanan pengantaran.',
        url: `/driver?id=${encodeURIComponent(entityId)}`,
        tag: 'test-push-' + Date.now(),
        channelId: 'tumpanggo_driver_orders',
        sound: 'order_ringtone',
        data: {
          role: 'DRIVER',
          type: 'TEST_NOTIFICATION',
          driverId: entityId
        }
      });
    } else {
      return res.status(400).json({ error: 'Role tidak didukung.' });
    }

    const detailMsg = [];
    if (result.sentFCM > 0) detailMsg.push(`${result.sentFCM} perangkat Android (FCM)`);
    if (result.sentWebPush > 0) detailMsg.push(`${result.sentWebPush} browser (Web Push)`);

    res.json({
      success: true,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed,
      sentFCM: result.sentFCM,
      sentWebPush: result.sentWebPush,
      message: result.totalSent > 0
        ? `Notifikasi tes berhasil terkirim ke ${detailMsg.join(' dan ')}!`
        : 'Belum ada perangkat Android (FCM) atau browser yang terdaftar untuk menerima notifikasi toko ini.'
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error sending test push:', err);
    res.status(500).json({ error: err.message || 'Gagal mengirim tes notifikasi push.' });
  }
});
