// missions.js — the Sunset Bay story: fifteen jobs for Rosa Delgado and the
// people who owe her, told as data (stages with places, timers and targets)
// plus the runtime that walks the player through them, pays out, and puts
// the MISSION PASSED banner on screen.
//
// Stage vocabulary: goto (be somewhere), pickup (hold beside a person),
// deliver (carry the moment to a place), collect (a timed chain of
// points), chase (stay on a runner), tail (shadow a mark inside a
// distance band without spooking him), destroy (wreck the target car),
// escape (be nowhere the law can see), race (checkpoints against the
// clock) and defend (hold a point while the heat comes to you).
//
// Every job also carries a quiet second contract — the bonus (ghost,
// clean or swift, defined in BONUSES below). It is never briefed and
// never shown in the panel; it is simply paid, with a toast, when the
// banner lands. Finding them is part of learning the bay.

import { createCar, trafficThink, stepCarPhysics } from './vehicles.js';
import { spawnPed } from './peds.js';
import { addHeat, setHeat } from './police.js';
import { dist } from './rng.js';
import { queueToast } from './ambient.js';

/**
 * Stage types: goto | pickup (hold in the marker) | deliver | collect |
 * chase (stay close for `time` seconds) | destroy (wreck `carModel`) |
 * escape (heat to zero) | race (reach before `time` runs out) |
 * defend (survive in the zone for `time` at `heat` stars of pressure).
 */
export const MISSIONS = [
  {
    title: 'FIRST FARE', giver: 'Rosa Delgado', start: { x: 820, y: 330 },
    intro: 'Rosa’s cousin is stranded at the marina. Pick her up, bring her home. Simple money.',
    stages: [
      { type: 'goto', x: 820, y: 330, text: 'Get to Rosa’s cousin at Marina del Sol' },
      { type: 'pickup', x: 820, y: 330, text: 'Wait while she gets in' },
      { type: 'deliver', x: 2430, y: 590, text: 'Drop her at the Old Town plaza' },
    ],
    reward: { money: 300, rep: 20 },
  },
  {
    title: 'BURGER RUN', giver: 'Cluckin’ Bell', start: { x: 2430, y: 590 },
    intro: 'Three orders, three hungry crews, one cooling bag. Move.',
    stages: [
      { type: 'collect', x: 2050, y: 1560, text: 'Collect order 1 — Centro kitchens' },
      { type: 'collect', x: 2980, y: 2210, text: 'Collect order 2 — Centro south' },
      { type: 'collect', x: 760, y: 1560, text: 'Collect order 3 — Portside canteen' },
      { type: 'deliver', x: 3920, y: 1730, text: 'Deliver to the Strip club door', time: 150 },
    ],
    reward: { money: 450, rep: 25 },
  },
  {
    title: 'HOT METAL', giver: 'Marco Venn', start: { x: 760, y: 1560 },
    intro: 'A rival crew parades a red Futo through Portside. End the parade.',
    stages: [
      { type: 'destroy', x: 900, y: 2050, carModel: 'coupe', text: 'Wreck the red Futo Coupe' },
      { type: 'escape', text: 'Lose the heat' },
    ],
    reward: { money: 600, rep: 35 },
  },
  {
    title: 'CAUSEWAY CHASE', giver: 'Rosa Delgado', start: { x: 1500, y: 3050 },
    intro: 'A Rumpo van took Rosa’s strongbox. Stay on its tail until the driver gives up.',
    stages: [
      { type: 'chase', x: 1750, y: 3050, carModel: 'van', time: 12, text: 'Stay on the Rumpo van' },
      { type: 'deliver', x: 820, y: 330, text: 'Bring the strongbox back to the marina', time: 180 },
    ],
    reward: { money: 700, rep: 40 },
  },
  {
    title: 'DOCKSIDE DELIVERY', giver: 'Harbour Master', start: { x: 760, y: 2050 },
    intro: 'That van by the Portside yard needs to be at the South Docks crane. Intact, preferably.',
    stages: [
      { type: 'goto', x: 760, y: 2050, text: 'Get to the Portside yard van' },
      { type: 'deliver', x: 3600, y: 3080, text: 'Deliver the van to the South Docks crane', time: 210 },
    ],
    reward: { money: 800, rep: 45 },
  },
  {
    title: 'BEACH PARTY PANIC', giver: 'Lena Marsh', start: { x: 1500, y: 3050 },
    intro: 'Lena’s beach party got loud, then louder. Keep the bay safe until it settles.',
    stages: [
      { type: 'defend', x: 1500, y: 3050, time: 45, heat: 2, text: 'Hold Bayview beach — 45 seconds' },
    ],
    reward: { money: 900, rep: 50 },
  },
  {
    title: 'HEIGHTS BURGLARY', giver: 'Marco Venn', start: { x: 3960, y: 430 },
    intro: 'A villa in Palm Heights. In, grab the case, out, gone. The alarm is not your friend.',
    stages: [
      { type: 'goto', x: 3960, y: 430, text: 'Reach the Palm Heights villa' },
      { type: 'pickup', x: 3960, y: 430, text: 'Take the case from the garden' },
      { type: 'escape', text: 'Vanish — lose the heat completely' },
    ],
    reward: { money: 1100, rep: 60 },
  },
  {
    title: 'TAXI SHIFT', giver: 'Bay Cab Co.', start: { x: 2430, y: 590 },
    intro: 'The cab company is short a driver. Three fares, honest work, dishonest shortcuts allowed.',
    stages: [
      { type: 'collect', x: 3920, y: 430, text: 'Fare 1 — Palm Heights gates' },
      { type: 'collect', x: 820, y: 330, text: 'Fare 2 — Marina del Sol' },
      { type: 'collect', x: 1500, y: 3050, text: 'Fare 3 — Bayview beach' },
      { type: 'deliver', x: 2430, y: 1760, text: 'End the shift at Centro tower', time: 200 },
    ],
    reward: { money: 950, rep: 55 },
  },
  {
    title: 'STRIP TROUBLE', giver: 'Ines Duarte', start: { x: 3920, y: 1730 },
    intro: 'A Granger keeps shadowing Ines’s club. Make it stop — permanently.',
    stages: [
      { type: 'destroy', x: 4050, y: 2210, carModel: 'policesuv', text: 'Wreck the Granger shadowing the club' },
      { type: 'escape', text: 'Lose the heat' },
    ],
    reward: { money: 1300, rep: 70 },
  },
  {
    title: 'THE COURIER', giver: 'Yusuf Ade', start: { x: 2430, y: 1760 },
    intro: 'Tail the van, learn the route, then run it: four checkpoints, one envelope.',
    stages: [
      { type: 'tail', carModel: 'van', x: 2430, y: 1830, time: 10, text: 'Tail the courier van — close, never close enough to spook him' },
      { type: 'race', x: 760, y: 330, time: 75, text: 'Checkpoint 1 — Marina north' },
      { type: 'race', x: 760, y: 3080, time: 95, text: 'Checkpoint 2 — Bayview south' },
      { type: 'race', x: 4050, y: 3080, time: 95, text: 'Checkpoint 3 — South Docks' },
      { type: 'race', x: 4050, y: 430, time: 95, text: 'Checkpoint 4 — Palm Heights' },
    ],
    reward: { money: 1400, rep: 75 },
  },
  {
    title: 'HARBOUR MASTER’S CUT', giver: 'Harbour Master', start: { x: 3600, y: 3080 },
    intro: 'A Hauler left the docks owing the Master money. Follow it. Politely. At speed.',
    stages: [
      { type: 'chase', x: 3350, y: 3080, carModel: 'truck', time: 12, text: 'Stay on the Hauler truck' },
      { type: 'escape', text: 'Lose the heat' },
    ],
    reward: { money: 1500, rep: 80 },
  },
  {
    title: 'OLD TOWN STANDOFF', giver: 'Rosa Delgado', start: { x: 2430, y: 590 },
    intro: 'The plaza is Rosa’s. Tonight the whole bay learns it. Hold the square.',
    stages: [
      { type: 'defend', x: 2430, y: 590, time: 60, heat: 3, text: 'Hold the Old Town plaza — 60 seconds' },
    ],
    reward: { money: 1700, rep: 90 },
  },
  {
    title: 'MIDNIGHT RUN', giver: 'Marco Venn', start: { x: 3920, y: 1730 },
    intro: 'A Dukes Muscle, the Strip to the marina, against the clock. The car is the cargo.',
    stages: [
      { type: 'goto', x: 3920, y: 1730, text: 'Take the Dukes at the club door' },
      { type: 'deliver', x: 820, y: 330, text: 'Deliver the Dukes to Marina del Sol', time: 150 },
    ],
    reward: { money: 1900, rep: 100 },
  },
  {
    title: 'KING OF THE DOCKS', giver: 'Harbour Master', start: { x: 3600, y: 3080 },
    intro: 'Two syndicate cars cruise the docks like they own them. Correct the misunderstanding.',
    stages: [
      { type: 'destroy', x: 3350, y: 2850, carModel: 'sedan', text: 'Wreck syndicate car 1' },
      { type: 'destroy', x: 4250, y: 3350, carModel: 'coupe', text: 'Wreck syndicate car 2' },
      { type: 'escape', text: 'Lose the heat' },
    ],
    reward: { money: 2300, rep: 120 },
  },
  {
    title: 'SUNSET FINALE', giver: 'Rosa Delgado', start: { x: 3960, y: 430 },
    intro: 'One last job, every favour called in. The lighthouse at dusk. Don’t be late, don’t be followed.',
    stages: [
      { type: 'pickup', x: 3960, y: 430, text: 'Collect Rosa at Palm Heights' },
      { type: 'chase', x: 3600, y: 1200, carModel: 'muscle', time: 10, text: 'Shake the tail — stay ahead of the Dukes' },
      { type: 'deliver', x: 4520, y: 3560, text: 'Reach the lighthouse point by the bay' },
      { type: 'escape', text: 'Disappear into the sunset' },
    ],
    reward: { money: 3500, rep: 200 },
  },
];

export const MISSION_COUNT = MISSIONS.length;

/** Where the next story job waits, or null when the story is finished. */
export function nextStart(state) {
  if (state.story.index >= MISSION_COUNT) return null;
  return MISSIONS[state.story.index].start;
}

function enterStage(rng, state) {
  const m = state.mission;
  const stage = m.def.stages[m.stage];
  m.tStage = 0;
  m.holdT = 0;
  m.nearT = 0;
  m.timeLeft = stage.time && stage.type !== 'chase' ? stage.time : null;
  m.targetCar = null;
  m.helperPed = null;
  if (stage.type === 'chase' || stage.type === 'destroy' || stage.type === 'tail') {
    const car = createCar(rng, stage.carModel, stage.x, stage.y, rng.next() * 6.28, { driver: 'mission' });
    car.cruise = stage.type === 'chase' ? 295 : stage.type === 'tail' ? 225 : 250;
    if (stage.type === 'destroy') car.color = stage.carModel === 'coupe' && m.idx === 2 ? '#c23b2e' : car.color;
    state.cars.push(car);
    m.targetCar = car;
    m.spookT = 0;
    m.warnedSpook = false;
  }
  if (stage.type === 'pickup') {
    m.helperPed = spawnPed(rng, state, stage.x + 18, stage.y + 10, { state: 'stand', name: m.def.giver.split(' ')[0] });
  }
  if (stage.type === 'defend') {
    setHeat(state, (stage.heat || 2) * 100);
  }
  if (m.stage > 0 && STAGE_LINES[stage.type]) {
    queueToast(state, `${m.def.giver.split(' ')[0]}: ${STAGE_LINES[stage.type]}`, 4.5);
  }
  state.objective = stage.text;
}

/**
 * The givers talk. Each job opens with the person who is paying saying the
 * part the intro card cannot — and stage changes get a line from the same
 * voice, so a mission feels like a phone call that will not hang up.
 */
const VOICE_LINES = [
  'Rosa: “He is a good man, my cousin. Get him there breathing, that is the whole job.”',
  'Rosa: “Cluckin’ Bell money, courier rules: hot, fast, no questions at the window.”',
  'Marco: “The coupe is already stolen, friend. You are just… relocating it.”',
  'Rosa: “He will run. They always run. Try not to enjoy it too much.”',
  'Harbour Master: “Paperwork says fruit. The weight says otherwise. Drive gentle.”',
  'Lena: “The beach party got loud and the neighbours have badges. Move my people.”',
  'Rosa: “A villa, a case, an alarm with opinions. In and out, like a rumour.”',
  'Rosa: “Honest work today. The cab pays by the fare, I pay by the silence after.”',
  'Rosa: “The Strip looks after its own, except when it doesn’t. Tonight it doesn’t.”',
  'Courier Ana: “Sealed case, sealed lips. The bay bridge at speed, if you please.”',
  'Harbour Master: “My cut travels in the green van. See that it arrives unopened.”',
  'Rosa: “Old Town settles its arguments at dusk. Be the argument that wins.”',
  'Rosa: “One run, no headlights past the heights. The dark is your friend tonight.”',
  'Harbour Master: “Two syndicate cars cruise my docks like they pay rent. Correct them.”',
  'Rosa: “Everything you have learned, one last drive. Come home rich, mi amor.”',
];

const STAGE_LINES = {
  goto: '“You see the marker? That is the whole plan. Go.”',
  pickup: '“They are waiting. Do not keep the money waiting.”',
  deliver: '“Now the part where you do not open it. Drive.”',
  collect: '“Take everything that glitters. Leave the guilt.”',
  chase: '“He is running scared. Scared drivers make mistakes — be there for them.”',
  destroy: '“Make it undriveable. Make it unmissable.”',
  escape: '“Lose them. All of them. Then we talk money.”',
  race: '“Clock is running, and it is not known for mercy.”',
  defend: '“Hold the ground. Whatever comes down that street, hold it.”',
  tail: '“Stay on him, but soft. If he makes you, we are done here.”',
};

/**
 * Every job carries a quiet second contract — the bonus. Never briefed,
 * always paid: finish unseen, finish unhurt, or finish fast, and the
 * giver's envelope is heavier. The HUD never shows it; the toast after
 * the banner is how you find out you earned it.
 */
const BONUSES = [
  { kind: 'clean', label: 'UNTOUCHED', money: 120 },
  { kind: 'ghost', label: 'GHOST — never more than two stars', money: 150 },
  { kind: 'swift', label: 'SWIFT', money: 130, par: 150 },
  { kind: 'ghost', label: 'GHOST — never more than two stars', money: 180 },
  { kind: 'clean', label: 'UNTOUCHED', money: 200 },
  { kind: 'swift', label: 'SWIFT', money: 190, par: 170 },
  { kind: 'clean', label: 'UNTOUCHED', money: 240 },
  { kind: 'ghost', label: 'GHOST — never more than two stars', money: 220 },
  { kind: 'swift', label: 'SWIFT', money: 210, par: 160 },
  { kind: 'clean', label: 'UNTOUCHED', money: 260 },
  { kind: 'ghost', label: 'GHOST — never more than two stars', money: 300 },
  { kind: 'swift', label: 'SWIFT', money: 280, par: 190 },
  { kind: 'clean', label: 'UNTOUCHED', money: 320 },
  { kind: 'ghost', label: 'GHOST — never more than two stars', money: 380 },
  { kind: 'swift', label: 'SWIFT', money: 450, par: 260 },
];

function bonusEarned(state, m) {
  const b = BONUSES[m.idx];
  if (!b) return null;
  const p = state.player;
  if (b.kind === 'ghost' && (m.maxStars || 0) <= 2) return b;
  if (b.kind === 'clean' && p.hp + p.armor >= (m.hpStart || 0) - 1) return b;
  if (b.kind === 'swift' && state.time - (m.tStart || 0) <= b.par) return b;
  return null;
}

const DONE_LINES = [
  'Rosa: “Clean work. The bay remembers things like that.”',
  'Rosa: “Paid in full. Do not spend it anywhere I would hear about.”',
  'Harbour Master: “The docks approve. That is rarer than you think.”',
  'Rosa: “One more name crossed off. Mine is a shorter list because of you.”',
];

export function startMission(rng, state, idx) {
  state.mission = {
    idx,
    def: MISSIONS[idx],
    stage: 0,
    tStage: 0,
    holdT: 0,
    nearT: 0,
    timeLeft: null,
    targetCar: null,
    helperPed: null,
    tStart: state.time,
    hpStart: state.player.hp + state.player.armor,
    maxStars: 0,
    spookT: 0,
    warnedSpook: false,
  };
  state.toast = { text: `${MISSIONS[idx].title} — ${MISSIONS[idx].intro}`, t: 0, ttl: 7 };
  // The intro card: title, giver and the pitch, held on screen long
  // enough to read — the moment a job becomes a story beat, not a marker.
  state.introCard = {
    title: MISSIONS[idx].title,
    giver: MISSIONS[idx].giver,
    intro: MISSIONS[idx].intro,
    job: idx + 1,
    t: 0,
    ttl: 4.2,
  };
  if (VOICE_LINES[idx]) queueToast(state, VOICE_LINES[idx], 5.5);
  state.audio?.mission?.();
  enterStage(rng, state);
}

function completeMission(state) {
  const m = state.mission;
  const bonus = bonusEarned(state, m);
  const total = m.def.reward.money + (bonus ? bonus.money : 0);
  state.money += total;
  state.rep += m.def.reward.rep;
  state.story.index = m.idx + 1;
  state.stats.missionsDone += 1;
  state.stats.earned += total;
  if (bonus) {
    state.stats.bonuses = (state.stats.bonuses || 0) + 1;
    queueToast(state, `BONUS — ${bonus.label}: +$${bonus.money}`, 4.6);
  }
  state.banner = {
    kind: 'passed',
    title: 'MISSION PASSED',
    sub: m.def.title,
    money: total,
    rep: m.def.reward.rep,
    t: 0,
    ttl: 4.6,
  };
  if (m.helperPed) m.helperPed.state = 'walk';
  if (m.targetCar && m.targetCar.driver === 'mission') m.targetCar.driver = 'traffic';
  state.mission = null;
  queueToast(state, DONE_LINES[m.idx % DONE_LINES.length], 5);
  state.objective = state.story.index >= MISSION_COUNT ? 'The bay is yours. Free roam.' : 'Head to the gold marker for the next job';
  state.saveDirty = true;
  state.audio?.passed?.();
}

function failMission(state, why) {
  const m = state.mission;
  if (m.targetCar && m.targetCar.driver === 'mission') m.targetCar.driver = 'traffic';
  if (m.helperPed) m.helperPed.state = 'walk';
  state.toast = { text: `JOB FAILED — ${why}. The marker is still there when you’re ready.`, t: 0, ttl: 6 };
  state.mission = null;
  state.objective = 'Head to the gold marker to try the job again';
  state.audio?.failed?.();
}

function advanceStage(rng, state) {
  const m = state.mission;
  if (m.helperPed) { m.helperPed.state = 'walk'; m.helperPed = null; }
  if (m.targetCar && m.targetCar.driver === 'mission') { m.targetCar.driver = 'traffic'; m.targetCar = null; }
  m.stage += 1;
  state.audio?.objective?.();
  if (m.stage >= m.def.stages.length) completeMission(state);
  else enterStage(rng, state);
}

/** The point the HUD should mark right now (stage target), or null. */
export function missionMarker(state) {
  const m = state.mission;
  if (!m) {
    const s = nextStart(state);
    return s ? { x: s.x, y: s.y, kind: 'start' } : null;
  }
  const stage = m.def.stages[m.stage];
  if (m.targetCar) return { x: m.targetCar.x, y: m.targetCar.y, kind: 'target' };
  if (stage.type === 'escape') return null;
  return { x: stage.x, y: stage.y, kind: 'stage' };
}

/** Mission target cars drive themselves; called from the main loop. */
export function stepMissionCars(rng, state, dt) {
  const m = state.mission;
  if (!m || !m.targetCar || m.targetCar.driver !== 'mission') return;
  const car = m.targetCar;
  const stage = m.def.stages[m.stage];
  if (stage.type === 'chase') {
    // Keep it catchable: slow when the player falls far behind.
    const d = dist(car.x, car.y, state.player.x, state.player.y);
    car.cruise = d > 720 ? 120 : 295;
  }
  const drive = trafficThink(rng, state, car, dt);
  stepCarPhysics(state.world, car, dt, drive.throttle, drive.steer, false);
}

/** Advance the active mission (or watch the start marker) one step. */
export function stepMission(rng, state, dt) {
  const p = state.player;
  if (!state.mission) {
    const s = nextStart(state);
    if (s && dist(p.x, p.y, s.x, s.y) < 64) {
      state.startHoldT += dt;
      if (state.startHoldT > 0.9) {
        state.startHoldT = 0;
        startMission(rng, state, state.story.index);
      }
    } else {
      state.startHoldT = 0;
    }
    return;
  }
  const m = state.mission;
  const stage = m.def.stages[m.stage];
  m.tStage += dt;
  if (state.police.stars > (m.maxStars || 0)) m.maxStars = state.police.stars;

  if (m.timeLeft !== null && stage.type !== 'defend') {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      failMission(state, 'out of time');
      return;
    }
  }

  const inCarRadius = 118;
  const onFootRadius = 52;
  switch (stage.type) {
    case 'goto':
    case 'deliver':
    case 'collect': {
      const r = p.car ? inCarRadius : onFootRadius;
      if (dist(p.x, p.y, stage.x, stage.y) < r) advanceStage(rng, state);
      break;
    }
    case 'race': {
      if (dist(p.x, p.y, stage.x, stage.y) < inCarRadius) advanceStage(rng, state);
      break;
    }
    case 'pickup': {
      if (dist(p.x, p.y, stage.x, stage.y) < onFootRadius + 14) {
        m.holdT += dt;
        if (m.holdT > 2.2) advanceStage(rng, state);
      } else m.holdT = Math.max(0, m.holdT - dt);
      break;
    }
    case 'chase': {
      const d = dist(p.x, p.y, m.targetCar.x, m.targetCar.y);
      if (d < 300) m.nearT += dt;
      else m.nearT = Math.max(0, m.nearT - dt * 0.7);
      if (m.nearT >= stage.time) advanceStage(rng, state);
      break;
    }
    case 'tail': {
      // Shadow the target: inside the band you are invisible, inside his
      // mirrors you are a problem, and out of sight you are forgotten.
      const d = dist(p.x, p.y, m.targetCar.x, m.targetCar.y);
      if (d >= 95 && d <= 300) {
        m.holdT += dt;
        m.spookT = Math.max(0, m.spookT - dt * 0.8);
      } else if (d < 95) {
        m.spookT += dt;
        if (m.spookT > 0.7 && !m.warnedSpook) {
          m.warnedSpook = true;
          queueToast(state, 'Too close — he is checking his mirrors. Back off.', 3.4);
        }
        if (m.spookT >= 2.6) {
          failMission(state, 'you spooked him and he bolted');
          return;
        }
      } else {
        m.holdT = Math.max(0, m.holdT - dt * 0.45);
        m.spookT = Math.max(0, m.spookT - dt);
      }
      if (m.holdT >= stage.time) advanceStage(rng, state);
      break;
    }
    case 'destroy': {
      if (m.targetCar.hp <= 0 || m.targetCar.dead) advanceStage(rng, state);
      break;
    }
    case 'escape': {
      if (state.police.heat <= 0 && state.police.seenT > 2) advanceStage(rng, state);
      break;
    }
    case 'defend': {
      if (dist(p.x, p.y, stage.x, stage.y) > 420) {
        failMission(state, 'you left the zone');
        return;
      }
      // Keep the pressure on: the dispatcher doesn't drift away mid-stand.
      if (state.police.stars < (stage.heat || 2)) addHeat(state, 40 * dt, p.x, p.y);
      if (m.tStage >= stage.time) advanceStage(rng, state);
      break;
    }
    default:
      break;
  }
}

/** Progress 0..1 for the HUD stage bar, when the stage has a measure. */
export function stageProgress(state) {
  const m = state.mission;
  if (!m) return null;
  const stage = m.def.stages[m.stage];
  if (stage.type === 'chase') return m.nearT / stage.time;
  if (stage.type === 'tail') return m.holdT / stage.time;
  if (stage.type === 'pickup') return m.holdT / 2.2;
  if (stage.type === 'defend') return m.tStage / stage.time;
  if (m.timeLeft !== null && stage.time) return 1 - m.timeLeft / stage.time;
  if (stage.type === 'destroy' && m.targetCar) return 1 - Math.max(0, m.targetCar.hp) / m.targetCar.maxHp;
  return null;
}
