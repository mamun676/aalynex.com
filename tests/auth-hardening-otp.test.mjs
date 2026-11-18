import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/202611181340_lock_profile_identity_and_role.sql',import.meta.url),'utf8');
const ME='11111111-1111-4111-8111-111111111111';

function fixture(options={}) {
 const fields=new Map(),calls=[],users=[],toasts=[];
 const el=(id,val='')=>({id,value:val,textContent:'',innerHTML:'Create Account',
  style:{},dataset:{},disabled:false,checked:id==='su-terms',classList:{add(){},remove(){}},
  parentElement:{insertBefore(item){fields.set(item.id,item);fields.set('signup-otp',{id:'signup-otp',value:'123456'});}},
  remove(){fields.delete(id);},setAttribute(k,v){this[k]=v;}});
 for(const [id,val] of Object.entries({
  'su-name':'New User','su-phone':'','su-email':'new@example.com',
  'su-pw':'SecurePass123','su-pw2':'SecurePass123',
  'su-profession':'Video Editor','su-platform':'Instagram',
  'su-terms':'','signup-err':'','signup-btn':'',
  'su-pw-strength':'','login-email':'person@example.com',
  'login-pw':'Correct123','login-err':'','login-btn':'',
  'reset-otp':'123456','reset-pw':'NewSecure123','reset-pw2':'NewSecure123',
  'reset-err':'','modal-confirm':''
 }))fields.set(id,el(id,val));
 fields.get('login-btn').innerHTML='Login';
 fields.get('su-terms').checked=true;
 const state={calls,toasts,fields,users,loggedIn:null,modal:null,signedOut:[],screen:null};
 const auth={
  signInWithOtp:async args=>{calls.push({op:'otp',args});return{error:options.otpError?{message:'rate limited'}:null};},
  verifyOtp:async args=>{calls.push({op:'verify',args});return options.verifyError?{data:{user:null},error:{message:'Invalid code'}}:
    {data:{user:{id:ME,email:fields.get('su-email').value.toLowerCase()}},error:null};},
  getUser:async()=>{calls.push({op:'getUser'});return{data:{user:{id:options.wrongUser?'another-id':ME,email:fields.get('su-email').value.toLowerCase()}},error:null};},
  updateUser:async args=>{calls.push({op:'updateUser',args});return{error:options.updateError?{message:'Password service offline'}:null};},
  signOut:async args=>{state.signedOut.push(args);return{error:options.signoutError?{message:'failed'}:null};},
  signInWithPassword:async args=>{calls.push({op:'passwordLogin',args});return{data:{user:{id:ME,email:'person@example.com',email_confirmed_at:'2026-11-18'}},error:null};}
 };
 const client={
  auth,
  from(table){assert.equal(table,'profiles');return{
   select(){return this;},eq(){return this;},
   maybeSingle:async()=>{calls.push({op:'profileLookup'});return{data:options.existingProfile?{id:ME}:null,error:options.lookupError?{message:'RLS error'}:null};},
   single:async()=>({data:{id:ME,role:options.loginRole||'creator',name:'Test User',created_at:'2026-11-17',skills:[]},error:null}),
   insert:async row=>{calls.push({op:'profileInsert',row});return{error:options.profileError?{message:'Insert rejected'}:null};}
  };}
 };
 const doc={
  getElementById(id){return fields.get(id)||null;},
  createElement(type){return el(null);},
  querySelectorAll(){return [];}
 };
 const deps={
  document:doc,window:{_accountSessionEpoch:0},supaClient:client,signupRole:'creator',loginRole:'creator',
  _signupOtpData:{},_signupVerifiedUserId:null,
  validateEmailFmt:s=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s),
  validatePhone:s=>({ok:true,phone:s}),escapeHtml:s=>String(s),
  showToast:(...args)=>toasts.push(args),
  showScreen:s=>state.screen=s,
  showModal:(title,body,callback)=>state.modal={title,body,callback},
  closeModal:()=>{state.modal=null;},resetPremiumSession(){},cleanupAccountRealtime(){},
  DB:{users:()=>users,saveUsers(list){users.splice(0,users.length,...list);},logout(){users.length=0;}},
  loginSuccess:u=>{state.loggedIn=u;},AX_PROFILE_PUBLIC_FIELDS:'id,name,role',
  axGetOwnPhone:async()=>'',CU:null,activeManageProjectId:null,currentChatUserId:null,
  setBtn:(id,loading,message)=>{const b=fields.get(id);b.disabled=loading;b.textContent=loading?(message||'...'):b.innerHTML;},
  setTimeout:()=>1,clearTimeout(){},Date,
 };
 const start=source.indexOf('function axPasswordValidation(');
 const stop=source.indexOf('async function loginSuccess(',start);
 assert.ok(start>0&&stop>start);
 const authSource=source.slice(start,stop)+
 '\nreturn {axPasswordValidation,updateSignupStrength,toggleAuthPassword,doSignup,doSignupVerifyOTP,resendSignupOTP,_resetSignupForm};';
 const funcs=new Function('deps','with(deps){\n'+authSource+'\n}')(deps);
 return{state,fields,client,funcs,deps};
}
const count=(f,op)=>f.state.calls.filter(c=>c.op===op).length;

test('existing passwords may still login, while new ones need 8+ chars, letters and numbers',()=>{
 const {funcs}=fixture();
 assert.equal(funcs.axPasswordValidation('Abc123'),'Use at least 8 characters.');
 assert.match(funcs.axPasswordValidation('abcdefgh'),/number/);
 assert.equal(funcs.axPasswordValidation('longSecurePass123'),'');
});
test('new account UI has confirmation, strength, accessible visibility and consent, without Google',()=>{
 for(const id of ['su-pw2','su-pw-strength','su-terms','login-pw']) assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/toggleAuthPassword/);
 assert.match(html,/auth-hardening-20261118/);
 assert.doesNotMatch(html,/signInWithOAuth|google-signin|google-login/i);
});
test('show/hide password updates input and accessibility state',()=>{
 const f=fixture(),input=f.fields.get('su-pw'),b={textContent:'Show',setAttribute(k,v){this[k]=v;}};
 input.type='password';f.funcs.toggleAuthPassword('su-pw',b);
 assert.equal(input.type,'text');assert.equal(b['aria-pressed'],'true');
 f.funcs.toggleAuthPassword('su-pw',b);assert.equal(input.type,'password');
});
test('signup rejects mismatched confirmation, weak password and missing terms before auth calls',async()=>{
 const f=fixture();
 f.fields.get('su-pw2').value='different';
 await f.funcs.doSignup();assert.equal(count(f,'otp'),0);assert.match(f.fields.get('signup-err').textContent,/do not match/);
 f.fields.get('su-pw2').value='SecurePass123';
 f.fields.get('su-pw').value='short';
 await f.funcs.doSignup();assert.equal(count(f,'otp'),0);
 f.fields.get('su-pw').value='SecurePass123';
 f.fields.get('su-terms').checked=false;
 await f.funcs.doSignup();assert.equal(count(f,'otp'),0);
});
test('signup starts email OTP and sets account creation flow without storing a login prematurely',async()=>{
 const f=fixture();await f.funcs.doSignup();
 assert.equal(count(f,'otp'),1);
 assert.equal(f.state.calls.find(c=>c.op==='otp').args.options.shouldCreateUser,true);
 assert.equal(f.state.loggedIn,null);
 assert.ok(f.fields.get('signup-otp-fg'));
 assert.equal(f.fields.get('signup-btn').textContent,'Verify & Create Account');
});
test('resend OTP enforces client cooldown without calling auth again',async()=>{
 const f=fixture();await f.funcs.doSignup();await f.funcs.resendSignupOTP();
 assert.equal(count(f,'otp'),1);
 assert.match(f.fields.get('signup-err').textContent,/wait/);
});
test('OTP verification never overwrites an existing account or its password',async()=>{
 const f=fixture({existingProfile:true});
 await f.funcs.doSignup();await f.funcs.doSignupVerifyOTP();
 assert.equal(count(f,'verify'),1);assert.equal(count(f,'updateUser'),0);
 assert.equal(count(f,'profileInsert'),0);assert.equal(f.state.loggedIn,null);
 assert.equal(f.state.signedOut[0].scope,'local');
});
test('OTP verified for another session cannot create a profile',async()=>{
 const f=fixture({wrongUser:true});await f.funcs.doSignup();await f.funcs.doSignupVerifyOTP();
 assert.equal(count(f,'profileInsert'),0);
 assert.equal(count(f,'updateUser'),0);
 assert.equal(f.state.loggedIn,null);
});
test('password update failure never creates a profile or announces login',async()=>{
 const f=fixture({updateError:true});await f.funcs.doSignup();await f.funcs.doSignupVerifyOTP();
 assert.equal(count(f,'updateUser'),1);assert.equal(count(f,'profileInsert'),0);assert.equal(f.state.loggedIn,null);
});
test('profile insert failure never falsely logs user in; verified retry does not reuse OTP',async()=>{
 const f=fixture({profileError:true});await f.funcs.doSignup();await f.funcs.doSignupVerifyOTP();
 assert.equal(count(f,'verify'),1);assert.equal(f.state.loggedIn,null);
 assert.equal(count(f,'profileInsert'),1);
 // A second click uses the already-verified current account, not expired OTP.
 await f.funcs.doSignupVerifyOTP();
 assert.equal(count(f,'verify'),1);assert.equal(count(f,'profileInsert'),2);
});
test('successful signup inserts exactly one own profile, clears passwords, then enters app',async()=>{
 const f=fixture();await f.funcs.doSignup();await f.funcs.doSignupVerifyOTP();
 assert.equal(count(f,'profileInsert'),1);
 assert.equal(f.state.calls.find(c=>c.op==='profileInsert').row.role,'creator');
 assert.equal(f.state.loggedIn?.id,ME);
 assert.equal(f.fields.get('su-pw').value,'');assert.equal(f.fields.get('su-pw2').value,'');
 assert.equal(f.fields.get('su-terms').checked,false);
});
test('role and identity are immutable for browser users but original profiles remain intact',()=>{
 assert.match(sql,/NEW\.role IS DISTINCT FROM OLD\.role/);
 assert.match(sql,/NEW\.id IS DISTINCT FROM OLD\.id/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM public\.profiles|UPDATE public\.profiles/i);
});
test('password reset and logout both use local scope; no global device logout',()=>{
 assert.match(source,/signOut\(\{ scope: 'local' \}\)/);
 assert.doesNotMatch(source,/auth\.signOut\(\)/);
});

test('wrong role login keeps email, clears password and only signs out this session',async()=>{
 const f=fixture({loginRole:'freelancer'});
 const start=source.indexOf('async function doLogin()');
 const end=source.indexOf('// Keep existing password logins',start);
 assert.ok(start>0&&end>start);
 const login=new Function('deps','with(deps){'+source.slice(start,end)+'\nreturn doLogin;}')(f.deps);
 await login();
 assert.equal(f.state.loggedIn,null);
 assert.equal(f.fields.get('login-email').value,'person@example.com');
 assert.equal(f.fields.get('login-pw').value,'');
 assert.equal(f.state.signedOut[0].scope,'local');
 assert.match(f.fields.get('login-err').textContent,/Creator/);
});
test('correct role password login still works with existing password and profile',async()=>{
 const f=fixture({loginRole:'creator'});
 const start=source.indexOf('async function doLogin()');
 const end=source.indexOf('// Keep existing password logins',start);
 const login=new Function('deps','with(deps){'+source.slice(start,end)+'\nreturn doLogin;}')(f.deps);
 await login();
 assert.equal(f.state.loggedIn.id,ME);
 assert.equal(f.state.loggedIn.role,'creator');
 assert.equal(f.state.signedOut.length,0);
});
test('password reset rejects weak or mismatched passwords before OTP verify',async()=>{
 const f=fixture();
 const start=source.indexOf('async function doResetVerifyOTP()');
 assert.ok(start>0);
 const reset=new Function('deps',"with(deps){let _resetEmail='person@example.com';"+
  source.slice(start)+"\nreturn doResetVerifyOTP;}")(f.deps);
 f.fields.get('reset-pw').value='bad';
 await reset();assert.equal(count(f,'verify'),0);
 f.fields.get('reset-pw').value='NewSecure123';
 f.fields.get('reset-pw2').value='different';
 await reset();assert.equal(count(f,'verify'),0);
 assert.match(f.fields.get('reset-err').textContent,/do not match/);
});
test('successful password recovery updates password and signs out locally',async()=>{
 const f=fixture();
 const start=source.indexOf('async function doResetVerifyOTP()');
 const reset=new Function('deps',"with(deps){let _resetEmail='person@example.com';"+
  source.slice(start)+"\nreturn doResetVerifyOTP;}")(f.deps);
 await reset();
 assert.equal(count(f,'verify'),1);
 assert.equal(count(f,'updateUser'),1);
 assert.equal(f.state.signedOut[0].scope,'local');
});
test('failed logout never pretends to log user out or clears in-memory account',async()=>{
 const f=fixture({signoutError:true});
 const start=source.indexOf('function logout()');
 const end=source.indexOf('/* ---- FORGOT PASSWORD',start);
 assert.ok(start>0&&end>start);
 const logout=new Function('deps','with(deps){'+source.slice(start,end)+'\nreturn logout;}')(f.deps);
 f.state.users.push({id:ME});
 logout();
 assert.ok(f.state.modal?.callback);
 await f.state.modal.callback();
 assert.equal(f.state.users.length,1);
 assert.equal(f.state.screen,null);
});
test('successful logout clears session only after Supabase local logout completes',async()=>{
 const f=fixture();
 const start=source.indexOf('function logout()');
 const end=source.indexOf('/* ---- FORGOT PASSWORD',start);
 const logout=new Function('deps','with(deps){'+source.slice(start,end)+'\nreturn logout;}')(f.deps);
 f.state.users.push({id:ME});
 logout();
 await f.state.modal.callback();
 assert.equal(f.state.signedOut[0].scope,'local');
 assert.equal(f.state.users.length,0);
 assert.equal(f.state.screen,'screen-landing');
});
