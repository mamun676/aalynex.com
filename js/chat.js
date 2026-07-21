// ════════════════════════════════════
//  CHAT — messaging, realtime, polling
// ════════════════════════════════════
function toggleChat() {
  const chatList = document.querySelector('.chat-list');
  const btn = document.getElementById('chatToggleBtn');
  if (!chatList || !btn) return; // ✅ safety
  chatList.classList.toggle('open');
  btn.innerText = chatList.classList.contains('open') ? "Close" : "Chats";
}

function updateChatHeaderPresence() {
  if (!currentChatUserId) return;
  const dot = document.getElementById('chat-online-dot');
  const statusText = document.getElementById('chat-status-text');
  if (!dot || !statusText) return;
  if (onlineUsers.has(currentChatUserId)) {
    dot.style.background = 'var(--green)';
    statusText.textContent = 'Online';
    statusText.style.color = 'var(--green)';
  } else {
    dot.style.background = 'var(--text-3)';
    statusText.textContent = 'Offline';
    statusText.style.color = 'var(--text-3)';
  }
}

function updateChatSidebarPreviews() {
  document.querySelectorAll('.cc-item').forEach(el => {
    const uid = el.getAttribute('data-uid');
    if (uid) {
      const key = [CU.id, uid].sort().join('_');
      const msgs = DB.messages()[key] || [];
      const last = msgs[msgs.length - 1];
      let previewText = 'No messages yet';
      if (last) {
        if (last.file_url) previewText = 'Video Attachment';
        else if (last.text.startsWith('[NEGOTIATION_REQ]')) previewText = 'New Negotiation Offer';
        else previewText = last.text;
      }
      const prevEl = el.querySelector('.cc-prev');
      if (prevEl) prevEl.textContent = previewText;
    }
  });
}

function scrollChatToBottom() {
  const el = document.getElementById('chat-msgs-el');
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  });
}

function chatBack() {
  document.querySelector('.chat-wrap')?.classList.remove('show-chat');
}

function buildChat(myId, otherDefaultId) {
  const myProjects = DB.projects().filter(p => (p.creatorId === myId || p.freelancerId === myId) && p.status !== 'open');
  const relatedUserIds = [...new Set(myProjects.map(p => p.creatorId === myId ? p.freelancerId : p.creatorId).filter(id => id))];
  const allUsers = DB.users().filter(u => relatedUserIds.includes(u.id));

  const conversations = allUsers.map(u => {
    const key  = [myId, u.id].sort().join('_');
    const msgs = DB.messages()[key] || [];
    const last = msgs[msgs.length - 1];
    return { user: u, key, msgs, last };
  });
  const activeConvo = conversations.find(c => c.user.id === otherDefaultId) || conversations[0];
  const activeKey   = activeConvo?.key || (otherDefaultId ? [myId, otherDefaultId].sort().join('_') : '');

  return `
  <div class="chat-wrap">
    <button id="chatToggleBtn" class="chat-toggle" onclick="toggleChat()">Chats</button>
    <div class="chat-list">${conversations.map(c => `
        <div class="cc-item${c.key === activeKey ? ' active' : ''}" data-uid="${c.user.id}" onclick="switchChat('${myId}','${c.user.id}')">
          <div class="c-av">${c.user.avatar}</div>
          <div style="min-width:0;">
            <div class="cc-name">${c.user.name}</div>
            <div class="cc-prev">${c.last?.file_url ? 'Video Attachment' : (c.last?.text?.includes('[NEGOTIATION') ? 'New Offer' : (c.last?.text || 'No messages yet'))}</div>
          </div>
        </div>`).join('') || `<div style="padding:14px;font-size:.78rem;color:var(--text-3);">You must accept a project first</div>`}
    </div>
    <div class="chat-area">${activeConvo ? `
        <div class="ch-header">
          <button class="chat-back" onclick="chatBack()" aria-label="Back">‹</button>
          <div class="c-av" style="width:28px;height:28px;font-size:.7rem;">${activeConvo.user.avatar}</div>
          <div class="online-dot" id="chat-online-dot"></div>
          <span>${activeConvo.user.name}</span>
          <span id="chat-status-text" style="font-size:.7rem;margin-left:4px;color:var(--text-3);">Connecting…</span>
        </div>
        <div class="chat-msgs" id="chat-msgs-el">${renderMsgs(activeConvo.msgs, myId)}</div>
        <div class="chat-inp-bar">
          <label for="chat-upload-${activeConvo.user.id}" style="cursor:pointer; display:flex; align-items:center; margin-right:4px; color:var(--text-3); transition:color .2s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-3)'">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </label>
          <input type="file" id="chat-upload-${activeConvo.user.id}" accept="video/*" style="display:none;" onchange="handleChatUpload(this, '${myId}', '${activeConvo.user.id}')"/>
          <input class="chat-inp" id="chat-inp-el" placeholder="Type a message…"
            onkeydown="if(event.key==='Enter')sendMsg('${myId}','${activeConvo.user.id}')"/>
          <button class="btn btn-primary btn-sm" onclick="sendMsg('${myId}','${activeConvo.user.id}')">Send</button>
        </div>`
      : '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:.85rem;">No active conversations</div>'}
    </div>
  </div>`;
}
function renderMsgs(msgs, myId) {
  if (!msgs || !msgs.length)
    return '<div style="text-align:center;">Start the conversation!</div>';

  const isCreator = CU.role === 'creator';

  return msgs.map((m, idx) => {
    const isMine    = String(m.from).toLowerCase() === String(myId).toLowerCase();
    const timeAlign = isMine ? 'text-align:right' : '';
    const flexAlign = isMine ? 'flex-end' : 'flex-start';

    if (m.file_url) {
      const fname = m.text.replace('Raw Video: ', '').replace('Video: ', '').replace('Final Delivery: ', '').replace('Final Delivery', '') || 'video';

      let downloadBtn = '';
      let actionBtns = '';
      let restrictDownloadAttr = '';

      if (!isMine && isCreator) {
        let proj = DB.projects().find(p => p.creatorId === myId && p.freelancerId === m.from && p.paid) || DB.projects().find(p => p.creatorId === myId && p.freelancerId === m.from && p.status !== 'completed');
        if (!proj) proj = DB.projects().find(p => p.creatorId === myId && p.freelancerId === m.from);

        const isPaid = proj ? proj.paid : false;
        const isFinal = m.text && m.text.includes('Final Delivery');

        if (!isPaid) {
          restrictDownloadAttr = 'controlsList="nodownload" oncontextmenu="return false;"';
          downloadBtn = `<button class="btn btn-ghost btn-xs" style="margin-top:6px; font-size:0.65rem;" onclick="showToast('❌ You must Approve & Pay to download.', 'err')">⬇ Download Locked</button>`;

          if (isFinal) {
            // ONLY Approve & Pay for Final Delivery (No Revision option)
            actionBtns += `<button class="btn btn-green-btn btn-xs" style="margin-top:6px; font-size:0.65rem; margin-right:6px;" onclick="triggerApproveAndPay('${proj?.id}')">✅ Approve & Pay</button>`;
          } else {
            const hasRequestedRevision = msgs.slice(idx + 1).some(msg =>
              String(msg.from).toLowerCase() === String(myId).toLowerCase() &&
              msg.text.includes('Needs Revision')
            );

            if (hasRequestedRevision) {
              actionBtns += `<span style="margin-top:6px; font-size:0.7rem; color:var(--yellow); display:inline-flex; align-items:center; padding:2px 4px;">🔄 Revision Requested</span>`;
            } else {
              actionBtns += `<button class="btn btn-danger btn-xs" style="margin-top:6px; font-size:0.65rem; border:1px solid var(--red); color:var(--red); background:transparent;" onclick="requestRevision('${m.from}')">🔄 Request Revision</button>`;
            }
          }
        } else {
          downloadBtn = `<a href="${m.file_url}" target="_blank" download class="btn btn-ghost btn-xs" style="margin-top:6px; display:inline-block; font-size:0.65rem;">⬇ Download File</a>`;
        }
      } else {
        downloadBtn = `<a href="${m.file_url}" target="_blank" download class="btn btn-ghost btn-xs" style="margin-top:6px; display:inline-block; font-size:0.65rem;">⬇ Download File</a>`;
      }

      return `
      <div style="display:flex; flex-direction:column; align-items:${flexAlign}; margin-bottom:8px; width:100%;">
        <div class="msg-video ${isMine ? 'sent-video' : ''}">
          <div class="msg-video-inner">
            <div class="msg-video-label">
              <div class="vico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>
              </div>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${fname}</span>
            </div>
            <video class="msg-video-player" controls preload="metadata" src="${m.file_url}" ${restrictDownloadAttr}>
              Your browser does not support the video tag.
            </video>
            <div class="msg-video-footer">
              <span>${isMine ? 'You' : 'Sent'}</span>
              <span>${fmtTime(m.time)}</span>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${downloadBtn}
            ${actionBtns}
          </div>
        </div>
      </div>`;
    }

    if (m.text.startsWith('[NEGOTIATION_REQ]')) {
      const parts = m.text.split('|');
      const projId = parts[1];
      const newPrice = parts[2];
      const newDate = parts[3];
      const note = parts[4] || '';

      let buttonsHtml = '';
      if (!isMine && isCreator) {
        const hasResponded = msgs.slice(idx + 1).some(msg => String(msg.from).toLowerCase() === String(myId).toLowerCase() && (msg.text.includes('✅ Offer Accepted') || msg.text.includes('❌ Offer Rejected')));

        if (hasResponded) {
          buttonsHtml = `<div style="margin-top:10px; font-size:0.8rem; font-weight:600; color:var(--text-3);">Offer Responded</div>`;
        } else {
          buttonsHtml = `
            <div style="display:flex; gap:6px; margin-top:10px;">
              <button class="btn btn-green-btn btn-xs" onclick="acceptNegotiation(this, '${attrSafe(projId)}', '${attrSafe(newPrice)}', '${attrSafe(newDate)}', '${attrSafe(m.from)}')">Accept Offer</button>
              <button class="btn btn-danger btn-xs" style="border:1px solid var(--red); color:var(--red);" onclick="rejectNegotiation(this, '${attrSafe(projId)}', '${attrSafe(m.from)}')">Reject</button>
            </div>`;
        }
      }

      return `
      <div style="display:flex; flex-direction:column; align-items:${flexAlign}; margin-bottom:8px; width:100%;">
        <div class="msg ${isMine ? 'sent' : 'received'}" style="border:2px solid var(--accent); background: ${isMine ? 'var(--accent)' : 'var(--accent-soft)'};">
          <strong style="display:block; margin-bottom:4px;">Negotiation Offer</strong>
          <div>New Price: <strong>₹${fmt(newPrice)}</strong></div>
          <div>New Deadline: <strong>${fmtDate(newDate)}</strong></div>
          ${note ? `<div style="margin-top:6px; font-style:italic;">"${escapeHtml(note)}"</div>` : ''}
          ${buttonsHtml}
        </div>
        <div class="msg-time" style="${timeAlign}; width:100%; margin-top:2px;">${fmtTime(m.time)}</div>
      </div>`;
    }

    return `
      <div style="display:flex; flex-direction:column; align-items:${flexAlign}; margin-bottom:8px; width:100%;">
        <div class="msg ${isMine ? 'sent' : 'received'}">${escapeHtml(m.text)}</div>
        <div class="msg-time" style="${timeAlign}; width:100%; margin-top:2px;">${fmtTime(m.time)}</div>
      </div>`;
  }).join('');
}

async function handleChatUpload(input, myId, otherId) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const MAX_SIZE = 10 * 1024 * 1024 * 1024; // 10GB limit
  if (file.size > MAX_SIZE) { showToast('File too large. Maximum size is 10 GB.', 'err'); return; }

  showToast('Uploading video attachment...', 'info');

  let fileUrl = null;
  try {
    if (supaClient) {
      const s3Key = await s3Upload(file, 'chat');
      fileUrl = s3Key;   // ← S3 key, sendMsg handle karega
    }

    await sendMsg(myId, otherId, fileUrl, file.name);

    if (CU.role === 'freelancer') {
      const p = DB.projects().find(x => x.freelancerId === myId && x.creatorId === otherId && x.status === 'ongoing');
      if (p && !p.editedUploaded) {
        p.editedUploaded = true; DB.saveProjects(DB.projects());
        if (supaClient) supaClient.from('projects').update({ edited_uploaded: true }).eq('id', p.id);
      }
    }

    showToast('Video sent successfully!', 'ok');
  } catch (e) {
    console.error('[Chat] upload failed:', e);
    showToast('Upload failed: ' + (e && e.message ? e.message : e), 'err');
  }
  input.value = '';
}

/* ── REVISION & APPROVE ACTIONS ── */
function requestRevision(freelancerId) {
  sendMsg(CU.id, freelancerId, null, null, '🔄 Needs Revision: Please check the video again and make the necessary changes.');
  showToast('Revision requested!', 'info', '');
}

function triggerApproveAndPay(projectId) {
  if (!projectId || projectId === 'undefined') {
    showToast('Project not found.', 'err', '');
    return;
  }
  showModal('Proceed to Payment', 'Are you sure you want to approve this video and proceed to the payment screen?', async () => {
    const projs = DB.projects();
    const p = projs.find(x => x.id === projectId);
    if (p) { p.editedUploaded = true; DB.saveProjects(projs); }

    // ✅ DB mein bhi update karo taaki sync ke baad bhi rahe
    if (supaClient) {
      await supaClient.from('projects').update({ edited_uploaded: true }).eq('id', projectId);
    }

    activeManageProjectId = projectId;
    wfStep = 7;
    cPage('new', document.querySelector('[data-page="new"]'));
  });
  document.getElementById('modal-confirm').textContent = 'Proceed';
}
async function getOrCreateConversation(userId1, userId2) {
  if (!supaClient) return null;
  const [uid1, uid2] = [userId1, userId2].sort();

  const { data: existing } = await supaClient
    .from('conversations')
    .select('id')
    .eq('user1_id', uid1)
    .eq('user2_id', uid2)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supaClient
    .from('conversations')
    .insert({ user1_id: uid1, user2_id: uid2 })
    .select('id')
    .single();

  if (error) {
    console.error('[Chat] Failed to create conversation:', error);
    return null;
  }
  return created.id;
}

let _subLock = false;
let _pendingSub = null;

async function subscribeToConversation(conversationId, otherUserId) {
  if (!supaClient || !conversationId) return;
  if (currentConversationId === conversationId && currentChatChannel) return;

  _pendingSub = { conversationId, otherUserId };
  if (_subLock) return;

  _subLock = true;
  try {
    while (_pendingSub) {
      const { conversationId: cid, otherUserId: oid } = _pendingSub;
      _pendingSub = null;

      if (currentConversationId === cid && currentChatChannel) continue;

      // Tear down old channel
      if (currentChatChannel) {
        const old = currentChatChannel;
        currentChatChannel = null;
        currentConversationId = null;
        try { await supaClient.removeChannel(old); } catch (e) {}
      }

      currentConversationId = cid;

      // Build new channel and WAIT for SUBSCRIBED
      await new Promise((resolve) => {
        const channelName = `chat_${cid}_${CU.id}`;
        const ch = supaClient
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=eq.${cid}`
            },
            async (payload) => {
              await handleIncomingRealtimeMessage(payload, oid);
            }
          )
          .subscribe((status) => {
            console.log(`[Chat] ${channelName} → ${status}`);
            if (status === 'SUBSCRIBED') {
              currentChatChannel = ch;
              resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              currentChatChannel = ch;
              resolve();
            }
          });

        // Safety timeout — never hang forever
        setTimeout(resolve, 6000);
      });
    }
  } finally {
    _subLock = false;
  }
}

async function handleIncomingRealtimeMessage(payload, otherUserId) {
  const newMsg = payload.new;
  if (!newMsg?.id) return;
  if (newMsg.sender_id === CU.id) return;

  const key = [CU.id, otherUserId].sort().join('_');
  const allMsgs = DB.messages();
  if (!allMsgs[key]) allMsgs[key] = [];

  // If already stored — just re-render (don't skip silently)
  const alreadyStored = allMsgs[key].find(m => m.id === newMsg.id);
  if (alreadyStored) {
    if (currentChatUserId === otherUserId) {
      const el = document.getElementById('chat-msgs-el');
      if (el) {
        el.innerHTML = renderMsgs(allMsgs[key], CU.id);
        scrollChatToBottom();
      }
    }
    return;
  }

  renderedMessageIds.add(newMsg.id);

  // Resolve S3 file URL if needed
  let fileUrl = newMsg.file_url || null;
  if (isS3Key(fileUrl)) {
    try { fileUrl = await s3GetUrl(fileUrl); } catch (e) { console.error('[S3] sign failed (CORS/network?):', e); fileUrl = null; }
  }

  // Save to local store
  allMsgs[key].push({
    id:       newMsg.id,
    from:     newMsg.sender_id,
    text:     newMsg.text,
    file_url: fileUrl,
    time:     new Date(newMsg.created_at).getTime()
  });
  DB.saveMessages(allMsgs);

  // Update UI
  if (currentChatUserId === otherUserId) {
    const el = document.getElementById('chat-msgs-el');
    if (el) {
      el.innerHTML = renderMsgs(allMsgs[key], CU.id);
      scrollChatToBottom();
    }
  } else {
    // User is in a different chat — show toast
    const sender = DB.users().find(u => u.id === newMsg.sender_id);
    if (newMsg.sender_id !== CU.id) {
      showToast(`New message from ${sender?.name || 'someone'}`, 'info', '💬');
    }
  }

  updateChatSidebarPreviews();
}

let _chatPollInterval = null;

function startChatPolling() {
  stopChatPolling(); // Clear any existing poll first

  _chatPollInterval = setInterval(async () => {
    if (!CU || !currentChatUserId || !supaClient) return;

    try {
      const convId = await getOrCreateConversation(CU.id, currentChatUserId);
      if (!convId) return;

      const key = [CU.id, currentChatUserId].sort().join('_');
      const allMsgs = DB.messages();
      const msgs = allMsgs[key] || [];

      // Only fetch messages newer than what we already have
      const lastTime = msgs.length
        ? new Date(msgs[msgs.length - 1].time).toISOString()
        : new Date(0).toISOString();

      const { data: fresh } = await supaClient
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .gt('created_at', lastTime)
        .order('created_at', { ascending: true });

      if (!fresh || fresh.length === 0) return;

      let updated = false;
      for (const m of fresh) {
        if (msgs.find(x => x.id === m.id)) continue; // skip duplicates

        let fileUrl = m.file_url || null;
        if (isS3Key(fileUrl)) {
          try { fileUrl = await s3GetUrl(fileUrl); } catch (e) { console.error('[S3] sign failed (CORS/network?):', e); fileUrl = null; }
        }

        msgs.push({
          id:       m.id,
          from:     m.sender_id,
          text:     m.text,
          file_url: fileUrl,
          time:     new Date(m.created_at).getTime()
        });
        renderedMessageIds.add(m.id);
        updated = true;
      }

      if (updated) {
        allMsgs[key] = msgs;
        DB.saveMessages(allMsgs);
        const el = document.getElementById('chat-msgs-el');
        if (el) {
          el.innerHTML = renderMsgs(msgs, CU.id);
          scrollChatToBottom();
        }
        updateChatSidebarPreviews();
      }

    } catch (e) { /* silent — polling is best-effort */ }

  }, 4000); // polls every 4 seconds
}

function stopChatPolling() {
  if (_chatPollInterval) {
    clearInterval(_chatPollInterval);
    _chatPollInterval = null;
  }
}

async function sendMsg(myId, otherId, overrideFileUrl = null, overrideFileName = null, overrideText = null) {
  // ── Resolve message text ──
  let text = '';
  const inp = document.getElementById('chat-inp-el');

  if (overrideText) {
    text = overrideText;
  } else if (overrideFileUrl) {
    text = 'Video: ' + (overrideFileName || 'attachment');
  } else {
    if (!inp || !inp.value.trim()) return;
    text = inp.value.trim();
    inp.value = '';
  }

  // ── Resolve S3 key → signed URL for local display only ──
  let displayFileUrl = overrideFileUrl;
  if (isS3Key(overrideFileUrl)) {
    try { displayFileUrl = await s3GetUrl(overrideFileUrl); }
    catch (e) { displayFileUrl = null; }
  }

  // ── 1. Optimistic update (with temp ID) ──
  const tempId = 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const key = [myId, otherId].sort().join('_');
  const allMsgs = DB.messages();
  if (!allMsgs[key]) allMsgs[key] = [];

  allMsgs[key].push({
    id:       tempId,
    from:     myId,
    text,
    file_url: displayFileUrl,
    time:     Date.now()
  });
  renderedMessageIds.add(tempId);
  DB.saveMessages(allMsgs);

  const el = document.getElementById('chat-msgs-el');
  if (el) {
    el.innerHTML = renderMsgs(allMsgs[key], myId);
    scrollChatToBottom();
  }
  updateChatSidebarPreviews();

  if (!supaClient) return;

  try {
    const conversationId = await getOrCreateConversation(myId, otherId);
    if (!conversationId) throw new Error('Could not resolve conversation ID');

    const { data: inserted, error } = await supaClient
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id:       myId,
        receiver_id:     otherId,
        text,
        file_url:        overrideFileUrl
      })
      .select('id')
      .single();

    if (error) throw error;

    // ✅ KEY FIX: Replace tempId with real DB id
    // This prevents realtime AND polling from adding it again
    if (inserted?.id) {
      const msgs = DB.messages();
      const arr  = msgs[key] || [];
      const tempMsg = arr.find(m => m.id === tempId);
      if (tempMsg) {
        tempMsg.id = inserted.id;  // swap temp id → real id
        DB.saveMessages(msgs);
      }
      renderedMessageIds.add(inserted.id);
    }

    if (currentConversationId !== conversationId) {
      await subscribeToConversation(conversationId, otherId);
    }

  } catch (e) {
    console.error('[Chat] sendMsg failed:', e);
    showToast('Message failed to send.', 'err');
  }
}

async function switchChat(myId, otherId) {
  document.querySelector('.chat-list')?.classList.remove('open');
  const btn = document.getElementById('chatToggleBtn');
  if (btn) btn.innerText = 'Chats';

  currentChatUserId = otherId;

  const key   = [myId, otherId].sort().join('_');
  const msgs  = DB.messages()[key] || [];
  const other = DB.users().find(u => u.id === otherId) || { id: otherId, name: 'User', avatar: 'U' };

  // Highlight active chat in sidebar
  document.querySelectorAll('.cc-item').forEach(el => el.classList.remove('active'));
  const sidebarItem = document.querySelector(`.cc-item[data-uid="${otherId}"]`);
  if (sidebarItem) sidebarItem.classList.add('active');

  // Render chat area
  const area = document.querySelector('.chat-area');
  if (area) {
    area.innerHTML = `
      <div class="ch-header">
        <button class="chat-back" onclick="chatBack()" aria-label="Back">‹</button>
        <div class="c-av" style="width:28px;height:28px;font-size:.7rem;">${other.avatar}</div>
        <div class="online-dot" id="chat-online-dot" style="background:var(--text-3);"></div>
        <span>${other.name}</span>
        <span id="chat-status-text" style="font-size:.7rem;margin-left:4px;color:var(--text-3);">–</span>
      </div>
      <div class="chat-msgs" id="chat-msgs-el">${renderMsgs(msgs, myId)}</div>
      <div class="chat-inp-bar">
        <label for="chat-upload-${otherId}"
          style="cursor:pointer;display:flex;align-items:center;margin-right:4px;color:var(--text-3);transition:color .2s;"
          onmouseover="this.style.color='var(--accent)'"
          onmouseout="this.style.color='var(--text-3)'">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </label>
        <input type="file" id="chat-upload-${otherId}" accept="video/*" style="display:none;"
          onchange="handleChatUpload(this,'${myId}','${otherId}')"/>
        <input class="chat-inp" id="chat-inp-el" placeholder="Type a message…"
          onkeydown="if(event.key==='Enter') sendMsg('${myId}','${otherId}')"/>
        <button class="btn btn-primary btn-sm"
          onclick="sendMsg('${myId}','${otherId}')">Send</button>
      </div>`;

    document.querySelector('.chat-wrap')?.classList.add('show-chat');
    const msgEl = document.getElementById('chat-msgs-el');
    if (msgEl) scrollChatToBottom();
  }

  updateChatHeaderPresence();

  // Subscribe to realtime
  if (supaClient) {
    const conversationId = await getOrCreateConversation(myId, otherId);
    if (conversationId) await subscribeToConversation(conversationId, otherId);
  }

  // Start polling as backup (in case realtime drops)
  startChatPolling();
}