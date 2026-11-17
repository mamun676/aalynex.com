import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/ax-chat-v2.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/202611170201_ax_chat_v2_optional_receipts_presence.sql', import.meta.url), 'utf8');
const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const CID = '33333333-3333-4333-8333-333333333333';
const MSG = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';

function fixture(query = '', { receiptRows = [], messages = [], peerLastActive = null } = {}) {
  const storage = new Map();
  const callbacks = new Map();
  const calls = [];
  const channels = [];
  const clearedTimers = [];
  const status = { textContent: '', style: {} };
  const dot = { style: {} };
  const msgBox = { getClientRects: () => [{}] };
  const document = {
    visibilityState: 'visible',
    addEventListener(type, callback) { callbacks.set(type, callback); },
    getElementById(id) {
      if (id === 'chat-msgs-el') return msgBox;
      if (id === 'chat-status-text') return status;
      if (id === 'chat-online-dot') return dot;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const sessionStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const supaClient = {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: 1, error: null }; },
    removeChannel: async () => {},
    channel: name => {
      const c = { name, events: [],
        on(type, opts, callback) { this.events.push({ type, opts, callback }); return this; },
        subscribe() { return this; }
      };
      channels.push(c);
      return c;
    },
    from(name) {
      let rows = [];
      if (name === 'axv2_message_receipts') rows = receiptRows;
      if (name === 'axv2_presence') rows = peerLastActive ? [{ last_active_at: peerLastActive }] : [];
      const q = {
        select() { return this; },
        eq() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); }
      };
      return q;
    }
  };
  const key = [ME, PEER].sort().join('_');
  const DB = { messages: () => ({ [key]: messages }) };
  const ctx = {
    window: { location: { search: query } }, document, sessionStorage, URLSearchParams,
    CU: { id: ME }, DB, supaClient, currentConversationId: CID, currentChatUserId: PEER,
    setInterval() { return 1; }, clearInterval(id) { clearedTimers.push(id); },
    setTimeout() { return 2; }, clearTimeout() {}, Date
  };
  runInNewContext(source, ctx, { timeout: 2000 });
  return { api: ctx.window.axChatV2, calls, callbacks, channels, clearedTimers, status, dot };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('Chat V2 is completely off by default', () => {
  const env = fixture();
  assert.equal(env.api.enabled, false);
  assert.equal(env.calls.length, 0);
  assert.equal(env.channels.length, 0);
});

test('explicit preview opt-in activates V2 without enabling it globally', () => {
  const env = fixture('?axchatv2=1');
  assert.equal(env.api.enabled, true);
  assert.equal(typeof env.api.ticks, 'function');
});

test('confirmed sender message begins with SINGLE server tick, never fake delivery', () => {
  const env = fixture('?axchatv2=1');
  const html = env.api.ticks({ id: MSG }, true);
  assert.match(html, /aria-label="Sent to server"/);
  assert.doesNotMatch(html, /✓✓/);
  assert.equal(env.api.ticks({ id: MSG }, false), '');
  assert.equal(env.api.ticks({ id: MSG, _deliveryStatus: 'failed' }, true), '');
});

test('only server-backed receipt creates double BLUE read ticks', async () => {
  const env = fixture('?axchatv2=1', {
    receiptRows: [{ message_id: MSG, delivered_at: new Date().toISOString(), read_at: new Date().toISOString() }],
    peerLastActive: new Date().toISOString()
  });
  env.api.onLogin({ id: ME });
  await flush();
  assert.match(env.api.ticks({ id: MSG }, true), /aria-label="Read"/);
  assert.match(env.api.ticks({ id: MSG }, true), /is-read/);
  assert.match(env.api.ticks({ id: MSG }, true), /✓✓/);
  assert.equal(env.status.textContent, 'Online');
});

test('delivered status is DOUBLE GREY, not blue', async () => {
  const env = fixture('?axchatv2=1', {
    receiptRows: [{ message_id: MSG, delivered_at: new Date().toISOString(), read_at: null }]
  });
  env.api.onLogin({ id: ME });
  await flush();
  assert.match(env.api.ticks({ id: MSG }, true), /is-delivered/);
  assert.doesNotMatch(env.api.ticks({ id: MSG }, true), /is-read/);
});

test('incoming sync only acknowledges receiver messages and uses its own RPC', async () => {
  const env = fixture('?axchatv2=1', {
    messages: [{ id: MSG, from: PEER }, { id: OTHER, from: ME }]
  });
  env.api.onLogin({ id: ME });
  env.api.onSynced();
  await flush();
  const ackCalls = env.calls.filter(call => call.name === 'axv2_ack_messages');
  assert.ok(ackCalls.length > 0);
  assert.ok(ackCalls.every(call => call.args.p_message_ids.every(id => id === MSG)));
  assert.ok(ackCalls.some(call => call.args.p_read === true)); // open visible conversation
  assert.ok(ackCalls.some(call => call.args.p_read === false));
});

test('typing sends only existing authenticated typing RPC, not new message writes', async () => {
  const env = fixture('?axchatv2=1');
  env.api.onLogin({ id: ME });
  env.callbacks.get('input')({ target: { id: 'chat-inp-el' } });
  await flush();
  const calls = env.calls.filter(c => c.name === 'axv8_set_typing');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_conversation_id, CID);
  assert.equal(calls[0].args.p_typing, true);
  assert.ok(env.calls.every(c => c.name !== 'messages'));
});

test('cleanup closes preview resources without changing legacy message state', () => {
  const env = fixture('?axchatv2=1');
  env.api.onLogin({ id: ME });
  assert.ok(env.channels.length > 0);
  env.api.cleanup();
  assert.ok(env.clearedTimers.length >= 4);
});

test('SQL is additive and uses RLS and invoker RPCs, never rewrites old chat or payments', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.axv2_message_receipts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.axv2_presence/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /axv2_receipts_receiver_insert/);
  assert.match(sql, /axv2_presence_conversation_peers/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE TABLE|UPDATE public\.messages|DELETE FROM public\.messages/i);
});
