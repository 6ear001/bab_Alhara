// إعدادات عامة وإعدادات الجودة الرسومية

export const VERSION = '0.1.0-demo';

// ثواني اللعبة لكل ثانية حقيقية (الزمن يتوقف أثناء الحوار والقوائم)
export const TIME_SCALE = 6;
export const START_HOUR = 16.75;      // 4:45 م
export const SUNSET_HOUR = 18.5;      // المغرب
export const DETAIN_HOUR = 18.33;     // 6:20 م — العكيد يوقف البائع إن لم تُحسم القضية

export const QUALITY = {
  low: {
    label: 'منخفض', pixelRatio: 0.75, shadows: false, shadowMap: 1024, shadowRange: 22,
    post: false, ibl: false, pointLights: 2, npcAmbient: 5, fountainParticles: 30,
  },
  medium: {
    label: 'متوسط', pixelRatio: 1, shadows: true, shadowMap: 2048, shadowRange: 30,
    post: false, ibl: true, pointLights: 4, npcAmbient: 9, fountainParticles: 70,
  },
  high: {
    label: 'عالٍ', pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, shadowMap: 4096, shadowRange: 34,
    post: true, ibl: true, pointLights: 6, npcAmbient: 12, fountainParticles: 130,
  },
};

export const DEFAULT_SETTINGS = {
  quality: 'high',
  master: 0.8, music: 0.55, sfx: 0.8, voice: 0.9, ambience: 0.7,
  subtitles: true, subtitleSize: 1,
  sensitivity: 1, invertY: false,
  browserVoice: false,
  objectiveMarker: true,
  autoQuality: true,
};

// حدود العالم (للخريطة)
export const WORLD = { x0: -38, x1: 28, z0: -24, z1: 20 };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatClock(hour) {
  let h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  const suffix = h >= 12 ? 'م' : 'ص';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
