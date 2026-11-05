// Enemies: spawning, flow-field chasing (hopping up low steps), spitter projectiles, separation, death + drops
import * as THREE from 'three';
import { scene } from '../render.js';
import { CLIMB, ROOF, spawns, topAt, roofed, raycast, T } from '../level.js';
import { updateFlow, flowDir } from '../nav.js';
import { burst, glowTex } from '../fx.js';
import { sfx } from '../audio.js';
import { feel } from '../gun.js';

const TYPES = {
  grunt:   { color: 0x33aa33, r: .5,  hp: 4, speed: [4, 6],     dmg: 25, geo: new THREE.IcosahedronGeometry(.5, 0) },
  runner:  { color: 0xff4422, r: .35, hp: 2, speed: [8.5, 10],  dmg: 18, geo: new THREE.OctahedronGeometry(.38, 0) },
  spitter: { color: 0xffbb22, r: .55, hp: 4, speed: [3.5, 4.5], dmg: 15, geo: new THREE.IcosahedronGeometry(.55, 1), ranged: true },
};
const MAX = 45, JUMP = 9.5, GRAV = 30;
const eyeGeo = new THREE.SphereGeometry(.08, 6, 6), eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const v3 = new THREE.Vector3(), o3 = new THREE.Vector3(), d3 = new THREE.Vector3();

// Axis-separated move; returns height of whatever blocked it (0 if free)
function move(en, pos, dx, dz) {
  const r = en.ty.r, hx = topAt(pos.x + dx + Math.sign(dx) * r, pos.z), hz = topAt(pos.x, pos.z + dz + Math.sign(dz) * r);
  if (hx <= en.y + .3) pos.x += dx;
  if (hz <= en.y + .3) pos.z += dz;
  return Math.max(hx > en.y + .3 ? hx : 0, hz > en.y + .3 ? hz : 0);
}
export const knock = (e, dx, dz) => move(e.enemy, e.mesh.position, dx, dz);
const clearLine = (ax, az, bx, bz, y) => { // straight walkable line on one level
  const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.hypot(dx, dz) / .8);
  for (let k = 1; k <= n; k++) if (topAt(ax + dx * k / n, az + dz * k / n) > y + .3) return false;
  return true;
};

function createEnemy(world, p, kind) {
  const ty = TYPES[kind], mesh = new THREE.Mesh(ty.geo, new THREE.MeshStandardMaterial({ color: ty.color, flatShading: true }));
  mesh.castShadow = true;
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.scale.setScalar(ty.r / .5); e.position.set(s * .36 * ty.r, .2 * ty.r, .84 * ty.r); mesh.add(e); }
  mesh.position.set(p.x + Math.random() - .5, 0, p.z + Math.random() - .5); mesh.scale.setScalar(.01); scene.add(mesh);
  world.add({ enemy: { ty, speed: ty.speed[0] + Math.random() * (ty.speed[1] - ty.speed[0]), hit: 0, squash: 0, y: 0, vy: 0, grounded: true, cd: 1.5, los: false, losT: 0, age: 0 }, health: { hp: ty.hp }, mesh });
  burst(mesh.position, 0xaa33ff, 16, 4, .5, -4);
}

let timer = 2;
export function spawner(world, dt) {
  if ((timer -= dt) > 0) return;
  timer = Math.max(.35, 1.6 - world.time * .015);
  if ([...world.query('enemy')].length >= MAX) return;
  const pp = world.one('player').pos, d = s => Math.hypot(s.x - pp.x, s.z - pp.z);
  const near = spawns.filter(s => d(s) > 14 && d(s) < 75), pool = near.length ? near : spawns.filter(s => d(s) > 14);
  const t = world.time, r = Math.random() * 17;
  if (pool.length) createEnemy(world, pool[Math.random() * pool.length | 0], r < 10 || t < 20 ? 'grunt' : r < 14 || t < 35 ? 'runner' : 'spitter');
}

const projGeo = new THREE.SphereGeometry(.2, 10, 8), projMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
const projGlow = new THREE.SpriteMaterial({ map: glowTex, color: 0xffaa22, blending: THREE.AdditiveBlending, depthWrite: false });
function spit(world, from, to) {
  const m = new THREE.Mesh(projGeo, projMat), g = new THREE.Sprite(projGlow); g.scale.setScalar(1.2); m.add(g);
  m.position.copy(from); scene.add(m); sfx.spit();
  world.add({ proj: { v: to.clone().sub(from).normalize().multiplyScalar(17), life: 4 }, mesh: m });
}

export function enemyAI(world, dt) {
  const pl = world.one('player'), pp = pl.pos;
  updateFlow(pp.x, pp.z);
  for (const e of world.query('enemy')) {
    const en = e.enemy, ty = en.ty, m = e.mesh, pos = m.position;
    en.age += dt;
    v3.set(pp.x - pos.x, 0, pp.z - pos.z);
    const d = v3.length(), dy = pp.y - en.y;
    if (d < ty.r + .55 && dy > -1.3 && dy < 1.5) pl.health.hp -= ty.dmg * dt; // contact damage
    let go = d > ty.r + .3;
    if (ty.ranged) {
      if ((en.losT -= dt) <= 0) {
        en.losT = .25; o3.set(pos.x, en.y + .9, pos.z); d3.set(pp.x, pp.y + 1.3, pp.z).sub(o3);
        const L = d3.length(); en.los = !raycast(o3, d3.divideScalar(L), L);
      }
      en.cd -= dt;
      if (en.los && d < 28) {
        if (d < 18) go = false;
        if (en.cd <= 0) { en.cd = 1.7 + Math.random() * .8; en.squash = 1; spit(world, o3.set(pos.x, pos.y, pos.z).addScaledVector(v3, ty.r / d), d3.set(pp.x, pp.y + 1.2, pp.z)); }
      }
    }
    if (go && en.age > .4) {
      if (!(d < 45 && clearLine(pos.x, pos.z, pp.x, pp.z, en.y))) flowDir(pos.x, pos.z, v3);
      const s = en.speed * dt / (Math.hypot(v3.x, v3.z) || 1), b = move(en, pos, v3.x * s, v3.z * s);
      if (b && en.grounded && b - en.y <= CLIMB) { en.vy = JUMP; en.grounded = false; }
    }
    en.vy -= GRAV * dt; en.y += en.vy * dt;
    const g = topAt(pos.x, pos.z);
    if (en.y <= g) { en.y = g; en.vy = 0; en.grounded = true; } else en.grounded = en.y - g < .05;
    const grow = Math.min(1, en.age / .4), sq = en.squash; en.squash = Math.max(0, sq - dt * 6);
    m.scale.set(grow * (1 + sq * .25), grow * (1 - sq * .2), grow * (1 + sq * .25));
    pos.y = en.y + ty.r + .15 + Math.sin(world.time * 6 + m.id) * .08;
    m.lookAt(pp.x, pos.y, pp.z);
    en.hit -= dt; m.material.emissive.setHex(en.hit > 0 ? 0xff2200 : ty.ranged && en.los && en.cd < .3 ? 0x884400 : 0); // spitter telegraphs
  }
}

export function projectiles(world, dt) {
  const pl = world.one('player'), pp = pl.pos;
  for (const e of world.query('proj')) {
    const p = e.mesh.position, pr = e.proj; p.addScaledVector(pr.v, dt);
    if (Math.hypot(p.x - pp.x, p.z - pp.z) < .6 && p.y > pp.y && p.y < pp.y + (pl.player.crouch ? 1 : 1.8)) { pl.health.hp -= 14; feel.shake = .1; pr.life = 0; }
    if ((pr.life -= dt) <= 0 || p.y < topAt(p.x, p.z) || (p.y > ROOF && roofed(Math.floor(p.z / T), Math.floor(p.x / T)))) {
      burst(p, 0xffbb33, 14, 5, .3); scene.remove(e.mesh); world.remove(e);
    }
  }
}

export function separation(world) {
  const es = [...world.query('enemy')];
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i].mesh.position, b = es[j].mesh.position; v3.subVectors(a, b); v3.y = 0;
    const d = v3.length(), min = (es[i].enemy.ty.r + es[j].enemy.ty.r) * .9;
    if (d < min && d > 0) { v3.multiplyScalar((min - d) / d / 2); move(es[i].enemy, a, v3.x, v3.z); move(es[j].enemy, b, -v3.x, -v3.z); }
  }
}

const hpGeo = [new THREE.BoxGeometry(.5, .16, .16), new THREE.BoxGeometry(.16, .5, .16)];
const hpMat = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x22ff55, emissiveIntensity: 1.5 });
export function enemyDeath(world) {
  for (const e of world.query('enemy')) if (e.health.hp <= 0) {
    const p = e.mesh.position;
    burst(p, e.enemy.ty.color, 35, 9, .6, 12); sfx.kill();
    if (Math.random() < .12) { // health drop
      const g = new THREE.Group(); hpGeo.forEach(h => g.add(new THREE.Mesh(h, hpMat))); g.position.set(p.x, 0, p.z); scene.add(g);
      world.add({ pickup: { t: 0, y: e.enemy.y }, mesh: g });
    }
    scene.remove(e.mesh); e.mesh.material.dispose(); world.remove(e); world.kills++;
  }
}

export function pickups(world, dt) {
  const pl = world.one('player'), pp = pl.pos;
  for (const e of world.query('pickup')) {
    const m = e.mesh, pk = e.pickup; pk.t += dt;
    m.rotation.y += dt * 2; m.position.y = pk.y + .7 + Math.sin(pk.t * 3) * .15; m.visible = pk.t < 20 || Math.sin(pk.t * 20) > 0;
    const take = pl.health.hp < 100 && Math.hypot(m.position.x - pp.x, m.position.z - pp.z) < 1.3 && Math.abs(pk.y - pp.y) < 2;
    if (take) { pl.health.hp = Math.min(100, pl.health.hp + 25); sfx.pickup(); burst(m.position, 0x33ff66, 20, 4); }
    if (take || pk.t > 25) { scene.remove(m); world.remove(e); }
  }
}
