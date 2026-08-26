import * as THREE from "three";

const TAU = Math.PI * 2;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianPair(random) {
  const u1 = Math.max(random(), 1e-7);
  const u2 = random();
  const radius = Math.sqrt(-2 * Math.log(u1));
  return [
    radius * Math.cos(TAU * u2),
    radius * Math.sin(TAU * u2),
  ];
}

function dispersion(k, gravity, depth) {
  return Math.sqrt(gravity * k * Math.tanh(Math.min(k * depth, 20)));
}

function dispersionDerivative(k, gravity, depth) {
  const kh = k * depth;
  const tanhKh = Math.tanh(Math.min(kh, 20));
  const coshKh = Math.cosh(Math.min(kh, 20));
  const omega = dispersion(k, gravity, depth);
  return (
    gravity *
    (tanhKh + (depth * k) / (coshKh * coshKh)) /
    Math.max(2 * omega, 1e-6)
  );
}

function tmaCorrection(omega, gravity, depth) {
  const value = omega * Math.sqrt(depth / gravity);
  if (value <= 1) return 0.5 * value * value;
  if (value < 2) {
    const remaining = 2 - value;
    return 1 - 0.5 * remaining * remaining;
  }
  return 1;
}

function spectrumParameters(input, gravity) {
  return {
    ...input,
    angle: THREE.MathUtils.degToRad(input.directionDegrees),
    alpha:
      0.076 *
      Math.pow(
        (gravity * input.fetchMeters) /
          (input.windSpeed * input.windSpeed),
        -0.22,
      ),
    peakOmega:
      22 *
      Math.pow(
        (input.windSpeed * input.fetchMeters) /
          (gravity * gravity),
        -0.33,
      ),
  };
}

function jonswap(omega, gravity, depth, parameters) {
  const safeOmega = Math.max(omega, 1e-4);
  const sigma = safeOmega <= parameters.peakOmega ? 0.07 : 0.09;
  const normalized =
    (safeOmega - parameters.peakOmega) /
    Math.max(
      sigma * parameters.peakOmega * Math.SQRT2,
      1e-5,
    );
  const peakShape = Math.exp(-normalized * normalized);
  const peakRatio = parameters.peakOmega / safeOmega;
  return (
    parameters.scale *
    tmaCorrection(safeOmega, gravity, depth) *
    parameters.alpha *
    gravity *
    gravity *
    Math.pow(safeOmega, -5) *
    Math.exp(-1.25 * Math.pow(peakRatio, 4)) *
    Math.pow(parameters.peakEnhancement, peakShape)
  );
}

function normalizationFactor(power) {
  const s2 = power * power;
  const s3 = s2 * power;
  const s4 = s3 * power;
  if (power < 5) {
    return (
      -0.000564 * s4 +
      0.00776 * s3 -
      0.044 * s2 +
      0.192 * power +
      0.163
    );
  }
  return (
    -4.8e-8 * s4 +
    1.07e-5 * s3 -
    9.53e-4 * s2 +
    5.9e-2 * power +
    0.393
  );
}

function directionalSpread(theta, omega, parameters) {
  const ratio = Math.max(omega / parameters.peakOmega, 1e-4);
  const power =
    (ratio <= 1
      ? 6.97 * Math.pow(ratio, 5)
      : 9.77 * Math.pow(ratio, -2.5)) +
    16 *
      Math.tanh(Math.min(ratio, 20)) *
      parameters.swell *
      parameters.swell;
  const broad = (2 / Math.PI) * Math.cos(theta) ** 2;
  const directed =
    normalizationFactor(power) *
    Math.pow(
      Math.abs(Math.cos((theta - parameters.angle) * 0.5)),
      2 * power,
    );
  return THREE.MathUtils.lerp(
    broad,
    directed,
    parameters.directionality,
  );
}

function directionalEnergy(k, angle, gravity, depth, parameters) {
  const omega = dispersion(k, gravity, depth);
  const shortWaveFade = Math.exp(
    -parameters.shortWaveFade *
      parameters.shortWaveFade *
      k *
      k,
  );
  return (
    jonswap(omega, gravity, depth, parameters) *
    directionalSpread(angle, omega, parameters) *
    shortWaveFade
  );
}

export function createSpectrumTexture({
  resolution,
  patchLength,
  cutoffLow,
  cutoffHigh,
  seed,
  gravity,
  depth,
  local,
  swell,
}) {
  const random = mulberry32(seed);
  const deltaK = TAU / patchLength;
  const h0 = new Float32Array(resolution * resolution * 2);
  const localParameters = spectrumParameters(local, gravity);
  const swellParameters = spectrumParameters(swell, gravity);

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = y * resolution + x;
      const kx = (x - resolution * 0.5) * deltaK;
      const kz = (y - resolution * 0.5) * deltaK;
      const k = Math.hypot(kx, kz);
      if (k < cutoffLow || k > cutoffHigh) continue;

      const angle = Math.atan2(kz, kx);
      const energy =
        directionalEnergy(
          k,
          angle,
          gravity,
          depth,
          localParameters,
        ) +
        directionalEnergy(
          k,
          angle,
          gravity,
          depth,
          swellParameters,
        );
      const derivative = Math.abs(
        dispersionDerivative(k, gravity, depth),
      );
      const amplitude = Math.sqrt(
        Math.max(
          energy *
            2 *
            derivative *
            deltaK *
            deltaK /
            Math.max(k, 1e-4),
          0,
        ),
      );
      const [gaussianReal, gaussianImaginary] = gaussianPair(random);
      h0[index * 2] = gaussianReal * amplitude;
      h0[index * 2 + 1] = gaussianImaginary * amplitude;
    }
  }

  const packed = new Float32Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const index = y * resolution + x;
      const mirroredX = (resolution - x) % resolution;
      const mirroredY = (resolution - y) % resolution;
      const mirrored = mirroredY * resolution + mirroredX;
      packed[index * 4] = h0[index * 2];
      packed[index * 4 + 1] = h0[index * 2 + 1];
      packed[index * 4 + 2] = h0[mirrored * 2];
      packed[index * 4 + 3] = -h0[mirrored * 2 + 1];
    }
  }

  const texture = new THREE.DataTexture(
    packed,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
