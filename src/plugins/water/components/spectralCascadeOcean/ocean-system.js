import * as THREE from "three";
import {
  FragmentIFFT,
  createTarget,
  vertexShader,
} from "./fft-pipeline.js";
import { createSpectrumTexture } from "./spectrum.js";

function createComputeMaterial(fragmentShader, uniforms = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    uniforms,
    vertexShader,
    fragmentShader,
  });
}

export class SpectralCascade {
  constructor(renderer, config) {
    this.renderer = renderer;
    this.config = config;
    this.resolution = config.resolution;
    this.spectrum = createSpectrumTexture(config);
    this.heightFrequency = createTarget(this.resolution);
    this.horizontalFrequency = createTarget(this.resolution);
    this.heightIFFT = new FragmentIFFT(renderer, this.resolution);
    this.horizontalIFFT = new FragmentIFFT(renderer, this.resolution);
    this.displacementTargets = [
      createTarget(this.resolution),
      createTarget(this.resolution),
    ];
    this.derivatives = createTarget(this.resolution);
    for (const target of [
      ...this.displacementTargets,
      this.derivatives,
    ]) {
      target.texture.minFilter = THREE.LinearFilter;
      target.texture.magFilter = THREE.LinearFilter;
      target.texture.needsUpdate = true;
    }
    this.currentDisplacement = 0;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.mesh);

    const sharedUniforms = {
      h0Texture: { value: this.spectrum },
      time: { value: 0 },
      patchLength: { value: config.patchLength },
      amplitude: { value: config.amplitude },
    };
    this.heightEvolution = createComputeMaterial(
      `
        precision highp float;
        uniform sampler2D h0Texture;
        uniform float time;
        uniform float patchLength;
        uniform float amplitude;
        out vec4 outputColor;

        vec2 complexMultiply(vec2 a, vec2 b) {
          return vec2(
            a.x * b.x - a.y * b.y,
            a.x * b.y + a.y * b.x
          );
        }

        void main() {
          ivec2 cell = ivec2(gl_FragCoord.xy);
          vec4 initial = texelFetch(h0Texture, cell, 0);
          vec2 centered = vec2(cell) - vec2(${this.resolution}.0 * 0.5);
          vec2 k = centered * (6.28318530718 / patchLength);
          float kLength = max(length(k), 1e-4);
          float omega = sqrt(9.81 * kLength * tanh(min(kLength * 500.0, 20.0)));
          vec2 phase = vec2(cos(omega * time), sin(omega * time));
          vec2 h =
            complexMultiply(initial.xy, phase) +
            complexMultiply(initial.zw, vec2(phase.x, -phase.y));
          outputColor = vec4(h * amplitude, 0.0, 1.0);
        }
      `,
      sharedUniforms,
    );
    this.horizontalEvolution = createComputeMaterial(
      `
        precision highp float;
        uniform sampler2D h0Texture;
        uniform float time;
        uniform float patchLength;
        uniform float amplitude;
        out vec4 outputColor;

        vec2 complexMultiply(vec2 a, vec2 b) {
          return vec2(
            a.x * b.x - a.y * b.y,
            a.x * b.y + a.y * b.x
          );
        }

        void main() {
          ivec2 cell = ivec2(gl_FragCoord.xy);
          vec4 initial = texelFetch(h0Texture, cell, 0);
          vec2 centered = vec2(cell) - vec2(${this.resolution}.0 * 0.5);
          vec2 k = centered * (6.28318530718 / patchLength);
          float kLength = max(length(k), 1e-4);
          float omega = sqrt(9.81 * kLength * tanh(min(kLength * 500.0, 20.0)));
          vec2 phase = vec2(cos(omega * time), sin(omega * time));
          vec2 h =
            complexMultiply(initial.xy, phase) +
            complexMultiply(initial.zw, vec2(phase.x, -phase.y));
          vec2 ih = vec2(-h.y, h.x);
          vec2 dx = ih * (k.x / kLength);
          vec2 dz = ih * (k.y / kLength);
          vec2 packed = vec2(dx.x - dz.y, dx.y + dz.x);
          outputColor = vec4(packed * amplitude, 0.0, 1.0);
        }
      `,
      sharedUniforms,
    );

    this.assembleDisplacement = createComputeMaterial(
      `
        precision highp float;
        uniform sampler2D heightTexture;
        uniform sampler2D horizontalTexture;
        uniform sampler2D previousDisplacement;
        uniform float choppiness;
        uniform float patchLength;
        uniform float dt;
        uniform float foamRecovery;
        out vec4 outputColor;

        float heightAt(ivec2 cell) {
          return texelFetch(heightTexture, cell, 0).r;
        }
        vec2 horizontalAt(ivec2 cell) {
          return texelFetch(horizontalTexture, cell, 0).rg;
        }

        void main() {
          ivec2 cell = ivec2(gl_FragCoord.xy);
          ivec2 size = textureSize(heightTexture, 0);
          ivec2 left = ivec2((cell.x - 1 + size.x) % size.x, cell.y);
          ivec2 right = ivec2((cell.x + 1) % size.x, cell.y);
          ivec2 down = ivec2(cell.x, (cell.y - 1 + size.y) % size.y);
          ivec2 up = ivec2(cell.x, (cell.y + 1) % size.y);
          float inverseSpacing = float(size.x) / (2.0 * patchLength);
          vec2 horizontal = horizontalAt(cell);
          vec2 horizontalLeft = horizontalAt(left);
          vec2 horizontalRight = horizontalAt(right);
          vec2 horizontalDown = horizontalAt(down);
          vec2 horizontalUp = horizontalAt(up);
          float dDxDx = (horizontalRight.x - horizontalLeft.x) * inverseSpacing;
          float dDxDz = (horizontalUp.x - horizontalDown.x) * inverseSpacing;
          float dDzDx = (horizontalRight.y - horizontalLeft.y) * inverseSpacing;
          float dDzDz = (horizontalUp.y - horizontalDown.y) * inverseSpacing;
          float jxx = 1.0 + choppiness * dDxDx;
          float jzz = 1.0 + choppiness * dDzDz;
          float jxz = choppiness * 0.5 * (dDxDz + dDzDx);
          float jacobian = jxx * jzz - jxz * jxz;
          float previous = texelFetch(previousDisplacement, cell, 0).a;
          float recovered =
            previous +
            dt * foamRecovery / max(jacobian, 0.5);
          float history = min(jacobian, recovered);
          outputColor = vec4(
            horizontal.x * choppiness,
            heightAt(cell),
            horizontal.y * choppiness,
            history
          );
        }
      `,
      {
        heightTexture: { value: null },
        horizontalTexture: { value: null },
        previousDisplacement: { value: null },
        choppiness: { value: config.choppiness },
        patchLength: { value: config.patchLength },
        dt: { value: 1 / 60 },
        foamRecovery: { value: config.foamRecovery },
      },
    );
    this.assembleDerivatives = createComputeMaterial(
      `
        precision highp float;
        uniform sampler2D heightTexture;
        uniform sampler2D horizontalTexture;
        uniform float choppiness;
        uniform float patchLength;
        out vec4 outputColor;

        float heightAt(ivec2 cell) {
          return texelFetch(heightTexture, cell, 0).r;
        }
        vec2 horizontalAt(ivec2 cell) {
          return texelFetch(horizontalTexture, cell, 0).rg;
        }

        void main() {
          ivec2 cell = ivec2(gl_FragCoord.xy);
          ivec2 size = textureSize(heightTexture, 0);
          ivec2 left = ivec2((cell.x - 1 + size.x) % size.x, cell.y);
          ivec2 right = ivec2((cell.x + 1) % size.x, cell.y);
          ivec2 down = ivec2(cell.x, (cell.y - 1 + size.y) % size.y);
          ivec2 up = ivec2(cell.x, (cell.y + 1) % size.y);
          float inverseSpacing = float(size.x) / (2.0 * patchLength);
          float slopeX = (heightAt(right) - heightAt(left)) * inverseSpacing;
          float slopeZ = (heightAt(up) - heightAt(down)) * inverseSpacing;
          float dDxDx =
            (horizontalAt(right).x - horizontalAt(left).x) * inverseSpacing;
          float dDzDz =
            (horizontalAt(up).y - horizontalAt(down).y) * inverseSpacing;
          outputColor = vec4(
            slopeX,
            slopeZ,
            choppiness * dDxDx,
            choppiness * dDzDz
          );
        }
      `,
      {
        heightTexture: { value: null },
        horizontalTexture: { value: null },
        choppiness: { value: config.choppiness },
        patchLength: { value: config.patchLength },
      },
    );

    this.clearHistoryTargets();
  }

  clearHistoryTargets() {
    const previousColor = new THREE.Color();
    this.renderer.getClearColor(previousColor);
    const previousAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 1);
    for (const target of this.displacementTargets) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(previousColor, previousAlpha);
  }

  renderPass(material, target) {
    this.mesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  update(time, dt) {
    this.heightEvolution.uniforms.time.value = time;
    this.horizontalEvolution.uniforms.time.value = time;
    this.renderPass(this.heightEvolution, this.heightFrequency);
    this.renderPass(this.horizontalEvolution, this.horizontalFrequency);

    const heightSpatial = this.heightIFFT.transform(
      this.heightFrequency.texture,
    );
    const horizontalSpatial = this.horizontalIFFT.transform(
      this.horizontalFrequency.texture,
    );
    const previous = this.displacementTargets[this.currentDisplacement];
    const nextIndex = 1 - this.currentDisplacement;
    const next = this.displacementTargets[nextIndex];

    this.assembleDisplacement.uniforms.heightTexture.value = heightSpatial;
    this.assembleDisplacement.uniforms.horizontalTexture.value =
      horizontalSpatial;
    this.assembleDisplacement.uniforms.previousDisplacement.value =
      previous.texture;
    this.assembleDisplacement.uniforms.dt.value = dt;
    this.renderPass(this.assembleDisplacement, next);

    this.assembleDerivatives.uniforms.heightTexture.value = heightSpatial;
    this.assembleDerivatives.uniforms.horizontalTexture.value =
      horizontalSpatial;
    this.renderPass(this.assembleDerivatives, this.derivatives);

    this.currentDisplacement = nextIndex;
    this.renderer.setRenderTarget(null);
  }

  get displacement() {
    return this.displacementTargets[this.currentDisplacement].texture;
  }
}

export class SpectralOceanSystem {
  constructor(renderer, options) {
    this.renderer = renderer;
    this.options = options;
    const handoff = (index) =>
      (Math.PI * 2 / options.patchLengths[index]) *
      options.boundaryFactor;
    this.cascades = options.patchLengths.map((patchLength, index) => {
      return new SpectralCascade(renderer, {
        ...options,
        patchLength,
        cutoffLow: index === 0 ? 1e-4 : handoff(index),
        cutoffHigh:
          index === options.patchLengths.length - 1
            ? 9999
            : handoff(index + 1),
        seed: options.seed + index * 1013,
        amplitude: options.amplitude,
      });
    });
  }

  update(time, dt) {
    for (const cascade of this.cascades) cascade.update(time, dt);
  }
}
