import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

const htmlPath = new URL('app/checkout.html', root);
const jsPath = new URL('app/js/checkout.js', root);
const cssPath = new URL('app/css/pages/checkout.css', root);

test('checkout source files and production build integration exist', () => {
  assert.ok(existsSync(htmlPath));
  assert.ok(existsSync(jsPath));
  assert.ok(existsSync(cssPath));
  assert.match(read('app/scripts/build-public.mjs'), /"checkout\.html"/);
  assert.doesNotMatch(read('app/_redirects'), /^\/checkout\s+\/checkout\.html\s+200$/m);
  assert.match(read('app/service-worker.js'), /\/checkout\.html/);
  assert.match(read('app/service-worker.js'), /\/js\/checkout\.js/);
  assert.match(read('app/service-worker.js'), /\/css\/pages\/checkout\.css/);
});

test('checkout markup is accessible, complete, and has no inline handlers', () => {
  const html = read('app/checkout.html');
  assert.match(html, /id="checkoutQr"[^>]+alt="QRIS pembayaran Laksa"/);
  for (const id of ['checkoutStatus', 'planLabel', 'baseAmount', 'discountAmount', 'subtotalAmount', 'adminFee', 'totalAmount', 'copyAmount', 'orderId', 'copyOrder', 'countdown', 'refreshPayment', 'saveQr', 'qrFallback', 'errorBanner', 'newPayment']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(html, /class="checkout-skeleton"/);
  assert.match(html, /Diproses aman oleh KlikQRIS/);
});

test('controller validates order and QR URL and never renders API data as HTML', () => {
  const js = read('app/js/checkout.js');
  assert.match(js, /searchParams\.get\(['"]order['"]\)/);
  assert.doesNotMatch(js, /searchParams\.get\(['"](?!order['"]|view['"])/);
  assert.match(js, /\/payment\/orders\/\$\{encodeURIComponent\(orderId\)\}\/qr/);
  assert.match(js, /blob\.type\.startsWith\(['"]image\//);
  assert.match(js, /checkoutQr\.src\s*=/);
  assert.match(js, /textContent\s*=/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.doesNotMatch(js, /x-api-key|provider_signature|KLIKQRIS_API_KEY/i);
  assert.doesNotMatch(js, /\son[a-z]+\s*=/i);
});

test('controller implements all states, authenticated bounded requests, and adaptive polling', () => {
  const js = read('app/js/checkout.js');
  for (const state of ['loading', 'pending', 'verifying', 'success', 'expired', 'error']) {
    assert.match(js, new RegExp(`["']${state}["']`), `missing ${state} state`);
  }
  assert.match(js, /laksa_token/);
  assert.match(js, /Authorization.*Bearer/s);
  assert.match(js, /AbortController/);
  assert.match(js, /12_000|12000/);
  assert.match(js, /5_000|5000/);
  assert.match(js, /10_000|10000/);
  assert.match(js, /20_000|20000/);
  assert.match(js, /document\.hidden/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /refreshInFlight/);
});

test('controller supports countdown terminal states, recovery, save QR, and success redirect', () => {
  const js = read('app/js/checkout.js');
  assert.match(js, /navigator\.onLine/);
  assert.match(js, /addEventListener\(['"]online['"]/);
  assert.match(js, /addEventListener\(['"]error['"]/);
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /download\s*=/);
  assert.match(js, /location\.assign\(['"]\/app\.html['"]\)/);
  assert.match(js, /4_000|4000/);
  assert.match(js, /clearTimeout|clearInterval/);
});

test('manual pending refresh keeps checkout actionable and explains payment is not found yet', () => {
  const js = read('app/js/checkout.js');
  const start = js.indexOf('async function refreshStatus');
  const end = js.indexOf('\n  function startCountdown', start);
  const refreshBody = js.slice(start, end);
  assert.match(refreshBody, /manual[\s\S]*status === 'pending'[\s\S]*Pembayaran belum ditemukan/);
  assert.doesNotMatch(refreshBody, /disabled\s*=\s*true/);
});

test('checkout styling follows Laksa blue glassmorphism with protected white QR surface', () => {
  const css = read('app/css/pages/checkout.css');
  assert.match(css, /#2563eb/i);
  assert.match(css, /#6366f1/i);
  assert.match(css, /#0f172a/i);
  assert.match(css, /backdrop-filter/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /\.checkout-qr-card[\s\S]*background:\s*#fff/i);
  assert.match(css, /@media\s*\(min-width:/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:/);
  assert.match(css, /data-state="success"/);
  assert.match(css, /data-state="expired"/);
});

test('production checkout artifact exists after build', () => {
  assert.ok(existsSync(new URL('app/dist/checkout.html', root)));
  assert.ok(existsSync(new URL('app/dist/js/checkout.js', root)));
  assert.ok(existsSync(new URL('app/dist/css/pages/checkout.css', root)));
});
