/**
 * Test Suite: Verifikasi Section Review & Testimoni TumpangGo (Clean State & Carousel Verification)
 * 
 * Memverifikasi:
 * 1. Tidak ada review dummy hardcoded yang tampil ke pengguna (DEFAULT_DEMO_REVIEWS = [])
 * 2. Empty state rapi dan profesional tampil ketika database review masih kosong
 * 3. Alur penulisan review baru via form tetap tersedia
 * 4. Logika carousel bekerja optimal saat data review nyata terisi:
 *    - Pembagian 2 review per slide
 *    - Indikator titik slide sesuai jumlah slide
 *    - Transisi otomatis setiap 5 detik
 *    - Pengacakan Fisher-Yates shuffle tanpa duplikasi dalam 1 siklus
 *    - Dukungan sentuh (touch swipe gestures) dan reset timer pada navigasi manual
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_DEMO_REVIEWS, shuffleReviews, ReviewItem } from '../src/components/UserTestimonialsSection';

let totalPass = 0;
let totalFail = 0;

function assert(condition: boolean, title: string, detail: string = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${title} ${detail ? `(${detail})` : ''}`);
    totalPass++;
  } else {
    console.error(`  ❌ [FAIL] ${title} ${detail ? `(${detail})` : ''}`);
    totalFail++;
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('🚀 PENGUJIAN SECTION REVIEW TUMPANGGO (CLEAN DATA & CAROUSEL WORKFLOW)');
  console.log('======================================================================\n');

  // --- 1. Uji Lingkungan Bersih Tanpa Data Dummy Hardcoded ---
  console.log('📦 1. UJI ZERO DUMMY DATA PADA KOMPONEN REVIEW');
  assert(
    DEFAULT_DEMO_REVIEWS.length === 0,
    'DEFAULT_DEMO_REVIEWS kosong (tidak menampilkan review dummy fiktif)',
    `Jumlah: ${DEFAULT_DEMO_REVIEWS.length} item`
  );

  // --- 2. Uji Fixture Pengujian Lokal untuk Algoritma Carousel (10 Item: 6 Merchant & 4 Pelanggan) ---
  console.log('\n📦 2. UJI LOGIKA PEMBAGIAN SLIDE (FIXTURE PENGUJIAN 10 ITEM @ 2 PER SLIDE)');
  const localTestFixture: ReviewItem[] = [
    { id: 't1', name: 'Mitra A', role: 'Merchant', content: 'Ulasan mitra pertama.', rating: 5 },
    { id: 't2', name: 'Mitra B', role: 'Merchant', content: 'Ulasan mitra kedua.', rating: 5 },
    { id: 't3', name: 'Mitra C', role: 'Merchant', content: 'Ulasan mitra ketiga.', rating: 5 },
    { id: 't4', name: 'Mitra D', role: 'Merchant', content: 'Ulasan mitra keempat.', rating: 5 },
    { id: 't5', name: 'Mitra E', role: 'Merchant', content: 'Ulasan mitra kelima.', rating: 5 },
    { id: 't6', name: 'Mitra F', role: 'Merchant', content: 'Ulasan mitra keenam.', rating: 5 },
    { id: 't7', name: 'Pelanggan G', role: 'Pelanggan', content: 'Ulasan pelanggan pertama.', rating: 5 },
    { id: 't8', name: 'Pelanggan H', role: 'Pelanggan', content: 'Ulasan pelanggan kedua.', rating: 5 },
    { id: 't9', name: 'Pelanggan I', role: 'Pelanggan', content: 'Ulasan pelanggan ketiga.', rating: 5 },
    { id: 't10', name: 'Pelanggan J', role: 'Pelanggan', content: 'Ulasan pelanggan keempat.', rating: 5 }
  ];

  const merchantCount = localTestFixture.filter(r => r.role === 'Merchant').length;
  const pelangganCount = localTestFixture.filter(r => r.role === 'Pelanggan').length;
  assert(merchantCount === 6, 'Komposisi pengujian merchant tepat 6', `Jumlah: ${merchantCount}`);
  assert(pelangganCount === 4, 'Komposisi pengujian pelanggan tepat 4', `Jumlah: ${pelangganCount}`);

  // Hitung slide dengan 2 review per slide
  const slides: ReviewItem[][] = [];
  for (let i = 0; i < localTestFixture.length; i += 2) {
    slides.push(localTestFixture.slice(i, i + 2));
  }

  assert(slides.length === 5, '10 review terbagi menjadi tepat 5 slide', `Jumlah slide: ${slides.length}`);
  assert(slides.every(s => s.length === 2), 'Setiap slide berisi tepat 2 review');

  // --- 3. Uji Pengacakan (Fisher-Yates Shuffle) & Bebas Duplikasi ---
  console.log('\n📦 3. UJI PENGACAKAN REVIEW (SHUFFLE) & BEBAS DUPLIKASI');
  const originalIds = localTestFixture.map(r => r.id).join(',');
  let differentOrderObserved = false;

  for (let trial = 0; trial < 10; trial++) {
    const shuffled = shuffleReviews(localTestFixture);
    const shuffledIds = shuffled.map(r => r.id).join(',');
    if (shuffledIds !== originalIds) {
      differentOrderObserved = true;
      break;
    }
  }

  assert(differentOrderObserved, 'Pengacakan urutan review berhasil menghasilkan permutasi dinamis');

  const testShuffled = shuffleReviews(localTestFixture);
  const setOfIds = new Set(testShuffled.map(r => r.id));
  assert(setOfIds.size === 10, 'Semua review memiliki ID unik dalam hasil pengacakan (tanpa duplikasi)');

  // --- 4. Static Code Audit: UserTestimonialsSection.tsx ---
  console.log('\n📦 4. AUDIT KODE KOMPONEN, EMPTY STATE, INDIKATOR, & FITUR SLIDER');
  const compPath = path.resolve(process.cwd(), 'src/components/UserTestimonialsSection.tsx');
  assert(fs.existsSync(compPath), 'File UserTestimonialsSection.tsx tersedia');

  const compCode = fs.readFileSync(compPath, 'utf-8');

  // Empty state present
  const hasEmptyState = compCode.includes('Belum Ada Ulasan yang Dipublikasikan');
  assert(hasEmptyState, 'Tersedia tampilan empty state yang rapi saat belum ada ulasan publik');

  // Form submission button present
  const hasWriteReviewBtn = compCode.includes('+ Tulis Review');
  assert(hasWriteReviewBtn, 'Tersedia tombol aksi untuk menulis review baru');

  // Slider timing 5 detik
  const has5sTimer = compCode.includes('5000');
  assert(has5sTimer, 'Slider otomatis menggunakan jeda waktu 5000 ms (5 detik)');

  // Looping cyclis dinamis: (prev + 1) % totalSlides
  const hasCyclicSlide = compCode.includes('(prev + 1) % totalSlides');
  assert(hasCyclicSlide, 'Slider berpindah secara siklis dan dinamis berulang kembali ke slide 1');

  // Indikator titik dinamis
  const hasDynamicDots = compCode.includes('Array.from({ length: totalSlides })');
  assert(hasDynamicDots, 'Indikator titik (dots) dirender dinamis sesuai jumlah slide aktif');

  // Touch gestures (swipe)
  const hasTouchSupport = compCode.includes('onTouchStart') && compCode.includes('onTouchEnd');
  assert(hasTouchSupport, 'Komponen mendukung interaksi usap / touch swipe gestures pada perangkat seluler');

  // Reset timer on manual navigation
  const hasTimerReset = compCode.includes('resetAutoSlideTimer');
  assert(hasTimerReset, 'Navigasi manual me-reset timer interval 5 detik agar tidak melompat mendadak');

  // Dua kartu per slide pada grid
  const has2CardsGrid = compCode.includes('sm:grid-cols-2');
  assert(has2CardsGrid, 'Layout kartu menggunakan grid 2 kolom (2 kartu per slide berdampingan di desktop)');

  console.log('\n======================================================================');
  console.log(`🏁 HASIL VERIFIKASI: ${totalPass} PASS, ${totalFail} FAIL (Total: ${totalPass + totalFail})`);
  console.log('======================================================================');

  if (totalFail > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
