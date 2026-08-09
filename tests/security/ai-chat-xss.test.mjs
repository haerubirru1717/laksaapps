import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../app/ai-chat.js', import.meta.url), 'utf8');

test('AI confirmation cards never serialize dynamic payloads into inline handlers', () => {
  const vulnerableRegion = source.slice(source.indexOf('// ── TRANSACTION CONFIRM BUBBLE'), source.indexOf('function aiRenderInlineMarkdown'));
  assert.doesNotMatch(vulnerableRegion, /onclick\s*=/i);
  assert.doesNotMatch(vulnerableRegion, /JSON\.stringify\((?:tx|bills)\)/);
  assert.match(vulnerableRegion, /data-ai-action=/);
  assert.match(source, /new Map\(\)/);
  assert.match(source, /addEventListener\(['"]click['"]/);
});

test('delegated AI actions pass malicious quote payloads as data, never code', async () => {
  const start = source.indexOf('const aiTxPayloads = new Map();');
  const endMarker = '\naiBindConfirmActions();';
  const end = source.indexOf(endMarker, start) + endMarker.length;
  assert.ok(start >= 0 && end > start, 'delegated action registry must exist');

  let clickHandler;
  const calls = [];
  const context = {
    document: {
      _aiConfirmActionsBound: false,
      addEventListener(type, handler) { if (type === 'click') clickHandler = handler; },
    },
    aiConfirmTx(payload, id) { calls.push(['confirm-tx', payload, id]); },
    aiEditTx(payload, id) { calls.push(['edit-tx', payload, id]); },
    aiSubmitEdit(inputId, payload, id) { calls.push(['submit-edit', payload, id, inputId]); },
    aiCancelEdit(id, payload) { calls.push(['cancel-edit', payload, id]); },
    aiCancelTx(id) { calls.push(['cancel', null, id]); },
    window: { aiConfirmBills(payload, id) { calls.push(['confirm-bills', payload, id]); } },
  };
  const payload = { note: "x');globalThis.pwned=true;//", nested: ["\" onmouseover=globalThis.pwned=true x=\""] };
  const bills = [{ name: "');globalThis.pwned=true;//" }];
  context.payload = payload;
  context.bills = bills;
  vm.runInNewContext(source.slice(start, end) + '\naiTxPayloads.set("safe_tx", payload); aiBillsPayloads.set("safe_bills", bills);', context);

  await clickHandler({ target: { closest: () => ({ dataset: { aiAction: 'confirm-tx', payloadKey: 'safe_tx', bubbleId: 'txc_safe' } }) } });
  await clickHandler({ target: { closest: () => ({ dataset: { aiAction: 'confirm-bills', payloadKey: 'safe_bills', bubbleId: 'bills_safe' } }) } });

  assert.equal(calls[0][1], payload);
  assert.equal(calls[1][1], bills);
  assert.equal(context.pwned, undefined);
});

test('AI card payload keys are generated and restricted to safe attribute characters', () => {
  assert.match(source, /function aiCreatePayloadKey/);
  assert.match(source, /replace\(\/\[\^A-Za-z0-9_-\]/);
  assert.doesNotMatch(source, /data-payload-key="\$\{(?:JSON|stringify)/);
});

test('submitting an AI edit releases the stale transaction payload', () => {
  const start = source.indexOf('async function aiSubmitEdit');
  const end = source.indexOf('\nfunction aiCancelEdit', start);
  assert.match(source.slice(start, end), /aiReleasePayloadForBubble\(bubbleId\)/);
});
