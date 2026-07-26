use crate::AssetIoError;
use std::{
    fs::{self, File, Metadata, OpenOptions},
    path::Path,
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

pub(crate) struct BoundDirectory {
    file: File,
    identity: FileIdentity,
}

pub(crate) type BoundProjectRoot = BoundDirectory;

pub(crate) enum PublishFileOutcome {
    Published,
    Collision,
}

#[cfg(windows)]
const GENERIC_READ: u32 = 0x8000_0000;
#[cfg(windows)]
const GENERIC_WRITE: u32 = 0x4000_0000;
#[cfg(windows)]
const DELETE: u32 = 0x0001_0000;
#[cfg(windows)]
const SYNCHRONIZE: u32 = 0x0010_0000;
#[cfg(windows)]
const FILE_SHARE_READ: u32 = 0x1;
#[cfg(windows)]
const FILE_SHARE_WRITE: u32 = 0x2;
#[cfg(windows)]
const FILE_SHARE_DELETE: u32 = 0x4;
#[cfg(windows)]
const FILE_OPEN: u32 = 0x1;
#[cfg(windows)]
const FILE_CREATE: u32 = 0x2;
#[cfg(windows)]
const FILE_OPEN_IF: u32 = 0x3;
#[cfg(windows)]
const FILE_DIRECTORY_FILE: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_SYNCHRONOUS_IO_NONALERT: u32 = 0x0000_0020;
#[cfg(windows)]
const FILE_NON_DIRECTORY_FILE: u32 = 0x0000_0040;
#[cfg(windows)]
const FILE_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
#[cfg(windows)]
const OBJ_CASE_INSENSITIVE: u32 = 0x40;
#[cfg(windows)]
const STATUS_OBJECT_NAME_COLLISION: u32 = 0xc000_0035;
#[cfg(windows)]
const STATUS_NAME_TOO_LONG: u32 = 0xc000_0106;

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

impl BoundDirectory {
    pub(crate) fn bind(path: &Path) -> Result<Self, AssetIoError> {
        let before =
            fs::symlink_metadata(path).map_err(|_| AssetIoError::InvalidAssetImportRequest)?;
        let file =
            open_directory_no_follow(path).map_err(|_| AssetIoError::InvalidAssetImportRequest)?;
        if !is_directory(&before) {
            return Err(AssetIoError::InvalidAssetImportRequest);
        }
        let identity = directory_file_identity(&file)?;
        Ok(Self { file, identity })
    }

    pub(crate) fn child(&self, leaf: &str) -> Result<Self, AssetIoError> {
        validate_internal_leaf(leaf)?;
        self.verify_handle()?;
        #[cfg(windows)]
        {
            let file = nt_create_relative(
                &self.file,
                leaf,
                GENERIC_READ | GENERIC_WRITE | SYNCHRONIZE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                FILE_OPEN_IF,
                FILE_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT,
            )
            .map_err(|_| AssetIoError::IoFailed)?;
            let identity = directory_file_identity(&file).map_err(|_| AssetIoError::IoFailed)?;
            return Ok(Self { file, identity });
        }
        #[cfg(all(unix, not(target_os = "redox")))]
        {
            use rustix::fs::{Mode, OFlags, mkdirat, openat};
            match mkdirat(&self.file, leaf, Mode::RWXU) {
                Ok(()) => self.sync()?,
                Err(rustix::io::Errno::EXIST) => {}
                Err(_) => return Err(AssetIoError::IoFailed),
            }
            let descriptor = openat(
                &self.file,
                leaf,
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )
            .map_err(|_| AssetIoError::IoFailed)?;
            let file = File::from(descriptor);
            let identity = directory_file_identity(&file).map_err(|_| AssetIoError::IoFailed)?;
            return Ok(Self { file, identity });
        }
        #[cfg(not(any(windows, all(unix, not(target_os = "redox")))))]
        {
            let _ = leaf;
            Err(AssetIoError::IoFailed)
        }
    }

    pub(crate) fn sync(&self) -> Result<(), AssetIoError> {
        #[cfg(unix)]
        {
            return self.file.sync_all().map_err(|_| AssetIoError::IoFailed);
        }
        #[cfg(not(unix))]
        Ok(())
    }

    pub(crate) fn create_stage_file(&self, leaf: &str) -> std::io::Result<File> {
        validate_internal_leaf(leaf).map_err(|_| std::io::Error::other("invalid stage leaf"))?;
        #[cfg(windows)]
        {
            return match nt_create_relative(
                &self.file,
                leaf,
                GENERIC_READ | GENERIC_WRITE | DELETE | SYNCHRONIZE,
                FILE_SHARE_READ,
                FILE_CREATE,
                FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT,
            ) {
                Ok(file) => Ok(file),
                Err(status) if status as u32 == STATUS_OBJECT_NAME_COLLISION => {
                    Err(std::io::ErrorKind::AlreadyExists.into())
                }
                Err(_) => Err(std::io::Error::other("safe stage create failed")),
            };
        }
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            use rustix::fs::{Mode, OFlags, openat};
            let descriptor = openat(
                &self.file,
                ".",
                OFlags::RDWR | OFlags::TMPFILE | OFlags::CLOEXEC,
                Mode::RUSR | Mode::WUSR,
            )
            .map_err(std::io::Error::from)?;
            return Ok(File::from(descriptor));
        }
        #[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
        {
            let _ = leaf;
            Err(std::io::Error::other("safe anonymous stage unsupported"))
        }
    }

    pub(crate) fn open_child_file(
        &self,
        leaf: &str,
        protected_by_stage: bool,
    ) -> Result<File, AssetIoError> {
        validate_internal_leaf(leaf)?;
        self.verify_handle()?;
        #[cfg(windows)]
        {
            let share_mode = if protected_by_stage {
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
            } else {
                FILE_SHARE_READ
            };
            return nt_create_relative(
                &self.file,
                leaf,
                GENERIC_READ | SYNCHRONIZE,
                share_mode,
                FILE_OPEN,
                FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT,
            )
            .map_err(|_| AssetIoError::Collision);
        }
        #[cfg(all(unix, not(target_os = "redox")))]
        {
            use rustix::fs::{Mode, OFlags, openat};
            let _ = protected_by_stage;
            let descriptor = openat(
                &self.file,
                leaf,
                OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )
            .map_err(|_| AssetIoError::Collision)?;
            return Ok(File::from(descriptor));
        }
        #[cfg(not(any(windows, all(unix, not(target_os = "redox")))))]
        {
            let _ = protected_by_stage;
            Err(AssetIoError::IoFailed)
        }
    }

    pub(crate) fn publish_open_stage(
        &self,
        stage: &File,
        destination_leaf: &str,
    ) -> Result<PublishFileOutcome, AssetIoError> {
        validate_internal_leaf(destination_leaf)?;
        self.verify_handle()?;
        #[cfg(windows)]
        {
            return publish_open_stage_windows(&self.file, stage, destination_leaf);
        }
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            use rustix::fs::{AtFlags, linkat};
            return match linkat(stage, "", &self.file, destination_leaf, AtFlags::EMPTY_PATH) {
                Ok(()) => Ok(PublishFileOutcome::Published),
                Err(rustix::io::Errno::EXIST) => Ok(PublishFileOutcome::Collision),
                Err(_) => Err(AssetIoError::IoFailed),
            };
        }
        #[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
        Err(AssetIoError::IoFailed)
    }

    fn verify_handle(&self) -> Result<(), AssetIoError> {
        let current = directory_file_identity(&self.file)?;
        if current == self.identity {
            Ok(())
        } else {
            Err(AssetIoError::IoFailed)
        }
    }
}

pub(crate) fn regular_file_identity(file: &File) -> Result<FileIdentity, AssetIoError> {
    file_snapshot(file).map(|snapshot| snapshot.identity)
}

pub(crate) fn delete_open_stage(file: &File) {
    #[cfg(windows)]
    delete_open_stage_windows(file);
    #[cfg(not(windows))]
    let _ = file;
}

fn validate_internal_leaf(leaf: &str) -> Result<(), AssetIoError> {
    if leaf.is_empty()
        || matches!(leaf, "." | "..")
        || leaf
            .bytes()
            .any(|byte| byte == b'/' || byte == b'\\' || byte == 0 || byte.is_ascii_control())
    {
        Err(AssetIoError::IoFailed)
    } else {
        Ok(())
    }
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
    windows_attributes_are_regular_file(metadata.file_attributes())
}

#[cfg(windows)]
fn windows_attributes_are_regular_file(attributes: u32) -> bool {
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    attributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) == 0
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

#[cfg(all(test, windows))]
mod tests {
    use super::windows_attributes_are_regular_file;

    #[test]
    fn reparse_attributes_are_never_classified_as_regular_files() {
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
        assert!(!windows_attributes_are_regular_file(
            FILE_ATTRIBUTE_REPARSE_POINT
        ));
        assert!(!windows_attributes_are_regular_file(
            FILE_ATTRIBUTE_DIRECTORY
        ));
    }
}

#[cfg(windows)]
#[link(name = "Kernel32")]
unsafe extern "system" {
    fn SetFileInformationByHandle(
        file: *mut std::ffi::c_void,
        information_class: u32,
        information: *mut std::ffi::c_void,
        buffer_size: u32,
    ) -> i32;
    fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
}

#[cfg(windows)]
#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum_length: u16,
    buffer: *mut u16,
}

#[cfg(windows)]
#[repr(C)]
struct ObjectAttributes {
    length: u32,
    root_directory: *mut std::ffi::c_void,
    object_name: *mut UnicodeString,
    attributes: u32,
    security_descriptor: *mut std::ffi::c_void,
    security_quality_of_service: *mut std::ffi::c_void,
}

#[cfg(windows)]
#[repr(C)]
struct IoStatusBlock {
    status_or_pointer: isize,
    information: usize,
}

#[cfg(windows)]
#[repr(C)]
struct FileRenameInformation {
    replace_or_flags: u32,
    root_directory: *mut std::ffi::c_void,
    file_name_length: u32,
    file_name: [u16; 1],
}

#[cfg(windows)]
#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtSetInformationFile(
        file: *mut std::ffi::c_void,
        io_status_block: *mut IoStatusBlock,
        information: *mut std::ffi::c_void,
        buffer_size: u32,
        information_class: u32,
    ) -> i32;
    fn NtCreateFile(
        file: *mut *mut std::ffi::c_void,
        desired_access: u32,
        object_attributes: *mut ObjectAttributes,
        io_status_block: *mut IoStatusBlock,
        allocation_size: *mut i64,
        file_attributes: u32,
        share_access: u32,
        create_disposition: u32,
        create_options: u32,
        ea_buffer: *mut std::ffi::c_void,
        ea_length: u32,
    ) -> i32;
}

#[cfg(windows)]
fn nt_create_relative(
    parent: &File,
    leaf: &str,
    desired_access: u32,
    share_access: u32,
    create_disposition: u32,
    create_options: u32,
) -> Result<File, i32> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle};

    let mut name: Vec<u16> = leaf.encode_utf16().collect();
    let name_bytes = name
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .and_then(|length| u16::try_from(length).ok())
        .ok_or(STATUS_NAME_TOO_LONG as i32)?;
    let mut unicode_name = UnicodeString {
        length: name_bytes,
        maximum_length: name_bytes,
        buffer: name.as_mut_ptr(),
    };
    let mut attributes = ObjectAttributes {
        length: std::mem::size_of::<ObjectAttributes>() as u32,
        root_directory: parent.as_raw_handle(),
        object_name: &mut unicode_name,
        attributes: OBJ_CASE_INSENSITIVE,
        security_descriptor: std::ptr::null_mut(),
        security_quality_of_service: std::ptr::null_mut(),
    };
    let mut io_status = IoStatusBlock {
        status_or_pointer: 0,
        information: 0,
    };
    let mut handle = std::ptr::null_mut();
    // SAFETY: all native structures and the UTF-16 leaf remain live for the
    // call. RootDirectory is the held parent capability, and the returned
    // handle is converted to exactly one owning File on success.
    let status = unsafe {
        NtCreateFile(
            &mut handle,
            desired_access,
            &mut attributes,
            &mut io_status,
            std::ptr::null_mut(),
            0,
            share_access,
            create_disposition,
            create_options,
            std::ptr::null_mut(),
            0,
        )
    };
    if status < 0 {
        if !handle.is_null() {
            // SAFETY: a non-null failure output is not transferred to File.
            let _ = unsafe { CloseHandle(handle) };
        }
        return Err(status);
    }
    if handle.is_null() {
        return Err(STATUS_NAME_TOO_LONG as i32);
    }
    // SAFETY: NtCreateFile returned a unique live owned handle on success.
    Ok(unsafe { File::from_raw_handle(handle) })
}

#[cfg(windows)]
fn publish_open_stage_windows(
    destination_directory: &File,
    stage: &File,
    destination_leaf: &str,
) -> Result<PublishFileOutcome, AssetIoError> {
    use std::os::windows::io::AsRawHandle;

    const FILE_RENAME_INFORMATION_CLASS: u32 = 10;
    let name: Vec<u16> = destination_leaf.encode_utf16().collect();
    let root_offset = std::mem::offset_of!(FileRenameInformation, root_directory);
    let length_offset = std::mem::offset_of!(FileRenameInformation, file_name_length);
    let name_offset = std::mem::offset_of!(FileRenameInformation, file_name);
    let name_bytes = name
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .ok_or(AssetIoError::IoFailed)?;
    let name_length = u32::try_from(name_bytes).map_err(|_| AssetIoError::IoFailed)?;
    let buffer_length = name_offset
        .checked_add(name_bytes)
        .ok_or(AssetIoError::IoFailed)?;
    let mut information = vec![0_u8; buffer_length];
    let root = destination_directory.as_raw_handle() as usize;
    information[root_offset..root_offset + std::mem::size_of::<usize>()]
        .copy_from_slice(&root.to_ne_bytes());
    information[length_offset..length_offset + 4].copy_from_slice(&name_length.to_ne_bytes());
    for (index, value) in name.iter().enumerate() {
        let offset = name_offset + index * 2;
        information[offset..offset + 2].copy_from_slice(&value.to_ne_bytes());
    }

    let mut io_status = IoStatusBlock {
        status_or_pointer: 0,
        information: 0,
    };
    // SAFETY: `stage` is a live DELETE-capable handle, the destination root
    // handle stays live, and the FILE_RENAME_INFORMATION buffer uses native offsets.
    let status = unsafe {
        NtSetInformationFile(
            stage.as_raw_handle(),
            &mut io_status,
            information.as_mut_ptr().cast(),
            information.len() as u32,
            FILE_RENAME_INFORMATION_CLASS,
        )
    };
    if status >= 0 {
        return Ok(PublishFileOutcome::Published);
    }
    if status as u32 == STATUS_OBJECT_NAME_COLLISION {
        Ok(PublishFileOutcome::Collision)
    } else {
        Err(AssetIoError::IoFailed)
    }
}

#[cfg(windows)]
fn delete_open_stage_windows(stage: &File) {
    use std::os::windows::io::AsRawHandle;
    const FILE_DISPOSITION_INFO_CLASS: u32 = 4;
    let mut delete_file = 1_u8;
    // SAFETY: this targets the live owned stage handle itself; no pathname is
    // re-resolved, so a foreign replacement can never be selected for deletion.
    let _ = unsafe {
        SetFileInformationByHandle(
            stage.as_raw_handle(),
            FILE_DISPOSITION_INFO_CLASS,
            (&mut delete_file as *mut u8).cast(),
            1,
        )
    };
}
