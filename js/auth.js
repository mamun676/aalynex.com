// ═══════════════════════════════════════════════
//  AUTH — login / signup / OTP, loginSuccess (+ realtime), logout
// ═══════════════════════════════════════════════

let loginRole = 'creator', signupRole = 'creator';

function switchTab(t) {
  document.getElementById('form-login').style.display  = t === 'login'  ? '' : 'none';
  document.getElementById('form-signup').style.display = t === 'signup' ? '' : 'none';
  document.getElementById('tab-login').className  = 'auth-tab' + (t === 'login'  ? ' active' : '');
  document.getElementById('tab-signup').className = 'auth-tab' + (t === 'signup' ? ' active' : '');
  document.getElementById('login-err').style.display  = 'none';
  document.getElementById('signup-err').style.display = 'none';
}
function setLRole(r) {
  loginRole = r;
  document.getElementById('lr-c').className = 'role-btn' + (r === 'creator'    ? ' ac' : '');
  document.getElementById('lr-f').className = 'role-btn' + (r === 'freelancer' ? ' af' : '');
}
function setSRole(r) {
  signupRole = r;
  document.getElementById('sr-c').className = 'role-btn' + (r === 'creator'    ? ' ac' : '');
  document.getElementById('sr-f').className = 'role-btn' + (r === 'freelancer' ? ' af' : '');
  document.getElementById('su-creator-extra').style.display = r === 'creator' ? '' : 'none';
}
function setBtn(id, loading, text) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (loading) { btn.classList.add('btn-loading'); btn.disabled = true; btn.textContent = text || '...'; }
  else         { btn.classList.remove('btn-loading'); btn.disabled = false; }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';

  if (!email || !pw) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.style.display = 'flex'; return;
  }
  if (!validateEmailFmt(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'flex'; return;
  }

  setBtn('login-btn', true, 'Logging in...');

  function loginFail(msg) {
    setBtn('login-btn', false);
    errEl.textContent = msg || 'Invalid credentials.';
    errEl.style.display = 'flex';
    document.getElementById('login-email').value = '';
    document.getElementById('login-pw').value = '';
  }

  if (!supaClient) {
    loginFail('Login requires a connection. Please try again.');
    return;
  }

  try {
    const { data, error } = await supaClient.auth.signInWithPassword({ email, password: pw });

    if (error || !data.user) {
      loginFail('Invalid email or password.');
      return;
    }

    if (!data.user.email_confirmed_at) {
      await supaClient.auth.signOut();
      loginFail('Please verify your email before logging in.');
      return;
    }

    const { data: profile, error: pErr } = await supaClient
      .from('profiles').select().eq('id', data.user.id).single();

    if (pErr || !profile) {
      await supaClient.auth.signOut();
      loginFail('Invalid credentials.');
      return;
    }

    if (profile.role !== loginRole) {
      await supaClient.auth.signOut();
      loginFail('Invalid credentials.');
      return;
    }

    const u = {
      id: profile.id,
      name: profile.name || email.split('@')[0],
      email: data.user.email,
      phone: profile.phone || '',
      role: profile.role,
      profession: profile.profession || '',
      platform: profile.platform || '',
      avatar: profile.name || email.charAt(0).toUpperCase(),
      createdAt: new Date(profile.created_at).getTime(),
      skills: profile.skills || [],
      portfolio_links: profile.portfolio_links || {},
      resume_url: profile.resume_url || '',
      photo_url: profile.photo_url || '',
      experience: profile.experience || [],
      upiId: profile.upi_id || '',
      bankAccountName: profile.bank_account_name || '',
      bankAccountNumber: profile.bank_account_number || '',
      ifscCode: profile.ifsc_code || ''
    };

    setBtn('login-btn', false);
    loginSuccess(u);
    showToast(`Welcome back, ${u.name.split(' ')[0]}!`, 'ok', '👋');
  } catch (e) {
    console.warn('Login error', e);
    loginFail('Login failed. Please check your connection and try again.');
  }
}

async function doSignup() {
  const name = document.getElementById('su-name').value.trim();
  const phoneRaw = document.getElementById('su-phone').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pw = document.getElementById('su-pw').value;
  const profession = document.getElementById('su-profession').value;
  const platform = document.getElementById('su-platform')?.value || '';
  const errEl = document.getElementById('signup-err');
  errEl.style.display = 'none';

  if (!name || !email || !pw) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'flex'; return;
  }
  if (!validateEmailFmt(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'flex'; return;
  }
  if (pw.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.style.display = 'flex'; return;
  }

  let cleanPhone = '';
  if (phoneRaw) {
    const phoneResult = validatePhone(phoneRaw);
    if (!phoneResult.ok) {
      errEl.textContent = phoneResult.msg;
      errEl.style.display = 'flex'; return;
    }
    cleanPhone = phoneResult.phone;
  }

  if (!supaClient) {
    errEl.textContent = 'Signup requires a connection. Please try again.';
    errEl.style.display = 'flex'; return;
  }

  _signupOtpData = { name, phone: cleanPhone, email, pw, profession, platform, role: signupRole };

  setBtn('signup-btn', true, 'Sending OTP...');

  try {
    const { error } = await supaClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });

    if (error) {
      setBtn('signup-btn', false);
      if (error.message?.toLowerCase().includes('already registered')) {
        errEl.textContent = 'This email is already registered. Please login instead.';
      } else {
        errEl.textContent = error.message || 'Failed to send OTP. Please try again.';
      }
      errEl.style.display = 'flex'; return;
    }

    if (!document.getElementById('signup-otp-fg')) {
      const otpFg = document.createElement('div');
      otpFg.className = 'fg';
      otpFg.id = 'signup-otp-fg';
      otpFg.innerHTML = `
        <label>Verification code sent to ${email}</label>
        <input id="signup-otp" type="text" inputmode="numeric"
          maxlength="6" placeholder="Enter 6-digit code"
          autocomplete="one-time-code"/>
        <div class="otp-note">✓ Check your inbox (and spam folder)</div>`;
      const btn = document.getElementById('signup-btn');
      btn.parentElement.insertBefore(otpFg, btn);
    }

    const btn = document.getElementById('signup-btn');
    btn.textContent = 'Verify & Create Account';
    btn.onclick = doSignupVerifyOTP;
    setBtn('signup-btn', false);

  } catch (e) {
    console.warn('Signup error', e);
    setBtn('signup-btn', false);
    errEl.textContent = 'Something went wrong. Please try again.';
    errEl.style.display = 'flex';
  }
}

async function doSignupVerifyOTP() {
  const otp = (document.getElementById('signup-otp')?.value || '').trim();
  const errEl = document.getElementById('signup-err');
  errEl.style.display = 'none';

  if (!otp || otp.length < 6) {
    errEl.textContent = 'Please enter the 6-digit verification code.';
    errEl.style.display = 'flex'; return;
  }

  setBtn('signup-btn', true, 'Verifying...');

  try {
    const { data, error } = await supaClient.auth.verifyOtp({
      email: _signupOtpData.email,
      token: otp,
      type: 'email'
    });

    if (error || !data.user) {
      setBtn('signup-btn', false);
      errEl.textContent = 'Invalid or expired code. Please try again.';
      errEl.style.display = 'flex';
      document.getElementById('signup-otp').value = '';
      return;
    }

    const { error: pwError } = await supaClient.auth.updateUser({
      password: _signupOtpData.pw,
      data: {
        name: _signupOtpData.name,
        phone: _signupOtpData.phone,
        role: _signupOtpData.role,
        profession: _signupOtpData.profession,
        platform: _signupOtpData.platform
      }
    });
    if (pwError) console.warn('Password set error', pwError);

    const { name, phone, email, profession, platform, role } = _signupOtpData;

    await supaClient.from('profiles').upsert({
      id: data.user.id,
      name, phone, role, profession, platform,
      avatar: name.charAt(0).toUpperCase()
    }, { onConflict: 'id' });

    const u = {
      id: data.user.id,
      name, email, phone, role, profession, platform,
      avatar: name.charAt(0).toUpperCase(),
      createdAt: Date.now(),
      skills: [], portfolio_links: {},
      resume_url: '', photo_url: '', experience: []
    };

    const users = DB.users();
    if (!users.find(x => x.id === u.id)) users.push({ ...u });
    DB.saveUsers(users);

    setBtn('signup-btn', false);
    _resetSignupForm();
    loginSuccess(u);
    showToast(`Welcome, ${name.split(' ')[0]}!`, 'ok', '🎉');
  } catch (e) {
    console.warn('OTP verify error', e);
    setBtn('signup-btn', false);
    errEl.textContent = 'Verification failed. Please try again.';
    errEl.style.display = 'flex';
  }
}

function _resetSignupForm() {
  _signupOtpData = {};
  const otpFg = document.getElementById('signup-otp-fg');
  if (otpFg) otpFg.remove();
  const btn = document.getElementById('signup-btn');
  if (btn) { btn.textContent = 'Create Account'; btn.onclick = doSignup; }
}

async function loginSuccess(u) {
  CU = u;
  DB.setCurrentUser(u);

  if (u.role === 'creator') {
    document.getElementById('c-nav-name').textContent  = u.name.split(' ')[0];
    document.getElementById('c-sb-name').textContent   = u.name;
    document.getElementById('c-sb-avatar').textContent = u.avatar || u.name.charAt(0).toUpperCase();
    document.getElementById('c-sb-role').textContent   = 'Creator · ' + (u.platform || '');
    showScreen('screen-creator');
    document.getElementById('c-main').innerHTML = `
      <div style="padding:32px 0;">
        <div style="height:28px;width:200px;background:var(--bg2);border-radius:8px;margin-bottom:24px;animation:pulse 1.5s infinite;"></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
        </div>
        <div style="height:18px;width:140px;background:var(--bg2);border-radius:6px;margin-bottom:12px;animation:pulse 1.5s infinite;"></div>
        <div style="height:64px;background:var(--bg2);border-radius:14px;margin-bottom:8px;animation:pulse 1.5s infinite;"></div>
        <div style="height:64px;background:var(--bg2);border-radius:14px;margin-bottom:8px;animation:pulse 1.5s infinite;"></div>
      </div>`;
  } else {
    document.getElementById('f-nav-name').textContent  = u.name.split(' ')[0];
    document.getElementById('f-sb-name').textContent   = u.name;
    document.getElementById('f-sb-avatar').textContent = u.avatar || u.name.charAt(0).toUpperCase();
    document.getElementById('f-sb-role').textContent   = 'Freelancer · ' + (u.profession || '');
    showScreen('screen-freelancer');
    document.getElementById('f-main').innerHTML = `
      <div style="padding:32px 0;">
        <div style="height:28px;width:200px;background:var(--bg2);border-radius:8px;margin-bottom:24px;animation:pulse 1.5s infinite;"></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
          <div style="height:90px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
        </div>
        <div style="height:64px;background:var(--bg2);border-radius:14px;margin-bottom:8px;animation:pulse 1.5s infinite;"></div>
        <div style="height:64px;background:var(--bg2);border-radius:14px;animation:pulse 1.5s infinite;"></div>
      </div>`;
    if (u.photo_url) { updateAvatarsEverywhere(); }
  }

  // ⚡ FAST DASHBOARD: pehle sirf core data (profiles + projects + attachments)
  // load karo taaki dashboard TURANT dikhe. Messages + S3 signing (heavy) background me.
  await syncFromSupabase(u, { coreOnly: true });

  if (u.role === 'freelancer') {
    await loadFreelancerProfile();
    renderF('home');
    checkFProfileCompletion();
  } else {
    await loadFreelancerProfile();
    updateAvatarsEverywhere();
    renderC('home');
  }

  // Background: full sync (messages / chat previews) — dashboard ko block nahi karta.
  syncFromSupabase(u).then(() => {
    if (typeof updateChatSidebarPreviews === 'function') updateChatSidebarPreviews();
  }).catch(() => {});

  // 🟢 MASTER REAL-TIME SYSTEM (single channel, no duplicate connections)
  if (supaClient && !window.realtimeInitialized) {
    window.realtimeInitialized = true;
    const masterChannel = supaClient.channel('aalynex_master');

    masterChannel
      // 1. Projects
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
        // Debounce bursts + re-render the ACTUAL current page (globally tracked),
        // taaki Profile/Earnings dekhte waqt dashboard flash na ho.
        clearTimeout(window._rtProjTimer);
        window._rtProjTimer = setTimeout(() => {
          syncFromSupabase(CU).then(() => {
            if (CU.role === 'creator' && currentCreatorPage !== 'chat') renderC(currentCreatorPage || 'home');
            else if (CU.role === 'freelancer' && currentFreelancerPage !== 'chat') renderF(currentFreelancerPage || 'home');
          });
        }, 400);
      })
      // 2. Presence (online/offline)
      .on('presence', { event: 'sync' }, () => {
        const state = masterChannel.presenceState();
        onlineUsers.clear();
        for (const id in state) {
          if (state[id][0]?.user_id) onlineUsers.add(state[id][0].user_id);
        }
        updateChatHeaderPresence();
      })
      // 3. Subscribe + track self
      .subscribe(async (status) => {
        const statusText = document.getElementById('chat-status-text');
        const dot = document.getElementById('chat-online-dot');
        if (status === 'SUBSCRIBED') {
          if (statusText) { statusText.textContent = 'Online'; statusText.style.color = 'var(--green)'; }
          if (dot) dot.style.background = 'var(--green)';
          await masterChannel.track({ user_id: CU.id });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (statusText) { statusText.textContent = 'Connecting...'; statusText.style.color = 'var(--yellow)'; }
          if (dot) dot.style.background = 'var(--yellow)';
        }
      });
  }
}

function logout() {
  showModal('Log Out', 'Are you sure you want to log out?', async () => {
    if (supaClient) {
      try { await supaClient.auth.signOut(); } catch (e) {}
    }
    renderedMessageIds.clear();
    window.realtimeInitialized = false;
    if (currentChatChannel) {
      try { supaClient.removeChannel(currentChatChannel); } catch (e) {}
      currentChatChannel = null;
    }
    currentConversationId = null;
    isSubscribing = false;
    CU = null; activeManageProjectId = null; currentChatUserId = null;
    DB.logout();
    showScreen('screen-landing');
    showToast('Logged out successfully', 'info', '');
  });
}
/* ---- FORGOT PASSWORD (OTP based) ---- */
let _resetEmail = '';

async function doForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  if (!email || !validateEmailFmt(email)) {
    errEl.textContent = 'Enter your email above first, then click Forgot password.';
    errEl.style.display = 'flex';
    return;
  }
  if (!supaClient) {
    errEl.textContent = 'Reset requires a connection. Please try again.';
    errEl.style.display = 'flex';
    return;
  }
  setBtn('login-btn', true, 'Sending OTP...');
  try {
    const { error } = await supaClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    setBtn('login-btn', false);
    if (error) {
      errEl.textContent = error.message || 'Could not send OTP. Check the email address.';
      errEl.style.display = 'flex';
      return;
    }
    _resetEmail = email;
    showToast('OTP sent to your email!', 'ok', '');
    const body = `
      <p style="font-size:.85rem;color:var(--text-3);margin-bottom:12px;">Enter the OTP sent to <b>${email}</b> and set a new password.</p>
      <div class="fg"><label>OTP Code</label><input id="reset-otp" type="text" inputmode="numeric" placeholder="6-digit code"/></div>
      <div class="fg"><label>New Password</label><input type="password" id="reset-pw" placeholder="At least 6 characters"/></div>
      <div class="fg"><label>Confirm Password</label><input type="password" id="reset-pw2" placeholder="Re-enter new password"/></div>
      <div id="reset-err" class="alert alert-e" style="display:none;"></div>`;
    showModal('Reset Your Password', body, () => {});
    const btn = document.getElementById('modal-confirm');
    if (btn) { btn.textContent = 'Reset Password'; btn.onclick = doResetVerifyOTP; }
  } catch (e) {
    setBtn('login-btn', false);
    errEl.textContent = 'Could not send OTP. Please try again.';
    errEl.style.display = 'flex';
  }
}

async function doResetVerifyOTP() {
  const otp = (document.getElementById('reset-otp')?.value || '').trim();
  const pw  = document.getElementById('reset-pw')?.value || '';
  const pw2 = document.getElementById('reset-pw2')?.value || '';
  const errEl = document.getElementById('reset-err');
  const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'flex'; } };
  if (errEl) errEl.style.display = 'none';
  if (!otp)          { showErr('Please enter the OTP code.'); return; }
  if (pw.length < 6) { showErr('Password must be at least 6 characters.'); return; }
  if (pw !== pw2)    { showErr('Passwords do not match.'); return; }
  try {
    const { data, error } = await supaClient.auth.verifyOtp({
      email: _resetEmail,
      token: otp,
      type: 'email'
    });
    if (error || !data.user) { showErr('Invalid or expired OTP. Please try again.'); return; }
    const { error: pwErr } = await supaClient.auth.updateUser({ password: pw });
    if (pwErr) { showErr(pwErr.message || 'Could not update password.'); return; }
    closeModal();
    await supaClient.auth.signOut();
    showToast('Password updated! Please log in with your new password.', 'ok', '');
  } catch (e) {
    showErr('Something went wrong. Please try again.');
  }
}
