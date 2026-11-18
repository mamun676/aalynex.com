/* Aalynex Smart Finding Web V11.5 — client-only rendering for the existing V11.4 backend.
 * No model key in browser. Existing editor selection + project posting remain the source of truth.
 */
(function (global) {
  'use strict';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state = { editors: [], currentKey: '', cache: new Map(), result: null, loading: false, notice: '' };
  const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
  const panel = () => global.document && global.document.getElementById('ax-smart-finding-web');
  const isActive = () => typeof wfStep !== 'undefined' && wfStep === 4 && !!panel() && typeof CU !== 'undefined' && CU && CU.role === 'creator';

  function input() {
    const d = typeof newProjectDraft !== 'undefined' && newProjectDraft ? newProjectDraft : {};
    const type = typeof selContent === 'string' ? selContent : '';
    return {title: String(d.title || '').trim(), description: String(d.desc || '').trim(), contentType: type,
      budget: Number(d.budget || 0), deadline: String(d.deadline || ''), service: 'standard'};
  }
  function keyFor(p, ids) { return JSON.stringify({userId:String(CU && CU.id || ''),project:p,editorIds:ids}); }
  function safeMatches(raw, editors) {
    const known = new Set(editors.map(e => String(e.id)));
    if (!raw || !Array.isArray(raw.matches)) throw new Error('Unexpected Smart Finding response');
    return raw.matches.filter(m => m && known.has(String(m.id)) && Array.isArray(m.reasons))
      .slice(0,3).map(m => ({id:String(m.id),label:String(m.label || 'Relevant editor').slice(0,70),
        reasons:m.reasons.slice(0,3).map(r=>String(r).slice(0,160))}));
  }
  function markup() {
    const {result,loading,notice,editors} = state;
    const badge = result && result.mode === 'gemini' ? 'AI-POWERED' : 'SMART MATCH';
    let content = '';
    if (loading) content = '<p class="ax-sf-note" role="status">Finding editors who match your project…</p>';
    else if (notice) content = '<p class="ax-sf-note">'+escape(notice)+'</p>';
    else if (result && result.matches.length) {
      content = result.matches.map(m => {
        const e = editors.find(item=>String(item.id)===m.id);
        if (!e) return '';
        const selected = typeof selFreelancerIds !== 'undefined' && selFreelancerIds.some(id=>String(id)===m.id);
        return '<article class="ax-sf-card">'
          +'<div class="ax-sf-person"><span class="ax-sf-avatar" aria-hidden="true">'+escape(String(e.name||'E').slice(0,1).toUpperCase())+'</span><div class="ax-sf-person-title"><strong>'+escape(e.name||'Editor')+'</strong><small>'+escape(m.label)+'</small></div></div>'
          +'<p class="ax-sf-reason">'+escape(m.reasons.join(' · ')||'Relevant skills in profile')+'</p>'
          +'<div class="ax-sf-actions"><button type="button" class="ax-sf-view" data-ax-action="view" data-ax-id="'+escape(m.id)+'">View Profile</button>'
          +'<button type="button" class="ax-sf-select" data-ax-action="select" data-ax-id="'+escape(m.id)+'">'+(selected?'Selected ✓':'Select Editor')+'</button></div>'
          +'</article>';
      }).join('');
      if (result.mode !== 'gemini') content += '<p class="ax-sf-caption">Based on listed profile skills. You can always choose from the full editor list.</p>';
    } else content = '<p class="ax-sf-note">No verified matches right now. The full editor list below is still available.</p>';
    return '<div class="ax-sf-head"><div><span class="ax-sf-spark">✦</span><strong>Smart Finding</strong><small>Recommended for your project</small></div><span class="ax-sf-badge">'+badge+'</span></div>'
      +'<div class="ax-sf-content">'+content+'</div>';
  }
  function render() {
    const root = panel(); if (!root || !isActive()) return;
    root.innerHTML = markup();
    if (root.dataset.axWired !== '1') {
      root.dataset.axWired = '1';
      root.addEventListener('click', event => {
        const btn = event.target.closest('button[data-ax-action]');
        if (!btn || !root.contains(btn) || !isActive()) return;
        const editor = state.editors.find(e=>String(e.id)===btn.dataset.axId);
        if (!editor) return;
        event.preventDefault();event.stopPropagation();
        if (btn.dataset.axAction==='view' && typeof viewFreelancerPortfolio==='function') viewFreelancerPortfolio(String(editor.id));
        if (btn.dataset.axAction==='select' && typeof selFL==='function') selFL(String(editor.id), String(editor.name||'Editor'));
      });
    }
  }
  async function start(expectedKey) {
    if (!isActive() || state.currentKey !== expectedKey) return;
    const project = input();
    const editorIds = state.editors.map(e=>String(e.id)).filter(validId);
    if (project.title.length < 3 || !project.contentType || !(project.budget >= 1)) {
      state.loading=false;state.result=null;state.notice='Complete the project title, content type and budget to see recommendations.';render();return;
    }
    if (!editorIds.length) {state.loading=false;state.result=null;state.notice='No eligible editors available. You can still use the regular list.';render();return;}
    if (typeof supaClient === 'undefined' || !supaClient || !supaClient.functions) {
      state.loading=false;state.result=null;state.notice='Smart Finding is offline. The regular editor list still works.';render();return;
    }
    state.loading=true;state.notice='';state.result=null;render();
    if (!state.cache.has(expectedKey)) {
      const task=supaClient.functions.invoke('ax-smart-finding-v1',{body:{project,editorIds}})
        .then(({data,error}) => {if(error)throw new Error('Smart Finding unavailable');return {mode:data&&data.mode==='gemini'?'gemini':'rules',matches:safeMatches(data,state.editors)};})
        .catch(error=>{state.cache.delete(expectedKey);throw error;});
      state.cache.set(expectedKey,task);
    }
    try {
      const result=await state.cache.get(expectedKey);
      if (!isActive()||state.currentKey!==expectedKey)return;
      state.result=result;state.loading=false;state.notice='';render();
    } catch (_) {
      if (!isActive()||state.currentKey!==expectedKey)return;
      state.result=null;state.loading=false;state.notice='Smart Finding is temporarily unavailable. Select from the full editor list below.';render();
    }
  }
  function setEditors(editors) {
    state.editors=Array.isArray(editors)?editors.filter(e=>e&&e.id&&e.role==='freelancer'&&String(e.id)!==String(CU&&CU.id)):[];
    const ids=state.editors.map(e=>String(e.id)).filter(validId).sort();
    const nextKey=keyFor(input(),ids);
    if(state.currentKey!==nextKey) {state.currentKey=nextKey;state.result=null;state.notice='';state.loading=false;}
    setTimeout(()=>{
      if(!isActive()||state.currentKey!==nextKey)return;
      if(state.result){render();return;}
      start(nextKey);
    },0);
  }
  global.axSmartFindingWeb={setEditors, _test:{safeMatches,escape,input,markup,state}};
})(window);
