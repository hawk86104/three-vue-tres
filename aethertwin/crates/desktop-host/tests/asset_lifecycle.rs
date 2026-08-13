use desktop_host::{AppService, CreateProjectDto, OpenProjectDto, with_invoke_handler};
use project_io::{AssetRecord, CommitBatch, JournalAction, JournalOperation};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{fs, path::Path};
use tauri::Manager;
use tempfile::{TempDir, tempdir};
use uuid::Uuid;

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

fn create(service: &AppService, root: &TempDir) -> desktop_host::OpenedProjectDto {
    service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "Native asset lifecycle".into(),
            profile: "showroom".into(),
        })
        .unwrap()
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

fn import(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    session_id: &str,
    source: &Path,
) -> Result<Value, Value> {
    invoke(
        webview,
        "import_project_asset",
        json!({
            "payload": {
                "sessionId": session_id,
                "operationId": Uuid::new_v4(),
                "role": "plan-reference",
                "sourcePath": source.to_string_lossy()
            },
            "onProgress": "__CHANNEL__:1"
        }),
    )
}

fn add_asset_batch(before: &project_io::ProjectSnapshot, asset: &AssetRecord) -> CommitBatch {
    let mut after = before.clone();
    after.sequence += 1;
    after.assets.push(asset.clone());
    let change = json!({
        "id": asset.id,
        "before": null,
        "after": asset,
        "index": before.assets.len()
    });
    let inverse = json!({
        "id": asset.id,
        "before": asset,
        "after": null,
        "index": before.assets.len()
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
            timestamp: "2026-07-29T00:00:00Z".into(),
        }],
    }
}

#[test]
fn native_import_commit_failure_retry_close_and_reopen_preserve_canonical_asset() {
    let root = tempdir().unwrap();
    let app = with_invoke_handler(tauri::test::mock_builder().manage(AppService::default()))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let service = app.state::<AppService>();
    let opened = create(&service, &root);
    let source = root.path().join("plan.png");
    let bytes = png(64, 32);
    fs::write(&source, &bytes).unwrap();

    let first = import(&webview, &opened.session_id, &source).unwrap();
    let second = import(&webview, &opened.session_id, &source).unwrap();
    let asset: AssetRecord = serde_json::from_value(first["asset"].clone()).unwrap();
    assert_eq!(second["asset"]["sha256"], first["asset"]["sha256"]);
    assert_eq!(
        second["asset"]["relativePath"],
        first["asset"]["relativePath"]
    );
    assert_eq!(asset.media_type, "image/png");
    assert_eq!(asset.size, bytes.len() as u64);
    assert_eq!(
        asset.relative_path,
        format!("assets/sha256/{}/{}.png", &asset.sha256[..2], asset.sha256)
    );
    let destination = Path::new(&opened.project_path).join(&asset.relative_path);
    assert_eq!(fs::read(&destination).unwrap(), bytes);

    let collision = vec![0x41; bytes.len()];
    fs::write(&destination, &collision).unwrap();
    let collision_error = import(&webview, &opened.session_id, &source).unwrap_err();
    assert_eq!(collision_error["code"], "ASSET_COLLISION");
    assert_eq!(fs::read(&destination).unwrap(), collision);
    fs::write(&destination, &bytes).unwrap();

    let batch = add_asset_batch(&opened.snapshot, &asset);
    Connection::open(Path::new(&opened.project_path).join("project.db"))
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER fail_asset_metadata BEFORE INSERT ON command_journal \
             BEGIN SELECT RAISE(ABORT, 'forced metadata commit failure'); END;",
        )
        .unwrap();
    let error = service
        .commit_project(&opened.session_id, batch.clone())
        .unwrap_err();
    assert_eq!(error.code, "DATABASE_ERROR");
    assert_eq!(fs::read(&destination).unwrap(), bytes);

    Connection::open(Path::new(&opened.project_path).join("project.db"))
        .unwrap()
        .execute_batch("DROP TRIGGER fail_asset_metadata;")
        .unwrap();
    service.commit_project(&opened.session_id, batch).unwrap();
    let checkpoint = service.checkpoint_project(&opened.session_id).unwrap();
    assert_eq!(checkpoint.snapshot.assets, vec![asset.clone()]);
    service.close_project(&opened.session_id).unwrap();
    assert_eq!(service.session_count().unwrap(), 0);
    assert!(
        !Path::new(&opened.project_path)
            .join(".aethertwin.lock")
            .exists()
    );

    let reopened = service
        .open_project(OpenProjectDto {
            path: opened.project_path.clone(),
            recover_stale_lock: false,
        })
        .unwrap();
    assert_eq!(reopened.snapshot.assets, vec![asset]);
    assert!(
        service
            .asset_issues(&reopened.session_id)
            .unwrap()
            .is_empty()
    );
    assert_eq!(fs::read(destination).unwrap(), bytes);
    service.close_project(&reopened.session_id).unwrap();
}

#[test]
fn cancellation_error_command_surface_csp_and_capabilities_are_stable() {
    let root = tempdir().unwrap();
    let app = with_invoke_handler(tauri::test::mock_builder().manage(AppService::default()))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = create(&app.state::<AppService>(), &root);
    let error = invoke(
        &webview,
        "cancel_project_asset_import",
        json!({
            "payload": {
                "sessionId": opened.session_id,
                "operationId": Uuid::new_v4()
            }
        }),
    )
    .unwrap_err();
    assert_eq!(error["code"], "ASSET_IMPORT_OPERATION_NOT_FOUND");

    let commands = include_str!("../src/commands.rs");
    assert_eq!(commands.matches("#[tauri::command]").count(), 12);
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
    let capability: Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(capability["windows"], json!(["main"]));
    assert_eq!(
        capability["permissions"],
        json!(["core:window:default", "dialog:allow-open"])
    );
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let csp = config["app"]["security"]["csp"].as_str().unwrap();
    assert!(csp.contains("aethertwin-asset:"));
    assert!(csp.contains("object-src 'none'"));
    assert!(!csp.contains("https:"));

    app.state::<AppService>()
        .close_project(&opened.session_id)
        .unwrap();
}
