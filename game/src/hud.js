// hud.js — everything nailed to the screen rather than the world: health and
// armor, money and stars, the minimap with its district label, the mission
// panel (JOB n/15, stage bar, NEXT), the SBPD dispatch panel (callsigns,
// roles, distances, IN SIGHT / SEARCHING), the weapon strip, the vehicle
// panel, the radio ticker — and the full screens: main menu, city map with
// the stats sidebar, pause, shop, busted and wasted.

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, WATER_X, ROAD_W, BEACH_W, DISTRICTS, districtAt, WEAPONS, RADIO, SHOP_KINDS } from './config.js';
import { STREET_XS, STREET_YS } from './world.js';
import { MISSION_COUNT, stageProgress } from './missions.js';
import { clamp, dist } from './rng.js';
import { weatherLabel } from './weather.js';

const FONT = `'Segoe UI', Arial, sans-serif`;
const FONT_DISPLAY = `Georgia, 'Times New Roman', serif`;

function text(g, value, x, y, size, color, align = 'left', weight = 700, font = FONT) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  g.fillText(value, x, y);
}

function panel(g, x, y, w, h, alpha = 0.72) {
  g.fillStyle = `rgba(10,13,20,${alpha})`;
  g.beginPath();
  g.roundRect(x, y, w, h, 8);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 1;
  g.stroke();
}

function bar(g, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.16)') {
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
}

function star(g, cx, cy, r, filled, flash) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = filled ? (flash ? '#ffd94d' : '#f2b705') : 'rgba(255,255,255,0.22)';
  g.fill();
}

function clockText(state) {
  const hh = Math.floor(state.hour);
  const mm = Math.floor((state.hour - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function completionPct(state) {
  return Math.round((state.story.index / MISSION_COUNT) * 100);
}

// ---------------------------------------------------------------- minimap
const MAP_W = 216;
const MAP_H = 164;

function drawMinimap(g, state) {
  const x = 16;
  const y = VIEW_H - MAP_H - 40;
  const sx = MAP_W / WORLD_W;
  const sy = MAP_H / WORLD_H;
  g.save();
  panel(g, x - 4, y - 4, MAP_W + 8, MAP_H + 8, 0.66);
  g.beginPath();
  g.rect(x, y, MAP_W, MAP_H);
  g.clip();
  g.fillStyle = '#20351f';
  g.fillRect(x, y, MAP_W, MAP_H);
  g.fillStyle = '#144a75';
  g.fillRect(x + WATER_X * sx, y, (WORLD_W - WATER_X) * sx, MAP_H);
  g.fillStyle = 'rgba(227,207,158,0.8)';
  g.fillRect(x + (WATER_X - 120) * sx, y, 120 * sx, MAP_H);
  g.strokeStyle = 'rgba(220,220,215,0.4)';
  g.lineWidth = 1;
  for (const wx of STREET_XS) { g.beginPath(); g.moveTo(x + wx * sx, y); g.lineTo(x + wx * sx, y + MAP_H); g.stroke(); }
  for (const wy of STREET_YS) { g.beginPath(); g.moveTo(x, y + wy * sy); g.lineTo(x + MAP_W, y + wy * sy); g.stroke(); }
  // Shops as kind-coloured ticks.
  for (const shop of state.world.shops) {
    g.fillStyle = SHOP_KINDS[shop.kind].color;
    g.fillRect(x + shop.x * sx - 2, y + shop.y * sy - 2, 4, 4);
  }
  // Dead drops in range glint gold — the minimap rewards a slow cruise
  // through the alleys it cannot name.
  if (state.world.stashes) {
    g.fillStyle = 'rgba(255,205,50,0.9)';
    for (const stash of state.world.stashes) {
      if (stash.taken) continue;
      if (Math.abs(stash.x - state.player.x) > 700 || Math.abs(stash.y - state.player.y) > 700) continue;
      g.fillRect(x + stash.x * sx - 1.6, y + stash.y * sy - 1.6, 3.2, 3.2);
    }
  }
  // Police as blue dots (the helicopter a triangle).
  for (const unit of state.police.units) {
    const c = unit.car;
    g.fillStyle = '#5d9bff';
    if (c.driver === 'heli') {
      g.beginPath();
      g.moveTo(x + c.x * sx, y + c.y * sy - 4);
      g.lineTo(x + c.x * sx - 3.4, y + c.y * sy + 3);
      g.lineTo(x + c.x * sx + 3.4, y + c.y * sy + 3);
      g.closePath(); g.fill();
    } else {
      g.beginPath(); g.arc(x + c.x * sx, y + c.y * sy, 2.6, 0, 6.29); g.fill();
    }
  }
  // The objective marker pulses gold.
  if (state.marker) {
    const pulse = 3 + Math.sin(state.time * 4.2) * 1.2;
    g.fillStyle = '#ffcd32';
    g.beginPath(); g.arc(x + state.marker.x * sx, y + state.marker.y * sy, pulse, 0, 6.29); g.fill();
  }
  // The player: a white arrow on their heading.
  const p = state.player;
  g.save();
  g.translate(x + p.x * sx, y + p.y * sy);
  g.rotate(p.angle);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(6, 0); g.lineTo(-4.4, -3.6); g.lineTo(-4.4, 3.6);
  g.closePath(); g.fill();
  g.restore();
  g.restore();
  // District label beneath the map.
  const d = districtAt(p.x, p.y);
  text(g, d.name, x + 2, VIEW_H - 14, 14.5, '#ffd94d', 'left', 800);
  text(g, `${state.cashDistrict ?? ''}`, x + MAP_W, VIEW_H - 14, 12, 'rgba(255,255,255,0.55)', 'right', 600);
}

// ------------------------------------------------------------- top panels
function drawVitals(g, state) {
  const p = state.player;
  text(g, 'HEALTH', 18, 26, 12.5, 'rgba(255,255,255,0.75)', 'left', 800);
  bar(g, 76, 15, 190, 12, p.hp / 100, p.hp > 30 ? '#5ec95e' : '#e23b2e');
  text(g, 'ARMOR', 18, 48, 12.5, 'rgba(255,255,255,0.75)', 'left', 800);
  bar(g, 76, 37, 190, 12, p.armor / 100, '#7fa8c9');
  if (state.police.bustT > 0.15 && state.police.stars > 0) {
    text(g, 'BUSTED IN…', 18, 76, 12.5, '#ff8a7a', 'left', 800);
    bar(g, 110, 65, 156, 11, state.police.bustT / 2.6, '#e23b2e');
  }
}

function drawTopRight(g, state) {
  const money = `$${state.money.toLocaleString('en-US')}`;
  text(g, money, VIEW_W - 18, 40, 30, '#7ddc6a', 'right', 800);
  // Wanted stars.
  const stars = state.police.stars;
  const flash = state.police.seenT < 2 && Math.sin(state.time * 7) > -0.2;
  for (let i = 0; i < 5; i++) {
    star(g, VIEW_W - 34 - i * 30, 66, 12.5, i < stars, flash && i < stars);
  }
  text(g, `${clockText(state)}  •  DAY ${state.day}`, VIEW_W - 18, 100, 14.5, 'rgba(255,255,255,0.85)', 'right', 700);
  text(g, `REP ${state.rep.toLocaleString('en-US')}`, VIEW_W - 18, 122, 13.5, '#ffd94d', 'right', 800);
  // The weather rides under the clock: a front you can plan around.
  const wLabel = weatherLabel(state);
  if (wLabel !== 'CLEAR') {
    text(g, wLabel, VIEW_W - 18, 144, 12.5, '#9fd8ef', 'right', 800);
  }
}

function drawMissionPanel(g, state) {
  const x = 16;
  const y = 92;
  const w = 342;
  const m = state.mission;
  const jobNo = m ? m.idx + 1 : Math.min(state.story.index + 1, MISSION_COUNT);
  panel(g, x, y, w, m ? 108 : 84, 0.7);
  text(g, `JOB ${jobNo}/${MISSION_COUNT}`, x + 12, y + 24, 13, '#ffd94d', 'left', 800);
  if (state.story.index >= MISSION_COUNT && !m) {
    text(g, 'STORY COMPLETE', x + 92, y + 24, 13, '#7ddc6a', 'left', 800);
  }
  text(g, m ? m.def.title : 'FREE ROAM', x + 12, y + 47, 16.5, '#ffffff', 'left', 800);
  const obj = state.objective || '';
  text(g, obj.length > 46 ? obj.slice(0, 45) + '…' : obj, x + 12, y + 68, 13, 'rgba(255,255,255,0.82)', 'left', 600);
  if (m) {
    const prog = stageProgress(state);
    if (prog !== null) {
      text(g, 'STAGE', x + 12, y + 92, 11, 'rgba(255,255,255,0.6)', 'left', 800);
      bar(g, 62, 83, 190, 9, prog, '#ffcd32');
    }
    const stage = m.def.stages[m.stage];
    if (m.timeLeft !== null && stage.time) {
      const t = Math.max(0, m.timeLeft);
      const label = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      text(g, label, x + w - 12, y + 92, 15, t < 20 ? '#ff8a7a' : '#ffffff', 'right', 800);
    }
    if (state.marker) {
      const d = Math.round(dist(state.player.x, state.player.y, state.marker.x, state.marker.y) / 10);
      text(g, `▸ ${d} m`, x + w - 12, y + 24, 13, '#ffcd32', 'right', 800);
    }
  } else if (state.marker) {
    const d = Math.round(dist(state.player.x, state.player.y, state.marker.x, state.marker.y) / 10);
    text(g, `NEXT JOB ▸ ${d} m`, x + w - 12, y + 24, 13, '#ffcd32', 'right', 800);
  }
}

function drawDispatch(g, state) {
  const units = state.police.units;
  if (state.police.stars < 1 && units.length === 0) return;
  const w = 306;
  const rows = Math.min(units.length, 5);
  const h = 34 + rows * 21 + (units.length > 5 ? 18 : 6);
  const x = VIEW_W - w - 16;
  const y = 136;
  panel(g, x, y, w, h, 0.7);
  text(g, 'SBPD DISPATCH', x + 12, y + 22, 13, '#5d9bff', 'left', 800);
  text(g, state.police.seenT < 2 ? 'EYES ON YOU' : state.police.seenT < 9 ? 'SEARCHING' : 'LAST SEEN', x + w - 12, y + 22, 11.5, state.police.seenT < 2 ? '#ff8a7a' : 'rgba(255,255,255,0.6)', 'right', 800);
  if (units.length === 0) {
    text(g, 'All units standing down', x + 12, y + 44, 12.5, 'rgba(255,255,255,0.65)', 'left', 600);
    return;
  }
  for (let i = 0; i < rows; i++) {
    const u = units[i];
    const ry = y + 44 + i * 21;
    const d = Math.round(dist(state.player.x, state.player.y, u.car.x, u.car.y) / 10);
    text(g, u.callsign, x + 12, ry, 12.5, '#ffffff', 'left', 700);
    text(g, u.role, x + 104, ry, 11, 'rgba(255,255,255,0.6)', 'left', 600);
    text(g, `${d} m`, x + 216, ry, 12, 'rgba(255,255,255,0.8)', 'right', 700);
    const col = u.status === 'IN SIGHT' ? '#ff6a5e' : u.status === 'SEARCHING' ? '#ffd94d' : '#8b93a3';
    text(g, u.status, x + w - 12, ry, 11, col, 'right', 800);
  }
  if (units.length > 5) {
    text(g, `+ ${units.length - 5} more units`, x + 12, y + 44 + rows * 21, 11.5, 'rgba(255,255,255,0.55)', 'left', 600);
  }
}

// ------------------------------------------------------------ bottom right
function drawWeaponStrip(g, state) {
  const p = state.player;
  const slotW = 86;
  const totalW = slotW * WEAPONS.length + 8 * (WEAPONS.length - 1);
  const x = VIEW_W - totalW - 16;
  const y = VIEW_H - 66;
  WEAPONS.forEach((w, i) => {
    const sx = x + i * (slotW + 8);
    const owned = !!p.owned[w.id];
    const active = p.weapon === w.id && !p.car;
    panel(g, sx, y, slotW, 50, active ? 0.88 : 0.55);
    if (active) {
      g.strokeStyle = '#ffcd32';
      g.lineWidth = 2;
      g.beginPath(); g.roundRect(sx, y, slotW, 50, 8); g.stroke();
    }
    text(g, `${i + 1}`, sx + 7, y + 16, 10.5, 'rgba(255,255,255,0.5)', 'left', 800);
    text(g, w.id === 'fists' ? 'FISTS' : w.name.split(' ').pop(), sx + slotW / 2, y + 25, 11.5, owned ? '#ffffff' : 'rgba(255,255,255,0.35)', 'center', 800);
    const ammo = w.id === 'fists' ? '∞' : owned ? String(p.ammo[w.id] || 0) : '—';
    text(g, ammo, sx + slotW / 2, y + 42, 11, owned ? '#ffd94d' : 'rgba(255,255,255,0.3)', 'center', 700);
  });
}

function drawVehiclePanel(g, state) {
  const car = state.player.car;
  if (!car) return;
  const w = 300;
  const x = VIEW_W - w - 16;
  const y = VIEW_H - 146;
  panel(g, x, y, w, 66, 0.7);
  text(g, car.model.name.toUpperCase(), x + 12, y + 24, 14.5, '#ffffff', 'left', 800);
  const kmh = Math.round(Math.abs(car.speed) * 0.31);
  text(g, `${kmh} km/h`, x + w - 12, y + 24, 16, '#ffd94d', 'right', 800);
  text(g, 'BODY', x + 12, y + 50, 11, 'rgba(255,255,255,0.6)', 'left', 800);
  bar(g, 62, 41, 150, 9, car.hp / car.maxHp, car.hp > car.maxHp * 0.35 ? '#5ec95e' : '#e23b2e');
  text(g, car.speed < -4 ? 'R' : 'D', x + w - 12, y + 50, 13, '#ffffff', 'right', 800);
  // Wet roads change the contract between tyre and street; say so.
  if (state.weather && state.weather.kind === 'rain' && state.weather.intensity > 0.25) {
    text(g, 'WET — GRIP DOWN', x + 118, y + 50, 11, '#9fd8ef', 'left', 800);
  }
}

function drawRadio(g, state) {
  if (!state.player.car || state.radioT <= 0) return;
  const st = RADIO[state.radio];
  const alpha = clamp(state.radioT / 1.2, 0, 1);
  g.globalAlpha = alpha;
  const line = state.djText || `♪ ${st.name} — ${st.genre}`;
  text(g, line.length > 92 ? line.slice(0, 91) + '…' : line, VIEW_W / 2, VIEW_H - 22, 14, '#ffd94d', 'center', 700);
  g.globalAlpha = 1;
}

function drawToast(g, state) {
  const toast = state.toast;
  if (!toast || toast.t > toast.ttl) return;
  const alpha = clamp(Math.min(toast.t * 3, (toast.ttl - toast.t) * 1.4, 1), 0, 1);
  g.globalAlpha = alpha;
  const w = Math.min(760, 40 + toast.text.length * 7.4);
  panel(g, VIEW_W / 2 - w / 2, VIEW_H - 128, w, 40, 0.78);
  text(g, toast.text, VIEW_W / 2, VIEW_H - 102, 14.5, '#ffffff', 'center', 600);
  g.globalAlpha = 1;
}

function drawBanner(g, state) {
  const b = state.banner;
  if (!b || b.t > b.ttl) return;
  const inT = clamp(b.t / 0.45, 0, 1);
  const outT = clamp((b.ttl - b.t) / 0.6, 0, 1);
  const alpha = Math.min(inT, outT);
  const scale = 0.92 + 0.08 * inT;
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(8,10,16,0.78)';
  g.fillRect(0, VIEW_H * 0.30, VIEW_W, 168);
  g.fillStyle = '#ffcd32';
  g.fillRect(0, VIEW_H * 0.30, VIEW_W, 3);
  g.fillRect(0, VIEW_H * 0.30 + 165, VIEW_W, 3);
  g.save();
  g.translate(VIEW_W / 2, VIEW_H * 0.30 + 74);
  g.scale(scale, scale);
  text(g, b.title, 0, 8, 54, '#ffcd32', 'center', 900, FONT_DISPLAY);
  g.restore();
  text(g, b.sub || '', VIEW_W / 2, VIEW_H * 0.30 + 116, 19, '#ffffff', 'center', 700);
  if (b.money) {
    text(g, `+$${b.money.toLocaleString('en-US')}`, VIEW_W / 2 - 70, VIEW_H * 0.30 + 148, 19, '#7ddc6a', 'right', 800);
    text(g, `+${b.rep} REP`, VIEW_W / 2 + 70, VIEW_H * 0.30 + 148, 19, '#ffd94d', 'left', 800);
  }
  g.globalAlpha = 1;
}

/**
 * The mission intro card: a lower-third title card when a job starts —
 * JOB n/15, the job's name in display type, who is paying, and their
 * pitch in their own words. Fades in fast, holds, and gets out of the
 * way before the driving starts.
 */
function drawIntroCard(g, state) {
  const c = state.introCard;
  if (!c) return;
  const inT = clamp(c.t / 0.4, 0, 1);
  const outT = clamp((c.ttl - c.t) / 0.7, 0, 1);
  const alpha = Math.min(inT, outT);
  if (alpha <= 0) return;
  const y = VIEW_H - 218;
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(8,10,16,0.82)';
  g.fillRect(0, y, 660, 118);
  g.fillStyle = '#ffcd32';
  g.fillRect(0, y, 5, 118);
  text(g, `JOB ${c.job}/${MISSION_COUNT}`, 28, y + 30, 13.5, '#ffcd32', 'left', 800);
  text(g, c.title, 28, y + 66, 30, '#ffffff', 'left', 900, FONT_DISPLAY);
  text(g, `${c.giver} — “${c.intro}”`, 28, y + 96, 14.5, 'rgba(255,255,255,0.78)', 'left', 600);
  g.globalAlpha = 1;
}

/** The in-play HUD (not for menu/map screens). */
export function drawHUD(g, state) {
  drawVitals(g, state);
  drawTopRight(g, state);
  drawMissionPanel(g, state);
  drawDispatch(g, state);
  drawMinimap(g, state);
  drawWeaponStrip(g, state);
  drawVehiclePanel(g, state);
  drawRadio(g, state);
  drawToast(g, state);
  drawIntroCard(g, state);
  drawBanner(g, state);
  if (state.nearShop && state.mode === 'playing') {
    const kind = SHOP_KINDS[state.nearShop.kind];
    text(g, `Press E — ${kind.name}`, VIEW_W / 2, VIEW_H - 170, 16, '#ffffff', 'center', 800);
  }
  if (state.mode === 'playing' && !state.player.car) {
    text(g, 'F — enter car', VIEW_W - 18, VIEW_H - 158, 12, 'rgba(255,255,255,0.4)', 'right', 600);
  }
}

// --------------------------------------------------------------- screens
export function drawMenu(g, state) {
  const grad = g.createLinearGradient(0, 0, VIEW_W * 0.72, 0);
  grad.addColorStop(0, 'rgba(10,8,18,0.88)');
  grad.addColorStop(0.7, 'rgba(10,8,18,0.45)');
  grad.addColorStop(1, 'rgba(10,8,18,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  const pulse = 0.9 + Math.sin(state.time * 1.6) * 0.1;
  const titleGrad = g.createLinearGradient(0, 210, 0, 330);
  titleGrad.addColorStop(0, '#ffe9a8');
  titleGrad.addColorStop(0.55, '#ff9a3c');
  titleGrad.addColorStop(1, '#e5447a');
  g.font = `900 ${Math.round(108 * pulse)}px ${FONT_DISPLAY}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = titleGrad;
  g.fillText('SUNSET BAY', 64, 318);
  text(g, 'A  V I C E   C I T Y   S T O R Y', 70, 356, 21, '#ffd94d', 'left', 800);
  text(g, 'Fifteen jobs. Eight districts. One bay, and everybody in it owes somebody.', 70, 392, 16.5, 'rgba(255,255,255,0.85)', 'left', 600);

  const items = state.menuItems;
  items.forEach((item, i) => {
    const y = 486 + i * 58;
    const sel = state.menuSel === i;
    if (sel) {
      g.fillStyle = 'rgba(255,205,50,0.16)';
      g.fillRect(56, y - 34, 430, 46);
      g.fillStyle = '#ffcd32';
      g.fillRect(56, y - 34, 5, 46);
    }
    text(g, item.label, 84, y, 25, sel ? '#ffffff' : 'rgba(255,255,255,0.6)', 'left', 800);
    if (item.note) text(g, item.note, 84, y + 24, 12.5, 'rgba(255,255,255,0.45)', 'left', 600);
  });

  // The save strip: when a story exists on this machine, the menu says
  // so — where it stands, what it is worth, and how long it has run.
  if (state.hasSave && state.savePeek) {
    const sv = state.savePeek;
    const sy = 486 + items.length * 58 + 16;
    g.fillStyle = 'rgba(10,10,16,0.55)';
    g.fillRect(56, sy, 560, 54);
    g.fillStyle = '#37b6ff';
    g.fillRect(56, sy, 5, 54);
    text(g, `SAVED STORY — JOB ${Math.min((sv.storyIndex ?? 0) + 1, MISSION_COUNT)}/${MISSION_COUNT}  •  $${(sv.money ?? 0).toLocaleString('en-US')}  •  ${(sv.rep ?? 0).toLocaleString('en-US')} REP`, 84, sy + 24, 14.5, '#ffffff', 'left', 700);
    text(g, `${sv.stats?.missionsDone ?? 0} jobs done  •  ${sv.stats?.stashes ?? 0} dead drops found  •  ${Math.floor((sv.playT ?? 0) / 60)} min in the bay  •  CONTINUE picks it up`, 84, sy + 44, 12.5, 'rgba(255,255,255,0.6)', 'left', 600);
  }

  text(g, 'WASD drive & walk  •  SHIFT sprint  •  F enter car  •  E shops & talk  •  MOUSE aim, CLICK fire', 70, VIEW_H - 74, 14.5, 'rgba(255,255,255,0.7)', 'left', 600);
  text(g, '1–5 weapons  •  M city map & stats  •  R radio  •  P pause  •  The bay saves your story automatically', 70, VIEW_H - 48, 14.5, 'rgba(255,255,255,0.7)', 'left', 600);
  text(g, 'A make.fun entry — built in one recorded session', 70, VIEW_H - 20, 12, 'rgba(255,255,255,0.4)', 'left', 600);
}

function statRow(g, x, y, label, value, w = 300) {
  text(g, label, x, y, 14, 'rgba(255,255,255,0.62)', 'left', 700);
  text(g, value, x + w, y, 14.5, '#ffffff', 'right', 800);
}

export function drawMap(g, state) {
  g.fillStyle = '#0b0e14';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  text(g, 'SUNSET BAY', 36, 52, 30, '#ffd94d', 'left', 900, FONT_DISPLAY);
  text(g, 'CITY MAP & STATISTICS', 38, 78, 13.5, 'rgba(255,255,255,0.6)', 'left', 800);
  const mx = 36;
  const my = 104;
  const mw = 830;
  const mh = 796;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  // Land base + district washes.
  g.fillStyle = '#1d3319';
  g.fillRect(mx, my, mw, mh);
  for (const d of DISTRICTS) {
    g.fillStyle = d.roofs[0] + '24';
    g.fillRect(mx + d.x * sx, my + d.y * sy, d.w * sx, d.h * sy);
  }
  // City texture: every building footprint as a parcel on the map.
  for (const b of state.world.buildings) {
    g.fillStyle = 'rgba(214,208,196,0.30)';
    g.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }
  // The bay: water with a swell pattern, the sand strip, the boardwalk line.
  g.fillStyle = '#144a75';
  g.fillRect(mx + WATER_X * sx, my, (WORLD_W - WATER_X) * sx, mh);
  g.strokeStyle = 'rgba(140,200,235,0.35)';
  g.lineWidth = 1.2;
  for (let wy = 26; wy < mh; wy += 34) {
    g.beginPath();
    for (let wx = 0; wx <= (WORLD_W - WATER_X) * sx; wx += 14) {
      const yy = my + wy + Math.sin((wx + wy) * 0.14) * 3;
      if (wx === 0) g.moveTo(mx + WATER_X * sx + wx, yy); else g.lineTo(mx + WATER_X * sx + wx, yy);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(227,207,158,0.9)';
  g.fillRect(mx + (WATER_X - BEACH_W) * sx, my, BEACH_W * sx, mh);
  g.fillStyle = 'rgba(120,84,50,0.55)';
  g.fillRect(mx + (WATER_X - BEACH_W) * sx, my, 3, mh);
  // Road network as real bands with centre dashes.
  g.fillStyle = '#2b2f36';
  for (const wx of STREET_XS) g.fillRect(mx + (wx - ROAD_W / 2) * sx, my, ROAD_W * sx, mh);
  for (const wy of STREET_YS) g.fillRect(mx, my + (wy - ROAD_W / 2) * sy, mw, ROAD_W * sy);
  g.strokeStyle = 'rgba(255,205,80,0.5)';
  g.lineWidth = 1.1;
  g.setLineDash([7, 6]);
  for (const wx of STREET_XS) { g.beginPath(); g.moveTo(mx + wx * sx, my); g.lineTo(mx + wx * sx, my + mh); g.stroke(); }
  for (const wy of STREET_YS) { g.beginPath(); g.moveTo(mx, my + wy * sy); g.lineTo(mx + mw, my + wy * sy); g.stroke(); }
  g.setLineDash([]);
  // Dead drops: the map knows where the money sleeps — small gold
  // diamonds for the ones still waiting, nothing for the ones taken.
  if (state.world.stashes) {
    g.fillStyle = 'rgba(255,205,50,0.85)';
    for (const stash of state.world.stashes) {
      if (stash.taken) continue;
      const dx = mx + stash.x * sx;
      const dy = my + stash.y * sy;
      g.beginPath();
      g.moveTo(dx, dy - 4.4);
      g.lineTo(dx + 4.4, dy);
      g.lineTo(dx, dy + 4.4);
      g.lineTo(dx - 4.4, dy);
      g.closePath();
      g.fill();
    }
  }
  // District names last, large with a dark halo so they survive the texture.
  for (const d of DISTRICTS) {
    const nx = mx + (d.x + d.w / 2) * sx;
    const ny = my + (d.y + d.h / 2) * sy + 6;
    text(g, d.name, nx + 1.6, ny + 1.6, 16.5, 'rgba(4,8,4,0.85)', 'center', 800);
    text(g, d.name, nx, ny, 16.5, 'rgba(255,255,255,0.94)', 'center', 800);
  }
  // Shops with labels.
  for (const shop of state.world.shops) {
    const kind = SHOP_KINDS[shop.kind];
    g.fillStyle = kind.color;
    g.beginPath(); g.arc(mx + shop.x * sx, my + shop.y * sy, 5, 0, 6.29); g.fill();
    text(g, kind.tag, mx + shop.x * sx + 9, my + shop.y * sy + 4, 10.5, kind.color, 'left', 800);
  }
  if (state.marker) {
    g.strokeStyle = '#ffcd32';
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(mx + state.marker.x * sx, my + state.marker.y * sy, 9 + Math.sin(state.time * 4.2) * 2, 0, 6.29); g.stroke();
  }
  const p = state.player;
  g.save();
  g.translate(mx + p.x * sx, my + p.y * sy);
  g.rotate(p.angle);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -5); g.lineTo(-6, 5); g.closePath(); g.fill();
  g.restore();
  for (const unit of state.police.units) {
    g.fillStyle = '#5d9bff';
    g.beginPath(); g.arc(mx + unit.car.x * sx, my + unit.car.y * sy, 3.6, 0, 6.29); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.strokeRect(mx, my, mw, mh);

  // Stats sidebar.
  const x = 902;
  let y = 128;
  text(g, 'THE STORY SO FAR', x, y, 15, '#ffd94d', 'left', 800);
  y += 14;
  bar(g, x, y, 300, 14, state.story.index / MISSION_COUNT, '#ffcd32', 'rgba(255,255,255,0.14)');
  y += 40;
  statRow(g, x, y, `STORY — JOB ${Math.min(state.story.index + 1, MISSION_COUNT)}/${MISSION_COUNT}`, `${completionPct(state)}% COMPLETE`);
  y += 30;
  statRow(g, x, y, 'MONEY', `$${state.money.toLocaleString('en-US')}`);
  y += 30;
  statRow(g, x, y, 'REPUTATION', state.rep.toLocaleString('en-US'));
  y += 30;
  statRow(g, x, y, 'DISTRICT', districtAt(p.x, p.y).name);
  y += 30;
  statRow(g, x, y, 'WEATHER', weatherLabel(state));
  y += 30;
  statRow(g, x, y, 'TIME IN THE BAY', `${Math.floor(state.playT / 60)}:${String(Math.floor(state.playT % 60)).padStart(2, '0')}`);
  y += 52;
  text(g, 'RAP SHEET', x, y, 15, '#ffd94d', 'left', 800);
  y += 30;
  statRow(g, x, y, 'Jobs completed', String(state.stats.missionsDone));
  y += 28;
  statRow(g, x, y, 'Dead drops found', `${state.stats.stashes || 0}/${state.world.stashes ? state.world.stashes.length : 24}`);
  y += 28;
  statRow(g, x, y, 'Cars stolen', String(state.stats.carjacks));
  y += 28;
  statRow(g, x, y, 'Crimes witnessed', String(state.stats.crimes));
  y += 28;
  statRow(g, x, y, 'Shots fired', String(state.stats.shotsFired));
  y += 28;
  statRow(g, x, y, 'Total earned', `$${state.stats.earned.toLocaleString('en-US')}`);
  y += 28;
  statRow(g, x, y, 'Total spent', `$${state.stats.spent.toLocaleString('en-US')}`);
  y += 28;
  statRow(g, x, y, 'Busted / Wasted', `${state.stats.busted} / ${state.stats.wasted}`);
  y += 56;
  text(g, 'LEGEND', x, y, 15, '#ffd94d', 'left', 800);
  y += 28;
  for (const [kindKey, kind] of Object.entries(SHOP_KINDS)) {
    void kindKey;
    g.fillStyle = kind.color;
    g.beginPath(); g.arc(x + 6, y - 4, 5, 0, 6.29); g.fill();
    text(g, kind.name, x + 20, y, 13.5, 'rgba(255,255,255,0.85)', 'left', 600);
    y += 24;
  }
  text(g, '○ gold ring — your next job      ● blue — SBPD', x, y + 6, 12.5, 'rgba(255,255,255,0.6)', 'left', 600);
  text(g, 'M / ESC — back to the bay', 36, VIEW_H - 22, 13.5, 'rgba(255,255,255,0.55)', 'left', 700);
}

export function drawPause(g, state) {
  g.fillStyle = 'rgba(6,8,12,0.66)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(g, VIEW_W / 2 - 260, VIEW_H / 2 - 245, 520, 490, 0.9);
  text(g, 'PAUSED', VIEW_W / 2, VIEW_H / 2 - 178, 40, '#ffd94d', 'center', 900, FONT_DISPLAY);
  let y = VIEW_H / 2 - 126;
  const x = VIEW_W / 2 - 210;
  statRow(g, x, y, 'Story', `JOB ${Math.min(state.story.index + 1, MISSION_COUNT)}/${MISSION_COUNT} — ${completionPct(state)}%`, 420); y += 32;
  statRow(g, x, y, 'Money', `$${state.money.toLocaleString('en-US')}`, 420); y += 32;
  statRow(g, x, y, 'Reputation', state.rep.toLocaleString('en-US'), 420); y += 32;
  statRow(g, x, y, 'Jobs done', String(state.stats.missionsDone), 420); y += 32;
  statRow(g, x, y, 'Cars stolen', String(state.stats.carjacks), 420); y += 32;
  statRow(g, x, y, 'Busted / Wasted', `${state.stats.busted} / ${state.stats.wasted}`, 420); y += 32;
  statRow(g, x, y, 'Hottest heat', `${'★'.repeat(state.stats.maxStars || 0) || '—'} (${state.stats.maxStars || 0}/5)`, 420); y += 32;
  statRow(g, x, y, 'Bonuses banked', String(state.stats.bonuses || 0), 420); y += 32;
  statRow(g, x, y, 'Shots fired', String(state.stats.shotsFired), 420); y += 56;
  text(g, 'P — resume      M — map & full stats      WASD — move      F — car', VIEW_W / 2, y, 13.5, 'rgba(255,255,255,0.65)', 'center', 600);
}

export function drawShop(g, state) {
  const menu = state.shop;
  if (!menu) return;
  const w = 430;
  const x = VIEW_W - w - 26;
  const y = 150;
  const h = 132 + menu.items.length * 40 + 64;
  panel(g, x, y, w, h, 0.92);
  text(g, menu.title, x + 20, y + 36, 21, menu.kind.color, 'left', 900);
  text(g, menu.blurb, x + 20, y + 58, 13, 'rgba(255,255,255,0.65)', 'left', 600);
  text(g, `$${state.money.toLocaleString('en-US')}`, x + w - 20, y + 36, 17, '#7ddc6a', 'right', 800);
  menu.items.forEach((item, i) => {
    const iy = y + 96 + i * 40;
    const sel = state.shopSel === i;
    if (sel) {
      g.fillStyle = 'rgba(255,205,50,0.15)';
      g.fillRect(x + 10, iy - 24, w - 20, 34);
    }
    const afford = item.can && state.money >= item.price;
    text(g, item.label, x + 20, iy, 14.5, afford ? '#ffffff' : 'rgba(255,255,255,0.4)', 'left', 700);
    text(g, `$${item.price}`, x + w - 20, iy, 14.5, afford ? '#ffd94d' : 'rgba(255,255,255,0.35)', 'right', 800);
  });
  const fy = y + 96 + menu.items.length * 40 + 12;
  if (state.shopLine && state.shopLineT > 0) {
    text(g, `“${state.shopLine}”`, x + 20, fy, 13.5, '#ffd94d', 'left', 600);
  }
  text(g, '↑ ↓ choose   •   ENTER buy   •   E close', x + 20, fy + 26, 12, 'rgba(255,255,255,0.5)', 'left', 600);
}

export function drawOver(g, state) {
  const busted = state.overKind === 'busted';
  g.fillStyle = busted ? 'rgba(10,16,40,0.55)' : 'rgba(40,6,6,0.55)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  text(g, busted ? 'BUSTED' : 'WASTED', VIEW_W / 2, VIEW_H / 2 - 30, 92, busted ? '#5d9bff' : '#e23b2e', 'center', 900, FONT_DISPLAY);
  text(g, state.overLine || '', VIEW_W / 2, VIEW_H / 2 + 26, 17, '#ffffff', 'center', 600);
  // The morning-after ledger: what the run was worth when it ended.
  const s = state.stats;
  text(g, `Jobs done ${s.missionsDone}  •  Earned $${s.earned.toLocaleString('en-US')}  •  Cars stolen ${s.carjacks}  •  Dead drops ${s.stashes || 0}`, VIEW_W / 2, VIEW_H / 2 + 56, 14.5, 'rgba(255,255,255,0.8)', 'center', 600);
  text(g, 'Press ENTER — the bay gives you another morning', VIEW_W / 2, VIEW_H / 2 + 88, 15, 'rgba(255,255,255,0.7)', 'center', 700);
}
