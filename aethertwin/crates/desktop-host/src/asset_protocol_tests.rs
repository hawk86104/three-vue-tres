use crate::asset_protocol::handle_asset_request;
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
        let temp = tempfile::tempdir().unwrap();
        let bytes = b"0123456789abcdef".to_vec();
        let sha256 = sha256_hex(&bytes);
        let asset = AssetRecord {
            id: Uuid::new_v4(),
            relative_path: format!("assets/sha256/{}/{sha256}.png", &sha256[..2]),
            sha256,
            media_type: "image/png".into(),
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
fn supports_single_ranges_and_rejects_invalid_or_multiple_ranges_with_416() {
    let fixture = Fixture::new();
    for (range, expected_range, expected) in [
        ("bytes=2-5", "bytes 2-5/16", b"2345".as_slice()),
        ("bytes=12-", "bytes 12-15/16", b"cdef".as_slice()),
        ("bytes=-4", "bytes 12-15/16", b"cdef".as_slice()),
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
