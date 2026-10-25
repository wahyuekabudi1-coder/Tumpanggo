/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PullToRefreshIndicator Component
 * Renders an Android Material-inspired floating circular pull-to-refresh badge.
 */

import React from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  pullProgress: number;
  isRefreshing: boolean;
}

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullDistance,
  pullProgress,
  isRefreshing
}) => {
  if (pullDistance <= 0 && !isRefreshing) return null;

  const isTriggered = pullProgress >= 1;

  return (
    <div 
      className="fixed left-0 right-0 top-0 flex justify-center z-50 pointer-events-none transition-transform duration-100 ease-out"
      style={{
        transform: `translateY(${Math.max(pullDistance, 0) + 8}px)`
      }}
      aria-hidden="true"
    >
      <div className={`w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200/80 flex items-center justify-center transition-all ${
        isTriggered || isRefreshing ? 'scale-105 border-emerald-500' : 'scale-95'
      }`}>
        {isRefreshing ? (
          <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
        ) : (
          <ArrowDown 
            className={`w-4 h-4 transition-transform duration-150 ${
              isTriggered ? 'text-emerald-600 rotate-180' : 'text-slate-500'
            }`}
            style={{
              transform: `rotate(${Math.min(pullProgress * 180, 180)}deg)`
            }}
          />
        )}
      </div>
    </div>
  );
};
