// Original background music bed for the demo video, synthesized from scratch (no samples, no licences).
// Soft pads, bass, a plucked arpeggio and a light pulse in A minor (Am–F–C–G), ~110 BPM.
//
//   node scripts/make-music.mjs [seconds] [out.wav]
import { writeFileSync } from "node:fs";

const SECONDS = Number(process.argv[2] ?? 105);
const OUT = process.argv[3] ?? "storyboard/video/music.wav";
const SR = 44100;
const N = Math.floor(SECONDS * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

const BPM = 110;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// Two bars per chord: Am, F, C, G
const CHORDS = [
  [57, 60, 64], // A C E
  [53, 57, 60], // F A C
  [48, 52, 55], // C E G
  [55, 59, 62], // G B D
];
const chordAt = (t) => CHORDS[Math.floor(t / (BAR * 2)) % CHORDS.length];

// Deterministic noise
let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function add(i, l, r) {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
}

// Pads: soft additive tones per chord, slow swell each chord change.
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const segT = t % (BAR * 2);
  const env = Math.min(1, segT / 0.9) * (1 - 0.25 * Math.min(1, Math.max(0, (segT - BAR * 1.7) / (BAR * 0.3))));
  let s = 0;
  for (const m of chordAt(t)) {
    const f = midi(m + 12);
    for (const [h, a] of [[1, 1], [2, 0.3], [3, 0.12]]) {
      s += a * (Math.sin(2 * Math.PI * f * h * t) + Math.sin(2 * Math.PI * f * h * 1.004 * t + 1.3)) * 0.5;
    }
  }
  const v = s * env * 0.022;
  add(i, v, v);
}

// Bass: root on each beat, soft.
for (let b = 0; b * BEAT < SECONDS; b++) {
  const t0 = b * BEAT;
  const root = chordAt(t0)[0] - 12;
  const f = midi(root);
  const len = Math.floor(BEAT * 0.95 * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 3.2);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * env * 0.11;
    add(Math.floor(t0 * SR) + k, v, v);
  }
}

// Pluck arpeggio: eighth notes over chord tones, enters after 2 bars, alternates left/right.
const PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];
for (let e = Math.round((BAR * 2) / (BEAT / 2)); e * (BEAT / 2) < SECONDS; e++) {
  const t0 = e * (BEAT / 2);
  const ch = chordAt(t0);
  const m = ch[PATTERN[e % PATTERN.length]] + 24;
  const f = midi(m);
  const len = Math.floor(0.6 * SR);
  const pan = e % 2 ? 0.7 : 1.0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 7);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 12)) * env * 0.035;
    add(Math.floor(t0 * SR) + k, v * pan, v * (1.7 - pan));
  }
}

// Light pulse: soft kick on beats 1 and 3, hat on off-beats, from bar 4.
for (let b = 8; b * BEAT < SECONDS; b++) {
  const t0 = b * BEAT;
  const start = Math.floor(t0 * SR);
  if (b % 2 === 0) {
    for (let k = 0; k < 0.25 * SR; k++) {
      const t = k / SR;
      const f = 50 + 70 * Math.exp(-t * 30);
      const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) * 0.13;
      add(start + k, v, v);
    }
  }
  const hs = Math.floor((t0 + BEAT / 2) * SR);
  let prev = 0;
  for (let k = 0; k < 0.06 * SR; k++) {
    const n = rand();
    const hp = n - prev; // crude high-pass
    prev = n;
    const v = hp * Math.exp((-k / SR) * 70) * 0.012;
    add(hs + k, v * 0.8, v);
  }
}

// Fade in/out and normalise.
const fadeIn = 1.5 * SR;
const fadeOut = 3.5 * SR;
let peak = 0;
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut);
  L[i] *= g;
  R[i] *= g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.8 / peak;

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${SECONDS}s)`);
