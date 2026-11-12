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
// A server-confirmed, per-MESSAGE linkage. No filename, date, or pair-based guesses.
const axLegacyLinks = new Map();
const axLegacyPending = new Set();
async function axGetConfirmedLegacyLink(messageId) {
  const id=String(messageId||'');
  if(axLegacyLinks.has(id))return axLegacyLinks.get(id);
  if(!supaClient||!CU)return null;
  const {data,error}=await supaClient.functions.invoke('project-media-v2',
    {body:{action:'resolve_legacy',messageId:id}});
  const link=!error&&data?.confirmed===true&&String(data.messageId)===id&&
    typeof data.projectId==='string'?{projectId:data.projectId,projectTitle:String(data.projectTitle||'')}:null;
  axLegacyLinks.set(id,link);
  return link;
}
function axQueueLegacyLookup(messageId){
  const id=String(messageId||'');
  if(axLegacyLinks.has(id)||axLegacyPending.has(id)||!supaClient||!CU)return;
  axLegacyPending.add(id);
  void axGetConfirmedLegacyLink(id).catch(()=>{axLegacyLinks.set(id,null);}).finally(()=>{
    axLegacyPending.delete(id);
    const box=document.getElementById('chat-msgs-el');
    if(!box||!currentChatUserId||!CU)return;
    const key=[CU.id,currentChatUserId].sort().join('_');
    box.innerHTML=renderMsgs(DB.messages()[key]||[],CU.id);
  });
}
// Editor uploads ONLY a low-resolution watermarked sample from a locally selected
// video. The existing original remains untouched and is never served for preview.
function axUploadLegacyPreview(messageId){
  // File picker must open synchronously from the user's click (browser user activation).
  if(!CU||CU.role!=='freelancer'||!currentChatUserId||!supaClient){
    showToast('Editor sign-in required.','err','');return;
  }
  const input=document.createElement('input');input.type='file';input.accept='video/*';
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    try{
      if(!file.type.startsWith('video/'))throw Error('Select the original video file for this delivery.');
      const link=await axGetConfirmedLegacyLink(messageId);
      const project=link&&DB.projects().find(p=>String(p.id)===String(link.projectId));
      if(!project||String(project.freelancerId)!==String(CU.id)||String(project.creatorId)!==String(currentChatUserId))
        throw Error('This delivery is not confirmed for your project.');
      if(typeof axMakeSafePreview!=='function'||typeof axUploadScopedPreview!=='function')
        throw Error('Preview generator is unavailable. Open Aalynex in updated desktop Chrome.');
      showToast('Creating a short watermarked preview…','info','');
      const sample=await axMakeSafePreview(file,project.title||project.id);
      const key=await axUploadScopedPreview(sample,project.id);
      const sent=await sendMsg(CU.id,project.creatorId,key,sample.name,'Project Preview: '+String(project.title||project.id));
      if(!sent?.ok)throw Error('Preview uploaded, but chat message was not confirmed. Check before retrying.');
      showToast('Watermarked preview sent. Original stays locked.','ok','');
    }catch(e){showToast('Preview was not sent: '+String(e?.message||e),'err','');}
    finally{input.value='';}
  };
  input.click();
}

async function axMessageSignedUrl(messageId) {
  if (!CU || !currentChatUserId || !supaClient) throw new Error('Sign in and open a conversation.');
  const key = [CU.id, currentChatUserId].sort().join('_');
  const msg = (DB.messages()[key] || []).find(m => String(m.id) === String(messageId));
  if (!msg || !msg.file_url || !isS3Key(msg.file_url)) throw new Error('Secure project attachment unavailable.');
  const scoped = String(msg.file_url).match(/\/projects\/([A-Za-z0-9_-]+)\/(source|chat|preview|final)\//);
  const possible = DB.projects().filter(p => p.status !== 'open' &&
    ((String(p.creatorId) === String(CU.id) && String(p.freelancerId) === String(currentChatUserId)) ||
     (String(p.creatorId) === String(currentChatUserId) && String(p.freelancerId) === String(CU.id))));
  const link = scoped ? null : await axGetConfirmedLegacyLink(messageId);
  const project = scoped ? possible.find(p => String(p.id) === scoped[1]) : link ? possible.find(p => String(p.id) === String(link.projectId)) : (possible.length === 1 ? possible[0] : null);
  if (!project) throw new Error('This older attachment needs exact project verification. Contact support; do not pay twice.');
  const kind = scoped ? scoped[2] :
    (/^Final Delivery/.test(String(msg.text||'')) ||
     (String(msg.from) === String(project.freelancerId) && /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(String(msg.file_url)))) ? 'final' : 'chat';
  const {data,error} = await supaClient.functions.invoke('project-media-v2',
    {body:{action:'download',projectId:project.id,kind,fileKey:msg.file_url,messageId:msg.id}});
  if (error || !data?.downloadUrl) {
    const reason=String(data?.error||'');
    throw new Error(reason==='payment_required'?'Original locked until verified payment.':
      reason==='rating_required'?'Original needs server verification before download.':
      reason==='legacy_file_needs_project_link'?'Older file needs exact project verification.':
      'Secure attachment could not be authorized.');
  }
  const valid = validatedHttpUrl(data.downloadUrl);
  if(!valid)throw new Error('Secure download URL invalid.');
  return valid;
}

async function axOpenMessageMedia(messageId, elementId) {
  try {
    const url = await axMessageSignedUrl(messageId);
    const container = document.getElementById(elementId);
    if (!container) return;
    container.replaceChildren();
    const video = document.createElement('video');
    video.controls = true; video.preload = 'metadata'; video.playsInline = true;
    video.controlsList = 'nodownload'; video.src = url;
    video.style.cssText = 'max-width:100%;max-height:250px;border-radius:12px;';
    container.appendChild(video);
    video.play().catch(()=>{});
  } catch (e) {showToast(e.message || 'Cannot open attachment.','err','');}
}
async function axDownloadMessageFile(messageId) {
  try {
    const url = await axMessageSignedUrl(messageId);
    const a = document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    document.body.appendChild(a);a.click();a.remove();
  } catch (e) {showToast(e.message || 'Cannot download attachment.','err','');}
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
      const fname = String(m.text || '').replace(/^(Raw Video: |Video: |Final Delivery: |Final Delivery)/, '').trim() || 'attachment';
      const scoped = String(m.file_url).match(/\/projects\/([A-Za-z0-9_-]+)\//);
      const possible = DB.projects().filter(p => p.status !== 'open' &&
        ((String(p.creatorId) === String(myId) && String(p.freelancerId) === String(currentChatUserId)) ||
         (String(p.freelancerId) === String(myId) && String(p.creatorId) === String(currentChatUserId))));
      const legacyFinal = !scoped && /^Final Delivery/.test(String(m.text||''));
      if(legacyFinal && !axLegacyLinks.has(String(m.id)) && !axLegacyPending.has(String(m.id)))
        Promise.resolve().then(()=>axQueueLegacyLookup(m.id));
      const confirmedLink = legacyFinal ? axLegacyLinks.get(String(m.id)) : null;
      const proj = scoped ? possible.find(p => String(p.id) === scoped[1]) :
        confirmedLink ? possible.find(p => String(p.id) === String(confirmedLink.projectId)) :
        (possible.length === 1 ? possible[0] : null);
      const final = /^Final Delivery/.test(String(m.text||'')) || /\/final\//.test(String(m.file_url)) ||
        (!isMine && isCreator && !String(m.file_url).includes('/preview/') && /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(String(m.file_url)));
      const secureFinal = final && !isMine && isCreator;
      const payProof = proj ? axVerifiedChatPayments.get(proj.id) : null;
      const unlocked = !!(payProof && payProof.verified && payProof.unlocked);
      // Only separately uploaded PREVIEW objects (not the original) are eligible
      // for prepayment playback. It must be from the actual assigned editor.
      const previewMsg = proj && msgs.find(x => x.file_url &&
        String(x.file_url).includes(`/projects/${proj.id}/preview/`) &&
        String(x.from) === String(proj.freelancerId));
      const id = `ax-media-${idx}`;
      const openAction = appEvent('axOpenMessageMedia', [String(m.id||''), id]);
      const saveAction = appEvent('axDownloadMessageFile', [String(m.id||'')]);
      let controls = '';
      if (secureFinal) {
        if (!proj) {
          controls = `<span style="font-size:.74rem;color:var(--text-3)">Verifying the exact project for this older delivery. Do not pay twice.</span>`;
        } else {
          const previewControl = previewMsg
            ? `<button class="btn btn-ghost btn-xs" data-app-click="${appEvent('axOpenMessageMedia',[String(previewMsg.id),id])}">▶ Watermarked preview</button>`
            : `<span style="font-size:.73rem;color:var(--text-3)">Waiting for editor's watermarked preview.</span>`;
          const payControl = !proj.paid
            ? previewMsg
                ? String(proj.id)==='2ccb248a-ca4b-4349-9ed0-fd07dd55bdba'
                  ? `<span style="font-size:.77rem;color:var(--text-3)">Demo project — real-money checkout is disabled.</span>`
                  : `<button class="btn btn-primary btn-xs" data-app-click="${appEvent('axPayInChat',[String(proj.id)])}">Pay securely · ₹${escapeHtml(fmt(proj.budget))}</button>`
                : `<span style="font-size:.73rem;color:var(--text-3)">Preview required before approving this project. Checkout unavailable.</span>`
            : !payProof
              ? `<button class="btn btn-ghost btn-xs" data-app-click="${appEvent('axCheckVerifiedChatPayment',[String(proj.id)])}">Check verified payment</button>`
              : !payProof.verified
                ? `<span style="font-size:.74rem;color:var(--text-3)">Payment record needs verification. Do not pay again.</span>`
                : unlocked ? `<button class="btn btn-primary btn-xs" data-app-click="${saveAction}">⬇ Download original (verified)</button>`
                  : `<button class="btn btn-ghost btn-xs" data-app-click="${appEvent('axCheckVerifiedChatPayment',[String(proj.id)])}">Verify unlock status</button>`;
          controls = `${previewControl}${payControl}`;
        }
      } else if(final && isMine && proj && String(proj.freelancerId)===String(myId) && !previewMsg) {
        controls = `<button class="btn btn-primary btn-xs" data-app-click="${appEvent('axUploadLegacyPreview',[String(m.id)])}">🎬 Upload watermarked preview</button>`;
      } else {
        controls = `<button class="btn btn-ghost btn-xs" data-app-click="${openAction}">▶ Open</button>
                    <button class="btn btn-ghost btn-xs" data-app-click="${saveAction}">⬇ Save</button>`;
      }
      const label = secureFinal ? 'Protected final delivery' : 'Project attachment';
      const note = secureFinal && !unlocked ?
        '<div style="font-size:.73rem;color:var(--text-3);margin-top:7px">Original remains locked until payment is verified by the server. The watermarked preview is separate; the original is only served after verification.</div>':'';
      return `<div style="display:flex;flex-direction:column;align-items:${escapeHtml(flexAlign)};margin-bottom:9px;width:100%;">
        <div class="msg-video ${escapeHtml(isMine?'sent-video':'')} ${secureFinal?'ax-protected-delivery':''}" style="padding:12px;max-width:340px;">
          <div class="msg-video-label"><span style="font-weight:800">${escapeHtml(label)}</span></div>
          ${secureFinal && proj ? `<div style="font-size:.8rem;color:var(--text-2);margin-top:5px">Project: <strong>${escapeHtml(proj.title||proj.id)}</strong></div>` : ''}
          <div style="font-size:.82rem;margin:10px 0;overflow-wrap:anywhere">${escapeHtml(fname)}</div>
          <div id="${id}"></div>${note}
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">${controls}</div>
          <div class="msg-video-footer"><span>${escapeHtml(isMine?'You':'Sent')}</span><span>${escapeHtml(fmtTime(m.time))}</span></div>
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
      const projects = DB.projects().filter(x => x.status !== 'open' &&
        ((String(x.creatorId) === String(myId) && String(x.freelancerId) === String(otherId)) ||
         (String(x.creatorId) === String(otherId) && String(x.freelancerId) === String(myId))));
      if (projects.length !== 1) throw Error('Multiple projects in this chat. Please attach using the exact project files screen to avoid linking it to the wrong job.');
      if (file.size > 5*1024*1024*1024) throw Error('Single-file chat upload limit is 5 GB.');
      const mime = file.type || 'application/octet-stream';
      const response = await supaClient.functions.invoke('project-media-v2', {
        body: {action:'upload',kind:'chat',projectId:projects[0].id,fileName:file.name,fileType:mime,size:file.size}
      });
      if (response.error || !response.data?.uploadUrl || !response.data?.key) throw Error('Could not authorize project-scoped chat upload.');
      const upload = await fetch(response.data.uploadUrl, {method:'PUT',body:file,headers:{'Content-Type':mime}});
      if (!upload.ok) throw Error('S3 upload failed.');
      fileUrl = response.data.key;
    }

    await sendMsg(myId, otherId, fileUrl, file.name);

    // Ordinary chat attachments never mark final delivery.

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

const axVerifiedChatPayments = new Map();
async function axCheckVerifiedChatPayment(projectId) {
  if(!supaClient || !CU || CU.role !== 'creator')return;
  try {
    const response=await supaClient.functions.invoke('project-media-v2',{body:{action:'payment_status',projectId}});
    if(response.error || response.data?.projectId!==projectId || typeof response.data?.verified!=='boolean')
      throw Error('Payment proof service unavailable. Do not pay again.');
    axVerifiedChatPayments.set(projectId,{paid:response.data.paid===true,verified:response.data.verified===true,
      unlocked:response.data.downloadUnlocked===true});
    const key=[CU.id,currentChatUserId].sort().join('_');const container=document.getElementById('chat-msgs-el');
    if(container && currentChatUserId)container.innerHTML=renderMsgs(DB.messages()[key]||[],CU.id);
  } catch(e) { showToast(e.message||'Payment status could not be verified.','err',''); }
}

// V8.3: use the site's existing authenticated, verified checkout flow
// without jumping away from chat. This does not bypass the server's
// PROJECT_PAYMENTS_ENABLED flag, payment proof, or signature verification.
async function axPayInChat(projectId) {
  if (!CU || CU.role !== 'creator' || !supaClient) { showToast('Creator sign-in required.','err',''); return; }
  const p = DB.projects().find(x => String(x.id) === String(projectId));
  if (!p || String(p.creatorId) !== String(CU.id) || !p.editedUploaded) {
    showToast('Verified project delivery is required before payment.','err',''); return;
  }
  if (typeof completePayment !== 'function') {
    showToast('Secure checkout is unavailable. Do not send money outside Aalynex.','err',''); return;
  }
  const conversationKey=[CU.id,p.freelancerId].sort().join('_');
  const previewReady=(DB.messages()[conversationKey]||[]).some(m=>
    String(m.from)===String(p.freelancerId) &&
    String(m.file_url||'').includes(`/projects/${projectId}/preview/`) &&
    String(m.text||'').startsWith('Project Preview:'));
  if(!previewReady){showToast('Watermarked preview required before approval and checkout.','err','');return;}
  activeManageProjectId = String(projectId);
  window._axPayStartedInChat = String(projectId);
  await completePayment();
}

function triggerApproveAndPay(projectId) {
  if (!projectId || projectId === 'undefined') {
    showToast('Project not found.', 'err', '');
    return;
  }
  showModal('Proceed to Payment', 'Are you sure you want to approve this video and proceed to the payment screen?', async () => {
    const p = DB.projects().find(x => x.id === projectId);
    if (!p || !p.editedUploaded) {showToast('No confirmed final delivery for this project.','err','');return;}
    // Approval is navigation only. Never fabricate a delivery server flag.
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

  // Keep server-owned S3 key; sign only when an authorised user taps Open/Save.
  const fileUrl = newMsg.file_url || null;

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

        const fileUrl = m.file_url || null;

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

  // S3 object keys stay private until explicitly opened and server-authorised.
  const displayFileUrl = overrideFileUrl;

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
    return {ok:true,id:inserted.id};
  } catch (e) {
    console.error('[Chat] sendMsg failed:', e);
    showToast('Message failed to send.', 'err');
    return {ok:false};
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