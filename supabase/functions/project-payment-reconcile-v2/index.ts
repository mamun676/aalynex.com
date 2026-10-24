import {env,reply} from '../_shared/project-payment-http.ts';
import {digest} from '../_shared/project-recovery-core.mjs';
import {recoveryAdmin,recoverIntent,finishReceipt,recordRetry} from '../_shared/project-recovery.ts';
const h=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST'||req.headers.has('Origin'))return reply(h,{error:'Not allowed'},403);
 try{
  const expected=env('PROJECT_RECONCILE_TOKEN'),provided=req.headers.get('x-project-reconcile-token')||'';
  if(expected.length<32||provided.length>512)return reply(h,{error:'Unauthorized'},401);
  const [a,b]=await Promise.all([digest(new TextEncoder().encode(expected)),digest(new TextEncoder().encode(provided))]);let diff=0;
  for(let j=0;j<64;j++)diff|=a.charCodeAt(j)^b.charCodeAt(j);if(diff)return reply(h,{error:'Unauthorized'},401);
  if(Deno.env.get('PROJECT_RECONCILE_ENABLED')!=='true')return reply(h,{error:'Worker paused'},503);
  const admin=recoveryAdmin(),outcomes=[];const started=Date.now();
  const {data:events,error:ee}=await admin.from('ax_project_webhook_receipts').select('*').eq('state','pending').lte('next_retry_at',new Date().toISOString()).order('next_retry_at',{ascending:true}).limit(3);
  if(ee)throw Error('Queue lookup failed');
  for(const r of events||[]){if(Date.now()-started>40000)break;try{outcomes.push({kind:'event',status:(await finishReceipt(admin,r)).outcome});}catch{await recordRetry(admin,r.event_id);outcomes.push({kind:'event',status:'retry_required'});}}
  const {data:intents,error:ie}=await admin.from('ax_project_order_intents').select('*').lte('next_reconcile_at',new Date().toISOString()).order('next_reconcile_at',{ascending:true}).limit(3);
  if(ie)throw Error('Intent queue lookup failed');
  for(const i of intents||[]){
   if(Date.now()-started>40000)break;let status='retry_required';
   try{status=(await recoverIntent(admin,i)).status;}catch{/* Never create another order on uncertainty. */}
   const seconds=status==='held'?86400:status==='verified'?3600:300;
   const {error}=await admin.from('ax_project_order_intents').update({last_reconciled_at:new Date().toISOString(),last_reconcile_outcome:status,next_reconcile_at:new Date(Date.now()+seconds*1000).toISOString()}).eq('id',i.id);
   if(error)throw Error('Queue audit failed');outcomes.push({kind:'intent',status});
  }
  return reply(h,{ok:true,outcomes});
 }catch{return reply(h,{error:'Reconciliation requires retry'},503);}
});
