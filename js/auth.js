// Each login/logout invalidates callbacks and in-flight sync from the previous session.
window._accountSessionEpoch = window._accountSessionEpoch || 0;
function cleanupAccountRealtime() {
  if (window.axChatV2?.enabled) { try { window.axChatV2.cleanup(); } catch (_) {} }
  clearTimeout(window._rtProjTimer);
  window._rtProjTimer = null;
  if (typeof stopChatPolling === 'function') stopChatPolling();
  const channels = [window._accountMasterChannel,
    typeof currentChatChannel !== 'undefined' ? currentChatChannel : null];
  window._accountMasterChannel = null;
  window.realtimeInitialized = false;
  if (typeof currentChatChannel !== 'undefined') currentChatChannel = null;
  if (typeof currentConversationId !== 'undefined') currentConversationId = null;
  if (typeof currentChatUserId !== 'undefined') currentChatUserId = null;
  if (typeof isSubscribing !== 'undefined') isSubscribing = false;
  if (typeof onlineUsers !== 'undefined') onlineUsers.clear();
  if (typeof renderedMessageIds !== 'undefined') renderedMessageIds.clear();
  for (const channel of new Set(channels.filter(Boolean))) {
    try { Promise.resolve(supaClient.removeChannel(channel)).catch(() => {}); } catch (_) {}
  }
}

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
  if (loading) {
    if (!btn.dataset.origText) btn.dataset.origText = btn.innerHTML;
    btn.classList.add('btn-loading'); btn.disabled = true; btn.textContent = text || '...';
  } else {
    btn.classList.remove('btn-loading'); btn.disabled = false;
    if (btn.dataset.origText) { btn.innerHTML = btn.dataset.origText; delete btn.dataset.origText; }
  }
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
    // Preserve email; clear only the password, to avoid needless retyping.
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
      await supaClient.auth.signOut({ scope: 'local' });
      loginFail('Please verify your email before logging in.');
      return;
    }

    const { data: profile, error: pErr } = await supaClient
      .from('profiles').select(AX_PROFILE_PUBLIC_FIELDS).eq('id', data.user.id).single();

    if (pErr || !profile) {
      await supaClient.auth.signOut({ scope: 'local' });
      loginFail('Your account profile could not be loaded. Please contact support.');
      return;
    }

    if (profile.role !== loginRole) {
      await supaClient.auth.signOut({ scope: 'local' });
      loginFail('This account uses the ' + (profile.role === 'creator' ? 'Creator' : 'Freelancer') + ' role. Select the correct role to log in.');
      return;
    }

    let ownPhone = '';
    try { ownPhone = await axGetOwnPhone(); } catch (e) { console.warn('Own phone unavailable', e); }
    const u = {
      id: profile.id,
      name: profile.name || email.split('@')[0],
      email: data.user.email,
      phone: ownPhone,
      role: profile.role,
      profession: profile.profession || '',
      platform: profile.platform || '',
      avatar: (profile.name || email).charAt(0).toUpperCase(),
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

// Keep existing password logins backward-compatible; these checks apply to NEW passwords.
function axPasswordValidation(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Include at least one letter and one number.';
  }
  return '';
}
function updateSignupStrength() {
  const password = document.getElementById('su-pw')?.value || '';
  const el = document.getElementById('su-pw-strength');
  if (!el) return;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  el.textContent = !password ? 'Use 8+ characters with letters and numbers.' :
    score <= 2 ? 'Password strength: Weak' :
    score <= 3 ? 'Password strength: Fair' : 'Password strength: Strong';
  el.dataset.strength = !password ? '' : score <= 2 ? 'weak' : score <= 3 ? 'fair' : 'strong';
}
function toggleAuthPassword(id, button) {
  const input = document.getElementById(id);
  if (!input || !button) return;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.textContent = visible ? 'Hide' : 'Show';
  button.setAttribute('aria-pressed', String(visible));
  button.setAttribute('aria-label', (visible ? 'Hide' : 'Show') + ' password');
}
// Only short-lived OTP state; never store passwords/OTP in localStorage or logs.
let _signupVerifiedUserId = null;
let _signupLastOtpAt = 0;
const axSignupOtpCooldownMs = 60000;
function axSignupError(message) {
  const el = document.getElementById('signup-err');
  el.textContent = message;
  el.style.display = 'flex';
}
async function resendSignupOTP() {
  const addr = _signupOtpData?.email;
  if (!addr || !supaClient) return;
  if (_signupVerifiedUserId) { axSignupError('Email already verified. Finish creating your account.'); return; }
  const remaining = axSignupOtpCooldownMs - (Date.now() - _signupLastOtpAt);
  if (remaining > 0) {
    axSignupError('Please wait ' + Math.ceil(remaining / 1000) + ' seconds before requesting another code.');
    return;
  }
  const button = document.getElementById('signup-resend-btn');
  if (button) button.disabled = true;
  try {
    const { error } = await supaClient.auth.signInWithOtp({
      email: addr, options: { shouldCreateUser: true }
    });
    if (error) throw error;
    _signupLastOtpAt = Date.now();
    const input = document.getElementById('signup-otp');
    if (input) input.value = '';
    const e = document.getElementById('signup-err');
    if (e) e.style.display = 'none';
    showToast('A new verification code was requested. Check your email.', 'info', '');
  } catch (error) {
    axSignupError('Could not resend code. Please try again shortly.');
  } finally {
    if (button) button.disabled = false;
  }
}
async function doSignup() {
  const name = document.getElementById('su-name').value.trim();
  const phoneRaw = document.getElementById('su-phone').value.trim();
  const email = document.getElementById('su-email').value.trim().toLowerCase();
  const pw = document.getElementById('su-pw').value;
  const confirmPw = document.getElementById('su-pw2')?.value || '';
  const profession = document.getElementById('su-profession').value;
  const platform = document.getElementById('su-platform')?.value || '';
  const agreed = !!document.getElementById('su-terms')?.checked;
  const errEl = document.getElementById('signup-err');
  errEl.style.display = 'none';
  if (!name || !email || !pw) {
    axSignupError('Please fill in all required fields.'); return;
  }
  if (!validateEmailFmt(email)) {
    axSignupError('Please enter a valid email address.'); return;
  }
  const pwProblem = axPasswordValidation(pw);
  if (pwProblem) { axSignupError(pwProblem); return; }
  if (pw !== confirmPw) { axSignupError('Passwords do not match.'); return; }
  if (!agreed) { axSignupError('Please agree to the Terms and Privacy Policy.'); return; }
  let cleanPhone = '';
  if (phoneRaw) {
    const result = validatePhone(phoneRaw);
    if (!result.ok) { axSignupError(result.msg); return; }
    cleanPhone = result.phone;
  }
  if (!supaClient) { axSignupError('Signup requires a connection. Please try again.'); return; }

  _signupOtpData = { name, phone:cleanPhone, email, pw, profession, platform, role:signupRole };
  _signupVerifiedUserId = null;
  setBtn('signup-btn', true, 'Sending OTP...');
  try {
    const { error } = await supaClient.auth.signInWithOtp({
      email, options:{ shouldCreateUser:true }
    });
    if (error) throw error;
    _signupLastOtpAt = Date.now();
    if (!document.getElementById('signup-otp-fg')) {
      const fg = document.createElement('div');
      fg.className = 'fg';
      fg.id = 'signup-otp-fg';
      fg.innerHTML =
        '<label>Verification code sent to ' + escapeHtml(email) + '</label>' +
        '<input id="signup-otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="one-time-code" placeholder="Enter verification code"/>' +
        '<div class="otp-note">Check inbox and spam. Do not share this code.</div>' +
        '<button type="button" class="ax-auth-link-btn" id="signup-resend-btn" onclick="resendSignupOTP()">Resend code</button>';
      const btn = document.getElementById('signup-btn');
      btn.parentElement.insertBefore(fg, btn);
    }
    const btn = document.getElementById('signup-btn');
    btn.textContent = 'Verify & Create Account';
    btn.onclick = doSignupVerifyOTP;
  } catch (error) {
    axSignupError('Could not send verification code. Try again, or log in if you have an account.');
  } finally {
    setBtn('signup-btn', false);
    if (document.getElementById('signup-otp-fg')) {
      document.getElementById('signup-btn').textContent = 'Verify & Create Account';
    }
  }
}
async function doSignupVerifyOTP() {
  const otpInput = document.getElementById('signup-otp');
  const otp = otpInput?.value.trim() || '';
  document.getElementById('signup-err').style.display = 'none';
  if (!_signupOtpData?.email) { axSignupError('Restart signup and request a new code.'); return; }
  if (!_signupVerifiedUserId && !/^[0-9]{6,8}$/.test(otp)) {
    axSignupError('Enter the verification code from your email.'); return;
  }
  setBtn('signup-btn', true, _signupVerifiedUserId ? 'Finishing account...' : 'Verifying...');
  try {
    let verifiedId = _signupVerifiedUserId;
    let verifiedEmail = _signupOtpData.email;
    if (!verifiedId) {
      const { data, error } = await supaClient.auth.verifyOtp({
        email: verifiedEmail, token: otp, type: 'email'
      });
      if (error || !data?.user) {
        axSignupError('Invalid or expired code. Request a new code if needed.');
        if (otpInput) otpInput.value = '';
        return;
      }
      verifiedId = data.user.id;
      verifiedEmail = data.user.email || verifiedEmail;
      _signupVerifiedUserId = verifiedId;
    }
    // Never trust a cached session or OTP stored for a different account.
    const { data: who, error: whoError } = await supaClient.auth.getUser();
    if (whoError || who?.user?.id !== verifiedId ||
        who.user.email?.toLowerCase() !== verifiedEmail.toLowerCase()) {
      _signupVerifiedUserId = null;
      axSignupError('Session verification failed. Restart signup.');
      return;
    }
    // An existing account must use Login / Forgot password. OTP must not
    // overwrite its password, role, projects or profile.
    const { data: existing, error: lookupError } = await supaClient.from('profiles')
      .select('id').eq('id', verifiedId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      await supaClient.auth.signOut({ scope: 'local' });
      _resetSignupForm();
      axSignupError('This account already has a profile. Please log in or use Forgot password.');
      return;
    }
    const { error: passwordError } = await supaClient.auth.updateUser({
      password: _signupOtpData.pw,
      data: { name:_signupOtpData.name, phone:_signupOtpData.phone,
        role:_signupOtpData.role, profession:_signupOtpData.profession,
        platform:_signupOtpData.platform }
    });
    if (passwordError) throw passwordError;
    const { name, phone, email, profession, platform, role } = _signupOtpData;
    const { error: profileError } = await supaClient.from('profiles').insert({
      id: verifiedId, name, phone, role, profession, platform,
      avatar:name.charAt(0).toUpperCase()
    });
    if (profileError) throw profileError;

    const u = { id:verifiedId,name,email,phone,role,profession,platform,
      avatar:name.charAt(0).toUpperCase(),createdAt:Date.now(),
      skills:[],portfolio_links:{},resume_url:'',photo_url:'',experience:[] };
    const users = DB.users();
    if (!users.find(x => x.id === u.id)) users.push({...u});
    DB.saveUsers(users);
    _resetSignupForm();
    setBtn('signup-btn', false);
    loginSuccess(u);
    showToast('Welcome to Aalynex! Your account is ready.', 'ok', '');
  } catch (error) {
    // Leave the verified session available for a safe retry. No fake login.
    // Never log email, password or OTP.
    axSignupError('Could not finish creating your account. Please retry. If it continues, contact support.');
  } finally {
    setBtn('signup-btn', false);
    if (_signupOtpData?.email && document.getElementById('signup-otp-fg')) {
      document.getElementById('signup-btn').textContent =
        _signupVerifiedUserId ? 'Retry Account Setup' : 'Verify & Create Account';
    }
  }
}

function _resetSignupForm() {
  _signupOtpData = {};
  _signupVerifiedUserId = null;
  _signupLastOtpAt = 0;
  const otpFg = document.getElementById('signup-otp-fg');
  if (otpFg) otpFg.remove();
  const btn = document.getElementById('signup-btn');
  if (btn) { btn.textContent = 'Create Account'; btn.onclick = doSignup; }
  // Passwords must not remain in the form after successful account creation.
  for (const id of ['su-pw', 'su-pw2', 'signup-otp']) {
    const input = document.getElementById(id);
    if (input) input.value = '';
  }
  const consent = document.getElementById('su-terms');
  if (consent) consent.checked = false;
  updateSignupStrength();
}

async function loginSuccess(u) {
  const sessionEpoch = ++window._accountSessionEpoch;
  cleanupAccountRealtime();
  const ownsSession = () => window._accountSessionEpoch === sessionEpoch && CU && CU.id === u.id;
  resetPremiumSession();
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
  if (!ownsSession()) return;

  if (u.role === 'freelancer') {
    await loadFreelancerProfile();
    if (!ownsSession()) return;
    renderF('home');
    checkFProfileCompletion();
  } else {
    await loadFreelancerProfile();
    if (!ownsSession()) return;
    updateAvatarsEverywhere();
    renderC('home');
    // Mobile-to-web safe project deep link. NAVIGATION ONLY: never auto-start/charge checkout.
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('checkoutProject');
      if (id && /^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        const project = DB.projects().find(p => String(p.id)===id &&
          String(p.creatorId)===String(u.id) && !!p.freelancerId && p.status!=='open');
        if(project && ownsSession() && typeof switchChat==='function') {
          cPage('chat',document.querySelector('#screen-creator .nav-item[data-page="chat"]'));
          setTimeout(()=>{if(ownsSession()&&currentCreatorPage==='chat')void switchChat(u.id,project.freelancerId);},30);
        } else if (ownsSession()) showToast('Project checkout link needs project verification. Open My Projects.','info','');
      }
      if (id) window.history.replaceState(null,'',window.location.pathname+window.location.hash);
    } catch (_) { /* no automatic payment action */ }
  }

  // Background: full sync (messages / chat previews) — dashboard ko block nahi karta.
  syncFromSupabase(u).then(() => {
    if (ownsSession() && typeof updateChatSidebarPreviews === 'function') updateChatSidebarPreviews();
  }).catch(() => {});

  // 🟢 MASTER REAL-TIME SYSTEM (single channel, no duplicate connections)
  if (supaClient && !window.realtimeInitialized) {
    window.realtimeInitialized = true;
    const masterChannel = supaClient.channel('aalynex_master_' + sessionEpoch + '_' + u.id);
    window._accountMasterChannel = masterChannel;
    // Opt-in V2: account-wide incoming receipts. Existing messaging listeners stay intact.
    if (window.axChatV2?.enabled) {
      masterChannel.on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: 'receiver_id=eq.' + u.id
      }, payload => {
        if (ownsSession()) window.axChatV2.onIncoming(payload);
      });
    }

    masterChannel
      // 1. Projects
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
        if (!ownsSession()) return;
        // Debounce bursts + re-render the ACTUAL current page (globally tracked),
        // taaki Profile/Earnings dekhte waqt dashboard flash na ho.
        clearTimeout(window._rtProjTimer);
        window._rtProjTimer = setTimeout(() => {
          if (!ownsSession()) return;
          syncFromSupabase(u).then(() => {
            if (!ownsSession()) return;
            // quiet repaint: a realtime row change on ANY project fires this, so it
// must not flash the page when the visible data did not actually change
if (CU.role === 'creator' && currentCreatorPage !== 'chat') renderC(currentCreatorPage || 'home', true);
else if (CU.role === 'freelancer' && currentFreelancerPage !== 'chat') renderF(currentFreelancerPage || 'home', true);
          });
        }, 400);
      })
      // 2. Presence (online/offline)
      .on('presence', { event: 'sync' }, () => {
        if (!ownsSession()) return;
        const state = masterChannel.presenceState();
        onlineUsers.clear();
        for (const id in state) {
          if (state[id][0]?.user_id) onlineUsers.add(state[id][0].user_id);
        }
        updateChatHeaderPresence();
        if (window.axChatV2?.enabled) void window.axChatV2.refreshPresence();
      })
      // 3. Subscribe + track self
      .subscribe(async (status) => {
        if (!ownsSession()) return;
        const statusText = document.getElementById('chat-status-text');
        const dot = document.getElementById('chat-online-dot');
        if (status === 'SUBSCRIBED') {
          if (statusText) { statusText.textContent = 'Online'; statusText.style.color = 'var(--green)'; }
          if (dot) dot.style.background = 'var(--green)';
          try { await masterChannel.track({ user_id: u.id }); } catch (_) {}
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (statusText) { statusText.textContent = 'Connecting...'; statusText.style.color = 'var(--yellow)'; }
          if (dot) dot.style.background = 'var(--yellow)';
        }
      });
  }
  if (window.axChatV2?.enabled) {
    try { window.axChatV2.onLogin(u); } catch (_) { /* Legacy auth remains usable. */ }
  }
}

function logout() {
  showModal('Log Out', 'Are you sure you want to log out?', async () => {
    if (supaClient) {
      try {
        const { error } = await supaClient.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch (_) {
        showToast('Logout could not be completed. Please try again.', 'error', '');
        return;
      }
    }
    ++window._accountSessionEpoch;
    cleanupAccountRealtime();
    resetPremiumSession();
    CU = null; activeManageProjectId = null; currentChatUserId = null;
    DB.logout();
    showScreen('screen-landing');
    showToast('Logged out successfully', 'info', '');
  });
  document.getElementById('modal-confirm').textContent = 'Log Out';
}

/* ---- FORGOT PASSWORD (OTP based) ---- */
let _resetEmail = '';
let _resetLastOtpAt = 0;
async function resendResetOTP() {
  if (!_resetEmail || !supaClient) return;
  const left = axSignupOtpCooldownMs - (Date.now() - _resetLastOtpAt);
  const err = document.getElementById('reset-err');
  if (left > 0) {
    if (err) {
      err.textContent = 'Please wait ' + Math.ceil(left / 1000) + ' seconds before requesting another code.';
      err.style.display = 'flex';
    }
    return;
  }
  const btn = document.getElementById('reset-resend-btn');
  if (btn) btn.disabled = true;
  try {
    const { error } = await supaClient.auth.signInWithOtp({
      email: _resetEmail, options: { shouldCreateUser: false }
    });
    if (error) throw error;
    _resetLastOtpAt = Date.now();
    if (err) err.style.display = 'none';
    const field = document.getElementById('reset-otp');
    if (field) field.value = '';
    showToast('If your account exists, a new code was requested.', 'info', '');
  } catch (_) {
    if (err) {
      err.textContent = 'Could not request another code. Please try again shortly.';
      err.style.display = 'flex';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

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
      errEl.textContent = 'Could not request a code. Please try again shortly.';
      errEl.style.display = 'flex';
      return;
    }
    _resetEmail = email;
    _resetLastOtpAt = Date.now();
    showToast('If this account exists, a verification code was requested.', 'info', '');
    const body = `
      <p style="font-size:.85rem;color:var(--text-3);margin-bottom:12px;">Enter the OTP sent to <b>${escapeHtml(email)}</b> and set a new password.</p>
      <div class="fg"><label>OTP Code</label><input id="reset-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Verification code"/><button type="button" class="ax-auth-link-btn" id="reset-resend-btn" onclick="resendResetOTP()">Resend code</button></div>
      <div class="fg"><label>New Password</label><div class="ax-password-field"><input type="password" id="reset-pw" autocomplete="new-password" placeholder="8+ characters, letters and numbers"/><button type="button" onclick="toggleAuthPassword('reset-pw',this)" aria-pressed="false" aria-label="Show password">Show</button></div></div>
      <div class="fg"><label>Confirm Password</label><div class="ax-password-field"><input type="password" id="reset-pw2" autocomplete="new-password" placeholder="Re-enter new password"/><button type="button" onclick="toggleAuthPassword('reset-pw2',this)" aria-pressed="false" aria-label="Show password">Show</button></div></div>
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
  if (!/^[0-9]{6,8}$/.test(otp)) { showErr('Enter the verification code from your email.'); return; }
  const strengthProblem = axPasswordValidation(pw);
  if (strengthProblem) { showErr(strengthProblem); return; }
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
    await supaClient.auth.signOut({ scope: 'local' });
    showToast('Password updated! Please log in with your new password.', 'ok', '');
  } catch (e) {
    showErr('Something went wrong. Please try again.');
  }
}
