import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {assertOrder,assertCaptured,verifySignature,requireId} from '../supabase/functions/_shared/project-payment-core.mjs';
let checks=0;
const ok=fn=>{fn();checks++;};const rejects=fn=>{assert.throws(fn);checks++;};
const i={id:'intent1',project_id:'project-A',provider_order_id:'order_A',amount_paise:10300,currency:'INR',receipt:'receipt-A'};
const o={id:'order_A',amount:10300,currency:'INR',receipt:'receipt-A',notes:{ax_intent_id:'intent1',project_id:'project-A'},status:'paid',amount_paid:10300,amount_due:0};
const p={id:'pay_A',order_id:'order_A',amount:10300,currency:'INR',captured:true,status:'captured',amount_refunded:0};
ok(()=>assertCaptured(p,o,i));
for(const delta of [{amount:1},{currency:'USD'},{status:'authorized'},{captured:false},{amount_refunded:100},{refunded:true},{order_id:'order_B'},{id:'../bad'}]) rejects(()=>assertCaptured({...p,...delta},o,i));
for(const delta of [{id:'order_B'},{amount:1},{currency:'USD'},{receipt:'receipt-B'},{status:'attempted'},{amount_paid:1},{amount_due:1},{notes:{ax_intent_id:'intent2',project_id:'project-A'}},{notes:{ax_intent_id:'intent1',project_id:'project-B'}}]) rejects(()=>assertCaptured(p,{...o,...delta},i));
rejects(()=>assertOrder(o,{...i,project_id:'project-B'}));
const secret='unit-test-only-not-a-real-key';const sig=createHmac('sha256',secret).update('order_A|pay_A').digest('hex');
assert.equal(await verifySignature(secret,'order_A','pay_A',sig),true);checks++;
for(const args of [[secret,'order_B','pay_A',sig],[secret,'order_A','pay_B',sig],[secret,'order_A','pay_A','f'.repeat(64)],[secret,'order_A','pay_A','nothex'],['wrong','order_A','pay_A',sig]]) {assert.equal(await verifySignature(...args),false);checks++;}
rejects(()=>requireId('../orders','order'));rejects(()=>requireId(null,'pay'));
console.log(`PASS ${checks} provider/signature checks (fixtures, no provider network calls)`);
