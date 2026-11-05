// Entry point: builds the world and runs the systems.
// To add behaviour: write a system (world, dt) and add it to one of the lists below.
import * as THREE from 'three';
import { World } from './ecs.js';
import { renderer, scene, cam } from './render.js';
import { input, playing, lock, isTouch, releaseTouches } from './input.js';
import { createPlayer, resetPlayer, playerPhysics, DT } from './systems/player.js';
import { enemyAI, separation, projectiles, enemyDeath, pickups } from './systems/enemies.js';
import { combat } from './systems/combat.js';
import { melee } from './systems/melee.js';
import { roomSystem, loadFloor, run } from './systems/rooms.js';
import { view } from './systems/view.js';
import { phoneSystem, resetPhone } from './phone.js';
import { fx } from './fx.js';
import { vmScene, vmCam } from './gun.js';
import { meta, save, lv, buy, shopHTML } from './meta.js';

const msg = document.getElementById('msg');
const world = new World();
Object.assign(world, { time: 0, kills: 0, alive: true, alpha: 0, started: false, deadAt: 0 });
const player = createPlayer(world);

function newRun() {
  Object.assign(world, { time: 0, kills: 0, alive: true });
  Object.assign(run, { cores: 0, cleared: 0 });
  resetPlayer(player, lv); resetPhone(); loadFloor(world, 1);
}
const CONTROLS = isTouch
  ? 'Left side: stick (anywhere) · Right side: drag to aim — also while holding any button<br>AUTO fires / slashes when on target · SWORD swaps · RELOAD becomes BLOCK with the sword · THROW, then walk over it to pick it up'
  : 'WASD move · Mouse look · Hold click to shoot · R reload<br>SPACE jump (hold to bhop) · CTRL / C / SHIFT slide · 1 / 2 / 3 pick upgrade<br>Q / wheel swap sword · Click combo · Right-click block (parry: block just before a hit) · E throw — go pick it up within 20s!';
let menuKind = 'start', earned = 0;
function menu(kind) {
  menuKind = kind;
  const head = { start: '<h1>DUNGEONEER</h1><p>Seal the rifts. Ride the lift deeper. Don\'t die.</p>', pause: '<h1>PAUSED</h1>',
    dead: `<h1>YOU DIED</h1><p>Floor ${run.floor} · ${run.cleared} rooms · ${world.kills} kills · ${world.time | 0}s · +${earned} ◆</p>` }[kind];
  msg.innerHTML = `${head}${kind === 'pause' ? '' : shopHTML()}<p class="go">${isTouch ? 'Tap' : 'Click'} to ${kind === 'pause' ? 'resume' : kind === 'dead' ? 'start a new run' : 'start'}</p><p style="opacity:.7;font-size:14px">${CONTROLS}</p>`;
}
newRun(); menu('start');

function death() {
  if (player.health.hp > 0) return;
  world.alive = false; world.deadAt = performance.now(); input.touchPlaying = false; releaseTouches(); document.exitPointerLock();
  earned = run.cores + (run.floor - 1) * 3 + (world.kills / 15 | 0);
  meta.cores += earned; meta.best = Math.max(meta.best, run.floor); save();
  msg.style.display = 'flex'; menu('dead');
}
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && world.alive && world.started) menu('pause'); });
msg.onclick = e => {
  const b = e.target.closest('[data-buy]');
  if (b) return buy(b.dataset.buy), menu(menuKind);
  if (!world.alive) { if (performance.now() - world.deadAt < 1000) return; newRun(); }
  world.started = true; releaseTouches(); lock();
};

const fixed = [playerPhysics];                                     // 50Hz, while playing
const update = [roomSystem, enemyAI, separation, melee, combat, projectiles, enemyDeath, pickups, phoneSystem, fx, death]; // every frame, while playing
const present = [view];                                            // every frame, always

const clock = new THREE.Clock();
let acc = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (world.alive && playing()) {
    world.time += dt; acc += dt;
    while (acc >= DT) { for (const s of fixed) s(world, DT); acc -= DT; }
    for (const s of update) s(world, dt);
  }
  world.alpha = acc / DT;
  for (const s of present) s(world, dt);
  renderer.clear(); renderer.render(scene, cam);
  renderer.clearDepth(); renderer.render(vmScene, vmCam); // gun + phone on top
});
