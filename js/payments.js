// Project-Payment-02 REVIEW: requires matching migration and Edge Functions.
// This changes project checkout only; Premium subscription billing is separate.
let _axProjectCheckoutBusy = false;
async function completePayment() {
 if(_axProjectCheckoutBusy)return;
 const p=DB.projects().find(x=>x.id===activeManageProjectId);
 if(!p||!CU) {showToast('Project not found or sign-in required','err','');return;}
 const userId=CU.id, projectId=p.id, epoch=window._accountSessionEpoch;
 const owns=()=>CU?.id===userId && window._accountSessionEpoch===epoch;
 const btn=document.querySelector('.btn-green-btn');
 const reset=()=>{window._axPayStartedInChat=null;_axProjectCheckoutBusy=false;if(owns()&&btn?.isConnected){btn.disabled=false;btn.textContent='Pay Now →';}};
 async function call(name,body) {
  const {data:{session},error:sessionError}=await supaClient.auth.getSession();
  if(sessionError||!owns()||!session||session.user.id!==userId) throw new Error('Account changed. Sign in with the paying account; do not pay again.');
  // The SDK sends the publishable apikey plus the user's session JWT.
  // Keep the same authenticated transport used by chat and media calls.
  const {data,error}=await supaClient.functions.invoke(name,{body});
  if(error){
   let status=0,details=null;
   const context=error.context;
   if(context && typeof context.status==='number')status=context.status;
   if(context && typeof context.clone==='function'){
    try{details=await context.clone().json();}catch(_){/* Keep safe generic message */}
   }
   const message=String(details?.error||'');
   if(status===503 && message==='Project checkout is paused')
    throw new Error('Razorpay project checkout is paused by the server. Merchant activation is still pending; no charge was created.');
   if(status===403 && /test.only|demo|live approval/i.test(message))
    throw new Error('This project is test-only. It requires genuine live billing approval before a real-money payment.');
   if(status===409)throw new Error('Existing checkout needs reconciliation. Do not pay again.');
   throw new Error(message||'Secure payment service unavailable. No new payment should be attempted.');
  }
  if(!owns()||!data||typeof data!=='object')throw new Error('Invalid session or payment response.');
  return data;
 }
 _axProjectCheckoutBusy=true;
 if(btn){btn.disabled=true;btn.textContent='Processing…';}
 try {
  // Check signed server evidence before attempting any charge.
  const state=await call('project-media-v2',{action:'payment_status',projectId});
  if(state.projectId!==projectId)throw new Error('Payment proof project mismatch');
  if(state.verified===true||state.paid===true){
   if(state.downloadUnlocked===true){
    if(window._axPayStartedInChat===projectId && typeof axCheckVerifiedChatPayment==='function')
      await axCheckVerifiedChatPayment(projectId);
    showToast('Payment already verified. Original download is available.','ok','');
   }else showToast('Existing payment is awaiting verification. Do not pay again.','info','');
   reset();return;
  }
  // First check an existing checkout without creating/capturing another payment.
  const recovery=await call('project-recover-v2',{projectId});
  if(!owns()){reset();return;}
  if(recovery.project_id!==projectId)throw new Error('Recovery project mismatch');
  if(recovery.status==='verified'){
   await syncFromSupabase(CU);if(!owns()){reset();return;}
   if(window._axPayStartedInChat===projectId){
     window._axPayStartedInChat=null;
     if(typeof axCheckVerifiedChatPayment==='function') await axCheckVerifiedChatPayment(projectId);
   } else {activeManageProjectId=projectId;wfStep=7;renderC('new');}
   showToast('Existing payment verified. No new charge created.','ok','');reset();return;
  }
  if(!['no_managed_checkout','unpaid'].includes(recovery.status))throw new Error('Existing checkout needs review. Do not pay again.');
  // The production Edge Function is authoritative for project eligibility,
  // provider mode, existing payment, and operator approval. Never bypass it.
  const order=await call('project-order-v2',{projectId});
  if(!owns()){reset();return;}
  if(order.project_id!==projectId||!/^order_[A-Za-z0-9]+$/.test(order.id||'')||!/^rzp_live_/.test(order.key_id||'')||!Number.isSafeInteger(order.amount)||order.amount<=0||order.currency!=='INR') throw new Error('Invalid server checkout response');
  if(typeof window.Razorpay!=='function')throw new Error('Razorpay Checkout failed to load. Reload the secure site before trying again.');
  const rzp=new window.Razorpay({
   key:order.key_id, amount:order.amount, currency:order.currency, order_id:order.id,
   name:'Aalynex',description:`Payment for: ${p.title}`,image:'aalynex-logo.png',
   prefill:{name:CU.name,email:CU.email,contact:CU.phone||''},theme:{color:'#E05C2A'},
   handler:async(response)=>{
    try {
     if(response.razorpay_order_id!==order.id) throw new Error('Checkout order mismatch');
     const result=await call('project-verify-v2',{projectId,razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature});
     if(!result.ok||result.project_id!==projectId) throw new Error('Payment requires reconciliation');
     if(!owns()) return;
     // Never trust the browser callback alone: check server-verified payment evidence.
     const entitlement=await call('project-media-v2',{action:'payment_status',projectId});
     if(entitlement.projectId!==projectId || entitlement.verified!==true || entitlement.downloadUnlocked!==true)
       throw new Error('Payment accepted but final unlock still needs server reconciliation. Do not pay again.');
     await syncFromSupabase(CU);
     if(!owns()) return;
     if(window._axPayStartedInChat===projectId){
     window._axPayStartedInChat=null;
     if(typeof axCheckVerifiedChatPayment==='function') await axCheckVerifiedChatPayment(projectId);
   } else {activeManageProjectId=projectId;wfStep=7;renderC('new');}
     showToast('Payment verified. Your original video can now be downloaded.','ok','');
    }catch(e){if(owns()) showToast('Payment verify nahi hua: '+e.message+' Paisa cut gaya ho to dobara pay mat karo; support se contact karo.','err','');}
    finally{reset();}
   },
   modal:{ondismiss:()=>{if(owns())showToast('Checkout closed. If charged, wait for verification; do not pay again.','info','');reset();}}
  });
  rzp.on('payment.failed',()=>{if(owns())showToast('Payment attempt failed. If debited, contact support before retrying.','err','');reset();});
  rzp.open();
 }catch(e){if(owns())showToast(e.message,'err','');reset();}
}
