import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/ax-delivery-revisions.js', import.meta.url), 'utf8');
const revisions = runInNewContext(source + '\naxDeliveryRevision');
const id = n => String(n).padStart(8, '0') + '-1111-4111-8111-111111111111';
const project = { id: id(50), freelancerId: id(60) };
const msg = (n, time, kind, opts = {}) => ({
  id: id(n), time, from: opts.from || project.freelancerId,
  file_url: 'users/owner/projects/' + (opts.projectId || project.id) + '/' + kind + '/' + id(n) + '.webm',
  text: kind === 'preview' ? 'Project Preview: Demo'
    : 'Final Delivery' + (opts.previewId ? ' [AXPV:' + opts.previewId + ']' : '')
});
const a = msg(1, 1, 'preview');
const aFinal = msg(2, 2, 'final');
const b = msg(3, 3, 'preview');
const bFinal = msg(4, 4, 'final', { previewId: b.id });

test('one historic preview and final are paired', () => {
  assert.equal(revisions.latest([a,aFinal], project)?.preview?.id, a.id);
});
test('two uploads have independent previews; final B never opens preview A', () => {
  const list = [a,aFinal,b,bFinal];
  assert.equal(revisions.forFinal(list, project, aFinal.id).preview.id, a.id);
  assert.equal(revisions.forFinal(list, project, bFinal.id).preview.id, b.id);
  assert.equal(revisions.latest(list, project).final.id, bFinal.id);
});
test('a newer final without a new preview fails closed', () => {
  assert.equal(revisions.latest([a,aFinal,msg(5,5,'final')],project).paired, false);
});
test('multiple historic previews in one revision are ambiguous', () => {
  assert.equal(revisions.latest([a,aFinal,b,msg(6,3.5,'preview'),msg(7,4,'final')],project).paired,false);
});
test('explicit preview ID resolves ambiguity without falling back to old preview', () => {
  assert.equal(revisions.latest([a,aFinal,b,msg(6,3.5,'preview'),msg(7,4,'final',{previewId:b.id})],project).preview.id,b.id);
});
test('unknown explicitly linked preview fails closed', () => {
  assert.equal(revisions.latest([a,aFinal,b,msg(7,4,'final',{previewId:id(99)})],project).paired,false);
});
test('another project or another freelancer cannot supply preview', () => {
  assert.equal(revisions.latest([a,aFinal,msg(8,3,'preview',{projectId:id(500)}),bFinal],project).paired,false);
  assert.equal(revisions.latest([a,aFinal,msg(8,3,'preview',{from:id(70)}),bFinal],project).paired,false);
});
test('new preview still uploading its final pauses older checkout', () => {
  assert.equal(revisions.latest([a,aFinal,b],project).pendingNewPreview,true);
});
test('latest paired final clears pending state', () => {
  assert.equal(revisions.latest([a,aFinal,b,bFinal],project).pendingNewPreview,false);
});
test('internal marker is omitted from user-visible delivery text', () => {
  assert.equal(revisions.cleanText('Final Delivery: revision 2 [AXPV:' + b.id + ']'),'Final Delivery: revision 2');
});
test('ordinary video chats never become paid final delivery', () => {
  assert.equal(revisions.latest([a,{...aFinal,text:'Video: chat upload'}],project),null);
});
