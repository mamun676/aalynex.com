// Text-message outbox only. Attachment path below remains the legacy flow.
// Session-memory only: reload/logout clears retry state; no hidden localStorage queue.
const axChatOutbox=new Map();
const axChatUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function axChatOwner(id) {
 const epoch=window._accountSessionEpoch||0;
 if(!CU||CU.id!==id)throw Error('Account changed');
 return {id,epoch,owns:()=>!!CU&&CU.id===id&&(window._accountSessionEpoch||0)===epoch};
}
function axChatPrune() {
 for(const [id,e]of axChatOutbox)if(!e.owner.owns()){
  e.cancelled=true;e.controller?.abort();axChatOutbox.delete(id);
 }
}
function axChatSameRow(e,r) {
 return !!r&&r.id===e.id&&r.sender_id===e.myId&&r.receiver_id===e.otherId&&r.conversation_id===e.conversationId&&r.text===e.text&&!r.file_url;
}
function axChatObserveRow(row) {
 axChatPrune();const e=axChatOutbox.get(row?.id);
 if(!e||!e.owner.owns()||!axChatSameRow(e,row))return false;
 e.status='sent';e.time=Date.parse(row.created_at)||e.time;e.serverRow=row;
 return true;
}
function axChatMergeMessages(messages,myId) {
 axChatPrune();const list=Array.isArray(messages)?messages.slice():[];
 for(const e of axChatOutbox.values()){
  if(e.myId!==myId||e.otherId!==currentChatUserId||!e.owner.owns())continue;
  const index=list.findIndex(m=>m.id===e.id);
  const local={id:e.id,from:e.myId,text:e.text,file_url:null,time:e.time,_deliveryStatus:e.status};
  if(index<0)list.push(local);else list[index]={...list[index],_deliveryStatus:e.status};
 }
 return list.sort((a,b)=>a.time-b.time||String(a.id).localeCompare(String(b.id)));
}
function axChatPaint(e) {
 if(!e.owner.owns()||currentChatUserId!==e.otherId)return;
 const el=document.getElementById('chat-msgs-el');
 if(el){el.innerHTML=renderMsgs(DB.messages()[e.key]||[],e.myId);scrollChatToBottom();}
}
function axChatPendingHTML(m,isMine) {
 if(!isMine||!['sending','failed','sent','blocked'].includes(m._deliveryStatus))return '';
 const label={sending:'Sending…',failed:'Not confirmed — retry checks before resending.',sent:'Sent',blocked:'Message ID conflict — contact support.'}[m._deliveryStatus];
 const retry=m._deliveryStatus==='failed'?` <button type="button" class="btn btn-ghost btn-xs" data-chat-retry="${escapeHtml(m.id)}">Retry</button>`:'';
 return `<div class="msg-time" role="status">${escapeHtml(label)}${retry}</div>`;
}
async function axChatWait(e,request) {
 if(!e.owner.owns()||e.cancelled)throw Error('Account changed');
 const controller=new AbortController();e.controller=controller;
 let timer;
 try {
  const query=typeof request.abortSignal==='function'?request.abortSignal(controller.signal):request;
  const result=await Promise.race([Promise.resolve(query),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Request not confirmed'));},20000);})]);
  if(!e.owner.owns()||e.cancelled)throw Error('Account changed');return result;
 }finally{clearTimeout(timer);if(e.controller===controller)e.controller=null;}
}
async function axChatSession(e) {
 // Check current browser session before each possible database write.
 const {data,error}=await axChatWait(e,supaClient.auth.getSession());
 if(error||data?.session?.user?.id!==e.myId)throw Error('Sign in required');
}
async function axChatConversation(e) {
 const [a,b]=[e.myId,e.otherId].sort();
 const find=()=>supaClient.from('conversations').select('id').eq('user1_id',a).eq('user2_id',b).maybeSingle();
 let result=await axChatWait(e,find());
 if(result.error)throw result.error;
 if(result.data)return result.data.id;
 await axChatSession(e);
 result=await axChatWait(e,supaClient.from('conversations').insert({user1_id:a,user2_id:b}).select('id').single());
 if(result.error?.code==='23505')result=await axChatWait(e,find());
 if(result.error||!result.data?.id)throw Error('Conversation not confirmed');return result.data.id;
}
async function axChatLookup(e) {
 const result=await axChatWait(e,supaClient.from('messages').select('*').eq('id',e.id).maybeSingle());
 if(result.error)throw result.error;
 if(result.data&&!axChatSameRow(e,result.data)){e.status='blocked';throw Error('Message ID conflict');}
 return result.data;
}
function axChatConfirm(e,row) {
 if(!e.owner.owns()||!axChatSameRow(e,row))throw Error('Confirmation mismatch');
 e.status='sent';e.serverRow=row;e.time=Date.parse(row.created_at)||e.time;
 // Save only server-confirmed rows. Keep recent session receipts in memory so
 // a sync snapshot taken before this insert cannot erase a just-sent bubble.
 const all=DB.messages(),arr=all[e.key]||[];
 const message={id:e.id,from:e.myId,text:e.text,file_url:null,time:e.time};
 const old=arr.findIndex(m=>m.id===e.id);if(old<0)arr.push(message);else arr[old]=message;
 all[e.key]=arr;DB.saveMessages(all);renderedMessageIds.add(e.id);axChatPaint(e);
}
async function axChatAttempt(e) {
 if(!e.owner.owns()||e.inFlight||e.status==='sent'||e.status==='blocked')return {ok:e.status==='sent',id:e.id};
 e.inFlight=true;e.status='sending';axChatPaint(e);
 try {
  if(!supaClient)throw Error('No connection');
  await axChatSession(e);
  if(!e.conversationId)e.conversationId=await axChatConversation(e);
  let row=await axChatLookup(e);
  if(!row){
   await axChatSession(e);
   const result=await axChatWait(e,supaClient.from('messages').insert({id:e.id,conversation_id:e.conversationId,sender_id:e.myId,receiver_id:e.otherId,text:e.text,file_url:null}).select('*').single());
   if(result.error){
    if(result.error.code!=='23505')throw result.error;
    row=await axChatLookup(e);
   }else row=result.data;
  }
  if(!row)throw Error('No server confirmation');
  axChatConfirm(e,row);return {ok:true,id:e.id};
 }catch(_){
  if(!e.owner.owns()){e.cancelled=true;axChatOutbox.delete(e.id);return {ok:false,cancelled:true};}
  // Realtime/polling may have confirmed the insert while its HTTP ACK failed.
  if(e.status==='sent'&&e.serverRow)return {ok:true,id:e.id};
  if(e.status!=='blocked')e.status='failed';axChatPaint(e);
  if(currentChatUserId===e.otherId)showToast(e.status==='blocked'?'Message ID conflict. Contact support.':'Message not confirmed. Use Retry on that message; do not retype it.', 'err');
  return {ok:false,id:e.id};
 }finally{e.inFlight=false;}
}
async function retryChatMessage(id) {
 axChatPrune();if(!axChatUUID.test(id))return;
 const e=axChatOutbox.get(id);
 if(!e||!e.owner.owns()||e.status!=='failed')return;
 return axChatAttempt(e);
}
async function sendMsg(myId,otherId,overrideFileUrl=null,overrideFileName=null,overrideText=null) {
 // Preserve old attachment behavior: this focused patch does not claim to fix
 // delivery/payment/storage authorization or attachment acknowledgement paths.
 if(overrideFileUrl)return axLegacyAttachmentSendMsg(myId,otherId,overrideFileUrl,overrideFileName,overrideText);
 axChatPrune();let owner;
 try{owner=axChatOwner(myId);}catch{return {ok:false,cancelled:true};}
 if(typeof otherId!=='string'||!axChatUUID.test(otherId)||myId===otherId)return {ok:false};
 const inp=document.getElementById('chat-inp-el');
 const programmatic=typeof overrideText==='string'&&overrideText.length>0;
 if(!programmatic&&currentChatUserId!==otherId)return {ok:false};
 const text=programmatic?overrideText:String(inp?.value||'').trim();
 if(!text)return;
 // Avoid unbounded retry state in long-running sessions; never silently drop
 // unconfirmed messages. Confirmed receipts can be evicted after 200 entries.
 if(axChatOutbox.size>=200){for(const [id,e]of axChatOutbox)if(e.status==='sent'){axChatOutbox.delete(id);break;}}
 if(axChatOutbox.size>=200){showToast('Too many unconfirmed messages. Retry existing messages first.','err');return {ok:false};}
 const id=crypto.randomUUID();
 const e={id,myId,otherId,text,owner,key:[myId,otherId].sort().join('_'),time:Date.now(),status:'sending',conversationId:null,inFlight:false};
 axChatOutbox.set(id,e);if(!programmatic&&inp)inp.value='';
 return axChatAttempt(e);
}
// Dedicated UUID-only action; no dynamic function-name evaluation / onclick text.
document.addEventListener('click',event=>{
 const button=event.target?.closest?.('[data-chat-retry]');if(!button)return;
 const id=button.getAttribute('data-chat-retry');if(!axChatUUID.test(id||''))return;
 event.preventDefault();void retryChatMessage(id);
});

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
        <div class="cc-item${escapeHtml(c.key === activeKey ? ' active' : '')}" data-uid="${escapeHtml(c.user.id)}" data-app-click="${appEvent("switchChat", [String(myId ?? ''), String(c.user.id ?? '')])}">
          <div class="c-av">${escapeHtml(c.user.avatar)}</div>
          <div style="min-width:0;">
            <div class="cc-name">${escapeHtml(c.user.name)}</div>
            <div class="cc-prev">${escapeHtml(c.last?.file_url ? 'Video Attachment' : (c.last?.text?.includes('[NEGOTIATION') ? 'New Offer' : (c.last?.text || 'No messages yet')))}</div>
          </div>
        </div>`).join('') || `<div style="padding:14px;font-size:.78rem;color:var(--text-3);">You must accept a project first</div>`}
    </div>
    <div class="chat-area">${activeConvo ? `
        <div class="ch-header">
          <button class="chat-back" onclick="chatBack()" aria-label="Back">‹</button>
          <div class="c-av" style="width:28px;height:28px;font-size:.7rem;">${escapeHtml(activeConvo.user.avatar)}</div>
          <div class="online-dot" id="chat-online-dot"></div>
          <span>${escapeHtml(activeConvo.user.name)}</span>
          <span id="chat-status-text" style="font-size:.7rem;margin-left:4px;color:var(--text-3);">Connecting…</span>
        </div>
        <div class="chat-msgs" id="chat-msgs-el">${renderMsgs(activeConvo.msgs, myId)}</div>
        <div class="chat-inp-bar">
          <label for="chat-upload-${escapeHtml(activeConvo.user.id)}" style="cursor:pointer; display:flex; align-items:center; margin-right:4px; color:var(--text-3); transition:color .2s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-3)'">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </label>
          <input type="file" id="chat-upload-${escapeHtml(activeConvo.user.id)}" accept="video/*" style="display:none;" data-app-change="${appEvent("handleChatUpload", [{ appRef: "element" }, String(myId ?? ''), String(activeConvo.user.id ?? '')])}"/>
          <input class="chat-inp" id="chat-inp-el" placeholder="Type a message…"
            data-app-keydown="${appEvent("sendMsg", [String(myId ?? ''), String(activeConvo.user.id ?? '')], { key: 'Enter' })}"/>
          <button class="btn btn-primary btn-sm" data-app-click="${appEvent("sendMsg", [String(myId ?? ''), String(activeConvo.user.id ?? '')])}">Send</button>
        </div>`
      : '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:.85rem;">No active conversations</div>'}
    </div>
  </div>`;
}
function renderMsgs(msgs, myId) {
  msgs = axChatMergeMessages(msgs, myId);
  if (!msgs || !msgs.length)
    return '<div style="text-align:center;">Start the conversation!</div>';

  const isCreator = CU.role === 'creator';

  return msgs.map((m, idx) => {
    const isMine    = String(m.from).toLowerCase() === String(myId).toLowerCase();
    const timeAlign = isMine ? 'text-align:right' : '';
    const flexAlign = isMine ? 'flex-end' : 'flex-start';

    if(isMine && ['sending','failed','blocked'].includes(m._deliveryStatus)) {
      return `<div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:8px"><div class="msg sent">${escapeHtml(m.text)}</div>${axChatPendingHTML(m,true)}</div>`;
    }
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
            actionBtns += `<button class="btn btn-green-btn btn-xs" style="margin-top:6px; font-size:0.65rem; margin-right:6px;" data-app-click="${appEvent("triggerApproveAndPay", [String(proj?.id ?? '')])}">✅ Approve & Pay</button>`;
          } else {
            const hasRequestedRevision = msgs.slice(idx + 1).some(msg =>
              String(msg.from).toLowerCase() === String(myId).toLowerCase() &&
              msg.text.includes('Needs Revision')
            );

            if (hasRequestedRevision) {
              actionBtns += `<span style="margin-top:6px; font-size:0.7rem; color:var(--yellow); display:inline-flex; align-items:center; padding:2px 4px;">🔄 Revision Requested</span>`;
            } else {
              actionBtns += `<button class="btn btn-danger btn-xs" style="margin-top:6px; font-size:0.65rem; border:1px solid var(--red); color:var(--red); background:transparent;" data-app-click="${appEvent("requestRevision", [String(m.from ?? '')])}">🔄 Request Revision</button>`;
            }
          }
        } else {
          downloadBtn = `<a href="${safeUrl(m.file_url)}" target="_blank" rel="noopener noreferrer" download class="btn btn-ghost btn-xs" style="margin-top:6px; display:inline-block; font-size:0.65rem;">⬇ Download File</a>`;
        }
      } else {
        downloadBtn = `<a href="${safeUrl(m.file_url)}" target="_blank" rel="noopener noreferrer" download class="btn btn-ghost btn-xs" style="margin-top:6px; display:inline-block; font-size:0.65rem;">⬇ Download File</a>`;
      }

      return `
      <div style="display:flex; flex-direction:column; align-items:${escapeHtml(flexAlign)}; margin-bottom:8px; width:100%;">
        <div class="msg-video ${escapeHtml(isMine ? 'sent-video' : '')}">
          <div class="msg-video-inner">
            <div class="msg-video-label">
              <div class="vico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>
              </div>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${escapeHtml(fname)}</span>
            </div>
            <video class="msg-video-player" controls preload="metadata" src="${safeMediaUrl(m.file_url)}" ${restrictDownloadAttr}>
              Your browser does not support the video tag.
            </video>
            <div class="msg-video-footer">
              <span>${escapeHtml(isMine ? 'You' : 'Sent')}</span>
              <span>${escapeHtml(fmtTime(m.time))}</span>
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
              <button class="btn btn-green-btn btn-xs" data-app-click="${appEvent("acceptNegotiation", [{ appRef: "element" }, String(attrSafe(projId) ?? ''), String(attrSafe(newPrice) ?? ''), String(attrSafe(newDate) ?? ''), String(attrSafe(m.from) ?? '')])}">Accept Offer</button>
              <button class="btn btn-danger btn-xs" style="border:1px solid var(--red); color:var(--red);" data-app-click="${appEvent("rejectNegotiation", [{ appRef: "element" }, String(attrSafe(projId) ?? ''), String(attrSafe(m.from) ?? '')])}">Reject</button>
            </div>`;
        }
      }

      return `
      <div style="display:flex; flex-direction:column; align-items:${escapeHtml(flexAlign)}; margin-bottom:8px; width:100%;">
        <div class="msg ${escapeHtml(isMine ? 'sent' : 'received')}" style="border:2px solid var(--accent); background: ${escapeHtml(isMine ? 'var(--accent)' : 'var(--accent-soft)')};">
          <strong style="display:block; margin-bottom:4px;">Negotiation Offer</strong>
          <div>New Price: <strong>₹${escapeHtml(fmt(newPrice))}</strong></div>
          <div>New Deadline: <strong>${escapeHtml(fmtDate(newDate))}</strong></div>
          ${note ? `<div style="margin-top:6px; font-style:italic;">"${escapeHtml(note)}"</div>` : ''}
          ${buttonsHtml}
        </div>
        <div class="msg-time" style="${escapeHtml(timeAlign)}; width:100%; margin-top:2px;">${escapeHtml(fmtTime(m.time))}</div>${axChatPendingHTML(m,isMine)}
      </div>`;
    }

    return `
      <div style="display:flex; flex-direction:column; align-items:${escapeHtml(flexAlign)}; margin-bottom:8px; width:100%;">
        <div class="msg ${escapeHtml(isMine ? 'sent' : 'received')}">${escapeHtml(m.text)}</div>
        <div class="msg-time" style="${escapeHtml(timeAlign)}; width:100%; margin-top:2px;">${escapeHtml(fmtTime(m.time))}</div>${axChatPendingHTML(m,isMine)}
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
  if (newMsg.sender_id === CU.id) {
    if(axChatObserveRow(newMsg)){const e=axChatOutbox.get(newMsg.id);axChatConfirm(e,newMsg);}
    return;
  }

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
        axChatObserveRow(m);
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

async function axLegacyAttachmentSendMsg(myId, otherId, overrideFileUrl = null, overrideFileName = null, overrideText = null) {
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
        <div class="c-av" style="width:28px;height:28px;font-size:.7rem;">${escapeHtml(other.avatar)}</div>
        <div class="online-dot" id="chat-online-dot" style="background:var(--text-3);"></div>
        <span>${escapeHtml(other.name)}</span>
        <span id="chat-status-text" style="font-size:.7rem;margin-left:4px;color:var(--text-3);">–</span>
      </div>
      <div class="chat-msgs" id="chat-msgs-el">${renderMsgs(msgs, myId)}</div>
      <div class="chat-inp-bar">
        <label for="chat-upload-${escapeHtml(otherId)}"
          style="cursor:pointer;display:flex;align-items:center;margin-right:4px;color:var(--text-3);transition:color .2s;"
          onmouseover="this.style.color='var(--accent)'"
          onmouseout="this.style.color='var(--text-3)'">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </label>
        <input type="file" id="chat-upload-${escapeHtml(otherId)}" accept="video/*" style="display:none;"
          data-app-change="${appEvent("handleChatUpload", [{ appRef: "element" }, String(myId ?? ''), String(otherId ?? '')])}"/>
        <input class="chat-inp" id="chat-inp-el" placeholder="Type a message…"
          data-app-keydown="${appEvent("sendMsg", [String(myId ?? ''), String(otherId ?? '')], { key: 'Enter' })}"/>
        <button class="btn btn-primary btn-sm"
          data-app-click="${appEvent("sendMsg", [String(myId ?? ''), String(otherId ?? '')])}">Send</button>
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