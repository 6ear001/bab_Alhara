// محرك الصوت (WebAudio) — كل الأصوات تركيبية ومؤقتة وقابلة للاستبدال بتسجيلات:
//  • أجواء مكانية (بحرة، مقهى، سوق، عصافير النهار، صراصير الليل، ريح)
//  • مؤثرات (خطوات، طرق، واجهة، أدلة، ثقة)
//  • موسيقى مولَّدة على مقامات (بياتي = هدوء، حجاز = توتر، نهاوند = حزن)
//  • صوت حوار مؤقت بنبرة لكل شخصية + جدول مخارج حروف لمزامنة الشفاه
import { clamp, lerp, mulberry32 } from './config.js';

const TWO_PI = Math.PI * 2;

// ───────── المقامات (نصف-نغمات من الطبقة D) ─────────
const D3 = 146.83;
const SCALES = {
  calm: [0, 1.5, 3, 5, 7, 8, 10],     // بياتي على الدوكاه (ربع تون للمي)
  tension: [0, 1, 4, 5, 7, 8, 10],    // حجاز
  sad: [0, 2, 3, 5, 7, 8, 11],        // نهاوند
};
const MOOD = {
  off:     { melody: 0,    drone: 0,    perc: 0,    bpm: 60 },
  calm:    { melody: 0.55, drone: 0.5,  perc: 0,    bpm: 66 },
  tension: { melody: 0.7,  drone: 0.7,  perc: 0.8,  bpm: 100 },
  sad:     { melody: 0.5,  drone: 0.55, perc: 0,    bpm: 52 },
};
const freqOf = (semi, oct = 0) => D3 * Math.pow(2, (semi + oct * 12) / 12);

// ───────── جدول مخارج الحروف للصوت المؤقت ─────────
const LONG = { 'ا': 'a', 'آ': 'a', 'أ': 'a', 'إ': 'a', 'ى': 'a', 'و': 'u', 'ي': 'i' };
const FRIC = new Set('سشصزفحخهثذظضغع');
const PLOS = new Set('بتدطكقء');
const LABIAL = new Set('بمفو');
const NASAL = new Set('من');
const PAUSE_LONG = new Set('.؟!…:؛');
const PAUSE_SHORT = new Set('،,-—');
const VOWEL_F = { a: [760, 1250], i: [310, 2250], u: [330, 850], o: [520, 950] };
const VISEME = { a: { open: 0.8, wide: 0.1 }, i: { open: 0.3, wide: 0.9 }, u: { open: 0.3, wide: -0.7 }, o: { open: 0.55, wide: -0.4 } };

export function buildTimeline(text, rate = 1) {
  const clean = text.replace(/[ً-ْـ]/g, '');
  const ev = [];
  let t = 0;
  const cyc = ['a', 'i', 'a', 'u', 'a', 'o'];
  let ci = 0;
  const chars = [...clean];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === ' ' || ch === '\n') { t += 0.06 / rate; continue; }
    if (PAUSE_LONG.has(ch)) { ev.push({ t, dur: 0.34 / rate, kind: 'pause' }); t += 0.34 / rate; continue; }
    if (PAUSE_SHORT.has(ch)) { ev.push({ t, dur: 0.17 / rate, kind: 'pause' }); t += 0.17 / rate; continue; }
    if (LONG[ch]) {
      // حرف مدّ بلا حرف قبله: صوت مستقل
      const v = LONG[ch];
      const dur = 0.16 / rate;
      ev.push({ t, dur, kind: 'syl', v, long: true, cons: null, ...VISEME[v] });
      t += dur; continue;
    }
    if (!/[؀-ۿ]/.test(ch)) continue;
    // حرف ساكن: يُكوّن مقطعاً مع حرف المد التالي إن وُجد
    const next = chars[i + 1];
    let v, long = false;
    if (next && LONG[next]) { v = LONG[next]; long = true; i++; } else { v = cyc[ci++ % cyc.length]; }
    const dur = (long ? 0.19 : 0.1) / rate;
    const closed = LABIAL.has(ch) || NASAL.has(ch);
    ev.push({ t, dur, kind: 'syl', v, long, cons: ch, closed, ...VISEME[v] });
    t += dur;
  }
  return { events: ev, total: t };
}

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.bus = {};
    this.mood = 'off';
    this.rng = mulberry32(99);
    this.voices = new Set();
    this.env = { day: 1, night: 0, dusk: 0 };
    this._nextBird = 0; this._nextClink = 0; this._nextTavla = 0; this._nextVendor = 0;
    this._noteTimer = null;
    this._step = 0;
  }

  async init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.bus = {};
    for (const k of ['music', 'sfx', 'amb', 'voice']) { this.bus[k] = ctx.createGain(); this.bus[k].connect(this.master); }
    // صدى بسيط للموسيقى
    this.musicIn = ctx.createGain(); this.musicIn.connect(this.bus.music);
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.22;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.musicIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(this.bus.music);

    // مخازن ضجيج
    this.white = this._noise('white'); this.pink = this._noise('pink');
    this._buildAmbience();
    this.applySettings();
    this.ready = true;
    this._startMusicLoop();
  }

  async resume() { if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume(); }

  _noise(kind) {
    const ctx = this.ctx, len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'white') for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    else { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }
    return buf;
  }
  _loop(buf, dest, filters = []) {
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    let node = src;
    for (const f of filters) { node.connect(f); node = f; }
    node.connect(dest);
    src.start(0, Math.random() * 2);
    return src;
  }
  _filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _panner(x, y, z, ref = 5, roll = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 120; p.rolloffFactor = roll;
    this._setPos(p, x, y, z);
    return p;
  }
  _setPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }

  applySettings() {
    if (!this.ready) return;
    const s = this.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.bus.music.gain.setTargetAtTime(s.music * 0.9, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.bus.amb.gain.setTargetAtTime(s.ambience, t, 0.05);
    this.bus.voice.gain.setTargetAtTime(s.voice, t, 0.05);
  }

  // ───────── الأجواء ─────────
  _buildAmbience() {
    const ctx = this.ctx, amb = this.bus.amb;
    // ريح/أجواء عامة
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.06;
    this._loop(this.pink, this.windGain, [this._filter('lowpass', 520)]); this.windGain.connect(amb);
    // بحرة
    const fp = this._panner(0, 1, 2, 3, 1.4);
    const fg = ctx.createGain(); fg.gain.value = 0.5;
    this.fountainGain = fg;
    this._loop(this.white, fg, [this._filter('bandpass', 3400, 0.5), this._filter('highpass', 1400)]);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.35; lfoG.gain.value = 0.12; lfo.connect(lfoG); lfoG.connect(fg.gain); lfo.start();
    fg.connect(fp); fp.connect(amb);
    // مقهى (همهمة)
    const cp = this._panner(-2, 1.2, -10, 5, 1.3);
    this.cafeGain = ctx.createGain(); this.cafeGain.gain.value = 0.55;
    this._loop(this.pink, this.cafeGain, [this._filter('bandpass', 520, 0.8)]);
    const l2 = ctx.createOscillator(), l2g = ctx.createGain(); l2.frequency.value = 0.27; l2g.gain.value = 0.2; l2.connect(l2g); l2g.connect(this.cafeGain.gain); l2.start();
    this.cafeGain.connect(cp); cp.connect(amb);
    this.cafePan = cp;
    // الزقاق (صدى هادئ)
    const ap = this._panner(-26, 2, -4, 6, 1);
    this.alleyGain = ctx.createGain(); this.alleyGain.gain.value = 0.35;
    this._loop(this.pink, this.alleyGain, [this._filter('lowpass', 260)]);
    this.alleyGain.connect(ap); ap.connect(amb);
    // صراصير الليل
    this.cricketGain = ctx.createGain(); this.cricketGain.gain.value = 0;
    for (const [f, m] of [[4350, 24], [4720, 31]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = m;
      const amg = ctx.createGain(); amg.gain.value = 0.5;
      const og = ctx.createGain(); og.gain.value = 0.5;
      am.connect(amg); amg.connect(og.gain); o.connect(og); og.connect(this.cricketGain);
      const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 0.4 + Math.random() * 0.3; tg.gain.value = 0.25; trem.connect(tg); tg.connect(og.gain);
      o.start(); am.start(); trem.start();
    }
    this.cricketGain.connect(amb);
  }

  // تحديث كل إطار: موضع المستمع + مستويات الأجواء
  update(dt, camera, env) {
    if (!this.ready) return;
    const ctx = this.ctx, l = ctx.listener;
    const p = camera.position;
    const f = camera.getWorldDirection(new camera.position.constructor());
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    this.env = env;
    const t = ctx.currentTime;
    this.cricketGain.gain.setTargetAtTime(env.night * 0.05 + env.dusk * 0.015, t, 1.5);
    this.windGain.gain.setTargetAtTime(0.045 + env.night * 0.03, t, 1.5);
    this.cafeGain.gain.setTargetAtTime(0.4 + env.dusk * 0.2 + env.night * 0.1, t, 2);
    // أحداث عشوائية
    const now = ctx.currentTime;
    if (now > this._nextBird && env.day > 0.25) { this._bird(env); this._nextBird = now + 1.2 + this.rng() * 4.5 + (1 - env.day) * 6; }
    if (now > this._nextClink) { this._clink(); this._nextClink = now + 3 + this.rng() * 7; }
    if (now > this._nextTavla) { this._tavla(); this._nextTavla = now + 2 + this.rng() * 6; }
    if (now > this._nextVendor && env.day > 0.1) { this._vendorCall(); this._nextVendor = now + 18 + this.rng() * 25; }
  }

  duck(on) { if (!this.ready) return; this.bus.amb.gain.setTargetAtTime(on ? this.settings.ambience * 0.45 : this.settings.ambience, this.ctx.currentTime, 0.3); }
  pauseMusic(on) { if (!this.ready) return; this.bus.music.gain.setTargetAtTime(on ? this.settings.music * 0.35 : this.settings.music * 0.9, this.ctx.currentTime, 0.3); }

  _bird(env) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const px = this.ctx.listener.positionX ? this.ctx.listener.positionX.value : 0, pz = this.ctx.listener.positionZ ? this.ctx.listener.positionZ.value : 0;
    const ang = this.rng() * TWO_PI, dist = 10 + this.rng() * 18;
    const pan = this._panner(px + Math.cos(ang) * dist, 9 + this.rng() * 5, pz + Math.sin(ang) * dist, 6, 1);
    pan.connect(this.bus.amb);
    const n = 2 + ((this.rng() * 4) | 0), base = 2300 + this.rng() * 1800;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * (0.09 + this.rng() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.25 + this.rng() * 0.5), s + 0.07);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.18 * env.day, s + 0.01); g.gain.exponentialRampToValueAtTime(0.001, s + 0.09);
      o.connect(g); g.connect(pan); o.start(s); o.stop(s + 0.12);
    }
    setTimeout(() => pan.disconnect(), 1500);
  }
  _clink() {
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    for (const [f, d] of [[2250, 0.16], [3380, 0.1]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * (0.98 + this.rng() * 0.05);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g); g.connect(this.cafePan); o.start(t); o.stop(t + d + 0.02);
    }
  }
  _tavla() {
    const ctx = this.ctx;
    const n = 1 + ((this.rng() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + 0.01 + i * (0.11 + this.rng() * 0.08);
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const bp = this._filter('bandpass', 1500 + this.rng() * 900, 2), g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      s.connect(bp); bp.connect(g); g.connect(this.cafePan); s.start(t, this.rng() * 2, 0.06);
    }
  }
  _vendorCall() {
    if (!this.ready) return;
    const pan = this._panner(15, 1.5, 0, 5, 1.1); pan.connect(this.bus.amb);
    const h = this.speak('طازة يا بندورة، طازة يا خيار', { pitch: 112, formant: 1, rate: 0.78 }, { dest: pan, gain: 0.35, sing: true, ambient: true });
    setTimeout(() => { try { pan.disconnect(); } catch (e) { /* */ } this.voices.delete(h); }, 6000);
    return h;
  }

  // ───────── المؤثرات ─────────
  step(running = false, wet = false) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = this._filter('bandpass', 380 + this.rng() * 420, 0.9), g = ctx.createGain();
    const v = (running ? 0.2 : 0.13) * (0.8 + this.rng() * 0.4);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    s.connect(bp); bp.connect(g); g.connect(this.bus.sfx); s.start(t, this.rng() * 2, 0.12);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    og.gain.setValueAtTime(v * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(this.bus.sfx); o.start(t); o.stop(t + 0.12);
  }
  click() { this._tone(1500, 0.03, 0.12, 'square', this.bus.sfx); }
  hover() { this._tone(1100, 0.02, 0.05, 'sine', this.bus.sfx); }
  select() { this._tone(660, 0.07, 0.14, 'triangle', this.bus.sfx); this._tone(990, 0.1, 0.1, 'triangle', this.bus.sfx, 0.05); }
  paper() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const hp = this._filter('highpass', 2500), g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    s.connect(hp); hp.connect(g); g.connect(this.bus.sfx); s.start(t, 0, 0.3);
  }
  knock() {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) this._tone(150 - i * 8, 0.1, 0.3, 'sine', this.bus.sfx, i * 0.18, 60);
  }
  bell(f = 880, vol = 0.18, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    for (const [m, a, d] of [[1, 1, 1.4], [2.01, 0.5, 0.9], [3.02, 0.25, 0.6], [4.2, 0.12, 0.4]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * m; o.type = 'sine';
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g); g.connect(this.bus.sfx); o.start(t); o.stop(t + d + 0.05);
    }
  }
  clue() { this.bell(784, 0.2); this.bell(1175, 0.16, 0.12); this.bell(1568, 0.12, 0.26); }
  item() { this.bell(988, 0.16); this.bell(1318, 0.13, 0.1); }
  trustUp() { this.pluck(freqOf(7, 1), 0, 0.5, 0.25, this.bus.sfx); this.pluck(freqOf(12, 1), 0.12, 0.8, 0.22, this.bus.sfx); }
  trustDown() { this.pluck(freqOf(5, 1), 0, 0.5, 0.25, this.bus.sfx); this.pluck(freqOf(4, 1), 0.14, 0.9, 0.22, this.bus.sfx); }
  save() { this.bell(660, 0.12); this.bell(880, 0.1, 0.14); }
  alarm() { this._tone(180, 0.35, 0.18, 'sawtooth', this.bus.sfx, 0, 90); }
  _tone(f, dur, vol, type, dest, delay = 0, endF = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (endF) o.frequency.exponentialRampToValueAtTime(endF, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }

  // ───────── العود المُنتَف ─────────
  pluck(freq, delay, dur, vel, dest) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay + 0.005;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'triangle';
    o1.frequency.value = freq; o2.frequency.value = freq * 2.004;
    const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 0.55; g2.gain.value = 0.28;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(Math.min(9000, freq * 9), t); f.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.4), t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o1.connect(g1); o2.connect(g2); g1.connect(f); g2.connect(f); f.connect(g); g.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    // نقرة الريشة
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const cg = ctx.createGain(); cg.gain.setValueAtTime(vel * 0.5, t); cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
    const chp = this._filter('highpass', 3000);
    s.connect(chp); chp.connect(cg); cg.connect(dest); s.start(t, 0, 0.03);
  }

  // ───────── الموسيقى ─────────
  setMood(m) {
    if (!(m in MOOD)) m = 'off';
    this.mood = m;
    if (!this.ready) return;
    const p = MOOD[m], t = this.ctx.currentTime;
    this._melodyVol = p.melody;
    if (!this.drone) this._buildDrone();
    this.drone.gain.gain.setTargetAtTime(p.drone * 0.07, t, 1.2);
    this._root = 0;
  }
  _buildDrone() {
    const ctx = this.ctx;
    this.drone = { gain: ctx.createGain() };
    this.drone.gain.gain.value = 0;
    const lp = this._filter('lowpass', 320);
    for (const [f, type, v] of [[D3 / 2, 'sine', 1], [D3 * 0.75, 'triangle', 0.5], [D3, 'sine', 0.35]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(lp); o.start();
    }
    lp.connect(this.drone.gain); this.drone.gain.connect(this.musicIn);
  }
  _startMusicLoop() {
    this._deg = 7; this._barStep = 0; this._nextTime = this.ctx.currentTime + 0.5;
    this._noteTimer = setInterval(() => this._scheduleMusic(), 90);
  }
  _scheduleMusic() {
    if (!this.ready || this.mood === 'off' || this.ctx.state !== 'running') return;
    const ctx = this.ctx, p = MOOD[this.mood];
    const scale = SCALES[this.mood];
    const stepDur = 60 / p.bpm / 2;         // ثُمن
    while (this._nextTime < ctx.currentTime + 0.35) {
      const t = this._nextTime, d = t - ctx.currentTime;
      const st = this._step++;
      const phraseEnd = st % 16 === 15;
      // لحن: مشي عشوائي موجّه
      const restP = this.mood === 'sad' ? 0.45 : this.mood === 'calm' ? 0.3 : 0.12;
      if (this.rng() > restP || phraseEnd) {
        const move = this.rng();
        let dg = move < 0.4 ? 1 : move < 0.7 ? -1 : move < 0.82 ? 2 : move < 0.94 ? -2 : 0;
        if (this._deg > 11) dg = -Math.abs(dg || 1); if (this._deg < 2) dg = Math.abs(dg || 1);
        this._deg = clamp(this._deg + dg, 0, 13);
        if (phraseEnd) this._deg = [0, 4, 7, 11][(this.rng() * 4) | 0] + (this.rng() < 0.5 ? 0 : 0);
        const oct = Math.floor(this._deg / 7), idx = ((this._deg % 7) + 7) % 7;
        const f = freqOf(scale[idx], oct + 1);
        const dur = (phraseEnd ? 2.4 : (this.mood === 'sad' ? 1.8 : 0.9)) * (60 / p.bpm) * 1.2;
        if (this.rng() < 0.22 && !phraseEnd) this.pluck(f * Math.pow(2, (scale[(idx + 1) % 7] - scale[idx]) / 12 * 0.0 + 0), d - 0.07, 0.3, this._melodyVol * 0.13, this.musicIn);
        this.pluck(f, d, dur, this._melodyVol * (phraseEnd ? 0.3 : 0.24), this.musicIn);
        if (this.mood === 'tension' && this.rng() < 0.4) this.pluck(f * 1.5, d + stepDur * 0.5, 0.4, this._melodyVol * 0.1, this.musicIn);
      }
      // إيقاع (مقسوم) عند التوتر
      if (p.perc > 0) {
        const pat = ['D', 'T', '-', 'T', 'D', '-', 'T', '-'][st % 8];
        if (pat === 'D') this._dum(d, p.perc); else if (pat === 'T') this._tak(d, p.perc);
      }
      this._nextTime += stepDur;
    }
  }
  _dum(d, v) { this._tone(130, 0.14, 0.22 * v, 'sine', this.musicIn, d, 52); }
  _tak(d, v) {
    const ctx = this.ctx, t = ctx.currentTime + d;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = this._filter('bandpass', 3600, 3), g = ctx.createGain();
    g.gain.setValueAtTime(0.2 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(bp); bp.connect(g); g.connect(this.musicIn); s.start(t, Math.random() * 2, 0.08);
  }

  // ───────── صوت الحوار المؤقت ─────────
  // يعيد مقبضاً: { total, start, update(), cancel(), done }
  speak(text, voice, { dest = null, gain = 1, sing = false, onEnd = null, ambient = false } = {}) {
    const { events, total } = buildTimeline(text, voice.rate || 1);
    const handle = { total, events, cursor: 0, startMs: performance.now(), done: false, cancelled: false, open: 0, wide: 0, _endCb: onEnd, nodes: [] };
    const useBrowser = this.settings.browserVoice && 'speechSynthesis' in window && !ambient;
    if (this.ready && !useBrowser) this._voiceSynth(events, voice, dest || this.bus.voice, gain, handle, sing);
    else if (useBrowser) this._browserSpeak(text, voice, handle);
    handle.update = () => this._voiceUpdate(handle);
    handle.cancel = () => { handle.cancelled = true; handle.done = true; handle.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* */ } }); if (useBrowser) speechSynthesis.cancel(); this.voices.delete(handle); };
    this.voices.add(handle);
    return handle;
  }
  _voiceUpdate(h) {
    const now = (performance.now() - h.startMs) / 1000;
    if (h.done) { h.open = 0; h.wide = 0; return h; }
    if (now >= h.total + 0.1) { h.done = true; h.open = 0; h.wide = 0; this.voices.delete(h); if (h._endCb) h._endCb(); return h; }
    let e = null;
    for (const ev of h.events) { if (now >= ev.t && now < ev.t + ev.dur) { e = ev; break; } }
    if (!e || e.kind === 'pause') { h.open = 0.04; h.wide = 0; return h; }
    const local = (now - e.t) / e.dur;
    const env = Math.sin(clamp(local, 0, 1) * Math.PI);
    const closedPhase = e.closed && local < 0.22;
    h.open = closedPhase ? 0 : e.open * (0.55 + 0.45 * env);
    h.wide = e.wide;
    return h;
  }
  progress(h) { return clamp(((performance.now() - h.startMs) / 1000) / Math.max(0.1, h.total), 0, 1); }

  _voiceSynth(events, voice, dest, gain, handle, sing) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    handle.startMs = performance.now() + 50;
    const base = voice.pitch || 120, fm = voice.formant || 1;
    const n = events.length;
    events.forEach((e, i) => {
      if (e.kind !== 'syl') return;
      const t = t0 + e.t, dur = e.dur;
      // نبرة: تنخفض نهاية الجملة
      const pos = i / Math.max(1, n);
      const contour = 1 + 0.1 * Math.sin(pos * 9 + (voice.pitch % 7)) - 0.14 * pos * pos;
      const f0 = base * contour * (sing ? 1 + 0.15 * Math.sin(i * 0.7) : 1);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (1 + (e.long ? 0.04 : -0.02)), t + dur);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.value = f0 * 0.012; vib.connect(vg); vg.connect(o.frequency);
      const [F1, F2] = VOWEL_F[e.v];
      const f1 = this._filter('bandpass', F1 * fm, 6), f2 = this._filter('bandpass', F2 * fm, 8);
      const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 1.0; g2.gain.value = 0.6;
      const env = ctx.createGain();
      const vol = 0.9 * gain * (e.long ? 1 : 0.85);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + 0.015); env.gain.setValueAtTime(vol, t + dur * 0.65); env.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f1); o.connect(f2); f1.connect(g1); f2.connect(g2); g1.connect(env); g2.connect(env); env.connect(dest);
      o.start(t); vib.start(t); o.stop(t + dur + 0.02); vib.stop(t + dur + 0.02);
      handle.nodes.push(o);
      // صوت الحرف الساكن
      if (e.cons && (FRIC.has(e.cons) || PLOS.has(e.cons))) {
        const s = ctx.createBufferSource(); s.buffer = this.white;
        const fricative = FRIC.has(e.cons);
        const bp = this._filter(fricative ? 'highpass' : 'bandpass', fricative ? 4200 : 1800, 1.2);
        const ng = ctx.createGain(); const nd = fricative ? 0.045 : 0.018;
        ng.gain.setValueAtTime(0.26 * gain, t); ng.gain.exponentialRampToValueAtTime(0.001, t + nd);
        s.connect(bp); bp.connect(ng); ng.connect(dest); s.start(t, this.rng() * 2, nd + 0.01);
      }
    });
  }
  _browserSpeak(text, voice, handle) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const arabic = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('ar'));
      u.lang = arabic ? arabic.lang : 'ar-SA'; if (arabic) u.voice = arabic;
      u.pitch = clamp((voice.pitch || 120) / 130, 0.5, 2); u.rate = clamp(voice.rate || 1, 0.6, 1.4) * 0.95;
      u.volume = this.settings.voice * this.settings.master;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* غير مدعوم */ }
  }
  stopVoices() { for (const h of [...this.voices]) h.cancel(); this.voices.clear(); }
}
