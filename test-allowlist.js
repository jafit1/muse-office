'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-allow-'));
}

function seedSession(dir, email) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'antigravity.json'), JSON.stringify({
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    expiresAt: Date.now() + 3600000,
    projectId: 'stored-project',
    email
  }));
}

// Each case needs its own module instance because the allowlist is read once at
// load time, the same way it is read once per container boot.
function freshModule(dir, allowlist) {
  process.env.DATA_DIR = dir;
  process.env.ANTIGRAVITY_ALLOWED_EMAILS = allowlist;
  delete require.cache[require.resolve('./antigravity')];
  return require('./antigravity');
}

test('a session belonging to an account outside the allowlist is discarded', () => {
  const dir = tempDir();
  seedSession(dir, 'stranger@example.com');
  const mod = freshModule(dir, 'boss@example.com');

  assert.equal(mod.status().connected, false);
  assert.equal(mod.status().allowlistSize, 1);
  assert.equal(fs.existsSync(path.join(dir, 'antigravity.json')), false);
});

test('an allowlisted account keeps its session and matches case-insensitively', () => {
  const dir = tempDir();
  seedSession(dir, 'Boss@Example.com');
  const mod = freshModule(dir, 'boss@example.com, second@example.com');

  assert.equal(mod.status().connected, true);
  assert.equal(mod.status().emailAllowed, true);
  assert.equal(mod.status().allowlistSize, 2);
});

test('an empty allowlist means no email restriction', () => {
  const dir = tempDir();
  seedSession(dir, 'anyone@example.com');
  const mod = freshModule(dir, '');

  assert.equal(mod.status().connected, true);
  assert.equal(mod.status().allowlistSize, 0);
});

test('connecting a refused account stops before any Cloud Code call', async () => {
  const dir = tempDir();
  const mod = freshModule(dir, 'boss@example.com');
  const seen = [];
  const original = global.fetch;

  global.fetch = async (url) => {
    seen.push(String(url));
    const body = String(url).includes('userinfo')
      ? { email: 'stranger@example.com' }
      : { access_token: 'fresh', refresh_token: 'fresh-refresh', expires_in: 3600 };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    await assert.rejects(
      () => mod.connectCode('code', { get: () => undefined, protocol: 'https' }),
      (error) => error.status === 403
    );
  } finally {
    global.fetch = original;
  }

  assert.equal(seen.some(url => url.includes('cloudcode-pa')), false);
  assert.equal(mod.status().connected, false);
});
