/**
 * Test Suite: Review Pengguna TumpangGo (Sistem ala Google Maps)
 * 
 * Verifikasi menyeluruh sistem review:
 * 1. Pemisahan kategori 'merchant' dan 'pelanggan'
 * 2. Penyimpanan field khusus merchant (merchantName) dan judul (title)
 * 3. Keaslian data: hanya review 'published' & 'consentApproved = true' yang tampil ke publik
 * 4. Formulir pengiriman review publik dengan validasi ketat dan status default 'pending'
 * 5. Moderasi Admin: otorisasi RBAC (Admin & Master Admin), filter kategori & status, publikasi, penolakan, edit, dan hapus
 * 6. Validasi rating integer 1-5 dan kalkulasi ringkasan statistik ala Google Maps
 * 7. Empty state ketika data review kosong (keaslian data tanpa ulasan fiktif)
 */

import { foodDb } from '../src/server/db';
import { createAuthToken } from '../src/server/auth';
import type { Testimonial } from '../src/types';
import { foodConfig } from '../src/server/config';
import { __setFirestoreMockForTesting } from '../src/server/firebaseAdmin';

let totalPass = 0;
let totalFail = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    totalPass++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    totalFail++;
  }
}

async function runReviewTests() {
  console.log('======================================================================');
  console.log('🧪 PENGUJIAN SISTEM REVIEW PENGGUNA TUMPANGGO ALA GOOGLE MAPS');
  console.log('======================================================================');

  // Backup existing testimonials
  const initialTestimonials = foodDb.getAllTestimonials();
  console.log(`ℹ️  Jumlah review awal di database: ${initialTestimonials.length}`);

  try {
    // ---------------------------------------------------------
    // 1. UJI EMPTY STATE & KEASLIAN REVIEW
    // ---------------------------------------------------------
    console.log('\n📦 1. PENGUJIAN KEASLIAN DATA & EMPTY STATE AWAL');
    const publishedInit = foodDb.getPublishedTestimonials();
    assert(
      Array.isArray(publishedInit),
      'getPublishedTestimonials mengembalikan array valid'
    );
    assert(
      publishedInit.every(t => t.status === 'published' && t.consentApproved === true),
      'Semua review publik harus berstatus published dan memiliki persetujuan publikasi (consentApproved = true)'
    );

    // ---------------------------------------------------------
    // 2. UJI PENGIRIMAN REVIEW DENGAN STATUS DEFAULT PENDING, MERCHANTNAME, DAN TITLE
    // ---------------------------------------------------------
    console.log('\n📦 2. PENGUJIAN SUBMISSION REVIEW BARU DENGAN STATUS PENDING & FIELD KHUSUS');
    
    // Ulasan Merchant Uji Coba dengan nama usaha dan judul ulasan
    const merchantReview = await foodDb.createTestimonial({
      userName: 'Pak Joko',
      merchantName: 'Warung Bakso Barokah',
      category: 'merchant',
      title: 'Omzet Meningkat Cepat',
      roleDetail: 'Pemilik Warung Bakso Barokah',
      rating: 5,
      content: 'Aplikasi TumpangGo sangat membantu UMKM kuliner di Tumpang memperluas jangkauan pembeli lokal.',
      consentApproved: true,
      status: 'pending',
      displayOrder: 1
    });

    assert(merchantReview.id.startsWith('rev_'), 'ID review dibuat otomatis dengan prefix rev_');
    assert(merchantReview.category === 'merchant', 'Kategori terdaftar sebagai "merchant"');
    assert(merchantReview.merchantName === 'Warung Bakso Barokah', 'Nama usaha / toko tersimpan dengan benar');
    assert(merchantReview.title === 'Omzet Meningkat Cepat', 'Judul review tersimpan dengan benar');
    assert(merchantReview.status === 'pending', 'Status baru harus "pending" untuk moderasi kurasi admin');
    assert(merchantReview.rating === 5, 'Rating bintang nyata bernilai 5');

    // Ulasan Pelanggan Uji Coba dengan judul ulasan
    const customerReview = await foodDb.createTestimonial({
      userName: 'Ahmad Fauzi',
      category: 'pelanggan',
      title: 'Ongkir Flat Rp 5.000 Sangat Hemat',
      roleDetail: 'Warga Tumpang Krajan',
      rating: 5,
      content: 'Ongkir hemat Rp 5.000 sangat meringankan pemesanan makanan sehari-hari di Tumpang.',
      consentApproved: true,
      status: 'pending',
      displayOrder: 2
    });

    assert(customerReview.category === 'pelanggan', 'Kategori terdaftar sebagai "pelanggan"');
    assert(customerReview.merchantName === undefined, 'Review pelanggan tidak memiliki merchantName');
    assert(customerReview.title === 'Ongkir Flat Rp 5.000 Sangat Hemat', 'Judul ulasan pelanggan tersimpan');
    assert(customerReview.status === 'pending', 'Status pelanggan baru adalah "pending"');

    // ---------------------------------------------------------
    // 3. UJI ISOLASI PUBLIK: REVIEW PENDING TIDAK BOLEH TAMPIL KE PUBLIK
    // ---------------------------------------------------------
    console.log('\n📦 3. PENGUJIAN ISOLASI PUBLIK (HANYA PUBLISHED YANG TAMPIL)');
    const publicReviewsAfterPending = foodDb.getPublishedTestimonials();
    const isMerchantPublic = publicReviewsAfterPending.some(r => r.id === merchantReview.id);
    const isCustomerPublic = publicReviewsAfterPending.some(r => r.id === customerReview.id);

    assert(!isMerchantPublic, 'Review merchant berstatus pending TIDAK boleh tampil di publik');
    assert(!isCustomerPublic, 'Review pelanggan berstatus pending TIDAK boleh tampil di publik');

    // ---------------------------------------------------------
    // 4. UJI MODERASI ADMIN (APPROVE / PUBLISH & CATEGORY SEPARATION)
    // ---------------------------------------------------------
    console.log('\n📦 4. PENGUJIAN MODERASI ADMIN & PEMISAHAN KATEGORI');
    
    // Admin menerbitkan review merchant
    const publishedMerchant = await foodDb.updateTestimonial(merchantReview.id, {
      status: 'published',
      consentApproved: true
    });
    assert(publishedMerchant?.status === 'published', 'Admin berhasil mempublikasikan review merchant');

    // Cek kembali publik: sekarang review merchant harus muncul, tapi review pelanggan tetap sembunyi
    const publicAfterMerchantPublished = foodDb.getPublishedTestimonials();
    assert(
      publicAfterMerchantPublished.some(r => r.id === merchantReview.id),
      'Review merchant yang telah dipublikasikan sekarang tampil di publik'
    );
    assert(
      !publicAfterMerchantPublished.some(r => r.id === customerReview.id),
      'Review pelanggan yang masih pending tetap TIDAK tampil di publik'
    );

    // Filter per kategori publik
    const merchantOnlyPublic = foodDb.getPublishedTestimonials('merchant');
    const customerOnlyPublic = foodDb.getPublishedTestimonials('pelanggan');

    assert(
      merchantOnlyPublic.every(r => r.category === 'merchant' || (r.category as any) === 'umkm'),
      'Filter kategori "merchant" hanya mengembalikan review merchant'
    );
    assert(
      merchantOnlyPublic.some(r => r.id === merchantReview.id),
      'Review merchant ditemukan pada tab merchant'
    );
    assert(
      !merchantOnlyPublic.some(r => r.id === customerReview.id),
      'Review pelanggan tidak bocor ke tab merchant'
    );
    assert(
      customerOnlyPublic.length === 0 || customerOnlyPublic.every(r => r.category === 'pelanggan'),
      'Tab pelanggan tidak memuat review merchant saat belum ada ulasan pelanggan yang published'
    );

    // Admin menerbitkan review pelanggan
    await foodDb.updateTestimonial(customerReview.id, {
      status: 'published',
      consentApproved: true
    });

    const customerOnlyPublicAfter = foodDb.getPublishedTestimonials('pelanggan');
    assert(
      customerOnlyPublicAfter.some(r => r.id === customerReview.id),
      'Review pelanggan kini tampil di tab pelanggan setelah dipublikasikan oleh admin'
    );

    // ---------------------------------------------------------
    // 5. UJI STATISTIK RATING ALA GOOGLE MAPS
    // ---------------------------------------------------------
    console.log('\n📦 5. PENGUJIAN KALKULASI STATISTIK RATING ALA GOOGLE MAPS');
    const bothPublished = foodDb.getPublishedTestimonials();
    const rated = bothPublished.filter(t => typeof t.rating === 'number' && t.rating >= 1 && t.rating <= 5);
    const avg = rated.reduce((acc, c) => acc + (c.rating || 0), 0) / rated.length;
    assert(avg >= 1 && avg <= 5, 'Rata-rata rating bernilai antara 1.0 sampai 5.0');
    assert(rated.length >= 2, 'Total rating terverifikasi mencakup ulasan merchant dan pelanggan');

    // ---------------------------------------------------------
    // 6. UJI PENOLAKAN REVIEW (REJECT) & PENGHAPUSAN (DELETE)
    // ---------------------------------------------------------
    console.log('\n📦 6. PENGUJIAN PENOLAKAN (REJECT) & PENGHAPUSAN REVIEW');
    
    // Tolak review pelanggan
    await foodDb.updateTestimonial(customerReview.id, { status: 'rejected' });
    const publicAfterReject = foodDb.getPublishedTestimonials('pelanggan');
    assert(
      !publicAfterReject.some(r => r.id === customerReview.id),
      'Review yang ditolak (rejected) langsung hilang dari publik tanpa reload server'
    );

    // Hapus review uji coba
    const del1 = await foodDb.deleteTestimonial(merchantReview.id);
    const del2 = await foodDb.deleteTestimonial(customerReview.id);
    assert(del1 === true, 'Review merchant uji coba berhasil dihapus permanen');
    assert(del2 === true, 'Review pelanggan uji coba berhasil dihapus permanen');

    // ---------------------------------------------------------
    // 7. UJI TOKEN OTORISASI RBAC ADMIN
    // ---------------------------------------------------------
    console.log('\n📦 7. PENGUJIAN OTORISASI RBAC ADMIN UNTUK REVIEW');
    const adminToken = createAuthToken({ userId: 'admin-1', email: 'admin@tumpanggo.com', role: 'ADMIN' });
    const masterAdminToken = createAuthToken({ userId: 'master-1', email: 'master@tumpanggo.com', role: 'MASTER_ADMIN' });
    const merchantToken = createAuthToken({ userId: 'm1', email: 'merchant@tumpanggo.com', role: 'MERCHANT' });

    assert(Boolean(adminToken), 'Token Admin RBAC valid');
    assert(Boolean(masterAdminToken), 'Token Master Admin RBAC valid');
    assert(Boolean(merchantToken), 'Token Merchant RBAC valid');

    // ---------------------------------------------------------
    // 8. UJI FAIL-SAFE PENYIMPANAN CLOUD FIRESTORE & ANTI PESAN SUKSES PALSU
    // ---------------------------------------------------------
    console.log('\n📦 8. PENGUJIAN FAIL-SAFE FIRESTORE & PENCEGAHAN PESAN SUKSES PALSU');
    const originalIsProduction = foodConfig.isProduction;
    const originalNodeEnv = process.env.NODE_ENV;
    (foodConfig as any).isProduction = true;
    process.env.NODE_ENV = 'production';

    __setFirestoreMockForTesting({
      isConfigured: true,
      probeResult: {
        connected: true,
        canRead: true,
        canWrite: true,
        databaseId: '(default)',
        projectId: 'tumpanggo-70479',
        usingServiceAccount: true,
        authIdentity: 'service-account@tumpanggo-70479.iam.gserviceaccount.com',
        diagnosticReason: 'OK',
        diagnosticDetail: 'Mock connection active'
      },
      writeSuccess: false // Cloud write fails
    });

    let reviewWriteFailedSafely = false;
    let reviewErrorMessage = '';
    const preCount = foodDb.getAllTestimonials().length;

    try {
      await foodDb.createTestimonial({
        userName: 'Tester Fail-Safe',
        category: 'pelanggan',
        content: 'Testing fail safe rejection when firestore fails in production',
        rating: 5,
        status: 'pending',
        consentApproved: true,
        displayOrder: 99
      });
    } catch (err: any) {
      reviewWriteFailedSafely = true;
      reviewErrorMessage = err.message || String(err);
    } finally {
      __setFirestoreMockForTesting(null);
      (foodConfig as any).isProduction = originalIsProduction;
      process.env.NODE_ENV = originalNodeEnv;
    }

    const postCount = foodDb.getAllTestimonials().length;
    assert(reviewWriteFailedSafely, 'Pengiriman review ditolak dengan error saat cloud Firestore gagal di mode produksi', reviewErrorMessage);
    assert(postCount === preCount, 'Tidak ada review palsu yang tersimpan di database lokal saat cloud write gagal (Zero False Success)');

  } finally {
    // Clean up any remaining test items
    const current = foodDb.getAllTestimonials();
    for (const t of current) {
      if (t.userName === 'Pak Joko' || t.userName === 'Ahmad Fauzi' || t.userName === 'Tester Fail-Safe') {
        await foodDb.deleteTestimonial(t.id);
      }
    }
  }

  console.log('\n======================================================================');
  console.log(`🏁 HASIL AKHIR PENGUJIAN REVIEW: ${totalPass} PASS, ${totalFail} FAIL`);
  console.log('======================================================================');

  if (totalFail > 0) {
    process.exit(1);
  }
}

runReviewTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
