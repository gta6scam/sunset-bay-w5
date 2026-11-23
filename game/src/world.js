// world.js — Sunset Bay itself: the street grid, eight districts of buildings,
// the props that dress them (palms, lamps, containers, market stalls, pools),
// the shops, and the collision queries every mover uses. Built once from a
// seeded generator, so the city is identical on every visit.

import { BLOCK, ROAD_W, WORLD_W, WORLD_H, WATER_X, BEACH_W, DISTRICTS, districtAt } from './config.js';
import { hash2 } from './rng.js';

/** Street centre lines: x = 0, 640, 1280, ..., 5120 and y = 0, ..., 3840. */
export const STREET_XS = [];
for (let x = 0; x <= WORLD_W; x += BLOCK) STREET_XS.push(x);
export const STREET_YS = [];
for (let y = 0; y <= WORLD_H; y += BLOCK) STREET_YS.push(y);

/** True when (x, y) lies on asphalt (a street strip or an intersection). */
export function onRoad(x, y) {
  const mx = ((x % BLOCK) + BLOCK) % BLOCK;
  const my = ((y % BLOCK) + BLOCK) % BLOCK;
  const nearX = mx < ROAD_W / 2 || mx > BLOCK - ROAD_W / 2;
  const nearY = my < ROAD_W / 2 || my > BLOCK - ROAD_W / 2;
  return nearX || nearY;
}

/** True when (x, y) is open water in the bay. */
export function inWater(x, y) {
  return x > WATER_X;
}

/** The shop placements: kind, grid cell and the side of the cell facing a street. */
const SHOP_DEFS = [
  { kind: 'gun', cell: [3, 0], side: 'S' },
  { kind: 'gun', cell: [5, 4], side: 'W' },
  { kind: 'spray', cell: [1, 2], side: 'E' },
  { kind: 'spray', cell: [3, 3], side: 'N' },
  { kind: 'food', cell: [6, 2], side: 'W' },
  { kind: 'food', cell: [2, 4], side: 'N' },
  { kind: 'clothes', cell: [6, 0], side: 'S' },
  { kind: 'clothes', cell: [4, 2], side: 'E' },
];

function cellRect(i, j) {
  const pad = ROAD_W / 2 + 16;
  return {
    x: i * BLOCK + pad,
    y: j * BLOCK + pad,
    w: BLOCK - pad * 2,
    h: BLOCK - pad * 2,
  };
}

export function buildWorld(rng) {
  const buildings = [];
  const props = [];
  const shops = [];
  const parkSpots = [];

  function addBuilding(x, y, w, h, d, floors, kind) {
    buildings.push({
      x, y, w, h,
      roof: d.roofs[Math.floor(hash2(x, y, 11) * d.roofs.length)],
      wall: d.wall,
      floors,
      kind,
      seed: hash2(x, y, 23),
      district: d.name,
    });
  }

  function addProp(kind, x, y, extra = {}) {
    props.push({ kind, x, y, angle: 0, seed: hash2(Math.round(x), Math.round(y), 37), ...extra });
  }

  // ---- city blocks -------------------------------------------------------
  for (let i = 0; i < WORLD_W / BLOCK; i++) {
    for (let j = 0; j < WORLD_H / BLOCK; j++) {
      const r = cellRect(i, j);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      if (cx > WATER_X - BEACH_W) continue; // beach and bay: no blocks
      const d = districtAt(cx, cy);
      const roll = hash2(i, j, 41);

      if (i === 3 && j === 2) {
        // Centro Plaza: the city's living room. One downtown block is kept
        // clear of towers on purpose — a fountain court ringed with
        // benches, planters and lamps, where half the city's conversations
        // (and more than a few deals) happen in the open air.
        addProp('fountain', cx, cy);
        for (const [bx, by, ba] of [[-120, -92, 0.6], [120, -92, 2.5], [-120, 92, -0.6], [120, 92, -2.5], [0, -138, 0], [0, 138, Math.PI]]) {
          addProp('bench', cx + bx, cy + by, { angle: ba });
        }
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.39;
          addProp('planter', cx + Math.cos(a) * 148, cy + Math.sin(a) * 148);
        }
        for (const [lx, ly] of [[-168, -168], [168, -168], [-168, 168], [168, 168]]) {
          addProp('lamp', cx + lx, cy + ly);
        }
        continue;
      }

      if (d.props === 'towers') {
        // Centro: one or two glass slabs per block, plazas between them.
        if (roll < 0.45) {
          addBuilding(r.x + 20, r.y + 20, r.w - 40, r.h - 40, d, rng.int(14, 24), 'tower');
        } else {
          addBuilding(r.x + 16, r.y + 16, r.w * 0.44, r.h - 32, d, rng.int(9, 16), 'tower');
          addBuilding(r.x + r.w * 0.54, r.y + 16, r.w * 0.42, r.h - 32, d, rng.int(11, 20), 'tower');
        }
        for (let k = 0; k < 5; k++) addProp('planter', r.x + rng.range(10, r.w - 10), r.y + rng.range(10, r.h - 10));
      } else if (d.props === 'warehouse' || d.props === 'docks') {
        // Long sheds with a working yard of containers and crates.
        addBuilding(r.x + 14, r.y + 14, r.w - 28, r.h * 0.42, d, 2, 'shed');
        if (roll < 0.6) addBuilding(r.x + 14, r.y + r.h * 0.58, r.w * 0.5, r.h * 0.36, d, 2, 'shed');
        const stacks = rng.int(4, 8);
        for (let k = 0; k < stacks; k++) {
          addProp('container', r.x + rng.range(30, r.w - 60), r.y + rng.range(r.h * 0.5, r.h - 30), { angle: rng.chance(0.5) ? 0 : Math.PI / 2 });
        }
        for (let k = 0; k < 6; k++) addProp('crate', r.x + rng.range(16, r.w - 16), r.y + rng.range(16, r.h - 16));
        addProp('barrier', r.x + r.w * 0.5, r.y + r.h * 0.52);
      } else if (d.props === 'villas') {
        // Palm Heights: detached houses, hedges, the odd pool.
        const lots = [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const [lx, ly] of lots) {
          const hx = r.x + lx * (r.w / 2) + 26;
          const hy = r.y + ly * (r.h / 2) + 26;
          addBuilding(hx, hy, r.w / 2 - 90, r.h / 2 - 96, d, 2, 'house');
          addProp('hedge', hx - 14, hy + 30, { w: 10, h: r.h / 2 - 110 });
          if (hash2(i * 3 + lx, j * 5 + ly, 53) < 0.4) addProp('pool', hx + r.w / 2 - 150, hy + 16, { w: 74, h: 44 });
          if (hash2(i + lx, j + ly, 59) < 0.55) parkSpots.push({ x: hx + 40, y: hy + r.h / 2 - 66, angle: 0 });
        }
        for (let k = 0; k < 4; k++) addProp('palm', r.x + rng.range(8, r.w - 8), r.y + rng.range(8, r.h - 8));
      } else if (d.props === 'marina') {
        // Low white blocks around a plaza, palms and boat trailers.
        const lots = [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const [lx, ly] of lots) {
          if (hash2(i + lx * 7, j + ly * 3, 61) > d.density + 0.25) continue;
          addBuilding(r.x + lx * (r.w / 2) + 18, r.y + ly * (r.h / 2) + 18, r.w / 2 - 56, r.h / 2 - 62, d, rng.int(2, 4), 'block');
        }
        for (let k = 0; k < 5; k++) addProp('palm', r.x + rng.range(8, r.w - 8), r.y + rng.range(8, r.h - 8));
        if (roll < 0.5) addProp('boat', r.x + r.w * 0.62, r.y + r.h * 0.6, { angle: rng.range(-0.2, 0.2) });
      } else {
        // The default four-lot block: buildings, a car park, or a green.
        const lots = [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const [lx, ly] of lots) {
          const bx = r.x + lx * (r.w / 2) + 14;
          const by = r.y + ly * (r.h / 2) + 14;
          const bw = r.w / 2 - 28;
          const bh = r.h / 2 - 28;
          const lotRoll = hash2(i * 13 + lx * 7, j * 17 + ly * 5, 67);
          if (lotRoll < d.density) {
            const floors = d.props === 'clubs' ? rng.int(3, 6) : d.props === 'market' ? rng.int(2, 4) : rng.int(3, 8);
            addBuilding(bx, by, bw, bh, d, floors, d.props === 'clubs' ? 'club' : 'block');
            if (d.props === 'clubs' && lotRoll < 0.4) addProp('sign', bx + bw / 2, by - 4);
            if (d.props === 'market' && lotRoll < 0.45) addProp('stall', bx + bw / 2, by + bh + 12);
          } else if (lotRoll < d.density + 0.14) {
            // Surface car park: marked bays, some filled.
            addProp('carpark', bx, by, { w: bw, h: bh });
            for (let s = 0; s < 4; s++) {
              if (hash2(i + s, j + lx + ly, 71) < 0.62) {
                parkSpots.push({ x: bx + 34 + s * ((bw - 60) / 3), y: by + bh / 2, angle: Math.PI / 2 });
              }
            }
          } else {
            for (let k = 0; k < 3; k++) addProp('palm', bx + rng.range(10, bw - 10), by + rng.range(10, bh - 10));
            addProp('bench', bx + bw / 2, by + bh / 2);
          }
        }
      }
    }
  }

  // ---- streets dressing --------------------------------------------------
  for (const sx of STREET_XS) {
    for (const sy of STREET_YS) {
      // A lamp on every intersection corner.
      for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = sx + ox * (ROAD_W / 2 + 10);
        const y = sy + oy * (ROAD_W / 2 + 10);
        if (x > 0 && x < WATER_X - 20 && y > 0 && y < WORLD_H) addProp('lamp', x, y);
      }
    }
  }
  // Palms down the beach and along the bay road.
  for (let y = 90; y < WORLD_H - 60; y += rng.int(120, 210)) {
    addProp('palm', WATER_X - BEACH_W + rng.range(14, 60), y);
    if (rng.chance(0.5)) addProp('palm', WATER_X - 26, y + rng.range(-30, 30));
  }
  // Piers reaching into the bay, with moored boats.
  for (const py of [420, 1080, 2340, 3180]) {
    addProp('pier', WATER_X + 130, py, { w: 300, h: 26 });
    addProp('boat', WATER_X + 66, py - 44, { angle: 0.12 });
    addProp('boat', WATER_X + 190, py + 48, { angle: -0.08 });
    addProp('boat', WATER_X + 268, py - 40, { angle: 0.05 });
  }
  // The beach at work: striped umbrellas in loose rows, towels between
  // them, and a lifeguard stand watching every stretch of sand.
  for (let y = 130; y < WORLD_H - 120; y += rng.int(150, 260)) {
    const ux = WATER_X - BEACH_W + rng.range(38, 88);
    addProp('shade', ux, y);
    if (rng.chance(0.7)) addProp('shade', ux + rng.range(-16, 10), y + rng.range(52, 96));
    if (rng.chance(0.55)) addProp('towel', ux + rng.range(-30, 26), y + rng.range(18, 44));
  }
  for (let y = 300; y < WORLD_H - 200; y += rng.int(700, 1000)) {
    addProp('stand', WATER_X - BEACH_W + 26, y);
  }
  // Dumpsters in the alleys behind the commercial blocks — every kitchen
  // and club in the bay feeds one, and half the deals happen beside them.
  for (const b of buildings) {
    if ((b.kind === 'club' || b.kind === 'block' || b.kind === 'tower') && rng.chance(0.30)) {
      const bx = b.x + b.w + 14;
      const by = b.y + rng.range(8, Math.max(10, b.h - 30));
      const insideOther = buildings.some((o) => o !== b && bx > o.x - 8 && bx < o.x + o.w + 8 && by > o.y - 8 && by < o.y + o.h + 8);
      if (bx < WATER_X - BEACH_W - 30 && !insideOther) addProp('bin', bx, by);
    }
  }

  // ---- shops -------------------------------------------------------------
  for (const def of SHOP_DEFS) {
    const r = cellRect(def.cell[0], def.cell[1]);
    let x = r.x + r.w / 2;
    let y = r.y + r.h / 2;
    let angle = 0;
    if (def.side === 'N') { y = r.y - 26; angle = Math.PI / 2; }
    if (def.side === 'S') { y = r.y + r.h + 26; angle = -Math.PI / 2; }
    if (def.side === 'W') { x = r.x - 26; angle = 0; }
    if (def.side === 'E') { x = r.x + r.w + 26; angle = Math.PI; }
    shops.push({ kind: def.kind, x, y, angle, cell: def.cell });
  }

  // ---- dead drops ---------------------------------------------------------
  // Twenty-four cash stashes taped under benches, wedged behind dumpsters
  // and buried in planters across the bay — one per few blocks, placed by
  // hash so every fresh city hides them in the same faithful spots. They
  // are the exploration economy: walk the alleys, get paid.
  const stashes = [];
  for (let k = 0; k < 24; k++) {
    const ci = k % 8;
    const cj = Math.floor(k / 8) + (k % 2) * 2;
    // A hash-rolled spot usually lands inside a building; a stash that
    // cannot be stood on is not a stash, so roll the block again (new
    // hash seeds, same cell) until the spot is open ground.
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = ci * BLOCK + 92 + hash2(k, 7 + attempt * 13, 401) * (BLOCK - 190);
      const y = (cj % 6) * BLOCK + 92 + hash2(3 + attempt * 7, k, 409) * (BLOCK - 190);
      if (x > WATER_X - BEACH_W - 24) continue;
      if (buildings.some((b) => x > b.x - 6 && x < b.x + b.w + 6 && y > b.y - 6 && y < b.y + b.h + 6)) continue;
      stashes.push({ x, y, taken: false });
      break;
    }
  }

  return { buildings, props, shops, parkSpots, stashes };
}

/** The building containing (x, y), expanded by pad, or null. */
export function buildingAt(world, x, y, pad = 0) {
  for (const b of world.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

/**
 * Push a circle at (x, y) radius r out of every building and back inside the
 * city (land only). Returns {x, y, hit} — hit is the building struck, if any.
 * Movers call this after integrating their position.
 */
export function collideCircle(world, x, y, r) {
  let hit = null;
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = b;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the nearest face.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  if (x < r) x = r;
  if (y < r) y = r;
  if (x > WATER_X - 6) x = WATER_X - 6;
  if (y > WORLD_H - r) y = WORLD_H - r;
  return { x, y, hit };
}

/** A clear line of sight between two points (no building in the way). */
export function lineOfSight(world, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 42);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (buildingAt(world, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, -6)) return false;
  }
  return true;
}
