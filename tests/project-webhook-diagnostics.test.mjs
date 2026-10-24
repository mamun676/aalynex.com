// Offline only: actual webhook/core logic; database and recovery modules are mocked.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createHmac} from 'node:crypto';
const root=new URL('../supabase/functions/',import.meta.url);
const source=await readFile(new URL('project-payment-webhook-v2/index.ts',root),'utf8');
assert.ok(!source.includes('x-project-signature-probe'));
assert.ok(!source.includes('probe_only'));
let checks=2;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const fixtureSecret='offline-only-diagnostics-fixture';
async function harness(options={}){
 let handler;const warnings=[],calls=[];
 const config={PROJECT_RAZORPAY_WEBHOOK_SECRET:fixtureSecret,PROJECT_RAZORPAY_ACCOUNT_ID:'acc_fixture'};
 const ctx=vm.createContext({Request,Response,Headers,TextEncoder,TextDecoder,Uint8Array,crypto,
  console:{warn:(...args)=>warnings.push(args.join(' '))},
  Deno:{env:{get:k=>config[k]},serve:h=>{handler=h;}},
  fetch:()=>{throw Error('Network forbidden in offline test');}
 });
 const core=new vm.SourceTextModule(await readFile(new URL('_shared/project-recovery-core.mjs',root),'utf8'),{context:ctx});
 await core.link(()=>{throw Error('Unexpected import');});await core.evaluate();
 const admin={rpc:async(name,p)=>{calls.push(name);return options.receiptFailure?{error:{message:'fixture failure'}}:{data:{state:options.duplicate?'complete':'pending',event_id:p.p_event_id},error:null};}};
 const http=new vm.SyntheticModule(['reply','env'],function(){
  this.setExport('reply',(h,body,status=200)=>new Response(JSON.stringify(body),{headers:h,status}));
  this.setExport('env',name=>{if(!config[name])throw Error('Missing server configuration');return config[name];});
 },{context:ctx});
 const recovery=new vm.SyntheticModule(['recoveryAdmin','finishReceipt','recordRetry'],function(){
  this.setExport('recoveryAdmin',()=>{calls.push('admin');return admin;});
  this.setExport('finishReceipt',async()=>{calls.push('finish');if(options.finishFailure)throw Error('fixture failure');return {outcome:'verified'};});
  this.setExport('recordRetry',async()=>{calls.push('retry');});
 },{context:ctx});
 const endpoint=new vm.SourceTextModule(stripTypeScriptTypes(source),{context:ctx});
 await endpoint.link(spec=>spec.endsWith('project-payment-http.ts')?http:spec.endsWith('project-recovery-core.mjs')?core:recovery);
 await endpoint.evaluate();
 async function send(raw,extra={},method='POST',signWith=fixtureSecret){
  const sig=createHmac('sha256',signWith).update(raw).digest('hex');
  const response=await handler(new Request('https://fixture.invalid/webhook',{method,headers:{'x-razorpay-signature':sig,...extra},...(method==='POST'?{body:raw}:{})}));
  return {status:response.status,body:await response.json()};
 }
 return {send,warnings,calls,config};
}
const raw=JSON.stringify({account_id:'acc_fixture',event:'payment.captured',payload:{payment:{entity:{id:'pay_Test',order_id:'order_Test'}}}});
let h=await harness();let r=await h.send(raw,{},'GET');eq(r.status,405);eq(h.calls,[]);eq(h.warnings,[]);
for(const bad of ['', 'nothex', '0'.repeat(64)]){
 h=await harness();r=await h.send(raw,{'x-razorpay-signature':bad});eq(r.status,400);eq(r.body,{error:'Invalid signature'});eq(h.calls,[]);eq(h.warnings,['PROJECT_WEBHOOK_REJECT: INVALID_SIGNATURE']);
}
h=await harness();r=await h.send(raw,{},'POST','different-offline-secret');eq(r.status,400);eq(h.calls,[]);
h=await harness();r=await h.send(raw.replace('acc_fixture','acc_other'));eq(r.status,400);eq(r.body,{error:'Wrong account'});eq(h.calls,[]);eq(h.warnings,['PROJECT_WEBHOOK_REJECT: WRONG_ACCOUNT']);
h=await harness();r=await h.send(raw);eq(r.status,200);eq(r.body,{ok:true,outcome:'verified'});eq(h.calls,['admin','ax_register_project_event','finish']);eq(h.warnings,[]);
h=await harness({duplicate:true});r=await h.send(raw);eq(r.body,{ok:true,duplicate:true});eq(h.calls,['admin','ax_register_project_event']);
h=await harness({receiptFailure:true});r=await h.send(raw);eq(r.status,503);eq(h.calls,['admin','ax_register_project_event']);
h=await harness({finishFailure:true});r=await h.send(raw);eq(r.status,503);eq(h.calls,['admin','ax_register_project_event','finish','retry']);
h=await harness();r=await h.send('not JSON');eq(r.status,503);eq(h.calls,[]);
h=await harness();r=await h.send('x'.repeat(262145));eq(r.status,413);eq(h.calls,[]);
// The temporary probe is removed even when the request is signed correctly.
h=await harness();r=await h.send('project-signature-probe-v1',{'x-project-signature-probe':'v1'});eq(r.status,503);eq(h.calls,[]);eq(r.body.probe_only,undefined);
// Log entries contain only fixed diagnostic labels, no credentials or event payload.
for(const marker of ['INVALID_SIGNATURE','WRONG_ACCOUNT']){
 assert.ok(source.includes("console.warn('PROJECT_WEBHOOK_REJECT: "+marker+"')"));checks++;
}
console.log(`PASS ${checks} webhook diagnostic/cleanup checks (offline mocks; no live requests).`);
