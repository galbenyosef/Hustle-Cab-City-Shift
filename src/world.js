import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, GRID, EXTENT, signalPhase } from './simulation.js';
import { createCar } from './vehicle.js';
import { populateStreetLife } from './streetlife.js';
export { createPerson } from './people.js';

const random = seededRandom(1986);
const between = (minimum, maximum) => minimum + random() * (maximum - minimum);
const choose = values => values[Math.floor(random() * values.length)];
const materialCache = new Map();
const material = (color, options = {}) => {
  if (Object.keys(options).length) return new THREE.MeshStandardMaterial({ color, roughness: .85, ...options });
  if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: .85 }));
  return materialCache.get(color);
};
const signCache = new Map();

class StaticBatch {
  constructor(scene) { this.scene = scene; this.groups = new Map(); }
  add(geometry, surface, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(transform);
    if (!this.groups.has(surface)) this.groups.set(surface, []);
    this.groups.get(surface).push(geometry);
  }
  box(surface, size, position, rotation) { this.add(new THREE.BoxGeometry(...size), surface, position, rotation); }
  cylinder(surface, top, bottom, height, position, segments = 10, rotation) { this.add(new THREE.CylinderGeometry(top, bottom, height, segments), surface, position, rotation); }
  finish() {
    for (const [surface, geometries] of this.groups) {
      const combined = mergeGeometries(geometries, false);
      const mesh = new THREE.Mesh(combined, surface);
      mesh.castShadow = surface.userData.castShadow !== false;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      geometries.forEach(geometry => geometry.dispose());
    }
    this.groups.clear();
  }
}

function surfaceTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = kind === 'road' ? '#414949' : '#a49f8f';
  context.fillRect(0, 0, 256, 256);
  for (let fleck = 0; fleck < 18000; fleck++) {
    const lightness = kind === 'road' ? between(45, 95) : between(110, 185);
    context.fillStyle = `rgba(${lightness},${lightness},${lightness},${between(.1, .35)})`;
    context.fillRect(random() * 256, random() * 256, 1.3, 1.3);
  }
  if (kind === 'pavement') {
    context.strokeStyle = '#797e7265';
    context.lineWidth = 2;
    for (let seam = 0; seam <= 256; seam += 64) {
      context.beginPath();context.moveTo(seam, 0);context.lineTo(seam, 256);context.stroke();
      context.beginPath();context.moveTo(0, seam);context.lineTo(256, seam);context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'road' ? 75 : 5, kind === 'road' ? 75 : 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function facadeTexture(brick, windowColor, lit = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;canvas.height = 768;
  const context = canvas.getContext('2d');
  context.fillStyle = brick;context.fillRect(0, 0, 512, 768);
  for (let row = 0; row < 192; row++) {
    for (let column = 0; column < 45; column++) {
      context.fillStyle = `rgba(${random() > .5 ? '230,207,166' : '20,29,24'},${between(.015, .085)})`;
      context.fillRect(column * 12 - (row % 2) * 6, row * 4, 11.5, 3.6);
    }
  }
  for (let floor = 0; floor < 6; floor++) {
    const floorY = floor * 128;
    context.fillStyle = '#ded6c02b';context.fillRect(0, floorY + 117, 512, 3);
    for (let bay = 0; bay < 4; bay++) {
      const windowX = bay * 128 + 29;
      const windowY = floorY + 21;
      const warm = lit || random() > .64;
      context.fillStyle = '#111d23';context.fillRect(windowX - 5, windowY - 5, 79, 85);
      context.fillStyle = '#ada594';context.fillRect(windowX - 3, windowY - 3, 75, 81);
      const gradient = context.createLinearGradient(windowX, windowY, windowX + 65, windowY + 75);
      gradient.addColorStop(0, warm ? '#d6b77d' : windowColor);
      gradient.addColorStop(.45, warm ? '#a3834e' : '#536666');
      gradient.addColorStop(1, warm ? '#796749' : '#253d42');
      context.fillStyle = gradient;context.fillRect(windowX, windowY, 69, 75);
      if (random() > .4) {context.fillStyle = warm ? '#d8ca9d88' : '#78817888';context.fillRect(windowX + 3, windowY, 18, 73);}
      context.fillStyle = '#282e28';context.fillRect(windowX + 33, windowY, 3, 75);context.fillRect(windowX, windowY + 37, 69, 3);
      context.fillStyle = '#c8bfa7';context.fillRect(windowX - 6, windowY + 77, 81, 5);
      context.fillStyle = '#17231d60';context.fillRect(windowX - 6, windowY + 82, 81, 5);
      if (random() > .8) {context.fillStyle = '#8b9285';context.fillRect(windowX + 39, windowY + 64, 34, 18);context.fillStyle = '#3e4b44';for (let vent = 0; vent < 5; vent++) context.fillRect(windowX + 42, windowY + 67 + vent * 2, 27, 1);}
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function leafTexture() {
  const canvas = document.createElement('canvas');canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const foliageRandom = seededRandom(824);
  for (let index = 0; index < 32; index++) {
    const angle = foliageRandom() * Math.PI * 2;
    const radius = Math.sqrt(foliageRandom()) * 46;
    context.save();context.translate(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius);context.rotate(foliageRandom() * Math.PI);
    const gradient = context.createLinearGradient(-12, -7, 12, 7);gradient.addColorStop(0, '#aab59b');gradient.addColorStop(.5, '#d9dfc6');gradient.addColorStop(1, '#9ba989');
    context.fillStyle = gradient;context.beginPath();context.ellipse(0, 0, 12, 7.5, 0, 0, Math.PI * 2);context.fill();
    context.strokeStyle = '#899d7460';context.lineWidth = .5;context.beginPath();context.moveTo(-9, 0);context.lineTo(9, 0);context.stroke();context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = 4;return texture;
}

function shopTexture() {
  const canvas = document.createElement('canvas');canvas.width = 768;canvas.height = 256;
  const context = canvas.getContext('2d');context.fillStyle = '#263d34';context.fillRect(0, 0, 768, 256);
  for (let bay = 0; bay < 3; bay++) {
    const left = bay * 256 + 12;
    const glow = context.createLinearGradient(left, 20, left + 215, 230);glow.addColorStop(0, '#7a7356');glow.addColorStop(.5, '#3f5047');glow.addColorStop(1, '#9b8762');
    context.fillStyle = glow;context.fillRect(left, 25, 230, 205);
    context.fillStyle = '#26342de0';context.fillRect(left + 14, 60, 195, 105);
    for (let shelf = 0; shelf < 3; shelf++) {
      for (let item = 0; item < 15; item++) {
        context.fillStyle = ['#b7a783', '#6c8172', '#956c4e', '#c3ad75', '#b0b2a1'][(item + shelf) % 5];context.fillRect(left + 20 + item * 12, 70 + shelf * 30, 6, 16 + item % 5);
      }
      context.fillStyle = '#ad9162';context.fillRect(left + 15, 93 + shelf * 30, 193, 3);
    }
    context.fillStyle = '#d0b481';context.fillRect(left + 111, 25, 2, 22);
    context.beginPath();context.ellipse(left + 112, 48, 17, 7, 0, 0, Math.PI * 2);context.fill();
    const reflection = context.createLinearGradient(left, 0, left + 230, 256);reflection.addColorStop(0, '#7eaca755');reflection.addColorStop(.45, '#b5c2a022');reflection.addColorStop(.5, '#e1e3c045');reflection.addColorStop(1, '#708d8220');
    context.fillStyle = reflection;context.fillRect(left, 25, 230, 205);
    context.fillStyle = '#23382f';context.fillRect(left + 151, 24, 5, 208);context.fillRect(left, 190, 230, 5);context.fillRect(left, 25, 230, 5);
    context.fillStyle = '#c0a46e';context.fillRect(left + 164, 126, 3, 26);
    context.fillStyle = '#98815a';context.fillRect(left, 232, 230, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = 8;
  return material(0xffffff, { map: texture, emissiveMap: texture, emissive: 0xffdba0, emissiveIntensity: .22, roughness: .4, metalness: .1 });
}

function signTexture(text, background = '#203c32', textColor = '#e9e0c7') {
  const key = `${text}|${background}|${textColor}`;
  if (signCache.has(key)) return signCache.get(key);
  const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 128;
  const context = canvas.getContext('2d');context.fillStyle = background;context.fillRect(0, 0, 512, 128);
  context.strokeStyle = textColor + '55';context.strokeRect(8, 8, 496, 112);
  context.fillStyle = textColor;context.textAlign = 'center';context.textBaseline = 'middle';context.font = '500 39px Georgia';context.fillText(text, 256, 62, 465);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = 4;
  const sign = new THREE.MeshStandardMaterial({ map: texture, roughness: .8, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: .13 });
  signCache.set(key, sign);return sign;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.batch = new StaticBatch(scene);
    this.colliders = [];
    this.traffic = [];
    this.pedestrians = [];
    this.signals = [];
    this.windowMaterials = [];
    this.roadMaterial = material(0xffffff, { map: surfaceTexture('road'), roughness: .88 });
    this.stone = material(0xb8b19c);
    this.pavement = material(0xffffff, { map: surfaceTexture('pavement') });
    this.dark = material(0x263c35, { metalness: .3, roughness: .7 });
    this.iron = material(0x36403a, { metalness: .6, roughness: .6 });
    this.trim = material(0x9e9a86);
    this.roadPaint = material(0xd4cba6);
    this.yellowPaint = material(0xcda453);
    this.wood = material(0x725b3c);
    this.glass = material(0x263d3e, { roughness: .19, metalness: .45 });
    this.shopWindows = shopTexture();
    const foliageTexture = leafTexture();
    this.leaves = [0x416b35, 0x628546, 0x7e984c, 0x3e743d, 0x93a952].map(color => material(color, { map: foliageTexture, alphaTest: .45, side: THREE.DoubleSide, roughness: 1 }));
    this.lampMaterial = material(0xffdfaa, { emissive: 0xffc97b, emissiveIntensity: 2.2 });
    this.facades = [['#80614e', '#536c6b'], ['#9a7860', '#657878'], ['#b2a58d', '#566e70'], ['#73534a', '#607878'], ['#6c7068', '#4c686b'], ['#a5876b', '#546e6b']].map(([brick, windows]) => {
      const texture = facadeTexture(brick, windows);
      const surface = material(0xffffff, { map: texture, emissive: 0xffcf8b, emissiveMap: texture, emissiveIntensity: .045 });
      this.windowMaterials.push(surface);
      return surface;
    });
    this.shopSigns = ['BLEECKER COFFEE', 'SULLIVAN BOOKS', 'THE CORNER DELI', 'FLEUR & STEM', 'VILLAGE RECORDS', 'BAR MERCER', 'LA PICCOLA', 'HARBOR GOODS', 'BLUE NOTE', 'THE WAVERLY', 'HUDSON MARKET', 'STUDIO 28'].map((name, index) => signTexture(name, ['#233e34', '#623e32', '#293c47', '#574d37'][index % 4]));
    this.awnings = [0x3a5949, 0x874d3d, 0xc0ad87, 0x334a53].map(color => material(color));
    this.build();
  }

  build() {
    const { batch } = this;
    batch.box(this.roadMaterial, [440, .2, 440], [0, -.13, 0]);
    const grass = material(0x64724b);
    for (let blockX = -3; blockX < 3; blockX++) {
      for (let blockZ = -3; blockZ < 3; blockZ++) {
        const originX = blockX * GRID;
        const originZ = blockZ * GRID;
        const park = blockX === 0 && blockZ === -2;
        batch.box(this.pavement, [44, .38, 44], [originX + 32, .07, originZ + 32]);
        batch.box(this.stone, [44.3, .18, .22], [originX + 32, .15, originZ + 10]);
        batch.box(this.stone, [44.3, .18, .22], [originX + 32, .15, originZ + 54]);
        batch.box(this.stone, [.22, .18, 44.3], [originX + 10, .15, originZ + 32]);
        batch.box(this.stone, [.22, .18, 44.3], [originX + 54, .15, originZ + 32]);
        if (park) {
          batch.box(grass, [35, .1, 35], [originX + 32, .3, originZ + 32]);
          batch.box(this.stone, [4, .05, 39], [originX + 32, .37, originZ + 32]);
          batch.box(this.stone, [39, .05, 4], [originX + 32, .37, originZ + 32]);
          batch.cylinder(this.stone, 5.6, 6, .7, [originX + 32, .7, originZ + 32], 40);
          batch.cylinder(material(0x738d7e, { metalness: .5, roughness: .15 }), 4.9, 4.9, .05, [originX + 32, 1.07, originZ + 32], 40);
          batch.cylinder(this.stone, .35, .65, 2.7, [originX + 32, 2, originZ + 32], 16);
          batch.cylinder(this.stone, 1.8, .3, .5, [originX + 32, 3.4, originZ + 32], 24);
          for (const treeX of [20, 44]) for (const treeZ of [20, 44]) this.tree(originX + treeX, originZ + treeZ, 1.3);
          this.arch(originX + 32, originZ + 11);
        } else {
          for (let lot = 0; lot < 3; lot++) {
            const centerX = originX + 21 + lot * 11.2;
            for (const side of [0, 1]) {
              const centerZ = originZ + (side ? 44 : 20);
              let height = between(13, 26);
              if (blockZ === 0 && (blockX === 0 || blockX === -1)) height = between(14, 22);
              this.building(centerX, centerZ, 10.7, 12, height, side ? 0 : Math.PI, Math.floor(random() * 6));
            }
          }
          this.building(originX + 20, originZ + 32, 9, 10, between(12, 21), -Math.PI / 2, Math.floor(random() * 6));
          this.building(originX + 45, originZ + 32, 8, 10, between(14, 25), Math.PI / 2, Math.floor(random() * 6));
        }
        for (const side of [0, 1]) {
          const treeX = originX + (side ? 52 : 12);
          this.tree(treeX, originZ + between(23, 38), between(.75, 1.05));
          this.streetLamp(treeX, originZ + 46, side ? Math.PI / 2 : -Math.PI / 2);
          this.bench(originX + 12, originZ + 22, Math.PI / 2);
        }
        this.streetLamp(originX + 29, originZ + 12, Math.PI);
        this.bench(originX + 43, originZ + 52, 0);
        if ((blockX + blockZ) % 2 === 0) this.sidewalkDetails(originX, originZ);
        batch.cylinder(material(0x516055), .31, .27, .85, [originX + 12, .68, originZ + 41], 10);
        batch.cylinder(this.iron, .34, .34, .08, [originX + 12, 1.15, originZ + 41], 10);
        const hydrant = material(0x8a4637);
        batch.cylinder(hydrant, .15, .18, .68, [originX + 51.4, .57, originZ + 16], 10);
        batch.add(new THREE.SphereGeometry(.2, 10, 6), hydrant, [originX + 51.4, .93, originZ + 16]);
        if ((blockX + blockZ) % 2 === 0) this.streetSign(originX + 11, originZ + 11, blockZ);
      }
    }
    this.markRoads();
    for (let roadIndex = -2; roadIndex <= 2; roadIndex++) {
      for (let crossIndex = -2; crossIndex <= 2; crossIndex++) this.trafficLight(roadIndex * GRID, crossIndex * GRID);
    }
    this.skyline();
    batch.finish();
    this.populate();
  }

  building(centerX, centerZ, width, depth, height, facing, variant) {
    const { batch } = this;
    const surface = this.facades[variant];
    height = Math.round((height - 3.5) / 3.2) * 3.2 + 3.5;
    const upper = new THREE.BoxGeometry(width, height - 3.5, depth);
    const coordinates = upper.attributes.uv;
    for (let index = 0; index < coordinates.count; index++) coordinates.setY(index, coordinates.getY(index) * (height - 3.5) / 19.2);
    batch.add(upper, surface, [centerX, (height + 3.5) / 2, centerZ]);
    batch.box(this.trim, [width + .3, .25, depth + .3], [centerX, 3.5, centerZ]);
    batch.box(this.trim, [width + .5, .23, depth + .5], [centerX, height, centerZ]);
    batch.box(this.stone, [width + .75, .18, depth + .75], [centerX, height + .22, centerZ]);
    batch.box(this.trim, [width, .5, depth], [centerX, height + .35, centerZ]);
    batch.box(this.dark, [width - .5, .06, depth - .5], [centerX, height + .63, centerZ]);
    batch.box(this.trim, [1.6, 1, 1.8], [centerX + 2, height + 1.1, centerZ]);
    batch.box(this.iron, [1.35, .08, 1.55], [centerX + 2, height + 1.65, centerZ]);
    if (random() > .62) {
      const tankX = centerX - 2;
      const tankZ = centerZ + 1;
      for (const offsetX of [-.7, .7]) for (const offsetZ of [-.7, .7]) batch.box(this.iron, [.09, 2, .09], [tankX + offsetX, height + 1.5, tankZ + offsetZ]);
      batch.cylinder(this.wood, 1.2, 1.2, 2, [tankX, height + 3.15, tankZ], 14);
      batch.cylinder(this.iron, 0, 1.4, .8, [tankX, height + 4.55, tankZ], 14);
      for (const ringY of [2.4, 3.2, 4]) batch.add(new THREE.TorusGeometry(1.21, .035, 4, 14), this.iron, [tankX, height + ringY, tankZ], [Math.PI / 2, 0, 0]);
    }
    batch.box(this.shopWindows, [width, 3.1, depth], [centerX, 1.9, centerZ]);
    this.colliders.push({ minX: centerX - width / 2, maxX: centerX + width / 2, minZ: centerZ - depth / 2, maxZ: centerZ + depth / 2 });
    const frontWidth = Math.abs(Math.sin(facing)) > .5 ? depth : width;
    const frontDepth = Math.abs(Math.sin(facing)) > .5 ? width : depth;
    const place = (localX, localY, localZ) => [centerX + localX * Math.cos(facing) + localZ * Math.sin(facing), localY, centerZ - localX * Math.sin(facing) + localZ * Math.cos(facing)];
    const facadeZ = frontDepth / 2 + .03;
    for (const bay of [-1, 0, 1]) {
      batch.box(this.shopWindows, [frontWidth / 3 - .4, 2.25, .08], place(bay * frontWidth / 3, 1.55, facadeZ), [0, facing, 0]);
      batch.box(this.trim, [.16, 3.2, .2], place(bay * frontWidth / 3 - frontWidth / 6, 1.9, facadeZ), [0, facing, 0]);
      batch.box(this.wood, [frontWidth / 3 - .5, .14, .3], place(bay * frontWidth / 3, .51, facadeZ + .1), [0, facing, 0]);
    }
    batch.box(this.shopSigns[Math.floor(random() * this.shopSigns.length)], [frontWidth - .4, .65, .16], place(0, 3.02, facadeZ + .08), [0, facing, 0]);
    const awning = choose(this.awnings);
    batch.box(awning, [frontWidth - .3, .13, 1.6], place(0, 2.62, facadeZ + .73), [.14 * Math.cos(facing), facing, 0]);
    batch.box(awning, [frontWidth - .3, .32, .1], place(0, 2.46, facadeZ + 1.49), [0, facing, 0]);
    if (random() > .42) {
      for (let landing = 6; landing < height - 2; landing += 3.65) {
        batch.box(this.iron, [3.3, .08, 1], place(.4, landing, facadeZ + .5), [0, facing, 0]);
        batch.box(this.iron, [3.3, .055, .055], place(.4, landing + .85, facadeZ + .98), [0, facing, 0]);
        for (let rail = -1; rail < 2; rail += .4) batch.box(this.iron, [.035, .85, .035], place(rail + .4, landing + .42, facadeZ + .98), [0, facing, 0]);
        for (const ladderSide of [-.32, .32]) batch.box(this.iron, [.045, 3.66, .07], place(-.55 + ladderSide, landing - 1.8, facadeZ + .8), [0, facing, 0]);
        for (let step = 0; step < 10; step++) batch.box(this.iron, [.7, .035, .07], place(-.55, landing - step * .36, facadeZ + .8), [0, facing, 0]);
      }
    }
  }

  tree(positionX, positionZ, size = 1) {
    const { batch } = this;
    batch.box(this.iron, [1.35, .06, 1.35], [positionX, .32, positionZ]);
    batch.cylinder(this.wood, .1 * size, .2 * size, 3.7 * size, [positionX, 1.95 * size, positionZ], 9);
    for (let branch = 0; branch < 3; branch++) batch.cylinder(this.wood, .035, .09, 1.8 * size, [positionX + Math.cos(branch * 2.1) * .45, 3 * size, positionZ + Math.sin(branch * 2.1) * .45], 6, [Math.sin(branch * 2.1) * .5, 0, Math.cos(branch * 2.1) * .5]);
    for (let cluster = 0; cluster < 280; cluster++) {
      const angle = random() * Math.PI * 2;
      const elevation = Math.acos(between(-1, 1));
      const radius = Math.cbrt(random()) * 2.05 * size;
      const leafSize = between(.65, 1.1) * size;
      batch.add(new THREE.PlaneGeometry(leafSize, leafSize), choose(this.leaves), [positionX + Math.cos(angle) * Math.sin(elevation) * radius, 4.8 * size + Math.cos(elevation) * radius * 1.16, positionZ + Math.sin(angle) * Math.sin(elevation) * radius], [between(-Math.PI, Math.PI), angle, between(-Math.PI, Math.PI)]);
    }
  }

  bench(positionX, positionZ, rotation) {
    const { batch } = this;
    for (let plank = 0; plank < 4; plank++) batch.box(this.wood, [1.9, .065, .13], [positionX, .77, positionZ + plank * .14], [0, rotation, 0]);
    for (const side of [-.73, .73]) batch.box(this.iron, [.065, .6, .45], [positionX + side, .51, positionZ + .2], [0, rotation, 0]);
    batch.box(this.wood, [1.9, .36, .07], [positionX, 1.09, positionZ + .5], [0, rotation, 0]);
  }

  streetLamp(positionX, positionZ, rotation) {
    const { batch } = this;
    batch.cylinder(this.iron, .075, .14, 6.5, [positionX, 3.45, positionZ], 10);
    batch.cylinder(this.iron, .23, .3, .35, [positionX, .46, positionZ], 10);
    batch.box(this.iron, [.1, .1, 1.5], [positionX + Math.sin(rotation) * .7, 6.64, positionZ + Math.cos(rotation) * .7], [0, rotation, 0]);
    batch.box(this.iron, [.45, .16, .78], [positionX + Math.sin(rotation) * 1.4, 6.56, positionZ + Math.cos(rotation) * 1.4], [0, rotation, 0]);
    batch.box(this.lampMaterial, [.35, .04, .66], [positionX + Math.sin(rotation) * 1.4, 6.46, positionZ + Math.cos(rotation) * 1.4], [0, rotation, 0]);
  }

  sidewalkDetails(originX, originZ) {
    const { batch } = this;
    const terracotta = material(0xb87853);
    const umbrella = choose(this.awnings);
    const tableX = originX + 34;
    const tableZ = originZ + 12.5;
    batch.cylinder(this.wood, .72, .72, .08, [tableX, 1, tableZ], 18);
    batch.cylinder(this.iron, .05, .07, .72, [tableX, .64, tableZ], 8);
    batch.cylinder(this.iron, .06, .065, 2.7, [tableX, 1.6, tableZ], 8);
    batch.cylinder(umbrella, .12, 1.25, .43, [tableX, 2.98, tableZ], 12);
    for (const side of [-1, 1]) {
      batch.cylinder(this.wood, .26, .26, .065, [tableX + side * .94, .69, tableZ], 12);
      for (const leg of [-1, 1]) batch.box(this.iron, [.04, .43, .04], [tableX + side * .94 + leg * .17, .45, tableZ]);
      batch.box(this.wood, [.48, .3, .04], [tableX + side * .94, .98, tableZ + .24]);
      batch.cylinder(terracotta, .36, .25, .62, [originX + 14, .58, originZ + 43 + side * 3], 14);
      for (let bloom = 0; bloom < 8; bloom++) {
        const flowerX = originX + 14 + Math.cos(bloom * 2.4) * .24;
        const flowerZ = originZ + 43 + side * 3 + Math.sin(bloom * 2.4) * .24;
        batch.cylinder(this.wood, .012, .012, .37, [flowerX, 1, flowerZ], 5);
        batch.add(new THREE.SphereGeometry(.09, 7, 5), material(choose([0xeebd46, 0xd37991, 0xe49c7c])), [flowerX, 1.19, flowerZ]);
      }
    }
    batch.cylinder(material(0xf2e8ce), .065, .047, .16, [tableX + .23, 1.12, tableZ], 10);
    const boxX = originX + 50.7;
    const boxZ = originZ + 46;
    batch.box(material(0x416884), [.55, .94, .48], [boxX, .76, boxZ]);
    batch.box(signTexture('THE VILLAGE', '#e6e0cd', '#284453'), [.46, .35, .025], [boxX, .85, boxZ + .253]);
    batch.box(this.iron, [.42, .06, .05], [boxX, 1.14, boxZ + .27]);
    const bikeX = originX + 12;
    const bikeZ = originZ + 33;
    for (const offset of [-.57, .57]) batch.add(new THREE.TorusGeometry(.34, .024, 5, 18), this.iron, [bikeX, .63, bikeZ + offset], [0, Math.PI / 2, 0]);
    const bikePaint = material(choose([0x4797a3, 0xa24e42, 0xcdad51]));
    for (const angle of [-.65, .65]) batch.box(bikePaint, [.045, .7, .045], [bikeX, .87, bikeZ], [angle, 0, 0]);
    batch.box(bikePaint, [.045, .045, .75], [bikeX, 1.09, bikeZ]);
    batch.box(this.iron, [.25, .05, .2], [bikeX, 1.21, bikeZ + .2]);
    batch.box(this.iron, [.39, .04, .04], [bikeX, 1.26, bikeZ - .5]);
  }

  streetSign(positionX, positionZ, blockZ) {
    this.batch.cylinder(this.iron, .045, .045, 3.5, [positionX, 1.99, positionZ], 8);
    this.batch.box(signTexture(['CANAL ST', 'PRINCE ST', 'BLEECKER ST', 'W 4 ST', 'WAVERLY PL', 'W 8 ST'][blockZ + 3], '#294936'), [2.6, .36, .07], [positionX, 3.55, positionZ]);
  }

  arch(positionX, positionZ) {
    for (const side of [-1, 1]) {
      this.batch.box(this.stone, [1.8, 8, 2.2], [positionX + side * 3.5, 4.3, positionZ]);
      this.batch.box(this.trim, [2.1, .4, 2.5], [positionX + side * 3.5, .5, positionZ]);
    }
    this.batch.box(this.stone, [9, 1.8, 2.4], [positionX, 8.1, positionZ]);
    this.batch.box(this.trim, [9.4, .3, 2.7], [positionX, 9.15, positionZ]);
    const archGeometry = new THREE.TorusGeometry(2.6, .8, 8, 24, Math.PI);
    this.batch.add(archGeometry, this.stone, [positionX, 5.4, positionZ], [0, 0, 0], [1, 1, 1.35]);
    this.colliders.push({ minX: positionX - 4.5, maxX: positionX - 2.5, minZ: positionZ - 1.2, maxZ: positionZ + 1.2 }, { minX: positionX + 2.5, maxX: positionX + 4.5, minZ: positionZ - 1.2, maxZ: positionZ + 1.2 });
  }

  markRoads() {
    const { batch } = this;
    for (let avenue = -3; avenue <= 3; avenue++) {
      const road = avenue * GRID;
      for (let segment = -3; segment < 3; segment++) {
        const base = segment * GRID;
        for (const offset of [-.16, .16]) {
          batch.box(this.yellowPaint, [.07, .015, 40], [road + offset, .003, base + 32]);
          batch.box(this.yellowPaint, [40, .015, .07], [base + 32, .003, road + offset]);
        }
        for (let dash = 16; dash < 51; dash += 8) for (const side of [-1, 1]) {
          batch.box(this.roadPaint, [.09, .015, 3.3], [road + side * 6.8, .006, base + dash]);
          batch.box(this.roadPaint, [3.3, .015, .09], [base + dash, .006, road + side * 6.8]);
        }
        for (let stripe = -7.5; stripe < 8; stripe += 2) for (const crosswalk of [12, 52]) {
          batch.box(this.roadPaint, [.85, .015, 2.6], [road + stripe, .009, base + crosswalk]);
          batch.box(this.roadPaint, [2.6, .015, .85], [base + crosswalk, .009, road + stripe]);
        }
      }
    }
    const manhole = material(0x313d39, { metalness: .5 });
    for (let index = 0; index < 55; index++) {
      const road = Math.floor(between(-2, 3)) * GRID;
      batch.cylinder(manhole, .52, .52, .025, [road + 2, .017, between(-180, 180)], 16);
    }
  }

  trafficLight(positionX, positionZ) {
    for (const axis of ['x', 'z']) {
      const poleX = positionX + (axis === 'z' ? 9 : -10);
      const poleZ = positionZ + (axis === 'z' ? 10 : 9);
      this.batch.cylinder(this.iron, .075, .1, 5.4, [poleX, 2.9, poleZ], 8);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.15, .4), material(0x9a803c));
      housing.position.set(poleX, 5.4, poleZ);this.scene.add(housing);
      const bulbs = [];
      for (let index = 0; index < 3; index++) {
        const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0x142921, emissive: [0xf34223, 0xffbb30, 0x66d7a0][index], emissiveIntensity: .03 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), bulbMaterial);
        bulb.position.set(poleX + (axis === 'x' ? .23 : 0), 5.73 - index * .33, poleZ + (axis === 'z' ? .23 : 0));
        this.scene.add(bulb);bulbs.push(bulbMaterial);
      }
      this.signals.push({ axis, bulbs });
    }
  }

  skyline() {
    const { batch } = this;
    const skylineMaterials = [0x7d8980, 0x8b9387, 0x768580, 0x9a9f8e].map(color => material(color));
    for (let index = 0; index < 100; index++) {
      const angle = index / 100 * Math.PI * 2;
      const radius = between(315, 490);
      const positionX = Math.cos(angle) * radius;
      const positionZ = Math.sin(angle) * radius;
      const height = between(30, 110);
      const width = between(13, 28);
      const surface = choose(skylineMaterials);
      batch.box(surface, [width, height, width], [positionX, height / 2 - 3, positionZ]);
      if (random() > .5) {
        batch.box(surface, [width * .7, height * .18, width * .7], [positionX, height * 1.04, positionZ]);
        batch.cylinder(this.iron, .15, .4, 10, [positionX, height * 1.18, positionZ], 6);
      }
    }
    const water = material(0x738e88, { roughness: .22, metalness: .65 });
    batch.box(water, [120, .2, 750], [-284, -.7, 0]);
    for (const edge of [-1, 1]) {
      batch.box(this.stone, [440, .9, 1.5], [0, .25, edge * 208]);
      batch.box(this.stone, [1.5, .9, 440], [edge * 208, .25, 0]);
    }
  }

  populate() {
    populateStreetLife(this);
  }

  updateSignals(time) {
    for (const signal of this.signals) {
      const phase = signalPhase(time, signal.axis);
      signal.bulbs.forEach((bulb, index) => { bulb.emissiveIntensity = ['red', 'amber', 'green'][index] === phase ? 2.7 : .03; });
    }
  }
}
