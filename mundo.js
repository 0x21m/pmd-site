// The Solvane world. One Three.js scene and one WebGL context, drawn in a canvas that lives inside the page
// window on screen (the hero or the sectors), so every section can stack over the one before it. This module only
// draws a state: motion.js measures the page, animates with GSAP and calls render() on every GSAP tick (one per
// display frame, no cap) while a window is on screen.
// Every import goes through the same +esm URL, so the page holds a single copy of Three.js.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/+esm';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/environments/RoomEnvironment.js/+esm';
import { mergeVertices } from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/utils/BufferGeometryUtils.js/+esm';
import { vertex, fragment } from './nevoa.js';

// Quality drops by resolution, never by frame rate. dpr: canvas pixel ratio cap. refraction: what the glass sees,
// in CSS pixels (soft gradients seen through glass gain nothing from retina resolution). bg: background, per device pixel.
export const LEVELS = [
  { dpr: 2, refraction: 1, bg: .5 },
  { dpr: 1.5, refraction: .75, bg: .5 },
  { dpr: 1, refraction: .5, bg: .35 },
];

// Chosen from a capture sweep (clear, dense, water): thick enough to bend the light behind it, tinted turquoise.
export const GLASS = {
  thickness: 1.3, ior: 1.5, roughness: .04, dispersion: .8,
  attenuationColor: '#7fe0cf', attenuationDistance: 3, envMapIntensity: 1.1, clearcoat: .35,
};

// The Solvane mark is the union of its four outer circles (r 4.5, 6 from the middle); the centre circle lies
// inside that union. So the outline is four arcs, each ±115.5° around its lobe's direction. Spans [-1, 1].
function markShape() {
  const r = 4.5 / 10.5, c = 6 / 10.5;
  const p = c / 2 + Math.sqrt(r * r - c * c / 2) / Math.SQRT2;  // where neighbouring lobes meet, outside
  const half = Math.atan2(p, p - c);
  const shape = new THREE.Shape();
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    shape.absarc(c * Math.cos(a), c * Math.sin(a), r, a - half, a + half, false);
  }
  return shape;
}

// A rounded slab: the bevel's profile is tangent to the faces, so welding the vertices and averaging the normals
// gives one smooth, liquid surface instead of facets.
function markGeometry(fine) {
  let geo = new THREE.ExtrudeGeometry(markShape(), {
    depth: .2, curveSegments: fine ? 24 : 14,
    bevelEnabled: true, bevelThickness: .22, bevelSize: .15, bevelOffset: -.15, bevelSegments: fine ? 10 : 6,
  });
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  geo.center();
  return geo;
}

export async function createWorld(canvas, context, { fine, startLevel, hues }) {
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: fine });
  renderer.setClearColor(0x000000, 0);
  // Neutral tone mapping leaves colours below ~0.8 untouched, so the brand light seen through the glass keeps
  // its hue; the background itself is an sRGB texture, which Three.js never tone maps.
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.z = 10;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, .04).texture;
  room.dispose?.();
  pmrem.dispose();

  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) }, uRegion: { value: 0 },
    uGlow: { value: new THREE.Vector4(0, 0, 1, 1) }, uGlowAlpha: { value: 1 },
    uHalo: { value: new THREE.Vector4(0, 0, 1, 0) }, uHaloBand: { value: new THREE.Vector2(-1e5, 1e5) },
    uSpot: { value: new THREE.Vector2(.25, .7) }, uSpotSize: { value: new THREE.Vector2(.45, .6) }, uSpotColor: { value: new THREE.Vector3(38 / 255, 70 / 255, 200 / 255) },
    uPaper: { value: new THREE.Vector4(1e5, 0, 0, 0) }, uPaperLight: { value: new THREE.Vector2(0, 0) },
  };  // colours in sRGB on purpose (Vector3, not Color): the shader composites in sRGB like CSS
  // The background: a full-screen triangle drawn into a small sRGB target, which becomes scene.background.
  // Three.js draws the background inside the transmission pass too, so the glass refracts it.
  const bgTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, colorSpace: THREE.SRGBColorSpace });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const bgMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false });
  const bgMesh = new THREE.Mesh(tri, bgMaterial);
  bgMesh.frustumCulled = false;
  const bgScene = new THREE.Scene().add(bgMesh);
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.background = bgTarget.texture;

  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, transmission: 1, clearcoatRoughness: .1 });
  const tune = values => {
    Object.assign(GLASS, values);
    const { attenuationColor, ...rest } = GLASS;
    Object.assign(glass, rest);
    glass.attenuationColor.set(attenuationColor);
  };
  tune({});
  const mark = new THREE.Mesh(markGeometry(fine), glass);
  const pivot = new THREE.Group();
  pivot.add(mark);
  scene.add(pivot);

  // Lights without falloff, placed relative to the mark, so its size on screen never changes how lit it looks.
  // Hero: brand teal from above right, brand blue from below left. Integrations: one station per category — a turn
  // of the glass, and one light in that category's colour and place. A single light travels between the stations
  // (colour and position follow the playhead): as many categories as needed, for the cost of one light.
  const light = (color, x, y, z) => Object.assign(new THREE.PointLight(color, 0, 0, 0), { offset: new THREE.Vector3(x, y, z) });
  const key = light(0x7fe0cf, 2.2, 2.2, 3.4), rim = light(0x4a7dff, -2.8, -1.7, 2.3), station = light(0xffffff, 0, 0, 2.3);
  scene.add(key, rim, station);
  // Spread on a spiral (golden angle), so neighbouring stations turn the glass differently, within ±0.85 rad.
  const STATIONS = hues.map((_, k) => new THREE.Quaternion().setFromEuler(new THREE.Euler(.35 * Math.sin(k * 2.4 + .8), .8 * Math.sin(k * 1.9 + 2.2), .15 * Math.sin(k * 3.1))));
  const PLACES = hues.map((_, k) => new THREE.Vector3(2.4 * Math.cos(k * 2.4), 2 * Math.sin(k * 2.4), 2.3));
  const COLOURS = hues.map(h => new THREE.Color(h));
  const turn = new THREE.Quaternion(), sway = new THREE.Quaternion(), euler = new THREE.Euler();

  // The canvas lives inside the window on screen (hero or sectors) and takes its size: the window is the viewport.
  let level = -1, frames = 0, width = 0, height = 0;
  const setLevel = i => {
    level = Math.max(0, Math.min(LEVELS.length - 1, i));
    renderer.setPixelRatio(Math.min(devicePixelRatio, LEVELS[level].dpr));
    renderer.transmissionResolutionScale = LEVELS[level].refraction / renderer.getPixelRatio();
    if (width) renderer.setSize(width, height, false);
  };
  setLevel(startLevel);

  // v: the window and what it shows, in CSS px relative to the window (y down).
  // { region, width, height, clipTop, clipBottom (the rows on screen), halo, haloBand, mark: { x, y, size, rx, ry, rz, hidden },
  //   hero: glow:[x,y,outer,inner], glowAlpha, and the sheet rising over it (or covering it all):
  //   paper: { top, radius, dim, halo, light: [its own light's strength, how far the hero's glow has turned into it] }, sharp (its edge on screen: background at full resolution) —
  //   integrations: station (0…n-1), spot:[x,y], spotSize:[x,y], spotColor:[r,g,b] }
  const render = v => {
    if (v.width !== width || v.height !== height) {
      width = v.width;
      height = v.height;
      renderer.setSize(width, height, false);
    }
    const pr = renderer.getPixelRatio();
    const bg = v.sharp ? 1 : LEVELS[level].bg;
    const bw = Math.max(1, Math.round(v.width * pr * bg));
    const bh = Math.max(1, Math.round(v.height * pr * bg));
    if (bgTarget.width !== bw || bgTarget.height !== bh) bgTarget.setSize(bw, bh);
    uniforms.uRes.value.set(v.width, v.height);
    uniforms.uRegion.value = v.region;
    if (v.glow) uniforms.uGlow.value.set(...v.glow);
    if (v.glowAlpha !== undefined) uniforms.uGlowAlpha.value = v.glowAlpha;
    if (v.spot) uniforms.uSpot.value.set(...v.spot);
    if (v.spotSize) uniforms.uSpotSize.value.set(...v.spotSize);
    if (v.spotColor) uniforms.uSpotColor.value.set(...v.spotColor);
    const sheet = v.paper;
    uniforms.uPaper.value.set(sheet ? sheet.top : 1e5, sheet ? sheet.radius : 0, sheet ? sheet.dim : 0, sheet ? sheet.halo : 0);
    if (sheet) uniforms.uPaperLight.value.set(...sheet.light);
    const m = v.mark;
    uniforms.uHalo.value.set(m.x, m.y, Math.max(1, m.size * .7), m.size > 0 ? v.halo : 0);
    uniforms.uHaloBand.value.set(...(v.haloBand || [-1e5, 1e5]));

    const unit = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / v.height;
    pivot.position.set((m.x - v.width / 2) * unit, (v.height / 2 - m.y) * unit, 0);
    pivot.scale.setScalar(Math.max(1e-4, m.size * unit / 2));
    pivot.visible = !m.hidden;
    sway.setFromEuler(euler.set(m.rx, m.ry, m.rz));
    const hero = v.station === undefined;
    if (hero) mark.quaternion.copy(sway);
    else {
      // Between two stations, the orientation is a slerp driven by the sectors timeline's playhead, with the
      // same sine.inOut ease, so the glass turns with the text, the marker and the light, never on its own clock.
      const i = Math.floor(v.station), j = Math.min(STATIONS.length - 1, i + 1), f = (1 - Math.cos(Math.PI * (v.station - i))) / 2;
      turn.slerpQuaternions(STATIONS[i], STATIONS[j], f);
      mark.quaternion.copy(turn).multiply(sway);
      station.color.lerpColors(COLOURS[i], COLOURS[j], f);
      station.offset.lerpVectors(PLACES[i], PLACES[j], f);
    }
    for (const l of [key, rim, station]) l.position.copy(l.offset).multiplyScalar(pivot.scale.x).add(pivot.position);
    key.intensity = hero ? .65 : .25;
    rim.intensity = hero ? .8 : .2;
    station.intensity = hero ? 0 : 1.8;
    const aspect = v.width / v.height;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    renderer.setRenderTarget(bgTarget);
    renderer.render(bgScene, bgCamera);
    renderer.setRenderTarget(null);
    // The scissor keeps the work to the rows on screen.
    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, height - v.clipBottom, width, v.clipBottom - v.clipTop);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
    frames++;
  };

  // Shaders compile before the first frame is shown, so the crossfade never waits on a stalled frame.
  await renderer.compileAsync(bgScene, bgCamera);
  await renderer.compileAsync(scene, camera);

  return {
    render, setLevel, tune,
    get level() { return level; },
    get frames() { return frames; },
    lose: () => renderer.forceContextLoss(),
    dispose() {
      mark.geometry.dispose();
      glass.dispose();
      tri.dispose();
      bgMaterial.dispose();
      bgTarget.dispose();
      scene.environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
