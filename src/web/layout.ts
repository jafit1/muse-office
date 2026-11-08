import type { AgentSnapshot } from '../shared/types.js';

export interface Point { x: number; y: number; }

const MARGIN = 110;
const SUB_RADIUS = 140;
/** below first, then sides — keeps subagent desks out of the neighbouring cluster's cell */
const SUB_ANGLES = [90, 180, 0, 135, 45];

/** Pure cluster layout: lead desks on a grid, subagents on a circle around their parent. */
export function layoutOffice(agents: AgentSnapshot[], width: number, height: number): Map<string, Point> {
  const pos = new Map<string, Point>();
  const mains = agents.filter((a) => !a.parentAgentId).sort((a, b) => a.startedAt - b.startedAt);
  let cols = Math.max(1, Math.ceil(Math.sqrt(mains.length)));
  let rows = Math.max(1, Math.ceil(mains.length / cols));
  // a row needs ~260px so a subagent desk below the parent never hits the next row
  const maxRows = Math.max(1, Math.floor((height - MARGIN * 2) / 260));
  if (rows > maxRows) {
    rows = maxRows;
    cols = Math.ceil(mains.length / rows);
  }
  const cellW = (width - MARGIN * 2) / cols;
  const cellH = (height - MARGIN * 2) / rows;

  mains.forEach((a, i) => {
    pos.set(a.agentId, {
      x: MARGIN + (i % cols) * cellW + cellW / 2,
      y: MARGIN + Math.floor(i / cols) * cellH + cellH / 2,
    });
  });

  const subCount = new Map<string, number>();
  for (const a of agents) {
    if (!a.parentAgentId) continue;
    const parent = pos.get(a.parentAgentId) ?? { x: width / 2, y: height / 2 };
    const n = subCount.get(a.parentAgentId) ?? 0;
    subCount.set(a.parentAgentId, n + 1);
    const angle = SUB_ANGLES[n % SUB_ANGLES.length] * (Math.PI / 180);
    pos.set(a.agentId, {
      x: Math.min(width - 40, Math.max(40, parent.x + Math.cos(angle) * SUB_RADIUS)),
      y: Math.min(height - 40, Math.max(40, parent.y + Math.sin(angle) * SUB_RADIUS)),
    });
  }
  return pos;
}
