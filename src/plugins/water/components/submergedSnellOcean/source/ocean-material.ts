import { DoubleSide } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  If,
  cameraProjectionMatrix,
  cameraProjectionMatrixInverse,
  cameraPosition,
  cameraViewMatrix,
  cameraWorldMatrix,
  dot,
  exp,
  float,
  getViewPosition,
  log2,
  max,
  min,
  mix,
  modelWorldMatrix,
  mrt,
  normalize,
  normalView,
  positionLocal,
  pow,
  reflect,
  refract,
  screenUV,
  smoothstep,
  step,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { valueNoise2 } from './noise'
import { skyRadiance } from './sky-radiance'
import { sunColorUniform, sunDirectionUniform } from './sun'
import { seabedRippleSlope } from './seabed-surface'
import {
  AIR_IOR,
  AQUATIC_AMBIENT_DOWN,
  AQUATIC_AMBIENT_UP,
  AQUATIC_EXTINCTION,
  WATER_IOR,
} from './optical-constants'
import type { InterfaceStructureNodes } from './interface-structure-layer'

import { createOceanFoam } from './ocean-foam'
import { OCEAN_FLAT_EDGE_MARGIN } from './ocean-skirt-geometry'
import { SEABED_DIRECT_SHARE } from './seabed-radiance'
import type { WakeFoamMap } from './wake-foam-map'
import type { WaveSim } from './wave-sim'


/**
 * Node bundles the ABOVE-WATER optical tier supplies. Both are world-anchored
 * by contract: `reflection` is a bounded planar mirror render of only the
 * objects that can break the surface, and `undersea` is a world-XZ-indexed
 * capture of everything below the waterline plus its canopy height. Neither may
 * ever be a screen-space trace — see the note on this function.
 *
 * A permanently submerged view leaves both undefined; the transmitted body then
 * stays on the palette and the reflection on the analytic sky.
 */
export interface OceanReflectionNodes {
  /** 1 while the mirror target holds a current render. */
  active: Node<'float'>
  /** Mirrored radiance, alpha carrying coverage. */
  color: ReturnType<typeof texture>
}

export interface UnderseaFieldNodes {
  /** World-anchored radiance of the bottom at an explicit LOD. */
  radiance: (worldXZ: Node<'vec2'>, lod: Node<'float'>) => Node<'vec3'>
  /** Topmost underwater surface of any kind at a world XZ. */
  canopyHeight: (worldXZ: Node<'vec2'>) => Node<'float'>
  /** Metres per texel of the capture, for the landing-point LOD. */
  texelSize: number
}

/**
 * Angular size of one output pixel (radians). Every footprint in this file —
 * cascade LOD, normal flatten, and the transmitted field's own LOD — is one
 * pixel's cone carried to wherever it lands.
 */
const PIXEL_ANGLE = 0.001

/** Water body palette (linear HDR-ish, tuned for the golden afternoon). */
const DEEP = vec3(0.005, 0.045, 0.09)
const SHALLOW = vec3(0.014, 0.13, 0.17)
const SSS_TINT = vec3(0.035, 0.2, 0.22)

export interface OceanMaterialOptions {
  /** Full three-cascade sampling + foam; false = far skirt (cascade 0 only). */
  detailed: boolean
  /** Opposite-medium opaque structures forward-refracted into screen space. */
  interfaceStructures?: InterfaceStructureNodes
  /** Camera-medium authority: 0 above the displaced surface, 1 below it. */
  submerged: Node<'float'>
  /**
   * World-anchored capture of everything below the waterline, giving the
   * detailed sheet its transmitted bottom. Absent on the skirt, which keeps
   * the far-field palette.
   */
  undersea?: UnderseaFieldNodes
  /**
   * Bare seabed height (baked terrain). Only the sand carries the ripple band
   * the undersea capture deliberately flattened, so the two heights together
   * say where re-adding it is legitimate.
   */
  seabedHeight?: (worldXZ: Node<'vec2'>) => Node<'float'>
  /**
   * Sun visibility at a displaced surface point. Anything standing in the
   * water casts a real shadow ON the surface, which a
   * `MeshBasicNodeMaterial` gets no other way.
   */
  sunShadow?: (worldPosition: Node<'vec3'>) => Node<'float'>
  /** Mirrored render of everything that breaks the surface. */
  reflection?: OceanReflectionNodes
  /**
   * World-anchored vessel wake foam field, merged into the whitecap foam
   * coverage (detailed sheet only) so wake trails ARE ocean foam.
   */
  wakeFoam?: WakeFoamMap | null
  /**
   * Half-size of the detailed mesh: fine cascades fade to zero approaching
   * this edge so the surface exactly matches the cascade-0-only skirt at the
   * seam. Zero disables the fade (skirt).
   */
  edgeFadeHalfSize?: number
  /** Compile-time isolation view used by fixed visual-validation captures. */
  debugMode?: OceanOpticsDebugMode
}

export type OceanOpticsDebugMode =
  | 'final'
  | 'fresnel'
  | 'reflection'
  | 'transmission'
  | 'interface'
  | 'validity'
  | 'foam'

export function oceanOpticsDebugMode(pass: string): OceanOpticsDebugMode {
  switch (pass) {
    case 'water-foam':
      return 'foam'
    case 'water-fresnel':
      return 'fresnel'
    case 'water-reflection':
      return 'reflection'
    case 'water-transmission':
      return 'transmission'
    case 'water-interface':
      return 'interface'
    case 'water-validity':
      return 'validity'
    default:
      return 'final'
  }
}

/**
 * The ocean surface, shaded per the spectral-ocean optics contract:
 * fold-aware normals from summed cascade derivatives, side-aware Fresnel,
 * crest subsurface scatter, Jacobian foam with history, and — from below —
 * the true Snell's window with total internal reflection outside it.
 *
 * BOTH optical sources above water are world-anchored, and neither may be
 * gated on a screen-space validity test. Reflection reads a mirrored render
 * (sea/oceanReflection.ts) over analytic skyRadiance; transmission reads the
 * undersea radiance field (sea/underseaRadiance.ts). The screen-space traces
 * they replaced projected a ray DIRECTION and required its vanishing point to
 * be inside the frustum — a purely angular test against camera pitch, so from
 * one fixed viewpoint a tilt of the head grew a band of seabed out of flat
 * tint and switched every reflection off. Standing still and looking around
 * must never change what the water is made of.
 */
export function createOceanSurfaceMaterial(
  sim: WaveSim,
  timeUniform: Node<'float'>,
  options: OceanMaterialOptions,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  material.side = DoubleSide
  material.fog = false
  // Alpha is one and depth still writes, so the ocean is visually and
  // depth-wise opaque; the transparent queue is only render-order ownership,
  // placing the sheet ahead of the effects (particles, glass, foam) that must
  // remain able to appear in front of it.
  material.transparent = true
  material.depthWrite = true
  // A transparent DoubleSide material normally draws back and front in two
  // passes. This is a single geometric sheet, so the second pass is pure
  // overdraw of an identical result.
  material.forceSinglePass = true
  // Screen-space AO estimates missing *diffuse* ambient light. This material
  // owns reflective/transmissive water optics, so cavity-multiplying its final
  // color is physically wrong and exposes GTAO's sampling lattice at grazing
  // incidence. Override the normal MRT's spare alpha receiver channel only.
  material.mrtNode = mrt({ normal: vec4(normalView, 0) })

  const patch = sim.patchLengths
  const cascadeCount = options.detailed ? 3 : 1

  // ── Vertex: displacement from summed cascades ──────────────────────────
  const baseWorld = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz
  const xz = baseWorld.xz

  // The skirt is FLAT (vertex-sampling waves at 187 m spacing is pure
  // aliasing); the inner mesh fades ALL displacement to zero at its edge so
  // the two surfaces meet exactly.
  const edgeHalf = options.edgeFadeHalfSize ?? 0
  const edgeKeep =
    edgeHalf > 0
      ? float(1).sub(
          smoothstep(
            edgeHalf - 170,
            edgeHalf - OCEAN_FLAT_EDGE_MARGIN,
            max(positionLocal.x.abs(), positionLocal.z.abs()),
          ),
        )
      : float(0)

  // Spectral LOD applies to vertex displacement too, and by PIXEL FOOTPRINT
  // like the fragment side (the base plane sits at y = 0, so the grazing gap
  // is just camera height). Displaced geometry aliases at the horizon even
  // after normals flatten: silhouette teeth, and vHeight-driven body-color
  // stripes — the residual comb. Cascade 0 fades too; only edgeKeep used to
  // bound it, which left raw swell geometry out to the mesh diagonals.
  const vertexDistance = cameraPosition.sub(baseWorld).length()
  const vertexGap = cameraPosition.y.abs().max(0.5)
  const vertexFootprint = vertexDistance
    .mul(vertexDistance)
    .mul(PIXEL_ANGLE)
    .div(vertexGap)
  const vertexKeeps = [
    // Match the above-water cascade-0 normal cutoff. Keeping coarse vertex
    // displacement to 18 m/pixel left sub-pixel triangle rows even after the
    // fragment normal and height response had flattened, producing both the
    // dark comb and the faint gray band at the inner-mesh transition.
    float(1).sub(smoothstep(2.5, 5.5, vertexFootprint)),
    float(1).sub(smoothstep(0.35, 1.2, vertexFootprint)),
    float(1).sub(smoothstep(0.1, 0.4, vertexFootprint)),
  ]

  let displacement: Node<'vec3'> = sim.displacementNodes[0]
    .sample(xz.div(patch[0]))
    .xyz.mul(edgeKeep)
    .mul(vertexKeeps[0])
  for (let i = 1; i < cascadeCount; i++) {
    displacement = displacement.add(
      sim.displacementNodes[i].sample(xz.div(patch[i])).xyz.mul(edgeKeep).mul(vertexKeeps[i]),
    )
  }

  const foamHistory = options.detailed
    ? sim.displacementNodes[0].sample(xz.div(patch[0])).w.min(
        sim.displacementNodes[1].sample(xz.div(patch[1])).w,
      )
    : float(1)

  material.positionNode = positionLocal.add(displacement)

  const vWorldXZ = varying(xz) as unknown as Node<'vec2'>
  const vHeight = varying(displacement.y) as unknown as Node<'float'>
  const vFoam = varying(foamHistory) as unknown as Node<'float'>
  const vWorld = varying(baseWorld.add(displacement)) as unknown as Node<'vec3'>

  // ── Fragment ───────────────────────────────────────────────────────────
  const vEdgeKeep = varying(edgeKeep) as unknown as Node<'float'>
  const vDistance = varying(
    cameraPosition.sub(baseWorld.add(displacement)).length(),
  ) as unknown as Node<'float'>

  // Spectral LOD by PIXEL FOOTPRINT, not distance. The cascade maps carry no
  // mips; sampling them where one output pixel spans more than a band's
  // wavelength beats into comb/moiré patterns. At grazing incidence the
  // vertical footprint on the surface is distance²·pixelAngle / heightGap
  // (|viewDir.y| = heightGap/distance): a 4.4 m deck eye is under-sampled at
  // 200 m while a diver sees the same span steeply and keeps full detail —
  // pure distance fades can never serve both (the "horizon comb" artifact).
  const heightGap = cameraPosition.y.sub(vWorld.y).abs().max(0.5)
  const pixelFootprint = vDistance.mul(vDistance).mul(PIXEL_ANGLE).div(heightGap)
  // Shortest wavelengths per cascade: ~41 m / ~2.8 m / ~0.83 m.
  // Cascade 0 needs a stricter keep for the narrow above-water GGX lobe:
  // attenuate while its shortest wave still spans ~16 pixels and finish by
  // ~8 pixels. Sampling first and flattening the reconstructed normal later
  // preserves the alias, which is what produced the visible horizon comb.
  const keepCascade0Above = float(1).sub(smoothstep(2.5, 5.5, pixelFootprint))
  const keepCascade1 = float(1).sub(smoothstep(0.35, 1.2, pixelFootprint))
  const keepCascade2 = float(1).sub(smoothstep(0.1, 0.4, pixelFootprint))
  const cascadeKeeps = [float(1), keepCascade1, keepCascade2]

  // Bind each raw cascade sample once: the shared optical normal and the
  // above-water-only capillary variant below both consume these fetches.
  const derivativeSamples: Node<'vec4'>[] = []
  for (let i = 0; i < cascadeCount; i++) {
    derivativeSamples.push(
      sim.derivativeNodes[i]
        .sample(vWorldXZ.div(patch[i]))
        .mul(vEdgeKeep)
        .toVar() as unknown as Node<'vec4'>,
    )
  }
  const derivative0 = derivativeSamples[0]
  let derivatives: Node<'vec4'> = derivative0
  for (let i = 1; i < cascadeCount; i++) {
    derivatives = derivatives.add(
      derivativeSamples[i].mul(cascadeKeeps[i]),
    )
  }
  const aboveDerivatives = derivatives.sub(
    derivative0.mul(float(1).sub(keepCascade0Above)),
  )

  // Fold-aware normal (slope / (1 + λ·dD/dx)). Optical side is a camera
  // medium state, never a per-triangle facing test: right at the crossing a
  // displaced sheet can expose nearby backfaces before the camera itself is
  // submerged. The surface must not mix two optical media in one frame.
  const slopeX = derivatives.x.div(max(0.18, derivatives.z.add(1)))
  const slopeZ = derivatives.y.div(max(0.18, derivatives.w.add(1)))
  const upNormal = normalize(vec3(slopeX.negate(), 1, slopeZ.negate()))
  const isAbove = float(1).sub(options.submerged)
  const sideSign = isAbove.mul(2).sub(1)
  const rawNormal = upNormal.mul(sideSign)

  const toCamera = cameraPosition.sub(vWorld)
  const viewDistance = toCamera.length()
  const viewDir = toCamera.div(viewDistance)

  // Normal flatten rides the same footprint (cascade-0 bottoms out ~41 m):
  // past it the surface hands off to the smooth mirror + analytic sky. The
  // 41 m tail still combs above ~λ/8, so complete the flatten by 16.
  const distanceFade = smoothstep(5.0, 16.0, pixelFootprint)
  const normal = normalize(mix(rawNormal, vec3(0, sideSign, 0), distanceFade))

  // Below-surface optics use this same resolved normal. Water -> air expands
  // angles with an unbounded derivative at the critical angle, but that is a
  // property of the transmitted IMAGE, not of the interface: where the window
  // rim lies is a coverage question answered by derivative-filtered critical-
  // angle masking, and the one genuinely unresolvable source — the delta-light
  // sun lobe — is broadened at its own site below. A second below-surface
  // normal whose cascade footprint is scaled by the squared Snell stretch is a
  // defect: that product reaches 3-45 at the rim against keeps authored in
  // metres per pixel, so past ~10 m of depth every cascade zeroes and the whole
  // outer window refracts off a mathematically flat plane — a clean analytic
  // conic where the sea should show a live wave-shaped silhouette. Never filter
  // the interface to stabilize what is transported through it.

  const sunDir = sunDirectionUniform

  // ── Above-surface optical normal ──────────────────────────────────────
  // The FFT resolves down to ~0.83 m. Add two weak, independently advected
  // capillary bands below that limit so close water carries real small-scale
  // slope variation without rewriting the swell. Each band disappears once
  // its shortest structure is below the current pixel footprint.
  const aboveSlopeX = aboveDerivatives.x.div(max(0.18, aboveDerivatives.z.add(1)))
  const aboveSlopeZ = aboveDerivatives.y.div(max(0.18, aboveDerivatives.w.add(1)))
  let aboveNormal: Node<'vec3'> = normalize(
    vec3(aboveSlopeX.negate(), 1, aboveSlopeZ.negate()),
  )
  if (options.detailed) {
    const detailUvA = vWorldXZ
      .mul(1.7)
      .add(vec2(0.11, -0.07).mul(timeUniform))
    const detailUvB = vWorldXZ
      .mul(4.7)
      .add(vec2(-0.19, 0.13).mul(timeUniform))
    const heightA = valueNoise2(detailUvA)
    const detailA = vec2(
      valueNoise2(detailUvA.add(vec2(0.12, 0))).sub(heightA),
      valueNoise2(detailUvA.add(vec2(0, 0.12))).sub(heightA),
    ).div(0.12)
    const heightB = valueNoise2(detailUvB)
    const detailB = vec2(
      valueNoise2(detailUvB.add(vec2(0.08, 0))).sub(heightB),
      valueNoise2(detailUvB.add(vec2(0, 0.08))).sub(heightB),
    ).div(0.08)
    const detailKeepA = float(1)
      .sub(smoothstep(0.025, 0.12, pixelFootprint))
      .mul(vEdgeKeep)
    const detailKeepB = float(1)
      .sub(smoothstep(0.008, 0.035, pixelFootprint))
      .mul(vEdgeKeep)
    const capillarySlope = detailA
      .mul(detailKeepA)
      .add(detailB.mul(detailKeepB).mul(0.35))
    aboveNormal = normalize(
      normal.add(vec3(capillarySlope.x, 0, capillarySlope.y).mul(0.045)),
    )
  }

  // Exact, unpolarised dielectric Fresnel. Y is the physical transmission-
  // domain mask (zero under total internal reflection); Z is the transmitted
  // cosine, which the water -> air side reuses for its angular stretch.
  const dielectricFresnel = (
    cosIncident: Node<'float'>,
    incidentIor: number,
    transmittedIor: number,
  ): Node<'vec3'> => {
    const etaI = float(incidentIor)
    const etaT = float(transmittedIor)
    const etaRatio = etaI.div(etaT)
    const sinTransmitted2 = etaRatio
      .mul(etaRatio)
      .mul(float(1).sub(cosIncident.mul(cosIncident)))
    // The critical-angle boundary moves across the screen with the FFT
    // normal. Filter that binary domain test over roughly one output pixel;
    // exact Fresnel still drives transmission energy to zero at the physical
    // limit, while the sampling mask no longer toggles an entire pixel.
    const criticalWidth = sinTransmitted2
      .fwidth()
      .mul(1.5)
      .max(0.001)
      .min(0.05)
    const canTransmit = float(1).sub(
      smoothstep(
        float(1).sub(criticalWidth),
        float(1).add(criticalWidth),
        sinTransmitted2,
      ),
    )
    const cosTransmitted = float(1).sub(sinTransmitted2).max(0.0).sqrt()
    const rs = etaI
      .mul(cosIncident)
      .sub(etaT.mul(cosTransmitted))
      .div(etaI.mul(cosIncident).add(etaT.mul(cosTransmitted)).max(1e-4))
    const rp = etaT
      .mul(cosIncident)
      .sub(etaI.mul(cosTransmitted))
      .div(etaT.mul(cosIncident).add(etaI.mul(cosTransmitted)).max(1e-4))
    return vec3(
      rs.mul(rs).add(rp.mul(rp)).mul(0.5),
      canTransmit,
      cosTransmitted,
    ) as Node<'vec3'>
  }

  const incident = viewDir.negate()
  const aboveNoV = max(dot(viewDir, aboveNormal), 0.001)
  const aboveFresnelResult = dielectricFresnel(aboveNoV, AIR_IOR, WATER_IOR)
  const aboveFresnel = aboveFresnelResult.x
  const belowNoV = max(dot(viewDir, normal), 0.001)
  const belowFresnelResult = dielectricFresnel(belowNoV, WATER_IOR, AIR_IOR)
  const interfaceFresnel = belowFresnelResult.x
  const insideWindow = belowFresnelResult.y

  /**
   * Screen position of a DIRECTION's vanishing point, guarded against sources
   * behind the camera.
   *
   * NOTE — this is only ever used for a DIFFERENCE between two nearby
   * directions. The deleted screen-space traces used the same projection as a
   * validity gate ("is the vanishing point on screen?"), which is a purely
   * angular test against wherever the camera happens to point: air->water
   * refraction bends every ray to within 48.6 degrees of straight down, so at
   * a 55 degree FOV nothing traced near the horizon and the valid set swept in
   * with pitch. Never gate transported radiance on this projection.
   */
  const projectDirection = (direction: Node<'vec3'>): Node<'vec2'> => {
    const view = cameraViewMatrix.mul(vec4(direction, 0)).xyz
    const clip = cameraProjectionMatrix.mul(vec4(view, 1))
    const ndc = clip.xy.div(max(clip.w, 0.05))
    return vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)))
  }

  /**
   * The dedicated structure pass has already solved the optical path and
   * rasterized its vertices at their refracted screen positions. Sample it at
   * this water pixel directly; depth only reconstructs the source path length
   * needed by above-water Beer-Lambert attenuation.
   */
  const sampleInterfaceStructure = (
    enabled: Node<'float'>,
    reconstructPath = false,
  ): { sample: Node<'vec4'>; path: Node<'float'> } => {
    const structures = options.interfaceStructures
    if (!structures) return { sample: vec4(0), path: float(0) }

    const sample = Fn(() => {
      const result = vec4(0).toVar()
      If(enabled.greaterThan(0.001), () => {
        const rawColor = structures.color.sample(screenUV)
        const geometryValidity = rawColor.a.mul(structures.active)
        If(geometryValidity.greaterThan(0.001), () => {
          // Linear filtering against a transparent-black target premultiplies
          // edge color. Undo that before the ocean applies coverage once.
          const sourceColor = rawColor.rgb.div(max(rawColor.a, 0.001))
          result.assign(vec4(sourceColor, geometryValidity))
        })
      })
      return result
    })()
    const path = reconstructPath
      ? Fn(() => {
          const result = float(0).toVar()
          If(enabled.greaterThan(0.001), () => {
            const sourceDepth = structures.depth.sample(screenUV).r
            const sourceView = getViewPosition(
              screenUV,
              sourceDepth,
              cameraProjectionMatrixInverse,
            )
            const sourceWorld = cameraWorldMatrix.mul(vec4(sourceView, 1)).xyz
            result.assign(sourceWorld.sub(vWorld).length().max(0.02))
          })
          return result
        })()
      : float(0)
    return {
      sample,
      path,
    }
  }

  const belowRefracted = refract(incident, normal, WATER_IOR / AIR_IOR)
  // Underwater scene-scale subjects are forward-projected into the dedicated
  // layer below. A current-view depth snapshot cannot solve an offscreen air
  // source, and feeding discontinuous depth back into another lookup is what
  // folds a distant structure into animated crystal/paper-ball geometry.
  const belowSceneSample = vec4(0)
  const belowSceneValid = float(0)
  const belowStructure = options.interfaceStructures
    ? sampleInterfaceStructure(
        options.interfaceStructures.active.mul(options.submerged).mul(insideWindow),
      )
    : { sample: vec4(0), path: float(0) }
  const belowStructureSample = belowStructure.sample
  const belowStructureValid = max(belowStructureSample.a, 0.0)

  const aboveRefracted = refract(incident, aboveNormal, AIR_IOR / WATER_IOR)
  // The undersea field below carries the whole transmitted bottom. The
  // forward-projected structure layer still substitutes over it for meshes
  // that straddle the waterline (piles, cages, frames), where close-range
  // parallax matters and a top-down capture has none. That layer rasterizes
  // its own vertices at their refracted screen position, so its coverage is
  // exactly as available as the water pixel needing it — the property the
  // deleted backward trace never had.
  const aboveStructureEnabled = options.detailed
    ? isAbove.mul(step(0.03, float(1).sub(aboveFresnel)))
    : float(0)
  const aboveStructure = options.interfaceStructures
    ? sampleInterfaceStructure(
        options.interfaceStructures.active.mul(aboveStructureEnabled),
        true,
      )
    : { sample: vec4(0), path: float(0) }
  const aboveStructureSample = aboveStructure.sample
  const aboveStructureContribution = max(aboveStructureSample.a, 0.0).clamp(0, 1)

  const reflectedDirection = reflect(incident, aboveNormal)

  // ── Above-surface shading ──────────────────────────────────────────────

  const aboveHeight = vHeight.mul(keepCascade0Above)
  const heightMask = smoothstep(-1.7, 1.5, aboveHeight)
  const bodyBase = mix(DEEP, SHALLOW, heightMask)

  // Keep this resolved-wave scatter for the underwater TIR body.
  // Above-water optics use the capillary-enriched normal below.
  const crestLight = normalize(sunDir.negate().add(normal.mul(0.4)))
  const crestScatter = pow(max(dot(viewDir, crestLight), 0.0), 4.5)
    .mul(1.0)
    .mul(smoothstep(-0.1, 1.1, vHeight))

  // A shadow cast ON the water is the one shadow that reads correctly from
  // above it: it is co-located with the surface, so nothing has to place it at
  // depth (contrast the seabed's cast shadows, deliberately absent from the
  // undersea capture — see sea/medium.ts). It applies to the sun's DIRECT
  // contribution only. The sky reflection is untouched, because the sky is not
  // what got blocked; the mirrored render already handles the occluder's own
  // reflected image.
  const sunShadow = (
    options.sunShadow ? options.sunShadow(vWorld) : float(1)
  ).clamp(0, 1)

  const noL = max(dot(aboveNormal, sunDir), 0.0)
  const fresnelF0 = float(((AIR_IOR - WATER_IOR) / (AIR_IOR + WATER_IOR)) ** 2)
  const aboveCrestLight = normalize(sunDir.negate().add(aboveNormal.mul(0.4)))
  const aboveCrestScatter = pow(max(dot(viewDir, aboveCrestLight), 0.0), 4.5)
    .mul(smoothstep(-0.1, 1.1, aboveHeight))
  const forwardScatter = pow(max(dot(viewDir, sunDir.negate()), 0.0), 4.0)
    .mul(smoothstep(-0.15, 0.9, aboveHeight))
    .mul(float(1).sub(aboveFresnel))
    .mul(0.32)
  const scatterLight = noL.mul(0.5).add(0.5)
  const surfaceScatter = SSS_TINT.mul(aboveCrestScatter.add(forwardScatter))
    .mul(scatterLight)
    .mul(sunShadow)
  const body = bodyBase.add(surfaceScatter)

  // The analytic sky remains the guaranteed reflection source; the mirrored
  // render replaces it only where something actually breaks the surface.
  // discStrength 0: sunGlint below IS the disc's delta-light response.
  const skyReflection = skyRadiance(reflectedDirection, float(0))
  const reflection = options.reflection
  const reflectedRadiance: Node<'vec3'> = reflection
    ? Fn(() => {
        const result = skyReflection.toVar()
        // Both gates are draw-constant (a 1x1 waterline texel and a uniform),
        // so this branch is uniform and the sample's implicit derivatives stay
        // defined.
        If(isAbove.mul(reflection.active).greaterThan(0.001), () => {
          // A mirrored camera renders the real world, which IS the main camera
          // rendering the mirrored world — so a flat mirror is sampled at the
          // water pixel's own screen position (x flipped: one reflection flips
          // handedness). Waves only rotate the reflected ray, so their entire
          // contribution is the DIFFERENCE between the flat and wave-tilted
          // vanishing points: a local offset, never a validity test.
          const flatReflected = reflect(incident, vec3(0, 1, 0))
          const waveOffset = projectDirection(reflectedDirection).sub(
            projectDirection(flatReflected),
          )
          // The offset is exact for the ray but assumes the flat-mirror source
          // distance, so it over-travels for near sources. Bounding it to a
          // twentieth of the screen keeps a steep crest from smearing the
          // near reflection across the frame.
          const boundedOffset = waveOffset.mul(
            min(float(1), float(0.05).div(waveOffset.length().max(1e-5))),
          )
          const mirroredUv = vec2(
            screenUV.x.oneMinus().sub(boundedOffset.x),
            screenUV.y.add(boundedOffset.y),
          ).clamp(vec2(0.001), vec2(0.999))
          const raw = reflection.color.sample(mirroredUv as Node<'vec2'>)
          const coverage = raw.a.clamp(0, 1)
          If(coverage.greaterThan(0.001), () => {
            // Linear filtering against a transparent-black target premultiplies
            // edge color; undo it before coverage is applied once.
            result.assign(
              mix(skyReflection, raw.rgb.div(max(raw.a, 0.001)), coverage),
            )
          })
        })
        return result
      })()
    : skyReflection

  // Air -> water transmission is WORLD-anchored: every metre of it comes from
  // the undersea radiance field, indexed by world XZ. Nothing here can change
  // because the camera turned. The forward-projected structure layer is the
  // one substitution, and it is world-anchored too.
  const undersea = options.undersea
  const seabedHeight = options.seabedHeight
  const transmittedRadiance: Node<'vec3'> = undersea && seabedHeight
    ? Fn(() => {
        const result = body.toVar()
        // `isAbove` comes from the 1x1 waterline texture and is constant
        // across the draw, so this branch is uniform: underwater frames pay
        // for none of the seabed transport they would immediately discard.
        If(isAbove.greaterThan(0.001), () => {
          // Landing point in two fixed-point steps, aimed at the CANOPY — the
          // topmost underwater surface — not the bare seabed: a roof at -8 m
          // ends the ray eighteen metres before the sand does. Air->water
          // refraction is never shallower than ~41 degrees below horizontal, so
          // clamping the descent to 0.3 bounds the step and two fetches
          // converge to metre level, ample for a radiance grading field.
          const downSlope = aboveRefracted.y.min(-0.3)
          const firstPath = undersea
            .canopyHeight(vWorldXZ)
            .sub(vWorld.y)
            .div(downSlope)
            .clamp(0.5, 300.0)
          const midLandingXZ = vWorldXZ.add(aboveRefracted.xz.mul(firstPath))
          const canopyPath = undersea
            .canopyHeight(midLandingXZ)
            .sub(vWorld.y)
            .div(downSlope)
            .clamp(0.5, 320.0)
            .toVar()
          const landingXZ = vWorldXZ.add(aboveRefracted.xz.mul(canopyPath))
          // Every remaining lookup reads the SETTLED landing point, including
          // this one: the sand/structure test and the ripple band it gates must
          // agree per texel with the radiance sample they modulate, and near a
          // structure's edge the first iterate is metres away from it.
          const canopyY = undersea.canopyHeight(landingXZ).toVar()

          // The field is world-anchored, so its LOD is a world footprint too:
          // one pixel's cone down the air leg, compressed by refraction along
          // the water leg, then spread over the bottom by the landing angle.
          const landingFootprint = float(PIXEL_ANGLE)
            .mul(vDistance.add(canopyPath.mul(AIR_IOR / WATER_IOR)))
            .div(downSlope.negate())
          const landingLod = log2(
            max(landingFootprint.div(undersea.texelSize), 1.0),
          ).clamp(0.0, 11.0)

          // Restore the sand's ripple band, which the capture flattened
          // because 0.78 m/texel cannot carry a ~3 m wave. It modulates DIRECT
          // sunlight only: in a structure's shadow there is no sun for a ripple
          // to brighten, and letting it do so anyway is exactly the painted-on
          // look a world-anchored field is supposed to avoid. Ripples belong to
          // the sand alone, so this is gated on the canopy being the seabed.
          //
          // The caustic web is deliberately NOT restored here — see the note in
          // sea/caustics.ts. A surface cannot transmit a web its own slopes
          // scramble; only the mean lift the capture already holds survives.
          const isSand = float(1).sub(
            smoothstep(0.4, 1.4, canopyY.sub(seabedHeight(landingXZ))),
          )
          const rippleSlope = seabedRippleSlope(landingXZ, landingFootprint)
          const rippleNormal = normalize(vec3(rippleSlope.x, 1, rippleSlope.y))
          const rippleRatio = mix(
            float(1),
            max(dot(rippleNormal, sunDir), 0.0).div(max(sunDir.y, 0.05)),
            isSand,
          )
          const restoredDetail = mix(float(1), rippleRatio, SEABED_DIRECT_SHARE)

          // The structure layer replaces the field for meshes that straddle
          // the waterline, where a top-down capture has no parallax.
          const structureShare = aboveStructureContribution
          const bottomColor = mix(
            undersea.radiance(landingXZ, landingLod).mul(restoredDetail),
            aboveStructureSample.rgb,
            structureShare,
          )
          const waterPath = mix(
            canopyPath,
            aboveStructure.path.clamp(0.05, 3500.0),
            structureShare,
          )
          const aquaticTransmittance = exp(
            vec3(...AQUATIC_EXTINCTION).mul(waterPath).negate(),
          )
          // Both legs cross water. The undersea field lights the bottom as if
          // it stood in air, so restore the missing downwelling leg from the
          // source's vertical depth and the sun's elevation before the return
          // path attenuates it. An 18% unfiltered share stands in for
          // environment and emissive energy the capture cannot separate.
          const sourceVerticalDepth = waterPath.mul(aboveRefracted.y.negate().max(0))
          const downwellingPath = sourceVerticalDepth.div(max(sunDir.y, 0.15))
          const downwellingTransmittance = exp(
            vec3(...AQUATIC_EXTINCTION).mul(downwellingPath).negate(),
          )
          const sourceLightingFilter = mix(vec3(1), downwellingTransmittance, 0.82)
          const transmittedMidpointY = vWorld.y.add(
            aboveRefracted.y.mul(waterPath.mul(0.5)),
          )
          const transmittedDepthDim = exp(transmittedMidpointY.min(0).mul(0.03))
          const transmittedUpness = smoothstep(-0.5, 0.75, aboveRefracted.y)
          // Sun-driven in-scatter from the column immediately under this
          // point, so the shadow that darkens the surface darkens the water
          // just beneath it too. The bottom itself is lit from the landing
          // point, 30-odd metres away, and is deliberately not shadowed.
          const transmittedSunward = pow(
            max(dot(aboveRefracted, sunDir), 0.0),
            6.0,
          ).mul(0.06).mul(sunShadow)
          // Crests keep a translucency lift the palette's DEEP->SHALLOW mix
          // cannot supply once transport owns the body, so the swell still
          // reads through it.
          const aquaticInscatter = mix(
            vec3(...AQUATIC_AMBIENT_DOWN),
            vec3(...AQUATIC_AMBIENT_UP),
            transmittedUpness,
          )
            .mul(transmittedDepthDim)
            .mul(heightMask.mul(0.55).add(1))
            .add(sunColorUniform.mul(transmittedSunward))
          const foggedTransmission = bottomColor
            .mul(sourceLightingFilter)
            .mul(aquaticTransmittance)
            .add(aquaticInscatter.mul(float(1).sub(aquaticTransmittance.g)))
          // Two handoffs back to the palette body, both already owned by this
          // sheet: the footprint flatten (past it the surface is the far-field
          // mirror) and the same edge keep every other detailed-only term
          // uses, which is what makes this sheet meet the palette-only skirt
          // exactly at their seam from any camera height. The keep also stops
          // the transport well short of the lagoon saucer's shallow rim, which
          // would otherwise read as a pale ring at the horizon.
          const transportKeep = float(1).sub(distanceFade).mul(vEdgeKeep)
          result.assign(
            mix(
              body,
              foggedTransmission.add(surfaceScatter.mul(0.45)),
              transportKeep,
            ),
          )
        })
        return result
      })()
    : body

  const halfVector = normalize(sunDir.add(viewDir))
  const noH = max(dot(aboveNormal, halfVector), 0.0)
  const voH = max(dot(viewDir, halfVector), 0.0)
  // A GGX lobe, never a thresholded sparkle mask. The resolved FFT slopes
  // shape the sun lane; capillary slopes break it into near-field facets.
  const roughness = float(0.075)
  const alpha2 = roughness.mul(roughness)
  const distributionDenominator = noH.mul(noH).mul(alpha2.sub(1)).add(1)
  const distribution = alpha2.div(
    distributionDenominator.mul(distributionDenominator).mul(Math.PI),
  )
  const smithK = roughness.add(1).mul(roughness.add(1)).div(8)
  const geometryV = aboveNoV.div(aboveNoV.mul(float(1).sub(smithK)).add(smithK))
  const geometryL = noL.div(noL.mul(float(1).sub(smithK)).add(smithK).max(1e-4))
  const microFresnel = fresnelF0.add(
    float(1)
      .sub(fresnelF0)
      .mul(pow(float(1).sub(voH), 5.0)),
  )
  const directSpecular = distribution
    .mul(geometryV)
    .mul(geometryL)
    .mul(microFresnel)
    .mul(noL)
    .div(max(aboveNoV.mul(noL).mul(4), 0.02))
  // The glitter path stopping dead is what actually sells a shadow on water.
  const sunGlint = sunColorUniform.mul(directSpecular).mul(3.4).mul(sunShadow)

  let above = mix(transmittedRadiance, reflectedRadiance, aboveFresnel).add(sunGlint)

  let foamDebug: Node<'vec3'> = vec3(0)
  if (options.detailed) {
    // Foam is its own system (`sea/oceanFoam.ts`): the Jacobian whitecap and
    // vessel wake answer where the surface just folded, while the windrow
    // raft, its tail, and crest tear answer what that folding left behind.
    // All four are coverage feeding one shading path, so foam remains a
    // property of this surface rather than an overlay on it.
    const foam = createOceanFoam({
      sea: sim.sea,
      time: timeUniform,
      worldXZ: vWorldXZ,
      jacobianHistory: vFoam,
      crestHeight: aboveHeight,
      steepness: vec2(aboveSlopeX, aboveSlopeZ).length(),
      convergence: aboveDerivatives.z.add(aboveDerivatives.w).negate(),
      pixelFootprint,
      edgeKeep: vEdgeKeep,
      normal: aboveNormal,
      viewDir,
      waterRadiance: above,
      sunShadow,
      wakeFoam: options.wakeFoam,
    })
    foamDebug = foam.debug
    above = mix(above, foam.color, foam.mask)
  }

  // ── Below-surface shading: the surface underside ───────────────────────
  const skyThrough = skyRadiance(belowRefracted, float(0)).mul(0.9)

  // The transmitted sun is a delta light, so its LOBE — never the interface —
  // is the part an output pixel can fail to resolve. Water -> air expands
  // angles by S = eta*cos(theta_i)/cos(theta_t), unbounded at the critical
  // angle, and for a fixed view ray a normal tilting by d moves the
  // transmitted direction by |1 - S|*d. Measure that tilt per pixel from the
  // resolved normal, convolve the lobe with the resulting spread, and rescale
  // the peak by the surviving exponent so the lobe's integrated energy is
  // conserved as it widens. Resolved water keeps the authored hard sparkle;
  // the rim hands it to a broad sheen instead of crawling. cos^n ~=
  // exp(-n*d^2/2), so the authored lobe carries variance 1/n.
  const snellAngularStretch = float(WATER_IOR / AIR_IOR)
    .mul(belowNoV)
    .div(belowFresnelResult.z.max(0.04))
    .max(1.0)
  const normalTiltPerPixel = max(normal.dFdx().length(), normal.dFdy().length())
  const transmittedSpread = snellAngularStretch
    .sub(1)
    .mul(normalTiltPerPixel)
    .mul(0.5)
  const glintExponent = float(1).div(
    float(1 / 700).add(transmittedSpread.mul(transmittedSpread)),
  )
  const windowGlint = pow(max(dot(belowRefracted, sunDir), 0.0), glintExponent)
    .mul(glintExponent.mul(24.0 / 700.0))
    .mul(sunColorUniform)

  // Only real geometry in air participates below the surface. The sky dome
  // remains on the analytic path so its sub-pixel HDR sun cannot become
  // framebuffer-sampling noise.
  const belowStructureContribution = belowStructureValid.clamp(0, 1)
  const aboveWaterStructure = max(
    belowSceneValid,
    belowStructureContribution,
  ).clamp(0, 1)
  const belowTransmissionSource = mix(
    belowSceneSample.rgb,
    belowStructureSample.rgb,
    belowStructureContribution,
  )
  const transmittedScene = mix(
    skyThrough.add(windowGlint),
    belowTransmissionSource,
    aboveWaterStructure,
  )

  // Exact unpolarised dielectric Fresnel for water -> air. Schlick alone
  // does not rise correctly into the critical angle, so it would let the
  // structure remain pasted over what should become total internal reflection.
  const interfaceTransmission = insideWindow.mul(float(1).sub(interfaceFresnel))

  // Outside the critical angle: total internal reflection. The mirror
  // reflects the UPWELLING water light — silvery teal near the medium's
  // horizontal ambient (medium.ts AMBIENT_* mix), not the deep body color.
  // A near-black ceiling here is what carved the bright "gap" band at the
  // surface silhouette against converged fog: the fogged underside must
  // start from a radiance close to what the fog converges to.
  const tirBody = vec3(0.035, 0.14, 0.19).add(SSS_TINT.mul(crestScatter).mul(0.5))

  const below = mix(tirBody, transmittedScene, interfaceTransmission)

  const debugMode = options.debugMode ?? 'final'
  let finalColor: Node<'vec3'> = mix(below, above, isAbove)
  if (debugMode === 'fresnel') {
    finalColor = vec3(mix(interfaceFresnel, aboveFresnel, isAbove))
  } else if (debugMode === 'reflection') {
    finalColor = mix(tirBody, reflectedRadiance, isAbove)
  } else if (debugMode === 'transmission') {
    finalColor = mix(transmittedScene, transmittedRadiance, isAbove)
  } else if (debugMode === 'interface') {
    const aboveInterface = aboveStructureSample.rgb.mul(aboveStructureContribution)
    const belowInterface = belowStructureSample.rgb.mul(belowStructureContribution)
    finalColor = mix(belowInterface, aboveInterface, isAbove)
  } else if (debugMode === 'foam') {
    // Above water only: the four coverage populations, unshaded and unlaced.
    // Underwater stays black — no foam term exists on the Snell/TIR side.
    finalColor = foamDebug.mul(isAbove)
  } else if (debugMode === 'validity') {
    // Above water R and G must be FLAT under pure camera rotation from a
    // fixed viewpoint — that is the whole contract this pass exists to hold.
    const aboveValidity = vec3(
      reflection ? reflection.active : float(0),
      undersea ? float(1) : float(0),
      aboveStructureContribution,
    )
    const belowValidity = vec3(
      belowSceneValid,
      belowStructureContribution,
      insideWindow,
    )
    finalColor = mix(belowValidity, aboveValidity, isAbove)
  }

  material.colorNode = vec4(finalColor, 1.0)
  return material
}
