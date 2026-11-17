import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
function sidebar(id){
  const marker='<aside class="sidebar" id="'+id+'">';
  const a=html.indexOf(marker);
  assert.notEqual(a,-1);
  const b=html.indexOf('</aside>',a);
  assert.ok(b>a);
  return html.slice(a,b);
}
function depthBeforeLogout(part) {
  let depth=0,levelAtLogout=null;
  for(const match of part.matchAll(/<\/?div\b[^>]*>/g)) {
    const tag=match[0];
    if(/^<div/.test(tag)) {
      if(tag.includes('class="sb-logout"'))levelAtLogout=depth;
      depth++;
    }else depth--;
    assert.ok(depth>=0,'No unexpectedly closed div');
  }
  assert.equal(depth,0,'All div wrappers are balanced');
  return levelAtLogout;
}
test('freelancer Logout is a direct sidebar child, not nested in nav scroll',()=>{
  const f=sidebar('f-sidebar');
  assert.equal(depthBeforeLogout(f),0);
  assert.ok(f.indexOf('<div class="sb-scroll">') < f.indexOf('class="sb-logout"'));
  assert.ok(f.indexOf('close freelancer navigation scroll area')<f.indexOf('class="sb-logout"'));
});
test('creator Logout layout is still direct child as before',()=>{
  assert.equal(depthBeforeLogout(sidebar('c-sidebar')),0);
});
test('freelancer menu scrolls independently while Logout sits at foot',()=>{
  assert.match(css,/#f-sidebar\s*\.sb-scroll\s*\{[^}]*flex:\s*1 1 auto/);
  assert.match(css,/#f-sidebar\s*\.sb-scroll\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css,/#f-sidebar\s*\.sb-scroll\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0/);
  assert.match(css,/#f-sidebar\s*\.sb-logout\s*\{[^}]*margin-top:\s*8px/);
});
test('logout action and existing freelancer navigation are preserved',()=>{
  const f=sidebar('f-sidebar');
  assert.match(f,/class="sb-logout" onclick="logout\(\)"/);
  for(const section of ['profile','earnings','home','browse','ongoing','chat','negotiate','upload'])
    assert.ok(f.includes('data-page="'+section+'"'));
});
test('new stylesheet cache key ensures browsers fetch updated CSS',()=>{
  assert.match(html,/css\/styles\.css\?v=aalynex-freelancer-sidebar-bottom-20261117/);
});
