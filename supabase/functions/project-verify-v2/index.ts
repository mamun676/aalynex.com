import {recoverIntent} from '../_shared/project-recovery.ts';
import { requestJson, cors,reply,context,razorpay,providerKeys,failure } from '../_shared/project-payment-http.ts';
import { assertCaptured, verifySignature, requireId } from '../_shared/project-payment-core.mjs';
Deno.serve(async(req:Request)=>{
 let h:Headers|undefined;
 try {
  h=cors(req); if(req.method==='OPTIONS') return new Response(null,{status:204,headers:h});
  if(req.method!=='POST') return reply(h,{error:'Method not allowed'},405);
  const {user,admin}=await context(req);
  const b=await requestJson(req);
  const oid=requireId(b.razorpay_order_id,'order'), pid=requireId(b.razorpay_payment_id,'pay');
  if(typeof b.projectId!=='string') return reply(h,{error:'Invalid project'},400);
  const {data:i,error}=await admin.from('ax_project_order_intents').select('*').eq('provider_order_id',oid).maybeSingle();
  if(error||!i||i.creator_id!==user.id||i.project_id!==b.projectId) return reply(h,{error:'Checkout does not belong to this project/account'},403);
  if(!await verifySignature(providerKeys().secret,oid,pid,b.razorpay_signature)) return reply(h,{error:'Payment signature rejected'},400);
  // Recovery fetches canonical provider records; the callback alone never settles money.
  const result=await recoverIntent(admin,i,oid);
  if(result.status!=='verified')return reply(h,{error:'Payment needs verification. Do not pay again.',status:result.status},409);
  return reply(h,{ok:true,...result});
 }catch(e){return failure(h,e);}
});
