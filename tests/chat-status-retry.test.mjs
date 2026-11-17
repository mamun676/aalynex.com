import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('function axChatPendingHTML(');
const end = source.indexOf('async function axChatWait(', start);
assert.ok(start > 0 && end > start, 'Chat delivery-status helper must exist');
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const render = runInNewContext(
  source.slice(start, end) + '\naxChatPendingHTML',
  { escapeHtml }
);
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bubble = status => ({ id, text: 'hello', _deliveryStatus: status });

test('confirmed sent messages show only ticks, not a duplicate Sent label', () => {
  assert.equal(render(bubble('sent'), true), '');
});

test('sending message gets a compact clock, not an extra text label', () => {
  const html = render(bubble('sending'), true);
  assert.match(html, /aria-label="Sending message"/);
  assert.doesNotMatch(html, />Sending[.… ]/);
  assert.doesNotMatch(html, /data-chat-retry/);
});

test('server-unconfirmed send offers exactly one Retry button bound to the same ID', () => {
  const html = render(bubble('failed'), true);
  assert.match(html, /Not sent/);
  assert.match(html, /data-chat-retry="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"/);
  assert.equal((html.match(/>Retry</g) || []).length, 1);
});

test('receiver has no sending or retry controls for any status', () => {
  for (const status of ['sending', 'sent', 'failed', 'blocked']) {
    assert.equal(render(bubble(status), false), '');
  }
});

test('ID collision remains blocked without offering unsafe retry', () => {
  const html = render(bubble('blocked'), true);
  assert.match(html, /contact support/i);
  assert.doesNotMatch(html, /data-chat-retry/);
});

test('retry still uses original UUID and checks server state before insert', () => {
  assert.match(source, /const e=axChatOutbox\.get\(id\)/);
  assert.match(source, /e\.status!=='failed'/);
  assert.match(source, /let row=await axChatLookup\(e\)/);
  assert.match(source, /if\(!row\)\{/);
  assert.match(source, /const id=crypto\.randomUUID\(\)/);
});

test('browser cache bust points to current compact-status chat bundle', () => {
  assert.match(index, /js\/chat\.js\?v=aalynex-chat-compact-status-retry-v1/);
});
