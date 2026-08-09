import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../../app/cloudflare-worker.js', import.meta.url), 'utf8');

function bodyOf(name) {
  const start = worker.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = worker.indexOf('\nasync function ', start + 20);
  return worker.slice(start, next === -1 ? worker.length : next);
}

test('Telegram transfer writes both legs and balances in one atomic batch', () => {
  const body = bodyOf('saveTransfer');
  assert.match(body, /env\.DB\.batch\(/);
  assert.doesNotMatch(body, /INSERT OR IGNORE/);
  assert.match(body, /transfer_group_id/);
  assert.match(body, /UPDATE accounts SET balance = balance -/);
  assert.match(body, /UPDATE accounts SET balance = balance \+/);
});

test('checkout ensures payment schema before using reservation columns', () => {
  const body = bodyOf('createKlikQrisCheckout');
  const ensure = body.indexOf('await ensurePaymentIntegritySchema(env)');
  const insert = body.indexOf('INSERT INTO payment_requests');
  assert.ok(ensure >= 0 && ensure < insert);
});

test('checkout atomically reserves coupon capacity before provider call', () => {
  const body = bodyOf('createKlikQrisCheckout');
  assert.match(body, /coupon reservation/i);
  assert.match(body, /used_count < max_uses/);
  assert.match(body, /coupon_reserved[\s\S]*VALUES[\s\S]*1, 'creating'/);
  assert.match(body, /releaseCouponReservation/);
  assert.doesNotMatch(bodyOf('handleKlikQrisWebhook'), /used_count = used_count \+ 1/);
});

test('scheduled reconciliation checks unresolved payments', () => {
  assert.match(worker, /async function reconcilePendingPayments/);
  assert.match(worker, /status IN \('creating', 'pending'\)/);
  assert.match(worker, /retryFailedOutbox/);
});

test('payment outbox reclaims stale processing leases', () => {
  const body = bodyOf('retryFailedOutbox');
  assert.match(body, /status = 'processing'/);
  assert.match(body, /datetime\('now', '-5 minutes'\)/);
});

test('premium checkout always restores button and uses the real toast helper', () => {
  const frontend = readFileSync(new URL('../../app/js/app.js', import.meta.url), 'utf8');
  const start = frontend.indexOf("const btnPay = overlay.querySelector('#btnUpgradePay')");
  const end = frontend.indexOf('\n}', start);
  const body = frontend.slice(start, end);
  assert.doesNotMatch(body, /showToast\(/);
  assert.match(body, /toast\(/);
  assert.match(body, /finally\s*{/);
  assert.match(body, /btnPay\.disabled = false/);
});
