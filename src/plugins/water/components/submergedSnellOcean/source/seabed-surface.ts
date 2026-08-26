import { float, sin, smoothstep, uniform, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { fbm2, valueNoise2 } from './noise'

/**
 * The sand's own surface detail, shared by the seabed material and by the
 * ocean's transmitted-bottom reconstruction.
 *
 * The world-anchored undersea radiance field (sea/underseaRadiance.ts) is a
 * 0.78 m/texel bake — plenty for structures, cast shadows, and the sand's
 * 50 m/220 m tonal fields, but far coarser than a display pixel at close
 * range, where one pixel covers ~0.05 m of seabed. The ripple band lives at
 * ~3 m and would visibly soften. So it is deliberately BAKED FLAT and added
 * back analytically at full resolution on the water side: one definition,
 * evaluated in two places, which is why it lives here rather than inline in
 * the material.
 */

/** Set to 1 only while the undersea radiance field bakes. */
export const seabedRippleBakeFlat = uniform(0)

/**
 * Ripple slope in terrain-local XZ, added to the geometric normal as
 * (x, 0, z). Banded sines distorted by noise, plus a micro grain.
 *
 * `footprint` is metres of seabed crossed by one sample, and it exists for the
 * ocean: procedural noise has no mip chain, so evaluating this at a refracted
 * landing point that moves with the wave normal turns the 0.14 m grain into
 * crawling shimmer on distant water long before the 3 m bands are in trouble.
 * A slope perturbation has mean zero, so each band simply fades TO zero — the
 * filtered answer is the geometric normal, which is exactly right. The seabed
 * material itself passes nothing and keeps its authored full-detail response.
 */
export function seabedRippleSlope(
  worldXZ: Node<'vec2'>,
  footprint?: Node<'float'>,
): Node<'vec2'> {
  const warp = fbm2(worldXZ.mul(0.09)).mul(7.0)
  const band = sin(worldXZ.x.mul(1.9).add(worldXZ.y.mul(0.9)).add(warp))
  const band2 = sin(worldXZ.x.mul(-1.0).add(worldXZ.y.mul(2.3)).add(warp.mul(1.4)))
  const micro = valueNoise2(worldXZ.mul(7.0)).sub(0.5).mul(0.24)
  // Bands run ~3 m; the grain cell is 1/7 m. Each keep is authored against its
  // own wavelength, ending near two samples per period.
  const bandKeep = footprint ? float(1).sub(smoothstep(0.6, 2.2, footprint)) : float(1)
  const microKeep = footprint ? float(1).sub(smoothstep(0.03, 0.12, footprint)) : float(1)
  return vec2(band.mul(0.08), band2.mul(0.06))
    .mul(bandKeep)
    .add(micro.mul(microKeep))
}
