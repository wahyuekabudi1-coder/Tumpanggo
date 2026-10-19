import QRCode from 'qrcode';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateQrisPlacard() {
  const qrisString = '00020101021126580016ID.CO.QRIS.WWW01189360099901234567890215ID10242689512340303UMI51440014ID.LINKAJA.WWW01189360099901234567890215ID10242689512340303UMI5204581253033605802ID5919TUMPANGGO MERCHANT6007MALANG61056515662070703A016304C74A';

  // 1. Generate high-resolution QR matrix buffer
  const qrSvg = await QRCode.toString(qrisString, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  const width = 800;
  const height = 1100;

  // Composite complete SVG layout of standard Indonesian QRIS placard
  const placardSvg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#DC2626"/>
        <stop offset="100%" stop-color="#991B1B"/>
      </linearGradient>
      <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.12"/>
      </filter>
    </defs>

    <!-- Background Card -->
    <rect width="${width}" height="${height}" fill="#ffffff" rx="32"/>
    <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#E2E8F0" stroke-width="3" rx="24"/>

    <!-- Header Section -->
    <rect x="24" y="24" width="${width - 48}" height="130" fill="url(#headerGrad)" rx="18"/>
    
    <!-- QRIS Logo Typography -->
    <text x="50" y="88" font-family="'Space Grotesk', -apple-system, sans-serif" font-weight="900" font-size="52" fill="#ffffff" letter-spacing="-1">QRIS</text>
    <text x="50" y="118" font-family="'Inter', sans-serif" font-weight="700" font-size="14" fill="#FEE2E2" letter-spacing="1">STANDAR PEMBAYARAN NASIONAL</text>

    <!-- GPN Badge -->
    <rect x="${width - 150}" y="52" width="90" height="42" fill="#ffffff" rx="10"/>
    <text x="${width - 105}" y="79" font-family="'Inter', sans-serif" font-weight="900" font-size="20" fill="#DC2626" text-anchor="middle">GPN</text>
    <text x="${width - 105}" y="116" font-family="'Inter', sans-serif" font-weight="700" font-size="11" fill="#FEF2F2" text-anchor="middle">INDONESIA</text>

    <!-- Merchant Details Box -->
    <g transform="translate(0, 180)">
      <text x="${width / 2}" y="32" font-family="'Space Grotesk', -apple-system, sans-serif" font-weight="800" font-size="28" fill="#0F172A" text-anchor="middle" letter-spacing="-0.5">TUMPANGGO MERCHANT</text>
      <text x="${width / 2}" y="60" font-family="'Inter', sans-serif" font-weight="600" font-size="15" fill="#15803D" text-anchor="middle">KECAMATAN TUMPANG, KABUPATEN MALANG</text>
      <text x="${width / 2}" y="88" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="14" fill="#64748B" text-anchor="middle">NMID : ID1024268951234 • A01</text>
    </g>

    <!-- QR Code Inner Frame -->
    <rect x="130" y="300" width="540" height="540" fill="#ffffff" stroke="#CBD5E1" stroke-width="3" rx="20"/>

    <!-- QR Code SVG injection will be done via composite -->

    <!-- Scan Guidance text -->
    <text x="${width / 2}" y="885" font-family="'Inter', sans-serif" font-weight="700" font-size="17" fill="#0F172A" text-anchor="middle">
      SATU QR CODE UNTUK SEMUA APLIKASI PEMBAYARAN
    </text>
    <text x="${width / 2}" y="915" font-family="'Inter', sans-serif" font-weight="500" font-size="13" fill="#64748B" text-anchor="middle">
      Scan dari GoPay, OVO, DANA, ShopeePay, BCA, BRI, Mandiri, BNI, LinkAja &amp; Seluruh m-Banking
    </text>

    <!-- Accepted Channels Badge Bar -->
    <rect x="50" y="945" width="${width - 100}" height="100" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2" rx="16"/>
    
    <text x="${width / 2}" y="985" font-family="'Inter', sans-serif" font-weight="800" font-size="13" fill="#475569" text-anchor="middle" letter-spacing="2">
      BANK &amp; E-WALLET DIDUKUNG
    </text>
    
    <text x="${width / 2}" y="1018" font-family="'Space Grotesk', sans-serif" font-weight="700" font-size="15" fill="#1E293B" text-anchor="middle">
      BCA • MANDIRI • BRI • BNI • GOPAY • OVO • DANA • SHOPEEPAY • LINKAJA
    </text>

    <text x="${width / 2}" y="1075" font-family="'Inter', sans-serif" font-weight="600" font-size="11" fill="#94A3B8" text-anchor="middle">
      Dicetak oleh Platform Pemesanan Makanan tumpangGo • Terdaftar &amp; Diawasi Bank Indonesia
    </text>
  </svg>
  `;

  // Render QR Code as PNG
  const qrPngBuffer = await QRCode.toBuffer(qrisString, {
    type: 'png',
    width: 500,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  // Base Placard from SVG
  const basePlacard = sharp(Buffer.from(placardSvg));

  // Composite QR code on top
  const finalImageBuffer = await basePlacard
    .composite([
      {
        input: qrPngBuffer,
        top: 320,
        left: 150
      }
    ])
    .png({ quality: 95 })
    .toBuffer();

  // Save to target locations:
  // 1. /public/qris-merchant.png (Standard public asset folder for runtime & Vite dev)
  const publicPath = path.resolve(process.cwd(), 'public', 'qris-merchant.png');
  fs.writeFileSync(publicPath, finalImageBuffer);
  console.log('Saved to:', publicPath);

  // 2. /src/assets/images/qris-merchant.png (Bundled asset folder)
  const srcAssetsPath = path.resolve(process.cwd(), 'src', 'assets', 'images', 'qris-merchant.png');
  fs.writeFileSync(srcAssetsPath, finalImageBuffer);
  console.log('Saved to:', srcAssetsPath);

  // 3. /dist/qris-merchant.png (Immediate production output if dist exists)
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    const distPath = path.resolve(distDir, 'qris-merchant.png');
    fs.writeFileSync(distPath, finalImageBuffer);
    console.log('Saved to:', distPath);
  }

  console.log('✅ QRIS Placard generated successfully (800x1100 px).');
}

generateQrisPlacard().catch(err => {
  console.error('Failed to generate QRIS:', err);
  process.exit(1);
});
