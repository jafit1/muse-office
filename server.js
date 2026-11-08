require('./load-env');
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

function logOffice(from, to, text, kind = '') {
  const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const messageKind = kind || (to === 'OPERATOR' || from === 'OPERATOR' ? 'chat' : 'handoff');
  const logItem = { timestamp, from, to, text, kind: messageKind };
  officeState.logs.push(logItem);
  if (officeState.logs.length > 80) officeState.logs.shift();
  broadcast('NEW_LOG', logItem);
}

async function callAntigravity(agentConfig, systemPrompt, userMessage) {
  const agentId = typeof agentConfig === 'object' ? agentConfig.id : agentConfig;
  return antigravity.generate(agentId, `${systemPrompt}\n\n${userMessage}`);
}

function isGreeting(text) {
  const t = (text || '').toLowerCase().trim();
  return /^(hi|halo|hello|hai|hey|p|tes|test|pagi|siang|sore|malam|selamat\s+(pagi|siang|sore|malam)|apa kabar|kamu siapa|siapa kamu)[\s!?.]*$/i.test(t);
}

function isCodingTask(text) {
  const t = (text || '').toLowerCase();
  return /code|coding|fungsi|function|buat|bikin|tulis|implement|build|fix|debug|refactor|script|program|app|api|service|database|query|html|css|js|ts|python|rust|golang|endpoint|class/i.test(t);
}

async function runOfficeTask(taskPrompt, targetAgent = 'auto') {
  const pm = config.agents.find(a => a.id === 'agent_pm');
  const dev = config.agents.find(a => a.id === 'agent_dev');
  const qa = config.agents.find(a => a.id === 'agent_qa');

  try {
    // ------------------------------------------------------------------------
    // Direct Agent Execution (1-on-1 with selected agent)
    // ------------------------------------------------------------------------
    if (targetAgent === 'agent_pm') {
      updateAgentStatus(pm.id, 'thinking', 'Memproses langsung...');
      logOffice('OPERATOR', pm.name, taskPrompt, 'chat');
      const pmDirect = await callAntigravity(
        pm,
        `You are ${pm.name}, ${pm.label}. Specialty: ${pm.specialty || pm.role}.\nAnswer OPERATOR directly. Respond helpfully, clearly, and concisely in the user's language (Indonesian or English).`,
        taskPrompt
      );
      updateAgentStatus(pm.id, 'talking', 'Menjawab langsung...');
      logOffice(pm.name, 'OPERATOR', pmDirect, 'chat');
      return;
    }

    if (targetAgent === 'agent_dev') {
      updateAgentStatus(dev.id, 'thinking', 'Menulis solusi kode...');
      logOffice('OPERATOR', dev.name, taskPrompt, 'chat');
      const devDirect = await callAntigravity(
        dev,
        `You are ${dev.name}, ${dev.label}. Specialty: ${dev.specialty || dev.role}.\nImplement or answer directly for OPERATOR. Provide clean, working code with concise explanation in the user's language. No unnecessary fluff.`,
        taskPrompt
      );
      updateAgentStatus(dev.id, 'talking', 'Menyerahkan solusi...');
      logOffice(dev.name, 'OPERATOR', devDirect, 'chat');
      return;
    }

    if (targetAgent === 'agent_qa') {
      updateAgentStatus(qa.id, 'thinking', 'Mengaudit & menganalisis...');
      logOffice('OPERATOR', qa.name, taskPrompt, 'chat');
      const qaDirect = await callAntigravity(
        qa,
        `You are ${qa.name}, ${qa.label}. Specialty: ${qa.specialty || qa.role}.\nReview, audit, or answer directly for OPERATOR. Highlight verification points, security/edge-case checks, and your verdict clearly and concisely in the user's language.`,
        taskPrompt
      );
      updateAgentStatus(qa.id, 'talking', 'Menyerahkan hasil audit...');
      logOffice(qa.name, 'OPERATOR', qaDirect, 'chat');
      return;
    }

    // ------------------------------------------------------------------------
    // Auto Workflow (Smart Relay)
    // ------------------------------------------------------------------------
    updateAgentStatus(pm.id, 'thinking', 'Menganalisis kebutuhan...');
    logOffice('OPERATOR', pm.name, taskPrompt, 'chat');

    // Case A: Casual greeting or quick ping -> Gembul answers directly, Bulu & Kecil stay seated
    if (isGreeting(taskPrompt)) {
      const pmGreeting = await callAntigravity(
        pm,
        `You are ${pm.name}, ${pm.label} of Gembul Agent cluster. Role: ${pm.role}.\nGreet OPERATOR warmly and concisely in Indonesian/English. Introduce yourself and your team (Bulu the Developer, Kecil the QA). Ask how you can assist with their project today. Keep it short (2-3 sentences max).`,
        taskPrompt
      );
      updateAgentStatus(pm.id, 'talking', 'Halo OPERATOR!');
      logOffice(pm.name, 'OPERATOR', pmGreeting, 'chat');
      return;
    }

    // Case B: General query or task decomposition
    const pmDecisionPrompt = `You are ${pm.name}, ${pm.label}. Role: ${pm.role}.
User objective from OPERATOR: "${taskPrompt}"

DECISION PROTOCOL:
- If this objective is a question, planning task, advice, explanation, or conversational request that DOES NOT require writing code:
  Answer OPERATOR directly and helpfully in the user's language.
  Prefix your response with "[DIRECT]".
- If this objective requires writing code, implementing an algorithm, building an API/component, or fixing a software bug:
  Provide clear, actionable technical specifications for Developer (${dev.name}).
  Prefix your response with "[DELEGATE]".`;

    const pmResponse = await callAntigravity(pm, pmDecisionPrompt, taskPrompt);
    const isDirect = pmResponse.includes('[DIRECT]') || (!pmResponse.includes('[DELEGATE]') && !isCodingTask(taskPrompt));

    if (isDirect) {
      const cleanDirect = pmResponse.replace(/\[DIRECT\]\s*/i, '').trim();
      updateAgentStatus(pm.id, 'talking', 'Menjawab langsung...');
      logOffice(pm.name, 'OPERATOR', cleanDirect, 'chat');
      return;
    }

    // Case C: Delegation to Developer -> QA
    const cleanSpecs = pmResponse.replace(/\[DELEGATE\]\s*/i, '').trim();
    updateAgentStatus(pm.id, 'talking', 'Mendelegasikan ke Bulu...');
    logOffice(pm.name, dev.name, cleanSpecs, 'handoff');
    updateAgentStatus(pm.id, 'idle', '');

    // Step 2: Bulu (Developer) implements
    updateAgentStatus(dev.id, 'thinking', 'Mengimplementasikan kode...');
    const devResult = await callAntigravity(
      dev,
      `You are ${dev.name}, ${dev.label}. Role: ${dev.role}.
Technical specification from PM (${pm.name}):
${cleanSpecs}
Original goal: "${taskPrompt}"

Provide a clean, complete, working technical implementation with concise explanation. No placeholders.`,
      cleanSpecs
    );
    updateAgentStatus(dev.id, 'talking', 'Menyerahkan ke Kecil...');
    logOffice(dev.name, qa.name, devResult, 'handoff');
    updateAgentStatus(dev.id, 'idle', '');

    // Step 3: Kecil (QA) audits
    updateAgentStatus(qa.id, 'thinking', 'Mengaudit kualitas & keamanan...');
    const qaAudit = await callAntigravity(
      qa,
      `You are ${qa.name}, ${qa.label}. Role: ${qa.role}.
Review the technical implementation from ${dev.name} against the original goal: "${taskPrompt}".
Provide a concise quality, security, and edge-case review followed by your final verdict and approval for OPERATOR.`,
      devResult
    );
    updateAgentStatus(qa.id, 'talking', 'Deliverable diverifikasi!');
    logOffice(qa.name, 'OPERATOR', qaAudit, 'chat');
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
    // A rejected account is a normal outcome, not a broken pipe.
  } catch (error) {
    if (error.status === 403) return res.redirect('/?antigravity=denied');
    res.status(502).send(`Koneksi Antigravity gagal: ${error.message}`);
  }});

app.get('/api/antigravity/status', (req, res) => res.json(antigravity.status()));
// Google's consent screen asks for these two, so they ship with the app.
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()), ...antigravity.status() }));

let activeTask = false;
app.post('/api/task', async (req, res) => {
  const task = typeof req.body?.task === 'string' ? req.body.task.trim() : '';
  const targetAgent = typeof req.body?.targetAgent === 'string' ? req.body.targetAgent.trim() : 'auto';
  if (!task) return res.status(400).json({ error: 'Task required' });
  if (task.length > 8000) return res.status(413).json({ error: 'Task limit is 8000 characters.' });
  if (!antigravity.status().connected) return res.status(401).json({ error: 'Login ke Antigravity dulu.' });
  if (activeTask) return res.status(409).json({ error: 'Satu tugas sedang dikerjakan; tunggu sampai selesai.' });
  activeTask = true;
  res.status(202).json({ status: 'running', task, targetAgent });
  runOfficeTask(task, targetAgent).catch(error => {
    logOffice('SYSTEM', 'OPERATOR', `Tugas gagal: ${error.message}`, 'system');
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
