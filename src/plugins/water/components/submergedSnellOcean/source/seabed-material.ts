import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  Fn,
  float,
  mix,
  normalGeometry,
  normalize,
  positionWorld,
  transformNormalToView,
  vec3,
} from 'three/tsl'
import { fbm2 } from './noise'
import { seabedRippleBakeFlat, seabedRippleSlope } from './seabed-surface'

/** Sand with procedural ripples, tonal variation, and caustic light. */
export function createSandMaterial(
  applyCaustics: (material: MeshStandardNodeMaterial, strength?: number) => void,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.roughness = 1
  material.metalness = 0

  const xz = positionWorld.xz

  const tone = fbm2(xz.mul(0.02))
  const patchTone = fbm2(xz.mul(0.0045))
  const base = mix(vec3(0.48, 0.43, 0.33), vec3(0.58, 0.54, 0.43), tone)
  material.colorNode = mix(base, vec3(0.33, 0.4, 0.3), patchTone.smoothstep(0.62, 0.85).mul(0.5))

  // Sand ripples: banded sine distorted by noise, as a normal perturbation.
  // Suppressed only while a world-anchored radiance field bakes — the water
  // side re-adds this exact band analytically at full display resolution,
  // which a 0.78 m/texel bake could not carry (see ./seabed-surface).
  material.normalNode = Fn(() => {
    const slope = seabedRippleSlope(xz).mul(float(1).sub(seabedRippleBakeFlat))
    // NodeMaterial.normalNode is a view-space hook. Keep the authored ripple
    // field in terrain-local space, then transform the resolved normal exactly
    // once; passing the local vector through directly makes the sun rotate
    // around a camera-fixed normal as the view turns.
    const localNormal = normalize(normalGeometry.add(vec3(slope.x, 0, slope.y)))
    return transformNormalToView(localNormal)
  })()

  applyCaustics(material, 1.15)
  return material
}
