/**
 * Automated Verification Script:
 * Revisi CTA & Pusat Bantuan TumpangGo
 */

import fs from 'fs';
import path from 'path';

function runVerification() {
  console.log('====================================================');
  console.log('🚀 AUDIT VERIFIKASI REVISI CTA & PUSAT BANTUAN TUMPANGGO');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Audit public WhatsApp links in CustomerView.tsx
  console.log('📦 1. AUDIT ELIMINASI CTA WHATSAPP PUBLIK');
  const customerViewCode = fs.readFileSync(path.join(process.cwd(), 'src/components/CustomerView.tsx'), 'utf-8');

  // Check that public WhatsApp links are removed
  assert(!customerViewCode.includes('handleOpenWhatsApp'), 'handleOpenWhatsApp telah dihapus sepenuhnya');
  assert(!customerViewCode.includes('https://wa.me/628123456789'), 'Tautan WhatsApp publik https://wa.me/628123456789 dihapus');
  assert(!customerViewCode.includes('https://wa.me/6281234567891'), 'Tautan WhatsApp pembayaran https://wa.me/6281234567891 dihapus');
  assert(!customerViewCode.includes('WhatsApp 0812-3456-7891'), 'Teks WhatsApp 0812-3456-7891 publik dihapus');
  assert(!customerViewCode.includes('Hubungi Administrator di WhatsApp sawahjayagroup@gmail.com'), 'Kontak WhatsApp pribadi mitra dihapus');
  assert(!customerViewCode.includes('WhatsApp Admin'), 'Floating button WhatsApp Admin dihapus');

  // 2. Audit Pusat Bantuan Implementation
  console.log('\n📦 2. AUDIT IMPLEMENTASI PUSAT BANTUAN TUMPANGGO');
  const helpCtaPath = path.join(process.cwd(), 'src/components/HelpCenterCTA.tsx');
  assert(fs.existsSync(helpCtaPath), 'Komponen HelpCenterCTA.tsx tersedia');
  
  const helpCtaCode = fs.readFileSync(helpCtaPath, 'utf-8');
  assert(helpCtaCode.includes('Pusat Bantuan TumpangGo'), 'CTA memuat judul resmi "Pusat Bantuan TumpangGo"');
  assert(helpCtaCode.includes('Punya pertanyaan atau membutuhkan bantuan? Temukan informasi dan panduan menggunakan TumpangGo di sini.'), 'CTA memuat deskripsi resmi yang ditentukan');
  assert(helpCtaCode.includes('Kunjungi Pusat Bantuan'), 'Tombol utama bertuliskan "Kunjungi Pusat Bantuan"');

  const helpCenterPath = path.join(process.cwd(), 'src/components/HelpCenterView.tsx');
  assert(fs.existsSync(helpCenterPath), 'Halaman internal HelpCenterView.tsx tersedia');
  const helpCenterCode = fs.readFileSync(helpCenterPath, 'utf-8');
  assert(helpCenterCode.includes('FAQ_DATABASE'), 'Memuat basis pengetahuan dan FAQ lengkap untuk Pelanggan');
  assert(helpCenterCode.includes('Panduan Kemitraan UMKM'), 'Memuat panduan mitra UMKM untuk bergabung');
  assert(helpCenterCode.includes('Alur Persetujuan & Aktivasi Akun'), 'Memuat panduan pendaftaran dan persetujuan mitra');
  assert(helpCenterCode.includes('Panduan Instalasi & Penggunaan PWA'), 'Memuat panduan penggunaan platform');
  assert(helpCenterCode.includes('Formulir Pelaporan Kendala Resmi'), 'Menyediakan fitur pelaporan kendala interaktif');
  assert(helpCenterCode.includes('admin@tumpanggo.com'), 'Menampilkan kontak resmi terverifikasi');

  // 3. Audit Social Media Buttons
  console.log('\n📦 3. AUDIT TEPAT TIGA TOMBOL MEDIA SOSIAL');
  const socialPath = path.join(process.cwd(), 'src/components/SocialMediaButtons.tsx');
  assert(fs.existsSync(socialPath), 'Komponen SocialMediaButtons.tsx tersedia');
  const socialCode = fs.readFileSync(socialPath, 'utf-8');
  
  assert(socialCode.includes('name: \'TikTok\''), 'Menampilkan platform TikTok');
  assert(socialCode.includes('name: \'Instagram\''), 'Menampilkan platform Instagram');
  assert(socialCode.includes('name: \'Facebook\''), 'Menampilkan platform Facebook');
  assert(!socialCode.includes('twitter') && !socialCode.includes('YouTube') && !socialCode.includes('Telegram'), 'Tidak ada tombol Telegram, X/Twitter, YouTube, atau platform lain');
  assert(socialCode.includes('activeNoticeChannel'), 'Menyediakan proteksi modal informatif bila akun resmi belum dikonfigurasi (anti-halusinasi URL)');

  // 4. Audit CustomerView Navigation & Floating Button
  console.log('\n📦 4. AUDIT NAVIGASI & FLOATING BUTTON CUSTOMER');
  assert(customerViewCode.includes('HelpCenterCTA'), 'HelpCenterCTA dipasang pada alur utama beranda');
  assert(customerViewCode.includes('HelpCenterView'), 'HelpCenterView dirender saat tab bantuan aktif');
  assert(customerViewCode.includes('id="nav-help-center"'), 'Tersedia tombol Bantuan di bilah navigasi bawah');
  assert(customerViewCode.includes('FLOATING PUSAT BANTUAN BUTTON'), 'Tombol mengambang (floating) diubah menjadi tombol Pusat Bantuan');

  console.log('\n====================================================');
  console.log(`🏁 HASIL VERIFIKASI: ${passed} PASS, ${failed} FAIL`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
