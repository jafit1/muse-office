'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CONFIGURED_DATA_DIR = (process.env.DATA_DIR || '').trim();

// A container can boot with a volume path that does not exist yet, or with a
// read-only root where mkdir fails. The first writable candidate wins and the
// resolved path is reported by /health instead of guessing at login time.
let resolvedDataDir = null;
function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch { return false; }
}
function dataDir() {
  if (resolvedDataDir) return resolvedDataDir;
  const candidates = [CONFIGURED_DATA_DIR, path.join(__dirname, 'data'), path.join(os.tmpdir(), 'gembul-agent')].filter(Boolean);
  resolvedDataDir = candidates.find(writable) || path.join(__dirname, 'data');
  return resolvedDataDir;
}
function tokenFile() {
  return path.join(dataDir(), 'antigravity.json');
}
const PUBLIC_CALLBACK_URL = (process.env.ANTIGRAVITY_CALLBACK_URL || '').replace(/\/$/, '');
// A client id copied out of a rendered link arrives as a full URL; Google only
// accepts the bare id, so the scheme and anything after it are stripped here.
function sanitizeClientId(raw) {
  return (raw || '').trim().replace(/^["']|["']$/g, '').replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '');
}
const CLIENT_ID = sanitizeClientId(process.env.ANTIGRAVITY_CLIENT_ID);
const CLIENT_SECRET = (process.env.ANTIGRAVITY_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo';
const CODE_ASSIST_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
const ONBOARD_URL = 'https://cloudcode-pa.googleapis.com/v1internal:onboardUser';
const API_BASES = (process.env.ANTIGRAVITY_BASE_URLS || 'https://daily-cloudcode-pa.googleapis.com,https://cloudcode-pa.googleapis.com').split(',').map(v => v.trim()).filter(Boolean);
const USER_AGENT = 'antigravity/hub/2.24.0 darwin/arm64';
const METADATA = { ideType: 9, platform: 1, pluginType: 2 };
const SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/cclog', 'https://www.googleapis.com/auth/experimentsandconfigs'];
// Google cannot restrict who may authorize a published OAuth client, so the
// account gate lives here: an empty list means "any account that finishes consent".
const ALLOWED_EMAILS = (process.env.ANTIGRAVITY_ALLOWED_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
// A refresh token issued elsewhere can be handed to the service directly. It is
// the only way to use a client whose redirect URI we are not allowed to add.
const IMPORTED_REFRESH_TOKEN = (process.env.ANTIGRAVITY_REFRESH_TOKEN || '').trim();

function emailAllowed(email) {
  return ALLOWED_EMAILS.length === 0 || ALLOWED_EMAILS.includes((email || '').trim().toLowerCase());
}

let state = null;
let pending = new Map();
let refreshPromise = null;
function readState() {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(tokenFile(), 'utf8')); } catch { state = null; }
  // No stored session yet: adopt the hand-delivered refresh token, if any.
  if (!state && IMPORTED_REFRESH_TOKEN) {
    state = { accessToken: '', refreshToken: IMPORTED_REFRESH_TOKEN, expiresAt: 0, projectId: '', projectSynthetic: false, email: '', imported: true };
    return state;
  }
  // A stored session from an account that is no longer allowed is not a session.
  if (state && !emailAllowed(state.email)) {
    state = null;
    try { fs.unlinkSync(tokenFile()); } catch {}
  }
  return state;
}
function saveState(next) { const dir = dataDir(); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'antigravity.json'), JSON.stringify(next, null, 2), { mode: 0o600 }); state = next; }
function redirectUri(req) {
  if (PUBLIC_CALLBACK_URL) return PUBLIC_CALLBACK_URL;
  const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol;
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  return `${proto}://${host}/api/auth/antigravity/callback`;
}
function authUrl(req, nonce) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(req), scope: SCOPES.join(' '), state: nonce, access_type: 'offline', prompt: 'consent' });
  return `${AUTH_URL}?${params}`;
}
async function jsonFetch(url, options) { const res = await fetch(url, options); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error_description || body.error?.message || `Antigravity HTTP ${res.status}`); return body; }
async function exchange(code, req) { return jsonFetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: redirectUri(req) }) }); }
async function refresh(current) {
  if (!current?.refreshToken) return null;
  try {
    const tokens = await jsonFetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }) });
    // An imported token arrives without an email, so the account behind it is
    // only known after the first refresh. Check the allowlist right there.
    let email = current.email || '';
    if (!email) {
      try {
        const info = await jsonFetch(`${USERINFO_URL}?alt=json`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        email = info.email || '';
      } catch {}
      if (email && !emailAllowed(email)) {
        throw Object.assign(new Error(`Akun ${email} tidak ada di ANTIGRAVITY_ALLOWED_EMAILS.`), { status: 403 });
      }
    }
    const next = { ...current, email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || current.refreshToken, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 };
    saveState(next);
    return next;
  } catch (error) {
    if (error.message?.includes('invalid_grant')) { state = null; try { fs.unlinkSync(tokenFile()); } catch {} }
    throw error;
  }
}
async function ensureToken() {
  const current = readState();
  if (!current) throw Object.assign(new Error('Antigravity belum terhubung.'), { status: 401 });
  if (current.expiresAt && current.expiresAt > Date.now() + 300000) return current;
  if (!current.refreshToken) throw Object.assign(new Error('Sesi Antigravity kedaluwarsa; login ulang diperlukan.'), { status: 401 });
  if (!refreshPromise) refreshPromise = refresh(current).finally(() => { refreshPromise = null; });
  const next = await refreshPromise;
  if (!next?.accessToken) throw Object.assign(new Error('Refresh sesi Antigravity gagal; login ulang diperlukan.'), { status: 401 });
  return next;
}

// A token can be revoked before it expires, so a 401 has to force the refresh
// instead of re-reading the same fresh-looking cache.
async function forceRefresh() {
  const current = readState();
  if (!current?.refreshToken) throw Object.assign(new Error('Sesi Antigravity tidak bisa diperbarui; login ulang.'), { status: 401 });
  const next = await refresh(current);
  if (!next?.accessToken) throw Object.assign(new Error('Refresh sesi Antigravity gagal; login ulang.'), { status: 401 });
  return next;
}

function projectOf(assist) {
  const raw = assist?.cloudaicompanionProject;
  return (typeof raw === 'object' ? raw?.id : raw) || assist?.project || '';
}

function tierOf(assist) {
  return assist?.allowedTiers?.find(t => t.isDefault)?.id?.trim() || 'legacy-tier';
}

function tierIds(assist) {
  return (assist?.allowedTiers || []).map(t => t?.id).filter(Boolean);
}

// Accounts that never get a Cloud Code project still authenticate fine: the
// IDE sends a generated id and the backend only uses it to attribute quota.
function synthesizeProjectId() {
  const adj = ['useful', 'bright', 'swift', 'calm', 'bold'];
  const noun = ['fuze', 'wave', 'spark', 'flow', 'core'];
  return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${crypto.randomUUID().slice(0, 5)}`;
}

const ONBOARD_DELAY_MS = Number(process.env.ANTIGRAVITY_ONBOARD_DELAY_MS) || 1200;

async function loadProject(headers, tier, firstAssist) {
  const assist = firstAssist || await jsonFetch(CODE_ASSIST_URL, { method: 'POST', headers, body: JSON.stringify({ metadata: METADATA }) });
  let projectId = projectOf(assist);
  if (projectId) return { projectId, assist };
  // No project yet: ask for one, then poll a few times. A slow bootstrap is not
  // an error — the caller falls back to a generated id and retries later.
  await fetch(ONBOARD_URL, { method: 'POST', headers, body: JSON.stringify({ tierId: tier, metadata: METADATA }) }).catch(() => {});
  for (let i = 0; i < 3 && !projectId; i++) {
    await new Promise(r => setTimeout(r, ONBOARD_DELAY_MS));
    const again = await jsonFetch(CODE_ASSIST_URL, { method: 'POST', headers, body: JSON.stringify({ metadata: METADATA }) }).catch(() => null);
    projectId = projectOf(again);
  }
  return { projectId, assist };
}

// Re-check on demand: a generated id is replaced the moment the real project
// shows up, so nobody stays stuck on the fallback forever.
async function ensureProject(creds) {
  if (creds.projectId && !creds.projectSynthetic) return creds;
  const headers = { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'x-request-source': 'local' };
  const assist = await jsonFetch(CODE_ASSIST_URL, { method: 'POST', headers, body: JSON.stringify({ metadata: METADATA }) }).catch(() => null);
  if (!assist) return creds;
  const found = projectOf(assist);
  const tier = tierOf(assist);
  const next = found
    ? { ...creds, projectId: found, projectSynthetic: false, tier, tiers: tierIds(assist) }
    : (creds.projectId ? creds : { ...creds, projectId: synthesizeProjectId(), projectSynthetic: true, tier, tiers: tierIds(assist) });
  if (next !== creds) saveState(next);
  return next;
}

async function connectCode(code, req) {
  const tokens = await exchange(code, req);
  if (!tokens.refresh_token && !readState()?.refreshToken) throw new Error('Google tidak mengembalikan refresh token. Login ulang dengan consent penuh.');
  const headers = { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'x-request-source': 'local' };
  const info = await jsonFetch(`${USERINFO_URL}?alt=json`, { headers });
  if (!emailAllowed(info.email)) {
    throw Object.assign(new Error(`Akun ${info.email || '(tanpa email)'} tidak ada di ANTIGRAVITY_ALLOWED_EMAILS.`), { status: 403 });
  }
  const assist = await jsonFetch(CODE_ASSIST_URL, { method: 'POST', headers, body: JSON.stringify({ metadata: METADATA }) }).catch(() => ({}));
  const tier = tierOf(assist);
  const { projectId } = await loadProject(headers, tier, assist);
  const saved = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || readState()?.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    // A missing project is not a failed login: the session is still good.
    projectId: projectId || synthesizeProjectId(),
    projectSynthetic: !projectId,
    tier,
    tiers: tierIds(assist),
    email: info.email || ''
  };
  saveState(saved);
  return saved;
}

// The API takes the model key verbatim. The IDE-style "(medium)" suffix is not a
// valid entity id and comes back as 404, so it is stripped here.
function resolveModel(raw) {
  const id = (raw || process.env.ANTIGRAVITY_MODEL || 'gemini-3.8-flash').trim();
  const bare = id.replace(/\([^)]*\)\s*$/, '').trim();
  if (/^gemini-[\d.]+-flash$/.test(bare)) return `${bare}-medium`;
  return bare;
}

// Real Antigravity sessions are decimal int64 strings.
function numericSessionId() {
  const n = BigInt('0x' + crypto.randomBytes(8).toString('hex')) & 0x7fffffffffffffffn;
  return `-${n}`;
}

async function generate(agent, prompt) {
  let creds = await ensureToken();
  creds = await ensureProject(creds);
  const model = resolveModel();
  const callBody = creds => JSON.stringify({
    project: creds.projectId,
    model,
    userAgent: 'antigravity',
    // Upstream validates this shape: agent/<conversation>/<ms>/<trajectory>/<step>
    requestId: `agent/${crypto.randomUUID()}/${Date.now()}/${crypto.randomUUID()}/1`,
    request: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      sessionId: numericSessionId(),
      generationConfig: { maxOutputTokens: 8192, temperature: 0.5 }
    }
  });
  const headers = creds => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}`, 'User-Agent': USER_AGENT });

  async function attempt() {
    let res;
    let body = {};
    for (const base of API_BASES) {
      res = await fetch(`${base}/v1internal:generateContent`, { method: 'POST', headers: headers(creds), body: callBody(creds) });
      body = await res.json().catch(() => ({}));
      if (res.ok || (res.status !== 404 && res.status !== 502 && res.status !== 503)) break;
    }
    return { res, body };
  }

  let { res, body } = await attempt();
  if (res.status === 401) {
    creds = await forceRefresh();
    ({ res, body } = await attempt());
  }
  if (res.status === 429 || res.status === 503) {
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    ({ res, body } = await attempt());
  }
  if (!res.ok) throw Object.assign(new Error(body.error?.message || `Antigravity HTTP ${res.status}`), { status: res.status });

  const pick = payload => payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  const text = pick(body.response) || pick(body);
  if (!text) throw new Error('Antigravity tidak mengembalikan teks.');
  return text;
}

function status() {
  const s = readState();
  return {
    connected: !!(s?.accessToken || s?.refreshToken),
    needsRefresh: !!s && s.expiresAt <= Date.now() + 300000,
    email: s?.email || '',
    dataDir: dataDir(),
    dataDirFallback: !!CONFIGURED_DATA_DIR && dataDir() !== CONFIGURED_DATA_DIR,
    emailAllowed: emailAllowed(s?.email),
    allowlistSize: ALLOWED_EMAILS.length,
    projectIdSet: !!s?.projectId,
    projectSynthetic: !!s?.projectSynthetic,
    tier: s?.tier || '',
    tiers: s?.tiers || [],
    model: resolveModel(),
    callbackConfigured: !!PUBLIC_CALLBACK_URL,
    clientIdValid: /\.apps\.googleusercontent\.com$/.test(CLIENT_ID),
    oauthConfigured: !!(CLIENT_ID && CLIENT_SECRET)
  };
}

function start(req) {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Atur ANTIGRAVITY_CLIENT_ID dan ANTIGRAVITY_CLIENT_SECRET di environment.');
  const now = Date.now();
  for (const [nonce, expiry] of pending) if (expiry <= now) pending.delete(nonce);
  const nonce = crypto.randomBytes(24).toString('hex');
  pending.set(nonce, now + 300000);
  return authUrl(req, nonce);
}
function consume(nonce) { const expiry = pending.get(nonce); pending.delete(nonce); return !!expiry && expiry > Date.now(); }
module.exports = { start, consume, connectCode, generate, status, resolveModel, numericSessionId, sanitizeClientId };
