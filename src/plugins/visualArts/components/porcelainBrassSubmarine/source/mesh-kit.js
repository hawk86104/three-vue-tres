import * as THREE from "three/webgpu";

export const TAU = Math.PI * 2;
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const lerp = THREE.MathUtils.lerp;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smooth01(t) {
  return t * t * (3 - 2 * t);
}

export function splinePts(controlPoints, count) {
  const curve = new THREE.CatmullRomCurve3(
    controlPoints.map((point) => V3(point[0], point[1], 0)),
  );
  curve.curveType = "centripetal";
  return curve
    .getSpacedPoints(count)
    .map((point) => new THREE.Vector2(point.x, point.y));
}

function transportFrames(points) {
  const tangents = [];
  const normals = [];
  const binormals = [];
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(count - 1, index + 1)];
    tangents.push(V3().subVectors(next, previous).normalize());
  }
  let normal = Math.abs(tangents[0].y) < 0.94 ? V3(0, 1, 0) : V3(1, 0, 0);
  normal = V3()
    .crossVectors(
      tangents[0],
      V3().crossVectors(normal, tangents[0]),
    )
    .normalize();
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      const axis = V3().crossVectors(tangents[index - 1], tangents[index]);
      if (axis.length() > 1e-6) {
        axis.normalize();
        const angle = Math.acos(
          THREE.MathUtils.clamp(
            tangents[index - 1].dot(tangents[index]),
            -1,
            1,
          ),
        );
        normal = normal.clone().applyAxisAngle(axis, angle);
      }
    }
    normals.push(normal.clone());
    binormals.push(V3().crossVectors(tangents[index], normal).normalize());
  }
  return { tangents, normals, binormals };
}

export function gridGeometry(
  rows,
  { closeU = true, flip = false, vRow = null, uOffset = 0 } = {},
) {
  const rowCount = rows.length;
  const columnCount = rows[0].length;
  const emittedColumns = closeU ? columnCount + 1 : columnCount;
  const positions = new Float32Array(rowCount * emittedColumns * 3);
  const normals = new Float32Array(rowCount * emittedColumns * 3);
  const uvs = new Float32Array(rowCount * emittedColumns * 2);
  const wrap = (column) => ((column % columnCount) + columnCount) % columnCount;
  const pointAt = (row, column) => rows[row][
    closeU
      ? wrap(column)
      : THREE.MathUtils.clamp(column, 0, columnCount - 1)
  ];

  const dU = V3();
  const dV = V3();
  const normal = V3();
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < emittedColumns; column += 1) {
      const point = pointAt(row, column);
      const vertex = row * emittedColumns + column;
      positions[vertex * 3] = point.x;
      positions[vertex * 3 + 1] = point.y;
      positions[vertex * 3 + 2] = point.z;

      dU.subVectors(pointAt(row, column + 1), pointAt(row, column - 1));
      dV.subVectors(
        pointAt(Math.min(rowCount - 1, row + 1), column),
        pointAt(Math.max(0, row - 1), column),
      );
      normal.crossVectors(dU, dV);
      if (normal.lengthSq() < 1e-12) {
        const previousCenter = V3();
        const nextCenter = V3();
        const previousRow = Math.max(0, row - 1);
        const nextRow = Math.min(rowCount - 1, row + 1);
        for (const pointInRow of rows[previousRow]) previousCenter.add(pointInRow);
        previousCenter.divideScalar(columnCount);
        for (const pointInRow of rows[nextRow]) nextCenter.add(pointInRow);
        nextCenter.divideScalar(columnCount);
        normal.subVectors(previousCenter, nextCenter);
        if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
      }
      normal.normalize();
      if (flip) normal.negate();
      normals[vertex * 3] = normal.x;
      normals[vertex * 3 + 1] = normal.y;
      normals[vertex * 3 + 2] = normal.z;

      uvs[vertex * 2] = uOffset + column / (emittedColumns - 1);
      uvs[vertex * 2 + 1] = vRow ? vRow[row] : row / (rowCount - 1);
    }
  }

  const indices = [];
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (let column = 0; column < emittedColumns - 1; column += 1) {
      const a = row * emittedColumns + column;
      const b = a + 1;
      const c = a + emittedColumns;
      const d = c + 1;
      if (flip) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function ringPoints(center, axisU, axisV, radius, segments, phase = 0) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = phase + (index / segments) * TAU;
    points.push(
      V3()
        .copy(center)
        .addScaledVector(axisU, Math.sin(angle) * radius)
        .addScaledVector(axisV, -Math.cos(angle) * radius),
    );
  }
  return points;
}

export function latheZ(profile, segments = 48, { flip = false } = {}) {
  const rows = profile.map((point) =>
    ringPoints(
      V3(0, 0, point.y),
      V3(1, 0, 0),
      V3(0, 1, 0),
      Math.max(point.x, 0.0015),
      segments,
    )
  );
  const vRow = [0];
  let accumulatedLength = 0;
  for (let index = 1; index < profile.length; index += 1) {
    accumulatedLength += Math.hypot(
      profile[index].x - profile[index - 1].x,
      profile[index].y - profile[index - 1].y,
    );
    vRow.push(accumulatedLength);
  }
  for (let index = 0; index < vRow.length; index += 1) {
    vRow[index] /= accumulatedLength || 1;
  }
  return gridGeometry(rows, { closeU: true, flip, vRow });
}

export function sweepTube(
  path,
  radiusFunction,
  radialSegments = 14,
  { roundEnds = false, flip = false } = {},
) {
  const points = path;
  const radiusAt = typeof radiusFunction === "number"
    ? () => radiusFunction
    : radiusFunction;
  if (roundEnds) {
    const capSegments = 5;
    const first = points[0];
    const second = points[1];
    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const startDirection = V3().subVectors(first, second).normalize();
    const endDirection = V3().subVectors(last, previous).normalize();
    const startRadius = radiusAt(0);
    const endRadius = radiusAt(1);
    const head = [];
    const tail = [];
    for (let index = capSegments; index >= 1; index -= 1) {
      const angle = (index / capSegments) * Math.PI / 2;
      head.push({
        p: V3().copy(first).addScaledVector(
          startDirection,
          Math.sin(angle) * startRadius,
        ),
        s: Math.cos(angle),
      });
      tail.push({
        p: V3().copy(last).addScaledVector(
          endDirection,
          Math.sin(angle) * endRadius,
        ),
        s: Math.cos(angle),
      });
    }
    const middle = points.map((point) => ({ p: point.clone(), s: 1 }));
    const sequence = [...head, ...middle, ...tail.reverse()];
    const frames = transportFrames(sequence.map((entry) => entry.p));
    const rows = sequence.map((entry, index) => {
      const t = THREE.MathUtils.clamp(
        (index - capSegments) / (points.length - 1),
        0,
        1,
      );
      return ringPoints(
        entry.p,
        frames.normals[index],
        frames.binormals[index],
        Math.max(radiusAt(t) * entry.s, 0.0012),
        radialSegments,
      );
    });
    return gridGeometry(rows, { closeU: true, flip });
  }

  const frames = transportFrames(points);
  const rows = points.map((point, index) =>
    ringPoints(
      point,
      frames.normals[index],
      frames.binormals[index],
      Math.max(radiusAt(index / (points.length - 1)), 0.0012),
      radialSegments,
    )
  );
  return gridGeometry(rows, { closeU: true, flip });
}

export function arcPath(center, axisU, axisV, radius, start, end, segments = 32) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = lerp(start, end, index / segments);
    points.push(
      V3()
        .copy(center)
        .addScaledVector(axisU, Math.cos(angle) * radius)
        .addScaledVector(axisV, Math.sin(angle) * radius),
    );
  }
  return points;
}

export function finLoft(stations, sectionSegments = 40, { flip = false } = {}) {
  const rows = stations.map((station) => {
    const loop = [];
    for (let index = 0; index < sectionSegments; index += 1) {
      const angle = (index / sectionSegments) * TAU;
      const chordPosition = 0.5 - 0.5 * Math.cos(angle);
      const side = Math.sin(angle);
      const width = station.thick * Math.pow(
        Math.max(Math.sin(Math.PI * Math.pow(chordPosition, 0.85)), 0),
        0.62,
      );
      loop.push(
        V3()
          .lerpVectors(station.le, station.te, chordPosition)
          .addScaledVector(station.up, side * width * 0.5),
      );
    }
    return loop;
  });
  return gridGeometry(rows, { closeU: true, flip });
}

export function createMesh(geometry, material, parent, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  if (parent) parent.add(mesh);
  return mesh;
}
