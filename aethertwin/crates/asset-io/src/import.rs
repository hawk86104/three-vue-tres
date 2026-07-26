use crate::{
    AssetIoError, AssetMediaFacts,
    media::{InspectedMedia, inspect_stream, validate_role, validate_size_for_extension},
    source::{
        BoundProjectRoot, CapturedSource, FileIdentity, OpenedSource, open_destination_no_follow,
        path_regular_file_identity, regular_file_identity,
    },
};
use project_io::AssetRecord;
use sha2::{Digest, Sha256};
use std::{
    fmt,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

const COPY_CHUNK_BYTES: usize = 1024 * 1024;
const STAGE_PREFIX: &str = ".aethertwin-import-";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetImportRole {
    PlanReference,
    ContentImage,
    ContentVideo,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ImportStage {
    Capture,
    Validate,
    Hash,
    Publish,
    Complete,
}

impl ImportStage {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Capture => "capture",
            Self::Validate => "validate",
            Self::Hash => "hash",
            Self::Publish => "publish",
            Self::Complete => "complete",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ImportProgress {
    pub operation_id: Uuid,
    pub stage: ImportStage,
    pub completed_bytes: u64,
    pub total_bytes: u64,
}

pub trait ImportObserver: Send + Sync {
    fn progress(&self, value: ImportProgress);
    fn is_cancelled(&self) -> bool;
}

#[derive(Clone)]
pub struct ImportRequest {
    pub project_root: PathBuf,
    pub source: PathBuf,
    pub operation_id: Uuid,
    pub role: AssetImportRole,
}

impl fmt::Debug for ImportRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ImportRequest")
            .field("project_root", &"<redacted>")
            .field("source", &"<redacted>")
            .field("operation_id", &self.operation_id)
            .field("role", &self.role)
            .finish()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportResult {
    pub asset: AssetRecord,
    pub facts: AssetMediaFacts,
}

pub fn import_project_asset(
    request: ImportRequest,
    observer: &dyn ImportObserver,
) -> Result<ImportResult, AssetIoError> {
    validate_request(&request)?;
    check_cancelled(observer)?;
    let root = BoundProjectRoot::bind(&request.project_root)?;
    let captured = CapturedSource::capture(&request.source)?;
    let total_bytes = captured.size();
    notify(
        observer,
        request.operation_id,
        ImportStage::Capture,
        0,
        total_bytes,
    )?;
    let mut source = captured.open(&request.source)?;
    let display_name = request
        .source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(AssetIoError::InvalidAssetImportRequest)?;
    validate_size_for_extension(display_name, total_bytes)?;
    let inspected = inspect_stream(source.file_mut(), display_name, total_bytes)?;
    source.verify_unchanged()?;
    validate_role(request.role, inspected.media_type)?;
    notify(
        observer,
        request.operation_id,
        ImportStage::Validate,
        0,
        total_bytes,
    )?;

    let assets = ensure_directory(root.path(), "assets")?;
    let mut stage = StageFile::create(&assets, request.operation_id)?;
    let digest = copy_hash_and_verify_source(
        &mut source,
        &mut stage,
        observer,
        request.operation_id,
        total_bytes,
    )?;
    stage.flush_and_verify(total_bytes, &digest)?;

    let digest_text = hex_digest(&digest);
    let prefix = &digest_text[..2];
    let sha_directory = ensure_directory(&assets, "sha256")?;
    let destination_directory = ensure_directory(&sha_directory, prefix)?;
    let destination =
        destination_directory.join(format!("{digest_text}.{}", inspected.canonical_extension));
    notify(
        observer,
        request.operation_id,
        ImportStage::Publish,
        total_bytes,
        total_bytes,
    )?;

    let published_identity = stage.identity().clone();
    match publish_no_replace(stage.path(), &destination)? {
        PublishOutcome::Published => {
            stage.mark_published();
            sync_directory(&destination_directory)?;
            if !verify_destination(
                &destination,
                Some(&published_identity),
                total_bytes,
                &digest,
            )? {
                return Err(AssetIoError::Collision);
            }
        }
        PublishOutcome::Collision => {
            if !verify_destination(&destination, None, total_bytes, &digest).unwrap_or(false) {
                return Err(AssetIoError::Collision);
            }
        }
    }

    root.verify()?;
    check_cancelled(observer)?;
    observer.progress(ImportProgress {
        operation_id: request.operation_id,
        stage: ImportStage::Complete,
        completed_bytes: total_bytes,
        total_bytes,
    });
    Ok(build_result(inspected, digest_text, total_bytes))
}

fn validate_request(request: &ImportRequest) -> Result<(), AssetIoError> {
    if request.project_root.as_os_str().is_empty()
        || request.source.as_os_str().is_empty()
        || !matches!(request.operation_id.get_version_num(), 1..=5)
        || request.operation_id.get_variant() != uuid::Variant::RFC4122
    {
        return Err(AssetIoError::InvalidAssetImportRequest);
    }
    Ok(())
}

fn notify(
    observer: &dyn ImportObserver,
    operation_id: Uuid,
    stage: ImportStage,
    completed_bytes: u64,
    total_bytes: u64,
) -> Result<(), AssetIoError> {
    observer.progress(ImportProgress {
        operation_id,
        stage,
        completed_bytes,
        total_bytes,
    });
    check_cancelled(observer)
}

fn check_cancelled(observer: &dyn ImportObserver) -> Result<(), AssetIoError> {
    if observer.is_cancelled() {
        Err(AssetIoError::ImportCancelled)
    } else {
        Ok(())
    }
}

fn copy_hash_and_verify_source(
    source: &mut OpenedSource,
    stage: &mut StageFile,
    observer: &dyn ImportObserver,
    operation_id: Uuid,
    total_bytes: u64,
) -> Result<[u8; 32], AssetIoError> {
    source
        .file_mut()
        .seek(SeekFrom::Start(0))
        .map_err(|_| AssetIoError::IoFailed)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_CHUNK_BYTES];
    let mut completed = 0_u64;
    loop {
        check_cancelled(observer)?;
        let count = source
            .file_mut()
            .read(&mut buffer)
            .map_err(|_| AssetIoError::IoFailed)?;
        if count == 0 {
            break;
        }
        stage
            .file_mut()
            .write_all(&buffer[..count])
            .map_err(|_| AssetIoError::IoFailed)?;
        hasher.update(&buffer[..count]);
        completed = completed
            .checked_add(count as u64)
            .ok_or(AssetIoError::SourceChanged)?;
        if completed > total_bytes {
            return Err(AssetIoError::SourceChanged);
        }
        notify(
            observer,
            operation_id,
            ImportStage::Hash,
            completed,
            total_bytes,
        )?;
    }
    if completed != total_bytes {
        return Err(AssetIoError::SourceChanged);
    }
    source.verify_unchanged()?;
    let digest: [u8; 32] = hasher.finalize().into();
    let verified = hash_open_file(source.file_mut(), total_bytes)?;
    source.verify_unchanged()?;
    if verified != digest {
        return Err(AssetIoError::SourceChanged);
    }
    Ok(digest)
}

fn hash_open_file(file: &mut File, expected_size: u64) -> Result<[u8; 32], AssetIoError> {
    file.seek(SeekFrom::Start(0))
        .map_err(|_| AssetIoError::IoFailed)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; COPY_CHUNK_BYTES];
    let mut length = 0_u64;
    loop {
        let count = file.read(&mut buffer).map_err(|_| AssetIoError::IoFailed)?;
        if count == 0 {
            break;
        }
        length = length
            .checked_add(count as u64)
            .ok_or(AssetIoError::IoFailed)?;
        if length > expected_size {
            return Err(AssetIoError::IoFailed);
        }
        hasher.update(&buffer[..count]);
    }
    if length != expected_size {
        return Err(AssetIoError::IoFailed);
    }
    Ok(hasher.finalize().into())
}

fn verify_destination(
    path: &Path,
    expected_identity: Option<&FileIdentity>,
    expected_size: u64,
    expected_digest: &[u8; 32],
) -> Result<bool, AssetIoError> {
    let mut file = open_destination_no_follow(path)?;
    let identity_before = regular_file_identity(&file).map_err(|_| AssetIoError::Collision)?;
    if expected_identity.is_some_and(|expected| expected != &identity_before) {
        return Ok(false);
    }
    if file.metadata().map_err(|_| AssetIoError::IoFailed)?.len() != expected_size {
        return Ok(false);
    }
    let digest = hash_open_file(&mut file, expected_size)?;
    let identity_after = regular_file_identity(&file).map_err(|_| AssetIoError::Collision)?;
    let final_size = file.metadata().map_err(|_| AssetIoError::IoFailed)?.len();
    Ok(identity_before == identity_after
        && final_size == expected_size
        && &digest == expected_digest)
}

fn build_result(inspected: InspectedMedia, digest: String, size: u64) -> ImportResult {
    let relative_path = format!(
        "assets/sha256/{}/{}.{}",
        &digest[..2],
        digest,
        inspected.canonical_extension
    );
    ImportResult {
        asset: AssetRecord {
            id: Uuid::new_v4(),
            sha256: digest,
            relative_path,
            media_type: inspected.media_type.mime_type().to_owned(),
            size,
        },
        facts: inspected.facts,
    }
}

struct StageFile {
    path: PathBuf,
    file: Option<File>,
    identity: FileIdentity,
    published: bool,
}

impl StageFile {
    fn create(directory: &Path, operation_id: Uuid) -> Result<Self, AssetIoError> {
        for _ in 0..8 {
            let path = directory.join(format!(
                "{STAGE_PREFIX}{operation_id}-{}.stage",
                Uuid::new_v4()
            ));
            let mut options = OpenOptions::new();
            options.read(true).write(true).create_new(true);
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                const FILE_SHARE_READ: u32 = 1;
                const FILE_SHARE_WRITE: u32 = 2;
                const FILE_SHARE_DELETE: u32 = 4;
                options.share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE);
            }
            match options.open(&path) {
                Ok(file) => {
                    let identity = regular_file_identity(&file)?;
                    return Ok(Self {
                        path,
                        file: Some(file),
                        identity,
                        published: false,
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(AssetIoError::IoFailed),
            }
        }
        Err(AssetIoError::IoFailed)
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn file_mut(&mut self) -> &mut File {
        self.file
            .as_mut()
            .expect("an unpublished stage always owns its handle")
    }

    fn identity(&self) -> &FileIdentity {
        &self.identity
    }

    fn flush_and_verify(
        &mut self,
        expected_size: u64,
        expected_digest: &[u8; 32],
    ) -> Result<(), AssetIoError> {
        let file = self.file.as_mut().ok_or(AssetIoError::IoFailed)?;
        file.flush().map_err(|_| AssetIoError::IoFailed)?;
        file.sync_all().map_err(|_| AssetIoError::IoFailed)?;
        if file.metadata().map_err(|_| AssetIoError::IoFailed)?.len() != expected_size
            || regular_file_identity(file)? != self.identity
            || hash_open_file(file, expected_size)? != *expected_digest
            || regular_file_identity(file)? != self.identity
        {
            return Err(AssetIoError::IoFailed);
        }
        Ok(())
    }

    fn mark_published(&mut self) {
        self.published = true;
        drop(self.file.take());
    }
}

impl Drop for StageFile {
    fn drop(&mut self) {
        if !self.published
            && path_regular_file_identity(&self.path)
                .is_ok_and(|identity| identity == self.identity)
        {
            drop(self.file.take());
            let _ = fs::remove_file(&self.path);
        }
    }
}

enum PublishOutcome {
    Published,
    Collision,
}

#[cfg(windows)]
fn publish_no_replace(source: &Path, destination: &Path) -> Result<PublishOutcome, AssetIoError> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    const ERROR_FILE_EXISTS: i32 = 80;
    const ERROR_ALREADY_EXISTS: i32 = 183;
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: both UTF-16 paths are NUL-terminated and remain live for the call.
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    } != 0
    {
        return Ok(PublishOutcome::Published);
    }
    match std::io::Error::last_os_error().raw_os_error() {
        Some(ERROR_FILE_EXISTS | ERROR_ALREADY_EXISTS) => Ok(PublishOutcome::Collision),
        _ => Err(AssetIoError::IoFailed),
    }
}

#[cfg(any(
    target_os = "linux",
    target_os = "android",
    target_vendor = "apple",
    target_os = "redox"
))]
fn publish_no_replace(source: &Path, destination: &Path) -> Result<PublishOutcome, AssetIoError> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};
    match renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE) {
        Ok(()) => Ok(PublishOutcome::Published),
        Err(rustix::io::Errno::EXIST) => Ok(PublishOutcome::Collision),
        Err(_) => Err(AssetIoError::IoFailed),
    }
}

#[cfg(all(
    unix,
    not(any(
        target_os = "linux",
        target_os = "android",
        target_vendor = "apple",
        target_os = "redox"
    ))
))]
fn publish_no_replace(source: &Path, destination: &Path) -> Result<PublishOutcome, AssetIoError> {
    match fs::hard_link(source, destination) {
        Ok(()) => {
            fs::remove_file(source).map_err(|_| AssetIoError::IoFailed)?;
            Ok(PublishOutcome::Published)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            Ok(PublishOutcome::Collision)
        }
        Err(_) => Err(AssetIoError::IoFailed),
    }
}

#[cfg(not(any(unix, windows)))]
fn publish_no_replace(_: &Path, _: &Path) -> Result<PublishOutcome, AssetIoError> {
    Err(AssetIoError::IoFailed)
}

fn ensure_directory(parent: &Path, leaf: &str) -> Result<PathBuf, AssetIoError> {
    let path = parent.join(leaf);
    match fs::create_dir(&path) {
        Ok(()) => sync_directory(parent)?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err(AssetIoError::IoFailed),
    }
    let metadata = fs::symlink_metadata(&path).map_err(|_| AssetIoError::IoFailed)?;
    if !safe_directory_metadata(&metadata) {
        return Err(AssetIoError::IoFailed);
    }
    Ok(path)
}

#[cfg(unix)]
fn safe_directory_metadata(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_dir() && !metadata.file_type().is_symlink()
}

#[cfg(windows)]
fn safe_directory_metadata(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_DIRECTORY != 0
        && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

#[cfg(not(any(unix, windows)))]
fn safe_directory_metadata(metadata: &fs::Metadata) -> bool {
    metadata.is_dir()
}

#[cfg(unix)]
fn sync_directory(directory: &Path) -> Result<(), AssetIoError> {
    File::open(directory)
        .and_then(|file| file.sync_all())
        .map_err(|_| AssetIoError::IoFailed)
}

#[cfg(not(unix))]
fn sync_directory(_: &Path) -> Result<(), AssetIoError> {
    Ok(())
}

fn hex_digest(digest: &[u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(64);
    for byte in digest {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
