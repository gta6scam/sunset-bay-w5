// render.js — everything the eye gets: the baked ground (asphalt grain,
// crosswalks, sand, bay water), buildings with parapets and rooftop clutter,
// palms and props, cars with liveries and lightbars, the helicopter and its
// searchlight, people, effects, and the day cycle's light over all of it.
// The static ground is painted once to an offscreen canvas; the frame itself
// is a camera transform, a drawImage, and the living things on top.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, BLOCK, ROAD_W, WATER_X, BEACH_W, SKY_STOPS, SHOP_KINDS, districtAt } from './config.js';
import { STREET_XS, STREET_YS } from './world.js';
import { fbm, hash2, clamp, lerp } from './rng.js';
import { drawGulls } from './ambient.js';

const GROUND_SCALE = 0.5;

/** Blend the day-cycle anchors into the light for a given hour. */
export function lightingAt(hour) {
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (hour >= SKY_STOPS[i].h && hour <= SKY_STOPS[i + 1].h) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const t = b.h === a.h ? 0 : (hour - a.h) / (b.h - a.h);
  const tint = [lerp(a.tint[0], b.tint[0], t), lerp(a.tint[1], b.tint[1], t), lerp(a.tint[2], b.tint[2], t)];
  const dark = lerp(a.dark, b.dark, t);
  // Sun: rises east at 6, sets west at 19; elevation peaks at midday.
  const dayT = clamp((hour - 6) / 13, 0, 1);
  const az = Math.PI * (1 - dayT); // PI (east horizon) -> 0 (west horizon) in screen terms
  const elev = Math.sin(dayT * Math.PI);
  const shadowLen = 8 + (1 - elev) * 30;
  return {
    tint, dark,
    shadowX: Math.cos(az) * shadowLen * -1,
    shadowY: Math.sin(az) * shadowLen * 0.45 + 3,
    shadowAlpha: clamp(0.38 - dark * 0.2, 0.1, 0.4),
    sunGlow: hour > 16.8 && hour < 19.6 ? (hour - 16.8) / 2.8 : 0,
    night: clamp((dark - 0.34) * 2.4, 0, 1),
  };
}

/** Paint the static city into an offscreen canvas (once, at boot). */
function bakeGround(world) {
  const cv = document.createElement('canvas');
  cv.width = WORLD_W * GROUND_SCALE;
  cv.height = WORLD_H * GROUND_SCALE;
  const g = cv.getContext('2d');
  g.scale(GROUND_SCALE, GROUND_SCALE);

  // Base: mottled grass-green city ground with worn patches.
  g.fillStyle = '#4d7c43';
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let x = 0; x < WORLD_W; x += 128) {
    for (let y = 0; y < WORLD_H; y += 128) {
      const n = fbm(x, y, 300, 3, 5);
      g.fillStyle = n > 0.55 ? 'rgba(38,84,34,0.25)' : n < 0.42 ? 'rgba(140,150,80,0.16)' : 'rgba(90,120,60,0.12)';
      g.fillRect(x, y, 128, 128);
    }
  }
  // Downtown paving: city-centre, strip, port and dock blocks sit on
  // concrete, not lawn — the ground itself should say which district you
  // are in before a single building is drawn.
  const paveStyles = { CENTRO: '#74776f', 'THE STRIP': '#7b7672', PORTSIDE: '#6e7268', 'SOUTH DOCKS': '#6a6d66' };
  const cellEdgesX = [0, ...STREET_XS.map((s) => s + ROAD_W / 2 + 15)];
  const cellRightsX = [...STREET_XS.map((s) => s - ROAD_W / 2 - 15), WATER_X - BEACH_W];
  const cellEdgesY = [0, ...STREET_YS.map((s) => s + ROAD_W / 2 + 15)];
  const cellRightsY = [...STREET_YS.map((s) => s - ROAD_W / 2 - 15), WORLD_H];
  for (let ci = 0; ci < cellEdgesX.length; ci++) {
    for (let cj = 0; cj < cellEdgesY.length; cj++) {
      const cx0 = cellEdgesX[ci];
      const cx1 = cellRightsX[ci];
      const cy0 = cellEdgesY[cj];
      const cy1 = cellRightsY[cj];
      if (cx1 - cx0 < 60 || cy1 - cy0 < 60) continue;
      const d = districtAt((cx0 + cx1) / 2, (cy0 + cy1) / 2);
      const pave = paveStyles[d.name];
      if (!pave) continue;
      g.fillStyle = pave;
      g.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
      // Worn concrete: expansion joints + patch stains.
      g.fillStyle = 'rgba(40,42,40,0.18)';
      for (let jx = cx0 + 92; jx < cx1; jx += 92) g.fillRect(jx, cy0, 2.4, cy1 - cy0);
      for (let jy = cy0 + 92; jy < cy1; jy += 92) g.fillRect(cx0, jy, cx1 - cx0, 2.4);
      for (let sIdx = 0; sIdx < 7; sIdx++) {
        const px = cx0 + hash2(ci * 31 + sIdx, cj * 17, 131) * (cx1 - cx0 - 60);
        const py = cy0 + hash2(ci * 13, cj * 29 + sIdx, 137) * (cy1 - cy0 - 44);
        g.fillStyle = `rgba(30,32,30,${0.05 + hash2(sIdx, ci, 139) * 0.07})`;
        g.fillRect(px, py, 34 + hash2(sIdx, cj, 149) * 52, 22 + hash2(ci, sIdx, 151) * 30);
      }
    }
  }
  // The bay: deep water with a lighter shelf at the shore.
  const waterGrad = g.createLinearGradient(WATER_X, 0, WORLD_W, 0);
  waterGrad.addColorStop(0, '#2e7ea6');
  waterGrad.addColorStop(0.25, '#1f6f9e');
  waterGrad.addColorStop(1, '#144a75');
  g.fillStyle = waterGrad;
  g.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  for (let i = 0; i < 260; i++) {
    const x = WATER_X + hash2(i, 3, 91) * (WORLD_W - WATER_X);
    const y = hash2(i, 7, 97) * WORLD_H;
    g.fillStyle = `rgba(255,255,255,${0.03 + hash2(i, 9, 91) * 0.05})`;
    g.fillRect(x, y, 26 + hash2(i, 11, 91) * 60, 3);
  }
  // Sand.
  g.fillStyle = '#e3cf9e';
  g.fillRect(WATER_X - BEACH_W, 0, BEACH_W, WORLD_H);
  for (let i = 0; i < 380; i++) {
    const x = WATER_X - BEACH_W + hash2(i, 13, 103) * BEACH_W;
    const y = hash2(i, 17, 103) * WORLD_H;
    g.fillStyle = hash2(i, 19, 103) > 0.5 ? 'rgba(190,160,100,0.35)' : 'rgba(255,244,200,0.3)';
    g.fillRect(x, y, 5, 3);
  }
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(WATER_X - 4, 0, 5, WORLD_H); // waterline foam

  // Sidewalks: pale slabs under every street, then the asphalt itself.
  g.fillStyle = '#a8a9a2';
  for (const sx of STREET_XS) g.fillRect(sx - ROAD_W / 2 - 15, 0, ROAD_W + 30, WORLD_H);
  for (const sy of STREET_YS) g.fillRect(0, sy - ROAD_W / 2 - 15, WORLD_W, ROAD_W + 30);
  // Pavement joints.
  g.fillStyle = 'rgba(70,70,66,0.25)';
  for (const sx of STREET_XS) {
    for (let y = 0; y < WORLD_H; y += 46) g.fillRect(sx - ROAD_W / 2 - 15, y, ROAD_W + 30, 2);
  }
  // Asphalt with grain and patched scars.
  for (const sx of STREET_XS) {
    g.fillStyle = '#33373d';
    g.fillRect(sx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  }
  for (const sy of STREET_YS) {
    g.fillStyle = '#33373d';
    g.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
  }
  for (let i = 0; i < 5200; i++) {
    const onV = i % 2 === 0;
    const line = onV ? STREET_XS[i % STREET_XS.length] : STREET_YS[i % STREET_YS.length];
    const along = hash2(i, 23, 107) * (onV ? WORLD_H : WORLD_W);
    const across = (hash2(i, 29, 107) - 0.5) * (ROAD_W - 14);
    const x = onV ? line + across : along;
    const y = onV ? along : line + across;
    if (x > WATER_X - BEACH_W) continue;
    g.fillStyle = hash2(i, 31, 107) > 0.6 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
    g.fillRect(x, y, 3.4, 2.4);
  }
  for (let i = 0; i < 130; i++) {
    const onV = i % 2 === 0;
    const line = onV ? STREET_XS[(i * 3) % STREET_XS.length] : STREET_YS[(i * 5) % STREET_YS.length];
    const along = hash2(i, 37, 109) * (onV ? WORLD_H : WORLD_W);
    const x = onV ? line + (hash2(i, 41, 109) - 0.5) * 60 : along;
    const y = onV ? along : line + (hash2(i, 43, 109) - 0.5) * 60;
    if (x > WATER_X - BEACH_W) continue;
    g.fillStyle = 'rgba(18,19,22,0.35)';
    g.fillRect(x, y, onV ? 26 : 44, onV ? 44 : 26); // tar-patch scars
  }
  // Centre dashes: amber on the avenues.
  g.fillStyle = '#e8b93c';
  for (const sx of STREET_XS) {
    for (let y = 14; y < WORLD_H; y += 64) {
      if (Math.abs(((y % BLOCK) + BLOCK) % BLOCK) < ROAD_W / 2 + 20) continue;
      g.fillRect(sx - 3, y, 6, 34);
    }
  }
  for (const sy of STREET_YS) {
    for (let x = 14; x < WORLD_W; x += 64) {
      if (Math.abs(((x % BLOCK) + BLOCK) % BLOCK) < ROAD_W / 2 + 20) continue;
      if (x > WATER_X - BEACH_W) break;
      g.fillRect(x, sy - 3, 34, 6);
    }
  }
  // Lane edge lines.
  g.fillStyle = 'rgba(232,230,224,0.5)';
  for (const sx of STREET_XS) {
    g.fillRect(sx - ROAD_W / 2 + 5, 0, 3, WORLD_H);
    g.fillRect(sx + ROAD_W / 2 - 8, 0, 3, WORLD_H);
  }
  for (const sy of STREET_YS) {
    g.fillRect(0, sy - ROAD_W / 2 + 5, WORLD_W, 3);
    g.fillRect(0, sy + ROAD_W / 2 - 8, WORLD_W, 3);
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(238,236,228,0.75)';
  for (const sx of STREET_XS) {
    for (const sy of STREET_YS) {
      if (sx > WATER_X - BEACH_W) continue;
      for (let s = -2; s <= 2; s++) {
        g.fillRect(sx + s * 22 - 7, sy - ROAD_W / 2 - 13, 14, 11);
        g.fillRect(sx + s * 22 - 7, sy + ROAD_W / 2 + 2, 14, 11);
        g.fillRect(sx - ROAD_W / 2 - 13, sy + s * 22 - 7, 11, 14);
        g.fillRect(sx + ROAD_W / 2 + 2, sy + s * 22 - 7, 11, 14);
      }
    }
  }
  // Car parks and plazas from the prop list get their tarmac here.
  for (const prop of world.props) {
    if (prop.kind === 'carpark') {
      g.fillStyle = '#3d4046';
      g.fillRect(prop.x, prop.y, prop.w, prop.h);
      g.strokeStyle = 'rgba(238,236,228,0.55)';
      g.lineWidth = 2;
      for (let s = 0; s < 5; s++) {
        g.strokeRect(prop.x + 12 + s * ((prop.w - 24) / 4), prop.y + 10, (prop.w - 24) / 4 - 6, prop.h - 20);
      }
    }
  }
  return cv;
}

/** Small text helper shared by the world's painted signs. */
function label(g, value, x, y, size, color, align = 'center', weight = 800) {
  g.font = `${weight} ${size}px 'Segoe UI', Arial, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(value, x, y);
}

function drawProp(g, prop, light, time) {
  const { x, y } = prop;
  switch (prop.kind) {
    case 'palm': {
      const sway = Math.sin(time * 0.9 + prop.seed * 9) * 2;
      g.fillStyle = 'rgba(0,0,0,0.20)';
      g.beginPath(); g.ellipse(x + 10 + light.shadowX * 0.4, y + 12 + light.shadowY * 0.4, 26, 12, 0.4, 0, 6.29); g.fill();
      g.strokeStyle = '#7a5c38';
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(x, y + 12); g.quadraticCurveTo(x + 3, y + 2, x + 5, y - 8); g.stroke();
      g.strokeStyle = '#2e7d46';
      g.lineWidth = 4.4;
      for (let f = 0; f < 7; f++) {
        const a = (f / 7) * Math.PI * 2 + prop.seed * 3;
        g.beginPath();
        g.moveTo(x + 5, y - 8);
        g.quadraticCurveTo(x + 5 + Math.cos(a) * 20 + sway, y - 10 + Math.sin(a) * 9, x + 5 + Math.cos(a) * 32 + sway * 1.6, y - 2 + Math.sin(a) * 15);
        g.stroke();
      }
      break;
    }
    case 'shade': {
      // Beach umbrella: a striped canopy disc on a tilted pole.
      const cols = ['#e23b2e', '#37b6ff', '#ffd94d', '#e56ba1', '#7ddc6a'];
      const c = cols[Math.floor(prop.seed * cols.length) % cols.length];
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath(); g.ellipse(x + 9, y + 11, 21, 9, 0.4, 0, 6.29); g.fill();
      g.strokeStyle = '#8a6f47'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(x - 3, y + 8); g.lineTo(x + 1, y - 2); g.stroke();
      for (let sIdx = 0; sIdx < 6; sIdx++) {
        g.fillStyle = sIdx % 2 ? '#f4f1e8' : c;
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, 19, (sIdx / 6) * 6.29, ((sIdx + 1) / 6) * 6.29);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#5d4a2e';
      g.beginPath(); g.arc(x, y, 2.6, 0, 6.29); g.fill();
      break;
    }
    case 'towel': {
      const cols = ['#e56ba1', '#37b6ff', '#ffd94d', '#f4f1e8'];
      g.save(); g.translate(x, y); g.rotate(prop.seed * 3);
      g.fillStyle = cols[Math.floor(prop.seed * cols.length) % cols.length];
      g.fillRect(-13, -6, 26, 12);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(-13, -2, 26, 3);
      g.restore();
      break;
    }
    case 'stand': {
      // Lifeguard stand: white A-frame tower with a red cross board.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath(); g.ellipse(x + 6, y + 9, 20, 8, 0.3, 0, 6.29); g.fill();
      g.fillStyle = '#eef1f5';
      g.fillRect(x - 13, y - 13, 26, 26);
      g.fillStyle = '#c23b2e';
      g.fillRect(x - 2.4, y - 9, 4.8, 18);
      g.fillRect(x - 9, y - 2.4, 18, 4.8);
      g.strokeStyle = 'rgba(40,44,50,0.6)'; g.lineWidth = 1.6;
      g.strokeRect(x - 13, y - 13, 26, 26);
      break;
    }
    case 'bin': {
      // Alley dumpster: green steel box, lid ajar, bags beside it.
      g.save(); g.translate(x, y); g.rotate((prop.seed - 0.5) * 0.5);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(-15, -9, 34, 22);
      g.fillStyle = '#2e5d43'; g.fillRect(-17, -12, 34, 24);
      g.fillStyle = '#26503a'; g.fillRect(-17, -12, 34, 6);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-17, -12, 34, 3);
      g.fillStyle = '#14161a';
      g.beginPath(); g.arc(22, 8, 6.4, 0, 6.29); g.fill();
      g.beginPath(); g.arc(26, -4, 5, 0, 6.29); g.fill();
      g.restore();
      break;
    }
    case 'fountain': {
      // The Centro Plaza fountain: two stone basins, breathing water
      // rings, and a five-way jet that catches the hour's light.
      g.fillStyle = 'rgba(10,12,10,0.20)';
      g.beginPath(); g.ellipse(x + 5, y + 7, 66, 40, 0, 0, 6.29); g.fill();
      g.fillStyle = '#9aa0a2';
      g.beginPath(); g.ellipse(x, y, 64, 38, 0, 0, 6.29); g.fill();
      g.fillStyle = '#3f8fae';
      g.beginPath(); g.ellipse(x, y, 55, 31, 0, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(235,250,255,0.5)';
      g.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        const rr = 0.35 + k * 0.22 + Math.sin(time * 1.7 + k * 2.1) * 0.03;
        g.beginPath(); g.ellipse(x, y, 55 * rr, 31 * rr, 0, 0, 6.29); g.stroke();
      }
      g.fillStyle = '#b9bfc2';
      g.beginPath(); g.ellipse(x, y, 17, 10.5, 0, 0, 6.29); g.fill();
      g.fillStyle = '#5fb6d6';
      g.beginPath(); g.ellipse(x, y, 12.5, 7.4, 0, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(240,252,255,0.75)';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + time * 0.7;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 5 - 7, x + Math.cos(a) * 15, y + Math.sin(a) * 9);
        g.stroke();
      }
      break;
    }
    case 'lamp': {
      g.fillStyle = '#22242c';
      g.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
      g.fillStyle = '#ffd98a';
      g.beginPath(); g.arc(x, y, 3.4, 0, 6.29); g.fill();
      break;
    }
    case 'crate': {
      g.save(); g.translate(x, y); g.rotate(prop.seed * 3);
      g.fillStyle = '#8a6f47'; g.fillRect(-11, -11, 22, 22);
      g.strokeStyle = 'rgba(60,44,20,0.7)'; g.lineWidth = 2; g.strokeRect(-11, -11, 22, 22);
      g.beginPath(); g.moveTo(-11, -11); g.lineTo(11, 11); g.moveTo(11, -11); g.lineTo(-11, 11); g.stroke();
      g.restore();
      break;
    }
    case 'container': {
      const colors = ['#b5523c', '#3c6e91', '#4a7a4f', '#c9862e', '#707880'];
      const c = colors[Math.floor(prop.seed * colors.length)];
      g.save(); g.translate(x, y); g.rotate(prop.angle);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(-52, -16 + 6, 108, 38);
      g.fillStyle = c; g.fillRect(-54, -19, 108, 38);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let r = -44; r < 50; r += 13) g.fillRect(r, -19, 5, 38);
      g.fillStyle = 'rgba(255,255,255,0.20)'; g.fillRect(-54, -19, 108, 5);
      g.restore();
      break;
    }
    case 'barrier': {
      g.save(); g.translate(x, y);
      g.fillStyle = '#e8e6e0'; g.fillRect(-30, -6, 60, 12);
      g.fillStyle = '#e8641e';
      for (let s = -30; s < 30; s += 20) g.fillRect(s, -6, 10, 12);
      g.restore();
      break;
    }
    case 'bench': {
      g.fillStyle = '#6e4f30'; g.fillRect(x - 16, y - 5, 32, 10);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - 16, y - 1.6, 32, 3);
      break;
    }
    case 'planter': {
      g.fillStyle = '#7d7468'; g.fillRect(x - 15, y - 15, 30, 30);
      g.fillStyle = '#2e7d46';
      g.beginPath(); g.arc(x, y, 11 + prop.seed * 5, 0, 6.29); g.fill();
      g.fillStyle = '#3f9e58';
      g.beginPath(); g.arc(x - 4, y - 3, 6, 0, 6.29); g.fill();
      break;
    }
    case 'hedge': {
      g.fillStyle = '#2c6e3e';
      g.fillRect(x, y, prop.w || 12, prop.h || 40);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x, y, prop.w || 12, 5);
      break;
    }
    case 'pool': {
      g.fillStyle = '#37b6ff'; g.fillRect(x, y, prop.w, prop.h);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 6, y + 6, prop.w - 12, 5);
      g.strokeStyle = '#e8e6e0'; g.lineWidth = 3; g.strokeRect(x, y, prop.w, prop.h);
      break;
    }
    case 'stall': {
      g.fillStyle = '#c23b2e'; g.fillRect(x - 26, y - 12, 52, 24);
      g.fillStyle = '#e8e6e0';
      for (let s = -26; s < 26; s += 13) g.fillRect(s + x, y - 12, 6.5, 24);
      g.fillStyle = '#7a4a2e'; g.fillRect(x - 20, y + 4, 40, 7);
      break;
    }
    case 'sign': {
      const glow = 0.35 + light.night * 0.65;
      g.fillStyle = `rgba(229,107,161,${glow})`;
      g.beginPath(); g.arc(x, y, 7 + light.night * 3, 0, 6.29); g.fill();
      g.fillStyle = '#2c1424'; g.fillRect(x - 2, y, 4, 16);
      break;
    }
    case 'pier': {
      g.fillStyle = '#8a6f47';
      g.fillRect(x - prop.w / 2, y - prop.h / 2, prop.w, prop.h);
      g.fillStyle = 'rgba(60,44,20,0.5)';
      for (let px = -prop.w / 2; px < prop.w / 2; px += 18) g.fillRect(x + px, y - prop.h / 2, 2.4, prop.h);
      break;
    }
    case 'boat': {
      g.save(); g.translate(x, y); g.rotate(prop.angle);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(4, 6, 44, 13, 0, 0, 6.29); g.fill();
      g.fillStyle = '#e8e6e0';
      g.beginPath();
      g.moveTo(-40, 0); g.lineTo(-26, -11); g.lineTo(28, -9); g.lineTo(42, 0); g.lineTo(28, 9); g.lineTo(-26, 11);
      g.closePath(); g.fill();
      g.fillStyle = '#28418c'; g.fillRect(-16, -6, 26, 12);
      g.fillStyle = '#c9862e'; g.fillRect(14, -3.4, 12, 6.8);
      g.restore();
      break;
    }
    default:
      break;
  }
}

function drawBuilding(g, b, light) {
  // Sun shadow first: a soft offset slab.
  g.fillStyle = `rgba(10,14,10,${light.shadowAlpha})`;
  g.fillRect(b.x + light.shadowX, b.y + light.shadowY, b.w, b.h);
  // Walls (the visible rim) then the roof inset by the parapet.
  g.fillStyle = b.wall;
  g.fillRect(b.x, b.y, b.w, b.h);
  const inset = b.kind === 'tower' ? 7 : 5 + Math.min(9, b.floors);
  const rx = b.x + inset;
  const ry = b.y + inset;
  const rw = b.w - inset * 2;
  const rh = b.h - inset * 2;
  g.fillStyle = b.roof;
  g.fillRect(rx, ry, rw, rh);
  // Roof grain: deterministic speckle from the building's seed.
  g.fillStyle = 'rgba(0,0,0,0.10)';
  const speckles = Math.floor((rw * rh) / 2600);
  for (let s = 0; s < speckles; s++) {
    const sx = rx + hash2(s, Math.round(b.x), 131) * rw;
    const sy = ry + hash2(s, Math.round(b.y), 137) * rh;
    g.fillRect(sx, sy, 5, 3.4);
  }
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(rx, ry, rw, 4);
  // Parapet line.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 2;
  g.strokeRect(rx, ry, rw, rh);
  if (b.kind === 'tower') {
    // Glass crown: mullion grid and a plant room; lit windows creep in at night.
    g.strokeStyle = 'rgba(180,220,255,0.20)';
    g.lineWidth = 1.4;
    for (let gx = rx + 16; gx < rx + rw - 6; gx += 22) { g.beginPath(); g.moveTo(gx, ry + 4); g.lineTo(gx, ry + rh - 4); g.stroke(); }
    for (let gy = ry + 16; gy < ry + rh - 6; gy += 22) { g.beginPath(); g.moveTo(rx + 4, gy); g.lineTo(rx + rw - 4, gy); g.stroke(); }
    g.fillStyle = 'rgba(20,24,34,0.5)';
    g.fillRect(rx + rw * 0.36, ry + rh * 0.34, rw * 0.28, rh * 0.3);
    if (light.night > 0.15) {
      g.fillStyle = `rgba(255,205,110,${0.75 * light.night})`;
      const lit = Math.floor(4 + b.seed * 14 * light.night);
      for (let s = 0; s < lit; s++) {
        const wx = rx + 8 + hash2(s, Math.round(b.x * 3), 139) * (rw - 16);
        const wy = ry + 8 + hash2(s, Math.round(b.y * 3), 149) * (rh - 16);
        g.fillRect(wx, wy, 5.4, 3.6);
      }
    }
  } else {
    // Rooftop clutter: AC boxes, a skylight, sometimes a water tank.
    const boxes = 1 + Math.floor(b.seed * 4);
    g.fillStyle = 'rgba(52,54,58,0.55)';
    for (let s = 0; s < boxes; s++) {
      const bx = rx + 8 + hash2(s, Math.round(b.x), 151) * (rw - 34);
      const by = ry + 8 + hash2(s, Math.round(b.y), 157) * (rh - 30);
      g.fillRect(bx, by, 15 + b.seed * 8, 11 + b.seed * 6);
    }
    if (b.seed > 0.55) {
      g.fillStyle = 'rgba(170,220,240,0.4)';
      g.fillRect(rx + rw * 0.18, ry + rh * 0.2, rw * 0.3, rh * 0.16);
    }
    if (b.kind === 'shed' || b.kind === 'club') {
      g.fillStyle = 'rgba(255,255,255,0.13)';
      for (let s = 0; s < 4; s++) g.fillRect(rx + 10, ry + 12 + s * (rh - 20) / 4, rw - 20, 3);
    }
    // Club neon: a sign strip on the roof edge that wakes up as the light
    // drops — the Strip should start glowing before the streetlights do.
    if (b.kind === 'club') {
      const neonCols = ['#ff5da2', '#37b6ff', '#ffd94d', '#7ddc6a', '#ff7847'];
      const col = neonCols[Math.floor(b.seed * neonCols.length) % neonCols.length];
      const glow = clamp(light.dark * 1.4 + light.sunGlow * 0.55, 0, 1);
      if (glow > 0.04) {
        g.globalAlpha = glow;
        g.fillStyle = col;
        g.fillRect(rx + 6, ry + 6, rw - 12, 4.6);
        g.globalAlpha = glow * 0.30;
        g.fillRect(rx + 2, ry + 2, rw - 4, 12);
        g.globalAlpha = 1;
      }
    }
  }
  // Shop awnings are painted by the shops pass; walls get a grime foot.
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(b.x, b.y + b.h - 5, b.w, 5);
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawCar(g, car, light, time) {
  const m = car.model;
  const L = m.len;
  const W = m.wid;
  g.save();
  g.translate(car.x, car.y);
  // Ground shadow.
  g.fillStyle = `rgba(8,10,8,${0.30 - light.dark * 0.08})`;
  roundRectPath(g, -L / 2 + light.shadowX * 0.7, -W / 2 + 4 + light.shadowY * 0.7, L, W, 10);
  g.fill();
  g.rotate(car.angle);
  const isPolice = car.driver === 'police' || car.modelId === 'police' || car.modelId === 'policesuv';
  const isTaxi = car.modelId === 'taxi';
  // Body.
  g.fillStyle = car.color;
  roundRectPath(g, -L / 2, -W / 2, L, W, 11);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  g.stroke();
  // Nose shading and tail.
  g.fillStyle = 'rgba(255,255,255,0.13)';
  roundRectPath(g, L * 0.30, -W / 2 + 4, L * 0.18, W - 8, 7);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.20)';
  roundRectPath(g, -L * 0.48, -W / 2 + 4, L * 0.13, W - 8, 6);
  g.fill();
  // Tail lights: a dusk-red pair at the rear, flaring when the pedals
  // say so — braking, handbrake, or a roadblock unit holding its post.
  const braking = car.braking || car.brakeHold;
  if (light.dark > 0.18 || braking) {
    g.fillStyle = braking ? '#ff2d20' : 'rgba(255,60,50,0.55)';
    g.fillRect(-L / 2 + 1, -W * 0.34, 4.4, W * 0.2);
    g.fillRect(-L / 2 + 1, W * 0.14, 4.4, W * 0.2);
    if (braking) {
      g.fillStyle = 'rgba(255,45,32,0.16)';
      g.beginPath(); g.ellipse(-L / 2 - 5, 0, 13, W * 0.42, 0, 0, 6.29); g.fill();
    }
  }
  if (isPolice) {
    g.fillStyle = '#eef1f5';
    roundRectPath(g, -L * 0.16, -W / 2 + 2, L * 0.4, W - 4, 8);
    g.fill();
    g.fillStyle = '#101318';
    roundRectPath(g, L * 0.02, -W / 2 + 6, L * 0.13, W - 12, 5);
    g.fill();
  }
  // Cabin: windshield, roof, rear glass.
  g.fillStyle = 'rgba(16,22,30,0.88)';
  roundRectPath(g, -L * 0.06, -W * 0.40, L * 0.34, W * 0.8, 6);
  g.fill();
  g.fillStyle = isPolice ? '#eef1f5' : car.color;
  roundRectPath(g, -L * 0.02, -W * 0.335, L * 0.24, W * 0.67, 5);
  g.fill();
  g.fillStyle = 'rgba(150,205,235,0.55)';
  roundRectPath(g, L * 0.235, -W * 0.36, L * 0.055, W * 0.72, 3);
  g.fill();
  roundRectPath(g, -L * 0.115, -W * 0.36, L * 0.045, W * 0.72, 3);
  g.fill();
  if (isTaxi) {
    g.fillStyle = '#101318';
    g.fillRect(-8, -8, 16, 16);
    label(g, 'TAXI', 0, 0.5, 8.6, '#f7b731');
    g.fillStyle = 'rgba(16,19,24,0.8)';
    for (let s = 0; s < 6; s++) g.fillRect(-L / 2 + 6 + s * 4.4, W / 2 - 6, 4.4, 3.4);
  }
  if (car.modelId === 'muscle') {
    g.fillStyle = 'rgba(16,19,24,0.85)';
    g.fillRect(-L * 0.30, -3.4, L * 0.52, 6.8); // racing stripe pair
    g.fillRect(-L * 0.30, -10, L * 0.52, 3.6);
    g.fillRect(-L * 0.30, 6.4, L * 0.52, 3.6);
  }
  if (car.modelId === 'truck' || car.modelId === 'van') {
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(-L * 0.46, -W / 2 + 5, L * 0.34, W - 10);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.strokeRect(-L * 0.46, -W / 2 + 5, L * 0.34, W - 10);
  }
  // Wheels (front pair steers).
  g.fillStyle = '#0c0d10';
  const wy = W / 2 - 3;
  for (const [wx, front] of [[L * 0.32, 1], [-L * 0.32, 0]]) {
    for (const side of [-1, 1]) {
      g.save();
      g.translate(wx, side * wy);
      if (front) g.rotate(car.steerVis * 0.42);
      roundRectPath(g, -10, -4.4, 20, 8.8, 3);
      g.fill();
      g.restore();
    }
  }
  // Headlight cones once the day drops: two soft fans on the asphalt.
  if (light.dark > 0.26 && car.driver !== 'parked' && car.driver !== 'heli') {
    const cone = g.createLinearGradient(L / 2, 0, L * 2.05, 0);
    cone.addColorStop(0, `rgba(255,240,190,${0.16 * light.dark + 0.05})`);
    cone.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = cone;
    for (const sideSign of [-1, 1]) {
      g.beginPath();
      g.moveTo(L / 2 - 2, sideSign * W * 0.30);
      g.lineTo(L * 2.05, sideSign * W * 0.85);
      g.lineTo(L * 2.05, sideSign * W * 0.18);
      g.closePath();
      g.fill();
    }
  }
  // Lights.
  g.fillStyle = '#ffe9a8';
  g.fillRect(L / 2 - 4, -W * 0.34, 4.4, 8);
  g.fillRect(L / 2 - 4, W * 0.34 - 8, 4.4, 8);
  g.fillStyle = '#e23b2e';
  g.fillRect(-L / 2 - 0.6, -W * 0.34, 4, 8);
  g.fillRect(-L / 2 - 0.6, W * 0.34 - 8, 4, 8);
  // Police lightbar: alternating red/blue, flashing on the siren phase.
  if (isPolice) {
    const phase = Math.sin(car.siren * 6) > 0;
    g.fillStyle = phase ? '#ff3b30' : '#2e6bff';
    roundRectPath(g, -12, -W * 0.30, 24, W * 0.27, 3);
    g.fill();
    g.fillStyle = phase ? '#2e6bff' : '#ff3b30';
    roundRectPath(g, -12, 2, 24, W * 0.27 - 2, 3);
    g.fill();
    const glow = 0.09 + 0.04 * Math.sin(car.siren * 6);
    g.fillStyle = phase ? `rgba(255,59,48,${glow})` : `rgba(46,107,255,${glow})`;
    g.beginPath(); g.arc(0, 0, L * 0.46, 0, 6.29); g.fill();
  }
  // Open door (carjack moment).
  if (car.doorOpen > 0.05) {
    g.save();
    g.translate(L * 0.08, -W / 2);
    g.rotate(-1.15 * car.doorOpen);
    g.fillStyle = car.color;
    g.fillRect(0, -3, L * 0.26, 6);
    g.restore();
  }
  // Damage scorch.
  if (car.hp < car.maxHp * 0.4) {
    g.fillStyle = 'rgba(10,10,10,0.4)';
    g.beginPath(); g.ellipse(L * 0.28, -W * 0.18, 13, 7, 0.3, 0, 6.29); g.fill();
  }
  g.restore();
}

function drawHeli(g, car, state, light) {
  // Shadow far below, then the machine itself with a blurred rotor disc.
  g.fillStyle = 'rgba(8,10,8,0.28)';
  g.beginPath(); g.ellipse(car.x + 70, car.y + 92, 56, 19, 0.5, 0, 6.29); g.fill();
  // Searchlight cone onto the player when the light is low or the hour golden.
  if (light.dark > 0.06 || light.sunGlow > 0) {
    const p = state.player;
    const grad = g.createRadialGradient(p.x, p.y, 6, p.x, p.y, 78);
    grad.addColorStop(0, 'rgba(255,244,190,0.30)');
    grad.addColorStop(1, 'rgba(255,244,190,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(car.x, car.y);
    g.lineTo(p.x - 62, p.y + 46);
    g.lineTo(p.x + 62, p.y + 46);
    g.closePath();
    g.fill();
    g.beginPath(); g.arc(p.x, p.y, 72, 0, 6.29); g.fill();
  }
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.angle);
  g.fillStyle = 'rgba(190,220,245,0.16)';
  g.beginPath(); g.arc(0, 0, 60, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(230,240,250,0.45)';
  g.lineWidth = 4;
  const ra = car.siren * 3.1;
  g.beginPath();
  g.moveTo(Math.cos(ra) * -57, Math.sin(ra) * -57);
  g.lineTo(Math.cos(ra) * 57, Math.sin(ra) * 57);
  g.moveTo(Math.cos(ra + 1.57) * -57, Math.sin(ra + 1.57) * -57);
  g.lineTo(Math.cos(ra + 1.57) * 57, Math.sin(ra + 1.57) * 57);
  g.stroke();
  g.fillStyle = '#14181f';
  roundRectPath(g, -52, -20, 96, 40, 16);
  g.fill();
  g.fillRect(30, -5, 66, 10); // tail boom
  g.fillRect(88, -16, 7, 32);
  g.fillStyle = 'rgba(150,205,235,0.7)';
  roundRectPath(g, 18, -14, 26, 28, 8);
  g.fill();
  g.fillStyle = '#eef1f5';
  label(g, 'SBPD', -8, 0, 12.5, '#eef1f5');
  g.fillStyle = Math.sin(car.siren * 6) > 0 ? '#ff3b30' : '#2e6bff';
  g.beginPath(); g.arc(-30, 0, 5, 0, 6.29); g.fill();
  g.restore();
}

function drawPerson(g, x, y, angle, shirt, pants, skin, opts = {}) {
  const step = opts.stepPhase || 0;
  const moving = opts.moving;
  g.fillStyle = 'rgba(8,10,8,0.26)';
  g.beginPath(); g.ellipse(x + 3, y + 5, 10, 5.4, 0, 0, 6.29); g.fill();
  if (opts.hidden) return; // the caller draws this figure itself (swimming)
  g.save();
  g.translate(x, y);
  if (opts.down) {
    g.rotate(angle + 1.5);
    g.fillStyle = pants; g.fillRect(-4, 2, 8, 15);
    g.fillStyle = shirt; roundRectPath(g, -6.4, -12, 12.8, 15, 5); g.fill();
    g.fillStyle = skin; g.beginPath(); g.arc(0, -16, 5.6, 0, 6.29); g.fill();
    g.restore();
    return;
  }
  g.rotate(angle);
  // Legs scissor when moving; a sitter's legs stretch out along the bench.
  const sw = moving ? Math.sin(step) * 6 : 0;
  g.fillStyle = pants;
  if (opts.sit) {
    g.fillRect(3, -7.6, 14, 5.4);
    g.fillRect(3, 2.2, 14, 5.4);
  } else {
    g.fillRect(2 + sw * 0.4, -7.4, 9, 5.6);
    g.fillRect(2 - sw * 0.4, 1.8, 9, 5.6);
  }
  // Torso and arms.
  g.fillStyle = shirt;
  roundRectPath(g, -8, -8.6, 16.5, 17.2, 6);
  g.fill();
  const armSwing = opts.armsUp ? -9 : moving ? -sw * 0.5 : 0;
  g.fillRect(-11 + armSwing * 0.3, -12.4, 12, 4.6);
  g.fillRect(-11 - armSwing * 0.3, 7.8, 12, 4.6);
  if (opts.phone) {
    // One hand up, phone to the ear — the universal Sunset Bay pose.
    g.fillStyle = shirt;
    g.fillRect(0, -14.5, 11, 4.2);
    g.fillStyle = '#14161a';
    g.fillRect(9, -15.5, 3.4, 6.4);
  }
  if (opts.gun) {
    g.fillStyle = '#14161a';
    g.fillRect(6, -1.8, opts.gun === 'rifle' ? 24 : 16, 3.6);
  }
  g.fillStyle = skin;
  g.beginPath(); g.arc(1.6, 0, 6.1, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(30,22,16,0.85)';
  g.beginPath(); g.arc(0.4, 0, 6.1, Math.PI * 0.6, Math.PI * 1.65); g.fill();
  g.restore();
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  let ground = null;

  function drawWorld(state) {
    if (!ground) ground = bakeGround(state.world);
    const cam = state.camera;
    const light = lightingAt(state.hour);
    // Weather leans on the light: a rain front greys the sun out and
    // pulls the whole city a shade darker, golden hour or not.
    if (state.weather && state.weather.kind !== 'clear') {
      const cover = state.weather.intensity * (state.weather.kind === 'rain' ? 1 : 0.6);
      light.dark = Math.min(0.62, light.dark + cover * 0.16);
      light.sunGlow *= 1 - cover * 0.55;
      light.tint = light.tint.map((c, i) => c * (1 - cover * 0.10) + (i === 2 ? cover * 0.03 : 0));
    }
    state.light = light;
    const vw = VIEW_W / cam.zoom;
    const vh = VIEW_H / cam.zoom;
    const x0 = cam.x - vw / 2;
    const y0 = cam.y - vh / 2;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#144a75';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.setTransform(cam.zoom, 0, 0, cam.zoom, VIEW_W / 2 - cam.x * cam.zoom, VIEW_H / 2 - cam.y * cam.zoom);
    if (cam.shake > 0.2) {
      g.translate((hash2(Math.floor(state.time * 40), 3, 211) - 0.5) * cam.shake, (hash2(3, Math.floor(state.time * 40), 211) - 0.5) * cam.shake);
    }
    g.drawImage(ground, 0, 0, WORLD_W, WORLD_H);

    // Animated water glints.
    if (x0 + vw > WATER_X) {
      g.fillStyle = 'rgba(255,255,255,0.13)';
      for (let i = 0; i < 26; i++) {
        const wx = WATER_X + 16 + hash2(i, Math.floor(state.time * 0.7), 223) * (WORLD_W - WATER_X - 40);
        const wy = hash2(i, 5, 227) * WORLD_H;
        if (wx > x0 && wx < x0 + vw && wy > y0 && wy < y0 + vh) g.fillRect(wx, wy, 30, 2.6);
      }
    }

    // Props behind buildings (ground clutter), then buildings, then fronts.
    for (const prop of state.world.props) {
      if (prop.x < x0 - 90 || prop.x > x0 + vw + 90 || prop.y < y0 - 90 || prop.y > y0 + vh + 90) continue;
      if (prop.kind === 'carpark') continue; // baked
      drawProp(g, prop, light, state.time);
    }
    for (const b of state.world.buildings) {
      if (b.x + b.w < x0 - 60 || b.x > x0 + vw + 60 || b.y + b.h < y0 - 60 || b.y > y0 + vh + 60) continue;
      drawBuilding(g, b, light);
    }
    // Shop fronts: striped awning (rotates with the frontage), then a sign
    // board drawn unrotated — shop names must read upright from any side.
    for (const shop of state.world.shops) {
      if (shop.x < x0 - 80 || shop.x > x0 + vw + 80 || shop.y < y0 - 80 || shop.y > y0 + vh + 80) continue;
      const kind = SHOP_KINDS[shop.kind];
      g.save();
      g.translate(shop.x, shop.y);
      g.rotate(shop.angle + Math.PI / 2);
      g.fillStyle = kind.color;
      g.fillRect(-44, -13, 88, 26);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let s = -44; s < 44; s += 11) g.fillRect(s, -13, 5, 26);
      g.restore();
      g.fillStyle = '#14161a';
      g.fillRect(shop.x - 50, shop.y - 40, 100, 16);
      label(g, kind.name, shop.x, shop.y - 32, 10.5, kind.color);
      g.fillStyle = kind.color;
      g.beginPath(); g.arc(shop.x, shop.y, 5.4, 0, 6.29); g.fill();
    }

    // Mission marker: a gold pillar of light on the objective.
    const marker = state.marker;
    if (marker) {
      const pulse = 0.72 + Math.sin(state.time * 4.2) * 0.28;
      const grad = g.createLinearGradient(marker.x, marker.y - 340, marker.x, marker.y);
      grad.addColorStop(0, 'rgba(255,205,50,0)');
      grad.addColorStop(1, `rgba(255,205,50,${0.30 * pulse})`);
      g.fillStyle = grad;
      g.fillRect(marker.x - 13, marker.y - 340, 26, 340);
      g.strokeStyle = `rgba(255,205,50,${0.95 * pulse})`;
      g.lineWidth = 4;
      g.beginPath(); g.arc(marker.x, marker.y, 30 + Math.sin(state.time * 4.2) * 5, 0, 6.29); g.stroke();
      g.fillStyle = '#ffcd32';
      g.beginPath();
      g.moveTo(marker.x, marker.y + 16);
      g.lineTo(marker.x - 11, marker.y - 4);
      g.lineTo(marker.x + 11, marker.y - 4);
      g.closePath(); g.fill();
    }

    // Dead drops: a secret keeps a low profile — a small taped cache
    // that only catches the light when you are already close enough
    // to be looking for it.
    if (state.world.stashes) {
      for (const stash of state.world.stashes) {
        if (stash.taken) continue;
        const dd = Math.hypot(stash.x - state.player.x, stash.y - state.player.y);
        if (dd > 620) continue;
        const glow = 0.35 + 0.3 * Math.sin(state.time * 3.1 + stash.x);
        g.fillStyle = 'rgba(20,18,12,0.85)';
        g.fillRect(stash.x - 8, stash.y - 6, 16, 12);
        g.fillStyle = `rgba(255,205,50,${glow})`;
        g.fillRect(stash.x - 8, stash.y - 1.5, 16, 3);
        g.fillStyle = 'rgba(240,240,235,0.8)';
        g.fillRect(stash.x - 1.5, stash.y - 6, 3, 12);
      }
    }

    // Skid marks.
    g.fillStyle = 'rgba(12,12,14,0.5)';
    for (const s of state.skids) {
      g.save(); g.translate(s.x, s.y); g.rotate(s.angle);
      g.fillRect(-s.len / 2, -2.6, s.len, 5.2);
      g.restore();
    }

    // Cars, sorted so lower ones overlap higher ones.
    const sorted = state.cars.slice().sort((a, b) => a.y - b.y);
    for (const car of sorted) {
      if (car.driver === 'heli') continue;
      if (car.x < x0 - 160 || car.x > x0 + vw + 160 || car.y < y0 - 160 || car.y > y0 + vh + 160) continue;
      drawCar(g, car, light, state.time);
    }
    // People.
    for (const ped of state.peds) {
      if (ped.x < x0 - 40 || ped.x > x0 + vw + 40 || ped.y < y0 - 40 || ped.y > y0 + vh + 40) continue;
      // A conversation wears a bubble: two neighbours mid-story get a
      // small white card with drifting dots — gossip, made visible.
      if (ped.state === 'chat' && ped.id < (ped.partnerId || 0)) {
        const bx = ped.x + 14;
        const by = ped.y - 30 + Math.sin(state.time * 2 + ped.id) * 1.6;
        g.fillStyle = 'rgba(250,250,248,0.92)';
        g.beginPath(); g.ellipse(bx, by, 13, 8.5, 0, 0, 6.29); g.fill();
        g.fillStyle = 'rgba(40,40,46,0.85)';
        for (let dot = 0; dot < 3; dot++) {
          g.beginPath();
          g.arc(bx - 6 + dot * 6, by + Math.sin(state.time * 5 + dot * 1.3 + ped.id) * 1.4, 1.7, 0, 6.29);
          g.fill();
        }
      }
      drawPerson(g, ped.x, ped.y, ped.angle, ped.shirt, ped.pants, ped.skin, {
        moving: ped.speed > 12, stepPhase: ped.stepPhase, down: ped.state === 'down', armsUp: ped.state === 'flee',
        sit: ped.state === 'sit', phone: ped.state === 'stand' && ped.pose === 'phone',
        gun: ped.state === 'hostile' ? 'pistol' : null,
      });
    }
    const p = state.player;
    if (!p.car) {
      // A swimmer rides low: a wake ring, shoulders, and a head above the
      // waterline — the rest of him is the bay's business.
      if (p.swimming) {
        g.strokeStyle = 'rgba(230,245,250,0.55)';
        g.lineWidth = 2;
        const wob = 1 + Math.sin(state.time * 6) * 0.12;
        g.beginPath(); g.ellipse(p.x, p.y, 15 * wob, 9 * wob, 0, 0, 6.29); g.stroke();
        g.fillStyle = p.shirt;
        g.beginPath(); g.ellipse(p.x, p.y, 10, 7, p.angle, 0, 6.29); g.fill();
        g.fillStyle = p.skin;
        g.beginPath(); g.arc(p.x + Math.cos(p.angle) * 3, p.y + Math.sin(p.angle) * 3, 5.8, 0, 6.29); g.fill();
      }
      drawPerson(g, p.x, p.y, p.angle, p.shirt, p.pants, p.skin, {
        moving: p.speed > 12 && !p.swimming, stepPhase: p.stepPhase, gun: p.weapon !== 'fists' && !p.swimming ? p.weapon : null,
        hidden: p.swimming,
      });
      if (p.swingT > 0.1) {
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 3;
        g.beginPath(); g.arc(p.x, p.y, 30, p.angle - 0.7, p.angle + 0.5); g.stroke();
      }
    }
    // The helicopter rides above everything.
    for (const car of state.cars) {
      if (car.driver === 'heli') drawHeli(g, car, state, light);
    }
    // Gulls over the bay, above the water but under the light.
    drawGulls(g, state);

    // Rain: slanted streaks raked across the whole view, dense with the
    // front's intensity, each one recycled by hash so the field is
    // endless without a single allocated drop.
    if (state.weather && state.weather.kind === 'rain' && state.weather.intensity > 0.12) {
      const inten = state.weather.intensity;
      g.strokeStyle = `rgba(200,225,245,${0.16 + inten * 0.22})`;
      g.lineWidth = 1.6;
      g.beginPath();
      const cols = Math.floor(vw / 44);
      const rows = Math.floor(vh / 150);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const seed = i * 31 + j * 57;
          const rx = x0 + hash2(seed, 3, 331) * vw + ((state.time * 130) % 60) - 30;
          const ry = y0 + ((hash2(seed, 9, 337) * vh + state.time * 640) % (vh + 80)) - 40;
          g.moveTo(rx, ry);
          g.lineTo(rx - 7, ry + 26 + inten * 10);
        }
      }
      g.stroke();
    }

    // Bullets as tracers.
    for (const b of state.bullets) {
      g.strokeStyle = b.from === 'player' ? 'rgba(255,230,150,0.95)' : 'rgba(255,150,120,0.95)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // Effects.
    for (const fx of state.fx) {
      const t = fx.t / fx.ttl;
      if (fx.kind === 'muzzle') {
        g.fillStyle = `rgba(255,205,80,${1 - t})`;
        g.beginPath(); g.arc(fx.x, fx.y, 13 * (1 - t * 0.5), 0, 6.29); g.fill();
        g.fillStyle = `rgba(255,255,255,${0.8 * (1 - t)})`;
        g.beginPath(); g.arc(fx.x, fx.y, 5.4, 0, 6.29); g.fill();
      } else if (fx.kind === 'spark' || fx.kind === 'hit') {
        g.fillStyle = fx.kind === 'spark' ? `rgba(255,170,60,${1 - t})` : `rgba(230,80,70,${0.8 * (1 - t)})`;
        g.beginPath(); g.arc(fx.x, fx.y, 4 + t * 12, 0, 6.29); g.fill();
      } else if (fx.kind === 'smoke') {
        g.fillStyle = `rgba(90,90,95,${0.34 * (1 - t)})`;
        g.beginPath(); g.arc(fx.x, fx.y - t * 42, 8 + t * 20, 0, 6.29); g.fill();
      } else if (fx.kind === 'crash') {
        g.fillStyle = `rgba(200,200,205,${0.4 * (1 - t)})`;
        g.beginPath(); g.arc(fx.x, fx.y, 10 + t * 26, 0, 6.29); g.fill();
      } else if (fx.kind === 'shell') {
        g.fillStyle = `rgba(240,200,80,${1 - t})`;
        g.fillRect(fx.x + (fx.vx || 0) * fx.t, fx.y + (fx.vy || 0) * fx.t + 90 * fx.t * fx.t, 3.4, 2);
      } else if (fx.kind === 'ripple') {
        g.strokeStyle = `rgba(220,240,250,${0.5 * (1 - t)})`;
        g.lineWidth = 1.8;
        g.beginPath(); g.ellipse(fx.x, fx.y, 6 + t * 30, (6 + t * 30) * 0.45, 0, 0, 6.29); g.stroke();
        g.beginPath(); g.ellipse(fx.x, fx.y, 3 + t * 17, (3 + t * 17) * 0.45, 0, 0, 6.29); g.stroke();
      }
    }

    // ---- light over the world -------------------------------------------
    g.setTransform(1, 0, 0, 1, 0, 0);
    const [tr, tg, tb] = light.tint;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${Math.round(clamp(tr, 0, 1) * 255)},${Math.round(clamp(tg, 0, 1) * 255)},${Math.round(clamp(tb, 0, 1) * 255)})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.globalCompositeOperation = 'source-over';
    if (light.dark > 0.02) {
      g.fillStyle = `rgba(8,10,26,${light.dark * 0.52})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (light.sunGlow > 0) {
      // The sun sits low in the west: a warm bloom from the left edge.
      const grad = g.createLinearGradient(0, 0, VIEW_W * 0.85, 0);
      grad.addColorStop(0, `rgba(255,140,50,${0.20 * light.sunGlow})`);
      grad.addColorStop(0.55, `rgba(255,110,60,${0.07 * light.sunGlow})`);
      grad.addColorStop(1, 'rgba(255,110,60,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Lamp pools and neon at night (world space, additive).
    if (light.night > 0.12) {
      g.setTransform(cam.zoom, 0, 0, cam.zoom, VIEW_W / 2 - cam.x * cam.zoom, VIEW_H / 2 - cam.y * cam.zoom);
      g.globalCompositeOperation = 'lighter';
      for (const prop of state.world.props) {
        if (prop.kind !== 'lamp') continue;
        if (prop.x < x0 - 60 || prop.x > x0 + vw + 60 || prop.y < y0 - 60 || prop.y > y0 + vh + 60) continue;
        const grad = g.createRadialGradient(prop.x, prop.y, 2, prop.x, prop.y, 54);
        grad.addColorStop(0, `rgba(255,205,110,${0.20 * light.night})`);
        grad.addColorStop(1, 'rgba(255,205,110,0)');
        g.fillStyle = grad;
        g.beginPath(); g.arc(prop.x, prop.y, 54, 0, 6.29); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // A whisper of vignette to seat the frame.
    const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.20)');
    g.fillStyle = vg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  return { drawWorld, ctx: g };
}
