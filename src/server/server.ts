import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ClaudeCodeAdapter } from './adapter/claude-code.js';
import { OfficeState } from './state.js';
import { watchLogs } from './watcher.js';
import { startDemoReplay } from './demo.js';
import { SessionManager } from './manager.js';
import { rolesInfo } from './roles.js';
import type { AgentSnapshot, ChatMsg, ClientMessage, PermissionRequest, ServerMessage } from '../shared/types.js';

export interface ServerOptions { port: number; logsRoot: string; webRoot?: string; demoFile?: string; }
export interface RunningServer { port: number; stop(): void; }

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
};

function defaultWebRoot(): string {
  // compiled: dist/server/server.js -> dist/web ; dev (tsx): fall back to cwd
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '..', 'web'), join(process.cwd(), 'dist', 'web')];
  return candidates.find(existsSync) ?? candidates[0];
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const webRoot = opts.webRoot ?? defaultWebRoot();

  const http = createServer((req, res) => {
    try {
      const url = (req.url ?? '/').split('?')[0];
      const path = normalize(join(webRoot, url === '/' ? 'index.html' : url));
      // separator-aware check: '.../webX' must not pass for root '.../web'
      const inRoot = path === join(webRoot, 'index.html') || path.startsWith(webRoot + sep);
      if (!inRoot || !existsSync(path) || !statSync(path).isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(path));
    } catch {
      res.writeHead(500).end('error');
    }
  });

  const wss = new WebSocketServer({ server: http });
  const decorate = (a: AgentSnapshot): AgentSnapshot => {
    a.controllable = manager.has(a.agentId);
    a.roleEmoji = manager.roleEmoji(a.agentId);
    return a;
  };
  const broadcast = (msg: ServerMessage) => {
    if (msg.type === 'update') decorate(msg.agent);
    const data = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(data);
  };

  const state = new OfficeState(
    {
      onUpdate: (agent, feedItem) => broadcast({ type: 'update', agent, totals: state.snapshot().totals, feedItem }),
      onLeft: (agentId) => broadcast({ type: 'agent_left', agentId, totals: state.snapshot().totals }),
    },
    // demo runs on a compressed clock so sleep/leave/re-enter cycles are visible
    opts.demoFile ? { waitingMs: 6_000, sleepMs: 13_000, leaveMs: 30_000 } : undefined,
  );
  const pendingPermissions = new Map<string, PermissionRequest>();
  const chats = new Map<string, ChatMsg[]>();
  const pushChat = (agentId: string, who: ChatMsg['who'], text: string) => {
    const msg: ChatMsg = { ts: Date.now(), who, text: text.slice(0, 4000) };
    const log = chats.get(agentId) ?? [];
    log.push(msg);
    if (log.length > 60) log.shift();
    chats.set(agentId, log);
    broadcast({ type: 'chat', agentId, msg });
  };
  const manager = new SessionManager({
    onEvent: (e) => state.ingest(e),
    onPermission: (req) => {
      pendingPermissions.set(req.requestId, req);
      broadcast({ type: 'permission_request', request: req });
    },
    onPermissionResolved: (agentId, requestId) => {
      pendingPermissions.delete(requestId);
      broadcast({ type: 'permission_resolved', agentId, requestId });
    },
    onChat: (agentId, text) => pushChat(agentId, 'agent', text),
    onGone: (agentId) => { chats.delete(agentId); state.remove(agentId); },
  });

  const adapter = new ClaudeCodeAdapter();
  const onLine = (file: string, line: string) => {
    for (const e of adapter.ingestLine(file, line)) {
      if (manager.isSdkSession(e.sessionId)) continue; // hired agents are fed by the SDK bridge
      state.ingest(e);
    }
  };
  const stopWatch = opts.demoFile
    ? startDemoReplay(opts.demoFile, onLine)
    : watchLogs(opts.logsRoot, onLine);
  const timer = setInterval(() => state.tick(Date.now()), 1000);

  wss.on('connection', (ws) => {
    const s = state.snapshot();
    ws.send(JSON.stringify({
      type: 'snapshot', agents: s.agents.map(decorate), totals: s.totals, feed: s.feed,
      roles: rolesInfo(), permissions: [...pendingPermissions.values()],
      chats: Object.fromEntries(chats),
    } satisfies ServerMessage));

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      try {
        if (msg.type === 'hire') {
          const id = manager.hire(msg.roleId, msg.task, msg.cwd, msg.mode, msg.model);
          state.note(id, '🪪', `hired (${msg.mode}): ${msg.task.slice(0, 60)}`);
          pushChat(id, 'you', msg.task);
        } else if (msg.type === 'say' && manager.has(msg.agentId)) {
          manager.say(msg.agentId, msg.text);
          pushChat(msg.agentId, 'you', msg.text);
        } else if (msg.type === 'stop' && manager.has(msg.agentId)) {
          void manager.stop(msg.agentId);
        } else if (msg.type === 'permission') {
          manager.resolvePermission(msg.agentId, msg.requestId, msg.allow);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'command failed' } satisfies ServerMessage));
      }
    });
  });

  return new Promise((resolve, reject) => {
    http.once('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'EADDRINUSE' ? new Error(`port ${opts.port} is busy — try --port <n>`) : err);
    });
    http.listen(opts.port, '127.0.0.1', () => {
      const port = (http.address() as { port: number }).port;
      resolve({
        port,
        stop() { clearInterval(timer); stopWatch(); wss.close(); http.close(); },
      });
    });
  });
}
