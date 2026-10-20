// Premium is a server decision. This is a short-lived display cache, never authorization.
window._premiumEpoch = window._premiumEpoch || 0;
window._premiumStatusSeq = window._premiumStatusSeq || 0;
function resetPremiumSession() {
  window._premiumEpoch++;
  window._premiumStatusSeq++;
  window._premiumActive = false;
  window._premiumUserId = null;
  window._premiumCheckedAt = 0;
  window._premiumCheckoutBusy = false;
  window._premiumPlan = null;
  if (typeof _pendingManagedId !== 'undefined') { _pendingManagedId = null; _pendingManagedName = null; }
}
async function refreshPremiumStatus(user) {
  if (!supaClient || !user || !CU || user.id !== CU.id) return false;
  const epoch = window._premiumEpoch, userId = user.id, seq = ++window._premiumStatusSeq;
  let active = false;
  try {
    const { data, error } = await supaClient.rpc('has_verified_premium', { p_user_id: userId });
    active = !error && data === true;
  } catch (_) { active = false; }
  if (!CU || CU.id !== userId || window._premiumEpoch !== epoch || seq !== window._premiumStatusSeq) return false;
  window._premiumActive = active;
  window._premiumUserId = userId;
  window._premiumCheckedAt = Date.now();
  return active;
}

// ═══════════════════════════════════════════════
//  SYNC — pull profiles, projects, attachments, conversations, messages
// ═══════════════════════════════════════════════
async function syncFromSupabase(u, opts = {}) {
  // opts.coreOnly = true  ->  sirf profiles + projects + attachments (FAST).
  // Heavy conversations/messages + per-message S3 URL signing skip ho jaata hai.
  if (!supaClient) return;
  try {
    const { data: profiles } = await supaClient.from('profiles').select('*');
    if (profiles && profiles.length) {
      const localUsers = DB.users();
      profiles.forEach(p => {
        const exists = localUsers.find(x => x.id === p.id);
        const mapped = {
          id: p.id, name: p.name || 'User', email: '', phone: p.phone || '',
          role: p.role || 'creator', profession: p.profession || '',
          platform: p.platform || '', avatar: (p.name || 'U').charAt(0).toUpperCase(),
          createdAt: new Date(p.created_at).getTime(),
          skills: p.skills || [],
          portfolio_links: p.portfolio_links || {},
          resume_url: p.resume_url || '',
          photo_url: p.photo_url || '',
          upi_id: p.upi_id || '',
          bank_account_name: p.bank_account_name || '',
          bank_account_number: p.bank_account_number || '',
          ifsc_code: p.ifsc_code || '',
          specialization: p.specialization || '',
          min_price_longform: (p.min_price_longform != null ? p.min_price_longform : null),
          min_price_reel: (p.min_price_reel != null ? p.min_price_reel : null),
          is_managed_editor: false,
          managed_id: ''
        };
        if (!exists) localUsers.push(mapped); else Object.assign(exists, mapped);
      });
      localUsers.sort((a, b) => (a.createdAt - b.createdAt) || String(a.id).localeCompare(String(b.id)));
DB.saveUsers(localUsers);

      // ── Managed Editors (admin-controlled) — mark which freelancers are managed ──
      try {
        const { data: managed } = await supaClient.from('managed_editors').select('freelancer_id, unique_id');
        const mSet = {};
        (managed || []).forEach(m => { mSet[m.freelancer_id] = m.unique_id; });
        const usersNow = DB.users();
        usersNow.forEach(x => {
          x.is_managed_editor = !!mSet[x.id];
          x.managed_id = mSet[x.id] || '';
        });
        DB.saveUsers(usersNow);
      } catch (e) { /* managed_editors optional */ }
    }

    // Fail closed: read server-verified entitlement, never trust browser-written status.
    await refreshPremiumStatus(u);

    // ── Premium plan (admin-controlled price → shown live on main site) ──
    try {
      const { data: _plan } = await supaClient.from('subscription_plans')
        .select('id, name, price, trial_days, features').eq('plan_key', 'aalynex_premium').eq('is_active', true).maybeSingle();
      if (_plan) window._premiumPlan = _plan;
    } catch (e) {}

    const { data: projects } = await supaClient.from('projects').select('*');
    if (projects && projects.length) {
      const mapped = projects.map(p => ({
        id: p.id, creatorId: p.creator_id, freelancerId: p.freelancer_id || null,
        invited_freelancers: p.invited_freelancers || [],
        title: p.title || '', description: p.description || '', budget: p.budget || 0,
        contentType: p.content_type || '', deadline: p.deadline || '', priority: p.priority || 'Normal',
        status: p.status || 'open', rawShared: p.raw_shared || false,
        editedUploaded: p.edited_uploaded || false, paid: p.paid || false,
        rating: p.rating || 0, review: p.review || '', createdAt: new Date(p.created_at).getTime()
      }));
      mapped.sort((a, b) => (a.createdAt - b.createdAt) || String(a.id).localeCompare(String(b.id)));
DB.saveProjects(mapped);
    }

    const { data: attachments } = await supaClient.from('project_attachments').select('*');
    if (attachments && attachments.length) {
      const mappedAtts = attachments.map(a => ({
        id: a.id, projectId: a.project_id, name: a.file_name,
        file_url: a.file_url,   // ← THIS WAS MISSING (preserved fix)
        type: a.file_type, size: a.file_size, duration: a.duration
      }));
      mappedAtts.sort((a, b) => String(a.projectId).localeCompare(String(b.projectId))
  || String(a.id).localeCompare(String(b.id)));
DB.saveAttachments(mappedAtts);
    }

    // ⚡ FAST PATH: dashboard/non-chat pages ko messages ki zaroorat nahi —
    // yahi block (messages fetch + S3 signing) sabse slow tha.
    if (opts.coreOnly) return;

    const { data: convos } = await supaClient.from('conversations')
      .select('*')
      .or(`user1_id.eq.${u.id},user2_id.eq.${u.id}`);

    if (convos && convos.length > 0) {
      const convoIds = convos.map(c => c.id);

      const { data: messages } = await supaClient.from('messages')
        .select('*')
        .in('conversation_id', convoIds)
        .order('created_at', { ascending: true });

      if (messages && messages.length > 0) {
        const msgMap = {};
        for (const m of messages) {  // for...of for async/await
          const c = convos.find(x => x.id === m.conversation_id);
          if (c) {
            const otherId = c.user1_id === u.id ? c.user2_id : c.user1_id;
            const key = [u.id, otherId].sort().join('_');
            if (!msgMap[key]) msgMap[key] = [];

            let fileurl = m.file_url || null;
            if (isS3Key(fileurl)) {
              try { fileurl = await s3GetUrl(fileurl); }
              catch (e) { console.error('[S3] sync sign failed (CORS/network?):', e); fileurl = null; }
            }

            msgMap[key].push({
              id:       m.id,
              from:     m.sender_id,
              text:     m.text,
              file_url: fileurl,
              time:     new Date(m.created_at).getTime()
            });
            renderedMessageIds.add(m.id); // prevents realtime re-adding same msg
          }
        }
        DB.saveMessages(msgMap);
      }
    }
  } catch (e) {
    console.warn('Sync failed, using in-memory data:', e);
  }
}
