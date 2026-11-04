// Level data: rooms + corridors carved into a tile grid. ',' = open to the sky, '.' = roofed, 'b' = crate
import * as THREE from 'three';

export const T = 4, W = 64, H = 48, WALL = 8, ROOF = 6, CRATE = 1.2;
export const grid = Array.from({ length: H }, () => Array(W).fill('#'));
const carve = (x, y, w, h, c) => { for (let i = y; i < y + h; i++) for (let j = x; j < x + w; j++) grid[i][j] = c; };
// [x, y, w, h, open]
const rooms = [[2,2,14,14,0],[24,2,16,14,1],[48,2,14,14,0],[2,30,14,16,1],[24,28,16,18,0],[48,30,14,16,1]];
rooms.forEach(([x, y, w, h, o]) => carve(x, y, w, h, o ? ',' : '.'));
[[16,8,8,3],[40,8,8,3],[16,36,8,3],[40,36,8,3],[8,16,3,14],[31,16,3,12],[54,16,3,14]].forEach(r => carve(...r, '.'));

export const start = new THREE.Vector3(6.5 * T, 0, 6.5 * T);
export const spawns = rooms.map(([x, y, w, h], k) => new THREE.Vector3((x + w / 2 + (k ? 0 : 5)) * T, 0, (y + h / 2 + (k ? 0 : 5)) * T));
const near = (j, i, p, r) => Math.hypot((j + .5) * T - p.x, (i + .5) * T - p.z) < r * T;
const rf = grid.map(r => r.map(c => c === '.')); // roof mask (kept under crates)
rooms.forEach(([x, y, w, h]) => { // scatter jumpable crates
  for (let i = y + 2; i < y + h - 2; i++) for (let j = x + 2; j < x + w - 2; j++)
    if (Math.random() < 0.05 && ![start, ...spawns].some(p => near(j, i, p, 3))) grid[i][j] = 'b';
});

// Height of the solid top of tile (i, j); 99 outside the map
export const top = (i, j) => (i < 0 || j < 0 || i >= H || j >= W) ? 99 : grid[i][j] === '#' ? WALL : grid[i][j] === 'b' ? CRATE : 0;
export const roofed = (i, j) => i >= 0 && j >= 0 && i < H && j < W && rf[i][j];
