// Vektor-Grafik für Orbit Zirkus: eigene Figuren, Hintergrund, Embleme.
import { TAU, mulberry32 } from './util.js';

export const CHARACTERS = [
  { id: 'kometa', name: 'Kometa', title: 'Kometen-Akrobatin', power: 'Leitstern', color: '#ffb340',
    desc: 'Zeigt 3 Schüsse lang die ganze Flugbahn samt Abprallern.' },
  { id: 'blorp', name: 'Blorp', title: 'Glibber-Jongleur', power: 'Jonglage', color: '#5fe07a',
    desc: 'Wirft sofort eine zweite Kugel in die Manege.' },
  { id: 'magna', name: 'Magna', title: 'Robo-Direktorin', power: 'Schockwelle', color: '#5cc8ff',
    desc: 'Der Power-Peg explodiert und trifft alles im Umkreis.' },
  { id: 'zoltan', name: 'Zoltan', title: 'Feuerschlucker', power: 'Feuerkugel', color: '#ff5f7a',
    desc: 'Die Kugel brennt 3 Sekunden lang durch alle Pegs.' },
];
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

export function drawStar(c, x, y, R, r, fill, points = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points, rad = i % 2 ? r : R;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

export function drawBolt(c, x, y, s, fill) {
  c.beginPath();
  c.moveTo(x + 0.15 * s, y - 0.6 * s);
  c.lineTo(x - 0.35 * s, y + 0.08 * s);
  c.lineTo(x - 0.02 * s, y + 0.08 * s);
  c.lineTo(x - 0.15 * s, y + 0.6 * s);
  c.lineTo(x + 0.35 * s, y - 0.1 * s);
  c.lineTo(x + 0.02 * s, y - 0.1 * s);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function eye(c, x, y, rx, ry, lookX, lookY, blink) {
  c.fillStyle = '#fff';
  c.beginPath(); c.ellipse(x, y, rx, ry * blink, 0, 0, TAU); c.fill();
  if (blink > 0.3) {
    c.fillStyle = '#1b0b2e';
    c.beginPath(); c.arc(x + lookX, y + lookY, Math.min(rx, ry) * 0.55, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(x + lookX - 1.5, y + lookY - 1.8, Math.min(rx, ry) * 0.2, 0, TAU); c.fill();
  }
}

// Zeichnet eine Figur zentriert bei (cx, cy). s = Radius der Portraitfläche.
export function drawPortrait(c, id, cx, cy, s, t = 0) {
  c.save();
  c.translate(cx, cy);
  c.scale(s / 50, s / 50);
  const blink = (t * 0.7) % 4 < 0.12 ? 0.15 : 1;
  const look = Math.sin(t * 1.3) * 2;
  if (id === 'kometa') {
    const g = c.createLinearGradient(0, 0, -60, 20);
    g.addColorStop(0, 'rgba(255,200,80,0.95)');
    g.addColorStop(1, 'rgba(255,90,40,0)');
    c.fillStyle = g;
    const w = Math.sin(t * 4) * 4;
    c.beginPath();
    c.moveTo(-4, -27);
    c.quadraticCurveTo(-38, -26 + w, -62, 6 - w);
    c.quadraticCurveTo(-36, 4, -56, 28 + w);
    c.quadraticCurveTo(-30, 22, -2, 28);
    c.closePath(); c.fill();
    const hg = c.createRadialGradient(-8, -10, 4, 0, 0, 30);
    hg.addColorStop(0, '#fff6c2'); hg.addColorStop(0.5, '#ffc24a'); hg.addColorStop(1, '#ff7a1a');
    c.fillStyle = hg;
    c.beginPath(); c.arc(4, 0, 29, 0, TAU); c.fill();
    c.strokeStyle = '#d61f4a'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.arc(4, 0, 24, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    drawStar(c, 4, -24, 7, 3, '#fff2a8');
    eye(c, -6, 0, 6.5, 8.5, look, 1, blink);
    eye(c, 15, 0, 6.5, 8.5, look, 1, blink);
    c.fillStyle = 'rgba(255,90,120,.45)';
    c.beginPath(); c.arc(-12, 12, 5, 0, TAU); c.arc(22, 12, 5, 0, TAU); c.fill();
    c.strokeStyle = '#7a2a00'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(5, 11, 8, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  } else if (id === 'blorp') {
    const balls = ['#ff5f7a', '#ffd36b', '#5cc8ff'];
    for (let k = 0; k < 3; k++) {
      const ph = t * 2.4 + (k * TAU) / 3;
      c.fillStyle = balls[k];
      c.beginPath(); c.arc(Math.cos(ph) * 26, -36 - Math.abs(Math.sin(ph)) * 14, 5.5, 0, TAU); c.fill();
    }
    const g = c.createRadialGradient(-10, -4, 4, 0, 8, 36);
    g.addColorStop(0, '#d4ffc4'); g.addColorStop(0.55, '#5fe07a'); g.addColorStop(1, '#1f8f45');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU, r = 30 + Math.sin(a * 5 + t * 3) * 2.2 + (Math.sin(a) > 0 ? 3 : 0);
      c.lineTo(Math.cos(a) * r * 1.08, 8 + Math.sin(a) * r * 0.92);
    }
    c.fill();
    c.strokeStyle = '#2c9f50'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-28, 2); c.quadraticCurveTo(-38, -14, -30, -28); c.stroke();
    c.beginPath(); c.moveTo(28, 2); c.quadraticCurveTo(38, -14, 30, -28); c.stroke();
    eye(c, -13, 2, 6, 6, look, 0, blink);
    eye(c, 0, -8, 7, 7, look, 0, blink);
    eye(c, 13, 2, 6, 6, look, 0, blink);
    c.fillStyle = '#0f4a22';
    c.beginPath(); c.ellipse(0, 18, 9, 5 + Math.sin(t * 3) * 1.5, 0, 0, Math.PI); c.fill();
  } else if (id === 'magna') {
    const g = c.createLinearGradient(0, -20, 0, 30);
    g.addColorStop(0, '#e8f2ff'); g.addColorStop(1, '#6b86a8');
    c.fillStyle = g;
    c.beginPath(); c.roundRect ? c.roundRect(-27, -16, 54, 46, 14) : c.rect(-27, -16, 54, 46); c.fill();
    c.fillStyle = '#b8c6da';
    c.beginPath(); c.arc(-29, 8, 6, 0, TAU); c.arc(29, 8, 6, 0, TAU); c.fill();
    c.fillStyle = '#16213a';
    c.beginPath(); c.roundRect ? c.roundRect(-20, -6, 40, 15, 7) : c.rect(-20, -6, 40, 15); c.fill();
    const ex = Math.sin(t * 1.6) * 11;
    c.shadowColor = '#5cf0ff'; c.shadowBlur = 10;
    c.fillStyle = '#7ff6ff';
    c.beginPath(); c.ellipse(ex, 1.5, 7, 4.5 * blink, 0, 0, TAU); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = '#4a5f80'; c.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 5, 16); c.lineTo(i * 5, 24); c.stroke(); }
    c.fillStyle = '#c8143c';
    c.beginPath(); c.ellipse(0, -17, 25, 6, 0, 0, TAU); c.fill();
    c.fillRect(-15, -46, 30, 29);
    c.fillStyle = '#ffd36b'; c.fillRect(-15, -26, 30, 5);
    c.fillStyle = '#e8355e';
    c.beginPath(); c.ellipse(0, -46, 15, 4, 0, 0, TAU); c.fill();
    drawStar(c, 0, -36, 5, 2.2, '#ffd36b');
  } else {
    const fl = Math.sin(t * 14) * 3;
    const fg = c.createLinearGradient(14, 18, 58, 14);
    fg.addColorStop(0, '#fff3a0'); fg.addColorStop(0.4, '#ffa030'); fg.addColorStop(1, 'rgba(255,60,40,0)');
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(10, 18);
    c.quadraticCurveTo(34, 2 + fl, 60, 8 - fl);
    c.quadraticCurveTo(44, 16, 62, 26 + fl);
    c.quadraticCurveTo(34, 30, 10, 22);
    c.fill();
    c.strokeStyle = '#a45ad8'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-9, -26); c.quadraticCurveTo(-14, -38, -22, -44); c.stroke();
    c.beginPath(); c.moveTo(9, -26); c.quadraticCurveTo(14, -38, 22, -44); c.stroke();
    c.fillStyle = '#ff5f7a';
    c.beginPath(); c.arc(-22, -44, 4.5, 0, TAU); c.arc(22, -44, 4.5, 0, TAU); c.fill();
    const g = c.createRadialGradient(-8, -10, 4, 0, 0, 34);
    g.addColorStop(0, '#f1c8ff'); g.addColorStop(0.55, '#b15de8'); g.addColorStop(1, '#5d1f8f');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, -2, 26, 30, 0, 0, TAU); c.fill();
    c.fillStyle = '#1b0b2e';
    c.beginPath(); c.ellipse(-10, -6, 7, 10 * blink, -0.35, 0, TAU); c.ellipse(10, -6, 7, 10 * blink, 0.35, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(-12 + look * 0.5, -10, 2.2, 0, TAU); c.arc(8 + look * 0.5, -10, 2.2, 0, TAU); c.fill();
    c.strokeStyle = '#3a1200'; c.lineWidth = 3.5; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, 11); c.quadraticCurveTo(-10, 8, -15, 14); c.quadraticCurveTo(-19, 18, -15, 19);
    c.moveTo(0, 11); c.quadraticCurveTo(10, 8, 15, 14); c.quadraticCurveTo(19, 18, 15, 19);
    c.stroke();
  }
  c.restore();
}

// Statischer Hintergrund: Weltall + Zirkusvorhänge. Wird einmal vorgerendert.
export function drawBackground(c, CW, CH, FX, FY, W, H) {
  const g = c.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#120830'); g.addColorStop(0.55, '#231052'); g.addColorStop(1, '#3d0f4c');
  c.fillStyle = g; c.fillRect(0, 0, CW, CH);
  for (const [x, y, r, col] of [
    [FX + 220, FY + 230, 280, 'rgba(255,80,180,0.16)'],
    [FX + 640, FY + 360, 320, 'rgba(60,200,255,0.12)'],
    [FX + 460, FY + 580, 240, 'rgba(255,170,60,0.12)'],
    [FX + 120, FY + 520, 200, 'rgba(120,90,255,0.15)'],
  ]) {
    const n = c.createRadialGradient(x, y, 0, x, y, r);
    n.addColorStop(0, col); n.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = n; c.fillRect(0, 0, CW, CH);
  }
  const rng = mulberry32(42);
  for (let i = 0; i < 320; i++) {
    const x = rng() * CW, y = rng() * CH, s = rng() * 1.4 + 0.3;
    c.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.6})`;
    c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = FX + rng() * W, y = FY + rng() * H;
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke();
  }
  // Ringplanet & Mond (dezent, hinter den Pegs)
  const px = FX + 690, py = FY + 470;
  c.save();
  c.globalAlpha = 0.55;
  c.strokeStyle = 'rgba(255,200,140,0.55)'; c.lineWidth = 7;
  c.beginPath(); c.ellipse(px, py, 120, 26, -0.35, Math.PI, TAU); c.stroke();
  const pg = c.createRadialGradient(px - 25, py - 25, 10, px, py, 72);
  pg.addColorStop(0, '#ffb0d8'); pg.addColorStop(1, '#6a2a8f');
  c.fillStyle = pg; c.beginPath(); c.arc(px, py, 70, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(px, py, 120, 26, -0.35, 0, Math.PI); c.stroke();
  const mg = c.createRadialGradient(FX + 120, FY + 160, 2, FX + 128, FY + 168, 26);
  mg.addColorStop(0, '#e6f0ff'); mg.addColorStop(1, '#5a6aa0');
  c.fillStyle = mg; c.beginPath(); c.arc(FX + 128, FY + 168, 24, 0, TAU); c.fill();
  c.restore();

  // Seitenvorhänge
  const curtain = (x0, x1) => {
    const sw = 20;
    for (let x = x0, i = 0; x < x1; x += sw, i++) {
      c.fillStyle = i % 2 ? '#f0d4a0' : '#b8123c';
      c.fillRect(x, 0, sw, CH);
    }
    const sh = c.createLinearGradient(x0, 0, x1, 0);
    for (let k = 0; k <= 8; k++) sh.addColorStop(k / 8, `rgba(0,0,0,${k % 2 ? 0.05 : 0.32})`);
    c.fillStyle = sh; c.fillRect(x0, 0, x1 - x0, CH);
  };
  curtain(0, FX);
  curtain(FX + W, CW);
  c.fillStyle = '#ffcf5a';
  c.fillRect(FX - 4, FY, 4, CH - FY);
  c.fillRect(FX + W, FY, 4, CH - FY);
  // Oberer Volant
  const vg = c.createLinearGradient(0, 0, 0, FY);
  vg.addColorStop(0, '#7a0a28'); vg.addColorStop(1, '#c8143c');
  c.fillStyle = vg; c.fillRect(0, 0, CW, FY);
  c.fillStyle = '#c8143c';
  for (let x = 0; x < CW; x += 40) {
    c.beginPath(); c.arc(x + 20, FY, 20, 0, Math.PI); c.fill();
  }
  c.strokeStyle = '#ffcf5a'; c.lineWidth = 3;
  for (let x = 0; x < CW; x += 40) {
    c.beginPath(); c.arc(x + 20, FY, 20, 0, Math.PI); c.stroke();
  }
}
