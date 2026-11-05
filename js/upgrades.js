// In-run upgrade pool. apply(stats, player) mutates the player's stats; max = stack limit.
export const RARITY = [{ name: 'COMMON', color: '#4ff0ff', w: 60 }, { name: 'RARE', color: '#b98bff', w: 30 }, { name: 'EPIC', color: '#ffb43a', w: 10 }];
export const UPGRADES = [
  { id: 'dmg', name: 'HOLLOW POINTS', icon: '✦', rar: 0, desc: '+35% damage', apply: s => s.dmg *= 1.35 },
  { id: 'rate', name: 'HAIR TRIGGER', icon: '»', rar: 0, desc: '+18% fire rate', apply: s => s.rate *= 1.18 },
  { id: 'mag', name: 'DRUM MAG', icon: '≡', rar: 0, max: 4, desc: '+8 rounds per magazine', apply: (s, e) => { s.mag += 8; e.weapon.mag += 8; } },
  { id: 'reload', name: 'SPEED LOADER', icon: '↻', rar: 0, max: 3, desc: 'Reload 30% faster', apply: s => s.reload *= .7 },
  { id: 'vest', name: 'PLATED VEST', icon: '■', rar: 0, desc: '+25 max HP and heal 25', apply: (s, e) => { e.health.max += 25; e.health.hp += 25; } },
  { id: 'legs', name: 'OVERCLOCKED LEGS', icon: '≫', rar: 0, max: 4, desc: '+10% move speed', apply: s => s.speed *= 1.1 },
  { id: 'leech', name: 'LEECH ROUNDS', icon: '♥', rar: 1, desc: 'Kills heal 4 HP', apply: s => s.leech += 4 },
  { id: 'pierce', name: 'TUNGSTEN CORE', icon: '→', rar: 1, max: 3, desc: 'Shots pierce +1 enemy', apply: s => s.pierce++ },
  { id: 'split', name: 'SPLIT SHOT', icon: '∴', rar: 1, max: 3, desc: '+1 bullet per shot, -15% damage', apply: s => { s.pellets++; s.dmg *= .85; } },
  { id: 'jump', name: 'GRAV BOOTS', icon: '⇑', rar: 1, max: 2, desc: '+1 mid-air jump', apply: s => s.airJumps++ },
  { id: 'slide', name: 'SLIDE DYNAMO', icon: '∿', rar: 1, max: 1, desc: 'Fast slides refill your mag', apply: s => s.slideLoad = 1 },
  { id: 'momentum', name: 'MOMENTUM DRIVE', icon: 'ϟ', rar: 2, desc: '+60% damage while above 14 m/s', apply: s => s.momentum += .6 },
  { id: 'boom', name: 'VOLATILE PAYLOAD', icon: '✸', rar: 2, desc: 'Kills explode, hurting nearby enemies', apply: s => s.explode += 2.5 },
];

export function rollUpgrades(e, n = 3) {
  const pool = UPGRADES.filter(u => (e.picks[u.id] || 0) < (u.max ?? 99)), out = [];
  while (out.length < n && pool.length) {
    let r = Math.random() * pool.reduce((a, u) => a + RARITY[u.rar].w, 0), k = 0;
    while ((r -= RARITY[pool[k].rar].w) > 0) k++;
    out.push(...pool.splice(k, 1));
  }
  return out;
}
export function applyUpgrade(e, u) { e.picks[u.id] = (e.picks[u.id] || 0) + 1; u.apply(e.stats, e); }
