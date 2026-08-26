import { HalfFloatType, LinearFilter, Vector4 } from 'three'
import { StorageTexture } from 'three/webgpu'
import type { ComputeNode, Node, WebGPURenderer } from 'three/webgpu'
import {
  Fn,
  exp,
  float,
  instanceIndex,
  int,
  ivec2,
  mix,
  texture,
  textureLoad,
  textureStore,
  uint,
  uniform,
  uniformArray,
  vec4,
} from 'three/tsl'

/**
 * World square the wake field covers: it encloses the submarine force field
 * (centre (0, 10), radius 380 m) with margin for foam spread, so deposited
 * foam can never reach the texture border and the default ClampToEdge
 * sampling reads clean zero everywhere outside the square.
 */
export const WAKE_FOAM_CENTER_X = 0
export const WAKE_FOAM_CENTER_Z = 10
export const WAKE_FOAM_SIZE = 820

const RESOLUTION = 1024 // 0.8 m/texel across the square
const BITS = 10
const MAX_SPLATS = 8

// Two foam populations in one texture: R = fresh churn (near-solid white,
// dies in seconds), G = residue (the lacy trail that spreads and slowly
// pops). Splats write both; the ocean shader reads them through its own
// whitecap pipeline, so wake foam and Jacobian foam are one material.
const FRESH_TAU = 2.4 // s — e-folding of the solid churn core
const RESIDUE_TAU = 8.5 // s — e-folding of the lacy trail
const DIFFUSE_RATE = 1.1 // 1/s — residue bleed toward its neighbours
const BLEED_RATE = 0.004 // 1/s — linear floor so half floats reach exact 0
const QUIET_AFTER = 35 // s past the last splat the field is exactly zero

/**
 * Persistent vessel wake foam as a property of the OCEAN, not an effect
 * placed near it: a world-anchored accumulation field the submarine splats
 * into and the detailed ocean sheet samples as extra whitecap coverage.
 * Because the surface shader owns the read, wake foam rides the displaced
 * water exactly and can never dip under or hover over it. Deposits combine
 * by max(), never add: sailing through existing foam refreshes it instead
 * of erasing it, and there is no instance pool whose recycling could pop
 * old trail. Ageing = per-channel exponential decay + residue diffusion,
 * which turns each pass into a widening, hole-opening lace before it dies.
 * The compute pass is skipped entirely once the field has fully decayed.
 */
export class WakeFoamMap {
  /** Stable texture node for the surface material — repointed after swaps. */
  readonly foamNode: ReturnType<typeof texture>

  private readonly maps: [StorageTexture, StorageTexture]
  private readonly steps: [ComputeNode, ComputeNode]
  private readonly clears: [ComputeNode, ComputeNode]
  private readonly splatShapes = uniformArray(
    Array.from({ length: MAX_SPLATS }, () => new Vector4(0, 0, 1, 0)),
  )
  private readonly splatPowers = uniformArray(
    Array.from({ length: MAX_SPLATS }, () => new Vector4(0, 0, 0, 0)),
  )
  private readonly freshKeep = uniform(1)
  private readonly residueKeep = uniform(1)
  private readonly diffuse = uniform(0)
  private readonly bleed = uniform(0)
  private pendingCount = 0
  private hasPending = false
  private activeUntil = -Infinity
  private current = 0
  private initialized = false

  constructor() {
    const make = () => {
      const map = new StorageTexture(RESOLUTION, RESOLUTION)
      map.type = HalfFloatType
      map.minFilter = LinearFilter
      map.magFilter = LinearFilter
      map.generateMipmaps = false
      return map
    }
    this.maps = [make(), make()]
    this.steps = [
      this.buildStep(this.maps[0], this.maps[1]),
      this.buildStep(this.maps[1], this.maps[0]),
    ]
    this.clears = [this.buildClear(this.maps[0]), this.buildClear(this.maps[1])]
    this.foamNode = texture(this.maps[0])
  }

  /**
   * Queue a gaussian foam deposit at world (x, z). `radius` is in metres;
   * `fresh`/`residue` are 0..1 peak coverages for the two channels. At most
   * MAX_SPLATS deposits are honoured per frame — the submarine's stamp set
   * is sized to exactly that budget.
   */
  splat(x: number, z: number, radius: number, fresh: number, residue: number): void {
    if (this.pendingCount >= MAX_SPLATS) return
    const u = ((x - (WAKE_FOAM_CENTER_X - WAKE_FOAM_SIZE / 2)) / WAKE_FOAM_SIZE) * RESOLUTION
    const v = ((z - (WAKE_FOAM_CENTER_Z - WAKE_FOAM_SIZE / 2)) / WAKE_FOAM_SIZE) * RESOLUTION
    const texels = Math.max(1, (radius / WAKE_FOAM_SIZE) * RESOLUTION)
    ;(this.splatShapes.array[this.pendingCount] as Vector4).set(u, v, texels, 0)
    ;(this.splatPowers.array[this.pendingCount] as Vector4).set(fresh, residue, 0, 0)
    this.pendingCount++
    this.hasPending = true
  }

  /** Advance decay/diffusion and apply queued splats. Costs nothing while
   * the field is known-zero (QUIET_AFTER outlives both channels + bleed). */
  update(renderer: WebGPURenderer, dt: number, elapsed: number): void {
    this.ensureInitialized(renderer)
    if (this.hasPending) {
      this.activeUntil = elapsed + QUIET_AFTER
      this.hasPending = false
    }
    if (elapsed > this.activeUntil) {
      this.pendingCount = 0
      return
    }
    for (let i = this.pendingCount; i < MAX_SPLATS; i++) {
      ;(this.splatShapes.array[i] as Vector4).set(0, 0, 1, 0)
      ;(this.splatPowers.array[i] as Vector4).set(0, 0, 0, 0)
    }
    this.pendingCount = 0
    const step = Math.min(dt, 0.1)
    this.freshKeep.value = Math.exp(-step / FRESH_TAU)
    this.residueKeep.value = Math.exp(-step / RESIDUE_TAU)
    this.diffuse.value = 1 - Math.exp(-step * DIFFUSE_RATE)
    this.bleed.value = step * BLEED_RATE
    renderer.compute(this.steps[this.current])
    this.current = 1 - this.current
    this.foamNode.value = this.maps[this.current]
  }

  private ensureInitialized(renderer: WebGPURenderer): void {
    if (this.initialized) return
    this.initialized = true
    renderer.compute(this.clears[0])
    renderer.compute(this.clears[1])
  }

  private buildClear(target: StorageTexture): ComputeNode {
    return Fn(() => {
      const x = int(instanceIndex.bitAnd(uint(RESOLUTION - 1)))
      const y = int(instanceIndex.shiftRight(uint(BITS)))
      textureStore(target, ivec2(x, y), vec4(0))
    })().compute(RESOLUTION * RESOLUTION)
  }

  private buildStep(read: StorageTexture, write: StorageTexture): ComputeNode {
    const shapes = this.splatShapes
    const powers = this.splatPowers
    return Fn(() => {
      const mask = uint(RESOLUTION - 1)
      const x = int(instanceIndex.bitAnd(mask))
      const y = int(instanceIndex.shiftRight(uint(BITS)))
      const cell = ivec2(x, y)
      const previous = textureLoad(texture(read), cell)

      // Residue spreads into its neighbours (the widening, softening trail).
      // Wrapped indexing is branchless and safe: the border ring is always
      // zero because the force field keeps every splat well inside it.
      const xm = int(uint(x.add(RESOLUTION - 1)).bitAnd(mask))
      const xp = int(uint(x.add(1)).bitAnd(mask))
      const ym = int(uint(y.add(RESOLUTION - 1)).bitAnd(mask))
      const yp = int(uint(y.add(1)).bitAnd(mask))
      const around = textureLoad(texture(read), ivec2(xm, y))
        .g.add(textureLoad(texture(read), ivec2(xp, y)).g)
        .add(textureLoad(texture(read), ivec2(x, ym)).g)
        .add(textureLoad(texture(read), ivec2(x, yp)).g)
        .mul(0.25)

      // Ageing: exponential decay plus a small linear bleed so every texel
      // reaches exact zero instead of lingering as half-float dust.
      let fresh = previous.r.mul(this.freshKeep).sub(this.bleed).max(0)
      let residue = mix(previous.g, around, this.diffuse)
        .mul(this.residueKeep)
        .sub(this.bleed)
        .max(0)

      // Deposits win by max(), never add: crossing an existing trail can
      // only refresh it, and overlapping same-frame stamps cannot bloom.
      const px = float(x).add(0.5)
      const py = float(y).add(0.5)
      for (let k = 0; k < MAX_SPLATS; k++) {
        const shape = shapes.element(int(k)) as unknown as Node<'vec4'>
        const power = powers.element(int(k)) as unknown as Node<'vec4'>
        const dx = px.sub(shape.x)
        const dy = py.sub(shape.y)
        const falloff = exp(dx.mul(dx).add(dy.mul(dy)).div(shape.z.mul(shape.z)).negate())
        fresh = fresh.max(falloff.mul(power.x))
        residue = residue.max(falloff.mul(power.y))
      }

      textureStore(write, cell, vec4(fresh, residue, 0, 1))
    })().compute(RESOLUTION * RESOLUTION)
  }

  dispose(): void {
    this.maps[0].dispose()
    this.maps[1].dispose()
  }
}
