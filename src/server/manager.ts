import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, HireMode, HireModel, PermissionRequest, ToolKind, Usage } from '../shared/types.js';
import { roleById, type AgentRole } from './roles.js';

const CHAT_FIRST_APPEND = `

IMPORTANT: The user hired you in "chat first" mode. Begin by discussing the task: ask clarifying questions, propose an approach, think out loud with them. Keep replies short and conversational. Do NOT use any tools or start implementing until the user explicitly tells you to start (e.g. "go", "start", "делай", "поехали").`;

const TOOL_MAP: Record<string, ToolKind> = {
  Read: 'read', Grep: 'read', Glob: 'read',
  Edit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Bash: 'bash',
  WebSearch: 'web', WebFetch: 'web',
  Task: 'task', Agent: 'task',
};

export interface ManagerCallbacks {
  onEvent(e: AgentEvent): void;
  onPermission(req: PermissionRequest): void;
  onPermissionResolved(agentId: string, requestId: string): void;
  onChat(agentId: string, text: string): void;
  onGone(agentId: string): void;
}

interface Hired {
  agentId: string;
  role: AgentRole;
  cwd: string;
  push(text: string): void;
  interrupt(): Promise<void>;
  pending: Map<string, (allow: boolean) => void>;
  subs: Set<string>;
  dead?: boolean;
}

/** Spawns and drives Claude sessions hired from the office UI. */
export class SessionManager {
  private hired = new Map<string, Hired>();
  /** real Claude session ids of hired agents — the log watcher must skip these to avoid doubles */
  private sdkSessionIds = new Set<string>();
  private regFile = join(homedir(), '.vibeoffice', 'hired-sessions.json');

  constructor(private cb: ManagerCallbacks) {
    // remember hired sessions across restarts, or their logs come back as ghost "observed" agents
    try {
      for (const id of JSON.parse(readFileSync(this.regFile, 'utf8'))) this.sdkSessionIds.add(String(id));
    } catch { /* first run */ }
  }

  private persistIds(): void {
    try {
      mkdirSync(join(homedir(), '.vibeoffice'), { recursive: true });
      writeFileSync(this.regFile, JSON.stringify([...this.sdkSessionIds].slice(-300)));
    } catch { /* non-fatal */ }
  }

  isSdkSession(sessionId: string): boolean {
    return this.sdkSessionIds.has(sessionId);
  }

  has(agentId: string): boolean {
    const base = agentId.split(':')[0];
    return this.hired.has(base);
  }

  roleEmoji(agentId: string): string | undefined {
    return this.hired.get(agentId.split(':')[0])?.role.emoji;
  }

  hire(roleId: string, task: string, cwdRaw: string, mode: HireMode = 'approve', model?: HireModel): string {
    const role = roleById(roleId);
    if (!role) throw new Error(`unknown role: ${roleId}`);
    const cwd = this.resolveCwd(cwdRaw);
    mkdirSync(cwd, { recursive: true });

    const agentId = `hired-${randomUUID().slice(0, 8)}`;
    const queue: string[] = [];
    let wake: (() => void) | null = null;

    const userMessages = async function* () {
      yield makeUserMessage(task);
      while (true) {
        while (queue.length === 0) await new Promise<void>((r) => { wake = r; });
        yield makeUserMessage(queue.shift()!);
      }
    };

    const hired: Hired = {
      agentId, role, cwd,
      push: (text) => { queue.push(text); wake?.(); wake = null; },
      interrupt: async () => { await q.interrupt(); },
      pending: new Map(),
      subs: new Set(),
    };
    this.hired.set(agentId, hired);

    const append = role.systemPrompt + (mode === 'chat' ? CHAT_FIRST_APPEND : '');
    const canUseTool = async (toolName: string, input: Record<string, unknown>) => {
      const requestId = randomUUID().slice(0, 8);
      const allow = await new Promise<boolean>((resolve) => {
        hired.pending.set(requestId, resolve);
        this.cb.onPermission({ agentId, requestId, toolName, detail: previewInput(input) });
      });
      this.cb.onPermissionResolved(agentId, requestId);
      hired.pending.delete(requestId);
      return allow
        ? { behavior: 'allow' as const, updatedInput: input }
        : { behavior: 'deny' as const, message: 'Denied from the office.' };
    };

    const q = query({
      prompt: userMessages(),
      options: {
        cwd,
        ...(model ? { model } : {}),
        systemPrompt: { type: 'preset', preset: 'claude_code', append },
        ...(mode === 'auto'
          ? { permissionMode: 'bypassPermissions' as const }
          : { permissionMode: 'default' as const, canUseTool }),
      },
    });

    this.cb.onEvent({
      kind: 'session_started', ts: Date.now(), sessionId: agentId, agentId,
      projectDir: cwd, label: `${role.emoji} ${task.slice(0, 52)}`,
    });

    void this.pump(hired, q);
    return agentId;
  }

  say(agentId: string, text: string): void {
    this.hired.get(agentId)?.push(text);
  }

  async stop(agentId: string): Promise<void> {
    const h = this.hired.get(agentId);
    if (!h) return;
    for (const resolve of h.pending.values()) resolve(false);
    try { await h.interrupt(); } catch { /* already gone */ }
    this.dispose(h);
  }

  resolvePermission(agentId: string, requestId: string, allow: boolean): void {
    this.hired.get(agentId)?.pending.get(requestId)?.(allow);
  }

  /** Convert SDK messages into office events. */
  private async pump(h: Hired, q: AsyncIterable<any>): Promise<void> {
    try {
      for await (const msg of q) {
        if (h.dead) break; // stopped from the office — drop trailing messages
        if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
          this.sdkSessionIds.add(String(msg.session_id));
          this.persistIds();
        }
        const ts = Date.now();
        const agentId = this.routeAgentId(h, msg, ts);
        if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
          let sawTool = false;
          for (const block of msg.message.content) {
            if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() && !msg.parent_tool_use_id) {
              this.cb.onChat(h.agentId, block.text.trim());
            }
            if (block?.type === 'tool_use') {
              sawTool = true;
              this.cb.onEvent({
                kind: 'tool_call', ts, sessionId: h.agentId, agentId,
                tool: TOOL_MAP[block.name] ?? 'other', toolName: String(block.name),
                toolUseId: String(block.id ?? ''), detail: previewInput(block.input ?? {}),
              });
            }
          }
          if (!sawTool) this.cb.onEvent({ kind: 'thinking', ts, sessionId: h.agentId, agentId });
          const u = msg.message?.usage;
          if (u) {
            const usage: Usage = {
              input: u.input_tokens ?? 0, output: u.output_tokens ?? 0,
              cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
            };
            this.cb.onEvent({ kind: 'usage', ts, sessionId: h.agentId, agentId, model: msg.message?.model ?? 'unknown', usage });
          }
        } else if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block?.type === 'tool_result') {
              this.cb.onEvent({
                kind: 'tool_result', ts, sessionId: h.agentId, agentId,
                toolUseId: String(block.tool_use_id ?? ''), isError: block.is_error === true,
              });
            }
          }
        } else if (msg.type === 'result') {
          // turn finished — the agent idles at the desk awaiting the next chat message
          this.cb.onEvent({ kind: 'thinking', ts, sessionId: h.agentId, agentId: h.agentId });
        }
      }
    } catch (err) {
      console.error(`[office] hired agent ${h.agentId} crashed:`, err instanceof Error ? err.message : err);
    } finally {
      this.dispose(h);
    }
  }

  /** Task-tool subagents inside a hired session get their own puppet. */
  private routeAgentId(h: Hired, msg: any, ts: number): string {
    const parent = msg.parent_tool_use_id;
    if (!parent) return h.agentId;
    const subId = `${h.agentId}:${parent}`;
    if (!h.subs.has(subId)) {
      h.subs.add(subId);
      this.cb.onEvent({
        kind: 'session_started', ts, sessionId: h.agentId, agentId: subId,
        parentAgentId: h.agentId, projectDir: h.cwd, label: 'subtask',
      });
    }
    return subId;
  }

  private dispose(h: Hired): void {
    h.dead = true;
    if (!this.hired.delete(h.agentId)) return;
    this.cb.onGone(h.agentId);
    for (const sub of h.subs) this.cb.onGone(sub);
  }

  private resolveCwd(raw: string): string {
    const s = (raw || '').trim() || join(homedir(), 'Desktop', 'vibeoffice-work');
    const expanded = s.startsWith('~') ? join(homedir(), s.slice(1)) : s;
    return isAbsolute(expanded) ? expanded : join(homedir(), expanded);
  }
}

function makeUserMessage(text: string): any {
  return { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, parent_tool_use_id: null, session_id: '' };
}

function previewInput(input: Record<string, unknown>): string {
  const raw = input.file_path ?? input.path ?? input.command ?? input.pattern
    ?? input.description ?? input.prompt ?? input.url ?? input.query ?? JSON.stringify(input);
  const s = String(raw);
  return (/[\\/]/.test(s) && !s.startsWith('{') ? s.split(/[\\/]/).slice(-2).join('/') : s).slice(0, 120);
}
