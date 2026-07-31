export type { Bounds2, PlanReference, Point2, SpatialEntity, Transform2D } from "@aethertwin/core-model";
export {
  previewCalibration,
  type CalibrationInput,
  type CalibrationPreview,
} from "./calibration";
export { entityWorldBounds, entityWorldVertices } from "./bounds";
export { screenToWorld, worldToScreen, type ViewportTransform } from "./coordinates";
export {
  dimensionGeometry,
  resolveDimensionAnchors,
  type DimensionGeometry,
  type DimensionLineSegment,
  type ResolvedDimensionAnchors,
} from "./dimensions";
export type {
  EntityChange,
  FloorChange,
  PlanEditIntent,
  PlanEditReason,
  RoomCreationInput,
  RoomReplacementInput,
} from "./intents";
export {
  roomCreationIntent,
  roomReplacementIntent,
} from "./intents";
export type { PlanIssue, PlanResult } from "./result";
export {
  normalizeWallTopology,
  type NormalizedRoomTopology,
  type RoomTopologyDiagnostic,
  type RoomTopologyDiagnosticCode,
  type RoomTopologyFailure,
  type RoomTopologyIssueCode,
  type RoomTopologyResult,
} from "./room-topology";
export {
  recognizeClosedRooms,
  representedRoomCandidateKeys,
  roomInputFingerprint,
  type RepresentedRoomCandidateInput,
  type RoomCandidate,
  type RoomFingerprintInput,
  type RoomRecognitionDiagnostic,
  type RoomRecognitionFailure,
  type RoomRecognitionResult,
} from "./rooms";
export {
  alignEntities,
  distributeEntities,
  duplicateEntities,
  linearArray,
  rectangularArray,
  resizeEntities,
  rotateEntities,
  translateEntities,
  type LinearArrayInput,
  type RectangularArrayInput,
} from "./operations";
export {
  hitTestOpening,
  nearestOpeningPlacement,
  type NearestOpeningPlacementInput,
  type OpeningPlacementCandidate,
} from "./openings";
export { boxSelect, hitTest, type BoxSelectOptions, type HitTestOptions } from "./selection";
export {
  applyPlanReferenceTransform,
  hitTestPlan,
  planReferenceSourceToWorld,
  planReferenceWorldBounds,
  planReferenceWorldPolygon,
  planReferenceWorldToSource,
  type HitTestPlanOptions,
  type PlanHit,
} from "./plan-references";
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
