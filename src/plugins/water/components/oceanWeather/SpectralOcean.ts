import * as THREE from 'three'
import { cascadeLengths, createSpectrum, sampleSpectrum, type WaveMode } from './spectrum'
import type { Quality } from './settings'

const vertex = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`
const evolve = /* glsl */`
uniform sampler2D uInitial;
uniform float uTime, uSize, uLength,uChoppiness;
varying vec2 vUv;
vec2 mul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
void main(){
  vec2 k=(floor(vUv*uSize)-uSize*.5)*6.283185307/uLength;
  float km=length(k), w=sqrt(9.81*km);
  vec4 h0=texture2D(uInitial,vUv);
  vec2 phase=vec2(cos(w*uTime),-sin(w*uTime));
  vec2 h=(mul(h0.xy,phase)+mul(h0.zw,vec2(phase.x,-phase.y)))*uSize*uSize;
  vec2 ih=vec2(-h.y,h.x)/max(km,.00001)*uChoppiness;
  vec2 dx=ih*k.x, dz=ih*k.y;
  // Two real spatial fields packed into one complex transform: height + i*Dx.
  gl_FragColor=vec4(h+vec2(-dx.y,dx.x),dz);
}`
const butterfly = /* glsl */`
uniform sampler2D uInput;
uniform float uSize, uHalf, uAxis, uFirst;
varying vec2 vUv;
float reverseBits(float n){
  float result=0.;
  for(int i=0;i<9;i++){if(exp2(float(i))>=uSize)break; result=result*2.+mod(n,2.); n=floor(n*.5);}
  return result;
}
vec4 fetchIndex(float j){
  vec2 uv=vUv; if(uAxis<.5)uv.x=(j+.5)/uSize;else uv.y=(j+.5)/uSize;
  return texture2D(uInput,uv);
}
vec2 mul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
void main(){
  float j=floor((uAxis<.5?vUv.x:vUv.y)*uSize);
  float sub=mod(j,uHalf), a=floor(j/(2.*uHalf))*2.*uHalf+sub, b=a+uHalf;
  if(uFirst>.5){a=reverseBits(a);b=reverseBits(b);}
  vec4 av=fetchIndex(a), bv=fetchIndex(b);
  float angle=3.141592654*sub/uHalf;
  vec2 twiddle=vec2(cos(angle),sin(angle));
  vec4 rotated=vec4(mul(bv.xy,twiddle),mul(bv.zw,twiddle));
  gl_FragColor=(av+(mod(j,2.*uHalf)<uHalf?rotated:-rotated))*.5;
}`
const unpack = /* glsl */`
uniform sampler2D uInput; uniform float uSize; varying vec2 vUv;
void main(){
  vec2 p=floor(vUv*uSize);
  vec4 v=texture2D(uInput,vUv)*(mod(p.x+p.y,2.)<.5?1.:-1.);
  gl_FragColor=vec4(v.y,v.x,v.z,1.);
}`
const derivatives = /* glsl */`
uniform sampler2D uDisplacement, uHistory;
uniform float uSize,uLength,uDelta,uWind,uHeightRms;
varying vec2 vUv;
void main(){
  vec2 texel=vec2(1./uSize,0.);
  vec3 dx=(texture2D(uDisplacement,vUv+texel).xyz-texture2D(uDisplacement,vUv-texel).xyz)*uSize/(2.*uLength);
  vec3 dz=(texture2D(uDisplacement,vUv+texel.yx).xyz-texture2D(uDisplacement,vUv-texel.yx).xyz)*uSize/(2.*uLength);
  float jacobian=(1.+dx.x)*(1.+dz.z)-dx.z*dz.x;
  vec3 normal=normalize(cross(vec3(dz.x,dz.y,1.+dz.z),vec3(1.+dx.x,dx.y,dx.z)));
  float height=texture2D(uDisplacement,vUv).y;
  vec2 drift=vec2(.94,.342)*uWind*.035*uDelta/uLength;
  float previous=texture2D(uHistory,vUv-drift).a*exp(-uDelta*1.6);
  // This is breaking activity, not opaque coverage. Keep it at compressed high
  // crests; the surface shader resolves porous filaments below the FFT cell size.
  float elevated=smoothstep(1.05,2.3,height/max(uHeightRms,.001));
  float compression=1.-smoothstep(.7,.98,jacobian);
  float breaking=smoothstep(.24,.76,elevated*compression)*smoothstep(4.,12.,uWind);
  if(uLength<10.)breaking=0.;
  gl_FragColor=vec4(normal,max(previous,breaking));
}`

interface Cascade {
  initial: THREE.DataTexture
  displacement: THREE.WebGLRenderTarget
  normal: THREE.WebGLRenderTarget
  history: THREE.WebGLRenderTarget
  heightRms: number
}

export class SpectralOcean {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera()
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  private readonly materials: THREE.ShaderMaterial[]
  private readonly evolution: THREE.ShaderMaterial
  private readonly fft: THREE.ShaderMaterial
  private readonly unpack: THREE.ShaderMaterial
  private readonly derivatives: THREE.ShaderMaterial
  private cascades: Cascade[] = []
  private buffers: THREE.WebGLRenderTarget[] = []
  private modes: WaveMode[] = []
  private size = 128
  private lastTime = -1
  private signature = ''
  private wind = 15

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const material = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader, uniforms, depthWrite: false, depthTest: false, toneMapped: false,
    })
    this.evolution = material(evolve, { uInitial: { value: null }, uTime: { value: 0 }, uSize: { value: 128 }, uLength: { value: 256 }, uChoppiness: { value: 1.18 } })
    this.fft = material(butterfly, { uInput: { value: null }, uSize: { value: 128 }, uHalf: { value: 1 }, uAxis: { value: 0 }, uFirst: { value: 1 } })
    this.unpack = material(unpack, { uInput: { value: null }, uSize: { value: 128 } })
    this.derivatives = material(derivatives, { uDisplacement: { value: null }, uHistory: { value: null }, uSize: { value: 128 }, uLength: { value: 256 }, uDelta: { value: 0.016 }, uWind: { value: 15 }, uHeightRms: { value: 0.7 } })
    this.materials = [this.evolution, this.fft, this.unpack, this.derivatives]
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  configure(wind: number, wavelength: number, quality: Quality) {
    const size = quality === 'Ultra' ? 256 : quality === 'Low' ? 64 : 128
    const signature = `${wind}/${wavelength}/${size}`
    if (signature === this.signature) return
    this.signature = signature
    this.wind = wind
    this.releaseTargets()
    this.size = size
    const target = (linear = false) => new THREE.WebGLRenderTarget(size, size, {
      type: THREE.FloatType, depthBuffer: false, minFilter: linear ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter,
      magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      generateMipmaps: linear,
    })
    this.buffers = [target(), target()]
    this.modes = []
    this.cascades = cascadeLengths.map((length, index) => {
      const spectrum = createSpectrum(size, length, index, wind, wavelength)
      // Hull buoyancy uses the energetic modes, filtered at the hull's spatial scale.
      this.modes.push(...spectrum.modes.filter(m => Math.hypot(m.kx, m.kz) < 1.5)
        .sort((a, b) => b.re ** 2 + b.im ** 2 - a.re ** 2 - a.im ** 2).slice(0, 192))
      const initial = new THREE.DataTexture(spectrum.data, size, size, THREE.RGBAFormat, THREE.FloatType)
      initial.needsUpdate = true
      return { initial, displacement: target(true), normal: target(true), history: target(true), heightRms: Math.sqrt(spectrum.variance) }
    })
    for (const material of this.materials) material.uniforms.uSize.value = size
    const previous = this.renderer.getRenderTarget()
    const previousAlpha = this.renderer.getClearAlpha()
    const previousColor = this.renderer.getClearColor(new THREE.Color())
    this.renderer.setClearColor(0x000000, 0)
    for (const cascade of this.cascades) {
      this.renderer.setRenderTarget(cascade.history); this.renderer.clearColor()
      this.renderer.setRenderTarget(cascade.normal); this.renderer.clearColor()
    }
    this.renderer.setRenderTarget(previous)
    this.renderer.setClearColor(previousColor, previousAlpha)
    this.lastTime = -1
  }

  update(time: number, uniforms: Record<string, THREE.IUniform>) {
    if (this.lastTime === time) return
    if (uniforms.uTexelOffset) uniforms.uTexelOffset.value = 0.5 / this.size
    const previous = this.renderer.getRenderTarget()
    const delta = this.lastTime < 0 ? 1 / 60 : Math.min(time - this.lastTime, 0.1)
    this.lastTime = time
    const draw = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
      this.quad.material = material; this.renderer.setRenderTarget(target); this.renderer.render(this.scene, this.camera)
    }
    this.cascades.forEach((cascade, index) => {
      this.evolution.uniforms.uInitial.value = cascade.initial
      this.evolution.uniforms.uTime.value = time
      this.evolution.uniforms.uLength.value = cascadeLengths[index]
      this.evolution.uniforms.uChoppiness.value = [1.18, 1.08, 0.42][index]
      draw(this.evolution, this.buffers[0])
      let source = 0
      for (let axis = 0; axis < 2; axis++) for (let half = 1; half < this.size; half *= 2) {
        Object.assign(this.fft.uniforms.uInput, { value: this.buffers[source].texture })
        this.fft.uniforms.uAxis.value = axis
        this.fft.uniforms.uHalf.value = half
        this.fft.uniforms.uFirst.value = half === 1 ? 1 : 0
        source = 1 - source
        draw(this.fft, this.buffers[source])
      }
      this.unpack.uniforms.uInput.value = this.buffers[source].texture
      draw(this.unpack, cascade.displacement)
      this.derivatives.uniforms.uDisplacement.value = cascade.displacement.texture
      this.derivatives.uniforms.uHistory.value = cascade.history.texture
      this.derivatives.uniforms.uLength.value = cascadeLengths[index]
      this.derivatives.uniforms.uDelta.value = delta
      this.derivatives.uniforms.uWind.value = this.wind
      this.derivatives.uniforms.uHeightRms.value = cascade.heightRms
      draw(this.derivatives, cascade.normal)
      uniforms[`uDisplacement${index}`].value = cascade.displacement.texture
      uniforms[`uNormal${index}`].value = cascade.normal.texture
      const swap = cascade.history; cascade.history = cascade.normal; cascade.normal = swap
    })
    this.renderer.setRenderTarget(previous)
  }

  heightAt(x: number, z: number, time: number) { return sampleSpectrum(this.modes, x, z, time) }

  private releaseTargets() {
    this.buffers.forEach(target => target.dispose())
    this.cascades.forEach(c => { c.initial.dispose(); c.displacement.dispose(); c.normal.dispose(); c.history.dispose() })
  }
  dispose() { this.releaseTargets(); this.materials.forEach(m => m.dispose()); this.quad.geometry.dispose() }
}
