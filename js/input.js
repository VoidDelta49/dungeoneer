// Input state (desktop + touch). Systems read `input`; nothing here touches entities.
import { renderer } from './render.js';

export const input = { keys: {}, stick: { x: 0, y: 0 }, jump: false, slide: false, fire: false, look: { yaw: 0, pitch: 0 }, touchPlaying: false };
export const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
export const playing = () => !!document.pointerLockElement || input.touchPlaying;
const msg = document.getElementById('msg');
if (isTouch) document.body.classList.add('touch');

export function lock() {
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (isTouch) { input.touchPlaying = true; msg.style.display = 'none'; }
  else renderer.domElement.requestPointerLock({ unadjustedMovement: true })?.catch?.(() => renderer.domElement.requestPointerLock()); // raw mouse, no OS accel/jitter
}
document.addEventListener('pointerlockchange', () => msg.style.display = document.pointerLockElement ? 'none' : 'flex');

const turn = (dx, dy, s) => { input.look.yaw -= dx * s; input.look.pitch = Math.max(-1.5, Math.min(1.5, input.look.pitch - dy * s)); };
const fire = () => { if (playing()) input.fire = true; };

const keys = input.keys;
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement) turn(e.movementX, e.movementY, 0.002); });
addEventListener('mousedown', () => { if (document.pointerLockElement) fire(); });

// Touch: left stick moves, dragging elsewhere looks, buttons shoot / jump / slide
const joy = document.getElementById('joy'), knob = document.getElementById('knob'), stick = input.stick;
let joyId = null, lookId = null, lookX = 0, lookY = 0;
function setStick(t) {
  const b = joy.getBoundingClientRect(); let dx = t.clientX - (b.left + 65), dy = t.clientY - (b.top + 65);
  const d = Math.hypot(dx, dy), m = 50; if (d > m) { dx *= m / d; dy *= m / d; }
  stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
}
joy.addEventListener('touchstart', e => { e.preventDefault(); joyId = e.changedTouches[0].identifier; setStick(e.changedTouches[0]); }, { passive: false });
const hold = (id, f) => { const b = document.getElementById(id);
  b.addEventListener('touchstart', e => { e.preventDefault(); f(true); }, { passive: false });
  b.addEventListener('touchend', () => f(false)); b.addEventListener('touchcancel', () => f(false)); };
hold('fire', on => on && fire()); hold('jump', on => input.jump = on); hold('slide', on => input.slide = on);
addEventListener('touchstart', e => {
  for (const t of e.changedTouches) if (lookId === null && !t.target.closest('#joy,.btn,#msg')) { lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }
});
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { e.preventDefault(); setStick(t); }
    else if (t.identifier === lookId) { turn(t.clientX - lookX, t.clientY - lookY, 0.005); lookX = t.clientX; lookY = t.clientY; }
  }
}, { passive: false });
const endTouch = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { joyId = null; stick.x = stick.y = 0; knob.style.transform = ''; }
    if (t.identifier === lookId) lookId = null;
  }
};
addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
