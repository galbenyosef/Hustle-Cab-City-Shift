import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rubber = new THREE.MeshStandardMaterial({ color: 0x181d1c, roughness: .93 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xb0b9b7, metalness: .88, roughness: .22 });
const dark = new THREE.MeshStandardMaterial({ color: 0x182b2c, roughness: .35, metalness: .35 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x29434b, metalness: .2, roughness: .3, clearcoat: .3, envMapIntensity: .35 });
const light = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffdda0, emissiveIntensity: 2 });
const rimGeometry = new THREE.CylinderGeometry(.235, .235, .16, 16);
const tireGeometry = new THREE.CylinderGeometry(.365, .365, .25, 20);

function mesh(geometry, material, position, parent) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function rounded(parent, material, size, position, radius = .06) {
  return mesh(new RoundedBoxGeometry(...size, 2, radius), material, position, parent);
}

function cabinGeometry(variant) {
  const roofRear = variant === 'wagon' ? 1.35 : .71;
  const rear = variant === 'wagon' ? 1.85 : 1.32;
  const vertices = new Float32Array([
    -.89, .99, -1.3, .89, .99, -1.3, -.71, 1.73, -.63, .71, 1.73, -.63,
    -.72, 1.73, roofRear, .72, 1.73, roofRear, -.9, .99, rear, .9, .99, rear,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 2, 1, 2, 3, 1, 2, 4, 3, 4, 5, 3, 4, 6, 5, 6, 7, 5, 0, 6, 4, 0, 4, 2, 1, 3, 5, 1, 5, 7, 0, 1, 7, 0, 7, 6]);
  geometry.computeVertexNormals();
  return geometry;
}

function bodyGeometry() {
  const outline = new THREE.Shape();
  outline.moveTo(-2.25, .45);outline.lineTo(-1.88, .45);
  outline.absarc(-1.43, .43, .45, Math.PI, 0, true);
  outline.lineTo(.98, .43);outline.absarc(1.43, .43, .45, Math.PI, 0, true);
  outline.lineTo(2.25, .45);outline.quadraticCurveTo(2.33, .48, 2.3, .65);
  outline.lineTo(2.23, .92);outline.quadraticCurveTo(2.1, 1.04, 1.75, 1.04);
  outline.lineTo(-1.9, 1.04);outline.quadraticCurveTo(-2.31, 1.02, -2.3, .82);
  outline.lineTo(-2.3, .55);outline.quadraticCurveTo(-2.3, .45, -2.25, .45);
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 1.78, bevelEnabled: true, bevelThickness: .045, bevelSize: .035, bevelSegments: 3, steps: 1, curveSegments: 12 });
  geometry.translate(0, 0, -.89);geometry.rotateY(Math.PI / 2);return geometry;
}

function labelTexture(text, background = '#edba45', foreground = '#1d2b25', width = 512, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = foreground;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `bold ${height * .53}px Arial`;
  context.fillText(text, width / 2, height / 2, width * .91);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCar(color = 0xf2b82e, taxi = false, variant = 'sedan') {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: .38, roughness: .27, clearcoat: 1, clearcoatRoughness: .2 });
  mesh(bodyGeometry(), paint, [0, 0, 0], body);
  rounded(body, paint, [1.83, .2, 1.35], [0, 1.04, -1.58], .1);
  rounded(body, paint, [1.84, .16, 1.04], [0, 1.02, 1.72], .07);
  mesh(cabinGeometry(variant), glass, [0, 0, 0], body);
  rounded(body, paint, [1.49, .1, variant === 'wagon' ? 2.04 : 1.45], [0, 1.75, variant === 'wagon' ? .35 : .045], .06);
  for (const side of [-1, 1]) {
    const pillar = rounded(body, paint, [.055, .91, .065], [side * .8, 1.39, -.97], .015);
    pillar.rotation.x = .71;
    const rearPillar = rounded(body, paint, [.065, .89, .08], [side * .81, 1.38, variant === 'wagon' ? 1.6 : 1], .015);
    rearPillar.rotation.x = -.69;
    rounded(body, dark, [.055, .69, .1], [side * .8, 1.39, .13], .01);
    rounded(body, chrome, [.025, .032, 2.9], [side * .973, .83, .13], .008);
    rounded(body, dark, [.025, .05, 3.5], [side * .967, .55, 0], .01);
    for (const doorZ of [-.45, .71]) rounded(body, chrome, [.04, .055, .2], [side * .966, 1, doorZ], .02);
    rounded(body, paint, [.24, .16, .31], [side * 1.025, 1.19, -.91], .06);
    rounded(body, dark, [.012, .115, 1.8], [side * .964, .77, .05], .008);
    if (taxi) {
      const doorLabel = new THREE.MeshBasicMaterial({ map: labelTexture('NYC  Ⓣ  TAXI'), side: THREE.DoubleSide });
      const decal = mesh(new THREE.PlaneGeometry(1.25, .32), doorLabel, [side * .97, .89, .05], body);
      decal.rotation.y = side * Math.PI / 2;
    }
  }
  rounded(body, chrome, [1.77, .13, .13], [0, .53, -2.28], .04);
  rounded(body, chrome, [1.78, .12, .13], [0, .55, 2.28], .04);
  rounded(body, dark, [.82, .23, .055], [0, .8, -2.302], .02);
  for (let index = -3; index <= 3; index++) rounded(body, chrome, [.027, .18, .035], [index * .105, .8, -2.338], .008);
  const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x9d251c, emissive: 0xff2a12, emissiveIntensity: .6 });
  const reverseMaterial = new THREE.MeshStandardMaterial({ color: 0xe3e7de, emissive: 0xffffff, emissiveIntensity: 0 });
  for (const side of [-1, 1]) {
    rounded(body, light, [.45, .19, .065], [side * .655, .89, -2.26], .045);
    rounded(body, brakeMaterial, [.46, .19, .08], [side * .65, .89, 2.27], .04);
    rounded(body, reverseMaterial, [.13, .1, .025], [side * .5, .88, 2.322], .015);
    rounded(body, light, [.12, .09, .07], [side * .7, .52, -2.32], .02);
  }
  const plateMaterial = new THREE.MeshBasicMaterial({ map: labelTexture('NYC · 0428', '#dcb855', '#202e28', 256, 80) });
  const plate = mesh(new THREE.PlaneGeometry(.44, .14), plateMaterial, [0, .7, 2.352], body);
  plate.rotation.y = 0;
  if (taxi) {
    rounded(body, dark, [.84, .07, .4], [0, 1.85, 0], .03);
    const signMaterial = new THREE.MeshStandardMaterial({ color: 0xffd779, emissive: 0xffcb5d, emissiveIntensity: .5, map: labelTexture('TAXI', '#ffe2a0') });
    rounded(body, signMaterial, [.73, .27, .24], [0, 2, 0], .04);
  }
  const wheels = [];
  for (const side of [-1, 1]) {
    for (const wheelZ of [-1.43, 1.43]) {
      const holder = new THREE.Group();
      holder.position.set(side * .92, .4, wheelZ);
      root.add(holder);
      const wheel = new THREE.Group();
      holder.add(wheel);
      const tire = mesh(tireGeometry, rubber, [0, 0, 0], wheel);
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(rimGeometry, chrome, [side * .07, 0, 0], wheel);
      rim.rotation.z = Math.PI / 2;
      const hub = mesh(new THREE.CylinderGeometry(.11, .11, .18, 12), dark, [side * .09, 0, 0], wheel);
      hub.rotation.z = Math.PI / 2;
      for (let spoke = 0; spoke < 5; spoke++) {
        const spokeMesh = mesh(new THREE.BoxGeometry(.025, .39, .042), chrome, [side * .17, 0, 0], wheel);
        spokeMesh.rotation.x = spoke * Math.PI / 5;
      }
      wheels.push({ holder, wheel, front: wheelZ < 0 });
    }
  }
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(32, 32, 5, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 64, 64);
  const shadow = mesh(new THREE.PlaneGeometry(3.8, 6.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }), [0, .035, 0], root);
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  if (!taxi) {
    root.updateMatrixWorld(true);
    const buckets = new Map();
    const originals = [];
    root.traverse(object => {
      if (!object.isMesh || object === shadow) return;
      const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
      if (!buckets.has(object.material)) buckets.set(object.material, []);
      buckets.get(object.material).push(geometry);originals.push(object);
    });
    originals.forEach(object => object.removeFromParent());
    for (const [surface, geometries] of buckets) {
      const combined = new THREE.Mesh(mergeGeometries(geometries), surface);
      combined.castShadow = true;combined.receiveShadow = true;body.add(combined);
      geometries.forEach(geometry => geometry.dispose());
    }
    wheels.length = 0;
  }
  if (variant === 'compact') root.scale.set(.94, .98, .88);
  root.userData = { body, wheels, brakeMaterial, reverseMaterial };
  return root;
}

export function animateCar(car, state, delta) {
  car.position.set(state.x, 0, state.z);
  car.rotation.y = state.heading;
  const { body, wheels, brakeMaterial, reverseMaterial } = car.userData;
  body.rotation.x = THREE.MathUtils.damp(body.rotation.x, Math.max(-.035, Math.min(.035, state.acceleration * .003)), 5, delta);
  body.rotation.z = THREE.MathUtils.damp(body.rotation.z, -state.steering * state.speed * .008, 5, delta);
  body.position.y = Math.sin(state.distance * 1.8) * Math.min(.008, Math.abs(state.speed) * .0006);
  brakeMaterial.emissiveIntensity = state.braking ? 3 : .6;
  reverseMaterial.emissiveIntensity = state.speed < -.1 ? 2 : 0;
  for (const wheel of wheels) {
    wheel.wheel.rotation.x -= state.speed * delta / .365;
    if (wheel.front) wheel.holder.rotation.y = state.steering;
  }
}
