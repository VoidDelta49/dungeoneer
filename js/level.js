// Level data: a 3x3 grid of rooms joined by corridors, carved into a tile grid, then dressed with obstacles.
// Tiles: '#' wall/pillar, ',' floor open to the sky, '.' roofed floor, 'b' crate, 'B' tall crate, 'h' high block
// generate(floor) rebuilds everything in place (arrays/vectors are mutated, never reassigned).
import * as THREE from 'three';

export const T = 4, W = 96, H = 72, WALL = 8, ROOF = 6, CLIMB = 1.3; // CLIMB: max step enemies can jump up
export const HEIGHT = { b: 1.2, B: 2.4, h: 3.6 }; // each step is jumpable from the one below (player jump ~2m)
export const grid = Array.from({ length: H }, () => Array(W).fill('#'));
export const barrier = new Uint8Array(W * H); // room seals: solid while a room is in combat
export const rooms = [];                      // { x, y, w, h, open }
export const start = new THREE.Vector3();
let rf = [];                                  // roof mask (kept under obstacles)

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const isFloor = c => c === '.' || c === ',';
const carve = (x, y, w, h, c) => { for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) if (grid[i]?.[j] === '#') grid[i][j] = c; };
const ctr = rm => [rm.x + (rm.w >> 1), rm.y + (rm.h >> 1)];
const tileV = (j, i) => new THREE.Vector3((j + .5) * T, 0, (i + .5) * T);
export const roomCenter = rm => tileV(...ctr(rm));

const CW = 32, CH = 24, COLS = 3, ROWS = 3;
const rect = (w, h, ch, ox = 0, oy = 0) => { const o = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.push([x + ox, y + oy, typeof ch === 'function' ? ch() : ch]); return o; };
const line = (n, ch) => rect(n, 1, ch);
const PREFABS = [ // [weight, () => cells [dx, dy, tile]]
  [3, () => { const s = ri(1, 2); return rect(s, s, '#'); }],                    // pillar
  [3, () => line(ri(3, 6), 'b')],                                                 // low cover wall
  [1.5, () => line(ri(2, 4), '#')],                                               // tall wall
  [2, () => rect(ri(2, 3), ri(1, 2), () => Math.random() < .35 ? 'B' : 'b')],    // crate pile
  [1.5, () => [...rect(1, 2, 'b'), ...rect(1, 2, 'B', 1), ...rect(2, 2, 'h', 2)]], // staircase to high ground
  [1, () => [...rect(3, 3, 'h', 2), [1, 1, 'B'], [0, 1, 'b']]],                   // tower with steps
];
const totalW = PREFABS.reduce((a, [w]) => a + w, 0);
const pickPrefab = () => { let s = Math.random() * totalW; for (const [w, f] of PREFABS) if ((s -= w) < 0) return f(); return PREFABS[0][1](); };

function connected(sx, sy) {
  let total = 0; for (const row of grid) for (const c of row) if (isFloor(c)) total++;
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

export function generate(floor = 1) {
  for (const row of grid) row.fill('#');
  barrier.fill(0); rooms.length = 0;
  // ---- Rooms + corridors
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const w = ri(18, 26), h = ri(14, 19);
    rooms.push({ x: c * CW + ri(2, CW - w - 2), y: r * CH + ri(2, CH - h - 2), w, h, open: Math.random() < 0.5 });
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
  const [sx, sy] = ctr(rooms[0]);
  start.copy(tileV(sx, sy));
  const reserved = rooms.map(ctr); // keep start + rift/lift areas clear
  // ---- Obstacles: random prefabs, rejected if they'd cut any floor off from the rest. Deeper floors are more cluttered.
  const density = 20 - Math.min(floor - 1, 4);
  for (const rm of rooms) {
    for (let n = Math.round(rm.w * rm.h / density); n > 0; n--) {
      const rot = ri(0, 3), ox = ri(rm.x + 2, rm.x + rm.w - 3), oy = ri(rm.y + 2, rm.y + rm.h - 3);
      const cells = pickPrefab().map(([x, y, c]) => { for (let k = 0; k < rot; k++) [x, y] = [y, -x]; return [ox + x, oy + y, c]; });
      const ok = cells.every(([x, y]) => x >= rm.x + 2 && x < rm.x + rm.w - 2 && y >= rm.y + 2 && y < rm.y + rm.h - 2
        && isFloor(grid[y][x]) && reserved.every(([rx, ry]) => Math.hypot(x - rx, y - ry) > 2.5));
      if (!ok) continue;
      const old = cells.map(([x, y]) => grid[y][x]);
      cells.forEach(([x, y, c]) => grid[y][x] = c);
      if (!connected(sx, sy)) cells.forEach(([x, y], k) => grid[y][x] = old[k]);
    }
  }
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
export const topAt = (x, z) => top(Math.floor(z / T), Math.floor(x / T));
export const roofed = (i, j) => i >= 0 && j >= 0 && i < H && j < W && rf[i][j];

// Ray vs level (grid DDA over tile columns + roof slabs). d must be normalised. Returns { t, n:[x,y,z] } or null.
export function raycast(o, d, max = 200) {
  let j = Math.floor(o.x / T), i = Math.floor(o.z / T);
  const sx = Math.sign(d.x), sz = Math.sign(d.z);
  const tdx = d.x ? Math.abs(T / d.x) : Infinity, tdz = d.z ? Math.abs(T / d.z) : Infinity;
  let tmx = d.x ? (sx > 0 ? (j + 1) * T - o.x : o.x - j * T) / Math.abs(d.x) : Infinity;
  let tmz = d.z ? (sz > 0 ? (i + 1) * T - o.z : o.z - i * T) / Math.abs(d.z) : Infinity;
  let t0 = 0, axis = -1;
  for (let n = 0; n < 512 && t0 < max; n++) {
    const t1 = Math.min(tmx, tmz, max), h = top(i, j), y0 = o.y + d.y * t0, y1 = o.y + d.y * t1;
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
