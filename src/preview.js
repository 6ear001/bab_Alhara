import * as THREE from 'three';
import { QUALITY } from './config.js';
import { buildTextureSet } from './textures.js';
import { World } from './world.js';
import { SkyDome } from './sky.js';
import { Character } from './character.js';
import { CAST, villagerLook } from './story/cast.js';

const sp = new URLSearchParams(location.search);
const q = QUALITY[sp.get('q') || 'medium'];
const hour = parseFloat(sp.get('h') || '16.75');
const shot = sp.get('shot') || 'square';
await Promise.all([document.fonts.load('700 48px "Reem Kufi"')]);
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(q.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = q.shadows;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(sp.get('fov') ? +sp.get('fov') : 55, innerWidth / innerHeight, 0.1, 9000);
const sky = new SkyDome(scene, renderer, q);
const world = new World(scene, buildTextureSet(), q).build();
const chars = [];
if (shot.startsWith('cast')) {
  const ids = ['nadim', 'abuJalal', 'aqeed', 'umHasan', 'peddler', 'hasan', 'grocer'];
  ids.forEach((id, i) => {
    const c = new Character({ id, ...CAST[id].look });
    c.root.position.set(-4.5 + i * 1.5, 0, 7.5); c.root.rotation.y = Math.PI; // يواجهون الكاميرا (−z)
    c.root.rotation.y = Math.PI;
    scene.add(c.root); chars.push(c);
  });
  chars[1].setExpression('worried', true); chars[2].setExpression('angry', true); chars[3].setExpression('sad', true); chars[0].setExpression('smile', true);
  chars[2].setViseme(0.7, 0.3);
  chars[4].setSit(true);
  chars[5].moveSpeed = 1.4;
  chars[6].setTalking(1);
}
const shots = {
  square: [[0, 2.2, 10.5], [0, 1.8, -4]],
  cast: [[-1.5, 1.5, 4.9], [-1.5, 1.0, 7.5]],
  castclose: [[-3.0, 1.62, 6.0], [-3.0, 1.58, 7.5]],
  castclose2: [[-0.6, 1.72, 6.0], [-0.6, 1.64, 7.5]],
  castclose3: [[1.5, 1.5, 6.0], [1.5, 1.5, 7.5]],
};
const [p, l] = shots[shot] || shots.square;
camera.position.set(...p); camera.lookAt(new THREE.Vector3(...l));
sky.update(hour, new THREE.Vector3(0, 0, 6));
for (let i = 0; i < 60; i++) { world.update(0.05, i * 0.05, sky); chars.forEach((c) => c.update(0.05, i * 0.05)); }
renderer.toneMappingExposure = sky.exposure;
sky.followCamera(camera);
renderer.render(scene, camera);
window.__done = true;
window.__info = renderer.info.render;
