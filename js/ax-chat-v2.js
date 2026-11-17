/* Aalynex Chat V2 — opt-in only. Legacy message, payment and file paths stay intact.
 * Enable in the current tab with ?axchatv2=1; disable with ?axchatv2=0.
 * Do not store message content or peer presence in browser storage.
 */
(function () {
  'use strict';
  const configKey = 'aalynex-chat-v2-preview';
  let enabled = false;
  try {
    const requested = new URLSearchParams(window.location.search).get('axchatv2');
    if (requested === '1') sessionStorage.setItem(configKey, '1');
    if (requested === '0') sessionStorage.removeItem(configKey);
    enabled = sessionStorage.getItem(configKey) === '1';
  } catch (_) { enabled = false; }

  window.axChatV2 = { enabled: false };
  if (!enabled) return;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const receipts = new Map();
  const delivered = new Set();
  const read = new Set();
  const pending = new Set();
  let me = null, peer = null, conversation = null, generation = 0;
  let receiptChannel = null, peerLastActive = null, typingUntil = 0;
  let lastTypingRequest = 0, typingTimer = null, typingSent = false;
  let heartbeatTimer = null, refreshTimer = null, pollingTimer = null, statusTimer = null;
  const currentUser = () => typeof CU !== 'undefined' && CU ? String(CU.id) : '';
  const openConversation = () => typeof currentConversationId !== 'undefined' ? currentConversationId : null;
  const otherUser = () => typeof currentChatUserId !== 'undefined' ? currentChatUserId : null;
  const client = () => typeof supaClient !== 'undefined' ? supaClient : null;
  const visible = () => typeof document.visibilityState !== 'string' || document.visibilityState === 'visible';
  const owner = () => !!me && me === currentUser() && !!client();
  const active = () => owner() && conversation && peer === String(otherUser() || '') &&
      String(openConversation() || '') === conversation;
  const chatVisible = () => {
    const node = document.getElementById('chat-msgs-el');
    return active() && visible() && !!node && (!node.getClientRects || node.getClientRects().length > 0);
  };
  const age = timestamp => Math.max(0, Date.now() - Date.parse(timestamp || ''));
  const ownMessages = () => {
    if (!active() || typeof DB === 'undefined') return [];
    const key = [me, peer].sort().join('_');
    return DB.messages()[key] || [];
  };

  function badge(message, isMine) {
    if (!isMine || !uuidRe.test(String(message?.id || '')) ||
        ['sending', 'failed', 'blocked'].includes(message?._deliveryStatus)) return null;
    const receipt = receipts.get(String(message.id));
    if (receipt?.read_at) return { className: 'axv2-ticks is-read', label: 'Read', text: '✓✓' };
    if (receipt?.delivered_at) return { className: 'axv2-ticks is-delivered', label: 'Delivered', text: '✓✓' };
    return { className: 'axv2-ticks is-sent', label: 'Sent to server', text: '✓' };
  }
  function ticks(message, isMine) {
    const b = badge(message, isMine);
    return b ? '<span class="' + b.className + '" data-chat-v2-id="' + message.id +
      '" role="img" aria-label="' + b.label + '">' + b.text + '</span>' : '';
  }
  function repaintTicks() {
    if (!active()) return;
    document.querySelectorAll('[data-chat-v2-id]').forEach(node => {
      const b = badge({ id: node.getAttribute('data-chat-v2-id') }, true);
      if (!b) return;
      node.className = b.className;
      node.textContent = b.text;
      node.setAttribute('aria-label', b.label);
    });
  }

  async function acknowledge(ids, markRead) {
    if (!owner()) return;
    const snapshot = generation;
    const target = markRead ? read : delivered;
    const list = [...new Set(ids.filter(id => uuidRe.test(String(id))))]
      .filter(id => !target.has(id) && !pending.has((markRead ? 'r:' : 'd:') + id));
    for (let i = 0; i < list.length; i += 80) {
      const chunk = list.slice(i, i + 80);
      const keys = chunk.map(id => (markRead ? 'r:' : 'd:') + id);
      keys.forEach(k => pending.add(k));
      try {
        const result = await client().rpc('axv2_ack_messages', { p_message_ids: chunk, p_read: !!markRead });
        if (!result.error && snapshot === generation && owner()) {
          chunk.forEach(id => { target.add(id); if (markRead) delivered.add(id); });
        }
      } catch (_) { /* Preview-only feature: no impact on sending or legacy UI. */ }
      finally { keys.forEach(k => pending.delete(k)); }
    }
  }
  function receivedInChat() {
    return ownMessages().filter(m => String(m.from) === peer && uuidRe.test(String(m.id)))
      .map(m => String(m.id));
  }
  function markReadIfVisible() {
    if (!chatVisible()) return;
    const ids = receivedInChat();
    if (ids.length) void acknowledge(ids, true);
  }
  function onSynced() {
    if (!owner() || typeof DB === 'undefined') return;
    const ids = [];
    const all = DB.messages();
    Object.keys(all).forEach(key => {
      if (!key.split('_').includes(me)) return;
      (all[key] || []).forEach(m => {
        if (String(m.from) !== me && uuidRe.test(String(m.id))) ids.push(String(m.id));
      });
    });
    if (ids.length) void acknowledge(ids, false);
    markReadIfVisible();
  }
  function onIncoming(payload) {
    const m = payload?.new;
    if (!owner() || !m || String(m.receiver_id) !== me || !uuidRe.test(String(m.id))) return;
    void acknowledge([String(m.id)], false);
    if (chatVisible() && String(m.conversation_id) === conversation) {
      // Let existing receiver renderer paint before acknowledging that it was read.
      setTimeout(markReadIfVisible, 120);
    }
  }

  async function loadReceipts() {
    if (!active()) return;
    const cid = conversation, other = peer, epoch = generation;
    try {
      const result = await client().from('axv2_message_receipts')
        .select('message_id,delivered_at,read_at')
        .eq('conversation_id', cid).eq('user_id', other);
      if (result.error || epoch !== generation || !active() || conversation !== cid) return;
      receipts.clear();
      (result.data || []).forEach(r => { if (uuidRe.test(String(r.message_id))) receipts.set(String(r.message_id), r); });
      repaintTicks();
    } catch (_) { /* Missing/temporarily unavailable V2 schema must never block chat. */ }
  }

  function lastSeenLabel(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Offline';
    const elapsed = age(value);
    if (elapsed < 90000) return 'Online';
    if (elapsed < 3600000) return 'Last active ' + Math.max(1, Math.floor(elapsed / 60000)) + 'm ago';
    if (elapsed < 86400000) return 'Last active ' + Math.floor(elapsed / 3600000) + 'h ago';
    return 'Last active ' + new Date(value).toLocaleDateString();
  }
  function renderStatus() {
    if (!active()) return;
    const label = document.getElementById('chat-status-text');
    const dot = document.getElementById('chat-online-dot');
    if (!label) return;
    if (typingUntil > Date.now()) {
      label.textContent = 'typing…';
      label.style.color = 'var(--green)';
      if (dot) dot.style.background = 'var(--green)';
      return;
    }
    const status = lastSeenLabel(peerLastActive);
    label.textContent = status;
    label.style.color = status === 'Online' ? 'var(--green)' : 'var(--text-3)';
    if (dot) dot.style.background = status === 'Online' ? 'var(--green)' : 'var(--text-3)';
  }
  async function refreshPresence() {
    if (!active()) return;
    const cid = conversation, epoch = generation;
    try {
      const result = await client().from('axv2_presence')
        .select('last_active_at').eq('user_id', peer).maybeSingle();
      if (result.error || epoch !== generation || conversation !== cid) return;
      peerLastActive = result.data?.last_active_at || null;
      renderStatus();
    } catch (_) { /* Conservative offline display on read failure. */ }
  }
  async function touchPresence() {
    if (!owner() || !visible()) return;
    try { await client().rpc('axv2_touch_presence'); } catch (_) {}
  }

  async function pollTyping() {
    if (!chatVisible()) return;
    const cid = conversation, epoch = generation;
    try {
      const result = await client().from('axv8_typing_status')
        .select('expires_at').eq('conversation_id', cid).eq('user_id', peer).maybeSingle();
      if (result.error || epoch !== generation || conversation !== cid) return;
      typingUntil = result.data ? Math.max(0, Date.parse(result.data.expires_at) || 0) : 0;
      renderStatus();
    } catch (_) {}
  }
  function typingEvent(payload) {
    if (!active()) return;
    const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
    if (String(row?.user_id || '') !== peer) return;
    typingUntil = payload.eventType === 'DELETE' ? 0 : (Date.parse(row?.expires_at || '') || 0);
    renderStatus();
  }
  async function sendTyping(value) {
    if (!active()) return;
    try {
      await client().rpc('axv8_set_typing', { p_conversation_id: conversation, p_typing: !!value });
    } catch (_) { /* Typing is non-critical and must not affect sendMsg. */ }
  }
  function stopTyping() {
    clearTimeout(typingTimer);
    typingTimer = null;
    if (!typingSent) return;
    typingSent = false;
    void sendTyping(false);
  }
  function typed() {
    if (!chatVisible()) return;
    const now = Date.now();
    if (now - lastTypingRequest > 1800) {
      lastTypingRequest = now;
      typingSent = true;
      void sendTyping(true);
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 2500);
  }

  function onConversation(cid, other) {
    if (!owner() || !uuidRe.test(String(cid)) || !uuidRe.test(String(other))) return;
    if (conversation === cid && peer === String(other) && receiptChannel) {
      markReadIfVisible();
      return;
    }
    stopTyping();
    if (receiptChannel) { try { void client().removeChannel(receiptChannel); } catch (_) {} }
    receiptChannel = null;
    conversation = String(cid);
    peer = String(other);
    receipts.clear();
    peerLastActive = null;
    typingUntil = 0;
    const localCid = conversation, epoch = generation;
    const channel = client().channel('axv2_' + localCid + '_' + me + '_' + epoch);
    receiptChannel = channel
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'axv2_message_receipts',
        filter: 'conversation_id=eq.' + localCid
      }, () => { if (epoch === generation && conversation === localCid) void loadReceipts(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'axv8_typing_status',
        filter: 'conversation_id=eq.' + localCid
      }, payload => { if (epoch === generation && conversation === localCid) typingEvent(payload); })
      .subscribe();
    void touchPresence();
    void refreshPresence();
    void loadReceipts();
    void pollTyping();
    markReadIfVisible();
  }
  function cleanup() {
    generation++;
    stopTyping();
    if (receiptChannel && client()) {
      try { void client().removeChannel(receiptChannel); } catch (_) {}
    }
    receiptChannel = null;
    [heartbeatTimer, refreshTimer, pollingTimer, statusTimer].forEach(t => clearInterval(t));
    heartbeatTimer = refreshTimer = pollingTimer = statusTimer = null;
    conversation = peer = me = peerLastActive = null;
    typingUntil = 0;
    delivered.clear();
    read.clear();
    receipts.clear();
    pending.clear();
  }
  function onLogin(user) {
    if (!user?.id) return;
    cleanup();
    me = String(user.id);
    void touchPresence();
    heartbeatTimer = setInterval(touchPresence, 45000);
    refreshTimer = setInterval(refreshPresence, 12500);
    pollingTimer = setInterval(pollTyping, 3300);
    statusTimer = setInterval(() => { renderStatus(); markReadIfVisible(); }, 1800);
    if (openConversation() && otherUser()) onConversation(openConversation(), otherUser());
  }

  document.addEventListener('input', e => {
    if (e.target?.id === 'chat-inp-el') typed();
  });
  document.addEventListener('focusout', e => {
    if (e.target?.id === 'chat-inp-el') stopTyping();
  });
  document.addEventListener('visibilitychange', () => {
    if (!visible()) stopTyping();
    else { void touchPresence(); void refreshPresence(); markReadIfVisible(); }
  });

  window.axChatV2 = {
    enabled: true, ticks, repaintTicks, onLogin, onConversation, onSynced,
    onIncoming, refreshPresence, cleanup
  };
})();
