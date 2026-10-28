/** Shared by the ocean material and the GPU coverage regression check. */
export const foamFragment = /* glsl */`
float foamCoverage(vec2 surfacePosition,float breaking,float shore,float wake){
  // Match the foam history's wind drift. Displacement stretches the bubble
  // walls with the waves, instead of sliding an independent overlay across them.
  vec2 foamPosition=surfacePosition-vec2(.94,.342)*uWind*.035*uTime;
  vec2 foamUV=vec2(dot(foamPosition,vec2(.94,.342)),dot(foamPosition,vec2(-.342,.94)));
  float filaments=texture2D(uFoam,foamUV*vec2(.055,.038)).r;
  float detail=texture2D(uFoam,mat2(.8,-.6,.6,.8)*foamUV*vec2(.17,.13)+.37).r;
  // Linear coverage was extracted before mipmapping, so distant bubble walls
  // average to a faint veil. Never fill the holes, even at the strongest crest.
  // Modulate the filaments instead of adding detail: minified detail must not
  // introduce a constant gray floor in the otherwise transparent holes.
  float pattern=filaments*mix(.85,1.,detail);
  float fresh=smoothstep(.5,.95,breaking);
  float residue=sqrt(clamp(breaking,0.,1.));
  float crest=(fresh*.24+residue*.5)*pattern;
  return clamp(crest+(shore+wake)*.5*pattern,0.,.78);
}
`
