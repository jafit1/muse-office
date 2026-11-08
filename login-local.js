'use strict';
// Obtains a refresh token from your own machine and prints it.
//
// Why this exists: a refresh token is bound to the OAuth client that issued it,
// and the Antigravity client only accepts a loopback redirect. A service on a
// public domain can never complete that flow, but it can *use* the token.
//
// Usage on Windows (PowerShell), from the repo folder:
//   $env:ANTIGRAVITY_CLIENT_ID='<id>'
//   $env:ANTIGRAVITY_CLIENT_SECRET='<secret>'
//   node login-local.js
//
// Then paste the printed token into the host as ANTIGRAVITY_REFRESH_TOKEN.

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = Number(process.env.LOGIN_PORT || 53682);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const CLIENT_ID = (process.env.ANTIGRAVITY_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.ANTIGRAVITY_CLIENT_SECRET || '').trim();
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs'
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set ANTIGRAVITY_CLIENT_ID and ANTIGRAVITY_CLIENT_SECRET first.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  scope: SCOPES.join(' '),
  state,
  access_type: 'offline',
  prompt: 'consent'
}).toString();

function openBrowser(url) {
  const command = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(command, () => {});
}

function reply(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<pre style="font:14px/1.6 monospace;padding:32px">${message}</pre>`);
}

async function exchange(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
  return body;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') return reply(res, 404, 'not found');

  if (url.searchParams.get('state') !== state) return reply(res, 400, 'state mismatch, start again');
  const error = url.searchParams.get('error');
  if (error) return reply(res, 400, `Google refused: ${error}`);

  try {
    const tokens = await exchange(url.searchParams.get('code'));
    if (!tokens.refresh_token) {
      return reply(res, 400, 'No refresh token returned. Remove the app from myaccount.google.com/permissions and run again.');
    }

    let email = '';
    try {
      const info = await (await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })).json();
      email = info.email || '';
    } catch {}

    const targetAgent = (process.argv[2] || process.env.LOGIN_AGENT || '').trim().toLowerCase();
    const envVarName = targetAgent
      ? `ANTIGRAVITY_REFRESH_TOKEN_${targetAgent.replace(/^agent_/, '').toUpperCase()}`
      : 'ANTIGRAVITY_REFRESH_TOKEN';

    reply(res, 200, `Done. Account: ${email || '(unknown)'}<br>Target: ${envVarName}<br>Return to the terminal.`);
    console.log(`\n--- paste this into the host as ${envVarName} ---\n`);
    console.log(tokens.refresh_token);
    console.log(`\naccount: ${email || '(unknown)'}\n`);
  } catch (e) {
    reply(res, 500, `Exchange failed: ${e.message}`);
    console.error('exchange failed:', e.message);
  } finally {
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Listening on ${REDIRECT_URI}`);
  console.log('Opening the consent screen. If nothing opens, paste this URL:\n');
  console.log(authUrl + '\n');
  openBrowser(authUrl);
});
