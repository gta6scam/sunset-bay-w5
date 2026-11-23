// shops.js — the legal-ish economy: gun stores, respray garages, fast food
// and a tailor. Standing at a shop door opens its menu (state.shop); buying
// is instant, prices are real, and the respray is the honest way out of heat.

import { SHOP_KINDS, WEAPONS } from './config.js';
import { giveWeapon } from './player.js';
import { clearHeat } from './police.js';
import { dist } from './rng.js';

export const RESPRAY_BASE = 200;

/** The shop whose door the player is standing at, or null. */
export function nearestShop(state) {
  const p = state.player;
  if (p.car) return null;
  for (const shop of state.world.shops) {
    if (dist(p.x, p.y, shop.x, shop.y) < 64) return shop;
  }
  return null;
}

/** The menu for a shop: a list of {label, price, can, run} the HUD renders. */
export function shopMenu(state, shop) {
  const p = state.player;
  const kind = SHOP_KINDS[shop.kind];
  const items = [];
  if (shop.kind === 'gun') {
    for (const w of WEAPONS) {
      if (w.id === 'fists') continue;
      if (!p.owned[w.id]) {
        items.push({
          label: w.name,
          price: w.price,
          can: state.money >= w.price,
          run: () => { giveWeapon(state, w.id, w.id === 'pistol' ? 40 : 60); return `${w.name} — yours. Stay safe out there.`; },
        });
      }
    }
    for (const [id, label, price, amount] of [
      ['pistol', 'PISTOL AMMO ×40', 60, 40],
      ['smg', 'SMG AMMO ×80', 110, 80],
      ['shotgun', 'SHELLS ×24', 95, 24],
      ['rifle', 'RIFLE AMMO ×60', 140, 60],
    ]) {
      if (p.owned[id]) {
        items.push({
          label, price,
          can: state.money >= price,
          run: () => { p.ammo[id] += amount; return 'Ammo bagged.'; },
        });
      }
    }
    items.push({
      label: 'BODY ARMOR',
      price: 500,
      can: state.money >= 500 && p.armor < 100,
      run: () => { p.armor = 100; return 'Vest fitted. Walk tall.'; },
    });
  } else if (shop.kind === 'spray') {
    const price = RESPRAY_BASE + state.police.stars * 160;
    items.push({
      label: state.police.stars > 0 ? `FULL RESPRAY — LOSE ${state.police.stars}★` : 'FULL RESPRAY',
      price,
      can: state.money >= price,
      run: () => {
        if (p.car) { p.car.color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); }
        clearHeat(state);
        return 'New paint, new plates. The bay forgets.';
      },
    });
    items.push({
      label: 'REPAIR — FULL BODYWORK',
      price: 180,
      can: state.money >= 180 && !!p.car && p.car.hp < p.car.maxHp,
      run: () => { if (p.car) p.car.hp = p.car.maxHp; return 'Panels beaten straight. Good as new.'; },
    });
  } else if (shop.kind === 'food') {
    items.push({
      label: 'CLUCKIN’ MEAL — +55 HP',
      price: 14,
      can: state.money >= 14 && p.hp < 100,
      run: () => { p.hp = Math.min(100, p.hp + 55); return 'Grease works miracles.'; },
    });
    items.push({
      label: 'FRIES & SHAKE — +20 HP',
      price: 6,
      can: state.money >= 6 && p.hp < 100,
      run: () => { p.hp = Math.min(100, p.hp + 20); return 'Sugar and salt. Doctor’s orders.'; },
    });
  } else if (shop.kind === 'clothes') {
    items.push({
      label: 'NEW OUTFIT — FRESH THREADS',
      price: 60,
      can: state.money >= 60,
      run: () => {
        const shirts = ['#c23b2e', '#e8e6e0', '#37b6ff', '#f2b705', '#7a4a8c', '#2e8c5a', '#e56ba1', '#101318'];
        const idx = shirts.indexOf(p.shirt);
        p.shirt = shirts[(idx + 1) % shirts.length];
        return 'Mirror approved. The bay approves too.';
      },
    });
  }
  return { shop, kind, items, title: kind.name, blurb: kind.blurb };
}

/**
 * Every counter in the bay has a person behind it, and every person has
 * an opener. Wanted customers get the nervous version; regulars get the
 * warm one. Picked deterministically per visit so the line is stable
 * while the menu is open.
 */
const KEEPER_LINES = {
  gun: {
    calm: ['Reyes: “Licence is your business. Aim is mine.”', 'Reyes: “Everything on the wall is cleaned and zeroed.”'],
    hot: ['Reyes: “Make it fast, friend. Sirens make me itch.”', 'Reyes: “Cash only today. For reasons.”'],
  },
  spray: {
    calm: ['Dom: “In, out, different car. That is the whole religion.”', 'Dom: “Pick a colour the bay has not seen you in.”'],
    hot: ['Dom: “Stars cost extra and you are covered in them.”', 'Dom: “Roll in slow. I will pretend we never met.”'],
  },
  food: {
    calm: ['Priya: “Meal deal’s the best medicine on the strip.”', 'Priya: “You look like a two-shake day.”'],
    hot: ['Priya: “Eat fast. The drive-thru of justice is behind you.”', 'Priya: “No judgement. Extra napkins for the blood.”'],
  },
  clothes: {
    calm: ['Sana: “New threads, new man. The bay loves a reinvention.”', 'Sana: “That colour? On you? Sold.”'],
    hot: ['Sana: “Cops remember outfits, darling. Let us fix that.”', 'Sana: “Quick change, back door. Classic service.”'],
  },
};

export function keeperGreeting(state, shop) {
  const pool = KEEPER_LINES[shop.kind];
  if (!pool) return '';
  const lines = state.police.stars > 0 ? pool.hot : pool.calm;
  const idx = Math.abs(Math.floor(state.time * 0.37) + shop.x) % lines.length;
  return lines[idx];
}

/** Buy menu item i. Returns the clerk's line, or null when it can't be sold. */
export function buyItem(state, menu, i) {
  const item = menu.items[i];
  if (!item || !item.can || state.money < item.price) return null;
  state.money -= item.price;
  state.stats.spent += item.price;
  const line = item.run();
  state.audio?.cash?.();
  return line;
}
