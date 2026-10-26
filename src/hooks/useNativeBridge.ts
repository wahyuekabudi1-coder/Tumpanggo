/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Native Android APK Bridge Integration Hook for TumpangGo Merchant.
 * Bridges the authenticated web portal with native Kotlin/Android capabilities:
 * - Detects native app runtime (`window.TumpangNativeBridge` / `window.AndroidBridge`)
 * - Associates device FCM token with the authenticated merchant store
 * - Unbinds device FCM token cleanly on logout (`clearNativeMerchantSession`)
 * - Synchronizes unhandled order IDs so Android notification grouping count stays accurate
 * - Reads OS notification channel diagnostics and opens Android Channel Settings when needed
 */

import { useEffect, useState, useCallback } from 'react';
import { apiFetch as fetch } from '../utils/apiClient.ts';

export interface NativeNotificationDiagnostics {
  appNotificationsEnabled: boolean;
  channelId: string;
  channelName: string;
  channelExists: boolean;
  channelImportance: number;
  channelBlocked: boolean;
  channelSoundEnabled: boolean;
  channelVibrationEnabled: boolean;
  activeNotificationCount: number;
  firebaseInitialized: boolean;
  fcmTokenPresent: boolean;
  fcmTokenSynced: boolean;
  sdkInt: number;
}

interface NativeBridgeInterface {
  isNativeApp?: () => boolean;
  getFcmToken?: () => string;
  setAuthenticatedMerchant?: (merchantId: string, authToken?: string | null) => void;
  clearAuthenticatedMerchant?: () => void;
  onOrderHandled?: (orderId: string) => void;
  syncPendingOrders?: (unhandledOrderIdsJson: string) => void;
  playTestSound?: () => void;
  requestNotificationPermission?: () => void;
  openNotificationSettings?: () => void;
  getNotificationDiagnostics?: () => string;
  getDeviceInfo?: () => string;
  closeApp?: () => void;
}

declare global {
  interface Window {
    TumpangNativeBridge?: NativeBridgeInterface;
    AndroidBridge?: NativeBridgeInterface;
  }
}

export function getActiveNativeBridge(): NativeBridgeInterface | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.TumpangNativeBridge || window.AndroidBridge;
  if (bridge && typeof bridge.isNativeApp === 'function') {
    try {
      if (bridge.isNativeApp()) return bridge;
    } catch {
      return null;
    }
  }
  return null;
}

export function clearNativeMerchantSessionGlobal(entityId?: string) {
  if (typeof window === 'undefined') return;
  const bridge = getActiveNativeBridge();
  let token: string | null = null;

  if (bridge) {
    try {
      token = bridge.getFcmToken ? bridge.getFcmToken() : null;
    } catch {}
    try {
      bridge.clearAuthenticatedMerchant?.();
    } catch (err) {
      console.warn('[useNativeBridge] Error clearing native merchant session:', err);
    }
  }

  if (token && token.length > 10) {
    fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken: token, entityId })
    }).catch(() => {});
  }
}

export function useNativeBridge(merchantId?: string, authToken?: string | null) {
  const [isNativeApp, setIsNativeApp] = useState<boolean>(() => Boolean(getActiveNativeBridge()));
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [nativeDiagnostics, setNativeDiagnostics] = useState<NativeNotificationDiagnostics | null>(null);

  const refreshNativeDiagnostics = useCallback(() => {
    const bridge = getActiveNativeBridge();
    if (!bridge) {
      setIsNativeApp(false);
      return;
    }
    setIsNativeApp(true);

    try {
      const token = bridge.getFcmToken ? bridge.getFcmToken() : '';
      if (token) setFcmToken(token);
    } catch {}

    try {
      if (typeof bridge.getNotificationDiagnostics === 'function') {
        const raw = bridge.getNotificationDiagnostics();
        if (raw) {
          setNativeDiagnostics(JSON.parse(raw));
        }
      }
    } catch (err) {
      console.warn('[useNativeBridge] Error reading native diagnostics:', err);
    }
  }, []);

  useEffect(() => {
    refreshNativeDiagnostics();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNativeDiagnostics();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshNativeDiagnostics]);

  // Bind authenticated merchant session to native layer & ensure backend token sync
  useEffect(() => {
    if (!merchantId) return;
    const bridge = getActiveNativeBridge();
    if (!bridge) return;

    try {
      bridge.setAuthenticatedMerchant?.(merchantId, authToken || null);
    } catch (err) {
      console.warn('[useNativeBridge] Failed to set authenticated merchant in native bridge:', err);
    }

    const syncTokenToApi = () => {
      try {
        const token = bridge.getFcmToken ? bridge.getFcmToken() : null;
        if (token && token.length > 10) {
          setFcmToken(token);
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'MERCHANT',
              entityId: merchantId,
              fcmToken: token,
              deviceInfo: 'Android Merchant APK (Native Bridge)',
              appVersion: '1.1.0'
            })
          })
            .then(() => refreshNativeDiagnostics())
            .catch((err) => {
              console.warn('[useNativeBridge] Backend token registration warning:', err);
            });
        }
      } catch {}
    };

    syncTokenToApi();
    // Re-check once after 2.5s in case FirebaseMessaging.getInstance().token resolved asynchronously on first boot
    const timer = setTimeout(syncTokenToApi, 2500);
    return () => clearTimeout(timer);
  }, [merchantId, authToken, refreshNativeDiagnostics]);

  const notifyOrderHandled = useCallback((orderId: string) => {
    const bridge = getActiveNativeBridge();
    if (!bridge || !orderId) return;
    try {
      bridge.onOrderHandled?.(orderId);
      refreshNativeDiagnostics();
    } catch (err) {
      console.warn('[useNativeBridge] Error calling onOrderHandled:', err);
    }
  }, [refreshNativeDiagnostics]);

  const syncNativePendingOrders = useCallback((unhandledOrderIds: string[]) => {
    const bridge = getActiveNativeBridge();
    if (!bridge || typeof bridge.syncPendingOrders !== 'function') return;
    try {
      bridge.syncPendingOrders(JSON.stringify(unhandledOrderIds));
    } catch (err) {
      console.warn('[useNativeBridge] Error calling syncPendingOrders:', err);
    }
  }, []);

  const clearNativeMerchantSession = useCallback(() => {
    clearNativeMerchantSessionGlobal(merchantId);
    setFcmToken(null);
  }, [merchantId]);

  const playNativeTestSound = useCallback(() => {
    const bridge = getActiveNativeBridge();
    if (!bridge) return;
    try {
      bridge.playTestSound?.();
    } catch (err) {
      console.warn('[useNativeBridge] Error calling playTestSound:', err);
    }
  }, []);

  const requestNativeNotificationPermission = useCallback(() => {
    const bridge = getActiveNativeBridge();
    if (!bridge) return;
    try {
      bridge.requestNotificationPermission?.();
      setTimeout(refreshNativeDiagnostics, 1500);
    } catch (err) {
      console.warn('[useNativeBridge] Error calling requestNotificationPermission:', err);
    }
  }, [refreshNativeDiagnostics]);

  const openNativeNotificationSettings = useCallback(() => {
    const bridge = getActiveNativeBridge();
    if (!bridge) return;
    try {
      bridge.openNotificationSettings?.();
    } catch (err) {
      console.warn('[useNativeBridge] Error calling openNotificationSettings:', err);
    }
  }, []);

  return {
    isNativeApp,
    fcmToken,
    nativeDiagnostics,
    notifyOrderHandled,
    syncNativePendingOrders,
    clearNativeMerchantSession,
    playNativeTestSound,
    requestNativeNotificationPermission,
    openNativeNotificationSettings,
    refreshNativeDiagnostics
  };
}
