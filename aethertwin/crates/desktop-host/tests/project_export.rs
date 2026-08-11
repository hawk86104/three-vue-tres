use desktop_host::{AppService, CreateProjectDto, OpenedProjectDto, with_invoke_handler};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tauri::http::{HeaderMap, HeaderName, HeaderValue};
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
