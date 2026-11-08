const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config');
const antigravity = require('./antigravity');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('trust proxy', true);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  // The page shell is deployed together with the script that drives it, so it
  // must never be served from a stale cache after a redeploy.
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

let officeState = {
  agents: config.agents.map(a => ({
    id: a.id,
    name: a.name,
    label: a.label,
    role: a.role,
    status: 'idle',
    desk: a.desk,
    color: a.color,
    bubble: ''
  })),
  logs: []
};

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function updateAgentStatus(agentId, status, bubble = '') {
  const ag = officeState.agents.find(a => a.id === agentId);
  if (ag) {
    ag.status = status;
    ag.bubble = bubble;
    broadcast('AGENT_UPDATE', ag);
  }
}

function logOffice(from, to, text) {
  const logItem = { timestamp: new Date().toLocaleTimeString(), from, to, text };
  officeState.logs.push(logItem);
  if (officeState.logs.length > 50) officeState.logs.shift();
  broadcast('NEW_LOG', logItem);
}

async function callAntigravity(agentConfig, systemPrompt, userMessage) {
  return antigravity.generate(agentConfig.id, `${systemPrompt}\n\n${userMessage}`);
}

async function runOfficeTask(taskPrompt) {
  const pm = config.agents.find(a => a.id === 'agent_pm');
  const dev = config.agents.find(a => a.id === 'agent_dev');
  const qa = config.agents.find(a => a.id === 'agent_qa');

  try {
    // Step 1: PM analyzes and assigns
    updateAgentStatus(pm.id, 'thinking', 'Analyzing task...');
    logOffice('OPERATOR', pm.name, taskPrompt);

    const pmInstructions = await callAntigravity(
      pm,
      `You are ${pm.name}. Role: ${pm.role}. Convert the user objective into concrete specifications and delegate to Developer (${dev.name}). Concise, actionable, zero filler.`,
      taskPrompt
    );
    updateAgentStatus(pm.id, 'talking', 'Delegating to Dev...');
    logOffice(pm.name, dev.name, pmInstructions);
    updateAgentStatus(pm.id, 'idle', '');

    // Step 2: Dev executes
    updateAgentStatus(dev.id, 'thinking', 'Implementing solution...');
    const devResult = await callAntigravity(
      dev,
      `You are ${dev.name}. Role: ${dev.role}. Implement technical solution for: "${pmInstructions}". Provide complete solution, no placeholders.`,
      pmInstructions
    );
    updateAgentStatus(dev.id, 'talking', 'Handing off to QA...');
    logOffice(dev.name, qa.name, devResult);
    updateAgentStatus(dev.id, 'idle', '');

    // Step 3: QA audits
    updateAgentStatus(qa.id, 'thinking', 'Auditing deliverable...');
    const qaAudit = await callAntigravity(
      qa,
      `You are ${qa.name}. Role: ${qa.role}. Review work from ${dev.name} against goal: "${taskPrompt}". Output final verdict, verification points, and approval.`,
      devResult
    );
    updateAgentStatus(qa.id, 'talking', 'Deliverable verified!');
    logOffice(qa.name, 'OPERATOR', qaAudit);
  } finally {
    updateAgentStatus(pm.id, 'idle', '');
    updateAgentStatus(dev.id, 'idle', '');
    updateAgentStatus(qa.id, 'idle', '');
  }
}

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
  } catch (error) { res.status(502).send(`Koneksi Antigravity gagal: ${error.message}`); }
});

app.get('/api/antigravity/status', (req, res) => res.json(antigravity.status()));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()), ...antigravity.status() }));

let activeTask = false;
app.post('/api/task', async (req, res) => {
  const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';
  if (!task) return res.status(400).json({ error: 'Task required' });
  if (task.length > 8000) return res.status(413).json({ error: 'Task limit is 8000 characters.' });
  if (!antigravity.status().connected) return res.status(401).json({ error: 'Login ke Antigravity dulu.' });
  if (activeTask) return res.status(409).json({ error: 'Satu tugas sedang dikerjakan; tunggu sampai selesai.' });
  activeTask = true;
  res.status(202).json({ status: 'running', task });
  runOfficeTask(task).catch(error => {
    logOffice('SYSTEM', 'OPERATOR', `Tugas gagal: ${error.message}`);
    console.error('[Task failure]', error);
  }).finally(() => { activeTask = false; });
});

app.get('/api/state', (req, res) => res.json(officeState));

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ type: 'INIT', payload: officeState }));
});

// Proxies silently drop sockets that stay quiet, so the server pings and reaps
// the ones that stopped answering.
const heartbeat = setInterval(() => {
  wss.clients.forEach(client => {
    if (client.isAlive === false) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 25000);
wss.on('close', () => clearInterval(heartbeat));

const PORT = Number(process.env.PORT) || Number(process.env.SERVER_PORT) || Number(process.env.APP_PORT) || config.port || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[Gembul Agent] listening on ${HOST}:${PORT}`);
  console.log(`[Gembul Agent] model: ${antigravity.status().model} | antigravity: ${antigravity.status().connected ? 'connected' : 'not connected'}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
