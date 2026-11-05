// Flow field toward the player so enemies path around obstacles (and hop up steps <= CLIMB).
import { W, H, T, WALL, CLIMB, top } from './level.js';

const INF = 1e9, dist = new Int32Array(W * H), q = new Int32Array(W * H), tops = new Float32Array(W * H);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
let last = -1;
export function refreshNav() { // call after the level or room seals change
  for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) tops[i * W + j] = top(i, j);
  last = -1;
}

export function updateFlow(x, z) {
  const i = Math.floor(z / T), j = Math.floor(x / T), k0 = i * W + j;
  if (k0 === last || i < 0 || j < 0 || i >= H || j >= W) return;
  last = k0; dist.fill(INF); dist[k0] = 0; let h = 0, t = 0; q[t++] = k0;
  while (h < t) {
    const k = q[h++], ki = k / W | 0, kj = k - ki * W, d = dist[k] + 1;
    for (const [a, b] of N4) {
      const ii = ki + a, jj = kj + b, n = ii * W + jj;
      if (ii < 0 || jj < 0 || ii >= H || jj >= W || dist[n] <= d || tops[n] >= WALL || tops[k] - tops[n] > CLIMB) continue;
      dist[n] = d; q[t++] = n;
    }
  }
}

// Writes the direction to the next tile on the path into out; false if already there / no path
export function flowDir(x, z, out) {
  const i = Math.floor(z / T), j = Math.floor(x / T);
  let best = dist[i * W + j], bi = i, bj = j;
  for (const [a, b] of N8) {
    const ii = i + a, jj = j + b;
    if (ii < 0 || jj < 0 || ii >= H || jj >= W) continue;
    if (a && b && (dist[i * W + jj] >= INF || dist[ii * W + j] >= INF)) continue; // no corner cutting
    if (dist[ii * W + jj] < best) { best = dist[ii * W + jj]; bi = ii; bj = jj; }
  }
  if (bi === i && bj === j) return false;
  out.set((bj + .5) * T - x, 0, (bi + .5) * T - z); return true;
}
