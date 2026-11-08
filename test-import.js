'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function load(dir, env) {
  process.env.DATA_DIR = dir;
  process.env.ANTIGRAVITY_ALLOWED_EMAILS = env.allowlist ?? '';
  process.env.ANTIGRAVITY_REFRESH_TOKEN = env.token ?? '';
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

test('a hand-delivered refresh token becomes a working session', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-import-'));
  const mod = load(dir, { token: 'imported-refresh', allowlist: 'me@example.com' });

  // Nothing on disk yet, but the token counts as a session.
  assert.equal(mod.status().connected, true);
  assert.equal(mod.status().email, '');

  const net = stub({
    'oauth2.googleapis.com/token': () => json({ access_token: 'fresh', expires_in: 3600 }),
    userinfo: () => json({ email: 'me@example.com' }),
    loadCodeAssist: () => json({ cloudaicompanionProject: 'gen-lang-client-0001' }),
    generateContent: () => json({ response: { candidates: [{ content: { parts: [{ text: 'siap' }] } }] } })
  });

  let text;
  try {
    text = await mod.generate({ name: 'Gembul', role: 'PM' }, 'halo');
  } finally {
    net.restore();
  }

  assert.equal(text, 'siap');
  const s = mod.status();
  assert.equal(s.connected, true);
  assert.equal(s.email, 'me@example.com');
  assert.equal(s.projectIdSet, true);
  assert.equal(s.projectSynthetic, false);

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'antigravity.json'), 'utf8'));
  assert.equal(saved.refreshToken, 'imported-refresh');
  assert.equal(saved.email, 'me@example.com');
});

test('an imported token for a refused account is rejected on first refresh', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-import-'));
  const mod = load(dir, { token: 'imported-refresh', allowlist: 'boss@example.com' });

  const net = stub({
    'oauth2.googleapis.com/token': () => json({ access_token: 'fresh', expires_in: 3600 }),
    userinfo: () => json({ email: 'stranger@example.com' })
  });

  try {
    await assert.rejects(
      () => mod.generate({ name: 'Gembul', role: 'PM' }, 'halo'),
      (error) => error.status === 403
    );
  } finally {
    net.restore();
  }

  assert.equal(net.calls.some(url => url.includes('cloudcode-pa')), false);
});
