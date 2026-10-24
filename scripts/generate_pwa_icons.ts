import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateIcons() {
  const publicDir = path.resolve(process.cwd(), 'public');

  // 1. Merchant Icon SVG
  const merchantSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="merchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#064E3B" />
        <stop offset="50%" stop-color="#047857" />
        <stop offset="100%" stop-color="#0F766E" />
      </linearGradient>
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FDE047" />
        <stop offset="100%" stop-color="#F59E0B" />
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.3" />
      </filter>
    </defs>
    <!-- Background rounded rect -->
    <rect width="512" height="512" rx="108" fill="url(#merchGrad)" />
    <!-- Subtle Inner Border -->
    <rect x="16" y="16" width="480" height="480" rx="92" fill="none" stroke="#34D399" stroke-width="6" stroke-opacity="0.4" />
    
    <!-- Central Storefront Icon in Safe Zone -->
    <g transform="translate(136, 100)" filter="url(#shadow)">
      <!-- Store Roof / Canopy -->
      <path d="M 120 10 L 220 70 L 20 70 Z" fill="url(#goldGrad)" />
      <path d="M 20 70 L 20 95 C 20 108 32 118 45 118 C 58 118 70 108 70 95 C 70 108 82 118 95 118 C 108 118 120 108 120 95 C 120 108 132 118 145 118 C 158 118 170 108 170 95 C 170 108 182 118 195 118 C 208 118 220 108 220 95 L 220 70 Z" fill="#FFFFFF" />
      <!-- Store Walls -->
      <rect x="35" y="118" width="170" height="110" fill="#FFFFFF" rx="8" />
      <!-- Store Door -->
      <rect x="95" y="148" width="50" height="80" fill="#047857" rx="6" />
      <!-- Store Window -->
      <rect x="50" y="148" width="35" height="40" fill="#34D399" rx="4" />
      <rect x="155" y="148" width="35" height="40" fill="#34D399" rx="4" />
      <!-- Chef Hat Emblem above roof -->
      <circle cx="120" cy="30" r="14" fill="#FFFFFF" />
      <circle cx="106" cy="35" r="11" fill="#FFFFFF" />
      <circle cx="134" cy="35" r="11" fill="#FFFFFF" />
    </g>

    <!-- Merchant Badge Ribbon -->
    <g transform="translate(96, 360)">
      <rect width="320" height="72" rx="36" fill="#F59E0B" filter="url(#shadow)" />
      <rect x="3" y="3" width="314" height="66" rx="33" fill="#D97706" />
      <text x="160" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="30" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">MERCHANT</text>
    </g>
  </svg>
  `;

  // 1b. Merchant Maskable SVG (Extra safe margin)
  const merchantMaskableSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="merchGradM" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#064E3B" />
        <stop offset="50%" stop-color="#047857" />
        <stop offset="100%" stop-color="#0F766E" />
      </linearGradient>
      <linearGradient id="goldGradM" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FDE047" />
        <stop offset="100%" stop-color="#F59E0B" />
      </linearGradient>
    </defs>
    <!-- Full bleed for maskable cropping -->
    <rect width="512" height="512" fill="url(#merchGradM)" />
    
    <!-- Central Icon scaled within 70% safe circle -->
    <g transform="translate(156, 125) scale(0.85)">
      <!-- Store Roof -->
      <path d="M 120 10 L 220 70 L 20 70 Z" fill="url(#goldGradM)" />
      <path d="M 20 70 L 20 95 C 20 108 32 118 45 118 C 58 118 70 108 70 95 C 70 108 82 118 95 118 C 108 118 120 108 120 95 C 120 108 132 118 145 118 C 158 118 170 108 170 95 C 170 108 182 118 195 118 C 208 118 220 108 220 95 L 220 70 Z" fill="#FFFFFF" />
      <!-- Store Walls -->
      <rect x="35" y="118" width="170" height="110" fill="#FFFFFF" rx="8" />
      <!-- Store Door -->
      <rect x="95" y="148" width="50" height="80" fill="#047857" rx="6" />
      <!-- Store Window -->
      <rect x="50" y="148" width="35" height="40" fill="#34D399" rx="4" />
      <rect x="155" y="148" width="35" height="40" fill="#34D399" rx="4" />
      <!-- Chef Hat -->
      <circle cx="120" cy="30" r="14" fill="#FFFFFF" />
      <circle cx="106" cy="35" r="11" fill="#FFFFFF" />
      <circle cx="134" cy="35" r="11" fill="#FFFFFF" />
    </g>

    <!-- Merchant Badge Ribbon inside safe zone -->
    <g transform="translate(126, 350) scale(0.82)">
      <rect width="320" height="72" rx="36" fill="#D97706" />
      <text x="160" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="30" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">MERCHANT</text>
    </g>
  </svg>
  `;

  // 2. Driver Icon SVG
  const driverSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="driverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#020617" />
        <stop offset="50%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#1E293B" />
      </linearGradient>
      <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8" />
        <stop offset="100%" stop-color="#0284C7" />
      </linearGradient>
      <linearGradient id="greenAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4ADE80" />
        <stop offset="100%" stop-color="#16A34A" />
      </linearGradient>
      <filter id="shadowD" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.4" />
      </filter>
    </defs>
    <!-- Background rounded rect -->
    <rect width="512" height="512" rx="108" fill="url(#driverGrad)" />
    <!-- Subtle Inner Border -->
    <rect x="16" y="16" width="480" height="480" rx="92" fill="none" stroke="#38BDF8" stroke-width="6" stroke-opacity="0.3" />
    
    <!-- Central Motorcycle / Delivery Emblem in Safe Zone -->
    <g transform="translate(116, 95)" filter="url(#shadowD)">
      <!-- Rear Wheel -->
      <circle cx="55" cy="175" r="42" fill="none" stroke="#FFFFFF" stroke-width="18" />
      <circle cx="55" cy="175" r="16" fill="#38BDF8" />
      <!-- Front Wheel -->
      <circle cx="225" cy="175" r="42" fill="none" stroke="#FFFFFF" stroke-width="18" />
      <circle cx="225" cy="175" r="16" fill="#38BDF8" />
      <!-- Motorcycle Frame / Scooter Body -->
      <path d="M 55 175 L 115 175 L 155 125 L 205 125 L 225 175" fill="none" stroke="#22C55E" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 125 125 L 140 75 L 185 75" fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" />
      <!-- Delivery Food Box / Carrier on rear rack -->
      <rect x="40" y="80" width="65" height="60" rx="10" fill="url(#cyanGrad)" />
      <!-- Speed lines -->
      <line x1="10" y1="100" x2="30" y2="100" stroke="#38BDF8" stroke-width="6" stroke-linecap="round" />
      <line x1="5" y1="120" x2="25" y2="120" stroke="#38BDF8" stroke-width="6" stroke-linecap="round" />
      <!-- Courier Helmet -->
      <circle cx="160" cy="55" r="24" fill="#FFFFFF" />
      <path d="M 160 40 Q 184 45 178 65 Q 160 65 160 40 Z" fill="#38BDF8" />
    </g>

    <!-- Driver Badge Ribbon -->
    <g transform="translate(96, 360)">
      <rect width="320" height="72" rx="36" fill="url(#greenAccent)" filter="url(#shadowD)" />
      <text x="160" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="30" fill="#020617" text-anchor="middle" letter-spacing="5">DRIVER</text>
    </g>
  </svg>
  `;

  // 2b. Driver Maskable SVG
  const driverMaskableSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="driverGradM" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#020617" />
        <stop offset="50%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#1E293B" />
      </linearGradient>
      <linearGradient id="cyanGradM" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8" />
        <stop offset="100%" stop-color="#0284C7" />
      </linearGradient>
      <linearGradient id="greenAccentM" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4ADE80" />
        <stop offset="100%" stop-color="#16A34A" />
      </linearGradient>
    </defs>
    <!-- Full bleed for maskable cropping -->
    <rect width="512" height="512" fill="url(#driverGradM)" />
    
    <!-- Central Icon scaled within safe zone -->
    <g transform="translate(136, 120) scale(0.85)">
      <!-- Wheels -->
      <circle cx="55" cy="175" r="42" fill="none" stroke="#FFFFFF" stroke-width="18" />
      <circle cx="55" cy="175" r="16" fill="#38BDF8" />
      <circle cx="225" cy="175" r="42" fill="none" stroke="#FFFFFF" stroke-width="18" />
      <circle cx="225" cy="175" r="16" fill="#38BDF8" />
      <!-- Frame -->
      <path d="M 55 175 L 115 175 L 155 125 L 205 125 L 225 175" fill="none" stroke="#22C55E" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 125 125 L 140 75 L 185 75" fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" />
      <!-- Delivery Food Box -->
      <rect x="40" y="80" width="65" height="60" rx="10" fill="url(#cyanGradM)" />
      <!-- Helmet -->
      <circle cx="160" cy="55" r="24" fill="#FFFFFF" />
      <path d="M 160 40 Q 184 45 178 65 Q 160 65 160 40 Z" fill="#38BDF8" />
    </g>

    <!-- Driver Badge Ribbon inside safe zone -->
    <g transform="translate(126, 350) scale(0.82)">
      <rect width="320" height="72" rx="36" fill="url(#greenAccentM)" />
      <text x="160" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="30" fill="#020617" text-anchor="middle" letter-spacing="5">DRIVER</text>
    </g>
  </svg>
  `;

  // Render Merchant PNGs
  const merchBuffer = Buffer.from(merchantSvg);
  const merchMaskableBuffer = Buffer.from(merchantMaskableSvg);

  await sharp(merchBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'pwa-merchant-192x192.png'));
  await sharp(merchBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa-merchant-512x512.png'));
  await sharp(merchMaskableBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa-merchant-maskable-512x512.png'));
  await sharp(merchBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon-merchant.png'));

  // Render Driver PNGs
  const driverBuffer = Buffer.from(driverSvg);
  const driverMaskableBuffer = Buffer.from(driverMaskableSvg);

  await sharp(driverBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'pwa-driver-192x192.png'));
  await sharp(driverBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa-driver-512x512.png'));
  await sharp(driverMaskableBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa-driver-maskable-512x512.png'));
  await sharp(driverBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon-driver.png'));

  console.log('✅ Generated Merchant & Driver PWA icons (192, 512, maskable, apple-touch-icon)!');
}

generateIcons().catch(console.error);
