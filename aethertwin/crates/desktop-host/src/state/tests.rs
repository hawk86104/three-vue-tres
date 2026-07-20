use super::{
    AppService, finalize_created_publication, finalize_created_session, validate_session_id,
};
use crate::{CreateProjectDto, OpenProjectDto, error::HostError};
use project_io::{
    CommitBatch, CreateProjectRequest, JournalOperation, ProjectIoError, ProjectProfile,
    create_project, open_session,
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{Arc, Barrier, mpsc},
    thread,
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
