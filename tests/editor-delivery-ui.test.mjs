import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/ax-editor-delivery-ui.js', import.meta.url), 'utf8');
const escapeHtml = input => String(input).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const appEvent = (name,args) => escapeHtml(JSON.stringify({action:name,args}));
const fmtTime = n => '10:42 AM';
const axDeliveryRevision = { cleanText: input => String(input || '').replace(/\s*\[AXPV:[0-9a-f-]{36}\]\s*$/i,'').trim() };
const {axEditorFinalCard,axFinalOriginalName} = runInNewContext(source + '\n({axEditorFinalCard,axFinalOriginalName})', {
  escapeHtml, appEvent, fmtTime, axDeliveryRevision
});
const id = n => String(n).padStart(8,'0') + '-1111-4111-8111-111111111111';
const project = {id:id(33),title:'edit 17 nov',freelancerId:id(44)};
const msg = (n, note='') => ({
  id:id(n), time:n,
  text:'Final Delivery'+(note?': '+note:'')+' [AXPV:'+id(n+10)+']',
  file_url:'users/'+id(44)+'/projects/'+project.id+'/final/'+id(n+100)+'-cut-'+n+'.mp4'
});
const first=msg(1),second=msg(2);
const previous={final:first,revision:1,isLatest:false,preview:{id:id(11)}};
const current={final:second,revision:2,isLatest:true,preview:{id:id(12)}};

test('current final card identifies latest revision, source filename and project',()=>{
  const html=axEditorFinalCard(second,project,current,current.preview,'player2');
  assert.match(html,/Final video delivered/);
  assert.match(html,/Revision 2/);
  assert.match(html,/LATEST/);
  assert.match(html,/cut-2\.mp4/);
  assert.match(html,/edit 17 nov/);
  assert.match(html,/ax-editor-delivery--latest/);
});
test('latest preview action references only paired preview B',()=>{
  const html=axEditorFinalCard(second,project,current,current.preview,'player2');
  assert.match(html,new RegExp(id(12)));
  assert.doesNotMatch(html,new RegExp(id(11)));
  assert.match(html,/axOpenMessageMedia/);
});
test('latest original button uses secure on-demand download action',()=>{
  const html=axEditorFinalCard(second,project,current,current.preview,'player2');
  assert.match(html,/axDownloadMessageFile/);
  assert.match(html,/My original/);
  assert.doesNotMatch(html,/https:\/\/[^"' ]*s3/i);
  assert.doesNotMatch(html,/Pay now|checkout|Razorpay/i);
});
test('older revision is compact, clearly replaced and cannot trigger downloads',()=>{
  const html=axEditorFinalCard(first,project,previous,previous.preview,'player1');
  assert.match(html,/REPLACED/);
  assert.match(html,/Earlier final delivery/);
  assert.doesNotMatch(html,/data-app-click/);
  assert.match(html,/ax-editor-delivery--replaced/);
});
test('newer preview pending freezes current final actions',()=>{
  const html=axEditorFinalCard(second,project,{...current,pendingNewPreview:true},current.preview,'player2');
  assert.match(html,/NEXT REVISION PENDING/);
  assert.doesNotMatch(html,/data-app-click/);
});
test('missing matching preview never silently opens old preview',()=>{
  const html=axEditorFinalCard(second,project,current,null,'player2');
  assert.match(html,/Preview pending/);
  assert.match(html,/disabled/);
  assert.doesNotMatch(html,/axOpenMessageMedia/);
});
test('original filename is derived from project-scoped key safely',()=>{
  assert.equal(axFinalOriginalName(second.file_url),'cut-2.mp4');
  assert.equal(axFinalOriginalName('invalid/file.mp4'),'Original final video');
});
test('internal preview binding marker is not shown to freelancer',()=>{
  const html=axEditorFinalCard(second,project,current,current.preview,'player2');
  assert.doesNotMatch(html,/\[AXPV:/);
});
test('project title and note are HTML-escaped',()=>{
  const unsafeProject={...project,title:'<img src=x onerror=alert(1)>'};
  const unsafeMessage=msg(2,'<script>alert(1)</script>');
  const html=axEditorFinalCard(unsafeMessage,unsafeProject,{...current,final:unsafeMessage},current.preview,'player2');
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;img/);
});
test('misbound revision is not shown as current final',()=>{
  assert.equal(axEditorFinalCard(second,project,previous,previous.preview,'player2'),'');
});
