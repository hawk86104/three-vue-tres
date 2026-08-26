import { BufferAttribute, BufferGeometry } from 'three'

export const OCEAN_INNER_HALF_SIZE = 350
/** Inner displacement is exactly zero across this final border width. */
export const OCEAN_FLAT_EDGE_MARGIN = 15
/** The flat skirt underlays the detailed sheet only inside its flat border. */
export const OCEAN_SKIRT_HOLE_HALF_SIZE = OCEAN_INNER_HALF_SIZE - OCEAN_FLAT_EDGE_MARGIN
export const OCEAN_SKIRT_OUTER_HALF_SIZE = 3_200

interface BoundaryPoint {
  x: number
  z: number
}

/**
 * Point on a square boundary, ordered clockwise as seen from +Y.
 *
 * Keeping the same parameter on the inner and outer squares turns the far
 * skirt into four flat trapezoid strips. Subdividing the inner skirt boundary
 * at the active quality tier keeps its coplanar coverage apron stable under
 * the detailed sheet's much denser edge.
 */
function squareBoundaryPoint(halfSize: number, sample: number, segments: number): BoundaryPoint {
  const side = Math.floor(sample / segments)
  const offset = sample - side * segments
  const segmentSize = (halfSize * 2) / segments
  const coordinate = offset * segmentSize - halfSize

  switch (side) {
    case 0:
      return { x: -halfSize, z: coordinate }
    case 1:
      return { x: coordinate, z: halfSize }
    case 2:
      return { x: halfSize, z: -coordinate }
    default:
      return { x: -coordinate, z: -halfSize }
  }
}

/**
 * Exact square ring with a coplanar coverage apron for the flat far ocean.
 *
 * The detailed ocean is mathematically flat over its final 15 m. The skirt
 * occupies that same plane beneath the flat border, so partially covered MSAA
 * samples at the detailed mesh edge still resolve to ocean instead of the
 * bright background. Unlike the former lowered overlap, this creates no open
 * step when viewed from below and no displaced surfaces can cross.
 */
export function createOceanSkirtGeometry(segments = 384): BufferGeometry {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new Error(`Ocean skirt segments must be a positive integer: ${segments}`)
  }

  const boundarySamples = segments * 4
  const positions = new Float32Array(boundarySamples * 2 * 3)
  const indices: number[] = []

  for (let sample = 0; sample < boundarySamples; sample++) {
    const outer = squareBoundaryPoint(OCEAN_SKIRT_OUTER_HALF_SIZE, sample, segments)
    const inner = squareBoundaryPoint(OCEAN_SKIRT_HOLE_HALF_SIZE, sample, segments)
    const offset = sample * 6
    positions[offset] = outer.x
    positions[offset + 1] = 0
    positions[offset + 2] = outer.z
    positions[offset + 3] = inner.x
    positions[offset + 4] = 0
    positions[offset + 5] = inner.z
  }

  for (let sample = 0; sample < boundarySamples; sample++) {
    const next = (sample + 1) % boundarySamples
    const outer = sample * 2
    const inner = outer + 1
    const outerNext = next * 2
    const innerNext = outerNext + 1
    indices.push(outer, outerNext, innerNext, outer, innerNext, inner)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function auditOceanSkirtGeometry(segments = 384): {
  segments: number
  quads: number
  triangles: number
  coverageOverlapMeters: number
  minimumHoleHalfSize: number
  maximumOuterHalfSize: number
  coverageBoundaryVertices: number
  maximumHoleBoundaryError: number
  maximumBoundaryHeightError: number
  minimumTriangleNormalY: number
} {
  const geometry = createOceanSkirtGeometry(segments)
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const boundarySamples = segments * 4
  if (!index || position.count !== boundarySamples * 2) {
    throw new Error('Ocean skirt topology does not match its coverage boundary')
  }

  let minimumHoleHalfSize = Infinity
  let maximumOuterHalfSize = 0
  let maximumHoleBoundaryError = 0
  let maximumBoundaryHeightError = 0
  for (let sample = 0; sample < boundarySamples; sample++) {
    const outer = sample * 2
    const inner = outer + 1
    const outerHalfSize = Math.max(Math.abs(position.getX(outer)), Math.abs(position.getZ(outer)))
    const innerHalfSize = Math.max(Math.abs(position.getX(inner)), Math.abs(position.getZ(inner)))
    minimumHoleHalfSize = Math.min(minimumHoleHalfSize, innerHalfSize)
    maximumOuterHalfSize = Math.max(maximumOuterHalfSize, outerHalfSize)
    maximumHoleBoundaryError = Math.max(
      maximumHoleBoundaryError,
      Math.abs(innerHalfSize - OCEAN_SKIRT_HOLE_HALF_SIZE),
    )
    maximumBoundaryHeightError = Math.max(
      maximumBoundaryHeightError,
      Math.abs(position.getY(outer)),
      Math.abs(position.getY(inner)),
    )
  }

  let minimumTriangleNormalY = Infinity
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset)
    const b = index.getX(offset + 1)
    const c = index.getX(offset + 2)
    const ux = position.getX(b) - position.getX(a)
    const uz = position.getZ(b) - position.getZ(a)
    const vx = position.getX(c) - position.getX(a)
    const vz = position.getZ(c) - position.getZ(a)
    minimumTriangleNormalY = Math.min(minimumTriangleNormalY, uz * vx - ux * vz)
  }

  const coverageOverlapMeters = OCEAN_INNER_HALF_SIZE - minimumHoleHalfSize
  if (
    maximumHoleBoundaryError !== 0 ||
    coverageOverlapMeters !== OCEAN_FLAT_EDGE_MARGIN
  ) {
    throw new Error(
      `Ocean skirt coverage apron is incorrect: ${coverageOverlapMeters} m`,
    )
  }
  if (maximumOuterHalfSize !== OCEAN_SKIRT_OUTER_HALF_SIZE) {
    throw new Error(`Ocean skirt outer boundary is incorrect: ${maximumOuterHalfSize} m`)
  }
  if (maximumBoundaryHeightError !== 0) {
    throw new Error(`Ocean skirt boundary is not coplanar: ${maximumBoundaryHeightError} m`)
  }
  if (minimumTriangleNormalY <= 0) {
    throw new Error(`Ocean skirt has downward or degenerate triangles: ${minimumTriangleNormalY}`)
  }
  geometry.dispose()
  return {
    segments,
    quads: index.count / 6,
    triangles: index.count / 3,
    coverageOverlapMeters,
    minimumHoleHalfSize,
    maximumOuterHalfSize,
    coverageBoundaryVertices: boundarySamples,
    maximumHoleBoundaryError,
    maximumBoundaryHeightError,
    minimumTriangleNormalY,
  }
}
