// Input state (desktop + touch). Systems read `input`; nothing here touches entities.
// Touch is two-thumb: a floating stick anywhere on the left; on the right, dragging anywhere aims — including
// while holding FIRE/JUMP/SLIDE/RELOAD, so one thumb can aim + act. AUTO fires when the crosshair is on an enemy.
import { renderer } from './render.js';
import { initAudio } from './audio.js';

const pref = (() => { try { return localStorage.getItem('dungeoneer.auto') !== '0'; } catch { return true; } })();
export const input = { keys: {}, stick: { x: 0, y: 0 }, jump: false, slide: false, fireHeld: false, firePressed: false, reload: false, pick: 0, swap: false, throw: false, block: false, melee: false,
  look: { yaw: 0, pitch: 0 }, touchPlaying: false, autoFire: pref };
export const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
export const playing = () => !!document.pointerLockElement || input.touchPlaying;
export const tapHandlers = []; // (x, y) => true if the tap was consumed (e.g. a hologram card)
const msg = document.getElementById('msg');
if (isTouch) document.body.classList.add('touch');

export function lock() {
  initAudio();
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (isTouch) { input.touchPlaying = true; msg.style.display = 'none'; }
  else renderer.domElement.requestPointerLock({ unadjustedMovement: true })?.catch?.(() => renderer.domElement.requestPointerLock()); // raw mouse, no OS accel/jitter
}
document.addEventListener('pointerlockchange', () => { msg.style.display = document.pointerLockElement ? 'none' : 'flex'; input.fireHeld = false; });

const turn = (dx, dy, s) => { input.look.yaw -= dx * s; input.look.pitch = Math.max(-1.5, Math.min(1.5, input.look.pitch - dy * s)); };
const fire = on => { input.fireHeld = on && playing(); if (input.fireHeld) input.firePressed = true; };

const keys = input.keys;
addEventListener('keydown', e => {
  keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyR') input.reload = true; if (e.code === 'KeyQ') input.swap = true; if (e.code === 'KeyE' || e.code === 'KeyF') input.throw = true;
  const n = /^(Digit|Numpad)([1-3])$/.exec(e.code); if (n) input.pick = +n[2];
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement) turn(e.movementX, e.movementY, 0.002); });
addEventListener('mousedown', e => { if (!document.pointerLockElement) return; if (e.button === 0) fire(true); if (e.button === 2) input.block = true; });
addEventListener('mouseup', e => { if (e.button === 0) fire(false); if (e.button === 2) input.block = false; });
addEventListener('contextmenu', e => e.preventDefault());
let wheelT = 0;
addEventListener('wheel', e => { if (document.pointerLockElement && performance.now() - wheelT > 250) { wheelT = performance.now(); input.swap = true; } });

// ---- Touch
const joy = document.getElementById('joy'), knob = document.getElementById('knob'), autoBtn = document.getElementById('auto'), stick = input.stick;
const roles = new Map(); // touch id -> { btn?, stick?, x, y }
let fires = 0;
const setAuto = () => { autoBtn.textContent = `AUTO ${input.autoFire ? 'ON' : 'OFF'}`; autoBtn.classList.toggle('on', input.autoFire); };
setAuto();
const press = (id, on) => {
  if (id === 'fire') fire((fires = Math.max(0, fires + (on ? 1 : -1))) > 0);
  else if (id === 'jump') input.jump = on;
  else if (id === 'slide') input.slide = on;
  else if (id === 'reload') { if (!on) input.block = false; else if (input.melee) input.block = true; else input.reload = true; } // RELOAD doubles as BLOCK with the sword
  else if (id === 'swap' && on) input.swap = true;
  else if (id === 'throw' && on) input.throw = true;
};
function setStick(r, t) {
  let dx = t.clientX - r.x, dy = t.clientY - r.y; const d = Math.hypot(dx, dy), m = 55;
  if (d > m) { dx *= m / d; dy *= m / d; }
  const k = d < 6 ? 0 : Math.min(1, d / m / .75) / (Math.min(d, m) || 1); // dead zone; full speed at 75% throw
  stick.x = dx * k; stick.y = dy * k; knob.style.transform = `translate(${dx}px,${dy}px)`;
}
const release = (id, r) => {
  if (r.btn) { press(r.btn.id, false); r.btn.classList.remove('held'); }
  if (r.stick) { stick.x = stick.y = 0; knob.style.transform = ''; joy.style.cssText = ''; }
  roles.delete(id);
};
export const releaseTouches = () => roles.forEach((r, id) => release(id, r));

addEventListener('touchstart', e => {
  if (!input.touchPlaying) return; // menus get normal clicks
  for (const t of e.changedTouches) {
    const id = t.identifier, x = t.clientX, y = t.clientY, b = t.target.closest?.('.btn');
    if (tapHandlers.some(f => f(x, y))) continue;
    if (b?.id === 'auto') { input.autoFire = !input.autoFire; setAuto(); try { localStorage.setItem('dungeoneer.auto', input.autoFire ? '1' : '0'); } catch {} continue; }
    if (b) { press(b.id, true); b.classList.add('held'); roles.set(id, { btn: b, x, y }); continue; }
    if (x < innerWidth * .42 && ![...roles.values()].some(r => r.stick)) { // floating stick appears under the thumb
      joy.style.left = x - 65 + 'px'; joy.style.top = y - 65 + 'px'; joy.style.bottom = 'auto';
      roles.set(id, { stick: true, x, y }); continue;
    }
    roles.set(id, { x, y });
  }
  e.preventDefault();
}, { passive: false });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    const r = roles.get(t.identifier); if (!r) continue;
    if (r.stick) setStick(r, t);
    else { turn(t.clientX - r.x, t.clientY - r.y, 0.005); r.x = t.clientX; r.y = t.clientY; } // buttons aim too
  }
  if (input.touchPlaying) e.preventDefault();
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) { const r = roles.get(t.identifier); if (r) release(t.identifier, r); } };
addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
