import * as THREE from "three";

const vertexShader = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createTarget(
  resolution,
  {
    type = THREE.HalfFloatType,
    filter = THREE.NearestFilter,
  } = {},
) {
  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    type,
    format: THREE.RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  return target;
}

export class FragmentIFFT {
  constructor(
    renderer,
    resolution,
    { type = THREE.HalfFloatType } = {},
  ) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.logResolution = Math.log2(resolution);
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.mesh);
    this.ping = createTarget(resolution, { type });
    this.pong = createTarget(resolution, { type });
    this.output = createTarget(resolution, { type });

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        inputTexture: { value: null },
        stage: { value: 0 },
        axis: { value: 0 },
        operation: { value: 0 },
      },
      defines: {
        FFT_SIZE: resolution,
        FFT_LOG_SIZE: this.logResolution,
      },
      vertexShader,
      fragmentShader: `
        precision highp float;
        precision highp int;
        uniform sampler2D inputTexture;
        uniform int stage;
        uniform int axis;
        uniform int operation;
        out vec4 outputColor;

        vec2 complexMultiply(vec2 a, vec2 b) {
          return vec2(
            a.x * b.x - a.y * b.y,
            a.x * b.y + a.y * b.x
          );
        }

        int reverseBits(int value) {
          int reversed = 0;
          for (int bit = 0; bit < FFT_LOG_SIZE; bit++) {
            reversed = (reversed << 1) | (value & 1);
            value >>= 1;
          }
          return reversed;
        }

        vec4 readCell(ivec2 coordinate) {
          return texelFetch(inputTexture, coordinate, 0);
        }

        vec2 butterfly(vec2 a, vec2 b, float angle, bool subtractBranch) {
          vec2 twiddle = vec2(cos(angle), sin(angle));
          vec2 weighted = complexMultiply(twiddle, b);
          return subtractBranch ? a - weighted : a + weighted;
        }

        void main() {
          ivec2 cell = ivec2(gl_FragCoord.xy);

          if (operation == 0) {
            ivec2 sourceCell = cell;
            if (axis == 0) sourceCell.x = reverseBits(cell.x);
            else sourceCell.y = reverseBits(cell.y);
            outputColor = readCell(sourceCell);
            return;
          }

          if (operation == 1) {
            int coordinate = axis == 0 ? cell.x : cell.y;
            int span = 1 << (stage + 1);
            int halfSpan = span >> 1;
            int local = coordinate & (span - 1);
            int offset = local & (halfSpan - 1);
            int base = coordinate - local;
            int indexA = base + offset;
            int indexB = indexA + halfSpan;
            ivec2 cellA = cell;
            ivec2 cellB = cell;
            if (axis == 0) {
              cellA.x = indexA;
              cellB.x = indexB;
            } else {
              cellA.y = indexA;
              cellB.y = indexB;
            }
            vec4 a = readCell(cellA);
            vec4 b = readCell(cellB);
            float angle =
              6.28318530718 * float(offset) / float(span);
            bool subtractBranch = local >= halfSpan;
            outputColor = vec4(
              butterfly(a.xy, b.xy, angle, subtractBranch),
              butterfly(a.zw, b.zw, angle, subtractBranch)
            );
            return;
          }

          vec4 value = readCell(cell);
          float sign = ((cell.x + cell.y) & 1) == 0 ? 1.0 : -1.0;
          outputColor = value * sign;
        }
      `,
    });
  }

  render(inputTexture, target, operation, axis = 0, stage = 0) {
    this.material.uniforms.inputTexture.value = inputTexture;
    this.material.uniforms.operation.value = operation;
    this.material.uniforms.axis.value = axis;
    this.material.uniforms.stage.value = stage;
    this.mesh.material = this.material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  transform(sourceTexture) {
    let source = sourceTexture;
    let destination = this.ping;

    this.render(source, destination, 0, 0);
    source = destination.texture;
    destination = this.pong;
    for (let stage = 0; stage < this.logResolution; stage += 1) {
      this.render(source, destination, 1, 0, stage);
      source = destination.texture;
      destination = destination === this.ping ? this.pong : this.ping;
    }

    this.render(source, destination, 0, 1);
    source = destination.texture;
    destination = destination === this.ping ? this.pong : this.ping;
    for (let stage = 0; stage < this.logResolution; stage += 1) {
      this.render(source, destination, 1, 1, stage);
      source = destination.texture;
      destination = destination === this.ping ? this.pong : this.ping;
    }

    this.render(source, this.output, 2);
    this.renderer.setRenderTarget(null);
    return this.output.texture;
  }

  dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.ping.dispose();
    this.pong.dispose();
    this.output.dispose();
  }
}

function makeImpulseTexture(resolution, x, y) {
  const data = new Float32Array(resolution * resolution * 4);
  const offset = (y * resolution + x) * 4;
  data[offset] = 1;
  const texture = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function maxErrorConstant(pixels, resolution) {
  let error = 0;
  for (let index = 0; index < resolution * resolution; index += 1) {
    error = Math.max(
      error,
      Math.abs(pixels[index * 4] - 1),
      Math.abs(pixels[index * 4 + 1]),
    );
  }
  return error;
}

function maxErrorFrequency(pixels, resolution) {
  let error = 0;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const offset = (y * resolution + x) * 4;
      const angle = Math.PI * 2 * x / resolution;
      error = Math.max(
        error,
        Math.abs(pixels[offset] - Math.cos(angle)),
        Math.abs(pixels[offset + 1] - Math.sin(angle)),
      );
    }
  }
  return error;
}

export function validateFragmentIFFT(renderer, resolution = 16) {
  const transform = new FragmentIFFT(renderer, resolution, {
    type: THREE.FloatType,
  });
  const pixels = new Float32Array(resolution * resolution * 4);
  const center = resolution / 2;

  const dc = makeImpulseTexture(resolution, center, center);
  transform.transform(dc);
  renderer.readRenderTargetPixels(
    transform.output,
    0,
    0,
    resolution,
    resolution,
    pixels,
  );
  const impulseError = maxErrorConstant(pixels, resolution);
  dc.dispose();

  pixels.fill(0);
  const frequency = makeImpulseTexture(
    resolution,
    center + 1,
    center,
  );
  transform.transform(frequency);
  renderer.readRenderTargetPixels(
    transform.output,
    0,
    0,
    resolution,
    resolution,
    pixels,
  );
  const frequencyError = maxErrorFrequency(pixels, resolution);
  frequency.dispose();
  transform.dispose();
  renderer.setRenderTarget(null);

  return {
    pass: impulseError < 1e-3 && frequencyError < 1e-3,
    impulseError,
    frequencyError,
  };
}

export { createTarget, vertexShader };
