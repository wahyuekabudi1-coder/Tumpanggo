# PANDUAN POLA ARSITEKTUR LAYANAN MANDIRI (SERVICE ARCHITECTURE PATTERN)
**TumpangGo Ecosystem — Decoupled Modular Microservices Blueprint**

Dokumen ini mendefinisikan standar resmi dan pola arsitektur untuk menambahkan layanan baru di ekosistem TumpangGo (seperti Tumpang Ride / Go Ride, Tumpang Send, Tumpang Mart, dll.) sehingga setiap layanan memiliki **backend, database, schema, migrasi, dan konfigurasi environment sendiri secara terisolasi tanpa saling mengganggu**.

---

## 1. PRINSIP DASAR PEMISAHAN LAYANAN

1. **Database Terisolasi Penuh**:
   - Setiap layanan memiliki database fisik atau storage namespace sendiri.
   - Layanan A **DILARANG KERAS** melakukan query atau modifikasi langsung ke tabel/file database Layanan B.
2. **Backend & Entry Point Mandiri**:
   - Setiap layanan memiliki aplikasi Express sendiri (`serviceApp.ts`) dan entry point mandiri (`server.ts`) yang dapat dijalankan secara independen pada port berbeda.
3. **Konfigurasi Environment Eksklusif**:
   - Setiap variabel lingkungan diberi prefix nama layanan (misal: `RIDE_PORT`, `RIDE_DATABASE_URL`, `RIDE_AUTH_SECRET`).
4. **Komunikasi Antarlayanan Melalui API Eksplisit**:
   - Jika layanan lain atau payment gateway perlu berinteraksi, komunikasi dilakukan melalui Inter-Service API Client (`serviceApiClient.ts`) atau REST endpoint, bukan melalui akses database langsung.
5. **Schema & Migrasi Versi Otomatis**:
   - Setiap layanan memiliki schema validator dan runner migrasi database sendiri yang mencatat riwayat versi migrasi.

---

## 2. STRUKTUR FOLDER STANDAR UNTUK LAYANAN BARU

Ketika Anda ingin menambahkan layanan baru di masa mendatang (contoh: `ride`), buat direktori di `src/services/<nama_layanan>/`:

```text
src/services/ride/
├── config/
│   └── rideEnv.ts             # Parser & validator environment khusus layanan
├── database/
│   ├── rideSchema.ts          # Definisi schema TypeScript & validator data
│   ├── rideDatabase.ts        # Engine database, persistensi & repositori data
│   └── rideMigration.ts       # Runner migrasi & audit data lama
├── api/
│   ├── rideApp.ts             # Express App mandiri dengan routing & middleware sendiri
│   └── rideAuth.ts            # RBAC & token signature terisolasi
├── client/
│   └── rideApiClient.ts       # Inter-service client untuk integrasi gateway/gateway luar
└── server.ts                  # Entry point standalone process (port independen)
```

---

## 3. POLA IMPLEMENTASI LANGKAH DEMI LANGKAH

### Langkah 1: Buat Konfigurasi Lingkungan (`config/<service>Env.ts`)
Gunakan prefix unik untuk semua environment variables:

```typescript
// Contoh: src/services/ride/config/rideEnv.ts
export const rideEnv = {
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.RIDE_PORT || '3002', 10),
  database: {
    type: (process.env.RIDE_DATABASE_TYPE || 'file') as 'file' | 'sql' | 'firestore',
    filePath: process.env.RIDE_DB_FILE || path.join(process.cwd(), 'tumpang_ride_db.json'),
    databaseUrl: process.env.RIDE_DATABASE_URL || '',
  },
  auth: {
    jwtSecret: process.env.RIDE_AUTH_SECRET || 'dev_secret_ride_minimum_32_characters_long',
    adminEmail: process.env.RIDE_ADMIN_EMAIL || 'rideadmin@tumpanggo.com',
  }
};
```

### Langkah 2: Buat Schema dan Migrasi Database (`database/`)
- Definisikan entitas bisnis di `<service>Schema.ts`.
- Buat migration runner di `<service>Migration.ts` yang mencatat eksekusi di tabel/koleksi `<service>_migrations`.
- Buat database class di `<service>Database.ts` yang mengelola data secara atomic dan tidak menyentuh database lain.

### Langkah 3: Buat Backend Express Mandiri (`api/<service>App.ts`)
- Buat instance `express()` terpisah.
- Pasang middleware JSON, request logger dengan tag `[<SERVICE>-API]`, dan otentikasi mandiri.
- Pasang rute REST API spesifik layanan.
- Pasang health check endpoint `/health`.

### Langkah 4: Buat Standalone Server Runner (`server.ts`)
- Memungkinkan menjalankan layanan secara terpisah dengan `tsx src/services/<service>/server.ts`.
- Tambahkan script di `package.json`:
  ```json
  "dev:ride": "tsx src/services/ride/server.ts",
  "build:ride": "esbuild src/services/ride/server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/ride-server.cjs"
  ```

### Langkah 5: Integrasikan ke Main Gateway (`src/server/app.ts`)
Pasang aplikasi layanan sebagai sub-aplikasi yang terisolasi di gateway utama:

```typescript
import { rideApp } from '../services/ride/api/rideApp';

// Mount sub-aplikasi ride
app.use('/api/ride', rideApp);
```

Dengan pola mounting ini:
- Frontend dapat memanggil `/api/ride/*` melalui domain dan port yang sama.
- Sub-aplikasi `rideApp` tetap terisolasi dengan routing, error handler, dan database-nya sendiri.
- Tidak ada database yang bercampur.

---

## 4. INTEGRASI ANTARLAYANAN (INTER-SERVICE COMMUNICATION)

Jika layanan lain (seperti sistem pembayaran terpadu atau Admin Dashboard) perlu berinteraksi dengan layanan Anda:
- **BENAR**: Panggil metode via `rideApiClient` atau HTTP endpoint `POST /api/ride/payments/sync`.
- **SALAH**: Mengimpor `rideDb` langsung di dalam kode `foodDb` atau sebaliknya.

---

## 5. CHECKLIST PENAMBAHAN LAYANAN BARU

- [ ] Folder layanan dibuat di `src/services/<nama_layanan>/`.
- [ ] Database storage terisolasi (misal file `tumpang_<nama>_db.json` atau tabel/koleksi khusus).
- [ ] Schema dan migrasi disiapkan di `database/`.
- [ ] Variabel `.env.example` didokumentasikan dengan prefix `<NAMA>_*`.
- [ ] Backend Express mandiri dibuat di `api/<nama>App.ts`.
- [ ] Server mandiri disiapkan di `server.ts` dengan port sendiri.
- [ ] Sub-app di-mount di `src/server/app.ts` pada `/api/<nama_layanan>`.
- [ ] Tidak ada kode layanan yang mengakses database layanan lain.
