// بناء الحارة: الساحة، البحرة، المقهى، الدكان، باب الحارة، الزقاق الغربي
// كل المجسمات مولَّدة برمجياً ثم تُدمج حسب الخامة لتقليل استدعاءات الرسم.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, clamp, lerp } from './config.js';
import { makeGlow, makeSign } from './textures.js';

const PI = Math.PI;

function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
  }
  return g;
}
function planeGeo(w, d, tile = 2) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  return g;
}
function archShape(w, h) {
  const r = w / 2, s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - r);
  s.absarc(0, h - r, r, 0, PI, false); s.lineTo(-w / 2, 0);
  return s;
}
function archGeo(w, h, depth) {
  return new THREE.ExtrudeGeometry(archShape(w, h), { depth, bevelEnabled: false, curveSegments: 14 });
}

export class World {
  constructor(scene, tex, quality) {
    this.scene = scene; this.tex = tex; this.quality = quality;
    this.colliders = [];          // مستطيلات الاصطدام {x0,x1,z0,z1}
    this.statics = new THREE.Group();   // يُدمج لاحقاً
    this.dynamicGroup = new THREE.Group();
    this.lanterns = [];
    this.windowMats = [];
    this.clothLines = [];
    this.trees = [];
    this.layout = {};
    this.rng = mulberry32(1337);
    scene.add(this.statics, this.dynamicGroup);
    this._mats();
  }

  // ───────── الخامات ─────────
  _mats() {
    const t = this.tex;
    const std = (set, o = {}) => new THREE.MeshStandardMaterial({ map: set.map, bumpMap: set.bump, bumpScale: o.bump ?? 2.2, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0, color: o.color ?? 0xffffff });
    this.M = {
      cobble: std(t.cobble, { bump: 4, rough: 0.88, color: 0xb0a490 }),
      ablaq: std(t.ablaq, { bump: 3, rough: 0.85, color: 0xd8d0c0 }),
      plaster: std(t.plaster, { bump: 1.6, color: 0xd9c8aa }),
      plasterWarm: std(t.plasterWarm, { bump: 1.6, color: 0xd9c0a0 }),
      plasterLight: std(t.plasterLight, { bump: 1.6, color: 0xd0c2a6 }),
      wood: std(t.wood, { bump: 1.5, rough: 0.7 }),
      woodDark: std(t.woodDark, { bump: 1.5, rough: 0.7 }),
      flag: std(t.flag, { bump: 3, rough: 0.8, color: 0xb8aa94 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.85, roughness: 0.5 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb8893a, metalness: 0.9, roughness: 0.32 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x75654d, roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x2d4f1c, roughness: 0.85 }),
      leaf2: new THREE.MeshStandardMaterial({ color: 0x41682a, roughness: 0.85 }),
      terracotta: new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.85 }),
      glassOn: new THREE.MeshStandardMaterial({ color: 0x20180e, emissive: 0xffa84a, emissiveIntensity: 0, roughness: 0.3 }),
      glassOff: new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.2, metalness: 0.2 }),
      straw: new THREE.MeshStandardMaterial({ color: 0xc9a85c, roughness: 0.95 }),
      tea: new THREE.MeshStandardMaterial({ color: 0xb85a14, roughness: 0.2, transparent: true, opacity: 0.9 }),
      dirt: new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.9 }),
    };
    this.windowMats = [this.M.glassOn];
    this.cloth = (hex) => {
      this._clothCache ??= {};
      return (this._clothCache[hex] ??= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, side: THREE.DoubleSide, map: t.cloth.map ?? null }));
    };
    this.fruit = (hex) => {
      this._fruitCache ??= {};
      return (this._fruitCache[hex] ??= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 }));
    };
  }

  // ───────── أدوات ─────────
  mk(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true;
    (parent || this.statics).add(m);
    return m;
  }
  box(w, h, d, mat, x, y, z, parent, tile = 2, ry = 0) {
    return this.mk(boxGeo(w, h, d, tile), mat, parent, x, y, z, 0, ry, 0);
  }
  collide(x0, z0, x1, z1) {
    this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  }
  group(x, y, z, ry = 0, parent) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    (parent || this.statics).add(g); return g;
  }
  // إطار محلي على وجه مبنى: +x يمين الناظر، +z للخارج
  faceFrame(b, face, u, y) {
    switch (face) {
      case 'S': return this.group(b.x0 + u, y, b.z1, 0);
      case 'N': return this.group(b.x1 - u, y, b.z0, PI);
      case 'E': return this.group(b.x1, y, b.z1 - u, PI / 2);
      case 'W': return this.group(b.x0, y, b.z0 + u, -PI / 2);
    }
  }

  // ───────── عناصر الواجهة ─────────
  door(parent, x, w, h, opts = {}) {
    const M = this.M;
    const g = this.group(x, 0, 0, 0, parent);
    const frame = archGeo(w + 0.55, h + 0.4, 0.2);
    this.mk(frame, M.ablaq, g, 0, 0, 0);
    // فتحة الباب الداكنة خلف الورقة
    const leaf = archGeo(w, h, 0.1);
    this.mk(leaf, opts.mat || M.wood, g, 0, 0, 0.17);
    // عوارض أفقية وتسامير
    for (const yy of [0.5, h * 0.5, h - w / 2 - 0.15]) this.box(w - 0.1, 0.1, 0.05, M.woodDark, 0, yy, 0.3, g, 1);
    const stud = new THREE.SphereGeometry(0.04, 6, 4);
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 5; j++) this.mk(stud, M.iron, g, i * (w * 0.28), 0.4 + j * 0.42, 0.33, 0, 0, 0, { cast: false });
    // مقرعة نحاسية
    this.mk(new THREE.TorusGeometry(0.1, 0.018, 6, 14), M.brass, g, w * 0.2, 1.1, 0.35, 0, 0, 0, { cast: false });
    this.mk(new THREE.SphereGeometry(0.05, 8, 6), M.brass, g, w * 0.2, 1.22, 0.34, 0, 0, 0, { cast: false });
    // عتبة حجرية
    this.box(w + 0.7, 0.12, 0.5, M.ablaq, 0, 0.06, 0.25, g, 1);
    return g;
  }

  window(parent, x, y, w, h, opts = {}) {
    const M = this.M;
    const g = this.group(x, y, 0, 0, parent);
    const lit = opts.lit ?? this.rng() < 0.6;
    // إطار خشبي + زجاج
    this.box(w + 0.18, h + 0.18, 0.12, M.woodDark, 0, h / 2, 0.06, g, 1);
    this.box(w, h, 0.05, lit ? M.glassOn : M.glassOff, 0, h / 2, 0.12, g, 1);
    // قضبان
    if (opts.bars) {
      for (let i = -2; i <= 2; i++) this.box(0.025, h, 0.025, M.iron, i * (w / 5), h / 2, 0.18, g, 1);
    } else {
      this.box(0.04, h, 0.04, M.woodDark, 0, h / 2, 0.15, g, 1);
      this.box(w, 0.04, 0.04, M.woodDark, 0, h / 2, 0.15, g, 1);
    }
    // مصراعان
    if (opts.shutters !== false) {
      const col = opts.shutMat || M.woodDark;
      const a = this.rng() < 0.5 ? 0.9 : 0.45;
      for (const s of [-1, 1]) {
        const leaf = this.group(s * (w / 2 + 0.09), 0, 0.1, s * a * (opts.open ? 1 : 0.15), g);
        this.box(w / 2, h, 0.04, col, -s * (w / 4), h / 2, 0.02, leaf, 1);
      }
    }
    // عتبة
    this.box(w + 0.4, 0.07, 0.3, M.ablaq, 0, -0.03, 0.12, g, 1);
    return g;
  }

  kabbara(parent, x, y, w, h, depth = 0.7) {
    // مشربية/كبّارة خشبية بارزة
    const M = this.M;
    const g = this.group(x, y, 0, 0, parent);
    this.box(w, h, depth, M.woodDark, 0, h / 2, depth / 2, g, 1);
    this.box(w + 0.2, 0.12, depth + 0.2, M.wood, 0, h + 0.06, depth / 2, g, 1);
    this.box(w + 0.2, 0.12, depth + 0.2, M.wood, 0, -0.06, depth / 2, g, 1);
    // نوافذ على ثلاث جهات
    const lit = this.rng() < 0.7;
    for (let i = -1; i <= 1; i++) this.box(w / 4, h * 0.55, 0.04, lit ? M.glassOn : M.glassOff, i * (w / 3.2), h * 0.5, depth + 0.02, g, 1);
    for (const s of [-1, 1]) this.box(0.04, h * 0.55, depth * 0.55, lit ? M.glassOn : M.glassOff, s * (w / 2 + 0.02), h * 0.5, depth * 0.5, g, 1);
    // دعامات قطرية
    for (const s of [-1, 1]) {
      const st = this.box(0.12, 0.12, depth + 0.5, M.wood, s * (w / 2 - 0.15), -0.35, depth / 2 - 0.1, g, 1);
      st.rotation.x = 0.55;
    }
    return g;
  }

  // ───────── المباني ─────────
  building(b) {
    const M = this.M;
    const h = b.h ?? 7.4, yg = b.yg ?? 3.5;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const mat = b.mat || M.plaster;
    this.box(w, h, d, mat, (b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2, null, 2.4);
    // سقف + حواجز
    this.box(w + 0.1, 0.15, d + 0.1, M.roof, (b.x0 + b.x1) / 2, h + 0.07, (b.z0 + b.z1) / 2);
    for (const [px, pz, pw, pd] of [
      [(b.x0 + b.x1) / 2, b.z0 + 0.1, w, 0.2], [(b.x0 + b.x1) / 2, b.z1 - 0.1, w, 0.2],
      [b.x0 + 0.1, (b.z0 + b.z1) / 2, 0.2, d], [b.x1 - 0.1, (b.z0 + b.z1) / 2, 0.2, d]]) {
      this.box(pw, 0.55, pd, mat, px, h + 0.4, pz, null, 2.4);
    }
    if (!b.noCollide) this.collide(b.x0, b.z0, b.x1, b.z1);
    const hasTank = this.rng() < 0.45;
    if (hasTank) {
      const tx = lerp(b.x0 + 1, b.x1 - 1, this.rng()), tz = lerp(b.z0 + 1, b.z1 - 1, this.rng());
      this.mk(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14), M.iron, null, tx, h + 0.8, tz);
    }
    for (const face of Object.keys(b.faces || {})) this._facade(b, face, b.faces[face], h, yg);
    return b;
  }

  _facade(b, face, f, h, yg) {
    const M = this.M;
    const len = face === 'S' || face === 'N' ? b.x1 - b.x0 : b.z1 - b.z0;
    const over = f.overhang ?? 0;
    const root = this.faceFrame(b, face, 0, 0);
    const mat = b.mat || M.plaster;
    // قاعدة أبلق
    if (f.plinth !== false) this.box(len + 0.02, 1.15, 0.12, M.ablaq, len / 2, 0.575, 0.06, root, 1.2);
    // حزام خشبي تحت الطابق العلوي
    this.box(len, 0.18, 0.1, M.wood, len / 2, yg - 0.1, 0.05, root, 1);
    if (over > 0) {
      this.box(len, h - yg, over, mat, len / 2, (yg + h) / 2 - 0.02, over / 2, root, 2.4);
      this.box(len + 0.05, 0.2, over + 0.08, M.wood, len / 2, yg - 0.1, over / 2 + 0.02, root, 1);
      const n = Math.max(2, Math.floor(len / 1.1));
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * len;
        this.box(0.14, 0.22, over + 0.05, M.woodDark, u, yg - 0.32, over / 2, root, 1);
        const st = this.box(0.1, 0.1, over + 0.5, M.wood, u, yg - 0.62, over / 2 - 0.12, root, 1);
        st.rotation.x = 0.55;
      }
    }
    // أبواب
    const doors = f.doors || [];
    for (const dr of doors) this.door(root, dr.u, dr.w ?? 1.5, dr.h ?? 2.6, dr);
    // نوافذ سفلية ذات قضبان
    if (f.groundWindows !== false) {
      const n = Math.max(0, Math.floor(len / 3.4));
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) * len) / n;
        if (doors.some((d) => Math.abs(d.u - u) < 1.7)) continue;
        if ((f.skip || []).some((s) => Math.abs(s - u) < 1.5)) continue;
        this.window(root, u, 1.7, 0.8, 0.9, { bars: true, shutters: false, lit: this.rng() < 0.4 });
      }
    }
    // طابق علوي: نوافذ + كبّارات
    const kab = f.kabbara || [];
    for (const u of kab) this.kabbara(root, u, yg + 0.5, 2.0, 2.0, 0.65 + over);
    const nUp = Math.max(1, Math.floor(len / 2.8));
    for (let i = 0; i < nUp; i++) {
      const u = ((i + 0.5) * len) / nUp;
      if (kab.some((k) => Math.abs(k - u) < 1.9)) continue;
      const wg = this.group(u, 0, over, 0, root);
      this.window(wg, 0, yg + 0.7, 0.95, 1.5, { open: this.rng() < 0.35 });
    }
    // مصباح
    if (f.lanterns) for (const lu of f.lanterns) this.lantern(root, lu, 3.0, 0.5, { bracket: true });
    return root;
  }

  // ───────── الفوانيس ─────────
  lantern(parent, x, y, z, opts = {}) {
    const M = this.M;
    const g = this.group(x, y, z, 0, parent);
    if (opts.bracket) {
      this.box(0.05, 0.05, 0.5, M.iron, 0, 0.3, -0.25, g, 1);
      this.box(0.05, 0.35, 0.05, M.iron, 0, 0.12, 0, g, 1);
    }
    // جسم الفانوس
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1c0d, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.28, 8), bodyMat);
    body.position.y = -0.1; g.add(body);
    this.mk(new THREE.ConeGeometry(0.15, 0.12, 8), M.iron, g, 0, 0.1, 0, 0, 0, 0, { cast: false });
    this.mk(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8), M.iron, g, 0, -0.26, 0, 0, 0, 0, { cast: false });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex ??= makeGlow(128, 'rgba(255,190,100,1)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(2.2); glow.position.y = -0.1; g.add(glow);
    const L = { group: g, body, bodyMat, glow, light: null, lit: 0, phase: this.rng() * 10, priority: opts.priority ?? 0 };
    this.lanterns.push(L);
    g.userData.lantern = L;
    // لا يُدمج الجسم والتوهّج (ديناميكي)
    body.userData.dynamic = true; glow.userData.dynamic = true;
    return L;
  }

  // ───────── دعامات ─────────
  table(x, z, ry = 0) {
    const M = this.M, g = this.group(x, 0, z, ry);
    this.mk(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), M.brass, g, 0, 0.72, 0);
    this.mk(new THREE.CylinderGeometry(0.4, 0.38, 0.06, 20), M.woodDark, g, 0, 0.68, 0);
    this.mk(new THREE.CylinderGeometry(0.04, 0.06, 0.66, 8), M.woodDark, g, 0, 0.33, 0);
    this.mk(new THREE.CylinderGeometry(0.22, 0.26, 0.04, 14), M.woodDark, g, 0, 0.02, 0);
    this.collide(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
    return g;
  }
  stool(x, z, ry = 0) {
    const M = this.M, g = this.group(x, 0, z, ry);
    this.mk(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), M.straw, g, 0, 0.46, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      const leg = this.mk(new THREE.CylinderGeometry(0.02, 0.025, 0.46, 5), M.woodDark, g, Math.cos(a) * 0.14, 0.23, Math.sin(a) * 0.14);
      leg.rotation.z = Math.cos(a) * 0.08; leg.rotation.x = -Math.sin(a) * 0.08;
    }
    return g;
  }
  teaSet(parent, x, y, z) {
    const M = this.M;
    for (let i = 0; i < 2; i++) this.mk(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 8), M.tea, parent, x + i * 0.12 - 0.06, y + 0.04, z + 0.06, 0, 0, 0, { cast: false });
    this.mk(new THREE.SphereGeometry(0.07, 10, 8), M.brass, parent, x, y + 0.08, z - 0.08, 0, 0, 0, { cast: false });
  }
  crate(x, z, fruit, ry = 0) {
    const M = this.M, g = this.group(x, 0, z, ry);
    this.box(0.8, 0.3, 0.55, M.wood, 0, 0.15, 0, g, 1);
    const sp = new THREE.SphereGeometry(0.075, 8, 6);
    const rng = this.rng;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      this.mk(sp, this.fruit(fruit), g, -0.28 + i * 0.19, 0.34, -0.15 + j * 0.15 + (rng() - 0.5) * 0.03, 0, 0, 0, { cast: false });
    }
    this.collide(x - 0.45, z - 0.35, x + 0.45, z + 0.35);
    return g;
  }
  sack(x, z, s = 1) {
    const M = this.M, g = this.group(x, 0, z, this.rng() * PI);
    const m = this.mk(new THREE.SphereGeometry(0.3 * s, 10, 8), M.straw, g, 0, 0.26 * s, 0);
    m.scale.set(1, 1.1, 0.8);
    this.collide(x - 0.3, z - 0.28, x + 0.3, z + 0.28);
  }
  jar(x, z, s = 1, mat) {
    const g = this.group(x, 0, z, 0);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.15 + Math.sin(Math.pow(t, 0.8) * PI) * 0.2 + (t > 0.85 ? -0.06 : 0), t * 0.9));
    }
    const geo = new THREE.LatheGeometry(pts, 14);
    geo.scale(s, s, s);
    this.mk(geo, mat || this.M.terracotta, g, 0, 0, 0);
    this.collide(x - 0.28 * s, z - 0.28 * s, x + 0.28 * s, z + 0.28 * s);
  }
  planter(x, z, s = 1) {
    const M = this.M;
    const g = this.group(x, 0, z, 0);
    this.box(1.6 * s, 0.6, 1.6 * s, M.ablaq, 0, 0.3, 0, g, 1.2);
    this.box(1.4 * s, 0.06, 1.4 * s, M.dirt, 0, 0.62, 0, g, 1);
    this.collide(x - 0.8 * s, z - 0.8 * s, x + 0.8 * s, z + 0.8 * s);
    return g;
  }
  tree(x, z, s = 1) {
    const M = this.M, g = this.group(x, 0.6, z, 0);
    const trunk = this.mk(new THREE.CylinderGeometry(0.08 * s, 0.14 * s, 1.8 * s, 7), M.woodDark, g, 0, 0.9 * s, 0);
    trunk.rotation.z = 0.05;
    const rng = this.rng;
    const blob = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 9; i++) {
      const r = (0.55 + rng() * 0.45) * s;
      const m = this.mk(blob, i % 2 ? M.leaf : M.leaf2, g, (rng() - 0.5) * 1.5 * s, (1.9 + rng() * 1.1) * s, (rng() - 0.5) * 1.5 * s);
      m.scale.setScalar(r);
    }
    // ثمار النارنج
    const orange = new THREE.SphereGeometry(0.07 * s, 6, 5);
    for (let i = 0; i < 14; i++) this.mk(orange, this.fruit(0xe58a10), g, (rng() - 0.5) * 2 * s, (1.7 + rng() * 1.3) * s, (rng() - 0.5) * 2 * s, 0, 0, 0, { cast: false });
    this.trees.push(g);
    return g;
  }
  bench(x, z, len, ry = 0) {
    const M = this.M, g = this.group(x, 0, z, ry);
    this.box(len, 0.1, 0.5, M.wood, 0, 0.5, 0, g, 1);
    for (const s of [-1, 1]) this.box(0.1, 0.5, 0.45, M.ablaq, s * (len / 2 - 0.15), 0.25, 0, g, 1);
    const c = Math.cos(ry), s2 = Math.sin(ry);
    const hx = Math.abs(c) * len / 2 + Math.abs(s2) * 0.25, hz = Math.abs(s2) * len / 2 + Math.abs(c) * 0.25;
    this.collide(x - hx, z - hz, x + hx, z + hz);
    return g;
  }
  clothLine(a, b, colors) {
    const rng = this.rng;
    const g = new THREE.Group();
    // خيط
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 3), this.M.iron);
    line.position.copy(a).addScaledVector(dir, 0.5);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    line.castShadow = false;
    g.add(line);
    const n = Math.floor(len / 0.9);
    for (let i = 1; i <= n; i++) {
      const p = new THREE.Vector3().lerpVectors(a, b, i / (n + 1));
      p.y -= Math.sin((i / (n + 1)) * PI) * 0.12;
      const cw = 0.45 + rng() * 0.3, ch = 0.6 + rng() * 0.45;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch, 4, 3), this.cloth(colors[(rng() * colors.length) | 0]));
      cloth.position.set(p.x, p.y - ch / 2, p.z);
      cloth.rotation.y = Math.atan2(dir.x, dir.z) + PI / 2;
      cloth.castShadow = true;
      cloth.userData.dynamic = true; cloth.userData.sway = rng() * 10;
      g.add(cloth);
      this.clothLines.push(cloth);
    }
    this.dynamicGroup.add(g);
  }

  // ───────── بناء الحارة كاملة ─────────
  build() {
    const M = this.M, T = this.tex, rng = this.rng;
    const L = this.layout;

    // أرضية: حجارة مرصوفة
    this.mk(planeGeo(110, 80, 2.2), M.cobble, null, -4, 0, 0, 0, 0, 0, { cast: false });
    // طريق خارج البوابة (ترابي)
    this.mk(planeGeo(9, 70, 3), M.dirt, null, 0, 0.005, 52, 0, 0, 0, { cast: false });

    // ── المقهى ──
    this._cafe();
    // ── المباني ──
    this.building({ x0: -14, x1: -10, z0: -22, z1: -10, mat: M.plasterWarm, faces: { S: { overhang: 0.5, doors: [{ u: 2, w: 1.3 }], groundWindows: false, kabbara: [] } } });
    this.building({ x0: 6, x1: 14, z0: -22, z1: -10, mat: M.plasterLight, faces: { S: { overhang: 0.55, doors: [{ u: 4, w: 1.5 }], kabbara: [6.2], lanterns: [1.0] } } });
    this.building({ x0: 14, x1: 27, z0: -10, z1: -4, mat: M.plaster, faces: { W: { overhang: 0.5, doors: [{ u: 3, w: 1.4 }], kabbara: [] } } });
    this._shop();
    // بيت أم حسن
    this.building({ x0: 14, x1: 27, z0: 3, z1: 12, mat: M.plasterWarm, faces: { W: { overhang: 0.55, doors: [{ u: 4.5, w: 1.6, h: 2.8 }], kabbara: [7.3], lanterns: [3.4, 6.0], skip: [4.5] } } });
    // الجنوب: بيت وحراسة
    this.building({ x0: -14, x1: -4.5, z0: 12, z1: 22, mat: M.plaster, faces: { N: { overhang: 0.5, doors: [{ u: 5.8, w: 1.4 }], kabbara: [2.2] } } });
    this.building({ x0: 4.5, x1: 14, z0: 12, z1: 22, mat: M.plasterLight, faces: { N: { overhang: 0.5, doors: [{ u: 2.5, w: 1.5 }], kabbara: [6.8], lanterns: [4.3] } } });
    // الغرب: الزقاق
    this.building({ x0: -34, x1: -14, z0: -14, z1: -6, mat: M.plasterWarm, faces: { E: { overhang: 0.5, doors: [{ u: 5.0, w: 1.4 }], kabbara: [2.0] }, S: { overhang: 0.7, doors: [{ u: 3.2, w: 1.3 }, { u: 12.4, w: 1.3 }], kabbara: [7.6, 16.5], lanterns: [9.2] } } });
    this.building({ x0: -34, x1: -14, z0: -2, z1: 12, mat: M.plaster, faces: { E: { overhang: 0.55, doors: [{ u: 3.0, w: 1.6, h: 2.8 }], kabbara: [11.2], skip: [], lanterns: [1.0] }, N: { overhang: 0.7, doors: [{ u: 5.2, w: 1.3 }, { u: 14.5, w: 1.3 }], kabbara: [9.5, 18.5], lanterns: [11.2] } } });
    // نهاية الزقاق
    this.building({ x0: -38, x1: -34, z0: -6, z1: -2, mat: M.plasterLight, noCollide: false, faces: { E: { overhang: 0.4, doors: [{ u: 2.0, w: 1.5, h: 2.7 }], groundWindows: false, lanterns: [0.6, 3.4] } } });

    this._gate();
    this._fountain();
    this._square();
    this._alley();
    this._backdrop();
    this._boundaries();

    // سقف الدمج
    this.mergeStatics();
    this.setupLights();
    return this;
  }

  _cafe() {
    const M = this.M;
    const x0 = -10, x1 = 6, z0 = -22, z1 = -10, yg = 3.6, h = 7.4;
    // أرضية
    this.box(x1 - x0, 0.15, z1 - z0, M.flag, (x0 + x1) / 2, 0.075, (z0 + z1) / 2, null, 2);
    this.box(15.6, 0.15, 4.6, M.flag, (x0 + x1) / 2, 0.075, -7.7, null, 2);
    // جدران خلفية وجانبية
    this.box(x1 - x0, h, 0.5, M.plaster, (x0 + x1) / 2, h / 2, z0 + 0.25, null, 2.4);
    this.box(0.5, h, z1 - z0, M.plaster, x0 + 0.25, h / 2, (z0 + z1) / 2, null, 2.4);
    this.box(0.5, h, z1 - z0, M.plaster, x1 - 0.25, h / 2, (z0 + z1) / 2, null, 2.4);
    // سقف الطابق الأرضي والطابق العلوي (واجهة)
    this.box(x1 - x0, 0.45, z1 - z0, M.woodDark, (x0 + x1) / 2, yg, (z0 + z1) / 2, null, 1.5);
    this.box(x1 - x0, h - yg, z1 - z0 - 0.3, M.plaster, (x0 + x1) / 2, (yg + h) / 2 + 0.2, (z0 + z1) / 2 - 0.15, null, 2.4);
    this.box(x1 - x0 + 0.1, 0.15, z1 - z0 + 0.1, M.roof, (x0 + x1) / 2, h + 0.07, (z0 + z1) / 2);
    this.box(x1 - x0, 0.6, 0.2, M.plaster, (x0 + x1) / 2, h + 0.4, z1 - 0.1, null, 2.4);
    // واجهة الطابق العلوي
    const b = { x0, x1, z0, z1 };
    const f = this.faceFrame(b, 'S', 0, 0);
    this.box(x1 - x0, 0.2, 0.7, M.wood, 8, yg - 0.1, 0.1, f, 1);
    const n = 15;
    for (let i = 0; i <= n; i++) this.box(0.15, 0.2, 0.8, M.woodDark, (i / n) * 16, yg - 0.3, 0.0, f, 1);
    this.box(16, h - yg, 0.7, M.plaster, 8, (yg + h) / 2 + 0.05, 0.3, f, 2.4);
    for (let i = 0; i < 5; i++) this.window(f, 1.6 + i * 3.2, yg + 0.8, 1.0, 1.5, { open: i % 2 === 0, lit: true });
    // أعمدة وأقواس أمامية
    for (const px of [-10 + 0.35, -6.2, -2.4, 1.4, 5.65]) {
      this.box(0.5, yg, 0.5, M.ablaq, px, yg / 2, -10.3, null, 1.2);
      this.box(0.65, 0.15, 0.65, M.wood, px, yg - 0.1, -10.3, null, 1);
    }
    // عارضة أمام العمود الأمامي
    this.box(16, 0.3, 0.35, M.woodDark, -2, yg - 0.2, -10.3, null, 1);
    // لافتة المقهى
    this.signs = this.signs || [];
    this.signs.push({ text: 'مقهى الحارة', pos: [-2, yg + 0.55, -9.5], w: 3.6, h: 0.9 });
    // الداخل: بار وطاولات
    this.box(7, 1.0, 0.8, M.woodDark, -3, 0.65, -18.3, null, 1);
    this.box(7.2, 0.08, 1.0, M.wood, -3, 1.18, -18.3, null, 1);
    this.collide(-6.6, -18.8, 0.6, -17.8);
    for (let i = 0; i < 3; i++) {
      this.box(5.5, 0.06, 0.35, M.wood, -3, 1.7 + i * 0.5, -21.6, null, 1);
      for (let j = 0; j < 7; j++) this.mk(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8), M.tea, null, -5.5 + j * 0.8, 1.76 + i * 0.5, -21.6, 0, 0, 0, { cast: false });
    }
    // مقعد داخلي
    this.bench(-8.8, -14.5, 3.4, PI / 2);
    this.bench(4.8, -14.5, 3.4, PI / 2);
    // البرجولة (عريشة) أمام المقهى
    const py = 3.2;
    for (const px of [-9.3, -5.2, -1.1, 3.0, 5.2]) this.box(0.18, py, 0.18, M.woodDark, px, py / 2, -5.7, null, 1);
    for (let i = 0; i < 9; i++) this.box(0.1, 0.12, 4.7, M.woodDark, -9.3 + i * 1.75, py, -8.0, null, 1);
    for (let i = 0; i < 4; i++) this.box(14.8, 0.1, 0.12, M.woodDark, -2, py + 0.09, -9.8 + i * 1.3, null, 1);
    // أوراق العنب على العريشة
    const blob = new THREE.IcosahedronGeometry(0.5, 1);
    for (let i = 0; i < 26; i++) {
      const m = this.mk(blob, i % 2 ? M.leaf : M.leaf2, null, -9 + this.rng() * 14.2, py + 0.25 + this.rng() * 0.15, -9.6 + this.rng() * 4.2);
      m.scale.set(0.7 + this.rng(), 0.22, 0.7 + this.rng() * 0.8);
    }
    // طاولات وكراسي على المصطبة
    const spots = [[-7.4, -8.3], [-4.6, -7.1], [-0.2, -7.0], [2.4, -8.4], [-2.5, -8.9]];
    for (const [tx, tz] of spots) {
      const t = this.table(tx, tz);
      this.teaSet(t, 0.05, 0.74, 0);
      for (let k = 0; k < 2; k++) {
        const a = k * PI + this.rng();
        this.stool(tx + Math.cos(a) * 0.75, tz + Math.sin(a) * 0.75, 0);
      }
    }
    this.L.cafeTables = spots;
    // جدار فاصل للمصطبة مع الساحة (درجة)
    this.box(15.6, 0.18, 0.4, M.ablaq, -2, 0.09, -5.4, null, 1.2);
    this.collide(-9.9, -22, -9.5, -10); this.collide(5.5, -22, 6, -10); this.collide(-10, -22, 6, -21.5);
  }
  get L() { return this.layout; }

  _shop() {
    const M = this.M;
    const x0 = 14, z0 = -4, z1 = 3, x1 = 27, yg = 3.4, h = 7;
    this.box(0.5, h, z1 - z0, M.plaster, x1 - 0.25, h / 2, (z0 + z1) / 2, null, 2.4);
    this.box(x1 - x0, h, 0.5, M.plaster, (x0 + x1) / 2, h / 2, z0 + 0.25, null, 2.4);
    this.box(x1 - x0, h, 0.5, M.plaster, (x0 + x1) / 2, h / 2, z1 - 0.25, null, 2.4);
    this.box(x1 - x0, 0.45, z1 - z0, M.woodDark, (x0 + x1) / 2, yg, (z0 + z1) / 2, null, 1.5);
    this.box(x1 - x0, h - yg, z1 - z0, M.plaster, (x0 + x1) / 2, (yg + h) / 2 + 0.2, (z0 + z1) / 2, null, 2.4);
    this.box(x1 - x0 + 0.1, 0.15, z1 - z0 + 0.1, M.roof, (x0 + x1) / 2, h + 0.07, (z0 + z1) / 2);
    this.box(x1 - x0, 0.15, z1 - z0, M.flag, (x0 + x1) / 2, 0.075, (z0 + z1) / 2, null, 2);
    // واجهة علوية
    const b = { x0, x1, z0, z1 };
    const f = this.faceFrame(b, 'W', 0, 0);
    this.box(z1 - z0, h - yg, 0.5, M.plaster, 3.5, (yg + h) / 2 + 0.2, 0.25, f, 2.4);
    this.box(z1 - z0, 0.2, 0.55, M.wood, 3.5, yg - 0.1, 0.25, f, 1);
    this.window(f, 1.8, yg + 0.8, 1.0, 1.5, { lit: true }); this.window(f, 5.2, yg + 0.8, 1.0, 1.5, { lit: false });
    // أعمدة حجرية للمدخل
    for (const u of [0.2, 6.8]) { const g = this.faceFrame(b, 'W', u, 0); this.box(0.5, yg, 0.5, M.ablaq, 0, yg / 2, 0.2, g, 1.2); }
    // رفوف داخلية وطاولة بيع
    for (let i = 0; i < 4; i++) this.box(0.3, 0.06, 6.3, M.wood, 26.2, 0.8 + i * 0.6, -0.5, null, 1);
    this.box(0.3, 3.2, 0.08, M.woodDark, 26.2, 1.6, -3.6, null, 1);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) this.mk(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), j % 2 ? M.terracotta : M.white, null, 25.95, 0.95 + i * 0.6, -3.4 + j * 0.7, 0, 0, 0, { cast: false });
    this.box(1.1, 1.0, 5.0, M.woodDark, 17.5, 0.5, -0.5, null, 1);
    this.box(1.3, 0.08, 5.2, M.wood, 17.5, 1.02, -0.5, null, 1);
    this.collide(16.9, -3.1, 18.1, 2.1);
    this.collide(26, -4, 27, 3);
    // بضاعة أمام الدكان
    const fruits = [0xc8302a, 0xe4a817, 0x7ba33a, 0xd2681e];
    this.crate(12.9, -2.9, fruits[0], 0.1); this.crate(12.9, -1.8, fruits[1], -0.1); this.crate(12.8, 1.4, fruits[2], 0.05);
    this.crate(12.2, -2.4, fruits[3], 0.2);
    this.sack(13.2, 2.4); this.sack(13.0, 2.9, 0.9); this.jar(13.0, -4.2, 1.2); this.jar(12.5, -4.5, 0.9);
    // مظلة قماشية مخططة
    this.mk(new THREE.BoxGeometry(2.8, 0.05, 7.4), this.cloth(0xb23a2a), null, 12.7, 3.0, -0.5, 0, 0, 0.14);
    for (let i = 0; i < 7; i++) this.mk(new THREE.BoxGeometry(2.8, 0.06, 0.55), this.cloth(0xe9dcc0), null, 12.7, 3.01, -3.5 + i * 1.0, 0, 0, 0.14, { cast: false });
    for (const pz of [-4.0, 3.0]) this.box(0.12, 2.9, 0.12, M.woodDark, 11.4, 1.45, pz, null, 1);
    this.signs = this.signs || [];
    this.signs.push({ text: 'بقالة الحارة', pos: [13.7, 3.05, -0.5], w: 3.0, h: 0.8, rotY: -PI / 2 });
    this.lantern(null, 13.4, 2.8, -4.1, { priority: 3 });
    this.layout.shop = { x: 15.8, z: -0.5 };
  }

  _gate() {
    const M = this.M;
    const w = 9, h = 7.2;
    // جدار البوابة مع فتحة مقوّسة
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 1, 0); shape.lineTo(w / 2 + 1, 0); shape.lineTo(w / 2 + 1, h + 1.5); shape.lineTo(-w / 2 - 1, h + 1.5);
    const hole = new THREE.Path();
    const hw = 3.3, hr = hw;
    hole.moveTo(-hw, 0); hole.lineTo(-hw, 4.2); hole.absarc(0, 4.2, hr, PI, 0, true); hole.lineTo(hw, 0); hole.lineTo(-hw, 0);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 20 });
    this.mk(geo, M.ablaq, null, 0, 0, 12, 0, 0, 0);
    // قنطرة من حجارة بيضاء حول الفتحة
    const arch = new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); s.absarc(0, 4.2, hr + 0.55, 0, PI, false); s.absarc(0, 4.2, hr, PI, 0, true); return s; })(), { depth: 4.1, bevelEnabled: false, curveSegments: 20 });
    this.mk(arch, M.plasterLight, null, 0, 0, 11.95);
    // ورقتا الباب مفتوحتان
    for (const s of [-1, 1]) {
      const pivot = this.group(s * 3.2, 0, 12.2, s * -1.25);
      const leaf = this.mk(archGeo(3.2, 6.2, 0.15), M.wood, pivot, -s * 1.6, 0, 0);
      for (let i = 0; i < 4; i++) this.box(3.0, 0.14, 0.06, M.iron, -s * 1.6, 0.8 + i * 1.3, 0.12, pivot, 1);
    }
    // سقف علوي وبرج مراقبة
    this.box(w + 2, 1.0, 4.2, M.ablaq, 0, h + 1.9, 14, null, 1.2);
    this.box(w + 2.4, 0.25, 4.6, M.roof, 0, h + 2.55, 14);
    this.signs = this.signs || [];
    this.signs.push({ text: 'باب الحارة', pos: [0, h - 0.2, 11.9], w: 4.8, h: 1.1, rotY: PI, big: true });
    // مصابيح عند البوابة
    this.lantern(null, -4.8, 3.3, 11.8, { priority: 5 });
    this.lantern(null, 4.8, 3.3, 11.8, { priority: 5 });
    this.layout.gate = { x: 0, z: 12 };
    // حاجز خلف البوابة
    this.collide(-3.3, 14.6, 3.3, 15); this.collide(-5, 12, -3.3, 16); this.collide(3.3, 12, 5, 16);
    // كشك الحارس: مقعد وفانوس
    this.bench(7.4, 10.9, 2.6, 0);
  }

  _fountain() {
    const M = this.M;
    const fx = 0, fz = 2;
    this.layout.fountain = { x: fx, z: fz };
    const g = this.group(fx, 0, fz);
    // حوض ثماني مجوّف (خط جانبي يُدوَّر)
    const prof = [[0, 0.0], [2.5, 0.0], [2.5, 0.72], [2.62, 0.72], [2.62, 0.84], [2.0, 0.84], [2.0, 0.42], [0, 0.42]].map(([r, y]) => new THREE.Vector2(r, y));
    const basinMat = this.M.ablaq.clone(); basinMat.side = THREE.DoubleSide;
    this.mk(new THREE.LatheGeometry(prof, 8), basinMat, g, 0, 0, 0);
    this.mk(new THREE.CylinderGeometry(2.0, 2.0, 0.02, 8), M.plasterLight, g, 0, 0.43, 0, 0, 0, 0, { cast: false });
    // عمود وسطي وحوض علوي
    this.mk(new THREE.CylinderGeometry(0.22, 0.32, 1.1, 8), M.ablaq, g, 0, 0.95, 0);
    this.mk(new THREE.CylinderGeometry(0.75, 0.4, 0.22, 8), M.plasterLight, g, 0, 1.55, 0);
    this.mk(new THREE.SphereGeometry(0.18, 10, 8), M.brass, g, 0, 1.8, 0);
    // الماء
    const wMat = new THREE.MeshPhysicalMaterial({ color: 0x2a6f80, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.88, bumpMap: this.tex.waterBump, bumpScale: 0.8, envMapIntensity: 1.5 });
    this.waterMat = wMat;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 1.98, 0.02, 8), wMat);
    water.position.set(fx, 0.66, fz); water.receiveShadow = true; water.userData.dynamic = true;
    this.dynamicGroup.add(water);
    this.collide(fx - 2.7, fz - 2.7, fx + 2.7, fz + 2.7);
    // جسيمات النافورة
    const n = this.quality.fountainParticles;
    const pos = new Float32Array(n * 3);
    this.fountain = { n, pos, seeds: Array.from({ length: n }, () => ({ t: this.rng() * 1.2, a: this.rng() * PI * 2, v: 1 + this.rng() * 0.6 })) };
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: 0xcfe9f2, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false, map: makeGlow(32, 'rgba(255,255,255,1)') });
    this.fountainPoints = new THREE.Points(pg, pm);
    this.fountainPoints.frustumCulled = false;
    this.fountainPoints.position.set(fx, 1.85, fz);
    this.dynamicGroup.add(this.fountainPoints);
  }

  _square() {
    const M = this.M, L = this.layout;
    // أشجار نارنج
    this.planter(-11.6, -7.8, 1); this.tree(-11.6, -7.8, 1.1);
    this.planter(11.2, 10.0, 1); this.tree(11.2, 10.0, 1.0);
    this.planter(11.6, -7.5, 0.9); this.tree(11.6, -7.5, 0.95);
    // مصطبة حجرية أمام البيت الغربي (موضع الحجر السائب)
    const bx = -13.1;
    this.box(1.8, 0.5, 5.4, M.ablaq, bx, 0.25, 7.0, null, 1.2);
    this.box(1.9, 0.08, 5.5, M.plasterLight, bx, 0.54, 7.0, null, 1);
    this.collide(-14, 4.2, -12.2, 9.8);
    // الحجر السائب
    this.looseStone = this.box(0.45, 0.3, 0.14, M.plasterLight, -12.18, 0.22, 7.3, null, 0.5);
    this.looseStone.rotation.z = 0.04;
    L.niche = { x: -11.6, z: 7.3 };
    // جرار ونباتات وزينة
    for (const [x, z, s] of [[-13.3, 11.4, 1.1], [13.4, 11.4, 1.0], [-13.4, -9.4, 0.9], [5.4, -9.2, 1.2]]) this.jar(x, z, s);
    for (const [x, z] of [[-13.0, 10.6], [12.8, 7.2], [-6.9, 11.4], [6.6, 11.3]]) {
      this.jar(x, z, 0.7);
      const m = this.mk(new THREE.IcosahedronGeometry(0.3, 1), M.leaf2, null, x, 0.95, z, 0, 0, 0, { cast: false }); m.scale.set(1, 0.8, 1);
    }
    // آثار الأقدام (بصمات مبلولة)
    const prints = new THREE.Group();
    this.dynamicGroup.add(prints);
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgba(20,14,8,0.9)';
    cx.beginPath(); cx.ellipse(32, 38, 15, 28, 0, 0, PI * 2); cx.fill();
    cx.beginPath(); cx.ellipse(32, 98, 12, 18, 0, 0, PI * 2); cx.fill();
    const pt = new THREE.CanvasTexture(c);
    const pmat = new THREE.MeshBasicMaterial({ map: pt, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.printsMat = pmat;
    const path = [[-2.4, 4.2], [-3.4, 4.6], [-4.7, 5.0], [-5.8, 5.6], [-7.2, 6.0], [-8.3, 6.5], [-9.6, 6.9], [-10.7, 7.2]];
    path.forEach(([px, pz], i) => {
      const side = i % 2 ? 1 : -1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.2), pmat);
      m.rotation.x = -PI / 2; m.rotation.z = -Math.atan2(-10.7 + 2.4, 7.2 - 4.2) + PI;
      m.position.set(px + side * 0.05, 0.012, pz + side * 0.08);
      prints.add(m);
    });
    L.prints = { x: -3.6, z: 4.7 };
    // مصباح الساحة (على أعمدة)
    for (const [x, z] of [[-7.5, 8.2], [8.2, 4.0], [-8, -5], [8.8, -6.4]]) {
      this.box(0.14, 3.2, 0.14, M.iron, x, 1.6, z, null, 1);
      const l = this.lantern(null, x, 3.3, z, { priority: 4 });
      this.collide(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
    }
    // لافتات
    this.buildSigns = true;
  }

  _alley() {
    const M = this.M, rng = this.rng;
    // عوارض تعبر الزقاق وسقيفة خشبية جزئية
    for (let i = 0; i < 6; i++) {
      const x = -17 - i * 3;
      this.box(0.18, 0.22, 4.6, M.woodDark, x, 5.3, -4, null, 1);
    }
    for (let x = -28; x < -21; x += 0.55) this.box(0.5, 0.06, 4.6, M.wood, x, 5.45, -4, null, 1);
    // خطوط غسيل
    const cols = [0xcfc3ab, 0x4a6f8a, 0x9c3b2e, 0xe0d4b6, 0x6a8f56];
    this.clothLine(new THREE.Vector3(-16, 4.4, -2.8), new THREE.Vector3(-22, 4.1, -5.2), cols);
    this.clothLine(new THREE.Vector3(-30, 4.0, -2.8), new THREE.Vector3(-24, 4.2, -5.2), cols);
    // فوانيس ممتدة
    for (const x of [-18, -26, -32]) this.lantern(null, x, 3.9, -4, { priority: 2 });
    // سلّم حجري وعربة
    for (let i = 0; i < 5; i++) this.box(1.6, 0.2 * (i + 1), 0.4, M.ablaq, -32.5 + i * 0.0, 0.1 * (i + 1), -2.45 - i * 0.0 + (-i * 0.0), null, 1);
    this.collide(-33.3, -2.9, -31.7, -2.0);
    // أصص وجرار وصناديق
    for (const [x, z, s] of [[-17.5, -2.8, 1], [-21, -2.7, 1.2], [-29, -5.4, 1], [-25, -5.4, 0.9], [-33, -5.4, 1.1], [-19.2, -5.4, 0.8]]) this.jar(x, z, s);
    this.crate(-23.5, -2.7, 0xd2681e, 0); this.crate(-27.6, -5.4, 0xc8302a, 0.1); this.sack(-30.2, -2.7); this.sack(-30.7, -3.1, 0.8);
    this.barrelProp(-20, -5.5); this.barrelProp(-24.2, -2.6);
    this.layout.alley = { x: -28, z: -4 };
    // قطة نائمة (مجسم بسيط)
    const cat = this.group(-23.8, 0.14, -2.9, 0.4);
    const cm = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 1 });
    this.mk(new THREE.SphereGeometry(0.14, 8, 6), cm, cat, 0, 0.0, 0).scale.set(1.5, 0.8, 1);
    this.mk(new THREE.SphereGeometry(0.09, 8, 6), cm, cat, 0.2, 0.03, 0.02);
    this.mk(new THREE.ConeGeometry(0.03, 0.06, 4), cm, cat, 0.22, 0.12, -0.03); this.mk(new THREE.ConeGeometry(0.03, 0.06, 4), cm, cat, 0.22, 0.12, 0.07);
  }
  barrelProp(x, z) {
    const g = this.group(x, 0, z, 0);
    this.mk(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 12), this.M.woodDark, g, 0, 0.4, 0);
    for (const y of [0.15, 0.65]) this.mk(new THREE.TorusGeometry(0.33, 0.015, 4, 14), this.M.iron, g, 0, y, 0, PI / 2, 0, 0, { cast: false });
    this.collide(x - 0.33, z - 0.33, x + 0.33, z + 0.33);
  }

  _backdrop() {
    const M = this.M, rng = this.rng;
    // بيوت بعيدة تحيط بالأفق + مئذنة وقبّة
    const far = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * PI * 2 + rng() * 0.1;
      const r = 62 + rng() * 40;
      const cx = -4 + Math.cos(a) * r * 1.25, cz = Math.sin(a) * r * 0.9;
      const w = 7 + rng() * 10, d = 7 + rng() * 10, hh = 6 + rng() * 9;
      this.box(w, hh, d, [M.plaster, M.plasterWarm, M.plasterLight][i % 3], cx, hh / 2 - 0.5, cz, null, 3, rng());
    }
    const mx = -34, mz = -70;
    this.mk(new THREE.CylinderGeometry(1.6, 2.0, 32, 12), M.plasterLight, null, mx, 16, mz);
    this.mk(new THREE.CylinderGeometry(2.6, 2.0, 0.8, 12), M.ablaq, null, mx, 26, mz);
    this.mk(new THREE.ConeGeometry(1.5, 7, 12), M.leaf, null, mx, 34, mz);
    this.mk(new THREE.SphereGeometry(10, 18, 12, 0, PI * 2, 0, PI / 2), M.plasterLight, null, 24, 8, -78);
    this.mk(new THREE.CylinderGeometry(10, 10, 8, 18), M.plasterLight, null, 24, 4, -78);
    // أشجار بعيدة عند الطريق خارج البوابة
    for (let i = 0; i < 10; i++) { const s = 1.8 + rng() * 1.5; this.tree(-9 + rng() * 18, 24 + i * 6, s).position.y = 0; }
  }

  _boundaries() {
    // حواجز غير مرئية: داخل الأزقة المقفلة وأطراف الخريطة
    this.collide(-60, -30, 40, -22.5);
    this.collide(-40, -30, -38, 30);
    this.collide(26.5, -30, 40, 30);
    this.collide(-60, 22, 40, 24);
  }

  // ───────── الدمج ─────────
  mergeStatics() {
    this.statics.updateMatrixWorld(true);
    const buckets = new Map();
    const toRemove = [];
    this.statics.traverse((o) => {
      if (!o.isMesh || o.userData.dynamic) return;
      const g = o.geometry;
      let geo = g.index ? g.toNonIndexed() : g.clone();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.applyMatrix4(o.matrixWorld);
      const key = o.material.uuid + '|' + (o.castShadow ? 1 : 0);
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
      buckets.get(key).geos.push(geo);
      toRemove.push(o);
    });
    for (const o of toRemove) o.removeFromParent();
    // الفوانيس وأمثالها الديناميكية تبقى في مجموعة statics؛ ننقلها لتحافظ على التحويل العالمي
    const keep = [];
    this.statics.traverse((o) => { if (o.userData.dynamic) keep.push(o); });
    for (const o of keep) { this.dynamicGroup.attach(o); }
    this.merged = [];
    for (const { mat, cast, geos } of buckets.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast; m.receiveShadow = true;
      this.statics.add(m);
      this.merged.push(m);
    }
    // اللافتات تُبنى بعد الدمج لأنها بخامة نصية خاصة
    this._buildSigns();
  }

  _buildSigns() {
    for (const s of this.signs || []) {
      const tex = makeSign(s.text, s.big ? { w: 640, h: 160, font: '700 88px "Reem Kufi", serif' } : {});
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      m.position.set(...s.pos); m.rotation.y = s.rotY ?? 0;
      m.castShadow = true;
      this.statics.add(m);
      const back = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.1, s.h + 0.1, 0.06), this.M.woodDark);
      back.position.copy(m.position); back.rotation.y = m.rotation.y;
      const off = new THREE.Vector3(0, 0, -0.04).applyEuler(m.rotation);
      back.position.add(off);
      this.statics.add(back);
    }
  }

  // ───────── الإضاءة النقطية للفوانيس ─────────
  setupLights() {
    const sorted = [...this.lanterns].sort((a, b) => b.priority - a.priority);
    this.pointLights = [];
    const n = this.quality.pointLights;
    for (let i = 0; i < n && i < sorted.length; i++) {
      const l = sorted[i];
      const light = new THREE.PointLight(0xffa850, 0, 16, 1.6);
      l.group.getWorldPosition(light.position);
      light.position.y -= 0.1;
      light.castShadow = false;
      this.scene.add(light);
      l.light = light;
      this.pointLights.push(light);
    }
    // ضوء المقهى الداخلي
    const cafe = new THREE.PointLight(0xffb060, 0, 14, 1.5);
    cafe.position.set(-2, 2.8, -15);
    this.scene.add(cafe);
    this.cafeLight = cafe;
  }

  setQuality(q) {
    this.quality = q;
    const n = q.pointLights;
    const sorted = [...this.lanterns].sort((a, b) => b.priority - a.priority);
    sorted.forEach((l, i) => {
      if (i < n && !l.light) {
        const light = new THREE.PointLight(0xffa850, 0, 16, 1.6);
        l.group.getWorldPosition(light.position); light.position.y -= 0.1;
        this.scene.add(light); l.light = light; this.pointLights.push(light);
      } else if (i >= n && l.light) {
        this.scene.remove(l.light); this.pointLights = this.pointLights.filter((p) => p !== l.light); l.light.dispose?.(); l.light = null;
      }
    });
  }

  groundY(x, z) {
    if (x > -10 && x < 6 && z < -5.4 && z > -22) return 0.15;
    if (x > 14 && x < 27 && z > -4 && z < 3) return 0.15;
    return 0;
  }

  // ───────── التحديث كل إطار ─────────
  update(dt, t, sky) {
    // الفوانيس تضيء مع الغروب
    const night = clamp((sky.duskFactor * 0.9 + sky.nightFactor), 0, 1);
    const lit = clamp(1 - (sky.elev - (-1)) / 7, 0, 1); // تبدأ بالإضاءة حول 6° وتكتمل قرب -1°
    for (const l of this.lanterns) {
      const target = lit;
      l.lit += (target - l.lit) * Math.min(1, dt * 1.2);
      const flick = 1 + Math.sin(t * 9 + l.phase) * 0.04 + Math.sin(t * 23 + l.phase * 2) * 0.02;
      l.bodyMat.emissiveIntensity = l.lit * 2.2 * flick;
      l.glow.material.opacity = l.lit * 0.65 * flick;
      if (l.light) l.light.intensity = l.lit * 14 * flick;
    }
    if (this.cafeLight) this.cafeLight.intensity = lit * 16;
    this.M.glassOn.emissiveIntensity = lit * 1.5;
    // الماء
    if (this.waterMat) {
      this.waterMat.bumpMap.offset.set(t * 0.03, t * 0.02);
    }
    // الجسيمات
    if (this.fountain) {
      const f = this.fountain, p = f.pos;
      for (let i = 0; i < f.n; i++) {
        const s = f.seeds[i];
        s.t += dt;
        const life = 1.2;
        if (s.t > life) { s.t -= life; s.a = this.rng() * PI * 2; s.v = 1 + this.rng() * 0.6; }
        const tt = s.t, vy = 3.3 * s.v, vh = 0.9 * s.v;
        p[i * 3] = Math.cos(s.a) * vh * tt;
        p[i * 3 + 1] = vy * tt - 4.9 * tt * tt;
        p[i * 3 + 2] = Math.sin(s.a) * vh * tt;
      }
      this.fountainPoints.geometry.attributes.position.needsUpdate = true;
    }
    // الغسيل يتمايل
    for (const c of this.clothLines) c.rotation.z = Math.sin(t * 1.3 + c.userData.sway) * 0.06;
    // آثار الأقدام تجف مع الوقت
    if (this.printsMat) this.printsMat.opacity = 0.62 - clamp((sky.hour - 16.75) / 3, 0, 1) * 0.3;
  }
}
