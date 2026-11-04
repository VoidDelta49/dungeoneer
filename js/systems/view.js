// Per-frame presentation: camera follow/feel, weapon recoil recovery, HUD + damage flash
import { cam, gun, muzzle } from '../render.js';
import { input } from '../input.js';

const hud = document.getElementById('hud'), flash = document.getElementById('flash');
let lastHp = Infinity;

export function view(world, dt) {
  const e = world.one('player'), pl = e.player, v = e.vel, a = world.alpha;
  // interpolate between physics ticks, lower eye when sliding, landing dip, strafe lean, FOV widens with speed
  pl.eye += ((pl.crouch ? 0.9 : 1.6) - pl.eye) * Math.min(1, dt * 15);
  pl.dip *= Math.max(0, 1 - dt * 10);
  cam.position.lerpVectors(e.prev, e.pos, a); cam.position.y += pl.eye - pl.dip;
  cam.rotation.y = input.look.yaw; cam.rotation.x = input.look.pitch;
  const side = v.x * Math.cos(cam.rotation.y) - v.z * Math.sin(cam.rotation.y);
  cam.rotation.z += (-side * 0.003 - cam.rotation.z) * Math.min(1, dt * 10);
  const speed = Math.hypot(v.x, v.z), fov = 75 + Math.min(speed, 25) * 0.6;
  if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
  muzzle.intensity *= 0.8; gun.position.z += (-0.35 - gun.position.z) * 0.2;

  const hp = e.health.hp;
  flash.style.opacity = hp < lastHp ? 0.35 : Math.max(0, flash.style.opacity - dt * 2); lastHp = hp;
  hud.textContent = `HP ${Math.max(0, hp | 0)}   KILLS ${world.kills}   ENEMIES ${[...world.query('enemy')].length}   SPD ${speed.toFixed(0)}`;
}
