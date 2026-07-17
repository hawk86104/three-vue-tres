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
        .is_some_and(|name| strip_suffix_ascii_case(name).is_some());
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

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct StagingIdentity {
    leaf: OsString,
    file: FileIdentity,
}

#[derive(Debug, Eq, PartialEq)]
enum FileIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows { volume: u32, index: u64 },
    #[cfg(not(any(unix, windows)))]
    Unsupported,
}

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
    struct FileTime {
        low: u32,
        high: u32,
    }

    #[repr(C)]
    struct ByHandleFileInformation {
        attributes: u32,
        creation_time: FileTime,
        last_access_time: FileTime,
        last_write_time: FileTime,
        volume_serial_number: u32,
        file_size_high: u32,
        file_size_low: u32,
        number_of_links: u32,
        file_index_high: u32,
        file_index_low: u32,
    }

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandle(
            file: *mut c_void,
            information: *mut ByHandleFileInformation,
        ) -> i32;
    }

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    let metadata = file.metadata()?;
    if !metadata.is_dir() {
        return Err(ProjectIoError::FilesystemError);
    }
    let mut information = std::mem::MaybeUninit::<ByHandleFileInformation>::uninit();
    // SAFETY: the handle is borrowed from a live File and the output points to valid storage.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), information.as_mut_ptr()) } == 0 {
        return Err(ProjectIoError::FilesystemError);
    }
    // SAFETY: a successful API call initialized the complete structure.
    let information = unsafe { information.assume_init() };
    if information.attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(FileIdentity::Windows {
        volume: information.volume_serial_number,
        index: (u64::from(information.file_index_high) << 32)
            | u64::from(information.file_index_low),
    })
}

#[cfg(not(any(unix, windows)))]
fn file_identity(_file: &File) -> Result<FileIdentity, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(test)]
mod tests {
    use super::{cleanup_verified_staging, rename_no_replace, staging_identity};
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
