// Player entity + movement, ported from DaniDev's Karlson-style Rigidbody controller.
// Force-based accel, counter-movement on ground (snappy stops), half air control,
// slide boost on crouch, per-axis max speed (lets you air-strafe past it), bhop by holding jump.
import * as THREE from 'three';
import { input } from '../input.js';
import { T, ROOF, start, top, roofed } from '../level.js';

const MOVE = 90, MAXSPEED = 20, COUNTER = 0.175, THRESH = 0.01, SLIDE_BOOST = 8, SLIDE_COUNTER = 0.2;
const GRAV = 30, JUMP_V = 11, JUMP_CD = 0.25, R = 0.4;
export const DT = 0.02; // fixed 50Hz physics tick

export const createPlayer = world => world.add({
  player: { grounded: false, gTimer: 0, readyJump: true, jumpCd: 0, crouch: false, eye: 1.6, dip: 0 },
  pos: start.clone(), prev: start.clone(), vel: new THREE.Vector3(), health: { hp: 100 },
});

const footTiles = (x, z, f) => { // run f(i,j) over tiles under the player's footprint
  for (let i = Math.floor((z - R) / T); i <= Math.floor((z + R) / T); i++)
    for (let j = Math.floor((x - R) / T); j <= Math.floor((x + R) / T); j++) f(i, j);
};
const blockedAt = (x, y, z) => { let b = false; footTiles(x, z, (i, j) => { if (top(i, j) > y + 0.3) b = true; /* step up small ledges */ }); return b; };

export function playerPhysics(world, dt) {
  for (const e of world.query('player')) {
    const pl = e.player, v = e.vel, p = e.pos, keys = input.keys, yaw = input.look.yaw;
    e.prev.copy(p);
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
