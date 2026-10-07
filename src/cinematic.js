// المشهد الافتتاحي: لقطات كاميرا داخل المحرك + سرد صوتي مؤقت + ترجمة. قابل للتخطي.
import * as THREE from 'three';
import { smooth } from './config.js';

const NARRATOR = { pitch: 96, formant: 0.92, rate: 0.7 };

const SHOTS = [
  { dur: 11, pos: [[27, 15, 26], [9, 10, 10]], look: [[0, 3, -2], [-3, 2.4, -6]], fov: [52, 48],
    line: { t: 'الشام… وقت العصر. حارة صغيرة، وأبواب كبيرة… وكل باب وراه حكاية.', at: 1.4 }, card: 0.5 },
  { dur: 10.5, pos: [[1, 1.7, 27], [0.4, 1.8, 10]], look: [[0, 3.6, 12], [0, 2.4, -2]], fov: [48, 54],
    line: { t: 'بهالحارة، السمعة أغلى من الدهب… والكلمة الواحدة ممكن تبني بيت، أو تهدّو.', at: 0.8 } },
  { dur: 10, pos: [[-9.5, 1.85, -0.5], [-4.9, 1.62, -4.7]], look: [[-4, 1.6, -7], [-1.65, 1.58, -7.5]], fov: [46, 33],
    line: { t: 'وهاليوم… ضاعت ساعة، وضاع معها هدوء الحارة.', at: 1.0 } },
];

export class Cinematic {
  constructor(game) { this.g = game; this.active = false; }

  play(onDone) {
    const g = this.g;
    this.active = true; this.onDone = onDone;
    this.shot = 0; this.t = 0; this.lineStarted = false; this.sub = null;
    g.setState('cinematic');
    document.body.classList.add('cine');
    g.ui.showHud(false); g.ui.skipHint(true);
    g.camRig.cine();
    g.audio.setMood('calm');
    g.audio.stopVoices();
    this._enterShot();
  }

  _enterShot() {
    const s = SHOTS[this.shot];
    this.t = 0; this.lineStarted = false; this.handle = null;
    if (s.card !== undefined) this.cardAt = s.card; else this.cardAt = null;
    this.cardShown = false;
  }

  skip() { if (this.active) this._finish(); }

  // أداة تصحيح/اختبار: انتقل إلى لقطة ولحظة محددتين
  seek(shot, t) { this.shot = shot; this._enterShot(); this.t = t; }

  update(dt) {
    if (!this.active) return;
    const g = this.g, s = SHOTS[this.shot];
    this.t += dt;
    const k = smooth(Math.min(1, this.t / s.dur));
    const L = (a, b) => new THREE.Vector3(...a).lerp(new THREE.Vector3(...b), k);
    const rig = g.camRig;
    rig.pos.copy(L(s.pos[0], s.pos[1]));
    // اهتزاز خفيف كأنها كاميرا محمولة
    rig.pos.y += Math.sin(this.t * 1.7) * 0.02; rig.pos.x += Math.sin(this.t * 1.1) * 0.02;
    rig.look.copy(L(s.look[0], s.look[1]));
    rig.fovTarget = s.fov[0] + (s.fov[1] - s.fov[0]) * k; rig.fov = rig.fovTarget;
    if (this.cardAt !== null && !this.cardShown && this.t >= this.cardAt) {
      this.cardShown = true;
      g.ui.card('باب الحارة', 'الجزء الأول — نسخة تجريبية قابلة للّعب', 'مشهد افتتاحي ومهمة أصلية مضافة للعبة');
    }
    if (!this.lineStarted && this.t >= s.line.at) {
      this.lineStarted = true;
      this.handle = g.audio.speak(s.line.t, NARRATOR, {});
      g.ui.subtitle(s.line.t);
      this.subEnd = this.t + Math.max(3, this.handle.total + 1.2);
    }
    if (this.handle) this.handle.update();
    if (this.lineStarted && this.t > this.subEnd) g.ui.subtitle(null);
    if (this.t >= s.dur) {
      g.ui.subtitle(null);
      this.shot++;
      if (this.shot >= SHOTS.length) this._finish(); else this._enterShot();
    }
  }

  _finish() {
    if (!this.active) return;
    const g = this.g;
    this.active = false;
    g.audio.stopVoices();
    g.ui.subtitle(null); g.ui.skipHint(false);
    document.body.classList.remove('cine');
    g.ui.fade(true, 500);
    setTimeout(() => {
      this.onDone && this.onDone();
      g.ui.fade(false, 900);
    }, 520);
  }
}
