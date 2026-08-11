//! AetherTwin's least-privilege desktop host boundary.

mod asset_protocol;
#[cfg(test)]
mod asset_protocol_tests;
mod boundary;
pub mod commands;
mod dto;
mod error;
mod export_boundary;
mod registry;
mod state;

pub use dto::{
    BeginProjectExportRequestDto, CancelProjectAssetImportDto, CheckpointProjectDto,
    CloseProjectDto, CommitProjectDto, CreateProjectDto, FinishProjectExportRequestDto,
    ImportProgressDto, ImportProjectAssetDto, ImportResultDto, OpenProjectDto,
    ProjectExportPresetDto, RecoverProjectDto,
};
pub use error::{HostError, NativeErrorDto, NativeLogSink, SanitizedLogRecord};
pub use export_boundary::{ParsedProjectExportChunk, parse_project_export_chunk};
pub use state::{AppService, OpenedProjectDto};

pub fn with_asset_protocol<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    asset_protocol::with_asset_protocol(builder)
}

pub fn with_invoke_handler<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::create_project,
        commands::open_project,
        commands::commit_project,
        commands::checkpoint_project,
        commands::close_project,
        commands::recover_project,
        commands::import_project_asset,
        commands::cancel_project_asset_import
    ])
}
