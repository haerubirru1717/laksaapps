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

test('checkout create stores transparent provider amounts and returns internal path', () => {
  const body = bodyOf('createKlikQrisCheckout');
  for (const column of ['base_amount', 'discount_amount', 'provider_total', 'provider_expired_at', 'provider_qris_url']) {
    assert.match(body, new RegExp(column));
  }
  assert.match(body, /adminFee\s*=\s*Math\.max\(0, providerTotal - amount\)/);
  assert.match(body, /checkout_url:\s*`\/checkout\?order=/);
  assert.doesNotMatch(body, /checkout_url:\s*checkout\.toString/);
});

test('owned checkout details query by order and authenticated user', () => {
  const body = bodyOf('handleGetPaymentOrder');
  assert.match(body, /WHERE pr\.id = \? AND pr\.user_id = \?/);
  assert.match(body, /sanitizeKlikQrisUrl/);
  assert.doesNotMatch(body, /provider_signature/);
  assert.match(body, /admin_fee/);
  assert.match(body, /total_amount/);
});

test('manual checkout refresh is owned, rate-limited and server verified', () => {
  const body = bodyOf('handleRefreshPaymentOrder');
  assert.match(body, /WHERE id = \? AND user_id = \?/);
  assert.match(body, /checkRateLimit/);
  assert.match(body, /handleKlikQrisWebhook/);
  assert.doesNotMatch(body, /body\?\.status|body\.status/);
});

test('payment routes expose only authenticated owned order operations', () => {
  assert.match(worker, /paymentOrderMatch/);
  assert.match(worker, /paymentRefreshMatch/);
  assert.match(worker, /handleGetPaymentOrder/);
  assert.match(worker, /handleRefreshPaymentOrder/);
});

test('payment schema adds checkout metadata idempotently', () => {
  const body = bodyOf('ensurePaymentIntegritySchema');
  for (const column of ['base_amount', 'discount_amount', 'provider_expired_at', 'provider_qris_url']) {
    assert.match(body, new RegExp(`addPaymentColumn\\(env, "${column}`));
  }
  const migration = bodyOf('addPaymentColumn');
  assert.match(migration, /duplicate column name/);
  assert.match(migration, /throw error/);
});
