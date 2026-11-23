// ambient.js — the city breathing underneath the game: a toast queue so
// radio voices take turns instead of shouting over each other, gulls
// circling the bay, DJ chatter on the car radio, distant trouble that
// scatters a crowd three blocks away, and ripples on the marina water.
// None of it is scripted to the player; it is there so every screenshot
// catches a city that was already alive before the camera arrived.

import { WATER_X, WORLD_H, RADIO, districtAt } from './config.js';
import { scarePeds, spawnHostile } from './peds.js';
import { clamp } from './rng.js';

/* ------------------------------------------------------------------ */
/* Toast queue: one voice at a time, in the order they called in.      */
/* ------------------------------------------------------------------ */

export function queueToast(state, text, ttl = 5) {
  if (!state.toastQueue) state.toastQueue = [];
  if (state.toastQueue.length > 3) state.toastQueue.shift();
  state.toastQueue.push({ text, t: 0, ttl });
}

/** Promote the next queued toast when the current one has run its time. */
export function stepToastQueue(state) {
  if (state.toast && state.toast.t <= state.toast.ttl) return;
  if (state.toastQueue && state.toastQueue.length > 0) {
    state.toast = state.toastQueue.shift();
  } else if (state.toast && state.toast.t > state.toast.ttl) {
    state.toast = null;
  }
}

/* ------------------------------------------------------------------ */
/* Gulls over the bay.                                                 */
/* ------------------------------------------------------------------ */

function createGulls(rng) {
  const gulls = [];
  for (let i = 0; i < 8; i++) {
    gulls.push({
      cx: WATER_X - 260 + rng.range(0, 560),
      cy: rng.range(300, WORLD_H - 300),
      r: rng.range(60, 190),
      a: rng.range(0, Math.PI * 2),
      sp: rng.range(0.14, 0.3) * (rng.chance(0.5) ? 1 : -1),
      flap: rng.range(0, 9),
      scale: rng.range(0.8, 1.3),
    });
  }
  return gulls;
}

function stepGulls(rng, state, dt) {
  if (!state.gulls) state.gulls = createGulls(rng);
  for (const gull of state.gulls) {
    gull.a += gull.sp * dt;
    gull.x = gull.cx + Math.cos(gull.a) * gull.r;
    gull.y = gull.cy + Math.sin(gull.a) * gull.r * 0.62;
    gull.heading = Math.atan2(Math.cos(gull.a) * 0.62, -Math.sin(gull.a)) + (gull.sp > 0 ? 0 : Math.PI);
  }
}

/** Drawn in world space, above the water and the beach, below the light. */
export function drawGulls(g, state) {
  if (!state.gulls) return;
  g.save();
  g.strokeStyle = 'rgba(250,250,246,0.9)';
  g.lineCap = 'round';
  for (const gull of state.gulls) {
    if (gull.x === undefined) continue;
    const flap = Math.sin(state.time * 9 + gull.flap) * 5.2;
    const s = gull.scale;
    g.save();
    g.translate(gull.x, gull.y);
    g.rotate(clamp(Math.sin(gull.a * 2) * 0.2, -0.3, 0.3));
    g.lineWidth = 2.2 * s;
    g.beginPath();
    g.moveTo(-11 * s, flap * 0.4);
    g.quadraticCurveTo(-5 * s, -3.4 * s - flap, 0, 0);
    g.quadraticCurveTo(5 * s, -3.4 * s - flap, 11 * s, flap * 0.4);
    g.stroke();
    g.restore();
    // A soft shadow racing along the sand or water under the bird.
    g.fillStyle = 'rgba(20,30,20,0.10)';
    g.beginPath(); g.ellipse(gull.x + 14, gull.y + 20, 9 * s, 3, 0, 0, 6.29); g.fill();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* Radio DJ chatter.                                                   */
/* ------------------------------------------------------------------ */

const DJ_LINES = [
  ['You are locked to SUNSET FM — the bay never sleeps, it just changes shifts.',
   'Traffic is crawling on the Strip avenue. Somebody in an orange Dukes, apparently.',
   'Shout-out to the night crews at the South Docks. Stay hydrated, stay quiet.'],
  ['BAYWATCH RADIO — if the sirens sound close, they are not for you. Probably.',
   'Harbour Master says the marina is open late tonight. The Harbour Master says a lot of things.',
   'Lost and found: one reputation, slightly used. Claim it at the front desk.'],
  ['VELVET 94 — smooth sounds for rough neighbourhoods.',
   'This next one goes out to Rosa D., wherever she is counting money tonight.',
   'Weather over the bay: golden, then trouble, then golden again.'],
  ['K-DOCKS — all docks, all day. Union rules: no names on air.',
   'Shift change at the container yard in twenty. You know what that means.',
   'If your cousin offers you a job at the docks, ask which docks. Then ask again.'],
  ['NIGHT DRIVE FM — for the ones still awake when the city blinks.',
   'Streetlights on Palm Heights just came on. Beautiful. Expensive. Not yours.',
   'Caller, you are on air. Caller? …Caller has reconsidered. Smart caller.'],
];

function stepDJ(rng, state, dt) {
  state.djT = (state.djT === undefined ? rng.range(6, 12) : state.djT) - dt;
  if (state.djT > 0) return;
  state.djT = rng.range(17, 28);
  if (!state.player.car) return;
  const lines = DJ_LINES[state.radio % DJ_LINES.length];
  state.djText = `♪ ${RADIO[state.radio].name} — ${lines[rng.int(0, lines.length - 1)]}`;
  state.radioT = Math.max(state.radioT, 3.4);
}

/* ------------------------------------------------------------------ */
/* Distant trouble + water life.                                       */
/* ------------------------------------------------------------------ */

function stepCityEvents(rng, state, dt) {
  state.eventT = (state.eventT === undefined ? rng.range(9, 16) : state.eventT) - dt;
  if (state.eventT <= 0) {
    state.eventT = rng.range(18, 34);
    const p = state.player;
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(340, 640);
    // Somewhere across the district: a bang, a shout, a crowd deciding to
    // be somewhere else. The player hears about it the way cities tell you.
    scarePeds(state, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 190);
    // After dark, in the rough districts, sometimes the bang has an
    // address: yours. A rival crew sends two walkers — no stars, no
    // dispatch, just business. Rare, and never while a job is running.
    const night = state.hour >= 20 || state.hour < 4.5;
    const rough = ['PORTSIDE', 'SOUTH DOCKS', 'THE STRIP'].includes(districtAt(p.x, p.y).name);
    const alreadyHostile = state.peds.some((ped) => ped.state === 'hostile');
    if (night && rough && !state.mission && !alreadyHostile && rng.chance(0.4)) {
      for (let k = 0; k < 2; k++) {
        const ha = a + k * 0.5;
        spawnHostile(rng, state, p.x + Math.cos(ha) * 300, p.y + Math.sin(ha) * 300);
      }
      queueToast(state, 'Two walkers, dark clothes, your name in their mouths.', 4.4);
    }
  }
  // Ripples where the piers meet the bay and on the villa pools.
  state.rippleT = (state.rippleT === undefined ? 0.4 : state.rippleT) - dt;
  if (state.rippleT <= 0) {
    state.rippleT = rng.range(0.3, 0.8);
    const p = state.player;
    if (Math.abs(p.x - WATER_X) < 900) {
      state.fx.push({
        kind: 'ripple', x: WATER_X + rng.range(6, 130), y: p.y + rng.range(-420, 420),
        t: 0, ttl: rng.range(1.4, 2.4),
      });
    }
  }
}

/* ------------------------------------------------------------------ */

export function stepAmbientCity(rng, state, dt) {
  stepGulls(rng, state, dt);
  stepDJ(rng, state, dt);
  stepCityEvents(rng, state, dt);
  // Keep the fx list from growing teeth.
  if (state.fx.length > 240) state.fx.splice(0, state.fx.length - 240);
}

export function gullCount(state) {
  return state.gulls ? state.gulls.length : 0;
}
