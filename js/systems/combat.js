// Hold-to-fire hitscan with a magazine (infinite reserve), bloom, recoil and a spin reload
import * as THREE from 'three';
import { cam, muzzle } from '../render.js';
import { input } from '../input.js';
import { raycast } from '../level.js';
import { WEAPON as G, feel, fireGun, catchGun } from '../gun.js';
import { tracer, burst } from '../fx.js';
import { sfx } from '../audio.js';
import { knock } from './enemies.js';

const dir = new THREE.Vector3(), end = new THREE.Vector3(), mz = new THREE.Vector3(), oc = new THREE.Vector3(), nrm = new THREE.Vector3();
const raySphere = (o, d, c, r) => { oc.subVectors(o, c); const b = oc.dot(d), h = b * b - oc.lengthSq() + r * r; return h < 0 ? -1 : -b - Math.sqrt(h); };
const startReload = w => { w.reload = 0; sfx.click(); };

function shoot(world, w) {
  w.mag--; w.last = world.time; cam.updateMatrixWorld();
  const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (G.SPREAD + w.bloom);
  w.bloom = Math.min(G.BLOOM_MAX, w.bloom + G.BLOOM);
  dir.set(Math.cos(a) * r, Math.sin(a) * r, -1).normalize().applyQuaternion(cam.quaternion);
  const o = cam.position, wall = raycast(o, dir);
  let t = wall ? wall.t : 200, hit = null;
  for (const e of world.query('mesh')) {
    const s = raySphere(o, dir, e.mesh.position, e.enemy ? e.enemy.ty.r * 1.15 : .45);
    if ((e.enemy || e.proj) && s > 0 && s < t) { t = s; hit = e; }
  }
  end.copy(o).addScaledVector(dir, t);
  tracer(mz.set(.12, -.1, -.7).applyMatrix4(cam.matrixWorld), end);
  if (hit?.enemy) {
    hit.health.hp--; hit.enemy.hit = .08; hit.enemy.squash = 1; knock(hit, dir.x * .3, dir.z * .3);
    burst(end, hit.enemy.ty.color, 10, 6); sfx.hit(); world.hitMarker = hit.health.hp <= 0 ? 2 : 1;
  } else if (hit) hit.proj.life = 0; // shoot spit out of the air
  else if (wall) burst(end, 0xffcc66, 8, 7, .25, 15, nrm.fromArray(wall.n));
  fireGun(); sfx.shot(); muzzle.intensity = 25;
  feel.pitch += .014 + Math.random() * .008; feel.yaw += (Math.random() - .5) * .012; feel.shake = Math.max(feel.shake, .03);
}

export function combat(world, dt) {
  const w = world.one('player').weapon, want = input.fireHeld || input.firePressed;
  input.firePressed = false;
  w.cd -= dt;
  if (world.time - w.last > .1) w.bloom = Math.max(0, w.bloom - dt * .2);
  if (input.reload) { input.reload = false; if (w.reload < 0 && w.mag < G.MAG) startReload(w); }
  if (w.reload < 0 && w.mag === 0 && world.time - w.last > .2) startReload(w); // auto reload when dry
  if (w.reload >= 0) {
    const prev = w.reload, p = w.reload += dt / G.RELOAD, x = v => prev < v && p >= v;
    if (x(.12) || x(.45)) sfx.whoosh();
    if (x(.2)) sfx.charge();
    if (x(.8)) { w.mag = G.MAG; sfx.slam(); catchGun(); feel.shake = .02; }
    if (p >= 1 || (p >= .85 && want)) w.reload = -1; // firing cancels the tail of the animation
    else { w.cd = Math.max(w.cd, 0); return; }
  }
  if (!want) { w.cd = Math.max(w.cd, 0); return; }
  for (let n = 0; n < 3 && w.cd <= 0 && w.mag > 0; n++) { shoot(world, w); w.cd += G.RATE; }
}
