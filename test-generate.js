'use strict';
// Wire-format test for the Antigravity call path. No network: fetch is stubbed
// and a token file is planted before the module reads its environment.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-agent-'));
process.env.DATA_DIR = dir;
process.env.ANTIGRAVITY_MODEL = 'gemini-3.8-flash';
fs.writeFileSync(path.join(dir, 'antigravity.json'), JSON.stringify({
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  expiresAt: Date.now() + 3600 * 1000,
  projectId: 'proj-1',
  email: 'agent@example.com'
}));

const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), body: options.body });
  return { ok: true, status: 200, json: async () => ({ response: { candidates: [{ content: { parts: [{ text: ' hasil ' }] } }] } }) };
};

const antigravity = require('./antigravity');

test('generate posts the IDE wire format and returns trimmed text', async () => {
  const text = await antigravity.generate('agent_pm', 'go');
  assert.equal(text, 'hasil');

  const call = calls.find(c => c.url.endsWith('/v1internal:generateContent'));
  assert.ok(call, 'generateContent was never called');

  const body = JSON.parse(call.body);
  assert.equal(body.project, 'proj-1');
  assert.equal(body.model, 'gemini-3.8-flash-medium(medium)');
  assert.match(body.requestId, /^agent\/[^/]+\/\d+\/[^/]+\/\d+$/);
  assert.match(body.request.sessionId, /^-\d+$/);
  assert.equal(body.request.contents[0].role, 'user');
  assert.equal(body.request.contents[0].parts[0].text, 'go');
});

test('a rejected access token is refreshed once, then the call is retried', async () => {
  let generateCalls = 0;
  const seen = [];
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    seen.push(target);
    if (target.includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'at-2', expires_in: 3600 }) };
    }
    generateCalls += 1;
    if (generateCalls === 1) return { ok: false, status: 401, json: async () => ({ error: { message: 'invalid token' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) };
  };

  const text = await antigravity.generate('agent_dev', 'x');
  assert.equal(text, 'ok');
  assert.equal(generateCalls, 2);
  assert.ok(seen.some(u => u.includes('oauth2.googleapis.com/token')), 'refresh endpoint was never hit');

  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'antigravity.json'), 'utf8'));
  assert.equal(stored.accessToken, 'at-2');
  assert.equal(stored.refreshToken, 'rt-1');
});
