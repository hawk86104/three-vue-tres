uniform float uParallaxDistance;

varying vec2 vParallax;
varying vec2 vUv;

void main() {

  vUv = uv;

  vec3 pos = position;
  vec4 wPos = modelMatrix * vec4(pos, 1.0);

  mat3 tbn = mat3(vec3(1.,0,0), vec3(0,0.,-1.), vec3(0.,1.,0.));
  tbn = transpose(tbn);

  vec3 viewDir = normalize(wPos.xyz - cameraPosition);
  vec3 tbnViewDir = tbn * viewDir;

  vParallax = tbnViewDir.xy;
  vParallax *= uParallaxDistance / dot(-tbnViewDir, vec3(0.0,0.0,1.0));

  csm_Position = pos;

}
