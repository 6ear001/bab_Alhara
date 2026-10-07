// خامات مولَّدة برمجياً (Canvas) — حجر الأزقة، الأبلق الدمشقي، الجص، الخشب...
// كل خامة تعيد {map, bump} قابلة للتكرار (tileable) وتُستبدل بخامات PBR حقيقية لاحقاً.
import * as THREE from 'three';
import { mulberry32 } from './config.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(c, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, repeat);
  return t;
}

// ضجيج حبيبي فوق المحتوى
function grain(ctx, size, amount, rng, blotchy = false) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  if (blotchy) {
    for (let i = 0; i < 40; i++) {
      const x = rng() * size, y = rng() * size, r = 20 + rng() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = rng() < 0.5;
      g.addColorStop(0, dark ? 'rgba(30,20,10,0.10)' : 'rgba(255,240,210,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// حجارة مرصوفة غير منتظمة — الأرضية
export function makeCobble(size = 512, seed = 11) {
  const rng = mulberry32(seed);
  const c = canvas(size), b = canvas(size);
  const ctx = c.getContext('2d'), bx = b.getContext('2d');
  ctx.fillStyle = '#2f2a24'; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#000'; bx.fillRect(0, 0, size, size);
  const palette = ['#8a7d6a', '#776b5a', '#978a74', '#6a6052', '#9f917a', '#7e7360', '#86765f', '#6f6453'];
  let y = 0;
  while (y < size - 8) {
    let rh = 46 + rng() * 26;
    if (size - (y + rh) < 40) rh = size - y;
    let x = -rng() * 40;
    while (x < size) {
      const rw = 52 + rng() * 48;
      const gap = 4;
      const sx = x + gap / 2, sy = y + gap / 2, sw = rw - gap, sh = rh - gap;
      const base = palette[(rng() * palette.length) | 0];
      for (const wrapX of [0, -size, size]) {
        for (const wrapY of [0, -size, size]) {
          const px = sx + wrapX, py = sy + wrapY;
          if (px > size || px + sw < 0 || py > size || py + sh < 0) continue;
          const grad = ctx.createLinearGradient(px, py, px + sw * 0.4, py + sh);
          grad.addColorStop(0, base);
          grad.addColorStop(1, shade(base, -18 + rng() * 10));
          ctx.fillStyle = grad;
          roundRect(ctx, px, py, sw, sh, 12 + rng() * 8); ctx.fill();
          const bg = bx.createRadialGradient(px + sw / 2, py + sh / 2, 2, px + sw / 2, py + sh / 2, Math.max(sw, sh) * 0.6);
          const hgt = 150 + rng() * 80;
          bg.addColorStop(0, `rgb(${hgt},${hgt},${hgt})`);
          bg.addColorStop(1, 'rgb(20,20,20)');
          bx.fillStyle = bg;
          roundRect(bx, px, py, sw, sh, 12); bx.fill();
        }
      }
      x += rw;
    }
    y += rh;
  }
  grain(ctx, size, 26, rng, true);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const bl = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${bl})`;
}

// أبلق دمشقي — مداميك سوداء وبيضاء متناوبة
export function makeAblaq(size = 512, seed = 21) {
  const rng = mulberry32(seed);
  const c = canvas(size), b = canvas(size);
  const ctx = c.getContext('2d'), bx = b.getContext('2d');
  bx.fillStyle = '#000'; bx.fillRect(0, 0, size, size);
  const courses = 4, ch = size / courses;
  for (let r = 0; r < courses; r++) {
    const dark = r % 2 === 0;
    let x = -rng() * 80;
    while (x < size) {
      const w = 130 + rng() * 110;
      const base = dark ? ['#2d2b2a', '#363230', '#262423'][(rng() * 3) | 0] : ['#d9c8a4', '#cdbb95', '#e0d1b0'][(rng() * 3) | 0];
      for (const wx of [0, -size, size]) {
        const px = x + wx + 2, py = r * ch + 2;
        if (px > size || px + w < 0) continue;
        ctx.fillStyle = base;
        roundRect(ctx, px, py, w - 4, ch - 4, 5); ctx.fill();
        // سطح الحجر
        const g = ctx.createLinearGradient(px, py, px, py + ch);
        g.addColorStop(0, 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0.14)');
        ctx.fillStyle = g; roundRect(ctx, px, py, w - 4, ch - 4, 5); ctx.fill();
        bx.fillStyle = '#b4b4b4'; roundRect(bx, px, py, w - 4, ch - 4, 5); bx.fill();
      }
      x += w;
    }
  }
  grain(ctx, size, 22, rng, true);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

// جص مُعتّق بلون الأوكر
export function makePlaster(size = 512, seed = 31, base = '#c8ad86') {
  const rng = mulberry32(seed);
  const c = canvas(size), b = canvas(size);
  const ctx = c.getContext('2d'), bx = b.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rng() * size, y = rng() * size, r = 25 + rng() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() < 0.45;
    g.addColorStop(0, light ? 'rgba(255,238,205,0.16)' : 'rgba(70,45,25,0.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
      ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
    }
    const bg = bx.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = bg; bx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // شقوق دقيقة
  ctx.strokeStyle = 'rgba(60,40,25,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    let x = rng() * size, y = rng() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (rng() - 0.5) * 40; y += rng() * 26; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  grain(ctx, size, 20, rng, false);
  grain(bx, size, 40, rng, false);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

// خشب ألواح عمودية
export function makeWood(size = 512, seed = 41, tone = 0) {
  const rng = mulberry32(seed);
  const c = canvas(size), b = canvas(size);
  const ctx = c.getContext('2d'), bx = b.getContext('2d');
  const planks = 6, pw = size / planks;
  bx.fillStyle = '#777'; bx.fillRect(0, 0, size, size);
  for (let p = 0; p < planks; p++) {
    const lum = 38 + rng() * 14 + tone;
    ctx.fillStyle = `hsl(${24 + rng() * 6},${42 + rng() * 10}%,${lum}%)`;
    ctx.fillRect(p * pw, 0, pw, size);
    for (let i = 0; i < 26; i++) {
      const x = p * pw + rng() * pw;
      ctx.strokeStyle = `rgba(${20 + rng() * 25},${10 + rng() * 14},5,${0.12 + rng() * 0.2})`;
      ctx.lineWidth = 0.6 + rng() * 1.6;
      ctx.beginPath(); ctx.moveTo(x, 0);
      let cx = x;
      for (let y = 0; y <= size; y += 32) { cx += (rng() - 0.5) * 3; ctx.lineTo(cx, y); }
      ctx.stroke();
      bx.strokeStyle = `rgba(0,0,0,${0.15 + rng() * 0.15})`; bx.lineWidth = 1;
      bx.beginPath(); bx.moveTo(x, 0); bx.lineTo(cx, size); bx.stroke();
    }
    if (rng() < 0.6) {
      const kx = p * pw + pw * (0.25 + rng() * 0.5), ky = rng() * size;
      const g = ctx.createRadialGradient(kx, ky, 1, kx, ky, 14);
      g.addColorStop(0, 'rgba(20,10,5,0.7)'); g.addColorStop(1, 'rgba(20,10,5,0)');
      ctx.fillStyle = g; ctx.fillRect(kx - 16, ky - 16, 32, 32);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p * pw, 0, 2.5, size);
    bx.fillStyle = '#111'; bx.fillRect(p * pw, 0, 3, size);
  }
  grain(ctx, size, 18, rng, false);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

// بلاط/حجر مسطّح (مصاطب المقهى والمصطبة)
export function makeFlag(size = 512, seed = 51) {
  const rng = mulberry32(seed);
  const c = canvas(size), b = canvas(size);
  const ctx = c.getContext('2d'), bx = b.getContext('2d');
  ctx.fillStyle = '#3a342c'; ctx.fillRect(0, 0, size, size);
  bx.fillStyle = '#000'; bx.fillRect(0, 0, size, size);
  const n = 3, s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const lum = 150 + rng() * 40;
    ctx.fillStyle = `rgb(${lum},${lum - 12},${lum - 32})`;
    roundRect(ctx, i * s + 3, j * s + 3, s - 6, s - 6, 6); ctx.fill();
    bx.fillStyle = '#aaa'; roundRect(bx, i * s + 3, j * s + 3, s - 6, s - 6, 6); bx.fill();
  }
  grain(ctx, size, 24, rng, true);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

// خامة ماء: ضجيج ناعم للانعكاس/التموّج
export function makeWaterBump(size = 256, seed = 61) {
  const rng = mulberry32(seed);
  const b = canvas(size);
  const bx = b.getContext('2d');
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    const x = rng() * size, y = rng() * size, r = 6 + rng() * 26;
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
      const g = bx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, rng() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      bx.fillStyle = g; bx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  return toTexture(b, { srgb: false });
}

// قماش بنسيج خفيف (للألبسة والستائر)
export function makeCloth(size = 128, seed = 71) {
  const rng = mulberry32(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 2) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  grain(ctx, size, 24, rng, false);
  return toTexture(c, { repeat: 3 });
}

// توهّج دائري للفوانيس والشمس
export function makeGlow(size = 128, inner = 'rgba(255,200,120,1)') {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// لوحة نصية عربية (لافتات المحلات والباب)
export function makeSign(text, { w = 512, h = 160, bg = '#2a1a0e', fg = '#e8c77a', font = '700 76px "Reem Kufi", serif', border = '#c9973b' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const wood = ctx.createLinearGradient(0, 0, 0, h);
  wood.addColorStop(0, bg); wood.addColorStop(1, shade(bg.startsWith('#') ? bg : '#2a1a0e', -12));
  ctx.fillStyle = wood; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.lineWidth = 2; ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 3;
  ctx.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// بلاط سجادة/ستارة بنقوش هندسية بسيطة (للأقمشة المعلّقة)
export function makeStripe(colors, size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const n = colors.length;
  for (let i = 0; i < n; i++) { ctx.fillStyle = colors[i]; ctx.fillRect(0, (i * size) / n, size, size / n); }
  const t = toTexture(c);
  return t;
}

export function buildTextureSet() {
  return {
    cobble: makeCobble(512),
    ablaq: makeAblaq(512),
    plaster: makePlaster(512, 31, '#c9ae88'),
    plasterWarm: makePlaster(512, 33, '#c19a6b'),
    plasterLight: makePlaster(512, 35, '#d8c6a3'),
    wood: makeWood(512, 41, 0),
    woodDark: makeWood(512, 43, -12),
    flag: makeFlag(512),
    waterBump: makeWaterBump(256),
    cloth: makeCloth(128),
  };
}
