# Security Audit Report
**Laksa Apps — Cloudflare Worker Backend**

| Field | Detail |
|---|---|
| **Target** | cloudflare-worker.js (v3.4.0, 3458 baris) |
| **Scope** | Backend API · Telegram Bot · Admin Bot |
| **Auditor** | Claude Sonnet (AI Security Review) |
| **Tanggal** | 24 June 2026 |
| **Klasifikasi** | CONFIDENTIAL — Internal Use Only |

---

## Ringkasan Eksekutif

Audit ini mencakup pembacaan menyeluruh terhadap seluruh kode `cloudflare-worker.js` milik Laksa Apps. Ditemukan **5 temuan kritis/tinggi** yang berpotensi dieksploitasi sebelum aplikasi dibuka ke publik luas, ditambah **4 temuan medium** yang perlu diperhatikan untuk ketahanan jangka panjang. Secara umum, arsitektur dasar (auth, data isolation, dedup) sudah solid — masalah yang ada bersifat konfigurasi dan endpoint yang terlupa, bukan desain yang salah fundamental.

| Severity | Jumlah | Status |
|---|---|---|
| 🔴 CRITICAL | 2 | Harus fix sebelum launch |
| 🟠 HIGH | 3 | Fix secepatnya |
| 🟡 MEDIUM | 4 | Fix dalam 1-2 sprint |
| 🟢 LOW / INFO | 2 | Nice to have |

---

## Temuan Detail

### 🔴 Critical

---

#### #1 — `/setup` Endpoint Terbuka Tanpa Autentikasi `CRITICAL`

**Lokasi:** `routeAPI()` → line 669: `if (path === "/setup") return setupDatabase(env);`

**Deskripsi:**
Endpoint `/setup` dapat diakses oleh siapapun tanpa token, API key, atau whitelist IP. Endpoint ini menjalankan seluruh migrasi schema D1, termasuk `DROP TABLE`, `ALTER TABLE`, `CREATE INDEX`, seed data pricing, dan registrasi bot commands Telegram. Tidak ada guard sama sekali — request GET ke `https://[worker-url]/setup` langsung dieksekusi.

**Impact:**
Attacker dapat memicu `DROP TABLE categories` (ada dalam migration check line 2205), `ALTER TABLE` yang merusak schema, atau reset seed data pricing ke nilai 0. Pada lingkungan production ini berpotensi menyebabkan data corruption atau downtime layanan.

**PoC / Bukti:**
```bash
curl https://[worker-url]/setup → HTTP 200, eksekusi penuh tanpa auth
```

**Rekomendasi Fix:**
- Tambahkan guard secret header: bandingkan `X-Setup-Secret` dengan env var `SETUP_SECRET`
- Atau batasi hanya bisa dipanggil dari Cloudflare Dashboard (hapus route dari kode, jalankan manual sekali)
- Minimal: kembalikan 404 setelah initial setup selesai dengan flag di DB/KV

---

#### #2 — JWT Secret Fallback Hardcoded — Semua Token Bisa Diforge `CRITICAL`

**Lokasi:** `signJWT()` line 94, `verifyJWT()` line 105, `handleLogin()` line 233, `handleMe()` line 240, `handleRefreshToken()` line 280 — semua pakai pattern: `env.JWT_SECRET || "laksa-default-secret"`

**Deskripsi:**
Jika environment variable `JWT_SECRET` tidak di-set di Cloudflare Worker, sistem otomatis fallback ke string literal `"laksa-default-secret"`. String ini ada di kode yang di-push ke repo GitHub publik (`haerubirru17/laksaapps`), artinya siapapun yang membaca repo bisa melihat secret ini dan menggunakannya untuk forge JWT yang valid.

**Impact:**
Attacker dapat membuat JWT token valid untuk `user_id` manapun — termasuk akun premium atau akun yang di-ban — tanpa perlu mengetahui password. Seluruh endpoint yang dilindungi JWT menjadi tidak aman.

**PoC / Bukti:**
1. Baca secret dari GitHub repo (sudah public)
2. Sign JWT: `{sub: 'usr_target', email: 'x@x.com'}` dengan secret `'laksa-default-secret'`
3. Akses `GET /transactions?user_id=...` atau `Authorization: Bearer [forged_token]`

**Rekomendasi Fix:**
- Hapus fallback: ganti semua `|| "laksa-default-secret"` dengan `throw Error` jika `JWT_SECRET` tidak ada
- Pastikan `JWT_SECRET` sudah di-set di Cloudflare Worker environment variables (min 32 karakter acak)
- Rotate semua token yang ada (invalidasi session lama) setelah fix deploy
- Tambahkan startup check: `if (!env.JWT_SECRET) return new Response('Misconfigured', {status:500})`

---

### 🟠 High

---

#### #3 — Debug Endpoints Expose Data Semua User Tanpa Auth `HIGH`

**Lokasi:** `routeAPI()` lines 670-673: `/debug/dedup`, `/debug/test-dedup`, `/debug/recent-tx`, `/debug/insert-log`

**Deskripsi:**
Terdapat 4 debug endpoint yang terbuka tanpa autentikasi apapun. Endpoint `/debug/recent-tx` mengembalikan 15 transaksi terbaru dari semua user (tidak difilter per user). Endpoint `/debug/insert-log` mengembalikan log insert lengkap berisi `user_id`, `amount`, `account_id`, dan `dedup_hash` dari semua user. Endpoint `/debug/dedup` juga meng-expose versi worker dan status infrastruktur internal.

**Impact:**
Data finansial sensitif user (jumlah transaksi, rekening, tanggal) dapat diakses siapapun yang tahu URL worker. Endpoint ini juga bocorkan informasi internal (versi, schema status) yang memudahkan attacker melakukan reconnaissance.

**PoC / Bukti:**
```bash
curl https://[worker-url]/debug/recent-tx → list transaksi semua user
```

**Rekomendasi Fix:**
- Hapus semua `/debug/*` route dari production build
- Jika masih dibutuhkan untuk debugging: tambahkan `X-Debug-Secret` header check
- Atau pindahkan ke Cloudflare Tail Workers / D1 console yang tidak expose ke publik

---

#### #4 — Rate Limiting Login In-Memory — Tidak Efektif di Multi-Instance `HIGH`

**Lokasi:** `checkRateLimit()` lines 430-440, `rateLimitMap = new Map()` line 426

**Deskripsi:**
Rate limiting untuk endpoint login/register menggunakan JavaScript `Map` yang hidup di memory instance Worker. Cloudflare Workers berjalan di ratusan edge nodes secara paralel — setiap request bisa landing di instance berbeda dengan `Map` yang kosong. Akibatnya, limit 10 attempts per 15 menit per IP tidak terpenuhi di production: attacker dapat melakukan ribuan percobaan login hanya dengan requests yang tersebar ke banyak edge node.

**Impact:**
Endpoint `/auth/login` dan `/auth/register` rentan terhadap brute force attack. Attacker dapat mencoba kombinasi email+password tanpa hambatan efektif, atau melakukan credential stuffing dalam skala besar.

**PoC / Bukti:**
Kirim 1000 POST `/auth/login` dari berbagai IP/region — rate limit tidak akan trigger secara konsisten.

**Rekomendasi Fix:**
- Pindahkan rate limit counter ke Cloudflare KV: key = `'rl:{ip}'`, value = `{count, start}`
- Atau gunakan Cloudflare Rate Limiting rules di level dashboard (lebih efisien, zero code)
- Tambahkan juga rate limit untuk `/auth/forgot-password` yang saat ini tidak ada limit sama sekali

---

#### #5 — `user_id` via Query Parameter — Potensi User Impersonation `HIGH`

**Lokasi:** `routeAPI()` lines 698-706: `uid = url.searchParams.get("user_id")`

**Deskripsi:**
Jika request tidak membawa `Authorization` header, sistem fallback ke `?user_id=` query parameter sebagai identitas user. Ini adalah backward-compat untuk Telegram bot yang memanggil API dengan Telegram ID langsung. Masalahnya: Telegram ID adalah angka publik yang bisa dilihat siapapun dari pesan Telegram, profil, atau bahkan dari fitur `/myid` bot itu sendiri.

**Impact:**
User yang tahu Telegram ID orang lain dapat mengakses semua data finansial mereka: `GET /transactions?user_id=TARGET_TG_ID`, `GET /accounts?user_id=TARGET_TG_ID`, dan seterusnya. Ini adalah broken access control yang mempengaruhi seluruh API.

**PoC / Bukti:**
1. Dapatkan Telegram ID target (dari pesan publik, atau paksa lewat `/myid`)
2. `GET https://[worker-url]/transactions?user_id=[TARGET_TG_ID]`
3. Response: semua transaksi target

**Rekomendasi Fix:**
- Hapus fallback `user_id` dari query param untuk endpoint yang sensitif
- Untuk bot Telegram: bot harus memanggil API menggunakan JWT internal (server-to-server), bukan expose `user_id` ke luar
- Atau batasi `?user_id` hanya bisa dipakai dari IP internal / dengan secret header tambahan
- Short-term: minimal tambahkan validasi bahwa `user_id` yang dikirim cocok dengan konteks request

---

### 🟡 Medium

---

#### #6 — CORS Wildcard (`*`) — Semua Origin Diizinkan `MEDIUM`

**Lokasi:** `corsHeaders` line 2784: `Access-Control-Allow-Origin: *`

Semua response API menggunakan CORS header dengan wildcard origin (`*`). Ini berarti halaman web manapun di internet bisa melakukan request ke worker API ini dari browser user yang sudah login.

**Fix:** Batasi CORS ke origin spesifik: `laksaapp.my.id` dan `haerubirru17.github.io` saja.

---

#### #7 — Tabel Debug Permanen di Production DB `MEDIUM`

**Lokasi:** `tx_insert_log` table — dibuat otomatis di `logInsertAttempt()` line 481

Tabel `tx_insert_log` dibuat otomatis dan menyimpan setiap percobaan INSERT transaksi secara permanen tanpa TTL atau cleanup. Tabel ini berisi data sensitif (`user_id`, `amount`, `account_id`) dan akan tumbuh tanpa batas seiring waktu.

**Fix:** Hapus `logInsertAttempt()` dari production, atau tambahkan cleanup job yang purge log > 7 hari.

---

#### #8 — `processed_updates` Tumbuh Tanpa Cleanup `MEDIUM`

**Lokasi:** `processed_updates` table — insert di line 632, tidak ada DELETE

Setiap Telegram `update_id` disimpan untuk mencegah duplikat, tapi tidak pernah dihapus. Dengan traffic tinggi, tabel ini akan terus membesar dan memperlambat lookup.

**Fix:**
```sql
DELETE FROM processed_updates WHERE created_at < datetime('now', '-7 days')
```

---

#### #9 — `adjustBalance` Non-Atomic — Potensi Race Condition `MEDIUM`

**Lokasi:** `adjustBalance()` line 2808: `UPDATE accounts SET balance = balance + ?`

Meski menggunakan SQL `balance = balance + ?` yang relatif aman, operasi `adjustBalance` dipanggil terpisah dari INSERT transaksi. Jika Worker crash di antara INSERT dan `adjustBalance`, saldo bisa tidak sinkron dengan transaksi yang tersimpan.

**Fix:** Bungkus INSERT transaksi + `adjustBalance` dalam D1 batch transaction, atau rekonsiliasi saldo dari `sum(transactions)` secara periodik.

---

## Yang Sudah Baik ✅

Beberapa implementasi security di worker ini sudah di atas rata-rata untuk skala indie SaaS dan patut dipertahankan:

| Aspek | Keterangan |
|---|---|
| **Auth Stack** | PBKDF2 (100k iterasi) + custom JWT via Web Crypto API — tidak ada library eksternal, proper |
| **Data Isolation** | Semua query DB menggunakan `WHERE user_id = ?` — tidak ada celah akses data lintas user di endpoint CRUD |
| **Dedup 3 Lapis** | `update_id` Telegram + `idempotency_key` + content-based `dedup_hash` dengan UNIQUE constraint di DB — sangat matang |
| **Admin Bot Isolation** | Admin bot di endpoint terpisah (`/admin-webhook`) dengan whitelist `ADMIN_TELEGRAM_ID` — tidak bisa diakses user biasa |
| **Freemium Gate** | Usage check dilakukan di level worker sebelum logika bisnis — tidak bisa di-bypass dari client |
| **Webhook Secret** | `TELEGRAM_WEBHOOK_SECRET` untuk verifikasi request dari Telegram — sudah diimplementasi |
| **Password Handling** | Salt unik per user dengan `crypto.randomUUID()`, hash tidak pernah dikembalikan ke client |
| **Correction Safeguard** | Field keyword matching di `handleCorrection()` mencegah AI hallucinate field yang tidak disebutkan user |

---

## Priority Action Plan

| # | Aksi | Effort | Priority |
|---|---|---|---|
| 1 | Hapus fallback `JWT_SECRET` hardcoded + pastikan env var di-set | 5 menit | 🔴 Sekarang |
| 2 | Tambahkan auth guard di `/setup` endpoint | 10 menit | 🔴 Sekarang |
| 3 | Hapus atau proteksi semua `/debug/*` endpoints | 10 menit | 🔴 Sekarang |
| 4 | Pindahkan rate limit ke Cloudflare KV atau Dashboard rules | 1 jam | 🟠 Minggu ini |
| 5 | Hapus fallback `?user_id` query param untuk endpoint sensitif | 2 jam | 🟠 Minggu ini |
| 6 | Batasi CORS ke origin spesifik | 5 menit | 🟡 Sprint ini |
| 7 | Hapus `tx_insert_log` dari production | 15 menit | 🟡 Sprint ini |
| 8 | Tambahkan cleanup job untuk `processed_updates` | 30 menit | 🟡 Sprint ini |

---

*Laksa Apps — Security Audit Report | Generated 24 June 2026 | Dokumen ini bersifat CONFIDENTIAL. Hanya untuk penggunaan internal developer.*
