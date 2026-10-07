// السماء ودورة الليل والنهار: شمس فيزيائية، ضباب، نجوم، قمر، إضاءة محيطية
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, mulberry32, SUNSET_HOUR } from './config.js';
import { makeGlow } from './textures.js';

const SUNRISE = 6.0;

// مفاتيح لونية حسب ارتفاع الشمس (بالدرجات)
const KEYS = [
  // elev, fog, hemiSky, hemiGround, sun, sunIntensity, hemiIntensity, exposure
  { e: -14, fog: '#0c1426', hs: '#2a4272', hg: '#10131c', sun: '#6a7fb0', si: 0.0, hi: 1.1, ex: 1.15 },
  { e: -4,  fog: '#2c2540', hs: '#4a4570', hg: '#1a1620', sun: '#ff7a3a', si: 0.0, hi: 0.8, ex: 1.0 },
  { e: 0,   fog: '#b0603a', hs: '#c07a5c', hg: '#3a2418', sun: '#ff7a2a', si: 0.9, hi: 0.6, ex: 0.85 },
  { e: 6,   fog: '#d29060', hs: '#a8a0b8', hg: '#4a3626', sun: '#ff9a48', si: 2.8, hi: 0.62, ex: 0.88 },
  { e: 18,  fog: '#d6bfa0', hs: '#8fa6c4', hg: '#5a4a38', sun: '#ffc88a', si: 3.4, hi: 0.62, ex: 0.9 },
  { e: 55,  fog: '#c4d0dc', hs: '#a8c8ee', hg: '#665a4a', sun: '#fff1dc', si: 3.8, hi: 0.8, ex: 0.8 },
];
const _c = KEYS.map((k) => ({
  ...k, fogC: new THREE.Color(k.fog), hsC: new THREE.Color(k.hs), hgC: new THREE.Color(k.hg), sunC: new THREE.Color(k.sun),
}));

export class SkyDome {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer; this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.sky = new Sky();
    this.sky.scale.setScalar(8000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 7; u.rayleigh.value = 1.8; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
    this.group.add(this.sky);

    // نجوم
    const rng = mulberry32(7);
    const n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2, ph = Math.acos(0.05 + rng() * 0.95);
      const r = 7000;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const w = 0.7 + rng() * 0.3;
      col[i * 3] = w; col[i * 3 + 1] = w * (0.9 + rng() * 0.1); col[i * 3 + 2] = 1.0;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.group.add(this.stars);

    // قمر
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow(128, 'rgba(235,240,255,1)'), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.moon.scale.setScalar(520);
    this.group.add(this.moon);

    // أضواء
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const r = quality.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 140 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.moonLight = new THREE.DirectionalLight(0x6f86c8, 0);
    this.moonLight.position.set(-30, 50, -20);
    scene.add(this.moonLight);

    this.hemi = new THREE.HemisphereLight(0xaaccff, 0x554433, 0.8);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xc8c0b4, 0.012);
    scene.background = new THREE.Color(0x000000);

    // البيئة (IBL)
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(8000);
    this.envScene.add(this.envSky);
    this.envTarget = null;
    this._lastEnvElev = -99;

    this.hour = 16.75;
    this.elev = 20;
    this.dayFactor = 1;
    this.nightFactor = 0;
    this.duskFactor = 0;
    this.sunDir = new THREE.Vector3();
    this.exposure = 0.8;
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const r = q.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r });
    this.sun.shadow.camera.updateProjectionMatrix();
    if (!q.ibl) { this.scene.environment = null; this._lastEnvElev = -99; }
  }

  // حساب موضع الشمس من الساعة
  computeSun(hour) {
    const dayLen = SUNSET_HOUR - SUNRISE;
    const t = (hour - SUNRISE) / dayLen;           // 0..1 أثناء النهار
    const elev = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 1.35) * 62;   // درجات (سالب بعد الغروب)
    let e = elev;
    if (t < 0 || t > 1) {
      // بعد الغروب: ينزل تحت الأفق بمعدل ثابت
      const past = t > 1 ? (t - 1) * dayLen : (t * dayLen);
      e = -clamp(Math.abs(past) * 9, 0, 40);
    }
    // سمت: شرق (+x) صباحاً → جنوب (+z) ظهراً → غرب (-x) مساءً
    const az = Math.PI * clamp(t, -0.3, 1.3);
    const er = (e * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(er), Math.sin(er), 0.45 * Math.cos(er) + 0.15);
    dir.normalize();
    return { elev: e, dir };
  }

  update(hour, focus) {
    this.hour = hour;
    const { elev, dir } = this.computeSun(hour);
    this.elev = elev; this.sunDir.copy(dir);

    // تقاطع مفاتيح الألوان
    let a = _c[0], b = _c[_c.length - 1], t = 0;
    if (elev <= _c[0].e) { a = b = _c[0]; }
    else if (elev >= _c[_c.length - 1].e) { a = b = _c[_c.length - 1]; }
    else {
      for (let i = 0; i < _c.length - 1; i++) {
        if (elev >= _c[i].e && elev <= _c[i + 1].e) { a = _c[i]; b = _c[i + 1]; t = (elev - a.e) / (b.e - a.e); break; }
      }
    }
    const fog = a.fogC.clone().lerp(b.fogC, t);
    const hs = a.hsC.clone().lerp(b.hsC, t);
    const hg = a.hgC.clone().lerp(b.hgC, t);
    const sc = a.sunC.clone().lerp(b.sunC, t);
    const si = lerp(a.si, b.si, t);
    const hi = lerp(a.hi, b.hi, t);
    this.exposure = lerp(a.ex, b.ex, t);

    this.dayFactor = clamp((elev + 4) / 16, 0, 1);
    this.nightFactor = clamp((-elev - 1) / 9, 0, 1);
    this.duskFactor = clamp(1 - Math.abs(elev - 2) / 9, 0, 1);

    this.scene.fog.color.copy(fog);
    this.scene.fog.density = lerp(0.016, 0.011, this.dayFactor) + this.duskFactor * 0.003;
    this.hemi.color.copy(hs); this.hemi.groundColor.copy(hg); this.hemi.intensity = hi * (this.quality.ibl ? 0.9 : 1.5);
    this.sun.color.copy(sc); this.sun.intensity = si;
    this.moonLight.intensity = this.nightFactor * 1.1;

    // موضع الشمس والظل حول نقطة التركيز
    this.sun.position.copy(focus).addScaledVector(dir, 70);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    // يمنع ظلالاً سلبية بعد الغروب
    this.sun.castShadow = this.quality.shadows && si > 0.05;

    // السماء
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.rayleigh.value = lerp(0.6, 2.0, this.dayFactor) + this.duskFactor * 1.4;
    u.turbidity.value = 6 + this.duskFactor * 6;
    this.starMat.opacity = this.nightFactor;
    this.moon.material.opacity = this.nightFactor * 0.9;
    this.moon.position.set(-2500, 3200, -1800);

    if (this.quality.ibl && Math.abs(elev - this._lastEnvElev) > 1.4) this.refreshEnvironment(dir);
    if (this.scene.environment) this.scene.environmentIntensity = lerp(0.18, 0.3, this.dayFactor);
  }

  followCamera(camera) {
    this.group.position.copy(camera.position);
  }

  refreshEnvironment(dir) {
    this._lastEnvElev = this.elev;
    const u = this.envSky.material.uniforms;
    const src = this.sky.material.uniforms;
    u.turbidity.value = src.turbidity.value; u.rayleigh.value = src.rayleigh.value;
    u.mieCoefficient.value = src.mieCoefficient.value; u.mieDirectionalG.value = src.mieDirectionalG.value;
    u.sunPosition.value.copy(dir);
    const rt = this.pmrem.fromScene(this.envScene, 0.02, 1, 3000);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = rt;
    this.scene.environment = rt.texture;
  }
}
