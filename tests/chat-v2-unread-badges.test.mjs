import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/ax-chat-v2.js', import.meta.url), 'utf8');
const ME='11111111-1111-4111-8111-111111111111';
const PEER='22222222-2222-4222-8222-222222222222';
const OTHER='55555555-5555-4555-8555-555555555555';
const CID='33333333-3333-4333-8333-333333333333';
const CID2='66666666-6666-4666-8666-666666666666';
const MSG='44444444-4444-4444-8444-444444444444';
const idFrom = n => '44444444-4444-4444-8444-' + n.toString(16).padStart(12,'0');

function fixture({ counts=[], messages=[], open=false, query='', fail=false, sourceUser=ME } = {}) {
  const unreadRows=counts.map((item,i)=>({
    message_id:item.id||idFrom(i+1), conversation_id:item.conversation_id||CID,
    user_id:item.user_id||ME, read_at:item.read_at===undefined?null:item.read_at
  }));
  const convos=[
    {id:CID,user1_id:ME,user2_id:PEER},
    {id:CID2,user1_id:ME,user2_id:OTHER}
  ];
  const state={unreadRows,convos,requests:[],taskQueue:[],intervals:[],listeners:new Map(),items:[],status:{textContent:'',style:{}},dot:{style:{}}};
  function makeNode() {
    return {parent:null,attributes:{},textContent:'',className:'',
      setAttribute(k,v){this.attributes[k]=v;},
      getAttribute(k){return this.attributes[k];},
      remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
    };
  }
  function makeItem(id){
    const node={id,children:[],getAttribute(k){return k==='data-uid'?id:null;},
      querySelector(selector){return this.children.find(x=>selector==='.axv2-unread-badge'&&x.className==='axv2-unread-badge')||null;},
      appendChild(child){child.remove();child.parent=this;this.children.push(child);}
    };
    return node;
  }
  state.items=[makeItem(PEER),makeItem(OTHER)];
  const box={scrollHeight:400,scrollTop:300,clientHeight:100,getClientRects:()=>[{}],
    querySelector(){return null;},appendChild(){},get lastElementChild(){return null;}};
  const document={
    visibilityState:'visible',
    getElementById(id){return id==='chat-msgs-el'?box:id==='chat-status-text'?state.status:id==='chat-online-dot'?state.dot:null;},
    querySelectorAll(selector){
      if(selector==='.cc-item[data-uid]')return state.items;
      if(selector==='.axv2-unread-badge')return state.items.flatMap(x=>x.children);
      return [];
    },
    createElement(){return makeNode();},
    addEventListener(k,cb){state.listeners.set(k,cb);}
  };
  const key=[ME,PEER].sort().join('_');
  const DB={messages:()=>({[key]:messages})};
  const supaClient={
    rpc:async(name,args)=>{
      state.requests.push({name,args});
      if(name==='axv2_ack_messages'){
        if(args?.p_read){
          state.unreadRows=state.unreadRows.filter(x=>!args.p_message_ids.includes(x.message_id));
        }else{
          // Mock the server-created delivery receipt for newly received messages.
          for(const id of args?.p_message_ids||[]){
            if(!state.unreadRows.some(x=>x.message_id===id))
              state.unreadRows.push({message_id:id,conversation_id:CID,user_id:ME,read_at:null});
          }
        }
      }
      return {data:1,error:null};
    },
    from(table){
      const filters=[], order=[];
      const b={
        start:0,end:Infinity,
        select(){return this;},
        eq(k,v){filters.push([k,'eq',v]);return this;},
        is(k,v){filters.push([k,'is',v]);return this;},
        order(k){order.push(k);return this;},
        range(start,end){this.start=start;this.end=end;return this;},
        result(){
          if(fail&&table==='axv2_message_receipts')return {data:null,error:{message:'Offline'}};
          let rows=table==='conversations'?state.convos:
            table==='axv2_message_receipts'?state.unreadRows: [];
          rows=rows.filter(row=>filters.every(([k,op,v])=>op==='eq'?row[k]===v:row[k]===v));
          if(order.length)rows=[...rows].sort((a,b)=>String(a[order[0]]).localeCompare(String(b[order[0]])));
          return {data:rows.slice(this.start,this.end+1),error:null};
        },
        then(ok,bad){return Promise.resolve(this.result()).then(ok,bad);},
        maybeSingle(){const r=this.result();return Promise.resolve({...r,data:r.data?.[0]||null});}
      };
      return b;
    },
    channel(){return {on(){return this;},subscribe(){return this;}};},
    removeChannel:async()=>{}
  };
  const store=new Map();
  const ctx={window:{location:{search:query}},document,sessionStorage:{
    getItem:key=>store.get(key)||null,setItem:(key,v)=>store.set(key,v),removeItem:key=>store.delete(key)
  },URLSearchParams,CU:{id:sourceUser},DB,supaClient,
  currentConversationId:open?CID:null,currentChatUserId:open?PEER:null,
  setTimeout(fn){const obj={fn,active:true};state.taskQueue.push(obj);return obj;},
  clearTimeout(obj){if(obj)obj.active=false;},
  setInterval(fn){state.intervals.push(fn);return state.intervals.length;},
  clearInterval(){},Date};
  runInNewContext(source,ctx,{timeout:2000});
  return {api:ctx.window.axChatV2,state,ctx,makeItem};
}
async function flush(env){
  for(let i=0;i<20;i++)await Promise.resolve();
  for(let round=0;round<3;round++){
    const batch=env.state.taskQueue.splice(0);
    for(const task of batch)if(task.active)task.fn();
    for(let i=0;i<20;i++)await Promise.resolve();
  }
}
function badge(env,index=0){return env.state.items[index].querySelector('.axv2-unread-badge');}
test('unread badge counts delivered-not-read receipts by conversation, not old message history',async()=>{
  const env=fixture({counts:[{},{},{conversation_id:CID2}]});
  assert.equal(env.api.enabled,true);
  env.api.onLogin({id:ME});await flush(env);
  assert.equal(badge(env,0)?.textContent,'2');
  assert.equal(badge(env,1)?.textContent,'1');
  assert.equal(badge(env,0)?.attributes['aria-label'],'2 unread messages');
});
test('read, unrelated-account receipts and absent delivery receipts are NOT counted',async()=>{
  const env=fixture({counts:[
    {id:idFrom(1),read_at:'2026-11-18T01:00:00Z'},
    {id:idFrom(2),user_id:OTHER},
    {id:idFrom(3)}
  ]});
  env.api.onLogin({id:ME});await flush(env);
  assert.equal(badge(env,0)?.textContent,'1');
  assert.equal(badge(env,1),null);
});
test('opening a visible chat clears only that peer badge after server read acknowledgment',async()=>{
  const env=fixture({counts:[
    {id:MSG,conversation_id:CID},
    {id:idFrom(2),conversation_id:CID2}
  ],messages:[{id:MSG,from:PEER}],open:true});
  env.api.onLogin({id:ME});await flush(env);
  assert.ok(env.state.requests.some(r=>r.name==='axv2_ack_messages'&&r.args.p_read));
  assert.equal(badge(env,0),null);
  assert.equal(badge(env,1)?.textContent,'1');
});
test('at least 501 unread receipts are paginated, with 99+ cap and other peers included',async()=>{
  const many=Array.from({length:501},(_,i)=>({id:idFrom(i+1),conversation_id:i===500?CID2:CID}));
  const env=fixture({counts:many});
  env.api.onLogin({id:ME});await flush(env);
  assert.equal(badge(env,0)?.textContent,'99+');
  assert.equal(badge(env,1)?.textContent,'1');
});
test('repainting after chat list re-render restores badge without duplicates',async()=>{
  const env=fixture({counts:[{}]});
  env.api.onLogin({id:ME});await flush(env);
  env.state.items=[env.makeItem(PEER),env.makeItem(OTHER)];
  env.state.intervals.at(-1)(); // existing status timer paints sidebar
  assert.equal(env.state.items[0].children.length,1);
  env.state.intervals.at(-1)();
  assert.equal(env.state.items[0].children.length,1);
});
test('logout cleans up badges and stale unread state, without deleting any message',async()=>{
  const msg={id:MSG,from:PEER,text:'protected file'};
  const env=fixture({counts:[{}],messages:[msg]});
  env.api.onLogin({id:ME});await flush(env);
  assert.equal(badge(env,0)?.textContent,'1');
  env.api.cleanup();
  assert.equal(badge(env,0),null);
  assert.equal(msg.text,'protected file');
});
test('network/permission failures never interrupt regular chat',async()=>{
  const env=fixture({counts:[{}],fail:true});
  env.api.onLogin({id:ME});await flush(env);
  assert.equal(env.api.enabled,true);
  assert.equal(badge(env,0),null);
});
test('legacy fallback keeps unread feature inactive',async()=>{
  const env=fixture({counts:[{}],query:'?axchatv2=0'});
  assert.equal(env.api.enabled,false);
  assert.equal(badge(env,0),null);
});


test('new incoming message updates badge after server delivery acknowledgment',async()=>{
  const env=fixture();
  env.api.onLogin({id:ME});await flush(env);
  assert.equal(badge(env,0),null);
  env.api.onIncoming({new:{id:MSG,conversation_id:CID,sender_id:PEER,receiver_id:ME}});
  await flush(env);
  assert.equal(badge(env,0)?.textContent,'1');
  assert.ok(env.state.requests.some(r=>r.name==='axv2_ack_messages'&&!r.args.p_read));
});
