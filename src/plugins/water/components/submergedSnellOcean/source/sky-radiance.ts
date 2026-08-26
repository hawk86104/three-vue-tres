import { Fn, dot, float, max, mix, normalize, pow, smoothstep, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { sunColorUniform, sunDirectionUniform } from './sun'

/**
 * Shared HDR sky radiance — sampled by the sky dome, the ocean reflection,
 * and the Snell's window refraction so they can never disagree (spectral-ocean
 * rule: one sky function for dome and reflected ray).
 *
 * Values are linear HDR: the sun disc is far above 1.0 and drives bloom.
 *
 * `discStrength` scales the sun disc itself (0..1). The ocean passes 0: its
 * analytic glint/window-glint terms ARE the specular response to the disc
 * (a delta light × BRDF), so sampling the disc again through a bumpy normal
 * would double-count it as aliased white pixels. Halo and aureole still
 * reflect/refract — they are area light, not delta.
 */

/** The real sun subtends ~0.53°; work in x² = (1−cosθ)/(1−cosR) ≈ (θ/R)². */
const SUN_COS_RADIUS = Math.cos((0.266 * Math.PI) / 180)

/** Shared marine-aerosol tint for the dome and far-surface inscattering. */
export const marineHazeTint = /*@__PURE__*/ vec3(0.65, 0.59, 0.69)

export const skyRadiance = /*@__PURE__*/ Fn(
  ([direction, discStrength]: [Node<'vec3'>, Node<'float'>]) => {
    const dir = normalize(direction).toVar()
    const up = max(dir.y, 0.0)

    const zenith = vec3(0.05, 0.2, 0.5)
    const horizon = vec3(0.4, 0.54, 0.68)
    const seaMist = vec3(0.32, 0.43, 0.52)

    const gradient = mix(horizon, zenith, pow(up, 0.48))
    const sky = mix(seaMist, gradient, smoothstep(-0.08, 0.02, dir.y)).toVar()

    // A broad, faint marine aerosol layer softens the open-ocean horizon in
    // every azimuth. Keep this response strictly bounded: skyRadiance also
    // feeds the ocean reflection path, where a non-finite value blacks out
    // the entire surface. Wide C1 shoulders make the endpoints imperceptible.
    const marineHazeAmount = smoothstep(-0.18, 0.0, dir.y)
      .mul(float(1).sub(smoothstep(0.0, 0.3, dir.y)))
      .mul(0.16)
    sky.assign(mix(sky, marineHazeTint, marineHazeAmount))

    const sunAmount = max(dot(dir, sunDirectionUniform), 0.0).toVar()

    // The disc: correct angular size, limb-darkened (Neckel–Labs style
    // I(μ) ≈ 0.30 + 0.93μ − 0.23μ²), edge feathered over ~2% of the radius.
    // x² stays numerically stable where acos(sunAmount) is not.
    const x2 = float(1).sub(sunAmount).div(1 - SUN_COS_RADIUS).toVar()
    const inDisc = smoothstep(1.0, 0.96, x2)
    const mu = float(1).sub(x2).max(0.0).sqrt()
    const limb = float(0.3).add(mu.mul(0.93)).sub(mu.mul(mu).mul(0.23))
    const disc = inDisc.mul(limb).mul(discStrength).mul(1500.0)

    // Circumsolar aureole (forward Mie): a hot tight core melting into a
    // wide warm halo — this seats the disc IN the atmosphere instead of
    // pasting a glowing circle onto it.
    const aureole = pow(sunAmount, 3000.0)
      .mul(20.0)
      .add(pow(sunAmount, 260.0).mul(1.7))
      .add(pow(sunAmount, 18.0).mul(0.16))

    return sky.mul(1.25).add(sunColorUniform.mul(aureole.add(disc)))
  },
)
