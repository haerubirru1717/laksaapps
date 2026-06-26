# Laksa — Implementasi PWA (Progressive Web App)

## Konteks Project

Web SaaS personal finance bernama **Laksa**. Frontend HTML/CSS/JS murni (tanpa framework), di-host di **Cloudflare Pages**. Tujuan PWA adalah agar user bisa menginstall Laksa di homescreen Android/iOS dan membukanya seperti aplikasi native — fullscreen tanpa browser bar.

---

## Yang Perlu Dibuat

### 1. File `manifest.json` di root repo

```json
{
  "name": "Laksa — Keuangan Pribadi",
  "short_name": "Laksa",
  "description": "Aplikasi pencatatan keuangan pribadi",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 2. Icon App

Buat folder `/icons/` di root repo, isi dengan:
- `icon-192.png` — ukuran 192x192px (icon di homescreen)
- `icon-512.png` — ukuran 512x512px (splash screen)

Icon harus berlogo Laksa. Bisa dibuat dari Figma, Canva, atau tool lain lalu export PNG.

### 3. File `service-worker.js` di root repo

```js
const CACHE_NAME = 'laksa-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/core.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/pages.css',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/receipt.js',
  '/js/keuangan.js',
  '/js/reports.js',
  '/js/settings.js',
  '/js/modals.js',
  '/banks.js',
  '/ai-chat.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Jangan cache request ke API/Worker
  if (e.request.url.includes('workers.dev') || e.request.url.includes('accounts.google.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

### 4. Tambahkan di `index.html` bagian `<head>`

```html
<!-- PWA -->
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#2563eb" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Laksa" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

### 5. Register service worker di `index.html` sebelum `</body>`

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .catch(err => console.log('SW error:', err));
    });
  }
</script>
```

---

## Struktur File Setelah Implementasi

```
repo/
├── index.html          ← ditambah tag PWA & register SW
├── manifest.json       ← baru
├── service-worker.js   ← baru
├── _redirects          ← dari implementasi routing
├── icons/
│   ├── icon-192.png    ← baru
│   └── icon-512.png    ← baru
├── css/
├── js/
└── ...
```

---

## Hasil Setelah Implementasi

- User Android: muncul banner "Tambahkan ke layar utama" otomatis
- User iOS: install manual via Safari → Share → Add to Home Screen
- Tampil fullscreen tanpa browser bar seperti app native
- Icon dan nama "Laksa" muncul di homescreen
- App tetap bisa dibuka meski offline (data tidak tampil tapi app tidak crash)

---

## Urutan Implementasi

PWA sebaiknya dikerjakan **setelah routing selesai** karena `start_url` di `manifest.json` mengacu ke `/dashboard` yang butuh routing berfungsi.

1. Selesaikan routing (`laksa-routing.md`) dulu
2. Baru implementasi PWA ini

---

## Catatan Penting

- Versi cache `laksa-v1` di service worker harus diupdate setiap ada perubahan file statis — ganti jadi `laksa-v2`, `laksa-v3`, dst
- PWA hanya jalan di HTTPS — Cloudflare Pages sudah HTTPS by default
- Test installasi di Chrome Android untuk memastikan semua berjalan
