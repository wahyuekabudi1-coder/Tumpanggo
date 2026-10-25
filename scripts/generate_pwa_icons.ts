import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateIcons() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const merchantAsset = path.resolve(publicDir, 'assets/aistudio/merchant-logo-apk_9bdc71d9.png');

  // Render Merchant PNGs from official authentic asset with safe-zone compliance
  if (fs.existsSync(merchantAsset)) {
    await sharp(merchantAsset)
      .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, 'pwa-merchant-192x192.png'));

    await sharp(merchantAsset)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, 'pwa-merchant-512x512.png'));

    await sharp(merchantAsset)
      .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, 'apple-touch-icon-merchant.png'));

    // Safe zone maskable (diameter ~360px on 512x512 white background)
    const resizedForSafeZone = await sharp(merchantAsset)
      .resize(360, 360, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: resizedForSafeZone, top: 76, left: 76 }])
      .png()
      .toFile(path.join(publicDir, 'pwa-merchant-maskable-512x512.png'));
  }

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
