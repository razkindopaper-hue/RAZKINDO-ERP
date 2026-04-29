# 🔍 Audit Report: razkindo-backup.tar.gz
**Tanggal:** 29 April 2026  
**Ukuran file asli:** 84 MB (compressed) / 220 MB (uncompressed)  
**Target ukuran:** < 50 MB

---

## 📊 Ringkasan Temuan

| Kategori | Jumlah | Tingkat Keparahan |
|---|---|---|
| Bug Kritis (belum selesai) | 2 | 🔴 Tinggi |
| Masalah Keamanan | 3 | 🔴 Tinggi |
| Kode Berbahaya di Produksi | 520+ | 🟡 Sedang |
| Type Safety Diabaikan | 1156+ | 🟡 Sedang |
| Konfigurasi Bermasalah | 4 | 🟡 Sedang |
| Promise Tanpa Error Handler | 32 | 🟡 Sedang |
| Pemborosan Ukuran File | ~77 MB | 🔴 Tinggi |

---

## 🔴 BUGS KRITIS

### BUG-01 — Tidak Ada UNIQUE Constraint pada `invoice_no`
**File:**
- `src/app/api/pwa/[code]/orders/route.ts:184`
- `src/app/api/transactions/route.ts:437`

**Masalah:** Dua TODO comment yang belum dikerjakan menyatakan bahwa kolom `invoice_no` di tabel `transactions` belum memiliki `UNIQUE` constraint di database. Ini menyebabkan risiko **nomor invoice duplikat** saat ada race condition (dua request bersamaan).

**Bukti dari kode:**
```ts
// TODO: Add UNIQUE constraint on (invoice_no) in transactions table for guaranteed uniqueness.
```

**Dampak:** Dua transaksi bisa mendapat nomor invoice yang sama → laporan keuangan kacau, konflik data.

**Langkah Perbaikan:**
```sql
-- Jalankan migration ini di Supabase / PostgreSQL
ALTER TABLE transactions ADD CONSTRAINT transactions_invoice_no_unique UNIQUE (invoice_no);
```

Buat juga file migration baru di folder `supabase/migrations/`:
```sql
-- File: supabase/migrations/20260429000001_add_invoice_no_unique.sql
ALTER TABLE transactions 
  ADD CONSTRAINT transactions_invoice_no_unique UNIQUE (invoice_no);
```

Lalu update komentar di kedua file route menjadi:
```ts
// RESOLVED: UNIQUE constraint on (invoice_no) added via migration 20260429000001
```

---

### BUG-02 — `typescript: { ignoreBuildErrors: true }` di `next.config.ts`
**File:** `next.config.ts:9`

**Masalah:** Build TypeScript error **diabaikan secara paksa**. Artinya kode yang memiliki error TypeScript tetap bisa di-build dan di-deploy ke produksi tanpa ada peringatan.

**Bukti dari kode:**
```ts
typescript: {
  ignoreBuildErrors: true,  // ← INI BERBAHAYA
},
```

**Dampak:** Bug tersembunyi di TypeScript tidak terdeteksi saat deploy. Dikombinasikan dengan 1.156+ penggunaan `any`, ini menciptakan potensi runtime error besar di produksi.

**Langkah Perbaikan:**
```ts
// next.config.ts
typescript: {
  ignoreBuildErrors: false,  // ← ubah ke false
},
```
Kemudian jalankan `bun run build` dan perbaiki TypeScript error yang muncul satu per satu.

---

## 🔴 MASALAH KEAMANAN

### SEC-01 — File `.env` Masuk ke Backup
**File:** `./.env`

**Masalah:** File `.env` yang berisi `DATABASE_URL` (koneksi database dengan password) ikut ter-archive di dalam backup. Jika backup ini dikirim atau disimpan di tempat yang tidak aman, credential database bisa bocor.

**Langkah Perbaikan:**
Buat file `.gitignore` (yang saat ini **TIDAK ADA**) dan file `.backupignore`:

```
# .gitignore (buat file baru ini!)
node_modules/
.next/
.env
.env.local
.env.production
db/.auth-secret
*.log
```

---

### SEC-02 — File `db/.auth-secret` Masuk ke Backup
**File:** `db/.auth-secret`

**Masalah:** File ini berisi secret key raw (hex string) yang digunakan untuk autentikasi. Sama dengan `.env`, file ini **tidak boleh ada di dalam backup** yang bisa dibagikan.

**Langkah Perbaikan:**
Tambahkan ke `.gitignore`:
```
db/.auth-secret
db/*.secret
```

---

### SEC-03 — Tidak Ada `.gitignore`
**Masalah:** Proyek ini **sama sekali tidak memiliki file `.gitignore`**. Ini adalah root cause dari SEC-01 dan SEC-02 di atas, dan juga alasan utama kenapa `node_modules` (179 MB!) masuk ke dalam backup.

**Langkah Perbaikan:** Lihat Bagian [Solusi Pengecilan Ukuran File](#-solusi-pengecilan-ukuran-file) di bawah.

---

## 🟡 KONFIGURASI BERMASALAH

### CFG-01 — `reactStrictMode: false`
**File:** `next.config.ts:11`

**Masalah:** React Strict Mode dimatikan. Mode ini membantu mendeteksi efek samping yang tidak terduga, penggunaan API deprecated, dan bug lainnya selama pengembangan.

**Perbaikan:**
```ts
reactStrictMode: true,  // aktifkan kembali
```

---

### CFG-02 — Semua Aturan ESLint Dimatikan
**File:** `eslint.config.mjs`

**Masalah:** Hampir semua aturan TypeScript dan React ESLint dimatikan secara eksplisit:
```js
"@typescript-eslint/no-explicit-any": "off",    // ← bahaya
"@typescript-eslint/no-unused-vars": "off",     // ← variable mati tidak terdeteksi
"react-hooks/exhaustive-deps": "off",           // ← bug hook tidak terdeteksi
"@next/next/no-img-element": "off",             // ← gambar tidak optimal
```

**Dampak:** ESLint tidak berguna sama sekali. 1.156 penggunaan `any` dan 520 `console.log` dibiarkan masuk ke produksi.

**Perbaikan bertahap:** Aktifkan aturan satu per satu dimulai dari yang paling kritis:
```js
"@typescript-eslint/no-explicit-any": "warn",   // mulai dengan warn dulu
"react-hooks/exhaustive-deps": "warn",
```

---

### CFG-03 — 520 `console.log` di Kode Produksi
**Lokasi:** Tersebar di 297 file source

**Masalah:** Log debug tersisa di kode produksi. Ini memperlambat performa, mengekspos informasi internal di browser console, dan mempersulit debugging nyata.

**Perbaikan:** Buat wrapper logger yang otomatis dimatikan di produksi:
```ts
// src/lib/logger.ts
const isDev = process.env.NODE_ENV === 'development';
export const log = {
  debug: (...args: unknown[]) => isDev && console.log('[DEBUG]', ...args),
  info: (...args: unknown[]) => isDev && console.info('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};
```

Lalu ganti semua `console.log(...)` dengan `log.debug(...)`.

---

### CFG-04 — 32 Promise `.then()` Tanpa `.catch()`
**Lokasi:** Tersebar di file `connection-pool.ts`, `memory-guard.ts`, komponen UI, dll.

**Masalah:** Promise yang tidak memiliki error handler bisa menyebabkan **UnhandledPromiseRejection** yang crash di Node.js tanpa pesan error yang jelas.

**Contoh bermasalah:**
```ts
// src/lib/memory-guard.ts:155
import('@/lib/connection-pool').then(({ closeAllPools }) => {
  closeAllPools();  // ← tidak ada .catch()!
});
```

**Perbaikan:**
```ts
import('@/lib/connection-pool')
  .then(({ closeAllPools }) => {
    closeAllPools();
  })
  .catch((err) => {
    console.error('[memory-guard] Failed to close pools:', err);
  });
```

---

## 📦 SOLUSI PENGECILAN UKURAN FILE

### Analisis Ukuran Saat Ini

| Folder | Ukuran | Perlu di Backup? |
|---|---|---|
| `node_modules/` | 179 MB | ❌ Tidak (bisa `npm install` ulang) |
| `skills/` | 17 MB | ⚠️ Opsional (bukan bagian app) |
| `src/`, `prisma/`, dll | ~25 MB | ✅ Ya |
| **Total saat ini (compressed)** | **84 MB** | — |

### Hasil Setelah Pengecilan

| Konfigurasi Backup | Ukuran Compressed | Status |
|---|---|---|
| Asli (semua termasuk) | 84 MB | ❌ Terlalu besar |
| Tanpa `node_modules/` | **7.3 MB** | ✅ Jauh di bawah 50 MB |
| Tanpa `node_modules/` + `skills/` | **1.1 MB** | ✅ Sangat ideal |

> **Kesimpulan:** File backup bisa diperkecil dari 84 MB menjadi **7.3 MB** (hanya dengan exclude `node_modules`), atau **1.1 MB** jika folder `skills/` juga dikeluarkan — **tanpa mengurangi satu pun fungsi sistem**.

---

## ✅ LANGKAH PENYELESAIAN LENGKAP

### Langkah 1 — Buat `.gitignore` (Wajib)

Buat file `.gitignore` di root proyek (`razkindo-backup/.gitignore`):

```gitignore
# Dependencies — tidak perlu di-backup, cukup npm/bun install
node_modules/
.pnp
.pnp.js

# Build output — generated saat build
.next/
out/
dist/

# Environment & Secrets — JANGAN PERNAH di-commit/backup
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
db/.auth-secret
db/*.key
*.pem

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
dev.log
server.log

# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp

# Prisma generated
node_modules/.prisma/
```

---

### Langkah 2 — Buat Script Backup yang Benar

Buat file `scripts/create-backup.sh`:

```bash
#!/bin/bash
# =============================================================
# Script Backup Razkindo ERP - Clean Backup (< 10 MB)
# Usage: bash scripts/create-backup.sh
# =============================================================

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="razkindo-backup_${TIMESTAMP}.tar.gz"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "📦 Membuat backup bersih dari: $PROJECT_DIR"
echo "📁 Output: $BACKUP_NAME"

tar -czf "$BACKUP_NAME" \
  --exclude="./node_modules" \
  --exclude="./.next" \
  --exclude="./dist" \
  --exclude="./out" \
  --exclude="./.env" \
  --exclude="./.env.local" \
  --exclude="./db/.auth-secret" \
  --exclude="./skills" \
  --exclude="./*.log" \
  --exclude="./dev.log" \
  --exclude="./server.log" \
  --exclude="./.DS_Store" \
  -C "$(dirname "$PROJECT_DIR")" \
  "$(basename "$PROJECT_DIR")"

SIZE=$(du -sh "$BACKUP_NAME" | cut -f1)
echo "✅ Backup selesai: $BACKUP_NAME ($SIZE)"
```

Jalankan dengan:
```bash
chmod +x scripts/create-backup.sh
bash scripts/create-backup.sh
```

---

### Langkah 3 — Perbaiki Bug Invoice No (Database Migration)

```bash
# Buat file migration baru
cat > supabase/migrations/20260429000001_add_invoice_no_unique.sql << 'EOF'
-- Fix BUG-01: Add UNIQUE constraint on invoice_no to prevent duplicates
-- This resolves the TODO in:
--   src/app/api/pwa/[code]/orders/route.ts:184
--   src/app/api/transactions/route.ts:437

ALTER TABLE transactions 
  ADD CONSTRAINT transactions_invoice_no_unique UNIQUE (invoice_no);

-- Verify no existing duplicates first (run manually before migration if unsure)
-- SELECT invoice_no, COUNT(*) FROM transactions 
-- GROUP BY invoice_no HAVING COUNT(*) > 1;
EOF

echo "Migration file created. Jalankan: npx supabase db push"
```

---

### Langkah 4 — Perbaiki `next.config.ts`

Edit `next.config.ts`:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ['pg', 'bcryptjs', '@prisma/client', 'prisma', 'ioredis', 'bullmq', 'pino', 'pino-pretty'],
  
  // ❌ HAPUS BARIS INI:
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  
  // ✅ GANTI DENGAN:
  typescript: {
    ignoreBuildErrors: false,  // wajibkan TypeScript valid
  },

  reactStrictMode: true,  // ✅ aktifkan kembali (sebelumnya false)
  
  // ... sisa konfigurasi tetap sama
};
```

---

### Langkah 5 — Aktifkan ESLint Bertahap

Edit `eslint.config.mjs`, ubah dari `"off"` ke `"warn"` untuk aturan kritis:
```js
rules: {
  // Aktifkan kembali sebagai warning dulu
  "@typescript-eslint/no-explicit-any": "warn",      // ← dari "off"
  "@typescript-eslint/no-unused-vars": "warn",       // ← dari "off"
  "react-hooks/exhaustive-deps": "warn",             // ← dari "off"
  
  // Tetap matikan yang benar-benar tidak relevan
  "react/no-unescaped-entities": "off",
  "react/display-name": "off",
}
```

---

### Langkah 6 — Verifikasi Hasil

Setelah semua perbaikan:

```bash
# 1. Buat backup bersih
bash scripts/create-backup.sh

# 2. Cek ukuran
ls -lh razkindo-backup_*.tar.gz

# 3. Jalankan migration
npx supabase db push
# atau
bun run db:migrate

# 4. Test build
bun run build

# 5. Jalankan ESLint
bun run lint
```

---

## 📋 Checklist Prioritas

### 🔴 Kritis (Kerjakan Sekarang)
- [ ] Buat `.gitignore` → mencegah node_modules & secrets masuk backup
- [ ] Jalankan migration `UNIQUE constraint` pada `invoice_no`
- [ ] Hapus `.env` dan `db/.auth-secret` dari backup berikutnya

### 🟡 Penting (Kerjakan Minggu Ini)
- [ ] Ubah `ignoreBuildErrors: false` di `next.config.ts`
- [ ] Aktifkan `reactStrictMode: true`
- [ ] Aktifkan ESLint rules sebagai `warn`
- [ ] Tambah `.catch()` pada 32 promise yang belum dihandle

### 🟢 Jangka Panjang
- [ ] Ganti 520 `console.log` dengan wrapper logger
- [ ] Kurangi penggunaan `any` secara bertahap
- [ ] Tambah React Error Boundary di komponen utama

---

## 🎯 Kesimpulan

**Ukuran file dapat dikurangi dari 84 MB menjadi 7.3 MB** (91% lebih kecil) hanya dengan mengecualikan `node_modules/` dari backup — tidak ada fungsi sistem yang berkurang karena `node_modules` selalu bisa di-generate ulang dengan `bun install`.

Akar masalah utama adalah **tidak adanya file `.gitignore`** yang menyebabkan folder-folder yang tidak perlu ikut ter-archive. Membuat `.gitignore` dan script backup yang benar adalah prioritas paling penting.

---
*Laporan dibuat secara otomatis — Audit Razkindo ERP v0.2.0*
