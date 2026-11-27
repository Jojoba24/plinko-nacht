// Alle Klänge werden live mit Web Audio erzeugt – keine Audiodateien.
let ac = null, master, sfx, mus;
let musicOn = localStorage.getItem('oz_music') !== 'off';
let nextTime = 0, step = 0, timer = null;

export function init() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = mutedAll ? 0 : 0.7; master.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    mus = ac.createGain(); mus.gain.value = musicOn ? 0.15 : 0; mus.connect(master);
    nextTime = ac.currentTime + 0.1;
    timer = setInterval(schedule, 50);
  }
  if (ac.state === 'suspended') ac.resume();
}

let mutedAll = false;
export function setMuted(m) {
  if (m === mutedAll) return;
  mutedAll = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.05);
}
export function suspend() { if (ac && ac.state === 'running') ac.suspend(); }

export function toggleMusic() {
  musicOn = !musicOn;
  localStorage.setItem('oz_music', musicOn ? 'on' : 'off');
  if (mus) mus.gain.setTargetAtTime(musicOn ? 0.15 : 0, ac.currentTime, 0.1);
  return musicOn;
}
export const isMusicOn = () => musicOn;

const nf = (n) => 523.25 * Math.pow(2, n / 12);

function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0, dest = sfx) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.03);
}

let noiseBuf = null;
function noise(dur, vol, freq, when = 0, q = 1) {
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfx);
  s.start(t); s.stop(t + dur + 0.02);
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36, 38, 40];
export function peg(n, kind) {
  const f = nf(SCALE[Math.min(n - 1, SCALE.length - 1)] - 7);
  tone(f, 0.22, 'triangle', 0.22);
  tone(f * 2, 0.1, 'sine', 0.07);
  if (kind === 'star') tone(f * 3, 0.12, 'sine', 0.06, 0.02);
  if (kind === 'bonus') tone(f * 1.5, 0.3, 'sine', 0.1, 0.03);
}
export const tick = () => tone(1400, 0.03, 'sine', 0.03);
export function shoot() { noise(0.3, 0.35, 700, 0, 0.7); tone(160, 0.25, 'sawtooth', 0.08, 0, 0.45); }
export function pop(i) { tone(700 + Math.min(i, 30) * 25, 0.06, 'sine', 0.07); }
export function lost() { tone(330, 0.5, 'triangle', 0.12, 0, 0.5); }
export function catchBall() { [0, 4, 7, 12, 16].forEach((n, i) => tone(nf(n), 0.18, 'square', 0.06, i * 0.06)); }
export function power() {
  for (let i = 0; i < 8; i++) tone(nf(12 + i * 3), 0.12, 'sine', 0.08, i * 0.03);
  noise(0.4, 0.15, 3000, 0, 2);
}
export function boom() { noise(0.6, 0.4, 200, 0, 0.6); tone(90, 0.5, 'sine', 0.3, 0, 0.4); }
export function firework() { noise(0.5, 0.18, 1800 + Math.random() * 1500, 0, 1.5); }
export function bonus() { [7, 12, 16, 19].forEach((n, i) => tone(nf(n), 0.25, 'triangle', 0.12, i * 0.08)); }
export function fanfare() {
  const seq = [[0, 0.15], [4, 0.15], [7, 0.15], [12, 0.45], [7, 0.15], [12, 0.6], [16, 0.9]];
  let t = 0;
  for (const [n, d] of seq) {
    tone(nf(n), d + 0.1, 'square', 0.08, t);
    tone(nf(n - 12), d + 0.1, 'triangle', 0.15, t);
    t += d;
  }
  noise(1.2, 0.2, 5000, 0.2, 0.5);
}
export function turn() { tone(nf(7), 0.12, 'triangle', 0.1); tone(nf(12), 0.2, 'triangle', 0.1, 0.1); }

// Kleiner eigener Zirkuswalzer (3/4-Takt).
const BEAT = 0.3;
const CHORDS = { C: [-24, [-12, -8, -5]], G: [-29, [-13, -10, -7]], F: [-31, [-12, -7, -3]] };
const SONG = [
  ['C', [4, 7, 12]], ['C', [11, 12, null]], ['G', [7, 11, 14]], ['G', [17, 14, null]],
  ['G', [11, 14, 17]], ['G', [19, 17, 14]], ['C', [12, 16, 19]], ['C', [16, 12, null]],
  ['F', [9, 12, 17]], ['F', [21, 17, 12]], ['C', [16, 19, 24]], ['C', [19, 16, 12]],
  ['G', [14, 17, 11]], ['G', [7, 11, 14]], ['C', [12, 7, 4]], ['C', [0, null, null]],
];
function schedule() {
  if (!ac) return;
  while (nextTime < ac.currentTime + 0.25) {
    const bar = SONG[Math.floor(step / 3) % SONG.length], beat = step % 3;
    const [root, chord] = CHORDS[bar[0]];
    const when = nextTime - ac.currentTime;
    if (when > -0.05) {
      if (beat === 0) tone(nf(root), 0.28, 'triangle', 0.5, when, 0, mus);
      else chord.forEach((n) => tone(nf(n), 0.12, 'triangle', 0.13, when, 0, mus));
      const m = bar[1][beat];
      if (m !== null) {
        tone(nf(m), BEAT * 0.9, 'square', 0.05, when, 0, mus);
        tone(nf(m + 12), BEAT * 0.7, 'sine', 0.06, when, 0, mus);
      }
    }
    nextTime += BEAT;
    step++;
  }
}
