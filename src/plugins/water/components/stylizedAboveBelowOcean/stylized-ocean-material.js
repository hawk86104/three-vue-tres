import * as THREE from "three";

export const stylizedOceanDebugModes = new Map([
  ["final", 0],
  ["above-surface", 0],
  ["underwater", 0],
  ["cascade-bands", 1],
  ["normals", 2],
  ["foam", 3],
  ["depth-fog", 4],
]);

export const stylizedAboveBelowOceanAssetPaths = {
  foam: "/plugins/water/stylizedAboveBelowOcean/foam.webp",
  sand: "/plugins/water/stylizedAboveBelowOcean/sand.webp",
};

const stylizedSky = `
  float skyHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
      mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0)), u.x),
      u.y
    );
  }

  float skyFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += skyNoise(p) * a;
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  vec3 stylizedOceanSky(vec3 direction, vec3 sunDirection, vec3 sunColor) {
    vec3 viewDirection = normalize(direction);
    vec3 topColor = vec3(0.024, 0.255, 0.537);
    vec3 bottomColor = vec3(0.475, 0.722, 0.851);
    float height = max(viewDirection.y, 0.0);
    float opticalDepth = exp(-height * (8.0 - 1.2));
    vec3 skyColor = mix(topColor, bottomColor, opticalDepth);

    float sunDot = dot(viewDirection, normalize(sunDirection));
    float sunDisk = smoothstep(0.9999, 1.0, sunDot);
    float dynamicGlowSize = 0.999 - (6.0 * 0.002);
    float sunGlow = smoothstep(dynamicGlowSize, 1.0, sunDot);
    float dynamicDiskIntensity = 1.5 / (1.0 + (6.0 * 0.1));
    vec3 finalColor =
      skyColor +
      sunColor * sunGlow * 4.5 +
      sunColor * sunDisk * dynamicDiskIntensity;
    return clamp(finalColor, 0.0, 1.0);
  }
`;

const noiseFns = `
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      value += valueNoise(p) * amplitude;
      p = rotate * p * 2.04;
      amplitude *= 0.5;
    }
    return value;
  }
`;

export function createStylizedOceanSurfaceMaterial(cascades, {
  patchLengths,
  sunDirection = new THREE.Vector3(-0.14, 0.13, -0.98).normalize(),
  sunColor = new THREE.Color(0xffdf70),
  waterDeep = new THREE.Color(0x15a5ec),
  waterShallow = new THREE.Color(0x59cdff),
  fogColor = new THREE.Color(0x52b9e5),
  foamTexture = null,
} = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      displacement0: { value: cascades[0].displacement },
      displacement1: { value: cascades[1].displacement },
      displacement2: { value: cascades[2].displacement },
      derivatives0: { value: cascades[0].derivatives.texture },
      derivatives1: { value: cascades[1].derivatives.texture },
      derivatives2: { value: cascades[2].derivatives.texture },
      patchLengths: { value: new THREE.Vector3(...patchLengths) },
      uTime: { value: 0 },
      uSunDirection: { value: sunDirection },
      uSunColor: { value: sunColor.clone() },
      uWaterDeep: { value: waterDeep.clone() },
      uWaterShallow: { value: waterShallow.clone() },
      uWaterSSS: { value: new THREE.Color(0x3b72ba) },
      uFoamColor: { value: new THREE.Color(0xffffff) },
      uFoamTexture: { value: foamTexture },
      uFogColor: { value: fogColor.clone() },
      uColorMinHeight: { value: -4.5 },
      uColorMaxHeight: { value: 1.5 },
      uSpecularPower: { value: 250.0 },
      uSpecularMin: { value: 0.9 },
      uSpecularMax: { value: 0.99 },
      uSpecularIntensity: { value: 4.7 },
      uFadeStart: { value: 500.0 },
      uFadeEnd: { value: 3500.0 },
      uSssPower: { value: 4.7 },
      uSssScale: { value: 2.0 },
      uSssMinHeight: { value: -0.2 },
      uSssMaxHeight: { value: 1.0 },
      uFoamThreshold: { value: 0.4 },
      uFoamScale: { value: 7.0 },
      uFoamSpeed: { value: new THREE.Vector2(0.2, 0.2) },
      uFoamDistortion: { value: 1.4 },
      uFoamEdgeSoftness: { value: 0.8 },
      uFoamPower: { value: 0.5 },
      uFresnelSmoothness: { value: 0.5 },
      uFogDensity: { value: 0.0005 },
      uDebugMode: { value: 0 },
    },
    vertexShader: `
      precision highp float;

      uniform sampler2D displacement0;
      uniform sampler2D displacement1;
      uniform sampler2D displacement2;
      uniform vec3 patchLengths;

      varying vec2 vOceanXZ;
      varying vec3 vWorldPosition;
      varying float vHeight;
      varying float vJacobian;

      vec4 sampleDisplacement(sampler2D map, vec2 xz, float lengthScale) {
        return texture2D(map, fract(xz / lengthScale));
      }

      void main() {
        vec4 baseWorld = modelMatrix * vec4(position, 1.0);
        vOceanXZ = baseWorld.xz;
        vec4 d0 = sampleDisplacement(displacement0, vOceanXZ, patchLengths.x);
        vec4 d1 = sampleDisplacement(displacement1, vOceanXZ, patchLengths.y);
        vec4 d2 = sampleDisplacement(displacement2, vOceanXZ, patchLengths.z);
        vec3 displacement = d0.xyz + d1.xyz * 0.56 + d2.xyz * 0.28;
        displacement.xz *= 1.5;
        vec3 world = baseWorld.xyz + displacement;
        vWorldPosition = world;
        vHeight = displacement.y;
        vJacobian = min(d0.a, d1.a);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
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
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uWaterDeep;
      uniform vec3 uWaterShallow;
      uniform vec3 uWaterSSS;
      uniform vec3 uFoamColor;
      uniform sampler2D uFoamTexture;
      uniform vec3 uFogColor;
      uniform float uColorMinHeight;
      uniform float uColorMaxHeight;
      uniform float uSpecularPower;
      uniform float uSpecularMin;
      uniform float uSpecularMax;
      uniform float uSpecularIntensity;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uSssPower;
      uniform float uSssScale;
      uniform float uSssMinHeight;
      uniform float uSssMaxHeight;
      uniform float uFoamThreshold;
      uniform float uFoamScale;
      uniform vec2 uFoamSpeed;
      uniform float uFoamDistortion;
      uniform float uFoamEdgeSoftness;
      uniform float uFoamPower;
      uniform float uFresnelSmoothness;
      uniform float uFogDensity;
      uniform int uDebugMode;

      varying vec2 vOceanXZ;
      varying vec3 vWorldPosition;
      varying float vHeight;
      varying float vJacobian;

      ${stylizedSky}
      ${noiseFns}

      vec4 sampleDerivatives(sampler2D map, vec2 xz, float lengthScale) {
        return texture2D(map, fract(xz / lengthScale));
      }

      vec4 sampleDisplacement(sampler2D map, vec2 xz, float lengthScale) {
        return texture2D(map, fract(xz / lengthScale));
      }

      float fresnelTerm(vec3 viewDirection, vec3 normal) {
        float dotVN = clamp(dot(viewDirection, normal), 0.0, 1.0);
        return 0.02 + 0.98 * pow(1.0 - dotVN, 5.0);
      }

      void main() {
        vec4 der0 = sampleDerivatives(derivatives0, vOceanXZ, patchLengths.x);
        vec4 der1 = sampleDerivatives(derivatives1, vOceanXZ, patchLengths.y);
        vec4 der2 = sampleDerivatives(derivatives2, vOceanXZ, patchLengths.z);
        vec4 derivative = der0 + der1 * 0.56 + der2 * 0.28;
        vec3 normal = normalize(vec3(
          -derivative.x / max(0.18, 1.0 + derivative.z),
          1.0,
          -derivative.y / max(0.18, 1.0 + derivative.w)
        ));
        if (!gl_FrontFacing) normal = -normal;

        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 lightDirection = normalize(uSunDirection);
        float dist = length(cameraPosition - vWorldPosition);
        float aaFade = smoothstep(uFadeStart, uFadeEnd, dist);
        normal = normalize(mix(normal, vec3(0.0, gl_FrontFacing ? 1.0 : -1.0, 0.0), aaFade));
        float dynamicSpecular = mix(uSpecularIntensity, 0.0, aaFade);

        if (uDebugMode == 1) {
          vec4 d0 = sampleDisplacement(displacement0, vOceanXZ, patchLengths.x);
          vec4 d1 = sampleDisplacement(displacement1, vOceanXZ, patchLengths.y);
          vec4 d2 = sampleDisplacement(displacement2, vOceanXZ, patchLengths.z);
          gl_FragColor = vec4(pow(clamp(vec3(abs(d0.y), abs(d1.y) * 2.0, abs(d2.y) * 4.0), 0.0, 1.0), vec3(0.55)), 1.0);
          return;
        }
        if (uDebugMode == 2) {
          gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
          return;
        }

        float heightMask = smoothstep(uColorMinHeight, uColorMaxHeight, vHeight);
        vec3 baseWater = mix(uWaterDeep, uWaterShallow, heightMask);

        vec3 distortedLight = normalize(-lightDirection + normal * 0.4);
        float sssAlignment = max(dot(viewDirection, distortedLight), 0.0);
        float sss = pow(sssAlignment, uSssPower) * uSssScale;
        sss *= smoothstep(uSssMinHeight, uSssMaxHeight, vHeight);
        vec3 waterInside = baseWater + uWaterSSS * sss;

        vec3 fresnelNormal = normalize(mix(normal, vec3(0.0, normal.y > 0.0 ? 1.0 : -1.0, 0.0), uFresnelSmoothness));
        vec3 reflectionVector = reflect(-viewDirection, fresnelNormal);
        vec3 reflection = stylizedOceanSky(normalize(reflectionVector), lightDirection, uSunColor);
        float fresnel = fresnelTerm(viewDirection, fresnelNormal);

        vec3 halfVector = normalize(lightDirection + viewDirection);
        float specularTerm = pow(max(dot(halfVector, normal), 0.0), uSpecularPower);
        float sunPath = smoothstep(uSpecularMin, uSpecularMax, specularTerm);
        vec3 directSpecular = uSunColor * sunPath * dynamicSpecular;

        vec3 color = mix(waterInside, reflection + directSpecular, fresnel);

        vec2 foamUv = vOceanXZ / patchLengths.x;
        vec2 foamUv1 = foamUv * uFoamScale;
        foamUv1 += uTime * (uFoamSpeed * 0.05);
        vec2 foamUv2 = foamUv * (uFoamScale * 1.2);
        foamUv2 += uTime * (-uFoamSpeed * 0.07);
        float foamNoise =
          texture2D(uFoamTexture, foamUv1).r *
          texture2D(uFoamTexture, foamUv2).r;
        float turbulence = max(0.0, (uFoamThreshold - vJacobian) * 10.0);
        turbulence *= uFoamPower * 10.0;
        float foamCoverage =
          smoothstep(uFoamThreshold, uFoamThreshold + uFoamEdgeSoftness, turbulence);
        float foamMask =
          foamCoverage * pow(foamNoise, 1.0 / max(uFoamDistortion, 0.001));
        foamMask = clamp(foamMask * 2.4, 0.0, 1.0);
        if (uDebugMode == 3) {
          gl_FragColor = vec4(vec3(foamMask), 1.0);
          return;
        }
        color = mix(color, uFoamColor, foamMask);

        float fogFactor = clamp(1.0 - exp(-pow(dist * uFogDensity, 2.0)), 0.0, 1.0);
        float sunDot = dot(-viewDirection, lightDirection);
        vec3 dynamicFog = uFogColor +
          uSunColor * smoothstep(0.999, 1.0, sunDot) * 1.5 +
          uSunColor * smoothstep(0.985, 1.0, sunDot) * 0.35;
        color = mix(color, dynamicFog, fogFactor);

        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createStylizedSeaFloorMaterial({
  sandTexture = null,
  sandColor = new THREE.Color(0xffffff),
  waterDeep = new THREE.Color(0x15a5ec),
  waterShallow = new THREE.Color(0x59cdff),
  maxDepth = 171,
  textureScale = 100,
  causticIntensity = 0.9,
  causticSpeed = 0.1,
  causticScale = 0.01,
  proximityNear = 15,
  proximityFar = 300,
  minWaterTint = 0.53,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSandTexture: { value: sandTexture },
      uSandColor: { value: sandColor.clone() },
      uWaterDeep: { value: waterDeep.clone() },
      uWaterShallow: { value: waterShallow.clone() },
      uMaxDepth: { value: maxDepth },
      uTextureScale: { value: textureScale },
      uCausticIntensity: { value: causticIntensity },
      uCausticSpeed: { value: causticSpeed },
      uCausticScale: { value: causticScale },
      uProximityNear: { value: proximityNear },
      uProximityFar: { value: proximityFar },
      uMinWaterTint: { value: minWaterTint },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float uTime;
      uniform sampler2D uSandTexture;
      uniform vec3 uSandColor;
      uniform vec3 uWaterDeep;
      uniform vec3 uWaterShallow;
      uniform float uMaxDepth;
      uniform float uTextureScale;
      uniform float uCausticIntensity;
      uniform float uCausticSpeed;
      uniform float uCausticScale;
      uniform float uProximityNear;
      uniform float uProximityFar;
      uniform float uMinWaterTint;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      vec2 hash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      float voronoiSeamless(vec2 x, float period) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float minDist = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 b = vec2(float(i), float(j));
            vec2 wrapped = mod(n + b, period);
            vec2 r = b - f + hash(wrapped);
            r += 0.3 * sin(uTime * 2.0 + hash(wrapped) * 6.2831);
            minDist = min(minDist, dot(r, r));
          }
        }
        return minDist;
      }

      float generatedCaustics(vec2 uv) {
        float p1 = 4.0;
        float c1 = voronoiSeamless(uv * p1 + vec2(uTime * 0.1, uTime * 0.05), p1);
        float p2 = 5.0;
        float c2 = voronoiSeamless(uv * p2 - vec2(uTime * 0.05, uTime * 0.08), p2);
        float p3 = 7.0;
        float c3 = voronoiSeamless(uv * p3 + vec2(-uTime * 0.07, uTime * 0.1), p3);
        return clamp(pow((c1 + c2 + c3) * 0.6, 2.5) * 3.5, 0.0, 1.0);
      }

      void main() {
        vec3 baseSand = texture2D(uSandTexture, vUv * uTextureScale).rgb * uSandColor;

        float depth = max(0.0, -vWorldPosition.y);
        float verticalAttenuation = exp(-depth / (uMaxDepth * 0.5));
        vec3 ambientWater = mix(uWaterDeep, uWaterShallow, verticalAttenuation);
        float cameraDist = length(cameraPosition - vWorldPosition);
        float proximity = smoothstep(uProximityNear, uProximityFar, cameraDist);
        proximity = mix(uMinWaterTint, 1.0, pow(proximity, 3.0));
        vec3 color = mix(baseSand, baseSand * ambientWater, proximity);

        vec2 causticUv = vWorldPosition.xz * uCausticScale +
          uTime * uCausticSpeed * vec2(1.0, 0.5);
        float c1 = generatedCaustics(causticUv);
        float c2 = generatedCaustics(mat2(0.795, -0.606, 0.606, 0.795) *
          (causticUv * 0.618 - uTime * uCausticSpeed * 0.3));
        vec3 causticTint = mix(vec3(1.0), uWaterShallow, 0.2);
        color += causticTint * c1 * c2 * 2.5 * uCausticIntensity * verticalAttenuation;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createStylizedUnderwaterCompositeMaterial({
  sceneColor = null,
  sceneDepth = null,
  displacement = null,
  patchLength = 250,
  scale = 1,
  fogColor = new THREE.Color(0x52b9e5),
  waterClarity = 120,
} = {}) {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSceneColor: { value: sceneColor },
      uSceneDepth: { value: sceneDepth },
      uDisplacement: { value: displacement },
      uPatchLength: { value: patchLength },
      uScale: { value: scale },
      uFogColor: { value: fogColor.clone() },
      uWaterClarity: { value: waterClarity },
      uCameraPosition: { value: new THREE.Vector3() },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000 },
      uTime: { value: 0 },
      uDebugMode: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform sampler2D uSceneColor;
      uniform sampler2D uSceneDepth;
      uniform sampler2D uDisplacement;
      uniform float uPatchLength;
      uniform float uScale;
      uniform vec3 uFogColor;
      uniform float uWaterClarity;
      uniform vec3 uCameraPosition;
      uniform float uCameraNear;
      uniform float uCameraFar;
      uniform float uTime;
      uniform int uDebugMode;
      varying vec2 vUv;

      #include <packing>

      void main() {
        vec4 inputColor = texture2D(uSceneColor, vUv);
        vec2 waveUv = fract(uCameraPosition.xz / uPatchLength);
        float waveHeight = texture2D(uDisplacement, waveUv).y * uScale;
        bool underwater = uCameraPosition.y <= waveHeight;
        if (!underwater) {
          gl_FragColor = inputColor;
          return;
        }

        float depth = texture2D(uSceneDepth, vUv).x;
        float viewZ = -perspectiveDepthToViewZ(depth, uCameraNear, uCameraFar);
        if (depth >= 0.9999) viewZ = 10000.0;
        float fog = clamp(1.0 - exp(-viewZ / uWaterClarity), 0.0, 1.0);
        vec3 color = mix(inputColor.rgb, uFogColor, fog);

        if (uDebugMode == 4) {
          gl_FragColor = vec4(vec3(fog), 1.0);
          return;
        }

        gl_FragColor = vec4(color, inputColor.a);
      }
    `,
  });
}

export function createStylizedOceanSkyMaterial({
  sunDirection = new THREE.Vector3(-0.14, 0.13, -0.98).normalize(),
  sunColor = new THREE.Color(0xffdf70),
} = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDirection: { value: sunDirection },
      uSunColor: { value: sunColor.clone() },
    },
    vertexShader: `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      varying vec3 vDirection;

      ${stylizedSky}

      void main() {
        vec3 color = stylizedOceanSky(normalize(vDirection), normalize(uSunDirection), uSunColor);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function updateStylizedOceanMaterials({
  oceanMaterial,
  seafloorMaterial,
  compositeMaterial,
  cascades,
  elapsed,
  camera,
  debugMode = "final",
}) {
  const debugValue = stylizedOceanDebugModes.get(debugMode) ?? 0;
  oceanMaterial.uniforms.displacement0.value = cascades[0].displacement;
  oceanMaterial.uniforms.displacement1.value = cascades[1].displacement;
  oceanMaterial.uniforms.displacement2.value = cascades[2].displacement;
  oceanMaterial.uniforms.derivatives0.value = cascades[0].derivatives.texture;
  oceanMaterial.uniforms.derivatives1.value = cascades[1].derivatives.texture;
  oceanMaterial.uniforms.derivatives2.value = cascades[2].derivatives.texture;
  oceanMaterial.uniforms.uTime.value = elapsed;
  oceanMaterial.uniforms.uDebugMode.value = debugValue;

  if (seafloorMaterial) seafloorMaterial.uniforms.uTime.value = elapsed;
  if (compositeMaterial) {
    compositeMaterial.uniforms.uDisplacement.value = cascades[0].displacement;
    compositeMaterial.uniforms.uTime.value = elapsed;
    compositeMaterial.uniforms.uDebugMode.value = debugValue;
    if (camera) {
      compositeMaterial.uniforms.uCameraPosition.value.copy(camera.position);
      compositeMaterial.uniforms.uCameraNear.value = camera.near;
      compositeMaterial.uniforms.uCameraFar.value = camera.far;
    }
  }
}
