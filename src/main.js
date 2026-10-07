// باب الحارة — الجزء الأول: الحلقة الرئيسية وربط الأنظمة
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY, DEFAULT_SETTINGS, TIME_SCALE, START_HOUR, DETAIN_HOUR, clamp } from './config.js';
import { buildTextureSet } from './textures.js';
import { World } from './world.js';
import { SkyDome } from './sky.js';
import { Character } from './character.js';
import { CAST } from './story/cast.js';
import { NPCManager } from './npc.js';
import { Player, CameraRig } from './player.js';
import { AudioEngine } from './audio.js';
import { Story } from './quest.js';
import { DialogueRunner } from './dialogue.js';
import { UI } from './ui.js';
import { Cinematic } from './cinematic.js';
import { SaveStore } from './save.js';
import { EXAMINE } from './story/examine.js';
import { CLUES, ITEMS, TRUST_META, REP_META, QUEST, ENDINGS } from './story/data.js';
import { BARKS } from './story/dialogues.js';
import { formatClock } from './config.js';

const params = new URLSearchParams(location.search);
const tick = () => new Promise((r) => setTimeout(r, 0));

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.state = 'loading';
    this.settings = { ...DEFAULT_SETTINGS, ...(SaveStore.settings.read() || {}) };
    if (params.get('q') && QUALITY[params.get('q')]) this.settings.quality = params.get('q');
    if (params.get('autoq') === '0') this.settings.autoQuality = false;
    this.hour = 17.0;
    this._last = performance.now();
    this.time = 0;
    this.story = new Story();
    this.audio = new AudioEngine(this.settings);
    this.suppressPause = false;
    this.pendingEnding = null;
    this.playTime = 0; this.autosaveT = 0;
    this.interactables = [];
    this.nearest = null;
    this.fpsAcc = { t: 0, n: 0, since: 0 };
    this._miniT = 0; this._barkT = 4;
    this.dirty = false;
    this.overlay = null;
  }

  // ───────── الإقلاع ─────────
  async boot() {
    this.ui = new UI(this);
    this.ui.syncSettings();
    const L = (p, t) => this.ui.setLoading(p, t);
    L(0.05, 'تحضير المشهد…');
    await Promise.all([document.fonts.load('700 48px "Reem Kufi"'), document.fonts.load('400 20px "Noto Naskh"')]).catch(() => {});
    await tick();

    const q = QUALITY[this.settings.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 9000);
    this.camRig = new CameraRig(this, this.camera);

    L(0.15, 'صقل حجارة الأزقة…');
    await tick();
    this.sky = new SkyDome(this.scene, this.renderer, q);
    // ضوء وجه ناعم يرافق كاميرا الحوار (حيلة سينمائية)
    this.keyLight = new THREE.PointLight(0xffe2b8, 0, 7, 1.6);
    this.scene.add(this.keyLight);
    const tex = buildTextureSet();
    L(0.35, 'بناء البيوت الدمشقية…');
    await tick();
    this.world = new World(this.scene, tex, q);
    this.world.build();
    this.world.update(0.016, 0, this.sky);
    L(0.6, 'استقدام أهل الحارة…');
    await tick();

    this.npcs = new NPCManager(this);
    this.npcs.spawnStory();
    this.npcs.spawnAmbient(12);
    this.playerChar = new Character({ id: 'nadim', ...CAST.nadim.look });
    this.scene.add(this.playerChar.root);
    this.player = new Player(this, this.playerChar);
    this.player.teleport(2.5, 6.8, Math.PI);
    this.dialogue = new DialogueRunner(this);
    this.cinematic = new Cinematic(this);
    this.initInteractables();
    this.bindStory();
    L(0.85, 'ضبط الجودة…');
    this.applyQuality(true);
    this._setupPost();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.openPause(); });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('click', () => { if (this.state === 'cinematic') this.cinematic.skip(); else if (this.state === 'dialogue') this.dialogue.advance(); });
    this.exposeDebug();
    await tick();

    L(1, 'جاهز');
    this.ui.hideLoading();
    this.resize();
    this._last = performance.now();
    requestAnimationFrame(() => this.loop());
    // بدء تلقائي بعد إعادة التحميل
    const auto = sessionStorage.getItem('bab.autostart');
    sessionStorage.removeItem('bab.autostart');
    this.state = 'title';
    this.ui.showTitle(!!SaveStore.latest());
    this.world.update(0.016, 0, this.sky);
    if (auto === 'new' || params.get('autostart') === 'new') setTimeout(() => this.newGame(true), 50);
    else if (params.get('autostart') === 'continue') setTimeout(() => this.continueGame(), 50);
  }

  // ───────── الجودة والعرض ─────────
  _setupPost() {
    const q = QUALITY[this.settings.quality];
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!q.post) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x * q.pixelRatio, size.y * q.pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.7, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(q.pixelRatio); this.composer.setSize(size.x, size.y);
  }

  applyQuality(first = false) {
    const q = QUALITY[this.settings.quality];
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = q.shadows;
    this.sky.setQuality(q);
    this.world.setQuality(q);
    this.npcs.ambient.forEach((n, i) => { n.disabledByQuality = i >= q.npcAmbient; if (n.disabledByQuality) n.setVisible(false); else if (!n.goingHome) n.setVisible(true); });
    if (!first) {
      this._setupPost();
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
    }
  }
  setQuality(name) { this.settings.quality = name; this.applyQuality(); this.saveSettings(); }
  saveSettings() { SaveStore.settings.write(this.settings); }
  applySettings() { this.audio.applySettings(); this.ui.syncSettings(); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); }
  }

  project(v) {
    const p = v.clone().project(this.camera);
    const behind = p.z > 1;
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, behind };
  }

  // ───────── الحالات ─────────
  setState(s) {
    this.state = s;
    document.body.dataset.state = s;
    if (s === 'dialogue' && document.pointerLockElement) { this.suppressPause = true; document.exitPointerLock(); setTimeout(() => (this.suppressPause = false), 300); }
  }
  isPlaying() { return this.state === 'play'; }

  // ───────── لعبة جديدة / متابعة ─────────
  async newGame(force = false) {
    await this.audio.init(); await this.audio.resume();
    if (this.dirty && !force) { sessionStorage.setItem('bab.autostart', 'new'); location.reload(); return; }
    this.ui.hideTitle(); this.ui.show('ending', false);
    this.story.reset();
    this.dirty = true;
    this.hour = START_HOUR;
    this.player.teleport(2.5, 6.8, Math.PI);
    this.player.camYaw = 0; this.player.camPitch = 0.28;
    this.ui.fade(true, 400);
    await new Promise((r) => setTimeout(r, 450));
    this.ui.fade(false, 600);
    this.cinematic.play(() => this.enterPlay(true));
  }

  continueGame() {
    const sv = SaveStore.latest();
    if (!sv) return;
    this.audio.init().then(() => this.audio.resume()).then(() => {
      this.ui.hideTitle(); this.dirty = true;
      this.loadData(sv.data);
      this.ui.fade(true, 300);
      setTimeout(() => { this.enterPlay(false); this.ui.fade(false, 600); this.ui.toast('تم تحميل الحفظ', '', sv.data.summary); }, 350);
    });
  }

  enterPlay(fresh) {
    this.camRig.follow();
    this.camRig.snapFollow();
    this.setState('play');
    this.ui.showHud(true);
    this.updateObjectiveUI();
    this.updateMood();
    if (fresh) {
      this.ui.toast('اقترب من الأشخاص والأغراض واضغط E للتفاعل', '', 'انقر على اللعبة لقفل المؤشر · Shift للركض');
      this.autosave();
    }
    this.canvas.focus();
  }

  // ───────── التفاعل ─────────
  initInteractables() {
    const L = this.world.layout, npcs = this.npcs;
    const npcI = (id, label) => ({
      id: 'npc:' + id, label: () => label, radius: 2.4,
      pos: () => npcs.get(id).pos,
      enabled: () => npcs.get(id).visible,
      run: () => this.dialogue.start(id),
    });
    this.interactables = [
      npcI('abuJalal', 'تحدّث مع أبو جلال'),
      npcI('aqeed', 'تحدّث مع العكيد'),
      npcI('umHasan', 'تحدّث مع أم حسن'),
      {
        id: 'peddler', label: () => 'اسأل البائع الجوّال', radius: 2.2, pos: () => npcs.get('peddler').pos, enabled: () => npcs.get('peddler').visible,
        run: () => { const free = this.story.flag('peddler_released'); const arr = free ? BARKS.peddlerFree : BARKS.peddler; this.ui.bark(npcs.get('peddler'), arr[(Math.random() * arr.length) | 0], 3600); this.audio.click(); },
      },
      {
        id: 'grocer', label: () => 'حيِّ البقّال', radius: 2.6, pos: () => npcs.get('grocer').pos, enabled: () => true,
        run: () => { this.ui.bark(npcs.get('grocer'), ['تفضّل يا ابني، الخضار طازة اليوم!', 'الله يعطيك العافية، شو بدك؟', 'بكرا بيوصل الشحن، اليوم الموجود هيدا.'][(Math.random() * 3) | 0], 3600); this.audio.click(); },
      },
      { id: 'table', label: () => 'افحص الطاولة الخلفية', radius: 1.9, pos: () => new THREE.Vector3(2.4, 0.15, -8.4), enabled: () => true, run: () => this.examine('table') },
      { id: 'prints', label: () => 'افحص آثار الأقدام', radius: 2.2, pos: () => new THREE.Vector3(L.prints.x, 0, L.prints.z), enabled: () => true, run: () => this.examine('prints') },
      { id: 'niche', label: () => 'افحص المصطبة الحجرية', radius: 2.0, pos: () => new THREE.Vector3(L.niche.x, 0.3, L.niche.z), enabled: () => true, run: () => this.examine('niche') },
      { id: 'gate', label: () => 'انظر إلى باب الحارة', radius: 4.5, pos: () => new THREE.Vector3(0, 0, 11.5), enabled: () => true, run: () => this.examine('gate') },
      { id: 'fountain', label: () => 'انظر إلى البحرة', radius: 4.2, pos: () => new THREE.Vector3(0, 0, 2), enabled: () => true, run: () => this.examine('fountain') },
    ];
  }

  examine(key) {
    const r = EXAMINE[key](this.story);
    if (key === 'table' || key === 'niche') this.audio.paper();
    this.dialogue.startThought(r.lines, r.fx);
  }

  findNearest() {
    const p = this.player.pos;
    const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    let best = null, bd = 1e9;
    for (const it of this.interactables) {
      if (!it.enabled()) continue;
      const ip = it.pos(), dx = ip.x - p.x, dz = ip.z - p.z, d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      const facing = (dx * fwd.x + dz * fwd.z) / (d || 1);
      const score = d - facing * 0.6;
      if (facing < -0.3 && d > 1.2) continue;
      if (score < bd) { bd = score; best = it; }
    }
    return best;
  }

  // ───────── القصة ─────────
  bindStory() {
    const s = this.story;
    s.on('clue', ({ clue }) => { this.ui.toast('دليل جديد: ' + clue.title, 'clue', clue.kind); this.audio.clue(); this.updateObjectiveUI(); });
    s.on('item', ({ item }) => { this.ui.toast('حصلت على: ' + item.name, 'item'); this.audio.item(); this.updateObjectiveUI(); });
    s.on('trust', ({ id, delta, value }) => {
      const m = TRUST_META[id];
      if (!delta) return;
      this.ui.toast(`ثقة ${m.name} ${delta > 0 ? '↑' : '↓'} (${delta > 0 ? '+' : ''}${delta})`, delta > 0 ? 'up' : 'down', `الآن: ${value}`);
      delta > 0 ? this.audio.trustUp() : this.audio.trustDown();
    });
    s.on('rep', ({ axis, delta }) => this.ui.toast(`السمعة — ${REP_META[axis].name} ${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 'up' : 'down'));
    s.on('questStart', () => { this.ui.banner(QUEST.title, QUEST.label); this.updateObjectiveUI(); });
    s.on('flag', () => this.updateObjectiveUI());
    s.on('detainPeddler', () => this.detainPeddler());
    s.on('releasePeddler', () => this.releasePeddler());
    s.on('ending', ({ id }) => { this.pendingEnding = id; });
  }

  detainPeddler(instant = false) {
    const n = this.npcs.get('peddler');
    n.char.setSit(false); n.sit = false; n.blocks = true;
    n.char.setExpression('worried');
    const spot = { x: 6.2, z: 8.2 };
    n.home = { x: spot.x, z: spot.z, yaw: -Math.PI / 2 };
    if (instant) { n.pos.set(spot.x, 0, spot.z); n.yaw = -Math.PI / 2; n.override = null; }
    else n.override = { x: spot.x, z: spot.z, speed: 1.8, onArrive: () => { n.yaw = -Math.PI / 2; } };
    if (!instant) { this.ui.toast('العكيد أوقف البائع الجوّال عند البوابة!', 'alert', 'أسرع قبل أن يقع ظلم'); this.audio.alarm(); }
    this.updateMood();
  }
  releasePeddler(instant = false) {
    const n = this.npcs.get('peddler');
    n.sit = false; n.char.setSit(false); n.char.setExpression('neutral');
    if (instant) { n.setVisible(false); return; }
    n.override = { x: 0.5, z: 14.2, speed: 1.4, free: true, onArrive: () => n.setVisible(false) };
    n.blocks = false;
    this.ui.toast('أُطلق سراح البائع الجوّال', 'up');
    this.updateMood();
  }

  updateMood() {
    const s = this.story;
    let m = 'calm';
    if (s.ending) m = ENDINGS[s.ending].mood;
    else if (s.flag('peddler_detained') && !s.flag('peddler_released')) m = 'tension';
    this.audio.setMood(m);
  }

  updateObjectiveUI() {
    const o = this.story.objective();
    let tag = '';
    if (!this.story.ending && this.story.flag('met_aj')) tag = QUEST.label;
    this.ui.setObjective(o.text, tag);
  }

  // مواضع الأهداف (للعلامات والخريطة)
  objectiveTargets() {
    const s = this.story, L = this.world.layout, out = [];
    const o = s.objective().id;
    const aj = this.npcs.get('abuJalal').pos;
    if (o === 'talk_aj' || o === 'return_watch') out.push({ id: 'aj', x: aj.x, y: 2.3, z: aj.z, label: 'أبو جلال' });
    else if (o === 'investigate') {
      if (!s.hasClue('c_chain')) out.push({ id: 'table', x: 2.4, y: 1.2, z: -8.4, label: 'الطاولة الخلفية' });
      else if (!s.hasClue('c_prints')) out.push({ id: 'prints', x: L.prints.x, y: 0.4, z: L.prints.z, label: 'آثار الأقدام' });
      else out.push({ id: 'niche', x: L.niche.x, y: 1.0, z: L.niche.z, label: 'المصطبة' });
    } else if (o === 'search_niche') out.push({ id: 'niche', x: L.niche.x, y: 1.0, z: L.niche.z, label: 'المصطبة الحجرية' });
    if (s.flag('peddler_detained') && !s.flag('peddler_released') && !s.ending) { const a = this.npcs.get('aqeed').pos; out.push({ id: 'aq', x: a.x, y: 2.3, z: a.z, label: 'العكيد' }); }
    const p = this.player.pos;
    for (const m of out) m.dist = Math.hypot(m.x - p.x, m.z - p.z);
    return out;
  }

  afterDialogue() {
    this.updateObjectiveUI();
    this.updateMood();
    this.autosave();
    if (this.pendingEnding) { const id = this.pendingEnding; this.pendingEnding = null; setTimeout(() => this.runEnding(id), 900); }
  }

  runEnding(id) {
    this.setState('ending');
    document.body.classList.add('cine');
    this.ui.fade(true, 700);
    this.updateMood();
    setTimeout(() => {
      this.ui.showHud(false);
      this.ui.openEnding(this.story.summary());
      this.ui.fade(false, 900);
      this.audio.bell(523, 0.14); this.audio.bell(784, 0.12, 0.2);
      this.autosave();
    }, 800);
  }

  endContinue() {
    this.ui.show('ending', false);
    document.body.classList.remove('cine');
    this.setState('play');
    this.ui.showHud(true);
    this.updateObjectiveUI();
  }

  toTitle() { sessionStorage.removeItem('bab.autostart'); location.reload(); }

  // ───────── الحفظ ─────────
  snapshot() {
    return {
      v: 1, ts: Date.now(), hour: this.hour,
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw, camYaw: this.player.camYaw },
      story: this.story.serialize(),
      summary: `${formatClock(this.hour)} — ${this.story.objective().text}`,
    };
  }
  autosave() { if (this.state === 'loading' || this.state === 'title' || this.state === 'cinematic') return; SaveStore.write('auto', this.snapshot()); this.autosaveT = 0; }
  manualSave() { SaveStore.write('manual', this.snapshot()); this.ui.toast('تم الحفظ', '', formatClock(this.hour)); this.audio.save(); }
  loadData(d) {
    this.story.load(d.story);
    this.hour = d.hour;
    this.player.teleport(d.player.x, d.player.z, d.player.yaw);
    this.player.camYaw = d.player.camYaw || 0;
    this.restoreWorld();
  }
  restoreWorld() {
    const s = this.story;
    if (s.flag('peddler_released') || s.ending) this.releasePeddler(true);
    else if (s.flag('peddler_detained')) this.detainPeddler(true);
    // الأولاد والعابرون في المساء
    this.npcs.list.forEach((n) => { if (n.scheduleHome && this.hour >= n.scheduleHome.at) { n.goingHome = true; n.setVisible(false); } });
  }

  // ───────── القوائم ─────────
  openPause() {
    if (this.state !== 'play') return;
    this.prevState = 'play';
    this.setState('paused');
    this.ui.show('pause', true);
    this.audio.pauseMusic(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  pauseAction(a) {
    if (a === 'resume') this.closePanel('pause');
    else if (a === 'journal') { this.ui.show('pause', false); this.fromPause = true; this.overlay = 'journal'; this.ui.openJournal(); }
    else if (a === 'map') { this.ui.show('pause', false); this.fromPause = true; this.overlay = 'map'; this.openMap(); }
    else if (a === 'save') this.manualSave();
    else if (a === 'load') { const d = SaveStore.read('manual'); if (!d) this.ui.toast('لا يوجد حفظ يدوي', 'down'); else { this.loadData(d); this.closePanel('pause'); this.ui.toast('تم التحميل', '', d.summary); } }
    else if (a === 'settings') { this.ui.show('pause', false); this.fromPause = true; this.overlay = 'settings'; this.ui.openSettings('pause'); }
    else if (a === 'title') this.toTitle();
  }
  openMap() { this.ui.show('map', true); this.ui.drawFullMap(this, this.objectiveTargets()); this.audio.paper(); }
  closePanel(id) {
    this.ui.show(id, false);
    if (id === 'about') return;
    if (id === 'settings' && this.state === 'title') return;
    if (id === 'pause') { this.audio.pauseMusic(false); this.setState('play'); this.overlay = null; return; }
    if (this.fromPause) { this.fromPause = false; this.overlay = null; this.ui.show('pause', true); return; }
    // مفتوح من اللعب مباشرة
    this.overlay = null; this.audio.pauseMusic(false); this.setState('play');
  }
  openOverlay(name) {
    if (this.state !== 'play') return;
    this.setState('paused'); this.fromPause = false; this.overlay = name;
    this.audio.pauseMusic(true);
    if (document.pointerLockElement) document.exitPointerLock();
    if (name === 'journal') this.ui.openJournal(); else if (name === 'map') this.openMap();
  }

  // ───────── لوحة المفاتيح ─────────
  onKey(e) {
    const st = this.state;
    if (st === 'title' || st === 'loading') { if (e.code === 'Escape') ['about', 'settings'].forEach((p) => this.ui.show(p, false)); return; }
    if (st === 'cinematic') { if (['Space', 'Escape', 'Enter'].includes(e.code)) this.cinematic.skip(); return; }
    if (st === 'dialogue') {
      if (['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); this.dialogue.advance(); }
      else if (/^Digit[1-9]$/.test(e.code)) this.dialogue.choose(parseInt(e.code.slice(5)) - 1);
      return;
    }
    if (st === 'play') {
      if (e.code === 'Escape') this.openPause();
      else if (e.code === 'KeyE') { if (this.nearest) this.nearest.run(); }
      else if (e.code === 'KeyJ') this.openOverlay('journal');
      else if (e.code === 'KeyI') { this.openOverlay('journal'); this.ui.journalTab('items'); }
      else if (e.code === 'KeyM') this.openOverlay('map');
      else if (e.code === 'F5') { e.preventDefault(); this.manualSave(); }
      return;
    }
    if (st === 'paused') {
      if (e.code === 'Escape' || e.code === 'KeyJ' || e.code === 'KeyM') {
        if (this.overlay) this.closePanel(this.overlay); else this.closePanel('pause');
      }
      return;
    }
    if (st === 'ending') return;
  }

  // ───────── الحلقة ─────────
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time += dt;
    this.update(dt);
    this.render();
  }

  update(dt) {
    const st = this.state;
    const sim = st !== 'loading';
    // الزمن
    if (st === 'play') {
      this.hour += (dt * TIME_SCALE) / 3600;
      this.playTime += dt; this.autosaveT += dt;
      if (this.autosaveT > 60) this.autosave();
    }
    if (st === 'title') this.hour = 17.0;

    this.sky.update(this.hour, this.player ? this.player.pos : new THREE.Vector3());
    this.world.update(dt, this.time, this.sky);
    if (sim) {
      const paused = st === 'paused';
      if (!paused) { this.npcs.update(dt, this.time); }
      // اللاعب
      if (this.player) {
        const canMove = st === 'play';
        if (!paused) this.player.update(dt, this.time, canMove);
        if (st === 'dialogue') this.playerChar.update(dt, this.time);
        else if (st !== 'play' && !paused) this.playerChar.update(dt, this.time);
      }
    }
    if (st === 'title') this.titleCamera();
    else if (st === 'cinematic') this.cinematic.update(dt);
    if (st === 'dialogue') this.dialogue.update(dt);

    // أحداث زمنية
    if (st === 'play') this.timedEvents(dt);

    // HUD
    if (st === 'play' || st === 'dialogue') {
      this.ui.setClock(this.hour, this.sky.nightFactor > 0.4);
      this.updateInteractionHUD();
      this.ui.updateBarks(dt, (v) => this.project(v));
      this._miniT -= dt;
      if (this._miniT <= 0 && st === 'play') { this._miniT = 0.1; this.ui.drawMaps(this, this.objectiveTargets()); }
    }
    if (st === 'play' && this.settings.objectiveMarker) this.ui.updateMarkers(this.objectiveTargets(), (v) => this.project(v));
    else this.ui.updateMarkers([], () => null);

    // الكاميرا والصوت
    if (st !== 'paused' || this.camera) this.camRig.update(dt);
    this.sky.followCamera(this.camera);
    const keyT = st === 'dialogue' && this.dialogue.mode === 'tree' ? 2.6 : 0;
    this.keyLight.intensity += (keyT - this.keyLight.intensity) * Math.min(1, dt * 4);
    this.keyLight.position.copy(this.camera.position).add(new THREE.Vector3(0.4, 0.5, 0));
    this.audio.update(dt, this.camera, { day: this.sky.dayFactor, night: this.sky.nightFactor, dusk: this.sky.duskFactor });
    this.autoQuality(dt);
  }

  titleCamera() {
    const t = this.time * 0.05;
    const rig = this.camRig; rig.cine();
    rig.pos.set(Math.sin(t) * 7.5, 2.4 + Math.sin(t * 0.6) * 0.5, 9.5 + Math.cos(t * 0.8) * 1.5);
    rig.look.set(Math.sin(t) * 2, 2.6, -5);
    rig.fovTarget = 52; rig.fov = 52;
    this.player.char.root.visible = false;
  }

  timedEvents(dt) {
    const s = this.story;
    this.player.char.root.visible = true;
    // المغرب: العكيد يوقف البائع إن لم تُحسم القضية
    if (!s.ending && s.flag('met_aj') && this.hour >= DETAIN_HOUR && !s.flag('peddler_detained') && !s.flag('peddler_released')) {
      s.setFlag('peddler_detained', true); s.setFlag('forced_detain', true);
      this.detainPeddler();
      s.log('انقضت مهلة العكيد فأوقف البائع.');
    }
    // عبارات عابرة
    this._barkT -= dt;
    if (this._barkT <= 0) {
      this._barkT = 6 + Math.random() * 8;
      const p = this.player.pos;
      const cand = this.npcs.ambient.filter((n) => n.visible && Math.hypot(n.pos.x - p.x, n.pos.z - p.z) < 4.5);
      if (cand.length) { const n = cand[(Math.random() * cand.length) | 0]; this.ui.bark(n, this.npcs.barkFor(n)); }
    }
  }

  updateInteractionHUD() {
    if (this.state !== 'play') { this.nearest = null; this.ui.setPrompt(null); return; }
    this.nearest = this.findNearest();
    this.ui.setPrompt(this.nearest ? this.nearest.label() : null);
  }

  autoQuality(dt) {
    if (!this.settings.autoQuality || this.state !== 'play') { this.fpsAcc = { t: 0, n: 0 }; return; }
    this.fpsAcc.t += dt; this.fpsAcc.n++;
    if (this.fpsAcc.t > 5) {
      const avg = this.fpsAcc.t / this.fpsAcc.n;
      this.fpsAcc = { t: 0, n: 0 };
      if (avg > 0.045) {
        const order = ['high', 'medium', 'low'];
        const i = order.indexOf(this.settings.quality);
        if (i >= 0 && i < order.length - 1) {
          this.setQuality(order[i + 1]);
          this.ui.toast('خُفّضت الجودة الرسومية تلقائياً', '', 'يمكنك تغييرها من الإعدادات');
        }
      }
    }
  }

  render() {
    this.renderer.toneMappingExposure = this.sky.exposure;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // ───────── واجهة تصحيح (للاختبارات الآلية) ─────────
  exposeDebug() {
    window.__bab = {
      game: this, story: this.story,
      teleport: (x, z, yaw) => this.player.teleport(x, z, yaw),
      setHour: (h) => { this.hour = h; },
      skipCinematic: () => this.cinematic.skip(),
      cineSeek: (a, b) => this.cinematic.seek(a, b),
      state: () => this.state,
      info: () => ({ ...this.renderer.info.render, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures }),
      ready: () => !!this.player,
    };
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); document.getElementById('loadText').textContent = 'تعذّر تشغيل اللعبة: ' + e.message; });
