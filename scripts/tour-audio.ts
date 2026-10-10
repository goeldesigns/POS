/**
 * Soundtrack for the product tour video.
 *
 *  - An original music bed synthesised from code (warm pads, electric-piano
 *    arpeggio, bass, soft drums and a bell melody in D major, 92 BPM), so there
 *    is nothing to license.
 *  - Quiet UI sounds placed on the recorded clicks, keystrokes and chapter
 *    changes.
 *
 * Deterministic: the same events always produce the same audio.
 */
import { writeFileSync } from "node:fs";

export type TourSoundEvent = { t: number; type: "click" | "key" | "chapter" | "card-in" | "card-out" };

const SR = 48_000;
const BPM = 92;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const TAU = Math.PI * 2;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Bus {
  readonly L: Float32Array;
  readonly R: Float32Array;
  constructor(readonly length: number) {
    this.L = new Float32Array(length);
    this.R = new Float32Array(length);
  }
  add(i: number, l: number, r: number) {
    if (i < 0 || i >= this.length) return;
    this.L[i]! += l;
    this.R[i]! += r;
  }
  /** Equal-power pan, −1 (left) … 1 (right). */
  addPan(i: number, s: number, pan: number) {
    const a = ((pan + 1) * Math.PI) / 4;
    this.add(i, s * Math.cos(a), s * Math.sin(a));
  }
}

/** Topology-preserving state-variable filter (Zavalishin). */
class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  low = 0;
  band = 0;
  high = 0;
  constructor(cutoff: number, q = 0.707) {
    this.set(cutoff, q);
  }
  set(cutoff: number, q = 0.707) {
    const g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(x: number) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - this.k * v1 - v2;
    return v2;
  }
}

function polyBlep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

// ─── Instruments ────────────────────────────────────────────────────────────

/** Warm pad: four detuned band-limited saws through a low-pass, slow attack and release. */
function pad(bus: Bus, t0: number, dur: number, midi: number, amp: number, cutoff: number, rnd: () => number) {
  const f = hz(midi);
  const attack = 0.9;
  const release = 1.8;
  const start = Math.round(t0 * SR);
  const len = Math.round((dur + release) * SR);
  const detune = [-0.11, -0.035, 0.04, 0.12];
  const inc = detune.map((d) => (f * Math.pow(2, d / 12)) / SR);
  const ph = detune.map(() => rnd());
  const fl = new Svf(cutoff, 0.6);
  const fr = new Svf(cutoff, 0.6);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let env = t < attack ? Math.sin(((t / attack) * Math.PI) / 2) ** 2 : 1;
    if (t > dur) env *= Math.exp(-(t - dur) * 3.2);
    let l = 0;
    let r = 0;
    for (let o = 0; o < 4; o++) {
      const p = ph[o]!;
      const s = 2 * p - 1 - polyBlep(p, inc[o]!);
      if (o < 2) l += s;
      else r += s;
      ph[o] = p + inc[o]! >= 1 ? p + inc[o]! - 1 : p + inc[o]!;
    }
    bus.add(start + i, fl.run(l) * env * amp, fr.run(r) * env * amp);
  }
}

/** Electric piano: two-operator FM with a short bell-like tine. */
function keys(bus: Bus, t0: number, midi: number, vel: number, pan: number) {
  const f = hz(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round(1.8 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = (1 - Math.exp(-t * 500)) * Math.exp(-t * 2.6);
    const index = 1.3 * vel * Math.exp(-t * 6) + 0.12;
    const s = Math.sin(TAU * f * t + index * Math.sin(TAU * f * t));
    const tine = Math.sin(TAU * f * 4 * t) * Math.exp(-t * 28) * 0.12 * vel;
    bus.addPan(start + i, (s + tine) * env * vel * 0.32, pan);
  }
}

/** Round bass with a little saturation so it's audible on laptop speakers. */
function bass(bus: Bus, t0: number, dur: number, midi: number, vel: number) {
  const f = hz(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round((dur + 0.15) * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let env = Math.min(1, t / 0.008) * (0.72 + 0.28 * Math.exp(-t * 5));
    if (t > dur) env *= Math.exp(-(t - dur) * 30);
    const p = TAU * f * t;
    const s = Math.tanh(1.4 * (Math.sin(p) + 0.38 * Math.sin(2 * p) + 0.12 * Math.sin(3 * p))) * 0.55;
    bus.add(start + i, s * env * vel, s * env * vel);
  }
}

function kick(bus: Bus, t0: number, vel: number, rnd: () => number) {
  const start = Math.round(t0 * SR);
  const len = Math.round(0.42 * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    phase += (TAU * (46 + 92 * Math.exp(-t * 32))) / SR;
    const s = Math.sin(phase) * Math.exp(-t * 7.5) + (rnd() * 2 - 1) * Math.exp(-t * 400) * 0.12;
    bus.add(start + i, s * vel * 0.9, s * vel * 0.9);
  }
}

/** Soft clap: three quick noise bursts and a short tail through a band-pass. */
function clap(bus: Bus, t0: number, vel: number, rnd: () => number) {
  const start = Math.round(t0 * SR);
  const len = Math.round(0.3 * SR);
  const bp = new Svf(1600, 1.1);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let env = 0;
    for (const o of [0, 0.011, 0.023]) if (t >= o) env += Math.exp(-(t - o) * 260);
    if (t > 0.03) env += Math.exp(-(t - 0.03) * 22) * 0.55;
    bp.run(rnd() * 2 - 1);
    const s = bp.band * env * vel * 0.5;
    bus.addPan(start + i, s, 0.08);
  }
}

function hat(bus: Bus, t0: number, vel: number, open: boolean, rnd: () => number) {
  const start = Math.round(t0 * SR);
  const len = Math.round((open ? 0.3 : 0.07) * SR);
  const hp = new Svf(7600, 0.8);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    hp.run(rnd() * 2 - 1);
    const s = hp.high * Math.exp(-t * (open ? 16 : 75)) * vel * 0.32;
    bus.addPan(start + i, s, 0.25);
  }
}

/** Glassy bell (FM, inharmonic modulator) for the melody and chimes. */
function bell(bus: Bus, t0: number, midi: number, vel: number, pan: number, decay = 1.7) {
  const f = hz(midi);
  const start = Math.round(t0 * SR);
  const len = Math.round((4.5 / decay + 0.2) * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = (1 - Math.exp(-t * 400)) * Math.exp(-t * decay);
    const s = Math.sin(TAU * f * t + 0.9 * Math.exp(-t * 2.5) * Math.sin(TAU * f * 3.5 * t));
    bus.addPan(start + i, s * env * vel * 0.28, pan);
  }
}

/** Air moving past: band-passed noise sweeping upwards, panned left to right. */
function whoosh(bus: Bus, t0: number, dur: number, vel: number, rnd: () => number) {
  const start = Math.round(t0 * SR);
  const len = Math.round(dur * SR);
  const bp = new Svf(400, 1.4);
  for (let i = 0; i < len; i++) {
    const x = i / len;
    if (i % 32 === 0) bp.set(380 * Math.pow(8, x), 1.4);
    bp.run(rnd() * 2 - 1);
    const env = Math.sin(Math.PI * x) ** 2;
    bus.addPan(start + i, bp.band * env * vel, -0.5 + x);
  }
}

/** A soft mouse click: a short tick with a little body. */
function click(bus: Bus, t0: number, rnd: () => number) {
  const start = Math.round(t0 * SR);
  const len = Math.round(0.05 * SR);
  const tone = 1700 + rnd() * 400;
  const hp = new Svf(3000, 0.7);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    hp.run(rnd() * 2 - 1);
    const s = Math.sin(TAU * tone * t) * Math.exp(-t * 260) * 0.45 + Math.sin(TAU * 210 * t) * Math.exp(-t * 95) * 0.5 + hp.high * Math.exp(-t * 700) * 0.5;
    bus.add(start + i, s * 0.3, s * 0.3);
  }
}

function keystroke(bus: Bus, t0: number, rnd: () => number) {
  const start = Math.round(t0 * SR);
  const len = Math.round(0.035 * SR);
  const bp = new Svf(2200 + rnd() * 1400, 1.2);
  const tone = 700 + rnd() * 300;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    bp.run(rnd() * 2 - 1);
    const s = bp.band * Math.exp(-t * 420) * 0.9 + Math.sin(TAU * tone * t) * Math.exp(-t * 300) * 0.25;
    bus.addPan(start + i, s * 0.2, (rnd() - 0.5) * 0.3);
  }
}

// ─── Effects ────────────────────────────────────────────────────────────────

/** Freeverb (Jezar's tuning, scaled to 48 kHz). */
function reverb(input: Bus, room = 0.86, damp = 0.25): Bus {
  const out = new Bus(input.length);
  const scale = SR / 44_100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  for (const [ch, src, spread] of [
    [0, input.L, 0],
    [1, input.R, 23],
  ] as const) {
    const dst = ch === 0 ? out.L : out.R;
    const cb = combs.map((c) => ({ buf: new Float32Array(Math.round((c + spread) * scale)), i: 0, store: 0 }));
    const ab = alls.map((a) => ({ buf: new Float32Array(Math.round((a + spread) * scale)), i: 0 }));
    for (let n = 0; n < src.length; n++) {
      const x = src[n]! * 0.015;
      let sum = 0;
      for (const c of cb) {
        const y = c.buf[c.i]!;
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = c.i + 1 === c.buf.length ? 0 : c.i + 1;
        sum += y;
      }
      for (const a of ab) {
        const b = a.buf[a.i]!;
        a.buf[a.i] = sum + b * 0.5;
        a.i = a.i + 1 === a.buf.length ? 0 : a.i + 1;
        sum = b - sum;
      }
      dst[n] = sum;
    }
  }
  return out;
}

/** Ping-pong dotted-eighth delay with a darkening feedback path. */
function delay(input: Bus, time: number, feedback: number, mix: number): Bus {
  const out = new Bus(input.length);
  const d = Math.round(time * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let i = 0;
  let lpL = 0;
  let lpR = 0;
  for (let n = 0; n < input.length; n++) {
    const yl = bl[i]!;
    const yr = br[i]!;
    lpL += (yl - lpL) * 0.35;
    lpR += (yr - lpR) * 0.35;
    bl[i] = input.L[n]! + lpR * feedback;
    br[i] = lpL * feedback;
    i = i + 1 === d ? 0 : i + 1;
    out.L[n] = input.L[n]! + yl * mix;
    out.R[n] = input.R[n]! + yr * mix;
  }
  return out;
}

// ─── Arrangement ────────────────────────────────────────────────────────────

/** Dmaj9 – Bm9 – Gmaj9 – A6/9, one chord per bar. */
const PROGRESSION = [
  { bass: 38, pad: [54, 57, 61, 64], arp: [66, 69, 73, 76] },
  { bass: 35, pad: [54, 57, 61, 62], arp: [66, 69, 71, 74] },
  { bass: 43, pad: [54, 57, 59, 62], arp: [67, 71, 74, 78] },
  { bass: 45, pad: [52, 57, 59, 61], arp: [69, 71, 73, 76] },
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
const ARP_VEL = [0.9, 0.55, 0.72, 0.5, 0.82, 0.52, 0.7, 0.5];
/** Four-bar bell melody in D major pentatonic: [bar, beat, midi]. */
const MELODY: [number, number, number][] = [
  [0, 0, 78], [0, 1.5, 76], [0, 2, 74], [0, 3, 69],
  [1, 0, 71], [1, 1.5, 74], [1, 2.5, 78],
  [2, 0, 76], [2, 1, 74], [2, 2, 71],
  [3, 0, 73], [3, 1.5, 76], [3, 2, 76], [3, 3, 81],
];

function rms(b: Bus) {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b.L[i]! * b.L[i]! + b.R[i]! * b.R[i]!;
  return Math.sqrt(s / (b.length * 2));
}

export function renderTourAudio(opts: { duration: number; events: TourSoundEvent[]; outFile: string; music?: boolean }) {
  const { duration, events } = opts;
  const N = Math.ceil((duration + 0.5) * SR);
  const rnd = random(20261010);
  const introEnd = events.find((e) => e.type === "card-out")?.t ?? 5;
  const lastCard = [...events].reverse().find((e) => e.type === "card-in" && e.t > duration / 2);
  const outro = lastCard?.t ?? duration - 4;

  const pads = new Bus(N);
  const ep = new Bus(N);
  const low = new Bus(N);
  const drums = new Bus(N);
  const lead = new Bus(N);
  const sfx = new Bus(N);

  if (opts.music !== false) {
    const grooveBar = Math.max(1, Math.round(introEnd / BAR));
    for (let bar = 0; bar * BAR < outro; bar++) {
      const t0 = bar * BAR;
      const chord = PROGRESSION[bar % 4]!;
      const g = bar - grooveBar;
      const cycle = g >= 4 ? (g - 4) % 24 : -1;
      const breakdown = cycle >= 20;
      const full = cycle >= 8 && cycle < 20;
      const dur = Math.min(BAR, outro - t0);

      for (const m of chord.pad) pad(pads, t0, dur, m, 0.06, breakdown ? 1500 : 1050, rnd);
      if (g < 0) continue;

      // Electric piano arpeggio, slightly humanised.
      for (let s = 0; s < 8; s++) {
        const at = t0 + s * (BEAT / 2) + (rnd() - 0.5) * 0.012;
        if (at >= outro) break;
        keys(ep, at, chord.arp[ARP[s]!]!, ARP_VEL[s]! * (g < 2 ? 0.7 : 1), s % 2 ? 0.3 : -0.3);
      }

      // Bass: root on 1, a push on the "and" of 2, back on 3. Long notes in the breakdown.
      const hits: [number, number][] = breakdown ? [[0, 3.8]] : [[0, 1.4], [1.5, 0.45], [2, 1.8]];
      for (const [beat, len] of hits) if (t0 + beat * BEAT < outro) bass(low, t0 + beat * BEAT, len * BEAT, chord.bass, 0.9);

      // Drums.
      if (g >= 2) {
        for (let s = 0; s < 16; s++) {
          const at = t0 + s * (BEAT / 4);
          if (at >= outro) break;
          const eighth = s % 2 === 0;
          if (cycle >= 0 && !breakdown && (s === 0 || s === 8 || (full && s === 11 && bar % 2 === 1))) kick(drums, at, s === 11 ? 0.6 : 0.95, rnd);
          if (full && (s === 4 || s === 12)) clap(drums, at, 0.8, rnd);
          if (eighth || full) hat(drums, at + (eighth ? 0 : 0.008), (s % 4 === 2 ? 0.9 : eighth ? 0.55 : 0.3) * (breakdown ? 0.6 : 1), s === 14 && full && bar % 4 === 3, rnd);
        }
      }

      // Bell melody over the middle of each cycle.
      if (cycle >= 8 && cycle < 16) {
        const mb = (cycle - 8) % 4;
        for (const [b, beat, midi] of MELODY) if (b === mb && t0 + beat * BEAT < outro) bell(lead, t0 + beat * BEAT, midi, 0.8, 0.15);
      }
    }

    // Ending: the home chord rings out under the closing card.
    for (const m of PROGRESSION[0]!.pad) pad(pads, outro, Math.max(1, duration - outro - 1.5), m, 0.06, 1300, rnd);
    bass(low, outro, Math.max(1, duration - outro - 1.2), 38, 0.7);
    [74, 78, 81, 86].forEach((m, i) => bell(lead, outro + i * 0.09, m, 0.55, -0.3 + i * 0.2, 1.1));
    // Opening chime with the title card.
    [62, 66, 69, 74].forEach((m, i) => bell(lead, 0.15 + i * 0.11, m, 0.45, -0.3 + i * 0.2, 1.2));
  }

  // UI sounds from the recording.
  let lastKey = -1;
  for (const e of events) {
    if (e.type === "click") click(sfx, e.t, rnd);
    else if (e.type === "key") {
      if (e.t - lastKey > 0.035) keystroke(sfx, e.t, rnd);
      lastKey = e.t;
    } else if (e.type === "chapter") whoosh(sfx, e.t - 0.15, 0.6, 0.24, rnd);
    else if (e.type === "card-out") whoosh(sfx, e.t - 0.1, 0.9, 0.28, rnd);
  }

  // Mix: effects, bus levels, gentle limiting.
  const epWet = delay(ep, BEAT * 0.75, 0.32, 0.28);
  const leadWet = delay(lead, BEAT * 0.75, 0.25, 0.22);
  const send = new Bus(N);
  for (let i = 0; i < N; i++) {
    send.L[i] = pads.L[i]! * 0.5 + epWet.L[i]! * 0.45 + leadWet.L[i]! * 0.8 + drums.L[i]! * 0.12 + sfx.L[i]! * 0.15;
    send.R[i] = pads.R[i]! * 0.5 + epWet.R[i]! * 0.45 + leadWet.R[i]! * 0.8 + drums.R[i]! * 0.12 + sfx.R[i]! * 0.15;
  }
  const wet = reverb(send);

  const gain = { pads: 1.1, ep: 1.6, low: 0.45, drums: 0.85, lead: 1.1, wet: 1.8 };
  const music = new Bus(N);
  for (let i = 0; i < N; i++) {
    music.L[i] = pads.L[i]! * gain.pads + epWet.L[i]! * gain.ep + low.L[i]! * gain.low + drums.L[i]! * gain.drums + leadWet.L[i]! * gain.lead + wet.L[i]! * gain.wet;
    music.R[i] = pads.R[i]! * gain.pads + epWet.R[i]! * gain.ep + low.R[i]! * gain.low + drums.R[i]! * gain.drums + leadWet.R[i]! * gain.lead + wet.R[i]! * gain.wet;
  }

  // Sit the music around −22 dBFS RMS so it stays in the background; UI sounds ride on top.
  const musicRms = rms(music) || 1;
  const musicGain = Math.pow(10, -22 / 20) / musicRms;
  const sfxGain = Math.pow(10, -4 / 20);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const fadeIn = 1.2 * SR;
  const fadeOutStart = (duration - 1.6) * SR;
  for (let i = 0; i < N; i++) {
    let fade = Math.min(1, i / fadeIn);
    if (i > fadeOutStart) fade *= Math.max(0, 1 - (i - fadeOutStart) / (1.6 * SR));
    const soft = (x: number) => (Math.abs(x) < 0.7 ? x : Math.sign(x) * (0.7 + 0.25 * Math.tanh((Math.abs(x) - 0.7) / 0.25)));
    L[i] = soft((music.L[i]! * musicGain * (opts.music === false ? 0 : 1) + sfx.L[i]! * sfxGain) * fade);
    R[i] = soft((music.R[i]! * musicGain * (opts.music === false ? 0 : 1) + sfx.R[i]! * sfxGain) * fade);
  }

  writeWav(opts.outFile, L, R);
  const db = (x: number) => (20 * Math.log10(x || 1e-9)).toFixed(1);
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
  return {
    peakDb: db(peak),
    levels: {
      pads: db(rms(pads) * gain.pads * musicGain),
      keys: db(rms(epWet) * gain.ep * musicGain),
      bass: db(rms(low) * gain.low * musicGain),
      drums: db(rms(drums) * gain.drums * musicGain),
      melody: db(rms(leadWet) * gain.lead * musicGain),
      reverb: db(rms(wet) * gain.wet * musicGain),
      sfx: db(rms(sfx) * sfxGain),
    },
  };
}

function writeWav(file: string, L: Float32Array, R: Float32Array) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i]!)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i]!)) * 32767), 46 + i * 4);
  }
  writeFileSync(file, buf);
}
