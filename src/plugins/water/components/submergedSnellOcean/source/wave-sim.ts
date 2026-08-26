import { HalfFloatType, LinearFilter, RepeatWrapping } from 'three'
import { StorageTexture } from 'three/webgpu'
import type { ComputeNode, WebGPURenderer } from 'three/webgpu'
import {
  exp,
  Fn,
  float,
  instanceIndex,
  int,
  ivec2,
  max,
  min,
  texture,
  textureLoad,
  textureStore,
  uint,
  uniform,
  vec2,
  vec4,
} from 'three/tsl'
import type { Rng } from './random'
import { createFrequencyTexture, PackedIFFT } from './fft-compute'
import { cascadeBands, createSpectrumTexture, DEFAULT_SEA_STATE } from './ocean-spectrum'
import type { SeaState } from './ocean-spectrum'

export const OCEAN_PRESET = {
  resolution: 256,
  patchLengths: [250, 17, 5],
  boundaryFactor: 6,
  choppiness: 1.3,
  foamRecovery: 0.35,
  /** Global art-direction scale on displacement (dream lever). 0.35 keeps a
   * living glassy swell (~0.5 m crests). A 0.9 sea reads as a storm: it dunks
   * sightlines at deck height and makes a surface crossing chaotic. */
  amplitude: 0.35,
}

interface Cascade {
  patchLength: number
  ifft: PackedIFFT
  evolve: ComputeNode
  /** Two assembly nodes: [prev=0→next=1, prev=1→next=0]. */
  assemble: [ComputeNode, ComputeNode]
  clear: [ComputeNode, ComputeNode]
  displacementMaps: [StorageTexture, StorageTexture]
  derivativesMap: StorageTexture
}

function createMapTexture(n: number): StorageTexture {
  const tex = new StorageTexture(n, n)
  tex.type = HalfFloatType
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = false
  return tex
}

/**
 * Three-cascade spectral wave simulation (spectral-ocean reference).
 * Per frame: evolve h0→h(k,t) packed [height | horizontal], run packed IFFTs
 * in workgroup memory with one submission per axis, then assemble
 * displacement/derivative maps with finite differences, Jacobian, and
 * persistent foam history.
 *
 * The maps drive the ocean surface, its underside, the caustics
 * projector, and god-ray flicker — one wave field, every consumer.
 */
export class WaveSim {
  readonly patchLengths: number[]
  /** The sea state these cascades were built from — consumers that need the
   * wind axis (foam windrows) must read it here, never re-import a default. */
  readonly sea: SeaState
  /** TSL texture nodes — .value is repointed after each ping-pong swap. */
  readonly displacementNodes: ReturnType<typeof texture>[]
  readonly derivativeNodes: ReturnType<typeof texture>[]

  private readonly cascades: Cascade[]
  private readonly timeUniform = uniform(0)
  private readonly dtUniform = uniform(1 / 60)
  private current = 0
  private initialized = false

  constructor(rng: Rng, sea: SeaState = DEFAULT_SEA_STATE) {
    const { resolution: n, patchLengths, boundaryFactor, choppiness, foamRecovery, amplitude } =
      OCEAN_PRESET
    this.patchLengths = patchLengths
    this.sea = sea
    const logN = Math.log2(n)
    const mask = uint(n - 1)
    const shift = uint(logN)
    const bands = cascadeBands(patchLengths, boundaryFactor)

    const cellOf = () => {
      const x = int(instanceIndex.bitAnd(mask))
      const y = int(instanceIndex.shiftRight(shift))
      return { x, y, cell: ivec2(x, y) }
    }

    this.cascades = bands.map((band, index) => {
      const spectrum = createSpectrumTexture(
        rng.fork(`ocean-cascade-${index}`),
        band,
        sea,
        n,
      )
      const freqPing = createFrequencyTexture(n)
      const freqPong = createFrequencyTexture(n)
      const ifft = new PackedIFFT(freqPing, freqPong, n)
      const displacementMaps: [StorageTexture, StorageTexture] = [
        createMapTexture(n),
        createMapTexture(n),
      ]
      const derivativesMap = createMapTexture(n)

      const twoPiOverPatch = (Math.PI * 2) / band.patchLength

      const evolve = Fn(() => {
        const { x, y, cell } = cellOf()
        const initial = textureLoad(texture(spectrum), cell)
        const centered = vec2(float(x).sub(n / 2), float(y).sub(n / 2))
        const k = centered.mul(twoPiOverPatch)
        const kLength = max(k.length(), 1e-4)
        const depthWave = exp(min(kLength.mul(sea.depth), 20.0).mul(2))
        const omega = k.length()
          .mul(float(sea.gravity))
          .mul(depthWave.sub(1).div(depthWave.add(1)))
          .sqrt()
        const phase = omega.mul(this.timeUniform)
        const pc = phase.cos()
        const ps = phase.sin()
        // h = h0·e^{iωt} + conj(h0(-k))·e^{-iωt}
        const h = vec2(
          initial.x.mul(pc).sub(initial.y.mul(ps)).add(initial.z.mul(pc).sub(initial.w.mul(ps.negate()))),
          initial.x.mul(ps).add(initial.y.mul(pc)).add(initial.z.mul(ps.negate()).add(initial.w.mul(pc))),
        ).mul(amplitude)
        const ih = vec2(h.y.negate(), h.x)
        const dx = ih.mul(k.x.div(kLength))
        const dz = ih.mul(k.y.div(kLength))
        const horizontal = vec2(dx.x.sub(dz.y), dx.y.add(dz.x))
        textureStore(freqPing, cell, vec4(h, horizontal))
      })().compute(n * n)

      const spatial = ifft.output
      const inverseSpacing = n / (2 * band.patchLength)

      const makeAssemble = (
        previous: StorageTexture,
        next: StorageTexture,
      ): ComputeNode =>
        Fn(() => {
          const { x, y, cell } = cellOf()
          const parity = float(int(instanceIndex.bitAnd(mask)).add(int(instanceIndex.shiftRight(shift))).bitAnd(int(1)))
          const sign = float(1).sub(parity.mul(2))
          // Adjacent texels flip parity → neighbor sign is -sign.
          const nSign = sign.negate()
          const xp = int(uint(x.add(1)).bitAnd(mask))
          const xm = int(uint(x.add(n - 1)).bitAnd(mask))
          const yp = int(uint(y.add(1)).bitAnd(mask))
          const ym = int(uint(y.add(n - 1)).bitAnd(mask))

          const center = textureLoad(texture(spatial), cell)
          const right = textureLoad(texture(spatial), ivec2(xp, y)).mul(nSign)
          const left = textureLoad(texture(spatial), ivec2(xm, y)).mul(nSign)
          const up = textureLoad(texture(spatial), ivec2(x, yp)).mul(nSign)
          const down = textureLoad(texture(spatial), ivec2(x, ym)).mul(nSign)

          const height = center.x.mul(sign)
          const horizontal = center.zw.mul(sign)

          const slopeX = right.x.sub(left.x).mul(inverseSpacing)
          const slopeZ = up.x.sub(down.x).mul(inverseSpacing)
          const dDxDx = right.z.sub(left.z).mul(inverseSpacing)
          const dDzDz = up.w.sub(down.w).mul(inverseSpacing)
          const dDxDz = up.z.sub(down.z).mul(inverseSpacing)
          const dDzDx = right.w.sub(left.w).mul(inverseSpacing)

          const jxx = float(1).add(dDxDx.mul(choppiness))
          const jzz = float(1).add(dDzDz.mul(choppiness))
          const jxz = dDxDz.add(dDzDx).mul(0.5).mul(choppiness)
          const jacobian = jxx.mul(jzz).sub(jxz.mul(jxz))

          const previousHistory = textureLoad(texture(previous), cell).w
          const recovered = previousHistory.add(
            this.dtUniform.mul(foamRecovery).div(max(jacobian, 0.5)),
          )
          const history = min(min(jacobian, recovered), 2.0)

          textureStore(
            next,
            cell,
            vec4(horizontal.x.mul(choppiness), height, horizontal.y.mul(choppiness), history),
          )
          textureStore(
            derivativesMap,
            cell,
            vec4(slopeX, slopeZ, dDxDx.mul(choppiness), dDzDz.mul(choppiness)),
          )
        })().compute(n * n)

      const makeClear = (target: StorageTexture): ComputeNode =>
        Fn(() => {
          const { cell } = cellOf()
          textureStore(target, cell, vec4(0, 0, 0, 1))
        })().compute(n * n)

      return {
        patchLength: band.patchLength,
        ifft,
        evolve,
        assemble: [
          makeAssemble(displacementMaps[0], displacementMaps[1]),
          makeAssemble(displacementMaps[1], displacementMaps[0]),
        ],
        clear: [makeClear(displacementMaps[0]), makeClear(displacementMaps[1])],
        displacementMaps,
        derivativesMap,
      } satisfies Cascade
    })

    this.displacementNodes = this.cascades.map((c) => texture(c.displacementMaps[0]))
    this.derivativeNodes = this.cascades.map((c) => texture(c.derivativesMap))
  }

  /** Foam-history maps start at 1 (no foam). */
  private ensureInitialized(renderer: WebGPURenderer): void {
    if (this.initialized) return
    this.initialized = true
    for (const cascade of this.cascades) {
      renderer.compute(cascade.clear[0])
      renderer.compute(cascade.clear[1])
    }
  }

  update(renderer: WebGPURenderer, elapsed: number, dt: number): void {
    this.ensureInitialized(renderer)
    this.timeUniform.value = elapsed
    this.dtUniform.value = Math.min(dt, 0.1)

    // Evolve all cascades (independent — one submission).
    renderer.compute(this.cascades.map((c) => c.evolve))

    // Workgroup-shared row/column transforms: one submission per axis, with
    // explicit barriers between every radix-2 butterfly stage.
    const stageCount = this.cascades[0].ifft.stages.length
    for (let stage = 0; stage < stageCount; stage++) {
      renderer.compute(this.cascades.map((c) => c.ifft.stages[stage]))
    }

    // Assemble maps + foam history (ping-pong).
    const parity = this.current
    renderer.compute(this.cascades.map((c) => c.assemble[parity]))
    this.current = 1 - this.current

    // Repoint material texture nodes at the freshly written maps.
    for (let i = 0; i < this.cascades.length; i++) {
      this.displacementNodes[i].value = this.cascades[i].displacementMaps[this.current === 0 ? 0 : 1]
    }
  }
}
