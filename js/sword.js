// Sword: model (shared by the first-person viewmodel and the thrown world copy) + procedural animation:
// 3-swing combo (right→left, left→right, overhead finisher), block pose, swing trail.
import * as THREE from 'three';
import { vmScene } from './gun.js';

const M = (color, metalness, roughness, x) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...x });
const steel = M(0xc8d2dc, .9, .25), dark = M(0x1b1c1f, .3, .8), glow = M(0x0a3038, .2, .4, { emissive: 0x4ff0ff, emissiveIntensity: 2 });
export function makeSword() { // grip at origin, blade along +y
  const g = new THREE.Group();
  const box = (w, h, d, m, y, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.y = y; o.rotation.z = rz; o.castShadow = true; g.add(o); };
  box(.055, .62, .014, steel, .41); box(.012, .6, .017, glow, .4); box(.039, .039, .014, steel, .72, Math.PI / 4);
  box(.2, .03, .05, dark, .09); box(.03, .16, .03, dark, 0); box(.045, .04, .045, glow, -.1);
  return g;
}

const root = new THREE.Group(), sword = makeSword(), tip = new THREE.Object3D(), base = new THREE.Object3D();
root.rotation.order = 'YXZ'; root.scale.setScalar(.75); tip.position.y = .74; base.position.y = .2;
sword.add(tip, base); root.add(sword); vmScene.add(root);

// poses: [x, y, z, rx (tilt forward), ry (sweep left), rz (roll)]
const IDLE = [.26, -.24, -.5, -.55, .25, -.25], BLOCK = [.03, -.13, -.42, -1.45, 1.5, 0];
export const SWINGS = [ // dur (s), damage, [from, to]
  { dur: .32, dmg: 3, a: [.42, -.08, -.45, -1.35, -1.3, -.2], b: [-.38, -.2, -.5, -1.45, 1.3, .2] },
  { dur: .32, dmg: 3, a: [-.38, -.1, -.45, -1.35, 1.3, .3], b: [.42, -.22, -.5, -1.5, -1.3, -.3] },
  { dur: .5, dmg: 6, a: [.12, .1, -.35, .5, .1, 0], b: [.05, -.3, -.55, -2.2, 0, 0] },
];
export const HIT_AT = .4; // fraction of a swing when it connects
const ease = x => x * x * (3 - 2 * x), out = x => 1 - (1 - x) ** 3;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// trail: ribbon between blade base and tip over the last N frames
const N = 10, tpos = new Float32Array(N * 6), tcol = new Float32Array(N * 6), idx = [];
for (let k = 0; k < N - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
const tg = new THREE.BufferGeometry(); tg.setIndex(idx);
tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
const trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
trail.frustumCulled = false; vmScene.add(trail);
const pa = new THREE.Vector3(), pb = new THREE.Vector3();

let cur = IDLE, blk = 0;
// o: { raise 0..1, swing -1|0..2, p 0..1 (swing progress), block bool, time, speed }
export function animateSword(dt, o) {
  root.visible = o.raise > .02;
  blk += ((o.block ? 1 : 0) - blk) * Math.min(1, dt * 18);
  let pose;
  if (o.swing >= 0) {
    const S = SWINGS[o.swing], p = o.p;
    pose = p < .25 ? mix(cur, S.a, ease(p / .25)) : p < .55 ? mix(S.a, S.b, out((p - .25) / .3)) : mix(S.b, IDLE, ease((p - .55) / .45));
  } else { pose = mix(IDLE, BLOCK, blk); cur = mix(cur, pose, Math.min(1, dt * 20)); pose = cur; }
  if (o.swing < 0 || o.p >= .25) cur = pose;
  const bob = Math.sin(o.time * 8) * .006 * Math.min(1, o.speed / 10);
  root.position.set(pose[0], pose[1] - (1 - o.raise) * .45 + bob, pose[2]);
  root.rotation.set(pose[3] - (1 - o.raise) * .8, pose[4], pose[5]);
  // trail
  root.updateMatrixWorld(true); tip.getWorldPosition(pa); base.getWorldPosition(pb);
  const active = o.swing >= 0 && o.p > .2 && o.p < .65;
  tpos.copyWithin(6, 0, (N - 1) * 6); tpos.set([pb.x, pb.y, pb.z, pa.x, pa.y, pa.z], 0);
  if (!active) for (let k = 1; k < N; k++) tpos.set(tpos.subarray(0, 6), k * 6);
  for (let k = 0; k < N; k++) { const f = (1 - k / N) * .6; tcol.set([0, f * .3, f * .4, f * .5, f, f], k * 6); }
  tg.attributes.position.needsUpdate = tg.attributes.color.needsUpdate = true;
}
