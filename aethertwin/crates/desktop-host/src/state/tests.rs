use super::{
    AppService, ProgressSink, ProgressTracker, finalize_created_publication,
    finalize_created_session, validate_session_id,
};
use crate::{
    CancelProjectAssetImportDto, CreateProjectDto, ImportProgressDto, ImportProjectAssetDto,
    OpenProjectDto,
    error::{HostError, host_error_code},
};
use asset_io::{AssetIssue, ImportProgress, ImportStage, sha256_hex};
use project_io::{
    AssetRecord, CommitBatch, CreateProjectRequest, JournalAction, JournalOperation,
    ProjectIoError, ProjectProfile, create_project, open_session,
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    fs,
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        Arc, Barrier, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};
use tempfile::tempdir;
use uuid::Uuid;

fn rename_batch(before: &project_io::ProjectSnapshot, name: &str) -> CommitBatch {
    let mut after = before.clone();
    after.sequence += 1;
    after.project.name = name.into();
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![JournalOperation::rename(
            after.sequence,
            &Uuid::new_v4().to_string(),
            &before.project.name,
            name,
        )],
    }
}

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

fn verified_asset(bytes: &[u8]) -> AssetRecord {
    let sha256 = sha256_hex(bytes);
    AssetRecord {
        id: Uuid::new_v4(),
        relative_path: format!("assets/sha256/{}/{sha256}.png", &sha256[..2]),
        sha256,
        media_type: "image/png".into(),
        size: bytes.len() as u64,
    }
}

fn publish_asset(project_path: &str, asset: &AssetRecord, bytes: &[u8]) {
    let destination = std::path::Path::new(project_path).join(&asset.relative_path);
    fs::create_dir_all(destination.parent().unwrap()).unwrap();
    fs::write(destination, bytes).unwrap();
}

fn asset_record_batch(
    before: &project_io::ProjectSnapshot,
    previous: Option<&AssetRecord>,
    next: Option<&AssetRecord>,
) -> CommitBatch {
    let mut after = before.clone();
    after.sequence += 1;
    after.assets = next.into_iter().cloned().collect();
    let change = json!({
        "id": previous.or(next).unwrap().id,
        "before": previous.map(|asset| serde_json::to_value(asset).unwrap()),
        "after": next.map(|asset| serde_json::to_value(asset).unwrap()),
        "index": 0
    });
    let inverse = json!({
        "id": previous.or(next).unwrap().id,
        "before": next.map(|asset| serde_json::to_value(asset).unwrap()),
        "after": previous.map(|asset| serde_json::to_value(asset).unwrap()),
        "index": 0
    });
    CommitBatch {
        before: before.clone(),
        after,
        journal: vec![JournalOperation {
            sequence: before.sequence + 1,
            transaction_id: Uuid::new_v4().to_string(),
            command_type: "snapshot.records.patch".into(),
            payload: json!({ "collection": "assets", "changes": [change] }),
            inverse_payload: json!({ "collection": "assets", "changes": [inverse] }),
            action: JournalAction::Apply,
            timestamp: "2026-07-28T00:00:00Z".into(),
        }],
    }
}

struct BlockingProgressSink {
    ready: Mutex<Option<mpsc::Sender<()>>>,
    release: Mutex<mpsc::Receiver<()>>,
    blocked: AtomicBool,
}

impl ProgressSink for BlockingProgressSink {
    fn send(&self, _progress: ImportProgressDto) -> Result<(), HostError> {
        if !self.blocked.swap(true, Ordering::SeqCst) {
            self.ready.lock().unwrap().take().unwrap().send(()).unwrap();
            self.release.lock().unwrap().recv().unwrap();
        }
        Ok(())
    }
}
#[test]
fn poisoned_session_registry_returns_a_safe_error_instead_of_panicking() {
    let service = AppService::default();
    let _ = catch_unwind(AssertUnwindSafe(|| {
        let _guard = service.sessions.lock().unwrap();
        panic!("poison session registry");
    }));

    let error = service.session_count().unwrap_err();
    assert_eq!(error.code, "HOST_STATE_UNAVAILABLE");
}

#[test]
fn blocked_or_poisoned_session_does_not_block_registry_or_another_session() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let first = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "First".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let second = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Second".into(),
            profile: "market".into(),
        })
        .unwrap();
    let first_id = validate_session_id(&first.session_id).unwrap();
    let first_session = service.lookup_session(first_id).unwrap();

    let guard = first_session.lock().unwrap();
    assert_eq!(service.session_count().unwrap(), 2);
    service.checkpoint_project(&second.session_id).unwrap();
    drop(guard);

    let _ = catch_unwind(AssertUnwindSafe(|| {
        let _guard = first_session.lock().unwrap();
        panic!("poison one project session");
    }));
    let unavailable = service.checkpoint_project(&first.session_id).unwrap_err();
    assert_eq!(unavailable.code, "SESSION_STATE_UNAVAILABLE");
    assert_eq!(service.session_count().unwrap(), 2);
    service.checkpoint_project(&second.session_id).unwrap();
    service.close_project(&second.session_id).unwrap();

    first_session
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .close()
        .unwrap();
}

#[test]
fn stale_close_completion_cannot_remove_a_replacement_session() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let first = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Original".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let second = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Replacement".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let first_id = validate_session_id(&first.session_id).unwrap();
    let second_id = validate_session_id(&second.session_id).unwrap();
    let original = service.lookup_session(first_id).unwrap();
    let replacement = service.lookup_session(second_id).unwrap();
    {
        let mut sessions = service.sessions.lock().unwrap();
        sessions.remove(&first_id);
        sessions.remove(&second_id);
        sessions.insert(first_id, replacement.clone());
    }

    assert!(!service.remove_if_same(first_id, &original).unwrap());
    let still_tracked = service.lookup_session(first_id).unwrap();
    assert!(Arc::ptr_eq(&still_tracked, &replacement));

    original.lock().unwrap().close().unwrap();
    replacement.lock().unwrap().close().unwrap();
    service.sessions.lock().unwrap().clear();
}

#[test]
fn created_project_open_failure_is_explicit_and_keeps_durable_project() {
    let root = tempdir().unwrap();
    let created = create_project(CreateProjectRequest {
        parent: root.path().to_owned(),
        name: "Durable".into(),
        profile: ProjectProfile::Market,
    })
    .unwrap();
    let project_path = created.project_path.clone();

    let error = finalize_created_session(&created, Err(ProjectIoError::ProjectLocked)).unwrap_err();
    let HostError::ProjectCreatedSessionUnavailable {
        project_id,
        name,
        profile,
        reason_code,
    } = &error
    else {
        panic!("unexpected host error");
    };
    assert_eq!(*project_id, created.manifest.project_id);
    assert_eq!(name, "Durable");
    assert_eq!(*profile, ProjectProfile::Market);
    assert_eq!(*reason_code, "PROJECT_LOCKED");

    let native = AppService::default().render_error("create_project", error);
    assert_eq!(native.code, "PROJECT_CREATED_SESSION_UNAVAILABLE");
    assert_eq!(
        native.details,
        json!({
            "projectId": created.manifest.project_id,
            "name": "Durable",
            "profile": "market",
            "reasonCode": "PROJECT_LOCKED"
        })
    );
    assert!(
        !serde_json::to_string(&native)
            .unwrap()
            .contains(&project_path.to_string_lossy().to_string())
    );
    assert!(project_path.exists());

    let mut session =
        finalize_created_session(&created, open_session(&project_path, false)).unwrap();
    session.close().unwrap();
}

#[test]
fn post_open_registry_publication_failure_is_partial_success_and_closes_session() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let _ = catch_unwind(AssertUnwindSafe(|| {
        let _guard = service.sessions.lock().unwrap();
        panic!("poison registry before post-create publication");
    }));
    let request = CreateProjectDto {
        parent: root.path().to_string_lossy().into_owned(),
        name: "Publish Failure".into(),
        profile: "showroom".into(),
    };
    let project_path = root.path().join("Publish Failure.twinproj");

    let error = service.create_project(request.clone()).unwrap_err();
    assert_eq!(error.code, "PROJECT_CREATED_SESSION_UNAVAILABLE");
    assert!(project_path.exists());
    assert!(
        !serde_json::to_string(&error)
            .unwrap()
            .contains(&project_path.to_string_lossy().to_string())
    );

    let mut reopened = open_session(&project_path, false).unwrap();
    assert_eq!(
        error.details,
        json!({
            "projectId": reopened.manifest().project_id,
            "name": "Publish Failure",
            "profile": "showroom",
            "reasonCode": "HOST_STATE_UNAVAILABLE"
        })
    );
    reopened.close().unwrap();

    let retry = AppService::default().create_project(request).unwrap_err();
    assert_eq!(retry.code, "PROJECT_ALREADY_EXISTS");
    assert!(project_path.exists());
}

#[test]
fn failed_publication_cleanup_requires_confirmed_recovery() {
    let root = tempdir().unwrap();
    let created = create_project(CreateProjectRequest {
        parent: root.path().to_owned(),
        name: "Cleanup Failure".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let project_path = created.project_path.clone();
    let session = open_session(&project_path, false).unwrap();
    let database = Connection::open(project_path.join("project.db")).unwrap();
    let secret = "publication cleanup SQL must stay private";
    database
        .execute_batch(&format!(
            "CREATE TRIGGER fail_publication_cleanup BEFORE INSERT ON snapshots \
             BEGIN SELECT RAISE(ABORT, '{secret}'); END;"
        ))
        .unwrap();

    let service = AppService::default();
    let _ = catch_unwind(AssertUnwindSafe(|| {
        let _guard = service.sessions.lock().unwrap();
        panic!("force publication failure after session open");
    }));
    let publication = service.track_session(session);
    let host_error = finalize_created_publication(&created, publication).unwrap_err();
    let error = service.render_error("create_project", host_error);

    assert_eq!(error.code, "PROJECT_CREATED_SESSION_UNAVAILABLE");
    assert_eq!(
        error.details,
        json!({
            "projectId": created.manifest.project_id,
            "name": "Cleanup Failure",
            "profile": "showroom",
            "reasonCode": "SESSION_RECOVERY_REQUIRED"
        })
    );
    assert!(error.message.contains("确认恢复"));
    let serialized = serde_json::to_string(&error).unwrap();
    assert!(!serialized.contains(&project_path.to_string_lossy().to_string()));
    assert!(!serialized.contains(secret));

    let normal_open = open_session(&project_path, false).unwrap_err();
    assert!(matches!(normal_open, ProjectIoError::StaleProjectLock));
    database
        .execute_batch("DROP TRIGGER fail_publication_cleanup;")
        .unwrap();
    drop(database);
    let mut recovered = open_session(&project_path, true).unwrap();
    assert_eq!(recovered.save_state(), project_io::SaveState::Recovered);
    recovered.close().unwrap();
}

#[test]
fn close_all_checkpoints_multiple_sessions_releases_locks_and_is_idempotent() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let first = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Close All First".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let second = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Close All Second".into(),
            profile: "market".into(),
        })
        .unwrap();
    service
        .commit_project(
            &first.session_id,
            rename_batch(&first.snapshot, "First Saved"),
        )
        .unwrap();
    service
        .commit_project(
            &second.session_id,
            rename_batch(&second.snapshot, "Second Saved"),
        )
        .unwrap();

    service.close_all().unwrap();
    assert_eq!(service.session_count().unwrap(), 0);
    assert!(
        !std::path::Path::new(&first.project_path)
            .join(".aethertwin.lock")
            .exists()
    );
    assert!(
        !std::path::Path::new(&second.project_path)
            .join(".aethertwin.lock")
            .exists()
    );
    service.close_all().unwrap();

    for (path, expected_name) in [
        (&first.project_path, "First Saved"),
        (&second.project_path, "Second Saved"),
    ] {
        let mut reopened = open_session(std::path::Path::new(path), false).unwrap();
        assert_eq!(reopened.snapshot().project.name, expected_name);
        assert_eq!(
            reopened.snapshot().checkpoint_sequence,
            reopened.snapshot().sequence
        );
        reopened.close().unwrap();
    }
}

#[test]
fn close_all_waits_for_inflight_session_publication_and_returns_empty() {
    let root = tempdir().unwrap();
    let created = create_project(CreateProjectRequest {
        parent: root.path().to_owned(),
        name: "Close Publication Race".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let late = create_project(CreateProjectRequest {
        parent: root.path().to_owned(),
        name: "Close Publication Late".into(),
        profile: ProjectProfile::Market,
    })
    .unwrap();
    let project_path = created.project_path.clone();
    let session = open_session(&project_path, false).unwrap();
    let service = Arc::new(AppService::default());
    let publish_barrier = Arc::new(Barrier::new(2));
    let (lease_ready_tx, lease_ready_rx) = mpsc::channel();

    let publishing_service = service.clone();
    let publishing_barrier = publish_barrier.clone();
    let publisher = thread::spawn(move || {
        let _lease = publishing_service.session_operation_lease().unwrap();
        lease_ready_tx.send(()).unwrap();
        publishing_barrier.wait();
        publishing_service.track_session(session)
    });
    lease_ready_rx.recv().unwrap();

    let closing_service = service.clone();
    let (close_started_tx, close_started_rx) = mpsc::channel();
    let closer = thread::spawn(move || {
        close_started_tx.send(()).unwrap();
        closing_service.close_all()
    });
    close_started_rx.recv().unwrap();
    assert!(!closer.is_finished());

    publish_barrier.wait();
    let published = publisher.join().unwrap().unwrap();
    closer.join().unwrap().unwrap();

    assert_eq!(service.session_count().unwrap(), 0);
    assert!(
        !project_path.join(".aethertwin.lock").exists(),
        "close_all must close the session published by the in-flight operation: {}",
        published.session_id
    );
    let mut reopened = open_session(&project_path, false).unwrap();
    reopened.close().unwrap();

    let rejected = service
        .open_project(OpenProjectDto {
            path: late.project_path.to_string_lossy().into_owned(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    assert_eq!(rejected.code, "HOST_STATE_UNAVAILABLE");
    assert_eq!(service.session_count().unwrap(), 0);
    assert!(!late.project_path.join(".aethertwin.lock").exists());
}

#[test]
fn close_all_removes_successes_and_retries_only_remaining_sessions() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let failing = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Close All Failing".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let successful = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Close All Successful".into(),
            profile: "market".into(),
        })
        .unwrap();
    let database =
        Connection::open(std::path::Path::new(&failing.project_path).join("project.db")).unwrap();
    database
        .execute_batch(
            "CREATE TRIGGER fail_close_all BEFORE INSERT ON snapshots \
             BEGIN SELECT RAISE(ABORT, 'close all failure'); END;",
        )
        .unwrap();

    let error = service.close_all().unwrap_err();
    assert_eq!(error.code, "DATABASE_ERROR");
    assert_eq!(service.session_count().unwrap(), 1);
    assert!(
        std::path::Path::new(&failing.project_path)
            .join(".aethertwin.lock")
            .exists()
    );
    assert!(
        !std::path::Path::new(&successful.project_path)
            .join(".aethertwin.lock")
            .exists()
    );
    let published_after_failure = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Close All Retry Publication".into(),
            profile: "market".into(),
        })
        .unwrap();
    assert_eq!(service.session_count().unwrap(), 2);

    database
        .execute_batch("DROP TRIGGER fail_close_all;")
        .unwrap();
    drop(database);
    service.close_all().unwrap();
    assert_eq!(service.session_count().unwrap(), 0);
    assert!(
        !std::path::Path::new(&published_after_failure.project_path)
            .join(".aethertwin.lock")
            .exists()
    );
    service.close_all().unwrap();
}

#[test]
fn asset_import_registry_binds_owner_rejects_duplicates_and_rejects_cross_session_cancel() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let first = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Import Owner".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let second = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Other Session".into(),
            profile: "market".into(),
        })
        .unwrap();
    let source = root.path().join("owner.png");
    std::fs::write(&source, b"not-read-during-registration").unwrap();
    let operation_id = Uuid::new_v4();
    let request = || ImportProjectAssetDto {
        session_id: first.session_id.clone(),
        operation_id: operation_id.to_string(),
        role: "plan-reference".into(),
        source_path: source.to_string_lossy().into_owned(),
    };

    let prepared = service.prepare_asset_import(request()).unwrap();
    assert_eq!(
        prepared.session_id(),
        validate_session_id(&first.session_id).unwrap()
    );
    assert_eq!(prepared.operation_id(), operation_id);
    assert_eq!(service.active_asset_import_count().unwrap(), 1);

    let duplicate = service.prepare_asset_import(request()).unwrap_err();
    assert_eq!(host_error_code(&duplicate), "ASSET_IMPORT_OPERATION_EXISTS");
    let wrong_owner = service
        .cancel_asset_import(CancelProjectAssetImportDto {
            session_id: second.session_id.clone(),
            operation_id: operation_id.to_string(),
        })
        .unwrap_err();
    assert_eq!(
        host_error_code(&wrong_owner),
        "ASSET_IMPORT_OPERATION_NOT_FOUND"
    );
    assert!(!prepared.cancellation().load(Ordering::Acquire));

    service
        .cancel_asset_import(CancelProjectAssetImportDto {
            session_id: first.session_id.clone(),
            operation_id: operation_id.to_string(),
        })
        .unwrap();
    assert!(prepared.cancellation().load(Ordering::Acquire));
    assert!(
        service
            .finish_asset_import(operation_id, &prepared.cancellation())
            .unwrap()
    );
    assert_eq!(service.active_asset_import_count().unwrap(), 0);
    assert!(
        !service
            .finish_asset_import(operation_id, &prepared.cancellation())
            .unwrap()
    );
    service.close_all().unwrap();
}

#[test]
fn progress_tracker_rejects_wrong_operation_and_non_monotonic_progress() {
    let operation_id = Uuid::new_v4();
    let mut tracker = ProgressTracker::new(operation_id);
    let first = tracker
        .accept(ImportProgress {
            operation_id,
            stage: ImportStage::Capture,
            completed_bytes: 0,
            total_bytes: 10,
        })
        .unwrap();
    assert_eq!(first.operation_id, operation_id.to_string());

    let mismatch = tracker
        .accept(ImportProgress {
            operation_id: Uuid::new_v4(),
            stage: ImportStage::Validate,
            completed_bytes: 0,
            total_bytes: 10,
        })
        .unwrap_err();
    assert_eq!(
        host_error_code(&mismatch),
        "ASSET_PROGRESS_OPERATION_MISMATCH"
    );

    let backwards = tracker
        .accept(ImportProgress {
            operation_id,
            stage: ImportStage::Capture,
            completed_bytes: 0,
            total_bytes: 9,
        })
        .unwrap_err();
    assert_eq!(host_error_code(&backwards), "ASSET_PROGRESS_NOT_MONOTONIC");
}
#[test]
fn cancel_and_complete_race_has_one_terminal_registry_cleanup() {
    let root = tempdir().unwrap();
    let service = Arc::new(AppService::default());
    let project = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Import Race".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let source = root.path().join("race.png");
    std::fs::write(&source, png(1, 1)).unwrap();
    let operation_id = Uuid::new_v4();
    let prepared = service
        .prepare_asset_import(ImportProjectAssetDto {
            session_id: project.session_id.clone(),
            operation_id: operation_id.to_string(),
            role: "plan-reference".into(),
            source_path: source.to_string_lossy().into_owned(),
        })
        .unwrap();
    let cancellation = prepared.cancellation();
    let barrier = Arc::new(Barrier::new(3));

    let finish_service = Arc::clone(&service);
    let finish_barrier = Arc::clone(&barrier);
    let finish_cancellation = Arc::clone(&cancellation);
    let finish = thread::spawn(move || {
        finish_barrier.wait();
        finish_service
            .finish_asset_import(operation_id, &finish_cancellation)
            .unwrap()
    });

    let cancel_service = Arc::clone(&service);
    let cancel_barrier = Arc::clone(&barrier);
    let cancel_session_id = project.session_id.clone();
    let cancel = thread::spawn(move || {
        cancel_barrier.wait();
        cancel_service.cancel_asset_import(CancelProjectAssetImportDto {
            session_id: cancel_session_id,
            operation_id: operation_id.to_string(),
        })
    });

    barrier.wait();
    assert!(finish.join().unwrap());
    if let Err(error) = cancel.join().unwrap() {
        assert_eq!(host_error_code(&error), "ASSET_IMPORT_OPERATION_NOT_FOUND");
    }
    assert_eq!(service.active_asset_import_count().unwrap(), 0);
    assert!(
        !service
            .finish_asset_import(operation_id, &cancellation)
            .unwrap()
    );
    service.close_all().unwrap();
}

#[test]
fn close_project_waits_for_the_session_locked_asset_import() {
    let root = tempdir().unwrap();
    let service = Arc::new(AppService::default());
    let project = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Close Waits".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let source = root.path().join("blocking.png");
    std::fs::write(&source, png(3, 2)).unwrap();
    let operation_id = Uuid::new_v4();
    let prepared = service
        .prepare_asset_import(ImportProjectAssetDto {
            session_id: project.session_id.clone(),
            operation_id: operation_id.to_string(),
            role: "plan-reference".into(),
            source_path: source.to_string_lossy().into_owned(),
        })
        .unwrap();
    let cancellation = prepared.cancellation();
    let (ready_tx, ready_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let sink = Arc::new(BlockingProgressSink {
        ready: Mutex::new(Some(ready_tx)),
        release: Mutex::new(release_rx),
        blocked: AtomicBool::new(false),
    });

    let import_service = Arc::clone(&service);
    let import_sink = Arc::clone(&sink);
    let import = thread::spawn(move || {
        let result = prepared.run(import_sink.as_ref());
        let finished = import_service
            .finish_asset_import(operation_id, &cancellation)
            .unwrap();
        (result, finished)
    });
    ready_rx.recv().unwrap();

    let close_service = Arc::clone(&service);
    let close_session_id = project.session_id.clone();
    let (close_started_tx, close_started_rx) = mpsc::channel();
    let (close_finished_tx, close_finished_rx) = mpsc::channel();
    let close = thread::spawn(move || {
        close_started_tx.send(()).unwrap();
        close_finished_tx
            .send(close_service.close_project(&close_session_id))
            .unwrap();
    });
    close_started_rx.recv().unwrap();
    assert!(matches!(
        close_finished_rx.recv_timeout(Duration::from_millis(50)),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    release_tx.send(()).unwrap();
    let (result, finished) = import.join().unwrap();
    assert!(finished);
    let result = serde_json::to_value(result.unwrap()).unwrap();
    assert_eq!(
        result["facts"],
        json!({ "kind": "image", "width": 3, "height": 2 })
    );
    close_finished_rx.recv().unwrap().unwrap();
    close.join().unwrap();
    assert_eq!(service.session_count().unwrap(), 0);
}

#[test]
fn open_preflights_degraded_assets_but_defers_digest_verification_until_resolve() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let opened = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Asset Preflight".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let missing = verified_asset(b"missing");
    let add_missing = asset_record_batch(&opened.snapshot, None, Some(&missing));
    service
        .commit_project(&opened.session_id, add_missing.clone())
        .unwrap();
    service.close_project(&opened.session_id).unwrap();

    let reopened = service
        .open_project(OpenProjectDto {
            path: opened.project_path.clone(),
            recover_stale_lock: false,
        })
        .unwrap();
    assert_eq!(reopened.asset_issues.len(), 1);
    assert_eq!(reopened.asset_issues[0].asset_id, missing.id);
    assert_eq!(reopened.asset_issues[0].issue, AssetIssue::Missing.code());

    let mut corrupt = verified_asset(b"good");
    corrupt.id = missing.id;
    publish_asset(&opened.project_path, &corrupt, b"evil");
    let replace = asset_record_batch(&reopened.snapshot, Some(&missing), Some(&corrupt));
    service
        .commit_project(&reopened.session_id, replace)
        .unwrap();
    assert!(
        service
            .asset_issues(&reopened.session_id)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        service
            .resolve_asset(&reopened.session_id, corrupt.id)
            .unwrap_err(),
        AssetIssue::DigestMismatch
    );
    service.close_project(&reopened.session_id).unwrap();
}

#[test]
fn commit_and_close_invalidate_verified_asset_handles() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let opened = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Asset Lifecycle".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    let bytes = b"lifecycle";
    let asset = verified_asset(bytes);
    publish_asset(&opened.project_path, &asset, bytes);
    let add = asset_record_batch(&opened.snapshot, None, Some(&asset));
    service
        .commit_project(&opened.session_id, add.clone())
        .unwrap();

    let first = service.resolve_asset(&opened.session_id, asset.id).unwrap();
    let reused = service.resolve_asset(&opened.session_id, asset.id).unwrap();
    assert!(Arc::ptr_eq(&first, &reused));
    assert_eq!(service.cached_asset_count(&opened.session_id).unwrap(), 1);

    let remove = asset_record_batch(&add.after, Some(&asset), None);
    service
        .commit_project(&opened.session_id, remove.clone())
        .unwrap();
    assert_eq!(service.cached_asset_count(&opened.session_id).unwrap(), 0);
    drop(reused);
    drop(first);

    let add_again = asset_record_batch(&remove.after, None, Some(&asset));
    service
        .commit_project(&opened.session_id, add_again)
        .unwrap();
    let final_handle = service.resolve_asset(&opened.session_id, asset.id).unwrap();
    assert_eq!(service.cached_asset_count(&opened.session_id).unwrap(), 1);
    drop(final_handle);
    service.close_project(&opened.session_id).unwrap();
    assert_eq!(service.cached_asset_count(&opened.session_id).unwrap(), 0);
}
