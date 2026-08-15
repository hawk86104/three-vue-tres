use std::error::Error;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, mpsc::Receiver};
use std::thread;
use std::time::Duration;

pub const DEFAULT_PORT: u16 = 4173;
pub const DEFAULT_MAX_HEADER_BYTES: usize = 16 * 1024;
pub const DEFAULT_READ_TIMEOUT: Duration = Duration::from_secs(5);

const MAX_ACTIVE_CONNECTIONS: usize = 32;
const ACCEPT_POLL_INTERVAL: Duration = Duration::from_millis(5);
const CSP: &str = "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostErrorCode {
    PreviewFilesMissing,
    PreviewFilesInvalid,
    PreviewPortUnavailable,
    PreviewServerFailed,
}

impl HostErrorCode {
    fn as_str(self) -> &'static str {
        match self {
            Self::PreviewFilesMissing => "PREVIEW_FILES_MISSING",
            Self::PreviewFilesInvalid => "PREVIEW_FILES_INVALID",
            Self::PreviewPortUnavailable => "PREVIEW_PORT_UNAVAILABLE",
            Self::PreviewServerFailed => "PREVIEW_SERVER_FAILED",
        }
    }
}

#[derive(Debug)]
pub struct HostError {
    code: HostErrorCode,
    source: Option<io::Error>,
}

impl HostError {
    fn new(code: HostErrorCode, source: Option<io::Error>) -> Self {
        Self { code, source }
    }

    pub fn code(&self) -> HostErrorCode {
        self.code
    }
}

impl fmt::Display for HostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code.as_str())
    }
}

impl Error for HostError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.source
            .as_ref()
            .map(|source| source as &(dyn Error + 'static))
    }
}

#[derive(Clone, Debug)]
pub struct HostConfig {
    pub app_root: PathBuf,
    pub preferred_port: u16,
    pub read_timeout: Duration,
    pub max_header_bytes: usize,
}

impl HostConfig {
    pub fn packaged(app_root: PathBuf) -> Self {
        Self {
            app_root,
            preferred_port: DEFAULT_PORT,
            read_timeout: DEFAULT_READ_TIMEOUT,
            max_header_bytes: DEFAULT_MAX_HEADER_BYTES,
        }
    }
}

#[derive(Debug)]
pub struct PortableHost {
    listener: TcpListener,
    address: SocketAddr,
    app_root: Arc<PathBuf>,
    read_timeout: Duration,
    max_header_bytes: usize,
}

impl PortableHost {
    pub fn bind(config: HostConfig) -> Result<Self, HostError> {
        if config.max_header_bytes < 4 || config.read_timeout.is_zero() {
            return Err(HostError::new(HostErrorCode::PreviewServerFailed, None));
        }

        let app_root = Arc::new(validate_app_root(&config.app_root)?);
        let preferred = SocketAddrV4::new(Ipv4Addr::LOCALHOST, config.preferred_port);
        let listener = match TcpListener::bind(preferred) {
            Ok(listener) => listener,
            Err(error)
                if error.kind() == io::ErrorKind::AddrInUse && config.preferred_port != 0 =>
            {
                TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)).map_err(
                    |fallback| {
                        HostError::new(HostErrorCode::PreviewPortUnavailable, Some(fallback))
                    },
                )?
            }
            Err(error) => {
                return Err(HostError::new(
                    HostErrorCode::PreviewPortUnavailable,
                    Some(error),
                ));
            }
        };
        listener
            .set_nonblocking(true)
            .map_err(|error| HostError::new(HostErrorCode::PreviewServerFailed, Some(error)))?;
        let address = listener
            .local_addr()
            .map_err(|error| HostError::new(HostErrorCode::PreviewServerFailed, Some(error)))?;
        if address.ip() != IpAddr::V4(Ipv4Addr::LOCALHOST) {
            return Err(HostError::new(HostErrorCode::PreviewServerFailed, None));
        }

        Ok(Self {
            listener,
            address,
            app_root,
            read_timeout: config.read_timeout,
            max_header_bytes: config.max_header_bytes,
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.address
    }

    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.address.port())
    }

    pub fn serve_until(self, shutdown: Receiver<()>) -> Result<(), HostError> {
        let active = Arc::new(AtomicUsize::new(0));
        loop {
            match shutdown.try_recv() {
                Ok(()) | Err(std::sync::mpsc::TryRecvError::Disconnected) => break,
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
            }

            match self.listener.accept() {
                Ok((mut stream, peer)) => {
                    if !peer.ip().is_loopback() {
                        let _ = write_error(&mut stream, HttpError::BadRequest, false);
                        continue;
                    }

                    let previous = active.fetch_add(1, Ordering::AcqRel);
                    if previous >= MAX_ACTIVE_CONNECTIONS {
                        active.fetch_sub(1, Ordering::AcqRel);
                        let _ = stream.set_nonblocking(false);
                        let _ = stream.set_read_timeout(Some(Duration::from_millis(10)));
                        drain_oversized_header(&mut stream, &[]);
                        let _ = stream.set_write_timeout(Some(self.read_timeout));
                        let _ = write_error(&mut stream, HttpError::ServiceUnavailable, false);
                        continue;
                    }

                    let root = Arc::clone(&self.app_root);
                    let active_worker = Arc::clone(&active);
                    let timeout = self.read_timeout;
                    let max_header_bytes = self.max_header_bytes;
                    let spawned = thread::Builder::new()
                        .name("aethertwin-preview-request".to_owned())
                        .spawn(move || {
                            let _ =
                                handle_connection(&mut stream, &root, timeout, max_header_bytes);
                            active_worker.fetch_sub(1, Ordering::AcqRel);
                        });
                    if let Err(error) = spawned {
                        active.fetch_sub(1, Ordering::AcqRel);
                        return Err(HostError::new(
                            HostErrorCode::PreviewServerFailed,
                            Some(error),
                        ));
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    thread::sleep(ACCEPT_POLL_INTERVAL);
                }
                Err(error) => {
                    return Err(HostError::new(
                        HostErrorCode::PreviewServerFailed,
                        Some(error),
                    ));
                }
            }
        }
        Ok(())
    }
}

fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn validate_app_root(app_root: &Path) -> Result<PathBuf, HostError> {
    let root_metadata = match fs::symlink_metadata(app_root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(HostError::new(
                HostErrorCode::PreviewFilesMissing,
                Some(error),
            ));
        }
        Err(error) => {
            return Err(HostError::new(
                HostErrorCode::PreviewFilesInvalid,
                Some(error),
            ));
        }
    };
    if !root_metadata.is_dir() || is_link_or_reparse(&root_metadata) {
        return Err(HostError::new(HostErrorCode::PreviewFilesInvalid, None));
    }

    let canonical_root = fs::canonicalize(app_root)
        .map_err(|error| HostError::new(HostErrorCode::PreviewFilesInvalid, Some(error)))?;
    let index = app_root.join("index.html");
    let index_metadata = match fs::symlink_metadata(&index) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err(HostError::new(
                HostErrorCode::PreviewFilesMissing,
                Some(error),
            ));
        }
        Err(error) => {
            return Err(HostError::new(
                HostErrorCode::PreviewFilesInvalid,
                Some(error),
            ));
        }
    };
    if !index_metadata.is_file() || is_link_or_reparse(&index_metadata) {
        return Err(HostError::new(HostErrorCode::PreviewFilesInvalid, None));
    }
    let canonical_index = fs::canonicalize(index)
        .map_err(|error| HostError::new(HostErrorCode::PreviewFilesInvalid, Some(error)))?;
    if canonical_index == canonical_root || !canonical_index.starts_with(&canonical_root) {
        return Err(HostError::new(HostErrorCode::PreviewFilesInvalid, None));
    }
    Ok(canonical_root)
}

#[derive(Clone, Copy)]
enum HttpError {
    BadRequest,
    NotFound,
    MethodNotAllowed,
    RequestTimeout,
    UnsupportedMediaType,
    HeaderTooLarge,
    ServiceUnavailable,
}

impl HttpError {
    fn response(self) -> (u16, &'static str, &'static [u8]) {
        match self {
            Self::BadRequest => (400, "Bad Request", b"BAD_REQUEST\n"),
            Self::NotFound => (404, "Not Found", b"NOT_FOUND\n"),
            Self::MethodNotAllowed => (405, "Method Not Allowed", b"METHOD_NOT_ALLOWED\n"),
            Self::RequestTimeout => (408, "Request Timeout", b"REQUEST_TIMEOUT\n"),
            Self::UnsupportedMediaType => {
                (415, "Unsupported Media Type", b"UNSUPPORTED_MEDIA_TYPE\n")
            }
            Self::HeaderTooLarge => (
                431,
                "Request Header Fields Too Large",
                b"REQUEST_HEADER_TOO_LARGE\n",
            ),
            Self::ServiceUnavailable => (503, "Service Unavailable", b"SERVICE_UNAVAILABLE\n"),
        }
    }
}

struct ParsedRequest {
    relative_path: PathBuf,
    head_only: bool,
}

struct ResolvedFile {
    file: File,
    length: u64,
    content_type: &'static str,
    cache_control: &'static str,
}

fn handle_connection(
    stream: &mut TcpStream,
    app_root: &Path,
    timeout: Duration,
    max_header_bytes: usize,
) -> io::Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(timeout))?;

    let head = match read_request_head(stream, max_header_bytes) {
        Ok(head) => head,
        Err(error) => return write_error(stream, error, false),
    };
    let request = match parse_request(&head) {
        Ok(request) => request,
        Err(error) => return write_error(stream, error, false),
    };
    let resolved = match resolve_file(app_root, &request.relative_path) {
        Ok(resolved) => resolved,
        Err(error) => return write_error(stream, error, request.head_only),
    };
    write_file(stream, resolved, request.head_only)
}

fn read_request_head(
    stream: &mut TcpStream,
    max_header_bytes: usize,
) -> Result<Vec<u8>, HttpError> {
    let mut bytes = Vec::with_capacity(max_header_bytes.min(1024));
    let mut chunk = [0_u8; 1024];
    loop {
        if let Some(end) = bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|position| position + 4)
        {
            if end > max_header_bytes {
                return Err(HttpError::HeaderTooLarge);
            }
            bytes.truncate(end);
            return Ok(bytes);
        }
        if bytes.len() >= max_header_bytes {
            drain_oversized_header(stream, &bytes);
            return Err(HttpError::HeaderTooLarge);
        }

        let remaining = max_header_bytes
            .saturating_add(1)
            .saturating_sub(bytes.len());
        let read_len = remaining.min(chunk.len());
        match stream.read(&mut chunk[..read_len]) {
            Ok(0) => return Err(HttpError::BadRequest),
            Ok(count) => {
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.len() > max_header_bytes {
                    drain_oversized_header(stream, &bytes);
                    return Err(HttpError::HeaderTooLarge);
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
                ) =>
            {
                return Err(HttpError::RequestTimeout);
            }
            Err(_) => return Err(HttpError::BadRequest),
        }
    }
}

fn drain_oversized_header(stream: &mut TcpStream, already_read: &[u8]) {
    if already_read.windows(4).any(|window| window == b"\r\n\r\n") {
        let _ = stream.shutdown(std::net::Shutdown::Read);
        return;
    }
    let mut tail = already_read[already_read.len().saturating_sub(3)..].to_vec();
    let mut chunk = [0_u8; 1024];
    let mut remaining = 64 * 1024;

    while remaining > 0 {
        let read_len = remaining.min(chunk.len());
        match stream.read(&mut chunk[..read_len]) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                let mut probe = Vec::with_capacity(tail.len() + count);
                probe.extend_from_slice(&tail);
                probe.extend_from_slice(&chunk[..count]);
                if probe.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
                tail.clear();
                tail.extend_from_slice(&probe[probe.len().saturating_sub(3)..]);
                remaining -= count;
            }
        }
    }
    let _ = stream.shutdown(std::net::Shutdown::Read);
}

fn parse_request(bytes: &[u8]) -> Result<ParsedRequest, HttpError> {
    if !bytes.is_ascii() {
        return Err(HttpError::BadRequest);
    }
    for (index, byte) in bytes.iter().copied().enumerate() {
        if byte == b'\n' && (index == 0 || bytes[index - 1] != b'\r') {
            return Err(HttpError::BadRequest);
        }
        if byte == b'\r' && bytes.get(index + 1) != Some(&b'\n') {
            return Err(HttpError::BadRequest);
        }
    }

    let request = std::str::from_utf8(bytes).map_err(|_| HttpError::BadRequest)?;
    let mut lines = request.split("\r\n");
    let request_line = lines.next().ok_or(HttpError::BadRequest)?;
    let mut parts = request_line.split(' ');
    let method = parts.next().ok_or(HttpError::BadRequest)?;
    let target = parts.next().ok_or(HttpError::BadRequest)?;
    let version = parts.next().ok_or(HttpError::BadRequest)?;
    if method.is_empty()
        || target.is_empty()
        || version.is_empty()
        || parts.next().is_some()
        || !matches!(version, "HTTP/1.0" | "HTTP/1.1")
    {
        return Err(HttpError::BadRequest);
    }

    let head_only = match method {
        "GET" => false,
        "HEAD" => true,
        _ => return Err(HttpError::MethodNotAllowed),
    };
    for line in lines {
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':').ok_or(HttpError::BadRequest)?;
        if name.is_empty()
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            || value
                .bytes()
                .any(|byte| byte < b'\t' || (byte > b'\t' && byte < b' ') || byte == 0x7f)
        {
            return Err(HttpError::BadRequest);
        }
    }

    Ok(ParsedRequest {
        relative_path: parse_target(target)?,
        head_only,
    })
}

fn parse_target(target: &str) -> Result<PathBuf, HttpError> {
    if !target.starts_with('/') || target.contains('#') {
        return Err(HttpError::BadRequest);
    }
    let path = target.split_once('?').map_or(target, |(path, _)| path);
    if path == "/" {
        return Ok(PathBuf::from("index.html"));
    }
    if path.ends_with('/')
        || path.contains("//")
        || path
            .bytes()
            .any(|byte| !byte.is_ascii_graphic() || matches!(byte, b'%' | b'\\' | b':' | 0))
    {
        return Err(HttpError::BadRequest);
    }

    let mut relative = PathBuf::new();
    for segment in path[1..].split('/') {
        if segment.is_empty() || matches!(segment, "." | "..") {
            return Err(HttpError::BadRequest);
        }
        relative.push(segment);
    }
    if relative.as_os_str().is_empty() {
        return Err(HttpError::BadRequest);
    }
    Ok(relative)
}

fn resolve_file(app_root: &Path, relative_path: &Path) -> Result<ResolvedFile, HttpError> {
    if relative_path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(HttpError::BadRequest);
    }
    let content_type = content_type(relative_path).ok_or(HttpError::UnsupportedMediaType)?;
    let candidate = app_root.join(relative_path);
    let canonical = fs::canonicalize(&candidate).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            HttpError::NotFound
        } else {
            HttpError::NotFound
        }
    })?;
    if canonical == app_root || !canonical.starts_with(app_root) {
        return Err(HttpError::BadRequest);
    }

    let mut cursor = app_root.to_path_buf();
    for component in relative_path.components() {
        let Component::Normal(segment) = component else {
            return Err(HttpError::BadRequest);
        };
        cursor.push(segment);
        let metadata = fs::symlink_metadata(&cursor).map_err(|_| HttpError::NotFound)?;
        if is_link_or_reparse(&metadata) {
            return Err(HttpError::BadRequest);
        }
    }

    let file = File::open(&canonical).map_err(|_| HttpError::NotFound)?;
    let metadata = file.metadata().map_err(|_| HttpError::NotFound)?;
    if !metadata.is_file() {
        return Err(HttpError::NotFound);
    }
    let cache_control = if relative_path == Path::new("index.html") {
        "no-store"
    } else if is_hashed_asset(relative_path) {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    Ok(ResolvedFile {
        file,
        length: metadata.len(),
        content_type,
        cache_control,
    })
}

fn content_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "html" => Some("text/html; charset=utf-8"),
        "js" | "mjs" => Some("text/javascript; charset=utf-8"),
        "css" => Some("text/css; charset=utf-8"),
        "json" => Some("application/json; charset=utf-8"),
        "svg" => Some("image/svg+xml"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "wasm" => Some("application/wasm"),
        "woff" => Some("font/woff"),
        "woff2" => Some("font/woff2"),
        _ => None,
    }
}

fn is_hashed_asset(path: &Path) -> bool {
    let first = path
        .components()
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        });
    if first != Some("assets") {
        return false;
    }
    let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
        return false;
    };
    let Some(suffix) = stem
        .rsplit(|character| character == '-' || character == '.')
        .next()
    else {
        return false;
    };
    suffix.len() >= 8
        && suffix
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn write_file(
    stream: &mut TcpStream,
    mut resolved: ResolvedFile,
    head_only: bool,
) -> io::Result<()> {
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: {}\r\nCache-Control: {}\r\n{}\r\n\r\n",
        resolved.length,
        resolved.content_type,
        resolved.cache_control,
        common_headers(),
    );
    stream.write_all(header.as_bytes())?;
    if !head_only {
        io::copy(&mut resolved.file, stream)?;
    }
    stream.flush()
}

fn write_error(stream: &mut TcpStream, error: HttpError, head_only: bool) -> io::Result<()> {
    let (status, reason, body) = error.response();
    let allow = if matches!(error, HttpError::MethodNotAllowed) {
        "Allow: GET, HEAD\r\n"
    } else {
        ""
    };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\n{allow}{}\r\n\r\n",
        body.len(),
        common_headers(),
    );
    stream.write_all(header.as_bytes())?;
    if !head_only {
        stream.write_all(body)?;
    }
    stream.flush()
}

fn common_headers() -> String {
    format!(
        "Content-Security-Policy: {CSP}\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close"
    )
}
