'use strict';
require('./load-env');

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config');
const antigravity = require('./antigravity');
const { OfficeState } = require('./vibe-state');
const { SessionManager } = require('./vibe-manager');
const { rolesInfo } = require('./vibe-roles');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PUBLIC_DIR = path.join(__dirname, 'public');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.static(PUBLIC_DIR, {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Forward declaration for decorate() during init
let manager = null;

// Broadcast helper (supports VibeOffice protocol + legacy events)
function broadcast(msg) {
  if (msg.type === 'update' && msg.agent) decorate(msg.agent);
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(data);
      // Legacy compatibility for test suites
      if (msg.type === 'update' && msg.agent) {
        c.send(JSON.stringify({ type: 'AGENT_UPDATE', payload: msg.agent }));
      }
      if (msg.feedItem) {
        c.send(JSON.stringify({
          type: 'NEW_LOG',
          payload: {
            timestamp: new Date(msg.feedItem.ts).toLocaleTimeString('id-ID', { hour12: false }),
            from: msg.feedItem.agentId || 'SYSTEM',
            to: 'OPERATOR',
            text: msg.feedItem.text
          }
        }));
      }
    }
  });
}

function decorate(a) {
  a.controllable = manager ? manager.has(a.agentId) : true;
  a.roleEmoji = manager ? manager.roleEmoji(a.agentId) : '🧑‍💻';
  return a;
}

// Initialize VibeOffice State Machine
const state = new OfficeState({
  onUpdate: (agent, feedItem) => broadcast({ type: 'update', agent, totals: state.snapshot().totals, feedItem }),
  onLeft: (agentId) => broadcast({ type: 'agent_left', agentId, totals: state.snapshot().totals })
});

// Initialize Antigravity-powered Session Manager
manager = new SessionManager({
  onEvent: (e) => state.ingest(e),
  onChat: (agentId, msg) => broadcast({ type: 'chat', agentId, msg }),
  onNote: (agentId, icon, text) => state.note(agentId, icon, text),
  onCelebrate: () => {
    broadcast({
      type: 'update',
      agent: state.snapshot().agents[0] || {},
      totals: state.snapshot().totals,
      feedItem: { ts: Date.now(), agentId: 'agent_pm', icon: '🎉', text: 'Deliverable selesai & terverifikasi!' }
    });
  },
  onLeft: (agentId) => state.remove(agentId)
});

// Tick loop for office state (handles idle, naps on couch, etc.)
const stateTimer = setInterval(() => state.tick(Date.now()), 1000);

// WebSocket Connections
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const s = state.snapshot();
  ws.send(JSON.stringify({
    type: 'snapshot',
    agents: s.agents.map(decorate),
    totals: s.totals,
    feed: s.feed,
    roles: rolesInfo(),
    permissions: [],
    chats: Object.fromEntries(manager.chats)
  }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    try {
      if (msg.type === 'say') {
        manager.say(msg.agentId, msg.text, msg.model).catch(err => {
          manager.pushChat(msg.agentId, 'agent', `⚠️ Error: ${err.message}`);
        });
      } else if (msg.type === 'hire') {
        manager.hire(msg.roleId, msg.task, msg.cwd, msg.mode, msg.model);
      } else if (msg.type === 'stop') {
        manager.stop(msg.agentId);
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });
});

// Socket heartbeat reaper
const heartbeat = setInterval(() => {
  wss.clients.forEach(client => {
    if (client.isAlive === false) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(stateTimer);
});

// HTTP Endpoints
app.get('/privacy', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'terms.html')));
app.get('/api/antigravity/status', (req, res) => res.json(antigravity.status()));
app.get('/health', (req, res) => {
  res.json(Object.assign({ status: 'ok', uptime: Math.round(process.uptime()) }, antigravity.status(), { totals: state.snapshot().totals }));
});
app.get('/api/state', (req, res) => res.json(state.snapshot()));

app.get('/api/auth/antigravity/start', (req, res) => {
  try { res.redirect(antigravity.start(req)); }
  catch (error) { res.status(503).send(error.message); }
});

app.get('/api/auth/antigravity/callback', async (req, res) => {
  try {
    if (!req.query.state || !antigravity.consume(req.query.state)) return res.status(400).send('OAuth state tidak valid atau kedaluwarsa.');
    if (req.query.error) return res.status(400).send(`Login Antigravity gagal: ${req.query.error_description || req.query.error}`);
    await antigravity.connectCode(req.query.code, req);
    res.redirect('/?antigravity=connected');
  } catch (error) {
    if (error.status === 403) return res.redirect('/?antigravity=denied');
    res.status(502).send(`Koneksi Antigravity gagal: ${error.message}`);
  }
});

// External task dispatch endpoint
app.post('/api/task', async (req, res) => {
  const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';
  const target = typeof req.body?.targetAgent === 'string' ? req.body.targetAgent.trim() : 'agent_pm';
  if (!task) return res.status(400).json({ error: 'Task required' });
  if (task.length > 8000) return res.status(413).json({ error: 'Task limit is 8000 characters.' });
  if (!antigravity.status().connected) return res.status(401).json({ error: 'Login ke Antigravity dulu.' });

  res.status(202).json({ status: 'running', task, targetAgent: target });
  manager.say(target, task, req.body?.model).catch(err => {
    console.error('[Task dispatch error]', err);
  });
});

const PORT = Number(process.env.PORT) || Number(process.env.SERVER_PORT) || Number(process.env.APP_PORT) || config.port || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[Gembul VibeOffice] listening on ${HOST}:${PORT}`);
  console.log(`[Gembul VibeOffice] model: ${antigravity.status().model} | antigravity: ${antigravity.status().connected ? 'connected' : 'not connected'}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    wss.close();
    server.close(() => process.exit(0));
  });
}

module.exports = server;
