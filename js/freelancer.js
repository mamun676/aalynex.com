/* ════════════════════════════════════════
   FREELANCER PAGES
════════════════════════════════════════ */
function fPage(p, el) {
  document.querySelectorAll('#screen-freelancer .nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  closeSidebar('freelancer');
  currentFreelancerPage = p;
  _pushNav({ view: 'freelancer', page: p });

const _navT = _navTicket();
renderF(p);
if (supaClient && CU) {
  syncFromSupabase(CU).then(() => {
    // a newer nav click landed while this sync was in flight - drop the repaint
    if (_navStale(_navT) || currentFreelancerPage !== p) return;
    if (p === 'chat') {
        const el = document.getElementById('chat-msgs-el');
        if (el && currentChatUserId) {
          const key = [CU.id, currentChatUserId].sort().join('_');
          el.innerHTML = renderMsgs(DB.messages()[key] || [], CU.id);
          el.scrollTop = el.scrollHeight;
        }
        updateChatSidebarPreviews();
      } else {
        renderF(p);
      }
    });
  }
}

function fPageMobile(p, el) {
  document.querySelectorAll('#f-bottom-nav .bn-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('#f-sidebar .nav-item').forEach(n => { n.classList.toggle('active', n.dataset.page === p); });
  currentFreelancerPage = p;
  _pushNav({ view: 'freelancer', page: p });

const _navT = _navTicket();
renderF(p);
if (supaClient && CU) {
  syncFromSupabase(CU).then(() => {
    // a newer nav click landed while this sync was in flight - drop the repaint
    if (_navStale(_navT) || currentFreelancerPage !== p) return;
    if (p === 'chat') {
        const el = document.getElementById('chat-msgs-el');
        if (el && currentChatUserId) {
          const key = [CU.id, currentChatUserId].sort().join('_');
          el.innerHTML = renderMsgs(DB.messages()[key] || [], CU.id);
          el.scrollTop = el.scrollHeight;
        }
        updateChatSidebarPreviews();
      } else {
        renderF(p);
      }
    });
  }
}

function renderF(p) {
  const m = document.getElementById('f-main');
  if      (p === 'home')     m.innerHTML = fHome();
  else if (p === 'browse')   m.innerHTML = fBrowse();
  else if (p === 'ongoing')  m.innerHTML = fOngoing();
  else if (p === 'chat') {
    const myProjects = DB.projects().filter(p => (p.creatorId === CU.id || p.freelancerId === CU.id) && p.status !== 'open');
    const relatedUserIds = [...new Set(myProjects.map(p => p.creatorId === CU.id ? p.freelancerId : p.creatorId).filter(id => id))];

    let defaultOther = currentChatUserId;
    if (!defaultOther || !relatedUserIds.includes(defaultOther)) {
      defaultOther = relatedUserIds[0] || '';
    }
    currentChatUserId = defaultOther;

    setTimeout(async () => {
      if (defaultOther && supaClient) {
        const convId = await getOrCreateConversation(CU.id, defaultOther);
        if (convId) await subscribeToConversation(convId, defaultOther);
      }
    });

    m.innerHTML = `<div class="page-head"><h2>Messages</h2></div>${buildChat(CU.id, defaultOther)}`;
  }
  else if (p === 'negotiate') m.innerHTML = fNegotiate();
  else if (p === 'upload')    m.innerHTML = fUpload();
  else if (p === 'earnings')  m.innerHTML = fEarnings();
  else if (p === 'profile')   m.innerHTML = fProfile();

  if (p !== 'chat') {
    m.classList.remove('fade-in'); void m.offsetWidth; m.classList.add('fade-in');
  }
}

function fHome() {
  const projs    = DB.projects().filter(p => p.freelancerId === CU.id);
  const earned   = projs.filter(p => p.paid).reduce((s, p) => s + p.budget, 0);
  const openProjs = DB.projects().filter(p => p.status === 'open' && (p.invited_freelancers || []).includes(CU.id));
  return `
  <div class="page-head"><h2>Dashboard</h2><p>Your freelancing overview</p></div>
  <div class="cards-grid">
    <div class="mc a"><div class="label">Ongoing</div><div class="value">${projs.filter(p => p.status === 'ongoing').length}</div></div>
    <div class="mc g"><div class="label">Total Earned</div><div class="value">₹${fmt(earned)}</div></div>
    <div class="mc p"><div class="label">Completed</div><div class="value">${projs.filter(p => p.status === 'completed').length}</div></div>
    <div class="mc b"><div class="label">Requests</div><div class="value">${openProjs.length}</div></div>
  </div>
  <div class="section-title">Your Ongoing Projects</div>
  <div class="project-list">
    ${projs.filter(p => p.status === 'ongoing').map(p => { const c = DB.users().find(u => u.id === p.creatorId); return `<div class="pc" style="cursor:pointer;" onclick="fViewProject('${p.id}')"><div class="pico">${contentIconSvg(p.contentType)}</div><div class="pinfo"><div class="ptitle">${p.title}</div><div class="pmeta">From ${c?.name || 'Creator'} &#183; &#8377;${fmt(p.budget)}</div></div><div class="pstatus ${statusClass(p.status)}">${statusLabel(p.status)}</div></div>`; }).join('')
      || '<div style="color:var(--text-3);font-size:.85rem;padding:16px 0;">No ongoing projects. <a style="color:var(--accent);cursor:pointer;" onclick="fPage(\'browse\',null)">Browse open projects &rarr;</a></div>'}
  </div>
  <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
    <button class="btn btn-purple" onclick="fPage('browse',null)">Browse Requests</button>
    <button class="btn btn-ghost"  onclick="fPage('ongoing',null)">Manage Ongoing &rarr;</button>
  </div>`;
}
function fOpenChatWith(otherId) {
  if (!otherId) { showToast('Chat unavailable for this project', 'err', ''); return; }
  currentChatUserId = otherId;
  const chatNav = document.querySelector('#screen-freelancer .nav-item[data-page="chat"]');
  fPage('chat', chatNav);
}

function fViewProject(id) {
  const p = DB.projects().find(x => x.id === id);
  if (!p) return;
  const c = DB.users().find(u => u.id === p.creatorId);
  const bodyHtml = `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div class="info-row"><span class="key">Client</span><span>${c?.name || 'Creator'}</span></div>
      <div class="info-row"><span class="key">Budget</span><span>&#8377;${fmt(p.budget)}</span></div>
      <div class="info-row"><span class="key">Type</span><span>${p.contentType}</span></div>
      <div class="info-row"><span class="key">Deadline</span><span>${fmtDate(p.deadline)}</span></div>
      <div class="info-row"><span class="key">Priority</span><span>${p.priority || 'Normal'}</span></div>
      <div class="info-row"><span class="key">Status</span><span>${statusLabel(p.status)}</span></div>
      ${p.description ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--glass-border);font-size:.85rem;color:var(--text-2);line-height:1.6;">${p.description}</div>` : ''}
    </div>`;
  showModal(p.title, bodyHtml, () => { fOpenChatWith(p.creatorId); });
  document.getElementById('modal-confirm').textContent = 'Chat with Creator';
}

function fBrowse() {
  const open = DB.projects().filter(p => p.status === 'open' && (p.invited_freelancers || []).includes(CU.id));
  return `
  <div class="page-head"><h2>Project Requests</h2><p>${open.length} request${open.length !== 1 ? 's' : ''} waiting for you</p></div>
  <div class="project-list">
    ${open.length
      ? open.map(p => { const c = DB.users().find(u => u.id === p.creatorId); return `
          <div class="pc">
            <div class="pico">${contentIconSvg(p.contentType)}</div>
            <div class="pinfo">
              <div class="ptitle">${p.title}</div>
              <div class="pmeta">By ${c?.name || 'Creator'} · <strong style="color:var(--accent)">₹${fmt(p.budget)}</strong> · Due ${fmtDate(p.deadline)}</div>
              <div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap;">
                <span class="tag">${p.contentType}</span><span class="tag b">${p.priority}</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
              <button class="btn btn-primary btn-sm" onclick="acceptProject('${p.id}')">Accept First</button>
              <button class="btn btn-ghost btn-sm"   onclick="viewProject('${p.id}')">View Details</button>
            </div>
          </div>`; }).join('')
      : '<div class="alert alert-i">No project requests right now. Wait for creators to invite you!</div>'}
  </div>`;
}

async function acceptProject(id) {
  let creatorId = null;

  if (supaClient) {
    const { data, error } = await supaClient.from('projects')
      .update({ freelancer_id: CU.id, status: 'ongoing' })
      .eq('id', id).is('freelancer_id', null).select();

    if (error || !data || data.length === 0) {
      showToast('Project already taken by another freelancer!', 'err', '');
      renderF('browse');
      return;
    }
    creatorId = data[0].creator_id;
  }

  const projs = DB.projects(), p = projs.find(x => x.id === id);
  if (p) {
    if (p.freelancerId) { showToast('Project already taken!', 'err', ''); renderF('browse'); return; }
    p.freelancerId = CU.id; p.status = 'ongoing'; DB.saveProjects(projs);
    if (!creatorId) creatorId = p.creatorId;
  }

  if (supaClient && creatorId) {
    try {
      const { data: atts } = await supaClient
        .from('project_attachments')
        .select('*')
        .eq('project_id', id);

      if (atts && atts.length > 0) {
        for (const att of atts) {
          if (att.file_url) {
            await sendMsg(CU.id, creatorId, att.file_url, att.file_name,
              `📁 Project File (uploaded by creator): ${att.file_name}`);
          }
        }
        showToast(`Accepted! ${atts.length} raw file(s) sent to chat.`, 'ok', '🎉');
      } else {
        sendAcceptanceNotificationEmail(creatorId, p?.title, p?.budget, p?.deadline, p?.contentType);
        showToast('Project accepted! Chat activated.', 'ok', '');
      }
    } catch (e) {
      sendAcceptanceNotificationEmail(creatorId, p?.title, p?.budget, p?.deadline, p?.contentType);
      showToast('Project accepted! Chat activated.', 'ok', '');
    }
  } else {
    sendAcceptanceNotificationEmail(creatorId, p?.title, p?.budget, p?.deadline, p?.contentType);
    showToast('Project accepted! Chat activated.', 'ok', '');
  }

  renderF('ongoing');
}

function viewProject(id) {
  const p = DB.projects().find(x => x.id === id); if (!p) return;
  const atts = (DB.attachments() || []).filter(a => a.projectId === id);

  let bodyHtml = `<div style="font-size:0.85rem; color:var(--text-2); margin-bottom:12px;">
     <strong>Budget:</strong> ₹${fmt(p.budget)}<br/>
     <strong>Type:</strong> ${p.contentType}<br/>
     <strong>Deadline:</strong> ${fmtDate(p.deadline)}<br/><br/>
     ${p.description || ''}
  </div>`;

  if (atts.length > 0) {
    bodyHtml += `<div style="border-top:1px solid var(--glass-border); padding-top:12px; margin-top:8px;">
          <div style="font-weight:600;font-size:.85rem;margin-bottom:8px;color:var(--text);">Attached Files Included:</div>
          <div style="display:flex;flex-direction:column;gap:6px;">${atts.map(a => {
      let icon = '📄'; if (a.type === 'video') icon = '🎬'; else if (a.type === 'image') icon = '🖼️'; else if (a.type === 'audio') icon = '🎵';
      return `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--text-2); background:var(--bg2); padding:6px 10px; border-radius:6px;">
                       <span>${icon}</span>
                       <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${a.name}</span>
                       ${a.duration ? `<span style="color:var(--text-3);font-size:.7rem;font-weight:500;">(⏱ ${a.duration})</span>` : ''}
                  </div>`;
    }).join('')}
          </div>
      </div>`;
  }

  showModal(p.title, bodyHtml, () => { acceptProject(id); });
  document.getElementById('modal-confirm').textContent = 'Accept Project';
}

function fOngoing() {
  const projs = DB.projects().filter(p => p.freelancerId === CU.id && p.status === 'ongoing');
  return `
  <div class="page-head"><h2>Ongoing Projects</h2><p>${projs.length} active project${projs.length !== 1 ? 's' : ''}</p></div>
  <div class="project-list">
    ${projs.length
      ? projs.map(p => {
        const c    = DB.users().find(u => u.id === p.creatorId);
        const prog = p.editedUploaded ? 100 : 50;
        return `
        <div class="pc" style="cursor:pointer;" onclick="fViewOngoing('${p.id}')">
          <div class="pico">${contentIconSvg(p.contentType)}</div>
          <div class="pinfo">
            <div class="ptitle">${p.title}</div>
            <div class="pmeta">${c?.name || 'Creator'} &#183; &#8377;${fmt(p.budget)} &#183; ${prog}% done</div>
          </div>
          <div class="pstatus s-on" style="flex-shrink:0;">In Progress</div>
        </div>`;
      }).join('')
      : '<div class="alert alert-i">No ongoing projects.</div>'}
  </div>`;
}

function fViewOngoing(id) {
  const p = DB.projects().find(x => x.id === id);
  if (!p) return;
  const c    = DB.users().find(u => u.id === p.creatorId);
  const prog = p.editedUploaded ? 100 : 50;
  const bodyHtml = `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div class="info-row"><span class="key">Client</span><span>${c?.name || 'Creator'}</span></div>
      <div class="info-row"><span class="key">Budget</span><span>&#8377;${fmt(p.budget)}</span></div>
      <div class="info-row"><span class="key">Content Type</span><span>${p.contentType || '-'}</span></div>
      <div class="info-row"><span class="key">Deadline</span><span>${p.deadline ? fmtDate(p.deadline) : '-'}</span></div>
      <div class="info-row"><span class="key">Priority</span><span>${p.priority || 'Normal'}</span></div>
      <div class="info-row"><span class="key">Raw Files</span><span><span class="tag g">Received</span></span></div>
      <div style="margin-top:10px;">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-3);margin-bottom:4px;"><span>Progress</span><span>${prog}%</span></div>
        <div class="pb"><div class="pf" style="width:${prog}%;"></div></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
        <button class="btn btn-outline-f btn-sm" onclick="closeModal();currentChatUserId='${p.creatorId}';fPage('chat',null)">Chat</button>
        <button class="btn btn-primary btn-sm"   onclick="closeModal();fPage('upload',null)">Upload Final</button>
        <button class="btn btn-ghost btn-sm"     onclick="closeModal();fPage('negotiate',null)">Negotiate</button>
      </div>
    </div>`;
  showModal(p.title, bodyHtml, () => {});
  document.getElementById('modal-confirm').textContent = 'Close';
}

function fNegotiate() {
  const projs = DB.projects().filter(p => p.freelancerId === CU.id && p.status === 'ongoing');
  return `
  <div class="page-head"><h2>Negotiate Price & Deadline</h2><p>${projs.length} project${projs.length !== 1 ? 's' : ''} open for negotiation</p></div>
  <div class="project-list">
    ${projs.length
      ? projs.map(p => {
        const c = DB.users().find(u => u.id === p.creatorId);
        return `
        <div class="pc" style="cursor:pointer;" onclick="fViewNegotiate('${p.id}')">
          <div class="pico">${contentIconSvg(p.contentType)}</div>
          <div class="pinfo">
            <div class="ptitle">${p.title}</div>
            <div class="pmeta">${c?.name || 'Creator'} &#183; Offer &#8377;${fmt(p.budget)} &#183; Due ${fmtDate(p.deadline)}</div>
          </div>
          <div class="pstatus s-on" style="flex-shrink:0;">Negotiate</div>
        </div>`;
      }).join('')
      : '<div class="alert alert-i">No projects to negotiate right now.</div>'}
  </div>`;
}

function fViewNegotiate(id) {
  const p = DB.projects().find(x => x.id === id);
  if (!p) return;
  const c = DB.users().find(u => u.id === p.creatorId);
  const bodyHtml = `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div class="info-row"><span class="key">Client</span><span>${c?.name || 'Creator'}</span></div>
      <div class="info-row"><span class="key">Client's Offer</span><span style="font-weight:600;">&#8377;${fmt(p.budget)}</span></div>
      <div class="info-row"><span class="key">Current Deadline</span><span>${p.deadline ? fmtDate(p.deadline) : '-'}</span></div>
      <div class="two-col" style="margin-top:14px;">
        <div class="fg"><label>Your Counter-Price (&#8377;)</label><input type="number" id="neg-price-${p.id}" value="${Math.round(p.budget * 1.15)}"/></div>
        <div class="fg"><label>Proposed Deadline</label><input type="date" id="neg-date-${p.id}" value="${new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}"/></div>
      </div>
      <div class="fg"><label>Message to Client</label><input id="neg-msg-${p.id}" placeholder="I can complete this at the revised price..."/></div>
      <button class="btn btn-green-btn btn-sm" style="margin-top:4px;" onclick="closeModal();showToast('Accepted at original terms!','ok','')">Accept Original Terms</button>
    </div>`;
  showModal(p.title, bodyHtml, () => { sendCounter(p.id); });
  document.getElementById('modal-confirm').textContent = 'Send Counter-Offer';
}

function sendCounter(id) {
  const price = document.getElementById('neg-price-' + id)?.value, date = document.getElementById('neg-date-' + id)?.value;
  if (!price || !date) { showToast('Fill in all fields', 'err', ''); return; }

  const proj = DB.projects().find(x => x.id === id);
  if (proj) {
    const msg = `[NEGOTIATION_REQ]|${proj.id}|${price}|${date}|${document.getElementById('neg-msg-' + id)?.value}`;
    sendMsg(CU.id, proj.creatorId, null, null, msg);
  }

  showToast(`Counter-offer sent: ₹${fmt(price)}`, 'ok', '');
}

async function acceptNegotiation(btn, projectId, newPrice, newDate, otherId) {
  btn.disabled = true;
  btn.innerText = "Processing...";
  if (btn.nextElementSibling) btn.nextElementSibling.style.display = 'none';

  const projs = DB.projects(), p = projs.find(x => x.id === projectId);
  if (p) {
    p.budget = parseInt(newPrice);
    p.deadline = newDate;
    DB.saveProjects(projs);
  }

  if (supaClient) {
    await supaClient.from('projects').update({ budget: parseInt(newPrice), deadline: newDate }).eq('id', projectId);
  }

  await sendMsg(CU.id, otherId, null, null, `✅ Offer Accepted! New budget: ₹${fmt(newPrice)} by ${fmtDate(newDate)}.`);
  showToast('Budget & deadline updated!', 'ok');

  btn.parentElement.innerHTML = `<span style="font-size:0.8rem; color:var(--green); font-weight:600;">Offer Accepted</span>`;
}

function rejectNegotiation(btn, projectId, otherId) {
  btn.disabled = true;
  btn.innerText = "Processing...";
  if (btn.previousElementSibling) btn.previousElementSibling.style.display = 'none';

  sendMsg(CU.id, otherId, null, null, `❌ Offer Rejected. Let's discuss further.`);
  showToast('Offer rejected', 'info');

  btn.parentElement.innerHTML = `<span style="font-size:0.8rem; color:var(--red); font-weight:600;">Offer Rejected</span>`;
}

function onFinalFileSelect(input, pid) {
  const zone  = document.getElementById('final-drop-zone-' + pid);
  const label = document.getElementById('final-file-label-' + pid);
  const icon  = document.getElementById('final-upload-icon-' + pid);
  if (input.files && input.files[0]) {
    const f = input.files[0];
    label.textContent = `${f.name}  (${fmtFileSize(f.size)})`;
    icon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>';
    zone.classList.add('has-file');
  } else {
    label.textContent = 'Drag & drop your final edited video or click to browse';
    icon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>';
    zone.classList.remove('has-file');
  }
}

async function uploadFinalVideo(pid) {
  const fileInput = document.getElementById('final-video-input-' + pid);
  const btn       = document.getElementById('final-video-btn-' + pid);
  const progWrap  = document.getElementById('final-progress-wrap-' + pid);
  const progFill  = document.getElementById('final-progress-fill-' + pid);
  const note      = document.getElementById('final-note-' + pid)?.value || '';

  if (!fileInput || !fileInput.files || !fileInput.files.length) { showToast('Please select a final video file first', 'err', ''); return; }
  const file = fileInput.files[0];
  const MAX_SIZE = 10 * 1024 * 1024 * 1024;
  if (file.size > MAX_SIZE) { showToast('File too large. Maximum size is 10 GB.', 'err', ''); return; }

  const proj = DB.projects().find(x => x.id === pid);
  if (!proj) return;

  btn.disabled = true; btn.textContent = 'Uploading…'; btn.classList.add('btn-loading');
  if (progWrap) { progWrap.classList.add('show'); progFill.style.width = '0%'; }

  let fileUrl = null;
  try {
    if (supaClient) {
      if (progFill) progFill.style.width = '20%';
      const s3Key = await s3Upload(file, 'final');   // S3 pe upload
      if (progFill) progFill.style.width = '60%';
      fileUrl = s3Key;   // ← sendMsg ko key do (signed URL woh khud banayega)
      if (progFill) progFill.style.width = '80%';
    }

    if (supaClient) await supaClient.from('projects').update({ edited_uploaded: true }).eq('id', proj.id);
    proj.editedUploaded = true;
    DB.saveProjects(DB.projects());

    const msgText = note ? `Final Delivery: ${note}` : `Final Delivery`;
    await sendMsg(CU.id, proj.creatorId, fileUrl, file.name, msgText);

    if (progFill) progFill.style.width = '100%';
    sendFinalUploadNotificationEmail(proj.creatorId, proj.title);
    closeModal();
    showToast('Final video uploaded and sent to creator!', 'ok', '');
    fPage('upload', document.querySelector('[data-page="upload"]'));
  } catch (err) {
    showToast('Upload failed.', 'err', '');
    if (btn) { btn.disabled = false; btn.textContent = 'Upload Final Video →'; btn.classList.remove('btn-loading'); }
    if (progWrap) progWrap.classList.remove('show');
  }
}

function fUpload() {
  const projs = DB.projects().filter(p => p.freelancerId === CU.id && p.status === 'ongoing');
  return `
  <div class="page-head"><h2>Upload Edited Video</h2><p>${projs.length} project${projs.length !== 1 ? 's' : ''} ready for delivery</p></div>
  <div class="alert alert-i">Upload final video here OR securely inside the Chat menu!</div>
  <div class="project-list">
    ${projs.length
      ? projs.map(p => {
        const c = DB.users().find(u => u.id === p.creatorId);
        return `
        <div class="pc" style="cursor:pointer;" onclick="fViewUpload('${p.id}')">
          <div class="pico">${contentIconSvg(p.contentType)}</div>
          <div class="pinfo">
            <div class="ptitle">${p.title}</div>
            <div class="pmeta">${c?.name || 'Creator'} &#183; &#8377;${fmt(p.budget)} &#183; ${p.editedUploaded ? 'Final delivered' : 'Awaiting final upload'}</div>
          </div>
          <div class="pstatus ${p.editedUploaded ? 's-co' : 's-on'}" style="flex-shrink:0;">${p.editedUploaded ? 'Delivered' : 'Upload'}</div>
        </div>`;
      }).join('')
      : '<div class="alert alert-i">No projects ready for upload.</div>'}
  </div>`;
}
function fViewUpload(id) {
  const p = DB.projects().find(x => x.id === id);
  if (!p) return;
  const bodyHtml = `
    <label class="upload-area-lg" for="final-video-input-${p.id}" id="final-drop-zone-${p.id}">
      <div class="upload-icon" id="final-upload-icon-${p.id}">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
      </div>
      <div class="upload-label" id="final-file-label-${p.id}">Drag & drop your final edited video or click to browse</div>
      <div class="upload-sub">MP4, MOV &middot; Up to 10 GB</div>
      <input type="file" id="final-video-input-${p.id}" accept="video/*" style="display:none;" onchange="onFinalFileSelect(this, '${p.id}')"/>
    </label>
    <div class="upload-progress-wrap" id="final-progress-wrap-${p.id}">
      <div class="upload-progress-bar"><div class="upload-progress-fill" id="final-progress-fill-${p.id}"></div></div>
    </div>
    <div class="fg"><label>Version Notes</label><input id="final-note-${p.id}" placeholder="v1 &#8211; Color graded, audio synced..."/></div>
    <button class="btn btn-primary" style="width:100%;" id="final-video-btn-${p.id}" onclick="uploadFinalVideo('${p.id}')">Upload Final Video &#8594;</button>`;
  showModal('Upload for: ' + p.title, bodyHtml, () => {});
  document.getElementById('modal-confirm').textContent = 'Close';
}

function fEarnings() {
  const projs    = DB.projects().filter(p => p.freelancerId === CU.id);
  const received = projs.filter(p => p.paid).reduce((s, p) => s + p.budget, 0);
  const pending  = projs.filter(p => !p.paid).reduce((s, p) => s + p.budget, 0);
  return `
  <div class="page-head"><h2>Earnings</h2></div>
  <div class="cards-grid">
    <div class="mc g"><div class="label">Total Received</div><div class="value">&#8377;${fmt(received)}</div></div>
    <div class="mc a"><div class="label">Pending Payout</div><div class="value">&#8377;${fmt(pending)}</div></div>
    <div class="mc"><div class="label">Projects</div><div class="value">${projs.length}</div></div>
  </div>
  <div class="section-title">Transaction History</div>
  <div class="project-list">
    ${projs.length
      ? projs.map(p => { const c = DB.users().find(u => u.id === p.creatorId); return `
          <div class="pc" style="cursor:pointer;" onclick="fViewEarning('${p.id}')">
            <div class="pico"><svg class="pico-icon" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
            <div class="pinfo"><div class="ptitle">${p.title}</div><div class="pmeta">From ${c?.name || 'Creator'} &#183; ${fmtDate(p.createdAt)}</div></div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="font-weight:600;font-size:.9rem;">&#8377;${fmt(p.budget)}</div>
              <div class="pstatus ${p.paid ? 's-co' : 's-pe'}">${p.paid ? 'Received' : 'Pending'}</div>
            </div>
          </div>`; }).join('')
      : '<div style="color:var(--text-3);font-size:.85rem;padding:20px 0;">No transactions yet.</div>'}
  </div>`;
}

function fViewEarning(id) {
  const p = DB.projects().find(x => x.id === id);
  if (!p) return;
  const c = DB.users().find(u => u.id === p.creatorId);
  const paid = !!p.paid;
  const statusColor = paid ? 'var(--green)' : '#d97706';
  const statusText  = paid ? 'Received' : 'Pending';
  let note;
  if (paid) {
    note = `Payment of &#8377;${fmt(p.budget)} has been received from ${c?.name || 'the client'}.`;
  } else if (p.status === 'completed') {
    note = `Project is completed. Payout of &#8377;${fmt(p.budget)} is pending from ${c?.name || 'the client'} - you can follow up via Chat.`;
  } else if (p.editedUploaded) {
    note = `Final video delivered. Payment of &#8377;${fmt(p.budget)} will be released after ${c?.name || 'the client'} approves the work.`;
  } else {
    note = `Complete and deliver this project to receive your payout of &#8377;${fmt(p.budget)}.`;
  }
  const stars = p.rating ? ('&#9733;'.repeat(p.rating) + '&#9734;'.repeat(5 - p.rating)) : '';
  const bodyHtml = `
    <div style="display:flex;flex-direction:column;gap:2px;">
      <div class="info-row"><span class="key">Payment Status</span><span style="color:${statusColor};font-weight:600;">${statusText}</span></div>
      <div class="info-row"><span class="key">Amount</span><span style="font-weight:600;">&#8377;${fmt(p.budget)}</span></div>
      <div class="info-row"><span class="key">Client</span><span>${c?.name || 'Creator'}</span></div>
      <div class="info-row"><span class="key">Content Type</span><span>${p.contentType || '-'}</span></div>
      <div class="info-row"><span class="key">Project Status</span><span>${statusLabel(p.status)}</span></div>
      <div class="info-row"><span class="key">Final Video</span><span>${p.editedUploaded ? 'Delivered' : 'Not delivered'}</span></div>
      <div class="info-row"><span class="key">Deadline</span><span>${p.deadline ? fmtDate(p.deadline) : '-'}</span></div>
      <div class="info-row"><span class="key">Created</span><span>${fmtDate(p.createdAt)}</span></div>
      ${stars ? `<div class="info-row"><span class="key">Client Rating</span><span style="color:#f59e0b;">${stars}</span></div>` : ''}
      <div class="alert alert-i" style="margin-top:12px;">${note}</div>
    </div>`;
  showModal(p.title, bodyHtml, () => { currentChatUserId = p.creatorId; fPage('chat', null); });
  document.getElementById('modal-confirm').textContent = 'Chat with Client';
  if (paid) {
  showModal(p.title, bodyHtml, () => {});
  document.getElementById('modal-confirm').textContent = 'Close';
} else {
  showModal(p.title, bodyHtml, () => { currentChatUserId = p.creatorId; fPage('chat', null); });
  document.getElementById('modal-confirm').textContent = 'Chat with Client';
}
}

function fProfile() {
  const u = CU;
  const skills = u.skills || [];
  const links = u.portfolio_links || {};
  const exp = u.experience || [];

  return `
  <div class="page-head"><h2>My Profile</h2></div>
  <div class="two-col">
    <div>
      <div class="det-card">
        <h4>Personal Info</h4>
        <div class="fg"><label>Full Name</label><input id="fprof-name" value="${u.name}"/></div>
        <div class="fg"><label>Email</label><input value="${u.email}" disabled style="opacity:.5;"/></div>
        <div class="fg"><label>Phone</label><input id="fprof-phone" value="${u.phone || ''}"/></div>
        <div class="fg"><label>Profession</label><input id="fprof-profession" value="${u.profession || ''}"/></div>
        <button class="btn btn-primary" onclick="saveFProfile()">Save Changes</button>
      </div>

      ${u.is_managed_editor ? `
      <div class="det-card" style="border:1px solid var(--accent);background:linear-gradient(180deg,rgba(224,92,42,.05),transparent);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <h4 style="margin:0;">🏆 Managed Editor</h4>
          <span class="tag pu" style="font-size:.65rem;">${u.managed_id || 'Verified'}</span>
        </div>
        <p style="font-size:.75rem;color:var(--text-3);margin:0 0 12px;">You're a verified Managed Editor. Set your specialization &amp; minimum pricing — creators see this on your card.</p>
        <div class="fg"><label>Specialization</label><input id="me-spec" placeholder="e.g. Long-form documentary edits" value="${u.specialization || ''}"/></div>
        <div style="display:flex;gap:10px;">
          <div class="fg" style="flex:1;"><label>Min Price — Long-form (₹)</label><input id="me-lf" type="number" min="0" placeholder="5000" value="${u.min_price_longform != null ? u.min_price_longform : ''}"/></div>
          <div class="fg" style="flex:1;"><label>Min Price — Reel/Short (₹)</label><input id="me-reel" type="number" min="0" placeholder="800" value="${u.min_price_reel != null ? u.min_price_reel : ''}"/></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveManagedProfile()">Save Managed Profile</button>
      </div>
      ` : `
      <div class="det-card">
        <h4>🏆 Managed Editor Program</h4>
        <p style="font-size:.78rem;color:var(--text-3);margin:0;">Managed Editors are hand-picked, verified pros who get premium visibility &amp; pricing. Keep your ratings high — admins promote top editors.</p>
      </div>
      `}

      <div class="det-card">
        <h4>Account Details</h4>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div class="sb-avatar sb-av-freelancer" style="width:48px;height:48px;font-size:1.2rem;overflow:hidden;">
            ${u.photo_url ? `<img src="${u.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : u.avatar}
          </div>
          <div>
            <div style="font-weight:600;font-size:1rem;color:var(--text);">${u.name}</div>
            <span class="tag pu">Freelancer</span>
          </div>
        </div>
        <div class="info-row"><span class="key">Profession</span><span>${u.profession || 'N/A'}</span></div>
        <div class="info-row"><span class="key">Member Since</span><span>${new Date(u.createdAt || u.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span></div>
      </div>

      <div class="det-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4>Experience</h4>
          <button class="btn btn-primary btn-xs" onclick="toggleExpForm()">+ Add Experience</button>
        </div>
        <div id="exp-form-container" style="display:none; margin-top:10px; padding:12px; background:var(--bg2); border:1px solid var(--glass-border-strong); border-radius:var(--radius-sm);">
          <div class="fg"><label>Job Title / Role</label><input id="exp-title" placeholder="Senior Video Editor"></div>
          <div class="fg"><label>Company / Client Name</label><input id="exp-company" placeholder="MrBeast / Studio XYZ"></div>
          <div class="fg"><label>Duration</label><input id="exp-duration" placeholder="Jan 2023 - Mar 2024"></div>
          <div class="fg"><label>Description</label><textarea id="exp-desc" placeholder="Edited high retention videos..."></textarea></div>
          <input type="hidden" id="exp-edit-idx" value="-1">
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="saveExperience()">Save Entry</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleExpForm()">Cancel</button>
          </div>
        </div>
        <div id="exp-list" style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
          ${exp.map((e, i) => `
            <div style="background:var(--surface); border:1px solid var(--glass-border); padding:12px; border-radius:var(--radius-sm);">
              <div style="display:flex; justify-content:space-between;">
                <strong style="font-size:0.9rem;color:var(--text);">${e.title}</strong>
                <div style="display:flex; gap:6px;">
                  <button class="btn btn-ghost btn-xs" onclick="editExperience(${i})">Edit</button>
                  <button class="btn btn-danger btn-xs" onclick="deleteExperience(${i})">Del</button>
                </div>
              </div>
              <div style="font-size:0.8rem; color:var(--text-2); margin-bottom:4px; font-weight:500;">${e.company} | ${e.duration}</div>
              ${e.description ? `<div style="font-size:0.75rem; color:var(--text-3); line-height:1.4;">${e.description}</div>` : ''}
            </div>
          `).join('') || '<div style="font-size:0.8rem; color:var(--text-3);">No experience added yet.</div>'}
        </div>
      </div>
    </div>

    <div>
      <div class="det-card">
        <h4>Profile Photo</h4>
        <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
          <div class="sb-avatar sb-av-freelancer" style="width:80px;height:80px;font-size:2rem;overflow:hidden;" id="prof-photo-preview">
            ${u.photo_url ? `<img src="${u.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : u.avatar}
          </div>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer; margin:0;">
            Upload New Photo
            <input type="file" id="bio-photo-upload" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(this)">
          </label>
        </div>
      </div>

      <div class="det-card">
        <h4>My Skills</h4>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          ${skills.map(s => `<span class="tag pu" style="cursor:pointer;" onclick="removeSkill('${s}')">${s} ×</span>`).join('')}
        </div>
        <div class="fg" style="display:flex; gap:8px; margin-bottom:12px;">
          <input id="bio-skill-input" placeholder="Add a new skill..." style="flex:1;">
          <button class="btn btn-primary" onclick="addSkill(document.getElementById('bio-skill-input').value)">Add</button>
        </div>
        <div class="divider">Suggested</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${['Video Editing', 'Color Grading', 'Motion Graphics', 'Sound Design', 'Thumbnail Design', 'Premiere Pro', 'After Effects', 'DaVinci Resolve', 'CapCut', 'Alight Motion'].map(s => `<div class="ct-pill" onclick="addSkill('${s}')">${s}</div>`).join('')}
        </div>
      </div>

      <div class="det-card">
        <h4>Portfolio &amp; Work Links</h4>
        <div class="fg"><label>Instagram Profile Link</label><input id="bio-ig" placeholder="https://instagram.com/yourhandle" value="${links.instagram || ''}"></div>
        <div class="fg"><label>YouTube Channel Link</label><input id="bio-yt" placeholder="https://youtube.com/@yourchannel" value="${links.youtube || ''}"></div>
        <div class="fg"><label>Work Video Link (Best Work)</label><input id="bio-work" placeholder="Paste a link to your best work (YouTube/Drive/Vimeo)" value="${links.video_link || ''}"></div>
        <button class="btn btn-primary btn-sm" onclick="savePortfolioLinks()">Save Links</button>
      </div>

      <div class="det-card">
        <h4>Resume / CV</h4>
        ${u.resume_url ? `
          <div class="alert alert-s" style="align-items:center; display:flex;">
            <span style="flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Resume Uploaded</span>
            <a href="${u.resume_url}" target="_blank" class="btn btn-ghost btn-xs" style="margin-right:8px; text-decoration:none;">View</a>
            <label class="btn btn-primary btn-xs" style="cursor:pointer; margin:0;">
              Replace
              <input type="file" id="bio-resume-replace" accept="application/pdf" style="display:none;" onchange="uploadResume(this)">
            </label>
          </div>
        ` : `
          <label class="upload-area" style="display:block; cursor:pointer;">
            Upload your Resume (PDF)
            <input type="file" accept="application/pdf" style="display:none;" onchange="uploadResume(this)">
          </label>
        `}
      </div>
    </div>
  </div>

  <div class="det-card" style="margin-top:14px;">
    <h4>Payment Details</h4>
    <div class="fg">
      <label>UPI ID</label>
      <input id="prof-upi" placeholder="yourname@upi" value="${u.upiId || ''}"/>
      <div style="font-size:.7rem;color:var(--text-3);margin-top:4px;">Your payment details are private and only used for payouts.</div>
    </div>
    <div class="fg"><label>Account Holder Name</label><input id="prof-bank-name" placeholder="Full name as on bank account" value="${u.bankAccountName || ''}"/></div>
    <div class="fg"><label>Bank Account Number</label><input id="prof-bank-acc" placeholder="Enter account number" value="${u.bankAccountNumber || ''}"/></div>
    <div class="fg"><label>IFSC Code</label><input id="prof-ifsc" placeholder="e.g. SBIN0001234" maxlength="11" value="${u.ifscCode || ''}"/></div>
    <button class="btn btn-primary btn-sm" id="save-payment-btn" onclick="savePaymentDetails()">Save Payment Details</button>
  </div>`;
}

function saveFProfile() {
  const name = document.getElementById('fprof-name')?.value?.trim();
  if (!name) { showToast('Name cannot be empty', 'err', ''); return; }
  const phone = document.getElementById('fprof-phone')?.value?.trim();
  const profession = document.getElementById('fprof-profession')?.value?.trim();
  const newAvatar = name.charAt(0).toUpperCase();

  const users = DB.users(), u = users.find(x => x.id === CU.id);
  if (u) { u.name = name; u.phone = phone; u.profession = profession; u.avatar = newAvatar; DB.saveUsers(users); }

  CU = { ...CU, name, phone, profession, avatar: newAvatar };
  DB.setCurrentUser(CU);

  document.getElementById('f-nav-name').textContent  = name.split(' ')[0];
  document.getElementById('f-sb-name').textContent   = name;
  document.getElementById('f-sb-role').textContent   = 'Freelancer · ' + (profession || '');

  updateAvatarsEverywhere();

  if (supaClient && CU.id) {
    supaClient.from('profiles').upsert({
      id: CU.id,
      name: CU.name,
      phone: CU.phone,
      profession: CU.profession,
      avatar: CU.avatar,
      role: CU.role,
      skills: CU.skills || [],
      portfolio_links: CU.portfolio_links || {},
      resume_url: CU.resume_url || '',
      photo_url: CU.photo_url || '',
      experience: CU.experience || []
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error) { showToast('Database save failed', 'err', ''); }
      else {
        showToast('Profile updated & saved!', 'ok', '');
        renderF('profile');
      }
    });
  } else {
    showToast('Profile updated locally', 'ok', '');
    renderF('profile');
  }
}

async function saveManagedProfile() {
  const specialization = document.getElementById('me-spec')?.value?.trim() || '';
  const lfRaw = document.getElementById('me-lf')?.value;
  const reelRaw = document.getElementById('me-reel')?.value;
  const min_price_longform = lfRaw ? parseInt(lfRaw, 10) : null;
  const min_price_reel = reelRaw ? parseInt(reelRaw, 10) : null;

  CU.specialization = specialization;
  CU.min_price_longform = min_price_longform;
  CU.min_price_reel = min_price_reel;
  DB.setCurrentUser(CU);

  if (supaClient && CU.id) {
    const { error } = await supaClient.from('profiles')
      .update({ specialization, min_price_longform, min_price_reel })
      .eq('id', CU.id);
    if (error) { showToast('Save failed: ' + error.message, 'err', ''); return; }
    showToast('Managed editor profile saved!', 'ok', '');
    renderF('profile');
  } else {
    showToast('Saved locally', 'ok', '');
    renderF('profile');
  }
}
/* ═══════════════════════════════════
   PROFILE & UPLOAD HANDLERS
═══════════════════════════════════ */
async function loadFreelancerProfile() {
  if (!supaClient || !CU) return;
  try {
    const { data, error } = await supaClient.from('profiles').select('*').eq('id', CU.id).single();
    if (data && !error) {
      CU.skills = data.skills || [];
      CU.portfolio_links = data.portfolio_links || {};
      CU.resume_url = data.resume_url || '';
      CU.photo_url = data.photo_url || '';
      CU.experience = data.experience || [];
      CU.specialization = data.specialization || '';
      CU.min_price_longform = (data.min_price_longform != null ? data.min_price_longform : null);
      CU.min_price_reel = (data.min_price_reel != null ? data.min_price_reel : null);
      try {
        const { data: me } = await supaClient.from('managed_editors').select('unique_id').eq('freelancer_id', CU.id).maybeSingle();
        CU.is_managed_editor = !!me;
        CU.managed_id = me ? me.unique_id : '';
      } catch (e) { /* managed optional */ }
      // SECURITY: bank/UPI ab alag 'freelancer_payout' table me hai (sirf owner read kar sakta hai)
      try {
        const { data: pay } = await supaClient.from('freelancer_payout').select('*').eq('freelancer_id', CU.id).maybeSingle();
        CU.upiId = (pay && pay.upi_id) || '';
        CU.bankAccountName = (pay && pay.bank_account_name) || '';
        CU.bankAccountNumber = (pay && pay.bank_account_number) || '';
        CU.ifscCode = (pay && pay.ifsc_code) || '';
      } catch (e) { /* payout optional */ }
      DB.setCurrentUser(CU);
      updateAvatarsEverywhere();
    }
  } catch (e) {
    console.error("Error loading freelancer profile:", e);
  }
}

function updateAvatarsEverywhere() {
  if (!CU) return;
  const fAvEl = document.getElementById('f-sb-avatar');
  if (fAvEl) {
    if (CU.photo_url) {
      fAvEl.innerHTML = `<img src="${CU.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      fAvEl.textContent = CU.avatar || CU.name.charAt(0).toUpperCase();
    }
  }
  const cAvEl = document.getElementById('c-sb-avatar');
  if (cAvEl) {
    if (CU.photo_url) {
      cAvEl.innerHTML = `<img src="${CU.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      cAvEl.textContent = CU.avatar || CU.name.charAt(0).toUpperCase();
    }
  }
}

async function uploadProfilePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Uploading profile photo...', 'info', '');
  if (supaClient) {
    const path = CU.id + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const { error } = await supaClient.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) { showToast('Upload failed: ' + error.message, 'err', ''); return; }
    const { data: urlData } = supaClient.storage.from('avatars').getPublicUrl(path);
    CU.photo_url = urlData.publicUrl;
    await supaClient.from('profiles').upsert({ id: CU.id, photo_url: CU.photo_url });
    DB.setCurrentUser(CU);
    updateAvatarsEverywhere();
    showToast('Photo successfully updated!', 'ok', '');
    renderF('profile');
  }
}

async function uploadResume(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Uploading resume...', 'info', '');
  if (supaClient) {
    const path = CU.id + '/' + Date.now() + '.pdf';
    const { error } = await supaClient.storage.from('resumes').upload(path, file, { upsert: true });
    if (error) { showToast('Upload failed: ' + error.message, 'err', ''); return; }
    const { data: urlData } = supaClient.storage.from('resumes').getPublicUrl(path);
    CU.resume_url = urlData.publicUrl;
    await supaClient.from('profiles').upsert({ id: CU.id, resume_url: CU.resume_url });
    DB.setCurrentUser(CU);
    showToast('Resume uploaded and saved!', 'ok', '');
    renderF('profile');
  }
}

async function addSkill(s) {
  s = (s || '').trim();
  if (!s) return;
  CU.skills = CU.skills || [];
  if (!CU.skills.includes(s)) {
    CU.skills.push(s);
    if (supaClient) await supaClient.from('profiles').upsert({ id: CU.id, skills: CU.skills });
    DB.setCurrentUser(CU);
    showToast('Skill added', 'ok', '');
    renderF('profile');
  }
}

async function removeSkill(s) {
  CU.skills = (CU.skills || []).filter(x => x !== s);
  if (supaClient) await supaClient.from('profiles').upsert({ id: CU.id, skills: CU.skills });
  DB.setCurrentUser(CU);
  showToast('Skill removed', 'ok', '');
  renderF('profile');
}

// Feature: payment details
async function savePaymentDetails() {
  const upiId = document.getElementById('prof-upi')?.value?.trim() || '';
  const bankName = document.getElementById('prof-bank-name')?.value?.trim() || '';
  const bankAcc = document.getElementById('prof-bank-acc')?.value?.trim() || '';
  const ifsc = document.getElementById('prof-ifsc')?.value?.trim().toUpperCase() || '';

  CU.upiId = upiId;
  CU.bankAccountName = bankName;
  CU.bankAccountNumber = bankAcc;
  CU.ifscCode = ifsc;
  DB.setCurrentUser(CU);

  if (supaClient) {
    // SECURITY: bank/UPI ko alag 'freelancer_payout' table me upsert karo (RLS: sirf owner)
    const { error } = await supaClient.from('freelancer_payout').upsert({
      freelancer_id: CU.id,
      upi_id: upiId,
      bank_account_name: bankName,
      bank_account_number: bankAcc,
      ifsc_code: ifsc
    }, { onConflict: 'freelancer_id' });
    if (error) { showToast('Failed to save. Try again.', 'err', ''); return; }
  }
  showToast('Payment details saved!', 'ok', '');
}

// Feature: profile completion banner
function checkFProfileCompletion() {
  if (!CU || CU.role !== 'freelancer') return;

  const checks = [
    !!(CU.name && CU.name.trim()),
    !!(CU.phone && CU.phone.trim()),
    !!(CU.profession && CU.profession.trim()),
    Array.isArray(CU.skills) && CU.skills.length > 0,
    CU.portfolio_links && Object.values(CU.portfolio_links).some(v => v && v.trim()),
    Array.isArray(CU.experience) && CU.experience.length > 0,
    !!(CU.upiId && CU.upiId.trim()),
    !!(CU.photo_url && CU.photo_url.trim())
  ];

  const filledCount = checks.filter(Boolean).length;
  const total = checks.length;
  const percent = Math.round((filledCount / total) * 100);
  const remaining = total - filledCount;

  const existingBanner = document.getElementById('fprofile-completion-banner');

  if (percent >= 100) {
    if (existingBanner) existingBanner.remove();
    return;
  }

  const bannerHtml = `
    <div id="fprofile-completion-banner" style="background:linear-gradient(90deg,rgba(224,92,42,.09),rgba(124,58,237,.07));padding:9px 20px;display:flex;align-items:center;justify-content:space-between;font-size:0.82rem;width:100%;gap:12px;flex-shrink:0;">
      <span>📝 Complete your profile — <strong>${percent}%</strong> done, <strong>${remaining}</strong> item(s) remaining</span>
      <button class="btn btn-primary btn-sm" onclick="fPage('profile',null)" style="white-space:nowrap;flex-shrink:0;">Complete Profile →</button>
    </div>`;

  const fMain = document.getElementById('f-main');
  if (!fMain) return;

  if (existingBanner) {
    existingBanner.outerHTML = bannerHtml;
  } else {
    fMain.insertAdjacentHTML('afterbegin', bannerHtml);
  }
}

async function savePortfolioLinks() {
  const ig   = document.getElementById('bio-ig')?.value?.trim() || '';
  const yt   = document.getElementById('bio-yt')?.value?.trim() || '';
  const work = document.getElementById('bio-work')?.value?.trim() || '';
  CU.portfolio_links = { instagram: ig, youtube: yt, video_link: work };
  if (supaClient) await supaClient.from('profiles').upsert({ id: CU.id, portfolio_links: CU.portfolio_links });
  DB.setCurrentUser(CU);
  showToast('Portfolio links saved!', 'ok', '');
}

function toggleExpForm() {
  const form = document.getElementById('exp-form-container');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'none') {
    document.getElementById('exp-title').value    = '';
    document.getElementById('exp-company').value  = '';
    document.getElementById('exp-duration').value = '';
    document.getElementById('exp-desc').value     = '';
    document.getElementById('exp-edit-idx').value = '-1';
  }
}

async function saveExperience() {
  const title    = document.getElementById('exp-title')?.value?.trim();
  const company  = document.getElementById('exp-company')?.value?.trim();
  const duration = document.getElementById('exp-duration')?.value?.trim();
  const desc     = document.getElementById('exp-desc')?.value?.trim() || '';
  const idx      = parseInt(document.getElementById('exp-edit-idx')?.value || '-1');

  if (!title || !company || !duration) { showToast('Title, Company, and Duration are required', 'err', ''); return; }

  CU.experience = CU.experience || [];
  const newExp = { title, company, duration, description: desc };
  if (idx >= 0) CU.experience[idx] = newExp;
  else CU.experience.push(newExp);

  if (supaClient) {
    const { error } = await supaClient.from('profiles').upsert({ id: CU.id, experience: CU.experience });
    if (error) { showToast('Database error', 'err', ''); return; }
  }
  DB.setCurrentUser(CU);
  showToast('Experience saved!', 'ok', '');
  renderF('profile');
}

function editExperience(idx) {
  const exp = (CU.experience || [])[idx];
  if (!exp) return;
  const form = document.getElementById('exp-form-container');
  if (form) form.style.display = 'block';
  document.getElementById('exp-title').value    = exp.title;
  document.getElementById('exp-company').value  = exp.company;
  document.getElementById('exp-duration').value = exp.duration;
  document.getElementById('exp-desc').value     = exp.description || '';
  document.getElementById('exp-edit-idx').value = idx;
}

async function deleteExperience(idx) {
  if (confirm('Remove this experience entry?')) {
    CU.experience = (CU.experience || []);
    CU.experience.splice(idx, 1);
    if (supaClient) await supaClient.from('profiles').upsert({ id: CU.id, experience: CU.experience });
    DB.setCurrentUser(CU);
    showToast('Experience deleted', 'info', '');
    renderF('profile');
  }
}

