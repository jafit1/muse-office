import { readFileSync } from 'node:fs';

/**
 * Replays a recorded session file forever: rewrites timestamps to "now",
 * suffixes ids per loop so agents re-enter fresh each cycle.
 */
export function startDemoReplay(
  file: string,
  onLine: (file: string, line: string) => void,
  intervalMs = 1500,
): () => void {
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let i = 0;

  const timer = setInterval(() => {
    const raw = lines[i];
    try {
      const entry = JSON.parse(raw);
      // Same ids every loop: a stable cast of characters that never duplicates.
      entry.timestamp = new Date().toISOString();
      onLine(file, JSON.stringify(entry));
    } catch { /* skip malformed demo line */ }
    i = (i + 1) % lines.length;
  }, intervalMs);

  return () => clearInterval(timer);
}
