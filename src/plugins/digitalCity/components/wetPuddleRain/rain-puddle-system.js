import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

export const rainPuddleDebugModes = new Map([
  ["final", 0],
  ["puddleMask", 1],
  ["rippleNormals", 2],
  ["rainProgress", 3],
  ["splashes", 4],
]);

export const wetPuddleRainAssetPaths = {
  road: {
    map: "/plugins/digitalCity/wetPuddleRain/road/aerial_asphalt_01_diff_2k.jpg",
    normalMap: "/plugins/digitalCity/wetPuddleRain/road/aerial_asphalt_01_nor_gl_2k.jpg",
    roughnessMap: "/plugins/digitalCity/wetPuddleRain/road/aerial_asphalt_01_rough_2k.jpg",
    aoMap: "/plugins/digitalCity/wetPuddleRain/road/aerial_asphalt_01_ao_2k.jpg",
  },
  splashFlipbook: "/plugins/digitalCity/wetPuddleRain/Splash.png",
};

const glNoise = `
#define MAX_FBM_ITERATIONS 30
vec4 _permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 _taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
struct gln_tFBMOpts{float seed;float persistance;float lacunarity;float scale;float redistribution;int octaves;bool terbulance;bool ridge;};
float gln_map(float value,float min1,float max1,float min2,float max2){return min2+(value-min1)*(max2-min2)/(max1-min1);}
float gln_normalize(float v){return gln_map(v,-1.0,1.0,0.0,1.0);}
vec3 gln_rand3(vec3 p){return mod(((p*34.0)+1.0)*p,289.0);}
float gln_simplex(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1;i1=(x0.x>x0.y)? vec2(1.0,0.0): vec2(0.0,1.0);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.0);vec3 p=gln_rand3(gln_rand3(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.0*dot(m,g);}
float gln_sfbm(vec2 v,gln_tFBMOpts opts){v+=(opts.seed*100.0);float persistance=opts.persistance;float lacunarity=opts.lacunarity;float redistribution=opts.redistribution;int octaves=opts.octaves;bool terbulance=opts.terbulance;bool ridge=opts.terbulance&&opts.ridge;float result=0.0;float amplitude=1.0;float frequency=1.0;float maximum=amplitude;for(int i=0;i<MAX_FBM_ITERATIONS;i++){if(i>=octaves)break;vec2 p=v*frequency*opts.scale;float noiseVal=gln_simplex(p);if(terbulance)noiseVal=abs(noiseVal);if(ridge)noiseVal=-1.0*noiseVal;result+=noiseVal*amplitude;frequency*=lacunarity;amplitude*=persistance;maximum+=amplitude;}float redistributed=pow(result,redistribution);return redistributed/maximum;}
`;

const puddleFunctions = `
uniform float uTime;
uniform float uRainFactor;
uniform int uDebugMode;
varying vec3 vPuddlePosition;
varying vec2 vPuddleUv;
varying vec3 vPuddleWorldPosition;

${glNoise}

#define MAX_RADIUS 1
#define HASHSCALE1 .1031
#define HASHSCALE3 vec3(.1031, .1030, .0973)

float mapLinear(float x, float a1, float a2, float b1, float b2) {
  return b1 + (x - a1) * (b2 - b1) / (a2 - a1);
}

float hash12(vec2 p) {
  vec3 p3  = fract(vec3(p.xyx) * HASHSCALE1);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * HASHSCALE3);
  p3 += dot(p3, p3.yzx+19.19);
  return fract((p3.xx+p3.yz)*p3.zy);
}

vec3 getRipples(vec2 uv) {
  vec2 p0 = floor(uv);

  float time = uTime * 3.0;

  vec2 circles = vec2(0.);
  for (int j = -MAX_RADIUS; j <= MAX_RADIUS; ++j) {
      for (int i = -MAX_RADIUS; i <= MAX_RADIUS; ++i) {
        vec2 pi = p0 + vec2(i, j);
        vec2 hsh = pi;
        vec2 p = pi + hash22(hsh);

        float t = fract(0.3*time + hash12(hsh));
        vec2 v = p - uv;
        float d = length(v) - (float(MAX_RADIUS) + 1.)*t;

        float h = 1e-3;
        float d1 = d - h;
        float d2 = d + h;
        float p1 = sin(31.*d1) * smoothstep(-0.6, -0.3, d1) * smoothstep(0., -0.3, d1);
        float p2 = sin(31.*d2) * smoothstep(-0.6, -0.3, d2) * smoothstep(0., -0.3, d2);
        circles += 0.5 * normalize(v) * ((p2 - p1) / (2. * h) * (1. - t) * (1. - t));
      }
  }
  circles /= float((MAX_RADIUS*2+1)*(MAX_RADIUS*2+1));
  float intensity = mix(0.01, 0.15, smoothstep(0.1, 0.6, abs(fract(0.05*time + 0.5)*2.-1.)));
  vec3 n = vec3(circles, sqrt(max(0.0, 1. - dot(circles, circles))));
  return n;
}

float getPuddle(vec2 uv) {
  gln_tFBMOpts puddleNoiseOpts = gln_tFBMOpts(1.0, 0.5, 2.0, 0.5, 1.0, 3, false, false);
  float puddleNoise = gln_sfbm((uv + vec2(3.0, 0.0)) * 0.2, puddleNoiseOpts);
  puddleNoise = gln_normalize(puddleNoise);
  puddleNoise = smoothstep(0.0, 0.7, puddleNoise);
  return puddleNoise;
}

float sdCircle(vec2 p, float radius) {
  return length(p) - radius;
}

vec3 perturbNormal(vec3 inputNormal, vec3 noiseNormal, float strength) {
  vec3 noiseNormalOrthogonal = noiseNormal - (dot(noiseNormal, inputNormal) * inputNormal);
  vec3 noiseNormalProjectedBump = mat3(viewMatrix) * noiseNormalOrthogonal;
  return normalize(inputNormal - (noiseNormalProjectedBump * strength));
}
`;

export async function loadWetPuddleRainTextures({
  textureLoader = new THREE.TextureLoader(),
  paths = wetPuddleRainAssetPaths.road,
  repeat = [1, 1],
  anisotropy = 1,
} = {}) {
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
    textureLoader.loadAsync(paths.map),
    textureLoader.loadAsync(paths.normalMap),
    textureLoader.loadAsync(paths.roughnessMap),
    textureLoader.loadAsync(paths.aoMap),
  ]);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap, roughnessMap, aoMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = anisotropy;
  }
  return { map, normalMap, roughnessMap, aoMap };
}

export function createPuddleMaterial({
  maps,
  rainProgress,
} = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uRainFactor: rainProgress ?? { value: 0 },
    uDebugMode: { value: 0 },
  };
  const material = new THREE.MeshPhysicalMaterial({
    ...maps,
    transparent: true,
    roughness: 1,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vPuddlePosition;\nvarying vec2 vPuddleUv;\nvarying vec3 vPuddleWorldPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vPuddlePosition = position;
        vPuddleUv = uv;
        vPuddleWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + puddleFunctions)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float roughnessProgress = smoothstep(0.0, 0.75, uRainFactor);
        roughnessProgress = clamp(roughnessProgress, 0.0, 1.0);
        float normalProgress = smoothstep(0.75, 1.0, uRainFactor);
        normalProgress = clamp(normalProgress, 0.0, 1.0);
        float puddleNoise = getPuddle(vPuddlePosition.xy * 15.0);
        float puddleNormalMask = smoothstep(0.0, 1.0, puddleNoise) * normalProgress;
        vec3 rippleNormals = getRipples(vPuddlePosition.xy * 40.0);
        float circle = 1. - sdCircle(vPuddleWorldPosition.xz, 0.2);
        circle = smoothstep(0.7, 0.85, circle);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        float prevRoughness = roughnessFactor;
        roughnessFactor = 1.0 - puddleNormalMask;
        roughnessFactor = clamp(roughnessFactor, 0.0, 0.1);
        roughnessFactor = mix(prevRoughness, roughnessFactor, roughnessProgress);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        vec3 puddleNormal = perturbNormal(normal, rippleNormals, 0.25 * uRainFactor);
        normal = normalize(mix(normal, puddleNormal, puddleNormalMask));`,
      )
      .replace(
        "#include <opaque_fragment>",
        `if (uDebugMode == 1) {
          gl_FragColor = vec4(vec3(puddleNormalMask), 1.0);
          return;
        } else if (uDebugMode == 2) {
          gl_FragColor = vec4(rippleNormals * 0.5 + 0.5, 1.0);
          return;
        } else if (uDebugMode == 3) {
          gl_FragColor = vec4(vec3(uRainFactor), 1.0);
          return;
        }
        diffuseColor.a *= circle;
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "precipitation-wet-puddle-rain-v2";
  material.userData.rainUniforms = uniforms;
  return material;
}

function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randFloatSpread(random, range) {
  return range * (0.5 - random());
}

function randFloat(random, min, max) {
  return min + (max - min) * random();
}

export function createRainDrops({
  count = 1000,
  rainProgress,
  seed = 9,
} = {}) {
  const random = createSeededRandom(seed);
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.2, 0.3),
    createRainDropMaterial({ rainProgress }),
    count,
  );
  mesh.renderOrder = 2;
  const dummy = new THREE.Object3D();
  const initialY = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      randFloatSpread(random, 5),
      randFloat(random, -0.1, 5),
      randFloatSpread(random, 5),
    );
    initialY[i] = dummy.position.y;
    dummy.scale.setScalar(randFloat(random, 0.1, 0.5));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    update({ camera, delta }) {
      for (let i = 0; i < count; i++) {
        mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        dummy.position.y -= delta * 2.5;
        if (dummy.position.y <= 0) {
          dummy.position.set(
            randFloatSpread(random, 1),
            randFloat(random, -0.1, 2),
            randFloatSpread(random, 1),
          );
          initialY[i] = dummy.position.y;
          dummy.scale.setScalar(randFloat(random, 0.1, 0.5));
        }
        dummy.rotation.y = Math.atan2(
          camera.position.x - dummy.position.x,
          camera.position.z - dummy.position.z,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    setDebugMode(mode) {
      mesh.material.uniforms.uDebugMode.value = rainPuddleDebugModes.get(mode) ?? 0;
    },
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}

export function createRainDropMaterial({ rainProgress } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRainProgress: rainProgress ?? { value: 0 },
      uDebugMode: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uRainProgress;
      uniform int uDebugMode;
      varying vec3 vPosition;
      varying vec2 vUv;
      float sdUnevenCapsule( vec2 p, float r1, float r2, float h ) {
        p.x = abs(p.x);
        float b = (r1-r2)/h;
        float a = sqrt(1.0-b*b);
        float k = dot(p,vec2(-b,a));
        if( k < 0.0 ) return length(p) - r1;
        if( k > a*h ) return length(p-vec2(0.0,h)) - r2;
        return dot(p, vec2(a,b) ) - r1;
      }
      void main() {
        vec2 coord = vUv - 0.5;
        coord *= 10.0;
        float dropletDistance = sdUnevenCapsule(coord, 0.05, 0.0, 2.0);
        dropletDistance = 1.0 - smoothstep(0.0, 0.05, dropletDistance);
        float rainProgress = smoothstep(0.0, 0.5, uRainProgress);
        rainProgress = clamp(rainProgress, 0.0, 1.0);
        vec3 color = uDebugMode == 4 ? vec3(0.5, 0.75, 1.0) : vec3(1.0);
        gl_FragColor = vec4(color, dropletDistance * 0.1 * rainProgress);
      }
    `,
  });
}

export async function createSplashSystem({
  targetGroup,
  texture,
  count = 1000,
  rainProgress,
} = {}) {
  const geometry = new THREE.PlaneGeometry(0.2 * 0.2, 0.1 * 0.2);
  geometry.setAttribute(
    "aSplashProgress",
    new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
  );
  const material = createSplashMaterial({ texture, rainProgress });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const system = {
    mesh,
    samplers: [],
    y: [],
    initialY: [],
    rebuild() {
      system.samplers = [];
      targetGroup.updateMatrixWorld(true);
      targetGroup.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry?.getAttribute("normal")) return;
        const positionAttr = obj.geometry.getAttribute("position");
        const normalAttr = obj.geometry.getAttribute("normal");
        const weights = new Float32Array(positionAttr.count);
        const normal = new THREE.Vector3();
        for (let i = 0; i < positionAttr.count; i++) {
          normal.fromBufferAttribute(normalAttr, i);
          let skyWeight = normal.dot(new THREE.Vector3(0, 1, 0));
          skyWeight = skyWeight >= 0 ? 1 : 0;
          weights[i] = skyWeight;
        }
        obj.geometry.setAttribute(
          "skyWeight",
          new THREE.InstancedBufferAttribute(weights, 1),
        );
        const sampler = new MeshSurfaceSampler(obj);
        sampler.setWeightAttribute("skyWeight");
        sampler.build();
        system.samplers.push({ sampler, mesh: obj });
      });
    },
    update({ camera, delta }) {
      if (system.samplers.length === 0) return;
      const dummy = system._dummy;
      const progressAttr = mesh.geometry.getAttribute("aSplashProgress");
      const countPerMesh = Math.ceil(count / system.samplers.length);
      let j = 0;
      for (const { sampler, mesh: sourceMesh } of system.samplers) {
        for (let i = 0; i < countPerMesh && j < count; i++) {
          mesh.getMatrixAt(j, dummy.matrix);
          dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
          if (system.y[j] === undefined) {
            system.y[j] = 0;
            system.initialY[j] = 0;
          }
          system.y[j] -= delta * 2.5;
          if (system.y[j] < -0.2) {
            sampler.sample(dummy.position);
            dummy.position.applyMatrix4(sourceMesh.matrixWorld);
            dummy.position.y -= 0.04;
            system.y[j] = THREE.MathUtils.randFloat(-0.1, 2);
            system.initialY[j] = system.y[j];
            dummy.scale.x = THREE.MathUtils.randFloat(0.5, 1);
          }
          const progress = THREE.MathUtils.mapLinear(
            system.y[j],
            system.initialY[j],
            -0.2,
            1,
            0,
          );
          progressAttr.setX(j, progress);
          dummy.rotation.y = Math.atan2(
            camera.position.x - dummy.position.x,
            camera.position.z - dummy.position.z,
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(j, dummy.matrix);
          j++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      progressAttr.needsUpdate = true;
    },
    setDebugMode(mode) {
      mesh.material.uniforms.uDebugMode.value = rainPuddleDebugModes.get(mode) ?? 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    _dummy: new THREE.Object3D(),
  };
  system.rebuild();
  return system;
}

export function createSplashMaterial({ texture, rainProgress } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFlipBook: { value: texture },
      uRainProgress: rainProgress ?? { value: 0 },
      uDebugMode: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      attribute float aSplashProgress;
      varying vec3 vPosition;
      varying vec2 vUv;
      varying float vSplashProgress;
      void main() {
        vPosition = position;
        vUv = uv;
        vSplashProgress = aSplashProgress;
        vec3 p = position;
        p.y += 0.05;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uFlipBook;
      uniform float uRainProgress;
      uniform int uDebugMode;
      varying vec3 vPosition;
      varying vec2 vUv;
      varying float vSplashProgress;
      float mapLinear(float value, float inMin, float inMax, float outMin, float outMax) {
        return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
      }
      float fmod(float x, float y) {
        return x - y * trunc(x / y);
      }
      vec2 getFlipbookUv(
        vec2 uv,
        float width,
        float height,
        float tile,
        vec2 invert
      ) {
        tile = fmod(tile, width * height);
        vec2 tileCount = vec2(1.0) / vec2(width, height);
        float tileY = abs(invert.y * height - (floor(tile * tileCount.x) + invert.y * 1.0));
        float tileX = abs(invert.x * width - ((tile - width * floor(tile * tileCount.x)) + invert.x * 1.0));
        return (uv + vec2(tileX, tileY)) * tileCount;
      }
      void main() {
        float progress = mapLinear(vSplashProgress, 0.0, 0.3, 0.0, 1.0);
        progress = 1.0 - clamp(progress, 0.0, 1.0);
        float width = 4.0;
        float height = 5.0;
        float tiling = floor(progress * width * height);
        vec2 uv = getFlipbookUv(vUv, width, height, tiling, vec2(0.0, 1.0));
        vec4 texel = texture2D(uFlipBook, uv);
        float rainProgress = smoothstep(0.0, 0.5, uRainProgress);
        rainProgress = clamp(rainProgress, 0.0, 1.0);
        vec3 color = uDebugMode == 4 ? vec3(0.8, 0.9, 1.0) : texel.rgb;
        gl_FragColor = vec4(color, texel.a * 0.1 * rainProgress);
      }
    `,
  });
}
