/* Aalynex Content AI v4 — consolidated staging integration. Account-bound, saved-result-first UI. */
(function () {
  'use strict';
  let state;
  const defaults = { category: '', subCategory: '', topic: '', platform: 'YouTube', language: 'Hinglish', country: 'India', audience: '', goal: 'Engagement', experience: 'Beginner', videoLength: 'Auto (platform fit)', creatorStyle: 'Any / flexible', timeBudget: 'Flexible', contentPillars: '', creatorIdentity: '', winningExamples: '', tone: '', resources: '', avoidTopics: '', extraContext: '' };
  function current() {
    const account = typeof CU !== 'undefined' ? CU : null;
    if (!state || state.account !== account) state = { account, draft: { ...defaults }, edited: false, loaded: false, loading: false, busy: false, quota: null, history: [], cursor: null, result: null, pending: null, notice: '', error: '', mounted: null };
    return state;
  }
  const active = s => current() === s && !!s.account;
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const options = (values, selected) => values.map(v => `<option${v === selected ? ' selected' : ''} value="${esc(v)}">${esc(v)}</option>`).join('');
  function pendingKey(s) { return 'aalynex-ai-pending:' + s.account.id; }
  function remember(s, id) { s.pending = id; try { if (id) sessionStorage.setItem(pendingKey(s), id); else sessionStorage.removeItem(pendingKey(s)); } catch (_) {} }
  function recovered(s) { try { return sessionStorage.getItem(pendingKey(s)); } catch (_) { return null; } }
  async function api(s, name, data) {
    const { data: auth, error } = await supaClient.auth.getSession();
    if (!active(s)) throw new Error('Account changed.');
    if (error || !auth.session || auth.session.user.id !== s.account.id) throw new Error('Session expired. Sign in again.');
    const response = await fetch(SUPABASE_URL + '/functions/v1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.session.access_token }, body: JSON.stringify(data), signal: AbortSignal.timeout(65000) });
    let value; try { value = await response.json(); } catch (_) { throw new Error('Service response could not be confirmed. Check request status before generating again.'); }
    if (!active(s)) throw new Error('Account changed.');
    if (!response.ok) { const e = new Error(value.message || 'Operation could not be completed.'); e.payload = value; e.status = response.status; throw e; }
    return value;
  }
  function update(s) { if (active(s) && s.mounted && s.mounted.isConnected) { s.mounted.innerHTML = markup(s); } }
  function quotaText(s) {
    const q = s.quota;
    if (!q) return 'Account allowance has not been loaded.';
    if (!q.configured) {
      const setup = q.setup || {};
      const base = setup.code === 'allowance_not_ready'
        ? 'Allowance setup pending: check the staging AI policy and feature switches.'
        : setup.code === 'provider_not_ready'
          ? 'Provider setup pending: check staging Groq environment configuration.'
          : 'Setup pending: refresh allowance or ask the operator to check staging configuration.';
      const checks = setup.checks;
      return base + (checks ? ' Staging diagnostics — database: ' + (checks.database_ready ? 'OK' : 'check')
        + ', Groq model: ' + (checks.model_supported ? 'OK' : 'check')
        + ', free-tier mode: ' + (checks.execution_mode_approved ? 'OK' : 'check')
        + ', key present: ' + (checks.groq_key_present ? 'OK' : 'check') + '.' : '');
    }
    const reset = q.reset_at ? new Date(q.reset_at).toLocaleString() : 'not available';
    return `${esc(q.remaining)} available · ${esc(q.used)} used · ${esc(q.held)} held · ${esc(q.limit)} monthly credits. Each idea set: ${esc(q.cost)} credits. Reset: ${esc(reset)} (${esc(q.reset_timezone)} policy; time shown locally).`;
  }
  function canGenerate(s) { return s.loaded && !s.loading && !s.busy && !s.pending && s.quota && s.quota.configured && Number.isFinite(s.quota.remaining) && s.quota.remaining >= s.quota.cost; }
  function input(s, name, label, max, required, hint) {
    return `<label class="ax-field">${esc(label)}${required ? ' *' : ''}<input name="${name}" maxlength="${max}" value="${esc(s.draft[name])}"${required ? ' required' : ''}>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  }
  function select(s, name, label, values) { return `<label class="ax-field">${esc(label)}<select name="${name}">${options(values, s.draft[name])}</select></label>`; }
  function textArea(s, name, label, max) { return `<label class="ax-field ax-wide">${esc(label)}<textarea name="${name}" maxlength="${max}" rows="3">${esc(s.draft[name])}</textarea></label>`; }
  function ideaText(idea) {
    const lines = [idea.topic, 'HOOK: ' + (idea.hook || ''), 'FIRST SHOT: ' + (idea.openingShot || ''),
      'ANGLE: ' + (idea.angle || ''), 'VIEWER PAYOFF: ' + (idea.viewerPayoff || ''),
      'AUDIENCE FIT: ' + (idea.audienceFit || idea.why || ''),
      'OUTLINE:', ...(Array.isArray(idea.outline) ? idea.outline.map((x,i)=>`${i+1}. ${x}`) : []),
      'VISUAL PLAN: ' + (idea.visualPlan || idea.thumbnailIdea || ''),
      'TITLES:', ...(Array.isArray(idea.titles) ? idea.titles : []),
      'CAPTION: ' + (idea.caption || ''),
      'HASHTAGS: ' + (Array.isArray(idea.hashtags) ? idea.hashtags.join(' ') : ''),
      'CTA: ' + (idea.cta || '')];
    return lines.filter(x => typeof x === 'string' && x.trim() && !/^\w+: $/.test(x)).join('\n');
  }
  function exportText(result) {
    const text = result.suggestions.map((v,i) => `IDEA ${i+1}\n${ideaText(v)}`).join('\n\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'aalynex-content-ideas.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function cards(result) {
    if (!result || !Array.isArray(result.suggestions)) return '';
    return `<section class="ax-results" aria-label="Saved idea set"><div class="ax-results-head"><h3>Your saved ideas</h3><button type="button" data-ai-action="export">Export all 5 as TXT</button></div><p>AI drafts, not verified research or guaranteed results. Review facts, rights and suitability before publishing.</p>${result.suggestions.map((raw, i) => {
      const idea = raw && typeof raw === 'object' ? raw : {};
      const modern = Array.isArray(idea.outline);
      const row = (label, value) => typeof value === 'string' && value ? `<h4>${label}</h4><p>${esc(value)}</p>` : '';
      return `<article class="ax-idea"><div class="ax-idea-top"><span>IDEA ${i + 1}${modern ? ' · ' + esc(idea.effort) + ' effort' : ' · Legacy saved idea'}</span><button type="button" data-ai-action="copy" data-index="${i}">Copy idea</button></div><h3>${esc(idea.topic || 'Untitled idea')}</h3>${row('Hook', idea.hook)}${row('Opening shot', idea.openingShot)}${row('Distinct angle', idea.angle)}${row('Viewer payoff', idea.viewerPayoff)}${row('Audience fit', idea.audienceFit || idea.why)}${modern ? `<h4>Execution outline</h4><ol>${idea.outline.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}${row('Visual plan', idea.visualPlan || idea.thumbnailIdea)}${row('Ready-to-edit caption', idea.caption)}${Array.isArray(idea.hashtags) ? `<h4>Hashtag ideas</h4><p>${idea.hashtags.map(esc).join(' ')}</p>` : ''}${Array.isArray(idea.titles) ? `<h4>Title options</h4><ul>${idea.titles.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${row('Call to action', idea.cta)}</article>`;
    }).join('')}</section>`;
  }
  function markup(s) {
    return `<section class="ax-ai"><header><span class="ax-eyebrow">CREATE WITH INTENT</span><h2>Content idea studio</h2><p>Ideas built around your audience, your style and the videos you can actually produce. Get five distinct, shoot-ready concepts with hooks, opening shots, a production outline, title options, captions and useful hashtags.</p></header><div class="ax-allowance" role="status">${quotaText(s)}</div><p class="ax-message" role="status" aria-live="polite">${esc(s.notice)}</p>${s.error ? `<p class="ax-error" role="alert">${esc(s.error)}</p>` : ''}${s.pending ? `<div class="ax-pending"><b>Generation awaiting confirmation</b><p>Do not submit another idea set. Credits may be held until its outcome is confirmed. No automatic retry or paid fallback.</p><button type="button" data-ai-action="status"${s.busy ? ' disabled' : ''}>Check request status</button></div>` : ''}<div class="ax-layout"><div><div class="ax-starters"><strong>Quick brief starters</strong><span>Use a sample, then customize every field.</span><div class="ax-starter-actions"><button type="button" data-ai-action="preset" data-index="0">🎓 Education</button><button type="button" data-ai-action="preset" data-index="1">🍲 Food</button><button type="button" data-ai-action="preset" data-index="2">💻 Technology</button><button type="button" data-ai-action="preset" data-index="3">🏪 Small business</button></div></div><form data-ai-form><fieldset class="ax-form-grid"${s.busy ? ' disabled' : ''}>${input(s, 'category', 'Your niche / category', 120, true, 'Example: budget cooking for college students')}${input(s, 'topic', 'Topic focus (optional)', 320)}${select(s, 'platform', 'Format / platform', ['YouTube', 'YouTube Shorts', 'Instagram Reels', 'Instagram', 'LinkedIn'])}${select(s, 'language', 'Output language', ['Hinglish', 'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi'])}${input(s, 'audience', 'Who is this for?', 400, true, 'Age, interests, problems and level of knowledge')}${select(s, 'goal', 'Your goal', ['Views', 'Subscribers', 'Engagement', 'Sales', 'Brand Building'])}${select(s, 'videoLength', 'Target video duration', ['Auto (platform fit)', 'Under 30 seconds', '30–60 seconds', '1–3 minutes', '5–8 minutes', '8–15 minutes', '15+ minutes'])}${select(s, 'creatorStyle', 'How you make videos', ['Any / flexible', 'On-camera', 'Faceless', 'Voiceover + B-roll', 'Screen recording', 'Mixed'])}${select(s, 'timeBudget', 'Production time available', ['Flexible', 'Under 1 hour', '1–3 hours', 'Half a day', 'Multi-day project'])}${input(s, 'country', 'Audience location', 80)}${select(s, 'experience', 'Creator stage', ['Beginner', 'Growing', 'Established'])}${input(s, 'tone', 'Voice / tone', 160)}${input(s, 'resources', 'Available resources', 400, false, 'Example: phone camera, solo, no face, two hours')}${input(s, 'subCategory', 'Sub-niche', 160)}${textArea(s, 'contentPillars', 'Your content pillars (2–4 themes)', 400)}${textArea(s, 'creatorIdentity', 'What makes your channel different?', 400)}${textArea(s, 'winningExamples', 'What worked before? Optional examples (your own experience)', 600)}${textArea(s, 'avoidTopics', 'Topics or styles to avoid', 1200)}${textArea(s, 'extraContext', 'Extra context / what has worked before', 1200)}</fieldset><div class="ax-actions"><button type="submit" class="ax-primary"${canGenerate(s) ? '' : ' disabled'}>${s.busy ? 'Working…' : 'Generate 5 ideas'}</button><button type="button" data-ai-action="save"${s.busy || !s.loaded ? ' disabled' : ''}>Save my brief</button><button type="button" data-ai-action="refresh"${s.busy || s.loading ? ' disabled' : ''}>Refresh allowance / history</button></div><p class="ax-note">Required fields are marked *. Completed results save automatically to your account. Saved history is free to read. No channel URL is fetched or analysed here.</p></form>${cards(s.result)}</div><aside class="ax-history"><h3>Saved history</h3><p>Your account only · newest first</p>${s.loading ? '<p>Loading…</p>' : ''}${!s.history.length && s.loaded ? '<p>No saved idea sets yet.</p>' : ''}${s.history.map((item, index) => `<button type="button" class="ax-history-item" data-ai-action="history" data-index="${index}"><strong>${esc(item.inputs && item.inputs.category || 'Saved idea set')}</strong><span>${esc(new Date(item.created_at).toLocaleString())}</span><span>${esc(item.inputs && item.inputs.platform || 'Previous generation')}</span></button>`).join('')}${s.cursor ? `<button type="button" data-ai-action="more"${s.busy || s.loading ? ' disabled' : ''}>Load older results</button>` : ''}</aside></div></section>`;
  }
  const presets = [
    {category:'Career and study skills',subCategory:'Practical student career choices',audience:'Class 11–12 students in small Indian towns',platform:'YouTube Shorts',videoLength:'30–60 seconds',creatorStyle:'Faceless',resources:'Smartphone, notebook, natural light',contentPillars:'Career myths; practical steps; useful skills'},
    {category:'Affordable home cooking',subCategory:'Simple vegetarian meals',audience:'Indian students and first-time cooks',platform:'Instagram Reels',videoLength:'30–60 seconds',creatorStyle:'Voiceover + B-roll',resources:'One phone, home kitchen, everyday ingredients',contentPillars:'Easy meals; substitutions; food safety'},
    {category:'Technology tutorials',subCategory:'Useful phone productivity',audience:'Beginners using Android phones',platform:'YouTube',videoLength:'5–8 minutes',creatorStyle:'Screen recording',resources:'Android phone, free screen recorder',contentPillars:'How-to demos; privacy tips; accessible tools'},
    {category:'Local small business marketing',subCategory:'Practical social media',audience:'New Indian shop owners with limited budgets',platform:'Instagram Reels',videoLength:'Under 30 seconds',creatorStyle:'On-camera',resources:'One phone, shop counter, no advertising budget',contentPillars:'Product demonstrations; customer questions; trustworthy offers'}
  ];
  async function load(s, more) {
    if (!active(s) || s.loading) return;
    s.loading = true; s.error = ''; update(s);
    try {
      const data = await api(s, 'ai-workspace', { action: more ? 'history' : 'bootstrap', ...(more ? { cursor: s.cursor } : {}) });
      if (!active(s)) return;
      s.history = more ? s.history.concat(data.history.filter(x => !s.history.some(y => y.id === x.id))) : data.history;
      s.cursor = data.cursor;
      if (!more) {
        s.quota = data.quota;
        if (!s.edited && data.brief) s.draft = { ...defaults, ...data.brief };
        // Authoritative server pending state. Clear a stale sessionStorage ID when
        // the server confirms there is no open request for this account.
        if (data.quota && Object.hasOwn(data.quota, 'pending')) {
          remember(s, data.quota.pending && data.quota.pending.id || null);
        } else {
          const id = recovered(s);
          if (id) remember(s, id);
        }
        s.loaded = true;
      }
    } catch (e) { if (active(s)) s.error = e.message; }
    finally { if (active(s)) { s.loading = false; update(s); } }
  }
  function accept(s, data) {
    if (!active(s)) return;
    if (data.quota) s.quota = data.quota; else if (data.status === 'completed') s.quota = null;
    if (data.status === 'completed' && data.result) {
      remember(s, null); s.result = data.result;
      s.notice = 'Idea set confirmed saved. Your completed-result allowance has been updated.';
      if (!s.history.some(x => x.id === data.result.id)) s.history.unshift({ ...data.result, inputs: { ...s.draft } });
    } else if (data.status === 'failed') { remember(s, null); s.notice = 'Previous request did not complete. Its credit hold was released. You may make a new request.'; }
    else { if (data.requestId) remember(s, data.requestId); s.notice = data.message || 'Request is still pending. Check its status before generating again.'; }
  }
  async function run(s, action) {
    if (!active(s) || s.busy) return;
    const form = s.mounted && s.mounted.querySelector('form');
    if (['generate', 'save'].includes(action) && form && !form.reportValidity()) return;
    if (action === 'generate' && !canGenerate(s)) return;
    s.busy = true; s.error = ''; s.notice = ''; update(s);
    try {
      if (action === 'generate') {
        const id = crypto.randomUUID(); remember(s, id); update(s);
        accept(s, await api(s, 'ai-suggest', { requestId: id, brief: { ...s.draft } }));
      } else if (action === 'status') {
        accept(s, await api(s, 'ai-workspace', { action: 'status', requestId: s.pending }));
      } else if (action === 'save') {
        await api(s, 'ai-workspace', { action: 'save_brief', brief: { ...s.draft } });
        if (active(s)) s.notice = 'Creator brief confirmed saved to your account.';
      }
    } catch (e) {
      if (active(s)) {
        if (e.payload && e.payload.quota) s.quota = e.payload.quota;
        // Only explicit pre-provider rejection / known failed responses permit a new request.
        if (action === 'generate' && e.payload && ['invalid_input', 'not_configured', 'quota_exceeded', 'daily_capacity', 'rate_limited', 'provider_unavailable', 'invalid_output', 'duplicate_output', 'history_unavailable'].includes(e.payload.error)) {
          remember(s, e.payload.quota && e.payload.quota.pending ? e.payload.quota.pending.id : null);
          // Missing post-failure quota must be re-read, never reused for another spend.
          if (!e.payload.quota) s.quota = null;
        }
        s.error = e.message;
      }
    } finally { if (active(s)) { s.busy = false; update(s); } }
  }
  function mount(host, quiet) {
    const s = current(); if (!s.account || !host) return;
    if (quiet && s.mounted && host.contains(s.mounted)) return;
    host.innerHTML = '<div data-ai-root></div>'; s.mounted = host.firstElementChild; update(s);
    if (!s.loaded && !s.loading) load(s, false);
  }
  const original = window.renderC;
  window.renderC = function (page, quiet) { if (page === 'aisuggest') return mount(document.getElementById('c-main'), quiet); return original.apply(this, arguments); };
  window.renderAISuggest = () => markup(current());
  window.generateAISuggestions = () => run(current(), 'generate');
  window.viewAISuggestHistory = id => { const s = current(); s.result = s.history.find(x => x.id === id) || null; update(s); };
  document.addEventListener('input', event => {
    const s = current(), el = event.target;
    if (s.mounted && s.mounted.contains(el) && el.name && Object.hasOwn(defaults, el.name)) { s.draft[el.name] = el.value; s.edited = true; }
  });
  document.addEventListener('change', event => {
    const s = current(), el = event.target;
    if (s.mounted && s.mounted.contains(el) && el.name && Object.hasOwn(defaults, el.name)) { s.draft[el.name] = el.value; s.edited = true; }
  });
  document.addEventListener('submit', event => { if (!event.target.matches('[data-ai-form]')) return; event.preventDefault(); run(current(), 'generate'); });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ai-action]'); if (!el) return;
    const s = current(); if (!s.mounted || !s.mounted.contains(el) || el.disabled) return;
    const action = el.dataset.aiAction;
    if (['save', 'status'].includes(action)) return run(s, action);
    if (action === 'export' && s.result && Array.isArray(s.result.suggestions)) return exportText(s.result);
    if (action === 'preset') {
      const i=Number(el.dataset.index);
      if (!Number.isInteger(i) || !presets[i] || s.busy) return;
      s.draft={ ...defaults, ...presets[i] };s.edited=true;
      s.notice='Starter loaded. Customize it before generating; your previous saved brief is unchanged until you press Save my brief.';
      return update(s);
    }
    if (action === 'refresh') return load(s, false);
    if (action === 'more' && s.cursor) return load(s, true);
    const index = Number(el.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    if (action === 'history' && s.history[index]) { s.result = s.history[index]; s.notice = 'Showing a previously saved idea set. No generation credits used.'; return update(s); }
    if (action === 'copy' && s.result && s.result.suggestions[index]) {
      const raw = s.result.suggestions[index];
      const x = raw && typeof raw === 'object' ? raw : {};
      const content = ideaText(x);
      try { await navigator.clipboard.writeText(content); if (active(s)) s.notice = 'Idea copied.'; } catch (_) { if (active(s)) s.error = 'Clipboard unavailable. Select and copy the idea text manually.'; }
      update(s);
    }
  });
})();
