

/* ── ID + FORMATTERS ── */
function uid() { return 'u' + Date.now() + Math.random().toString(36).slice(2, 7); }
function pid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function fmt(n) { return new Intl.NumberFormat('en-IN').format(n); }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function fmtTime(t) { return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/* ── VALIDATION ── */
function validatePhone(raw) {
  const phone = (raw || '').replace(/\D/g, '');
  if (phone.length !== 10) return { ok: false, msg: 'Phone must be exactly 10 digits.' };
  if (!/^[6-9]/.test(phone)) return { ok: false, msg: 'Phone must start with 6, 7, 8, or 9.' };
  if (/^(\d)\1{9}$/.test(phone)) return { ok: false, msg: 'Invalid phone number.' };
  if (['1234567890', '9876543210', '0987654321'].includes(phone)) return { ok: false, msg: 'Invalid phone number.' };
  return { ok: true, phone };
}
function validateEmailFmt(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/* ── TOAST + MODAL ── */
function showToast(msg, type = 'ok', icon = '') {
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  const colors = { ok: 'var(--green)', err: 'var(--red)', info: 'var(--accent)', warn: 'var(--yellow)' };
  t.className = 'toast';
  t.innerHTML = `<span class="toast-icon" style="color:${colors[type] || colors.ok}">${icon}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, 3200);
}
function showModal(title, bodyHtml, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-bg').classList.add('show');
  const cb = document.getElementById('modal-confirm');
  cb.textContent = 'Confirm';
  cb.onclick = () => { closeModal(); onConfirm(); };
}
function closeModal() { document.getElementById('modal-bg').classList.remove('show'); }
/* ── ROUTER RACE GUARD ──
   Every nav click fires an async syncFromSupabase() whose .then() re-renders the
   page that was captured at click time. When you click fast, a slower earlier
   request can resolve AFTER a newer click and repaint the OLD page over the new
   one - which looked like the page flipping back and forth on its own.
   Each click now takes a ticket; a callback only repaints if its ticket is still
   the newest one. */
window._navSeq = 0;
/* ── PAINT SIGNATURE ──
   Remembers the markup string each page produced last time it was painted.
   Do NOT compare against element.innerHTML instead: the browser re-serializes
   the DOM (attribute quoting/order, entity encoding, self-closing tags), so
   reading it back never equals the string we generated, and a "has it changed?"
   check written that way always reports "changed" and repaints for nothing.
   Same generator + unchanged data = byte-identical string, so this compares. */
window._paintSig = {};
function _paintChanged(key, html) {
  if (window._paintSig[key] === html) return false;
  window._paintSig[key] = html;
  return true;
}
function _navTicket() { return ++window._navSeq; }
function _navStale(t) { return t !== window._navSeq; }
/* ── SCREEN + SIDEBAR ── */
/* history router helper — in-app nav state push karta hai (duplicate skip) */
function _pushNav(state) {
  if (window._navigatingBack) return;
  const cur = history.state;
  if (cur && cur.view === state.view && cur.page === state.page) return;
  try { history.pushState(state, ''); } catch (e) {}
}
/* ── BRAND SPLASH ──────────────────────────────────────────────────
   NOT shown when the site first opens. It only covers the two slow
   moments: (1) opening Login / Sign Up, (2) entering a dashboard after
   logging in, so the empty white dashboard is never visible.
   If the network never comes back, the curtain turns into a
   "No internet connection" card instead of hanging forever. */
var SPLASH_OFFLINE_MS = 7000;   // how long to wait before giving up
window._splashShownAt = 0;
window._splashTimer = null;
window._splashOffTimer = null;
function _splashEl() { return document.getElementById('app-splash'); }
function showSplash() {
  var el = _splashEl();
  if (!el) return;
  if (window._splashTimer) { clearTimeout(window._splashTimer); window._splashTimer = null; }
  if (window._splashOffTimer) clearTimeout(window._splashOffTimer);
  window._splashShownAt = Date.now();
  el.classList.remove('is-offline');
  el.classList.remove('splash-hide');
  // already offline? say so straight away, else wait and then give up
  if (navigator.onLine === false) { el.classList.add('is-offline'); }
  window._splashOffTimer = setTimeout(function () {
    var e = _splashEl();
    if (e && !e.classList.contains('splash-hide')) e.classList.add('is-offline');
  }, SPLASH_OFFLINE_MS);
}
/* minMs = keep the lockup on screen at least this long so it never flickers */
function hideSplash(minMs) {
  var el = _splashEl();
  if (!el) return;
  if (el.classList.contains('is-offline')) return;   // let the user read it / retry
  var min = (typeof minMs === 'number') ? minMs : 700;
  var left = Math.max(0, min - (Date.now() - (window._splashShownAt || 0)));
  if (window._splashTimer) clearTimeout(window._splashTimer);
  window._splashTimer = setTimeout(function () {
    if (window._splashOffTimer) { clearTimeout(window._splashOffTimer); window._splashOffTimer = null; }
    el.classList.add('splash-hide');
    el.classList.remove('is-offline');
  }, left);
}
function splashRetry() {
  if (navigator.onLine === false) { showToast('Still offline. Check your connection.', 'err', ''); return; }
  location.reload();
}
/* connection dropped mid-load -> switch to the offline card immediately */
window.addEventListener('offline', function () {
  var el = _splashEl();
  if (el && !el.classList.contains('splash-hide')) el.classList.add('is-offline');
});

function showScreen(id) {
  var prev = document.querySelector('.screen.active');
  var fromAuth = prev && prev.id === 'screen-auth';
  var toDash = (id === 'screen-creator' || id === 'screen-freelancer');
  // The curtain must go UP FIRST, before the new screen is revealed,
  // otherwise the login page paints for a moment and the logo arrives
  // late (looked like a glitch). Two slow moments: opening Login /
  // Sign Up, and landing on a dashboard after logging in.
  var curtain = (id === 'screen-auth' && !fromAuth) ? 700
               : (fromAuth && toDash) ? 1400 : 0;
  if (curtain) showSplash();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (curtain) hideSplash(curtain);
  if (id === 'screen-landing')          _pushNav({ view: 'landing' });
  else if (id === 'screen-auth')        _pushNav({ view: 'auth' });
  else if (id === 'screen-creator')     _pushNav({ view: 'creator',    page: (typeof currentCreatorPage   !== 'undefined' ? currentCreatorPage   : 'home') });
  else if (id === 'screen-freelancer')  _pushNav({ view: 'freelancer',  page: (typeof currentFreelancerPage !== 'undefined' ? currentFreelancerPage : 'home') });
}
/* Clicking the Aalynex logo or name anywhere on the site lands on the first
   (landing) page, scrolled to the top. Every close/reset step is wrapped in
   try/catch because this also fires from screens where those elements do not
   exist (for example the shared public-profile page). */
function goHome(e) {
  if (e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
  try { if (typeof closeTeamModal === 'function') closeTeamModal(); } catch (err) {}
  try { if (typeof closeModal === 'function') closeModal(); } catch (err) {}
  try { closeSidebar('creator'); } catch (err) {}
  try { closeSidebar('freelancer'); } catch (err) {}
  document.body.style.overflow = '';
  window.isPublicProfileView = false;
  // a shared link carries ?profile=<id>; drop it so a later refresh does not
  // bounce back to that profile instead of the landing page
  try {
    if (window.location.search) history.replaceState(null, '', window.location.pathname);
  } catch (err) {}
  showScreen('screen-landing');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return false;
}
// keyboard parity: the lockups are role="link" tabindex="0", so Enter/Space act like a click
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var el = document.activeElement;
  if (el && el.classList && el.classList.contains('logo-home')) goHome(e);
});
function goAuth(tab, role) {
  // raise the curtain on the click itself so the Aalynex lockup is the
  // FIRST thing seen, then build the login/signup screen behind it
  showSplash();
  showScreen('screen-auth');
  switchTab(tab);
  if (role) { tab === 'signup' ? setSRole(role) : setLRole(role); }
}
function toggleSidebar(role) {
  const p = role[0];
  const sb = document.getElementById(p + '-sidebar');
  const ov = document.getElementById(p + '-overlay');
  const hb = document.getElementById(p + '-hamburger');
  const open = sb.classList.contains('mobile-open');
  if (open) { sb.classList.remove('mobile-open'); ov.classList.remove('show'); hb.classList.remove('open'); }
  else { sb.classList.add('mobile-open'); ov.classList.add('show'); hb.classList.add('open'); }
}
function closeSidebar(role) {
  const p = role[0];
  document.getElementById(p + '-sidebar').classList.remove('mobile-open');
  document.getElementById(p + '-overlay').classList.remove('show');
  document.getElementById(p + '-hamburger').classList.remove('open');
}

/* ── HTML ESCAPE + RATING + ROW + STATUS ── */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// SECURITY: sirf safe http(s)/mailto links allow karo. javascript: jaise payloads block.
function safeUrl(url) {
  const s = String(url == null ? '' : url).trim();
  if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s)) return escapeHtml(s);
  return '#';
}

// SECURITY: HTML-attribute / inline-onclick ke andar daalne se pehle khatarnak chars hatao.
function attrSafe(s) {
  return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_\-:.,@ ]/g, '');
}
function rateStar(id, n) {
  document.querySelectorAll('#' + id + ' span').forEach((s, i) => s.className = i < n ? 'lit' : '');
}
function pRow(ic, t, m, sc, sl) {
  return `<div class="pc"><div class="pico">${ic}</div><div class="pinfo"><div class="ptitle">${t}</div><div class="pmeta">${m}</div></div><div class="pstatus ${sc}">${sl}</div></div>`;
}
function statusClass(s) { return { open: 's-pe', ongoing: 's-on', completed: 's-co', cancelled: 's-wa' }[s] || 's-pe'; }
function statusLabel(s) { return { open: 'Open', ongoing: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }[s] || s; }

/* ── CONTENT TYPE ICONS ── */
function contentIconSvg(t) {
  const icons = {
    /* real brand marks below - official single-path glyphs, filled, in brand colours */
'YouTube Long-form': `<svg class="pico-icon pico-brand pico-yt" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
'Instagram Reel':    `<svg class="pico-icon pico-brand pico-ig" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311C8.416 2.175 8.796 2.163 12 2.163zm0 1.802c-3.148 0-3.512.011-4.75.068-1.024.047-1.72.207-2.226.713-.506.506-.666 1.202-.713 2.226-.057 1.238-.068 1.602-.068 4.75s.011 3.512.068 4.75c.047 1.024.207 1.72.713 2.226.506.506 1.202.666 2.226.713 1.238.057 1.602.068 4.75.068s3.512-.011 4.75-.068c1.024-.047 1.72-.207 2.226-.713.506-.506.666-1.202.713-2.226.057-1.238.068-1.602.068-4.75s-.011-3.512-.068-4.75c-.047-1.024-.207-1.72-.713-2.226-.506-.506-1.202-.666-2.226-.713-1.238-.057-1.602-.068-4.75-.068zM12 6.865a5.135 5.135 0 1 0 0 10.27 5.135 5.135 0 0 0 0-10.27zm0 8.468a3.333 3.333 0 1 1 0-6.666 3.333 3.333 0 0 1 0 6.666zm6.538-8.671a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z"/></svg>`,
'YouTube Shorts':    `<svg class="pico-icon pico-brand pico-yt" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
'LinkedIn Video':    `<svg class="pico-icon pico-brand pico-li" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>`,
  };
  return icons[t] || `<svg class="pico-icon" viewBox="0 0 24 24"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>`;
}
function contentIcon(t) { return contentIconSvg(t); }

/* ── EMAIL NOTIFICATION HELPERS (Resend via Supabase Edge Function) ── */
const EMAIL_EDGE_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/send-email';

async function _sendAalynexEmail(toUserId, subject, html) {
  if (!supaClient || !toUserId) return;
  try {
    const { data: { session } } = await supaClient.auth.getSession();
    await fetch(EMAIL_EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || SUPABASE_KEY}`
      },
      body: JSON.stringify({ toUserId, subject, html })
    });
  } catch (e) { console.warn('Email send failed:', e); }
}

function sendProjectNotificationEmail(freelancerId, title, budget, deadline, contentType) {
  _sendAalynexEmail(freelancerId, `New project request: ${title}`,
    `<p>You have a new project request on Aalynex.</p><p><b>${title}</b><br>Budget: ₹${fmt(budget)}<br>Type: ${contentType}<br>Deadline: ${fmtDate(deadline)}</p>`);
}
function sendAcceptanceNotificationEmail(creatorId, title, budget, deadline, contentType) {
  _sendAalynexEmail(creatorId, `Your project was accepted: ${title}`,
    `<p>An editor accepted your project on Aalynex.</p><p><b>${title}</b><br>Budget: ₹${fmt(budget)}<br>Type: ${contentType}<br>Deadline: ${fmtDate(deadline)}</p>`);
}
function sendFinalUploadNotificationEmail(creatorId, title) {
  _sendAalynexEmail(creatorId, `Final video delivered: ${title}`,
    `<p>Your editor uploaded the final edited video for <b>${title}</b>. Log in to review, approve & pay.</p>`);
}
function sendPaymentDoneEmail(freelancerId, title, amount, rating) {
  _sendAalynexEmail(freelancerId, `Payment received: ${title}`,
    `<p>Payment of ₹${fmt(amount)} for <b>${title}</b> is complete.${rating ? ` Rating: ${rating}★` : ''}</p>`);
}
/* ---- THEME (dark / light) ---- */
/* The two icons live in the markup as <svg class="ic-moon"> and <svg class="ic-sun">
   and are swapped purely by CSS on [data-theme="dark"]. JS must NOT rewrite the
   button's innerHTML - that strips the classes and breaks the swap. */

function updateThemeLabel() {
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.title = label;
    btn.setAttribute('aria-label', label);
  });
}

/* kept as an alias so any older call site keeps working */
var updateThemeIcon = updateThemeLabel;

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.getAttribute('data-theme') === 'dark';
  if (dark) { root.removeAttribute('data-theme'); try { localStorage.setItem('aalynex-theme','light'); } catch(e){} }
  else { root.setAttribute('data-theme','dark'); try { localStorage.setItem('aalynex-theme','dark'); } catch(e){} }
  updateThemeLabel();
}

window.addEventListener('DOMContentLoaded', updateThemeLabel);
