// vehicles.js — every car in Sunset Bay: the factory, the shared driving
// physics (player, traffic and police all steer through the same code), the
// traffic system that keeps the streets alive, and collision with the city.

import { VEHICLES, BLOCK, WORLD_W, WORLD_H, WATER_X } from './config.js';
import { collideCircle, onRoad } from './world.js';
import { angleDelta, clamp, dist } from './rng.js';

let nextCarId = 1;

/** Build a car. opts: {driver, color, hp} — driver is traffic|parked|police|player|heli|mission. */
export function createCar(rng, modelId, x, y, angle, opts = {}) {
  const model = VEHICLES[modelId];
  const car = {
    id: nextCarId++,
    modelId,
    model,
    x, y, angle,
    speed: 0,
    steerVis: 0,
    color: opts.color ?? model.colors[Math.floor(rng.next() * model.colors.length)],
    hp: opts.hp ?? model.hp,
    maxHp: model.hp,
    driver: opts.driver ?? 'traffic',
    // traffic brain
    axis: Math.abs(Math.sin(angle)) > 0.7 ? 'v' : 'h',
    dir: 1,
    cruise: 150 + rng.next() * 70,
    turnCooldown: 0,
    stuck: 0,
    doorOpen: 0,
    siren: rng.next() * 6.28,
    dead: false,
    smokeT: 0,
  };
  car.dir = car.axis === 'h' ? (Math.cos(angle) >= 0 ? 1 : -1) : (Math.sin(angle) >= 0 ? 1 : -1);
  return car;
}

/** Collision radius used against buildings — a forgiving circle at the centre. */
export function carRadius(car) {
  return car.model.len * 0.34;
}

/**
 * Advance one car's physics for dt seconds given throttle (-1..1), steer
 * (-1..1) and handbrake. Returns the impact speed if it struck a building.
 */
export function stepCarPhysics(world, car, dt, throttle, steer, handbrake = false) {
  const m = car.model;
  if (car.hp <= 0) throttle = 0;
  // Remembered for the renderer: brake lights are a fact about this
  // frame, decided here where the pedals actually are.
  car.braking = throttle < 0 || handbrake;
  const accel = throttle >= 0 ? m.accel : m.accel * 0.55;
  // Wet roads (weather.js sets gripMul) soften both launch and steering.
  car.speed += throttle * accel * (car.gripMul ?? 1) * dt;
  // Rolling drag and brakes.
  const drag = handbrake ? 620 : 60;
  if (throttle === 0 || handbrake) {
    const sign = Math.sign(car.speed);
    car.speed -= sign * Math.min(Math.abs(car.speed), drag * dt);
  }
  car.speed -= car.speed * 0.12 * dt;
  car.speed = clamp(car.speed, -90, m.top);
  // Steering bites with speed; reversing flips it, as a real wheel does.
  const speedFactor = clamp(Math.abs(car.speed) / 120, 0, 1);
  car.angle += steer * m.grip * (car.gripMul ?? 1) * speedFactor * dt * (car.speed < 0 ? -1 : 1) * clamp(Math.abs(car.speed) / m.top, 0.25, 1);
  car.steerVis += ((steer || 0) - car.steerVis) * Math.min(1, dt * 8);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const res = collideCircle(world, nx, ny, carRadius(car));
  let impact = 0;
  if (res.hit) {
    const closing = Math.abs(car.speed);
    if (closing > 60) {
      impact = closing;
      car.hp -= (closing - 50) * 0.16;
    }
    car.speed = -car.speed * 0.22;
  }
  car.x = res.x;
  car.y = res.y;
  return impact;
}

/** The lane centre-line offset for a car travelling its current axis/dir. */
function lanePoint(car) {
  // Look ahead along the current street to the point the car should aim at.
  const ahead = 190;
  if (car.axis === 'h') {
    const line = Math.round(car.y / BLOCK) * BLOCK;
    const laneY = line + (car.dir > 0 ? 34 : -34);
    return { x: car.x + car.dir * ahead, y: laneY };
  }
  const line = Math.round(car.x / BLOCK) * BLOCK;
  const laneX = line + (car.dir > 0 ? -34 : 34);
  return { x: laneX, y: car.y + car.dir * ahead };
}

/** The next intersection centre ahead of the car, if it is close. */
function nearIntersection(car) {
  if (car.axis === 'h') {
    const next = car.dir > 0 ? Math.ceil(car.x / BLOCK) * BLOCK : Math.floor(car.x / BLOCK) * BLOCK;
    if (Math.abs(next - car.x) < 120 && next > 0 && next < WORLD_W) return { x: next, y: Math.round(car.y / BLOCK) * BLOCK };
  } else {
    const next = car.dir > 0 ? Math.ceil(car.y / BLOCK) * BLOCK : Math.floor(car.y / BLOCK) * BLOCK;
    if (Math.abs(next - car.y) < 120 && next > 0 && next < WORLD_H) return { x: Math.round(car.x / BLOCK) * BLOCK, y: next };
  }
  return null;
}

/**
 * The traffic brain: returns {throttle, steer} for one step. Cars follow
 * their lane, turn at intersections, slow for the car in front and stop
 * (briefly, angrily) when the player stands in the road ahead of them.
 */
export function trafficThink(rng, state, car, dt) {
  // Pulling out: a parked car whose owner just came back noses out of its
  // bay and makes for the nearest street point; on the street it becomes
  // ordinary traffic and the bay is just a memory.
  if (car.driver === 'leaving' && car.leaveTarget) {
    const t = car.leaveTarget;
    const want = Math.atan2(t.y - car.y, t.x - car.x);
    const delta = angleDelta(car.angle, want);
    const d = dist(car.x, car.y, t.x, t.y);
    if (d < 30) {
      car.driver = 'traffic';
      car.axis = t.axis;
      car.dir = t.dir;
      car.leaveTarget = null;
    }
    return { throttle: d > 30 ? 0.55 : 0, steer: clamp(delta * 2.2, -1, 1) };
  }
  car.turnCooldown -= dt;
  const inter = nearIntersection(car);
  if (inter && car.turnCooldown <= 0) {
    const roll = rng.next();
    if (roll < 0.34) {
      // Turn: swap axis, keep the sense of the turn (left or right).
      const left = roll < 0.17;
      const oldDir = car.dir;
      if (car.axis === 'h') {
        car.axis = 'v';
        car.dir = left ? -oldDir : oldDir;
        car.y = inter.y + (car.dir > 0 ? 0 : 0);
      } else {
        car.axis = 'h';
        car.dir = left ? oldDir : -oldDir;
      }
      car.turnCooldown = 2.2;
    } else {
      car.turnCooldown = 0.8;
    }
  }
  const target = lanePoint(car);
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  const delta = angleDelta(car.angle, want);
  let steer = clamp(delta * 2.4, -1, 1);
  let throttle = car.speed < car.cruise ? 0.75 : 0;

  // Keep off the car in front and out of the player's face.
  for (const other of state.cars) {
    if (other === car || other.driver === 'heli') continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 120) {
      const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
      if (ahead > 20) { throttle = -0.4; break; }
    }
  }
  const p = state.player;
  if (!p.car) {
    const d = dist(car.x, car.y, p.x, p.y);
    if (d < 110) {
      const ahead = Math.cos(car.angle) * (p.x - car.x) + Math.sin(car.angle) * (p.y - car.y);
      if (ahead > 10) throttle = -0.5;
    }
  }
  if (Math.abs(car.speed) < 4 && throttle <= 0) {
    car.stuck += dt;
    if (car.stuck > 2.5) { throttle = 0.8; car.stuck = 0; }
  } else car.stuck = 0;
  return { throttle, steer };
}

const TRAFFIC_MODELS = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'muscle', 'truck', 'sedan'];

/** A random street point at distance [minD, maxD] from (x, y), on a lane. */
export function streetPointNear(rng, x, y, minD, maxD) {
  for (let tries = 0; tries < 24; tries++) {
    const a = rng.next() * Math.PI * 2;
    const d = minD + rng.next() * (maxD - minD);
    const px = clamp(x + Math.cos(a) * d, 60, WATER_X - 80);
    const py = clamp(y + Math.sin(a) * d, 60, WORLD_H - 60);
    if (!onRoad(px, py)) continue;
    // Snap to the nearest lane.
    const mx = ((px % BLOCK) + BLOCK) % BLOCK;
    const my = ((py % BLOCK) + BLOCK) % BLOCK;
    const nearV = Math.min(mx, BLOCK - mx) < 90;
    const nearH = Math.min(my, BLOCK - my) < 90;
    if (nearV && !nearH) {
      const line = Math.round(px / BLOCK) * BLOCK;
      const dir = rng.chance(0.5) ? 1 : -1;
      return { x: line + (dir > 0 ? -34 : 34), y: py, angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2, axis: 'v', dir };
    }
    if (nearH) {
      const line = Math.round(py / BLOCK) * BLOCK;
      const dir = rng.chance(0.5) ? 1 : -1;
      return { x: px, y: line + (dir > 0 ? 34 : -34), angle: dir > 0 ? 0 : Math.PI, axis: 'h', dir };
    }
  }
  return null;
}

/** Keep ~14 civilian cars circulating within reach of the player; recycle the far ones. */
export function maintainTraffic(rng, state) {
  const p = state.player;
  // A quiet city (staged scenes) keeps the cars it has; nobody new drives in.
  if (state.quietCity) return;
  let traffic = state.cars.filter((c) => c.driver === 'traffic');
  for (const car of traffic) {
    if (dist(car.x, car.y, p.x, p.y) > 2500) car.dead = true;
  }
  state.cars = state.cars.filter((c) => !c.dead);
  traffic = state.cars.filter((c) => c.driver === 'traffic');
  if (traffic.length < 14) {
    // Sometimes the new arrival is not new at all: a parked car's owner
    // returns, and the car pulls out of its bay into the traffic flow.
    if (rng.chance(0.35)) {
      const candidates = state.cars.filter((c) => c.driver === 'parked'
        && dist(c.x, c.y, p.x, p.y) > 380 && dist(c.x, c.y, p.x, p.y) < 1150);
      if (candidates.length > 0) {
        const car = candidates[rng.int(0, candidates.length - 1)];
        const spot = streetPointNear(rng, car.x, car.y, 30, 340);
        if (spot) {
          car.driver = 'leaving';
          car.leaveTarget = spot;
          return;
        }
      }
    }
    const spot = streetPointNear(rng, p.x, p.y, 850, 1250);
    if (spot) {
      const car = createCar(rng, TRAFFIC_MODELS[Math.floor(rng.next() * TRAFFIC_MODELS.length)], spot.x, spot.y, spot.angle, { driver: 'traffic' });
      car.axis = spot.axis;
      car.dir = spot.dir;
      state.cars.push(car);
    }
  }
}

/** Fill the world's marked parking spots with parked cars (once, at boot). */
export function spawnParked(rng, state) {
  for (const spot of state.world.parkSpots) {
    if (rng.chance(0.3)) continue;
    const model = TRAFFIC_MODELS[Math.floor(rng.next() * TRAFFIC_MODELS.length)];
    const car = createCar(rng, model, spot.x, spot.y, spot.angle + rng.range(-0.04, 0.04), { driver: 'parked' });
    state.cars.push(car);
  }
}
