// World-space effects: additive spark particles and bullet tracers
import * as THREE from 'three';
import { scene } from './render.js';

export const glowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(.3, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
})();
const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

const N = 1500, P = [], pos = new Float32Array(N * 3), col = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: .22, map: glowTex, vertexColors: true, ...add }));
points.frustumCulled = false; scene.add(points);
const c = new THREE.Color();
export function burst(p, color, n, speed, life = .4, grav = 15, nrm) {
  c.set(color);
  for (let k = 0; k < n && P.length < N; k++) {
    let x = Math.random() - .5, y = Math.random() - .5, z = Math.random() - .5;
    if (nrm) { x += nrm.x; y += nrm.y; z += nrm.z; }
    const s = speed * (.3 + Math.random() * .7) / (Math.hypot(x, y, z) || 1), l = life * (.5 + Math.random() * .5);
    P.push({ x: p.x, y: p.y, z: p.z, vx: x * s, vy: y * s, vz: z * s, r: c.r, g: c.g, b: c.b, life: l, max: l, grav });
  }
}

const trGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5);
const TR = Array.from({ length: 12 }, () => {
  const m = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, ...add })); m.visible = false; m.life = 0; scene.add(m); return m;
});
let tri = 0;
export function tracer(a, b) {
  const m = TR[tri++ % TR.length]; m.position.copy(a); m.lookAt(b);
  m.scale.set(.025, .025, a.distanceTo(b)); m.life = .06; m.visible = true;
}

export function fx(world, dt) {
  let n = 0;
  for (const p of P) {
    if ((p.life -= dt) <= 0) continue;
    const dr = Math.exp(-2 * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const f = p.life / p.max, o = n * 3;
    pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z; col[o] = p.r * f; col[o + 1] = p.g * f; col[o + 2] = p.b * f;
    P[n++] = p;
  }
  P.length = n; geo.setDrawRange(0, n); geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
  for (const m of TR) if (m.visible) { m.life -= dt; m.material.opacity = m.life / .06; m.visible = m.life > 0; }
}
