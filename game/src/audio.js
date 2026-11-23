// audio.js — a tiny synthesized soundscape: no audio files, just oscillators
// and noise through WebAudio. Engine hum tied to speed, a two-tone siren
// that swells as units close in, gunshots, doors, cash and jingles. Every
// call is guarded — a browser that refuses audio simply plays a silent game.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let rainSrc = null;
  let rainGain = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      SEQ.ctx = ctx;
      SEQ.master = master;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type = 'square', vol = 0.16, slide = 0) {
    if (!ensure()) return;
    try {
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
      gn.gain.setValueAtTime(vol, ctx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(gn).connect(master);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* silent */ }
  }

  function noise(dur, vol = 0.2, freq = 1200) {
    if (!ensure()) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const gn = ctx.createGain();
      gn.gain.value = vol;
      src.connect(filter).connect(gn).connect(master);
      src.start();
    } catch { /* silent */ }
  }

  function startLoops() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      engineOsc.connect(lp).connect(engineGain).connect(master);
      engineOsc.start();

      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      sirenLfo.frequency.value = 0.55;
      lfoGain.gain.value = 160;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      sirenLfo.start();

      // Rain: a looping bed of filtered noise, faded by the front's
      // strength in update(). Built once from a two-second noise buffer.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      rainSrc = ctx.createBufferSource();
      rainSrc.buffer = buffer;
      rainSrc.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 900;
      rainFilter.Q.value = 0.4;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainSrc.connect(rainFilter).connect(rainGain).connect(master);
      rainSrc.start();
    } catch { /* silent */ }
  }

  return {
    unlock() {
      if (ensure()) startLoops();
    },
    shot(id) {
      if (id === 'shotgun') { noise(0.16, 0.5, 900); blip(120, 0.12, 'square', 0.2, -60); }
      else if (id === 'smg') noise(0.05, 0.3, 2400);
      else if (id === 'rifle') { noise(0.08, 0.36, 1800); blip(190, 0.06, 'square', 0.14, -80); }
      else noise(0.06, 0.32, 2000);
    },
    door() { blip(140, 0.07, 'square', 0.1, -40); setTimeout(() => blip(110, 0.06, 'square', 0.09, -20), 60); },
    horn() { blip(370, 0.16, 'square', 0.10); blip(466, 0.16, 'square', 0.08); },
    crash(v) { noise(0.22, Math.min(0.5, v / 500), 500); },
    cash() { blip(880, 0.07, 'square', 0.12); setTimeout(() => blip(1320, 0.1, 'square', 0.12), 70); },
    objective() { blip(660, 0.09, 'sine', 0.14); },
    mission() { blip(520, 0.12, 'sine', 0.15); setTimeout(() => blip(780, 0.14, 'sine', 0.15), 110); },
    passed() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.16), i * 95));
    },
    failed() { blip(220, 0.2, 'sawtooth', 0.12, -90); },
    /** Per-frame: engine pitch from the player's car, siren swell from the nearest unit. */
    update(state) {
      if (!ctx || !engineOsc) return;
      try {
        const car = state.player.car;
        const target = car ? 0.05 + Math.abs(car.speed) / car.model.top * 0.05 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.09);
        if (car) engineOsc.frequency.setTargetAtTime(52 + Math.abs(car.speed) * 0.55, ctx.currentTime, 0.06);
        let nearest = Infinity;
        for (const u of state.police.units) {
          const d = Math.hypot(u.car.x - state.player.x, u.car.y - state.player.y);
          if (d < nearest) nearest = d;
        }
        const sirenTarget = state.police.stars > 0 && nearest < 950 ? clamp01((950 - nearest) / 950) * 0.055 : 0;
        sirenGain.gain.setTargetAtTime(sirenTarget, ctx.currentTime, 0.2);
        if (rainGain) {
          const w = state.weather;
          const rainTarget = w && w.kind === 'rain' ? w.intensity * 0.05 : 0;
          rainGain.gain.setTargetAtTime(rainTarget, ctx.currentTime, 0.4);
        }
        stepSequencer(state);
      } catch { /* silent */ }
    },
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ------------------------------------------------------------------ */
/* The radio sequencer: every station is a little generative band —  */
/* a bassline walking its scale, a hat ticking, a lead note now and   */
/* then. It only plays in a car with the engine running, ducked low   */
/* under the sirens, and it changes character with the station.       */
/* ------------------------------------------------------------------ */

const STATION_BANDS = [
  { root: 110.0, scale: [0, 3, 5, 7, 10], tempo: 0.24, wave: 'triangle', mood: 0.5 },  // sunset soul
  { root: 98.0, scale: [0, 2, 3, 7, 9], tempo: 0.21, wave: 'sawtooth', mood: 0.8 },   // harbour talk-rock
  { root: 130.8, scale: [0, 4, 7, 11], tempo: 0.30, wave: 'sine', mood: 0.3 },        // velvet ballads
  { root: 87.3, scale: [0, 3, 6, 10], tempo: 0.19, wave: 'square', mood: 0.9 },       // docks industrial
  { root: 146.8, scale: [0, 5, 7, 12], tempo: 0.26, wave: 'triangle', mood: 0.6 },    // night drive
];

const SEQ = { ctx: null, master: null };
let seqStep = 0;
let seqNextAt = 0;

function noteFreq(root, scale, degree, octave = 1) {
  const semis = scale[((degree % scale.length) + scale.length) % scale.length] + 12 * Math.floor(degree / scale.length);
  return root * Math.pow(2, semis / 12) * octave;
}

function seqBlip(freq, dur, type, vol) {
  const ctx = SEQ.ctx;
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    gn.gain.setValueAtTime(vol, ctx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(gn).connect(SEQ.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch { /* silent */ }
}

function stepSequencer(state) {
  const ctx = SEQ.ctx;
  if (!ctx || !state.player.car || state.mode !== 'playing') return;
  const band = STATION_BANDS[state.radio % STATION_BANDS.length];
  if (ctx.currentTime < seqNextAt) return;
  seqNextAt = ctx.currentTime + band.tempo;
  seqStep += 1;
  // Duck the band when the law is close enough to hear over it.
  let nearest = Infinity;
  for (const u of state.police.units) {
    const d = Math.hypot(u.car.x - state.player.x, u.car.y - state.player.y);
    if (d < nearest) nearest = d;
  }
  const duck = nearest < 420 ? 0.35 : 1;
  const bar = Math.floor(seqStep / 8) % 4;
  const stepInBar = seqStep % 8;
  // Bass: a walking line that leans home on the bar's first beat.
  if (stepInBar % 2 === 0) {
    const walk = [0, 2, 4, 3, 0, 4, 2, 1][seqStep % 8] + bar;
    seqBlip(noteFreq(band.root, band.scale, walk), band.tempo * 1.7, band.wave, 0.055 * duck);
  }
  // Hat: a soft tick on the off-beats, brighter on livelier stations.
  if (stepInBar % 2 === 1) {
    seqBlip(6200, 0.03, 'square', 0.006 + band.mood * 0.008);
  }
  // Lead: sparse, seeded by the clock so every drive sounds composed.
  const seed = Math.sin(seqStep * 12.9898) * 43758.5453;
  if (seed - Math.floor(seed) < band.mood * 0.30 && stepInBar > 1) {
    const degree = 4 + Math.floor((seed - Math.floor(seed)) * 40) % 5;
    seqBlip(noteFreq(band.root, band.scale, degree, 2), band.tempo * 2.6, 'sine', 0.028 * duck);
  }
}
