import * as THREE from 'three';
import { createCar, animateCar } from './vehicle.js';
import { createPerson, animatePerson } from './people.js';
import { GRID, clamp, distance, seededRandom, signalPhase, wrapAngle } from './simulation.js';

const random = seededRandom(8619);
const choose = values => values[Math.floor(random() * values.length)];

export function streetCircuit(left, top, right, bottom, clockwise = true) {
  const lane = clockwise ? 4 : -4;
  const radius = 8;
  const corners = [
    [left + lane + radius, top + lane + radius, Math.PI],
    [right - lane - radius, top + lane + radius, Math.PI * 1.5],
    [right - lane - radius, bottom - lane - radius, 0],
    [left + lane + radius, bottom - lane - radius, Math.PI * .5],
  ];
  const points = [];
  for (const [centerX, centerZ, start] of corners) {
    for (let segment = 0; segment <= 12; segment++) {
      const angle = start + segment / 12 * Math.PI / 2;
      points.push({ x: centerX + Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius });
    }
  }
  if (!clockwise) points.reverse();
  return points;
}

function sampleCircuit(points, distanceAlong) {
  for (let index = 0; index < points.length; index++) {
    const first = points[index];const second = points[(index + 1) % points.length];
    const length = distance(first, second);
    if (distanceAlong <= length) {
      const fraction = distanceAlong / length;
      return { x: THREE.MathUtils.lerp(first.x, second.x, fraction), z: THREE.MathUtils.lerp(first.z, second.z, fraction), heading: Math.atan2(-(second.x - first.x), -(second.z - first.z)) };
    }
    distanceAlong -= length;
  }
  return { ...points[0], heading: 0 };
}

export function populateStreetLife(city) {
  const colors = [0xe5e6e2, 0x325e80, 0x214d46, 0xb84a36, 0x8199a6, 0x222b37, 0xc4bdae, 0xf3bb23];
  for (let index = 0; index < 42; index++) {
    const left = (Math.floor(random() * 4) - 3) * GRID;
    const top = (Math.floor(random() * 4) - 3) * GRID;
    const right = Math.min(192, left + (2 + Math.floor(random() * 3)) * GRID);
    const bottom = Math.min(192, top + (2 + Math.floor(random() * 3)) * GRID);
    const route = streetCircuit(left, top, right, bottom, index % 2 === 0);
    const length = route.reduce((total, point, routeIndex) => total + distance(point, route[(routeIndex + 1) % route.length]), 0);
    let progress = random() * length;
    let position = sampleCircuit(route, progress);
    for (let attempt = 0; attempt < 35 && (distance(position, { x: 4.5, z: 42 }) < 14 || city.traffic.some(other => distance(position, other.state) < 10)); attempt++) {
      progress = (progress + 19) % length;position = sampleCircuit(route, progress);
    }
    const car = createCar(choose(colors), false, index % 4 === 0 ? 'wagon' : index % 5 === 0 ? 'compact' : 'sedan');
    const state = { ...position, speed: 4, steering: 0, acceleration: 0, distance: 0, braking: false };
    city.scene.add(car);city.traffic.push({ car, state, route, length, progress, desiredSpeed: 6 + random() * 3, axis: 'z', turns: 0 });
    animateCar(car, state, 0);
  }
  for (let index = 0; index < 76; index++) {
    const person = createPerson(choose([0x4c7395, 0xdc9061, 0xe6dfca, 0x397a86, 0xba5754, 0x8eac83, 0xd3b25f]));
    const road = (Math.floor(random() * 5) - 2) * GRID;
    const block = (Math.floor(random() * 4) - 2) * GRID;
    const vertical = index % 2 === 0;
    const direction = index % 3 ? 1 : -1;
    const progress = block + 18 + random() * 28;
    const walker = { person, vertical, fixed: road + (index % 4 < 2 ? 12 : -12), minimum: block + 16, maximum: block + 112, progress, direction, speed: .85 + random() * .55, actualSpeed: 0, crossing: false, pause: random() * 3, startled: 0 };
    person.position.set(vertical ? walker.fixed : progress, .25, vertical ? progress : walker.fixed);
    city.scene.add(person);city.pedestrians.push(walker);
  }
}

export function updateStreetLife(city, vehicle, time, delta, honking = false) {
  for (const walker of city.pedestrians) {
    const position = walker.person.position;
    const distanceToCab = Math.hypot(position.x - vehicle.x, position.z - vehicle.z);
    walker.person.visible = distanceToCab < 145;
    let targetSpeed = walker.speed;
    const nearestCrossing = Math.round(walker.progress / GRID) * GRID;
    const roadOffset = walker.progress - nearestCrossing;
    const approaching = walker.direction * roadOffset < -11.8 && walker.direction * roadOffset > -14;
    const crossingAxis = walker.vertical ? 'x' : 'z';
    const phase = time % 24;
    const walkSignal = crossingAxis === 'x' ? phase < 4 : phase >= 12 && phase < 16;
    walker.crossing = Math.abs(roadOffset) < 11.8;
    if (approaching && !walkSignal) targetSpeed = 0;
    if (walker.pause > 0) {walker.pause -= delta;targetSpeed = 0;}
    if (honking && distanceToCab < 18) walker.startled = 1.3;
    walker.startled = Math.max(0, walker.startled - delta);
    if (walker.startled > 0 && !walker.crossing) targetSpeed = 0;
    const approachingCab = distanceToCab < 5 && Math.abs(vehicle.speed) > 1;
    if (approachingCab) targetSpeed = 0;
    if (walker.crossing && !approachingCab) targetSpeed *= 1.18;
    walker.actualSpeed = THREE.MathUtils.damp(walker.actualSpeed, targetSpeed, 10, delta);
    walker.progress += walker.direction * walker.actualSpeed * delta;
    if (walker.progress > walker.maximum || walker.progress < walker.minimum) {
      walker.direction *= -1;walker.progress = clamp(walker.progress, walker.minimum, walker.maximum);walker.pause = .8 + random() * 2;
    }
    const elevation = THREE.MathUtils.smoothstep(Math.abs(walker.progress - Math.round(walker.progress / GRID) * GRID), 9.3, 11.5) * .25;
    position.set(walker.vertical ? walker.fixed : walker.progress, elevation, walker.vertical ? walker.progress : walker.fixed);
    const desiredHeading = approachingCab || (walker.startled > 0 && !walker.crossing) ? Math.atan2(-(vehicle.x - position.x), -(vehicle.z - position.z)) : walker.vertical ? (walker.direction > 0 ? Math.PI : 0) : (walker.direction > 0 ? -Math.PI / 2 : Math.PI / 2);
    walker.person.rotation.y += wrapAngle(desiredHeading - walker.person.rotation.y) * (1 - Math.exp(-delta * 5));
    animatePerson(walker.person, walker.actualSpeed, delta, walker.startled > 0);
  }
  for (const traffic of city.traffic) {
    const current = traffic.state;
    const forwardX = -Math.sin(current.heading);const forwardZ = -Math.cos(current.heading);
    traffic.axis = Math.abs(forwardX) > .7 ? 'x' : 'z';
    const direction = traffic.axis === 'x' ? Math.sign(forwardX) : Math.sign(forwardZ);
    const longitudinal = current[traffic.axis];
    const nextJunction = direction > 0 ? Math.ceil((longitudinal + .1) / GRID) * GRID : Math.floor((longitudinal - .1) / GRID) * GRID;
    const toJunction = (nextJunction - longitudinal) * direction;
    let targetSpeed = traffic.desiredSpeed;
    const lookahead = sampleCircuit(traffic.route, (traffic.progress + 8) % traffic.length);
    const turn = Math.abs(wrapAngle(lookahead.heading - current.heading));
    if (turn > .15) targetSpeed = Math.min(targetSpeed, 3.8);
    if (signalPhase(time, traffic.axis) !== 'green' && toJunction > 10 && toJunction < 28) targetSpeed = Math.min(targetSpeed, Math.max(0, (toJunction - 14) * .75));
    const yieldFor = (position, clearance) => {
      const relativeX = position.x - current.x;const relativeZ = position.z - current.z;
      const ahead = relativeX * forwardX + relativeZ * forwardZ;
      const beside = Math.abs(relativeX * forwardZ - relativeZ * forwardX);
      if (beside < 2.5 && ahead > -.4 && ahead < 18) targetSpeed = Math.min(targetSpeed, Math.max(0, (ahead - clearance) * .75));
    };
    yieldFor(vehicle, 7);
    for (const other of city.traffic) if (other !== traffic && distance(current, other.state) < 18) yieldFor(other.state, 6.3);
    for (const walker of city.pedestrians) if (walker.crossing || walker.startled > 0) yieldFor(walker.person.position, 4.5);
    const oldSpeed = current.speed;
    current.speed = THREE.MathUtils.damp(current.speed, targetSpeed, targetSpeed < oldSpeed ? 5 : 1.8, delta);
    traffic.progress = (traffic.progress + current.speed * delta) % traffic.length;
    const pose = sampleCircuit(traffic.route, traffic.progress);
    const headingChange = wrapAngle(pose.heading - current.heading);
    if (Math.abs(headingChange) > .04) traffic.turns++;
    current.x = pose.x;current.z = pose.z;
    current.heading += headingChange * (1 - Math.exp(-delta * 18));
    current.steering = clamp(headingChange * 2, -.4, .4);
    current.acceleration = (current.speed - oldSpeed) / Math.max(delta, .001);
    current.distance += current.speed * delta;current.braking = targetSpeed < oldSpeed - .5;
    traffic.car.visible = distance(current, vehicle) < 180;
    animateCar(traffic.car, current, delta);
  }
  city.updateSignals(time);
}
