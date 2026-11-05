// Weapon viewmodel: own scene/camera (drawn on top, never clips walls), model, and procedural animation
// (recoil spring, slide blowback, sway/bob, and a spin-trick reload around the trigger guard).
import * as THREE from 'three';
import { glowTex } from './fx.js';

export const WEAPON = { MAG: 18, RATE: 0.095, RELOAD: 1.05, SPREAD: 0.002, BLOOM: 0.009, BLOOM_MAX: 0.045 };
export const feel = { pitch: 0, yaw: 0, shake: 0 }; // camera recoil/shake, consumed by the view system

export const vmScene = new THREE.Scene();
export const vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
addEventListener('resize', () => { vmCam.aspect = innerWidth / innerHeight; vmCam.updateProjectionMatrix(); });
vmScene.add(new THREE.HemisphereLight(0xcfe0ff, 0x302418, 1.4));
const key = new THREE.DirectionalLight(0xfff0dd, 2.2); key.position.set(1, 2, 1.5); vmScene.add(key);

const M = (color, metalness, roughness, x) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...x });
const body = M(0x2e323a, .5, .4), slideM = M(0x4a505a, .6, .3), dark = M(0x111214, .3, .7), gripM = M(0x1b1c1f, .1, .9);
const accent = M(0xff7a1a, .2, .4, { emissive: 0xff5a00, emissiveIntensity: .8 });
const cellOn = M(0x331100, .2, .4, { emissive: 0xff7a1a, emissiveIntensity: 2.5 }), cellOff = M(0x1a1410, .3, .7);
const box = (p, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };

const root = new THREE.Group(), pivot = new THREE.Group(), slide = new THREE.Group(), grip = new THREE.Group(), mag = new THREE.Group();
vmScene.add(root); root.add(pivot); pivot.add(slide, grip); grip.add(mag); // pivot origin = trigger guard
box(pivot, .058, .05, .30, body, 0, .035, -.10);       // frame
box(pivot, .05, .016, .12, dark, 0, .004, -.18);       // rail
box(pivot, .012, .008, .075, body, 0, -.034, -.035);   // trigger guard
box(pivot, .012, .042, .008, body, 0, -.014, -.07);
box(pivot, .008, .03, .008, accent, 0, -.01, -.025);   // trigger
box(pivot, .068, .062, .06, body, 0, .088, -.30);      // compensator
box(pivot, .03, .03, .01, dark, 0, .088, -.331);       // bore
box(pivot, .02, .026, .02, dark, 0, .1, .08);          // hammer
box(slide, .064, .056, .34, slideM, 0, .088, -.10);
for (let k = 0; k < 5; k++) box(slide, .068, .04, .005, dark, 0, .09, .03 + k * .009); // serrations
box(slide, .006, .026, .07, dark, .031, .095, -.04);   // ejection port
box(slide, .012, .018, .012, dark, .018, .122, .058); box(slide, .012, .018, .012, dark, -.018, .122, .058);
box(slide, .01, .016, .012, accent, 0, .122, -.25);    // front sight
grip.position.set(0, .02, .04); grip.rotation.x = -.3;
box(grip, .056, .16, .072, gripM, 0, -.08, 0);
box(mag, .062, .018, .08, body, 0, -.165, 0); box(mag, .02, .008, .082, accent, 0, -.172, 0);
const cells = []; // ammo readout on the frame sides
for (let k = 0; k < 6; k++) for (const s of [-1, 1]) cells.push(box(pivot, .004, .012, .022, cellOff, s * .0305, .04, -.08 - k * .028));
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false }));
flash.position.set(0, .088, -.40); pivot.add(flash);
const flashLight = new THREE.PointLight(0xffb060, 0, 1.5); flashLight.position.set(0, .1, -.4); pivot.add(flashLight);

const st = { kick: 0, kickV: 0, roll: 0, rollV: 0, slide: 0, flash: 0, sx: 0, sy: 0, phase: 0, bob: 0, crouch: 0, pulse: 0, yaw: 0, pitch: 0 };
export function fireGun() {
  st.kickV += 7 + Math.random() * 2; st.rollV += (Math.random() - .5) * 6; st.slide = 1; st.flash = .045;
  flash.material.rotation = Math.random() * 6.28; flash.scale.setScalar(.14 + Math.random() * .1);
}
export const catchGun = () => { st.kickV -= 5; st.pulse = 1; };

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), ease = x => x * x * (3 - 2 * x);
const inOut = x => x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
// o: { hide (0..1, sword out), speed, grounded, crouch, vy, dip, yaw, pitch, time, ammo (0..1), reload (-1 | 0..1), locked }
export function animateGun(dt, o) {
  dt = Math.min(dt, .05);
  for (let n = 0; n < 2; n++) { const h = dt / 2; // springs
    st.kickV += (-st.kick * 260 - st.kickV * 22) * h; st.kick += st.kickV * h;
    st.rollV += (-st.roll * 200 - st.rollV * 18) * h; st.roll += st.rollV * h;
  }
  const k = Math.min(1, dt * 12), idt = 1 / Math.max(dt, 1e-3);
  st.sx += (cl((o.yaw - st.yaw) * idt * .012, -.05, .05) - st.sx) * k;
  st.sy += (cl((o.pitch - st.pitch) * idt * .012, -.05, .05) - st.sy) * k;
  st.yaw = o.yaw; st.pitch = o.pitch;
  const moving = o.grounded && !o.crouch ? Math.min(o.speed / 12, 1) : 0;
  st.bob += (moving - st.bob) * k; st.phase += dt * (4 + o.speed * .5);
  st.crouch += ((o.crouch && o.grounded ? 1 : 0) - st.crouch) * k;

  let px = .14 + st.sx * .5 + Math.sin(st.phase) * .012 * st.bob - st.crouch * .03;
  let py = -.13 - st.sy * .5 - Math.abs(Math.cos(st.phase)) * .012 * st.bob + cl(-o.vy * .0025, -.03, .03) - o.dip * .12 + st.crouch * .01 + Math.sin(o.time * 1.7) * .002;
  let pz = -.38 + st.kick * .07, rx = st.kick * .3 - st.sy * .8, ry = .04 - st.sx * 1.2, rz = st.roll * .1 + st.crouch * .4 - st.sx * .8;
  let lit = Math.ceil(o.ammo * 6), spin = 0, magY = 0, magVis = true;
  if (o.reload >= 0) { // lower + cant, flip the gun twice around the trigger guard, catch it
    const p = o.reload, low = ease(cl(p / .16)) * (1 - ease(cl((p - .8) / .2))), s = cl((p - .14) / .64);
    px -= low * .04; py -= low * .07; pz -= low * .08; rz += low * .7; ry += low * .3; rx -= low * .1;
    spin = inOut(s) * Math.PI * 4; py += Math.sin(s * Math.PI) * .05;
    magY = p < .14 ? -ease(p / .14) * .05 : p < .74 ? -.05 : -.05 * (1 - cl((p - .74) / .06));
    magVis = p < .14 || p > .74; lit = Math.floor(cl((p - .18) / .55) * 6);
  }
  root.position.set(px, py - o.hide * .4, pz); root.rotation.set(rx - o.hide * .8, ry, rz); root.visible = o.hide < .98; pivot.rotation.x = spin;
  mag.position.y = magY; mag.visible = magVis;
  slide.position.z = o.locked ? .045 : st.slide * .045; st.slide *= Math.exp(-dt * 28);
  cells.forEach((c, i) => c.material = (i >> 1) < lit ? cellOn : cellOff);
  st.pulse *= Math.exp(-dt * 5); cellOn.emissiveIntensity = 2.5 + st.pulse * 6 + (spin ? 2 : 0);
  st.flash -= dt; flash.visible = st.flash > 0; flashLight.intensity = flash.visible ? 3 : 0;
}
