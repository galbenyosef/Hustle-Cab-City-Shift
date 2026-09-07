import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const held = new Set();

async function controls(next) {
  for (const key of held) if (!next.includes(key)) {await page.keyboard.up(key);held.delete(key);}
  for (const key of next) if (!held.has(key)) {await page.keyboard.down(key);held.add(key);}
}

async function driveTo(target, stop = false) {
  for (let attempt = 0; attempt < 450; attempt++) {
    const vehicle = await page.evaluate(() => ({ ...window.__taxi.vehicle }));
    const remaining = Math.hypot(target.x - vehicle.x, target.z - vehicle.z);
    if (remaining < (stop ? 4.8 : 5)) {
      if (stop) {
        await controls(['Space']);
        await page.waitForFunction(() => Math.abs(window.__taxi.vehicle.speed) < .5);
      }
      await controls([]);return;
    }
    const desired = Math.atan2(-(target.x - vehicle.x), -(target.z - vehicle.z));
    const error = Math.atan2(Math.sin(desired - vehicle.heading), Math.cos(desired - vehicle.heading));
    const speed = Math.abs(error) > .3 || remaining < 13 ? 3.5 : 7;
    const next = [];
    if (error > .07) next.push('KeyA');else if (error < -.07) next.push('KeyD');
    if (vehicle.speed < speed) next.push('KeyW');else if (vehicle.speed > speed + .7) next.push('Space');
    await controls(next);await page.waitForTimeout(100);
  }
  throw new Error(`Did not reach ${JSON.stringify(target)}: ${JSON.stringify(await page.evaluate(() => window.__taxi.vehicle))}`);
}

try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__taxi);
  await page.click('#start');await page.click('#accept');
  await driveTo({ x: 6, z: 13 }, true);
  await page.keyboard.press('KeyE');await page.waitForFunction(() => window.__taxi.state.mission === 'ride');
  console.log('Passenger reached and boarded using keyboard driving.');
  for (const point of [{ x: 4.5, z: -48 }, { x: 10, z: -60 }, { x: 50, z: -60 }, { x: 68, z: -69 }, { x: 70, z: -101 }]) {
    await driveTo(point, point.z === -101);
    console.log('Reached road waypoint', JSON.stringify(point));
  }
  await page.keyboard.press('KeyE');
  const result = await page.evaluate(() => ({ mission: window.__taxi.state.mission, trips: window.__taxi.state.trips, earnings: window.__taxi.state.earnings, condition: window.__taxi.state.condition, comfort: window.__taxi.state.comfort }));
  assert.equal(result.mission, 'complete');assert.equal(result.trips, 1);assert.ok(result.earnings > 10);assert.ok(result.condition > 50);
  await page.screenshot({ path: 'artifacts/driven-fare.png' });
  console.log('Full keyboard-driven fare passed:', JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: 'artifacts/driving-failure.png' });throw error;
} finally { await browser.close(); }
