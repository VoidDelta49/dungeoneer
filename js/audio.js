// Tiny synthesized SFX (WebAudio, no assets)
let ctx, out, nb;
export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
    out = ctx.createGain(); out.gain.value = .5; out.connect(comp);
    nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  ctx.resume();
}
const env = (t, vol, a, d) => {
  const g = ctx.createGain(); g.gain.setValueAtTime(1e-4, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + d); g.connect(out); return g;
};
const noise = (t, d, vol, type, f0, f1 = f0, a = .002) => {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(); s.buffer = nb; f.type = type;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  s.connect(f).connect(env(t, vol, a, d)); s.start(t, Math.random() * .5); s.stop(t + a + d + .05);
};
const tone = (t, d, vol, type, f0, f1 = f0, a = .002) => {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + a + d); o.connect(env(t, vol, a, d)); o.start(t); o.stop(t + a + d + .05);
};
const play = f => (...a) => { if (ctx?.state === 'running') f(ctx.currentTime, ...a); };
export const sfx = {
  shot: play(t => { const p = .9 + Math.random() * .2;
    noise(t, .14, .7, 'lowpass', 7000 * p, 500); noise(t, .03, .4, 'bandpass', 3200 * p, 1800); tone(t, .12, .9, 'sine', 170 * p, 40); }),
  click: play(t => { noise(t, .02, .3, 'highpass', 3000, 2000); tone(t, .025, .1, 'triangle', 1800, 900); }),
  slam: play(t => { noise(t, .06, .5, 'bandpass', 1800, 700); tone(t, .08, .35, 'square', 260, 90); }),
  whoosh: play(t => noise(t, .2, .25, 'bandpass', 300, 2500, .12)),
  charge: play(t => tone(t, .1, .06, 'sawtooth', 150, 1200, .45)),
  hit: play(t => { tone(t, .04, .12, 'square', 1500, 1100); noise(t, .05, .35, 'bandpass', 2600, 700); tone(t, .06, .25, 'sine', 220, 80); }), // gun: tick + thud
  headshot: play(t => { tone(t, .05, .14, 'square', 1700, 1300); noise(t, .05, .4, 'bandpass', 3000, 800); tone(t + .01, .22, .16, 'triangle', 2600, 2500); }),
  swing: play((t, k = 0) => { const p = [1, 1.18, .75][k] * (.95 + Math.random() * .1); // blade cutting air
    noise(t, .16, .4, 'bandpass', 350 * p, 3400 * p, .05); noise(t + .04, .1, .14, 'highpass', 5200 * p, 2400, .02); }),
  slash: play((t, heavy) => { const p = .92 + Math.random() * .16; // sword connects: bite, wet body, low thump, edge ring
    noise(t, .035, .9, 'highpass', 6500 * p, 2500);
    noise(t, heavy ? .24 : .14, .9, 'lowpass', 2600 * p, 160);
    tone(t, heavy ? .3 : .17, heavy ? 1 : .75, 'sine', (heavy ? 130 : 185) * p, 38);
    tone(t + .005, .32, .07, 'triangle', 2300 * p, 2150 * p);
    if (heavy) { noise(t + .015, .32, .5, 'bandpass', 900, 140); tone(t, .18, .3, 'square', 95, 40); } }),
  ricochet: play(t => { const p = .9 + Math.random() * .2; tone(t, .26, .18, 'triangle', 2100 * p, 3300 * p); tone(t, .2, .1, 'sine', 1400 * p, 2300 * p); noise(t, .05, .3, 'highpass', 5000, 3000); }),
  pad: play(t => { tone(t, .35, .3, 'sine', 160, 900, .02); noise(t, .3, .22, 'bandpass', 500, 3200, .05); }),
  zap: play(t => { tone(t, .14, .18, 'sawtooth', 320, 110); noise(t, .1, .22, 'bandpass', 1600, 500); }),
  kill: play(t => { tone(t, .25, .35, 'sine', 600, 70); noise(t, .25, .3, 'lowpass', 2500, 200); }),
  hurt: play(t => tone(t, .2, .35, 'sawtooth', 140, 55)),
  spit: play(t => tone(t, .15, .2, 'sine', 250, 650)),
  ping: play(t => { tone(t, .1, .2, 'sine', 1320); tone(t + .12, .2, .2, 'sine', 1760); }),
  buzz: play(t => { for (let k = 0; k < 6; k++) tone(t + k * .08, .05, .12, 'square', 85, 75); }),
  seal: play(t => { tone(t, .6, .3, 'sawtooth', 90, 40); noise(t, .5, .3, 'lowpass', 900, 150); }),
  clear: play(t => [523, 659, 784, 1046].forEach((f, k) => tone(t + k * .07, .25, .14, 'triangle', f))),
  clang: play(t => { tone(t, .25, .2, 'triangle', 1900, 1700); noise(t, .08, .3, 'highpass', 4000, 2500); }),
  parry: play(t => { tone(t, .5, .25, 'sine', 2600, 2400); tone(t, .4, .15, 'triangle', 1300, 1290); noise(t, .1, .3, 'highpass', 6000, 3000); }),
  warn: play(t => tone(t, .18, .12, 'square', 520, 780)),
  laser: play(t => { tone(t, .35, .3, 'sawtooth', 1800, 200); noise(t, .2, .3, 'bandpass', 3000, 800); }),
  pickup: play(t => [660, 880, 1320].forEach((f, k) => tone(t + k * .06, .12, .15, 'triangle', f))),
};
