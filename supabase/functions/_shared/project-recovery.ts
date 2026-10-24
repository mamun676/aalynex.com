import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {env,razorpay} from './project-payment-http.ts';
import {assertOrder,assertCaptured,requireId} from './project-payment-core.mjs';
import {eventPolicy,chooseOrder} from './project-recovery-core.mjs';
export function recoveryAdmin(){return createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
export async function hold(admin:any,i:any,reason:string,source:string){
 const {error}=await admin.rpc('ax_hold_project_payment',{p_intent_id:i.id,p_order_id:i.provider_order_id,p_reason:reason,p_source_ref:source.slice(0,256)});
 if(error)throw Error('Hold write failed');
 return {status:'held',project_id:i.project_id};
}
export async function boundIntent(admin:any,order:any,expectedId?:string){
 requireId(order.id,'order');
 let {data:i,error}=await admin.from('ax_project_order_intents').select('*').eq('provider_order_id',order.id).maybeSingle();
 if(error)throw Error('Intent lookup failed');
 if(!i){
  const candidate=order.notes?.ax_intent_id;
  if(typeof candidate!=='string'||!/^[a-f0-9-]{36}$/i.test(candidate))return null;

  const found=await admin.from('ax_project_order_intents').select('*').eq('id',candidate).maybeSingle();
  if(found.error)throw Error('Intent lookup failed');i=found.data;
 }
 if(!i)return null;if(expectedId&&i.id!==expectedId)throw Error('Order belongs to another intent');
 assertOrder(order,{...i,provider_order_id:i.provider_order_id||order.id});
 if(!i.provider_order_id){
  const {error:be}=await admin.rpc('ax_attach_project_order',{p_intent_id:i.id,p_order_id:order.id});
  if(be)throw Error('Order binding failed');i={...i,provider_order_id:order.id,state:'ready'};
 }
 return i;
}
async function activeHold(admin:any,id:string){const {data,error}=await admin.from('ax_project_payment_holds').select('active').eq('intent_id',id).eq('active',true).maybeSingle();if(error)throw Error('Hold lookup failed');return !!data;}
export async function settleCanonical(admin:any,i:any,order:any,payment:any,source:string){
 assertOrder(order,i);requireId(payment.id,'pay');
 if(payment.order_id!==order.id||payment.currency!==i.currency||payment.amount!==Number(i.amount_paise))throw Error('Payment binding mismatch');
 if(await activeHold(admin,i.id))return {status:'held',project_id:i.project_id};
 if((typeof payment.amount_refunded==='number'&&payment.amount_refunded>0)||payment.refunded===true||payment.status==='refunded')return hold(admin,i,'provider_refund',source);
 if(payment.status!=='captured'||payment.captured!==true)return {status:'pending',project_id:i.project_id};
 assertCaptured(payment,order,i);
 const {data:r,error}=await admin.rpc('ax_finalize_project_payment',{p_intent_id:i.id,p_order_id:order.id,p_payment_id:payment.id,p_amount_paise:payment.amount,p_currency:payment.currency});
 if(error)throw Error('Settlement failed');
 if(r?.status==='held')return {status:'held',project_id:i.project_id};
 if(!r?.ok)throw Error('Settlement not confirmed');
 return {status:'verified',project_id:i.project_id,already:r.already===true};
}
export async function recoverIntent(admin:any,intent:any,hintOrderId?:string){
 if(await activeHold(admin,intent.id))return {status:'held',project_id:intent.project_id};
 let order;
 if(intent.provider_order_id){
  if(hintOrderId&&hintOrderId!==intent.provider_order_id)throw Error('Wrong order');
  order=await razorpay('orders/'+requireId(intent.provider_order_id,'order'));
 }else if(hintOrderId){order=await razorpay('orders/'+requireId(hintOrderId,'order'));}
 else{
  const list=await razorpay('orders?'+new URLSearchParams({receipt:intent.receipt,count:'100',skip:'0'}));
  if(!Array.isArray(list.items)||list.count!==list.items.length)throw Error('Incomplete order search');
  order=chooseOrder(list.items,intent);
  if(!order)return {status:'awaiting_order',project_id:intent.project_id};
 }
 const i=await boundIntent(admin,order,intent.id);if(!i)throw Error('Intent unavailable');
 const collection=await razorpay('orders/'+requireId(order.id,'order')+'/payments');
 if(!Array.isArray(collection.items)||collection.count!==collection.items.length||collection.items.length>=100)throw Error('Incomplete payment list');
 const suspicious=collection.items.filter((p:any)=>p.status==='captured'||p.status==='refunded'||(p.amount_refunded||0)>0||p.refunded===true);
 if(suspicious.length>1)return hold(admin,i,'ambiguous_payments','reconcile:'+order.id);
 if(suspicious.length===0)return {status:order.status==='created'&&collection.items.length===0?'unpaid':'pending',project_id:i.project_id};
 // Fetch specific canonical payment, not only a list projection or a browser callback.
 const payment=await razorpay('payments/'+requireId(suspicious[0].id,'pay'));
 if(payment.id!==suspicious[0].id)throw Error('Payment mismatch');
 return settleCanonical(admin,i,order,payment,'reconcile:'+order.id);
}
export async function processProjectReceipt(admin:any,r:any){
 const policy=eventPolicy(r.event_type);
 if(policy==='ignore')return {status:'ignored',outcome:'unsupported_event'};
 let payment=null,order=null;
 if(r.provider_payment_id){
  payment=await razorpay('payments/'+requireId(r.provider_payment_id,'pay'));
  if(payment.id!==r.provider_payment_id)throw Error('Payment mismatch');
  if(!payment.order_id)return {status:'ignored',outcome:'no_project_order'};
  if(r.provider_order_id&&payment.order_id!==r.provider_order_id)throw Error('Event order mismatch');
  order=await razorpay('orders/'+requireId(payment.order_id,'order'));
 }else if(r.provider_order_id){order=await razorpay('orders/'+requireId(r.provider_order_id,'order'));}
 else return {status:'review',outcome:'missing_provider_ids'};
 const i=await boundIntent(admin,order);
 if(!i)return {status:'review',outcome:'unmanaged_order_manual_reconciliation'};
 if(policy==='refund_event'||policy==='dispute_event'){
  await hold(admin,i,policy,r.event_id);return {status:'complete',outcome:'held_for_review'};
 }
 // Recover the whole order, so one capture callback cannot conceal a second capture/refund attempt.
 const result=await recoverIntent(admin,i);
 return {status:'complete',outcome:result.status};
}
export async function finishReceipt(admin:any,r:any){
 const result=await processProjectReceipt(admin,r);
 const {error}=await admin.rpc('ax_finish_project_event',{p_event_id:r.event_id,p_hash:r.body_hash,p_state:result.status,p_outcome:result.outcome});
 if(error)throw Error('Event completion failed');return result;
}
export async function recordRetry(admin:any,eventId:string){
 const {error}=await admin.rpc('ax_retry_project_event',{p_event_id:eventId});
 if(error)throw Error('Retry audit failed');
}
