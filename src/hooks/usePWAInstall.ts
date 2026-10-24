/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TumpangGo Centralized PWA Installation Manager
 * Unified singleton event bus, prompt lifecycle manager, and manifest synchronizer.
 * Supports distinct standalone identities for Customer, Merchant, Driver, and Admin.
 * Strictly prevents prompt hijacking (e.g. customer prompt used for merchant).
 */

import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PWARole = 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN';

export function detectCurrentPWARole(): PWARole {
  if (typeof window === 'undefined') return 'CUSTOMER';
  const pathname = window.location.pathname.toLowerCase();
  if (pathname === '/merchant' || pathname.startsWith('/merchant/')) return 'MERCHANT';
  if (pathname === '/driver' || pathname.startsWith('/driver/')) return 'DRIVER';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'ADMIN';

  const search = window.location.search.toLowerCase();
  if (search.includes('role=merchant') || search.includes('portal=merchant')) return 'MERCHANT';
  if (search.includes('role=driver') || search.includes('portal=driver')) return 'DRIVER';
  if (search.includes('role=admin') || search.includes('portal=admin')) return 'ADMIN';

  return 'CUSTOMER';
}

// Module-level segregated prompt store by role
const rolePrompts: Record<PWARole, BeforeInstallPromptEvent | null> = {
  CUSTOMER: null,
  MERCHANT: null,
  DRIVER: null,
  ADMIN: null
};

// Track installation states per role
const roleInstalledMap: Record<PWARole, boolean> = {
  CUSTOMER: false,
  MERCHANT: false,
  DRIVER: false,
  ADMIN: false
};

// Global backward compatibility references
export let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
export let globalIsInstalled: boolean = false;

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

export function checkIsStandalone(targetRole?: PWARole): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone = Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://') ||
    new URLSearchParams(window.location.search).get('source') === 'pwa'
  );

  if (!isStandalone) return false;
  if (!targetRole) return true;

  const currentRole = detectCurrentPWARole();
  return currentRole === targetRole;
}

export function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
}

// Prevent dynamic manifest swaps while the browser is actively presenting or processing an install prompt
let isInstallationInProgress: boolean = false;

export function isInstallPromptActive(): boolean {
  return isInstallationInProgress;
}

export function syncPWAManifest(role: PWARole) {
  if (typeof document === 'undefined') return;
  if (isInstallationInProgress) {
    return;
  }
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
    link.id = 'pwa-manifest-link';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== targetHref) {
    link.setAttribute('href', targetHref);
  }
}

export function getPromptForRole(role: PWARole): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;

  // 1. Direct role prompt in memory
  if (rolePrompts[role]) {
    return rolePrompts[role];
  }

  // 2. From window.__tumpang_prompts bus
  const windowPrompts = (window as any).__tumpang_prompts;
  if (windowPrompts && windowPrompts[role]) {
    rolePrompts[role] = windowPrompts[role];
    return windowPrompts[role];
  }

  // 3. Fallback: Check window.__tumpang_install_prompt only if role matches
  const singlePrompt = (window as any).__tumpang_install_prompt || globalDeferredPrompt;
  if (singlePrompt) {
    const promptRole = (singlePrompt as any).__tumpang_role || detectCurrentPWARole();
    if (promptRole === role) {
      rolePrompts[role] = singlePrompt;
      return singlePrompt;
    }
  }

  return null;
}

// Global bootstrap for window listeners
if (typeof window !== 'undefined') {
  globalIsInstalled = checkIsStandalone() || Boolean((window as any).__tumpang_app_installed);

  const initialRole = detectCurrentPWARole();

  if ((window as any).__tumpang_prompts && (window as any).__tumpang_prompts[initialRole]) {
    rolePrompts[initialRole] = (window as any).__tumpang_prompts[initialRole];
    globalDeferredPrompt = rolePrompts[initialRole];
  } else if ((window as any).__tumpang_install_prompt) {
    const promptRole = (window as any).__tumpang_install_prompt.__tumpang_role || initialRole;
    rolePrompts[promptRole] = (window as any).__tumpang_install_prompt;
    globalDeferredPrompt = (window as any).__tumpang_install_prompt;
  }

  // Intercept and chain index.html event notification bus
  const previousNotify = (window as any).__tumpang_notify_pwa;
  (window as any).__tumpang_notify_pwa = (eventRole?: PWARole) => {
    if (typeof previousNotify === 'function') {
      try { previousNotify(eventRole); } catch {}
    }
    const targetRole = eventRole || detectCurrentPWARole();
    const activeP = (window as any).__tumpang_prompts?.[targetRole] || (window as any).__tumpang_install_prompt;
    if (activeP) {
      rolePrompts[targetRole] = activeP;
      globalDeferredPrompt = activeP;
    }
    if ((window as any).__tumpang_app_installed) {
      roleInstalledMap[targetRole] = true;
      globalIsInstalled = true;
      rolePrompts[targetRole] = null;
      globalDeferredPrompt = null;
    }
    notifyListeners();
  };

  // Register window event listeners directly
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    const capturedRole = detectCurrentPWARole();
    try { (e as any).__tumpang_role = capturedRole; } catch {}
    rolePrompts[capturedRole] = e as BeforeInstallPromptEvent;
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    (window as any).__tumpang_prompts = (window as any).__tumpang_prompts || {};
    (window as any).__tumpang_prompts[capturedRole] = e;
    (window as any).__tumpang_install_prompt = e;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    const installedRole = detectCurrentPWARole();
    roleInstalledMap[installedRole] = true;
    globalIsInstalled = true;
    rolePrompts[installedRole] = null;
    globalDeferredPrompt = null;
    if ((window as any).__tumpang_prompts) {
      (window as any).__tumpang_prompts[installedRole] = null;
    }
    (window as any).__tumpang_install_prompt = null;
    (window as any).__tumpang_app_installed = true;
    notifyListeners();
  });

  // Watch for display-mode standalone changes in real time
  try {
    const mql = window.matchMedia('(display-mode: standalone)');
    mql.addEventListener('change', (e) => {
      if (e.matches) {
        const curRole = detectCurrentPWARole();
        roleInstalledMap[curRole] = true;
        globalIsInstalled = true;
        rolePrompts[curRole] = null;
        globalDeferredPrompt = null;
        notifyListeners();
      }
    });
  } catch {}
}

export function usePWAInstall(role?: PWARole) {
  const targetRole: PWARole = role || detectCurrentPWARole();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    return getPromptForRole(targetRole);
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        checkIsStandalone(targetRole) ||
        roleInstalledMap[targetRole] ||
        (targetRole === 'CUSTOMER' && Boolean((window as any).__tumpang_app_installed))
      );
    }
    return false;
  });

  const [isIOS] = useState<boolean>(() => checkIsIOS());

  // Automatically synchronize manifest if role is specified
  useEffect(() => {
    if (targetRole) {
      syncPWAManifest(targetRole);
    }
  }, [targetRole]);

  // Subscribe to changes in singleton store
  useEffect(() => {
    const updateState = () => {
      const activePrompt = getPromptForRole(targetRole);
      setDeferredPrompt(activePrompt);
      const installed =
        checkIsStandalone(targetRole) ||
        roleInstalledMap[targetRole] ||
        (targetRole === 'CUSTOMER' && Boolean((window as any).__tumpang_app_installed));
      setIsInstalled(installed);
    };

    updateState();
    listeners.add(updateState);
    return () => {
      listeners.delete(updateState);
    };
  }, [targetRole]);

  const isDirectRoute = typeof window !== 'undefined' && (() => {
    const path = window.location.pathname.toLowerCase();
    if (targetRole === 'MERCHANT') return path === '/merchant' || path.startsWith('/merchant/');
    if (targetRole === 'DRIVER') return path === '/driver' || path.startsWith('/driver/');
    if (targetRole === 'ADMIN') return path === '/admin' || path.startsWith('/admin/');
    return path === '/';
  })();

  const openDirectPortalRoute = () => {
    if (typeof window === 'undefined') return;
    const targetMap: Record<PWARole, string> = {
      CUSTOMER: '/',
      MERCHANT: '/merchant',
      DRIVER: '/driver',
      ADMIN: '/admin'
    };
    const dest = targetMap[targetRole] || '/';
    if (window.location.pathname !== dest) {
      window.location.href = dest;
    } else {
      window.location.reload();
    }
  };

  const install = async (): Promise<{ outcome: 'accepted' | 'dismissed' | 'unavailable'; accepted: boolean }> => {
    const promptToUse = getPromptForRole(targetRole);
    if (!promptToUse) {
      return { outcome: 'unavailable', accepted: false };
    }

    try {
      isInstallationInProgress = true;
      await promptToUse.prompt();
      const choice = await promptToUse.userChoice;

      // Event is consumed by the browser prompt
      rolePrompts[targetRole] = null;
      if (globalDeferredPrompt === promptToUse) {
        globalDeferredPrompt = null;
      }
      if (typeof window !== 'undefined') {
        if ((window as any).__tumpang_prompts) {
          (window as any).__tumpang_prompts[targetRole] = null;
        }
        if ((window as any).__tumpang_install_prompt === promptToUse) {
          (window as any).__tumpang_install_prompt = null;
        }
      }
      setDeferredPrompt(null);

      if (choice.outcome === 'accepted') {
        roleInstalledMap[targetRole] = true;
        setIsInstalled(true);
      }
      notifyListeners();
      return { outcome: choice.outcome, accepted: choice.outcome === 'accepted' };
    } catch (err) {
      console.warn(`[PWA] Error calling native install prompt for ${targetRole}:`, err);
      rolePrompts[targetRole] = null;
      if (globalDeferredPrompt === promptToUse) {
        globalDeferredPrompt = null;
      }
      setDeferredPrompt(null);
      notifyListeners();
      return { outcome: 'unavailable', accepted: false };
    } finally {
      setTimeout(() => {
        isInstallationInProgress = false;
      }, 1500);
    }
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isDirectRoute,
    targetRole,
    install,
    openDirectPortalRoute,
    syncManifest: () => {
      syncPWAManifest(targetRole);
    }
  };
}
