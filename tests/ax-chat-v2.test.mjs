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

function fixture(query = '', { receiptRows = [], messages = [], peerLastActive = null, persistedSession = null } = {}) {
  const storage = persistedSession || new Map();
  const callbacks = new Map();
  const calls = [];
  const channels = [];
  const clearedTimers = [];
  const intervalCallbacks = [];
  const status = { textContent: '', style: {} };
  const dot = { style: {} };
  // Tiny DOM stand-in: the typing bubble is a child of the existing chat container.
  const children = [];
  const msgBox = {
    children, scrollTop: 900, scrollHeight: 1000, clientHeight: 100,
    getClientRects: () => [{}],
    get lastElementChild() { return children[children.length - 1] || null; },
    querySelector(selector) {
      return selector === '[data-axv2-typing]'
        ? children.find(node => node.attributes['data-axv2-typing'] === 'true') || null : null;
    },
    appendChild(node) {
      node.remove(); // Mirrors real DOM move-to-end semantics.
      node.parent = this;
      children.push(node);
      this.scrollHeight += 40;
    }
  };
  const document = {
    visibilityState: 'visible',
    addEventListener(type, callback) { callbacks.set(type, callback); },
    getElementById(id) {
      if (id === 'chat-msgs-el') return msgBox;
      if (id === 'chat-status-text') return status;
      if (id === 'chat-online-dot') return dot;
      return null;
    },
    createElement() {
      const node = { attributes: {}, parent: null, className: '', innerHTML: '',
        setAttribute(key, val) { this.attributes[key] = val; },
        remove() {
          if (!this.parent) return;
          const index = this.parent.children.indexOf(this);
          if (index >= 0) this.parent.children.splice(index, 1);
          this.parent = null;
        }
      };
      return node;
    },
    querySelectorAll(selector) {
      return selector === '[data-axv2-typing]'
        ? children.filter(node => node.attributes['data-axv2-typing'] === 'true') : [];
    }
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
    setInterval(callback) { intervalCallbacks.push(callback); return intervalCallbacks.length; }, clearInterval(id) { clearedTimers.push(id); },
    setTimeout() { return 2; }, clearTimeout() {}, Date
  };
  runInNewContext(source, ctx, { timeout: 2000 });
  return { api: ctx.window.axChatV2, calls, callbacks, channels, clearedTimers, intervalCallbacks, status, dot, msgBox, ctx };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('Chat V2 is on by default on the normal main website, without changing legacy send', () => {
  const env = fixture();
  assert.equal(env.api.enabled, true);
  assert.equal(env.calls.length, 0); // No server activity until login.
  assert.equal(env.channels.length, 0);
});

test('explicit ?axchatv2=1 also enables Chat V2', () => {
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


test('peer typing appears as three dots INSIDE chat while header stays Online', async () => {
  const env = fixture('?axchatv2=1', { peerLastActive: new Date().toISOString() });
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  assert.ok(typing, 'typing status realtime listener exists');
  typing.callback({
    eventType: 'INSERT', new: { conversation_id: CID, user_id: PEER,
      expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.status.textContent, 'Online'); // no 'typing...' in header
  assert.equal(env.msgBox.children.length, 1);
  assert.equal(env.msgBox.children[0].attributes['data-axv2-typing'], 'true');
  assert.equal(env.msgBox.children[0].attributes['aria-label'], 'Other person is typing');
  assert.equal((env.msgBox.children[0].innerHTML.match(/<span><\/span>/g) || []).length, 3);
  assert.equal(env.calls.filter(c => c.name === 'messages').length, 0);
});

test('typing stops and ephemeral chat bubble disappears without altering message data', async () => {
  const original = [{ id: MSG, from: PEER, text: 'existing message' }];
  const env = fixture('?axchatv2=1', { messages: original });
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  typing.callback({
    eventType: 'INSERT', new: { user_id: PEER, expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.msgBox.children.length, 1);
  typing.callback({ eventType: 'DELETE', old: { user_id: PEER } });
  assert.equal(env.msgBox.children.length, 0);
  assert.equal(original.length, 1);
  assert.equal(original[0].text, 'existing message');
});

test('typing from another conversation is ignored and account cleanup removes bubble', async () => {
  const env = fixture('?axchatv2=1');
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  typing.callback({
    eventType: 'INSERT', new: { user_id: OTHER, expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.msgBox.children.length, 0);
  typing.callback({
    eventType: 'INSERT', new: { user_id: PEER, expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.msgBox.children.length, 1);
  env.api.cleanup();
  assert.equal(env.msgBox.children.length, 0);
});

test('switching chats clears old typing indicator without modifying the old chat', async () => {
  const env = fixture('?axchatv2=1');
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  typing.callback({
    eventType: 'INSERT', new: { user_id: PEER, expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.msgBox.children.length, 1);
  env.ctx.currentChatUserId = OTHER;
  env.api.onConversation(CID, OTHER);
  assert.equal(env.msgBox.children.length, 0);
});

test('typing refresh never duplicates an already-visible bubble', async () => {
  const env = fixture('?axchatv2=1');
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  for (let i = 0; i < 3; i++) {
    typing.callback({
      eventType: 'UPDATE', new: { user_id: PEER,
        expires_at: new Date(Date.now() + 5000).toISOString() }
    });
  }
  assert.equal(env.msgBox.children.length, 1);
});

test('typing bubble stays disabled in legacy fallback; CSS/JS versions are cache-busted', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/ax-chat-v2.css', import.meta.url), 'utf8');
  const env = fixture('?axchatv2=0');
  assert.equal(env.api.enabled, false);
  assert.equal(env.msgBox.children.length, 0);
  assert.match(index, /ax-chat-v2\.js\?v=aalynex-v2-unread-badges-20261118/);
  assert.match(index, /ax-chat-v2\.css\?v=aalynex-v2-unread-badges-20261118/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /axv2-typing-bubble/);
});


test('typing bubble expires automatically even without a DELETE event', async () => {
  const env = fixture('?axchatv2=1', { peerLastActive: new Date().toISOString() });
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  typing.callback({ eventType: 'INSERT',
    new: { user_id: PEER, expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.msgBox.children.length, 1);
  const future = Date.now() + 9000;
  env.ctx.Date = class SimulatedDate extends Date { static now() { return future; } };
  const statusTimer = env.intervalCallbacks.at(-1);
  statusTimer();
  assert.equal(env.msgBox.children.length, 0);
  assert.notEqual(env.status.textContent, 'typing…');
});

test('typing bubble never replaces or mutates existing chat message elements', async () => {
  const env = fixture('?axchatv2=1');
  const existing = { attributes: {}, parent: env.msgBox, textContent: 'protected video card' };
  env.msgBox.children.push(existing);
  env.api.onLogin({ id: ME });
  await flush();
  const typing = env.channels[0].events.find(e => e.opts.table === 'axv8_typing_status');
  typing.callback({ eventType: 'INSERT',
    new: { user_id: PEER, expires_at: new Date(Date.now() + 5000).toISOString() }
  });
  assert.equal(env.msgBox.children.length, 2);
  assert.equal(env.msgBox.children[0], existing);
  assert.equal(existing.textContent, 'protected video card');
  env.api.cleanup();
  assert.equal(env.msgBox.children.length, 1);
  assert.equal(env.msgBox.children[0], existing);
});


test('explicit ?axchatv2=0 disables optional V2 without touching legacy chat', () => {
  const env = fixture('?axchatv2=0');
  assert.equal(env.api.enabled, false);
  assert.equal(env.calls.length, 0);
  assert.equal(env.channels.length, 0);
  assert.equal(env.callbacks.has('input'), false);
});

test('fallback persists for subsequent navigations in this tab', () => {
  const persistedSession = new Map();
  assert.equal(fixture('?axchatv2=0', { persistedSession }).api.enabled, false);
  assert.equal(fixture('', { persistedSession }).api.enabled, false);
  assert.equal(persistedSession.get('aalynex-chat-v2-preview'), '0');
});

test('explicit ?axchatv2=1 re-enables V2 after fallback, including next navigation', () => {
  const persistedSession = new Map();
  fixture('?axchatv2=0', { persistedSession });
  assert.equal(fixture('?axchatv2=1', { persistedSession }).api.enabled, true);
  assert.equal(fixture('', { persistedSession }).api.enabled, true);
  assert.equal(persistedSession.get('aalynex-chat-v2-preview'), '1');
});
