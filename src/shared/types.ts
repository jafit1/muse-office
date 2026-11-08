export type ToolKind = 'read' | 'edit' | 'bash' | 'web' | 'task' | 'other';

export type AgentStatus =
  | 'entering' | 'working' | 'reading' | 'editing' | 'running' | 'browsing'
  | 'thinking' | 'waiting' | 'error' | 'sleeping' | 'leaving';

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type AgentEvent =
  | { kind: 'session_started'; ts: number; sessionId: string; agentId: string; parentAgentId?: string; projectDir: string; label: string }
  | { kind: 'tool_call'; ts: number; sessionId: string; agentId: string; tool: ToolKind; toolName: string; toolUseId: string; detail: string }
  | { kind: 'tool_result'; ts: number; sessionId: string; agentId: string; toolUseId: string; isError: boolean }
  | { kind: 'thinking'; ts: number; sessionId: string; agentId: string }
  | { kind: 'usage'; ts: number; sessionId: string; agentId: string; model: string; usage: Usage };

export interface AgentSnapshot {
  agentId: string;
  parentAgentId?: string;
  sessionId: string;
  projectDir: string;
  label: string;
  model?: string;
  status: AgentStatus;
  detail: string;
  tokens: Usage;
  costUsd: number;
  startedAt: number;
  lastActivityAt: number;
  /** true for agents hired from the office — they accept chat/stop/permissions */
  controllable?: boolean;
  /** role emoji for hired agents (📊, 📝, …) */
  roleEmoji?: string;
}

export interface RoleInfo {
  id: string;
  title: string;
  emoji: string;
  hint: string;
}

export interface PermissionRequest {
  agentId: string;
  requestId: string;
  toolName: string;
  detail: string;
}

export type HireMode = 'chat' | 'approve' | 'auto';

/** Models offered in the hire modal. Values are exact Claude model IDs passed to the Agent SDK. */
export type HireModel =
  | 'gemini-3.8-flash'
  | 'gemini-3.8-flash-high'
  | 'gemini-4-argon'
  | 'claude-sonnet-5'
  | 'claude-opus-5'
  | 'gemini-2.5-pro'
  | 'gemini-3-flash';

export interface ChatMsg {
  ts: number;
  who: 'you' | 'agent';
  text: string;
}

export interface Totals {
  agents: number;
  tokens: number;
  costUsd: number;
}

export interface FeedItem {
  ts: number;
  agentId: string;
  icon: string;
  text: string;
}

export type ServerMessage =
  | { type: 'snapshot'; agents: AgentSnapshot[]; totals: Totals; feed: FeedItem[]; roles: RoleInfo[]; permissions: PermissionRequest[]; chats: Record<string, ChatMsg[]> }
  | { type: 'update'; agent: AgentSnapshot; totals: Totals; feedItem?: FeedItem }
  | { type: 'agent_left'; agentId: string; totals: Totals }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'permission_resolved'; agentId: string; requestId: string }
  | { type: 'chat'; agentId: string; msg: ChatMsg }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'hire'; roleId: string; task: string; cwd: string; mode: HireMode; model?: HireModel }
  | { type: 'say'; agentId: string; text: string; model?: string }
  | { type: 'stop'; agentId: string }
  | { type: 'permission'; agentId: string; requestId: string; allow: boolean };
