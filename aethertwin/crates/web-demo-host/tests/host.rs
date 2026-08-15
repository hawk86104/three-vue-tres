use std::fs;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use aethertwin_web_demo_host::{
    DEFAULT_MAX_HEADER_BYTES, DEFAULT_PORT, DEFAULT_READ_TIMEOUT, HostConfig, HostErrorCode,
    PortableHost,
};
use tempfile::TempDir;

const CSP: &str = "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'";

struct Fixture {
    _temp: TempDir,
    app_root: PathBuf,
}

impl Fixture {
    fn new(index: &[u8]) -> Self {
        let temp = tempfile::tempdir().expect("temporary package root");
        let app_root = temp.path().join("app");
        fs::create_dir(&app_root).expect("app directory");
        fs::write(app_root.join("index.html"), index).expect("preview index");
        Self {
            _temp: temp,
            app_root,
        }
    }

    fn write(&self, relative: &str, bytes: &[u8]) {
        let target = self.app_root.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("asset parent");
        }
        fs::write(target, bytes).expect("asset fixture");
    }

    fn config(&self) -> HostConfig {
        let mut config = HostConfig::packaged(self.app_root.clone());
        config.preferred_port = 0;
        config
    }
}

struct RunningHost {
    address: SocketAddr,
    shutdown: Sender<()>,
    thread: JoinHandle<Result<(), aethertwin_web_demo_host::HostError>>,
}

impl RunningHost {
    fn start(config: HostConfig) -> Self {
        let host = PortableHost::bind(config).expect("host binds");
        let address = host.local_addr();
        let (shutdown, receiver) = mpsc::channel();
        let thread = thread::spawn(move || host.serve_until(receiver));
        Self {
            address,
            shutdown,
            thread,
        }
    }

    fn stop(self) {
        self.shutdown.send(()).expect("shutdown signal");
        self.thread
            .join()
            .expect("host thread joins")
            .expect("host exits cleanly");
    }
}

struct Response {
    status: u16,
    headers: String,
    body: Vec<u8>,
}

fn request(address: SocketAddr, bytes: &[u8]) -> Response {
    let mut stream = TcpStream::connect(address).expect("connect to host");
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("client read timeout");
    stream.write_all(bytes).expect("write request");
    let mut response = Vec::new();
    stream.read_to_end(&mut response).expect("read response");
    parse_response(response)
}

fn parse_response(response: Vec<u8>) -> Response {
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("response header terminator");
    let headers = String::from_utf8(response[..split + 4].to_vec()).expect("ASCII headers");
    let status = headers
        .split_ascii_whitespace()
        .nth(1)
        .expect("status code")
        .parse()
        .expect("numeric status");
    Response {
        status,
        headers,
        body: response[split + 4..].to_vec(),
    }
}

fn get(address: SocketAddr, target: &str) -> Response {
    request(
        address,
        format!("GET {target} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes(),
    )
}

fn assert_common_headers(response: &Response) {
    assert!(response.headers.contains("Connection: close\r\n"));
    assert!(
        response
            .headers
            .contains("X-Content-Type-Options: nosniff\r\n")
    );
    assert!(
        response
            .headers
            .contains("Referrer-Policy: no-referrer\r\n")
    );
    assert!(
        response
            .headers
            .contains(&format!("Content-Security-Policy: {CSP}\r\n"))
    );
}

#[test]
fn packaged_defaults_are_exact() {
    let app_root = PathBuf::from("fixture-app");
    let config = HostConfig::packaged(app_root.clone());
    assert_eq!(config.app_root, app_root);
    assert_eq!(config.preferred_port, DEFAULT_PORT);
    assert_eq!(DEFAULT_PORT, 4173);
    assert_eq!(config.read_timeout, DEFAULT_READ_TIMEOUT);
    assert_eq!(DEFAULT_READ_TIMEOUT, Duration::from_secs(5));
    assert_eq!(config.max_header_bytes, DEFAULT_MAX_HEADER_BYTES);
    assert_eq!(DEFAULT_MAX_HEADER_BYTES, 16 * 1024);
}

#[test]
fn preferred_port_binds_on_ipv4_loopback_and_url_is_exact() {
    let fixture = Fixture::new(b"index");
    let reservation = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("reserve port");
    let port = reservation
        .local_addr()
        .expect("reservation address")
        .port();
    drop(reservation);
    let mut config = HostConfig::packaged(fixture.app_root.clone());
    config.preferred_port = port;

    let host = PortableHost::bind(config).expect("preferred port binds");
    assert_eq!(
        host.local_addr(),
        SocketAddr::from((Ipv4Addr::LOCALHOST, port))
    );
    assert_eq!(host.url(), format!("http://127.0.0.1:{port}/"));
}

#[test]
fn occupied_preferred_port_falls_back_to_another_loopback_port() {
    let fixture = Fixture::new(b"index");
    let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("occupied port");
    let preferred = occupied.local_addr().expect("occupied address").port();
    let mut config = HostConfig::packaged(fixture.app_root.clone());
    config.preferred_port = preferred;

    let host = PortableHost::bind(config).expect("fallback binds");
    assert_eq!(host.local_addr().ip(), Ipv4Addr::LOCALHOST);
    assert_ne!(host.local_addr().port(), preferred);
}

#[test]
fn invalid_preview_roots_fail_safely_before_binding() {
    let temp = tempfile::tempdir().expect("temporary package root");
    let missing = temp.path().join("missing-app");
    let missing_error = PortableHost::bind(HostConfig::packaged(missing.clone()))
        .expect_err("missing root rejected");
    assert_eq!(missing_error.code(), HostErrorCode::PreviewFilesMissing);

    let no_index = temp.path().join("no-index");
    fs::create_dir(&no_index).expect("root without index");
    let no_index_error = PortableHost::bind(HostConfig::packaged(no_index.clone()))
        .expect_err("missing index rejected");
    assert_eq!(no_index_error.code(), HostErrorCode::PreviewFilesMissing);

    let file_root = temp.path().join("file-root");
    fs::write(&file_root, b"not a directory").expect("file root");
    let file_root_error = PortableHost::bind(HostConfig::packaged(file_root.clone()))
        .expect_err("non-directory root rejected");
    assert_eq!(file_root_error.code(), HostErrorCode::PreviewFilesInvalid);

    let directory_index = temp.path().join("directory-index");
    fs::create_dir(&directory_index).expect("directory index root");
    fs::create_dir(directory_index.join("index.html")).expect("directory index");
    let directory_index_error = PortableHost::bind(HostConfig::packaged(directory_index.clone()))
        .expect_err("non-regular index rejected");
    assert_eq!(
        directory_index_error.code(),
        HostErrorCode::PreviewFilesInvalid
    );

    for (error, fixture_path) in [
        (missing_error, missing),
        (no_index_error, no_index),
        (file_root_error, file_root),
        (directory_index_error, directory_index),
    ] {
        assert!(
            !error
                .to_string()
                .contains(&fixture_path.display().to_string())
        );
    }
}

#[test]
fn get_root_and_query_return_exact_bytes_and_security_headers() {
    let fixture = Fixture::new(b"<!doctype html><title>portable</title>");
    let host = RunningHost::start(fixture.config());

    for target in ["/", "/?ignored=yes"] {
        let response = get(host.address, target);
        assert_eq!(response.status, 200);
        assert_eq!(response.body, b"<!doctype html><title>portable</title>");
        assert!(
            response
                .headers
                .contains("Content-Type: text/html; charset=utf-8\r\n")
        );
        assert!(response.headers.contains("Cache-Control: no-store\r\n"));
        assert_common_headers(&response);
    }

    host.stop();
}

#[test]
fn head_returns_exact_content_length_and_no_body() {
    let fixture = Fixture::new(b"123456789");
    let host = RunningHost::start(fixture.config());
    let response = request(host.address, b"HEAD / HTTP/1.0\r\nHost: localhost\r\n\r\n");
    assert_eq!(response.status, 200);
    assert!(response.headers.contains("Content-Length: 9\r\n"));
    assert!(response.body.is_empty());
    assert_common_headers(&response);
    host.stop();
}

#[test]
fn mime_allowlist_and_cache_policy_are_exact() {
    let fixture = Fixture::new(b"index");
    let cases = [
        ("page.html", "text/html; charset=utf-8"),
        ("script.js", "text/javascript; charset=utf-8"),
        ("module.mjs", "text/javascript; charset=utf-8"),
        ("style.css", "text/css; charset=utf-8"),
        ("data.json", "application/json; charset=utf-8"),
        ("image.svg", "image/svg+xml"),
        ("image.png", "image/png"),
        ("image.jpg", "image/jpeg"),
        ("image.jpeg", "image/jpeg"),
        ("image.webp", "image/webp"),
        ("module.wasm", "application/wasm"),
        ("font.woff", "font/woff"),
        ("font.woff2", "font/woff2"),
    ];
    for (name, _) in cases {
        fixture.write(name, name.as_bytes());
    }
    fixture.write("assets/index-a1b2c3d4.js", b"immutable");
    let host = RunningHost::start(fixture.config());

    for (name, content_type) in cases {
        let response = get(host.address, &format!("/{name}"));
        assert_eq!(response.status, 200, "{name}");
        assert!(
            response
                .headers
                .contains(&format!("Content-Type: {content_type}\r\n")),
            "{name}"
        );
        assert!(response.headers.contains("Cache-Control: no-cache\r\n"));
    }
    let asset = get(host.address, "/assets/index-a1b2c3d4.js");
    assert_eq!(asset.status, 200);
    assert!(
        asset
            .headers
            .contains("Cache-Control: public, max-age=31536000, immutable\r\n")
    );
    host.stop();
}

#[test]
fn unsupported_files_missing_files_and_methods_have_exact_statuses() {
    let fixture = Fixture::new(b"index");
    fixture.write("unknown.bin", b"unknown");
    let host = RunningHost::start(fixture.config());
    assert_eq!(get(host.address, "/unknown.bin").status, 415);
    assert_eq!(get(host.address, "/missing.js").status, 404);
    let post = request(
        host.address,
        b"POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n",
    );
    assert_eq!(post.status, 405);
    assert!(post.headers.contains("Allow: GET, HEAD\r\n"));
    host.stop();
}

#[test]
fn invalid_request_target_matrix_is_rejected() {
    let fixture = Fixture::new(b"index");
    fixture.write("safe.js", b"safe");
    let host = RunningHost::start(fixture.config());
    let text_targets = [
        "/../safe.js",
        "/./safe.js",
        "//safe.js",
        "/%2e%2e/safe.js",
        "/dir\\safe.js",
        "/C:/safe.js",
        "/safe.js#fragment",
    ];
    for target in text_targets {
        assert_eq!(get(host.address, target).status, 400, "{target}");
    }
    for target in [
        b"/bad\0.js".as_slice(),
        b"/bad\xff.js",
        "/你好.js".as_bytes(),
    ] {
        let mut raw = b"GET ".to_vec();
        raw.extend_from_slice(target);
        raw.extend_from_slice(b" HTTP/1.1\r\nHost: localhost\r\n\r\n");
        assert_eq!(request(host.address, &raw).status, 400);
    }
    host.stop();
}

#[cfg(unix)]
fn create_escape_link(source: &Path, link: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(source, link)
}

#[cfg(windows)]
fn create_escape_link(source: &Path, link: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_file(source, link)
}

#[test]
fn canonical_target_outside_root_is_rejected_when_symlink_privilege_is_available() {
    let fixture = Fixture::new(b"index");
    let outside = fixture._temp.path().join("outside.js");
    fs::write(&outside, b"outside").expect("outside fixture");
    let link = fixture.app_root.join("escape.js");
    if let Err(error) = create_escape_link(&outside, &link) {
        #[cfg(windows)]
        {
            eprintln!(
                "SKIP canonical_target_outside_root_windows_symlink_privilege_unavailable: {}",
                error.kind()
            );
            return;
        }
        #[cfg(not(windows))]
        panic!("symlink fixture failed: {error}");
    }
    let host = RunningHost::start(fixture.config());
    assert_eq!(get(host.address, "/escape.js").status, 400);
    host.stop();
}

#[test]
fn bounded_headers_timeouts_and_connection_limit_are_enforced() {
    let fixture = Fixture::new(b"index");
    let mut config = fixture.config();
    config.max_header_bytes = 96;
    config.read_timeout = Duration::from_millis(100);
    let host = RunningHost::start(config);

    let oversized = format!(
        "GET / HTTP/1.1\r\nHost: localhost\r\nX-Oversized: {}\r\n\r\n",
        "a".repeat(96)
    );
    assert_eq!(request(host.address, oversized.as_bytes()).status, 431);

    let mut incomplete = TcpStream::connect(host.address).expect("incomplete connection");
    incomplete
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("incomplete read timeout");
    incomplete
        .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\n")
        .expect("partial header");
    let mut timed_out = Vec::new();
    incomplete
        .read_to_end(&mut timed_out)
        .expect("timeout response");
    assert_eq!(parse_response(timed_out).status, 408);
    host.stop();

    let mut capacity_config = fixture.config();
    capacity_config.read_timeout = Duration::from_secs(2);
    let host = RunningHost::start(capacity_config);

    let mut blockers = Vec::new();
    for _ in 0..40 {
        let mut stream = TcpStream::connect(host.address).expect("blocking connection");
        stream
            .write_all(b"GET / HTTP/1.1\r\n")
            .expect("partial blocking request");
        blockers.push(stream);
    }
    thread::sleep(Duration::from_millis(200));
    let overflow = get(host.address, "/");
    assert_eq!(overflow.status, 503);
    drop(blockers);
    thread::sleep(Duration::from_millis(125));

    let requests = (0..16)
        .map(|_| {
            let address = host.address;
            thread::spawn(move || get(address, "/").status)
        })
        .collect::<Vec<_>>();
    for request_thread in requests {
        assert_eq!(request_thread.join().expect("request joins"), 200);
    }
    host.stop();
}

#[test]
fn shutdown_channel_returns_accept_loop_cleanly() {
    let fixture = Fixture::new(b"index");
    let host = PortableHost::bind(fixture.config()).expect("host binds");
    let (shutdown, receiver) = mpsc::channel();
    shutdown.send(()).expect("shutdown signal");
    host.serve_until(receiver).expect("clean shutdown");
}

#[test]
fn host_errors_display_only_stable_codes() {
    let fixture_path = PathBuf::from("fixture-secret-path");
    let missing = PortableHost::bind(HostConfig::packaged(fixture_path.clone()))
        .expect_err("missing root rejected");
    assert_eq!(missing.to_string(), "PREVIEW_FILES_MISSING");
    assert!(!missing.to_string().contains("fixture-secret-path"));

    let rendered_codes = [
        (HostErrorCode::PreviewFilesMissing, "PREVIEW_FILES_MISSING"),
        (HostErrorCode::PreviewFilesInvalid, "PREVIEW_FILES_INVALID"),
        (
            HostErrorCode::PreviewPortUnavailable,
            "PREVIEW_PORT_UNAVAILABLE",
        ),
        (HostErrorCode::PreviewServerFailed, "PREVIEW_SERVER_FAILED"),
    ];
    for (code, rendered) in rendered_codes {
        assert_eq!(format!("{code:?}").starts_with("Preview"), true);
        assert!(!rendered.contains("fixture"));
    }
}
