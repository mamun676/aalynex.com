export function assertOrder(order, intent) {
 if (!order || order.id !== intent.provider_order_id || order.amount !== Number(intent.amount_paise) || order.currency !== intent.currency || order.receipt !== intent.receipt) throw new Error('Order mismatch');
 if (order.notes?.ax_intent_id !== intent.id || order.notes?.project_id !== intent.project_id) throw new Error('Order binding mismatch');
}
export function assertCaptured(payment, order, intent) {
 assertOrder(order, intent);
 if (!payment || !/^pay_[A-Za-z0-9]+$/.test(payment.id || '') || payment.order_id !== order.id || payment.status !== 'captured' || payment.captured !== true || payment.amount !== Number(intent.amount_paise) || payment.currency !== intent.currency || payment.amount_refunded !== 0 || payment.refunded === true) throw new Error('Payment is not a matching captured payment');
 if (order.status !== 'paid' || order.amount_paid !== Number(intent.amount_paise) || order.amount_due !== 0) throw new Error('Order is not fully paid');
}
export async function verifySignature(secret, orderId, paymentId, signature) {
 if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
 const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const raw = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${orderId}|${paymentId}`)));
 const hex = Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('');
 let diff=0; for(let i=0;i<64;i++) diff |= hex.charCodeAt(i)^signature.charCodeAt(i);
 return diff===0;
}
export function requireId(value, prefix) {
 if (typeof value !== 'string' || !(new RegExp(`^${prefix}_[A-Za-z0-9]+$`)).test(value)) throw new Error('Invalid identifier');
 return value;
}
