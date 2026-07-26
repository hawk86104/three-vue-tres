use asset_io::{
    AssetImportRole, AssetMediaFacts, ImportObserver, ImportProgress, ImportRequest, ImportStage,
    import_project_asset,
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};
use tempfile::TempDir;
use uuid::Uuid;

const ONE_MIB: usize = 1024 * 1024;

fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend_from_slice(&13_u32.to_be_bytes());
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
    bytes.extend_from_slice(&[0; 4]);
    bytes.extend_from_slice(&0_u32.to_be_bytes());
    bytes.extend_from_slice(b"IEND");
    bytes.extend_from_slice(&[0; 4]);
    bytes
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn canonical(root: &Path, digest: &str, extension: &str) -> PathBuf {
    root.join("assets")
        .join("sha256")
        .join(&digest[..2])
        .join(format!("{digest}.{extension}"))
}

fn request(root: &Path, source: &Path, role: AssetImportRole) -> ImportRequest {
    ImportRequest {
        project_root: root.to_path_buf(),
        source: source.to_path_buf(),
        operation_id: Uuid::new_v4(),
        role,
    }
}

#[derive(Default)]
struct RecordingObserver {
    events: Mutex<Vec<ImportProgress>>,
    cancel_at: Mutex<Option<ImportStage>>,
    cancelled: AtomicBool,
}

impl RecordingObserver {
    fn cancelling_at(stage: ImportStage) -> Self {
        Self {
            cancel_at: Mutex::new(Some(stage)),
            ..Self::default()
        }
    }

    fn events(&self) -> Vec<ImportProgress> {
        self.events.lock().unwrap().clone()
    }
}

impl ImportObserver for RecordingObserver {
    fn progress(&self, value: ImportProgress) {
        self.events.lock().unwrap().push(value);
        if self.cancel_at.lock().unwrap().as_ref() == Some(&value.stage) {
            self.cancelled.store(true, Ordering::SeqCst);
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

type Hook = Box<dyn FnOnce() + Send>;

struct HookObserver {
    stage: ImportStage,
    hook: Mutex<Option<Hook>>,
    events: Mutex<Vec<ImportProgress>>,
    cancelled: AtomicBool,
}

impl HookObserver {
    fn new(stage: ImportStage, hook: impl FnOnce() + Send + 'static) -> Self {
        Self {
            stage,
            hook: Mutex::new(Some(Box::new(hook))),
            events: Mutex::new(Vec::new()),
            cancelled: AtomicBool::new(false),
        }
    }
}

impl ImportObserver for HookObserver {
    fn progress(&self, value: ImportProgress) {
        self.events.lock().unwrap().push(value);
        if value.stage == self.stage {
            if let Some(hook) = self.hook.lock().unwrap().take() {
                hook();
            }
        }
    }
    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

struct VerificationCancelObserver {
    target_stage: ImportStage,
    cancel_on_check: usize,
    armed: AtomicBool,
    checks: AtomicUsize,
    cancelled: AtomicBool,
    events: Mutex<Vec<ImportProgress>>,
}

impl VerificationCancelObserver {
    fn after_terminal_hash_check(cancel_on_check: usize) -> Self {
        Self {
            target_stage: ImportStage::Hash,
            cancel_on_check,
            armed: AtomicBool::new(false),
            checks: AtomicUsize::new(0),
            cancelled: AtomicBool::new(false),
            events: Mutex::new(Vec::new()),
        }
    }

    fn after_publish_check(cancel_on_check: usize) -> Self {
        Self {
            target_stage: ImportStage::Publish,
            cancel_on_check,
            armed: AtomicBool::new(false),
            checks: AtomicUsize::new(0),
            cancelled: AtomicBool::new(false),
            events: Mutex::new(Vec::new()),
        }
    }

    fn events(&self) -> Vec<ImportProgress> {
        self.events.lock().unwrap().clone()
    }
}

impl ImportObserver for VerificationCancelObserver {
    fn progress(&self, value: ImportProgress) {
        self.events.lock().unwrap().push(value);
        let should_arm = match self.target_stage {
            ImportStage::Hash => {
                value.stage == ImportStage::Hash && value.completed_bytes == value.total_bytes
            }
            ImportStage::Publish => value.stage == ImportStage::Publish,
            _ => false,
        };
        if should_arm {
            self.checks.store(0, Ordering::SeqCst);
            self.armed.store(true, Ordering::SeqCst);
        }
    }

    fn is_cancelled(&self) -> bool {
        if self.armed.load(Ordering::SeqCst) {
            let check = self.checks.fetch_add(1, Ordering::SeqCst) + 1;
            if check == self.cancel_on_check {
                self.cancelled.store(true, Ordering::SeqCst);
            }
        }
        self.cancelled.load(Ordering::SeqCst)
    }
}

fn import_stage_leaves(root: &Path) -> Vec<PathBuf> {
    fn visit(directory: &Path, output: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(directory) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                visit(&path, output);
            } else if entry
                .file_name()
                .to_string_lossy()
                .starts_with(".aethertwin-import-")
            {
                output.push(path);
            }
        }
    }
    let mut output = Vec::new();
    visit(root, &mut output);
    output
}

#[test]
fn imports_to_exact_canonical_path_with_streaming_progress_and_redacted_record() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("private-source-name.png");
    let mut bytes = png(640, 480);
    bytes.resize(2 * ONE_MIB + 73, 0x5a);
    fs::write(&source, &bytes).unwrap();
    let observer = RecordingObserver::default();
    let request = request(&root, &source, AssetImportRole::PlanReference);
    let operation_id = request.operation_id;

    let result = import_project_asset(request, &observer).unwrap();
    let expected_digest = digest(&bytes);
    let expected_relative = format!(
        "assets/sha256/{}/{}.png",
        &expected_digest[..2],
        expected_digest
    );
    assert_ne!(result.asset.id, operation_id);
    assert_ne!(result.asset.id, Uuid::nil());
    assert!(matches!(result.asset.id.get_version_num(), 1..=5));
    assert_eq!(result.asset.id.get_variant(), uuid::Variant::RFC4122);
    assert_eq!(result.asset.sha256, expected_digest);
    assert_eq!(result.asset.relative_path, expected_relative);
    assert_eq!(result.asset.media_type, "image/png");
    assert_eq!(result.asset.size, bytes.len() as u64);
    assert_eq!(
        result.facts,
        AssetMediaFacts::Image {
            width: 640,
            height: 480
        }
    );
    assert_eq!(
        fs::read(root.join(&result.asset.relative_path)).unwrap(),
        bytes
    );
    let serialized = serde_json::to_string(&result.asset).unwrap();
    assert!(!serialized.contains("private-source-name"));
    assert!(!serialized.contains(&source.to_string_lossy().to_string()));

    let events = observer.events();
    assert!(
        events
            .iter()
            .all(|event| event.operation_id == operation_id
                && event.total_bytes == bytes.len() as u64)
    );
    let mut distinct = Vec::new();
    for event in &events {
        if distinct.last() != Some(&event.stage) {
            distinct.push(event.stage);
        }
    }
    assert_eq!(
        distinct,
        [
            ImportStage::Capture,
            ImportStage::Validate,
            ImportStage::Hash,
            ImportStage::Publish,
            ImportStage::Complete
        ]
    );
    let hash_events: Vec<_> = events
        .iter()
        .filter(|event| event.stage == ImportStage::Hash)
        .collect();
    assert!(hash_events.len() >= 3);
    for pair in hash_events.windows(2) {
        assert!(pair[1].completed_bytes >= pair[0].completed_bytes);
        assert!(pair[1].completed_bytes - pair[0].completed_bytes <= ONE_MIB as u64);
    }
    assert_eq!(
        events
            .iter()
            .filter(|event| event.stage == ImportStage::Complete)
            .count(),
        1
    );
    assert!(import_stage_leaves(&root).is_empty());
}

#[test]
fn exact_existing_destination_is_reused_but_wrong_same_size_content_collides() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let bytes = png(8, 9);
    fs::write(&source, &bytes).unwrap();
    let first = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap();
    let destination = root.join(&first.asset.relative_path);
    let before = fs::metadata(&destination).unwrap().modified().unwrap();
    let second = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap();
    assert_eq!(second.asset.sha256, first.asset.sha256);
    assert_eq!(second.asset.relative_path, first.asset.relative_path);
    assert_eq!(fs::read(&destination).unwrap(), bytes);
    assert_eq!(
        fs::metadata(&destination).unwrap().modified().unwrap(),
        before
    );

    fs::write(&destination, vec![0x41; bytes.len()]).unwrap();
    let error = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_COLLISION");
    assert_eq!(fs::read(&destination).unwrap(), vec![0x41; bytes.len()]);
    assert!(import_stage_leaves(&root).is_empty());
}

#[test]
fn publication_race_never_overwrites_the_colliding_leaf() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let bytes = png(2, 3);
    fs::write(&source, &bytes).unwrap();
    let destination = canonical(&root, &digest(&bytes), "png");
    let collision = b"attacker-owned-destination".to_vec();
    let destination_for_hook = destination.clone();
    let collision_for_hook = collision.clone();
    let observer = HookObserver::new(ImportStage::Publish, move || {
        fs::create_dir_all(destination_for_hook.parent().unwrap()).unwrap();
        fs::write(destination_for_hook, collision_for_hook).unwrap();
    });

    let error = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_COLLISION");
    assert_eq!(fs::read(destination).unwrap(), collision);
    assert!(import_stage_leaves(&root).is_empty());
}

#[test]
fn bound_project_root_remains_authority_if_its_path_is_replaced() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    let moved_root = temp.path().join("bound-project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let bytes = png(4, 5);
    fs::write(&source, &bytes).unwrap();
    let replacement_succeeded = Arc::new(AtomicBool::new(false));
    let replacement_succeeded_for_hook = Arc::clone(&replacement_succeeded);
    let root_for_hook = root.clone();
    let moved_root_for_hook = moved_root.clone();
    let observer = HookObserver::new(ImportStage::Capture, move || {
        if fs::rename(&root_for_hook, &moved_root_for_hook).is_ok() {
            fs::create_dir(&root_for_hook).unwrap();
            replacement_succeeded_for_hook.store(true, Ordering::SeqCst);
        }
    });

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap();
    if replacement_succeeded.load(Ordering::SeqCst) {
        assert_eq!(
            fs::read(moved_root.join(&result.asset.relative_path)).unwrap(),
            bytes
        );
        assert!(!root.join(&result.asset.relative_path).exists());
    } else {
        assert_eq!(
            fs::read(root.join(&result.asset.relative_path)).unwrap(),
            bytes
        );
    }
}

#[test]
fn held_derived_directory_cannot_redirect_publication() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let bytes = png(6, 7);
    fs::write(&source, &bytes).unwrap();
    let digest = digest(&bytes);
    let prefix = &digest[..2];
    let prefix_directory = root.join("assets/sha256").join(prefix);
    let moved_prefix = root.join("assets/sha256").join(format!("{prefix}-bound"));
    let replacement_succeeded = Arc::new(AtomicBool::new(false));
    let replacement_succeeded_for_hook = Arc::clone(&replacement_succeeded);
    let prefix_for_hook = prefix_directory.clone();
    let moved_for_hook = moved_prefix.clone();
    let observer = HookObserver::new(ImportStage::Publish, move || {
        if fs::rename(&prefix_for_hook, &moved_for_hook).is_ok() {
            fs::create_dir(&prefix_for_hook).unwrap();
            replacement_succeeded_for_hook.store(true, Ordering::SeqCst);
        }
    });

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap();
    let leaf = format!("{digest}.png");
    if replacement_succeeded.load(Ordering::SeqCst) {
        let bound_bytes = fs::read(moved_prefix.join(&leaf)).ok();
        assert_eq!(
            bound_bytes.as_deref(),
            Some(bytes.as_slice()),
            "publication escaped the held derived directory"
        );
        assert!(!prefix_directory.join(&leaf).exists());
    } else {
        assert_eq!(fs::read(prefix_directory.join(&leaf)).unwrap(), bytes);
    }
    assert_eq!(result.asset.sha256, digest);
}

#[test]
fn stage_leaf_replacement_is_never_published_or_deleted_as_cleanup() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(8, 8);
    bytes.resize(ONE_MIB + 31, 0x2f);
    fs::write(&source, &bytes).unwrap();
    let foreign = vec![0x61; bytes.len()];
    let moved_stage = root.join("assets/owned-stage-moved.stage");
    let replaced_leaf = Arc::new(Mutex::new(None::<PathBuf>));
    let replaced_leaf_for_hook = Arc::clone(&replaced_leaf);
    let root_for_hook = root.clone();
    let moved_stage_for_hook = moved_stage.clone();
    let foreign_for_hook = foreign.clone();
    let observer = HookObserver::new(ImportStage::Publish, move || {
        let Some(stage) = import_stage_leaves(&root_for_hook).into_iter().next() else {
            return;
        };
        if fs::rename(&stage, &moved_stage_for_hook).is_ok() {
            fs::write(&stage, &foreign_for_hook).unwrap();
            *replaced_leaf_for_hook.lock().unwrap() = Some(stage);
        }
    });

    let outcome = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    let destination = canonical(&root, &digest(&bytes), "png");
    if let Some(foreign_leaf) = replaced_leaf.lock().unwrap().clone() {
        assert!(
            outcome.is_ok(),
            "publication must continue through the opened owned stage: {outcome:?}"
        );
        assert_eq!(fs::read(&foreign_leaf).unwrap(), foreign);
        assert_eq!(fs::read(&destination).unwrap(), bytes);
    } else {
        outcome.unwrap();
        assert_eq!(fs::read(&destination).unwrap(), bytes);
    }
}

fn assert_cancelled_before_complete(
    result: Result<asset_io::ImportResult, asset_io::AssetIoError>,
    observer: &VerificationCancelObserver,
) {
    assert_eq!(result.unwrap_err().code(), "ASSET_IMPORT_CANCELLED");
    assert_eq!(
        observer
            .events()
            .iter()
            .filter(|event| event.stage == ImportStage::Complete)
            .count(),
        0
    );
}

#[test]
fn cancellation_is_checked_during_second_source_hash() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(10, 11);
    bytes.resize(2 * ONE_MIB + 73, 0x4a);
    fs::write(&source, &bytes).unwrap();
    let observer = VerificationCancelObserver::after_terminal_hash_check(3);

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    assert_cancelled_before_complete(result, &observer);
    assert!(
        observer
            .events()
            .iter()
            .all(|event| event.stage != ImportStage::Publish)
    );
    assert!(import_stage_leaves(&root).is_empty());
}

#[test]
fn cancellation_is_checked_during_full_stage_hash() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(12, 13);
    bytes.resize(2 * ONE_MIB + 73, 0x5b);
    fs::write(&source, &bytes).unwrap();
    let chunks = bytes.len().div_ceil(ONE_MIB);
    let observer = VerificationCancelObserver::after_terminal_hash_check(chunks + 3);

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    assert_cancelled_before_complete(result, &observer);
    assert!(
        observer
            .events()
            .iter()
            .all(|event| event.stage != ImportStage::Publish)
    );
    assert!(import_stage_leaves(&root).is_empty());
}

#[cfg(windows)]
#[test]
fn published_destination_denies_external_write_during_full_verification_hash() {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_SHARE_WRITE: u32 = 0x2;
    const FILE_SHARE_DELETE: u32 = 0x4;

    struct DestinationWriteProbeObserver {
        destination: PathBuf,
        armed: AtomicBool,
        checks: AtomicUsize,
        attempted: AtomicBool,
        writer: Mutex<Option<fs::File>>,
    }

    impl ImportObserver for DestinationWriteProbeObserver {
        fn progress(&self, value: ImportProgress) {
            if value.stage == ImportStage::Publish {
                self.checks.store(0, Ordering::SeqCst);
                self.armed.store(true, Ordering::SeqCst);
            }
        }

        fn is_cancelled(&self) -> bool {
            if self.armed.load(Ordering::SeqCst)
                && self.checks.fetch_add(1, Ordering::SeqCst) + 1 == 2
            {
                let writer = fs::OpenOptions::new()
                    .write(true)
                    .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
                    .open(&self.destination)
                    .ok();
                self.attempted.store(true, Ordering::SeqCst);
                *self.writer.lock().unwrap() = writer;
            }
            false
        }
    }

    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(18, 19);
    bytes.resize(2 * ONE_MIB + 73, 0x8e);
    fs::write(&source, &bytes).unwrap();
    let destination = canonical(&root, &digest(&bytes), "png");
    let observer = DestinationWriteProbeObserver {
        destination: destination.clone(),
        armed: AtomicBool::new(false),
        checks: AtomicUsize::new(0),
        attempted: AtomicBool::new(false),
        writer: Mutex::new(None),
    };

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    assert!(
        observer.attempted.load(Ordering::SeqCst),
        "write probe did not run inside destination verification"
    );
    assert!(
        observer.writer.lock().unwrap().is_none(),
        "external writer acquired the published digest leaf during full verification"
    );
    result.unwrap();
    assert_eq!(fs::read(destination).unwrap(), bytes);
}

#[test]
fn cancellation_is_checked_during_new_destination_hash() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(14, 15);
    bytes.resize(2 * ONE_MIB + 73, 0x6c);
    fs::write(&source, &bytes).unwrap();
    let observer = VerificationCancelObserver::after_publish_check(3);

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    assert_cancelled_before_complete(result, &observer);
    assert_eq!(
        fs::read(canonical(&root, &digest(&bytes), "png")).unwrap(),
        bytes
    );
}

#[test]
fn cancellation_is_checked_during_existing_destination_hash() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(16, 17);
    bytes.resize(2 * ONE_MIB + 73, 0x7d);
    fs::write(&source, &bytes).unwrap();
    import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap();
    let observer = VerificationCancelObserver::after_publish_check(3);

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    assert_cancelled_before_complete(result, &observer);
    assert_eq!(
        fs::read(canonical(&root, &digest(&bytes), "png")).unwrap(),
        bytes
    );
}

#[test]
fn cancellation_has_no_complete_event_and_removes_only_its_owned_stage_leaf() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir_all(root.join("assets")).unwrap();
    let foreign = root.join("assets/.aethertwin-import-foreign.stage");
    fs::write(&foreign, b"keep me").unwrap();
    let source = temp.path().join("asset.png");
    let mut bytes = png(1, 1);
    bytes.resize(ONE_MIB + 17, 0x2a);
    fs::write(&source, &bytes).unwrap();
    let observer = RecordingObserver::cancelling_at(ImportStage::Hash);

    let error = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_IMPORT_CANCELLED");
    assert_eq!(fs::read(&foreign).unwrap(), b"keep me");
    assert_eq!(import_stage_leaves(&root), vec![foreign]);
    assert_eq!(
        observer
            .events()
            .iter()
            .filter(|event| event.stage == ImportStage::Complete)
            .count(),
        0
    );
    assert!(!canonical(&root, &digest(&bytes), "png").exists());
}

#[test]
fn complete_is_the_only_terminal_result_when_cancellation_arrives_in_complete_callback() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    fs::write(&source, png(2, 2)).unwrap();
    let observer = RecordingObserver::cancelling_at(ImportStage::Complete);

    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    );
    assert!(
        result.is_ok(),
        "a published complete import must not become cancelled: {result:?}"
    );
    assert_eq!(
        observer
            .events()
            .iter()
            .filter(|event| event.stage == ImportStage::Complete)
            .count(),
        1
    );
}

#[test]
fn source_swap_between_identity_capture_and_open_is_rejected() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let moved = temp.path().join("captured.png");
    fs::write(&source, png(1, 1)).unwrap();
    let source_for_hook = source.clone();
    let observer = HookObserver::new(ImportStage::Capture, move || {
        fs::rename(&source_for_hook, &moved).unwrap();
        fs::write(&source_for_hook, png(2, 2)).unwrap();
    });
    let error = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_SOURCE_CHANGED");
    assert!(import_stage_leaves(&root).is_empty());
}

#[cfg(unix)]
#[test]
fn opened_source_bytes_are_never_reopened_by_pathname() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("asset.png");
    let moved = temp.path().join("opened.png");
    let original = png(3, 4);
    fs::write(&source, &original).unwrap();
    let source_for_hook = source.clone();
    let observer = HookObserver::new(ImportStage::Validate, move || {
        fs::rename(&source_for_hook, moved).unwrap();
        fs::write(source_for_hook, png(9, 9)).unwrap();
    });
    let result = import_project_asset(
        request(&root, &source, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap();
    assert_eq!(result.asset.sha256, digest(&original));
    assert_eq!(
        result.facts,
        AssetMediaFacts::Image {
            width: 3,
            height: 4
        }
    );
}

#[test]
fn rejects_directories_as_sources() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let error = import_project_asset(
        request(&root, temp.path(), AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_SOURCE_NOT_REGULAR_FILE");
}

#[cfg(unix)]
#[test]
fn rejects_symlink_sources_on_unix() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let target = temp.path().join("target.png");
    let link = temp.path().join("link.png");
    fs::write(&target, png(1, 1)).unwrap();
    assert!(
        std::os::unix::fs::symlink(&target, &link).is_ok(),
        "Unix symlink fixture creation failed"
    );
    let error = import_project_asset(
        request(&root, &link, AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_SOURCE_NOT_REGULAR_FILE");
}

#[cfg(windows)]
#[test]
#[ignore = "requires Windows symlink privilege; deterministic reparse-bit classification runs as a unit test"]
fn rejects_reparse_sources_on_privileged_windows_lane() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("project.twinproj");
    fs::create_dir(&root).unwrap();
    let target = temp.path().join("target.png");
    let link = temp.path().join("link.png");
    fs::write(&target, png(1, 1)).unwrap();
    assert!(
        std::os::windows::fs::symlink_file(&target, &link).is_ok(),
        "privileged Windows reparse fixture unavailable"
    );
    let error = import_project_asset(
        request(&root, &link, AssetImportRole::ContentImage),
        &RecordingObserver::default(),
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_SOURCE_NOT_REGULAR_FILE");
}

#[test]
fn validates_request_role_size_and_error_redaction_without_path_or_os_text() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("secret-project-stage-destination");
    fs::create_dir(&root).unwrap();
    let source = temp.path().join("secret-source-name.png");
    fs::write(&source, png(1, 1)).unwrap();
    let observer = RecordingObserver::default();

    let request_debug = format!(
        "{:?}",
        request(&root, &source, AssetImportRole::ContentImage)
    );
    for secret in [
        "secret-project".to_owned(),
        "secret-source".to_owned(),
        root.to_string_lossy().into_owned(),
        source.to_string_lossy().into_owned(),
    ] {
        assert!(
            !request_debug
                .to_ascii_lowercase()
                .contains(&secret.to_ascii_lowercase()),
            "request debug leaked a private path"
        );
    }

    let mut invalid = request(&root, &source, AssetImportRole::ContentImage);
    invalid.operation_id = Uuid::nil();
    let error = import_project_asset(invalid, &observer).unwrap_err();
    assert_eq!(error.code(), "INVALID_ASSET_IMPORT_REQUEST");

    let error = import_project_asset(
        request(&root, &source, AssetImportRole::ContentVideo),
        &observer,
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_ROLE_MEDIA_MISMATCH");

    let missing = temp.path().join("os-error-sentinel-missing.png");
    let error = import_project_asset(
        request(&root, &missing, AssetImportRole::ContentImage),
        &observer,
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_IO_FAILED");
    let rendered = format!("{error} {error:?}");
    for secret in [
        "secret-project",
        "secret-source",
        "stage",
        "destination",
        "os-error-sentinel",
        "cannot find",
        "not found",
    ] {
        assert!(
            !rendered
                .to_ascii_lowercase()
                .contains(&secret.to_ascii_lowercase()),
            "leaked {secret}: {rendered}"
        );
    }

    let large = temp.path().join("large.mp4");
    let file = fs::File::create(&large).unwrap();
    file.set_len(4 * 1024 * 1024 * 1024 + 1).unwrap();
    drop(file);
    let error = import_project_asset(
        request(&root, &large, AssetImportRole::ContentVideo),
        &observer,
    )
    .unwrap_err();
    assert_eq!(error.code(), "ASSET_TOO_LARGE");
}
