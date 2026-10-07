// أشكال الشخصيات (مؤقتة) وبيانات هويتها.
// ملاحظة: الأسماء أدناه «أسماء مؤقتة بحسب الدور» حتى تُزوَّد اللعبة بمراجع الموسم الأول المعتمدة.
// كل شخصية لها `canon:false` إلى أن تُربط بشخصية موثّقة، و`voiceId` لاستبدال الصوت بتسجيل معتمد.
import { mulberry32 } from '../config.js';

export const CAST = {
  nadim: {
    id: 'nadim', name: 'نديم', role: 'شاب من الحارة (شخصية أصلية)', canon: false, playable: true,
    look: { skin: '#c99a74', shirt: '#e9e2cf', vest: '#5b6a3c', pants: '#2d2b2a', hair: '#1f1814', mustache: true, headwear: 'none', outfit: 'shirwal', sash: '#8a6a2a', scale: 1.0 },
    voice: { pitch: 118, formant: 1.0, rate: 1.0, voiceId: 'nadim' },
  },
  abuJalal: {
    id: 'abuJalal', name: 'أبو جلال', role: 'صاحب المقهى', canon: false,
    look: { skin: '#d2a07a', robe: '#5b4a39', outfit: 'qumbaz', sash: '#3a2a1a', headwear: 'tarboosh', hatColor: '#7e1818', hair: '#8a857b', mustache: 'big', mustacheColor: '#8e8a82', beard: false, scale: 0.99, heightK: 0.98 },
    voice: { pitch: 98, formant: 0.93, rate: 0.9, voiceId: 'abuJalal' },
    start: { trust: 50 },
  },
  aqeed: {
    id: 'aqeed', name: 'العكيد', role: 'حامي الحارة والمسؤول عن أمنها', canon: false,
    look: { skin: '#c18f68', shirt: '#d8d0bd', vest: '#25252a', pants: '#2c2a2a', outfit: 'shirwal', sash: '#8a2323', headwear: 'tarboosh', hatColor: '#8e1b1b', hair: '#17110d', mustache: 'big', mustacheColor: '#17110d', scale: 1.06 },
    voice: { pitch: 90, formant: 0.88, rate: 1.0, voiceId: 'aqeed' },
    start: { trust: 40 },
  },
  umHasan: {
    id: 'umHasan', name: 'أم حسن', role: 'جارة من أهل الحارة', canon: false,
    look: { skin: '#d8aa86', robe: '#27405e', outfit: 'dress', apron: '#cdbba0', headwear: 'scarf', scarf: '#efe9da', hair: '#3a2a22', scale: 0.93, lip: '#b0655a' },
    voice: { pitch: 205, formant: 1.18, rate: 1.0, voiceId: 'umHasan' },
    start: { trust: 30 },
  },
  peddler: {
    id: 'peddler', name: 'البائع الجوّال', role: 'غريب عن الحارة', canon: false,
    look: { skin: '#a97a55', shirt: '#d6cfb8', vest: '#7a5a2e', pants: '#4a4036', outfit: 'shirwal', sash: '#3d5a52', headwear: 'cap', hatColor: '#cfc7b4', hair: '#2a211b', mustache: true, beard: true, beardColor: '#2d2620', scale: 0.98 },
    voice: { pitch: 112, formant: 1.0, rate: 1.1, voiceId: 'peddler' },
  },
  hasan: {
    id: 'hasan', name: 'حسن', role: 'ابن أم حسن (10 سنوات)', canon: false,
    look: { skin: '#d6a47c', shirt: '#cdbba0', vest: '#3b5a7a', pants: '#4a3f33', outfit: 'shirwal', headwear: 'cap', hatColor: '#8a7a62', hair: '#2a1f18', child: true, vestless: false },
    voice: { pitch: 260, formant: 1.3, rate: 1.1, voiceId: 'hasan' },
  },
  grocer: {
    id: 'grocer', name: 'البقّال', role: 'صاحب البقالة', canon: false,
    look: { skin: '#caa07a', shirt: '#d9d1bc', vest: '#6b4a2a', pants: '#3a342c', outfit: 'shirwal', sash: '#5b4a2a', headwear: 'tarboosh', hatColor: '#6a2a2a', hair: '#8a857b', mustache: true, mustacheColor: '#8a857b', scale: 1.0 },
    voice: { pitch: 104, formant: 0.96, rate: 1.0 },
  },
};

const MALE_ROBES = ['#3d5a52', '#6a4a32', '#4a4a58', '#7a6a50', '#2f3f5a'];
const VEST = ['#2f4a3a', '#3a2f28', '#4a3a58', '#5a3a2a', '#25252a'];
const SHIRT = ['#e0d8c4', '#cfc6b0', '#d8ccb0', '#b8b19a'];
const DRESS = ['#5a2d3a', '#2d4a3f', '#4a3a58', '#7a4a2a', '#2a3550'];
const SKIN = ['#d2a07a', '#c18f68', '#d8aa86', '#b98760', '#cfa07a', '#a97a55'];

// قالب سكان عابرين متنوعين (حتميّ بحسب البذرة)
export function villagerLook(seed, kind) {
  const r = mulberry32(seed);
  const pick = (a) => a[(r() * a.length) | 0];
  const skin = pick(SKIN);
  if (kind === 'woman') {
    const black = r() < 0.4;
    return { skin, robe: black ? '#25252a' : pick(DRESS), outfit: 'dress', headwear: 'scarf', scarf: black ? '#2a2a2a' : pick(['#efe9da', '#d8c9a8', '#cdbfa6']), hair: '#2b211b', scale: 0.9 + r() * 0.05, lip: '#a8584a' };
  }
  if (kind === 'boy') {
    return { skin, shirt: pick(SHIRT), vest: pick(VEST), pants: '#4a3f33', outfit: 'shirwal', headwear: r() < 0.5 ? 'cap' : 'none', hatColor: '#8a7a62', hair: '#2a1f18', child: true };
  }
  if (kind === 'elder') {
    return { skin, robe: pick(MALE_ROBES), outfit: 'qumbaz', sash: '#3a2a1a', headwear: 'tarboosh', hatColor: '#7e1818', hair: '#9a968c', mustache: 'big', mustacheColor: '#9a968c', beard: r() < 0.4, beardColor: '#b9b4ab', scale: 0.97 };
  }
  return { skin, shirt: pick(SHIRT), vest: pick(VEST), pants: '#2d2b2a', outfit: 'shirwal', sash: r() < 0.6 ? '#6b2a2a' : null, headwear: r() < 0.7 ? 'tarboosh' : 'cap', hatColor: r() < 0.5 ? '#8e1b1b' : '#7e1818', hair: '#1f1814', mustache: r() < 0.7 ? true : false, scale: 0.97 + r() * 0.08 };
}
