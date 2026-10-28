import * as THREE from 'three'
import type { Quality } from './settings'

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`

// A periodic animated refractive pattern, shared by the seabed and water volume.
// It is generated once per simulation frame instead of evaluated at every ray step.
const causticFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  vec2 hash(vec2 p) {
    p = mod(p, 24.);
    return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453);
  }
  void main() {
    vec2 p = vUv * 24.;
    p += vec2(sin(vUv.y*25.1327+uTime*.32),cos(vUv.x*18.84956-uTime*.27))*.7;
    p += vec2(sin(dot(vUv,vec2(18.84956,75.39822))+uTime*.4),cos(dot(vUv,vec2(75.39822,-25.13274))-uTime*.36))*.27;
    vec2 cell = floor(p), local = fract(p);
    float nearest = 10., second = 10.;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
      vec2 offset = vec2(float(x),float(y));
      vec2 seed = hash(cell+offset);
      vec2 point = .5 + .32*sin(uTime*.55 + 6.283185*seed);
      float d = length(offset+point-local);
      if(d<nearest) { second=nearest; nearest=d; } else second=min(second,d);
    }
    float edge = second-nearest;
    float caustic = exp(-edge*edge*420.);
    gl_FragColor = vec4(vec3(caustic),1.);
  }
`

const waterUniforms = /* glsl */ `
  uniform sampler2D uWaterCaustics;
  uniform vec3 uWaterSun;
  uniform float uWaterSunStrength;
  float waterCaustic(vec3 p) {
    float depth = max(-p.y,0.);
    vec2 surface = p.xz + uWaterSun.xz * depth/max(uWaterSun.y,.2);
    vec2 uv = surface / 24.;
    float a = texture2D(uWaterCaustics,uv).r;
    float b = texture2D(uWaterCaustics,mat2(.8,-.6,.6,.8)*uv*1.73 + .31).r;
    return a*.72 + b*.28;
  }
`

/** Depth-bounded single scattering under the water, plus shared surface caustics.
 * Uses the ocean's existing RAF, sun shadow map and clock. No overlay geometry.
 */
export class UnderwaterLighting {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 })
  private readonly caustics = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false })
  private readonly camera = new THREE.Camera()
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  private readonly scene = new THREE.Scene()
  private readonly clock = { value: 0 }
  private readonly sunDirection = { value: new THREE.Vector3(0, 1, 0) }
  private readonly sunStrength = { value: 1 }
  private readonly materials = new WeakSet<THREE.Material>()
  private readonly causticMaterial: THREE.ShaderMaterial
  private readonly composite: THREE.ShaderMaterial
  private lastTime = NaN

  constructor() {
    this.caustics.texture.generateMipmaps = true
    this.caustics.texture.minFilter = THREE.LinearMipmapLinearFilter
    this.caustics.texture.wrapS = this.caustics.texture.wrapT = THREE.RepeatWrapping
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    this.causticMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: this.clock }, vertexShader: vertex, fragmentShader: causticFragment,
      depthTest: false, depthWrite: false, toneMapped: false,
    })
    this.composite = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this.target.texture }, uDepth: { value: this.target.depthTexture },
        ...this.sharedUniforms(),
        uInverseProjection: { value: new THREE.Matrix4() }, uCameraWorld: { value: new THREE.Matrix4() },
        uEye: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
        uDaylight: { value: 1 }, uWaterLevel: { value: 0 }, uSteps: { value: 24 },
        uShadow: { value: null }, uShadowMatrix: { value: new THREE.Matrix4() },
        uHasShadow: { value: false },
      },
      vertexShader: vertex,
      fragmentShader: /* glsl */ `
        #include <packing>
        varying vec2 vUv;
        uniform sampler2D uColor, uDepth, uShadow;
        uniform mat4 uInverseProjection, uCameraWorld, uShadowMatrix;
        uniform vec3 uEye, uSunColor;
        uniform float uDaylight, uWaterLevel;
        uniform int uSteps;
        uniform bool uHasShadow;
        ${waterUniforms}
        float visibility(vec3 p) {
          if(!uHasShadow) return 1.;
          // Trace the refracted ray to the interface, then test the air-side sun shadow.
          p += uWaterSun * max(uWaterLevel-p.y,0.)/max(uWaterSun.y,.2);
          vec4 coord = uShadowMatrix * vec4(p,1.);
          vec3 uv = coord.xyz/coord.w;
          if(any(lessThan(uv,vec3(0.))) || any(greaterThan(uv,vec3(1.)))) return 1.;
          float depth = unpackRGBAToDepth(texture2D(uShadow,uv.xy));
          return smoothstep(uv.z-.0012,uv.z+.0004,depth);
        }
        void main() {
          float depth = texture2D(uDepth,vUv).r;
          vec4 view = uInverseProjection * vec4(vUv*2.-1.,depth*2.-1.,1.);
          vec3 endpoint = (uCameraWorld * vec4(view.xyz/view.w,1.)).xyz;
          vec3 direction = normalize(endpoint-uEye);
          float distanceToScene = min(length(endpoint-uEye),95.);
          // Geometry depth stops shafts in front of the seabed, rocks and hull.
          float waterLength = distanceToScene;
          if(direction.y>.0001) waterLength = min(waterLength,max((uWaterLevel-uEye.y)/direction.y,0.));
          waterLength = max(waterLength,0.);
          vec3 extinction = vec3(.17,.06,.035);
          vec3 transmission = exp(-extinction*waterLength);
          vec3 ambient = vec3(.004,.047,.09)*(.025+.975*uDaylight);
          vec3 scattered = ambient*(1.-transmission);
          float phase = .55 + 1.15*pow(max(dot(direction,uWaterSun),0.),8.);
          float rayLength = min(waterLength,36.);
          float stepLength = rayLength/float(uSteps);
          // Filter the light footprint instead of adding screen-space grain.
          vec3 shafts = vec3(0.);
          for(int i=0;i<64;i++) {
            if(i>=uSteps) break;
            float t = (float(i)+.5)*stepLength;
            vec3 p = uEye+direction*t;
            float sunPath = max(uWaterLevel-p.y,0.)/max(uWaterSun.y,.2);
            vec3 sunTransmittance = exp(-vec3(.23,.068,.03)*sunPath);
            vec2 surface = p.xz + uWaterSun.xz * sunPath;
            float focus = textureLod(uWaterCaustics,surface/84.,2.5).r;
            focus = smoothstep(.08,.65,focus);
            float lit = visibility(p);
            shafts += exp(-extinction*t)*sunTransmittance*(.012+focus*.5)*lit*stepLength;
          }
          scattered += shafts * vec3(.10,.32,.42) * uSunColor * uWaterSunStrength * phase;
          vec3 color = texture2D(uColor,vUv).rgb*transmission + scattered;
          gl_FragColor = vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      depthTest: false, depthWrite: false,
    })
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  private sharedUniforms() {
    return { uWaterCaustics: { value: this.caustics.texture }, uWaterSun: this.sunDirection, uWaterSunStrength: this.sunStrength }
  }

  applyTo(material: THREE.Material) {
    if (!(material instanceof THREE.MeshStandardMaterial) || this.materials.has(material)) return
    this.materials.add(material)
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.sharedUniforms())
      shader.vertexShader = 'varying vec3 vWaterWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vec4 waterPosition = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          waterPosition = instanceMatrix * waterPosition;
        #endif
        vWaterWorld = (modelMatrix * waterPosition).xyz;
      `)
      shader.fragmentShader = 'varying vec3 vWaterWorld;\n' + waterUniforms + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        float waterDepth = max(-vWaterWorld.y,0.);
        float submerged = smoothstep(0.,.4,waterDepth);
        float pattern = waterCaustic(vWaterWorld);
        // Modulate lit diffuse radiance before tone mapping; existing cast shadows remain dark.
        reflectedLight.directDiffuse *= mix(1.,.65+pattern*3.4,submerged*uWaterSunStrength);
        vec3 waterTransmission = exp(-vec3(.23,.068,.03)*waterDepth/max(uWaterSun.y,.35));
        reflectedLight.directDiffuse *= mix(vec3(1.),waterTransmission,submerged);
        reflectedLight.indirectDiffuse *= mix(vec3(1.),waterTransmission*.7,submerged);
      `)
    }
    material.customProgramCacheKey = () => 'ocean-underwater-caustics-v1'
    material.needsUpdate = true
  }

  setSize(width: number, height: number, quality: Quality) {
    this.target.setSize(width, height)
    this.composite.uniforms.uSteps.value = { Low: 16, Medium: 28, High: 40, Ultra: 56 }[quality]
  }

  update(renderer: THREE.WebGLRenderer, time: number, sun: THREE.Vector3, sunColor: THREE.Color, daylight: number, strength: number) {
    // Snell's law: air -> water (IOR 1.333), so even low sun bends down into the sea.
    this.sunDirection.value.set(sun.x/1.333, Math.sqrt(Math.max(1-(sun.x*sun.x+sun.z*sun.z)/(1.333*1.333),0)), sun.z/1.333)
    this.sunStrength.value = THREE.MathUtils.clamp(strength,0,1)*THREE.MathUtils.smoothstep(sun.y,0,.12)
    this.composite.uniforms.uSunColor.value.copy(sunColor)
    this.composite.uniforms.uDaylight.value = daylight
    if(this.lastTime === time) return
    this.clock.value = time
    const target = renderer.getRenderTarget()
    this.quad.material = this.causticMaterial
    renderer.setRenderTarget(this.caustics)
    renderer.render(this.scene,this.camera)
    renderer.setRenderTarget(target)
    this.lastTime = time
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, waterLevel: number, output: THREE.WebGLRenderTarget | null = null) {
    this.composite.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse)
    this.composite.uniforms.uCameraWorld.value.copy(camera.matrixWorld)
    this.composite.uniforms.uEye.value.copy(camera.position)
    this.composite.uniforms.uWaterLevel.value = waterLevel
    this.composite.uniforms.uShadow.value = sun.shadow.map?.texture ?? null
    this.composite.uniforms.uShadowMatrix.value.copy(sun.shadow.matrix)
    this.composite.uniforms.uHasShadow.value = sun.castShadow && !!sun.shadow.map
    this.quad.material = this.composite
    renderer.setRenderTarget(output)
    renderer.render(this.scene,this.camera)
  }

  dispose() {
    this.target.depthTexture?.dispose()
    this.target.dispose()
    this.caustics.dispose()
    this.causticMaterial.dispose()
    this.composite.dispose()
    this.quad.geometry.dispose()
  }
}
