import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = (p) => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dbSource=source('js/db.js');
const utils=source('js/utils.js');
const sync=source('js/sync.js');
const creator=source('js/creator.js');
const html=source('index.html');
const ctx=runInNewContext(dbSource + '\n({DB,MemDB})');
const helper=utils.match(/function axFreelancerStats\(freelancerId\) \{[\s\S]*?\n\}/);
assert.ok(helper,'Expected public aggregate helper');
const publicStats=runInNewContext(helper[0]+'\naxFreelancerStats',{DB:ctx.DB});

test('public stats helper reads only aggregated values',()=>{
  ctx.DB.saveFreelancerStats([{freelancer_id:'freelancer-A',completed_projects:5,avg_rating:'4.5',total_reviews:3,recent_completed_7d:2,recent_rated_7d:1}]);
  const result=publicStats('freelancer-A');
  assert.equal(result.completedCount,5);
  assert.equal(result.avgRating,4.5);
  assert.equal(result.reviewsCount,3);
  assert.equal(result.recentCount,2);
  assert.equal(result.recentRated,1);
});
test('unknown freelancer does not leak other freelancers stats',()=>{
  const result=publicStats('unrelated');
  assert.equal(result.completedCount,0);
  assert.equal(result.avgRating,0);
});
test('switching accounts clears aggregate cache and all project records',()=>{
  ctx.DB.saveProjects([{id:'private-project'}]);
  ctx.DB.logout();
  assert.equal(ctx.DB.projects().length,0);
  assert.equal(ctx.DB.freelancerStats().length,0);
});
test('sync requests safe public statistics independently of projects',()=>{
  assert.match(sync,/\.from\('public_freelancer_stats'\)/);
  assert.match(sync,/\.select\('freelancer_id,completed_projects,avg_rating,total_reviews,recent_completed_7d,recent_rated_7d'\)/);
  assert.match(sync,/if \(Array\.isArray\(projects\) && !projectSyncError\)/);
  assert.doesNotMatch(sync,/if \(projects && projects\.length\)/);
});
test('creator public rankings and chooser no longer aggregate other creators raw project rows',()=>{
  for(const section of ['cHome','viewFreelancerPortfolio','cBrowseFreelancers','hybridQualityScore']) {
    assert.match(creator,/axFreelancerStats/);
  }
  assert.doesNotMatch(creator,/DB\.projects\(\)\.filter\(p => p\.freelancerId === f\.id && p\.status === 'completed'\)/);
  assert.doesNotMatch(creator,/const allP = DB\.projects\(\)/);
});
test('app boots in correct script order and cache version',()=>{
  for(const file of ['db','utils','sync','creator'])
    assert.ok(html.includes('js/'+file+'.js?v=aalynex-project-privacy-v1'));
  assert.ok(html.indexOf('js/db.js')<html.indexOf('js/utils.js'));
  assert.ok(html.indexOf('js/utils.js')<html.indexOf('js/sync.js'));
});
test('RLS release is staged and never applied automatically by this PR',()=>{
  const doc=source('docs/participant-project-privacy-release.md');
  assert.match(doc,/Only after success apply/);
  assert.match(doc,/creator_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(doc,/invited_freelancers/);
  assert.match(doc,/Emergency rollback/);
});
