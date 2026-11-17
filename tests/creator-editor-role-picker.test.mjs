import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const creator = readFileSync(new URL('../js/creator.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helper = creator.match(/function axIsEligibleFreelancer\(profile\) \{[\s\S]*?\n\}/);
assert.ok(helper, 'role-based editor eligibility helper exists');
const isEligible = runInNewContext(
  helper[0] + '\naxIsEligibleFreelancer;',
  {CU:{id:'current-creator'}}
);

test('freelancer role passes regardless of profession text',()=>{
  assert.equal(isEligible({id:'f1',role:'freelancer',profession:'Content Creator'}),true);
  assert.equal(isEligible({id:'f2',role:'freelancer',profession:'Video Editor'}),true);
  assert.equal(isEligible({id:'f3',role:' Freelancer ',profession:'Designer'}),true);
});
test('actual creator and admin roles cannot appear in editor picker',()=>{
  assert.equal(isEligible({id:'c1',role:'creator',profession:'Video Editor'}),false);
  assert.equal(isEligible({id:'a1',role:'admin',profession:'Video Editor'}),false);
  assert.equal(isEligible({id:'u1',role:'',profession:'Freelancer'}),false);
  assert.equal(isEligible(null),false);
});
test('current signed-in user and empty IDs are excluded',()=>{
  assert.equal(isEligible({id:'current-creator',role:'freelancer'}),false);
  assert.equal(isEligible({id:'',role:'freelancer'}),false);
});
test('wizard fetches only freelancer roles from Supabase and validates response',()=>{
  assert.match(creator,/\.eq\("role", "freelancer"\)/);
  assert.match(creator,/editors = editors\.filter\(axIsEligibleFreelancer\)/);
  assert.match(creator,/if \(!loadedFromServer\) editors = DB\.users\(\)/);
});
test('empty database result does not use stale cached accounts',()=>{
  assert.match(creator,/if \(!error && Array\.isArray\(data\)\) \{[\s\S]*?loadedFromServer = true;/);
  assert.doesNotMatch(creator,/if \(!editors \|\| editors\.length === 0\) editors = DB\.users\(\)/);
});
test('picker rejects tampered invalid IDs and stale selections',()=>{
  assert.match(creator,/axEligibleEditorIds = new Set\(editors\.map\(f => String\(f\.id\)\)\)/);
  assert.match(creator,/selFreelancerIds = selFreelancerIds\.filter\(id => axEligibleEditorIds\.has\(String\(id\)\)\)/);
  assert.match(creator,/if \(!axEligibleEditorIds\.has\(String\(id\)\)\)/);
  assert.match(creator,/!selFreelancerIds\.every\(id => axEligibleEditorIds\.has\(String\(id\)\)\)/);
});
test('creator shows account role separately from self-listed profession',()=>{
  assert.ok(creator.includes('Only freelancer accounts are listed'));
  assert.ok(creator.includes('Specialty:'));
  assert.ok((creator.match(/>Freelancer<\/div>/g)||[]).length >= 2);
});
test('creator script cache version updated for live deployment',()=>{
  assert.match(html,/js\/creator\.js\?v=aalynex-freelancer-role-picker-v1/);
});
