/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Web Push Subscription Hook for TumpangGo Merchant & Driver
 * Handles browser notification permissions, service worker push registration,
 * and background notification testing.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch as fetch } from '../utils/apiClient.ts';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush(role: 'MERCHANT' | 'DRIVER', entityId: string) {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Check support and current registration status on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);

      navigator.serviceWorker.ready.then(async (reg) => {
        try {
          const sub = await reg.pushManager.getSubscription();
          setIsSubscribed(Boolean(sub));
        } catch {
          setIsSubscribed(false);
        }
      }).catch(() => {});
    }
  }, [role, entityId]);

  // Subscribe to Web Push
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setStatusMessage('Browser ini tidak mendukung Web Push Notifications.');
      return false;
    }

    if (!entityId) {
      setStatusMessage('ID toko atau driver belum terverifikasi.');
      return false;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setStatusMessage('Izin notifikasi tidak diberikan oleh browser.');
        return false;
      }

      // 2. Fetch VAPID Public Key from backend
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) {
        throw new Error('Gagal mengambil kunci otorisasi notifikasi push.');
      }
      const { publicKey } = await vapidRes.json();
      if (!publicKey) {
        throw new Error('Kunci VAPID belum dikonfigurasi di server.');
      }

      // 3. Register with Service Worker Push Manager
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      // 4. Send subscription record to backend
      const subJson = subscription.toJSON();
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          entityId,
          subscription: {
            endpoint: subscription.endpoint,
            keys: subJson.keys
          },
          userAgent: navigator.userAgent
        })
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal mendaftarkan langganan notifikasi ke server.');
      }

      setIsSubscribed(true);
      setStatusMessage('Notifikasi pesanan berhasil diaktifkan untuk perangkat ini!');
      return true;
    } catch (err: any) {
      console.error('[useWebPush] Subscription error:', err);
      setStatusMessage(err.message || 'Terjadi kesalahan saat mengaktifkan notifikasi.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, entityId, role]);

  // Unsubscribe from Web Push
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Invalidate in backend
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint })
        }).catch(() => {});
      }

      setIsSubscribed(false);
      setStatusMessage('Notifikasi pesanan telah dinonaktifkan.');
      return true;
    } catch (err: any) {
      console.error('[useWebPush] Unsubscribe error:', err);
      setStatusMessage(err.message || 'Gagal menonaktifkan notifikasi.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  // Dispatch Test Push
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!entityId) return false;
    setLoading(true);

    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, entityId })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatusMessage(data.message || 'Notifikasi tes berhasil dikirim!');
        return true;
      } else {
        setStatusMessage(data.error || 'Gagal mengirim notifikasi tes.');
        return false;
      }
    } catch (err: any) {
      console.error('[useWebPush] Test notification error:', err);
      setStatusMessage(err.message || 'Kendala jaringan saat mengirim notifikasi tes.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [role, entityId]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    statusMessage,
    subscribe,
    unsubscribe,
    sendTestNotification,
    clearStatusMessage: () => setStatusMessage(null)
  };
}
