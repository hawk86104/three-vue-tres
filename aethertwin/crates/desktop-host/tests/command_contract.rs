use desktop_host::{
    AppService, CreateProjectDto, NativeLogSink, OpenProjectDto, RecoverProjectDto,
    SanitizedLogRecord, with_invoke_handler,
};
use project_io::{CommitBatch, JournalOperation, ProjectProfile, ProjectSnapshot};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tempfile::{TempDir, tempdir};
use uuid::Uuid;

#[derive(Default)]
struct CapturingLogSink {
    records: Mutex<Vec<SanitizedLogRecord>>,
}

impl NativeLogSink for CapturingLogSink {
    fn record(&self, record: &SanitizedLogRecord) {
        self.records.lock().unwrap().push(record.clone());
    }
}

fn invoke(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    command: &str,
    body: Value,
) -> Result<Value, Value> {
    tauri::test::get_ipc_response(
        webview,
        tauri::webview::InvokeRequest {
            cmd: command.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: if cfg!(any(windows, target_os = "android")) {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            }
            .parse()
            .unwrap(),
            body: tauri::ipc::InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

fn assert_invalid_ipc(error: &Value) {
    let object = error.as_object().unwrap();
    assert_eq!(
        object.keys().map(String::as_str).collect::<Vec<_>>(),
        vec!["code", "details", "logRef", "message"]
    );
    assert_eq!(error["code"], "IPC_INVALID_REQUEST");
    assert_eq!(error["details"], json!({ "retryable": false }));
    assert!(
        error["logRef"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
    );
    assert!(
        error["message"]
            .as_str()
            .unwrap()
            .chars()
            .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    );
}

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
    let checkpoint = service.checkpoint_project(&created.session_id).unwrap();
    assert_eq!(checkpoint.manifest.name, "Renamed");
    assert_eq!(checkpoint.snapshot.sequence, 1);
    assert_eq!(checkpoint.snapshot.checkpoint_sequence, 1);
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
    assert_eq!(profile.code, "IPC_INVALID_REQUEST");
    assert_eq!(service.session_count().unwrap(), 0);
    assert!(!root.path().join("Invalid Profile.twinproj").exists());

    let path = service
        .open_project(OpenProjectDto {
            path: "relative/project.twinproj".into(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    assert_eq!(path.code, "IPC_INVALID_REQUEST");

    let malformed = service.close_project("not-a-session").unwrap_err();
    assert_eq!(malformed.code, "IPC_INVALID_REQUEST");
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
fn missing_and_corrupt_projects_have_distinct_safe_native_errors_without_sessions() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let missing = root.path().join("Missing.twinproj");
    assert!(!missing.exists());

    let missing_error = service
        .open_project(OpenProjectDto {
            path: missing.to_string_lossy().into_owned(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    assert_eq!(missing_error.code, "PROJECT_NOT_FOUND");
    assert_eq!(
        missing_error.details,
        json!({ "recoveryRequired": false, "retryable": false })
    );
    assert!(!missing_error.message.is_empty());
    assert!(!missing_error.log_ref.is_empty());
    let missing_serialized = serde_json::to_string(&missing_error).unwrap();
    assert!(!missing_serialized.contains(&missing.to_string_lossy().to_string()));
    assert_eq!(service.session_count().unwrap(), 0);

    let corrupt = root.path().join("Corrupt.twinproj");
    std::fs::create_dir(&corrupt).unwrap();
    let corrupt_error = service
        .open_project(OpenProjectDto {
            path: corrupt.to_string_lossy().into_owned(),
            recover_stale_lock: false,
        })
        .unwrap_err();
    assert_eq!(corrupt_error.code, "INVALID_PROJECT_STRUCTURE");
    assert_eq!(
        corrupt_error.details,
        json!({ "recoveryRequired": false, "retryable": false })
    );
    assert!(!corrupt_error.message.is_empty());
    assert!(!corrupt_error.log_ref.is_empty());
    let corrupt_serialized = serde_json::to_string(&corrupt_error).unwrap();
    assert!(!corrupt_serialized.contains(&corrupt.to_string_lossy().to_string()));
    assert_eq!(service.session_count().unwrap(), 0);
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
    assert_eq!(commands.matches("payload: Option<Value>").count(), 6);
    assert!(!commands.contains("batch: CommitBatch"));

    let main = include_str!("../src/main.rs");
    let single_instance = main.find("tauri_plugin_single_instance::init").unwrap();
    let dialog = main.find("tauri_plugin_dialog::init").unwrap();
    assert!(single_instance < dialog);
    assert!(main.contains("|app, _args, _cwd|"));
    assert!(!main.contains("std::env::args"));
    for required in [
        "WindowEvent::CloseRequested",
        "RunEvent::ExitRequested",
        "prevent_close",
        "prevent_exit",
        "close_all",
        "dialog()",
        "日志参考",
    ] {
        assert!(
            main.contains(required),
            "missing close lifecycle contract: {required}"
        );
    }
}

#[test]
fn real_tauri_invoke_handler_wraps_missing_payload_for_all_six_commands() {
    let sink = Arc::new(CapturingLogSink::default());
    let app = with_invoke_handler(
        tauri::test::mock_builder().manage(AppService::with_log_sink(sink.clone())),
    )
    .build(tauri::test::mock_context(tauri::test::noop_assets()))
    .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    let commands = [
        "create_project",
        "open_project",
        "commit_project",
        "checkpoint_project",
        "close_project",
        "recover_project",
    ];
    let mut returned_log_refs = Vec::new();
    for command in commands {
        let error = invoke(&webview, command, json!({})).unwrap_err();
        assert_invalid_ipc(&error);
        returned_log_refs.push(error["logRef"].as_str().unwrap().to_owned());
    }

    let records = sink.records.lock().unwrap();
    assert_eq!(records.len(), commands.len());
    for ((record, operation), returned_log_ref) in
        records.iter().zip(commands).zip(returned_log_refs)
    {
        assert_eq!(record.operation, operation);
        assert_eq!(record.code, "IPC_INVALID_REQUEST");
        assert_eq!(record.log_ref, returned_log_ref);
        let value = serde_json::to_value(record).unwrap();
        assert_eq!(
            value
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["code", "logRef", "operation"]
        );
        assert!(!value.to_string().contains("path"));
    }
}

#[test]
fn real_tauri_invoke_handler_rejects_wrong_unknown_and_invalid_nested_values() {
    let root = tempdir().unwrap();
    let app = with_invoke_handler(tauri::test::mock_builder().manage(AppService::default()))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    for (command, body) in [
        ("close_project", json!({ "payload": { "sessionId": 7 } })),
        (
            "close_project",
            json!({ "payload": { "sessionId": Uuid::new_v4(), "extra": true } }),
        ),
        (
            "create_project",
            json!({ "payload": { "parent": "relative", "name": "Demo", "profile": "showroom" } }),
        ),
        (
            "create_project",
            json!({ "payload": { "parent": root.path(), "name": "Demo", "profile": "visitor" } }),
        ),
    ] {
        assert_invalid_ipc(&invoke(&webview, command, body).unwrap_err());
    }

    let opened = invoke(
        &webview,
        "create_project",
        json!({
            "payload": {
                "parent": root.path(),
                "name": "Nested Contract",
                "profile": "showroom"
            }
        }),
    )
    .unwrap();
    let opened: desktop_host::OpenedProjectDto = serde_json::from_value(opened).unwrap();

    assert_invalid_ipc(
        &invoke(
            &webview,
            "checkpoint_project",
            json!({ "payload": { "sessionId": opened.session_id.clone() } }),
        )
        .unwrap_err(),
    );
    let mut unrelated = opened.snapshot.clone();
    unrelated.project.id = Uuid::new_v4();
    let rejected = invoke(
        &webview,
        "checkpoint_project",
        json!({
            "payload": {
                "sessionId": opened.session_id.clone(),
                "snapshot": unrelated
            }
        }),
    )
    .unwrap_err();
    assert_eq!(rejected["code"], "DATABASE_ERROR");
    let checkpoint = invoke(
        &webview,
        "checkpoint_project",
        json!({
            "payload": {
                "sessionId": opened.session_id.clone(),
                "snapshot": opened.snapshot.clone()
            }
        }),
    )
    .unwrap();
    assert_eq!(checkpoint["snapshot"]["schemaVersion"], 2);

    let next = renamed(opened.snapshot.clone(), "Never Applied", 1);
    let batch = rename_batch(&opened.snapshot, &next);

    let mut unknown_nested = serde_json::to_value(&batch).unwrap();
    unknown_nested["before"]["project"]["unexpected"] = json!(true);
    let mut noncanonical_uuid = serde_json::to_value(&batch).unwrap();
    noncanonical_uuid["before"]["project"]["id"] = json!("550E8400-E29B-41D4-A716-446655440000");
    let mut invalid_sequence = serde_json::to_value(&batch).unwrap();
    invalid_sequence["journal"][0]["sequence"] = json!(2);
    let mut invalid_journal = serde_json::to_value(&batch).unwrap();
    invalid_journal["journal"][0]["transactionId"] = json!("not-a-canonical-uuid");
    let mut missing_nested = serde_json::to_value(&batch).unwrap();
    missing_nested["before"]["project"]
        .as_object_mut()
        .unwrap()
        .remove("tags");

    for batch in [
        unknown_nested,
        noncanonical_uuid,
        invalid_sequence,
        invalid_journal,
        missing_nested,
    ] {
        let error = invoke(
            &webview,
            "commit_project",
            json!({
                "payload": {
                    "sessionId": opened.session_id,
                    "batch": batch
                }
            }),
        )
        .unwrap_err();
        assert_invalid_ipc(&error);
    }

    invoke(
        &webview,
        "close_project",
        json!({ "payload": { "sessionId": opened.session_id } }),
    )
    .unwrap();
}

#[test]
fn build_overlay_uses_checked_utf8_and_structured_json_on_every_platform() {
    let build = include_str!("../build.rs");
    assert!(build.contains("path.to_str()"));
    assert!(build.contains("serde_json::json!"));
    assert!(!build.contains("to_string_lossy"));
    assert!(!build.contains("TAURI_CONFIG={\\\"bundle\\\""));
}
