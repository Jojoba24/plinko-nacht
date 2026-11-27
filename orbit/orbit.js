/* Orbit Zirkus für Jojoba's Spielekiste.
   Eigenes Kugel-und-Peg-Spiel im Weltraum-Zirkus. Nutzt window.SK aus index.html
   (Spielfläche, Räume, Spielende-Dialog, Bestenliste) wie die Spiele in games.js. */
import { W, H, LEVELS, buildLevel } from './levels.js';
import { TAU, mulberry32, clamp, lerp, fmt, roundRect } from './util.js';
import * as A from './audio.js';
import { CHARACTERS, charById, drawPortrait, drawBackground, drawStar, drawBolt } from './art.js';

const GAMES = window.GAMES = window.GAMES || {};
const SK = () => window.SK;
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---------- Konstanten ----------
const CW = 960, CH = 648, FX = 80, FY = 48;
const GRAV = 560, SPEED = 620, BALL_R = 7, MAX_V = 1100, STEP = 1 / 240;
const CANNON = { x: W / 2, y: 22 };
const BUCKET_Y = H - 34, BUCKET_HW = 46;
const BINS = [5000, 20000, 50000, 20000, 5000];
const BASE = { norm: 10, star: 100, bonus: 500, power: 10 };
const COL = {
  norm: ['#b4fff2', '#0f8f84'],
  star: ['#fff1a8', '#e88a00'],
  bonus: ['#ffc2ea', '#d61f86'],
  power: ['#ecffa8', '#4fa300'],
};
const FONT = '"Fredoka","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
const SAVE_KEY = 'orbitzirkus_v1';
const save = Object.assign({ unlocked: 1, best: {}, char: 'kometa', local: null }, (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (e) { return {}; } })());
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
const ballsFor = (n) => (n <= 2 ? 10 : n === 3 ? 8 : 7);

let bgCanvas = null;
function background() {
  if (!bgCanvas) {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = CW * 2; bgCanvas.height = CH * 2;
    const b = bgCanvas.getContext('2d'); b.scale(2, 2);
    drawBackground(b, CW, CH, FX, FY, W, H);
  }
  return bgCanvas;
}

// =====================================================================
//  Eine laufende Partie. opt.mode: 'solo' | 'local' | 'online'
//  opt.start: { level, players } startet ohne Auswahlbildschirm.
//  Online: opt.g (Raumdaten), opt.uid
// =====================================================================
function orbitGame(opt) {
  const S = SK();
  const mode = opt.mode;
  const online = mode === 'online';
  const root = S.openArcade('orbit', () => stop());
  root.classList.add('oz');

  const bar = el('div', 'ar-bar', `<button class="btn ar-back" type="button">${online ? '◄ Raum verlassen' : '◄ Menü'}</button><b class="ar-title">Orbit Zirkus</b><span class="ar-info"></span>`);
  root.appendChild(bar);
  const info = bar.querySelector('.ar-info');
  const back = bar.querySelector('.ar-back');
  let armed = 0;
  back.addEventListener('click', () => {
    if (online && Date.now() - armed > 3000) { armed = Date.now(); back.textContent = 'Wirklich verlassen?'; later(() => { back.textContent = '◄ Raum verlassen'; }, 3000); return; }
    if (online) S.toMenu(); else S.openSetup();
  });

  const stage = el('div', 'oz-stage', '<canvas class="oz-cv"></canvas><div class="oz-ui"></div><button class="oz-music" type="button" title="Musik an/aus (M)">♪</button>');
  root.appendChild(stage);
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const ui = stage.querySelector('.oz-ui');
  const musicBtn = stage.querySelector('.oz-music');
  const bg = background();

  // ---------- Zustand ----------
  let G = null, shot = null, paused = false, stopped = false, raf = 0;
  let time = 0, acc = 0, bucketClock = 0, recoil = 0, scale = 1;
  const aim = { angle: Math.PI / 2, shown: Math.PI / 2 };
  const cam = { slow: 1, slowTarget: 1, zoom: 1, fx: W / 2, fy: H / 2, focus: null };
  let particles = [], texts = [], banners = [];
  let clearQueue = [], clearT = 0, clearDone = 0;
  let lastG = online ? opt.g : null, appliedV = 0, stWait = 0, lastAimSent = 0;
  const timers = [];
  function later(fn, ms) { const t = setTimeout(() => { if (!stopped) fn(); }, ms); timers.push(t); return t; }
  const demoPegs = buildLevel(1, 7).pegs;

  // ---------- Größe ----------
  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.max(0.2, Math.min(r.width / CW, r.height / CH));
    canvas.style.width = CW * s + 'px';
    canvas.style.height = CH * s + 'px';
    canvas.width = Math.round(CW * s * dpr);
    canvas.height = Math.round(CH * s * dpr);
    scale = s * dpr;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  // ---------- Hilfen ----------
  const starsLeft = () => G.pegs.reduce((n, p) => n + (p.kind === 'star' && !p.gone && !p.lit ? 1 : 0), 0);
  const myTurn = () => G && (!online || G.turn === G.me);
  const canAim = () => G && !paused && G.phase === 'aim' && !G.over && myTurn() && !S.overOpen();
  const canShoot = () => canAim() && G.players[G.turn].balls > 0;
  const bucketX = (t) => W / 2 + (W / 2 - 70) * Math.sin(t * 0.85);
  function multiplier() {
    const f = (G.starTotal - starsLeft()) / G.starTotal;
    return f >= 1 ? 10 : f >= 0.8 ? 5 : f >= 0.6 ? 3 : f >= 0.35 ? 2 : 1;
  }
  const O = () => S.ONLINE;

  // ---------- Effekte ----------
  function floatText(x, y, text, color, size = 14, life = 1) { texts.push({ x, y, text, color, size, life, max: life }); }
  function sparks(x, y, color, n = 10, sp = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, max: 1, color, size: 1.5 + Math.random() * 2, g: 260 });
    }
  }
  function ringFx(x, y, color, r = 120) { particles.push({ type: 'ring', x, y, r, life: 0.5, max: 0.5, color }); }
  function firework(x, y) {
    const cols = ['#ffd36b', '#ff6fa8', '#7ff6ff', '#9dff7a', '#c79bff'];
    const col = cols[Math.floor(Math.random() * cols.length)];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU, v = 120 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2 + Math.random() * 0.5, max: 1.6, color: col, size: 2.2, g: 90, star: Math.random() < 0.3 });
    }
    A.firework();
  }
  function banner(text, sub = '', color = '#ffd36b', life = 1.8, size = 54) { banners.push({ text, sub, color, life, max: life, size }); }

  // ---------- Spielstart ----------
  function initGame(cfg) {
    const lvl = buildLevel(cfg.level, cfg.seed);
    const nb = mode === 'solo' ? 10 : ballsFor(cfg.players.length);
    G = {
      level: cfg.level, seed: cfg.seed, name: lvl.name, sub: lvl.sub, pegs: lvl.pegs,
      starTotal: lvl.pegs.filter((p) => p.kind === 'star').length,
      players: cfg.players.map((p) => ({ uid: p.uid, name: p.name, power: p.power, char: p.char, score: 0, balls: nb, guide: 0, connected: true, goneT: 0 })),
      turn: 0, me: cfg.me || 0, shotNo: 0, phase: 'aim', finale: false, over: false, won: false, resultsAt: 0, resultsShown: false, fwT: 0,
    };
    shot = null; paused = false; particles = []; texts = []; banners = [];
    cam.slow = 1; cam.slowTarget = 1; cam.zoom = 1; cam.focus = null;
    aim.angle = aim.shown = Math.PI / 2;
    pickBonus(mulberry32(cfg.seed ^ 0x5bd1e995));
    ui.innerHTML = '';
    banner(lvl.name, lvl.sub, '#ffd36b', 2.2);
    if (mode !== 'solo') later(turnBanner, 1400);
    updateInfo();
    A.init();
  }

  function updateInfo() {
    if (!G) { info.textContent = ''; return; }
    const touch = window.matchMedia('(pointer:coarse)').matches;
    const p = G.players[G.turn];
    let t = `Level ${G.level + 1}: ${G.name}`;
    if (mode !== 'solo' && !G.over) t += ` · ${online && G.turn === G.me ? 'Du bist dran' : p.name + ' ist dran'}`;
    else t += touch ? ' · Ziehen zielt, Loslassen schießt' : ' · Maus zielt, Klick schießt';
    info.textContent = t;
  }

  function pickBonus(rng = Math.random) {
    for (const p of G.pegs) if (p.kind === 'bonus') p.kind = 'norm';
    const c = G.pegs.filter((p) => !p.gone && p.kind === 'norm');
    if (c.length) c[Math.floor(rng() * c.length)].kind = 'bonus';
  }

  function turnBanner() {
    updateInfo();
    if (!G || G.over || mode === 'solo') return;
    const p = G.players[G.turn];
    const txt = online && G.turn === G.me ? 'Du bist dran!' : `${p.name} ist dran`;
    banner(txt, '', charById(p.char).color, 1.3, 38);
    A.turn();
  }

  // ---------- Schießen ----------
  function mkBall(x, y, vx, vy) { return { x, y, vx, vy, r: BALL_R, alive: true, fire: 0, slow: 0, trail: [], tt: 0 }; }

  function tryShoot() {
    if (!canShoot()) return;
    const seed = (Math.random() * 2 ** 31) | 0;
    if (online) { const o = O(); if (!o) return; o.net.set(`${o.path}/g/sh/${G.shotNo + 1}`, [aim.angle, seed, bucketClock, G.me]); }
    fire(aim.angle, seed, bucketClock);
  }

  function fire(angle, seed, bt) {
    const pl = G.players[G.turn];
    pl.balls = Math.max(0, pl.balls - 1);
    if (pl.guide > 0) pl.guide--;
    G.shotNo++;
    const c = Math.cos(angle), s = Math.sin(angle);
    shot = {
      t: 0, bt, rng: mulberry32(seed), shooter: G.turn,
      balls: [mkBall(CANNON.x + c * 40, CANNON.y + s * 40, c * SPEED, s * SPEED)], newBalls: [],
      hits: 0, score: 0, lit: [], caught: 0, binScore: 0, finaleHit: false,
    };
    aim.angle = aim.shown = angle;
    G.phase = 'shot';
    recoil = 1;
    sparks(CANNON.x + c * 44, CANNON.y + s * 44, '#ffd36b', 14, 220);
    A.shoot();
  }

  // ---------- Physik ----------
  function contact(b, p) {
    let cx, cy, rr;
    if (p.type === 'circle') { cx = p.x; cy = p.y; rr = p.r; }
    else {
      const t = clamp(((b.x - p.ax) * p.dx + (b.y - p.ay) * p.dy) / p.len2, 0, 1);
      cx = p.ax + p.dx * t; cy = p.ay + p.dy * t; rr = p.hh;
    }
    const dx = b.x - cx, dy = b.y - cy, R = rr + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return null;
    const d = Math.sqrt(d2) || 0.001;
    return { nx: dx / d, ny: dy / d, cx, cy, R };
  }
  function bounce(b, k, e) {
    b.x = k.cx + k.nx * k.R; b.y = k.cy + k.ny * k.R;
    const vn = b.vx * k.nx + b.vy * k.ny;
    if (vn < 0) { b.vx -= (1 + e) * vn * k.nx; b.vy -= (1 + e) * vn * k.ny; }
    return vn;
  }
  function circleCollide(b, x, y, r, e = 0.6) {
    const k = contact(b, { type: 'circle', x, y, r });
    if (k) bounce(b, k, e);
  }

  function simStep(dt) {
    shot.t += dt;
    const bx = bucketX(shot.bt + shot.t);
    let slowT = 1, focus = null, stuck = false;
    const last = !G.finale && starsLeft() === 1 ? G.pegs.find((p) => p.kind === 'star' && !p.gone && !p.lit) : null;
    for (const b of shot.balls) {
      if (!b.alive) continue;
      b.vy += GRAV * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.fire > 0) b.fire -= dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.9; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.9; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.9; }
      for (const p of G.pegs) {
        if (p.gone) continue;
        const k = contact(b, p);
        if (!k) continue;
        if (!p.lit) hitPeg(p, b);
        if (b.fire > 0) continue;
        const vn = bounce(b, k, p.type === 'circle' ? 0.76 : 0.7);
        if (vn < -30 && p.lit) { p.hits++; if (p.hits > 18) stuck = true; }
      }
      if (!G.finale) {
        circleCollide(b, bx - BUCKET_HW, BUCKET_Y, 5);
        circleCollide(b, bx + BUCKET_HW, BUCKET_Y, 5);
        if (b.vy > 0 && b.y > BUCKET_Y - 2 && b.y < BUCKET_Y + 14 && Math.abs(b.x - bx) < BUCKET_HW - 5) {
          b.alive = false; shot.caught++;
          A.catchBall();
          sparks(bx, BUCKET_Y, '#7dffb0', 26, 200);
          floatText(bx, BUCKET_Y - 34, 'FREIKUGEL!', '#7dffb0', 22, 1.5);
        }
      } else {
        for (let i = 1; i < 5; i++) if (b.y > H - 46) circleCollide(b, (i * W) / 5, Math.max(H - 46, b.y), 4, 0.5);
        if (b.y > H - 20) {
          const i = clamp(Math.floor(b.x / (W / 5)), 0, 4);
          b.alive = false;
          shot.binScore += BINS[i];
          floatText((i + 0.5) * W / 5, H - 70, '+' + fmt(BINS[i]), '#ffd36b', 28, 2);
          A.bonus();
          for (let k = 0; k < 4; k++) firework((i + 0.5) * W / 5 + (Math.random() - 0.5) * 120, H - 120 - Math.random() * 200);
        }
      }
      if (b.y > H + 40) { b.alive = false; if (!G.finale && !shot.caught) A.lost(); }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
      b.slow = sp < 40 ? b.slow + dt : 0;
      if (b.slow > 1.4) stuck = true;
      b.tt += dt;
      if (b.tt > 1 / 60) { b.tt = 0; b.trail.push([b.x, b.y]); if (b.trail.length > 14) b.trail.shift(); }
      if (last) {
        const dx = last.x - b.x, dy = last.y - b.y, d = Math.hypot(dx, dy);
        if (d < 120 && dx * b.vx + dy * b.vy > 0) { slowT = 0.22; focus = last; }
      }
    }
    if (shot.newBalls.length) { shot.balls.push(...shot.newBalls); shot.newBalls = []; }
    if (stuck) popLitNow();
    cam.slowTarget = slowT; cam.focus = focus;
    if (shot.balls.every((b) => !b.alive)) endShot();
  }

  function popLitNow() {
    let n = 0;
    for (const p of shot.lit) if (!p.gone) { p.gone = true; popFx(p, n++); }
    for (const b of shot.balls) b.slow = 0;
  }

  function hitPeg(p, b) {
    p.lit = true; p.litAt = shot.t;
    shot.lit.push(p);
    shot.hits++;
    const pts = BASE[p.kind] * multiplier();
    shot.score += pts;
    floatText(p.x, p.y - 16, '+' + fmt(pts), COL[p.kind][0], p.kind === 'bonus' ? 18 : 13, 0.9);
    sparks(p.x, p.y, COL[p.kind][0], 7, 120);
    A.peg(shot.hits, p.kind);
    if (p.kind === 'power') activatePower(p, b);
    if (p.kind === 'star' && !G.finale && starsLeft() === 0) startFinale(p);
  }

  function activatePower(p, b) {
    const pl = G.players[shot.shooter];
    const ch = charById(pl.char);
    A.power();
    floatText(p.x, p.y - 36, ch.power.toUpperCase() + '!', ch.color, 22, 1.6);
    ringFx(p.x, p.y, ch.color, 70);
    if (ch.id === 'kometa') pl.guide += 3;
    else if (ch.id === 'blorp') shot.newBalls.push(mkBall(b.x, b.y, -(b.vx || 90), -Math.abs(b.vy) * 0.6 - 140));
    else if (ch.id === 'magna') {
      A.boom();
      ringFx(p.x, p.y, '#7ff6ff', 130);
      const targets = G.pegs.filter((q) => !q.gone && !q.lit && Math.hypot(q.x - p.x, q.y - p.y) < 125);
      targets.sort((a, c) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(c.x - p.x, c.y - p.y));
      for (const q of targets) if (!q.lit) hitPeg(q, b);
    } else if (ch.id === 'zoltan') b.fire = 3;
  }

  function startFinale(p) {
    G.finale = true;
    shot.finaleHit = true;
    cam.slowTarget = 1;
    banner('SUPERNOVA!', 'Letzter Stern getroffen', '#ffd36b', 2.6, 72);
    A.fanfare();
    ringFx(p.x, p.y, '#fff', 400);
    for (let i = 0; i < 6; i++) later(() => G && firework(80 + Math.random() * 640, 120 + Math.random() * 250), i * 180);
  }

  function endShot() {
    const pl = G.players[shot.shooter];
    let total = shot.score;
    if (shot.hits >= 12) { total += 5000; floatText(W / 2, H / 2 + 40, 'ZIRKUSREIF! +5.000', '#ff6fa8', 22, 1.8); }
    if (shot.finaleHit) { total += 25000 + shot.binScore; floatText(W / 2, H / 2 + 74, 'LETZTER STERN +25.000', '#ffd36b', 22, 2.2); }
    pl.score += total;
    if (shot.caught) pl.balls += shot.caught;
    if (total >= 25000 && !shot.finaleHit) {
      pl.balls++;
      floatText(W / 2, H / 2 + 6, 'ZUGABE-KUGEL!', '#7dffb0', 24, 1.8);
      A.bonus();
    }
    if (total > 0) floatText(W / 2, H / 2 - 30, '+' + fmt(total), '#fff', total >= 10000 ? 34 : 26, 1.6);
    G.phase = 'clearing';
    clearQueue = shot.lit.filter((p) => !p.gone).sort((a, c) => a.litAt - c.litAt);
    clearT = 0; clearDone = 0;
    cam.slowTarget = 1; cam.focus = null;
  }

  function popFx(p, i) { sparks(p.x, p.y, COL[p.kind][0], 10, 140); A.pop(i); }

  function updateClearing(dt) {
    clearT += dt;
    while (clearQueue.length && clearT > 0.045) {
      clearT -= 0.045;
      const p = clearQueue.shift();
      p.gone = true;
      popFx(p, clearDone++);
    }
    if (!clearQueue.length && clearT > 0.4) afterClear();
  }

  function afterClear() {
    const shooter = shot ? shot.shooter : G.turn;
    shot = null;
    if (online && shooter !== G.me) { G.phase = 'wait'; return; }
    resolveTurn();
    if (online) pushState();
  }

  function resolveTurn() {
    shot = null;
    for (const p of G.pegs) { p.lit = false; p.hits = 0; }
    if (G.finale) {
      if (mode === 'solo') {
        const pl = G.players[0];
        if (pl.balls > 0) { pl.score += pl.balls * 10000; floatText(W / 2, H / 2 + 110, `${pl.balls} RESTKUGELN +${fmt(pl.balls * 10000)}`, '#7ff6ff', 20, 2.5); }
      }
      finishGame(true);
      return;
    }
    if (G.players.every((p) => p.balls <= 0 || !p.connected)) { finishGame(false); return; }
    pickBonus();
    if (mode !== 'solo') {
      const n = G.players.length;
      for (let i = 1; i <= n; i++) {
        const k = (G.turn + i) % n;
        if (G.players[k].balls > 0 && G.players[k].connected) { G.turn = k; break; }
      }
    }
    G.phase = 'aim';
    turnBanner();
  }

  function finishGame(won) {
    G.over = true; G.won = won; G.phase = 'over';
    G.resultsAt = time + (won ? 3.2 : 1.6);
    if (!won) banner('Vorhang!', 'Keine Kugeln mehr', '#ff6fa8', 2, 56);
    if (mode === 'solo' && won) {
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, G.level + 2));
      save.best[G.level] = Math.max(save.best[G.level] || 0, G.players[0].score);
      persist();
    }
    updateInfo();
  }

  // ---------- Online-Abgleich über rooms/<raum>/g ----------
  function serialize() {
    return {
      gone: G.pegs.map((p) => (p.gone ? 1 : 0)).join(''),
      bonus: G.pegs.findIndex((p) => p.kind === 'bonus'),
      turn: G.turn, finale: G.finale, over: G.over, won: G.won,
      players: G.players.map((p) => ({ score: p.score, balls: p.balls, guide: p.guide, on: p.connected ? 1 : 0 })),
    };
  }
  function pushState() {
    const o = O(); if (!o) return;
    const v = Math.max(appliedV, (lastG && lastG.st && lastG.st.v) || 0) + 1;
    appliedV = v;
    o.net.set(`${o.path}/g/st`, { v, n: G.shotNo, ...serialize() });
  }
  function applySync(s) {
    shot = null;
    G.pegs.forEach((p, i) => {
      p.lit = false; p.hits = 0;
      const gone = s.gone[i] === '1';
      if (gone && !p.gone) sparks(p.x, p.y, COL[p.kind][0], 6, 100);
      p.gone = gone;
      if (p.kind === 'bonus') p.kind = 'norm';
    });
    if (G.pegs[s.bonus]) G.pegs[s.bonus].kind = 'bonus';
    (s.players || []).forEach((q, i) => {
      const p = G.players[i]; if (!p) return;
      p.score = q.score | 0; p.balls = q.balls | 0; p.guide = q.guide | 0;
      if (!q.on) p.connected = false;
    });
    G.turn = s.turn | 0; G.finale = !!s.finale;
    if (s.over) {
      if (!G.over) { G.over = true; G.won = !!s.won; G.phase = 'over'; G.resultsAt = time + 1.5; if (!s.won) banner('Vorhang!', 'Keine Kugeln mehr', '#ff6fa8', 2, 56); }
      updateInfo();
    } else {
      G.phase = 'aim';
      turnBanner();
    }
  }
  function shotList(g) {
    const sh = g && g.sh;
    if (!sh) return [];
    if (Array.isArray(sh)) return sh;
    const a = []; for (const k of Object.keys(sh)) a[+k] = sh[k]; return a;
  }

  function netTick(dt) {
    if (!online || !G) return;
    const o = O(), g = lastG || {};
    if (!o) return;
    const here = o.players || {};
    G.players.forEach((p, i) => {
      if (here[p.uid]) { p.goneT = 0; return; }
      p.goneT += dt;
      if (p.connected && p.goneT > 10) {
        p.connected = false;
        floatText(W / 2, 140, `${p.name} hat den Raum verlassen`, '#ff8aa8', 18, 2.5);
        if (i === G.me) return;
      }
    });
    const ch = g.ch || {};
    G.players.forEach((p, i) => { if (ch[i] && CHAR_IDS.has(ch[i])) p.char = ch[i]; });
    if (!G.over && o.host && !G.players[G.turn].connected && (G.phase === 'aim' || G.phase === 'wait')) { resolveTurn(); pushState(); }
    if (G.phase === 'aim' && !G.over && G.turn !== G.me) {
      const m = shotList(g)[G.shotNo + 1];
      if (Array.isArray(m) && (m[3] | 0) === G.turn) fire(+m[0], m[1] | 0, +m[2]);
      else if (Array.isArray(g.aim) && (g.aim[0] | 0) === G.turn) aim.angle = clamp(+g.aim[1] || Math.PI / 2, 0.06, Math.PI - 0.06);
    }
    const st = g.st;
    if (st && st.v > appliedV && st.n === G.shotNo) {
      if (G.phase === 'aim' || G.phase === 'wait' || G.phase === 'over') { appliedV = st.v; stWait = 0; applySync(st); }
      else if ((stWait += dt) > 5) { appliedV = st.v; stWait = 0; applySync(st); }
    } else stWait = 0;
  }

  function onRoom(g) { lastG = g; }

  // ---------- Hauptschleife ----------
  let lastT = performance.now();
  function frame(now) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    time += dt;
    A.setMuted(!!S.muted);
    update(dt);
    render();
    drawMenuPortraits();
    raf = requestAnimationFrame(frame);
  }

  function update(dt) {
    for (const p of particles) {
      p.life -= dt;
      if (p.type !== 'ring') { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; }
    }
    particles = particles.filter((p) => p.life > 0);
    for (const t of texts) { t.life -= dt; t.y -= 26 * dt; }
    texts = texts.filter((t) => t.life > 0);
    for (const b of banners) b.life -= dt;
    banners = banners.filter((b) => b.life > 0);
    recoil = Math.max(0, recoil - dt * 4);
    if (!G) return;
    netTick(dt);
    if (paused && !online) return;

    if (G.phase !== 'shot') bucketClock += dt;
    aim.shown += (aim.angle - aim.shown) * Math.min(1, dt * 18);
    cam.slow = lerp(cam.slow, cam.slowTarget, Math.min(1, dt * 6));
    cam.zoom = lerp(cam.zoom, cam.focus ? 1.55 : 1, Math.min(1, dt * 4));
    cam.fx = lerp(cam.fx, cam.focus ? cam.focus.x : W / 2, Math.min(1, dt * 4));
    cam.fy = lerp(cam.fy, cam.focus ? cam.focus.y : H / 2, Math.min(1, dt * 4));

    if (G.phase === 'shot') {
      acc += dt * cam.slow;
      let n = 0;
      while (acc >= STEP && n < 60 && G.phase === 'shot') { simStep(STEP); acc -= STEP; n++; }
    } else acc = 0;
    if (G.phase === 'clearing') updateClearing(dt);
    if (G.finale) {
      G.fwT -= dt;
      if (G.fwT < 0 && time < G.resultsAt + 4) { G.fwT = 0.35 + Math.random() * 0.3; firework(80 + Math.random() * 640, 110 + Math.random() * 280); }
    }
    if (G.over && !G.resultsShown && time > G.resultsAt) { G.resultsShown = true; showResults(); }
  }

  // ---------- Darstellung ----------
  function render() {
    const c = ctx;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.drawImage(bg, 0, 0, CW, CH);
    drawBulbs();
    c.save();
    c.beginPath(); c.rect(FX, FY, W, H); c.clip();
    c.translate(FX, FY);
    if (!G) {
      c.globalAlpha = 0.55;
      for (const p of demoPegs) { p.lit = Math.sin(time * 1.5 + p.id * 0.7) > 0.92; drawPeg(p); }
      c.globalAlpha = 1;
    } else {
      if (cam.zoom > 1.002) { c.translate(cam.fx, cam.fy); c.scale(cam.zoom, cam.zoom); c.translate(-cam.fx, -cam.fy); }
      if (G.finale) drawBins(); else drawBucket(bucketX(shot ? shot.bt + shot.t : bucketClock));
      for (const p of G.pegs) drawPeg(p);
      drawGuide();
      if (shot) for (const b of shot.balls) drawBall(b);
      drawCannon();
      drawParticles();
      drawTexts();
    }
    c.restore();
    if (G) drawHUD();
    drawBanners();
    if (G && online && G.phase === 'wait') {
      c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `14px ${FONT}`; c.textAlign = 'center';
      c.fillText('Warte auf Abgleich …', CW / 2, CH - 14);
    }
    if (paused) { c.fillStyle = 'rgba(10,4,25,.55)'; c.fillRect(0, 0, CW, CH); }
  }

  function drawBulbs() {
    const c = ctx;
    for (let x = 20, i = 0; x < CW; x += 40, i++) {
      const on = (Math.floor(time * 3) + i) % 3 !== 0;
      c.fillStyle = on ? '#fff4c2' : '#7a5a2a';
      if (on) { c.shadowColor = '#ffd36b'; c.shadowBlur = 10; }
      c.beginPath(); c.arc(x, FY + 20, 3.5, 0, TAU); c.fill();
      c.shadowBlur = 0;
    }
  }

  function drawPeg(p) {
    if (p.gone) return;
    const c = ctx;
    const [light, dark] = COL[p.kind];
    c.save();
    c.translate(p.x, p.y);
    const lit = p.lit;
    if (lit) { const s = 1 + Math.sin(time * 14 + p.id) * 0.06; c.scale(s, s); c.shadowColor = light; c.shadowBlur = 18; }
    else if (p.kind === 'bonus') { c.shadowColor = light; c.shadowBlur = 8 + Math.sin(time * 5) * 5; }
    if (p.type === 'circle') {
      const g = c.createRadialGradient(-3, -3, 1, 0, 0, p.r);
      g.addColorStop(0, lit ? '#ffffff' : light); g.addColorStop(1, lit ? light : dark);
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = lit ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.3)';
      c.lineWidth = 1.2; c.stroke();
    } else {
      c.rotate(p.ang);
      const L = p.hl + p.hh;
      const g = c.createLinearGradient(0, -p.hh, 0, p.hh);
      g.addColorStop(0, lit ? '#ffffff' : light); g.addColorStop(1, lit ? light : dark);
      c.fillStyle = g;
      roundRect(c, -L, -p.hh, 2 * L, 2 * p.hh, p.hh); c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = lit ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.3)';
      c.lineWidth = 1.2; c.stroke();
      c.rotate(-p.ang);
    }
    const em = lit ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.75)';
    if (p.kind === 'star') drawStar(c, 0, 0.5, 5.5, 2.4, lit ? '#fff' : '#fff6cf');
    else if (p.kind === 'power') drawBolt(c, 0, 0, 11, em);
    else if (p.kind === 'bonus') { c.strokeStyle = em; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 3.5, 0, TAU); c.stroke(); }
    c.restore();
  }

  function drawBall(b) {
    if (!b.alive) return;
    const c = ctx;
    b.trail.forEach(([x, y], i) => {
      const a = (i + 1) / b.trail.length;
      c.fillStyle = b.fire > 0 ? `rgba(255,${120 + i * 6},40,${a * 0.6})` : `rgba(200,230,255,${a * 0.35})`;
      c.beginPath(); c.arc(x, y, b.r * a * 0.9, 0, TAU); c.fill();
    });
    if (b.fire > 0) {
      c.shadowColor = '#ff7a1a'; c.shadowBlur = 22;
      if (Math.random() < 0.6) particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, life: 0.35, max: 0.35, color: Math.random() < 0.5 ? '#ffd36b' : '#ff5a2a', size: 3, g: -60 });
    }
    const g = c.createRadialGradient(b.x - 2.5, b.y - 2.5, 1, b.x, b.y, b.r);
    if (b.fire > 0) { g.addColorStop(0, '#fff6c2'); g.addColorStop(1, '#ff5a1a'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#d4dcef'); g.addColorStop(1, '#6a7896'); }
    c.fillStyle = g;
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
    c.shadowBlur = 0;
  }

  function drawCannon() {
    const c = ctx;
    c.save();
    c.translate(CANNON.x, CANNON.y);
    c.rotate(aim.shown);
    c.translate(-recoil * 6, 0);
    const g = c.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, '#ff6b8a'); g.addColorStop(0.5, '#c8143c'); g.addColorStop(1, '#6e0a22');
    c.fillStyle = g;
    roundRect(c, 4, -11, 42, 22, 6); c.fill();
    c.fillStyle = '#f0d4a0'; c.fillRect(16, -11, 8, 22);
    c.fillStyle = '#ffcf5a';
    roundRect(c, 40, -13, 9, 26, 3); c.fill();
    roundRect(c, 4, -12, 5, 24, 2); c.fill();
    if (G.phase === 'aim' && G.players[G.turn].balls > 0) {
      const bg2 = c.createRadialGradient(44, -2, 1, 46, 0, 7);
      bg2.addColorStop(0, '#fff'); bg2.addColorStop(1, '#7a88a8');
      c.fillStyle = bg2; c.beginPath(); c.arc(47, 0, 6, 0, TAU); c.fill();
    }
    c.restore();
    const bg3 = c.createRadialGradient(CANNON.x - 6, CANNON.y - 10, 2, CANNON.x, CANNON.y, 26);
    bg3.addColorStop(0, '#fff2b0'); bg3.addColorStop(1, '#c98a1a');
    c.fillStyle = bg3;
    c.beginPath(); c.arc(CANNON.x, CANNON.y - 4, 22, 0, TAU); c.fill();
    drawStar(c, CANNON.x, CANNON.y - 4, 10, 4.5, '#c8143c', 5, -Math.PI / 2 + time * 0.8);
  }

  function drawBucket(x) {
    const c = ctx, y = BUCKET_Y;
    const sg = c.createLinearGradient(0, y + 10, 0, y + 34);
    sg.addColorStop(0, '#e6eef8'); sg.addColorStop(1, '#5d6c8a');
    c.fillStyle = sg;
    c.beginPath(); c.ellipse(x, y + 22, 62, 12, 0, 0, TAU); c.fill();
    for (let i = 0; i < 7; i++) {
      const on = (Math.floor(time * 6) + i) % 3 === 0;
      c.fillStyle = on ? '#7ff6ff' : '#ff6fa8';
      c.beginPath(); c.arc(x - 48 + i * 16, y + 24 - Math.abs(i - 3) * 1.2, 2.6, 0, TAU); c.fill();
    }
    c.beginPath();
    c.moveTo(x - BUCKET_HW, y); c.lineTo(x + BUCKET_HW, y);
    c.lineTo(x + BUCKET_HW - 10, y + 16); c.lineTo(x - BUCKET_HW + 10, y + 16); c.closePath();
    c.save(); c.clip();
    for (let i = -6; i < 7; i++) { c.fillStyle = i % 2 ? '#c8143c' : '#f0d4a0'; c.fillRect(x + i * 8, y, 8, 18); }
    c.restore();
    c.strokeStyle = '#ffcf5a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - BUCKET_HW, y); c.lineTo(x + BUCKET_HW, y); c.stroke();
    c.fillStyle = '#ffcf5a';
    c.beginPath(); c.arc(x - BUCKET_HW, y, 5, 0, TAU); c.arc(x + BUCKET_HW, y, 5, 0, TAU); c.fill();
  }

  function drawBins() {
    const c = ctx, bw = W / 5;
    const cols = ['#5cc8ff', '#c79bff', '#ffd36b', '#c79bff', '#5cc8ff'];
    for (let i = 0; i < 5; i++) {
      const g = c.createLinearGradient(0, H - 46, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, cols[i]);
      c.globalAlpha = 0.55 + Math.sin(time * 6 + i) * 0.15;
      c.fillStyle = g; c.fillRect(i * bw, H - 46, bw, 46);
      c.globalAlpha = 1;
      c.fillStyle = '#fff'; c.font = `bold 16px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(fmt(BINS[i]), (i + 0.5) * bw, H - 16);
    }
    c.fillStyle = '#ffcf5a';
    for (let i = 1; i < 5; i++) c.fillRect(i * bw - 3, H - 46, 6, 46);
  }

  function predict(angle, sup) {
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const b = mkBall(CANNON.x + cs * 40, CANNON.y + sn * 40, cs * SPEED, sn * SPEED);
    const pts = [];
    const dt = 1 / 120, maxT = sup ? 2.4 : 0.42;
    let bounces = 0;
    for (let t = 0; t < maxT; t += dt) {
      b.vy += GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.9; bounces++; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.9; bounces++; }
      let hit = false;
      for (const p of G.pegs) {
        if (p.gone) continue;
        const k = contact(b, p);
        if (!k) continue;
        hit = true;
        if (!sup) break;
        bounce(b, k, p.type === 'circle' ? 0.76 : 0.7);
      }
      pts.push([b.x, b.y]);
      if (hit) { if (!sup) break; bounces++; }
      if (bounces > 5 || b.y > H) break;
    }
    return pts;
  }

  function drawGuide() {
    if (G.phase !== 'aim' || G.over) return;
    const pl = G.players[G.turn];
    if (pl.balls <= 0) return;
    const sup = pl.guide > 0;
    const pts = predict(aim.shown, sup);
    const c = ctx, step = sup ? 3 : 2;
    for (let i = 0; i < pts.length; i += step) {
      const a = 1 - i / pts.length;
      c.fillStyle = sup ? `hsla(${(time * 120 + i * 4) % 360},100%,75%,${0.3 + a * 0.6})` : `rgba(255,255,255,${0.15 + a * 0.6})`;
      c.beginPath(); c.arc(pts[i][0], pts[i][1], sup ? 2.6 : 2.2, 0, TAU); c.fill();
    }
  }

  function drawParticles() {
    const c = ctx;
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'ring') {
        c.strokeStyle = p.color; c.globalAlpha = a; c.lineWidth = 4 * a + 1;
        c.beginPath(); c.arc(p.x, p.y, p.r * (1 - a) + 6, 0, TAU); c.stroke();
      } else if (p.star) { c.globalAlpha = a; drawStar(c, p.x, p.y, p.size * 2, p.size, p.color); }
      else { c.globalAlpha = a; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
  }

  function drawTexts() {
    const c = ctx;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of texts) {
      c.globalAlpha = clamp((t.life / t.max) * 2, 0, 1);
      c.font = `bold ${t.size}px ${FONT}`;
      c.lineWidth = Math.max(3, t.size / 6); c.strokeStyle = 'rgba(30,6,50,.85)';
      c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.color; c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
  }

  function drawBanners() {
    const c = ctx;
    banners.forEach((b, i) => {
      const t = 1 - b.life / b.max;
      const sIn = Math.min(1, t * 6), fade = Math.min(1, b.life * 3);
      const s = 0.6 + 0.4 * (1 - Math.pow(1 - sIn, 3)) + Math.sin(time * 6) * 0.01;
      c.save();
      c.globalAlpha = fade;
      c.translate(CW / 2, FY + H * 0.4 + i * 10);
      c.scale(s, s);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `700 ${b.size}px ${FONT}`;
      c.lineWidth = b.size / 6; c.strokeStyle = '#3a0a28'; c.lineJoin = 'round';
      c.strokeText(b.text, 0, 0);
      c.fillStyle = b.color; c.fillText(b.text, 0, 0);
      if (b.sub) {
        c.font = `${Math.round(b.size * 0.38)}px ${FONT}`;
        c.lineWidth = 4; c.strokeText(b.sub, 0, b.size * 0.75);
        c.fillStyle = '#fff'; c.fillText(b.sub, 0, b.size * 0.75);
      }
      c.restore();
    });
  }

  function panel(x, y, w, h) {
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(22,6,46,.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,207,90,.7)'; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawHUD() {
    const c = ctx;
    c.textBaseline = 'middle';
    const n = G.players.length;
    const cw = Math.min(300, (CW - 40) / n), x0 = (CW - cw * n) / 2;
    G.players.forEach((p, i) => {
      const x = x0 + i * cw + 4, y = 5, w = cw - 8, h = 36;
      const act = i === G.turn && !G.over;
      roundRect(c, x, y, w, h, 12);
      c.fillStyle = act ? 'rgba(46,12,80,.95)' : 'rgba(20,6,40,.8)'; c.fill();
      c.lineWidth = act ? 2.5 : 1; c.strokeStyle = act ? '#ffd36b' : 'rgba(255,210,120,.35)'; c.stroke();
      c.globalAlpha = p.connected ? 1 : 0.4;
      drawPortrait(c, p.char, x + 20, y + 18, 15, time);
      c.textAlign = 'left';
      c.fillStyle = '#fff'; c.font = `12px ${FONT}`;
      let label = p.name + (online && i === G.me ? ' (du)' : '') + (p.connected ? '' : ' – weg');
      if (label.length > 22) label = label.slice(0, 21) + '…';
      c.fillText(label, x + 40, y + 11);
      c.fillStyle = '#ffd36b'; c.font = `bold 16px ${FONT}`;
      c.fillText(fmt(p.score), x + 40, y + 26);
      c.textAlign = 'right'; c.fillStyle = '#cfe8ff'; c.font = `13px ${FONT}`;
      c.fillText('● ' + p.balls, x + w - 10, y + 26);
      c.globalAlpha = 1;
    });

    panel(8, 62, 64, 574);
    c.textAlign = 'center';
    c.fillStyle = '#ffd36b'; c.font = `11px ${FONT}`;
    c.fillText('STERNE', 40, 80);
    const m = multiplier();
    c.font = `700 26px ${FONT}`; c.fillStyle = m >= 5 ? '#ff6fa8' : '#fff';
    c.fillText('×' + m, 40, 108);
    const ty = 134, th = 440;
    const f = (G.starTotal - starsLeft()) / G.starTotal;
    roundRect(c, 30, ty, 20, th, 10); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
    if (f > 0) {
      const gh = th * f;
      const g = c.createLinearGradient(0, ty + th, 0, ty);
      g.addColorStop(0, '#e88a00'); g.addColorStop(1, '#fff1a8');
      roundRect(c, 30, ty + th - gh, 20, gh, 10); c.fillStyle = g; c.fill();
    }
    for (const [fr, lbl] of [[0.35, '×2'], [0.6, '×3'], [0.8, '×5'], [1, '×10']]) {
      const yy = ty + th - th * fr;
      c.fillStyle = f >= fr ? '#ffd36b' : 'rgba(255,255,255,.45)';
      c.fillRect(24, yy - 1, 32, 2);
      c.font = `10px ${FONT}`; c.fillText(lbl, 40, yy - 9);
    }
    drawStar(c, 26, 600, 8, 3.5, '#ffd36b');
    c.fillStyle = '#fff'; c.font = `bold 15px ${FONT}`; c.textAlign = 'left';
    c.fillText(String(starsLeft()), 38, 601);

    const pl = G.players[G.turn];
    const ch = charById(pl.char);
    panel(888, 62, 64, 574);
    c.textAlign = 'center';
    c.fillStyle = '#ffd36b'; c.font = `11px ${FONT}`; c.fillText('KUGELN', 920, 80);
    c.fillStyle = '#fff'; c.font = `700 26px ${FONT}`; c.fillText(String(pl.balls), 920, 108);
    for (let i = 0; i < Math.min(pl.balls, 14); i++) {
      const yy = 450 - i * 22;
      const g = c.createRadialGradient(917, yy - 3, 1, 920, yy, 8);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#6a7896');
      c.fillStyle = g; c.beginPath(); c.arc(920, yy, 8, 0, TAU); c.fill();
    }
    drawPortrait(c, pl.char, 920, 515, 24, time);
    c.fillStyle = ch.color; c.font = `bold 10px ${FONT}`;
    c.fillText(ch.power.toUpperCase(), 920, 556, 58);
    if (pl.guide > 0) { c.fillStyle = '#fff'; c.font = `11px ${FONT}`; c.fillText('noch ' + pl.guide + '×', 920, 572); }
    c.fillStyle = 'rgba(255,255,255,.5)'; c.font = `9px ${FONT}`;
    c.fillText(`Level ${G.level + 1}`, 920, 612);
    c.fillText(online ? 'Online' : 'Esc = Pause', 920, 626);
  }

  // ---------- Eingabe ----------
  function toField(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CW - FX, y: ((e.clientY - r.top) / r.height) * CH - FY };
  }
  function setAimFrom(p) {
    if (!canAim()) return;
    let a = Math.atan2(p.y - CANNON.y, p.x - CANNON.x);
    if (a < -Math.PI / 2) a = Math.PI; else if (a < 0) a = 0;
    aim.angle = clamp(a, 0.06, Math.PI - 0.06);
    sendAim();
  }
  function sendAim() {
    if (!online || !canAim()) return;
    const now = performance.now(), o = O();
    if (o && now - lastAimSent > 150) { lastAimSent = now; o.net.set(`${o.path}/g/aim`, [G.me, aim.angle]); }
  }
  let pointerDown = false;
  canvas.addEventListener('pointermove', (e) => { if (G) setAimFrom(toField(e)); });
  canvas.addEventListener('pointerdown', (e) => { A.init(); if (!G || paused) return; pointerDown = true; setAimFrom(toField(e)); });
  canvas.addEventListener('pointerup', (e) => {
    if (!G || !pointerDown) return;
    pointerDown = false;
    setAimFrom(toField(e));
    tryShoot();
  });
  const onKey = (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || S.overOpen()) return;
    if (e.key === 'm' || e.key === 'M') { A.init(); toggleMusic(); return; }
    if (!G) return;
    if (e.key === 'Escape') { if (!G.over) { e.preventDefault(); e.stopPropagation(); togglePause(); } return; }
    if (!canAim()) return;
    const st = e.shiftKey ? 0.002 : 0.012;
    if (e.key === 'ArrowLeft') { aim.angle = clamp(aim.angle + st, 0.06, Math.PI - 0.06); sendAim(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { aim.angle = clamp(aim.angle - st, 0.06, Math.PI - 0.06); sendAim(); e.preventDefault(); }
    if ((e.key === ' ' || e.key === 'Enter') && tag !== 'BUTTON') { e.preventDefault(); A.init(); tryShoot(); }
  };
  window.addEventListener('keydown', onKey, true);

  function toggleMusic() {
    const on = A.toggleMusic();
    musicBtn.textContent = on ? '♪' : '♪̸';
  }
  musicBtn.textContent = A.isMusicOn() ? '♪' : '♪̸';
  musicBtn.addEventListener('click', () => { A.init(); toggleMusic(); musicBtn.blur(); });

  // ---------- Menüs in der Spielfläche ----------
  function setUI(html) { ui.innerHTML = html; }
  function on(sel, fn) { ui.querySelectorAll(sel).forEach((n) => n.addEventListener('click', (e) => { A.init(); S.blip && S.blip(); fn(e, n); })); }
  function drawMenuPortraits() {
    ui.querySelectorAll('canvas[data-char]').forEach((cv) => {
      const c = cv.getContext('2d');
      if (cv.width !== 192) { cv.width = 192; cv.height = 192; }
      c.clearRect(0, 0, 192, 192);
      drawPortrait(c, cv.dataset.char, 96, 104, 78, time);
    });
  }
  function charCards(sel) {
    return `<div class="oz-chars">${CHARACTERS.map((ch) => `
      <button type="button" class="oz-char ${ch.id === sel ? 'sel' : ''}" data-id="${ch.id}">
        <canvas data-char="${ch.id}"></canvas>
        <b>${ch.name}</b><i>${ch.title}</i>
        <small><span style="color:${ch.color}">${ch.power}:</span> ${ch.desc}</small>
      </button>`).join('')}</div>`;
  }
  function bindCharCards(cb) {
    on('.oz-chars .oz-char', (e, n) => {
      n.parentElement.querySelectorAll('.oz-char').forEach((x) => x.classList.toggle('sel', x === n));
      cb(n.dataset.id);
    });
  }

  function localName(i) { const p = S.settings.players[i] || {}; return (p.name || '').trim() || `Spieler ${i + 1}`; }
  function localPower(i) { const p = S.settings.players[i] || {}; return p.power || 'fuchs'; }

  function showSoloSetup() {
    let char = save.char;
    info.textContent = 'Wähle deine Figur und eine Manege';
    setUI(`<div class="oz-panel"><h2>Wähle deine Figur</h2>
      ${charCards(char)}
      <h3>Programm der Saison</h3>
      <div class="oz-levels">${LEVELS.map((l, i) => {
        const locked = i >= save.unlocked;
        return `<button type="button" class="oz-lvl" data-l="${i}" ${locked ? 'disabled' : ''}><b>${i + 1}. ${esc(l.name)}</b>
          <small>${save.best[i] ? 'Rekord ' + fmt(save.best[i]) : locked ? 'gesperrt' : 'neu'}</small></button>`;
      }).join('')}</div>
      <p class="oz-hint">Triff alle goldenen Sterne. Grüne Power-Pegs lösen die Kraft deiner Figur aus.</p></div>`);
    bindCharCards((id) => { char = id; save.char = id; persist(); });
    on('.oz-lvl', (e, n) => startSolo(+n.dataset.l));
  }
  function startSolo(level) {
    initGame({ level, seed: (Math.random() * 1e9) | 0, players: [{ name: localName(0), power: localPower(0), char: save.char }] });
  }

  function localCfg() {
    if (!save.local) save.local = { n: 2, level: 0, chars: CHARACTERS.map((c) => c.id) };
    return save.local;
  }
  function showLocalSetup() {
    const L = localCfg();
    info.textContent = 'Alle spielen abwechselnd auf demselben Brett';
    setUI(`<div class="oz-panel"><h2>Zu mehreren an einem Gerät</h2>
      <div class="oz-row">Wie viele? ${[2, 3, 4].map((k) => `<button type="button" class="btn oz-n ${k === L.n ? 'sel' : ''}" data-n="${k}">${k}</button>`).join('')}</div>
      <div class="oz-localps">${Array.from({ length: L.n }, (_, i) => `
        <div class="oz-localp"><input id="oz-ln${i}" maxlength="16" value="${esc(localName(i))}" aria-label="Name ${i + 1}">
          <div class="oz-mini" data-p="${i}">${CHARACTERS.map((ch) => `<button type="button" class="oz-char ${L.chars[i] === ch.id ? 'sel' : ''}" data-id="${ch.id}" title="${ch.name}: ${ch.power}"><canvas data-char="${ch.id}"></canvas></button>`).join('')}</div>
        </div>`).join('')}</div>
      <div class="oz-row">Manege: <select id="oz-lv">${LEVELS.map((l, i) => `<option value="${i}" ${i === L.level ? 'selected' : ''}>${i + 1}. ${esc(l.name)}</option>`).join('')}</select></div>
      <div class="oz-row"><button type="button" class="btn def" data-a="go">Vorstellung starten ►</button></div></div>`);
    const readNames = () => { for (let i = 0; i < L.n; i++) { const v = ui.querySelector('#oz-ln' + i).value.trim().slice(0, 16); if (S.settings.players[i]) S.settings.players[i].name = v || `Spieler ${i + 1}`; } };
    on('.oz-n', (e, n) => { readNames(); L.n = +n.dataset.n; persist(); showLocalSetup(); });
    on('.oz-mini .oz-char', (e, n) => {
      const i = +n.parentElement.dataset.p;
      L.chars[i] = n.dataset.id; persist();
      n.parentElement.querySelectorAll('.oz-char').forEach((x) => x.classList.toggle('sel', x === n));
    });
    on('[data-a=go]', () => { readNames(); L.level = +ui.querySelector('#oz-lv').value; persist(); startLocal(); });
  }
  function startLocal() {
    const L = localCfg();
    initGame({ level: L.level, seed: (Math.random() * 1e9) | 0, players: Array.from({ length: L.n }, (_, i) => ({ name: localName(i), power: localPower(i), char: L.chars[i] || CHARACTERS[i].id })) });
  }

  function togglePause() {
    paused = !paused;
    if (!paused) { setUI(''); return; }
    setUI(`<div class="oz-panel oz-small"><h2>Pause</h2>
      ${online ? '<p class="oz-hint">Online läuft das Spiel weiter.</p>' : ''}
      <div class="oz-col"><button type="button" class="btn def" data-a="resume">Weiter</button>
      ${online ? '' : '<button type="button" class="btn" data-a="restart">Level neu starten</button>'}
      <button type="button" class="btn" data-a="menu">${online ? 'Raum verlassen' : 'Hauptmenü'}</button></div></div>`);
    on('[data-a=resume]', togglePause);
    on('[data-a=restart]', () => { paused = false; if (mode === 'solo') startSolo(G.level); else startLocal(); });
    on('[data-a=menu]', () => (online ? S.toMenu() : S.openSetup()));
  }

  function showResults() {
    const ranked = G.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
    let title, sub;
    if (mode === 'solo') {
      title = G.won ? 'Bravo, Vorstellung gemeistert!' : 'Vorhang zu';
      sub = G.won ? `${G.name} geschafft.` : `Noch ${starsLeft()} Sterne übrig.`;
    } else {
      const top = ranked[0], tie = ranked[1] && ranked[1].score === top.score;
      title = tie ? 'Unentschieden!' : online && top.i === G.me ? 'Du gewinnst!' : `${top.name} gewinnt!`;
      sub = G.won ? 'Alle Sterne geknackt.' : 'Alle Kugeln verschossen.';
    }
    const rows = ranked.map((p) => ({ name: p.name, power: p.power, score: p.score, note: charById(p.char).name, col: S.PCOL[p.i % 4] }));
    const me = online ? G.me : mode === 'solo' ? 0 : ranked[0].i;
    const meP = G.players[me];
    const iWon = mode === 'solo' ? G.won : ranked[0].i === me && !(ranked[1] && ranked[1].score === ranked[0].score);
    const entries = [{ name: meP.name.slice(0, 16), score: meP.score, char: meP.power || 'fuchs', map: 'orbit-' + (G.level + 1), game: 'orbit', mode, level: G.level + 1, ...(iWon ? { win: 1 } : {}) }];
    if (online && S.ONLINE && S.ONLINE.host) { S.ONLINE.net.update(S.ONLINE.path + '/g', { done: 1 }); S.setRoomStatus('lobby'); }
    const lvl = G.level, won = G.won;
    S.showOver({
      title, sub, rows, entries, boxes: 1 + (iWon && mode !== 'local' ? 1 : 0), delay: 400,
      again: online ? () => SK().restart()
        : mode === 'solo' ? () => { CUR = orbitGame({ mode: 'solo', start: { level: won && lvl < LEVELS.length - 1 ? lvl + 1 : lvl } }); }
        : () => { CUR = orbitGame({ mode: 'local', start: { level: lvl } }); },
    });
  }

  // ---------- Start ----------
  if (online) {
    const g = opt.g;
    const me = g.players.findIndex((p) => p.uid === opt.uid);
    const ch = g.ch || {};
    initGame({
      level: g.level | 0, seed: g.seed | 0, me,
      players: g.players.map((p, i) => ({ uid: p.uid, name: p.name, power: p.power, char: CHAR_IDS.has(ch[i]) ? ch[i] : CHARACTERS[i % 4].id })),
    });
    if (!ch[me] || ch[me] !== save.char) { const o = O(); if (o) o.net.set(`${o.path}/g/ch/${me}`, save.char); }
    if (g.st && g.st.n) { G.shotNo = g.st.n; appliedV = g.st.v; applySync(g.st); }
  } else if (opt.start) {
    if (mode === 'solo') startSolo(opt.start.level);
    else { localCfg().level = opt.start.level; startLocal(); }
  } else if (mode === 'solo') showSoloSetup();
  else showLocalSetup();

  raf = requestAnimationFrame((t) => { lastT = t; resize(); frame(t); });

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    ro.disconnect();
    window.removeEventListener('keydown', onKey, true);
    A.suspend();
    if (opt.run) FINISHED.add(opt.run);
    if (CUR === inst) CUR = null;
  }
  const inst = { game: 'orbit', run: opt.run, onRoom, stop, debug: { get G() { return G; }, get shot() { return shot; }, aim, tick(sec = 1, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { time += dt; update(dt); } render(); }, shoot(a) { if (a != null) aim.angle = a; tryShoot(); } } };
  return inst;
}

// ---------- Raum-Ablauf (wie in games.js) ----------
let CUR = null;
const FINISHED = new Set();
let nextLevel = null;

function roomStart(list) {
  const o = SK().ONLINE; if (!o || !o.host) return;
  const level = nextLevel == null ? Math.floor(Math.random() * LEVELS.length) : nextLevel;
  nextLevel = (level + 1) % LEVELS.length;
  const g = {
    game: 'orbit', run: rid(), seed: (Math.random() * 1e9) | 0, level,
    players: list.slice(0, 4).map((p) => ({ uid: p.uid, name: String(p.name || 'Gast').slice(0, 16), power: SK().CHARS[p.power] ? p.power : 'fuchs' })),
  };
  o.net.set(o.path + '/g', g).then(() => SK().setRoomStatus('playing'));
}
function roomFollow(g) {
  const S = SK(), o = S.ONLINE;
  if (!o || !g || g.game !== 'orbit') return;
  if (CUR && CUR.run === g.run) { CUR.onRoom(g); return; }
  if (g.done || FINISHED.has(g.run) || !o.meta || o.meta.status !== 'playing') return;
  if (!(g.players || []).some((p) => p.uid === o.uid)) return;
  if (CUR) CUR.stop();
  CUR = orbitGame({ mode: 'online', g, uid: o.uid, run: g.run });
  if (CUR) CUR.onRoom(g);
}

GAMES.orbit = {
  desc: 'Kugeln durch die Manege zwischen den Sternen: Schieß aus der Zirkuskanone und triff alle goldenen Sterne. Vier Artisten mit eigenen Kräften, zehn Manegen, Supernova-Finale. Allein, zu mehreren an einem Gerät oder online.',
  ways: [{ id: 'solo', label: 'Allein spielen' }, { id: 'duo', label: 'Zu mehreren an einem Gerät' }],
  startLocal(way) { if (CUR) CUR.stop(); CUR = orbitGame({ mode: way === 'duo' ? 'local' : 'solo' }); },
  hostStart(list) { roomStart(list); },
  onRoom(g) { roomFollow(g); },
  boardNote: (e) => `Level ${e.level || '?'} · ${e.mode === 'online' ? (e.win ? 'Online-Sieg' : 'Online') : e.mode === 'local' ? 'Zu mehreren' : e.win ? 'Geschafft' : 'Allein'}`,
  get current() { return CUR; },
};
