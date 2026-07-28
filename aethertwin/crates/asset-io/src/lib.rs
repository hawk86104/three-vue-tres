//! Safe, content-addressed asset import for AetherTwin projects.

mod error;
mod import;
mod media;
mod resolver;
mod source;
mod svg;

pub use error::AssetIoError;
pub use import::{
    AssetImportRole, ImportObserver, ImportProgress, ImportRequest, ImportResult, ImportStage,
    import_project_asset,
};
pub use media::{AssetMediaFacts, AssetMediaType, InspectedMedia, inspect_asset_media};
pub use project_io::AssetRecord;
pub use resolver::{AssetIssue, AssetIssueRecord, AssetResolver, VerifiedAsset, sha256_hex};
