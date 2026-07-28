use project_io::{AssetRecord, ProjectSnapshot};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fmt,
    fs::{File, Metadata, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetIssue {
    NotFound,
    Missing,
    NotRegularFile,
    SizeMismatch,
    DigestMismatch,
    Unavailable,
}

impl AssetIssue {
    pub fn code(self) -> &'static str {
        match self {
            Self::NotFound => "ASSET_NOT_FOUND",
            Self::Missing => "ASSET_MISSING",
            Self::NotRegularFile => "ASSET_NOT_REGULAR_FILE",
            Self::SizeMismatch => "ASSET_SIZE_MISMATCH",
            Self::DigestMismatch => "ASSET_DIGEST_MISMATCH",
            Self::Unavailable => "ASSET_UNAVAILABLE",
        }
    }
}

impl fmt::Display for AssetIssue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for AssetIssue {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetIssueRecord {
    pub asset_id: Uuid,
    pub issue: AssetIssue,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub struct VerifiedAsset {
    file: Mutex<File>,
    media_type: String,
    len: u64,
}

impl fmt::Debug for VerifiedAsset {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("VerifiedAsset")
            .field("media_type", &self.media_type)
            .field("len", &self.len)
            .finish_non_exhaustive()
    }
}

impl VerifiedAsset {
    pub fn media_type(&self) -> &str {
        &self.media_type
    }

    pub fn len(&self) -> u64 {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn read_range(&self, offset: u64, length: u64) -> Result<Vec<u8>, AssetIssue> {
        let end = offset.checked_add(length).ok_or(AssetIssue::Unavailable)?;
        if end > self.len {
            return Err(AssetIssue::Unavailable);
        }
        let output_len = usize::try_from(length).map_err(|_| AssetIssue::Unavailable)?;
        let mut output = vec![0; output_len];
        let mut file = self.file.lock().map_err(|_| AssetIssue::Unavailable)?;
        file.seek(SeekFrom::Start(offset))
            .map_err(|_| AssetIssue::Unavailable)?;
        file.read_exact(&mut output)
            .map_err(|_| AssetIssue::Unavailable)?;
        Ok(output)
    }
}

#[derive(Clone)]
struct CachedAsset {
    record: AssetRecord,
    asset: Arc<VerifiedAsset>,
}

#[derive(Default)]
pub struct AssetResolver {
    cache: Mutex<HashMap<(Uuid, Uuid), CachedAsset>>,
}

impl AssetResolver {
    pub fn resolve(
        &self,
        session_id: Uuid,
        project_root: &Path,
        snapshot: &ProjectSnapshot,
        asset_id: Uuid,
    ) -> Result<Arc<VerifiedAsset>, AssetIssue> {
        let record = snapshot
            .assets
            .iter()
            .find(|record| record.id == asset_id)
            .ok_or(AssetIssue::NotFound)?;
        let key = (session_id, asset_id);
        if let Some(cached) = self
            .cache
            .lock()
            .map_err(|_| AssetIssue::Unavailable)?
            .get(&key)
            .filter(|cached| cached.record == *record)
            .cloned()
        {
            return Ok(cached.asset);
        }

        let path = canonical_path(project_root, record)?;
        let asset = Arc::new(verify_handle(&path, record)?);
        let mut cache = self.cache.lock().map_err(|_| AssetIssue::Unavailable)?;
        if let Some(cached) = cache.get(&key).filter(|cached| cached.record == *record) {
            return Ok(cached.asset.clone());
        }
        cache.insert(
            key,
            CachedAsset {
                record: record.clone(),
                asset: asset.clone(),
            },
        );
        Ok(asset)
    }

    pub fn preflight(
        &self,
        _session_id: Uuid,
        project_root: &Path,
        snapshot: &ProjectSnapshot,
    ) -> Vec<AssetIssueRecord> {
        snapshot
            .assets
            .iter()
            .filter_map(|record| {
                preflight_record(project_root, record)
                    .err()
                    .map(|issue| AssetIssueRecord {
                        asset_id: record.id,
                        issue,
                    })
            })
            .collect()
    }

    pub fn reconcile_session(&self, session_id: Uuid, snapshot: &ProjectSnapshot) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.retain(|(cached_session, asset_id), cached| {
                *cached_session != session_id
                    || snapshot
                        .assets
                        .iter()
                        .any(|record| record.id == *asset_id && *record == cached.record)
            });
        }
    }

    pub fn invalidate_session(&self, session_id: Uuid) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.retain(|(cached_session, _), _| *cached_session != session_id);
        }
    }

    pub fn cached_count(&self, session_id: Uuid) -> Result<usize, AssetIssue> {
        self.cache
            .lock()
            .map_err(|_| AssetIssue::Unavailable)
            .map(|cache| {
                cache
                    .keys()
                    .filter(|(cached_session, _)| *cached_session == session_id)
                    .count()
            })
    }
}

fn preflight_record(project_root: &Path, record: &AssetRecord) -> Result<(), AssetIssue> {
    let path = canonical_path(project_root, record)?;
    let link_metadata = std::fs::symlink_metadata(&path).map_err(|_| AssetIssue::Missing)?;
    if !is_regular(&link_metadata) {
        return Err(AssetIssue::NotRegularFile);
    }
    let file = open_read_only_no_follow(&path).map_err(|_| AssetIssue::Missing)?;
    let metadata = file.metadata().map_err(|_| AssetIssue::Unavailable)?;
    if !is_regular(&metadata) {
        return Err(AssetIssue::NotRegularFile);
    }
    if metadata.len() != record.size {
        return Err(AssetIssue::SizeMismatch);
    }
    Ok(())
}

fn verify_handle(path: &Path, record: &AssetRecord) -> Result<VerifiedAsset, AssetIssue> {
    let link_metadata = std::fs::symlink_metadata(path).map_err(|_| AssetIssue::Missing)?;
    if !is_regular(&link_metadata) {
        return Err(AssetIssue::NotRegularFile);
    }
    let mut file = open_read_only_no_follow(path).map_err(|_| AssetIssue::Missing)?;
    let metadata = file.metadata().map_err(|_| AssetIssue::Unavailable)?;
    if !is_regular(&metadata) {
        return Err(AssetIssue::NotRegularFile);
    }
    if metadata.len() != record.size {
        return Err(AssetIssue::SizeMismatch);
    }

    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| AssetIssue::Unavailable)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != record.sha256 {
        return Err(AssetIssue::DigestMismatch);
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|_| AssetIssue::Unavailable)?;
    Ok(VerifiedAsset {
        file: Mutex::new(file),
        media_type: record.media_type.clone(),
        len: record.size,
    })
}

fn canonical_path(project_root: &Path, record: &AssetRecord) -> Result<PathBuf, AssetIssue> {
    let digest = record.sha256.as_str();
    if digest.len() != 64
        || !digest
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(AssetIssue::NotFound);
    }
    let extension = match record.media_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/svg+xml" => "svg",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => return Err(AssetIssue::NotFound),
    };
    Ok(project_root
        .join("assets")
        .join("sha256")
        .join(&digest[..2])
        .join(format!("{digest}.{extension}")))
}

#[cfg(unix)]
fn is_regular(metadata: &Metadata) -> bool {
    metadata.file_type().is_file() && !metadata.file_type().is_symlink()
}

#[cfg(windows)]
fn is_regular(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) == 0
}

#[cfg(not(any(unix, windows)))]
fn is_regular(metadata: &Metadata) -> bool {
    metadata.is_file()
}

#[cfg(unix)]
fn open_read_only_no_follow(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32)
        .open(path)
}

#[cfg(windows)]
fn open_read_only_no_follow(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 1;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

#[cfg(not(any(unix, windows)))]
fn open_read_only_no_follow(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().read(true).open(path)
}
