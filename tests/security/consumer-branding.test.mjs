import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../../app/app.html',import.meta.url),'utf8');
test('consumer desktop sidebar uses official app icon above compose',()=>{
  const sidebar=html.slice(html.indexOf('<!-- SIDEBAR -->'),html.indexOf('<!-- Desktop compose'));
  assert.match(sidebar,/icons\/laksa_logo\.svg/);
  assert.doesNotMatch(sidebar,/spinOrbit|<svg/);
  assert.match(sidebar,/brand-name">Laksa</);
});
