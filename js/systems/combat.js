// Hitscan shooting from the camera
import * as THREE from 'three';
import { cam, gun, muzzle, wallMesh, crateMesh } from '../render.js';
import { input } from '../input.js';

const COOLDOWN = 0.25, ray = new THREE.Raycaster();
let cooldown = 0;

export function combat(world, dt) {
  cooldown -= dt;
  if (!input.fire) return;
  input.fire = false;
  if (cooldown > 0) return;
  cooldown = COOLDOWN; muzzle.intensity = 20; gun.position.z = -0.28;
  ray.setFromCamera({ x: 0, y: 0 }, cam);
  const targets = [wallMesh, crateMesh];
  for (const e of world.query('enemy')) targets.push(e.mesh);
  const e = ray.intersectObjects(targets, false)[0]?.object.userData.ent;
  if (!e?.health) return;
  e.health.hp--; e.enemy.hit = 0.1;
  e.mesh.position.addScaledVector(ray.ray.direction, 0.4); e.mesh.position.y = Math.max(0.5, e.mesh.position.y); // knockback
}
