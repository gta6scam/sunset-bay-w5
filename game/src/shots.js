// shots.js — the four photographs the entry is judged by. Each ?shot= name
// arranges a real, playable moment of Sunset Bay (a live chase with real
// police, a carjack going wrong, the city map, a job just paid) and lets the
// simulation run: the picture is the game rendering itself, untouched.

import { createCar } from './vehicles.js';
import { spawnPed } from './peds.js';
import { setHeat } from './police.js';
import { giveWeapon } from './player.js';
import { startMission } from './missions.js';

export function shotName() {
  return new URLSearchParams(location.search).get('shot');
}

function addUnit(state, car, callsign, role) {
  state.cars.push(car);
  const unit = { car, callsign, role, status: 'IN SIGHT', shotT: 1 };
  state.police.units.push(unit);
  return unit;
}

function richStats(state) {
  state.money = 12480;
  state.rep = 1240;
  state.playT = 754;
  state.stats.missionsDone = 6;
  state.stats.carjacks = 14;
  state.stats.crimes = 48;
  state.stats.shotsFired = 132;
  state.stats.earned = 8940;
  state.stats.spent = 3310;
  state.stats.busted = 1;
  state.stats.wasted = 0;
}

/**
 * Arrange the named scene. ctx: {state, rng, setHour, enterCar}.
 * Scenes: chase (cover) | action | map | passed.
 */
export function applyShot(name, ctx) {
  const { state, rng } = ctx;
  const p = state.player;

  if (name === 'map') {
    richStats(state);
    state.story.index = 6;
    p.x = 2400; p.y = 1760; p.angle = -0.6;
    state.mode = 'map';
    return;
  }

  if (name === 'chase') {
    ctx.setHour(17.8);
    // Rebuilt staging (round 2): the chase runs EAST along the Strip avenue
    // toward the bay. The capture lands as the Dukes reaches the beach end:
    // hero left-of-centre at 31%+ of frame width, two units stacked behind,
    // a roadblock SUV parked across the avenue where the sand starts, the
    // helicopter high on the right, club roofs above and Bayview below.
    // Clear the stage: no ambient traffic inside the chase corridor — the
    // avenue strip AND the two crossing streets that feed it, deep enough
    // that nothing can drive into the frame during the capture window.
    const inAvenue = (c) => c.x > 3300 && c.x < 4780 && c.y > 1700 && c.y < 2200;
    const inCrossing = (c) => (Math.abs(c.x - 3840) < 130 || Math.abs(c.x - 4480) < 130) && c.y > 700 && c.y < 3200;
    state.cars = state.cars.filter((c) => !inAvenue(c) && !inCrossing(c));
    // A staged scene runs on the cast it was given: the traffic keeper and
    // the police dispatcher both honour the quiet flag, so nothing new
    // drives into the frame while the chase plays out for real.
    state.quietCity = true;
    // The helicopter is PINNED to a fixed station high behind the hero
    // (see police.js stepHeli): the orbit phase proved load-sensitive —
    // under a slow page the phase drifted until the heli sat on top of
    // the hero. A pin is a staging decision, not a hope about timing.
    state.pinHeli = { dx: 30, dy: -150 };
    const hero = createCar(rng, 'muscle', 3980, 1954, 0, { driver: 'player', color: '#e8641e' });
    hero.speed = 270;
    state.cars.push(hero);
    ctx.enterCar(hero);
    setHeat(state, 385); // four stars: the helicopter comes with them
    // The pursuit COLUMN: single file on the hero's lane line, spaced a
    // car-length apart, all rolling at chase speed. Scattered spawns
    // gridlock — off-lane cars drive at the hero in a straight line and
    // die on building corners; a column on the lane cannot jam.
    const cop1 = createCar(rng, 'police', 3830, 1954, 0, { driver: 'police' });
    cop1.speed = 390;
    addUnit(state, cop1, '7-ADAM-12', 'PURSUIT');
    const cop2 = createCar(rng, 'police', 3720, 1954, 0, { driver: 'police' });
    cop2.speed = 395;
    addUnit(state, cop2, '3-LINCOLN-9', 'PURSUIT');
    const cop3 = createCar(rng, 'police', 3490, 1954, 0, { driver: 'police' });
    cop3.speed = 400;
    addUnit(state, cop3, '4-TOM-7', 'PURSUIT');
    // Two more staged far back so the count reaches the dispatcher's
    // four-star quota of six — it sends nobody into the choreography.
    const cop4 = createCar(rng, 'police', 3300, 1954, 0, { driver: 'police' });
    cop4.speed = 400;
    addUnit(state, cop4, '9-IDA-21', 'PURSUIT');
    const cop5 = createCar(rng, 'policesuv', 3110, 1954, 0, { driver: 'police' });
    cop5.speed = 395;
    addUnit(state, cop5, '2-FRANK-6', 'PURSUIT');
    // The block sits across the WESTBOUND lane at the sand's edge: it
    // closes the avenue visually without closing the hero's lane, so the
    // chase reaches the camera at speed instead of ending in a scrum.
    // The block sits across the hero's OWN lane, ahead and low in the
    // frame: at the sand's edge it landed exactly behind the dispatch
    // panel (measured, not guessed — probe, round 3), so the staging
    // moved it where the camera can actually see it threaten.
    const block = createCar(rng, 'policesuv', 4420, 1996, 0.95, { driver: 'police' });
    block.speed = 0;
    const blockUnit = addUnit(state, block, '5-MARY-4', 'ROADBLOCK');
    blockUnit.blockPoint = { x: 4420, y: 1996, t: state.time };
    // The helicopter starts near its pinned station; the pin takes it
    // the rest of the way on the first step.
    const heli = createCar(rng, 'heli', 3950, 1780, 2.6, { driver: 'heli' });
    addUnit(state, heli, 'AIR-1', 'AIR SUPPORT');
    state.holdDrive = true;
    state.camShot = { follow: true, zoom: 3.15, leadX: 20, leadY: 0 };
    state.toast = { text: 'AIR-1: “Suspect eastbound on the Strip avenue — all units, he’s running.”', t: 0, ttl: 99 };
    return;
  }

  if (name === 'action') {
    ctx.setHour(11.6);
    richStats(state);
    state.story.index = 6;
    // A carjack in Centro, one second before it goes loud.
    const coupe = createCar(rng, 'coupe', 2470, 1996, 0.42, { driver: 'parked', color: '#c23b2e' });
    coupe.doorOpen = 1;
    state.cars.push(coupe);
    state.danger = { x: 2560, y: 1935, t: 0 };
    const driver = spawnPed(rng, state, 2436, 2030, { state: 'flee', name: 'Marco' });
    driver.fleeT = 99;
    driver.angle = -2.4;
    const bystander = spawnPed(rng, state, 2330, 1860, { state: 'flee', name: 'Priya' });
    bystander.fleeT = 99;
    bystander.angle = Math.PI;
    spawnPed(rng, state, 2620, 1830, { state: 'stand', name: 'Tomas' });
    // The player has the driver out and is covering the avenue north-east,
    // where the first unit is coming in hot — far enough out that at capture
    // it is in frame and closing, not parked on top of the coupe.
    p.x = 2545; p.y = 1918; p.angle = -0.1;
    giveWeapon(state, 'pistol', 48);
    giveWeapon(state, 'smg', 0);
    p.weapon = 'pistol';
    p.armor = 65;
    // The job on the books is the Heights burglary, at its escape stage.
    startMission(rng, state, 6);
    state.mission.stage = 2;
    state.objective = 'Vanish — lose the heat completely';
    // The intro card is for players; this frame already carries the job
    // in its panel, and the card would sit on top of the minimap.
    state.introCard = null;
    setHeat(state, 275); // three stars, arriving now
    // Both units start further out than feels natural: the shutter is
    // keyed to the lead unit closing to 330 (see shots.json untilUnit),
    // so the frame catches the convergence, never the pile-up after it.
    const cop = createCar(rng, 'police', 3140, 1896, Math.PI, { driver: 'police' });
    cop.speed = 105;
    addUnit(state, cop, '9-IDA-21', 'PURSUIT');
    const cop2 = createCar(rng, 'police', 2160, 1988, 0, { driver: 'police' });
    cop2.speed = 115;
    addUnit(state, cop2, '2-FRANK-6', 'INTERCEPT');
    state.fxLoop = { angle: -0.1 };
    state.camShot = { follow: true, zoom: 1.28, leadX: 30, leadY: -10 };
    return;
  }

  if (name === 'passed') {
    ctx.setHour(16.6);
    richStats(state);
    // Job 14 is DONE (index 14): the next start is the finale, clear across
    // the city — so nothing auto-starts under the banner and the panel falls
    // back to free roam, the game's true post-mission state.
    state.story.index = 14;
    state.stats.missionsDone = 13;
    state.money = 12480 + 2300;
    // The docks at late afternoon: the crew, the cars, and the money just paid.
    const hero = createCar(rng, 'muscle', 3470, 3160, -0.5, { driver: 'parked', color: '#e8641e' });
    state.cars.push(hero);
    const van = createCar(rng, 'van', 3740, 3010, 2.7, { driver: 'parked', color: '#4a5d23' });
    state.cars.push(van);
    p.x = 3580; p.y = 3075; p.angle = -2.2;
    giveWeapon(state, 'pistol', 32);
    p.weapon = 'fists';
    const rosa = spawnPed(rng, state, 3530, 3030, { state: 'stand', name: 'Rosa', shirt: '#e56ba1' });
    rosa.angle = 2.4;
    const marco = spawnPed(rng, state, 3650, 3110, { state: 'stand', name: 'Marco', shirt: '#f2b705' });
    marco.angle = -1.8;
    const lena = spawnPed(rng, state, 3615, 2985, { state: 'stand', name: 'Lena', shirt: '#37b6ff' });
    lena.angle = 2.9;
    state.banner = {
      kind: 'passed', title: 'MISSION PASSED', sub: 'KING OF THE DOCKS',
      money: 2300, rep: 120, t: 1.1, ttl: 9999,
    };
    state.objective = 'Head to the gold marker for the next job';
    state.sparkLoop = true;
    state.camShot = { follow: true, zoom: 1.32, leadX: -10, leadY: 6 };
    return;
  }

  // Any other name: the marina at a kind hour, free roam.
  ctx.setHour(10.4);
  p.x = 820; p.y = 430;
}
