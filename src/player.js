// التحكم بالشخصية (منظور الشخص الثالث) + حامل الكاميرا (متابعة / لقطات حوار / مسار سينمائي)
import * as THREE from 'three';
import { clamp, lerp } from './config.js';

const TMP = new THREE.Vector3();

// حلّ التصادم: دائرة مقابل مستطيلات
export function resolveCircle(pos, r, boxes, extra = []) {
  for (let it = 0; it < 3; it++) {
    for (const b of boxes) {
      const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-8) {
          // الداخل: ندفع نحو أقرب حافة
          const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === t) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        } else {
          const d = Math.sqrt(d2), push = (r - d) / d;
          pos.x += dx * push; pos.z += dz * push;
        }
      }
    }
    for (const e of extra) {
      const dx = pos.x - e.x, dz = pos.z - e.z, rr = r + e.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), push = (rr - d) / d; pos.x += dx * push; pos.z += dz * push; }
    }
  }
}

// تقاطع شعاع أفقي مع المستطيلات (لمنع الكاميرا من اختراق الجدران)
export function rayBoxes(ox, oz, dx, dz, maxT, boxes, pad = 0.3) {
  let best = maxT;
  for (const b of boxes) {
    const x0 = b.x0 - pad, x1 = b.x1 + pad, z0 = b.z0 - pad, z1 = b.z1 + pad;
    if (ox > x0 && ox < x1 && oz > z0 && oz < z1) continue;   // نبدأ من داخله: نتجاهله
    let tmin = 0, tmax = best;
    for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oz, dz, z0, z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { tmin = 1e9; break; } continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { tmin = 1e9; break; }
    }
    if (tmin < best) best = tmin;
  }
  return best;
}

export class Player {
  constructor(game, character) {
    this.game = game;
    this.char = character;
    this.pos = new THREE.Vector3(0, 0, 9);
    this.yaw = Math.PI;              // اتجاه الجسم (+z أمامي)
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.radius = 0.34;
    this.keys = new Set();
    this.camYaw = 0; this.camPitch = 0.28; this.camDist = 3.6;
    this._stepAcc = 0;
    this.locked = false;
    character.root.position.copy(this.pos);
    this._bind();
  }

  _bind() {
    const g = this.game, canvas = g.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (g.isPlaying()) this.keys.add(e.code); return; }
      this.keys.add(e.code);
      g.onKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => { if (g.state === 'play' && !this.locked) canvas.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && g.state === 'play' && !g.suppressPause) g.openPause();
    });
    canvas.addEventListener('mousedown', (e) => { this._drag = e.button; this._lx = e.clientX; this._ly = e.clientY; });
    window.addEventListener('mouseup', () => { this._drag = null; });
    window.addEventListener('mousemove', (e) => {
      if (g.state !== 'play') return;
      let dx = 0, dy = 0;
      if (this.locked) { dx = e.movementX; dy = e.movementY; }
      else if (this._drag != null) { dx = e.clientX - this._lx; dy = e.clientY - this._ly; this._lx = e.clientX; this._ly = e.clientY; }
      else return;
      const s = 0.0025 * g.settings.sensitivity;
      this.camYaw -= dx * s;
      this.camPitch = clamp(this.camPitch + dy * s * (g.settings.invertY ? -1 : 1), -0.2, 1.15);
    });
    canvas.addEventListener('wheel', (e) => { if (g.state === 'play') this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.4, 2, 6.5); }, { passive: true });
  }

  teleport(x, z, yaw = this.yaw) {
    this.pos.set(x, this.game.world.groundY(x, z), z);
    this.yaw = yaw;
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = yaw;
  }

  update(dt, t, canMove) {
    const g = this.game, k = this.keys;
    let ix = 0, iy = 0;
    if (canMove) {
      if (k.has('KeyW') || k.has('ArrowUp')) iy += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iy -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyQ')) this.camYaw += dt * 1.6;
      if (k.has('KeyZ')) this.camYaw -= dt * 1.6;
    }
    const run = canMove && (k.has('ShiftLeft') || k.has('ShiftRight'));
    const maxSp = run ? 4.4 : 2.2;
    const len = Math.hypot(ix, iy);
    const fwd = TMP.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const dirX = (fwd.x * iy + Math.cos(this.camYaw) * ix) / (len || 1);
    const dirZ = (fwd.z * iy + -Math.sin(this.camYaw) * ix) / (len || 1);
    const target = len > 0 ? maxSp : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (len > 0 ? 8 : 12));
    if (len > 0) {
      this.vel.set(dirX * this.speed, 0, dirZ * this.speed);
      const want = Math.atan2(dirX, dirZ);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    } else this.vel.multiplyScalar(Math.max(0, 1 - dt * 12));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    resolveCircle(this.pos, this.radius, g.world.colliders, g.npcs.blockers(this));
    const gy = g.world.groundY(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 14);

    const c = this.char;
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    c.moveSpeed = this.vel.length();
    // خطوات
    if (c.moveSpeed > 0.5) {
      this._stepAcc += c.moveSpeed * dt;
      const stride = run ? 1.9 : 1.25;
      if (this._stepAcc > stride) { this._stepAcc = 0; g.audio.step(run); }
    } else this._stepAcc = 0.8;
  }

  head(out = new THREE.Vector3()) { return this.char.headWorld(out); }
}

// ───────── حامل الكاميرا ─────────
export class CameraRig {
  constructor(game, camera) {
    this.game = game; this.camera = camera;
    this.mode = 'follow';
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, 1.5, 0);
    this.fovTarget = 58; this.fov = 58;
    this.shotPos = new THREE.Vector3(); this.shotLook = new THREE.Vector3();
    this.smoothTime = 4;
    this._camDist = 3.6;
    this.shake = 0;
  }

  setShot(pos, look, fov = 40, smooth = 3.5) {
    this.mode = 'shot';
    this.shotPos.copy(pos); this.shotLook.copy(look);
    this.fovTarget = fov; this.smoothTime = smooth;
  }
  follow() { this.mode = 'follow'; this.fovTarget = 58; }
  cine() { this.mode = 'cine'; }

  // يقصّر المسافة لتجنّب الجدران
  _avoid(from, to, pad = 0.3) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return to;
    const t = rayBoxes(from.x, from.z, dx / L, dz / L, L, this.game.world.colliders, pad);
    if (t < L) { const k = Math.max(0.35, t) / L; return new THREE.Vector3(lerp(from.x, to.x, k), to.y, lerp(from.z, to.z, k)); }
    return to;
  }
  avoid(from, to, pad) { return this._avoid(from, to, pad); }

  // موضع الكاميرا المطلوب في وضع المتابعة
  _followTarget() {
    const g = this.game, p = g.player;
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.55, p.pos.z);
    const cp = Math.cos(p.camPitch);
    const off = new THREE.Vector3(Math.sin(p.camYaw) * cp, Math.sin(p.camPitch), Math.cos(p.camYaw) * cp).multiplyScalar(p.camDist);
    const safe = this._avoid(target, target.clone().add(off), 0.35);
    safe.y = Math.max(safe.y, g.world.groundY(safe.x, safe.z) + 0.35);
    return { pos: safe, look: target };
  }

  snapFollow() {
    const t = this._followTarget();
    this.pos.copy(t.pos); this.look.copy(t.look);
    this.fov = this.fovTarget = 58;
    this.camera.fov = 58; this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }

  update(dt) {
    const cam = this.camera;
    if (this.mode === 'follow') {
      const t = this._followTarget();
      const k = 1 - Math.exp(-dt * 14);
      this.pos.lerp(t.pos, k); this.look.lerp(t.look, k);
    } else if (this.mode === 'shot') {
      const k = 1 - Math.exp(-dt * this.smoothTime);
      this.pos.lerp(this.shotPos, k); this.look.lerp(this.shotLook, k);
    }
    this.fov += (this.fovTarget - this.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }

  // قفزة فورية (قطع سينمائي)
  snap() {
    if (this.mode === 'shot') { this.pos.copy(this.shotPos); this.look.copy(this.shotLook); this.fov = this.fovTarget; }
  }
}
