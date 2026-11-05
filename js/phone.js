// Diegetic upgrade UI: a phone in the left hand pings (game keeps running), then projects 3 hologram cards.
// Keyboard picks with 1/2/3, touch taps a card. Lives in the gun's viewmodel scene (camera space).
import * as THREE from 'three';
import { vmScene, vmCam } from './gun.js';
import { glowTex } from './fx.js';
import { input, isTouch, tapHandlers } from './input.js';
import { sfx } from './audio.js';
import { RARITY, rollUpgrades, applyUpgrade } from './upgrades.js';

// ---- Phone + left hand
const M = (color, x) => new THREE.MeshStandardMaterial({ color, metalness: .4, roughness: .6, ...x });
const PW = .068, PH = .138, phone = new THREE.Group(); vmScene.add(phone); phone.visible = false;
const box = (w, h, d, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.z = rz; phone.add(o); return o; };
const glove = M(0x24272c, { metalness: .1, roughness: .9 });
box(PW, PH, .009, M(0x15171c, { metalness: .7, roughness: .3 }), 0, 0, 0);
box(.078, .075, .028, glove, .002, -.04, -.02);                     // palm behind the phone
box(.018, .065, .02, glove, -PW / 2 - .006, -.012, .002, -.25);     // thumb on the left edge
for (let k = 0; k < 4; k++) box(.016, .016, .024, glove, PW / 2 + .005, -.06 + k * .021, -.004); // fingertips on the right edge
box(.062, .26, .056, glove, -.012, -.19, -.03);                     // forearm, off-screen
const scr = document.createElement('canvas'); scr.width = 192; scr.height = 384;
const scrTex = new THREE.CanvasTexture(scr); scrTex.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(PW * .9, PH * .92), new THREE.MeshBasicMaterial({ map: scrTex }));
screen.position.z = .0051; phone.add(screen);
const screenLight = new THREE.PointLight(0x4ff0ff, 0, .3); screenLight.position.z = .03; phone.add(screenLight);
function drawScreen(title, sub) {
  const g = scr.getContext('2d'); g.fillStyle = '#031418'; g.fillRect(0, 0, 192, 384);
  g.fillStyle = '#4ff0ff'; g.textAlign = 'center'; g.font = 'bold 84px monospace'; g.fillText('◈', 96, 170);
  g.font = 'bold 22px monospace'; g.fillText(title, 96, 240); g.fillStyle = '#bff'; g.font = '17px monospace'; g.fillText(sub, 96, 272);
  g.fillStyle = '#4ff0ff55'; g.fillRect(16, 20, 160, 4); scrTex.needsUpdate = true;
}

// ---- Hologram cards (canvas textures, drawn on top of everything, not depth-tested)
const CW = 512, CH = 560;
function cardTex(u, k) {
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const g = cv.getContext('2d'), col = RARITY[u.rar].color;
  g.fillStyle = 'rgba(3,18,24,.82)'; g.strokeStyle = col; g.lineWidth = 8; g.shadowColor = col; g.shadowBlur = 24;
  g.beginPath(); g.roundRect(12, 12, CW - 24, CH - 24, 28); g.fill(); g.stroke(); g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 16; y < CH - 16; y += 6) g.fillRect(16, y, CW - 32, 2); // scanlines
  g.textAlign = 'center'; g.fillStyle = col;
  if (!isTouch) { g.fillRect(36, 36, 76, 76); g.fillStyle = '#031418'; g.font = 'bold 64px monospace'; g.fillText(k + 1, 74, 98); g.fillStyle = col; }
  g.font = 'bold 26px monospace'; g.fillText(RARITY[u.rar].name, isTouch ? CW / 2 : 300, 82);
  g.font = '120px monospace'; g.fillText(u.icon, CW / 2, 250);
  g.fillStyle = '#fff'; g.font = 'bold 46px monospace'; g.fillText(u.name, CW / 2, 340, CW - 60);
  g.fillStyle = '#c8f6ff'; g.font = '36px monospace';
  let line = '', y = 410; // word wrap
  for (const w of u.desc.split(' ')) { if (g.measureText(line + w).width > CW - 70) { g.fillText(line, CW / 2, y); line = ''; y += 44; } line += w + ' '; }
  g.fillText(line, CW / 2, y);
  g.fillStyle = col; g.font = 'bold 28px monospace'; g.fillText(isTouch ? '▶ TAP TO INSTALL' : `PRESS [${k + 1}]`, CW / 2, CH - 40);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const holo = x => ({ transparent: true, depthTest: false, depthWrite: false, ...x });
const beamMat = new THREE.MeshBasicMaterial(holo({ color: 0x4ff0ff, opacity: .07, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthTest: true })); // hand occludes it
let cards = [];
function makeCards(ups) {
  cards = ups.map((u, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(holo({ map: cardTex(u, k) })));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial(holo({ map: glowTex, color: RARITY[u.rar].color, opacity: .35, blending: THREE.AdditiveBlending })));
    const beam = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3)), beamMat);
    m.renderOrder = 12; glow.renderOrder = 11; beam.renderOrder = 10; beam.frustumCulled = false;
    vmScene.add(beam, glow, m); return { u, m, glow, beam };
  });
}
function dropCards() {
  for (const c of cards) { vmScene.remove(c.m, c.glow, c.beam); c.m.material.map.dispose(); c.m.material.dispose(); c.m.geometry.dispose(); c.glow.material.dispose(); c.beam.geometry.dispose(); }
  cards = [];
}

// ---- Sequence: idle → raise (ping + buzz) → project → choose → pick → lower
const S = { s: 'idle', t: 0, pending: 0, up: 0, picked: -1, e: null };
export const queueOffer = () => S.pending++;
export function resetPhone() { S.pending = 0; S.s = 'idle'; S.up = 0; phone.visible = false; dropCards(); }
function pick(k) {
  if (S.s !== 'choose' || !cards[k]) return;
  applyUpgrade(S.e, cards[k].u); sfx.pickup(); drawScreen('INSTALLED', cards[k].u.name.slice(0, 16));
  S.s = 'pick'; S.t = 0; S.picked = k;
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
tapHandlers.push((x, y) => {
  if (S.s !== 'choose') return false;
  ray.setFromCamera(ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), vmCam);
  const k = cards.findIndex(c => ray.intersectObject(c.m).length);
  if (k < 0) return false;
  pick(k); return true;
});

const ease = x => x * x * (3 - 2 * x), cl = x => Math.max(0, Math.min(1, x));
const src = new THREE.Vector3(), tgt = new THREE.Vector3(), fov = THREE.MathUtils.degToRad(vmCam.fov / 2);
export function phoneSystem(world, dt) {
  const k = input.pick; input.pick = 0;
  S.e = world.one('player'); S.t += dt;
  if (S.s === 'idle' && S.pending) { S.pending--; S.s = 'raise'; S.t = 0; sfx.ping(); sfx.buzz(); drawScreen('PING!', 'UPGRADE READY'); }
  if (S.s === 'raise' && S.t > .8) { S.s = 'project'; S.t = 0; makeCards(rollUpgrades(S.e)); sfx.charge(); drawScreen('SELECT', isTouch ? 'TAP A CARD' : 'PRESS 1 · 2 · 3'); }
  if (S.s === 'project' && S.t > .5) S.s = 'choose';
  if (S.s === 'choose' && k) pick(k - 1);
  if (S.s === 'pick' && S.t > .5) { dropCards(); S.s = 'lower'; S.t = 0; }
  if (S.s === 'lower' && S.t > .3) S.s = 'idle';
  // phone pose: lifted into the lower-left of view, buzzing for the first half-second
  S.up += ((S.s === 'idle' || S.s === 'lower' ? 0 : 1) - S.up) * Math.min(1, dt * 9);
  phone.visible = S.up > .01; screenLight.intensity = S.up * .6;
  const halfW = .34 * Math.tan(fov) * vmCam.aspect, buzz = S.s === 'raise' && S.t < .6 ? Math.sin(S.t * 95) * .05 : 0;
  phone.position.set(-Math.min(.17, halfW - .07), -.115 - (1 - S.up) * .3, -.34);
  phone.rotation.set(-.1 + (1 - S.up) * .6, .42, -.1 + buzz);
  if (!cards.length) return;
  // card layout in pixels → camera space at depth D: top-centre, clear of the crosshair, sized for legibility
  const D = .6, sh = innerHeight, wpp = 2 * D * Math.tan(fov) / sh;
  let h = Math.min(Math.max(300, .36 * sh), .47 * sh), w = h * CW / CH;
  const fit = innerWidth * .94 / (w * 3.2); if (fit < 1) { w *= fit; h *= fit; }
  screen.updateWorldMatrix(true, false); screen.getWorldPosition(src);
  cards.forEach((c, i) => {
    const p = S.s === 'project' ? ease(cl((S.t - i * .08) / .35)) : 1, out = S.s === 'pick' ? ease(cl(S.t / .4)) : 0;
    tgt.set((i - 1) * w * 1.1 * wpp, (sh / 2 - sh * .025 - h / 2) * wpp + Math.sin(world.time * 2 + i) * .003, -D);
    const chosen = i === S.picked && S.s === 'pick', sc = (.06 + .94 * p) * (chosen ? 1 - out * .94 : 1);
    c.m.position.lerpVectors(src, tgt, chosen ? 1 - out : p);
    c.m.scale.set(w * wpp * sc, h * wpp * sc * (S.s === 'pick' && !chosen ? 1 - out : 1), 1);
    c.m.material.opacity = (p < 1 ? p * (.5 + Math.random() * .5) : .93 + Math.sin(world.time * 40 + i) * .04) * (S.s === 'pick' && !chosen ? 1 - out : 1);
    c.glow.position.copy(c.m.position); c.glow.scale.set(c.m.scale.x * 1.5, c.m.scale.y * 1.4, 1); c.glow.material.opacity = c.m.material.opacity * .3;
    // projection beam: pyramid from the phone screen to the card corners
    const a = c.beam.geometry.attributes.position, sx = c.m.scale.x / 2, sy = c.m.scale.y / 2, q = c.m.position;
    [[-1, -1, 1, -1], [-1, -1, -1, 1], [1, -1, 1, 1]].forEach(([x0, y0, x1, y1], n) => {
      a.setXYZ(n * 3, src.x, src.y, src.z); a.setXYZ(n * 3 + 1, q.x + x0 * sx, q.y + y0 * sy, q.z); a.setXYZ(n * 3 + 2, q.x + x1 * sx, q.y + y1 * sy, q.z);
    });
    a.needsUpdate = true;
  });
}
