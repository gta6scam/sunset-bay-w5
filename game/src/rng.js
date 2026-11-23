// rng.js — deterministic randomness for Sunset Bay. One seeded generator feeds
// world building, traffic and ambient life so a given seed always grows the
// same city: screenshots are reproducible, saves are stable, and the maker's
// staged scenes land identically on every run.

/** mulberry32: a small, fast, well-distributed 32-bit generator. */
export function createRandom(seed) {
  let a = seed >>> 0;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** A random element of arr (undefined when empty). */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /** A shuffled copy of arr. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** -1 or +1. */
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
  };
}

/** A stable integer hash of two grid coordinates and a salt — texture noise that never changes between frames. */
export function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise over a grid: bilinear interpolation of hash2 corners with a smootherstep blend. */
export function valueNoise(x, y, cell, salt = 0) {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = (x - gx * cell) / cell;
  const fy = (y - gy * cell) / cell;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(gx, gy, salt);
  const b = hash2(gx + 1, gy, salt);
  const c = hash2(gx, gy + 1, salt);
  const d = hash2(gx + 1, gy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal sum of value noise — the grain in asphalt, sand and rooftops. */
export function fbm(x, y, cell, octaves = 3, salt = 0) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let c = cell;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, y, c, salt + i * 7) * amp;
    total += amp;
    amp *= 0.5;
    c /= 2;
  }
  return sum / total;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed angular distance from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points. */
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
