// police.js — the Sunset Bay PD: heat and stars, the dispatcher that sends
// units with callsigns and roles, pursuit/intercept/roadblock driving, the
// helicopter at four stars, and the search that cools when you break sight.

import { CALLSIGNS, UNIT_ROLES, districtAt } from './config.js';
import { createCar, stepCarPhysics, streetPointNear, carRadius } from './vehicles.js';
import { lineOfSight } from './world.js';
import { angleDelta, clamp, dist } from './rng.js';
import { queueToast } from './ambient.js';

export const HEAT_PER_STAR = 100;
export const MAX_HEAT = 500;

/** How many patrol cars the dispatcher wants on the player, per star. */
const WANTED_CARS = [0, 1, 2, 3, 4, 6, 7];

export function createPolice() {
  return {
    heat: 0,
    stars: 0,
    seenT: 99,          // seconds since a unit last had eyes on the player
    lastSeen: { x: 0, y: 0 },
    crime: { x: 0, y: 0, t: -99 },
    units: [],          // {car, callsign, role, status, shotT}
    spawnT: 0,
    callsignIdx: 0,
    bustT: 0,           // seconds a unit has held the player at gunpoint range
  };
}

/** Register a crime: raises heat, remembers where, refreshes the search. */
export function addHeat(state, amount, x, y) {
  const pol = state.police;
  pol.heat = clamp(pol.heat + amount, 0, MAX_HEAT);
  pol.crime = { x, y, t: state.time };
  pol.lastSeen = { x, y };
  pol.seenT = Math.min(pol.seenT, 1.5);
  state.stats.crimes += 1;
}

/** Directly set the wanted level (debug hooks and mission staging). */
export function setHeat(state, heat) {
  state.police.heat = clamp(heat, 0, MAX_HEAT);
  state.police.seenT = 0;
  state.police.lastSeen = { x: state.player.x, y: state.player.y };
}

function desiredCars(stars) {
  return WANTED_CARS[clamp(stars, 0, 5) + (stars >= 5 ? 1 : 0)] ?? WANTED_CARS[stars];
}

/* ------------------------------------------------------------------ */
/* Dispatch chatter: the radio net the player is not supposed to hear. */
/* ------------------------------------------------------------------ */

const DISPATCH_LINES = [
  (u, d) => `DISPATCH: ${u.callsign}, respond — suspect reported in ${d}.`,
  (u, d) => `DISPATCH: All units, BOLO out of ${d}. ${u.callsign}, you are closest.`,
  (u, d) => `${u.callsign}: En route, two minutes out. Keep him in ${d}.`,
  (u, d) => `DISPATCH: ${u.callsign}, the bay is watching. Bring this one in.`,
];
const SIGHT_LINES = [
  (u, d) => `${u.callsign}: I have eyes on the suspect — ${d}, moving fast!`,
  (u, d) => `${u.callsign}: Visual confirmed. He is not stopping for anybody.`,
  (u, d) => `${u.callsign}: There he is! ${d} — all units converge.`,
];
const LOST_LINES = [
  (u, d) => `${u.callsign}: Lost visual — he gave us the slip in ${d}.`,
  (u, d) => `DISPATCH: Units, fan out. He is still in ${d} somewhere.`,
  (u, d) => `${u.callsign}: Negative contact. Searching ${d}.`,
];

/** Say one radio line if the net has been quiet for a while. */
function chatter(rng, state, unit, pool) {
  if (state.time < (state.chatterT || 0)) return;
  state.chatterT = state.time + rng.range(6, 11);
  const d = districtAt(state.player.x, state.player.y).name;
  queueToast(state, pool[rng.int(0, pool.length - 1)](unit, d), 4.2);
}

function spawnUnit(rng, state) {
  const pol = state.police;
  const p = state.player;
  const wantHeli = pol.stars >= 4 && !pol.units.some((u) => u.car.driver === 'heli');
  if (wantHeli) {
    const heli = createCar(rng, 'heli', p.x + 420, p.y - 380, 0, { driver: 'heli' });
    pol.units.push({ car: heli, callsign: 'AIR-1', role: 'AIR SUPPORT', status: 'EN ROUTE', shotT: 0 });
    state.cars.push(heli);
    return;
  }
  const spot = streetPointNear(rng, p.x, p.y, 760, 1020);
  if (!spot) return;
  const model = rng.chance(0.72) ? 'police' : 'policesuv';
  const car = createCar(rng, model, spot.x, spot.y, spot.angle, { driver: 'police' });
  car.axis = spot.axis;
  car.dir = spot.dir;
  const carCount = pol.units.filter((u) => u.car.driver === 'police').length;
  let role = 'PURSUIT';
  if (carCount === 1) role = 'INTERCEPT';
  else if (carCount === 2) role = pol.stars >= 4 ? 'ROADBLOCK' : 'SUPPORT';
  else if (carCount === 4) role = 'INTERCEPT';
  const callsign = CALLSIGNS[pol.callsignIdx++ % CALLSIGNS.length];
  const unit = { car, callsign, role, status: 'EN ROUTE', shotT: rng.range(0.4, 1.4), blockPoint: null };
  pol.units.push(unit);
  state.cars.push(car);
  chatter(rng, state, unit, DISPATCH_LINES);
}

/** Does this unit currently see the player? */
function unitSees(state, unit) {
  const p = state.player;
  const car = unit.car;
  const d = dist(car.x, car.y, p.x, p.y);
  if (car.driver === 'heli') return d < 760;
  if (d > 580) return false;
  return lineOfSight(state.world, car.x, car.y, p.x, p.y);
}

/** Steering for a police car: chase, intercept, or hold a roadblock point. */
function policeDrive(state, unit, dt) {
  const p = state.player;
  const car = unit.car;
  let tx = p.x;
  let ty = p.y;
  let arrive = 26;

  if (unit.role === 'PURSUIT' || unit.role === undefined) {
    // Tail at a working gap, not inside the suspect's boot: when close,
    // aim at a point behind him and match pace there. Every unit takes
    // its OWN slot in the queue — staggered gaps and alternating sides —
    // because five cars aiming at one tail point form a knot, not a
    // pursuit. At four stars the lead unit's aim shifts to the suspect's
    // rear quarter: the set-up for a PIT that never quite lands.
    const pa = p.car ? p.car.angle : p.angle;
    const gap = dist(car.x, car.y, p.x, p.y);
    if (gap < 300) {
      const slot = state.police.units.indexOf(unit);
      const back = 118 + Math.max(0, slot) * 92;
      const side = (slot % 2 === 0 ? 1 : -1) * Math.min(slot, 2) * 15;
      const quarter = state.police.stars >= 4 && slot === 0 && gap < 170 ? 0.5 : 0;
      tx = p.x - Math.cos(pa) * back + Math.cos(pa + Math.PI / 2) * (side + quarter * 34);
      ty = p.y - Math.sin(pa) * back + Math.sin(pa + Math.PI / 2) * (side + quarter * 34);
      arrive = 34;
    }
  } else if (unit.role === 'INTERCEPT') {
    const pvx = p.car ? Math.cos(p.car.angle) * p.car.speed : 0;
    const pvy = p.car ? Math.sin(p.car.angle) * p.car.speed : 0;
    const lead = clamp(dist(car.x, car.y, p.x, p.y) / 340, 0, 1.6);
    tx = p.x + pvx * lead;
    ty = p.y + pvy * lead;
  } else if (unit.role === 'SUPPORT') {
    const side = unit.callsign.charCodeAt(0) % 2 === 0 ? 1 : -1;
    const pa = p.car ? p.car.angle : p.angle;
    tx = p.x + Math.cos(pa + side * 1.9) * 190;
    ty = p.y + Math.sin(pa + side * 1.9) * 190;
  } else if (unit.role === 'ROADBLOCK') {
    if (!unit.blockPoint) {
      const pa = p.car ? p.car.angle : p.angle;
      unit.blockPoint = { x: p.x + Math.cos(pa) * 520, y: p.y + Math.sin(pa) * 520, t: state.time };
    }
    const bp = unit.blockPoint;
    tx = bp.x;
    ty = bp.y;
    arrive = 60;
    if (state.time - bp.t > 9 || dist(car.x, car.y, bp.x, bp.y) < 55) {
      // Set (or re-set) the block: sit across the road, engine on.
      if (dist(car.x, car.y, bp.x, bp.y) < 55) {
        car.brakeHold = true;
        return { throttle: 0, steer: 0, brake: true };
      }
      if (state.time - bp.t > 9) unit.blockPoint = null;
    }
    car.brakeHold = false;
  }

  const want = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.6, -1, 1);
  const d = dist(car.x, car.y, tx, ty);
  let throttle = 1;
  if (d < arrive) throttle = -0.3;
  else if (d < 120) throttle = 0.45;
  // Don't plough through the player's car at full tilt from behind a wall of traffic.
  if (Math.abs(delta) > 2.4) throttle = -0.7;
  return { throttle, steer, brake: false };
}

function stepHeli(state, unit, dt) {
  const p = state.player;
  const heli = unit.car;
  // A staged pin (screenshot choreography) holds the heli on a fixed
  // station relative to the player instead of flying the orbit.
  if (state.pinHeli) {
    heli.x = p.x + state.pinHeli.dx;
    heli.y = p.y + state.pinHeli.dy;
    heli.angle = Math.atan2(p.y - heli.y, p.x - heli.x);
    heli.speed = 0;
    heli.siren += dt * 22;
    return;
  }
  // Orbit the player at a close radius; the light does the intimidating.
  const orbit = state.time * 0.24 + 1.2;
  const tx = p.x + Math.cos(orbit) * 168;
  const ty = p.y + Math.sin(orbit) * 168;
  const want = Math.atan2(ty - heli.y, tx - heli.x);
  heli.angle += clamp(angleDelta(heli.angle, want), -1.6 * dt, 1.6 * dt);
  const d = dist(heli.x, heli.y, tx, ty);
  const sp = clamp(d * 2.4, 0, heli.model.top);
  heli.speed += (sp - heli.speed) * Math.min(1, dt * 2);
  heli.x += Math.cos(heli.angle) * heli.speed * dt;
  heli.y += Math.sin(heli.angle) * heli.speed * dt;
  heli.siren += dt * 22;
}

/** One police step: heat bookkeeping, dispatch, driving, gunfire, bust pressure. */
export function stepPolice(rng, state, dt) {
  const pol = state.police;
  const p = state.player;
  pol.stars = pol.heat <= 0 ? 0 : Math.min(5, Math.ceil(pol.heat / HEAT_PER_STAR));

  // Eyes on the player?
  let anySee = false;
  for (const unit of pol.units) {
    const sees = unitSees(state, unit);
    const prev = unit.status;
    unit.status = sees ? 'IN SIGHT' : pol.seenT < 9 ? 'SEARCHING' : 'EN ROUTE';
    if (unit.status === 'IN SIGHT' && prev !== 'IN SIGHT') chatter(rng, state, unit, SIGHT_LINES);
    if (unit.status === 'SEARCHING' && prev === 'IN SIGHT') chatter(rng, state, unit, LOST_LINES);
    if (sees) {
      anySee = true;
      pol.lastSeen = { x: p.x, y: p.y };
    }
  }
  if (pol.stars > (state.stats.maxStars || 0)) state.stats.maxStars = pol.stars;
  if (anySee) pol.seenT = 0;
  else pol.seenT += dt;

  // Heat cools while unseen, faster far from the last crime scene.
  if (pol.heat > 0 && pol.seenT > 5) {
    const far = dist(p.x, p.y, pol.crime.x, pol.crime.y) > 700 ? 1.8 : 1;
    pol.heat = Math.max(0, pol.heat - dt * 5.2 * far);
  }

  // Dispatch. A quiet city (staged scenes) gets the units it was given —
  // the dispatcher sends no fresh cars into a choreographed frame.
  pol.spawnT -= dt;
  const carUnits = pol.units.filter((u) => u.car.driver === 'police').length;
  if (!state.quietCity && pol.stars >= 1 && pol.spawnT <= 0 && (carUnits < desiredCars(pol.stars) || (pol.stars >= 4 && !pol.units.some((u) => u.car.driver === 'heli')))) {
    spawnUnit(rng, state);
    pol.spawnT = 1.1;
  }
  // Units give up and peel off when the heat is gone.
  if (pol.stars === 0) {
    for (const unit of pol.units) {
      unit.car.driver = 'traffic';
      unit.car.cruise = 170;
    }
    pol.units = [];
  }
  // Retire units left far behind.
  pol.units = pol.units.filter((unit) => {
    const far = dist(unit.car.x, unit.car.y, p.x, p.y) > 2800;
    if (far) unit.car.dead = true;
    return !far;
  });

  // Drive and, at three stars up, shoot from stopped cars at close range.
  let bustPressure = false;
  for (const unit of pol.units) {
    const car = unit.car;
    if (car.driver === 'heli') {
      stepHeli(state, unit, dt);
      continue;
    }
    if (car.hp <= 0) continue;
    const drive = policeDrive(state, unit, dt);
    stepCarPhysics(state.world, car, dt, drive.throttle, drive.steer, drive.brake);
    car.siren += dt * 9;
    // Steel is steel: a unit may lean on the suspect's car, never merge
    // into it. Push the unit back out along the line between them.
    if (p.car) {
      const minD = (carRadius(car) + carRadius(p.car)) * 0.82;
      const dd = dist(car.x, car.y, p.car.x, p.car.y);
      if (dd < minD && dd > 0.01) {
        const push = (minD - dd);
        car.x += ((car.x - p.car.x) / dd) * push;
        car.y += ((car.y - p.car.y) / dd) * push;
        if (car.speed > p.car.speed) car.speed = p.car.speed;
      }
    }

    const d = dist(car.x, car.y, p.x, p.y);
    // Gunfire: a stopped unit with a clear shot at a 3+ star player.
    unit.shotT -= dt;
    if (pol.stars >= 3 && !p.car && d < 265 && Math.abs(car.speed) < 26 && unit.status === 'IN SIGHT' && unit.shotT <= 0) {
      unit.shotT = rng.range(0.55, 1.05);
      const a = Math.atan2(p.y - car.y, p.x - car.x) + rng.range(-0.09, 0.09);
      state.bullets.push({ x: car.x, y: car.y - 4, vx: Math.cos(a) * 1350, vy: Math.sin(a) * 1350, life: 0.24, from: 'police', dmg: 9 });
      state.fx.push({ kind: 'muzzle', x: car.x + Math.cos(a) * 40, y: car.y + Math.sin(a) * 40, t: 0, ttl: 0.05 });
    }
    // Bust pressure: a near, slow unit while the player is on foot or stalled.
    const playerSlow = p.car ? Math.abs(p.car.speed) < 18 : true;
    if (d < 95 && Math.abs(car.speed) < 40 && playerSlow) bustPressure = true;
  }
  if (bustPressure && pol.stars >= 1) pol.bustT += dt;
  else pol.bustT = Math.max(0, pol.bustT - dt * 2);
}

/** Clear all heat instantly (respray, mission scripts, debug). */
export function clearHeat(state) {
  state.police.heat = 0;
  state.police.stars = 0;
  state.police.seenT = 99;
}
