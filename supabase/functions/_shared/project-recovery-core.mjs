export const paymentEvents=new Set(['payment.authorized','payment.captured','payment.failed','order.paid']);
export function eventPolicy(type) {
 if(typeof type!=='string'||type.length>100)throw Error('Invalid event');
 if(type==='refund.created'||type==='refund.processed'||type==='refund.failed'||type==='refund.speed_changed')return 'refund_event';
 if(type.startsWith('payment.dispute.'))return 'dispute_event';
 return paymentEvents.has(type)?'recover':'ignore';
}
export function eventIds(event) {
 const payment=event?.payload?.payment?.entity, order=event?.payload?.order?.entity;
 const paymentId=payment?.id||event?.payload?.refund?.entity?.payment_id||event?.payload?.dispute?.entity?.payment_id||null;
 const orderId=payment?.order_id||order?.id||null;
 if(paymentId!==null&&!/^pay_[A-Za-z0-9]+$/.test(paymentId))throw Error('Invalid payment');
 if(orderId!==null&&!/^order_[A-Za-z0-9]+$/.test(orderId))throw Error('Invalid order');
 return {paymentId,orderId};
}
export async function digest(raw) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function bodySignatureValid(secret,raw,signature) {
 if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,raw)),b=>b.toString(16).padStart(2,'0')).join('');
 let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);return diff===0;
}
export async function limitedBody(req,max=262144) {
 const reader=req.body?.getReader();if(!reader)return new Uint8Array();let n=0;const parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();throw Error('Body too large');}parts.push(value);}
 const raw=new Uint8Array(n);let offset=0;for(const p of parts){raw.set(p,offset);offset+=p.length;}return raw;
}
export function chooseOrder(items,intent) {
 if(!Array.isArray(items)||items.length>=100)throw Error('Order search needs review');
 const matches=items.filter(o=>o.receipt===intent.receipt&&o.notes?.ax_intent_id===intent.id&&o.notes?.project_id===intent.project_id);
 if(matches.length>1)throw Error('Multiple matching orders');return matches[0]||null;
}
