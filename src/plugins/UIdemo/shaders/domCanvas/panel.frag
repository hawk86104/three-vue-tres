uniform sampler2D contentMap;
uniform sampler2D glassMap;
uniform sampler2D sceneMap;
uniform vec2 viewportOrigin;
uniform vec2 viewportSize;
uniform vec2 pixelSize;
uniform float contentScale;
uniform float opacity;
uniform bool glassEnabled;
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec4 content = texture2D(contentMap, vUv);
  vec4 mask = texture2D(glassMap, vUv);
  float coverage = glassEnabled && mask.r > 0.0 ? mask.a : 0.0;
  // max preserves group opacity: a 50% opaque glass element stays at 50%,
  // instead of blending its opacity twice (content and mask).
  float combinedAlpha = max(content.a, coverage);
  float alpha = combinedAlpha * opacity;
  if (alpha < 0.001) discard;
  vec3 background = vec3(0.0);
  if (coverage > 0.0) {
    vec2 screenUv = (gl_FragCoord.xy - viewportOrigin) / viewportSize;
    // Derivatives map CSS pixels to screen pixels, including perspective/scale.
    vec2 cssPerScreenPixel = vec2(length(dFdx(vUv) * pixelSize), length(dFdy(vUv) * pixelSize));
    vec2 radius = mask.r * 64.0 * contentScale / max(cssPerScreenPixel, vec2(0.001)) / viewportSize;
    float total = 0.0;
    for (int x = -3; x <= 3; x++) {
      for (int y = -3; y <= 3; y++) {
        vec2 offset = vec2(float(x), float(y)) / 3.0;
        float weight = exp(-2.0 * dot(offset, offset));
        background += texture2D(sceneMap, clamp(screenUv + offset * radius, vec2(0.001), vec2(0.999))).rgb * weight;
        total += weight;
      }
    }
    background /= total;
  }
  vec3 premultiplied = content.rgb * content.a + background * (combinedAlpha - content.a);
  gl_FragColor = vec4(premultiplied / max(combinedAlpha, 0.0001), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
