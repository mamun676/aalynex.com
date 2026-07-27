
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
    <a href="${dev.linkedin}" target="_blank" rel="noopener" class="team-card-link team-soc-li" aria-label="LinkedIn">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>
    </a>` : ''}${dev.instagram ? `
    <a href="${dev.instagram}" target="_blank" rel="noopener" class="team-card-link team-soc-ig" aria-label="Instagram">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311C8.416 2.175 8.796 2.163 12 2.163zm0 1.802c-3.148 0-3.512.011-4.75.068-1.024.047-1.72.207-2.226.713-.506.506-.666 1.202-.713 2.226-.057 1.238-.068 1.602-.068 4.75s.011 3.512.068 4.75c.047 1.024.207 1.72.713 2.226.506.506 1.202.666 2.226.713 1.238.057 1.602.068 4.75.068s3.512-.011 4.75-.068c1.024-.047 1.72-.207 2.226-.713.506-.506.666-1.202.713-2.226.057-1.238.068-1.602.068-4.75s-.011-3.512-.068-4.75c-.047-1.024-.207-1.72-.713-2.226-.506-.506-1.202-.666-2.226-.713-1.238-.057-1.602-.068-4.75-.068zM12 6.865a5.135 5.135 0 1 0 0 10.27 5.135 5.135 0 0 0 0-10.27zm0 8.468a3.333 3.333 0 1 1 0-6.666 3.333 3.333 0 0 1 0 6.666zm6.538-8.671a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z"/></svg>
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
