// input.js — keyboard and mouse for Sunset Bay. Held keys live in a Set the
// simulation reads directly; one-shot presses queue as action flags so a tap
// between frames is never lost; the mouse gives an aim point and the trigger.

export const ACT_CONFIRM = 1;
export const ACT_INTERACT = 2;
export const ACT_PAUSE = 4;
export const ACT_MAP = 8;
export const ACT_RADIO = 16;
export const ACT_USE = 32;
export const ACT_HONK = 64;

const ACTION_KEYS = new Map([
  ['Enter', ACT_CONFIRM],
  ['KeyF', ACT_INTERACT],
  ['KeyP', ACT_PAUSE],
  ['Escape', ACT_PAUSE],
  ['KeyM', ACT_MAP],
  ['Tab', ACT_MAP],
  ['KeyR', ACT_RADIO],
  ['KeyE', ACT_USE],
  ['KeyH', ACT_HONK],
]);

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let actions = 0;
  let weaponSel = -1;
  let menuDir = 0;

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code.startsWith('Digit')) {
      const n = Number(event.code.slice(5));
      if (n >= 1 && n <= 5) weaponSel = n - 1;
    }
    if (event.code === 'ArrowUp' || event.code === 'KeyW') menuDir -= event.repeat ? 0 : 1;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') menuDir += event.repeat ? 0 : 1;
    const act = ACTION_KEYS.get(event.code);
    if (act && !event.repeat) actions |= act;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  function toLocal(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  }
  canvas.addEventListener('pointermove', toLocal);
  canvas.addEventListener('pointerdown', (event) => {
    toLocal(event);
    mouse.down = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  /* ---------------------------------------------------------------- */
  /* Gamepad: polled once per action read. The left stick drives the   */
  /* same key set the keyboard fills (so the whole game just works),   */
  /* the right stick aims through the mouse point, and the buttons     */
  /* queue the same one-shot actions. Standard-mapping layout only.    */
  /* ---------------------------------------------------------------- */
  const padPrev = new Set();
  const padKeys = new Set();

  function pollPad() {
    let pad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const candidate of pads) if (candidate && candidate.connected) { pad = candidate; break; }
    } catch { /* no pads, no problem */ }
    if (!pad) return;
    const held = new Set();
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (ax < -0.38) held.add('KeyA');
    if (ax > 0.38) held.add('KeyD');
    if (ay < -0.38) held.add('KeyW');
    if (ay > 0.38) held.add('KeyS');
    // The pad only ever removes keys the pad itself added — a keyboard
    // key held at the same time is none of its business.
    for (const code of [...padKeys]) {
      if (!held.has(code)) { keys.delete(code); padKeys.delete(code); }
    }
    for (const code of held) {
      if (!keys.has(code)) padKeys.add(code);
      keys.add(code);
    }
    // Face/shoulder buttons as one-shot actions + triggers as attack.
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (name, down) => {
      const was = padPrev.has(name);
      if (down) padPrev.add(name); else padPrev.delete(name);
      return down && !was;
    };
    if (edge('confirm', btn(0))) actions |= ACT_CONFIRM;
    if (edge('interact', btn(2))) actions |= ACT_INTERACT;
    if (edge('use', btn(3))) actions |= ACT_USE;
    if (edge('pause', btn(9))) actions |= ACT_PAUSE;
    if (edge('map', btn(8))) actions |= ACT_MAP;
    if (edge('radio', btn(5))) actions |= ACT_RADIO;
    if (btn(10)) { keys.add('ShiftLeft'); padKeys.add('ShiftLeft'); }
    else if (padKeys.has('ShiftLeft')) { keys.delete('ShiftLeft'); padKeys.delete('ShiftLeft'); }
    padAttack = btn(7);
    // Menu navigation from the d-pad edges.
    if (edge('up', btn(12))) menuDir -= 1;
    if (edge('down', btn(13))) menuDir += 1;
    // Weapon wheel on the left bumper: cycles the selection slots.
    if (edge('wheel', btn(4))) weaponSel = (weaponSel + 2) % 5;
  }
  let padAttack = false;

  return {
    keys,
    mouse,
    /** Attack held: mouse trigger, Space, or the pad's right trigger. */
    attack() {
      return mouse.down || keys.has('Space') || padAttack;
    },
    takeActions() {
      pollPad();
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeWeaponSel() {
      const taken = weaponSel;
      weaponSel = -1;
      return taken;
    },
    takeMenuDir() {
      const taken = menuDir;
      menuDir = 0;
      return taken;
    },
  };
}
