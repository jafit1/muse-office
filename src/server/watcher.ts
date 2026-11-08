import { openSync, readSync, closeSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { watch } from 'chokidar';

export const ACTIVE_WINDOW_MS = 48 * 3600_000;

export function findActiveLogs(root: string, now = Date.now()): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) {
        try { if (now - statSync(p).mtimeMs <= ACTIVE_WINDOW_MS) out.push(p); } catch { /* deleted mid-scan */ }
      }
    }
  };
  walk(root);
  return out.sort();
}

export class LineReader {
  private offsets = new Map<string, number>();
  private partials = new Map<string, string>();

  readNew(file: string): string[] {
    let size: number;
    try { size = statSync(file).size; } catch { return []; }
    const offset = this.offsets.get(file) ?? 0;
    if (size <= offset) return [];
    const buf = Buffer.alloc(size - offset);
    const fd = openSync(file, 'r');
    try { readSync(fd, buf, 0, buf.length, offset); } finally { closeSync(fd); }
    this.offsets.set(file, size);
    const chunk = (this.partials.get(file) ?? '') + buf.toString('utf8');
    const lines = chunk.split('\n');
    this.partials.set(file, lines.pop() ?? '');
    return lines.filter((l) => l.trim() !== '');
  }
}

export function watchLogs(root: string, onLine: (file: string, line: string) => void): () => void {
  const reader = new LineReader();
  const emit = (file: string) => { for (const line of reader.readNew(file)) onLine(file, line); };
  for (const f of findActiveLogs(root)) emit(f); // catch-up on startup
  const watcher = watch(root, { ignoreInitial: true, depth: 3 });
  const onFs = (p: string) => { if (p.endsWith('.jsonl')) emit(p); };
  watcher.on('add', onFs).on('change', onFs);
  return () => { void watcher.close(); };
}
