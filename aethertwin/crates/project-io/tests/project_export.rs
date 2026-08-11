use chrono::{DateTime, Utc};
use project_io::{
    CreateProjectRequest, PROJECT_EXPORT_MAX_CHUNK_BYTES, ProjectExportPreset, ProjectExportSeed,
    ProjectProfile, SaveState, begin_project_export, begin_project_export_with_seed,
    cleanup_project_export_staging, create_project, open_project, open_session,
};
use std::{fs, path::PathBuf};
use tempfile::TempDir;
use uuid::Uuid;

const EXPORT_STAGE_PREFIX: &str = ".aethertwin-export-";

struct TestProject {
    _root: TempDir,
    path: PathBuf,
    snapshot: project_io::ProjectSnapshot,
    manifest: project_io::ProjectManifest,
    floor_id: Uuid,
}

fn project(profile: ProjectProfile) -> TestProject {
    let root = tempfile::tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_owned(),
        name: "Demo".into(),
        profile,
    })
    .unwrap();
    let floor_id = opened.snapshot.project.floors[0].id;
    TestProject {
        _root: root,
        path: opened.project_path,
        snapshot: opened.snapshot,
        manifest: opened.manifest,
        floor_id,
    }
}

fn showroom_project() -> TestProject {
    project(ProjectProfile::Showroom)
}

fn fixed_seed() -> ProjectExportSeed {
    ProjectExportSeed {
        export_id: Uuid::parse_str("12345678-1234-4567-8123-456789abcdef").unwrap(),
        timestamp: DateTime::parse_from_rfc3339("2026-08-09T12:34:56.789Z")
            .unwrap()
            .with_timezone(&Utc),
    }
}

fn opaque_chunk(byte_length: usize) -> Vec<u8> {
    assert_eq!(byte_length % 4, 0);
    let mut bytes = vec![0_u8; byte_length];
    for pixel in bytes.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[17, 34, 51, 255]);
    }
    bytes
}

fn write_opaque_export(operation: &mut project_io::ProjectExportOperation) {
    let expected = operation.expected_byte_length();
    let mut remaining = usize::try_from(expected).unwrap();
    while remaining > 0 {
        let byte_length = remaining.min(PROJECT_EXPORT_MAX_CHUNK_BYTES);
        let index = operation.next_chunk_index();
        operation
            .write_chunk(index, &opaque_chunk(byte_length))
            .unwrap();
        remaining -= byte_length;
    }
}

fn export_stage_entries(project: &TestProject) -> Vec<PathBuf> {
    fs::read_dir(project.path.join("exports"))
        .unwrap()
        .map(Result::unwrap)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with(EXPORT_STAGE_PREFIX)
        })
        .collect()
}

#[test]
fn streams_finishes_and_returns_only_project_relative_evidence() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();

    write_opaque_export(&mut operation);
    let result = operation.finish().unwrap();

    assert_eq!(
        result.relative_path,
        "exports/Demo-20260809T123456789Z-full-hd.png"
    );
    assert!(
        !result
            .relative_path
            .contains(fixture.path.to_string_lossy().as_ref())
    );
    assert_eq!(result.preset, ProjectExportPreset::FullHd);
    assert_eq!((result.width, result.height), (1920, 1080));
    assert!(result.byte_size > 0);
    assert_eq!(result.sha256.len(), 64);
    assert!(fixture.path.join(&result.relative_path).is_file());
}

#[test]
fn maps_both_closed_presets_to_exact_rgba_byte_counts() {
    let fixture = showroom_project();
    for (preset, dimensions, expected_bytes) in [
        (ProjectExportPreset::FullHd, (1920, 1080), 8_294_400),
        (ProjectExportPreset::UltraHd, (3840, 2160), 33_177_600),
    ] {
        let operation = begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            preset,
            fixed_seed(),
        )
        .unwrap();

        assert_eq!((operation.width(), operation.height()), dimensions);
        assert_eq!(operation.expected_byte_length(), expected_bytes);
        operation.cancel().unwrap();
    }
}

#[test]
fn default_begin_creates_a_cancellable_project_bound_operation() {
    let fixture = showroom_project();
    let operation = begin_project_export(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
    )
    .unwrap();

    assert_eq!(operation.preset(), ProjectExportPreset::FullHd);
    operation.cancel().unwrap();
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_market_projects_before_creating_a_stage() {
    let fixture = project(ProjectProfile::Market);

    assert!(
        begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            fixed_seed(),
        )
        .is_err()
    );
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_a_snapshot_with_a_different_project_id() {
    let fixture = showroom_project();
    let mut other_project_snapshot = fixture.snapshot.clone();
    other_project_snapshot.project.id = Uuid::new_v4();

    assert!(
        begin_project_export_with_seed(
            &fixture.path,
            &other_project_snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            fixed_seed(),
        )
        .is_err()
    );
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_an_active_floor_that_is_not_in_the_snapshot() {
    let fixture = showroom_project();

    assert!(
        begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            Uuid::new_v4(),
            ProjectExportPreset::FullHd,
            fixed_seed(),
        )
        .is_err()
    );
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn requires_schema_v3_and_an_rfc4122_export_id() {
    let fixture = showroom_project();
    let mut v2_snapshot = fixture.snapshot.clone();
    v2_snapshot.schema_version = 2;

    assert!(
        begin_project_export_with_seed(
            &fixture.path,
            &v2_snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            fixed_seed(),
        )
        .is_err()
    );
    assert!(
        begin_project_export_with_seed(
            &fixture.path,
            &fixture.snapshot,
            fixture.floor_id,
            ProjectExportPreset::FullHd,
            ProjectExportSeed {
                export_id: Uuid::nil(),
                timestamp: fixed_seed().timestamp,
            },
        )
        .is_err()
    );
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_an_empty_chunk_without_advancing_its_sequence() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();

    assert!(operation.write_chunk(0, &[]).is_err());
    assert_eq!(operation.next_chunk_index(), 0);
    assert!(operation.write_chunk(0, &opaque_chunk(4)).is_err());
    assert!(operation.finish().is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_a_gap_in_chunk_indices_without_advancing_its_sequence() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();

    assert!(operation.write_chunk(1, &opaque_chunk(4)).is_err());
    assert_eq!(operation.next_chunk_index(), 0);
    assert!(operation.write_chunk(0, &opaque_chunk(4)).is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_a_repeated_chunk_index_without_advancing_its_sequence() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();
    operation.write_chunk(0, &opaque_chunk(4)).unwrap();

    assert!(operation.write_chunk(0, &opaque_chunk(4)).is_err());
    assert_eq!(operation.next_chunk_index(), 1);
    assert!(operation.write_chunk(1, &opaque_chunk(4)).is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_an_out_of_order_chunk_index_without_advancing_its_sequence() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();
    operation.write_chunk(0, &opaque_chunk(4)).unwrap();

    assert!(operation.write_chunk(2, &opaque_chunk(4)).is_err());
    assert_eq!(operation.next_chunk_index(), 1);
    assert!(operation.write_chunk(1, &opaque_chunk(4)).is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_a_chunk_larger_than_the_public_limit() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();

    assert!(
        operation
            .write_chunk(0, &opaque_chunk(PROJECT_EXPORT_MAX_CHUNK_BYTES + 4))
            .is_err()
    );
    assert_eq!(operation.next_chunk_index(), 0);
    assert!(operation.write_chunk(0, &opaque_chunk(4)).is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_raw_byte_overrun_before_writing_beyond_the_preset() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();
    write_opaque_export(&mut operation);
    let next_index = operation.next_chunk_index();

    assert!(operation.write_chunk(next_index, &opaque_chunk(4)).is_err());
    assert_eq!(operation.next_chunk_index(), next_index);
    assert!(operation.write_chunk(next_index, &opaque_chunk(4)).is_err());
    assert!(operation.finish().is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_finish_when_raw_input_is_underrun_and_removes_its_stage() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();
    operation.write_chunk(0, &opaque_chunk(4)).unwrap();

    assert!(operation.finish().is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn rejects_nonopaque_alpha_and_makes_the_operation_terminal() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();

    assert!(operation.write_chunk(0, &[17, 34, 51, 0]).is_err());
    assert!(operation.write_chunk(0, &opaque_chunk(4)).is_err());
    assert!(operation.finish().is_err());
    assert!(export_stage_entries(&fixture).is_empty());
}

#[test]
fn cancellation_and_subsequent_staging_cleanup_are_idempotent() {
    let fixture = showroom_project();
    let operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();

    operation.cancel().unwrap();
    cleanup_project_export_staging(&fixture.path).unwrap();
    cleanup_project_export_staging(&fixture.path).unwrap();
    assert!(export_stage_entries(&fixture).is_empty());
    assert_eq!(
        fs::read_dir(fixture.path.join("exports")).unwrap().count(),
        0
    );
}

#[test]
fn collision_suffix_preserves_the_existing_destination_and_publishes_a_new_name() {
    let fixture = showroom_project();
    let destination = fixture
        .path
        .join("exports/Demo-20260809T123456789Z-full-hd.png");
    fs::write(&destination, b"existing export").unwrap();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();
    write_opaque_export(&mut operation);

    let result = operation.finish().unwrap();

    assert_eq!(fs::read(destination).unwrap(), b"existing export");
    assert_eq!(
        result.relative_path,
        "exports/Demo-20260809T123456789Z-full-hd-1.png"
    );
    assert!(fixture.path.join(result.relative_path).is_file());
}

#[test]
fn export_leaves_snapshot_checkpoint_recovery_and_clean_shutdown_state_unchanged() {
    let fixture = showroom_project();
    let before_snapshot = fixture.snapshot.clone();
    let before_manifest = fixture.manifest.clone();
    let mut operation = begin_project_export_with_seed(
        &fixture.path,
        &fixture.snapshot,
        fixture.floor_id,
        ProjectExportPreset::FullHd,
        fixed_seed(),
    )
    .unwrap();
    write_opaque_export(&mut operation);
    operation.finish().unwrap();

    let opened = open_project(&fixture.path).unwrap();
    assert_eq!(opened.snapshot, before_snapshot);
    assert_eq!(opened.manifest, before_manifest);
    assert!(!opened.recovered);

    let mut session = open_session(&fixture.path, false).unwrap();
    assert_eq!(session.save_state(), SaveState::Saved);
    session.close().unwrap();
}

#[test]
fn cleanup_open_session_removes_crash_staging_before_returning() {
    let fixture = showroom_project();
    let stale = fixture
        .path
        .join("exports")
        .join(format!("{EXPORT_STAGE_PREFIX}crash"));
    fs::write(&stale, b"incomplete export").unwrap();

    let mut session = open_session(&fixture.path, false).unwrap();

    assert!(!stale.exists());
    session.close().unwrap();
}

#[test]
fn cleanup_recovered_session_removes_crash_staging_before_returning() {
    let fixture = showroom_project();
    let session = open_session(&fixture.path, false).unwrap();
    let stale = fixture
        .path
        .join("exports")
        .join(format!("{EXPORT_STAGE_PREFIX}recovery-crash"));
    fs::write(&stale, b"incomplete recovered export").unwrap();
    drop(session);

    let mut recovered = open_session(&fixture.path, true).unwrap();

    assert!(!stale.exists());
    recovered.close().unwrap();
}
