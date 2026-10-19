/**
 * Automated SEO Audit Verification Script for TumpangGo
 */

import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

console.log('=== AUDIT & VERIFIKASI SEO TUMPANGGO ===\n');

// 1. Audit index.html
console.log('1. Audit Technical SEO pada index.html:');
const indexPath = path.resolve(process.cwd(), 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');

assert(indexHtml.includes('<title>TumpangGo – Saatnya Usaha Lokal Naik Kelas'), 'Title tag mengandung pesan brand utama "Saatnya Usaha Lokal Naik Kelas"');
assert(indexHtml.includes('name="description"'), 'Meta description terpasang');
assert(indexHtml.includes('name="keywords"'), 'Meta keywords terpasang');
assert(indexHtml.includes('name="robots" content="index, follow'), 'Meta robots terkonfigurasi index, follow');
assert(indexHtml.includes('rel="canonical" href="https://tumpanggo.com/"'), 'Canonical tag terpasang');
assert(indexHtml.includes('property="og:title"'), 'OpenGraph og:title terpasang');
assert(indexHtml.includes('property="og:description"'), 'OpenGraph og:description terpasang');
assert(indexHtml.includes('property="og:image"'), 'OpenGraph og:image terpasang');
assert(indexHtml.includes('property="og:locale" content="id_ID"'), 'OpenGraph locale Indonesia terpasang');
assert(indexHtml.includes('name="twitter:card" content="summary_large_image"'), 'Twitter card summary_large_image terpasang');

// JSON-LD validation
assert(indexHtml.includes('"@type": "WebSite"'), 'JSON-LD WebSite schema terpasang');
assert(indexHtml.includes('"@type": "Organization"'), 'JSON-LD Organization schema terpasang');
assert(indexHtml.includes('"@type": "FoodEstablishment"'), 'JSON-LD FoodEstablishment schema terpasang');
assert(indexHtml.includes('"@type": "FAQPage"'), 'JSON-LD FAQPage schema terpasang');

// 2. Audit robots.txt
console.log('\n2. Audit robots.txt:');
const robotsPath = path.resolve(process.cwd(), 'public/robots.txt');
assert(fs.existsSync(robotsPath), 'public/robots.txt file tersedia');
const robotsTxt = fs.readFileSync(robotsPath, 'utf-8');
assert(robotsTxt.includes('Allow: /'), 'Mengizinkan crawling halaman publik');
assert(robotsTxt.includes('Disallow: /api/'), 'Memblokir akses API backend');
assert(robotsTxt.includes('Disallow: /*?role=ADMIN*'), 'Memblokir indexing URL Admin portal');
assert(robotsTxt.includes('Disallow: /*?role=DRIVER*'), 'Memblokir indexing URL Driver portal');
assert(robotsTxt.includes('Sitemap: https://tumpanggo.com/sitemap.xml'), 'Merujuk sitemap.xml');

// 3. Audit sitemap.xml
console.log('\n3. Audit sitemap.xml:');
const sitemapPath = path.resolve(process.cwd(), 'public/sitemap.xml');
assert(fs.existsSync(sitemapPath), 'public/sitemap.xml file tersedia');
const sitemapXml = fs.readFileSync(sitemapPath, 'utf-8');
assert(sitemapXml.includes('<loc>https://tumpanggo.com/</loc>'), 'Sitemap memuat Homepage URL');
assert(sitemapXml.includes('<loc>https://tumpanggo.com/?service=food</loc>'), 'Sitemap memuat Food service URL');
assert(sitemapXml.includes('<loc>https://tumpanggo.com/?page=merchant-register</loc>'), 'Sitemap memuat Pendaftaran Mitra URL');
assert(sitemapXml.includes('<loc>https://tumpanggo.com/?page=edukasi</loc>'), 'Sitemap memuat Edukasi UMKM URL');

// 4. Audit Modul Edukasi UMKM
console.log('\n4. Audit Modul Edukasi & Artikel SEO UMKM:');
const eduPath = path.resolve(process.cwd(), 'src/components/UmkmEducationModule.tsx');
assert(fs.existsSync(eduPath), 'src/components/UmkmEducationModule.tsx tersedia');
const eduContent = fs.readFileSync(eduPath, 'utf-8');
assert(eduContent.includes('Cara Membawa Usaha Lokal Naik Kelas di Era Digital'), 'Memuat artikel 1: Transformasi usaha lokal');
assert(eduContent.includes('Strategi Digital Marketing untuk UMKM Pemula'), 'Memuat artikel 2: Digital marketing hemat modal');
assert(eduContent.includes('Cara Menarik Pelanggan Baru untuk Usaha Kuliner'), 'Memuat artikel 3: Menarik pelanggan baru & kemasan');
assert(eduContent.includes('Pentingnya Digitalisasi bagi Pengusaha Milenial'), 'Memuat artikel 4: Generasi milenial & cloud kitchen');
assert(eduContent.includes('Cara Membangun Kepercayaan Pelanggan secara Online'), 'Memuat artikel 5: QRIS & reputasi online');
assert(eduContent.includes('Strategi Mengembangkan Bisnis dari Lingkungan Sekitar'), 'Memuat artikel 6: Hyperlocal marketing');
assert(eduContent.includes('Panduan Memanfaatkan Teknologi untuk Mengembangkan Usaha'), 'Memuat artikel 7: Manajemen pesanan & pembukuan otomatis');

// 5. Audit Homepage Revisi: Hero Text Dihapus & Carousel Langsung Tampil
console.log('\n5. Audit Revisi Homepage (Hapus Hero Teks & Pertahankan Carousel):');
const customerPath = path.resolve(process.cwd(), 'src/components/CustomerView.tsx');
const customerContent = fs.readFileSync(customerPath, 'utf-8');

assert(!customerContent.includes('Saatnya Usaha Lokal Naik Kelas Bersama TumpangGo'), 'Hero teks headline visual telah dihapus dari tampilan homepage');
assert(!customerContent.includes('hero-title'), 'ID hero-title dan kontainer teks hero telah dihapus');
assert(customerContent.includes('<BannerCarousel mode="main"'), 'Hero carousel gambar slide dipertahankan langsung di bawah header');
assert(customerContent.includes('Layanan Tumpang Super-App'), 'Section menu layanan Tumpang Super-App tampil setelah carousel');
assert(customerContent.includes('Rekomendasi Kuliner'), 'Section rekomendasi kuliner tetap tampil');
assert(customerContent.includes('Tanya Jawab Seputar TumpangGo'), 'Section FAQ tetap terpasang');
assert(customerContent.includes('Edukasi &amp; Tips UMKM Naik Kelas') || customerContent.includes('Edukasi & Tips UMKM Naik Kelas'), 'Section Edukasi UMKM tetap terpasang');

console.log('\n===========================================');
console.log(`Hasil Verifikasi SEO: ${passCount} LULUS, ${failCount} GAGAL`);
console.log('===========================================');

if (failCount > 0) {
  process.exit(1);
}
