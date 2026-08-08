# Keamanan Produksi Laksa — Tindakan Manual

Patch source saat ini masih berada di repository lokal dan belum melindungi produksi sampai Anda melakukan deployment. Kerjakan langkah-langkah berikut secara berurutan.

## P0 — Insiden kredensial bot admin

1. Cabut token bot admin yang sekarang melalui **BotFather**.
2. Buat token pengganti.
3. Perbarui secret Cloudflare Worker:

   ```bash
   cd app
   npx wrangler secret put ADMIN_BOT_TOKEN
   ```

4. Rotasi `ADMIN_TELEGRAM_WEBHOOK_SECRET`. Nilainya harus berbeda dari webhook secret bot konsumen.
5. Daftarkan ulang webhook bot admin menggunakan token baru dan webhook secret baru.
6. Periksa aktivitas bot Telegram sejak URL file yang mengandung token pertama kali dipublikasikan.
7. Anggap OTP, command admin, dan password plaintext yang pernah dikirim melalui bot admin lama berpotensi terekspos.

**Jangan pernah menempelkan token ke Git, chat Telegram, screenshot, atau dokumen checklist ini.**

## P0 — Hapus pengaturan produksi yang membocorkan token

Sebelum mengubah D1 produksi, ekspor atau backup database terlebih dahulu. Setelah backup selesai, hapus pengaturan lama:

```sql
DELETE FROM app_settings WHERE key = 'qris_image_url';
```

Verifikasi hasilnya:

```sql
SELECT key FROM app_settings WHERE key = 'qris_image_url';
```

Hasil yang diharapkan: **tidak ada baris yang dikembalikan**.

## Deploy Cloudflare Worker yang sudah dipatch

Dari root monorepo, jalankan pengujian terlebih dahulu:

```bash
npm run test:security
npm run build:app
```

Setelah semua pemeriksaan lulus, deploy Worker:

```bash
cd app
npm ci
npm run deploy:worker
```

Jangan menjalankan `/setup` pada produksi sebelum schema kategori lama diperiksa. Jika schema lama masih digunakan, siapkan migrasi **backup → copy → validasi → rename** terlebih dahulu.

## Deploy frontend secara aman

- Perintah build frontend utama: `npm ci && npm run build`
- Folder output frontend utama: `dist`
- Deploy panel admin yang sudah dipatch ke Cloudflare Pages.
- Setelah cutover berhasil, lepaskan `admin.laksaapp.my.id` dari GitHub Pages.
- Invalidasi seluruh sesi admin lama setelah deployment.

## Gerbang verifikasi setelah deployment

Semua pemeriksaan berikut harus lulus:

- `GET /pricing/public` tidak mengandung `qris_url` atau URL file Telegram.
- `/cloudflare-worker.js` mengembalikan `404`.
- `/wrangler.toml` mengembalikan `404`.
- `admin.laksaapp.my.id` tidak lagi mengirim header `Server: GitHub.com`.
- Panel admin mengirim CSP, anti-framing, `X-Content-Type-Options`, `Referrer-Policy`, dan `Cache-Control: no-store`.
- Command bot konsumen dan bot admin dari group chat ditolak.
- Bot admin tidak lagi mengenali command `/resetpw`.
- JWT admin lama tidak dapat digunakan setelah rotasi identitas/session admin.
- Penghapusan user tidak menghapus baris payment ledger.
- Backup produksi tersedia sebelum migrasi schema apa pun dijalankan.

## Pemeriksaan pembayaran sebelum menerima pembayaran berikutnya

Bagian berikut masih membutuhkan pengembangan lanjutan dan pengujian melalui staging/provider:

- Reservasi kupon secara atomik dan pelepasan reservasi ketika pembayaran gagal atau kedaluwarsa.
- Mencegah beberapa checkout aktif untuk user dan paket yang sama.
- Menangani callback provider berstatus `EXPIRED` secara idempoten.
- Menambahkan reconciliation job untuk pembayaran berhasil yang callback-nya terlewat.
- Menambahkan transactional outbox untuk notifikasi pembayaran.
- Menjadikan payment ledger append-only serta menyiapkan prosedur refund dan rekonsiliasi.

## Sebelum push ke GitHub

Jalankan pemeriksaan lokal:

```bash
npm run test:security
npm run build:app
npm --prefix app audit --audit-level=low
git diff --check
git status --short
```

Pastikan tidak ada file berikut yang ikut Git:

- `.env`
- `.dev.vars`
- `.wrangler/`
- `node_modules/`
- `dist/`
- `.codegraph/`
- file private key atau credential lainnya
