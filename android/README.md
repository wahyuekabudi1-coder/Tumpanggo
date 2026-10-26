# TumpangGo Merchant Android APK — Native Firebase Cloud Messaging (FCM)

Aplikasi Android Native khusus untuk Mitra Toko / Dapur Kuliner TumpangGo.
Menjamin penerimaan notifikasi pesanan baru dengan suara dering telepon langsung saat:
- Layar HP mati / terkunci
- Aplikasi sedang ditutup (swipe-kill)
- Aplikasi berada di latar belakang (background)

---

## 1. Arsitektur Push Notification Native

```
[Pelanggan Buat Pesanan & Bayar]
                │
                ▼
[Backend: Order Status -> PAYMENT_VERIFIED]
                │
                ├──▶ [Web Push VAPID] (Browser Desktop / Chrome)
                │
                └──▶ [Firebase Admin FCM SDK]
                            │ (Priority: HIGH, Sound: order_ringtone)
                            ▼
                [Google FCM Servers]
                            │
                            ▼
        [Android OS (WakeLock / Doze Bypass)]
                            │
                            ▼
    [TumpangFirebaseMessagingService.kt]
                            │
                            ▼
    [NotificationManager: NotificationChannel]
    - Channel: "Pesanan Baru TumpangGo Merchant"
    - Suara: res/raw/order_ringtone.wav (Dering Telepon 440Hz+480Hz)
    - Getaran: [0, 500, 200, 500, 200, 800]
    - Prioritas: IMPORTANCE_HIGH (Head-up banner)
    - Stacking: Ringkasan multi-pesanan ("X Pesanan Baru")
                            │
                            ▼ (Tapped)
        [MainActivity.kt (WebView Bridge)]
    - Membuka halaman detail pesanan di /merchant?orderId=...
    - Menghapus notifikasi dari status bar
```

---

## 2. Struktur Proyek Android

```
android/
├── build.gradle                               # Top-level Gradle
├── settings.gradle                            # Module registry
├── gradle.properties                          # Build optimizations
├── app/
│   ├── build.gradle                           # App dependencies (FCM BOM, Coroutines, OkHttp)
│   ├── google-services.json                   # Konfigurasi Google Services
│   ├── proguard-rules.pro                     # Rule obfuscation untuk Bridge & Firebase
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml            # Permissions & Service declaration
│           ├── java/com/tumpanggo/merchant/
│           │   ├── TumpangMerchantApplication.kt  # Channel bootstrap
│           │   ├── MainActivity.kt               # WebView & Intent router
│           │   ├── NotificationHelper.kt         # Builder notifikasi & ringkasan
│           │   ├── TumpangFirebaseMessagingService.kt # FCM background listener
│           │   └── MerchantWebBridge.kt          # JavaScript bridge interface
│           └── res/
│               ├── raw/
│               │   └── order_ringtone.wav        # Suara nada dering autentik
│               ├── values/                       # strings, colors, styles
│               └── mipmap-*/                     # Ikon aplikasi
```

---

## 3. Langkah Menyiapkan `google-services.json` di Firebase Console

1. Buka [Firebase Console](https://console.firebase.google.com/) dan pilih proyek Anda (`tumpanggo-70479`).
2. Masuk ke **Project Settings** (ikon gerigi di kiri atas) -> tab **General**.
3. Di bagian **Your apps**, klik **Add app** -> pilih **Android**.
4. Masukkan konfigurasi berikut:
   - **Android package name:** `com.tumpanggo.merchant`
   - **App nickname:** `TumpangGo Merchant`
5. Klik **Register app**.
6. Unduh file `google-services.json` dan letakkan di folder:
   `android/app/google-services.json`
7. Selesai!

---

## 4. Konfigurasi Backend (Vercel / Supabase)

Pastikan variabel lingkungan server berikut telah dikonfigurasi:
- `FIREBASE_SERVICE_ACCOUNT_KEY`: JSON Service Account dari Firebase Console (Project Settings > Service Accounts > Generate new private key).
- `SUPABASE_URL`: `https://epqpysiezdwyzrcebqey.supabase.co`
- `SUPABASE_ANON_KEY`: Kunci anon Supabase.

Ketika pesanan diverifikasi (`PAYMENT_VERIFIED`), backend secara otomatis mengirim pesan FCM ke seluruh token perangkat merchant yang terdaftar di tabel `push_subscriptions`.

---

## 5. Cara Kompilasi & Build APK

### Menggunakan Android Studio:
1. Buka folder `android/` di **Android Studio**.
2. Biarkan Gradle melakukan sync dependencies (`firebase-messaging`, `kotlin-android`, dll.).
3. Pilih target device (emulator atau HP Android fisik via USB Debugging).
4. Klik tombol **Run (Shift + F10)** atau pilih **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. File APK akan terbentuk di `android/app/build/outputs/apk/debug/app-debug.apk`.

### Menggunakan Command Line:
```bash
cd android
./gradlew assembleDebug
# atau untuk release:
./gradlew assembleRelease
```

---

## 6. Pengujian Notifikasi Native di HP

1. Buka aplikasi **TumpangGo Merchant** di HP Android.
2. Ketika muncul dialog *"Izinkan TumpangGo Merchant mengirimkan notifikasi?"*, pilih **Izinkan** (*Allow*).
3. Masuk dengan akun toko merchant Anda.
4. Di tab **Profil / Pengaturan**, periksa kartu:
   **Aplikasi Android Native (FCM)** -> status **FCM Terhubung**.
5. Tekan tombol **Tes Notifikasi FCM** atau **Tes Nada Dering Native**.
6. Kunci layar HP Anda atau tutup aplikasi, lalu lakukan tes order pembayaran terverifikasi.
7. HP akan berdering kencang dengan nada dering pesanan masuk dan menampilkan banner notifikasi detail pesanan.
