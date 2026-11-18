/* Aalynex Chat V2 — default enabled after two-account preview validation.
 * Emergency per-tab fallback: ?axchatv2=0; re-enable: ?axchatv2=1.
 * This flag changes ONLY the optional V2 client; legacy send, media and payments stay intact.
 * Do not store message content or peer presence in browser storage.
 */
(function () {
  'use strict';
  const configKey = 'aalynex-chat-v2-preview';
  let enabled = false;
  try {
    const requested = new URLSearchParams(window.location.search).get('axchatv2');
    // Explicit opt-out must persist for the tab; removing the key would
    // accidentally turn V2 straight back on now that V2 is the default.
    if (requested === '1') sessionStorage.setItem(configKey, '1');
    if (requested === '0') sessionStorage.setItem(configKey, '0');
    enabled = sessionStorage.getItem(configKey) !== '0';
  } catch (_) { enabled = false; } // Fail closed to legacy chat.

  window.axChatV2 = { enabled: false };
  if (!enabled) return;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const receipts = new Map();
  let replyDraft = null;
  const unreadByPeer = new Map();
  const delivered = new Set();
  const read = new Set();
  const pending = new Set();
  let me = null, peer = null, conversation = null, generation = 0;
  let receiptChannel = null, peerLastActive = null, typingUntil = 0;
  let lastTypingRequest = 0, typingTimer = null, typingSent = false;
  let heartbeatTimer = null, refreshTimer = null, pollingTimer = null, statusTimer = null;
  let unreadPollingTimer = null, unreadRefreshTimeout = null, unreadRequest = null, unreadQueued = false;
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

  // Only confirmed receiver-side delivery receipts count toward unread badges.
  // No historical message rows are treated as unread without a delivery receipt.
  function paintUnreadBadges() {
    if (!owner()) return;
    document.querySelectorAll('.cc-item[data-uid]').forEach(item => {
      const userId = item.getAttribute('data-uid');
      const count = unreadByPeer.get(userId) || 0;
      let badge = item.querySelector('.axv2-unread-badge');
      if (count < 1) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'axv2-unread-badge';
        item.appendChild(badge);
      }
      const text = count > 99 ? '99+' : String(count);
      if (badge.textContent !== text) badge.textContent = text;
      badge.setAttribute('aria-label', text + ' unread messages');
      badge.setAttribute('title', text + ' unread messages');
    });
  }
  function scheduleUnreadRefresh() {
    if (!owner() || unreadRefreshTimeout !== null) return;
    unreadRefreshTimeout = setTimeout(() => {
      unreadRefreshTimeout = null;
      void refreshUnread();
    }, 250);
  }
  async function refreshUnread() {
    if (!owner()) return;
    if (unreadRequest) { unreadQueued = true; return; }
    const request = {};
    unreadRequest = request;
    const myId = me, epoch = generation;
    try {
      // Conversation membership and receipt ownership are both enforced by RLS.
      const peersByConversation = new Map();
      let offset = 0, page = [];
      do {
        const { data, error } = await client().from('conversations')
          .select('id,user1_id,user2_id')
          .order('id', { ascending: true }).range(offset, offset + 499);
        if (error) throw error;
        page = data || [];
        page.forEach(c => {
          if (String(c.user1_id) === myId) peersByConversation.set(String(c.id), String(c.user2_id));
          if (String(c.user2_id) === myId) peersByConversation.set(String(c.id), String(c.user1_id));
        });
        offset += page.length;
      } while (page.length === 500 && offset < 50000 && epoch === generation && owner());

      const counts = new Map();
      offset = 0;
      do {
        const { data, error } = await client().from('axv2_message_receipts')
          .select('message_id,conversation_id')
          .eq('user_id', myId).is('read_at', null)
          .order('message_id', { ascending: true }).range(offset, offset + 499);
        if (error) throw error;
        page = data || [];
        page.forEach(r => {
          const other = peersByConversation.get(String(r.conversation_id));
          if (other) counts.set(other, (counts.get(other) || 0) + 1);
        });
        offset += page.length;
      } while (page.length === 500 && offset < 50000 && epoch === generation && owner());

      if (!owner() || epoch !== generation || myId !== me) return;
      unreadByPeer.clear();
      counts.forEach((count, other) => unreadByPeer.set(other, count));
      paintUnreadBadges();
    } catch (_) {
      // Unread count is non-critical; never interrupt chats if offline or RLS denies the query.
    } finally {
      // A former account's late network response must not unset a newer
      // account's fetch-in-progress marker or repaint its badges.
      if (unreadRequest === request) {
        unreadRequest = null;
        if (unreadQueued && owner()) {
          unreadQueued = false;
          scheduleUnreadRefresh();
        }
      }
    }
  }

  // Reply drafts are transient and account/peer-bound. Only original message IDs
  // are stored server-side; no pasted quote text or secure file keys are saved.
  const replyEscape = value => String(value ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const replySnippet = message => {
    if (!message) return 'Original message unavailable';
    if (message.file_url) return 'Protected attachment';
    const text = String(message.text || '');
    if (/^\[NEGOTIATION_REQ\]/.test(text)) return 'Negotiation offer';
    if (/^(Final Delivery|Project Preview:)/i.test(text)) return 'Project delivery';
    const plain = text.replace(/\s+/g, ' ').trim();
    return plain.length > 110 ? plain.slice(0, 107) + '…' : plain || 'Message';
  };
  const replySender = message => {
    if (!message) return 'Original message';
    if (String(message.from) === me) return 'You';
    const user = typeof DB !== 'undefined' && DB.users().find(u => String(u.id) === String(message.from));
    return user?.name || 'Them';
  };
  function removeReplyComposer() {
    const node = document.getElementById('axv2-reply-composer');
    if (node) node.remove();
  }
  function cancelReply() {
    replyDraft = null;
    removeReplyComposer();
  }
  function renderReplyComposer() {
    removeReplyComposer();
    if (!chatVisible() || !replyDraft || replyDraft.myId !== me || replyDraft.peer !== peer) return;
    const bar = document.querySelector('.chat-inp-bar');
    if (!bar || !bar.parentNode) return;
    const original = ownMessages().find(m => String(m.id) === replyDraft.id);
    if (!original || original.file_url) { cancelReply(); return; }
    const el = document.createElement('div');
    el.id = 'axv2-reply-composer';
    el.className = 'axv2-reply-composer';
    const title = document.createElement('div');
    title.className = 'axv2-reply-composer-text';
    const name = document.createElement('strong');
    name.textContent = 'Replying to ' + replySender(original);
    const preview = document.createElement('span');
    preview.textContent = replySnippet(original);
    title.append(name, preview);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'axv2-reply-cancel';
    close.setAttribute('data-axv2-reply-cancel','true');
    close.setAttribute('aria-label','Cancel reply');
    close.textContent = '×';
    el.append(title, close);
    bar.parentNode.insertBefore(el, bar);
  }
  function startReply(messageId) {
    if (!chatVisible() || !uuidRe.test(String(messageId))) return;
    const original = ownMessages().find(m => String(m.id) === String(messageId));
    if (!original || original.file_url || ['sending','failed','blocked'].includes(original._deliveryStatus)) return;
    if (![me, peer].includes(String(original.from))) return;
    replyDraft = {id:String(messageId),myId:me,peer};
    renderReplyComposer();
    document.getElementById('chat-inp-el')?.focus();
  }
  function takeReply(myId, otherId) {
    if (!replyDraft || !owner()) return null;
    const current = replyDraft;
    if (current.myId !== String(myId) || current.peer !== String(otherId) ||
        !chatVisible() || !ownMessages().some(m => m.id === current.id && !m.file_url)) {
      cancelReply();
      return null;
    }
    cancelReply();
    return current.id;
  }
  function replyButton(message) {
    if (!message || !uuidRe.test(String(message.id)) ||
        ['sending','failed','blocked'].includes(message._deliveryStatus)) return '';
    return '<button type="button" class="axv2-reply-action" data-axv2-reply="' +
      replyEscape(message.id) + '" aria-label="Reply to message" title="Reply to message">↩ Reply</button>';
  }
  function quotedMessage(message, allMessages) {
    const targetId = String(message?.replyToMessageId || message?.reply_to_message_id || '');
    if (!uuidRe.test(targetId)) return '';
    const target = (allMessages || []).find(m => String(m.id) === targetId);
    return '<button type="button" class="axv2-message-quote" data-axv2-reply-jump="' +
      replyEscape(targetId) + '" aria-label="Go to replied message"><strong>' +
      replyEscape(replySender(target)) + '</strong><span>' +
      replyEscape(replySnippet(target)) + '</span></button>';
  }
  document.addEventListener('click', event => {
    if (!window.axChatV2?.enabled) return;
    const cancel = event.target?.closest?.('[data-axv2-reply-cancel]');
    if (cancel) { event.preventDefault(); cancelReply(); return; }
    const button = event.target?.closest?.('[data-axv2-reply]');
    if (button) {
      event.preventDefault();
      startReply(button.getAttribute('data-axv2-reply'));
      return;
    }
    const quote = event.target?.closest?.('[data-axv2-reply-jump]');
    if (quote) {
      event.preventDefault();
      const id = quote.getAttribute('data-axv2-reply-jump');
      if (!uuidRe.test(String(id))) return;
      const target = document.querySelector('[data-axv2-msg-id="' + id + '"]');
      if (target) {
        target.scrollIntoView({behavior:'smooth',block:'center'});
        target.classList.add('axv2-reply-highlight');
        setTimeout(() => target.classList.remove('axv2-reply-highlight'), 1700);
      }
    }
  });

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
          scheduleUnreadRefresh();
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
    scheduleUnreadRefresh();
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
  // Ephemeral indicator: a separate bubble at the end of the visible chat.
  // Do not edit, persist, or re-render any real message or protected media card.
  function removeTypingBubble() {
    document.querySelectorAll('[data-axv2-typing]').forEach(node => node.remove());
  }
  function renderTypingBubble() {
    const box = document.getElementById('chat-msgs-el');
    if (!box) return;
    let bubble = box.querySelector('[data-axv2-typing]');
    if (!chatVisible() || typingUntil <= Date.now()) {
      if (bubble) bubble.remove();
      return;
    }
    if (bubble && box.lastElementChild === bubble) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'axv2-typing-row';
      bubble.setAttribute('data-axv2-typing', 'true');
      bubble.setAttribute('role', 'status');
      bubble.setAttribute('aria-label', 'Other person is typing');
      bubble.innerHTML = '<span class="axv2-typing-bubble" aria-hidden="true">' +
        '<span></span><span></span><span></span></span>';
    }
    box.appendChild(bubble);
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }
  function renderStatus() {
    if (!active()) {
      removeTypingBubble();
      return;
    }
    // Keep Online/Last active in the header; show typing ONLY inside the chat.
    const label = document.getElementById('chat-status-text');
    const dot = document.getElementById('chat-online-dot');
    const status = lastSeenLabel(peerLastActive);
    if (label) {
      label.textContent = status;
      label.style.color = status === 'Online' ? 'var(--green)' : 'var(--text-3)';
    }
    if (dot) dot.style.background = status === 'Online' ? 'var(--green)' : 'var(--text-3)';
    renderTypingBubble();
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
      renderStatus();
      return;
    }
    cancelReply();
    removeTypingBubble();
    stopTyping();
    if (receiptChannel) { try { void client().removeChannel(receiptChannel); } catch (_) {} }
    receiptChannel = null;
    conversation = String(cid);
    peer = String(other);
    receipts.clear();
    peerLastActive = null;
    typingUntil = 0;
    renderStatus();
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
    cancelReply();
    generation++;
    clearTimeout(unreadRefreshTimeout);
    clearInterval(unreadPollingTimer);
    unreadRefreshTimeout = unreadPollingTimer = null;
    unreadRequest = null;
    unreadQueued = false;
    unreadByPeer.clear();
    document.querySelectorAll('.axv2-unread-badge').forEach(node => node.remove());
    removeTypingBubble();
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
    unreadPollingTimer = setInterval(() => { void refreshUnread(); }, 30000);
    statusTimer = setInterval(() => { renderStatus(); markReadIfVisible(); paintUnreadBadges(); }, 1800);
    void refreshUnread();
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
    onIncoming, refreshPresence, cleanup,
    replyButton, quotedMessage, takeReply, cancelReply, renderReplyComposer
  };
})();
