/**
 * Test Suite: Verifikasi Final Section Review & Testimoni TumpangGo
 * 
 * Memverifikasi:
 * 1. Terdapat tepat 10 item review dengan komposisi 6 Merchant dan 4 Pelanggan
 * 2. Slider memiliki tepat 5 slide dengan masing-masing 2 review per slide
 * 3. Isi review singkat, natural, dan sesuai peran Merchant dan Pelanggan
 * 4. Slider berpindah otomatis setiap 5 detik secara siklis (1 -> 2 -> 3 -> 4 -> 5 -> 1)
 * 5. Urutan review diacak (Fisher-Yates) saat inisialisasi awal tanpa re-shuffle di setiap slide
 * 6. Tidak ada ulasan ganda dalam satu siklus 5 slide (seluruh 10 ulasan ditampilkan sebelum berulang)
 * 7. Indikator 5 titik bulat kecil di posisi tengah horizontal tanpa teks atau angka
 * 8. Dukungan gestur swipe dan reset timer interval saat navigasi manual
 * 9. Label identitas konsisten dan data contoh ditandai isExample: true
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
  console.log('🚀 PENGUJIAN FINAL SECTION REVIEW TUMPANGGO');
  console.log('======================================================================\n');

  // --- 1. Tepat 10 Item Review: 6 Merchant & 4 Pelanggan ---
  console.log('📦 1. UJI JUMLAH TOTAL & KOMPOSISI REVIEW (10 ITEM: 6 MERCHANT & 4 PELANGGAN)');
  assert(
    DEFAULT_DEMO_REVIEWS.length === 10,
    'Terdapat tepat 10 item review',
    `Ditemukan: ${DEFAULT_DEMO_REVIEWS.length} review`
  );

  const merchantReviews = DEFAULT_DEMO_REVIEWS.filter(r => r.role === 'Merchant');
  const pelangganReviews = DEFAULT_DEMO_REVIEWS.filter(r => r.role === 'Pelanggan');

  assert(
    merchantReviews.length === 6,
    'Komposisi mitra Merchant tepat 6 review',
    `Jumlah: ${merchantReviews.length}`
  );
  assert(
    pelangganReviews.length === 4,
    'Komposisi pembeli Pelanggan tepat 4 review',
    `Jumlah: ${pelangganReviews.length}`
  );

  // --- 2. Pembagian Tepat 5 Slide (Masing-masing 2 Review per Slide) ---
  console.log('\n📦 2. UJI PEMBAGIAN SLIDE (5 SLIDE @ 2 REVIEW)');
  const slide1 = DEFAULT_DEMO_REVIEWS.slice(0, 2);
  const slide2 = DEFAULT_DEMO_REVIEWS.slice(2, 4);
  const slide3 = DEFAULT_DEMO_REVIEWS.slice(4, 6);
  const slide4 = DEFAULT_DEMO_REVIEWS.slice(6, 8);
  const slide5 = DEFAULT_DEMO_REVIEWS.slice(8, 10);

  assert(slide1.length === 2, 'Slide 1 berisi tepat 2 review', `Jumlah: ${slide1.length}`);
  assert(slide2.length === 2, 'Slide 2 berisi tepat 2 review', `Jumlah: ${slide2.length}`);
  assert(slide3.length === 2, 'Slide 3 berisi tepat 2 review', `Jumlah: ${slide3.length}`);
  assert(slide4.length === 2, 'Slide 4 berisi tepat 2 review', `Jumlah: ${slide4.length}`);
  assert(slide5.length === 2, 'Slide 5 berisi tepat 2 review', `Jumlah: ${slide5.length}`);

  // --- 3. Konsistensi Format Nama, Identitas & Isi Review Natural ---
  console.log('\n📦 3. UJI FORMAT NAMA, RATING, DAN NATURALITAS KOMENTAR');
  let allRatingsValid = true;
  let allContentsValid = true;
  let allRolesValid = true;

  for (const r of DEFAULT_DEMO_REVIEWS) {
    if (r.role !== 'Merchant' && r.role !== 'Pelanggan') allRolesValid = false;
    if (typeof r.rating !== 'number' || r.rating !== 5) allRatingsValid = false;
    if (!r.content || r.content.trim().length < 10) allContentsValid = false;
  }

  assert(allRolesValid, 'Label identitas hanya Merchant atau Pelanggan');
  assert(allRatingsValid, 'Komponen rating bintang 5 valid untuk seluruh 10 review');
  assert(allContentsValid, 'Seluruh isi komentar singkat, padat, dan natural');

  // Verifikasi contoh gaya penulisan Merchant & Pelanggan
  const andi = DEFAULT_DEMO_REVIEWS.find(r => r.name === 'Andi Saputra');
  const siti = DEFAULT_DEMO_REVIEWS.find(r => r.name === 'Siti Aminah');
  const budi = DEFAULT_DEMO_REVIEWS.find(r => r.name === 'Budi Santoso');
  const joko = DEFAULT_DEMO_REVIEWS.find(r => r.name.includes('Joko'));

  assert(Boolean(andi && andi.role === 'Merchant'), 'Andi Saputra berlabel Merchant');
  assert(Boolean(siti && siti.role === 'Pelanggan'), 'Siti Aminah berlabel Pelanggan');
  assert(Boolean(budi && budi.role === 'Pelanggan'), 'Budi Santoso berlabel Pelanggan');
  assert(Boolean(joko && joko.role === 'Merchant'), 'Pak Joko berlabel Merchant');

  // --- 4. Uji Pengacakan (Fisher-Yates Shuffle) ---
  console.log('\n📦 4. UJI PENGACAKAN REVIEW (SHUFFLE)');
  const originalIds = DEFAULT_DEMO_REVIEWS.map(r => r.id).join(',');
  let differentOrderObserved = false;

  for (let trial = 0; trial < 10; trial++) {
    const shuffled = shuffleReviews(DEFAULT_DEMO_REVIEWS);
    const shuffledIds = shuffled.map(r => r.id).join(',');
    if (shuffledIds !== originalIds) {
      differentOrderObserved = true;
      break;
    }
  }

  assert(differentOrderObserved, 'Pengacakan urutan review berhasil menghasilkan permutasi dinamis');

  // --- 5. Uji Bebas Duplikasi dalam 1 Siklus 5 Slide ---
  console.log('\n📦 5. UJI BEBAS DUPLIKASI DALAM SATU SIKLUS (5 SLIDE)');
  const testShuffled = shuffleReviews(DEFAULT_DEMO_REVIEWS);
  const setOfIds = new Set(testShuffled.map(r => r.id));

  assert(setOfIds.size === 10, 'Semua 10 review memiliki ID unik dalam hasil pengacakan');

  const s1 = testShuffled.slice(0, 2);
  const s2 = testShuffled.slice(2, 4);
  const s3 = testShuffled.slice(4, 6);
  const s4 = testShuffled.slice(6, 8);
  const s5 = testShuffled.slice(8, 10);

  const combinedIds = [
    ...s1.map(r => r.id),
    ...s2.map(r => r.id),
    ...s3.map(r => r.id),
    ...s4.map(r => r.id),
    ...s5.map(r => r.id)
  ];
  const duplicates = combinedIds.filter((id, index) => combinedIds.indexOf(id) !== index);

  assert(duplicates.length === 0, 'Tidak ada review yang muncul dua kali dalam satu siklus 5 slide');
  assert(combinedIds.length === 10, 'Seluruh 10 review ditampilkan sebelum siklus berulang');

  // --- 6. Uji Penanda Data Contoh / Demo ---
  console.log('\n📦 6. UJI PENANDA DATA CONTOH (DEMO)');
  const allMarkedAsExample = DEFAULT_DEMO_REVIEWS.every(r => r.isExample === true);
  assert(allMarkedAsExample, 'Data contoh ditandai dengan isExample: true agar tidak disalahartikan sebagai ulasan riil');

  // --- 7. Static Code Audit: UserTestimonialsSection.tsx ---
  console.log('\n📦 7. AUDIT KODE KOMPONEN, INDIKATOR, & FITUR SLIDER');
  const compPath = path.resolve(process.cwd(), 'src/components/UserTestimonialsSection.tsx');
  assert(fs.existsSync(compPath), 'File UserTestimonialsSection.tsx tersedia');

  const compCode = fs.readFileSync(compPath, 'utf-8');

  // Slider timing 5 detik
  const has5sTimer = compCode.includes('5000');
  assert(has5sTimer, 'Slider otomatis menggunakan jeda waktu 5000 ms (5 detik)');

  // Looping cyclis 5 slide: (prev + 1) % 5
  const hasCyclicSlide = compCode.includes('(prev + 1) % 5');
  assert(hasCyclicSlide, 'Slider berpindah secara siklis dan berulang dari slide 1 ke 2 ke 3 ke 4 ke 5 lalu kembali ke 1');

  // Indikator 5 titik
  const has5Dots = compCode.includes('[0, 1, 2, 3, 4].map');
  assert(has5Dots, 'Tersedia tepat 5 indikator titik (dots) untuk menunjukkan slide aktif');

  // Tidak ada teks atau angka slide ("Slide X dari Y" atau sejenisnya)
  const hasNoSlideText = !compCode.includes('Slide {activeSlide + 1}') && !compCode.includes('Slide 1 dari');
  assert(hasNoSlideText, 'Indikator bersih tanpa teks atau angka slide');

  // Indikator di posisi tengah horizontal
  const hasCenteredDots = compCode.includes('justify-center');
  assert(hasCenteredDots, 'Indikator 5 titik diposisikan di tengah horizontal (justify-center)');

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
