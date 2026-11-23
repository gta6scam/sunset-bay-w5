// config.js — the numbers and names Sunset Bay is built from: canvas, world
// geometry, the eight districts, vehicle models, weapons, shops, radio and the
// people who talk on it. Pure data; every other module reads from here.

export const VIEW_W = 1280;
export const VIEW_H = 960;

/** The whole city, in world units (1 unit ~ 1 px at zoom 1). */
export const WORLD_W = 5120;
export const WORLD_H = 3840;

/** Roads run on a grid: a street centre every BLOCK units, ROAD_W wide. */
export const BLOCK = 640;
export const ROAD_W = 132;

/** The bay: open water east of this x, sand for BEACH_W units west of it. */
export const WATER_X = 4736;
export const BEACH_W = 120;

/** Fixed simulation step (seconds). */
export const STEP = 1 / 60;

/** localStorage keys for the persistent save. */
export const SAVE_KEY = 'sunset-bay-save-v1';
export const BEST_KEY = 'sunset-bay-best-v1';

/** Day-cycle anchors the renderer blends between, keyed by hour of day. */
export const SKY_STOPS = [
  // hour, ambient tint [r,g,b] multiplied over the world, darkness 0..1
  { h: 0.0, tint: [0.42, 0.48, 0.72], dark: 0.62 },
  { h: 4.6, tint: [0.40, 0.46, 0.70], dark: 0.64 },
  { h: 6.0, tint: [0.98, 0.72, 0.52], dark: 0.22 },
  { h: 7.5, tint: [1.04, 0.94, 0.80], dark: 0.05 },
  { h: 12.0, tint: [1.05, 1.03, 0.98], dark: 0.0 },
  { h: 16.5, tint: [1.04, 0.97, 0.86], dark: 0.03 },
  { h: 17.8, tint: [1.07, 0.85, 0.60], dark: 0.08 },
  { h: 18.9, tint: [0.95, 0.66, 0.55], dark: 0.28 },
  { h: 20.0, tint: [0.46, 0.50, 0.74], dark: 0.58 },
  { h: 24.0, tint: [0.42, 0.48, 0.72], dark: 0.62 },
];

/**
 * The eight districts. Each is a rectangle of the city with its own building
 * palette, density and flavour; the map screen and the HUD read names here.
 */
export const DISTRICTS = [
  { name: 'MARINA DEL SOL', short: 'MARINA', x: 0, y: 0, w: 1664, h: 1216, roofs: ['#7fb3c8', '#e8e3d5', '#c96f4a', '#5d8aa8', '#e5c07f'], wall: '#d9d2c0', density: 0.62, props: 'marina' },
  { name: 'OLD TOWN', short: 'OLD TOWN', x: 1664, y: 0, w: 1664, h: 1216, roofs: ['#b5523c', '#c97b4a', '#8a5a44', '#d9a05b', '#a03d2e'], wall: '#e0cdb2', density: 0.85, props: 'market' },
  { name: 'PALM HEIGHTS', short: 'HEIGHTS', x: 3328, y: 0, w: 1408, h: 1216, roofs: ['#ece7da', '#d8cfc0', '#b8c4b0', '#e5d3a8', '#cbb9a0'], wall: '#efe9dc', density: 0.5, props: 'villas' },
  { name: 'PORTSIDE', short: 'PORTSIDE', x: 0, y: 1216, w: 1664, h: 1280, roofs: ['#6b7078', '#7d7468', '#596068', '#8a7f72', '#4f5a63'], wall: '#9a948a', density: 0.7, props: 'warehouse' },
  { name: 'CENTRO', short: 'CENTRO', x: 1664, y: 1216, w: 1664, h: 1280, roofs: ['#4a4f66', '#5d6478', '#3c4257', '#6e768c', '#2f3547'], wall: '#565e73', density: 0.95, props: 'towers' },
  { name: 'THE STRIP', short: 'THE STRIP', x: 3328, y: 1216, w: 1408, h: 1280, roofs: ['#7a3d5e', '#93506f', '#5e2f4e', '#a86a86', '#47253d'], wall: '#7c5570', density: 0.8, props: 'clubs' },
  { name: 'BAYVIEW', short: 'BAYVIEW', x: 0, y: 2496, w: 2496, h: 1344, roofs: ['#e8b4a0', '#d9906f', '#f0d0a8', '#c97b5e', '#e5c07f'], wall: '#eed9c4', density: 0.58, props: 'beach' },
  { name: 'SOUTH DOCKS', short: 'DOCKS', x: 2496, y: 2496, w: 2240, h: 1344, roofs: ['#5f6a72', '#71808a', '#4c585f', '#8694a0', '#3f4c57'], wall: '#8b95a0', density: 0.66, props: 'docks' },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[4];
}

/** Vehicle models: footprint, performance and how the renderer paints them. */
export const VEHICLES = {
  sedan: { name: 'Primo Sedan', len: 118, wid: 54, top: 335, accel: 300, grip: 3.4, hp: 120, colors: ['#b8bcc2', '#5d7fa6', '#7a4a4a', '#4a6741', '#c2b49a', '#3c4250'] },
  coupe: { name: 'Futo Coupe', len: 112, wid: 52, top: 385, accel: 360, grip: 3.9, hp: 110, colors: ['#c23b2e', '#e8a020', '#28418c', '#22242c', '#e8e6e0'] },
  muscle: { name: 'Dukes Muscle', len: 128, wid: 58, top: 410, accel: 395, grip: 3.5, hp: 150, colors: ['#e8641e', '#f2b705', '#7a1f2b', '#1f4d3a', '#e8e6e0'] },
  taxi: { name: 'Taxi', len: 118, wid: 54, top: 330, accel: 295, grip: 3.4, hp: 120, colors: ['#f7b731'] },
  van: { name: 'Rumpo Van', len: 138, wid: 60, top: 290, accel: 240, grip: 2.9, hp: 170, colors: ['#d8d8d8', '#7a8894', '#4a5d23', '#8c4a2e'] },
  truck: { name: 'Hauler Truck', len: 168, wid: 64, top: 265, accel: 200, grip: 2.5, hp: 230, colors: ['#9aa4ae', '#5d6e7e', '#7e5d3a'] },
  police: { name: 'Interceptor', len: 122, wid: 55, top: 425, accel: 385, grip: 4.1, hp: 160, colors: ['#101318'] },
  policesuv: { name: 'Granger Pursuit', len: 134, wid: 60, top: 395, accel: 350, grip: 3.8, hp: 200, colors: ['#101318'] },
  heli: { name: 'Police Maverick', len: 150, wid: 44, top: 460, accel: 320, grip: 2.2, hp: 300, colors: ['#14181f'] },
};

/** Weapons: damage per hit, rounds per second, spread, range, price. */
export const WEAPONS = [
  { id: 'fists', name: 'FISTS', dmg: 12, rate: 2.4, spread: 0, range: 46, speed: 0, price: 0, slot: 0 },
  { id: 'pistol', name: 'PISTOL', dmg: 22, rate: 3.4, spread: 0.035, range: 460, speed: 1500, price: 450, slot: 1 },
  { id: 'smg', name: 'MICRO SMG', dmg: 15, rate: 10.5, spread: 0.075, range: 420, speed: 1500, price: 1250, slot: 2 },
  { id: 'shotgun', name: 'PUMP SHOTGUN', dmg: 11, rate: 1.15, spread: 0.16, range: 240, speed: 1250, pellets: 7, price: 2100, slot: 3 },
  { id: 'rifle', name: 'CARBINE RIFLE', dmg: 30, rate: 7.2, spread: 0.028, range: 640, speed: 1800, price: 3400, slot: 4 },
];

/** Shops: what standing at the door offers. */
export const SHOP_KINDS = {
  gun: { name: 'LOCK & LOAD', tag: 'GUNS', color: '#e8641e', blurb: 'Hardware for loud problems.' },
  spray: { name: 'SPRAY KING', tag: 'RESPRAY', color: '#37b6ff', blurb: 'New paint. New plates. No questions.' },
  food: { name: 'CLUCKIN’ BELL', tag: 'FOOD', color: '#f2b705', blurb: 'Grease is a food group.' },
  clothes: { name: 'PONSONBYS', tag: 'STYLE', color: '#e56ba1', blurb: 'Look like money you don’t have.' },
};

/** Radio stations cycled with R while driving; the HUD shows the ticker. */
export const RADIO = [
  { name: 'BAYWAVE 98.4', genre: 'Vice funk & synthwave' },
  { name: 'RADIO DEL SOL', genre: 'Salsa, reggaetón, sun' },
  { name: 'NIGHTHAWK TALK', genre: 'Call-ins & conspiracy' },
  { name: 'PORTSIDE ROCK', genre: 'Dockyard rock classics' },
  { name: 'SILK 104.1', genre: 'Slow jams till dawn' },
];

/** Police radio callsigns the dispatch panel cycles through. */
export const CALLSIGNS = ['7-ADAM-12', '3-LINCOLN-9', '5-MARY-4', '9-IDA-21', '2-FRANK-6', 'AIR-1', '6-CHARLES-3', '4-EDWARD-8'];
export const UNIT_ROLES = ['PURSUIT', 'INTERCEPT', 'ROADBLOCK', 'SUPPORT', 'AIR SUPPORT'];

/** First names for pedestrians and mission givers. */
export const PED_NAMES = ['Rosa', 'Marco', 'Lena', 'Yusuf', 'Priya', 'Tomas', 'Ines', 'Kofi', 'Alba', 'Rene', 'Suki', 'Dario', 'Mina', 'Oscar', 'Luz', 'Felix', 'Nadia', 'Bruno', 'Carmen', 'Elio'];
export const PED_SHIRTS = ['#e8e6e0', '#c23b2e', '#28418c', '#37b6ff', '#f2b705', '#7a4a8c', '#2e8c5a', '#e56ba1', '#e8641e', '#4a4f66', '#e8b4a0', '#5d8aa8'];
export const PED_PANTS = ['#2c3040', '#5d4a3a', '#3a4a5d', '#e8e6e0', '#6e3a2e', '#22242c', '#7a8894'];
