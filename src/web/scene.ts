import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { OfficeStore } from './store.js';
import type { AgentSnapshot, AgentStatus } from '../shared/types.js';
import { layoutOffice } from './layout.js';
import {
  charTexture, catTexture, deskTexture, plantTexture, coffeeMachineTexture,
  printerTexture, couchTexture, waterCoolerTexture, bookshelfTexture,
  lowTableTexture, fridgeTexture, whiteboardTexture, serverRackTexture,
  boxTexture, pizzaTexture, lampTexture, shirtFor, type CharPose,
} from './sprites.js';

const SCALE = 3;
const SEAT = { x: 0, y: 44 };
const STATUS_EMOJI: Partial<Record<AgentStatus, string>> = {
  reading: '📄', running: '🖥️', browsing: '🌐', thinking: '💭',
  waiting: '☕', error: '❗', sleeping: '💤', entering: '👋', leaving: '👋',
};
const NPC_SHIRTS = ['#8a8a96', '#6b7a5a'];
const CONFETTI = [0xffd88a, 0x7ee08a, 0x8ab8f0, 0xe07a7a, 0xc9a0e0];

interface Puppet {
  root: Container; char: Sprite; bubble: Text; label: Text; fileTag: Text;
  chip: Graphics; ring: Graphics; overlay: Graphics; charShadow: Graphics; bubbleBg: Graphics;
  status: AgentStatus; shirt: string; detail: string;
  target: { x: number; y: number }; seatIdx: number; introUntil: number;
}

type NpcRole = 'worker' | 'courier' | 'cleaner';
interface Npc {
  root: Container; char: Sprite; bubble: Text; bubbleBg: Graphics; carry: Sprite | null;
  shirt: string; role: NpcRole;
  target: { x: number; y: number }; pauseUntil: number; nextJobAt: number;
  poi: 'floor' | 'printer' | 'cooler' | 'couch' | 'chat' | 'water' | 'gawk' | 'phone' | 'deliver' | 'mop' | 'exit' | 'lunch';
  couchSeat?: number; mopLeg?: number; dwelled?: boolean;
}

interface Fly { spr: Container; from: { x: number; y: number }; to: { x: number; y: number }; t0: number; dur: number; arc: number; onDone?: () => void; }
interface Confetto { x: number; y: number; vx: number; vy: number; color: number; t0: number; }

export interface Scene { sync(store: OfficeStore): void; }

export async function createScene(el: HTMLElement, onSelect: (id?: string) => void): Promise<Scene> {
  const app = new Application();
  await app.init({ background: '#c9a876', resizeTo: el, antialias: false, roundPixels: true });
  el.appendChild(app.canvas);

  const floor = new Graphics();
  const skyFx = new Graphics();   // windows: sky, clouds, birds
  const winMask = new Graphics(); // clips sky/clouds to the window openings
  skyFx.mask = winMask;
  const decor = new Container();
  const lightFx = new Graphics(); // window light beams on the floor (under characters)
  const world = new Container();
  world.sortableChildren = true;
  const fx = new Graphics();      // steam, alarms, confetti, fish, LEDs, clock
  const nightFx = new Graphics(); // day/night + crunch dim
  app.stage.addChild(floor, skyFx, winMask, decor, lightFx, world, fx, nightFx);

  const puppets = new Map<string, Puppet>();
  let lastStore: OfficeStore | null = null;
  let emptyHint: Text | null = null;

  // POIs
  let machineSpot = { x: 0, y: 0 }, steamSpot = { x: 0, y: 0 };
  let printerSpot = { x: 0, y: 0 }, coolerSpot = { x: 0, y: 0 };
  let boardSpot = { x: 0, y: 0 }, phoneSpot = { x: 0, y: 0 }, doorSpot = { x: 0, y: 0 };
  let dropSpot = { x: 0, y: 0 }, tankRect = { x: 0, y: 0, w: 0, h: 0 };
  let rackPos = { x: 0, y: 0 }, clockPos = { x: 0, y: 0 }, tvRect = { x: 0, y: 0, w: 0, h: 0 };
  let lampPos = { x: 0, y: 0 };
  let loungeSeats: { x: number; y: number }[] = [];
  let plantSpots: { x: number; y: number }[] = [];
  let windows: { x: number; w: number }[] = [];

  let printer: Sprite | null = null;
  let whiteboard: Sprite | null = null;
  let pizza: Sprite | null = null;
  let printerBusyUntil = 0, bellUntil = 0, briefUntil = 0, phoneRingUntil = 0, nextPhoneAt = 20_000;
  let shipped = 0, donePile = 0;
  const boxes: Sprite[] = [];
  let wetSign: Text | null = null, wetUntil = 0;
  const flights: Fly[] = [];
  const confetti: Confetto[] = [];
  const tokenHist: number[] = [];
  let lastSample = 0, lastTokens = 0;

  function drawRoom(): void {
    const { width: w, height: h } = app.screen;
    floor.clear();
    floor.rect(0, 0, w, h).fill('#c9a876');
    const TILE = 26;
    for (let ty = 0; ty * TILE < h; ty++) {
      for (let tx = 0; tx * TILE < w; tx++) {
        if ((tx + ty) % 2 === 0) floor.rect(tx * TILE, ty * TILE, TILE, TILE).fill('#c4a271');
      }
    }
    for (let y = 0; y < h; y += TILE) floor.rect(0, y, w, 1).fill({ color: 0xb3936a, alpha: 0.55 });
    for (let x = 0; x < w; x += TILE) floor.rect(x, 0, 1, h).fill({ color: 0xb3936a, alpha: 0.55 });
    floor.rect(0, 0, w, 46).fill('#5a4632');
    floor.rect(0, 46, w, 4).fill('#3e3022');
    floor.rect(0, 50, w, 2).fill('#00000022');
    // door on the left wall edge, with a doormat
    doorSpot = { x: 26, y: h * 0.5 };
    floor.rect(0, h * 0.5 - 40, 10, 80).fill('#3e3022');
    floor.rect(2, h * 0.5 - 36, 7, 72).fill('#8a6642');
    floor.rect(2, h * 0.5 - 36, 7, 2).fill('#a37e54');
    floor.rect(2, h * 0.5 - 4, 7, 2).fill('#6e4f30');
    floor.circle(7.5, h * 0.5 + 2, 1.5).fill('#ffd88a');
    floor.roundRect(13, h * 0.5 - 15, 24, 30, 3).fill({ color: 0x7e3f44, alpha: 0.30 });
    floor.roundRect(15, h * 0.5 - 13, 20, 26, 2).stroke({ color: 0x5e2f34, alpha: 0.35, width: 1 });
    // window frames (sky drawn per-frame in skyFx, clipped by winMask)
    windows = [0, 1].map((i) => ({ x: w * (0.09 + i * 0.18), w: 62 }));
    winMask.clear();
    for (const win of windows) {
      floor.rect(win.x - 3, 4, win.w + 6, 38).fill('#3e3022');
      winMask.rect(win.x, 7, win.w, 32).fill(0xffffff);
    }
    // wall shelf with books, left of window 1
    floor.rect(12, 18, 44, 4).fill('#8a6642');
    floor.rect(12, 22, 44, 2).fill('#5e4228');
    ['#c96a4a', '#4a6a9a', '#7aa05a', '#e8c84a'].forEach((c, i) => floor.rect(16 + i * 9, 6, 6, 12).fill(c));
    // lounge rug
    floor.roundRect(w - 300, h - 190, 264, 158, 12).fill({ color: 0xa8555a, alpha: 0.22 });
    floor.roundRect(w - 292, h - 182, 248, 142, 10).stroke({ color: 0x7e3f44, alpha: 0.25, width: 2 });
    // work-zone rug under the desks (matches layoutOffice region in relayout())
    const rw = Math.max(w * 0.68, 340), rh = Math.max(h - 230, 220);
    floor.roundRect(64, 128, rw - 20, rh + 40, 14).fill({ color: 0x6a7a8e, alpha: 0.14 });
    floor.roundRect(72, 136, rw - 36, rh + 24, 12).stroke({ color: 0x4a5a6e, alpha: 0.20, width: 2 });

    for (const c of decor.removeChildren()) c.destroy(); // don't leak sprites on resize
    pizza = null;
    const add = (tex: ReturnType<typeof plantTexture>, x: number, y: number, scale = SCALE) => {
      const sh = new Graphics();
      sh.ellipse(x + (tex.width * scale) / 2, y + tex.height * scale - 1, tex.width * scale * 0.45, 4)
        .fill({ color: 0x1a120a, alpha: 0.20 });
      decor.addChild(sh);
      const s = new Sprite(tex); s.scale.set(scale); s.position.set(x, y); decor.addChild(s); return s;
    };
    // kitchen zone: pale tile patch + counter; machines stand on the counter line (y=80)
    const kx = w - 168;
    floor.rect(kx, 46, 168, 78).fill({ color: 0xd8cfc0, alpha: 0.45 });
    for (let x = kx; x < w; x += 13) floor.rect(x, 46, 1, 78).fill({ color: 0xb8ad9c, alpha: 0.5 });
    for (let y = 46; y < 124; y += 13) floor.rect(kx, y, 168, 1).fill({ color: 0xb8ad9c, alpha: 0.5 });
    floor.rect(kx + 6, 80, 150, 10).fill('#a37e54');
    floor.rect(kx + 6, 90, 150, 6).fill('#8a6642');
    floor.rect(kx + 6, 96, 150, 16).fill('#5e4228');
    for (const hx of [30, 70, 110]) floor.circle(kx + hx, 104, 1.5).fill('#ffd88a');
    add(coffeeMachineTexture(), w - 64, 56);
    add(fridgeTexture(), w - 164, 50);
    add(waterCoolerTexture(), w - 130, 50);
    coolerSpot = { x: w - 118, y: 118 };
    machineSpot = { x: w - 88, y: 112 };
    steamSpot = { x: w - 49, y: 58 };
    printer = add(printerTexture(false), 24, 60);
    printerSpot = { x: 52, y: 122 };
    dropSpot = { x: 96, y: 96 };
    add(bookshelfTexture(), w * 0.68, 20);
    whiteboard = add(whiteboardTexture(), w * 0.58, 62);
    boardSpot = { x: w * 0.58 + 20, y: 128 };
    // meeting corner: round table + two stools by the whiteboard
    const mtx = w * 0.58 + 28, mty = 150;
    floor.ellipse(mtx, mty + 26, 30, 12).fill({ color: 0x1a120a, alpha: 0.15 });
    floor.ellipse(mtx, mty + 20, 28, 12).fill('#5e4228');
    floor.ellipse(mtx, mty + 16, 28, 12).fill('#a37e54');
    floor.ellipse(mtx, mty + 15, 22, 9).fill('#8a6642');
    for (const sx of [-40, 40]) {
      floor.ellipse(mtx + sx, mty + 30, 10, 5).fill('#5e4228');
      floor.ellipse(mtx + sx, mty + 27, 10, 5).fill('#8a6642');
    }
    add(serverRackTexture(), 14, h - 150);
    rackPos = { x: 14, y: h - 150 };
    const couch = add(couchTexture(), w - 262, h - 178, 4); // the couch anchors the lounge — keep it big
    add(lowTableTexture(), w - 234, h - 106);
    add(lampTexture(), w - 296, h - 214);
    lampPos = { x: w - 296, y: h - 214 };
    loungeSeats = [0, 1, 2].map((i) => ({ x: w - 262 + 16 + i * 34, y: h - 146 }));
    // aquarium stands against the wall between bookshelf and kitchen — clearly water, not a TV
    // (narrowed to fit the gap now that the kitchen counter claims the last 168px of the wall)
    tankRect = { x: w - 227, y: 56, w: 52, h: 38 };
    floor.rect(tankRect.x - 4, tankRect.y - 2, tankRect.w + 8, tankRect.h + 8).fill('#3e3022');
    floor.rect(tankRect.x - 8, tankRect.y + tankRect.h + 6, tankRect.w + 16, 4).fill('#2a2118');
    floor.rect(tankRect.x, tankRect.y, tankRect.w, tankRect.h).fill('#2a6a8e');
    floor.rect(tankRect.x, tankRect.y, tankRect.w, 6).fill('#4a8aae');
    floor.rect(tankRect.x, tankRect.y + tankRect.h - 6, tankRect.w, 6).fill('#c9b072');
    floor.rect(tankRect.x + 8, tankRect.y + tankRect.h - 16, 3, 12).fill('#3a7a4a');
    floor.rect(tankRect.x + 13, tankRect.y + tankRect.h - 20, 3, 16).fill('#4a8a55');
    floor.rect(tankRect.x + 46, tankRect.y + tankRect.h - 13, 3, 9).fill('#3a7a4a');
    floor.rect(tankRect.x + 2, tankRect.y + 2, 2, tankRect.h - 10).fill({ color: 0xffffff, alpha: 0.25 });
    // phone table near the door
    phoneSpot = { x: 60, y: h * 0.5 + 60 };
    floor.rect(38, h * 0.5 + 44, 30, 18).fill('#8a6642');
    floor.rect(38, h * 0.5 + 60, 30, 3).fill('#5e4228');
    const plants: [number, number][] = [
      [16, h - 60], [w - 40, h * 0.32], [w * 0.35, h - 46],
      [w - 322, h - 128], [w * 0.47, h - 52],
    ];
    plantSpots = plants.map(([x, y]) => ({ x: x + 12, y: y + 34 }));
    for (const [x, y] of plants) add(plantTexture(), x, y);
    // motivational poster between window 2 and the TV
    const posterG = new Graphics();
    posterG.rect(w * 0.345, 8, 52, 30).fill('#3e3022');
    posterG.rect(w * 0.345 + 3, 11, 46, 24).fill('#f0e4c8');
    decor.addChild(posterG);
    const posterT = new Text({
      text: 'SHIP\nIT!',
      style: { fontSize: 8, fontFamily: '"Press Start 2P", monospace', fill: '#c96a4a', align: 'center', lineHeight: 11 },
    });
    posterT.anchor.set(0.5);
    posterT.position.set(w * 0.345 + 26, 23);
    decor.addChild(posterT);
    clockPos = { x: w * 0.64, y: 24 };
    // TV back on the wall, between the windows and the whiteboard
    tvRect = { x: w * 0.40, y: 5, w: 150, h: 38 };
  }
  drawRoom();
  app.renderer.on('resize', () => { drawRoom(); if (lastStore) relayout(lastStore); });

  function makeWalker(shirt: string): { root: Container; char: Sprite; bubble: Text; bubbleBg: Graphics } {
    const root = new Container();
    const shadow = new Graphics();
    shadow.ellipse(0, 1, 13, 4).fill({ color: 0x1a120a, alpha: 0.25 });
    const char = new Sprite(charTexture('idle', shirt));
    char.scale.set(SCALE);
    char.anchor.set(0.5, 1);
    const bubbleBg = new Graphics();
    const bubble = new Text({ text: '', style: { fontSize: 16 } });
    bubble.anchor.set(0.5, 1);
    bubble.position.set(0, -46);
    root.addChild(shadow, char, bubbleBg, bubble);
    world.addChild(root);
    return { root, char, bubble, bubbleBg };
  }

  function npcChip(npc: Npc): void {
    npc.bubbleBg.clear();
    if (!npc.bubble.text) return;
    npc.bubbleBg.roundRect(-13, -69, 26, 24, 7).fill({ color: 0xf5ead0, alpha: 0.95 }).stroke({ color: 0x3e3022, width: 1.5 });
    npc.bubbleBg.moveTo(-4, -46).lineTo(4, -46).lineTo(0, -41).closePath().fill(0xf5ead0);
  }

  // --- NPCs: 3 workers + courier + cleaner ---
  const npcs: Npc[] = [];
  NPC_SHIRTS.forEach((shirt, i) => {
    const { root, char, bubble, bubbleBg } = makeWalker(shirt);
    root.position.set(160 + i * 130, 210 + i * 80);
    npcs.push({ root, char, bubble, bubbleBg, carry: null, shirt, role: 'worker', target: { x: root.x, y: root.y }, pauseUntil: 0, nextJobAt: 0, poi: 'floor' });
  });
  (() => {
    const { root, char, bubble, bubbleBg } = makeWalker('#b06a3a');
    root.position.set(-70, 300);
    npcs.push({ root, char, bubble, bubbleBg, carry: null, shirt: '#b06a3a', role: 'courier', target: { x: -70, y: 300 }, pauseUntil: 0, nextJobAt: 15_000, poi: 'exit' });
  })();
  (() => {
    const { root, char, bubble, bubbleBg } = makeWalker('#5a7a8a');
    root.position.set(-70, 380);
    npcs.push({ root, char, bubble, bubbleBg, carry: null, shirt: '#5a7a8a', role: 'cleaner', target: { x: -70, y: 380 }, pauseUntil: 0, nextJobAt: 45_000, poi: 'exit' });
  })();

  function pickWorkerErrand(npc: Npc, crunch: boolean): void {
    const { width: w, height: h } = app.screen;
    const r = Math.random();
    npc.couchSeat = undefined;
    if (r < (crunch ? 0.45 : 0.18)) { npc.poi = 'cooler'; npc.target = { x: coolerSpot.x + Math.random() * 20, y: coolerSpot.y + Math.random() * 14 }; }
    else if (r < 0.36) { npc.poi = 'printer'; npc.target = { ...printerSpot }; }
    else if (r < 0.5) { npc.poi = 'couch'; npc.couchSeat = npcs.indexOf(npc) % 3; npc.target = { ...loungeSeats[npc.couchSeat] }; }
    else if (r < 0.6) { const p = plantSpots[Math.floor(Math.random() * plantSpots.length)]; npc.poi = 'water'; npc.target = { ...p }; }
    else if (r < 0.72) {
      npc.poi = 'chat';
      const others = npcs.filter((o) => o !== npc && o.role === 'worker');
      const other = others[Math.floor(Math.random() * others.length)];
      npc.target = { x: other.root.x + 34, y: other.root.y + 4 };
    } else {
      npc.poi = 'floor';
      npc.target = { x: 90 + Math.random() * (w - 200), y: 140 + Math.random() * (h - 220) };
    }
  }

  // --- cat + roomba ---
  const catRoot = new Container();
  const catShadow = new Graphics();
  catShadow.ellipse(0, 0, 11, 3).fill({ color: 0x1a120a, alpha: 0.22 });
  const cat = new Sprite(catTexture('sit'));
  cat.scale.set(SCALE); cat.anchor.set(0.5, 1);
  catRoot.addChild(catShadow, cat); catRoot.position.set(120, 240); world.addChild(catRoot);
  let catTarget = { x: 240, y: 340 }, catSitUntil = 0, catRideUntil = 0;

  const roomba = new Container();
  const roombaG = new Graphics();
  roombaG.ellipse(0, 1, 13, 6).fill('#23262c');
  roombaG.ellipse(0, 0, 13, 7).fill('#6a6f7a').stroke({ color: 0x454a54, width: 2 });
  roombaG.ellipse(0, -1, 8, 4).fill('#7d828e');
  roombaG.circle(4, -1, 1.6).fill('#7ee08a');
  roomba.addChild(roombaG);
  roomba.position.set(300, 400);
  world.addChild(roomba);
  let roombaDir = Math.random() * Math.PI * 2;

  // --- agents ---
  function makePuppet(a: AgentSnapshot): Puppet {
    const root = new Container();
    const shirt = shirtFor(a.agentId);
    const deskShadow = new Graphics();
    deskShadow.ellipse(0, 20, 40, 9).fill({ color: 0x1a120a, alpha: 0.22 });
    const desk = new Sprite(deskTexture());
    desk.scale.set(SCALE); desk.anchor.set(0.5, 0.5);
    const overlay = new Graphics();
    const charShadow = new Graphics();
    charShadow.ellipse(0, 0, 13, 4).fill({ color: 0x1a120a, alpha: 0.25 });
    const char = new Sprite(charTexture('idle', shirt));
    char.scale.set(SCALE); char.anchor.set(0.5, 1); char.position.set(SEAT.x, SEAT.y);
    const bubble = new Text({ text: '', style: { fontSize: 17 } });
    bubble.anchor.set(0.5, 1); bubble.position.set(0, -34);
    const fileTag = new Text({ text: '', style: { fontSize: 9, fill: '#9ae09a', fontFamily: 'monospace' } });
    fileTag.anchor.set(0.5, 1); fileTag.position.set(0, -50);
    const chip = new Graphics();
    const label = new Text({ text: '', style: { fontSize: 11, fill: '#f5ead0', fontFamily: 'monospace' } });
    label.anchor.set(0.5, 0); label.position.set(0, 50);
    const ring = new Graphics();
    ring.ellipse(0, 42, 26, 9).stroke({ color: '#ffd88a', width: 2 });
    ring.visible = false;
    const bubbleBg = new Graphics();
    root.addChild(ring, deskShadow, desk, overlay, charShadow, char, chip, label, fileTag, bubbleBg, bubble);
    root.eventMode = 'static'; root.cursor = 'pointer';
    root.on('pointertap', () => onSelect(a.agentId));
    root.position.set(doorSpot.x - 90, doorSpot.y);
    world.addChild(root);
    let h = 0;
    for (const c of a.agentId) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    const isSub = !!a.parentAgentId;
    return {
      root, char, bubble, label, fileTag, chip, ring, overlay, charShadow, bubbleBg,
      status: a.status, shirt, detail: a.detail, target: { x: 0, y: 0 },
      seatIdx: h % 3, introUntil: isSub ? performance.now() + 3200 : 0,
    };
  }

  function setLabel(p: Puppet, text: string): void {
    if (p.label.text === text) return;
    p.label.text = text;
    const w = p.label.width;
    p.chip.clear().roundRect(-w / 2 - 5, 47, w + 10, 17, 4).fill({ color: 0x000000, alpha: 0.32 });
  }

  function relayout(store: OfficeStore): void {
    const agents = [...store.agents.values()];
    const pos = layoutOffice(agents, Math.max(app.screen.width * 0.68, 340), Math.max(app.screen.height - 230, 220));
    for (const a of agents) {
      const p = puppets.get(a.agentId);
      const target = pos.get(a.agentId);
      if (p && target) p.target = { x: target.x + 40, y: target.y + 70 };
    }
  }

  function flyPaper(from: { x: number; y: number }, to: { x: number; y: number }, onDone?: () => void): void {
    const spr = new Container();
    const g = new Graphics();
    g.rect(-4, -5, 8, 10).fill('#f0f0ec').stroke({ color: 0xb8b8c0, width: 1 });
    g.rect(-2, -3, 4, 1).fill('#b8b8c0');
    g.rect(-2, -1, 4, 1).fill('#b8b8c0');
    spr.addChild(g);
    spr.position.set(from.x, from.y);
    spr.zIndex = 10_000;
    world.addChild(spr);
    flights.push({ spr, from, to, t0: performance.now(), dur: 900 + Math.random() * 300, arc: 30 + Math.random() * 30, onDone });
  }

  function burstConfetti(x: number, y: number): void {
    for (let i = 0; i < 26; i++) {
      confetti.push({
        x, y, t0: performance.now(),
        vx: (Math.random() - 0.5) * 0.22, vy: -0.15 - Math.random() * 0.18,
        color: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  function npcGawkAt(x: number, y: number): void {
    const free = npcs.find((n) => n.role === 'worker');
    if (!free) return;
    free.poi = 'gawk';
    free.target = { x: x + 40, y: y + 10 };
    free.pauseUntil = 0;
  }

  function onTransition(p: Puppet, from: AgentStatus, to: AgentStatus): void {
    const at = { x: p.root.x, y: p.root.y };
    if (to === 'error') {
      for (let i = 0; i < 4; i++) flyPaper(at, { x: at.x + (Math.random() - 0.5) * 140, y: at.y + 30 + Math.random() * 40 });
      npcGawkAt(at.x, at.y);
    } else if (to === 'reading') {
      flyPaper({ x: app.screen.width * 0.72 + 20, y: 46 }, at);
    } else if (to === 'waiting') {
      bellUntil = performance.now() + 1600;
    } else if (from === 'editing' && to !== 'editing') {
      flyPaper(at, { x: printerSpot.x - 20, y: printerSpot.y - 20 }, () => {
        printerBusyUntil = performance.now() + 2400;
        donePile = Math.min(donePile + 1, 14);
      });
    }
  }

  let chatPair: { visitorId: string; hostId: string; until: number } | null = null;

  function sync(store: OfficeStore): void {
    lastStore = store;
    for (const [id, p] of puppets) {
      if (!store.agents.has(id)) {
        shipped++;
        burstConfetti(p.root.x, p.root.y - 20);
        world.removeChild(p.root); p.root.destroy({ children: true }); puppets.delete(id);
      }
    }
    for (const a of store.agents.values()) {
      let p = puppets.get(a.agentId);
      if (!p) {
        p = makePuppet(a); puppets.set(a.agentId, p);
        if (p.introUntil) briefUntil = p.introUntil; // whiteboard scribbles while briefing
      }
      if (p.status !== a.status) onTransition(p, p.status, a.status);
      p.status = a.status;
      p.detail = a.detail;
      setLabel(p, a.label.slice(0, 18));
      p.ring.visible = store.selectedId === a.agentId;
      p.char.rotation = a.status === 'error' ? Math.PI / 2 : 0;
    }
    relayout(store);

    const empty = store.agents.size === 0;
    if (empty && !emptyHint) {
      emptyHint = new Text({
        text: 'The agents are away.\nRun Claude Code in any project — they will show up for work.',
        style: { fontSize: 15, fill: '#3e3022', fontFamily: 'monospace', align: 'center' },
      });
      emptyHint.anchor.set(0.5);
      app.stage.addChild(emptyHint);
    } else if (!empty && emptyHint) {
      app.stage.removeChild(emptyHint); emptyHint.destroy(); emptyHint = null;
    }
  }

  let t = 0;
  app.ticker.add((tick) => {
    t += tick.deltaMS;
    const dt = tick.deltaMS;
    const now = performance.now();
    const { width: w, height: h } = app.screen;
    const hour = new Date().getHours();
    const night = hour >= 19 || hour < 7;
    const lunch = hour === 13 && new Date().getMinutes() < 10;
    const crunch = puppets.size >= 5;

    // ---- token sampling for the wall TV ----
    if (lastStore && t - lastSample > 2000) {
      lastSample = t;
      const tok = lastStore.totals.tokens;
      tokenHist.push(Math.max(0, tok - lastTokens));
      lastTokens = tok;
      if (tokenHist.length > 40) tokenHist.shift();
    }

    // ---- agent chats ----
    if (chatPair && (now > chatPair.until || !puppets.has(chatPair.visitorId) || !puppets.has(chatPair.hostId))) chatPair = null;
    if (!chatPair && puppets.size >= 2 && Math.random() < dt / 45_000) {
      const calm = [...puppets.entries()].filter(([, p]) => p.status === 'thinking' || p.status === 'reading');
      if (calm.length >= 2) {
        const i = Math.floor(Math.random() * calm.length);
        let j = Math.floor(Math.random() * (calm.length - 1));
        if (j >= i) j++;
        chatPair = { visitorId: calm[i][0], hostId: calm[j][0], until: now + 6500 };
      }
    }

    // ---- agents ----
    for (const [id, p] of puppets) {
      p.root.x += (p.target.x - p.root.x) * 0.08;
      p.root.y += (p.target.y - p.root.y) * 0.08;
      p.root.zIndex = p.root.y;

      let want = SEAT;
      let pose: CharPose = 'idle';
      if (p.introUntil && now < p.introUntil) {
        want = { x: boardSpot.x - p.root.x, y: boardSpot.y - p.root.y };
      } else if (p.status === 'waiting') {
        want = { x: machineSpot.x - p.root.x, y: machineSpot.y - p.root.y };
        pose = 'coffee';
      } else if (p.status === 'sleeping') {
        const s = loungeSeats[p.seatIdx] ?? loungeSeats[0];
        want = { x: s.x - p.root.x, y: s.y - p.root.y };
        pose = 'sit';
      } else if (chatPair && id === chatPair.visitorId) {
        const host = puppets.get(chatPair.hostId)!;
        want = { x: host.root.x + 44 - p.root.x, y: host.root.y + 24 - p.root.y };
      } else if (p.status === 'editing' || p.status === 'working') {
        pose = Math.floor(t / 220) % 2 ? 'typeA' : 'typeB';
      }

      const dx = want.x - p.char.x;
      p.char.x += dx * 0.06;
      p.char.y += (want.y - p.char.y) * 0.06;
      const away = Math.hypot(p.char.x - SEAT.x, p.char.y - SEAT.y) > 20;
      const moving = Math.abs(dx) > 4 || Math.abs(want.y - p.char.y) > 4;
      p.char.scale.x = SCALE * (Math.abs(dx) > 4 ? Math.sign(dx) : (p.char.scale.x < 0 ? -1 : 1));
      if (moving && pose === 'idle') p.char.y += Math.sin(t / 110) * 0.6;
      p.char.texture = charTexture(pose, p.shirt);
      p.char.skew.x = p.status === 'thinking' && !moving ? Math.sin(t / 400) * 0.05 : 0;

      p.charShadow.position.set(p.char.x, p.char.y + 1);

      const inChat = chatPair && (id === chatPair.visitorId || id === chatPair.hostId);
      const briefing = p.introUntil && now < p.introUntil;
      p.bubble.text = briefing ? '✏️' : inChat ? (Math.floor(t / 650) % 2 ? '💬' : '…') : (STATUS_EMOJI[p.status] ?? '');
      const bob = Math.sin(t / 350) * 2;
      if (away || inChat) p.bubble.position.set(p.char.x, p.char.y - 46 + bob);
      else p.bubble.position.set(0, -34 + bob);
      // classic cream speech bubble behind the emoji
      p.bubbleBg.clear();
      if (p.bubble.text) {
        const bx = p.bubble.x; const by = p.bubble.y;
        p.bubbleBg.roundRect(bx - 13, by - 23, 26, 24, 7).fill({ color: 0xf5ead0, alpha: 0.95 }).stroke({ color: 0x3e3022, width: 1.5 });
        p.bubbleBg.moveTo(bx - 4, by).lineTo(bx + 4, by).lineTo(bx, by + 5).closePath().fill(0xf5ead0);
      }

      // live monitor: running code lines / terminal
      p.overlay.clear();
      if (!away && (p.status === 'editing' || p.status === 'working')) {
        for (let i = 0; i < 3; i++) {
          const seed = Math.floor(t / 180) + i * 7;
          const len = 6 + ((seed * 37) % 17);
          p.overlay.rect(-13, -18 + i * 4, len, 2).fill({ color: crunch ? 0xa8ffb0 : 0x7ee08a, alpha: 0.9 });
        }
        p.overlay.rect(-15, -20, 30, 14)
          .fill({ color: 0x7ee08a, alpha: 0.04 + 0.03 * Math.sin(t / 90 + p.seatIdx * 2) });
      } else if (!away && p.status === 'running') {
        p.overlay.roundRect(18, -34, 30, 20, 2).fill({ color: 0x10141a, alpha: 0.95 }).stroke({ color: 0x3a3f4a, width: 1 });
        p.overlay.rect(21, -30, 12, 2).fill(0x9ae09a);
        p.overlay.rect(21, -26, 8, 2).fill(0x9ae09a);
        if (Math.floor(t / 400) % 2) p.overlay.rect(21, -22, 4, 3).fill(0xd8e8d8);
      }
      // filename tag while editing/reading
      const showTag = !away && p.detail && (p.status === 'editing' || p.status === 'reading' || p.status === 'running');
      p.fileTag.text = showTag ? p.detail.slice(0, 24) : '';

      // error alarm above the desk
      if (p.status === 'error') {
        const pulse = (Math.sin(t / 140) + 1) / 2;
        fx.circle(p.root.x, p.root.y - 44, 4 + pulse * 2).fill({ color: 0xff4a4a, alpha: 0.7 + pulse * 0.3 });
        fx.circle(p.root.x, p.root.y - 44, 10 + pulse * 6).stroke({ color: 0xff4a4a, alpha: 0.35 * (1 - pulse), width: 2 });
      }
      // night: working monitors glow
      if (night && !away && (p.status === 'editing' || p.status === 'working' || p.status === 'running')) {
        fx.ellipse(p.root.x, p.root.y - 20, 30, 16).fill({ color: 0x7ee08a, alpha: 0.08 });
      }
    }

    // ---- NPCs ----
    for (const npc of npcs) {
      npc.root.zIndex = npc.root.y;
      // scripted specials
      if (npc.role === 'courier' && npc.poi === 'exit' && t > npc.nextJobAt) {
        npc.poi = 'deliver';
        npc.root.position.set(-70, doorSpot.y);
        npc.target = { ...dropSpot };
        if (!npc.carry) {
          npc.carry = new Sprite(boxTexture());
          npc.carry.scale.set(SCALE * 0.8); npc.carry.anchor.set(0.5, 1); npc.carry.position.set(0, -40);
          npc.root.addChild(npc.carry);
        }
      }
      if (npc.role === 'cleaner' && npc.poi === 'exit' && t > npc.nextJobAt) {
        npc.poi = 'mop'; npc.mopLeg = 0;
        npc.root.position.set(-70, doorSpot.y + 40);
        npc.target = { x: 140 + Math.random() * (w - 320), y: 160 + Math.random() * (h - 260) };
      }
      if (lunch && npc.role === 'worker' && npc.poi !== 'lunch') {
        npc.poi = 'lunch';
        npc.dwelled = false;
        npc.couchSeat = npcs.indexOf(npc) % 3;
        npc.target = { ...loungeSeats[npc.couchSeat] };
        npc.pauseUntil = 0;
      }
      if (!lunch && npc.poi === 'lunch') { npc.dwelled = false; pickWorkerErrand(npc, crunch); }

      if (t < npc.pauseUntil) {
        const stay =
          npc.poi === 'chat' ? (Math.floor(t / 700) % 2 ? '💬' : '') :
          npc.poi === 'printer' ? '🖨️' :
          npc.poi === 'cooler'
            ? (npcs.some((o) => o !== npc && o.poi === 'cooler' && t < o.pauseUntil)
                ? (Math.floor(t / 700) % 2 ? '💬' : '🥤') : '🥤') :
          npc.poi === 'water' ? '💦' :
          npc.poi === 'gawk' ? '❓' :
          npc.poi === 'phone' ? '📞' :
          npc.poi === 'lunch' ? '🍕' : '';
        npc.bubble.text = stay;
        npc.char.texture = charTexture(npc.poi === 'couch' || npc.poi === 'lunch' ? 'sit' : 'idle', npc.shirt);
        npc.bubble.position.set(0, -46);
        npcChip(npc);
        continue;
      }
      npc.bubble.text = '';
      const dx = npc.target.x - npc.root.x;
      const dy = npc.target.y - npc.root.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        if (npc.role === 'courier' && npc.poi === 'deliver') {
          if (npc.carry) { npc.root.removeChild(npc.carry); npc.carry.destroy(); npc.carry = null; }
          if (boxes.length >= 3) { for (const b of boxes) { world.removeChild(b); b.destroy(); } boxes.length = 0; }
          const box = new Sprite(boxTexture());
          box.scale.set(SCALE * 0.8); box.anchor.set(0.5, 1);
          box.position.set(dropSpot.x + boxes.length * 16, dropSpot.y + 6);
          box.zIndex = box.y;
          world.addChild(box); boxes.push(box);
          npc.poi = 'exit'; npc.target = { x: -70, y: doorSpot.y }; npc.nextJobAt = t + 40_000 + Math.random() * 40_000;
        } else if (npc.role === 'cleaner' && npc.poi === 'mop') {
          if (!wetSign) {
            wetSign = new Text({ text: '⚠️', style: { fontSize: 18 } });
            wetSign.anchor.set(0.5, 1);
            world.addChild(wetSign);
          }
          wetSign.position.set(npc.root.x, npc.root.y + 6);
          wetSign.zIndex = wetSign.y;
          wetUntil = t + 12_000;
          npc.mopLeg = (npc.mopLeg ?? 0) + 1;
          if (npc.mopLeg > 3) { npc.poi = 'exit'; npc.target = { x: -70, y: doorSpot.y + 40 }; npc.nextJobAt = t + 70_000 + Math.random() * 50_000; }
          else { npc.target = { x: 140 + Math.random() * (w - 320), y: 160 + Math.random() * (h - 260) }; npc.pauseUntil = t + 900; }
        } else if (npc.role === 'worker') {
          if (!npc.dwelled) {
            // arrived: stay a while doing the thing, THEN decide where to go next
            npc.dwelled = true;
            npc.pauseUntil = t + 4500 + Math.random() * 5500;
            if (npc.poi === 'printer') printerBusyUntil = now + 2600;
          } else if (npc.poi !== 'lunch') {
            npc.dwelled = false;
            pickWorkerErrand(npc, crunch);
          }
        } else {
          // courier/cleaner waiting offscreen
        }
      } else if (npc.poi !== 'exit' || dist >= 6) {
        const speed = npc.role === 'cleaner' ? 0.026 : 0.032;
        npc.root.x += (dx / dist) * speed * dt;
        npc.root.y += (dy / dist) * speed * dt;
        npc.char.scale.x = SCALE * (dx >= 0 ? 1 : -1);
        npc.char.y = Math.sin(t / 110) * 0.8;
        npc.char.texture = charTexture('idle', npc.shirt);
        if (npc.role === 'cleaner' && npc.poi === 'mop') npc.bubble.text = '🧹';
      }
      npcChip(npc);
    }
    if (wetSign && t > wetUntil) { world.removeChild(wetSign); wetSign.destroy(); wetSign = null; }

    // ---- phone ----
    if (t > nextPhoneAt && phoneRingUntil < now) {
      phoneRingUntil = now + 9000;
      nextPhoneAt = t + 45_000 + Math.random() * 35_000;
      const worker = npcs.find((n) => n.role === 'worker' && n.poi !== 'phone');
      if (worker) { worker.poi = 'phone'; worker.target = { ...phoneSpot }; worker.pauseUntil = 0; }
    }
    if (phoneRingUntil > now) {
      const shake = Math.sin(t / 60) * 2;
      fx.circle(phoneSpot.x - 8 + shake, phoneSpot.y - 28, 3).fill('#2a2a30');
      fx.rect(phoneSpot.x - 14 + shake, phoneSpot.y - 26, 12, 5).fill('#2a2a30');
      if (Math.floor(t / 300) % 2) fx.circle(phoneSpot.x - 8, phoneSpot.y - 38, 2).stroke({ color: 0xffd54a, width: 1 });
      const answering = npcs.some((n) => n.poi === 'phone' && Math.hypot(n.root.x - phoneSpot.x, n.root.y - phoneSpot.y) < 12);
      if (answering) phoneRingUntil = now + 1;
    } else {
      fx.circle(phoneSpot.x - 8, phoneSpot.y - 28, 3).fill('#2a2a30');
      fx.rect(phoneSpot.x - 14, phoneSpot.y - 26, 12, 5).fill('#2a2a30');
    }

    // ---- cat & roomba ----
    catRoot.zIndex = catRoot.y;
    roomba.zIndex = roomba.y;
    roombaDir += (Math.random() - 0.5) * 0.02;
    roomba.x += Math.cos(roombaDir) * 0.03 * dt;
    roomba.y += Math.sin(roombaDir) * 0.03 * dt;
    if (roomba.x < 40 || roomba.x > w - 40) roombaDir = Math.PI - roombaDir + (Math.random() - 0.5) * 0.4;
    if (roomba.y < 120 || roomba.y > h - 30) roombaDir = -roombaDir + (Math.random() - 0.5) * 0.4;
    roomba.x = Math.min(w - 40, Math.max(40, roomba.x));
    roomba.y = Math.min(h - 30, Math.max(120, roomba.y));

    if (now < catRideUntil) {
      catRoot.position.set(roomba.x, roomba.y + 2);
      cat.texture = catTexture('sit');
    } else if (t > catSitUntil) {
      const chase = Math.hypot(roomba.x - catRoot.x, roomba.y - catRoot.y) < 160 && Math.random() < 0.4;
      const target = chase ? { x: roomba.x, y: roomba.y } : catTarget;
      const dx = target.x - catRoot.x; const dy = target.y - catRoot.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) {
        if (chase && Math.random() < 0.35) catRideUntil = now + 7000;
        catSitUntil = t + 1800 + Math.random() * 3000;
        catTarget = { x: 60 + Math.random() * (w - 120), y: 130 + Math.random() * (h - 190) };
        cat.texture = catTexture('sit');
      } else {
        catRoot.x += (dx / dist) * 0.05 * dt;
        catRoot.y += (dy / dist) * 0.05 * dt;
        cat.scale.x = SCALE * (dx >= 0 ? 1 : -1);
        cat.texture = catTexture(Math.floor(t / 180) % 2 ? 'walkA' : 'walkB');
      }
    }

    // ---- printer / whiteboard / paper flights / confetti ----
    if (printer) printer.texture = printerTexture(now < printerBusyUntil && Math.floor(t / 240) % 2 === 0);
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      const k = Math.min(1, (now - f.t0) / f.dur);
      f.spr.x = f.from.x + (f.to.x - f.from.x) * k;
      f.spr.y = f.from.y + (f.to.y - f.from.y) * k - Math.sin(k * Math.PI) * f.arc;
      f.spr.rotation = Math.sin(k * 9) * 0.3;
      if (k >= 1) { f.onDone?.(); world.removeChild(f.spr); f.spr.destroy({ children: true }); flights.splice(i, 1); }
    }

    fx.clear();
    // done pile near the printer
    for (let i = 0; i < donePile; i++) fx.rect(dropSpot.x - 40, printerSpot.y - 4 - i * 2, 14, 2).fill(i % 2 ? '#f0f0ec' : '#e0e0da');
    // confetti
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      const age = now - c.t0;
      if (age > 1600) { confetti.splice(i, 1); continue; }
      c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 0.0006 * dt;
      fx.rect(c.x, c.y, 3, 3).fill({ color: c.color, alpha: 1 - age / 1600 });
    }
    // steam
    for (let k = 0; k < 3; k++) {
      const phase = ((t / 1100) + k / 3) % 1;
      fx.circle(steamSpot.x + Math.sin(phase * 7 + k * 2) * 3, steamSpot.y - phase * 20, 1.6)
        .fill({ color: 0xf5ead8, alpha: (1 - phase) * 0.55 });
    }
    // extra steam from the mug when someone waits at the machine
    if ([...puppets.values()].some((p) => p.status === 'waiting')) {
      for (let k = 0; k < 2; k++) {
        const ph = ((t / 900) + k / 2) % 1;
        fx.circle(machineSpot.x + 6 + Math.sin(ph * 6 + k) * 2, machineSpot.y - 26 - ph * 14, 1.3)
          .fill({ color: 0xf5ead8, alpha: (1 - ph) * 0.5 });
      }
    }
    // whiteboard scribbles while a briefing is on
    if (whiteboard && now < briefUntil) {
      const n = 2 + Math.floor((t / 400) % 4);
      for (let i = 0; i < n; i++) {
        fx.rect(whiteboard.x + 8, whiteboard.y + 8 + i * 5, 12 + ((i * 17 + Math.floor(t / 300)) % 14), 2)
          .fill({ color: i % 2 ? 0x4a6a9a : 0xc96a4a, alpha: 0.8 });
      }
    }
    // bell by the door when someone waits for permission
    if (now < bellUntil) {
      const swing = Math.sin(t / 70) * 0.5;
      fx.circle(14, h * 0.5 - 44, 4).fill('#ffd54a');
      fx.moveTo(14, h * 0.5 - 48).lineTo(14 + swing * 8, h * 0.5 - 40).stroke({ color: 0xffd54a, width: 2 });
    }
    // lounge lamp glow at night
    if (night) {
      fx.ellipse(lampPos.x + 12, lampPos.y + 8, 44, 28).fill({ color: 0xffd88a, alpha: 0.10 });
      fx.ellipse(lampPos.x + 12, lampPos.y + 8, 22, 14).fill({ color: 0xffd88a, alpha: 0.08 });
    }
    // server rack LEDs
    for (let i = 0; i < 5; i++) {
      const on = (Math.floor(t / 260) + i * 3) % 4 !== 0;
      fx.rect(rackPos.x + 7, rackPos.y + 7 + i * 6.2, 2.5, 2.5).fill(on ? (i % 3 === 1 ? '#ffb04a' : '#7ee08a') : '#274030');
    }
    // aquarium fish (chunky enough to read as fish)
    for (let i = 0; i < 3; i++) {
      const fp = ((t / (5200 + i * 900)) + i / 3) % 1;
      const fxr = tankRect.x + 8 + Math.abs(Math.sin(fp * Math.PI * 2)) * (tankRect.w - 24);
      const fy = tankRect.y + 8 + ((i * 9) % (tankRect.h - 20)) + Math.sin(t / 700 + i) * 2;
      const dir = Math.cos(fp * Math.PI * 2) >= 0 ? 1 : -1;
      fx.rect(fxr, fy, 6, 3).fill(i === 1 ? '#8ab8f0' : '#e8944a');
      fx.rect(fxr - dir * 3, fy, 3, 3).fill(i === 1 ? '#6a94c8' : '#c06a30');
      fx.rect(fxr + dir * 5, fy + 1, 1, 1).fill('#1a2a3a');
    }
    const bub = (t / 32) % (tankRect.h - 8);
    fx.circle(tankRect.x + tankRect.w - 12, tankRect.y + tankRect.h - 6 - bub, 1.2).fill({ color: 0xcfe8f8, alpha: 0.6 });
    // wall clock
    const nowD = new Date();
    fx.circle(clockPos.x, clockPos.y, 11).fill('#f5ead0').stroke({ color: 0x3e3022, width: 2 });
    const ma = (nowD.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;
    const ha = ((nowD.getHours() % 12) / 12 + nowD.getMinutes() / 720) * Math.PI * 2 - Math.PI / 2;
    fx.moveTo(clockPos.x, clockPos.y).lineTo(clockPos.x + Math.cos(ma) * 8, clockPos.y + Math.sin(ma) * 8).stroke({ color: 0x3e3022, width: 1 });
    fx.moveTo(clockPos.x, clockPos.y).lineTo(clockPos.x + Math.cos(ha) * 5.5, clockPos.y + Math.sin(ha) * 5.5).stroke({ color: 0x3e3022, width: 2 });
    // wall TV: token burn sparkline + shipped counter
    fx.roundRect(tvRect.x - 3, tvRect.y - 3, tvRect.w + 6, tvRect.h + 6, 3).fill('#2a2a30');
    fx.rect(tvRect.x, tvRect.y, tvRect.w, tvRect.h).fill('#10141a');
    const maxTok = Math.max(1, ...tokenHist);
    const step = (tvRect.w - 8) / 40;
    for (let i = 0; i < tokenHist.length; i++) {
      const bh = (tokenHist[i] / maxTok) * (tvRect.h - 16);
      fx.rect(tvRect.x + 4 + i * step, tvRect.y + tvRect.h - 4 - bh, Math.max(1.5, step - 1), bh).fill(crunch ? '#ffb04a' : '#7ee08a');
    }
    if (lastStore) {
      // text on TV drawn as tiny "LED" caption via fx-less Text is overkill; use bars + shipped dots
      for (let i = 0; i < Math.min(shipped, 12); i++) {
        fx.circle(tvRect.x + 8 + i * 9, tvRect.y + 7, 2.4).fill('#ffd88a');
      }
    }
    // pizza on lunch
    if (lunch && !pizza) {
      pizza = new Sprite(pizzaTexture());
      pizza.scale.set(SCALE * 0.9);
      pizza.position.set(w - 236, h - 102);
      decor.addChild(pizza);
    } else if (!lunch && pizza) {
      decor.removeChild(pizza); pizza.destroy(); pizza = null;
    }

    // ---- windows: sky, clouds, birds; day/night ----
    skyFx.clear();
    const sky = night ? 0x1a2440 : 0x8fd3ff;
    const skyTop = night ? 0x101830 : 0xb8e4ff;
    for (let wi = 0; wi < windows.length; wi++) {
      const win = windows[wi];
      skyFx.rect(win.x, 7, win.w, 32).fill(sky);
      skyFx.rect(win.x, 7, win.w, 10).fill(skyTop);
      if (night) {
        for (let s = 0; s < 4; s++) {
          if ((Math.floor(t / 900) + s + wi) % 3 === 0) skyFx.rect(win.x + 8 + ((s * 17 + wi * 11) % (win.w - 14)), 10 + (s * 7) % 22, 1.4, 1.4).fill('#f5ead0');
        }
      } else {
        const cx = ((t / 90 + wi * 140) % (win.w + 60)) - 30;
        skyFx.roundRect(win.x + cx, 12 + wi * 4, 22, 7, 4).fill({ color: 0xffffff, alpha: 0.85 });
        skyFx.roundRect(win.x + cx + 8, 9 + wi * 4, 14, 6, 3).fill({ color: 0xffffff, alpha: 0.7 });
        // occasional bird on the sill
        if (Math.floor(t / 6000) % 3 === wi) {
          const hop = Math.floor(t / 500) % 2 ? 1 : 0;
          skyFx.rect(win.x + win.w * 0.6, 36 - hop, 3, 2).fill('#3a3a42');
          skyFx.rect(win.x + win.w * 0.6 + 3, 35 - hop, 2, 1).fill('#3a3a42');
        }
      }
      skyFx.rect(win.x + win.w / 2 - 1, 7, 2, 32).fill('#3e3022');
      skyFx.rect(win.x, 21, win.w, 2).fill('#3e3022');
    }

    // ---- window light beams on the floor (day only) ----
    lightFx.clear();
    if (!night) {
      for (const win of windows) {
        lightFx.moveTo(win.x + 2, 50).lineTo(win.x + win.w - 2, 50)
          .lineTo(win.x + win.w + 26, 134).lineTo(win.x - 26, 134)
          .closePath().fill({ color: 0xfff2c8, alpha: 0.10 });
        lightFx.rect(win.x - 10, 130, win.w + 20, 5).fill({ color: 0xfff2c8, alpha: 0.06 });
      }
    }
    // dust motes drifting in the window light
    if (!night) {
      for (let wi = 0; wi < windows.length; wi++) {
        const win = windows[wi];
        for (let k = 0; k < 4; k++) {
          const ph = ((t / (2600 + k * 700)) + k / 4 + wi / 2) % 1;
          fx.rect(win.x + 6 + ((k * 23 + wi * 31) % (win.w - 8)) + Math.sin(ph * 8) * 4, 56 + ph * 66, 1.2, 1.2)
            .fill({ color: 0xfff6da, alpha: (1 - Math.abs(ph - 0.5) * 2) * 0.35 });
        }
      }
    }

    // ---- vignette + night & crunch lighting ----
    nightFx.clear();
    nightFx.rect(0, 0, w, 30).fill({ color: 0x000000, alpha: 0.10 });
    nightFx.rect(0, h - 34, w, 34).fill({ color: 0x000000, alpha: 0.12 });
    nightFx.rect(0, 0, 28, h).fill({ color: 0x000000, alpha: 0.08 });
    nightFx.rect(w - 28, 0, 28, h).fill({ color: 0x000000, alpha: 0.08 });
    if (night) {
      nightFx.rect(0, 0, w, h).fill({ color: 0x0e1630, alpha: 0.22 });
      for (let i = 0; i < 3; i++) {
        const lx = w * (0.2 + i * 0.3);
        nightFx.ellipse(lx, 170, 130, 80).fill({ color: 0xffd88a, alpha: 0.07 });
      }
    }
    if (crunch) nightFx.rect(0, 0, w, h).fill({ color: 0x1a1030, alpha: 0.10 });

    if (emptyHint) emptyHint.position.set(w / 2, h / 2 - 20);
  });

  return { sync };
}
