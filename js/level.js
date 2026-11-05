// Level data: a 4x3 grid of rooms (small / medium / large, each with a layout) joined by corridors, carved into a tile grid.
// Tiles: '#' wall, ',' floor open to the sky, '.' roofed floor, 'j' jump pad (floor), blocks by height: b 1.2, B 2.4, h 3.6, H 4.8, X 6
// Tall blocks (H, X) and pads only appear in open-sky rooms (the roof is at 6m).
// generate(floor) rebuilds everything in place (arrays/vectors are mutated, never reassigned).
import * as THREE from 'three';

const CW = 32, CH = 24, COLS = 4, ROWS = 3;
export const T = 4, W = CW * COLS, H = CH * ROWS, WALL = 8, ROOF = 6, CLIMB = 1.3; // CLIMB: max step enemies can jump up
export const HEIGHT = { b: 1.2, B: 2.4, h: 3.6, H: 4.8, X: 6 }; // each step is jumpable from the one below (player jump ~2m)
export const PAD = 'j';
export const grid = Array.from({ length: H }, () => Array(W).fill('#'));
export const barrier = new Uint8Array(W * H); // room seals: solid while a room is in combat
export const rooms = [];                      // { x, y, w, h, open, size, kind, spawns: [[x, y]] }
export const start = new THREE.Vector3();
let rf = [];                                  // roof mask (kept under obstacles)
const keep = new Uint8Array(W * H);           // tiles obstacles must leave clear (doorways, room centres, rifts)

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickW = w => { let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0); for (const k in w) if ((r -= w[k]) < 0) return k; return Object.keys(w)[0]; };
const isFloor = c => c === '.' || c === ',' || c === PAD;
const carve = (x, y, w, h, c) => { for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) if (grid[i]?.[j] === '#') grid[i][j] = c; };
const ctr = rm => [rm.x + (rm.w >> 1), rm.y + (rm.h >> 1)];
const tileV = (j, i) => new THREE.Vector3((j + .5) * T, 0, (i + .5) * T);
export const roomCenter = rm => tileV(...ctr(rm));
const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) keep[y * W + x] = 1; };
const disk = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) mark(x, y); };

const SIZES = { small: () => [ri(11, 15), ri(10, 13)], medium: () => [ri(18, 23), ri(14, 17)], large: () => [ri(25, 28), ri(18, 20)] };
const rect = (w, h, ch, ox = 0, oy = 0) => { const o = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push([x + ox, y + oy, typeof ch === 'function' ? ch() : ch]); return o; };
const line = (n, ch) => rect(n, 1, ch);
const PREFABS = [ // [weight, () => cells [dx, dy, tile]] — all <= 3.6m so they fit under a roof
  [3, () => { const s = ri(1, 2); return rect(s, s, '#'); }],                    // pillar
  [3, () => line(ri(3, 6), 'b')],                                                 // low cover wall
  [1.5, () => line(ri(2, 4), '#')],                                               // tall wall
  [2, () => rect(ri(2, 3), ri(1, 2), () => Math.random() < .35 ? 'B' : 'b')],    // crate pile
  [1.5, () => [...rect(1, 2, 'b'), ...rect(1, 2, 'B', 1), ...rect(2, 2, 'h', 2)]], // staircase to high ground
  [1, () => [...rect(3, 3, 'h', 2), [1, 1, 'B'], [0, 1, 'b']]],                   // tower with steps
  [1.5, () => [[0, 0, 'b'], [1, 0, 'B'], [3, 0, 'B'], [4, 0, 'h']]],              // gap jump: climb, leap the gap, climb again
  [1, () => [[0, 0, 'b'], [1, 0, 'B'], [2, 0, 'b'], [0, 1, 'B'], [1, 1, 'h'], [2, 1, 'B'], [0, 2, 'b'], [1, 2, 'B'], [2, 2, 'b']]], // step pyramid
];
const prefab = () => pickW(Object.fromEntries(PREFABS.map(([w], k) => [k, w])));
const rotate = (cells, r, ox, oy) => cells.map(([x, y, c]) => { for (let k = 0; k < r; k++) [x, y] = [y, -x]; return [ox + x, oy + y, c]; });

let sx = 0, sy = 0, total = 0; // total: floor tile count, kept up to date by place()
function connected() {
  const seen = new Uint8Array(W * H), st = [sy * W + sx]; seen[st[0]] = 1; let n = 0;
  while (st.length) {
    const k = st.pop(), i = k / W | 0, j = k % W; n++;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const kk = (i + a) * W + j + b;
      if (!seen[kk] && isFloor(grid[i + a][j + b])) { seen[kk] = 1; st.push(kk); }
    }
  }
  return n === total;
}
// Try to stamp cells into a room; rejected if out of bounds, on a kept tile, or if it would cut floor off from the rest
function place(rm, cells, m = 2) {
  if (!cells.length) return false;
  for (const [x, y] of cells) if (x < rm.x + m || x >= rm.x + rm.w - m || y < rm.y + m || y >= rm.y + rm.h - m || keep[y * W + x] || !isFloor(grid[y][x]) || grid[y][x] === PAD) return false;
  const old = cells.map(([x, y]) => grid[y][x]), solid = cells.filter(c => c[2] !== PAD).length;
  cells.forEach(([x, y, c]) => grid[y][x] = c); total -= solid;
  if (!solid || connected()) return true;
  cells.forEach(([x, y], k) => grid[y][x] = old[k]); total += solid; return false;
}
const scatter = (rm, n) => { for (; n > 0; n--) place(rm, rotate(PREFABS[prefab()][1](), ri(0, 3), ri(rm.x + 2, rm.x + rm.w - 3), ri(rm.y + 2, rm.y + rm.h - 3))); };
function pads(rm, n) { // jump pads, preferably at the foot of something tall
  for (let tries = 0; tries < 80 && n > 0; tries++) {
    const x = ri(rm.x + 2, rm.x + rm.w - 3), y = ri(rm.y + 2, rm.y + rm.h - 3);
    const tall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => (HEIGHT[grid[y + b][x + a]] || 0) >= 3.6);
    if ((tall || tries > 60) && place(rm, [[x, y, PAD]])) n--;
  }
}

// Room layouts. Non-arena layouts are always open to the sky so they can go tall.
const LAYOUTS = {
  arena(rm, density) { scatter(rm, Math.round(rm.w * rm.h / density)); if (rm.open && Math.random() < .5) pads(rm, 1); },
  pillars(rm) { // parkour field: a grid of pillars rising toward a peak, gaps you have to jump
    const ox = ri(0, 2), oy = ri(0, 2), px = ri(rm.x + 3, rm.x + rm.w - 4), py = ri(rm.y + 3, rm.y + rm.h - 4);
    for (let y = rm.y + 2 + oy; y < rm.y + rm.h - 2; y += 3) for (let x = rm.x + 2 + ox; x < rm.x + rm.w - 2; x += 3) {
      if (Math.random() < .12) continue;
      const n = Math.max(0, Math.min(4, Math.round(4 - Math.hypot(x - px, y - py) / 3 * .9 + Math.random() * .8 - .4)));
      const cells = [[x, y, 'bBhHX'[n]]];
      if (Math.random() < .25) cells.push([x + 1, y, 'bBhHX'[Math.max(0, n - 1)]]); // ledge to grab onto
      place(rm, cells);
    }
    pads(rm, 2);
  },
  tiers(rm, density) { // amphitheatre: terraces step down from the walls to a central pit
    ['h', 'B', 'b'].forEach((c, r) => {
      const m = 2 + r, x0 = rm.x + m, y0 = rm.y + m, x1 = rm.x + rm.w - m - 1, y1 = rm.y + rm.h - m - 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x === x0 || y === y0 || x === x1 || y === y1) place(rm, [[x, y, c]]);
    });
    scatter(rm, Math.round(rm.w * rm.h / density / 4));
  },
  tower(rm, density) { // a 6m tower with a staircase up one side and a jump pad on the other
    const shape = [[0, 0, 'X'], [1, 0, 'X'], [0, 1, 'X'], [1, 1, 'X'], [2, 0, 'H'], [3, 0, 'h'], [4, 0, 'B'], [5, 0, 'b'], [-1, 1, PAD]];
    for (let tries = 0; tries < 40; tries++) if (place(rm, rotate(shape, ri(0, 3), ri(rm.x + 3, rm.x + rm.w - 4), ri(rm.y + 3, rm.y + rm.h - 4)))) break;
    scatter(rm, Math.round(rm.w * rm.h / density / 2));
  },
  ridges(rm) { // parallel catwalks ramping up at both ends; jump between them
    const horiz = rm.w >= rm.h, len = horiz ? rm.w : rm.h, wid = horiz ? rm.h : rm.w;
    const at = (a, b) => horiz ? [rm.x + a, rm.y + b] : [rm.x + b, rm.y + a];
    for (let b = 2 + ri(0, 1); b < wid - 2; b += 3) {
      for (let a = 2 + ri(0, 2); a < len - 3;) {
        const L = ri(5, 10), seg = [];
        for (let k = 0; k < L && a + k < len - 2; k++) { const [x, y] = at(a + k, b); if (!keep[y * W + x] && isFloor(grid[y][x])) seg.push([x, y]); else if (seg.length) break; }
        const n = seg.length; // ramp up from both ends: b → B → h (→ H on long runs)
        if (n >= 2) place(rm, seg.map(([x, y], k) => [x, y, 'bBhH'[Math.min(k, n - 1 - k, n >= 8 ? 3 : 2)]]));
        a += L + ri(2, 3);
      }
    }
  },
};

export function generate(floor = 1) {
  for (const row of grid) row.fill('#');
  barrier.fill(0); keep.fill(0); rooms.length = 0;
  // ---- Rooms + corridors
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = r * COLS + c, size = k ? pickW({ small: 3, medium: 4, large: 3 }) : 'medium', [w, h] = SIZES[size]();
    const kind = k ? pickW({ arena: 3, pillars: 2, tiers: w >= 17 && h >= 13 ? 2 : 0, tower: w >= 14 ? 1.5 : 0, ridges: 1.5 }) : 'arena';
    rooms.push({ x: c * CW + ri(2, CW - w - 2), y: r * CH + ri(2, CH - h - 2), w, h, size, kind, open: kind !== 'arena' || Math.random() < .45, spawns: [] });
  }
  rooms.forEach(rm => carve(rm.x, rm.y, rm.w, rm.h, rm.open ? ',' : '.'));
  const link = (a, b) => { // 3-wide L-shaped corridor between room centres
    const [ax, ay] = ctr(a), [bx, by] = ctr(b);
    carve(Math.min(ax, bx) - 1, ay - 1, Math.abs(bx - ax) + 3, 3, '.');
    carve(bx - 1, Math.min(ay, by) - 1, 3, Math.abs(by - ay) + 3, '.');
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c < COLS - 1) link(rooms[r * COLS + c], rooms[r * COLS + c + 1]);
    if (r < ROWS - 1) link(rooms[r * COLS + c], rooms[(r + 1) * COLS + c]);
  }
  rf = grid.map(r => r.map(c => c === '.'));
  [sx, sy] = ctr(rooms[0]);
  total = 0; for (const row of grid) for (const c of row) if (isFloor(c)) total++;
  start.copy(tileV(sx, sy));
  // ---- Keep clear: room centres (start / warden / lift) and a lane in from every doorway
  for (const rm of rooms) {
    disk(...ctr(rm), 2.5);
    for (const [i, j] of doorTiles(rm)) {
      const di = i < rm.y ? 1 : i >= rm.y + rm.h ? -1 : 0, dj = j < rm.x ? 1 : j >= rm.x + rm.w ? -1 : 0;
      for (let d = 0; d <= 5; d++) for (let s = -1; s <= 1; s++) mark(j + dj * d + (di ? s : 0), i + di * d + (dj ? s : 0));
    }
  }
  // ---- Rift spawn points: more per room on deeper floors, spread apart so there's no single spot to camp
  const nR = Math.min(6, 2 + ((floor - 1) >> 1));
  rooms.forEach((rm, k) => {
    if (!k) return;
    const n = Math.max(2, nR + (rm.size === 'large') - (rm.size === 'small'));
    for (let tries = 0; tries < 120 && rm.spawns.length < n; tries++) {
      const m = rm.kind === 'tiers' ? 5 : 2, x = ri(rm.x + m, rm.x + rm.w - 1 - m), y = ri(rm.y + m, rm.y + rm.h - 1 - m); // tiers: rifts sit in the pit
      if (!keep[y * W + x] && rm.spawns.every(([a, b]) => Math.hypot(a - x, b - y) >= (tries < 80 ? 5 : 3.5))) rm.spawns.push([x, y]);
    }
    rm.spawns.forEach(([x, y]) => disk(x, y, 1.5));
  });
  // ---- Obstacles per layout. Deeper floors are more cluttered.
  const density = 20 - Math.min(floor - 1, 4);
  for (const rm of rooms) LAYOUTS[rm.kind](rm, density);
}

// Floor tiles on the 1-tile ring just outside a room (where corridors enter) — sealed during combat
export function doorTiles(rm) {
  const out = [];
  for (let i = rm.y - 1; i <= rm.y + rm.h; i++) for (let j = rm.x - 1; j <= rm.x + rm.w; j++) {
    if (i >= rm.y && i < rm.y + rm.h && j >= rm.x && j < rm.x + rm.w) continue;
    if (grid[i]?.[j] && grid[i][j] !== '#') out.push([i, j]);
  }
  return out;
}

// Height of the solid top of tile (i, j); 99 outside the map
export const top = (i, j) => (i < 0 || j < 0 || i >= H || j >= W) ? 99 : grid[i][j] === '#' || barrier[i * W + j] ? WALL : HEIGHT[grid[i][j]] || 0;
// Same, but walls/seals reach the sky: used for the player and the thrown sword so nothing can get on top of (or over) a wall
export const solidTop = (i, j) => { const t = top(i, j); return t >= WALL ? 99 : t; };
export const topAt = (x, z) => top(Math.floor(z / T), Math.floor(x / T));
export const tileAt = (x, z) => grid[Math.floor(z / T)]?.[Math.floor(x / T)];
export const roofed = (i, j) => i >= 0 && j >= 0 && i < H && j < W && rf[i][j];

// Ray vs level (grid DDA over tile columns + roof slabs). d must be normalised. Returns { t, n:[x,y,z] } or null.
// tall: walls are infinitely high (nothing passes over them)
export function raycast(o, d, max = 200, tall = false) {
  const hgt = tall ? solidTop : top;
  let j = Math.floor(o.x / T), i = Math.floor(o.z / T);
  const sx = Math.sign(d.x), sz = Math.sign(d.z);
  const tdx = d.x ? Math.abs(T / d.x) : Infinity, tdz = d.z ? Math.abs(T / d.z) : Infinity;
  let tmx = d.x ? (sx > 0 ? (j + 1) * T - o.x : o.x - j * T) / Math.abs(d.x) : Infinity;
  let tmz = d.z ? (sz > 0 ? (i + 1) * T - o.z : o.z - i * T) / Math.abs(d.z) : Infinity;
  let t0 = 0, axis = -1;
  for (let n = 0; n < 512 && t0 < max; n++) {
    const t1 = Math.min(tmx, tmz, max), h = hgt(i, j), y0 = o.y + d.y * t0, y1 = o.y + d.y * t1;
    if (y0 < h) return axis < 0 ? { t: 0, n: [-d.x, -d.y, -d.z] } : { t: t0, n: axis ? [0, 0, -sz] : [-sx, 0, 0] };
    if (y1 < h) return { t: (h - o.y) / d.y, n: [0, 1, 0] };
    if (roofed(i, j)) {
      const R1 = ROOF + 0.4;
      if (y0 >= ROOF && y0 <= R1 && axis >= 0) return { t: t0, n: axis ? [0, 0, -sz] : [-sx, 0, 0] };
      if (y0 < ROOF && y1 > ROOF) return { t: (ROOF - o.y) / d.y, n: [0, -1, 0] };
      if (y0 > R1 && y1 < R1) return { t: (R1 - o.y) / d.y, n: [0, 1, 0] };
    }
    if (t1 >= max) break;
    if (tmx < tmz) { t0 = tmx; tmx += tdx; j += sx; axis = 0; } else { t0 = tmz; tmz += tdz; i += sz; axis = 1; }
  }
  return null;
}
