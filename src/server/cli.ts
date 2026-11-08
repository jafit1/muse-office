#!/usr/bin/env node
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { parseCliArgs } from './cli-args.js';
import { startServer } from './server.js';

const HELP = `vibeoffice — a cozy pixel office where your Claude Code agents live

Usage: npx vibeoffice [options]
  --port <n>    port to listen on (default 4180)
  --dir <path>  Claude Code logs dir (default ~/.claude/projects)
  --demo        replay a bundled demo session (no Claude Code needed)
  --no-open     do not open the browser
  -h, --help    show this help
`;

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }
  const logsRoot = opts.dir ?? join(homedir(), '.claude', 'projects');
  // compiled file lives in dist/server/ -> package root is two levels up
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const demoFile = opts.demo ? join(pkgRoot, 'fixtures', 'demo-session.jsonl') : undefined;
  const server = await startServer({ port: opts.port, logsRoot, demoFile });
  const url = `http://localhost:${server.port}`;
  console.log(`\n  🏢 vibeoffice is open at ${url}\n  ${opts.demo ? 'mode: demo replay' : `watching: ${logsRoot}`}\n`);
  if (opts.open) await open(url);
}

main().catch((err) => { console.error(err); process.exit(1); });
