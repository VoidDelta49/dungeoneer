// Sword gameplay (sword runs only): 3-hit combo (click), block + parry (right-click), throw (E).
// A thrown sword is a real projectile (gravity): it ricochets from enemy to enemy (stats.bounces extra hits), glances
// off high walls and sticks into floors / low walls. Walk over it within 20s or it's gone for the run (also lost if you
// take the lift without it). Tethered Hilt lets you recall it.
import * as THREE from 'three';
import { scene, cam } from '../render.js';
import { input, isTouch } from '../input.js';
import { raycast, topAt } from '../level.js';
import { makeSword, SWINGS, HIT_AT, flashSword } from '../sword.js';
import { burst, glowTex } from '../fx.js';
import { sfx } from '../audio.js';
import { feel } from '../gun.js';
import { knock, stagger, reflect } from './enemies.js';

const LIFE = 20, TG = 24, fwd = new THREE.Vector3(), v3 = new THREE.Vector3(), c3 = new THREE.Vector3(), tv = new THREE.Vector3();
const beamMat = new THREE.MeshBasicMaterial({ color: 0x4ff0ff, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending });
const beamGeo = new THREE.CylinderGeometry(.06, .06, 14, 6).translate(0, 7, 0);

function damage(world, pl, e, dmg, dx, dz, heavy) {
  e.health.hp -= dmg; e.enemy.hit = .12; knock(e, dx, dz);
  if (heavy && e.enemy.state === 'wind') stagger(e.enemy, .8); // heavy hits interrupt wind-ups
  c3.set(e.mesh.position.x, e.enemy.y + e.enemy.ty.hit[1] * .6, e.mesh.position.z);
  burst(c3, e.enemy.ty.color, heavy ? 24 : 14, heavy ? 9 : 7); burst(c3, 0xffffff, 6, 11, .12, 0);
  world.hitMarker = Math.max(world.hitMarker || 0, e.health.hp <= 0 ? 2 : 1);
}
// enemies inside the sword's reach, in a ~65deg cone in front
function* inReach(world, pl, reach) {
  const p = cam.position, yaw = input.look.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const e of world.query('enemy')) {
    const q = e.mesh.position, [r, h] = e.enemy.ty.hit, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
    if (d - r < reach && (fx * dx + fz * dz) / d > .42 - Math.min(.5, r / d) && p.y > q.y - 1 && p.y < q.y + h + 1) yield e;
  }
}

function strike(world, pl, k) {
  const s = pl.stats, S = SWINGS[k], yaw = input.look.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const dmg = S.dmg * s.sdmg * (Math.hypot(pl.vel.x, pl.vel.z) > 14 ? 1 + s.momentum : 1), push = k === 2 ? 1.4 : .5;
  sfx.swing(k); feel.roll += S.dir * .03; feel.yaw += S.dir * .012; if (k === 2) feel.pitch -= .03; // camera follows the cut
  feel.shake = Math.max(feel.shake, .02);
  let n = 0;
  for (const e of inReach(world, pl, s.reach)) { damage(world, pl, e, dmg, fx * push, fz * push, k === 2); n++; }
  for (const e of world.query('proj')) { // swings bat spit back
    const q = e.mesh.position; v3.subVectors(q, cam.position);
    if (!e.proj.friendly && v3.length() < s.reach + .5 && (v3.x * fx + v3.z * fz) / v3.length() > .3) { reflect(e.proj); n++; }
  }
  if (k === 2 && s.finisher) { // shockwave in front
    const cx = cam.position.x + fx * 2, cz = cam.position.z + fz * 2, R = 2 + s.finisher;
    burst(c3.set(cx, pl.pos.y + .3, cz), 0x4ff0ff, 60, 12, .4, 3); feel.shake = .1;
    for (const e of world.query('enemy')) if (Math.hypot(e.mesh.position.x - cx, e.mesh.position.z - cz) < R + e.enemy.ty.r) { damage(world, pl, e, 3 * s.sdmg, fx, fz, true); n++; }
  }
  if (n) { // connect: meaty sound, blade flash, shake and a short hitstop (longer on the finisher)
    sfx.slash(k === 2); flashSword();
    feel.shake = Math.max(feel.shake, k === 2 ? .13 : .07); feel.roll += S.dir * .015; if (k === 2) feel.pitch -= .02;
    world.hitstop = Math.max(world.hitstop, (k === 2 ? .085 : .045) + Math.min(n - 1, 3) * .01);
  }
}

function throwSword(world, pl) {
  const sw = pl.sword, root = new THREE.Group(), aim = new THREE.Group(), spin = new THREE.Group(), model = makeSword();
  model.scale.setScalar(1.6); model.rotation.x = Math.PI / 2; // blade along +z
  spin.add(model); aim.add(spin); root.add(aim);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4ff0ff, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(1.5); const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; root.add(glow, beam);
  fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
  root.position.copy(cam.position).addScaledVector(fwd, .6); scene.add(root);
  const v = fwd.clone().multiplyScalar(30); v.y += 2.5; v.x += pl.vel.x * .4; v.z += pl.vel.z * .4; // a little arc + your momentum
  world.add({ thrown: { v, state: 'fly', t: 0, hit: new Set(), target: null, aim, spin, beam }, mesh: root });
  sw.thrown = true; sw.equipped = false; sw.swing = -1; sfx.swing(0); sfx.charge();
}

// After hitting an enemy: lob toward the nearest un-hit enemy in sight, or pop up off it and fall
function bounce(world, pl, T, p, q) {
  let best = null, bd = 15;
  if (T.hit.size <= pl.stats.bounces) for (const o of world.query('enemy')) {
    if (T.hit.has(o)) continue;
    const m = o.mesh.position, d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d >= bd) continue;
    tv.set(m.x, o.enemy.y + o.enemy.ty.hit[1] * .5, m.z).sub(p); const L = tv.length();
    if (!raycast(p, tv.divideScalar(L), L, true)) { bd = d; best = o; }
  }
  T.target = best;
  if (best) {
    const m = best.mesh.position, dx = m.x - p.x, dz = m.z - p.z, t = Math.max(.12, Math.hypot(dx, dz) / 24);
    T.v.set(dx / t, (best.enemy.y + best.enemy.ty.hit[1] * .5 - p.y + .5 * TG * t * t) / t, dz / t);
  } else {
    const nx = p.x - q.x, nz = p.z - q.z, nl = Math.hypot(nx, nz) || 1, dot = (T.v.x * nx + T.v.z * nz) / nl;
    if (dot < 0) { T.v.x -= 2 * dot * nx / nl; T.v.z -= 2 * dot * nz / nl; }
    T.v.x *= .3; T.v.z *= .3; T.v.y = 8;
  }
}

function stick(T, p, dir, wall) {
  p.addScaledVector(dir, Math.max(0, wall.t - .8)); p.y = Math.max(p.y, topAt(p.x, p.z) + .4);
  T.state = 'stuck'; T.t = 0; T.spin.rotation.x = 0; T.aim.lookAt(c3.copy(p).add(dir));
  sfx.slam(); burst(c3.copy(p).addScaledVector(dir, .8), 0xffcc66, 14, 6);
}

function flyStep(world, pl, e, h) {
  const T = e.thrown, p = e.mesh.position, s = pl.stats;
  if (T.target && world.ents.has(T.target) && !T.hit.has(T.target)) { // gentle homing on the ricochet target
    const m = T.target.mesh.position, dx = m.x - p.x, dz = m.z - p.z, dl = Math.hypot(dx, dz) || 1, sp = Math.hypot(T.v.x, T.v.z), k = Math.min(1, 8 * h);
    T.v.x += (dx / dl * sp - T.v.x) * k; T.v.z += (dz / dl * sp - T.v.z) * k;
  }
  T.v.y -= TG * h;
  const L = T.v.length() * h; v3.copy(T.v).normalize();
  for (const o of world.query('enemy')) {
    const q = o.mesh.position, [r, ht] = o.enemy.ty.hit;
    if (T.hit.has(o) || Math.hypot(p.x - q.x, p.z - q.z) > r + .5 || p.y < q.y - .3 || p.y > q.y + ht + .3) continue;
    T.hit.add(o); damage(world, pl, o, 8 * s.sdmg * s.throwDmg, v3.x, v3.z, true);
    sfx.slash(true); sfx.ricochet(); feel.shake = Math.max(feel.shake, .05); world.hitstop = Math.max(world.hitstop, .035);
    return bounce(world, pl, T, p, q);
  }
  const wall = raycast(p, v3, L + .25, true);
  if (!wall) return void p.addScaledVector(v3, L);
  const [nx, ny, nz] = wall.n;
  if (ny > .5) return stick(T, p, v3, wall);                                    // floor / block top
  if (ny < -.5) { T.v.y = -Math.abs(T.v.y) * .3; return; }                      // ceiling: knock it down
  if (p.y - topAt(p.x, p.z) < 3.2) return stick(T, p, v3, wall);                // low wall: sticks in, reachable
  const dn = T.v.x * nx + T.v.z * nz; T.v.x = (T.v.x - 2 * dn * nx) * .3; T.v.z = (T.v.z - 2 * dn * nz) * .3; // too high: glance off
  sfx.clang(); burst(p, 0xffcc66, 8, 5);
}

function thrownUpdate(world, pl, e, dt) {
  const T = e.thrown, p = e.mesh.position, sw = pl.sword, s = pl.stats;
  T.t += dt;
  const catchIt = () => { sw.thrown = false; sw.equipped = true; sw.status = ''; scene.remove(e.mesh); world.remove(e); sfx.pickup(); };
  if (T.state === 'recall') {
    T.v.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z).sub(p); if (T.v.length() < 1.3) return catchIt(); T.v.setLength(40);
    v3.copy(T.v).normalize(); p.addScaledVector(T.v, dt);
    T.spin.rotation.x -= dt * 28; T.aim.lookAt(c3.copy(p).add(v3));
    for (const o of world.query('enemy')) { // cuts through everything on the way back
      const q = o.mesh.position, [r, h] = o.enemy.ty.hit;
      if (!T.hit.has(o) && Math.hypot(p.x - q.x, p.z - q.z) < r + .4 && p.y > q.y - .3 && p.y < q.y + h + .3) {
        T.hit.add(o); damage(world, pl, o, 8 * s.sdmg * s.throwDmg, v3.x, v3.z, true); sfx.slash(true);
      }
    }
    return;
  }
  if (T.state === 'fly') {
    const n = Math.max(1, Math.ceil(T.v.length() * dt / .3)); // sub-steps so it can't tunnel through enemies or walls
    for (let k = 0; k < n && T.state === 'fly'; k++) flyStep(world, pl, e, dt / n);
    if (T.state === 'fly') { T.spin.rotation.x -= dt * 26; T.aim.lookAt(c3.copy(p).add(T.v)); }
    if (T.state === 'fly' && T.t > 8) { p.y = topAt(p.x, p.z) + 1.1; T.state = 'stuck'; T.t = 0; T.spin.rotation.x = 0; T.aim.lookAt(p.x, p.y - 1, p.z); }
    return;
  }
  // stuck: beacon, pickup, countdown
  T.beam.visible = true; T.beam.position.y = -p.y + topAt(p.x, p.z);
  e.mesh.visible = T.t < LIFE - 5 || Math.sin(T.t * 25) > 0;
  const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z);
  sw.status = `SWORD ${Math.ceil(LIFE - T.t)}s · ${d | 0}m`;
  if (d < 2.2 && Math.abs(p.y - (pl.pos.y + 1)) < 2.6) return catchIt();
  if (T.t > LIFE) lose(world, pl, e);
}
export function lose(world, pl, e = world.one('thrown')) {
  const sw = pl.sword; sw.has = sw.thrown = sw.equipped = false; sw.status = 'SWORD LOST';
  if (e) { burst(e.mesh.position, 0x4ff0ff, 40, 6, .8); scene.remove(e.mesh); world.remove(e); }
  sfx.hurt();
}

export function melee(world, dt) {
  const pl = world.one('player'), sw = pl.sword, s = pl.stats, p = pl.player;
  for (const e of world.query('thrown')) thrownUpdate(world, pl, e, dt);
  if (input.throw) {
    input.throw = false;
    if (sw.thrown && s.recall) { const t = world.one('thrown')?.thrown; if (t && t.state !== 'recall') { t.state = 'recall'; t.hit.clear(); t.beam.visible = false; sfx.whoosh(); } }
    else if (sw.equipped && sw.raise > .8) throwSword(world, pl);
  }
  sw.raise += ((sw.equipped ? 1 : 0) - sw.raise) * Math.min(1, dt * 12);
  input.melee = sw.equipped;
  const blocking = sw.equipped && input.block && sw.swing < 0 && sw.raise > .8;
  p.block = blocking ? (p.block < 0 ? 0 : p.block + dt) : -1;
  if (!sw.equipped) { sw.swing = -1; return; }
  let want = input.fireHeld || input.firePressed;
  input.firePressed = false;
  if (!want && isTouch && input.autoFire) for (const _ of inReach(world, pl, s.reach)) { want = true; break; }
  sw.window -= dt;
  if (sw.swing >= 0) {
    const S = SWINGS[sw.swing]; sw.t += dt * s.sspeed;
    if (!sw.hit && sw.t >= S.dur * HIT_AT) { sw.hit = true; strike(world, pl, sw.swing); }
    if (want && sw.t > S.dur * .45) sw.queued = true;
    if (sw.t >= S.dur) {
      if (sw.queued && sw.swing < 2) start(sw, sw.swing + 1);
      else { sw.next = sw.swing < 2 ? sw.swing + 1 : 0; sw.window = sw.swing < 2 ? .45 : 0; sw.swing = -1; }
    }
  } else if (want && !blocking && sw.raise > .8) start(sw, sw.window > 0 ? sw.next : 0);
}
const start = (sw, k) => { // wind-up: camera leans back against the coming cut
  Object.assign(sw, { swing: k, t: 0, hit: false, queued: false });
  feel.roll -= SWINGS[k].dir * .012; if (k === 2) feel.pitch += .018;
};
