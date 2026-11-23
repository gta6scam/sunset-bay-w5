// weather.js — Sunset Bay weather. The bay breathes: clear spells, grey
// banks of cloud, and rain fronts that roll in off the water, slick the
// roads, dim the light and drum on every roof in the city. Weather is a
// slow state machine, not a dice roll per frame — fronts arrive, settle,
// and leave on their own schedule, and the whole city feels them at once:
// headlights matter more, steering goes loose, and the dispatch panel
// starts calling the roads "greasy".

import { clamp } from './rng.js';
import { queueToast } from './ambient.js';

export const WEATHER_KINDS = ['clear', 'clouds', 'rain'];

/** Fresh weather for a new city: a clear spell of uncertain length. */
export function createWeather(rng) {
  return {
    kind: 'clear',
    // 0..1 — how hard the current kind is asserting itself. For rain this
    // is the downpour's strength; for clouds, the cover's thickness.
    intensity: 0,
    t: 0, // seconds inside the current spell
    spell: 70 + rng.next() * 80, // seconds until the front moves on
  };
}

const ARRIVAL_LINES = {
  clouds: 'Clouds stacking up over the bay…',
  rain: 'Rain front rolling in — roads are going greasy.',
  clear: 'The front has passed. The bay sparkles again.',
};

/**
 * Advance the weather one step. Transitions walk the chain
 * clear → clouds → rain → clouds → clear, so rain never arrives without
 * warning and never leaves without the sky clearing its throat first.
 */
export function stepWeather(rng, state, dt) {
  const w = state.weather;
  if (!w) return;
  w.t += dt;
  // Intensity eases toward the kind's resting level: rain builds to its
  // rolled strength, clouds to a grey murk, clear skies to nothing.
  const target = w.kind === 'rain' ? w.strength || 0.8 : w.kind === 'clouds' ? 0.55 : 0;
  w.intensity += clamp(target - w.intensity, -dt * 0.05, dt * 0.05);

  if (w.t >= w.spell) {
    const next = w.kind === 'clear' ? 'clouds'
      : w.kind === 'clouds' ? (rng.chance(0.62) ? 'rain' : 'clear')
        : 'clouds';
    w.kind = next;
    w.t = 0;
    w.spell = next === 'rain' ? 40 + rng.next() * 60
      : next === 'clouds' ? 30 + rng.next() * 50
        : 80 + rng.next() * 110;
    if (next === 'rain') w.strength = 0.55 + rng.next() * 0.45;
    if (state.mode === 'playing' && ARRIVAL_LINES[next]) {
      queueToast(state, ARRIVAL_LINES[next], 4.2);
    }
  }

  // Wet roads: every car's steering bite and launch soften together.
  const grip = w.kind === 'rain' ? 1 - 0.30 * w.intensity : 1;
  for (const car of state.cars) car.gripMul = grip;

  // Rain makes its own ripples on the streets around the player.
  if (w.kind === 'rain' && w.intensity > 0.25 && rng.chance(dt * 9)) {
    const p = state.player;
    state.fx.push({
      kind: 'ripple',
      x: p.x + rng.range(-420, 420),
      y: p.y + rng.range(-320, 320),
      t: 0, ttl: rng.range(0.5, 0.9),
    });
  }
}

/** Short label for HUD surfaces: CLEAR / OVERCAST / RAIN / DOWNPOUR. */
export function weatherLabel(state) {
  const w = state.weather;
  if (!w) return 'CLEAR';
  if (w.kind === 'rain') return w.intensity > 0.8 ? 'DOWNPOUR' : 'RAIN';
  if (w.kind === 'clouds') return 'OVERCAST';
  return 'CLEAR';
}

/** Distance over which the rain sound/streaks stay believable. */
export function rainReach(state) {
  const w = state.weather;
  return w && w.kind === 'rain' ? w.intensity : 0;
}
