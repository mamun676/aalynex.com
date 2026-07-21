// ═══════════════════════════════════════════════
//  CREATOR — dashboard, workflow, projects, profile, browse
// ═══════════════════════════════════════════════
function cPage(p, el) {
  document.querySelectorAll('#screen-creator .nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  closeSidebar('creator');
  currentCreatorPage = p;
  _pushNav({ view: 'creator', page: p });
  if (p !== 'new') activeManageProjectId = null;
  if (p === 'new') {
    if (!activeManageProjectId) { wfStep = 0; selContent = ''; selFreelancerIds = []; newProjectDraft = {}; newProjectFiles = []; }
  } else {
    activeManageProjectId = null;
  }

  renderC(p);
  if (supaClient && CU) {
    syncFromSupabase(CU).then(() => {
      if (p === 'chat') {
        const el = document.getElementById('chat-msgs-el');
        if (el && currentChatUserId) {
          const key = [CU.id, currentChatUserId].sort().join('_');
          el.innerHTML = renderMsgs(DB.messages()[key] || [], CU.id);
          el.scrollTop = el.scrollHeight;
        }
        updateChatSidebarPreviews();
      } else {
        renderC(p);
      }
    });
  }
}

function cPageMobile(p, el) {
  document.querySelectorAll('#c-bottom-nav .bn-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('#c-sidebar .nav-item').forEach(n => { n.classList.toggle('active', n.dataset.page === p); });
  currentCreatorPage = p;
  _pushNav({ view: 'creator', page: p });

  if (p === 'new' && !activeManageProjectId) { wfStep = 0; selContent = ''; selFreelancerIds = []; newProjectDraft = {}; newProjectFiles = []; }
  if (p !== 'new') activeManageProjectId = null;

  renderC(p);
  if (supaClient && CU) {
    syncFromSupabase(CU).then(() => {
      if (p === 'chat') {
        const el = document.getElementById('chat-msgs-el');
        if (el && currentChatUserId) {
          const key = [CU.id, currentChatUserId].sort().join('_');
          el.innerHTML = renderMsgs(DB.messages()[key] || [], CU.id);
          el.scrollTop = el.scrollHeight;
        }
        updateChatSidebarPreviews();
      } else {
        renderC(p);
      }
    });
  }
}

function renderC(p) {
  const m = document.getElementById('c-main');
  if      (p === 'home')     m.innerHTML = cHome();
  else if (p === 'new')      m.innerHTML = cNew();
  else if (p === 'projects') m.innerHTML = cProjects();
  else if (p === 'chat')     m.innerHTML = cChat();
  else if (p === 'payment')  m.innerHTML = cPayment();
  else if (p === 'rate')     m.innerHTML = cRate();
  else if (p === 'profile')  m.innerHTML = cProfile();
  else if (p === 'browse')   m.innerHTML = cBrowseFreelancers();

  if (p !== 'chat') {
    m.classList.remove('fade-in'); void m.offsetWidth; m.classList.add('fade-in');
  }
  checkFProfileCompletion();
}

function manageProject(pid) {
  const p = DB.projects().find(x => x.id === pid);
  if (!p) return;
  activeManageProjectId = pid;
  selFreelancerIds = p.invited_freelancers || [];
  selFreelancerName = DB.users().find(u => u.id === p.freelancerId)?.name;
  selContent = p.contentType;

  if (p.status === 'open') { showToast('Waiting for freelancers to accept...', 'info'); return; }
  if (p.status === 'ongoing' && !p.editedUploaded) wfStep = 5;
  else if (p.status === 'ongoing' && p.editedUploaded && !p.paid) wfStep = 7;
  else wfStep = 7;

  cPage('new', document.querySelector('[data-page="new"]'));
}

function cHome() {
  const projs  = DB.projects().filter(p => p.creatorId === CU.id);
  const active = projs.filter(p => p.status === 'ongoing').length;
  const done   = projs.filter(p => p.status === 'completed').length;
  const recent = projs.slice(-4).reverse();

  // ── Freelancer preview row (Top 6, last 7 days) ──
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allF = DB.users().filter(u => u.role === 'freelancer');
  const allP = DB.projects();

  const getFStats = (fid) => {
    const allComp     = allP.filter(p => p.freelancerId === fid && p.status === 'completed');
    const recentComp  = allComp.filter(p => p.createdAt >= sevenDaysAgo);
    const rated       = allComp.filter(p => p.rating && p.rating > 0);
    const recentRated = recentComp.filter(p => p.rating && p.rating > 0);
    const avg         = rated.length > 0 ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0;
    return {
      completedCount: allComp.length,
      recentCount:    recentComp.length,
      recentRated:    recentRated.length,
      avgRating:      avg
    };
  };

  const sortedF = [...allF]
    .sort((a, b) => {
      const sa = getFStats(a.id), sb = getFStats(b.id);
      const scoreA = (sa.recentRated * 2) + sa.recentCount + (sa.avgRating * 0.5);
      const scoreB = (sb.recentRated * 2) + sb.recentCount + (sb.avgRating * 0.5);
      return scoreB - scoreA;
    })
    .slice(0, 6);

  const fRow = sortedF.length > 0 ? `
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div>
          <span class="section-title" style="margin-bottom:0;">Top Freelancers</span>
          <span style="font-size:.7rem;color:var(--text-3);margin-left:8px;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:99px;font-weight:600;">This Week</span>
        </div>
        <button onclick="cPage('browse',document.querySelector('[data-page=browse]'))" class="btn btn-ghost btn-xs" style="font-size:.75rem;">See All →</button>
      </div>
      <div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:16px 14px;box-shadow:var(--shadow-sm);">
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;align-items:stretch;">
          ${sortedF.map(f => {
            const st = getFStats(f.id);
            const skills = (f.skills || []).slice(0, 2);
            const stars = st.avgRating > 0
              ? Array.from({ length: 5 }, (_, i) => `<span style="color:${i < Math.round(st.avgRating) ? '#D97706' : 'rgba(0,0,0,0.13)'}">★</span>`).join('')
              : `<span style="font-size:.6rem;color:var(--text-3);">New</span>`;
            const photo = (f.photo_url || f.photourl)
              ? `<img src="${f.photo_url || f.photourl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'">`
              : `<span style="font-family:'Outfit',sans-serif;font-weight:700;font-size:1rem;color:#fff;">${(f.avatar || f.name.charAt(0)).toUpperCase()}</span>`;
            return `
            <div style="min-width:140px;max-width:140px;display:flex;flex-direction:column;align-items:center;text-align:center;padding:14px 10px 12px;border-radius:12px;background:var(--bg2);border:1px solid var(--glass-border);flex-shrink:0;gap:5px;transition:border-color .2s,box-shadow .2s;"
            onmouseover="this.style.borderColor='rgba(224,92,42,.3)';this.style.boxShadow='0 4px 14px rgba(224,92,42,.1)'"
            onmouseout="this.style.borderColor='var(--glass-border)';this.style.boxShadow='none'">
              <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px solid var(--glass-border-strong);flex-shrink:0;margin-bottom:2px;">
                ${photo}
              </div>
              <div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:.78rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${f.name}</div>
              <div style="font-size:.65rem;font-weight:600;color:var(--accent2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${f.profession || 'Video Editor'}</div>
              <div style="font-size:.65rem;line-height:1;">${stars}</div>
              <div style="font-size:.6rem;color:var(--text-3);">${st.avgRating > 0 ? st.avgRating.toFixed(1) : 'New'} · ${st.completedCount} done</div>
              <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:3px;min-height:14px;">
                ${skills.map(s => `<span style="background:var(--accent2-soft);color:var(--accent2);border-radius:99px;font-size:.55rem;font-weight:600;padding:2px 6px;border:1px solid rgba(124,58,237,.15);">${s}</span>`).join('')}
              </div>
              <div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-top:4px;">
                <button class="btn btn-outline-f btn-xs full-btn" style="font-size:.65rem;padding:5px 6px;" onclick="event.stopPropagation();viewFreelancerPortfolio('${f.id}')">Portfolio</button>
                <button class="btn btn-primary btn-xs full-btn" style="font-size:.65rem;padding:5px 6px;" onclick="event.stopPropagation();openSendRequestModal('${f.id}','${f.name.replace(/'/g, "\\'")}')">Request →</button>
              </div>
            </div>`;
          }).join('')}
          <div style="min-width:52px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <button onclick="cPage('browse',document.querySelector('[data-page=browse]'))"
            style="width:40px;height:40px;border-radius:50%;background:var(--surface);border:1.5px solid rgba(224,92,42,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow-sm);transition:all .2s;flex-shrink:0;"
            onmouseover="this.style.background='var(--accent)';this.querySelector('svg').style.stroke='#fff'"
            onmouseout="this.style.background='var(--surface)';this.querySelector('svg').style.stroke='var(--accent)'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;transition:stroke .2s;"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>` : '';

  return `
  <div class="page-head"><h2>Dashboard</h2><p>Overview of your creator activity</p></div>
  <div class="cards-grid">
    <div class="mc a" style="cursor:pointer;" title="View ongoing projects" onclick="cPage('projects', document.querySelector('[data-page=projects]')); setTimeout(()=>filterProjects('ongoing'), 150)">
      <div class="label">Active Projects</div><div class="value">${active}</div><div class="sub">Currently ongoing</div>
    </div>
    <div class="mc g" style="cursor:pointer;" title="View completed projects" onclick="cPage('projects', document.querySelector('[data-page=projects]')); setTimeout(()=>filterProjects('completed'), 150)">
      <div class="label">Completed</div><div class="value">${done}</div><div class="sub">All time</div>
    </div>
    <div class="mc b" style="cursor:pointer;" title="View all projects" onclick="cPage('projects', document.querySelector('[data-page=projects]')); setTimeout(()=>filterProjects('all'), 150)">
      <div class="label">Total Projects</div><div class="value">${projs.length}</div><div class="sub">Ever posted</div>
    </div>
    <div class="mc p" style="cursor:pointer;background:linear-gradient(135deg,rgba(124,58,237,.1),rgba(29,78,216,.08));border:1.5px solid rgba(124,58,237,.25);position:relative;overflow:hidden;" onclick="cPage('browse',document.querySelector('[data-page=browse]'))">
      <div style="position:absolute;top:-18px;right:-18px;width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(29,78,216,.1));pointer-events:none;"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent2),var(--blue));display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(124,58,237,.3);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div class="label" style="margin:0;color:var(--accent2);font-weight:600;">Browse Editors</div>
      </div>
      <div class="value" style="font-size:1rem;font-family:'DM Sans',sans-serif;font-weight:500;color:var(--text);">Find &amp; Hire</div>
      <div class="sub" style="color:var(--accent2);font-weight:500;margin-top:2px;">Top talent available →</div>
    </div>
  </div>${fRow}
  <div class="section-title">Recent Projects</div>
  <div class="project-list">
    ${recent.length
      ? recent.map(p => `
          <div class="pc" style="cursor:pointer;" onclick="manageProject('${p.id}')">
            <div class="pico">${contentIconSvg(p.contentType)}</div>
            <div class="pinfo">
              <div class="ptitle">${p.title}</div>
              <div class="pmeta">${p.freelancerId ? 'Editor assigned' : 'Waiting for acceptance'} · ₹${fmt(p.budget)}</div>
            </div>
            <div class="pstatus ${statusClass(p.status)}">${statusLabel(p.status)}</div>
          </div>`).join('')
      : '<div style="color:var(--text-3);font-size:.85rem;padding:16px 0;">No projects yet — post your first one!</div>'}
  </div>
  <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
    <button class="btn btn-primary" onclick="activeManageProjectId=null; cPage('new',null)">+ Post New Project</button>
    <button class="btn btn-ghost" onclick="cPage('projects',null)">View All Projects &rarr;</button>
  </div>`;
}
async function viewFreelancerPortfolio(freelancerId) {
  document.getElementById('modal-title').textContent = 'Freelancer Portfolio';
  document.getElementById('modal-body').innerHTML = '<div style="padding:30px 10px;text-align:center;color:var(--text-3);font-size:.85rem;">Loading profile data...</div>';
  document.getElementById('modal-confirm').textContent = 'Close';
  document.getElementById('modal-confirm').onclick = () => { closeModal(); };
  document.getElementById('modal-bg').classList.add('show');

  if (!supaClient) {
    showToast('Database connection required to view portfolio.', 'err', '');
    closeModal();
    return;
  }

  try {
    const { data: profile, error } = await supaClient.from('profiles').select('*').eq('id', freelancerId).single();
    if (error || !profile) throw error;

    const photoHtml = profile.photo_url
      ? `<img src="${profile.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : (profile.avatar || profile.name.charAt(0).toUpperCase());

    const bio = profile.bio || 'Available for freelance video editing projects.';
    const skills = profile.skills || [];
    const links = profile.portfolio_links || {};
    const exp = profile.experience || [];

    // Dynamic rating & completed projects (same logic as freelancer card)
    const allProjects = DB.projects();
    const completedProjs = allProjects.filter(p => p.freelancerId === freelancerId && p.status === 'completed');
    const ratedProjs = completedProjs.filter(p => p.rating && p.rating > 0);
    const avgRating = ratedProjs.length > 0
      ? (ratedProjs.reduce((s, p) => s + p.rating, 0) / ratedProjs.length).toFixed(1)
      : null;
    const completedCount = completedProjs.length;
    const reviewsCount = ratedProjs.length;

    let html = `
      <div style="display:flex;flex-direction:column;gap:18px;">
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;">
          <div class="f-avatar" style="width:80px;height:80px;font-size:2rem;margin:0;${profile.photo_url ? 'background:transparent;' : ''}">
            ${photoHtml}
          </div>
          <div>
            <div style="font-family:'Outfit',sans-serif;font-size:1.2rem;font-weight:700;color:var(--text);">${profile.name}</div>
            <div style="font-size:.85rem;color:var(--accent2);font-weight:500;">${profile.profession || 'Editor'}</div>
          </div>
          <div style="color:var(--yellow);font-size:.8rem;display:flex;align-items:center;gap:6px;">
            ${avgRating
              ? Array.from({ length: 5 }, (_, i) => `<span style="color:${i < Math.round(avgRating) ? 'var(--yellow)' : 'rgba(0,0,0,0.15)'}">&#9733;</span>`).join('')
              : `<span style="color:rgba(0,0,0,0.15)">&#9733;&#9733;&#9733;&#9733;&#9733;</span>`}
            <span style="color:var(--text-3);">${avgRating ? `(${avgRating} &bull; ${completedCount} Projects)` : `(New &bull; ${completedCount} Projects)`}</span>
          </div>
        </div>
        <div style="background:var(--bg2);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);">
          <div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">About</div>
          <div style="font-size:.82rem;color:var(--text-2);line-height:1.5;">${bio}</div>
        </div>
        <div>
          <div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Tools &amp; Skills</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">${skills.length > 0 ? skills.map(s => `<span class="tag pu" style="font-size:.72rem;padding:5px 12px;">${s}</span>`).join('') : '<span style="font-size:.8rem;color:var(--text-3);">No skills added</span>'}</div>
        </div>
        <div>
          <div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Experience</div>
          <div style="display:flex;flex-direction:column;gap:10px;">${exp.length > 0 ? exp.map(e => `
            <div style="border-left:2px solid var(--accent-soft);padding-left:12px;">
              <div style="font-weight:600;font-size:.85rem;color:var(--text);">${e.title}</div>
              <div style="font-size:.75rem;color:var(--text-3);margin-top:2px;">${e.company} &middot; ${e.duration}</div>
            </div>`).join('') : '<span style="font-size:.8rem;color:var(--text-3);">No experience added</span>'}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;border-top:1px solid var(--glass-border);padding-top:16px;">
          ${links.instagram ? `<a href="${links.instagram}" target="_blank" class="btn btn-ghost btn-xs" style="text-decoration:none;">Instagram</a>` : ''}
          ${links.youtube ? `<a href="${links.youtube}" target="_blank" class="btn btn-ghost btn-xs" style="text-decoration:none;">YouTube</a>` : ''}
          ${links.video_link ? `<a href="${links.video_link}" target="_blank" class="btn btn-ghost btn-xs" style="text-decoration:none;">Work Video</a>` : ''}
          ${profile.resume_url ? `<a href="${profile.resume_url}" target="_blank" class="btn btn-primary btn-xs" style="text-decoration:none;">View Resume</a>` : ''}
        </div>
      </div>`;

    document.getElementById('modal-title').textContent = 'Freelancer Profile';
    document.getElementById('modal-body').innerHTML = html;

  } catch (e) {
    showToast('Failed to load portfolio details.', 'err', '');
    closeModal();
  }
}

function cNew() {
  const steps = ['Details', 'Content', 'Deadline', 'Upload Files', 'Freelancer', 'Chat', 'Review', 'Payment'];

  const stepper = steps.map((s, i) => `
    <div class="step">
      <div class="step-dot ${wfStep === i ? 'active' : (wfStep > i ? 'done' : '')}">
        ${wfStep > i ? '✓' : (i + 1)}
      </div>${i < steps.length - 1 ? `<div class="step-line ${wfStep > i ? 'done' : ''}"></div>` : ''}
    </div>`).join('');

  const html = `
    <div class="page-head"><h2>${activeManageProjectId ? 'Manage Project' : 'Post a New Project'}</h2></div>
    <div class="wf-stepper">${stepper}</div>
    <div class="wf-body" id="wf-body"></div>`;

  setTimeout(async () => {
    const el = document.getElementById("wf-body");
    if (el) {
      el.innerHTML = await wfContent();
      if (wfStep === 3) renderFileListPreview();
    }
  }, 0);

  return html;
}

async function wfContent() {
  if (wfStep === 0) return `
    <h3>Project Details</h3>
    <div class="fg"><label>Project Title </label><input id="wf-title" value="${newProjectDraft.title || ''}" placeholder="e.g. YouTube Vlog Edit – Travel Series EP5"/></div>
    <div class="fg"><label>Description</label><textarea id="wf-desc" placeholder="Describe what you need edited…">${newProjectDraft.desc || ''}</textarea></div>
    <div class="fg"><label>Budget (₹) </label><input id="wf-budget" type="number" value="${newProjectDraft.budget || ''}" placeholder="200" min="1"/></div>
    <button class="btn btn-primary" onclick="wfN()">Next &rarr;</button>`;

  if (wfStep === 1) return `
    <h3>Choose Content Type</h3>
    <div class="ct-list" style="margin-bottom:18px;">${['YouTube Long-form', 'Instagram Reel', 'YouTube Shorts', 'TikTok', 'LinkedIn Video', 'Brand Video', 'Documentary', 'Podcast Edit']
      .map(t => `<div class="ct-pill${t === selContent ? ' active' : ''}" onclick="selCT('${t}')">${t}</div>`).join('')}</div>
    ${selContent ? `<div class="alert alert-s">Selected: <strong>${selContent}</strong></div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-ghost" onclick="wfB()">&larr; Back</button>
      <button class="btn btn-primary" onclick="wfN()">Next &rarr;</button>
    </div>`;

  if (wfStep === 2) return `
    <h3>Set Deadline &amp; Priority</h3>
    <div class="fg"><label>Deadline Date *</label><input type="date" id="wf-deadline" value="${newProjectDraft.deadline || ''}" min="${new Date().toISOString().split('T')[0]}"/></div>
    <div class="fg"><label>Priority Level</label>
      <select id="wf-priority">
        <option ${newProjectDraft.priority === 'Normal' ? 'selected' : ''}>Normal</option>
        <option ${newProjectDraft.priority === 'Urgent (+20% budget)' ? 'selected' : ''}>Urgent (+20% budget)</option>
        <option ${newProjectDraft.priority === 'Flexible' ? 'selected' : ''}>Flexible</option>
      </select>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-ghost" onclick="wfB()">&larr; Back</button>
      <button class="btn btn-primary" onclick="wfN()">Next &rarr;</button>
    </div>`;

  if (wfStep === 3) return `
    <h3>Upload Project Files</h3>
    <p style="color:var(--text-3);font-size:.8rem;margin-bottom:14px;">Upload all videos, images, and music for this project. Editors will see this before accepting.</p>
    <label class="upload-area-lg" for="multi-file-input" id="multi-drop-zone">
      <div class="upload-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
      </div>
      <div class="upload-label">Drag & drop files or click to select</div>
      <div class="upload-sub">Videos, Images, Audio</div>
      <input type="file" id="multi-file-input" multiple accept="video/*,audio/*,image/*" style="display:none;" onchange="handleMultiFileUpload(this)"/>
    </label>
    <div id="file-list-preview" style="display:flex;flex-direction:column;gap:8px;margin-top:12px;"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
      <button class="btn btn-ghost" onclick="wfB()">&larr; Back</button>
      <button class="btn btn-primary" onclick="wfN()">Next &rarr;</button>
    </div>`;

  if (wfStep === 4) {
    let editors = [];
    if (supaClient) {
      try {
        const { data, error } = await supaClient.from("profiles").select("*").eq("role", "freelancer");
        if (!error && data) editors = data;
      } catch (e) {}
    }
    if (!editors || editors.length === 0) editors = DB.users().filter(u => u.role === "freelancer");

    // Dynamic rating & completed projects per freelancer
    const allProjects = DB.projects();
    const getFreelancerStats = (fid) => {
      const completed = allProjects.filter(p => p.freelancerId === fid && p.status === 'completed');
      const rated = completed.filter(p => p.rating && p.rating > 0);
      const avgRating = rated.length > 0
        ? (rated.reduce((s, p) => s + p.rating, 0) / rated.length).toFixed(1)
        : null;
      return { completedCount: completed.length, avgRating };
    };

    return `
    <h3>Choose Editors to Request</h3>
    <p style="color:var(--text-3);font-size:.8rem;margin-bottom:14px;">Select multiple freelancers. First to accept gets the job!</p>
    <div class="f-grid">
      ${(editors && editors.length > 0) ? editors.map(f => {
        const stats = getFreelancerStats(f.id);
        const ratingDisplay = stats.avgRating ? stats.avgRating : 'New';
        const starsHtml = stats.avgRating
          ? Array.from({ length: 5 }, (_, i) => `<span style="color:${i < Math.round(stats.avgRating) ? 'var(--yellow)' : 'rgba(0,0,0,0.12)'}">&#9733;</span>`).join('')
          : `<span style="color:var(--text-3);font-size:.65rem;">No ratings yet</span>`;
        return `
        <div class="f-card${selFreelancerIds.includes(f.id) ? ' sel' : ''}" onclick="selFL('${f.id}','${f.name}')">
          <div class="f-avatar" style="${f.photo_url ? 'background:transparent;' : ''}">${f.photo_url ? `<img src="${f.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (f.avatar || 'F')}</div>
          <div class="f-name">${escapeHtml(f.name)}</div>
          <div class="stars">${starsHtml}</div>
          <div class="f-rate">${ratingDisplay} &middot; ${stats.completedCount} Projects</div>
          <div class="f-spec">${escapeHtml(f.profession || 'Editor')}</div>
          <div style="margin-top:10px;">
            <button class="btn btn-outline-f btn-xs full-btn" onclick="event.stopPropagation(); viewFreelancerPortfolio('${f.id}')">View Portfolio</button>
          </div>
        </div>`;
      }).join('') : `<div style="color:var(--text-3);font-size:.82rem;grid-column:1/-1;padding:16px 0;">No editors available.</div>`}
    </div><br/>
    ${selFreelancerIds.length > 0 ? `<div class="alert alert-s">Selected: <strong>${selFreelancerIds.length} Editors</strong></div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-ghost" onclick="wfB()">&larr; Back</button>
      <button class="btn btn-primary" onclick="wfN()">Send Requests &amp; Post &rarr;</button>
    </div>`;
  }

  const proj = DB.projects().find(x => x.id === activeManageProjectId);
  const flId = proj ? proj.freelancerId : null;
  const isCompleted = proj ? (proj.status === 'completed' || proj.paid) : false;

  if (wfStep === 5) {
    // Subscribe to realtime for this chat
    setTimeout(async () => {
      if (flId && supaClient) {
        const convId = await getOrCreateConversation(CU.id, flId);
        if (convId) await subscribeToConversation(convId, flId);
      }
    });
    return `
    <h3>Chat with ${selFreelancerName || 'Editor'}</h3>
    ${buildChat(CU.id, flId || '')}
    ${!isCompleted ? `
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">

    </div>` : ''}`;
  }

  if (wfStep === 6) {
    if (proj && !proj.editedUploaded) {
      return `
        <h3>Receive & Review Edited Video</h3>
        <div class="alert alert-i">Waiting for <strong>${selFreelancerName || 'Your editor'}</strong> to upload the final edited video. You will be notified in chat once it's ready.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="wfB()">&larr; Back</button>
        </div>`;
    }
    return `
      <h3>Receive &amp; Review Edited Video</h3>
      <div class="alert alert-s"><strong>${selFreelancerName || 'Your editor'}</strong> has uploaded the edited video!</div>
      <div style="background:var(--bg2);border:1px solid var(--glass-border);border-radius:var(--radius);padding:16px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div style="font-size:1.8rem;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>
          </div>
          <div>
            <div style="font-weight:500;font-size:.88rem;color:var(--text);">Final_Delivered_Video</div>
            <div style="color:var(--text-3);font-size:.75rem;">Requires Payment to Download</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="downloadEditedVideo('${activeManageProjectId}')">Download</button>
        </div>
        <div class="pb"><div class="pf" style="width:100%;"></div></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="wfN()">Approve &amp; Pay &rarr;</button>
      </div>`;
  }

  if (wfStep === 7) {
    const p = DB.projects().find(x => x.id === activeManageProjectId);
    const budget = p ? p.budget : 0;
    const fee = Math.round(budget * 0.03);
    const total = budget + fee;
    const eName = selFreelancerName || (p ? DB.users().find(u => u.id === p.freelancerId)?.name : 'Editor');
    const cType = selContent || (p ? p.contentType : 'Video');

    const showPayment = p && p.editedUploaded && !p.paid;
    const showRating  = p && p.paid && (!p.rating || p.rating === 0);
    const showDone    = p && p.paid && p.rating > 0;

    if (showDone) {
      return `
  <h3>Project Complete</h3>
  <div class="alert alert-s" style="margin-bottom:16px;display:flex;align-items:center;gap:10px;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--green)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    Payment done and rating submitted. This project is fully complete!
  </div>
  <div style="background:linear-gradient(135deg,rgba(224,92,42,.06),rgba(124,58,237,.05));border:1px solid rgba(224,92,42,.2);border-radius:var(--radius);padding:20px 22px;margin-bottom:16px;text-align:center;">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div style="font-family:Outfit,sans-serif;font-size:1.15rem;font-weight:700;color:var(--text);letter-spacing:-.3px;">Your video is ready.</div>
    </div>
    <div style="font-size:.85rem;color:var(--text-2);line-height:1.75;max-width:420px;margin:0 auto 16px;">
      The final edited video is now available in your <strong style="color:var(--accent)">Messages</strong> section.
      Head over to the chat to download your finished project.
      Thank you for trusting <strong style="color:var(--accent)">Aalynex</strong> — we hope the result exceeds your expectations.
    </div>
    <button class="btn btn-primary" onclick="cPage('chat', null)" style="border-radius:999px;padding:10px 26px;display:inline-flex;align-items:center;gap:8px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      Go to Chat &amp; Download
    </button>
  </div>
  <div class="det-card">
    <div class="info-row"><span class="key">Editor</span><span>${eName}</span></div>
    <div class="info-row"><span class="key">Your Rating</span><span>${'&#9733;'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)}</span></div>
    ${p.review ? `<div class="info-row"><span class="key">Your Review</span><span style="font-style:italic;">"${p.review}"</span></div>` : ''}
  </div>`;
    }

    return `
    <h3>${showPayment ? 'Complete Payment' : ''}${showPayment && showRating ? ' &amp; ' : ''}${showRating ? 'Rate Editor' : ''}</h3>
    <div class="two-col">
      ${showPayment ? `
      <div>
        <div class="section-title">Payment Summary</div>
        <div class="det-card" style="margin-bottom:14px;">
          <div class="info-row"><span class="key">Editor</span><span>${eName}</span></div>
          <div class="info-row"><span class="key">Content Type</span><span>${cType}</span></div>
          <div class="info-row"><span class="key">Base Amount</span><span id="pay-base">₹${fmt(budget)}</span></div>
          <div class="info-row"><span class="key">Transaction Charge (3%)</span><span id="pay-fee">₹${fmt(fee)}</span></div>
          <div class="info-row" style="font-weight:600;"><span style="color:var(--accent);">Total</span><span id="pay-total" style="color:var(--accent);">₹${fmt(total)}</span></div>
        </div>
        <div class="fg"><label>Payment Method</label>
          <select><option>UPI</option><option>Net Banking</option><option>Credit/Debit Card</option><option>Wallet</option></select>
        </div>
        <button class="btn btn-green-btn full-btn" onclick="completePayment()">Pay Now &rarr;</button>
      </div>` : ''}
      ${showRating ? `
      <div>
        <div class="section-title">Rate ${eName}</div>
        <div class="det-card">
          <p style="margin-bottom:10px;">How was your experience?</p>
          <div class="star-rating" id="sr1">${[1, 2, 3, 4, 5].map(n => `<span onclick="rateStar('sr1',${n})">&#9733;</span>`).join('')}</div>
          <div class="fg" style="margin-top:10px;"><label>Write a Review</label><input id="review-text" placeholder="Amazing work, delivered on time!"/></div>
          <button class="btn btn-primary full-btn" onclick="submitReview()">Submit Review</button>
          <button class="btn btn-ghost full-btn" style="margin-top:8px;" onclick="downloadEditedVideo('${p.id}')">⬇ Download Final Video</button>
        </div>
      </div>` : ''}
      ${!showPayment && !showRating && !showDone ? `
      <div style="grid-column:1/-1;">
        <div class="alert alert-i">Waiting for the editor to upload the final video before payment.</div>
      </div>` : ''}
    </div>`;
  }

  return '';
}

async function downloadEditedVideo(projectId) {
  const p = DB.projects().find(x => x.id === projectId);
  if (!p) return;
  if (!p.paid) {
    showToast('❌ You must Approve & Pay before downloading the final video.', 'err', '');
  } else {
    const key = [p.creatorId, p.freelancerId].sort().join('_');
    const vids = (DB.messages()[key] || []).filter(m => m.file_url && String(m.from) === String(p.freelancerId));
    const finalMsg = [...vids].reverse().find(m => m.text && m.text.includes('Final Delivery')) || vids[vids.length - 1];
    if (!finalMsg) { showToast('Final video chat me nahi mila.', 'err', ''); return; }
    let url = finalMsg.file_url;
    if (typeof isS3Key === 'function' && isS3Key(url)) { try { url = await s3GetUrl(url); } catch (e) { url = null; } }
    if (!url) { showToast('Video link load nahi hua, dobara try karo.', 'err', ''); return; }
    showToast('✅ Download started', 'ok', '');
    const a = document.createElement('a');
    a.href = url; a.target = '_blank';
    a.download = String(finalMsg.text || 'final-video').replace(/[^a-zA-Z0-9.-]/g, '_');
    document.body.appendChild(a); a.click(); a.remove();
  }
}
function wfN() {
  if (wfStep === 0) {
    const t = document.getElementById('wf-title')?.value?.trim();
    const b = document.getElementById('wf-budget')?.value;
    const desc = document.getElementById('wf-desc')?.value || '';
    if (!t) { showToast('Please enter a project title', 'err', ''); return; }
    if (!b || b < 1) { showToast('Please enter a valid budget', 'err', ''); return; }

    newProjectDraft.title = t;
    newProjectDraft.budget = parseInt(b);
    newProjectDraft.desc = desc;
  }

  if (wfStep === 1 && !selContent) { showToast('Please select a content type', 'err', ''); return; }

  if (wfStep === 2) {
    const deadlineVal = document.getElementById('wf-deadline')?.value;
    const priorityVal = document.getElementById('wf-priority')?.value || 'Normal';
    if (!deadlineVal) { showToast('Please select a deadline', 'err', ''); return; }

    newProjectDraft.deadline = deadlineVal;
    newProjectDraft.priority = priorityVal;
  }

  // Upload Step (3) -> Just moves forward.

  if (wfStep === 4) { // Choose Editors Step
    if (selFreelancerIds.length === 0) { showToast('Select at least one editor', 'err', ''); return; }

    // ── DUPLICATE-SUBMIT GUARD ──
    if (_wfPosting) return;
    _wfPosting = true;

    // Disable the real post button immediately so the user sees feedback
    const postBtn = document.querySelector('#wf-body .btn-primary');
    if (postBtn) { postBtn.disabled = true; postBtn.textContent = 'Posting…'; }

    const newP = {
      id: pid(), creatorId: CU.id,
      title: newProjectDraft.title,
      description: newProjectDraft.desc,
      budget: newProjectDraft.budget,
      contentType: selContent,
      deadline: newProjectDraft.deadline,
      priority: newProjectDraft.priority,
      freelancerId: null,
      invited_freelancers: selFreelancerIds, status: 'open', rawShared: true, // Auto rawShared!
      editedUploaded: false, paid: false, rating: 0, review: '', createdAt: Date.now()
    };

    const projs = DB.projects(); projs.push(newP); DB.saveProjects(projs);

    // Attachments tracking
    const newAttachments = newProjectFiles.map(f => ({
      id: uid(), projectId: newP.id, name: f.name, type: f.type, size: f.size, duration: f.duration
    }));
    const atts = DB.attachments() || [];
    DB.saveAttachments([...atts, ...newAttachments]);

    if (supaClient) {
      supaClient.from('projects').insert({
        id: newP.id, creator_id: CU.id, freelancer_id: null,
        invited_freelancers: selFreelancerIds,
        title: newP.title,
        description: newP.description,
        budget: newP.budget,
        content_type: newP.contentType,
        deadline: newP.deadline,
        priority: newP.priority,
        status: 'open',
        raw_shared: true, edited_uploaded: false, paid: false
      }).then(async ({ error }) => {
        if (error) {
          showToast('DB Error: ' + error.message, 'err', '');
          const revertedProjs = DB.projects().filter(x => x.id !== newP.id);
          DB.saveProjects(revertedProjs);
          _wfPosting = false;
          const postBtnErr = document.querySelector('#wf-body .btn-primary');
          if (postBtnErr) { postBtnErr.disabled = false; postBtnErr.textContent = 'Send Requests & Post →'; }
        } else {
          const newProjectFiles_copy = [...newProjectFiles];

          if (newProjectFiles_copy.length === 0) {
            // No files to upload — finish immediately
            showToast('Project Requests Sent! Waiting for a freelancer.', 'ok', '🎉');
            activeManageProjectId = null;
            newProjectFiles = [];
            _wfPosting = false;
            cPage('projects', document.querySelector('[data-page=projects]'));
            return;
          }

          // Show uploading state and wait for every file before finishing
          showToast('Uploading files, please wait…', 'info', '');

          let failedFile = null;
          for (const f of newProjectFiles_copy) {
            try {
              const s3Key = await s3Upload(f.file, 'projects');
              const { error: attErr } = await supaClient.from('project_attachments').insert({
                project_id: newP.id,
                creator_id: CU.id,
                file_name: f.name,
                file_url: s3Key,
                file_type: f.type,
                file_size: f.size,
                duration: f.duration
              });
              if (attErr) throw attErr;
            } catch (e) {
              failedFile = f.name;
              break;
            }
          }

          if (failedFile) {
            // At least one file failed — rollback the whole project so the
            // freelancer never sees a project with missing attachments.
            showToast('File upload failed: ' + failedFile + '. Please try again.', 'err', '');
            try { await supaClient.from('projects').delete().eq('id', newP.id); } catch (e) {}
            const revertedProjs = DB.projects().filter(x => x.id !== newP.id);
            DB.saveProjects(revertedProjs);
            const revertedAtts = (DB.attachments() || []).filter(a => a.projectId !== newP.id);
            DB.saveAttachments(revertedAtts);
            _wfPosting = false;
            const postBtnFail = document.querySelector('#wf-body .btn-primary');
            if (postBtnFail) { postBtnFail.disabled = false; postBtnFail.textContent = 'Send Requests & Post →'; }
            // newProjectFiles is intentionally NOT cleared so the user can retry
          } else {
            // Every file uploaded and every attachment record saved — success
            showToast('Project Requests Sent! Waiting for a freelancer.', 'ok', '🎉');
            for (const fid of selFreelancerIds) {
              sendProjectNotificationEmail(
                fid, newP.title, newP.budget, newP.deadline, newP.contentType
              );
            }
            activeManageProjectId = null;
            newProjectFiles = [];
            _wfPosting = false;
            cPage('projects', document.querySelector('[data-page=projects]'));
          }
        }
      });
      return;
    }

    // Local (no supaClient) path
    showToast('Project Requests Sent locally.', 'ok', '');
    activeManageProjectId = null;
    newProjectFiles = [];
    _wfPosting = false;
    cPage('projects', document.querySelector('[data-page="projects"]'));
    return;
  }

  if (wfStep === 5) { // Chat
    const p = DB.projects().find(x => x.id === activeManageProjectId);
    if (p && p.editedUploaded) wfStep = 6;
  } else {
    wfStep = Math.min(wfStep + 1, 7);
  }

  document.getElementById('c-main').innerHTML = cNew();

  if (wfStep === 7) {
    setTimeout(() => {
      const p = DB.projects().find(x => x.id === activeManageProjectId);
      if (!p) return;
      const fee = Math.round(p.budget * 0.03);
      document.getElementById('pay-base').textContent = '₹' + fmt(p.budget);
      document.getElementById('pay-fee').textContent = '₹' + fmt(fee);
      document.getElementById('pay-total').textContent = '₹' + fmt(p.budget + fee);
    }, 50);
  }
}

function wfB() {
  if (wfStep === 6) {
    wfStep = 5;
  } else {
    wfStep = Math.max(wfStep - 1, 0);
  }
  document.getElementById('c-main').innerHTML = cNew();
}
function selCT(t) { selContent = t; document.getElementById('c-main').innerHTML = cNew(); }

function selFL(id, name) {
  if (selFreelancerIds.includes(id)) {
    selFreelancerIds = selFreelancerIds.filter(x => x !== id);
  } else {
    selFreelancerIds.push(id);
  }
  document.getElementById('c-main').innerHTML = cNew();
}

function cProjects() {
  const projs = DB.projects().filter(p => p.creatorId === CU.id);
  return `
  <div class="page-head"><h2>My Projects</h2><p>All ${projs.length} projects you've posted</p></div>
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
    ${['All', 'Open', 'Ongoing', 'Completed'].map(f => `<button class="btn btn-ghost btn-sm" onclick="filterProjects('${f.toLowerCase()}')">${f}</button>`).join('')}
  </div>
  <div class="project-list" id="proj-list">
    ${projs.length
      ? projs.slice().reverse().map(p => `
          <div class="pc" style="cursor:pointer;" onclick="manageProject('${p.id}')">
            <div class="pico">${contentIconSvg(p.contentType)}</div>
            <div class="pinfo">
              <div class="ptitle">${p.title}</div>
              <div class="pmeta">₹${fmt(p.budget)} · Due ${fmtDate(p.deadline)} · ${p.contentType}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
              <div class="pstatus ${statusClass(p.status)}">
                ${p.status === 'open' ? '🔒 Waiting' : statusLabel(p.status)}
              </div>
              ${p.status !== 'open' ? `<button class="btn btn-primary btn-xs">Manage</button>` : ''}
            </div>
          </div>`).join('')
      : '<div style="color:var(--text-3);font-size:.85rem;padding:20px 0;text-align:center;">No projects yet. <a style="color:var(--accent);cursor:pointer;" onclick="cPage(\'new\',null)">Post your first →</a></div>'}
  </div>`;
}

function filterProjects(f) {
  const projs    = DB.projects().filter(p => p.creatorId === CU.id);
  const filtered = f === 'all' ? projs : projs.filter(p => p.status === f);
  document.getElementById('proj-list').innerHTML = filtered.length
    ? filtered.slice().reverse().map(p => `
        <div class="pc" style="cursor:pointer;" onclick="manageProject('${p.id}')">
          <div class="pico">${contentIconSvg(p.contentType)}</div>
          <div class="pinfo">
            <div class="ptitle">${p.title}</div>
            <div class="pmeta">₹${fmt(p.budget)} · ${p.contentType}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <div class="pstatus ${statusClass(p.status)}">${p.status === 'open' ? '🔒 Waiting' : statusLabel(p.status)}</div>
            ${p.status !== 'open' ? `<button class="btn btn-primary btn-xs">Manage</button>` : ''}
          </div>
        </div>`).join('')
    : '<div style="color:var(--text-3);font-size:.85rem;padding:20px 0;">No projects in this category.</div>';
}

function cChat() {
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

  return `<div class="page-head"><h2>Messages</h2><p>Chat with your editors</p></div>${buildChat(CU.id, defaultOther)}`;
}

function cPayment() {
  const projs   = DB.projects().filter(p => p.creatorId === CU.id);
  const paid    = projs.filter(p => p.paid).reduce((s, p) => s + p.budget, 0);
  const pending = projs.filter(p => !p.paid && p.status === 'completed').reduce((s, p) => s + p.budget, 0);
  return `
  <div class="page-head"><h2>Payments</h2></div>
  <div class="cards-grid">
    <div class="mc a"><div class="label">Pending</div><div class="value">₹${fmt(pending)}</div></div>
    <div class="mc g"><div class="label">Total Paid</div><div class="value">₹${fmt(paid)}</div></div>
    <div class="mc"><div class="label">Projects</div><div class="value">${projs.length}</div></div>
  </div>
  <div class="section-title">Transactions</div>
  <div class="project-list">
    ${projs.length
      ? projs.map(p => `
          <div class="pc">
            <div class="pico"><svg class="pico-icon" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
            <div class="pinfo"><div class="ptitle">${p.title}</div><div class="pmeta">₹${fmt(p.budget)} · ${fmtDate(p.createdAt)}</div></div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="pstatus ${p.paid ? 's-co' : 's-pe'}">${p.paid ? 'Paid' : 'Pending'}</div>
              ${!p.paid && p.status === 'completed' ? `<button class="btn btn-green-btn btn-xs" onclick="manageProject('${p.id}')">Pay Now</button>` : ''}
            </div>
          </div>`).join('')
      : '<div style="color:var(--text-3);font-size:.85rem;padding:20px 0;">No transactions yet.</div>'}
  </div>`;
}

async function submitReview() {
  const rating = document.querySelectorAll('#sr1 span.lit').length;
  if (!rating) { showToast('Please select a star rating first', 'err', ''); return; }
  const review = document.getElementById('review-text')?.value || '';
  const pid = activeManageProjectId;
  if (!pid) { showToast('No active project found', 'err', ''); return; }
  const projs = DB.projects(), p = projs.find(x => x.id === pid);
  if (p) {
    p.rating = rating;
    p.review = review;
    DB.saveProjects(projs);
    if (supaClient) {
      const { error } = await supaClient.from('projects').update({ rating: rating, review: review }).eq('id', pid);
      if (error) { showToast('Review saved locally but DB sync failed: ' + error.message, 'warn', ''); return; }
    }
    showToast(`⭐ Review submitted! ${rating} stars`, 'ok', '');
    // Re-render so rating UI disappears and "Done" state shows
    wfStep = 7;
    renderC('new');
  }
}

function cRate() {
  const projs = DB.projects().filter(p => p.creatorId === CU.id && p.status === 'completed' && p.rating === 0);
  return `
  <div class="page-head"><h2>Rate Freelancers</h2></div>
  ${projs.length
    ? projs.map(p => `
        <div class="det-card">
          <h4>${p.title}</h4><p>Completed &middot; ₹${fmt(p.budget)}</p>
          <div class="star-rating" id="sr-${p.id}">${[1, 2, 3, 4, 5].map(n => `<span onclick="rateStar('sr-${p.id}',${n})">★</span>`).join('')}</div>
          <div class="fg" style="margin-top:10px;"><label>Write a Review</label><input id="rev-${p.id}" placeholder="Great work!"/></div>
          <button class="btn btn-primary btn-sm" onclick="saveRating('${p.id}')">Submit Rating</button>
        </div>`).join('')
    : '<div class="alert alert-i">You\'ve rated all completed projects!</div>'}`;
}

async function saveRating(pid) {
  const rating = document.querySelectorAll(`#sr-${pid} span.lit`).length;
  if (!rating) { showToast('Please select a star rating', 'err', ''); return; }
  const review = document.getElementById('rev-' + pid)?.value || '';
  const projs = DB.projects(), p = projs.find(x => x.id === pid);
  if (p) {
    p.rating = rating;
    p.review = review;
    DB.saveProjects(projs);
    if (supaClient) {
      const { error } = await supaClient.from('projects').update({ rating: rating, review: review }).eq('id', pid);
      if (error) { showToast('Rating saved locally but DB sync failed: ' + error.message, 'warn', ''); }
      else { showToast(`Rating submitted! ${rating} stars`, 'ok', ''); }
    } else {
      showToast(`Rating submitted! ${rating} stars`, 'ok', '');
    }
  }
  renderC('rate');
}

function cProfile() {
  const u = CU;
  const links = u.portfolio_links || {};

  return `
  <div class="page-head"><h2>My Profile</h2></div>
  <div class="two-col">
    <div>
      <div class="det-card">
        <h4>Personal Info</h4>
        <div class="fg"><label>Full Name</label><input id="prof-name" value="${u.name}"/></div>
        <div class="fg"><label>Email</label><input value="${u.email}" disabled style="opacity:.5;"/></div>
        <div class="fg"><label>Phone</label><input id="prof-phone" value="${u.phone || ''}"/></div>
        <div class="fg"><label>Primary Platform</label>
          <select id="prof-platform">${['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'Multiple'].map(p => `<option ${u.platform === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
        </div>
        <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
      </div>
      <div class="det-card">
        <h4>Account Stats</h4>${[['Projects Posted', DB.projects().filter(p => p.creatorId === CU.id).length],
          ['Completed', DB.projects().filter(p => p.creatorId === CU.id && p.status === 'completed').length],
          ['Member Since', new Date(u.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })],
          ['Role', u.role.charAt(0).toUpperCase() + u.role.slice(1)]]
          .map(([k, v]) => `<div class="info-row"><span class="key">${k}</span><span>${v}</span></div>`).join('')}
      </div>
    </div>
    <div>
      <div class="det-card">
        <h4>Profile Photo</h4>
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div class="sb-avatar sb-av-creator" style="width:80px;height:80px;font-size:2rem;overflow:hidden;" id="prof-photo-preview">
            ${u.photo_url ? `<img src="${u.photo_url}" style="width:100%;height:100%;object-fit:cover;">` : u.avatar}
          </div>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0;">
            Upload New Photo
            <input type="file" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(this)">
          </label>
        </div>
      </div>
      <div class="det-card">
        <h4>Portfolio &amp; Links</h4>
        <div class="fg"><label>Instagram Profile Link</label><input id="bio-ig" placeholder="https://instagram.com/yourhandle" value="${links.instagram || ''}"></div>
        <div class="fg"><label>YouTube Channel Link</label><input id="bio-yt" placeholder="https://youtube.com/@yourchannel" value="${links.youtube || ''}"></div>
        <div class="fg"><label>Work Video Link (Best Work)</label><input id="bio-work" placeholder="Paste a link to your best work (YouTube/Drive/Vimeo)" value="${links.video_link || ''}"></div>
        <button class="btn btn-primary btn-sm" onclick="savePortfolioLinks()">Save Links</button>
      </div>
    </div>
  </div>`;
}

function saveProfile() {
  const name = document.getElementById('prof-name')?.value?.trim();
  if (!name) { showToast('Name cannot be empty', 'err', ''); return; }
  const phone    = document.getElementById('prof-phone')?.value?.trim();
  const platform = document.getElementById('prof-platform')?.value;
  const users = DB.users(), u = users.find(x => x.id === CU.id);
  if (u) { u.name = name; u.phone = phone; u.platform = platform; u.avatar = name.charAt(0).toUpperCase(); DB.saveUsers(users); }
  CU = { ...CU, name, phone, platform }; DB.setCurrentUser(CU);
  document.getElementById('c-nav-name').textContent  = name.split(' ')[0];
  document.getElementById('c-sb-name').textContent   = name;
  document.getElementById('c-sb-avatar').textContent = name.charAt(0).toUpperCase();
  if (supaClient && CU.id) {
    supaClient.from('profiles').update({ name, phone, platform }).eq('id', CU.id).then(() => {});
  }
  showToast('Profile updated', 'ok', '');
}
// ────────────────────────────────────────
//  BROWSE FREELANCERS + DIRECT REQUEST
//  ⚠️ In functions ki sirf CALLS tumhare paste me thi, definitions nahi.
//  Logic faithful reconstruct hai — agar tumhare original ka behaviour alag
//  hai to apna original code yahan replace kar dena.
// ────────────────────────────────────────
let _browseSearch = '';
let _browseSort = 'best'; // 'best' | 'rating' | 'projects' | 'newest'
let _directReqFreelancerId = null;
let _directReqFreelancerName = null;

function fisherYatesShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hybridQualityScore(f) {
  const allP = DB.projects();
  const completed = allP.filter(p => p.freelancerId === f.id && p.status === 'completed');
  const rated = completed.filter(p => p.rating && p.rating > 0);
  const avg = rated.length > 0 ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0;
  const skillBonus = Math.min((f.skills || []).length, 5) * 0.2;
  const portfolioBonus = (f.portfolio_links && Object.values(f.portfolio_links).some(v => v && v.trim())) ? 0.5 : 0;
  // Weighted blend: rating (x2) + completed volume + profile completeness
  return (avg * 2) + completed.length + skillBonus + portfolioBonus;
}

function cBrowseFreelancers() {
  const term = (_browseSearch || '').toLowerCase();
  let list = DB.users().filter(u => u.role === 'freelancer');

  if (term) {
    list = list.filter(f =>
      (f.name || '').toLowerCase().includes(term) ||
      (f.profession || '').toLowerCase().includes(term) ||
      (f.skills || []).some(s => (s || '').toLowerCase().includes(term))
    );
  }

  const statOf = (f) => {
    const completed = DB.projects().filter(p => p.freelancerId === f.id && p.status === 'completed');
    const rated = completed.filter(p => p.rating && p.rating > 0);
    const avg = rated.length > 0 ? (rated.reduce((s, p) => s + p.rating, 0) / rated.length) : 0;
    return { completedCount: completed.length, avgRating: avg };
  };

  if (_browseSort === 'best') {
    list = fisherYatesShuffle(list).sort((a, b) => hybridQualityScore(b) - hybridQualityScore(a));
  } else if (_browseSort === 'rating') {
    list = list.sort((a, b) => statOf(b).avgRating - statOf(a).avgRating);
  } else if (_browseSort === 'projects') {
    list = list.sort((a, b) => statOf(b).completedCount - statOf(a).completedCount);
  } else if (_browseSort === 'newest') {
    list = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  const sortLabels = { best: 'Best Match', rating: 'Top Rated', projects: 'Most Projects', newest: 'Newest' };

  return `
  <div class="page-head"><h2>Browse Editors</h2><p>${list.length} editor${list.length !== 1 ? 's' : ''} available</p></div>
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
    <input id="browse-search" class="browse-search" placeholder="Search by name, skill, or profession…" value="${_browseSearch || ''}" oninput="cBrowseSearch(this.value)" style="flex:1;min-width:200px;padding:10px 14px;border:1px solid var(--glass-border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);"/>
    <div style="position:relative;">
      <button class="btn btn-ghost btn-sm" onclick="toggleSortDropdown(event)">Sort: ${sortLabels[_browseSort] || 'Best Match'} ▾</button>
      <div id="browse-sort-dropdown" style="display:none;position:absolute;right:0;top:110%;background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-sm);box-shadow:var(--shadow);z-index:50;min-width:160px;overflow:hidden;">
        ${Object.entries(sortLabels).map(([k, lbl]) => `<div class="sort-opt" style="padding:9px 14px;cursor:pointer;font-size:.82rem;${_browseSort === k ? 'background:var(--accent-soft);color:var(--accent);font-weight:600;' : ''}" onclick="cBrowseSort('${k}')">${lbl}</div>`).join('')}
      </div>
    </div>
  </div>
  <div class="f-grid">
    ${list.length ? list.map(f => {
      const st = statOf(f);
      const ratingDisplay = st.avgRating > 0 ? st.avgRating.toFixed(1) : 'New';
      const stars = st.avgRating > 0
        ? Array.from({ length: 5 }, (_, i) => `<span style="color:${i < Math.round(st.avgRating) ? 'var(--yellow)' : 'rgba(0,0,0,0.12)'}">&#9733;</span>`).join('')
        : `<span style="color:var(--text-3);font-size:.65rem;">No ratings yet</span>`;
      return `
      <div class="f-card">
        <div class="f-avatar" style="${f.photo_url ? 'background:transparent;' : ''}">${f.photo_url ? `<img src="${f.photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (f.avatar || 'F')}</div>
        <div class="f-name">${escapeHtml(f.name)}</div>
        <div class="stars">${stars}</div>
        <div class="f-rate">${ratingDisplay} &middot; ${st.completedCount} Projects</div>
        <div class="f-spec">${escapeHtml(f.profession || 'Editor')}</div>
        <div style="display:flex;flex-direction:column;gap:6px;width:100%;margin-top:10px;">
          <button class="btn btn-outline-f btn-xs full-btn" onclick="viewFreelancerPortfolio('${f.id}')">View Portfolio</button>
          <button class="btn btn-primary btn-xs full-btn" onclick="openSendRequestModal('${f.id}','${f.name.replace(/'/g, "\\'")}')">Send Request →</button>
        </div>
      </div>`;
    }).join('') : `<div style="color:var(--text-3);font-size:.85rem;grid-column:1/-1;padding:24px 0;text-align:center;">No editors match your search.</div>`}
  </div>`;
}

function cBrowseSearch(val) {
  _browseSearch = val;
  const m = document.getElementById('c-main');
  if (m) {
    m.innerHTML = cBrowseFreelancers();
    const inp = document.getElementById('browse-search');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}

function cBrowseSort(key) {
  _browseSort = key;
  closeSortDropdown();
  const m = document.getElementById('c-main');
  if (m) m.innerHTML = cBrowseFreelancers();
}

function toggleSortDropdown(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('browse-sort-dropdown');
  if (!dd) return;
  const open = dd.style.display === 'block';
  dd.style.display = open ? 'none' : 'block';
  if (!open) {
    setTimeout(() => document.addEventListener('click', _sortOutsideHandler), 0);
  } else {
    document.removeEventListener('click', _sortOutsideHandler);
  }
}

function _sortOutsideHandler(e) {
  const dd = document.getElementById('browse-sort-dropdown');
  if (dd && !dd.contains(e.target)) closeSortDropdown();
}

function closeSortDropdown() {
  const dd = document.getElementById('browse-sort-dropdown');
  if (dd) dd.style.display = 'none';
  document.removeEventListener('click', _sortOutsideHandler);
}

function openSendRequestModal(freelancerId, freelancerName) {
  _directReqFreelancerId = freelancerId;
  _directReqFreelancerName = freelancerName;

  const bodyHtml = `
    <div class="fg"><label>Project Title</label><input id="dr-title" placeholder="e.g. YouTube Vlog Edit – EP12"/></div>
    <div class="fg"><label>Description</label><textarea id="dr-desc" placeholder="Describe what you need edited…"></textarea></div>
    <div class="fg"><label>Content Type</label>
      <select id="dr-content">${['YouTube Long-form', 'Instagram Reel', 'YouTube Shorts', 'TikTok', 'LinkedIn Video', 'Brand Video', 'Documentary', 'Podcast Edit'].map(t => `<option>${t}</option>`).join('')}</select>
    </div>
    <div class="fg"><label>Budget (₹)</label><input id="dr-budget" type="number" min="1" placeholder="200"/></div>
    <div class="fg"><label>Deadline</label><input id="dr-deadline" type="date" min="${new Date().toISOString().split('T')[0]}"/></div>`;

  showModal(`Send Request to ${freelancerName}`, bodyHtml, submitDirectRequest);
  document.getElementById('modal-confirm').textContent = 'Send Request';
}

async function submitDirectRequest() {
  const title = document.getElementById('dr-title')?.value?.trim();
  const desc = document.getElementById('dr-desc')?.value?.trim() || '';
  const contentType = document.getElementById('dr-content')?.value || '';
  const budget = parseInt(document.getElementById('dr-budget')?.value || '0');
  const deadline = document.getElementById('dr-deadline')?.value || '';

  if (!title) { showToast('Please enter a project title', 'err', ''); return; }
  if (!budget || budget < 1) { showToast('Please enter a valid budget', 'err', ''); return; }
  if (!_directReqFreelancerId) { showToast('No freelancer selected', 'err', ''); return; }

  const newP = {
    id: pid(), creatorId: CU.id,
    title, description: desc, budget,
    contentType, deadline, priority: 'Normal',
    freelancerId: null,
    invited_freelancers: [_directReqFreelancerId],
    status: 'open', rawShared: true,
    editedUploaded: false, paid: false, rating: 0, review: '', createdAt: Date.now()
  };

  const projs = DB.projects(); projs.push(newP); DB.saveProjects(projs);

  if (supaClient) {
    const { error } = await supaClient.from('projects').insert({
      id: newP.id, creator_id: CU.id, freelancer_id: null,
      invited_freelancers: [_directReqFreelancerId],
      title, description: desc, budget,
      content_type: contentType, deadline, priority: 'Normal',
      status: 'open', raw_shared: true, edited_uploaded: false, paid: false
    });
    if (error) {
      showToast('DB Error: ' + error.message, 'err', '');
      DB.saveProjects(DB.projects().filter(x => x.id !== newP.id));
      return;
    }
    sendProjectNotificationEmail(_directReqFreelancerId, title, budget, deadline, contentType);
  }

  showToast(`Request sent to ${_directReqFreelancerName || 'editor'}!`, 'ok', '🎉');
  _directReqFreelancerId = null;
  _directReqFreelancerName = null;
  cPage('projects', document.querySelector('[data-page=projects]'));
}