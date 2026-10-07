// مشغّل الحوار: عقد متفرعة + صوت مؤقت + مزامنة شفاه + كاميرا سينمائية
import * as THREE from 'three';
import { DIALOGUES } from './story/dialogues.js';
import { CAST } from './story/cast.js';
import { TRUST_META } from './story/data.js';

const strip = (t) => t.replace(/^\s*\([^)]*\)\s*/, '').trim();

export class DialogueRunner {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.mode = null;       // 'tree' | 'thought'
    this.line = null;
    this.state = 'idle';    // typing | waiting | choices | auto | idle
    this.shotIdx = 0;
  }

  get ui() { return this.g.ui; }

  // ───────── بدء ─────────
  start(npcId) {
    const g = this.g, def = DIALOGUES[npcId], npc = g.npcs.get(npcId);
    if (!def || !npc) return;
    this._begin(npc, 'tree');
    this.def = def;
    this.show(def.entry(g.story));
  }

  // أفكار نديم/فحص الأغراض
  startThought(lines, fx, speaker = 'nadim') {
    this._begin(null, 'thought');
    this.thoughtFx = fx;
    this.cur = { node: { who: speaker, expr: 'thinking' }, lines, li: 0 };
    this._playLine(speaker, lines[0], 'thinking');
  }

  _begin(npc, mode) {
    const g = this.g;
    this.active = true; this.mode = mode; this.npc = npc;
    this.savedMood = g.audio.mood;
    g.setState('dialogue');
    g.audio.duck(true);
    if (npc) { npc.talkingTo = g.player; }
    this.shotIdx = 0;
    this.ui.openDialogue(mode === 'tree');
    g.player.vel.set(0, 0, 0); g.player.char.moveSpeed = 0;
  }

  // ───────── عرض عقدة ─────────
  show(id) {
    const g = this.g, node = this.def.nodes[id];
    if (!node) { this.close(); return; }
    this.nodeId = id;
    g.story.apply(node.fx);
    let text = typeof node.text === 'function' ? node.text(g.story) : node.text;
    const lines = Array.isArray(text) ? text : [text];
    this.cur = { node, lines, li: 0 };
    this._playLine(node.who, lines[0], node.expr || 'neutral');
  }

  _playLine(who, text, expr, auto = false) {
    const g = this.g;
    this._clearSpeech();
    const isPlayer = who === 'nadim';
    const char = isPlayer ? g.player.char : g.npcs.get(who)?.char;
    this.speaker = { who, char, isPlayer };
    const cast = CAST[who];
    this.ui.setSpeaker(cast ? cast.name : 'نديم', this.mode === 'thought' ? 'في سرّه' : (cast?.role || ''), isPlayer);
    if (char) { char.setExpression(expr); char.setTalking(1); }
    if (expr === 'angry' && g.audio.mood !== 'tension') g.audio.setMood('tension');
    this.fullText = text;
    this.auto = auto;
    this.state = 'typing';
    this.ui.setDialogueText('', false);
    this.ui.hideChoices();
    const voice = (cast && cast.voice) || { pitch: 120, formant: 1, rate: 1 };
    this.handle = g.audio.speak(text, voice, {});
    // لقطة الكاميرا
    if (this.mode === 'tree') this._shot(isPlayer, this.line === null);
    this.line = text;
    this.typed = 0;
    this._t0 = performance.now();
  }

  _clearSpeech() {
    if (this.handle) { this.handle.cancel(); this.handle = null; }
    if (this.speaker?.char) { this.speaker.char.setTalking(0); this.speaker.char.setViseme(0, 0); }
  }

  // ───────── الكاميرا ─────────
  _shot(isPlayer, first) {
    const g = this.g, rig = g.camRig;
    const P = g.player.pos, S = this.npc.pos;
    const dir = new THREE.Vector3(P.x - S.x, 0, P.z - S.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const headS = this.npc.char.headWorld(new THREE.Vector3()), headP = g.player.char.headWorld(new THREE.Vector3());
    const sc = this.npc.char.scale;
    let pos, look, fov;
    const kind = first ? 'wide' : isPlayer ? 'player' : (this.shotIdx++ % 2 === 0 ? 'ots' : 'close');
    if (kind === 'wide') {
      const mid = new THREE.Vector3((P.x + S.x) / 2, 1.45, (P.z + S.z) / 2);
      // نختار الجهة الأقل انسداداً بالجدران والأعمدة
      let best = null, bestD = -1;
      for (const sd of [1, -1]) {
        const cand = mid.clone().addScaledVector(side, 3.2 * sd).addScaledVector(dir, 0.6); cand.y = 1.55;
        const safe = rig.avoid(new THREE.Vector3(mid.x, cand.y, mid.z), cand, 0.3);
        const d = Math.hypot(safe.x - mid.x, safe.z - mid.z);
        if (d > bestD) { bestD = d; best = safe; }
      }
      pos = best;
      look = mid.clone(); look.y = 1.4; fov = 42;
    } else if (kind === 'ots') {
      pos = new THREE.Vector3(P.x, 1.62, P.z).addScaledVector(dir, 1.05).addScaledVector(side, 0.55);
      look = headS.clone(); look.y -= 0.03; fov = 33;
    } else if (kind === 'close') {
      pos = new THREE.Vector3(S.x, 1.62 * sc, S.z).addScaledVector(dir, 1.5).addScaledVector(side, -0.3);
      look = headS.clone(); look.y -= 0.02; fov = 30;
    } else {
      pos = new THREE.Vector3(P.x, 1.62, P.z).addScaledVector(dir, -1.55).addScaledVector(side, 0.35);
      look = headP.clone(); look.y -= 0.02; fov = 31;
    }
    const origin = new THREE.Vector3(look.x, pos.y, look.z);
    const safe = rig.avoid(origin, pos, 0.25);
    rig.setShot(safe, look, fov, kind === 'wide' ? 2.2 : 3.2);
    if (first) rig.snap();
  }

  // ───────── تحديث كل إطار ─────────
  update(dt) {
    if (!this.active) return;
    const g = this.g;
    // اللاعب ينظر إلى المتحدّث
    if (this.npc) {
      const want = Math.atan2(this.npc.pos.x - g.player.pos.x, this.npc.pos.z - g.player.pos.z);
      let d = want - g.player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.player.yaw += d * Math.min(1, dt * 6);
      g.player.char.lookAt(this.npc.char.headWorld(new THREE.Vector3()));
    }
    if (this.state === 'typing') {
      const text = this.fullText;
      let prog;
      if (this.handle) {
        this.handle.update();
        if (this.speaker.char) this.speaker.char.setViseme(this.handle.open, this.handle.wide);
        prog = g.audio.ready ? g.audio.progress(this.handle) : (performance.now() - this._t0) / 1000 / Math.max(0.5, text.length / 22);
        if (this.handle.done) prog = 1;
      } else prog = (performance.now() - this._t0) / 1000 / Math.max(0.5, text.length / 22);
      const n = Math.min(text.length, Math.ceil(prog * text.length));
      if (n !== this.typed) { this.typed = n; this.ui.setDialogueText(text.slice(0, n), false); }
      if (prog >= 1) this._lineDone();
    } else if (this.state === 'auto') {
      this._autoT -= dt;
      if (this._autoT <= 0) this._next();
    }
  }

  _lineDone() {
    this._clearSpeech();
    this.ui.setDialogueText(this.fullText, this.mode === 'tree' && !this.auto);
    if (this.auto) { this.state = 'auto'; this._autoT = 0.45; return; }
    this.state = 'waiting';
  }

  // نقر/مسافة
  advance() {
    if (!this.active) return;
    if (this.state === 'typing') { this._lineDone(); }
    else if (this.state === 'waiting') this._next();
    else if (this.state === 'auto') this._next();
  }

  _next() {
    const c = this.cur;
    if (this.mode === 'thought') {
      c.li++;
      if (c.li < c.lines.length) { this._playLine(c.node.who, c.lines[c.li], 'thinking'); return; }
      const fx = this.thoughtFx; if (fx) this.g.story.apply(fx); this.close(); return;
    }
    if (this.afterSay) { const fn = this.afterSay; this.afterSay = null; fn(); return; }
    c.li++;
    if (c.li < c.lines.length) { this._playLine(c.node.who, c.lines[c.li], c.node.expr || 'neutral'); return; }
    this._finishNode();
  }

  _finishNode() {
    const node = this.cur.node, g = this.g;
    this._clearSpeech();
    if (node.choices) {
      const vis = node.choices.filter((ch) => !(ch.once && g.story.once('c:' + this.nodeId + ':' + ch.once)) && !(ch.once && g.story.once(ch.once)))
        .map((ch) => {
          const ok = ch.cond ? ch.cond(g.story) : true;
          return { ch, ok };
        })
        .filter((v) => v.ok || v.ch.lock);
      this.choices = vis;
      this.state = 'choices';
      this.ui.showChoices(vis.map((v) => ({ text: v.ch.t, locked: !v.ok, lock: v.ch.lock })), (i) => this.choose(i));
      this.ui.setDialogueText(this.fullText, false);
      return;
    }
    if (node.end) { this.close(); return; }
    if (node.next) { const nx = typeof node.next === 'function' ? node.next(g.story) : node.next; this.show(nx); return; }
    this.close();
  }

  choose(i) {
    if (this.state !== 'choices') return;
    const v = this.choices[i];
    if (!v || !v.ok) { this.g.audio.hover(); return; }
    const ch = v.ch, g = this.g;
    g.audio.select();
    if (ch.once) g.story.markOnce(ch.once);
    g.story.apply(ch.fx);
    this.ui.hideChoices();
    const sayText = ch.say === false ? null : (ch.say || strip(ch.t));
    const proceed = () => {
      if (ch.end) { this.close(); return; }
      const nx = typeof ch.next === 'function' ? ch.next(g.story) : ch.next;
      if (nx) this.show(nx); else this.close();
    };
    if (sayText) {
      this.afterSay = proceed;
      this._playLine('nadim', sayText, 'neutral', true);
    } else proceed();
  }

  // ───────── إغلاق ─────────
  close() {
    const g = this.g;
    this._clearSpeech();
    this.active = false; this.state = 'idle'; this.afterSay = null; this.line = null;
    this.ui.closeDialogue();
    g.audio.duck(false);
    if (this.npc) { this.npc.talkingTo = null; this.npc.char.setTalking(0); }
    g.player.char.lookAt(null); g.player.char.setTalking(0);
    g.camRig.follow();
    g.camRig.fov = g.camRig.camera.fov;
    this.npc = null;
    g.setState('play');
    g.afterDialogue();
  }
}
