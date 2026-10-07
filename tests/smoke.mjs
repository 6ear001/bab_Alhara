// اختبار دخان آلي: يلعب اللعبة فعلياً في متصفح حقيقي (Chromium + WebGL) عبر لوحة المفاتيح.
// التشغيل:  node scripts/serve.mjs 8099 &  ثم  PW_CORE=<مسار playwright-core> node tests/smoke.mjs [scenario...]
// المتغيرات: BASE (الافتراضي http://localhost:8099) · OUT (مجلد لقطات الشاشة) · CHROME (مسار Chromium)
import fs from 'node:fs';

const { chromium } = await import(process.env.PW_CORE || 'playwright-core');
const BASE = process.env.BASE || 'http://localhost:8099';
const OUT = process.env.OUT || new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const logs = [];
let failures = 0;
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
};

async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  return browser;
}

async function newPage(browser, q = 'low') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(`${BASE}/index.html?q=${q}&autoq=0`);
  await page.waitForFunction('window.__bab && window.__bab.state()==="title"', { timeout: 180000 });
  return page;
}

const G = (page, fn, arg) => page.evaluate(fn, arg);
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png' });

async function startNew(page) {
  await page.click('#btnNew');
  await page.waitForFunction('window.__bab.state()==="cinematic"', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await shot(page, 'cinematic1');
  await page.keyboard.press('Space');
  await page.waitForFunction('window.__bab.state()==="play"', { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function teleportTo(page, x, z, yaw) {
  await G(page, ([x, z, yaw]) => { __bab.teleport(x, z, yaw); const p = __bab.game.player; p.camYaw = yaw + Math.PI; }, [x, z, yaw]);
  await page.waitForTimeout(250);
}

async function interact(page, expectId) {
  // انتظر حتى يظهر هدف التفاعل
  await page.waitForFunction((id) => __bab.game.nearest && (!id || __bab.game.nearest.id === id), expectId, { timeout: 8000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction('window.__bab.state()==="dialogue"', { timeout: 5000 });
}

// يقود الحوار: picks = قائمة نصوص جزئية للخيارات بالترتيب
async function runDialogue(page, picks = [], { shotName } = {}) {
  let pi = 0, shotTaken = false;
  for (let guard = 0; guard < 600; guard++) {
    const info = await G(page, () => { const d = __bab.game.dialogue; return { active: d.active, state: d.state, choices: d.state === 'choices' ? d.choices.map((v) => ({ t: v.ch.t, ok: v.ok })) : null }; });
    if (!info.active) return true;
    if (info.state === 'waiting' || info.state === 'typing') {
      if (shotName && !shotTaken && info.state === 'waiting') { await shot(page, shotName); shotTaken = true; }
      await page.keyboard.press('Space');
    } else if (info.state === 'choices') {
      if (shotName && !shotTaken) { await shot(page, shotName + '_choices'); shotTaken = true; }
      const want = picks[pi++];
      const idx = info.choices.findIndex((c) => c.ok && want && c.t.includes(want));
      if (idx < 0) throw new Error(`لا يوجد خيار "${want}" بين: ${info.choices.map((c) => c.t).join(' | ')}`);
      await page.keyboard.press('Digit' + (idx + 1));
    }
    await page.waitForTimeout(70);
  }
  throw new Error('الحوار لم ينتهِ');
}

const story = (page, key) => G(page, (k) => { const s = __bab.story; return k === 'ending' ? s.ending : k.startsWith('flag:') ? s.flag(k.slice(5)) : k.startsWith('trust:') ? s.trust(k.slice(6)) : k.startsWith('item:') ? s.hasItem(k.slice(5)) : k.startsWith('clue:') ? s.hasClue(k.slice(5)) : null; }, key);

// خطوات مشتركة
// (x, z, yaw) — اللاعب يقف قرب الهدف ويواجهه؛ yaw=0 يعني النظر نحو +z، وπ نحو −z، وπ/2 نحو +x
const Z = { aj: [-1.6, -5.4, Math.PI], table: [2.4, -6.7, Math.PI], um: [10.6, 7.3, Math.PI / 2], aq: [8.0, 7.2, 0], prints: [-3.6, 3.4, 0], niche: [-11.1, 7.3, -Math.PI / 2] };
async function talk(page, who, picks, opts) {
  const [x, z, yaw] = Z[who];
  await teleportTo(page, x, z, yaw);
  await interact(page, 'npc:' + { aj: 'abuJalal', um: 'umHasan', aq: 'aqeed' }[who]);
  await runDialogue(page, picks, opts);
}
async function examine(page, key, id) {
  const [x, z, yaw] = Z[key];
  await teleportTo(page, x, z, yaw);
  await interact(page, id || key);
  await runDialogue(page, []);
}

const SCENARIOS = {
  // 1) مسار «الستر» مع معاملة أم حسن بلطف — ويشمل لقطات التقاط الواجهة
  async sitr(browser) {
    const page = await newPage(browser);
    await startNew(page);
    check('بدأ اللعب بعد المشهد الافتتاحي', (await G(page, () => __bab.state())) === 'play');
    await shot(page, 'play_start');

    await talk(page, 'aj', ['مين كان قاعد', 'احكيلي', 'طمّن بالك', 'ماشي'], { shotName: 'dialogue_aj' });
    check('بدأت المهمة (met_aj)', await story(page, 'flag:met_aj'));
    check('أضيف دليل الشهود', await story(page, 'clue:c_witnesses'));
    check('ثقة أبو جلال زادت بعد الطمأنة', (await story(page, 'trust:abuJalal')) === 60, 'trust=' + (await story(page, 'trust:abuJalal')));

    await examine(page, 'table');
    check('وُجدت السلسلة', (await story(page, 'item:chain')) && (await story(page, 'clue:c_chain')));
    await shot(page, 'after_chain');

    await talk(page, 'aq', ['كيف الحارة', 'سلامتك'], { shotName: 'dialogue_aq' });
    check('تحدثنا مع العكيد', await story(page, 'flag:met_aq'));

    await talk(page, 'um', ['ضاعت ساعة', 'بلطف', 'ما تخافي'], { shotName: 'dialogue_um' });
    check('أم حسن اعترفت', await story(page, 'flag:um_confessed'));
    check('ثقة أم حسن ارتفعت (30→45→53)', (await story(page, 'trust:umHasan')) === 53, 'trust=' + (await story(page, 'trust:umHasan')));

    await examine(page, 'prints');
    check('دليل آثار الأقدام', await story(page, 'clue:c_prints'));
    await examine(page, 'niche');
    check('وُجدت الساعة', await story(page, 'item:watch'));
    await shot(page, 'after_watch');

    // فتح الدفتر والخريطة
    await page.keyboard.press('KeyJ'); await page.waitForTimeout(400); await shot(page, 'journal_quest');
    await page.click('#journalTabs [data-tab="clues"]'); await page.waitForTimeout(200); await shot(page, 'journal_clues');
    await page.click('#journalTabs [data-tab="relations"]'); await page.waitForTimeout(200); await shot(page, 'journal_relations');
    await page.keyboard.press('Escape'); await page.waitForFunction('window.__bab.state()==="play"');
    await page.keyboard.press('KeyM'); await page.waitForTimeout(400); await shot(page, 'map');
    await page.keyboard.press('Escape'); await page.waitForFunction('window.__bab.state()==="play"');

    // حفظ يدوي ثم تحميل
    await page.keyboard.press('F5'); await page.waitForTimeout(200);
    const saved = await G(page, () => !!localStorage.getItem('babalhara.v1.manual'));
    check('حفظ يدوي (F5) كُتب في التخزين', saved);
    const autosaved = await G(page, () => !!localStorage.getItem('babalhara.v1.auto'));
    check('حفظ تلقائي موجود', autosaved);

    await talk(page, 'aj', ['ضاعت وانلقت'], { shotName: 'dialogue_resolve' });
    check('النهاية = الستر', (await story(page, 'ending')) === 'sitr', 'ending=' + (await story(page, 'ending')));
    await page.waitForFunction('!document.getElementById("ending").classList.contains("hidden")', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await shot(page, 'ending_sitr');
    check('ظهرت شاشة النهاية', true);
    await page.close();
  },

  // 2) مسار «الظلم»: الموافقة على اتهام البائع ثم الكذب
  async zulm(browser) {
    const page = await newPage(browser);
    await startNew(page);
    await talk(page, 'aj', ['ماشي']);
    await talk(page, 'aq', ['ضاعت ساعة', 'معك حق', 'سلامتك']);
    check('وافقنا على اتهام البائع', await story(page, 'flag:agreed_peddler'));
    await page.waitForTimeout(800);
    const detained = await G(page, () => { const n = __bab.game.npcs.get('peddler'); return { sit: n.sit, hasOverride: !!n.override, blocks: n.blocks }; });
    check('البائع انتقل لحالة التوقيف', !detained.sit);
    await examine(page, 'table'); await examine(page, 'prints'); await examine(page, 'niche');
    await talk(page, 'aj', ['كانت مع البياع']);
    check('النهاية = الظلم', (await story(page, 'ending')) === 'zulm');
    await page.waitForFunction('!document.getElementById("ending").classList.contains("hidden")', { timeout: 15000 });
    await page.waitForTimeout(800); await shot(page, 'ending_zulm');
    await page.close();
  },

  // 3) مسار «العفو» (يتطلب ثقة أبي جلال ≥ 55)
  async afw(browser) {
    const page = await newPage(browser);
    await startNew(page);
    await talk(page, 'aj', ['طمّن بالك', 'ماشي']);
    await examine(page, 'table'); await examine(page, 'prints'); await examine(page, 'niche');
    await talk(page, 'aj', ['بترجاك سامحو']);
    check('النهاية = العفو', (await story(page, 'ending')) === 'afw', 'ending=' + (await story(page, 'ending')));
    await page.close();
  },

  // 4) مسار «الهيبة» + ضغط على أم حسن يغلق حوارها
  async hiba(browser) {
    const page = await newPage(browser);
    await startNew(page);
    await talk(page, 'aj', ['ماشي']);
    await talk(page, 'um', ['ضاعت ساعة', 'بضغط']);
    check('أم حسن غاضبة بعد الضغط', await story(page, 'flag:um_hostile'));
    check('ثقة أم حسن انخفضت إلى 15', (await story(page, 'trust:umHasan')) === 15);
    // مرة ثانية: حوار بارد، يظهر خيار الاعتذار فقط
    const [x, z, yaw] = Z.um;
    await teleportTo(page, x, z, yaw);
    await interact(page, 'npc:umHasan');
    const cold = await G(page, async () => { for (let i = 0; i < 40 && __bab.game.dialogue.state !== 'waiting'; i++) await new Promise((r) => setTimeout(r, 100)); return __bab.game.dialogue.nodeId; });
    check('حوار أم حسن بارد بعد الضغط', cold === 'um_cold', cold);
    await runDialogue(page, ['ما في مشكلة']);
    await examine(page, 'table'); await examine(page, 'prints'); await examine(page, 'niche');
    await talk(page, 'aj', ['خلّي العكيد يأدّبو']);
    check('النهاية = الهيبة', (await story(page, 'ending')) === 'hiba');
    await page.close();
  },

  // 5) مهلة المغرب: العكيد يوقف البائع تلقائياً + دليل يُطلقه
  async deadline(browser) {
    const page = await newPage(browser);
    await startNew(page);
    await talk(page, 'aj', ['ماشي']);
    await talk(page, 'aq', ['ضاعت ساعة', 'خلّيني دوّر', 'سلامتك']);
    await examine(page, 'table'); await examine(page, 'prints');
    await G(page, () => __bab.setHour(18.36));
    await page.waitForFunction('__bab.story.flag("peddler_detained")', { timeout: 8000 });
    check('انقضت المهلة فأُوقف البائع', true);
    const mood = await G(page, () => __bab.game.audio.mood);
    check('الموسيقى انتقلت إلى التوتر', mood === 'tension', mood);
    await talk(page, 'aq', ['(بالدليل)', 'سلامتك'], {});
    check('الدليل أطلق البائع', await story(page, 'flag:peddler_released'));
    await page.close();
  },

  // 7) الصوت: السياق يعمل، الأجواء والصوت المؤقت تنتج إشارة فعلية، والمزامنة تحرّك الفم
  async audio(browser) {
    const page = await newPage(browser);
    await startNew(page);
    const r = await G(page, async () => {
      const a = __bab.game.audio, ctx = a.ctx;
      const an = ctx.createAnalyser(); an.fftSize = 2048; a.master.connect(an);
      const buf = new Float32Array(an.fftSize);
      const rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const peak = async (n, ms) => { let m = 0; for (let i = 0; i < n; i++) { m = Math.max(m, rms()); await sleep(ms); } return m; };
      const out = { state: ctx.state, ready: a.ready };
      a.setMood('off'); await sleep(300);
      out.ambience = await peak(12, 100);
      a.setMood('tension'); await sleep(2500);
      out.music = await peak(25, 100);
      a.setMood('calm');
      const h = a.speak('أهلاً وسهلاً يا نديم، الله يعطيك العافية', { pitch: 100, formant: 1, rate: 1 });
      let maxOpen = 0, visemes = new Set(), t0 = performance.now();
      while (performance.now() - t0 < h.total * 1000 + 200) { h.update(); maxOpen = Math.max(maxOpen, h.open); visemes.add(Math.round(h.wide * 10)); await sleep(30); }
      out.voiceTotal = h.total; out.maxOpen = maxOpen; out.visemeKinds = visemes.size; out.voiceDone = h.done;
      const h2 = a.speak('طازة يا بندورة', { pitch: 110, formant: 1, rate: 1 }); out.voice = await peak(15, 40); h2.cancel();
      for (const f of ['step', 'click', 'select', 'clue', 'item', 'trustUp', 'trustDown', 'save', 'knock', 'paper', 'alarm']) { try { a[f](); } catch (e) { out.err = f + ': ' + e.message; } }
      return out;
    });
    console.log('   ', JSON.stringify(r));
    check('سياق الصوت يعمل', r.state === 'running' && r.ready, r.state);
    check('الأجواء تنتج إشارة', r.ambience > 0.0005, 'rms=' + r.ambience?.toFixed(4));
    check('الموسيقى (حجاز/توتر) تنتج إشارة أعلى من الأجواء', r.music > r.ambience, `music=${r.music?.toFixed(4)}`);
    check('الصوت المؤقت يتكوّن ومدته معقولة', r.voiceTotal > 1.5 && r.voiceTotal < 8, 'total=' + r.voiceTotal?.toFixed(2));
    check('مزامنة الشفاه: الفم يتحرك بأشكال متنوعة', r.maxOpen > 0.4 && r.visemeKinds >= 3, `open=${r.maxOpen?.toFixed(2)} kinds=${r.visemeKinds}`);
    check('المؤثرات تعمل بلا أخطاء', !r.err, r.err || '');
    await page.close();
  },

  // 6) الحفظ والمتابعة: إعادة تحميل الصفحة ثم «متابعة»
  async continueSave(browser) {
    const page = await newPage(browser);
    await startNew(page);
    await talk(page, 'aj', ['ماشي']);
    await examine(page, 'table');
    await page.keyboard.press('F5'); await page.waitForTimeout(300);
    const ctx = page.context();
    const state = await ctx.storageState();
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page2.addInitScript((ls) => { for (const [k, v] of ls) localStorage.setItem(k, v); }, state.origins.flatMap((o) => o.localStorage.map((e) => [e.name, e.value])));
    await page2.goto(`${BASE}/index.html?q=low&autoq=0`);
    await page2.waitForFunction('window.__bab && window.__bab.state()==="title"', { timeout: 180000 });
    check('زر المتابعة مفعّل', await page2.evaluate(() => !document.getElementById('btnContinue').disabled));
    await page2.click('#btnContinue');
    await page2.waitForFunction('window.__bab.state()==="play"', { timeout: 20000 });
    check('الحالة المستعادة تحوي السلسلة والبداية', (await story(page2, 'item:chain')) && (await story(page2, 'flag:met_aj')));
    await page2.close();
  },
};

const browser = await launch();
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SCENARIOS);
for (const n of names) {
  console.log(`\n── سيناريو: ${n}`);
  try { await SCENARIOS[n](browser); } catch (e) { check(`سيناريو ${n} اكتمل`, false, e.message); }
}
await browser.close();

const errs = logs.filter((l) => !/Failed to load resource.*favicon/.test(l));
check('لا أخطاء في وحدة التحكم', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${failures ? '✗ فشل ' + failures : '✓ نجحت كل الفحوص'} (${results.length} فحصاً)`);
process.exit(failures ? 1 : 0);
