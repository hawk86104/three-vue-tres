//! Project I/O boundary for the AetherTwin desktop workspace.

mod error;
mod export_path;
mod lock;
mod model;
mod opening_geometry;
mod paths;
mod project;
mod project_export;
mod scene_environment_command;
mod schema;

pub use error::ProjectIoError;
pub use export_path::{
    ProjectExportSeed, cleanup_project_export_staging, sanitize_project_export_stem,
};
pub use model::{
    AssetRecord, CheckpointResult, CommitBatch, CreateProjectRequest, Floor, GuidedRoute,
    JournalAction, JournalOperation, MediaAsset, MediaAssetKind, OpenedProject, PlanLayer,
    ProductContent, ProjectManifest, ProjectProfile, ProjectSnapshot, RouteEdge, RouteNetwork,
    RouteNode, RouteNodeKind, SaveState, SpatialProject,
};
pub use paths::validate_relative_resource_path;
pub use project::{
    ProjectSession, create_project, open_project, open_session, recover_project,
    validate_commit_batch,
};
pub use project_export::{
    PROJECT_EXPORT_MAX_CHUNK_BYTES, ProjectExportOperation, ProjectExportPreset,
    ProjectExportResult, begin_project_export, begin_project_export_with_seed,
};
pub use schema::snapshot_checksum;
