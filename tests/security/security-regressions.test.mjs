import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const worker = readFileSync(new URL('../../app/cloudflare-worker.js', import.meta.url), 'utf8');

function bodyOf(name) {
  const start = worker.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = worker.indexOf('\nasync function ', start + 20);
  return worker.slice(start, next === -1 ? worker.length : next);
}

test('finance UI uses event delegation instead of inline handlers for record IDs', () => {
  const ui = readFileSync(new URL('../../app/js/keuangan.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /onclick=.*(?:delBud|delGoal|openBillHistory|openEditBill|delBill|delPiutang|openModal)/);
  assert.doesNotMatch(ui, /onclick=.*(?:gj|pJ)/);
  assert.match(ui, /data-keu-action=/);
  assert.match(ui, /bindKeuanganActions/);
  assert.match(ui, /addEventListener\(['"]click['"]/);
  assert.doesNotMatch(ui, /const (?:gj|pJ) =/);
});

test('delegated finance action passes malicious legacy ID as data, not code', () => {
  const ui = readFileSync(new URL('../../app/js/keuangan.js', import.meta.url), 'utf8');
  const marker = '\nbindKeuanganActions();';
  const end = ui.indexOf(marker) + marker.length;
  let clickHandler;
  let received;
  const context = {
    document: {
      _keuanganActionsBound: false,
      addEventListener(type, handler) { if (type === 'click') clickHandler = handler; },
    },
    delBud(id) { received = id; },
    delGoal() {}, openBillHistory() {}, openEditBill() {}, delBill() {}, delPiutang() {},
  };
  vm.runInNewContext(ui.slice(0, end), context);
  const payload = "x');globalThis.pwned=true;//";
  clickHandler({ target: { closest: () => ({ dataset: { keuAction: 'delete-budget', id: payload } }) } });
  assert.equal(received, payload);
  assert.equal(context.pwned, undefined);
});

test('bot dedup uses a separate text-key table for namespaced update IDs', () => {
  const schemas = [...worker.matchAll(/CREATE TABLE IF NOT EXISTS processed_bot_updates\s*\([\s\S]*?\)/g)];
  assert.ok(schemas.length >= 1);
  for (const schema of schemas) assert.match(schema[0], /update_id TEXT PRIMARY KEY/);
  assert.match(bodyOf('claimTelegramUpdate'), /INSERT INTO processed_bot_updates/);
});

test('namespaced consumer and admin update IDs coexist in SQLite', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE processed_bot_updates (update_id TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const insert = db.prepare('INSERT INTO processed_bot_updates (update_id) VALUES (?)');
  insert.run('consumer:42');
  insert.run('admin:42');
  const rows = db.prepare('SELECT update_id FROM processed_bot_updates ORDER BY update_id').all();
  assert.deepEqual(rows.map(row => row.update_id), ['admin:42', 'consumer:42']);
  assert.throws(() => insert.run('admin:42'));
  db.close();
});

test('legacy categories schema detection fails closed', () => {
  const setup = bodyOf('setupDatabase');
  assert.match(setup, /Legacy categories schema requires an explicit backup-and-copy migration/);
  assert.doesNotMatch(setup, /catch \(_\) \{\}/);
});

test('server generates IDs for budget goal and bill objects', () => {
  for (const name of ['createBudget', 'createGoal', 'createBill']) {
    const body = bodyOf(name);
    assert.match(body, /const id = randomId\(\)/);
    assert.doesNotMatch(body, /body\.id/);
  }
});

test('consumer and admin Telegram handlers reject non-private chats', () => {
  assert.match(bodyOf('handleTelegram'), /requirePrivateTelegramChat/);
  assert.match(bodyOf('handleCallback'), /requirePrivateTelegramChat/);
  assert.match(bodyOf('handleAdminBot'), /requirePrivateTelegramChat/);
});

test('admin bot does not accept or echo plaintext passwords', () => {
  assert.doesNotMatch(worker, /\/resetpw/);
  assert.doesNotMatch(worker, /Password baru:/);
});

test('user deletion never deletes immutable payment ledger', () => {
  assert.doesNotMatch(worker, /DELETE FROM payment_requests WHERE user_id/);
});

test('setup has no destructive categories migration', () => {
  assert.doesNotMatch(worker, /DROP TABLE categories/);
});

test('admin JWT is tied to the currently configured admin identity', () => {
  assert.match(bodyOf('verifyAdminJWT'), /ADMIN_TELEGRAM_ID/);
});

test('admin webhook claims update IDs before dispatch', () => {
  assert.match(worker, /claimTelegramUpdate\("admin"/);
});
