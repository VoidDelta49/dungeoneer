// Roguelite run loop: each floor is a 3x3 dungeon. Entering an uncleared room seals its doors and its rift
// spews waves; clearing it opens the doors, pays Cores and pings the phone with an upgrade. The exit room
// (farthest from the start) holds a Warden; killing it powers a lift to the next, harder floor.
// Each room has several rifts (more on deeper floors); enemies come out of the ones away from you, and standing
// right on top of a rift burns you a little and shoves you off it.
import * as THREE from 'three';
import { scene, buildLevel } from '../render.js';
import { generate, rooms, start, barrier, doorTiles, roomCenter, W, T, WALL } from '../level.js';
import { refreshNav } from '../nav.js';
import { createEnemy, removeEnt } from './enemies.js';
import { lose } from './melee.js';
import { queueOffer } from '../phone.js';
import { burst, glowTex } from '../fx.js';
import { sfx } from '../audio.js';

export const run = { floor: 1, cores: 0, cleared: 0, active: null, states: [] };
const bannerEl = document.getElementById('banner');
export function banner(title, sub = '', color = '#fff') {
  bannerEl.innerHTML = `<b style="color:${color}">${title}</b><small>${sub}</small>`;
  bannerEl.classList.remove('show'); void bannerEl.offsetWidth; bannerEl.classList.add('show');
}

const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const riftGeo = new THREE.TorusGeometry(1.2, .12, 8, 24), riftMat = [0xaa00ff, 0xff3322].map(color => new THREE.MeshBasicMaterial({ color }));
const riftGlow = [0xaa33ff, 0xff3322].map(color => new THREE.SpriteMaterial({ map: glowTex, color, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
const sealGeo = new THREE.BoxGeometry(T, WALL, T);
const sealMat = new THREE.MeshBasicMaterial({ color: 0xff2244, opacity: .3, side: THREE.DoubleSide, ...add });
const liftMat = new THREE.MeshBasicMaterial({ color: 0x33ff99, opacity: .5, ...add });
let props = []; // per-floor meshes
const prop = (m, x, y, z) => { m.position.set(x, y, z); scene.add(m); props.push(m); return m; };

export function loadFloor(world, floor) {
  const pl = world.one('player'), lostSword = pl.sword.thrown; // leaving a thrown sword behind loses it
  if (lostSword) lose(world, pl);
  pl.player.swUsed = false;
  for (const e of [...world.ents]) if (!e.player && e.mesh) removeEnt(world, e);
  for (const m of props) scene.remove(m); props = [];
  generate(floor); buildLevel(); refreshNav();
  Object.assign(run, { floor, active: null, lift: null });
  const c0 = roomCenter(rooms[0]), cs = rooms.map(roomCenter), exit = cs.reduce((b, c, k) => c.distanceTo(c0) > cs[b].distanceTo(c0) ? k : b, 1);
  run.states = rooms.map((rm, k) => {
    const st = { k, c: cs[k], cleared: !k, exit: k === exit, spawned: 0, timer: 0, seals: [], rifts: [],
      theme: theme(floor), budget: Math.round((4 + rm.w * rm.h / 70 + floor * 2.5) * (k === exit ? .6 : 1)) };
    if (k) st.rifts = (rm.spawns.length ? rm.spawns : [[Math.floor(cs[k].x / T), Math.floor(cs[k].z / T)]]).map(([x, y]) => {
      const m = prop(new THREE.Mesh(riftGeo, riftMat[+st.exit]), (x + .5) * T, .05, (y + .5) * T), g = new THREE.Sprite(riftGlow[+st.exit]);
      m.rotation.x = -Math.PI / 2; g.position.z = .5; g.scale.setScalar(2.6); m.add(g); return m;
    });
    return st;
  });
  const p = pl; p.pos.copy(start); p.prev.copy(start); p.vel.set(0, 0, 0);
  banner(`FLOOR ${floor}`, lostSword ? 'You left your sword behind — it is gone' : 'Clear rooms for upgrades · the red rift guards the lift', '#4ff0ff');
}

function seal(st, on) {
  for (const [i, j] of doorTiles(rooms[st.k])) {
    barrier[i * W + j] = on;
    if (on) st.seals.push(prop(new THREE.Mesh(sealGeo, sealMat), (j + .5) * T, WALL / 2, (i + .5) * T));
  }
  if (!on) { for (const m of st.seals) { burst(m.position, 0xff4466, 12, 6, .5, 0); scene.remove(m); } st.seals = []; }
  refreshNav();
}

// Each room has a theme that heavily favours one enemy type, so rooms play differently. [weight, from floor]
const POOL = { grunt: [10, 1], runner: [5, 1], spitter: [3, 1], leaper: [3, 1], brute: [1.5, 1], lancer: [1.5, 2] };
const THEMES = { grunt: 'HORDE', runner: 'STAMPEDE', spitter: 'SPITTER NEST', leaper: 'LEAPER PIT', brute: 'BRUTE PEN', lancer: 'LANCER WATCH' };
const pickW = w => { let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const k in w) if ((r -= w[k]) < 0) return k; return 'grunt'; };
const avail = f => Object.fromEntries(Object.entries(POOL).filter(([, [, m]]) => m <= f).map(([k, [w]]) => [k, w]));
const theme = f => pickW(Object.fromEntries(Object.keys(avail(f)).map(k => [k, 1])));
const KINDS = (f, th) => { const w = avail(f); w[th] += 8; return pickW(w); };
let burnT = 0;
export function roomSystem(world, dt) {
  const pl = world.one('player'), p = pl.pos, i = Math.floor(p.z / T), j = Math.floor(p.x / T), f = run.floor;
  burnT -= dt;
  for (const st of run.states) for (const r of st.rifts) {
    r.rotation.z += dt * (st === run.active ? 6 : 1); r.scale.setScalar(1 + (r.scale.x - 1) * Math.exp(-dt * 6));
    if (st.cleared) continue;
    const dx = p.x - r.position.x, dz = p.z - r.position.z, d = Math.hypot(dx, dz) || .01;
    if (d < 1.4 && p.y < 1.2) { // rift burn: a small tick of damage + a shove off it (never lethal)
      pl.vel.x += dx / d * 45 * dt; pl.vel.z += dz / d * 45 * dt;
      if (burnT <= 0) { burnT = .45; pl.health.hp = Math.max(1, pl.health.hp - 3); sfx.zap(); burst(p.clone().setY(p.y + .4), 0xaa33ff, 16, 5, .35, -3); }
    }
  }
  if (run.lift && Math.hypot(p.x - run.lift.position.x, p.z - run.lift.position.z) < 1.8 && p.y < .5) { // ride the lift down
    pl.health.hp = Math.min(pl.health.max, pl.health.hp + pl.health.max * .25); sfx.clear();
    return loadFloor(world, f + 1);
  }
  const st = run.active;
  if (!st) {
    for (const s of run.states) { const rm = rooms[s.k];
      if (!s.cleared && j > rm.x && j < rm.x + rm.w - 1 && i > rm.y && i < rm.y + rm.h - 1) { // walked in: lock down
        run.active = s; seal(s, 1); sfx.seal();
        if (s.exit) createEnemy(world, s.c, 'warden', s.k, f);
        banner(s.exit ? 'WARDEN' : THEMES[s.theme], `Room sealed · ${s.budget + (s.exit ? 1 : 0)} hostiles`, '#ff4466');
      }
    }
    return;
  }
  let alive = 0; for (const e of world.query('enemy')) if (e.enemy.room === st.k) alive++;
  if (st.spawned < st.budget && alive < 4 + f + Math.max(0, st.rifts.length - 2) && (st.timer -= dt) <= 0) {
    st.timer = .5; st.spawned++; // spawn from a rift that isn't right next to the player
    const far = st.rifts.filter(r => Math.hypot(r.position.x - p.x, r.position.z - p.z) > 7), pool = far.length ? far : st.rifts, r = pool[Math.random() * pool.length | 0];
    createEnemy(world, r.position, KINDS(f, st.theme), st.k, f); r.scale.setScalar(1.7);
  }
  if (st.spawned < st.budget || alive) return;
  // cleared
  st.cleared = true; run.active = null; run.cleared++; run.cores += st.exit ? 4 : 1;
  seal(st, 0); sfx.clear(); queueOffer();
  for (const r of st.rifts) { scene.remove(r); burst(r.position, 0xaa33ff, 40, 8, .7, -2); }
  if (st.exit) {
    run.lift = prop(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 24, 1, true), liftMat), st.c.x, 15, st.c.z);
    banner('LIFT ONLINE', `Step into the green beam → floor ${f + 1}`, '#33ff99');
  } else banner('ROOM CLEAR', '+1 ◆ core', '#33ff99');
}
