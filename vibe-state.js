'use strict';
const { costUsd } = require('./vibe-pricing');

const DEFAULTS = {
  waitingMs: 10000,
  sleepMs: 5 * 60000,
  leaveMs: 15 * 60000
};

const TOOL_STATUS = {
  read: 'reading',
  edit: 'editing',
  bash: 'running',
  web: 'browsing',
  task: 'thinking',
  other: 'working'
};

const TOOL_ICON = {
  read: '📄',
  edit: '⌨️',
  bash: '🖥️',
  web: '🌐',
  task: '🚪',
  other: '🔧'
};

const FEED_LIMIT = 50;

class OfficeState {
  constructor(callbacks, thresholds) {
    this.cb = callbacks || { onUpdate() {}, onLeft() {} };
    this.th = Object.assign({}, DEFAULTS, thresholds);
    this.agents = new Map();
    this.feed = [];
    this.meta = new Map();
  }

  spawn(agentId, sessionId, ts) {
    const m = this.meta.get(agentId) || { label: agentId.replace('agent_', '').toUpperCase(), projectDir: 'gembul/office' };
    const snap = {
      agentId,
      parentAgentId: m.parentAgentId,
      sessionId,
      projectDir: m.projectDir,
      label: m.label,
      model: 'gemini-3.8-flash',
      status: 'entering',
      detail: '',
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0,
      startedAt: ts,
      lastActivityAt: ts
    };
    const tracked = { snap, pendingToolTs: undefined };
    this.agents.set(agentId, tracked);
    this.emit(snap, { ts, agentId, icon: '🚪', text: `${snap.label} masuk ke kantor` });
    return tracked;
  }

  ingest(e) {
    if (e.kind === 'session_started') {
      this.meta.set(e.agentId, { label: e.label, projectDir: e.projectDir, parentAgentId: e.parentAgentId });
      const existing = this.agents.get(e.agentId);
      if (existing) {
        existing.snap.label = e.label;
        existing.snap.projectDir = e.projectDir;
        this.emit(existing.snap);
      } else {
        this.spawn(e.agentId, e.sessionId, e.ts);
      }
      return;
    }

    let t = this.agents.get(e.agentId);
    if (!t) {
      if (!this.meta.has(e.agentId)) return;
      t = this.spawn(e.agentId, e.sessionId, e.ts);
    }
    t.snap.lastActivityAt = e.ts;

    switch (e.kind) {
      case 'tool_call':
        t.snap.status = TOOL_STATUS[e.tool] || 'working';
        t.snap.detail = e.detail || '';
        t.pendingToolTs = e.ts;
        this.emit(t.snap, {
          ts: e.ts,
          agentId: e.agentId,
          icon: TOOL_ICON[e.tool] || '🔧',
          text: `${e.toolName || 'Tool'} ${e.detail || ''}`.trim()
        });
        break;
      case 'tool_result':
        t.pendingToolTs = undefined;
        t.snap.status = e.isError ? 'error' : 'working';
        this.emit(
          t.snap,
          e.isError ? { ts: e.ts, agentId: e.agentId, icon: '❗', text: 'Tugas mengalami error' } : undefined
        );
        break;
      case 'thinking':
        t.snap.status = 'thinking';
        this.emit(t.snap);
        break;
      case 'usage': {
        const u = t.snap.tokens;
        u.input += e.usage?.input || 0;
        u.output += e.usage?.output || 0;
        u.cacheRead += e.usage?.cacheRead || 0;
        u.cacheWrite += e.usage?.cacheWrite || 0;
        t.snap.costUsd += costUsd(e.model, e.usage);
        if (e.model) t.snap.model = e.model;
        this.emit(t.snap);
        break;
      }
    }
  }

  tick(now) {
    for (const [id, t] of this.agents) {
      // Core agents never leave the office permanently
      if (id === 'agent_pm' || id === 'agent_dev' || id === 'agent_qa') {
        const idle = now - t.snap.lastActivityAt;
        if (idle > this.th.sleepMs && t.snap.status !== 'sleeping') {
          t.snap.status = 'sleeping';
          this.emit(t.snap);
        }
        continue;
      }

      const idle = now - t.snap.lastActivityAt;
      if (idle > this.th.leaveMs) {
        t.snap.status = 'leaving';
        this.emit(t.snap);
        this.agents.delete(id);
        this.cb.onLeft(id);
      } else if (idle > this.th.sleepMs && t.snap.status !== 'sleeping') {
        t.snap.status = 'sleeping';
        this.emit(t.snap);
      } else if (t.pendingToolTs !== undefined && now - t.pendingToolTs > this.th.waitingMs && t.snap.status !== 'waiting') {
        t.snap.status = 'waiting';
        this.emit(t.snap, { ts: now, agentId: id, icon: '☕', text: 'Menunggu respon...' });
      }
    }
  }

  remove(agentId) {
    const t = this.agents.get(agentId);
    if (!t) return;
    t.snap.status = 'leaving';
    this.emit(t.snap);
    this.agents.delete(agentId);
    this.cb.onLeft(agentId);
  }

  note(agentId, icon, text) {
    const t = this.agents.get(agentId);
    const ts = Date.now();
    if (t) {
      this.emit(t.snap, { ts, agentId, icon, text });
    } else {
      this.feed.push({ ts, agentId, icon, text });
      if (this.feed.length > FEED_LIMIT) this.feed.shift();
    }
  }

  emit(snap, feedItem) {
    if (feedItem) {
      this.feed.push(feedItem);
      if (this.feed.length > FEED_LIMIT) this.feed.shift();
    }
    this.cb.onUpdate(snap, feedItem);
  }

  snapshot() {
    const agents = Array.from(this.agents.values()).map(t => Object.assign({}, t.snap));
    let tokens = 0;
    let costUsdSum = 0;
    for (const a of agents) {
      tokens += a.tokens.input + a.tokens.output + a.tokens.cacheRead + a.tokens.cacheWrite;
      costUsdSum += a.costUsd;
    }
    const totals = {
      agents: agents.length,
      tokens,
      costUsd: Number(costUsdSum.toFixed(4))
    };
    return {
      agents,
      totals,
      feed: this.feed.slice()
    };
  }
}

module.exports = { OfficeState };
