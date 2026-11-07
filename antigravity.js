'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'antigravity.json');
const PUBLIC_CALLBACK_URL = (process.env.ANTIGRAVITY_CALLBACK_URL || '').replace(/\/$/, '');
const CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET || '';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo';
const CODE_ASSIST_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
const ONBOARD_URL = 'https://cloudcode-pa.googleapis.com/v1internal:onboardUser';
const API_BASES = (process.env.ANTIGRAVITY_BASE_URLS || 'https://daily-cloudcode-pa.googleapis.com,https://cloudcode-pa.googleapis.com').split(',').map(v => v.trim()).filter(Boolean);
const USER_AGENT = 'antigravity/hub/2.24.0 darwin/arm64';
const METADATA = { ideType: 9, platform: 1, pluginType: 2 };
const SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/cclog', 'https://www.googleapis.com/auth/experimentsandconfigs'];

let state = null;
let pending = new Map();
let refreshPromise = null;
function readState() { if (state) return state; try { state = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { state = null; } return state; }
function saveState(next) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(TOKEN_FILE, JSON.stringify(next, null, 2), { mode: 0o600 }); state = next; }
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
    const next = { ...current, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || current.refreshToken, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 };
    saveState(next);
    return next;
  } catch (error) {
    if (error.message?.includes('invalid_grant')) { state = null; try { fs.unlinkSync(TOKEN_FILE); } catch {} }
    throw error;
  }
}
async function ensureToken() {
  const current = readState();
  if (!current) throw Object.assign(new Error('Antigravity belum terhubung.'), { status: 401 });
  if (current.expiresAt && current.expiresAt > Date.now() + 120000) return current;
  if (!current.refreshToken) throw Object.assign(new Error('Sesi Antigravity kedaluwarsa; login ulang diperlukan.'), { status: 401 });
  if (!refreshPromise) refreshPromise = refresh(current).finally(() => { refreshPromise = null; });
  return (await refreshPromise) || (() => { throw Object.assign(new Error('Refresh sesi Antigravity gagal; login ulang diperlukan.'), { status: 401 }); })();
}
async function connectCode(code, req) {
  const tokens = await exchange(code, req);
  if (!tokens.refresh_token && !readState()?.refreshToken) throw new Error('Google tidak mengembalikan refresh token. Login ulang dengan consent penuh.');
  const headers = { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'x-request-source': 'local' };
  const info = await jsonFetch(`${USERINFO_URL}?alt=json`, { headers });
  const assist = await jsonFetch(CODE_ASSIST_URL, { method: 'POST', headers, body: JSON.stringify({ metadata: METADATA }) });
  let projectId = typeof assist.cloudaicompanionProject === 'object' ? assist.cloudaicompanionProject?.id : assist.cloudaicompanionProject;
  const tier = assist.allowedTiers?.find(t => t.isDefault)?.id || 'legacy-tier';
  if (!projectId) throw new Error('Antigravity tidak memberikan project ID untuk akun ini.');
  const saved = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000, projectId, email: info.email || '' };
  saveState(saved);
  fetch(ONBOARD_URL, { method: 'POST', headers, body: JSON.stringify({ tierId: tier, metadata: METADATA }) }).catch(() => {});
  return saved;
}
async function generate(agent, prompt) {
  let creds = await ensureToken();
  const model = process.env.ANTIGRAVITY_MODEL || 'gemini-3.8-flash';
  const request = { project: creds.projectId, model, userAgent: 'antigravity', requestId: `agent/${crypto.randomUUID()}/${Date.now()}`, request: { contents: [{ role: 'user', parts: [{ text: prompt }] }], sessionId: crypto.randomUUID(), generationConfig: { maxOutputTokens: 8192, temperature: 0.5 } } };
  let res;
  let body = {};
  for (const base of API_BASES) {
    res = await fetch(`${base}/v1internal:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}`, 'User-Agent': USER_AGENT }, body: JSON.stringify(request) });
    body = await res.json().catch(() => ({}));
    if (res.ok || (res.status !== 404 && res.status !== 502 && res.status !== 503)) break;
  }
  if (res.status === 401 && creds.refreshToken) {
    creds = await ensureToken();
    res = await fetch(`${API_BASES[0]}/v1internal:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.accessToken}`, 'User-Agent': USER_AGENT }, body: JSON.stringify({ ...request, project: creds.projectId }) });
    body = await res.json().catch(() => ({}));
  }
  if (!res.ok) throw Object.assign(new Error(body.error?.message || `Antigravity HTTP ${res.status}`), { status: res.status });
  const text = body.response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || body.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Antigravity tidak mengembalikan teks.');
  return text;
}
function status() { const s = readState(); return { connected: !!s, email: s?.email || '', projectIdSet: !!s?.projectId, model: process.env.ANTIGRAVITY_MODEL || 'gemini-3.8-flash' }; }
function start(req) { if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Atur ANTIGRAVITY_CLIENT_ID dan ANTIGRAVITY_CLIENT_SECRET di environment.'); const nonce = crypto.randomBytes(24).toString('hex'); pending.set(nonce, Date.now() + 300000); return authUrl(req, nonce); }
function consume(nonce) { const expiry = pending.get(nonce); pending.delete(nonce); return expiry && expiry > Date.now(); }
module.exports = { start, consume, connectCode, generate, status };
