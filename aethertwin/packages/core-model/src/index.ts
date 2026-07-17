export {
  CURRENT_SCHEMA_VERSION,
  createInitialSnapshot,
  createManifest,
  type AssetRecord,
  type Floor,
  type InitialProjectInput,
  type ProjectManifest,
  type ProjectProfile,
  type ProjectSnapshot,
  type SaveState,
  type SpatialProject,
} from "./model";
export { migrateSnapshot, snapshotMigrationRegistry } from "./migrations";
export { parseManifest } from "./validation";
export { migrateSnapshot as parseSnapshot } from "./migrations";
