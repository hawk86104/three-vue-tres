use chrono::{DateTime, Utc};
use project_io::{
    CreateProjectRequest, ProjectExportSeed, ProjectProfile, cleanup_project_export_staging,
    create_project, sanitize_project_export_stem,
};
use std::{fs, path::PathBuf};
use tempfile::TempDir;
use uuid::Uuid;

const EXPORT_STAGE_PREFIX: &str = ".aethertwin-export-";

struct TestProject {
    _root: TempDir,
    path: PathBuf,
}

fn project() -> TestProject {
    let root = tempfile::tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Demo".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    TestProject {
        _root: root,
        path: opened.project_path,
    }
}

fn project_id() -> Uuid {
    Uuid::parse_str("12345678-1234-4567-8123-456789abcdef").unwrap()
}

fn fixed_time() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-08-09T12:34:56.789Z")
        .unwrap()
        .with_timezone(&Utc)
}

fn exports(project: &TestProject) -> PathBuf {
    project.path.join("exports")
}

fn create_exports_fixture(project: &TestProject) -> PathBuf {
    let exports = exports(project);
    fs::create_dir_all(&exports).unwrap();
    exports
}

#[test]
fn project_export_seed_is_cloneable_and_preserves_fixed_identity_and_time() {
    let seed = ProjectExportSeed {
        export_id: project_id(),
        timestamp: fixed_time(),
    };

    assert_eq!(seed.clone(), seed);
    assert_eq!(seed.export_id, project_id());
    assert_eq!(seed.timestamp, fixed_time());
}

#[test]
fn sanitizes_control_characters_and_collapses_replacement_runs() {
    assert_eq!(
        sanitize_project_export_stem(" Demo<>:\"/\\|?*... ", project_id()),
        "Demo-"
    );
    assert_eq!(
        sanitize_project_export_stem("before\0\t\nafter", project_id()),
        "before-after"
    );
    assert_eq!(
        sanitize_project_export_stem("before<>:\"/\\|?*after", project_id()),
        "before-after"
    );
}

#[test]
fn sanitization_removes_trailing_windows_unsafe_characters_and_uses_a_stable_fallback() {
    assert_eq!(
        sanitize_project_export_stem("Demo...   ", project_id()),
        "Demo"
    );
    assert_eq!(
        sanitize_project_export_stem("\0<>:\"/\\|?*... ", project_id()),
        "aethertwin-12345678"
    );
}

#[test]
fn sanitization_truncates_only_at_a_utf8_boundary_within_eighty_bytes() {
    let stem = sanitize_project_export_stem(&"\u{754c}".repeat(27), project_id());

    assert_eq!(stem, "\u{754c}".repeat(26));
    assert!(stem.len() <= 80);
    assert!(std::str::from_utf8(stem.as_bytes()).is_ok());
}

#[test]
fn cleanup_creates_an_empty_exports_directory_when_the_verified_project_lacks_one() {
    let project = project();
    let exports = exports(&project);
    fs::remove_dir(&exports).unwrap();

    cleanup_project_export_staging(&project.path).unwrap();

    assert!(exports.is_dir());
    assert_eq!(fs::read_dir(exports).unwrap().count(), 0);
}

#[test]
fn cleanup_removes_only_matching_regular_staging_files_and_preserves_destinations() {
    let project = project();
    let exports = create_exports_fixture(&project);
    let stale = exports.join(format!("{EXPORT_STAGE_PREFIX}stale"));
    let destination = exports.join("Demo-20260809T123456789Z-full-hd.png");
    let near_match = exports.join(".aethertwin-export");
    let unrelated = exports.join("notes.txt");
    fs::write(&stale, b"stale export").unwrap();
    fs::write(&destination, b"published destination").unwrap();
    fs::write(&near_match, b"not a staging file").unwrap();
    fs::write(&unrelated, b"keep").unwrap();

    cleanup_project_export_staging(&project.path).unwrap();

    assert!(!stale.exists());
    assert_eq!(fs::read(destination).unwrap(), b"published destination");
    assert_eq!(fs::read(near_match).unwrap(), b"not a staging file");
    assert_eq!(fs::read(unrelated).unwrap(), b"keep");
}

#[test]
fn cleanup_refuses_a_matching_non_regular_entry_without_deleting_it_or_exposing_paths() {
    let project = project();
    let staging_directory =
        create_exports_fixture(&project).join(format!("{EXPORT_STAGE_PREFIX}directory"));
    fs::create_dir(&staging_directory).unwrap();

    let error = cleanup_project_export_staging(&project.path).unwrap_err();

    assert!(staging_directory.is_dir());
    assert!(
        !error
            .to_string()
            .contains(project.path.to_string_lossy().as_ref())
    );
}

#[cfg(any(target_os = "linux", target_os = "android"))]
#[test]
fn cleanup_refuses_a_matching_fifo_without_waiting_for_a_writer() {
    use rustix::fs::{Mode, mkfifoat};
    use std::os::unix::fs::FileTypeExt;
    use std::sync::mpsc;
    use std::time::Duration;

    let project = project();
    let exports = create_exports_fixture(&project);
    let stage = exports.join(format!("{EXPORT_STAGE_PREFIX}fifo"));
    let exports_handle = fs::File::open(&exports).unwrap();
    mkfifoat(
        &exports_handle,
        stage.file_name().unwrap(),
        Mode::RUSR | Mode::WUSR,
    )
    .unwrap();
    drop(exports_handle);

    let project_path = project.path.clone();
    let (sender, receiver) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        sender
            .send(cleanup_project_export_staging(&project_path))
            .unwrap();
    });
    let result = receiver
        .recv_timeout(Duration::from_secs(2))
        .expect("cleanup blocked while opening a FIFO");
    worker.join().unwrap();

    assert!(result.is_err());
    assert!(stage.symlink_metadata().unwrap().file_type().is_fifo());
}

#[cfg(unix)]
#[test]
fn cleanup_never_follows_a_matching_staging_symlink() {
    let project = project();
    let outside = tempfile::tempdir().unwrap();
    let target = outside.path().join("outside-export");
    let stage = create_exports_fixture(&project).join(format!("{EXPORT_STAGE_PREFIX}redirect"));
    fs::write(&target, b"outside-must-not-change").unwrap();
    std::os::unix::fs::symlink(&target, &stage).unwrap();

    let error = cleanup_project_export_staging(&project.path).unwrap_err();

    assert_eq!(fs::read(target).unwrap(), b"outside-must-not-change");
    assert!(
        fs::symlink_metadata(stage)
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert!(
        !error
            .to_string()
            .contains(project.path.to_string_lossy().as_ref())
    );
}

#[cfg(windows)]
#[test]
#[ignore = "requires Windows symlink privilege; deterministic ordinary/non-regular defenses run portably"]
fn cleanup_never_follows_windows_reparse_points() {
    {
        let project = project();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("outside-export");
        let stage = create_exports_fixture(&project).join(format!("{EXPORT_STAGE_PREFIX}redirect"));
        fs::write(&target, b"outside-must-not-change").unwrap();
        std::os::windows::fs::symlink_file(&target, &stage).unwrap();

        let error = cleanup_project_export_staging(&project.path).unwrap_err();

        assert_eq!(fs::read(target).unwrap(), b"outside-must-not-change");
        assert!(
            fs::symlink_metadata(stage)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert!(
            !error
                .to_string()
                .contains(project.path.to_string_lossy().as_ref())
        );
    }

    {
        let project = project();
        let outside = tempfile::tempdir().unwrap();
        let original = create_exports_fixture(&project);
        let preserved = project.path.join("exports-preserved");
        fs::rename(&original, &preserved).unwrap();
        std::os::windows::fs::symlink_dir(outside.path(), &original).unwrap();

        let error = cleanup_project_export_staging(&project.path).unwrap_err();

        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
        assert!(preserved.is_dir());
        assert!(
            !error
                .to_string()
                .contains(project.path.to_string_lossy().as_ref())
        );
    }
}

#[cfg(unix)]
#[test]
fn cleanup_rejects_an_exports_directory_symlink_replacement_without_touching_the_redirect_target() {
    let project = project();
    let outside = tempfile::tempdir().unwrap();
    let original = create_exports_fixture(&project);
    let preserved = project.path.join("exports-preserved");
    fs::rename(&original, &preserved).unwrap();
    std::os::unix::fs::symlink(outside.path(), &original).unwrap();

    let error = cleanup_project_export_staging(&project.path).unwrap_err();

    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    assert!(preserved.is_dir());
    assert!(
        !error
            .to_string()
            .contains(project.path.to_string_lossy().as_ref())
    );
}
