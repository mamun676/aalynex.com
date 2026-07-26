
//  PUBLIC PROFILE — shareable freelancer page (?profile=<id>)
//  Logged-out (anon) users ke liye public read.
// ════════════════════════════════════
function publicProfileUrl(id) {
  return location.origin + location.pathname + '?profile=' + id;
}

// 1) Route check — main.js isko call karta hai (ya publicProfileGuard IIFE).
async function checkPublicProfileRoute() {
  const id = new URLSearchParams(location.search).get('profile');
  if (!id) return false;
  await openPublicProfile(id);
  return true;
}

// 2) Load + render the public profile screen
async function openPublicProfile(id) {
  showScreen('screen-public-profile');
  const host = document.getElementById('pp-content');
  if (host) host.innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-3);font-size:.9rem;">Loading profile…</div>';

  if (!supaClient) {
    if (host) host.innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-3);">Profile load nahi ho saka.</div>';
    return;
  }

  try {
    // public_freelancer_profiles view (anon ko SELECT allowed hona chahiye — FIX 3 SQL)
    const { data: profile, error } = await supaClient
      .from('public_freelancer_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !profile) throw error || new Error('not found');

    // stats view (best-effort)
    let stats = { completed_count: 0, avg_rating: null, rating_count: 0 };
    try {
      const { data: st } = await supaClient
        .from('public_freelancer_stats')
        .select('*')
        .eq('freelancer_id', id)
        .single();
      if (st) stats = st;
    } catch (e) {}

    renderPublicProfile(profile, stats);
  } catch (e) {
    if (host) host.innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-3);">Yeh profile available nahi hai.</div>';
  }
}

// 3) Render markup into #pp-content
function renderPublicProfile(profile, stats) {
  const host = document.getElementById('pp-content');
  if (!host) return;

  const skills = profile.skills || [];
  const links = profile.portfolio_links || {};
  const exp = profile.experience || [];
  const avg = (stats && stats.avg_rating) ? Number(stats.avg_rating).toFixed(1) : null;
  const completed = (stats && stats.completed_count) ? stats.completed_count : 0;

  const photoHtml = profile.photo_url
    ? `<img src="${escapeHtml(profile.photo_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (profile.name ? profile.name.charAt(0).toUpperCase() : 'F');

  const stars = avg
    ? Array.from({ length: 5 }, (_, i) => `<span style="color:${i < Math.round(avg) ? 'var(--yellow)' : 'rgba(0,0,0,0.15)'}">&#9733;</span>`).join('')
    : `<span style="color:rgba(0,0,0,0.15)">&#9733;&#9733;&#9733;&#9733;&#9733;</span>`;

  host.innerHTML = `
    <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;">
        <div class="f-avatar" style="width:96px;height:96px;font-size:2.4rem;${profile.photo_url ? 'background:transparent;' : ''}">${photoHtml}</div>
        <div>
          <div style="font-family:'Outfit',sans-serif;font-size:1.4rem;font-weight:700;color:var(--text);">${escapeHtml(profile.name)}</div>
          <div style="font-size:.9rem;color:var(--accent2);font-weight:500;">${escapeHtml(profile.profession || 'Video Editor')}</div>
        </div>
        <div style="font-size:.85rem;display:flex;align-items:center;gap:6px;">
          ${stars}
          <span style="color:var(--text-3);">${avg ? `(${avg} &bull; ${completed} Projects)` : `(New &bull; ${completed} Projects)`}</span>
        </div>
      </div>

      ${skills.length ? `
      <div style="margin-top:24px;">
        <div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${skills.map(s => `<span class="tag pu" style="font-size:.72rem;padding:5px 12px;">${escapeHtml(s)}</span>`).join('')}</div>
      </div>` : ''}

      ${exp.length ? `
      <div style="margin-top:24px;">
        <div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Experience</div>
        <div style="display:flex;flex-direction:column;gap:10px;">${exp.map(e => `
          <div style="border-left:2px solid var(--accent-soft);padding-left:12px;">
            <div style="font-weight:600;font-size:.85rem;color:var(--text);">${escapeHtml(e.title)}</div>
            <div style="font-size:.75rem;color:var(--text-3);margin-top:2px;">${escapeHtml(e.company)} &middot; ${escapeHtml(e.duration)}</div>
          </div>`).join('')}</div>
      </div>` : ''}

      <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${links.instagram ? `<a href="${safeUrl(links.instagram)}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none;">Instagram</a>` : ''}
        ${links.youtube ? `<a href="${safeUrl(links.youtube)}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none;">YouTube</a>` : ''}
        ${links.video_link ? `<a href="${safeUrl(links.video_link)}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none;">Work Video</a>` : ''}
      </div>

      ${shareButtonsHtml(profile.id, profile.name)}

      <div style="margin-top:28px;text-align:center;">
        <button class="btn btn-primary" onclick="location.href=location.origin+location.pathname">Join Aalynex →</button>
      </div>
    </div>`;
}

// 4) Share buttons block
function shareButtonsHtml(id, name) {
  const url = publicProfileUrl(id);
  const encURL = encodeURIComponent(url);
  const encText = encodeURIComponent(`Check out ${name} on Aalynex`);
  return `
    <div style="margin-top:24px;border-top:1px solid var(--glass-border);padding-top:16px;">
      <div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;text-align:center;">Share this profile</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        <button class="btn btn-ghost btn-sm" onclick="nativeShare('${id}','${(name||'').replace(/'/g, "\\'")}')">Share</button>
        <button class="btn btn-ghost btn-sm" onclick="copyProfileLink('${id}')">Copy Link</button>
        <a class="btn btn-ghost btn-sm" style="text-decoration:none;" target="_blank" href="https://wa.me/?text=${encText}%20${encURL}">WhatsApp</a>
      </div>
    </div>`;
}

// 5) Native share (Web Share API) with fallback
async function nativeShare(id, name) {
  const url = publicProfileUrl(id);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${name} on Aalynex`, text: `Check out ${name} on Aalynex`, url });
      return;
    } catch (e) { /* user cancelled — fall through */ }
  }
  copyProfileLink(id);
}

// 6) Copy link to clipboard
async function copyProfileLink(id) {
  const url = publicProfileUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Profile link copied!', 'ok', '🔗');
  } catch (e) {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('Profile link copied!', 'ok', '🔗'); }
    catch (e2) { showToast('Copy failed — link: ' + url, 'warn', ''); }
    document.body.removeChild(ta);
  }
}

// 7) "Share my profile" card add karo logged-in freelancer ke profile page me
function addPublicShareCard() {
  if (!CU || CU.role !== 'freelancer') return;
  const fMain = document.getElementById('f-main');
  if (!fMain) return;
  if (document.getElementById('public-share-card')) return;

  const card = document.createElement('div');
  card.className = 'det-card';
  card.id = 'public-share-card';
  card.style.marginTop = '14px';
  card.innerHTML = `
    <h4>Your Public Profile</h4>
    <p style="font-size:.82rem;color:var(--text-2);margin-bottom:10px;">Share this link with creators — logged-out log bhi dekh sakte hain.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" onclick="nativeShare('${CU.id}','${(CU.name||'').replace(/'/g, "\\'")}')">Share Profile</button>
      <button class="btn btn-ghost btn-sm" onclick="copyProfileLink('${CU.id}')">Copy Link</button>
    </div>`;
  fMain.appendChild(card);
}

// 8) attachShareCard — profile render ke baad share card lagao (best-effort IIFE hook)
(function attachShareCard() {
  // renderF('profile') ke baad DOM update hota hai; ek halka observer laga dete hain.
  if (window.__shareCardObserverInit) return;
  window.__shareCardObserverInit = true;
  const fMain = document.getElementById('f-main');
  if (!fMain) return;
  new MutationObserver(() => {
    const activePage = document.querySelector('#screen-freelancer .nav-item.active')?.dataset?.page;
    if (activePage === 'profile') addPublicShareCard();
  }).observe(fMain, { childList: true });
})();

// 9) publicProfileGuard — agar public view hai to normal app init ko rok do
(function publicProfileGuard() {
  if (window.isPublicProfileView) {
    // Landing/auto-login init ko skip karwaane ke liye flag main.js padhta hai.
    // Route render window load par hota hai (checkPublicProfileRoute).
    document.addEventListener('DOMContentLoaded', () => {
      checkPublicProfileRoute();
    });
  }
})();
