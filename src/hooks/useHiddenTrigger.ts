/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Custom hook for the TumpangGo secret portal access trigger.
 * 
 * Rules:
 * - Each portal maintains its own independent in-memory click count starting at 0.
 * - Clicking the copyright text increments the count.
 * - 10 to 13 clicks (inclusive): hidden portal access is displayed / unlocked.
 * - 14th click: hidden access immediately disappears / closes, and counter resets to 0.
 * - No tooltips, clues, or count indicators are displayed.
 * - Never persisted in localStorage or cookies (resets upon page reload).
 */

import { useState, useCallback } from 'react';

export function useHiddenTrigger() {
  const [clickCount, setClickCount] = useState<number>(0);

  const handleCopyrightClick = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setClickCount((prev) => {
      const next = prev + 1;
      if (next >= 14) {
        return 0; // Reset to 0 when reaching 14
      }
      return next;
    });
  }, []);

  const resetTrigger = useCallback(() => {
    setClickCount(0);
  }, []);

  const isUnlocked = clickCount >= 10 && clickCount <= 13;

  return {
    clickCount,
    isUnlocked,
    handleCopyrightClick,
    resetTrigger,
  };
}
