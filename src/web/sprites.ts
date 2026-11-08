import { Texture } from 'pixi.js';

/** Pixel-matrix sprites: each string is a row, each char a palette color, '.' transparent. */
const PALETTE: Record<string, string> = {
  h: '#5a3a22', // hair
  s: '#e8b88a', // skin
  e: '#2a2a2a', // eyes
  S: '#c96a4a', // shirt (overridable per agent)
  T: '#a8523a', // shirt shade
  p: '#4a4a52', // pants
  o: '#2a2a30', // shoes / outline
  w: '#8a6642', // wood
  W: '#a37e54', // wood highlight
  d: '#5e4228', // wood shade
  m: '#1c1c22', // monitor bezel
  g: '#7ee08a', // screen glow
  G: '#0e2a14', // screen bg
  k: '#4a4a52', // keyboard
  c: '#c94a4a', // mug
  L: '#8fc06a', // leaf light
  l: '#5e8a42', // leaf dark
  P: '#a45f38', // pot
  M: '#666a70', // machine body
  D: '#33363c', // machine dark
  A: '#d98a3a', // cat fur
  a: '#3a2a1a', // cat eye
  U: '#a8555a', // couch upholstery
  u: '#7e3f44', // couch shade
  N: '#e8e8ec', // white plastic / paper
  n: '#b8b8c0', // plastic shade
  B: '#8fd3ff', // water / glass blue
  R: '#c8c8d2', // printer body
  r: '#8a8a96', // printer shade
  F: '#4a9a8a', // fridge teal
  f: '#357064', // fridge shade
  y: '#e8c84a', // cheese / yellow
  b: '#8a5a2a', // cardboard
  Y: '#b8923a', // lampshade shade
  x: '#7e4426', // terracotta / pot shade
};

export const CHAR_W = 10;

const CHAR_IDLE = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '.hsessesh.',
  '.hssssssh.',
  '..ssssss..',
  '.SSSSSSSS.',
  'SSSSTTSSSS',
  'Ss.STTS.sS',
  '.S.STTS.S.',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..oo..oo..',
];

const CHAR_TYPE_A = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '.hsessesh.',
  '.hssssssh.',
  '..ssssss..',
  '.SSSSSSSS.',
  'SSSSTTSSSS',
  '.sSSTTSSs.',
  '.ssSTTSss.',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..oo..oo..',
];

const CHAR_TYPE_B = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '.hsessesh.',
  '.hssssssh.',
  '..ssssss..',
  '.SSSSSSSS.',
  'SSSSTTSSSS',
  'ssSSTTSSss',
  '..SSTTSS..',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..oo..oo..',
];

const CHAR_SLEEP = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '.hs-ss-sh.'.replace(/-/g, 'e'),
  '.hssssssh.',
  '..ssssss..',
  '.SSSSSSSS.',
  'SSSSTTSSSS',
  'S..STTS..S',
  '.S.STTS.S.',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..oo..oo..',
];

const CHAR_COFFEE = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '.hsessesh.',
  '.hssssssh.',
  '..ssssss..',
  '.SSSSSSSS.',
  'SSSSTTSScc',
  'S..STTS.cc',
  '.S.STTS.S.',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..oo..oo..',
];

const DESK = [
  '.....oooooooooooooo.....',
  '.....ommmmmmmmmmmmo.....',
  '.....omGGGGGGGGGGmo.....',
  '.....omGggGGgggGGmo.....',
  '.....omGGGGGGGGGGmo.....',
  '.....omGgggGGggGGmo.....',
  '.....oooooooooooooo.....',
  '..........ommo..........',
  '........ommmmmmo........',
  'oWWWWWWWWWWWWWWWWWWWWWWo',
  'owwwkkkkkkkkwwwwNNwwycwo',
  'owwwwkkkkkkwwwwwNNwwwwwo',
  'oddddddddddddddddddddddo',
  '.dd..................dd.',
  '.dd..................dd.',
  '.oo..................oo.',
];

const PLANT = [
  '....LL....',
  '..LLlLLL..',
  '.LlLLLlLL.',
  '.LLlLlLLl.',
  '..lLLlLl..',
  '...lLl....',
  '..PPPPPP..',
  '..PxxxxP..',
  '...PPPP...',
  '...PxxP...',
];

const CAT_WALK_A = [
  '.AA.........',
  '.AaA....AA..',
  '.AAAAAAAA.A.',
  '..AAAAAAA...',
  '..A..A..A...',
  '..A....A....',
];

const CAT_WALK_B = [
  '.AA.........',
  '.AaA....A...',
  '.AAAAAAAAA..',
  '..AAAAAAA...',
  '...A..A.A...',
  '..A..A......',
];

const CAT_SIT = [
  '.AA.........',
  '.AaA........',
  '.AAA....A...',
  '.AAAAAAAA...',
  '.AAAAAAA....',
  '.AA..AA.....',
];

const COFFEE_MACHINE = [
  '.oooooooo.',
  '.oMMMMMMo.',
  '.oDggggDo.',
  '.oMMMMMco.',
  '.oM....Mo.',
  '.oMNccNMo.',
  '.oMMMMMMo.',
  '.oooooooo.',
];

const CHAR_SIT = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hssssssh.',
  '.hsessesh.',
  '.hssssssh.',
  '..ssssss..',
  '.SSSSSSSS.',
  'SSSSTTSSSS',
  '.SSSTTSSS.',
  '.pppppppp.',
  '.pp....pp.',
  '.oo....oo.',
];

const PRINTER_IDLE = [
  '..oooooooo..',
  '.oRRRRRRRRo.',
  '.oRrrrrrrRo.',
  '.oRRRRRRRRo.',
  '.oRRRRRRdRo.',
  '.oRnnnnnnRo.',
  '..oooooooo..',
  '..oo....oo..',
];

const PRINTER_BUSY = [
  '..oooooooo..',
  '.oRRRRRRRRo.',
  '.oRrrrrrrRo.',
  '.oRRRRRRRRo.',
  '.oRRRRRRgRo.',
  '.oRNNNNNnRo.',
  '..oooooooo..',
  '..oo....oo..',
];

const COUCH = [
  'ouu..........uuo',
  'ouUUUUUUUUUUUUuo',
  'ouUyyBUUUUByyUuo',
  'ouUyyBUUUUByyUuo',
  'ouUUuUUuUUuUUUuo',
  'ouuUUUUUUUUUUuuo',
  '.oo..........oo.',
];

const WATER_COOLER = [
  '..oBBBBo..',
  '.oBBBBBBo.',
  '.oBBnBBBo.',
  '.oBBBBBBo.',
  '..oNNNNo..',
  '.oNnNNnNo.',
  '.oNNccNNo.',
  '.oNNNNNNo.',
  '.oNNNNNNo.',
  '..o....o..',
];

const BOOKSHELF = [
  'wwwwwwwwwwwwww',
  'wWWWWWWWWWWWWw',
  'wcgBcLcBgcLgcw',
  'wcgBcLcBgcLgcw',
  'wwwwwwwwwwwwww',
  'wBLgcBgLcgBccw',
  'wBLgcBgLcgBccw',
  'wwwwwwwwwwwwww',
  'wgcLBgcBLcgBLw',
  'wgcLBgcBLcgBLw',
  'wwwwwwwwwwwwww',
];

const LOW_TABLE = [
  'WWWWWWWWWWWW',
  'wwwwwwwwwwww',
  'dwwwwwwwwwwd',
  '.d........d.',
];

const WHITEBOARD = [
  'nNNNNNNNNNNNNn',
  'nNNNNNNNNNNNNn',
  'nNcccNNgggggNn',
  'nNNNNNNNNNNNNn',
  'nNBBBBBBNNccNn',
  'nNNNNNNNNNNNNn',
  'nnnnnnnnnnnnnn',
  '...n......n...',
  '...n......n...',
  '..nn......nn..',
];

const SERVER_RACK = [
  'DDDDDDDDDDDD',
  'DMMMMMMMMMMD',
  'DMggMnnnnnMD',
  'DMMMMMMMMMMD',
  'DMcgMnnnnnMD',
  'DMMMMMMMMMMD',
  'DMggMnnnnnMD',
  'DMMMMMMMMMMD',
  'DMgcMnnnnnMD',
  'DMMMMMMMMMMD',
  'DMggMnnnnnMD',
  'DMMMMMMMMMMD',
  'DDDDDDDDDDDD',
  '.DD......DD.',
];

const BOX = [
  'bbbbbbbb',
  'bWbbbbWb',
  'bbbbbbbb',
  'bbbbbbbb',
  'bbbbbbbb',
];

const PIZZA = [
  'NNNNNNNNNN',
  'NyyyyyyyyN',
  'NycyyycyyN',
  'NyyycyyycN',
  'NNNNNNNNNN',
];

const FRIDGE = [
  '.oooooooo.',
  '.oFFFFFFo.',
  '.oFfffFNo.',
  '.oFyFFFNo.',
  '.oFFFFFFo.',
  '.oooooooo.',
  '.oFFFFFFo.',
  '.oFfffFNo.',
  '.oFFcFFFo.',
  '.oFFFFFFo.',
  '.oooooooo.',
  '..o....o..',
];

const FLOOR_LAMP = [
  '.yyyyyy.',
  'yyyyyyyy',
  '.YYYYYY.',
  '...oo...',
  '...oo...',
  '...oo...',
  '...oo...',
  '...oo...',
  '..oooo..',
  '.oooooo.',
];

export type CharPose = 'idle' | 'typeA' | 'typeB' | 'sleep' | 'coffee' | 'sit';

const cache = new Map<string, Texture>();

function toTexture(rows: string[], key: string, shirt?: string): Texture {
  const cacheKey = `${key}:${shirt ?? ''}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      let color = PALETTE[ch] ?? '#ff00ff';
      if (shirt && (ch === 'S' || ch === 'T')) color = ch === 'S' ? shirt : shade(shirt);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  cache.set(cacheKey, tex);
  return tex;
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.75));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

const POSES: Record<CharPose, string[]> = {
  idle: CHAR_IDLE, typeA: CHAR_TYPE_A, typeB: CHAR_TYPE_B, sleep: CHAR_SLEEP, coffee: CHAR_COFFEE, sit: CHAR_SIT,
};

export type CatPose = 'walkA' | 'walkB' | 'sit';
const CAT_POSES: Record<CatPose, string[]> = { walkA: CAT_WALK_A, walkB: CAT_WALK_B, sit: CAT_SIT };

export const charTexture = (pose: CharPose, shirt: string) => toTexture(POSES[pose], `char-${pose}`, shirt);
export const catTexture = (pose: CatPose) => toTexture(CAT_POSES[pose], `cat-${pose}`);
export const deskTexture = () => toTexture(DESK, 'desk');
export const plantTexture = () => toTexture(PLANT, 'plant');
export const coffeeMachineTexture = () => toTexture(COFFEE_MACHINE, 'coffee');
export const printerTexture = (busy: boolean) => toTexture(busy ? PRINTER_BUSY : PRINTER_IDLE, `printer-${busy}`);
export const couchTexture = () => toTexture(COUCH, 'couch');
export const waterCoolerTexture = () => toTexture(WATER_COOLER, 'cooler');
export const bookshelfTexture = () => toTexture(BOOKSHELF, 'bookshelf');
export const lowTableTexture = () => toTexture(LOW_TABLE, 'lowtable');
export const fridgeTexture = () => toTexture(FRIDGE, 'fridge');
export const lampTexture = () => toTexture(FLOOR_LAMP, 'lamp');
export const whiteboardTexture = () => toTexture(WHITEBOARD, 'whiteboard');
export const serverRackTexture = () => toTexture(SERVER_RACK, 'serverrack');
export const boxTexture = () => toTexture(BOX, 'box');
export const pizzaTexture = () => toTexture(PIZZA, 'pizza');

/** Stable per-agent shirt color. */
const SHIRTS = ['#c96a4a', '#4a6a9a', '#7aa05a', '#9a5aa0', '#b8860b', '#4a9a8a', '#d98a6a', '#6a8ab9'];
export function shirtFor(agentId: string): string {
  if (agentId.includes('pm') || agentId.includes('gembul')) return '#4A90E2';
  if (agentId.includes('dev') || agentId.includes('tupon') || agentId.includes('bulu')) return '#10B981';
  if (agentId.includes('qa') || agentId.includes('uyee') || agentId.includes('kecil')) return '#F5A623';
  let h = 0;
  for (const c of agentId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SHIRTS[h % SHIRTS.length];
}

/** Character portrait as a data URL — used for avatars in the side panel. */
const avatarCache = new Map<string, string>();
export function charAvatarDataURL(shirt: string, px = 4): string {
  const key = `${shirt}:${px}`;
  const hit = avatarCache.get(key);
  if (hit) return hit;
  const rows = CHAR_IDLE;
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length * px;
  canvas.height = rows.length * px;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      let color = PALETTE[ch] ?? '#ff00ff';
      if (ch === 'S') color = shirt;
      if (ch === 'T') color = shade(shirt);
      ctx.fillStyle = color;
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  const url = canvas.toDataURL();
  avatarCache.set(key, url);
  return url;
}
