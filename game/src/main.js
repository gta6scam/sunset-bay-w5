// main.js — Sunset Bay's heartbeat: boot, the fixed-step loop, the mode
// machine (menu / playing / paused / map / shop / busted-wasted), combat
// resolution, the camera, saves, and the window.SB hooks the maker's tools
// drive. Every other module is a specialist; this one conducts.

import { STEP, VIEW_W, VIEW_H, SAVE_KEY, WEAPONS } from './config.js';
import { createRandom, clamp, dist } from './rng.js';
import { buildWorld, buildingAt } from './world.js';

/** Nearest point to (x, y) with `pad` units of clearance from every building — mission markers and spawns are placed by eye, the city decides where they can stand. */
function nearestClear(world, x, y, pad = 16) {
  if (!buildingAt(world, x, y, pad)) return { x, y };
  for (let r = 24; r < 380; r += 24) {
    for (let a = 0; a < 12; a++) {
      const px = x + Math.cos((a / 12) * Math.PI * 2) * r;
      const py = y + Math.sin((a / 12) * Math.PI * 2) * r;
      if (!buildingAt(world, px, py, pad)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/** Move every hand-placed mission point onto open ground. */
function sanitizeMissions(world) {
  for (const m of MISSIONS) {
    const s = nearestClear(world, m.start.x, m.start.y);
    m.start.x = s.x; m.start.y = s.y;
    for (const stage of m.stages) {
      if (stage.x !== undefined) {
        const c = nearestClear(world, stage.x, stage.y);
        stage.x = c.x; stage.y = c.y;
      }
    }
  }
}
import { spawnParked, maintainTraffic, trafficThink, stepCarPhysics, carRadius } from './vehicles.js';
import { maintainPeds, stepPeds } from './peds.js';
import { createPolice, stepPolice, addHeat, setHeat, clearHeat } from './police.js';
import { createPlayer, stepPlayer, giveWeapon, hurtPlayer, weaponDef } from './player.js';
import { nearestShop, shopMenu, buyItem, keeperGreeting } from './shops.js';
import { stepMission, stepMissionCars, missionMarker, startMission, MISSIONS } from './missions.js';
import { createRenderer } from './render.js';
import * as hud from './hud.js';
import { createInput, ACT_CONFIRM, ACT_PAUSE, ACT_MAP, ACT_RADIO, ACT_USE } from './input.js';
import { createAudio } from './audio.js';
import { applyShot, shotName } from './shots.js';
import { stepAmbientCity, stepToastQueue, queueToast } from './ambient.js';
import { createWeather, stepWeather } from './weather.js';

const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261123;
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);

function freshStats() {
  return { missionsDone: 0, carjacks: 0, crimes: 0, shotsFired: 0, earned: 0, spent: 0, busted: 0, wasted: 0 };
}

function createState() {
  const world = buildWorld(rng);
  sanitizeMissions(world);
  const spawn = nearestClear(world, 700, 648, 40);
  const player = createPlayer(spawn.x, spawn.y);
  const state = {
    mode: 'menu',
    time: 0,
    hour: 10.4,
    day: 1,
    playT: 0,
    world,
    player,
    cars: [],
    peds: [],
    bullets: [],
    fx: [],
    skids: [],
    police: createPolice(),
    mission: null,
    story: { index: 0 },
    money: 250,
    rep: 0,
    stats: freshStats(),
    objective: 'Head to the gold marker for your first job',
    marker: null,
    camera: { x: 1500, y: 1150, zoom: 0.55, shake: 0 },
    camShot: null,
    banner: null,
    toast: null,
    danger: { x: 0, y: 0, t: -99 },
    shop: null,
    shopSel: 0,
    shopLine: '',
    shopLineT: 0,
    nearShop: null,
    radio: 0,
    radioT: 0,
    weather: createWeather(rng),
    holdDrive: false,
    fxLoop: null,
    fxLoopT: 0,
    sparkLoop: false,
    sparkT: 0,
    startHoldT: 0,
    saveDirty: false,
    saveT: 0,
    menuSel: 0,
    menuItems: [],
    overKind: null,
    overLine: '',
    spawnPoint: spawn,
    audio: createAudio(),
    light: null,
  };
  spawnParked(rng, state);
  for (let i = 0; i < 22; i++) {
    maintainTraffic(rng, state);
    maintainPeds(rng, state);
  }
  return state;
}

const state = createState();

// ------------------------------------------------------------- save / load
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const p = state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      rep: state.rep,
      storyIndex: state.story.index,
      stats: state.stats,
      stashes: state.world.stashes ? state.world.stashes.map((s, i) => (s.taken ? i : -1)).filter((i) => i >= 0) : [],
      playT: state.playT,
      player: { x: p.x, y: p.y, shirt: p.shirt, pants: p.pants, armor: p.armor, owned: p.owned, ammo: p.ammo },
    }));
  } catch { /* private mode: the story lasts the visit */ }
  state.saveDirty = false;
}

function applySave(save) {
  state.money = save.money ?? state.money;
  state.rep = save.rep ?? 0;
  state.story.index = save.storyIndex ?? 0;
  state.stats = { ...freshStats(), ...(save.stats || {}) };
  if (Array.isArray(save.stashes) && state.world.stashes) {
    for (const i of save.stashes) if (state.world.stashes[i]) state.world.stashes[i].taken = true;
  }
  state.playT = save.playT || 0;
  const p = state.player;
  if (save.player) {
    p.x = save.player.x ?? p.x;
    p.y = save.player.y ?? p.y;
    p.shirt = save.player.shirt ?? p.shirt;
    p.pants = save.player.pants ?? p.pants;
    p.armor = save.player.armor ?? 0;
    p.owned = save.player.owned ?? p.owned;
    p.ammo = save.player.ammo ?? p.ammo;
  }
  state.objective = 'Head to the gold marker for the next job';
}

function resetStory() {
  state.money = 250;
  state.rep = 0;
  state.story.index = 0;
  state.stats = freshStats();
  state.playT = 0;
  state.mission = null;
  if (state.world.stashes) for (const s of state.world.stashes) s.taken = false;
  clearHeat(state);
  const p = state.player;
  p.x = state.spawnPoint.x; p.y = state.spawnPoint.y; p.hp = 100; p.armor = 0; p.car = null;
  p.owned = { fists: true };
  p.ammo = { pistol: 0, smg: 0, shotgun: 0, rifle: 0 };
  p.weapon = 'fists';
  state.objective = 'Head to the gold marker for your first job';
  state.saveDirty = true;
}

// ------------------------------------------------------------------ menu
function buildMenu() {
  const save = readSave();
  state.savePeek = save;
  state.hasSave = !!save;
  const items = [{ label: 'NEW GAME', note: 'Rosa, the marina, and a first fare', act: 'new' }];
  if (save) items.push({ label: 'CONTINUE', note: `Job ${Math.min((save.storyIndex ?? 0) + 1, 15)}/15 — $${(save.money ?? 0).toLocaleString('en-US')} in your pocket`, act: 'continue' });
  items.push({ label: 'FREE ROAM', note: 'Skip the story — the bay is open', act: 'roam' });
  state.menuItems = items;
  state.menuSel = 0;
}
buildMenu();

function menuAction() {
  const item = state.menuItems[state.menuSel];
  if (!item) return;
  state.audio.unlock();
  if (item.act === 'new') resetStory();
  if (item.act === 'continue') {
    const save = readSave();
    if (save) applySave(save);
  }
  state.mode = 'playing';
  announce(item.act === 'new' ? 'New game. Rosa is waiting at the marina.' : 'Welcome back to Sunset Bay.');
}

function announce(msg) {
  if (status) status.textContent = msg;
}

// ---------------------------------------------------------------- combat
function stepBullets(dt) {
  const p = state.player;
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (buildingAt(state.world, b.x, b.y, -4)) {
      state.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, ttl: 0.18 });
      b.dead = true;
      continue;
    }
    if (b.from === 'player') {
      for (const car of state.cars) {
        if (car.driver === 'heli' || car === p.car) continue;
        if (dist(b.x, b.y, car.x, car.y) < car.model.len * 0.52) {
          car.hp -= b.dmg;
          state.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, ttl: 0.22 });
          if (car.driver === 'traffic' || car.driver === 'leaving') {
            addHeat(state, 26, b.x, b.y);
          }
          b.dead = true;
          break;
        }
      }
      if (b.dead) continue;
      for (const ped of state.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 13) {
          ped.hp -= b.dmg;
          if (ped.hp <= 0) {
            ped.state = 'down';
            ped.fadeT = 0;
            addHeat(state, 70, b.x, b.y);
          } else {
            ped.state = 'flee';
            ped.fleeT = 3;
            state.danger = { x: p.x, y: p.y, t: state.time };
          }
          state.fx.push({ kind: 'hit', x: ped.x, y: ped.y, t: 0, ttl: 0.22 });
          b.dead = true;
          break;
        }
      }
    } else if (b.from === 'police' || b.from === 'ped') {
      if (!p.car && dist(b.x, b.y, p.x, p.y) < 14) {
        hurtPlayer(state, b.dmg);
        b.dead = true;
      } else if (p.car && dist(b.x, b.y, p.car.x, p.car.y) < p.car.model.len * 0.5) {
        p.car.hp -= b.dmg * 0.7;
        state.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, ttl: 0.2 });
        b.dead = true;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);
}

function stepFx(dt) {
  for (const fx of state.fx) fx.t += dt;
  state.fx = state.fx.filter((fx) => fx.t < fx.ttl);
  for (const s of state.skids) s.t += dt;
  state.skids = state.skids.filter((s) => s.t < 16);
  // Damaged cars smoke.
  for (const car of state.cars) {
    if (car.driver === 'heli' || car.hp > car.maxHp * 0.35 || car.hp <= -60) continue;
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = 0.14;
      state.fx.push({ kind: 'smoke', x: car.x + (Math.random() - 0.5) * 20, y: car.y - 6, t: 0, ttl: 0.9 });
    }
  }
  // Screenshot theatre: a looping muzzle flash, and celebration sparks.
  if (state.fxLoop) {
    const p = state.player;
    const a = state.fxLoop.angle;
    state.fx.push({ kind: 'muzzle', x: p.x + Math.cos(a) * 32, y: p.y + Math.sin(a) * 32, t: 0, ttl: 0.07 });
    state.fxLoopT -= dt;
    if (state.fxLoopT <= 0) {
      state.fxLoopT = 0.42;
      for (let i = 0; i < 2; i++) {
        state.bullets.push({ x: p.x + Math.cos(a) * 28, y: p.y + Math.sin(a) * 28, vx: Math.cos(a + (i - 0.5) * 0.03) * 1500, vy: Math.sin(a + (i - 0.5) * 0.03) * 1500, life: 0.3, from: 'player', dmg: 4 });
      }
    }
  }
  if (state.sparkLoop) {
    state.sparkT -= dt;
    if (state.sparkT <= 0) {
      state.sparkT = 0.28;
      const p = state.player;
      state.fx.push({ kind: 'spark', x: p.x + (Math.random() - 0.5) * 190, y: p.y + (Math.random() - 0.5) * 130, t: 0, ttl: 0.34 });
    }
  }
}

// ---------------------------------------------------------------- camera
function stepCamera(dt) {
  const cam = state.camera;
  const p = state.player;
  if (state.mode === 'menu') {
    const t = state.time * 0.05;
    cam.x += ((1500 + Math.cos(t) * 620) - cam.x) * Math.min(1, dt * 0.7);
    cam.y += ((1200 + Math.sin(t * 0.8) * 420) - cam.y) * Math.min(1, dt * 0.7);
    cam.zoom += (0.52 - cam.zoom) * Math.min(1, dt * 0.7);
    return;
  }
  let tx = p.x;
  let ty = p.y;
  let tz = p.car ? 0.98 : 1.14;
  if (p.car) {
    tx += Math.cos(p.car.angle) * p.car.speed * 0.34;
    ty += Math.sin(p.car.angle) * p.car.speed * 0.34;
    if (Math.abs(p.car.speed) > 300) tz = 0.9;
  }
  if (state.camShot) {
    tz = state.camShot.zoom;
    tx = p.x + (state.camShot.leadX || 0);
    ty = p.y + (state.camShot.leadY || 0);
    cam.x += (tx - cam.x) * Math.min(1, dt * 14);
    cam.y += (ty - cam.y) * Math.min(1, dt * 14);
    cam.zoom += (tz - cam.zoom) * Math.min(1, dt * 10);
    return;
  }
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
  cam.zoom += (tz - cam.zoom) * Math.min(1, dt * 2.6);
  cam.shake = Math.max(0, cam.shake - dt * 22);
  cam.x = clamp(cam.x, 0, 5120);
  cam.y = clamp(cam.y, 0, 3840);
}

// ------------------------------------------------------------------ ends
function endRun(kind) {
  const p = state.player;
  state.mode = 'over';
  state.overKind = kind;
  if (kind === 'busted') {
    const fine = Math.min(state.money, 150 + state.police.stars * 120);
    state.money -= fine;
    state.stats.busted += 1;
    state.overLine = `The SBPD impound your wheels and fine you $${fine}. The bay keeps your story.`;
  } else {
    const loss = Math.floor(state.money * 0.1);
    state.money -= loss;
    state.stats.wasted += 1;
    state.overLine = `You wake at Old Town General, $${loss} lighter. The bay keeps your story.`;
  }
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  announce(kind === 'busted' ? 'Busted.' : 'Wasted.');
}

function respawn() {
  const p = state.player;
  p.x = 2430; p.y = 660; p.hp = 100; p.armor = 0;
  clearHeat(state);
  state.police.bustT = 0;
  state.mode = 'playing';
  state.saveDirty = true;
}

// ------------------------------------------------------------------ step
function stepPlaying(dt, actions) {
  const p = state.player;
  state.playT += dt;
  state.hour += dt * (24 / 900);
  if (state.hour >= 24) {
    state.hour -= 24;
    state.day += 1;
  }

  // Mode keys first.
  if (actions & ACT_MAP) { state.mode = 'map'; return; }
  if (actions & ACT_PAUSE) { state.mode = 'paused'; return; }
  if (actions & ACT_RADIO) {
    state.radio = (state.radio + 1) % 5;
    state.radioT = 3.2;
    state.djText = null;
  }
  const sel = input.takeWeaponSel();
  if (sel >= 0 && WEAPONS[sel] && p.owned[WEAPONS[sel].id]) p.weapon = WEAPONS[sel].id;

  // Dead drops: a stash within arm's reach on foot is simply taken —
  // no menu, no ceremony, just a quiet +$150 and a tally on the rap sheet.
  if (!p.car && state.world.stashes) {
    for (const stash of state.world.stashes) {
      if (!stash.taken && dist(p.x, p.y, stash.x, stash.y) < 26) {
        stash.taken = true;
        state.money += 150;
        state.stats.stashes = (state.stats.stashes || 0) + 1;
        state.stats.earned += 150;
        state.saveDirty = true;
        queueToast(state, `DEAD DROP — +$150 (${state.stats.stashes}/${state.world.stashes.length})`, 3.6);
        state.audio?.cash?.();
        for (let k = 0; k < 6; k++) {
          state.fx.push({ kind: 'spark', x: stash.x + rng.range(-9, 9), y: stash.y + rng.range(-9, 9), t: 0, ttl: rng.range(0.25, 0.5) });
        }
      }
    }
  }

  // Shops: E at the door opens the menu.
  state.nearShop = nearestShop(state);
  if ((actions & ACT_USE) && state.nearShop) {
    state.shop = shopMenu(state, state.nearShop);
    state.shopSel = 0;
    state.shopLine = keeperGreeting(state, state.nearShop);
    state.shopLineT = 999;
    state.mode = 'shop';
    return;
  }

  const aim = input.mouse.x || input.mouse.y
    ? { x: state.camera.x + (input.mouse.x - VIEW_W / 2) / state.camera.zoom, y: state.camera.y + (input.mouse.y - VIEW_H / 2) / state.camera.zoom }
    : null;
  stepPlayer(rng, state, dt, {
    keys: input.keys,
    actions,
    attack: input.attack(),
    aim: input.mouse.down ? aim : null,
  });

  stepMissionCars(rng, state, dt);
  stepMission(rng, state, dt);
  for (const car of state.cars) {
    if (car.driver === 'traffic' || car.driver === 'leaving') {
      const drive = trafficThink(rng, state, car, dt);
      stepCarPhysics(state.world, car, dt, drive.throttle, drive.steer, false);
    }
    // Skid marks from hard cornering.
    if (Math.abs(car.speed) > 190 && Math.abs(car.steerVis) > 0.45 && car.driver !== 'heli') {
      car.skidT = (car.skidT || 0) - dt;
      if (car.skidT <= 0) {
        car.skidT = 0.03;
        state.skids.push({ x: car.x - Math.cos(car.angle) * car.model.len * 0.3, y: car.y - Math.sin(car.angle) * car.model.len * 0.3, angle: car.angle, len: 16, t: 0 });
      }
    }
  }
  stepPolice(rng, state, dt);
  stepPeds(rng, state, dt);
  stepBullets(dt);
  // Wounded engines smoke: anything under a third of its health breathes
  // grey through the hood — the player's car included, fair warning.
  for (const car of state.cars) {
    if (car.driver === 'heli' || car.dead) continue;
    if (car.hp < car.maxHp * 0.34 && rng.chance(dt * 7)) {
      state.fx.push({
        kind: 'smoke',
        x: car.x + Math.cos(car.angle) * car.model.len * 0.32,
        y: car.y + Math.sin(car.angle) * car.model.len * 0.32,
        t: 0, ttl: rng.range(0.7, 1.2),
      });
    }
  }
  separateCars();
  maintainTraffic(rng, state);
  maintainPeds(rng, state);
  stepAmbientCity(rng, state, dt);
  stepWeather(rng, state, dt);

  if (state.police.bustT > 2.6) { endRun('busted'); return; }
  if (p.hp <= 0) { endRun('wasted'); return; }

  state.radioT = Math.max(0, state.radioT - dt);
  state.saveT += dt;
  if (state.saveDirty || state.saveT > 12) {
    state.saveT = 0;
    writeSave();
  }
}

/**
 * Cars are steel, not ghosts: no two driven cars may occupy the same
 * ground. Overlapping pairs are eased apart along the line between them
 * (parked cars are furniture — the moving one takes the whole push), and
 * the faster car sheds its excess speed into the slower one's pace.
 */
function separateCars() {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.driver === 'heli' || a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.driver === 'heli' || b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minD = (carRadius(a) + carRadius(b)) * 0.8;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / d;
      const aMovable = a.driver !== 'parked' && !a.brakeHold;
      const bMovable = b.driver !== 'parked' && !b.brakeHold;
      if (aMovable && bMovable) {
        a.x -= dx * push * 0.5; a.y -= dy * push * 0.5;
        b.x += dx * push * 0.5; b.y += dy * push * 0.5;
        const mid = (a.speed + b.speed) / 2;
        if (a.speed > mid) a.speed = mid;
        if (b.speed > mid) b.speed = mid;
      } else if (aMovable) {
        a.x -= dx * push; a.y -= dy * push;
        if (a.speed > 0) a.speed *= 0.6;
      } else if (bMovable) {
        b.x += dx * push; b.y += dy * push;
        if (b.speed > 0) b.speed *= 0.6;
      }
    }
  }
}

function stepAmbient(dt) {
  // The city breathes behind menus: traffic and people, no crime, no story.
  for (const car of state.cars) {
    if (car.driver === 'traffic' || car.driver === 'leaving') {
      const drive = trafficThink(rng, state, car, dt);
      stepCarPhysics(state.world, car, dt, drive.throttle, drive.steer, false);
    }
  }
  stepPeds(rng, state, dt);
  maintainTraffic(rng, state);
  maintainPeds(rng, state);
  stepAmbientCity(rng, state, dt);
  stepWeather(rng, state, dt);
}

function step(dt) {
  state.time += dt;
  const actions = input.takeActions();
  if (state.banner) state.banner.t += dt;
  if (state.toast) state.toast.t += dt;
  if (state.introCard) {
    state.introCard.t += dt;
    if (state.introCard.t >= state.introCard.ttl) state.introCard = null;
  }
  stepToastQueue(state);
  state.shopLineT = Math.max(0, state.shopLineT - dt);
  stepFx(dt);
  state.marker = missionMarker(state);

  switch (state.mode) {
    case 'menu': {
      const dir = input.takeMenuDir();
      if (dir) state.menuSel = (state.menuSel + dir + state.menuItems.length) % state.menuItems.length;
      if (actions & ACT_CONFIRM) menuAction();
      stepAmbient(dt);
      break;
    }
    case 'playing':
      stepPlaying(dt, actions);
      break;
    case 'paused':
      if (actions & ACT_PAUSE) state.mode = 'playing';
      if (actions & ACT_MAP) { state.pausedFromMap = true; state.mode = 'map'; }
      break;
    case 'map':
      if (actions & (ACT_MAP | ACT_PAUSE)) state.mode = state.pausedFromMap ? 'paused' : 'playing';
      state.pausedFromMap = false;
      break;
    case 'shop': {
      const dir = input.takeMenuDir();
      if (dir && state.shop) state.shopSel = (state.shopSel + dir + state.shop.items.length) % state.shop.items.length;
      if (actions & ACT_CONFIRM && state.shop) {
        const line = buyItem(state, state.shop, state.shopSel);
        if (line) {
          state.shopLine = line;
          state.shopLineT = 3.4;
          state.shop = shopMenu(state, state.shop.shop);
          state.saveDirty = true;
        }
      }
      if (actions & (ACT_USE | ACT_PAUSE)) {
        state.shop = null;
        state.mode = 'playing';
      }
      stepAmbient(dt);
      // The player waits at the counter; the police may still arrive.
      stepPolice(rng, state, dt);
      break;
    }
    case 'over':
      if (actions & ACT_CONFIRM) respawn();
      stepAmbient(dt);
      break;
    default:
      break;
  }
  stepCamera(dt);
  state.audio.update(state);
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  if (state.mode === 'map') {
    hud.drawMap(renderer.ctx, state);
  } else {
    renderer.drawWorld(state);
    const g = renderer.ctx;
    if (state.mode === 'menu') hud.drawMenu(g, state);
    else {
      hud.drawHUD(g, state);
      if (state.mode === 'paused') hud.drawPause(g, state);
      if (state.mode === 'shop') hud.drawShop(g, state);
      if (state.mode === 'over') hud.drawOver(g, state);
    }
  }
}

// ------------------------------------------------------------- shot mode
const shot = shotName();
if (shot) {
  state.mode = 'playing';
  applyShot(shot, {
    state,
    rng,
    setHour: (h) => { state.hour = h; },
    enterCar: (car) => {
      state.player.car = car;
      state.player.x = car.x;
      state.player.y = car.y;
    },
  });
  state.marker = missionMarker(state);
}

// ------------------------------------------------------------- debug hooks
window.SB = {
  state,
  get player() { return state.player; },
  get cars() { return state.cars; },
  get missionState() { return state.mission; },
  teleport(x, y) {
    state.player.x = x;
    state.player.y = y;
    if (state.player.car) {
      state.player.car.x = x;
      state.player.car.y = y;
    }
  },
  setWanted(stars) { setHeat(state, stars * 100); },
  giveGun() {
    giveWeapon(state, 'pistol', 90);
    giveWeapon(state, 'smg', 160);
    giveWeapon(state, 'rifle', 120);
    state.player.weapon = 'pistol';
  },
  startMissionAt(i) { startMission(rng, state, i); },
  setHour(h) { state.hour = h; },
  missions: MISSIONS,
};

announce('Sunset Bay. A vice city story.');
requestAnimationFrame(frame);
