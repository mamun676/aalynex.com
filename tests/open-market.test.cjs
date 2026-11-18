const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const creator = fs.readFileSync(path.join(root, 'js/creator.js'), 'utf8');
const freelancer = fs.readFileSync(path.join(root, 'js/freelancer.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/202611181616_open_market_first_accept.sql'), 'utf8');

function sourceBetween(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, 'Missing start: ' + start);
  const match = source.slice(a).match(end);
  assert.ok(match, 'Missing end after ' + start);
  return source.slice(a, a + match.index);
}
const wf = new Function('ctx', 'with (ctx) { ' + sourceBetween(creator, 'async function wfContent() {', /\n(?:async )?function downloadEditedVideo\(/) + '; return wfContent(); }');
const accessible = sourceBetween(freelancer, 'function axIsFreelancerRequest(', /\nlet axMarketChannel/);
const browseFn = sourceBetween(freelancer, 'function fBrowse() {', /\nasync function acceptProject\(/);
const browse = new Function('ctx', 'with (ctx) { ' + accessible + '\n' + browseFn + '; return fBrowse(); }');

function makeCtx(mode, editors = []) {
  return {
    wfStep: 4, supaClient: null, CU: {id: 'creator'},
    axProjectAudience: mode, selFreelancerIds: [],
    axEligibleEditorIds: new Set(), DB: { users: () => editors, projects: () => [] },
    axIsEligibleFreelancer: p => p.role === 'freelancer',
    axFreelancerStats: () => ({completedCount:0, avgRating:0}),
    escapeHtml: x => String(x ?? ''), appEvent: () => '',
    safeMediaUrl: x => x,
  };
}

test('Creator market mode works with no selected freelancers', async () => {
  const html = await wf(makeCtx('market'));
  assert.match(html, /Publish to Open Market/);
  assert.match(html, /style="display:none;"/);
  assert.match(html, /After files upload/);
});

test('Existing private invitation mode remains available', async () => {
  const html = await wf(makeCtx('invite', [{id:'f1', name:'Sample Editor', role:'freelancer', avatar:'F'}]));
  assert.match(html, /Select Freelancers/);
  assert.match(html, /Send Requests &amp; Post/);
  assert.match(html, /Sample Editor/);
});

test('Freelancer feed shows published market, private invites, not drafts or taken projects', () => {
  const projects = [
    {id:'pub',openMarket:true,marketReady:true,status:'open',freelancerId:null,creatorId:'c',title:'Market Project',budget:1000,deadline:'2026-12-01',contentType:'Reel',priority:'Normal'},
    {id:'priv',invited_freelancers:['f'],status:'open',freelancerId:null,creatorId:'c',title:'Invited Project',budget:900,deadline:'2026-12-01',contentType:'Reel',priority:'Normal'},
    {id:'draft',openMarket:true,marketReady:false,status:'open',freelancerId:null,creatorId:'c',title:'Hidden Draft',budget:800,deadline:'2026-12-01',contentType:'Reel',priority:'Normal'},
    {id:'done',openMarket:true,marketReady:true,status:'ongoing',freelancerId:'other',creatorId:'c',title:'Claimed Project',budget:700,deadline:'2026-12-01',contentType:'Reel',priority:'Normal'},
  ];
  const html = browse({
    CU:{id:'f'}, DB:{projects:()=>projects, users:()=>[{id:'c',name:'Sample Creator'}]},
    escapeHtml:x=>String(x??''), fmt:x=>String(x), fmtDate:x=>String(x),
    contentIconSvg:()=>'', appEvent:()=>'', 
  });
  assert.match(html, /Market Project/);
  assert.match(html, /Invited Project/);
  assert.doesNotMatch(html, /Hidden Draft/);
  assert.doesNotMatch(html, /Claimed Project/);
});

test('Only published market rows sync and server claims are atomic', () => {
  assert.match(sync, /openMarket: p\.open_market === true, marketReady: p\.market_ready === true/);
  assert.match(freelancer, /ax_claim_open_market_project/);
  assert.match(sql, /status = 'open' AND p\.freelancer_id IS NULL/);
  assert.match(sql, /role = 'freelancer'/);
  assert.match(sql, /has_verified_premium/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.ax_claim_open_market_project\(text\) FROM PUBLIC/);
});

test('All modified JS files parse', () => {
  for (const file of ['js/creator.js','js/freelancer.js','js/sync.js']) {
    assert.doesNotThrow(() => new Function(fs.readFileSync(path.join(root,file),'utf8')));
  }
});
