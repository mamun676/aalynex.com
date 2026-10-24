import {requestJson,cors,reply,context,failure} from '../_shared/project-payment-http.ts';
import {recoverIntent} from '../_shared/project-recovery.ts';
Deno.serve(async(req:Request)=>{
 let h:Headers|undefined;
 try{
  h=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
  if(req.method!=='POST')return reply(h,{error:'Method not allowed'},405);
  const {user,admin}=await context(req);const b=await requestJson(req);
  if(typeof b.projectId!=='string'||!b.projectId||b.projectId.length>200)return reply(h,{error:'Invalid project'},400);
  const {data:p,error:pe}=await admin.from('projects').select('id,creator_id').eq('id',b.projectId).maybeSingle();
  if(pe||!p||p.creator_id!==user.id)return reply(h,{error:'Project unavailable'},403);
  const {data:i,error}=await admin.from('ax_project_order_intents').select('*').eq('project_id',p.id).maybeSingle();
  if(error)throw Error('Intent lookup failed');
  if(!i)return reply(h,{status:'no_managed_checkout',project_id:p.id,message:'Legacy payments need support review. No new charge was created.'});
  if(i.creator_id!==user.id)throw Error('Intent owner mismatch');
  // GET provider state + idempotent database settlement only. Never create/capture/refund a payment.
  return reply(h,await recoverIntent(admin,i,b.providerOrderId));
 }catch(e){return failure(h,e);}
});
