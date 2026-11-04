// Scene, camera, lights, level meshes and the weapon viewmodel
import * as THREE from 'three';
import { T, W, H, WALL, ROOF, CRATE, grid, spawns, top, roofed } from './level.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fb2e5);
scene.fog = new THREE.Fog(0x7fa0c4, 25, 110);
export const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
cam.rotation.order = 'YXZ';
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

scene.add(new THREE.HemisphereLight(0xaaccff, 0x332211, 0.45));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
const cx = W * T / 2, cz = H * T / 2;
sun.position.set(cx + 70, 110, cz + 45); sun.target.position.set(cx, 0, cz);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008;
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 130, bottom: -130, near: 1, far: 320 });
scene.add(sun, sun.target);
cam.add(new THREE.PointLight(0xffaa55, 35, 20)); // torch
scene.add(cam);

const tex = (c1, c2) => { // tiny procedural brick texture
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, 64, 64); g.fillStyle = c2;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 16 + 1, 30, 14);
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
const inst = (geo, mat, list, y) => {
  const m = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4();
  list.forEach((p, k) => m.setMatrixAt(k, m4.makeTranslation(p[0], y, p[1])));
  m.castShadow = m.receiveShadow = true; scene.add(m); return m;
};
const walls = [], crates = [], roofs = [];
for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) {
  const p = [(j + .5) * T, (i + .5) * T], c = grid[i][j];
  if (c === '#') { if ([[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]].some(([a, b]) => top(i + a, j + b) < WALL)) walls.push(p); }
  else if (c === 'b') crates.push(p);
  if (roofed(i, j)) roofs.push(p);
}
const wallTex = tex('#222', '#5a5a5a'); wallTex.repeat.set(1, 2);
export const wallMesh = inst(new THREE.BoxGeometry(T, WALL, T), new THREE.MeshStandardMaterial({ map: wallTex }), walls, WALL / 2);
export const crateMesh = inst(new THREE.BoxGeometry(T, CRATE, T), new THREE.MeshStandardMaterial({ map: tex('#4a3115', '#7a5428') }), crates, CRATE / 2);
inst(new THREE.BoxGeometry(T, 0.4, T), new THREE.MeshStandardMaterial({ map: tex('#1a1a1a', '#3a3a3a') }), roofs, ROOF + 0.2);
const floorTex = tex('#2a2018', '#3a3024'); floorTex.repeat.set(W, H);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * T, H * T), new THREE.MeshStandardMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true; scene.add(floor);
spawns.forEach(p => { // glowing spawn portals
  const r = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: 0xaa00ff }));
  r.rotation.x = -Math.PI / 2; r.position.set(p.x, 0.05, p.z); scene.add(r);
  const l = new THREE.PointLight(0xaa00ff, 10, 8); l.position.set(p.x, 1, p.z); scene.add(l);
});

// Weapon viewmodel
export const gun = new THREE.Group();
const metal = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.4 });
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), metal); barrel.position.z = -0.25;
const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.08), metal); grip.position.set(0, -0.1, 0);
export const muzzle = new THREE.PointLight(0xffdd88, 0, 4); muzzle.position.z = -0.6;
gun.add(barrel, grip, muzzle); gun.position.set(0.22, -0.2, -0.35); cam.add(gun);
