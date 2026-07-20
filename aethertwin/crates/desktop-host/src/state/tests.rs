use super::{AppService, finalize_created_session, validate_session_id};
use crate::{CreateProjectDto, error::HostError};
use project_io::{
    CreateProjectRequest, ProjectIoError, ProjectProfile, create_project, open_session,
};
use serde_json::json;
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    sync::Arc,
};
use tempfile::tempdir;

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
