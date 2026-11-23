// player.js — you: walking, sprinting, driving, stealing, shooting. The
// player is a person on foot or the driver of one car; every crime routes
// through the police module so the whole city reacts consistently.

import { WEAPONS } from './config.js';
import { stepCarPhysics } from './vehicles.js';
import { addHeat } from './police.js';
import { scarePeds, hurtPed, spawnPed } from './peds.js';
import { collideCircle, inWater } from './world.js';
import { clamp, dist } from './rng.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    hp: 100,
    armor: 0,
    car: null,
    weapon: 'fists',
    owned: { fists: true },
    ammo: { pistol: 0, smg: 0, shotgun: 0, rifle: 0 },
    speed: 0,
    stepPhase: 0,
    fireT: 0,
    swingT: 0,
    lastHurtT: -99,
    shirt: '#28418c',
    pants: '#22242c',
    skin: '#d99e6a',
  };
}

export function weaponDef(id) {
  return WEAPONS.find((w) => w.id === id);
}

/** Give a weapon with reserve ammo (shops, pickups, debug hooks). */
export function giveWeapon(state, id, ammo = 0) {
  const p = state.player;
  p.owned[id] = true;
  if (ammo) p.ammo[id] = (p.ammo[id] || 0) + ammo;
  p.weapon = id;
}

/** Damage the player; armor soaks 60%. Returns true when this kills. */
export function hurtPlayer(state, dmg) {
  const p = state.player;
  const soaked = Math.min(p.armor, dmg * 0.6);
  p.armor -= soaked;
  p.hp -= dmg - soaked;
  p.lastHurtT = state.time;
  state.fx.push({ kind: 'hurt', x: p.x, y: p.y, t: 0, ttl: 0.25 });
  return p.hp <= 0;
}

function fireWeapon(rng, state, aimAngle) {
  const p = state.player;
  const def = weaponDef(p.weapon);
  p.fireT = 1 / def.rate;
  if (def.id === 'fists') {
    p.swingT = 0.22;
    // A swing connects with whatever is in front: a person, or a car's panel.
    const tx = p.x + Math.cos(p.angle) * 40;
    const ty = p.y + Math.sin(p.angle) * 40;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && dist(tx, ty, ped.x, ped.y) < 34) {
        hurtPed(state, ped, def.dmg, p.x, p.y);
        addHeat(state, 30, p.x, p.y);
        state.fx.push({ kind: 'hit', x: ped.x, y: ped.y, t: 0, ttl: 0.2 });
        return;
      }
    }
    for (const car of state.cars) {
      if (car.driver !== 'heli' && dist(tx, ty, car.x, car.y) < car.model.len * 0.55) {
        car.hp -= def.dmg * 0.5;
        state.fx.push({ kind: 'spark', x: tx, y: ty, t: 0, ttl: 0.25 });
        return;
      }
    }
    return;
  }
  if ((p.ammo[def.id] || 0) <= 0) {
    state.fx.push({ kind: 'click', x: p.x, y: p.y, t: 0, ttl: 0.1 });
    p.fireT = 0.3;
    return;
  }
  p.ammo[def.id] -= 1;
  const pellets = def.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const a = aimAngle + rng.range(-def.spread, def.spread) + (pellets > 1 ? (i - (pellets - 1) / 2) * 0.045 : 0);
    state.bullets.push({
      x: p.x + Math.cos(aimAngle) * 26,
      y: p.y + Math.sin(aimAngle) * 26,
      vx: Math.cos(a) * def.speed,
      vy: Math.sin(a) * def.speed,
      life: def.range / def.speed,
      from: 'player',
      dmg: def.dmg,
    });
  }
  state.fx.push({ kind: 'muzzle', x: p.x + Math.cos(aimAngle) * 30, y: p.y + Math.sin(aimAngle) * 30, t: 0, ttl: 0.05 });
  state.fx.push({ kind: 'shell', x: p.x, y: p.y, t: 0, ttl: 0.5, vx: rng.range(-30, 30), vy: rng.range(-50, -10) });
  scarePeds(state, p.x, p.y, 320);
  state.danger = { x: p.x, y: p.y, t: state.time };
  addHeat(state, 22, p.x, p.y);
  state.stats.shotsFired += pellets;
  state.audio?.shot?.(def.id);
}

/** Try to enter the nearest car, or leave the current one. */
export function toggleCar(rng, state) {
  const p = state.player;
  if (p.car) {
    const car = p.car;
    car.driver = car.wasParked ? 'parked' : 'traffic';
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.model.wid / 2 + 22);
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.model.wid / 2 + 22);
    const res = collideCircle(state.world, p.x, p.y, 11);
    p.x = res.x;
    p.y = res.y;
    p.car = null;
    state.audio?.door?.();
    return;
  }
  let best = null;
  let bestD = 92;
  for (const car of state.cars) {
    if (car.driver === 'heli' || car.hp <= -40) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  const wasOccupied = best.driver === 'traffic';
  best.wasParked = best.driver === 'parked';
  if (wasOccupied) {
    // Yank the driver out; they run, and everyone saw it.
    const driver = spawnPed(rng, state, best.x - Math.cos(best.angle) * 10, best.y - Math.sin(best.angle) * 10, { state: 'flee' });
    driver.fleeT = 3.2;
    state.danger = { x: p.x, y: p.y, t: state.time };
    scarePeds(state, p.x, p.y, 240);
    addHeat(state, 55, p.x, p.y);
    state.stats.carjacks += 1;
    best.doorOpen = 1;
  } else if (best.driver === 'parked') {
    addHeat(state, 14, p.x, p.y);
    state.stats.carjacks += 1;
  }
  best.driver = 'player';
  best.speed = Math.min(best.speed, 40);
  p.car = best;
  state.audio?.door?.();
}

/**
 * Advance the player one step. input: {keys:Set, actions:flags, attack:bool,
 * aim:{x,y}|null} — aim is a world point the player faces when present.
 * Actions consumed here: INTERACT (enter/leave car).
 */
export function stepPlayer(rng, state, dt, input) {
  const p = state.player;
  p.fireT -= dt;
  p.swingT -= dt;
  if (input.actions & 2) toggleCar(rng, state); // ACT_INTERACT

  if (p.car) {
    const car = p.car;
    let throttle = 0;
    let steer = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp') || state.holdDrive) throttle += 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) throttle -= 1;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) steer -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) steer += 1;
    const brake = input.keys.has('Space');
    // The horn (H): two tones of pure civic authority. Peds startle
    // clear of the bumper; nobody has ever been run over politely.
    if (input.actions & 64) { // ACT_HONK
      state.audio?.horn?.();
      scarePeds(state, car.x + Math.cos(car.angle) * 60, car.y + Math.sin(car.angle) * 60, 130);
    }
    const impact = stepCarPhysics(state.world, car, dt, throttle, steer, brake);
    if (impact > 190) hurtPlayer(state, (impact - 180) * 0.05);
    if (impact > 120) {
      addHeat(state, 18, car.x, car.y);
      state.fx.push({ kind: 'crash', x: car.x, y: car.y, t: 0, ttl: 0.4 });
      state.camera.shake = Math.min(10, (impact - 110) * 0.05);
      state.audio?.crash?.(impact);
    }
    // Running someone down is the loudest crime there is.
    for (const ped of state.peds) {
      if (ped.state !== 'down' && Math.abs(car.speed) > 90 && dist(ped.x, ped.y, car.x, car.y) < car.model.wid * 0.62) {
        hurtPed(state, ped, 100, car.x, car.y);
        addHeat(state, 85, car.x, car.y);
        state.fx.push({ kind: 'hit', x: ped.x, y: ped.y, t: 0, ttl: 0.3 });
      }
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = Math.abs(car.speed);
    car.doorOpen = Math.max(0, car.doorOpen - dt * 2);
    return;
  }

  // On foot.
  let mx = 0;
  let my = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) my -= 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) my += 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mx -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const aiming = !!input.aim;
  // The bay is swimmable: past the waterline the pavement rules end —
  // strokes instead of strides, no shooting with wet powder, and a slow
  // drift back toward the sand if you stop paddling.
  const swimming = inWater(p.x, p.y);
  p.swimming = swimming;
  const speed = swimming ? 96 : aiming ? 105 : sprint ? 268 : 178;
  if (moving) {
    const len = Math.hypot(mx, my);
    const vx = (mx / len) * speed;
    const vy = (my / len) * speed;
    const res = collideCircle(state.world, p.x + vx * dt, p.y + vy * dt, 11);
    p.x = res.x;
    p.y = res.y;
    p.speed = speed;
    p.stepPhase += dt * (swimming ? 7 : sprint ? 13 : 10);
    if (!aiming) p.angle = Math.atan2(vy, vx);
    if (swimming && rng.chance(dt * 3)) {
      state.fx.push({ kind: 'ripple', x: p.x + rng.range(-8, 8), y: p.y + rng.range(-8, 8), t: 0, ttl: 1.1 });
    }
  } else {
    p.speed = 0;
    if (swimming) {
      // The tide is polite but persistent: it walks you back to the sand.
      p.x -= 7 * dt;
      p.stepPhase += dt * 2;
    }
  }
  if (aiming) p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
  if (input.attack && p.fireT <= 0 && !swimming) fireWeapon(rng, state, p.angle);
  void clamp;
}
