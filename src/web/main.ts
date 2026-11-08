import '@fontsource/press-start-2p';
import { createStore, applyMessage } from './store.js';
import { renderPanels } from './panels.js';
import { createScene, type Scene } from './scene.js';
import { charAvatarDataURL } from './sprites.js';
import type { ClientMessage, ServerMessage } from '../shared/types.js';

const store = createStore();
let scene: Scene | null = null;
let socket: WebSocket | null = null;

const send = (msg: ClientMessage) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
};
const onSelect = (id?: string) => { store.selectedId = id; render(); };
const render = () => { renderPanels(store, onSelect, send); scene?.sync(store); };

(document.getElementById('logo-img') as HTMLImageElement).src = charAvatarDataURL('#c96a4a', 2);

createScene(document.getElementById('scene')!, onSelect).then((s) => { scene = s; render(); });

function refreshAuth(): void {
  fetch('/api/antigravity/status')
    .then(r => r.json())
    .then(s => {
      const statusEl = document.getElementById('authStatus');
      const btnEl = document.getElementById('authButton') as HTMLAnchorElement;
      if (!statusEl || !btnEl) return;
      if (s.connected) {
        statusEl.textContent = `Antigravity: ${s.email || 'connected'}`;
        btnEl.textContent = 'CONNECTED';
        btnEl.classList.add('connected');
        btnEl.removeAttribute('href');
      } else {
        statusEl.textContent = 'Antigravity: belum login';
        btnEl.textContent = 'LOGIN GOOGLE';
        btnEl.classList.remove('connected');
        btnEl.href = '/api/auth/antigravity/start';
      }
    })
    .catch(() => {});
}
refreshAuth();

const conn = document.getElementById('conn')!;
function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  socket = ws;
  ws.onopen = () => { conn.classList.remove('show'); refreshAuth(); };
  ws.onmessage = (ev) => { applyMessage(store, JSON.parse(ev.data) as ServerMessage); render(); };
  ws.onclose = () => { conn.classList.add('show'); setTimeout(connect, 1000); };
}
connect();
render();
