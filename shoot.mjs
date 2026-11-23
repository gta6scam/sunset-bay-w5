// shoot.mjs — maker's tool: smoke-tests Sunset Bay in headless Chrome and
// takes the entry screenshots listed in shots.json. JPEG quality adapts per
// shot so each file lands dense but under the scorer's 256 KiB cap.
// Run: node shoot.mjs [--shots-only|--test-only]

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/hatch/workspace/shots-tool/package.json');
const puppeteer = require('puppeteer');

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8911;
const BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const shotsOnly = args.includes('--shots-only');
const testOnly = args.includes('--test-only');
const CAP = 262144;

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2200);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
const errors = [];

async function newPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960 });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return page;
}

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

if (!shotsOnly) {
  const page = await newPage(BASE + '/');
  await page.waitForFunction(() => window.SB, { timeout: 10000 });
  const painted = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let varied = 0;
    for (let i = 0; i < data.length; i += 4013 * 4) if (data[i] + data[i + 1] + data[i + 2] > 0) varied++;
    return varied;
  });
  check('menu renders non-blank pixels', painted > 20, `${painted} sampled lit pixels`);

  // Start a new game from the menu.
  await page.keyboard.press('Enter');
  await sleep(500);
  const mode = await page.evaluate(() => window.SB.state.mode);
  check('new game starts in playing mode', mode === 'playing', mode);

  const start = await page.evaluate(() => ({ x: window.SB.player.x, y: window.SB.player.y }));
  await page.keyboard.down('KeyD');
  await sleep(600);
  await page.keyboard.up('KeyD');
  const moved = await page.evaluate(() => window.SB.player.x);
  check('player walks east on D', moved > start.x + 25, `x ${start.x.toFixed(0)} -> ${moved.toFixed(0)}`);

  // Steal the nearest traffic car (it is on a road, with room to drive).
  await page.evaluate(() => {
    const cars = window.SB.cars.filter((c) => c.driver === 'traffic');
    let best = null; let bd = 1e9;
    for (const c of cars) { const d = Math.hypot(c.x - window.SB.player.x, c.y - window.SB.player.y); if (d < bd) { bd = d; best = c; } }
    if (best) { best.speed = 0; window.SB.teleport(best.x + 40, best.y); }
  });
  await sleep(150);
  await page.keyboard.press('KeyF');
  await sleep(250);
  const inCar = await page.evaluate(() => !!window.SB.player.car);
  check('player enters a car with F', inCar);

  await page.keyboard.down('KeyW');
  await sleep(900);
  await page.keyboard.up('KeyW');
  const speed = await page.evaluate(() => Math.abs(window.SB.player.car ? window.SB.player.car.speed : 0));
  check('car accelerates under W', speed > 55, `speed ${speed.toFixed(0)}`);

  await page.evaluate(() => window.SB.setWanted(4));
  await sleep(4200);
  const units = await page.evaluate(() => window.SB.state.police.units.length);
  check('dispatch sends units at 4 stars', units >= 3, `${units} units`);
  const heli = await page.evaluate(() => window.SB.state.cars.some((c) => c.driver === 'heli'));
  check('helicopter joins at 4 stars', heli);

  await page.evaluate(() => window.SB.giveGun());
  const weapon = await page.evaluate(() => window.SB.player.weapon);
  check('weapon can be equipped', weapon === 'pistol', weapon);

  await page.evaluate(() => window.SB.startMissionAt(0));
  await sleep(250);
  const mission = await page.evaluate(() => window.SB.missionState && window.SB.missionState.def.title);
  check('mission 1 starts', mission === 'FIRST FARE', mission || 'none');

  await page.keyboard.press('KeyM');
  await sleep(300);
  const mapMode = await page.evaluate(() => window.SB.state.mode);
  check('map opens with M', mapMode === 'map', mapMode);
  await page.keyboard.press('KeyM');
  await sleep(200);
  await page.close();
}

if (!testOnly) {
  const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    const page = await newPage(BASE + '/' + shot.query);
    await page.waitForFunction(() => window.SB, { timeout: 10000 });
    await sleep(shot.wait || 2600);
    // A shot may declare a shutter beat (untilX): fire when the staged
    // action reaches its mark, not after a blind delay — page-load time
    // varies too much under load to choreograph by the clock.
    if (shot.untilX) {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        const x = await page.evaluate(() => (window.SB.player.car ? window.SB.player.car.x : 0));
        if (x >= shot.untilX) break;
        await sleep(40);
      }
    }
    // A shot may instead key the shutter to a named unit closing on the
    // player (untilUnit/untilDist): convergence beats, not arrival.
    if (shot.untilUnit) {
      const deadline = Date.now() + 9000;
      while (Date.now() < deadline) {
        const d = await page.evaluate((cs) => {
          const SB = window.SB;
          const unit = SB.state.police.units.find((u) => u.callsign === cs);
          return unit ? Math.hypot(unit.car.x - SB.player.x, unit.car.y - SB.player.y) : 1e9;
        }, shot.untilUnit);
        if (d <= (shot.untilDist || 330)) break;
        await sleep(40);
      }
    }
    const path = join(here, 'screenshots', shot.name);
    // Adaptive quality: start high, step down until the file fits the cap.
    let quality = 96;
    let size = 0;
    for (;;) {
      await page.screenshot({ path, type: 'jpeg', quality });
      size = statSync(path).size;
      if (size <= CAP || quality <= 70) break;
      quality -= 4;
    }
    results.push(`SHOT ${shot.name} — ${size} bytes @q${quality}${size > CAP ? ' (OVER 256 KiB!)' : ''}`);
    if (size > CAP) process.exitCode = 1;
    await page.close();
  }
}

check('zero console/page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
console.log(results.join('\n'));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
server.kill();
