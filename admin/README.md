# LaksaApp Admin

Panel admin statis untuk Worker LaksaApp. Login memakai OTP Telegram dan seluruh
operasi administratif dikirim ke Worker melalui HTTPS.

## Deployment

Cloudflare Pages tidak memerlukan build command:

- Root directory: repository ini
- Build command: kosong
- Build output directory: `.`

File `_headers` wajib ikut terpublikasi. File ini mencegah caching halaman admin,
clickjacking, MIME sniffing, dan pemuatan resource yang tidak diizinkan.

GitHub Pages dapat menyajikan panel ini, tetapi tidak menerapkan file `_headers`.
Untuk panel admin produksi, gunakan domain Cloudflare Pages
`admin.laksaapp.my.id`.

## Pembayaran

Panel ini tidak menyimpan atau menampilkan gambar QRIS. Transaksi pending hanya
ditampilkan sebagai “Menunggu gateway”; aktivasi Premium dilakukan Worker
setelah webhook KlikQRIS lolos verifikasi signature, order ID, nominal, dan
status dari Status API.

Secret KlikQRIS hanya boleh disimpan pada Cloudflare Worker:

```bash
wrangler secret put KLIKQRIS_MERCHANT_ID
wrangler secret put KLIKQRIS_API_KEY
```

Jangan menaruh secret, token bot, atau API key pada repository maupun environment
Cloudflare Pages.
