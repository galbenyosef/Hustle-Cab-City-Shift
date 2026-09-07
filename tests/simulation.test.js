import test from 'node:test';
import assert from 'node:assert/strict';
import { findRoute, routeLength, stepVehicle, farePayout, signalPhase, FARES } from '../src/simulation.js';

test('navigation follows the road grid, including opposite curbs', () => {
  const route = findRoute({ x: 8, z: 13 }, { x: 72, z: -102 });
  assert.deepEqual(route[0], { x: 8, z: 13 });
  assert.deepEqual(route.at(-1), { x: 72, z: -102 });
  for (let index = 1; index < route.length; index++) {
    assert.ok(route[index].x === route[index - 1].x || route[index].z === route[index - 1].z, 'route must never cut diagonally through a building');
  }
  assert.equal(routeLength(findRoute({ x: 4, z: 40 }, { x: 8, z: 13 })), 39);
  for (const fare of FARES) assert.ok(routeLength(findRoute(fare.pickup, fare.destination)) > 100);
});

test('braking stops the cab without involuntarily reversing', () => {
  const vehicle = { x: 0, z: 0, heading: 0, speed: 16, steering: 0, distance: 0 };
  for (let frame = 0; frame < 180; frame++) stepVehicle(vehicle, { brake: true }, 1 / 60);
  assert.equal(vehicle.speed, 0);
  assert.ok(vehicle.z > -10, 'handbrake should stop within a believable distance');
});

test('acceleration and speed-sensitive steering are stable across timestep sizes', () => {
  const simulate = rate => {
    const vehicle = { x: 0, z: 0, heading: 0, speed: 0, steering: 0, distance: 0 };
    for (let frame = 0; frame < rate * 4; frame++) stepVehicle(vehicle, { forward: true, left: true }, 1 / rate);
    return vehicle;
  };
  const slow = simulate(60);const fast = simulate(120);
  assert.ok(Math.abs(slow.speed - fast.speed) < .1);
  assert.ok(Math.hypot(slow.x - fast.x, slow.z - fast.z) < .5);
  assert.ok(slow.speed > 10 && slow.speed < 25);
});

test('smooth fares earn a larger tip and rating than rough rides', () => {
  const smooth = farePayout(350, 100, 100);const rough = farePayout(350, 100, 40);
  assert.equal(smooth.base, rough.base);
  assert.equal(smooth.rating, 5);assert.equal(rough.tip, 0);
  assert.ok(smooth.total > rough.total);
  assert.equal(smooth.total, Math.round((smooth.base + smooth.tip) * 100) / 100);
});

test('intersection phases never allow conflicting green traffic', () => {
  for (let time = 0; time < 100; time += .1) assert.ok(!(signalPhase(time, 'x') === 'green' && signalPhase(time, 'z') === 'green'));
  assert.equal(signalPhase(11.5, 'x'), 'red');assert.equal(signalPhase(11.5, 'z'), 'red');
});

test('reverse pulls away from rest at every supported physics timestep', () => {
  for (const rate of [30, 60, 90, 120, 144, 240]) {
    const vehicle = { x: 0, z: 0, heading: 0, speed: 0, steering: 0, distance: 0 };
    for (let frame = 0; frame < rate * 2; frame++) stepVehicle(vehicle, { reverse: true }, 1 / rate);
    assert.ok(vehicle.speed < -3, `reverse must engage at ${rate} Hz`);
    assert.ok(vehicle.z > 3, `cab must travel backwards at ${rate} Hz`);
  }
});

test('holding reverse brakes through zero and accelerates backwards smoothly', () => {
  const vehicle = { x: 0, z: 0, heading: 0, speed: 8, steering: 0, distance: 0 };
  for (let frame = 0; frame < 360; frame++) stepVehicle(vehicle, { reverse: true, left: true }, 1 / 120);
  assert.ok(vehicle.speed < -3);
  const reverseHeading = vehicle.heading;
  stepVehicle(vehicle, { reverse: true, left: true }, 1 / 120);
  assert.ok(vehicle.heading < reverseHeading);
  for (let frame = 0; frame < 480; frame++) stepVehicle(vehicle, { forward: true }, 1 / 120);
  assert.ok(vehicle.speed > 5);
});
