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

test('financial CRUD uses shared strict validators before database writes', () => {
  assert.match(worker, /function validateFinancialAmount/);
  assert.match(worker, /Number\.isFinite/);
  assert.match(worker, /Number\.isSafeInteger/);
  assert.match(worker, /function validateFinancialString/);
  assert.match(worker, /\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/);
  assert.match(worker, /\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)-\(0\[1-9\]\|\[12\]\\d\|3\[01\]\)\$/);

  for (const name of ['createBudget', 'createGoal', 'updateGoal', 'createBill', 'updateBill', 'createPiutang', 'updatePiutang']) {
    assert.match(bodyOf(name), /validate/, `${name} must validate input`);
  }
});

test('budget creation verifies category ownership before insert', () => {
  const body = bodyOf('createBudget');
  const ownership = body.indexOf('SELECT id FROM categories WHERE id = ? AND user_id = ?');
  const insert = body.indexOf('INSERT INTO budgets');
  assert.ok(ownership >= 0 && ownership < insert);
});

test('goal bill and piutang validate bounded strings dates amounts and enums', () => {
  const goal = bodyOf('createGoal') + bodyOf('updateGoal');
  assert.match(goal, /validateFinancialString/);
  assert.match(goal, /validateFinancialAmount/);
  assert.match(goal, /validateFinancialDate/);

  const bill = bodyOf('createBill') + bodyOf('updateBill');
  assert.match(bill, /BILL_STATUSES/);
  assert.match(bill, /BILL_DUE_TYPES/);
  assert.match(bill, /validateFinancialDate/);
  assert.match(bill, /due_day/);

  const piutang = bodyOf('createPiutang') + bodyOf('updatePiutang');
  assert.match(piutang, /PIUTANG_STATUSES/);
  assert.match(piutang, /validateFinancialString/);
  assert.match(piutang, /validateFinancialAmount/);
  assert.match(piutang, /validateFinancialDate/);
});

test('delete-account rate limit is keyed by user and IP before PBKDF2', () => {
  const body = bodyOf('handleDeleteAccount');
  const rateLimit = body.indexOf('checkRateLimit(`delete-account:${payload.sub}:${ip}`');
  const pbkdf2 = body.indexOf('verifyPassword(');
  assert.ok(rateLimit >= 0, 'must rate-limit delete account per user and IP');
  assert.ok(rateLimit < pbkdf2, 'rate limit must run before expensive PBKDF2 verification');
  assert.match(body, /429/);
});

test('financial dates are calendar-valid, not only regex-valid', () => {
  const start = worker.indexOf('function validateFinancialDate');
  const end = worker.indexOf('\nfunction financialValidationError', start);
  const body = worker.slice(start, end);
  assert.match(body, /Date\.UTC/);
  assert.match(body, /getUTCFullYear/);
  assert.match(body, /getUTCMonth/);
  assert.match(body, /getUTCDate/);
});
