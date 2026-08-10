import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../../app/cloudflare-worker.js', import.meta.url), 'utf8');

function bodyOf(name) {
  const start = worker.indexOf(`async function ${name}`);
  assert.notEqual(start, -1);
  const next = worker.indexOf('\nasync function ', start + 20);
  return worker.slice(start, next === -1 ? worker.length : next);
}

test('admin bot receives update ID and has a durable audit helper', () => {
  const body = bodyOf('handleAdminBot');
  assert.match(body, /handleAdminBot\(body, env, updateId\)/);
  assert.match(worker, /async function auditAdminBotMutation/);
  assert.match(worker, /update_id/);
});

test('all sensitive admin bot mutations are audited', () => {
  const body = bodyOf('handleAdminBot');
  for (const action of [
    'extend_premium', 'revoke_premium', 'ban_user', 'unban_user',
    'delete_user', 'set_price', 'set_original_price',
    'create_coupon', 'delete_coupon'
  ]) {
    assert.match(body, new RegExp(`auditAdminBotMutation\\(.*["']${action}["']`), `${action} must be audited`);
  }
});

test('admin audit schema is ensured before every audit insert', () => {
  assert.match(worker, /async function ensureAdminAuditSchema/);
  assert.match(bodyOf('logAdminAction'), /await ensureAdminAuditSchema\(env\)/);
  assert.match(bodyOf('ensureAdminAuditSchema'), /CREATE TABLE IF NOT EXISTS admin_audit_logs/);
});

test('admin audit IDs are cryptographically random and persistence fails closed', () => {
  const start = worker.indexOf('function adminAuditStatement');
  const end = worker.indexOf('\nasync function auditAdminBotMutation', start);
  const auditCode = worker.slice(start, end);
  assert.match(auditCode, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(auditCode, /Math\.random|\.catch\(/);
});

test('admin bot mutation amounts and durations use bounded safe integers', () => {
  const body = bodyOf('handleAdminBot');
  assert.match(worker, /function parseAdminBoundedInteger/);
  assert.doesNotMatch(body, /parseInt\(duration\) \|\| 30/);
  assert.match(body, /parseAdminBoundedInteger\(duration/);
  assert.match(body, /parseAdminBoundedInteger\(parts\[1\]/);
  assert.match(body, /parseAdminBoundedInteger\(parts\[2\]/);
});
