# Laksa Apps Monorepo

Repository gabungan untuk aplikasi pengguna, panel admin, dan backend Cloudflare Worker Laksa.

## Struktur

```text
laksaapps-monorepo/
├── app/      # Frontend pengguna + Cloudflare Worker
├── admin/    # Panel admin statis
└── .github/  # Workflow deployment dari root monorepo
```

## Komponen

### `app/`

- Frontend utama: `laksaapp.my.id`
- Worker API: `app/cloudflare-worker.js`
- Konfigurasi Worker: `app/wrangler.toml`
- Build frontend aman: hanya isi `app/dist/` yang boleh dipublikasikan

### `admin/`

- Panel admin: `admin.laksaapp.my.id`
- Aplikasi statis terpisah
- `_headers` wajib ikut dipublikasikan agar CSP, no-store, dan anti-clickjacking aktif

## Perintah

```bash
# Instal dependency aplikasi utama
npm run install:app

# Build frontend utama ke app/dist
npm run build:app

# Jalankan frontend utama secara lokal
npm run dev:app

# Jalankan panel admin secara lokal
npm run dev:admin

# Jalankan Worker secara lokal
npm run dev:worker

# Deploy Worker
npm run deploy:worker
```

## Deployment

- **GitHub Pages app:** workflow root `.github/workflows/pages.yml` membangun `app/dist`.
- **Cloudflare Pages app:** root directory `app`, build command `npm run build`, output `dist`.
- **Cloudflare Pages admin:** root directory `admin`, tanpa build command, output `.`.
- **Cloudflare Worker:** jalankan dari `app/` melalui `npm run deploy:worker` di root.

## Secrets

Jangan commit `.env`, `.dev.vars`, token, password, atau API key. Semua secret Worker harus disimpan menggunakan `wrangler secret put ...` sebagaimana dijelaskan di `app/README.md` dan `app/wrangler.toml`.

## Dokumentasi Detail

- Aplikasi utama: [`app/README.md`](app/README.md)
- Panel admin: [`admin/README.md`](admin/README.md)
