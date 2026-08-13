use desktop_host::{AppService, CreateProjectDto, OpenedProjectDto, with_invoke_handler};
use serde_json::{Value, json};
use std::{fs, path::Path};
use tauri::http::{HeaderMap, HeaderName, HeaderValue};
use tempfile::tempdir;

const WIDTH: usize = 1_920;
const HEIGHT: usize = 1_080;
const BYTE_LENGTH: usize = 8_294_400;
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

fn begin_payload(opened: &OpenedProjectDto) -> Value {
    json!({
        "sessionId": opened.session_id,
        "projectId": opened.snapshot.project.id,
        "snapshotSequence": opened.snapshot.sequence,
        "activeFloorId": opened.snapshot.project.floors[0].id,
        "preset": "full-hd"
    })
}

fn stage_count(project_path: &Path) -> usize {
    fs::read_dir(project_path.join("exports"))
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with(".aethertwin-export-")
        })
        .count()
}

fn export_entries(project_path: &Path) -> Vec<String> {
    let mut entries = fs::read_dir(project_path.join("exports"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    entries.sort();
    entries
}

#[test]
fn app_service_exports_reopens_and_cancels_without_mutating_business_state() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let created = service
        .create_project(CreateProjectDto {
            parent: root.path().to_string_lossy().into_owned(),
            name: "M2.5 Native Vertical".into(),
            profile: "showroom".into(),
        })
        .unwrap();
    service.close_project(&created.session_id).unwrap();
    let app = with_invoke_handler(tauri::test::mock_builder().manage(service))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let open = || -> OpenedProjectDto {
        serde_json::from_value(
            invoke_json(
                &webview,
                "open_project",
                json!({ "path": created.project_path, "recoverStaleLock": false }),
            )
            .unwrap(),
        )
        .unwrap()
    };
    let opened = open();
    let initial_snapshot = opened.snapshot.clone();
    let begun = invoke_json(&webview, "begin_project_export", begin_payload(&opened)).unwrap();
    assert_eq!(begun["expectedByteLength"], BYTE_LENGTH);
    assert_eq!(begun["maxChunkBytes"], MAX_CHUNK_BYTES);
    let export_id = begun["exportId"].as_str().unwrap();

    let mut rgba = vec![0_u8; BYTE_LENGTH];
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.copy_from_slice(&[0, 0, 0, 255]);
    }
    let row_bytes = WIDTH * 4;
    rgba[..4].copy_from_slice(&[11, 22, 33, 255]);
    rgba[row_bytes - 4..row_bytes].copy_from_slice(&[44, 55, 66, 255]);
    rgba[BYTE_LENGTH - row_bytes..BYTE_LENGTH - row_bytes + 4].copy_from_slice(&[77, 88, 99, 255]);
    rgba[BYTE_LENGTH - 4..].copy_from_slice(&[111, 122, 133, 255]);
    for (index, chunk) in rgba.chunks(MAX_CHUNK_BYTES).enumerate() {
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
    assert_eq!(
        (result["width"].as_u64(), result["height"].as_u64()),
        (Some(WIDTH as u64), Some(HEIGHT as u64))
    );
    let relative_path = result["relativePath"].as_str().unwrap();
    assert!(Path::new(relative_path).is_relative());
    assert!(relative_path.starts_with("exports/"));
    assert!(!result.to_string().contains(&opened.project_path));
    assert!(
        Path::new(&opened.project_path)
            .join(relative_path)
            .is_file()
    );
    assert_eq!(stage_count(Path::new(&opened.project_path)), 0);

    invoke_json(
        &webview,
        "close_project",
        json!({ "sessionId": opened.session_id }),
    )
    .unwrap();
    let reopened = open();
    assert_eq!(reopened.snapshot, initial_snapshot);

    for partial in [false, true] {
        let published_before = export_entries(Path::new(&reopened.project_path));
        let next = invoke_json(&webview, "begin_project_export", begin_payload(&reopened)).unwrap();
        let next_id = next["exportId"].as_str().unwrap();
        if partial {
            invoke_chunk(
                &webview,
                &reopened.session_id,
                next_id,
                0,
                vec![1, 2, 3, 255],
            )
            .unwrap();
        }
        invoke_json(
            &webview,
            "cancel_project_export",
            json!({ "sessionId": reopened.session_id, "exportId": next_id }),
        )
        .unwrap();
        assert_eq!(stage_count(Path::new(&reopened.project_path)), 0);
        assert_eq!(
            export_entries(Path::new(&reopened.project_path)),
            published_before
        );
    }
    invoke_json(
        &webview,
        "close_project",
        json!({ "sessionId": reopened.session_id }),
    )
    .unwrap();
}
