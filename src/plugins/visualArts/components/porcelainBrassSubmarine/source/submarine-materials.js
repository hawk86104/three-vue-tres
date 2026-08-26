import * as THREE from "three/webgpu";
import {
  color,
  float,
  frontFacing,
  mix,
  mx_noise_float,
  positionWorld,
  select,
  texture,
  time,
  uv,
  vec3,
} from "three/tsl";
import {
  SUBMARINE_DIMENSIONS as D,
  SUBMARINE_PALETTE as PAL,
} from "./design-contract.js";
import { mulberry32, smooth01, TAU } from "./mesh-kit.js";

const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 1024;

function buildDetailAtlas(random) {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const context = canvas.getContext("2d");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  context.globalCompositeOperation = "lighter";
  const xAt = (uValue) => uValue * ATLAS_WIDTH;
  const yAt = (vValue) => vValue * ATLAS_HEIGHT;

  function curl(x, y, angle, length, curvature, width, growth = 1.1) {
    const steps = Math.max(10, (length / 5) | 0);
    const stepLength = length / steps;
    const spine = [];
    let currentAngle = angle;
    let currentCurvature = curvature;
    for (let index = 0; index <= steps; index += 1) {
      spine.push({ x, y, a: currentAngle, t: index / steps });
      x += Math.cos(currentAngle) * stepLength;
      y += Math.sin(currentAngle) * stepLength;
      currentAngle += currentCurvature;
      currentCurvature *= growth;
    }
    const left = [];
    const right = [];
    for (const sample of spine) {
      const sampleWidth = width * Math.pow(1 - sample.t, 1.25) * 0.5 + 0.25;
      left.push([
        sample.x - Math.sin(sample.a) * sampleWidth,
        sample.y + Math.cos(sample.a) * sampleWidth,
      ]);
      right.push([
        sample.x + Math.sin(sample.a) * sampleWidth,
        sample.y - Math.cos(sample.a) * sampleWidth,
      ]);
    }
    context.beginPath();
    context.moveTo(left[0][0], left[0][1]);
    for (const point of left) context.lineTo(point[0], point[1]);
    for (let index = right.length - 1; index >= 0; index -= 1) {
      context.lineTo(right[index][0], right[index][1]);
    }
    context.closePath();
    context.fill();
    return spine;
  }

  function fern(x, y, angle, length, width, direction = 1) {
    const spine = curl(
      x,
      y,
      angle,
      length,
      direction * 0.028,
      width,
      1.065,
    );
    for (let index = 2; index < spine.length - 2; index += 1) {
      const sample = spine[index];
      if ((index - 2) % 2) continue;
      const taper = 1 - sample.t;
      const side = index % 4 < 2 ? 1 : -1;
      curl(
        sample.x,
        sample.y,
        sample.a + side * (1.25 + 0.2 * random()),
        length * 0.24 * taper + 6,
        side * direction * 0.16,
        width * 0.55 * taper,
        1.22,
      );
    }
  }

  function scroll(x, y, angle, length, width, direction = 1) {
    curl(x, y, angle, length, direction * 0.075, width, 1.16);
    curl(
      x,
      y,
      angle + Math.PI * 0.92,
      length * 0.45,
      -direction * 0.11,
      width * 0.8,
      1.2,
    );
  }

  function paintSide() {
    const windowU = D.window.uCenter;
    const windowV = D.window.vCenter;
    const centerX = xAt(windowU);
    const centerY = yAt(windowV);
    const halfWidth = D.window.uHalf * ATLAS_WIDTH;
    const halfHeight = D.window.vHalf * ATLAS_HEIGHT;

    function windowPath(scale = 1, target = context) {
      target.beginPath();
      target.moveTo(centerX, centerY - halfHeight * scale);
      target.bezierCurveTo(
        centerX + halfWidth * scale,
        centerY - halfHeight * scale,
        centerX + halfWidth * scale,
        centerY - halfHeight * 0.15 * scale,
        centerX + halfWidth * 0.92 * scale,
        centerY + halfHeight * 0.12 * scale,
      );
      target.bezierCurveTo(
        centerX + halfWidth * 0.72 * scale,
        centerY + halfHeight * 0.62 * scale,
        centerX + halfWidth * 0.3 * scale,
        centerY + halfHeight * 1.02 * scale,
        centerX - halfWidth * 0.12 * scale,
        centerY + halfHeight * 1.06 * scale,
      );
      target.bezierCurveTo(
        centerX - halfWidth * 0.5 * scale,
        centerY + halfHeight * 1.02 * scale,
        centerX - halfWidth * 0.86 * scale,
        centerY + halfHeight * 0.6 * scale,
        centerX - halfWidth * 0.98 * scale,
        centerY + halfHeight * 0.1 * scale,
      );
      target.bezierCurveTo(
        centerX - halfWidth * scale,
        centerY - halfHeight * 0.2 * scale,
        centerX - halfWidth * 0.85 * scale,
        centerY - halfHeight * scale,
        centerX,
        centerY - halfHeight * scale,
      );
      target.closePath();
    }

    context.fillStyle = "#ff0000";
    windowPath();
    context.fill();
    context.fillStyle = "#00cc00";
    context.strokeStyle = "#00cc00";
    context.lineCap = "round";
    context.lineWidth = 7;
    windowPath(1.1);
    context.stroke();
    context.lineWidth = 3;
    windowPath(1.2);
    context.stroke();

    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(xAt(windowU + 0.075), yAt(0.035));
    context.bezierCurveTo(
      xAt(windowU + 0.095), yAt(0.18),
      xAt(windowU + 0.075), yAt(0.42),
      xAt(windowU + 0.02), yAt(0.66),
    );
    context.bezierCurveTo(
      xAt(windowU - 0.01), yAt(0.78),
      xAt(windowU - 0.03), yAt(0.84),
      xAt(windowU - 0.045), yAt(0.9),
    );
    context.stroke();
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(xAt(windowU + 0.088), yAt(0.035));
    context.bezierCurveTo(
      xAt(windowU + 0.108), yAt(0.2),
      xAt(windowU + 0.086), yAt(0.44),
      xAt(windowU + 0.028), yAt(0.68),
    );
    context.bezierCurveTo(
      xAt(windowU - 0.002), yAt(0.8),
      xAt(windowU - 0.024), yAt(0.86),
      xAt(windowU - 0.04), yAt(0.92),
    );
    context.stroke();
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(xAt(windowU - 0.065), yAt(0.06));
    context.bezierCurveTo(
      xAt(windowU - 0.1), yAt(0.22),
      xAt(windowU - 0.088), yAt(0.4),
      xAt(windowU - 0.052), yAt(0.52),
    );
    context.stroke();

    fern(centerX + halfWidth * 0.4, centerY + halfHeight * 1.55, Math.PI * 0.44, 200, 10, 1);
    fern(centerX - halfWidth * 1.7, centerY + halfHeight * 0.28, Math.PI * 0.52, 150, 8, -1);
    fern(xAt(windowU + 0.058), yAt(0.083), Math.PI * 0.62, 120, 7, -1);
    scroll(xAt(windowU - 0.052), yAt(0.6), Math.PI * 0.35, 70, 6, 1);
    scroll(xAt(windowU + 0.01), yAt(0.76), Math.PI * 0.3, 84, 6, -1);

    context.save();
    context.filter = "blur(14px)";
    context.strokeStyle = "rgba(0,0,90,1)";
    context.lineWidth = 16;
    windowPath(1.16);
    context.stroke();
    context.restore();
  }

  paintSide();
  context.save();
  context.translate(ATLAS_WIDTH, 0);
  context.scale(-1, 1);
  paintSide();
  context.restore();

  context.strokeStyle = "#00cc00";
  const ring = (vValue, width) => {
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(0, yAt(vValue));
    context.lineTo(ATLAS_WIDTH, yAt(vValue));
    context.stroke();
  };
  ring(0.022, 6);
  ring(0.045, 2.5);
  ring(0.865, 6);
  ring(0.895, 2.5);
  ring(0.925, 10);
  context.save();
  context.filter = "blur(18px)";
  context.strokeStyle = "rgba(0,0,70,1)";
  ring(0.94, 26);
  context.restore();

  const detailAtlas = new THREE.CanvasTexture(canvas);
  detailAtlas.flipY = false;
  detailAtlas.wrapS = THREE.RepeatWrapping;
  detailAtlas.wrapT = THREE.ClampToEdgeWrapping;
  detailAtlas.colorSpace = THREE.NoColorSpace;
  detailAtlas.anisotropy = 8;
  return detailAtlas;
}

function buildGaugeFace() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f7f2e4";
  context.beginPath();
  context.arc(64, 64, 62, 0, TAU);
  context.fill();
  context.strokeStyle = "#5a4a30";
  context.lineWidth = 2;
  for (let index = 0; index <= 12; index += 1) {
    const angle = Math.PI * 0.75 + (index / 12) * Math.PI * 1.5;
    const innerRadius = index % 3 === 0 ? 44 : 50;
    context.beginPath();
    context.moveTo(64 + Math.cos(angle) * innerRadius, 64 + Math.sin(angle) * innerRadius);
    context.lineTo(64 + Math.cos(angle) * 56, 64 + Math.sin(angle) * 56);
    context.stroke();
  }
  context.strokeStyle = "#8a2f1d";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(64, 64);
  const needleAngle = Math.PI * 0.75 + 0.62 * Math.PI * 1.5;
  context.lineTo(64 + Math.cos(needleAngle) * 46, 64 + Math.sin(needleAngle) * 46);
  context.stroke();
  context.fillStyle = "#5a4a30";
  context.beginPath();
  context.arc(64, 64, 4, 0, TAU);
  context.fill();
  const gaugeFace = new THREE.CanvasTexture(canvas);
  gaugeFace.colorSpace = THREE.SRGBColorSpace;
  gaugeFace.anisotropy = 4;
  return gaugeFace;
}

function buildQuiltNormalTexture(cells = 6) {
  const size = 512;
  const height = new Float32Array(size * size);
  const cell = size / cells;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const rotatedX = (x + y) / cell;
      const rotatedY = (x - y) / cell;
      const fractionX = Math.abs(rotatedX - Math.round(rotatedX));
      const fractionY = Math.abs(rotatedY - Math.round(rotatedY));
      const distance = Math.min(fractionX, fractionY);
      let value = smooth01(Math.min(distance * 6, 1));
      const gridX = rotatedX - Math.round(rotatedX);
      const gridY = rotatedY - Math.round(rotatedY);
      const centerDistance = Math.hypot(gridX, gridY);
      value *= 1 - 0.85 * Math.exp(-centerDistance * centerDistance * 90);
      height[y * size + x] = value;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const heightAt = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * 2.2;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 2.2;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      data[index] = (-dx * inverseLength * 0.5 + 0.5) * 255;
      data[index + 1] = (dy * inverseLength * 0.5 + 0.5) * 255;
      data[index + 2] = (inverseLength * 0.5 + 0.5) * 255;
      data[index + 3] = 255;
    }
  }
  const quiltTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  quiltTexture.wrapS = THREE.RepeatWrapping;
  quiltTexture.wrapT = THREE.RepeatWrapping;
  quiltTexture.needsUpdate = true;
  quiltTexture.anisotropy = 8;
  return quiltTexture;
}

export function createSubmarineMaterials({ seed = 20260714 } = {}) {
  const detailAtlas = buildDetailAtlas(mulberry32(seed));
  const gaugeFace = buildGaugeFace();
  const quiltTexture = buildQuiltNormalTexture();
  const materials = {};
  const noiseAt = (scale) => mx_noise_float(positionWorld.mul(scale));

  const atlas = texture(detailAtlas, uv());
  const goldMask = atlas.g.clamp(0, 1);
  const grime = atlas.b.clamp(0, 1);
  const paintColor = mix(
    color(PAL.porcelain),
    color(PAL.porcelainLow),
    noiseAt(1.6).mul(0.5).add(0.5).mul(0.35),
  );
  const leafColor = mix(
    color(PAL.brass),
    color(PAL.brassDeep),
    noiseAt(30).mul(0.5).add(0.5).mul(0.4),
  );
  const frontColor = mix(paintColor, leafColor, goldMask).mul(
    grime.mul(0.22).oneMinus(),
  );
  const hull = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
  hull.colorNode = select(frontFacing, frontColor, color(PAL.interiorDark));
  hull.metalnessNode = select(frontFacing, goldMask.mul(0.95), float(0));
  hull.roughnessNode = select(
    frontFacing,
    mix(float(0.34).add(noiseAt(9).mul(0.05)), float(0.22), goldMask),
    float(0.85),
  );
  hull.clearcoat = 0.9;
  hull.clearcoatRoughness = 0.14;
  hull.opacityNode = atlas.r.oneMinus();
  hull.alphaTest = 0.5;
  materials.hull = hull;

  const porcelain = new THREE.MeshPhysicalNodeMaterial();
  porcelain.colorNode = mix(
    color(PAL.porcelain),
    color(PAL.porcelainLow),
    noiseAt(2.2).mul(0.5).add(0.5).mul(0.3),
  );
  porcelain.roughnessNode = float(0.33).add(noiseAt(8).mul(0.05));
  porcelain.metalness = 0;
  porcelain.clearcoat = 0.9;
  porcelain.clearcoatRoughness = 0.14;
  materials.porcelain = porcelain;

  function brass(roughness, clearcoat) {
    const material = new THREE.MeshPhysicalNodeMaterial();
    material.colorNode = mix(
      color(PAL.brass),
      color(PAL.brassDeep),
      noiseAt(26).mul(0.5).add(0.5).mul(0.45),
    );
    material.metalness = 1;
    material.roughnessNode = float(roughness).add(noiseAt(14).mul(0.07));
    material.clearcoat = clearcoat;
    material.clearcoatRoughness = 0.2;
    return material;
  }
  materials.brass = brass(0.17, 0.35);
  materials.brassSatin = brass(0.3, 0.15);
  materials.brassDark = brass(0.42, 0);
  materials.brassDark.colorNode = color(PAL.brassDeep);

  const glass = new THREE.MeshPhysicalNodeMaterial();
  glass.color = new THREE.Color(0xffffff);
  glass.transmission = 1;
  glass.ior = 1.52;
  glass.thickness = 0.05;
  glass.roughness = 0.035;
  glass.metalness = 0;
  glass.clearcoat = 1;
  glass.clearcoatRoughness = 0.06;
  glass.attenuationColor = PAL.glassTint;
  glass.attenuationDistance = 2.5;
  glass.depthWrite = false;
  materials.glass = glass;

  const ownedTextures = [detailAtlas, gaugeFace, quiltTexture];
  function leather(repeat) {
    const material = new THREE.MeshPhysicalNodeMaterial();
    material.colorNode = mix(
      color(PAL.leather),
      color(PAL.leather).mul(0.9),
      noiseAt(20).mul(0.5).add(0.5).mul(0.5),
    );
    material.roughnessNode = float(0.52).add(noiseAt(40).mul(0.06));
    material.metalness = 0;
    material.sheen = 0.5;
    material.sheenRoughness = 0.6;
    material.sheenColor = new THREE.Color(0xfff6e0);
    material.clearcoat = 0.12;
    material.clearcoatRoughness = 0.4;
    const normalMap = quiltTexture.clone();
    normalMap.repeat.set(repeat, repeat);
    normalMap.needsUpdate = true;
    ownedTextures.push(normalMap);
    material.normalMap = normalMap;
    material.normalScale = new THREE.Vector2(0.55, 0.55);
    return material;
  }
  materials.leatherQ = leather(1.4);
  materials.leatherPl = leather(1);
  materials.leatherPl.normalMap = null;

  const wood = new THREE.MeshPhysicalNodeMaterial();
  const grain = mx_noise_float(positionWorld.mul(vec3(9, 9, 2.2))).mul(0.5).add(0.5);
  wood.colorNode = mix(color(PAL.wood), color(PAL.wood).mul(0.55), grain);
  wood.roughnessNode = mix(float(0.32), float(0.5), grain);
  wood.metalness = 0;
  wood.clearcoat = 0.8;
  wood.clearcoatRoughness = 0.18;
  materials.wood = wood;

  const flicker = time.mul(2.1).sin().mul(time.mul(3.7).sin()).mul(0.05).add(1);
  materials.lampCore = new THREE.MeshBasicNodeMaterial();
  materials.lampCore.colorNode = color(PAL.lamp).mul(flicker.mul(6));
  const lampGlass = new THREE.MeshPhysicalNodeMaterial();
  lampGlass.colorNode = color(PAL.lamp);
  lampGlass.emissiveNode = color(PAL.lamp).mul(flicker.mul(1.6));
  lampGlass.roughness = 0.18;
  lampGlass.metalness = 0;
  lampGlass.transparent = true;
  lampGlass.opacity = 0.85;
  materials.lampGlass = lampGlass;

  const darkMetal = new THREE.MeshPhysicalNodeMaterial();
  darkMetal.colorNode = color(PAL.interiorDark).mul(1.15);
  darkMetal.metalness = 0.85;
  darkMetal.roughness = 0.5;
  materials.darkMetal = darkMetal;

  materials.gauge = new THREE.MeshBasicNodeMaterial();
  materials.gauge.colorNode = texture(gaugeFace, uv()).mul(1.1);

  return { materials, textures: ownedTextures };
}
