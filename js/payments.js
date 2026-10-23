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
 const reset=()=>{_axProjectCheckoutBusy=false;if(owns()&&btn?.isConnected){btn.disabled=false;btn.textContent='Pay Now →';}};
 const base='https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/';
 async function call(name,body) {
  const {data:{session}}=await supaClient.auth.getSession();
  if(!owns()||!session||session.user.id!==userId) throw new Error('Account changed. Sign in with the paying account; do not pay again.');
  const res=await fetch(base+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
  const result=await res.json();
  if(!res.ok) throw new Error(typeof result.error==='string'?result.error:'Payment request failed');
  return result;
 }
 _axProjectCheckoutBusy=true;
 if(btn){btn.disabled=true;btn.textContent='Processing…';}
 try {
  // First check an existing checkout without creating/capturing another payment.
  const recovery=await call('project-recover-v2',{projectId});
  if(!owns()){reset();return;}
  if(recovery.project_id!==projectId)throw new Error('Recovery project mismatch');
  if(recovery.status==='verified'){
   await syncFromSupabase(CU);if(!owns()){reset();return;}
   activeManageProjectId=projectId;wfStep=7;renderC('new');
   showToast('Existing payment verified. No new charge created.','ok','');reset();return;
  }
  if(!['no_managed_checkout','unpaid'].includes(recovery.status))throw new Error('Existing checkout needs review. Do not pay again.');
  const order=await call('project-order-v2',{projectId});
  if(!owns()){reset();return;}
  if(order.project_id!==projectId||!/^order_[A-Za-z0-9]+$/.test(order.id||'')||!/^rzp_(test|live)_/.test(order.key_id||'')||!Number.isSafeInteger(order.amount)||order.amount<=0||order.currency!=='INR') throw new Error('Invalid server checkout response');
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
     // Never set paid locally or send a fake settlement message from the browser.
     await syncFromSupabase(CU);
     if(!owns()) return;
     activeManageProjectId=projectId;wfStep=7;renderC('new');
     showToast('Payment verified. You can now rate your editor.','ok','');
    }catch(e){if(owns()) showToast('Payment verify nahi hua: '+e.message+' Paisa cut gaya ho to dobara pay mat karo; support se contact karo.','err','');}
    finally{reset();}
   },
   modal:{ondismiss:()=>{if(owns())showToast('Checkout closed. If charged, wait for verification; do not pay again.','info','');reset();}}
  });
  rzp.on('payment.failed',()=>{if(owns())showToast('Payment attempt failed. If debited, contact support before retrying.','err','');reset();});
  rzp.open();
 }catch(e){if(owns())showToast(e.message,'err','');reset();}
}
