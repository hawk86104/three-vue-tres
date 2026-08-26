import * as THREE from "three";

const skyFunction = `
  vec3 skyRadiance(vec3 direction) {
    float vertical = smoothstep(-0.05, 0.4, direction.y);
    vec3 gradient = mix(horizonColor, zenithColor, vertical);
    float sunAlignment = max(dot(direction, sunDirection), 0.0);
    vec3 disc = sunColor * pow(sunAlignment, 1200.0) * 8.0;
    vec3 halo = sunColor * pow(sunAlignment, 7.0) * 0.35;
    return gradient + disc + halo;
  }
`;

export function createOceanMaterial(cascades, options) {
  const uniforms = {
    displacement0: { value: cascades[0].displacement },
    displacement1: { value: cascades[1].displacement },
    displacement2: { value: cascades[2].displacement },
    derivatives0: { value: cascades[0].derivatives.texture },
    derivatives1: { value: cascades[1].derivatives.texture },
    derivatives2: { value: cascades[2].derivatives.texture },
    patchLengths: {
      value: new THREE.Vector3(...options.patchLengths),
    },
    sunDirection: { value: options.sunDirection },
    sunColor: { value: new THREE.Color(0xfff1dc) },
    horizonColor: { value: new THREE.Color(0x9fb8cc) },
    zenithColor: { value: new THREE.Color(0x2a5b9c) },
    deepColor: { value: new THREE.Color(0x071a26) },
    scatterColor: { value: new THREE.Color(0x2e8f8f) },
    foamColor: { value: new THREE.Color(0xdce7ea) },
    foamThreshold: { value: 0.4 },
    foamScale: { value: 2.5 },
    detailStrength: { value: 0.1 },
    detailTexture: { value: options.detailTexture },
    time: { value: 0 },
    fogColor: { value: new THREE.Color(0x9fb8cc) },
    fogDensity: { value: 0.0045 },
    debugMode: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: `
      precision highp float;
      uniform sampler2D displacement0;
      uniform sampler2D displacement1;
      uniform sampler2D displacement2;
      uniform vec3 patchLengths;
      out vec3 worldPositionVarying;
      out vec2 oceanPosition;

      vec4 sampleDisplacement(sampler2D map, vec2 xz, float lengthScale) {
        return texture(map, fract(xz / lengthScale));
      }

      void main() {
        oceanPosition = position.xz;
        vec3 displacement =
          sampleDisplacement(displacement0, oceanPosition, patchLengths.x).xyz +
          sampleDisplacement(displacement1, oceanPosition, patchLengths.y).xyz +
          sampleDisplacement(displacement2, oceanPosition, patchLengths.z).xyz;
        vec3 displaced = position + displacement;
        vec4 world = modelMatrix * vec4(displaced, 1.0);
        worldPositionVarying = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D displacement0;
      uniform sampler2D displacement1;
      uniform sampler2D displacement2;
      uniform sampler2D derivatives0;
      uniform sampler2D derivatives1;
      uniform sampler2D derivatives2;
      uniform vec3 patchLengths;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      uniform vec3 deepColor;
      uniform vec3 scatterColor;
      uniform vec3 foamColor;
      uniform vec3 fogColor;
      uniform float foamThreshold;
      uniform float foamScale;
      uniform float detailStrength;
      uniform sampler2D detailTexture;
      uniform float time;
      uniform float fogDensity;
      uniform int debugMode;
      in vec3 worldPositionVarying;
      in vec2 oceanPosition;
      out vec4 outputColor;

      ${skyFunction}

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(hash21(cell), hash21(cell + vec2(1, 0)), local.x),
          mix(hash21(cell + vec2(0, 1)), hash21(cell + 1.0), local.x),
          local.y
        );
      }

      vec4 sampleDerivatives(sampler2D map, vec2 xz, float lengthScale) {
        return texture(map, fract(xz / lengthScale));
      }

      vec4 sampleDisplacement(sampler2D map, vec2 xz, float lengthScale) {
        return texture(map, fract(xz / lengthScale));
      }

      void main() {
        vec4 derivative =
          sampleDerivatives(derivatives0, oceanPosition, patchLengths.x) +
          sampleDerivatives(derivatives1, oceanPosition, patchLengths.y) +
          sampleDerivatives(derivatives2, oceanPosition, patchLengths.z);
        float denominatorX = max(0.18, 1.0 + derivative.z);
        float denominatorZ = max(0.18, 1.0 + derivative.w);
        vec3 normal = normalize(vec3(
          -derivative.x / denominatorX,
          1.0,
          -derivative.y / denominatorZ
        ));

        vec2 detailA = texture(
          detailTexture,
          oceanPosition * 0.06 + vec2(time * 0.012, time * 0.008)
        ).rg * 2.0 - 1.0;
        vec2 detailB = texture(
          detailTexture,
          oceanPosition * 0.17 + vec2(-time * 0.02, time * 0.015)
        ).rg * 2.0 - 1.0;
        vec2 detailNormal = detailA + detailB * 0.5;
        normal = normalize(
          normal +
          vec3(detailNormal.x, 0.0, detailNormal.y) * detailStrength
        );

        vec4 displacementA =
          sampleDisplacement(displacement0, oceanPosition, patchLengths.x);
        vec4 displacementB =
          sampleDisplacement(displacement1, oceanPosition, patchLengths.y);
        vec4 displacementC =
          sampleDisplacement(displacement2, oceanPosition, patchLengths.z);

        float foamRaw =
          clamp((foamThreshold - displacementA.a) * foamScale, 0.0, 1.0) +
          clamp((foamThreshold - displacementB.a) * foamScale, 0.0, 1.0);
        float foamCoverage = smoothstep(0.2, 0.9, foamRaw);

        if (debugMode == 1) {
          vec3 bands =
            vec3(abs(displacementA.y), abs(displacementB.y), abs(displacementC.y));
          outputColor = vec4(
            pow(clamp(bands * vec3(0.16, 0.7, 1.4), 0.0, 1.0), vec3(0.55)),
            1.0
          );
          return;
        }
        if (debugMode == 2) {
          outputColor = vec4(normal * 0.5 + 0.5, 1.0);
          return;
        }
        if (debugMode == 3) {
          float history = min(displacementA.a, displacementB.a);
          outputColor = vec4(
            mix(vec3(0.95, 0.2, 0.06), vec3(0.04, 0.12, 0.18), clamp(history, 0.0, 1.0)),
            1.0
          );
          return;
        }

        vec3 viewDirection = normalize(cameraPosition - worldPositionVarying);
        float noV = max(dot(normal, viewDirection), 0.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - noV, 5.0);
        vec3 reflectedDirection = reflect(-viewDirection, normal);
        reflectedDirection.y = max(abs(reflectedDirection.y), 0.02);
        vec3 reflection = skyRadiance(normalize(reflectedDirection));

        float crest = clamp(worldPositionVarying.y * 0.5 + 0.4, 0.0, 1.0);
        vec3 halfVector = normalize(-normal + sunDirection);
        float scatter =
          pow(clamp(dot(viewDirection, -halfVector), 0.0, 1.0), 4.0) *
          crest;
        vec3 body = mix(
          deepColor,
          scatterColor,
          clamp(0.12 + scatter, 0.0, 1.0)
        );
        vec3 water = mix(body, reflection, fresnel);

        float bubbleA = texture(
          detailTexture,
          oceanPosition * 0.45 + vec2(time * 0.03, time * 0.02)
        ).b;
        float bubbleB = texture(
          detailTexture,
          oceanPosition * 1.6 + vec2(-time * 0.05, time * 0.04)
        ).a;
        float bubble = clamp(
          bubbleA * 0.7 + bubbleB * 0.5 + 0.2,
          0.0,
          1.0
        );
        float foamLight =
          0.55 +
          0.6 * clamp(dot(normal, sunDirection), 0.0, 1.0);
        vec3 shadedFoam = foamColor * bubble * foamLight;
        vec3 color = mix(water, shadedFoam, foamCoverage);

        float distanceToCamera = length(cameraPosition - worldPositionVarying);
        float fog = 1.0 - exp(-fogDensity * fogDensity * distanceToCamera * distanceToCamera);
        color = mix(color, fogColor, clamp(fog, 0.0, 1.0));
        outputColor = vec4(color, 1.0);
      }
    `,
  });

  return material;
}

export function updateOceanMaterialTextures(material, cascades) {
  material.uniforms.displacement0.value = cascades[0].displacement;
  material.uniforms.displacement1.value = cascades[1].displacement;
  material.uniforms.displacement2.value = cascades[2].displacement;
}

export function createSkyMaterial(options) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: options.sunDirection },
      sunColor: { value: new THREE.Color(0xfff1dc) },
      horizonColor: { value: new THREE.Color(0x9fb8cc) },
      zenithColor: { value: new THREE.Color(0x2a5b9c) },
    },
    vertexShader: `
      out vec3 directionVarying;
      void main() {
        directionVarying = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      in vec3 directionVarying;
      out vec4 outputColor;
      ${skyFunction}
      void main() {
        outputColor = vec4(skyRadiance(normalize(directionVarying)), 1.0);
      }
    `,
  });
}
