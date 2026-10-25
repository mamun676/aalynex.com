/* Aalynex Content AI v6 — secure main-project Supabase integration. Account-bound, saved-result-first UI. */
(function () {
  'use strict';
  let state;
  const defaults = { category: '', subCategory: '', topic: '', platform: 'YouTube', language: 'Hinglish', country: 'India', audience: '', goal: 'Engagement', experience: 'Beginner', videoLength: 'Auto (platform fit)', creatorStyle: 'Any / flexible', timeBudget: 'Flexible', contentPillars: '', creatorIdentity: '', winningExamples: '', tone: '', resources: '', avoidTopics: '', extraContext: '' };
  function current() {
    const account = typeof CU !== 'undefined' ? CU : null;
    if (!state || state.account !== account) state = { account, draft: { ...defaults }, edited: false, loaded: false, loading: false, busy: false, quota: null, history: [], cursor: null, result: null, lastIdeas: null, libraryFilter: 'all', pending: null, notice: '', error: '', mounted: null };
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
  function update(s) { if (active(s) && s.mounted && s.mounted.isConnected) { s.mounted.innerHTML = markup(s); } }
  function quotaText(s) {
    const q = s.quota;
    if (!q) return 'Account allowance has not been loaded.';
    if (!q.configured) {
      const setup = q.setup || {};
      const base = setup.code === 'allowance_not_ready'
        ? 'AI credits are not active yet. Your previous work is safe.'
        : setup.code === 'provider_not_ready'
          ? 'AI provider connection is being prepared. No credits can be spent.'
          : setup.code === 'release_disabled'
            ? 'Content AI is paused for launch safety. You can still explore your saved work.'
            : setup.code === 'pilot_only'
              ? 'Content AI is being tested with a small pilot group. Your saved ideas remain available.'
              : 'AI setup is being checked. No credits will be spent until ready.';
      const checks = setup.checks;
      return base + (checks ? ' Staging diagnostics — database: ' + (checks.database_ready ? 'OK' : 'check')
        + ', Groq model: ' + (checks.model_supported ? 'OK' : 'check')
        + ', free-tier mode: ' + (checks.execution_mode_approved ? 'OK' : 'check')
        + ', key present: ' + (checks.groq_key_present ? 'OK' : 'check')
        + ', project: ' + (checks.project_ref_matches ? 'OK' : 'check') + '.' : '');
    }
    const reset = q.reset_at ? new Date(q.reset_at).toLocaleString() : 'not available';
    return `${esc(q.remaining)} available · ${esc(q.used)} used · ${esc(q.held)} held · ${esc(q.limit)} monthly credits. Idea set or selected script: ${esc(q.cost)} credit(s). Reset: ${esc(reset)} (${esc(q.reset_timezone)} policy; time shown locally).`;
  }
  function canGenerate(s) { return s.loaded && !s.loading && !s.busy && !s.pending && s.quota && s.quota.configured && Number.isFinite(s.quota.remaining) && s.quota.remaining >= s.quota.cost; }
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
      return `<article class="ax-idea"><div class="ax-idea-top"><span class="ax-tag">IDEA ${String(i+1).padStart(2,'0')}</span><span class="ax-tag ax-tag-muted">${esc(idea.effort || 'Legacy')} effort</span></div><h3>${esc(idea.topic || 'Untitled idea')}</h3><p class="ax-idea-hook">“${esc(idea.hook || '')}”</p><details class="ax-idea-details" ${i===0 ? 'open' : ''}><summary>View creative brief <span>⌄</span></summary><div class="ax-detail-grid">${row('First 3 seconds',idea.openingShot)}${row('Distinct angle',idea.angle)}${row('Viewer payoff',idea.viewerPayoff)}${row('Why your audience cares',idea.audienceFit||idea.why)}</div>${modern?`<section class="ax-data"><h4>Execution outline</h4><ol>${idea.outline.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section>`:''}${row('Visual / edit plan',idea.visualPlan||idea.thumbnailIdea)}${row('Caption',idea.caption)}${Array.isArray(idea.hashtags)?`<section class="ax-data"><h4>Hashtags</h4><p>${idea.hashtags.map(esc).join(' ')}</p></section>`:''}${Array.isArray(idea.titles)?`<section class="ax-data"><h4>Title options</h4><ul>${idea.titles.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}${row('Call to action',idea.cta)}</details><div class="ax-card-actions"><button type="button" data-ai-action="copy" data-index="${i}">Copy idea</button><button type="button" class="ax-primary" data-ai-action="script" data-index="${i}" ${canGenerate(s) ? '' : 'disabled'}>✦ Generate script · 1 credit</button></div></article>`;
    }).join('')}</div></section>`;
  }
  function markup(s) {
    const q=s.quota;
    const available=q && Number.isFinite(q.remaining) ? q.remaining : '—';
    const max=q && Number.isFinite(q.limit) ? q.limit : 15;
    const percent=q && q.limit ? Math.max(0,Math.min(100,100*q.remaining/q.limit)) : 0;
    return `<section class="ax-ai"><div class="ax-hero"><div class="ax-hero-copy"><span class="ax-eyebrow">AALYNEX / CREATOR INTELLIGENCE</span><h2>Better ideas.<br><em>Made to be made.</em></h2><p>Turn your audience and creator style into five distinct ideas, then expand any one into a practical production script.</p><div class="ax-proof"><span>✦ Creator-first</span><span>◉ India-ready</span><span>↗ Saved to your account</span></div></div><div class="ax-hero-visual" aria-hidden="true"><div class="ax-art-card"><span>01 / DISCOVER</span><strong>Find the angle.</strong><span>02 / CREATE</span><strong>Write the story.</strong><span>03 / PRODUCE</span><strong>Make it real.</strong></div><div class="ax-art-orb">✦</div></div></div><div class="ax-status-strip"><div class="ax-credit"><span class="ax-status-label">MONTHLY CREATIVE CREDITS</span><strong>${esc(available)}<small> / ${esc(max)}</small></strong><div class="ax-credit-track"><span style="width:${percent}%"></span></div></div><div class="ax-status-message" role="status">${esc(quotaText(s))}</div><button type="button" data-ai-action="refresh" ${s.loading?'disabled':''} aria-label="Refresh credits and history">↻ Refresh</button></div><p class="ax-message" role="status" aria-live="polite">${esc(s.notice)}</p>${s.error?`<p class="ax-error" role="alert">${esc(s.error)}</p>`:''}${s.pending?`<div class="ax-pending" role="status"><strong>One request still needs confirmation</strong><p>Do not start a new generation or script. Your previous credit may be held until its status is resolved.</p><button type="button" data-ai-action="status" ${s.busy?'disabled':''}>Check request status</button></div>`:''}<div class="ax-layout"><main class="ax-editor"><section class="ax-pane"><div class="ax-pane-head"><div><span class="ax-eyebrow">STEP 01 / TELL US YOUR STORY</span><h3>Shape your creator brief</h3></div><span class="ax-step-indicator">01—03</span></div><p class="ax-pane-intro">The more you share about your audience, the more specific the ideas can be. Start with a template or your own brief.</p><div class="ax-starters"><strong>Start from a creator profile</strong><div class="ax-starter-actions"><button type="button" data-ai-action="preset" data-index="0">🎓 Education</button><button type="button" data-ai-action="preset" data-index="1">🍲 Food</button><button type="button" data-ai-action="preset" data-index="2">💻 Tech</button><button type="button" data-ai-action="preset" data-index="3">🏪 Business</button></div></div><form data-ai-form><fieldset class="ax-form-grid" ${s.busy?'disabled':''}>${input(s,'category','Your content niche',120,true,'Example: budget cooking for college students')}${input(s,'topic','Topic focus (optional)',320)}${select(s,'platform','Your platform',['YouTube','YouTube Shorts','Instagram Reels','Instagram','LinkedIn'])}${select(s,'language','Content language',['Hinglish','Hindi','English','Tamil','Telugu','Bengali','Marathi'])}${input(s,'audience','Who is watching?',400,true,'Who are they and what problem do they have?')}${select(s,'goal','Main goal',['Views','Subscribers','Engagement','Sales','Brand Building'])}${select(s,'videoLength','Video length',['Auto (platform fit)','Under 30 seconds','30–60 seconds','1–3 minutes','5–8 minutes','8–15 minutes','15+ minutes'])}${select(s,'creatorStyle','How you film',['Any / flexible','On-camera','Faceless','Voiceover + B-roll','Screen recording','Mixed'])}${select(s,'timeBudget','Production time',['Flexible','Under 1 hour','1–3 hours','Half a day','Multi-day project'])}${input(s,'country','Audience country',80)}${select(s,'experience','Experience',['Beginner','Growing','Established'])}${input(s,'tone','Your voice and tone',160)}${input(s,'resources','Your equipment',400,false,'Phone, tripod, notebook, edit app…')}${input(s,'subCategory','Sub-niche',160)}${textArea(s,'contentPillars','Your recurring content pillars',400)}${textArea(s,'creatorIdentity','What makes you different?',400)}${textArea(s,'winningExamples','What has worked for you?',600)}${textArea(s,'avoidTopics','Things to avoid',1200)}${textArea(s,'extraContext','More context',1200)}</fieldset><div class="ax-actions"><button type="submit" class="ax-primary ax-generate" ${canGenerate(s)?'':'disabled'}>${s.busy?'Preparing…':'✦ Generate 5 ideas · 1 credit'}</button><button type="button" data-ai-action="save" ${s.busy||!s.loaded?'disabled':''}>Save brief</button></div><p class="ax-note">Results save automatically. Each successful idea set or script uses one credit; re-opening saved work is free. No real-time trend or channel data is fetched.</p></form></section>${cards(s.result,s)}</main><aside class="ax-history"><div class="ax-history-head"><span class="ax-eyebrow">YOUR LIBRARY</span><h3>Saved creations</h3><p>Private to your Aalynex account</p><div class="ax-library-filters" role="group" aria-label="Filter saved creations">${['all','ideas','scripts'].map(f=>`<button type="button" data-ai-action="filter" data-filter="${f}" class="${s.libraryFilter===f?'active':''}" aria-pressed="${s.libraryFilter===f}">${f==='all'?'All':f==='ideas'?'Ideas':'Scripts'}</button>`).join('')}</div></div>${s.loading?'<p>Loading…</p>':''}${!s.history.length&&s.loaded?'<p class="ax-history-empty">Your first generated ideas will appear here.</p>':''}${s.history.map((item,index)=>(s.libraryFilter==='all'||(s.libraryFilter==='scripts'&&isScript(item))||(s.libraryFilter==='ideas'&&!isScript(item)))?`<button type="button" class="ax-history-item" data-ai-action="history" data-index="${index}"><span class="ax-history-icon">${isScript(item)?'✎':'✦'}</span><span><strong>${esc(isScript(item)?(item.suggestions?.[0]?.title||'Saved video script'):(item.inputs?.category||'Idea set'))}</strong><small>${esc(new Date(item.created_at).toLocaleDateString())} · ${isScript(item)?'Script':esc(item.inputs?.platform||'Ideas')}</small></span><span class="ax-history-arrow">↗</span></button>`:'').join('')}${s.cursor?`<button class="ax-history-more" type="button" data-ai-action="more" ${s.busy||s.loading?'disabled':''}>Load older work</button>`:''}<div class="ax-history-foot"><strong>Pro tip</strong><p>Try distinct content pillars and real audience problems. Review every claim before publishing.</p></div></aside></div></section>`;
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
    s.busy = true; s.error = ''; s.notice = ''; update(s);
    try {
      if (action === 'generate') {
        const id = crypto.randomUUID(); remember(s, id); update(s);
        accept(s, await api(s, 'ai-suggest', { mode:'ideas', requestId: id, brief: { ...s.draft } }));
      } else if (action === 'script') {
        if (!s.result || isScript(s.result) || !Number.isInteger(index) || index < 0 || index > 4) return;
        const sourceResultId = s.result.id;
        if (!sourceResultId) throw new Error('Save or reload the idea set before expanding a script.');
        s.lastIdeas = s.result;
        const id = crypto.randomUUID(); remember(s, id); update(s);
        accept(s, await api(s, 'ai-suggest', { mode:'script', requestId:id, sourceResultId, ideaIndex:index }));
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
        if (['generate','script'].includes(action) && e.payload && ['invalid_input', 'not_configured', 'quota_exceeded', 'daily_capacity', 'rate_limited', 'provider_unavailable', 'invalid_output', 'duplicate_output', 'history_unavailable'].includes(e.payload.error)) {
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
  // Logout/login lifecycle: clear the previous account's private in-memory work.
  if (typeof supaClient !== 'undefined' && supaClient && supaClient.auth && supaClient.auth.onAuthStateChange) {
    supaClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (state) { state.mounted = null; state = null; }
      }
    });
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
