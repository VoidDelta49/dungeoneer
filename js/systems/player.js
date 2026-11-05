// Player entity + movement, ported from DaniDev's Karlson-style Rigidbody controller.
// Force-based accel, counter-movement on ground (snappy stops), half air control,
// slide boost on crouch, per-axis max speed (lets you air-strafe past it), bhop by holding jump.
import * as THREE from 'three';
import { input } from '../input.js';
import { T, ROOF, top, roofed } from '../level.js';
import { WEAPON } from '../gun.js';
import { burst } from '../fx.js';
import { sfx } from '../audio.js';

const BASE_MOVE = 90, BASE_MAX = 20, COUNTER = 0.175, THRESH = 0.01, SLIDE_BOOST = 8, SLIDE_COUNTER = 0.2;
const GRAV = 30, JUMP_V = 11, JUMP_CD = 0.25, R = 0.4;
export const DT = 0.02; // fixed 50Hz physics tick

export const createPlayer = world => world.add({ player: {}, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), health: {}, weapon: {}, stats: {}, picks: {} });
export function resetPlayer(e, lv, loadout) { // fresh run; lv = meta shop levels; loadout = 'gun' | 'sword' for the whole run
  e.loadout = loadout;
  Object.assign(e.player, { grounded: false, gTimer: 0, readyJump: true, jumpCd: 0, crouch: false, eye: 1.6, dip: 0, air: 0, jumpWas: false, block: -1, iframes: 0, swUsed: false });
  e.health.max = e.health.hp = 100 + 15 * lv('hp');
  Object.assign(e.stats, { dmg: 1 + .1 * lv('dmg'), rate: 1, mag: WEAPON.MAG + 3 * lv('mag'), reload: 1, speed: 1, airJumps: 0, leech: 0, pierce: 0, pellets: 1, slideLoad: 0, momentum: 0, explode: 0, secondWind: 0,
    sdmg: 1 + .1 * lv('dmg'), sspeed: 1, reach: 3, throwDmg: 1, parry: .2, parryHeal: 0, block: .75, recall: 0, finisher: 0 });
  const sw = loadout === 'sword';
  e.sword = { has: sw, equipped: sw, thrown: false, raise: +sw, swing: -1, t: 0, next: 0, window: 0, queued: false, hit: false, status: '' };
  Object.assign(e.weapon, { mag: e.stats.mag, cd: 0, reload: -1, bloom: 0, last: -1, fill: 0 });
  for (const k in e.picks) delete e.picks[k];
  e.vel.set(0, 0, 0);
}

// All damage to the player goes through here: frontal block (and an early-raise parry) + Second Wind.
// sx, sz = where the attack comes from. Returns 'parry' | 'block' | 'hit' | 'none'.
export function hurt(world, dmg, sx, sz) {
  const e = world.one('player'), pl = e.player, s = e.stats, hp = e.health;
  if (pl.iframes > 0) return 'none';
  let res = 'hit';
  if (pl.block >= 0) {
    const dx = sx - e.pos.x, dz = sz - e.pos.z, d = Math.hypot(dx, dz) || 1, yaw = input.look.yaw;
    if (d < .6 || (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d > .3) { // (on top of you counts as in front) // within ~72deg of where you're facing
      if (pl.block < s.parry) { hp.hp = Math.min(hp.max, hp.hp + s.parryHeal); sfx.parry(); burst(e.pos.clone().setY(e.pos.y + 1.4).addScaledVector(new THREE.Vector3(dx / d, 0, dz / d), .8), 0xffffff, 24, 8, .3, 0); return 'parry'; }
      dmg *= 1 - s.block; sfx.clang(); res = 'block';
    }
  }
  if (hp.hp - dmg <= 0 && s.secondWind && !pl.swUsed) { pl.swUsed = true; pl.iframes = 1; hp.hp = 1; sfx.parry(); return res; }
  hp.hp -= dmg; return res;
}

const footTiles = (x, z, f) => { // run f(i,j) over tiles under the player's footprint
  for (let i = Math.floor((z - R) / T); i <= Math.floor((z + R) / T); i++)
    for (let j = Math.floor((x - R) / T); j <= Math.floor((x + R) / T); j++) f(i, j);
};
const blockedAt = (x, y, z) => { let b = false; footTiles(x, z, (i, j) => { if (top(i, j) > y + 0.3) b = true; /* step up small ledges */ }); return b; };

export function playerPhysics(world, dt) {
  for (const e of world.query('player')) {
    const pl = e.player, v = e.vel, p = e.pos, keys = input.keys, yaw = input.look.yaw, MOVE = BASE_MOVE * e.stats.speed * (pl.block >= 0 ? .6 : 1), MAXSPEED = BASE_MAX * e.stats.speed;
    e.prev.copy(p); pl.iframes -= dt;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let x = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + input.stick.x;
    let y = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - input.stick.y;
    const im = Math.hypot(x, y); if (im > 1) { x /= im; y /= im; } // no faster diagonals
    const jumping = keys.Space || input.jump;
    const crouch = !!(keys.ControlLeft || keys.KeyC || keys.ShiftLeft || input.slide);
    if (crouch && !pl.crouch && pl.grounded && Math.hypot(v.x, v.z) > 0.5) { v.x += fx * SLIDE_BOOST; v.z += fz * SLIDE_BOOST; } // slide boost
    pl.crouch = crouch;
    pl.gTimer -= dt; pl.grounded = pl.gTimer > 0;
    if (!pl.readyJump && (pl.jumpCd -= dt) <= 0) pl.readyJump = true;
    v.y -= GRAV * dt;

    let xMag = v.x * rx + v.z * rz, yMag = v.x * fx + v.z * fz; // velocity relative to look
    // counter movement (ground only, not while jumping)
    if (pl.grounded && !jumping) {
      if (pl.crouch) {
        const sp = Math.hypot(v.x, v.z), d = Math.min(sp, MOVE * SLIDE_COUNTER * dt);
        if (sp > 0) { v.x -= v.x / sp * d; v.z -= v.z / sp * d; }
      } else {
        if (Math.abs(xMag) > THRESH && Math.abs(x) < 0.05 || (xMag < -THRESH && x > 0) || (xMag > THRESH && x < 0)) { const k = MOVE * dt * -xMag * COUNTER; v.x += rx * k; v.z += rz * k; }
        if (Math.abs(yMag) > THRESH && Math.abs(y) < 0.05 || (yMag < -THRESH && y > 0) || (yMag > THRESH && y < 0)) { const k = MOVE * dt * -yMag * COUNTER; v.x += fx * k; v.z += fz * k; }
        const sp = Math.hypot(v.x, v.z);
        if (sp > MAXSPEED) { v.x *= MAXSPEED / sp; v.z *= MAXSPEED / sp; }
      }
    }
    // mid-air jumps (Grav Boots) need a fresh press; ground jumps can be held to bhop
    if (pl.grounded) pl.air = e.stats.airJumps;
    else if (jumping && !pl.jumpWas && pl.air > 0) { pl.air--; v.y = Math.max(v.y, 0) + JUMP_V * .9; sfx.whoosh(); burst(p, 0x66ccff, 14, 4, .3, 0); }
    pl.jumpWas = jumping;
    // jump
    if (pl.readyJump && jumping && pl.grounded) {
      pl.readyJump = false; pl.jumpCd = JUMP_CD; pl.grounded = false; pl.gTimer = 0;
      v.y = (v.y < 0.5 ? 0 : v.y / 2) + JUMP_V;
    }
    // input force
    if (!(pl.crouch && pl.grounded && pl.readyJump)) {
      xMag = v.x * rx + v.z * rz; yMag = v.x * fx + v.z * fz;
      if (x > 0 && xMag > MAXSPEED) x = 0; if (x < 0 && xMag < -MAXSPEED) x = 0;
      if (y > 0 && yMag > MAXSPEED) y = 0; if (y < 0 && yMag < -MAXSPEED) y = 0;
      const mult = pl.grounded ? 1 : 0.5, multV = pl.grounded && pl.crouch ? 0 : 1;
      v.x += (fx * y * mult * multV + rx * x * mult) * MOVE * dt;
      v.z += (fz * y * mult * multV + rz * x * mult) * MOVE * dt;
    }
    // integrate with tile-height collision
    const h = pl.crouch ? 1.0 : 1.8;
    p.x += v.x * dt; if (blockedAt(p.x, p.y, p.z)) { p.x -= v.x * dt; v.x = 0; }
    p.z += v.z * dt; if (blockedAt(p.x, p.y, p.z)) { p.z -= v.z * dt; v.z = 0; }
    p.y += v.y * dt;
    let gh = 0, ceil = 99; footTiles(p.x, p.z, (i, j) => { gh = Math.max(gh, top(i, j) <= p.y + 0.3 ? top(i, j) : 0); if (roofed(i, j)) ceil = ROOF; });
    if (p.y <= gh) { p.y = gh; if (v.y < -6) pl.dip = Math.min(0.35, -v.y * 0.02); if (v.y < 0) v.y = 0; pl.grounded = true; pl.gTimer = 0.1; } // 0.1s coyote time
    if (p.y + h > ceil) { p.y = ceil - h; if (v.y > 0) v.y = 0; }
  }
}
