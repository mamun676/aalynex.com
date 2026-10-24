import {recoverIntent} from '../_shared/project-recovery.ts';
import { requestJson, cors, reply, context, env, razorpay, providerKeys, failure } from '../_shared/project-payment-http.ts';
import { assertOrder } from '../_shared/project-payment-core.mjs';
Deno.serve(async(req:Request)=>{
 let h:Headers|undefined;
 try {
  h=cors(req); if(req.method==='OPTIONS') return new Response(null,{status:204,headers:h});
  if(req.method!=='POST') return reply(h,{error:'Method not allowed'},405);
  if(Deno.env.get('PROJECT_PAYMENTS_ENABLED')!=='true') return reply(h,{error:'Project checkout is paused'},503);
  const {user,admin}=await context(req);
  const {projectId}=await requestJson(req);
  if(typeof projectId!=='string'||!projectId||projectId.length>200) return reply(h,{error:'Invalid project'},400);
  providerKeys(); env('PROJECT_PAYMENT_ALLOWED_ORIGINS');
  const {data:i,error}=await admin.rpc('ax_prepare_project_order',{p_project_id:projectId,p_caller:user.id});
  if(error||!i) throw new Error('Project not eligible');
  if(i.is_new) {
   // If the network fails after provider creation, KEEP 'creating'. Never blindly create a second order.
   const order=await razorpay('orders','POST',{amount:Number(i.amount_paise),currency:i.currency,receipt:i.receipt,partial_payment:false,notes:{ax_intent_id:i.id,project_id:i.project_id}});
   assertOrder(order,{...i,provider_order_id:order.id});
   if(!/^order_[A-Za-z0-9]+$/.test(order.id)) throw new Error('Invalid provider order');
   const {error:bindError}=await admin.rpc('ax_attach_project_order',{p_intent_id:i.id,p_order_id:order.id});
   if(bindError) throw new Error('Order binding failed');
   i.provider_order_id=order.id;
  } else {
   if(i.state!=='ready'||!i.provider_order_id) return reply(h,{error:'Checkout is pending reconciliation. Do not pay again.'},409);
   const recovery=await recoverIntent(admin,i);
   if(recovery.status!=='unpaid') return reply(h,{error:'Existing checkout requires review. Do not pay again.',status:recovery.status},409);
   const order=await razorpay('orders/'+i.provider_order_id); assertOrder(order,i);
   if(order.status!=='created'||order.amount_paid!==0) return reply(h,{error:'An attempted payment needs reconciliation. Do not pay again.'},409);
  }
  return reply(h,{id:i.provider_order_id,amount:Number(i.amount_paise),currency:i.currency,key_id:providerKeys().id,project_id:i.project_id});
 }catch(e){return failure(h,e);}
});
