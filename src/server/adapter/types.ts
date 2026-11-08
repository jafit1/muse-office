import type { AgentEvent } from '../../shared/types.js';

/** Boundary for log-format adapters (Claude Code now; Codex/Gemini in v2). */
export interface Adapter {
  /** Feed one raw log line. Returns zero or more normalized events. MUST never throw. */
  ingestLine(filePath: string, line: string): AgentEvent[];
}
