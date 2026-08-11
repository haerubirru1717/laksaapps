import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync(new URL('../../app/js/settings.js', import.meta.url), 'utf8');
const banks = fs.readFileSync(new URL('../../app/banks.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../app/css/components.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../../app/js/dashboard.js', import.meta.url), 'utf8');

function accountSheetRenderer() {
  const start = settings.indexOf('function renderAccSheet()');
  const end = settings.indexOf('function renderAccSheetBody()', start);
  assert.ok(start >= 0 && end > start, 'account detail renderer exists');
  return settings.slice(start, end);
}

test('account detail uses website favicon pipeline for banks and e-wallets only in sheet', () => {
  const sheet = accountSheetRenderer();
  assert.match(sheet, /getLogoHtml\(/);
  assert.match(sheet, /acc\.name, b, 'acc-sheet-logo'/);
  assert.match(sheet, /object-fit:contain;', true/);
  assert.doesNotMatch(sheet, /\/ewallet\/(gopay|ovo|dana|linkaja|shopeepay)/);
  assert.match(banks, /gopay:\s*\{[^}]*domain:'gopay\.co\.id'/);
  assert.match(banks, /ovo:\s*\{[^}]*domain:'ovo\.id'/);
  assert.match(banks, /dana:\s*\{[^}]*domain:'dana\.id'/);
  assert.match(banks, /linkaja:\s*\{[^}]*domain:'www\.linkaja\.id'/);
  assert.match(banks, /shopeepay:\s*\{[^}]*domain:'shopee\.co\.id'/);
  assert.match(dashboard, /ewDarkImg='\/ewallet\/gopay\.svg'/, 'dashboard logo behavior remains unchanged');
});

test('account detail markup has semantic professional finance hierarchy', () => {
  const sheet = accountSheetRenderer();
  for (const className of [
    'acc-sheet-identity', 'acc-sheet-summary', 'acc-sheet-toolbar',
    'acc-sheet-content-head', 'acc-sheet-cta'
  ]) assert.match(sheet, new RegExp(className));
  assert.match(sheet, /aria-label="Tutup detail rekening"/);
  assert.match(sheet, /aria-label="Filter transaksi rekening"/);
  assert.doesNotMatch(sheet, /onmouseover=|onmouseout=/);
  assert.doesNotMatch(sheet, /style="width:100%;padding:/);
});

test('account sheet CSS is mobile-first, safe-area aware, and avoids nested visual clutter', () => {
  assert.match(css, /\.acc-sheet\s*\{[\s\S]*max-height:\s*min\(92dvh,\s*880px\)/);
  assert.match(css, /\.acc-sheet-foot\s*\{[\s\S]*env\(safe-area-inset-bottom/);
  assert.match(css, /\.acc-sheet-toolbar\s*\{[\s\S]*display:\s*grid/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)[\s\S]*\.acc-sheet-stats/);
  assert.match(css, /\.acc-sheet-cta\s*\{/);
  assert.match(css, /\.acc-sheet-body\s*\{[\s\S]*overscroll-behavior:\s*contain/);
});

test('detail favicon images have a contained white brand tile treatment', () => {
  assert.match(css, /\.acc-sheet-ava\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255/);
  assert.match(css, /\.acc-sheet-ava img\s*\{[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.acc-sheet-ava img\s*\{[\s\S]*padding:/);
});
