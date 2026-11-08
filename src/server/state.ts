import type { AgentEvent, AgentSnapshot, AgentStatus, FeedItem, ToolKind, Totals } from '../shared/types.js';
import { costUsd } from './pricing.js';

export interface StateCallbacks {
  onUpdate(agent: AgentSnapshot, feedItem?: FeedItem): void;
  onLeft(agentId: string): void;
}
export interface Thresholds { waitingMs: number; sleepMs: number; leaveMs: number; }

const DEFAULTS: Thresholds = { waitingMs: 10_000, sleepMs: 5 * 60_000, leaveMs: 15 * 60_000 };

const TOOL_STATUS: Record<ToolKind, AgentStatus> = {
  read: 'reading', edit: 'editing', bash: 'running', web: 'browsing', task: 'thinking', other: 'working',
};
const TOOL_ICON: Record<ToolKind, string> = {
  read: '📄', edit: '⌨️', bash: '🖥️', web: '🌐', task: '🚪', other: '🔧',
};
const FEED_LIMIT = 50;

interface Tracked { snap: AgentSnapshot; pendingToolTs?: number; }

export class OfficeState {
  private agents = new Map<string, Tracked>();
  private feed: FeedItem[] = [];
  private th: Thresholds;
  /** Remembered identities so an agent that left can re-enter on new activity. */
  private meta = new Map<string, { label: string; projectDir: string; parentAgentId?: string }>();

  constructor(private cb: StateCallbacks, thresholds?: Partial<Thresholds>) {
    this.th = { ...DEFAULTS, ...thresholds };
  }

  ingest(e: AgentEvent): void {
    if (e.kind === 'session_started') {
      this.meta.set(e.agentId, { label: e.label, projectDir: e.projectDir, parentAgentId: e.parentAgentId });
      const existing = this.agents.get(e.agentId);
      if (existing) {
        // label upgrade for an agent already in the office — no respawn
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
      // agent left earlier (or catch-up raced) — re-enter if we know who this is
      if (!this.meta.has(e.agentId)) return;
      t = this.spawn(e.agentId, e.sessionId, e.ts);
    }
    t.snap.lastActivityAt = e.ts;

    switch (e.kind) {
      case 'tool_call':
        t.snap.status = TOOL_STATUS[e.tool];
        t.snap.detail = e.detail;
        t.pendingToolTs = e.ts;
        this.emit(t.snap, { ts: e.ts, agentId: e.agentId, icon: TOOL_ICON[e.tool], text: `${e.toolName} ${e.detail}`.trim() });
        break;
      case 'tool_result':
        t.pendingToolTs = undefined;
        t.snap.status = e.isError ? 'error' : 'thinking';
        this.emit(t.snap, e.isError ? { ts: e.ts, agentId: e.agentId, icon: '❗', text: 'tool failed' } : undefined);
        break;
      case 'thinking':
        t.snap.status = 'thinking';
        this.emit(t.snap);
        break;
      case 'usage': {
        const u = t.snap.tokens;
        u.input += e.usage.input; u.output += e.usage.output;
        u.cacheRead += e.usage.cacheRead; u.cacheWrite += e.usage.cacheWrite;
        t.snap.costUsd += costUsd(e.model, e.usage);
        t.snap.model = e.model;
        this.emit(t.snap);
        break;
      }
    }
  }

  tick(now: number): void {
    for (const [id, t] of this.agents) {
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
        this.emit(t.snap, { ts: now, agentId: id, icon: '☕', text: 'waiting for permission' });
      }
    }
  }

  /** Drop an agent immediately (hired session stopped/finished). */
  remove(agentId: string): void {
    const t = this.agents.get(agentId);
    if (!t) return;
    t.snap.status = 'leaving';
    this.emit(t.snap);
    this.agents.delete(agentId);
    this.cb.onLeft(agentId);
  }

  /** Push a plain feed line tied to an agent (chat messages, hire notices). */
  note(agentId: string, icon: string, text: string): void {
    const t = this.agents.get(agentId);
    const ts = Date.now();
    if (t) this.emit(t.snap, { ts, agentId, icon, text });
    else {
      this.feed.push({ ts, agentId, icon, text });
      if (this.feed.length > FEED_LIMIT) this.feed.shift();
    }
  }

  snapshot(): { agents: AgentSnapshot[]; totals: Totals; feed: FeedItem[] } {
    return { agents: [...this.agents.values()].map((t) => t.snap), totals: this.totals(), feed: this.feed };
  }

  private totals(): Totals {
    let tokens = 0; let cost = 0;
    for (const { snap } of this.agents.values()) {
      tokens += snap.tokens.input + snap.tokens.output + snap.tokens.cacheRead + snap.tokens.cacheWrite;
      cost += snap.costUsd;
    }
    return { agents: this.agents.size, tokens, costUsd: cost };
  }

  private spawn(agentId: string, sessionId: string, ts: number): Tracked {
    const m = this.meta.get(agentId)!;
    const snap: AgentSnapshot = {
      agentId, parentAgentId: m.parentAgentId, sessionId,
      projectDir: m.projectDir, label: m.label, status: 'entering', detail: '',
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0,
      startedAt: ts, lastActivityAt: ts,
    };
    const t: Tracked = { snap };
    this.agents.set(agentId, t);
    this.emit(snap, { ts, agentId, icon: '🚪', text: `${snap.label} entered` });
    return t;
  }

  private emit(snap: AgentSnapshot, feedItem?: FeedItem): void {
    if (feedItem) {
      this.feed.push(feedItem);
      if (this.feed.length > FEED_LIMIT) this.feed.shift();
    }
    this.cb.onUpdate(snap, feedItem);
  }
}
