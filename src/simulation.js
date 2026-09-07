export const GRID = 64;
export const EXTENT = 192;
export const ROAD_HALF = 10;
export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
export const lerp = (start, end, amount) => start + (end - start) * amount;
export const distance = (first, second) => Math.hypot(first.x - second.x, first.z - second.z);
export const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function seededRandom(seed = 428) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function roadPosition(position) {
  const roadX = clamp(Math.round(position.x / GRID) * GRID, -EXTENT, EXTENT);
  const roadZ = clamp(Math.round(position.z / GRID) * GRID, -EXTENT, EXTENT);
  const vertical = Math.abs(position.x - roadX) < Math.abs(position.z - roadZ);
  return { vertical, roadX, roadZ, offset: vertical ? position.x - roadX : position.z - roadZ };
}

function roadConnections(position) {
  const road = roadPosition(position);
  if (road.vertical) {
    const lower = clamp(Math.floor(position.z / GRID) * GRID, -EXTENT, EXTENT);
    const upper = clamp(lower + GRID, -EXTENT, EXTENT);
    return { projection: { x: road.roadX, z: position.z }, nodes: [{ x: road.roadX, z: lower }, { x: road.roadX, z: upper }] };
  }
  const lower = clamp(Math.floor(position.x / GRID) * GRID, -EXTENT, EXTENT);
  const upper = clamp(lower + GRID, -EXTENT, EXTENT);
  return { projection: { x: position.x, z: road.roadZ }, nodes: [{ x: lower, z: road.roadZ }, { x: upper, z: road.roadZ }] };
}

export function routeLength(points) {
  return points.slice(1).reduce((total, point, index) => total + distance(point, points[index]), 0);
}

export function findRoute(start, end) {
  const source = roadConnections(start);
  const target = roadConnections(end);
  let best = null;
  let bestLength = Infinity;
  const candidates = [];
  if ((source.projection.x === target.projection.x && source.projection.x % GRID === 0) || (source.projection.z === target.projection.z && source.projection.z % GRID === 0)) {
    candidates.push([start, source.projection, target.projection, end]);
  }
  for (const first of source.nodes) {
    for (const last of target.nodes) {
      candidates.push([start, source.projection, first, { x: first.x, z: last.z }, last, target.projection, end]);
      candidates.push([start, source.projection, first, { x: last.x, z: first.z }, last, target.projection, end]);
    }
  }
  for (const candidate of candidates) {
    const length = routeLength(candidate);
    if (length < bestLength) {
      bestLength = length;
      best = candidate;
    }
  }
  return best.filter((point, index) => index === 0 || distance(point, best[index - 1]) > .05).map(point => ({ ...point }));
}

export function stepVehicle(vehicle, controls, delta, wet = false) {
  const previousSpeed = vehicle.speed;
  const throttle = controls.forward ? 1 : 0;
  const brake = controls.reverse ? 1 : 0;
  const handbrake = controls.brake;
  if (throttle) vehicle.speed += (vehicle.speed < -0.5 ? 13 : 5.8 * (1 - Math.max(0, vehicle.speed) / 34)) * delta;
  if (brake) vehicle.speed -= (vehicle.speed > .5 ? 12 : 3.4 * (1 + Math.min(0, vehicle.speed) / 7)) * delta;
  if (handbrake) vehicle.speed -= Math.sign(vehicle.speed) * Math.min(Math.abs(vehicle.speed), (wet ? 11 : 17) * delta);
  const rollingResistance = .3 + Math.abs(vehicle.speed) * .038 + vehicle.speed * vehicle.speed * .0018;
  if (!throttle && !brake) vehicle.speed -= Math.sign(vehicle.speed) * Math.min(Math.abs(vehicle.speed), rollingResistance * delta);
  vehicle.speed = clamp(vehicle.speed, -7, 32);
  if (!throttle && !brake && Math.abs(vehicle.speed) < .035) vehicle.speed = 0;
  const steerInput = Number(Boolean(controls.left)) - Number(Boolean(controls.right));
  const steeringLimit = .56 / (1 + Math.abs(vehicle.speed) * .055);
  vehicle.steering = lerp(vehicle.steering, steerInput * steeringLimit, 1 - Math.exp(-delta * (wet ? 5 : 8)));
  const turnRate = vehicle.speed / 3.05 * Math.tan(vehicle.steering) * (wet ? .84 : 1);
  vehicle.heading = wrapAngle(vehicle.heading + turnRate * delta);
  vehicle.x -= Math.sin(vehicle.heading) * vehicle.speed * delta;
  vehicle.z -= Math.cos(vehicle.heading) * vehicle.speed * delta;
  vehicle.acceleration = (vehicle.speed - previousSpeed) / Math.max(delta, .0001);
  vehicle.turnForce = Math.abs(turnRate * vehicle.speed);
  vehicle.braking = Boolean(handbrake || (brake && previousSpeed > .1) || (throttle && previousSpeed < -.1));
  vehicle.distance += Math.abs(vehicle.speed) * delta;
  return vehicle;
}

export function farePayout(meters, seconds, comfort) {
  const base = 4.5 + meters * .034 + seconds * .035;
  const rating = clamp(2 + comfort * .03, 2, 5);
  const tip = comfort >= 65 ? base * ((comfort - 50) / 200) : 0;
  const roundedBase = Math.round(base * 100) / 100;
  const roundedTip = Math.round(tip * 100) / 100;
  return { base: roundedBase, tip: roundedTip, total: Math.round((roundedBase + roundedTip) * 100) / 100, rating };
}

export function signalPhase(time, axis) {
  const phase = time % 24;
  if (axis === 'z') return phase < 9 ? 'green' : phase < 11 ? 'amber' : 'red';
  return phase >= 12 && phase < 21 ? 'green' : phase >= 21 && phase < 23 ? 'amber' : 'red';
}

export const FARES = [
  { name: 'Julia Moreno', initials: 'JM', description: 'Heading home · Easygoing', pickup: { x: 8, z: 13, name: 'Bleecker Street Coffee' }, destination: { x: 72, z: -102, name: 'Washington Square East' }, quote: '“No rush. I finally have the evening to myself.”', thanks: '“The quiet ride was exactly what I needed.”', allowance: 180 },
  { name: 'Theo Park', initials: 'TP', description: 'Dinner plans · On a schedule', pickup: { x: 56, z: -26, name: 'Sullivan Street Books' }, destination: { x: -120, z: 86, name: 'The Waverly, West Village' }, quote: '“Meeting someone for dinner. First date, actually.”', thanks: '“Made it with a minute to spare. Wish me luck.”', allowance: 150 },
  { name: 'Amara Wilson', initials: 'AW', description: 'Late rehearsal · Music lover', pickup: { x: -8, z: 95, name: 'Blue Note Jazz Club' }, destination: { x: 136, z: 28, name: 'Mercer Street Studios' }, quote: '“You can leave the radio on. I like the sound of the city.”', thanks: '“You have a good feel for these streets.”', allowance: 200 },
  { name: 'Elliot Chen', initials: 'EC', description: 'Night photographer · Taking it slow', pickup: { x: -72, z: -96, name: 'Hudson Flower Market' }, destination: { x: 8, z: 163, name: 'Canal Street Gallery' }, quote: '“This light only lasts twenty minutes. Look at those rooftops.”', thanks: '“I got the shot through the window. Beautiful ride.”', allowance: 220 },
  { name: 'Sofia Rossi', initials: 'SR', description: 'Closing up · Knows every corner', pickup: { x: 136, z: 101, name: 'Rossi’s Neighbourhood Deli' }, destination: { x: -136, z: -34, name: 'Hudson River Apartments' }, quote: '“Long day. Could you take me home?”', thanks: '“Now that’s how you drive a yellow cab.”', allowance: 230 },
];
