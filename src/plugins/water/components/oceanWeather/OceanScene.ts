import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { oceanVertex, oceanFragment } from './shaders'
import { SpectralOcean } from './SpectralOcean'
import { VolumetricSky } from './VolumetricSky'
import { UnderwaterLighting } from './UnderwaterLighting'
import { WeatherSystem, type WeatherSnapshot } from './weather'
import { presets, qualityOptions, type CameraMode, type WaterSettings } from './settings'
import { oceanAsset } from './assets'

interface SceneCallbacks {
  weather?: (snapshot: WeatherSnapshot) => void
  progress: (percent: number, label: string) => void
  ready: () => void
  error: (message: string) => void
  stats: (fps: number, underwater: boolean, speed: number) => void
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse(object => {
    const mesh = object as THREE.Mesh
    if (object instanceof THREE.InstancedMesh) object.dispose()
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material)
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value)
        }
      }
    }
  })
  textures.forEach(texture => texture.dispose())
  materials.forEach(material => material.dispose())
  geometries.forEach(geometry => geometry.dispose())
}

export class OceanScene {
  private readonly content = new THREE.Group()
  private readonly events = new AbortController()
  private readonly textures: THREE.Texture[] = []
  private readonly draco = new DRACOLoader()
  private readonly refraction = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private readonly sun = new THREE.DirectionalLight(0xfff5df, 2.8)
  private readonly ambient = new THREE.HemisphereLight(0xb4dafa, 0x497477, 1.6)
  private readonly fill = new THREE.DirectionalLight(0xc7dcea, 1.1)
  private readonly underwaterFogColor = new THREE.Color('#064052')
  private readonly ship = new THREE.Group()
  private readonly hull = new THREE.Group()
  private readonly probes = new THREE.Group()
  private readonly wakeProbes = new THREE.Group()
  private readonly buoys: THREE.Group[] = []
  private readonly fish: THREE.Object3D[] = []
  private readonly mixers: THREE.AnimationMixer[] = []
  private readonly keys = new Set<string>()
  private readonly sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly atmosphere: VolumetricSky
  private readonly spectrum: SpectralOcean
  private readonly ocean: Reflector
  private readonly material: THREE.ShaderMaterial
  private readonly weather: WeatherSystem
  private environment: THREE.WebGLRenderTarget | null = null
  private environmentGenerator: THREE.PMREMGenerator | undefined
  private lastEnvironmentUpdate = 0
  private lastWeatherStats = 0
  private environmentTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private contextLost = false
  private time = 0
  private lastFrame = 0
  private lastStats = 0
  private frameCount = 0
  private mode: CameraMode = 'orbit'
  private speed = 0
  private heading = -0.12
  private settings: WaterSettings
  private width = 1
  private readonly underwaterLight = new UnderwaterLighting()
  private underwater = false
  private waterLevel = 0

  constructor(
    private readonly host: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    settings: WaterSettings,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.settings = { ...settings }
    this.weather = new WeatherSystem(settings)
    this.renderer.domElement.setAttribute('aria-label', '可交互的海洋三维场景')
    this.renderer.domElement.tabIndex = 0
    this.controls.target.set(-4, 6, -3)
    this.camera.position.set(17, 11, 37)
    this.controls.update()

    this.refraction.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
    this.sun.position.set(-70, 110, -110)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 400 })
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.035
    this.fill.position.set(28, 42, 65)
    this.fill.color.set('#fff0d7')
    this.scene.add(this.content)
    this.content.add(this.sun, this.ambient, this.fill)

    this.atmosphere = new VolumetricSky(this.renderer, this.camera)
    this.sky = this.atmosphere.mesh
    this.content.add(this.sky)
    this.spectrum = new SpectralOcean(this.renderer)

    // Linear coverage, already extracted before mip filtering, not a gray photo.
    const foam = this.loadTexture(oceanAsset('textures/foam-filaments.png'))
    this.ocean = new Reflector(this.waterGeometry(settings.quality), {
      textureWidth: qualityOptions[settings.quality].reflection,
      textureHeight: qualityOptions[settings.quality].reflection,
      multisample: 0, clipBias: 0.002,
      shader: {
        name: 'OceanSurface', vertexShader: oceanVertex, fragmentShader: oceanFragment,
        uniforms: {
          color: { value: new THREE.Color() }, textureMatrix: { value: new THREE.Matrix4() }, tDiffuse: { value: null },
          uTime: { value: 0 }, uWind: { value: settings.wind },
          uTexelOffset: { value: 0.5 / 128 },
          uRefraction: { value: null }, uDepth: { value: null }, uFoam: { value: null },
          uDisplacement0: { value: null }, uDisplacement1: { value: null }, uDisplacement2: { value: null },
          uNormal0: { value: null }, uNormal1: { value: null }, uNormal2: { value: null },
          uSkyEnvironment: { value: null }, uReflectionDepth: { value: null },
          uResolution: { value: new THREE.Vector2() }, uEye: { value: new THREE.Vector3() },
          uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
          uWaterColor: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() },
          uFog: { value: 0.001 }, uDaylight: { value: 1 }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
          uBoat: { value: new THREE.Vector3() }, uBoatSpeed: { value: 0 },
        },
      },
    })
    this.material = this.ocean.material as THREE.ShaderMaterial
    this.ocean.getRenderTarget().depthTexture = new THREE.DepthTexture(qualityOptions[settings.quality].reflection, qualityOptions[settings.quality].reflection, THREE.UnsignedIntType)
    this.material.uniforms.uReflectionDepth.value = this.ocean.getRenderTarget().depthTexture
    this.material.uniforms.uSkyEnvironment.value = this.atmosphere.texture
    this.material.side = THREE.DoubleSide
    this.material.uniforms.uRefraction.value = this.refraction.texture
    this.material.uniforms.uDepth.value = this.refraction.depthTexture
    this.material.uniforms.uFoam.value = foam
    this.ocean.rotation.x = -Math.PI / 2
    this.ocean.frustumCulled = false
    this.content.add(this.ocean)
    this.ship.add(this.hull)
    this.ship.position.set(0, 0, 4)
    this.content.add(this.ship, this.probes, this.wakeProbes)
    this.createSeabed()
    this.createProbes()
    this.applySettings(settings)
    this.resize()

    const signal = this.events.signal
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLElement && (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable)) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault()
        this.keys.add(event.code)
      }
    }, { signal })
    window.addEventListener('keyup', event => this.keys.delete(event.code), { signal })
    window.addEventListener('blur', () => this.keys.clear(), { signal })
    document.addEventListener('visibilitychange', () => { this.lastFrame = 0; this.keys.clear() }, { signal })
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      this.contextLost = true
      callbacks.error('图形上下文已中断，请重新加载场景。')
    }, { signal })
    void this.loadModels()
  }

  private loadTexture(path: string, srgb = false) {
    const texture = new THREE.TextureLoader().load(path, loaded => {
      if (this.disposed) loaded.dispose()
    }, undefined, () => {
      if (!this.disposed) this.callbacks.error(`纹理加载失败：${path}`)
    })
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    this.textures.push(texture)
    return texture
  }

  private waterGeometry(quality: WaterSettings['quality']) {
    const geometry = new THREE.PlaneGeometry(2, 2, qualityOptions[quality].segments, qualityOptions[quality].segments)
    const positions = geometry.getAttribute('position')
    // Concentrate vertices around the ship, while keeping a continuous 12 km horizon.
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i)
      positions.setXY(i, x * (90 + Math.pow(Math.abs(x), 4) * 6000), y * (90 + Math.pow(Math.abs(y), 4) * 6000))
    }
    geometry.computeBoundingSphere()
    return geometry
  }

  private seabedHeight(x: number, z: number) {
    return -5.4 - Math.min(Math.hypot(x, z + 20) * 0.037, 28) + Math.sin(x * 0.085) * Math.cos(z * 0.07) * 0.85
  }

  private createSeabed() {
    const geometry = new THREE.PlaneGeometry(1400, 1400, 180, 180)
    geometry.rotateX(-Math.PI / 2)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) positions.setY(i, this.seabedHeight(positions.getX(i), positions.getZ(i)))
    geometry.computeVertexNormals()
    const sand = this.loadTexture(oceanAsset('textures/sand.jpg'), true)
    const normal = this.loadTexture(oceanAsset('textures/sand-normal.jpg'))
    sand.repeat.set(160, 160); normal.repeat.set(160, 160)
    const material = new THREE.MeshStandardMaterial({ map: sand, normalMap: normal, color: '#bac8ad', roughness: 0.95, normalScale: new THREE.Vector2(0.45, 0.45) })
    this.underwaterLight.applyTo(material)
    const seabed = new THREE.Mesh(geometry, material)
    seabed.receiveShadow = true
    this.content.add(seabed)
  }

  private normalizeModel(model: THREE.Object3D, length: number, draft: number) {
    let box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    model.scale.multiplyScalar(length / Math.max(size.x, size.z))
    model.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.z -= center.z
    model.position.y -= box.min.y + draft
    model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) this.underwaterLight.applyTo(material)
      }
    })
    return model
  }

  private addSeabedInstances(source: THREE.Object3D, amount: number, random: () => number) {
    source.updateWorldMatrix(true, true)
    const rootInverse = new THREE.Matrix4().copy(source.matrixWorld).invert()
    const instances: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = []
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const mesh = new THREE.InstancedMesh(object.geometry, object.material, amount)
      mesh.castShadow = object.castShadow
      mesh.receiveShadow = object.receiveShadow
      this.content.add(mesh)
      instances.push({ mesh, local: new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld) })
    })
    const transform = new THREE.Object3D()
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < amount; i++) {
      const x = (random() - 0.5) * 175, z = (random() - 0.5) * 145
      transform.position.copy(source.position).add(new THREE.Vector3(x, this.seabedHeight(x, z) - 0.1, z))
      transform.rotation.copy(source.rotation)
      transform.rotation.y = random() * Math.PI * 2
      transform.scale.copy(source.scale).multiplyScalar(0.6 + random() * 1.1)
      transform.updateMatrix()
      for (const { mesh, local } of instances) mesh.setMatrixAt(i, matrix.multiplyMatrices(transform.matrix, local))
    }
    for (const { mesh } of instances) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }

  private async loadModels() {
    this.draco.setDecoderPath(oceanAsset('draco/'))
    const loader = new GLTFLoader().setDRACOLoader(this.draco)
    const files = ['dutch_ship_medium_2k', 'island', 'buoy', 'rocks', 'seaweed', 'grass', 'fish']
    const labels = ['木帆船', '沙滩海岛', '航道浮标', '海底礁石', '海藻', '海草', '鱼群']
    let count = 0
    try {
      const [results] = await Promise.all([Promise.all(files.map(async (name, index) => {
        const gltf = await loader.loadAsync(oceanAsset(`models/${name}.glb`))
        if (this.disposed) { disposeTree(gltf.scene); return null }
        // Keep every resolved model owned even if another request fails or the view unmounts.
        gltf.scene.visible = false
        this.content.add(gltf.scene)
        this.callbacks.progress(Math.round(++count / (files.length + 1) * 100), `${labels[index]}已就绪`)
        return gltf
      })), this.atmosphere.ready.then(() => {
        if (!this.disposed) this.callbacks.progress(Math.round(++count / (files.length + 1) * 100), '体积云与大气已就绪')
      })])
      if (this.disposed) return
      const [shipGLTF, islandGLTF, buoyGLTF, rocksGLTF, seaweedGLTF, grassGLTF, fishGLTF] = results
      if (!shipGLTF || !islandGLTF || !buoyGLTF || !rocksGLTF || !seaweedGLTF || !grassGLTF || !fishGLTF) return
      const shipModel = this.normalizeModel(shipGLTF.scene, 28, 1.65)
      const shipSize = new THREE.Box3().setFromObject(shipModel).getSize(new THREE.Vector3())
      if (shipSize.z > shipSize.x) shipModel.rotation.y = Math.PI / 2
      shipModel.visible = true
      this.hull.add(shipModel)

      // The reference island is authored Z-up, unlike the Y-up ship.
      islandGLTF.scene.rotation.x = -Math.PI / 2
      const island = this.normalizeModel(islandGLTF.scene, 66, 0)
      // Its sandy base extends far below the shore. Align the authored shoreline,
      // rather than lifting the bottom of that base to the water surface.
      island.position.y = 2.25
      island.position.add(new THREE.Vector3(-25, 0, -48))
      island.visible = true

      const buoy = this.normalizeModel(buoyGLTF.scene, 0.35, 0.18)
      for (let i = 0; i < 8; i++) {
        const group = new THREE.Group()
        const model = buoy.clone(true)
        model.visible = true
        group.add(model)
        group.position.set(-45 + i * 13, 0, i % 2 ? -20 : 20)
        this.content.add(group)
        this.buoys.push(group)
      }

      let seed = 8437
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
      for (const [source, length, amount] of [[rocksGLTF.scene, 5, 24], [seaweedGLTF.scene, 2, 42], [grassGLTF.scene, 2.6, 54]] as const) {
        this.normalizeModel(source, length, 0)
        this.addSeabedInstances(source, amount, random)
      }
      const fishModel = this.normalizeModel(fishGLTF.scene, 0.8, 0)
      for (let i = 0; i < 16; i++) {
        const model = clone(fishModel)
        model.visible = true
        this.content.add(model)
        this.fish.push(model)
        if (fishGLTF.animations.length) {
          const mixer = new THREE.AnimationMixer(model)
          mixer.clipAction(fishGLTF.animations[0]).play()
          this.mixers.push(mixer)
        }
      }
      this.updateWeatherLighting()
      this.updateEnvironment()
      this.callbacks.ready()
    } catch (error) {
      if (!this.disposed) this.callbacks.error(`场景资源加载失败，请重试。${error instanceof Error ? error.message : ''}`)
    }
  }

  private createProbes() {
    const geometry = new THREE.SphereGeometry(0.22, 10, 8)
    const material = new THREE.MeshBasicMaterial({ color: '#7cffe6', depthTest: false })
    for (const x of [-9, 0, 9]) for (const z of [-2.4, 2.4]) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData.offset = new THREE.Vector2(x, z)
      mesh.renderOrder = 20
      this.probes.add(mesh)
    }
    const wakeMaterial = new THREE.MeshBasicMaterial({ color: '#ffc96b', wireframe: true, depthTest: false })
    const ring = new THREE.TorusGeometry(0.5, 0.08, 4, 16)
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(ring, wakeMaterial)
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 20
      this.wakeProbes.add(mesh)
    }
  }

  applySettings(next: WaterSettings) {
    const previous = this.settings
    this.settings = { ...next }
    const preset = presets[next.preset as keyof typeof presets] ?? presets['Three.js Sky Pro']
    this.material.uniforms.uWind.value = next.wind
    this.spectrum.configure(next.wind, next.wavelength, next.quality)
    this.atmosphere.configure(next.quality)
    this.atmosphere.setWeather(next.skyExposure, next.haze)
    this.material.uniforms.uWaterColor.value.set(preset.water)
    this.probes.visible = next.buoyancyProbes
    this.wakeProbes.visible = next.wakeProbes
    if (previous.dayOfYear !== next.dayOfYear || previous.timeOfDay !== next.timeOfDay) {
      this.weather.setDate(next.dayOfYear, next.timeOfDay)
    }
    this.updateWeatherLighting()
    this.callbacks.weather?.(this.weather.snapshot())
    if (previous.quality !== next.quality) {
      this.environment?.dispose()
      this.environment = null
      this.ocean.geometry.dispose()
      this.ocean.geometry = this.waterGeometry(next.quality)
      const size = qualityOptions[next.quality].reflection
      this.ocean.getRenderTarget().setSize(size, size)
    }
    if (previous.quality !== next.quality || previous.pixelRatio !== next.pixelRatio || this.width === 1) this.resize()
    if (!this.environment || previous.quality !== next.quality || previous.timeOfDay !== next.timeOfDay || previous.dayOfYear !== next.dayOfYear || previous.skyExposure !== next.skyExposure || previous.haze !== next.haze || previous.clouds !== next.clouds || previous.preset !== next.preset) {
      clearTimeout(this.environmentTimer)
      this.environmentTimer = setTimeout(() => this.updateEnvironment(), 200)
    }
  }

  private updateWeatherLighting(immediate = true) {
    const sun = this.weather.sunDirection
    const altitude = sun.y
    const daylight = THREE.MathUtils.smoothstep(altitude, -0.12, 0.22)
    const sunset = (1 - THREE.MathUtils.smoothstep(Math.abs(altitude), 0.02, 0.45)) * daylight
    this.atmosphere.setLighting(sun, this.settings.clouds, daylight, { moon: this.weather.moonDirection, immediate })
    this.sun.position.copy(sun).multiplyScalar(170)
    this.atmosphere.sunLightColor(this.sun.color)
    const strength = Math.max(this.sun.color.r, this.sun.color.g, this.sun.color.b)
    if (strength > 0) this.sun.color.multiplyScalar(1 / strength)
    const transmission = Math.min(strength, 1) * THREE.MathUtils.smoothstep(altitude, -0.01, 0.03)
    this.sun.intensity = 3.8 * transmission * (1 - this.settings.clouds * 0.42)
    this.sun.castShadow = altitude > 0
    this.ambient.intensity = 0.45 + daylight * 1.23
    this.fill.intensity = (0.25 + daylight * 3.25) * (1 - this.settings.clouds * 0.3)
    this.ambient.color.set(daylight > 0.3 ? '#b7d7ed' : '#507299')
    this.material.uniforms.uSun.value.copy(sun)
    this.material.uniforms.uSunColor.value.copy(this.sun.color).multiplyScalar(transmission)
    this.material.uniforms.uDaylight.value = daylight
    const preset = presets[this.settings.preset as keyof typeof presets] ?? presets['Three.js Sky Pro']
    this.material.uniforms.uFog.value = preset.fog
    const fogColor = this.material.uniforms.uFogColor.value as THREE.Color
    fogColor.setRGB(0.2, 0.26, 0.33).multiplyScalar(0.035 + daylight * 0.965)
    fogColor.lerp(new THREE.Color('#d79873'), sunset * 0.26)
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(fogColor, preset.fog)
  }

  getWeather(): WeatherSnapshot { return this.weather.snapshot() }

  setWeatherDate(dayOfYear: number, timeOfDay: number) {
    this.weather.setDate(dayOfYear, timeOfDay)
    this.settings.dayOfYear = this.weather.dayOfYear
    this.settings.timeOfDay = this.weather.timeOfDay
    this.updateWeatherLighting()
    this.callbacks.weather?.(this.weather.snapshot())
    clearTimeout(this.environmentTimer)
    this.environmentTimer = setTimeout(() => this.updateEnvironment(), 150)
  }

  private updateEnvironment(refreshSky = true) {
    if (this.disposed || !this.atmosphere.isReady) return
    if (refreshSky) this.atmosphere.update(this.weather.cloudTime, true, this.time)
    this.environmentGenerator ??= new THREE.PMREMGenerator(this.renderer)
    this.environment = this.environmentGenerator.fromCubemap(this.atmosphere.texture, this.environment)
    this.scene.environment = this.environment.texture
    this.lastEnvironmentUpdate = this.time
  }

  setMode(mode: CameraMode) {
    this.mode = mode
    this.keys.clear()
    this.controls.enablePan = mode === 'orbit'
    this.controls.minDistance = mode === 'fly' ? 0.1 : 3
    if (mode === 'fly') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3())
      this.controls.target.copy(this.camera.position).addScaledVector(direction, 3)
    }
    if (mode === 'orbit') {
      this.controls.target.copy(this.ship.position).add(new THREE.Vector3(0, 5, 0))
    }
    if (mode === 'boat') {
      this.controls.target.copy(this.ship.position).add(new THREE.Vector3(0, 5, 0))
      this.camera.position.copy(this.ship.position).add(new THREE.Vector3(-34, 16, 30))
    }
    this.controls.update()
  }

  resetCamera() {
    this.ship.position.set(0, 0, 4)
    this.heading = -0.12
    this.speed = 0
    this.setMode('orbit')
    this.camera.position.set(17, 11, 37)
    this.controls.target.set(-4, 6, -3)
    this.controls.update()
  }

  underwaterView() {
    this.setMode('fly')
    this.camera.position.set(18, -3.4, 25)
    const direction = new THREE.Vector3(0, -4.6, -15).sub(this.camera.position).normalize()
    this.controls.target.copy(this.camera.position).addScaledVector(direction, 3)
    this.controls.update()
  }

  async fullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await this.host.parentElement?.requestFullscreen()
  }

  screenshot() {
    this.render()
    this.renderer.domElement.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `ocean-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  resize() {
    if (this.disposed || !this.renderer) return
    this.width = Math.max(this.host.clientWidth, 1)
    const dimensions = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    dimensions.set(Math.max(1, dimensions.x), Math.max(1, dimensions.y))
    this.atmosphere?.setSize(dimensions.x, dimensions.y)
    this.underwaterLight.setSize(dimensions.x, dimensions.y, this.settings.quality)
    this.material?.uniforms.uResolution.value.copy(dimensions)
    const scale = qualityOptions[this.settings.quality].refraction
    this.refraction.setSize(Math.max(1, Math.round(dimensions.x * scale)), Math.max(1, Math.round(dimensions.y * scale)))
  }

  private updateMovement(delta: number) {
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
    const sideways = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    if (this.mode === 'fly') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3())
      const right = new THREE.Vector3().crossVectors(direction, this.camera.up).normalize()
      const motion = direction.multiplyScalar(forward).addScaledVector(right, sideways)
      motion.y += Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ'))
      motion.multiplyScalar(delta * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 45 : 15))
      this.camera.position.add(motion)
      this.controls.target.add(motion)
      const floor = this.seabedHeight(this.camera.position.x, this.camera.position.z) + 0.65
      if (this.camera.position.y < floor) {
        this.controls.target.y += floor - this.camera.position.y
        this.camera.position.y = floor
      }
    }
    if (this.mode === 'boat' && !this.settings.paused) {
      this.speed = THREE.MathUtils.damp(this.speed, forward * 7.5, 0.8, delta)
      this.heading -= sideways * delta * 0.42
      const movement = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(this.speed * delta)
      const candidate = this.ship.position.clone().add(movement)
      // Keep the boat outside the island and inside the detailed water patch.
      if (Math.hypot(candidate.x + 25, candidate.z + 48) > 31 && Math.hypot(candidate.x, candidate.z) < 210) {
        this.ship.position.add(movement)
        this.camera.position.add(movement)
        this.controls.target.add(movement)
      } else this.speed = 0
    } else this.speed = THREE.MathUtils.damp(this.speed, 0, 2, delta)
  }

  update(now: number) {
    if (this.disposed || this.contextLost) return
    if (document.hidden) { this.lastFrame = 0; return }
    const delta = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 1 / 60
    this.lastFrame = now
    this.updateMovement(delta)
    if (!this.settings.paused) this.time += delta
    if (this.weather.advance(delta, this.settings)) this.updateWeatherLighting(false)
    const { wind } = this.settings
    const heightAt = (x: number, z: number) => this.spectrum.heightAt(x, z, this.time)
    const { x, z } = this.ship.position
    this.ship.position.y = heightAt(x, z) * 0.78
    this.ship.rotation.y = this.heading
    this.hull.rotation.x = -(heightAt(x, z + 3) - heightAt(x, z - 3)) / 6 * 0.65
    this.hull.rotation.z = (heightAt(x + 8, z) - heightAt(x - 8, z)) / 16 * 0.65
    this.buoys.forEach((buoy, index) => {
      buoy.position.y = heightAt(buoy.position.x, buoy.position.z)
      buoy.rotation.z = Math.sin(this.time * 1.2 + index) * wind * 0.004
      buoy.rotation.x = Math.cos(this.time * 0.9 + index) * wind * 0.003
    })
    this.fish.forEach((fish, index) => {
      const phase = this.time * 0.12 + index * 0.6
      fish.position.set(Math.cos(phase) * (13 + index * 0.9), -3.9 + Math.sin(phase * 2 + index) * 0.7, Math.sin(phase) * 18 + 3)
      fish.rotation.y = -phase
    })
    if (!this.settings.paused) this.mixers.forEach(mixer => mixer.update(delta))
    if (this.probes.visible) this.probes.children.forEach(probe => {
      const offset = probe.userData.offset as THREE.Vector2
      const px = x + offset.x * Math.cos(this.heading) + offset.y * Math.sin(this.heading)
      const pz = z - offset.x * Math.sin(this.heading) + offset.y * Math.cos(this.heading)
      probe.position.set(px, heightAt(px, pz) + 0.3, pz)
    })
    if (this.wakeProbes.visible) this.wakeProbes.children.forEach((probe, index) => {
      const distance = 10 + Math.floor(index / 2) * 5
      const spread = (index % 2 ? 1 : -1) * distance * 0.17
      const px = x - distance * Math.cos(this.heading) + spread * Math.sin(this.heading)
      const pz = z + distance * Math.sin(this.heading) + spread * Math.cos(this.heading)
      probe.position.set(px, heightAt(px, pz) + 0.12, pz)
    })
    this.material.uniforms.uTime.value = this.time
    this.material.uniforms.uEye.value.copy(this.camera.position)
    this.material.uniforms.uBoat.value.set(x, this.heading, z)
    this.material.uniforms.uBoatSpeed.value = Math.abs(this.speed)
    this.atmosphere.update(this.weather.cloudTime, false, this.time)
    // Direct sunlight updates each frame; reuse the PMREM target for slower IBL.
    if (!this.settings.paused && (this.settings.animateTime || this.settings.animateClouds) && this.time - this.lastEnvironmentUpdate >= 0.5) {
      this.updateEnvironment(false)
    }
    this.spectrum.update(this.time, this.material.uniforms)
    this.underwaterLight.update(this.renderer, this.time, this.weather.sunDirection, this.sun.color, this.material.uniforms.uDaylight.value, this.sun.intensity / 3.8)
    this.waterLevel = heightAt(this.camera.position.x, this.camera.position.z)
    const underwater = this.camera.position.y < this.waterLevel - 0.1
    this.underwater = underwater
    const preset = presets[this.settings.preset as keyof typeof presets] ?? presets['Three.js Sky Pro']
    const fog = this.scene.fog as THREE.FogExp2
    // Underwater extinction is depth-aware in the optical pass, not applied twice as scene fog.
    fog.density = underwater ? 0 : preset.fog
    fog.color.copy(underwater ? this.underwaterFogColor : this.material.uniforms.uFogColor.value)
    this.sky.material.uniforms.uUnderwater.value = underwater ? 1 : 0
    if (now - this.lastWeatherStats >= 100) {
      this.callbacks.weather?.(this.weather.snapshot())
      this.lastWeatherStats = now
    }
    this.frameCount++
    if (now - this.lastStats > 700) {
      this.callbacks.stats(Math.round(this.frameCount * 1000 / (now - this.lastStats)), underwater, Math.abs(this.speed) * 1.94384)
      this.frameCount = 0
      this.lastStats = now
    }
  }

  render() {
    if (this.disposed || this.contextLost) return
    this.ocean.visible = false
    // The refraction buffer must retain the air-side sky seen through Snell's window.
    this.sky.material.uniforms.uUnderwater.value = 0
    this.renderer.setRenderTarget(this.refraction)
    this.renderer.render(this.scene, this.camera)
    this.ocean.visible = true
    this.sky.material.uniforms.uUnderwater.value = this.underwater ? 1 : 0
    this.renderer.setRenderTarget(this.underwater ? this.underwaterLight.target : null)
    this.renderer.render(this.scene, this.camera)
    if (this.underwater) this.underwaterLight.render(this.renderer, this.camera, this.sun, this.waterLevel)
  }

  dispose() {
    this.disposed = true
    clearTimeout(this.environmentTimer)
    this.events.abort()
    this.keys.clear()
    this.mixers.forEach(mixer => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()) })
    this.draco.dispose()
    this.spectrum.dispose()
    this.atmosphere.dispose()
    this.underwaterLight.dispose()
    disposeTree(this.content)
    this.content.removeFromParent()
    this.textures.forEach(texture => texture.dispose())
    this.environment?.dispose()
    this.environmentGenerator?.dispose()
    this.ocean.getRenderTarget().depthTexture?.dispose()
    this.ocean.dispose()
    this.refraction.dispose()
    this.refraction.depthTexture?.dispose()
    this.sun.shadow.dispose()
    this.scene.environment = null
    this.scene.fog = null
  }
}
