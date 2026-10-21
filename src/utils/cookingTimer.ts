/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cooking Countdown & Timer Utilities for TumpangGo Food
 * Provides deterministic time calculations, WIB timezone formatters,
 * and safe fallback handlers for legacy orders.
 */

export const ALLOWED_COOKING_DURATIONS = [15, 30, 45, 60] as const;
export type CookingDurationMinutes = typeof ALLOWED_COOKING_DURATIONS[number];

export function isValidCookingDuration(val: any): val is CookingDurationMinutes {
  const num = Number(val);
  return ALLOWED_COOKING_DURATIONS.includes(num as CookingDurationMinutes);
}

/**
 * Formats a duration in seconds to MM:SS string (e.g., 900 -> "15:00", 65 -> "01:05")
 */
export function formatCookingTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) {
    return '00:00';
  }
  const safeSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats an ISO date/timestamp to a localized WIB time string: "16.30 WIB"
 */
export function formatWibTime(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    
    // Format strictly in Asia/Jakarta timezone
    const timeStr = d.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(':', '.');

    return `${timeStr} WIB`;
  } catch {
    return '-';
  }
}

export interface CookingCountdownResult {
  remainingSeconds: number;
  formattedRemaining: string;
  isExpired: boolean;
  estimatedEndTime: string;
  durationMinutes: number;
  percentElapsed: number;
  hasStarted: boolean;
}

/**
 * Computes deterministic countdown from server timestamps.
 * Falls back gracefully for legacy orders without cookingStartedAt/cookingEndsAt.
 */
export function calculateRemainingCooking(
  order: {
    cookingStartedAt?: string | null;
    cookingEndsAt?: string | null;
    cookingDurationMinutes?: number | null;
    cookingTimeMinutes?: number | null;
    createdAt?: string;
    updatedAt?: string;
    status?: string;
  } | null | undefined,
  nowTimestamp: number = Date.now()
): CookingCountdownResult {
  const defaultDuration = 15;
  if (!order) {
    return {
      remainingSeconds: 0,
      formattedRemaining: '00:00',
      isExpired: true,
      estimatedEndTime: '-',
      durationMinutes: defaultDuration,
      percentElapsed: 100,
      hasStarted: false
    };
  }

  const durationMinutes = Number(
    order.cookingDurationMinutes || order.cookingTimeMinutes || defaultDuration
  );

  let endTimeMs: number;
  let hasValidServerTimestamps = false;

  if (order.cookingEndsAt) {
    const parsed = new Date(order.cookingEndsAt).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      endTimeMs = parsed;
      hasValidServerTimestamps = true;
    } else {
      endTimeMs = nowTimestamp;
    }
  } else if (order.cookingStartedAt) {
    const parsedStart = new Date(order.cookingStartedAt).getTime();
    if (!isNaN(parsedStart) && parsedStart > 0) {
      endTimeMs = parsedStart + durationMinutes * 60 * 1000;
      hasValidServerTimestamps = true;
    } else {
      endTimeMs = nowTimestamp;
    }
  } else {
    // Backward compatibility for legacy orders in COOKING status
    const baseTime = order.updatedAt || order.createdAt;
    const parsedBase = baseTime ? new Date(baseTime).getTime() : NaN;
    if (!isNaN(parsedBase) && parsedBase > 0) {
      endTimeMs = parsedBase + durationMinutes * 60 * 1000;
    } else {
      endTimeMs = nowTimestamp;
    }
  }

  const remainingMs = endTimeMs - nowTimestamp;
  const isExpired = remainingMs <= 0;
  const remainingSeconds = isExpired ? 0 : Math.floor(remainingMs / 1000);
  const totalDurationSeconds = Math.max(1, durationMinutes * 60);
  const elapsedSeconds = Math.max(0, totalDurationSeconds - remainingSeconds);
  const percentElapsed = Math.min(100, Math.max(0, Math.round((elapsedSeconds / totalDurationSeconds) * 100)));

  return {
    remainingSeconds,
    formattedRemaining: formatCookingTime(remainingSeconds),
    isExpired,
    estimatedEndTime: formatWibTime(endTimeMs),
    durationMinutes,
    percentElapsed,
    hasStarted: hasValidServerTimestamps || Boolean(order.cookingStartedAt || order.cookingEndsAt)
  };
}
