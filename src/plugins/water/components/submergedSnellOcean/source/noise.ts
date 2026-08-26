import { Fn, Loop, float, fract, dot, floor, mix, sin, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

type V2 = Node<'vec2'>
type F1 = Node<'float'>

/**
 * Shared procedural noise TSL functions (hash / value noise / fbm).
 * Every material and effect reuses these — one implementation, one look.
 */

export const hash21 = /*@__PURE__*/ Fn(([p]: [V2]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar()
  p3.addAssign(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(p3.x.add(p3.y).mul(p3.z))
})

export const valueNoise2 = /*@__PURE__*/ Fn(([p]: [V2]) => {
  const i = floor(p).toVar()
  const f = fract(p).toVar()
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar()
  const a = hash21(i)
  const b = hash21(i.add(vec2(1, 0)))
  const c = hash21(i.add(vec2(0, 1)))
  const d = hash21(i.add(vec2(1, 1)))
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
})

/** 5-octave rotated fbm, output ~[0,1]. */
export const fbm2 = /*@__PURE__*/ Fn(([p]: [V2]) => {
  const value = float(0).toVar()
  const amplitude = float(0.5).toVar()
  const q = p.toVar()
  Loop({ start: 0, end: 5 }, () => {
    value.addAssign(valueNoise2(q).mul(amplitude))
    const rotated = vec2(
      q.x.mul(0.8).sub(q.y.mul(0.6)),
      q.x.mul(0.6).add(q.y.mul(0.8)),
    )
    q.assign(rotated.mul(2.04))
    amplitude.mulAssign(0.5)
  })
  return value
})

/** Cheap periodic shimmer in [0,1] — for sway and flicker phases. */
export const shimmer = /*@__PURE__*/ Fn(([p, t]: [V2, F1]) => {
  return sin(p.x.mul(1.7).add(t)).mul(sin(p.y.mul(2.3).add(t.mul(1.31)))).mul(0.5).add(0.5)
})
