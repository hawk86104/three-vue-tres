export {
  CURRENT_SCHEMA_VERSION,
  createInitialSnapshot,
  createManifest,
  type AssetRecord,
  type InitialProjectInput,
  type ProjectManifest,
  type ProjectProfile,
  type ProjectSnapshot,
  type SaveState,
  type SpatialProject,
} from "./model";
export {
  identityTransform2D,
  type Bounds2,
  type Point2,
  type Size2,
  type Spatial3D,
  type Transform2D,
} from "./geometry";
export type {
  Boundary,
  DimensionAnchor,
  DimensionAnnotation,
  Fixture,
  FixtureKind,
  Floor,
  PlanLayer,
  PointOfInterest,
  PointOfInterestKind,
  ProjectRecordBase,
  SpaceUnit,
  SpaceUnitKind,
  SpatialEntity,
  SpatialEntityBase,
  Wall,
  Zone,
} from "./spatial-entities";
export type {
  CameraShot,
  MediaAsset,
  Opening,
  ProductContent,
  RouteEdge,
  RouteNetwork,
  RouteNode,
  StorySequence,
  ThemeConfig,
  Vendor,
} from "./content-model";
export {
  ModelValidationError,
  parseManifest,
  parseSnapshotV2,
  type ModelIssueCode,
} from "./validation";
export {
  migrateSnapshot,
  migrateSnapshot as parseSnapshot,
  snapshotMigrationRegistry,
} from "./migrations";
