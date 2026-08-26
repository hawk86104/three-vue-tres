import * as THREE from "three/webgpu";
import {
  bakeSkyEnvironment,
  CausticsPass,
  createSandMaterial,
  createSkyDome,
  createSunLight,
  Rng,
  runFftSelfTest,
  SKY_ENVIRONMENT_INTENSITY,
  SubmergedOcean,
  UnderwaterMediumPipeline,
} from "./underwater-snell-ocean.ts";
import { gradeParams } from "./source/grade.ts";

const SEABED_Y = -26;
const CAMERA_MIN_Y = SEABED_Y + 1.25;
const CAMERA_MAX_Y = -3.5;
const SAUCER_EXTENT = 2800;
const SAUCER_SEGMENTS = 224;
const SAUCER_RISE_START = 680;
const SAUCER_RISE_END = 1150;
const TOWER_Z = -34;

function hash2(x, y, seed) {
  let value =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed | 0, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function smoothCurve(value) {
  return value * value * (3 - 2 * value);
}

function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smoothCurve(xf);
  const v = smoothCurve(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x, y, octaves = 5, seed = 0) {
  let value = 0;
  let amplitude = 0.5;
  let fx = x;
  let fy = y;
  for (let index = 0; index < octaves; index += 1) {
    value += valueNoise2(fx, fy, seed + index * 101) * amplitude;
    const rotatedX = fx * 0.8 - fy * 0.6;
    const rotatedY = fx * 0.6 + fy * 0.8;
    fx = rotatedX * 2.03;
    fy = rotatedY * 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function smoothstepNumber(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The far rim: terrain fills the water column geometrically, which is what
 * closes the seabed/ocean horizon gap. A view-aligned scattering slab cannot
 * do it — see the note in the medium.
 */
function saucerHeight(x, z) {
  const blend = smoothstepNumber(
    SAUCER_RISE_START,
    SAUCER_RISE_END,
    Math.hypot(x, z),
  );
  const rimTop = -3.6 + (fbm2(x * 0.006, z * 0.006, 3, 131) - 0.5) * 2.2;
  return THREE.MathUtils.lerp(SEABED_Y, rimTop, blend);
}

function createSaucerSeabedGeometry() {
  const geometry = new THREE.PlaneGeometry(
    SAUCER_EXTENT,
    SAUCER_EXTENT,
    SAUCER_SEGMENTS,
    SAUCER_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(
      index,
      saucerHeight(positions.getX(index), positions.getZ(index)),
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterial(color, roughness, metalness, medium = null) {
  const material = new THREE.MeshStandardNodeMaterial();
  material.color.set(color);
  material.roughness = roughness;
  material.metalness = metalness;
  if (medium) medium.applyCaustics(material, 1.2);
  return material;
}

function createStrut(material, start, end, radius, radialSegments = 12) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    length,
    radialSegments,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A deliberately simplified structure that crosses the waterline: seabed-rooted
 * piles with underwater bracing, a deck, and an above-water headframe. Its
 * air-side geometry is what the Snell window has to transport.
 */
function createWaterlineTower(medium) {
  const group = new THREE.Group();
  const underwaterBronze = createMaterial(0x376f70, 0.54, 0.72, medium);
  const bronze = createMaterial(0x7b5b2d, 0.36, 0.82);
  const iron = createMaterial(0x283640, 0.48, 0.72);
  const timber = createMaterial(0x6e4a2a, 0.78, 0.04);
  const canvas = createMaterial(0x86b0aa, 0.9, 0);
  canvas.side = THREE.DoubleSide;
  const materials = [underwaterBronze, bronze, iron, timber, canvas];
  const airSide = [];

  const pileRadius = 5.5;
  const pileCount = 6;
  const pilePoints = [];
  for (let index = 0; index < pileCount; index += 1) {
    const angle = (index / pileCount) * Math.PI * 2 + Math.PI / 6;
    const x = Math.sin(angle) * pileRadius;
    const z = Math.cos(angle) * pileRadius;
    pilePoints.push(new THREE.Vector3(x, 0, z));

    const underwaterHeight = -SEABED_Y;
    const underwaterPile = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.42, underwaterHeight, 18),
      underwaterBronze,
    );
    underwaterPile.position.set(x, SEABED_Y + underwaterHeight * 0.5, z);
    underwaterPile.castShadow = true;
    underwaterPile.receiveShadow = true;
    group.add(underwaterPile);

    const upperPile = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 2.45, 18),
      bronze,
    );
    upperPile.position.set(x, 1.225, z);
    upperPile.castShadow = true;
    upperPile.receiveShadow = true;
    group.add(upperPile);
    airSide.push(upperPile);
  }

  for (let index = 0; index < pileCount; index += 1) {
    const next = (index + 1) % pileCount;
    const a = pilePoints[index];
    const b = pilePoints[next];
    for (const [top, bottom] of [[-2, -14], [-14, -25]]) {
      group.add(
        createStrut(
          underwaterBronze,
          new THREE.Vector3(a.x, top, a.z),
          new THREE.Vector3(b.x, bottom, b.z),
          0.075,
        ),
      );
      group.add(
        createStrut(
          underwaterBronze,
          new THREE.Vector3(b.x, top, b.z),
          new THREE.Vector3(a.x, bottom, a.z),
          0.075,
        ),
      );
    }
  }

  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 6.5, 0.48, 72),
    timber,
  );
  deck.position.y = 2.62;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  airSide.push(deck);

  const deckTrim = new THREE.Mesh(
    new THREE.TorusGeometry(6.52, 0.1, 10, 72),
    bronze,
  );
  deckTrim.rotation.x = Math.PI / 2;
  deckTrim.position.y = 2.82;
  group.add(deckTrim);
  airSide.push(deckTrim);

  const legAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  for (const angle of legAngles) {
    const leg = createStrut(
      iron,
      new THREE.Vector3(Math.sin(angle) * 3.6, 2.85, Math.cos(angle) * 3.6),
      new THREE.Vector3(Math.sin(angle) * 0.65, 13.2, Math.cos(angle) * 0.65),
      0.15,
      16,
    );
    group.add(leg);
    airSide.push(leg);
  }

  const canopy = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 6.15, 1.2, 72, 1, true),
    canvas,
  );
  canopy.position.y = 6.05;
  canopy.castShadow = true;
  group.add(canopy);
  airSide.push(canopy);

  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.1, 12, 40),
    bronze,
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 13.35;
  group.add(crown);
  airSide.push(crown);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.62, 2.6, 24),
    bronze,
  );
  beacon.position.y = 14.65;
  beacon.castShadow = true;
  group.add(beacon);
  airSide.push(beacon);

  return { group, materials, airSide };
}

function clampCamera(camera, controls) {
  camera.position.y = THREE.MathUtils.clamp(
    camera.position.y,
    CAMERA_MIN_Y,
    CAMERA_MAX_Y,
  );
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -220, 220);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -220, 220);
  if (controls?.target) {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -180, 180);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, SEABED_Y + 0.5, 16);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -180, 180);
    controls.update();
  }
}

export default {
  backend: "webgpu",
  assetBase: "/plugins/water/submergedSnellOcean/",
  initialTime: 28,
  async setup({ renderer, scene, camera, controls }) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const fftValidation = await runFftSelfTest(renderer);
    if (
      fftValidation.maxErrorConstant >= 1e-3 ||
      fftValidation.maxErrorWave >= 1e-3
    ) {
      throw new Error(
        `IFFT validation failed: constant=${fftValidation.maxErrorConstant}, ` +
        `wave=${fftValidation.maxErrorWave}`,
      );
    }

    const sky = createSkyDome();
    scene.add(sky);
    const environment = bakeSkyEnvironment(renderer, sky);
    scene.environment = environment.texture;
    scene.environmentIntensity = SKY_ENVIRONMENT_INTENSITY;

    const sun = createSunLight(2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 900;
    scene.add(sun, sun.target);

    const ocean = new SubmergedOcean(scene, new Rng(19051906), {
      segments: 384,
    });
    const caustics = new CausticsPass(ocean.simulation, 1024);
    const medium = new UnderwaterMediumPipeline(
      renderer,
      scene,
      camera,
      caustics,
      {
        godraySteps: 14,
        particulateCount: 18_000,
        submerged: ocean.submerged,
      },
    );

    const seabedMaterial = createSandMaterial((material, strength) =>
      medium.applyCaustics(material, strength)
    );
    const seabed = new THREE.Mesh(
      createSaucerSeabedGeometry(),
      seabedMaterial,
    );
    seabed.receiveShadow = true;
    scene.add(seabed);

    const tower = createWaterlineTower(medium);
    tower.group.position.z = TOWER_Z;
    scene.add(tower.group);
    // The tower's air-side geometry is registered with the interface layer, so
    // the Snell window shows its forward-refracted image instead of bare sky.
    ocean.register({
      name: "waterline tower",
      root: tower.group,
      meshes: tower.airSide,
      maxEdgeLength: 1.2,
      minimumLocalY: -0.1,
      stableMeanSurface: true,
      liveInterfaceMotion: true,
      underwaterOnly: true,
      maxCameraDistance: 130,
    });

    clampCamera(camera, controls);
    let timeScale = 1;
    return {
      setParameters(value) {
        timeScale = value.timeScale;
        gradeParams.exposureEV.value = value.exposureEV;
        gradeParams.lutIntensity.value = value.lutIntensity;
        gradeParams.vignette.value = value.vignette;
        medium.interior.value = value.mediumOcclusion;
      },
      update({ elapsed, delta }) {
        clampCamera(camera, controls);
        const time = elapsed * timeScale;
        ocean.update(
          renderer,
          camera,
          scene,
          time,
          Math.max(delta * timeScale, 1 / 120),
        );
        caustics.update(renderer);
        medium.update(time);
        sky.position.copy(camera.position);
      },
      render() {
        medium.render();
      },
      dispose() {
        medium.dispose();
        caustics.dispose();
        ocean.dispose(scene);
        scene.remove(seabed, sky, tower.group, sun, sun.target);
        scene.environment = null;
        environment.dispose();
        seabed.geometry.dispose();
        seabedMaterial.dispose();
        sky.geometry.dispose();
        sky.material.dispose();
        const geometries = new Set();
        tower.group.traverse((object) => {
          if (object.isMesh) geometries.add(object.geometry);
        });
        for (const geometry of geometries) geometry.dispose();
        for (const material of tower.materials) material.dispose();
      },
    };
  },
};
