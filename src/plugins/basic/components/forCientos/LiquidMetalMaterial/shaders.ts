/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-03-31 15:24:12
 * @LastEditors: Codex
 * @LastEditTime: 2026-03-31 15:24:12
 */

const noiseUtils = /* glsl */ `
vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod(i, 289.0);
    vec4 p = permute(
        permute(
            permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0)
        )
        + i.x + vec4(0.0, i1.x, i2.x, 1.0)
    );

    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;

    return 42.0 * dot(
        m * m,
        vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3))
    );
}

float fbm(vec3 p, float detail) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 5; i++) {
        float enabled = step(float(i) + 0.5, detail);
        value += amplitude * snoise(p * frequency) * enabled;
        frequency *= 2.0;
        amplitude *= 0.5;
    }

    return value * 0.5 + 0.5;
}
`

export const liquidMetalVertexShader = /* glsl */ `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;
varying float vShapeMask;
varying float vRippleHeight;

uniform float uTime;
uniform float uDisplacementStrength;
uniform float uScale;
uniform float uShapeReactivity;
uniform float uDistortion;
uniform float uEdgeProtection;

${noiseUtils}

float getRippleFrequency() {
    return 1.0 / max(uScale * 250.0, 0.001);
}

float getShapeMask(vec3 worldPos, vec3 worldNormal, vec3 viewDirection) {
    float silhouette = 1.0 - abs(dot(normalize(worldNormal), normalize(viewDirection)));
    float reactivePower = mix(0.8, 4.0, clamp(uShapeReactivity / 5.0, 0.0, 1.0));
    return pow(clamp(silhouette, 0.0, 1.0), reactivePower);
}

float getLiquidHeight(vec3 samplePos, float time) {
    float n1 = snoise(samplePos + vec3(time * 0.22, -time * 0.15, time * 0.11));
    float n2 = snoise(samplePos * 1.8 + vec3(-time * 0.08, time * 0.17, -time * 0.13));
    float n3 = fbm(samplePos.yzx * 1.25 + vec3(time * 0.05, -time * 0.07, time * 0.09), 5.0) * 2.0 - 1.0;
    return n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
}

void main() {
    float time = uTime;
    float rippleFrequency = getRippleFrequency();
    vec3 liquidWorldPosition = (modelMatrix * vec4(csm_Position, 1.0)).xyz;
    vec3 liquidWorldNormal = normalize(normalMatrix * csm_Normal);
    vec3 viewDirection = normalize(cameraPosition - liquidWorldPosition);
    float shapeMask = getShapeMask(liquidWorldPosition, liquidWorldNormal, viewDirection);
    float edgeProtection = mix(1.0, 1.0 - shapeMask, clamp(uEdgeProtection, 0.0, 1.0));
    vec3 rippleSample = liquidWorldPosition * rippleFrequency;

    float liquidHeight = getLiquidHeight(rippleSample, time) * (0.35 + clamp(uDistortion, 0.0, 5.0) * 0.25);
    float displacement = liquidHeight * uDisplacementStrength * edgeProtection;

    csm_Position += csm_Normal * displacement;

    vLocalPosition = csm_Position;
    vWorldPosition = (modelMatrix * vec4(csm_Position, 1.0)).xyz;
    vViewDirection = normalize(cameraPosition - vWorldPosition);
    vShapeMask = shapeMask;
    vRippleHeight = liquidHeight;
}
`

export const liquidMetalFragmentShader = /* glsl */ `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;
varying float vShapeMask;
varying float vRippleHeight;

uniform float uTime;
uniform float uLiquidMetalIntensity;
uniform float uNormalStrength;
uniform float uFresnelStrength;
uniform float uScale;
uniform float uShapeReactivity;
uniform float uDistortion;
uniform float uEdgeProtection;

${noiseUtils}

float saturateFloat(float value) {
    return clamp(value, 0.0, 1.0);
}

float getRippleFrequency() {
    return 1.0 / max(uScale * 250.0, 0.001);
}

float getLiquidHeight(vec3 samplePos, float time) {
    float n1 = snoise(samplePos + vec3(time * 0.22, -time * 0.15, time * 0.11));
    float n2 = snoise(samplePos * 1.8 + vec3(-time * 0.08, time * 0.17, -time * 0.13));
    float n3 = fbm(samplePos.yzx * 1.25 + vec3(time * 0.05, -time * 0.07, time * 0.09), 5.0) * 2.0 - 1.0;
    return n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
}

void main() {
    float time = uTime;
    float rippleFrequency = getRippleFrequency();
    float distortionStrength = clamp(uDistortion, 0.0, 5.0);
    float edgeProtection = mix(1.0, 1.0 - vShapeMask, clamp(uEdgeProtection, 0.0, 1.0));

    vec3 sampleBase = vWorldPosition * rippleFrequency;
    float heightX = getLiquidHeight(sampleBase + vec3(0.015, 0.0, 0.0), time);
    float heightY = getLiquidHeight(sampleBase + vec3(0.0, 0.015, 0.0), time);
    float heightZ = getLiquidHeight(sampleBase + vec3(0.0, 0.0, 0.015), time);

    vec3 liquidVector = vec3(heightX - vRippleHeight, heightY - vRippleHeight, heightZ - vRippleHeight);
    liquidVector *= (0.45 + distortionStrength * 0.18) * edgeProtection;

    float reactiveMask = saturateFloat(vShapeMask * (0.35 + clamp(uShapeReactivity, 0.0, 5.0) * 0.2));
    float liquidMask = saturateFloat(0.55 + vRippleHeight * 0.45 + reactiveMask * 0.35);
    float fresnel = pow(1.0 - saturateFloat(dot(normalize(csm_FragNormal + liquidVector * 0.08), normalize(vViewDirection))), 3.0);

    vec3 liquidHighlight = mix(csm_DiffuseColor.rgb, vec3(1.0), saturateFloat(fresnel * uFresnelStrength));

    csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, liquidHighlight, liquidMask * 0.42 * uLiquidMetalIntensity);
    csm_Bump = liquidVector * uNormalStrength * (0.35 + liquidMask * 0.65) * uLiquidMetalIntensity;
    csm_ClearcoatNormal = liquidVector * uNormalStrength * 0.12 * uLiquidMetalIntensity;
    csm_Roughness = clamp(mix(csm_Roughness, csm_Roughness * (0.38 - liquidMask * 0.18) + 0.025, uLiquidMetalIntensity), 0.02, 1.0);
    csm_Metalness = clamp(csm_Metalness + liquidMask * 0.06 * uLiquidMetalIntensity, 0.0, 1.0);
    csm_Clearcoat = clamp(csm_Clearcoat + liquidMask * 0.14 * uLiquidMetalIntensity, 0.0, 1.0);
    csm_ClearcoatRoughness = clamp(csm_ClearcoatRoughness * (1.0 - liquidMask * 0.48 * uLiquidMetalIntensity) + 0.02 * reactiveMask, 0.0, 1.0);
    csm_Iridescence = clamp(csm_Iridescence * (0.85 + liquidMask * 0.3 + fresnel * 0.2), 0.0, 1.0);
}
`
