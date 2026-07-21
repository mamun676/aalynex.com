// ═══════════════════════════════════════════════
//  CONFIG — Supabase init + AWS S3 helpers
//  Load AFTER supabase-js CDN, BEFORE all other app scripts.
// ═══════════════════════════════════════════════

/* ── SUPABASE INIT ── */
const SUPABASE_URL = "https://sfzbrygqpodjinhpagaz.supabase.co";
const SUPABASE_KEY = "sb_publishable_h1rmGWdbBlMWPhkKugtOQw_6tP5ArtI";

// Public profile link detect karo
const __profileParam = new URLSearchParams(location.search).get('profile');
window.isPublicProfileView = !!__profileParam;

/* ── AWS S3 HELPERS ── */
const S3_EDGE_URL = 'https://sfzbrygqpodjinhpagaz.supabase.co/functions/v1/get-s3-url';
const s3UrlCache = {}; // { [key]: { url, expiry } }

async function s3Upload(file, folder) {
  // ✅ FIX: Session token lo, anon key nahi
  const { data: { session } } = await supaClient.auth.getSession();
  if (!session) throw new Error('User not logged in');

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${folder}/${CU.id}_${Date.now()}_${safeName}`;

  // Step 1: Edge Function se presigned upload URL lo
  const res = await fetch(S3_EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action: 'upload', fileName, fileType: file.type })
  });
  if (!res.ok) throw new Error(`S3 URL Error: ${res.status}`);
  const { uploadUrl, key } = await res.json();

  // Step 2: Directly PUT to S3
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!uploadRes.ok) throw new Error(`S3 Upload Error: ${uploadRes.status}`);

  return key; // ← Yeh DB mein store hoga
}

async function s3GetUrl(fileKey) {
  if (!fileKey) return null;
  // Cache check (13 min)
  if (s3UrlCache[fileKey] && s3UrlCache[fileKey].expiry > Date.now()) {
    return s3UrlCache[fileKey].url;
  }
  const { data: { session } } = await supaClient.auth.getSession();
  if (!session) return null;

  const res = await fetch(S3_EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action: 'download', fileKey })
  });
  if (!res.ok) { console.error('[S3] get-s3-url DOWNLOAD failed — HTTP ' + res.status + ' (check Edge Function CORS / origin allowlist for this domain)'); return null; }
  const { downloadUrl } = await res.json();
  s3UrlCache[fileKey] = { url: downloadUrl, expiry: Date.now() + 13 * 60 * 1000 };
  return downloadUrl;
}

// S3 key detect karo (http URL nahi hai to key hai)
function isS3Key(str) {
  return str && !str.startsWith('http') && !str.startsWith('blob:');
}

let supaClient;
try {
  if (!window.supabaseClient) {
    supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = supaClient;
  } else {
    supaClient = window.supabaseClient;
  }
  console.log("✅ Supabase client initialized");
} catch (e) {
  console.warn("Supabase init failed:", e);
  supaClient = null;
}