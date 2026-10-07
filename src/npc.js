// سكان الحارة: شخصيات القصة + سكان عابرون بجداول زمنية (يتحركون، يعودون لبيوتهم عند المغرب)
import * as THREE from 'three';
import { Character } from './character.js';
import { CAST, villagerLook } from './story/cast.js';
import { resolveCircle } from './player.js';
import { clamp } from './config.js';
import { BARKS } from './story/dialogues.js';

// دائرة حول البحرة (نصف قطر 6) لمسارات المشي
const ring = (n, r = 6, cx = 0, cz = 2, start = 0, dir = 1) =>
  Array.from({ length: n }, (_, i) => { const a = start + dir * (i / n) * Math.PI * 2; return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }; });

export class NPC {
  constructor(id, look, o = {}) {
    this.id = id;
    this.char = new Character({ id, ...look });
    this.root = this.char.root;
    this.pos = new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    this.yaw = o.yaw ?? 0;
    this.home = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    this.kind = o.kind || 'static';        // static | route | talk
    this.route = o.route || null;
    this.routeIdx = 0;
    this.speed = o.speed ?? 1.1;
    this.wait = 0;
    this.sit = !!o.sit;
    this.radius = 0.34;
    this.story = !!o.story;
    this.label = o.label || CAST[id]?.name || '';
    this.visible = true;
    this.scheduleHome = o.scheduleHome || null;    // {at: hour, door:{x,z}}
    this.goingHome = false;
    this.talkingTo = null;
    this.override = null;                          // {x,z,speed,onArrive}
    this.lookAtPlayer = o.lookAtPlayer ?? true;
    this.blocks = o.blocks ?? true;
    this.state = 'idle';
    this.gestureTimer = 0;
    this.barkCool = 5 + Math.random() * 10;
    if (this.sit) this.char.setSit(true);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  setVisible(v) { this.visible = v; this.root.visible = v; }

  update(dt, t, game) {
    if (!this.visible) return;
    const c = this.char, p = game.player.pos;
    let moving = false;
    const hour = game.hour;

    // العودة للبيت عند المغرب
    if (this.scheduleHome && !this.goingHome && hour >= this.scheduleHome.at && !this.talkingTo) {
      this.goingHome = true;
      this.override = { x: this.scheduleHome.door.x, z: this.scheduleHome.door.z, speed: 1.5, onArrive: () => this.setVisible(false) };
    }
    if (this.talkingTo) {
      // يواجه المتحدّث إليه
      const d = this._angleTo(p.x, p.z);
      this.yaw += d * Math.min(1, dt * 6);
      c.moveSpeed = 0;
    } else if (this.override) {
      moving = this._moveTo(this.override.x, this.override.z, this.override.speed || this.speed, dt, game);
      if (!moving) { const fn = this.override.onArrive; this.override = null; fn && fn(); }
    } else if (this.kind === 'route' && this.route && this.route.length) {
      if (this.wait > 0) { this.wait -= dt; }
      else {
        const wp = this.route[this.routeIdx];
        moving = this._moveTo(wp.x, wp.z, wp.speed || this.speed, dt, game);
        if (!moving) { this.wait = wp.wait ?? 0.3; this.routeIdx = (this.routeIdx + 1) % this.route.length; if (wp.exit) this.setVisible(false); }
      }
    }
    c.moveSpeed = moving ? (this.override?.speed || this.speed) : 0;
    if (!moving && !this.talkingTo) {
      // حارس/واقف: ينظر إلى اللاعب إن اقترب
      const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (this.lookAtPlayer && dist < 5 && !this.sit) {
        const d = this._angleTo(p.x, p.z);
        if (Math.abs(d) < 1.9) this.yaw += d * Math.min(1, dt * 2.5) * 0.7;
      } else {
        const d = Math.atan2(Math.sin(this.home.yaw - this.yaw), Math.cos(this.home.yaw - this.yaw));
        if (this.kind === 'static') this.yaw += d * Math.min(1, dt * 1.2);
      }
    }
    // النظر بالرأس
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (this.lookAtPlayer && dist < 6.5 && !moving) c.lookAt(game.player.head(this._headTmp ??= new THREE.Vector3())); else c.lookAt(null);

    this.pos.y += (game.world.groundY(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 10);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    c.update(dt, t);
  }

  _angleTo(x, z) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    return Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
  }

  _moveTo(x, z, sp, dt, game) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return false;
    const step = Math.min(d, sp * dt);
    this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
    if (!this.override || !this.override.free) resolveCircle(this.pos, 0.28, game.world.colliders, []);
    const want = Math.atan2(dx, dz);
    this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 8);
    return true;
  }
}

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byId = {};
    this.ambient = [];
  }

  add(npc) {
    this.list.push(npc); this.byId[npc.id] = npc;
    this.game.scene.add(npc.root);
    return npc;
  }
  get(id) { return this.byId[id]; }

  // قائمة العوائق الديناميكية لتصادم اللاعب
  blockers(self) {
    const out = [];
    for (const n of this.list) if (n.visible && n.blocks && !n.sit) out.push({ x: n.pos.x, z: n.pos.z, r: 0.34 });
    return out;
  }

  spawnStory() {
    const mk = (id, o) => this.add(new NPC(id, CAST[id].look, { story: true, ...o }));
    mk('abuJalal', { x: -1.6, y: 0.15, z: -7.5, yaw: -0.8, kind: 'static' });
    mk('aqeed', { x: 8.0, z: 9.4, yaw: Math.PI, kind: 'static' });
    mk('umHasan', { x: 12.4, z: 7.3, yaw: -Math.PI / 2, kind: 'static' });
    mk('peddler', { x: -7.4, z: 10.5, yaw: Math.PI, kind: 'static', sit: true, blocks: false });
    mk('grocer', { x: 16.2, y: 0.15, z: -0.5, yaw: -Math.PI / 2, kind: 'static', story: false });
    const hasan = this.add(new NPC('hasan', CAST.hasan.look, {
      story: false, kind: 'route', speed: 1.9, x: -2.8, z: 6.6, lookAtPlayer: false, blocks: false,
      route: [{ x: -3, z: 7.5, wait: 0.6 }, { x: -6, z: 5, wait: 1.2 }, { x: -9, z: 4.5, wait: 2.0 }, { x: -4, z: 0.5, wait: 0.4 }, { x: 4.5, z: 6, wait: 1.0 }],
      scheduleHome: { at: 17.95, door: { x: 13.8, z: 7.5 } },
    }));
    // رواد المقهى جالسون
    const cafe = [[-7.4, -8.3, 'villager1', 'man', 11, -Math.PI / 2], [-6.7, -8.3, 'villager2', 'elder', 12, Math.PI / 2], [-0.2, -7.0, 'villager3', 'elder', 13, 0]];
    cafe.forEach(([x, z, id, kind, seed, yaw]) => {
      const n = this.add(new NPC(id, villagerLook(seed, kind), { x: x + (id === 'villager3' ? 0 : 0), y: 0.15, z: z + (id === 'villager3' ? -0.75 : 0), yaw, kind: 'static', sit: true, blocks: false, label: '' }));
      n.char.setTalking(0.35);
      n.char.setExpression(id === 'villager2' ? 'smile' : 'neutral', true);
    });
  }

  spawnAmbient(count) {
    const defs = [
      { id: 'amb_elder', kind: 'elder', seed: 21, route: ring(8, 6, 0, 2, 0.4, 1), speed: 0.85, home: { at: 18.7, door: { x: -11.5, z: 6.4 } } },
      { id: 'amb_woman1', kind: 'woman', seed: 22, route: ring(8, 6.4, 0, 2, 3.2, -1), speed: 1.0, home: { at: 18.5, door: { x: 13.8, z: 5.2 } } },
      { id: 'amb_man1', kind: 'man', seed: 23, route: [{ x: 4, z: 10, wait: 1.2 }, { x: 9, z: 3.5, wait: 3 }, { x: 11, z: -3, wait: 2 }, { x: 6, z: -4.2, wait: 2.5 }, { x: 4, z: 6, wait: 0.5 }], speed: 1.25, home: { at: 18.8, door: { x: 13.8, z: -8 } } },
      { id: 'amb_boy1', kind: 'boy', seed: 24, route: [{ x: -5, z: 0, speed: 3.0, wait: 0.2 }, { x: 5, z: -3, speed: 3.0, wait: 0.2 }, { x: 5, z: 7, speed: 3.0, wait: 0.2 }, { x: -5, z: 7, speed: 3, wait: 0.2 }], speed: 3.0, home: { at: 18.2, door: { x: -13.8, z: 10.5 } }, bounds: true },
      { id: 'amb_boy2', kind: 'boy', seed: 25, route: [{ x: -4, z: 7, speed: 3.0, wait: 0.2 }, { x: -5, z: 0, speed: 3.0, wait: 0.2 }, { x: 5, z: 7, speed: 3.0, wait: 0.2 }, { x: 5, z: -3, speed: 3.0, wait: 0.2 }], speed: 3.0, home: { at: 18.3, door: { x: -13.8, z: 10.5 } } },
      { id: 'amb_woman2', kind: 'woman', seed: 26, route: [{ x: -14.5, z: -4, wait: 1.5 }, { x: -9, z: -3.5, wait: 2.0 }, { x: -9, z: 4, wait: 3.5 }, { x: -11, z: 9, wait: 3 }], speed: 1.0, home: { at: 18.6, door: { x: -13.8, z: 10.5 } } },
      { id: 'amb_man2', kind: 'man', seed: 27, route: [{ x: -26, z: -4, wait: 2.5 }, { x: -18, z: -4, wait: 1 }, { x: -11, z: -2, wait: 2.5 }, { x: -18, z: -4, wait: 1 }], speed: 1.15, home: { at: 18.9, door: { x: -33, z: -4 } } },
      { id: 'amb_man3', kind: 'elder', seed: 28, route: [{ x: 11, z: 11, wait: 4 }, { x: 11, z: 2, wait: 2 }, { x: 8, z: -2, wait: 3 }], speed: 0.8, home: { at: 18.5, door: { x: 13.8, z: 9 } } },
      { id: 'amb_woman3', kind: 'woman', seed: 29, route: ring(8, 8.4, 0, 2, 1.0, 1), speed: 0.95, home: { at: 18.45, door: { x: 13.8, z: 5.2 } } },
      { id: 'amb_man4', kind: 'man', seed: 30, route: [{ x: -2, z: -4, wait: 2 }, { x: 4, z: -4.5, wait: 3 }, { x: 0, z: 8.5, wait: 2 }], speed: 1.2, home: { at: 18.7, door: { x: -13.8, z: 10.5 } } },
    ];
    defs.slice(0, count).forEach((d) => {
      const start = d.route[0];
      const n = this.add(new NPC(d.id, villagerLook(d.seed, d.kind), {
        kind: 'route', route: d.route, speed: d.speed, x: start.x, z: start.z, yaw: 0, scheduleHome: d.home, label: '', blocks: d.kind !== 'boy',
      }));
      n.routeIdx = 1 % d.route.length;
      n.ambient = true;
      this.ambient.push(n);
    });
  }

  update(dt, t) {
    for (const n of this.list) n.update(dt, t, this.game);
  }

  // عبارات عابرة تتغيّر بالسمعة والوقت
  barkFor(npc) {
    const s = this.game.story;
    const ev = this.game.hour >= 18;
    const detained = s.flag('peddler_detained') && !s.flag('peddler_released');
    const pool = [];
    for (const b of BARKS.greet) if (b.cond(s)) pool.push(b.t);
    if (ev) pool.push(...BARKS.evening);
    if (detained) pool.push(...BARKS.detained);
    return pool[(Math.random() * pool.length) | 0];
  }
}
