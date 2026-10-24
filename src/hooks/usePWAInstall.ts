/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Centralized PWA Installation Manager
 * Unified singleton event bus, prompt lifecycle manager, and manifest synchronizer.
 * Ensures beforeinstallprompt is never lost on navigation, role switching, or re-renders.
 */

import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PWARole = 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN';

// Module-level singleton store so that state persists across component unmounts,
// portal navigation (Customer <-> Merchant <-> Driver <-> Admin), and re-renders.
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalIsInstalled: boolean = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[PWA] Listener callback warning:', e);
    }
  });
}

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://') ||
    new URLSearchParams(window.location.search).get('source') === 'pwa'
  );
}

export function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
}

export function syncPWAManifest(role: PWARole) {
  if (typeof document === 'undefined') return;
  const manifestMap: Record<PWARole, string> = {
    CUSTOMER: '/manifest.json',
    MERCHANT: '/manifest-merchant.json',
    DRIVER: '/manifest-driver.json',
    ADMIN: '/manifest-admin.json',
  };

  const targetHref = manifestMap[role] || '/manifest.json';
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== targetHref) {
    link.setAttribute('href', targetHref);
  }
}

// Global bootstrap for window listeners
if (typeof window !== 'undefined') {
  globalIsInstalled = checkIsStandalone() || Boolean((window as any).__tumpang_app_installed);
  
  if ((window as any).__tumpang_install_prompt) {
    globalDeferredPrompt = (window as any).__tumpang_install_prompt;
  }

  // Intercept and chain index.html event notification bus
  const previousNotify = (window as any).__tumpang_notify_pwa;
  (window as any).__tumpang_notify_pwa = () => {
    if (typeof previousNotify === 'function') {
      try { previousNotify(); } catch {}
    }
    if ((window as any).__tumpang_install_prompt) {
      globalDeferredPrompt = (window as any).__tumpang_install_prompt;
    }
    if ((window as any).__tumpang_app_installed) {
      globalIsInstalled = true;
      globalDeferredPrompt = null;
    }
    notifyListeners();
  };

  // Register window event listeners directly with passive dual redundancy
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    (window as any).__tumpang_install_prompt = e;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    globalIsInstalled = true;
    globalDeferredPrompt = null;
    (window as any).__tumpang_install_prompt = null;
    (window as any).__tumpang_app_installed = true;
    notifyListeners();
  });

  // Watch for display-mode standalone changes in real time
  try {
    const mql = window.matchMedia('(display-mode: standalone)');
    mql.addEventListener('change', (e) => {
      if (e.matches) {
        globalIsInstalled = true;
        globalDeferredPrompt = null;
        notifyListeners();
      }
    });
  } catch {}
}

export function usePWAInstall(role?: PWARole) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined') {
      return globalDeferredPrompt || (window as any).__tumpang_install_prompt || null;
    }
    return null;
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return globalIsInstalled || checkIsStandalone() || Boolean((window as any).__tumpang_app_installed);
    }
    return false;
  });

  const [isIOS] = useState<boolean>(() => checkIsIOS());

  // Automatically synchronize manifest if role is specified
  useEffect(() => {
    if (role) {
      syncPWAManifest(role);
    }
  }, [role]);

  // Subscribe to changes in singleton store
  useEffect(() => {
    const updateState = () => {
      const activePrompt = globalDeferredPrompt || (window as any).__tumpang_install_prompt || null;
      setDeferredPrompt(activePrompt);
      const installed = globalIsInstalled || checkIsStandalone() || Boolean((window as any).__tumpang_app_installed);
      setIsInstalled(installed);
    };

    updateState();
    listeners.add(updateState);
    return () => {
      listeners.delete(updateState);
    };
  }, []);

  const install = async (): Promise<{ outcome: 'accepted' | 'dismissed' | 'unavailable'; accepted: boolean }> => {
    const promptToUse = deferredPrompt || globalDeferredPrompt || (typeof window !== 'undefined' ? (window as any).__tumpang_install_prompt : null);
    if (!promptToUse) {
      return { outcome: 'unavailable', accepted: false };
    }

    try {
      await promptToUse.prompt();
      const choice = await promptToUse.userChoice;

      // Event is consumed by the browser prompt
      globalDeferredPrompt = null;
      if (typeof window !== 'undefined') {
        (window as any).__tumpang_install_prompt = null;
      }
      setDeferredPrompt(null);

      if (choice.outcome === 'accepted') {
        globalIsInstalled = true;
        setIsInstalled(true);
      }
      notifyListeners();
      return { outcome: choice.outcome, accepted: choice.outcome === 'accepted' };
    } catch (err) {
      console.warn('[PWA] Error calling native install prompt:', err);
      globalDeferredPrompt = null;
      if (typeof window !== 'undefined') {
        (window as any).__tumpang_install_prompt = null;
      }
      setDeferredPrompt(null);
      notifyListeners();
      return { outcome: 'unavailable', accepted: false };
    }
  };

  return {
    isInstallable: Boolean(deferredPrompt || globalDeferredPrompt || (typeof window !== 'undefined' && (window as any).__tumpang_install_prompt)),
    isInstalled,
    isIOS,
    install,
    syncManifest: () => {
      if (role) syncPWAManifest(role);
    }
  };
}
