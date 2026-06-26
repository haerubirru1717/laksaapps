const CACHE_NAME = 'laksa-v1.8';
const ASSETS = [
  '/',
  '/index.html',
  '/css/core.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/pages.css',
  '/js/app.js',
  '/js/config.js',
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
  if (
    e.request.url.includes('workers.dev') || 
    e.request.url.includes('accounts.google.com') ||
    e.request.method !== 'GET'
  ) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(e.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Ignore network errors in background revalidation
        });
      return cached || networkFetch;
    })
  );
});
