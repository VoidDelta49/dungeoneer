// Enemies: humanoid bodies, flow-field chasing (hopping up low steps), telegraphed attacks
// (chase → wind-up with a visible tell → act → recover), spit projectiles, separation, death + drops.
// Spawning is driven by rooms.js. All damage to the player goes through hurt() so blocks/parries apply.
import * as THREE from 'three';
import { scene } from '../render.js';
import { CLIMB, ROOF, topAt, roofed, raycast, T } from '../level.js';
import { updateFlow, flowDir } from '../nav.js';
import { burst, glowTex } from '../fx.js';
import { sfx } from '../audio.js';
import { feel } from '../gun.js';
import { hurt } from './player.js';

// rig: leg/torso/arm lengths, shoulder width w, depth d, limb thickness, arm reach (rad forward), hunch (rad)
// atk: swipe (melee arc) | charge (line dash) | leap (arc to a marked spot + shockwave) | laser (tracking sniper beam)
const swipe = (range, windup, dmg, cd) => ({ type: 'swipe', range, windup, dmg, cd });
export const TYPES = {
  grunt:   { color: 0x33aa33, cloth: 0x1d4a22, r: .5,  hp: 4,  speed: [4, 6],     head: new THREE.IcosahedronGeometry(.42, 0), atk: swipe(2, .5, 18, 1.1),
             rig: { leg: .75, torso: .72, w: .78, d: .42, arm: .72, limb: .2, reach: 1.2, hunch: .1 } },
  runner:  { color: 0xff4422, cloth: 0x6a1a0e, r: .38, hp: 2,  speed: [8.5, 10],  head: new THREE.OctahedronGeometry(.34, 0), atk: swipe(1.7, .3, 12, .8),
             rig: { leg: .9, torso: .6, w: .55, d: .3, arm: .7, limb: .14, reach: -.7, hunch: .4 } },
  spitter: { color: 0xffbb22, cloth: 0x6a4a10, r: .55, hp: 4,  speed: [3.5, 4.5], head: new THREE.IcosahedronGeometry(.5, 1), atk: swipe(1.8, .55, 10, 1.4), ranged: 1, keep: 18,
             rig: { leg: .55, torso: .8, w: .95, d: .6, arm: .62, limb: .22, reach: .2, hunch: .25 } },
  leaper:  { color: 0x22ddcc, cloth: 0x0d4a44, r: .4,  hp: 5,  speed: [5.5, 6.5], head: new THREE.TetrahedronGeometry(.42, 0), atk: { type: 'leap', range: 13, windup: .75, dmg: 22, cd: 2.2 },
             rig: { leg: 1, torso: .55, w: .6, d: .32, arm: .8, limb: .14, reach: .9, hunch: .3 } },
  brute:   { color: 0x8a5ae6, cloth: 0x2a1a4a, r: .75, hp: 16, speed: [2.8, 3.3], head: new THREE.BoxGeometry(.6, .6, .6), atk: { type: 'charge', range: 16, windup: .9, dmg: 30, cd: 2.5 },
             rig: { leg: .85, torso: 1, w: 1.25, d: .7, arm: .95, limb: .32, reach: .4, hunch: .3 } },
  lancer:  { color: 0xff3399, cloth: 0x4a0f2e, r: .45, hp: 6,  speed: [3.2, 3.8], head: new THREE.CylinderGeometry(.3, .3, .55, 6), atk: { type: 'laser', range: 34, windup: 1.25, dmg: 25, cd: 2.8 }, keep: 20,
             rig: { leg: .85, torso: .75, w: .6, d: .38, arm: .75, limb: .16, reach: .6, hunch: 0 } },
  warden:  { color: 0xcc2255, cloth: 0x2a0a18, r: 1,   hp: 70, speed: [3, 3.4],   head: new THREE.DodecahedronGeometry(.75, 0), atk: swipe(3.4, .8, 35, 1.6), ranged: 5, boss: true,
             rig: { leg: 1.4, torso: 1.5, w: 1.9, d: 1, arm: 1.5, limb: .45, reach: .3, hunch: .12 } },
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);
for (const ty of Object.values(TYPES)) { // shared geometry + hit cylinder [radius, height]
  const R = ty.rig; ty.head.computeBoundingSphere(); const hr = ty.hr = ty.head.boundingSphere.radius;
  ty.geo = { leg: box(R.limb * 1.15, R.leg, R.limb * 1.25), arm: box(R.limb, R.arm, R.limb), chest: new THREE.BoxGeometry(R.w, R.torso, R.d).translate(0, R.torso / 2, 0) };
  ty.headY = R.leg + R.torso + .05 + hr;
  ty.hit = [Math.max(R.w / 2 + R.limb * .5, hr) * 1.05, ty.headY + hr];
}
const JUMP = 9.5, GRAV = 30;
const eyeGeo = new THREE.SphereGeometry(.08, 6, 6), eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const teleMat = new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const TELE = { charge: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, .5), leap: new THREE.RingGeometry(2.7, 3.2, 32).rotateX(-Math.PI / 2),
  laser: new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5) };
const v3 = new THREE.Vector3(), o3 = new THREE.Vector3(), d3 = new THREE.Vector3(), c3 = new THREE.Vector3();

// Axis-separated move; returns height of whatever blocked it (0 if free)
function move(en, pos, dx, dz) {
  const r = en.ty.r, hx = topAt(pos.x + dx + Math.sign(dx) * r, pos.z), hz = topAt(pos.x, pos.z + dz + Math.sign(dz) * r);
  if (hx <= en.y + .3) pos.x += dx;
  if (hz <= en.y + .3) pos.z += dz;
  return Math.max(hx > en.y + .3 ? hx : 0, hz > en.y + .3 ? hz : 0);
}
export const knock = (e, dx, dz) => e.enemy.state === 'act' ? 0 : move(e.enemy, e.mesh.position, dx, dz);
export const stagger = (en, t) => { if (en.state !== 'act' || en.ty.atk.type !== 'charge') { en.state = 'rec'; en.st = 0; en.recT = t; } };
const clearLine = (ax, az, bx, bz, y) => { // straight walkable line on one level
  const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.hypot(dx, dz) / .8);
  for (let k = 1; k <= n; k++) if (topAt(ax + dx * k / n, az + dz * k / n) > y + .3) return false;
  return true;
};

function buildRig(ty) {
  const R = ty.rig, G = ty.geo, skin = new THREE.MeshStandardMaterial({ color: ty.color, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: ty.cloth, flatShading: true, roughness: .9 });
  const mesh = new THREE.Group(), hips = new THREE.Group(), torso = new THREE.Group();
  const part = (p, geo, mat, x = 0, y = 0) => { const g = new THREE.Group(), m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); g.position.set(x, y, 0); p.add(g); return g; };
  hips.position.y = R.leg; mesh.add(hips); hips.add(torso);
  const legs = [-1, 1].map(s => part(hips, G.leg, cloth, s * R.w * .24));
  part(torso, G.chest, cloth);
  const arms = [-1, 1].map(s => part(torso, G.arm, skin, s * (R.w / 2 + R.limb * .55), R.torso * .9));
  const head = part(torso, ty.head, skin, 0, ty.headY - R.leg);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.scale.setScalar(ty.hr / .5); e.position.set(s * .36 * ty.hr, .2 * ty.hr, .84 * ty.hr); head.add(e); }
  return { mesh, rig: { hips, torso, legs, arms, mats: [skin, cloth] } };
}

export function createEnemy(world, p, kind, room, floor) {
  const ty = TYPES[kind], { mesh, rig } = buildRig(ty), k = 1 + (floor - 1) * .3;
  mesh.position.set(p.x + Math.random() * 2 - 1, 0, p.z + Math.random() * 2 - 1); mesh.scale.setScalar(.01); scene.add(mesh);
  const tele = TELE[ty.atk.type] && new THREE.Mesh(TELE[ty.atk.type], teleMat);
  if (tele) { tele.visible = false; tele.frustumCulled = false; scene.add(tele); }
  const e = world.add({ enemy: { ty, room, speed: (ty.speed[0] + Math.random() * (ty.speed[1] - ty.speed[0])) * (1 + (floor - 1) * .05), dmg: 1 + (floor - 1) * .12,
    hit: 0, squash: 0, y: 0, vy: 0, grounded: true, scd: 1.5, acd: 1, los: false, losT: 0, age: 0, grow: 0, walk: 0, moving: 0, state: 'chase', st: 0, recT: 0 },
    health: { hp: ty.hp * k, max: ty.hp * k }, mesh, rig, tele });
  burst(o3.set(mesh.position.x, 1, mesh.position.z), 0xaa33ff, 16, 4, .5, -4);
  return e;
}

const projGeo = new THREE.SphereGeometry(.2, 10, 8), projMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
const projGlow = new THREE.SpriteMaterial({ map: glowTex, color: 0xffaa22, blending: THREE.AdditiveBlending, depthWrite: false });
function spit(world, from, dir) {
  const m = new THREE.Mesh(projGeo, projMat), g = new THREE.Sprite(projGlow); g.scale.setScalar(1.2); m.add(g);
  m.position.copy(from); scene.add(m);
  world.add({ proj: { v: dir.clone().multiplyScalar(17), life: 4 }, mesh: m });
}

// Telegraphed attack state machine (wind → act → rec). Telegraph mesh shows during wind-up.
function attack(world, e, dt, pl) {
  const en = e.enemy, ty = en.ty, A = ty.atk, pos = e.mesh.position, pp = pl.pos, tele = e.tele, dmg = A.dmg * en.dmg;
  en.st += dt;
  if (A.type === 'laser') { o3.set(pos.x, en.y + ty.headY, pos.z); d3.set(en.tx, en.ty0 + 1.2, en.tz).sub(o3).normalize(); }
  if (en.state === 'wind') {
    if (A.type === 'laser' && en.st < A.windup * .65) { en.tx = pp.x; en.tz = pp.z; en.ty0 = pp.y; } // tracks, then locks
    const w = en.st / A.windup;
    if (A.type === 'charge') { tele.position.set(pos.x, en.y + .05, pos.z); tele.rotation.y = Math.atan2(en.tx - pos.x, en.tz - pos.z); tele.scale.set(ty.r * 2.4, 1, 16 * Math.min(1, w * 2)); }
    if (A.type === 'leap') { tele.position.set(en.tx, topAt(en.tx, en.tz) + .06, en.tz); tele.scale.setScalar(1.6 - w * .6); }
    if (A.type === 'laser') {
      const L = raycast(o3, d3, 80)?.t ?? 80, th = w < .65 ? .03 : .07;
      tele.position.copy(o3); tele.lookAt(c3.copy(o3).add(d3)); tele.scale.set(th, th, L);
    }
    if (tele) { tele.visible = true; teleMat.opacity = .35 + Math.sin(en.st * 30) * .15; }
    if (en.st < A.windup) return;
    en.state = 'act'; en.st = 0; en.hitP = false; en.sx = pos.x; en.sz = pos.z; en.sy = en.y;
    if (tele) tele.visible = false;
    if (A.type === 'swipe') { // instant arc in front
      en.squash = 1; sfx.whoosh();
      if (Math.hypot(pp.x - pos.x, pp.z - pos.z) < A.range + .3 && Math.abs(pp.y - en.y) < 1.6 && hurt(world, dmg, pos.x, pos.z) === 'parry') return stagger(en, 1.2);
      return stagger(en, .45);
    }
    if (A.type === 'laser') {
      sfx.laser(); tele.visible = true; tele.scale.x = tele.scale.y = .25; en.flash = .12;
      c3.set(pp.x, pp.y + 1.1, pp.z).sub(o3); const along = c3.dot(d3);
      if (along > 0 && along < tele.scale.z && c3.addScaledVector(d3, -along).length() < .8 && hurt(world, dmg, pos.x, pos.z) === 'parry') { e.health.hp -= 6; en.hit = .1; return stagger(en, 2); }
      return stagger(en, 1.3);
    }
    if (A.type === 'charge') { sfx.seal(); en.dx = en.tx - pos.x; en.dz = en.tz - pos.z; const L = Math.hypot(en.dx, en.dz) || 1; en.dx /= L; en.dz /= L; }
    if (A.type === 'leap') sfx.whoosh();
    return;
  }
  if (en.state === 'act') {
    if (A.type === 'charge') {
      const b = move(en, pos, en.dx * 22 * dt, en.dz * 22 * dt);
      if (!en.hitP && Math.hypot(pp.x - pos.x, pp.z - pos.z) < ty.r + .8 && Math.abs(pp.y - en.y) < 2) {
        en.hitP = true;
        if (hurt(world, dmg, pos.x, pos.z) === 'parry') { en.state = 'rec'; en.st = 0; en.recT = 2; en.stun = true; return; }
        pl.vel.x += en.dx * 16; pl.vel.z += en.dz * 16; pl.vel.y = 7; feel.shake = .15;
      }
      if (b > en.y + CLIMB) { sfx.slam(); feel.shake = .08; burst(o3.set(pos.x, en.y + 1, pos.z), 0xccccff, 30, 8); en.state = 'rec'; en.st = 0; en.recT = 1.8; en.stun = true; } // wall: stunned
      else if (en.st > 1) { en.state = 'rec'; en.st = 0; en.recT = .6; }
    }
    if (A.type === 'leap') {
      const p = Math.min(1, en.st / .7), gy = topAt(en.tx, en.tz);
      pos.x = en.sx + (en.tx - en.sx) * p; pos.z = en.sz + (en.tz - en.sz) * p; en.y = en.sy + (gy - en.sy) * p + Math.sin(Math.PI * p) * 4.5; en.vy = 0;
      if (p >= 1) {
        en.y = gy; sfx.slam(); feel.shake = .1; burst(o3.set(pos.x, gy + .2, pos.z), 0x22ddcc, 50, 10, .4, 2);
        if (Math.hypot(pp.x - pos.x, pp.z - pos.z) < 3.2 && pp.y - gy < .8 && hurt(world, dmg, pos.x, pos.z) === 'parry') return stagger(en, 1.5);
        en.state = 'rec'; en.st = 0; en.recT = .9;
      }
    }
    if (A.type === 'laser' && (en.flash -= dt) <= 0) tele.visible = false;
    return;
  }
  if (en.state === 'rec') {
    if (A.type === 'laser' && (en.flash -= dt) <= 0) tele.visible = false;
    if (en.st >= en.recT) { en.state = 'chase'; en.acd = A.cd * (.8 + Math.random() * .4); en.stun = false; }
  }
}

export function enemyAI(world, dt) {
  const pl = world.one('player'), pp = pl.pos;
  updateFlow(pp.x, pp.z);
  for (const e of world.query('enemy')) {
    const en = e.enemy, ty = en.ty, A = ty.atk, m = e.mesh, pos = m.position, R = ty.rig, rg = e.rig;
    en.age += dt; en.acd -= dt;
    v3.set(pp.x - pos.x, 0, pp.z - pos.z);
    const d = v3.length(), dy = pp.y - en.y;
    if ((en.losT -= dt) <= 0) {
      en.losT = .25; o3.set(pos.x, en.y + ty.headY, pos.z); d3.set(pp.x, pp.y + 1.3, pp.z).sub(o3);
      const L = d3.length(); en.los = !raycast(o3, d3.divideScalar(L), L);
    }
    let go = d > ty.r + .6 && en.state === 'chase' && !(ty.keep && en.los && d < ty.keep);
    if (ty.ranged && en.state === 'chase' && en.los && d < 32 && (en.scd -= dt) <= 0) {
      en.scd = ty.boss ? 2.2 : 1.7 + Math.random() * .8; en.squash = 1; sfx.spit();
      o3.set(pos.x, en.y + ty.headY, pos.z).addScaledVector(v3, (ty.r + .3) / d);
      d3.set(pp.x, pp.y + 1.2, pp.z).sub(o3).normalize();
      for (let k = 0; k < ty.ranged; k++) spit(world, o3, c3.copy(d3).applyAxisAngle(THREE.Object3D.DEFAULT_UP, (k - (ty.ranged - 1) / 2) * .16));
    }
    if (en.state === 'chase' && en.acd <= 0 && en.age > .6 && d < A.range && (A.type === 'swipe' ? Math.abs(dy) < 1.5 : en.los && Math.abs(dy) < 3)) {
      en.state = 'wind'; en.st = 0; en.tx = pp.x; en.tz = pp.z; en.ty0 = pp.y; sfx.warn();
    }
    if (en.state !== 'chase') attack(world, e, dt, pl);
    const px = pos.x, pz = pos.z, leaping = en.state === 'act' && A.type === 'leap';
    if (go && en.age > .4) {
      if (!(d < 45 && clearLine(pos.x, pos.z, pp.x, pp.z, en.y))) flowDir(pos.x, pos.z, v3);
      const s = en.speed * dt / (Math.hypot(v3.x, v3.z) || 1), b = move(en, pos, v3.x * s, v3.z * s);
      if (b && en.grounded && b - en.y <= CLIMB) { en.vy = JUMP; en.grounded = false; }
    }
    if (!leaping) {
      en.vy -= GRAV * dt; en.y += en.vy * dt;
      const g = topAt(pos.x, pos.z);
      if (en.y <= g) { en.y = g; en.vy = 0; en.grounded = true; } else en.grounded = en.y - g < .05;
    }
    // pose: walk cycle, arms raise during wind-up and slam on swipe, crouch before leaps/charges, flinch on hit
    en.grow = Math.min(1, en.age / .4); m.scale.setScalar(en.grow);
    const step = Math.hypot(pos.x - px, pos.z - pz), wind = en.state === 'wind' ? Math.min(1, en.st / A.windup) : 0;
    en.moving += ((step > 1e-4 && !leaping ? 1 : 0) - en.moving) * Math.min(1, dt * 10); en.walk += step * 2.4 / R.leg;
    const sw = Math.sin(en.walk) * .7 * en.moving, sq = en.squash; en.squash = Math.max(0, sq - dt * 5);
    const crouch = A.type === 'leap' || A.type === 'charge' ? wind * .25 : 0, raise = A.type === 'swipe' || A.type === 'leap' ? wind * 1.6 : 0;
    rg.legs[0].rotation.x = leaping ? -1 : sw; rg.legs[1].rotation.x = leaping ? .6 : -sw;
    rg.arms[0].rotation.x = -R.reach - sw * .5 - raise + sq * 1.2; rg.arms[1].rotation.x = -R.reach + sw * .5 - raise + sq * 1.2;
    rg.hips.position.y = R.leg * (1 - crouch) + Math.abs(Math.cos(en.walk)) * .06 * en.moving;
    rg.torso.rotation.x = R.hunch + crouch * 1.2 - (en.hit > 0 ? .3 : 0) + sq * .3 + (en.stun ? .5 : 0);
    pos.y = en.y; if (en.state !== 'act' && !en.stun) m.lookAt(pp.x, en.y, pp.z);
    en.hit -= dt;
    const glow = en.hit > 0 ? 0xff2200 : en.stun ? 0x2244aa : wind && Math.sin(en.st * 30) > 0 ? 0xaa1100 : ty.ranged && en.los && en.scd < .3 ? 0x884400 : 0;
    for (const mt of rg.mats) mt.emissive.setHex(glow);
  }
}

export function projectiles(world, dt) {
  const pl = world.one('player'), pp = pl.pos;
  for (const e of world.query('proj')) {
    const p = e.mesh.position, pr = e.proj; p.addScaledVector(pr.v, dt);
    if (pr.friendly) { // reflected by a parry/swing: hurts enemies
      for (const o of world.query('enemy')) { const q = o.mesh.position, [r, h] = o.enemy.ty.hit;
        if (Math.hypot(p.x - q.x, p.z - q.z) < r + .2 && p.y > q.y && p.y < q.y + h) { o.health.hp -= 4 * pl.stats.sdmg; o.enemy.hit = .08; pr.life = 0; world.hitMarker = 1; break; } }
    } else if (Math.hypot(p.x - pp.x, p.z - pp.z) < .6 && p.y > pp.y && p.y < pp.y + (pl.player.crouch ? 1 : 1.8)) {
      if (hurt(world, 14, p.x - pr.v.x, p.z - pr.v.z) === 'parry') reflect(pr); else { feel.shake = .1; pr.life = 0; }
    }
    if ((pr.life -= dt) <= 0 || p.y < topAt(p.x, p.z) || (p.y > ROOF && roofed(Math.floor(p.z / T), Math.floor(p.x / T)))) {
      burst(p, 0xffbb33, 14, 5, .3); scene.remove(e.mesh); world.remove(e);
    }
  }
}
export function reflect(pr) { pr.v.multiplyScalar(-1.4); pr.friendly = true; pr.life = 3; }

export function separation(world) {
  const es = [...world.query('enemy')];
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i].mesh.position, b = es[j].mesh.position; v3.subVectors(a, b); v3.y = 0;
    const d = v3.length(), min = (es[i].enemy.ty.r + es[j].enemy.ty.r) * .9;
    if (d < min && d > 0) { v3.multiplyScalar((min - d) / d / 2); move(es[i].enemy, a, v3.x, v3.z); move(es[j].enemy, b, -v3.x, -v3.z); }
  }
}

export function removeEnt(world, e) { scene.remove(e.mesh); if (e.tele) scene.remove(e.tele); e.rig?.mats.forEach(m => m.dispose()); world.remove(e); }

const hpGeo = [new THREE.BoxGeometry(.5, .16, .16), new THREE.BoxGeometry(.16, .5, .16)];
const hpMat = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x22ff55, emissiveIntensity: 1.5 });
export function enemyDeath(world) {
  const pl = world.one('player'), s = pl.stats;
  for (const e of world.query('enemy')) if (e.health.hp <= 0) {
    const p = e.mesh.position, ty = e.enemy.ty, c = o3.set(p.x, e.enemy.y + ty.hit[1] * .55, p.z);
    burst(c, ty.color, ty.boss ? 120 : 35, ty.boss ? 14 : 9, .6, 12); sfx.kill();
    pl.health.hp = Math.min(pl.health.max, pl.health.hp + s.leech);
    if (s.explode) { // volatile payload: damage everything nearby (can chain)
      burst(c, 0xff7a1a, 40, 12, .4, 4); sfx.slam();
      for (const o of world.query('enemy')) if (o !== e && Math.hypot(o.mesh.position.x - p.x, o.mesh.position.z - p.z) < 3.5) { o.health.hp -= s.explode; o.enemy.hit = .08; }
    }
    if (Math.random() < .12) { // health drop
      const g = new THREE.Group(); hpGeo.forEach(h => g.add(new THREE.Mesh(h, hpMat))); g.position.set(p.x, 0, p.z); scene.add(g);
      world.add({ pickup: { t: 0, y: e.enemy.y }, mesh: g });
    }
    removeEnt(world, e); world.kills++;
  }
}

export function pickups(world, dt) {
  const pl = world.one('player'), pp = pl.pos, hp = pl.health;
  for (const e of world.query('pickup')) {
    const m = e.mesh, pk = e.pickup; pk.t += dt;
    m.rotation.y += dt * 2; m.position.y = pk.y + .7 + Math.sin(pk.t * 3) * .15; m.visible = pk.t < 20 || Math.sin(pk.t * 20) > 0;
    const take = hp.hp < hp.max && Math.hypot(m.position.x - pp.x, m.position.z - pp.z) < 1.3 && Math.abs(pk.y - pp.y) < 2;
    if (take) { hp.hp = Math.min(hp.max, hp.hp + 25); sfx.pickup(); burst(m.position, 0x33ff66, 20, 4); }
    if (take || pk.t > 25) { scene.remove(m); world.remove(e); }
  }
}
