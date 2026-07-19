use desktop_host::{
    AppService, CreateProjectDto, NativeErrorDto, OpenProjectDto, RecoverProjectDto,
};
use project_io::{CommitBatch, JournalOperation, ProjectProfile, ProjectSnapshot};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::path::Path;
use tempfile::{TempDir, tempdir};
use uuid::Uuid;

fn create(service: &AppService, root: &TempDir, name: &str) -> desktop_host::OpenedProjectDto {
    service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: name.into(),
            profile: "showroom".into(),
        })
        .unwrap()
}

fn renamed(mut snapshot: ProjectSnapshot, name: &str, sequence: u64) -> ProjectSnapshot {
    snapshot.project.name = name.into();
    snapshot.sequence = sequence;
    snapshot
}

fn rename_batch(before: &ProjectSnapshot, after: &ProjectSnapshot) -> CommitBatch {
    let transaction_id = Uuid::new_v4().to_string();
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![JournalOperation::rename(
            after.sequence,
            &transaction_id,
            &before.project.name,
            &after.project.name,
        )],
    }
}

fn connection(opened: &desktop_host::OpenedProjectDto) -> Connection {
    Connection::open(Path::new(&opened.project_path).join("project.db")).unwrap()
}

#[test]
fn all_six_service_operations_follow_one_session_lifecycle() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create(&service, &root, "Demo");
    assert_eq!(created.manifest.profile, ProjectProfile::Showroom);
    assert!(!created.recovered);
    assert_eq!(service.session_count().unwrap(), 1);

    let next = renamed(created.snapshot.clone(), "Renamed", 1);
    service
        .commit_project(&created.session_id, rename_batch(&created.snapshot, &next))
        .unwrap();
    let manifest = service.checkpoint_project(&created.session_id).unwrap();
    assert_eq!(manifest.name, "Renamed");
    service.close_project(&created.session_id).unwrap();
    assert_eq!(service.session_count().unwrap(), 0);

    let opened = service
        .open_project(OpenProjectDto {
            path: created.project_path.clone(),
            recover_stale_lock: false,
        })
        .unwrap();
    assert_eq!(opened.snapshot.project.name, "Renamed");
    service.close_project(&opened.session_id).unwrap();
}

#[test]
fn invalid_profile_path_and_session_inputs_fail_before_native_work() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let profile = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Invalid Profile".into(),
            profile: "visitor".into(),
        })
        .unwrap_err();
    assert_eq!(profile.code, "INVALID_PROJECT_PROFILE");
    assert_eq!(service.session_count().unwrap(), 0);
    assert!(!root.path().join("Invalid Profile.twinproj").exists());

    let path = service
        .open_project(OpenProjectDto {
            path: "relative/project.twinproj".into(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    assert_eq!(path.code, "INVALID_PROJECT_PATH");

    let malformed = service.close_project("not-a-session").unwrap_err();
    assert_eq!(malformed.code, "INVALID_SESSION_ID");
    let missing = service
        .close_project(&Uuid::new_v4().to_string())
        .unwrap_err();
    assert_eq!(missing.code, "SESSION_NOT_FOUND");
}

#[test]
fn duplicate_open_is_rejected_without_publishing_another_session() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create(&service, &root, "Only Once");
    let error = service
        .open_project(OpenProjectDto {
            path: created.project_path.clone(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    assert_eq!(error.code, "PROJECT_LOCKED");
    assert_eq!(service.session_count().unwrap(), 1);
    service.close_project(&created.session_id).unwrap();
}

#[test]
fn commit_failure_retains_session_and_redacts_database_source() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let opened = create(&service, &root, "Commit Failure");
    let database = connection(&opened);
    let secret = "raw SQL source must stay private";
    database
        .execute_batch(&format!(
            "CREATE TRIGGER fail_host_commit BEFORE INSERT ON command_journal \
             BEGIN SELECT RAISE(ABORT, '{secret}'); END;"
        ))
        .unwrap();
    let next = renamed(opened.snapshot.clone(), "Never Published", 1);
    let error = service
        .commit_project(&opened.session_id, rename_batch(&opened.snapshot, &next))
        .unwrap_err();
    assert_eq!(error.code, "DATABASE_ERROR");
    assert_eq!(service.session_count().unwrap(), 1);
    let serialized = serde_json::to_string(&error).unwrap();
    assert!(!serialized.contains(secret));
    assert!(!serialized.contains(&opened.project_path));
    database
        .execute_batch("DROP TRIGGER fail_host_commit;")
        .unwrap();
    service.close_project(&opened.session_id).unwrap();
}

#[test]
fn checkpoint_failure_retains_session_for_retry() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let opened = create(&service, &root, "Checkpoint Failure");
    let database = connection(&opened);
    database
        .execute_batch(
            "CREATE TRIGGER fail_host_checkpoint BEFORE INSERT ON snapshots \
             BEGIN SELECT RAISE(ABORT, 'checkpoint secret'); END;",
        )
        .unwrap();
    let error = service.checkpoint_project(&opened.session_id).unwrap_err();
    assert_eq!(error.code, "DATABASE_ERROR");
    assert_eq!(service.session_count().unwrap(), 1);
    database
        .execute_batch("DROP TRIGGER fail_host_checkpoint;")
        .unwrap();
    service.checkpoint_project(&opened.session_id).unwrap();
    service.close_project(&opened.session_id).unwrap();
}

#[test]
fn close_failure_retains_session_for_retry() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let opened = create(&service, &root, "Close Failure");
    let database = connection(&opened);
    database
        .execute_batch(
            "CREATE TRIGGER fail_host_close BEFORE INSERT ON snapshots \
             BEGIN SELECT RAISE(ABORT, 'close secret'); END;",
        )
        .unwrap();
    let error = service.close_project(&opened.session_id).unwrap_err();
    assert_eq!(error.code, "DATABASE_ERROR");
    assert_eq!(service.session_count().unwrap(), 1);
    database
        .execute_batch("DROP TRIGGER fail_host_close;")
        .unwrap();
    service.close_project(&opened.session_id).unwrap();
    assert_eq!(service.session_count().unwrap(), 0);
}

#[test]
fn recovery_requires_confirmation_and_returns_a_tracked_recovered_session() {
    let root = tempdir().unwrap();
    let crashed_path = {
        let service = AppService::default();
        create(&service, &root, "Recover Me").project_path
    };
    let service = AppService::default();
    let refused = service
        .recover_project(RecoverProjectDto {
            path: crashed_path.clone(),
            confirm: false,
        })
        .unwrap_err();
    assert_eq!(refused.code, "STALE_PROJECT_LOCK");
    assert_eq!(service.session_count().unwrap(), 0);

    let recovered = service
        .recover_project(RecoverProjectDto {
            path: crashed_path,
            confirm: true,
        })
        .unwrap();
    assert!(recovered.recovered);
    assert_eq!(service.session_count().unwrap(), 1);
    service.close_project(&recovered.session_id).unwrap();
}

#[test]
fn native_errors_have_exact_safe_envelope_and_redact_absolute_paths() {
    let service = AppService::default();
    let distinctive = std::env::temp_dir().join("aethertwin-private-absolute-path.twinproj");
    let error = service
        .open_project(OpenProjectDto {
            path: distinctive.to_string_lossy().into_owned(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    let value = serde_json::to_value(&error).unwrap();
    let object = value.as_object().unwrap();
    assert_eq!(
        object.keys().map(String::as_str).collect::<Vec<_>>(),
        vec!["code", "details", "logRef", "message"]
    );
    assert!(
        !value
            .to_string()
            .contains(&distinctive.to_string_lossy().to_string())
    );
    assert!(
        error
            .message
            .chars()
            .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    );
    assert!(!error.log_ref.is_empty());
}

#[test]
fn every_project_io_code_has_a_safe_native_summary() {
    let errors = [
        project_io::ProjectIoError::InvalidProjectName,
        project_io::ProjectIoError::ProjectAlreadyExists,
        project_io::ProjectIoError::InvalidProjectStructure,
        project_io::ProjectIoError::UnsupportedSchemaVersion,
        project_io::ProjectIoError::ManifestDatabaseMismatch,
        project_io::ProjectIoError::DatabaseError,
        project_io::ProjectIoError::ProjectLocked,
        project_io::ProjectIoError::StaleProjectLock,
        project_io::ProjectIoError::InvalidResourcePath,
        project_io::ProjectIoError::RecoveryFailed,
        project_io::ProjectIoError::FilesystemError,
    ];
    for source in errors {
        let code = source.code();
        let native = NativeErrorDto::from(source);
        assert_eq!(native.code, code);
        assert!(!native.message.is_empty());
        assert!(!native.message.contains(':'));
        assert!(!native.log_ref.is_empty());
    }
}

#[test]
fn tauri_configuration_and_capability_are_exact_and_least_privilege() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert_eq!(config["productName"], "AetherTwin Studio");
    assert_eq!(config["identifier"], "cn.aethertwin.studio");
    assert_eq!(config["build"]["frontendDist"], "../../apps/studio/dist");
    assert_eq!(config["build"]["devUrl"], "http://localhost:5173");

    let capability: Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(
        capability["permissions"],
        json!(["core:window:default", "dialog:allow-open"])
    );
    let permissions = capability["permissions"].to_string().to_ascii_lowercase();
    for forbidden in ["shell", "fs:", "filesystem", "http", "sql"] {
        assert!(!permissions.contains(forbidden));
    }
}

#[test]
fn command_surface_is_exact_and_single_instance_ignores_arguments() {
    let commands = include_str!("../src/commands.rs");
    assert_eq!(commands.matches("#[tauri::command]").count(), 6);
    for command in [
        "create_project",
        "open_project",
        "commit_project",
        "checkpoint_project",
        "close_project",
        "recover_project",
    ] {
        assert_eq!(commands.matches(&format!("fn {command}(")).count(), 1);
    }
    for forbidden in ["rusqlite", "std::fs", "Command::new", "std::process"] {
        assert!(!commands.contains(forbidden));
    }

    let main = include_str!("../src/main.rs");
    let single_instance = main.find("tauri_plugin_single_instance::init").unwrap();
    let dialog = main.find("tauri_plugin_dialog::init").unwrap();
    assert!(single_instance < dialog);
    assert!(main.contains("|app, _args, _cwd|"));
    assert!(!main.contains("std::env::args"));
}
