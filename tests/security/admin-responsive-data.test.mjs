import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../admin/js/admin.js', import.meta.url), 'utf8');

test('responsive table rows expose escaped mobile labels without replacing desktop tables', () => {
  for (const marker of [
    "tr.className = 'responsive-data-row payment-data-row'",
    'data-label="Tanggal"',
    'data-label="Email"',
    'data-label="Paket"',
    'data-label="Jumlah"',
    'data-label="Status"',
    'data-label="Aksi"',
    "tr.className = 'responsive-data-row user-data-row'",
    'data-label="Nama"',
    'data-label="Berlaku Hingga"',
    "tr.className = 'responsive-data-row audit-data-row'",
    'data-label="Admin"',
    'data-label="Aktivitas"',
    'data-label="Target"',
    'data-label="Detail"'
  ]) assert.ok(source.includes(marker), `missing responsive marker: ${marker}`);

  assert.match(source, /document\.createElement\('tr'\)/);
});

test('pricing and coupon cards expose semantic responsive regions', () => {
  for (const marker of [
    "div.className = 'pricing-card responsive-data-card'",
    'class="responsive-card-heading"',
    'class="responsive-card-body"',
    "div.className = 'coupon-card responsive-data-card'",
    'class="coupon-meta responsive-card-meta"',
    'class="responsive-card-actions"'
  ]) assert.ok(source.includes(marker), `missing responsive marker: ${marker}`);
});

test('API and XSS safety paths remain in responsive renderers', () => {
  for (const endpoint of ["apiCall('/admin/stats')", 'apiCall(url)', "apiCall('/admin/pricing')", "apiCall('/admin/coupons')", 'apiCall(`/admin/audit-logs?page=${page}&limit=${limit}`)']) {
    assert.ok(source.includes(endpoint), `missing API path: ${endpoint}`);
  }
  assert.match(source, /function escapeHtml\(value\)/);
  assert.match(source, /data-user-id="\$\{uid\}"/);
  assert.match(source, /data-code="\$\{escapeHtml\(c\.code\)\}"/);
});

test('empty table states are responsive and retain table semantics', () => {
  assert.ok(source.includes('<tr class="responsive-empty-row"><td colspan="6"'));
  assert.ok(source.includes('<tr class="responsive-empty-row"><td colspan="5"'));
});


test('responsive cells contain escaped API values', () => {
  assert.ok(source.includes('data-label="Email" style="font-weight: 600;">${escapeHtml(tx.email)}</td>'));
  assert.ok(source.includes('data-label="Nama" style="font-weight: 600;">${escapeHtml(u.name)}</td>'));
  assert.ok(source.includes('data-label="Admin"><code>${escapeHtml(l.admin_id)}</code></td>'));
});
