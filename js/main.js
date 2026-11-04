// Entry point: builds the world and runs the systems.
// To add behaviour: write a system (world, dt) and add it to one of the lists below.
import * as THREE from 'three';
import { World } from './ecs.js';
import { renderer, scene, cam } from './render.js';
import { input, playing, lock } from './input.js';
import { createPlayer, playerPhysics, DT } from './systems/player.js';
import { spawner, enemyAI, separation, enemyDeath } from './systems/enemies.js';
import { combat } from './systems/combat.js';
import { view } from './systems/view.js';

const msg = document.getElementById('msg');
const world = new World();
Object.assign(world, { time: 0, kills: 0, alive: true, alpha: 0 });
const player = createPlayer(world);

function death() {
  if (player.health.hp > 0) return;
  world.alive = false; input.touchPlaying = false; document.exitPointerLock();
  msg.style.display = 'flex'; msg.innerHTML = `<h1>YOU DIED</h1><p>Kills: ${world.kills}</p><p>Click to restart</p>`;
}

const fixed = [playerPhysics];                                     // 50Hz, while playing
const update = [spawner, enemyAI, separation, combat, enemyDeath, death]; // every frame, while playing
const present = [view];                                            // every frame, always

msg.onclick = () => world.alive ? lock() : location.reload();

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
  renderer.render(scene, cam);
});
