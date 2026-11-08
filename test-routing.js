'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Simple validation helper functions unit test
function isGreeting(text) {
  const t = (text || '').toLowerCase().trim();
  return /^(hi|halo|hello|hai|hey|p|tes|test|pagi|siang|sore|malam|selamat\s+(pagi|siang|sore|malam)|apa kabar|kamu siapa|siapa kamu)[\s!?.]*$/i.test(t);
}

function isCodingTask(text) {
  const t = (text || '').toLowerCase();
  return /code|coding|fungsi|function|buat|bikin|tulis|implement|build|fix|debug|refactor|script|program|app|api|service|database|query|html|css|js|ts|python|rust|golang|endpoint|class/i.test(t);
}

test('isGreeting correctly identifies conversational pings', () => {
  assert.equal(isGreeting('hi'), true);
  assert.equal(isGreeting('halo!'), true);
  assert.equal(isGreeting('kamu siapa?'), true);
  assert.equal(isGreeting('selamat pagi'), true);
  assert.equal(isGreeting('Tulis fungsi slugify di python'), false);
  assert.equal(isGreeting('Buat API gateway rate limiter'), false);
});

test('isCodingTask correctly flags implementation objectives', () => {
  assert.equal(isCodingTask('Tulis fungsi slugify'), true);
  assert.equal(isCodingTask('Buat script python untuk scraping'), true);
  assert.equal(isCodingTask('Fix bug di endpoint auth'), true);
  assert.equal(isCodingTask('hi'), false);
  assert.equal(isCodingTask('apa kabar'), false);
});
