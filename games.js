/* Jojoba's Spielekiste: Klötzchenregen und Schiffe versenken.
   Beide Spiele nutzen window.SK aus index.html (Theme, Klang, Charaktere, Räume, Spielende-Dialog, Bestenliste). */
(() => {
'use strict';
const GAMES = window.GAMES = window.GAMES || {};
const SK = () => window.SK;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => SK().esc(s);
function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function localPlayer(i = 0) { const p = SK().settings.players[i]; return { name: (p.name || '').trim() || `Spieler ${i + 1}`, power: p.power }; }
const sfx = (f, d, w, v, t) => SK().tone(f, d, w, v, t);

/* Kopfzeile jeder Arcade-Seite. Online fragt der Zurück-Knopf einmal nach. */
function topBar(root, title, online) {
  const bar = el('div', 'ar-bar', `<button class="btn ar-back" type="button">${online ? '◄ Raum verlassen' : '◄ Menü'}</button><b class="ar-title">${title}</b><span class="ar-info"></span>`);
  root.appendChild(bar);
  const back = bar.querySelector('.ar-back');
  let armed = 0;
  back.addEventListener('click', () => {
    if (online && Date.now() - armed > 3000) { armed = Date.now(); back.textContent = 'Wirklich verlassen?'; setTimeout(() => { back.textContent = '◄ Raum verlassen'; }, 3000); return; }
    if (online) SK().toMenu(); else SK().openSetup();
  });
  return bar.querySelector('.ar-info');
}

/* =====================================================================
   Klötzchenregen: fallende Steine, volle Reihen verschwinden.
   Online spielt jede Person ihr eigenes Feld. Wer 2+ Reihen auf einmal
   abräumt, schickt Müllreihen an die anderen. Wer zuletzt übrig ist, gewinnt.
   ===================================================================== */
const KW = 10, KH = 20, KHID = 2, KROWS = KH + KHID;
const SHAPES = { I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]] };
const ORDER = 'IOTSZJL';
const ROT = {};
for (const t of ORDER) {
  ROT[t] = [SHAPES[t]];
  const n = t === 'I' ? 4 : 3;
  for (let r = 1; r < 4; r++) ROT[t].push(t === 'O' ? SHAPES.O : ROT[t][r - 1].map(([x, y]) => [n - 1 - y, x]));
}
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
const KCOL = ['', '#33d4ff', '#ffd23f', '#b65cff', '#3fe07c', '#ff4f63', '#4f7cff', '#ff9a3a', '#8a8f9c'];
const LINE_SCORE = [0, 100, 300, 500, 800];
const GARBAGE = [0, 0, 1, 2, 4];
const gravity = lv => Math.pow(Math.max(0.05, 0.8 - (lv - 1) * 0.007), lv - 1);

function makeBoard(seed) {
  const rnd = mulberry(seed);
  const B = { grid: new Uint8Array(KW * KROWS), queue: [], hold: null, canHold: true, cur: null, score: 0, lines: 0, level: 1, combo: -1, b2b: false,
    drop: 0, lock: 0, moves: 0, over: false, pending: [], flash: [], shake: 0, sent: 0, rnd };
  B.fill = () => { while (B.queue.length < 7) { const bag = ORDER.split(''); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } B.queue.push(...bag); } };
  B.at = (x, y) => (x < 0 || x >= KW || y >= KROWS) ? 9 : y < 0 ? 0 : B.grid[y * KW + x];
  B.fits = (t, r, x, y) => ROT[t][r].every(([cx, cy]) => B.at(x + cx, y + cy) === 0);
  B.spawn = (t) => {
    B.fill();
    t = t || B.queue.shift();
    B.cur = { t, r: 0, x: 3, y: t === 'I' ? 0 : 1 };
    B.drop = 0; B.lock = 0; B.moves = 0;
    if (!B.fits(t, 0, B.cur.x, B.cur.y)) { B.over = true; return false; }
    return true;
  };
  B.ghostY = () => { const c = B.cur; let y = c.y; while (B.fits(c.t, c.r, c.x, y + 1)) y++; return y; };
  return B;
}

function kroeGame(opt) {
  /* opt: { online: bool, seed, players: [{uid,name,power}], myUid, run } */
  const S = SK();
  const online = !!opt.online;
  const root = S.openArcade('bloecke', () => stop());
  root.classList.add('kr');
  const info = topBar(root, 'Klötzchenregen', online);
  const meP = online ? opt.players.find(p => p.uid === opt.myUid) : localPlayer(0);
  const others = online ? opt.players.filter(p => p.uid !== opt.myUid) : [];
  const main = el('div', 'kr-main');
  main.innerHTML = `
    <aside class="kr-side kr-l">
      <div class="kr-card kr-me"><img alt="" src="${S.ICON_URL[meP.power] || S.ICON_URL.fuchs}"><b>${esc(meP.name)}</b></div>
      <div class="kr-card kr-holdcard"><span class="kr-lab">Halten</span><canvas class="kr-hold" width="96" height="64"></canvas></div>
      <div class="kr-card kr-stats"><span class="kr-lab">Punkte</span><b class="kr-score">0</b><span class="kr-lab">Reihen</span><b class="kr-lines">0</b><span class="kr-lab">Stufe</span><b class="kr-level">1</b></div>
    </aside>
    <div class="kr-well"><canvas class="kr-board"></canvas><div class="kr-msg" hidden></div></div>
    <aside class="kr-side kr-r">
      <div class="kr-card"><span class="kr-lab">Nächste</span><canvas class="kr-next" width="96" height="216"></canvas></div>
      ${online ? `<div class="kr-opps">${others.map(p => `<div class="kr-card kr-opp" data-uid="${esc(p.uid)}"><span class="kr-on"><img alt="" src="${S.ICON_URL[p.power] || S.ICON_URL.fuchs}">${esc(p.name)}</span><canvas width="60" height="120"></canvas><span class="kr-os">0</span></div>`).join('')}</div>` : ''}
    </aside>`;
  root.appendChild(main);
  const touch = window.matchMedia('(pointer:coarse)').matches;
  info.textContent = online ? `${opt.players.length} im Duell` : touch ? 'Tippen dreht · Wischen ↓ fällt · ↑ hält' : 'Pfeile, ↑ drehen, Leertaste fallen, C halten';

  const cv = main.querySelector('.kr-board'), cx = cv.getContext('2d');
  const hold = main.querySelector('.kr-hold').getContext('2d'), next = main.querySelector('.kr-next').getContext('2d');
  const msg = main.querySelector('.kr-msg');
  const B = makeBoard(opt.seed || (Math.random() * 1e9) | 0);
  B.spawn();
  let cell = 24, running = true, paused = false, raf = 0, last = performance.now(), dirty = true, lastSync = 0, ended = false, deadAt = 0;
  const seenGb = new Set();
  const theme = () => S.TH();

  function resize() {
    const narrow = window.innerWidth <= 700;
    // schmal: Halten, Punkte und Nächste stehen als Reihe über dem Feld, das Feld bekommt fast die ganze Breite
    const top = narrow ? Math.max(main.querySelector('.kr-l').offsetHeight, main.querySelector('.kr-r').offsetHeight, 60) + 8 : 0;
    const availH = Math.max(200, window.innerHeight - (narrow ? 96 + top : 150)), availW = Math.max(120, narrow ? window.innerWidth - 24 - 16 : 640);
    const nc = main.querySelector('.kr-next'), nw = narrow ? 150 : 96, nh = narrow ? 44 : 216;
    if (nc.width !== nw) { nc.width = nw; nc.height = nh; }
    cell = Math.max(10, Math.floor(Math.min(availH / KH, availW / KW, 38)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = cell * KW + 'px'; cv.style.height = cell * KH + 'px';
    cv.width = cell * KW * dpr; cv.height = cell * KH * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  /* ---- Zeichnen ---- */
  function block(c, x, y, s, col, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = col; c.fillRect(x + 1, y + 1, s - 2, s - 2);
    c.fillStyle = 'rgba(255,255,255,.38)'; c.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.18));
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 1, y + s - 1 - Math.max(2, s * 0.16), s - 2, Math.max(2, s * 0.16));
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1; c.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
    c.globalAlpha = 1;
  }
  function boardBg(c, w, hgt) {
    const b = theme().board || {};
    const g = c.createLinearGradient(0, 0, 0, hgt); g.addColorStop(0, b.top || '#0e1030'); g.addColorStop(0.5, b.mid || '#1b1740'); g.addColorStop(1, b.bot || '#2c1738');
    c.fillStyle = g; c.fillRect(0, 0, w, hgt);
  }
  function draw() {
    const s = cell, W = s * KW, H = s * KH;
    cx.save();
    if (B.shake > 0) cx.translate(0, Math.round(B.shake * 4));
    boardBg(cx, W, H);
    cx.strokeStyle = 'rgba(255,255,255,.06)'; cx.lineWidth = 1;
    for (let x = 1; x < KW; x++) { cx.beginPath(); cx.moveTo(x * s + 0.5, 0); cx.lineTo(x * s + 0.5, H); cx.stroke(); }
    for (let y = 1; y < KH; y++) { cx.beginPath(); cx.moveTo(0, y * s + 0.5); cx.lineTo(W, y * s + 0.5); cx.stroke(); }
    for (let y = KHID; y < KROWS; y++) for (let x = 0; x < KW; x++) { const v = B.grid[y * KW + x]; if (v) block(cx, x * s, (y - KHID) * s, s, B.over ? '#6a6f7c' : KCOL[v]); }
    if (B.cur && !B.over) {
      const c = B.cur, gy = B.ghostY(), col = KCOL[ORDER.indexOf(c.t) + 1];
      for (const [px, py] of ROT[c.t][c.r]) {
        const yy = gy + py - KHID; if (yy < 0) continue;
        cx.strokeStyle = col; cx.globalAlpha = 0.5; cx.lineWidth = 2; cx.strokeRect((c.x + px) * s + 3, yy * s + 3, s - 6, s - 6); cx.globalAlpha = 1;
      }
      for (const [px, py] of ROT[c.t][c.r]) { const yy = c.y + py - KHID; if (yy >= 0) block(cx, (c.x + px) * s, yy * s, s, col); }
    }
    for (const f of B.flash) { cx.fillStyle = `rgba(255,255,255,${f.t * 2.4})`; cx.fillRect(0, (f.y - KHID) * s, W, s); }
    cx.restore();
    drawMini(hold, B.hold, !B.canHold);
    const nc = next.canvas; next.clearRect(0, 0, nc.width, nc.height);
    if (nc.width > nc.height) B.queue.slice(0, 3).forEach((t, i) => drawPiece(next, t, 26 + i * 50, 22, i ? 9 : 11));
    else B.queue.slice(0, 3).forEach((t, i) => drawPiece(next, t, 48, 36 + i * 70, 18));
  }
  function drawPiece(c, t, mx, my, s, dim) {
    const cells = ROT[t][0], xs = cells.map(a => a[0]), ys = cells.map(a => a[1]);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, hgt = (Math.max(...ys) - Math.min(...ys) + 1) * s;
    for (const [x, y] of cells) block(c, mx - w / 2 + (x - Math.min(...xs)) * s, my - hgt / 2 + (y - Math.min(...ys)) * s, s, dim ? '#777' : KCOL[ORDER.indexOf(t) + 1]);
  }
  function drawMini(c, t, dim) { c.clearRect(0, 0, 96, 64); if (t) drawPiece(c, t, 48, 32, 18, dim); }

  /* ---- Spiellogik ---- */
  function move(dx) { const c = B.cur; if (!c || B.over) return false; if (B.fits(c.t, c.r, c.x + dx, c.y)) { c.x += dx; touched(); sfx(520, 0.03, 'square', 0.02); return true; } return false; }
  function rotate(dir) {
    const c = B.cur; if (!c || B.over || c.t === 'O') return;
    const r = (c.r + dir + 4) % 4;
    for (const [kx, ky] of (c.t === 'I' ? [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, -2]] : KICKS)) {
      if (B.fits(c.t, r, c.x + kx, c.y + ky)) { c.x += kx; c.y += ky; c.r = r; touched(); sfx(760, 0.05, 'triangle', 0.04); return; }
    }
  }
  function touched() { dirty = true; if (!B.fits(B.cur.t, B.cur.r, B.cur.x, B.cur.y + 1) && B.moves < 15) { B.lock = 0; B.moves++; } }
  function soft() { const c = B.cur; if (!c || B.over) return; if (B.fits(c.t, c.r, c.x, c.y + 1)) { c.y++; B.score += 1; B.drop = 0; dirty = true; } }
  function hard() {
    const c = B.cur; if (!c || B.over) return;
    const gy = B.ghostY(); B.score += 2 * (gy - c.y); c.y = gy; B.shake = 1; lockPiece();
  }
  function holdPiece() {
    if (!B.canHold || B.over) return;
    const t = B.cur.t; B.canHold = false;
    if (B.hold) { const h = B.hold; B.hold = t; B.spawn(h); } else { B.hold = t; B.spawn(); }
    sfx(440, 0.08, 'sine', 0.05); dirty = true;
  }
  function lockPiece() {
    const c = B.cur, col = ORDER.indexOf(c.t) + 1;
    let above = true;
    for (const [px, py] of ROT[c.t][c.r]) { const y = c.y + py; if (y >= 0) B.grid[y * KW + c.x + px] = col; if (y >= KHID) above = false; }
    sfx(180, 0.06, 'square', 0.04);
    const full = [];
    for (let y = 0; y < KROWS; y++) { let f = true; for (let x = 0; x < KW; x++) if (!B.grid[y * KW + x]) { f = false; break; } if (f) full.push(y); }
    const n = full.length;
    if (n) {
      for (const y of full) { B.grid.copyWithin(KW, 0, y * KW); B.grid.fill(0, 0, KW); B.flash.push({ y, t: 0.25 }); }
      B.combo++;
      const quad = n === 4;
      let pts = LINE_SCORE[n] * B.level; if (quad && B.b2b) pts = Math.round(pts * 1.5);
      pts += Math.max(0, B.combo) * 50 * B.level;
      B.score += pts; B.lines += n;
      let send = GARBAGE[n] + (quad && B.b2b ? 1 : 0) + Math.floor(Math.max(0, B.combo) / 2);
      B.b2b = quad;
      // Erst eigene Müllreihen damit verrechnen
      while (send > 0 && B.pending.length) { const k = Math.min(send, B.pending[0]); B.pending[0] -= k; send -= k; if (!B.pending[0]) B.pending.shift(); }
      if (send > 0) sendGarbage(send);
      const lv = 1 + Math.floor(B.lines / 10);
      if (lv > B.level) { B.level = lv; toast(`Stufe ${lv}`); [0, 4, 7, 12].forEach((k, i) => sfx(S.noteFreq(5 + k), 0.25, 'triangle', 0.06, i * 0.07)); }
      for (let i = 0; i < n; i++) sfx(S.noteFreq(4 + i * 2 + Math.max(0, B.combo)), 0.18, 'triangle', 0.07, i * 0.06);
      if (quad) toast(B.b2b ? 'Viererpack!' : 'Viererpack!');
      else if (B.combo >= 2) toast(`Kombo ×${B.combo}`);
    } else {
      B.combo = -1;
      if (B.pending.length) addGarbage();
    }
    B.canHold = true; dirty = true;
    if (above || B.over || !B.spawn()) { B.over = false; die(); }
  }
  function addGarbage() {
    let total = 0;
    while (B.pending.length) {
      const n = Math.min(B.pending.shift(), 12), hole = Math.floor(B.rnd() * KW);
      for (let k = 0; k < n; k++) {
        for (let x = 0; x < KW; x++) if (B.grid[x]) { B.over = true; }
        B.grid.copyWithin(0, KW); const base = (KROWS - 1) * KW;
        for (let x = 0; x < KW; x++) B.grid[base + x] = x === hole ? 0 : 8;
      }
      total += n;
    }
    if (total) { B.shake = 1.4; sfx(110, 0.25, 'sawtooth', 0.06); }
  }
  function toast(t) {
    const d = el('div', 'kr-toast', esc(t)); main.querySelector('.kr-well').appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  /* ---- Online ---- */
  const net = () => S.ONLINE && S.ONLINE.net, base = () => S.ONLINE && S.ONLINE.path + '/g';
  function sendGarbage(n) {
    B.sent += n;
    if (!online) return;
    const alive = others.filter(p => oppState(p.uid).a !== 0 && present(p.uid));
    if (!alive.length) return;
    const tgt = alive[Math.floor(Math.random() * alive.length)];
    net().push(`${base()}/gb/${tgt.uid}`, { n, f: opt.myUid, r: opt.run });
    toast(`${n} ${n === 1 ? 'Reihe' : 'Reihen'} an ${tgt.name}`);
  }
  let G = null;
  const oppState = uid => (G && G.p && G.p[uid]) || {};
  const goneAt = {};
  const present = uid => {
    if (!S.ONLINE || (S.ONLINE.players || {})[uid]) { delete goneAt[uid]; return true; }
    goneAt[uid] = goneAt[uid] || Date.now();
    return Date.now() - goneAt[uid] < 10000;  // kurz weg (Neuladen, Funkloch) zählt noch nicht als raus
  };
  let lastCheck = 0;
  function boardString() {
    const g = B.grid.slice();
    if (B.cur && !B.over) for (const [px, py] of ROT[B.cur.t][B.cur.r]) { const y = B.cur.y + py; if (y >= 0 && y < KROWS) g[y * KW + B.cur.x + px] = ORDER.indexOf(B.cur.t) + 1; }
    let s = ''; for (let i = KHID * KW; i < KROWS * KW; i++) s += g[i]; return s;
  }
  function sync(force) {
    if (!online || !S.ONLINE) return;
    const now = performance.now();
    if (!force && (!dirty || now - lastSync < 250)) return;
    lastSync = now; dirty = false;
    net().set(`${base()}/p/${opt.myUid}`, { b: boardString(), s: B.score, l: B.lines, a: B.over ? 0 : 1, t: deadAt || 0, r: opt.run });
  }
  function drawOpps() {
    if (!online) return;
    main.querySelectorAll('.kr-opp').forEach(card => {
      const uid = card.dataset.uid, st = oppState(uid), c = card.querySelector('canvas').getContext('2d');
      const gone = !present(uid), dead = st.a === 0 || gone;
      card.classList.toggle('dead', dead);
      card.querySelector('.kr-os').textContent = gone ? 'weg' : dead ? `K.O. · ${S.fmt(st.s || 0)}` : S.fmt(st.s || 0);
      boardBg(c, 60, 120);
      const b = typeof st.b === 'string' ? st.b : '';
      for (let i = 0; i < b.length && i < KW * KH; i++) { const v = +b[i]; if (v) { c.fillStyle = dead ? '#6a6f7c' : KCOL[v]; c.fillRect((i % KW) * 6, Math.floor(i / KW) * 6, 5, 5); } }
    });
  }
  function onRoom(g) {
    G = g;
    if (g && g.gb && g.gb[opt.myUid] && !B.over) {
      for (const [k, v] of Object.entries(g.gb[opt.myUid])) {
        if (seenGb.has(k) || !v || v.r !== opt.run) continue;
        seenGb.add(k); B.pending.push(Math.max(1, Math.min(12, v.n | 0)));
        const from = opt.players.find(p => p.uid === v.f);
        toast(`${from ? from.name : 'Jemand'} schickt ${v.n} ${v.n === 1 ? 'Reihe' : 'Reihen'}`); sfx(150, 0.2, 'sawtooth', 0.05);
      }
    }
    drawOpps(); checkEnd();
  }
  function checkEnd() {
    if (!online || ended || !G) return;
    const all = opt.players.map(p => {
      const st = p.uid === opt.myUid ? { a: B.over ? 0 : 1, s: B.score, t: deadAt, l: B.lines } : oppState(p.uid);
      const alive = st.a !== 0 && present(p.uid);
      return { ...p, alive, score: st.s || 0, t: st.t || 0, lines: st.l || 0 };
    });
    const alive = all.filter(p => p.alive);
    if (alive.length > 1) return;
    finish(all);
  }
  function die() {
    if (deadAt) return;
    B.over = true; deadAt = Date.now(); B.cur = null; dirty = true;
    [7, 4, 2, 0].forEach((k, i) => sfx(S.noteFreq(k), 0.3, 'triangle', 0.07, i * 0.12));
    if (online) { sync(true); msg.hidden = false; msg.innerHTML = '<b>K.O.</b><span>Du schaust den anderen zu.</span>'; checkEnd(); }
    else finish();
  }
  function finish(all) {
    if (ended) return; ended = true;
    running = false; draw(); sync(true);
    const me = localPlayer(0);
    if (!online) {
      const boxes = 1 + (B.lines >= 40 ? 1 : 0);
      S.showOver({ title: 'Stapel voll!', sub: `${B.lines} ${B.lines === 1 ? 'Reihe' : 'Reihen'}, Stufe ${B.level}.`, rows: [{ name: me.name, power: me.power, score: B.score, note: `${B.lines} Reihen` }],
        entries: [{ name: me.name.slice(0, 16), score: B.score, char: me.power, map: 'bloecke', game: 'bloecke', mode: 'solo', lines: B.lines, players: 1 }],
        boxes, again: () => GAMES.bloecke.startLocal('solo'), delay: 900 });
      return;
    }
    const ranked = all.slice().sort((a, b) => (b.alive - a.alive) || (b.t - a.t) || (b.score - a.score));
    const win = ranked[0], iWon = win.uid === opt.myUid;
    if (!B.over) { B.over = true; B.cur = null; }
    msg.hidden = false; msg.innerHTML = iWon ? '<b>Sieg!</b>' : `<b>${esc(win.name)} gewinnt</b>`;
    if (S.ONLINE && S.ONLINE.host) { net().update(base(), { done: 1 }); S.setRoomStatus('lobby'); }
    const mine = all.find(p => p.uid === opt.myUid) || { score: B.score, lines: B.lines };
    S.showOver({ title: iWon ? 'Du gewinnst das Duell!' : `${win.name} gewinnt!`, sub: 'Wer zuletzt noch spielt, gewinnt.',
      rows: ranked.map(p => ({ name: p.name, power: p.power, score: p.score, note: p.uid === win.uid ? 'Sieg' : `${p.lines} Reihen` , col: S.PCOL[opt.players.indexOf(opt.players.find(q => q.uid === p.uid)) % 4] })),
      entries: [{ name: meP.name.slice(0, 16), score: B.score, char: meP.power, map: 'bloecke', game: 'bloecke', mode: 'online', lines: B.lines, players: opt.players.length, ...(iWon ? { win: 1 } : {}) }],
      boxes: 1 + (iWon ? 1 : 0), again: () => SK().restart(), delay: 1400 });
  }

  /* ---- Schleife ---- */
  function tick(now) {
    if (!running && ended) { draw(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused && !B.over && B.cur) {
      if (keys.down) { keys.dt += dt; while (keys.dt > 0.035) { keys.dt -= 0.035; soft(); } }
      for (const d of ['left', 'right']) if (keys[d]) { keys[d + 't'] += dt; if (keys[d + 't'] > 0.16) { while (keys[d + 't'] > 0.16 + 0.045) { keys[d + 't'] -= 0.045; move(d === 'left' ? -1 : 1); } } }
      B.drop += dt;
      const gv = gravity(B.level);
      while (B.drop >= gv) { B.drop -= gv; if (B.fits(B.cur.t, B.cur.r, B.cur.x, B.cur.y + 1)) { B.cur.y++; dirty = true; } else break; }
      if (!B.fits(B.cur.t, B.cur.r, B.cur.x, B.cur.y + 1)) { B.lock += dt; if (B.lock > 0.5) lockPiece(); } else B.lock = 0;
    }
    B.flash = B.flash.filter(f => (f.t -= dt) > 0);
    B.shake = Math.max(0, B.shake - dt * 6);
    main.querySelector('.kr-score').textContent = S.fmt(B.score);
    main.querySelector('.kr-lines').textContent = B.lines;
    main.querySelector('.kr-level').textContent = B.level;
    draw(); sync();
    if (online && now - lastCheck > 1000) { lastCheck = now; drawOpps(); checkEnd(); }
    raf = requestAnimationFrame(tick);
  }
  /* ---- Eingabe ---- */
  const keys = { left: false, right: false, down: false, leftt: 0, rightt: 0, dt: 0 };
  function act(a, on) {
    if (paused || B.over || !B.cur || S.overOpen()) return;
    if (a === 'left' || a === 'right') { keys[a] = on; keys[a + 't'] = 0; if (on) move(a === 'left' ? -1 : 1); }
    else if (a === 'down') { keys.down = on; keys.dt = 0; if (on) soft(); }
    else if (!on) return;
    else if (a === 'rotL') rotate(-1); else if (a === 'rotR') rotate(1); else if (a === 'drop') hard(); else if (a === 'hold') holdPiece();
  }
  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotR', x: 'rotR', X: 'rotR', z: 'rotL', Z: 'rotL', y: 'rotL', Y: 'rotL', ' ': 'drop', c: 'hold', C: 'hold', Shift: 'hold' };
  function onKey(e) {
    if (!S.overOpen() && (e.key === 'p' || e.key === 'P' || e.key === 'Escape') && !online && e.type === 'keydown') { e.preventDefault(); setPause(!paused); return; }
    const a = KEYMAP[e.key]; if (!a || S.overOpen()) return;
    e.preventDefault();
    if (e.type === 'keydown' && e.repeat) return;
    act(a, e.type === 'keydown');
  }
  function setPause(p) {
    if (online || B.over) return;
    paused = p; msg.hidden = !p; if (p) msg.innerHTML = '<b>Pause</b><span>P oder Tippen zum Weiterspielen</span>';
  }
  msg.addEventListener('click', () => { if (paused) setPause(false); });
  function onVis() { if (document.hidden) setPause(true); }
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  document.addEventListener('visibilitychange', onVis);
  /* Touch wie in der offiziellen Handy-Version, auf der ganzen Spielfläche:
     ziehen links/rechts: der Stein folgt dem Finger Spalte für Spalte
     langsam nach unten ziehen: schneller fallen
     schnell nach unten wischen: sofort fallen lassen
     schnell nach oben wischen: halten
     tippen: drehen */
  let tp = null;
  const ready = () => !paused && !B.over && B.cur && !S.overOpen();
  main.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || tp || e.target.closest('button,.kr-msg')) return;
    tp = { hold: !!e.target.closest(".kr-holdcard"), id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, t0: performance.now(), hist: [[e.clientX, e.clientY, performance.now()]], moved: false, axis: null };
    try { main.setPointerCapture(e.pointerId); } catch (x) {}
  });
  main.addEventListener('pointermove', e => {
    if (!tp || e.pointerId !== tp.id) return;
    const now = performance.now(); tp.hist.push([e.clientX, e.clientY, now]); while (tp.hist.length > 2 && now - tp.hist[0][2] > 90) tp.hist.shift();
    const dx = e.clientX - tp.x0, dy = e.clientY - tp.y0;
    if (!tp.axis && Math.hypot(dx, dy) > 10) tp.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (!tp.axis || !ready()) return;
    const step = Math.max(14, cell * 0.85);
    // seitlich: bei senkrechtem Wischen erst ab einem deutlichen Ausschlag, damit ein Wurf nach unten nicht verrutscht
    if (tp.axis === 'h' || Math.abs(dx) > step * 2.5) {
      while (e.clientX - tp.cx >= step) { tp.cx += step; move(1); tp.moved = true; }
      while (tp.cx - e.clientX >= step) { tp.cx -= step; move(-1); tp.moved = true; }
    }
    if (tp.axis === 'v') while (e.clientY - tp.cy >= step) { tp.cy += step; soft(); tp.moved = true; }
  });
  const endTouch = e => {
    if (!tp || e.pointerId !== tp.id) return;
    const t = tp; tp = null;
    if (e.type === 'pointercancel' || !ready()) return;
    const now = performance.now(), h0 = t.hist[0], dt = Math.max(1, now - h0[2]);
    const vy = (e.clientY - h0[1]) / dt, dy = e.clientY - t.y0, dx = e.clientX - t.x0;
    // Wischen = kurze, deutliche Bewegung oder hohe Endgeschwindigkeit; langsames Ziehen bleibt Soft Drop
    const dur = now - t.t0, vert = Math.abs(dy) > Math.abs(dx) * 1.2;
    if (vert && dy > 40 && (vy > 0.5 || (dur < 320 && dy > 60))) hard();
    else if (vert && dy < -40 && (vy < -0.5 || (dur < 320 && dy < -60))) holdPiece();
    else if (!t.moved && Math.hypot(dx, dy) < 12 && now - t.t0 < 350) { if (t.hold) holdPiece(); else rotate(1); }
  };
  main.addEventListener('pointerup', endTouch);
  main.addEventListener('pointercancel', endTouch);
  window.addEventListener('resize', resize);
  requestAnimationFrame(() => { resize(); raf = requestAnimationFrame(tick); });
  sfx(S.noteFreq(5), 0.2, 'triangle', 0.06); sfx(S.noteFreq(9), 0.25, 'triangle', 0.06, 0.1);
  if (online) sync(true);

  function stop() {
    running = false; ended = true; cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
    window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis);
    FINISHED.add(opt.run);
    if (CUR === inst) CUR = null;
  }
  const inst = { game: 'bloecke', run: opt.run, onRoom, stop };
  return inst;
}

let CUR = null;
const FINISHED = new Set();
/* Gemeinsamer Raum-Ablauf: Host schreibt rooms/<raum>/g = {game, run, players, ...}, alle starten, sobald der Raum auf „playing“ steht */
function roomStart(game, list, extra) {
  const o = SK().ONLINE; if (!o || !o.host) return;
  const g = { game, run: rid(), seed: (Math.random() * 1e9) | 0, players: list.map(p => ({ uid: p.uid, name: String(p.name || 'Gast').slice(0, 16), power: SK().CHARS[p.power] ? p.power : 'fuchs' })), ...extra };
  o.net.set(o.path + '/g', g).then(() => SK().setRoomStatus('playing'));
}
function roomFollow(game, g, factory) {
  const S = SK(), o = S.ONLINE;
  if (!o || !g || g.game !== game) return;
  if (CUR && CUR.run === g.run) { CUR.onRoom(g); return; }
  if (g.done || FINISHED.has(g.run) || !o.meta || o.meta.status !== 'playing') return;
  if (!(g.players || []).some(p => p.uid === o.uid)) return;
  if (CUR) CUR.stop();
  CUR = factory(g, o.uid);
  if (CUR) CUR.onRoom(g);
}

GAMES.bloecke = {
  desc: 'Fallende Steine aus vier Kästchen. Schieb und dreh sie so, dass volle Reihen entstehen, die verschwinden. Je schneller es wird, desto mehr Punkte. Online räumt ihr gleichzeitig ab und schickt euch gegenseitig Müllreihen.',
  ways: [{ id: 'solo', label: 'Allein spielen' }],
  startLocal() { if (CUR) CUR.stop(); CUR = kroeGame({ online: false }); },
  hostStart(list) { roomStart('bloecke', list); },
  onRoom(g) { roomFollow('bloecke', g, (g2, uid) => kroeGame({ online: true, seed: g2.seed, players: g2.players, myUid: uid, run: g2.run })); },
  boardNote: e => `${e.lines || 0} Reihen · ${e.mode === 'online' ? (e.win ? 'Online-Sieg' : 'Online') : 'Allein'}`,
};

/* =====================================================================
   Schiffe versenken: 10×10, Flotte 5-4-3-3-2, Schiffe berühren sich nicht.
   Treffer heißt nochmal schießen. Versenkte Schiffe bekommen Wasser drumherum.
   ===================================================================== */
const N = 10;
const FLEET = [{ len: 5, name: 'Flaggschiff' }, { len: 4, name: 'Kreuzer' }, { len: 3, name: 'Zerstörer' }, { len: 3, name: 'Fregatte' }, { len: 2, name: 'U-Boot' }];
const COLS = 'ABCDEFGHIJ';
const shipCells = s => Array.from({ length: s.len }, (_, i) => s.d ? [s.x, s.y + i] : [s.x + i, s.y]);
function canPlace(ships, s, skip) {
  for (const [x, y] of shipCells(s)) {
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    for (let k = 0; k < ships.length; k++) {
      if (k === skip || !ships[k]) continue;
      for (const [a, b] of shipCells(ships[k])) if (Math.abs(a - x) <= 1 && Math.abs(b - y) <= 1) return false;
    }
  }
  return true;
}
function randomFleet(rnd = Math.random) {
  for (let tries = 0; tries < 200; tries++) {
    const ships = []; let ok = true;
    for (const f of FLEET) {
      let placed = false;
      for (let k = 0; k < 300 && !placed; k++) {
        const s = { x: Math.floor(rnd() * N), y: Math.floor(rnd() * N), len: f.len, d: rnd() < 0.5 ? 1 : 0 };
        if (canPlace(ships, s)) { ships.push(s); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return null;
}
const validFleet = f => Array.isArray(f) && f.length === FLEET.length && f.every((s, i) => s && s.len === FLEET[i].len) && f.every((s, i) => canPlace(f, s, i));

/* Spielstand aus beiden Flotten und der Zugliste: auf allen Geräten gleich */
function battle(fleets, first) {
  const B = { fleets, shots: [new Uint8Array(N * N), new Uint8Array(N * N)], turn: first || 0, winner: -1, count: [0, 0], hits: [0, 0] };
  // shots[i] = Schüsse AUF Brett i. 0 frei, 1 Wasser, 2 Treffer, 3 Wasser neben versenktem Schiff
  B.shipAt = (i, x, y) => fleets[i].findIndex(s => shipCells(s).some(([a, b]) => a === x && b === y));
  B.sunk = (i, k) => shipCells(fleets[i][k]).every(([a, b]) => B.shots[i][b * N + a] === 2);
  B.allSunk = i => fleets[i].every((_, k) => B.sunk(i, k));
  B.shoot = (by, x, y) => {
    const t = 1 - by, c = y * N + x;
    if (B.winner >= 0 || by !== B.turn || x < 0 || y < 0 || x >= N || y >= N || B.shots[t][c]) return null;
    B.count[by]++;
    const k = B.shipAt(t, x, y);
    if (k < 0) { B.shots[t][c] = 1; B.turn = t; return { hit: false }; }
    B.shots[t][c] = 2; B.hits[by]++;
    let sunk = false;
    if (B.sunk(t, k)) {
      sunk = true;
      for (const [a, b] of shipCells(fleets[t][k])) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = a + dx, yy = b + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && !B.shots[t][yy * N + xx]) B.shots[t][yy * N + xx] = 3;
      }
      if (B.allSunk(t)) B.winner = by;
    }
    return { hit: true, sunk, ship: k };
  };
  return B;
}

/* Computer: zählt, wo die übrigen Schiffe noch liegen könnten, und schießt dorthin. Ab und zu bewusst etwas ungenauer. */
function cpuPick(B, target) {
  const sh = B.shots[target], left = B.fleets[target].filter((_, k) => !B.sunk(target, k)).map(s => s.len);
  const openHits = []; for (let i = 0; i < N * N; i++) if (sh[i] === 2) { const k = B.shipAt(target, i % N, (i / N) | 0); if (!B.sunk(target, k)) openHits.push(i); }
  const score = new Float32Array(N * N);
  for (const len of left) for (let d = 0; d < 2; d++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cells = []; let ok = true, cover = 0;
    for (let i = 0; i < len; i++) { const xx = d ? x : x + i, yy = d ? y + i : y; if (xx >= N || yy >= N) { ok = false; break; } const v = sh[yy * N + xx]; if (v === 1 || v === 3) { ok = false; break; } if (v === 2) { const k = B.shipAt(target, xx, yy); if (B.sunk(target, k)) { ok = false; break; } cover++; } cells.push(yy * N + xx); }
    if (!ok) continue;
    if (openHits.length && !cover) continue;
    const w = openHits.length ? Math.pow(30, cover) : 1;
    for (const c of cells) if (!sh[c]) score[c] += w;
  }
  let free = []; for (let i = 0; i < N * N; i++) if (!sh[i]) free.push(i);
  if (!openHits.length && Math.random() < 0.55) { const par = free.filter(i => ((i % N) + ((i / N) | 0)) % 2 === 0); free = par.length ? par : free; return free[Math.floor(Math.random() * free.length)]; }
  if (openHits.length && Math.random() < 0.25) { const nb = free.filter(i => openHits.some(h => Math.abs(h % N - i % N) + Math.abs(((h / N) | 0) - ((i / N) | 0)) === 1)); if (nb.length) return nb[Math.floor(Math.random() * nb.length)]; }
  let best = -1, bs = -1;
  for (const i of free) { const s = score[i] + Math.random() * 0.01; if (s > bs) { bs = s; best = i; } }
  return best;
}

function gridHTML(cls, clickable) {
  let s = `<div class="sv-grid ${cls}"><span class="sv-corner"></span>${COLS.split('').map(c => `<span class="sv-lab">${c}</span>`).join('')}`;
  for (let y = 0; y < N; y++) {
    s += `<span class="sv-lab">${y + 1}</span>`;
    for (let x = 0; x < N; x++) s += clickable ? `<button class="sv-cell" type="button" data-x="${x}" data-y="${y}" aria-label="${COLS[x]}${y + 1}"></button>` : `<span class="sv-cell" data-x="${x}" data-y="${y}"></span>`;
  }
  return s + '</div>';
}
/* Brett einfärben: eigene Schiffe zeigen (own) oder nur versenkte (Gegnerbrett) */
function paintGrid(gridEl, ships, shots, own, preview) {
  const cells = gridEl.querySelectorAll('.sv-cell');
  const map = new Array(N * N).fill(null);
  (ships || []).forEach((s, k) => { if (!s) return; shipCells(s).forEach(([x, y], i) => { map[y * N + x] = { k, i, s }; }); });
  const sunkK = k => ships && ships[k] && shipCells(ships[k]).every(([x, y]) => shots && shots[y * N + x] === 2);
  cells.forEach((c, idx) => {
    const m = map[idx], v = shots ? shots[idx] : 0;
    const show = m && (own || sunkK(m.k));
    let cls = 'sv-cell';
    if (show) { cls += ' ship ' + (m.s.d ? 'v' : 'h'); if (m.i === 0) cls += ' s0'; if (m.i === m.s.len - 1) cls += ' s1'; if (sunkK(m.k)) cls += ' sunk'; }
    if (v === 1) cls += ' miss'; else if (v === 3) cls += ' miss auto'; else if (v === 2) cls += ' hit';
    if (preview && preview.has(idx)) cls += preview.bad ? ' pv bad' : ' pv';
    if (c.className !== cls) c.className = cls;
  });
}

function schiffeGame(opt) {
  /* opt: { mode: 'cpu'|'duo'|'online', players:[{name,power,uid?}], myIdx (online), first, run } */
  const S = SK(), online = opt.mode === 'online';
  const root = S.openArcade('schiffe', () => stop());
  root.classList.add('sv');
  const info = topBar(root, 'Schiffe versenken', online);
  const body = el('div', 'sv-body'); root.appendChild(body);
  const P = opt.players;
  const fleets = [null, null];
  let B = null, timers = [], stopped = false, ended = false, applied = 0, G = null, viewer = online ? opt.myIdx : 0;
  const later = (fn, ms) => { const t = setTimeout(() => { if (!stopped) fn(); }, ms); timers.push(t); };
  const face = i => `<img alt="" src="${S.ICON_URL[P[i].power] || S.ICON_URL.fuchs}">`;

  /* ---- Aufstellen ---- */
  function placement(i, done) {
    viewer = i;
    let ships = FLEET.map(() => null), sel = 0, dir = 0, hover = null;
    info.textContent = `${P[i].name} stellt auf`;
    body.innerHTML = `<div class="sv-place">
      <div class="sv-ph">${face(i)}<div><b>${esc(P[i].name)}: Flotte aufstellen</b><span>Schiff wählen, aufs Feld tippen. Schiffe dürfen sich nicht berühren. Tippen auf ein gesetztes Schiff nimmt es wieder hoch.</span></div></div>
      <div class="sv-pl">${gridHTML('own big', true)}
        <div class="sv-dock"><div class="sv-ships">${FLEET.map((f, k) => `<button class="btn sv-ship" type="button" data-k="${k}"><i style="--n:${f.len}"></i>${f.name}</button>`).join('')}</div>
        <div class="sv-btns"><button class="btn" type="button" data-b="rot">Drehen (R)</button><button class="btn" type="button" data-b="rnd">Zufällig</button><button class="btn" type="button" data-b="clr">Leeren</button><button class="btn def" type="button" data-b="ok" disabled>Fertig ►</button></div></div>
      </div></div>`;
    const grid = body.querySelector('.sv-grid');
    const refresh = () => {
      let pv = null;
      if (hover && sel >= 0) {
        const s = { x: hover[0], y: hover[1], len: FLEET[sel].len, d: dir };
        pv = new Set(shipCells(s).filter(([x, y]) => x < N && y < N).map(([x, y]) => y * N + x)); pv.bad = !canPlace(ships, s, sel);
      }
      paintGrid(grid, ships, null, true, pv);
      body.querySelectorAll('.sv-ship').forEach(b => { const k = +b.dataset.k; b.classList.toggle('sel', k === sel); b.classList.toggle('done', !!ships[k]); });
      body.querySelector('[data-b=ok]').disabled = ships.some(s => !s);
    };
    const nextFree = () => { const k = ships.findIndex(s => !s); sel = k; };
    grid.querySelectorAll('.sv-cell').forEach(c => {
      const x = +c.dataset.x, y = +c.dataset.y;
      c.addEventListener('pointerenter', () => { hover = [x, y]; refresh(); });
      c.addEventListener('focus', () => { hover = [x, y]; refresh(); });
      c.addEventListener('click', () => {
        const k = ships.findIndex(s => s && shipCells(s).some(([a, b]) => a === x && b === y));
        if (k >= 0 && (sel < 0 || !ships[sel] || sel !== k)) { ships[k] = null; sel = k; S.blip(); refresh(); return; }
        if (sel < 0) return;
        const s = { x, y, len: FLEET[sel].len, d: dir };
        if (!canPlace(ships, s, sel)) { sfx(140, 0.12, 'square', 0.04); return; }
        ships[sel] = s; sfx(S.noteFreq(4 + sel), 0.12, 'triangle', 0.06); nextFree(); refresh();
      });
    });
    grid.addEventListener('pointerleave', () => { hover = null; refresh(); });
    grid.addEventListener('contextmenu', e => { e.preventDefault(); dir ^= 1; refresh(); });
    body.querySelectorAll('.sv-ship').forEach(b => b.addEventListener('click', () => { sel = +b.dataset.k; if (ships[sel]) ships[sel] = null; S.blip(); refresh(); }));
    body.querySelector('[data-b=rot]').addEventListener('click', () => { dir ^= 1; S.blip(); refresh(); });
    body.querySelector('[data-b=rnd]').addEventListener('click', () => { ships = randomFleet(); sel = -1; S.confirmTone(); refresh(); });
    body.querySelector('[data-b=clr]').addEventListener('click', () => { ships = FLEET.map(() => null); sel = 0; refresh(); });
    body.querySelector('[data-b=ok]').addEventListener('click', () => { if (ships.every(Boolean)) { S.confirmTone(); placeKey = null; done(ships.map(s => ({ x: s.x, y: s.y, len: s.len, d: s.d }))); } });
    placeKey = e => { if (e.key === 'r' || e.key === 'R') { dir ^= 1; refresh(); } };
    refresh();
  }
  let placeKey = null;
  const onKey = e => { if (placeKey && !S.overOpen()) placeKey(e); };
  window.addEventListener('keydown', onKey);

  /* ---- Übergabe-Bildschirm für zwei Personen an einem Gerät ---- */
  function pass(i, text, then) {
    body.innerHTML = `<div class="sv-pass">${face(i)}<b>Gib das Gerät an ${esc(P[i].name)}</b><span>${text}</span><button class="btn def" type="button">Ich bin ${esc(P[i].name)} ►</button></div>`;
    info.textContent = 'Nicht hinschauen!';
    const b = body.querySelector('button'); b.focus(); b.addEventListener('click', () => { S.confirmTone(); then(); });
  }

  /* ---- Gefecht ---- */
  function battleView() {
    body.innerHTML = `<div class="sv-fight">
      <section class="sv-side sv-tgt"><h3 class="sv-h"></h3>${gridHTML('tgt big', true)}</section>
      <section class="sv-side sv-own"><h3 class="sv-h"></h3>${gridHTML('own small', false)}<div class="sv-log" aria-live="polite"></div></section></div>`;
    body.querySelectorAll('.sv-tgt .sv-cell').forEach(c => c.addEventListener('click', () => fire(+c.dataset.x, +c.dataset.y)));
    render();
  }
  function render() {
    if (!B || !body.querySelector('.sv-fight')) return;
    const me = viewer, op = 1 - me;
    const tg = body.querySelector('.sv-tgt .sv-grid'), ow = body.querySelector('.sv-own .sv-grid');
    paintGrid(tg, B.fleets[op], B.shots[op], B.winner >= 0);
    paintGrid(ow, B.fleets[me], B.shots[me], true);
    const myTurn = B.turn === me && B.winner < 0 && canFire();
    tg.classList.toggle('live', myTurn);
    const left = k => B.fleets[k].filter((_, j) => !B.sunk(k, j)).length;
    body.querySelector('.sv-tgt .sv-h').innerHTML = `${face(op)} Gewässer von ${esc(P[op].name)} <small>${left(op)} von ${FLEET.length} Schiffen übrig</small>`;
    body.querySelector('.sv-own .sv-h').innerHTML = `${face(me)} ${opt.mode === 'duo' ? `Flotte von ${esc(P[me].name)}` : 'Deine Flotte'} <small>${left(me)} übrig</small>`;
    info.textContent = B.winner >= 0 ? `${P[B.winner].name} gewinnt` : myTurn ? (opt.mode === 'duo' ? `${P[me].name} zielt` : 'Du bist dran') : `${P[B.turn].name} zielt …`;
    root.classList.toggle('my-turn', myTurn);
  }
  const canFire = () => opt.mode !== 'cpu' || viewer === 0;
  function log(t) { const l = body.querySelector('.sv-log'); if (!l) return; const d = el('div', '', t); l.prepend(d); while (l.children.length > 4) l.lastChild.remove(); }
  function fxShot(by, res, x, y) {
    const name = P[by].name, at = `${COLS[x]}${y + 1}`;
    if (!res.hit) { sfx(220, 0.25, 'sine', 0.06); sfx(160, 0.3, 'sine', 0.04, 0.05); log(`${esc(name)}: ${at} Wasser`); }
    else if (res.sunk) { [12, 9, 7, 4, 0].forEach((k, i) => sfx(S.noteFreq(k), 0.22, 'square', 0.05, i * 0.07)); log(`<b>${esc(name)}: ${at} versenkt! (${FLEET[res.ship].name})</b>`); }
    else { sfx(90, 0.18, 'sawtooth', 0.08); sfx(S.noteFreq(9), 0.12, 'square', 0.05, 0.05); log(`${esc(name)}: ${at} Treffer!`); }
    const grid = body.querySelector(by === viewer ? '.sv-tgt .sv-grid' : '.sv-own .sv-grid');
    const c = grid && grid.querySelector(`.sv-cell[data-x="${x}"][data-y="${y}"]`);
    if (c) { c.classList.remove('boom'); void c.offsetWidth; c.classList.add('boom'); setTimeout(() => c.classList.remove('boom'), 600); }
  }
  let busy = false, sentIdx = -1, goneSince = 0;
  function fire(x, y) {
    if (!B || B.winner >= 0 || busy || B.turn !== viewer || !canFire() || S.overOpen()) return;
    if (B.shots[1 - viewer][y * N + x]) return;
    if (online) { busy = true; sentIdx = applied; const o = S.ONLINE; o.net.set(`${o.path}/g/mv/${applied}`, [x, y, viewer]).catch(() => { busy = false; }); return; }
    const res = B.shoot(viewer, x, y); if (!res) return;
    afterShot(viewer, res, x, y);
  }
  function afterShot(by, res, x, y) {
    render(); fxShot(by, res, x, y);
    if (B.winner >= 0) { later(() => over(), 900); return; }
    if (opt.mode === 'cpu' && B.turn === 1) { busy = true; later(cpuTurn, 800); }
    else if (opt.mode === 'duo' && !res.hit) { busy = true; later(() => { busy = false; viewer = B.turn; pass(viewer, 'Daneben! Jetzt ist der andere dran.', battleView); }, 1100); }
  }
  function cpuTurn() {
    if (!B || B.winner >= 0) return;
    const c = cpuPick(B, 0), x = c % N, y = (c / N) | 0;
    const res = B.shoot(1, x, y); render(); fxShot(1, res, x, y);
    if (B.winner >= 0) { busy = false; later(() => over(), 900); return; }
    if (B.turn === 1) later(cpuTurn, res.sunk ? 1000 : 700); else busy = false;
    render();
  }
  function over() {
    if (ended) return; ended = true;
    const w = B.winner, l = 1 - w;
    const scoreOf = i => i === w ? 1000 + Math.max(0, 80 - B.count[i]) * 40 + B.fleets[i].reduce((a, s) => a + shipCells(s).filter(([x, y]) => B.shots[i][y * N + x] !== 2).length, 0) * 60 : B.hits[i] * 20;
    const rows = [w, l].map(i => ({ name: P[i].name, power: P[i].power, score: scoreOf(i), note: `${B.count[i]} Schüsse, ${B.hits[i]} Treffer`, col: S.PCOL[i] }));
    viewer = online ? opt.myIdx : viewer; render();
    let title, me = online ? opt.myIdx : opt.mode === 'cpu' ? 0 : w;
    if (opt.mode === 'cpu') title = w === 0 ? 'Flotte versenkt, du gewinnst!' : 'Der Computer hat gewonnen';
    else if (online) title = w === opt.myIdx ? 'Du gewinnst die Seeschlacht!' : `${P[w].name} gewinnt!`;
    else title = `${P[w].name} gewinnt!`;
    const entries = (opt.mode === 'cpu' && w !== 0) ? [] : [{ name: P[me].name.slice(0, 16), score: scoreOf(me), char: P[me].power, map: 'schiffe', game: 'schiffe', mode: opt.mode, shots: B.count[me], ...(me === w ? { win: 1 } : {}) }];
    if (online && S.ONLINE && S.ONLINE.host) { S.ONLINE.net.update(S.ONLINE.path + '/g', { done: 1 }); S.setRoomStatus('lobby'); }
    S.showOver({ title, sub: `${P[w].name} brauchte ${B.count[w]} Schüsse.`, rows, entries, boxes: 1 + (me === w && opt.mode !== 'duo' ? 1 : 0),
      again: online ? () => SK().restart() : () => GAMES.schiffe.startLocal(opt.mode), delay: 1000 });
  }

  /* ---- Ablauf ---- */
  if (opt.mode === 'cpu') {
    fleets[1] = randomFleet();
    placement(0, f => { fleets[0] = f; B = battle(fleets, 0); viewer = 0; battleView(); log('Du fängst an. Tippe auf das Gegnerfeld.'); });
  } else if (opt.mode === 'duo') {
    pass(0, 'Stell deine Flotte auf, ohne dass die andere Person zuschaut.', () => placement(0, f => {
      fleets[0] = f;
      pass(1, 'Jetzt stellst du deine Flotte auf.', () => placement(1, f2 => {
        fleets[1] = f2; B = battle(fleets, 0); viewer = 0;
        pass(0, `${P[0].name} fängt an.`, battleView);
      }));
    }));
  } else {
    placement(opt.myIdx, f => {
      const o = S.ONLINE; if (!o) return;
      o.net.set(`${o.path}/g/fleet/${opt.myIdx}`, f);
      body.innerHTML = `<div class="sv-pass">${face(1 - opt.myIdx)}<b>Warte auf ${esc(P[1 - opt.myIdx].name)} …</b><span>Sobald beide Flotten stehen, geht es los.</span></div>`;
      info.textContent = 'Flotte steht';
    });
  }
  function onRoom(g) {
    G = g;
    if (!online || ended || !g) return;
    const o = S.ONLINE;
    let gone = P.findIndex(p => o && !(o.players || {})[p.uid]);
    if (gone >= 0) {
      if (!goneSince) { goneSince = Date.now(); later(() => onRoom(G), 20500); }
      if (Date.now() - goneSince < 20000) { info.textContent = `${P[gone].name} ist weg, warte kurz …`; gone = -1; }
    } else if (goneSince) { goneSince = 0; render(); }
    const f = g.fleet || {};
    let quiet = false;
    if (!B && validFleet(f[0]) && validFleet(f[1])) {
      fleets[0] = f[0]; fleets[1] = f[1];
      B = battle(fleets, g.first || 0); applied = 0; quiet = true;
      placeKey = null; battleView();
    }
    if (B) {
      const mv = g.mv ? (Array.isArray(g.mv) ? g.mv : Object.keys(g.mv).sort((a, b) => a - b).map(k => g.mv[k])) : [];
      const was = applied;
      while (applied < mv.length) {
        const m = mv[applied]; applied++;
        if (!Array.isArray(m)) continue;
        const res = B.shoot(m[2] | 0, m[0] | 0, m[1] | 0);
        if (res && !quiet) { render(); fxShot(m[2] | 0, res, m[0] | 0, m[1] | 0); }
      }
      if (applied > sentIdx) busy = false;
      render();
      if (quiet) log(applied ? 'Weiter geht’s.' : B.turn === opt.myIdx ? 'Du fängst an. Tippe aufs Gegnerfeld.' : `${esc(P[B.turn].name)} fängt an.`);
      else if (applied > was && B.turn === opt.myIdx && B.winner < 0) sfx(S.noteFreq(7), 0.12, 'triangle', 0.05, 0.3);
      if (B.winner >= 0) later(over, 900);
    }
    if (gone >= 0 && !ended) {
      ended = true;
      const me = opt.myIdx;
      if (S.ONLINE && S.ONLINE.host) { S.ONLINE.net.update(S.ONLINE.path + '/g', { done: 1 }); S.setRoomStatus('lobby'); }
      S.showOver({ title: gone === me ? 'Verbindung weg' : `${P[gone].name} hat den Raum verlassen`, sub: 'Die Seeschlacht ist abgebrochen.', rows: [{ name: P[me].name, power: P[me].power, score: B ? B.hits[me] * 20 : 0, note: 'Gewinn durch Aufgabe' }], boxes: 1, again: () => SK().restart() });
    }
  }
  function stop() {
    stopped = true; timers.forEach(clearTimeout); window.removeEventListener('keydown', onKey);
    FINISHED.add(opt.run);
    if (CUR === inst) CUR = null;
  }
  const inst = { game: 'schiffe', run: opt.run, onRoom, stop };
  return inst;
}

GAMES.schiffe = {
  desc: 'Stell deine Flotte geheim auf und such die Schiffe der anderen Seite. Wer trifft, darf nochmal. Wer zuerst alle Schiffe versenkt, gewinnt. Gegen den Computer, zu zweit an einem Gerät oder online.',
  ways: [{ id: 'cpu', label: 'Gegen den Computer' }, { id: 'duo', label: 'Zu zweit an einem Gerät' }],
  startLocal(mode) {
    if (CUR) CUR.stop();
    const players = mode === 'duo' ? [localPlayer(0), localPlayer(1)] : [localPlayer(0), { name: 'Computer', power: SK().settings.players[0].power === 'uhu' ? 'drache' : 'uhu' }];
    CUR = schiffeGame({ mode: mode === 'duo' ? 'duo' : 'cpu', players });
  },
  hostStart(list) { if (list.length !== 2) return; roomStart('schiffe', list, { first: Math.random() < 0.5 ? 0 : 1 }); },
  onRoom(g) {
    roomFollow('schiffe', g, (g2, uid) => {
      const idx = g2.players.findIndex(p => p.uid === uid);
      return schiffeGame({ mode: 'online', players: g2.players, myIdx: idx, first: g2.first || 0, run: g2.run });
    });
  },
  boardNote: e => `${e.win ? 'Sieg' : 'Niederlage'} · ${e.shots || '?'} Schüsse · ${e.mode === 'online' ? 'Online' : e.mode === 'duo' ? 'Zu zweit' : 'Gegen Computer'}`,
};
})();
