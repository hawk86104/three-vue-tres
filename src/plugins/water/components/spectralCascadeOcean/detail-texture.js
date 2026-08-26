import * as THREE from "three";

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function createRandomField(size, seed) {
  const values = new Float32Array(size * size);
  let state = seed >>> 0;
  for (let index = 0; index < values.length; index += 1) {
    state = Math.imul(1664525, state) + 1013904223;
    values[index] = (state >>> 0) / 4294967296;
  }
  return values;
}

function samplePeriodic(field, size, u, v, frequency) {
  const x = u * frequency;
  const y = v * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const sample = (ix, iy) => {
    const wrappedX = ((ix % frequency) + frequency) % frequency;
    const wrappedY = ((iy % frequency) + frequency) % frequency;
    return field[wrappedY * size + wrappedX];
  };
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(sample(x0, y0), sample(x0 + 1, y0), tx),
    THREE.MathUtils.lerp(
      sample(x0, y0 + 1),
      sample(x0 + 1, y0 + 1),
      tx,
    ),
    ty,
  );
}

function periodicFbm(field, size, u, v) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 4;
  for (let octave = 0; octave < 4; octave += 1) {
    value += samplePeriodic(field, size, u, v, frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / 0.9375;
}

export function createOceanDetailTexture(size = 512, seed = 0x1f2e3d4c) {
  const field = createRandomField(size, seed);
  const data = new Uint8Array(size * size * 4);
  const pixel = 1 / size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const height = periodicFbm(field, size, u, v);
      const dx =
        periodicFbm(field, size, u + pixel, v) -
        periodicFbm(field, size, u - pixel, v);
      const dy =
        periodicFbm(field, size, u, v + pixel) -
        periodicFbm(field, size, u, v - pixel);
      const fine = periodicFbm(
        field,
        size,
        (u * 2) % 1,
        (v * 2) % 1,
      );
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(
        THREE.MathUtils.clamp(0.5 - dx * 1.5, 0, 1) * 255,
      );
      data[offset + 1] = Math.round(
        THREE.MathUtils.clamp(0.5 - dy * 1.5, 0, 1) * 255,
      );
      data[offset + 2] = Math.round(height * 255);
      data[offset + 3] = Math.round(fine * 255);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
