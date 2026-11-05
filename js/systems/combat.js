// Hold-to-fire hitscan with a magazine (infinite reserve), bloom, recoil, spin reload, upgrade stats,
// and touch auto-fire (shoots while the crosshair is on an enemy).
import * as THREE from 'three';
import { cam, muzzle } from '../render.js';
import { input, isTouch } from '../input.js';
import { raycast } from '../level.js';
import { WEAPON as G, feel, fireGun, catchGun } from '../gun.js';
import { tracer, burst } from '../fx.js';
import { sfx } from '../audio.js';
import { knock } from './enemies.js';

const dir = new THREE.Vector3(), end = new THREE.Vector3(), mz = new THREE.Vector3(), oc = new THREE.Vector3(), nrm = new THREE.Vector3();
const raySphere = (o, d, c, r) => { oc.subVectors(o, c); const b = oc.dot(d), h = b * b - oc.lengthSq() + r * r; return h < 0 ? -1 : -b - Math.sqrt(h); };
function rayCyl(o, d, cx, cz, r, y0, y1) { // vertical capped cylinder (enemy body hitbox)
  const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z, b = ox * d.x + oz * d.z, h = b * b - a * (ox * ox + oz * oz - r * r);
  if (a < 1e-8 || h < 0) return -1;
  const sq = Math.sqrt(h), tOut = (-b + sq) / a, t = Math.max(0, (-b - sq) / a);
  if (tOut < 0) return -1;
  const y = o.y + d.y * t;
  if (y >= y0 && y <= y1) return t;
  const tc = d.y ? ((y > y1 ? y1 : y0) - o.y) / d.y : -1;
  return tc >= t && tc <= tOut ? tc : -1;
}
// Everything a ray hits before the wall, nearest first
function cast(world, o, d, max, pad = 1) {
  const wall = raycast(o, d, max), wt = wall ? wall.t : max, hits = [];
  for (const e of world.query('enemy')) {
    const p = e.mesh.position, [r, h] = e.enemy.ty.hit, g = e.enemy.grow;
    const t = rayCyl(o, d, p.x, p.z, r * g * pad, p.y, p.y + h * g);
    if (t >= 0 && t < wt) hits.push({ t, e });
  }
  for (const e of world.query('proj')) { const t = raySphere(o, d, e.mesh.position, .45); if (t > 0 && t < wt) hits.push({ t, e }); }
  return { wall, wt, hits: hits.sort((a, b) => a.t - b.t) };
}
const startReload = w => { w.reload = 0; sfx.click(); };

function shoot(world, pl) {
  const w = pl.weapon, s = pl.stats, o = cam.position;
  w.mag--; w.last = world.time; cam.updateMatrixWorld();
  const dmg = s.dmg * (Math.hypot(pl.vel.x, pl.vel.z) > 14 ? 1 + s.momentum : 1);
  for (let k = 0; k < s.pellets; k++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (G.SPREAD + w.bloom + (k ? .035 : 0));
    dir.set(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(cam.quaternion);
    const { wall, wt, hits } = cast(world, o, dir, 200);
    let left = 1 + s.pierce, t = wt;
    for (const { t: ht, e } of hits) {
      if (e.proj) { e.proj.life = 0; continue; } // shoot spit out of the air
      e.health.hp -= dmg; e.enemy.hit = .08; knock(e, dir.x * .3, dir.z * .3);
      burst(end.copy(o).addScaledVector(dir, ht), e.enemy.ty.color, 10, 6); sfx.hit();
      world.hitMarker = Math.max(world.hitMarker || 0, e.health.hp <= 0 ? 2 : 1);
      if (--left <= 0) { t = ht; break; }
    }
    end.copy(o).addScaledVector(dir, t);
    tracer(mz.set(.12, -.1, -.7).applyMatrix4(cam.matrixWorld), end);
    if (left > 0 && wall) burst(end, 0xffcc66, 8, 7, .25, 15, nrm.fromArray(wall.n));
  }
  w.bloom = Math.min(G.BLOOM_MAX, w.bloom + G.BLOOM);
  fireGun(); sfx.shot(); muzzle.intensity = 25;
  feel.pitch += .014 + Math.random() * .008; feel.yaw += (Math.random() - .5) * .012; feel.shake = Math.max(feel.shake, .03);
}

export function combat(world, dt) {
  const pl = world.one('player'), w = pl.weapon, s = pl.stats;
  if (pl.sword.raise > .05) return; // sword out (melee.js handles input)
  let want = input.fireHeld || input.firePressed;
  input.firePressed = false;
  if (!want && isTouch && input.autoFire && w.mag > 0) { // generous target check (1.3x hitbox) so tracking is forgiving
    dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    want = cast(world, cam.position, dir, 60, 1.3).hits.some(h => h.e.enemy);
  }
  w.cd -= dt;
  if (world.time - w.last > .1) w.bloom = Math.max(0, w.bloom - dt * .2);
  if (s.slideLoad && pl.player.crouch && pl.player.grounded && w.mag < s.mag && Math.hypot(pl.vel.x, pl.vel.z) > 8) { // Slide Dynamo
    w.fill += dt * 12; while (w.fill >= 1 && w.mag < s.mag) { w.fill--; w.mag++; }
  }
  if (input.reload) { input.reload = false; if (w.reload < 0 && w.mag < s.mag) startReload(w); }
  if (w.reload < 0 && w.mag === 0 && world.time - w.last > .2) startReload(w); // auto reload when dry
  if (w.reload >= 0) {
    const prev = w.reload, p = w.reload += dt / (G.RELOAD * s.reload), x = v => prev < v && p >= v;
    if (x(.12) || x(.45)) sfx.whoosh();
    if (x(.2)) sfx.charge();
    if (x(.8)) { w.mag = s.mag; sfx.slam(); catchGun(); feel.shake = .02; }
    if (p >= 1 || (p >= .85 && want)) w.reload = -1; // firing cancels the tail of the animation
    else { w.cd = Math.max(w.cd, 0); return; }
  }
  if (!want) { w.cd = Math.max(w.cd, 0); return; }
  for (let n = 0; n < 3 && w.cd <= 0 && w.mag > 0; n++) { shoot(world, pl); w.cd += G.RATE / s.rate; }
}
