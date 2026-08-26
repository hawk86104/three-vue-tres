import * as THREE from "three/webgpu";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SUBMARINE_DIMENSIONS as D } from "./design-contract.js";
import {
  arcPath,
  createMesh as M,
  finLoft,
  gridGeometry,
  latheZ,
  lerp,
  ringPoints,
  smooth01,
  splinePts,
  sweepTube,
  TAU,
  V3,
} from "./mesh-kit.js";
import { createSubmarineMaterials } from "./submarine-materials.js";

export function createSubmarineHullPlan({
  rimCenter,
  tilt = D.dome.tilt,
} = {}) {
  const collarNormal = V3(0, Math.sin(tilt), Math.cos(tilt));
  const resolvedRimCenter = rimCenter ?? V3()
    .copy(D.dome.center)
    .addScaledVector(collarNormal, -D.dome.planeOffset);
  const hullPlan = { n: 240, cy: [], z: [], r: [], tiltA: [], v: [] };
  const radiusControl = splinePts([
    [0.995, 0],
    [1.014, 0.07],
    [1.006, 0.25],
    [0.958, 0.42],
    [0.845, 0.6],
    [0.645, 0.78],
    [0.43, 0.92],
    [D.hull.tailR, 1],
  ], hullPlan.n - 1);
  const centerYControl = splinePts([
    [resolvedRimCenter.y, 0],
    [0.012, 0.18],
    [-0.012, 0.5],
    [0.02, 0.8],
    [0.075, 1],
  ], hullPlan.n - 1);
  let accumulatedLength = 0;
  for (let index = 0; index < hullPlan.n; index += 1) {
    const t = index / (hullPlan.n - 1);
    hullPlan.r[index] = radiusControl[
      Math.min(index, radiusControl.length - 1)
    ].x;
    hullPlan.cy[index] = centerYControl[
      Math.min(index, centerYControl.length - 1)
    ].x;
    hullPlan.z[index] = lerp(resolvedRimCenter.z, D.hull.tailZ, t);
    hullPlan.tiltA[index] = tilt * (
      1 - smooth01(Math.min(t / 0.34, 1))
    );
    if (index > 0) {
      accumulatedLength += Math.hypot(
        hullPlan.z[index] - hullPlan.z[index - 1],
        hullPlan.r[index] - hullPlan.r[index - 1],
      ) + Math.abs(hullPlan.cy[index] - hullPlan.cy[index - 1]);
    }
    hullPlan.v[index] = accumulatedLength;
  }
  for (let index = 0; index < hullPlan.n; index += 1) {
    hullPlan.v[index] /= accumulatedLength;
  }
  return hullPlan;
}

export function sampleSubmarineHullRing(hullPlan, t) {
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (hullPlan.n - 1);
  const index = Math.min(hullPlan.n - 2, scaled | 0);
  const fraction = scaled - index;
  const ringTilt = lerp(
    hullPlan.tiltA[index],
    hullPlan.tiltA[index + 1],
    fraction,
  );
  return {
    c: V3(
      0,
      lerp(hullPlan.cy[index], hullPlan.cy[index + 1], fraction),
      lerp(hullPlan.z[index], hullPlan.z[index + 1], fraction),
    ),
    r: lerp(hullPlan.r[index], hullPlan.r[index + 1], fraction),
    axU: V3(1, 0, 0),
    axV: V3(0, Math.cos(ringTilt), -Math.sin(ringTilt)),
    v: lerp(hullPlan.v[index], hullPlan.v[index + 1], fraction),
  };
}

export function createPorcelainBrassSubmarine({ seed = 20260714 } = {}) {
  const materialBundle = createSubmarineMaterials({ seed });
  const MAT = materialBundle.materials;
  const submarine = new THREE.Group();
  submarine.name = "porcelain-brass-submarine";
  const stats = [];
  const stat = (name, geometry) => stats.push({
    part: name,
    tris: (
      geometry.index
        ? geometry.index.count
        : geometry.attributes.position.count
    ) / 3 | 0,
  });

  const domeCenter = D.dome.center;
  const domeRadius = D.dome.radius;
  const tilt = D.dome.tilt;
  const collarNormal = V3(0, Math.sin(tilt), Math.cos(tilt));
  const rimCenter = V3()
    .copy(domeCenter)
    .addScaledVector(collarNormal, -D.dome.planeOffset);
  const rimRadius = Math.sqrt(
    domeRadius * domeRadius - D.dome.planeOffset ** 2,
  );
  const rimU = V3(1, 0, 0);
  const rimV = V3(0, Math.cos(tilt), -Math.sin(tilt));

  const hullPlan = createSubmarineHullPlan({ rimCenter, tilt });

  function hullRingAt(t) {
    return sampleSubmarineHullRing(hullPlan, t);
  }

  function hullPoint(uValue, t) {
    const ring = hullRingAt(t);
    const angle = uValue * TAU;
    return V3()
      .copy(ring.c)
      .addScaledVector(ring.axU, Math.sin(angle) * ring.r)
      .addScaledVector(ring.axV, -Math.cos(angle) * ring.r);
  }

  function hullSample(uValue, t) {
    const epsilon = 0.004;
    const position = hullPoint(uValue, t);
    const tangentU = hullPoint(uValue + epsilon, t).sub(
      hullPoint(uValue - epsilon, t),
    );
    const tangentT = hullPoint(uValue, Math.min(t + epsilon, 1)).sub(
      hullPoint(uValue, Math.max(t - epsilon, 0)),
    );
    const normal = V3().crossVectors(tangentU, tangentT).normalize().negate();
    return { p: position, n: normal };
  }

  {
    const rows = [];
    const vRow = [];
    for (let index = 0; index < D.hull.rings; index += 1) {
      const t = index / (D.hull.rings - 1);
      const ring = hullRingAt(t);
      rows.push(ringPoints(ring.c, ring.axU, ring.axV, ring.r, D.hull.segs));
      vRow.push(ring.v);
    }
    const geometry = gridGeometry(rows, { closeU: true, flip: true, vRow });
    M(geometry, MAT.hull, submarine, "hull");
    stat("hull", geometry);
  }

  {
    const rim = ringPoints(rimCenter, rimU, rimV, rimRadius + 0.004, 140);
    rim.push(rim[0].clone());
    const collarGeometry = sweepTube(rim, 0.042, 18);
    M(collarGeometry, MAT.brass, submarine, "collar");
    stat("collar", collarGeometry);
    const bead = ringPoints(
      V3().copy(rimCenter).addScaledVector(collarNormal, 0.045),
      rimU,
      rimV,
      rimRadius - 0.028,
      120,
    );
    bead.push(bead[0].clone());
    const beadGeometry = sweepTube(bead, 0.016, 12);
    M(beadGeometry, MAT.brass, submarine, "collarBead");
    stat("collarBead", beadGeometry);
  }

  function windowOutlineUV(scale = 1, count = 64) {
    const {
      uCenter: windowU,
      vCenter: windowV,
      uHalf: halfU,
      vHalf: halfV,
    } = D.window;
    const points = [
      [windowU, windowV - halfV * scale],
      [windowU + halfU * scale, windowV - halfV * scale],
      [windowU + halfU * scale, windowV - halfV * 0.15 * scale],
      [windowU + halfU * 0.92 * scale, windowV + halfV * 0.12 * scale],
      [windowU + halfU * 0.72 * scale, windowV + halfV * 0.62 * scale],
      [windowU + halfU * 0.3 * scale, windowV + halfV * 1.02 * scale],
      [windowU - halfU * 0.12 * scale, windowV + halfV * 1.06 * scale],
      [windowU - halfU * 0.5 * scale, windowV + halfV * 1.02 * scale],
      [windowU - halfU * 0.86 * scale, windowV + halfV * 0.6 * scale],
      [windowU - halfU * 0.98 * scale, windowV + halfV * 0.1 * scale],
      [windowU - halfU * scale, windowV - halfV * 0.2 * scale],
      [windowU - halfU * 0.85 * scale, windowV - halfV * scale],
    ];
    const curve = new THREE.CatmullRomCurve3(
      points.map((point) => V3(point[0], point[1], 0)),
      true,
      "centripetal",
    );
    return curve
      .getSpacedPoints(count)
      .map((point) => new THREE.Vector2(point.x, point.y));
  }

  function buildWindow(mirror) {
    const outline = windowOutlineUV(1.06, 72);
    const lift = (uvPoint) => {
      const uValue = mirror ? 1 - uvPoint.x : uvPoint.x;
      const sample = hullSample(uValue, uvPoint.y);
      return { p: sample.p, n: sample.n };
    };
    const path = outline.map((point) => {
      const { p, n } = lift(point);
      return p.addScaledVector(n, 0.01);
    });
    path.push(path[0].clone());
    const frameGeometry = sweepTube(path, 0.017, 12);
    M(frameGeometry, MAT.brass, submarine, "windowFrame");
    stat("windowFrame", frameGeometry);
    const echoOutline = windowOutlineUV(1.22, 72);
    const echoPath = echoOutline.map((point) => {
      const { p, n } = lift(point);
      return p.addScaledVector(n, 0.006);
    });
    echoPath.push(echoPath[0].clone());
    const echoGeometry = sweepTube(echoPath, 0.006, 8);
    M(echoGeometry, MAT.brass, submarine, "windowEcho");
    stat("windowEcho", echoGeometry);

    const rowCount = 9;
    const centerUV = new THREE.Vector2(
      D.window.uCenter,
      D.window.vCenter + D.window.vHalf * 0.05,
    );
    const rows = [];
    for (let index = 0; index < rowCount; index += 1) {
      const contraction = 1 - index / (rowCount - 1) * 0.985;
      const bulge = Math.sqrt(Math.max(1 - contraction * contraction, 0));
      rows.push(outline.map((point) => {
        const uvPoint = new THREE.Vector2().copy(centerUV).lerp(
          point,
          contraction,
        );
        const { p, n } = lift(uvPoint);
        return p.addScaledVector(n, 0.004 + 0.028 * bulge);
      }));
    }
    const glassGeometry = gridGeometry(rows, {
      closeU: true,
      flip: mirror ? false : true,
    });
    const glass = M(glassGeometry, MAT.glass, submarine, "windowGlass");
    glass.castShadow = false;
    stat("windowGlass", glassGeometry);
  }
  buildWindow(false);
  buildWindow(true);

  function buildSpear(sideU) {
    const group = new THREE.Group();
    submarine.add(group);
    const startSample = hullSample(sideU, 0.06);
    const endSample = hullSample(sideU, 0.52);
    const start = startSample.p.clone().addScaledVector(startSample.n, 0.034);
    const end = endSample.p.clone().addScaledVector(endSample.n, 0.034);
    const contactT = 0.29;
    const contact = hullSample(sideU, contactT);
    const tangentStep = 0.004;
    const direction = hullPoint(sideU, contactT - tangentStep)
      .sub(hullPoint(sideU, contactT + tangentStep))
      .normalize();
    const contactSpan = start.distanceTo(end);
    const axisContact = contact.p.clone().addScaledVector(contact.n, 0.034);
    const tail = axisContact.clone().addScaledVector(
      direction,
      -(0.12 + contactSpan * 0.5),
    );
    const length = contactSpan + 0.46;
    const profile = [
      [0.0015, 0], [0.016, 0.012], [0.021, 0.03], [0.009, 0.05],
      [0.03, 0.075], [0.037, 0.1], [0.0135, 0.135], [0.0125, 0.15],
      [0.0125, 0.86], [0.02, 0.885], [0.02, 0.91], [0.013, 0.925],
      [0.024, 0.965], [0.0015, 1],
    ].map((point) => new THREE.Vector2(point[0], (1 - point[1]) * length));
    const geometry = latheZ(profile, 26, { flip: false });
    const spear = M(geometry, MAT.brass, group, "spear");
    stat("spear", geometry);
    spear.position.copy(tail);
    spear.quaternion.setFromUnitVectors(V3(0, 0, 1), direction);
    for (const mountT of [0.16, 0.44]) {
      const sample = hullSample(sideU, mountT);
      const base = sample.p.clone().addScaledVector(sample.n, -0.005);
      const axisDistance = V3().subVectors(base, tail).dot(direction);
      const top = tail.clone().addScaledVector(direction, axisDistance);
      const mountGeometry = sweepTube(
        [base, base.clone().lerp(top, 0.5), top],
        (t) => lerp(0.02, 0.011, t),
        10,
      );
      M(mountGeometry, MAT.brassSatin, group, "spearMount");
      stat("spearMount", mountGeometry);
    }
  }
  buildSpear(0.25);
  buildSpear(0.75);

  {
    const group = new THREE.Group();
    submarine.add(group);
    const boardZ = 0.3;
    const boardY = -1.115;
    const board = new RoundedBoxGeometry(0.46, 0.075, 0.34, 4, 0.035);
    M(board, MAT.porcelain, group, "step").position.set(0, boardY, boardZ);
    stat("step", board);
    const roundedRectangle = (width, depth, radius) => {
      const points = [];
      const segments = 7;
      const corners = [
        [width - radius, depth - radius, 0],
        [-width + radius, depth - radius, Math.PI / 2],
        [-width + radius, -depth + radius, Math.PI],
        [width - radius, -depth + radius, Math.PI * 1.5],
      ];
      for (const [centerX, centerZ, startAngle] of corners) {
        for (let index = 0; index <= segments; index += 1) {
          const angle = startAngle + index / segments * Math.PI / 2;
          points.push(V3(
            centerX + Math.cos(angle) * radius,
            boardY + 0.041,
            boardZ + centerZ + Math.sin(angle) * radius,
          ));
        }
      }
      points.push(points[0].clone());
      return points;
    };
    const trimGeometry = sweepTube(
      roundedRectangle(0.185, 0.125, 0.05),
      0.0045,
      8,
    );
    M(trimGeometry, MAT.brass, group, "stepTrim");
    stat("stepTrim", trimGeometry);
    for (const targetZ of [0.17, 0.43]) {
      const t = (0.792 - targetZ) / (0.792 - D.hull.tailZ);
      const sample = hullSample(0, t);
      const point0 = sample.p.clone().addScaledVector(sample.n, -0.01);
      const point3 = V3(0, boardY + 0.03, targetZ);
      const point1 = point0.clone().addScaledVector(sample.n, 0.06);
      const point2 = point3.clone().add(V3(0, 0.06, 0));
      const curve = new THREE.CubicBezierCurve3(point0, point1, point2, point3);
      const bracketGeometry = sweepTube(
        curve.getSpacedPoints(22),
        (tValue) => lerp(0.02, 0.014, tValue),
        10,
        { roundEnds: false },
      );
      M(bracketGeometry, MAT.brassSatin, group, "stepBracket");
      stat("stepBracket", bracketGeometry);
    }
  }

  {
    const sample = hullSample(0, 0.1);
    const group = new THREE.Group();
    group.position.copy(sample.p);
    submarine.add(group);
    group.quaternion.setFromUnitVectors(V3(0, 0, 1), sample.n);
    const ringGeometry = latheZ([
      [0.028, 0.055], [0.055, 0.045], [0.062, 0.02],
      [0.058, 0], [0.048, -0.008],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 26);
    M(ringGeometry, MAT.brass, group, "noseLampRing");
    stat("noseLampRing", ringGeometry);
    const bulb = new THREE.SphereGeometry(0.044, 20, 14);
    const bulbMesh = M(bulb, MAT.lampGlass, group, "noseLampBulb");
    bulbMesh.position.z = 0.028;
    bulbMesh.castShadow = false;
    const core = new THREE.SphereGeometry(0.02, 10, 8);
    M(core, MAT.lampCore, group, "noseLampCore").position.z = 0.028;
  }

  {
    const group = new THREE.Group();
    submarine.add(group);
    const startZ = -0.3;
    const endZ = -0.78;
    const lift = 0.15;
    const cornerRadius = 0.06;
    const startSample = hullSample(0.5, (0.792 - startZ) / (0.792 - D.hull.tailZ));
    const endSample = hullSample(0.5, (0.792 - endZ) / (0.792 - D.hull.tailZ));
    const topY = Math.max(startSample.p.y, endSample.p.y) + lift;
    const points = [startSample.p.clone().addScaledVector(startSample.n, -0.02)];
    points.push(V3(0, topY - cornerRadius, startZ));
    const corner = (centerY, centerZ, startAngle, endAngle) => {
      for (let index = 1; index <= 6; index += 1) {
        const angle = lerp(startAngle, endAngle, index / 6);
        points.push(V3(
          0,
          centerY + Math.sin(angle) * cornerRadius,
          centerZ + Math.cos(angle) * cornerRadius,
        ));
      }
    };
    corner(topY - cornerRadius, startZ - cornerRadius, 0, Math.PI / 2);
    points.push(V3(0, topY, endZ + cornerRadius));
    corner(topY - cornerRadius, endZ + cornerRadius, Math.PI / 2, Math.PI);
    points.push(V3(0, topY - cornerRadius, endZ));
    points.push(endSample.p.clone().addScaledVector(endSample.n, -0.02));
    const handleGeometry = sweepTube(points, 0.026, 14);
    M(handleGeometry, MAT.brass, group, "handle");
    stat("handle", handleGeometry);
    for (const sample of [startSample, endSample]) {
      const flangeGeometry = latheZ([
        [0.012, 0.055], [0.05, 0.03], [0.058, 0.012], [0.05, 0],
      ].map((point) => new THREE.Vector2(point[0], point[1])), 20);
      const flange = M(flangeGeometry, MAT.brass, group, "flange");
      stat("flange", flangeGeometry);
      flange.position.copy(sample.p).addScaledVector(sample.n, -0.004);
      flange.quaternion.setFromUnitVectors(V3(0, 0, 1), sample.n);
    }
    const ventSample = hullSample(0.5, 0.055);
    const ventGeometry = latheZ([
      [0.001, 0.05], [0.03, 0.046], [0.048, 0.03], [0.055, 0.012], [0.046, 0],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 22);
    const vent = M(ventGeometry, MAT.brass, group, "vent");
    stat("vent", ventGeometry);
    vent.position.copy(ventSample.p).addScaledVector(ventSample.n, -0.004);
    vent.quaternion.setFromUnitVectors(V3(0, 0, 1), ventSample.n);
  }

  {
    const count = 30;
    const geometry = new THREE.SphereGeometry(0.0105, 8, 6);
    const rivets = new THREE.InstancedMesh(geometry, MAT.brassDark, count);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * TAU;
      const position = V3()
        .copy(rimCenter)
        .addScaledVector(rimU, Math.sin(angle) * (rimRadius + 0.004))
        .addScaledVector(rimV, -Math.cos(angle) * (rimRadius + 0.004))
        .addScaledVector(collarNormal, 0)
        .addScaledVector(
          V3()
            .copy(rimU)
            .multiplyScalar(Math.sin(angle))
            .addScaledVector(rimV, -Math.cos(angle)),
          0.04,
        );
      matrix.setPosition(position);
      rivets.setMatrixAt(index, matrix);
    }
    rivets.castShadow = true;
    submarine.add(rivets);
  }

  {
    const maximumAngle = Math.acos(-D.dome.planeOffset / domeRadius);
    const profile = [];
    for (let index = 0; index <= 46; index += 1) {
      const angle = lerp(0.015, maximumAngle, index / 46);
      profile.push(new THREE.Vector2(
        domeRadius * Math.sin(angle),
        domeRadius * Math.cos(angle),
      ));
    }
    const geometry = latheZ(profile, 96, { flip: true });
    const glass = M(geometry, MAT.glass, submarine, "domeGlass");
    glass.castShadow = false;
    glass.position.copy(domeCenter);
    glass.quaternion.setFromUnitVectors(V3(0, 0, 1), collarNormal);
    stat("domeGlass", geometry);
  }

  {
    const group = new THREE.Group();
    group.position.copy(domeCenter);
    submarine.add(group);
    const cageRadius = 0.947;
    for (const angle of [0.42, 0.85, 1.28]) {
      const ring = ringPoints(
        V3(0, 0, cageRadius * Math.cos(angle)),
        V3(1, 0, 0),
        V3(0, 1, 0),
        cageRadius * Math.sin(angle),
        84,
      );
      ring.push(ring[0].clone());
      const geometry = sweepTube(ring, 0.0105, 10);
      M(geometry, MAT.brass, group, "cageRing").castShadow = false;
      stat("cageRing", geometry);
    }
    for (let ribIndex = 0; ribIndex < 6; ribIndex += 1) {
      const azimuth = Math.PI / 6 + ribIndex * Math.PI / 3;
      const radial = V3(Math.cos(azimuth), Math.sin(azimuth), 0);
      const coefficientA = Math.sin(azimuth) * Math.sin(tilt);
      const coefficientB = Math.cos(tilt);
      const phase = Math.atan2(coefficientA, coefficientB);
      const endAngle = phase + Math.acos(
        -D.dome.planeOffset /
          (cageRadius * Math.hypot(coefficientA, coefficientB)),
      );
      const points = [];
      const count = 46;
      for (let index = 0; index <= count; index += 1) {
        const t = index / count;
        const angle = lerp(0.1, endAngle, t);
        const radius = lerp(
          cageRadius,
          0.972,
          smooth01(Math.max(0, (t - 0.86) / 0.14)),
        );
        points.push(
          V3(0, 0, Math.cos(angle) * radius).addScaledVector(
            radial,
            Math.sin(angle) * radius,
          ),
        );
      }
      const geometry = sweepTube(
        points,
        (t) => lerp(0.013, 0.0095, t),
        10,
        { roundEnds: false },
      );
      M(geometry, MAT.brass, group, "cageRib").castShadow = false;
      stat("cageRib", geometry);
    }
    const boss = new THREE.Group();
    boss.position.z = cageRadius - 0.012;
    group.add(boss);
    const collarGeometry = latheZ([
      [0.012, -0.02], [0.075, -0.012], [0.085, 0.012],
      [0.07, 0.03], [0.028, 0.038],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 26);
    M(collarGeometry, MAT.brass, boss, "headlightRing");
    stat("headlightRing", collarGeometry);
    const lensGeometry = new THREE.SphereGeometry(
      0.055,
      22,
      12,
      0,
      TAU,
      0,
      Math.PI * 0.46,
    );
    const lens = M(lensGeometry, MAT.lampGlass, boss, "headlightLens");
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.02;
    lens.castShadow = false;
    M(new THREE.SphereGeometry(0.026, 10, 8), MAT.lampCore, boss).position.z = 0.02;
  }

  {
    const topPoint = V3().copy(rimCenter).addScaledVector(rimV, rimRadius + 0.01);
    const group = new THREE.Group();
    group.position.copy(topPoint);
    submarine.add(group);
    group.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(0, 1, 0.16).normalize());
    const baseGeometry = latheZ([
      [0.004, 0], [0.065, 0.006], [0.072, 0.022],
      [0.05, 0.036], [0.034, 0.05], [0.038, 0.062],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 26);
    M(baseGeometry, MAT.brass, group, "lanternBase");
    stat("lanternBase", baseGeometry);
    const drum = new THREE.CylinderGeometry(0.034, 0.037, 0.06, 20);
    const drumMesh = M(drum, MAT.lampGlass, group);
    drumMesh.rotation.x = Math.PI / 2;
    drumMesh.position.z = 0.092;
    drumMesh.castShadow = false;
    M(new THREE.SphereGeometry(0.018, 10, 8), MAT.lampCore, group).position.z = 0.092;
    const capGeometry = latheZ([
      [0.042, 0.125], [0.046, 0.135], [0.012, 0.152], [0.012, 0.16],
      [0.022, 0.175], [0.013, 0.19], [0.0015, 0.198],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 22);
    M(capGeometry, MAT.brass, group, "lanternCap");
    stat("lanternCap", capGeometry);
  }

  const cabin = new THREE.Group();
  submarine.add(cabin);
  let helmWheel = null;

  {
    const shape = new THREE.Shape();
    const radiusX = 0.6;
    const radiusZ = 0.82;
    const centerZ = 0.52;
    for (let index = 0; index <= 64; index += 1) {
      const angle = index / 64 * TAU;
      const x = Math.sin(angle) * radiusX;
      const z = centerZ + Math.cos(angle) * radiusZ * (
        1 - 0.12 * Math.abs(Math.cos(angle))
      );
      if (index) shape.lineTo(x, z);
      else shape.moveTo(x, z);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 8,
    });
    geometry.rotateX(Math.PI / 2);
    const deck = M(geometry, MAT.wood, cabin, "deck");
    deck.position.y = D.deck.y + 0.045;
    stat("deck", geometry);
    const rimPoints = [];
    for (let index = 0; index <= 72; index += 1) {
      const angle = index / 72 * TAU;
      rimPoints.push(V3(
        Math.sin(angle) * (radiusX + 0.008),
        D.deck.y + 0.03,
        centerZ + Math.cos(angle) * (radiusZ + 0.008) * (
          1 - 0.12 * Math.abs(Math.cos(angle))
        ),
      ));
    }
    const rimGeometry = sweepTube(rimPoints, 0.012, 10);
    M(rimGeometry, MAT.brass, cabin, "deckNosing");
    stat("deckNosing", rimGeometry);
  }

  {
    const seat = new THREE.Group();
    seat.position.set(D.seat.x, D.seat.y, D.seat.z);
    cabin.add(seat);
    const cushion = new RoundedBoxGeometry(0.47, 0.17, 0.45, 5, 0.065);
    M(cushion, MAT.leatherQ, seat, "seatCushion").position.set(0, 0.085, 0.02);
    stat("seatCushion", cushion);
    const back = new RoundedBoxGeometry(0.46, 0.64, 0.14, 5, 0.06);
    const backMesh = M(back, MAT.leatherQ, seat, "seatBack");
    backMesh.position.set(0, 0.42, -0.225);
    backMesh.rotation.x = -0.21;
    stat("seatBack", back);
    const headrest = new RoundedBoxGeometry(0.35, 0.2, 0.11, 4, 0.05);
    const headrestMesh = M(headrest, MAT.leatherPl, seat, "headrest");
    headrestMesh.position.set(0, 0.8, -0.3);
    headrestMesh.rotation.x = -0.26;
    stat("headrest", headrest);
    for (const side of [-1, 1]) {
      const point0 = V3(side * 0.265, 0.16, -0.2);
      const point1 = V3(side * 0.285, 0.3, -0.16);
      const point2 = V3(side * 0.285, 0.3, 0.14);
      const point3 = V3(side * 0.26, 0.22, 0.22);
      const curve = new THREE.CubicBezierCurve3(
        point0,
        point1,
        point2,
        point3,
      );
      const armGeometry = sweepTube(
        curve.getSpacedPoints(18),
        0.052,
        14,
        { roundEnds: true },
      );
      M(armGeometry, MAT.leatherPl, seat, "arm");
      stat("arm", armGeometry);
    }
    const pedestalGeometry = latheZ([
      [0.155, 0], [0.16, 0.02], [0.075, 0.05],
      [0.06, 0.14], [0.09, 0.19], [0.1, 0.21],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 26);
    const pedestal = M(pedestalGeometry, MAT.brassSatin, seat, "pedestal");
    pedestal.rotation.x = -Math.PI / 2;
    pedestal.position.y = -0.215;
    stat("pedestal", pedestalGeometry);
  }

  {
    const helm = new THREE.Group();
    helm.position.set(0, -0.16, 1.15);
    cabin.add(helm);
    helmWheel = new THREE.Group();
    helm.add(helmWheel);
    helmWheel.rotation.x = -0.42;
    const wheelRadius = 0.185;
    const wheelRim = [];
    for (let index = 0; index <= 64; index += 1) {
      const angle = index / 64 * TAU;
      wheelRim.push(V3(
        Math.cos(angle) * wheelRadius,
        Math.sin(angle) * wheelRadius,
        0,
      ));
    }
    const wheelRimGeometry = sweepTube(wheelRim, 0.0145, 12);
    M(wheelRimGeometry, MAT.brass, helmWheel, "wheelRim");
    stat("wheelRim", wheelRimGeometry);
    const hubGeometry = latheZ([
      [0.0015, 0.05], [0.03, 0.045], [0.045, 0.025],
      [0.045, -0.01], [0.028, -0.028], [0.0015, -0.032],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 20);
    M(hubGeometry, MAT.brass, helmWheel, "wheelHub");
    stat("wheelHub", hubGeometry);
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * TAU;
      const direction = V3(Math.cos(angle), Math.sin(angle), 0);
      const spokeGeometry = sweepTube(
        [
          direction.clone().multiplyScalar(0.03),
          direction.clone().multiplyScalar(wheelRadius),
        ],
        (t) => lerp(0.0095, 0.007, t),
        8,
      );
      M(spokeGeometry, MAT.brass, helmWheel);
      const knobGeometry = latheZ([
        [0.0015, 0], [0.009, 0.008], [0.0115, 0.03],
        [0.0085, 0.052], [0.0125, 0.062], [0.0015, 0.075],
      ].map((point) => new THREE.Vector2(point[0], point[1])), 12);
      const knob = M(knobGeometry, MAT.brass, helmWheel);
      knob.position.copy(direction.clone().multiplyScalar(wheelRadius));
      knob.quaternion.setFromUnitVectors(
        V3(0, 0, 1),
        V3(direction.x, direction.y, 0),
      );
    }
    const columnCurve = new THREE.CubicBezierCurve3(
      V3(0, 0, 0.02),
      V3(0, -0.08, 0.06),
      V3(0, -0.2, 0.09),
      V3(0, -0.36, 0.05),
    );
    const columnGeometry = sweepTube(
      columnCurve.getSpacedPoints(16),
      (t) => lerp(0.024, 0.038, t),
      14,
    );
    M(columnGeometry, MAT.brassSatin, helm, "column");
    stat("column", columnGeometry);
    const footGeometry = latheZ([
      [0.09, 0], [0.085, 0.015], [0.045, 0.03], [0.04, 0.05],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 20);
    const foot = M(footGeometry, MAT.brassSatin, helm);
    foot.rotation.x = -Math.PI / 2;
    foot.position.set(0, -0.36, 0.05);
    for (const side of [-1, 1]) {
      const gauge = new THREE.Group();
      gauge.position.set(side * 0.075, -0.1, 0.1);
      helm.add(gauge);
      gauge.rotation.set(-0.5, 0, 0);
      const gaugeRimGeometry = latheZ([
        [0.012, 0], [0.048, 0.004], [0.052, 0.018], [0.044, 0.03],
      ].map((point) => new THREE.Vector2(point[0], point[1])), 20);
      M(gaugeRimGeometry, MAT.brass, gauge);
      const faceGeometry = new THREE.CircleGeometry(0.041, 24);
      const face = M(faceGeometry, MAT.gauge, gauge);
      face.position.z = 0.022;
      face.castShadow = false;
    }
    const leverGroup = new THREE.Group();
    leverGroup.position.set(0.3, -0.36, 0.72);
    cabin.add(leverGroup);
    const quadrant = arcPath(
      V3(0, 0, 0),
      V3(0, 1, 0),
      V3(0, 0, 1),
      0.09,
      -0.5,
      0.9,
      14,
    );
    const quadrantGeometry = sweepTube(
      quadrant,
      0.008,
      8,
      { roundEnds: true },
    );
    M(quadrantGeometry, MAT.brass, leverGroup);
    stat("lever", quadrantGeometry);
    const leverGeometry = sweepTube(
      [V3(0, 0, 0), V3(0, 0.16, 0.05)],
      (t) => lerp(0.011, 0.007, t),
      8,
    );
    M(leverGeometry, MAT.brassSatin, leverGroup);
    M(
      new THREE.SphereGeometry(0.018, 12, 10),
      MAT.brass,
      leverGroup,
    ).position.set(0, 0.165, 0.052);
    const leverBaseGeometry = latheZ([
      [0.05, 0], [0.045, 0.012], [0.02, 0.02], [0.018, 0.05],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 16);
    const leverBase = M(leverBaseGeometry, MAT.brassSatin, leverGroup);
    leverBase.rotation.x = -Math.PI / 2;
  }

  {
    const glow = new THREE.PointLight(0xffdcae, 0.38, 2.6, 2);
    glow.position.set(0, 0.25, 0.75);
    submarine.add(glow);
  }

  let propeller = null;
  const tailY = 0.075;
  {
    const profile = splinePts([
      [D.hull.tailR, 0], [0.272, -0.13], [0.205, -0.27],
      [0.148, -0.37], [D.tail.tipR, -0.44],
    ], 30).map((point) =>
      new THREE.Vector2(point.x, D.tail.collarZ + point.y - 0)
    );
    const geometry = latheZ(profile, 64, { flip: true });
    const tailCone = M(geometry, MAT.porcelain, submarine, "tailCone");
    tailCone.position.y = 0;
    stat("tailCone", geometry);
    tailCone.position.set(0, tailY, 0);
    const firstCollar = ringPoints(
      V3(0, tailY, D.tail.collarZ + 0.005),
      V3(1, 0, 0),
      V3(0, 1, 0),
      D.hull.tailR + 0.006,
      60,
    );
    firstCollar.push(firstCollar[0].clone());
    const firstCollarGeometry = sweepTube(firstCollar, 0.024, 12);
    M(firstCollarGeometry, MAT.brass, submarine, "tailCollarA");
    stat("tailCollarA", firstCollarGeometry);
    const secondCollar = ringPoints(
      V3(0, tailY, D.tail.tipZ + 0.01),
      V3(1, 0, 0),
      V3(0, 1, 0),
      D.tail.tipR + 0.012,
      40,
    );
    secondCollar.push(secondCollar[0].clone());
    const secondCollarGeometry = sweepTube(secondCollar, 0.02, 12);
    M(secondCollarGeometry, MAT.brass, submarine, "tailCollarB");
    stat("tailCollarB", secondCollarGeometry);
  }

  {
    const sectionCount = 36;
    const aroundCount = 110;
    const rows = [];
    for (let index = 0; index <= sectionCount; index += 1) {
      const angle = index / sectionCount * TAU + Math.PI * 0.75;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const radialOffset = 0.5 * D.tail.ringW * Math.sign(cosine) *
        Math.pow(Math.abs(cosine), 0.72);
      const zOffset = 0.5 * D.tail.ringD * Math.sign(sine) *
        Math.pow(Math.abs(sine), 0.72);
      rows.push(ringPoints(
        V3(0, tailY, D.tail.ringZ + zOffset),
        V3(1, 0, 0),
        V3(0, 1, 0),
        D.tail.ringR + radialOffset,
        aroundCount,
      ));
    }
    const geometry = gridGeometry(rows, { closeU: true, flip: false });
    M(geometry, MAT.porcelain, submarine, "shroud");
    stat("shroud", geometry);
    for (const zOffset of [D.tail.ringD * 0.34, -D.tail.ringD * 0.34]) {
      for (const radialOffset of [D.tail.ringW * 0.42]) {
        const ring = ringPoints(
          V3(0, tailY, D.tail.ringZ + zOffset),
          V3(1, 0, 0),
          V3(0, 1, 0),
          D.tail.ringR + radialOffset + 0.028,
          100,
        );
        ring.push(ring[0].clone());
        const trimGeometry = sweepTube(ring, 0.009, 8);
        M(trimGeometry, MAT.brass, submarine, "shroudTrim");
        stat("shroudTrim", trimGeometry);
      }
    }
    const crestGeometry = latheZ([
      [0.004, 0], [0.05, 0.008], [0.056, 0.02], [0.024, 0.035],
      [0.014, 0.1], [0.028, 0.115], [0.012, 0.15], [0.0015, 0.185],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 20);
    const crest = M(crestGeometry, MAT.brass, submarine, "crest");
    stat("crest", crestGeometry);
    crest.position.set(
      0,
      tailY + D.tail.ringR + D.tail.ringW * 0.42,
      D.tail.ringZ,
    );
    crest.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(0, 1, 0));
  }

  for (let strutIndex = 0; strutIndex < 4; strutIndex += 1) {
    const angle = Math.PI / 4 + strutIndex * Math.PI / 2;
    const direction = V3(Math.cos(angle), Math.sin(angle), 0);
    const stations = [];
    for (let index = 0; index <= 4; index += 1) {
      const t = index / 4;
      const radius = lerp(0.13, D.tail.ringR - 0.04, t);
      const centerZ = lerp(-1.6, D.tail.ringZ, t);
      const center = V3(
        direction.x * radius,
        tailY + direction.y * radius,
        centerZ,
      );
      const chord = lerp(0.1, 0.062, t);
      const thickness = lerp(0.032, 0.018, t);
      stations.push({
        le: V3(center.x, center.y, center.z + chord / 2),
        te: V3(center.x, center.y, center.z - chord / 2),
        up: V3(-direction.y, direction.x, 0),
        thick: thickness,
      });
    }
    const geometry = finLoft(stations, 26, { flip: false });
    M(geometry, MAT.brassSatin, submarine, "strut");
    stat("strut", geometry);
  }

  {
    propeller = new THREE.Group();
    propeller.position.set(0, tailY, -1.745);
    submarine.add(propeller);
    const hubGeometry = latheZ([
      [0.0015, -0.215], [0.045, -0.2], [0.08, -0.16],
      [0.105, -0.1], [0.115, -0.03], [0.108, 0],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 30, {
      flip: false,
    });
    M(hubGeometry, MAT.brass, propeller, "propHub");
    stat("propHub", hubGeometry);
    const stationCount = 8;
    const bladeStations = [];
    for (let index = 0; index <= stationCount; index += 1) {
      const t = index / stationCount;
      const radius = lerp(0.1, D.tail.prop.r, t);
      const chord = 0.135 * Math.pow(
        Math.sin(Math.PI * Math.min(t * 0.94 + 0.05, 1)),
        0.6,
      ) + 0.018;
      const pitch = lerp(0.95, 0.5, t);
      const radial = V3(1, 0, 0);
      const tangent = V3(0, 1, 0);
      const chordDirection = V3()
        .addScaledVector(tangent, Math.cos(pitch))
        .addScaledVector(V3(0, 0, 1), Math.sin(pitch))
        .normalize();
      const center = V3(radius, 0, -0.075);
      bladeStations.push({
        le: center.clone().addScaledVector(chordDirection, chord / 2),
        te: center.clone().addScaledVector(chordDirection, -chord / 2),
        up: V3().crossVectors(radial, chordDirection).normalize(),
        thick: lerp(0.02, 0.01, t),
      });
    }
    const bladeGeometry = finLoft(bladeStations, 22, { flip: true });
    stat("blade×8", bladeGeometry);
    for (let index = 0; index < 8; index += 1) {
      const blade = M(bladeGeometry, MAT.brass, propeller, "blade");
      blade.rotation.z = index / 8 * TAU;
    }
    const halo = ringPoints(
      V3(0, 0, -0.075),
      V3(1, 0, 0),
      V3(0, 1, 0),
      D.tail.prop.r + 0.012,
      80,
    );
    halo.push(halo[0].clone());
    const haloGeometry = sweepTube(halo, 0.011, 10);
    M(haloGeometry, MAT.brass, propeller, "propHalo");
    stat("propHalo", haloGeometry);
    const lampRingGeometry = latheZ([
      [0.02, -0.26], [0.052, -0.245], [0.058, -0.225], [0.05, -0.21],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 20);
    M(lampRingGeometry, MAT.brass, propeller);
    stat("hubLampRing", lampRingGeometry);
    const bulbGeometry = new THREE.SphereGeometry(0.042, 18, 12);
    const bulb = M(bulbGeometry, MAT.lampGlass, propeller);
    bulb.position.z = -0.235;
    bulb.castShadow = false;
    M(
      new THREE.SphereGeometry(0.02, 10, 8),
      MAT.lampCore,
      propeller,
    ).position.z = -0.235;
  }

  {
    const geometry = latheZ([
      [0.012, -1.95], [0.052, -1.965], [0.058, -1.99], [0.03, -2.02],
      [0.022, -2.1], [0.03, -2.12], [0.022, -2.14], [0.008, -2.24],
      [0.016, -2.265], [0.0015, -2.3],
    ].map((point) => new THREE.Vector2(point[0], point[1])), 22, {
      flip: true,
    });
    const spike = M(geometry, MAT.brass, submarine, "spike");
    spike.position.y = tailY;
    stat("spike", geometry);
  }

  function buildPod(scale = 1) {
    const pod = new THREE.Group();
    const profile = splinePts([
      [0.0015, 0.27], [0.052, 0.22], [0.092, 0.12], [0.105, 0],
      [0.09, -0.11], [0.068, -0.175], [0.054, -0.205],
    ], 24).map((point) => new THREE.Vector2(point.x * scale, point.y * scale));
    const geometry = latheZ(profile, 30, { flip: true });
    M(geometry, MAT.porcelain, pod, "pod");
    stat("pod", geometry);
    const noseGeometry = latheZ([
      [0.0015, 0.275], [0.036, 0.235], [0.055, 0.19],
    ].map((point) =>
      new THREE.Vector2(point[0] * scale, point[1] * scale)
    ), 20, { flip: true });
    M(noseGeometry, MAT.brass, pod, "podNose");
    const band = ringPoints(
      V3(0, 0, 0.06 * scale),
      V3(1, 0, 0),
      V3(0, 1, 0),
      0.1035 * scale,
      26,
    );
    band.push(band[0].clone());
    const bandGeometry = sweepTube(band, 0.006 * scale, 8);
    M(bandGeometry, MAT.brass, pod);
    const lampRingGeometry = latheZ([
      [0.028, -0.24], [0.054, -0.225], [0.058, -0.205], [0.05, -0.195],
    ].map((point) =>
      new THREE.Vector2(point[0] * scale, point[1] * scale)
    ), 18);
    M(lampRingGeometry, MAT.brass, pod);
    const bulbGeometry = new THREE.SphereGeometry(0.042 * scale, 16, 12);
    const bulb = M(bulbGeometry, MAT.lampGlass, pod);
    bulb.position.z = -0.225 * scale;
    bulb.castShadow = false;
    M(
      new THREE.SphereGeometry(0.02 * scale, 10, 8),
      MAT.lampCore,
      pod,
    ).position.z = -0.225 * scale;
    return pod;
  }

  function buildFin() {
    const fin = new THREE.Group();
    const finDimensions = D.finH;
    const rootX = 0.72;
    const tipX = 1.25;
    const stationCount = 8;
    const stations = [];
    const leadingEdgeZ = (t) => lerp(
      finDimensions.rootZ0,
      finDimensions.tipZ0,
      smooth01(t) * 0.9 + t * 0.1,
    );
    const trailingEdgeZ = (t) => lerp(
      finDimensions.rootZ1,
      finDimensions.tipZ1,
      t,
    );
    for (let index = 0; index <= stationCount; index += 1) {
      const t = index / stationCount;
      const x = lerp(rootX, tipX, t);
      const y = 0.01 + Math.sin(finDimensions.dihedral) * (x - rootX);
      let leadingZ = leadingEdgeZ(t);
      let trailingZ = trailingEdgeZ(t);
      if (index === stationCount) {
        const middle = (leadingZ + trailingZ) / 2;
        const half = (trailingZ - leadingZ) / 2 * 0.42;
        leadingZ = middle - half;
        trailingZ = middle + half;
      }
      stations.push({
        le: V3(x, y, leadingZ),
        te: V3(x, y, trailingZ),
        up: V3(0, 1, 0),
        thick: lerp(0.075, 0.026, Math.pow(t, 0.8)),
      });
    }
    const geometry = finLoft(stations, 34, { flip: true });
    M(geometry, MAT.porcelain, fin, "fin");
    stat("fin", geometry);
    const edge = [];
    for (let index = 0; index <= stationCount; index += 1) {
      edge.push(V3(
        stations[index].le.x,
        stations[index].le.y,
        stations[index].le.z,
      ));
    }
    for (let index = stationCount; index >= 0; index -= 1) {
      edge.push(V3(
        stations[index].te.x,
        stations[index].te.y,
        stations[index].te.z,
      ));
    }
    const edgeGeometry = sweepTube(edge, 0.0075, 8, { roundEnds: true });
    M(edgeGeometry, MAT.brass, fin, "finEdge");
    stat("finEdge", edgeGeometry);
    const inset = [];
    for (let index = 0; index <= stationCount; index += 1) {
      const station = stations[index];
      inset.push(V3(
        station.le.x,
        station.le.y + station.thick * 0.5 + 0.002,
        lerp(station.le.z, station.te.z, 0.22),
      ));
    }
    const lineGeometry = sweepTube(inset, 0.0045, 6, { roundEnds: true });
    M(lineGeometry, MAT.brass, fin, "finLine");
    stat("finLine", lineGeometry);
    const pod = buildPod(1);
    pod.position.set(
      tipX + 0.02,
      0.01 + Math.sin(finDimensions.dihedral) * (tipX - rootX),
      -1.42,
    );
    fin.add(pod);
    return fin;
  }

  {
    const rightFin = buildFin();
    submarine.add(rightFin);
    const leftFin = buildFin();
    leftFin.scale.x = -1;
    submarine.add(leftFin);
    for (const side of [-1, 1]) {
      const lowerFin = buildFin();
      lowerFin.scale.set(side * 0.56, 0.56, 0.78);
      lowerFin.position.set(0, tailY - 0.02, -0.42);
      lowerFin.rotation.z = -side * THREE.MathUtils.degToRad(55);
      submarine.add(lowerFin);
    }
  }

  const geometrySet = new Set();
  submarine.traverse((object) => {
    if (object.geometry) geometrySet.add(object.geometry);
  });
  const totalTriangles = stats.reduce((total, entry) => total + entry.tris, 0);

  return {
    object: submarine,
    materials: MAT,
    stats,
    totalTriangles,
    hullPlan,
    update({ delta = 0, elapsed = 0, propellerSpeed = 1.1, buoyancy = 1 } = {}) {
      if (propeller) propeller.rotation.z += delta * propellerSpeed;
      if (helmWheel) helmWheel.rotation.z = Math.sin(elapsed * 0.22) * 0.35;
      submarine.position.y = Math.sin(elapsed * 0.5) * 0.012 * buoyancy;
      submarine.rotation.z = Math.sin(elapsed * 0.33) * 0.005 * buoyancy;
      submarine.rotation.x = Math.sin(elapsed * 0.41) * 0.004 * buoyancy;
    },
    dispose() {
      for (const geometry of geometrySet) geometry.dispose();
      for (const material of Object.values(MAT)) material.dispose();
      for (const texture of materialBundle.textures) texture.dispose();
    },
  };
}
