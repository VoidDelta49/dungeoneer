// Roguelite run loop: each floor is a 3x3 dungeon. Entering an uncleared room seals its doors and its rift
// spews waves; clearing it opens the doors, pays Cores and pings the phone with an upgrade. The exit room
// (farthest from the start) holds a Warden; killing it powers a lift to the next, harder floor.
import * as THREE from 'three';
import { scene, buildLevel } from '../render.js';
import { generate, rooms, start, barrier, doorTiles, roomCenter, W, T, WALL } from '../level.js';
import { refreshNav } from '../nav.js';
import { createEnemy, removeEnt } from './enemies.js';
import { queueOffer } from '../phone.js';
import { burst } from '../fx.js';
import { sfx } from '../audio.js';

export const run = { floor: 1, cores: 0, cleared: 0, active: null, states: [] };
const bannerEl = document.getElementById('banner');
export function banner(title, sub = '', color = '#fff') {
  bannerEl.innerHTML = `<b style="color:${color}">${title}</b><small>${sub}</small>`;
  bannerEl.classList.remove('show'); void bannerEl.offsetWidth; bannerEl.classList.add('show');
}

const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const riftGeo = new THREE.TorusGeometry(1.2, .12, 8, 24), sealGeo = new THREE.BoxGeometry(T, WALL, T);
const sealMat = new THREE.MeshBasicMaterial({ color: 0xff2244, opacity: .3, side: THREE.DoubleSide, ...add });
const liftMat = new THREE.MeshBasicMaterial({ color: 0x33ff99, opacity: .5, ...add });
let props = []; // per-floor meshes
const prop = (m, x, y, z) => { m.position.set(x, y, z); scene.add(m); props.push(m); return m; };

export function loadFloor(world, floor) {
  for (const e of [...world.ents]) if (!e.player && e.mesh) removeEnt(world, e);
  for (const m of props) scene.remove(m); props = [];
  generate(floor); buildLevel(); refreshNav();
  Object.assign(run, { floor, active: null, lift: null });
  const c0 = roomCenter(rooms[0]), cs = rooms.map(roomCenter), exit = cs.reduce((b, c, k) => c.distanceTo(c0) > cs[b].distanceTo(c0) ? k : b, 1);
  run.states = rooms.map((rm, k) => {
    const st = { k, c: cs[k], cleared: !k, exit: k === exit, spawned: 0, timer: 0, seals: [],
      budget: Math.round((4 + rm.w * rm.h / 70 + floor * 2.5) * (k === exit ? .6 : 1)) };
    if (k) { st.rift = prop(new THREE.Mesh(riftGeo, new THREE.MeshBasicMaterial({ color: st.exit ? 0xff3322 : 0xaa00ff })), cs[k].x, .05, cs[k].z); st.rift.rotation.x = -Math.PI / 2; }
    return st;
  });
  const p = world.one('player'); p.pos.copy(start); p.prev.copy(start); p.vel.set(0, 0, 0);
  banner(`FLOOR ${floor}`, 'Clear rooms for upgrades · the red rift guards the lift', '#4ff0ff');
}

function seal(st, on) {
  for (const [i, j] of doorTiles(rooms[st.k])) {
    barrier[i * W + j] = on;
    if (on) st.seals.push(prop(new THREE.Mesh(sealGeo, sealMat), (j + .5) * T, WALL / 2, (i + .5) * T));
  }
  if (!on) { for (const m of st.seals) { burst(m.position, 0xff4466, 12, 6, .5, 0); scene.remove(m); } st.seals = []; }
  refreshNav();
}

const KINDS = f => { const r = Math.random(); return r < Math.min(.3, .06 + f * .06) ? 'spitter' : r < Math.min(.65, .2 + f * .12) ? 'runner' : 'grunt'; };
export function roomSystem(world, dt) {
  const pl = world.one('player'), p = pl.pos, i = Math.floor(p.z / T), j = Math.floor(p.x / T), f = run.floor;
  for (const st of run.states) if (st.rift) st.rift.rotation.z += dt * (st === run.active ? 6 : 1);
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
        banner(s.exit ? 'WARDEN' : 'ROOM SEALED', `${s.budget + (s.exit ? 1 : 0)} hostiles`, '#ff4466');
      }
    }
    return;
  }
  let alive = 0; for (const e of world.query('enemy')) if (e.enemy.room === st.k) alive++;
  if (st.spawned < st.budget && alive < 4 + f && (st.timer -= dt) <= 0) { st.timer = .55; st.spawned++; createEnemy(world, st.c, KINDS(f), st.k, f); }
  if (st.spawned < st.budget || alive) return;
  // cleared
  st.cleared = true; run.active = null; run.cleared++; run.cores += st.exit ? 4 : 1;
  seal(st, 0); sfx.clear(); scene.remove(st.rift); burst(st.c, 0xaa33ff, 50, 8, .7, -2); queueOffer();
  if (st.exit) {
    run.lift = prop(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 24, 1, true), liftMat), st.c.x, 15, st.c.z);
    banner('LIFT ONLINE', `Step into the green beam → floor ${f + 1}`, '#33ff99');
  } else banner('ROOM CLEAR', '+1 ◆ core', '#33ff99');
}
