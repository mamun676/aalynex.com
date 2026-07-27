
// Load AFTER creator.js and BEFORE main.js in index.html.

const ANALYZER_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/yt-analyze';
const ANALYZER_ORDER_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/analyzer-order';
const ANALYZER_VERIFY_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/analyzer-verify';

window._analyzerCredits = null;   // { credits, unlimitedUntil }
window._analyzerLast = null;      // last full report

/* credit packs — must mirror the server-side price table */
const AZ_PACKS = [
  { id: 'single', price: 49, title: '1 Report', note: 'One-off deep dive' },
  { id: 'pack5', price: 199, title: '5 Reports', note: 'Best for testing niches', tag: 'Popular' },
  { id: 'unlimited', price: 299, title: 'Unlimited', note: '30 days, no limits' },
];

/* ---- router hook: wrap renderC so 'analyzer' renders this page ---- */
(function () {
  const _origRenderC = window.renderC;
  window.renderC = function (p) {
    if (p === 'analyzer') {
      const m = document.getElementById('c-main');
      if (m) m.innerHTML = renderAnalyzer();
      loadAnalyzerCredits();
      return;
    }
    return _origRenderC.apply(this, arguments);
  };
})();

/* ---- helpers ---- */
function _azNum(n) {
  n = Number(n || 0);
  if (n >= 10000000) return (n / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (n >= 100000) return (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function _azUnlimitedActive() {
  const c = window._analyzerCredits;
  if (!c || !c.unlimitedUntil) return false;
  return new Date(c.unlimitedUntil).getTime() > Date.now();
}

function _azCanAnalyze() {
  const c = window._analyzerCredits;
  return _azUnlimitedActive() || (c && Number(c.credits) > 0);
}

function _azCreditsInner() {
  if (_azUnlimitedActive()) {
    const d = new Date(window._analyzerCredits.unlimitedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return '<b style="color:var(--accent);">Unlimited</b> until ' + escapeHtml(d);
  }
  const c = window._analyzerCredits;
  if (c) return '<b style="color:var(--accent);">' + Number(c.credits) + '</b> report' + (Number(c.credits) === 1 ? '' : 's') + ' left';
  return '<b style="color:var(--accent);">1</b> free report to start';
}

/* ---- load the creator's credit balance ---- */
async function loadAnalyzerCredits() {
  try {
    if (!supaClient || !CU) return;
    const { data, error } = await supaClient
      .from('profiles')
      .select('analyzer_credits, is_analyzer_sub, analyzer_sub_until')
      .eq('id', CU.id)
      .single();
    if (error) throw error;
    window._analyzerCredits = {
      credits: data.analyzer_credits == null ? 1 : data.analyzer_credits,
      unlimitedUntil: data.is_analyzer_sub ? data.analyzer_sub_until : null,
    };
  } catch (e) {
    console.error('analyzer credits load failed', e);
    window._analyzerCredits = null;
  }
  const el = document.getElementById('az-credits');
  if (el) el.innerHTML = _azCreditsInner();
}

/* ---- page markup ---- */
function renderAnalyzer() {
  const head = '' +
    '<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">' +
      '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">' +
          '<h2 style="margin:0;font-family:\'Outfit\',sans-serif;font-weight:700;font-size:1.35rem;letter-spacing:-.4px;color:var(--text);">AI Channel Analyzer</h2>' +
          '<span style="font-size:.58rem;font-weight:700;letter-spacing:.5px;color:var(--accent);background:var(--accent-soft);border:1px solid rgba(224,92,42,.22);padding:2px 8px;border-radius:99px;">PRO</span>' +
        '</div>' +
        '<p style="margin:3px 0 0;font-size:.83rem;color:var(--text-2);">Full stats, top videos and AI insights for any YouTube channel — yours or a competitor\'s.</p>' +
      '</div>' +
    '</div>';

  const inputCard = '' +
    '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:22px;box-shadow:var(--shadow-sm);margin-bottom:18px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">' +
        '<label for="az-channel" style="font-size:.82rem;font-weight:600;color:var(--text);">YouTube channel</label>' +
        '<span id="az-credits" style="font-size:.76rem;color:var(--text-2);">' + _azCreditsInner() + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<input id="az-channel" class="az-input" type="text" placeholder="@handle, channel URL or channel ID" ' +
          'style="flex:1 1 260px;min-width:0;padding:11px 14px;font-size:.86rem;border-radius:10px;border:1px solid var(--glass-border-strong);background:var(--bg2);color:var(--text);" ' +
          'onkeydown="if(event.key===\'Enter\'){event.preventDefault();runChannelAnalysis(this.nextElementSibling);}">' +
        '<button class="btn btn-primary" id="az-run-btn" onclick="runChannelAnalysis(this)" style="flex:0 0 auto;">Analyze</button>' +
      '</div>' +
      '<p style="margin:11px 0 0;font-size:.75rem;color:var(--text-3);">Works with any public channel. One analysis uses one report credit.</p>' +
    '</div>';

  const plans = '' +
    '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:22px;box-shadow:var(--shadow-sm);margin-bottom:18px;">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--text);margin-bottom:4px;">Need more reports?</div>' +
      '<p style="margin:0 0 16px;font-size:.8rem;color:var(--text-2);">Every creator gets one free report. After that, pick a pack — pay once, no subscription traps.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;">' +
        AZ_PACKS.map(function (p) {
          return '<div style="position:relative;border:1px solid var(--glass-border-strong);border-radius:var(--radius);padding:16px 14px;background:var(--bg2);display:flex;flex-direction:column;gap:6px;">' +
            (p.tag ? '<span style="position:absolute;top:-9px;right:12px;font-size:.58rem;font-weight:700;letter-spacing:.4px;color:#fff;background:var(--accent);padding:2px 8px;border-radius:99px;">' + escapeHtml(p.tag) + '</span>' : '') +
            '<div style="font-family:\'Outfit\',sans-serif;font-weight:700;font-size:1.5rem;color:var(--text);line-height:1;">&#8377;' + p.price + '</div>' +
            '<div style="font-size:.84rem;font-weight:600;color:var(--text);">' + escapeHtml(p.title) + '</div>' +
            '<div style="font-size:.74rem;color:var(--text-3);flex:1 1 auto;">' + escapeHtml(p.note) + '</div>' +
            '<button class="btn btn-light" style="margin-top:6px;width:100%;" onclick="buyAnalyzerPack(\'' + p.id + '\',this)">Buy</button>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';

  const resultsInner = window._analyzerLast ? renderAnalyzerReport(window._analyzerLast) : '' +
    '<div style="background:var(--surface);border:1px dashed var(--glass-border-strong);border-radius:var(--radius-lg);padding:34px 22px;text-align:center;">' +
      '<div style="font-weight:600;font-size:.95rem;color:var(--text);margin-bottom:6px;">No report yet</div>' +
      '<p style="margin:0;font-size:.82rem;color:var(--text-2);">Enter a channel above to see subscribers, views, engagement, top videos and AI insights.</p>' +
    '</div>';

  return head + inputCard + '<div id="az-results">' + resultsInner + '</div>' + plans;
}

/* ---- the report ---- */
function renderAnalyzerReport(d) {
  const ch = d.channel || {};
  const st = d.stats || {};
  const ai = d.insights || {};

  const idCard = '' +
    '<div style="display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:18px;box-shadow:var(--shadow-sm);margin-bottom:14px;">' +
      (ch.thumbnail ? '<img src="' + escapeHtml(ch.thumbnail) + '" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--glass-border-strong);">' : '') +
      '<div style="min-width:0;">' +
        '<div style="font-family:\'Outfit\',sans-serif;font-weight:700;font-size:1.1rem;color:var(--text);">' + escapeHtml(ch.title || 'Unknown channel') + '</div>' +
        '<div style="font-size:.78rem;color:var(--text-3);">' + escapeHtml(ch.handle || '') + (ch.country ? ' &middot; ' + escapeHtml(ch.country) : '') + '</div>' +
      '</div>' +
    '</div>';

  const cells = [
    ['Subscribers', _azNum(st.subscribers)],
    ['Total views', _azNum(st.totalViews)],
    ['Videos', _azNum(st.videoCount)],
    ['Avg views / video', _azNum(st.avgViews)],
    ['Engagement rate', (st.engagementRate == null ? '—' : Number(st.engagementRate).toFixed(2) + '%')],
  ];
  const statsGrid = '' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:14px;">' +
      cells.map(function (c) {
        return '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius);padding:15px 14px;box-shadow:var(--shadow-xs);">' +
          '<div style="font-size:.72rem;color:var(--text-3);margin-bottom:5px;">' + escapeHtml(c[0]) + '</div>' +
          '<div style="font-family:\'Outfit\',sans-serif;font-weight:700;font-size:1.3rem;color:var(--text);line-height:1;">' + escapeHtml(String(c[1])) + '</div>' +
        '</div>';
      }).join('') +
    '</div>';

  const vids = Array.isArray(d.topVideos) ? d.topVideos : [];
  const topVideos = !vids.length ? '' : '' +
    '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-sm);margin-bottom:14px;">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--text);margin-bottom:14px;">Top videos</div>' +
      vids.map(function (v, i) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--glass-border);">' +
          '<span style="font-family:\'Outfit\',sans-serif;font-weight:700;font-size:.9rem;color:var(--text-3);width:20px;flex-shrink:0;">' + (i + 1) + '</span>' +
          (v.thumbnail ? '<img src="' + escapeHtml(v.thumbnail) + '" alt="" style="width:74px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;">' : '') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:.83rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(v.title || '') + '</div>' +
            '<div style="font-size:.73rem;color:var(--text-3);">' + _azNum(v.views) + ' views &middot; ' + _azNum(v.likes) + ' likes &middot; ' + _azNum(v.comments) + ' comments</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';

  function list(title, arr, color, numbered) {
    if (!Array.isArray(arr) || !arr.length) return '';
    return '<div style="background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-sm);margin-bottom:14px;">' +
      '<div style="font-weight:700;font-size:.95rem;color:var(--text);margin-bottom:12px;">' + escapeHtml(title) + '</div>' +
      arr.map(function (s, i) {
        return '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;">' +
          '<span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:' + color + ';color:#fff;font-size:.66rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px;">' + (numbered ? (i + 1) : '&#10003;') + '</span>' +
          '<span style="font-size:.83rem;color:var(--text-2);line-height:1.6;">' + escapeHtml(typeof s === 'string' ? s : (s.title || s.idea || '')) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  return idCard + statsGrid + topVideos +
    list('What this channel does well', ai.strengths, 'var(--green)', false) +
    list('Where it can improve', ai.improvements, 'var(--yellow)', false) +
    list('Content ideas to try next', ai.ideas, 'var(--accent)', true);
}

/* ---- run the analysis ---- */
async function runChannelAnalysis(btn) {
  const input = document.getElementById('az-channel');
  const results = document.getElementById('az-results');
  const channel = ((input && input.value) || '').trim();

  if (!channel) { showToast('Please enter a YouTube channel.', 'warn', ''); return; }
  if (!_azCanAnalyze()) {
    showToast('No report credits left — pick a pack below.', 'warn', '');
    return;
  }

  if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); btn.textContent = 'Analyzing…'; }
  if (results) results.innerHTML = '' +
    '<div style="display:flex;align-items:center;gap:11px;color:var(--text-2);font-size:.85rem;padding:22px;background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-lg);">' +
      '<span style="width:16px;height:16px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin .6s linear infinite;"></span>' +
      'Pulling channel data and generating insights… (10–20 seconds)' +
    '</div>';

  try {
    const { data: { session } } = await supaClient.auth.getSession();
    if (!session || !session.access_token) throw new Error('Your session expired. Please log in again.');

    const res = await fetch(ANALYZER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ channel: channel }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'no_credits') {
        if (results) results.innerHTML = '';
        showToast('You are out of report credits.', 'warn', '');
        return;
      }
      if (data.error === 'channel_not_found') throw new Error('That channel could not be found. Check the handle or URL.');
      throw new Error(data.detail || data.message || data.error || 'Analysis failed.');
    }

    window._analyzerLast = data;
    if (results) results.innerHTML = renderAnalyzerReport(data);
    if (data.creditsLeft != null && window._analyzerCredits) {
      window._analyzerCredits.credits = data.creditsLeft;
      const el = document.getElementById('az-credits');
      if (el) el.innerHTML = _azCreditsInner();
    }
    showToast('Report ready', 'ok', '');
  } catch (e) {
    console.error(e);
    if (results) results.innerHTML = '<div style="color:var(--red);font-size:.85rem;padding:14px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:var(--radius-lg);">' + escapeHtml(e.message || 'Analysis failed.') + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); btn.textContent = 'Analyze'; }
  }
}

/* ---- buy credits (reuses the existing Razorpay setup) ---- */
async function buyAnalyzerPack(packId, btn) {
  const pack = AZ_PACKS.find(function (p) { return p.id === packId; });
  if (!pack) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
  try {
    const { data: { session } } = await supaClient.auth.getSession();
    if (!session || !session.access_token) throw new Error('Your session expired. Please log in again.');

    const orderRes = await fetch(ANALYZER_ORDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ pack: pack.id }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok) throw new Error(order.message || order.error || 'Could not start the payment.');

    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Aalynex',
      description: 'AI Channel Analyzer — ' + pack.title,
      image: 'aalynex-logo.png',
      theme: { color: '#E05C2A' },
      handler: async function (resp) {
        try {
          const vRes = await fetch(ANALYZER_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            }),
          });
          const v = await vRes.json();
          if (!vRes.ok) throw new Error(v.message || v.error || 'Payment verification failed.');
          showToast('Payment confirmed — credits added', 'ok', '');
          await loadAnalyzerCredits();
        } catch (e) {
          console.error(e);
          showToast(e.message || 'Payment verification failed.', 'err', '');
        }
      },
    });
    rzp.open();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Could not start the payment.', 'err', '');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Buy'; }
  }
}
