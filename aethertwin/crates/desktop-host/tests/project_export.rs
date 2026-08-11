use desktop_host::{AppService, CreateProjectDto, OpenedProjectDto, with_invoke_handler};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Barrier};
use std::thread;
use tauri::{
    Manager,
    http::{HeaderMap, HeaderName, HeaderValue},
};
use tempfile::{TempDir, tempdir};
use uuid::Uuid;

const FULL_HD_WIDTH: u32 = 1_920;
const FULL_HD_HEIGHT: u32 = 1_080;
const FULL_HD_RGBA_BYTES: usize = 8_294_400;
const MAX_CHUNK_BYTES: usize = 1_048_576;

fn invoke(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    command: &str,
    body: tauri::ipc::InvokeBody,
    headers: HeaderMap,
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
            body,
            headers,
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

fn invoke_json(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    command: &str,
    payload: Value,
) -> Result<Value, Value> {
    invoke(
        webview,
        command,
        tauri::ipc::InvokeBody::Json(json!({ "payload": payload })),
        HeaderMap::new(),
    )
}

fn invoke_chunk(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    session_id: &str,
    export_id: &str,
    chunk_index: usize,
    bytes: Vec<u8>,
) -> Result<Value, Value> {
    let mut headers = HeaderMap::new();
    for (name, value) in [
        ("x-aether-session-id", session_id.to_owned()),
        ("x-aether-export-id", export_id.to_owned()),
        ("x-aether-chunk-index", chunk_index.to_string()),
    ] {
        headers.insert(
            HeaderName::from_bytes(name.as_bytes()).unwrap(),
            HeaderValue::from_str(&value).unwrap(),
        );
    }
    invoke(
        webview,
        "write_project_export_chunk",
        tauri::ipc::InvokeBody::Raw(bytes),
        headers,
    )
}

fn create_closed_project(
    service: &AppService,
    root: &TempDir,
    name: &str,
    profile: &str,
) -> OpenedProjectDto {
    let created = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: name.into(),
            profile: profile.into(),
        })
        .unwrap();
    service.close_project(&created.session_id).unwrap();
    created
}

fn open_via_command(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    project_path: &str,
) -> OpenedProjectDto {
    serde_json::from_value(
        invoke_json(
            webview,
            "open_project",
            json!({ "path": project_path, "recoverStaleLock": false }),
        )
        .unwrap(),
    )
    .unwrap()
}

fn begin_payload(opened: &OpenedProjectDto) -> Value {
    json!({
        "sessionId": opened.session_id,
        "projectId": opened.snapshot.project.id,
        "snapshotSequence": opened.snapshot.sequence,
        "activeFloorId": opened.snapshot.project.floors[0].id,
        "preset": "full-hd"
    })
}

fn assert_full_hd_png(path: &Path, result: &Value) {
    let png = fs::read(path).unwrap();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(&png[12..16], b"IHDR");
    assert_eq!(
        u32::from_be_bytes(png[16..20].try_into().unwrap()),
        FULL_HD_WIDTH
    );
    assert_eq!(
        u32::from_be_bytes(png[20..24].try_into().unwrap()),
        FULL_HD_HEIGHT
    );
    assert_eq!(png[24], 8);
    assert_eq!(png[25], 6);
    assert!(png.windows(4).any(|window| window == b"sRGB"));
    assert_eq!(result["byteSize"], u64::try_from(png.len()).unwrap());
    let sha256 = result["sha256"].as_str().unwrap();
    assert_eq!(sha256.len(), 64);
    assert!(
        sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    );
}

#[test]
fn native_export_success() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Native Export", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let original_sequence = opened.snapshot.sequence;
    let original_checkpoint = opened.snapshot.checkpoint_sequence;

    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    assert_eq!(begun["width"], FULL_HD_WIDTH);
    assert_eq!(begun["height"], FULL_HD_HEIGHT);
    assert_eq!(begun["expectedByteLength"], FULL_HD_RGBA_BYTES);
    assert_eq!(begun["maxChunkBytes"], MAX_CHUNK_BYTES);
    let export_id = begun["exportId"].as_str().unwrap();
    assert_eq!(Uuid::parse_str(export_id).unwrap().to_string(), export_id);

    let mut rgba = vec![0_u8; FULL_HD_RGBA_BYTES];
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[0x12, 0x34, 0x56, 0xff]);
    }
    let chunks = rgba.chunks(MAX_CHUNK_BYTES).collect::<Vec<_>>();
    assert_eq!(chunks.len(), 8);
    for (index, chunk) in chunks.into_iter().enumerate() {
        invoke_chunk(
            &webview,
            &opened.session_id,
            export_id,
            index,
            chunk.to_vec(),
        )
        .unwrap();
    }

    let result = invoke_json(
        &webview,
        "finish_project_export",
        json!({ "sessionId": opened.session_id, "exportId": export_id }),
    )
    .unwrap();
    assert_eq!(result["width"], FULL_HD_WIDTH);
    assert_eq!(result["height"], FULL_HD_HEIGHT);
    let relative_path = result["relativePath"].as_str().unwrap();
    assert!(relative_path.starts_with("exports/"));
    assert!(relative_path.ends_with("-full-hd.png"));
    assert!(Path::new(relative_path).is_relative());
    assert!(!relative_path.contains('\\'));
    assert!(!result.to_string().contains(&opened.project_path));
    assert_full_hd_png(
        &Path::new(&opened.project_path).join(relative_path),
        &result,
    );

    invoke_json(
        &webview,
        "close_project",
        json!({ "sessionId": opened.session_id }),
    )
    .unwrap();
    let reopened = open_via_command(&webview, &opened.project_path);
    assert_eq!(reopened.snapshot.sequence, original_sequence);
    assert_eq!(reopened.snapshot.checkpoint_sequence, original_checkpoint);
    invoke_json(
        &webview,
        "close_project",
        json!({ "sessionId": reopened.session_id }),
    )
    .unwrap();
}

#[test]
fn begin_rejects_unbound_or_conflicting_project_state() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let showroom = create_closed_project(&service, &root, "Bound Showroom", "showroom");
    let market = create_closed_project(&service, &root, "Bound Market", "market");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let showroom = open_via_command(&webview, &showroom.project_path);
    let market = open_via_command(&webview, &market.project_path);

    assert!(invoke_json(&webview, "begin_project_export", begin_payload(&market)).is_err());

    let mut mismatched_project = begin_payload(&showroom);
    mismatched_project["projectId"] = json!(Uuid::new_v4());
    assert!(invoke_json(&webview, "begin_project_export", mismatched_project).is_err());

    let mut mismatched_sequence = begin_payload(&showroom);
    mismatched_sequence["snapshotSequence"] = json!(showroom.snapshot.sequence + 1);
    assert!(invoke_json(&webview, "begin_project_export", mismatched_sequence).is_err());

    let mut mismatched_floor = begin_payload(&showroom);
    mismatched_floor["activeFloorId"] = json!(Uuid::new_v4());
    assert!(invoke_json(&webview, "begin_project_export", mismatched_floor).is_err());

    let mut mismatched_session = begin_payload(&showroom);
    mismatched_session["sessionId"] = json!(Uuid::new_v4());
    assert!(invoke_json(&webview, "begin_project_export", mismatched_session).is_err());

    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&showroom)).unwrap();
    let second =
        invoke_json(&webview, "begin_project_export", begin_payload(&showroom)).unwrap_err();
    assert_eq!(second["code"], "EXPORT_ALREADY_ACTIVE");
    invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": showroom.session_id, "exportId": begun["exportId"] }),
    )
    .unwrap();
}

fn export_entries(project_path: &str) -> (Vec<std::path::PathBuf>, Vec<std::path::PathBuf>) {
    let entries = fs::read_dir(Path::new(project_path).join("exports"))
        .unwrap()
        .map(Result::unwrap)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    let staging = entries
        .iter()
        .filter(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with(".aethertwin-export-")
        })
        .cloned()
        .collect();
    let published = entries
        .into_iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("png"))
        })
        .collect();
    (staging, published)
}

fn opaque_full_hd() -> Vec<u8> {
    let mut rgba = vec![0_u8; FULL_HD_RGBA_BYTES];
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[0x12, 0x34, 0x56, 0xff]);
    }
    rgba
}

#[test]
fn export_race_finish_and_cancel_have_one_terminal_winner() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Terminal Race", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();
    let rgba = opaque_full_hd();
    for (index, chunk) in rgba.chunks(MAX_CHUNK_BYTES).enumerate() {
        invoke_chunk(
            &webview,
            &opened.session_id,
            &export_id,
            index,
            chunk.to_vec(),
        )
        .unwrap();
    }

    let barrier = Arc::new(Barrier::new(3));
    let finish_webview = webview.clone();
    let finish_barrier = barrier.clone();
    let finish_session = opened.session_id.clone();
    let finish_export = export_id.clone();
    let finish = thread::spawn(move || {
        finish_barrier.wait();
        invoke_json(
            &finish_webview,
            "finish_project_export",
            json!({ "sessionId": finish_session, "exportId": finish_export }),
        )
    });
    let cancel_webview = webview.clone();
    let cancel_barrier = barrier.clone();
    let cancel_session = opened.session_id.clone();
    let cancel_export = export_id.clone();
    let cancel = thread::spawn(move || {
        cancel_barrier.wait();
        invoke_json(
            &cancel_webview,
            "cancel_project_export",
            json!({ "sessionId": cancel_session, "exportId": cancel_export }),
        )
    });

    barrier.wait();
    let outcomes = [finish.join().unwrap(), cancel.join().unwrap()];
    assert_eq!(outcomes.iter().filter(|outcome| outcome.is_ok()).count(), 1);
    let (staging, published) = export_entries(&opened.project_path);
    assert!(staging.is_empty());
    assert!(published.len() <= 1);
}

#[test]
fn export_failure_close_cancels_active_export_and_removes_stage() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Close Failure", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();
    assert_eq!(export_entries(&opened.project_path).0.len(), 1);

    invoke_json(
        &webview,
        "close_project",
        json!({ "sessionId": opened.session_id }),
    )
    .unwrap();

    assert!(export_entries(&opened.project_path).0.is_empty());
    let second_cancel = invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": opened.session_id, "exportId": export_id }),
    )
    .unwrap_err();
    assert_eq!(second_cancel["code"], "EXPORT_NOT_FOUND");
}

#[test]
fn export_terminal_unknown_cross_session_and_duplicate_cancel_are_bounded() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let first = create_closed_project(&service, &root, "Cancel Owner", "showroom");
    let second = create_closed_project(&service, &root, "Cancel Other", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let first = open_via_command(&webview, &first.project_path);
    let second = open_via_command(&webview, &second.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&first)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();

    let cross_session = invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": second.session_id, "exportId": export_id }),
    )
    .unwrap_err();
    assert_eq!(cross_session["code"], "EXPORT_SESSION_MISMATCH");
    let unknown = invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": first.session_id, "exportId": Uuid::new_v4() }),
    )
    .unwrap_err();
    assert_eq!(unknown["code"], "EXPORT_NOT_FOUND");

    invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": first.session_id, "exportId": export_id }),
    )
    .unwrap();
    invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": first.session_id, "exportId": export_id }),
    )
    .unwrap();
    let cancelled_cross_session = invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": second.session_id, "exportId": export_id }),
    )
    .unwrap_err();
    assert_eq!(cancelled_cross_session["code"], "EXPORT_SESSION_MISMATCH");

    invoke_json(
        &webview,
        "close_project",
        json!({ "sessionId": first.session_id }),
    )
    .unwrap();
    let after_close = invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": first.session_id, "exportId": export_id }),
    )
    .unwrap_err();
    assert_eq!(after_close["code"], "EXPORT_NOT_FOUND");
}

#[test]
fn export_race_matching_cancels_are_all_idempotent() {
    const CANCEL_THREADS: usize = 8;

    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Concurrent Cancel", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();
    invoke_chunk(
        &webview,
        &opened.session_id,
        &export_id,
        0,
        vec![0xff; MAX_CHUNK_BYTES],
    )
    .unwrap();

    let barrier = Arc::new(Barrier::new(CANCEL_THREADS + 1));
    let threads = (0..CANCEL_THREADS)
        .map(|_| {
            let cancel_webview = webview.clone();
            let cancel_barrier = barrier.clone();
            let cancel_session = opened.session_id.clone();
            let cancel_export = export_id.clone();
            thread::spawn(move || {
                cancel_barrier.wait();
                invoke_json(
                    &cancel_webview,
                    "cancel_project_export",
                    json!({ "sessionId": cancel_session, "exportId": cancel_export }),
                )
            })
        })
        .collect::<Vec<_>>();
    barrier.wait();
    let outcomes = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();

    assert!(
        outcomes.iter().all(Result::is_ok),
        "matching concurrent cancels must all succeed: {outcomes:?}"
    );
    assert!(export_entries(&opened.project_path).0.is_empty());
    invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": opened.session_id, "exportId": export_id }),
    )
    .unwrap();
}

#[test]
fn export_race_finish_and_finish_have_one_terminal_winner() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Double Finish", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();
    for (index, chunk) in opaque_full_hd().chunks(MAX_CHUNK_BYTES).enumerate() {
        invoke_chunk(
            &webview,
            &opened.session_id,
            &export_id,
            index,
            chunk.to_vec(),
        )
        .unwrap();
    }

    let barrier = Arc::new(Barrier::new(3));
    let threads = [webview.clone(), webview.clone()].map(|finish_webview| {
        let finish_barrier = barrier.clone();
        let finish_session = opened.session_id.clone();
        let finish_export = export_id.clone();
        thread::spawn(move || {
            finish_barrier.wait();
            invoke_json(
                &finish_webview,
                "finish_project_export",
                json!({ "sessionId": finish_session, "exportId": finish_export }),
            )
        })
    });
    barrier.wait();
    let outcomes = threads.map(|thread| thread.join().unwrap());

    assert_eq!(outcomes.iter().filter(|outcome| outcome.is_ok()).count(), 1);
    let (staging, published) = export_entries(&opened.project_path);
    assert!(staging.is_empty());
    assert_eq!(published.len(), 1);
    let completed = invoke_json(
        &webview,
        "finish_project_export",
        json!({ "sessionId": opened.session_id, "exportId": export_id }),
    )
    .unwrap_err();
    assert_eq!(completed["code"], "EXPORT_NOT_FOUND");
}

#[test]
fn export_race_cancel_and_close_leave_no_stage_or_cancel_marker() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Cancel Close", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();
    let barrier = Arc::new(Barrier::new(3));

    let cancel_webview = webview.clone();
    let cancel_barrier = barrier.clone();
    let cancel_session = opened.session_id.clone();
    let cancel_export = export_id.clone();
    let cancel = thread::spawn(move || {
        cancel_barrier.wait();
        invoke_json(
            &cancel_webview,
            "cancel_project_export",
            json!({ "sessionId": cancel_session, "exportId": cancel_export }),
        )
    });
    let close_webview = webview.clone();
    let close_barrier = barrier.clone();
    let close_session = opened.session_id.clone();
    let close = thread::spawn(move || {
        close_barrier.wait();
        invoke_json(
            &close_webview,
            "close_project",
            json!({ "sessionId": close_session }),
        )
    });
    barrier.wait();

    let cancel = cancel.join().unwrap();
    close.join().unwrap().unwrap();
    if let Err(error) = cancel {
        assert_eq!(error["code"], "EXPORT_NOT_FOUND");
    }
    assert!(export_entries(&opened.project_path).0.is_empty());
    let after_close = invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": opened.session_id, "exportId": export_id }),
    )
    .unwrap_err();
    assert_eq!(after_close["code"], "EXPORT_NOT_FOUND");
}

#[test]
fn export_failure_close_all_cancels_exports_for_every_session() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let first = create_closed_project(&service, &root, "Close All One", "showroom");
    let second = create_closed_project(&service, &root, "Close All Two", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let first = open_via_command(&webview, &first.project_path);
    let second = open_via_command(&webview, &second.project_path);
    invoke_json(&webview, "begin_project_export", begin_payload(&first)).unwrap();
    invoke_json(&webview, "begin_project_export", begin_payload(&second)).unwrap();

    app.state::<AppService>().close_all().unwrap();

    assert!(export_entries(&first.project_path).0.is_empty());
    assert!(export_entries(&second.project_path).0.is_empty());
    assert_eq!(app.state::<AppService>().session_count().unwrap(), 0);
}

fn assert_safe_export_error(error: &Value, code: &str, project_path: &str) {
    let object = error.as_object().unwrap();
    assert_eq!(object.len(), 4);
    assert_eq!(error["code"], code);
    assert!(
        error["message"]
            .as_str()
            .is_some_and(|message| !message.is_empty())
    );
    let details = error["details"].as_object().unwrap();
    assert!(
        details
            .keys()
            .all(|key| matches!(key.as_str(), "preset" | "dimensions" | "counts" | "logRef")),
        "unsafe export details for {code}: {details:?}"
    );
    assert!(
        error["logRef"]
            .as_str()
            .is_some_and(|log_ref| log_ref.starts_with("native-"))
    );
    assert!(!error.to_string().contains(project_path));
}

#[test]
fn export_failure_codes_are_stable_redacted_and_terminal() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Export Errors", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);

    let oversized = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let oversized_id = oversized["exportId"].as_str().unwrap();
    let error = invoke_chunk(
        &webview,
        &opened.session_id,
        oversized_id,
        0,
        vec![0_u8; MAX_CHUNK_BYTES + 1],
    )
    .unwrap_err();
    assert_safe_export_error(&error, "EXPORT_CHUNK_TOO_LARGE", &opened.project_path);
    invoke_json(
        &webview,
        "cancel_project_export",
        json!({ "sessionId": opened.session_id, "exportId": oversized_id }),
    )
    .unwrap();

    let out_of_order =
        invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let out_of_order_id = out_of_order["exportId"].as_str().unwrap();
    let error = invoke_chunk(
        &webview,
        &opened.session_id,
        out_of_order_id,
        1,
        vec![1, 2, 3, 0xff],
    )
    .unwrap_err();
    assert_safe_export_error(&error, "EXPORT_CHUNK_OUT_OF_ORDER", &opened.project_path);
    assert!(export_entries(&opened.project_path).0.is_empty());

    let invalid_alpha =
        invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let invalid_alpha_id = invalid_alpha["exportId"].as_str().unwrap();
    let error = invoke_chunk(
        &webview,
        &opened.session_id,
        invalid_alpha_id,
        0,
        vec![1, 2, 3, 0],
    )
    .unwrap_err();
    assert_safe_export_error(&error, "EXPORT_ENCODE_FAILED", &opened.project_path);
    assert!(export_entries(&opened.project_path).0.is_empty());

    let underrun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let error = invoke_json(
        &webview,
        "finish_project_export",
        json!({
            "sessionId": opened.session_id,
            "exportId": underrun["exportId"],
        }),
    )
    .unwrap_err();
    assert_safe_export_error(&error, "EXPORT_BYTE_COUNT_MISMATCH", &opened.project_path);
    assert!(export_entries(&opened.project_path).0.is_empty());
}

#[test]
fn export_race_finish_and_close_have_at_most_one_publication() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Finish Close", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    let export_id = begun["exportId"].as_str().unwrap().to_owned();
    for (index, chunk) in opaque_full_hd().chunks(MAX_CHUNK_BYTES).enumerate() {
        invoke_chunk(
            &webview,
            &opened.session_id,
            &export_id,
            index,
            chunk.to_vec(),
        )
        .unwrap();
    }

    let barrier = Arc::new(Barrier::new(3));
    let finish_webview = webview.clone();
    let finish_barrier = barrier.clone();
    let finish_session = opened.session_id.clone();
    let finish_export = export_id.clone();
    let finish = thread::spawn(move || {
        finish_barrier.wait();
        invoke_json(
            &finish_webview,
            "finish_project_export",
            json!({ "sessionId": finish_session, "exportId": finish_export }),
        )
    });
    let close_webview = webview.clone();
    let close_barrier = barrier.clone();
    let close_session = opened.session_id.clone();
    let close = thread::spawn(move || {
        close_barrier.wait();
        invoke_json(
            &close_webview,
            "close_project",
            json!({ "sessionId": close_session }),
        )
    });
    barrier.wait();

    let finish = finish.join().unwrap();
    close.join().unwrap().unwrap();
    if let Err(error) = finish {
        assert_eq!(error["code"], "EXPORT_NOT_FOUND");
    }
    let (staging, published) = export_entries(&opened.project_path);
    assert!(staging.is_empty());
    assert!(published.len() <= 1);
    assert_eq!(app.state::<AppService>().session_count().unwrap(), 0);
}

#[test]
fn export_race_failed_write_and_terminal_commands_have_one_owner() {
    const ATTEMPTS: usize = 24;

    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = create_closed_project(&service, &root, "Write Terminal Race", "showroom");
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = open_via_command(&webview, &created.project_path);

    for terminal_command in ["finish_project_export", "cancel_project_export"] {
        for attempt in 0..ATTEMPTS {
            let begun =
                invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
            let export_id = begun["exportId"].as_str().unwrap().to_owned();
            let barrier = Arc::new(Barrier::new(3));

            let write_webview = webview.clone();
            let write_barrier = barrier.clone();
            let write_session = opened.session_id.clone();
            let write_export = export_id.clone();
            let write = thread::spawn(move || {
                write_barrier.wait();
                invoke_chunk(
                    &write_webview,
                    &write_session,
                    &write_export,
                    1,
                    vec![1, 2, 3, 0xff],
                )
            });
            let terminal_webview = webview.clone();
            let terminal_barrier = barrier.clone();
            let terminal_session = opened.session_id.clone();
            let terminal_export = export_id.clone();
            let terminal = thread::spawn(move || {
                terminal_barrier.wait();
                invoke_json(
                    &terminal_webview,
                    terminal_command,
                    json!({ "sessionId": terminal_session, "exportId": terminal_export }),
                )
            });

            barrier.wait();
            let write = write.join().unwrap();
            let terminal = terminal.join().unwrap();
            let write_code = write
                .as_ref()
                .err()
                .and_then(|error| error["code"].as_str());
            let terminal_code = terminal
                .as_ref()
                .err()
                .and_then(|error| error["code"].as_str());
            let accepted = match terminal_command {
                "finish_project_export" => matches!(
                    (write_code, terminal_code),
                    (Some("EXPORT_NOT_FOUND"), Some("EXPORT_BYTE_COUNT_MISMATCH"))
                        | (Some("EXPORT_CHUNK_OUT_OF_ORDER"), Some("EXPORT_NOT_FOUND"))
                ),
                "cancel_project_export" => {
                    (write_code == Some("EXPORT_NOT_FOUND") && terminal.is_ok())
                        || (write_code == Some("EXPORT_CHUNK_OUT_OF_ORDER")
                            && terminal_code == Some("EXPORT_NOT_FOUND"))
                }
                _ => unreachable!(),
            };
            assert!(
                accepted,
                "attempt {attempt} produced two terminal outcomes for {terminal_command}: write={write:?}, terminal={terminal:?}"
            );
            assert!(export_entries(&opened.project_path).0.is_empty());
        }
    }
}
