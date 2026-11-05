const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let officeState = {
  agents: config.agents.map(a => ({
    id: a.id,
    name: a.name,
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

async function callMuseAI(agentConfig, systemPrompt, userMessage) {
  const key = agentConfig.apiKey;
  if (!key) {
    return `[Simulation / No API Key for ${agentConfig.name}]: Checked request for "${userMessage.substring(0, 40)}..."`;
  }

  try {
    const res = await fetch(`${config.museBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'muse-spark',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.5,
        max_tokens: 600
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || JSON.stringify(data);
  } catch (err) {
    console.error(`[Call Error - ${agentConfig.name}]:`, err.message);
    return `[Error contacting Muse API for ${agentConfig.name}]: ${err.message}`;
  }
}

async function runOfficeTask(taskPrompt) {
  const pm = config.agents.find(a => a.id === 'agent_pm');
  const dev = config.agents.find(a => a.id === 'agent_dev');
  const qa = config.agents.find(a => a.id === 'agent_qa');

  // Step 1: PM analyzes and assigns
  updateAgentStatus(pm.id, 'thinking', 'Analyzing task...');
  logOffice('OPERATOR', pm.name, taskPrompt);

  const pmInstructions = await callMuseAI(
    pm,
    `You are ${pm.name}. Role: ${pm.role}. Convert the user objective into concrete specifications and delegate to Developer (${dev.name}). Concise, actionable, zero filler.`,
    taskPrompt
  );
  updateAgentStatus(pm.id, 'talking', 'Delegating to Dev...');
  logOffice(pm.name, dev.name, pmInstructions);

  // Step 2: Dev executes
  updateAgentStatus(dev.id, 'thinking', 'Implementing solution...');
  const devResult = await callMuseAI(
    dev,
    `You are ${dev.name}. Role: ${dev.role}. Implement technical solution for: "${pmInstructions}". Provide complete solution, no placeholders.`,
    pmInstructions
  );
  updateAgentStatus(dev.id, 'talking', 'Handing off to QA...');
  logOffice(dev.name, qa.name, devResult);

  // Step 3: QA audits
  updateAgentStatus(qa.id, 'thinking', 'Auditing deliverable...');
  const qaAudit = await callMuseAI(
    qa,
    `You are ${qa.name}. Role: ${qa.role}. Review work from ${dev.name} against goal: "${taskPrompt}". Output final verdict, verification points, and approval.`,
    devResult
  );
  updateAgentStatus(qa.id, 'talking', 'Deliverable verified!');
  logOffice(qa.name, 'OPERATOR', qaAudit);

  setTimeout(() => {
    updateAgentStatus(pm.id, 'idle', '');
    updateAgentStatus(dev.id, 'idle', '');
    updateAgentStatus(qa.id, 'idle', '');
  }, 5000);
}

app.post('/api/task', (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: 'Task required' });
  runOfficeTask(task);
  res.json({ status: 'queued', task });
});

app.get('/api/state', (req, res) => res.json(officeState));

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'INIT', payload: officeState }));
});

const PORT = process.env.PORT || config.port || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Virtual Office] Listening on 0.0.0.0:${PORT}`);
});
