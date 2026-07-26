// AALYNEX — AI CONTENT SUGGESTION (creator side) — Premium UI + History
// Load AFTER creator.js and BEFORE main.js in index.html.

const AI_SUGGEST_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/ai-suggest';
window._aiSuggestQuota = null;
window._aiSuggestLast = null;
window._aiSuggestHistory = null;

(function () {
  const _origRenderC = window.renderC;
  window.renderC = function (p) {
    if (p === 'aisuggest') {
      const m = document.getElementById('c-main');
      if (m) m.innerHTML = renderAISuggest();
      loadAISuggestHistory();
      return;
    }
    return _origRenderC.apply(this, arguments);
  };
})();

const AIS_PLATFORMS = ['YouTube', 'YouTube Shorts', 'Instagram Reels', 'Instagram', 'LinkedIn'];
const AIS_LANGS = ['Hinglish', 'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi'];
const AIS_AGES = ['13-17', '18-24', '25-34', '35-44', '45+'];
const AIS_EXP = ['Beginner', 'Growing', 'Established'];
const AIS_GOALS = ['Views', 'Subscribers', 'Engagement', 'Sales', 'Brand Building'];

function _aisOpts(arr, sel) {
  return arr.map(o => `<option value="${escapeHtml(o)}"${o === sel ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
}
function _aisQuotaInner() {
  if (window._aiSuggestQuota) return `<b style="color:var(--accent);">${window._aiSuggestQuota.remaining}</b> of ${window._aiSuggestQuota.limit} left this month`;
  return `<b style="color:var(--accent);">30</b> generations / month`;
}

function renderAISuggest() {
  const premium = (typeof isPremiumCreator === 'function') ? isPremiumCreator() : !!window._premiumActive;
  const price = (typeof premiumPrice === 'function') ? premiumPrice() : 99;

  const head = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
      <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 14px rgba(224,92,42,.25);">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/></svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
          <h2 style="margin:0;font-family:'Outfit',sans-serif;font-weight:700;font-size:1.35rem;letter-spacing:-.4px;color:var(--text);">AI Content Suggestions</h2>
          <span style="font-size:.58rem;font-weight:700;letter-spacing:.5px;color:var(--accent);background:var(--accent-soft);border:1px solid rgba(224,92,42,.22);padding:2px 8px;border-radius:999px;">PREMIUM</span>
        </div>
        <p style="margin:3px 0 0;font-size:.83rem;color:var(--text-2);">Research-backed video ideas, hooks, titles and thumbnail concepts — tailored to your channel.</p>
      </div>
    </div>`;

  if (!premium) {
    return head + `
      <div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:28px;max-width:520px;box-shadow:var(--shadow-sm);">
        <div style="font-weight:700;font-size:1.05rem;color:var(--text);margin-bottom:8px;">This is a Premium feature</div>
        <p style="font-size:.86rem;color:var(--text-2);line-height:1.6;margin:0 0 6px;">AI Content Suggestions come with <b>Aalynex Premium (₹${price}/month)</b> — the same plan that unlocks Managed Editing.</p>
        <p style="font-size:.82rem;color:var(--text-3);margin:0 0 18px;">Premium members get <b>30 idea generations</b> every month.</p>
        <button class="btn btn-primary" onclick="openPremiumModal()">Unlock Premium</button>
      </div>`;
  }

  const inputStyle = 'style="padding:10px 12px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface2);color:var(--text);font-size:.85rem;font-family:inherit;outline:none;width:100%;box-sizing:border-box;"';
  const field = (label, html) => `<div style="display:flex;flex-direction:column;gap:6px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-2);">${label}</label>${html}</div>`;

  const resultsInner = window._aiSuggestLast ? renderAISuggestionCards(window._aiSuggestLast) : '';
  const historyInner = renderAISuggestHistory();

  return head + `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
      <div style="font-size:.92rem;font-weight:600;color:var(--text);">Generate new ideas</div>
      <span id="ais-quota" style="font-size:.74rem;color:var(--text-3);background:var(--surface);border:1px solid var(--glass-border);padding:5px 12px;border-radius:999px;box-shadow:var(--shadow-xs);">${_aisQuotaInner()}</span>
    </div>
    <div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:22px;max-width:880px;box-shadow:var(--shadow-sm);">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:15px;">
        ${field('Content type *', `<input id="ais-category" ${inputStyle} placeholder="e.g. Personal finance, Fitness, Tech reviews">`)}
        ${field('Sub-type', `<input id="ais-sub" ${inputStyle} placeholder="e.g. Index funds, Home workouts">`)}
        ${field('Platform', `<select id="ais-platform" ${inputStyle}>${_aisOpts(AIS_PLATFORMS, 'YouTube')}</select>`)}
        ${field('Language', `<select id="ais-lang" ${inputStyle}>${_aisOpts(AIS_LANGS, 'Hinglish')}</select>`)}
        ${field('Target country', `<input id="ais-country" ${inputStyle} value="India">`)}
        ${field('Audience age', `<select id="ais-age" ${inputStyle}>${_aisOpts(AIS_AGES, '18-24')}</select>`)}
        ${field('Experience level', `<select id="ais-exp" ${inputStyle}>${_aisOpts(AIS_EXP, 'Growing')}</select>`)}
        ${field('Primary goal', `<select id="ais-goal" ${inputStyle}>${_aisOpts(AIS_GOALS, 'Views')}</select>`)}
      </div>
      <div style="margin-top:15px;display:grid;grid-template-columns:1fr;gap:15px;">
        ${field('Channel link (optional) — tailors ideas to your channel', `<input id="ais-channel" ${inputStyle} placeholder="Paste your YouTube / Instagram channel URL">`)}
        ${field('Extra notes (optional)', `<input id="ais-extra" ${inputStyle} placeholder="Any angle, competitor or idea to focus on">`)}
      </div>
      <button id="ais-gen-btn" class="btn btn-primary" style="margin-top:20px;" onclick="generateAISuggestions()">Generate ideas</button>
    </div>
    <div id="ais-results" style="margin-top:24px;">${resultsInner}</div>
    <div id="ais-history" style="margin-top:28px;">${historyInner}</div>`;
}

async function generateAISuggestions() {
  if (!supaClient || !CU) { showToast('Please log in again.', 'err', ''); return; }
  const btn = document.getElementById('ais-gen-btn');
  const results = document.getElementById('ais-results');
  const category = (document.getElementById('ais-category').value || '').trim();
  if (!category) { showToast('Please enter a content niche.', 'warn', ''); return; }

  const payload = {
    category,
    subCategory: (document.getElementById('ais-sub').value || '').trim(),
    platform: document.getElementById('ais-platform').value,
    language: document.getElementById('ais-lang').value,
    country: (document.getElementById('ais-country').value || 'India').trim(),
    audienceAge: document.getElementById('ais-age').value,
    experience: document.getElementById('ais-exp').value,
    goal: document.getElementById('ais-goal').value,
    channelUrl: (document.getElementById('ais-channel').value || '').trim(),
    extraContext: (document.getElementById('ais-extra').value || '').trim(),
  };

  if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); btn.textContent = 'Generating…'; }
  if (results) results.innerHTML = `
    <div style="display:flex;align-items:center;gap:11px;color:var(--text-2);font-size:.85rem;padding:22px;background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);box-shadow:var(--shadow-xs);">
      <span style="width:16px;height:16px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin .6s linear infinite;"></span>
      Researching viral ideas for you… (5–10 seconds)
    </div>`;

  try {
    const { data: { session } } = await supaClient.auth.getSession();
    if (!session || !session.access_token) { throw new Error('Your session expired. Please log in again.'); }
    const res = await fetch(AI_SUGGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'premium_required') { window._aiSuggestLast = null; if (results) results.innerHTML = ''; showToast('Premium is required for this feature.', 'warn', ''); if (typeof openPremiumModal === 'function') openPremiumModal(); return; }
      if (data.error === 'quota_exceeded') { if (results) results.innerHTML = `<div style="color:var(--red);font-size:.85rem;padding:14px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:var(--radius-lg);">${escapeHtml(data.message || 'Monthly limit reached.')}</div>`; return; }
      throw new Error(data.detail || data.message || data.error || 'AI request failed.');
    }

    window._aiSuggestQuota = { used: data.used, limit: data.limit, remaining: data.remaining };
    window._aiSuggestLast = data.suggestions || [];
    if (results) results.innerHTML = renderAISuggestionCards(window._aiSuggestLast);

    const qEl = document.getElementById('ais-quota');
    if (qEl) qEl.innerHTML = _aisQuotaInner();

    showToast(`${window._aiSuggestLast.length} ideas ready — ${data.remaining} left this month`, 'ok', '');
    loadAISuggestHistory();
  } catch (e) {
    console.error(e);
    if (results) results.innerHTML = `<div style="color:var(--red);font-size:.85rem;padding:14px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:var(--radius-lg);">${escapeHtml(e.message || 'Something went wrong. Please try again.')}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); btn.textContent = 'Generate ideas'; }
  }
}

function _aisScoreColor(n) { n = Number(n) || 0; return n >= 80 ? 'var(--green)' : n >= 60 ? 'var(--yellow)' : 'var(--text-3)'; }
function _aisScoreBg(n) { n = Number(n) || 0; return n >= 80 ? 'var(--green-soft)' : n >= 60 ? 'rgba(217,119,6,.1)' : 'rgba(0,0,0,.05)'; }
function _aisChips(arr, bg, col) {
  return (arr || []).map(x => `<span style="display:inline-block;background:${bg};color:${col || 'var(--text-2)'};font-size:.66rem;padding:3px 9px;border-radius:999px;margin:0 5px 5px 0;">${escapeHtml(x)}</span>`).join('');
}

function renderAISuggestionCards(list) {
  if (!list || !list.length) return `<div style="color:var(--text-3);font-size:.85rem;padding:14px;">No ideas returned. Try changing your inputs.</div>`;
  const header = `<div style="font-weight:700;font-size:1rem;color:var(--text);margin-bottom:14px;">${list.length} ideas generated</div>`;
  const grid = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">` + list.map(s => {
    const score = Number(s.viralScore) || 0;
    const meta = [s.difficulty, s.estViews].filter(Boolean).map(escapeHtml).join(' · ');
    return `
    <div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow-sm);transition:box-shadow .25s,transform .25s;" onmouseover="this.style.boxShadow='var(--shadow-md)';this.style.transform='translateY(-2px)';" onmouseout="this.style.boxShadow='var(--shadow-sm)';this.style.transform='none';">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:.68rem;font-weight:700;color:${_aisScoreColor(score)};background:${_aisScoreBg(score)};padding:4px 10px;border-radius:999px;">Viral score ${score}</span>
        ${meta ? `<span style="font-size:.66rem;color:var(--text-3);">${meta}</span>` : ''}
      </div>
      <div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:1.02rem;color:var(--text);line-height:1.35;">${escapeHtml(s.topic || '')}</div>
      ${s.trend ? `<div style="font-size:.68rem;color:var(--accent);font-weight:600;">Trend: ${escapeHtml(s.trend)}</div>` : ''}
      <div style="font-size:.78rem;color:var(--text-2);line-height:1.55;"><b style="color:var(--text);font-weight:600;">Why it works.</b> ${escapeHtml(s.why || '')}</div>
      <div style="font-size:.78rem;color:var(--text-2);line-height:1.55;"><b style="color:var(--text);font-weight:600;">Hook.</b> ${escapeHtml(s.hook || '')}</div>
      <div style="font-size:.78rem;color:var(--text-2);line-height:1.55;"><b style="color:var(--text);font-weight:600;">Thumbnail.</b> ${escapeHtml(s.thumbnailIdea || '')}</div>
      ${s.audience ? `<div style="font-size:.71rem;color:var(--text-3);">${escapeHtml(s.audience)}${s.contentType ? ' · ' + escapeHtml(s.contentType) : ''}</div>` : ''}
      <details style="margin-top:2px;">
        <summary style="cursor:pointer;font-size:.75rem;color:var(--accent);font-weight:600;">Titles, hashtags &amp; keywords</summary>
        <div style="margin-top:10px;">
          ${(s.titles || []).length ? `<div style="font-size:.73rem;color:var(--text-2);margin-bottom:10px;line-height:1.7;">${(s.titles || []).map(t => `• ${escapeHtml(t)}`).join('<br>')}</div>` : ''}
          <div>${_aisChips(s.hashtags, 'var(--accent2-soft)', 'var(--accent2)')}</div>
          <div style="margin-top:4px;">${_aisChips(s.keywords, 'rgba(0,0,0,.05)')}</div>
        </div>
      </details>
      ${s.cta ? `<div style="font-size:.71rem;color:var(--text-3);border-top:1px solid var(--glass-border);padding-top:10px;margin-top:2px;">CTA: ${escapeHtml(s.cta)}</div>` : ''}
    </div>`;
  }).join('') + `</div>`;
  return header + grid;
}

async function loadAISuggestHistory() {
  if (!supaClient) return;
  try {
    const { data, error } = await supaClient
      .from('ai_suggestions')
      .select('id, created_at, inputs, suggestions')
      .order('created_at', { ascending: false })
      .limit(20);
    window._aiSuggestHistory = error ? [] : (data || []);
    if (error) console.warn('AI history load failed:', error.message);
  } catch (e) {
    console.warn(e);
    window._aiSuggestHistory = [];
  }
  const el = document.getElementById('ais-history');
  if (el) el.innerHTML = renderAISuggestHistory();
}

function renderAISuggestHistory() {
  const h = window._aiSuggestHistory;
  if (h === null) return `<div style="font-size:.78rem;color:var(--text-3);padding:4px 2px;">Loading history…</div>`;
  if (!h.length) return `<div style="font-size:.78rem;color:var(--text-3);padding:4px 2px;">No history yet — your past generations will appear here.</div>`;
  const rows = h.map(r => {
    const d = new Date(r.created_at);
    const when = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const inp = r.inputs || {};
    const n = Array.isArray(r.suggestions) ? r.suggestions.length : 0;
    const label = [inp.category, inp.platform].filter(Boolean).map(escapeHtml).join(' · ') || 'Ideas';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 15px;border:1px solid var(--glass-border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow-xs);">
        <div style="min-width:0;">
          <div style="font-size:.84rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:2px;">${when} · ${n} ideas</div>
        </div>
        <button class="btn btn-ghost btn-xs" style="flex-shrink:0;" onclick="viewAISuggestHistory('${r.id}')">View</button>
      </div>`;
  }).join('');
  return `
    <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:13px;">
      <h3 style="margin:0;font-family:'Outfit',sans-serif;font-weight:700;font-size:1rem;color:var(--text);">History</h3>
      <span style="font-size:.72rem;color:var(--text-3);">Your last ${h.length} generations</span>
    </div>
    <div style="display:grid;gap:10px;max-width:660px;">${rows}</div>`;
}

function viewAISuggestHistory(id) {
  const h = (window._aiSuggestHistory || []).find(r => String(r.id) === String(id));
  if (!h) return;
  window._aiSuggestLast = Array.isArray(h.suggestions) ? h.suggestions : [];
  const results = document.getElementById('ais-results');
  if (results) {
    results.innerHTML = renderAISuggestionCards(window._aiSuggestLast);
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
