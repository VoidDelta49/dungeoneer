// Sword gameplay: swap (Q / wheel), 3-hit combo (click), block + parry (right-click), throw (E).
// A thrown sword flies, cuts through enemies, then sticks where it lands: walk over it within 20s or it's
// gone for the run (also lost if you take the lift without it). Tethered Hilt lets you recall it.
import * as THREE from 'three';
import { scene, cam } from '../render.js';
import { input, isTouch } from '../input.js';
import { raycast, topAt } from '../level.js';
import { makeSword, SWINGS, HIT_AT } from '../sword.js';
import { burst, glowTex } from '../fx.js';
import { sfx } from '../audio.js';
import { feel } from '../gun.js';
import { knock, stagger, reflect } from './enemies.js';

const LIFE = 20, fwd = new THREE.Vector3(), v3 = new THREE.Vector3(), c3 = new THREE.Vector3();
const beamMat = new THREE.MeshBasicMaterial({ color: 0x4ff0ff, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending });
const beamGeo = new THREE.CylinderGeometry(.06, .06, 14, 6).translate(0, 7, 0);

function damage(world, pl, e, dmg, dx, dz, heavy) {
  e.health.hp -= dmg; e.enemy.hit = .1; knock(e, dx, dz);
  if (heavy && e.enemy.state === 'wind') stagger(e.enemy, .8); // heavy hits interrupt wind-ups
  burst(c3.set(e.mesh.position.x, e.enemy.y + e.enemy.ty.hit[1] * .6, e.mesh.position.z), e.enemy.ty.color, 14, 7); sfx.hit();
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
  let any = false;
  for (const e of inReach(world, pl, s.reach)) { damage(world, pl, e, dmg, fx * push, fz * push, k === 2); any = true; }
  for (const e of world.query('proj')) { // swings bat spit back
    const q = e.mesh.position; v3.subVectors(q, cam.position);
    if (!e.proj.friendly && v3.length() < s.reach + .5 && (v3.x * fx + v3.z * fz) / v3.length() > .3) { reflect(e.proj); any = true; }
  }
  if (k === 2 && s.finisher) { // shockwave in front
    const cx = cam.position.x + fx * 2, cz = cam.position.z + fz * 2, R = 2 + s.finisher;
    burst(c3.set(cx, pl.pos.y + .3, cz), 0x4ff0ff, 60, 12, .4, 3); feel.shake = .1;
    for (const e of world.query('enemy')) if (Math.hypot(e.mesh.position.x - cx, e.mesh.position.z - cz) < R + e.enemy.ty.r) damage(world, pl, e, 3 * s.sdmg, fx, fz, true);
  }
  if (any) { feel.shake = Math.max(feel.shake, k === 2 ? .08 : .04); feel.yaw += (k === 1 ? -1 : 1) * .01; }
}

function throwSword(world, pl) {
  const sw = pl.sword, root = new THREE.Group(), aim = new THREE.Group(), spin = new THREE.Group(), model = makeSword();
  model.scale.setScalar(1.6); model.rotation.x = Math.PI / 2; // blade along +z
  spin.add(model); aim.add(spin); root.add(aim);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4ff0ff, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(1.5); const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; root.add(glow, beam);
  fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
  root.position.copy(cam.position).addScaledVector(fwd, .6); scene.add(root);
  world.add({ thrown: { v: fwd.clone().multiplyScalar(32), state: 'fly', t: 0, hit: new Set(), aim, spin, beam }, mesh: root });
  sw.thrown = true; sw.equipped = false; sw.swing = -1; sfx.whoosh(); sfx.charge();
}

function thrownUpdate(world, pl, e, dt) {
  const T = e.thrown, p = e.mesh.position, sw = pl.sword, s = pl.stats;
  T.t += dt;
  const catchIt = () => { sw.thrown = false; sw.equipped = true; sw.status = ''; scene.remove(e.mesh); world.remove(e); sfx.pickup(); };
  if (T.state === 'fly' || T.state === 'recall') {
    if (T.state === 'recall') { T.v.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z).sub(p); if (T.v.length() < 1.3) return catchIt(); T.v.setLength(40); }
    else T.v.y -= 8 * dt;
    const L = T.v.length() * dt; v3.copy(T.v).normalize();
    const wall = T.state === 'fly' && raycast(p, v3, L + .3);
    T.spin.rotation.x -= dt * 28; T.aim.lookAt(c3.copy(p).add(v3));
    for (const o of world.query('enemy')) { // cuts through everything on the way
      const q = o.mesh.position, [r, h] = o.enemy.ty.hit;
      if (!T.hit.has(o) && Math.hypot(p.x - q.x, p.z - q.z) < r + .4 && p.y > q.y - .3 && p.y < q.y + h + .3) {
        T.hit.add(o); damage(world, pl, o, 8 * s.sdmg * s.throwDmg, v3.x, v3.z, true);
      }
    }
    if (wall) { // stick into walls/floors; if it hits too high to reach, drop it to the ground instead
      p.addScaledVector(v3, Math.max(0, wall.t - .9)); T.spin.rotation.x = 0; sfx.slam(); burst(c3.copy(p).addScaledVector(v3, .9), 0xffcc66, 12, 6);
      if (p.y > 3.2 || wall.n[1] < 0) { T.state = 'fall'; T.v.set(0, 0, 0); T.aim.lookAt(p.x, p.y - 1, p.z); } else { T.state = 'stuck'; T.t = 0; }
    } else p.addScaledVector(v3, L);
    if (T.state === 'fly' && T.t > 1.6) { T.state = 'fall'; T.v.set(0, 0, 0); T.spin.rotation.x = 0; T.aim.lookAt(p.x, p.y - 1, p.z); }
    return;
  }
  if (T.state === 'fall') {
    T.v.y -= 30 * dt; p.y += T.v.y * dt;
    const g = topAt(p.x, p.z) + 1.1; if (p.y <= g) { p.y = g; T.state = 'stuck'; T.t = 0; sfx.slam(); }
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
  if (input.swap) { input.swap = false; if (sw.has && !sw.thrown && sw.swing < 0) { sw.equipped = !sw.equipped; sfx.click(); } }
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
    if (!sw.hit && sw.t >= S.dur * HIT_AT) { sw.hit = true; sfx.whoosh(); strike(world, pl, sw.swing); }
    if (want && sw.t > S.dur * .45) sw.queued = true;
    if (sw.t >= S.dur) {
      if (sw.queued && sw.swing < 2) start(sw, sw.swing + 1);
      else { sw.next = sw.swing < 2 ? sw.swing + 1 : 0; sw.window = sw.swing < 2 ? .45 : 0; sw.swing = -1; }
    }
  } else if (want && !blocking && sw.raise > .8) start(sw, sw.window > 0 ? sw.next : 0);
}
const start = (sw, k) => Object.assign(sw, { swing: k, t: 0, hit: false, queued: false });
