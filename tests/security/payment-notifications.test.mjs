import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const worker=readFileSync(new URL('../../app/cloudflare-worker.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../app/js/notifications.js',import.meta.url),'utf8');
function bodyOf(name){const s=worker.indexOf(`async function ${name}`);assert.notEqual(s,-1);const e=worker.indexOf('\nasync function ',s+20);return worker.slice(s,e<0?worker.length:e);}
test('notification schema and payment event keys are idempotent',()=>{assert.match(worker,/CREATE TABLE IF NOT EXISTS user_notifications/);assert.match(worker,/event_key TEXT NOT NULL UNIQUE/);assert.match(worker,/payment:\$\{orderId\}:verified/);assert.match(worker,/INSERT OR IGNORE INTO user_notifications/);});
test('notification APIs are scoped to authenticated user',()=>{assert.match(worker,/WHERE user_id = \?/);assert.match(worker,/WHERE id = \? AND user_id = \?/);assert.match(worker,/notifications\/unread-count/);assert.match(worker,/notifications\/read-all/);});
test('email delivery is durable, bounded and does not rollback fulfillment',()=>{const b=bodyOf('retryNotificationDeliveries');assert.match(b,/notification_deliveries/);assert.match(b,/attempts < 5/);assert.match(b,/RESEND_API_KEY/);assert.match(b,/renderPaymentReceiptHtml/);assert.match(b,/renderPaymentReceiptText/);assert.match(worker,/await retryNotificationDeliveries\(env, orderId\)/);});
test('notification UI uses safe DOM APIs and payment receipt links',()=>{assert.match(ui,/textContent/);assert.doesNotMatch(ui,/innerHTML/);assert.match(ui,/\/notifications\/unread-count/);assert.match(ui,/\/checkout\?order=/);assert.match(ui,/encodeURIComponent/);});
