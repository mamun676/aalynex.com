// ═══════════════════════════════════════════════════════════════
//  AALYNEX — AI CONTENT SUGGESTION (creator side)
//  Load this AFTER creator.js and BEFORE main.js in index.html.
//  It plugs a new 'aisuggest' page into the existing creator dashboard
//  (cPage / renderC) without touching creator.js.
// ═══════════════════════════════════════════════════════════════

const AI_SUGGEST_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/ai-suggest';
window._aiSuggestQuota = null; // { used, limit, remaining }

/* ── Hook our page into the existing creator router (renderC) ── */
(function () {
  const _origRenderC = window.renderC;
  window.renderC = function (p) {
    if (p === 'aisuggest') {
      const m = document.getElementById('c-main');
      if (m) m.innerHTML = renderAISuggest();
      return;
    }
    return _origRenderC.apply(this, arguments);
  };
})();

/* ── Options ── */
const AIS_PLATFORMS = ['YouTube', 'YouTube Shorts', 'Instagram Reel', 'Instagram', 'TikTok', 'LinkedIn'];
const AIS_LANGS = ['Hinglish', 'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi'];
const AIS_AGES = ['13-17', '18-24', '25-34', '35-44', '45+'];
const AIS_EXP = ['Beginner', 'Growing', 'Established'];
const AIS_GOALS = ['Views', 'Subscribers', 'Engagement', 'Sales', 'Brand Building'];

function _aisOpts(arr, sel) {
  return arr.map(o => `<option value="${escapeHtml(o)}"${o === sel ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
}

/* ── Main page HTML ── */
function renderAISuggest() {
  const premium = (typeof isPremiumCreator === 'function') ? isPremiumCreator() : !!window._premiumActive;
  const price = (typeof premiumPrice === 'function') ? premiumPrice() : 99;

  const head = `
    <div class="page-head">
      <h2>💡 AI Content Suggestion</h2>
      <p>Powered by Aalynex Creator Growth AI — viral-ready ideas, hooks, titles & thumbnails</p>
    </div>`;

  if (!premium) {
    return head + `
      <div style="background:linear-gradient(135deg,rgba(224,92,42,.1),rgba(124,58,237,.08));border:1.5px solid rgba(224,92,42,.3);border-radius:var(--radius-lg);padding:22px;max-width:560px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:1.4rem;">🤖</span>
          <span style="font-weight:800;font-size:1.05rem;color:var(--text);">Premium feature</span>
        </div>
        <div style="font-size:.85rem;color:var(--text-2);margin-bottom:6px;">AI Content Suggestion <b>Aalynex Premium (₹${price}/month)</b> ke saath aata hai — wahi plan jo Managed Editing unlock karta hai.</div>
        <div style="font-size:.8rem;color:var(--text-3);margin-bottom:14px;">Premium members ko har mahine <b>30 AI generations</b> milti hain.</div>
        <button class="btn btn-primary btn-sm" onclick="openPremiumModal()">Unlock Premium →</button>
      </div>`;
  }

  const quotaLine = window._aiSuggestQuota
    ? `<span style="font-size:.72rem;color:var(--text-3);">Is mahine bacha: <b style="color:var(--accent);">${window._aiSuggestQuota.remaining}/${window._aiSuggestQuota.limit}</b></span>`
    : `<span style="font-size:.72rem;color:var(--text-3);">30 generations / month</span>`;

  const field = (label, html) => `<div style="display:flex;flex-direction:column;gap:5px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-2);">${label}</label>${html}</div>`;
  const inputStyle = 'style="padding:10px 12px;border:1px solid var(--glass-border);border-radius:10px;background:var(--bg2);color:var(--text);font-size:.85rem;font-family:inherit;"';

  return head + `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      ${quotaLine}
    </div>
    <div style="background:var(--bg2);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:18px;max-width:820px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;">
        ${field('Content Category *', `<input id="ais-category" ${inputStyle} placeholder="e.g. Tech, Finance, Fitness">`)}
        ${field('Sub Category', `<input id="ais-sub" ${inputStyle} placeholder="e.g. AI Tools, Stock Market">`)}
        ${field('Platform', `<select id="ais-platform" ${inputStyle}>${_aisOpts(AIS_PLATFORMS, 'YouTube')}</select>`)}
        ${field('Language', `<select id="ais-lang" ${inputStyle}>${_aisOpts(AIS_LANGS, 'Hinglish')}</select>`)}
        ${field('Target Country', `<input id="ais-country" ${inputStyle} value="India">`)}
        ${field('Audience Age', `<select id="ais-age" ${inputStyle}>${_aisOpts(AIS_AGES, '18-24')}</select>`)}
        ${field('Experience Level', `<select id="ais-exp" ${inputStyle}>${_aisOpts(AIS_EXP, 'Growing')}</select>`)}
        ${field('Primary Goal', `<select id="ais-goal" ${inputStyle}>${_aisOpts(AIS_GOALS, 'Views')}</select>`)}
      </div>
      <div style="margin-top:14px;">
        ${field('Extra notes (optional)', `<input id="ais-extra" ${inputStyle} placeholder="koi specific angle, competitor, ya idea...">`)}
      </div>
      <button id="ais-gen-btn" class="btn btn-primary" style="margin-top:16px;" onclick="generateAISuggestions()">✨ Generate Ideas</button>
    </div>
    <div id="ais-results" style="margin-top:20px;"></div>`;
}

/* ── Call the edge function ── */
async function generateAISuggestions() {
  if (!supaClient || !CU) { showToast('Please log in again', 'err', ''); return; }
  const btn = document.getElementById('ais-gen-btn');
  const results = document.getElementById('ais-results');
  const category = (document.getElementById('ais-category').value || '').trim();
  if (!category) { showToast('Content category likho', 'warn', ''); return; }

  const payload = {
    category,
    subCategory: (document.getElementById('ais-sub').value || '').trim(),
    platform: document.getElementById('ais-platform').value,
    language: document.getElementById('ais-lang').value,
    country: (document.getElementById('ais-country').value || 'India').trim(),
    audienceAge: document.getElementById('ais-age').value,
    experience: document.getElementById('ais-exp').value,
    goal: document.getElementById('ais-goal').value,
    extraContext: (document.getElementById('ais-extra').value || '').trim(),
  };

  if (btn) { btn.disabled = true; btn.textContent = '🧠 Thinking…'; }
  results.innerHTML = `<div style="color:var(--text-3);font-size:.85rem;padding:20px 0;">AI aapke liye viral ideas bana raha hai… (5-10 sec)</div>`;

  try {
    const { data: { session } } = await supaClient.auth.getSession();
    const res = await fetch(AI_SUGGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'premium_required') { results.innerHTML = ''; showToast('Premium chahiye is feature ke liye', 'warn', ''); if (typeof openPremiumModal === 'function') openPremiumModal(); return; }
      if (data.error === 'quota_exceeded') { results.innerHTML = `<div style="color:var(--red);font-size:.85rem;">${escapeHtml(data.message || 'Monthly limit khatam')}</div>`; return; }
      throw new Error(data.detail || data.message || data.error || 'AI request failed');
    }

    window._aiSuggestQuota = { used: data.used, limit: data.limit, remaining: data.remaining };
    results.innerHTML = renderAISuggestionCards(data.suggestions || []);
    // refresh the quota line at top
    const qEl = document.querySelector('#c-main .page-head');
    if (qEl) { /* re-render whole page keeps state simple */ }
    showToast(`${(data.suggestions || []).length} ideas ready! ${data.remaining} left this month`, 'ok', '');
  } catch (e) {
    console.error(e);
    results.innerHTML = `<div style="color:var(--red);font-size:.85rem;">${escapeHtml(e.message || 'Kuch galat ho gaya, dobara try karo.')}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Generate Ideas'; }
  }
}

/* ── Result cards ── */
function _aisScoreColor(n) { n = Number(n) || 0; return n >= 80 ? 'var(--green)' : n >= 60 ? 'var(--yellow)' : 'var(--text-3)'; }
function _aisChips(arr, bg) {
  return (arr || []).map(x => `<span style="display:inline-block;background:${bg};color:var(--text-2);font-size:.66rem;padding:3px 8px;border-radius:999px;margin:2px 3px 0 0;">${escapeHtml(x)}</span>`).join('');
}

function renderAISuggestionCards(list) {
  if (!list.length) return `<div style="color:var(--text-3);font-size:.85rem;">Koi idea nahi mila, inputs badal ke try karo.</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">` + list.map(s => {
    const score = Number(s.viralScore) || 0;
    return `
    <div style="background:var(--bg2);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:16px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:.68rem;font-weight:700;color:${_aisScoreColor(score)};">🔥 Viral ${score}/100</span>
        <span style="font-size:.64rem;color:var(--text-3);">${escapeHtml(s.difficulty || '')} · ${escapeHtml(s.estViews || '')}</span>
      </div>
      <div style="font-weight:800;font-size:.98rem;color:var(--text);line-height:1.3;">${escapeHtml(s.topic || '')}</div>
      ${s.trend ? `<div style="font-size:.68rem;color:var(--accent);font-weight:600;">📈 ${escapeHtml(s.trend)}</div>` : ''}
      <div style="font-size:.76rem;color:var(--text-2);"><b style="color:var(--text);">Why:</b> ${escapeHtml(s.why || '')}</div>
      <div style="font-size:.76rem;color:var(--text-2);"><b style="color:var(--text);">🎣 Hook:</b> ${escapeHtml(s.hook || '')}</div>
      <div style="font-size:.76rem;color:var(--text-2);"><b style="color:var(--text);">🖼 Thumbnail:</b> ${escapeHtml(s.thumbnailIdea || '')}</div>
      ${s.audience ? `<div style="font-size:.72rem;color:var(--text-3);">👥 ${escapeHtml(s.audience)}${s.contentType ? ' · ' + escapeHtml(s.contentType) : ''}</div>` : ''}
      <details style="margin-top:2px;">
        <summary style="cursor:pointer;font-size:.74rem;color:var(--accent);font-weight:600;">📝 Titles, hashtags & keywords</summary>
        <div style="margin-top:6px;">
          ${(s.titles || []).length ? `<div style="font-size:.72rem;color:var(--text-2);margin-bottom:6px;">${(s.titles || []).map(t => `• ${escapeHtml(t)}`).join('<br>')}</div>` : ''}
          <div>${_aisChips(s.hashtags, 'rgba(124,58,237,.10)')}</div>
          <div style="margin-top:4px;">${_aisChips(s.keywords, 'rgba(0,0,0,.05)')}</div>
        </div>
      </details>
      ${s.cta ? `<div style="font-size:.72rem;color:var(--text-3);border-top:1px solid var(--glass-border);padding-top:8px;margin-top:2px;">📣 ${escapeHtml(s.cta)}</div>` : ''}
    </div>`;
  }).join('') + `</div>`;
}
