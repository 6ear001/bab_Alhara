// الحفظ والتحميل في localStorage (تلقائي + يدوي). يعمل بسلام حتى لو كان التخزين غير متاح.
const KEY = 'babalhara.v1.';

let memory = {};     // بديل مؤقت عند غياب localStorage
function store() {
  try { const k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { return null; }
}

export const SaveStore = {
  write(slot, data) {
    const json = JSON.stringify(data);
    const st = store();
    if (st) st.setItem(KEY + slot, json); else memory[slot] = json;
    return true;
  },
  read(slot) {
    const st = store();
    const json = st ? st.getItem(KEY + slot) : memory[slot];
    if (!json) return null;
    try { return JSON.parse(json); } catch (e) { return null; }
  },
  has(slot) { return !!this.read(slot); },
  remove(slot) { const st = store(); if (st) st.removeItem(KEY + slot); else delete memory[slot]; },
  latest() {
    const a = this.read('auto'), m = this.read('manual');
    if (a && m) return a.ts >= m.ts ? { slot: 'auto', data: a } : { slot: 'manual', data: m };
    if (a) return { slot: 'auto', data: a };
    if (m) return { slot: 'manual', data: m };
    return null;
  },
  settings: {
    read() { try { return JSON.parse(localStorage.getItem(KEY + 'settings')) || null; } catch (e) { return null; } },
    write(s) { try { localStorage.setItem(KEY + 'settings', JSON.stringify(s)); } catch (e) { /* */ } },
  },
};
