# TumpangGo Merchant Android APK — Native Firebase Cloud Messaging (FCM)

Aplikasi Android Native (WebView + Native FCM Service) untuk Mitra Toko **TumpangGo Merchant** (`https://tumpanggo.vercel.app/merchant`).

Database utama tetap **Supabase PostgreSQL**. Firebase Cloud Messaging (FCM) digunakan **khusus sebagai jalur transport pengiriman push notification native Android** agar HP merchant tetap menerima pemberitahuan dan mengeluarkan suara saat:
- Aplikasi berada di latar belakang (*background*)
- Layar HP mati / terkunci (*locked screen* / *Doze mode*)
- Aplikasi ditutup dari *recent apps* (*swipe-closed*)
- Proses aplikasi dihentikan sistem Android karena keterbatasan RAM (*OS process-killed*)

> **Catatan Batasan Sistem Operasi Android (`Force Stop` / *Paksa Berhenti*):**
> Sesuai arsitektur keamanan sistem operasi Android (AOSP), apabila pengguna secara manual membuka **Pengaturan Android -> Aplikasi -> TumpangGo Merchant -> Paksa Berhenti (*Force Stop*)**, sistem Android menempatkan aplikasi ke dalam *stopped state* dan menahan seluruh pengiriman broadcast maupun FCM hingga pengguna membuka aplikasi kembali minimal satu kali secara manual. Menutup aplikasi dengan menggeser (*swipe*) dari *Recent Apps* **bukan** *Force Stop* dan tetap menerima push FCM berprioritas tinggi.

---

## 1. Alur Push Notification Produksi

1. Pelanggan membuat pesanan baru (`POST /api/orders` -> `foodDb.createOrder`).
2. **Setelah** pesanan berhasil dipersistensikan ke Supabase PostgreSQL (`orders`), backend mencatat event idempoten di `push_notification_events` (`new_order:<orderId>`) dan mengambil seluruh token perangkat toko terkait dari tabel `push_subscriptions`.
3. Backend mengirim **High-Priority Data-Only FCM Message** melalui Firebase Admin SDK (`android.priority = "high"`, tanpa blok `notification` tingkat atas agar Google Play Services tidak melewati `TumpangFirebaseMessagingService`).
4. Di perangkat Android, `TumpangFirebaseMessagingService.onMessageReceived()` dieksekusi secara native tanpa bergantung pada Activity maupun WebView:
   - Memverifikasi `merchantId` cocok dengan toko yang sedang login pada perangkat.
   - Melakukan deduplikasi `eventId` & rekonsiliasi daftar `unhandledOrderIds`.
   - Menampilkan notifikasi pada channel **`Pesanan Baru TumpangGo Merchant`** (`tumpanggo_merchant_orders_v2`) dengan suara lokal `res/raw/order_ringtone.wav`:
     - 1 pesanan belum ditangani: **`1 Pesanan Baru`**
     - Beberapa pesanan belum ditangani: **`3 Pesanan Baru`** (*"Ada 3 pesanan baru yang perlu diperiksa untuk toko Anda."*) menggunakan `GROUP_ORDERS` + `InboxStyle` summary + `GROUP_ALERT_CHILDREN` (tanpa suara ganda).
5. Saat notifikasi ditekan:
   - Membuka `MainActivity` dan menyimpan target `orderId` secara aman.
   - Memverifikasi sesi login toko terlebih dahulu (jika sesi kedaluwarsa, pengguna login ulang lalu otomatis diarahkan ke rincian pesanan tersebut).
   - Membuka modal **Rincian Pesanan** yang memuat status terbaru langsung dari API backend dan memperbarui jumlah notifikasi (`3 -> 2 -> 1 -> 0`) **tanpa mengubah status transaksi secara otomatis**.

---

## 2. Penggantian Aset Suara Final & Strategi Migrasi Channel Android

Saat ini proyek menyertakan file audio sementara yang legal dan valid secara teknis di:
- **`android/app/src/main/res/raw/order_ringtone.wav`**

Apabila suara final resmi TumpangGo Merchant telah dipilih kemudian:
1. Ganti file **`android/app/src/main/res/raw/order_ringtone.wav`** dengan file audio final Anda (disarankan format `.wav` atau `.ogg` berdurasi 2–5 detik, tetap bernama dasar **`order_ringtone`**; hapus file `.wav` lama jika memakai ekstensi `.ogg`/`.mp3` agar tidak ada dua file bernama dasar `order_ringtone` sekaligus di `res/raw/`).
2. Naikkan konstanta `CHANNEL_SOUND_VERSION` di `NotificationHelper.kt` (misal dari `2` menjadi `3`) serta samakan `MERCHANT_ORDER_CHANNEL_ID` di `src/server/services/pushService.ts` dan `AndroidManifest.xml` (`tumpanggo_merchant_orders_v3`).
3. Karena Android 8.0+ mengunci suara channel setelah pertama kali dibuat, mekanisme migrasi otomatis di `NotificationHelper.createNotificationChannels()` akan menghapus channel versi lama (`tumpanggo_merchant_orders`, `v1`, `v2`) dan membuat channel versi baru dengan suara final sambil tetap menghormati preferensi *mute* pengguna jika sebelumnya dinonaktifkan.

---

## 3. Konfigurasi Manual yang Diperlukan Sebelum Build Produksi

### A. Migrasi SQL Supabase
Jalankan seluruh isi file **`supabase_migration_push_notifications.sql`** pada **Supabase SQL Editor** untuk mengaktifkan tabel `push_subscriptions` dan `push_notification_events` beserta policy RLS khusus `service_role`.

### B. Environment Variable di Vercel (`https://tumpanggo.vercel.app`)
Pastikan variabel berikut diset pada **Vercel Project Settings -> Environment Variables** (hanya di server, **jangan** di `VITE_*` atau kode frontend):
- `SUPABASE_URL`: URL proyek Supabase aktif
- `SUPABASE_SERVICE_ROLE_KEY`: Kunci `service_role` Supabase (khusus backend)
- `FIREBASE_PROJECT_ID`: ID proyek Firebase untuk FCM (contoh: `tumpanggo-70479`)
- `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON Service Account dari Firebase Console (*Project Settings -> Service Accounts -> Generate new private key*)

### C. File `android/app/google-services.json` (Wajib untuk Build APK Release)
1. Buka [Firebase Console](https://console.firebase.google.com/) pada proyek Firebase yang sama dengan `FIREBASE_SERVICE_ACCOUNT_KEY`.
2. Buka **Project Settings -> General -> Your apps**, pilih/daftarkan aplikasi Android dengan package name **`com.tumpanggo.merchant`**.
3. Unduh **`google-services.json`** resmi dan letakkan di:
   `android/app/google-services.json`
   *(Lihat `android/app/google-services.json.example` untuk referensi struktur. Jangan membuat isi dummy).*

---

## 4. Cara Build APK (Android Studio / CLI dengan JDK 17 + Android SDK 34)

```bash
cd android
# Debug APK (package tetap com.tumpanggo.merchant agar cocok dengan google-services.json)
./gradlew assembleDebug

# Release APK (wajib ada android/app/google-services.json)
./gradlew assembleRelease
```
