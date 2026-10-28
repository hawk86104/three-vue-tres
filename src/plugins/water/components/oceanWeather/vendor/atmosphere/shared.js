import { BlendFunction as Jt, Effect as Qt, EffectAttribute as en, Pass as tn, Selection as nn, RenderPass as rn, DepthCopyPass as Ze, ClearPass as an, DepthMaskMaterial as on, DepthTestStrategy as sn, ShaderPass as cn } from "postprocessing";
import { Vector3 as p, Color as ae, Uniform as d, Camera as St, Vector2 as oe, Matrix4 as D, RawShaderMaterial as vt, Quaternion as un, HalfFloatType as k, MeshBasicMaterial as ln, DepthTexture as dn, UnsignedIntType as hn, WebGLRenderTarget as Et, RedFormat as mn, RGBADepthPacking as X0, LessEqualDepth as fn, BasicDepthPacking as gn, Matrix3 as w0, Mesh as pn, PlaneGeometry as Tn, Scene as Sn, FloatType as _e, GLSL3 as He, CustomBlending as vn, NoBlending as En, AddEquation as Je, OneFactor as Y0, RGBAFormat as Rt, LinearFilter as D0, ClampToEdgeWrapping as U0, NoColorSpace as _t, WebGL3DRenderTarget as Rn, Loader as _n, Data3DTexture as ge, DataTexture as Qe, LightProbe as xn, BufferGeometry as Mn, InterleavedBuffer as et, InterleavedBufferAttribute as pe, Sphere as An, DirectionalLight as wn } from "three";
import { radians as xt, Ellipsoid as F0, define as w, defineInt as yn, unrollLoops as Cn, resolveIncludes as W, Geodetic as Dn, saturate as In, remap as Pn, reinterpretType as be, clamp as tt, isTypedArray as nt, Float16Array as Mt, isFloatLinearSupported as At, EXR3DTextureLoader as Te, EXRTextureLoader as rt, DataTextureLoader as O0, parseFloat16Array as L0 } from "../geospatial/index.js";
import { vogelDisk as Nn, interleavedGradientNoise as On, cascadedShadowMaps as Ln, raySphereIntersection as wt, transform as Hn, math as bn, packing as Un, depth as yt } from "../geospatial/shaders.js";
import { M as ee, j as h0, T as m0, g as Ue, d as Ge, e as Fe, f as ze, b as f0, I as g0, k as ke, l as Gn, S as s0, c as c0, h as u0, r as it } from "./shared2.js";
import { c as Ve, a as K, _ as $, b as S0 } from "./shared3.js";
const Fn = /* @__PURE__ */ new p(0.2126, 0.7152, 0.0722), zn = [
  "solarIrradiance",
  "sunAngularRadius",
  "bottomRadius",
  "topRadius",
  "rayleighDensity",
  "rayleighScattering",
  "mieDensity",
  "mieScattering",
  "mieExtinction",
  "miePhaseFunctionG",
  "absorptionDensity",
  "absorptionExtinction",
  "groundAlbedo",
  "muSMin",
  "skyRadianceToLuminance",
  "sunRadianceToLuminance"
];
function kn(n, e) {
  if (e != null)
    for (const t of zn) {
      const r = e[t];
      r != null && (n[t] instanceof p ? n[t].copy(r) : n[t] = r);
    }
}
class v0 {
  constructor(e, t, r, i, a) {
    this.width = e, this.expTerm = t, this.expScale = r, this.linearTerm = i, this.constantTerm = a;
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  toUniform() {
    return new d({
      width: this.width,
      exp_term: this.expTerm,
      exp_scale: this.expScale,
      linear_term: this.linearTerm,
      constant_term: this.constantTerm
    });
  }
}
const ie = class ie {
  constructor(e) {
    this.solarIrradiance = new p(1.474, 1.8504, 1.91198), this.sunAngularRadius = 4675e-6, this.bottomRadius = 636e4, this.topRadius = 642e4, this.rayleighDensity = [
      new v0(0, 0, 0, 0, 0),
      new v0(0, 1, -0.125, 0, 0)
    ], this.rayleighScattering = new p(5802e-6, 0.013558, 0.0331), this.mieDensity = [
      new v0(0, 0, 0, 0, 0),
      new v0(0, 1, -0.833333, 0, 0)
    ], this.mieScattering = new p(3996e-6, 3996e-6, 3996e-6), this.mieExtinction = new p(444e-5, 444e-5, 444e-5), this.miePhaseFunctionG = 0.8, this.absorptionDensity = [
      new v0(25, 0, 0, 1 / 15, -2 / 3),
      new v0(0, 0, 0, -1 / 15, 8 / 3)
    ], this.absorptionExtinction = new p(65e-5, 1881e-6, 85e-6), this.groundAlbedo = new ae().setScalar(0.1), this.muSMin = Math.cos(xt(120)), this.sunRadianceToLuminance = new p(98242.786222, 69954.398112, 66475.012354), this.skyRadianceToLuminance = new p(114974.916437, 71305.954816, 65310.548555), this.sunRadianceToRelativeLuminance = new p(), this.skyRadianceToRelativeLuminance = new p(), kn(this, e);
    const t = Fn.dot(this.sunRadianceToLuminance);
    this.sunRadianceToRelativeLuminance.copy(this.sunRadianceToLuminance).divideScalar(t), this.skyRadianceToRelativeLuminance.copy(this.skyRadianceToLuminance).divideScalar(t);
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  toUniform() {
    return new d({
      solar_irradiance: this.solarIrradiance,
      sun_angular_radius: this.sunAngularRadius,
      bottom_radius: this.bottomRadius * ee,
      top_radius: this.topRadius * ee,
      rayleigh_density: {
        layers: this.rayleighDensity.map((e) => e.toUniform().value)
      },
      rayleigh_scattering: this.rayleighScattering,
      mie_density: {
        layers: this.mieDensity.map((e) => e.toUniform().value)
      },
      mie_scattering: this.mieScattering,
      mie_extinction: this.mieExtinction,
      mie_phase_function_g: this.miePhaseFunctionG,
      absorption_density: {
        layers: this.absorptionDensity.map((e) => e.toUniform().value)
      },
      absorption_extinction: this.absorptionExtinction,
      ground_albedo: this.groundAlbedo,
      mu_s_min: this.muSMin
    });
  }
};
ie.DEFAULT = /* @__PURE__ */ new ie();
let n0 = ie;
const Vn = `precision highp sampler2DArray;

#include "core/depth"
#include "core/math"
#include "core/packing"
#include "core/transform"
#ifdef HAS_SHADOW
#include "core/raySphereIntersection"
#include "core/cascadedShadowMaps"
#include "core/interleavedGradientNoise"
#include "core/vogelDisk"
#endif // HAS_SHADOW

#include "bruneton/definitions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "bruneton/common"
#include "bruneton/runtime"

uniform sampler2D normalBuffer;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform float bottomRadius;
uniform mat4 worldToECEFMatrix;
uniform float geometricErrorCorrectionAmount;
uniform vec3 sunDirection;
uniform float cosSunAngularRadius;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;
uniform float albedoScale;

#include "sky"

#ifdef HAS_LIGHTING_MASK
uniform sampler2D lightingMaskBuffer;
#endif // HAS_LIGHTING_MASK

// prettier-ignore
#define LIGHTING_MASK_CHANNEL_ LIGHTING_MASK_CHANNEL

#ifdef HAS_OVERLAY
uniform sampler2D overlayBuffer;
#endif // HAS_OVERLAY

#ifdef HAS_SHADOW
uniform sampler2DArray shadowBuffer;
uniform vec2 shadowIntervals[SHADOW_CASCADE_COUNT];
uniform mat4 shadowMatrices[SHADOW_CASCADE_COUNT];
uniform mat4 inverseShadowMatrices[SHADOW_CASCADE_COUNT];
uniform float shadowFar;
uniform float shadowTopHeight;
uniform float shadowRadius;
uniform sampler3D stbnTexture;
uniform int frame;
#endif // HAS_SHADOW

#ifdef HAS_SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
#endif // HAS_SHADOW_LENGTH

varying vec3 vCameraPosition;
varying vec3 vRayDirection;
varying vec3 vGeometryAltitudeCorrection;
varying vec3 vEllipsoidRadiiSquared;

vec3 readNormal(const vec2 uv, out bool degenerate) {
  vec3 normal = texture(normalBuffer, uv).xyz;
  degenerate = normal == vec3(0.0);
  #ifdef OCT_ENCODED_NORMAL
  return unpackVec2ToNormal(normal.xy);
  #else // OCT_ENCODED_NORMAL
  return 2.0 * normal - 1.0;
  #endif // OCT_ENCODED_NORMAL
}

void correctGeometricError(inout vec3 positionECEF, inout vec3 normalECEF) {
  // TODO: The error is pronounced at the edge of the ellipsoid due to the
  // large difference between the sphere position and the unprojected position
  // at the current fragment. Calculating the sphere position from the fragment
  // UV may resolve this.

  // Correct way is slerp, but this will be small-angle interpolation anyways.
  vec3 sphereNormal = normalize(positionECEF / vEllipsoidRadiiSquared);
  vec3 spherePosition = ATMOSPHERE.bottom_radius * sphereNormal;
  normalECEF = mix(normalECEF, sphereNormal, geometricErrorCorrectionAmount);
  positionECEF = mix(positionECEF, spherePosition, geometricErrorCorrectionAmount);
}

#if defined(SUN_LIGHT) || defined(SKY_LIGHT)

vec3 getSunSkyIrradiance(
  const vec3 positionECEF,
  const vec3 normal,
  const vec3 inputColor,
  const float sunTransmittance
) {
  // Assume lambertian BRDF. If both SUN_LIGHT and SKY_LIGHT are not defined,
  // regard the inputColor as radiance at the texel.
  vec3 diffuse = inputColor * albedoScale * RECIPROCAL_PI;
  vec3 skyIrradiance;
  vec3 sunIrradiance = GetSunAndSkyIrradiance(positionECEF, normal, sunDirection, skyIrradiance);

  #ifdef HAS_SHADOW
  sunIrradiance *= sunTransmittance;
  #endif // HAS_SHADOW

  #if defined(SUN_LIGHT) && defined(SKY_LIGHT)
  return diffuse * (sunIrradiance + skyIrradiance);
  #elif defined(SUN_LIGHT)
  return diffuse * sunIrradiance;
  #elif defined(SKY_LIGHT)
  return diffuse * skyIrradiance;
  #endif // defined(SUN_LIGHT) && defined(SKY_LIGHT)
}

#endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)

#if defined(TRANSMITTANCE) || defined(INSCATTER)

void applyTransmittanceInscatter(const vec3 positionECEF, float shadowLength, inout vec3 radiance) {
  vec3 transmittance;
  vec3 inscatter = GetSkyRadianceToPoint(
    vCameraPosition,
    positionECEF,
    shadowLength,
    sunDirection,
    transmittance
  );
  #ifdef TRANSMITTANCE
  radiance = radiance * transmittance;
  #endif // TRANSMITTANCE
  #ifdef INSCATTER
  radiance = radiance + inscatter;
  #endif // INSCATTER
}

#endif // defined(TRANSMITTANCE) || defined(INSCATTER)

#ifdef HAS_SHADOW

float getSTBN() {
  ivec3 size = textureSize(stbnTexture, 0);
  vec3 scale = 1.0 / vec3(size);
  return texture(stbnTexture, vec3(gl_FragCoord.xy, float(frame % size.z)) * scale).r;
}

vec2 getShadowUv(const vec3 worldPosition, const int cascadeIndex) {
  vec4 clip = shadowMatrices[cascadeIndex] * vec4(worldPosition, 1.0);
  clip /= clip.w;
  return clip.xy * 0.5 + 0.5;
}

float getDistanceToShadowTop(const vec3 positionECEF) {
  // Distance to the top of the shadows along the sun direction, which matches
  // the ray origin of BSM.
  return raySphereSecondIntersection(
    positionECEF / METER_TO_LENGTH_UNIT, // TODO: Make units consistent
    sunDirection,
    vec3(0.0),
    bottomRadius + shadowTopHeight
  );
}

float readShadowOpticalDepth(const vec2 uv, const float distanceToTop, const int cascadeIndex) {
  // r: frontDepth, g: meanExtinction, b: maxOpticalDepth, a: maxOpticalDepthTail
  vec4 shadow = texture(shadowBuffer, vec3(uv, float(cascadeIndex)));
  // Omit adding maxOpticalDepthTail to avoid pronounced aliasing. Ground
  // shadow will be attenuated by inscatter anyways.
  return min(shadow.b, shadow.g * max(0.0, distanceToTop - shadow.r));
}

float sampleShadowOpticalDepthPCF(
  const vec3 worldPosition,
  const float distanceToTop,
  const float radius,
  const int cascadeIndex
) {
  vec2 uv = getShadowUv(worldPosition, cascadeIndex);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }

  vec2 texelSize = vec2(1.0) / vec2(textureSize(shadowBuffer, 0).xy);
  float sum = 0.0;
  vec2 offset;
  #pragma unroll_loop_start
  for (int i = 0; i < 16; ++i) {
    #if UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
    offset = vogelDisk(
      UNROLLED_LOOP_INDEX,
      SHADOW_SAMPLE_COUNT,
      interleavedGradientNoise(gl_FragCoord.xy) * PI2
    );
    sum += readShadowOpticalDepth(uv + offset * radius * texelSize, distanceToTop, cascadeIndex);
    #endif // UNROLLED_LOOP_INDEX < SHADOW_SAMPLE_COUNT
  }
  #pragma unroll_loop_end
  return sum / float(SHADOW_SAMPLE_COUNT);
}

float sampleShadowOpticalDepth(
  const vec3 worldPosition,
  const vec3 positionECEF,
  const float radius,
  const float jitter
) {
  float distanceToTop = getDistanceToShadowTop(positionECEF);
  if (distanceToTop <= 0.0) {
    return 0.0;
  }
  int cascadeIndex = getFadedCascadeIndex(
    viewMatrix,
    worldPosition,
    shadowIntervals,
    cameraNear,
    shadowFar,
    jitter
  );
  return cascadeIndex >= 0
    ? sampleShadowOpticalDepthPCF(worldPosition, distanceToTop, radius, cascadeIndex)
    : 0.0;
}

float getShadowRadius(const vec3 worldPosition) {
  vec4 clip = shadowMatrices[0] * vec4(worldPosition, 1.0);
  clip /= clip.w;

  // Offset by 1px in each direction in shadow's clip coordinates.
  vec2 shadowSize = vec2(textureSize(shadowBuffer, 0));
  vec3 offset = vec3(2.0 / shadowSize, 0.0);
  vec4 clipX = clip + offset.xzzz;
  vec4 clipY = clip + offset.zyzz;

  // Convert back to world space.
  vec4 worldX = inverseShadowMatrices[0] * clipX;
  vec4 worldY = inverseShadowMatrices[0] * clipY;

  // Project into the main camera's clip space.
  mat4 viewProjectionMatrix = projectionMatrix * viewMatrix;
  vec4 projected = viewProjectionMatrix * vec4(worldPosition, 1.0);
  vec4 projectedX = viewProjectionMatrix * worldX;
  vec4 projectedY = viewProjectionMatrix * worldY;
  projected /= projected.w;
  projectedX /= projectedX.w;
  projectedY /= projectedY.w;

  // Take the mean of pixel sizes.
  vec2 center = (projected.xy * 0.5 + 0.5) * resolution;
  vec2 offsetX = (projectedX.xy * 0.5 + 0.5) * resolution;
  vec2 offsetY = (projectedY.xy * 0.5 + 0.5) * resolution;
  float size = max(length(offsetX - center), length(offsetY - center));

  return remapClamped(size, 10.0, 50.0, 0.0, shadowRadius);
}

#endif // HAS_SHADOW

void mainImage(const vec4 inputColor, const vec2 uv, out vec4 outputColor) {
  #if defined(HAS_LIGHTING_MASK) && defined(DEBUG_SHOW_LIGHTING_MASK)
  outputColor.rgb = vec3(texture(lightingMaskBuffer, uv).LIGHTING_MASK_CHANNEL_);
  outputColor.a = 1.0;
  return;
  #endif // defined(HAS_LIGHTING_MASK) && defined(DEBUG_SHOW_LIGHTING_MASK)

  float shadowLength = 0.0;
  #ifdef HAS_SHADOW_LENGTH
  shadowLength = texture(shadowLengthBuffer, uv).r;
  #endif // HAS_SHADOW_LENGTH

  #ifdef HAS_OVERLAY
  vec4 overlay = texture(overlayBuffer, uv);
  if (overlay.a == 1.0) {
    outputColor = overlay;
    return;
  }
  #endif // HAS_OVERLAY

  vec3 rayDirection = normalize(vRayDirection);
  vec3 dRDdx = dFdx(rayDirection);
  vec3 dRDdy = dFdy(rayDirection);
  float fragmentAngle = length(dRDdx + dRDdy) / length(rayDirection);

  float depth = readDepthValue(depthBuffer, uv);
  if (depth >= 1.0 - 1e-8) {
    #ifdef SKY
    outputColor.rgb = getSkyRadiance(
      vCameraPosition,
      rayDirection,
      shadowLength,
      sunDirection,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      fragmentAngle
    );
    outputColor.a = 1.0;
    #else // SKY
    outputColor = inputColor;
    #endif // SKY

    #ifdef HAS_OVERLAY
    outputColor.rgb = outputColor.rgb * (1.0 - overlay.a) + overlay.rgb;
    #endif // HAS_OVERLAY
    return;
  }
  depth = reverseLogDepth(depth, cameraNear, cameraFar);

  // Reconstruct position and normal in world space.
  vec3 viewPosition = screenToView(
    uv,
    depth,
    getViewZ(depth),
    projectionMatrix,
    inverseProjectionMatrix
  );
  vec3 worldPosition = (inverseViewMatrix * vec4(viewPosition, 1.0)).xyz;
  vec3 positionECEF = (worldToECEFMatrix * vec4(worldPosition, 1.0)).xyz;
  positionECEF = positionECEF * METER_TO_LENGTH_UNIT + vGeometryAltitudeCorrection;

  vec3 viewNormal;
  bool degenerateNormal = false;
  #ifdef RECONSTRUCT_NORMAL
  vec3 dVPdx = dFdx(viewPosition);
  vec3 dVPdy = dFdy(viewPosition);
  viewNormal = normalize(cross(dVPdx, dVPdy));
  #elif defined(HAS_NORMALS)
  viewNormal = readNormal(uv, degenerateNormal);
  #endif // defined(HAS_NORMALS)

  #if defined(RECONSTRUCT_NORMAL) || defined(HAS_NORMALS)
  vec3 worldNormal = (inverseViewMatrix * vec4(viewNormal, 0.0)).xyz;
  vec3 normalECEF = (worldToECEFMatrix * vec4(worldNormal, 0.0)).xyz;
  #else // defined(RECONSTRUCT_NORMAL) || defined(HAS_NORMALS)
  vec3 normalECEF = normalize(positionECEF);
  #endif // defined(RECONSTRUCT_NORMAL) || defined(HAS_NORMALS)

  #ifdef CORRECT_GEOMETRIC_ERROR
  correctGeometricError(positionECEF, normalECEF);
  #endif // CORRECT_GEOMETRIC_ERROR

  #ifdef HAS_SHADOW
  float stbn = getSTBN();
  float radius = getShadowRadius(worldPosition);
  float opticalDepth = sampleShadowOpticalDepth(worldPosition, positionECEF, radius, stbn);
  float sunTransmittance = exp(-opticalDepth);
  #else // HAS_SHADOW
  float sunTransmittance = 1.0;
  #endif // HAS_SHADOW

  vec3 radiance;
  #if defined(SUN_LIGHT) || defined(SKY_LIGHT)
  // WORKAROUND: When both post-process lighting and sky options are enabled,
  // stars have degenerate normals. We use this to disable irradiance, which is
  // irrelevant for them.
  if (!degenerateNormal) {
    radiance = getSunSkyIrradiance(positionECEF, normalECEF, inputColor.rgb, sunTransmittance);
  } else {
    radiance = inputColor.rgb;
  }
  #ifdef HAS_LIGHTING_MASK
  float lightingMask = texture(lightingMaskBuffer, uv).LIGHTING_MASK_CHANNEL_;
  radiance = mix(inputColor.rgb, radiance, lightingMask);
  #endif // HAS_LIGHTING_MASK
  #else // defined(SUN_LIGHT) || defined(SKY_LIGHT)
  radiance = inputColor.rgb;
  #endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)

  #if defined(TRANSMITTANCE) || defined(INSCATTER)
  applyTransmittanceInscatter(positionECEF, shadowLength, radiance);
  #endif // defined(TRANSMITTANCE) || defined(INSCATTER)

  outputColor = vec4(radiance, inputColor.a);

  #ifdef HAS_OVERLAY
  outputColor.rgb = outputColor.rgb * (1.0 - overlay.a) + overlay.rgb;
  #endif // HAS_OVERLAY
}
`, Bn = `uniform mat4 inverseViewMatrix;
uniform mat4 inverseProjectionMatrix;
uniform vec3 cameraPosition;
uniform mat4 worldToECEFMatrix;
uniform vec3 altitudeCorrection;
uniform float geometricErrorCorrectionAmount;
uniform vec3 ellipsoidRadii;

varying vec3 vCameraPosition;
varying vec3 vRayDirection;
varying vec3 vGeometryAltitudeCorrection;
varying vec3 vEllipsoidRadiiSquared;

void getCameraRay(out vec3 origin, out vec3 direction) {
  bool isPerspective = inverseProjectionMatrix[2][3] != 0.0; // 4th entry in the 3rd column

  if (isPerspective) {
    // Calculate the camera ray for a perspective camera.
    vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
    vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
    origin = cameraPosition;
    direction = worldDirection.xyz;
  } else {
    // Unprojected points to calculate direction.
    vec4 nearPoint = inverseProjectionMatrix * vec4(position.xy, -1.0, 1.0);
    vec4 farPoint = inverseProjectionMatrix * vec4(position.xy, -0.9, 1.0);
    nearPoint /= nearPoint.w;
    farPoint /= farPoint.w;

    // Calculate world values.
    vec4 worldDirection = inverseViewMatrix * vec4(farPoint.xyz - nearPoint.xyz, 0.0);
    vec4 worldOrigin = inverseViewMatrix * nearPoint;

    // Outputs
    direction = worldDirection.xyz;
    origin = worldOrigin.xyz;
  }
}

void mainSupport() {
  vec3 direction, origin;
  getCameraRay(origin, direction);

  vec3 cameraPositionECEF = (worldToECEFMatrix * vec4(origin, 1.0)).xyz;
  vCameraPosition = (cameraPositionECEF + altitudeCorrection) * METER_TO_LENGTH_UNIT;
  vRayDirection = (worldToECEFMatrix * vec4(direction, 0.0)).xyz;

  vGeometryAltitudeCorrection = altitudeCorrection * METER_TO_LENGTH_UNIT;
  // Gradually turn off the altitude correction on geometries as the geometric
  // error correction takes effect, because that on the ideal sphere will be
  // over corrected.
  // See: https://github.com/takram-design-engineering/three-geospatial/pull/23#issuecomment-2542914656
  #ifdef CORRECT_GEOMETRIC_ERROR
  vGeometryAltitudeCorrection *= 1.0 - geometricErrorCorrectionAmount;
  #endif // CORRECT_GEOMETRIC_ERROR

  vec3 radii = ellipsoidRadii * METER_TO_LENGTH_UNIT;
  vEllipsoidRadiiSquared = radii * radii;
}
`, Ct = `vec3 getLunarRadiance(const float moonAngularRadius) {
  // Not a physical number but the order of 10^-6 relative to the sun may fit.
  vec3 radiance =
    ATMOSPHERE.solar_irradiance *
    0.000002 /
    (PI * moonAngularRadius * moonAngularRadius) *
    SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
  return radiance;
}

float intersectSphere(const vec3 ray, const vec3 point, const float radius) {
  vec3 P = -point;
  float PoR = dot(P, ray);
  float D = dot(P, P) - radius * radius;
  return -PoR - sqrt(PoR * PoR - D);
}

float orenNayarDiffuse(const vec3 L, const vec3 V, const vec3 N) {
  float NoL = dot(N, L);
  float NoV = dot(N, V);
  float s = dot(L, V) - NoL * NoV;
  float t = mix(1.0, max(NoL, NoV), step(0.0, s));
  return max(0.0, NoL) * (0.62406015 + 0.41284404 * s / t);
}

vec3 getSkyRadiance(
  const vec3 cameraPosition,
  const vec3 rayDirection,
  const float shadowLength,
  const vec3 sunDirection,
  const vec3 moonDirection,
  const float moonAngularRadius,
  const float lunarRadianceScale,
  const float fragmentAngle
) {
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    cameraPosition,
    rayDirection,
    shadowLength,
    sunDirection,
    transmittance
  );

  // Rendering celestial objects without perspective doesn't make sense.
  #ifdef PERSPECTIVE_CAMERA

  #ifdef SUN
  float viewDotSun = dot(rayDirection, sunDirection);
  if (viewDotSun > cosSunAngularRadius) {
    float angle = acos(clamp(viewDotSun, -1.0, 1.0));
    float antialias = smoothstep(
      ATMOSPHERE.sun_angular_radius,
      ATMOSPHERE.sun_angular_radius - fragmentAngle,
      angle
    );
    radiance += transmittance * GetSolarRadiance() * antialias;
  }
  #endif // SUN

  #ifdef MOON
  float intersection = intersectSphere(rayDirection, moonDirection, moonAngularRadius);
  if (intersection > 0.0) {
    vec3 normal = normalize(moonDirection - rayDirection * intersection);
    float diffuse = orenNayarDiffuse(-sunDirection, rayDirection, normal);
    float viewDotMoon = dot(rayDirection, moonDirection);
    float angle = acos(clamp(viewDotMoon, -1.0, 1.0));
    float antialias = smoothstep(moonAngularRadius, moonAngularRadius - fragmentAngle, angle);
    radiance +=
      transmittance *
      getLunarRadiance(moonAngularRadius) *
      lunarRadianceScale *
      diffuse *
      antialias;
  }
  #endif // MOON

  #endif // PERSPECTIVE_CAMERA

  return radiance;
}
`;
var Wn = Object.defineProperty, L = (n, e, t, r) => {
  for (var i = void 0, a = n.length - 1, o; a >= 0; a--)
    (o = n[a]) && (i = o(e, t, i) || i);
  return i && Wn(e, t, i), i;
};
const jn = /* @__PURE__ */ new p(), Xn = /* @__PURE__ */ new p(), Yn = /* @__PURE__ */ new Dn(), Kn = {
  blendFunction: Jt.NORMAL,
  octEncodedNormal: !1,
  reconstructNormal: !1,
  ellipsoid: F0.WGS84,
  correctAltitude: !0,
  correctGeometricError: !0,
  sunLight: !1,
  skyLight: !1,
  transmittance: !0,
  inscatter: !0,
  albedoScale: 1,
  sky: !1,
  sun: !0,
  moon: !0,
  moonAngularRadius: 45e-4,
  // ≈ 15.5 arcminutes
  lunarRadianceScale: 1,
  ground: !0
};
class H extends Qt {
  constructor(e = new St(), t, r = n0.DEFAULT) {
    const {
      blendFunction: i,
      normalBuffer: a = null,
      octEncodedNormal: o,
      reconstructNormal: c,
      irradianceTexture: s = null,
      scatteringTexture: l = null,
      transmittanceTexture: h = null,
      singleMieScatteringTexture: m = null,
      higherOrderScatteringTexture: f = null,
      ellipsoid: v,
      correctAltitude: T,
      correctGeometricError: E,
      sunDirection: x,
      sunLight: y,
      skyLight: I,
      transmittance: N,
      inscatter: b,
      albedoScale: U,
      sky: z,
      sun: F,
      moon: q,
      moonDirection: Z,
      moonAngularRadius: i0,
      lunarRadianceScale: a0,
      ground: J
    } = { ...Kn, ...t };
    super(
      "AerialPerspectiveEffect",
      Cn(
        W(Vn, {
          core: {
            depth: yt,
            packing: Un,
            math: bn,
            transform: Hn,
            raySphereIntersection: wt,
            cascadedShadowMaps: Ln,
            interleavedGradientNoise: On,
            vogelDisk: Nn
          },
          bruneton: {
            common: $,
            definitions: K,
            runtime: Ve
          },
          sky: Ct
        })
      ),
      {
        blendFunction: i,
        vertexShader: Bn,
        attributes: en.DEPTH,
        // prettier-ignore
        uniforms: new Map(
          Object.entries({
            normalBuffer: new d(a),
            projectionMatrix: new d(new D()),
            viewMatrix: new d(new D()),
            inverseProjectionMatrix: new d(new D()),
            inverseViewMatrix: new d(new D()),
            cameraPosition: new d(new p()),
            bottomRadius: new d(r.bottomRadius),
            ellipsoidRadii: new d(new p()),
            worldToECEFMatrix: new d(new D()),
            altitudeCorrection: new d(new p()),
            geometricErrorCorrectionAmount: new d(0),
            sunDirection: new d(x?.clone() ?? new p()),
            cosSunAngularRadius: new d(r.sunAngularRadius),
            albedoScale: new d(U),
            moonDirection: new d(Z?.clone() ?? new p()),
            moonAngularRadius: new d(i0),
            lunarRadianceScale: new d(a0),
            // Composition and shadow
            overlayBuffer: new d(null),
            shadowBuffer: new d(null),
            shadowMapSize: new d(new oe()),
            shadowIntervals: new d([]),
            shadowMatrices: new d([]),
            inverseShadowMatrices: new d([]),
            shadowFar: new d(0),
            shadowTopHeight: new d(0),
            shadowRadius: new d(3),
            stbnTexture: new d(null),
            frame: new d(0),
            shadowLengthBuffer: new d(null),
            // Lighting mask
            lightingMaskBuffer: new d(null),
            // Uniforms for atmosphere functions
            ATMOSPHERE: r.toUniform(),
            SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: new d(r.sunRadianceToRelativeLuminance),
            SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: new d(r.skyRadianceToRelativeLuminance),
            irradiance_texture: new d(s),
            scattering_texture: new d(l),
            transmittance_texture: new d(h),
            single_mie_scattering_texture: new d(null),
            higher_order_scattering_texture: new d(null)
          })
        ),
        // prettier-ignore
        defines: /* @__PURE__ */ new Map([
          ["TRANSMITTANCE_TEXTURE_WIDTH", h0.toFixed(0)],
          ["TRANSMITTANCE_TEXTURE_HEIGHT", m0.toFixed(0)],
          ["SCATTERING_TEXTURE_R_SIZE", Ue.toFixed(0)],
          ["SCATTERING_TEXTURE_MU_SIZE", Ge.toFixed(0)],
          ["SCATTERING_TEXTURE_MU_S_SIZE", Fe.toFixed(0)],
          ["SCATTERING_TEXTURE_NU_SIZE", ze.toFixed(0)],
          ["IRRADIANCE_TEXTURE_WIDTH", f0.toFixed(0)],
          ["IRRADIANCE_TEXTURE_HEIGHT", g0.toFixed(0)],
          ["METER_TO_LENGTH_UNIT", ee.toFixed(7)]
        ])
      }
    ), this.camera = e, this.atmosphere = r, this.overlay = null, this.shadow = null, this.shadowLength = null, this.lightingMask = null, this.hasNormals = !1, this.combinedScatteringTextures = !1, this.hasHigherOrderScatteringTexture = !1, this.shadowSampleCount = 8, this.octEncodedNormal = o, this.reconstructNormal = c, this.singleMieScatteringTexture = m, this.higherOrderScatteringTexture = f, this.ellipsoid = v, this.correctAltitude = T, this.correctGeometricError = E, this.sunLight = y, this.skyLight = I, this.transmittance = N, this.inscatter = b, this.sky = z, this.sun = F, this.moon = q, this.ground = J;
  }
  get mainCamera() {
    return this.camera;
  }
  set mainCamera(e) {
    this.camera = e;
  }
  copyCameraSettings(e) {
    const {
      projectionMatrix: t,
      matrixWorldInverse: r,
      projectionMatrixInverse: i,
      matrixWorld: a
    } = e, o = this.uniforms;
    o.get("projectionMatrix").value.copy(t), o.get("viewMatrix").value.copy(r), o.get("inverseProjectionMatrix").value.copy(i), o.get("inverseViewMatrix").value.copy(a);
    const c = e.getWorldPosition(
      o.get("cameraPosition").value
    ), s = o.get("worldToECEFMatrix").value, l = jn.copy(c).applyMatrix4(s);
    try {
      const m = Yn.setFromECEF(l).height, f = Xn.set(0, this.ellipsoid.maximumRadius, -Math.max(0, m)).applyMatrix4(t);
      o.get("geometricErrorCorrectionAmount").value = In(
        Pn(f.y, 41.5, 13.8, 0, 1)
      );
    } catch {
      return;
    }
    const h = o.get("altitudeCorrection");
    this.correctAltitude ? ke(
      l,
      this.atmosphere.bottomRadius,
      this.ellipsoid,
      h.value
    ) : h.value.setScalar(0);
  }
  updateOverlay() {
    let e = !1;
    const { uniforms: t, defines: r, overlay: i } = this, a = r.has("HAS_OVERLAY"), o = i != null;
    return o !== a && (o ? r.set("HAS_OVERLAY", "1") : (r.delete("HAS_OVERLAY"), t.get("overlayBuffer").value = null), e = !0), o && (t.get("overlayBuffer").value = i.map), e;
  }
  updateShadow() {
    let e = !1;
    const { uniforms: t, defines: r, shadow: i } = this, a = r.has("HAS_SHADOW"), o = i != null;
    if (o !== a && (o ? r.set("HAS_SHADOW", "1") : (r.delete("HAS_SHADOW"), t.get("shadowBuffer").value = null), e = !0), o) {
      const c = r.get("SHADOW_CASCADE_COUNT"), s = `${i.cascadeCount}`;
      c !== s && (r.set("SHADOW_CASCADE_COUNT", i.cascadeCount.toFixed(0)), e = !0), t.get("shadowBuffer").value = i.map, t.get("shadowMapSize").value = i.mapSize, t.get("shadowIntervals").value = i.intervals, t.get("shadowMatrices").value = i.matrices, t.get("inverseShadowMatrices").value = i.inverseMatrices, t.get("shadowFar").value = i.far, t.get("shadowTopHeight").value = i.topHeight;
    }
    return e;
  }
  updateShadowLength() {
    let e = !1;
    const { uniforms: t, defines: r, shadowLength: i } = this, a = r.has("HAS_SHADOW_LENGTH"), o = i != null;
    return o !== a && (o ? r.set("HAS_SHADOW_LENGTH", "1") : (r.delete("HAS_SHADOW_LENGTH"), t.get("shadowLengthBuffer").value = null), e = !0), o && (t.get("shadowLengthBuffer").value = i.map), e;
  }
  updateLightingMask() {
    let e = !1;
    const { uniforms: t, defines: r, lightingMask: i } = this, a = r.has("HAS_LIGHTING_MASK"), o = i != null;
    if (o !== a && (o ? r.set("HAS_LIGHTING_MASK", "1") : (r.delete("HAS_LIGHTING_MASK"), t.get("lightingMaskBuffer").value = null), e = !0), o) {
      t.get("lightingMaskBuffer").value = i.map;
      const c = r.get("LIGHTING_MASK_CHANNEL"), s = i.channel;
      s !== c && (/^[rgba]$/.test(s) ? (r.set("LIGHTING_MASK_CHANNEL", s), e = !0) : console.error(`Expression validation failed: ${s}`));
    }
    return e;
  }
  update(e, t, r) {
    this.copyCameraSettings(this.camera);
    let i = !1;
    i ||= this.updateOverlay(), i ||= this.updateShadow(), i ||= this.updateShadowLength(), i ||= this.updateLightingMask(), i && this.setChanged(), ++this.uniforms.get("frame").value;
  }
  get normalBuffer() {
    return this.uniforms.get("normalBuffer").value;
  }
  set normalBuffer(e) {
    this.uniforms.get("normalBuffer").value = e, this.hasNormals = e != null;
  }
  get irradianceTexture() {
    return this.uniforms.get("irradiance_texture").value;
  }
  set irradianceTexture(e) {
    this.uniforms.get("irradiance_texture").value = e;
  }
  get scatteringTexture() {
    return this.uniforms.get("scattering_texture").value;
  }
  set scatteringTexture(e) {
    this.uniforms.get("scattering_texture").value = e;
  }
  get transmittanceTexture() {
    return this.uniforms.get("transmittance_texture").value;
  }
  set transmittanceTexture(e) {
    this.uniforms.get("transmittance_texture").value = e;
  }
  get singleMieScatteringTexture() {
    return this.uniforms.get("single_mie_scattering_texture").value;
  }
  set singleMieScatteringTexture(e) {
    this.uniforms.get("single_mie_scattering_texture").value = e, this.combinedScatteringTextures = e == null;
  }
  get higherOrderScatteringTexture() {
    return this.uniforms.get("higher_order_scattering_texture").value;
  }
  set higherOrderScatteringTexture(e) {
    this.uniforms.get("higher_order_scattering_texture").value = e, this.hasHigherOrderScatteringTexture = e != null;
  }
  get ellipsoid() {
    return this._ellipsoid;
  }
  set ellipsoid(e) {
    this._ellipsoid = e, this.uniforms.get("ellipsoidRadii").value.copy(e.radii);
  }
  get worldToECEFMatrix() {
    return this.uniforms.get("worldToECEFMatrix").value;
  }
  get sunDirection() {
    return this.uniforms.get("sunDirection").value;
  }
  get sunAngularRadius() {
    return this.uniforms.get("ATMOSPHERE").value.sun_angular_radius;
  }
  set sunAngularRadius(e) {
    this.uniforms.get("ATMOSPHERE").value.sun_angular_radius = e, this.uniforms.get("cosSunAngularRadius").value = Math.cos(e);
  }
  get albedoScale() {
    return this.uniforms.get("albedoScale").value;
  }
  set albedoScale(e) {
    this.uniforms.get("albedoScale").value = e;
  }
  get moonDirection() {
    return this.uniforms.get("moonDirection").value;
  }
  get moonAngularRadius() {
    return this.uniforms.get("moonAngularRadius").value;
  }
  set moonAngularRadius(e) {
    this.uniforms.get("moonAngularRadius").value = e;
  }
  get lunarRadianceScale() {
    return this.uniforms.get("lunarRadianceScale").value;
  }
  set lunarRadianceScale(e) {
    this.uniforms.get("lunarRadianceScale").value = e;
  }
  get stbnTexture() {
    return this.uniforms.get("stbnTexture").value;
  }
  set stbnTexture(e) {
    this.uniforms.get("stbnTexture").value = e;
  }
  get shadowRadius() {
    return this.uniforms.get("shadowRadius").value;
  }
  set shadowRadius(e) {
    this.uniforms.get("shadowRadius").value = e;
  }
}
L([
  w("OCT_ENCODED_NORMAL")
], H.prototype, "octEncodedNormal");
L([
  w("RECONSTRUCT_NORMAL")
], H.prototype, "reconstructNormal");
L([
  w("HAS_NORMALS")
], H.prototype, "hasNormals");
L([
  w("COMBINED_SCATTERING_TEXTURES")
], H.prototype, "combinedScatteringTextures");
L([
  w("HAS_HIGHER_ORDER_SCATTERING_TEXTURE")
], H.prototype, "hasHigherOrderScatteringTexture");
L([
  w("CORRECT_GEOMETRIC_ERROR")
], H.prototype, "correctGeometricError");
L([
  w("SUN_LIGHT")
], H.prototype, "sunLight");
L([
  w("SKY_LIGHT")
], H.prototype, "skyLight");
L([
  w("TRANSMITTANCE")
], H.prototype, "transmittance");
L([
  w("INSCATTER")
], H.prototype, "inscatter");
L([
  w("SKY")
], H.prototype, "sky");
L([
  w("SUN")
], H.prototype, "sun");
L([
  w("MOON")
], H.prototype, "moon");
L([
  w("GROUND")
], H.prototype, "ground");
L([
  yn("SHADOW_SAMPLE_COUNT", { min: 1, max: 16 })
], H.prototype, "shadowSampleCount");
var $n = Object.defineProperty, Dt = (n, e, t, r) => {
  for (var i = void 0, a = n.length - 1, o; a >= 0; a--)
    (o = n[a]) && (i = o(e, t, i) || i);
  return i && $n(e, t, i), i;
};
const qn = /* @__PURE__ */ new p();
function Zn(n, e) {
  let t = "", r = "";
  for (let i = 1; i < e; ++i)
    t += `layout(location = ${i}) out float renderTarget${i};
`, r += `renderTarget${i} = 0.0;
`;
  return n.replace("#include <mrt_layout>", t).replace("#include <mrt_output>", r);
}
const Be = {
  ellipsoid: F0.WGS84,
  correctAltitude: !0,
  renderTargetCount: 1
};
class se extends vt {
  constructor(e, t = n0.DEFAULT) {
    const {
      irradianceTexture: r = null,
      scatteringTexture: i = null,
      transmittanceTexture: a = null,
      singleMieScatteringTexture: o = null,
      higherOrderScatteringTexture: c = null,
      ellipsoid: s,
      correctAltitude: l,
      sunDirection: h,
      sunAngularRadius: m,
      renderTargetCount: f,
      ...v
    } = { ...Be, ...e };
    super({
      toneMapped: !1,
      depthWrite: !1,
      depthTest: !1,
      ...v,
      // prettier-ignore
      uniforms: {
        cameraPosition: new d(new p()),
        worldToECEFMatrix: new d(new D()),
        altitudeCorrection: new d(new p()),
        sunDirection: new d(h?.clone() ?? new p()),
        cosSunAngularRadius: new d(t.sunAngularRadius),
        // Uniforms for atmosphere functions
        ATMOSPHERE: t.toUniform(),
        SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: new d(t.sunRadianceToRelativeLuminance),
        SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: new d(t.skyRadianceToRelativeLuminance),
        irradiance_texture: new d(r),
        scattering_texture: new d(i),
        transmittance_texture: new d(a),
        single_mie_scattering_texture: new d(null),
        higher_order_scattering_texture: new d(null),
        ...v.uniforms
      },
      defines: {
        PI: `${Math.PI}`,
        TRANSMITTANCE_TEXTURE_WIDTH: h0.toFixed(0),
        TRANSMITTANCE_TEXTURE_HEIGHT: m0.toFixed(0),
        SCATTERING_TEXTURE_R_SIZE: Ue.toFixed(0),
        SCATTERING_TEXTURE_MU_SIZE: Ge.toFixed(0),
        SCATTERING_TEXTURE_MU_S_SIZE: Fe.toFixed(0),
        SCATTERING_TEXTURE_NU_SIZE: ze.toFixed(0),
        IRRADIANCE_TEXTURE_WIDTH: f0.toFixed(0),
        IRRADIANCE_TEXTURE_HEIGHT: g0.toFixed(0),
        METER_TO_LENGTH_UNIT: ee.toFixed(7),
        ...v.defines
      }
    }), this.atmosphere = t, this.combinedScatteringTextures = !1, this.hasHigherOrderScatteringTexture = !1, this.singleMieScatteringTexture = o, this.higherOrderScatteringTexture = c, this.ellipsoid = s, this.correctAltitude = l, m != null && (this.sunAngularRadius = m), this.renderTargetCount = f;
  }
  copyCameraSettings(e) {
    const t = this.uniforms, r = e.getWorldPosition(
      t.cameraPosition.value
    ), i = qn.copy(r).applyMatrix4(t.worldToECEFMatrix.value), a = t.altitudeCorrection.value;
    this.correctAltitude ? ke(
      i,
      this.atmosphere.bottomRadius,
      this.ellipsoid,
      a
    ) : a.setScalar(0);
  }
  onBeforeCompile(e, t) {
    e.fragmentShader = Zn(
      e.fragmentShader,
      this.renderTargetCount
    );
  }
  onBeforeRender(e, t, r, i, a, o) {
    this.copyCameraSettings(r);
  }
  get irradianceTexture() {
    return this.uniforms.irradiance_texture.value;
  }
  set irradianceTexture(e) {
    this.uniforms.irradiance_texture.value = e;
  }
  get scatteringTexture() {
    return this.uniforms.scattering_texture.value;
  }
  set scatteringTexture(e) {
    this.uniforms.scattering_texture.value = e;
  }
  get transmittanceTexture() {
    return this.uniforms.transmittance_texture.value;
  }
  set transmittanceTexture(e) {
    this.uniforms.transmittance_texture.value = e;
  }
  get singleMieScatteringTexture() {
    return this.uniforms.single_mie_scattering_texture.value;
  }
  set singleMieScatteringTexture(e) {
    this.uniforms.single_mie_scattering_texture.value = e, this.combinedScatteringTextures = e == null;
  }
  get higherOrderScatteringTexture() {
    return this.uniforms.higher_order_scattering_texture.value;
  }
  set higherOrderScatteringTexture(e) {
    this.uniforms.higher_order_scattering_texture.value = e, this.hasHigherOrderScatteringTexture = e != null;
  }
  get worldToECEFMatrix() {
    return this.uniforms.worldToECEFMatrix.value;
  }
  get sunDirection() {
    return this.uniforms.sunDirection.value;
  }
  get sunAngularRadius() {
    return this.uniforms.ATMOSPHERE.value.sun_angular_radius;
  }
  set sunAngularRadius(e) {
    this.uniforms.ATMOSPHERE.value.sun_angular_radius = e, this.uniforms.cosSunAngularRadius.value = Math.cos(e);
  }
  /** @package */
  get renderTargetCount() {
    return this._renderTargetCount;
  }
  /** @package */
  set renderTargetCount(e) {
    e !== this.renderTargetCount && (this._renderTargetCount = e, this.needsUpdate = !0);
  }
}
Dt([
  w("COMBINED_SCATTERING_TEXTURES")
], se.prototype, "combinedScatteringTextures");
Dt([
  w("HAS_HIGHER_ORDER_SCATTERING_TEXTURE")
], se.prototype, "hasHigherOrderScatteringTexture");
/**
    @preserve

    Astronomy library for JavaScript (browser and Node.js).
    https://github.com/cosinekitty/astronomy

    MIT License

    Copyright (c) 2019-2023 Don Cross <cosinekitty@gmail.com>

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/
/**
 * @fileoverview Astronomy calculation library for browser scripting and Node.js.
 * @author Don Cross <cosinekitty@gmail.com>
 * @license MIT
 */
const Jn = 173.1446326846693, It = 14959787069098932e-8, g = 0.017453292519943295, at = 57.29577951308232, Qn = 365.24217, ot = /* @__PURE__ */ new Date("2000-01-01T12:00:00Z"), X = 2 * Math.PI, e0 = 3600 * (180 / Math.PI), x0 = 484813681109536e-20, er = 10800 * 60, tr = 2 * er, nr = 6378.1366, rr = nr / It, ir = 81.30056, We = 2959122082855911e-19, xe = 2825345909524226e-22, Me = 8459715185680659e-23, Ae = 1292024916781969e-23, we = 1524358900784276e-23;
function l0(n) {
  if (!Number.isFinite(n))
    throw console.trace(), `Value is not a finite number: ${n}`;
  return n;
}
function E0(n) {
  return n - Math.floor(n);
}
var S;
(function(n) {
  n.Sun = "Sun", n.Moon = "Moon", n.Mercury = "Mercury", n.Venus = "Venus", n.Earth = "Earth", n.Mars = "Mars", n.Jupiter = "Jupiter", n.Saturn = "Saturn", n.Uranus = "Uranus", n.Neptune = "Neptune", n.Pluto = "Pluto", n.SSB = "SSB", n.EMB = "EMB", n.Star1 = "Star1", n.Star2 = "Star2", n.Star3 = "Star3", n.Star4 = "Star4", n.Star5 = "Star5", n.Star6 = "Star6", n.Star7 = "Star7", n.Star8 = "Star8";
})(S || (S = {}));
const ar = [
  S.Star1,
  S.Star2,
  S.Star3,
  S.Star4,
  S.Star5,
  S.Star6,
  S.Star7,
  S.Star8
], or = [
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 },
  { ra: 0, dec: 0, dist: 0 }
];
function sr(n) {
  const e = ar.indexOf(n);
  return e >= 0 ? or[e] : null;
}
function Pt(n) {
  const e = sr(n);
  return e && e.dist > 0 ? e : null;
}
var V;
(function(n) {
  n[n.From2000 = 0] = "From2000", n[n.Into2000 = 1] = "Into2000";
})(V || (V = {}));
const M0 = {
  Mercury: [
    [
      [
        [4.40250710144, 0, 0],
        [0.40989414977, 1.48302034195, 26087.9031415742],
        [0.050462942, 4.47785489551, 52175.8062831484],
        [0.00855346844, 1.16520322459, 78263.70942472259],
        [0.00165590362, 4.11969163423, 104351.61256629678],
        [34561897e-11, 0.77930768443, 130439.51570787099],
        [7583476e-11, 3.71348404924, 156527.41884944518]
      ],
      [
        [26087.90313685529, 0, 0],
        [0.01131199811, 6.21874197797, 26087.9031415742],
        [0.00292242298, 3.04449355541, 52175.8062831484],
        [75775081e-11, 6.08568821653, 78263.70942472259],
        [19676525e-11, 2.80965111777, 104351.61256629678]
      ]
    ],
    [
      [
        [0.11737528961, 1.98357498767, 26087.9031415742],
        [0.02388076996, 5.03738959686, 52175.8062831484],
        [0.01222839532, 3.14159265359, 0],
        [0.0054325181, 1.79644363964, 78263.70942472259],
        [0.0012977877, 4.83232503958, 104351.61256629678],
        [31866927e-11, 1.58088495658, 130439.51570787099],
        [7963301e-11, 4.60972126127, 156527.41884944518]
      ],
      [
        [0.00274646065, 3.95008450011, 26087.9031415742],
        [99737713e-11, 3.14159265359, 0]
      ]
    ],
    [
      [
        [0.39528271651, 0, 0],
        [0.07834131818, 6.19233722598, 26087.9031415742],
        [0.00795525558, 2.95989690104, 52175.8062831484],
        [0.00121281764, 6.01064153797, 78263.70942472259],
        [21921969e-11, 2.77820093972, 104351.61256629678],
        [4354065e-11, 5.82894543774, 130439.51570787099]
      ],
      [
        [0.0021734774, 4.65617158665, 26087.9031415742],
        [44141826e-11, 1.42385544001, 52175.8062831484]
      ]
    ]
  ],
  Venus: [
    [
      [
        [3.17614666774, 0, 0],
        [0.01353968419, 5.59313319619, 10213.285546211],
        [89891645e-11, 5.30650047764, 20426.571092422],
        [5477194e-11, 4.41630661466, 7860.4193924392],
        [3455741e-11, 2.6996444782, 11790.6290886588],
        [2372061e-11, 2.99377542079, 3930.2096962196],
        [1317168e-11, 5.18668228402, 26.2983197998],
        [1664146e-11, 4.25018630147, 1577.3435424478],
        [1438387e-11, 4.15745084182, 9683.5945811164],
        [1200521e-11, 6.15357116043, 30639.856638633]
      ],
      [
        [10213.28554621638, 0, 0],
        [95617813e-11, 2.4640651111, 10213.285546211],
        [7787201e-11, 0.6247848222, 20426.571092422]
      ]
    ],
    [
      [
        [0.05923638472, 0.26702775812, 10213.285546211],
        [40107978e-11, 1.14737178112, 20426.571092422],
        [32814918e-11, 3.14159265359, 0]
      ],
      [
        [0.00287821243, 1.88964962838, 10213.285546211]
      ]
    ],
    [
      [
        [0.72334820891, 0, 0],
        [0.00489824182, 4.02151831717, 10213.285546211],
        [1658058e-11, 4.90206728031, 20426.571092422],
        [1378043e-11, 1.12846591367, 11790.6290886588],
        [1632096e-11, 2.84548795207, 7860.4193924392],
        [498395e-11, 2.58682193892, 9683.5945811164],
        [221985e-11, 2.01346696541, 19367.1891622328],
        [237454e-11, 2.55136053886, 15720.8387848784]
      ],
      [
        [34551041e-11, 0.89198706276, 10213.285546211]
      ]
    ]
  ],
  Earth: [
    [
      [
        [1.75347045673, 0, 0],
        [0.03341656453, 4.66925680415, 6283.0758499914],
        [34894275e-11, 4.62610242189, 12566.1516999828],
        [3417572e-11, 2.82886579754, 3.523118349],
        [3497056e-11, 2.74411783405, 5753.3848848968],
        [3135899e-11, 3.62767041756, 77713.7714681205],
        [2676218e-11, 4.41808345438, 7860.4193924392],
        [2342691e-11, 6.13516214446, 3930.2096962196],
        [1273165e-11, 2.03709657878, 529.6909650946],
        [1324294e-11, 0.74246341673, 11506.7697697936],
        [901854e-11, 2.04505446477, 26.2983197998],
        [1199167e-11, 1.10962946234, 1577.3435424478],
        [857223e-11, 3.50849152283, 398.1490034082],
        [779786e-11, 1.17882681962, 5223.6939198022],
        [99025e-10, 5.23268072088, 5884.9268465832],
        [753141e-11, 2.53339052847, 5507.5532386674],
        [505267e-11, 4.58292599973, 18849.2275499742],
        [492392e-11, 4.20505711826, 775.522611324],
        [356672e-11, 2.91954114478, 0.0673103028],
        [284125e-11, 1.89869240932, 796.2980068164],
        [242879e-11, 0.34481445893, 5486.777843175],
        [317087e-11, 5.84901948512, 11790.6290886588],
        [271112e-11, 0.31486255375, 10977.078804699],
        [206217e-11, 4.80646631478, 2544.3144198834],
        [205478e-11, 1.86953770281, 5573.1428014331],
        [202318e-11, 2.45767790232, 6069.7767545534],
        [126225e-11, 1.08295459501, 20.7753954924],
        [155516e-11, 0.83306084617, 213.299095438]
      ],
      [
        [6283.0758499914, 0, 0],
        [0.00206058863, 2.67823455808, 6283.0758499914],
        [4303419e-11, 2.63512233481, 12566.1516999828]
      ],
      [
        [8721859e-11, 1.07253635559, 6283.0758499914]
      ]
    ],
    [
      [],
      [
        [0.00227777722, 3.4137662053, 6283.0758499914],
        [3805678e-11, 3.37063423795, 12566.1516999828]
      ]
    ],
    [
      [
        [1.00013988784, 0, 0],
        [0.01670699632, 3.09846350258, 6283.0758499914],
        [13956024e-11, 3.05524609456, 12566.1516999828],
        [308372e-10, 5.19846674381, 77713.7714681205],
        [1628463e-11, 1.17387558054, 5753.3848848968],
        [1575572e-11, 2.84685214877, 7860.4193924392],
        [924799e-11, 5.45292236722, 11506.7697697936],
        [542439e-11, 4.56409151453, 3930.2096962196],
        [47211e-10, 3.66100022149, 5884.9268465832],
        [85831e-11, 1.27079125277, 161000.6857376741],
        [57056e-11, 2.01374292245, 83996.84731811189],
        [55736e-11, 5.2415979917, 71430.69561812909],
        [174844e-11, 3.01193636733, 18849.2275499742],
        [243181e-11, 4.2734953079, 11790.6290886588]
      ],
      [
        [0.00103018607, 1.10748968172, 6283.0758499914],
        [1721238e-11, 1.06442300386, 12566.1516999828]
      ],
      [
        [4359385e-11, 5.78455133808, 6283.0758499914]
      ]
    ]
  ],
  Mars: [
    [
      [
        [6.20347711581, 0, 0],
        [0.18656368093, 5.0503710027, 3340.6124266998],
        [0.01108216816, 5.40099836344, 6681.2248533996],
        [91798406e-11, 5.75478744667, 10021.8372800994],
        [27744987e-11, 5.97049513147, 3.523118349],
        [10610235e-11, 2.93958560338, 2281.2304965106],
        [12315897e-11, 0.84956094002, 2810.9214616052],
        [8926784e-11, 4.15697846427, 0.0172536522],
        [8715691e-11, 6.11005153139, 13362.4497067992],
        [6797556e-11, 0.36462229657, 398.1490034082],
        [7774872e-11, 3.33968761376, 5621.8429232104],
        [3575078e-11, 1.6618650571, 2544.3144198834],
        [4161108e-11, 0.22814971327, 2942.4634232916],
        [3075252e-11, 0.85696614132, 191.4482661116],
        [2628117e-11, 0.64806124465, 3337.0893083508],
        [2937546e-11, 6.07893711402, 0.0673103028],
        [2389414e-11, 5.03896442664, 796.2980068164],
        [2579844e-11, 0.02996736156, 3344.1355450488],
        [1528141e-11, 1.14979301996, 6151.533888305],
        [1798806e-11, 0.65634057445, 529.6909650946],
        [1264357e-11, 3.62275122593, 5092.1519581158],
        [1286228e-11, 3.06796065034, 2146.1654164752],
        [1546404e-11, 2.91579701718, 1751.539531416],
        [1024902e-11, 3.69334099279, 8962.4553499102],
        [891566e-11, 0.18293837498, 16703.062133499],
        [858759e-11, 2.4009381194, 2914.0142358238],
        [832715e-11, 2.46418619474, 3340.5951730476],
        [83272e-10, 4.49495782139, 3340.629680352],
        [712902e-11, 3.66335473479, 1059.3819301892],
        [748723e-11, 3.82248614017, 155.4203994342],
        [723861e-11, 0.67497311481, 3738.761430108],
        [635548e-11, 2.92182225127, 8432.7643848156],
        [655162e-11, 0.48864064125, 3127.3133312618],
        [550474e-11, 3.81001042328, 0.9803210682],
        [55275e-10, 4.47479317037, 1748.016413067],
        [425966e-11, 0.55364317304, 6283.0758499914],
        [415131e-11, 0.49662285038, 213.299095438],
        [472167e-11, 3.62547124025, 1194.4470102246],
        [306551e-11, 0.38052848348, 6684.7479717486],
        [312141e-11, 0.99853944405, 6677.7017350506],
        [293198e-11, 4.22131299634, 20.7753954924],
        [302375e-11, 4.48618007156, 3532.0606928114],
        [274027e-11, 0.54222167059, 3340.545116397],
        [281079e-11, 5.88163521788, 1349.8674096588],
        [231183e-11, 1.28242156993, 3870.3033917944],
        [283602e-11, 5.7688543494, 3149.1641605882],
        [236117e-11, 5.75503217933, 3333.498879699],
        [274033e-11, 0.13372524985, 3340.6797370026],
        [299395e-11, 2.78323740866, 6254.6266625236]
      ],
      [
        [3340.61242700512, 0, 0],
        [0.01457554523, 3.60433733236, 3340.6124266998],
        [0.00168414711, 3.92318567804, 6681.2248533996],
        [20622975e-11, 4.26108844583, 10021.8372800994],
        [3452392e-11, 4.7321039319, 3.523118349],
        [2586332e-11, 4.60670058555, 13362.4497067992],
        [841535e-11, 4.45864030426, 2281.2304965106]
      ],
      [
        [58152577e-11, 2.04961712429, 3340.6124266998],
        [13459579e-11, 2.45738706163, 6681.2248533996]
      ]
    ],
    [
      [
        [0.03197134986, 3.76832042431, 3340.6124266998],
        [0.00298033234, 4.10616996305, 6681.2248533996],
        [0.00289104742, 0, 0],
        [31365539e-11, 4.4465105309, 10021.8372800994],
        [34841e-9, 4.7881254926, 13362.4497067992]
      ],
      [
        [0.00217310991, 6.04472194776, 3340.6124266998],
        [20976948e-11, 3.14159265359, 0],
        [12834709e-11, 1.60810667915, 6681.2248533996]
      ]
    ],
    [
      [
        [1.53033488271, 0, 0],
        [0.1418495316, 3.47971283528, 3340.6124266998],
        [0.00660776362, 3.81783443019, 6681.2248533996],
        [46179117e-11, 4.15595316782, 10021.8372800994],
        [8109733e-11, 5.55958416318, 2810.9214616052],
        [7485318e-11, 1.77239078402, 5621.8429232104],
        [5523191e-11, 1.3643630377, 2281.2304965106],
        [382516e-10, 4.49407183687, 13362.4497067992],
        [2306537e-11, 0.09081579001, 2544.3144198834],
        [1999396e-11, 5.36059617709, 3337.0893083508],
        [2484394e-11, 4.9254563992, 2942.4634232916],
        [1960195e-11, 4.74249437639, 3344.1355450488],
        [1167119e-11, 2.11260868341, 5092.1519581158],
        [1102816e-11, 5.00908403998, 398.1490034082],
        [899066e-11, 4.40791133207, 529.6909650946],
        [992252e-11, 5.83861961952, 6151.533888305],
        [807354e-11, 2.10217065501, 1059.3819301892],
        [797915e-11, 3.44839203899, 796.2980068164],
        [740975e-11, 1.49906336885, 2146.1654164752]
      ],
      [
        [0.01107433345, 2.03250524857, 3340.6124266998],
        [0.00103175887, 2.37071847807, 6681.2248533996],
        [128772e-9, 0, 0],
        [1081588e-10, 2.70888095665, 10021.8372800994]
      ],
      [
        [44242249e-11, 0.47930604954, 3340.6124266998],
        [8138042e-11, 0.86998389204, 6681.2248533996]
      ]
    ]
  ],
  Jupiter: [
    [
      [
        [0.59954691494, 0, 0],
        [0.09695898719, 5.06191793158, 529.6909650946],
        [0.00573610142, 1.44406205629, 7.1135470008],
        [0.00306389205, 5.41734730184, 1059.3819301892],
        [97178296e-11, 4.14264726552, 632.7837393132],
        [72903078e-11, 3.64042916389, 522.5774180938],
        [64263975e-11, 3.41145165351, 103.0927742186],
        [39806064e-11, 2.29376740788, 419.4846438752],
        [38857767e-11, 1.27231755835, 316.3918696566],
        [27964629e-11, 1.7845459182, 536.8045120954],
        [1358973e-10, 5.7748104079, 1589.0728952838],
        [8246349e-11, 3.5822792584, 206.1855484372],
        [8768704e-11, 3.63000308199, 949.1756089698],
        [7368042e-11, 5.0810119427, 735.8765135318],
        [626315e-10, 0.02497628807, 213.299095438],
        [6114062e-11, 4.51319998626, 1162.4747044078],
        [4905396e-11, 1.32084470588, 110.2063212194],
        [5305285e-11, 1.30671216791, 14.2270940016],
        [5305441e-11, 4.18625634012, 1052.2683831884],
        [4647248e-11, 4.69958103684, 3.9321532631],
        [3045023e-11, 4.31676431084, 426.598190876],
        [2609999e-11, 1.56667394063, 846.0828347512],
        [2028191e-11, 1.06376530715, 3.1813937377],
        [1764763e-11, 2.14148655117, 1066.49547719],
        [1722972e-11, 3.88036268267, 1265.5674786264],
        [1920945e-11, 0.97168196472, 639.897286314],
        [1633223e-11, 3.58201833555, 515.463871093],
        [1431999e-11, 4.29685556046, 625.6701923124],
        [973272e-11, 4.09764549134, 95.9792272178]
      ],
      [
        [529.69096508814, 0, 0],
        [0.00489503243, 4.2208293947, 529.6909650946],
        [0.00228917222, 6.02646855621, 7.1135470008],
        [30099479e-11, 4.54540782858, 1059.3819301892],
        [2072092e-10, 5.45943156902, 522.5774180938],
        [12103653e-11, 0.16994816098, 536.8045120954],
        [6067987e-11, 4.42422292017, 103.0927742186],
        [5433968e-11, 3.98480737746, 419.4846438752],
        [4237744e-11, 5.89008707199, 14.2270940016]
      ],
      [
        [47233601e-11, 4.32148536482, 7.1135470008],
        [30649436e-11, 2.929777887, 529.6909650946],
        [14837605e-11, 3.14159265359, 0]
      ]
    ],
    [
      [
        [0.02268615702, 3.55852606721, 529.6909650946],
        [0.00109971634, 3.90809347197, 1059.3819301892],
        [0.00110090358, 0, 0],
        [8101428e-11, 3.60509572885, 522.5774180938],
        [6043996e-11, 4.25883108339, 1589.0728952838],
        [6437782e-11, 0.30627119215, 536.8045120954]
      ],
      [
        [78203446e-11, 1.52377859742, 529.6909650946]
      ]
    ],
    [
      [
        [5.20887429326, 0, 0],
        [0.25209327119, 3.49108639871, 529.6909650946],
        [0.00610599976, 3.84115365948, 1059.3819301892],
        [0.00282029458, 2.57419881293, 632.7837393132],
        [0.00187647346, 2.07590383214, 522.5774180938],
        [86792905e-11, 0.71001145545, 419.4846438752],
        [72062974e-11, 0.21465724607, 536.8045120954],
        [65517248e-11, 5.9799588479, 316.3918696566],
        [29134542e-11, 1.67759379655, 103.0927742186],
        [30135335e-11, 2.16132003734, 949.1756089698],
        [23453271e-11, 3.54023522184, 735.8765135318],
        [22283743e-11, 4.19362594399, 1589.0728952838],
        [23947298e-11, 0.2745803748, 7.1135470008],
        [13032614e-11, 2.96042965363, 1162.4747044078],
        [970336e-10, 1.90669633585, 206.1855484372],
        [12749023e-11, 2.71550286592, 1052.2683831884],
        [7057931e-11, 2.18184839926, 1265.5674786264],
        [6137703e-11, 6.26418240033, 846.0828347512],
        [2616976e-11, 2.00994012876, 1581.959348283]
      ],
      [
        [0.0127180152, 2.64937512894, 529.6909650946],
        [61661816e-11, 3.00076460387, 1059.3819301892],
        [53443713e-11, 3.89717383175, 522.5774180938],
        [31185171e-11, 4.88276958012, 536.8045120954],
        [41390269e-11, 0, 0]
      ]
    ]
  ],
  Saturn: [
    [
      [
        [0.87401354025, 0, 0],
        [0.11107659762, 3.96205090159, 213.299095438],
        [0.01414150957, 4.58581516874, 7.1135470008],
        [0.00398379389, 0.52112032699, 206.1855484372],
        [0.00350769243, 3.30329907896, 426.598190876],
        [0.00206816305, 0.24658372002, 103.0927742186],
        [792713e-9, 3.84007056878, 220.4126424388],
        [23990355e-11, 4.66976924553, 110.2063212194],
        [16573588e-11, 0.43719228296, 419.4846438752],
        [14906995e-11, 5.76903183869, 316.3918696566],
        [1582029e-10, 0.93809155235, 632.7837393132],
        [14609559e-11, 1.56518472, 3.9321532631],
        [13160301e-11, 4.44891291899, 14.2270940016],
        [15053543e-11, 2.71669915667, 639.897286314],
        [13005299e-11, 5.98119023644, 11.0457002639],
        [10725067e-11, 3.12939523827, 202.2533951741],
        [5863206e-11, 0.23656938524, 529.6909650946],
        [5227757e-11, 4.20783365759, 3.1813937377],
        [6126317e-11, 1.76328667907, 277.0349937414],
        [5019687e-11, 3.17787728405, 433.7117378768],
        [459255e-10, 0.61977744975, 199.0720014364],
        [4005867e-11, 2.24479718502, 63.7358983034],
        [2953796e-11, 0.98280366998, 95.9792272178],
        [387367e-10, 3.22283226966, 138.5174968707],
        [2461186e-11, 2.03163875071, 735.8765135318],
        [3269484e-11, 0.77492638211, 949.1756089698],
        [1758145e-11, 3.2658010994, 522.5774180938],
        [1640172e-11, 5.5050445305, 846.0828347512],
        [1391327e-11, 4.02333150505, 323.5054166574],
        [1580648e-11, 4.37265307169, 309.2783226558],
        [1123498e-11, 2.83726798446, 415.5524906121],
        [1017275e-11, 3.71700135395, 227.5261894396],
        [848642e-11, 3.1915017083, 209.3669421749]
      ],
      [
        [213.2990952169, 0, 0],
        [0.01297370862, 1.82834923978, 213.299095438],
        [0.00564345393, 2.88499717272, 7.1135470008],
        [93734369e-11, 1.06311793502, 426.598190876],
        [0.00107674962, 2.27769131009, 206.1855484372],
        [40244455e-11, 2.04108104671, 220.4126424388],
        [19941774e-11, 1.2795439047, 103.0927742186],
        [10511678e-11, 2.7488034213, 14.2270940016],
        [6416106e-11, 0.38238295041, 639.897286314],
        [4848994e-11, 2.43037610229, 419.4846438752],
        [4056892e-11, 2.92133209468, 110.2063212194],
        [3768635e-11, 3.6496533078, 3.9321532631]
      ],
      [
        [0.0011644133, 1.17988132879, 7.1135470008],
        [91841837e-11, 0.0732519584, 213.299095438],
        [36661728e-11, 0, 0],
        [15274496e-11, 4.06493179167, 206.1855484372]
      ]
    ],
    [
      [
        [0.04330678039, 3.60284428399, 213.299095438],
        [0.00240348302, 2.85238489373, 426.598190876],
        [84745939e-11, 0, 0],
        [30863357e-11, 3.48441504555, 220.4126424388],
        [34116062e-11, 0.57297307557, 206.1855484372],
        [1473407e-10, 2.11846596715, 639.897286314],
        [9916667e-11, 5.79003188904, 419.4846438752],
        [6993564e-11, 4.7360468972, 7.1135470008],
        [4807588e-11, 5.43305312061, 316.3918696566]
      ],
      [
        [0.00198927992, 4.93901017903, 213.299095438],
        [36947916e-11, 3.14159265359, 0],
        [17966989e-11, 0.5197943111, 426.598190876]
      ]
    ],
    [
      [
        [9.55758135486, 0, 0],
        [0.52921382865, 2.39226219573, 213.299095438],
        [0.01873679867, 5.2354960466, 206.1855484372],
        [0.01464663929, 1.64763042902, 426.598190876],
        [0.00821891141, 5.93520042303, 316.3918696566],
        [0.00547506923, 5.0153261898, 103.0927742186],
        [0.0037168465, 2.27114821115, 220.4126424388],
        [0.00361778765, 3.13904301847, 7.1135470008],
        [0.00140617506, 5.70406606781, 632.7837393132],
        [0.00108974848, 3.29313390175, 110.2063212194],
        [69006962e-11, 5.94099540992, 419.4846438752],
        [61053367e-11, 0.94037691801, 639.897286314],
        [48913294e-11, 1.55733638681, 202.2533951741],
        [34143772e-11, 0.19519102597, 277.0349937414],
        [32401773e-11, 5.47084567016, 949.1756089698],
        [20936596e-11, 0.46349251129, 735.8765135318],
        [9796004e-11, 5.20477537945, 1265.5674786264],
        [11993338e-11, 5.98050967385, 846.0828347512],
        [208393e-9, 1.52102476129, 433.7117378768],
        [15298404e-11, 3.0594381494, 529.6909650946],
        [6465823e-11, 0.17732249942, 1052.2683831884],
        [11380257e-11, 1.7310542704, 522.5774180938],
        [3419618e-11, 4.94550542171, 1581.959348283]
      ],
      [
        [0.0618298134, 0.2584351148, 213.299095438],
        [0.00506577242, 0.71114625261, 206.1855484372],
        [0.00341394029, 5.79635741658, 426.598190876],
        [0.00188491195, 0.47215589652, 220.4126424388],
        [0.00186261486, 3.14159265359, 0],
        [0.00143891146, 1.40744822888, 7.1135470008]
      ],
      [
        [0.00436902572, 4.78671677509, 213.299095438]
      ]
    ]
  ],
  Uranus: [
    [
      [
        [5.48129294297, 0, 0],
        [0.09260408234, 0.89106421507, 74.7815985673],
        [0.01504247898, 3.6271926092, 1.4844727083],
        [0.00365981674, 1.89962179044, 73.297125859],
        [0.00272328168, 3.35823706307, 149.5631971346],
        [70328461e-11, 5.39254450063, 63.7358983034],
        [68892678e-11, 6.09292483287, 76.2660712756],
        [61998615e-11, 2.26952066061, 2.9689454166],
        [61950719e-11, 2.85098872691, 11.0457002639],
        [2646877e-10, 3.14152083966, 71.8126531507],
        [25710476e-11, 6.11379840493, 454.9093665273],
        [2107885e-10, 4.36059339067, 148.0787244263],
        [17818647e-11, 1.74436930289, 36.6485629295],
        [14613507e-11, 4.73732166022, 3.9321532631],
        [11162509e-11, 5.8268179635, 224.3447957019],
        [1099791e-10, 0.48865004018, 138.5174968707],
        [9527478e-11, 2.95516862826, 35.1640902212],
        [7545601e-11, 5.236265824, 109.9456887885],
        [4220241e-11, 3.23328220918, 70.8494453042],
        [40519e-9, 2.277550173, 151.0476698429],
        [3354596e-11, 1.0654900738, 4.4534181249],
        [2926718e-11, 4.62903718891, 9.5612275556],
        [349034e-10, 5.48306144511, 146.594251718],
        [3144069e-11, 4.75199570434, 77.7505439839],
        [2922333e-11, 5.35235361027, 85.8272988312],
        [2272788e-11, 4.36600400036, 70.3281804424],
        [2051219e-11, 1.51773566586, 0.1118745846],
        [2148602e-11, 0.60745949945, 38.1330356378],
        [1991643e-11, 4.92437588682, 277.0349937414],
        [1376226e-11, 2.04283539351, 65.2203710117],
        [1666902e-11, 3.62744066769, 380.12776796],
        [1284107e-11, 3.11347961505, 202.2533951741],
        [1150429e-11, 0.93343589092, 3.1813937377],
        [1533221e-11, 2.58594681212, 52.6901980395],
        [1281604e-11, 0.54271272721, 222.8603229936],
        [1372139e-11, 4.19641530878, 111.4301614968],
        [1221029e-11, 0.1990065003, 108.4612160802],
        [946181e-11, 1.19253165736, 127.4717966068],
        [1150989e-11, 4.17898916639, 33.6796175129]
      ],
      [
        [74.7815986091, 0, 0],
        [0.00154332863, 5.24158770553, 74.7815985673],
        [24456474e-11, 1.71260334156, 1.4844727083],
        [9258442e-11, 0.4282973235, 11.0457002639],
        [8265977e-11, 1.50218091379, 63.7358983034],
        [915016e-10, 1.41213765216, 149.5631971346]
      ]
    ],
    [
      [
        [0.01346277648, 2.61877810547, 74.7815985673],
        [623414e-9, 5.08111189648, 149.5631971346],
        [61601196e-11, 3.14159265359, 0],
        [9963722e-11, 1.61603805646, 76.2660712756],
        [992616e-10, 0.57630380333, 73.297125859]
      ],
      [
        [34101978e-11, 0.01321929936, 74.7815985673]
      ]
    ],
    [
      [
        [19.21264847206, 0, 0],
        [0.88784984413, 5.60377527014, 74.7815985673],
        [0.03440836062, 0.32836099706, 73.297125859],
        [0.0205565386, 1.7829515933, 149.5631971346],
        [0.0064932241, 4.52247285911, 76.2660712756],
        [0.00602247865, 3.86003823674, 63.7358983034],
        [0.00496404167, 1.40139935333, 454.9093665273],
        [0.00338525369, 1.58002770318, 138.5174968707],
        [0.00243509114, 1.57086606044, 71.8126531507],
        [0.00190522303, 1.99809394714, 1.4844727083],
        [0.00161858838, 2.79137786799, 148.0787244263],
        [0.00143706183, 1.38368544947, 11.0457002639],
        [93192405e-11, 0.17437220467, 36.6485629295],
        [71424548e-11, 4.24509236074, 224.3447957019],
        [89806014e-11, 3.66105364565, 109.9456887885],
        [39009723e-11, 1.66971401684, 70.8494453042],
        [46677296e-11, 1.39976401694, 35.1640902212],
        [39025624e-11, 3.36234773834, 277.0349937414],
        [36755274e-11, 3.88649278513, 146.594251718],
        [30348723e-11, 0.70100838798, 151.0476698429],
        [29156413e-11, 3.180563367, 77.7505439839],
        [22637073e-11, 0.72518687029, 529.6909650946],
        [11959076e-11, 1.7504339214, 984.6003316219],
        [25620756e-11, 5.25656086672, 380.12776796]
      ],
      [
        [0.01479896629, 3.67205697578, 74.7815985673]
      ]
    ]
  ],
  Neptune: [
    [
      [
        [5.31188633046, 0, 0],
        [0.0179847553, 2.9010127389, 38.1330356378],
        [0.01019727652, 0.48580922867, 1.4844727083],
        [0.00124531845, 4.83008090676, 36.6485629295],
        [42064466e-11, 5.41054993053, 2.9689454166],
        [37714584e-11, 6.09221808686, 35.1640902212],
        [33784738e-11, 1.24488874087, 76.2660712756],
        [16482741e-11, 7727998e-11, 491.5579294568],
        [9198584e-11, 4.93747051954, 39.6175083461],
        [899425e-10, 0.27462171806, 175.1660598002]
      ],
      [
        [38.13303563957, 0, 0],
        [16604172e-11, 4.86323329249, 1.4844727083],
        [15744045e-11, 2.27887427527, 38.1330356378]
      ]
    ],
    [
      [
        [0.03088622933, 1.44104372644, 38.1330356378],
        [27780087e-11, 5.91271884599, 76.2660712756],
        [27623609e-11, 0, 0],
        [15355489e-11, 2.52123799551, 36.6485629295],
        [15448133e-11, 3.50877079215, 39.6175083461]
      ]
    ],
    [
      [
        [30.07013205828, 0, 0],
        [0.27062259632, 1.32999459377, 38.1330356378],
        [0.01691764014, 3.25186135653, 36.6485629295],
        [0.00807830553, 5.18592878704, 1.4844727083],
        [0.0053776051, 4.52113935896, 35.1640902212],
        [0.00495725141, 1.5710564165, 491.5579294568],
        [0.00274571975, 1.84552258866, 175.1660598002],
        [1201232e-10, 1.92059384991, 1021.2488945514],
        [0.00121801746, 5.79754470298, 76.2660712756],
        [0.00100896068, 0.3770272493, 73.297125859],
        [0.00135134092, 3.37220609835, 39.6175083461],
        [7571796e-11, 1.07149207335, 388.4651552382]
      ]
    ]
  ]
};
function cr(n) {
  var e, t, r, i, a, o, c;
  const s = 2e3 + (n - 14) / Qn;
  return s < -500 ? (e = (s - 1820) / 100, -20 + 32 * e * e) : s < 500 ? (e = s / 100, t = e * e, r = e * t, i = t * t, a = t * r, o = r * r, 10583.6 - 1014.41 * e + 33.78311 * t - 5.952053 * r - 0.1798452 * i + 0.022174192 * a + 0.0090316521 * o) : s < 1600 ? (e = (s - 1e3) / 100, t = e * e, r = e * t, i = t * t, a = t * r, o = r * r, 1574.2 - 556.01 * e + 71.23472 * t + 0.319781 * r - 0.8503463 * i - 5050998e-9 * a + 0.0083572073 * o) : s < 1700 ? (e = s - 1600, t = e * e, r = e * t, 120 - 0.9808 * e - 0.01532 * t + r / 7129) : s < 1800 ? (e = s - 1700, t = e * e, r = e * t, i = t * t, 8.83 + 0.1603 * e - 59285e-7 * t + 13336e-8 * r - i / 1174e3) : s < 1860 ? (e = s - 1800, t = e * e, r = e * t, i = t * t, a = t * r, o = r * r, c = r * i, 13.72 - 0.332447 * e + 68612e-7 * t + 41116e-7 * r - 37436e-8 * i + 121272e-10 * a - 1699e-10 * o + 875e-12 * c) : s < 1900 ? (e = s - 1860, t = e * e, r = e * t, i = t * t, a = t * r, 7.62 + 0.5737 * e - 0.251754 * t + 0.01680668 * r - 4473624e-10 * i + a / 233174) : s < 1920 ? (e = s - 1900, t = e * e, r = e * t, i = t * t, -2.79 + 1.494119 * e - 0.0598939 * t + 61966e-7 * r - 197e-6 * i) : s < 1941 ? (e = s - 1920, t = e * e, r = e * t, 21.2 + 0.84493 * e - 0.0761 * t + 20936e-7 * r) : s < 1961 ? (e = s - 1950, t = e * e, r = e * t, 29.07 + 0.407 * e - t / 233 + r / 2547) : s < 1986 ? (e = s - 1975, t = e * e, r = e * t, 45.45 + 1.067 * e - t / 260 - r / 718) : s < 2005 ? (e = s - 2e3, t = e * e, r = e * t, i = t * t, a = t * r, 63.86 + 0.3345 * e - 0.060374 * t + 17275e-7 * r + 651814e-9 * i + 2373599e-11 * a) : s < 2050 ? (e = s - 2e3, 62.92 + 0.32217 * e + 5589e-6 * e * e) : s < 2150 ? (e = (s - 1820) / 100, -20 + 32 * e * e - 0.5628 * (2150 - s)) : (e = (s - 1820) / 100, -20 + 32 * e * e);
}
let ur = cr;
function st(n) {
  return n + ur(n) / 86400;
}
class t0 {
  /**
   * @param {FlexibleDateTime} date
   *      A JavaScript Date object, a numeric UTC value expressed in J2000 days, or another AstroTime object.
   */
  constructor(e) {
    if (e instanceof t0) {
      this.date = e.date, this.ut = e.ut, this.tt = e.tt;
      return;
    }
    const t = 1e3 * 3600 * 24;
    if (e instanceof Date && Number.isFinite(e.getTime())) {
      this.date = e, this.ut = (e.getTime() - ot.getTime()) / t, this.tt = st(this.ut);
      return;
    }
    if (Number.isFinite(e)) {
      this.date = new Date(ot.getTime() + e * t), this.ut = e, this.tt = st(this.ut);
      return;
    }
    throw "Argument must be a Date object, an AstroTime object, or a numeric UTC Julian date.";
  }
  /**
   * @brief Creates an `AstroTime` value from a Terrestrial Time (TT) day value.
   *
   * This function can be used in rare cases where a time must be based
   * on Terrestrial Time (TT) rather than Universal Time (UT).
   * Most developers will want to invoke `new AstroTime(ut)` with a universal time
   * instead of this function, because usually time is based on civil time adjusted
   * by leap seconds to match the Earth's rotation, rather than the uniformly
   * flowing TT used to calculate solar system dynamics. In rare cases
   * where the caller already knows TT, this function is provided to create
   * an `AstroTime` value that can be passed to Astronomy Engine functions.
   *
   * @param {number} tt
   *      The number of days since the J2000 epoch as expressed in Terrestrial Time.
   *
   * @returns {AstroTime}
   *      An `AstroTime` object for the specified terrestrial time.
   */
  static FromTerrestrialTime(e) {
    let t = new t0(e);
    for (; ; ) {
      const r = e - t.tt;
      if (Math.abs(r) < 1e-12)
        return t;
      t = t.AddDays(r);
    }
  }
  /**
   * Formats an `AstroTime` object as an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)
   * date/time string in UTC, to millisecond resolution.
   * Example: `2018-08-17T17:22:04.050Z`
   * @returns {string}
   */
  toString() {
    return this.date.toISOString();
  }
  /**
   * Returns a new `AstroTime` object adjusted by the floating point number of days.
   * Does NOT modify the original `AstroTime` object.
   *
   * @param {number} days
   *      The floating point number of days by which to adjust the given date and time.
   *      Positive values adjust the date toward the future, and
   *      negative values adjust the date toward the past.
   *
   * @returns {AstroTime}
   */
  AddDays(e) {
    return new t0(this.ut + e);
  }
}
function r0(n) {
  return n instanceof t0 ? n : new t0(n);
}
function lr(n) {
  function e(f) {
    return f % tr * x0;
  }
  const t = n.tt / 36525, r = e(128710479305e-5 + t * 1295965810481e-4), i = e(335779.526232 + t * 17395272628478e-4), a = e(107226070369e-5 + t * 1602961601209e-3), o = e(450160.398036 - t * 69628905431e-4);
  let c = Math.sin(o), s = Math.cos(o), l = (-172064161 - 174666 * t) * c + 33386 * s, h = (92052331 + 9086 * t) * s + 15377 * c, m = 2 * (i - a + o);
  return c = Math.sin(m), s = Math.cos(m), l += (-13170906 - 1675 * t) * c - 13696 * s, h += (5730336 - 3015 * t) * s - 4587 * c, m = 2 * (i + o), c = Math.sin(m), s = Math.cos(m), l += (-2276413 - 234 * t) * c + 2796 * s, h += (978459 - 485 * t) * s + 1374 * c, m = 2 * o, c = Math.sin(m), s = Math.cos(m), l += (2074554 + 207 * t) * c - 698 * s, h += (-897492 + 470 * t) * s - 291 * c, c = Math.sin(r), s = Math.cos(r), l += (1475877 - 3633 * t) * c + 11817 * s, h += (73871 - 184 * t) * s - 1924 * c, {
    dpsi: -135e-6 + l * 1e-7,
    deps: 388e-6 + h * 1e-7
  };
}
function Nt(n) {
  var e = n.tt / 36525, t = ((((-434e-10 * e - 576e-9) * e + 20034e-7) * e - 1831e-7) * e - 46.836769) * e + 84381.406;
  return t / 3600;
}
var K0;
function Ot(n) {
  if (!K0 || Math.abs(K0.tt - n.tt) > 1e-6) {
    const e = lr(n), t = Nt(n), r = t + e.deps / 3600;
    K0 = {
      tt: n.tt,
      dpsi: e.dpsi,
      deps: e.deps,
      ee: e.dpsi * Math.cos(t * g) / 15,
      mobl: t,
      tobl: r
    };
  }
  return K0;
}
function dr(n, e) {
  const t = n * g, r = Math.cos(t), i = Math.sin(t);
  return [
    e[0],
    e[1] * r - e[2] * i,
    e[1] * i + e[2] * r
  ];
}
function hr(n, e) {
  return dr(Nt(n), e);
}
function mr(n) {
  const e = n.tt / 36525;
  function t(R, _) {
    const A = [];
    let C;
    for (C = 0; C <= _ - R; ++C)
      A.push(0);
    return { min: R, array: A };
  }
  function r(R, _, A, C) {
    const P = [];
    for (let Q = 0; Q <= _ - R; ++Q)
      P.push(t(A, C));
    return { min: R, array: P };
  }
  function i(R, _, A) {
    const C = R.array[_ - R.min];
    return C.array[A - C.min];
  }
  function a(R, _, A, C) {
    const P = R.array[_ - R.min];
    P.array[A - P.min] = C;
  }
  let o, c, s, l, h, m, f, v, T, E, x, y, I, N, b, U, z, F, q, Z, i0, a0, J, N0 = r(-6, 6, 1, 4), p0 = r(-6, 6, 1, 4);
  function z0(R, _) {
    return i(N0, R, _);
  }
  function k0(R, _) {
    return i(p0, R, _);
  }
  function V0(R, _, A) {
    return a(N0, R, _, A);
  }
  function B0(R, _, A) {
    return a(p0, R, _, A);
  }
  function $e(R, _, A, C, P) {
    P(R * A - _ * C, _ * A + R * C);
  }
  function M(R) {
    return Math.sin(X * R);
  }
  f = e * e, T = 0, J = 0, x = 0, y = 3422.7;
  var W0 = M(0.19833 + 0.05611 * e), le = M(0.27869 + 0.04508 * e), de = M(0.16827 - 0.36903 * e), he = M(0.34734 - 5.37261 * e), me = M(0.10498 - 5.37899 * e), j0 = M(0.42681 - 0.41855 * e), qt = M(0.14943 - 5.37511 * e);
  for (F = 0.84 * W0 + 0.31 * le + 14.27 * de + 7.26 * he + 0.28 * me + 0.24 * j0, q = 2.94 * W0 + 0.31 * le + 14.27 * de + 9.34 * he + 1.12 * me + 0.83 * j0, Z = -6.4 * W0 - 1.89 * j0, i0 = 0.21 * W0 + 0.31 * le + 14.27 * de - 88.7 * he - 15.3 * me + 0.24 * j0 - 1.86 * qt, a0 = F - Z, v = -3332e-9 * M(0.59734 - 5.37261 * e) - 539e-9 * M(0.35498 - 5.37899 * e) - 64e-9 * M(0.39943 - 5.37511 * e), I = X * E0(0.60643382 + 1336.85522467 * e - 313e-8 * f) + F / e0, N = X * E0(0.37489701 + 1325.55240982 * e + 2565e-8 * f) + q / e0, b = X * E0(0.99312619 + 99.99735956 * e - 44e-8 * f) + Z / e0, U = X * E0(0.25909118 + 1342.2278298 * e - 892e-8 * f) + i0 / e0, z = X * E0(0.82736186 + 1236.85308708 * e - 397e-8 * f) + a0 / e0, h = 1; h <= 4; ++h) {
    switch (h) {
      case 1:
        s = N, c = 4, l = 1.000002208;
        break;
      case 2:
        s = b, c = 3, l = 0.997504612 - 2495388e-9 * e;
        break;
      case 3:
        s = U, c = 4, l = 1.000002708 + 139.978 * v;
        break;
      case 4:
        s = z, c = 6, l = 1;
        break;
      default:
        throw `Internal error: I = ${h}`;
    }
    for (V0(0, h, 1), V0(1, h, Math.cos(s) * l), B0(0, h, 0), B0(1, h, Math.sin(s) * l), m = 2; m <= c; ++m)
      $e(z0(m - 1, h), k0(m - 1, h), z0(1, h), k0(1, h), (R, _) => (V0(m, h, R), B0(m, h, _)));
    for (m = 1; m <= c; ++m)
      V0(-m, h, z0(m, h)), B0(-m, h, -k0(m, h));
  }
  function qe(R, _, A, C) {
    for (var P = { x: 1, y: 0 }, Q = [0, R, _, A, C], j = 1; j <= 4; ++j)
      Q[j] !== 0 && $e(P.x, P.y, z0(Q[j], j), k0(Q[j], j), (fe, T0) => (P.x = fe, P.y = T0));
    return P;
  }
  function u(R, _, A, C, P, Q, j, fe) {
    var T0 = qe(P, Q, j, fe);
    T += R * T0.y, J += _ * T0.y, x += A * T0.x, y += C * T0.x;
  }
  u(13.902, 14.06, -1e-3, 0.2607, 0, 0, 0, 4), u(0.403, -4.01, 0.394, 23e-4, 0, 0, 0, 3), u(2369.912, 2373.36, 0.601, 28.2333, 0, 0, 0, 2), u(-125.154, -112.79, -0.725, -0.9781, 0, 0, 0, 1), u(1.979, 6.98, -0.445, 0.0433, 1, 0, 0, 4), u(191.953, 192.72, 0.029, 3.0861, 1, 0, 0, 2), u(-8.466, -13.51, 0.455, -0.1093, 1, 0, 0, 1), u(22639.5, 22609.07, 0.079, 186.5398, 1, 0, 0, 0), u(18.609, 3.59, -0.094, 0.0118, 1, 0, 0, -1), u(-4586.465, -4578.13, -0.077, 34.3117, 1, 0, 0, -2), u(3.215, 5.44, 0.192, -0.0386, 1, 0, 0, -3), u(-38.428, -38.64, 1e-3, 0.6008, 1, 0, 0, -4), u(-0.393, -1.43, -0.092, 86e-4, 1, 0, 0, -6), u(-0.289, -1.59, 0.123, -53e-4, 0, 1, 0, 4), u(-24.42, -25.1, 0.04, -0.3, 0, 1, 0, 2), u(18.023, 17.93, 7e-3, 0.1494, 0, 1, 0, 1), u(-668.146, -126.98, -1.302, -0.3997, 0, 1, 0, 0), u(0.56, 0.32, -1e-3, -37e-4, 0, 1, 0, -1), u(-165.145, -165.06, 0.054, 1.9178, 0, 1, 0, -2), u(-1.877, -6.46, -0.416, 0.0339, 0, 1, 0, -4), u(0.213, 1.02, -0.074, 54e-4, 2, 0, 0, 4), u(14.387, 14.78, -0.017, 0.2833, 2, 0, 0, 2), u(-0.586, -1.2, 0.054, -0.01, 2, 0, 0, 1), u(769.016, 767.96, 0.107, 10.1657, 2, 0, 0, 0), u(1.75, 2.01, -0.018, 0.0155, 2, 0, 0, -1), u(-211.656, -152.53, 5.679, -0.3039, 2, 0, 0, -2), u(1.225, 0.91, -0.03, -88e-4, 2, 0, 0, -3), u(-30.773, -34.07, -0.308, 0.3722, 2, 0, 0, -4), u(-0.57, -1.4, -0.074, 0.0109, 2, 0, 0, -6), u(-2.921, -11.75, 0.787, -0.0484, 1, 1, 0, 2), u(1.267, 1.52, -0.022, 0.0164, 1, 1, 0, 1), u(-109.673, -115.18, 0.461, -0.949, 1, 1, 0, 0), u(-205.962, -182.36, 2.056, 1.4437, 1, 1, 0, -2), u(0.233, 0.36, 0.012, -25e-4, 1, 1, 0, -3), u(-4.391, -9.66, -0.471, 0.0673, 1, 1, 0, -4), u(0.283, 1.53, -0.111, 6e-3, 1, -1, 0, 4), u(14.577, 31.7, -1.54, 0.2302, 1, -1, 0, 2), u(147.687, 138.76, 0.679, 1.1528, 1, -1, 0, 0), u(-1.089, 0.55, 0.021, 0, 1, -1, 0, -1), u(28.475, 23.59, -0.443, -0.2257, 1, -1, 0, -2), u(-0.276, -0.38, -6e-3, -36e-4, 1, -1, 0, -3), u(0.636, 2.27, 0.146, -0.0102, 1, -1, 0, -4), u(-0.189, -1.68, 0.131, -28e-4, 0, 2, 0, 2), u(-7.486, -0.66, -0.037, -86e-4, 0, 2, 0, 0), u(-8.096, -16.35, -0.74, 0.0918, 0, 2, 0, -2), u(-5.741, -0.04, 0, -9e-4, 0, 0, 2, 2), u(0.255, 0, 0, 0, 0, 0, 2, 1), u(-411.608, -0.2, 0, -0.0124, 0, 0, 2, 0), u(0.584, 0.84, 0, 71e-4, 0, 0, 2, -1), u(-55.173, -52.14, 0, -0.1052, 0, 0, 2, -2), u(0.254, 0.25, 0, -17e-4, 0, 0, 2, -3), u(0.025, -1.67, 0, 31e-4, 0, 0, 2, -4), u(1.06, 2.96, -0.166, 0.0243, 3, 0, 0, 2), u(36.124, 50.64, -1.3, 0.6215, 3, 0, 0, 0), u(-13.193, -16.4, 0.258, -0.1187, 3, 0, 0, -2), u(-1.187, -0.74, 0.042, 74e-4, 3, 0, 0, -4), u(-0.293, -0.31, -2e-3, 46e-4, 3, 0, 0, -6), u(-0.29, -1.45, 0.116, -51e-4, 2, 1, 0, 2), u(-7.649, -10.56, 0.259, -0.1038, 2, 1, 0, 0), u(-8.627, -7.59, 0.078, -0.0192, 2, 1, 0, -2), u(-2.74, -2.54, 0.022, 0.0324, 2, 1, 0, -4), u(1.181, 3.32, -0.212, 0.0213, 2, -1, 0, 2), u(9.703, 11.67, -0.151, 0.1268, 2, -1, 0, 0), u(-0.352, -0.37, 1e-3, -28e-4, 2, -1, 0, -1), u(-2.494, -1.17, -3e-3, -17e-4, 2, -1, 0, -2), u(0.36, 0.2, -0.012, -43e-4, 2, -1, 0, -4), u(-1.167, -1.25, 8e-3, -0.0106, 1, 2, 0, 0), u(-7.412, -6.12, 0.117, 0.0484, 1, 2, 0, -2), u(-0.311, -0.65, -0.032, 44e-4, 1, 2, 0, -4), u(0.757, 1.82, -0.105, 0.0112, 1, -2, 0, 2), u(2.58, 2.32, 0.027, 0.0196, 1, -2, 0, 0), u(2.533, 2.4, -0.014, -0.0212, 1, -2, 0, -2), u(-0.344, -0.57, -0.025, 36e-4, 0, 3, 0, -2), u(-0.992, -0.02, 0, 0, 1, 0, 2, 2), u(-45.099, -0.02, 0, -1e-3, 1, 0, 2, 0), u(-0.179, -9.52, 0, -0.0833, 1, 0, 2, -2), u(-0.301, -0.33, 0, 14e-4, 1, 0, 2, -4), u(-6.382, -3.37, 0, -0.0481, 1, 0, -2, 2), u(39.528, 85.13, 0, -0.7136, 1, 0, -2, 0), u(9.366, 0.71, 0, -0.0112, 1, 0, -2, -2), u(0.202, 0.02, 0, 0, 1, 0, -2, -4), u(0.415, 0.1, 0, 13e-4, 0, 1, 2, 0), u(-2.152, -2.26, 0, -66e-4, 0, 1, 2, -2), u(-1.44, -1.3, 0, 14e-4, 0, 1, -2, 2), u(0.384, -0.04, 0, 0, 0, 1, -2, -2), u(1.938, 3.6, -0.145, 0.0401, 4, 0, 0, 0), u(-0.952, -1.58, 0.052, -0.013, 4, 0, 0, -2), u(-0.551, -0.94, 0.032, -97e-4, 3, 1, 0, 0), u(-0.482, -0.57, 5e-3, -45e-4, 3, 1, 0, -2), u(0.681, 0.96, -0.026, 0.0115, 3, -1, 0, 0), u(-0.297, -0.27, 2e-3, -9e-4, 2, 2, 0, -2), u(0.254, 0.21, -3e-3, 0, 2, -2, 0, -2), u(-0.25, -0.22, 4e-3, 14e-4, 1, 3, 0, -2), u(-3.996, 0, 0, 4e-4, 2, 0, 2, 0), u(0.557, -0.75, 0, -9e-3, 2, 0, 2, -2), u(-0.459, -0.38, 0, -53e-4, 2, 0, -2, 2), u(-1.298, 0.74, 0, 4e-4, 2, 0, -2, 0), u(0.538, 1.14, 0, -0.0141, 2, 0, -2, -2), u(0.263, 0.02, 0, 0, 1, 1, 2, 0), u(0.426, 0.07, 0, -6e-4, 1, 1, -2, -2), u(-0.304, 0.03, 0, 3e-4, 1, -1, 2, 0), u(-0.372, -0.19, 0, -27e-4, 1, -1, -2, 2), u(0.418, 0, 0, 0, 0, 0, 4, 0), u(-0.33, -0.04, 0, 0, 3, 0, 2, 0);
  function B(R, _, A, C, P) {
    return R * qe(_, A, C, P).y;
  }
  E = 0, E += B(-526.069, 0, 0, 1, -2), E += B(-3.352, 0, 0, 1, -4), E += B(44.297, 1, 0, 1, -2), E += B(-6, 1, 0, 1, -4), E += B(20.599, -1, 0, 1, 0), E += B(-30.598, -1, 0, 1, -2), E += B(-24.649, -2, 0, 1, 0), E += B(-2, -2, 0, 1, -2), E += B(-22.571, 0, 1, 1, -2), E += B(10.985, 0, -1, 1, -2), T += 0.82 * M(0.7736 - 62.5512 * e) + 0.31 * M(0.0466 - 125.1025 * e) + 0.35 * M(0.5785 - 25.1042 * e) + 0.66 * M(0.4591 + 1335.8075 * e) + 0.64 * M(0.313 - 91.568 * e) + 1.14 * M(0.148 + 1331.2898 * e) + 0.21 * M(0.5918 + 1056.5859 * e) + 0.44 * M(0.5784 + 1322.8595 * e) + 0.24 * M(0.2275 - 5.7374 * e) + 0.28 * M(0.2965 + 2.6929 * e) + 0.33 * M(0.3132 + 6.3368 * e), o = U + J / e0;
  let Zt = (1.000002708 + 139.978 * v) * (18518.511 + 1.189 + x) * Math.sin(o) - 6.24 * Math.sin(3 * o) + E;
  return {
    geo_eclip_lon: X * E0((I + T / e0) / X),
    geo_eclip_lat: Math.PI / (180 * 3600) * Zt,
    distance_au: e0 * rr / (0.999953253 * y)
  };
}
function Lt(n, e) {
  return [
    n.rot[0][0] * e[0] + n.rot[1][0] * e[1] + n.rot[2][0] * e[2],
    n.rot[0][1] * e[0] + n.rot[1][1] * e[1] + n.rot[2][1] * e[2],
    n.rot[0][2] * e[0] + n.rot[1][2] * e[1] + n.rot[2][2] * e[2]
  ];
}
function Ht(n, e, t) {
  const r = bt(e, t);
  return Lt(r, n);
}
function bt(n, e) {
  const t = n.tt / 36525;
  let r = 84381.406, i = ((((-951e-10 * t + 132851e-9) * t - 114045e-8) * t - 1.0790069) * t + 5038.481507) * t, a = ((((3337e-10 * t - 467e-9) * t - 772503e-8) * t + 0.0512623) * t - 0.025754) * t + r, o = ((((-56e-9 * t + 170663e-9) * t - 121197e-8) * t - 2.3814292) * t + 10.556403) * t;
  r *= x0, i *= x0, a *= x0, o *= x0;
  const c = Math.sin(r), s = Math.cos(r), l = Math.sin(-i), h = Math.cos(-i), m = Math.sin(-a), f = Math.cos(-a), v = Math.sin(o), T = Math.cos(o), E = T * h - l * v * f, x = T * l * s + v * f * h * s - c * v * m, y = T * l * c + v * f * h * c + s * v * m, I = -v * h - l * T * f, N = -v * l * s + T * f * h * s - c * T * m, b = -v * l * c + T * f * h * c + s * T * m, U = l * m, z = -m * h * s - c * f, F = -m * h * c + f * s;
  if (e === V.Into2000)
    return new I0([
      [E, x, y],
      [I, N, b],
      [U, z, F]
    ]);
  if (e === V.From2000)
    return new I0([
      [E, I, U],
      [x, N, z],
      [y, b, F]
    ]);
  throw "Invalid precess direction";
}
function fr(n) {
  const e = 0.779057273264 + 0.00273781191135448 * n.ut, t = n.ut % 1;
  let r = 360 * ((e + t) % 1);
  return r < 0 && (r += 360), r;
}
let $0;
function gr(n) {
  if (!$0 || $0.tt !== n.tt) {
    const e = n.tt / 36525;
    let t = 15 * Ot(n).ee;
    const r = fr(n);
    let a = ((t + 0.014506 + ((((-368e-10 * e - 29956e-9) * e - 44e-8) * e + 1.3915817) * e + 4612.156534) * e) / 3600 + r) % 360 / 15;
    a < 0 && (a += 24), $0 = {
      tt: n.tt,
      st: a
    };
  }
  return $0.st;
}
function pr(n) {
  const e = r0(n);
  return gr(e);
}
function Tr(n, e, t) {
  const r = Ut(e, t);
  return Lt(r, n);
}
function Ut(n, e) {
  const t = Ot(n), r = t.mobl * g, i = t.tobl * g, a = t.dpsi * x0, o = Math.cos(r), c = Math.sin(r), s = Math.cos(i), l = Math.sin(i), h = Math.cos(a), m = Math.sin(a), f = h, v = -m * o, T = -m * c, E = m * s, x = h * o * s + c * l, y = h * c * s - o * l, I = m * l, N = h * o * l - c * s, b = h * c * l + o * s;
  if (e === V.From2000)
    return new I0([
      [f, E, I],
      [v, x, N],
      [T, y, b]
    ]);
  if (e === V.Into2000)
    return new I0([
      [f, v, T],
      [E, x, y],
      [I, N, b]
    ]);
  throw "Invalid precess direction";
}
class G {
  constructor(e, t, r, i) {
    this.x = e, this.y = t, this.z = r, this.t = i;
  }
  /**
   * Returns the length of the vector in astronomical units (AU).
   * @returns {number}
   */
  Length() {
    return Math.hypot(this.x, this.y, this.z);
  }
}
class Sr {
  constructor(e, t, r, i, a, o, c) {
    this.x = e, this.y = t, this.z = r, this.vx = i, this.vy = a, this.vz = o, this.t = c;
  }
}
class Gt {
  constructor(e, t, r) {
    this.lat = l0(e), this.lon = l0(t), this.dist = l0(r);
  }
}
class vr {
  constructor(e, t, r, i) {
    this.ra = l0(e), this.dec = l0(t), this.dist = l0(r), this.vec = i;
  }
}
class I0 {
  constructor(e) {
    this.rot = e;
  }
}
function ye(n) {
  const e = r0(n), t = mr(e), r = t.distance_au * Math.cos(t.geo_eclip_lat), i = [
    r * Math.cos(t.geo_eclip_lon),
    r * Math.sin(t.geo_eclip_lon),
    t.distance_au * Math.sin(t.geo_eclip_lat)
  ], a = hr(e, i), o = Ht(a, e, V.Into2000);
  return new G(o[0], o[1], o[2], e);
}
function y0(n, e, t) {
  let r = 1, i = 0;
  for (let a of n) {
    let o = 0;
    for (let [s, l, h] of a)
      o += s * Math.cos(l + e * h);
    let c = r * o;
    t && (c %= X), i += c, r *= e;
  }
  return i;
}
function Se(n, e) {
  let t = 1, r = 0, i = 0, a = 0;
  for (let o of n) {
    let c = 0, s = 0;
    for (let [l, h, m] of o) {
      let f = h + e * m;
      c += l * m * Math.sin(f), a > 0 && (s += l * Math.cos(f));
    }
    i += a * r * s - t * c, r = t, t *= e, ++a;
  }
  return i;
}
const b0 = 365250, Ce = 0, De = 1, Ie = 2;
function Pe(n) {
  return new O(n[0] + 44036e-11 * n[1] - 190919e-12 * n[2], -479966e-12 * n[0] + 0.917482137087 * n[1] - 0.397776982902 * n[2], 0.397776982902 * n[1] + 0.917482137087 * n[2]);
}
function Ft(n, e, t) {
  const r = t * Math.cos(e), i = Math.cos(n), a = Math.sin(n);
  return [
    r * i,
    r * a,
    t * Math.sin(e)
  ];
}
function Q0(n, e) {
  const t = e.tt / b0, r = y0(n[Ce], t, !0), i = y0(n[De], t, !1), a = y0(n[Ie], t, !1), o = Ft(r, i, a);
  return Pe(o).ToAstroVector(e);
}
function Er(n, e) {
  const t = e / b0, r = y0(n[Ce], t, !0), i = y0(n[De], t, !1), a = y0(n[Ie], t, !1), o = Se(n[Ce], t), c = Se(n[De], t), s = Se(n[Ie], t), l = Math.cos(r), h = Math.sin(r), m = Math.cos(i), f = Math.sin(i), v = +(s * m * l) - a * f * l * c - a * m * h * o, T = +(s * m * h) - a * f * h * c + a * m * l * o, E = +(s * f) + a * m * c, x = Ft(r, i, a), y = [
    v / b0,
    T / b0,
    E / b0
  ], I = Pe(x), N = Pe(y);
  return new d0(e, I, N);
}
function q0(n, e, t, r) {
  const i = r / (r + We), a = Q0(M0[t], e);
  n.x += i * a.x, n.y += i * a.y, n.z += i * a.z;
}
function Rr(n) {
  const e = new G(0, 0, 0, n);
  return q0(e, n, S.Jupiter, xe), q0(e, n, S.Saturn, Me), q0(e, n, S.Uranus, Ae), q0(e, n, S.Neptune, we), e;
}
const Ne = 51, _r = 29200, A0 = 146, Y = 201, o0 = [
  [-73e4, [-26.118207232108, -14.376168177825, 3.384402515299], [0.0016339372163656, -0.0027861699588508, -0.0013585880229445]],
  [-700800, [41.974905202127, -0.448502952929, -12.770351505989], [73458569351457e-17, 0.0022785014891658, 48619778602049e-17]],
  [-671600, [14.706930780744, 44.269110540027, 9.353698474772], [-0.00210001479998, 22295915939915e-17, 70143443551414e-17]],
  [-642400, [-29.441003929957, -6.43016153057, 6.858481011305], [84495803960544e-17, -0.0030783914758711, -0.0012106305981192]],
  [-613200, [39.444396946234, -6.557989760571, -13.913760296463], [0.0011480029005873, 0.0022400006880665, 35168075922288e-17]],
  [-584e3, [20.2303809507, 43.266966657189, 7.382966091923], [-0.0019754081700585, 53457141292226e-17, 75929169129793e-17]],
  [-554800, [-30.65832536462, 2.093818874552, 9.880531138071], [61010603013347e-18, -0.0031326500935382, -99346125151067e-17]],
  [-525600, [35.737703251673, -12.587706024764, -14.677847247563], [0.0015802939375649, 0.0021347678412429, 19074436384343e-17]],
  [-496400, [25.466295188546, 41.367478338417, 5.216476873382], [-0.0018054401046468, 8328308359951e-16, 80260156912107e-17]],
  [-467200, [-29.847174904071, 10.636426313081, 12.297904180106], [-63257063052907e-17, -0.0029969577578221, -74476074151596e-17]],
  [-438e3, [30.774692107687, -18.236637015304, -14.945535879896], [0.0020113162005465, 0.0019353827024189, -20937793168297e-19]],
  [-408800, [30.243153324028, 38.656267888503, 2.938501750218], [-0.0016052508674468, 0.0011183495337525, 83333973416824e-17]],
  [-379600, [-27.288984772533, 18.643162147874, 14.023633623329], [-0.0011856388898191, -0.0027170609282181, -49015526126399e-17]],
  [-350400, [24.519605196774, -23.245756064727, -14.626862367368], [0.0024322321483154, 0.0016062008146048, -23369181613312e-17]],
  [-321200, [34.505274805875, 35.125338586954, 0.557361475637], [-0.0013824391637782, 0.0013833397561817, 84823598806262e-17]],
  [-292e3, [-23.275363915119, 25.818514298769, 15.055381588598], [-0.0016062295460975, -0.0023395961498533, -24377362639479e-17]],
  [-262800, [17.050384798092, -27.180376290126, -13.608963321694], [0.0028175521080578, 0.0011358749093955, -49548725258825e-17]],
  [-233600, [38.093671910285, 30.880588383337, -1.843688067413], [-0.0011317697153459, 0.0016128814698472, 84177586176055e-17]],
  [-204400, [-18.197852930878, 31.932869934309, 15.438294826279], [-0.0019117272501813, -0.0019146495909842, -19657304369835e-18]],
  [-175200, [8.528924039997, -29.618422200048, -11.805400994258], [0.0031034370787005, 5139363329243e-16, -77293066202546e-17]],
  [-146e3, [40.94685725864, 25.904973592021, -4.256336240499], [-83652705194051e-17, 0.0018129497136404, 8156422827306e-16]],
  [-116800, [-12.326958895325, 36.881883446292, 15.217158258711], [-0.0021166103705038, -0.001481442003599, 17401209844705e-17]],
  [-87600, [-0.633258375909, -30.018759794709, -9.17193287495], [0.0032016994581737, -25279858672148e-17, -0.0010411088271861]],
  [-58400, [42.936048423883, 20.344685584452, -6.588027007912], [-50525450073192e-17, 0.0019910074335507, 77440196540269e-17]],
  [-29200, [-5.975910552974, 40.61180995846, 14.470131723673], [-0.0022184202156107, -0.0010562361130164, 33652250216211e-17]],
  [0, [-9.875369580774, -27.978926224737, -5.753711824704], [0.0030287533248818, -0.0011276087003636, -0.0012651326732361]],
  [29200, [43.958831986165, 14.214147973292, -8.808306227163], [-14717608981871e-17, 0.0021404187242141, 71486567806614e-17]],
  [58400, [0.67813676352, 43.094461639362, 13.243238780721], [-0.0022358226110718, -63233636090933e-17, 47664798895648e-17]],
  [87600, [-18.282602096834, -23.30503958666, -1.766620508028], [0.0025567245263557, -0.0019902940754171, -0.0013943491701082]],
  [116800, [43.873338744526, 7.700705617215, -10.814273666425], [23174803055677e-17, 0.0022402163127924, 62988756452032e-17]],
  [146e3, [7.392949027906, 44.382678951534, 11.629500214854], [-0.002193281545383, -21751799585364e-17, 59556516201114e-17]],
  [175200, [-24.981690229261, -16.204012851426, 2.466457544298], [0.001819398914958, -0.0026765419531201, -0.0013848283502247]],
  [204400, [42.530187039511, 0.845935508021, -12.554907527683], [65059779150669e-17, 0.0022725657282262, 51133743202822e-17]],
  [233600, [13.999526486822, 44.462363044894, 9.669418486465], [-0.0021079296569252, 17533423831993e-17, 69128485798076e-17]],
  [262800, [-29.184024803031, -7.371243995762, 6.493275957928], [93581363109681e-17, -0.0030610357109184, -0.0012364201089345]],
  [292e3, [39.831980671753, -6.078405766765, -13.909815358656], [0.0011117769689167, 0.0022362097830152, 36230548231153e-17]],
  [321200, [20.294955108476, 43.417190420251, 7.450091985932], [-0.0019742157451535, 53102050468554e-17, 75938408813008e-17]],
  [350400, [-30.66999230216, 2.318743558955, 9.973480913858], [45605107450676e-18, -0.0031308219926928, -99066533301924e-17]],
  [379600, [35.626122155983, -12.897647509224, -14.777586508444], [0.0016015684949743, 0.0021171931182284, 18002516202204e-17]],
  [408800, [26.133186148561, 41.232139187599, 5.00640132622], [-0.0017857704419579, 86046232702817e-17, 80614690298954e-17]],
  [438e3, [-29.57674022923, 11.863535943587, 12.631323039872], [-72292830060955e-17, -0.0029587820140709, -708242964503e-15]],
  [467200, [29.910805787391, -19.159019294, -15.013363865194], [0.0020871080437997, 0.0018848372554514, -38528655083926e-18]],
  [496400, [31.375957451819, 38.050372720763, 2.433138343754], [-0.0015546055556611, 0.0011699815465629, 83565439266001e-17]],
  [525600, [-26.360071336928, 20.662505904952, 14.414696258958], [-0.0013142373118349, -0.0026236647854842, -42542017598193e-17]],
  [554800, [22.599441488648, -24.508879898306, -14.484045731468], [0.0025454108304806, 0.0014917058755191, -30243665086079e-17]],
  [584e3, [35.877864013014, 33.894226366071, -0.224524636277], [-0.0012941245730845, 0.0014560427668319, 84762160640137e-17]],
  [613200, [-21.538149762417, 28.204068269761, 15.321973799534], [-0.001731211740901, -0.0021939631314577, -1631691327518e-16]],
  [642400, [13.971521374415, -28.339941764789, -13.083792871886], [0.0029334630526035, 91860931752944e-17, -59939422488627e-17]],
  [671600, [39.526942044143, 28.93989736011, -2.872799527539], [-0.0010068481658095, 0.001702113288809, 83578230511981e-17]],
  [700800, [-15.576200701394, 34.399412961275, 15.466033737854], [-0.0020098814612884, -0.0017191109825989, 70414782780416e-18]],
  [73e4, [4.24325283709, -30.118201690825, -10.707441231349], [0.0031725847067411, 1609846120227e-16, -90672150593868e-17]]
];
class O {
  constructor(e, t, r) {
    this.x = e, this.y = t, this.z = r;
  }
  clone() {
    return new O(this.x, this.y, this.z);
  }
  ToAstroVector(e) {
    return new G(this.x, this.y, this.z, e);
  }
  static zero() {
    return new O(0, 0, 0);
  }
  quadrature() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  add(e) {
    return new O(this.x + e.x, this.y + e.y, this.z + e.z);
  }
  sub(e) {
    return new O(this.x - e.x, this.y - e.y, this.z - e.z);
  }
  incr(e) {
    this.x += e.x, this.y += e.y, this.z += e.z;
  }
  decr(e) {
    this.x -= e.x, this.y -= e.y, this.z -= e.z;
  }
  mul(e) {
    return new O(e * this.x, e * this.y, e * this.z);
  }
  div(e) {
    return new O(this.x / e, this.y / e, this.z / e);
  }
  mean(e) {
    return new O((this.x + e.x) / 2, (this.y + e.y) / 2, (this.z + e.z) / 2);
  }
  neg() {
    return new O(-this.x, -this.y, -this.z);
  }
}
class d0 {
  constructor(e, t, r) {
    this.tt = e, this.r = t, this.v = r;
  }
  clone() {
    return new d0(this.tt, this.r, this.v);
  }
  sub(e) {
    return new d0(this.tt, this.r.sub(e.r), this.v.sub(e.v));
  }
}
function xr(n) {
  let [e, [t, r, i], [a, o, c]] = n;
  return new d0(e, new O(t, r, i), new O(a, o, c));
}
function Z0(n, e, t, r) {
  const i = r / (r + We), a = Er(M0[t], e);
  return n.r.incr(a.r.mul(i)), n.v.incr(a.v.mul(i)), a;
}
function H0(n, e, t) {
  const r = t.sub(n), i = r.quadrature();
  return r.mul(e / (i * Math.sqrt(i)));
}
class je {
  constructor(e) {
    let t = new d0(e, new O(0, 0, 0), new O(0, 0, 0));
    this.Jupiter = Z0(t, e, S.Jupiter, xe), this.Saturn = Z0(t, e, S.Saturn, Me), this.Uranus = Z0(t, e, S.Uranus, Ae), this.Neptune = Z0(t, e, S.Neptune, we), this.Jupiter.r.decr(t.r), this.Jupiter.v.decr(t.v), this.Saturn.r.decr(t.r), this.Saturn.v.decr(t.v), this.Uranus.r.decr(t.r), this.Uranus.v.decr(t.v), this.Neptune.r.decr(t.r), this.Neptune.v.decr(t.v), this.Sun = new d0(e, t.r.mul(-1), t.v.mul(-1));
  }
  Acceleration(e) {
    let t = H0(e, We, this.Sun.r);
    return t.incr(H0(e, xe, this.Jupiter.r)), t.incr(H0(e, Me, this.Saturn.r)), t.incr(H0(e, Ae, this.Uranus.r)), t.incr(H0(e, we, this.Neptune.r)), t;
  }
}
class ce {
  constructor(e, t, r, i) {
    this.tt = e, this.r = t, this.v = r, this.a = i;
  }
  clone() {
    return new ce(this.tt, this.r.clone(), this.v.clone(), this.a.clone());
  }
}
class zt {
  constructor(e, t) {
    this.bary = e, this.grav = t;
  }
}
function te(n, e, t, r) {
  return new O(e.x + n * (t.x + n * r.x / 2), e.y + n * (t.y + n * r.y / 2), e.z + n * (t.z + n * r.z / 2));
}
function ct(n, e, t) {
  return new O(e.x + n * t.x, e.y + n * t.y, e.z + n * t.z);
}
function Oe(n, e) {
  const t = n - e.tt, r = new je(n), i = te(t, e.r, e.v, e.a), a = r.Acceleration(i).mean(e.a), o = te(t, e.r, e.v, a), c = e.v.add(a.mul(t)), s = r.Acceleration(o), l = new ce(n, o, c, s);
  return new zt(r, l);
}
const Mr = [];
function kt(n, e) {
  const t = Math.floor(n);
  return t < 0 ? 0 : t >= e ? e - 1 : t;
}
function Le(n) {
  const e = xr(n), t = new je(e.tt), r = e.r.add(t.Sun.r), i = e.v.add(t.Sun.v), a = t.Acceleration(r), o = new ce(e.tt, r, i, a);
  return new zt(t, o);
}
function Ar(n, e) {
  const t = o0[0][0];
  if (e < t || e > o0[Ne - 1][0])
    return null;
  const r = kt((e - t) / _r, Ne - 1);
  if (!n[r]) {
    const a = n[r] = [];
    a[0] = Le(o0[r]).grav, a[Y - 1] = Le(o0[r + 1]).grav;
    let o, c = a[0].tt;
    for (o = 1; o < Y - 1; ++o)
      a[o] = Oe(c += A0, a[o - 1]).grav;
    c = a[Y - 1].tt;
    var i = [];
    for (i[Y - 1] = a[Y - 1], o = Y - 2; o > 0; --o)
      i[o] = Oe(c -= A0, i[o + 1]).grav;
    for (o = Y - 2; o > 0; --o) {
      const s = o / (Y - 1);
      a[o].r = a[o].r.mul(1 - s).add(i[o].r.mul(s)), a[o].v = a[o].v.mul(1 - s).add(i[o].v.mul(s)), a[o].a = a[o].a.mul(1 - s).add(i[o].a.mul(s));
    }
  }
  return n[r];
}
function ut(n, e, t) {
  let r = Le(n);
  const i = Math.ceil((e - r.grav.tt) / t);
  for (let a = 0; a < i; ++a)
    r = Oe(a + 1 === i ? e : r.grav.tt + t, r.grav);
  return r;
}
function wr(n, e) {
  let t, r, i;
  const a = Ar(Mr, n.tt);
  if (a) {
    const o = kt((n.tt - a[0].tt) / A0, Y - 1), c = a[o], s = a[o + 1], l = c.a.mean(s.a), h = te(n.tt - c.tt, c.r, c.v, l), m = ct(n.tt - c.tt, c.v, l), f = te(n.tt - s.tt, s.r, s.v, l), v = ct(n.tt - s.tt, s.v, l), T = (n.tt - c.tt) / A0;
    t = h.mul(1 - T).add(f.mul(T)), r = m.mul(1 - T).add(v.mul(T));
  } else {
    let o;
    n.tt < o0[0][0] ? o = ut(o0[0], n.tt, -A0) : o = ut(o0[Ne - 1], n.tt, +A0), t = o.grav.r, r = o.grav.v, i = o.bary;
  }
  return i || (i = new je(n.tt)), t = t.sub(i.Sun.r), r = r.sub(i.Sun.v), new Sr(t.x, t.y, t.z, r.x, r.y, r.z, n);
}
function G0(n, e) {
  var t = r0(e);
  if (n in M0)
    return Q0(M0[n], t);
  if (n === S.Pluto) {
    const o = wr(t);
    return new G(o.x, o.y, o.z, t);
  }
  if (n === S.Sun)
    return new G(0, 0, 0, t);
  if (n === S.Moon) {
    var r = Q0(M0.Earth, t), i = ye(t);
    return new G(r.x + i.x, r.y + i.y, r.z + i.z, t);
  }
  if (n === S.EMB) {
    const o = Q0(M0.Earth, t), c = ye(t), s = 1 + ir;
    return new G(o.x + c.x / s, o.y + c.y / s, o.z + c.z / s, t);
  }
  if (n === S.SSB)
    return Rr(t);
  const a = Pt(n);
  if (a) {
    const o = new Gt(a.dec, 15 * a.ra, a.dist);
    return Or(o, t);
  }
  throw `HelioVector: Unknown body "${n}"`;
}
function yr(n, e) {
  let t = e, r = 0;
  for (let i = 0; i < 10; ++i) {
    const a = n(t), o = a.Length() / Jn;
    if (o > 1)
      throw "Object is too distant for light-travel solver.";
    const c = e.AddDays(-o);
    if (r = Math.abs(c.tt - t.tt), r < 1e-9)
      return a;
    t = c;
  }
  throw `Light-travel time solver did not converge: dt = ${r}`;
}
class Cr {
  constructor(e, t, r, i) {
    this.observerBody = e, this.targetBody = t, this.aberration = r, this.observerPos = i;
  }
  Position(e) {
    this.aberration && (this.observerPos = G0(this.observerBody, e));
    const t = G0(this.targetBody, e);
    return new G(t.x - this.observerPos.x, t.y - this.observerPos.y, t.z - this.observerPos.z, e);
  }
}
function Dr(n, e, t, r) {
  const i = r0(n);
  if (Pt(t)) {
    const c = G0(t, i), s = G0(e, i);
    return new G(c.x - s.x, c.y - s.y, c.z - s.z, i);
  }
  let a;
  a = G0(e, i);
  const o = new Cr(e, t, r, a);
  return yr((c) => o.Position(c), i);
}
function Ir(n, e, t) {
  const r = r0(e);
  switch (n) {
    case S.Earth:
      return new G(0, 0, 0, r);
    case S.Moon:
      return ye(r);
    default:
      const i = Dr(r, S.Earth, n, t);
      return i.t = r, i;
  }
}
var lt;
(function(n) {
  n[n.Pericenter = 0] = "Pericenter", n[n.Apocenter = 1] = "Apocenter";
})(lt || (lt = {}));
function Pr(n, e) {
  return new I0([
    [
      e.rot[0][0] * n.rot[0][0] + e.rot[1][0] * n.rot[0][1] + e.rot[2][0] * n.rot[0][2],
      e.rot[0][1] * n.rot[0][0] + e.rot[1][1] * n.rot[0][1] + e.rot[2][1] * n.rot[0][2],
      e.rot[0][2] * n.rot[0][0] + e.rot[1][2] * n.rot[0][1] + e.rot[2][2] * n.rot[0][2]
    ],
    [
      e.rot[0][0] * n.rot[1][0] + e.rot[1][0] * n.rot[1][1] + e.rot[2][0] * n.rot[1][2],
      e.rot[0][1] * n.rot[1][0] + e.rot[1][1] * n.rot[1][1] + e.rot[2][1] * n.rot[1][2],
      e.rot[0][2] * n.rot[1][0] + e.rot[1][2] * n.rot[1][1] + e.rot[2][2] * n.rot[1][2]
    ],
    [
      e.rot[0][0] * n.rot[2][0] + e.rot[1][0] * n.rot[2][1] + e.rot[2][0] * n.rot[2][2],
      e.rot[0][1] * n.rot[2][0] + e.rot[1][1] * n.rot[2][1] + e.rot[2][1] * n.rot[2][2],
      e.rot[0][2] * n.rot[2][0] + e.rot[1][2] * n.rot[2][1] + e.rot[2][2] * n.rot[2][2]
    ]
  ]);
}
function Nr(n, e, t) {
  const r = l0(t) * g, i = Math.cos(r), a = Math.sin(r), o = (e + 1) % 3, c = (e + 2) % 3, s = e;
  let l = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  return l[o][o] = i * n.rot[o][o] - a * n.rot[o][c], l[o][c] = a * n.rot[o][o] + i * n.rot[o][c], l[o][s] = n.rot[o][s], l[c][o] = i * n.rot[c][o] - a * n.rot[c][c], l[c][c] = a * n.rot[c][o] + i * n.rot[c][c], l[c][s] = n.rot[c][s], l[s][o] = i * n.rot[s][o] - a * n.rot[s][c], l[s][c] = a * n.rot[s][o] + i * n.rot[s][c], l[s][s] = n.rot[s][s], new I0(l);
}
function Or(n, e) {
  e = r0(e);
  const t = n.lat * g, r = n.lon * g, i = n.dist * Math.cos(t);
  return new G(i * Math.cos(r), i * Math.sin(r), n.dist * Math.sin(t), e);
}
function Lr(n) {
  const e = Hr(n);
  return new vr(e.lon / 15, e.lat, e.dist, n);
}
function Hr(n) {
  const e = n.x * n.x + n.y * n.y, t = Math.sqrt(e + n.z * n.z);
  let r, i;
  if (e === 0) {
    if (n.z === 0)
      throw "Zero-length vector not allowed.";
    i = 0, r = n.z < 0 ? -90 : 90;
  } else
    i = at * Math.atan2(n.y, n.x), i < 0 && (i += 360), r = at * Math.atan2(n.z, Math.sqrt(e));
  return new Gt(r, i, t);
}
function br(n) {
  n = r0(n);
  const e = bt(n, V.From2000), t = Ut(n, V.From2000);
  return Pr(e, t);
}
var dt;
(function(n) {
  n.Penumbral = "penumbral", n.Partial = "partial", n.Annular = "annular", n.Total = "total";
})(dt || (dt = {}));
var ht;
(function(n) {
  n[n.Invalid = 0] = "Invalid", n[n.Ascending = 1] = "Ascending", n[n.Descending = -1] = "Descending";
})(ht || (ht = {}));
class Vt {
  constructor(e, t, r, i) {
    this.ra = e, this.dec = t, this.spin = r, this.north = i;
  }
}
function Ur(n) {
  const e = Tr([0, 0, 1], n, V.Into2000), t = Ht(e, n, V.Into2000), r = new G(t[0], t[1], t[2], n), i = Lr(r), a = 190.41375788700253 + 360.9856122880876 * n.ut;
  return new Vt(i.ra, i.dec, a, r);
}
function Gr(n, e) {
  const t = r0(e), r = t.tt, i = r / 36525;
  let a, o, c;
  switch (n) {
    case S.Sun:
      a = 286.13, o = 63.87, c = 84.176 + 14.1844 * r;
      break;
    case S.Mercury:
      a = 281.0103 - 0.0328 * i, o = 61.4155 - 49e-4 * i, c = 329.5988 + 6.1385108 * r + 0.01067257 * Math.sin(g * (174.7910857 + 4.092335 * r)) - 112309e-8 * Math.sin(g * (349.5821714 + 8.18467 * r)) - 1104e-7 * Math.sin(g * (164.3732571 + 12.277005 * r)) - 2539e-8 * Math.sin(g * (339.1643429 + 16.36934 * r)) - 571e-8 * Math.sin(g * (153.9554286 + 20.461675 * r));
      break;
    case S.Venus:
      a = 272.76, o = 67.16, c = 160.2 - 1.4813688 * r;
      break;
    case S.Earth:
      return Ur(t);
    case S.Moon:
      const f = g * (125.045 - 0.0529921 * r), v = g * (250.089 - 0.1059842 * r), T = g * (260.008 + 13.0120009 * r), E = g * (176.625 + 13.3407154 * r), x = g * (357.529 + 0.9856003 * r), y = g * (311.589 + 26.4057084 * r), I = g * (134.963 + 13.064993 * r), N = g * (276.617 + 0.3287146 * r), b = g * (34.226 + 1.7484877 * r), U = g * (15.134 - 0.1589763 * r), z = g * (119.743 + 36096e-7 * r), F = g * (239.961 + 0.1643573 * r), q = g * (25.053 + 12.9590088 * r);
      a = 269.9949 + 31e-4 * i - 3.8787 * Math.sin(f) - 0.1204 * Math.sin(v) + 0.07 * Math.sin(T) - 0.0172 * Math.sin(E) + 72e-4 * Math.sin(y) - 52e-4 * Math.sin(U) + 43e-4 * Math.sin(q), o = 66.5392 + 0.013 * i + 1.5419 * Math.cos(f) + 0.0239 * Math.cos(v) - 0.0278 * Math.cos(T) + 68e-4 * Math.cos(E) - 29e-4 * Math.cos(y) + 9e-4 * Math.cos(I) + 8e-4 * Math.cos(U) - 9e-4 * Math.cos(q), c = 38.3213 + (13.17635815 - 14e-13 * r) * r + 3.561 * Math.sin(f) + 0.1208 * Math.sin(v) - 0.0642 * Math.sin(T) + 0.0158 * Math.sin(E) + 0.0252 * Math.sin(x) - 66e-4 * Math.sin(y) - 47e-4 * Math.sin(I) - 46e-4 * Math.sin(N) + 28e-4 * Math.sin(b) + 52e-4 * Math.sin(U) + 4e-3 * Math.sin(z) + 19e-4 * Math.sin(F) - 44e-4 * Math.sin(q);
      break;
    case S.Mars:
      a = 317.269202 - 0.10927547 * i + 68e-6 * Math.sin(g * (198.991226 + 19139.4819985 * i)) + 238e-6 * Math.sin(g * (226.292679 + 38280.8511281 * i)) + 52e-6 * Math.sin(g * (249.663391 + 57420.7251593 * i)) + 9e-6 * Math.sin(g * (266.18351 + 76560.636795 * i)) + 0.419057 * Math.sin(g * (79.398797 + 0.5042615 * i)), o = 54.432516 - 0.05827105 * i + 51e-6 * Math.cos(g * (122.433576 + 19139.9407476 * i)) + 141e-6 * Math.cos(g * (43.058401 + 38280.8753272 * i)) + 31e-6 * Math.cos(g * (57.663379 + 57420.7517205 * i)) + 5e-6 * Math.cos(g * (79.476401 + 76560.6495004 * i)) + 1.591274 * Math.cos(g * (166.325722 + 0.5042615 * i)), c = 176.049863 + 350.891982443297 * r + 145e-6 * Math.sin(g * (129.071773 + 19140.0328244 * i)) + 157e-6 * Math.sin(g * (36.352167 + 38281.0473591 * i)) + 4e-5 * Math.sin(g * (56.668646 + 57420.929536 * i)) + 1e-6 * Math.sin(g * (67.364003 + 76560.2552215 * i)) + 1e-6 * Math.sin(g * (104.79268 + 95700.4387578 * i)) + 0.584542 * Math.sin(g * (95.391654 + 0.5042615 * i));
      break;
    case S.Jupiter:
      const Z = g * (99.360714 + 4850.4046 * i), i0 = g * (175.895369 + 1191.9605 * i), a0 = g * (300.323162 + 262.5475 * i), J = g * (114.012305 + 6070.2476 * i), N0 = g * (49.511251 + 64.3 * i);
      a = 268.056595 - 6499e-6 * i + 117e-6 * Math.sin(Z) + 938e-6 * Math.sin(i0) + 1432e-6 * Math.sin(a0) + 3e-5 * Math.sin(J) + 215e-5 * Math.sin(N0), o = 64.495303 + 2413e-6 * i + 5e-5 * Math.cos(Z) + 404e-6 * Math.cos(i0) + 617e-6 * Math.cos(a0) - 13e-6 * Math.cos(J) + 926e-6 * Math.cos(N0), c = 284.95 + 870.536 * r;
      break;
    case S.Saturn:
      a = 40.589 - 0.036 * i, o = 83.537 - 4e-3 * i, c = 38.9 + 810.7939024 * r;
      break;
    case S.Uranus:
      a = 257.311, o = -15.175, c = 203.81 - 501.1600928 * r;
      break;
    case S.Neptune:
      const p0 = g * (357.85 + 52.316 * i);
      a = 299.36 + 0.7 * Math.sin(p0), o = 43.46 - 0.51 * Math.cos(p0), c = 249.978 + 541.1397757 * r - 0.48 * Math.sin(p0);
      break;
    case S.Pluto:
      a = 132.993, o = -6.163, c = 302.695 + 56.3625225 * r;
      break;
    default:
      throw `Invalid body: ${n}`;
  }
  const s = o * g, l = a * g, h = Math.cos(s), m = new G(h * Math.cos(l), h * Math.sin(l), Math.sin(s), t);
  return new Vt(a / 15, o, c, m);
}
const Fr = 1e-3 / It, Bt = /* @__PURE__ */ new p(), zr = /* @__PURE__ */ new p(), kr = /* @__PURE__ */ new p(), Wt = /* @__PURE__ */ new D(), Vr = /* @__PURE__ */ new D(), Br = /* @__PURE__ */ new un();
function P0(n) {
  return n instanceof t0 ? n : (
    // Prefer number to be JS timestamp.
    new t0(n instanceof Date ? n : new Date(n))
  );
}
function jt(n, e = new p()) {
  const { x: t, y: r, z: i } = n;
  return e.set(t, r, i);
}
function Wr(n, e = new D()) {
  const [t, r, i] = n.rot;
  return e.set(
    t[0],
    r[0],
    i[0],
    0,
    t[1],
    r[1],
    i[1],
    0,
    t[2],
    r[2],
    i[2],
    0,
    0,
    0,
    0,
    1
  );
}
function Xe(n, e = new D()) {
  const t = P0(n), r = Nr(br(t), 2, -15 * pr(t));
  return Wr(r, e);
}
function bi(n, e = new D()) {
  const t = P0(n), r = Gr(S.Moon, t), i = jt(r.north, Bt), a = xt(r.spin), c = zr.set(0, 0, 1).cross(i).normalize().applyQuaternion(Br.setFromAxisAngle(i, a)).normalize(), s = kr.copy(i).cross(c).normalize();
  return e.makeBasis(c, s, i);
}
function ue(n, e, t, r, i) {
  const a = Ir(n, e, !1);
  if (jt(a, t), r != null) {
    const o = Xe(e, Vr).transpose();
    t.sub(
      Bt.copy(r).applyMatrix4(o).multiplyScalar(Fr)
    );
  }
  return t.normalize();
}
function Ui(n, e = new p(), t) {
  return ue(S.Sun, P0(n), e, t);
}
function Gi(n, e = new p(), t) {
  return ue(S.Moon, P0(n), e, t);
}
function Fi(n, e = new p(), t) {
  const r = P0(n);
  return ue(S.Sun, r, e, t).applyMatrix4(
    Xe(r, Wt)
  );
}
function zi(n, e = new p(), t) {
  const r = P0(n);
  return ue(S.Moon, r, e, t).applyMatrix4(
    Xe(r, Wt)
  );
}
function Xt(n) {
  return Math.sqrt(Math.max(n, 0));
}
function jr(n) {
  return Math.max(n, 0);
}
function Xr(n, e, t) {
  const { bottomRadius: r } = n;
  return t < 0 && e ** 2 * (t ** 2 - 1) + r ** 2 >= 0;
}
function Yr(n, e, t) {
  const { topRadius: r } = n, i = e ** 2 * (t ** 2 - 1) + r ** 2;
  return jr(-e * t + Xt(i));
}
function ne(n, e) {
  return 0.5 / e + n * (1 - 1 / e);
}
const Kr = /* @__PURE__ */ new p(), mt = /* @__PURE__ */ new p(), $r = /* @__PURE__ */ new p(), ft = /* @__PURE__ */ new WeakMap();
function qr(n) {
  be(n.image);
  let e = nt(n.image.data) ? n.image.data : nt(n.userData.imageData) ? n.userData.imageData : void 0;
  if (n.type === k && e instanceof Uint16Array) {
    const t = ft.get(e.buffer);
    t == null ? (e = new Mt(e.buffer), ft.set(e.buffer, e)) : e = t;
  }
  return e;
}
function J0(n, e, t) {
  const r = e * 4;
  return t.set(n[r], n[r + 1], n[r + 2]);
}
function Yt(n, e, t) {
  const r = qr(n);
  if (r == null)
    return t.setScalar(0);
  be(n.image);
  const { width: i, height: a } = n.image, o = tt(e.x, 0, 1) * (i - 1), c = tt(e.y, 0, 1) * (a - 1), s = Math.floor(o), l = Math.floor(c), h = o - s, m = c - l, f = h, v = m, T = s % i, E = (T + 1) % i, x = l % a, y = (x + 1) % a, I = J0(r, x * i + T, Kr), N = J0(r, x * i + E, mt), b = I.lerp(N, f), U = J0(r, y * i + T, mt), z = J0(r, y * i + E, $r), F = U.lerp(z, f);
  return t.copy(b.lerp(F, v));
}
function Zr(n, e, t, r) {
  const { topRadius: i, bottomRadius: a } = n, o = Math.sqrt(i ** 2 - a ** 2), c = Xt(e ** 2 - a ** 2), s = Yr(n, e, t), l = i - e, h = c + o, m = (s - l) / (h - l), f = c / o;
  return r.set(
    ne(m, h0),
    ne(f, m0)
  );
}
const Jr = /* @__PURE__ */ new p(), ve = /* @__PURE__ */ new p(), Qr = /* @__PURE__ */ new oe();
function ei(n, e, t, r = new ae(), {
  ellipsoid: i = F0.WGS84,
  correctAltitude: a = !0
} = {}, o = n0.DEFAULT) {
  const c = Jr.copy(e);
  if (a) {
    const T = i.projectOnSurface(
      e,
      ve
    );
    T != null && c.sub(
      i.getOsculatingSphereCenter(
        T,
        o.bottomRadius,
        ve
      )
    );
  }
  const s = ve;
  let l = c.length(), h = c.dot(t);
  const { topRadius: m } = o, f = -h - Math.sqrt(h ** 2 - l ** 2 + m ** 2);
  if (f > 0 && (l = m, h += f), l > m)
    s.set(1, 1, 1);
  else {
    const T = h / l;
    if (Xr(o, l, T))
      s.setScalar(0);
    else {
      const x = Zr(o, l, T, Qr);
      Yt(n, x, s);
    }
  }
  const v = s.multiply(o.solarIrradiance).multiply(o.sunRadianceToRelativeLuminance);
  return r.setFromVector3(v);
}
const ti = `// Based on: https://github.com/pmndrs/postprocessing/blob/v6.37.4/src/materials/glsl/depth-mask.frag

#include <common>
#include <packing>

#include "core/depth"

#ifdef GL_FRAGMENT_PRECISION_HIGH
uniform highp sampler2D depthBuffer0;
uniform highp sampler2D depthBuffer1;
#else // GL_FRAGMENT_PRECISION_HIGH
uniform mediump sampler2D depthBuffer0;
uniform mediump sampler2D depthBuffer1;
#endif // GL_FRAGMENT_PRECISION_HIGH

uniform sampler2D inputBuffer;
uniform vec2 cameraNearFar;
uniform bool inverted;

float getViewZ(const float depth) {
  #ifdef PERSPECTIVE_CAMERA
  return perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
  #else // PERSPECTIVE_CAMERA
  return orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
  #endif // PERSPECTIVE_CAMERA
}

varying vec2 vUv;

void main() {
  vec2 depth;

  #if DEPTH_PACKING_0 == 3201
  depth.x = unpackRGBAToDepth(texture2D(depthBuffer0, vUv));
  #else // DEPTH_PACKING_0 == 3201
  depth.x = reverseLogDepth(texture2D(depthBuffer0, vUv).r, cameraNearFar.x, cameraNearFar.y);
  #endif // DEPTH_PACKING_0 == 3201

  #if DEPTH_PACKING_1 == 3201
  depth.y = unpackRGBAToDepth(texture2D(depthBuffer1, vUv));
  #else // DEPTH_PACKING_1 == 3201
  depth.y = reverseLogDepth(texture2D(depthBuffer1, vUv).r, cameraNearFar.x, cameraNearFar.y);
  #endif // DEPTH_PACKING_1 == 3201

  bool isMaxDepth = depth.x == 1.0;

  #ifdef PERSPECTIVE_CAMERA
  depth.x = viewZToOrthographicDepth(getViewZ(depth.x), cameraNearFar.x, cameraNearFar.y);
  depth.y = viewZToOrthographicDepth(getViewZ(depth.y), cameraNearFar.x, cameraNearFar.y);
  #endif // PERSPECTIVE_CAMERA

  #if DEPTH_TEST_STRATEGY == 0
  // Decide based on depth test.
  bool keep = depthTest(depth.x, depth.y);

  #elif DEPTH_TEST_STRATEGY == 1
  // Always keep max depth.
  bool keep = isMaxDepth || depthTest(depth.x, depth.y);

  #else // DEPTH_TEST_STRATEGY
  // Always discard max depth.
  bool keep = !isMaxDepth && depthTest(depth.x, depth.y);

  #endif // DEPTH_TEST_STRATEGY

  if (inverted) {
    keep = !keep;
  }
  if (keep) {
    gl_FragColor = texture2D(inputBuffer, vUv);
  } else {
    discard;
  }
}
`;
class ki extends tn {
  constructor(e, t) {
    super("LightingMaskPass"), this.selection = new nn(), this.needsSwap = !1, this.needsDepthTexture = !0, this.renderPass = new rn(e, t, new ln()), this.renderPass.ignoreBackground = !0, this.renderPass.skipShadowMapUpdate = !0, this.renderPass.selection = this.selection, this.depthTexture = new dn(1, 1, hn), this.renderTarget = new Et(1, 1, {
      format: mn,
      depthTexture: this.depthTexture
    }), this.depthCopyPass0 = new Ze({ depthPacking: X0 }), this.depthCopyPass1 = new Ze({ depthPacking: X0 }), this.clearPass = new an(!0, !1, !1), this.clearPass.overrideClearColor = new ae(16777215), this.clearPass.overrideClearAlpha = 1;
    const r = new on();
    r.fragmentShader = W(ti, {
      core: { depth: yt }
    }), r.uniforms.inverted = new d(!1), r.copyCameraSettings(t), r.depthBuffer0 = this.depthCopyPass0.texture, r.depthPacking0 = X0, r.depthBuffer1 = this.depthCopyPass1.texture, r.depthPacking1 = X0, r.depthMode = fn, r.maxDepthStrategy = sn.DISCARD_MAX_DEPTH, this.depthMaskMaterial = r, this.depthMaskPass = new cn(r);
  }
  // eslint-disable-next-line accessor-pairs
  set mainScene(e) {
    this.renderPass.mainScene = e;
  }
  // eslint-disable-next-line accessor-pairs
  set mainCamera(e) {
    this.renderPass.mainCamera = e, this.depthMaskMaterial.copyCameraSettings(e);
  }
  initialize(e, t, r) {
    this.renderPass.initialize(e, t, r), this.clearPass.initialize(e, t, r), this.depthMaskPass.initialize(e, t, r);
  }
  setDepthTexture(e, t = gn) {
    this.depthCopyPass0.setDepthTexture(e, t), this.depthCopyPass1.setDepthTexture(this.depthTexture, t);
  }
  render(e, t, r, i, a) {
    const o = e.autoClear;
    e.autoClear = !1, this.depthCopyPass0.render(e, null, null), this.renderPass.render(e, this.renderTarget, null), this.depthCopyPass1.render(e, null, null), this.clearPass.render(e, this.renderTarget, null), this.depthMaskPass.render(e, null, this.renderTarget), e.autoClear = o;
  }
  setSize(e, t) {
    this.renderTarget.setSize(e, t), this.depthCopyPass0.setSize(e, t), this.depthCopyPass1.setSize(e, t);
  }
  get texture() {
    return this.renderTarget.texture;
  }
  get selectionLayer() {
    return this.selection.layer;
  }
  set selectionLayer(e) {
    this.selection.layer = e;
  }
  get inverted() {
    return this.depthMaskMaterial.uniforms.inverted.value;
  }
  set inverted(e) {
    this.depthMaskMaterial.uniforms.inverted.value = e;
  }
}
const ni = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"
#include "bruneton/common"
#include "bruneton/precompute"

uniform AtmosphereParameters ATMOSPHERE;

uniform sampler2D transmittanceTexture;

layout(location = 0) out vec4 outputColor;

void main() {
  vec3 deltaIrradiance;
  vec3 irradiance;
  deltaIrradiance = ComputeDirectIrradianceTexture(
    ATMOSPHERE,
    transmittanceTexture,
    gl_FragCoord.xy
  );
  irradiance = vec3(0.0);
  outputColor = vec4(OUTPUT, 1.0);
}
`, ri = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"
#include "bruneton/common"
#include "bruneton/precompute"

uniform AtmosphereParameters ATMOSPHERE;

uniform mat3 luminanceFromRadiance;
uniform sampler3D singleRayleighScatteringTexture;
uniform sampler3D singleMieScatteringTexture;
uniform sampler3D multipleScatteringTexture;
uniform int scatteringOrder;

layout(location = 0) out vec4 outputColor;

void main() {
  vec3 deltaIrradiance;
  vec3 irradiance;
  deltaIrradiance = ComputeIndirectIrradianceTexture(
    ATMOSPHERE,
    singleRayleighScatteringTexture,
    singleMieScatteringTexture,
    multipleScatteringTexture,
    gl_FragCoord.xy,
    scatteringOrder
  );
  irradiance = luminanceFromRadiance * deltaIrradiance;
  outputColor = vec4(OUTPUT, 1.0);
}
`, ii = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"
#include "bruneton/common"
#include "bruneton/precompute"

uniform AtmosphereParameters ATMOSPHERE;

uniform mat3 luminanceFromRadiance;
uniform sampler2D transmittanceTexture;
uniform sampler3D scatteringDensityTexture;
uniform int layer;

layout(location = 0) out vec4 outputColor;

void main() {
  vec4 deltaMultipleScattering;
  vec4 scattering;
  float nu;
  deltaMultipleScattering.rgb = ComputeMultipleScatteringTexture(
    ATMOSPHERE,
    transmittanceTexture,
    scatteringDensityTexture,
    vec3(gl_FragCoord.xy, float(layer) + 0.5),
    nu
  );
  deltaMultipleScattering.a = 1.0;
  scattering = vec4(
    luminanceFromRadiance * deltaMultipleScattering.rgb / RayleighPhaseFunction(nu),
    0.0
  );
  outputColor = OUTPUT;
}
`, ai = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"
#include "bruneton/common"
#include "bruneton/precompute"

uniform AtmosphereParameters ATMOSPHERE;

uniform sampler2D transmittanceTexture;
uniform sampler3D singleRayleighScatteringTexture;
uniform sampler3D singleMieScatteringTexture;
uniform sampler3D multipleScatteringTexture;
uniform sampler2D irradianceTexture;
uniform int scatteringOrder;
uniform int layer;

layout(location = 0) out vec4 scatteringDensity;

void main() {
  scatteringDensity.rgb = ComputeScatteringDensityTexture(
    ATMOSPHERE,
    transmittanceTexture,
    singleRayleighScatteringTexture,
    singleMieScatteringTexture,
    multipleScatteringTexture,
    irradianceTexture,
    vec3(gl_FragCoord.xy, float(layer) + 0.5),
    scatteringOrder
  );
  scatteringDensity.a = 1.0;
}
`, oi = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"
#include "bruneton/common"
#include "bruneton/precompute"

uniform AtmosphereParameters ATMOSPHERE;

uniform mat3 luminanceFromRadiance;
uniform sampler2D transmittanceTexture;
uniform int layer;

layout(location = 0) out vec4 outputColor;

void main() {
  vec4 deltaRayleigh;
  vec4 deltaMie;
  vec4 scattering;
  vec4 singleMieScattering;
  ComputeSingleScatteringTexture(
    ATMOSPHERE,
    transmittanceTexture,
    vec3(gl_FragCoord.xy, float(layer) + 0.5),
    deltaRayleigh.rgb,
    deltaMie.rgb
  );
  deltaRayleigh.a = 1.0;
  deltaMie.a = 1.0;
  scattering = vec4(
    luminanceFromRadiance * deltaRayleigh.rgb,
    (luminanceFromRadiance * deltaMie.rgb).r
  );
  singleMieScattering.rgb = luminanceFromRadiance * deltaMie.rgb;
  singleMieScattering.a = 1.0;
  outputColor = OUTPUT;
}
`, si = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"
#include "bruneton/common"
#include "bruneton/precompute"

uniform AtmosphereParameters ATMOSPHERE;

layout(location = 0) out vec4 transmittance;

void main() {
  transmittance.rgb = ComputeTransmittanceToTopAtmosphereBoundaryTexture(
    ATMOSPHERE,
    gl_FragCoord.xy
  );
  transmittance.a = 1.0;
}
`, ci = (
  /* glsl */
  `
  precision highp float;
  in vec2 position;
  void main() {
    gl_Position = vec4(position, 1.0, 1.0);
  }
`
);
function re(n, e, t) {
  const r = new Et(e, t, {
    depthBuffer: !1,
    type: n,
    format: Rt
  }), i = r.texture;
  return i.minFilter = D0, i.magFilter = D0, i.wrapS = U0, i.wrapT = U0, i.colorSpace = _t, r;
}
function C0(n, e, t, r) {
  const i = new Rn(e, t, r, {
    depthBuffer: !1,
    type: n,
    format: Rt
  }), a = i.texture;
  return a.minFilter = D0, a.magFilter = D0, a.wrapS = U0, a.wrapT = U0, a.wrapR = U0, a.colorSpace = _t, i;
}
function ui(n) {
  const e = n[Symbol.iterator]();
  return new Promise((t, r) => {
    const i = () => {
      try {
        const { value: a, done: o } = e.next();
        o === !0 ? t(a) : it(i);
      } catch (a) {
        r(a instanceof Error ? a : new Error());
      }
    };
    it(i);
  });
}
async function gt(n, e, t) {
  const { width: r, height: i } = e, a = t.type === k ? new Uint16Array(r * i * 4) : new Float32Array(r * i * 4);
  await n.readRenderTargetPixelsAsync(
    e,
    0,
    0,
    e.width,
    e.height,
    a
  ), t.userData.imageData = a;
}
class li {
  constructor(e) {
    this.lambdas = new p(), this.luminanceFromRadiance = new w0(), e === k && (this.opticalDepth = re(
      e,
      h0,
      m0
    )), this.deltaIrradiance = re(
      e,
      f0,
      g0
    ), this.deltaRayleighScattering = C0(
      e,
      u0,
      c0,
      s0
    ), this.deltaMieScattering = C0(
      e,
      u0,
      c0,
      s0
    ), this.deltaScatteringDensity = C0(
      e,
      u0,
      c0,
      s0
    ), this.deltaMultipleScattering = this.deltaRayleighScattering;
  }
  dispose() {
    this.opticalDepth?.dispose(), this.deltaIrradiance.dispose(), this.deltaRayleighScattering.dispose(), this.deltaMieScattering.dispose(), this.deltaScatteringDensity.dispose();
  }
}
class R0 extends vt {
  constructor(e) {
    super({
      glslVersion: He,
      vertexShader: ci,
      ...e,
      defines: {
        TRANSMITTANCE_TEXTURE_WIDTH: h0.toFixed(0),
        TRANSMITTANCE_TEXTURE_HEIGHT: m0.toFixed(0),
        SCATTERING_TEXTURE_R_SIZE: Ue.toFixed(0),
        SCATTERING_TEXTURE_MU_SIZE: Ge.toFixed(0),
        SCATTERING_TEXTURE_MU_S_SIZE: Fe.toFixed(0),
        SCATTERING_TEXTURE_NU_SIZE: ze.toFixed(0),
        IRRADIANCE_TEXTURE_WIDTH: f0.toFixed(0),
        IRRADIANCE_TEXTURE_HEIGHT: g0.toFixed(0),
        ...e.defines
      }
    });
  }
  // eslint-disable-next-line accessor-pairs
  set additive(e) {
    this.transparent = e, this.blending = e ? vn : En, this.blendEquation = Je, this.blendEquationAlpha = Je, this.blendSrc = Y0, this.blendDst = Y0, this.blendSrcAlpha = Y0, this.blendDstAlpha = Y0;
  }
  setUniforms(e) {
    const t = this.uniforms;
    t.luminanceFromRadiance != null && t.luminanceFromRadiance.value.copy(e.luminanceFromRadiance), t.singleRayleighScatteringTexture != null && (t.singleRayleighScatteringTexture.value = e.deltaRayleighScattering.texture), t.singleMieScatteringTexture != null && (t.singleMieScatteringTexture.value = e.deltaMieScattering.texture), t.multipleScatteringTexture != null && (t.multipleScatteringTexture.value = e.deltaMultipleScattering.texture), t.scatteringDensityTexture != null && (t.scatteringDensityTexture.value = e.deltaScatteringDensity.texture), t.irradianceTexture != null && (t.irradianceTexture.value = e.deltaIrradiance.texture);
  }
}
class Vi {
  constructor(e, {
    type: t = At(e) ? _e : k,
    combinedScattering: r = !0,
    higherOrderScattering: i = !0
  } = {}) {
    this.transmittanceMaterial = new R0({
      fragmentShader: W(si, {
        bruneton: {
          common: $,
          definitions: K,
          precompute: S0
        }
      })
    }), this.directIrradianceMaterial = new R0({
      fragmentShader: W(ni, {
        bruneton: {
          common: $,
          definitions: K,
          precompute: S0
        }
      }),
      uniforms: {
        transmittanceTexture: new d(null)
      }
    }), this.singleScatteringMaterial = new R0({
      fragmentShader: W(oi, {
        bruneton: {
          common: $,
          definitions: K,
          precompute: S0
        }
      }),
      uniforms: {
        luminanceFromRadiance: new d(new w0()),
        transmittanceTexture: new d(null),
        layer: new d(0)
      }
    }), this.scatteringDensityMaterial = new R0({
      fragmentShader: W(ai, {
        bruneton: {
          common: $,
          definitions: K,
          precompute: S0
        }
      }),
      uniforms: {
        transmittanceTexture: new d(null),
        singleRayleighScatteringTexture: new d(null),
        singleMieScatteringTexture: new d(null),
        multipleScatteringTexture: new d(null),
        irradianceTexture: new d(null),
        scatteringOrder: new d(0),
        layer: new d(0)
      }
    }), this.indirectIrradianceMaterial = new R0({
      fragmentShader: W(ri, {
        bruneton: {
          common: $,
          definitions: K,
          precompute: S0
        }
      }),
      uniforms: {
        luminanceFromRadiance: new d(new w0()),
        singleRayleighScatteringTexture: new d(null),
        singleMieScatteringTexture: new d(null),
        multipleScatteringTexture: new d(null),
        scatteringOrder: new d(0)
      }
    }), this.multipleScatteringMaterial = new R0({
      fragmentShader: W(ii, {
        bruneton: {
          common: $,
          definitions: K,
          precompute: S0
        }
      }),
      uniforms: {
        luminanceFromRadiance: new d(new w0()),
        transmittanceTexture: new d(null),
        scatteringDensityTexture: new d(null),
        layer: new d(0)
      }
    }), this.mesh = new pn(new Tn(2, 2)), this.scene = new Sn().add(this.mesh), this.camera = new St(), this.updating = !1, this.renderer = e, this.type = t, this.transmittanceRenderTarget = re(
      t,
      h0,
      m0
    ), this.scatteringRenderTarget = C0(
      t,
      u0,
      c0,
      s0
    ), this.irradianceRenderTarget = re(
      t,
      f0,
      g0
    ), r || (this.singleMieScatteringRenderTarget = C0(
      t,
      u0,
      c0,
      s0
    )), i && (this.higherOrderScatteringRenderTarget = C0(
      t,
      u0,
      c0,
      s0
    )), this.textures = {
      transmittanceTexture: this.transmittanceRenderTarget.texture,
      scatteringTexture: this.scatteringRenderTarget.texture,
      irradianceTexture: this.irradianceRenderTarget.texture,
      singleMieScatteringTexture: this.singleMieScatteringRenderTarget?.texture,
      higherOrderScatteringTexture: this.higherOrderScatteringRenderTarget?.texture
    };
  }
  render3DRenderTarget(e, t) {
    for (let r = 0; r < e.depth; ++r)
      t.uniforms.layer.value = r, this.renderer.setRenderTarget(e, r), this.renderer.render(this.scene, this.camera);
  }
  computeTransmittance(e) {
    const t = this.transmittanceMaterial;
    delete t.defines.TRANSMITTANCE_PRECISION_LOG, t.needsUpdate = !0, this.mesh.material = t, this.renderer.setRenderTarget(e.renderTarget), this.renderer.render(this.scene, this.camera);
  }
  computeOpticalDepth(e) {
    const t = this.transmittanceMaterial;
    t.defines.TRANSMITTANCE_PRECISION_LOG = "1", t.needsUpdate = !0, this.mesh.material = t, this.renderer.setRenderTarget(e.renderTarget), this.renderer.render(this.scene, this.camera);
  }
  computeDirectIrradiance(e) {
    const t = this.directIrradianceMaterial;
    t.defines.OUTPUT = e.output, t.additive = e.additive, this.type === k ? t.defines.TRANSMITTANCE_PRECISION_LOG = "1" : delete t.defines.TRANSMITTANCE_PRECISION_LOG, t.needsUpdate = !0;
    const r = t.uniforms;
    r.transmittanceTexture.value = e.context.opticalDepth?.texture ?? this.transmittanceRenderTarget.texture, this.mesh.material = t, this.renderer.setRenderTarget(e.renderTarget), this.renderer.render(this.scene, this.camera);
  }
  computeSingleScattering(e) {
    const t = this.singleScatteringMaterial;
    t.defines.OUTPUT = e.output, t.additive = e.additive, this.type === k ? t.defines.TRANSMITTANCE_PRECISION_LOG = "1" : delete t.defines.TRANSMITTANCE_PRECISION_LOG, t.needsUpdate = !0;
    const r = t.uniforms;
    r.transmittanceTexture.value = e.context.opticalDepth?.texture ?? this.transmittanceRenderTarget.texture, t.setUniforms(e.context), this.mesh.material = t, this.render3DRenderTarget(e.renderTarget, t);
  }
  computeScatteringDensity(e) {
    const t = this.scatteringDensityMaterial;
    this.type === k ? t.defines.TRANSMITTANCE_PRECISION_LOG = "1" : delete t.defines.TRANSMITTANCE_PRECISION_LOG, t.needsUpdate = !0;
    const r = t.uniforms;
    r.transmittanceTexture.value = e.context.opticalDepth?.texture ?? this.transmittanceRenderTarget.texture, r.scatteringOrder.value = e.scatteringOrder, t.setUniforms(e.context), this.mesh.material = t, this.render3DRenderTarget(e.renderTarget, t);
  }
  computeIndirectIrradiance(e) {
    const t = this.indirectIrradianceMaterial;
    t.defines.OUTPUT = e.output, t.additive = e.additive, t.needsUpdate = !0;
    const r = t.uniforms;
    r.scatteringOrder.value = e.scatteringOrder - 1, t.setUniforms(e.context), this.mesh.material = t, this.renderer.setRenderTarget(e.renderTarget), this.renderer.render(this.scene, this.camera);
  }
  computeMultipleScattering(e) {
    const t = this.multipleScatteringMaterial;
    t.defines.OUTPUT = e.output, t.additive = e.additive, this.type === k ? t.defines.TRANSMITTANCE_PRECISION_LOG = "1" : delete t.defines.TRANSMITTANCE_PRECISION_LOG, t.needsUpdate = !0;
    const r = t.uniforms;
    r.transmittanceTexture.value = e.context.opticalDepth?.texture ?? this.transmittanceRenderTarget.texture, t.setUniforms(e.context), this.mesh.material = t, this.render3DRenderTarget(e.renderTarget, t);
  }
  *precompute(e, t) {
    this.computeTransmittance({
      renderTarget: this.transmittanceRenderTarget
    }), this.type === k && (Gn(e.opticalDepth != null), this.computeOpticalDepth({
      renderTarget: e.opticalDepth
    })), this.computeDirectIrradiance({
      renderTarget: e.deltaIrradiance,
      context: e,
      output: "deltaIrradiance",
      additive: !1
    }), this.computeDirectIrradiance({
      renderTarget: this.irradianceRenderTarget,
      context: e,
      output: "irradiance",
      additive: t
    }), this.renderer.setRenderTarget(null), yield, this.computeSingleScattering({
      renderTarget: e.deltaRayleighScattering,
      context: e,
      output: "deltaRayleigh",
      additive: !1
    }), this.computeSingleScattering({
      renderTarget: e.deltaMieScattering,
      context: e,
      output: "deltaMie",
      additive: !1
    }), this.computeSingleScattering({
      renderTarget: this.scatteringRenderTarget,
      context: e,
      output: "scattering",
      additive: t
    }), this.singleMieScatteringRenderTarget != null && this.computeSingleScattering({
      renderTarget: this.singleMieScatteringRenderTarget,
      context: e,
      output: "singleMieScattering",
      additive: t
    }), this.renderer.setRenderTarget(null), yield;
    for (let r = 2; r <= 4; ++r)
      this.computeScatteringDensity({
        renderTarget: e.deltaScatteringDensity,
        context: e,
        scatteringOrder: r
      }), this.computeIndirectIrradiance({
        renderTarget: e.deltaIrradiance,
        context: e,
        scatteringOrder: r,
        output: "deltaIrradiance",
        additive: !1
      }), this.computeIndirectIrradiance({
        renderTarget: this.irradianceRenderTarget,
        context: e,
        scatteringOrder: r,
        output: "irradiance",
        additive: !0
      }), this.computeMultipleScattering({
        renderTarget: e.deltaMultipleScattering,
        context: e,
        output: "deltaMultipleScattering",
        additive: !1
      }), this.computeMultipleScattering({
        renderTarget: this.scatteringRenderTarget,
        context: e,
        output: "scattering",
        additive: !0
      }), this.higherOrderScatteringRenderTarget != null && this.computeMultipleScattering({
        renderTarget: this.higherOrderScatteringRenderTarget,
        context: e,
        output: "scattering",
        additive: !0
      }), this.renderer.setRenderTarget(null), yield;
  }
  async update(e = n0.DEFAULT) {
    this.updating = !0;
    const t = e.toUniform();
    this.transmittanceMaterial.uniforms.ATMOSPHERE = t, this.directIrradianceMaterial.uniforms.ATMOSPHERE = t, this.singleScatteringMaterial.uniforms.ATMOSPHERE = t, this.scatteringDensityMaterial.uniforms.ATMOSPHERE = t, this.indirectIrradianceMaterial.uniforms.ATMOSPHERE = t, this.multipleScatteringMaterial.uniforms.ATMOSPHERE = t;
    const r = this.renderer, i = new li(this.type);
    i.lambdas.set(680, 550, 440), i.luminanceFromRadiance.identity();
    const a = r.autoClear;
    return r.autoClear = !1, await ui(this.precompute(i, !1)), r.autoClear = a, i.dispose(), await gt(
      this.renderer,
      this.transmittanceRenderTarget,
      this.transmittanceRenderTarget.texture
    ), await gt(
      this.renderer,
      this.irradianceRenderTarget,
      this.irradianceRenderTarget.texture
    ), this.updating = !1, this.disposeQueue?.(), this.textures;
  }
  dispose(e = {}) {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose(e), this.disposeQueue = void 0;
      };
      return;
    }
    const { textures: t = !0 } = e;
    t || (this.transmittanceRenderTarget.textures.splice(0, 1), this.scatteringRenderTarget.textures.splice(0, 1), this.irradianceRenderTarget.textures.splice(0, 1), this.singleMieScatteringRenderTarget?.textures.splice(0, 1), this.higherOrderScatteringRenderTarget?.textures.splice(0, 1)), this.transmittanceRenderTarget.dispose(), this.scatteringRenderTarget.dispose(), this.irradianceRenderTarget.dispose(), this.singleMieScatteringRenderTarget?.dispose(), this.higherOrderScatteringRenderTarget?.dispose(), this.transmittanceMaterial.dispose(), this.directIrradianceMaterial.dispose(), this.singleScatteringMaterial.dispose(), this.scatteringDensityMaterial.dispose(), this.indirectIrradianceMaterial.dispose(), this.multipleScatteringMaterial.dispose(), this.mesh.geometry.dispose();
  }
}
function di(n) {
  var e = [];
  if (n.length === 0)
    return "";
  if (typeof n[0] != "string")
    throw new TypeError("Url must be a string. Received " + n[0]);
  if (n[0].match(/^[^/:]+:\/*$/) && n.length > 1) {
    var t = n.shift();
    n[0] = t + n[0];
  }
  n[0].match(/^file:\/\/\//) ? n[0] = n[0].replace(/^([^/:]+):\/*/, "$1:///") : n[0] = n[0].replace(/^([^/:]+):\/*/, "$1://");
  for (var r = 0; r < n.length; r++) {
    var i = n[r];
    if (typeof i != "string")
      throw new TypeError("Url must be a string. Received " + i);
    i !== "" && (r > 0 && (i = i.replace(/^[\/]+/, "")), r < n.length - 1 ? i = i.replace(/[\/]+$/, "") : i = i.replace(/[\/]+$/, "/"), e.push(i));
  }
  var a = e.join("/");
  a = a.replace(/\/(\?|&|#[^!])/g, "$1");
  var o = a.split("?");
  return a = o.shift() + (o.length > 0 ? "?" : "") + o.join("&"), a;
}
function hi() {
  var n;
  return typeof arguments[0] == "object" ? n = arguments[0] : n = [].slice.call(arguments), di(n);
}
const pt = {
  width: h0,
  height: m0
}, _0 = {
  width: u0,
  height: c0,
  depth: s0
}, Tt = {
  width: f0,
  height: g0
};
class Bi extends _n {
  constructor({
    format: e = "exr",
    type: t = k,
    combinedScattering: r = !0,
    higherOrderScattering: i = !0
  } = {}, a) {
    super(a), this.format = e, this.type = t, this.combinedScattering = r, this.higherOrderScattering = i;
  }
  setType(e) {
    return this.type = At(e) ? _e : k, this;
  }
  load(e, t, r, i) {
    const a = {}, o = ({
      key: c,
      loader: s,
      path: l
    }) => (s.setRequestHeader(this.requestHeader), s.setPath(this.path), s.setWithCredentials(this.withCredentials), s.load(
      hi(e, l),
      (h) => {
        h.type = this.type, this.type === _e && (be(h.image), h.image.data != null && (h.image.data = new Float32Array(
          new Mt(h.image.data?.buffer)
        ))), h.minFilter = D0, h.magFilter = D0, a[`${c}Texture`] = h, a.irradianceTexture != null && a.scatteringTexture != null && a.transmittanceTexture != null && (this.combinedScattering || a.singleMieScatteringTexture != null) && (!this.higherOrderScattering || a.higherOrderScatteringTexture != null) && t?.(a);
      },
      r,
      i
    ));
    return this.format === "exr" ? {
      transmittanceTexture: o({
        key: "transmittance",
        loader: new rt(pt, this.manager),
        path: "transmittance.exr"
      }),
      scatteringTexture: o({
        key: "scattering",
        loader: new Te(_0, this.manager),
        path: "scattering.exr"
      }),
      irradianceTexture: o({
        key: "irradiance",
        loader: new rt(Tt, this.manager),
        path: "irradiance.exr"
      }),
      singleMieScatteringTexture: this.combinedScattering ? void 0 : o({
        key: "singleMieScattering",
        loader: new Te(_0, this.manager),
        path: "single_mie_scattering.exr"
      }),
      higherOrderScatteringTexture: this.higherOrderScattering ? o({
        key: "higherOrderScattering",
        loader: new Te(_0, this.manager),
        path: "higher_order_scattering.exr"
      }) : void 0
    } : {
      transmittanceTexture: o({
        key: "transmittance",
        loader: new O0(
          Qe,
          L0,
          pt,
          this.manager
        ),
        path: "transmittance.bin"
      }),
      scatteringTexture: o({
        key: "scattering",
        loader: new O0(
          ge,
          L0,
          _0,
          this.manager
        ),
        path: "scattering.bin"
      }),
      irradianceTexture: o({
        key: "irradiance",
        loader: new O0(
          Qe,
          L0,
          Tt,
          this.manager
        ),
        path: "irradiance.bin"
      }),
      singleMieScatteringTexture: this.combinedScattering ? void 0 : o({
        key: "singleMieScattering",
        loader: new O0(
          ge,
          L0,
          _0,
          this.manager
        ),
        path: "single_mie_scattering.bin"
      }),
      higherOrderScatteringTexture: this.higherOrderScattering ? o({
        key: "higherOrderScattering",
        loader: new O0(
          ge,
          L0,
          _0,
          this.manager
        ),
        path: "higher_order_scattering.bin"
      }) : void 0
    };
  }
}
function mi({ topRadius: n, bottomRadius: e }, t, r, i) {
  const a = (t - e) / (n - e), o = r * 0.5 + 0.5;
  return i.set(
    ne(o, f0),
    ne(a, g0)
  );
}
const fi = 1 / Math.sqrt(Math.PI), Ee = Math.sqrt(3) / (2 * Math.sqrt(Math.PI)), gi = /* @__PURE__ */ new p(), Re = /* @__PURE__ */ new p(), pi = /* @__PURE__ */ new oe(), Ti = /* @__PURE__ */ new w0(), Si = {
  ellipsoid: F0.WGS84,
  correctAltitude: !0
};
class Wi extends xn {
  constructor(e, t = n0.DEFAULT) {
    super(), this.atmosphere = t, this.worldToECEFMatrix = new D();
    const {
      irradianceTexture: r = null,
      ellipsoid: i,
      correctAltitude: a,
      sunDirection: o
    } = { ...Si, ...e };
    this.irradianceTexture = r, this.ellipsoid = i, this.correctAltitude = a, this.sunDirection = o?.clone() ?? new p();
  }
  update() {
    if (this.irradianceTexture == null)
      return;
    const e = this.worldToECEFMatrix, t = Ti.setFromMatrix4(e).transpose(), i = this.getWorldPosition(gi).applyMatrix4(e);
    if (this.correctAltitude) {
      const m = this.ellipsoid.projectOnSurface(
        i,
        Re
      );
      m != null && i.add(
        ke(
          m,
          this.atmosphere.bottomRadius,
          this.ellipsoid,
          Re
        )
      );
    }
    const a = i.length(), o = i.dot(this.sunDirection) / a, c = mi(this.atmosphere, a, o, pi), s = Yt(this.irradianceTexture, c, Re);
    s.multiply(this.atmosphere.skyRadianceToRelativeLuminance);
    const l = this.ellipsoid.getSurfaceNormal(i).applyMatrix3(t), h = this.sh.coefficients;
    h[0].copy(s).multiplyScalar(fi), h[1].copy(s).multiplyScalar(Ee * l.y), h[2].copy(s).multiplyScalar(Ee * l.z), h[3].copy(s).multiplyScalar(Ee * l.x);
  }
}
const vi = `precision highp float;
precision highp sampler3D;

#define RECIPROCAL_PI 0.3183098861837907

#include "core/raySphereIntersection"

#include "bruneton/definitions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "bruneton/common"
#include "bruneton/runtime"

uniform vec3 sunDirection;
uniform float cosSunAngularRadius;
uniform vec3 moonDirection;
uniform float moonAngularRadius;
uniform float lunarRadianceScale;
uniform vec3 groundAlbedo;

#include "sky"

#ifdef HAS_SHADOW_LENGTH
uniform sampler2D shadowLengthBuffer;
#endif // HAS_SHADOW_LENGTH

in vec2 vUv;
in vec3 vCameraPosition;
in vec3 vRayDirection;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

void main() {
  float shadowLength = 0.0;
  #ifdef HAS_SHADOW_LENGTH
  shadowLength = texture(shadowLengthBuffer, vUv).r;
  #endif // HAS_SHADOW_LENGTH

  vec3 cameraPosition = vCameraPosition;
  vec3 rayDirection = normalize(vRayDirection);
  vec3 dRDdx = dFdx(rayDirection);
  vec3 dRDdy = dFdy(rayDirection);
  float fragmentAngle = length(dRDdx + dRDdy) / length(rayDirection);

  #ifdef GROUND_ALBEDO

  float r = length(cameraPosition);
  float mu = dot(cameraPosition, rayDirection) / r;
  bool intersectsGround = RayIntersectsGround(ATMOSPHERE, r, mu);
  if (intersectsGround) {
    float distanceToGround = raySphereFirstIntersection(
      cameraPosition,
      rayDirection,
      ATMOSPHERE.bottom_radius
    );
    vec3 groundPosition = rayDirection * distanceToGround + cameraPosition;
    vec3 surfaceNormal = normalize(groundPosition);
    vec3 skyIrradiance;
    vec3 sunIrradiance = GetSunAndSkyIrradiance(
      cameraPosition,
      surfaceNormal,
      sunDirection,
      skyIrradiance
    );
    vec3 transmittance;
    vec3 inscatter = GetSkyRadianceToPoint(
      cameraPosition,
      ATMOSPHERE.bottom_radius * surfaceNormal,
      shadowLength,
      sunDirection,
      transmittance
    );
    vec3 radiance = groundAlbedo * RECIPROCAL_PI * (sunIrradiance + skyIrradiance);
    outputColor.rgb = radiance * transmittance + inscatter;
  } else {
    outputColor.rgb = getSkyRadiance(
      cameraPosition,
      rayDirection,
      shadowLength,
      sunDirection,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      fragmentAngle
    );
  }

  #else // GROUND_ALBEDO

  outputColor.rgb = getSkyRadiance(
    cameraPosition,
    rayDirection,
    shadowLength,
    sunDirection,
    moonDirection,
    moonAngularRadius,
    lunarRadianceScale,
    fragmentAngle
  );

  #endif // GROUND_ALBEDO

  outputColor.a = 1.0;

  #include <mrt_output>
}
`, Ei = `precision highp float;
precision highp sampler3D;

uniform mat4 inverseProjectionMatrix;
uniform mat4 inverseViewMatrix;
uniform vec3 cameraPosition;
uniform mat4 worldToECEFMatrix;
uniform vec3 altitudeCorrection;

layout(location = 0) in vec3 position;

out vec2 vUv;
out vec3 vCameraPosition;
out vec3 vRayDirection;

void getCameraRay(out vec3 origin, out vec3 direction) {
  bool isPerspective = inverseProjectionMatrix[2][3] != 0.0; // 4th entry in the 3rd column

  if (isPerspective) {
    // Calculate the camera ray for a perspective camera.
    vec4 viewPosition = inverseProjectionMatrix * vec4(position, 1.0);
    vec4 worldDirection = inverseViewMatrix * vec4(viewPosition.xyz, 0.0);
    origin = cameraPosition;
    direction = worldDirection.xyz;
  } else {
    // Unprojected points to calculate direction.
    vec4 nearPoint = inverseProjectionMatrix * vec4(position.xy, -1.0, 1.0);
    vec4 farPoint = inverseProjectionMatrix * vec4(position.xy, -0.9, 1.0);
    nearPoint /= nearPoint.w;
    farPoint /= farPoint.w;

    // Calculate world values
    vec4 worldDirection = inverseViewMatrix * vec4(farPoint.xyz - nearPoint.xyz, 0.0);
    vec4 worldOrigin = inverseViewMatrix * nearPoint;

    // Outputs
    direction = worldDirection.xyz;
    origin = worldOrigin.xyz;
  }
}

void main() {
  vUv = position.xy * 0.5 + 0.5;

  vec3 direction, origin;
  getCameraRay(origin, direction);

  vec3 cameraPositionECEF = (worldToECEFMatrix * vec4(origin, 1.0)).xyz;
  vCameraPosition = (cameraPositionECEF + altitudeCorrection) * METER_TO_LENGTH_UNIT;
  vRayDirection = (worldToECEFMatrix * vec4(direction, 0.0)).xyz;

  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
var Ri = Object.defineProperty, Ye = (n, e, t, r) => {
  for (var i = void 0, a = n.length - 1, o; a >= 0; a--)
    (o = n[a]) && (i = o(e, t, i) || i);
  return i && Ri(e, t, i), i;
};
const _i = {
  ...Be,
  sun: !0,
  moon: !0,
  moonAngularRadius: 45e-4,
  // ≈ 15.5 arcminutes
  lunarRadianceScale: 1,
  ground: !0,
  groundAlbedo: new ae(0)
};
class Ke extends se {
  constructor(e) {
    const {
      sun: t,
      moon: r,
      moonDirection: i,
      moonAngularRadius: a,
      lunarRadianceScale: o,
      ground: c,
      groundAlbedo: s,
      ...l
    } = { ..._i, ...e };
    super({
      name: "SkyMaterial",
      glslVersion: He,
      vertexShader: Ei,
      fragmentShader: W(vi, {
        core: { raySphereIntersection: wt },
        bruneton: {
          common: $,
          definitions: K,
          runtime: Ve
        },
        sky: Ct
      }),
      ...l,
      uniforms: {
        inverseProjectionMatrix: new d(new D()),
        inverseViewMatrix: new d(new D()),
        moonDirection: new d(i?.clone() ?? new p()),
        moonAngularRadius: new d(a),
        lunarRadianceScale: new d(o),
        groundAlbedo: new d(s.clone()),
        shadowLengthBuffer: new d(null),
        ...l.uniforms
      },
      defines: {
        PERSPECTIVE_CAMERA: "1"
      },
      depthWrite: !1,
      depthTest: !0
    }), this.shadowLength = null, this.sun = t, this.moon = r, this.ground = c;
  }
  onBeforeRender(e, t, r, i, a, o) {
    super.onBeforeRender(e, t, r, i, a, o);
    const { uniforms: c, defines: s } = this;
    c.inverseProjectionMatrix.value.copy(r.projectionMatrixInverse), c.inverseViewMatrix.value.copy(r.matrixWorld);
    const l = s.PERSPECTIVE_CAMERA != null, h = r.isPerspectiveCamera === !0;
    h !== l && (h ? s.PERSPECTIVE_CAMERA = "1" : delete s.PERSPECTIVE_CAMERA, this.needsUpdate = !0);
    const m = this.groundAlbedo, f = s.GROUND_ALBEDO != null, v = m.r !== 0 || m.g !== 0 || m.b !== 0;
    v !== f && (v ? this.defines.GROUND_ALBEDO = "1" : delete this.defines.GROUND_ALBEDO, this.needsUpdate = !0);
    const T = this.shadowLength, E = s.HAS_SHADOW_LENGTH != null, x = T != null;
    x !== E && (x ? s.HAS_SHADOW_LENGTH = "1" : (delete s.HAS_SHADOW_LENGTH, c.shadowLengthBuffer.value = null), this.needsUpdate = !0), x && (c.shadowLengthBuffer.value = T.map);
  }
  get moonDirection() {
    return this.uniforms.moonDirection.value;
  }
  get moonAngularRadius() {
    return this.uniforms.moonAngularRadius.value;
  }
  set moonAngularRadius(e) {
    this.uniforms.moonAngularRadius.value = e;
  }
  get lunarRadianceScale() {
    return this.uniforms.lunarRadianceScale.value;
  }
  set lunarRadianceScale(e) {
    this.uniforms.lunarRadianceScale.value = e;
  }
  get groundAlbedo() {
    return this.uniforms.groundAlbedo.value;
  }
}
Ye([
  w("SUN")
], Ke.prototype, "sun");
Ye([
  w("MOON")
], Ke.prototype, "moon");
Ye([
  w("GROUND")
], Ke.prototype, "ground");
class ji extends Mn {
  constructor(e) {
    super();
    const t = new Int16Array(e), r = new Uint8Array(e), i = new et(t, 5), a = new et(r, 10);
    this.setAttribute(
      "position",
      new pe(i, 3, 0, !0)
    ), this.setAttribute(
      "magnitude",
      new pe(a, 1, 6, !0)
    ), this.setAttribute(
      "color",
      new pe(a, 3, 7, !0)
    ), this.boundingSphere = new An(new p(), 1);
  }
}
const xi = `precision highp float;
precision highp sampler3D;

#include "bruneton/definitions"

uniform AtmosphereParameters ATMOSPHERE;
uniform vec3 SUN_SPECTRAL_RADIANCE_TO_LUMINANCE;
uniform vec3 SKY_SPECTRAL_RADIANCE_TO_LUMINANCE;

uniform sampler2D transmittance_texture;
uniform sampler3D scattering_texture;
uniform sampler2D irradiance_texture;
uniform sampler3D single_mie_scattering_texture;
uniform sampler3D higher_order_scattering_texture;

#include "bruneton/common"
#include "bruneton/runtime"

uniform vec3 sunDirection;

in vec3 vCameraPosition;
in vec3 vRayDirection;

layout(location = 0) out vec4 outputColor;

#include <mrt_layout>

in vec3 vColor;

void main() {
  #if !defined(PERSPECTIVE_CAMERA)
  outputColor = vec4(0.0);
  discard; // Rendering celestial objects without perspective doesn't make sense.
  #endif // !defined(PERSPECTIVE_CAMERA)

  #ifdef BACKGROUND
  vec3 rayDirection = normalize(vRayDirection);
  float r = length(vCameraPosition);
  float mu = dot(vCameraPosition, rayDirection) / r;

  if (RayIntersectsGround(ATMOSPHERE, r, mu)) {
    discard;
  }

  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    vCameraPosition,
    normalize(vRayDirection),
    0.0, // Shadow length
    sunDirection,
    transmittance
  );
  radiance += transmittance * vColor;
  outputColor = vec4(radiance, 1.0);
  #else // BACKGROUND
  outputColor = vec4(vColor, 1.0);
  #endif // BACKGROUND

  #include <mrt_output>
}
`, Mi = `precision highp float;
precision highp sampler3D;

#define saturate(x) clamp(x, 0.0, 1.0)

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 matrixWorld;
uniform vec3 cameraPosition;
uniform float cameraFar;
uniform mat4 worldToECEFMatrix;
uniform vec3 altitudeCorrection;
uniform float pointSize;
uniform vec2 magnitudeRange;
uniform float intensity;

layout(location = 0) in vec3 position;
layout(location = 1) in float magnitude;
layout(location = 2) in vec3 color;

out vec3 vCameraPosition;
out vec3 vRayDirection;
out vec3 vEllipsoidCenter;
out vec3 vColor;

void main() {
  // Magnitude is stored between 0 to 1 within the given range.
  float m = mix(magnitudeRange.x, magnitudeRange.y, magnitude);
  vec3 v = pow(vec3(10.0), -vec3(magnitudeRange, m) / 2.5);
  vColor = vec3(intensity * color);
  vColor *= saturate((v.z - v.y) / (v.x - v.y));

  #ifdef BACKGROUND
  vec3 worldDirection = normalize(matrixWorld * vec4(position, 1.0)).xyz;
  vec3 cameraPositionECEF = (worldToECEFMatrix * vec4(cameraPosition, 1.0)).xyz;
  vCameraPosition = (cameraPositionECEF + altitudeCorrection) * METER_TO_LENGTH_UNIT;
  vRayDirection = (worldToECEFMatrix * vec4(worldDirection, 0.0)).xyz;
  gl_Position =
    projectionMatrix * viewMatrix * vec4(cameraPosition + worldDirection * cameraFar, 1.0);
  #else // BACKGROUND
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif // BACKGROUND

  gl_PointSize = pointSize;
}
`;
var Ai = Object.defineProperty, Kt = (n, e, t, r) => {
  for (var i = void 0, a = n.length - 1, o; a >= 0; a--)
    (o = n[a]) && (i = o(e, t, i) || i);
  return i && Ai(e, t, i), i;
};
const wi = {
  ...Be,
  pointSize: 1,
  intensity: 1,
  background: !0,
  ground: !0
};
class $t extends se {
  constructor(e) {
    const { pointSize: t, intensity: r, background: i, ground: a, ...o } = {
      ...wi,
      ...e
    };
    super({
      name: "StarsMaterial",
      glslVersion: He,
      vertexShader: Mi,
      fragmentShader: W(xi, {
        bruneton: {
          common: $,
          definitions: K,
          runtime: Ve
        }
      }),
      ...o,
      uniforms: {
        projectionMatrix: new d(new D()),
        modelViewMatrix: new d(new D()),
        viewMatrix: new d(new D()),
        matrixWorld: new d(new D()),
        cameraFar: new d(0),
        pointSize: new d(0),
        magnitudeRange: new d(new oe(-2, 8)),
        intensity: new d(r),
        ...o.uniforms
      },
      defines: {
        PERSPECTIVE_CAMERA: "1"
      },
      depthWrite: !0,
      depthTest: !0
    }), this.pointSize = t, this.background = i, this.ground = a;
  }
  onBeforeRender(e, t, r, i, a, o) {
    super.onBeforeRender(e, t, r, i, a, o);
    const c = this.uniforms;
    c.projectionMatrix.value.copy(r.projectionMatrix), c.modelViewMatrix.value.copy(r.modelViewMatrix), c.viewMatrix.value.copy(r.matrixWorldInverse), c.matrixWorld.value.copy(a.matrixWorld), c.cameraFar.value = r.far, c.pointSize.value = this.pointSize * e.getPixelRatio();
    const s = r.isPerspectiveCamera === !0;
    this.defines.PERSPECTIVE_CAMERA != null !== s && (s ? this.defines.PERSPECTIVE_CAMERA = "1" : delete this.defines.PERSPECTIVE_CAMERA, this.needsUpdate = !0);
  }
  get magnitudeRange() {
    return this.uniforms.magnitudeRange.value;
  }
  get intensity() {
    return this.uniforms.intensity.value;
  }
  set intensity(e) {
    this.uniforms.intensity.value = e;
  }
}
Kt([
  w("BACKGROUND")
], $t.prototype, "background");
Kt([
  w("GROUND")
], $t.prototype, "ground");
const yi = /* @__PURE__ */ new p(), Ci = /* @__PURE__ */ new w0(), Di = {
  ellipsoid: F0.WGS84,
  correctAltitude: !0,
  distance: 1
};
class Xi extends wn {
  constructor(e, t = n0.DEFAULT) {
    super(), this.atmosphere = t, this.worldToECEFMatrix = new D();
    const {
      irradianceTexture: r = null,
      ellipsoid: i,
      correctAltitude: a,
      sunDirection: o,
      distance: c
    } = { ...Di, ...e };
    this.transmittanceTexture = r, this.ellipsoid = i, this.correctAltitude = a, this.sunDirection = o?.clone() ?? new p(), this.distance = c;
  }
  update() {
    const e = this.worldToECEFMatrix, t = Ci.setFromMatrix4(e).transpose();
    if (this.position.copy(this.sunDirection).applyMatrix3(t).normalize().multiplyScalar(this.distance).add(this.target.position), this.transmittanceTexture == null)
      return;
    const r = this.target.getWorldPosition(yi).applyMatrix4(e);
    ei(
      this.transmittanceTexture,
      r,
      this.sunDirection,
      this.color,
      {
        ellipsoid: this.ellipsoid,
        correctAltitude: this.correctAltitude
      },
      this.atmosphere
    );
  }
}
export {
  H as A,
  v0 as D,
  ki as L,
  Vi as P,
  Wi as S,
  se as a,
  n0 as b,
  Bi as c,
  Ke as d,
  ji as e,
  $t as f,
  Xi as g,
  Kn as h,
  Be as i,
  Wr as j,
  jt as k,
  Xe as l,
  zi as m,
  Gi as n,
  bi as o,
  Fi as p,
  Ui as q,
  ei as r,
  Si as s,
  _i as t,
  wi as u,
  Di as v,
  P0 as w
};
