import type { Usage } from '../shared/types.js';

/** USD per 1M tokens: [input, output, cacheRead, cacheWrite]. Longest-prefix match wins. */
export const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-4': [15, 75, 1.5, 18.75],
  'claude-sonnet-5': [3, 15, 0.3, 3.75],
  'claude-sonnet-4': [3, 15, 0.3, 3.75],
  'claude-haiku-4': [1, 5, 0.1, 1.25],
  'claude-fable-5': [15, 75, 1.5, 18.75],
  default: [3, 15, 0.3, 3.75],
};

export function costUsd(model: string, u: Usage): number {
  const key = Object.keys(PRICES)
    .filter((k) => k !== 'default' && model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0] ?? 'default';
  const [inp, out, cr, cw] = PRICES[key];
  return (u.input * inp + u.output * out + u.cacheRead * cr + u.cacheWrite * cw) / 1_000_000;
}
