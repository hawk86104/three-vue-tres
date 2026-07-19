//! Project I/O boundary for the AetherTwin desktop workspace.

mod error;
mod lock;
mod model;
mod paths;
mod project;
mod schema;

pub use error::ProjectIoError;
pub use model::{
    AssetRecord, CommitBatch, CreateProjectRequest, Floor, JournalAction, JournalOperation,
    OpenedProject, ProjectManifest, ProjectProfile, ProjectSnapshot, SaveState, SpatialProject,
};
pub use paths::validate_relative_resource_path;
pub use project::{ProjectSession, create_project, open_project, open_session, recover_project};
pub use schema::snapshot_checksum;
