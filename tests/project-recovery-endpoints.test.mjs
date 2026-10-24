import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';import {createHmac} from 'node:crypto';
const root=new URL('../supabase/functions/',import.meta.url);let checks=0;
const creator='11111111-1111-4111-8111-111111111111',editor='22222222-2222-4222-8222-222222222222',iid='33333333-3333-4333-8333-333333333333',did='44444444-4444-4444-8444-444444444444';
const secret='fixture-webhook-only-not-live';
async function harness(options={}){
 const settings={who:creator,authorized:false,refund:0,providerFails:false,unbound:false,wrongAmount:false,ambiguous:false,unmanaged:false,worker:true,orderNew:false,orderCreated:false,...options};
 const api=[],calls=[],handlers=new Map();let finalCount=0;
 const intent={id:iid,project_id:'A',creator_id:creator,freelancer_id:editor,delivery_id:did,provider_order_id:settings.unbound?null:'order_A',receipt:'ax_fixture',amount_paise:10300,currency:'INR',state:settings.unbound?'creating':'ready',next_reconcile_at:'2020-01-01T00:00:00Z'};
 const rows={ax_project_order_intents:[intent],ax_project_webhook_receipts:[],ax_project_payment_holds:[],projects:[{id:'A',creator_id:creator,paid:false}],payments:[]};
 function query(table){let filters=[],fields='*',update=null,max=Infinity,sortKey=null;const b={select(f){fields=f;return b;},eq(k,v){filters.push(r=>r[k]===v);return b;},lte(k,v){filters.push(r=>r[k]<=v);return b;},order(k){sortKey=k;return b;},limit(n){max=n;return b;},update(v){update=v;return b;},async single(){const x=await result();return {data:x.data[0]||null,error:x.data[0]?null:{message:'missing'}};},async maybeSingle(){const x=await result();return {data:x.data[0]||null,error:null};},then(ok,err){return result().then(ok,err);}};async function result(){let selected=(rows[table]||[]).filter(r=>filters.every(f=>f(r)));if(sortKey)selected.sort((a,b)=>String(a[sortKey]).localeCompare(String(b[sortKey])));selected=selected.slice(0,max);if(update)selected.forEach(r=>Object.assign(r,update));return {data:selected.map(r=>fields==='*'?structuredClone(r):Object.fromEntries(fields.split(',').map(k=>[k,r[k]]))),error:null};}return b;}
 const admin={from:query,async rpc(name,p){calls.push({name,p});
  if(name==='ax_prepare_project_order'){return {data:{...intent,is_new:settings.orderNew},error:null};}
  if(name==='ax_register_project_event'){
   let r=rows.ax_project_webhook_receipts.find(x=>x.event_id===p.p_event_id);
   if(r&&(r.body_hash!==p.p_hash||r.event_type!==p.p_type))return {error:{message:'collision'}};
   if(!r){r={event_id:p.p_event_id,body_hash:p.p_hash,event_type:p.p_type,provider_payment_id:p.p_payment_id,provider_order_id:p.p_order_id,state:'pending',created_at:new Date().toISOString(),next_retry_at:new Date().toISOString()};rows.ax_project_webhook_receipts.push(r);}return {data:structuredClone(r),error:null};
  }
  if(name==='ax_finish_project_event'){const r=rows.ax_project_webhook_receipts.find(x=>x.event_id===p.p_event_id);if(r?.state==='pending')Object.assign(r,{state:p.p_state,outcome:p.p_outcome});return {error:null};}
  if(name==='ax_retry_project_event'){const r=rows.ax_project_webhook_receipts.find(x=>x.event_id===p.p_event_id);if(r?.state==='pending')Object.assign(r,{last_error_code:'retry_required',next_retry_at:new Date(Date.now()+300000).toISOString()});return {error:null};}
  if(name==='ax_attach_project_order'){if(intent.provider_order_id&&intent.provider_order_id!==p.p_order_id)return {error:{message:'bound'}};intent.provider_order_id=p.p_order_id;intent.state='ready';return {error:null};}
  if(name==='ax_hold_project_payment'){if(!rows.ax_project_payment_holds.length)rows.ax_project_payment_holds.push({intent_id:p.p_intent_id,active:true,reason:p.p_reason});return {error:null};}
  if(name==='ax_finalize_project_payment'){finalCount++;if(rows.ax_project_payment_holds.some(h=>h.active))return {data:{status:'held'},error:null};const already=rows.payments.length>0;if(!already)rows.payments.push({project_id:'A',payment_id:p.p_payment_id});intent.state='verified';rows.projects[0].paid=true;return {data:{ok:true,project_id:'A',already},error:null};}
  throw Error('Unexpected RPC '+name);
 }};
 const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',PROJECT_PAYMENT_ALLOWED_ORIGINS:'https://main.fixture',PROJECT_PAYMENT_MODE:'test',PROJECT_RAZORPAY_KEY_ID:'rzp_test_fixture',PROJECT_RAZORPAY_KEY_SECRET:'fixture-provider',PROJECT_RAZORPAY_WEBHOOK_SECRET:secret,PROJECT_RECONCILE_TOKEN:'fixture-private-worker-token-32-characters',PROJECT_RECONCILE_ENABLED:settings.worker?'true':'false',PROJECT_PAYMENTS_ENABLED:'true'};
 const providerOrder=()=>({id:'order_A',amount:settings.wrongAmount?100:10300,currency:'INR',receipt:intent.receipt,notes:settings.unmanaged?{}:{ax_intent_id:iid,project_id:'A'},status:settings.orderCreated?'created':settings.authorized?'attempted':'paid',amount_paid:settings.orderCreated||settings.authorized?0:10300,amount_due:settings.orderCreated||settings.authorized?10300:0});
 const providerPayment=()=>({id:'pay_A',order_id:'order_A',amount:10300,currency:'INR',status:settings.authorized?'authorized':'captured',captured:!settings.authorized,amount_refunded:settings.refund});
 let currentEndpoint;
 const context=vm.createContext({console,Request,Response,Headers,URL,URLSearchParams,AbortSignal,TextEncoder,TextDecoder,Uint8Array,crypto,btoa,Date,fetch:async(url,req={})=>{
  api.push({url,method:req.method||'GET',body:req.body?JSON.parse(req.body):null});if(settings.providerFails)throw Error('fixture provider outage');
  if(url.endsWith('/orders/order_A/payments'))return Response.json(settings.orderCreated?{count:0,items:[]}:{count:1,items:[providerPayment()]});
  if(url.endsWith('/orders')&&req.method==='POST')return Response.json(providerOrder());
  if(url.endsWith('/orders/order_A'))return Response.json(providerOrder());
  if(url.endsWith('/payments/pay_A'))return Response.json(providerPayment());
  if(url.includes('/orders?'))return Response.json({count:settings.ambiguous?2:1,items:settings.ambiguous?[providerOrder(),{...providerOrder(),id:'order_OTHER'}]:[providerOrder()]});
  throw Error('Unexpected provider call '+url);
 },Deno:{env:{get:k=>env[k]},serve:h=>handlers.set(currentEndpoint,h)}});
 const modules=new Map();async function load(url){if(modules.has(url.href))return modules.get(url.href);const raw=await readFile(url,'utf8');const m=new vm.SourceTextModule(url.href.endsWith('.ts')?stripTypeScriptTypes(raw):raw,{context,identifier:url.href});modules.set(url.href,m);await m.link(async(spec,ref)=>{
  if(spec.includes('@supabase/supabase-js')){
   if(modules.has('supabase'))return modules.get('supabase');const sm=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',(_url,key)=>key==='fixture-service'?admin:{auth:{getUser:async()=>({data:{user:settings.who?{id:settings.who}:null},error:null})}});},{context,identifier:'supabase'});modules.set('supabase',sm);return sm;
  }
  return load(new URL(spec,ref.identifier));
 });return m;}
 async function endpoint(name,body,headers={}){currentEndpoint=name;const m=await load(new URL(name+'/index.ts',root));if(m.status!=='evaluated')await m.evaluate();const raw=typeof body==='string'?body:JSON.stringify(body);return handlers.get(name)(new Request('https://fixture.supabase.co/'+name,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:raw}));}
 async function webhook(type='payment.captured',eventId='evt-A',headers={}){const raw=JSON.stringify({event:type,payload:{payment:{entity:{id:'pay_A',order_id:'order_A'}}}});return endpoint('project-payment-webhook-v2',raw,{'x-razorpay-signature':createHmac('sha256',secret).update(raw).digest('hex'),'x-razorpay-event-id':eventId,...headers});}
 return {settings,rows,api,calls,endpoint,webhook,finalCount:()=>finalCount,env};
}
const eq=(a,b)=>{assert.equal(a,b);checks++;};const ownerHeaders={Authorization:'Bearer fixture',Origin:'https://main.fixture'};
let h=await harness();let r=await h.webhook();eq(r.status,200);eq(h.rows.payments.length,1);eq(h.rows.ax_project_webhook_receipts[0].state,'complete');
r=await h.webhook();eq(r.status,200);eq(h.rows.payments.length,1);eq(h.finalCount(),1);
h=await harness();r=await h.webhook('payment.captured','evt-bad',{'x-razorpay-signature':'0'.repeat(64)});eq(r.status,400);eq(h.calls.length,0);eq(h.api.length,0);
h=await harness({providerFails:true});r=await h.webhook();eq(r.status,503);eq(h.rows.ax_project_webhook_receipts[0].state,'pending');eq(h.rows.ax_project_webhook_receipts[0].last_error_code,'retry_required');h.settings.providerFails=false;r=await h.webhook();eq(r.status,200);eq(h.rows.payments.length,1);
h=await harness({authorized:true});r=await h.webhook('payment.authorized','evt-auth');eq(r.status,200);eq(h.rows.payments.length,0);h.settings.authorized=false;r=await h.webhook('payment.captured','evt-captured');eq(r.status,200);eq(h.rows.payments.length,1);
h=await harness();r=await h.webhook('refund.created','evt-refund');eq(r.status,200);eq(h.rows.ax_project_payment_holds.length,1);r=await h.webhook('payment.captured','evt-late');eq(r.status,200);eq(h.rows.payments.length,0);r=await h.webhook('payment.dispute.won','evt-won');eq(r.status,200);eq(h.rows.ax_project_payment_holds[0].active,true);
h=await harness({refund:100});r=await h.webhook();eq(r.status,200);eq(h.rows.payments.length,0);eq(h.rows.ax_project_payment_holds[0].reason,'provider_refund');
h=await harness();r=await h.endpoint('project-recover-v2',{projectId:'A'},ownerHeaders);eq(r.status,200);eq((await r.json()).status,'verified');eq(h.rows.payments.length,1);eq(h.api.every(a=>a.method==='GET'),true);
h=await harness({who:editor});r=await h.endpoint('project-recover-v2',{projectId:'A'},ownerHeaders);eq(r.status,403);eq(h.api.length,0);
h=await harness({unbound:true});r=await h.endpoint('project-recover-v2',{projectId:'A'},ownerHeaders);eq(r.status,200);eq(h.rows.ax_project_order_intents[0].provider_order_id,'order_A');eq(h.rows.payments.length,1);eq(h.api.some(a=>a.url.includes('receipt=ax_fixture')),true);
h=await harness({unbound:true,ambiguous:true});r=await h.endpoint('project-recover-v2',{projectId:'A'},ownerHeaders);eq(r.status,409);eq(h.rows.ax_project_order_intents[0].provider_order_id,null);eq(h.rows.payments.length,0);
h=await harness({wrongAmount:true});r=await h.webhook();eq(r.status,503);eq(h.rows.payments.length,0);
h=await harness({unmanaged:true});h.rows.ax_project_order_intents=[];r=await h.webhook();eq(r.status,200);eq(h.rows.payments.length,0);eq(h.rows.ax_project_webhook_receipts[0].state,'review');
h=await harness();r=await h.endpoint('project-payment-reconcile-v2',{},{});eq(r.status,401);eq(h.api.length,0);
r=await h.endpoint('project-payment-reconcile-v2',{}, {'x-project-reconcile-token':h.env.PROJECT_RECONCILE_TOKEN,Origin:'https://main.fixture'});eq(r.status,403);
r=await h.endpoint('project-payment-reconcile-v2',{}, {'x-project-reconcile-token':h.env.PROJECT_RECONCILE_TOKEN});eq(r.status,200);eq(h.rows.payments.length,1);eq(h.api.every(a=>a.method==='GET'),true);
h=await harness({worker:false});r=await h.endpoint('project-payment-reconcile-v2',{}, {'x-project-reconcile-token':h.env.PROJECT_RECONCILE_TOKEN});eq(r.status,503);eq(h.api.length,0);
// The private worker can recover a durably queued failed webhook without any browser callback.
h=await harness({providerFails:true});r=await h.webhook();eq(r.status,503);
h.settings.providerFails=false;h.rows.ax_project_webhook_receipts[0].next_retry_at='2020-01-01T00:00:00Z';
r=await h.endpoint('project-payment-reconcile-v2',{}, {'x-project-reconcile-token':h.env.PROJECT_RECONCILE_TOKEN});eq(r.status,200);eq(h.rows.ax_project_webhook_receipts[0].state,'complete');eq(h.rows.payments.length,1);
h=await harness();h.rows.ax_project_order_intents=[];r=await h.endpoint('project-recover-v2',{projectId:'A'},ownerHeaders);eq(r.status,200);eq((await r.json()).status,'no_managed_checkout');eq(h.api.length,0);
h=await harness();r=await h.endpoint('project-recover-v2',{projectId:'A',providerOrderId:'order_OTHER'},ownerHeaders);eq(r.status,409);eq(h.api.length,0);eq(h.rows.payments.length,0);
h=await harness();r=await h.webhook('payment.captured','evt-collision');eq(r.status,200);r=await h.webhook('refund.created','evt-collision');eq(r.status,503);eq(h.rows.ax_project_webhook_receipts[0].state,'complete');
// Versioned callback tests: the actual endpoint is imported, provider/DB are fixtures.
const callback={projectId:'A',razorpay_order_id:'order_A',razorpay_payment_id:'pay_A',razorpay_signature:createHmac('sha256','fixture-provider').update('order_A|pay_A').digest('hex')};
h=await harness();r=await h.endpoint('project-verify-v2',callback,ownerHeaders);eq(r.status,200);eq(h.rows.payments.length,1);
h=await harness();r=await h.endpoint('project-verify-v2',{...callback,projectId:'B'},ownerHeaders);eq(r.status,403);eq(h.api.length,0);
h=await harness();r=await h.endpoint('project-verify-v2',{...callback,razorpay_signature:'0'.repeat(64)},ownerHeaders);eq(r.status,400);eq(h.api.length,0);
h=await harness({authorized:true});r=await h.endpoint('project-verify-v2',callback,ownerHeaders);eq(r.status,409);eq(h.rows.payments.length,0);
h=await harness();h.rows.ax_project_payment_holds.push({intent_id:iid,active:true});r=await h.endpoint('project-verify-v2',callback,ownerHeaders);eq(r.status,409);eq(h.rows.payments.length,0);
h=await harness({who:null});r=await h.endpoint('project-verify-v2',callback,ownerHeaders);eq(r.status,401);eq(h.api.length,0);
h=await harness({orderNew:true,orderCreated:true});r=await h.endpoint('project-order-v2',{projectId:'A',amount:1,currency:'USD'},ownerHeaders);eq(r.status,200);const orderPayload=h.api.find(x=>x.method==='POST').body;eq(orderPayload.amount,10300);eq(orderPayload.currency,'INR');eq(h.api.filter(x=>x.method==='POST').length,1);
h=await harness({orderCreated:true});r=await h.endpoint('project-order-v2',{projectId:'A'},ownerHeaders);eq(r.status,200);eq(h.api.every(x=>x.method==='GET'),true);
h=await harness({authorized:true});r=await h.endpoint('project-order-v2',{projectId:'A'},ownerHeaders);eq(r.status,409);eq(h.api.every(x=>x.method==='GET'),true);
h=await harness();h.env.PROJECT_PAYMENTS_ENABLED='false';r=await h.endpoint('project-order-v2',{projectId:'A'},ownerHeaders);eq(r.status,503);eq(h.api.length,0);
h=await harness();r=await h.endpoint('project-order-v2',{projectId:'A',extra:'x'.repeat(17000)},ownerHeaders);eq(r.status,409);eq(h.api.length,0);
console.log(`PASS ${checks} recovery endpoint checks (real module logic; mocked provider/Supabase).`);
