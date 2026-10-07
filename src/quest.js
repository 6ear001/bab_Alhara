// حالة القصة: الثقة، السمعة، الأدلة، الجرد، الأعلام، السجل — قابلة للحفظ والتحميل
import { CAST } from './story/cast.js';
import { CLUES, ITEMS, ENDINGS, TRUST_META, REP_META, deriveObjective } from './story/data.js';

export class Story {
  constructor() { this.listeners = {}; this.reset(); }

  reset() {
    this.s = {
      flags: {},
      trust: { abuJalal: CAST.abuJalal.start.trust, aqeed: CAST.aqeed.start.trust, umHasan: CAST.umHasan.start.trust },
      rep: { amana: 0, haiba: 0 },
      clues: [], items: [], once: {}, log: [], ending: null,
    };
    this.trust0 = { ...this.s.trust };
    this.rep0 = { ...this.s.rep };
  }

  // ── مراقبة الأحداث ──
  on(name, fn) { (this.listeners[name] ||= []).push(fn); return () => { this.listeners[name] = this.listeners[name].filter((f) => f !== fn); }; }
  emit(name, payload) { (this.listeners[name] || []).forEach((f) => f(payload)); }

  // ── للقراءة (تُستخدم في شروط الحوار) ──
  get ending() { return this.s.ending; }
  flag(k) { return !!this.s.flags[k]; }
  trust(id) { return this.s.trust[id]; }
  rep(axis) { return this.s.rep[axis]; }
  hasClue(id) { return this.s.clues.includes(id); }
  hasItem(id) { return this.s.items.includes(id); }
  once(k) { return !!this.s.once[k]; }
  objective() { return deriveObjective(this); }

  // ── للتعديل ──
  setFlag(k, v = true) { if (this.s.flags[k] !== v) { this.s.flags[k] = v; this.emit('flag', { k, v }); } }
  addTrust(id, d) {
    if (!d) return;
    const old = this.s.trust[id];
    this.s.trust[id] = Math.max(0, Math.min(100, old + d));
    this.emit('trust', { id, delta: this.s.trust[id] - old, value: this.s.trust[id] });
  }
  addRep(axis, d) {
    if (!d) return;
    this.s.rep[axis] += d;
    this.emit('rep', { axis, delta: d, value: this.s.rep[axis] });
  }
  giveClue(id) {
    if (this.hasClue(id)) return false;
    this.s.clues.push(id); this.emit('clue', { id, clue: CLUES[id] }); return true;
  }
  giveItem(id) {
    if (this.hasItem(id)) return false;
    this.s.items.push(id); this.emit('item', { id, item: ITEMS[id] }); return true;
  }
  removeItem(id) { this.s.items = this.s.items.filter((i) => i !== id); }
  markOnce(k) { this.s.once[k] = true; }
  log(text) { if (text && !this.s.log.includes(text)) this.s.log.push(text); }

  // يطبّق كائن تأثيرات من بيانات الحوار
  apply(fx) {
    if (!fx) return;
    if (typeof fx === 'function') { fx(this); return; }
    if (fx.trust) for (const [id, d] of Object.entries(fx.trust)) this.addTrust(id, d);
    if (fx.rep) for (const [a, d] of Object.entries(fx.rep)) this.addRep(a, d);
    if (fx.flag) for (const [k, v] of Object.entries(fx.flag)) this.setFlag(k, v);
    if (fx.clue) this.giveClue(fx.clue);
    if (fx.item) this.giveItem(fx.item);
    if (fx.log) this.log(fx.log);
    if (fx.event) this.emit(fx.event, fx);
    if (fx.ending) this.finish(fx.ending);
  }

  finish(id) {
    if (this.s.ending) return;
    const e = ENDINGS[id];
    this.trust0Snapshot = { ...this.s.trust };
    this.rep0Snapshot = { ...this.s.rep };
    e.apply(this);
    this.s.ending = id;
    this.emit('ending', { id, ending: e });
  }

  // ملخص النتائج لشاشة النهاية
  summary() {
    const e = this.s.ending && ENDINGS[this.s.ending];
    return {
      ending: this.s.ending, title: e?.title, tag: e?.tag, epilogue: e ? e.epilogue(this) : [],
      trust: Object.entries(TRUST_META).map(([id, m]) => ({ id, name: m.name, from: this.trust0[id], to: this.s.trust[id] })),
      rep: Object.entries(REP_META).map(([id, m]) => ({ id, name: m.name, from: this.rep0[id], to: this.s.rep[id] })),
      decisions: [...this.s.log],
      cluesFound: this.s.clues.length,
    };
  }

  serialize() { return JSON.parse(JSON.stringify({ s: this.s, trust0: this.trust0, rep0: this.rep0 })); }
  load(d) {
    this.s = d.s; this.trust0 = d.trust0; this.rep0 = d.rep0;
    this.emit('loaded');
  }
}
