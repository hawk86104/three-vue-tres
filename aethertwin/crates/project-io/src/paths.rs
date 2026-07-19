use crate::ProjectIoError;
use remove_dir_all::RemoveDir;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub(crate) const PROJECT_SUFFIX: &str = ".twinproj";

#[cfg(test)]
thread_local! {
    static BEFORE_RECOVERY_FILES_TEST_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce(&Path)>>> =
        std::cell::RefCell::new(None);
    static BEFORE_RECOVERY_PUBLISH_TEST_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce(&Path, &Path)>>> =
        std::cell::RefCell::new(None);
    #[cfg(any(target_os = "linux", target_os = "android"))]
    static AFTER_RECOVERY_PUBLISH_TEST_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce(&Path)>>> =
        std::cell::RefCell::new(None);
    static FAIL_RECOVERY_DESTINATION_IDENTITY_TEST_HOOK: std::cell::Cell<bool> =
        const { std::cell::Cell::new(false) };
}

#[cfg(test)]
fn set_before_recovery_files_test_hook(hook: impl FnOnce(&Path) + 'static) {
    BEFORE_RECOVERY_FILES_TEST_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
}

#[cfg(test)]
fn run_before_recovery_files_test_hook(path: &Path) {
    BEFORE_RECOVERY_FILES_TEST_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook(path);
        }
    });
}

#[cfg(test)]
fn set_before_recovery_publish_test_hook(hook: impl FnOnce(&Path, &Path) + 'static) {
    BEFORE_RECOVERY_PUBLISH_TEST_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
}

#[cfg(test)]
fn run_before_recovery_publish_test_hook(payload: &Path, destination: &Path) {
    BEFORE_RECOVERY_PUBLISH_TEST_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook(payload, destination);
        }
    });
}

#[cfg(not(test))]
fn run_before_recovery_publish_test_hook(_payload: &Path, _destination: &Path) {}

#[cfg(all(test, any(target_os = "linux", target_os = "android")))]
fn set_after_recovery_publish_test_hook(hook: impl FnOnce(&Path) + 'static) {
    AFTER_RECOVERY_PUBLISH_TEST_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
}

#[cfg(all(test, any(target_os = "linux", target_os = "android")))]
fn run_after_recovery_publish_test_hook(destination: &Path) {
    AFTER_RECOVERY_PUBLISH_TEST_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook(destination);
        }
    });
}

#[cfg(not(all(test, any(target_os = "linux", target_os = "android"))))]
fn run_after_recovery_publish_test_hook(_destination: &Path) {}

#[cfg(test)]
fn fail_next_recovery_destination_identity() {
    FAIL_RECOVERY_DESTINATION_IDENTITY_TEST_HOOK.with(|fail| fail.set(true));
}

fn recovery_destination_identity(file: &File) -> Result<FileIdentity, ProjectIoError> {
    #[cfg(test)]
    if FAIL_RECOVERY_DESTINATION_IDENTITY_TEST_HOOK.with(|fail| fail.replace(false)) {
        return Err(ProjectIoError::FilesystemError);
    }
    file_identity(file)
}

#[cfg(not(test))]
fn run_before_recovery_files_test_hook(_path: &Path) {}

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
        || value.contains('\0')
        || path.is_absolute()
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains('\\')
        || value.as_bytes().get(1) == Some(&b':')
        || value
            .split('/')
            .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
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

pub(crate) struct BoundProjectDirectory {
    canonical_path: PathBuf,
    bound_path: PathBuf,
    file: File,
    identity: FileIdentity,
}

impl BoundProjectDirectory {
    pub(crate) fn open(canonical_path: PathBuf) -> Result<Self, ProjectIoError> {
        let file = bind_existing_directory(&canonical_path)?;
        let expected = file_identity(&file)?;
        let bound_path = bound_directory_path(&file, &canonical_path)?;
        let validated = validate_project_structure(&bound_path)?;
        if validated != canonical_path || file_identity(&file)? != expected {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        Ok(Self {
            canonical_path,
            bound_path,
            file,
            identity: expected,
        })
    }

    pub(crate) fn canonical_path(&self) -> &Path {
        &self.canonical_path
    }

    pub(crate) fn bound_path(&self) -> &Path {
        &self.bound_path
    }

    pub(crate) fn file(&self) -> &File {
        &self.file
    }

    pub(crate) fn revalidate_stabilized(&self) -> Result<(), ProjectIoError> {
        if file_identity(&self.file)? != self.identity {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        #[cfg(windows)]
        {
            let visible = open_identity_directory(&self.canonical_path)?;
            if file_identity(&visible)? != self.identity {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        let validated = validate_project_structure(&self.bound_path)?;
        if validated != self.canonical_path {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        Ok(())
    }

    pub(crate) fn create_recovery_copy(&self) -> Result<RecoveryCopy, ProjectIoError> {
        let derived_visible = self.canonical_path.join("derived");
        let derived = bind_existing_child_directory(self.file(), &derived_visible, "derived")?;

        let recovery_visible = derived_visible.join("recovery");
        let recovery = match private_directory_options().mkdir_at(&derived, "recovery") {
            Ok(created) => bind_created_directory(&recovery_visible, created)?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                bind_existing_child_directory(&derived, &recovery_visible, "recovery")?
            }
            Err(_) => return Err(ProjectIoError::FilesystemError),
        };

        let destination_leaf = OsString::from(format!(
            "{}-{}",
            chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ"),
            Uuid::new_v4()
        ));
        let destination_visible = recovery_visible.join(&destination_leaf);
        let container_leaf =
            OsString::from(format!(".aethertwin-recovery-staging-{}", Uuid::new_v4()));
        let container_visible = recovery_visible.join(&container_leaf);
        let recovery_for_cleanup = recovery.try_clone()?;
        let created_container = private_directory_options()
            .mkdir_at(&recovery, &container_leaf)
            .map_err(|_| ProjectIoError::FilesystemError)?;
        let mut pending = PendingRecoveryCopy {
            parent: recovery_for_cleanup,
            parent_path: recovery_visible.clone(),
            container_path: container_visible.clone(),
            container_leaf: container_leaf.clone(),
            container_identity: None,
            container: Some(created_container),
            destination_path: destination_visible.clone(),
            destination_leaf: destination_leaf.clone(),
            payload_path: container_visible.join("payload"),
            payload_leaf: OsString::from("payload"),
            payload_identity: None,
            destination: None,
            copied_files: Vec::new(),
            copied_file_identities: Vec::new(),
            published: false,
            armed: true,
        };
        let container_identity = file_identity(
            pending
                .container
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
        )?;
        pending.container_identity = Some(StagingIdentity {
            leaf: container_leaf.clone(),
            file: container_identity,
        });
        let created_container = pending
            .container
            .take()
            .ok_or(ProjectIoError::FilesystemError)?;
        let container = bind_created_directory(&container_visible, created_container)?;
        let container_identity = file_identity(&container)?;
        pending.container_identity = Some(StagingIdentity {
            leaf: container_leaf.clone(),
            file: container_identity,
        });
        pending.container = Some(container);

        let created_payload = private_directory_options()
            .mkdir_at(
                pending
                    .container
                    .as_ref()
                    .ok_or(ProjectIoError::FilesystemError)?,
                &pending.payload_leaf,
            )
            .map_err(|_| ProjectIoError::FilesystemError)?;
        pending.destination = Some(created_payload);
        let destination_identity = recovery_destination_identity(
            pending
                .destination
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
        )?;
        pending.payload_identity = Some(destination_identity.clone());
        let created_payload = pending
            .destination
            .take()
            .ok_or(ProjectIoError::FilesystemError)?;
        let destination = bind_created_directory(&pending.payload_path, created_payload)?;
        if file_identity(&destination)? != destination_identity {
            return Err(ProjectIoError::FilesystemError);
        }
        pending.destination = Some(destination);
        run_before_recovery_files_test_hook(&self.canonical_path);

        for (name, optional) in [
            ("manifest.json", false),
            ("project.db", false),
            ("project.db-wal", true),
            ("project.db-shm", true),
        ] {
            let Some(mut source) =
                open_bound_regular_file(self.file(), &self.canonical_path, name, optional)?
            else {
                continue;
            };
            let mut target = create_bound_regular_file(
                pending
                    .destination
                    .as_ref()
                    .ok_or(ProjectIoError::FilesystemError)?,
                &pending.payload_path,
                name,
            )?;
            std::io::copy(&mut source, &mut target)?;
            target.sync_all()?;
            pending
                .copied_file_identities
                .push((name.to_owned(), regular_file_identity(&target)?));
            pending.copied_files.push(target);
        }
        sync_directory_metadata(
            pending
                .destination
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
        )?;
        sync_directory_metadata(
            pending
                .container
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
        )?;
        pending.copied_files.clear();
        run_before_recovery_publish_test_hook(&pending.payload_path, &destination_visible);
        publish_bound_directory(
            pending
                .container
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
            &pending.payload_leaf,
            pending
                .destination
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
            &recovery,
            &destination_visible,
            &destination_leaf,
            &destination_identity,
        )?;
        pending.published = true;
        run_after_recovery_publish_test_hook(&destination_visible);
        sync_directory_metadata(&recovery)?;
        let published = open_child_directory(&recovery, &destination_leaf)?;
        if file_identity(&published)? != destination_identity {
            return Err(ProjectIoError::FilesystemError);
        }
        drop(published);
        for (name, expected) in &pending.copied_file_identities {
            let file = open_bound_regular_file(
                pending
                    .destination
                    .as_ref()
                    .ok_or(ProjectIoError::FilesystemError)?,
                &destination_visible,
                name,
                false,
            )?
            .ok_or(ProjectIoError::FilesystemError)?;
            if regular_file_identity(&file)? != *expected {
                return Err(ProjectIoError::FilesystemError);
            }
            pending.copied_files.push(file);
        }
        let destination_bound = bound_directory_path(
            pending
                .destination
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
            &destination_visible,
        )?;
        pending.container.take();
        remove_empty_bound_child(
            &recovery,
            &recovery_visible,
            &container_leaf,
            pending
                .container_identity
                .as_ref()
                .ok_or(ProjectIoError::FilesystemError)?,
        )?;
        pending.container_identity = None;
        sync_directory_metadata(&recovery)?;
        pending.armed = false;

        Ok(RecoveryCopy {
            bound_path: destination_bound,
            _derived: derived,
            recovery,
            recovery_visible,
            destination_leaf,
            destination_identity,
            destination: pending.destination.take(),
            copied_files: std::mem::take(&mut pending.copied_files),
        })
    }
}

pub(crate) struct RecoveryCopy {
    bound_path: PathBuf,
    _derived: File,
    recovery: File,
    recovery_visible: PathBuf,
    destination_leaf: OsString,
    destination_identity: FileIdentity,
    destination: Option<File>,
    copied_files: Vec<File>,
}

impl RecoveryCopy {
    pub(crate) fn bound_path(&self) -> &Path {
        &self.bound_path
    }

    pub(crate) fn remove(mut self) -> Result<(), ProjectIoError> {
        self.copied_files.clear();
        self.destination.take();
        cleanup_bound_child(
            &self.recovery,
            &self.recovery_visible,
            &self.destination_leaf,
            &self.destination_identity,
        )
    }
}

struct PendingRecoveryCopy {
    parent: File,
    parent_path: PathBuf,
    container_path: PathBuf,
    container_leaf: OsString,
    container_identity: Option<StagingIdentity>,
    container: Option<File>,
    destination_path: PathBuf,
    destination_leaf: OsString,
    payload_path: PathBuf,
    payload_leaf: OsString,
    payload_identity: Option<FileIdentity>,
    destination: Option<File>,
    copied_files: Vec<File>,
    copied_file_identities: Vec<(String, FileIdentity)>,
    published: bool,
    armed: bool,
}

impl Drop for PendingRecoveryCopy {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        self.copied_files.clear();
        let destination = self.destination.take();
        let payload_was_created = destination.is_some();
        drop(destination);
        let mut payload_cleaned = !payload_was_created;
        if self.published {
            if let Some(identity) = &self.payload_identity {
                let _ = cleanup_bound_child(
                    &self.parent,
                    &self.parent_path,
                    &self.destination_leaf,
                    identity,
                );
            }
            payload_cleaned = true;
        } else if let (Some(container), Some(identity)) =
            (self.container.as_ref(), self.payload_identity.as_ref())
        {
            payload_cleaned = cleanup_bound_child(
                container,
                &self.container_path,
                &self.payload_leaf,
                identity,
            )
            .is_ok();
        }
        self.container.take();
        if payload_cleaned {
            if let Some(identity) = &self.container_identity {
                let _ = remove_empty_bound_child(
                    &self.parent,
                    &self.parent_path,
                    &self.container_leaf,
                    identity,
                );
            }
        }
        debug_assert_eq!(
            self.destination_path.file_name(),
            Some(self.destination_leaf.as_os_str())
        );
    }
}

fn cleanup_bound_child(
    parent: &File,
    parent_path: &Path,
    leaf: &OsStr,
    expected: &FileIdentity,
) -> Result<(), ProjectIoError> {
    let quarantine = OsString::from(format!(".aethertwin-recovery-cleanup-{}", Uuid::new_v4()));
    rename_child_no_replace(parent, parent_path, leaf, &quarantine)?;
    let mut child = match open_child_directory(parent, &quarantine) {
        Ok(child) => child,
        Err(error) => {
            let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
            return Err(error);
        }
    };
    let actual = match file_identity(&child) {
        Ok(actual) => actual,
        Err(error) => {
            drop(child);
            let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
            return Err(error);
        }
    };
    if actual != *expected {
        drop(child);
        let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
        return Err(ProjectIoError::FilesystemError);
    }
    child
        .remove_dir_contents(Some(&parent_path.join(&quarantine)))
        .map_err(|_| ProjectIoError::FilesystemError)?;
    drop(child);
    fs_at::OpenOptions::default()
        .rmdir_at(parent, &quarantine)
        .map_err(|_| ProjectIoError::FilesystemError)
}

fn remove_empty_bound_child(
    parent: &File,
    parent_path: &Path,
    leaf: &OsStr,
    expected: &StagingIdentity,
) -> Result<(), ProjectIoError> {
    if expected.leaf != leaf {
        return Err(ProjectIoError::FilesystemError);
    }
    let quarantine = OsString::from(format!(
        ".aethertwin-recovery-container-cleanup-{}",
        Uuid::new_v4()
    ));
    rename_child_no_replace(parent, parent_path, leaf, &quarantine)?;
    let child = match open_child_directory(parent, &quarantine) {
        Ok(child) => child,
        Err(error) => {
            let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
            return Err(error);
        }
    };
    let actual = match file_identity(&child) {
        Ok(actual) => actual,
        Err(error) => {
            drop(child);
            let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
            return Err(error);
        }
    };
    if actual != expected.file {
        drop(child);
        let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
        return Err(ProjectIoError::FilesystemError);
    }
    drop(child);
    match fs_at::OpenOptions::default().rmdir_at(parent, &quarantine) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = rename_child_no_replace(parent, parent_path, &quarantine, leaf);
            Err(ProjectIoError::FilesystemError)
        }
    }
}

#[cfg(unix)]
fn sync_directory_metadata(directory: &File) -> Result<(), ProjectIoError> {
    directory.sync_all().map_err(ProjectIoError::from)
}

#[cfg(windows)]
fn sync_directory_metadata(_directory: &File) -> Result<(), ProjectIoError> {
    // Windows does not support fsync/FlushFileBuffers for directory handles.
    // mkdir_at is synchronous; every copied file is explicitly sync_all'd.
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn sync_directory_metadata(_directory: &File) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

fn bind_existing_child_directory(
    parent: &File,
    visible: &Path,
    leaf: &str,
) -> Result<File, ProjectIoError> {
    let bridge = open_child_directory(parent, OsStr::new(leaf))?;
    #[cfg(windows)]
    {
        let expected = file_identity(&bridge)?;
        let locked = open_locked_directory(visible)?;
        if file_identity(&locked)? != expected {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        return Ok(locked);
    }
    #[cfg(not(windows))]
    {
        let _ = visible;
        Ok(bridge)
    }
}

fn open_bound_regular_file(
    parent: &File,
    parent_visible: &Path,
    leaf: &str,
    optional: bool,
) -> Result<Option<File>, ProjectIoError> {
    let mut options = fs_at::OpenOptions::default();
    options.read(true).follow(false);
    let bridge = match options.open_at(parent, leaf) {
        Ok(file) => file,
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        Err(_) => return Err(ProjectIoError::FilesystemError),
    };
    let expected = regular_file_identity(&bridge)?;
    #[cfg(windows)]
    {
        let locked = open_locked_regular_file(&parent_visible.join(leaf), false)?;
        if regular_file_identity(&locked)? != expected {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        return Ok(Some(locked));
    }
    #[cfg(not(windows))]
    {
        let _ = (parent_visible, expected);
        Ok(Some(bridge))
    }
}

fn create_bound_regular_file(
    parent: &File,
    parent_visible: &Path,
    leaf: &str,
) -> Result<File, ProjectIoError> {
    let mut options = fs_at::OpenOptions::default();
    options
        .read(true)
        .write(fs_at::OpenOptionsWriteMode::Write)
        .create_new(true)
        .follow(false);
    let bridge = options
        .open_at(parent, leaf)
        .map_err(|_| ProjectIoError::FilesystemError)?;
    let expected = regular_file_identity(&bridge)?;
    #[cfg(windows)]
    {
        let locked = open_locked_regular_file(&parent_visible.join(leaf), true)?;
        if regular_file_identity(&locked)? != expected {
            return Err(ProjectIoError::FilesystemError);
        }
        return Ok(locked);
    }
    #[cfg(not(windows))]
    {
        let _ = (parent_visible, expected);
        Ok(bridge)
    }
}

#[cfg(windows)]
fn open_locked_regular_file(path: &Path, writable: bool) -> Result<File, ProjectIoError> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    let mut options = fs::OpenOptions::new();
    options
        .read(true)
        .write(writable)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    options
        .open(path)
        .map_err(|_| ProjectIoError::InvalidProjectStructure)
}

#[cfg(windows)]
fn bind_existing_directory(path: &Path) -> Result<File, ProjectIoError> {
    open_identity_directory(path)
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn bind_existing_directory(path: &Path) -> Result<File, ProjectIoError> {
    open_directory(path)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn bind_existing_directory(_path: &Path) -> Result<File, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
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
    rename_open_directory_no_replace(payload_file, parent_file, destination_leaf)
}

#[cfg(windows)]
fn rename_open_directory_no_replace(
    directory: &File,
    parent: &File,
    destination_leaf: &OsStr,
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
        (*information).root_directory = parent.as_raw_handle();
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
            directory.as_raw_handle(),
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
        .open_dir_at(parent, Path::new(destination_leaf))
        .is_ok()
        || collision_options
            .open_at(parent, Path::new(destination_leaf))
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
    Windows { volume: u64, id: [u8; 16] },
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
    options.follow(false);
    let file = options
        .open_dir_at(parent, Path::new(leaf))
        .map_err(|_| ProjectIoError::FilesystemError)?;
    #[cfg(windows)]
    validate_windows_directory(&file)?;
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
    object_identity(file)
}

#[cfg(windows)]
fn object_identity(file: &File) -> Result<FileIdentity, ProjectIoError> {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

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
    // SAFETY: the handle is live and the fixed-size output buffer is writable.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FILE_ID_INFO_CLASS,
            (&mut information as *mut FileIdInfo).cast(),
            u32::try_from(std::mem::size_of::<FileIdInfo>())
                .map_err(|_| ProjectIoError::FilesystemError)?,
        )
    } == 0
    {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(FileIdentity::Windows {
        volume: information.volume_serial_number,
        id: information.file_id.identifier,
    })
}

#[cfg(not(any(unix, windows)))]
fn file_identity(_file: &File) -> Result<FileIdentity, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(unix)]
fn regular_file_identity(file: &File) -> Result<FileIdentity, ProjectIoError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(FileIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn regular_file_identity(file: &File) -> Result<FileIdentity, ProjectIoError> {
    validate_windows_regular_file(file)?;
    object_identity(file)
}

#[cfg(windows)]
fn validate_windows_regular_file(file: &File) -> Result<(), ProjectIoError> {
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
            std::mem::size_of::<FileAttributeTagInfo>() as u32,
        )
    } == 0
        || information.attributes & FILE_ATTRIBUTE_DIRECTORY != 0
        || information.attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn regular_file_identity(_file: &File) -> Result<FileIdentity, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(test)]
mod tests {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    use super::set_after_recovery_publish_test_hook;
    use super::{
        BoundProjectDirectory, FileIdentity, StagingWorkspace, cleanup_verified_staging,
        fail_next_recovery_destination_identity, file_identity, open_directory, rename_no_replace,
        set_before_bind_test_hook, set_before_recovery_files_test_hook,
        set_before_recovery_publish_test_hook, staging_identity, validate_project_structure,
    };
    use crate::{CreateProjectRequest, ProjectProfile, create_project};
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
    fn incomplete_recovery_copy_is_exactly_removed_after_source_open_failure() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Incomplete Recovery".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = validate_project_structure(&opened.project_path).unwrap();
        let bound = BoundProjectDirectory::open(canonical).unwrap();
        let manifest = opened.project_path.join("manifest.json");
        let preserved = opened.project_path.join("manifest-preserved.json");
        set_before_recovery_files_test_hook({
            let manifest = manifest.clone();
            let preserved = preserved.clone();
            move |_| {
                fs::rename(&manifest, &preserved).unwrap();
                fs::create_dir(&manifest).unwrap();
            }
        });

        assert!(bound.create_recovery_copy().is_err());
        let recovery_root = opened.project_path.join("derived/recovery");
        assert_eq!(fs::read_dir(recovery_root).unwrap().count(), 0);
        assert!(preserved.is_file());
    }

    #[test]
    fn successful_recovery_copy_publishes_only_the_completed_directory() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Successful Recovery Copy".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = validate_project_structure(&opened.project_path).unwrap();
        let bound = BoundProjectDirectory::open(canonical).unwrap();

        let recovery = match bound.create_recovery_copy() {
            Ok(recovery) => recovery,
            Err(error) => {
                let entries: Vec<_> = fs::read_dir(opened.project_path.join("derived/recovery"))
                    .unwrap()
                    .map(Result::unwrap)
                    .map(|entry| entry.file_name())
                    .collect();
                panic!("recovery copy failed with {error:?}; entries: {entries:?}");
            }
        };
        let recovery_root = opened.project_path.join("derived/recovery");
        assert_eq!(fs::read_dir(&recovery_root).unwrap().count(), 1);
        assert!(recovery.bound_path().join("manifest.json").is_file());
        recovery.remove().unwrap();
        assert_eq!(fs::read_dir(recovery_root).unwrap().count(), 0);
    }

    #[test]
    fn identity_failure_never_publishes_a_completed_recovery_name() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Unverified Recovery".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = validate_project_structure(&opened.project_path).unwrap();
        let bound = BoundProjectDirectory::open(canonical).unwrap();
        fail_next_recovery_destination_identity();

        assert!(bound.create_recovery_copy().is_err());
        let recovery_root = opened.project_path.join("derived/recovery");
        let entries: Vec<_> = fs::read_dir(recovery_root)
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(entries.len(), 1);
        assert!(
            entries[0]
                .file_name()
                .to_string_lossy()
                .starts_with(".aethertwin-recovery-staging-")
        );
    }

    #[test]
    fn recovery_publication_never_replaces_a_colliding_destination() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Recovery Collision".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = validate_project_structure(&opened.project_path).unwrap();
        let bound = BoundProjectDirectory::open(canonical).unwrap();
        set_before_recovery_publish_test_hook(|_payload, destination| {
            fs::create_dir(destination).unwrap();
            fs::write(destination.join("replacement"), b"theirs").unwrap();
        });

        assert!(matches!(
            bound.create_recovery_copy(),
            Err(crate::ProjectIoError::ProjectAlreadyExists)
        ));
        let recovery_root = opened.project_path.join("derived/recovery");
        let entries: Vec<_> = fs::read_dir(&recovery_root)
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(entries.len(), 1);
        assert_eq!(
            fs::read(entries[0].path().join("replacement")).unwrap(),
            b"theirs"
        );
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[test]
    fn recovery_publication_rejects_a_replaced_private_payload() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Recovery Payload Replacement".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = validate_project_structure(&opened.project_path).unwrap();
        let bound = BoundProjectDirectory::open(canonical).unwrap();
        set_before_recovery_publish_test_hook(|payload, _destination| {
            let preserved = payload.parent().unwrap().join("preserved-payload");
            fs::rename(payload, &preserved).unwrap();
            fs::create_dir(payload).unwrap();
            fs::write(payload.join("replacement"), b"theirs").unwrap();
        });

        assert!(bound.create_recovery_copy().is_err());
        let recovery_root = opened.project_path.join("derived/recovery");
        let entries: Vec<_> = fs::read_dir(&recovery_root)
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(entries.len(), 1);
        let staging = entries[0].path();
        assert!(
            entries[0]
                .file_name()
                .to_string_lossy()
                .starts_with(".aethertwin-recovery-staging-")
        );
        assert_eq!(
            fs::read(staging.join("payload/replacement")).unwrap(),
            b"theirs"
        );
        assert!(staging.join("preserved-payload/manifest.json").is_file());
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[test]
    fn post_publish_identity_mismatch_restores_without_deleting_the_replacement() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Published Recovery Replacement".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = validate_project_structure(&opened.project_path).unwrap();
        let bound = BoundProjectDirectory::open(canonical).unwrap();
        let preserved = opened
            .project_path
            .join("derived/recovery/preserved-published");
        set_after_recovery_publish_test_hook({
            let preserved = preserved.clone();
            move |destination| {
                fs::rename(destination, &preserved).unwrap();
                fs::create_dir(destination).unwrap();
                fs::write(destination.join("replacement"), b"theirs").unwrap();
            }
        });

        assert!(bound.create_recovery_copy().is_err());
        let recovery_root = opened.project_path.join("derived/recovery");
        let replacement = fs::read_dir(&recovery_root)
            .unwrap()
            .map(Result::unwrap)
            .find(|entry| entry.path().join("replacement").is_file())
            .unwrap();
        assert_eq!(
            fs::read(replacement.path().join("replacement")).unwrap(),
            b"theirs"
        );
        assert!(preserved.join("manifest.json").is_file());
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

    #[cfg(windows)]
    #[test]
    fn windows_identity_uses_volume_and_the_complete_128_bit_file_id() {
        let base = FileIdentity::Windows {
            volume: 7,
            id: [1; 16],
        };
        assert_ne!(
            base,
            FileIdentity::Windows {
                volume: 8,
                id: [1; 16],
            }
        );
        let mut high_byte_differs = [1; 16];
        high_byte_differs[15] = 2;
        assert_ne!(
            base,
            FileIdentity::Windows {
                volume: 7,
                id: high_byte_differs,
            }
        );

        let root = tempdir().unwrap();
        let child = root.path().join("stable-id");
        fs::create_dir(&child).unwrap();
        let first = open_directory(&child).unwrap();
        let second = open_directory(&child).unwrap();
        assert_eq!(
            file_identity(&first).unwrap(),
            file_identity(&second).unwrap()
        );
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
