use crate::AssetIoError;
use std::{
    fs::{self, File, Metadata, OpenOptions},
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum FileIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows { volume: u64, id: [u8; 16] },
    #[cfg(not(any(unix, windows)))]
    Unsupported,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FileSnapshot {
    identity: FileIdentity,
    size: u64,
    modified: ModifiedStamp,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ModifiedStamp {
    #[cfg(unix)]
    Unix { seconds: i64, nanoseconds: i64 },
    #[cfg(windows)]
    Windows(u64),
    #[cfg(not(any(unix, windows)))]
    Unsupported,
}

pub(crate) struct CapturedSource {
    snapshot: FileSnapshot,
}

pub(crate) struct OpenedSource {
    file: File,
    snapshot: FileSnapshot,
}

pub(crate) struct BoundProjectRoot {
    path: PathBuf,
    file: File,
    identity: FileIdentity,
}

impl CapturedSource {
    pub(crate) fn size(&self) -> u64 {
        self.snapshot.size
    }

    pub(crate) fn capture(path: &Path) -> Result<Self, AssetIoError> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => return Err(AssetIoError::IoFailed),
        };
        if !is_regular(&metadata) {
            return Err(AssetIoError::SourceNotRegularFile);
        }
        let file = open_capture_no_follow(path).map_err(|_| AssetIoError::IoFailed)?;
        Ok(Self {
            snapshot: file_snapshot(&file)?,
        })
    }

    pub(crate) fn open(self, path: &Path) -> Result<OpenedSource, AssetIoError> {
        let file = open_read_only_no_follow(path).map_err(|_| AssetIoError::SourceChanged)?;
        let snapshot = file_snapshot(&file).map_err(|_| AssetIoError::SourceChanged)?;
        if snapshot != self.snapshot {
            return Err(AssetIoError::SourceChanged);
        }
        Ok(OpenedSource { file, snapshot })
    }
}

impl OpenedSource {
    pub(crate) fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    pub(crate) fn verify_unchanged(&self) -> Result<(), AssetIoError> {
        let current = file_snapshot(&self.file).map_err(|_| AssetIoError::SourceChanged)?;
        if current == self.snapshot {
            Ok(())
        } else {
            Err(AssetIoError::SourceChanged)
        }
    }
}

impl BoundProjectRoot {
    pub(crate) fn bind(path: &Path) -> Result<Self, AssetIoError> {
        let before =
            fs::symlink_metadata(path).map_err(|_| AssetIoError::InvalidAssetImportRequest)?;
        let file =
            open_directory_no_follow(path).map_err(|_| AssetIoError::InvalidAssetImportRequest)?;
        if !is_directory(&before) {
            return Err(AssetIoError::InvalidAssetImportRequest);
        }
        let identity = directory_file_identity(&file)?;
        Ok(Self {
            path: path.to_path_buf(),
            file,
            identity,
        })
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn verify(&self) -> Result<(), AssetIoError> {
        let current = directory_file_identity(&self.file)?;
        if current == self.identity {
            Ok(())
        } else {
            Err(AssetIoError::IoFailed)
        }
    }
}

pub(crate) fn open_destination_no_follow(path: &Path) -> Result<File, AssetIoError> {
    open_read_only_no_follow(path).map_err(|_| AssetIoError::Collision)
}

pub(crate) fn regular_file_identity(file: &File) -> Result<FileIdentity, AssetIoError> {
    file_snapshot(file).map(|snapshot| snapshot.identity)
}

pub(crate) fn path_regular_file_identity(path: &Path) -> Result<FileIdentity, AssetIoError> {
    let file = open_capture_no_follow(path).map_err(|_| AssetIoError::IoFailed)?;
    file_snapshot(&file).map(|snapshot| snapshot.identity)
}

fn file_snapshot(file: &File) -> Result<FileSnapshot, AssetIoError> {
    let metadata = file.metadata().map_err(|_| AssetIoError::IoFailed)?;
    if !is_regular(&metadata) {
        return Err(AssetIoError::SourceNotRegularFile);
    }
    Ok(FileSnapshot {
        identity: file_identity(file)?,
        size: metadata.len(),
        modified: modified_stamp(&metadata),
    })
}

fn directory_file_identity(file: &File) -> Result<FileIdentity, AssetIoError> {
    let metadata = file.metadata().map_err(|_| AssetIoError::IoFailed)?;
    if !is_directory(&metadata) {
        return Err(AssetIoError::InvalidAssetImportRequest);
    }
    file_identity(file)
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
fn is_directory(metadata: &Metadata) -> bool {
    metadata.file_type().is_dir() && !metadata.file_type().is_symlink()
}

#[cfg(windows)]
fn is_directory(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_DIRECTORY != 0
        && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

#[cfg(not(any(unix, windows)))]
fn is_directory(metadata: &Metadata) -> bool {
    metadata.is_dir()
}

#[cfg(unix)]
fn file_identity(file: &File) -> Result<FileIdentity, AssetIoError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata().map_err(|_| AssetIoError::IoFailed)?;
    Ok(FileIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn file_identity(file: &File) -> Result<FileIdentity, AssetIoError> {
    use std::{ffi::c_void, os::windows::io::AsRawHandle};

    #[repr(C)]
    struct FileId128 {
        identifier: [u8; 16],
    }
    #[repr(C)]
    struct FileIdInfo {
        volume_serial_number: u64,
        file_id: FileId128,
    }
    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandleEx(
            file: *mut c_void,
            information_class: u32,
            information: *mut c_void,
            buffer_size: u32,
        ) -> i32;
    }
    const FILE_ID_INFO_CLASS: u32 = 18;
    let mut information = FileIdInfo {
        volume_serial_number: 0,
        file_id: FileId128 {
            identifier: [0; 16],
        },
    };
    // SAFETY: the file handle is live and the fixed-size output buffer is writable.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FILE_ID_INFO_CLASS,
            (&mut information as *mut FileIdInfo).cast(),
            std::mem::size_of::<FileIdInfo>() as u32,
        )
    } == 0
    {
        return Err(AssetIoError::IoFailed);
    }
    Ok(FileIdentity::Windows {
        volume: information.volume_serial_number,
        id: information.file_id.identifier,
    })
}

#[cfg(not(any(unix, windows)))]
fn file_identity(_: &File) -> Result<FileIdentity, AssetIoError> {
    Err(AssetIoError::IoFailed)
}

#[cfg(unix)]
fn modified_stamp(metadata: &Metadata) -> ModifiedStamp {
    use std::os::unix::fs::MetadataExt;
    ModifiedStamp::Unix {
        seconds: metadata.mtime(),
        nanoseconds: metadata.mtime_nsec(),
    }
}

#[cfg(unix)]
fn open_capture_no_follow(path: &Path) -> std::io::Result<File> {
    open_read_only_no_follow(path)
}

#[cfg(windows)]
fn open_capture_no_follow(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;
    const FILE_SHARE_DELETE: u32 = 4;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

#[cfg(not(any(unix, windows)))]
fn open_capture_no_follow(path: &Path) -> std::io::Result<File> {
    open_read_only_no_follow(path)
}

#[cfg(windows)]
fn modified_stamp(metadata: &Metadata) -> ModifiedStamp {
    use std::os::windows::fs::MetadataExt;
    ModifiedStamp::Windows(metadata.last_write_time())
}

#[cfg(not(any(unix, windows)))]
fn modified_stamp(_: &Metadata) -> ModifiedStamp {
    ModifiedStamp::Unsupported
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
fn open_read_only_no_follow(_: &Path) -> std::io::Result<File> {
    Err(std::io::Error::other("unsupported platform"))
}

#[cfg(unix)]
fn open_directory_no_follow(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .custom_flags((rustix::fs::OFlags::NOFOLLOW | rustix::fs::OFlags::DIRECTORY).bits() as i32)
        .open(path)
}

#[cfg(windows)]
fn open_directory_no_follow(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

#[cfg(not(any(unix, windows)))]
fn open_directory_no_follow(_: &Path) -> std::io::Result<File> {
    Err(std::io::Error::other("unsupported platform"))
}
