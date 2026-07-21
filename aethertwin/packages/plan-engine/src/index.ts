export type { Bounds2, Point2, SpatialEntity, Transform2D } from "@aethertwin/core-model";
export { entityWorldBounds, entityWorldVertices } from "./bounds";
export { screenToWorld, worldToScreen, type ViewportTransform } from "./coordinates";
export {
  dimensionGeometry,
  resolveDimensionAnchors,
  type DimensionGeometry,
  type DimensionLineSegment,
  type ResolvedDimensionAnchors,
} from "./dimensions";
export type { PlanIssue, PlanResult } from "./result";
export { boxSelect, hitTest, type BoxSelectOptions, type HitTestOptions } from "./selection";
export {
  alignmentGuides,
  findAngleSnap,
  findSnap,
  type AlignmentGuidesInput,
  type FindSnapInput,
  type PointSnapCandidate,
  type PointSnapMode,
  type SnapMode,
  type SnapResult,
} from "./snapping";
export {
  UniformGridSpatialIndex,
  type SpatialIndex,
} from "./spatial-index";
export { formatLength, parseLength, type DisplayUnit } from "./units";
export {
  applyTransform,
  composeTransform,
  invertTransform,
  normalizeTransform,
} from "./transforms";
