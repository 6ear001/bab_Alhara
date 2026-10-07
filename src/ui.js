// الواجهة العربية (RTL): HUD، حوار، دفتر، خريطة، إعدادات، شاشة النهاية
import * as THREE from 'three';
import { formatClock, WORLD } from './config.js';
import { CLUES, ITEMS, TRUST_META, REP_META, QUEST, leads, deriveObjective } from './story/data.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.g = game;
    this.barks = new Map();
    this.markerEls = new Map();
    this._bindStatic();
    this._staticMap = null;
  }

  // ───────── ربط عناصر ثابتة ─────────
  _bindStatic() {
    const g = this.g;
    $('btnNew').onclick = () => { g.audio.click(); g.newGame(); };
    $('btnContinue').onclick = () => { g.audio.click(); g.continueGame(); };
    $('btnSettings').onclick = () => { g.audio.click(); this.openSettings('title'); };
    $('btnAbout').onclick = () => { g.audio.click(); this.show('about', true); };
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { g.audio.click(); g.closePanel(b.dataset.close); }));
    document.querySelectorAll('#pause [data-act]').forEach((b) => (b.onclick = () => { g.audio.click(); g.pauseAction(b.dataset.act); }));
    document.querySelectorAll('#journalTabs button').forEach((b) => (b.onclick = () => { g.audio.click(); this.journalTab(b.dataset.tab); }));
    $('dialogue').addEventListener('click', (e) => { if (e.target.closest('.choice')) return; g.dialogue.advance(); });
    $('endContinue').onclick = () => { g.audio.click(); g.endContinue(); };
    $('endAgain').onclick = () => { g.audio.click(); g.newGame(); };
    $('endTitleBtn').onclick = () => { g.audio.click(); g.toTitle(); };
    this._bindSettings();
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  _bindSettings() {
    const g = this.g, s = g.settings;
    const apply = () => { g.saveSettings(); g.applySettings(); };
    const seg = (id, key, parse = (v) => v, after) => {
      $(id).querySelectorAll('button').forEach((b) => (b.onclick = () => { g.audio.click(); s[key] = parse(b.dataset.v); this.syncSettings(); apply(); after && after(); }));
    };
    seg('setQuality', 'quality', (v) => v, () => g.setQuality(s.quality));
    seg('setSubSize', 'subtitleSize', parseFloat);
    const rng = (id, key) => ($(id).oninput = (e) => { s[key] = parseFloat(e.target.value); apply(); });
    rng('setMaster', 'master'); rng('setMusic', 'music'); rng('setSfx', 'sfx'); rng('setAmb', 'ambience'); rng('setVoice', 'voice'); rng('setSens', 'sensitivity');
    const chk = (id, key) => ($(id).onchange = (e) => { s[key] = e.target.checked; apply(); });
    chk('setSubs', 'subtitles'); chk('setInv', 'invertY'); chk('setMarker', 'objectiveMarker'); chk('setBV', 'browserVoice'); chk('setAutoQ', 'autoQuality');
  }

  syncSettings() {
    const s = this.g.settings;
    $('setQuality').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.quality));
    $('setSubSize').querySelectorAll('button').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.v) === s.subtitleSize));
    $('setMaster').value = s.master; $('setMusic').value = s.music; $('setSfx').value = s.sfx; $('setAmb').value = s.ambience; $('setVoice').value = s.voice; $('setSens').value = s.sensitivity;
    $('setSubs').checked = s.subtitles; $('setInv').checked = s.invertY; $('setMarker').checked = s.objectiveMarker; $('setBV').checked = s.browserVoice; $('setAutoQ').checked = s.autoQuality;
    document.documentElement.style.setProperty('--subk', s.subtitleSize);
  }

  // ───────── التحميل والقائمة ─────────
  setLoading(p, text) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; }
  hideLoading() { $('loading').classList.add('hidden'); }
  showTitle(hasSave) { this.show('title', true); $('btnContinue').disabled = !hasSave; }
  hideTitle() { this.show('title', false); }
  fade(on, ms = 800) { const f = $('fade'); f.style.transition = `opacity ${ms}ms`; f.classList.toggle('on', on); }

  // ───────── HUD ─────────
  showHud(on) { this.show('hud', on); }
  setClock(hour, night) {
    $('clockTime').textContent = formatClock(hour);
    $('clockIcon').className = night ? 'moon' : 'sun';
  }
  setObjective(text, tag) {
    if ($('objText').textContent !== text) {
      $('objText').textContent = text;
      const o = $('objective'); o.style.transition = 'none'; o.style.transform = 'translateY(-4px)'; requestAnimationFrame(() => { o.style.transition = 'transform .3s'; o.style.transform = ''; });
    }
    $('objTag').textContent = tag || '';
  }
  setPrompt(text) {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden'); $('promptText').textContent = text;
  }
  toast(msg, kind = '', sub = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4300);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  subtitle(text) {
    const el = $('subtitle');
    if (!text || !this.g.settings.subtitles) { el.classList.add('hidden'); return; }
    el.textContent = text; el.classList.remove('hidden');
  }
  card(title, sub, label) {
    $('cardTitle').textContent = title; $('cardSub').textContent = sub || ''; $('cardLabel').textContent = label || '';
    const c = $('card'); c.classList.remove('hidden');
    const ci = c.querySelector('.card-in'); ci.style.animation = 'none'; void ci.offsetWidth; ci.style.animation = '';
    setTimeout(() => c.classList.add('hidden'), 7000);
  }
  banner(title, label) {
    $('bannerTitle').textContent = title; $('bannerLabel').textContent = label;
    const c = $('banner'); c.classList.remove('hidden');
    const ci = c.querySelector('.banner-in'); ci.style.animation = 'none'; void ci.offsetWidth; ci.style.animation = '';
    setTimeout(() => c.classList.add('hidden'), 6000);
  }
  skipHint(on) { this.show('skipHint', on); }

  // عبارات عابرة فوق رؤوس السكان
  bark(npc, text, ms = 3200) {
    if (this.barks.has(npc)) return;
    const el = document.createElement('div'); el.className = 'bark'; el.textContent = text;
    $('barks').appendChild(el);
    this.barks.set(npc, { el, t: ms / 1000 });
  }
  updateBarks(dt, project) {
    for (const [npc, b] of this.barks) {
      b.t -= dt;
      if (b.t <= 0 || !npc.visible) { b.el.remove(); this.barks.delete(npc); continue; }
      const v = npc.char.headWorld(new THREE.Vector3()); v.y += 0.3;
      const p = project(v);
      if (!p || p.behind) { b.el.style.display = 'none'; continue; }
      b.el.style.display = ''; b.el.style.left = p.x + 'px'; b.el.style.top = p.y + 'px';
    }
  }
  clearBarks() { for (const [, b] of this.barks) b.el.remove(); this.barks.clear(); }

  // علامة الهدف على الشاشة
  updateMarkers(list, project) {
    const used = new Set();
    for (const m of list) {
      used.add(m.id);
      let el = this.markerEls.get(m.id);
      if (!el) { el = document.createElement('div'); el.className = 'marker'; el.innerHTML = '<div class="gem"></div><div class="lbl"></div>'; $('markers').appendChild(el); this.markerEls.set(m.id, el); }
      const p = project(new THREE.Vector3(m.x, m.y, m.z));
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = '';
      const mx = 50, my = 70;
      let x = p.x, y = p.y, edge = false;
      if (p.behind) { x = innerWidth - x; y = innerHeight - 90; edge = true; }
      if (x < mx || x > innerWidth - mx || y < my || y > innerHeight - my) edge = true;
      x = Math.min(innerWidth - mx, Math.max(mx, x)); y = Math.min(innerHeight - my - 40, Math.max(my + 40, y));
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.classList.toggle('edge', edge);
      el.querySelector('.lbl').textContent = `${m.label} · ${Math.round(m.dist)}م`;
    }
    for (const [id, el] of this.markerEls) if (!used.has(id)) { el.remove(); this.markerEls.delete(id); }
  }

  // ───────── الحوار ─────────
  openDialogue(tree) {
    document.body.classList.add('talk'); document.body.classList.toggle('thought', !tree);
    this.show('dialogue', true); this.setDialogueText('', false); this.hideChoices();
    this.show('prompt', false); $('hud').style.opacity = '0.0';
    this.clearBarks();
  }
  closeDialogue() {
    document.body.classList.remove('talk', 'thought');
    this.show('dialogue', false); $('hud').style.opacity = '';
  }
  setSpeaker(name, role, isPlayer) { $('dlgName').textContent = name; $('dlgRole').textContent = role || ''; }
  setDialogueText(text, showNext) {
    $('dlgText').textContent = text;
    $('dlgNext').classList.toggle('hidden', !showNext);
  }
  showChoices(list, cb) {
    const box = $('dlgChoices'); box.innerHTML = '';
    list.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice' + (c.locked ? ' locked' : '');
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t"></span>`;
      b.querySelector('.t').textContent = c.text;
      if (c.locked && c.lock) { const l = document.createElement('span'); l.className = 'lock'; l.textContent = '🔒 ' + c.lock; b.appendChild(l); }
      b.onmouseenter = () => !c.locked && this.g.audio.hover();
      b.onclick = () => cb(i);
      box.appendChild(b);
    });
    $('dlgNext').classList.add('hidden');
  }
  hideChoices() { $('dlgChoices').innerHTML = ''; }

  // ───────── اللوحات ─────────
  openJournal(tab = 'quest') { this.show('journal', true); this.journalTab(tab); this.g.audio.paper(); }
  journalTab(tab) {
    document.querySelectorAll('#journalTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const s = this.g.story, body = $('journalBody');
    body.innerHTML = '';
    const el = (html, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; body.appendChild(d); return d; };
    if (tab === 'quest') {
      el(`<h5 style="font-family:var(--head);font-size:1.6rem;color:var(--gold2);margin:0">${QUEST.title}</h5>`);
      el(`<span class="orig">${QUEST.label}</span>`);
      const obj = deriveObjective(s);
      el(`<div class="jcard"><h5>الهدف الحالي</h5>${obj.text}</div>`);
      if (!s.ending) {
        if (s.flag('peddler_detained') && !s.flag('peddler_released')) el(`<div class="jcard" style="border-right-color:#e0453a"><h5>عاجل</h5>العكيد أوقف البائع الجوّال عند البوابة. أثبت براءته أو أعد الساعة قبل أن يقع ظلم.</div>`);
        else if (s.flag('deadline_known') && s.flag('met_aj')) el(`<div class="jcard" style="border-right-color:#e0453a"><h5>مهلة العكيد</h5>طلب العكيد جواباً قبل المغرب (6:20 م) وإلا تصرّف بنفسه.</div>`);
        el('<h5 style="font-family:var(--head);color:var(--gold2);margin:.8rem 0 .2rem">خيوط التحقيق</h5>');
        for (const l of leads(s)) el(`<span>${l.text}</span>`, 'lead' + (l.done ? ' done' : '')).insertAdjacentHTML('afterbegin', '<i></i>');
      }
    } else if (tab === 'clues') {
      if (!s.s.clues.length) el('<div class="jcard">لا أدلة بعد. تجوّل وافحص الأشياء واسأل الناس.</div>');
      for (const id of s.s.clues) { const c = CLUES[id]; el(`<h5>${c.title}</h5><div>${c.text}</div><small>${c.kind}</small>`, 'jcard'); }
    } else if (tab === 'relations') {
      el('<h5 style="font-family:var(--head);color:var(--gold2);margin:0 0 .3rem">الثقة بك</h5>');
      for (const [id, m] of Object.entries(TRUST_META)) {
        const v = s.trust(id);
        const mood = v >= 65 ? 'يثق بك كثيراً' : v >= 45 ? 'يحترمك' : v >= 25 ? 'متحفّظ' : 'لا يثق بك';
        el(`<div style="display:flex;justify-content:space-between"><span>${m.name} <small style="opacity:.7">— ${m.role}</small></span><span>${mood}</span></div><div class="bar"><i style="width:${v}%"></i><b>${v}</b></div>`);
      }
      el('<h5 style="font-family:var(--head);color:var(--gold2);margin:1rem 0 .3rem">السمعة</h5>');
      for (const [id, m] of Object.entries(REP_META)) {
        const v = s.rep(id);
        el(`<span>${m.name} <small style="opacity:.7">— ${m.desc}</small></span><b dir="ltr">${v > 0 ? '+' : ''}${v}</b>`, 'rep-row');
      }
    } else if (tab === 'items') {
      if (!s.s.items.length) el('<div class="jcard">الجرد فارغ.</div>');
      for (const id of s.s.items) { const it = ITEMS[id]; el(`<h5>${it.name}</h5><div>${it.text}</div>`, 'jcard'); }
    }
  }

  openSettings(from) { this.settingsFrom = from; this.syncSettings(); this.show('settings', true); }

  openEnding(sum) {
    $('endTitle').textContent = sum.title; $('endTag').textContent = sum.tag;
    $('endEpilogue').innerHTML = sum.epilogue.map((p) => `<p>${p}</p>`).join('');
    $('endTrust').innerHTML = sum.trust.map((t) => `<div style="display:flex;justify-content:space-between"><span>${t.name}</span><span><bdi dir="ltr">${t.from} → ${t.to}</bdi> <b dir="ltr" style="color:${t.to >= t.from ? '#8fd18f' : '#e0877d'}">${t.to - t.from >= 0 ? '+' : ''}${t.to - t.from}</b></span></div><div class="bar"><i style="width:${t.to}%"></i></div>`).join('');
    $('endRep').innerHTML = sum.rep.map((t) => `<div class="rep-row"><span>${t.name}</span><b dir="ltr" style="color:${t.to >= t.from ? '#8fd18f' : '#e0877d'}">${t.to > 0 ? '+' : ''}${t.to}</b></div>`).join('');
    $('endDecisions').innerHTML = (sum.decisions.length ? sum.decisions : ['لم تُسجَّل قرارات.']).map((d) => `<li>${d}</li>`).join('');
    this.show('ending', true);
  }

  // ───────── الخريطة ─────────
  _buildStaticMap(world, w, h) {
    const sc = w / (WORLD.x1 - WORLD.x0);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const X = (wx) => (wx - WORLD.x0) * sc, Z = (wz) => (wz - WORLD.z0) * sc;
    x.fillStyle = '#c4ac80'; x.fillRect(0, 0, w, h);
    // أرضية الساحة
    x.fillStyle = '#d2bd92'; x.fillRect(X(-14), Z(-10), 28 * sc, 22 * sc);
    for (const f of world.footprints) {
      x.fillStyle = f.kind === 'open' ? '#8a6a45' : '#4a3623';
      x.fillRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) * sc, (f.z1 - f.z0) * sc);
      x.strokeStyle = '#2a1b10'; x.lineWidth = 1.5; x.strokeRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) * sc, (f.z1 - f.z0) * sc);
    }
    // مصطبة الكافيه
    x.fillStyle = '#b8a07a'; x.fillRect(X(-9.5), Z(-10), 15 * sc, 4.6 * sc);
    // بحرة
    x.fillStyle = '#3f8f94'; x.beginPath(); x.arc(X(0), Z(2), 2.3 * sc, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#2a1b10'; x.lineWidth = 2; x.stroke();
    // أشجار
    x.fillStyle = '#4c7a3a';
    for (const t of world.trees.slice(0, 3)) { x.beginPath(); x.arc(X(t.position.x), Z(t.position.z), 1.2 * sc, 0, Math.PI * 2); x.fill(); }
    // الأسماء
    x.fillStyle = '#1b120b'; x.textAlign = 'center'; x.font = `700 ${Math.round(sc * 1.15)}px "Reem Kufi", serif`; x.direction = 'rtl';
    const L = [['المقهى', -2, -15], ['البحرة', 0, 5.3], ['البقالة', 20, -0.5], ['باب الحارة', 0, 17], ['الزقاق', -26, -4.2], ['المصطبة', -17, 7], ['بيت أم حسن', 20, 7.5], ['مركز العكيد', 9.5, 15.5]];
    for (const [t, wx, wz] of L) { x.fillStyle = '#f3e3b8'; x.fillText(t, X(wx), Z(wz)); }
    return c;
  }

  drawMaps(game, markers) {
    const w = game.world;
    // خريطة صغيرة
    const mini = $('minimap'), mc = mini.getContext('2d');
    if (!this._miniStatic) this._miniStatic = this._buildStaticMap(w, 1320, 880);
    const sc = 1320 / (WORLD.x1 - WORLD.x0);
    const p = game.player.pos, size = mini.width, range = 38;           // أمتار ظاهرة
    const k = size / range;                                              // بكسل/متر
    mc.save();
    mc.clearRect(0, 0, size, size);
    mc.beginPath(); mc.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); mc.clip();
    mc.fillStyle = '#1b120b'; mc.fillRect(0, 0, size, size);
    const sw = range * sc;
    mc.drawImage(this._miniStatic, (p.x - range / 2 - WORLD.x0) * sc, (p.z - range / 2 - WORLD.z0) * sc, sw, sw, 0, 0, size, size);
    this._drawMarkers(mc, game, (wx, wz) => [(wx - p.x) * k + size / 2, (wz - p.z) * k + size / 2], markers, 4, size);
    mc.restore();
  }

  drawFullMap(game, markers) {
    const cv = $('mapCanvas'), c = cv.getContext('2d');
    if (!this._fullStatic) this._fullStatic = this._buildStaticMap(game.world, cv.width, cv.height);
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(this._fullStatic, 0, 0);
    const sc = cv.width / (WORLD.x1 - WORLD.x0);
    this._drawMarkers(c, game, (wx, wz) => [(wx - WORLD.x0) * sc, (wz - WORLD.z0) * sc], markers, 9, null);
  }

  _drawMarkers(c, game, T, markers, r, clampSize) {
    // سكان
    for (const n of game.npcs.list) {
      if (!n.visible || n.sit) continue;
      if (!n.story && !n.ambient) continue;
      const [x, y] = T(n.pos.x, n.pos.z);
      c.fillStyle = n.story ? '#e8c77a' : '#cbb89a';
      c.beginPath(); c.arc(x, y, n.story ? r * 0.8 : r * 0.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#1b120b'; c.lineWidth = 1.5; c.stroke();
    }
    // أهداف
    for (const m of markers) {
      let [x, y] = T(m.x, m.z);
      if (clampSize) { const cx = clampSize / 2, d = Math.hypot(x - cx, y - cx), lim = clampSize / 2 - r * 2; if (d > lim) { x = cx + ((x - cx) / d) * lim; y = cx + ((y - cx) / d) * lim; } }
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillStyle = '#e0453a'; c.fillRect(-r, -r, r * 2, r * 2); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(-r, -r, r * 2, r * 2);
      c.restore();
    }
    // اللاعب
    const [px, py] = T(game.player.pos.x, game.player.pos.z);
    c.save(); c.translate(px, py); c.rotate(-game.player.yaw + Math.PI);
    c.fillStyle = '#6fd8a2'; c.strokeStyle = '#0d2a1a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -r * 1.6); c.lineTo(r * 1.1, r * 1.1); c.lineTo(0, r * 0.5); c.lineTo(-r * 1.1, r * 1.1); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}
