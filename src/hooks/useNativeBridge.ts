/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Native Android APK Bridge Integration Hook for TumpangGo Merchant
 * Bridges the web application with native Kotlin/Android capabilities:
 * - Detects native app runtime (window.TumpangNativeBridge / window.AndroidBridge)
 * - Automatically registers device FCM token for authenticated merchant
 * - Listens for native notification clicks to jump straight to the relevant order
 * - Automatically dismisses native Android notification when order is accepted/cooked
 */

import { useEffect, useState, useCallback } from 'react';
import { apiFetch as fetch } from '../utils/apiClient.ts';

interface NativeBridgeInterface {
  isNativeApp?: () => boolean;
  getFcmToken?: () => string;
  setAuthenticatedMerchant?: (merchantId: string, authToken?: string | null) => void;
  onOrderHandled?: (orderId: string) => void;
  playTestSound?: () => void;
  requestNotificationPermission?: () => void;
  getDeviceInfo?: () => string;
}

declare global {
  interface Window {
    TumpangNativeBridge?: NativeBridgeInterface;
    AndroidBridge?: NativeBridgeInterface;
  }
}

export function useNativeBridge(merchantId?: string, authToken?: string | null) {
  const [isNativeApp, setIsNativeApp] = useState<boolean>(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  // Check if native bridge is present
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bridge = window.TumpangNativeBridge || window.AndroidBridge;
    const isNative = Boolean(bridge && typeof bridge.isNativeApp === 'function' && bridge.isNativeApp());
    setIsNativeApp(isNative);

    if (isNative && bridge) {
      try {
        const token = bridge.getFcmToken ? bridge.getFcmToken() : null;
        if (token) setFcmToken(token);
      } catch (e) {
        console.warn('[useNativeBridge] Error reading FCM token:', e);
      }
    }
  }, []);

  // Sync authenticated merchant session to native Android layer & register token to backend
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!merchantId) return;

    const bridge = window.TumpangNativeBridge || window.AndroidBridge;
    if (bridge && typeof bridge.setAuthenticatedMerchant === 'function') {
      try {
        bridge.setAuthenticatedMerchant(merchantId, authToken || null);
        console.log(`[useNativeBridge] Associated native device with merchant: ${merchantId}`);
      } catch (err) {
        console.warn('[useNativeBridge] Failed to set authenticated merchant in native bridge:', err);
      }

      // Also ensure backend has the FCM token recorded
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
            appVersion: '1.0.0'
          })
        }).catch((err) => {
          console.warn('[useNativeBridge] Backend token registration error:', err);
        });
      }
    }
  }, [merchantId, authToken]);

  // Handler to dismiss native notification when an order is handled in the UI
  const notifyOrderHandled = useCallback((orderId: string) => {
    if (typeof window === 'undefined') return;
    const bridge = window.TumpangNativeBridge || window.AndroidBridge;
    if (bridge && typeof bridge.onOrderHandled === 'function') {
      try {
        bridge.onOrderHandled(orderId);
      } catch (err) {
        console.warn('[useNativeBridge] Error calling onOrderHandled:', err);
      }
    }
  }, []);

  // Handler to play native ringtone preview
  const playNativeTestSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    const bridge = window.TumpangNativeBridge || window.AndroidBridge;
    if (bridge && typeof bridge.playTestSound === 'function') {
      try {
        bridge.playTestSound();
      } catch (err) {
        console.warn('[useNativeBridge] Error calling playTestSound:', err);
      }
    }
  }, []);

  // Request runtime notification permission on Android 13+
  const requestNativeNotificationPermission = useCallback(() => {
    if (typeof window === 'undefined') return;
    const bridge = window.TumpangNativeBridge || window.AndroidBridge;
    if (bridge && typeof bridge.requestNotificationPermission === 'function') {
      try {
        bridge.requestNotificationPermission();
      } catch (err) {
        console.warn('[useNativeBridge] Error calling requestNotificationPermission:', err);
      }
    }
  }, []);

  return {
    isNativeApp,
    fcmToken,
    notifyOrderHandled,
    playNativeTestSound,
    requestNativeNotificationPermission
  };
}
