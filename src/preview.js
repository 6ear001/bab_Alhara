import * as THREE from 'three';
import { QUALITY } from './config.js';
import { buildTextureSet } from './textures.js';
import { World } from './world.js';
import { SkyDome } from './sky.js';

const q = QUALITY[new URLSearchParams(location.search).get('q') || 'medium'];
const hour = parseFloat(new URLSearchParams(location.search).get('h') || '16.75');
const shot = new URLSearchParams(location.search).get('shot') || 'square';
await Promise.all([document.fonts.load('700 48px "Reem Kufi"')]);
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(q.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 9000);
const sky = new SkyDome(scene, renderer, q);
const world = new World(scene, buildTextureSet(), q).build();
const shots = {
  square: [[0, 2.2, 10.5], [0, 1.8, -4]],
  cafe: [[-1, 1.7, -2], [-2, 1.5, -12]],
  gate: [[2, 1.7, 3], [0, 3.5, 14]],
  alley: [[-15, 1.8, -3.6], [-30, 2.4, -4]],
  shop: [[8, 1.8, 0], [18, 1.5, -0.5]],
  fountain: [[5, 2.5, 8], [0, 1.0, 2]],
  high: [[10, 20, 22], [0, 0, 0]],
};
const [p, l] = shots[shot];
camera.position.set(...p); camera.lookAt(new THREE.Vector3(...l));
sky.update(hour, new THREE.Vector3(0, 0, 0));
world.update(0.016, 0, sky);
for (let i = 0; i < 200; i++) world.update(0.05, i * 0.05, sky);
renderer.toneMappingExposure = sky.exposure;
sky.followCamera(camera);
renderer.render(scene, camera);
window.__done = true;
window.__info = renderer.info.render;
