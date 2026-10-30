// @ts-check
// Сърдити котета: an Angry Birds–like game about angles. A slingshot stands on a high kitchen shelf; on the right is a
// table with a cup on a tablecloth, a fridge behind it and a cat with binoculars on the fridge. The cat says at what
// angle to shoot: first only acute, right or obtuse, later a range in degrees that gets narrower and narrower.
// The angle is measured from the plumb line under the slingshot (straight down) to the direction of the shot:
// down is acute, level is right, up is obtuse. Only the angle decides: an angle inside the range always catches the
// tablecloth (the cup falls), a smaller one falls short of the table, a bigger one flies over the cloth. Three kittens:
// every miss sends one away, and the game ends when none is left.
// One canvas, no libraries. startGame() draws the game into a container; the platform says where the scores go
// (the browser alone, or LevAcademy through academy-app.js).

const W = 960;
const H = 540;
const FLOOR_Y = 478;
const G = 1000;                       // gravity, px/s²
const V0 = 560;                       // the speed that places the table for the middle of the target range
const CAT_R = 19;
const LAUNCH = { x: 124, y: 146 };    // the slingshot's fork: the kitten flies from here
const SHELF = { x2: 106, y: 196 };
const CLOTH_H = 54;                   // how far the tablecloth hangs down from the table top
const FRIDGE = { x: W - 136, w: 122, h: 258 };   // always in the right corner, with the cat on top
const CHAIR_W = 56;
const MIN_ANGLE = 12;
const MAX_ANGLE = 168;
const MAX_PULL = 74;
const HITS_PER_LEVEL = 3;
const SCORES_KEY = 'angry-kittens.scores';
const INK = '#3a2219';

/** Range width in degrees per level; null = only acute, right or obtuse. */
const WIDTHS = [null, null, 50, 40, 30, 20, 15, 10];
const widthFor = (level) => (level <= WIDTHS.length ? WIDTHS[level - 1] : 6);

/** The table from which level: a wider one, then a higher one (its top nearer the slingshot). */
const TABLES = [
  { from: 1, w: 172, h: 118 },
  { from: 3, w: 196, h: 118 },
  { from: 5, w: 200, h: 142 },
  { from: 7, w: 236, h: 128 },
  { from: 9, w: 240, h: 150 },
];
const tableFor = (level) => /** @type {typeof TABLES[number]} */ ([...TABLES].reverse().find((t) => level >= t.from));

/** What stands on the table from which level: [kind, centre from the left edge of a 172 px table, width, height]. */
const SETS = [
  { from: 1, name: 'чашата', items: [['cup', 103, 30, 34]] },
  { from: 3, name: 'вазата', items: [['vase', 104, 32, 78]] },
  { from: 5, name: 'вазата и чашите', items: [['cup', 62, 30, 34], ['vase', 104, 32, 78], ['cup', 146, 30, 34]] },
  { from: 7, name: 'пуйката', items: [['cup', 45, 30, 34], ['vase', 70, 32, 78], ['turkey', 111, 76, 52], ['cup', 152, 30, 34]] },
];
const setFor = (level) => /** @type {typeof SETS[number]} */ ([...SETS].reverse().find((set) => level >= set.from));

/** What the woman shouts when she finds the mess, by what was on the table. */
const SCOLDS = {
  чашата: ['Котко! Чашата ми!', 'Пак ли чашата?!'],
  вазата: ['Ах, вазата ми!', 'Цветята ми!'],
  'вазата и чашите': ['Всичко ли счупи?!', 'Ах, ти, разбойник!'],
  пуйката: ['Пуйката! Вечерята!', 'Котко, пуйката!'],
};

/** The three kinds of angles: the range that counts and the words the cat uses. */
const KINDS = {
  acute: { lo: MIN_ANGLE, hi: 89, name: 'остър', say: 'остър ъгъл' },
  right: { lo: 90, hi: 90, name: 'прав', say: 'прав ъгъл' },
  obtuse: { lo: 91, hi: MAX_ANGLE, name: 'тъп', say: 'тъп ъгъл' },
};

/** @typedef {{ fur: string, dark: string, belly: string, shades?: boolean }} Look */
/** @type {Record<string, Look>} */
const LOOKS = {
  ginger: { fur: '#f3a467', dark: '#d9773d', belly: '#ffe6bd' },
  grey: { fur: '#93a7ac', dark: '#6d8086', belly: '#c9e2df' },
  black: { fur: '#4a4a55', dark: '#2c2c33', belly: '#666673', shades: true },
  lilac: { fur: '#c4adec', dark: '#9b82cf', belly: '#f0e8ff' },
};

/**
 * @typedef {{ kind: 'kind', which: keyof typeof KINDS, lo: number, hi: number } | { kind: 'range', lo: number, hi: number }} Target
 * @typedef {'hit' | 'short' | 'table' | 'beyond'} Outcome
 * @typedef {{ score: number, level: number, at: string }} Score
 * @typedef {{
 *   sound?: boolean,
 *   loadScores(): Promise<Score[]>,
 *   saveScore(score: Score): Promise<void>,
 *   onPoint?(cupsThisGame: number): void,
 * }} Platform
 */

const rand = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rand(list.length)];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rad = (deg) => (deg * Math.PI) / 180;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The scores in this browser only (the game opened alone, outside LevAcademy). @returns {Platform} */
export function localPlatform() {
  const read = () => { try { return JSON.parse(localStorage.getItem(SCORES_KEY) || '[]'); } catch { return []; } };
  return {
    sound: true,
    loadScores: async () => read(),
    async saveScore(score) {
      const top = [...read(), score].sort((a, b) => b.score - a.score).slice(0, 20);
      try { localStorage.setItem(SCORES_KEY, JSON.stringify(top)); } catch { /* private mode: not remembered */ }
    },
  };
}

/** @param {HTMLElement} root @param {Platform} platform @returns {() => void} removes the game */
export function startGame(root, platform) {
  root.classList.add('angry-kittens');
  root.innerHTML = `
    <div class="ak-stage">
      <canvas aria-label="Кухнята: прашка на рафта, маса с чаша и котка с бинокъл"></canvas>
      <div class="ak-hud">
        <div class="ak-pill" title="Съборени чаши"><span class="ak-icon" aria-hidden="true">☕</span><b data-score>0</b></div>
        <div class="ak-pill ak-level" title="Нивото расте с всеки 3 чаши">ниво <b data-level>1</b></div>
        <div class="ak-pill ak-goal" data-goal hidden></div>
        <div class="ak-pill ak-lives" title="Котета" data-lives></div>
      </div>
      <button type="button" class="ak-round ak-pause" data-pause aria-label="Пауза (P)"><span aria-hidden="true">❚❚</span></button>
      <div class="ak-bubble" data-bubble hidden aria-live="polite"></div>
      <div class="ak-screen" data-screen></div>
    </div>
    <p class="ak-rotate">Завърти телефона хоризонтално, за да е по-голяма кухнята.</p>`;
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (root.querySelector(s));
  const stage = $('.ak-stage');
  const canvas = /** @type {HTMLCanvasElement} */ ($('canvas'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const screen = $('[data-screen]');
  const bubble = $('[data-bubble]');
  const hud = { score: $('[data-score]'), level: $('[data-level]'), goal: $('[data-goal]'), lives: $('[data-lives]') };

  // ---------- size ----------
  let scale = 1;
  /** @type {HTMLCanvasElement} */
  let background = document.createElement('canvas');
  /** @type {CanvasPattern | null} */
  let checks = null;

  function resize() {
    // The kitchen keeps its shape (16:9) and takes all the place it has.
    const availW = root.clientWidth || innerWidth;
    const availH = (root.clientHeight || innerHeight);
    const cssW = Math.min(availW, availH * (W / H));
    if (!(cssW > 0)) return;  // hidden for now: the observer below calls again when there is a size
    stage.style.width = `${cssW}px`;
    stage.style.height = `${cssW * (H / W)}px`;
    scale = (cssW * (devicePixelRatio || 1)) / W;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    background = makeBackground();
    checks = makeChecks();
  }

  function makeChecks() {
    const size = Math.ceil(24 * scale);
    const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#ff5b4a';
    g.fillRect(0, 0, size / 2, size / 2); g.fillRect(size / 2, size / 2, size / 2, size / 2);
    g.fillStyle = 'rgba(255,91,74,.35)';
    g.fillRect(size / 2, 0, size / 2, size / 2); g.fillRect(0, size / 2, size / 2, size / 2);
    const pattern = ctx.createPattern(c, 'repeat');
    pattern?.setTransform(new DOMMatrix().scale(1 / scale));
    return pattern;
  }

  function cloud(g, x, y, s) {
    const puffs = [[-30, 6, 20], [-8, -8, 26], [20, -2, 22], [40, 8, 16], [4, 10, 22]];
    g.fillStyle = 'rgba(30,90,170,.18)';
    for (const [px, py, r] of puffs) { g.beginPath(); g.arc(x + px * s, y + (py + 6) * s, r * s, 0, Math.PI * 2); g.fill(); }
    for (const [px, py, r] of puffs) {
      const fill = g.createRadialGradient(x + (px - r * 0.3) * s, y + (py - r * 0.4) * s, 1, x + px * s, y + py * s, r * s);
      fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.7, '#f4f8ff'); fill.addColorStop(1, '#d6e4f7');
      g.fillStyle = fill;
      g.beginPath(); g.arc(x + px * s, y + py * s, r * s, 0, Math.PI * 2); g.fill();
    }
  }

  function makeBackground() {
    const c = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    g.scale(scale, scale);
    // the wall
    const wall = g.createLinearGradient(0, 0, 0, FLOOR_Y);
    wall.addColorStop(0, '#5cbcff'); wall.addColorStop(1, '#2f8fe8');
    g.fillStyle = wall; g.fillRect(0, 0, W, FLOOR_Y);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
    for (let y = 300; y < FLOOR_Y; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let y = 300, k = 0; y < FLOOR_Y; y += 34, k++) {
      for (let x = (k % 2) * 34; x < W; x += 68) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke(); }
    }
    // the window with clouds
    const win = { x: 330, y: 52, w: 230, h: 170 };
    g.fillStyle = 'rgba(20,70,150,.25)'; roundRect(g, win.x + 6, win.y + 10, win.w, win.h, 18); g.fill();
    g.fillStyle = '#fff'; roundRect(g, win.x - 10, win.y - 10, win.w + 20, win.h + 20, 22); g.fill();
    const sky = g.createLinearGradient(0, win.y, 0, win.y + win.h);
    sky.addColorStop(0, '#9fdcff'); sky.addColorStop(1, '#d9f2ff');
    g.fillStyle = sky; roundRect(g, win.x, win.y, win.w, win.h, 14); g.fill();
    g.save(); roundRect(g, win.x, win.y, win.w, win.h, 14); g.clip();
    cloud(g, win.x + 70, win.y + 60, 0.9);
    cloud(g, win.x + 175, win.y + 120, 0.7);
    g.restore();
    g.fillStyle = '#fff';
    g.fillRect(win.x + win.w / 2 - 4, win.y, 8, win.h); g.fillRect(win.x, win.y + win.h / 2 - 4, win.w, 8);
    g.fillStyle = '#ff7a3d'; roundRect(g, win.x - 24, win.y + win.h + 6, win.w + 48, 12, 6); g.fill();
    // a clock
    g.fillStyle = 'rgba(20,70,150,.25)'; g.beginPath(); g.arc(244, 176, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff7a3d'; g.beginPath(); g.arc(240, 170, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(240, 170, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineCap = 'round';
    g.lineWidth = 4; g.beginPath(); g.moveTo(240, 170); g.lineTo(240, 150); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(240, 170); g.lineTo(258, 170); g.stroke();
    // the floor
    const floor = g.createLinearGradient(0, FLOOR_Y, 0, H);
    floor.addColorStop(0, '#ff8a4c'); floor.addColorStop(0.2, '#f26b2b'); floor.addColorStop(1, '#d8521c');
    g.fillStyle = floor; g.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    g.fillStyle = '#ffb27f'; g.fillRect(0, FLOOR_Y, W, 4);
    g.strokeStyle = 'rgba(160,50,10,.25)'; g.lineWidth = 2;
    for (let x = -60; x < W; x += 70) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 40, FLOOR_Y + 4); g.stroke(); }
    // the shelf with its bracket
    g.fillStyle = 'rgba(20,70,150,.28)'; roundRect(g, 0, SHELF.y + 6, SHELF.x2 + 6, 14, 6); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(20, SHELF.y + 8); g.lineTo(70, SHELF.y + 8); g.lineTo(20, SHELF.y + 58); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; roundRect(g, -10, SHELF.y, SHELF.x2 + 10, 13, 6); g.fill();
    g.fillStyle = '#d9e9fb'; g.fillRect(0, SHELF.y + 9, SHELF.x2 - 2, 4);
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }

  // ---------- the game state ----------
  /** @type {'menu' | 'intro' | 'aim' | 'fly' | 'hit' | 'miss' | 'over'} */
  let state = 'menu';
  let paused = false;
  let cups = 0;
  let level = 1;
  /** @type {string[]} the kittens still playing; the first one sits in the slingshot */
  let kittens = [];
  /** @type {Target} */
  let target = { kind: 'kind', which: 'acute', ...KINDS.acute };
  /** @type {(keyof typeof KINDS)[]} */
  let kindBag = [];
  let tableX = 320;     // where the table stands now (its left edge); the chair stands right of it
  let tableW = 172;
  let tableTop = FLOOR_Y - 118;
  let tableFrom = 320;
  let tableTo = 320;
  let clock = 0;        // seconds in the current state
  let aim = 60;         // degrees from the plumb line
  let pull = 0;         // how far the kitten is pulled back (only the look)
  let aiming = false;
  /** @type {{ x: number, y: number }[]} */
  let trail = [];
  let tutorial = true;   // the first shot of the visit: an arrow shows how to pull the kitten
  let showTarget = true; // until the first hit: a target on the cloth
  /**
   * @type {null | {
   *   angle: number, outcome: Outcome, vx: number, vy: number, T: number, t: number,
   *   x: number, y: number, look: string, land: { x: number, y: number },
   * }}
   */
  let shot = null;
  let cloth = 0;        // how far the tablecloth has been pulled off the table
  /**
   * The things on the table: they slide with the cloth and fall when they pass the edge.
   * @type {{ kind: string, at: number, w: number, h: number, fall: null | { x: number, y: number, vy: number, rot: number, broken: boolean } }[]}
   */
  let items = [];
  let brokenAt = 0;     // when the last thing broke (seconds in the 'hit' state); 0 = not yet
  let scold = false;    // this time the woman comes and the kitten runs away
  let hitsSinceScold = 0;
  let scoldText = '';
  /** @type {{ x: number, y: number, vx: number, vy: number, rot: number, vr: number, color: string, size: number, life: number, kind: string }[]} */
  let bits = [];
  /** @type {null | { text: string, x: number, y: number, t: number }} */
  let shout = null;
  /** @type {null | { text: string, t: number }} */
  let banner = null;
  let news = '';        // what the cat adds the first time a level brings something new

  const tableRight = () => tableX + tableW;
  const watcher = () => ({ x: FRIDGE.x + FRIDGE.w * 0.62, y: FLOOR_Y - FRIDGE.h });

  /** The table distance for the middle of the range: there the shot at speed V0 hits the middle of the cloth. */
  function placeTable(lo, hi) {
    const a = rad((lo + hi) / 2);
    const D = tableTop + CLOTH_H / 2 - LAUNCH.y;
    const s = Math.sin(a);
    const A = G / (2 * V0 * V0 * s * s);
    const B = Math.cos(a) / s;
    let dx = (-B + Math.sqrt(B * B + 4 * A * D)) / (2 * A);
    // the smallest angle of the range has to reach the cloth: steep shots need the table close
    if (lo < 90) dx = Math.min(dx, (tableTop + CLOTH_H - 8 - LAUNCH.y) * Math.tan(rad(lo)) * 0.88);
    // the table and its chair stay in front of the fridge's left side at most
    return clamp(LAUNCH.x + dx, LAUNCH.x + 40, FRIDGE.x + 30 - CHAIR_W - tableW);
  }

  function newTarget() {
    const width = widthFor(level);
    if (width === null) {
      if (!kindBag.length) kindBag = /** @type {(keyof typeof KINDS)[]} */ (['acute', 'right', 'obtuse']).sort(() => Math.random() - 0.5);
      const which = /** @type {keyof typeof KINDS} */ (kindBag.pop());
      target = { kind: 'kind', which, lo: KINDS[which].lo, hi: KINDS[which].hi };
    } else {
      const step = width >= 15 ? 5 : 1;
      const first = Math.ceil(15 / step);
      const last = Math.floor((165 - width) / step);
      const lo = (first + rand(last - first + 1)) * step;
      target = { kind: 'range', lo, hi: lo + width };
    }
    const table = tableFor(level);
    tableW = table.w;
    tableTop = FLOOR_Y - table.h;
    tableFrom = tableX;
    tableTo = placeTable(target.lo, target.hi);
    trail = [];
  }

  const goalText = () => (target.kind === 'kind' ? KINDS[target.which].say : `от ${target.lo}° до ${target.hi}°`);

  function newGame() {
    cups = 0;
    news = '';
    hitsSinceScold = 0;
    level = 1;
    kittens = ['ginger', 'grey', 'black'];
    kindBag = ['obtuse', 'right', 'acute'];  // the first rounds go in this order: acute, right, obtuse
    tableW = TABLES[0].w;
    tableTop = FLOOR_Y - TABLES[0].h;
    tableX = placeTable(KINDS.acute.lo, KINDS.acute.hi);
    startRound(true);
  }

  /** @param {boolean} fresh a new target (after a cup or at the start), or the same one again after a miss */
  function startRound(fresh) {
    if (fresh) newTarget();
    else { tableFrom = tableX; tableTo = tableX; }
    state = 'intro';
    clock = 0;
    shot = null;
    cloth = 0;
    items = setFor(level).items.map(([kind, at, w, h]) => ({ kind: String(kind), at: (Number(at) * tableW) / 172, w: Number(w), h: Number(h), fall: null }));
    brokenAt = 0;
    scold = false;
    shout = null;
    pull = 0;
    say('Хмм… 🔭', 'Смятам…');
    updateHud();
  }

  // ---------- the shot ----------
  /** The speed that takes the kitten from the fork at `angle` through (x, y), or null if it cannot get there. */
  function solve(angle, x, y) {
    const a = rad(angle);
    const s = Math.sin(a);
    const c = Math.cos(a);
    const dx = x - LAUNCH.x;
    const dy = y - LAUNCH.y;
    const denom = 2 * s * s * (dy - (dx * c) / s);
    if (dx <= 0 || denom <= 0) return null;
    const v = Math.sqrt((G * dx * dx) / denom);
    return { vx: v * s, vy: v * c, T: dx / (v * s) };
  }

  /** Does the flight to (x, y) stay clear of the table and the cup (apart from where it lands)? */
  function clear(fly, landsOnTable) {
    for (let k = 1; k < 60; k++) {
      const t = (fly.T * k) / 60;
      if (landsOnTable && t > fly.T * 0.9) break;
      const x = LAUNCH.x + fly.vx * t;
      const y = LAUNCH.y + fly.vy * t + (G * t * t) / 2;
      if (x > tableX - CAT_R * 0.6 && x < tableRight() + CAT_R * 0.6 && y > tableTop - CAT_R * 0.9) return false;
      for (const it of items) {
        const left = tableX + it.at - it.w / 2 - CAT_R * 0.8;
        if (x > left && x < left + it.w + CAT_R * 1.6 && y > tableTop - it.h - CAT_R * 0.8) return false;
      }
    }
    return true;
  }

  /** Where the kitten flies for this angle: inside the range it always catches the cloth, outside it never does. */
  function plan(angle) {
    const { lo, hi } = target;
    const reach = (y) => (angle < 90 ? LAUNCH.x + (y - LAUNCH.y) * Math.tan(rad(angle)) * 0.9 : Infinity);
    if (angle >= lo && angle <= hi) {
      // a bigger angle catches the cloth higher up
      const u = hi > lo ? (angle - lo) / (hi - lo) : 0.5;
      const x = tableX - CAT_R * 0.55;
      const lowest = tableTop + CLOTH_H - 6;
      let y = lowest - u * (CLOTH_H - 14);
      if (angle < 90) y = Math.max(y, LAUNCH.y + ((x - LAUNCH.x) / Math.tan(rad(angle))) / 0.9);
      y = Math.min(y, lowest);
      return { outcome: /** @type {Outcome} */ ('hit'), x, y, fly: solve(angle, x, y) };
    }
    const floorY = FLOOR_Y - CAT_R;
    if (angle < lo) {
      const x = clamp(Math.min(tableX - CAT_R - 10 - (lo - angle) * 5, reach(floorY)), LAUNCH.x + 8, tableX - CAT_R - 6);
      return { outcome: /** @type {Outcome} */ ('short'), x, y: floorY, fly: solve(angle, x, floorY) };
    }
    // too big: over the table to the floor behind it, else onto the table in front of the cup
    const beyond = Math.min(W - 34, tableRight() + CAT_R + 24 + (angle - hi) * 4);
    const onTable = tableTop - 3 - CAT_R;
    const front = tableX + CAT_R + 4;
    const options = [
      { outcome: /** @type {Outcome} */ ('beyond'), x: beyond, y: floorY },
      { outcome: /** @type {Outcome} */ ('table'), x: Math.min(front + (angle - hi) * 2, reach(onTable)), y: onTable },
      { outcome: /** @type {Outcome} */ ('table'), x: front, y: onTable },
      // very steep: it only just gets past the edge of the table
      { outcome: /** @type {Outcome} */ ('table'), x: clamp(reach(onTable), tableX + 2, front), y: onTable },
    ];
    for (const o of options) {
      const fly = solve(angle, o.x, o.y);
      if (fly && clear(fly, o.outcome === 'table')) return { ...o, fly };
    }
    const last = options[options.length - 1];
    return { ...last, fly: solve(angle, last.x, last.y) };
  }

  function fire() {
    if (state !== 'aim' || paused) return;
    const angle = Math.round(aim);
    const p = plan(angle);
    const fly = p.fly || { vx: 300, vy: 300, T: 0.5 };   // never needed: plan() keeps every target reachable
    shot = { angle, outcome: p.outcome, ...fly, t: 0, x: LAUNCH.x, y: LAUNCH.y, look: kittens[0], land: { x: p.x, y: p.y } };
    trail = [];
    tutorial = false;
    state = 'fly';
    clock = 0;
    pull = 0;
    bubble.hidden = true;
    sound('shoot');
  }

  /** What the cat on the fridge says after the shot. */
  function verdict(angle, outcome) {
    const kind = angle < 90 ? 'остър' : angle === 90 ? 'прав' : 'тъп';
    const why = {
      hit: '',
      short: 'Котето падна преди масата.',
      table: 'Котето кацна на масата, но не хвана покривката.',
      beyond: 'Котето прелетя над масата.',
    }[outcome];
    if (target.kind === 'kind') {
      return outcome === 'hit'
        ? [`Браво! ${angle}° е ${kind} ъгъл.`, '']
        : [`${angle}° е ${kind} ъгъл, а трябва ${KINDS[target.which].say}.`, why];
    }
    if (outcome === 'hit') return [`Браво! ${angle}° е между ${target.lo}° и ${target.hi}°.`, ''];
    return angle < target.lo
      ? [`${angle}° е по-малко от ${target.lo}°.`, why]
      : [`${angle}° е повече от ${target.hi}°.`, why];
  }

  function land() {
    if (!shot) return;
    shot.x = shot.land.x;
    shot.y = shot.land.y;
    const [text, small] = verdict(shot.angle, shot.outcome);
    clock = 0;
    if (shot.outcome === 'hit') {
      state = 'hit';
      sound('meow');
      shout = { text: 'Мяу!', x: shot.x - 10, y: shot.y - 40, t: 0 };
      cups += 1;
      showTarget = false;
      platform.onPoint?.(cups);
      // now and then the woman of the house comes to see what broke
      hitsSinceScold += 1;
      scold = cups >= 2 && (hitsSinceScold >= 4 || Math.random() < 0.35);
      if (scold) { hitsSinceScold = 0; scoldText = pick(SCOLDS[setFor(level).name]); }
      say(text, small);
    } else {
      state = 'miss';
      sound('thud');
      dust(shot.x, shot.y + CAT_R);
      say(text, small);
    }
    updateHud();
  }

  function dust(x, y) {
    for (let k = 0; k < 10; k++) {
      bits.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, rot: 0, vr: 0, color: 'rgba(255,255,255,.8)', size: 4 + Math.random() * 5, life: 0.6, kind: 'puff' });
    }
  }

  /** Pieces of what broke: shards, and what was inside (coffee, water and flowers, chicken). */
  function crash(x, y, kind) {
    sound('crash');
    const shard = { cup: ['#ffffff', '#ff5b4a'], vase: ['#4fb0ff', '#ffffff'], turkey: ['#ffffff', '#dbe8f6'] }[kind] || ['#fff', '#fff'];
    for (let k = 0; k < 14; k++) {
      bits.push({ x, y: y - 6, vx: (Math.random() - 0.5) * 380, vy: -120 - Math.random() * 260, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, color: shard[k % 3 === 0 ? 1 : 0], size: 5 + Math.random() * 6, life: 1.4, kind: 'shard' });
    }
    const drop = { cup: ['#8a4b23'], vase: ['#9fe0ff', '#ff7fb0', '#ffd23f'], turkey: ['#c8742e', '#5bc236'] }[kind] || ['#fff'];
    for (let k = 0; k < 10; k++) {
      bits.push({ x, y: y - 4, vx: (Math.random() - 0.5) * 260, vy: -60 - Math.random() * 200, rot: 0, vr: 0, color: pick(drop), size: 3 + Math.random() * 4, life: 1, kind: 'drop' });
    }
    if (kind === 'turkey') {
      for (let k = 0; k < 2; k++) {
        bits.push({ x, y: y - 10, vx: (k ? 1 : -1) * (80 + Math.random() * 120), vy: -260 - Math.random() * 140, rot: 0, vr: (k ? 1 : -1) * 9, color: '#c8742e', size: 9, life: 1.6, kind: 'leg' });
      }
    }
  }

  function hearts(x, y) {
    for (let k = 0; k < 7; k++) {
      bits.push({ x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 90, vy: -90 - Math.random() * 90, rot: 0, vr: 0, color: k % 2 ? '#ff5b8a' : '#ffd23f', size: 9 + Math.random() * 5, life: 1.3, kind: k % 2 ? 'heart' : 'star' });
    }
  }

  function levelUp() {
    const next = 1 + Math.floor(cups / HITS_PER_LEVEL);
    if (next === level) return false;
    level = next;
    sound('level');
    banner = { text: `Ниво ${level}`, t: 0 };
    if (widthFor(level) !== null && widthFor(level - 1) === null) news = 'Вече ти казвам и градусите.';
    else if (widthFor(level) !== null) news = 'Обхватът стана по-тесен.';
    return true;
  }

  // ---------- update ----------
  function update(dt) {
    for (const b of bits) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.kind === 'shard' || b.kind === 'drop' || b.kind === 'leg') {
        b.vy += G * 0.8 * dt;
        if (b.y > FLOOR_Y + 6) { b.y = FLOOR_Y + 6; b.vy *= -0.3; b.vx *= 0.6; b.vr *= 0.5; }
      } else b.vy += (b.kind === 'puff' ? 0 : 60) * dt;
    }
    bits = bits.filter((b) => b.life > 0);
    if (shout) shout.t += dt;
    if (banner) { banner.t += dt; if (banner.t > 1.6) banner = null; }
    if (paused || state === 'menu' || state === 'over') return;
    clock += dt;

    if (state === 'intro') {
      const k = clamp(clock / 0.9, 0, 1);
      tableX = tableFrom + (tableTo - tableFrom) * ease(k);
      if (clock > 1) {
        state = 'aim';
        const kindHelp = target.kind === 'kind' ? 'Дърпай котето назад и го пусни.' : '';
        const words = target.kind === 'kind' ? `Стреляй под ${KINDS[target.which].say}!` : `Стреляй между ${target.lo}° и ${target.hi}°!`;
        say(words, news || kindHelp);
        news = '';
        updateHud();
      }
    }

    if (state === 'fly' && shot) {
      shot.t = Math.min(shot.t + dt, shot.T);
      shot.x = LAUNCH.x + shot.vx * shot.t;
      shot.y = LAUNCH.y + shot.vy * shot.t + (G * shot.t * shot.t) / 2;
      const lastDot = trail[trail.length - 1];
      if (!lastDot || Math.hypot(shot.x - lastDot.x, shot.y - lastDot.y) > 16) trail.push({ x: shot.x, y: shot.y });
      if (shot.t >= shot.T) land();
    }

    if (state === 'hit' && shot) {
      // the kitten hangs on the cloth and pulls it; what is on the table slides to the edge and falls
      const full = Math.max(...items.map((it) => it.at)) + 8;
      cloth = full * clamp((clock - 0.15) / (0.75 * Math.sqrt(full / 111)), 0, 1) ** 2;
      for (const it of items) {
        const x = tableX + it.at - cloth;
        if (!it.fall && x < tableX - 2) {
          it.fall = { x, y: tableTop - 3, vy: 0, rot: 0, broken: false };
          sound('slide');
        }
        const f = it.fall;
        if (f && !f.broken) {
          f.vy += G * dt;
          f.y += f.vy * dt;
          f.x -= 40 * dt;
          f.rot -= 5 * dt;
          if (f.y >= FLOOR_Y) { f.broken = true; crash(f.x, FLOOR_Y, it.kind); }
        }
      }
      if (!brokenAt && items.every((it) => it.fall?.broken)) { brokenAt = clock; hearts(shot.x, shot.y - 30); }
      // the kitten goes down with the cloth, then jumps to the floor when everything is broken
      if (brokenAt) shot.y = Math.min(FLOOR_Y - CAT_R, shot.y + 420 * dt);
      else shot.y = shot.land.y + cloth * 0.35;
      const since = brokenAt ? clock - brokenAt : 0;
      if (scold && brokenAt) {
        if (since > 1.2 && since - dt <= 1.2) sound('scold');
        if (since > 1.7) {
          if (since - dt <= 1.7) { shout = { text: 'Мяу!', x: shot.x, y: shot.y - 40, t: 0 }; sound('meow'); }
          shot.x -= 420 * dt;  // runs away to the left, very pleased
        }
      }
      if (brokenAt && since > (scold ? 4.1 : 1.6)) {
        kittens.push(/** @type {string} */ (kittens.shift()));
        levelUp();
        startRound(true);
      }
    }

    if (state === 'miss' && shot) {
      if (clock > 0.55 && !shout) { shout = { text: 'Сссс!', x: shot.x + 6, y: shot.y - 44, t: 0 }; sound('hiss'); }
      if (clock > 1.9) shot.x -= 260 * dt;  // runs away
      if (clock > 2.7) {
        kittens.shift();
        if (!kittens.length) { gameOver(); return; }
        startRound(false);
      }
    }
  }

  // ---------- drawing ----------
  /**
   * A kitten in the style of the shop pictures: chubby, outlined, light belly, pink ears.
   * @param {CanvasRenderingContext2D} g
   * @param {Look} look
   * @param {{ pose?: 'sit' | 'ball' | 'hang', mood?: 'calm' | 'fierce' | 'happy' | 'sour' | 'hiss', size?: number, flip?: boolean, rot?: number, binoculars?: boolean, squash?: number }} o
   */
  function kitten(g, x, y, look, o = {}) {
    const { pose = 'sit', mood = 'calm', size = 1, flip = false, rot = 0, binoculars = false, squash = 0 } = o;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale((flip ? -size : size) * (1 + squash * 0.25), size * (1 - squash * 0.25));
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 2.2;
    const blob = (cx, cy, rx, ry, fill, stroke = true) => {
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      if (stroke) g.stroke();
    };
    const tail = (points) => {
      g.beginPath(); g.moveTo(points[0], points[1]); g.quadraticCurveTo(points[2], points[3], points[4], points[5]);
      g.lineWidth = 8.5; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 5.5; g.strokeStyle = look.fur; g.stroke();
      g.lineWidth = 2.2; g.strokeStyle = INK;
    };
    const ear = (ax, ay, bx, by, cx, cy, flat) => {
      const tipY = flat ? by + 7 : by;
      const tipX = flat ? bx + (bx < 0 ? -5 : 5) : bx;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(tipX, tipY); g.lineTo(cx, cy); g.closePath();
      g.fillStyle = look.fur; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(ax + (cx - ax) * 0.25, ay + 1); g.lineTo(tipX + (ax + cx) * 0.02, tipY + 5); g.lineTo(cx - (cx - ax) * 0.25, cy + 1); g.closePath();
      g.fillStyle = '#ff9fb0'; g.fill();
    };

    /** The face around (fx, fy). */
    const face = (fx, fy) => {
      const ex = 6;
      g.fillStyle = INK;
      if (mood === 'happy') {
        g.lineWidth = 2.2;
        for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * ex, fy + 1, 3, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      } else if (mood === 'sour') {
        g.lineWidth = 2;
        for (const s of [-1, 1]) {
          g.beginPath(); g.moveTo(fx + s * ex - 3.5, fy - 1); g.lineTo(fx + s * ex + 3.5, fy - 1); g.stroke();
          g.beginPath(); g.arc(fx + s * ex, fy + 0.5, 2, 0, Math.PI); g.fill();
        }
      } else {
        for (const s of [-1, 1]) {
          g.beginPath(); g.ellipse(fx + s * ex, fy, 2.3, 2.8, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(fx + s * ex + 0.8, fy - 1, 0.9, 0, Math.PI * 2); g.fill(); g.fillStyle = INK;
        }
      }
      if (mood === 'fierce' || mood === 'hiss') {
        g.lineWidth = 2.6;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(fx + s * (ex + 4.5), fy - 6.5); g.lineTo(fx + s * (ex - 3), fy - 3.5); g.stroke(); }
      }
      g.lineWidth = 1.6;
      // nose and mouth
      g.fillStyle = '#ff7f95';
      g.beginPath(); g.moveTo(fx - 1.8, fy + 3.2); g.lineTo(fx + 1.8, fy + 3.2); g.lineTo(fx, fy + 5); g.closePath(); g.fill();
      if (mood === 'hiss') {
        g.fillStyle = '#7a1b2b';
        g.beginPath(); g.ellipse(fx, fy + 8.5, 4, 3.4, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(fx - 3, fy + 5.8); g.lineTo(fx - 1.6, fy + 9); g.lineTo(fx - 0.6, fy + 5.8); g.fill();
        g.beginPath(); g.moveTo(fx + 3, fy + 5.8); g.lineTo(fx + 1.6, fy + 9); g.lineTo(fx + 0.6, fy + 5.8); g.fill();
      } else if (mood === 'happy') {
        g.fillStyle = '#c2344f';
        g.beginPath(); g.arc(fx, fy + 6, 3.4, 0, Math.PI); g.closePath(); g.fill(); g.stroke();
      } else if (mood === 'sour') {
        g.beginPath(); g.moveTo(fx - 3.5, fy + 8.5); g.quadraticCurveTo(fx, fy + 5.5, fx + 3.5, fy + 8.5); g.stroke();
      } else {
        g.beginPath(); g.arc(fx - 1.8, fy + 5.2, 1.8, 0.1, Math.PI - 0.1); g.stroke();
        g.beginPath(); g.arc(fx + 1.8, fy + 5.2, 1.8, 0.1, Math.PI - 0.1); g.stroke();
      }
      // blush and whiskers
      g.fillStyle = 'rgba(255,120,140,.45)';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(fx + s * 11, fy + 4, 3.2, 2, 0, 0, Math.PI * 2); g.fill(); }
      g.lineWidth = 1;
      for (const s of [-1, 1]) {
        for (const dy of [-1.5, 2]) { g.beginPath(); g.moveTo(fx + s * 12, fy + 3 + dy * 0.3); g.lineTo(fx + s * 21, fy + 2 + dy); g.stroke(); }
      }
      g.lineWidth = 2.2;
      if (look.shades) {
        g.fillStyle = '#111';
        for (const s of [-1, 1]) { g.beginPath(); g.roundRect(fx + s * ex - 4.5, fy - 3.5, 9, 6.5, 2.5); g.fill(); }
        g.fillRect(fx - 2, fy - 2.5, 4, 1.6);
        g.fillStyle = 'rgba(255,255,255,.6)';
        for (const s of [-1, 1]) g.fillRect(fx + s * ex - 3, fy - 2.5, 3, 1.2);
      }
      if (binoculars) {
        // two round lenses in front of the eyes, held with both paws
        g.fillStyle = '#ff7a3d'; g.fillRect(fx - 3, fy - 2, 6, 3);
        for (const s of [-1, 1]) {
          blob(fx + s * ex, fy, 5.6, 5.6, '#ff7a3d');
          blob(fx + s * ex, fy, 3.6, 3.6, '#bfeaff', false);
          g.fillStyle = '#fff'; g.beginPath(); g.arc(fx + s * ex - 1.2, fy - 1.3, 1.2, 0, Math.PI * 2); g.fill();
        }
        blob(fx - 12, fy + 4, 3.8, 3.2, look.fur);
        blob(fx + 12, fy + 4, 3.8, 3.2, look.fur);
      }
    };

    const stripes = (cx, cy) => {
      if (look !== LOOKS.ginger) return;
      g.strokeStyle = look.dark; g.lineWidth = 2.4;
      for (const dx of [-4, 0, 4]) { g.beginPath(); g.moveTo(cx + dx, cy); g.lineTo(cx + dx * 0.8, cy + 5); g.stroke(); }
      g.strokeStyle = INK; g.lineWidth = 2.2;
    };

    if (pose === 'sit') {
      tail([10, 15, 32, 14, 26, -6]);
      blob(2, 4, 14.5, 15.5, look.fur);
      blob(-1, 7, 8, 10, look.belly, false);
      blob(12, 17, 6.5, 4, look.fur);
      blob(-5, 18.5, 4.5, 3.4, look.fur);
      blob(3, 19, 4.5, 3.4, look.fur);
      ear(-13, -20, -10, -36, -1, -26, mood === 'hiss');
      ear(5, -26, 14, -37, 17, -19, mood === 'hiss');
      blob(2, -16, 16.5, 13.5, look.fur);
      stripes(2, -29);
      face(2, -16);
    } else {
      // a ball, like the birds: the head and the body are one
      tail(pose === 'hang' ? [-6, 14, -14, 30, -4, 34] : [-15, 6, -30, 6, -28, -10]);
      ear(-13, -9, -10, -27, -1, -16, mood === 'hiss');
      ear(1, -16, 10, -27, 13, -9, mood === 'hiss');
      blob(0, 0, 18, 17, look.fur);
      blob(0, 8, 10, 7.5, look.belly, false);
      stripes(0, -16);
      if (pose === 'hang') {
        blob(13, -15, 5, 4, look.fur); blob(17, -6, 5, 4, look.fur);
        g.lineWidth = 1.4;
        for (const [px, py] of [[13, -15], [17, -6]]) for (const k of [-2, 0, 2]) { g.beginPath(); g.moveTo(px + 4, py + k); g.lineTo(px + 7, py + k - 1); g.stroke(); }
        g.lineWidth = 2.2;
      } else {
        blob(-7, 16, 4.5, 3.4, look.fur);
        blob(7, 16, 4.5, 3.4, look.fur);
      }
      face(0, -2);
    }
    g.restore();
  }

  function drawSlingshot(front) {
    const g = ctx;
    const base = { x: 112, y: SHELF.y };
    const tipL = { x: 108, y: 132 };
    const tipR = { x: 140, y: 130 };
    const ball = state === 'aim' ? pulled() : LAUNCH;
    // the pouch is behind the kitten, on the side away from the shot
    const a = rad(aim);
    const pouch = { x: ball.x - Math.sin(a) * 14, y: ball.y - Math.cos(a) * 14 };
    const loaded = state === 'aim' || state === 'intro';
    g.lineCap = 'round';
    if (!front) {
      // the back band and the pouch, then the wood
      g.strokeStyle = '#7a2e1c'; g.lineWidth = 5;
      if (loaded) {
        g.beginPath(); g.moveTo(tipL.x, tipL.y); g.lineTo(pouch.x, pouch.y); g.stroke();
        g.fillStyle = '#5b2414';
        g.beginPath(); g.ellipse(pouch.x, pouch.y, 9, 13, Math.PI / 2 - a, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = INK; g.lineWidth = 13;
      g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(122, 166); g.lineTo(tipL.x, tipL.y); g.moveTo(122, 166); g.lineTo(tipR.x, tipR.y); g.stroke();
      g.strokeStyle = '#c9773a'; g.lineWidth = 8.5;
      g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(122, 166); g.lineTo(tipL.x, tipL.y); g.moveTo(122, 166); g.lineTo(tipR.x, tipR.y); g.stroke();
      g.strokeStyle = '#e9a466'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(base.x - 1, base.y - 4); g.lineTo(120, 168); g.lineTo(tipL.x - 1, tipL.y + 3); g.stroke();
      return;
    }
    if (loaded) {
      g.strokeStyle = '#7a2e1c'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(tipR.x, tipR.y); g.lineTo(pouch.x, pouch.y); g.stroke();
    }
  }

  function pulled() {
    const a = rad(aim);
    return { x: LAUNCH.x - Math.sin(a) * pull, y: LAUNCH.y - Math.cos(a) * pull };
  }

  /** While the kitten is pulled: the plumb line under the slingshot, the arc (a square at exactly 90°), no number. */
  function drawAngle() {
    const g = ctx;
    const { x, y } = LAUNCH;
    const showAim = state === 'aim' && (aiming || pull > 0);
    if (!showAim) return;  // nothing to grab here: the angle shows up only while the kitten is pulled
    g.save();
    g.lineCap = 'round';
    // the plumb line with its weight
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 96); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#ffd23f'; g.strokeStyle = INK; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x - 6, y + 96); g.lineTo(x + 6, y + 96); g.lineTo(x, y + 110); g.closePath(); g.fill(); g.stroke();
    {
      const a = Math.round(aim);
      const end = Math.PI / 2 - rad(a);
      if (a === 90) {
        g.fillStyle = 'rgba(255,210,63,.45)'; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.lineTo(x + 24, y + 24); g.lineTo(x + 24, y); g.closePath(); g.fill(); g.stroke();
      } else {
        g.fillStyle = 'rgba(255,210,63,.4)';
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, 44, end, Math.PI / 2); g.closePath(); g.fill();
        g.strokeStyle = '#ffd23f'; g.lineWidth = 3.5;
        g.beginPath(); g.arc(x, y, 44, end, Math.PI / 2); g.stroke();
      }
      ray(a, '#fff', 92);
    }
    g.restore();
  }

  function ray(angle, color, length) {
    const a = rad(angle);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(LAUNCH.x, LAUNCH.y); ctx.lineTo(LAUNCH.x + Math.sin(a) * length, LAUNCH.y + Math.cos(a) * length); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawFridge() {
    const g = ctx;
    const x = FRIDGE.x;
    const top = FLOOR_Y - FRIDGE.h;
    g.fillStyle = 'rgba(20,70,150,.25)'; roundRect(g, x + 8, top + 10, FRIDGE.w, FRIDGE.h - 10, 18); g.fill();
    const body = g.createLinearGradient(x, 0, x + FRIDGE.w, 0);
    body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#dce9f7');
    g.fillStyle = body; roundRect(g, x, top, FRIDGE.w, FRIDGE.h - 6, 18); g.fill();
    g.strokeStyle = '#b8cde4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 4, top + 88); g.lineTo(x + FRIDGE.w - 4, top + 88); g.stroke();
    g.fillStyle = '#b8cde4';
    roundRect(g, x + 12, top + 30, 8, 40, 4); g.fill();
    roundRect(g, x + 12, top + 104, 8, 60, 4); g.fill();
    // magnets and a drawing of a cup
    g.fillStyle = '#ff7a3d'; g.beginPath(); g.arc(x + 80, top + 40, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x + 98, top + 58, 6, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(x + 74, top + 130); g.rotate(0.08);
    g.fillStyle = '#fff'; g.fillRect(-18, -20, 36, 44);
    g.strokeStyle = '#2f8fe8'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-8, 12); g.lineTo(-6, -6); g.lineTo(6, -6); g.lineTo(8, 12); g.closePath(); g.stroke();
    g.beginPath(); g.arc(9, 2, 5, -1.2, 1.2); g.stroke();
    g.fillStyle = '#ff5b4a'; g.beginPath(); g.arc(0, -20, 3.5, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = '#8fa9c6';
    g.fillRect(x + 12, FLOOR_Y - 8, 14, 8); g.fillRect(x + FRIDGE.w - 26, FLOOR_Y - 8, 14, 8);
  }

  function drawWatcher() {
    const w = watcher();
    const looking = state === 'intro' || state === 'aim' || state === 'fly';
    const mood = state === 'hit' && clock > 0.8 ? 'happy' : state === 'miss' && clock > 0.4 ? 'sour' : 'calm';
    const bob = state === 'intro' ? Math.sin(clock * 14) * 1.2 : 0;
    kitten(ctx, w.x, w.y - 20 + bob, LOOKS.lilac, { flip: true, binoculars: looking, mood, size: 1.15 });
    if (state === 'intro') {
      // thinking: little numbers float up
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = '800 14px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
      ['°', '?', '°'].forEach((s, k) => {
        const t = (clock * 1.4 + k / 3) % 1;
        ctx.globalAlpha = 1 - t;
        ctx.fillText(s, w.x + 18 + k * 8, w.y - 50 - t * 30);
      });
      ctx.globalAlpha = 1;
    }
  }

  /** The chair on the far side of the table, its back away from the table. */
  function drawChair() {
    const g = ctx;
    const x = tableRight() + 8;
    const seat = FLOOR_Y - 64;
    g.save();
    g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round';
    const wood = (bx, by, bw, bh) => { g.fillStyle = '#c9773a'; g.beginPath(); g.roundRect(bx, by, bw, bh, 3); g.fill(); g.stroke(); };
    wood(x + 4, seat + 6, 8, FLOOR_Y - seat - 6);
    wood(x + CHAIR_W - 12, seat - 86, 9, FLOOR_Y - seat + 86);
    wood(x + CHAIR_W - 40, seat - 82, 30, 9);
    wood(x + CHAIR_W - 40, seat - 56, 30, 9);
    wood(x + CHAIR_W - 30, seat - 76, 7, 26);
    wood(x, seat, CHAIR_W, 9);
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.roundRect(x + 2, seat - 8, CHAIR_W - 14, 9, 5); g.fill(); g.stroke();
    g.fillStyle = 'rgba(160,50,10,.3)';
    g.beginPath(); g.ellipse(x + CHAIR_W / 2, FLOOR_Y + 3, CHAIR_W * 0.6, 5, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawTable() {
    const g = ctx;
    const x = tableX;
    // the legs
    g.fillStyle = INK;
    g.fillRect(x + 12, tableTop + 8, 12, FLOOR_Y - tableTop - 8); g.fillRect(x + tableW - 24, tableTop + 8, 12, FLOOR_Y - tableTop - 8);
    g.fillStyle = '#c9773a';
    g.fillRect(x + 14, tableTop + 8, 8, FLOOR_Y - tableTop - 8); g.fillRect(x + tableW - 22, tableTop + 8, 8, FLOOR_Y - tableTop - 8);
    g.fillStyle = 'rgba(160,50,10,.3)';
    g.beginPath(); g.ellipse(x + tableW / 2, FLOOR_Y + 3, tableW * 0.6, 6, 0, 0, Math.PI * 2); g.fill();
    // the top
    g.fillStyle = '#b5652e'; roundRect(g, x - 2, tableTop - 2, tableW + 4, 12, 4); g.fill();
    // the tablecloth: it slides off to the left when the kitten pulls it
    const right = x + tableW + 5 - cloth;
    g.save();
    g.strokeStyle = INK; g.lineWidth = 2;
    if (right > x) {
      g.beginPath();
      g.moveTo(x - 4, tableTop - 4);
      g.lineTo(right, tableTop - 4);
      g.lineTo(right, tableTop + CLOTH_H - cloth * 0.3);
      for (let k = right; k > x - 4; k -= 12) g.quadraticCurveTo(k - 6, tableTop + CLOTH_H + 5, Math.max(x - 4, k - 12), tableTop + CLOTH_H);
      g.closePath();
      g.fillStyle = checks || '#ff5b4a'; g.fill(); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x - 3, tableTop - 3, right - x + 2, 6);
    }
    // the part that has slid over the edge hangs down on the left
    const hang = Math.min(CLOTH_H + cloth * 0.9, FLOOR_Y - tableTop - 6);
    g.beginPath();
    g.moveTo(x - 4, tableTop - 4); g.lineTo(x + 2, tableTop - 4);
    g.lineTo(x - 2 - cloth * 0.05, tableTop + hang); g.lineTo(x - 14 - cloth * 0.08, tableTop + hang - 4);
    g.closePath();
    g.fillStyle = checks || '#ff5b4a'; g.fill(); g.stroke();
    g.restore();
  }

  /** One thing on the table (or falling), standing on `bottom`. */
  function drawItem(it, x, bottom, rot = 0) {
    const g = ctx;
    g.save();
    g.translate(x, bottom);
    g.rotate(rot);
    g.strokeStyle = INK; g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
    if (it.kind === 'cup') drawCup(g, it.w, it.h);
    if (it.kind === 'vase') drawVase(g);
    if (it.kind === 'turkey') drawTurkey(g);
    g.restore();
    if (it.kind === 'cup' && !rot && (state === 'aim' || state === 'intro')) {
      // steam
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      for (const k of [-5, 5]) {
        ctx.beginPath(); ctx.moveTo(x + k, bottom - it.h - 4);
        ctx.bezierCurveTo(x + k - 5, bottom - it.h - 12, x + k + 5, bottom - it.h - 16, x + k, bottom - it.h - 24); ctx.stroke();
      }
    }
  }

  function drawCup(g, w, h) {
    g.beginPath(); g.arc(w / 2 + 1, -h * 0.55, 8, -1.3, 1.3); g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 2.2;
    g.beginPath(); g.roundRect(-w / 2, -h, w, h, [3, 3, 9, 9]);
    const body = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#fff'); body.addColorStop(1, '#dbe8f6');
    g.fillStyle = body; g.fill(); g.stroke();
    g.fillStyle = '#8a4b23'; g.fillRect(-w / 2 + 2, -h + 2, w - 4, 4);
    g.fillStyle = '#ff5b4a';
    g.beginPath();
    g.moveTo(0, -10); g.bezierCurveTo(-10, -16, -6, -26, 0, -20); g.bezierCurveTo(6, -26, 10, -16, 0, -10); g.fill();
  }

  function drawVase(g) {
    // flowers first, the vase in front of their stems
    g.strokeStyle = '#3c8a0f'; g.lineWidth = 3;
    const heads = [[-12, -70, '#ff7fb0'], [1, -79, '#ffd23f'], [12, -68, '#ff5b4a']];
    for (const [hx, hy] of heads) { g.beginPath(); g.moveTo(0, -42); g.quadraticCurveTo(hx * 0.3, -56, Number(hx), Number(hy)); g.stroke(); }
    g.fillStyle = '#5bc236';
    g.beginPath(); g.ellipse(-7, -54, 6, 2.6, -0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(7, -52, 6, 2.6, 0.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.6;
    for (const [hx, hy, color] of heads) {
      g.fillStyle = String(color);
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        g.beginPath(); g.arc(Number(hx) + Math.cos(a) * 4.5, Number(hy) + Math.sin(a) * 4.5, 3.6, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(Number(hx), Number(hy), 2.8, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-9, -46); g.lineTo(9, -46);
    g.lineTo(7, -40); g.bezierCurveTo(20, -30, 18, -8, 10, 0);
    g.lineTo(-10, 0); g.bezierCurveTo(-18, -8, -20, -30, -7, -40);
    g.closePath();
    const body = g.createLinearGradient(-16, 0, 16, 0);
    body.addColorStop(0, '#7cc8ff'); body.addColorStop(1, '#2f8fe8');
    g.fillStyle = body; g.fill(); g.stroke();
    g.fillStyle = '#ff7a3d'; g.fillRect(-14, -24, 28, 5);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(-8, -26, 2.5, 8, 0.2, 0, Math.PI * 2); g.fill();
  }

  function drawTurkey(g) {
    // a big roast turkey on a big plate: the small chicken drawing at twice the size, with greens around
    g.scale(2, 2);
    g.lineWidth = 1.3;
    g.fillStyle = '#5bc236';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 15, -7, 5, 2.4, s * 0.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ff9a3d';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 17, -6, 2.6, Math.PI, 0); g.fill(); g.stroke(); }
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(0, -4, 19, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const s of [-1, 1]) {
      g.save(); g.translate(s * 11, -10); g.rotate(s * 0.7);
      g.fillStyle = '#c8742e'; g.beginPath(); g.ellipse(0, 0, 4, 6, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -7, 2.4, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
    const skin = g.createRadialGradient(-3, -18, 2, 0, -13, 13);
    skin.addColorStop(0, '#f2b066'); skin.addColorStop(1, '#b65f21');
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(0, -13, 12, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,240,200,.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(-3, -16, 4, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
  }

  /** The woman of the house: she walks in from the right, scolds with a rolling pin and walks away. */
  function drawWoman(since) {
    const stand = Math.min(W - 70, tableRight() + CHAIR_W + 50);
    const walkIn = ease(clamp((since - 0.5) / 0.7, 0, 1));
    const walkOut = ease(clamp((since - 3.1) / 0.8, 0, 1));
    const x = W + 80 + (stand - W - 80) * walkIn + (W + 80 - stand) * walkOut;
    if (x > W + 60) return;
    const angry = since > 1.2 && since < 3.1;
    const step = walkIn < 1 || walkOut > 0 ? Math.sin(since * 18) * 3 : 0;
    const shake = angry ? Math.sin(since * 22) * 0.35 : 0;
    const g = ctx;
    g.save();
    g.translate(x, FLOOR_Y + Math.abs(step) * -0.5);
    g.strokeStyle = INK; g.lineWidth = 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = 'rgba(160,50,10,.3)'; g.beginPath(); g.ellipse(0, 3, 34, 6, 0, 0, Math.PI * 2); g.fill();
    // legs and shoes
    g.fillStyle = '#f2c19b';
    g.beginPath(); g.roundRect(-13 + step, -44, 9, 40, 4); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(4 - step, -44, 9, 40, 4); g.fill(); g.stroke();
    g.fillStyle = '#c9304a';
    g.beginPath(); g.ellipse(-11 + step, -4, 10, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(9 - step, -4, 10, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    // the arm on the hip, behind the dress
    g.lineWidth = 11; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(20, -140); g.lineTo(40, -112); g.lineTo(24, -96); g.stroke();
    g.lineWidth = 7; g.strokeStyle = '#f2c19b'; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 2.4;
    // the dress with dots and the apron
    g.fillStyle = '#e84a6f';
    g.beginPath(); g.moveTo(-22, -152); g.lineTo(22, -152); g.lineTo(42, -40); g.lineTo(-42, -40); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [dx, dy] of [[-28, -60], [30, -66], [-14, -140], [16, -136], [-34, -48]]) { g.beginPath(); g.arc(dx, dy, 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-17, -120); g.lineTo(17, -120); g.lineTo(26, -50); g.lineTo(-26, -50); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(-10, -86, 20, 14, 3); g.stroke();
    g.fillStyle = '#ff5b4a';
    g.beginPath(); g.moveTo(0, -98); g.bezierCurveTo(-8, -103, -5, -111, 0, -106); g.bezierCurveTo(5, -111, 8, -103, 0, -98); g.fill();
    // the raised arm with the rolling pin
    g.save();
    g.translate(-20, -142);
    g.rotate(-0.5 + shake);
    g.lineWidth = 11; g.beginPath(); g.moveTo(0, 0); g.lineTo(-34, -22); g.stroke();
    g.lineWidth = 7; g.strokeStyle = '#f2c19b'; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 2.4;
    g.translate(-36, -24);
    g.rotate(1.1);
    g.fillStyle = '#e9a466'; g.beginPath(); g.roundRect(-26, -6, 52, 12, 6); g.fill(); g.stroke();
    g.fillStyle = '#c9773a';
    g.beginPath(); g.roundRect(-38, -3, 12, 6, 3); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(26, -3, 12, 6, 3); g.fill(); g.stroke();
    g.restore();
    // neck, head, hair with a bun
    g.fillStyle = '#f2c19b';
    g.fillRect(-5, -166, 10, 16);
    g.fillStyle = '#6b3b22';
    g.beginPath(); g.arc(0, -214, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#f2c19b';
    g.beginPath(); g.arc(0, -186, 22, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#6b3b22';
    g.beginPath(); g.arc(0, -188, 23, Math.PI * 1.02, Math.PI * 1.98); g.quadraticCurveTo(10, -196, 0, -192); g.quadraticCurveTo(-10, -196, -23, -190); g.closePath(); g.fill(); g.stroke();
    // the face: angry brows, shouting mouth
    g.fillStyle = INK;
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(s * 8, -184, 2.6, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3; g.beginPath(); g.moveTo(s * 13, angry ? -194 : -191); g.lineTo(s * 4, angry ? -189 : -191); g.stroke();
    }
    g.lineWidth = 2.2;
    g.fillStyle = 'rgba(255,100,110,.5)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 13, -177, 4, 2.6, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7a1b2b';
    if (angry) { g.beginPath(); g.ellipse(0, -172, 6, 4.5 + Math.abs(shake) * 4, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else { g.beginPath(); g.moveTo(-5, -172); g.lineTo(5, -172); g.stroke(); }
    g.restore();
    if (angry) {
      // what she shouts
      const t = since - 1.2;
      const y = FLOOR_Y - 196;   // left of her head, so it does not cover the cat on the fridge
      g.save();
      g.font = '800 20px "Baloo 2", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
      const w = g.measureText(scoldText).width + 28;
      const bx = clamp(x - 38 - w, 8, W - w - 8);
      g.globalAlpha = clamp(t / 0.15, 0, 1);
      g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2.4;
      g.beginPath(); g.roundRect(bx, y - 40, w, 42, 14); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(bx + w - 2, y - 28); g.lineTo(x - 24, y - 14); g.lineTo(bx + w - 2, y - 12); g.closePath(); g.fill(); g.stroke();
      g.fillRect(bx + w - 5, y - 27, 5, 14);
      g.fillStyle = '#c9304a'; g.textAlign = 'left';
      g.fillText(scoldText, bx + 14, y - 12);
      g.restore();
    }
  }

  /** The first shot: a pulsing ring around the kitten and an arrow that says to pull it back. */
  function drawPullHint() {
    const t = performance.now() / 1000;
    const bob = (Math.sin(t * 4) + 1) * 6;
    const g = ctx;
    g.save();
    g.strokeStyle = '#fff'; g.lineWidth = 3.5;
    g.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3;
    g.beginPath(); g.arc(LAUNCH.x, LAUNCH.y, 27 + Math.sin(t * 6) * 3, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    // the arrow: from the kitten back, away from the table
    const from = { x: LAUNCH.x - 30, y: LAUNCH.y - 20 };
    const to = { x: LAUNCH.x - 70 - bob, y: LAUNCH.y - 48 - bob * 0.7 };
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [color, width] of [[INK, 12], ['#ffd23f', 7]]) {
      g.strokeStyle = String(color); g.lineWidth = Number(width);
      g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y);
      g.moveTo(to.x + Math.cos(a + 2.5) * 16, to.y + Math.sin(a + 2.5) * 16); g.lineTo(to.x, to.y); g.lineTo(to.x + Math.cos(a - 2.5) * 16, to.y + Math.sin(a - 2.5) * 16);
      g.stroke();
    }
    g.restore();
    drawText('Хвани котето и го дръпни назад!', 250, 86, 22, 1);
  }

  /** Until the first hit: a red pulsing crosshair on the cloth, where the kitten has to catch it. */
  function drawClothTarget() {
    const t = performance.now() / 1000;
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    const g = ctx;
    g.save();
    g.translate(tableX + 2, tableTop + CLOTH_H / 2 - 4);
    g.scale(pulse, pulse);
    g.lineCap = 'butt';
    const gap = 0.16;  // the rings are cut where the cross lines go through
    const shape = () => {
      for (const [r, w] of [[24, 6], [13, 3.6]]) {
        g.lineWidth = w;
        for (let k = 0; k < 4; k++) {
          g.beginPath(); g.arc(0, 0, r, (k * Math.PI) / 2 + gap, ((k + 1) * Math.PI) / 2 - gap); g.stroke();
        }
      }
      g.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        g.beginPath(); g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); g.lineTo(Math.cos(a) * 33, Math.sin(a) * 33); g.stroke();
      }
    };
    // a white outline first, so it shows on the red and white cloth
    g.strokeStyle = '#fff';
    g.save(); g.lineJoin = 'round';
    for (const [r, w] of [[24, 6], [13, 3.6]]) { g.lineWidth = w + 4; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 7;
    for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.beginPath(); g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); g.lineTo(Math.cos(a) * 35, Math.sin(a) * 35); g.stroke(); }
    g.restore();
    g.shadowColor = 'rgba(255,40,40,.7)'; g.shadowBlur = 8 + Math.sin(t * 6) * 6;
    g.strokeStyle = '#d42a2a';
    shape();
    g.restore();
    drawText(`Събори ${setFor(level).name}!`, tableX + tableW / 2, tableTop - 74, 26, 1);
  }

  function drawShot() {
    if (!shot) return;
    const look = LOOKS[shot.look];
    if (state === 'fly') {
      const vy = shot.vy + G * shot.t;
      const rot = Math.atan2(vy, shot.vx) * 0.35;
      if (shot.y < -CAT_R) {
        // above the screen: a little arrow shows where it is
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(shot.x, 8); ctx.lineTo(shot.x - 9, 24); ctx.lineTo(shot.x + 9, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else kitten(ctx, shot.x, shot.y, look, { pose: 'ball', mood: 'fierce', rot });
    } else if (state === 'hit') {
      const down = brokenAt > 0 && shot.y >= FLOOR_Y - CAT_R - 1;
      const running = scold && clock - brokenAt > 1.7;
      const hop = running ? -Math.abs(Math.sin(clock * 16)) * 8 : 0;
      if (down) kitten(ctx, shot.x - 6, FLOOR_Y - 20 + hop, look, { mood: 'happy', flip: true });
      else kitten(ctx, shot.x, shot.y, look, { pose: 'hang', mood: cloth > 20 ? 'happy' : 'fierce' });
    } else if (state === 'miss') {
      const squash = clock < 0.25 ? Math.sin((clock / 0.25) * Math.PI) * 0.6 : 0;
      const mood = clock < 0.5 ? 'sour' : clock < 1.9 ? 'hiss' : 'sour';
      const alpha = clamp(1 - (clock - 2.1) / 0.5, 0, 1);
      ctx.globalAlpha = alpha;
      kitten(ctx, shot.x, shot.y + CAT_R - 20, look, { mood, squash, flip: clock > 1.9 });
      ctx.globalAlpha = 1;
    }
  }

  function drawWaiting() {
    // the kitten in the slingshot and the ones waiting on the shelf
    kittens.slice(1).forEach((name, k) => {
      kitten(ctx, 74 - k * 40, SHELF.y - 17, LOOKS[name], { size: 0.85, mood: 'calm' });
    });
    if ((state === 'aim' || state === 'intro') && kittens.length) {
      const p = pulled();
      kitten(ctx, p.x, p.y, LOOKS[kittens[0]], { pose: 'ball', mood: 'fierce', size: 0.95 });
    }
  }

  function drawBits() {
    for (const b of bits) {
      ctx.globalAlpha = clamp(b.life / 0.4, 0, 1);
      ctx.fillStyle = b.color;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      if (b.kind === 'shard') {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-b.size / 2, b.size / 3); ctx.lineTo(0, -b.size / 2); ctx.lineTo(b.size / 2, b.size / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (b.kind === 'leg') {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 2, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -9, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (b.kind === 'heart') {
        const s = b.size / 10;
        ctx.beginPath(); ctx.moveTo(0, 4 * s); ctx.bezierCurveTo(-10 * s, -2 * s, -5 * s, -10 * s, 0, -5 * s); ctx.bezierCurveTo(5 * s, -10 * s, 10 * s, -2 * s, 0, 4 * s); ctx.fill();
      } else if (b.kind === 'star') {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) { const r = k % 2 ? b.size * 0.25 : b.size * 0.6; ctx.lineTo(Math.cos((k * Math.PI) / 5 - Math.PI / 2) * r, Math.sin((k * Math.PI) / 5 - Math.PI / 2) * r); }
        ctx.closePath(); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawText(text, x, y, size, t) {
    const pop = 1 + Math.max(0, 0.4 - t) * 1.5;
    ctx.save();
    ctx.translate(x, y - t * 14);
    ctx.scale(pop, pop);
    ctx.font = `800 ${size}px "Baloo 2", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 4; ctx.strokeStyle = '#1b5fb0'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(background, 0, 0, W, H);
    drawFridge();
    drawWatcher();
    drawChair();
    drawTable();
    for (const it of items) {
      if (!it.fall) drawItem(it, tableX + it.at - cloth, tableTop - 3);
      else if (!it.fall.broken) drawItem(it, it.fall.x, it.fall.y, it.fall.rot);
    }
    if (showTarget && (state === 'intro' || state === 'aim' || state === 'fly')) drawClothTarget();
    // the last shot's path
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const p of trail) { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill(); }
    drawAngle();
    drawSlingshot(false);
    drawWaiting();
    drawSlingshot(true);
    if (state === 'hit' && scold && brokenAt) drawWoman(clock - brokenAt);
    drawShot();
    drawBits();
    if (state === 'aim' && tutorial && !aiming && pull === 0) drawPullHint();
    if (shout && shout.t < 1.2) drawText(shout.text, shout.x, shout.y, 26, shout.t);
    if (banner) drawText(banner.text, W / 2, H / 2 - 30, 64, Math.min(banner.t, 0.5));
    placeBubble();
  }

  // ---------- the cat's speech bubble and the HUD ----------
  function say(text, small = '') {
    bubble.innerHTML = `<b>${text}</b>${small ? `<small>${small}</small>` : ''}`;
    bubble.hidden = false;
    placeBubble();
  }

  function placeBubble() {
    const w = watcher();
    bubble.style.left = `${(w.x / W) * 100}%`;
    bubble.style.top = `${((w.y - 66) / H) * 100}%`;
    // when the cat sits close to the slingshot, the bubble opens to the right so it does not cover the kitten
    bubble.classList.toggle('ak-right', w.x < W * 0.5);
  }

  function updateHud() {
    hud.score.textContent = String(cups);
    hud.level.textContent = String(level);
    hud.goal.hidden = state === 'intro' && clock < 1;
    hud.goal.innerHTML = `<span aria-hidden="true">🎯</span> ${goalText()}`;
    hud.lives.innerHTML = [0, 1, 2].map((k) => `<i class="${k < kittens.length ? '' : 'ak-lost'}" aria-hidden="true">🐱</i>`).join('');
    hud.lives.setAttribute('aria-label', `Котета: ${kittens.length}`);
  }

  // ---------- screens ----------
  const RULES = `
    <ul class="ak-rules">
      <li>Котката с бинокъла казва под какъв <b>ъгъл</b> да стреляш. Дърпай котето назад и го пусни.</li>
      <li>Докато дърпаш, под прашката се вижда ъгълът от <b>отвеса</b>: надолу е <b>остър</b>, право напред е <b>прав</b>, нагоре е <b>тъп</b>.</li>
      <li>Уцелиш ли, котето се хваща за покривката и всичко на масата пада. Имаш 3 котета.</li>
    </ul>
    <p class="ak-help">Клавиатура: ← → въртят ъгъла (Shift: по 5°), интервал стреля, P е пауза.</p>`;

  function showScreen(html) {
    screen.innerHTML = `<div class="ak-card">${html}</div>`;
    screen.hidden = false;
    /** @type {HTMLElement | null} */ (screen.querySelector('button'))?.focus();
  }

  async function scores() {
    try { return (await platform.loadScores()) || []; } catch (error) { console.warn('Резултатите не се заредиха:', error); return []; }
  }

  async function showMenu() {
    state = 'menu';
    bubble.hidden = true;
    const best = Math.max(0, ...(await scores()).map((s) => s.score));
    showScreen(`
      <h1 class="ak-title">Сърдити котета</h1>
      <p class="ak-lead">Уцели ъгъла!</p>
      ${RULES}
      ${best ? `<p class="ak-best">Рекорд: <b>${best}</b> ☕</p>` : ''}
      <button type="button" class="ak-button" data-act="play">Играй</button>`);
  }

  function pause() {
    if (paused || state === 'menu' || state === 'over') return;
    paused = true;
    aiming = false;
    showScreen(`
      <h2 class="ak-title ak-small">Пауза</h2>
      <button type="button" class="ak-button" data-act="resume">Продължи</button>
      <button type="button" class="ak-button ak-secondary" data-act="play">Нова игра</button>
      <details class="ak-details"><summary>Правила</summary>${RULES}</details>`);
  }

  async function gameOver() {
    state = 'over';
    bubble.hidden = true;
    sound('over');
    const mine = { score: cups, level, at: new Date().toISOString() };
    const before = await scores();
    try { await platform.saveScore(mine); } catch (error) { console.warn('Резултатът не се записа:', error); }
    const all = [...before.filter((s) => s.at !== mine.at), mine].sort((a, b) => b.score - a.score || (a.at < b.at ? 1 : -1));
    const record = cups > 0 && before.every((s) => s.score < cups);
    const date = (iso) => new Date(iso).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
    const top = all.slice(0, 5).map((s, k) => `
      <li class="${s === mine ? 'ak-me' : ''}"><span>${k + 1}.</span><b>${s.score} ☕</b><span>ниво ${s.level}</span><span>${date(s.at)}</span></li>`).join('');
    showScreen(`
      <h2 class="ak-title ak-small">Котетата се умориха</h2>
      <p class="ak-final">${cups} ${cups === 1 ? 'съборена чаша' : 'съборени чаши'}</p>
      ${record ? '<p class="ak-record">Нов рекорд!</p>' : ''}
      <h3 class="ak-sub">Твоята класация</h3>
      <ol class="ak-top">${top}</ol>
      <button type="button" class="ak-button" data-act="play">Пак</button>`);
  }

  screen.addEventListener('click', (event) => {
    const act = /** @type {HTMLElement} */ (event.target).closest?.('[data-act]')?.getAttribute('data-act');
    if (!act) return;
    unlockAudio();
    screen.hidden = true;
    paused = false;
    if (act === 'play') newGame();
  });

  // ---------- input ----------
  function aimAt(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * W;
    const y = ((clientY - box.top) / box.height) * H;
    // the kitten flies away from where it is pulled
    const dx = LAUNCH.x - x;
    const dy = LAUNCH.y - y;
    pull = Math.min(MAX_PULL, Math.hypot(dx, dy));
    let a = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (a < 0) a = a < -90 ? MAX_ANGLE : MIN_ANGLE;
    a = clamp(a, MIN_ANGLE, MAX_ANGLE);
    // on the first levels a nearly right angle snaps to exactly 90°, so "прав" can be hit and the square shows it
    if (target.kind === 'kind' && Math.abs(a - 90) < 3) a = 90;
    aim = a;
  }

  canvas.addEventListener('pointerdown', (event) => {
    unlockAudio();
    if (state !== 'aim' || paused) return;
    aiming = true;
    canvas.setPointerCapture(event.pointerId);
    aimAt(event.clientX, event.clientY);
    sound('stretch');
  });
  canvas.addEventListener('pointermove', (event) => { if (aiming) aimAt(event.clientX, event.clientY); });
  canvas.addEventListener('pointerup', (event) => {
    if (!aiming) return;
    aiming = false;
    aimAt(event.clientX, event.clientY);
    if (pull > 18) fire();
    else pull = 0;
  });
  canvas.addEventListener('pointercancel', () => { aiming = false; pull = 0; });
  $('[data-pause]').addEventListener('click', () => pause());

  const onKey = (/** @type {KeyboardEvent} */ event) => {
    if (state === 'menu' || state === 'over' || paused) return;
    if (event.key === 'p' || event.key === 'P' || event.key === 'п' || event.key === 'Escape') { pause(); return; }
    if (state !== 'aim') return;
    const step = event.shiftKey ? 5 : 1;
    const turn = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key];
    if (turn) {
      event.preventDefault();
      aim = clamp(Math.round(aim) + turn, MIN_ANGLE, MAX_ANGLE);
      pull = 56;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      unlockAudio();
      if (pull > 0) fire();
      else pull = 56;
    }
  };
  addEventListener('keydown', onKey);
  const onHide = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', onHide);
  const sizes = new ResizeObserver(() => resize());
  sizes.observe(root);

  // ---------- sound ----------
  /** @type {AudioContext | null} */
  let audio = null;
  function unlockAudio() {
    if (platform.sound === false || audio) return;
    try { audio = new AudioContext(); } catch { audio = null; }
  }
  function tone(freq, duration, { type = 'sine', volume = 0.12, to = freq, delay = 0 } = {}) {
    if (!audio) return;
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = /** @type {OscillatorType} */ (type);
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + duration);
  }
  function noise(duration, { volume = 0.15, filter = 'highpass', freq = 3000, delay = 0 } = {}) {
    if (!audio) return;
    const t = audio.currentTime + delay;
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const f = audio.createBiquadFilter();
    f.type = /** @type {BiquadFilterType} */ (filter);
    f.frequency.value = freq;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(gain).connect(audio.destination);
    src.start(t);
  }
  function sound(name) {
    if (!audio) return;
    if (name === 'stretch') tone(300, 0.12, { type: 'triangle', to: 420, volume: 0.05 });
    if (name === 'shoot') { tone(420, 0.18, { type: 'triangle', to: 900, volume: 0.09 }); noise(0.12, { volume: 0.05, freq: 1500 }); }
    if (name === 'meow') { tone(620, 0.16, { type: 'triangle', to: 980, volume: 0.1 }); tone(980, 0.26, { type: 'triangle', to: 520, volume: 0.1, delay: 0.15 }); }
    if (name === 'slide') tone(500, 0.3, { type: 'sine', to: 300, volume: 0.04 });
    if (name === 'crash') {
      noise(0.35, { volume: 0.22, filter: 'bandpass', freq: 2500 });
      [2600, 3400, 2900, 4100].forEach((f, k) => tone(f, 0.25, { delay: 0.03 + k * 0.05, volume: 0.04 }));
      [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.16, { delay: 0.35 + k * 0.09, volume: 0.08 }));
    }
    if (name === 'scold') [330, 262, 330, 247].forEach((f, k) => tone(f, 0.13, { type: 'square', to: f * 0.9, delay: k * 0.17, volume: 0.05 }));
    if (name === 'thud') tone(150, 0.2, { to: 60, volume: 0.2 });
    if (name === 'hiss') noise(0.7, { volume: 0.12, freq: 4000 });
    if (name === 'level') [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, 0.14, { delay: k * 0.08, volume: 0.09 }));
    if (name === 'over') [440, 349, 262].forEach((f, k) => tone(f, 0.25, { delay: k * 0.18, type: 'triangle', volume: 0.1 }));
  }

  // ---------- loop ----------
  let last = performance.now();
  let frame = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    frame = requestAnimationFrame(loop);
  }

  resize();
  newGame();
  state = 'menu';
  bubble.hidden = true;
  showMenu();
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    removeEventListener('keydown', onKey);
    sizes.disconnect();
    document.removeEventListener('visibilitychange', onHide);
    audio?.close();
    root.replaceChildren();
  };
}
