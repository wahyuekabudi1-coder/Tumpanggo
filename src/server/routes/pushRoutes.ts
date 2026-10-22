/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Web Push Notification Routes for TumpangGo
 * Manages VAPID public key retrieval, device subscription registration, and test dispatch.
 */

import { Router } from 'express';
import { pushService } from '../services/pushService';
import { foodDb } from '../db';

export const pushRouter = Router();

// 1. Get VAPID Public Key for client subscription setup
pushRouter.get('/vapid-key', (req, res) => {
  const publicKey = pushService.getVapidPublicKey();
  res.json({
    success: true,
    publicKey
  });
});

// 2. Subscribe a device to receive push notifications
pushRouter.post('/subscribe', (req: any, res) => {
  try {
    const { role, entityId, subscription, userAgent } = req.body;
    const user = req.user;

    if (!role || !['MERCHANT', 'DRIVER', 'CUSTOMER'].includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid untuk langganan push notification.' });
    }

    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'entityId (ID toko atau ID driver) wajib disertakan.' });
    }

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Objek PushSubscription browser tidak lengkap.' });
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

    const record = {
      id: 'sub_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      role: role as 'MERCHANT' | 'DRIVER' | 'CUSTOMER',
      entityId: entityId.trim(),
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      },
      userAgent: userAgent || req.headers['user-agent'] || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    foodDb.savePushSubscription(record);

    res.json({
      success: true,
      message: 'Perangkat berhasil terdaftar untuk menerima notifikasi pesanan TumpangGo.',
      subscriptionId: record.id
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error saving subscription:', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan langganan notifikasi.' });
  }
});

// 3. Unsubscribe a device
pushRouter.post('/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint subscription wajib disertakan.' });
    }

    foodDb.removePushSubscription(endpoint);
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

    let result: { sent: number; failed: number };

    if (role === 'MERCHANT') {
      result = await pushService.sendToMerchant(entityId, {
        title: '🔔 Tes Notifikasi Toko TumpangGo',
        body: 'Notifikasi push berhasil terhubung! Anda akan menerima peringatan saat ada pesanan masuk meskipun layar tertutup.',
        url: `/merchant?id=${encodeURIComponent(entityId)}`,
        tag: 'test-push-' + Date.now()
      });
    } else if (role === 'DRIVER') {
      result = await pushService.sendToDriver(entityId, {
        title: '🛵 Tes Notifikasi Driver TumpangGo',
        body: 'Notifikasi push berhasil terhubung! Anda akan menerima peringatan saat ditugaskan pesanan pengantaran.',
        url: `/driver?id=${encodeURIComponent(entityId)}`,
        tag: 'test-push-' + Date.now()
      });
    } else {
      return res.status(400).json({ error: 'Role tidak didukung.' });
    }

    res.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message: result.sent > 0
        ? `Notifikasi terkirim ke ${result.sent} perangkat aktif!`
        : 'Belum ada perangkat yang terdaftar atau izin notifikasi browser belum diberikan.'
    });
  } catch (err: any) {
    console.error('[PushRoutes] Error sending test push:', err);
    res.status(500).json({ error: err.message || 'Gagal mengirim tes notifikasi push.' });
  }
});
