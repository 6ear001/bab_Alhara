// مولّد الشخصيات (نماذج مؤقتة مجسَّمة بالأشكال الأساسية)
// الواجهة العامة ثابتة ليسهل استبدال الداخل بنموذج glTF بهيكل عظمي وBlend Shapes:
//   update(dt,t) · setExpression(name) · setViseme(open,wide) · setTalking(0..1)
//   lookAt(Vector3|null) · setSit(bool) · moveSpeed · root
import * as THREE from 'three';
import { clamp, lerp } from './config.js';

const PI = Math.PI;

export const EXPRESSIONS = {
  neutral:    { brow: 0,     browY: 0,      smile: 0,    lids: 1,    tilt: 0 },
  worried:    { brow: 0.45,  browY: 0.004,  smile: -0.3, lids: 1,    tilt: 0.06 },
  angry:      { brow: -0.55, browY: -0.006, smile: -0.5, lids: 0.7,  tilt: 0 },
  sad:        { brow: 0.55,  browY: -0.002, smile: -0.7, lids: 0.75, tilt: -0.1 },
  smile:      { brow: 0.05,  browY: 0.004,  smile: 0.85, lids: 0.85, tilt: 0 },
  suspicious: { brow: -0.25, browY: 0.0,    smile: -0.1, lids: 0.55, tilt: 0.04 },
  surprised:  { brow: 0.1,   browY: 0.014,  smile: 0.0,  lids: 1.2,  tilt: 0 },
  thinking:   { brow: 0.2,   browY: 0.006,  smile: -0.05, lids: 0.9, tilt: 0.1 },
};

const geoCache = new Map();
function G(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

function stdMat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: false });
}

export class Character {
  constructor(spec) {
    this.spec = spec;
    this.id = spec.id;
    this.root = new THREE.Group();
    this.root.name = 'char_' + spec.id;
    this.moveSpeed = 0;
    this.phase = Math.random() * 6;
    this.talking = 0;
    this._talkTarget = 0;
    this.sit = false;
    this._sitBlend = 0;
    this.exprName = 'neutral';
    this.expr = { ...EXPRESSIONS.neutral };
    this._lookTarget = null;
    this._headYaw = 0; this._headPitch = 0;
    this.mouthOpen = 0; this.mouthWide = 0; this._mo = 0; this._mw = 0;
    this._blink = 2 + Math.random() * 3; this._blinkT = 0;
    this._noise = Math.random() * 100;
    this.scale = spec.scale ?? 1;
    this._build();
  }

  _build() {
    const s = this.spec;
    const skin = stdMat(s.skin || '#d9a67e', { rough: 0.55 });
    const lip = stdMat(s.lip || '#a8584a', { rough: 0.5 });
    const dark = stdMat('#1a120c', { rough: 0.5 });
    const white = stdMat('#f1ece2', { rough: 0.35 });
    const hairMat = stdMat(s.hair || '#2a211b', { rough: 0.7 });
    const shirt = stdMat(s.shirt || '#e8dfcc');
    const vest = stdMat(s.vest || '#2f4a3a');
    const pants = stdMat(s.pants || '#33302d');
    const robe = stdMat(s.robe || '#6e5c46');
    const shoe = stdMat('#2a1a10', { rough: 0.7 });
    const sash = stdMat(s.sash || '#7a1f1f');
    this.mats = { skin, shirt, vest, pants, robe };

    const isRobe = s.outfit === 'qumbaz' || s.outfit === 'dress';
    const childK = s.child ? 1 : 0;
    this.isRobe = isRobe;

    const body = new THREE.Group(); this.body = body; this.root.add(body);
    const hips = new THREE.Group(); hips.position.y = 0.95; this.hips = hips; body.add(hips);
    this.hipBaseY = 0.95;

    // ── الساقان ──
    const legR = (isRobe ? 0.075 : 0.105);
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(side * 0.09, 0, 0); hips.add(thigh);
      const tg = G('thigh' + legR, () => new THREE.CylinderGeometry(legR, legR * 0.8, 0.46, 8).translate(0, -0.23, 0));
      this._m(tg, pants, thigh);
      const shin = new THREE.Group(); shin.position.y = -0.46; thigh.add(shin);
      const sg = G('shin' + legR, () => new THREE.CylinderGeometry(legR * 0.8, isRobe ? 0.05 : 0.06, 0.46, 8).translate(0, -0.23, 0));
      this._m(sg, pants, shin);
      const foot = new THREE.Group(); foot.position.y = -0.46; shin.add(foot);
      this._m(G('foot', () => new THREE.BoxGeometry(0.095, 0.07, 0.26).translate(0, -0.03, 0.07)), shoe, foot);
      this.legs.push({ thigh, shin, foot, side });
    }

    // ── الجذع ──
    const spine = new THREE.Group(); spine.position.y = 0.04; hips.add(spine); this.spine = spine;
    const torsoMat = isRobe ? robe : (s.vestless ? shirt : vest);
    const torso = this._m(G('torso', () => new THREE.CapsuleGeometry(0.178, 0.3, 6, 12)), torsoMat, spine);
    torso.position.y = 0.3; torso.scale.set(1.15, 1, 0.72); this.torso = torso;
    if (!isRobe && !s.vestless) {
      // ياقة القميص + أكمام
      const collar = this._m(G('collar', () => new THREE.TorusGeometry(0.06, 0.018, 6, 12)), shirt, spine, false);
      collar.position.set(0, 0.6, 0.02); collar.rotation.x = PI / 2.2;
    }
    if (s.sash) {
      const belt = this._m(G('belt', () => new THREE.TorusGeometry(0.178, 0.04, 8, 20)), sash, spine);
      belt.position.y = 0.18; belt.rotation.x = PI / 2; belt.scale.set(1.12, 0.76, 1.3);
    }
    if (isRobe) {
      // الثوب/القمباز: خط جانبي يدور
      const pts = [];
      const top = 0.1, bot = -0.88;
      for (let i = 8; i >= 0; i--) {      // من الأسفل للأعلى ليكون الاتجاه الخارجي صحيحاً
        const t = i / 8;
        pts.push(new THREE.Vector2(0.2 + t * t * 0.17 + (s.outfit === 'dress' ? t * 0.04 : 0), lerp(top, bot, t)));
      }
      const robeG = G('robe' + s.outfit, () => new THREE.LatheGeometry(pts, 18));
      const rb = this._m(robeG, robe, hips);
      rb.scale.set(1.0, 1, 0.82); this.robe = rb;
      if (s.apron) {
        const ap = this._m(G('apron', () => new THREE.CylinderGeometry(0.22, 0.28, 0.6, 12, 1, true, -0.6, 1.2)), stdMat(s.apron), hips);
        ap.position.set(0, -0.5, 0.06); ap.scale.set(1, 1, 1); ap.material.side = THREE.DoubleSide;
      }
    }

    // ── الذراعان ──
    const sleeve = isRobe ? robe : shirt;
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.53, 0); spine.add(sh);
      const ug = G('uarm' + isRobe, () => new THREE.CylinderGeometry(isRobe ? 0.055 : 0.045, isRobe ? 0.065 : 0.042, 0.28, 8).translate(0, -0.14, 0));
      this._m(ug, sleeve, sh);
      this._m(G('shoulder', () => new THREE.SphereGeometry(0.052, 8, 6)), torsoMat === robe ? robe : (s.vestless ? shirt : vest), sh, false);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      const fg = G('farm' + isRobe, () => new THREE.CylinderGeometry(isRobe ? 0.065 : 0.042, 0.034, 0.26, 8).translate(0, -0.13, 0));
      this._m(fg, sleeve, el);
      const hand = this._m(G('hand', () => new THREE.SphereGeometry(0.04, 8, 6)), skin, el, false);
      hand.position.y = -0.29; hand.scale.set(1, 1.35, 0.7);
      sh.rotation.z = side * 0.07;
      this.arms.push({ sh, el, side });
    }

    // ── الرقبة والرأس ──
    const neck = this._m(G('neck', () => new THREE.CylinderGeometry(0.05, 0.057, 0.1, 8)), skin, spine);
    neck.position.y = 0.65;
    const head = new THREE.Group(); head.position.y = 0.72; spine.add(head); this.head = head;
    const hs = s.child ? 1.22 : (s.headScale ?? 1.13);
    head.scale.setScalar(hs);
    const cranium = this._m(G('cranium', () => new THREE.SphereGeometry(0.115, 20, 16)), skin, head);
    cranium.position.y = 0.115; cranium.scale.set(0.92, 1.1, 1.0);
    const face = new THREE.Group(); head.add(face); this.face = face; this.detail = true;
    const jaw = this._m(G('jaw', () => new THREE.SphereGeometry(0.09, 16, 12)), skin, head);
    jaw.position.set(0, 0.04, 0.03); jaw.scale.set(1.0, 0.95, 0.95);
    for (const sd of [-1, 1]) {
      const ear = this._m(G('ear', () => new THREE.SphereGeometry(0.026, 8, 6)), skin, face, false);
      ear.position.set(sd * 0.103, 0.1, -0.005); ear.scale.set(0.5, 1, 0.8);
    }
    // أنف
    const nose = this._m(G('nose', () => new THREE.ConeGeometry(0.015, 0.032, 8)), skin, face, false);
    nose.position.set(0, 0.088, 0.117); nose.rotation.x = PI / 2.2; nose.scale.set(1, 1, 1);
    // العينان
    this.eyes = [];
    for (const sd of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(sd * 0.04, 0.125, 0.098); face.add(eg);
      const w = this._m(G('eyeW', () => new THREE.SphereGeometry(0.019, 10, 8)), white, eg, false);
      w.scale.set(1.1, 0.8, 0.55);
      const iris = this._m(G('iris', () => new THREE.SphereGeometry(0.0105, 8, 6)), stdMat(s.eye || '#2b1a10', { rough: 0.3 }), eg, false);
      iris.position.z = 0.007;
      const pupil = this._m(G('pupil', () => new THREE.SphereGeometry(0.005, 6, 4)), dark, eg, false);
      pupil.position.z = 0.012;
      // جفن علوي (يُغلق عند الرمش)
      const lid = this._m(G('lid', () => new THREE.SphereGeometry(0.0215, 10, 6, 0, PI * 2, 0, PI / 2)), skin, eg, false);
      lid.scale.set(1.1, 0.85, 0.6); lid.rotation.x = -0.1;
      this.eyes.push({ eg, lid, w, side: sd });
    }
    // الحاجبان
    this.brows = [];
    for (const sd of [-1, 1]) {
      const b = this._m(G('brow', () => new THREE.BoxGeometry(0.05, 0.011, 0.012)), stdMat(s.browColor || s.hair || '#2a211b'), face, false);
      b.position.set(sd * 0.044, 0.158, 0.103); b.rotation.x = -0.15;
      this.brows.push({ b, side: sd, baseY: 0.158 });
    }
    // الفم
    const mouth = new THREE.Group(); mouth.position.set(0, 0.042, 0.1); face.add(mouth); this.mouth = mouth;
    this.mouthCav = this._m(G('cav', () => new THREE.SphereGeometry(0.02, 10, 8)), stdMat('#2a0c0c', { rough: 0.6 }), mouth, false);
    this.mouthCav.scale.set(1.6, 0.05, 0.4);
    this.lipU = this._m(G('lipU', () => new THREE.SphereGeometry(0.018, 10, 6)), lip, mouth, false);
    this.lipD = this._m(G('lipD', () => new THREE.SphereGeometry(0.019, 10, 6)), lip, mouth, false);
    this.lipU.scale.set(1.7, 0.32, 0.55); this.lipD.scale.set(1.5, 0.36, 0.55);
    this.corners = [];
    for (const sd of [-1, 1]) {
      const c = this._m(G('corner', () => new THREE.SphereGeometry(0.006, 6, 4)), lip, mouth, false);
      c.position.set(sd * 0.032, 0, 0); this.corners.push(c);
    }
    // شارب/لحية
    if (s.mustache) {
      const mm = stdMat(s.mustacheColor || s.hair || '#2a211b', { rough: 0.8 });
      for (const sd of [-1, 1]) {
        const m = this._m(G('must', () => new THREE.CapsuleGeometry(0.0095, 0.05, 4, 8)), mm, head, false);
        m.position.set(sd * 0.026, 0.07, 0.113); m.rotation.z = PI / 2 + sd * 0.35; m.rotation.y = sd * 0.2;
        if (s.mustache === 'big') m.scale.set(1.3, 1.25, 1.3);
      }
    }
    if (s.beard) {
      const bm = stdMat(s.beardColor || '#b9b4ab', { rough: 0.9 });
      const bd = this._m(G('beard', () => new THREE.SphereGeometry(0.075, 12, 8, 0, PI * 2, PI * 0.45, PI * 0.55)), bm, head, false);
      bd.position.set(0, 0.07, 0.035); bd.scale.set(1.05, 0.9, 0.95);
    }
    // شعر
    if (s.hair && s.hairStyle !== 'none' && s.headwear !== 'scarf') {
      const hair = this._m(G('hair', () => new THREE.SphereGeometry(0.121, 16, 12, 0, PI * 2, 0, PI * 0.62)), hairMat, head, false);
      hair.position.set(0, 0.125, -0.012); hair.scale.set(0.93, 1.1, 1.0); hair.rotation.x = -0.28;
    }
    // غطاء الرأس
    if (s.headwear === 'tarboosh') {
      const tbMat = stdMat(s.hatColor || '#8e1b1b', { rough: 0.9 });
      const tb = this._m(G('tarboosh', () => new THREE.CylinderGeometry(0.074, 0.088, 0.125, 16)), tbMat, head, false);
      tb.position.set(0, 0.235, -0.004); tb.rotation.x = -0.12;
      const tassel = this._m(G('tassel', () => new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4)), dark, head, false);
      tassel.position.set(0, 0.275, -0.07); tassel.rotation.x = 0.7;
      const tb2 = this._m(G('tbknot', () => new THREE.SphereGeometry(0.01, 6, 4)), dark, head, false);
      tb2.position.set(0, 0.3, -0.04);
    } else if (s.headwear === 'scarf') {
      const sc = stdMat(s.scarf || '#f0eadb', { rough: 0.95 });
      const wrap = this._m(G('scarfW', () => new THREE.SphereGeometry(0.14, 18, 14)), sc, head, false);
      wrap.position.set(0, 0.115, -0.036); wrap.scale.set(1.0, 1.12, 1.0);
      const drape = this._m(G('drape', () => new THREE.CylinderGeometry(0.115, 0.19, 0.3, 14, 1, true)), sc, head, false);
      drape.position.set(0, -0.15, -0.075); drape.material.side = THREE.DoubleSide;
      // قطعة على الجبهة
      const fr = this._m(G('scarfF', () => new THREE.TorusGeometry(0.098, 0.014, 6, 16, PI)), sc, head, false);
      fr.position.set(0, 0.145, 0.02); fr.rotation.set(0.15, 0, 0);
    } else if (s.headwear === 'cap') {
      const cap = this._m(G('cap', () => new THREE.SphereGeometry(0.12, 14, 10, 0, PI * 2, 0, PI * 0.5)), stdMat(s.hatColor || '#cfc7b4'), head, false);
      cap.position.set(0, 0.148, 0); cap.scale.set(0.96, 0.9, 1.02);
    }

    // الأحجام والجنس
    const k = this.scale * (s.child ? 0.66 : 1);
    this.root.scale.setScalar(k);
    this.hipBaseYScaled = this.hipBaseY;
    if (s.heightK) body.scale.y = s.heightK;
    this.setExpression('neutral', true);
  }

  _m(geo, mat, parent, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true;       // الأجزاء الصغيرة لا تُلقي ظلاً (توفير استدعاءات الرسم)
    parent.add(m);
    return m;
  }

  setExpression(name, instant = false) {
    this.exprName = name in EXPRESSIONS ? name : 'neutral';
    this._exprTarget = EXPRESSIONS[this.exprName];
    if (instant) this.expr = { ...this._exprTarget };
  }
  setViseme(open, wide = 0) { this.mouthOpen = open; this.mouthWide = wide; }
  setTalking(v) { this._talkTarget = v; }
  // تفاصيل الوجه (عيون/حواجب/فم/أنف) تُخفى عن بعد لتقليل استدعاءات الرسم
  setDetail(on) { if (this.detail !== on) { this.detail = on; this.face.visible = on; } }
  setSit(v) { this.sit = v; }
  lookAt(v) { this._lookTarget = v; }

  update(dt, t) {
    this._noise += dt;
    const n = this._noise;
    // تعبير الوجه
    const et = this._exprTarget, e = this.expr, k = Math.min(1, dt * 6);
    for (const key of Object.keys(et)) e[key] += (et[key] - e[key]) * k;
    // فم
    this._mo += (this.mouthOpen - this._mo) * Math.min(1, dt * 22);
    this._mw += (this.mouthWide - this._mw) * Math.min(1, dt * 18);
    const open = clamp(this._mo, 0, 1), wide = this._mw;
    this.mouthCav.scale.set(1.6 + wide * 0.5 - open * 0.3, 0.05 + open * 0.85, 0.4);
    this.lipU.position.y = 0.002 + open * 0.008; this.lipD.position.y = -0.002 - open * 0.026;
    this.lipU.scale.x = 1.7 + wide * 0.4 - open * 0.3; this.lipD.scale.x = 1.5 + wide * 0.4 - open * 0.3;
    for (const [i, c] of this.corners.entries()) {
      const sd = i === 0 ? -1 : 1;
      c.position.x = sd * (0.032 + wide * 0.006 - open * 0.004);
      c.position.y = e.smile * 0.01 - open * 0.006;
    }
    // حواجب
    for (const br of this.brows) {
      br.b.rotation.z = -br.side * e.brow * 0.5;
      br.b.position.y = br.baseY + e.browY + (br.side > 0 && this.exprName === 'suspicious' ? 0.012 : 0);
    }
    // رمش وجفون
    this._blink -= dt;
    if (this._blink <= 0) { this._blinkT = 0.14; this._blink = 2.4 + Math.random() * 3.5; }
    this._blinkT = Math.max(0, this._blinkT - dt);
    const blinkK = this._blinkT > 0 ? 1 - Math.sin((this._blinkT / 0.14) * PI) : 1;
    for (const ey of this.eyes) {
      const open_ = clamp(e.lids * blinkK, 0.05, 1.25);
      ey.lid.scale.y = 0.85 * (1.15 - open_ * 0.85 + 0.05) ;
      ey.lid.position.y = lerp(-0.012, 0.004, open_ > 1 ? 1 : open_);
      ey.lid.rotation.x = -0.1 + (1 - open_) * 0.9;
      ey.lid.visible = open_ < 1.08;
    }

    // حركة الجسم
    const sp = this.moveSpeed;
    const walk = clamp(sp / 1.5, 0, 1.7);
    this.phase += sp * dt * 3.4;
    const p = this.phase;
    const A = (this.isRobe ? 0.36 : 0.55) * Math.min(walk, 1.15);
    const B = (this.isRobe ? 0.7 : 1.0) * Math.min(walk, 1.2);
    this._sitBlend += ((this.sit ? 1 : 0) - this._sitBlend) * Math.min(1, dt * 6);
    const sb = this._sitBlend;
    for (const lg of this.legs) {
      const lf = lg.side < 0 ? 1 : -1;
      const walkTh = -Math.sin(p) * A * lf;          // سالب = للأمام
      const walkSh = Math.max(0, lf * Math.cos(p)) * B * 0.9;
      lg.thigh.rotation.x = lerp(walkTh, -1.5, sb);
      lg.shin.rotation.x = lerp(walkSh, 1.5, sb);
      lg.foot.rotation.x = lerp(0, -0.1, sb);
    }
    this.hips.position.y = lerp(this.hipBaseY + Math.abs(Math.sin(p)) * 0.03 * walk, 0.5 + 0.03, sb);
    this.body.position.z = lerp(0, -0.1, sb);
    this.spine.rotation.x = lerp(Math.sin(n * 1.2) * 0.008 + (walk > 0.3 ? 0.04 : 0), 0.12, sb);
    this.spine.rotation.y = Math.sin(p) * 0.08 * walk;
    this.torso.scale.y = 1 + Math.sin(n * 1.6) * 0.012;
    if (this.robe) this.robe.rotation.x = Math.sin(p) * 0.05 * walk;

    // إيماءات الحديث
    this.talking += (this._talkTarget - this.talking) * Math.min(1, dt * 5);
    const g = this.talking;
    for (const ar of this.arms) {
      const lf = ar.side < 0 ? 1 : -1;
      let sx = Math.sin(p) * 0.55 * walk * lf;
      let ex = -0.12 - walk * 0.35 * Math.max(0, -sx);
      let sz = ar.side * 0.07;
      // حديث: الذراع اليمنى (ar.side>0) تتحرك أكثر
      if (g > 0.01) {
        const gest = ar.side > 0 ? 1 : 0.35;
        const w = (Math.sin(n * 2.3) * 0.5 + 0.5) * 0.6 + (Math.sin(n * 3.7 + 1) * 0.5 + 0.5) * 0.4;
        sx = lerp(sx, -0.55 - w * 0.7 * gest, g * (ar.side > 0 ? 0.9 : 0.4));
        ex = lerp(ex, -1.0 - w * 0.5 * gest, g * (ar.side > 0 ? 0.9 : 0.4));
        sz = lerp(sz, ar.side * (0.2 + w * 0.25), g);
      }
      // جلوس: اليدان على الركبتين/الطاولة
      sx = lerp(sx, -0.5, sb); ex = lerp(ex, -0.95, sb);
      ar.sh.rotation.x = sx; ar.el.rotation.x = ex; ar.sh.rotation.z = sz;
    }

    // الرأس ينظر إلى الهدف
    let ty = 0, tp = 0;
    if (this._lookTarget) {
      const inv = new THREE.Vector3();
      this.head.getWorldPosition(inv);
      const d = this._lookTarget.clone().sub(inv);
      const local = d.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()).invert());
      ty = clamp(Math.atan2(local.x, local.z), -1.0, 1.0);
      tp = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.45, 0.45);
    }
    const nod = g * Math.sin(n * 3.1) * 0.05;
    this._headYaw += (ty - this._headYaw) * Math.min(1, dt * 5);
    this._headPitch += (tp - this._headPitch) * Math.min(1, dt * 5);
    this.head.rotation.set(this._headPitch * 0.7 + nod + e.tilt * 0.5, this._headYaw * 0.8, e.tilt * 0.4 + Math.sin(n * 0.7) * 0.01);
    this.spine.rotation.y += this._headYaw * 0.12;
    // العينان تتبعان بحدة أكبر
    for (const ey of this.eyes) ey.eg.rotation.y = clamp(this._headYaw * 0.25, -0.2, 0.2);
  }

  // موضع الرأس في العالم (للكاميرا والتحديق)
  headWorld(out = new THREE.Vector3()) { this.head.getWorldPosition(out); out.y += 0.05; return out; }
}
