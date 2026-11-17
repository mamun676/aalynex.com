import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const utils=read('js/utils.js');
const sources=['js/auth.js','js/main.js','js/sync.js','js/creator.js','js/freelancer.js'];
test('profile query allowlist omits private phone',()=>{
 const match=utils.match(/const AX_PROFILE_PUBLIC_FIELDS = '([^']+)'/);
 assert.ok(match);
 assert.ok(!match[1].split(',').includes('phone'));
 for(const c of ['id','name','role','avatar','created_at','skills','photo_url'])
   assert.ok(match[1].split(',').includes(c));
});
test('all known application profile reads avoid SELECT * or implicit wildcard',()=>{
 for(const path of sources){
   const source=read(path);
   assert.doesNotMatch(source,/\.from\(['"]profiles['"]\)\.select\(['"]\*['"]\)/);
   assert.doesNotMatch(source,/\.from\(['"]profiles['"]\)\.select\(\)/);
 }
});
test('own phone is loaded by restricted authenticated RPC',()=>{
 assert.match(utils,/\.rpc\('ax_my_profile_phone'\)/);
 assert.match(read('js/auth.js'),/ownPhone = await axGetOwnPhone/);
 assert.match(read('js/main.js'),/ownPhone = await axGetOwnPhone/);
});
test('shared profile cache never copies someone else phone',()=>{
 const sync=read('js/sync.js');
 assert.match(sync,/phone: p\.id === CU\.id \? \(CU\.phone \|\| ''\) : ''/);
 assert.doesNotMatch(sync,/phone:\s*p\.phone/);
});
test('profiles and freelancer browsing retain nonprivate queries',()=>{
 const creator=read('js/creator.js');
 assert.match(creator,/\.from\("profiles"\)\.select\(AX_PROFILE_PUBLIC_FIELDS\)/);
 assert.match(creator,/\.from\('profiles'\)\.select\(AX_PROFILE_PUBLIC_FIELDS\)/);
 assert.match(read('js/freelancer.js'),/\.select\(AX_PROFILE_PUBLIC_FIELDS\)/);
});
test('fresh profile scripts load without old cached versions',()=>{
 const html=read('index.html');
 for(const src of ['utils','auth','sync','creator','freelancer','main'])
   assert.match(html,new RegExp('js/'+src+'\\.js\\?v=aalynex-profile-privacy-v1'));
 assert.ok(html.indexOf('js/utils.js')<html.indexOf('js/auth.js'));
});
test('no changes to money flow files',()=>{
 const text=read('docs/profile-phone-privacy-release.md');
 assert.match(text,/payment logic/);
});
