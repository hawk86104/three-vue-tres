use crate::asset_protocol::{
    MAX_PROTOCOL_RESPONSE_BYTES, ResponsePlanError, asset_issue_response, handle_asset_request,
    plan_response, response_too_large,
};
use asset_io::{AssetIssue, AssetResolver, sha256_hex};
use project_io::{AssetRecord, ProjectSnapshot};
use std::{cell::Cell, fs};
use tauri::http::{Method, Request, StatusCode, header};
use tempfile::TempDir;
use uuid::Uuid;

struct Fixture {
    _temp: TempDir,
    root: std::path::PathBuf,
    resolver: AssetResolver,
    snapshot: ProjectSnapshot,
    session_id: Uuid,
    asset: AssetRecord,
    bytes: Vec<u8>,
}

impl Fixture {
    fn new() -> Self {
        Self::with_media_type("image/png")
    }

    fn with_media_type(media_type: &str) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let bytes = b"0123456789abcdef".to_vec();
        let sha256 = sha256_hex(&bytes);
        let extension = match media_type {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/svg+xml" => "svg",
            "video/mp4" => "mp4",
            "video/webm" => "webm",
            _ => panic!("unsupported fixture media type"),
        };
        let asset = AssetRecord {
            id: Uuid::new_v4(),
            relative_path: format!("assets/sha256/{}/{sha256}.{extension}", &sha256[..2]),
            sha256,
            media_type: media_type.into(),
            size: bytes.len() as u64,
        };
        let destination = temp.path().join(&asset.relative_path);
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        fs::write(destination, &bytes).unwrap();
        let mut snapshot: ProjectSnapshot =
            serde_json::from_str(include_str!("../../../fixtures/contracts/snapshot.v3.json"))
                .unwrap();
        snapshot.assets.push(asset.clone());
        Self {
            root: temp.path().to_owned(),
            _temp: temp,
            resolver: AssetResolver::default(),
            snapshot,
            session_id: Uuid::new_v4(),
            asset,
            bytes,
        }
    }

    fn request(&self, method: Method) -> Request<Vec<u8>> {
        Request::builder()
            .method(method)
            .uri(format!(
                "aethertwin-asset://asset/{}/{}",
                self.session_id, self.asset.id
            ))
            .body(Vec::new())
            .unwrap()
    }

    fn handle(&self, request: &Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
        handle_asset_request(request, &|session_id, asset_id| {
            if session_id != self.session_id {
                return Err(AssetIssue::NotFound);
            }
            self.resolver
                .resolve(session_id, &self.root, &self.snapshot, asset_id)
        })
    }
}

#[test]
fn accepts_only_the_exact_asset_url_shape_and_get_or_head() {
    let fixture = Fixture::new();
    let called = Cell::new(false);
    for uri in [
        "https://asset/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002",
        "file://asset/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002",
        "aethertwin-asset://remote/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002",
        "aethertwin-asset://asset/../00000000-0000-4000-8000-000000000002",
        "aethertwin-asset://asset/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/extra",
        "aethertwin-asset://asset/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002?secret=1",
    ] {
        let request = Request::builder().uri(uri).body(Vec::new()).unwrap();
        let response = handle_asset_request(&request, &|_, _| {
            called.set(true);
            Err(AssetIssue::NotFound)
        });
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{uri}");
    }
    assert!(!called.get());

    let response = fixture.handle(&fixture.request(Method::POST));
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(response.headers()[header::ALLOW], "GET, HEAD");
}

#[test]
fn rejects_noncanonical_or_unsupported_uuid_spellings_before_resolution() {
    let called = Cell::new(false);
    for (session_id, asset_id) in [
        (
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
            "00000000-0000-4000-8000-000000000002",
        ),
        (
            "aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa",
            "00000000-0000-4000-8000-000000000002",
        ),
        (
            "00000000-0000-0000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
        ),
        (
            "00000000-0000-6000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
        ),
        (
            "00000000-0000-4000-0000-000000000001",
            "00000000-0000-4000-8000-000000000002",
        ),
        (
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-6000-8000-000000000002",
        ),
    ] {
        let request = Request::builder()
            .uri(format!("aethertwin-asset://asset/{session_id}/{asset_id}"))
            .body(Vec::new())
            .unwrap();
        let response = handle_asset_request(&request, &|_, _| {
            called.set(true);
            Err(AssetIssue::NotFound)
        });
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    assert!(!called.get());
}

#[test]
fn returns_safe_not_found_for_wrong_session_or_asset() {
    let fixture = Fixture::new();
    for uri in [
        format!(
            "aethertwin-asset://asset/{}/{}",
            Uuid::new_v4(),
            fixture.asset.id
        ),
        format!(
            "aethertwin-asset://asset/{}/{}",
            fixture.session_id,
            Uuid::new_v4()
        ),
    ] {
        let request = Request::builder().uri(uri).body(Vec::new()).unwrap();
        let response = fixture.handle(&request);
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers()["x-aethertwin-asset-issue"],
            "ASSET_NOT_FOUND"
        );
        assert!(response.body().is_empty());
        assert!(!format!("{response:?}").contains(&fixture.root.to_string_lossy().to_string()));
    }
}

#[test]
fn get_and_head_return_canonical_security_and_length_headers() {
    let fixture = Fixture::new();
    let get = fixture.handle(&fixture.request(Method::GET));
    assert_eq!(get.status(), StatusCode::OK);
    assert_eq!(get.headers()[header::CONTENT_TYPE], "image/png");
    assert_eq!(get.headers()["x-content-type-options"], "nosniff");
    assert_eq!(get.headers()[header::ACCEPT_RANGES], "bytes");
    assert_eq!(
        get.headers()[header::CONTENT_LENGTH],
        fixture.bytes.len().to_string()
    );
    assert_eq!(get.body(), &fixture.bytes);

    let head = fixture.handle(&fixture.request(Method::HEAD));
    assert_eq!(head.status(), StatusCode::OK);
    assert_eq!(
        head.headers()[header::CONTENT_LENGTH],
        fixture.bytes.len().to_string()
    );
    assert!(head.body().is_empty());
}

#[test]
fn returns_all_five_canonical_mime_types() {
    for media_type in [
        "image/png",
        "image/jpeg",
        "image/svg+xml",
        "video/mp4",
        "video/webm",
    ] {
        let fixture = Fixture::with_media_type(media_type);
        let response = fixture.handle(&fixture.request(Method::GET));
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], media_type);
    }
}

#[test]
fn supports_single_ranges_and_rejects_invalid_or_multiple_ranges_with_416() {
    let fixture = Fixture::new();
    for (range, expected_range, expected) in [
        ("bytes=2-5", "bytes 2-5/16", b"2345".as_slice()),
        ("bytes=12-", "bytes 12-15/16", b"cdef".as_slice()),
        ("bytes=-4", "bytes 12-15/16", b"cdef".as_slice()),
        ("bytes=-99", "bytes 0-15/16", b"0123456789abcdef".as_slice()),
    ] {
        let mut request = fixture.request(Method::GET);
        request
            .headers_mut()
            .insert(header::RANGE, range.parse().unwrap());
        let response = fixture.handle(&request);
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()[header::CONTENT_RANGE], expected_range);
        assert_eq!(
            response.headers()[header::CONTENT_LENGTH],
            expected.len().to_string()
        );
        assert_eq!(response.body(), expected);
    }

    let mut head = fixture.request(Method::HEAD);
    head.headers_mut()
        .insert(header::RANGE, "bytes=2-5".parse().unwrap());
    let response = fixture.handle(&head);
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/16");
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "4");
    assert!(response.body().is_empty());

    for range in [
        "bytes=",
        "bytes=99-",
        "bytes=7-3",
        "bytes=0-1,4-5",
        "items=0-1",
    ] {
        let mut request = fixture.request(Method::GET);
        request
            .headers_mut()
            .insert(header::RANGE, range.parse().unwrap());
        let response = fixture.handle(&request);
        assert_eq!(
            response.status(),
            StatusCode::RANGE_NOT_SATISFIABLE,
            "{range}"
        );
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes */16");
        assert!(response.body().is_empty());
    }
}

#[test]
fn bounds_in_memory_responses_without_hashing_large_fixtures() {
    let exact = plan_response(&Method::GET, None, MAX_PROTOCOL_RESPONSE_BYTES).unwrap();
    assert_eq!(exact.length, MAX_PROTOCOL_RESPONSE_BYTES);
    assert!(exact.read_body);

    assert_eq!(
        plan_response(&Method::GET, None, MAX_PROTOCOL_RESPONSE_BYTES + 1).unwrap_err(),
        ResponsePlanError::TooLarge
    );
    assert_eq!(
        plan_response(
            &Method::GET,
            Some("bytes=0-33554432"),
            MAX_PROTOCOL_RESPONSE_BYTES + 1,
        )
        .unwrap_err(),
        ResponsePlanError::TooLarge
    );
    let bounded = plan_response(
        &Method::GET,
        Some("bytes=1-33554432"),
        MAX_PROTOCOL_RESPONSE_BYTES + 1,
    )
    .unwrap();
    assert_eq!(bounded.length, MAX_PROTOCOL_RESPONSE_BYTES);
    assert!(bounded.read_body);

    let head = plan_response(&Method::HEAD, None, u64::MAX).unwrap();
    assert_eq!(head.length, u64::MAX);
    assert!(!head.read_body);

    let empty = plan_response(&Method::GET, None, 0).unwrap();
    assert_eq!(empty.length, 0);
    assert!(empty.read_body);
    assert_eq!(
        plan_response(&Method::GET, Some("bytes=0-0"), 0).unwrap_err(),
        ResponsePlanError::InvalidRange
    );

    let oversized = response_too_large(MAX_PROTOCOL_RESPONSE_BYTES + 1);
    assert_eq!(oversized.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(
        oversized.headers()["x-aethertwin-asset-issue"],
        "ASSET_RESPONSE_TOO_LARGE"
    );
    assert_eq!(
        oversized.headers()["x-aethertwin-max-response-bytes"],
        MAX_PROTOCOL_RESPONSE_BYTES.to_string()
    );
    assert_eq!(oversized.headers()[header::ACCEPT_RANGES], "bytes");
    assert!(oversized.body().is_empty());

    let allocation_failure = asset_issue_response(AssetIssue::Unavailable);
    assert_eq!(allocation_failure.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        allocation_failure.headers()["x-aethertwin-asset-issue"],
        "ASSET_UNAVAILABLE"
    );
    assert!(allocation_failure.body().is_empty());
}
