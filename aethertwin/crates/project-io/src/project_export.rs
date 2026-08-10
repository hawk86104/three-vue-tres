use crate::{
    ProjectIoError,
    export_path::{ProjectExportSeed, sanitize_project_export_stem},
    model::{CURRENT_SCHEMA_VERSION, ProjectProfile, ProjectSnapshot, valid_uuid},
    paths::{BoundExportStage, BoundExportsDirectory},
    project::load_opened_project,
};
use chrono::Utc;
use media_export::{
    MediaExportError, PngDimensions, PngRgbaStream, PngSummary, validate_png_and_hash,
};
use std::{fs::File, path::Path};
use uuid::Uuid;

pub const PROJECT_EXPORT_MAX_CHUNK_BYTES: usize = 1_048_576;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectExportPreset {
    FullHd,
    UltraHd,
}

impl ProjectExportPreset {
    pub const fn dimensions(self) -> (u32, u32) {
        match self {
            Self::FullHd => (1920, 1080),
            Self::UltraHd => (3840, 2160),
        }
    }

    const fn slug(self) -> &'static str {
        match self {
            Self::FullHd => "full-hd",
            Self::UltraHd => "ultra-hd",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectExportResult {
    pub preset: ProjectExportPreset,
    pub width: u32,
    pub height: u32,
    pub relative_path: String,
    pub byte_size: u64,
    pub sha256: String,
}

pub struct ProjectExportOperation {
    export_id: Uuid,
    preset: ProjectExportPreset,
    width: u32,
    height: u32,
    expected_byte_length: u64,
    written_byte_length: u64,
    next_chunk_index: u64,
    encoder: Option<PngRgbaStream<File>>,
    stage: Option<BoundExportStage>,
    base_leaf: String,
    terminal_error: Option<ProjectIoError>,
}

pub fn begin_project_export(
    project_path: &Path,
    snapshot: &ProjectSnapshot,
    active_floor_id: Uuid,
    preset: ProjectExportPreset,
) -> Result<ProjectExportOperation, ProjectIoError> {
    begin_project_export_with_seed(
        project_path,
        snapshot,
        active_floor_id,
        preset,
        ProjectExportSeed {
            export_id: Uuid::new_v4(),
            timestamp: Utc::now(),
        },
    )
}

pub fn begin_project_export_with_seed(
    project_path: &Path,
    snapshot: &ProjectSnapshot,
    active_floor_id: Uuid,
    preset: ProjectExportPreset,
    seed: ProjectExportSeed,
) -> Result<ProjectExportOperation, ProjectIoError> {
    snapshot.validate()?;
    if snapshot.schema_version != CURRENT_SCHEMA_VERSION
        || snapshot.project.profile != ProjectProfile::Showroom
        || !valid_uuid(&seed.export_id)
        || !snapshot
            .project
            .floors
            .iter()
            .any(|floor| floor.id == active_floor_id)
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }

    let exports = BoundExportsDirectory::bind(project_path)?;
    let opened = load_opened_project(
        exports.bound_project_path(),
        exports.bound_project_path(),
        false,
    )?;
    exports.revalidate()?;
    if opened.manifest.schema_version != CURRENT_SCHEMA_VERSION
        || opened.manifest.project_id != snapshot.project.id
        || opened.manifest.profile != ProjectProfile::Showroom
        || !opened
            .snapshot
            .project
            .floors
            .iter()
            .any(|floor| floor.id == active_floor_id)
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }

    let (width, height) = preset.dimensions();
    let dimensions = PngDimensions { width, height };
    let expected_byte_length = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(ProjectIoError::ExportEncodeFailed)?;
    let base_leaf = format!(
        "{}-{}-{}",
        sanitize_project_export_stem(&snapshot.project.name, snapshot.project.id),
        seed.timestamp.format("%Y%m%dT%H%M%S%3fZ"),
        preset.slug(),
    );
    let (stage, writer) = exports.create_export_stage(seed.export_id)?;
    let encoder = match PngRgbaStream::new(writer, dimensions) {
        Ok(encoder) => encoder,
        Err(_) => {
            let _ = stage.cancel();
            return Err(ProjectIoError::ExportEncodeFailed);
        }
    };
    if encoder.expected_raw_bytes() != expected_byte_length {
        drop(encoder);
        let _ = stage.cancel();
        return Err(ProjectIoError::ExportEncodeFailed);
    }

    Ok(ProjectExportOperation {
        export_id: seed.export_id,
        preset,
        width,
        height,
        expected_byte_length,
        written_byte_length: 0,
        next_chunk_index: 0,
        encoder: Some(encoder),
        stage: Some(stage),
        base_leaf,
        terminal_error: None,
    })
}

impl ProjectExportOperation {
    pub fn export_id(&self) -> Uuid {
        self.export_id
    }

    pub fn preset(&self) -> ProjectExportPreset {
        self.preset
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn expected_byte_length(&self) -> u64 {
        self.expected_byte_length
    }

    pub fn next_chunk_index(&self) -> u64 {
        self.next_chunk_index
    }

    pub fn write_chunk(&mut self, index: u64, bytes: &[u8]) -> Result<(), ProjectIoError> {
        if let Some(error) = self.terminal_error {
            return Err(error);
        }
        if index != self.next_chunk_index {
            let error = self.fail(ProjectIoError::ExportChunkOutOfOrder);
            return Err(error);
        }
        if bytes.is_empty() {
            let error = self.fail(ProjectIoError::ExportByteCountMismatch);
            return Err(error);
        }
        if bytes.len() > PROJECT_EXPORT_MAX_CHUNK_BYTES {
            let error = self.fail(ProjectIoError::ExportChunkTooLarge);
            return Err(error);
        }
        let byte_count = match u64::try_from(bytes.len()) {
            Ok(byte_count) => byte_count,
            Err(_) => {
                let error = self.fail(ProjectIoError::ExportByteCountMismatch);
                return Err(error);
            }
        };
        let Some(cumulative) = self.written_byte_length.checked_add(byte_count) else {
            let error = self.fail(ProjectIoError::ExportByteCountMismatch);
            return Err(error);
        };
        if cumulative > self.expected_byte_length {
            let error = self.fail(ProjectIoError::ExportByteCountMismatch);
            return Err(error);
        }
        let Some(encoder) = self.encoder.as_mut() else {
            let error = self.fail(ProjectIoError::ExportEncodeFailed);
            return Err(error);
        };
        if write_encoder(encoder, bytes).is_err() {
            let error = self.fail(ProjectIoError::ExportEncodeFailed);
            return Err(error);
        }
        self.written_byte_length = cumulative;
        self.next_chunk_index += 1;
        Ok(())
    }

    pub fn finish(mut self) -> Result<ProjectExportResult, ProjectIoError> {
        if let Some(error) = self.terminal_error {
            return Err(error);
        }
        if self.written_byte_length != self.expected_byte_length {
            let error = self.fail(ProjectIoError::ExportByteCountMismatch);
            return Err(error);
        }
        let Some(encoder) = self.encoder.take() else {
            let error = self.fail(ProjectIoError::ExportEncodeFailed);
            return Err(error);
        };
        if encoder.finish().is_err() {
            let error = self.fail(ProjectIoError::ExportEncodeFailed);
            return Err(error);
        }

        let dimensions = PngDimensions {
            width: self.width,
            height: self.height,
        };
        let validation_result = match self.stage.as_ref() {
            Some(stage) => match stage.sync_and_clone() {
                Ok(mut file) => validate_stage(&mut file, dimensions)
                    .map_err(|_| ProjectIoError::ExportValidationFailed),
                Err(_) => Err(ProjectIoError::ExportValidationFailed),
            },
            None => Err(ProjectIoError::ExportValidationFailed),
        };
        let summary = match validation_result {
            Ok(summary) => summary,
            Err(error) => {
                let error = self.fail(error);
                return Err(error);
            }
        };

        #[cfg(test)]
        if CORRUPT_NEXT_EXPORT_AFTER_VALIDATION_TEST_HOOK.with(|corrupt| corrupt.replace(false)) {
            let corruption_result = self
                .stage
                .as_ref()
                .ok_or(ProjectIoError::ExportValidationFailed)
                .and_then(|stage| stage.corrupt_after_validation_for_test());
            if corruption_result.is_err() {
                let error = self.fail(ProjectIoError::ExportValidationFailed);
                return Err(error);
            }
        }

        let publish_result = match self.stage.as_mut() {
            Some(stage) => stage.publish_first_absent(&self.base_leaf),
            None => Err(ProjectIoError::ExportPublishFailed),
        };
        let relative_path = match publish_result {
            Ok(path) => path,
            Err(_) => {
                let error = self.fail(ProjectIoError::ExportPublishFailed);
                return Err(error);
            }
        };

        let published_validation_result = match self.stage.as_ref() {
            Some(stage) => match stage.sync_and_clone() {
                Ok(mut file) => validate_stage(&mut file, dimensions)
                    .map_err(|_| ProjectIoError::ExportValidationFailed),
                Err(_) => Err(ProjectIoError::ExportValidationFailed),
            },
            None => Err(ProjectIoError::ExportValidationFailed),
        };
        let published_summary = match published_validation_result {
            Ok(summary) => summary,
            Err(error) => {
                let error = self.fail(error);
                return Err(error);
            }
        };
        if published_summary != summary {
            let error = self.fail(ProjectIoError::ExportValidationFailed);
            return Err(error);
        }

        let Some(stage) = self.stage.take() else {
            let error = self.fail(ProjectIoError::ExportPublishFailed);
            return Err(error);
        };
        if stage.accept_publication().is_err() {
            let error = self.fail(ProjectIoError::ExportPublishFailed);
            return Err(error);
        }

        Ok(ProjectExportResult {
            preset: self.preset,
            width: self.width,
            height: self.height,
            relative_path,
            byte_size: published_summary.byte_size,
            sha256: published_summary.sha256,
        })
    }

    pub fn cancel(mut self) -> Result<(), ProjectIoError> {
        self.encoder.take();
        match self.stage.take() {
            Some(stage) => stage
                .cancel()
                .map_err(|_| ProjectIoError::ExportPublishFailed),
            None => Ok(()),
        }
    }

    fn fail(&mut self, error: ProjectIoError) -> ProjectIoError {
        if self.terminal_error.is_none() {
            self.encoder.take();
            if let Some(stage) = self.stage.take() {
                let _ = stage.cancel();
            }
            self.terminal_error = Some(error);
        }
        self.terminal_error.unwrap_or(error)
    }
}

impl Drop for ProjectExportOperation {
    fn drop(&mut self) {
        self.encoder.take();
        if let Some(stage) = self.stage.take() {
            let _ = stage.cancel();
        }
    }
}

#[cfg(test)]
thread_local! {
    static FAIL_NEXT_EXPORT_ENCODE_TEST_HOOK: std::cell::Cell<bool> =
        const { std::cell::Cell::new(false) };
    static FAIL_NEXT_EXPORT_VALIDATION_TEST_HOOK: std::cell::Cell<bool> =
        const { std::cell::Cell::new(false) };
    static CORRUPT_NEXT_EXPORT_AFTER_VALIDATION_TEST_HOOK: std::cell::Cell<bool> =
        const { std::cell::Cell::new(false) };
}

fn write_encoder(encoder: &mut PngRgbaStream<File>, bytes: &[u8]) -> Result<(), MediaExportError> {
    #[cfg(test)]
    if FAIL_NEXT_EXPORT_ENCODE_TEST_HOOK.with(|fail| fail.replace(false)) {
        return Err(MediaExportError::EncodeFailed);
    }
    encoder.write_rgba(bytes)
}

fn validate_stage(
    file: &mut File,
    dimensions: PngDimensions,
) -> Result<PngSummary, MediaExportError> {
    #[cfg(test)]
    if FAIL_NEXT_EXPORT_VALIDATION_TEST_HOOK.with(|fail| fail.replace(false)) {
        return Err(MediaExportError::ValidationFailed);
    }
    validate_png_and_hash(file, dimensions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CreateProjectRequest, ProjectProfile, create_project};
    use chrono::{DateTime, Utc};
    use std::{fs, path::PathBuf};
    use tempfile::TempDir;

    struct Fixture {
        _root: TempDir,
        path: PathBuf,
        snapshot: ProjectSnapshot,
        floor_id: Uuid,
    }

    fn fixture() -> Fixture {
        let root = tempfile::tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Failure Demo".into(),
            profile: ProjectProfile::Showroom,
        })
        .unwrap();
        Fixture {
            _root: root,
            floor_id: opened.snapshot.project.floors[0].id,
            path: opened.project_path,
            snapshot: opened.snapshot,
        }
    }

    fn seed() -> ProjectExportSeed {
        ProjectExportSeed {
            export_id: Uuid::parse_str("12345678-1234-4567-8123-456789abcdef").unwrap(),
            timestamp: DateTime::parse_from_rfc3339("2026-08-09T12:34:56.789Z")
                .unwrap()
                .with_timezone(&Utc),
        }
    }

    fn stage_count(fixture: &Fixture) -> usize {
        fs::read_dir(fixture.path.join("exports"))
            .unwrap()
            .map(Result::unwrap)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(crate::paths::EXPORT_STAGE_PREFIX)
            })
            .count()
    }

    fn write_all(operation: &mut ProjectExportOperation) {
        let mut remaining = usize::try_from(operation.expected_byte_length()).unwrap();
        while remaining > 0 {
            let length = remaining.min(PROJECT_EXPORT_MAX_CHUNK_BYTES);
            let mut bytes = vec![0_u8; length];
            for pixel in bytes.chunks_exact_mut(4) {
                pixel.copy_from_slice(&[1, 2, 3, 255]);
            }
            operation
                .write_chunk(operation.next_chunk_index(), &bytes)
                .unwrap();
            remaining -= length;
        }
    }

    #[test]
    fn encoder_failure_is_terminal_and_removes_only_its_stage() {
        let fixture = fixture();
        let mut operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        FAIL_NEXT_EXPORT_ENCODE_TEST_HOOK.with(|fail| fail.set(true));

        let error = operation.write_chunk(0, &[1, 2, 3, 255]).unwrap_err();

        assert_eq!(error.code(), "EXPORT_ENCODE_FAILED");
        assert!(operation.write_chunk(0, &[1, 2, 3, 255]).is_err());
        assert_eq!(stage_count(&fixture), 0);
    }

    #[test]
    fn validation_failure_removes_the_stage_without_publishing() {
        let fixture = fixture();
        let mut operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        write_all(&mut operation);
        FAIL_NEXT_EXPORT_VALIDATION_TEST_HOOK.with(|fail| fail.set(true));

        let error = operation.finish().unwrap_err();

        assert_eq!(error.code(), "EXPORT_VALIDATION_FAILED");
        assert_eq!(stage_count(&fixture), 0);
        assert_eq!(
            fs::read_dir(fixture.path.join("exports")).unwrap().count(),
            0
        );
    }

    #[test]
    fn publication_failure_removes_the_stage_without_publishing() {
        let fixture = fixture();
        let mut operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        write_all(&mut operation);
        crate::paths::fail_next_export_publication();

        let error = operation.finish().unwrap_err();

        assert_eq!(error.code(), "EXPORT_PUBLISH_FAILED");
        assert_eq!(stage_count(&fixture), 0);
        assert_eq!(
            fs::read_dir(fixture.path.join("exports")).unwrap().count(),
            0
        );
    }

    #[test]
    fn cancel_retries_cleanup_on_drop_after_a_transient_unlink_failure() {
        let fixture = fixture();
        let operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        crate::paths::fail_next_export_stage_unlink();

        let error = operation.cancel().unwrap_err();

        assert_eq!(error.code(), "EXPORT_PUBLISH_FAILED");
        assert_eq!(
            fs::read_dir(fixture.path.join("exports")).unwrap().count(),
            0
        );
    }

    #[test]
    fn directory_sync_and_first_cleanup_failure_leave_no_output() {
        let fixture = fixture();
        let mut operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        write_all(&mut operation);
        crate::paths::fail_next_export_directory_sync();
        crate::paths::fail_next_export_stage_unlink();

        let error = operation.finish().unwrap_err();

        assert_eq!(error.code(), "EXPORT_PUBLISH_FAILED");
        assert_eq!(
            fs::read_dir(fixture.path.join("exports")).unwrap().count(),
            0
        );
    }

    #[test]
    fn post_validation_content_change_is_rejected_without_publishing() {
        let fixture = fixture();
        let mut operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        write_all(&mut operation);
        CORRUPT_NEXT_EXPORT_AFTER_VALIDATION_TEST_HOOK.with(|corrupt| corrupt.set(true));

        let error = operation.finish().unwrap_err();

        assert_eq!(error.code(), "EXPORT_VALIDATION_FAILED");
        assert_eq!(
            fs::read_dir(fixture.path.join("exports")).unwrap().count(),
            0
        );
    }

    #[test]
    fn post_publish_reopen_failure_removes_the_pending_destination() {
        let fixture = fixture();
        let mut operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            seed(),
        )
        .unwrap();
        write_all(&mut operation);
        crate::paths::fail_next_export_post_publish_reopen();

        let error = operation.finish().unwrap_err();

        assert_eq!(error.code(), "EXPORT_VALIDATION_FAILED");
        assert_eq!(
            fs::read_dir(fixture.path.join("exports")).unwrap().count(),
            0
        );
    }
    #[cfg(windows)]
    #[test]
    fn active_stage_denies_a_second_writer() {
        let fixture = fixture();
        let export_seed = seed();
        let stage = fixture.path.join("exports").join(format!(
            "{}{}",
            crate::paths::EXPORT_STAGE_PREFIX,
            export_seed.export_id.hyphenated()
        ));
        let operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            export_seed,
        )
        .unwrap();

        assert!(fs::OpenOptions::new().write(true).open(stage).is_err());
        operation.cancel().unwrap();
    }
}
