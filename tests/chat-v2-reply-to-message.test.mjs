import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const v2 = readFileSync(new URL('../js/ax-chat-v2.js', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202611180930_add_chat_reply_target.sql', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/ax-chat-v2.css', import.meta.url), 'utf8');
const ME='11111111-1111-4111-8111-111111111111';
const PEER='22222222-2222-4222-8222-222222222222';
const OTHER='55555555-5555-4555-8555-555555555555';
const CID='33333333-3333-4333-8333-333333333333';
const CID2='66666666-6666-4666-8666-666666666666';
const TARGET='44444444-4444-4444-8444-444444444444';

function fixture(search='',msgText='Hello <script>alert(1)</script>') {
  const listeners=new Map(),store=new Map();
  const msg={id:TARGET,from:PEER,text:msgText,file_url:null,time:Date.now()};
  const key=[ME,PEER].sort().join('_');
  const DB={messages:()=>({[key]:[msg]}),users:()=>[{id:PEER,name:'Vasu <test>'}]};
  let composer=null;
  const bar={parentNode:{insertBefore(el){
    composer=el;
    el.remove=()=>{composer=null;};
  }}};
  const box={getClientRects:()=>[{}],querySelector:()=>null,scrollHeight:100,scrollTop:0,clientHeight:100};
  const doc={
    visibilityState:'visible',
    getElementById(id){
      if(id==='axv2-reply-composer')return composer;
      if(id==='chat-inp-el')return{focus(){}};
      if(id==='chat-msgs-el')return box;
      if(id==='chat-status-text')return{textContent:'',style:{}};
      if(id==='chat-online-dot')return{style:{}};
      return null;
    },
    querySelector(s){return s==='.chat-inp-bar'?bar:null;},
    querySelectorAll(){return [];},
    createElement(tag){
      return{tag,children:[],attributes:{},className:'',textContent:'',
        append(...children){this.children.push(...children);},
        setAttribute(k,v){this.attributes[k]=v;},
        remove(){composer=null;}
      };
    },
    addEventListener(k,fn){listeners.set(k,fn);}
  };
  const supaClient={
    rpc:async()=>({data:1,error:null}),
    from(){return{select(){return this;},eq(){return this;},is(){return this;},
      order(){return this;},range(){return this;},
      then(ok,bad){return Promise.resolve({data:[],error:null}).then(ok,bad);},
      maybeSingle(){return Promise.resolve({data:null,error:null});}
    };},
    channel(){return{on(){return this;},subscribe(){return this;}};},
    removeChannel:async()=>{}
  };
  const ctx={window:{location:{search}},document:doc,sessionStorage:{
    getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),
    removeItem:k=>store.delete(k)
  },URLSearchParams,CU:{id:ME},DB,supaClient,
  currentConversationId:CID,currentChatUserId:PEER,
  setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},Date};
  runInNewContext(v2,ctx,{timeout:2000});
  const api=ctx.window.axChatV2;
  if(api.enabled)api.onLogin({id:ME});
  const click=(attr,value)=>{
    const node={getAttribute:k=>k===attr?value:null};
    const target={closest:s=>s==='['+attr+']'?node:null};
    listeners.get('click')?.({target,preventDefault(){}});
  };
  return{api,click,ctx,msg,composer:()=>composer};
}

test('Reply button is limited to confirmed messages',()=>{
  const e=fixture();
  assert.match(e.api.replyButton(e.msg),/data-axv2-reply/);
  for(const status of ['sending','failed','blocked']){
    assert.equal(e.api.replyButton({...e.msg,_deliveryStatus:status}),'');
  }
});

test('quoted original content is HTML-escaped and linked to real UUID',()=>{
  const e=fixture();
  const html=e.api.quotedMessage({replyToMessageId:TARGET},[e.msg]);
  assert.match(html,/Vasu &lt;test&gt;/);
  assert.match(html,/Hello &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>|Vasu <test>/);
  assert.match(html,new RegExp(TARGET));
});

test('private attachment quote never shows original key',()=>{
  const e=fixture();
  const attachment={...e.msg,file_url:'s3/private/final.mp4',text:'Top secret'};
  const html=e.api.quotedMessage({replyToMessageId:TARGET},[attachment]);
  assert.match(html,/Protected attachment/);
  assert.doesNotMatch(html,/Top secret|s3\/private/);
});

test('Reply button opens preview and sends same target exactly once',()=>{
  const e=fixture();
  e.click('data-axv2-reply',TARGET);
  const node=e.composer();
  assert.ok(node);
  assert.match(node.children[0].children[0].textContent,/Replying to Vasu/);
  assert.equal(node.children[0].children[1].textContent,e.msg.text);
  assert.equal(e.api.takeReply(ME,PEER),TARGET);
  assert.equal(e.composer(),null);
  assert.equal(e.api.takeReply(ME,PEER),null);
});

test('Cancel Reply discards draft and does not touch original',()=>{
  const e=fixture();e.click('data-axv2-reply',TARGET);
  assert.ok(e.composer());
  e.click('data-axv2-reply-cancel','true');
  assert.equal(e.composer(),null);
  assert.equal(e.api.takeReply(ME,PEER),null);
  assert.match(e.msg.text,/Hello/);
});

test('invalid or unrelated message IDs cannot be selected',()=>{
  const e=fixture();
  e.click('data-axv2-reply','<script>');
  e.click('data-axv2-reply',OTHER);
  assert.equal(e.composer(),null);
});

test('switching conversation or logout clears unsent reply safely',()=>{
  const e=fixture();e.click('data-axv2-reply',TARGET);
  e.ctx.currentChatUserId=OTHER;e.ctx.currentConversationId=CID2;
  e.api.onConversation(CID2,OTHER);
  assert.equal(e.composer(),null);
  assert.equal(e.api.takeReply(ME,OTHER),null);
  e.api.cleanup();
  assert.equal(e.composer(),null);
});

test('legacy fallback has no Reply UI or new handlers',()=>{
  const e=fixture('?axchatv2=0');
  assert.equal(e.api.enabled,false);
  e.click('data-axv2-reply',TARGET);
  assert.equal(e.composer(),null);
  assert.equal(e.api.replyButton,undefined);
});

test('normal text carries reply ID; programmatic text and videos do not',async()=>{
  const start=chat.indexOf('async function sendMsg('),end=chat.indexOf('// Dedicated UUID-only action',start);
  assert.ok(start>0&&end>start);
  const inp={value:'Hello reply'},out=[];
  let consumes=0;
  const mock={window:{axChatV2:{enabled:true,takeReply:()=>{consumes++;return TARGET;}}},
    currentChatUserId:PEER,document:{getElementById:()=>inp},axChatPrune(){},
    axChatOwner:()=>({owns:()=>true}),axChatUUID:/^[0-9a-f-]{36}$/i,
    axChatOutbox:new Map(),crypto:{randomUUID:()=>TARGET},
    axChatAttempt:async e=>{out.push(e);return {ok:true};},
    axLegacyAttachmentSendMsg:async()=>({attachment:true}),showToast(){}};
  const send=runInNewContext(chat.slice(start,end)+'\nsendMsg',mock,{timeout:2000});
  await send(ME,PEER);
  assert.equal(out[0].replyToMessageId,TARGET);
  assert.equal(consumes,1);
  assert.equal(inp.value,'');
  await send(ME,PEER,null,null,'Automated message');
  assert.equal(out[1].replyToMessageId,null);
  assert.equal(consumes,1);
  assert.equal((await send(ME,PEER,'private-file')).attachment,true);
  assert.equal(consumes,1);
});

test('reply ID persists across retry, syncing, ACK and Realtime',()=>{
  assert.match(chat,/replyToMessageId:e\.replyToMessageId\|\|null/);
  assert.match(chat,/reply_to_message_id:e\.replyToMessageId/);
  assert.match(chat,/String\(r\.reply_to_message_id\|\|''\)===String\(e\.replyToMessageId\|\|''\)/);
  assert.match(chat,/replyToMessageId: newMsg\.reply_to_message_id \|\| null/);
  assert.match(chat,/replyToMessageId: m\.reply_to_message_id \|\| null/);
  assert.match(sync,/replyToMessageId: m\.reply_to_message_id \|\| null/);
});

test('migration is additive and enforces same-conversation integrity',()=>{
  assert.match(migration,/ADD COLUMN IF NOT EXISTS reply_to_message_id uuid/);
  assert.match(migration,/FOREIGN KEY \(reply_to_message_id\)/);
  assert.match(migration,/original\.conversation_id = NEW\.conversation_id/);
  assert.match(migration,/SECURITY INVOKER/);
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM public\.messages/i);
});

test('existing secure payment/media and V2 read receipts remain',()=>{
  assert.match(chat,/async function axLegacyAttachmentSendMsg/);
  assert.match(chat,/axPayInChat/);
  assert.match(v2,/axv2_ack_messages/);
  assert.match(v2,/axv8_set_typing/);
  assert.match(v2,/paintUnreadBadges/);
});

test('new scripts and CSS are cache-busted and reply controls focus-visible',()=>{
  assert.match(index,/js\/ax-chat-v2\.js\?v=aalynex-v2-reply-20261118/);
  assert.match(index,/js\/chat\.js\?v=aalynex-v2-reply-20261118/);
  assert.match(index,/js\/sync\.js\?v=aalynex-v2-reply-20261118/);
  assert.match(css,/\.axv2-reply-composer/);
  assert.match(css,/\.axv2-message-quote/);
  assert.match(css,/:focus-visible/);
});
