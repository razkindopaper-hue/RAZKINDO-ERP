# 🛠️ Razkindo ERP — Bug Report & Fixing Script

> Audit tanggal: 30 April 2026  
> Basis kode: `arsip30Apriljam01_28.tar`  
> Stack: Next.js 16 · Supabase (PostgREST) · Prisma · Bun · TypeScript

---

## Ringkasan Temuan

| ID | Severity | Kategori | File | Status |
|----|----------|----------|------|--------|
| BUG-01 | 🔴 Critical | Security | `auth/login/route.ts` | Fix di bawah |
| BUG-02 | 🔴 Critical | Config | `next.config.ts` | Fix di bawah |
| BUG-03 | 🟠 High | Fire-and-forget | 15+ API routes | Fix di bawah |
| BUG-04 | 🟠 High | Memory Leak | `job-queue.ts`, `processors.ts`, `worker.ts` | Fix di bawah |
| BUG-05 | 🟠 High | Security | `next.config.ts` (missing headers) | Fix di bawah |
| BUG-06 | 🟡 Medium | Token Security | `token.ts` | Fix di bawah |
| BUG-07 | 🟡 Medium | Security | `auth/login/route.ts` (error leak) | Fix di bawah |
| BUG-08 | 🟡 Medium | Auth Logic | `auth-secret.ts` | Fix di bawah |
| BUG-09 | 🟡 Medium | Role Bypass | `validators.ts` | Fix di bawah |
| IMP-01 | 🔵 Improve | Performance | `token.ts` (cache eviction) | Fix di bawah |
| IMP-02 | 🔵 Improve | Reliability | `processors.ts` (no unref) | Fix di bawah |
| IMP-03 | 🔵 Improve | Observability | `logger.ts` usage | Info |

---

## BUG-01 🔴 — Internal Error Message Bocor ke Client (Login)

**File:** `src/app/api/auth/login/route.ts`, baris ~163

**Masalah:** Catch block di `POST` login mengekspos `error?.message` langsung ke response JSON. Error internal (stack trace, nama tabel DB, koneksi string) bisa terbaca oleh penyerang.

**Kode bermasalah:**
```ts
// ❌ SALAH — error.message bisa mengandung info internal
return NextResponse.json({ error: error?.message || 'Terjadi kesalahan server' }, { status: 500 });
```

**Fix:**
```ts
// ✅ BENAR — log detail ke server, kirim pesan generik ke client
console.error('[Login] Server error:', error?.message || error);
return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
```

**Cara apply:**
```bash
# File: src/app/api/auth/login/route.ts
# Cari baris terakhir di catch block (sekitar baris 162-163):
sed -i 's/return NextResponse.json({ error: error?.message || .Terjadi kesalahan server. }, { status: 500 });/return NextResponse.json({ error: '"'"'Terjadi kesalahan server'"'"' }, { status: 500 });/' \
  src/app/api/auth/login/route.ts
```

**Atau edit manual** — ganti baris di catch block login:
```ts
// Sebelum:
return NextResponse.json({ error: error?.message || 'Terjadi kesalahan server' }, { status: 500 });

// Sesudah:
return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
```

---

## BUG-02 🔴 — TypeScript Build Errors Diabaikan

**File:** `next.config.ts`, baris ~6-8

**Masalah:** `ignoreBuildErrors: true` aktif. TypeScript errors di-skip saat build production. Bug tipe data lolos ke production tanpa terdeteksi.

**Kode bermasalah:**
```ts
// ❌ SALAH
typescript: {
  ignoreBuildErrors: true,
},
```

**Fix:**
```ts
// ✅ BENAR
typescript: {
  ignoreBuildErrors: false,
},
```

**Cara apply:**
```bash
# Setelah fix ini, jalankan dulu:
bun run lint 2>&1 | head -50
# Perbaiki semua TS error yang muncul, lalu aktifkan false
```

> **Catatan:** Karena worklog menyebut ada 1708 lint warnings, aktifkan secara bertahap. Prioritaskan fix error sebelum mengaktifkan flag ini.

---

## BUG-03 🟠 — `createLog` / `createEvent` Tidak Di-`await` (Fire-and-Forget Tak Aman)

**File:** 15+ file di `src/app/api/`

**Masalah:** `createLog()` dan `createEvent()` dipanggil tanpa `await`. Jika DB sedang padat atau terjadi error, log hilang tanpa trace. Lebih buruk: jika fungsi ini melempar exception, Next.js bisa menampilkan unhandled promise rejection.

**Daftar file bermasalah:**
```
src/app/api/system/reset/route.ts:24
src/app/api/customers/recycle/route.ts:66
src/app/api/customers/[id]/lost/route.ts:71
src/app/api/customers/[id]/route.ts:114
src/app/api/customers/[id]/follow-up/route.ts:161
src/app/api/superadmin/monitoring/reassign/route.ts:64
src/app/api/suppliers/route.ts:83
src/app/api/suppliers/[id]/route.ts:93, 157
src/app/api/courier/deliver/route.ts:197, 201, 204
src/app/api/courier/handover/route.ts:203
src/app/api/finance/cash-boxes/route.ts:55
src/app/api/finance/cash-boxes/[id]/deposit/route.ts:79
src/app/api/finance/requests/route.ts:123
src/app/api/finance/requests/[id]/route.ts:130, 146, 353, 368
src/app/api/payment/[invoiceNo]/proof/route.ts:256
src/app/api/pwa/[code]/orders/route.ts:316
src/app/api/pwa/[code]/upload-proof/route.ts:220
src/app/api/pwa/[code]/referrals/route.ts:282
src/app/api/pwa/[code]/cashback/withdraw/route.ts:151
```

**Fix — Pilih salah satu pendekatan:**

**Opsi A (Recommended): Gunakan helper void wrapper** — log tetap fire-and-forget tapi error tertangkap:
```ts
// Tambahkan helper di src/lib/supabase-helpers.ts
export function fireAndForget(promise: Promise<any>): void {
  promise.catch(err => console.error('[FireAndForget]', err));
}
```

Lalu di semua route yang memanggil `createLog` / `createEvent` tanpa await:
```ts
// Sebelum:
createLog(db, { ... });

// Sesudah:
fireAndForget(createLog(db, { ... }));
```

**Opsi B: Await semua createLog** — pastikan semua log berhasil ditulis sebelum return:
```ts
// Sebelum:
createLog(db, { type: 'activity', ... });
return NextResponse.json({ success: true });

// Sesudah:
await createLog(db, { type: 'activity', ... });
return NextResponse.json({ success: true });
```

**Script otomatis (gunakan dengan hati-hati, test dulu):**
```bash
# Tambah 'await' di depan semua createLog( dan createEvent( tanpa await di API routes
find src/app/api -name "*.ts" -exec grep -l "createLog\|createEvent" {} \; | while read f; do
  # Hanya tambahkan await jika belum ada
  sed -i '/^\s\+[^\/\/]\+createLog\|^\s\+[^\/\/]\+createEvent/{/await /!s/^\(\s*\)\(createLog\|createEvent\)/\1await \2/}' "$f"
done
```

---

## BUG-04 🟠 — `setInterval` Tanpa `.unref()` Mencegah Graceful Shutdown

**File:** `src/lib/job-queue.ts:214`, `src/lib/processors.ts:370,380`, `src/lib/worker.ts:49`

**Masalah:** `setInterval` tanpa `.unref()` membuat Node.js process tidak bisa shutdown bersih (SIGTERM diabaikan karena ada timer aktif). Di STB deployment, ini menyebabkan process zombie setelah `kill` atau restart.

**Kode bermasalah:**
```ts
// src/lib/job-queue.ts:214
setInterval(processFallbackQueue, FALLBACK_PROCESS_INTERVAL); // ❌ tidak ada .unref()

// src/lib/processors.ts:370, 380
setInterval(async () => { ... }, 60 * 60 * 1000); // ❌ tidak ada .unref()

// src/lib/worker.ts:49
setInterval(() => { ... }, 5 * 60 * 1000); // ❌ tidak ada .unref()
```

**Fix:**
```ts
// src/lib/job-queue.ts:214
const _fallbackTimer = setInterval(processFallbackQueue, FALLBACK_PROCESS_INTERVAL);
if (_fallbackTimer.unref) _fallbackTimer.unref();

// src/lib/processors.ts:370 — cleanup expired password resets
const _cleanupTimer = setInterval(async () => {
  try { ... } catch { }
}, 60 * 60 * 1000);
if (_cleanupTimer.unref) _cleanupTimer.unref();

// src/lib/processors.ts:380 — low stock check
const _stockTimer = setInterval(async () => {
  try { ... } catch { }
}, 30 * 60 * 1000);
if (_stockTimer.unref) _stockTimer.unref();

// src/lib/worker.ts:49
const _heartbeatTimer = setInterval(() => { ... }, 5 * 60 * 1000);
if (_heartbeatTimer.unref) _heartbeatTimer.unref();
```

**Cara apply manual di `src/lib/job-queue.ts`:**
```ts
// Cari baris:
setInterval(processFallbackQueue, FALLBACK_PROCESS_INTERVAL);

// Ganti dengan:
const _fallbackQueueTimer = setInterval(processFallbackQueue, FALLBACK_PROCESS_INTERVAL);
if (_fallbackQueueTimer.unref) _fallbackQueueTimer.unref();
```

---

## BUG-05 🟠 — Missing Security Headers (CSP & X-Frame-Options)

**File:** `next.config.ts`

**Masalah:** Header keamanan penting tidak ada:
- Tidak ada `Content-Security-Policy` → rentan XSS
- Tidak ada `X-Frame-Options` → rentan Clickjacking
- Tidak ada `Strict-Transport-Security` → rentan downgrade attack di production

**Fix — Tambahkan ke `next.config.ts` di dalam `headers()`:**
```ts
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // ✅ TAMBAHKAN INI:
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval diperlukan Next.js
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self'",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.moota.co",
            "frame-ancestors 'self'",
          ].join('; '),
        },
        // Aktifkan HSTS hanya di production (bukan STB local):
        ...(process.env.NODE_ENV === 'production' && !isSTB ? [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ] : []),
        ...(isSTB ? [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ] : []),
      ],
    },
    // ... rest of headers
  ];
},
```

---

## BUG-06 🟡 — Token Minimum Length Check Terlalu Rendah

**File:** `src/lib/token.ts`, baris ~47

**Masalah:** Token divalidasi dengan `token.length < 30`, tapi token yang valid (userId + timestamp + HMAC) setelah base64 encoding minimal ~138 karakter. Threshold 30 tidak efektif untuk menolak token palsu.

**Kode bermasalah:**
```ts
// ❌ SALAH — threshold terlalu rendah
if (token.length < 30 || token.length > 500) return null;
```

**Fix:**
```ts
// ✅ BENAR — threshold realistis berdasarkan struktur token
// UUID(36) + ':' + timestamp(13) + ':' + HMAC-SHA256-hex(64) = 114 chars
// base64(114) ≈ 152 chars
if (token.length < 100 || token.length > 500) return null;
```

---

## BUG-07 🟡 — Error Message Bocor di Banyak Route (Pola Berulang)

**File:** `src/app/api/customers/[id]/route.ts`, `sales-tasks/route.ts`, `custom-roles/route.ts`, dll.

**Masalah:** Pola `error?.message || 'Terjadi kesalahan server'` berulang di banyak route. Error message dari DB (nama kolom, constraint, query info) bisa terbaca user.

**Daftar file:**
```
src/app/api/customers/[id]/route.ts:132, 178
src/app/api/sales-tasks/route.ts:71, 125
src/app/api/sales-tasks/[id]/route.ts:39, 107, 129
src/app/api/sales-tasks/[id]/report/route.ts:75
src/app/api/custom-roles/route.ts:51, 94, 100
src/app/api/custom-roles/[id]/route.ts:47
src/app/api/superadmin/monitoring/route.ts:233
src/app/api/superadmin/monitoring/reassign/route.ts:84
src/app/api/suppliers/[id]/route.ts:43
```

**Fix — Script untuk semua route:**
```bash
# Ganti semua pola error?.message di catch blocks
find src/app/api -name "*.ts" -exec sed -i \
  "s/NextResponse.json({ error: error?.message || 'Terjadi kesalahan server' }/NextResponse.json({ error: 'Terjadi kesalahan server' }/g" \
  {} \;

find src/app/api -name "*.ts" -exec sed -i \
  "s/NextResponse.json({ error: error.message || 'Gagal membuat role' }/NextResponse.json({ error: 'Gagal membuat role' }/g" \
  {} \;
```

---

## BUG-08 🟡 — `getAuthSecret()` Tidak Konsisten di Production

**File:** `src/lib/auth-secret.ts`, baris ~103-115

**Masalah:** Di production (`NODE_ENV=production`), jika `AUTH_SECRET` tidak di-set, kode **melempar Error** (benar). Namun `_cachedSecret` tidak pernah diisi karena throw terjadi sebelum assignment. Ini menyebabkan setiap request yang memanggil `getAuthSecret()` akan throw berulang kali (tidak di-cache).

**Kode bermasalah:**
```ts
export function getAuthSecret(): string {
  if (_cachedSecret) return _cachedSecret; // ← cache check

  const AUTH_SECRET = process.env.AUTH_SECRET;

  if (!AUTH_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Auth] FATAL: AUTH_SECRET...'); // ← throw, _cachedSecret tidak pernah di-set
    }
    console.warn('...');
  }

  _cachedSecret = AUTH_SECRET || getOrCreateFallbackSecret();
  return _cachedSecret;
}
```

**Fix:** Perilakunya sudah correct (throw di production memang yang diinginkan). Tapi dokumentasikan dengan jelas bahwa `AUTH_SECRET` **wajib** di `.env` production. Tambahkan startup check:

```ts
// src/lib/auth-secret.ts — tambahkan di bawah semua definisi fungsi
// Startup validation — crash fast jika production tanpa AUTH_SECRET
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  console.error('[Auth] FATAL: AUTH_SECRET harus di-set di .env production');
  process.exit(1); // Crash intentional agar deployment gagal cepat
}
```

**Dan pastikan `.env` production berisi:**
```env
AUTH_SECRET=<random 64 hex chars>
# Generate dengan: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## BUG-09 🟡 — Role Validation Dapat Di-bypass via Custom Role

**File:** `src/lib/validators.ts`, baris ~51-53

**Masalah:** Schema register menggunakan `.or(z.string().min(1).max(50))` yang memungkinkan string apapun sebagai role. Meski komentar menyebut "NOT super_admin bypass", validasi di database-level perlu dikonfirmasi.

**Kode yang perlu audit:**
```ts
role: z.enum(['super_admin', 'sales', ...], {
  error: 'Role tidak valid',
}).or(z.string().min(1).max(50)), // Custom roles accepted but NOT super_admin bypass
```

**Risiko:** Jika API `/api/auth/register` tidak memverifikasi role lebih lanjut di DB-level, user bisa mendaftar dengan role sembarang.

**Fix — Tambahkan server-side role validation di `src/app/api/auth/register/route.ts`:**
```ts
// Setelah validasi Zod berhasil, tambahkan check:
const systemRoles = ['super_admin', 'sales', 'kurir', 'keuangan', 'admin', 'manager', 'gudang', 'ob', 'sopir'];
if (!systemRoles.includes(data.role)) {
  // Ini custom role — verifikasi custom_role_id valid di DB
  if (!data.customRoleId) {
    return NextResponse.json({ error: 'Custom role harus menyertakan customRoleId yang valid' }, { status: 400 });
  }
  const { data: customRole } = await db.from('custom_roles').select('id').eq('id', data.customRoleId).maybeSingle();
  if (!customRole) {
    return NextResponse.json({ error: 'Custom role tidak ditemukan' }, { status: 400 });
  }
}
// Cegah pendaftaran super_admin kecuali oleh super_admin existing
if (data.role === 'super_admin') {
  return NextResponse.json({ error: 'Tidak dapat mendaftar sebagai super_admin' }, { status: 403 });
}
```

---

## IMP-01 🔵 — Cache Eviction di `token.ts` Tidak Efisien

**File:** `src/lib/token.ts`, baris ~87-99

**Masalah:** Ketika cache penuh (`>= 1000 entries`), kode iterasi Map dan hapus 100 entries pertama (bukan yang paling lama/expired). Ini bisa menghapus user aktif.

**Kode bermasalah:**
```ts
// ❌ Menghapus entry PERTAMA (urutan insert), bukan yang paling lama expired
if (_userCache.size >= USER_CACHE_MAX_SIZE) {
  let count = 0;
  for (const key of _userCache.keys()) {
    _userCache.delete(key);
    count++;
    if (count >= 100) break;
  }
}
```

**Fix:**
```ts
// ✅ Hapus entry yang SUDAH EXPIRED lebih dulu
function evictUserCache(): void {
  const now = Date.now();
  // Pass 1: hapus yang expired
  for (const [key, entry] of _userCache) {
    if (entry.expiresAt <= now) _userCache.delete(key);
  }
  // Pass 2: jika masih penuh, hapus 100 yang paling lama (oldest expiresAt)
  if (_userCache.size >= USER_CACHE_MAX_SIZE) {
    const sorted = [..._userCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    sorted.slice(0, 100).forEach(([key]) => _userCache.delete(key));
  }
}
```

---

## IMP-02 🔵 — `setInterval` di `processors.ts` Tidak Memakai `.unref()`

(Lihat BUG-04 di atas — ini bagian dari perbaikan yang sama)

---

## IMP-03 🔵 — `reactStrictMode: false` Sebaiknya Diperbaiki

**File:** `next.config.ts`

**Masalah:** `reactStrictMode: false` dinonaktifkan karena "ERP components have side effects that break with double-mount". Ini menyembunyikan bug React yang nyata di production.

**Rekomendasi:** Perbaiki komponen yang terpengaruh satu per satu menggunakan `useEffect` cleanup, lalu aktifkan kembali. Ini bukan quick fix tapi penting untuk kualitas jangka panjang.

---

## Urutan Prioritas Eksekusi Fix

```bash
# ============================================================
# SATU SCRIPT UNTUK SEMUA FIX — jalankan dari root project
# ============================================================

echo "=== FIX 1: Sembunyikan error internal di login route ==="
# Ganti: error?.message || 'Terjadi kesalahan server'
# Jadi:  'Terjadi kesalahan server'  (satu baris di catch block)
sed -i "s/return NextResponse.json({ error: error?.message || 'Terjadi kesalahan server' }, { status: 500 });/return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });/g" \
  src/app/api/auth/login/route.ts

echo "=== FIX 2: setInterval unref di job-queue.ts ==="
sed -i 's/^setInterval(processFallbackQueue, FALLBACK_PROCESS_INTERVAL);/const _fallbackQueueTimer = setInterval(processFallbackQueue, FALLBACK_PROCESS_INTERVAL);\nif (_fallbackQueueTimer.unref) _fallbackQueueTimer.unref();/' \
  src/lib/job-queue.ts

echo "=== FIX 3: Token minimum length ==="
sed -i "s/if (token.length < 30 || token.length > 500) return null;/if (token.length < 100 || token.length > 500) return null;/" \
  src/lib/token.ts

echo "=== FIX 4: Tambah fireAndForget helper di supabase-helpers.ts ==="
cat >> src/lib/supabase-helpers.ts << 'EOF'

/**
 * Fire-and-forget wrapper — panggil promise tanpa menunggu, tapi tangkap error.
 * Gunakan untuk createLog/createEvent agar error tidak hilang tanpa trace.
 */
export function fireAndForget(promise: Promise<any>): void {
  promise.catch(err => console.error('[FireAndForget] Unhandled async error:', err));
}
EOF

echo "=== FIX 5: TypeScript ignoreBuildErrors → false (lakukan setelah semua TS error diperbaiki) ==="
# PERINGATAN: Aktifkan hanya setelah menjalankan 'bun run lint' dan memperbaiki semua TS error
# sed -i 's/ignoreBuildErrors: true/ignoreBuildErrors: false/' next.config.ts

echo ""
echo "=== MANUAL FIXES yang harus dilakukan (tidak bisa di-sed) ==="
echo ""
echo "1. processors.ts baris 370 dan 380:"
echo "   Bungkus setiap setInterval dengan: const t = setInterval(...); if(t.unref) t.unref();"
echo ""
echo "2. worker.ts baris 49:"
echo "   Bungkus setInterval dengan: const t = setInterval(...); if(t.unref) t.unref();"
echo ""
echo "3. next.config.ts — tambahkan X-Frame-Options dan Content-Security-Policy di headers()"
echo ""
echo "4. token.ts — perbaiki fungsi evictUserCache() (lihat IMP-01 di atas)"
echo ""
echo "5. auth/register/route.ts — tambahkan server-side role validation (lihat BUG-09)"
echo ""
echo "6. Tambahkan di .env production:"
echo "   AUTH_SECRET=\$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"

echo ""
echo "=== Verifikasi Fix ==="
echo "Jalankan:"
echo "  bun run lint 2>&1 | grep -E 'error|Error' | head -20"
echo "  curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{}'"
echo "  # Pastikan tidak ada error message internal di response"
```

---

## Checklist Verifikasi

Setelah semua fix diaplikasikan:

- [ ] `GET /api/auth/login` dengan body invalid → response hanya `{ "error": "..." }` tanpa detail internal
- [ ] `bun run lint` → 0 lint errors (warnings boleh ada)
- [ ] Server bisa shutdown bersih dengan `SIGTERM` tanpa hang
- [ ] `AUTH_SECRET` terset di `.env` production
- [ ] Header `X-Frame-Options: SAMEORIGIN` muncul di response (`curl -I http://localhost:3000`)
- [ ] `Content-Security-Policy` header ada di response
- [ ] Login dengan role `super_admin` via `/api/auth/register` → ditolak 403

---

## File yang Tidak Perlu Diubah

Setelah audit, file berikut **sudah benar** dan tidak perlu dimodifikasi:

- `src/lib/supabase.ts` — arsitektur db client sudah tepat
- `src/lib/validators.ts` — Zod v4 syntax (`error:` di enum) sudah benar
- `src/lib/auth-secret.ts` — logika production throw sudah benar
- `src/lib/rate-limiter.ts` — implementasi rate limiting sudah solid
- `src/lib/finance-engine.ts` — double-entry pattern sudah benar
- `prisma/schema.prisma` — field `subUnit`, `conversionRate` tanpa `@map()` sudah sesuai (PostgREST menggunakan nama Prisma)
- `src/app/api/transactions/route.ts` — select `subUnit`, `conversionRate` dalam query sudah benar karena DB column memang camelCase

---

*Script ini dihasilkan dari audit manual kode pada 30 April 2026.*
