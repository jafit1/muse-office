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
