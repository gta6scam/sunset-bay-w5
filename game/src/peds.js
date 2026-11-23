// peds.js — the people of Sunset Bay. Pedestrians stroll the block edges,
// wait at shop doors, run from gunfire and fast cars, and fall when shot.
// They are the city's proof of life in every screenshot.

import { PED_NAMES, PED_SHIRTS, PED_PANTS, BLOCK, ROAD_W, WORLD_W, WORLD_H, WATER_X } from './config.js';
import { collideCircle } from './world.js';
import { clamp, dist } from './rng.js';

let nextPedId = 1;

/** Create one pedestrian at (x, y). opts: {state, shirt, pants, name}. */
export function spawnPed(rng, state, x, y, opts = {}) {
  const ped = {
    id: nextPedId++,
    x, y,
    angle: rng.next() * Math.PI * 2,
    speed: 0,
    shirt: opts.shirt ?? PED_SHIRTS[Math.floor(rng.next() * PED_SHIRTS.length)],
    pants: opts.pants ?? PED_PANTS[Math.floor(rng.next() * PED_PANTS.length)],
    skin: ['#f2c9a0', '#d99e6a', '#a0663a', '#6e4423', '#ffe0bd'][Math.floor(rng.next() * 5)],
    name: opts.name ?? PED_NAMES[Math.floor(rng.next() * PED_NAMES.length)],
    state: opts.state ?? 'walk',
    target: null,
    waitT: 0,
    fleeT: 0,
    chatT: 0,
    partnerId: 0,
    pose: null,
    hp: 30,
    dead: false,
    fadeT: 0,
    panic: 0,
    stepPhase: rng.next() * 6.28,
  };
  state.peds.push(ped);
  return ped;
}

/** A point on a block's pedestrian rim: the sidewalk ring around a cell. */
function rimPoint(rng, nearX, nearY) {
  const ci = clamp(Math.floor(nearX / BLOCK) + rng.int(-2, 2), 0, WORLD_W / BLOCK - 1);
  const cj = clamp(Math.floor(nearY / BLOCK) + rng.int(-2, 2), 0, WORLD_H / BLOCK - 1);
  const inset = ROAD_W / 2 + 8;
  const side = rng.int(0, 3);
  const t = rng.next();
  const x0 = ci * BLOCK + inset;
  const y0 = cj * BLOCK + inset;
  const w = BLOCK - inset * 2;
  const h = BLOCK - inset * 2;
  if (side === 0) return { x: x0 + t * w, y: y0 };
  if (side === 1) return { x: x0 + t * w, y: y0 + h };
  if (side === 2) return { x: x0, y: y0 + t * h };
  return { x: x0 + w, y: y0 + t * h };
}

/** Keep a living crowd within sight of the player; recycle the distant. */
export function maintainPeds(rng, state) {
  const p = state.player;
  state.peds = state.peds.filter((ped) => {
    if (ped.state === 'down') return ped.fadeT < 40;
    return dist(ped.x, ped.y, p.x, p.y) < 2600;
  });
  const alive = state.peds.filter((ped) => ped.state !== 'down').length;
  if (alive < 24) {
    const spot = rimPoint(rng, p.x, p.y);
    if (spot.x < WATER_X - 40) {
      const ped = spawnPed(rng, state, spot.x, spot.y);
      ped.target = rimPoint(rng, spot.x, spot.y);
    }
  }
}

/** The world's benches, cached on the state the first time anyone sits. */
function nearestBench(state, x, y) {
  if (!state.benchProps) {
    state.benchProps = state.world.props.filter((pr) => pr.kind === 'bench');
  }
  let best = null;
  let bd = 20;
  for (const b of state.benchProps) {
    const d = dist(x, y, b.x, b.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/**
 * A hostile: not a pedestrian who panics, but a problem that walks
 * toward you. Rival crews send them after dark in the rough districts —
 * they close to pistol range, keep their nerve while their health
 * holds, and shoot with intent. Dropping one is self-defence the
 * dispatch panel never hears about.
 */
export function spawnHostile(rng, state, x, y) {
  const ped = spawnPed(rng, state, x, y, { state: 'hostile', shirt: '#26262b', pants: '#17181c' });
  ped.hp = 55;
  ped.fireT = rng.range(0.5, 1.3);
  return ped;
}

/** Shout danger into the world: nearby peds flee from (x, y). */
export function scarePeds(state, x, y, radius = 300) {
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.pose = null;
      ped.partnerId = 0;
      ped.fleeT = 2 + Math.random() * 2;
      ped.panic = 1;
    }
  }
}

/** Advance every pedestrian one step. */
export function stepPeds(rng, state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.state === 'down') {
      ped.fadeT += dt;
      continue;
    }
    let wantSpeed = 0;
    let wantAngle = ped.angle;

    if (ped.state === 'hostile') {
      // Close to range, hold the nerve line, and shoot on a ragged
      // rhythm. A hostile whose health breaks runs like everyone else.
      const d = dist(ped.x, ped.y, p.x, p.y);
      wantAngle = Math.atan2(p.y - ped.y, p.x - ped.x);
      if (ped.hp < 14) {
        ped.state = 'flee';
        ped.fleeT = 3;
        state.danger = { x: p.x, y: p.y, t: state.time };
      } else if (d > 175) wantSpeed = 128;
      else if (d < 105) wantSpeed = -52;
      else wantSpeed = 0;
      ped.fireT -= dt;
      if (ped.fireT <= 0 && d < 330 && d > 30) {
        ped.fireT = rng.range(0.8, 1.5);
        const a = wantAngle + rng.range(-0.07, 0.07);
        state.bullets.push({
          x: ped.x + Math.cos(a) * 16, y: ped.y + Math.sin(a) * 16,
          vx: Math.cos(a) * 1250, vy: Math.sin(a) * 1250,
          life: 0.3, from: 'ped', dmg: 7,
        });
        state.fx.push({ kind: 'muzzle', x: ped.x + Math.cos(a) * 22, y: ped.y + Math.sin(a) * 22, t: 0, ttl: 0.05 });
        state.audio?.shot?.('pistol');
      }
      if (d > 700) { ped.state = 'walk'; ped.target = rimPoint(rng, ped.x, ped.y); }
    } else if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const away = Math.atan2(ped.y - state.danger.y, ped.x - state.danger.x);
      wantAngle = away + Math.sin(ped.id * 7 + state.time * 3) * 0.35;
      wantSpeed = 168;
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        ped.target = rimPoint(rng, ped.x, ped.y);
      }
    } else if (ped.state === 'chat') {
      // Two people, one conversation: face each other, bob a little, and
      // drift back to their day when the story runs out.
      ped.chatT -= dt;
      const partner = state.peds.find((q) => q.id === ped.partnerId);
      if (!partner || partner.state === 'down' || partner.state === 'flee' || ped.chatT <= 0) {
        ped.state = 'walk';
        ped.partnerId = 0;
        ped.target = rimPoint(rng, ped.x, ped.y);
      } else {
        wantAngle = Math.atan2(partner.y - ped.y, partner.x - ped.x);
        ped.stepPhase += dt * 1.4;
      }
    } else if (ped.state === 'sit') {
      ped.waitT -= dt;
      if (ped.waitT <= 0) {
        ped.state = 'walk';
        ped.pose = null;
        ped.target = rimPoint(rng, ped.x, ped.y);
      }
    } else if (ped.state === 'stand') {
      ped.waitT -= dt;
      if (ped.waitT <= 0) {
        // A bench nearby is an invitation; otherwise, walk on.
        const bench = nearestBench(state, ped.x, ped.y);
        if (bench && rng.chance(0.55)) {
          ped.state = 'sit';
          ped.pose = 'sit';
          ped.x = bench.x;
          ped.y = bench.y;
          ped.angle = bench.angle || 0;
          ped.waitT = rng.range(6, 15);
        } else {
          ped.state = 'walk';
          ped.pose = null;
          ped.target = rimPoint(rng, ped.x, ped.y);
        }
      }
    } else {
      // Walk the rims; sometimes cross to the next block, sometimes stop.
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) {
        if (rng.chance(0.15)) {
          // Company? A neighbour within arm's reach becomes a conversation.
          const other = state.peds.find((q) => q !== ped && q.state !== 'down' && q.state !== 'flee'
            && q.state !== 'chat' && dist(ped.x, ped.y, q.x, q.y) < 30);
          if (other) {
            ped.state = 'chat';
            other.state = 'chat';
            ped.chatT = other.chatT = rng.range(4, 9);
            ped.partnerId = other.id;
            other.partnerId = ped.id;
            other.target = null;
          } else {
            ped.state = 'stand';
            ped.pose = rng.chance(0.35) ? 'phone' : null;
            ped.waitT = rng.range(1.5, 5);
          }
        } else if (rng.chance(0.10)) {
          ped.state = 'stand';
          ped.pose = rng.chance(0.35) ? 'phone' : null;
          ped.waitT = rng.range(1.5, 5);
        } else {
          ped.target = rimPoint(rng, ped.x, ped.y);
        }
      }
      if (ped.target) {
        wantAngle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
        wantSpeed = 58 + (ped.id % 5) * 4;
      }
      // A car bearing down clears the pavement.
      for (const car of state.cars) {
        if (car.driver === 'heli' || Math.abs(car.speed) < 130) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < 90) {
          ped.state = 'flee';
          ped.fleeT = 1.2;
          state.danger = { x: car.x, y: car.y, t: state.time };
          break;
        }
      }
      // The player sprinting with a gun out is worth avoiding too.
      if (p.weapon !== 'fists' && !p.car && dist(ped.x, ped.y, p.x, p.y) < 120) {
        ped.state = 'flee';
        ped.fleeT = 1.4;
        state.danger = { x: p.x, y: p.y, t: state.time };
      }
    }

    // Turn toward the wanted heading, then move with collision.
    let delta = ((wantAngle - ped.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    ped.angle += clamp(delta, -6 * dt, 6 * dt);
    ped.speed += (wantSpeed - ped.speed) * Math.min(1, dt * 6);
    ped.stepPhase += ped.speed * dt * 0.11;
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    const res = collideCircle(state.world, nx, ny, 10);
    ped.x = res.x;
    ped.y = res.y;
    ped.panic = Math.max(0, ped.panic - dt * 0.4);
  }
}

/** Damage a pedestrian; at zero they go down. Returns true if they fell. */
export function hurtPed(state, ped, dmg, fromX, fromY) {
  ped.hp -= dmg;
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.fadeT = 0;
    ped.speed = 0;
    return true;
  }
  if (ped.state === 'hostile') return false; // stands his ground; see stepPeds
  ped.state = 'flee';
  ped.fleeT = 3;
  state.danger = { x: fromX, y: fromY, t: state.time };
  return false;
}
