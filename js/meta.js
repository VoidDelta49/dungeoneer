// Meta-progression: Cores earned per run buy permanent upgrades (saved in localStorage)
const KEY = 'dungeoneer.meta';
export const meta = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } })() || { cores: 0, lv: {}, best: 0 };
meta.weapon ??= 'gun'; // loadout for the next run
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch {} };
export const lv = id => meta.lv[id] || 0;
const SHOP = [
  { id: 'hp', name: 'Reinforced Frame', desc: '+15 max HP', max: 5 },
  { id: 'dmg', name: 'Calibrated Barrel', desc: '+10% damage', max: 5 },
  { id: 'mag', name: 'Extended Mag', desc: '+3 rounds', max: 4 },
];
const cost = id => 4 + lv(id) * 4;
export function buy(id) {
  const it = SHOP.find(s => s.id === id);
  if (it && lv(id) < it.max && meta.cores >= cost(id)) { meta.cores -= cost(id); meta.lv[id] = lv(id) + 1; save(); }
}
export const shopHTML = () => `<p>◆ ${meta.cores} CORES · best floor ${meta.best}</p><div class="shop">${SHOP.map(s => {
  const l = lv(s.id), maxed = l >= s.max;
  return `<button data-buy="${s.id}" ${maxed || meta.cores < cost(s.id) ? 'disabled' : ''}><b>${s.name}</b> ${'●'.repeat(l)}${'○'.repeat(s.max - l)}<br>${s.desc} · ${maxed ? 'MAX' : '◆' + cost(s.id)}</button>`;
}).join('')}</div>`;
