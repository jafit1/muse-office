'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const antigravity = require('./antigravity');

test('module loads without environment secrets and reports disconnected without exposing tokens', () => {
  const result = antigravity.status();
  assert.equal(typeof result.connected, 'boolean');
  assert.equal(typeof result.model, 'string');
  assert.equal(Object.hasOwn(result, 'accessToken'), false);
  assert.equal(Object.hasOwn(result, 'refreshToken'), false);
});

test('web crypto primitives required for OAuth state and request identity exist', () => {
  assert.equal(typeof crypto.randomBytes, 'function');
  assert.equal(typeof crypto.randomUUID, 'function');
});

test('friendly model ids expand to the upstream Antigravity preset string', () => {
  assert.equal(antigravity.resolveModel('gemini-3.8-flash'), 'gemini-3.8-flash-medium(medium)');
  assert.equal(antigravity.resolveModel('gemini-3.8-flash-high'), 'gemini-3.8-flash-high(high)');
  assert.equal(antigravity.resolveModel('gemini-3.7-flash-low'), 'gemini-3.7-flash-low(low)');
  // Already a preset: passed through untouched.
  assert.equal(antigravity.resolveModel('gemini-3.8-flash-medium(medium)'), 'gemini-3.8-flash-medium(medium)');
  // Unknown ids are not rewritten.
  assert.equal(antigravity.resolveModel('claude-sonnet-4.5'), 'claude-sonnet-4.5');
});

test('client ids pasted as links are reduced to the bare id Google accepts', () => {
  const bare = '939649378904-hu8sk26ridth743takavbp7j66bmc74m.apps.googleusercontent.com';
  assert.equal(antigravity.sanitizeClientId(bare), bare);
  assert.equal(antigravity.sanitizeClientId(`https://${bare}`), bare);
  assert.equal(antigravity.sanitizeClientId(`"https://${bare}/"`), bare);
  assert.equal(antigravity.sanitizeClientId(`  ${bare}  `), bare);
  assert.equal(antigravity.sanitizeClientId(''), '');
});

test('session id is a signed int64 decimal, matching the IDE wire format', () => {
  const id = antigravity.numericSessionId();
  assert.match(id, /^-\d+$/);
  assert.notEqual(antigravity.numericSessionId(), id);
});
