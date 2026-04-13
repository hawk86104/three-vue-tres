uniform sampler2D uCracksMap;
uniform sampler2D uTrailMap;
uniform sampler2D uPerlin;
uniform vec3 uTintColor;   // 目标偏色，如 vec3(1.0, 1.0, 1.0) 为偏白
uniform float uTintStrength; // 0 ~ 1 之间，控制偏色强度

varying vec2 vParallax;
varying vec2 vUv;

void main() {

  float perlin = texture(uPerlin, vUv).r;
  float perlin2 = texture(uPerlin, vUv * 10.).r;
  vec3 trail = texture(uTrailMap, vUv).rgb;
  float cracks = texture(uCracksMap, vUv * 4.).r;
  float nomalization = 1.0;

  vec3 colorBlue = vec3(0.0,0.2,0.25);
  vec3 colorDeepBlue = vec3(0.0,0.01,0.03);
  vec3 colorGreen = vec3(0.1,0.2,0.35);

  float accumulateFrosted = 0.;

  for (int i = 0; i < 50; i++) {
    float aplitude = float(70 - i) / 1.;
    vec2 uv = vUv * 4. + vParallax * 0.002 * float(i + 1);

    float currCrack = (1. - texture(uCracksMap, uv ).r) * aplitude;

    float currTrail = texture(uTrailMap, vUv + vParallax * 0.0025 * float(i + 1)).r;

    currCrack = currCrack * step(0.7, 1. - pow(currTrail,0.7));

    cracks += currCrack;
    nomalization += aplitude;

    accumulateFrosted += currTrail * aplitude;
  }
  cracks /= nomalization;
  accumulateFrosted /= nomalization;
  cracks += pow(1. - texture(uCracksMap, vUv * 4.).r, 3.) * 3. * step(0.92, 1. - pow(trail.r,0.6));
  
  vec3 cracksParallax = texture(uCracksMap, vUv * 2. + vParallax * 0.1).rgb;

  vec3 frosted = colorBlue * 3. + perlin * 0.6 + perlin2 * 0.6;
  vec3 cracksColor = mix(colorBlue, colorGreen, pow(cracks,1.) * 1.);
  cracksColor += pow(cracks,1.) * 2.;
  cracksColor *= perlin * 8. * colorBlue;
  cracksColor += pow(cracks,1.) * 0.5;

  vec3 prxCracksColor = mix(colorDeepBlue, colorBlue, pow(1. - cracksParallax.r,3.) * 10.);
  prxCracksColor *= perlin;
  
  cracksColor = mix(cracksColor, prxCracksColor, 0.3);

  vec3 deepColor = mix(vec3(0.1,0.7,0.7),vec3(0., 0.3, 1.), 1. - pow(accumulateFrosted,1.5));
  cracksColor = mix(cracksColor, deepColor, pow(accumulateFrosted,1.5));
  vec3 color = mix(cracksColor, frosted, pow(trail.r,0.5) );

  // 偏色处理
  color = mix(color, uTintColor, uTintStrength);

  vec2 uvCentered = vUv - 0.5;
  float dist = length(uvCentered * 2.0); // 0 ~ 1
  float edgeFade = smoothstep(0.6, 1.0, dist); // 边缘渐隐

  float alpha = mix(1.0, 0.0, edgeFade);

  if (alpha < 0.01) discard;

  csm_DiffuseColor = vec4(color, alpha);
  csm_DepthAlpha = alpha;
}
