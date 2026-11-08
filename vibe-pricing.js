'use strict';

/** USD per 1M tokens: [input, output, cacheRead, cacheWrite]. */
const PRICES = {
  'gemini-3.8-flash': [0.15, 0.60, 0.03, 0.15],
  'gemini-3-flash': [0.15, 0.60, 0.03, 0.15],
  'gemini-4-argon': [0.30, 1.20, 0.05, 0.30],
  'gemini-2.5-pro': [1.25, 5.00, 0.30, 1.25],
  'gemini-2.5-flash': [0.10, 0.40, 0.02, 0.10],
  'claude-opus-5': [15, 75, 1.5, 18.75],
  'claude-sonnet-5': [3, 15, 0.3, 3.75],
  'claude-opus-4': [15, 75, 1.5, 18.75],
  'claude-sonnet-4': [3, 15, 0.3, 3.75],
  'claude-haiku-4': [1, 5, 0.1, 1.25],
  default: [0.15, 0.60, 0.03, 0.15],
};

function costUsd(model, usage) {
  const m = String(model || '');
  const key = Object.keys(PRICES).find(k => k !== 'default' && m.startsWith(k)) || 'default';
  const [inp, out, cr, cw] = PRICES[key];
  const u = usage || {};
  return (
    ((u.input || 0) * inp +
      (u.output || 0) * out +
      (u.cacheRead || 0) * cr +
      (u.cacheWrite || 0) * cw) /
    1000000
  );
}

module.exports = { PRICES, costUsd };
