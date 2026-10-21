/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * useCookingCountdown Hook
 * Provides synchronized 1-second ticks for deterministic cooking timers.
 * Handles tab visibility changes, wakeups, and ensures clean interval teardown.
 */

import { useState, useEffect } from 'react';
import { calculateRemainingCooking, CookingCountdownResult } from '../utils/cookingTimer';
import { Order } from '../types';

/**
 * Hook for a single order's live cooking countdown
 */
export function useCookingCountdown(order: Order | null | undefined): CookingCountdownResult {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    // Immediate sync on mount or order change
    setNow(Date.now());

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [order?.id, order?.cookingEndsAt, order?.cookingStartedAt, order?.status]);

  return calculateRemainingCooking(order, now);
}

/**
 * Hook for a global 1-second clock across multiple order cards
 * Useful to avoid spawning dozens of setInterval calls on dashboard lists.
 */
export function useCookingTicker(): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
      }
    };

    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, []);

  return now;
}
