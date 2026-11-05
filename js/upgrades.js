// In-run upgrade pool. apply(stats, player) mutates the player's stats; max = stack limit.
// tagged upgrades are only offered for the run's chosen weapon (sword ones stop once it's lost).
export const RARITY = [{ name: 'COMMON', color: '#4ff0ff', w: 60 }, { name: 'RARE', color: '#b98bff', w: 30 }, { name: 'EPIC', color: '#ffb43a', w: 10 }];
export const UPGRADES = [
  // gun
  { tag: 'gun', id: 'dmg', name: 'HOLLOW POINTS', icon: '✦', rar: 0, max: 4, desc: '+20% gun damage', apply: s => s.dmg *= 1.2 },
  { tag: 'gun', id: 'rate', name: 'HAIR TRIGGER', icon: '»', rar: 0, max: 3, desc: '+10% fire rate', apply: s => s.rate *= 1.1 },
  { tag: 'gun', id: 'heavy', name: 'HEAVY ROUNDS', icon: '●', rar: 1, max: 2, desc: '+45% gun damage, -15% fire rate', apply: s => { s.dmg *= 1.45; s.rate *= .85; } },
  { tag: 'gun', id: 'mag', name: 'DRUM MAG', icon: '≡', rar: 0, max: 3, desc: '+6 rounds per magazine', apply: (s, e) => { s.mag += 6; e.weapon.mag += 6; } },
  { tag: 'gun', id: 'reload', name: 'SPEED LOADER', icon: '↻', rar: 0, max: 3, desc: 'Reload 25% faster', apply: s => s.reload *= .75 },
  { tag: 'gun', id: 'pierce', name: 'TUNGSTEN CORE', icon: '→', rar: 1, max: 2, desc: 'Bullets pierce +1 enemy', apply: s => s.pierce++ },
  { tag: 'gun', id: 'split', name: 'SPLIT SHOT', icon: '∴', rar: 1, max: 2, desc: '+1 bullet per shot, -25% gun damage', apply: s => { s.pellets++; s.dmg *= .75; } },
  { tag: 'gun', id: 'slide', name: 'SLIDE DYNAMO', icon: '∿', rar: 1, max: 1, desc: 'Fast slides refill your mag', apply: s => s.slideLoad = 1 },
  // sword
  { id: 'keen', tag: 'sword', name: 'KEEN EDGE', icon: '⟋', rar: 0, max: 4, desc: '+25% sword damage', apply: s => s.sdmg *= 1.25 },
  { id: 'flurry', tag: 'sword', name: 'FLURRY', icon: '≋', rar: 0, max: 3, desc: 'Sword swings 15% faster', apply: s => s.sspeed *= 1.15 },
  { id: 'reach', tag: 'sword', name: 'LONG BLADE', icon: '↔', rar: 0, max: 2, desc: '+0.6m sword reach', apply: s => s.reach += .6 },
  { id: 'razor', tag: 'sword', name: 'RAZOR WIND', icon: '✕', rar: 0, max: 2, desc: 'Thrown sword deals +75% damage', apply: s => s.throwDmg *= 1.75 },
  { id: 'ricochet', tag: 'sword', name: 'RICOCHET', icon: '⟲', rar: 1, max: 2, desc: 'Thrown sword bounces to +2 more enemies', apply: s => s.bounces += 2 },
  { id: 'parry', tag: 'sword', name: 'PARRY MASTER', icon: '◇', rar: 1, max: 2, desc: 'Wider parry window, parries heal 5', apply: s => { s.parry += .1; s.parryHeal += 5; } },
  { id: 'bulwark', tag: 'sword', name: 'BULWARK', icon: '▮', rar: 1, max: 1, desc: 'Blocking absorbs 95% (was 75%)', apply: s => s.block = .95 },
  { id: 'tether', tag: 'sword', name: 'TETHERED HILT', icon: '⤺', rar: 1, max: 1, desc: 'Throw again to recall the sword', apply: s => s.recall = 1 },
  { id: 'finisher', tag: 'sword', name: 'SHOCK FINISHER', icon: '✺', rar: 2, max: 2, desc: '3rd combo hit releases a shockwave', apply: s => s.finisher++ },
  // general
  { id: 'vest', name: 'PLATED VEST', icon: '■', rar: 0, max: 4, desc: '+20 max HP and heal 20', apply: (s, e) => { e.health.max += 20; e.health.hp += 20; } },
  { id: 'legs', name: 'OVERCLOCKED LEGS', icon: '≫', rar: 0, max: 3, desc: '+8% move speed', apply: s => s.speed *= 1.08 },
  { id: 'leech', name: 'LEECH ROUNDS', icon: '♥', rar: 1, max: 3, desc: 'Kills heal 2 HP', apply: s => s.leech += 2 },
  { id: 'jump', name: 'GRAV BOOTS', icon: '⇑', rar: 1, max: 2, desc: '+1 mid-air jump', apply: s => s.airJumps++ },
  { id: 'momentum', name: 'MOMENTUM DRIVE', icon: 'ϟ', rar: 2, max: 2, desc: '+35% damage while above 14 m/s', apply: s => s.momentum += .35 },
  { id: 'boom', name: 'VOLATILE PAYLOAD', icon: '✸', rar: 2, max: 2, desc: 'Kills explode for 3 damage nearby', apply: s => s.explode += 3 },
  { id: 'wind', name: 'SECOND WIND', icon: '✚', rar: 2, max: 1, desc: 'Once per floor, survive a lethal hit', apply: s => s.secondWind = 1 },
];

export function rollUpgrades(e, n = 3) {
  const pool = UPGRADES.filter(u => (e.picks[u.id] || 0) < u.max && (!u.tag || u.tag === e.loadout && (u.tag !== 'sword' || e.sword.has))), out = [];
  while (out.length < n && pool.length) {
    let r = Math.random() * pool.reduce((a, u) => a + RARITY[u.rar].w, 0), k = 0;
    while ((r -= RARITY[pool[k].rar].w) > 0) k++;
    out.push(...pool.splice(k, 1));
  }
  return out;
}
export function applyUpgrade(e, u) { e.picks[u.id] = (e.picks[u.id] || 0) + 1; u.apply(e.stats, e); }
