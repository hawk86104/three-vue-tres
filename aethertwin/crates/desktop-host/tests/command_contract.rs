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
    assert_eq!(
        config["app"]["security"]["csp"],
        "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' aethertwin-asset: http://aethertwin-asset.localhost blob: data:; media-src 'self' aethertwin-asset: http://aethertwin-asset.localhost blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'"
    );
    assert!(config["app"]["security"].get("assetProtocol").is_none());

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
    assert_eq!(commands.matches("#[tauri::command]").count(), 8);
    for command in [
        "create_project",
        "open_project",
        "commit_project",
        "checkpoint_project",
        "close_project",
        "recover_project",
        "import_project_asset",
        "cancel_project_asset_import",
    ] {
        assert_eq!(commands.matches(&format!("fn {command}(")).count(), 1);
    }
    for forbidden in ["rusqlite", "std::fs", "Command::new", "std::process"] {
        assert!(!commands.contains(forbidden));
    }
    assert_eq!(commands.matches("payload: Option<Value>").count(), 8);
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
fn real_tauri_invoke_handler_wraps_missing_payload_for_all_eight_commands() {
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
        "import_project_asset",
        "cancel_project_asset_import",
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
    assert_eq!(checkpoint["snapshot"]["schemaVersion"], 3);

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
fn asset_import_invoke_dtos_are_exact_and_native_errors_redact_source_details() {
    let root = tempdir().unwrap();
    let sink = Arc::new(CapturingLogSink::default());
    let app = with_invoke_handler(
        tauri::test::mock_builder().manage(AppService::with_log_sink(sink.clone())),
    )
    .build(tauri::test::mock_context(tauri::test::noop_assets()))
    .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = invoke(
        &webview,
        "create_project",
        json!({
            "payload": {
                "parent": root.path(),
                "name": "Asset Invoke DTO",
                "profile": "showroom"
            }
        }),
    )
    .unwrap();
    let opened: desktop_host::OpenedProjectDto = serde_json::from_value(opened).unwrap();
    let operation_id = "30000000-0000-4000-8000-000000000001";
    let private_source = root.path().join("private-os-error-details");
    std::fs::create_dir(&private_source).unwrap();
    let source_path = private_source.to_string_lossy().into_owned();
    let valid_import = json!({
        "sessionId": opened.session_id,
        "operationId": operation_id,
        "role": "plan-reference",
        "sourcePath": source_path
    });

    let mut unknown_import = valid_import.clone();
    unknown_import["source"] = json!({ "kind": "native-path" });
    let mut snake_case_import = valid_import.clone();
    snake_case_import["operation_id"] = snake_case_import["operationId"].take();
    let mut invalid_role = valid_import.clone();
    invalid_role["role"] = json!("visitor");
    let mut relative_path = valid_import.clone();
    relative_path["sourcePath"] = json!("private/source.png");
    let mut trimmed_path = valid_import.clone();
    trimmed_path["sourcePath"] = json!(format!(" {} ", source_path));
    let mut missing_path = valid_import.clone();
    missing_path.as_object_mut().unwrap().remove("sourcePath");
    let mut noncanonical_operation = valid_import.clone();
    noncanonical_operation["operationId"] = json!("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA");
    let mut noncanonical_session = valid_import.clone();
    noncanonical_session["sessionId"] = json!("BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB");

    for payload in [
        unknown_import,
        snake_case_import,
        invalid_role,
        relative_path,
        trimmed_path,
        missing_path,
        noncanonical_operation,
        noncanonical_session,
    ] {
        assert_invalid_ipc(
            &invoke(
                &webview,
                "import_project_asset",
                json!({
                    "payload": payload,
                    "onProgress": "__CHANNEL__:1"
                }),
            )
            .unwrap_err(),
        );
    }

    let valid_cancel = json!({
        "sessionId": opened.session_id,
        "operationId": operation_id
    });
    let mut unknown_cancel = valid_cancel.clone();
    unknown_cancel["extra"] = json!(true);
    let mut snake_case_cancel = valid_cancel.clone();
    snake_case_cancel["session_id"] = snake_case_cancel["sessionId"].take();
    let mut noncanonical_cancel = valid_cancel.clone();
    noncanonical_cancel["operationId"] = json!("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA");
    let mut missing_cancel = valid_cancel.clone();
    missing_cancel
        .as_object_mut()
        .unwrap()
        .remove("operationId");
    for payload in [
        unknown_cancel,
        snake_case_cancel,
        noncanonical_cancel,
        missing_cancel,
    ] {
        assert_invalid_ipc(
            &invoke(
                &webview,
                "cancel_project_asset_import",
                json!({ "payload": payload }),
            )
            .unwrap_err(),
        );
    }

    let import_error = invoke(
        &webview,
        "import_project_asset",
        json!({
            "payload": valid_import,
            "onProgress": "__CHANNEL__:1"
        }),
    )
    .unwrap_err();
    assert_eq!(import_error["code"], "ASSET_SOURCE_NOT_REGULAR_FILE");
    assert_eq!(
        import_error
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["code", "details", "logRef", "message"]
    );
    let public_error = format!(
        "{} {} {} {}",
        import_error["code"],
        import_error["message"],
        import_error["details"],
        import_error["logRef"]
    );
    assert!(!public_error.contains(&source_path));
    assert!(!public_error.contains("private-os-error-details"));

    let cancel_error = invoke(
        &webview,
        "cancel_project_asset_import",
        json!({ "payload": valid_cancel }),
    )
    .unwrap_err();
    assert_eq!(cancel_error["code"], "ASSET_IMPORT_OPERATION_NOT_FOUND");

    let import_log_ref = import_error["logRef"].as_str().unwrap();
    let records = sink.records.lock().unwrap();
    let import_record = records
        .iter()
        .find(|record| record.log_ref == import_log_ref)
        .unwrap();
    assert_eq!(import_record.operation, "import_project_asset");
    assert_eq!(import_record.code, "ASSET_SOURCE_NOT_REGULAR_FILE");
    let serialized_record = serde_json::to_string(import_record).unwrap();
    assert!(!serialized_record.contains(&source_path));
    assert!(!serialized_record.contains("private-os-error-details"));
    assert!(!serialized_record.to_ascii_lowercase().contains("path"));
    drop(records);

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
fn plan_fixture(snapshot: &ProjectSnapshot, id: &str, name: &str) -> Value {
    let floor = &snapshot.project.floors[0];
    json!({
        "type": "fixture",
        "id": id,
        "name": name,
        "tags": [],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "locked": false,
        "transform": {
            "translation": { "x": 0, "y": 0 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "kind": "generic",
        "size": { "width": 1000, "height": 500 }
    })
}

fn plan_batch(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    command_type: &str,
    payload: Value,
    inverse_payload: Value,
) -> CommitBatch {
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![JournalOperation {
            sequence: after.sequence,
            transaction_id: Uuid::new_v4().to_string(),
            command_type: command_type.into(),
            payload,
            inverse_payload,
            action: project_io::JournalAction::Apply,
            timestamp: "2026-07-21T00:00:00.000Z".into(),
        }],
    }
}

fn reversed_entity_payload(payload: &Value) -> Value {
    let changes = payload["changes"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .map(|change| {
            let mut reversed = json!({
                "id": change["id"],
                "before": change["after"],
                "after": change["before"]
            });
            if let Some(index) = change.get("index") {
                reversed["index"] = index.clone();
            }
            reversed
        })
        .collect::<Vec<_>>();
    json!({ "reason": payload["reason"], "changes": changes })
}

fn reversed_floor_payload(payload: &Value) -> Value {
    json!({
        "floorId": payload["floorId"],
        "before": payload["after"],
        "after": payload["before"]
    })
}

#[test]
fn plan_entity_patch_dto_accepts_exact_entity_and_floor_payloads_and_rejects_variants() {
    let root = tempdir().unwrap();
    let app = with_invoke_handler(tauri::test::mock_builder().manage(AppService::default()))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = invoke(
        &webview,
        "create_project",
        json!({
            "payload": {
                "parent": root.path(),
                "name": "Plan DTO",
                "profile": "market"
            }
        }),
    )
    .unwrap();
    let opened: desktop_host::OpenedProjectDto = serde_json::from_value(opened).unwrap();

    let fixture = plan_fixture(
        &opened.snapshot,
        "00000000-0000-4000-8000-000000000010",
        "Fixture",
    );
    let entity_payload = json!({
        "reason": "create",
        "changes": [{
            "id": fixture["id"],
            "before": null,
            "after": fixture,
            "index": 0
        }]
    });
    let entity_inverse = json!({
        "reason": "create",
        "changes": [{
            "id": fixture["id"],
            "before": fixture,
            "after": null,
            "index": 0
        }]
    });
    let mut entity_after = opened.snapshot.clone();
    entity_after.project.entities = vec![fixture.clone()];
    entity_after.sequence = 1;
    let entity_batch = plan_batch(
        &opened.snapshot,
        &entity_after,
        "plan.entities.patch",
        entity_payload,
        entity_inverse,
    );
    invoke(
        &webview,
        "commit_project",
        json!({
            "payload": {
                "sessionId": opened.session_id,
                "batch": entity_batch
            }
        }),
    )
    .unwrap();

    let floor_before = entity_after.project.floors[0].clone();
    let mut floor_after = floor_before.clone();
    floor_after.layers[0].visible = false;
    let floor_payload = json!({
        "floorId": floor_before.id,
        "before": floor_before,
        "after": floor_after
    });
    let floor_inverse = json!({
        "floorId": floor_before.id,
        "before": floor_after,
        "after": floor_before
    });
    let mut floor_snapshot = entity_after.clone();
    floor_snapshot.project.floors[0] = floor_after.clone();
    floor_snapshot.sequence = 2;
    let floor_batch = plan_batch(
        &entity_after,
        &floor_snapshot,
        "plan.floor.patch",
        floor_payload.clone(),
        floor_inverse,
    );
    invoke(
        &webview,
        "commit_project",
        json!({
            "payload": {
                "sessionId": opened.session_id,
                "batch": floor_batch
            }
        }),
    )
    .unwrap();

    let changed = plan_fixture(
        &floor_snapshot,
        "00000000-0000-4000-8000-000000000010",
        "Changed",
    );
    let valid_payload = json!({
        "reason": "properties",
        "changes": [{
            "id": fixture["id"],
            "before": fixture,
            "after": changed,
            "index": 0
        }]
    });
    let mut invalid_payloads = Vec::new();
    let mut invalid_reason = valid_payload.clone();
    invalid_reason["reason"] = json!("unknown");
    invalid_payloads.push(invalid_reason);
    let mut unknown_root = valid_payload.clone();
    unknown_root["extra"] = json!(true);
    invalid_payloads.push(unknown_root);
    let mut unknown_change = valid_payload.clone();
    unknown_change["changes"][0]["extra"] = json!(true);
    invalid_payloads.push(unknown_change);
    for index in [
        json!(-1),
        json!(0.5),
        json!(9_007_199_254_740_992_u64),
        json!(u64::MAX),
        json!("0"),
    ] {
        let mut invalid_index = valid_payload.clone();
        invalid_index["changes"][0]["index"] = index;
        invalid_payloads.push(invalid_index);
    }
    let mut wrong_replay_index = valid_payload.clone();
    wrong_replay_index["changes"][0]["index"] = json!(1);
    invalid_payloads.push(wrong_replay_index);
    invalid_payloads.push(json!({
        "reason": "properties",
        "changes": [{
            "id": fixture["id"],
            "before": null,
            "after": null,
            "index": 0
        }]
    }));
    let mut noncanonical = valid_payload.clone();
    let noncanonical_id = json!("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA");
    noncanonical["changes"][0]["id"] = noncanonical_id.clone();
    noncanonical["changes"][0]["before"]["id"] = noncanonical_id.clone();
    noncanonical["changes"][0]["after"]["id"] = noncanonical_id;
    invalid_payloads.push(noncanonical);
    let mut mismatched = valid_payload.clone();
    mismatched["changes"][0]["after"]["id"] = json!("00000000-0000-4000-8000-000000000099");
    invalid_payloads.push(mismatched);
    let mut duplicate = valid_payload;
    let repeated = duplicate["changes"][0].clone();
    duplicate["changes"].as_array_mut().unwrap().push(repeated);
    invalid_payloads.push(duplicate);

    for payload in invalid_payloads {
        let inverse = reversed_entity_payload(&payload);
        let mut claimed_after = floor_snapshot.clone();
        claimed_after.project.entities = vec![changed.clone()];
        claimed_after.sequence = 3;
        let invalid_batch = serde_json::to_value(plan_batch(
            &floor_snapshot,
            &claimed_after,
            "plan.entities.patch",
            payload,
            inverse,
        ))
        .unwrap();
        assert_invalid_ipc(
            &invoke(
                &webview,
                "commit_project",
                json!({
                    "payload": {
                        "sessionId": opened.session_id,
                        "batch": invalid_batch
                    }
                }),
            )
            .unwrap_err(),
        );
    }

    let current_floor = floor_snapshot.project.floors[0].clone();
    let mut next_floor = current_floor.clone();
    next_floor.layers[0].visible = true;
    let valid_floor_payload = json!({
        "floorId": current_floor.id,
        "before": current_floor,
        "after": next_floor
    });
    let mut invalid_floor_payloads = Vec::new();
    let mut unknown_floor = valid_floor_payload.clone();
    unknown_floor["before"]["extra"] = json!(true);
    invalid_floor_payloads.push(unknown_floor);
    let mut unknown_layer = valid_floor_payload;
    unknown_layer["before"]["layers"][0]["extra"] = json!(true);
    invalid_floor_payloads.push(unknown_layer);

    for payload in invalid_floor_payloads {
        let inverse = reversed_floor_payload(&payload);
        let mut claimed_after = floor_snapshot.clone();
        claimed_after.project.floors[0] = next_floor.clone();
        claimed_after.sequence = 3;
        let invalid_floor_batch = plan_batch(
            &floor_snapshot,
            &claimed_after,
            "plan.floor.patch",
            payload,
            inverse,
        );
        assert_invalid_ipc(
            &invoke(
                &webview,
                "commit_project",
                json!({
                    "payload": {
                        "sessionId": opened.session_id,
                        "batch": invalid_floor_batch
                    }
                }),
            )
            .unwrap_err(),
        );
    }
}

fn record_patch_batch_value(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    payload: Value,
    inverse_payload: Value,
) -> Value {
    serde_json::to_value(CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![JournalOperation {
            sequence: after.sequence,
            transaction_id: Uuid::new_v4().to_string(),
            command_type: "snapshot.records.patch".into(),
            payload,
            inverse_payload,
            action: project_io::JournalAction::Apply,
            timestamp: "2026-07-23T00:00:00.000Z".into(),
        }],
    })
    .unwrap()
}

#[test]
fn snapshot_record_patch_dto_accepts_only_the_typed_allowlist_and_exact_payload_shape() {
    let root = tempdir().unwrap();
    let app = with_invoke_handler(tauri::test::mock_builder().manage(AppService::default()))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = invoke(
        &webview,
        "create_project",
        json!({
            "payload": {
                "parent": root.path(),
                "name": "Record Contract",
                "profile": "showroom"
            }
        }),
    )
    .unwrap();
    let opened: desktop_host::OpenedProjectDto = serde_json::from_value(opened).unwrap();
    let digest = "c".repeat(64);
    let asset: project_io::AssetRecord = serde_json::from_value(json!({
        "id": "00000000-0000-4000-8000-000000000080",
        "sha256": digest,
        "relativePath": format!("assets/sha256/cc/{}.png", "c".repeat(64)),
        "mediaType": "image/png",
        "size": 16
    }))
    .unwrap();
    let asset_value = serde_json::to_value(&asset).unwrap();
    let valid_payload = json!({
        "collection": "assets",
        "changes": [{
            "id": asset.id,
            "before": null,
            "after": asset_value,
            "index": 0
        }]
    });
    let valid_inverse = json!({
        "collection": "assets",
        "changes": [{
            "id": asset.id,
            "before": asset_value,
            "after": null,
            "index": 0
        }]
    });
    let mut after = opened.snapshot.clone();
    after.assets = vec![asset];
    after.sequence = 1;

    let mut invalid_pairs = Vec::new();
    let mut unknown_collection = valid_payload.clone();
    unknown_collection["collection"] = json!("vendors");
    let mut unknown_collection_inverse = valid_inverse.clone();
    unknown_collection_inverse["collection"] = json!("vendors");
    invalid_pairs.push((unknown_collection, unknown_collection_inverse));

    let mut arbitrary_path = valid_payload.clone();
    arbitrary_path["path"] = json!("/assets/0");
    invalid_pairs.push((arbitrary_path, valid_inverse.clone()));

    let mut extra_root = valid_payload.clone();
    extra_root["extra"] = json!(true);
    invalid_pairs.push((extra_root, valid_inverse.clone()));

    let mut extra_change = valid_payload.clone();
    extra_change["changes"][0]["extra"] = json!(true);
    invalid_pairs.push((extra_change, valid_inverse.clone()));

    let mut extra_record = valid_payload.clone();
    extra_record["changes"][0]["after"]["unexpected"] = json!(true);
    invalid_pairs.push((extra_record, valid_inverse.clone()));

    let mut null_index = valid_payload.clone();
    null_index["changes"][0]["index"] = Value::Null;
    invalid_pairs.push((null_index, valid_inverse.clone()));

    let mut duplicate = valid_payload.clone();
    let repeated = duplicate["changes"][0].clone();
    duplicate["changes"].as_array_mut().unwrap().push(repeated);
    invalid_pairs.push((duplicate, valid_inverse.clone()));

    let mut wrong_typed_collection = valid_payload.clone();
    wrong_typed_collection["collection"] = json!("planReferences");
    let mut wrong_typed_inverse = valid_inverse.clone();
    wrong_typed_inverse["collection"] = json!("planReferences");
    invalid_pairs.push((wrong_typed_collection, wrong_typed_inverse));

    let mut wrong_inverse = valid_inverse.clone();
    wrong_inverse["changes"][0]["index"] = json!(1);
    invalid_pairs.push((valid_payload.clone(), wrong_inverse));

    for (payload, inverse) in invalid_pairs {
        assert_invalid_ipc(
            &invoke(
                &webview,
                "commit_project",
                json!({
                    "payload": {
                        "sessionId": opened.session_id,
                        "batch": record_patch_batch_value(&opened.snapshot, &after, payload, inverse)
                    }
                }),
            )
            .unwrap_err(),
        );
    }

    let mut claimed_after = opened.snapshot.clone();
    claimed_after.sequence = 1;
    assert_invalid_ipc(
        &invoke(
            &webview,
            "commit_project",
            json!({
                "payload": {
                    "sessionId": opened.session_id,
                    "batch": record_patch_batch_value(
                        &opened.snapshot,
                        &claimed_after,
                        valid_payload.clone(),
                        valid_inverse.clone()
                    )
                }
            }),
        )
        .unwrap_err(),
    );

    invoke(
        &webview,
        "commit_project",
        json!({
            "payload": {
                "sessionId": opened.session_id,
                "batch": record_patch_batch_value(
                    &opened.snapshot,
                    &after,
                    valid_payload,
                    valid_inverse
                )
            }
        }),
    )
    .unwrap();
}
