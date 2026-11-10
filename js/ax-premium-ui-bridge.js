/* Aalynex Premium UI bridge 2026-11-10.
   Presentation-only: Supabase RPC and Edge Functions remain authoritative.
   Prevents expired 60s display cache from turning a valid manual grant into
   a false checkout CTA. Never charges, grants, or changes subscription data. */
(function () {
  'use strict';
  if (window.__axPremiumUIBridge20261110) return;
  window.__axPremiumUIBridge20261110 = true;

  // The previous UI required a check less than 60 seconds ago. That TTL
  // makes a legitimate Premium member look unsubscribed until a sync finishes.
  // This function is DISPLAY-ONLY; every paid feature verifies server-side.
  window.isPremiumCreator = function () {
    return typeof CU !== 'undefined' && !!CU &&
      window._premiumUserId === CU.id && window._premiumActive === true;
  };

  const previous = window.renderC;
  if (typeof previous !== 'function') return;
  let requestSequence = 0;

  function notice(host, heading, message, retry) {
    host.innerHTML = '';
    const panel = document.createElement('section');
    panel.setAttribute('role', 'status');
    panel.style.cssText = 'max-width:610px;margin:22px 0;padding:22px;border:1px solid var(--glass-border,#d7d7de);border-radius:18px;background:var(--surface,#fff);color:var(--text,#202020);box-shadow:var(--shadow-sm,0 4px 20px rgba(0,0,0,.06));';
    const title = document.createElement('h3');
    title.style.cssText = 'margin:0 0 10px;font-size:1.12rem;font-weight:800;';
    title.textContent = heading;
    const body = document.createElement('p');
    body.style.cssText = 'margin:0;color:var(--text-2,#555);font-size:.9rem;line-height:1.6;';
    body.textContent = message;
    panel.append(title, body);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-primary';
      button.style.marginTop = '16px';
      button.textContent = 'Retry Premium check';
      button.addEventListener('click', retry);
      panel.append(button);
    }
    host.append(panel);
  }

  window.renderC = function (page, quiet) {
    if (page !== 'aisuggest' && page !== 'thumbnail') {
      ++requestSequence;
      return previous.apply(this, arguments);
    }
    const host = document.getElementById('c-main');
    const account = typeof CU !== 'undefined' ? CU : null;
    if (!host || !account || !account.id || typeof supaClient === 'undefined' || !supaClient) {
      return previous.apply(this, arguments);
    }

    const owner = account.id;
    const token = ++requestSequence;
    notice(host, 'Checking your Premium access', 'Verifying your current subscription or admin grant. You will not be charged.', null);
    // Avoid showing a checkout link on an expired UI cache or a network error.
    Promise.resolve().then(function () {
      return supaClient.rpc('has_verified_premium', { p_user_id: owner });
    }).then(function (result) {
      if (token !== requestSequence || !CU || CU.id !== owner || currentCreatorPage !== page) return;
      if (!result || result.error || typeof result.data !== 'boolean') {
        throw new Error('Could not verify Premium.');
      }
      window._premiumActive = result.data;
      window._premiumUserId = owner;
      window._premiumCheckedAt = Date.now();
      return previous.call(window, page, quiet);
    }).catch(function () {
      if (token !== requestSequence || !CU || CU.id !== owner || currentCreatorPage !== page) return;
      notice(host, 'Premium check unavailable', 'Your membership has not been changed. Please retry. Do not buy a second subscription.', function () {
        if (CU && CU.id === owner && currentCreatorPage === page) window.renderC(page, quiet);
      });
    });
  };
})();
