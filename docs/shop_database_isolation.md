# Arsitektur Isolasi Database Tumpang Shop & Panduan Migrasi

Dokumen ini mendefinisikan arsitektur penyimpanan independen untuk microservice **Tumpang Shop**, memisahkannya secara tuntas dari database **Tumpang Food** guna mencegah risiko ketergantungan kuota (*quota exhaustion*), benturan skema, dan pencampuran data (*data cross-contamination*).

---

## 1. Latar Belakang & Akar Masalah

Sebelum pemisahan ini:
- Tumpang Food dan Tumpang Shop berbagi satu instance Firestore yang sama (`(default)` pada project `tumpanggo-70479`).
- Meskipun Shop menggunakan prefix nama koleksi `shop_`, seluruh operasi baca dan tulis Shop tetap mengonsumsi kuota gratis harian Cloud Firestore yang dialokasikan untuk Food (50.000 reads/hari, 20.000 writes/hari).
- Ketika kuota Firestore habis (`RESOURCE_EXHAUSTED`), kedua layanan terdampak secara bersamaan.
- Operasi pembersihan (*Clean Slate*) atau *database backup/restore* di Food berisiko secara tidak sengaja memindai atau memengaruhi dokumen Shop.

---

## 2. Arsitektur Database Mandiri Tumpang Shop

### 2.1 Mode Operasional Saat Ini (Zero Quota Impact)
Secara *default*, Tumpang Shop kini beroperasi menggunakan **Engine Mandiri (Isolated Engine)**:
- **Penyimpanan Primer**: File JSON independen `tumpang_shop_db.json` (pada lokal) atau `/tmp/tumpang_shop_db.json` (pada serverless Vercel).
- **Integritas Transaksional**: Penulisan file dilakukan secara atomik melalui penulisan file sementara (`.tmp.<timestamp>`) lalu di-*rename* secara atomik (`fs.renameSync`).
- **Pencadangan Otomatis**: Setiap perubahan skema atau inisialisasi menghasilkan snapshot cadangan `.backup_<timestamp>.json`.
- **Cloud Sync Opt-in**: `SHOP_ENABLE_CLOUD_SYNC` disetel ke `false` secara default, sehingga **Shop tidak akan pernah mengonsumsi kuota Firestore Tumpang Food**.

### 2.2 Skema Data Independen Tumpang Shop

| Entitas | Nama Koleksi Cloud / Kunci Skema | Deskripsi |
| :--- | :--- | :--- |
| **Config** | `shop_config` / `config` | Konfigurasi toko, jam operasional, QRIS, tarif dasar ongkir, biaya layanan |
| **Categories** | `shop_categories` / `categories` | Kategori katalog produk marketplace Shop |
| **Products** | `shop_products` / `products` | Katalog produk, harga, varian, stok, SKU, gambar |
| **Orders** | `shop_orders` / `orders` | Pesanan marketplace, rincian item, status pembayaran, kode unik |
| **Shipments** | `shop_shipments` / `shipments` | Status pengiriman, nomor resi, tracking timeline lokal & internasional |
| **Audit Logs** | `shop_audit_logs` / `auditLogs` | Catatan audit aktivitas operasional toko (maksimal 500 riwayat terbaru) |
| **Migrations** | `shop_migrations` / `migrations` | Riwayat migrasi skema database versi otomatis |

---

## 3. Opsi Penyimpanan Cloud Mandiri Berbiaya Gratis

Untuk menghubungkan Tumpang Shop ke cloud database yang sepenuhnya terpisah dari Food, tersedia dua alternatif gratis:

### Opsi A: Firestore Database Terpisah (Named Database `(shop)`)
- **Keunggulan**: Memanfaatkan infrastruktur Google Cloud Firestore yang sama namun dengan database ID terpisah, misalnya `shop-db`.
- **Konfigurasi**:
  ```env
  SHOP_DATABASE_TYPE=firestore
  SHOP_ENABLE_CLOUD_SYNC=true
  SHOP_FIRESTORE_DATABASE_ID=shop-db
  SHOP_FIRESTORE_PREFIX=shop_
  ```
- **Catatan**: Firestore Multi-Database di Firebase Console memerlukan upgrade ke paket Blaze (gratis hingga batas free tier bulanan).

### Opsi B: PostgreSQL Cloud SQL / Supabase / Neon (Free Tier)
- **Keunggulan**: Database relasional ACID terpisah 100%, gratis tanpa kartu kredit (Neon / Supabase), performa tinggi untuk katalog produk e-commerce.
- **Konfigurasi**:
  ```env
  SHOP_DATABASE_TYPE=sql
  SHOP_DATABASE_URL=postgresql://user:password@ep-host.pooler.region.neon.tech/shopdb?sslmode=require
  ```

---

## 4. Panduan Migrasi Data & Rollback

### 4.1 Prosedur Migrasi (Food → Shop Terpisah)
1. **Langkah 1 (Export & Backup Snapshot)**:
   Jalankan backup data lokal saat ini:
   ```bash
   cp tumpang_shop_db.json tumpang_shop_db.pre_migration_backup.json
   ```
2. **Langkah 2 (Validasi Integritas Data)**:
   Pastikan tidak ada data pesanan aktif berstatus `UNPAID` yang sedang dalam jendela waktu kedaluwarsa 30 menit.
3. **Langkah 3 (Pengaktifan Database Baru)**:
   Tambahkan variabel lingkungan database tujuan di dashboard deployment Vercel.
4. **Langkah 4 (Verifikasi Health Check)**:
   Akses `GET /api/shop/health` dan pastikan field `liveCloudConnected` bernilai `true` dan `storageMode` mencerminkan instance database mandiri.

### 4.2 Prosedur Rollback Cepat
Jika koneksi cloud baru mengalami kendala (timeout atau kredensial invalid):
1. Ubah variabel di Vercel:
   ```env
   SHOP_ENABLE_CLOUD_SYNC=false
   SHOP_DATABASE_TYPE=file
   ```
2. Aplikasi akan seketika kembali ke penyimpanan file lokal snapshot `tumpang_shop_db.json` tanpa *downtime*.
3. Data terakhir dapat dipulihkan dari `tumpang_shop_db.pre_migration_backup.json`.

---

## 5. Ringkasan Tindakan Manual yang Masih Diperlukan
- **Penyediaan Kredensial Baru**: Jika pemilik proyek ingin Shop tersinkronisasi ke cloud database mandiri, buat database baru (baik di Firebase atau PostgreSQL Neon) dan masukkan connection string atau Service Account ke environment variable Vercel.
- **Pemisahan Lengkap Terbukti**: Tanpa tindakan manual tersebut, Shop tetap berjalan 100% normal, stabil, dan aman di dalam mode lokal/resilient snapshot tanpa mengonsumsi kuota Firestore Food sedikit pun.
