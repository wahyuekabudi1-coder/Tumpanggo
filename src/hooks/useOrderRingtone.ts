/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hook for managing new incoming order ringtone alerts in TumpangGo Food Merchant (Web/PWA).
 *
 * IMPORTANT NATIVE APK COORDINATION:
 * When `suppressWebAudio` is true (running inside the Native Android APK WebView),
 * Web Audio synthesis is strictly disabled because Android's native `NotificationChannel`
 * (`Pesanan Baru TumpangGo Merchant` -> `res/raw/order_ringtone.wav`) handles audio & vibration
 * at the OS level, preventing double sound or overlapping loops.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Order, OrderStatus } from '../types.ts';
import { orderRingtone } from '../utils/orderRingtone.ts';
import { safeStorage } from '../utils/safeStorage.ts';

const SEEN_ORDERS_STORAGE_KEY = 'tumpang_seen_order_ids';

export function useOrderRingtone(
  orders: Order[],
  isLoaded: boolean = true,
  suppressWebAudio: boolean = false
) {
  const [isRinging, setIsRinging] = useState<boolean>(() => orderRingtone.isRinging());
  const [isMuted, setIsMuted] = useState<boolean>(() => orderRingtone.isMuted());
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(() => orderRingtone.isUnlocked());
  const [activeAlertOrderId, setActiveAlertOrderId] = useState<string | null>(null);

  const knownOrderIdsRef = useRef<Set<string>>(
    (() => {
      const set = new Set<string>();
      try {
        const saved = safeStorage.getItem(SEEN_ORDERS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            parsed.forEach((id: string) => set.add(id));
          }
        }
      } catch {}
      return set;
    })()
  );

  const isInitialLoadDoneRef = useRef<boolean>(false);

  const persistKnownIds = useCallback(() => {
    try {
      const arr = Array.from(knownOrderIdsRef.current).slice(-150);
      safeStorage.setItem(SEEN_ORDERS_STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }, []);

  // Ensure any running Web Audio oscillator stops immediately if native mode is detected
  useEffect(() => {
    if (suppressWebAudio) {
      orderRingtone.stopRinging();
      setIsRinging(false);
    }
  }, [suppressWebAudio]);

  useEffect(() => {
    const unsubscribe = orderRingtone.subscribe((ring, mute, unlocked) => {
      setIsRinging(suppressWebAudio ? false : ring);
      setIsMuted(mute);
      setIsAudioUnlocked(unlocked);
    });
    return unsubscribe;
  }, [suppressWebAudio]);

  useEffect(() => {
    if (suppressWebAudio) return;

    const handleUserGesture = () => {
      orderRingtone.unlock();
    };

    window.addEventListener('click', handleUserGesture, { passive: true, once: false });
    window.addEventListener('touchstart', handleUserGesture, { passive: true, once: false });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
    };
  }, [suppressWebAudio]);

  useEffect(() => {
    if (!orders || !Array.isArray(orders) || !isLoaded) return;

    const incomingVerifiedOrders = orders.filter(
      o => o && o.status === OrderStatus.PAYMENT_VERIFIED
    );

    if (!isInitialLoadDoneRef.current) {
      orders.forEach(o => {
        if (o?.id) knownOrderIdsRef.current.add(o.id);
      });
      isInitialLoadDoneRef.current = true;
      persistKnownIds();
      return;
    }

    const brandNewIncomingOrders = incomingVerifiedOrders.filter(
      o => !knownOrderIdsRef.current.has(o.id)
    );

    if (brandNewIncomingOrders.length > 0) {
      const targetOrder = brandNewIncomingOrders[0];
      brandNewIncomingOrders.forEach(o => knownOrderIdsRef.current.add(o.id));
      persistKnownIds();
      setActiveAlertOrderId(targetOrder.id);

      // Only play browser Web Audio synthesis when NOT inside the Native Android APK
      if (!suppressWebAudio) {
        orderRingtone.startRinging();
      }
    } else if (activeAlertOrderId) {
      const stillWaiting = incomingVerifiedOrders.some(o => o.id === activeAlertOrderId);
      if (!stillWaiting) {
        orderRingtone.stopRinging();
        setActiveAlertOrderId(null);
      }
    }
  }, [orders, isLoaded, activeAlertOrderId, persistKnownIds, suppressWebAudio]);

  const dismissAlert = useCallback(() => {
    orderRingtone.stopRinging();
    setActiveAlertOrderId(null);
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = orderRingtone.toggleMute();
    setIsMuted(newMuted);
  }, []);

  const testRingtone = useCallback(async () => {
    if (suppressWebAudio) return false;
    return await orderRingtone.playTestTone();
  }, [suppressWebAudio]);

  const unlockAudio = useCallback(async () => {
    if (suppressWebAudio) return true;
    return await orderRingtone.unlock();
  }, [suppressWebAudio]);

  return {
    isRinging,
    isMuted,
    isAudioUnlocked,
    activeAlertOrderId,
    dismissAlert,
    toggleMute,
    testRingtone,
    unlockAudio
  };
}
