// Enemy entities: spawning, chasing the player, separation, death
import * as THREE from 'three';
import { scene } from '../render.js';
import { T, spawns, top } from '../level.js';

const MAX = 50;
const geo = new THREE.IcosahedronGeometry(0.5, 0);
const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6), eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const blocked = (x, z) => top(Math.floor(z / T), Math.floor(x / T)) > 0.5;
const move = (pos, dx, dz) => { if (!blocked(pos.x + dx + Math.sign(dx) * .5, pos.z)) pos.x += dx; if (!blocked(pos.x, pos.z + dz + Math.sign(dz) * .5)) pos.z += dz; };
const v3 = new THREE.Vector3();

function createEnemy(world, p) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x33aa33, flatShading: true }));
  mesh.castShadow = true;
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.18, 0.1, -0.42); mesh.add(e); }
  mesh.position.set(p.x + Math.random() - .5, 0.7, p.z + Math.random() - .5);
  scene.add(mesh);
  mesh.userData.ent = world.add({ enemy: { speed: 4 + Math.random() * 3, hit: 0 }, health: { hp: 3 }, mesh });
}

let timer = 0;
export function spawner(world, dt) {
  if ((timer -= dt) > 0) return;
  timer = Math.max(0.25, 1.5 - world.time * 0.02);
  if ([...world.query('enemy')].length >= MAX) return;
  const p = spawns[Math.random() * spawns.length | 0], pp = world.one('player').pos;
  if (Math.hypot(p.x - pp.x, p.z - pp.z) >= 12) createEnemy(world, p); // don't spawn in your face
}

export function enemyAI(world, dt) {
  const pl = world.one('player');
  for (const e of world.query('enemy')) {
    const m = e.mesh;
    v3.subVectors(pl.pos, m.position); v3.y = 0;
    const d = v3.length();
    if (d < 1.1 && pl.pos.y < 1.6) pl.health.hp -= 25 * dt; // contact damage
    else if (d > 0.01) { v3.multiplyScalar(e.enemy.speed * dt / d); move(m.position, v3.x, v3.z); }
    m.lookAt(pl.pos.x, m.position.y, pl.pos.z);
    m.position.y = 0.7 + Math.sin(world.time * 6 + m.id) * 0.1;
    e.enemy.hit -= dt; m.material.emissive.setHex(e.enemy.hit > 0 ? 0xff0000 : 0);
  }
}

export function separation(world) {
  const es = [...world.query('enemy')];
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i].mesh.position, b = es[j].mesh.position; v3.subVectors(a, b); v3.y = 0;
    const d = v3.length(); if (d < 0.9 && d > 0) { v3.multiplyScalar((0.9 - d) / d / 2); move(a, v3.x, v3.z); move(b, -v3.x, -v3.z); }
  }
}

export function enemyDeath(world) {
  for (const e of world.query('enemy')) if (e.health.hp <= 0) { scene.remove(e.mesh); world.remove(e); world.kills++; }
}
