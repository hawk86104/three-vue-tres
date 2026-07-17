use crate::ProjectIoError;
use remove_dir_all::RemoveDir;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) const PROJECT_SUFFIX: &str = ".twinproj";

const WINDOWS_RESERVED_NAMES: [&str; 30] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "CONIN$",
    "CONOUT$", "COM¹", "COM²", "COM³", "LPT¹", "LPT²", "LPT³",
];

pub(crate) fn normalize_project_name(value: &str) -> Result<String, ProjectIoError> {
    let name = strip_suffix_ascii_case(value).unwrap_or(value);
    if strip_suffix_ascii_case(name).is_some()
        || name.is_empty()
        || name.trim() != name
        || name.chars().count() > 80
        || matches!(name, "." | "..")
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|character| character.is_control() || "\\/:*?\"<>|".contains(character))
    {
        return Err(ProjectIoError::InvalidProjectName);
    }
    let stem = name.split('.').next().unwrap_or(name).to_uppercase();
    if WINDOWS_RESERVED_NAMES.contains(&stem.as_str()) {
        return Err(ProjectIoError::InvalidProjectName);
    }
    Ok(name.to_owned())
}

pub(crate) fn validate_project_extension(path: &Path) -> Result<(), ProjectIoError> {
    let valid = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(strip_suffix_ascii_case)
        .is_some_and(|base| !base.is_empty() && strip_suffix_ascii_case(base).is_none());
    if !valid {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(())
}

fn strip_suffix_ascii_case(value: &str) -> Option<&str> {
    let split = value.len().checked_sub(PROJECT_SUFFIX.len())?;
    value.as_bytes()[split..]
        .eq_ignore_ascii_case(PROJECT_SUFFIX.as_bytes())
        .then(|| &value[..split])
}

pub fn validate_relative_resource_path(value: &str) -> Result<(), ProjectIoError> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains('\\')
        || value.as_bytes().get(1) == Some(&b':')
        || value.split('/').any(|segment| segment == "..")
    {
        return Err(ProjectIoError::InvalidResourcePath);
    }
    Ok(())
}

pub(crate) fn canonical_parent(parent: &Path) -> Result<PathBuf, ProjectIoError> {
    let canonical = parent
        .canonicalize()
        .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    if !canonical.is_dir() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(canonical)
}

pub(crate) fn validate_project_structure(path: &Path) -> Result<PathBuf, ProjectIoError> {
    let canonical = path
        .canonicalize()
        .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    if !canonical.is_dir() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }

    for (entry, directory) in [
        ("manifest.json", false),
        ("project.db", false),
        ("assets", true),
        ("thumbnails", true),
        ("derived", true),
        ("exports", true),
    ] {
        let candidate = canonical.join(entry);
        let metadata = candidate
            .symlink_metadata()
            .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
        if metadata.file_type().is_symlink()
            || (directory && !metadata.is_dir())
            || (!directory && !metadata.is_file())
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let resolved = candidate
            .canonicalize()
            .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
        if !resolved.starts_with(&canonical) || resolved.parent() != Some(canonical.as_path()) {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    Ok(canonical)
}

pub(crate) struct StagingWorkspace {
    parent_path: PathBuf,
    parent_file: Option<File>,
    container_path: PathBuf,
    container_file: Option<File>,
    container_identity: StagingIdentity,
    #[cfg(test)]
    payload_path: PathBuf,
    payload_leaf: OsString,
    payload_file: Option<File>,
    payload_identity: FileIdentity,
    bound_project_path: PathBuf,
}

impl StagingWorkspace {
    pub(crate) fn create(parent: &Path, name: &str) -> Result<Self, ProjectIoError> {
        ensure_bound_staging_supported()?;
        let parent_file = open_directory(parent)?;
        let container_leaf = OsString::from(format!(
            ".{name}{PROJECT_SUFFIX}.staging-{}",
            Uuid::new_v4()
        ));
        let container_path = parent.join(&container_leaf);
        let container_options = private_directory_options();
        let created_container = container_options
            .mkdir_at(&parent_file, &container_leaf)
            .map_err(|_| ProjectIoError::FilesystemError)?;
        let created_container_identity = file_identity(&created_container)?;
        let mut cleanup = PendingContainerCleanup {
            parent: parent.to_owned(),
            path: container_path.clone(),
            identity: Some(StagingIdentity {
                leaf: container_leaf.clone(),
                file: created_container_identity,
            }),
            armed: true,
        };
        run_before_bind_test_hook(&container_path);
        let container_file = bind_created_directory(&container_path, created_container)?;
        let container_file_identity = file_identity(&container_file)?;
        cleanup.identity = Some(StagingIdentity {
            leaf: container_leaf.clone(),
            file: container_file_identity.clone(),
        });

        let payload_leaf = OsString::from("payload");
        let payload_path = container_path.join(&payload_leaf);
        let payload_options = private_directory_options();
        let created_payload = payload_options
            .mkdir_at(&container_file, &payload_leaf)
            .map_err(|_| ProjectIoError::FilesystemError)?;
        run_before_bind_test_hook(&payload_path);
        let payload_file = bind_created_directory(&payload_path, created_payload)?;
        let payload_identity = file_identity(&payload_file)?;
        let bound_project_path = bound_directory_path(&payload_file, &payload_path)?;
        let container_identity = StagingIdentity {
            leaf: container_leaf.clone(),
            file: container_file_identity,
        };

        let workspace = Self {
            parent_path: parent.to_owned(),
            parent_file: Some(parent_file),
            container_path,
            container_file: Some(container_file),
            container_identity,
            #[cfg(test)]
            payload_path,
            payload_leaf,
            payload_file: Some(payload_file),
            payload_identity,
            bound_project_path,
        };
        cleanup.armed = false;
        Ok(workspace)
    }

    pub(crate) fn bound_project_path(&self) -> &Path {
        &self.bound_project_path
    }

    pub(crate) fn publish(&mut self, destination: &Path) -> Result<(), ProjectIoError> {
        if destination.parent() != Some(self.parent_path.as_path()) {
            return Err(ProjectIoError::FilesystemError);
        }
        let destination_leaf = destination
            .file_name()
            .ok_or(ProjectIoError::FilesystemError)?;
        let parent_file = self
            .parent_file
            .as_ref()
            .ok_or(ProjectIoError::FilesystemError)?;
        let container_file = self
            .container_file
            .as_ref()
            .ok_or(ProjectIoError::FilesystemError)?;
        let payload_file = self
            .payload_file
            .as_ref()
            .ok_or(ProjectIoError::FilesystemError)?;
        if file_identity(payload_file)? != self.payload_identity {
            return Err(ProjectIoError::FilesystemError);
        }
        publish_bound_directory(
            container_file,
            &self.payload_leaf,
            payload_file,
            parent_file,
            destination,
            destination_leaf,
            &self.payload_identity,
        )
    }

    #[cfg(test)]
    fn visible_payload_path(&self) -> &Path {
        &self.payload_path
    }

    #[cfg(test)]
    fn visible_container_path(&self) -> &Path {
        &self.container_path
    }
}

struct PendingContainerCleanup {
    parent: PathBuf,
    path: PathBuf,
    identity: Option<StagingIdentity>,
    armed: bool,
}

impl Drop for PendingContainerCleanup {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        if let Some(identity) = &self.identity {
            cleanup_verified_staging(&self.parent, &self.path, identity);
        }
    }
}

#[cfg(test)]
thread_local! {
    static BEFORE_BIND_TEST_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce(&Path)>>> =
        std::cell::RefCell::new(None);
}

#[cfg(test)]
fn set_before_bind_test_hook(hook: impl FnOnce(&Path) + 'static) {
    BEFORE_BIND_TEST_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
}

#[cfg(test)]
fn run_before_bind_test_hook(path: &Path) {
    BEFORE_BIND_TEST_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook(path);
        }
    });
}

#[cfg(not(test))]
fn run_before_bind_test_hook(_path: &Path) {}

fn private_directory_options() -> fs_at::OpenOptions {
    let mut options = fs_at::OpenOptions::default();
    #[cfg(unix)]
    {
        use fs_at::os::unix::OpenOptionsExt;
        options.mode(0o700);
    }
    #[cfg(windows)]
    {
        let _ = &mut options;
    }
    options
}

impl Drop for StagingWorkspace {
    fn drop(&mut self) {
        self.payload_file.take();
        self.container_file.take();
        self.parent_file.take();
        cleanup_verified_staging(
            &self.parent_path,
            &self.container_path,
            &self.container_identity,
        );
    }
}

#[cfg(any(windows, target_os = "linux", target_os = "android"))]
fn ensure_bound_staging_supported() -> Result<(), ProjectIoError> {
    Ok(())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn ensure_bound_staging_supported() -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(windows)]
fn bind_created_directory(path: &Path, created: File) -> Result<File, ProjectIoError> {
    let created_identity = file_identity(&created)?;
    let bridge = open_identity_directory(path)?;
    if file_identity(&bridge)? != created_identity {
        return Err(ProjectIoError::FilesystemError);
    }
    drop(created);
    let locked = open_locked_directory(path)?;
    if file_identity(&locked)? != file_identity(&bridge)? {
        return Err(ProjectIoError::FilesystemError);
    }
    drop(bridge);
    Ok(locked)
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn bind_created_directory(_path: &Path, created: File) -> Result<File, ProjectIoError> {
    Ok(created)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn bind_created_directory(_path: &Path, _created: File) -> Result<File, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(windows)]
fn bound_directory_path(_file: &File, visible: &Path) -> Result<PathBuf, ProjectIoError> {
    Ok(visible.to_owned())
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn bound_directory_path(file: &File, _visible: &Path) -> Result<PathBuf, ProjectIoError> {
    use std::os::fd::AsRawFd;
    let bound = PathBuf::from(format!("/proc/self/fd/{}", file.as_raw_fd()));
    if !bound.is_dir() {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(bound)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn bound_directory_path(_file: &File, _visible: &Path) -> Result<PathBuf, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn publish_bound_directory(
    container_file: &File,
    payload_leaf: &OsStr,
    _payload_file: &File,
    parent_file: &File,
    _destination: &Path,
    destination_leaf: &OsStr,
    expected: &FileIdentity,
) -> Result<(), ProjectIoError> {
    use rustix::fs::{RenameFlags, renameat_with};
    let current = open_child_directory(container_file, payload_leaf)?;
    if file_identity(&current)? != *expected {
        return Err(ProjectIoError::FilesystemError);
    }
    match renameat_with(
        container_file,
        payload_leaf,
        parent_file,
        destination_leaf,
        RenameFlags::NOREPLACE,
    ) {
        Ok(()) => Ok(()),
        Err(rustix::io::Errno::EXIST) => Err(ProjectIoError::ProjectAlreadyExists),
        Err(_) => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(windows)]
fn publish_bound_directory(
    _container_file: &File,
    _payload_leaf: &OsStr,
    payload_file: &File,
    parent_file: &File,
    _destination: &Path,
    destination_leaf: &OsStr,
    _expected: &FileIdentity,
) -> Result<(), ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct FileRenameInfo {
        replace_if_exists: u32,
        root_directory: *mut c_void,
        file_name_length: u32,
        file_name: [u16; 1],
    }

    #[repr(C)]
    struct IoStatusBlock {
        status_or_pointer: *mut c_void,
        information: usize,
    }

    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn NtSetInformationFile(
            file: *mut c_void,
            io_status: *mut IoStatusBlock,
            information: *mut c_void,
            buffer_size: u32,
            information_class: u32,
        ) -> i32;
    }

    const FILE_RENAME_INFORMATION_CLASS: u32 = 10;
    let file_name: Vec<u16> = destination_leaf.encode_wide().collect();
    let file_name_bytes = file_name
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .ok_or(ProjectIoError::FilesystemError)?;
    let file_name_offset = std::mem::offset_of!(FileRenameInfo, file_name);
    let buffer_size = std::mem::size_of::<FileRenameInfo>()
        .checked_add(file_name_bytes)
        .ok_or(ProjectIoError::FilesystemError)?;
    let mut storage = vec![0_u64; buffer_size.div_ceil(std::mem::size_of::<u64>())];
    let information = storage.as_mut_ptr().cast::<FileRenameInfo>();
    // SAFETY: storage is aligned and sized for the fixed fields plus the UTF-16 leaf name.
    unsafe {
        (*information).replace_if_exists = 0;
        (*information).root_directory = parent_file.as_raw_handle();
        (*information).file_name_length =
            u32::try_from(file_name_bytes).map_err(|_| ProjectIoError::FilesystemError)?;
        std::ptr::copy_nonoverlapping(
            file_name.as_ptr(),
            storage
                .as_mut_ptr()
                .cast::<u8>()
                .add(file_name_offset)
                .cast(),
            file_name.len(),
        );
    }
    let buffer_size = u32::try_from(buffer_size).map_err(|_| ProjectIoError::FilesystemError)?;
    let mut io_status = IoStatusBlock {
        status_or_pointer: std::ptr::null_mut(),
        information: 0,
    };
    // SAFETY: both directory handles are live, and the ABI buffer is fully initialized.
    let status = unsafe {
        NtSetInformationFile(
            payload_file.as_raw_handle(),
            &mut io_status,
            information.cast(),
            buffer_size,
            FILE_RENAME_INFORMATION_CLASS,
        )
    };
    if status >= 0 {
        return Ok(());
    }
    let mut collision_options = fs_at::OpenOptions::default();
    collision_options.read(true);
    let destination_exists = collision_options
        .open_dir_at(parent_file, Path::new(destination_leaf))
        .is_ok()
        || collision_options
            .open_at(parent_file, Path::new(destination_leaf))
            .is_ok();
    if destination_exists {
        Err(ProjectIoError::ProjectAlreadyExists)
    } else {
        Err(ProjectIoError::FilesystemError)
    }
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn publish_bound_directory(
    _container_file: &File,
    _payload_leaf: &OsStr,
    _payload_file: &File,
    _parent_file: &File,
    _destination: &Path,
    _destination_leaf: &OsStr,
    _expected: &FileIdentity,
) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(windows)]
fn open_locked_directory(path: &Path) -> Result<File, ProjectIoError> {
    open_windows_directory(path, true)
}

#[cfg(windows)]
fn open_identity_directory(path: &Path) -> Result<File, ProjectIoError> {
    open_windows_directory(path, false)
}

#[cfg(windows)]
fn open_windows_directory(path: &Path, lock_delete: bool) -> Result<File, ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::FromRawHandle;

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn CreateFileW(
            file_name: *const u16,
            desired_access: u32,
            share_mode: u32,
            security_attributes: *mut c_void,
            creation_disposition: u32,
            flags_and_attributes: u32,
            template_file: *mut c_void,
        ) -> *mut c_void;
    }

    const DELETE_ACCESS: u32 = 0x0001_0000;
    const FILE_READ_ATTRIBUTES: u32 = 0x80;
    const SYNCHRONIZE: u32 = 0x0010_0000;
    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_SHARE_WRITE: u32 = 0x2;
    const FILE_SHARE_DELETE: u32 = 0x4;
    const OPEN_EXISTING: u32 = 3;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: the path is NUL-terminated; null optional pointers are allowed by CreateFileW.
    let handle = unsafe {
        CreateFileW(
            path.as_ptr(),
            FILE_READ_ATTRIBUTES | SYNCHRONIZE | if lock_delete { DELETE_ACCESS } else { 0 },
            FILE_SHARE_READ | FILE_SHARE_WRITE | if lock_delete { 0 } else { FILE_SHARE_DELETE },
            std::ptr::null_mut(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if handle as isize == -1 {
        return Err(ProjectIoError::FilesystemError);
    }
    // SAFETY: CreateFileW returned an owned valid handle, transferred to File.
    let file = unsafe { File::from_raw_handle(handle) };
    validate_windows_directory(&file)?;
    file_identity(&file)?;
    Ok(file)
}

#[cfg(windows)]
fn validate_windows_directory(file: &File) -> Result<(), ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct FileAttributeTagInfo {
        attributes: u32,
        reparse_tag: u32,
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

    const FILE_ATTRIBUTE_TAG_INFO_CLASS: u32 = 9;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    let mut information = FileAttributeTagInfo {
        attributes: 0,
        reparse_tag: 0,
    };
    // SAFETY: the handle is live and the fixed-size output buffer is writable.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FILE_ATTRIBUTE_TAG_INFO_CLASS,
            (&mut information as *mut FileAttributeTagInfo).cast(),
            u32::try_from(std::mem::size_of::<FileAttributeTagInfo>())
                .map_err(|_| ProjectIoError::FilesystemError)?,
        )
    } == 0
        || information.attributes & FILE_ATTRIBUTE_DIRECTORY == 0
        || information.attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StagingIdentity {
    leaf: OsString,
    file: FileIdentity,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum FileIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows { volume: u32, index: u64 },
    #[cfg(not(any(unix, windows)))]
    Unsupported,
}

#[cfg(test)]
pub(crate) fn staging_identity(staging: &Path) -> Result<StagingIdentity, ProjectIoError> {
    let parent = staging.parent().ok_or(ProjectIoError::FilesystemError)?;
    let leaf = staging
        .file_name()
        .ok_or(ProjectIoError::FilesystemError)?
        .to_owned();
    let parent_file = open_directory(parent)?;
    let staging_file = open_child_directory(&parent_file, &leaf)?;
    Ok(StagingIdentity {
        leaf,
        file: file_identity(&staging_file)?,
    })
}

pub(crate) fn cleanup_verified_staging(parent: &Path, staging: &Path, expected: &StagingIdentity) {
    let Some(leaf) = staging.file_name() else {
        return;
    };
    if staging.parent() != Some(parent) || leaf != expected.leaf {
        return;
    }

    let Ok(parent_file) = open_directory(parent) else {
        return;
    };
    let quarantine = OsString::from(format!(".aethertwin-cleanup-{}", Uuid::new_v4()));
    if rename_child_no_replace(&parent_file, parent, leaf, &quarantine).is_err() {
        return;
    }

    let Ok(mut staging_file) = open_child_directory(&parent_file, &quarantine) else {
        let _ = rename_child_no_replace(&parent_file, parent, &quarantine, leaf);
        return;
    };
    let Ok(actual) = file_identity(&staging_file) else {
        let _ = rename_child_no_replace(&parent_file, parent, &quarantine, leaf);
        return;
    };
    if actual != expected.file {
        drop(staging_file);
        let _ = rename_child_no_replace(&parent_file, parent, &quarantine, leaf);
        return;
    }

    let debug_path = parent.join(&quarantine);
    if staging_file.remove_dir_contents(Some(&debug_path)).is_err() {
        return;
    }
    drop(staging_file);
    let _ = fs_at::OpenOptions::default().rmdir_at(&parent_file, &quarantine);
}

#[cfg(test)]
pub(crate) fn rename_no_replace(source: &Path, destination: &Path) -> Result<(), ProjectIoError> {
    rename_no_replace_platform(source, destination)
}

#[cfg(windows)]
fn rename_no_replace_platform(source: &Path, destination: &Path) -> Result<(), ProjectIoError> {
    use std::os::windows::ffi::OsStrExt;

    const ERROR_FILE_EXISTS: i32 = 80;
    const ERROR_ALREADY_EXISTS: i32 = 183;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: both path buffers are NUL-terminated and live through the call.
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    } != 0
    {
        return Ok(());
    }
    match std::io::Error::last_os_error().raw_os_error() {
        Some(ERROR_FILE_EXISTS | ERROR_ALREADY_EXISTS) => Err(ProjectIoError::ProjectAlreadyExists),
        _ => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(any(
    target_os = "linux",
    target_os = "android",
    target_vendor = "apple",
    target_os = "redox"
))]
fn rename_no_replace_platform(source: &Path, destination: &Path) -> Result<(), ProjectIoError> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};
    match renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE) {
        Ok(()) => Ok(()),
        Err(rustix::io::Errno::EXIST) => Err(ProjectIoError::ProjectAlreadyExists),
        Err(_) => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(not(any(
    windows,
    target_os = "linux",
    target_os = "android",
    target_vendor = "apple",
    target_os = "redox"
)))]
fn rename_no_replace_platform(_source: &Path, _destination: &Path) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

fn rename_child_no_replace(
    parent_file: &File,
    parent: &Path,
    source: &OsStr,
    destination: &OsStr,
) -> Result<(), ProjectIoError> {
    #[cfg(any(
        target_os = "linux",
        target_os = "android",
        target_vendor = "apple",
        target_os = "redox"
    ))]
    {
        use rustix::fs::{RenameFlags, renameat_with};
        return match renameat_with(
            parent_file,
            source,
            parent_file,
            destination,
            RenameFlags::NOREPLACE,
        ) {
            Ok(()) => Ok(()),
            Err(rustix::io::Errno::EXIST) => Err(ProjectIoError::ProjectAlreadyExists),
            Err(_) => Err(ProjectIoError::FilesystemError),
        };
    }
    #[cfg(not(any(
        target_os = "linux",
        target_os = "android",
        target_vendor = "apple",
        target_os = "redox"
    )))]
    {
        let _ = parent_file;
        rename_no_replace_platform(&parent.join(source), &parent.join(destination))
    }
}

fn open_child_directory(parent: &File, leaf: &OsStr) -> Result<File, ProjectIoError> {
    let mut options = fs_at::OpenOptions::default();
    options.read(true);
    let file = options
        .open_dir_at(parent, Path::new(leaf))
        .map_err(|_| ProjectIoError::FilesystemError)?;
    file_identity(&file)?;
    Ok(file)
}

#[cfg(unix)]
fn open_directory(path: &Path) -> Result<File, ProjectIoError> {
    File::open(path).map_err(ProjectIoError::from)
}

#[cfg(windows)]
fn open_directory(path: &Path) -> Result<File, ProjectIoError> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x02000000;
    fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)
        .map_err(ProjectIoError::from)
}

#[cfg(not(any(unix, windows)))]
fn open_directory(_path: &Path) -> Result<File, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(unix)]
fn file_identity(file: &File) -> Result<FileIdentity, ProjectIoError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    if !metadata.is_dir() {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(FileIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn file_identity(file: &File) -> Result<FileIdentity, ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct IoStatusBlock {
        status_or_pointer: *mut c_void,
        information: usize,
    }

    #[repr(C)]
    struct FileInternalInformation {
        index_number: i64,
    }

    #[link(name = "ntdll")]
    unsafe extern "system" {
        fn NtQueryInformationFile(
            file: *mut c_void,
            io_status: *mut IoStatusBlock,
            information: *mut c_void,
            length: u32,
            information_class: u32,
        ) -> i32;
    }

    const FILE_INTERNAL_INFORMATION_CLASS: u32 = 6;
    let mut io_status = IoStatusBlock {
        status_or_pointer: std::ptr::null_mut(),
        information: 0,
    };
    let mut information = FileInternalInformation { index_number: 0 };
    // SAFETY: the handle is live and both output structures point to valid writable storage.
    let status = unsafe {
        NtQueryInformationFile(
            file.as_raw_handle(),
            &mut io_status,
            (&mut information as *mut FileInternalInformation).cast(),
            u32::try_from(std::mem::size_of::<FileInternalInformation>())
                .map_err(|_| ProjectIoError::FilesystemError)?,
            FILE_INTERNAL_INFORMATION_CLASS,
        )
    };
    if status < 0 {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(FileIdentity::Windows {
        volume: 0,
        index: information.index_number as u64,
    })
}

#[cfg(not(any(unix, windows)))]
fn file_identity(_file: &File) -> Result<FileIdentity, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(test)]
mod tests {
    use super::{
        StagingWorkspace, cleanup_verified_staging, rename_no_replace, set_before_bind_test_hook,
        staging_identity,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn atomic_rename_never_replaces_an_existing_empty_directory() {
        let root = tempdir().unwrap();
        let source = root.path().join("source");
        let destination = root.path().join("destination");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("marker"), b"source").unwrap();
        fs::create_dir(&destination).unwrap();

        let error = rename_no_replace(&source, &destination).unwrap_err();
        assert_eq!(error.code(), "PROJECT_ALREADY_EXISTS");
        assert_eq!(fs::read(source.join("marker")).unwrap(), b"source");
        assert_eq!(fs::read_dir(destination).unwrap().count(), 0);
    }

    #[test]
    fn cleanup_requires_the_exact_generated_leaf_and_identity() {
        let root = tempdir().unwrap();
        let staging = root.path().join("Demo.twinproj.staging-exact");
        let sibling = root.path().join("Demo.twinproj.staging-exact-sibling");
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("ours"), b"ours").unwrap();
        fs::create_dir(&sibling).unwrap();
        fs::write(sibling.join("theirs"), b"theirs").unwrap();
        let identity = staging_identity(&staging).unwrap();

        cleanup_verified_staging(root.path(), &sibling, &identity);
        assert!(sibling.join("theirs").exists());
        cleanup_verified_staging(root.path(), &staging, &identity);
        assert!(!staging.exists());
    }

    #[test]
    fn cleanup_preserves_a_replacement_directory_with_a_different_identity() {
        let root = tempdir().unwrap();
        let staging = root.path().join("Demo.twinproj.staging-replaced");
        let original = root.path().join("original");
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("ours"), b"ours").unwrap();
        let identity = staging_identity(&staging).unwrap();
        fs::rename(&staging, &original).unwrap();
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("theirs"), b"theirs").unwrap();

        cleanup_verified_staging(root.path(), &staging, &identity);
        assert_eq!(fs::read(staging.join("theirs")).unwrap(), b"theirs");
        assert_eq!(fs::read(original.join("ours")).unwrap(), b"ours");
    }

    #[test]
    fn staging_writes_and_publication_stay_bound_to_the_captured_payload() {
        let root = tempdir().unwrap();
        let mut workspace = StagingWorkspace::create(root.path(), "Bound").unwrap();
        let visible_payload = workspace.visible_payload_path().to_owned();
        let preserved = workspace.visible_container_path().join("preserved");
        let replacement_succeeded = fs::rename(&visible_payload, &preserved).is_ok();

        if replacement_succeeded {
            fs::create_dir(&visible_payload).unwrap();
            fs::write(visible_payload.join("replacement"), b"theirs").unwrap();
        }
        fs::write(workspace.bound_project_path().join("marker"), b"ours").unwrap();

        let destination = root.path().join("Bound.twinproj");
        if replacement_succeeded {
            assert_eq!(fs::read(preserved.join("marker")).unwrap(), b"ours");
            assert!(!visible_payload.join("marker").exists());
            assert!(workspace.publish(&destination).is_err());
            assert!(!destination.exists());
        } else {
            fs::create_dir(&destination).unwrap();
            let collision = workspace.publish(&destination).unwrap_err();
            assert_eq!(collision.code(), "PROJECT_ALREADY_EXISTS");
            fs::remove_dir(&destination).unwrap();
            workspace.publish(&destination).unwrap();
            assert_eq!(fs::read(destination.join("marker")).unwrap(), b"ours");
        }
    }

    #[cfg(windows)]
    #[test]
    fn staging_rejects_a_replacement_between_create_and_locked_bind() {
        let root = tempdir().unwrap();
        let preserved = root.path().join("preserved-created-container");
        let preserved_for_hook = preserved.clone();
        set_before_bind_test_hook(move |created| {
            fs::rename(created, &preserved_for_hook).unwrap();
            fs::create_dir(created).unwrap();
            fs::write(created.join("replacement"), b"theirs").unwrap();
        });

        let error = StagingWorkspace::create(root.path(), "Bind Race")
            .err()
            .unwrap();
        assert_eq!(error.code(), "FILESYSTEM_ERROR");
        let replacement = fs::read_dir(root.path())
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| path.join("replacement").exists())
            .unwrap();
        assert_eq!(
            fs::read(replacement.join("replacement")).unwrap(),
            b"theirs"
        );
        assert!(!root.path().join("Bind Race.twinproj").exists());
    }

    #[cfg(unix)]
    #[test]
    fn staging_write_and_publication_never_follow_a_replacement_symlink() {
        use std::os::unix::fs::symlink;

        let root = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let mut workspace = StagingWorkspace::create(root.path(), "Bound Link").unwrap();
        let visible_payload = workspace.visible_payload_path().to_owned();
        let preserved = workspace.visible_container_path().join("preserved");
        fs::rename(&visible_payload, &preserved).unwrap();
        symlink(outside.path(), &visible_payload).unwrap();

        fs::write(workspace.bound_project_path().join("marker"), b"ours").unwrap();
        assert_eq!(fs::read(preserved.join("marker")).unwrap(), b"ours");
        assert!(!outside.path().join("marker").exists());
        assert!(
            workspace
                .publish(&root.path().join("Bound Link.twinproj"))
                .is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn cleanup_does_not_follow_a_replaced_staging_symlink() {
        use std::os::unix::fs::symlink;

        let root = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let staging = root.path().join("Demo.twinproj.staging-link");
        let preserved = root.path().join("preserved-original");
        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("ours"), b"ours").unwrap();
        fs::write(outside.path().join("sentinel"), b"outside").unwrap();
        let identity = staging_identity(&staging).unwrap();
        fs::rename(&staging, &preserved).unwrap();
        symlink(outside.path(), &staging).unwrap();

        cleanup_verified_staging(root.path(), &staging, &identity);
        assert_eq!(
            fs::read(outside.path().join("sentinel")).unwrap(),
            b"outside"
        );
        assert_eq!(fs::read(preserved.join("ours")).unwrap(), b"ours");
    }
}
