import { basename } from 'node:path';
import type { Adapter } from './types.js';
import type { AgentEvent, ToolKind, Usage } from '../../shared/types.js';

const TOOL_MAP: Record<string, ToolKind> = {
  Read: 'read', Grep: 'read', Glob: 'read',
  Edit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Bash: 'bash',
  WebSearch: 'web', WebFetch: 'web',
  Task: 'task', Agent: 'task',
};

interface EntryMeta { agentId: string; sidechain: boolean; }

export class ClaudeCodeAdapter implements Adapter {
  /** uuid -> meta, for resolving sidechain agent identity via parentUuid */
  private byUuid = new Map<string, EntryMeta>();
  private startedAgents = new Set<string>();
  private weakLabel = new Set<string>();

  /** A label worth showing: a real human prompt, not tool noise or command caveats. */
  private static isGoodLabel(text: string): boolean {
    const s = text.trim();
    return s.length >= 8 && !s.startsWith('<') && !/^caveat/i.test(s);
  }

  ingestLine(_filePath: string, line: string): AgentEvent[] {
    let entry: any;
    try { entry = JSON.parse(line); } catch { return []; }
    if (!entry || (entry.type !== 'assistant' && entry.type !== 'user')) return [];
    if (!entry.sessionId || !entry.uuid) return [];

    const ts = Date.parse(entry.timestamp) || Date.now();
    const sessionId: string = entry.sessionId;
    const agentId = this.resolveAgentId(entry);
    const events: AgentEvent[] = [];
    const content = entry.message?.content;

    const parentAgentId = agentId === sessionId ? undefined : sessionId;
    if (!this.startedAgents.has(agentId)) {
      this.startedAgents.add(agentId);
      const label = this.makeLabel(entry);
      if (!ClaudeCodeAdapter.isGoodLabel(label)) this.weakLabel.add(agentId);
      events.push({ kind: 'session_started', ts, sessionId, agentId, parentAgentId, projectDir: entry.cwd ?? '', label });
    } else if (
      this.weakLabel.has(agentId) && entry.type === 'user'
      && typeof content === 'string' && ClaudeCodeAdapter.isGoodLabel(content)
    ) {
      // upgrade a noise label (command output, caveat) to the first real human prompt
      this.weakLabel.delete(agentId);
      events.push({ kind: 'session_started', ts, sessionId, agentId, parentAgentId, projectDir: entry.cwd ?? '', label: content.trim().slice(0, 60) });
    }

    if (entry.type === 'assistant' && Array.isArray(content)) {
      let sawToolUse = false;
      for (const block of content) {
        if (block?.type === 'tool_use') {
          sawToolUse = true;
          events.push({
            kind: 'tool_call', ts, sessionId, agentId,
            tool: TOOL_MAP[block.name] ?? 'other',
            toolName: String(block.name ?? 'unknown'),
            toolUseId: String(block.id ?? ''),
            detail: this.makeDetail(block),
          });
        }
      }
      if (!sawToolUse) events.push({ kind: 'thinking', ts, sessionId, agentId });
      const u = entry.message?.usage;
      if (u) {
        const usage: Usage = {
          input: u.input_tokens ?? 0, output: u.output_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
        };
        events.push({ kind: 'usage', ts, sessionId, agentId, model: entry.message?.model ?? 'unknown', usage });
      }
    }

    if (entry.type === 'user' && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'tool_result') {
          events.push({
            kind: 'tool_result', ts, sessionId, agentId,
            toolUseId: String(block.tool_use_id ?? ''),
            isError: block.is_error === true,
          });
        }
      }
    }
    return events;
  }

  private resolveAgentId(entry: any): string {
    const sidechain = entry.isSidechain === true;
    let agentId: string;
    if (!sidechain) {
      agentId = entry.sessionId;
    } else {
      const parent = entry.parentUuid ? this.byUuid.get(entry.parentUuid) : undefined;
      // Inherit from a sidechain parent; a non-sidechain parent means this uuid roots a new subagent.
      agentId = parent?.sidechain ? parent.agentId : `${entry.sessionId}:${entry.uuid}`;
    }
    this.byUuid.set(entry.uuid, { agentId, sidechain });
    if (this.byUuid.size > 60_000) {
      // long-running server: drop the oldest third; parent links that old are long resolved
      let n = 20_000;
      for (const k of this.byUuid.keys()) { this.byUuid.delete(k); if (--n === 0) break; }
    }
    return agentId;
  }

  private makeLabel(entry: any): string {
    const c = entry.message?.content;
    const text = typeof c === 'string' ? c : '';
    return (text.trim() || basename(entry.cwd ?? '') || entry.sessionId).slice(0, 60);
  }

  private makeDetail(block: any): string {
    const input = block.input ?? {};
    const raw = input.file_path ?? input.path ?? input.command ?? input.pattern
      ?? input.description ?? input.prompt ?? input.url ?? input.query ?? '';
    const s = String(raw);
    // Keep paths short: show the last two segments (both / and \ separators).
    return (/[\\/]/.test(s) ? s.split(/[\\/]/).slice(-2).join('/') : s).slice(0, 80);
  }
}
