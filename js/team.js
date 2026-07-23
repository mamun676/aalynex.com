// ════════════════════════════════════
//  TEAM — "Meet the Team" modal
// ════════════════════════════════════
async function fetchAndRenderDevelopers() {
  if (!supaClient) return;

  const container = document.getElementById('team-modal-cards');
  if (!container) return;

  // Show loading state
  container.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-3);font-size:.85rem;">
      Loading team...
    </div>`;

  try {
    const { data: devs, error } = await supaClient
      .from('developers')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !devs || devs.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-3);font-size:.85rem;">
          Could not load team data.
        </div>`;
      return;
    }

    container.innerHTML = devs.map(dev => `
      <div class="team-card">
        <div class="team-card-img-wrap">
          <img src="${dev.image_url || 'https://api.dicebear.com/7.x/notionists/svg?seed=' + encodeURIComponent(dev.name)}"
               alt="${dev.name}"
               class="team-card-img"
               onerror="this.onerror=null;this.src='https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(dev.name)}'"/>
        </div>
        <div class="team-card-name">${dev.name}</div>
        <div class="team-card-role">${dev.role}</div>
        <div class="team-card-desc">${dev.bio}</div>
        <div class="team-card-links">${dev.linkedin ? `
            <a href="${dev.linkedin}" target="_blank" class="team-card-link" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>` : ''}${dev.instagram ? `
            <a href="${dev.instagram}" target="_blank" class="team-card-link" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>` : ''}
        </div>
      </div>
    `).join('');

  } catch (e) {
    console.error('Failed to load developers:', e);
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-3);font-size:.85rem;">
        Could not load team data.
      </div>`;
  }
}

/* ── MEET THE TEAM MODAL FUNCTIONS ── */
function openTeamModal() {
  const overlay = document.getElementById('team-modal-overlay');
  const pageContent = document.getElementById('screen-landing');
  overlay.style.display = 'flex';
  fetchAndRenderDevelopers();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('team-open');
      if (pageContent) pageContent.classList.add('blur-active');
    });
  });
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', _teamEscHandler);
}

// ⚠️ RECONSTRUCTED — closeTeamModal/_teamEscHandler ki sirf reference thi paste me.
function closeTeamModal() {
  const overlay = document.getElementById('team-modal-overlay');
  const pageContent = document.getElementById('screen-landing');
  if (overlay) {
    overlay.classList.remove('team-open');
    // transition khatam hone ke baad hide
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }
  if (pageContent) pageContent.classList.remove('blur-active');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _teamEscHandler);
}

function _teamEscHandler(e) {
  if (e.key === 'Escape') closeTeamModal();
}
