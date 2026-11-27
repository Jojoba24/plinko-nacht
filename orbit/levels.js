// Eigene Level-Layouts für Orbit Zirkus. Spielfeld: 800 x 600.
import { TAU, mulberry32, shuffle } from './util.js';

export const W = 800, H = 600;

const C = (x, y) => ({ type: 'circle', x, y, r: 9 });
const B = (x, y, ang, len = 32) => ({ type: 'brick', x, y, ang, hh: 6, hl: Math.max(4, len / 2 - 6) });

function ring(o, cx, cy, rx, ry, n, a0 = 0, a1 = TAU) {
  const full = Math.abs(a1 - a0 - TAU) < 1e-6;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (full ? i / n : i / (n - 1));
    o.push(C(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
}
function bricksEllipse(o, cx, cy, rx, ry, n, a0 = 0, a1 = TAU) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * ((i + 0.5) / n);
    const tx = -Math.sin(a) * rx, ty = Math.cos(a) * ry;
    const seg = Math.hypot(tx, ty) * Math.abs(a1 - a0) / n;
    o.push(B(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.atan2(ty, tx), Math.min(46, seg - 6)));
  }
}
function line(o, x1, y1, x2, y2, n) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    o.push(C(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
  }
}
function bricksLine(o, x1, y1, x2, y2, n) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const seg = Math.hypot(x2 - x1, y2 - y1) / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    o.push(B(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, ang, seg - 5));
  }
}
function star5(o, cx, cy, R, r, perEdge) {
  const v = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
    v.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  for (let i = 0; i < 10; i++) {
    const [x1, y1] = v[i], [x2, y2] = v[(i + 1) % 10];
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      o.push(C(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
    }
  }
}

export const LEVELS = [
  {
    name: 'Eröffnungsparade', sub: 'Die Manege ist bereit',
    build(o) {
      for (let r = 0; r < 7; r++) {
        const y = 150 + r * 58, off = (r % 2) * 38;
        for (let x = 70 + off; x <= 735; x += 76) o.push(C(x, y));
      }
    },
  },
  {
    name: 'Saturns Ringe', sub: 'Ein Planet tanzt im Kreis',
    build(o) {
      o.push(C(400, 330));
      ring(o, 400, 330, 30, 30, 6);
      ring(o, 400, 330, 58, 58, 11);
      bricksEllipse(o, 400, 330, 225, 100, 18);
      for (const [x, y, r, n] of [[120, 175, 30, 7], [680, 480, 30, 7], [680, 175, 22, 6], [120, 480, 22, 6]]) {
        o.push(C(x, y)); ring(o, x, y, r, r, n);
      }
      line(o, 250, 150, 550, 150, 7);
      line(o, 250, 520, 550, 520, 7);
    },
  },
  {
    name: 'Spiralnebel', sub: 'Zwei Arme, ein Wirbel',
    build(o) {
      o.push(C(400, 340));
      ring(o, 400, 340, 30, 30, 6);
      for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 28; i++) {
          const t = i / 27, a = arm * Math.PI + t * Math.PI * 2.5, r = 62 + t * 260;
          const x = 400 + Math.cos(a) * r, y = 340 + Math.sin(a) * r * 0.74;
          o.push(i % 3 === 2 ? B(x, y, a + Math.PI / 2, 30) : C(x, y));
        }
      }
    },
  },
  {
    name: 'Das große Zelt', sub: 'Hereinspaziert!',
    build(o) {
      bricksLine(o, 400, 135, 150, 300, 7);
      bricksLine(o, 400, 135, 650, 300, 7);
      for (let x = 180; x <= 620; x += 55) {
        const roofY = 135 + (Math.abs(x - 400) / 250) * 165;
        for (let y = roofY + 40; y <= 525; y += 44) {
          if (Math.abs(x - 400) < 45 && y > 400) continue;
          o.push(C(x, y));
        }
      }
      line(o, 60, 170, 60, 520, 8);
      line(o, 740, 170, 740, 520, 8);
    },
  },
  {
    name: 'Trapez-Akt', sub: 'Hoch oben ohne Netz – fast',
    build(o) {
      bricksEllipse(o, 250, 80, 175, 175, 7, Math.PI * 0.22, Math.PI * 0.78);
      bricksEllipse(o, 550, 80, 175, 175, 7, Math.PI * 0.22, Math.PI * 0.78);
      line(o, 110, 150, 175, 320, 5);
      line(o, 690, 150, 625, 320, 5);
      o.push(C(400, 330)); ring(o, 400, 330, 42, 42, 9);
      o.push(C(260, 400)); ring(o, 260, 400, 25, 25, 6);
      o.push(C(540, 400)); ring(o, 540, 400, 25, 25, 6);
      for (let i = 0; i < 16; i++) o.push(C(70 + i * 44, 490 + (i % 2) * 32));
    },
  },
  {
    name: 'Kometenschweif', sub: 'Wellen aus Sternenstaub',
    build(o) {
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 15; i++) {
          const ph = i * 0.55 + k * 1.3, x = 70 + i * 47, y = 168 + k * 100 + Math.sin(ph) * 32;
          o.push((i + k) % 4 === 0 ? B(x, y, Math.atan((Math.cos(ph) * 32 * 0.55) / 47), 30) : C(x, y));
        }
      }
    },
  },
  {
    name: 'Raketenstart', sub: 'Drei, zwei, eins …',
    build(o, rng) {
      bricksLine(o, 350, 225, 350, 445, 5);
      bricksLine(o, 450, 225, 450, 445, 5);
      bricksLine(o, 350, 212, 400, 135, 2);
      bricksLine(o, 450, 212, 400, 135, 2);
      ring(o, 400, 285, 22, 22, 6);
      bricksLine(o, 345, 410, 295, 480, 2);
      bricksLine(o, 455, 410, 505, 480, 2);
      line(o, 400, 335, 400, 425, 3);
      line(o, 372, 470, 400, 540, 3);
      line(o, 428, 470, 400, 540, 3);
      for (let k = 0; k < 90; k++) {
        const x = 40 + rng() * 720, y = 130 + rng() * 420;
        if (x > 265 && x < 535) continue;
        o.push(C(x, y));
      }
    },
  },
  {
    name: 'Sternbilder', sub: 'Folge den Linien',
    build(o) {
      star5(o, 215, 255, 100, 42, 2);
      star5(o, 585, 255, 100, 42, 2);
      star5(o, 400, 455, 82, 34, 2);
      for (const [x, y] of [[215, 255], [585, 255], [400, 455], [400, 160], [90, 470], [710, 470]]) o.push(C(x, y));
    },
  },
  {
    name: 'Ereignishorizont', sub: 'Nicht zu nah ans Loch!',
    build(o) {
      o.push(C(400, 340));
      bricksEllipse(o, 400, 340, 55, 55, 8);
      ring(o, 400, 340, 105, 105, 17, -Math.PI / 2 + 0.55, -Math.PI / 2 + TAU - 0.55);
      ring(o, 400, 340, 155, 155, 24, Math.PI / 2 + 0.45, Math.PI / 2 + TAU - 0.45);
      ring(o, 400, 340, 205, 205, 30, 0.35, TAU - 0.35);
      for (const [x, y] of [[70, 160], [730, 160], [70, 520], [730, 520]]) { o.push(C(x, y)); ring(o, x, y, 24, 24, 6); }
    },
  },
  {
    name: 'Große Gala', sub: 'Das Finale der Saison',
    build(o) {
      for (let i = 0; i < 12; i++) {
        const x = 92 + i * 56, ph = i * 0.8;
        o.push(B(x, 175 + Math.sin(ph) * 22, Math.atan((Math.cos(ph) * 22 * 0.8) / 56), 40));
      }
      for (let r = 0; r < 3; r++) {
        const y = 250 + r * 58, off = (r % 2) * 32;
        for (let x = 80 + off; x <= 725; x += 64) o.push(C(x, y));
      }
      for (const x of [200, 600]) { o.push(C(x, 480)); ring(o, x, 480, 40, 40, 9); }
      bricksLine(o, 320, 475, 480, 475, 4);
      line(o, 340, 530, 460, 530, 4);
    },
  },
];

export function buildLevel(idx, seed) {
  const L = LEVELS[idx];
  const raw = [];
  L.build(raw, mulberry32(1000 + idx * 77));
  const pegs = [];
  for (const p of raw) {
    if (p.x < 22 || p.x > W - 22 || p.y < 110 || p.y > 548) continue;
    const near = pegs.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (p.type === 'brick' || q.type === 'brick' ? 27 : 21));
    if (!near) pegs.push(p);
  }
  pegs.forEach((p, i) => {
    Object.assign(p, { id: i, kind: 'norm', lit: false, gone: false, hits: 0, litAt: 0 });
    if (p.type === 'brick') {
      const c = Math.cos(p.ang), s = Math.sin(p.ang);
      p.ax = p.x - c * p.hl; p.ay = p.y - s * p.hl;
      p.dx = 2 * c * p.hl; p.dy = 2 * s * p.hl;
      p.len2 = p.dx * p.dx + p.dy * p.dy;
    }
  });
  const rng = mulberry32(seed);
  const order = shuffle(pegs.map((_, i) => i), rng);
  const nStar = Math.min(20, Math.round(pegs.length * 0.3));
  order.slice(0, nStar).forEach((i) => (pegs[i].kind = 'star'));
  order.slice(nStar, nStar + 2).forEach((i) => (pegs[i].kind = 'power'));
  return { name: L.name, sub: L.sub, pegs };
}
