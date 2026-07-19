use crate::ProjectIoError;
use crate::model::valid_timestamp;
use crate::paths::{BoundProjectDirectory, validate_project_extension, validate_project_structure};
use chrono::{SecondsFormat, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::fs::File;
#[cfg(unix)]
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use uuid::Uuid;

const LOCK_FILE_NAME: &str = ".aethertwin.lock";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LockMetadata {
    pid: u32,
    session_id: String,
    opened_at: String,
}

impl LockMetadata {
    fn new() -> Self {
        Self {
            pid: std::process::id(),
            session_id: Uuid::new_v4().hyphenated().to_string(),
            opened_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        }
    }

    fn is_valid(&self) -> bool {
        let Ok(session_id) = Uuid::parse_str(&self.session_id) else {
            return false;
        };
        self.pid > 0
            && session_id.get_version_num() == 4
            && matches!(session_id.get_variant(), uuid::Variant::RFC4122)
            && session_id.hyphenated().to_string() == self.session_id.to_ascii_lowercase()
            && valid_timestamp(&self.opened_at)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum LockIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows { volume: u64, id: [u8; 16] },
}

pub(crate) struct ProjectLock {
    directory: BoundProjectDirectory,
    file: Option<File>,
    identity: LockIdentity,
    stale_recovered: bool,
}

impl ProjectLock {
    pub(crate) fn acquire(path: &Path, recover_stale: bool) -> Result<Self, ProjectIoError> {
        validate_project_extension(path)?;
        let canonical = validate_project_structure(path)?;
        let directory = BoundProjectDirectory::open(canonical)?;
        lock_project_identity(&directory)?;
        let lock_path = directory.bound_path().join(LOCK_FILE_NAME);
        let (mut file, existed) = open_lock_file(&lock_path)?;
        if let Err(error) = file.try_lock_exclusive() {
            return if error.kind() == std::io::ErrorKind::WouldBlock {
                Err(ProjectIoError::ProjectLocked)
            } else {
                Err(ProjectIoError::FilesystemError)
            };
        }
        let identity = lock_identity(&file)?;

        if existed {
            let metadata_valid = read_metadata(&mut file)
                .ok()
                .is_some_and(|metadata| metadata.is_valid());
            if !recover_stale {
                let _ = FileExt::unlock(&file);
                return Err(ProjectIoError::StaleProjectLock);
            }
            if !metadata_valid {
                // Malformed crash residue still requires the explicit recovery path.
            }
        }
        write_metadata(&mut file, &LockMetadata::new())?;

        Ok(Self {
            directory,
            file: Some(file),
            identity,
            stale_recovered: existed,
        })
    }

    pub(crate) fn canonical_path(&self) -> &Path {
        self.directory.canonical_path()
    }

    pub(crate) fn bound_path(&self) -> &Path {
        self.directory.bound_path()
    }

    pub(crate) fn stale_recovered(&self) -> bool {
        self.stale_recovered
    }

    pub(crate) fn clean_close(&mut self) -> Result<(), ProjectIoError> {
        let file = self.file.as_ref().ok_or(ProjectIoError::FilesystemError)?;
        if lock_identity(file)? != self.identity {
            return Err(ProjectIoError::FilesystemError);
        }
        remove_locked_file(self.directory.bound_path(), file, &self.identity)?;
        let file = self.file.take().ok_or(ProjectIoError::FilesystemError)?;
        let _ = FileExt::unlock(&file);
        drop(file);
        Ok(())
    }
}

#[cfg(unix)]
fn lock_project_identity(directory: &BoundProjectDirectory) -> Result<(), ProjectIoError> {
    match directory.file().try_lock_exclusive() {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
            Err(ProjectIoError::ProjectLocked)
        }
        Err(_) => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(windows)]
fn lock_project_identity(_directory: &BoundProjectDirectory) -> Result<(), ProjectIoError> {
    // The exact child lock handle denies delete sharing, which also prevents parent replacement.
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn lock_project_identity(_directory: &BoundProjectDirectory) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

impl Drop for ProjectLock {
    fn drop(&mut self) {
        if let Some(file) = self.file.take() {
            let _ = FileExt::unlock(&file);
        }
    }
}

fn read_metadata(file: &mut File) -> Result<LockMetadata, ProjectIoError> {
    file.seek(SeekFrom::Start(0))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    serde_json::from_slice(&bytes).map_err(|_| ProjectIoError::StaleProjectLock)
}

fn write_metadata(file: &mut File, metadata: &LockMetadata) -> Result<(), ProjectIoError> {
    file.set_len(0)?;
    file.seek(SeekFrom::Start(0))?;
    serde_json::to_writer(&mut *file, metadata).map_err(|_| ProjectIoError::FilesystemError)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    Ok(())
}

#[cfg(unix)]
fn open_lock_file(path: &Path) -> Result<(File, bool), ProjectIoError> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create_new(true).mode(0o600);
    match options.open(path) {
        Ok(file) => Ok((file, false)),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let metadata = fs::symlink_metadata(path)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            let mut existing = OpenOptions::new();
            existing
                .read(true)
                .write(true)
                .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
            Ok((existing.open(path)?, true))
        }
        Err(_) => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(windows)]
fn open_lock_file(path: &Path) -> Result<(File, bool), ProjectIoError> {
    match open_windows_lock_file(path, true) {
        Ok(file) => Ok((file, false)),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            match open_windows_lock_file(path, false) {
                Ok(file) => Ok((file, true)),
                Err(error) if error.raw_os_error() == Some(32) => {
                    Err(ProjectIoError::ProjectLocked)
                }
                Err(_) => Err(ProjectIoError::InvalidProjectStructure),
            }
        }
        Err(_) => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(windows)]
fn open_windows_lock_file(path: &Path, create_new: bool) -> std::io::Result<File> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::FromRawHandle;

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn CreateFileW(
            name: *const u16,
            access: u32,
            share: u32,
            security: *mut c_void,
            disposition: u32,
            flags: u32,
            template: *mut c_void,
        ) -> *mut c_void;
    }
    const GENERIC_READ: u32 = 0x8000_0000;
    const GENERIC_WRITE: u32 = 0x4000_0000;
    const DELETE: u32 = 0x0001_0000;
    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;
    const CREATE_NEW: u32 = 1;
    const OPEN_EXISTING: u32 = 3;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: path is NUL-terminated and the optional pointers are allowed to be null.
    let handle = unsafe {
        CreateFileW(
            path.as_ptr(),
            GENERIC_READ | GENERIC_WRITE | DELETE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            if create_new {
                CREATE_NEW
            } else {
                OPEN_EXISTING
            },
            FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if handle as isize == -1 {
        return Err(std::io::Error::last_os_error());
    }
    // SAFETY: CreateFileW returned an owned handle.
    Ok(unsafe { File::from_raw_handle(handle) })
}

#[cfg(not(any(unix, windows)))]
fn open_lock_file(_path: &Path) -> Result<(File, bool), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(unix)]
fn lock_identity(file: &File) -> Result<LockIdentity, ProjectIoError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(LockIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn lock_identity(file: &File) -> Result<LockIdentity, ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct FileAttributeTagInfo {
        attributes: u32,
        reparse_tag: u32,
    }
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
            class: u32,
            information: *mut c_void,
            size: u32,
        ) -> i32;
    }
    const FILE_ATTRIBUTE_TAG_INFO_CLASS: u32 = 9;
    const FILE_ID_INFO_CLASS: u32 = 18;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    let mut attributes = FileAttributeTagInfo {
        attributes: 0,
        reparse_tag: 0,
    };
    // SAFETY: the handle is live and each output buffer has the declared fixed size.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FILE_ATTRIBUTE_TAG_INFO_CLASS,
            (&mut attributes as *mut FileAttributeTagInfo).cast(),
            std::mem::size_of::<FileAttributeTagInfo>() as u32,
        )
    } == 0
        || attributes.attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || attributes.attributes & FILE_ATTRIBUTE_DIRECTORY != 0
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    let mut identity = FileIdInfo {
        volume_serial_number: 0,
        file_id: FileId128 {
            identifier: [0; 16],
        },
    };
    // SAFETY: same as above.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FILE_ID_INFO_CLASS,
            (&mut identity as *mut FileIdInfo).cast(),
            std::mem::size_of::<FileIdInfo>() as u32,
        )
    } == 0
    {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(LockIdentity::Windows {
        volume: identity.volume_serial_number,
        id: identity.file_id.identifier,
    })
}

#[cfg(unix)]
fn remove_locked_file(
    directory: &Path,
    file: &File,
    expected: &LockIdentity,
) -> Result<(), ProjectIoError> {
    let path = directory.join(LOCK_FILE_NAME);
    let current = OpenOptions::new().read(true).open(&path)?;
    if lock_identity(file)? != *expected || lock_identity(&current)? != *expected {
        return Err(ProjectIoError::FilesystemError);
    }
    fs::remove_file(path)?;
    Ok(())
}

#[cfg(windows)]
fn remove_locked_file(
    _directory: &Path,
    file: &File,
    expected: &LockIdentity,
) -> Result<(), ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    #[repr(C)]
    struct FileDispositionInfo {
        delete_file: i32,
    }
    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn SetFileInformationByHandle(
            file: *mut c_void,
            class: u32,
            information: *mut c_void,
            size: u32,
        ) -> i32;
    }
    const FILE_DISPOSITION_INFO_CLASS: u32 = 4;
    if lock_identity(file)? != *expected {
        return Err(ProjectIoError::FilesystemError);
    }
    let mut information = FileDispositionInfo { delete_file: 1 };
    // SAFETY: the handle carries DELETE access and the fixed-size input is initialized.
    if unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FILE_DISPOSITION_INFO_CLASS,
            (&mut information as *mut FileDispositionInfo).cast(),
            std::mem::size_of::<FileDispositionInfo>() as u32,
        )
    } == 0
    {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn lock_identity(_file: &File) -> Result<LockIdentity, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(not(any(unix, windows)))]
fn remove_locked_file(
    _directory: &Path,
    _file: &File,
    _expected: &LockIdentity,
) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}
