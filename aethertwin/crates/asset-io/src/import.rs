use crate::{
    AssetIoError, AssetMediaFacts,
    media::{InspectedMedia, inspect_stream, validate_role, validate_size_for_extension},
    source::{
        BoundDirectory, BoundProjectRoot, CapturedSource, FileIdentity, OpenedSource,
        PublishFileOutcome, delete_open_stage, regular_file_identity,
    },
};
use project_io::AssetRecord;
use sha2::{Digest, Sha256};
use std::{
    fmt,
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
};
use uuid::Uuid;

const COPY_CHUNK_BYTES: usize = 1024 * 1024;
const STAGE_PREFIX: &str = ".aethertwin-import-";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetImportRole {
    PlanReference,
    ContentImage,
    ContentVideo,
    MaterialTexture,
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

    let assets = root.child("assets")?;
    let mut stage = StageFile::create(&assets, request.operation_id)?;
    let digest = copy_hash_and_verify_source(
        &mut source,
        &mut stage,
        observer,
        request.operation_id,
        total_bytes,
    )?;
    stage.flush_and_verify(total_bytes, &digest, observer)?;

    let digest_text = hex_digest(&digest);
    let prefix = &digest_text[..2];
    let sha_directory = assets.child("sha256")?;
    let destination_directory = sha_directory.child(prefix)?;
    let destination_leaf = format!("{digest_text}.{}", inspected.canonical_extension);
    notify(
        observer,
        request.operation_id,
        ImportStage::Publish,
        total_bytes,
        total_bytes,
    )?;

    let published_identity = stage.identity().clone();
    match destination_directory.publish_open_stage(stage.file(), &destination_leaf)? {
        PublishFileOutcome::Published => {
            stage.mark_published();
            destination_directory.sync()?;
            if !verify_destination(
                &destination_directory,
                &destination_leaf,
                Some(&published_identity),
                total_bytes,
                &digest,
                observer,
                true,
            )? {
                return Err(AssetIoError::Collision);
            }
            stage.close_published();
        }
        PublishFileOutcome::Collision => {
            if !verify_destination(
                &destination_directory,
                &destination_leaf,
                None,
                total_bytes,
                &digest,
                observer,
                false,
            )? {
                return Err(AssetIoError::Collision);
            }
            stage.discard();
        }
    }

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
        || is_url_source(&request.source)
        || !matches!(request.operation_id.get_version_num(), 1..=5)
        || request.operation_id.get_variant() != uuid::Variant::RFC4122
    {
        return Err(AssetIoError::InvalidAssetImportRequest);
    }
    Ok(())
}

fn is_url_source(path: &PathBuf) -> bool {
    path.to_str().is_some_and(|value| {
        ["http://", "https://", "ftp://", "file://"]
            .iter()
            .any(|prefix| {
                value
                    .get(..prefix.len())
                    .is_some_and(|candidate| candidate.eq_ignore_ascii_case(prefix))
            })
    })
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
    let verified = hash_open_file(source.file_mut(), total_bytes, observer)?;
    source.verify_unchanged()?;
    if verified != digest {
        return Err(AssetIoError::SourceChanged);
    }
    Ok(digest)
}

fn hash_open_file(
    file: &mut File,
    expected_size: u64,
    observer: &dyn ImportObserver,
) -> Result<[u8; 32], AssetIoError> {
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
        check_cancelled(observer)?;
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
    directory: &BoundDirectory,
    leaf: &str,
    expected_identity: Option<&FileIdentity>,
    expected_size: u64,
    expected_digest: &[u8; 32],
    observer: &dyn ImportObserver,
    protected_by_stage: bool,
) -> Result<bool, AssetIoError> {
    let mut file = directory.open_child_file(leaf, protected_by_stage)?;
    let identity_before = regular_file_identity(&file).map_err(|_| AssetIoError::Collision)?;
    if expected_identity.is_some_and(|expected| expected != &identity_before) {
        return Ok(false);
    }
    if file.metadata().map_err(|_| AssetIoError::IoFailed)?.len() != expected_size {
        return Ok(false);
    }
    let digest = hash_open_file(&mut file, expected_size, observer)?;
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
    file: Option<File>,
    identity: FileIdentity,
    published: bool,
}

impl StageFile {
    fn create(directory: &BoundDirectory, operation_id: Uuid) -> Result<Self, AssetIoError> {
        for _ in 0..8 {
            let leaf = format!("{STAGE_PREFIX}{operation_id}-{}.stage", Uuid::new_v4());
            match directory.create_stage_file(&leaf) {
                Ok(file) => {
                    let identity = regular_file_identity(&file)?;
                    return Ok(Self {
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

    fn file_mut(&mut self) -> &mut File {
        self.file.as_mut().expect("a live stage owns its handle")
    }

    fn file(&self) -> &File {
        self.file.as_ref().expect("a live stage owns its handle")
    }

    fn identity(&self) -> &FileIdentity {
        &self.identity
    }

    fn flush_and_verify(
        &mut self,
        expected_size: u64,
        expected_digest: &[u8; 32],
        observer: &dyn ImportObserver,
    ) -> Result<(), AssetIoError> {
        let file = self.file.as_mut().ok_or(AssetIoError::IoFailed)?;
        file.flush().map_err(|_| AssetIoError::IoFailed)?;
        file.sync_all().map_err(|_| AssetIoError::IoFailed)?;
        if file.metadata().map_err(|_| AssetIoError::IoFailed)?.len() != expected_size
            || regular_file_identity(file)? != self.identity
            || hash_open_file(file, expected_size, observer)? != *expected_digest
            || regular_file_identity(file)? != self.identity
        {
            return Err(AssetIoError::IoFailed);
        }
        Ok(())
    }

    fn mark_published(&mut self) {
        self.published = true;
    }

    fn close_published(&mut self) {
        debug_assert!(self.published);
        drop(self.file.take());
    }

    fn discard(&mut self) {
        if let Some(file) = self.file.as_ref() {
            delete_open_stage(file);
        }
        drop(self.file.take());
    }
}

impl Drop for StageFile {
    fn drop(&mut self) {
        if !self.published {
            if let Some(file) = self.file.as_ref() {
                delete_open_stage(file);
            }
        }
        drop(self.file.take());
    }
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
