//! Project I/O boundary for the AetherTwin desktop workspace.

mod error;
mod model;
mod paths;
mod project;
mod schema;

pub use error::ProjectIoError;
pub use model::{
    AssetRecord, CreateProjectRequest, Floor, OpenedProject, ProjectManifest, ProjectProfile,
    ProjectSnapshot, SpatialProject,
};
pub use paths::validate_relative_resource_path;
pub use project::{create_project, open_project};
pub use schema::snapshot_checksum;
