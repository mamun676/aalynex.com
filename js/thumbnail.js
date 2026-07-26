// ==============================================================================
//  AALYNEX - AI THUMBNAIL MAKER (Smart Studio v3) - creator side - PREMIUM
//  MrBeast-STYLE. v3 pro upgrades:
//   * Uploaded photo -> background auto-removed (edge flood-fill) + drawn as a
//     clean STICKER cut-out (white outline + soft shadow), NOT an ugly box.
//   * When a photo is used, the AI scene is generated WITHOUT people (no 2 faces).
//   * Cinematic grade (vignette + contrast), bigger bolder text, better layout.
//  Load AFTER creator.js and aiSuggest.js, BEFORE main.js in index.html.
//  Rs.99 Premium = 15 AI generations / month. Editing & re-download = FREE.
// ==============================================================================

const THUMB_SUGGEST_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/thumb-suggest';
const THUMB_W = 1280, THUMB_H = 720;
window._thumbQuota = null;
window._thumbLast  = null;
window._thumbPhoto = null;   // { dataUrl, img, cutout, isCut }

const THUMB_TEMPLATES = ['left-text', 'right-text', 'bottom-bar', 'center'];
const THUMB_PALETTES = [
  { name: 'Fire',   bg1: '#1A1207', bg2: '#B91C1C', text: '#FFFFFF', accent: '#FACC15' },
  { name: 'Ocean',  bg1: '#0B1120', bg2: '#1D4ED8', text: '#FFFFFF', accent: '#38BDF8' },
  { name: 'Purple', bg1: '#150B2E', bg2: '#7C3AED', text: '#FFFFFF', accent: '#F0ABFC' },
  { name: 'Money',  bg1: '#04140B', bg2: '#15803D', text: '#FFFFFF', accent: '#FDE047' },
  { name: 'Sunset', bg1: '#1A0A12', bg2: '#DB2777', text: '#FFFFFF', accent: '#FDBA74' },
  { name: 'Night',  bg1: '#0A0A0A', bg2: '#292524', text: '#FFFFFF', accent: '#F97316' },
];
const THUMB_VIBES = ['Bold / High Energy', 'Clean / Minimal', 'Luxury / Premium', 'Fun / Playful', 'Tech / Futuristic', 'Emotional / Story'];
const THUMB_LANGS = ['Hinglish', 'Hindi', 'English', 'Tamil', 'Telugu', 'Bengali', 'Marathi'];

(function () {
  const _orig = window.renderC;
  window.renderC = function (p) {
    if (p === 'thumbnail') {
      const m = document.getElementById('c-main');
      if (m) m.innerHTML = renderThumbMaker();
      _ensureFont().then(renderAllThumbCanvases);
      return;
    }
    return _orig.apply(this, arguments);
  };
})();

/* ---------- small utils ---------- */
function _thumbOpts(arr, sel) { return arr.map(function (o) { return '<option' + (o === sel ? ' selected' : '') + '>' + escapeHtml(o) + '</option>'; }).join(''); }
function _thumbQuotaInner() {
  if (window._thumbQuota) return '<b style="color:var(--accent);">' + window._thumbQuota.remaining + '</b> of ' + window._thumbQuota.limit + ' left this month';
  return '<b style="color:var(--accent);">15</b> AI thumbnails / month';
}
function _refreshThumbQuota() { const el = document.getElementById('thumb-quota'); if (el) el.innerHTML = _thumbQuotaInner(); }
function _hex(v, f) { return (typeof v === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(v.trim())) ? v.trim() : f; }
function _rgba(hex, a) { let h = _hex(hex, '#000000').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); const n = parseInt(h.slice(0, 6), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
async function _ensureFont() { try { if (document.fonts && document.fonts.load) { await document.fonts.load("800 80px 'Outfit'"); await document.fonts.load("600 40px 'Outfit'"); await document.fonts.ready; } } catch (e) {} }

function _san(d) {
  d = d || {};
  const palOk = d.palette && /^#/.test(d.palette.bg1 || '');
  const pal = palOk ? d.palette : THUMB_PALETTES[0];
  return {
    style: String(d.style || 'Design').slice(0, 28),
    template: THUMB_TEMPLATES.indexOf(d.template) >= 0 ? d.template : 'left-text',
    headline: String(d.headline || 'YOUR TITLE HERE').toUpperCase().slice(0, 42),
    subText: String(d.subText || '').slice(0, 48),
    badge: String(d.badge || '').toUpperCase().slice(0, 10),
    emoji: String(d.emoji || '').slice(0, 4),
    imageDataUrl: (typeof d.imageDataUrl === 'string') ? d.imageDataUrl : '',
    palette: {
      bg1: _hex(pal.bg1, '#111827'), bg2: _hex(pal.bg2, '#B91C1C'),
      text: _hex(pal.text, '#FFFFFF'), accent: _hex(pal.accent, '#FACC15'),
    },
  };
}

function _prepThumbImages(designs) {
  designs.forEach(function (d, i) {
    if (!d.imageDataUrl) return;
    const im = new Image();
    im.onload = function () { renderThumbCanvas(i); };
    im.onerror = function () {};
    im.src = d.imageDataUrl;
    d._img = im;
  });
}

/* ---------- PHOTO: background removal + cut-out ---------- */
function _cutoutPhoto(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  const maxDim = 800; let w = iw, h = ih;
  if (Math.max(iw, ih) > maxDim) { const s = maxDim / Math.max(iw, ih); w = Math.round(iw * s); h = Math.round(ih * s); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
  let id; try { id = cx.getImageData(0, 0, w, h); } catch (e) { return null; }
  const p = id.data;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [(w >> 1), 0], [(w >> 1), h - 1]];
  let br = 0, bg = 0, bb = 0;
  corners.forEach(function (c) { const i = (c[1] * w + c[0]) * 4; br += p[i]; bg += p[i + 1]; bb += p[i + 2]; });
  br /= corners.length; bg /= corners.length; bb /= corners.length;
  let vari = 0;
  corners.forEach(function (c) { const i = (c[1] * w + c[0]) * 4; vari += Math.abs(p[i] - br) + Math.abs(p[i + 1] - bg) + Math.abs(p[i + 2] - bb); });
  vari /= corners.length;
  if (vari > 70) return null; // background not uniform -> skip cutout
  const tol = 50, soft = 30;
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
  function dist(i) { return Math.abs(p[i] - br) + Math.abs(p[i + 1] - bg) + Math.abs(p[i + 2] - bb); }
  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx]) continue; visited[idx] = 1;
    const i = idx * 4; const dd = dist(i);
    if (dd > tol + soft) continue;
    if (dd <= tol) p[i + 3] = 0; else p[i + 3] = Math.round(255 * (dd - tol) / soft);
    const x = idx % w, y = (idx - x) / w;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  let removed = 0; for (let k = 0; k < w * h; k++) { if (p[k * 4 + 3] === 0) removed++; }
  if (removed < w * h * 0.05) return null;
  cx.putImageData(id, 0, 0);
  return cv;
}

function _silhouette(src, color) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ---------- PAGE ---------- */
function renderThumbMaker() {
  const premium = (typeof isPremiumCreator === 'function') ? isPremiumCreator() : !!window._premiumActive;
  const price = (typeof premiumPrice === 'function') ? premiumPrice() : 99;

  const head = ''
    + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;">'
    +   '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 14px rgba(224,92,42,.25);">'
    +     '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3 17l5-4 4 3 3.5-3 5.5 5"/></svg>'
    +   '</div>'
    +   '<div style="flex:1;min-width:0;">'
    +     '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">'
    +       '<h2 style="margin:0;font-family:\'Outfit\',sans-serif;font-weight:700;font-size:1.35rem;letter-spacing:-.4px;color:var(--text);">AI Thumbnail Maker</h2>'
    +       '<span style="font-size:.58rem;font-weight:700;letter-spacing:.5px;color:var(--accent);background:var(--accent-soft);border:1px solid rgba(224,92,42,.22);padding:2px 8px;border-radius:999px;">PREMIUM</span>'
    +     '</div>'
    +     '<p style="margin:3px 0 0;font-size:.83rem;color:var(--text-2);">MrBeast-style AI backgrounds + auto photo cut-out + bold text. 1280x720.</p>'
    +   '</div>'
    + '</div>';

  if (!premium) {
    return head
      + '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:28px;max-width:520px;box-shadow:var(--shadow-sm);margin-top:14px;">'
      +   '<div style="font-weight:700;font-size:1.05rem;color:var(--text);margin-bottom:8px;">This is a Premium feature</div>'
      +   '<p style="font-size:.86rem;color:var(--text-2);line-height:1.6;margin:0 0 6px;">The AI Thumbnail Maker comes with <b>Aalynex Premium (Rs.' + price + '/month)</b>.</p>'
      +   '<p style="font-size:.82rem;color:var(--text-3);margin:0 0 18px;">Premium members can generate <b>15 AI thumbnail sets</b> every month (editing &amp; downloading are unlimited).</p>'
      +   '<button class="btn btn-primary" onclick="openPremiumModal()">Unlock Premium</button>'
      + '</div>';
  }

  const inputStyle = 'style="padding:10px 12px;border:1px solid var(--glass-border);border-radius:10px;background:var(--surface2);color:var(--text);font-size:.85rem;font-family:inherit;outline:none;width:100%;box-sizing:border-box;"';
  const field = function (label, html) { return '<div style="display:flex;flex-direction:column;gap:6px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-2);">' + label + '</label>' + html + '</div>'; };
  const resultsInner = window._thumbLast ? renderThumbCards(window._thumbLast) : '';

  return head
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:16px 0 12px;flex-wrap:wrap;">'
    +   '<div style="font-size:.92rem;font-weight:600;color:var(--text);">Create thumbnails</div>'
    +   '<span id="thumb-quota" style="font-size:.74rem;color:var(--text-3);background:var(--surface);border:1px solid var(--glass-border);padding:5px 12px;border-radius:999px;box-shadow:var(--shadow-xs);">' + _thumbQuotaInner() + '</span>'
    + '</div>'
    + '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:22px;max-width:880px;box-shadow:var(--shadow-sm);">'
    +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">'
    +     field('Video topic / title *', '<input id="thumb-topic" ' + inputStyle + ' placeholder="e.g. maine 24 ghante paani me rehkar dikhaya">')
    +     field('Vibe', '<select id="thumb-vibe" ' + inputStyle + '>' + _thumbOpts(THUMB_VIBES, 'Bold / High Energy') + '</select>')
    +     field('Text language', '<select id="thumb-lang" ' + inputStyle + '>' + _thumbOpts(THUMB_LANGS, 'Hinglish') + '</select>')
    +     field('Force main text (optional)', '<input id="thumb-force" ' + inputStyle + ' placeholder="Leave empty - let AI write it">')
    +   '</div>'
    +   '<div style="margin-top:15px;">'
    +     '<label style="font-size:.72rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px;">Your photo / face (optional - auto background-removed &amp; placed on the thumbnail)</label>'
    +     '<div id="thumb-photo-ui">' + _thumbPhotoUI() + '</div>'
    +   '</div>'
    +   '<button id="thumb-gen-btn" class="btn btn-primary" style="margin-top:20px;" onclick="generateThumbnails()">Generate AI thumbnails</button>'
    +   '<div style="font-size:.72rem;color:var(--text-3);margin-top:9px;">Tip: front-facing photo with a plain background works best. Each Generate uses 1 credit; editing &amp; downloading are free.</div>'
    + '</div>'
    + '<div id="thumb-results" style="margin-top:24px;">' + resultsInner + '</div>';
}

function _thumbPhotoUI() {
  if (window._thumbPhoto && window._thumbPhoto.dataUrl) {
    const tag = window._thumbPhoto.isCut
      ? '<span style="font-size:.68rem;color:var(--green);font-weight:600;">Background removed \u2713</span>'
      : '<span style="font-size:.68rem;color:var(--text-3);">Plain-bg photo do to background auto-hat jaayega</span>';
    return '<div style="display:flex;align-items:center;gap:12px;">'
      + '<img src="' + window._thumbPhoto.dataUrl + '" style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--glass-border);">'
      + '<div style="display:flex;flex-direction:column;gap:4px;">' + tag
      + '<button class="btn btn-ghost btn-sm" onclick="removeThumbPhoto()">Remove photo</button></div>'
      + '</div>';
  }
  return '<label class="btn btn-light btn-sm" style="cursor:pointer;display:inline-flex;">'
    + '<input type="file" accept="image/*" onchange="onThumbPhoto(this)" style="display:none;"> Upload photo'
    + '</label>';
}
function _updatePhotoUI() { const el = document.getElementById('thumb-photo-ui'); if (el) el.innerHTML = _thumbPhotoUI(); }

function onThumbPhoto(input) {
  const f = input.files && input.files[0]; if (!f) return;
  if (!/^image\//.test(f.type)) { showToast('Please select an image file', 'warn', ''); return; }
  if (f.size > 12 * 1024 * 1024) { showToast('Image too large (max 12MB)', 'warn', ''); return; }
  const rd = new FileReader();
  rd.onload = function () {
    const img = new Image();
    img.onload = function () {
      let cut = null; try { cut = _cutoutPhoto(img); } catch (e) { cut = null; }
      window._thumbPhoto = { dataUrl: rd.result, img: img, cutout: cut, isCut: !!cut };
      _updatePhotoUI(); _ensureFont().then(renderAllThumbCanvases);
    };
    img.onerror = function () { showToast('Could not read that image', 'err', ''); };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
}
function removeThumbPhoto() { window._thumbPhoto = null; _updatePhotoUI(); _ensureFont().then(renderAllThumbCanvases); }

/* ---------- RESULT CARDS ---------- */
function renderThumbCards(designs) {
  if (!designs || !designs.length) return '';
  const cards = designs.map(function (d, i) {
    const sw = THUMB_PALETTES.map(function (p, pi) {
      return '<button title="' + p.name + '" onclick="setThumbPalette(' + i + ',' + pi + ')" style="width:22px;height:22px;border-radius:6px;border:2px solid var(--glass-border);cursor:pointer;background:linear-gradient(135deg,' + p.bg1 + ',' + p.bg2 + ');"></button>';
    }).join('');
    const s = _san(d);
    return '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-sm);">'
      + '<canvas id="thumb-canvas-' + i + '" width="1280" height="720" style="width:100%;height:auto;display:block;background:#111;"></canvas>'
      + '<div style="padding:12px 13px 14px;">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;">'
      +     '<span style="font-size:.74rem;font-weight:700;color:var(--text-2);">' + escapeHtml(s.style) + '</span>'
      +     '<div style="display:flex;gap:6px;">'
      +       '<button class="btn btn-light btn-sm" onclick="openThumbInCanva(' + i + ')">Open in Canva</button>'
      +       '<button class="btn btn-primary btn-sm" onclick="downloadThumb(' + i + ')">Download</button>'
      +     '</div>'
      +   '</div>'
      +   '<input value="' + escapeHtml(s.headline) + '" oninput="editThumb(' + i + ',\'headline\',this.value)" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--glass-border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:.78rem;font-weight:700;margin-bottom:6px;" placeholder="Main text">'
      +   '<input value="' + escapeHtml(s.subText) + '" oninput="editThumb(' + i + ',\'subText\',this.value)" style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--glass-border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:.75rem;margin-bottom:8px;" placeholder="Sub text (optional)">'
      +   '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      +     sw
      +     '<button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="cycleThumbTemplate(' + i + ')">Layout &#8635;</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">' + cards + '</div>';
}

/* ---------- EDIT HANDLERS (free, no quota) ---------- */
function editThumb(i, key, val) { if (!window._thumbLast || !window._thumbLast[i]) return; window._thumbLast[i][key] = val; renderThumbCanvas(i); }
function setThumbPalette(i, pi) { if (!window._thumbLast || !window._thumbLast[i]) return; window._thumbLast[i].palette = Object.assign({}, THUMB_PALETTES[pi]); renderThumbCanvas(i); }
function cycleThumbTemplate(i) { if (!window._thumbLast || !window._thumbLast[i]) return; const cur = _san(window._thumbLast[i]).template; const next = THUMB_TEMPLATES[(THUMB_TEMPLATES.indexOf(cur) + 1) % THUMB_TEMPLATES.length]; window._thumbLast[i].template = next; renderThumbCanvas(i); }

function renderAllThumbCanvases() { if (!window._thumbLast) return; for (let i = 0; i < window._thumbLast.length; i++) renderThumbCanvas(i); }
function renderThumbCanvas(i) { const c = document.getElementById('thumb-canvas-' + i); if (c && window._thumbLast && window._thumbLast[i]) drawThumb(c, window._thumbLast[i]); }

/* ---------- DOWNLOAD + CANVA ---------- */
function downloadThumb(i) {
  const c = document.getElementById('thumb-canvas-' + i); if (!c) return;
  const finish = function (blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    const base = (_san(window._thumbLast[i]).headline || 'thumbnail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'thumbnail';
    a.href = url; a.download = 'aalynex-' + base + '.png'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    if (typeof showToast === 'function') showToast('Thumbnail downloaded', 'ok', '');
  };
  if (c.toBlob) c.toBlob(finish, 'image/png'); else { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'aalynex-thumbnail.png'; a.click(); }
}
function openThumbInCanva(i) {
  downloadThumb(i);
  try { window.open('https://www.canva.com/design?create&type=YouTube-Thumbnail', '_blank'); } catch (e) {}
  if (typeof showToast === 'function') showToast('PNG downloaded - ab Canva me "Upload" karke edit karo', 'ok', '');
}

/* ---------- CANVAS HELPERS ---------- */
function _wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur); return lines.length ? lines : [''];
}
function _fit(ctx, text, maxW, maxLines, maxPx, minPx, weight) {
  for (let px = maxPx; px >= minPx; px -= 2) { ctx.font = weight + ' ' + px + "px 'Outfit','Arial Black',Impact,sans-serif"; const lines = _wrap(ctx, text, maxW); if (lines.length <= maxLines) return { lines: lines, px: px }; }
  ctx.font = weight + ' ' + minPx + "px 'Outfit','Arial Black',Impact,sans-serif"; return { lines: _wrap(ctx, text, maxW).slice(0, maxLines), px: minPx };
}
function _roundRect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function _cover(ctx, img, x, y, w, h) { const ir = img.width / img.height, r = w / h; let sw, sh, sx, sy; if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; } else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2; } ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h); }

function _drawSubject(ctx, ph, region, accent) {
  const sub = ph.isCut ? ph.cutout : ph.img;
  if (!sub) return;
  const ar = sub.width / sub.height;
  if (ph.isCut) {
    let h = region.maxH, w = h * ar;
    if (w > region.maxW) { w = region.maxW; h = w / ar; }
    const x = region.cx - w / 2, y = region.baseY - h;
    const shadow = _silhouette(sub, 'rgba(0,0,0,0.55)');
    ctx.save(); try { ctx.filter = 'blur(12px)'; } catch (e) {} ctx.globalAlpha = 0.55; ctx.drawImage(shadow, x + 10, y + 20, w, h); ctx.restore();
    const sil = _silhouette(sub, '#FFFFFF');
    const o = Math.max(4, Math.round(w * 0.016));
    ctx.save();
    for (let a = 0; a < 20; a++) { const ang = a / 20 * Math.PI * 2; ctx.drawImage(sil, x + Math.cos(ang) * o, y + Math.sin(ang) * o, w, h); }
    ctx.restore();
    ctx.drawImage(sub, x, y, w, h);
  } else {
    let h = Math.min(region.maxH * 0.7, THUMB_H * 0.62); let w = h * ar;
    if (w > region.maxW * 0.9) { w = region.maxW * 0.9; h = w / ar; }
    const x = region.cx - w / 2;
    const yy = Math.max(28, THUMB_H * 0.5 - h / 2);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 16;
    _roundRect(ctx, x, yy, w, h, 24); ctx.fillStyle = accent; ctx.fill(); ctx.restore();
    ctx.save(); _roundRect(ctx, x + 7, yy + 7, w - 14, h - 14, 18); ctx.clip(); _cover(ctx, sub, x + 7, yy + 7, w - 14, h - 14); ctx.restore();
  }
}

/* ---------- MAIN RENDERER ---------- */
function drawThumb(canvas, design) {
  const d = _san(design);
  const ctx = canvas.getContext('2d');
  canvas.width = THUMB_W; canvas.height = THUMB_H;
  const P = d.palette;
  const aiImg = (design._img && design._img.complete && design._img.naturalWidth) ? design._img : null;
  const ph = window._thumbPhoto;

  if (aiImg) { _cover(ctx, aiImg, 0, 0, THUMB_W, THUMB_H); }
  else {
    const g = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H);
    g.addColorStop(0, P.bg1); g.addColorStop(1, P.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  const vg = ctx.createRadialGradient(THUMB_W / 2, THUMB_H * 0.46, THUMB_H * 0.34, THUMB_W / 2, THUMB_H / 2, THUMB_W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const pad = 62;
  let box, scrim, region = null;
  if (d.template === 'left-text') {
    box = { x: pad, w: THUMB_W * 0.52 - pad, top: 0, bot: THUMB_H }; scrim = 'left';
    region = { cx: THUMB_W * 0.77, baseY: THUMB_H + 8, maxH: THUMB_H * 1.02, maxW: THUMB_W * 0.5 };
  } else if (d.template === 'right-text') {
    box = { x: THUMB_W * 0.48, w: THUMB_W * 0.52 - pad, top: 0, bot: THUMB_H }; scrim = 'right';
    region = { cx: THUMB_W * 0.23, baseY: THUMB_H + 8, maxH: THUMB_H * 1.02, maxW: THUMB_W * 0.5 };
  } else if (d.template === 'bottom-bar') {
    box = { x: pad, w: THUMB_W - pad * 2, top: THUMB_H * 0.6, bot: THUMB_H - 28 }; scrim = 'bottom';
    region = { cx: THUMB_W * 0.5, baseY: THUMB_H * 0.72, maxH: THUMB_H * 0.72, maxW: THUMB_W * 0.62 };
  } else {
    box = { x: pad, w: THUMB_W * 0.6, top: 0, bot: THUMB_H }; scrim = 'left';
    region = { cx: THUMB_W * 0.8, baseY: THUMB_H + 8, maxH: THUMB_H * 1.0, maxW: THUMB_W * 0.44 };
  }

  ctx.save();
  if (scrim === 'left') { const s = ctx.createLinearGradient(0, 0, THUMB_W * 0.72, 0); s.addColorStop(0, _rgba(P.bg1, 0.9)); s.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, THUMB_W, THUMB_H); }
  else if (scrim === 'right') { const s = ctx.createLinearGradient(THUMB_W, 0, THUMB_W * 0.28, 0); s.addColorStop(0, _rgba(P.bg1, 0.9)); s.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, THUMB_W, THUMB_H); }
  else { const s = ctx.createLinearGradient(0, THUMB_H * 0.34, 0, THUMB_H); s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(1, _rgba(P.bg1, 0.92)); ctx.fillStyle = s; ctx.fillRect(0, 0, THUMB_W, THUMB_H); }
  ctx.restore();

  const gx = (scrim === 'right') ? THUMB_W * 0.22 : THUMB_W * 0.8;
  const rg = ctx.createRadialGradient(gx, THUMB_H * 0.4, 30, gx, THUMB_H * 0.4, 640);
  rg.addColorStop(0, _rgba(P.accent, 0.26)); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  if (ph && region) { try { _drawSubject(ctx, ph, region, P.accent); } catch (e) {} }

  const barTop = box.top === 0 ? THUMB_H * 0.5 - 150 : box.top;
  const barH = box.top === 0 ? 300 : (box.bot - box.top);
  ctx.fillStyle = P.accent; ctx.fillRect(box.x - 22, barTop, 10, barH);

  const bTop = box.top, bBot = box.bot;
  const hasBadge = !!d.badge, hasSub = !!d.subText, hasEmoji = !!d.emoji;
  const H = _fit(ctx, d.headline, box.w, 3, 150, 48, 800);
  const hLine = H.px * 1.04, hBlock = H.lines.length * hLine;
  const badgeH = hasBadge ? 56 : 0, badgeGap = hasBadge ? 20 : 0;
  const subPx = Math.max(28, Math.round(H.px * 0.4)), subGap = hasSub ? 18 : 0, subH = hasSub ? subPx * 1.15 : 0;
  const total = badgeH + badgeGap + hBlock + subGap + subH;
  let y = bTop + ((bBot - bTop) - total) / 2 + H.px;
  const blockTop = y - H.px;

  if (hasBadge) {
    ctx.font = "800 27px 'Outfit',sans-serif"; const bw = ctx.measureText(d.badge).width + 34;
    const by = blockTop - badgeGap - badgeH;
    _roundRect(ctx, box.x, by, bw, badgeH, 12); ctx.fillStyle = P.accent; ctx.fill();
    ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(d.badge, box.x + 17, by + badgeH / 2 + 1);
  }

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '800 ' + H.px + "px 'Outfit','Arial Black',Impact,sans-serif";
  for (const ln of H.lines) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = H.px * 0.18; ctx.shadowOffsetY = H.px * 0.06;
    ctx.lineJoin = 'round'; ctx.lineWidth = H.px * 0.2; ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.strokeText(ln, box.x, y);
    ctx.restore();
    ctx.fillStyle = P.text; ctx.fillText(ln, box.x, y);
    y += hLine;
  }

  if (hasSub) {
    y += subGap - (hLine - H.px);
    ctx.font = '700 ' + subPx + "px 'Outfit',sans-serif";
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    ctx.fillStyle = P.accent; ctx.textBaseline = 'top'; ctx.fillText(d.subText, box.x, y - H.px + 6);
    ctx.restore();
  }

  if (hasEmoji) { ctx.font = "120px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 12; try { ctx.fillText(d.emoji, box.x, THUMB_H - 46); } catch (e) {} ctx.restore(); }

  ctx.strokeStyle = _rgba(P.accent, 0.55); ctx.lineWidth = 6; ctx.strokeRect(3, 3, THUMB_W - 6, THUMB_H - 6);
}

/* ---------- GENERATE (AI call - uses 1 credit) ---------- */
async function generateThumbnails() {
  if (!supaClient || !CU) { showToast('Please log in again.', 'err', ''); return; }
  const topic = (document.getElementById('thumb-topic').value || '').trim();
  if (!topic) { showToast('Enter your video topic first.', 'warn', ''); return; }
  const btn = document.getElementById('thumb-gen-btn');
  const results = document.getElementById('thumb-results');
  const payload = {
    topic: topic,
    vibe: document.getElementById('thumb-vibe').value,
    language: document.getElementById('thumb-lang').value,
    forceText: (document.getElementById('thumb-force').value || '').trim(),
    hasPhoto: !!window._thumbPhoto,
  };
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Generating (15-30s)...'; btn.classList.add('btn-loading');
  if (results) results.innerHTML = '<div style="padding:26px;text-align:center;color:var(--text-3);font-size:.85rem;">Painting your MrBeast-style thumbnails... (AI images take ~15-30s)</div>';
  try {
    const sess = await supaClient.auth.getSession();
    const token = sess && sess.data && sess.data.session ? sess.data.session.access_token : '';
    const res = await fetch(THUMB_SUGGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      if (results) results.innerHTML = window._thumbLast ? renderThumbCards(window._thumbLast) : '';
      if (data.error === 'premium_required') { showToast('Premium required for this feature.', 'warn', ''); if (typeof openPremiumModal === 'function') openPremiumModal(); }
      else if (data.error === 'quota_exceeded') { window._thumbQuota = { used: data.used, limit: data.limit, remaining: 0 }; _refreshThumbQuota(); showToast(data.message || 'Monthly limit reached.', 'warn', ''); }
      else showToast(data.detail || data.message || data.error || 'Could not generate. Please retry.', 'err', '');
      _ensureFont().then(renderAllThumbCanvases); return;
    }
    const designs = Array.isArray(data.designs) ? data.designs.map(_san) : [];
    if (!designs.length) { showToast('AI returned nothing. Please try again.', 'err', ''); return; }
    window._thumbLast = designs;
    _prepThumbImages(window._thumbLast);
    if (data.limit != null) { window._thumbQuota = { used: data.used, limit: data.limit, remaining: data.remaining }; _refreshThumbQuota(); }
    if (results) results.innerHTML = renderThumbCards(designs);
    await _ensureFont(); renderAllThumbCanvases();
    showToast('Thumbnails ready - customise & download!', 'ok', '');
  } catch (e) {
    if (results) results.innerHTML = window._thumbLast ? renderThumbCards(window._thumbLast) : '';
    showToast('Network error. Please retry.', 'err', '');
    _ensureFont().then(renderAllThumbCanvases);
  } finally { btn.disabled = false; btn.textContent = old; btn.classList.remove('btn-loading'); }
}