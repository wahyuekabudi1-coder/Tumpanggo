/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * usePullToRefresh Hook
 * Provides smooth, native-feeling pull-to-refresh gesture handling for Android WebView and mobile browsers.
 * - Restricts activation strictly to when the scroll container or window is at the top (scrollTop === 0).
 * - Ignores gesture events originating from nested scrollable dialogs, textareas, or inner scroll containers.
 * - Prevents double/concurrent triggers via atomic refreshing guard.
 * - Preserves session tokens, form inputs, and active UI state.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // Minimum pull distance in px to trigger refresh (default: 65)
  maxPull?: number;   // Maximum pull distance in px (default: 95)
  resistance?: number;// Damping factor for natural resistance (default: 0.45)
  disabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 65,
  maxPull = 95,
  resistance = 0.45,
  disabled = false
}: PullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0); // 0.0 to 1.0

  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  // Keep ref updated
  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  // Check if an element or its ancestors is an active nested scrollable container
  const isInsideNestedScroll = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    let el: HTMLElement | null = target;
    while (el && el !== document.body && el !== document.documentElement) {
      // Disqualify interactive inputs, buttons, or scrollable modals
      if (
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'INPUT' ||
        el.tagName === 'SELECT' ||
        el.getAttribute('role') === 'dialog' ||
        el.classList.contains('overflow-y-auto') ||
        el.classList.contains('overflow-y-scroll')
      ) {
        if (el.scrollTop > 0) {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;

    // Only allow when page is at the very top
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollTop > 2) return;

    if (isInsideNestedScroll(e.target)) return;

    if (e.touches.length === 1) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPullingRef.current || disabled || isRefreshingRef.current) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollTop > 2) {
      isPullingRef.current = false;
      setPullDistance(0);
      setPullProgress(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    // Only pull downwards
    if (diff > 0) {
      const damped = Math.min(diff * resistance, maxPull);
      setPullDistance(damped);
      setPullProgress(Math.min(damped / threshold, 1));
      
      // Prevent browser default pull-to-reload if we are handling it
      if (diff > 10 && e.cancelable) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
      setPullProgress(0);
    }
  }, [disabled, maxPull, resistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || disabled || isRefreshingRef.current) {
      isPullingRef.current = false;
      return;
    }

    isPullingRef.current = false;

    if (pullDistance >= threshold) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(48); // Stay at floating indicator height
      try {
        await Promise.resolve(onRefresh());
      } catch (err) {
        console.warn('[PullToRefresh] Refresh operation encountered an issue:', err);
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
          setPullProgress(0);
        }, 300);
      }
    } else {
      // Snap back smoothly
      setPullDistance(0);
      setPullProgress(0);
    }
  }, [disabled, onRefresh, pullDistance, threshold]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    pullDistance,
    pullProgress,
    isRefreshing
  };
}
