// ════════════════════════════════════
//  PAYMENTS — Razorpay checkout + verify
//  Load AFTER razorpay checkout.js CDN.
// ════════════════════════════════════
async function completePayment() {
  const p = DB.projects().find(x => x.id === activeManageProjectId);
  if (!p) { showToast('Project not found', 'err', ''); return; }

  const budget = p.budget;
  const fee    = Math.round(budget * 0.03);
  const total  = budget + fee;

  const btn = document.querySelector('.btn-green-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  try {
    // Step 1: Supabase se Razorpay order banao
    const { data: { session } } = await supaClient.auth.getSession();
    const orderRes = await fetch(
      'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/razorpay-order',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ amount: total, currency: 'INR', projectId: p.id })
      }
    );

    if (!orderRes.ok) throw new Error('Order create failed');
    const order = await orderRes.json();
    if (!order.id) throw new Error(order.error?.description || 'Order ID missing');

    // Step 2: Razorpay Checkout kholo
    const options = {
      key:         'rzp_live_SitBK030b3i8Ol',
      amount:      total * 100,
      currency:    'INR',
      order_id:    order.id,
      name:        'Aalynex',
      description: `Payment for: ${p.title}`,
      image:       'aalynex-logo.png',
      prefill:     { name: CU.name, email: CU.email, contact: CU.phone || '' },
      theme:       { color: '#E05C2A' },

      handler: async function (response) {
  // Step 3: Payment success — SERVER pe verify karao (client DB update NAHI)
  try {
    const { data: { session } } = await supaClient.auth.getSession();
    const verifyRes = await fetch(
      'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/verify-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          razorpay_order_id:   response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature:  response.razorpay_signature,
          projectId:           p.id
        })
      }
    );
    const result = await verifyRes.json();
    if (!verifyRes.ok || !result.ok) {
      throw new Error(result.error || 'Verification failed');
    }

    // Server ne DB update kar diya — ab sirf local state refresh
    const projs = DB.projects(), proj = projs.find(x => x.id === p.id);
    if (proj) { proj.paid = true; proj.status = 'completed'; DB.saveProjects(projs); }

    await sendMsg(CU.id, p.freelancerId, null, null,
      `✅ Payment of ₹${fmt(total)} done! Project completed. Thanks for the great work!`);
    sendPaymentDoneEmail(p.freelancerId, p.title, total, p.rating || 0);
    showToast('✅ Payment Successful! Now rate your editor.', 'ok', '');
    activeManageProjectId = p.id;
    wfStep = 7;
    await syncFromSupabase(CU);
    renderC('new');

  } catch (e) {
    showToast('Payment verify nahi hua: ' + e.message + '. Paisa cut gaya to support se contact karo.', 'err', '');
    if (btn) { btn.disabled = false; btn.textContent = 'Pay Now →'; }
  }
},

      modal: {
        ondismiss: function () {
          showToast('Payment cancelled.', 'info', '');
          if (btn) { btn.disabled = false; btn.textContent = 'Pay Now →'; }
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.open();

  } catch (e) {
    showToast('Payment initiate nahi hua: ' + e.message, 'err', '');
    if (btn) { btn.disabled = false; btn.textContent = 'Pay Now →'; }
  }
}