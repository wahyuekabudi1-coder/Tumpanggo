/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Web Push Subscription Hook for TumpangGo Merchant & Driver (Browser / PWA only).
 * Automatically disables browser PushManager inside the Native Android APK WebView
 * so Web Push and Native Android FCM never duplicate notifications on the same device.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch as fetch } from '../utils/apiClient.ts';

function isRunningInsideNativeAndroidBridge(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  const bridge = win.TumpangNativeBridge || win.AndroidBridge;
  try {
    return Boolean(bridge && typeof bridge.isNativeApp === 'function' && bridge.isNativeApp());
  } catch {
    return false;
  }
}

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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Strictly separate Browser/PWA Web Push from Native Android FCM
    if (isRunningInsideNativeAndroidBridge()) {
      setIsSupported(false);
      setIsSubscribed(false);
      return;
    }

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

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (isRunningInsideNativeAndroidBridge()) {
      return false;
    }

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
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setStatusMessage('Izin notifikasi tidak diberikan oleh browser.');
        return false;
      }

      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) {
        throw new Error('Gagal mengambil kunci otorisasi notifikasi push.');
      }
      const { publicKey } = await vapidRes.json();
      if (!publicKey) {
        throw new Error('Kunci VAPID belum dikonfigurasi di server.');
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

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
      setStatusMessage('Notifikasi pesanan berhasil diaktifkan untuk browser ini!');
      return true;
    } catch (err: any) {
      console.error('[useWebPush] Subscription error:', err);
      setStatusMessage(err.message || 'Terjadi kesalahan saat mengaktifkan notifikasi.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, entityId, role]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint, entityId })
        }).catch(() => {});
      }

      setIsSubscribed(false);
      setStatusMessage('Notifikasi browser telah dinonaktifkan.');
      return true;
    } catch (err: any) {
      console.error('[useWebPush] Unsubscribe error:', err);
      setStatusMessage(err.message || 'Gagal menonaktifkan notifikasi.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, entityId]);

  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!entityId) return false;
    setLoading(true);
    setStatusMessage(null);

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
        setStatusMessage(data.message || data.error || 'Gagal mengirim notifikasi tes.');
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
