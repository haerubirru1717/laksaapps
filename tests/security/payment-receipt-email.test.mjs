import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  renderPaymentReceiptHtml,
  renderPaymentReceiptText,
} from '../../app/payment-receipt-email.js';

const receipt = {
  customerName: 'Ayu Laksa',
  orderId: 'LAKSA-20260810-AB12',
  planLabel: 'Premium 30 Hari',
  paidAt: '10 Agustus 2026, 08.15 WIB',
  baseAmount: 50000,
  discountAmount: 5000,
  subtotalAmount: 45000,
  adminFee: 16,
  totalAmount: 45016,
};

test('escapeHtml escapes every HTML-significant character', () => {
  assert.equal(
    escapeHtml(`&<>'\"`),
    '&amp;&lt;&gt;&#39;&quot;',
  );
});

test('HTML receipt safely escapes malicious customer-controlled values', () => {
  const malicious = `<img src=x onerror="globalThis.pwned=true"><script>alert('x')</script>`;
  const html = renderPaymentReceiptHtml({ ...receipt, customerName: malicious, orderId: `LAKSA-<svg onload=alert(1)>` });

  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b[^>]*onerror/i);
  assert.doesNotMatch(html, /<svg\b/i);
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.match(html, /&lt;img src=x onerror=&quot;globalThis\.pwned=true&quot;&gt;/);
  assert.match(html, /LAKSA-&lt;svg onload=alert\(1\)&gt;/);
});

test('HTML receipt uses an email-safe table layout and complete fee breakdown', () => {
  const html = renderPaymentReceiptHtml(receipt);

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /role="presentation"/);
  assert.match(html, /style="[^"]+"/);
  assert.match(html, /Premium 30 Hari/);
  assert.match(html, /Harga paket/);
  assert.match(html, /Diskon/);
  assert.match(html, /Subtotal/);
  assert.match(html, /Biaya admin \/ kode unik KlikQRIS/);
  assert.match(html, /Total pembayaran/);
  assert.match(html, /Rp50\.000/);
  assert.match(html, /-Rp5\.000/);
  assert.match(html, /Rp45\.016/);
  assert.match(html, /href="https:\/\/laksaapp\.my\.id"/);
  assert.doesNotMatch(html, /<style\b|class=|javascript:/i);
});

test('plain-text receipt contains useful structure and the canonical receipt link', () => {
  const text = renderPaymentReceiptText(receipt);

  assert.match(text, /BUKTI PEMBAYARAN LAKSA/);
  assert.match(text, /Hai Ayu Laksa,/);
  assert.match(text, /Order ID\s+: LAKSA-20260810-AB12/);
  assert.match(text, /Harga paket\s+: Rp50\.000/);
  assert.match(text, /Diskon\s+: -Rp5\.000/);
  assert.match(text, /Biaya admin \/ kode unik KlikQRIS\s+: Rp16/);
  assert.match(text, /TOTAL PEMBAYARAN\s+: Rp45\.016/);
  assert.match(text, /https:\/\/laksaapp\.my\.id/);
});

test('receipt output never serializes sensitive or provider-only data', () => {
  const dangerous = {
    ...receipt,
    signature: 'sig-super-secret',
    providerSignature: 'provider-super-secret',
    apiKey: 'key-super-secret',
    rawPayload: { secret: 'payload-super-secret' },
  };

  for (const output of [renderPaymentReceiptHtml(dangerous), renderPaymentReceiptText(dangerous)]) {
    assert.doesNotMatch(output, /sig-super-secret|provider-super-secret|key-super-secret|payload-super-secret/);
    assert.doesNotMatch(output, /rawPayload|providerSignature|apiKey/);
  }
});

test('renderers remain deterministic and do not mutate their input', () => {
  const frozen = Object.freeze({ ...receipt });
  assert.equal(renderPaymentReceiptHtml(frozen), renderPaymentReceiptHtml(frozen));
  assert.equal(renderPaymentReceiptText(frozen), renderPaymentReceiptText(frozen));
  assert.deepEqual(frozen, receipt);
});


test('missing optional values use safe, professional defaults', () => {
  const html = renderPaymentReceiptHtml({});
  const text = renderPaymentReceiptText({});

  assert.match(html, /Pelanggan Laksa/);
  assert.match(html, /Rp0/);
  assert.match(text, /Pelanggan Laksa/);
  assert.match(text, /Rp0/);
  assert.doesNotMatch(html + text, /undefined|NaN|null/);
});

test('amount formatting rejects non-finite or negative values instead of leaking malformed totals', () => {
  const html = renderPaymentReceiptHtml({ ...receipt, totalAmount: Infinity, adminFee: -20 });
  const text = renderPaymentReceiptText({ ...receipt, totalAmount: Infinity, adminFee: -20 });

  assert.doesNotMatch(html + text, /Infinity|NaN|-Rp20/);
  assert.match(html + text, /Rp0/);
});

test('module source contains no executable email content or sensitive field access', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../app/payment-receipt-email.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /<script\b|\son[a-z]+\s*=|javascript:/i);
  assert.doesNotMatch(source, /data\.(?:signature|providerSignature|apiKey|rawPayload)\b/);
});
