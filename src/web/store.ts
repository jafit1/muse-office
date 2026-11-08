import type { AgentSnapshot, ChatMsg, FeedItem, PermissionRequest, RoleInfo, ServerMessage, Totals } from '../shared/types.js';

export interface OfficeStore {
  agents: Map<string, AgentSnapshot>;
  totals: Totals;
  feed: FeedItem[];
  perAgent: Map<string, FeedItem[]>;
  roles: RoleInfo[];
  permissions: Map<string, PermissionRequest>;
  chats: Map<string, ChatMsg[]>;
  selectedId?: string;
}

export function createStore(): OfficeStore {
  return {
    agents: new Map(), totals: { agents: 0, tokens: 0, costUsd: 0 },
    feed: [], perAgent: new Map(), roles: [], permissions: new Map(), chats: new Map(),
  };
}

export function applyMessage(store: OfficeStore, msg: ServerMessage): void {
  switch (msg.type) {
    case 'snapshot':
      store.totals = msg.totals;
      store.agents = new Map(msg.agents.map((a) => [a.agentId, a]));
      store.feed = [...msg.feed];
      store.roles = msg.roles;
      store.permissions = new Map(msg.permissions.map((p) => [p.requestId, p]));
      store.chats = new Map(Object.entries(msg.chats));
      break;
    case 'chat': {
      const log = store.chats.get(msg.agentId) ?? [];
      log.push(msg.msg);
      if (log.length > 60) log.shift();
      store.chats.set(msg.agentId, log);
      break;
    }
    case 'update':
      store.totals = msg.totals;
      store.agents.set(msg.agent.agentId, msg.agent);
      if (msg.feedItem) {
        store.feed.push(msg.feedItem);
        if (store.feed.length > 50) store.feed.shift();
        const per = store.perAgent.get(msg.agent.agentId) ?? [];
        per.push(msg.feedItem);
        if (per.length > 30) per.shift();
        store.perAgent.set(msg.agent.agentId, per);
      }
      break;
    case 'agent_left':
      store.totals = msg.totals;
      store.agents.delete(msg.agentId);
      store.perAgent.delete(msg.agentId);
      store.chats.delete(msg.agentId);
      for (const [id, p] of store.permissions) if (p.agentId === msg.agentId) store.permissions.delete(id);
      if (store.selectedId === msg.agentId) store.selectedId = undefined;
      break;
    case 'permission_request':
      store.permissions.set(msg.request.requestId, msg.request);
      break;
    case 'permission_resolved':
      store.permissions.delete(msg.requestId);
      break;
    case 'error':
      store.feed.push({ ts: Date.now(), agentId: '', icon: '⚠️', text: msg.message });
      break;
  }
}
