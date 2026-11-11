/* Aalynex Content AI v6 — unified Ideas + Scripts. Keeps Classic Premium ideas and Razorpay billing unchanged. */
(function () {
  'use strict';
  let state;
  const defaults = { category: '', subCategory: '', topic: '', platform: 'YouTube', language: 'Hinglish', country: 'India', audience: '', goal: 'Engagement', experience: 'Beginner', videoLength: 'Auto (platform fit)', creatorStyle: 'Any / flexible', timeBudget: 'Flexible', contentPillars: '', creatorIdentity: '', winningExamples: '', tone: '', resources: '', avoidTopics: '', extraContext: '' };
  function current() {
    const account = typeof CU !== 'undefined' ? CU : null;
    if (!state || state.accountId !== (account && account.id)) state = { account, accountId: account && account.id, draft: { ...defaults }, edited: false, loaded: false, loading: false, busy: false, quota: null, history: [], cursor: null, result: null, lastIdeas: null, libraryFilter: 'all', pending: null, notice: '', error: '', mounted: null, mode: 'studio' };
    else state.account = account; // A profile save can replace CU without changing the signed-in user.
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
    // Use the SAME Supabase project and session as Aalynex login; never hardcode staging.
    if (!supaClient || typeof SUPABASE_URL !== 'string' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(SUPABASE_URL) || supaClient.supabaseUrl.replace(/\/$/, '') !== SUPABASE_URL) {
      throw new Error('Aalynex Supabase configuration mismatch. No AI request started.');
    }
    const publicKey = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
    if (!publicKey || /secret|service.role/i.test(publicKey)) throw new Error('Public Supabase key missing. Ask the site operator to check the main configuration.');
    const response = await fetch(SUPABASE_URL + '/functions/v1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publicKey, Authorization: 'Bearer ' + auth.session.access_token }, cache: 'no-store', body: JSON.stringify(data), signal: AbortSignal.timeout(65000) });
    let value; try { value = await response.json(); } catch (_) { throw new Error('Service response could not be confirmed. Check request status before generating again.'); }
    if (!active(s)) throw new Error('Account changed.');
    if (!response.ok) { const e = new Error(value.message || 'Operation could not be completed.'); e.payload = value; e.status = response.status; throw e; }
    return value;
  }
  function update(s) {
    if (!active(s) || !s.mounted || !s.mounted.isConnected) return;
    const focused = s.mounted.contains(document.activeElement) ? document.activeElement : null;
    const action = focused && focused.dataset ? focused.dataset.aiAction : null;
    const filter = focused && focused.dataset ? focused.dataset.filter : null;
    s.mounted.innerHTML = markup(s);
    if (action) {
      const candidate = Array.from(s.mounted.querySelectorAll('[data-ai-action]')).find(el =>
        el.dataset.aiAction === action && (filter == null || el.dataset.filter === filter));
      if (candidate && !candidate.disabled) candidate.focus({preventScroll: true});
    }
  }
  function quotaText(s) {
    const q = s.quota;
    if (!q) return 'Account allowance has not been loaded.';
    if (!q.configured) {
      const setup = q.setup || {};
      const base = setup.code === 'premium_required'
        ? 'Unlock Aalynex Premium to generate ideas and scripts. Existing subscriptions use Razorpay.'
        : setup.code === 'allowance_not_ready'
        ? 'AI credits are not active yet. Your previous work is safe.'
        : setup.code === 'provider_not_ready'
          ? 'AI provider connection is being prepared. No credits can be spent.'
          : setup.code === 'release_disabled'
            ? 'Content AI is paused for launch safety. You can still explore your saved work.'
            : setup.code === 'pilot_only'
              ? 'Content AI is being tested with a small pilot group. Your saved ideas remain available.'
              : 'AI setup is being checked. No credits will be spent until ready.';
      return base; // No staging/provider configuration diagnostics in production UI.
    }
    const reset = q.reset_at ? new Date(q.reset_at).toLocaleString() : 'not available';
    return `${esc(q.remaining)} available · ${esc(q.used)} used · ${esc(q.held)} held · ${esc(q.limit)} monthly credits. Idea set or selected script: ${esc(q.cost)} credit(s). Reset: ${esc(reset)} (${esc(q.reset_timezone)} policy; time shown locally).`;
  }
  function canGenerate(s) { return s.loaded && !s.loading && !s.busy && !s.pending && s.quota && s.quota.premium_active === true && s.quota.configured && Number.isFinite(s.quota.remaining) && s.quota.remaining >= s.quota.cost; }
  function input(s, name, label, max, required, hint) {
    return `<label class="ax-field">${esc(label)}${required ? ' *' : ''}<input name="${name}" maxlength="${max}" value="${esc(s.draft[name])}"${required ? ' required' : ''}>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  }
  function select(s, name, label, values) { return `<label class="ax-field">${esc(label)}<select name="${name}">${options(values, s.draft[name])}</select></label>`; }
  function textArea(s, name, label, max) { return `<label class="ax-field ax-wide">${esc(label)}<textarea name="${name}" maxlength="${max}" rows="3">${esc(s.draft[name])}</textarea></label>`; }
  function isScript(result) {
    return !!(result && Array.isArray(result.suggestions) && result.suggestions[0] && result.suggestions[0].kind === 'script');
  }
  function ideaText(idea) {
    if (idea && idea.kind === 'script') return [
      idea.title, `FORMAT: ${idea.format}`, `DURATION: ${idea.durationSeconds}s`,
      `HOOK: ${idea.hook}`, `VOICEOVER:\n${idea.voiceover}`, `COVER TEXT: ${idea.coverText}`,
      'SCENES:', ...(idea.scenes || []).map(x => `${x.startSecond}–${x.endSecond}s | VO: ${x.narration}\nVISUAL: ${x.visual}\nSCREEN: ${x.onScreenText}\nEDIT: ${x.editNote}`),
      `CAPTION: ${idea.caption}`, `HASHTAGS: ${(idea.hashtags || []).join(' ')}`,
      `CTA: ${idea.cta}`, 'FACT-CHECK BEFORE PUBLISHING:', ...(idea.factChecks || [])
    ].join('\n\n');
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
    const content = result.suggestions.map((v,i) => `${isScript(result) ? 'SCRIPT' : 'IDEA '+(i+1)}\n${ideaText(v)}`).join('\n\n---\n\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = isScript(result) ? 'aalynex-video-script.txt' : 'aalynex-content-ideas.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function row(label, value) {
    return typeof value === 'string' && value ? `<section class="ax-data"><h4>${label}</h4><p>${esc(value)}</p></section>` : '';
  }
  function cards(result, s) {
    if (!result || !Array.isArray(result.suggestions)) return `<div class="ax-empty"><div class="ax-empty-art">✦</div><h3>Your creative workspace is ready.</h3><p>Fill your creator brief, generate ideas and expand your favourite into a production script. Your work is saved privately to your account.</p></div>`;
    const scriptMode = isScript(result);
    if (scriptMode) {
      const x = result.suggestions[0];
      return `<section class="ax-results" aria-label="Saved script"><div class="ax-results-head"><div><span class="ax-eyebrow">PRODUCTION STUDIO</span><h3>Ready to shoot, step by step</h3></div><div class="ax-result-actions">${s.lastIdeas ? '<button type="button" data-ai-action="back">← Back to ideas</button>' : ''}<button type="button" data-ai-action="export">↓ Export script</button></div></div><article class="ax-idea ax-script"><div class="ax-idea-top"><span class="ax-tag">${esc(x.format === 'production_treatment' ? 'LONG-FORM TREATMENT' : 'SHORT-FORM SCRIPT')}</span><span class="ax-tag ax-tag-muted">${esc(x.durationSeconds)} seconds</span></div><h3>${esc(x.title)}</h3><div class="ax-script-highlight">${row('Opening hook', x.hook)}${row('Cover text', x.coverText)}</div>${row('Voiceover / narration', x.voiceover)}<h4 class="ax-section-title">Scene-by-scene production plan</h4><div class="ax-timeline">${(x.scenes || []).map((scene,i)=>`<div class="ax-scene"><span class="ax-scene-time">${esc(scene.startSecond)}–${esc(scene.endSecond)}s</span><div><strong>Scene ${i+1}</strong><p>${esc(scene.narration)}</p><small><b>Visual:</b> ${esc(scene.visual)}</small><small><b>On screen:</b> ${esc(scene.onScreenText)}</small><small><b>Edit:</b> ${esc(scene.editNote)}</small></div></div>`).join('')}</div>${row('Caption',x.caption)}<section class="ax-data"><h4>Hashtags</h4><p>${(x.hashtags || []).map(esc).join(' ')}</p></section>${row('Call to action',x.cta)}<div class="ax-fact-check"><strong>Before publishing</strong><p>${(x.factChecks || []).length ? 'Verify these details independently:' : 'Review the draft for accuracy, consent and suitability.'}</p>${(x.factChecks || []).length ? '<ul>'+x.factChecks.map(t=>`<li>${esc(t)}</li>`).join('')+'</ul>':''}</div><div class="ax-card-actions"><button type="button" data-ai-action="copy" data-index="0">Copy full script</button></div></article></section>`;
    }
    return `<section class="ax-results" aria-label="Saved idea set"><div class="ax-results-head"><div><span class="ax-eyebrow">FRESH FROM YOUR BRIEF</span><h3>Five ideas, five creative directions</h3><p>Choose an idea to build a script. Never treat generated claims as verified research.</p></div><button type="button" data-ai-action="export">↓ Export all</button></div><div class="ax-results-list">${result.suggestions.map((raw,i)=>{
      const idea=raw && typeof raw==='object' ? raw : {};
      const modern=Array.isArray(idea.outline);
      return `<article class="ax-idea"><div class="ax-idea-top"><span class="ax-tag">IDEA ${String(i+1).padStart(2,'0')}</span><span class="ax-tag ax-tag-muted">${esc(idea.effort || 'Legacy')} effort</span></div><h3>${esc(idea.topic || 'Untitled idea')}</h3><p class="ax-idea-hook">“${esc(idea.hook || '')}”</p><details class="ax-idea-details" ${''}><summary>View creative brief <span>⌄</span></summary><div class="ax-detail-grid">${row('First 3 seconds',idea.openingShot)}${row('Distinct angle',idea.angle)}${row('Viewer payoff',idea.viewerPayoff)}${row('Why your audience cares',idea.audienceFit||idea.why)}</div>${modern?`<section class="ax-data"><h4>Execution outline</h4><ol>${idea.outline.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>`:''}${row('Visual / edit plan',idea.visualPlan||idea.thumbnailIdea)}${row('Caption',idea.caption)}${Array.isArray(idea.hashtags)?`<section class="ax-data"><h4>Hashtags</h4><p>${idea.hashtags.map(esc).join(' ')}</p></section>`:''}${Array.isArray(idea.titles)?`<section class="ax-data"><h4>Title options</h4><ul>${idea.titles.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}${row('Call to action',idea.cta)}</details><div class="ax-card-actions"><button type="button" data-ai-action="copy" data-index="${i}">Copy idea</button><button type="button" class="ax-primary" data-ai-action="script" data-index="${i}" ${canGenerate(s) ? '' : 'disabled'}>✦ Generate script · 1 credit</button></div></article>`;
    }).join('')}</div></section>`;
  }
  // V8 compact workspace presentation. Deliberately retains the V6 data and action contracts.
  function markup(s) {
    const q = s.quota;
    const ready = canGenerate(s);
    const available = q && Number.isFinite(q.remaining) ? q.remaining : '—';
    const max = q && Number.isFinite(q.limit) ? q.limit : 15;
    const used = q && Number.isFinite(q.used) ? q.used : 0;
    const isClassic = s.mode === 'classic';
    const tabs = `<div class="ax8-mode" role="tablist" aria-label="Idea generation mode">
      <button type="button" role="tab" aria-selected="${!isClassic}" data-ai-action="studio" class="${!isClassic ? 'is-active' : ''}"><span>Ideas + Scripts</span><small>Creative workspace</small></button>
      <button type="button" role="tab" aria-selected="${isClassic}" data-ai-action="classic" class="${isClassic ? 'is-active' : ''}"><span>Classic Ideas</span><small>30 generations / month</small></button>
    </div>`;
    const toolbar = `<header class="ax8-toolbar">
      <div class="ax8-heading"><span class="ax8-eyebrow">AALYNEX / CREATOR TOOLS</span><h1>Idea studio</h1><p>Plan smarter content. Create ready-to-use ideas and scripts.</p></div>
      ${tabs}
    </header>`;
    if (isClassic) return `<section class="ax-ai ax8-workspace ax8-classic-mode">${toolbar}
      <div class="ax8-classic-shell" role="tabpanel" aria-label="Classic Ideas">
        <div class="ax8-classic-lead"><div><h2>Classic idea generator</h2><p>Original Premium ideas, saved history and monthly allowance.</p></div><span class="ax8-classic-pill">Classic</span></div>
        <div class="ax8-classic-body">${typeof renderAISuggest === 'function' ? renderAISuggest() : '<div class="ax8-fallback">Classic Ideas is unavailable. Please refresh the page.</div>'}</div>
      </div></section>`;
    const premiumCTA = s.loaded && q && q.premium_active !== true ? `<div class="ax8-notice ax8-locked" role="status"><div><strong>Premium needed for generation</strong><p>Your saved work is available. Upgrade to generate new ideas or scripts.</p></div><button type="button" data-ai-action="subscribe">View plan</button></div>` : '';
    const note = s.notice ? `<p class="ax8-notice ax8-good" role="status" aria-live="polite">${esc(s.notice)}</p>` : '';
    const error = s.error ? `<div class="ax8-notice ax8-bad" role="alert"><div><strong>We couldn't complete that action</strong><p>Your brief is safe. If a generation started, check its status before retrying.</p><details><summary>Details</summary><p>${esc(s.error)}</p></details></div><button type="button" data-ai-action="refresh" ${s.loading ? 'disabled' : ''}>Refresh</button></div>` : '';
    const pending = s.pending ? `<div class="ax8-notice ax8-pending" role="status"><div><strong>Previous request pending</strong><p>Check its status first to avoid duplicate credit use.</p></div><button type="button" data-ai-action="status" ${s.busy ? 'disabled' : ''}>Check status</button></div>` : '';
    const skeleton = `<div class="ax8-generating" role="status" aria-live="polite" aria-busy="true">
      <div class="ax8-generating-title"><span class="ax8-spinner" aria-hidden="true"></span><div><strong>${s.busyAction === 'script' ? 'Writing your script…' : 'Generating your ideas…'}</strong><p>Creating your content. You can review it here once complete.</p></div></div>
      <div class="ax8-skeletons" aria-hidden="true">${[0,1,2].map(() => '<div class="ax8-skeleton"><i></i><b></b><em></em><em></em></div>').join('')}</div>
    </div>`;
    const resultContent = s.busy && (s.busyAction === 'generate' || s.busyAction === 'script') ? skeleton : cards(s.result, s);
    const filters = ['all','ideas','scripts'].map(f=>`<button type="button" data-ai-action="filter" data-filter="${f}" aria-pressed="${s.libraryFilter===f}" class="${s.libraryFilter===f?'active':''}">${f==='all'?'All':f==='ideas'?'Ideas':'Scripts'}</button>`).join('');
    const history = s.history.map((item,index) => (s.libraryFilter==='all' || (s.libraryFilter==='scripts'&&isScript(item)) || (s.libraryFilter==='ideas'&&!isScript(item))) ?
      `<button type="button" class="ax8-history-item" data-ai-action="history" data-index="${index}"><span class="ax8-history-icon">${isScript(item)?'✎':'✦'}</span><span><strong>${esc(isScript(item)?(item.suggestions?.[0]?.title||'Saved video script'):(item.inputs?.category||'Idea set'))}</strong><small>${esc(new Date(item.created_at).toLocaleDateString())} · ${isScript(item)?'Script':esc(item.inputs?.platform||'Ideas')}</small></span><span aria-hidden="true">↗</span></button>` : '').join('');
    return `<section class="ax-ai ax8-workspace" role="tabpanel" aria-label="Ideas and scripts">
      ${toolbar}${premiumCTA}${note}${error}${pending}
      <div class="ax8-grid">
        <section class="ax8-controls" aria-label="Creator brief">
          <div class="ax8-controls-head"><div><span class="ax8-eyebrow">NEW GENERATION</span><h2>Your content brief</h2></div><span class="ax8-setup-label">${ready?'Ready':s.loading?'Loading…':s.busy?'Working…':'Brief'}</span></div>
          <div class="ax8-starters"><span>Quick start</span><div class="ax8-preset-list">
            <button type="button" data-ai-action="preset" data-index="0">Education</button><button type="button" data-ai-action="preset" data-index="1">Food</button><button type="button" data-ai-action="preset" data-index="2">Technology</button><button type="button" data-ai-action="preset" data-index="3">Business</button>
          </div></div>
          <form data-ai-form>
            <fieldset class="ax8-form-grid" ${s.busy?'disabled':''}>
              ${input(s,'category','Content niche',120,true)}
              ${input(s,'topic','Topic focus',320)}
              ${select(s,'platform','Platform',['YouTube','YouTube Shorts','Instagram Reels','Instagram','LinkedIn'])}
              ${select(s,'language','Language',['Hinglish','Hindi','English','Tamil','Telugu','Bengali','Marathi'])}
              ${input(s,'audience','Target audience',400,true)}
              ${select(s,'goal','Your goal',['Views','Subscribers','Engagement','Sales','Brand Building'])}
            </fieldset>
            <details class="ax8-advanced"><summary>Advanced settings <small>Optional personalization</small></summary><fieldset class="ax8-form-grid" ${s.busy?'disabled':''}>
              ${select(s,'videoLength','Video length',['Auto (platform fit)','Under 30 seconds','30–60 seconds','1–3 minutes','5–8 minutes','8–15 minutes','15+ minutes'])}
              ${select(s,'creatorStyle','How you film',['Any / flexible','On-camera','Faceless','Voiceover + B-roll','Screen recording','Mixed'])}
              ${select(s,'timeBudget','Production time',['Flexible','Under 1 hour','1–3 hours','Half a day','Multi-day project'])}
              ${input(s,'country','Audience country',80)}
              ${select(s,'experience','Experience',['Beginner','Growing','Established'])}
              ${input(s,'tone','Voice and tone',160)}
              ${input(s,'resources','Your equipment',400)}
              ${input(s,'subCategory','Sub-niche',160)}
              ${textArea(s,'contentPillars','Content pillars',400)}
              ${textArea(s,'creatorIdentity','Your unique perspective',400)}
              ${textArea(s,'winningExamples','What worked before?',600)}
              ${textArea(s,'avoidTopics','Topics to avoid',1200)}
              ${textArea(s,'extraContext','Additional notes',1200)}
            </fieldset></details>
            <div class="ax8-form-actions"><button class="ax-primary ax8-generate" type="submit" ${ready?'':'disabled'}>${s.busy?'<span class="ax8-spinner" aria-hidden="true"></span> Generating…':'✦ Generate 5 ideas'}<span class="ax8-action-cost">1 credit</span></button><button type="button" data-ai-action="save" class="ax8-save" ${s.busy||!s.loaded?'disabled':''}>Save brief</button></div>
          </form>
          <p class="ax8-footnote">Saved automatically after generation. No live trends or channel data are fetched.</p>
        </section>
        <main class="ax8-output" id="ax8-output" aria-label="Generated content">
          <div class="ax8-output-head"><div><span class="ax8-eyebrow">YOUR RESULTS</span><h2>${s.busy?'Generating…':s.result?(isScript(s.result)?'Video script':'Generated ideas'):'Ideas will appear here'}</h2></div>
            <div class="ax8-credit-chip" aria-label="Monthly creative credit balance"><strong>${esc(available)}<span> / ${esc(max)}</span></strong><small>credits left</small></div></div>
          <div class="ax8-result-content">${resultContent}</div>
          <details class="ax8-credit-details"><summary>Monthly usage and reset</summary><p>${esc(quotaText(s))} · ${esc(used)} used</p></details>
          <section class="ax8-library" aria-label="Saved creations">
            <button type="button" class="ax8-library-trigger" data-ai-action="library" aria-expanded="${!!s.libraryOpen}"><span><strong>Saved creations</strong><small>${s.history.length} items in your library</small></span><span aria-hidden="true">${s.libraryOpen?'−':'+'}</span></button>
            <div class="ax8-library-body" ${s.libraryOpen?'':'hidden'}><div class="ax8-library-filters" role="group" aria-label="Filter saved creations">${filters}</div>
            ${s.loading?'<p class="ax8-library-empty">Loading…</p>':''}
            ${!s.history.length&&s.loaded?'<p class="ax8-library-empty">Your generated ideas and scripts will appear here.</p>':''}
            <div class="ax8-history-list">${history}</div>
            ${s.cursor?`<button type="button" class="ax8-load-more" data-ai-action="more" ${s.busy||s.loading?'disabled':''}>Load older work</button>`:''}</div>
          </section>
        </main>
      </div>
    </section>`;
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
      const data = await api(s, 'content-ai-v6-premium-workspace', { action: more ? 'history' : 'bootstrap', ...(more ? { cursor: s.cursor } : {}) });
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
      s.notice = isScript(data.result) ? 'Video script saved to your account. One credit used.' : 'Five new ideas saved. One credit used.';
      if (!s.history.some(x => x.id === data.result.id)) s.history.unshift({ ...data.result, inputs: isScript(data.result) ? { ...s.draft, __contentAiMode:'script' } : { ...s.draft } });
    } else if (data.status === 'failed') { remember(s, null); s.notice = 'Previous request did not complete. Its credit hold was released. You may make a new request.'; }
    else { if (data.requestId) remember(s, data.requestId); s.notice = data.message || 'Request is still pending. Check its status before generating again.'; }
  }
  async function run(s, action, index) {
    if (!active(s) || s.busy) return;
    const form = s.mounted && s.mounted.querySelector('form');
    if (['generate', 'save'].includes(action) && form && !form.reportValidity()) return;
    if (['generate','script'].includes(action) && !canGenerate(s)) return;
    s.busy = true; s.busyAction = action; s.error = ''; s.notice = ''; update(s);
    try {
      if (action === 'generate') {
        const id = crypto.randomUUID(); remember(s, id); update(s);
        accept(s, await api(s, 'content-ai-v6-premium-generate', { mode:'ideas', requestId: id, brief: { ...s.draft } }));
      } else if (action === 'script') {
        if (!s.result || isScript(s.result) || !Number.isInteger(index) || index < 0 || index > 4) return;
        const sourceResultId = s.result.id;
        if (!sourceResultId) throw new Error('Save or reload the idea set before expanding a script.');
        s.lastIdeas = s.result;
        const id = crypto.randomUUID(); remember(s, id); update(s);
        accept(s, await api(s, 'content-ai-v6-premium-generate', { mode:'script', requestId:id, sourceResultId, ideaIndex:index }));
      } else if (action === 'status') {
        accept(s, await api(s, 'content-ai-v6-premium-workspace', { action: 'status', requestId: s.pending }));
      } else if (action === 'save') {
        await api(s, 'content-ai-v6-premium-workspace', { action: 'save_brief', brief: { ...s.draft } });
        if (active(s)) s.notice = 'Creator brief confirmed saved to your account.';
      }
    } catch (e) {
      if (active(s)) {
        if (e.payload && e.payload.quota) s.quota = e.payload.quota;
        // Only explicit pre-provider rejection / known failed responses permit a new request.
        if (['generate','script'].includes(action) && e.payload && ['invalid_input', 'not_configured', 'quota_exceeded', 'daily_capacity', 'rate_limited', 'provider_unavailable', 'invalid_output', 'duplicate_output', 'history_unavailable'].includes(e.payload.error)) {
          remember(s, e.payload.quota && e.payload.quota.pending ? e.payload.quota.pending.id : null);
          // Missing post-failure quota must be re-read, never reused for another spend.
          if (!e.payload.quota) s.quota = null;
        }
        s.error = e.message;
      }
    } finally { if (active(s)) { s.busy = false; s.busyAction = null; update(s); } }
  }
  function mount(host, quiet) {
    const s = current(); if (!s.account || !host) return;
    if (quiet && s.mounted && host.contains(s.mounted)) return;
    host.innerHTML = '<div data-ai-root></div>'; s.mounted = host.firstElementChild; update(s);
    if (!s.loaded && !s.loading) load(s, false);
  }
  // Logout/login lifecycle: clear the previous account's private in-memory work.
  if (typeof supaClient !== 'undefined' && supaClient && supaClient.auth && supaClient.auth.onAuthStateChange) {
    supaClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (state) { state.mounted = null; state = null; }
      }
    });
  }
  const original = window.renderC;
  window.renderC = function (page, quiet) { if (page === 'contentai') return mount(document.getElementById('c-main'), quiet); return original.apply(this, arguments); };
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
    if (action === 'studio') { if (s.mode !== 'studio') { s.mode='studio'; update(s); } return; }
    if (action === 'classic') { if (s.mode !== 'classic') { s.mode='classic'; update(s); if (typeof loadAISuggestHistory==='function') loadAISuggestHistory(); } return; }
    if (action === 'subscribe') { if (typeof openPremiumModal==='function') { openPremiumModal(); const modal=document.getElementById('modal-body'); if (modal && !modal.querySelector('[data-ai-premium-copy]')) { const line=document.createElement('p'); line.dataset.aiPremiumCopy='yes'; line.className='ax-checkout-note'; line.textContent='Premium also includes Content AI Studio: 15 creative credits/month for ideas and full video scripts, plus your existing Classic Ideas and Thumbnail Maker benefits.'; modal.appendChild(line); } } else { s.error='Premium checkout is unavailable. Please try again later.'; update(s); } return; }
    if (action === 'library') { s.libraryOpen = !s.libraryOpen; return update(s); }
    if (['save', 'status'].includes(action)) return run(s, action);
    if (action === 'filter' && ['all','ideas','scripts'].includes(el.dataset.filter)) { s.libraryFilter = el.dataset.filter; return update(s); }
    if (action === 'back' && s.lastIdeas) { s.result = s.lastIdeas; s.lastIdeas=null;return update(s); }
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
    if (action === 'script') return run(s,'script',index);
    if (action === 'history' && s.history[index]) { s.result = s.history[index]; s.lastIdeas=null; s.notice = 'Showing a previously saved idea set. No generation credits used.'; return update(s); }
    if (action === 'copy' && s.result && s.result.suggestions[index]) {
      const raw = s.result.suggestions[index];
      const x = raw && typeof raw === 'object' ? raw : {};
      const content = ideaText(x);
      try { await navigator.clipboard.writeText(content); if (active(s)) s.notice = 'Idea copied.'; } catch (_) { if (active(s)) s.error = 'Clipboard unavailable. Select and copy the idea text manually.'; }
      update(s);
    }
  });
})();
