/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hook for managing new incoming order ringtone alerts in TumpangGo Food Merchant.
 * Features:
 * - Strict Deduplication:
 *   - Seeds known order IDs on initial mount & persists them to safeStorage so refreshes do NOT ring
 *   - Status changes or existing orders never trigger mass ringing
 * - Automatically rings phone call cadence when a NEW order with PAYMENT_VERIFIED status arrives
 * - Automatically stops when the order is handled (moved to COOKING/READY/CANCELLED)
 * - Auto-unlocks AudioContext on user first interaction
 * - Provides dismiss/mute/unmute and sound test controls
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Order, OrderStatus } from '../types.ts';
import { orderRingtone } from '../utils/orderRingtone.ts';
import { safeStorage } from '../utils/safeStorage.ts';

const SEEN_ORDERS_STORAGE_KEY = 'tumpang_seen_order_ids';

export function useOrderRingtone(orders: Order[], isLoaded: boolean = true) {
  const [isRinging, setIsRinging] = useState<boolean>(() => orderRingtone.isRinging());
  const [isMuted, setIsMuted] = useState<boolean>(() => orderRingtone.isMuted());
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(() => orderRingtone.isUnlocked());
  const [activeAlertOrderId, setActiveAlertOrderId] = useState<string | null>(null);

  // Set of known order IDs that have already been seen/processed
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

  // Helper to persist known IDs (keep up to 150 latest IDs)
  const persistKnownIds = useCallback(() => {
    try {
      const arr = Array.from(knownOrderIdsRef.current).slice(-150);
      safeStorage.setItem(SEEN_ORDERS_STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }, []);

  // Subscribe to audio player state
  useEffect(() => {
    const unsubscribe = orderRingtone.subscribe((ring, mute, unlocked) => {
      setIsRinging(ring);
      setIsMuted(mute);
      setIsAudioUnlocked(unlocked);
    });
    return unsubscribe;
  }, []);

  // Listen for user gestures to unlock AudioContext proactively
  useEffect(() => {
    const handleUserGesture = () => {
      orderRingtone.unlock();
    };

    window.addEventListener('click', handleUserGesture, { passive: true, once: false });
    window.addEventListener('touchstart', handleUserGesture, { passive: true, once: false });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
    };
  }, []);

  // Monitor incoming orders with strict deduplication
  useEffect(() => {
    if (!orders || !Array.isArray(orders)) return;

    // Do nothing until initial data fetch completes
    if (!isLoaded) return;

    // Filter incoming orders that require kitchen attention (PAYMENT_VERIFIED)
    const incomingVerifiedOrders = orders.filter(
      o => o && o.status === OrderStatus.PAYMENT_VERIFIED
    );

    // Initial mount: record all currently existing orders without ringing
    if (!isInitialLoadDoneRef.current) {
      orders.forEach(o => {
        if (o?.id) knownOrderIdsRef.current.add(o.id);
      });
      isInitialLoadDoneRef.current = true;
      persistKnownIds();
      return;
    }

    // Subsequent updates: check for brand new incoming verified orders
    const brandNewIncomingOrders = incomingVerifiedOrders.filter(
      o => !knownOrderIdsRef.current.has(o.id)
    );

    if (brandNewIncomingOrders.length > 0) {
      // Found new incoming order!
      const targetOrder = brandNewIncomingOrders[0];
      // Mark as seen so we don't re-trigger continuously
      brandNewIncomingOrders.forEach(o => knownOrderIdsRef.current.add(o.id));
      persistKnownIds();
      setActiveAlertOrderId(targetOrder.id);

      // Start ringing telephone ringtone
      orderRingtone.startRinging();
    } else {
      // Check if the order that was ringing is still in PAYMENT_VERIFIED status
      if (activeAlertOrderId) {
        const stillWaiting = incomingVerifiedOrders.some(o => o.id === activeAlertOrderId);
        if (!stillWaiting) {
          // The order has been accepted/cooked or cancelled -> stop ringing
          orderRingtone.stopRinging();
          setActiveAlertOrderId(null);
        }
      }
    }
  }, [orders, isLoaded, activeAlertOrderId, persistKnownIds]);

  // Dismiss / silence current ring
  const dismissAlert = useCallback(() => {
    orderRingtone.stopRinging();
    setActiveAlertOrderId(null);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = orderRingtone.toggleMute();
    setIsMuted(newMuted);
  }, []);

  // Test ringtone
  const testRingtone = useCallback(async () => {
    return await orderRingtone.playTestTone();
  }, []);

  // Request audio permission / unlock
  const unlockAudio = useCallback(async () => {
    return await orderRingtone.unlock();
  }, []);

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
