import {
  BufferGeometry,
  Box3,
  Color,
  DepthTexture,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  RenderTarget,
  Scene,
  Sphere,
  Vector2,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import type { Node, WebGPURenderer } from 'three/webgpu'
import {
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  dot,
  float,
  Fn,
  If,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  positionWorld,
  select,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'

/**
 * The per-frame state this layer needs: the camera it projects for, the
 * renderer that owns the target, and the scene whose environment its shadowless
 * copy of the sun matches.
 */
export interface InterfaceStructureFrame {
  camera: PerspectiveCamera
  renderer: WebGPURenderer
  scene: Scene
}

import { SUN_LIGHT_INTENSITY, sunColor, sunDirection } from './sun'
import { AIR_IOR, WATER_IOR } from './optical-constants'
import type { WaveSim } from './wave-sim'

const TARGET_SCALE = 0.5
const TARGET_MAX_EDGE = 1024
const ACTIVE_SURFACE_MARGIN = 1
const ACTIVE_CAMERA_DISTANCE = 90

/**
 * Tangent reach of a water-side ray, per metre of its own distance from the
 * interface: tan(asin(n_air / n_water)). A ray inside water that connects to a
 * source in air cannot meet the surface beyond the critical angle, so its
 * crossing point is confined to this multiple of its plane distance however far
 * away the source is — the crossing radius saturates, it does not keep growing.
 */
const CRITICAL_TANGENT = Math.tan(Math.asin(AIR_IOR / WATER_IOR))

/**
 * Bisection steps for the interface crossing solve, run per proxy vertex.
 *
 * The count only means anything alongside the bracket. Bisecting the full
 * camera-to-source span leaves an absolute error proportional to horizontal
 * separation, while the refracted image of that source SHRINKS with the same
 * separation, so the solve goes coarser than the thing it is resolving: past
 * roughly 100 m the returned crossing is a staircase in source distance, whose
 * steps chop the image into bands and whose within-step slope smears each band
 * vertically. That is what folds a distant registered structure at the rim.
 * Bracketing by the critical angle instead makes the interval ~1.13x the
 * water-side plane distance — bounded by the CAMERA, identical for every vertex
 * — and fourteen halvings then land the crossing within a ten-thousandth of it,
 * a few tens of microradians of apparent direction at any range.
 */
const INTERFACE_SOLVE_STEPS = 14

interface RegisteredStructure {
  root: Object3D
  proxies: Mesh[]
  localBounds: Box3
  worldBounds: Box3
  worldSphere: Sphere
  maxCameraDistance: number
  underwaterOnly: boolean
  disposed: boolean
}

export interface InterfaceStructureRegistration {
  /** Diagnostic label for the generated optical proxies. */
  name?: string
  /** Stable transform parent shared by every source mesh. */
  root: Object3D
  /** Static opaque descendants, batched into one optical draw per material. */
  meshes: readonly Mesh[]
  /** Optional source-space tessellation before the nonlinear vertex warp. */
  maxEdgeLength?: number
  /** Discard source geometry below this root-local y before tessellation. */
  minimumLocalY?: number
  /** Use the mean plane for scene-scale imagery instead of per-vertex waves. */
  stableMeanSurface?: boolean
  /**
   * Give a stable mean-plane image the interface's real apparent motion.
   * Requires `maxEdgeLength`: both the resolvable slope and the bound that
   * keeps the moving image from folding derive from the source tessellation.
   */
  liveInterfaceMotion?: boolean
  /** Skip this scene-scale target entirely for cameras clearly above water. */
  underwaterOnly?: boolean
  /** Per-registration distance gate; the default remains the local 90 m case. */
  maxCameraDistance?: number
}

export interface InterfaceStructureNodes {
  color: {
    sample: (uv: Node<'vec2'>) => Node<'vec4'>
  }
  depth: {
    sample: (uv: Node<'vec2'>) => Node<'vec4'>
  }
  active: Node<'float'>
}

type ClippedVertex = Record<string, number[]>

/** Clip one static source mesh to a horizontal root-local half-space. */
function clipGeometryAboveY(source: BufferGeometry, minimumY: number): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source
  const attributes = Object.entries(geometry.attributes).filter(
    ([, attribute]) => attribute.itemSize >= 1 && attribute.itemSize <= 4,
  )
  const output = new Map(attributes.map(([name]) => [name, [] as number[]]))
  const position = geometry.getAttribute('position')
  if (!position) return new BufferGeometry()

  const componentAt = (attribute: (typeof attributes)[number][1], index: number, component: number): number => {
    switch (component) {
      case 0:
        return attribute.getX(index)
      case 1:
        return attribute.getY(index)
      case 2:
        return attribute.getZ(index)
      default:
        return attribute.getW(index)
    }
  }
  const readVertex = (index: number): ClippedVertex =>
    Object.fromEntries(
      attributes.map(([name, attribute]) => [
        name,
        Array.from({ length: attribute.itemSize }, (_, component) =>
          componentAt(attribute, index, component),
        ),
      ]),
    )
  const interpolate = (a: ClippedVertex, b: ClippedVertex): ClippedVertex => {
    const ay = a.position[1]
    const by = b.position[1]
    const heightDelta = by - ay
    const t = (minimumY - ay) / (Math.abs(heightDelta) > 1e-8 ? heightDelta : 1e-8)
    return Object.fromEntries(
      attributes.map(([name]) => [
        name,
        a[name].map((value, component) => value + (b[name][component] - value) * t),
      ]),
    )
  }
  const emit = (vertex: ClippedVertex): void => {
    for (const [name] of attributes) output.get(name)?.push(...vertex[name])
  }

  for (let triangle = 0; triangle < position.count; triangle += 3) {
    let polygon = [
      readVertex(triangle),
      readVertex(triangle + 1),
      readVertex(triangle + 2),
    ]
    const clipped: ClippedVertex[] = []
    for (let i = 0; i < polygon.length; i++) {
      const previous = polygon[(i + polygon.length - 1) % polygon.length]
      const current = polygon[i]
      const previousInside = previous.position[1] >= minimumY
      const currentInside = current.position[1] >= minimumY
      if (currentInside) {
        if (!previousInside) clipped.push(interpolate(previous, current))
        clipped.push(current)
      } else if (previousInside) {
        clipped.push(interpolate(previous, current))
      }
    }
    polygon = clipped
    for (let i = 1; i + 1 < polygon.length; i++) {
      emit(polygon[0])
      emit(polygon[i])
      emit(polygon[i + 1])
    }
  }

  const result = new BufferGeometry()
  for (const [name, attribute] of attributes) {
    result.setAttribute(
      name,
      new Float32BufferAttribute(output.get(name) ?? [], attribute.itemSize),
    )
  }
  result.computeBoundingBox()
  result.computeBoundingSphere()
  if (geometry !== source) geometry.dispose()
  return result
}

/**
 * A bounded opposite-medium visibility layer for selected opaque structures.
 * It is not a second whole-scene render: registered static descendants are clipped,
 * merged by material, and forward-projected through the interface. Small local
 * crossings may follow the live FFT surface; scene-scale imagery may instead
 * use the stable mean surface so distant Snell compression cannot fold it.
 */
export class InterfaceStructureLayer {
  readonly nodes: InterfaceStructureNodes

  private readonly target: RenderTarget
  private readonly scene = new Scene()
  private readonly activeUniform = uniform(0)
  private readonly structures: RegisteredStructure[] = []
  private readonly size = new Vector2()
  private readonly clearColor = new Color()
  private readonly rootInverse = new Matrix4()
  private readonly relativeMatrix = new Matrix4()
  private readonly sim: WaveSim
  private readonly submerged: Node<'float'>
  private warmed = false
  private active = false

  constructor(sim: WaveSim, submerged: Node<'float'>) {
    this.sim = sim
    this.submerged = submerged
    const depthTexture = new DepthTexture(1, 1)
    depthTexture.minFilter = NearestFilter
    depthTexture.magFilter = NearestFilter
    this.target = new RenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: true,
      depthTexture,
    })
    this.target.texture.colorSpace = LinearSRGBColorSpace
    this.target.texture.minFilter = LinearFilter
    this.target.texture.magFilter = LinearFilter
    this.target.texture.generateMipmaps = false
    this.nodes = {
      color: texture(this.target.texture),
      depth: texture(depthTexture),
      active: this.activeUniform,
    }

    // The main PMREM is copied in update(). A shadowless copy of the one sun
    // preserves metal response without invoking the scene's shadow hierarchy.
    const sun = new DirectionalLight(sunColor, SUN_LIGHT_INTENSITY)
    sun.position.copy(sunDirection).multiplyScalar(100)
    sun.target.position.set(0, 0, 0)
    sun.castShadow = false
    this.scene.add(sun, sun.target)
  }

  register({
    name = 'Interface structure',
    root,
    meshes,
    maxEdgeLength,
    minimumLocalY,
    stableMeanSurface = false,
    liveInterfaceMotion = false,
    underwaterOnly = false,
    maxCameraDistance = ACTIVE_CAMERA_DISTANCE,
  }: InterfaceStructureRegistration): () => void {
    if (meshes.length === 0) throw new Error('Interface structure requires at least one mesh')
    if (maxEdgeLength !== undefined && !(maxEdgeLength > 0)) {
      throw new Error('Interface structure max edge length must be positive')
    }
    if (liveInterfaceMotion && !stableMeanSurface) {
      throw new Error('Live interface motion applies only to a stable mean surface')
    }
    if (liveInterfaceMotion && maxEdgeLength === undefined) {
      throw new Error('Live interface motion requires a source tessellation edge')
    }
    if (!(maxCameraDistance > 0)) {
      throw new Error('Interface structure camera distance must be positive')
    }
    root.updateWorldMatrix(true, true)
    this.rootInverse.copy(root.matrixWorld).invert()

    const materialGroups = new Map<MeshStandardNodeMaterial, Mesh[]>()
    for (const source of meshes) {
      if (Array.isArray(source.material)) {
        throw new Error('Interface structure meshes must use one material')
      }
      if (!(source.material instanceof MeshStandardNodeMaterial)) {
        throw new Error('Interface structure requires MeshStandardNodeMaterial meshes')
      }
      const group = materialGroups.get(source.material)
      if (group) group.push(source)
      else materialGroups.set(source.material, [source])
    }

    const mergedGroups: Array<{
      geometry: NonNullable<ReturnType<typeof mergeGeometries>>
      sourceMaterial: MeshStandardNodeMaterial
    }> = []
    const localBounds = new Box3().makeEmpty()
    const tessellator = maxEdgeLength
      ? new TessellateModifier(maxEdgeLength, 8)
      : null
    for (const [sourceMaterial, sources] of materialGroups) {
      const geometries: BufferGeometry[] = []
      for (const source of sources) {
        this.relativeMatrix.multiplyMatrices(this.rootInverse, source.matrixWorld)
        let prepared = source.geometry.clone().applyMatrix4(this.relativeMatrix)
        if (minimumLocalY !== undefined) {
          const clipped = clipGeometryAboveY(prepared, minimumLocalY)
          prepared.dispose()
          prepared = clipped
        }
        if ((prepared.getAttribute('position')?.count ?? 0) === 0) {
          prepared.dispose()
          continue
        }
        if (tessellator) {
          const tessellated = tessellator.modify(prepared)
          prepared.dispose()
          prepared = tessellated
        }
        geometries.push(prepared)
      }
      if (geometries.length === 0) continue
      const merged = mergeGeometries(geometries, false)
      for (const geometry of geometries) geometry.dispose()
      if (!merged) {
        for (const group of mergedGroups) group.geometry.dispose()
        throw new Error('Unable to merge interface structure geometry')
      }
      merged.computeBoundingBox()
      merged.computeBoundingSphere()
      if (!merged.boundingBox) {
        merged.dispose()
        for (const group of mergedGroups) group.geometry.dispose()
        throw new Error('Interface structure geometry has no bounds')
      }
      localBounds.union(merged.boundingBox)
      mergedGroups.push({ geometry: merged, sourceMaterial })
    }

    const cascadeKeepsAt = (worldXZ: Node<'vec2'>): Node<'float'>[] => {
      const baseWorld = vec3(worldXZ.x, 0, worldXZ.y)
      const distance = cameraPosition.sub(baseWorld).length()
      const heightGap = cameraPosition.y.abs().max(0.5)
      const pixelFootprint = distance.mul(distance).mul(0.001).div(heightGap)
      return [
        float(1).sub(smoothstep(2.5, 5.5, pixelFootprint)),
        float(1).sub(smoothstep(0.35, 1.2, pixelFootprint)),
        float(1).sub(smoothstep(0.1, 0.4, pixelFootprint)),
      ]
    }
    const surfaceHeightAt = (worldXZ: Node<'vec2'>): Node<'float'> => {
      const keeps = cascadeKeepsAt(worldXZ)
      let height: Node<'float'> = this.sim.displacementNodes[0]
        .sample(worldXZ.div(this.sim.patchLengths[0]))
        .y.mul(keeps[0])
      for (let i = 1; i < this.sim.displacementNodes.length; i++) {
        height = height.add(
          this.sim.displacementNodes[i]
            .sample(worldXZ.div(this.sim.patchLengths[i]))
            .y.mul(keeps[i]),
        )
      }
      return height
    }
    const surfaceNormalAt = (worldXZ: Node<'vec2'>): Node<'vec3'> => {
      const baseWorld = vec3(worldXZ.x, 0, worldXZ.y)
      const distance = cameraPosition.sub(baseWorld).length()
      const heightGap = cameraPosition.y.abs().max(0.5)
      const pixelFootprint = distance.mul(distance).mul(0.001).div(heightGap)
      const keeps = cascadeKeepsAt(worldXZ)
      const derivative0 = this.sim.derivativeNodes[0].sample(
        worldXZ.div(this.sim.patchLengths[0]),
      )
      let belowDerivatives: Node<'vec4'> = derivative0
      for (let i = 1; i < this.sim.derivativeNodes.length; i++) {
        belowDerivatives = belowDerivatives.add(
          this.sim.derivativeNodes[i].sample(
            worldXZ.div(this.sim.patchLengths[i]),
          ).mul(keeps[i]),
        )
      }
      const aboveDerivatives = belowDerivatives.sub(
        derivative0.mul(float(1).sub(keeps[0])),
      )
      const derivatives = mix(aboveDerivatives, belowDerivatives, this.submerged)
      const slopeX = derivatives.x.div(max(0.18, derivatives.z.add(1)))
      const slopeZ = derivatives.y.div(max(0.18, derivatives.w.add(1)))
      const resolved = normalize(vec3(slopeX.negate(), 1, slopeZ.negate()))
      const belowDistanceFade = smoothstep(5.0, 16.0, pixelFootprint).mul(
        this.submerged,
      )
      return normalize(mix(resolved, vec3(0, 1, 0), belowDistanceFade))
    }

    /**
     * Solve Fermat's stationary optical path for a locally planar interface,
     * per proxy vertex rather than per ocean pixel. Bisection is bulletproof
     * here — the Snell residual is strictly monotonic along the tangent — so
     * all the accuracy lives in the bracket (see INTERFACE_SOLVE_STEPS).
     */
    const solveTangentInterface = (
      sourceWorld: Node<'vec3'>,
      planePoint: Node<'vec3'>,
      orientedNormal: Node<'vec3'>,
    ): Node<'vec3'> => {
      const cameraPlaneDistance = max(
        dot(planePoint.sub(cameraPosition), orientedNormal),
        0.001,
      )
      const sourcePlaneDistance = max(
        dot(sourceWorld.sub(planePoint), orientedNormal),
        0.001,
      )
      const cameraProjection = cameraPosition.add(
        orientedNormal.mul(cameraPlaneDistance),
      )
      const sourceProjection = sourceWorld.sub(
        orientedNormal.mul(sourcePlaneDistance),
      )
      const tangentOffset = sourceProjection.sub(cameraProjection)
      const tangentLength = tangentOffset.length()
      const tangent = tangentOffset.div(max(tangentLength, 0.001))
      const cameraIor = mix(AIR_IOR, WATER_IOR, this.submerged)
      const sourceIor = mix(WATER_IOR, AIR_IOR, this.submerged)
      // Bracket by the critical angle, not by the whole camera-to-source span.
      // Only the WATER side is bounded: a ray in water that connects to a
      // source in air is inside Snell's cone by construction, so it cannot
      // reach the interface further out than CRITICAL_TANGENT times its own
      // plane distance. The air side has no such limit and keeps the full span.
      // Both bounds are exact — the root is never bracketed out — and the
      // water-side one is what stops the interval from growing with distance.
      const inWater = this.submerged.greaterThan(0.5)
      const cameraReach = cameraPlaneDistance.mul(CRITICAL_TANGENT)
      const sourceReach = sourcePlaneDistance.mul(CRITICAL_TANGENT)
      const low = select(
        inWater,
        float(0),
        tangentLength.sub(sourceReach).max(0),
      ).toVar()
      const high = select(
        inWater,
        tangentLength.min(cameraReach),
        tangentLength,
      ).toVar()
      for (let i = 0; i < INTERFACE_SOLVE_STEPS; i++) {
        const middle = low.add(high).mul(0.5)
        const sourceTangentDistance = tangentLength.sub(middle)
        const cameraSine = middle.div(
          cameraPlaneDistance
            .mul(cameraPlaneDistance)
            .add(middle.mul(middle))
            .sqrt(),
        )
        const sourceSine = sourceTangentDistance.div(
          sourcePlaneDistance
            .mul(sourcePlaneDistance)
            .add(sourceTangentDistance.mul(sourceTangentDistance))
            .sqrt(),
        )
        const moveTowardSource = cameraIor
          .mul(cameraSine)
          .lessThan(sourceIor.mul(sourceSine))
        low.assign(select(moveTowardSource, middle, low))
        high.assign(select(moveTowardSource, high, middle))
      }
      return cameraProjection.add(tangent.mul(low.add(high).mul(0.5)))
    }

    /**
     * The interface's real apparent-image motion, added to a solve that keeps
     * its stable mean plane.
     *
     * Tilting the interface by δ moves the apparent direction of a FIXED
     * source by δ·(1 − 1/S), where S = dθ_transmitted/dθ_incident is the same
     * Snell angular stretch the ocean material computes. That factor stays
     * below one at every incidence — including the critical angle, where S
     * diverges and the factor merely saturates — so the image can never travel
     * further than the surface actually leans. This is the bound the rejected
     * per-vertex Fermat solve never had: there, wave normals entered the path
     * solution itself, where distance and the critical-angle Jacobian
     * amplified them into folded crystal facets.
     */
    const applyInterfaceMotion = (
      direction: Node<'vec3'>,
      tilt: Node<'vec3'>,
      sourceDistance: Node<'float'>,
    ): Node<'vec3'> => {
      const cameraIor = mix(AIR_IOR, WATER_IOR, this.submerged)
      const sourceIor = mix(WATER_IOR, AIR_IOR, this.submerged)
      const eta = cameraIor.div(sourceIor)
      const cosIncident = direction.y.abs().max(0.02)
      const sinTransmitted2 = eta
        .mul(eta)
        .mul(float(1).sub(cosIncident.mul(cosIncident)))
      const cosTransmitted = float(1).sub(sinTransmitted2).max(0).sqrt().max(0.04)
      const stretch = eta.mul(cosIncident).div(cosTransmitted).max(0.04)
      const shift = tilt
        .sub(direction.mul(dot(tilt, direction)))
        .mul(float(1).sub(float(1).div(stretch)).clamp(-1, 1))
      // Folding is a resolution failure, so bound it with the source's own
      // resolution: the shift may not exceed half an edge's apparent angular
      // size, and two projected neighbours therefore cannot cross. Snell
      // compression divides that budget, which quiets the window rim — where
      // this stable projection is the only representable image anyway.
      const foldLimit = float(maxEdgeLength ?? 1)
        .mul(0.5)
        .div(sourceDistance.max(1).mul(stretch))
      const bounded = shift.mul(
        float(1).min(foldLimit.div(shift.length().max(1e-5))),
      )
      return normalize(direction.add(bounded))
    }

    // Capture only the transmitted half of the frame. Instead of rendering a
    // conventional camera projection and asking every water pixel to hunt for
    // a 3 cm tube in that texture, forward-project each frame vertex through
    // the live FFT interface. The resulting target already lives at the
    // apparent refracted screen position and can be sampled directly.
    const projectedPosition = Fn(() => {
      const sourceWorld = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz
      const directProjection = cameraProjectionMatrix
        .mul(cameraViewMatrix)
        .mul(vec4(sourceWorld, 1))
      const result = directProjection.toVar()
      const sourceSurfaceHeight = stableMeanSurface
        ? float(0)
        : surfaceHeightAt(sourceWorld.xz)
      const signedHeight = sourceWorld.y.sub(sourceSurfaceHeight)
      const aboveMask = step(0, signedHeight)
      const belowMask = step(signedHeight, 0)
      const oppositeMediumMask = mix(belowMask, aboveMask, this.submerged)

      // A real branch matters once a registration is larger than a small fitting:
      // camera-side vertices retain ordinary projection and skip every
      // heightfield refinement/Fermat solve instead of evaluating work that a
      // final mix would discard. The fragment stage still owns the exact clip.
      If(oppositeMediumMask.greaterThan(0.5), () => {
        const normalOrientation = this.submerged.mul(2).sub(1)
        const heightDelta = sourceWorld.y.sub(cameraPosition.y)
        const safeHeightDelta = mix(
          heightDelta.min(-0.001),
          heightDelta.max(0.001),
          this.submerged,
        )
        const crossingFraction = cameraPosition.y
          .negate()
          .div(safeHeightDelta)
          .clamp(0, 1)
          .toVar()
        let apparentInterface: Node<'vec3'>
        let interfaceTilt: Node<'vec3'> | null = null
        if (stableMeanSurface) {
          const crossingXZ = mix(
            cameraPosition.xz,
            sourceWorld.xz,
            crossingFraction,
          )
          apparentInterface = solveTangentInterface(
            sourceWorld,
            vec3(crossingXZ.x, 0, crossingXZ.y),
            vec3(0, normalOrientation, 0),
          )
          if (liveInterfaceMotion) {
            // The slope this image can carry, measured at the scale it is
            // built from. A point sample of the derivative map would deliver
            // wave bands shorter than the source tessellation (cascade 0
            // alone reaches ~2.8 m against 1.2 m edges), and those arrive as
            // uncorrelated per-vertex jitter rather than motion. A central
            // difference of the same heightfield over one source edge IS the
            // resolved slope, and it inherits the footprint keeps that already
            // retire distant bands.
            const spacing = float(maxEdgeLength as number)
            const point = apparentInterface.xz
            const slope = vec2(
              surfaceHeightAt(point.add(vec2(maxEdgeLength as number, 0))).sub(
                surfaceHeightAt(point.sub(vec2(maxEdgeLength as number, 0))),
              ),
              surfaceHeightAt(point.add(vec2(0, maxEdgeLength as number))).sub(
                surfaceHeightAt(point.sub(vec2(0, maxEdgeLength as number))),
              ),
            ).div(spacing.mul(2))
            // Heightfield normal ∝ (−∂h/∂x, 1, −∂h/∂z); the lean of the
            // camera-oriented normal away from the mean plane is its
            // horizontal part.
            interfaceTilt = vec3(slope.x.negate(), 0, slope.y.negate()).mul(
              normalOrientation,
            )
          }
        } else {
          for (let i = 0; i < 3; i++) {
            const crossingXZ = mix(
              cameraPosition.xz,
              sourceWorld.xz,
              crossingFraction,
            )
            crossingFraction.assign(
              surfaceHeightAt(crossingXZ)
                .sub(cameraPosition.y)
                .div(safeHeightDelta)
                .clamp(0, 1),
            )
          }
          const crossingXZ = mix(
            cameraPosition.xz,
            sourceWorld.xz,
            crossingFraction,
          )
          const crossingPoint = vec3(
            crossingXZ.x,
            surfaceHeightAt(crossingXZ),
            crossingXZ.y,
          )
          const firstNormal = surfaceNormalAt(crossingXZ).mul(normalOrientation)
          const firstInterface = solveTangentInterface(
            sourceWorld,
            crossingPoint,
            firstNormal,
          )
          // Re-anchor the tangent solve once on the actual heightfield. This
          // keeps the local-plane solution attached to the moving FFT surface.
          const refinedXZ = firstInterface.xz
          const refinedPoint = vec3(
            refinedXZ.x,
            surfaceHeightAt(refinedXZ),
            refinedXZ.y,
          )
          const refinedNormal = surfaceNormalAt(refinedXZ).mul(normalOrientation)
          apparentInterface = solveTangentInterface(
            sourceWorld,
            refinedPoint,
            refinedNormal,
          )
        }
        const sourceDistance = sourceWorld.sub(cameraPosition).length()
        const meanDirection = normalize(apparentInterface.sub(cameraPosition))
        // Scene-scale imagery keeps the stable mean-plane path solve and takes
        // the wave's contribution as a bounded rotation of the resulting
        // apparent direction — an angular quantity, so it is independent of
        // how far away the source is and cannot be amplified by distance.
        const apparentDirection = interfaceTilt
          ? applyInterfaceMotion(meanDirection, interfaceTilt, sourceDistance)
          : meanDirection
        const apparentWorld = cameraPosition.add(
          apparentDirection.mul(sourceDistance),
        )
        result.assign(
          cameraProjectionMatrix
            .mul(cameraViewMatrix)
            .mul(vec4(apparentWorld, 1)),
        )
      })
      return result
    })()

    const fragmentSurfaceHeight = stableMeanSurface
      ? float(0)
      : surfaceHeightAt(positionWorld.xz)
    const fragmentSignedHeight = positionWorld.y.sub(fragmentSurfaceHeight)
    // The material is rendered into a half-resolution target. A one-source-
    // pixel derivative ramp prevents the moving FFT cut from toggling a whole
    // target pixel while preserving an optically sharp contact at display
    // resolution.
    const fragmentTransition = fragmentSignedHeight.fwidth().max(0.005)
    const fragmentAboveMask = smoothstep(
      fragmentTransition.negate(),
      fragmentTransition,
      fragmentSignedHeight,
    )
    const fragmentBelowMask = float(1).sub(fragmentAboveMask)
    const oppositeMediumOpacity = mix(
      fragmentBelowMask,
      fragmentAboveMask,
      this.submerged,
    )
    const distanceFade = float(1).sub(
      smoothstep(
        maxCameraDistance * 0.85,
        maxCameraDistance,
        cameraPosition.sub(positionWorld).length(),
      ),
    )

    const proxies = mergedGroups.map(({ geometry, sourceMaterial }, index) => {
      const material = sourceMaterial.clone()
      material.transparent = false
      material.depthWrite = true
      material.fog = false
      material.side = DoubleSide
      material.vertexNode = projectedPosition
      material.opacityNode = oppositeMediumOpacity.mul(distanceFade)
      material.alphaTestNode = float(0.001)

      const proxy = new Mesh(geometry, material)
      proxy.name = `${name} water-interface proxy ${index + 1}`
      proxy.matrixAutoUpdate = false
      proxy.frustumCulled = false
      this.scene.add(proxy)
      return proxy
    })
    if (proxies.length === 0) {
      throw new Error('Interface structure produced no optical proxy draws')
    }

    const structure: RegisteredStructure = {
      root,
      proxies,
      localBounds,
      worldBounds: new Box3(),
      worldSphere: new Sphere(),
      maxCameraDistance,
      underwaterOnly,
      disposed: false,
    }
    this.structures.push(structure)

    return () => this.removeStructure(structure)
  }

  update(ctx: InterfaceStructureFrame): void {
    let active = false
    for (const structure of this.structures) {
      structure.root.updateWorldMatrix(true, false)
      structure.worldBounds
        .copy(structure.localBounds)
        .applyMatrix4(structure.root.matrixWorld)
      structure.worldBounds.getBoundingSphere(structure.worldSphere)
      const crossesSurface =
        structure.worldBounds.min.y <= ACTIVE_SURFACE_MARGIN &&
        structure.worldBounds.max.y >= -ACTIVE_SURFACE_MARGIN
      const nearCamera =
        ctx.camera.position.distanceTo(structure.worldSphere.center) <=
        structure.maxCameraDistance + structure.worldSphere.radius
      const visible = structure.root.visible && crossesSurface && nearCamera
        && (!structure.underwaterOnly || ctx.camera.position.y < 1)
      for (const proxy of structure.proxies) {
        proxy.matrix.copy(structure.root.matrixWorld)
        proxy.matrixWorldNeedsUpdate = true
        proxy.visible = visible || !this.warmed
      }
      active ||= visible
    }

    this.active = active
    this.activeUniform.value = active ? 1 : 0
    if (!active && this.warmed) return

    this.syncSize(ctx.renderer)
    this.scene.environment = ctx.scene.environment
    this.scene.environmentIntensity = ctx.scene.environmentIntensity
    this.scene.environmentRotation.copy(ctx.scene.environmentRotation)

    const renderer = ctx.renderer
    const previousTarget = renderer.getRenderTarget()
    const previousMrt = renderer.getMRT()
    const previousAlpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clearColor)
    renderer.setRenderTarget(this.target)
    renderer.setMRT(null)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    void renderer.render(this.scene, ctx.camera)
    renderer.setRenderTarget(previousTarget)
    renderer.setMRT(previousMrt)
    renderer.setClearColor(this.clearColor, previousAlpha)
    this.warmed = true
  }

  debugSnapshot(): {
    active: boolean
    draws: number
    vertices: number
    triangles: number
    width: number
    height: number
    maxEdge: number
  } {
    const visibleProxies = this.active
      ? this.structures.flatMap((structure) =>
          structure.proxies.filter((proxy) => proxy.visible),
        )
      : []
    return {
      active: this.active,
      draws: visibleProxies.length,
      vertices: visibleProxies.reduce(
        (vertices, proxy) =>
          vertices + (proxy.geometry.getAttribute('position')?.count ?? 0),
        0,
      ),
      triangles: visibleProxies.reduce((triangles, proxy) => {
        const positionCount = proxy.geometry.getAttribute('position')?.count ?? 0
        return triangles + (proxy.geometry.index?.count ?? positionCount) / 3
      }, 0),
      width: this.target.width,
      height: this.target.height,
      maxEdge: TARGET_MAX_EDGE,
    }
  }

  dispose(): void {
    for (const structure of [...this.structures]) this.removeStructure(structure)
    this.target.dispose()
  }

  private removeStructure(structure: RegisteredStructure): void {
    if (structure.disposed) return
    structure.disposed = true
    const index = this.structures.indexOf(structure)
    if (index >= 0) this.structures.splice(index, 1)
    for (const proxy of structure.proxies) {
      this.scene.remove(proxy)
      proxy.geometry.dispose()
      ;(proxy.material as MeshStandardNodeMaterial).dispose()
    }
  }

  private syncSize(renderer: WebGPURenderer): void {
    renderer.getSize(this.size)
    const scale = Math.min(
      TARGET_SCALE,
      TARGET_MAX_EDGE / Math.max(1, this.size.x, this.size.y),
    )
    const width = Math.max(1, Math.round(this.size.x * scale))
    const height = Math.max(1, Math.round(this.size.y * scale))
    if (this.target.width !== width || this.target.height !== height) {
      this.target.setSize(width, height)
    }
  }
}
