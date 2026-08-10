import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const html=readFileSync(new URL('../../admin/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../admin/css/admin.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../../admin/js/admin.js',import.meta.url),'utf8');

test('admin uses official Laksa logo assets in auth and shell',()=>{
 assert.ok(existsSync(new URL('../../admin/icons/laksa_logo.svg',import.meta.url)));
 assert.match(html,/icons\/laksa_logo\.svg/g);
 assert.match(html,/apple-touch-icon/);
 assert.match(html,/rel="icon"/);
 assert.doesNotMatch(html,/<div class="(?:logo-glow|sidebar-logo)">L<\/div>/);
});
test('admin has light dark glass theme toggle persisted without storing auth changes',()=>{
 assert.match(html,/data-theme-toggle/);
 assert.match(css,/:root\[data-theme="dark"\]/);
 assert.match(css,/backdrop-filter/);
 assert.match(js,/laksa_admin_theme/);
 assert.match(js,/applyAdminTheme/);
 assert.doesNotMatch(js,/localStorage\.setItem\(['"]admin_token/);
});
test('responsive shell provides mobile bottom nav tablet rail and desktop sidebar',()=>{
 assert.match(html,/admin-mobile-bar/);assert.match(html,/admin-bottom-nav/);
 assert.match(css,/@media\s*\(max-width:\s*767px\)/);
 assert.match(css,/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1199px\)/);
 assert.match(css,/@media\s*\(min-width:\s*1200px\)/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);assert.match(css,/100dvh/);
 assert.match(js,/setActiveTab/);assert.match(js,/aria-current/);
});
test('responsive admin declares touch focus modal sheet and reduced motion contracts',()=>{
 assert.match(css,/min-height:\s*44px/);assert.match(css,/:focus-visible/);
 assert.match(css,/position:\s*sticky/);assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
 assert.match(css,/\.modal-footer[\s\S]*position:\s*sticky/);
});
test('session expiration is durably single-flight and only admin endpoints can logout',()=>{
 assert.match(js,/sessionExpiryInFlight/);assert.match(js,/handleSessionExpired/);
 assert.match(js,/path\.startsWith\(['"]\/admin\//);
 const start=js.indexOf('function handleSessionExpired');
 const end=js.indexOf('\n}',start)+2;
 assert.doesNotMatch(js.slice(start,end),/setTimeout|sessionExpiryInFlight\s*=\s*false/);
 assert.match(js,/res && res\.token[\s\S]*sessionExpiryInFlight = false/);
});
test('tablet rail and adaptive dialogs have accessible names',()=>{
 for(const label of ['Dashboard','Manajemen pengguna','Paket premium','Kupon diskon','Log audit']) assert.match(html,new RegExp(`aria-label="${label}"`));
 assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/);assert.match(html,/aria-labelledby=/);
});
test('admin source has no inline event handlers',()=>{assert.doesNotMatch(html,/\son(?:click|change|submit|load|error)\s*=/i);});
