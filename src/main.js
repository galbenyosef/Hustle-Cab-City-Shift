import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { City, createPerson } from './world.js';
import { createCar, animateCar } from './vehicle.js';
import { CabAudio } from './audio.js';
import { animatePerson } from './people.js';
import { updateStreetLife } from './streetlife.js';
import { GRID, EXTENT, FARES, clamp, lerp, distance, wrapAngle, roadPosition, findRoute, routeLength, stepVehicle, farePayout, signalPhase, seededRandom } from './simulation.js';

const element = id => document.getElementById(id);
const show = (id, visible = true) => element(id).classList.toggle('hidden', !visible);
const money = value => `$${value.toFixed(2)}`;
const keys = new Set();
const navigationPoints = [];
const cameraNames = ['Chase', 'Bonnet', 'Overhead'];
const state = {
  started: false, paused: false, freeDrive: false, time: 0, camera: 0, weather: 'sunny',
  earnings: 0, trips: 0, ratingTotal: 0, condition: 100, collisions: 0, fareIndex: 0,
  mission: 'offer', comfort: 100, rideSeconds: 0, rideStartDistance: 0, boarding: 0,
  receiptTimer: 0, toastTimer: 0, collisionCooldown: 0, hornCooldown: 0, intersection: '',
};
const vehicle = { x: 4.5, z: 42, heading: 0, speed: 0, steering: 0, acceleration: 0, turnForce: 0, distance: 0, braking: false };
const audio = new CabAudio();
let renderer, scene, camera, composer, bloom, city, cab, marker, rider, sun, sky, rain, ambient, environmentTarget;
let frameTime = performance.now();
let uiTimer = 0;
let mapTimer = 0;
let bestShift = 0;
let lastRoadState = true;
let frameCount = 0;
let fps = 60;
let fpsTimer = 0;
let qualityAdjusted = false;
const cameraPosition = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const headlightTarget = new THREE.Object3D();
let headlights;
try { bestShift = Number(localStorage.getItem('hustle-after-hours-best')) || 0; } catch {}

function notify(message, seconds = 4) {
  element('toast').textContent = message;
  element('toast').classList.add('visible');
  state.toastTimer = seconds;
}

function currentFare() { return FARES[state.fareIndex % FARES.length]; }
function currentTarget() { return state.mission === 'ride' ? currentFare().destination : currentFare().pickup; }

function buildSky() {
  sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { topColor: { value: new THREE.Color('#1689ed') }, horizonColor: { value: new THREE.Color('#89caf5') }, sunDirection: { value: new THREE.Vector3(-.4, .75, -.3).normalize() }, sunColor: { value: new THREE.Color('#fff8de') } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vDirection; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDirection; uniform vec3 sunColor; void main(){vec3 direction=normalize(vDirection); float height=max(direction.y,0.0); vec3 color=mix(horizonColor,topColor,pow(height,.55)); float solar=max(dot(direction,sunDirection),0.0); color+=sunColor*pow(solar,180.0)*.2; color+=sunColor*smoothstep(.9995,.9998,solar)*.8; gl_FragColor=vec4(color,1.0);}',
  }));
  scene.add(sky);
}

function createMarker() {
  const group = new THREE.Group();
  const circle = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.3, 64), new THREE.MeshBasicMaterial({ color: 0xc4e3b5, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
  circle.rotation.x = -Math.PI / 2;circle.position.y = .05;group.add(circle);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshBasicMaterial({ color: 0xb0d7a5, transparent: true, opacity: .07, depthWrite: false }));
  inner.rotation.x = -Math.PI / 2;inner.position.y = .045;group.add(inner);
  const pin = new THREE.Group();pin.position.y = 3.5;
  const pinMaterial = new THREE.MeshBasicMaterial({ color: 0xefbd54 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.35, .07, 8, 24), pinMaterial);pin.add(ring);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), pinMaterial);pin.add(dot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.13, .25, 3), pinMaterial);tail.rotation.z = Math.PI;tail.position.y = -.43;pin.add(tail);group.add(pin);
  group.userData.pin = pin;scene.add(group);return group;
}

function createRain() {
  const random = seededRandom(68);
  const positions = new Float32Array(1800 * 6);
  for (let index = 0; index < positions.length; index += 6) {
    positions[index] = random() * 100 - 50;positions[index + 1] = random() * 36;positions[index + 2] = random() * 100 - 50;
    positions[index + 3] = positions[index] + .12;positions[index + 4] = positions[index + 1] - .7;positions[index + 5] = positions[index + 2];
  }
  const geometry = new THREE.BufferGeometry();geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xbcd5ce, transparent: true, opacity: .34, depthWrite: false }));
  rain.frustumCulled = false;rain.visible = false;scene.add(rain);
}

function setWeather(weather) {
  state.weather = weather;
  const night = weather === 'night';
  const wet = weather === 'rain';
  sky.material.uniforms.topColor.value.set(night ? '#142c3c' : wet ? '#687f80' : '#1689ed');
  sky.material.uniforms.horizonColor.value.set(night ? '#586d80' : wet ? '#b2b3a0' : '#89caf5');
  sky.material.uniforms.sunColor.value.set(night ? '#000000' : wet ? '#887e68' : '#fff0bf');
  scene.fog.color.set(night ? '#475968' : wet ? '#a8b3a6' : '#b2d9f3');
  scene.fog.near = wet ? 50 : night ? 90 : 180;scene.fog.far = wet ? 260 : night ? 470 : 760;
  ambient.intensity = night ? .65 : wet ? 2 : 2.1;
  ambient.color.set(night ? 0x8ba8bd : 0xc4e4ff);ambient.groundColor.set(night ? 0x373344 : 0xc6bca3);
  sun.intensity = night ? .2 : wet ? 1.3 : 3.5;
  sun.color.set(night ? 0x8fa4bb : wet ? 0xe7d9be : 0xffefd8);
  scene.environmentIntensity = night ? .35 : .45;
  city.roadMaterial.roughness = wet ? .22 : .88;
  city.roadMaterial.metalness = wet ? .45 : .02;
  city.windowMaterials.forEach(surface => { surface.emissiveIntensity = night ? .27 : wet ? .14 : .045; });
  headlights.intensity = night ? 35 : wet ? 18 : 0;
  rain.visible = wet;
  bloom.strength = night ? .3 : wet ? .2 : .13;
  renderer.toneMappingExposure = night ? 1.1 : 1.05;
  element('weather').value = weather;
}

function setupScene() {
  renderer = new THREE.WebGLRenderer({ canvas: element('world'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1.05;renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();scene.fog = new THREE.Fog(0xc8c6a9, 85, 470);
  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .12, 1200);
  const environment = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();environmentTarget = environment.fromScene(room, .04);scene.environment = environmentTarget.texture;scene.environmentIntensity = .7;room.dispose();environment.dispose();
  ambient = new THREE.HemisphereLight(0xd1e5dc, 0x7b7254, 2.3);scene.add(ambient);
  sun = new THREE.DirectionalLight(0xffd49b, 3.7);sun.position.set(-70, 95, -80);sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);sun.shadow.camera.left = -65;sun.shadow.camera.right = 65;sun.shadow.camera.top = 65;sun.shadow.camera.bottom = -65;sun.shadow.camera.near = 1;sun.shadow.camera.far = 260;sun.shadow.bias = -.0003;sun.shadow.normalBias = .12;
  scene.add(sun, sun.target);buildSky();
  city = new City(scene);cab = createCar(0xf2b82e, true);scene.add(cab);animateCar(cab, vehicle, 0);
  headlights = new THREE.SpotLight(0xffe5b5, 0, 45, .55, .6, 1.3);scene.add(headlights, headlightTarget);headlights.target = headlightTarget;
  marker = createMarker();rider = createPerson(0xb68c6c);scene.add(rider);createRain();
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 2, type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, target);composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .13, .5, 1.1);composer.addPass(bloom);composer.addPass(new OutputPass());
  setWeather('sunny');refreshFare();updateCamera(1, true);
  element('start-label').textContent = 'Let’s drive';element('start').disabled = false;
  element('best-shift').textContent = bestShift > 0 ? `YOUR BEST SHIFT  ${money(bestShift)}` : 'Your first good shift starts here.';
}

function refreshFare() {
  const fare = currentFare();
  element('avatar').textContent = fare.initials;element('rider-name').textContent = fare.name;element('rider-description').textContent = fare.description;
  element('pickup-name').textContent = fare.pickup.name;element('destination-name').textContent = fare.destination.name;
  element('fare-number').textContent = String(state.fareIndex + 1).padStart(2, '0');
  const estimated = farePayout(routeLength(findRoute(fare.pickup, fare.destination)), 70, 90);
  element('fare-value').textContent = `${money(Math.floor(estimated.base))}–${Math.ceil(estimated.total + 3)}`;
  element('fare-meta').textContent = 'ESTIMATED FARE';element('dispatch-label').textContent = 'DISPATCH / AVAILABLE FARE';
  show('accept');show('skip');show('comfort-wrap', false);show('receipt', false);
  state.mission = 'offer';state.comfort = 100;state.rideSeconds = 0;
  rider.visible = true;rider.position.set(fare.pickup.x + (fare.pickup.x % GRID > 0 ? 3.2 : -3.2), .25, fare.pickup.z);rider.rotation.y = fare.pickup.x % GRID > 0 ? Math.PI / 2 : -Math.PI / 2;
  marker.position.set(fare.pickup.x, 0, fare.pickup.z);marker.visible = !state.freeDrive;
  show('navigation', !state.freeDrive);show('interaction', false);
  updateNavigation();
}

function acceptFare() {
  if (state.mission !== 'offer' || state.paused || !state.started) return;
  state.freeDrive = false;state.mission = 'pickup';
  element('dispatch-label').textContent = 'DISPATCH / ON YOUR WAY';element('fare-meta').textContent = 'YOUR NEXT PASSENGER';
  show('accept', false);show('skip', false);show('navigation');marker.visible = true;
  notify(`Head to ${currentFare().pickup.name}. Stop by the curb to board.`);audio.dispatch();
}

function startShift(freeDrive = false) {
  if (state.started) return;
  if (audio.preference) audio.enable().then(updateSoundLabel).catch(() => notify('Tap the sound button to enable audio.'));
  state.started = true;state.freeDrive = freeDrive;document.body.classList.add('playing');
  show('welcome', false);show('scene-caption', false);show('welcome-footer', false);show('hud');show('pause-button');
  show('navigation', !freeDrive);marker.visible = !freeDrive;
  notify(freeDrive ? 'Take your time. A fare is there whenever you want one.' : 'Sun’s out! Press E to meet your first passenger.', 6);
  updateCamera(1, true);
}

function interact() {
  if (!state.started || state.paused) return;
  if (state.mission === 'offer') { acceptFare();return; }
  if (Math.abs(vehicle.speed) > 1.2 || distance(vehicle, currentTarget()) > 7) return;
  if (state.mission === 'pickup') {
    state.mission = 'boarding';state.boarding = 2;vehicle.speed = 0;
    show('interaction', false);notify(`${currentFare().name.split(' ')[0]} is getting in.`, 2);audio.tone(330, .25);
  } else if (state.mission === 'ride') completeFare();
}

function completeFare() {
  const plannedDistance = routeLength(findRoute(currentFare().pickup, currentFare().destination));
  const billableDistance = Math.min(vehicle.distance - state.rideStartDistance, plannedDistance * 1.6);
  const payout = farePayout(billableDistance, Math.min(state.rideSeconds, currentFare().allowance), state.comfort);
  state.earnings = Math.round((state.earnings + payout.total) * 100) / 100;state.trips++;state.ratingTotal += payout.rating;
  state.mission = 'complete';state.receiptTimer = 7;vehicle.speed = 0;marker.visible = false;
  rider.visible = true;rider.position.set(vehicle.x + Math.cos(vehicle.heading) * 1.8, .25, vehicle.z - Math.sin(vehicle.heading) * 1.8);
  show('interaction', false);show('navigation', false);show('receipt');
  element('receipt-total').textContent = `+${money(payout.total)}`;
  element('receipt-breakdown').textContent = `Fare ${money(payout.base)} + tip ${money(payout.tip)}`;
  element('receipt-stars').textContent = '★'.repeat(Math.round(payout.rating)) + '☆'.repeat(5 - Math.round(payout.rating));
  element('receipt-quote').textContent = state.comfort > 70 ? currentFare().thanks : '“We made it. A gentler ride next time, please.”';
  element('dispatch-label').textContent = 'DISPATCH / FARE COMPLETE';element('fare-value').textContent = money(payout.total);element('fare-meta').textContent = 'FARE + TIP';
  saveBest();audio.payment();
}

function saveBest() {
  if (state.earnings <= bestShift) return;
  bestShift = state.earnings;
  try { localStorage.setItem('hustle-after-hours-best', String(bestShift)); } catch {}
}

function togglePause(force) {
  if (!state.started || element('map-dialog').open) return;
  state.paused = force ?? !state.paused;keys.clear();
  if (state.paused) {
    element('best-shift').textContent = `${state.trips} completed trips · Best shift ${money(bestShift)}`;
    element('pause-menu').showModal();
  } else element('pause-menu').close();
}

function toggleMap() {
  if (!state.started || element('pause-menu').open) return;
  const open = !element('map-dialog').open;
  state.paused = open;keys.clear();document.body.classList.toggle('map-expanded', open);
  if (open) { element('map-dialog').showModal();drawMap(element('fullmap'), true); }
  else element('map-dialog').close();
}

function recover() {
  if (!state.started || state.paused || state.mission === 'boarding') return;
  const road = roadPosition(vehicle);
  if (road.vertical) { vehicle.x = road.roadX + 4.5;vehicle.z = clamp(Math.round(vehicle.z / GRID) * GRID + 25, -175, 175);vehicle.heading = 0; }
  else { vehicle.z = road.roadZ - 4.5;vehicle.x = clamp(Math.round(vehicle.x / GRID) * GRID + 25, -175, 175);vehicle.heading = Math.PI / 2; }
  vehicle.speed = 0;vehicle.steering = 0;state.condition = 100;state.earnings = Math.max(0, state.earnings - 8);
  if (state.mission === 'ride') state.comfort = Math.max(0, state.comfort - 10);
  for (const traffic of city.traffic) if (distance(vehicle, traffic.state) < 10) traffic.progress = (traffic.progress + 25) % traffic.length;
  notify('Roadside service: cab recovered and repaired. Up to $8 deducted.');updateCamera(1, true);
}

function damage(amount, message) {
  if (state.collisionCooldown > 0) return;
  state.collisionCooldown = 2;state.collisions++;state.condition = Math.max(0, state.condition - amount);
  if (state.mission === 'ride') state.comfort = Math.max(0, state.comfort - amount * 1.3);
  notify(message);audio.tone(65, .18, .3, 'triangle');
}

function updateDriving(delta) {
  const controls = { forward: keys.has('KeyW') || keys.has('ArrowUp'), reverse: keys.has('KeyS') || keys.has('ArrowDown'), left: keys.has('KeyA') || keys.has('ArrowLeft'), right: keys.has('KeyD') || keys.has('ArrowRight'), brake: keys.has('Space') };
  const previous = { x: vehicle.x, z: vehicle.z };
  if (state.mission === 'boarding' || state.condition <= 0) { controls.forward = false;controls.reverse = false;controls.brake = true; }
  stepVehicle(vehicle, controls, delta, state.weather === 'rain');
  const road = roadPosition(vehicle);
  const onRoad = Math.abs(road.offset) < 9.1;
  if (!onRoad && Math.abs(vehicle.speed) > 4) {
    vehicle.speed *= Math.exp(-1.4 * delta);
    if (state.mission === 'ride') state.comfort -= delta * 3;
    if (lastRoadState) notify('Easy on the curb. Keep the cab on the road.');
  }
  lastRoadState = onRoad;
  for (const collider of city.colliders) {
    const closestX = clamp(vehicle.x, collider.minX, collider.maxX);
    const closestZ = clamp(vehicle.z, collider.minZ, collider.maxZ);
    if (Math.hypot(vehicle.x - closestX, vehicle.z - closestZ) < 1.15) {
      const impact = Math.abs(vehicle.speed);vehicle.x = previous.x;vehicle.z = previous.z;vehicle.speed *= -.2;
      if (impact > 1) damage(Math.min(22, impact * 1.4), 'Watch the bodywork. Press X if you need roadside service.');
      break;
    }
  }
  if (Math.abs(vehicle.x) > 204 || Math.abs(vehicle.z) > 204) {
    vehicle.x = clamp(vehicle.x, -203.5, 203.5);vehicle.z = clamp(vehicle.z, -203.5, 203.5);vehicle.speed *= -.15;
    notify('End of the neighbourhood. Turn back toward the city.');
  }
  for (const traffic of city.traffic) {
    if (distance(vehicle, traffic.state) < 3.3) {
      const impact = Math.abs(vehicle.speed) + traffic.state.speed * .3;
      vehicle.x = previous.x;vehicle.z = previous.z;vehicle.speed *= -.18;traffic.state.speed = 0;
      if (impact > 1) damage(Math.min(18, impact), 'A little more room between you and the next car.');
    }
  }
  for (const pedestrian of city.pedestrians) {
    if (Math.hypot(vehicle.x - pedestrian.person.position.x, vehicle.z - pedestrian.person.position.z) < 1.7) {
      const impact = Math.abs(vehicle.speed);vehicle.x = previous.x;vehicle.z = previous.z;vehicle.speed = 0;
      if (impact > .5) damage(12, 'Pedestrian right of way. Leave the sidewalk clear.');
    }
  }
  const intersectionX = Math.round(vehicle.x / GRID) * GRID;
  const intersectionZ = Math.round(vehicle.z / GRID) * GRID;
  const inIntersection = Math.abs(vehicle.x - intersectionX) < 10 && Math.abs(vehicle.z - intersectionZ) < 10;
  const intersectionKey = `${intersectionX},${intersectionZ}`;
  if (inIntersection && intersectionKey !== state.intersection) {
    state.intersection = intersectionKey;
    if (Math.abs(intersectionX) <= 128 && Math.abs(intersectionZ) <= 128 && Math.abs(vehicle.speed) > 3) {
      const axis = Math.abs(Math.cos(vehicle.heading)) > .7 ? 'z' : 'x';
      if (signalPhase(state.time, axis) === 'red') {
        if (state.mission === 'ride') state.comfort = Math.max(0, state.comfort - 7);
        notify('Red light. Your passengers appreciate a safe driver.');
      }
    }
  } else if (!inIntersection) state.intersection = '';
  if (state.condition <= 0 && state.toastTimer < .1) notify('The cab needs a repair. Press X or tap RECOVER.');
  animateCar(cab, vehicle, delta);
}

function updateTraffic(delta) {
  updateStreetLife(city, vehicle, state.time, delta, state.hornCooldown > .5);
}

function updateMission(delta) {
  if (state.mission === 'boarding') {
    state.boarding -= delta;
    const boardingX = vehicle.x + Math.cos(vehicle.heading) * 1.1;
    const boardingZ = vehicle.z - Math.sin(vehicle.heading) * 1.1;
    rider.rotation.y = Math.atan2(-(boardingX - rider.position.x), -(boardingZ - rider.position.z));
    rider.position.x = lerp(rider.position.x, boardingX, delta * 2);rider.position.z = lerp(rider.position.z, boardingZ, delta * 2);
    if (state.boarding <= 0) {
      state.mission = 'ride';state.rideStartDistance = vehicle.distance;state.rideSeconds = 0;rider.visible = false;
      marker.position.set(currentFare().destination.x, 0, currentFare().destination.z);
      element('dispatch-label').textContent = 'ON BOARD / METER RUNNING';element('fare-meta').textContent = 'LIVE METER';
      element('passenger-line').textContent = currentFare().quote;show('comfort-wrap');notify(`Next stop: ${currentFare().destination.name}`);audio.dispatch();updateNavigation();
    }
  }
  if (state.mission === 'ride') {
    state.rideSeconds += delta;
    const roughDriving = Math.max(0, vehicle.turnForce - 5) * .18 + Math.max(0, -vehicle.acceleration - 8) * .12;
    const late = state.rideSeconds > currentFare().allowance ? .09 : 0;
    const speeding = Math.abs(vehicle.speed) > 17 ? .15 : 0;
    state.comfort = clamp(state.comfort - (roughDriving + late + speeding) * delta, 0, 100);
    if (state.comfort < 55) element('passenger-line').textContent = '“Could we take it a little easier, please?”';
    else if (state.rideSeconds > currentFare().allowance) element('passenger-line').textContent = '“Are we getting close?”';
  }
  if (state.mission === 'complete') {
    state.receiptTimer -= delta;
    rider.position.x += delta * .65;rider.rotation.y = -Math.PI / 2;
    if (state.receiptTimer <= 0) {state.fareIndex++;refreshFare();audio.dispatch();notify(state.trips % 3 === 0 ? 'Regular status earned. Three more stories in your rear-view mirror.' : 'Dispatch has another passenger for you.');}
  }
  const targetDistance = distance(vehicle, currentTarget());
  const canInteract = (state.mission === 'pickup' || state.mission === 'ride') && targetDistance < 7;
  show('interaction', canInteract);
  if (canInteract) {
    element('interaction').querySelector('span').textContent = Math.abs(vehicle.speed) > 1.2 ? 'Come to a stop by the curb' : state.mission === 'pickup' ? `Pick up ${currentFare().name.split(' ')[0]}` : 'Drop off passenger';
  }
  if (marker.visible) {marker.userData.pin.position.y = 3.5 + Math.sin(state.time * 2) * .1;marker.userData.pin.quaternion.copy(camera.quaternion);}
  animatePerson(rider, state.mission === 'boarding' ? .9 : state.mission === 'complete' ? .65 : 0, delta, state.mission === 'offer' || state.mission === 'pickup');
}

function updateNavigation() {
  navigationPoints.splice(0, navigationPoints.length, ...findRoute(vehicle, currentTarget()));
  const remaining = routeLength(navigationPoints);
  element('nav-distance').textContent = remaining < 1000 ? `${Math.round(remaining)} m` : `${(remaining / 1000).toFixed(1)} km`;
  let guidancePoint = navigationPoints.find(point => distance(vehicle, point) > 14) || currentTarget();
  const angle = wrapAngle(Math.atan2(-(guidancePoint.x - vehicle.x), -(guidancePoint.z - vehicle.z)) - vehicle.heading);
  const near = distance(vehicle, currentTarget()) < 12;
  element('nav-arrow').textContent = near ? '◎' : Math.abs(angle) > 2.3 ? '↶' : angle > .5 ? '↰' : angle < -.5 ? '↱' : '↑';
  const road = roadPosition(vehicle);
  const streets = ['HUDSON ST', 'BEDFORD ST', 'SULLIVAN ST', 'MERCER ST', 'BROADWAY', 'LAFAYETTE ST', 'BOWERY'];
  const crossStreets = ['CANAL ST', 'SPRING ST', 'PRINCE ST', 'BLEECKER ST', 'W 4 ST', 'WAVERLY PL', 'W 8 ST'];
  const street = road.vertical ? streets[clamp(Math.round(road.roadX / GRID) + 2, 0, 6)] : crossStreets[clamp(Math.round(road.roadZ / GRID) + 3, 0, 6)];
  element('nav-instruction').textContent = near ? 'Pull over at the marked curb' : Math.abs(angle) > 2.3 ? 'Turn around when it is safe' : Math.abs(angle) > .5 ? `At the junction, turn ${angle > 0 ? 'left' : 'right'}` : `Continue on ${street.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())}`;
  element('map-status').textContent = state.mission === 'ride' ? 'PASSENGER ON BOARD' : state.mission === 'pickup' ? 'EN ROUTE TO PICKUP' : 'AVAILABLE FOR HIRE';
}

function updateCamera(delta, immediate = false) {
  const sine = Math.sin(vehicle.heading);
  const cosine = Math.cos(vehicle.heading);
  if (!state.started) {
    const orbit = Math.sin(state.time * .065) * .6;
    desiredCamera.set(vehicle.x + 7.5 + orbit, 3.5, vehicle.z + 8.8);
    desiredLook.set(vehicle.x - 4.7, 1.8, vehicle.z - 1.4);
    camera.fov = 49;
  } else if (state.camera === 1) {
    desiredCamera.set(vehicle.x - sine * 1.05, 1.62, vehicle.z - cosine * 1.05);
    desiredLook.set(vehicle.x - sine * 25, 1.45, vehicle.z - cosine * 25);
    camera.fov = 65;
  } else if (state.camera === 2) {
    desiredCamera.set(vehicle.x + sine * 8, 40, vehicle.z + cosine * 8);
    desiredLook.set(vehicle.x - sine * 5, 0, vehicle.z - cosine * 5);camera.fov = 52;
  } else {
    const trailingDistance = 10.8 + Math.abs(vehicle.speed) * .1;
    desiredCamera.set(vehicle.x + sine * trailingDistance, 4.6 + Math.abs(vehicle.speed) * .025, vehicle.z + cosine * trailingDistance);
    desiredLook.set(vehicle.x - sine * 7, 1.45, vehicle.z - cosine * 7);camera.fov = 55 + Math.abs(vehicle.speed) * .17;
    for (const collider of city.colliders) {
      if (desiredCamera.x > collider.minX - .8 && desiredCamera.x < collider.maxX + .8 && desiredCamera.z > collider.minZ - .8 && desiredCamera.z < collider.maxZ + .8) {
        desiredCamera.set(vehicle.x + sine * 4, 6.5, vehicle.z + cosine * 4);break;
      }
    }
  }
  const blend = immediate ? 1 : 1 - Math.exp(-delta * (state.camera === 1 ? 20 : 5));
  cameraPosition.lerp(desiredCamera, blend);cameraLookAt.lerp(desiredLook, blend);
  camera.position.copy(cameraPosition);camera.lookAt(cameraLookAt);camera.updateProjectionMatrix();
  cab.visible = true;
  sun.position.set(vehicle.x - 70, 95, vehicle.z - 80);sun.target.position.set(vehicle.x, 0, vehicle.z);
  headlights.position.set(vehicle.x - sine * 2, .85, vehicle.z - cosine * 2);
  headlightTarget.position.set(vehicle.x - sine * 25, 0, vehicle.z - cosine * 25);
}

function drawMap(canvas, full = false) {
  const context = canvas.getContext('2d');
  const width = canvas.width;const height = canvas.height;
  const scale = full ? width / 460 : 2.3;
  const centerX = full ? 0 : vehicle.x;const centerZ = full ? 0 : vehicle.z;
  const screen = point => ({ x: width / 2 + (point.x - centerX) * scale, y: height / 2 + (point.z - centerZ) * scale });
  context.fillStyle = '#243b32';context.fillRect(0, 0, width, height);
  context.save();context.translate(width / 2 - centerX * scale, height / 2 - centerZ * scale);context.scale(scale, scale);
  context.fillStyle = '#314b3b';context.fillRect(11, -117, 42, 42);
  context.fillStyle = '#2b4544';context.fillRect(-330, -250, 112, 500);
  context.strokeStyle = '#536455';context.lineWidth = 18;
  context.beginPath();for (let index = -3; index <= 3; index++) {context.moveTo(index * GRID, -207);context.lineTo(index * GRID, 207);context.moveTo(-207, index * GRID);context.lineTo(207, index * GRID);}context.stroke();
  context.strokeStyle = '#3b5144';context.lineWidth = 15;context.stroke();
  context.fillStyle = '#a4ae9440';
  for (let blockX = -3; blockX < 3; blockX++) for (let blockZ = -3; blockZ < 3; blockZ++) {
    if (blockX === 0 && blockZ === -2) continue;
    context.fillRect(blockX * GRID + 16, blockZ * GRID + 16, 14, 32);context.fillRect(blockX * GRID + 34, blockZ * GRID + 16, 14, 32);
  }
  if (!state.freeDrive && state.mission !== 'complete') {
    context.lineJoin = 'round';context.lineCap = 'round';context.strokeStyle = '#a8d3b0';context.lineWidth = full ? 2 : 1.9;
    context.beginPath();navigationPoints.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.z) : context.lineTo(point.x, point.z));context.stroke();
    const target = currentTarget();context.strokeStyle = '#eec66c';context.lineWidth = 1.2;context.beginPath();context.arc(target.x, target.z, 3.6, 0, Math.PI * 2);context.stroke();context.fillStyle = '#eec66c';context.beginPath();context.arc(target.x, target.z, 1.2, 0, Math.PI * 2);context.fill();
  }
  for (const traffic of city.traffic) {context.fillStyle = '#c5c5ae55';context.fillRect(traffic.state.x - .8, traffic.state.z - .8, 1.6, 1.6);}
  context.restore();
  const cabPoint = screen(vehicle);
  context.save();context.translate(cabPoint.x, cabPoint.y);context.rotate(-vehicle.heading);
  context.shadowColor = '#edbd53';context.shadowBlur = 10;context.fillStyle = '#efbd54';context.beginPath();context.moveTo(0, -10);context.lineTo(7, 8);context.lineTo(0, 4);context.lineTo(-7, 8);context.closePath();context.fill();context.restore();
  context.font = `${full ? 12 : 15}px Arial`;context.fillStyle = '#abbda07a';context.textAlign = 'center';
  if (full) {const park = screen({ x: 32, z: -96 });context.fillText('WASHINGTON', park.x, park.y - 4);context.fillText('SQUARE', park.x, park.y + 11);context.font = '14px Arial';context.fillText('GREENWICH VILLAGE', width / 2, height - 35);}
  context.textAlign = 'right';context.fillStyle = '#d0dbc4';context.font = `${full ? 16 : 17}px Arial`;context.fillText('N ↑', width - 18, 27);
}

function updateUI() {
  const speedMph = Math.round(Math.abs(vehicle.speed) * 2.237);
  element('speed').textContent = speedMph;element('gear').textContent = vehicle.speed < -.2 ? 'R' : vehicle.speed > .2 ? 'D' : 'P';
  element('gauge-fill').style.strokeDashoffset = String(366 - Math.min(1, speedMph / 72) * 366);
  const cashParts = state.earnings.toFixed(2).split('.');element('money').innerHTML = `$${cashParts[0]}<span>.${cashParts[1]}</span>`;
  element('trips').textContent = `${state.trips} ${state.trips === 1 ? 'trip' : 'trips'}`;
  element('rating').textContent = state.trips ? (state.ratingTotal / state.trips).toFixed(2) : '5.00';
  element('condition').textContent = `${Math.round(state.condition)}%`;element('condition-bar').style.width = `${state.condition}%`;
  element('condition-bar').style.background = state.condition < 35 ? '#db8769' : '#a4ceb5';
  element('cab-state').textContent = state.condition <= 0 ? '● REPAIR NEEDED' : vehicle.speed < -.2 ? '● REVERSING' : vehicle.braking ? '● BRAKING' : state.mission === 'ride' ? '● METER RUNNING' : '● FOR HIRE';
  element('comfort-value').textContent = `${Math.round(state.comfort)}%`;element('comfort-bar').style.width = `${state.comfort}%`;element('comfort-bar').style.background = state.comfort < 50 ? '#db8769' : '#a4ceb5';
  if (state.mission === 'ride') {
    const routeDistance = routeLength(findRoute(currentFare().pickup, currentFare().destination));
    const payout = farePayout(Math.min(vehicle.distance - state.rideStartDistance, routeDistance * 1.6), Math.min(state.rideSeconds, currentFare().allowance), state.comfort);
    element('fare-value').textContent = money(payout.base);
  }
  const minute = ((state.weather === 'night' ? 21 : 14) * 60 + 26 + Math.floor(state.time / 10)) % 1440;
  element('clock').textContent = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const district = vehicle.x < -70 ? 'WEST VILLAGE' : vehicle.z > 75 ? 'SOHO' : vehicle.x > 90 ? 'NOHO' : 'GREENWICH VILLAGE';
  element('location').textContent = district;element('map-district').textContent = district === 'GREENWICH VILLAGE' ? 'THE VILLAGE' : district;
  updateNavigation();
}

function updateRain(delta) {
  if (!rain.visible) return;
  rain.position.set(vehicle.x, 0, vehicle.z);
  const positions = rain.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 2) {
    let height = positions.getY(index) - delta * 22;if (height < 0) height += 36;
    positions.setY(index, height);positions.setY(index + 1, height - .7);
  }
  positions.needsUpdate = true;
}

function setQuality(quality) {
  const high = quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1));
  renderer.shadowMap.enabled = high;bloom.enabled = high;
  element('quality').value = quality;resize();
}

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;camera.updateProjectionMatrix();
}

function loop(now) {
  requestAnimationFrame(loop);
  const delta = Math.min((now - frameTime) / 1000, .05);frameTime = now;
  if (delta <= 0) return;
  frameCount++;fpsTimer += Math.max(delta, (now - (loop.lastNow || now)) / 1000);loop.lastNow = now;
  if (fpsTimer > 3) {
    fps = frameCount / fpsTimer;frameCount = 0;fpsTimer = 0;
    if (fps < 25 && !qualityAdjusted && state.time > 8) {qualityAdjusted = true;setQuality('balanced');}
  }
  if (!state.paused) {
    state.time += delta;
    state.collisionCooldown = Math.max(0, state.collisionCooldown - delta);state.hornCooldown = Math.max(0, state.hornCooldown - delta);
    if (state.started) {
      const steps = Math.max(1, Math.ceil(delta / (1 / 90)));
      for (let step = 0; step < steps; step++) updateDriving(delta / steps);
      updateMission(delta);
      if (state.toastTimer > 0) {state.toastTimer -= delta;if (state.toastTimer <= 0) element('toast').classList.remove('visible');}
    }
    updateTraffic(delta);updateCamera(delta);updateRain(delta);
    uiTimer += delta;mapTimer += delta;
    if (uiTimer > .12) {uiTimer = 0;updateUI();}
    if (mapTimer > .1 && state.started) {mapTimer = 0;drawMap(element('minimap'));}
  }
  audio.update(vehicle.speed, keys.has('KeyW') || keys.has('ArrowUp') || keys.has('KeyS') || keys.has('ArrowDown'), state.weather === 'rain', state.paused || !state.started, delta, city.traffic.filter(traffic => distance(traffic.state, vehicle) < 35).length);
  renderer.info.autoReset = false;renderer.info.reset();composer.render();
}

async function toggleSound() {
  try {
    if (audio.enabled) audio.disable();else await audio.enable();
    updateSoundLabel();
  } catch { notify('Audio is unavailable in this browser. You can still drive.'); }
}

function updateSoundLabel() {
  element('sound-label').textContent = audio.enabled ? 'ON' : 'OFF';
  element('sound').setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Enable sound');
  element('sound').classList.toggle('sound-on', audio.enabled);
}

function cycleCamera() {
  state.camera = (state.camera + 1) % cameraNames.length;element('camera-button').textContent = `${cameraNames[state.camera]} →`;updateCamera(1, true);
}

function setupControls() {
  window.addEventListener('keydown', event => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (!state.started && (event.code === 'Enter' || event.code === 'Space')) {startShift();return;}
    if (event.code === 'Escape') {
      event.preventDefault();
      if (element('map-dialog').open) toggleMap();else togglePause();return;
    }
    if (event.code === 'KeyP') {togglePause();return;}
    if (event.code === 'KeyM') {toggleMap();return;}
    if (state.paused) return;
    keys.add(event.code);
    if (event.code === 'KeyE') interact();
    if (event.code === 'KeyC') cycleCamera();
    if (event.code === 'KeyR') toggleSound();
    if (event.code === 'KeyX') recover();
    if (event.code === 'KeyH' && state.hornCooldown <= 0) {audio.horn();state.hornCooldown = .7;notify('A friendly heads-up.', 1);}
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => {keys.clear();if (state.started && !state.paused) togglePause(true);});
  document.addEventListener('visibilitychange', () => {if (document.hidden && state.started && !state.paused) togglePause(true);});
  window.addEventListener('resize', resize);
  element('start').addEventListener('click', () => startShift());element('tour').addEventListener('click', () => startShift(true));
  element('accept').addEventListener('click', acceptFare);element('skip').addEventListener('click', () => {if (state.mission === 'offer') {state.fareIndex++;refreshFare();audio.dispatch();}});
  element('pause-button').addEventListener('click', () => togglePause());element('resume').addEventListener('click', () => togglePause(false));
  element('pause-menu').addEventListener('cancel', event => {event.preventDefault();togglePause(false);});
  element('map-dialog').addEventListener('cancel', event => {event.preventDefault();toggleMap();});
  element('map-button').addEventListener('click', toggleMap);element('close-map').addEventListener('click', toggleMap);
  element('recover').addEventListener('click', recover);element('sound').addEventListener('click', toggleSound);
  element('weather').addEventListener('change', event => setWeather(event.target.value));
  element('quality').addEventListener('change', event => {qualityAdjusted = true;setQuality(event.target.value);});
  element('camera-button').addEventListener('click', cycleCamera);element('interaction').addEventListener('click', interact);
  element('end-shift').addEventListener('click', () => {
    saveBest();element('pause-menu').close();state.paused = false;state.started = false;keys.clear();document.body.classList.remove('playing');
    show('welcome');show('welcome-footer');show('scene-caption');show('hud', false);show('pause-button', false);
    element('welcome').querySelector('.intro').innerHTML = `Shift complete. ${state.trips} ${state.trips === 1 ? 'story' : 'stories'} safely home.<br>You earned ${money(state.earnings)}. The next shift is yours.`;
    element('start-label').textContent = 'Start another shift';
    state.earnings = 0;state.trips = 0;state.ratingTotal = 0;state.condition = 100;vehicle.speed = 0;state.fareIndex++;refreshFare();
  });
  for (const button of document.querySelectorAll('[data-key]')) {
    const release = () => {keys.delete(button.dataset.key);button.classList.remove('pressed');};
    button.addEventListener('pointerdown', event => {event.preventDefault();if (state.paused) return;button.setPointerCapture(event.pointerId);keys.add(button.dataset.key);button.classList.add('pressed');});
    button.addEventListener('pointerup', release);button.addEventListener('pointercancel', release);button.addEventListener('lostpointercapture', release);
  }
  element('world').addEventListener('webglcontextlost', event => {event.preventDefault();show('fatal');element('fatal-message').textContent = 'The graphics connection was interrupted. Reload to start a fresh shift.';});
}

function boot() {
  try {
    setupScene();setupControls();frameTime = performance.now();requestAnimationFrame(loop);
    if (import.meta.env.DEV) {
      window.__taxi = {
        state, vehicle, city, audio, scene, get metrics() { return { fps: Math.round(fps), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
        place(position) {Object.assign(vehicle, position, { speed: 0, steering: 0 });animateCar(cab, vehicle, 0);updateCamera(1, true);updateUI();},
        interact, setWeather, findRoute, currentFare, completeFare,
      };
    }
  } catch (error) {
    console.error(error);show('fatal');element('fatal-message').textContent = `This game needs WebGL 2 and a current browser. ${error.message}`;
  }
}

requestAnimationFrame(() => setTimeout(boot, 30));
