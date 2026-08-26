import * as THREE from "three/webgpu";
import { color, uv, vec2 } from "three/tsl";

/**
 * Shared inspection studio for the procedural hard-surface model examples.
 *
 * Dev-shim only: a generated softbox environment, a three-point rig, a shadow-catcher
 * floor, and a contact blush. Every model example that needs a neutral studio uses this
 * one module so the lighting is literally identical between them and a visual comparison
 * is a comparison of the models.
 *
 * Subject-scale parameters (shadow extent, floor blush footprint) are arguments because a
 * 5.4 m car and a 2.6 m submarine cannot share one shadow frustum without either clipping
 * or wasting most of the depth map. Light colours, intensities, directions, environment,
 * and the floor treatment are fixed.
 */

const TAU = Math.PI * 2;

function smooth01(value) {
  return value * value * (3 - 2 * value);
}

export function buildStudioEnvironment() {
  const width = 384;
  const height = 192;
  const data = new Float32Array(width * height * 4);
  const softboxes = [
    { direction: new THREE.Vector3(0.45, 0.85, 0.35), intensity: 5.2, exponent: 16, color: [1, 0.98, 0.94] },
    { direction: new THREE.Vector3(-0.85, 0.25, 0.15), intensity: 1.5, exponent: 7, color: [0.82, 0.9, 1] },
    { direction: new THREE.Vector3(0.15, 0.35, -0.95), intensity: 2.6, exponent: 12, color: [1, 0.86, 0.66] },
    { direction: new THREE.Vector3(0.95, 0.05, 0.3), intensity: 0.9, exponent: 9, color: [1, 0.95, 0.85] },
    { direction: new THREE.Vector3(0, -1, 0), intensity: 0.5, exponent: 4, color: [1, 0.93, 0.82] },
  ];
  for (const softbox of softboxes) softbox.direction.normalize();
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y += 1) {
    const phi = (y + 0.5) / height * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const theta = (x + 0.5) / width * TAU;
      direction.set(
        -Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
        -Math.sin(phi) * Math.cos(theta),
      );
      const up = direction.y * 0.5 + 0.5;
      let red = THREE.MathUtils.lerp(0.32, 1.05, smooth01(up)) * 0.9;
      let green = red * 0.985;
      let blue = red * 0.94;
      for (const softbox of softboxes) {
        const weight = softbox.intensity * Math.pow(
          Math.max(direction.dot(softbox.direction), 0),
          softbox.exponent,
        );
        red += weight * softbox.color[0];
        green += weight * softbox.color[1];
        blue += weight * softbox.color[2];
      }
      const index = (y * width + x) * 4;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
      data[index + 3] = 1;
    }
  }
  const environment = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.magFilter = THREE.LinearFilter;
  environment.minFilter = THREE.LinearFilter;
  environment.needsUpdate = true;
  return environment;
}

export function createStudioStage({
  renderer,
  scene,
  groundY = 0,
  shadowExtent = 3.2,
  shadowNear = 1,
  shadowFar = 16,
  blushSize = [6.4, 3.4],
  blushCenter = [0, -0.1],
}) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color(0xb8b1a7);
  const environment = buildStudioEnvironment();
  scene.environment = environment;
  scene.environmentIntensity = 0.36;

  const key = new THREE.DirectionalLight(0xffead4, 1.85);
  key.position.set(4.2, 5.4, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -shadowExtent;
  key.shadow.camera.bottom = -shadowExtent;
  key.shadow.camera.right = shadowExtent;
  key.shadow.camera.top = shadowExtent;
  key.shadow.camera.near = shadowNear;
  key.shadow.camera.far = shadowFar;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcadcf2, 0.32);
  fill.position.set(-4.5, 2.2, 2.1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc98f, 0.58);
  rim.position.set(-1.8, 2.8, -4.8);
  scene.add(rim);

  const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.22 });
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    groundMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  const blushMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  blushMaterial.colorNode = color(0x6b5c44);
  blushMaterial.opacityNode = uv()
    .sub(vec2(0.5, 0.5))
    .length()
    .mul(2)
    .oneMinus()
    .clamp(0, 1)
    .pow(1.7)
    .mul(0.3);
  const blush = new THREE.Mesh(
    new THREE.PlaneGeometry(blushSize[0], blushSize[1]),
    blushMaterial,
  );
  blush.rotation.x = -Math.PI / 2;
  blush.position.set(blushCenter[0], groundY + 0.004, blushCenter[1]);
  blush.renderOrder = -2;
  scene.add(blush);

  return {
    environment,
    key,
    fill,
    rim,
    ground,
    blush,
    dispose() {
      scene.environment = null;
      scene.remove(key, fill, rim, ground, blush);
      environment.dispose();
      ground.geometry.dispose();
      groundMaterial.dispose();
      blush.geometry.dispose();
      blushMaterial.dispose();
    },
  };
}
