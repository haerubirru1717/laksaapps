import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../../app/cloudflare-worker.js', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../../app/js/app.js', import.meta.url), 'utf8');

test('KlikQRIS create and status endpoints match official contract', () => {
  assert.match(worker, /https:\/\/klikqris\.com\/api\/qris\/create/);
  assert.match(worker, /https:\/\/klikqris\.com\/api\/qris\/status\/\$\{encodeURIComponent\(orderId\)\}/);
  assert.doesNotMatch(worker, /qrisv2/);
  assert.match(worker, /callback_url/);
});

test('KlikQRIS response uses final total and hosted QRIS without exposing signature', () => {
  assert.match(worker, /created\.total_amount/);
  assert.match(worker, /created\.qris_url/);
  assert.doesNotMatch(worker, /snap_signature/);
  assert.match(worker, /created\.order_id !== reqId/);
  assert.doesNotMatch(worker, /created\.direct_url/);
  assert.doesNotMatch(frontend, /x-api-key|KLIKQRIS_API_KEY/);
});

test('KlikQRIS expired callback is acknowledged and releases coupon', () => {
  assert.match(worker, /verifiedStatus === "EXPIRED"/);
  assert.match(worker, /verifiedSignature/);
  assert.match(worker, /releaseCouponReservation/);
  assert.match(worker, /status: true, expired: true/);
});
