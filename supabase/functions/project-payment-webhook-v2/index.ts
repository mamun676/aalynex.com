// Dedicated project-payment endpoint. Do not replace Premium webhook URLs or reuse their secret.
import {reply,env} from '../_shared/project-payment-http.ts';
import {limitedBody,bodySignatureValid,digest,eventIds,eventPolicy} from '../_shared/project-recovery-core.mjs';
import {recoveryAdmin,finishReceipt,recordRetry} from '../_shared/project-recovery.ts';
const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(headers,{error:'Method not allowed'},405);
 let admin:any,r:any;
 try{
  const raw=await limitedBody(req);
  if(!await bodySignatureValid(env('PROJECT_RAZORPAY_WEBHOOK_SECRET'),raw,req.headers.get('x-razorpay-signature'))){
   console.warn('PROJECT_WEBHOOK_REJECT: INVALID_SIGNATURE');
   return reply(headers,{error:'Invalid signature'},400);
  }
  const event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(Deno.env.get('PROJECT_RAZORPAY_ACCOUNT_ID')&&event.account_id!==Deno.env.get('PROJECT_RAZORPAY_ACCOUNT_ID')){
   console.warn('PROJECT_WEBHOOK_REJECT: WRONG_ACCOUNT');
   return reply(headers,{error:'Wrong account'},400);
  }
  eventPolicy(event.event);const ids=eventIds(event);const hash=await digest(raw);
  const headerId=req.headers.get('x-razorpay-event-id');const eventId=headerId&&headerId.length<=256?headerId:'body:'+hash;
  admin=recoveryAdmin();
  const {data,error}=await admin.rpc('ax_register_project_event',{p_event_id:eventId,p_hash:hash,p_type:event.event,p_payment_id:ids.paymentId,p_order_id:ids.orderId});
  if(error||!data)throw Error('Receipt failed');r=data;
  if(r.state!=='pending')return reply(headers,{ok:true,duplicate:true});
  const result=await finishReceipt(admin,r);return reply(headers,{ok:true,outcome:result.outcome});
 }catch(e){
  if(r&&admin){try{await recordRetry(admin,r.event_id);}catch{/* Keep response retryable. */}}
  const large=e instanceof Error&&e.message==='Body too large';
  return reply(headers,{error:large?'Payload too large':'Project webhook requires retry'},large?413:503);
 }
});
