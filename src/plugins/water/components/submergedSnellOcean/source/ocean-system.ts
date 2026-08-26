import { Mesh, PlaneGeometry } from 'three'
import type { PerspectiveCamera, Scene } from 'three'
import { uniform } from 'three/tsl'
import type { Node, WebGPURenderer } from 'three/webgpu'
import type { Rng } from './random'
import { createOceanSurfaceMaterial, oceanOpticsDebugMode } from './ocean-material'
import type { OceanOpticsDebugMode } from './ocean-material'
import {
  InterfaceStructureLayer,
  type InterfaceStructureRegistration,
} from './interface-structure-layer'
import { createOceanSkirtGeometry, OCEAN_INNER_HALF_SIZE } from './ocean-skirt-geometry'
import { WaveSim } from './wave-sim'

const INNER_SIZE = OCEAN_INNER_HALF_SIZE * 2

export interface SubmergedOceanOptions {
  /** Inner-mesh subdivision. Tiers: 256 / 384 / 448. */
  segments?: number
  /** Compile-time optics isolation view. */
  debugPass?: string
}

/**
 * The sea: one spectral wave sim, an inner high-density surface, and a far flat
 * skirt ring, both camera-following on a vertex-stable grid. The surface seen
 * from below IS this same sheet — there is no second underside mesh.
 *
 * The optical side is one camera-medium state for the whole draw, never a
 * per-triangle facing test: right at a crossing a displaced sheet can expose
 * nearby backfaces before the camera itself is submerged, and the surface must
 * not mix two optical media in one frame. A permanently submerged view fixes
 * that state at 1; a live crossing feeds it from a displaced-waterline probe.
 */
export class SubmergedOcean {
  readonly simulation: WaveSim
  readonly interfaceStructures: InterfaceStructureLayer
  /** Camera-medium authority shared by the surface, medium, and particulates. */
  readonly submerged: Node<'float'>

  private readonly inner: Mesh
  private readonly outer: Mesh
  private readonly timeUniform = uniform(0)
  private readonly followStep: number

  constructor(scene: Scene, rng: Rng, options: SubmergedOceanOptions = {}) {
    const segments = options.segments ?? 384
    this.followStep = INNER_SIZE / segments
    this.simulation = new WaveSim(rng)
    this.submerged = uniform(1)
    this.interfaceStructures = new InterfaceStructureLayer(this.simulation, this.submerged)

    const timeNode = this.timeUniform as unknown as Node<'float'>
    const debugMode: OceanOpticsDebugMode = oceanOpticsDebugMode(options.debugPass ?? '')

    const innerGeometry = new PlaneGeometry(INNER_SIZE, INNER_SIZE, segments, segments)
    innerGeometry.rotateX(-Math.PI / 2)
    this.inner = new Mesh(
      innerGeometry,
      createOceanSurfaceMaterial(this.simulation, timeNode, {
        detailed: true,
        edgeFadeHalfSize: INNER_SIZE / 2,
        interfaceStructures: this.interfaceStructures.nodes,
        submerged: this.submerged,
        wakeFoam: null,
        debugMode,
      }),
    )
    this.inner.frustumCulled = false
    // Transparent queue only for render-order ownership: the sheet draws before
    // the effects (particulates, glass, foam) that must be able to appear in
    // front of it.
    this.inner.renderOrder = -100
    scene.add(this.inner)

    this.outer = new Mesh(
      createOceanSkirtGeometry(segments),
      createOceanSurfaceMaterial(this.simulation, timeNode, {
        detailed: false,
        interfaceStructures: this.interfaceStructures.nodes,
        submerged: this.submerged,
        debugMode,
      }),
    )
    this.outer.frustumCulled = false
    // The skirt goes first so the detailed sheet always draws over it in the
    // overlap band rather than the other way round.
    this.outer.renderOrder = -101
    scene.add(this.outer)
  }

  /**
   * Register a bounded opaque assembly that straddles the interface, so its
   * forward-refracted image can be transported through the Snell window.
   */
  register(registration: InterfaceStructureRegistration): () => void {
    return this.interfaceStructures.register(registration)
  }

  update(
    renderer: WebGPURenderer,
    camera: PerspectiveCamera,
    scene: Scene,
    elapsed: number,
    delta: number,
  ): void {
    this.timeUniform.value = elapsed
    this.simulation.update(renderer, elapsed, delta)

    // Both sheets follow the camera quantized to the inner vertex grid, so a
    // moving view cannot make the wave field crawl across the triangles.
    const step = this.followStep
    const qx = Math.round(camera.position.x / step) * step
    const qz = Math.round(camera.position.z / step) * step
    this.inner.position.set(qx, 0, qz)
    this.outer.position.set(qx, 0, qz)

    this.interfaceStructures.update({ camera, renderer, scene })
  }

  dispose(scene: Scene): void {
    scene.remove(this.inner)
    scene.remove(this.outer)
    this.inner.geometry.dispose()
    this.outer.geometry.dispose()
    ;(this.inner.material as { dispose: () => void }).dispose()
    ;(this.outer.material as { dispose: () => void }).dispose()
    this.interfaceStructures.dispose()
    this.simulation.dispose()
  }
}
