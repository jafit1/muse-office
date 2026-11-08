import type { AgentStatus } from '../shared/types.js';

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  entering: '🚪 arriving', working: '🔧 working', reading: '📄 reading files',
  editing: '⌨️ typing code', running: '🖥️ running commands', browsing: '🌐 browsing the web',
  thinking: '💭 thinking', waiting: '☕ waiting for permission', error: '❗ hit an error',
  sleeping: '💤 sleeping', leaving: '👋 leaving',
};
