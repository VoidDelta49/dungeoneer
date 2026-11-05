// Enemies: humanoid bodies with the original head shapes, flow-field chasing (hopping up low steps),
// spitter/warden projectiles, separation, death + drops. Spawning is driven by rooms.js.
import * as THREE from 'three';
import { scene } from '../render.js';
import { CLIMB, ROOF, topAt, roofed, raycast, T } from '../level.js';
import { updateFlow, flowDir } from '../nav.js';
import { burst, glowTex } from '../fx.js';
import { sfx } from '../audio.js';
import { feel } from '../gun.js';

// rig: leg/torso/arm lengths, shoulder width w, depth d, limb thickness, arm reach (rad forward), hunch (rad)
export const TYPES = {
  grunt:   { color: 0x33aa33, cloth: 0x1d4a22, r: .5,  hp: 4,  speed: [4, 6],     dmg: 25, head: new THREE.IcosahedronGeometry(.42, 0),
             rig: { leg: .75, torso: .72, w: .78, d: .42, arm: .72, limb: .2, reach: 1.2, hunch: .1 } },
  runner:  { color: 0xff4422, cloth: 0x6a1a0e, r: .38, hp: 2,  speed: [8.5, 10],  dmg: 18, head: new THREE.OctahedronGeometry(.34, 0),
             rig: { leg: .9, torso: .6, w: .55, d: .3, arm: .7, limb: .14, reach: -.7, hunch: .4 } },
  spitter: { color: 0xffbb22, cloth: 0x6a4a10, r: .55, hp: 4,  speed: [3.5, 4.5], dmg: 15, head: new THREE.IcosahedronGeometry(.5, 1), ranged: 1,
             rig: { leg: .55, torso: .8, w: .95, d: .6, arm: .62, limb: .22, reach: .2, hunch: .25 } },
  warden:  { color: 0xcc2255, cloth: 0x2a0a18, r: 1,   hp: 70, speed: [3, 3.4],   dmg: 40, head: new THREE.DodecahedronGeometry(.75, 0), ranged: 5, boss: true,
             rig: { leg: 1.4, torso: 1.5, w: 1.9, d: 1, arm: 1.5, limb: .45, reach: .3, hunch: .12 } },
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);
for (const ty of Object.values(TYPES)) { // shared geometry + hit cylinder [radius, height]
  const R = ty.rig, hr = ty.head.parameters.radius;
  ty.geo = { leg: box(R.limb * 1.15, R.leg, R.limb * 1.25), arm: box(R.limb, R.arm, R.limb), chest: new THREE.BoxGeometry(R.w, R.torso, R.d).translate(0, R.torso / 2, 0) };
  ty.headY = R.leg + R.torso + .05 + hr;
  ty.hit = [Math.max(R.w / 2 + R.limb * .5, hr) * 1.05, ty.headY + hr];
}
const JUMP = 9.5, GRAV = 30;
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
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat), hr = ty.head.parameters.radius; e.scale.setScalar(hr / .5); e.position.set(s * .36 * hr, .2 * hr, .84 * hr); head.add(e); }
  return { mesh, rig: { hips, torso, legs, arms, mats: [skin, cloth] } };
}

export function createEnemy(world, p, kind, room, floor) {
  const ty = TYPES[kind], { mesh, rig } = buildRig(ty), k = 1 + (floor - 1) * .3;
  mesh.position.set(p.x + Math.random() * 2 - 1, 0, p.z + Math.random() * 2 - 1); mesh.scale.setScalar(.01); scene.add(mesh);
  const e = world.add({ enemy: { ty, room, speed: (ty.speed[0] + Math.random() * (ty.speed[1] - ty.speed[0])) * (1 + (floor - 1) * .05), dmg: ty.dmg * (1 + (floor - 1) * .12),
    hit: 0, squash: 0, y: 0, vy: 0, grounded: true, cd: 1.5, los: false, losT: 0, age: 0, grow: 0, walk: 0, moving: 0 }, health: { hp: ty.hp * k, max: ty.hp * k }, mesh, rig });
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

export function enemyAI(world, dt) {
  const pl = world.one('player'), pp = pl.pos;
  updateFlow(pp.x, pp.z);
  for (const e of world.query('enemy')) {
    const en = e.enemy, ty = en.ty, m = e.mesh, pos = m.position, R = ty.rig, rg = e.rig;
    en.age += dt;
    v3.set(pp.x - pos.x, 0, pp.z - pos.z);
    const d = v3.length(), dy = pp.y - en.y;
    if (d < ty.r + .55 && dy > -1.3 && dy < ty.hit[1] - .5) pl.health.hp -= en.dmg * dt; // contact damage
    let go = d > ty.r + .3;
    if (ty.ranged) {
      if ((en.losT -= dt) <= 0) {
        en.losT = .25; o3.set(pos.x, en.y + ty.headY, pos.z); d3.set(pp.x, pp.y + 1.3, pp.z).sub(o3);
        const L = d3.length(); en.los = !raycast(o3, d3.divideScalar(L), L);
      }
      en.cd -= dt;
      if (en.los && d < 32) {
        if (d < 18 && !ty.boss) go = false;
        if (en.cd <= 0) {
          en.cd = ty.boss ? 2.2 : 1.7 + Math.random() * .8; en.squash = 1; sfx.spit();
          o3.set(pos.x, en.y + ty.headY, pos.z).addScaledVector(v3, (ty.r + .3) / d);
          d3.set(pp.x, pp.y + 1.2, pp.z).sub(o3).normalize();
          for (let k = 0; k < ty.ranged; k++) spit(world, o3, v3.copy(d3).applyAxisAngle(THREE.Object3D.DEFAULT_UP, (k - (ty.ranged - 1) / 2) * .16));
          v3.set(pp.x - pos.x, 0, pp.z - pos.z);
        }
      }
    }
    const px = pos.x, pz = pos.z;
    if (go && en.age > .4) {
      if (!(d < 45 && clearLine(pos.x, pos.z, pp.x, pp.z, en.y))) flowDir(pos.x, pos.z, v3);
      const s = en.speed * dt / (Math.hypot(v3.x, v3.z) || 1), b = move(en, pos, v3.x * s, v3.z * s);
      if (b && en.grounded && b - en.y <= CLIMB) { en.vy = JUMP; en.grounded = false; }
    }
    en.vy -= GRAV * dt; en.y += en.vy * dt;
    const g = topAt(pos.x, pos.z);
    if (en.y <= g) { en.y = g; en.vy = 0; en.grounded = true; } else en.grounded = en.y - g < .05;
    // pose: walk cycle from distance travelled, zombie-reach arms, flinch on hit, squash on spit
    en.grow = Math.min(1, en.age / .4); m.scale.setScalar(en.grow);
    const step = Math.hypot(pos.x - px, pos.z - pz);
    en.moving += ((step > 1e-4 ? 1 : 0) - en.moving) * Math.min(1, dt * 10); en.walk += step * 2.4 / R.leg;
    const sw = Math.sin(en.walk) * .7 * en.moving, sq = en.squash; en.squash = Math.max(0, sq - dt * 5);
    rg.legs[0].rotation.x = sw; rg.legs[1].rotation.x = -sw;
    rg.arms[0].rotation.x = -R.reach - sw * .5 - sq; rg.arms[1].rotation.x = -R.reach + sw * .5 - sq;
    rg.hips.position.y = R.leg + Math.abs(Math.cos(en.walk)) * .06 * en.moving;
    rg.torso.rotation.x = R.hunch - (en.hit > 0 ? .3 : 0) + sq * .2;
    pos.y = en.y; m.lookAt(pp.x, en.y, pp.z);
    en.hit -= dt;
    const glow = en.hit > 0 ? 0xff2200 : ty.ranged && en.los && en.cd < .3 ? 0x884400 : 0; // spitters telegraph
    for (const mt of rg.mats) mt.emissive.setHex(glow);
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

export function removeEnt(world, e) { scene.remove(e.mesh); e.rig?.mats.forEach(m => m.dispose()); world.remove(e); }

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
      for (const o of world.query('enemy')) if (o !== e && Math.hypot(o.mesh.position.x - p.x, o.mesh.position.z - p.z) < 3.5) { o.health.hp -= s.explode * s.dmg; o.enemy.hit = .08; }
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
