import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ShoppingBag, ArrowRight, ChevronRight, ChevronLeft, GripVertical } from 'lucide-react';
import { Merchant, OrderItem } from '../types.ts';

interface FloatingCartProps {
  cart: OrderItem[];
  cartMerchant: Merchant | null;
  subtotal: number;
  onCheckout: () => void;
}

export default function FloatingCart({ cart, cartMerchant, subtotal, onCheckout }: FloatingCartProps) {
  // State: 'expanded' (full bottom bar) | 'docked-right' (compact right-side badge)
  const [isDockedRight, setIsDockedRight] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tumpang_cart_docked') === 'true';
    } catch {
      return false;
    }
  });

  // Free drag offset { x, y } in px
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    pointerId: number;
    hasMoved: boolean;
    startTime: number;
  }>({
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointerId: -1,
    hasMoved: false,
    startTime: 0
  });

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Sync docked state to localStorage
  const setDockedMode = useCallback((docked: boolean) => {
    setIsDockedRight(docked);
    setDragOffset({ x: 0, y: 0 });
    try {
      localStorage.setItem('tumpang_cart_docked', String(docked));
    } catch {}
  }, []);

  // Clamping helper ensuring the cart never moves outside viewport
  const clampOffset = (targetX: number, targetY: number) => {
    if (typeof window === 'undefined') return { x: targetX, y: targetY };
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    // Estimate container bounds
    const rect = containerRef.current?.getBoundingClientRect();
    const elemWidth = rect?.width || 320;
    const elemHeight = rect?.height || 64;

    // Limit horizontal: can drag from left margin to right edge
    const maxRight = Math.max(0, (winWidth - elemWidth) / 2 + 100);
    const maxLeft = -Math.max(0, (winWidth - elemWidth) / 2 + 20);

    // Limit vertical: between top bar (~80px) and bottom nav (~75px)
    const maxUp = -(winHeight - 200);
    const maxDown = 20;

    return {
      x: Math.max(maxLeft, Math.min(maxRight, targetX)),
      y: Math.max(maxUp, Math.min(maxDown, targetY))
    };
  };

  // Handle pointer down (mouse or touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return;

    // Check if clicked element is an interactive button
    const target = e.target as HTMLElement;
    if (target.closest('button[data-no-drag="true"]')) {
      return;
    }

    const pointerId = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(pointerId);
    } catch {}

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: dragOffset.x,
      startOffsetY: dragOffset.y,
      pointerId,
      hasMoved: false,
      startTime: Date.now()
    };
    setIsDragging(true);
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || dragStartRef.current.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    const dist = Math.hypot(deltaX, deltaY);

    if (dist > 6) {
      dragStartRef.current.hasMoved = true;
    }

    if (dragStartRef.current.hasMoved) {
      const rawX = dragStartRef.current.startOffsetX + deltaX;
      const rawY = dragStartRef.current.startOffsetY + deltaY;
      const clamped = clampOffset(rawX, rawY);
      setDragOffset(clamped);
    }
  };

  // Handle pointer up
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || dragStartRef.current.pointerId !== e.pointerId) return;
    setIsDragging(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const deltaX = e.clientX - dragStartRef.current.startX;
    const elapsed = Date.now() - dragStartRef.current.startTime;
    const velocityX = deltaX / (elapsed || 1); // px per ms

    // If swipe right detected (fast swipe or dragged > 90px to the right)
    if (deltaX > 90 || velocityX > 0.45) {
      setDockedMode(true);
      return;
    }

    // If swiped left from docked state (dragged < -70px or fast swipe left)
    if (isDockedRight && (deltaX < -70 || velocityX < -0.45)) {
      setDockedMode(false);
      return;
    }

    // If user dragged slightly but didn't trigger swipe threshold:
    // Settle cleanly: if released far to the right (> 70px), dock to right; otherwise snap back to center
    if (dragOffset.x > 70) {
      setDockedMode(true);
    } else {
      setDragOffset(prev => ({ x: 0, y: prev.y }));
    }
  };

  // Handle checkout click with drag guard
  const handleCheckoutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragStartRef.current.hasMoved) {
      return; // Suppress checkout if pointer was dragging
    }
    onCheckout();
  };

  // Format currency
  const formattedSubtotal = subtotal.toLocaleString('id-ID');
  const merchantShortName = cartMerchant?.name?.split(' ')[0] || 'Toko';

  // DOCKED RIGHT MODE: Compact, unobtrusive floating pill docked to the right edge
  if (isDockedRight) {
    return (
      <aside
        ref={containerRef}
        aria-label="Keranjang Belanja Mengambang"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setIsDragging(false)}
        style={{
          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
          touchAction: 'none'
        }}
        className={`fixed bottom-[76px] right-3 z-[100] flex items-center select-none cursor-grab active:cursor-grabbing transition-transform duration-150 ${
          isDragging ? 'shadow-2xl scale-105' : 'shadow-xl'
        }`}
      >
        <div className="bg-slate-900/95 text-white pl-2 pr-3 py-2 rounded-full border border-slate-700/80 backdrop-blur-md flex items-center gap-2 shadow-2xl hover:bg-slate-900 transition-colors">
          {/* Expand Button / Left Arrow */}
          <button
            type="button"
            data-no-drag="true"
            onClick={(e) => {
              e.stopPropagation();
              setDockedMode(false);
            }}
            title="Perluas Keranjang"
            aria-label="Perluas Keranjang"
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Cart Bag Icon with Item Count Badge */}
          <div 
            onClick={() => setDockedMode(false)}
            className="relative flex items-center cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-rose-600/30 text-rose-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-slate-900">
              {itemCount}
            </span>
          </div>

          {/* Subtotal & Merchant */}
          <div 
            onClick={() => setDockedMode(false)}
            className="flex flex-col cursor-pointer pr-1"
          >
            <span className="text-[9px] uppercase font-bold text-rose-300 tracking-wider leading-none">
              {merchantShortName}
            </span>
            <span className="text-xs font-bold text-white leading-tight">
              Rp {formattedSubtotal}
            </span>
          </div>

          {/* Direct Checkout Action Button */}
          <button
            type="button"
            data-no-drag="true"
            onClick={handleCheckoutClick}
            className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-all flex items-center gap-1 shadow-md shadow-rose-600/20 cursor-pointer"
          >
            <span>Bayar</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </aside>
    );
  }

  // EXPANDED MODE: Full Floating Cart Bar with safe bottom clearance and drag handles
  return (
    <aside
      ref={containerRef}
      aria-label="Keranjang Belanja Mengambang"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setIsDragging(false)}
      style={{
        transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        touchAction: 'none'
      }}
      className={`fixed bottom-[76px] left-4 right-4 max-w-sm mx-auto z-[100] select-none transition-transform duration-100 ${
        isDragging ? 'scale-[1.02] shadow-2xl cursor-grabbing' : 'shadow-xl cursor-grab'
      }`}
    >
      <div className="bg-slate-900/95 text-white p-3 sm:p-3.5 rounded-2xl border border-slate-700/80 backdrop-blur-md flex items-center justify-between gap-2 shadow-2xl">
        {/* Left Drag Indicator & Icon */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            title="Tahan & geser untuk memindahkan ke samping"
            className="text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing p-0.5 rounded touch-none flex flex-col items-center justify-center"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          <div className="p-2 bg-white/10 rounded-xl relative shrink-0">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-slate-900">
              {itemCount}
            </span>
          </div>

          <div className="flex flex-col min-w-0 pr-1">
            <span className="text-[10px] uppercase font-bold text-rose-300 tracking-wider truncate">
              Keranjang {merchantShortName}
            </span>
            <span className="text-xs font-semibold text-white truncate">
              {itemCount} Menu • Rp {formattedSubtotal}
            </span>
          </div>
        </div>

        {/* Right Actions: Quick Dock Button & Checkout Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Dock / Swipe-to-Right Shortcut Button */}
          <button
            type="button"
            data-no-drag="true"
            onClick={(e) => {
              e.stopPropagation();
              setDockedMode(true);
            }}
            title="Geser ke samping kanan agar tidak menghalangi menu"
            aria-label="Sembunyikan keranjang ke sisi kanan"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Checkout Button */}
          <button
            type="button"
            data-no-drag="true"
            onClick={handleCheckoutClick}
            className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1 shadow-md shadow-rose-600/20 cursor-pointer"
          >
            <span>Checkout</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
