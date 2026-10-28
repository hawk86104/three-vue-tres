import { Pass as Fe, ShaderPass as K, Resolution as $, Effect as ze, EffectAttribute as We } from "postprocessing";
import { Vector3 as p, Vector2 as f, Matrix4 as m, Object3D as se, Box3 as Be, Uniform as r, GLSL3 as G, Vector4 as S, RawShaderMaterial as Q, Camera as we, WebGLRenderTarget as Ge, HalfFloatType as Ce, LinearFilter as B, RedFormat as Ve, WebGLArrayRenderTarget as ke, EventDispatcher as je, Matrix3 as Ye, Texture as ce, Data3DTexture as le } from "three";
import { AtmosphereMaterialBase as Ze, AtmosphereParameters as Te, getAltitudeCorrectionOffset as qe } from "../atmosphere/index.js";
import { lerp as De, defineInt as L, defineExpression as Ee, define as x, defineFloat as ee, unrollLoops as V, resolveIncludes as H, reinterpretType as Ke, Geodetic as $e, definePropertyShorthand as he, defineUniformShorthand as ue } from "../geospatial/index.js";
import { runtime as de, definitions as pe, common as fe } from "../atmosphere/shaders/bruneton.js";
import { vogelDisk as Xe, interleavedGradientNoise as Je, cascadedShadowMaps as Qe, raySphereIntersection as Ae, generators as et, turbo as _e, math as Pe, depth as tt } from "../geospatial/shaders.js";
class k {
  constructor(e = 0, t = 0, n = 0, a = 0) {
    this.expTerm = e, this.exponent = t, this.linearTerm = n, this.constantTerm = a;
  }
  set(e = 0, t = 0, n = 0, a = 0) {
    return this.expTerm = e, this.exponent = t, this.linearTerm = n, this.constantTerm = a, this;
  }
  clone() {
    return new k(
      this.expTerm,
      this.exponent,
      this.linearTerm,
      this.constantTerm
    );
  }
  copy(e) {
    return this.expTerm = e.expTerm, this.exponent = e.exponent, this.linearTerm = e.linearTerm, this.constantTerm = e.constantTerm, this;
  }
}
const nt = [
  "channel",
  "altitude",
  "height",
  "densityScale",
  "shapeAmount",
  "shapeDetailAmount",
  "weatherExponent",
  "shapeAlteringBias",
  "coverageFilterWidth",
  "shadow",
  "densityProfile"
];
function at(o, e) {
  if (e != null)
    for (const t of nt) {
      const n = e[t];
      n != null && (o[t] instanceof k ? o[t].copy(n) : o[t] = n);
    }
}
const b = class b {
  constructor(e) {
    this.channel = "r", this.altitude = 0, this.height = 0, this.densityScale = 0.2, this.shapeAmount = 1, this.shapeDetailAmount = 1, this.weatherExponent = 1, this.shapeAlteringBias = 0.35, this.coverageFilterWidth = 0.6, this.densityProfile = new k(0, 0, 0.75, 0.25), this.shadow = !1, this.set(e);
  }
  set(e) {
    return at(this, e), this;
  }
  clone() {
    return new b(this);
  }
  copy(e) {
    return this.channel = e.channel, this.altitude = e.altitude, this.height = e.height, this.densityScale = e.densityScale, this.shapeAmount = e.shapeAmount, this.shapeDetailAmount = e.shapeDetailAmount, this.weatherExponent = e.weatherExponent, this.shapeAlteringBias = e.shapeAlteringBias, this.coverageFilterWidth = e.coverageFilterWidth, this.densityProfile.copy(e.densityProfile), this.shadow = e.shadow, this;
  }
};
b.DEFAULT = /* @__PURE__ */ new b();
let w = b;
const R = /* @__PURE__ */ Array.from(
  { length: 8 },
  () => ({ value: 0, flag: 0 })
), I = /* @__PURE__ */ Array.from(
  { length: 3 },
  () => ({ min: 0, max: 0 })
);
function it(o, e) {
  return o.value !== e.value ? o.value - e.value : o.flag - e.flag;
}
const U = class U extends Array {
  constructor(e) {
    super(
      new w(e?.[0]),
      new w(e?.[1]),
      new w(e?.[2]),
      new w(e?.[3])
    );
  }
  set(e) {
    return this[0].set(e?.[0]), this[1].set(e?.[1]), this[2].set(e?.[2]), this[3].set(e?.[3]), this;
  }
  reset() {
    return this[0].copy(w.DEFAULT), this[1].copy(w.DEFAULT), this[2].copy(w.DEFAULT), this[3].copy(w.DEFAULT), this;
  }
  clone() {
    return new U(this);
  }
  copy(e) {
    return this[0].copy(e[0]), this[1].copy(e[1]), this[2].copy(e[2]), this[3].copy(e[3]), this;
  }
  get localWeatherChannels() {
    return this[0].channel + this[1].channel + this[2].channel + this[3].channel;
  }
  packValues(e, t) {
    return t.set(this[0][e], this[1][e], this[2][e], this[3][e]);
  }
  packSums(e, t, n) {
    return n.set(
      this[0][e] + this[0][t],
      this[1][e] + this[1][t],
      this[2][e] + this[2][t],
      this[3][e] + this[3][t]
    );
  }
  packDensityProfiles(e, t) {
    return t.set(
      this[0].densityProfile[e],
      this[1].densityProfile[e],
      this[2].densityProfile[e],
      this[3].densityProfile[e]
    );
  }
  // Redundant, but need to avoid creating garbage here as this runs every frame.
  packIntervalHeights(e, t) {
    for (let s = 0; s < 4; ++s) {
      const l = this[s];
      let h = R[s];
      h.value = l.altitude, h.flag = 0, h = R[s + 4], h.value = l.altitude + l.height, h.flag = 1;
    }
    R.sort(it);
    let n = 0, a = 0;
    for (let s = 0; s < R.length; ++s) {
      const { value: l, flag: h } = R[s];
      if (a === 0 && s > 0) {
        const u = I[n++];
        u.min = R[s - 1].value, u.max = l;
      }
      a += h === 0 ? 1 : -1;
    }
    for (; n < 3; ++n) {
      const s = I[n];
      s.min = 0, s.max = 0;
    }
    let i = I[0];
    e.x = i.min, t.x = i.max, i = I[1], e.y = i.min, t.y = i.max, i = I[2], e.z = i.min, t.z = i.max;
  }
};
U.DEFAULT = /* @__PURE__ */ new U([
  {
    channel: "r",
    altitude: 750,
    height: 650,
    densityScale: 0.2,
    shapeAmount: 1,
    shapeDetailAmount: 1,
    weatherExponent: 1,
    shapeAlteringBias: 0.35,
    coverageFilterWidth: 0.6,
    shadow: !0
  },
  {
    channel: "g",
    altitude: 1e3,
    height: 1200,
    densityScale: 0.2,
    shapeAmount: 1,
    shapeDetailAmount: 1,
    weatherExponent: 1,
    shapeAlteringBias: 0.35,
    coverageFilterWidth: 0.6,
    shadow: !0
  },
  {
    channel: "b",
    altitude: 7500,
    height: 500,
    densityScale: 3e-3,
    shapeAmount: 0.4,
    shapeDetailAmount: 0,
    weatherExponent: 1,
    shapeAlteringBias: 0.35,
    coverageFilterWidth: 0.5
  },
  { channel: "a" }
]);
let X = U;
var rt = "production" === "production", me = "Invariant failed";
function A(o, e) {
  if (!o) {
    if (rt)
      throw new Error(me);
    var t = me;
    throw new Error(t);
  }
}
class F {
  constructor(e, t) {
    this.near = [new p(), new p(), new p(), new p()], this.far = [new p(), new p(), new p(), new p()], e != null && t != null && this.setFromCamera(e, t);
  }
  clone() {
    return new F().copy(this);
  }
  copy(e) {
    for (let t = 0; t < 4; ++t)
      this.near[t].copy(e.near[t]), this.far[t].copy(e.far[t]);
    return this;
  }
  setFromCamera(e, t) {
    const n = e.isOrthographicCamera === !0, a = e.projectionMatrixInverse;
    this.near[0].set(1, 1, -1), this.near[1].set(1, -1, -1), this.near[2].set(-1, -1, -1), this.near[3].set(-1, 1, -1);
    for (let i = 0; i < 4; ++i)
      this.near[i].applyMatrix4(a);
    this.far[0].set(1, 1, 1), this.far[1].set(1, -1, 1), this.far[2].set(-1, -1, 1), this.far[3].set(-1, 1, 1);
    for (let i = 0; i < 4; ++i) {
      const s = this.far[i];
      s.applyMatrix4(a);
      const l = Math.abs(s.z);
      n ? s.z *= Math.min(t / l, 1) : s.multiplyScalar(Math.min(t / l, 1));
    }
    return this;
  }
  split(e, t = []) {
    for (let n = 0; n < e.length; ++n) {
      const a = t[n] ??= new F();
      if (n === 0)
        for (let i = 0; i < 4; ++i)
          a.near[i].copy(this.near[i]);
      else
        for (let i = 0; i < 4; ++i)
          a.near[i].lerpVectors(
            this.near[i],
            this.far[i],
            e[n - 1]
          );
      if (n === e.length - 1)
        for (let i = 0; i < 4; ++i)
          a.far[i].copy(this.far[i]);
      else
        for (let i = 0; i < 4; ++i)
          a.far[i].lerpVectors(
            this.near[i],
            this.far[i],
            e[n]
          );
    }
    return t.length = e.length, t;
  }
  applyMatrix4(e) {
    for (let t = 0; t < 4; ++t)
      this.near[t].applyMatrix4(e), this.far[t].applyMatrix4(e);
    return this;
  }
}
const ot = {
  uniform: (o, e, t, n, a = []) => {
    for (let i = 0; i < o; ++i)
      a[i] = (e + (t - e) * (i + 1) / o) / t;
    return a.length = o, a;
  },
  logarithmic: (o, e, t, n, a = []) => {
    for (let i = 0; i < o; ++i)
      a[i] = e * (t / e) ** ((i + 1) / o) / t;
    return a.length = o, a;
  },
  practical: (o, e, t, n = 0.5, a = []) => {
    for (let i = 0; i < o; ++i) {
      const s = (e + (t - e) * (i + 1) / o) / t, l = e * (t / e) ** ((i + 1) / o) / t;
      a[i] = De(s, l, n);
    }
    return a.length = o, a;
  }
};
function st(o, e, t, n, a, i = []) {
  return ot[o](e, t, n, a, i);
}
const ve = /* @__PURE__ */ new p(), ge = /* @__PURE__ */ new p(), ct = /* @__PURE__ */ new m(), Se = /* @__PURE__ */ new m(), lt = /* @__PURE__ */ new F(), ht = /* @__PURE__ */ new Be(), ut = {
  maxFar: null,
  farScale: 1,
  splitMode: "practical",
  splitLambda: 0.5,
  margin: 0,
  fade: !0
};
class dt {
  constructor(e) {
    this.cascades = [], this.mapSize = new f(), this.cameraFrustum = new F(), this.frusta = [], this.splits = [], this._far = 0;
    const {
      cascadeCount: t,
      mapSize: n,
      maxFar: a,
      farScale: i,
      splitMode: s,
      splitLambda: l,
      margin: h,
      fade: u
    } = {
      ...ut,
      ...e
    };
    this.cascadeCount = t, this.mapSize.copy(n), this.maxFar = a, this.farScale = i, this.splitMode = s, this.splitLambda = l, this.margin = h, this.fade = u;
  }
  get cascadeCount() {
    return this.cascades.length;
  }
  set cascadeCount(e) {
    if (e !== this.cascadeCount) {
      for (let t = 0; t < e; ++t)
        this.cascades[t] ??= {
          interval: new f(),
          matrix: new m(),
          inverseMatrix: new m(),
          projectionMatrix: new m(),
          inverseProjectionMatrix: new m(),
          viewMatrix: new m(),
          inverseViewMatrix: new m()
        };
      this.cascades.length = e;
    }
  }
  get far() {
    return this._far;
  }
  updateIntervals(e) {
    const t = this.cascadeCount, n = this.splits, a = this.far;
    st(
      this.splitMode,
      t,
      e.near,
      a,
      this.splitLambda,
      n
    ), this.cameraFrustum.setFromCamera(e, a), this.cameraFrustum.split(n, this.frusta);
    const i = this.cascades;
    for (let s = 0; s < t; ++s)
      i[s].interval.set(n[s - 1] ?? 0, n[s] ?? 0);
  }
  getFrustumRadius(e, t) {
    const n = t.near, a = t.far;
    let i = Math.max(
      a[0].distanceTo(a[2]),
      a[0].distanceTo(n[2])
    );
    if (this.fade) {
      const s = e.near, l = this.far, h = a[0].z / (l - s);
      i += 0.25 * h ** 2 * (l - s);
    }
    return i * 0.5;
  }
  updateMatrices(e, t, n = 1) {
    const a = ct.lookAt(
      ve.setScalar(0),
      ge.copy(t).multiplyScalar(-1),
      se.DEFAULT_UP
    ), i = Se.multiplyMatrices(
      Se.copy(a).invert(),
      e.matrixWorld
    ), s = this.frusta, l = this.cascades;
    A(s.length === l.length);
    const h = this.margin, u = this.mapSize;
    for (let d = 0; d < s.length; ++d) {
      const v = s[d], C = l[d], D = this.getFrustumRadius(e, s[d]), P = -D, O = D, ne = D, ae = -D;
      C.projectionMatrix.makeOrthographic(
        P,
        O,
        ne,
        ae,
        -this.margin,
        // near
        D * 2 + this.margin
        // far
      );
      const { near: Ue, far: He } = lt.copy(v).applyMatrix4(i), z = ht.makeEmpty();
      for (let W = 0; W < 4; W++)
        z.expandByPoint(Ue[W]), z.expandByPoint(He[W]);
      const E = z.getCenter(ve);
      E.z = z.max.z + h;
      const ie = (O - P) / u.width, re = (ne - ae) / u.height;
      E.x = Math.round(E.x / ie) * ie, E.y = Math.round(E.y / re) * re, E.applyMatrix4(a);
      const oe = ge.copy(t).multiplyScalar(n).add(E);
      C.inverseViewMatrix.lookAt(E, oe, se.DEFAULT_UP).setPosition(oe);
    }
  }
  update(e, t, n) {
    this._far = this.maxFar != null ? Math.min(this.maxFar, e.far * this.farScale) : e.far * this.farScale, this.updateIntervals(e), this.updateMatrices(e, t, n);
    const a = this.cascades, i = this.cascadeCount;
    for (let s = 0; s < i; ++s) {
      const {
        matrix: l,
        inverseMatrix: h,
        projectionMatrix: u,
        inverseProjectionMatrix: d,
        viewMatrix: v,
        inverseViewMatrix: C
      } = a[s];
      d.copy(u).invert(), v.copy(C).invert(), l.copy(u).multiply(v), h.copy(C).multiply(d);
    }
  }
}
const ye = [
  0,
  8,
  2,
  10,
  12,
  4,
  14,
  6,
  3,
  11,
  1,
  9,
  15,
  7,
  13,
  5
], Oe = /* @__PURE__ */ ye.reduce((o, e, t) => {
  const n = new f();
  for (let a = 0; a < 16; ++a)
    if (ye[a] === t) {
      n.set((a % 4 + 0.5) / 4, (Math.floor(a / 4) + 0.5) / 4);
      break;
    }
  return [...o, n];
}, []), pt = {
  resolutionScale: 1,
  lightShafts: !0,
  shapeDetail: !0,
  turbulence: !0,
  haze: !0,
  clouds: {
    multiScatteringOctaves: 8,
    accurateSunSkyLight: !0,
    accuratePhaseFunction: !1,
    // Primary raymarch
    maxIterationCount: 500,
    minStepSize: 50,
    maxStepSize: 1e3,
    maxRayDistance: 2e5,
    perspectiveStepScale: 1.01,
    minDensity: 1e-5,
    minExtinction: 1e-5,
    minTransmittance: 0.01,
    // Secondary raymarch
    maxIterationCountToGround: 3,
    maxIterationCountToSun: 2,
    minSecondaryStepSize: 100,
    secondaryStepScale: 2,
    // Shadow length
    maxShadowLengthIterationCount: 500,
    minShadowLengthStepSize: 50,
    maxShadowLengthRayDistance: 2e5
  },
  shadow: {
    cascadeCount: 3,
    mapSize: /* @__PURE__ */ new f(512, 512),
    // Primary raymarch
    maxIterationCount: 50,
    minStepSize: 100,
    maxStepSize: 1e3,
    minDensity: 1e-5,
    minExtinction: 1e-5,
    minTransmittance: 1e-4
  }
}, c = pt, ft = {
  // TODO: We cloud decrease multi-scattering octaves for lower quality presets,
  // but it leads to a loss of higher frequency scattering, making it darker
  // overall, which suggests the need for a fudge factor to scale the radiance.
  low: {
    ...c,
    lightShafts: !1,
    // Expensive
    shapeDetail: !1,
    // Expensive
    turbulence: !1,
    // Expensive
    clouds: {
      ...c.clouds,
      accurateSunSkyLight: !1,
      // Greatly reduces texel reads.
      maxIterationCount: 200,
      minStepSize: 100,
      maxRayDistance: 1e5,
      minDensity: 1e-4,
      minExtinction: 1e-4,
      minTransmittance: 0.1,
      // Makes the primary march terminate earlier.
      maxIterationCountToGround: 0,
      // Expensive
      maxIterationCountToSun: 1
      // Only 1 march makes big difference
    },
    shadow: {
      ...c.shadow,
      maxIterationCount: 25,
      minDensity: 1e-4,
      minExtinction: 1e-4,
      minTransmittance: 0.01,
      // Makes the primary march terminate earlier.
      cascadeCount: 2,
      // Obvious
      mapSize: /* @__PURE__ */ new f(256, 256)
      // Obvious
    }
  },
  medium: {
    ...c,
    lightShafts: !1,
    // Expensive
    turbulence: !1,
    // Expensive
    clouds: {
      ...c.clouds,
      minDensity: 1e-4,
      minExtinction: 1e-4,
      accurateSunSkyLight: !1,
      maxIterationCountToSun: 2,
      maxIterationCountToGround: 1
    },
    shadow: {
      ...c.shadow,
      minDensity: 1e-4,
      minExtinction: 1e-4,
      mapSize: /* @__PURE__ */ new f(256, 256)
    }
  },
  high: c,
  // Consider high quality preset as default.
  ultra: {
    ...c,
    clouds: {
      ...c.clouds,
      minStepSize: 10
    },
    shadow: {
      ...c.shadow,
      mapSize: /* @__PURE__ */ new f(1024, 1024)
    }
  }
}, mt = `precision highp float;
precision highp sampler3D;
precision highp sampler2DArray;

#include <common>
#include <packing>

#include "core/depth"
#include "core/math"
#include "core/turbo"
#include "core/generators"
#include "core/raySphereIntersection"
#include "core/cascadedShadowMaps"
#include "core/interleavedGradientNoise"
#include "core/vogelDisk"

#include "atmosphere/bruneton/definitions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "atmosphere/bruneton/common"
#include "atmosphere/bruneton/runtime"

#include "types"
#include "parameters"
#include "clouds"

#if !defined(RECIPROCAL_PI4)
#define RECIPROCAL_PI4 0.07957747154594767
#endif // !defined(RECIPROCAL_PI4)

uniform sampler2D depthBuffer;
uniform mat4 viewMatrix;
uniform mat4 reprojectionMatrix;
uniform mat4 viewReprojectionMatrix;
uniform float cameraNear;
uniform float cameraFar;
uniform float cameraHeight;
uniform vec2 temporalJitter;
uniform vec2 targetUvScale;
uniform float mipLevelScale;

// Scattering
const vec2 scatterAnisotropy = vec2(SCATTER_ANISOTROPY_1, SCATTER_ANISOTROPY_2);
const float scatterAnisotropyMix = SCATTER_ANISOTROPY_MIX;
uniform float skyLightScale;
uniform float groundBounceScale;
uniform float powderScale;
uniform float powderExponent;

// Primary raymarch
uniform int maxIterationCount;
uniform float minStepSize;
uniform float maxStepSize;
uniform float maxRayDistance;
uniform float perspectiveStepScale;

// Secondary raymarch
uniform int maxIterationCountToSun;
uniform int maxIterationCountToGround;
uniform float minSecondaryStepSize;
uniform float secondaryStepScale;

// Beer shadow map
uniform sampler2DArray shadowBuffer;
uniform vec2 shadowTexelSize;
uniform vec2 shadowIntervals[SHADOW_CASCADE_COUNT];
uniform mat4 shadowMatrices[SHADOW_CASCADE_COUNT];
uniform float shadowFar;
uniform float maxShadowFilterRadius;

// Shadow length
#ifdef SHADOW_LENGTH
uniform int maxShadowLengthIterationCount;
uniform float minShadowLengthStepSize;
uniform float maxShadowLengthRayDistance;
#endif // SHADOW_LENGTH

in vec2 vUv;
in vec3 vCameraPosition;
in vec3 vCameraDirection; // Direction to the center of screen
in vec3 vRayDirection; // Direction to the texel
in vec3 vViewPosition;
in GroundIrradiance vGroundIrradiance;
in CloudsIrradiance vCloudsIrradiance;

layout(location = 0) out vec4 outputColor;
layout(location = 1) out vec3 outputDepthVelocity;
#ifdef SHADOW_LENGTH
layout(location = 2) out float outputShadowLength;
#endif // SHADOW_LENGTH

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  #else // PERSPECTIVE_CAMERA
  return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  #endif // PERSPECTIVE_CAMERA
}

vec3 ecefToWorld(const vec3 positionECEF) {
  return (ecefToWorldMatrix * vec4(positionECEF - altitudeCorrection, 1.0)).xyz;
}

vec2 getShadowUv(const vec3 worldPosition, const int cascadeIndex) {
  vec4 clip = shadowMatrices[cascadeIndex] * vec4(worldPosition, 1.0);
  clip /= clip.w;
  return clip.xy * 0.5 + 0.5;
}

float getDistanceToShadowTop(const vec3 rayPosition) {
  // Distance to the top of the shadows along the sun direction, which matches
  // the ray origin of BSM.
  return raySphereSecondIntersection(
    rayPosition,
    sunDirection,
    vec3(0.0),
    bottomRadius + shadowTopHeight
  );
}

#ifdef DEBUG_SHOW_CASCADES

const vec3 cascadeColors[4] = vec3[4](
  vec3(1.0, 0.0, 0.0),
  vec3(0.0, 1.0, 0.0),
  vec3(0.0, 0.0, 1.0),
  vec3(1.0, 1.0, 0.0)
);

vec3 getCascadeColor(const vec3 rayPosition) {
  vec3 worldPosition = ecefToWorld(rayPosition);
  int cascadeIndex = getCascadeIndex(
    viewMatrix,
    worldPosition,
    shadowIntervals,
    cameraNear,
    shadowFar
  );
  vec2 uv = getShadowUv(worldPosition, cascadeIndex);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec3(1.0);
  }
  return cascadeColors[cascadeIndex];
}

vec3 getFadedCascadeColor(const vec3 rayPosition, const float jitter) {
  vec3 worldPosition = ecefToWorld(rayPosition);
  int cascadeIndex = getFadedCascadeIndex(
    viewMatrix,
    worldPosition,
    shadowIntervals,
    cameraNear,
    shadowFar,
    jitter
  );
  return cascadeIndex >= 0
    ? cascadeColors[cascadeIndex]
    : vec3(1.0);
}

#endif // DEBUG_SHOW_CASCADES

float readShadowOpticalDepth(
  const vec2 uv,
  const float distanceToTop,
  const float distanceOffset,
  const int cascadeIndex
) {
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth, a: maxOpticalDepthTail
  // Also see the discussion here: https://x.com/shotamatsuda/status/1885322308908442106
  vec4 shadow = texture(shadowBuffer, vec3(uv, float(cascadeIndex)));
  float distanceToFront = max(0.0, distanceToTop - distanceOffset - shadow.r);
  return min(shadow.b + shadow.a, shadow.g * distanceToFront);
}

float sampleShadowOpticalDepthPCF(
  const vec3 worldPosition,
  const float distanceToTop,
  const float distanceOffset,
  const float radius,
  const int cascadeIndex
) {
  vec2 uv = getShadowUv(worldPosition, cascadeIndex);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }
  if (radius < 0.1) {
    return readShadowOpticalDepth(uv, distanceToTop, distanceOffset, cascadeIndex);
  }
  float sum = 0.0;
  vec2 offset;
  #pragma unroll_loop_start
  for (int i = 0; i < 16; ++i) {
    #if UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
    offset = vogelDisk(
      UNROLLED_LOOP_INDEX,
      SHADOW_SAMPLE_COUNT,
      interleavedGradientNoise(gl_FragCoord.xy + temporalJitter * resolution) * PI2
    );
    sum += readShadowOpticalDepth(
      uv + offset * radius * shadowTexelSize,
      distanceToTop,
      distanceOffset,
      cascadeIndex
    );
    #endif // UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
  }
  #pragma unroll_loop_end
  return sum / float(SHADOW_SAMPLE_COUNT);
}

float sampleShadowOpticalDepth(
  const vec3 rayPosition,
  const float distanceOffset,
  const float radius,
  const float jitter
) {
  float distanceToTop = getDistanceToShadowTop(rayPosition);
  if (distanceToTop <= 0.0) {
    return 0.0;
  }
  vec3 worldPosition = ecefToWorld(rayPosition);
  int cascadeIndex = getFadedCascadeIndex(
    viewMatrix,
    worldPosition,
    shadowIntervals,
    cameraNear,
    shadowFar,
    jitter
  );
  return cascadeIndex >= 0
    ? sampleShadowOpticalDepthPCF(
      worldPosition,
      distanceToTop,
      distanceOffset,
      radius,
      cascadeIndex
    )
    : 0.0;
}

#ifdef DEBUG_SHOW_SHADOW_MAP
vec4 getCascadedShadowMaps(vec2 uv) {
  vec4 coord = vec4(vUv, vUv - 0.5) * 2.0;
  vec4 shadow = vec4(0.0);
  if (uv.y > 0.5) {
    if (uv.x < 0.5) {
      shadow = texture(shadowBuffer, vec3(coord.xw, 0.0));
    } else {
      #if SHADOW_CASCADE_COUNT > 1
      shadow = texture(shadowBuffer, vec3(coord.zw, 1.0));
      #endif // SHADOW_CASCADE_COUNT > 1
    }
  } else {
    if (uv.x < 0.5) {
      #if SHADOW_CASCADE_COUNT > 2
      shadow = texture(shadowBuffer, vec3(coord.xy, 2.0));
      #endif // SHADOW_CASCADE_COUNT > 2
    } else {
      #if SHADOW_CASCADE_COUNT > 3
      shadow = texture(shadowBuffer, vec3(coord.zy, 3.0));
      #endif // SHADOW_CASCADE_COUNT > 3
    }
  }

  #if !defined(DEBUG_SHOW_SHADOW_MAP_TYPE)
  #define DEBUG_SHOW_SHADOW_MAP_TYPE 0
  #endif // !defined(DEBUG_SHOW_SHADOW_MAP_TYPE

  const float frontDepthScale = 1e-5;
  const float meanExtinctionScale = 10.0;
  const float maxOpticalDepthScale = 0.01;
  vec3 color;
  #if DEBUG_SHOW_SHADOW_MAP_TYPE == 1
  color = vec3(shadow.r * frontDepthScale);
  #elif DEBUG_SHOW_SHADOW_MAP_TYPE == 2
  color = vec3(shadow.g * meanExtinctionScale);
  #elif DEBUG_SHOW_SHADOW_MAP_TYPE == 3
  color = vec3((shadow.b + shadow.a) * maxOpticalDepthScale);
  #else // DEBUG_SHOW_SHADOW_MAP_TYPE
  color =
    (shadow.rgb + vec3(0.0, 0.0, shadow.a)) *
    vec3(frontDepthScale, meanExtinctionScale, maxOpticalDepthScale);
  #endif // DEBUG_SHOW_SHADOW_MAP_TYPE
  return vec4(color, 1.0);
}
#endif // DEBUG_SHOW_SHADOW_MAP

vec2 henyeyGreenstein(const vec2 g, const float cosTheta) {
  vec2 g2 = g * g;
  // prettier-ignore
  return RECIPROCAL_PI4 *
    ((1.0 - g2) / max(vec2(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5))));
}

#ifdef ACCURATE_PHASE_FUNCTION

float draine(float u, float g, float a) {
  float g2 = g * g;
  // prettier-ignore
  return (1.0 - g2) *
    (1.0 + a * u * u) /
    (4.0 * (1.0 + a * (1.0 + 2.0 * g2) / 3.0) * PI * pow(1.0 + g2 - 2.0 * g * u, 1.5));
}

// Numerically-fitted large particles (d=10) phase function It won't be
// plausible without a more precise multiple scattering.
// Reference: https://research.nvidia.com/labs/rtr/approximate-mie/
float phaseFunction(const float cosTheta, const float attenuation) {
  const float gHG = 0.988176691700256; // exp(-0.0990567/(d-1.67154))
  const float gD = 0.5556712547839497; // exp(-2.20679/(d+3.91029) - 0.428934)
  const float alpha = 21.995520856274638; // exp(3.62489 - 8.29288/(d+5.52825))
  const float weight = 0.4819554318404214; // exp(-0.599085/(d-0.641583)-0.665888)
  return mix(
    henyeyGreenstein(vec2(gHG) * attenuation, cosTheta).x,
    draine(cosTheta, gD * attenuation, alpha),
    weight
  );
}

#else // ACCURATE_PHASE_FUNCTION

float phaseFunction(const float cosTheta, const float attenuation) {
  const vec2 g = scatterAnisotropy;
  const vec2 weights = vec2(1.0 - scatterAnisotropyMix, scatterAnisotropyMix);
  // A similar approximation is described in the Frostbite's paper, where phase
  // angle is attenuated instead of anisotropy.
  return dot(henyeyGreenstein(g * attenuation, cosTheta), weights);
}

#endif // ACCURATE_PHASE_FUNCTION

float phaseFunction(const float cosTheta) {
  return phaseFunction(cosTheta, 1.0);
}

float marchOpticalDepth(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const int maxIterationCount,
  const float mipLevel,
  const float jitter,
  out float rayDistance
) {
  int iterationCount = int(
    max(0.0, remap(mipLevel, 0.0, 1.0, float(maxIterationCount + 1), 1.0) - jitter)
  );
  if (iterationCount == 0) {
    // Fudge factor to approximate the mean optical depth.
    // TODO: Remove it.
    return 0.5;
  }
  float stepSize = minSecondaryStepSize / float(iterationCount);
  float nextDistance = stepSize * jitter;
  float opticalDepth = 0.0;
  for (int i = 0; i < iterationCount; ++i) {
    rayDistance = nextDistance;
    vec3 position = rayDistance * rayDirection + rayOrigin;
    vec2 uv = getGlobeUv(position);
    float height = length(position) - bottomRadius;
    WeatherSample weather = sampleWeather(uv, height, mipLevel);
    MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);
    opticalDepth += media.extinction * stepSize;
    nextDistance += stepSize;
    stepSize *= secondaryStepScale;
  }
  return opticalDepth;
}

float marchOpticalDepth(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const int maxIterationCount,
  const float mipLevel,
  const float jitter
) {
  float rayDistance;
  return marchOpticalDepth(
    rayOrigin,
    rayDirection,
    maxIterationCount,
    mipLevel,
    jitter,
    rayDistance
  );
}

float approximateMultipleScattering(const float opticalDepth, const float cosTheta) {
  // Multiple scattering approximation
  // See: https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf
  // a: attenuation, b: contribution, c: phase attenuation
  vec3 coeffs = vec3(1.0); // [a, b, c]
  const vec3 attenuation = vec3(0.5, 0.5, 0.5); // Should satisfy a <= b
  float scattering = 0.0;
  float beerLambert;
  #pragma unroll_loop_start
  for (int i = 0; i < 12; ++i) {
    #if UNROLLED_LOOP_INDEX < MULTI_SCATTERING_OCTAVES
    beerLambert = exp(-opticalDepth * coeffs.y);
    scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);
    coeffs *= attenuation;
    #endif // UNROLLED_LOOP_INDEX < MULTI_SCATTERING_OCTAVES
  }
  #pragma unroll_loop_end
  return scattering;
}

// TODO: Construct spherical harmonics of degree 2 using 2 sample points
// positioned near the horizon occlusion points on the sun direction plane.
vec3 getGroundSunSkyIrradiance(
  const vec3 position,
  const vec3 surfaceNormal,
  const float height,
  out vec3 skyIrradiance
) {
  #ifdef ACCURATE_SUN_SKY_LIGHT
  return GetSunAndSkyIrradiance(
    (position - surfaceNormal * height) * METER_TO_LENGTH_UNIT,
    surfaceNormal,
    sunDirection,
    skyIrradiance
  );
  #else // ACCURATE_SUN_SKY_LIGHT
  skyIrradiance = vGroundIrradiance.sky;
  return vGroundIrradiance.sun;
  #endif // ACCURATE_SUN_SKY_LIGHT
}

vec3 getCloudsSunSkyIrradiance(const vec3 position, const float height, out vec3 skyIrradiance) {
  #ifdef ACCURATE_SUN_SKY_LIGHT
  return GetSunAndSkyScalarIrradiance(position * METER_TO_LENGTH_UNIT, sunDirection, skyIrradiance);
  #else // ACCURATE_SUN_SKY_LIGHT
  float alpha = remapClamped(height, minHeight, maxHeight);
  skyIrradiance = mix(vCloudsIrradiance.minSky, vCloudsIrradiance.maxSky, alpha);
  return mix(vCloudsIrradiance.minSun, vCloudsIrradiance.maxSun, alpha);
  #endif // ACCURATE_SUN_SKY_LIGHT
}

#ifdef GROUND_BOUNCE
vec3 approximateRadianceFromGround(
  const vec3 position,
  const vec3 surfaceNormal,
  const float height,
  const float mipLevel,
  const float jitter
) {
  float opticalDepthToGround = marchOpticalDepth(
    position,
    -surfaceNormal,
    maxIterationCountToGround,
    mipLevel,
    jitter
  );
  vec3 skyIrradiance;
  vec3 sunIrradiance = getGroundSunSkyIrradiance(position, surfaceNormal, height, skyIrradiance);
  const float groundAlbedo = 0.3;
  vec3 groundIrradiance = skyIrradiance + (1.0 - coverage) * sunIrradiance;
  vec3 bouncedRadiance = groundAlbedo * RECIPROCAL_PI * groundIrradiance;
  return bouncedRadiance * exp(-opticalDepthToGround);
}
#endif // GROUND_BOUNCE

vec4 marchClouds(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const vec2 rayNearFar,
  const float cosTheta,
  const float jitter,
  const float rayStartTexelsPerPixel,
  out float frontDepth,
  out ivec3 sampleCount
) {
  vec3 radianceIntegral = vec3(0.0);
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

  float maxRayDistance = rayNearFar.y - rayNearFar.x;
  float stepSize = minStepSize + (perspectiveStepScale - 1.0) * rayNearFar.x;
  // I don't understand why spatial aliasing remains unless doubling the jitter.
  float rayDistance = stepSize * jitter * 2.0;

  for (int i = 0; i < maxIterationCount; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }

    vec3 position = rayDistance * rayDirection + rayOrigin;
    float height = length(position) - bottomRadius;
    float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));

    #if !defined(DEBUG_MARCH_INTERVALS)
    if (insideLayerIntervals(height)) {
      stepSize *= perspectiveStepScale;
      rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
      continue;
    }
    #endif // !defined(DEBUG_MARCH_INTERVALS)

    // Sample rough weather.
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    #ifdef DEBUG_SHOW_SAMPLE_COUNT
    ++sampleCount.x;
    #endif // DEBUG_SHOW_SAMPLE_COUNT

    if (!any(greaterThan(weather.density, vec4(minDensity)))) {
      // Step longer in empty space.
      // TODO: This produces banding artifacts.
      // Possible improvement: Binary search refinement
      stepSize *= perspectiveStepScale;
      rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
      continue;
    }

    // Sample detailed participating media.
    MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);

    if (media.extinction > minExtinction) {
      vec3 skyIrradiance;
      vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);
      vec3 surfaceNormal = normalize(position);

      // March optical depth to the sun for finer details, which BSM lacks.
      float sunRayDistance = 0.0;
      float opticalDepth = marchOpticalDepth(
        position,
        sunDirection,
        maxIterationCountToSun,
        mipLevel,
        jitter,
        sunRayDistance
      );

      if (height < shadowTopHeight) {
        // Obtain the optical depth from BSM at the ray position.
        opticalDepth += sampleShadowOpticalDepth(
          position,
          // Take account of only positions further than the marched ray
          // distance.
          sunRayDistance,
          // Apply PCF only when the sun is close to the horizon.
          maxShadowFilterRadius * remapClamped(dot(sunDirection, surfaceNormal), 0.1, 0.0),
          jitter
        );
      }

      vec3 radiance = sunIrradiance * approximateMultipleScattering(opticalDepth, cosTheta);

      #ifdef GROUND_BOUNCE
      // Fudge factor for the irradiance from ground.
      if (height < shadowTopHeight && mipLevel < 0.5) {
        vec3 groundRadiance = approximateRadianceFromGround(
          position,
          surfaceNormal,
          height,
          mipLevel,
          jitter
        );
        radiance += groundRadiance * RECIPROCAL_PI4 * groundBounceScale;
      }
      #endif // GROUND_BOUNCE

      // Crude approximation of sky gradient. Better than none in the shadows.
      float skyGradient = dot(weather.heightFraction * 0.5 + 0.5, media.weight);
      radiance += skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale;

      // Finally multiply by scattering.
      radiance *= media.scattering;

      #ifdef POWDER
      radiance *= 1.0 - powderScale * exp(-media.extinction * powderExponent);
      #endif // POWDER

      #ifdef DEBUG_SHOW_CASCADES
      if (height < shadowTopHeight) {
        radiance = 1e-3 * getFadedCascadeColor(position, jitter);
      }
      #endif // DEBUG_SHOW_CASCADES

      // Energy-conserving analytical integration of scattered light
      // See 5.6.3 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
      float transmittance = exp(-media.extinction * stepSize);
      float clampedExtinction = max(media.extinction, 1e-7);
      vec3 scatteringIntegral = (radiance - radiance * transmittance) / clampedExtinction;
      radianceIntegral += transmittanceIntegral * scatteringIntegral;
      transmittanceIntegral *= transmittance;

      // Aerial perspective affecting clouds
      // See 5.9.1 in https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf
      weightedDistanceSum += rayDistance * transmittanceIntegral;
      transmittanceSum += transmittanceIntegral;
    }

    if (transmittanceIntegral <= minTransmittance) {
      break; // Early termination
    }

    // Take a shorter step because we've already hit the clouds.
    stepSize *= perspectiveStepScale;
    rayDistance += stepSize;
  }

  // The final product of 5.9.1 and we'll evaluate this in aerial perspective.
  frontDepth = transmittanceSum > 0.0 ? weightedDistanceSum / transmittanceSum : -1.0;

  return vec4(radianceIntegral, remapClamped(transmittanceIntegral, 1.0, minTransmittance));
}

#ifdef SHADOW_LENGTH

float marchShadowLength(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const vec2 rayNearFar,
  const float jitter
) {
  float shadowLength = 0.0;
  float maxRayDistance = rayNearFar.y - rayNearFar.x;
  float stepSize = minShadowLengthStepSize;
  float rayDistance = stepSize * jitter;
  const float attenuationFactor = 1.0 - 5e-4;
  float attenuation = 1.0;

  // TODO: This march is closed, and sample resolution can be much lower.
  // Refining the termination by binary search will make it much more efficient.
  for (int i = 0; i < maxShadowLengthIterationCount; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }
    vec3 position = rayDistance * rayDirection + rayOrigin;
    float opticalDepth = sampleShadowOpticalDepth(position, 0.0, 0.0, jitter);
    shadowLength += (1.0 - exp(-opticalDepth)) * stepSize * attenuation;
    stepSize *= perspectiveStepScale;
    rayDistance += stepSize;
  }
  return shadowLength;
}

#endif // SHADOW_LENGTH

#ifdef HAZE

vec4 approximateHaze(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float maxRayDistance,
  const float cosTheta,
  const float shadowLength
) {
  float modulation = remapClamped(coverage, 0.2, 0.4);
  if (cameraHeight * modulation < 0.0) {
    return vec4(0.0);
  }
  float density = modulation * hazeDensityScale * exp(-cameraHeight * hazeExponent);
  if (density < 1e-7) {
    return vec4(0.0); // Prevent artifact in views from space
  }

  // Blend two normals by the difference in angle so that normal near the
  // ground becomes that of the origin, and in the sky that of the horizon.
  vec3 normalAtOrigin = normalize(rayOrigin);
  vec3 normalAtHorizon = (rayOrigin - dot(rayOrigin, rayDirection) * rayDirection) / bottomRadius;
  float alpha = remapClamped(dot(normalAtOrigin, normalAtHorizon), 0.9, 1.0);
  vec3 normal = mix(normalAtOrigin, normalAtHorizon, alpha);

  // Analytical optical depth where density exponentially decreases with height.
  // Based on: https://iquilezles.org/articles/fog/
  float angle = max(dot(normal, rayDirection), 1e-5);
  float exponent = angle * hazeExponent;
  float linearTerm = density / hazeExponent / angle;

  // Derive the optical depths separately for with and without shadow length.
  float expTerm = 1.0 - exp(-maxRayDistance * exponent);
  float shadowExpTerm = 1.0 - exp(-min(maxRayDistance, shadowLength) * exponent);
  float opticalDepth = expTerm * linearTerm;
  float shadowOpticalDepth = max((expTerm - shadowExpTerm) * linearTerm, 0.0);
  float transmittance = saturate(1.0 - exp(-opticalDepth));
  float shadowTransmittance = saturate(1.0 - exp(-shadowOpticalDepth));

  vec3 skyIrradiance = vGroundIrradiance.sky;
  vec3 sunIrradiance = vGroundIrradiance.sun;
  vec3 inscatter = sunIrradiance * phaseFunction(cosTheta) * shadowTransmittance;
  inscatter += skyIrradiance * RECIPROCAL_PI4 * skyLightScale * transmittance;
  inscatter *= hazeScatteringCoefficient / (hazeAbsorptionCoefficient + hazeScatteringCoefficient);
  return vec4(inscatter, transmittance);
}

#endif // HAZE

void applyAerialPerspective(
  const vec3 cameraPosition,
  const vec3 frontPosition,
  const float shadowLength,
  inout vec4 color
) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    cameraPosition * METER_TO_LENGTH_UNIT,
    frontPosition * METER_TO_LENGTH_UNIT,
    shadowLength * METER_TO_LENGTH_UNIT,
    sunDirection,
    transmittance
  );
  color.rgb = color.rgb * transmittance + inscatter * color.a;
}

bool rayIntersectsGround(const vec3 cameraPosition, const vec3 rayDirection) {
  float r = length(cameraPosition);
  float mu = dot(cameraPosition, rayDirection) / r;
  return mu < 0.0 && r * r * (mu * mu - 1.0) + bottomRadius * bottomRadius >= 0.0;
}

struct IntersectionResult {
  bool ground;
  vec4 first;
  vec4 second;
};

IntersectionResult getIntersections(const vec3 cameraPosition, const vec3 rayDirection) {
  IntersectionResult intersections;
  intersections.ground = rayIntersectsGround(cameraPosition, rayDirection);
  raySphereIntersections(
    cameraPosition,
    rayDirection,
    bottomRadius + vec4(0.0, minHeight, maxHeight, shadowTopHeight),
    intersections.first,
    intersections.second
  );
  return intersections;
}

vec2 getRayNearFar(const IntersectionResult intersections) {
  vec2 nearFar;
  if (cameraHeight < minHeight) {
    // View below the clouds
    if (intersections.ground) {
      nearFar = vec2(-1.0); // No clouds to the ground
    } else {
      nearFar = vec2(intersections.second.y, intersections.second.z);
      nearFar.y = min(nearFar.y, maxRayDistance);
    }
  } else if (cameraHeight < maxHeight) {
    // View inside the total cloud layer
    if (intersections.ground) {
      nearFar = vec2(cameraNear, intersections.first.y);
    } else {
      nearFar = vec2(cameraNear, intersections.second.z);
    }
  } else {
    // View above the clouds
    nearFar = vec2(intersections.first.z, intersections.second.z);
    if (intersections.ground) {
      // Clamp the ray at the min height.
      nearFar.y = intersections.first.y;
    }
  }
  return nearFar;
}

#ifdef SHADOW_LENGTH
vec2 getShadowRayNearFar(const IntersectionResult intersections) {
  vec2 nearFar;
  if (cameraHeight < shadowTopHeight) {
    if (intersections.ground) {
      nearFar = vec2(cameraNear, intersections.first.x);
    } else {
      nearFar = vec2(cameraNear, intersections.second.w);
    }
  } else {
    nearFar = vec2(intersections.first.w, intersections.second.w);
    if (intersections.ground) {
      // Clamp the ray at the ground.
      nearFar.y = intersections.first.x;
    }
  }
  nearFar.y = min(nearFar.y, maxShadowLengthRayDistance);
  return nearFar;
}
#endif // SHADOW_LENGTH

#ifdef HAZE
vec2 getHazeRayNearFar(const IntersectionResult intersections) {
  vec2 nearFar;
  if (cameraHeight < maxHeight) {
    if (intersections.ground) {
      nearFar = vec2(cameraNear, intersections.first.x);
    } else {
      nearFar = vec2(cameraNear, intersections.second.z);
    }
  } else {
    nearFar = vec2(cameraNear, intersections.second.z);
    if (intersections.ground) {
      // Clamp the ray at the ground.
      nearFar.y = intersections.first.x;
    }
  }
  return nearFar;
}
#endif // HAZE

float getRayDistanceToScene(const vec3 rayDirection, out float viewZ) {
  float depth = readDepthValue(depthBuffer, vUv * targetUvScale + temporalJitter);
  if (depth < 1.0 - 1e-7) {
    depth = reverseLogDepth(depth, cameraNear, cameraFar);
    viewZ = getViewZ(depth);
    return -viewZ / dot(rayDirection, vCameraDirection);
  }
  viewZ = 0.0;
  return 0.0;
}

void main() {
  #ifdef DEBUG_SHOW_SHADOW_MAP
  outputColor = getCascadedShadowMaps(vUv);
  outputDepthVelocity = vec3(0.0);
  #ifdef SHADOW_LENGTH
  outputShadowLength = 0.0;
  #endif // SHADOW_LENGTH
  return;
  #endif // DEBUG_SHOW_SHADOW_MAP

  vec3 cameraPosition = vCameraPosition + altitudeCorrection;
  vec3 rayDirection = normalize(vRayDirection);
  float cosTheta = dot(sunDirection, rayDirection);

  IntersectionResult intersections = getIntersections(cameraPosition, rayDirection);
  vec2 rayNearFar = getRayNearFar(intersections);
  #ifdef SHADOW_LENGTH
  vec2 shadowRayNearFar = getShadowRayNearFar(intersections);
  #endif // SHADOW_LENGTH
  #ifdef HAZE
  vec2 hazeRayNearFar = getHazeRayNearFar(intersections);
  #endif // HAZE

  float sceneViewZ;
  float rayDistanceToScene = getRayDistanceToScene(rayDirection, sceneViewZ);
  if (rayDistanceToScene > 0.0) {
    rayNearFar.y = min(rayNearFar.y, rayDistanceToScene);
    #ifdef SHADOW_LENGTH
    shadowRayNearFar.y = min(shadowRayNearFar.y, rayDistanceToScene);
    #endif // SHADOW_LENGTH
    #ifdef HAZE
    hazeRayNearFar.y = min(hazeRayNearFar.y, rayDistanceToScene);
    #endif // HAZE
  }

  bool intersectsGround = any(lessThan(rayNearFar, vec2(0.0)));
  bool intersectsScene = rayNearFar.y < rayNearFar.x;

  float stbn = getSTBN();

  vec4 color = vec4(0.0);
  float frontDepth = rayNearFar.y;
  vec3 depthVelocity = vec3(0.0);
  float shadowLength = 0.0;
  bool hitClouds = false;

  if (!intersectsGround && !intersectsScene) {
    vec3 rayOrigin = rayNearFar.x * rayDirection + cameraPosition;

    vec2 globeUv = getGlobeUv(rayOrigin);
    #ifdef DEBUG_SHOW_UV
    outputColor = vec4(vec3(checker(globeUv, localWeatherRepeat + localWeatherOffset)), 1.0);
    outputDepthVelocity = vec3(0.0);
    #ifdef SHADOW_LENGTH
    outputShadowLength = 0.0;
    #endif // SHADOW_LENGTH
    return;
    #endif // DEBUG_SHOW_UV

    float mipLevel = getMipLevel(globeUv * localWeatherRepeat) * mipLevelScale;
    mipLevel = mix(0.0, mipLevel, min(1.0, 0.2 * cameraHeight / maxHeight));

    float marchedFrontDepth;
    ivec3 sampleCount = ivec3(0);
    color = marchClouds(
      rayOrigin,
      rayDirection,
      rayNearFar,
      cosTheta,
      stbn,
      pow(2.0, mipLevel),
      marchedFrontDepth,
      sampleCount
    );

    #ifdef DEBUG_SHOW_SAMPLE_COUNT
    outputColor = vec4(vec3(sampleCount) / vec3(500.0, 5.0, 5.0), 1.0);
    outputDepthVelocity = vec3(0.0);
    #ifdef SHADOW_LENGTH
    outputShadowLength = 0.0;
    #endif // SHADOW_LENGTH
    return;
    #endif // DEBUG_SHOW_SAMPLE_COUNT

    // Front depth will be -1.0 when no samples are accumulated.
    hitClouds = marchedFrontDepth >= 0.0;
    if (hitClouds) {
      frontDepth = rayNearFar.x + marchedFrontDepth;

      #ifdef SHADOW_LENGTH
      // Clamp the shadow length ray at the clouds.
      shadowRayNearFar.y = mix(
        shadowRayNearFar.y,
        min(frontDepth, shadowRayNearFar.y),
        color.a // Interpolate by the alpha for smoother edges.
      );

      // Shadow length must be computed before applying aerial perspective.
      if (all(greaterThanEqual(shadowRayNearFar, vec2(0.0)))) {
        shadowLength = marchShadowLength(
          shadowRayNearFar.x * rayDirection + cameraPosition,
          rayDirection,
          shadowRayNearFar,
          stbn
        );
      }
      #endif // SHADOW_LENGTH

      #ifdef HAZE
      // Clamp the haze ray at the clouds.
      hazeRayNearFar.y = mix(
        hazeRayNearFar.y,
        min(frontDepth, hazeRayNearFar.y),
        color.a // Interpolate by the alpha for smoother edges.
      );
      #endif // HAZE

      // Apply aerial perspective.
      vec3 frontPosition = cameraPosition + frontDepth * rayDirection;
      applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color);

      // Velocity for temporal resolution.
      vec3 frontPositionWorld = ecefToWorld(frontPosition);
      vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);
      prevClip /= prevClip.w;
      vec2 prevUv = prevClip.xy * 0.5 + 0.5;
      vec2 velocity = vUv - prevUv;
      depthVelocity = vec3(frontDepth, velocity);
    }
  }

  if (!hitClouds) {
    #ifdef SHADOW_LENGTH
    if (all(greaterThanEqual(shadowRayNearFar, vec2(0.0)))) {
      shadowLength = marchShadowLength(
        shadowRayNearFar.x * rayDirection + cameraPosition,
        rayDirection,
        shadowRayNearFar,
        stbn
      );
    }
    #endif // SHADOW_LENGTH

    // Velocity for temporal resolution. Here reproject in the view space for
    // greatly reducing the precision errors.
    frontDepth = sceneViewZ < 0.0 ? -sceneViewZ : cameraFar;
    vec3 frontView = vViewPosition * frontDepth;
    vec4 prevClip = viewReprojectionMatrix * vec4(frontView, 1.0);
    prevClip /= prevClip.w;
    vec2 prevUv = prevClip.xy * 0.5 + 0.5;
    vec2 velocity = vUv - prevUv;
    depthVelocity = vec3(frontDepth, velocity);
  }

  #ifdef DEBUG_SHOW_FRONT_DEPTH
  outputColor = vec4(turbo(frontDepth / maxRayDistance), 1.0);
  outputDepthVelocity = vec3(0.0);
  #ifdef SHADOW_LENGTH
  outputShadowLength = 0.0;
  #endif // SHADOW_LENGTH
  return;
  #endif // DEBUG_SHOW_FRONT_DEPTH

  #ifdef HAZE
  vec4 haze = approximateHaze(
    cameraNear * rayDirection + cameraPosition,
    rayDirection,
    hazeRayNearFar.y - hazeRayNearFar.x,
    cosTheta,
    shadowLength
  );
  color.rgb = mix(color.rgb, haze.rgb, haze.a);
  color.a = color.a * (1.0 - haze.a) + haze.a;
  #endif // HAZE

  outputColor = color;
  outputDepthVelocity = depthVelocity;
  #ifdef SHADOW_LENGTH
  outputShadowLength = shadowLength * METER_TO_LENGTH_UNIT;
  #endif // SHADOW_LENGTH
}
`, Re = `float getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;
}

// Straightforward spherical mapping
vec2 getSphericalUv(const vec3 position) {
  vec2 st = normalize(position.yx);
  float phi = atan(st.x, st.y);
  float theta = asin(normalize(position).z);
  return vec2(phi * RECIPROCAL_PI2 + 0.5, theta * RECIPROCAL_PI + 0.5);
}

vec2 getCubeSphereUv(const vec3 position) {
  // Cube-sphere relaxation by: http://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html
  // TODO: Tile and fix seams.
  // Possible improvements:
  // https://iquilezles.org/articles/texturerepetition/
  // https://gamedev.stackexchange.com/questions/184388/fragment-shader-map-dot-texture-repeatedly-over-the-sphere
  // https://github.com/mmikk/hextile-demo

  vec3 n = normalize(position);
  vec3 f = abs(n);
  vec3 c = n / max(f.x, max(f.y, f.z));
  vec2 m;
  if (all(greaterThan(f.yy, f.xz))) {
    m = c.y > 0.0 ? vec2(-n.x, n.z) : n.xz;
  } else if (all(greaterThan(f.xx, f.yz))) {
    m = c.x > 0.0 ? n.yz : vec2(-n.y, n.z);
  } else {
    m = c.z > 0.0 ? n.xy : vec2(n.x, -n.y);
  }

  vec2 m2 = m * m;
  float q = dot(m2.xy, vec2(-2.0, 2.0)) - 3.0;
  float q2 = q * q;
  vec2 uv;
  uv.x = sqrt(1.5 + m2.x - m2.y - 0.5 * sqrt(-24.0 * m2.x + q2)) * (m.x > 0.0 ? 1.0 : -1.0);
  uv.y = sqrt(6.0 / (3.0 - uv.x * uv.x)) * m.y;
  return uv * 0.5 + 0.5;
}

vec2 getGlobeUv(const vec3 position) {
  return getCubeSphereUv(position);
}

float getMipLevel(const vec2 uv) {
  const float mipLevelScale = 0.1;
  vec2 coord = uv * resolution;
  vec2 ddx = dFdx(coord);
  vec2 ddy = dFdy(coord);
  float deltaMaxSqr = max(dot(ddx, ddx), dot(ddy, ddy)) * mipLevelScale;
  return max(0.0, 0.5 * log2(max(1.0, deltaMaxSqr)));
}

bool insideLayerIntervals(const float height) {
  bvec3 gt = greaterThan(vec3(height), minIntervalHeights);
  bvec3 lt = lessThan(vec3(height), maxIntervalHeights);
  return any(bvec3(gt.x && lt.x, gt.y && lt.y, gt.z && lt.z));
}

struct WeatherSample {
  vec4 heightFraction; // Normalized height of each layer
  vec4 density;
};

vec4 shapeAlteringFunction(const vec4 heightFraction, const vec4 bias) {
  // Apply a semi-circle transform to round the clouds towards the top.
  vec4 biased = pow(heightFraction, bias);
  vec4 x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
  return 1.0 - x * x;
}

WeatherSample sampleWeather(const vec2 uv, const float height, const float mipLevel) {
  WeatherSample weather;
  weather.heightFraction = remapClamped(vec4(height), minLayerHeights, maxLayerHeights);

  vec4 localWeather = pow(
    textureLod(
      localWeatherTexture,
      uv * localWeatherRepeat + localWeatherOffset,
      mipLevel
    ).LOCAL_WEATHER_CHANNELS,
    weatherExponents
  );
  #ifdef SHADOW
  localWeather *= shadowLayerMask;
  #endif // SHADOW

  vec4 heightScale = shapeAlteringFunction(weather.heightFraction, shapeAlteringBiases);

  // Modulation to control weather by coverage parameter.
  // Reference: https://github.com/Prograda/Skybolt/blob/master/Assets/Core/Shaders/Clouds.h#L63
  vec4 factor = 1.0 - coverage * heightScale;
  weather.density = remapClamped(
    mix(localWeather, vec4(1.0), coverageFilterWidths),
    factor,
    factor + coverageFilterWidths
  );

  return weather;
}

vec4 getLayerDensity(const vec4 heightFraction) {
  // prettier-ignore
  return densityProfile.expTerms * exp(densityProfile.exponents * heightFraction) +
    densityProfile.linearTerms * heightFraction +
    densityProfile.constantTerms;
}

struct MediaSample {
  float density;
  vec4 weight;
  float scattering;
  float extinction;
};

MediaSample sampleMedia(
  const WeatherSample weather,
  const vec3 position,
  const vec2 uv,
  const float mipLevel,
  const float jitter,
  out ivec3 sampleCount
) {
  vec4 density = weather.density;

  // TODO: Define in physical length.
  vec3 surfaceNormal = normalize(position);
  float localWeatherSpeed = length(localWeatherOffset);
  vec3 evolution = -surfaceNormal * localWeatherSpeed * 2e4;

  vec3 turbulence = vec3(0.0);
  #ifdef TURBULENCE
  vec2 turbulenceUv = uv * localWeatherRepeat * turbulenceRepeat;
  turbulence =
    turbulenceDisplacement *
    (texture(turbulenceTexture, turbulenceUv).rgb * 2.0 - 1.0) *
    dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));
  #endif // TURBULENCE

  vec3 shapePosition = (position + evolution + turbulence) * shapeRepeat + shapeOffset;
  float shape = texture(shapeTexture, shapePosition).r;
  density = remapClamped(density, vec4(1.0 - shape) * shapeAmounts, vec4(1.0));

  #ifdef DEBUG_SHOW_SAMPLE_COUNT
  ++sampleCount.y;
  #endif // DEBUG_SHOW_SAMPLE_COUNT

  #ifdef SHAPE_DETAIL
  if (mipLevel * 0.5 + (jitter - 0.5) * 0.5 < 0.5) {
    vec3 detailPosition = (position + turbulence) * shapeDetailRepeat + shapeDetailOffset;
    float detail = texture(shapeDetailTexture, detailPosition).r;
    // Fluffy at the top and whippy at the bottom.
    vec4 modifier = mix(
      vec4(pow(detail, 6.0)),
      vec4(1.0 - detail),
      remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4))
    );
    modifier = mix(vec4(0.0), modifier, shapeDetailAmounts);
    density = remapClamped(density * 2.0, vec4(modifier * 0.5), vec4(1.0));

    #ifdef DEBUG_SHOW_SAMPLE_COUNT
    ++sampleCount.z;
    #endif // DEBUG_SHOW_SAMPLE_COUNT
  }
  #endif // SHAPE_DETAIL

  // Apply the density profiles.
  density = saturate(density * densityScales * getLayerDensity(weather.heightFraction));

  MediaSample media;
  float densitySum = density.x + density.y + density.z + density.w;
  media.weight = density / densitySum;
  media.scattering = densitySum * scatteringCoefficient;
  media.extinction = densitySum * absorptionCoefficient + media.scattering;
  return media;
}

MediaSample sampleMedia(
  const WeatherSample weather,
  const vec3 position,
  const vec2 uv,
  const float mipLevel,
  const float jitter
) {
  ivec3 sampleCount;
  return sampleMedia(weather, position, uv, mipLevel, jitter, sampleCount);
}
`, vt = `precision highp float;
precision highp sampler3D;

#include "atmosphere/bruneton/definitions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "atmosphere/bruneton/common"
#include "atmosphere/bruneton/runtime"

#include "types"

uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform mat4 worldToECEFMatrix;
uniform vec3 altitudeCorrection;

// Atmosphere
uniform float bottomRadius;
uniform vec3 sunDirection;

// Cloud layers
uniform float minHeight;
uniform float maxHeight;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vCameraPosition;
out vec3 vCameraDirection; // Direction to the center of screen
out vec3 vRayDirection; // Direction to the texel
out vec3 vViewPosition;

out GroundIrradiance vGroundIrradiance;
out CloudsIrradiance vCloudsIrradiance;

void sampleSunSkyIrradiance(const vec3 positionECEF) {
  vGroundIrradiance.sun = GetSunAndSkyScalarIrradiance(
    positionECEF * METER_TO_LENGTH_UNIT,
    sunDirection,
    vGroundIrradiance.sky
  );

  vec3 surfaceNormal = normalize(positionECEF);
  vec2 radii = (bottomRadius + vec2(minHeight, maxHeight)) * METER_TO_LENGTH_UNIT;
  vCloudsIrradiance.minSun = GetSunAndSkyScalarIrradiance(
    surfaceNormal * radii.x,
    sunDirection,
    vCloudsIrradiance.minSky
  );
  vCloudsIrradiance.maxSun = GetSunAndSkyScalarIrradiance(
    surfaceNormal * radii.y,
    sunDirection,
    vCloudsIrradiance.maxSky
  );
}

void main() {
  vUv = position.xy * 0.5 + 0.5;

  vec3 viewPosition = (inverseProjectionMatrix * vec4(position, 1.0)).xyz;
  vec3 worldDirection = (inverseViewMatrix * vec4(viewPosition.xyz, 0.0)).xyz;
  vec3 cameraDirection = normalize((inverseViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vCameraPosition = (worldToECEFMatrix * vec4(cameraPosition, 1.0)).xyz;
  vCameraDirection = (worldToECEFMatrix * vec4(cameraDirection, 0.0)).xyz;
  vRayDirection = (worldToECEFMatrix * vec4(worldDirection, 0.0)).xyz;
  vViewPosition = viewPosition;

  sampleSunSkyIrradiance(vCameraPosition + altitudeCorrection);

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`, Le = `uniform vec2 resolution;
uniform int frame;
uniform sampler3D stbnTexture;

// Atmosphere
uniform float bottomRadius;
uniform mat4 worldToECEFMatrix;
uniform mat4 ecefToWorldMatrix;
uniform vec3 altitudeCorrection;
uniform vec3 sunDirection;

// Participating medium
uniform float scatteringCoefficient;
uniform float absorptionCoefficient;

// Primary raymarch
uniform float minDensity;
uniform float minExtinction;
uniform float minTransmittance;

// Shape and weather
uniform sampler2D localWeatherTexture;
uniform vec2 localWeatherRepeat;
uniform vec2 localWeatherOffset;
uniform float coverage;
uniform sampler3D shapeTexture;
uniform vec3 shapeRepeat;
uniform vec3 shapeOffset;

#ifdef SHAPE_DETAIL
uniform sampler3D shapeDetailTexture;
uniform vec3 shapeDetailRepeat;
uniform vec3 shapeDetailOffset;
#endif // SHAPE_DETAIL

#ifdef TURBULENCE
uniform sampler2D turbulenceTexture;
uniform vec2 turbulenceRepeat;
uniform float turbulenceDisplacement;
#endif // TURBULENCE

// Haze
#ifdef HAZE
uniform float hazeDensityScale;
uniform float hazeExponent;
uniform float hazeScatteringCoefficient;
uniform float hazeAbsorptionCoefficient;
#endif // HAZE

// Cloud layers
uniform vec4 minLayerHeights;
uniform vec4 maxLayerHeights;
uniform vec3 minIntervalHeights;
uniform vec3 maxIntervalHeights;
uniform vec4 densityScales;
uniform vec4 shapeAmounts;
uniform vec4 shapeDetailAmounts;
uniform vec4 weatherExponents;
uniform vec4 shapeAlteringBiases;
uniform vec4 coverageFilterWidths;
uniform float minHeight;
uniform float maxHeight;
uniform float shadowTopHeight;
uniform float shadowBottomHeight;
uniform vec4 shadowLayerMask;
uniform CloudDensityProfile densityProfile;
`, J = `struct GroundIrradiance {
  vec3 sun;
  vec3 sky;
};

struct CloudsIrradiance {
  vec3 minSun;
  vec3 minSky;
  vec3 maxSun;
  vec3 maxSky;
};

struct CloudDensityProfile {
  vec4 expTerms;
  vec4 exponents;
  vec4 linearTerms;
  vec4 constantTerms;
};
`;
var gt = Object.defineProperty, y = (o, e, t, n) => {
  for (var a = void 0, i = o.length - 1, s; i >= 0; i--)
    (s = o[i]) && (a = s(e, t, a) || a);
  return a && gt(e, t, a), a;
};
const St = /* @__PURE__ */ new p(), yt = /* @__PURE__ */ new $e();
class g extends Ze {
  constructor({
    parameterUniforms: e,
    layerUniforms: t,
    atmosphereUniforms: n
  }, a = Te.DEFAULT) {
    super(
      {
        name: "CloudsMaterial",
        glslVersion: G,
        vertexShader: H(vt, {
          atmosphere: {
            bruneton: {
              common: fe,
              definitions: pe,
              runtime: de
            }
          },
          types: J
        }),
        fragmentShader: V(
          H(mt, {
            core: {
              depth: tt,
              math: Pe,
              turbo: _e,
              generators: et,
              raySphereIntersection: Ae,
              cascadedShadowMaps: Qe,
              interleavedGradientNoise: Je,
              vogelDisk: Xe
            },
            atmosphere: {
              bruneton: {
                common: fe,
                definitions: pe,
                runtime: de
              }
            },
            types: J,
            parameters: Le,
            clouds: Re
          })
        ),
        // prettier-ignore
        uniforms: {
          ...e,
          ...t,
          ...n,
          depthBuffer: new r(null),
          viewMatrix: new r(new m()),
          inverseProjectionMatrix: new r(new m()),
          inverseViewMatrix: new r(new m()),
          reprojectionMatrix: new r(new m()),
          viewReprojectionMatrix: new r(new m()),
          resolution: new r(new f()),
          cameraNear: new r(0),
          cameraFar: new r(0),
          cameraHeight: new r(0),
          frame: new r(0),
          temporalJitter: new r(new f()),
          targetUvScale: new r(new f()),
          mipLevelScale: new r(1),
          stbnTexture: new r(null),
          // Scattering
          skyLightScale: new r(1),
          groundBounceScale: new r(1),
          powderScale: new r(0.8),
          powderExponent: new r(150),
          // Primary raymarch
          maxIterationCount: new r(c.clouds.maxIterationCount),
          minStepSize: new r(c.clouds.minStepSize),
          maxStepSize: new r(c.clouds.maxStepSize),
          maxRayDistance: new r(c.clouds.maxRayDistance),
          perspectiveStepScale: new r(c.clouds.perspectiveStepScale),
          minDensity: new r(c.clouds.minDensity),
          minExtinction: new r(c.clouds.minExtinction),
          minTransmittance: new r(c.clouds.minTransmittance),
          // Secondary raymarch
          maxIterationCountToSun: new r(c.clouds.maxIterationCountToSun),
          maxIterationCountToGround: new r(c.clouds.maxIterationCountToGround),
          minSecondaryStepSize: new r(c.clouds.minSecondaryStepSize),
          secondaryStepScale: new r(c.clouds.secondaryStepScale),
          // Beer shadow map
          shadowBuffer: new r(null),
          shadowTexelSize: new r(new f()),
          shadowIntervals: new r(
            Array.from({ length: 4 }, () => new f())
            // Populate the max number of elements
          ),
          shadowMatrices: new r(
            Array.from({ length: 4 }, () => new m())
            // Populate the max number of elements
          ),
          shadowFar: new r(0),
          maxShadowFilterRadius: new r(6),
          shadowLayerMask: new r(new S().setScalar(1)),
          // Disable mask
          // Shadow length
          maxShadowLengthIterationCount: new r(c.clouds.maxShadowLengthIterationCount),
          minShadowLengthStepSize: new r(c.clouds.minShadowLengthStepSize),
          maxShadowLengthRayDistance: new r(c.clouds.maxShadowLengthRayDistance),
          // Haze
          hazeDensityScale: new r(3e-5),
          hazeExponent: new r(1e-3),
          hazeScatteringCoefficient: new r(0.9),
          hazeAbsorptionCoefficient: new r(0.5)
        }
      },
      a
    ), this.temporalUpscale = !0, this.depthPacking = 0, this.localWeatherChannels = "rgba", this.shapeDetail = c.shapeDetail, this.turbulence = c.turbulence, this.shadowLength = c.lightShafts, this.haze = c.haze, this.multiScatteringOctaves = c.clouds.multiScatteringOctaves, this.accurateSunSkyLight = c.clouds.accurateSunSkyLight, this.accuratePhaseFunction = c.clouds.accuratePhaseFunction, this.shadowCascadeCount = c.shadow.cascadeCount, this.shadowSampleCount = 8, this.scatterAnisotropy1 = 0.7, this.scatterAnisotropy2 = -0.2, this.scatterAnisotropyMix = 0.5;
  }
  onBeforeRender(e, t, n, a, i, s) {
    const l = this.defines.USE_LOGARITHMIC_DEPTH_BUFFER != null, h = e.capabilities.logarithmicDepthBuffer;
    h !== l && (h ? this.defines.USE_LOGARITHMIC_DEPTH_BUFFER = "1" : delete this.defines.USE_LOGARITHMIC_DEPTH_BUFFER);
    const u = this.defines.POWDER != null, d = this.uniforms.powderScale.value > 0;
    d !== u && (d ? this.defines.POWDER = "1" : delete this.defines.POWDER, this.needsUpdate = !0);
    const v = this.defines.GROUND_BOUNCE != null;
    (this.uniforms.groundBounceScale.value > 0 && this.uniforms.maxIterationCountToGround.value > 0) !== v && (d ? this.defines.GROUND_BOUNCE = "1" : delete this.defines.GROUND_BOUNCE, this.needsUpdate = !0);
  }
  copyCameraSettings(e) {
    e.isPerspectiveCamera === !0 ? this.defines.PERSPECTIVE_CAMERA !== "1" && (this.defines.PERSPECTIVE_CAMERA = "1", this.needsUpdate = !0) : this.defines.PERSPECTIVE_CAMERA != null && (delete this.defines.PERSPECTIVE_CAMERA, this.needsUpdate = !0);
    const t = this.uniforms;
    t.viewMatrix.value.copy(e.matrixWorldInverse), t.inverseViewMatrix.value.copy(e.matrixWorld);
    const n = this.previousProjectionMatrix ?? e.projectionMatrix, a = this.previousViewMatrix ?? e.matrixWorldInverse, i = t.inverseProjectionMatrix.value, s = t.inverseViewMatrix.value, l = t.reprojectionMatrix.value, h = t.viewReprojectionMatrix.value;
    if (this.temporalUpscale) {
      const v = t.frame.value % 16, C = t.resolution.value, D = Oe[v], P = (D.x - 0.5) / C.x * 4, O = (D.y - 0.5) / C.y * 4;
      t.temporalJitter.value.set(P, O), t.mipLevelScale.value = 0.25, i.copy(e.projectionMatrix), i.elements[8] += P * 2, i.elements[9] += O * 2, i.invert(), l.copy(n), l.elements[8] += P * 2, l.elements[9] += O * 2, l.multiply(a), h.copy(l).multiply(s);
    } else
      t.temporalJitter.value.setScalar(0), t.mipLevelScale.value = 1, i.copy(e.projectionMatrixInverse), l.copy(n).multiply(a), h.copy(l).multiply(s);
    Ke(e), t.cameraNear.value = e.near, t.cameraFar.value = e.far;
    const u = e.getWorldPosition(
      t.cameraPosition.value
    ), d = St.copy(u).applyMatrix4(t.worldToECEFMatrix.value);
    try {
      t.cameraHeight.value = yt.setFromECEF(d).height;
    } catch {
    }
  }
  // copyCameraSettings can be called multiple times within a frame. Only
  // reliable way is to explicitly store the matrices.
  copyReprojectionMatrix(e) {
    this.previousProjectionMatrix ??= new m(), this.previousViewMatrix ??= new m(), this.previousProjectionMatrix.copy(e.projectionMatrix), this.previousViewMatrix.copy(e.matrixWorldInverse);
  }
  setSize(e, t, n, a) {
    this.uniforms.resolution.value.set(e, t), n != null && a != null ? this.uniforms.targetUvScale.value.set(
      e / n,
      t / a
    ) : this.uniforms.targetUvScale.value.setScalar(1), this.previousProjectionMatrix = void 0, this.previousViewMatrix = void 0;
  }
  setShadowSize(e, t) {
    this.uniforms.shadowTexelSize.value.set(1 / e, 1 / t);
  }
  get depthBuffer() {
    return this.uniforms.depthBuffer.value;
  }
  set depthBuffer(e) {
    this.uniforms.depthBuffer.value = e;
  }
}
y([
  L("DEPTH_PACKING")
], g.prototype, "depthPacking");
y([
  Ee("LOCAL_WEATHER_CHANNELS", {
    validate: (o) => /^[rgba]{4}$/.test(o)
  })
], g.prototype, "localWeatherChannels");
y([
  x("SHAPE_DETAIL")
], g.prototype, "shapeDetail");
y([
  x("TURBULENCE")
], g.prototype, "turbulence");
y([
  x("SHADOW_LENGTH")
], g.prototype, "shadowLength");
y([
  x("HAZE")
], g.prototype, "haze");
y([
  L("MULTI_SCATTERING_OCTAVES", { min: 1, max: 12 })
], g.prototype, "multiScatteringOctaves");
y([
  x("ACCURATE_SUN_SKY_LIGHT")
], g.prototype, "accurateSunSkyLight");
y([
  x("ACCURATE_PHASE_FUNCTION")
], g.prototype, "accuratePhaseFunction");
y([
  L("SHADOW_CASCADE_COUNT", { min: 1, max: 4 })
], g.prototype, "shadowCascadeCount");
y([
  L("SHADOW_SAMPLE_COUNT", { min: 1, max: 16 })
], g.prototype, "shadowSampleCount");
y([
  ee("SCATTER_ANISOTROPY_1")
], g.prototype, "scatterAnisotropy1");
y([
  ee("SCATTER_ANISOTROPY_2")
], g.prototype, "scatterAnisotropy2");
y([
  ee("SCATTER_ANISOTROPY_MIX")
], g.prototype, "scatterAnisotropyMix");
const xt = `// Taken from https://gist.github.com/TheRealMJP/c83b8c0f46b63f3a88a5986f4fa982b1
// TODO: Use 5-taps version: https://www.shadertoy.com/view/MtVGWz
// Or even 4 taps (requires preprocessing in the input buffer):
// https://www.shadertoy.com/view/4tyGDD

/**
 * MIT License
 *
 * Copyright (c) 2019 MJP
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

vec4 textureCatmullRom(sampler2D tex, vec2 uv) {
  vec2 texSize = vec2(textureSize(tex, 0));

  // We're going to sample a a 4x4 grid of texels surrounding the target UV
  // coordinate. We'll do this by rounding down the sample location to get the
  // exact center of our "starting" texel. The starting texel will be at
  // location [1, 1] in the grid, where [0, 0] is the top left corner.
  vec2 samplePos = uv * texSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;

  // Compute the fractional offset from our starting texel to our original
  // sample location, which we'll feed into the Catmull-Rom spline function to
  // get our filter weights.
  vec2 f = samplePos - texPos1;

  // Compute the Catmull-Rom weights using the fractional offset that we
  // calculated earlier. These equations are pre-expanded based on our knowledge
  // of where the texels will be located, which lets us avoid having to evaluate
  // a piece-wise function.
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);

  // Work out weighting factors and sampling offsets that will let us use
  // bilinear filtering to simultaneously evaluate the middle 2 samples from the
  // 4x4 grid.
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / (w1 + w2);

  // Compute the final UV coordinates we'll use for sampling the texture
  vec2 texPos0 = texPos1 - 1.0;
  vec2 texPos3 = texPos1 + 2.0;
  vec2 texPos12 = texPos1 + offset12;

  texPos0 /= texSize;
  texPos3 /= texSize;
  texPos12 /= texSize;

  vec4 result = vec4(0.0);
  result += texture(tex, vec2(texPos0.x, texPos0.y)) * w0.x * w0.y;
  result += texture(tex, vec2(texPos12.x, texPos0.y)) * w12.x * w0.y;
  result += texture(tex, vec2(texPos3.x, texPos0.y)) * w3.x * w0.y;

  result += texture(tex, vec2(texPos0.x, texPos12.y)) * w0.x * w12.y;
  result += texture(tex, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;
  result += texture(tex, vec2(texPos3.x, texPos12.y)) * w3.x * w12.y;

  result += texture(tex, vec2(texPos0.x, texPos3.y)) * w0.x * w3.y;
  result += texture(tex, vec2(texPos12.x, texPos3.y)) * w12.x * w3.y;
  result += texture(tex, vec2(texPos3.x, texPos3.y)) * w3.x * w3.y;

  return result;
}

vec4 textureCatmullRom(sampler2DArray tex, vec3 uv) {
  vec2 texSize = vec2(textureSize(tex, 0));
  vec2 samplePos = uv.xy * texSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / (w1 + w2);
  vec2 texPos0 = texPos1 - 1.0;
  vec2 texPos3 = texPos1 + 2.0;
  vec2 texPos12 = texPos1 + offset12;
  texPos0 /= texSize;
  texPos3 /= texSize;
  texPos12 /= texSize;
  vec4 result = vec4(0.0);
  result += texture(tex, vec3(texPos0.x, texPos0.y, uv.z)) * w0.x * w0.y;
  result += texture(tex, vec3(texPos12.x, texPos0.y, uv.z)) * w12.x * w0.y;
  result += texture(tex, vec3(texPos3.x, texPos0.y, uv.z)) * w3.x * w0.y;
  result += texture(tex, vec3(texPos0.x, texPos12.y, uv.z)) * w0.x * w12.y;
  result += texture(tex, vec3(texPos12.x, texPos12.y, uv.z)) * w12.x * w12.y;
  result += texture(tex, vec3(texPos3.x, texPos12.y, uv.z)) * w3.x * w12.y;
  result += texture(tex, vec3(texPos0.x, texPos3.y, uv.z)) * w0.x * w3.y;
  result += texture(tex, vec3(texPos12.x, texPos3.y, uv.z)) * w12.x * w3.y;
  result += texture(tex, vec3(texPos3.x, texPos3.y, uv.z)) * w3.x * w3.y;
  return result;
}
`, wt = `precision highp float;
precision highp sampler2DArray;

#include "core/turbo"
#include "catmullRomSampling"
#include "varianceClipping"

uniform sampler2D colorBuffer;
uniform sampler2D depthVelocityBuffer;
uniform sampler2D colorHistoryBuffer;

#ifdef SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
uniform sampler2D shadowLengthHistoryBuffer;
#endif // SHADOW_LENGTH

uniform vec2 texelSize;
uniform int frame;
uniform float varianceGamma;
uniform float temporalAlpha;
uniform vec2 jitterOffset;

in vec2 vUv;

layout(location = 0) out vec4 outputColor;
#ifdef SHADOW_LENGTH
layout(location = 1) out float outputShadowLength;
#endif // SHADOW_LENGTH

const ivec2 neighborOffsets[9] = ivec2[9](
  ivec2(-1, -1),
  ivec2(-1, 0),
  ivec2(-1, 1),
  ivec2(0, -1),
  ivec2(0, 0),
  ivec2(0, 1),
  ivec2(1, -1),
  ivec2(1, 0),
  ivec2(1, 1)
);

const ivec4[4] bayerIndices = ivec4[4](
  ivec4(0, 12, 3, 15),
  ivec4(8, 4, 11, 7),
  ivec4(2, 14, 1, 13),
  ivec4(10, 6, 9, 5)
);

vec4 getClosestFragment(const ivec2 coord) {
  vec4 result = vec4(1e7, 0.0, 0.0, 0.0);
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 9; ++i) {
    neighbor = texelFetchOffset(depthVelocityBuffer, coord, 0, neighborOffsets[i]);
    if (neighbor.r < result.r) {
      result = neighbor;
    }
  }
  #pragma unroll_loop_end
  return result;
}

void temporalUpscale(
  const ivec2 coord,
  const ivec2 lowResCoord,
  const bool currentFrame,
  out vec4 outputColor,
  out float outputShadowLength
) {
  vec4 currentColor = texelFetch(colorBuffer, lowResCoord, 0);
  #ifdef SHADOW_LENGTH
  vec4 currentShadowLength = vec4(texelFetch(shadowLengthBuffer, lowResCoord, 0).rgb, 1.0);
  #endif // SHADOW_LENGTH

  if (currentFrame) {
    // Use the texel just rendered without any accumulation.
    outputColor = currentColor;
    #ifdef SHADOW_LENGTH
    outputShadowLength = currentShadowLength.r;
    #endif // SHADOW_LENGTH
    return;
  }

  vec4 depthVelocity = getClosestFragment(lowResCoord);
  vec2 velocity = depthVelocity.gb;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = currentColor;
    #ifdef SHADOW_LENGTH
    outputShadowLength = currentShadowLength.r;
    #endif // SHADOW_LENGTH
    return; // Rejection
  }

  // Variance clipping with a large variance gamma seems to work fine for
  // upsampling. This increases ghosting, of course, but it's hard to notice on
  // clouds.
  // vec4 historyColor = textureCatmullRom(colorHistoryBuffer, prevUv);
  vec4 historyColor = texture(colorHistoryBuffer, prevUv);
  vec4 clippedColor = varianceClipping(colorBuffer, vUv, currentColor, historyColor, varianceGamma);
  outputColor = clippedColor;

  #ifdef SHADOW_LENGTH
  // Sampling the shadow length history using scene depth doesn't make much
  // sense, but it's too hard to derive it properly. At least this approach
  // resolves the edges of scene objects.
  // vec4 historyShadowLength = vec4(textureCatmullRom(shadowLengthHistoryBuffer, prevUv).rgb, 1.0);
  vec4 historyShadowLength = vec4(texture(shadowLengthHistoryBuffer, prevUv).rgb, 1.0);
  vec4 clippedShadowLength = varianceClipping(
    shadowLengthBuffer,
    vUv,
    currentShadowLength,
    historyShadowLength,
    varianceGamma
  );
  outputShadowLength = clippedShadowLength.r;
  #endif // SHADOW_LENGTH
}

void temporalAntialiasing(const ivec2 coord, out vec4 outputColor, out float outputShadowLength) {
  vec4 currentColor = texelFetch(colorBuffer, coord, 0);
  #ifdef SHADOW_LENGTH
  vec4 currentShadowLength = vec4(texelFetch(shadowLengthBuffer, coord, 0).rgb, 1.0);
  #endif // SHADOW_LENGTH

  vec4 depthVelocity = getClosestFragment(coord);
  vec2 velocity = depthVelocity.gb;

  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = currentColor;
    #ifdef SHADOW_LENGTH
    outputShadowLength = currentShadowLength.r;
    #endif // SHADOW_LENGTH
    return; // Rejection
  }

  vec4 historyColor = texture(colorHistoryBuffer, prevUv);
  vec4 clippedColor = varianceClipping(colorBuffer, coord, currentColor, historyColor);
  outputColor = mix(clippedColor, currentColor, temporalAlpha);

  #ifdef SHADOW_LENGTH
  vec4 historyShadowLength = vec4(texture(shadowLengthHistoryBuffer, prevUv).rgb, 1.0);
  vec4 clippedShadowLength = varianceClipping(
    shadowLengthBuffer,
    coord,
    currentShadowLength,
    historyShadowLength
  );
  outputShadowLength = mix(clippedShadowLength.r, currentShadowLength.r, temporalAlpha);
  #endif // SHADOW_LENGTH
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);

  #if !defined(SHADOW_LENGTH)
  float outputShadowLength;
  #endif // !defined(SHADOW_LENGTH)

  #ifdef TEMPORAL_UPSCALE
  ivec2 lowResCoord = coord / 4;
  int bayerValue = bayerIndices[coord.x % 4][coord.y % 4];
  bool currentFrame = bayerValue == frame % 16;
  temporalUpscale(coord, lowResCoord, currentFrame, outputColor, outputShadowLength);
  #else // TEMPORAL_UPSCALE
  temporalAntialiasing(coord, outputColor, outputShadowLength);
  #endif // TEMPORAL_UPSCALE

  #if defined(SHADOW_LENGTH) && defined(DEBUG_SHOW_SHADOW_LENGTH)
  outputColor = vec4(turbo(outputShadowLength * 0.05), 1.0);
  #endif // defined(SHADOW_LENGTH) && defined(DEBUG_SHOW_SHADOW_LENGTH)

  #ifdef DEBUG_SHOW_VELOCITY
  outputColor.rgb = outputColor.rgb + vec3(abs(texture(depthVelocityBuffer, vUv).gb) * 10.0, 0.0);
  #endif // DEBUG_SHOW_VELOCITY
}
`, Ct = `precision highp float;

layout(location = 0) in vec3 position;

out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`, Me = `#ifdef VARIANCE_9_SAMPLES
#define VARIANCE_OFFSET_COUNT 8
const ivec2 varianceOffsets[8] = ivec2[8](
  ivec2(-1, -1),
  ivec2(-1, 1),
  ivec2(1, -1),
  ivec2(1, 1),
  ivec2(1, 0),
  ivec2(0, -1),
  ivec2(0, 1),
  ivec2(-1, 0)
);
#else // VARIANCE_9_SAMPLES
#define VARIANCE_OFFSET_COUNT 4
const ivec2 varianceOffsets[4] = ivec2[4](ivec2(1, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0));
#endif // VARIANCE_9_SAMPLES

// Reference: https://github.com/playdeadgames/temporal
vec4 clipAABB(const vec4 current, const vec4 history, const vec4 minColor, const vec4 maxColor) {
  vec3 pClip = 0.5 * (maxColor.rgb + minColor.rgb);
  vec3 eClip = 0.5 * (maxColor.rgb - minColor.rgb) + 1e-7;
  vec4 vClip = history - vec4(pClip, current.a);
  vec3 vUnit = vClip.xyz / eClip;
  vec3 aUnit = abs(vUnit);
  float maUnit = max(aUnit.x, max(aUnit.y, aUnit.z));
  if (maUnit > 1.0) {
    return vec4(pClip, current.a) + vClip / maUnit;
  }
  return history;
}

#ifdef VARIANCE_SAMPLER_ARRAY
#define VARIANCE_SAMPLER sampler2DArray
#define VARIANCE_SAMPLER_COORD ivec3
#else // VARIANCE_SAMPLER_ARRAY
#define VARIANCE_SAMPLER sampler2D
#define VARIANCE_SAMPLER_COORD ivec2
#endif // VARIANCE_SAMPLER_ARRAY

// Variance clipping
// Reference: https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf
vec4 varianceClipping(
  const VARIANCE_SAMPLER inputBuffer,
  const VARIANCE_SAMPLER_COORD coord,
  const vec4 current,
  const vec4 history,
  const float gamma
) {
  vec4 moment1 = current;
  vec4 moment2 = current * current;
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 8; ++i) {
    #if UNROLLED_LOOP_INDEX < VARIANCE_OFFSET_COUNT
    neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[i]);
    moment1 += neighbor;
    moment2 += neighbor * neighbor;
    #endif // UNROLLED_LOOP_INDEX < VARIANCE_OFFSET_COUNT
  }
  #pragma unroll_loop_end

  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  vec4 mean = moment1 / N;
  vec4 varianceGamma = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;
  vec4 minColor = mean - varianceGamma;
  vec4 maxColor = mean + varianceGamma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}

vec4 varianceClipping(
  const VARIANCE_SAMPLER inputBuffer,
  const VARIANCE_SAMPLER_COORD coord,
  const vec4 current,
  const vec4 history
) {
  return varianceClipping(inputBuffer, coord, current, history, 1.0);
}

vec4 varianceClipping(
  const sampler2D inputBuffer,
  const vec2 coord,
  const vec4 current,
  const vec4 history,
  const float gamma
) {
  vec4 moment1 = current;
  vec4 moment2 = current * current;
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 8; ++i) {
    #if UNROLLED_LOOP_INDEX < VARIANCE_OFFSET_COUNT
    neighbor = textureOffset(inputBuffer, coord, varianceOffsets[i]);
    moment1 += neighbor;
    moment2 += neighbor * neighbor;
    #endif // UNROLLED_LOOP_INDEX < VARIANCE_OFFSET_COUNT
  }
  #pragma unroll_loop_end

  const float N = float(VARIANCE_OFFSET_COUNT + 1);
  vec4 mean = moment1 / N;
  vec4 varianceGamma = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;
  vec4 minColor = mean - varianceGamma;
  vec4 maxColor = mean + varianceGamma;
  return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}

vec4 varianceClipping(
  const sampler2D inputBuffer,
  const vec2 coord,
  const vec4 current,
  const vec4 history
) {
  return varianceClipping(inputBuffer, coord, current, history, 1.0);
}
`;
var Tt = Object.defineProperty, Ie = (o, e, t, n) => {
  for (var a = void 0, i = o.length - 1, s; i >= 0; i--)
    (s = o[i]) && (a = s(e, t, a) || a);
  return a && Tt(e, t, a), a;
};
class te extends Q {
  constructor({
    colorBuffer: e = null,
    depthVelocityBuffer: t = null,
    shadowLengthBuffer: n = null,
    colorHistoryBuffer: a = null,
    shadowLengthHistoryBuffer: i = null
  } = {}) {
    super({
      name: "CloudsResolveMaterial",
      glslVersion: G,
      vertexShader: Ct,
      fragmentShader: V(
        H(wt, {
          core: { turbo: _e },
          catmullRomSampling: xt,
          varianceClipping: Me
        })
      ),
      uniforms: {
        colorBuffer: new r(e),
        depthVelocityBuffer: new r(t),
        shadowLengthBuffer: new r(n),
        colorHistoryBuffer: new r(a),
        shadowLengthHistoryBuffer: new r(i),
        texelSize: new r(new f()),
        frame: new r(0),
        jitterOffset: new r(new f()),
        varianceGamma: new r(2),
        temporalAlpha: new r(0.1)
      }
    }), this.temporalUpscale = !0, this.shadowLength = !0;
  }
  setSize(e, t) {
    this.uniforms.texelSize.value.set(1 / e, 1 / t);
  }
  onBeforeRender(e, t, n, a, i, s) {
    const h = this.uniforms.frame.value % 16, u = Oe[h], d = (u.x - 0.5) * 4, v = (u.y - 0.5) * 4;
    this.uniforms.jitterOffset.value.set(d, v);
  }
}
Ie([
  x("TEMPORAL_UPSCALE")
], te.prototype, "temporalUpscale");
Ie([
  x("SHADOW_LENGTH")
], te.prototype, "shadowLength");
class Ne extends Fe {
  constructor(e, t) {
    super(e), this._mainCamera = new we();
    const { shadow: n } = t;
    this.shadow = n;
  }
  get mainCamera() {
    return this._mainCamera;
  }
  set mainCamera(e) {
    this._mainCamera = e;
  }
}
function Y(o, { depthVelocity: e, shadowLength: t }) {
  const n = new Ge(1, 1, {
    depthBuffer: !1,
    type: Ce
  });
  n.texture.minFilter = B, n.texture.magFilter = B, n.texture.name = o;
  let a;
  e && (a = n.texture.clone(), a.isRenderTargetTexture = !0, n.depthVelocity = a, n.textures.push(a));
  let i;
  return t && (i = n.texture.clone(), i.isRenderTargetTexture = !0, i.format = Ve, n.shadowLength = i, n.textures.push(i)), Object.assign(n, {
    depthVelocity: a ?? null,
    shadowLength: i ?? null
  });
}
class Dt extends Ne {
  constructor({
    parameterUniforms: e,
    layerUniforms: t,
    atmosphereUniforms: n,
    ...a
  }, i) {
    super("CloudsPass", a), this.atmosphere = i, this.width = 0, this.height = 0, this.currentMaterial = new g(
      {
        parameterUniforms: e,
        layerUniforms: t,
        atmosphereUniforms: n
      },
      i
    ), this.currentPass = new K(this.currentMaterial), this.resolveMaterial = new te(), this.resolvePass = new K(this.resolveMaterial), this.initRenderTargets({
      depthVelocity: !0,
      shadowLength: c.lightShafts
    });
  }
  copyCameraSettings(e) {
    this.currentMaterial.copyCameraSettings(e);
  }
  initialize(e, t, n) {
    this.currentPass.initialize(e, t, n), this.resolvePass.initialize(e, t, n);
  }
  initRenderTargets(e) {
    this.currentRenderTarget?.dispose(), this.resolveRenderTarget?.dispose(), this.historyRenderTarget?.dispose();
    const t = Y("Clouds", e), n = Y("Clouds.A", {
      ...e,
      depthVelocity: !1
    }), a = Y("Clouds.B", {
      ...e,
      depthVelocity: !1
    });
    this.currentRenderTarget = t, this.resolveRenderTarget = n, this.historyRenderTarget = a;
    const i = this.resolveMaterial.uniforms;
    i.colorBuffer.value = t.texture, i.depthVelocityBuffer.value = t.depthVelocity, i.shadowLengthBuffer.value = t.shadowLength, i.colorHistoryBuffer.value = a.texture, i.shadowLengthHistoryBuffer.value = a.shadowLength;
  }
  copyShadow() {
    const e = this.shadow, t = this.currentMaterial.uniforms;
    for (let n = 0; n < e.cascadeCount; ++n) {
      const a = e.cascades[n];
      t.shadowIntervals.value[n].copy(a.interval), t.shadowMatrices.value[n].copy(a.matrix);
    }
    t.shadowFar.value = e.far;
  }
  copyReprojection() {
    this.currentMaterial.copyReprojectionMatrix(this.mainCamera);
  }
  swapBuffers() {
    const e = this.historyRenderTarget, t = this.resolveRenderTarget;
    this.resolveRenderTarget = e, this.historyRenderTarget = t;
    const n = this.resolveMaterial.uniforms;
    n.colorHistoryBuffer.value = t.texture, n.shadowLengthHistoryBuffer.value = t.shadowLength;
  }
  update(e, t, n) {
    this.currentMaterial.uniforms.frame.value = t, this.resolveMaterial.uniforms.frame.value = t, this.copyCameraSettings(this.mainCamera), this.copyShadow(), this.currentPass.render(e, null, this.currentRenderTarget), this.resolvePass.render(e, null, this.resolveRenderTarget), this.copyReprojection(), this.swapBuffers();
  }
  setSize(e, t) {
    if (this.width = e, this.height = t, this.temporalUpscale) {
      const n = Math.ceil(e / 4), a = Math.ceil(t / 4);
      this.currentRenderTarget.setSize(n, a), this.currentMaterial.setSize(
        n * 4,
        a * 4,
        e,
        t
      );
    } else
      this.currentRenderTarget.setSize(e, t), this.currentMaterial.setSize(e, t);
    this.resolveRenderTarget.setSize(e, t), this.resolveMaterial.setSize(e, t), this.historyRenderTarget.setSize(e, t);
  }
  setShadowSize(e, t, n) {
    this.currentMaterial.shadowCascadeCount = n, this.currentMaterial.setShadowSize(e, t);
  }
  setDepthTexture(e, t) {
    this.currentMaterial.depthBuffer = e, this.currentMaterial.depthPacking = t ?? 0;
  }
  get outputBuffer() {
    return this.historyRenderTarget.texture;
  }
  get shadowBuffer() {
    return this.currentMaterial.uniforms.shadowBuffer.value;
  }
  set shadowBuffer(e) {
    this.currentMaterial.uniforms.shadowBuffer.value = e;
  }
  get shadowLengthBuffer() {
    return this.historyRenderTarget.shadowLength;
  }
  get temporalUpscale() {
    return this.currentMaterial.temporalUpscale;
  }
  set temporalUpscale(e) {
    e !== this.temporalUpscale && (this.currentMaterial.temporalUpscale = e, this.resolveMaterial.temporalUpscale = e, this.setSize(this.width, this.height));
  }
  get lightShafts() {
    return this.currentMaterial.shadowLength;
  }
  set lightShafts(e) {
    e !== this.lightShafts && (this.currentMaterial.shadowLength = e, this.resolveMaterial.shadowLength = e, this.initRenderTargets({
      depthVelocity: !0,
      shadowLength: e
    }), this.setSize(this.width, this.height));
  }
}
function Et(o, e) {
  const n = o.properties.get(e.texture).__webglTexture, a = o.getContext();
  A(a instanceof WebGL2RenderingContext), o.setRenderTarget(e);
  const i = [];
  if (n != null)
    for (let s = 0; s < e.depth; ++s)
      a.framebufferTextureLayer(
        a.FRAMEBUFFER,
        a.COLOR_ATTACHMENT0 + s,
        n,
        0,
        s
      ), i.push(a.COLOR_ATTACHMENT0 + s);
  a.drawBuffers(i);
}
class xe extends K {
  render(e, t, n, a, i) {
    const s = this.fullscreenMaterial.uniforms;
    t !== null && s?.[this.input] != null && (s[this.input].value = t.texture), Et(e, n), e.render(this.scene, this.camera);
  }
}
const At = `precision highp float;
precision highp sampler3D;

#include <common>

#include "core/math"
#include "core/raySphereIntersection"
#include "types"
#include "parameters"
#include "structuredSampling"
#include "clouds"

uniform mat4 inverseShadowMatrices[CASCADE_COUNT];
uniform mat4 reprojectionMatrices[CASCADE_COUNT];

// Primary raymarch
uniform int maxIterationCount;
uniform float minStepSize;
uniform float maxStepSize;
uniform float opticalDepthTailScale;

in vec2 vUv;

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];

// Redundant notation for prettier.
#if CASCADE_COUNT == 1
layout(location = 1) out vec3 outputDepthVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 2
layout(location = 2) out vec3 outputDepthVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 3
layout(location = 3) out vec3 outputDepthVelocity[CASCADE_COUNT];
#elif CASCADE_COUNT == 4
layout(location = 4) out vec3 outputDepthVelocity[CASCADE_COUNT];
#endif // CASCADE_COUNT

vec4 marchClouds(
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float maxRayDistance,
  const float jitter,
  const float mipLevel
) {
  // Setup structured volume sampling (SVS).
  // While SVS introduces spatial aliasing, it is indeed temporally stable,
  // which is important for lower-resolution shadow maps where a flickering
  // single pixel can be highly noticeable.
  vec3 normal = getStructureNormal(rayDirection, jitter);
  float rayDistance;
  float stepSize;
  intersectStructuredPlanes(
    normal,
    rayOrigin,
    rayDirection,
    clamp(maxRayDistance / float(maxIterationCount), minStepSize, maxStepSize),
    rayDistance,
    stepSize
  );

  #ifdef TEMPORAL_JITTER
  rayDistance -= stepSize * jitter;
  #endif // TEMPORAL_JITTER

  float extinctionSum = 0.0;
  float maxOpticalDepth = 0.0;
  float maxOpticalDepthTail = 0.0;
  float transmittanceIntegral = 1.0;
  float weightedDistanceSum = 0.0;
  float transmittanceSum = 0.0;

  int sampleCount = 0;
  for (int i = 0; i < maxIterationCount; ++i) {
    if (rayDistance > maxRayDistance) {
      break; // Termination
    }

    vec3 position = rayDistance * rayDirection + rayOrigin;
    float height = length(position) - bottomRadius;

    #if !defined(DEBUG_MARCH_INTERVALS)
    if (insideLayerIntervals(height)) {
      rayDistance += stepSize;
      continue;
    }
    #endif // !defined(DEBUG_MARCH_INTERVALS)

    // Sample rough weather.
    vec2 uv = getGlobeUv(position);
    WeatherSample weather = sampleWeather(uv, height, mipLevel);

    if (any(greaterThan(weather.density, vec4(minDensity)))) {
      // Sample detailed participating media.
      // Note this assumes an homogeneous medium.
      MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);
      if (media.extinction > minExtinction) {
        extinctionSum += media.extinction;
        maxOpticalDepth += media.extinction * stepSize;
        transmittanceIntegral *= exp(-media.extinction * stepSize);
        weightedDistanceSum += rayDistance * transmittanceIntegral;
        transmittanceSum += transmittanceIntegral;
        ++sampleCount;
      }
    }

    if (transmittanceIntegral <= minTransmittance) {
      // A large amount of optical depth accumulates in the tail, beyond the
      // point of minimum transmittance. The expected optical depth seems to
      // decrease exponentially with the number of samples taken before reaching
      // the minimum transmittance.
      // See the discussion here: https://x.com/shotamatsuda/status/1886259549931520437
      maxOpticalDepthTail = min(
        opticalDepthTailScale * stepSize * exp(float(1 - sampleCount)),
        stepSize * 0.5 // Excessive optical depth only introduces aliasing.
      );
      break; // Early termination
    }
    rayDistance += stepSize;
  }

  if (sampleCount == 0) {
    return vec4(maxRayDistance, 0.0, 0.0, 0.0);
  }
  float frontDepth = min(weightedDistanceSum / transmittanceSum, maxRayDistance);
  float meanExtinction = extinctionSum / float(sampleCount);
  return vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail);
}

void getRayNearFar(
  const vec3 sunPosition,
  const vec3 rayDirection,
  out float rayNear,
  out float rayFar
) {
  vec4 firstIntersections = raySphereFirstIntersection(
    sunPosition,
    rayDirection,
    vec3(0.0),
    bottomRadius + vec4(shadowTopHeight, shadowBottomHeight, 0.0, 0.0)
  );
  rayNear = max(0.0, firstIntersections.x);
  rayFar = firstIntersections.y;
  if (rayFar < 0.0) {
    rayFar = 1e6;
  }
}

void cascade(
  const int cascadeIndex,
  const float mipLevel,
  out vec4 outputColor,
  out vec3 outputDepthVelocity
) {
  vec2 clip = vUv * 2.0 - 1.0;
  vec4 point = inverseShadowMatrices[cascadeIndex] * vec4(clip.xy, -1.0, 1.0);
  point /= point.w;
  vec3 sunPosition = (worldToECEFMatrix * vec4(point.xyz, 1.0)).xyz + altitudeCorrection;

  vec3 rayDirection = normalize(-sunDirection);
  float rayNear;
  float rayFar;
  getRayNearFar(sunPosition, rayDirection, rayNear, rayFar);

  vec3 rayOrigin = rayNear * rayDirection + sunPosition;
  float stbn = getSTBN();
  vec4 color = marchClouds(rayOrigin, rayDirection, rayFar - rayNear, stbn, mipLevel);
  outputColor = color;

  // Velocity for temporal resolution.
  #ifdef TEMPORAL_PASS
  vec3 frontPosition = color.x * rayDirection + rayOrigin;
  vec3 frontPositionWorld = (ecefToWorldMatrix * vec4(frontPosition - altitudeCorrection, 1.0)).xyz;
  vec4 prevClip = reprojectionMatrices[cascadeIndex] * vec4(frontPositionWorld, 1.0);
  prevClip /= prevClip.w;
  vec2 prevUv = prevClip.xy * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * resolution;
  outputDepthVelocity = vec3(color.x, velocity);
  #else // TEMPORAL_PASS
  outputDepthVelocity = vec3(0.0);
  #endif // TEMPORAL_PASS
}

// TODO: Calculate from the main camera frustum perhaps?
const float mipLevels[4] = float[4](0.0, 0.5, 1.0, 2.0);

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < CASCADE_COUNT
    cascade(UNROLLED_LOOP_INDEX, mipLevels[i], outputColor[i], outputDepthVelocity[i]);
    #endif // UNROLLED_LOOP_INDEX < CASCADE_COUNT
  }
  #pragma unroll_loop_end
}
`, _t = `precision highp float;

layout(location = 0) in vec3 position;

out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`, Pt = `// Implements Structured Volume Sampling in fragment shader:
// https://github.com/huwb/volsample
// Implementation reference:
// https://www.shadertoy.com/view/ttVfDc

void getIcosahedralVertices(const vec3 direction, out vec3 v1, out vec3 v2, out vec3 v3) {
  // Normalization scalers to fit dodecahedron to unit sphere.
  const float a = 0.85065080835204; // phi / sqrt(2 + phi)
  const float b = 0.5257311121191336; // 1 / sqrt(2 + phi)

  // Derive the vertices of icosahedron where triangle intersects the direction.
  // See: https://www.ppsloan.org/publications/AmbientDice.pdf
  const float kT = 0.6180339887498948; // 1 / phi
  const float kT2 = 0.38196601125010515; // 1 / phi^2
  vec3 absD = abs(direction);
  float selector1 = dot(absD, vec3(1.0, kT2, -kT));
  float selector2 = dot(absD, vec3(-kT, 1.0, kT2));
  float selector3 = dot(absD, vec3(kT2, -kT, 1.0));
  v1 = selector1 > 0.0 ? vec3(a, b, 0.0) : vec3(-b, 0.0, a);
  v2 = selector2 > 0.0 ? vec3(0.0, a, b) : vec3(a, -b, 0.0);
  v3 = selector3 > 0.0 ? vec3(b, 0.0, a) : vec3(0.0, a, -b);
  vec3 octantSign = sign(direction);
  v1 *= octantSign;
  v2 *= octantSign;
  v3 *= octantSign;
}

void swapIfBigger(inout vec4 a, inout vec4 b) {
  if (a.w > b.w) {
    vec4 t = a;
    a = b;
    b = t;
  }
}

void sortVertices(inout vec3 a, inout vec3 b, inout vec3 c) {
  const vec3 base = vec3(0.5, 0.5, 1.0);
  vec4 aw = vec4(a, dot(a, base));
  vec4 bw = vec4(b, dot(b, base));
  vec4 cw = vec4(c, dot(c, base));
  swapIfBigger(aw, bw);
  swapIfBigger(bw, cw);
  swapIfBigger(aw, bw);
  a = aw.xyz;
  b = bw.xyz;
  c = cw.xyz;
}

vec3 getPentagonalWeights(const vec3 direction, const vec3 v1, const vec3 v2, const vec3 v3) {
  float d1 = dot(v1, direction);
  float d2 = dot(v2, direction);
  float d3 = dot(v3, direction);
  vec3 w = exp(vec3(d1, d2, d3) * 40.0);
  return w / (w.x + w.y + w.z);
}

vec3 getStructureNormal(
  const vec3 direction,
  const float jitter,
  out vec3 a,
  out vec3 b,
  out vec3 c,
  out vec3 weights
) {
  getIcosahedralVertices(direction, a, b, c);
  sortVertices(a, b, c);
  weights = getPentagonalWeights(direction, a, b, c);
  return jitter < weights.x
    ? a
    : jitter < weights.x + weights.y
      ? b
      : c;
}

vec3 getStructureNormal(const vec3 direction, const float jitter) {
  vec3 a, b, c, weights;
  return getStructureNormal(direction, jitter, a, b, c, weights);
}

// Reference: https://github.com/huwb/volsample/blob/master/src/unity/Assets/Shaders/RayMarchCore.cginc
void intersectStructuredPlanes(
  const vec3 normal,
  const vec3 rayOrigin,
  const vec3 rayDirection,
  const float samplePeriod,
  out float stepOffset,
  out float stepSize
) {
  float NoD = dot(rayDirection, normal);
  stepSize = samplePeriod / abs(NoD);

  // Skips leftover bit to get from rayOrigin to first strata plane.
  stepOffset = -mod(dot(rayOrigin, normal), samplePeriod) / NoD;

  // mod() gives different results depending on if the arg is negative or
  // positive. This line makes it consistent, and ensures the first sample is in
  // front of the viewer.
  if (stepOffset < 0.0) {
    stepOffset += stepSize;
  }
}
`;
var Ot = Object.defineProperty, M = (o, e, t, n) => {
  for (var a = void 0, i = o.length - 1, s; i >= 0; i--)
    (s = o[i]) && (a = s(e, t, a) || a);
  return a && Ot(e, t, a), a;
};
class _ extends Q {
  constructor({
    parameterUniforms: e,
    layerUniforms: t,
    atmosphereUniforms: n
  }) {
    super({
      name: "ShadowMaterial",
      glslVersion: G,
      vertexShader: _t,
      fragmentShader: V(
        H(At, {
          core: {
            math: Pe,
            raySphereIntersection: Ae
          },
          types: J,
          parameters: Le,
          structuredSampling: Pt,
          clouds: Re
        })
      ),
      uniforms: {
        ...e,
        ...t,
        ...n,
        inverseShadowMatrices: new r(
          Array.from({ length: 4 }, () => new m())
          // Populate the max number of elements
        ),
        reprojectionMatrices: new r(
          Array.from({ length: 4 }, () => new m())
          // Populate the max number of elements
        ),
        resolution: new r(new f()),
        frame: new r(0),
        stbnTexture: new r(null),
        // Primary raymarch
        maxIterationCount: new r(c.shadow.maxIterationCount),
        minStepSize: new r(c.shadow.minStepSize),
        maxStepSize: new r(c.shadow.maxStepSize),
        minDensity: new r(c.shadow.minDensity),
        minExtinction: new r(c.shadow.minExtinction),
        minTransmittance: new r(c.shadow.minTransmittance),
        opticalDepthTailScale: new r(2)
      },
      defines: {
        SHADOW: "1",
        TEMPORAL_PASS: "1",
        TEMPORAL_JITTER: "1"
      }
    }), this.localWeatherChannels = "rgba", this.cascadeCount = c.shadow.cascadeCount, this.temporalPass = !0, this.temporalJitter = !0, this.shapeDetail = c.shapeDetail, this.turbulence = c.turbulence, this.cascadeCount = c.shadow.cascadeCount;
  }
  setSize(e, t) {
    this.uniforms.resolution.value.set(e, t);
  }
}
M([
  Ee("LOCAL_WEATHER_CHANNELS", {
    validate: (o) => /^[rgba]{4}$/.test(o)
  })
], _.prototype, "localWeatherChannels");
M([
  L("CASCADE_COUNT", { min: 1, max: 4 })
], _.prototype, "cascadeCount");
M([
  x("TEMPORAL_PASS")
], _.prototype, "temporalPass");
M([
  x("TEMPORAL_JITTER")
], _.prototype, "temporalJitter");
M([
  x("SHAPE_DETAIL")
], _.prototype, "shapeDetail");
M([
  x("TURBULENCE")
], _.prototype, "turbulence");
const Rt = `precision highp float;
precision highp sampler2DArray;

#define VARIANCE_9_SAMPLES 1
#define VARIANCE_SAMPLER_ARRAY 1

#include "varianceClipping"

uniform sampler2DArray inputBuffer;
uniform sampler2DArray historyBuffer;

uniform vec2 texelSize;
uniform float varianceGamma;
uniform float temporalAlpha;

in vec2 vUv;

layout(location = 0) out vec4 outputColor[CASCADE_COUNT];

const ivec2 neighborOffsets[9] = ivec2[9](
  ivec2(-1, -1),
  ivec2(-1, 0),
  ivec2(-1, 1),
  ivec2(0, -1),
  ivec2(0, 0),
  ivec2(0, 1),
  ivec2(1, -1),
  ivec2(1, 0),
  ivec2(1, 1)
);

vec4 getClosestFragment(const ivec3 coord) {
  vec4 result = vec4(1e7, 0.0, 0.0, 0.0);
  vec4 neighbor;
  #pragma unroll_loop_start
  for (int i = 0; i < 9; ++i) {
    neighbor = texelFetchOffset(
      inputBuffer,
      coord + ivec3(0, 0, CASCADE_COUNT),
      0,
      neighborOffsets[i]
    );
    if (neighbor.r < result.r) {
      result = neighbor;
    }
  }
  #pragma unroll_loop_end
  return result;
}

void cascade(const int cascadeIndex, out vec4 outputColor) {
  ivec3 coord = ivec3(gl_FragCoord.xy, cascadeIndex);
  vec4 current = texelFetch(inputBuffer, coord, 0);

  vec4 depthVelocity = getClosestFragment(coord);
  vec2 velocity = depthVelocity.gb * texelSize;
  vec2 prevUv = vUv - velocity;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
    outputColor = current;
    return; // Rejection
  }

  vec4 history = texture(historyBuffer, vec3(prevUv, float(cascadeIndex)));
  vec4 clippedHistory = varianceClipping(inputBuffer, coord, current, history, varianceGamma);
  outputColor = mix(clippedHistory, current, temporalAlpha);
}

void main() {
  #pragma unroll_loop_start
  for (int i = 0; i < 4; ++i) {
    #if UNROLLED_LOOP_INDEX < CASCADE_COUNT
    cascade(UNROLLED_LOOP_INDEX, outputColor[i]);
    #endif // UNROLLED_LOOP_INDEX < CASCADE_COUNT
  }
  #pragma unroll_loop_end
}
`, Lt = `precision highp float;

layout(location = 0) in vec3 position;

out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
var Mt = Object.defineProperty, It = (o, e, t, n) => {
  for (var a = void 0, i = o.length - 1, s; i >= 0; i--)
    (s = o[i]) && (a = s(e, t, a) || a);
  return a && Mt(e, t, a), a;
};
class be extends Q {
  constructor({
    inputBuffer: e = null,
    historyBuffer: t = null
  } = {}) {
    super({
      name: "ShadowResolveMaterial",
      glslVersion: G,
      vertexShader: Lt,
      fragmentShader: V(
        H(Rt, {
          varianceClipping: Me
        })
      ),
      uniforms: {
        inputBuffer: new r(e),
        historyBuffer: new r(t),
        texelSize: new r(new f()),
        varianceGamma: new r(1),
        // Use a very slow alpha because a single flickering pixel can be highly
        // noticeable in shadow maps. This value can be increased if temporal
        // jitter is turned off in the shadows rendering, but it will suffer
        // from spatial aliasing.
        temporalAlpha: new r(0.01)
      },
      defines: {}
    }), this.cascadeCount = c.shadow.cascadeCount;
  }
  setSize(e, t) {
    this.uniforms.texelSize.value.set(1 / e, 1 / t);
  }
}
It([
  L("CASCADE_COUNT", { min: 1, max: 4 })
], be.prototype, "cascadeCount");
function Z(o) {
  const e = new ke(1, 1, 1, {
    depthBuffer: !1
  });
  return e.texture.type = Ce, e.texture.minFilter = B, e.texture.magFilter = B, e.texture.name = o, e;
}
class Nt extends Ne {
  constructor({
    parameterUniforms: e,
    layerUniforms: t,
    atmosphereUniforms: n,
    ...a
  }) {
    super("ShadowPass", a), this.width = 0, this.height = 0, this.currentMaterial = new _({
      parameterUniforms: e,
      layerUniforms: t,
      atmosphereUniforms: n
    }), this.currentPass = new xe(this.currentMaterial), this.resolveMaterial = new be(), this.resolvePass = new xe(this.resolveMaterial), this.initRenderTargets();
  }
  initialize(e, t, n) {
    this.currentPass.initialize(e, t, n), this.resolvePass.initialize(e, t, n);
  }
  initRenderTargets() {
    this.currentRenderTarget?.dispose(), this.resolveRenderTarget?.dispose(), this.historyRenderTarget?.dispose();
    const e = Z("Shadow"), t = this.temporalPass ? Z("Shadow.A") : null, n = this.temporalPass ? Z("Shadow.B") : null;
    this.currentRenderTarget = e, this.resolveRenderTarget = t, this.historyRenderTarget = n;
    const a = this.resolveMaterial.uniforms;
    a.inputBuffer.value = e.texture, a.historyBuffer.value = n?.texture ?? null;
  }
  copyShadow() {
    const e = this.shadow, t = this.currentMaterial.uniforms;
    for (let n = 0; n < e.cascadeCount; ++n) {
      const a = e.cascades[n];
      t.inverseShadowMatrices.value[n].copy(a.inverseMatrix);
    }
  }
  copyReprojection() {
    const e = this.shadow, t = this.currentMaterial.uniforms;
    for (let n = 0; n < e.cascadeCount; ++n) {
      const a = e.cascades[n];
      t.reprojectionMatrices.value[n].copy(a.matrix);
    }
  }
  swapBuffers() {
    A(this.historyRenderTarget != null), A(this.resolveRenderTarget != null);
    const e = this.historyRenderTarget, t = this.resolveRenderTarget;
    this.resolveRenderTarget = e, this.historyRenderTarget = t, this.resolveMaterial.uniforms.historyBuffer.value = t.texture;
  }
  update(e, t, n) {
    this.currentMaterial.uniforms.frame.value = t, this.copyShadow(), this.currentPass.render(e, null, this.currentRenderTarget), this.temporalPass && (A(this.resolveRenderTarget != null), this.resolvePass.render(e, null, this.resolveRenderTarget), this.copyReprojection(), this.swapBuffers());
  }
  setSize(e, t, n = this.shadow.cascadeCount) {
    this.width = e, this.height = t, this.currentMaterial.cascadeCount = n, this.resolveMaterial.cascadeCount = n, this.currentMaterial.setSize(e, t), this.resolveMaterial.setSize(e, t), this.currentRenderTarget.setSize(
      e,
      t,
      this.temporalPass ? n * 2 : n
      // For depth velocity
    ), this.resolveRenderTarget?.setSize(e, t, n), this.historyRenderTarget?.setSize(e, t, n);
  }
  get outputBuffer() {
    return this.temporalPass ? (A(this.historyRenderTarget != null), this.historyRenderTarget.texture) : this.currentRenderTarget.texture;
  }
  get temporalPass() {
    return this.currentMaterial.temporalPass;
  }
  set temporalPass(e) {
    e !== this.temporalPass && (this.currentMaterial.temporalPass = e, this.initRenderTargets(), this.setSize(this.width, this.height));
  }
}
function bt(o) {
  return {
    // Participating medium
    scatteringCoefficient: new r(1),
    absorptionCoefficient: new r(0),
    // Weather and shape
    coverage: new r(0.3),
    localWeatherTexture: new r(o.localWeatherTexture),
    localWeatherRepeat: new r(o.localWeatherRepeat),
    localWeatherOffset: new r(o.localWeatherOffset),
    shapeTexture: new r(o.shapeTexture),
    shapeRepeat: new r(o.shapeRepeat),
    shapeOffset: new r(o.shapeOffset),
    shapeDetailTexture: new r(o.shapeDetailTexture),
    shapeDetailRepeat: new r(o.shapeDetailRepeat),
    shapeDetailOffset: new r(o.shapeDetailOffset),
    turbulenceTexture: new r(o.turbulenceTexture),
    turbulenceRepeat: new r(o.turbulenceRepeat),
    turbulenceDisplacement: new r(350)
  };
}
function Ut() {
  return {
    minLayerHeights: new r(new S()),
    maxLayerHeights: new r(new S()),
    minIntervalHeights: new r(new p()),
    maxIntervalHeights: new r(new p()),
    densityScales: new r(new S()),
    shapeAmounts: new r(new S()),
    shapeDetailAmounts: new r(new S()),
    weatherExponents: new r(new S()),
    shapeAlteringBiases: new r(new S()),
    coverageFilterWidths: new r(new S()),
    minHeight: new r(0),
    maxHeight: new r(0),
    shadowTopHeight: new r(0),
    shadowBottomHeight: new r(0),
    shadowLayerMask: new r(new S()),
    densityProfile: new r({
      expTerms: new S(),
      exponents: new S(),
      linearTerms: new S(),
      constantTerms: new S()
    })
  };
}
const q = [0, 0, 0, 0];
function Ht(o, e) {
  e.packValues("altitude", o.minLayerHeights.value), e.packSums("altitude", "height", o.maxLayerHeights.value), e.packIntervalHeights(
    o.minIntervalHeights.value,
    o.maxIntervalHeights.value
  ), e.packValues("densityScale", o.densityScales.value), e.packValues("shapeAmount", o.shapeAmounts.value), e.packValues("shapeDetailAmount", o.shapeDetailAmounts.value), e.packValues("weatherExponent", o.weatherExponents.value), e.packValues("shapeAlteringBias", o.shapeAlteringBiases.value), e.packValues("coverageFilterWidth", o.coverageFilterWidths.value);
  const t = o.densityProfile.value;
  e.packDensityProfiles("expTerm", t.expTerms), e.packDensityProfiles("exponent", t.exponents), e.packDensityProfiles("linearTerm", t.linearTerms), e.packDensityProfiles("constantTerm", t.constantTerms);
  let n = 1 / 0, a = 0, i = 1 / 0, s = 0;
  q.fill(0);
  for (let l = 0; l < e.length; ++l) {
    const { altitude: h, height: u, shadow: d } = e[l], v = h + u;
    u > 0 && (h < n && (n = h), d && h < i && (i = h), v > a && (a = v), d && v > s && (s = v)), q[l] = d ? 1 : 0;
  }
  n !== 1 / 0 ? (o.minHeight.value = n, o.maxHeight.value = a) : (A(a === 0), o.minHeight.value = 0), i !== 1 / 0 ? (o.shadowBottomHeight.value = i, o.shadowTopHeight.value = s) : (A(s === 0), o.shadowBottomHeight.value = 0), o.shadowLayerMask.value.fromArray(q);
}
function Ft(o, e) {
  return {
    bottomRadius: new r(o.bottomRadius),
    topRadius: new r(o.topRadius),
    worldToECEFMatrix: new r(e.worldToECEFMatrix),
    ecefToWorldMatrix: new r(e.ecefToWorldMatrix),
    altitudeCorrection: new r(e.altitudeCorrection),
    sunDirection: new r(e.sunDirection)
  };
}
const zt = `uniform sampler2D cloudsBuffer;

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  #ifdef SKIP_RENDERING
  outputColor = inputColor;
  #else // SKIP_RENDERING
  vec4 clouds = texture(cloudsBuffer, uv);
  outputColor.rgb = inputColor.rgb * (1.0 - clouds.a) + clouds.rgb;
  outputColor.a = inputColor.a * (1.0 - clouds.a) + clouds.a;
  #endif // SKIP_RENDERING
}
`;
var Wt = Object.defineProperty, Bt = (o, e, t, n) => {
  for (var a = void 0, i = o.length - 1, s; i >= 0; i--)
    (s = o[i]) && (a = s(e, t, a) || a);
  return a && Wt(e, t, a), a;
};
const N = /* @__PURE__ */ new p(), Gt = /* @__PURE__ */ new f(), Vt = /* @__PURE__ */ new Ye(), kt = [
  "maxIterationCount",
  "minStepSize",
  "maxStepSize",
  "maxRayDistance",
  "perspectiveStepScale",
  "minDensity",
  "minExtinction",
  "minTransmittance",
  "maxIterationCountToSun",
  "maxIterationCountToGround",
  "minSecondaryStepSize",
  "secondaryStepScale",
  "maxShadowFilterRadius",
  "maxShadowLengthIterationCount",
  "minShadowLengthStepSize",
  "maxShadowLengthRayDistance",
  "hazeDensityScale",
  "hazeExponent",
  "hazeScatteringCoefficient",
  "hazeAbsorptionCoefficient"
], jt = [
  "multiScatteringOctaves",
  "accurateSunSkyLight",
  "accuratePhaseFunction"
], Yt = [
  "maxIterationCount",
  "minStepSize",
  "maxStepSize",
  "minDensity",
  "minExtinction",
  "minTransmittance",
  "opticalDepthTailScale"
], Zt = [
  "temporalJitter"
], qt = [
  "temporalPass"
], Kt = [
  "cascadeCount",
  "mapSize",
  "maxFar",
  "farScale",
  "splitMode",
  "splitLambda"
], T = {
  type: "change"
}, $t = {
  resolutionScale: c.resolutionScale,
  width: $.AUTO_SIZE,
  height: $.AUTO_SIZE
};
class Xt extends ze {
  constructor(e = new we(), t, n = Te.DEFAULT) {
    super("CloudsEffect", zt, {
      attributes: We.DEPTH,
      uniforms: /* @__PURE__ */ new Map([["cloudsBuffer", new r(null)]])
    }), this.camera = e, this.atmosphere = n, this.cloudLayers = X.DEFAULT.clone(), this.correctAltitude = !0, this.localWeatherRepeat = new f().setScalar(100), this.localWeatherOffset = new f(), this.shapeRepeat = new p().setScalar(3e-4), this.shapeOffset = new p(), this.shapeDetailRepeat = new p().setScalar(6e-3), this.shapeDetailOffset = new p(), this.turbulenceRepeat = new f().setScalar(20), this.worldToECEFMatrix = new m(), this.ecefToWorldMatrix = new m(), this.altitudeCorrection = new p(), this.sunDirection = new p(), this.localWeatherVelocity = new f(), this.shapeVelocity = new p(), this.shapeDetailVelocity = new p(), this._atmosphereOverlay = null, this._atmosphereShadow = null, this._atmosphereShadowLength = null, this.events = new je(), this.frame = 0, this.shadowCascadeCount = 0, this.shadowMapSize = new f(), this.onResolutionChange = () => {
      this.setSize(this.resolution.baseWidth, this.resolution.baseHeight);
    }, this.skipRendering = !0;
    const {
      resolutionScale: a,
      width: i,
      height: s,
      resolutionX: l = i,
      resolutionY: h = s
    } = {
      ...$t,
      ...t
    };
    this.shadowMaps = new dt({
      cascadeCount: c.shadow.cascadeCount,
      mapSize: c.shadow.mapSize,
      splitLambda: 0.6
    }), this.parameterUniforms = bt({
      localWeatherTexture: this.proceduralLocalWeather?.texture ?? null,
      localWeatherRepeat: this.localWeatherRepeat,
      localWeatherOffset: this.localWeatherOffset,
      shapeTexture: this.proceduralShape?.texture ?? null,
      shapeRepeat: this.shapeRepeat,
      shapeOffset: this.shapeOffset,
      shapeDetailTexture: this.proceduralShapeDetail?.texture ?? null,
      shapeDetailRepeat: this.shapeDetailRepeat,
      shapeDetailOffset: this.shapeDetailOffset,
      turbulenceTexture: this.proceduralTurbulence?.texture ?? null,
      turbulenceRepeat: this.turbulenceRepeat
    }), this.layerUniforms = Ut(), this.atmosphereUniforms = Ft(n, {
      worldToECEFMatrix: this.worldToECEFMatrix,
      ecefToWorldMatrix: this.ecefToWorldMatrix,
      altitudeCorrection: this.altitudeCorrection,
      sunDirection: this.sunDirection
    });
    const u = {
      shadow: this.shadowMaps,
      parameterUniforms: this.parameterUniforms,
      layerUniforms: this.layerUniforms,
      atmosphereUniforms: this.atmosphereUniforms
    };
    this.shadowPass = new Nt(u), this.shadowPass.mainCamera = e, this.cloudsPass = new Dt(u, n), this.cloudsPass.mainCamera = e, this.clouds = he(
      ue(
        {},
        this.cloudsPass.currentMaterial,
        kt
      ),
      this.cloudsPass.currentMaterial,
      jt
    ), this.shadow = he(
      ue(
        {},
        this.shadowPass.currentMaterial,
        Yt
      ),
      this.shadowPass.currentMaterial,
      Zt,
      this.shadowPass,
      qt,
      this.shadowMaps,
      Kt
    ), this.resolution = new $(
      this,
      l,
      h,
      a
    ), this.resolution.addEventListener("change", this.onResolutionChange);
  }
  get mainCamera() {
    return this.camera;
  }
  set mainCamera(e) {
    this.camera = e, this.shadowPass.mainCamera = e, this.cloudsPass.mainCamera = e;
  }
  initialize(e, t, n) {
    this.shadowPass.initialize(e, t, n), this.cloudsPass.initialize(e, t, n);
  }
  updateSharedUniforms(e) {
    Ht(this.layerUniforms, this.cloudLayers);
    const { parameterUniforms: t } = this;
    t.localWeatherOffset.value.add(
      Gt.copy(this.localWeatherVelocity).multiplyScalar(e)
    ), t.shapeOffset.value.add(
      N.copy(this.shapeVelocity).multiplyScalar(e)
    ), t.shapeDetailOffset.value.add(
      N.copy(this.shapeDetailVelocity).multiplyScalar(e)
    );
    const n = this.worldToECEFMatrix;
    this.ecefToWorldMatrix.copy(n).invert();
    const a = this.camera.getWorldPosition(N).applyMatrix4(this.worldToECEFMatrix), i = this.altitudeCorrection;
    this.correctAltitude ? qe(
      a,
      this.atmosphere.bottomRadius,
      this.ellipsoid,
      i
    ) : i.setScalar(0);
    const s = this.ellipsoid.getSurfaceNormal(
      a,
      N
    ), l = this.sunDirection.dot(s), h = De(1e6, 1e3, l), u = Vt.setFromMatrix4(n).transpose();
    this.shadowMaps.update(
      this.camera,
      N.copy(this.sunDirection).applyMatrix3(u),
      h
    );
  }
  updateWeatherTextureChannels() {
    const e = this.cloudLayers.localWeatherChannels;
    this.cloudsPass.currentMaterial.localWeatherChannels = e, this.shadowPass.currentMaterial.localWeatherChannels = e;
  }
  updateAtmosphereComposition() {
    const { shadowMaps: e, shadowPass: t, cloudsPass: n } = this, a = t.currentMaterial.uniforms, i = n.currentMaterial.uniforms, s = this._atmosphereOverlay, l = Object.assign(this._atmosphereOverlay ?? {}, {
      map: n.outputBuffer
    });
    s !== l && (this._atmosphereOverlay = l, T.target = this, T.property = "atmosphereOverlay", this.events.dispatchEvent(T));
    const h = this._atmosphereShadow, u = Object.assign(this._atmosphereShadow ?? {}, {
      map: t.outputBuffer,
      mapSize: e.mapSize,
      cascadeCount: e.cascadeCount,
      intervals: i.shadowIntervals.value,
      matrices: i.shadowMatrices.value,
      inverseMatrices: a.inverseShadowMatrices.value,
      far: e.far,
      topHeight: i.shadowTopHeight.value
    });
    h !== u && (this._atmosphereShadow = u, T.target = this, T.property = "atmosphereShadow", this.events.dispatchEvent(T));
    const d = this._atmosphereShadowLength, v = n.shadowLengthBuffer != null ? Object.assign(this._atmosphereShadowLength ?? {}, {
      map: n.shadowLengthBuffer
    }) : null;
    d !== v && (this._atmosphereShadowLength = v, T.target = this, T.property = "atmosphereShadowLength", this.events.dispatchEvent(T));
  }
  update(e, t, n = 0) {
    const { shadowMaps: a, shadowPass: i, cloudsPass: s } = this;
    if (a.cascadeCount !== this.shadowCascadeCount || !a.mapSize.equals(this.shadowMapSize)) {
      const { width: l, height: h } = a.mapSize, u = a.cascadeCount;
      this.shadowMapSize.set(l, h), this.shadowCascadeCount = u, i.setSize(l, h, u), s.setShadowSize(l, h, u);
    }
    this.proceduralLocalWeather?.render(e, n), this.proceduralShape?.render(e, n), this.proceduralShapeDetail?.render(e, n), this.proceduralTurbulence?.render(e, n), ++this.frame, this.updateSharedUniforms(n), this.updateWeatherTextureChannels(), i.update(e, this.frame, n), s.shadowBuffer = i.outputBuffer, s.update(e, this.frame, n), this.updateAtmosphereComposition(), this.uniforms.get("cloudsBuffer").value = this.cloudsPass.outputBuffer;
  }
  setSize(e, t) {
    const { resolution: n } = this;
    n.setBaseSize(e, t);
    const { width: a, height: i } = n;
    this.cloudsPass.setSize(a, i);
  }
  setDepthTexture(e, t) {
    this.shadowPass.setDepthTexture(e, t), this.cloudsPass.setDepthTexture(e, t);
  }
  // eslint-disable-next-line accessor-pairs
  set qualityPreset(e) {
    const { clouds: t, shadow: n, ...a } = ft[e];
    Object.assign(this, a), Object.assign(this.clouds, t), Object.assign(this.shadow, n);
  }
  // Textures
  get localWeatherTexture() {
    return this.proceduralLocalWeather ?? this.parameterUniforms.localWeatherTexture.value;
  }
  set localWeatherTexture(e) {
    e instanceof ce || e == null ? (this.proceduralLocalWeather = void 0, this.parameterUniforms.localWeatherTexture.value = e) : (this.proceduralLocalWeather = e, this.parameterUniforms.localWeatherTexture.value = e.texture);
  }
  get shapeTexture() {
    return this.proceduralShape ?? this.parameterUniforms.shapeTexture.value;
  }
  set shapeTexture(e) {
    e instanceof le || e == null ? (this.proceduralShape = void 0, this.parameterUniforms.shapeTexture.value = e) : (this.proceduralShape = e, this.parameterUniforms.shapeTexture.value = e.texture);
  }
  get shapeDetailTexture() {
    return this.proceduralShapeDetail ?? this.parameterUniforms.shapeDetailTexture.value;
  }
  set shapeDetailTexture(e) {
    e instanceof le || e == null ? (this.proceduralShapeDetail = void 0, this.parameterUniforms.shapeDetailTexture.value = e) : (this.proceduralShapeDetail = e, this.parameterUniforms.shapeDetailTexture.value = e.texture);
  }
  get turbulenceTexture() {
    return this.proceduralTurbulence ?? this.parameterUniforms.turbulenceTexture.value;
  }
  set turbulenceTexture(e) {
    e instanceof ce || e == null ? (this.proceduralTurbulence = void 0, this.parameterUniforms.turbulenceTexture.value = e) : (this.proceduralTurbulence = e, this.parameterUniforms.turbulenceTexture.value = e.texture);
  }
  get stbnTexture() {
    return this.cloudsPass.currentMaterial.uniforms.stbnTexture.value;
  }
  set stbnTexture(e) {
    this.cloudsPass.currentMaterial.uniforms.stbnTexture.value = e, this.shadowPass.currentMaterial.uniforms.stbnTexture.value = e;
  }
  // Rendering controls
  get resolutionScale() {
    return this.resolution.scale;
  }
  set resolutionScale(e) {
    this.resolution.scale = e;
  }
  get temporalUpscale() {
    return this.cloudsPass.temporalUpscale;
  }
  set temporalUpscale(e) {
    this.cloudsPass.temporalUpscale = e;
  }
  get lightShafts() {
    return this.cloudsPass.lightShafts;
  }
  set lightShafts(e) {
    this.cloudsPass.lightShafts = e;
  }
  get shapeDetail() {
    return this.cloudsPass.currentMaterial.shapeDetail;
  }
  set shapeDetail(e) {
    this.cloudsPass.currentMaterial.shapeDetail = e, this.shadowPass.currentMaterial.shapeDetail = e;
  }
  get turbulence() {
    return this.cloudsPass.currentMaterial.turbulence;
  }
  set turbulence(e) {
    this.cloudsPass.currentMaterial.turbulence = e, this.shadowPass.currentMaterial.turbulence = e;
  }
  get haze() {
    return this.cloudsPass.currentMaterial.haze;
  }
  set haze(e) {
    this.cloudsPass.currentMaterial.haze = e;
  }
  // Cloud parameter primitives
  get scatteringCoefficient() {
    return this.parameterUniforms.scatteringCoefficient.value;
  }
  set scatteringCoefficient(e) {
    this.parameterUniforms.scatteringCoefficient.value = e;
  }
  get absorptionCoefficient() {
    return this.parameterUniforms.absorptionCoefficient.value;
  }
  set absorptionCoefficient(e) {
    this.parameterUniforms.absorptionCoefficient.value = e;
  }
  get coverage() {
    return this.parameterUniforms.coverage.value;
  }
  set coverage(e) {
    this.parameterUniforms.coverage.value = e;
  }
  get turbulenceDisplacement() {
    return this.parameterUniforms.turbulenceDisplacement.value;
  }
  set turbulenceDisplacement(e) {
    this.parameterUniforms.turbulenceDisplacement.value = e;
  }
  // Scattering parameters
  get scatterAnisotropy1() {
    return this.cloudsPass.currentMaterial.scatterAnisotropy1;
  }
  set scatterAnisotropy1(e) {
    this.cloudsPass.currentMaterial.scatterAnisotropy1 = e;
  }
  get scatterAnisotropy2() {
    return this.cloudsPass.currentMaterial.scatterAnisotropy2;
  }
  set scatterAnisotropy2(e) {
    this.cloudsPass.currentMaterial.scatterAnisotropy2 = e;
  }
  get scatterAnisotropyMix() {
    return this.cloudsPass.currentMaterial.scatterAnisotropyMix;
  }
  set scatterAnisotropyMix(e) {
    this.cloudsPass.currentMaterial.scatterAnisotropyMix = e;
  }
  get skyLightScale() {
    return this.cloudsPass.currentMaterial.uniforms.skyLightScale.value;
  }
  set skyLightScale(e) {
    this.cloudsPass.currentMaterial.uniforms.skyLightScale.value = e;
  }
  get groundBounceScale() {
    return this.cloudsPass.currentMaterial.uniforms.groundBounceScale.value;
  }
  set groundBounceScale(e) {
    this.cloudsPass.currentMaterial.uniforms.groundBounceScale.value = e;
  }
  get powderScale() {
    return this.cloudsPass.currentMaterial.uniforms.powderScale.value;
  }
  set powderScale(e) {
    this.cloudsPass.currentMaterial.uniforms.powderScale.value = e;
  }
  get powderExponent() {
    return this.cloudsPass.currentMaterial.uniforms.powderExponent.value;
  }
  set powderExponent(e) {
    this.cloudsPass.currentMaterial.uniforms.powderExponent.value = e;
  }
  // Atmosphere composition
  get atmosphereOverlay() {
    return this._atmosphereOverlay;
  }
  get atmosphereShadow() {
    return this._atmosphereShadow;
  }
  get atmosphereShadowLength() {
    return this._atmosphereShadowLength;
  }
  // Atmosphere parameters
  get irradianceTexture() {
    return this.cloudsPass.currentMaterial.irradianceTexture;
  }
  set irradianceTexture(e) {
    this.cloudsPass.currentMaterial.irradianceTexture = e;
  }
  get scatteringTexture() {
    return this.cloudsPass.currentMaterial.scatteringTexture;
  }
  set scatteringTexture(e) {
    this.cloudsPass.currentMaterial.scatteringTexture = e;
  }
  get transmittanceTexture() {
    return this.cloudsPass.currentMaterial.transmittanceTexture;
  }
  set transmittanceTexture(e) {
    this.cloudsPass.currentMaterial.transmittanceTexture = e;
  }
  get singleMieScatteringTexture() {
    return this.cloudsPass.currentMaterial.singleMieScatteringTexture;
  }
  set singleMieScatteringTexture(e) {
    this.cloudsPass.currentMaterial.singleMieScatteringTexture = e;
  }
  get higherOrderScatteringTexture() {
    return this.cloudsPass.currentMaterial.higherOrderScatteringTexture;
  }
  set higherOrderScatteringTexture(e) {
    this.cloudsPass.currentMaterial.higherOrderScatteringTexture = e;
  }
  get ellipsoid() {
    return this.cloudsPass.currentMaterial.ellipsoid;
  }
  set ellipsoid(e) {
    this.cloudsPass.currentMaterial.ellipsoid = e;
  }
  get sunAngularRadius() {
    return this.cloudsPass.currentMaterial.sunAngularRadius;
  }
  set sunAngularRadius(e) {
    this.cloudsPass.currentMaterial.sunAngularRadius = e;
  }
}
Bt([
  x("SKIP_RENDERING")
], Xt.prototype, "skipRendering");
const rn = 128, on = 32, j = "45a1c6c1bb9fd38b3680fd120795ff4c32df68ff", sn = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${j}/packages/clouds/assets/local_weather.png`, cn = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${j}/packages/clouds/assets/shape.bin`, ln = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${j}/packages/clouds/assets/shape_detail.bin`, hn = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${j}/packages/clouds/assets/turbulence.png`;
export {
  rn as C,
  sn as D,
  on as a,
  w as b,
  X as c,
  Xt as d,
  ln as e,
  cn as f,
  hn as g,
  k as h,
  $t as i
};
