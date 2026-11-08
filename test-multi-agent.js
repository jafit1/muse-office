'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshModule(dir, env = {}) {
  process.env.DATA_DIR = dir;
  process.env.ANTIGRAVITY_REFRESH_TOKEN = env.defaultToken || 'default-refresh-token';
  process.env.ANTIGRAVITY_REFRESH_TOKEN_PM = env.pmToken || '';
  process.env.ANTIGRAVITY_REFRESH_TOKEN_DEV = env.devToken || '';
  process.env.ANTIGRAVITY_REFRESH_TOKEN_QA = env.qaToken || '';
  delete require.cache[require.resolve('./antigravity')];
  return require('./antigravity');
}

test('status reports per-agent accounts and dedicated status', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gembul-multi-'));
  const mod = freshModule(dir, {
    defaultToken: 'default-token-xyz',
    devToken: 'dev-dedicated-token-123'
  });

  const s = mod.status();
  assert.equal(s.connected, true);
  assert.ok(s.agents);
  assert.equal(s.agents.agent_pm.connected, true);
  assert.equal(s.agents.agent_pm.dedicated, false); // uses default
  assert.equal(s.agents.agent_dev.connected, true);
  assert.equal(s.agents.agent_dev.dedicated, true); // has dedicated dev token
  assert.equal(s.agents.agent_qa.connected, true);
  assert.equal(s.agents.agent_qa.dedicated, false); // uses default
});
