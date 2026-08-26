import {
  AdditiveBlending,
  AgXToneMapping,
  InstancedMesh,
  NoToneMapping,
  SRGBColorSpace,
  TetrahedronGeometry,
} from 'three'
import type { Camera, Scene } from 'three'
import {
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PostProcessing,
} from 'three/webgpu'
import type { Node, PassNode, WebGPURenderer } from 'three/webgpu'
import {
  Fn,
  If,
  Loop,
  cameraPosition,
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  exp,
  exp2,
  float,
  fract,
  hash,
  instanceIndex,
  max,
  mix,
  mrt,
  normalView,
  output,
  pass,
  positionGeometry,
  positionWorld,
  pow,
  renderOutput,
  screenUV,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { causticWorldSample } from './caustics'
import type { CausticsPass } from './caustics'
import { currentFlow } from './current'
import { dreamGrade, gradeParams } from './grade'
import {
  AQUATIC_AMBIENT_DOWN,
  AQUATIC_AMBIENT_UP,
  AQUATIC_EXTINCTION,
} from './optical-constants'
import { sunColorUniform, sunDirectionUniform } from './sun'

/** Aquatic extinction — the clarity lever: ~250 m visibility. */
const SIGMA = vec3(...AQUATIC_EXTINCTION)
const AMBIENT_DOWN = vec3(...AQUATIC_AMBIENT_DOWN)
const AMBIENT_UP = vec3(...AQUATIC_AMBIENT_UP)
// NOTE: a "near-surface scattering layer" must NOT be added to this fog. For
// any camera below such a slab, up-grazing rays integrate along it while
// down-grazing rays exit it — a brightness step pinned to the exact view
// horizon, which reads as a screen-space artifact. The horizon gap's real
// fixes: a safely submerged terrain rim (the far saucer) and a physically
// bright TIR underside on the ocean surface (ocean-material `tirBody`).

/**
 * Sun CAST shadows are switched off while a world-anchored radiance field
 * captures (1 = normal, 0 = capture). Everything else about the seabed's
 * lighting stays.
 *
 * They are geometrically correct, but they do not READ as bottom shadows
 * through the surface, and that is a depth-cue failure rather than a clarity
 * one. A cast shadow has no texture, colour, or parallax of its own, so nothing
 * places it at depth; the eye assigns it to the nearest surface and it looks
 * like an aircraft's shadow lying on the water. Bathymetry and structures do
 * not have that problem: they carry their own detail and read as being down
 * there.
 *
 * The two cues that would sell the depth are refraction parallax and
 * wave-driven wobble on the shadow's edge, and at a calm glassy sea state
 * (0.35 amplitude) both are far too small to do it. So the surface transmits
 * the bottom's SUBSTANCE and not the sun's cast shadows. Self-shading (N·L) is
 * untouched, so structures keep their form, and underwater — where the
 * interface is not in the path — shadows are full.
 */
export const seabedShadowCaptureKeep = uniform(1)

export const underwaterDebugModes = new Map([
  ['final', 0],
  ['no-medium', 1],
  ['fog', 2],
  ['god-rays', 3],
  ['caustics', 4],
  ['depth', 5],
])

export interface UnderwaterMediumOptions {
  /** Tiered march counts: 8 / 14 / 22. */
  godraySteps?: number
  particulateCount?: number
  /** Camera-medium authority. Fix at 1 for a permanently submerged view. */
  submerged?: Node<'float'>
}

/**
 * The undersea medium: aquatic-perspective fog plus volumetric god rays
 * composited in the HDR pipeline before bloom, the caustics read paths, and
 * drifting particulates — followed by the display treatment the whole optical
 * stack is calibrated against (pre-tonemap bloom, exposure, AgX, a generated
 * 32-cube grade, and a spatial vignette).
 *
 * Fog and god rays live in the HDR composite, never in materials. One place
 * fogs everything ever added to the scene. World rays are reconstructed from
 * `screenUV` plus the camera's own inverse projection and world matrix — all
 * built-in nodes, no hand-fed matrix uniforms.
 */
export class UnderwaterMediumPipeline {
  readonly scenePass: PassNode
  /** 0 = open sea, 1 = deep inside an enclosed interior: kills fog glow + rays. */
  readonly interior = uniform(0)

  private readonly pipeline: PostProcessing
  private readonly debugMode = uniform(0)
  private readonly timeUniform = uniform(0)
  private readonly particulates: InstancedMesh
  private readonly scene: Scene
  private readonly causticSampler: ReturnType<typeof causticWorldSample>

  constructor(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: Camera,
    caustics: CausticsPass,
    options: UnderwaterMediumOptions = {},
  ) {
    this.scene = scene
    // The renderer is globally NoToneMapping; the explicit renderOutput() below
    // is the only output transform. Side render targets stay linear.
    renderer.toneMapping = NoToneMapping
    const godraySteps = options.godraySteps ?? 14
    const submerged = options.submerged ?? uniform(1)

    // Two sampler variants over one texture: the god-ray march keeps the exact
    // sampler (its per-pixel jitter breaks screen-space derivatives), while
    // surfaces get the footprint-faded one — the mip-less caustic web aliases
    // into dark moiré waves at grazing seabed angles otherwise.
    const raySampler = causticWorldSample(caustics.textureNode)
    this.causticSampler = causticWorldSample(caustics.textureNode, { footprintFade: true })

    const scenePass = pass(scene, camera, { samples: 4 })
    scenePass.setMRT(mrt({ output, normal: vec4(normalView, 1) }))
    this.scenePass = scenePass
    const sceneColor = scenePass.getTextureNode('output')
    const viewZ = scenePass.getViewZNode()

    const foggedNode = Fn(() => {
      const dist = viewZ.negate().min(3500).toVar()

      // World-space ray from screen UV + camera matrices.
      const ndc = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y).mul(2).sub(1))
      const far4 = cameraProjectionMatrixInverse.mul(vec4(ndc, 1.0, 1.0))
      const farView = far4.xyz.div(far4.w)
      const viewPos = farView.mul(viewZ.div(farView.z))
      const worldPos = cameraWorldMatrix.mul(vec4(viewPos, 1.0)).xyz
      const rayDir = worldPos.sub(cameraPosition).div(max(dist, 1e-4))

      const transmittance = exp(SIGMA.mul(dist).negate())
      const upness = smoothstep(-0.5, 0.75, rayDir.y)
      const cameraDim = exp(cameraPosition.y.min(0).mul(0.03))
      const sunward = pow(max(rayDir.dot(sunDirectionUniform), 0.0), 6.0).mul(0.06)
      const interiorKeep = float(1).sub(this.interior.mul(0.94))
      const inscatter = mix(AMBIENT_DOWN, AMBIENT_UP, upness)
        .mul(cameraDim)
        .add(sunColorUniform.mul(sunward))
        .mul(interiorKeep)
      const fogged = sceneColor.rgb
        .mul(transmittance)
        .add(inscatter.mul(float(1).sub(transmittance.g)))
      return vec4(mix(sceneColor.rgb, fogged, submerged), 1)
    })()

    // Full-output-resolution march. The caustic field's fine separated shafts
    // depend on independent per-output-pixel ray integration; a reduced target
    // has no velocity/history contract with which to reconstruct that signal
    // without mud, grain, or tile patterns.
    const resolvedRays = Fn(() => {
      const dist = viewZ.negate().min(3500).toVar()
      const ndc = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y).mul(2).sub(1))
      const far4 = cameraProjectionMatrixInverse.mul(vec4(ndc, 1, 1))
      const farView = far4.xyz.div(far4.w)
      const viewPos = farView.mul(viewZ.div(farView.z))
      const worldPos = cameraWorldMatrix.mul(vec4(viewPos, 1)).xyz
      const rayDir = worldPos.sub(cameraPosition).div(max(dist, 1e-4))
      const marchLength = dist.min(85.0)
      const stepLength = marchLength.div(godraySteps)
      const jitter = fract(
        sin(screenUV.x.mul(1741.37).add(screenUV.y.mul(921.13))).mul(43758.55),
      )
      const shaft = float(0).toVar()
      // `submerged` comes from one texel and is spatially constant across the
      // draw, so every invocation takes the same branch. This preserves the
      // exact underwater loop while eliminating all caustic texture samples
      // from above-water frames.
      If(submerged.greaterThan(0.001), () => {
        Loop({ start: 0, end: godraySteps }, (loopVars) => {
          const i = (loopVars as { i: Node<'int'> }).i
          const t = stepLength.mul(float(i).add(jitter))
          const samplePos = cameraPosition.add(rayDir.mul(t))
          const light = raySampler(samplePos).g
          shaft.addAssign(light.mul(exp(t.mul(-0.03))))
        })
      })
      const interiorKeep = float(1).sub(this.interior.mul(0.94))
      const rays = sunColorUniform
        .mul(shaft.mul(stepLength).mul(0.007))
        .mul(interiorKeep)
        .mul(submerged)
      return rays
    })()

    const withMedium = vec4(foggedNode.rgb.add(resolvedRays), 1)
    const bloomNode = bloom(withMedium, 0.35, 0.55, 1.0)
    const hdr = withMedium.add(bloomNode)
    const exposed = hdr.mul(exp2(gradeParams.exposureEV))
    const mapped = renderOutput(exposed, AgXToneMapping, SRGBColorSpace)
    const graded = dreamGrade(mapped)
    const rawMapped = renderOutput(sceneColor, AgXToneMapping, SRGBColorSpace)
    const fogMapped = renderOutput(foggedNode, AgXToneMapping, SRGBColorSpace)
    const raysMapped = renderOutput(vec4(resolvedRays, 1), AgXToneMapping, SRGBColorSpace)
    const causticsMapped = renderOutput(
      vec4(caustics.textureNode.rgb, 1),
      AgXToneMapping,
      SRGBColorSpace,
    )
    const depthMapped = vec4(vec3(scenePass.getLinearDepthNode()), 1)

    const selected = Fn(() => {
      const result = graded.toVar()
      If(this.debugMode.equal(1), () => result.assign(rawMapped))
      If(this.debugMode.equal(2), () => result.assign(fogMapped))
      If(this.debugMode.equal(3), () => result.assign(raysMapped))
      If(this.debugMode.equal(4), () => result.assign(causticsMapped))
      If(this.debugMode.equal(5), () => result.assign(depthMapped))
      return result
    })()

    this.pipeline = new PostProcessing(renderer, selected)
    this.pipeline.outputColorTransform = false

    this.particulates = this.buildParticulates(
      options.particulateCount ?? 18_000,
      submerged,
    )
    scene.add(this.particulates)
  }

  /**
   * Caustic light on any lit material: modulates the received sun shadow, so
   * caustics inherit occlusion for free and never glow in occluded interiors.
   * Every underwater lit material must opt in.
   */
  applyCaustics(material: MeshStandardNodeMaterial, strength = 1.4): void {
    const sampler = this.causticSampler
    material.receivedShadowNode = Fn(([shadow]: [Node<'float'>]) => {
      const caustic = sampler(positionWorld).g
      return mix(float(1), shadow, seabedShadowCaptureKeep).mul(
        caustic.mul(strength).add(1.0),
      )
    }) as unknown as typeof material.receivedShadowNode
  }

  /** Enclosed interiors fade the open-sea glow as the camera goes deep. */
  setInterior(value: number): void {
    this.interior.value = Math.min(1, Math.max(0, value))
  }

  setDebugMode(mode: string): void {
    this.debugMode.value = underwaterDebugModes.get(mode) ?? 0
  }

  update(elapsed: number): void {
    this.timeUniform.value = elapsed
  }

  render(): void {
    void this.pipeline.render()
  }

  private buildParticulates(count: number, submerged: Node<'float'>): InstancedMesh {
    const material = new MeshBasicNodeMaterial()
    material.blending = AdditiveBlending
    material.depthWrite = false
    material.transparent = true

    const boxSize = float(60)
    const half = boxSize.div(2)
    const seed = vec3(
      hash(instanceIndex.add(1)),
      hash(instanceIndex.add(7919)),
      hash(instanceIndex.add(104729)),
    )
    const base = seed.mul(boxSize)
    const drift = currentFlow(base, this.timeUniform)
      .mul(4.0)
      .add(vec3(0, this.timeUniform.mul(0.06), 0))
    const wrapped = fract(base.add(drift).sub(cameraPosition).div(boxSize))
      .mul(boxSize)
      .sub(half)
    const center = cameraPosition.add(wrapped)
    const size = hash(instanceIndex.add(31)).mul(0.5).add(0.5).mul(0.02)

    material.positionNode = center.add(positionGeometry.mul(size))

    const camDist = wrapped.length()
    const fade = smoothstep(half.mul(0.95), half.mul(0.45), camDist)
    const depthGlow = exp(center.y.mul(0.04)).min(1)
    // Node materials blend via opacityNode — color alpha alone is ignored.
    material.colorNode = vec4(vec3(0.7, 0.82, 0.84).mul(0.5).mul(depthGlow), 1.0)
    material.opacityNode = fade.mul(submerged)

    const mesh = new InstancedMesh(new TetrahedronGeometry(1, 0), material, count)
    mesh.frustumCulled = false
    return mesh
  }

  dispose(): void {
    this.scene.remove(this.particulates)
    this.particulates.geometry.dispose()
    if (Array.isArray(this.particulates.material)) {
      for (const material of this.particulates.material) material.dispose()
    } else {
      this.particulates.material.dispose()
    }
    this.pipeline.dispose()
  }
}
