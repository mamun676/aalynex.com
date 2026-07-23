// ═══════════════════════════════════════════════
//  UTILS — formatters, toasts, modals, screen, icons, email
// ═══════════════════════════════════════════════

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

/* ── SCREEN + SIDEBAR ── */
/* history router helper — in-app nav state push karta hai (duplicate skip) */
function _pushNav(state) {
  if (window._navigatingBack) return;
  const cur = history.state;
  if (cur && cur.view === state.view && cur.page === state.page) return;
  try { history.pushState(state, ''); } catch (e) {}
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'screen-landing')          _pushNav({ view: 'landing' });
  else if (id === 'screen-auth')        _pushNav({ view: 'auth' });
  else if (id === 'screen-creator')     _pushNav({ view: 'creator',    page: (typeof currentCreatorPage   !== 'undefined' ? currentCreatorPage   : 'home') });
  else if (id === 'screen-freelancer')  _pushNav({ view: 'freelancer',  page: (typeof currentFreelancerPage !== 'undefined' ? currentFreelancerPage : 'home') });
}
function goAuth(tab, role) {
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
    'YouTube Long-form': `<svg class="pico-icon" viewBox="0 0 24 24"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>`,
    'Instagram Reel':    `<svg class="pico-icon" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/></svg>`,
    'YouTube Shorts':    `<svg class="pico-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    'TikTok':            `<svg class="pico-icon" viewBox="0 0 24 24"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>`,
    'LinkedIn Video':    `<svg class="pico-icon" viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
    'Brand Video':       `<svg class="pico-icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    'Documentary':       `<svg class="pico-icon" viewBox="0 0 24 24"><rect x="2" y="3" width="15" height="13" rx="2"/><polygon points="22 7 17 10 22 13 22 7"/></svg>`,
    'Podcast Edit':      `<svg class="pico-icon" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
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
