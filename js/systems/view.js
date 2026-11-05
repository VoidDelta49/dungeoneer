// Per-frame presentation: camera follow/feel + recoil/shake, gun animation, sun follow, HUD + damage flash
import { cam, sun, muzzle } from '../render.js';
import { input, playing } from '../input.js';
import { feel, animateGun } from '../gun.js';
import { run } from './rooms.js';
import { sfx } from '../audio.js';

const $ = id => document.getElementById(id);
const hud = $('hud'), flash = $('flash'), hpfill = $('hpfill'), ammo = $('ammo'), cross = $('cross'), hitm = $('hitm');
let lastHp = Infinity, hurtT = 0, hitT = 0;

export function view(world, dt) {
  const e = world.one('player'), pl = e.player, v = e.vel, w = e.weapon, a = world.alpha;
  // interpolate between physics ticks, lower eye when sliding, landing dip, strafe lean, FOV widens with speed
  pl.eye += ((pl.crouch ? 0.9 : 1.6) - pl.eye) * Math.min(1, dt * 15);
  pl.dip *= Math.max(0, 1 - dt * 10);
  cam.position.lerpVectors(e.prev, e.pos, a); cam.position.y += pl.eye - pl.dip;
  const rec = Math.exp(-dt * 7); feel.pitch *= rec; feel.yaw *= rec; feel.shake *= Math.exp(-dt * 10);
  cam.rotation.y = input.look.yaw + feel.yaw;
  cam.rotation.x = Math.max(-1.55, Math.min(1.55, input.look.pitch + feel.pitch));
  const side = v.x * Math.cos(cam.rotation.y) - v.z * Math.sin(cam.rotation.y);
  cam.rotation.z += (-side * 0.003 - cam.rotation.z) * Math.min(1, dt * 10);
  if (playing() && feel.shake > .001) { cam.position.x += (Math.random() - .5) * feel.shake; cam.position.y += (Math.random() - .5) * feel.shake; }
  const speed = Math.hypot(v.x, v.z), fov = 75 + Math.min(speed, 25) * 0.6;
  if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
  muzzle.intensity *= Math.pow(.8, dt * 60);
  const sx = Math.round(e.pos.x / 4) * 4, sz = Math.round(e.pos.z / 4) * 4;
  sun.position.set(sx + 50, 90, sz + 32); sun.target.position.set(sx, 0, sz);
  animateGun(dt, { speed, grounded: pl.grounded, crouch: pl.crouch, vy: v.y, dip: pl.dip, yaw: input.look.yaw, pitch: input.look.pitch,
    time: world.time, ammo: w.mag / e.stats.mag, reload: w.reload, locked: w.mag === 0 && (w.reload < 0 || w.reload < .8) });

  const hp = e.health.hp; hurtT -= dt;
  if (hp < lastHp - .01) { flash.style.opacity = .35; feel.shake = Math.max(feel.shake, .06); if (hurtT <= 0) { sfx.hurt(); hurtT = .35; } }
  else flash.style.opacity = Math.max(0, flash.style.opacity - dt * 2);
  lastHp = hp;
  hpfill.style.width = Math.max(0, hp) / e.health.max * 100 + '%';
  let boss = ''; for (const b of world.query('enemy')) if (b.enemy.ty.boss) boss = `   WARDEN ${Math.ceil(b.health.hp / b.health.max * 100)}%`;
  hud.textContent = `HP ${Math.max(0, hp | 0)}/${e.health.max}   FLOOR ${run.floor}   ◆${run.cores}   KILLS ${world.kills}${boss}`;
  ammo.innerHTML = w.reload >= 0 ? '<small>RELOADING</small>' : `${w.mag}<small> / ∞</small>`;
  ammo.classList.toggle('low', w.mag <= 4);
  cross.style.setProperty('--g', 5 + w.bloom * 400 + speed * .15 + 'px');
  if (world.hitMarker) { hitT = 1; hitm.style.stroke = world.hitMarker > 1 ? '#f33' : '#fff'; world.hitMarker = 0; }
  hitT = Math.max(0, hitT - dt * 5); hitm.style.opacity = hitT; hitm.style.transform = `scale(${1.3 - hitT * .3})`;
}
