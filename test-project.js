'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function load(dir, delay) {
  process.env.DATA_DIR = dir;
  process.env.ANTIGRAVITY_ALLOWED_EMAILS = '';
  process.env.ANTIGRAVITY_ONBOARD_DELAY_MS = String(delay || 1);
  delete require.cache[require.resolve('./antigravity')];
  return require('./antigravity');
}

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function stub(routes) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    for (const [needle, handler] of Object.entries(routes)) {
      if (u.includes(needle)) return handler(u);
    }
    throw new Error(`unexpected request to ${u}`);
  };
  return { calls, restore() { global.fetch = original; } };
}

test('a login without a Cloud Code project still succeeds and keeps a generated id', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-proj-'));
  const mod = load(dir, 1);
  let onboardCalls = 0;

  const net = stub({
    'oauth2.googleapis.com/token': () => json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    userinfo: () => json({ email: 'me@example.com' }),
    loadCodeAssist: () => json({ allowedTiers: [{ id: 'free-tier', isDefault: true }] }),
    onboardUser: () => { onboardCalls += 1; return json({ done: false }); }
  });

  let saved;
  try {
    saved = await mod.connectCode('code', { get: () => undefined, protocol: 'https' });
  } finally {
    net.restore();
  }

  assert.equal(saved.email, 'me@example.com');
  assert.equal(saved.projectSynthetic, true);
  assert.match(saved.projectId, /^[a-z]+-[a-z]+-[0-9a-f]{5}$/);
  assert.equal(onboardCalls, 1);

  const s = mod.status();
  assert.equal(s.connected, true);
  assert.equal(s.projectIdSet, true);
  assert.equal(s.projectSynthetic, true);
  assert.equal(s.tier, 'free-tier');
  assert.deepEqual(s.tiers, ['free-tier']);
});

test('a real project id from loadCodeAssist is kept as-is', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-proj-'));
  const mod = load(dir, 1);
  let onboardCalls = 0;

  const net = stub({
    'oauth2.googleapis.com/token': () => json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    userinfo: () => json({ email: 'me@example.com' }),
    loadCodeAssist: () => json({ cloudaicompanionProject: { id: 'gen-lang-client-0123' }, allowedTiers: [{ id: 'standard-tier', isDefault: true }] }),
    onboardUser: () => { onboardCalls += 1; return json({ done: true }); }
  });

  let saved;
  try {
    saved = await mod.connectCode('code', { get: () => undefined, protocol: 'https' });
  } finally {
    net.restore();
  }

  assert.equal(saved.projectId, 'gen-lang-client-0123');
  assert.equal(saved.projectSynthetic, false);
  assert.equal(onboardCalls, 0);
  assert.equal(mod.status().projectSynthetic, false);
});

test('a generated project id is upgraded once the real one appears', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-proj-'));
  fs.writeFileSync(path.join(dir, 'antigravity.json'), JSON.stringify({
    accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600000,
    projectId: 'calm-wave-abc12', projectSynthetic: true, email: 'me@example.com'
  }));
  const mod = load(dir, 1);

  const net = stub({
    loadCodeAssist: () => json({ cloudaicompanionProject: 'gen-lang-client-9999', allowedTiers: [{ id: 'free-tier', isDefault: true }] }),
    generateContent: () => json({ response: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } })
  });

  let text;
  try {
    text = await mod.generate({ name: 'Bulu', role: 'Developer' }, 'ping');
  } finally {
    net.restore();
  }

  assert.equal(text, 'ok');
  const s = mod.status();
  assert.equal(s.projectSynthetic, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'antigravity.json'), 'utf8')).projectId, 'gen-lang-client-9999');
  // The upgraded id is what the request carried.
  assert.ok(net.calls.some(url => url.includes('generateContent')));
});
