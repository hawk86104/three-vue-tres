import * as THREE from "three";
import {
  MeshBVH,
  MeshBVHUniformStruct,
  SAH,
  shaderStructs,
  shaderIntersectFunction,
} from "three-mesh-bvh";

// Raytraced diamond material.
//
// The mesh is its own optical volume: the fragment shader refracts the camera
// ray into the gem, follows it against a GPU BVH of the same geometry for a
// bounded number of internal bounces, keeps reflecting while the ray is under
// total internal reflection, and samples an environment cube map with the ray
// that finally escapes. Dispersion ("fire") comes from resolving the exit ray
// three times with per-channel indices of refraction.
//
// Contract with the host:
// - `envMap` is the cube texture the escaped ray samples; assign the same map
//   used for the scene background/lighting so the gem refracts its world.
// - `camera` is the rendering camera. The material stores live references to
//   `camera.projectionMatrixInverse` and `camera.matrixWorld`, so uniforms
//   follow the camera with no per-frame copying.
// - `resolution` must track the drawing-buffer size in physical pixels
//   (`gl_FragCoord` space); call `setDiamondResolution` on resize. It feeds
//   the screen-ray reconstruction used for mip-correct environment gradients.
// - The geometry passed to `makeDiamond` must be watertight enough for
//   entry/exit refraction to make sense (a closed faceted gem). The BVH is
//   built from a non-indexed copy; the rendered geometry keeps its index.
//
// Runtime-tunable uniforms (host controls may expose them):
// - `bounces`  internal bounce budget, 1–10, step 1 (default 3);
// - `ior`      index of refraction, 1–5 (default 2.4, diamond);
// - `correctMips`  true = mip gradients from the ideal screen ray, false =
//   raw exit-ray gradients (aliases where adjacent pixels exit differently);
// - `chromaticAberration`  toggles the three-ray dispersion path;
// - `aberrationStrength`   per-channel IOR spread, 0–1 (default 0.01).

export const diamondControlRanges = {
  bounces: { min: 1, max: 10, step: 1 },
  ior: { min: 1, max: 5, step: 0.01 },
  aberrationStrength: { min: 0, max: 1, step: 0.0001 },
};

export function createDiamondMaterial({
  envMap,
  camera,
  resolution = new THREE.Vector2(1, 1),
  color = new THREE.Color(1, 1, 1),
  ior = 2.4,
  bounces = 3,
  correctMips = true,
  chromaticAberration = true,
  aberrationStrength = 0.01,
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: envMap },
      bvh: { value: new MeshBVHUniformStruct() },
      bounces: { value: bounces },
      color: { value: color },
      ior: { value: ior },
      correctMips: { value: correctMips },
      projectionMatrixInv: { value: camera.projectionMatrixInverse },
      viewMatrixInv: { value: camera.matrixWorld },
      chromaticAberration: { value: chromaticAberration },
      aberrationStrength: { value: aberrationStrength },
      resolution: { value: resolution },
    },
    vertexShader: /*glsl*/ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    uniform mat4 viewMatrixInv;
    void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = (viewMatrixInv * vec4(normalMatrix * normal, 0.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    }
    `,
    fragmentShader: /*glsl*/ `
    precision highp isampler2D;
    precision highp usampler2D;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    uniform samplerCube envMap;
    uniform float bounces;
    ${shaderStructs}
    ${shaderIntersectFunction}
    uniform BVH bvh;
    uniform float ior;
    uniform vec3 color;
    uniform bool correctMips;
    uniform bool chromaticAberration;
    uniform mat4 projectionMatrixInv;
    uniform mat4 viewMatrixInv;
    uniform mat4 modelMatrix;
    uniform vec2 resolution;
    uniform float aberrationStrength;
    vec3 totalInternalReflection(vec3 ro, vec3 rd, vec3 normal, float ior, mat4 modelMatrixInverse) {
        vec3 rayOrigin = ro;
        vec3 rayDirection = rd;
        rayDirection = refract(rayDirection, normal, 1.0 / ior);
        rayOrigin = vWorldPosition + rayDirection * 0.001;
        rayOrigin = (modelMatrixInverse * vec4(rayOrigin, 1.0)).xyz;
        rayDirection = normalize((modelMatrixInverse * vec4(rayDirection, 0.0)).xyz);
        for(float i = 0.0; i < bounces; i++) {
            uvec4 faceIndices = uvec4( 0u );
            vec3 faceNormal = vec3( 0.0, 0.0, 1.0 );
            vec3 barycoord = vec3( 0.0 );
            float side = 1.0;
            float dist = 0.0;
            bvhIntersectFirstHit( bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist );
            vec3 hitPos = rayOrigin + rayDirection * max(dist - 0.001, 0.0);
            vec3 tempDir = refract(rayDirection, faceNormal, ior);
            if (length(tempDir) != 0.0) {
                rayDirection = tempDir;
                break;
            }
            rayDirection = reflect(rayDirection, faceNormal);
            rayOrigin = hitPos + rayDirection * 0.01;
        }
        rayDirection = normalize((modelMatrix * vec4(rayDirection, 0.0)).xyz);
        return rayDirection;
    }
    void main() {
        mat4 modelMatrixInverse = inverse(modelMatrix);
        vec2 uv = gl_FragCoord.xy / resolution;
        vec3 directionCamPerfect = (projectionMatrixInv * vec4(uv * 2.0 - 1.0, 0.0, 1.0)).xyz;
        directionCamPerfect = (viewMatrixInv * vec4(directionCamPerfect, 0.0)).xyz;
        directionCamPerfect = normalize(directionCamPerfect);
        vec3 normal = vNormal;
        vec3 rayOrigin = cameraPosition;
        vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
        vec3 finalColor;
        if (chromaticAberration) {
        vec3 rayDirectionR = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior * (1.0 - aberrationStrength), 1.0), modelMatrixInverse);
        vec3 rayDirectionG = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior, 1.0), modelMatrixInverse);
        vec3 rayDirectionB = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior * (1.0 + aberrationStrength), 1.0), modelMatrixInverse);
        float finalColorR = textureGrad(envMap, rayDirectionR, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).r;
        float finalColorG = textureGrad(envMap, rayDirectionG, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).g;
        float finalColorB = textureGrad(envMap, rayDirectionB, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).b;
        finalColor = vec3(finalColorR, finalColorG, finalColorB) * color;
        } else {
            rayDirection = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior, 1.0), modelMatrixInverse);
            finalColor = textureGrad(envMap, rayDirection, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).rgb;
            finalColor *= color;
        }
        gl_FragColor = vec4(vec3(finalColor), 1.0);
    }
    `,
  });
}

// Builds the gem: BVH over a non-indexed copy of the geometry (SAH split for
// tight leaf bounds — worth it on a static gem traced every pixel), material,
// and the uniform-struct upload that exposes the BVH to the fragment shader.
// The BVH is attached to the geometry as `boundsTree`, so BVH helpers and
// raycast acceleration can reuse it.
export function makeDiamond(geometry, options = {}) {
  geometry.boundsTree = new MeshBVH(geometry.toNonIndexed(), { strategy: SAH });
  const diamond = new THREE.Mesh(geometry, createDiamondMaterial(options));
  diamond.material.uniforms.bvh.value.updateFrom(geometry.boundsTree);
  diamond.castShadow = true;
  diamond.receiveShadow = true;
  return diamond;
}

// The shader reconstructs the ideal per-pixel camera ray from gl_FragCoord,
// so `resolution` must equal the drawing-buffer size in physical pixels.
export function setDiamondResolution(material, width, height) {
  material.uniforms.resolution.value.set(width, height);
}
