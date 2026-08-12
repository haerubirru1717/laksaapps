import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const settings = fs.readFileSync(new URL('../../app/js/settings.js', import.meta.url), 'utf8');
const banks = fs.readFileSync(new URL('../../app/banks.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../app/css/components.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../../app/js/dashboard.js', import.meta.url), 'utf8');
const appHtml = fs.readFileSync(new URL('../../app/app.html', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../../app/_headers', import.meta.url), 'utf8');
const serviceWorker = fs.readFileSync(new URL('../../app/service-worker.js', import.meta.url), 'utf8');

function accountSheetRenderer() {
  const start = settings.indexOf('function renderAccSheet()');
  const end = settings.indexOf('function renderAccSheetBody()', start);
  assert.ok(start >= 0 && end > start, 'account detail renderer exists');
  return settings.slice(start, end);
}

test('account detail uses website favicon pipeline for banks and e-wallets only in sheet', () => {
  const sheet = accountSheetRenderer();
  assert.match(sheet, /getDetailFaviconHtml\(/);
  assert.match(sheet, /acc\.name, b, 'acc-sheet-logo'/);
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

test('detail logo is favicon-only while dashboard retains SVG fallback', () => {
  assert.match(banks, /function getDetailFaviconHtml\(/);
  const detailStart = banks.indexOf('function getDetailFaviconHtml(');
  const detailEnd = banks.indexOf('\n}', detailStart) + 2;
  const detailHelper = banks.slice(detailStart, detailEnd);
  assert.match(detailHelper, /\/icons\/favicons\/\$\{slug\}\.png/);
  assert.match(banks, /LOCAL_DETAIL_FAVICONS/);
  assert.doesNotMatch(detailHelper, /faviconV2|Banks%20Logo|svgFallback|naturalWidth/);
  assert.match(detailHelper, /onerror="window\._detailFaviconErr\(this\)"/);
  assert.match(banks, /window\._detailFaviconErr\s*=\s*function/);
  assert.match(dashboard, /getLogoHtml\(/, 'dashboard keeps its existing logo pipeline');
});

test('account detail removes close button and supports backdrop escape and swipe-down dismiss', () => {
  const sheet = accountSheetRenderer();
  assert.doesNotMatch(sheet, /acc-sheet-close|Tutup detail rekening/);
  assert.match(sheet, /role="dialog"/);
  assert.match(settings, /function initAccSheetDismiss\(/);
  assert.match(settings, /pointerdown/);
  assert.match(settings, /pointermove/);
  assert.match(settings, /pointerup/);
  assert.match(settings, /key\s*===\s*['"]Escape['"]/);
  assert.match(settings, /accSheetOverlay/);
  assert.match(settings, /accSheetTrigger/);
});

test('date group places per-date transaction count on the right', () => {
  assert.match(settings, /acc-tx-date-row/);
  assert.match(settings, /acc-tx-date-count/);
  assert.match(settings, /\$\{list\.length\}\s+transaksi/);
  const sheet = accountSheetRenderer();
  assert.doesNotMatch(sheet, /\$\{monTx\.length\}\s+transaksi/);
});

test('adaptive amount display preserves full accessible value and never uses ellipsis', () => {
  assert.match(settings, /function formatCompactIdr\(/);
  assert.match(settings, /function amountDisplayHtml\(/);
  assert.match(settings, /aria-label=/);
  assert.match(settings, /data-full-amount=/);
  assert.match(settings, /Miliar|Juta|Triliun/);
  assert.doesNotMatch(css, /\.acc-(?:sheet-bal|stat-val|tx-amt)[^{]*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
});

test('adaptive formatter renders Indonesian million billion and trillion values', () => {
  const start = settings.indexOf('function formatCompactIdr(');
  const end = settings.indexOf('\n\nfunction openAccDetail', start);
  const source = `function fCur(v){return 'Rp '+Number(v).toLocaleString('id-ID')}\n${settings.slice(start, end)}\nthis.formatCompactIdr=formatCompactIdr;this.amountDisplayHtml=amountDisplayHtml;`;
  const context = {};
  vm.runInNewContext(source, context);
  assert.equal(context.formatCompactIdr(750_000_000), 'Rp 750 Juta');
  assert.equal(context.formatCompactIdr(12_500_000_000), 'Rp 12,5 Miliar');
  assert.equal(context.formatCompactIdr(1_250_000_000_000), 'Rp 1,25 Triliun');
  const html = context.amountDisplayHtml(12_500_000_000, { sign: '+', context: 'transaction' });
  assert.match(html, />\+Rp 12,5 Miliar</);
  assert.match(html, /aria-label="\+Rp 12\.500\.000\.000"/);

  const negativeBalance = context.amountDisplayHtml(-1_000_000, { context: 'balance' });
  assert.match(negativeBalance, />−Rp 1\.000\.000</);
  assert.match(negativeBalance, /aria-label="−Rp 1\.000\.000"/);

  const largeBalance = context.amountDisplayHtml(125_750_000_000, { context: 'balance' });
  assert.match(largeBalance, />Rp 125,8 Miliar</);
  assert.match(largeBalance, /data-full-amount="Rp 125\.750\.000\.000"/);
});

test('related production assets are cache-busted together', () => {
  const bankVersion = appHtml.match(/banks\.js\?v=([0-9.]+)/)?.[1];
  const settingsVersion = appHtml.match(/settings\.js\?v=([0-9.]+)/)?.[1];
  const cssVersion = appHtml.match(/components\.css\?v=([0-9.]+)/)?.[1];
  assert.ok(bankVersion && settingsVersion && cssVersion);
  assert.notEqual(bankVersion, '1.4.0');
  assert.notEqual(settingsVersion, '1.4.0');
  assert.notEqual(cssVersion, '2.3.1');
});

test('application documents always revalidate so new asset versions reach Chrome', () => {
  for (const route of ['/app', '/app.html', '/login', '/register', '/dashboard', '/transactions', '/settings']) {
    assert.match(headers, new RegExp(`(?:^|\\n)${route.replace('.', '\\.') }\\n(?:  .+\\n)*  Cache-Control: no-store, no-cache, must-revalidate`));
  }
});

test('service worker release cannot reuse pre-V3 UI assets', () => {
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*['"]laksa-v49['"]/);
  assert.match(serviceWorker, /fetch\(e\.request,\s*\{\s*cache:\s*['"]no-store['"]\s*\}\)/);
  assert.match(headers, /\/service-worker\.js\n(?:  .+\n)*  Cache-Control: no-store, no-cache, must-revalidate/);
});

test('final glass sheet uses exactly 80 percent viewport without opaque white plate', () => {
  const finalCss = css.slice(css.indexOf('Account detail FINAL'));
  assert.match(finalCss, /\.acc-sheet\s*\{[^}]*height:\s*80dvh/);
  assert.match(finalCss, /\.acc-sheet\s*\{[^}]*min-height:\s*80dvh/);
  assert.match(finalCss, /\.acc-sheet\s*\{[^}]*max-height:\s*80dvh/);
  assert.doesNotMatch(finalCss, /\.acc-sheet\s*\{[^}]*height:\s*clamp/);
  assert.match(finalCss, /\.acc-sheet\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(finalCss, /backdrop-filter:\s*blur\(/);
  assert.doesNotMatch(finalCss, /\.acc-sheet\s*\{[^}]*background:\s*(?:#fff|white|var\(--modal-bg)/);
  assert.match(finalCss, /\.acc-sheet-dialog\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/);
  assert.match(finalCss, /\.acc-sheet-body\s*\{[^}]*flex:\s*1\s+1\s+auto/);
  assert.match(finalCss, /\.acc-sheet-foot\s*\{[^}]*background:\s*transparent/);
});

test('segmented tabs retain a sliding selection indicator while staying compact and inline', () => {
  const sheet = accountSheetRenderer();
  const finalCss = css.slice(css.indexOf('Account detail FINAL'));
  assert.match(sheet, /acc-seg-indicator/);
  assert.match(settings, /dataset\.active\s*=\s*tab/);
  assert.match(finalCss, /\.acc-seg-indicator\s*\{[^}]*transition:\s*transform/);
  assert.match(finalCss, /\.acc-seg\[data-active="in"\]\s+\.acc-seg-indicator/);
  assert.match(finalCss, /\.acc-seg\[data-active="out"\]\s+\.acc-seg-indicator/);
  assert.match(finalCss, /\.acc-sheet-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(finalCss, /\.acc-seg\s*\{[^}]*height:\s*32px/);
});

test('transparent gesture wrapper exposes exactly one thin visual handle', () => {
  const sheet = accountSheetRenderer();
  const finalCss = css.slice(css.indexOf('Account detail FINAL'));
  assert.doesNotMatch(sheet, /acc-sheet-handle-mark/);
  assert.match(finalCss, /\.acc-sheet-handle\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255/);
  assert.match(finalCss, /\.acc-sheet-handle::before,\s*\.acc-sheet-handle::after\s*\{[^}]*content:\s*none/);
});

test('final sections form a compact upward-flowing hierarchy with visible CTA', () => {
  const finalCss = css.slice(css.indexOf('Account detail FINAL'));
  assert.match(finalCss, /--acc-sheet-gutter:\s*16px/);
  assert.match(finalCss, /\.acc-sheet-handle\s*\{[^}]*height:\s*4px/);
  assert.match(finalCss, /\.acc-sheet-identity\s*\{[^}]*min-height:\s*72px/);
  assert.match(finalCss, /\.acc-stat\s*\{[^}]*min-height:\s*52px/);
  assert.match(finalCss, /\.acc-sheet-content-head\s*\{[^}]*padding:\s*\.15rem/);
  assert.match(finalCss, /\.acc-tx-date-row\s*\{[^}]*margin-bottom:\s*2px/);
  assert.match(finalCss, /\.acc-tx-item\s*\{[^}]*min-height:\s*52px/);
  assert.match(finalCss, /\.acc-sheet-cta\s*\{[^}]*min-height:\s*52px/);
});

test('monthly metrics and filters share one transparent blue glass wrapper', () => {
  const sheet = accountSheetRenderer();
  const summaryStart = sheet.indexOf('<section class="acc-sheet-summary"');
  const stats = sheet.indexOf('<div class="acc-sheet-stats"', summaryStart);
  const toolbar = sheet.indexOf('<div class="acc-sheet-toolbar"', stats);
  const summaryEnd = sheet.indexOf('</section>', toolbar);
  assert.ok(summaryStart >= 0 && stats > summaryStart && toolbar > stats && summaryEnd > toolbar);
  const finalCss = css.slice(css.indexOf('Account detail FINAL'));
  assert.match(finalCss, /\.acc-sheet-summary\s*\{[^}]*background:\s*linear-gradient\([^}]*rgba\(37,\s*99,\s*235/);
  assert.match(finalCss, /\.acc-sheet-summary\s*\{[^}]*backdrop-filter:\s*blur/);
  assert.match(finalCss, /\.acc-sheet-summary\s*\{[^}]*border-radius:/);
});

test('V4 mobile layout keeps compact filters inline and removes footer plate', () => {
  const v4 = css.slice(css.indexOf('Account detail V4'));
  assert.match(v4, /\.acc-sheet-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(v4, /\.acc-seg\s*\{[^}]*min-height:\s*32px/);
  assert.match(v4, /\.acc-tab\s*\{[^}]*min-height:\s*30px/);
  assert.match(v4, /\.acc-month-field\s*>\s*span\s*\{[^}]*display:\s*none/);
  assert.match(v4, /\.acc-sheet-foot\s*\{[^}]*background:\s*transparent/);
  assert.match(v4, /\.acc-sheet-foot\s*\{[^}]*border-top:\s*0/);
});

test('V4 sheet is visually isolated and exposes exactly one drag-handle mark', () => {
  const v4 = css.slice(css.indexOf('Account detail V4'));
  assert.match(v4, /\.acc-sheet\s*\{[^}]*background:\s*var\(--modal-bg/);
  assert.match(v4, /\.acc-sheet-overlay\s*\{[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*\.62\)/);
  assert.match(v4, /\.acc-sheet-handle\s*\{[^}]*background:\s*transparent/);
  assert.match(v4, /\.acc-sheet-handle::before\s*\{[^}]*content:\s*none/);
  assert.match(v4, /\.acc-sheet-handle::after\s*\{[^}]*content:\s*['"]['"]/);
});

test('every supported institution with an official domain has a validated local favicon', () => {
  const institutionSlugs = [...banks.matchAll(/^\s*([a-z0-9]+):\s*\{[^\n]*domain:'[^']+'/gm)].map(match => match[1]);
  const localList = banks.match(/const LOCAL_DETAIL_FAVICONS = new Set\('([^']+)'\.split/)?.[1]?.split(',') || [];
  const localSet = new Set(localList);
  const missing = institutionSlugs.filter(slug => !localSet.has(slug));
  assert.deepEqual(missing, [], `institutions missing validated favicon: ${missing.join(', ')}`);
  for (const slug of institutionSlugs) {
    const path = new URL(`../../app/icons/favicons/${slug}.png`, import.meta.url);
    assert.ok(fs.existsSync(path), `missing favicon file for ${slug}`);
    const data = fs.readFileSync(path);
    assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${slug} favicon must be PNG`);
    assert.ok(data.length >= 100, `${slug} favicon is unexpectedly empty`);
  }
  assert.match(css, /\.acc-sheet-ava-fb\s*\{[^}]*color:\s*var\(--navy/);
});

test('sheet shrinks to content and uses one mobile gutter without outer summary container', () => {
  const sheet = accountSheetRenderer();
  const v3 = css.slice(css.indexOf('Account detail V3'));
  assert.doesNotMatch(sheet, /acc-group-card/);
  assert.match(v3, /--acc-sheet-gutter:/);
  assert.match(v3, /\.acc-sheet\s*\{[^}]*height:\s*auto/);
  assert.match(v3, /\.acc-sheet\s*\{[^}]*width:\s*100%/);
  assert.match(v3, /\.acc-sheet-body\s*\{[^}]*padding:[^;]*var\(--acc-sheet-gutter\)/);
  assert.match(v3, /\.acc-sheet-foot\s*\{[^}]*padding:[^;]*var\(--acc-sheet-gutter\)/);
});
