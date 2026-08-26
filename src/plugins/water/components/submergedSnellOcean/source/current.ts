import { Fn, cos, sin, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/**
 * One shared current field: a gentle curl-ish flow that every drifting or
 * swaying thing samples, so nothing in the scene moves on its own private
 * noise. Nothing is ever perfectly still.
 *
 * Returns meters/second, magnitude ≈ 0.
 */
export const currentFlow = /*@__PURE__*/ Fn(([p, t]: [Node<'vec3'>, Node<'float'>]) => {
  const x = p.x.mul(0.05)
  const z = p.z.mul(0.05)
  const s1 = sin(x.add(t.mul(0.11))).mul(cos(z.mul(1.3).sub(t.mul(0.07))))
  const s2 = sin(z.mul(0.7).add(t.mul(0.05)).add(x.mul(0.4)))
  const s3 = cos(x.mul(1.7).sub(z.mul(0.6)).add(t.mul(0.09)))
  return vec3(
    s1.mul(0.5).add(s2.mul(0.2)),
    s3.mul(0.12),
    s2.mul(0.45).sub(s1.mul(0.15)),
  )
})

/** CPU mirror of `currentFlow` — same field, same phase, for CPU-side props. */
export function currentFlowCpu(px: number, pz: number, t: number): { x: number; y: number; z: number } {
  const x = px * 0.05
  const z = pz * 0.05
  const s1 = Math.sin(x + t * 0.11) * Math.cos(z * 1.3 - t * 0.07)
  const s2 = Math.sin(z * 0.7 + t * 0.05 + x * 0.4)
  const s3 = Math.cos(x * 1.7 - z * 0.6 + t * 0.09)
  return { x: s1 * 0.5 + s2 * 0.2, y: s3 * 0.12, z: s2 * 0.45 - s1 * 0.15 }
}
