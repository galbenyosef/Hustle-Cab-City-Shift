import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, clamp } from './simulation.js';

const random = seededRandom(1978);
const skinMaterials = [0xe0b394, 0xb98463, 0x795138, 0xd2a77c, 0x9d6950].map(color => new THREE.MeshStandardMaterial({ color, roughness: .85 }));
const hairMaterials = [0x30271f, 0x604027, 0x252724, 0x9b7848].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
const shoes = new THREE.MeshStandardMaterial({ color: 0xe6e4da, roughness: .8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x203448, roughness: .85 });
const characterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
const select = values => values[Math.floor(random() * values.length)];

export function createPerson(shirtColor = 0xb58055) {
  const person = new THREE.Group();
  const body = new THREE.Bone();person.add(body);
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: .92 });
  const trousers = new THREE.MeshStandardMaterial({ color: select([0x34465b, 0x515753, 0x846e58, 0x253b54]), roughness: .95 });
  const skin = select(skinMaterials);
  const hair = select(hairMaterials);
  const part = (parent, geometry, surface, position) => {
    const mesh = new THREE.Mesh(geometry, surface);mesh.position.set(...position);mesh.castShadow = true;mesh.receiveShadow = true;parent.add(mesh);return mesh;
  };
  const torso = part(body, new THREE.CapsuleGeometry(.185, .31, 5, 10), shirt, [0, 1.2, 0]);torso.scale.set(1.06, 1, .7);
  part(body, new THREE.CylinderGeometry(.067, .078, .13, 8), skin, [0, 1.5, 0]);
  const head = part(body, new THREE.SphereGeometry(.147, 12, 10), skin, [0, 1.67, -.01]);head.scale.set(.9, 1.15, .96);
  const cap = part(body, new THREE.SphereGeometry(.151, 12, 8, 0, Math.PI * 2, 0, 1.85), hair, [0, 1.72, .006]);cap.scale.set(.93, 1, 1);
  part(body, new THREE.SphereGeometry(.034, 7, 5), skin, [0, 1.65, -.143]);
  for (const side of [-1, 1]) {
    part(body, new THREE.SphereGeometry(.025, 7, 5), skin, [side * .133, 1.66, 0]);
    part(body, new THREE.SphereGeometry(.012, 6, 4), dark, [side * .055, 1.7, -.132]);
  }
  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Bone();hip.position.set(side * .102, .84, 0);body.add(hip);
    part(hip, new THREE.CapsuleGeometry(.082, .25, 4, 8), trousers, [0, -.19, 0]);
    const knee = new THREE.Bone();knee.position.y = -.39;hip.add(knee);
    part(knee, new THREE.CapsuleGeometry(.067, .27, 4, 8), trousers, [0, -.18, 0]);
    const ankle = new THREE.Bone();ankle.position.set(0, -.37, 0);knee.add(ankle);
    const shoe = part(ankle, new THREE.CapsuleGeometry(.065, .13, 3, 8), shoes, [0, -.035, -.055]);shoe.rotation.x = Math.PI / 2;
    legs.push({ hip, knee, ankle });
    const shoulder = new THREE.Bone();shoulder.position.set(side * .222, 1.41, 0);shoulder.rotation.z = side * .08;body.add(shoulder);
    part(shoulder, new THREE.CapsuleGeometry(.067, .16, 3, 8), shirt, [side * .005, -.13, 0]);
    const elbow = new THREE.Bone();elbow.position.y = -.28;shoulder.add(elbow);
    part(elbow, new THREE.CapsuleGeometry(.048, .16, 3, 8), skin, [0, -.12, 0]);
    const hand = part(elbow, new THREE.SphereGeometry(.056, 8, 6), skin, [0, -.26, 0]);hand.scale.y = 1.2;
    arms.push({ shoulder, elbow });
  }
  const accessory = random();
  if (accessory > .65) {
    const backpack = part(body, new THREE.BoxGeometry(.28, .34, .13), dark, [0, 1.24, .19]);backpack.rotation.x = .1;
    for (const side of [-1, 1]) part(body, new THREE.BoxGeometry(.036, .36, .035), dark, [side * .12, 1.27, -.135]);
  } else if (accessory > .35) {
    const bag = part(arms[1].elbow, new THREE.BoxGeometry(.2, .23, .09), new THREE.MeshStandardMaterial({ color: 0xc8ac79 }), [0, -.36, 0]);bag.rotation.z = -.05;
  }
  person.scale.setScalar(.94 + random() * .13);
  person.userData = { body, legs, arms, gait: random() * Math.PI * 2, blend: 0 };
  bindCharacter(person);
  return person;
}

function bindCharacter(person) {
  person.updateMatrixWorld(true);
  const bones = [];
  const meshes = [];
  person.traverse(object => {if (object.isBone) bones.push(object);if (object.isMesh) meshes.push(object);});
  const inverse = person.matrixWorld.clone().invert();
  const geometries = meshes.map(mesh => {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const indices = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    const boneIndex = bones.indexOf(mesh.parent);
    for (let vertex = 0; vertex < count; vertex++) {
      mesh.material.color.toArray(colors, vertex * 3);indices[vertex * 4] = boneIndex;weights[vertex * 4] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    return geometry;
  });
  const combined = mergeGeometries(geometries);
  meshes.forEach(mesh => {mesh.removeFromParent();mesh.geometry.dispose();});
  geometries.forEach(geometry => geometry.dispose());
  const skin = new THREE.SkinnedMesh(combined, characterMaterial);
  skin.castShadow = true;skin.receiveShadow = true;person.add(skin);
  person.updateMatrixWorld(true);skin.bind(new THREE.Skeleton(bones));
  person.userData.skin = skin;
}

export function animatePerson(person, speed, delta, wave = false) {
  const { body, legs, arms } = person.userData;
  const moving = Math.abs(speed);
  person.userData.gait += moving * delta * Math.PI * 2 / 1.35;
  person.userData.blend = THREE.MathUtils.damp(person.userData.blend, clamp(moving / .9, 0, 1), 9, delta);
  const phase = person.userData.gait;
  const blend = person.userData.blend;
  body.position.y = Math.abs(Math.sin(phase)) * .018 * blend;
  body.rotation.y = Math.sin(phase) * .035 * blend;
  body.rotation.z = Math.cos(phase) * .018 * blend;
  legs.forEach((leg, index) => {
    const stride = phase + index * Math.PI;
    const footZ = Math.cos(stride) * .21 * blend;
    const footY = -.735 + Math.max(0, Math.sin(stride)) * .13 * blend - body.position.y;
    const reach = Math.min(.759, Math.hypot(footZ, footY));
    const kneeAngle = Math.acos(clamp((reach * reach - .39 ** 2 - .37 ** 2) / (2 * .39 * .37), -1, 1));
    const hipOffset = Math.acos(clamp((.39 ** 2 + reach * reach - .37 ** 2) / (2 * .39 * reach), -1, 1));
    leg.hip.rotation.x = Math.atan2(-footZ, -footY) + hipOffset;
    leg.knee.rotation.x = -kneeAngle;
    leg.ankle.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
    arms[index].shoulder.rotation.x = -Math.sin(stride) * .34 * blend;
    arms[index].elbow.rotation.x = -.13 - Math.max(0, Math.sin(stride)) * .18 * blend;
  });
  arms[0].shoulder.rotation.z = THREE.MathUtils.damp(arms[0].shoulder.rotation.z, wave ? -2.2 : -.08, 6, delta);
  if (wave) arms[0].elbow.rotation.x = -.4 + Math.sin(performance.now() * .004) * .18;
}
