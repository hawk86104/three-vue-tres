//! Project I/O boundary for the AetherTwin desktop workspace.

mod error;
mod lock;
mod model;
mod opening_geometry;
mod paths;
mod project;
mod schema;

pub use error::ProjectIoError;
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
pub use schema::snapshot_checksum;
