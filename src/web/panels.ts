import type { OfficeStore } from './store.js';
import { STATUS_LABEL, formatTokens, formatUsd } from './format.js';
import { charAvatarDataURL, shirtFor } from './sprites.js';
import type { AgentSnapshot, AgentStatus, ClientMessage, HireMode, HireModel } from '../shared/types.js';

type Send = (msg: ClientMessage) => void;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const DOT: Partial<Record<AgentStatus, string>> = { error: 'status-err', waiting: 'status-warn', sleeping: 'status-warn' };
const totalTokens = (a: AgentSnapshot) => a.tokens.input + a.tokens.output + a.tokens.cacheRead + a.tokens.cacheWrite;

function modelChip(model?: string): string {
  if (!model) return '';
  const fam = ['opus', 'sonnet', 'haiku', 'fable'].find((f) => model.includes(f)) ?? 'other';
  const short = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  return `<span class="model ${fam}">${esc(short)}</span>`;
}

const hhmm = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function formatChat(text: string): string {
  let s = esc(text);
  // Code block with backticks
  s = s.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<div style="margin:6px 0;background:#0d0b09;border:1px solid #3d3122;border-radius:4px;overflow:hidden"><div style="padding:2px 8px;background:#1b1610;font-size:9px;color:#ffd88a;font-family:var(--pixel)">${lang || 'CODE'}</div><pre style="padding:6px 8px;margin:0;font-size:11px;overflow-x:auto;color:#ecdcbc"><code>${code}</code></pre></div>`;
  });
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code style="background:#0d0b09;border:1px solid #3d3122;padding:1px 4px;border-radius:3px;color:#7ee08a">$1</code>');
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b style="color:#ffd88a">$1</b>');
  return s;
}

export function renderPanels(store: OfficeStore, onSelect: (id?: string) => void, send: Send): void {
  // don't rebuild the rail while the hire dialog is open — it would steal clicks/typing
  if (($('#hire-modal') as HTMLDialogElement).open) return;

  $('#totals').innerHTML = `
    <span class="chip">👥 <b>${store.totals.agents}</b> agents</span>
    <span class="chip">🔤 <b>${formatTokens(store.totals.tokens)}</b> tok</span>
    <span class="chip">💰 <b>${formatUsd(store.totals.costUsd)}</b> today</span>`;

  renderToasts(store, send);

  const detail = $('#detail'); const list = $('#list-view');
  const sel = store.selectedId ? store.agents.get(store.selectedId) : undefined;
  detail.hidden = !sel; list.hidden = !!sel;
  if (sel) { renderDetail(detail, sel, store, onSelect, send); return; }

  const agents = [...store.agents.values()];
  $('#agents').innerHTML = `<li class="hire" id="hire-btn">➕ &nbsp;HIRE AGENT</li>` + (agents.length === 0
    ? `<div class="rail-empty"><img src="${charAvatarDataURL('#6b5d4b', 4)}" alt="">nobody's in yet —<br>run Claude Code or hire someone</div>`
    : agents.map((a) => `
    <li data-id="${esc(a.agentId)}" class="${store.selectedId === a.agentId ? 'selected' : ''}">
      <img class="avatar" src="${charAvatarDataURL(shirtFor(a.agentId), 4)}" alt="">
      <span class="body">
        <div class="name"><span class="dot ${DOT[a.status] ?? 'status-ok'}"></span>${esc(a.label)}${a.parentAgentId ? ' <span class="sub-tag">sub</span>' : ''}${a.controllable ? '' : ' <span class="sub-tag">👁 observed</span>'}</div>
        <div class="meta">${STATUS_LABEL[a.status]} ${modelChip(a.model)}</div>
      </span>
      <span class="nums"><div>${formatTokens(totalTokens(a))}</div><div class="cost">${formatUsd(a.costUsd)}</div></span>
    </li>`).join(''));
  $('#agents').querySelectorAll('li[data-id]').forEach((li) =>
    (li as HTMLElement).addEventListener('click', () => onSelect((li as HTMLElement).dataset.id)));
  $('#hire-btn')?.addEventListener('click', () => openHireModal(store, send));

  $('#feed').innerHTML = [...store.feed].reverse().slice(0, 30).map((f) =>
    `<li><span class="t">${hhmm(f.ts)}</span><span>${f.icon} ${esc(f.text)}</span></li>`).join('');
}

function renderDetail(el: HTMLElement, a: AgentSnapshot, store: OfficeStore, onSelect: (id?: string) => void, send: Send): void {
  const events = store.perAgent.get(a.agentId) ?? [];
  const chat = store.chats.get(a.agentId) ?? [];

  // survive re-renders: keep whatever the user is typing
  const active = document.activeElement as HTMLInputElement | null;
  const keepTyping = active?.id === 'chat-input' ? { value: active.value, pos: active.selectionStart ?? 0 } : null;

  el.innerHTML = `
    <span class="back">← ALL AGENTS</span>
    <div class="head">
      <img src="${charAvatarDataURL(shirtFor(a.agentId), 6)}" alt="">
      <div>
        <div class="title">${esc(a.label)}${a.parentAgentId ? ' <span class="sub-tag">sub</span>' : ''}</div>
        <div class="meta" style="margin-top:6px">${modelChip(a.model)} ${a.controllable ? '' : '<span class="sub-tag">👁 observed session — read-only</span>'}</div>
      </div>
    </div>
    ${a.controllable ? `
    <div class="chatlog" id="chatlog">${chat.length === 0
      ? '<div class="chat-empty">no messages yet</div>'
      : chat.map((m) => `<div class="msg ${m.who}">${formatChat(m.text)}</div>`).join('')}</div>
    <div class="chat">
      <input id="chat-input" placeholder="Tell them something…" autocomplete="off">
      <button id="chat-send" title="Send">➤</button>
      <button id="agent-stop" title="Stop and dismiss this agent">🛑</button>
    </div>` : ''}
    <dl>
      <dt>status</dt><dd>${STATUS_LABEL[a.status]}</dd>
      <dt>doing</dt><dd>${esc(a.detail || '—')}</dd>
      <dt>project</dt><dd>${esc(a.projectDir)}</dd>
      <dt>tokens</dt><dd>${formatTokens(totalTokens(a))} · ${formatUsd(a.costUsd)}</dd>
      <dt>uptime</dt><dd>${Math.max(0, Math.round((a.lastActivityAt - a.startedAt) / 60_000))}m</dd>
    </dl>
    <h2>Recent</h2>
    <ul id="feed">${[...events].reverse().map((f) => `<li><span class="t">${hhmm(f.ts)}</span><span>${f.icon} ${esc(f.text)}</span></li>`).join('')}</ul>`;
  el.querySelector('.back')!.addEventListener('click', () => onSelect(undefined));

  if (a.controllable) {
    const input = el.querySelector('#chat-input') as HTMLInputElement;
    const log = el.querySelector('#chatlog') as HTMLElement;
    log.scrollTop = log.scrollHeight;
    if (keepTyping) {
      input.value = keepTyping.value;
      input.focus();
      input.setSelectionRange(keepTyping.pos, keepTyping.pos);
    }
    const submit = () => {
      const text = input.value.trim();
      if (!text) return;
      send({ type: 'say', agentId: a.agentId, text });
      input.value = '';
    };
    el.querySelector('#chat-send')!.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') submit(); });
    el.querySelector('#agent-stop')!.addEventListener('click', () => {
      send({ type: 'stop', agentId: a.agentId });
      onSelect(undefined);
    });
  }
}

function renderToasts(store: OfficeStore, send: Send): void {
  const box = $('#toasts');
  const reqs = [...store.permissions.values()];
  box.innerHTML = reqs.map((r) => {
    const agent = store.agents.get(r.agentId);
    return `
    <div class="toast" data-req="${esc(r.requestId)}" data-agent="${esc(r.agentId)}">
      <div class="toast-title">☕ ${esc(agent?.label ?? 'agent')} asks:</div>
      <div class="toast-body"><b>${esc(r.toolName)}</b> ${esc(r.detail)}</div>
      <div class="toast-actions">
        <button class="allow">ALLOW</button>
        <button class="deny">DENY</button>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('.toast').forEach((t) => {
    const el = t as HTMLElement;
    const requestId = el.dataset.req!;
    const agentId = el.dataset.agent!;
    el.querySelector('.allow')!.addEventListener('click', () => send({ type: 'permission', agentId, requestId, allow: true }));
    el.querySelector('.deny')!.addEventListener('click', () => send({ type: 'permission', agentId, requestId, allow: false }));
  });
}

const DEFAULT_CWD = '~/Desktop/vibeoffice-work';
let selectedRole = 'coder';
let selectedMode: HireMode = 'chat';
let selectedModel: HireModel = 'claude-opus-4-8';
let hireWired = false;

function paintRoles(store: OfficeStore): void {
  const grid = $('#role-grid');
  grid.innerHTML = store.roles.map((r) => `
    <button type="button" class="role ${r.id === selectedRole ? 'selected' : ''}" data-id="${esc(r.id)}">
      <span class="role-emoji">${r.emoji}</span>
      <span class="role-title">${esc(r.title)}</span>
      <span class="role-hint">${esc(r.hint)}</span>
    </button>`).join('');
}

function openHireModal(store: OfficeStore, send: Send): void {
  const dlg = $('#hire-modal') as HTMLDialogElement;
  const grid = $('#role-grid');
  const cwd = $('#hire-cwd') as HTMLInputElement;
  const task = $('#hire-task') as HTMLTextAreaElement;

  if (!store.roles.some((r) => r.id === selectedRole)) selectedRole = store.roles[0]?.id ?? 'coder';
  paintRoles(store);

  // folder suggestions = distinct project dirs of agents already in the office
  const dirs = [...new Set([...store.agents.values()].map((a) => a.projectDir).filter(Boolean))];
  ($('#cwd-list') as HTMLDataListElement).innerHTML =
    [DEFAULT_CWD, ...dirs].map((d) => `<option value="${esc(d)}">`).join('');
  cwd.value = DEFAULT_CWD;

  if (!hireWired) {
    hireWired = true;
    // event delegation — survives re-paints, one listener for all roles
    grid.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.role') as HTMLElement | null;
      if (!btn) return;
      selectedRole = btn.dataset.id!;
      grid.querySelectorAll('.role').forEach((el) =>
        el.classList.toggle('selected', (el as HTMLElement).dataset.id === selectedRole));
    });
    $('#mode-row').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.mode') as HTMLElement | null;
      if (!btn) return;
      selectedMode = btn.dataset.mode as HireMode;
      $('#mode-row').querySelectorAll('.mode').forEach((el) =>
        el.classList.toggle('selected', (el as HTMLElement).dataset.mode === selectedMode));
    });
    $('#model-row').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.mode') as HTMLElement | null;
      if (!btn) return;
      selectedModel = btn.dataset.model as HireModel;
      $('#model-row').querySelectorAll('.mode').forEach((el) =>
        el.classList.toggle('selected', (el as HTMLElement).dataset.model === selectedModel));
    });
    $('#hire-cancel').addEventListener('click', () => dlg.close());
    ($('#hire-form') as HTMLFormElement).addEventListener('submit', (e) => {
      e.preventDefault();
      const t = task.value.trim();
      if (!t) return;
      send({ type: 'hire', roleId: selectedRole, task: t, cwd: cwd.value.trim(), mode: selectedMode, model: selectedModel });
      task.value = '';
      dlg.close();
    });
  }

  dlg.showModal();
  setTimeout(() => task.focus(), 50);
}
