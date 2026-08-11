use desktop_host::{
    BeginProjectExportRequestDto, FinishProjectExportRequestDto, ProjectExportPresetDto,
    parse_project_export_chunk,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::http::{HeaderMap, HeaderName, HeaderValue};

const SESSION_ID: &str = "10000000-0000-4000-8000-000000000001";
const PROJECT_ID: &str = "20000000-0000-4000-8000-000000000001";
const FLOOR_ID: &str = "30000000-0000-4000-8000-000000000001";
const EXPORT_ID: &str = "40000000-0000-4000-8000-000000000001";
const NONCANONICAL_UUID: &str = "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF";
const MAX_JS_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

const REQUIRED_HEADERS: [(&str, &str); 3] = [
    ("X-Aether-Session-Id", SESSION_ID),
    ("X-Aether-Export-Id", EXPORT_ID),
    ("X-Aether-Chunk-Index", "0"),
];

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParsedChunkProbe {
    session_id: String,
    export_id: String,
    chunk_index: u64,
    bytes: Vec<u8>,
}

#[tauri::command]
fn parse_project_export_chunk_probe(
    request: tauri::ipc::Request<'_>,
) -> Result<ParsedChunkProbe, ()> {
    let parsed = parse_project_export_chunk(&request).map_err(|_| ())?;
    Ok(ParsedChunkProbe {
        session_id: parsed.session_id.to_string(),
        export_id: parsed.export_id.to_string(),
        chunk_index: parsed.chunk_index,
        bytes: parsed.bytes.to_vec(),
    })
}

fn with_probe_webview<T>(
    test: impl FnOnce(&tauri::WebviewWindow<tauri::test::MockRuntime>) -> T,
) -> T {
    let app = tauri::test::mock_builder()
        .invoke_handler(tauri::generate_handler![parse_project_export_chunk_probe])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    test(&webview)
}

fn invoke_probe(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    body: tauri::ipc::InvokeBody,
    headers: &[(&str, &str)],
) -> Result<ParsedChunkProbe, Value> {
    let mut request_headers = HeaderMap::new();
    for (name, value) in headers {
        request_headers.append(
            HeaderName::from_bytes(name.as_bytes()).unwrap(),
            HeaderValue::from_str(value).unwrap(),
        );
    }

    tauri::test::get_ipc_response(
        webview,
        tauri::webview::InvokeRequest {
            cmd: "parse_project_export_chunk_probe".into(),
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
            headers: request_headers,
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<ParsedChunkProbe>().unwrap())
}

fn begin_invocation(preset: Value, snapshot_sequence: Value) -> Value {
    json!({
        "payload": {
            "sessionId": SESSION_ID,
            "projectId": PROJECT_ID,
            "snapshotSequence": snapshot_sequence,
            "activeFloorId": FLOOR_ID,
            "preset": preset,
        }
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BeginInvocationDto {
    payload: BeginProjectExportRequestDto,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FinishInvocationDto {
    payload: FinishProjectExportRequestDto,
}

#[test]
fn parses_only_raw_body_and_three_canonical_headers() {
    with_probe_webview(|webview| {
        let mut headers = REQUIRED_HEADERS.to_vec();
        headers.extend([
            ("content-type", "application/octet-stream"),
            ("origin", "tauri://localhost"),
            ("tauri-callback", "7"),
            ("x-tauri-internal", "transport-only"),
        ]);

        let parsed = invoke_probe(
            webview,
            tauri::ipc::InvokeBody::Raw(vec![1, 2, 3, 255]),
            &headers,
        )
        .unwrap();
        assert_eq!(
            parsed,
            ParsedChunkProbe {
                session_id: SESSION_ID.into(),
                export_id: EXPORT_ID.into(),
                chunk_index: 0,
                bytes: vec![1, 2, 3, 255],
            }
        );
    });
}

#[test]
fn accepts_inclusive_chunk_body_and_index_boundaries() {
    with_probe_webview(|webview| {
        let mut positive_index_headers = REQUIRED_HEADERS.to_vec();
        positive_index_headers[2].1 = "1";
        let maximum_body = vec![0x5a; 1_048_576];
        let parsed = invoke_probe(
            webview,
            tauri::ipc::InvokeBody::Raw(maximum_body),
            &positive_index_headers,
        )
        .unwrap();
        assert_eq!(parsed.chunk_index, 1);
        assert_eq!(parsed.bytes.len(), 1_048_576);

        let mut maximum_index_headers = REQUIRED_HEADERS.to_vec();
        maximum_index_headers[2].1 = "18446744073709551615";
        let parsed = invoke_probe(
            webview,
            tauri::ipc::InvokeBody::Raw(vec![1]),
            &maximum_index_headers,
        )
        .unwrap();
        assert_eq!(parsed.chunk_index, u64::MAX);
    });
}

#[test]
fn rejects_json_chunk_body() {
    with_probe_webview(|webview| {
        assert!(
            invoke_probe(
                webview,
                tauri::ipc::InvokeBody::Json(json!([1, 2, 3, 255])),
                &REQUIRED_HEADERS,
            )
            .is_err()
        );
    });
}

#[test]
fn rejects_each_missing_application_header() {
    with_probe_webview(|webview| {
        for missing in 0..REQUIRED_HEADERS.len() {
            let headers = REQUIRED_HEADERS
                .iter()
                .enumerate()
                .filter_map(|(index, header)| (index != missing).then_some(*header))
                .collect::<Vec<_>>();
            assert!(
                invoke_probe(webview, tauri::ipc::InvokeBody::Raw(vec![1]), &headers,).is_err(),
                "header at index {missing} must be required"
            );
        }
    });
}

#[test]
fn rejects_each_duplicate_application_header_via_all_header_values() {
    with_probe_webview(|webview| {
        for duplicate in REQUIRED_HEADERS {
            let mut headers = REQUIRED_HEADERS.to_vec();
            headers.push(duplicate);
            assert!(
                invoke_probe(webview, tauri::ipc::InvokeBody::Raw(vec![1]), &headers,).is_err(),
                "duplicate {} must not be collapsed by HeaderMap::get",
                duplicate.0
            );
        }
    });
}

#[test]
fn rejects_every_unknown_x_aether_header() {
    with_probe_webview(|webview| {
        for unknown in ["X-Aether-Trace", "X-Aether-Session", "X-Aether-Chunk"] {
            let mut headers = REQUIRED_HEADERS.to_vec();
            headers.push((unknown, "private-value"));
            assert!(
                invoke_probe(webview, tauri::ipc::InvokeBody::Raw(vec![1]), &headers,).is_err(),
                "unknown application header {unknown} must be rejected"
            );
        }
    });
}

#[test]
fn rejects_noncanonical_session_and_export_header_uuids() {
    with_probe_webview(|webview| {
        for header_index in [0, 1] {
            for invalid in [
                NONCANONICAL_UUID,
                "{10000000-0000-4000-8000-000000000001}",
                "00000000-0000-0000-0000-000000000000",
            ] {
                let mut headers = REQUIRED_HEADERS.to_vec();
                headers[header_index].1 = invalid;
                assert!(
                    invoke_probe(webview, tauri::ipc::InvokeBody::Raw(vec![1]), &headers,).is_err()
                );
            }
        }
    });
}

#[test]
fn rejects_noncanonical_chunk_index_text() {
    with_probe_webview(|webview| {
        for invalid in ["+1", "01", " 1", "1 ", "-1", "", "1.0"] {
            let mut headers = REQUIRED_HEADERS.to_vec();
            headers[2].1 = invalid;
            assert!(
                invoke_probe(webview, tauri::ipc::InvokeBody::Raw(vec![1]), &headers,).is_err(),
                "chunk index {invalid:?} must be rejected"
            );
        }
    });
}

#[test]
fn rejects_chunk_index_overflow() {
    with_probe_webview(|webview| {
        let mut headers = REQUIRED_HEADERS.to_vec();
        headers[2].1 = "18446744073709551616";
        assert!(invoke_probe(webview, tauri::ipc::InvokeBody::Raw(vec![1]), &headers,).is_err());
    });
}

#[test]
fn rejects_empty_and_oversized_raw_chunk_bodies() {
    with_probe_webview(|webview| {
        for bytes in [Vec::new(), vec![0; 1_048_577]] {
            assert!(
                invoke_probe(
                    webview,
                    tauri::ipc::InvokeBody::Raw(bytes),
                    &REQUIRED_HEADERS,
                )
                .is_err()
            );
        }
    });
}

#[test]
fn begin_json_accepts_only_the_two_locked_presets() {
    for (wire, expected) in [
        ("full-hd", ProjectExportPresetDto::FullHd),
        ("ultra-hd", ProjectExportPresetDto::UltraHd),
    ] {
        let decoded: BeginInvocationDto =
            serde_json::from_value(begin_invocation(json!(wire), json!(0))).unwrap();
        assert_eq!(decoded.payload.preset, expected);
        assert!(decoded.payload.into_native().is_ok());
        assert_eq!(serde_json::to_value(expected).unwrap(), json!(wire));
    }
}

#[test]
fn begin_json_rejects_missing_wrapper_and_unknown_top_level_keys() {
    let inner = begin_invocation(json!("full-hd"), json!(0))["payload"].clone();
    assert!(serde_json::from_value::<BeginInvocationDto>(inner).is_err());

    let mut unknown_top_level = begin_invocation(json!("full-hd"), json!(0));
    unknown_top_level["trace"] = json!(true);
    assert!(serde_json::from_value::<BeginInvocationDto>(unknown_top_level).is_err());
}

#[test]
fn begin_json_rejects_missing_and_unknown_nested_keys() {
    let mut missing = begin_invocation(json!("full-hd"), json!(0));
    missing["payload"]
        .as_object_mut()
        .unwrap()
        .remove("activeFloorId");
    assert!(serde_json::from_value::<BeginInvocationDto>(missing).is_err());

    let mut unknown = begin_invocation(json!("full-hd"), json!(0));
    unknown["payload"]["outputPath"] = json!("C:\\private\\leak.png");
    assert!(serde_json::from_value::<BeginInvocationDto>(unknown).is_err());
}

#[test]
fn begin_json_rejects_invalid_presets_without_fallback() {
    for invalid in [json!("4k"), json!("FullHd"), Value::Null, json!(1)] {
        assert!(
            serde_json::from_value::<BeginInvocationDto>(begin_invocation(invalid, json!(0)))
                .is_err()
        );
    }
}

#[test]
fn begin_json_rejects_unsafe_or_noninteger_snapshot_sequences() {
    for invalid in [
        json!(MAX_JS_SAFE_INTEGER + 1),
        json!(-1),
        json!(1.5),
        json!("1"),
    ] {
        let decoded = serde_json::from_value::<BeginInvocationDto>(begin_invocation(
            json!("full-hd"),
            invalid,
        ));
        match decoded {
            Ok(value) => assert!(value.payload.into_native().is_err()),
            Err(_) => {}
        }
    }

    let maximum: BeginInvocationDto = serde_json::from_value(begin_invocation(
        json!("full-hd"),
        json!(MAX_JS_SAFE_INTEGER),
    ))
    .unwrap();
    assert!(maximum.payload.into_native().is_ok());
}

#[test]
fn begin_json_native_conversion_rejects_noncanonical_uuids() {
    for field in ["sessionId", "projectId", "activeFloorId"] {
        for invalid in [
            NONCANONICAL_UUID,
            "{10000000-0000-4000-8000-000000000001}",
            "00000000-0000-0000-0000-000000000000",
        ] {
            let mut body = begin_invocation(json!("full-hd"), json!(0));
            body["payload"][field] = json!(invalid);
            let decoded: BeginInvocationDto = serde_json::from_value(body).unwrap();
            assert!(decoded.payload.into_native().is_err());
        }
    }
}

#[test]
fn finish_json_is_exact_and_requires_canonical_ids() {
    let valid = json!({
        "payload": {
            "sessionId": SESSION_ID,
            "exportId": EXPORT_ID,
        }
    });
    let decoded: FinishInvocationDto = serde_json::from_value(valid.clone()).unwrap();
    assert!(decoded.payload.into_native().is_ok());

    assert!(serde_json::from_value::<FinishInvocationDto>(valid["payload"].clone()).is_err());

    let mut unknown_top_level = valid.clone();
    unknown_top_level["trace"] = json!(true);
    assert!(serde_json::from_value::<FinishInvocationDto>(unknown_top_level).is_err());

    let mut unknown_nested = valid.clone();
    unknown_nested["payload"]["force"] = json!(true);
    assert!(serde_json::from_value::<FinishInvocationDto>(unknown_nested).is_err());

    let mut missing = valid.clone();
    missing["payload"]
        .as_object_mut()
        .unwrap()
        .remove("exportId");
    assert!(serde_json::from_value::<FinishInvocationDto>(missing).is_err());

    for field in ["sessionId", "exportId"] {
        let mut invalid = valid.clone();
        invalid["payload"][field] = json!(NONCANONICAL_UUID);
        let decoded: FinishInvocationDto = serde_json::from_value(invalid).unwrap();
        assert!(decoded.payload.into_native().is_err());
    }
}
