# TumpangGo Merchant Android APK — Native Firebase Cloud Messaging (FCM)

Aplikasi Android Native (WebView + Native FCM Service) untuk Mitra Toko **TumpangGo Merchant** (`https://tumpanggo.vercel.app/merchant`).

Dirancang agar notifikasi pesanan baru tetap muncul dan berdering dengan suara khusus (`res/raw/order_ringtone.wav`) saat:
- Aplikasi berada di latar belakang (*background*)
- Layar HP mati / terkunci (*locked screen* / *Doze mode*)
- Aplikasi ditutup dari *recent apps* (*swipe-closed*)
- Proses aplikasi dihentikan sistem Android karena keterbatasan RAM (*OS process-killed*)

> **Catatan Batasan Sistem Operasi Android (`Force Stop` / *Paksa Berhenti*):**
> Sesuai desain keamanan sistem operasi Android (AOSP), apabila pengguna secara manual membuka **Pengaturan Android -> Aplikasi -> TumpangGo Merchant -> Paksa Berhenti (*Force Stop*)**, sistem Android menempatkan aplikasi ke dalam status *stopped state* dan menahan seluruh pengiriman broadcast maupun FCM hingga pengguna membuka aplikasi kembali satu kali secara manual. Selain kondisi *Force Stop* manual tersebut, notifikasi tetap berjalan di background, layar mati, maupun saat di-*swipe* dari *recent apps*.

---

## 1. Alur Push Notification Produksi

1. Pelanggan membuat pesanan baru (`POST /api/orders` -> `foodDb.createOrder`).
2. **Setelah** pesanan berhasil dipersistensikan ke Supabase PostgreSQL (`orders`), backend mencatat event idempoten di `push_notification_events` (`new_order:<orderId>`) dan mengambil seluruh token perangkat toko terkait dari tabel `push_subscriptions`.
3. Backend mengirim **High-Priority Data-Only FCM Message** melalui Firebase Admin SDK (`android.priority = "high"`, tanpa blok `notification` tingkat atas agar Google Play Services tidak melewati `TumpangFirebaseMessagingService`).
4. Di perangkat Android, `TumpangFirebaseMessagingService.onMessageReceived()` dieksekusi secara native tanpa bergantung pada Activity maupun WebView:
   - Memverifikasi `merchantId` cocok dengan toko yang sedang login pada perangkat.
   - Melakukan deduplikasi `eventId` & rekonsiliasi daftar `unhandledOrderIds`.
   - Menampilkan notifikasi pada channel **`Pesanan Baru TumpangGo Merchant`** (`tumpanggo_merchant_orders`) dengan suara `res/raw/order_ringtone.wav`:
     - 1 pesanan belum ditangani: **`1 Pesanan Baru`**
     - Beberapa pesanan belum ditangani: **`3 Pesanan Baru`** (*"Ada 3 pesanan baru yang perlu diperiksa untuk toko Anda."*) menggunakan `GROUP_ORDERS` + `InboxStyle` summary + `GROUP_ALERT_CHILDREN` (tanpa suara ganda).
5. Saat notifikasi ditekan:
   - Membuka `MainActivity` dan menyimpan target `orderId` secara aman.
   - Memverifikasi sesi login toko terlebih dahulu (jika sesi kedaluwarsa, pengguna login ulang lalu otomatis diarahkan ke rincian pesanan tersebut).
   - Membuka modal **Rincian Pesanan** yang memuat status terbaru langsung dari API backend dan memperbarui jumlah notifikasi tanpa mengubah status transaksi secara otomatis.

---

## 2. Konfigurasi Manual yang Diperlukan Sebelum Build Produksi

### A. File `android/app/google-services.json` (Wajib untuk Build APK Release)
1. Buka [Firebase Console](https://console.firebase.google.com/) -> pilih project **`tumpanggo-70479`**.
2. Buka **Project Settings** -> tab **General** -> bagian **Your apps**.
3. Tambahkan atau pilih aplikasi Android dengan package name persis:
   `com.tumpanggo.merchant`
4. Unduh **`google-services.json`** asli dari Firebase Console dan simpan di:
   `android/app/google-services.json`
   *(Lihat `android/app/google-services.json.example` untuk referensi struktur. Jangan membuat isi dummy).*

### B. Environment Variable di Vercel (`https://tumpanggo.vercel.app`)
Pastikan variabel berikut diset pada **Vercel Project Settings -> Environment Variables** (hanya di server, **jangan** di `VITE_*` atau kode frontend):
- `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON Service Account dari Firebase Console (*Project Settings -> Service Accounts -> Generate new private key*) untuk project `tumpanggo-70479`.
- `SUPABASE_URL`: `https://epqpysiezdwyzrcebqey.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Kunci `service_role` Supabase agar backend serverless dapat membaca/menulis `orders`, `push_subscriptions`, dan `push_notification_events` melewati RLS.

### C. Migrasi Tabel Supabase (`supabase_schema.sql`)
Jalankan blok SQL terbaru di `supabase_schema.sql` pada **Supabase SQL Editor** untuk memastikan:
- Policy `service_role_full_access_push_subs` aktif pada tabel `push_subscriptions`.
- Tabel outbox `push_notification_events` beserta indeksnya tersedia.

---

## 3. Cara Build APK (Android Studio / CLI dengan JDK 17 + Android SDK 34)

```bash
cd android
# Debug APK (package tetap com.tumpanggo.merchant agar cocok dengan google-services.json)
./gradlew assembleDebug

# Release APK (wajib ada android/app/google-services.json)
./gradlew assembleRelease
```
