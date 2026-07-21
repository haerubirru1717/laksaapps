const CACHE_NAME = 'laksa-v15';

const ASSETS = [
  '/',
  '/index.html',
  '/css/core.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/pages.css',
  '/css/main.css',
  '/js/app.js',
  '/js/config.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/receipt.js',
  '/js/keuangan.js',
  '/js/reports.js',
  '/js/report-export.js',
  '/js/settings.js',
  '/js/modals.js',
  '/banks.js',
  '/ai-chat.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/laksa-na.svg',
  '/icons/icon-makanan.svg',
  '/icons/icon-belanja.svg',
  '/icons/icon-transportasi.svg',
  '/icons/icon-tagihan.svg',
  '/icons/icon-hiburan.svg',
  '/icons/icon-kesehatan.svg',
  '/icons/icon-pendidikan.svg',
  '/icons/icon-perawatan-diri.svg',
  '/icons/icon-rumah-tangga.svg',
  '/icons/icon-pajak.svg',
  '/icons/icon-cicilan.svg',
  '/icons/icon-sosial.svg',
  '/icons/icon-tabungan.svg',
  '/icons/icon-gaji.svg',
  '/icons/icon-freelance.svg',
  '/icons/icon-bonus.svg',
  '/icons/icon-investasi.svg',
  '/icons/icon-hadiah.svg',
  '/icons/icon-penjualan.svg',
  '/icons/icon-refund.svg',
  '/icons/icon-transfer.svg',
  '/icons/icon-pemasukan-lain.svg',
  '/icons/icon-pengeluaran-lain.svg'
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

// Network-first strategy: always try fresh from server, fallback to cache if offline
self.addEventListener('fetch', e => {
  if (
    e.request.url.includes('workers.dev') || 
    e.request.url.includes('accounts.google.com') ||
    e.request.method !== 'GET'
  ) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
