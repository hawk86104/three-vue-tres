use crate::ProjectIoError;
use crate::model::valid_timestamp;
use crate::paths::{
    BoundProjectDirectory, RecoveryCopy, validate_project_extension, validate_project_structure,
};
use chrono::{SecondsFormat, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::ffi::{OsStr, OsString};
use std::fs::File;
#[cfg(unix)]
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const LOCK_FILE_NAME: &str = ".aethertwin.lock";

#[cfg(test)]
thread_local! {
    static BEFORE_LOCK_FILE_TEST_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce(&Path)>>> =
        std::cell::RefCell::new(None);
    #[cfg(any(target_os = "linux", target_os = "android"))]
    static BEFORE_LOCK_PUBLISH_TEST_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce(&Path)>>> =
        std::cell::RefCell::new(None);
}

#[cfg(test)]
fn set_before_lock_file_test_hook(hook: impl FnOnce(&Path) + 'static) {
    BEFORE_LOCK_FILE_TEST_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
}

#[cfg(test)]
fn run_before_lock_file_test_hook(path: &Path) {
    BEFORE_LOCK_FILE_TEST_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook(path);
        }
    });
}

#[cfg(all(test, any(target_os = "linux", target_os = "android")))]
fn set_before_lock_publish_test_hook(hook: impl FnOnce(&Path) + 'static) {
    BEFORE_LOCK_PUBLISH_TEST_HOOK.with(|slot| *slot.borrow_mut() = Some(Box::new(hook)));
}

#[cfg(all(test, any(target_os = "linux", target_os = "android")))]
fn run_before_lock_publish_test_hook(path: &Path) {
    BEFORE_LOCK_PUBLISH_TEST_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook(path);
        }
    });
}

#[cfg(not(all(test, any(target_os = "linux", target_os = "android"))))]
fn run_before_lock_publish_test_hook(_path: &Path) {}

#[cfg(not(test))]
fn run_before_lock_file_test_hook(_path: &Path) {}

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

struct LockAcquisitionGuard {
    directory: PathBuf,
    leaf: Option<OsString>,
    file: Option<File>,
    identity: Option<LockIdentity>,
    newly_created: bool,
}

impl LockAcquisitionGuard {
    fn new(directory: &Path, leaf: Option<OsString>, file: File, existed: bool) -> Self {
        Self {
            directory: directory.to_owned(),
            leaf,
            file: Some(file),
            identity: None,
            newly_created: !existed,
        }
    }

    fn file(&self) -> &File {
        self.file.as_ref().expect("acquisition file is present")
    }

    fn file_mut(&mut self) -> &mut File {
        self.file.as_mut().expect("acquisition file is present")
    }

    fn set_identity(&mut self, identity: LockIdentity) {
        self.identity = Some(identity);
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    fn published(&mut self) {
        self.leaf = Some(OsString::from(LOCK_FILE_NAME));
    }

    fn finish(mut self) -> Result<(File, LockIdentity), ProjectIoError> {
        let identity = self
            .identity
            .take()
            .ok_or(ProjectIoError::FilesystemError)?;
        let file = self.file.take().ok_or(ProjectIoError::FilesystemError)?;
        self.newly_created = false;
        Ok((file, identity))
    }
}

impl Drop for LockAcquisitionGuard {
    fn drop(&mut self) {
        let Some(file) = self.file.as_ref() else {
            return;
        };
        if self.newly_created {
            if let Some(leaf) = &self.leaf {
                let _ =
                    remove_newly_created_lock(&self.directory, leaf, file, self.identity.as_ref());
            }
        }
        let _ = FileExt::unlock(file);
    }
}

impl ProjectLock {
    pub(crate) fn acquire(path: &Path, recover_stale: bool) -> Result<Self, ProjectIoError> {
        validate_project_extension(path)?;
        let canonical = validate_project_structure(path)?;
        let directory = BoundProjectDirectory::open(canonical)?;
        lock_project_identity(&directory)?;
        run_before_lock_file_test_hook(directory.canonical_path());
        let opened = open_lock_file(&directory)?;
        #[cfg(any(target_os = "linux", target_os = "android"))]
        let mut opened = opened;
        loop {
            let existed = opened.existed;
            let mut acquisition = LockAcquisitionGuard::new(
                directory.bound_path(),
                opened.leaf,
                opened.file,
                existed,
            );
            if let Err(error) = acquisition.file().try_lock_exclusive() {
                return if error.kind() == std::io::ErrorKind::WouldBlock {
                    Err(ProjectIoError::ProjectLocked)
                } else {
                    Err(ProjectIoError::FilesystemError)
                };
            }
            let identity = lock_identity(acquisition.file())?;
            acquisition.set_identity(identity.clone());
            directory.revalidate_stabilized()?;

            if existed {
                let metadata_valid = read_metadata(acquisition.file_mut())
                    .ok()
                    .is_some_and(|metadata| metadata.is_valid());
                if !recover_stale {
                    return Err(ProjectIoError::StaleProjectLock);
                }
                if !metadata_valid {
                    // Malformed crash residue still requires the explicit recovery path.
                }
            }
            write_metadata(acquisition.file_mut(), &LockMetadata::new())?;
            if !existed {
                run_before_lock_publish_test_hook(directory.bound_path());
            }
            match publish_new_lock(&directory, &mut acquisition)? {
                PublishLockOutcome::Published => {
                    let (file, identity) = acquisition.finish()?;
                    return Ok(Self {
                        directory,
                        file: Some(file),
                        identity,
                        stale_recovered: existed,
                    });
                }
                #[cfg(any(target_os = "linux", target_os = "android"))]
                PublishLockOutcome::Collision => {
                    drop(acquisition);
                    opened = reopen_official_lock_after_collision(&directory)?;
                }
            }
        }
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

    pub(crate) fn create_recovery_copy(&self) -> Result<RecoveryCopy, ProjectIoError> {
        self.directory.create_recovery_copy()
    }

    pub(crate) fn clean_close(&mut self) -> Result<(), ProjectIoError> {
        let file = self.file.as_ref().ok_or(ProjectIoError::FilesystemError)?;
        if lock_identity(file)? != self.identity {
            return Err(ProjectIoError::FilesystemError);
        }
        remove_locked_file(
            self.directory.bound_path(),
            OsStr::new(LOCK_FILE_NAME),
            file,
            &self.identity,
        )?;
        let file = self.file.take().ok_or(ProjectIoError::FilesystemError)?;
        let _ = FileExt::unlock(&file);
        drop(file);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    use super::set_before_lock_publish_test_hook;
    use super::{
        LOCK_FILE_NAME, LockAcquisitionGuard, ProjectLock, set_before_lock_file_test_hook,
    };
    use crate::{CreateProjectRequest, ProjectProfile, create_project};
    use std::fs;

    #[cfg(any(target_os = "linux", target_os = "android"))]
    thread_local! {
        static COLLISION_LOCK_HOLDER: std::cell::RefCell<Option<std::fs::File>> =
            const { std::cell::RefCell::new(None) };
    }

    #[cfg(windows)]
    fn open_test_lock(path: &std::path::Path, create_new: bool) -> std::fs::File {
        super::open_windows_lock_file(path, create_new).unwrap()
    }

    #[cfg(unix)]
    fn open_test_lock(path: &std::path::Path, create_new: bool) -> std::fs::File {
        use std::os::unix::fs::OpenOptionsExt;
        let mut options = std::fs::OpenOptions::new();
        options.read(true).write(true).create_new(create_new);
        if !create_new {
            options.custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
        }
        options.open(path).unwrap()
    }

    #[test]
    fn acquisition_guard_removes_only_a_newly_created_lock() {
        let root = tempfile::tempdir().unwrap();
        let lock_path = root.path().join(LOCK_FILE_NAME);
        let file = open_test_lock(&lock_path, true);
        let mut guard =
            LockAcquisitionGuard::new(root.path(), Some(LOCK_FILE_NAME.into()), file, false);
        let identity = super::lock_identity(guard.file()).unwrap();
        guard.set_identity(identity);
        drop(guard);
        assert!(!lock_path.exists());

        fs::write(&lock_path, b"residue").unwrap();
        let file = open_test_lock(&lock_path, false);
        drop(LockAcquisitionGuard::new(
            root.path(),
            Some(LOCK_FILE_NAME.into()),
            file,
            true,
        ));
        assert_eq!(fs::read(lock_path).unwrap(), b"residue");
    }

    #[cfg(unix)]
    #[test]
    fn acquisition_guard_preserves_a_replacement_path_entry() {
        let root = tempfile::tempdir().unwrap();
        let lock_path = root.path().join(LOCK_FILE_NAME);
        let file = open_test_lock(&lock_path, true);
        let mut guard =
            LockAcquisitionGuard::new(root.path(), Some(LOCK_FILE_NAME.into()), file, false);
        let identity = super::lock_identity(guard.file()).unwrap();
        guard.set_identity(identity);
        fs::remove_file(&lock_path).unwrap();
        fs::write(&lock_path, b"replacement").unwrap();
        drop(guard);
        assert_eq!(fs::read(lock_path).unwrap(), b"replacement");
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    fn new_bound_project(name: &str) -> (tempfile::TempDir, crate::paths::BoundProjectDirectory) {
        let root = tempfile::tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: name.into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let canonical = crate::paths::validate_project_structure(&opened.project_path).unwrap();
        let directory = crate::paths::BoundProjectDirectory::open(canonical).unwrap();
        (root, directory)
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[test]
    fn published_lock_is_the_exact_held_tmpfile_inode() {
        use fs2::FileExt;

        let (_root, directory) = new_bound_project("Anonymous Lock");
        super::lock_project_identity(&directory).unwrap();
        let opened = super::open_lock_file(&directory).unwrap();
        assert!(!opened.existed);
        assert!(opened.leaf.is_none());
        let mut guard = LockAcquisitionGuard::new(
            directory.bound_path(),
            opened.leaf,
            opened.file,
            opened.existed,
        );
        guard.file().try_lock_exclusive().unwrap();
        let held_identity = super::lock_identity(guard.file()).unwrap();
        guard.set_identity(held_identity.clone());
        super::write_metadata(guard.file_mut(), &super::LockMetadata::new()).unwrap();
        let proc_path = super::proc_fd_path(guard.file());
        assert_eq!(super::proc_fd_identity(&proc_path).unwrap(), held_identity);

        assert_eq!(
            super::publish_new_lock(&directory, &mut guard).unwrap(),
            super::PublishLockOutcome::Published
        );
        let published = super::open_lock_file(&directory).unwrap();
        assert!(published.existed);
        assert_eq!(
            super::lock_identity(&published.file).unwrap(),
            held_identity
        );
        drop(published);
        drop(guard);
        assert!(!directory.bound_path().join(LOCK_FILE_NAME).exists());
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[test]
    fn tmpfile_publication_never_replaces_a_colliding_official_lock() {
        use fs2::FileExt;

        let (_root, directory) = new_bound_project("Lock Collision");
        super::lock_project_identity(&directory).unwrap();
        let opened = super::open_lock_file(&directory).unwrap();
        assert!(!opened.existed);
        assert!(opened.leaf.is_none());
        let mut guard = LockAcquisitionGuard::new(
            directory.bound_path(),
            opened.leaf,
            opened.file,
            opened.existed,
        );
        guard.file().try_lock_exclusive().unwrap();
        let identity = super::lock_identity(guard.file()).unwrap();
        guard.set_identity(identity);
        super::write_metadata(guard.file_mut(), &super::LockMetadata::new()).unwrap();
        let official = directory.bound_path().join(LOCK_FILE_NAME);
        fs::write(&official, b"collision").unwrap();

        assert_eq!(
            super::publish_new_lock(&directory, &mut guard).unwrap(),
            super::PublishLockOutcome::Collision
        );
        assert_eq!(fs::read(&official).unwrap(), b"collision");
        assert_eq!(
            fs::read_dir(directory.bound_path())
                .unwrap()
                .map(Result::unwrap)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(LOCK_FILE_NAME))
                .count(),
            1
        );
        drop(guard);
        assert_eq!(fs::read(official).unwrap(), b"collision");
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[test]
    fn publication_collision_reopens_and_classifies_the_official_lock() {
        let (root, directory) = new_bound_project("Collision Classifier");
        let project = directory.canonical_path().to_owned();
        drop(directory);
        set_before_lock_publish_test_hook(|bound_project| {
            fs::write(bound_project.join(LOCK_FILE_NAME), b"collision residue").unwrap();
        });

        assert!(matches!(
            ProjectLock::acquire(&project, false),
            Err(crate::ProjectIoError::StaleProjectLock)
        ));
        assert_eq!(
            fs::read(project.join(LOCK_FILE_NAME)).unwrap(),
            b"collision residue"
        );

        let mut recovered = ProjectLock::acquire(&project, true).unwrap();
        assert!(recovered.stale_recovered());
        recovered.clean_close().unwrap();
        drop(root);
    }

    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[test]
    fn publication_collision_classifies_an_actively_held_official_lock() {
        use fs2::FileExt;

        let (_root, directory) = new_bound_project("Active Collision Classifier");
        let project = directory.canonical_path().to_owned();
        drop(directory);
        set_before_lock_publish_test_hook(|bound_project| {
            let official = bound_project.join(LOCK_FILE_NAME);
            fs::write(&official, b"active collision").unwrap();
            let file = super::try_open_existing_unix_lock_file(
                &crate::paths::BoundProjectDirectory::open(
                    crate::paths::validate_project_structure(bound_project).unwrap(),
                )
                .unwrap(),
            )
            .unwrap()
            .unwrap()
            .file;
            file.try_lock_exclusive().unwrap();
            COLLISION_LOCK_HOLDER.with(|slot| *slot.borrow_mut() = Some(file));
        });

        assert!(matches!(
            ProjectLock::acquire(&project, true),
            Err(crate::ProjectIoError::ProjectLocked)
        ));
        COLLISION_LOCK_HOLDER.with(|slot| {
            if let Some(file) = slot.borrow_mut().take() {
                FileExt::unlock(&file).unwrap();
            }
        });
    }

    #[cfg(windows)]
    #[test]
    fn project_replacement_during_lock_handoff_is_rejected_and_new_lock_is_cleaned() {
        let root = tempfile::tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_owned(),
            name: "Handoff".into(),
            profile: ProjectProfile::Market,
        })
        .unwrap();
        let visible = opened.project_path.clone();
        let moved = root.path().join("preserved.twinproj");
        set_before_lock_file_test_hook({
            let visible = visible.clone();
            let moved = moved.clone();
            move |_| {
                fs::rename(&visible, &moved).unwrap();
                fs::create_dir(&visible).unwrap();
            }
        });

        let error = match ProjectLock::acquire(&visible, true) {
            Ok(_) => panic!("replacement handoff unexpectedly acquired the project"),
            Err(error) => error,
        };
        assert_eq!(error.code(), "INVALID_PROJECT_STRUCTURE");
        assert!(!visible.join(LOCK_FILE_NAME).exists());
        assert!(moved.join("manifest.json").is_file());
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

struct OpenedLockFile {
    file: File,
    leaf: Option<OsString>,
    existed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PublishLockOutcome {
    Published,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    Collision,
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn open_lock_file(directory: &BoundProjectDirectory) -> Result<OpenedLockFile, ProjectIoError> {
    if let Some(existing) = try_open_existing_unix_lock_file(directory)? {
        return Ok(existing);
    }

    use rustix::fs::{Mode, OFlags, openat};
    let owned = openat(
        directory.file(),
        ".",
        OFlags::TMPFILE | OFlags::RDWR | OFlags::CLOEXEC,
        Mode::from_raw_mode(0o600),
    )
    .map_err(|_| ProjectIoError::FilesystemError)?;
    Ok(OpenedLockFile {
        file: File::from(owned),
        leaf: None,
        existed: false,
    })
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "android"))))]
fn open_lock_file(directory: &BoundProjectDirectory) -> Result<OpenedLockFile, ProjectIoError> {
    try_open_existing_unix_lock_file(directory)?.ok_or(ProjectIoError::FilesystemError)
}

#[cfg(unix)]
fn try_open_existing_unix_lock_file(
    directory: &BoundProjectDirectory,
) -> Result<Option<OpenedLockFile>, ProjectIoError> {
    use rustix::fs::{Mode, OFlags, openat};
    match openat(
        directory.file(),
        LOCK_FILE_NAME,
        OFlags::RDWR | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    ) {
        Ok(file) => Ok(Some(OpenedLockFile {
            file: File::from(file),
            leaf: Some(OsString::from(LOCK_FILE_NAME)),
            existed: true,
        })),
        Err(rustix::io::Errno::NOENT) => Ok(None),
        Err(_) => Err(ProjectIoError::InvalidProjectStructure),
    }
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn reopen_official_lock_after_collision(
    directory: &BoundProjectDirectory,
) -> Result<OpenedLockFile, ProjectIoError> {
    try_open_existing_unix_lock_file(directory)?.ok_or(ProjectIoError::FilesystemError)
}

#[cfg(windows)]
fn open_lock_file(directory: &BoundProjectDirectory) -> Result<OpenedLockFile, ProjectIoError> {
    let path = directory.bound_path().join(LOCK_FILE_NAME);
    match open_windows_lock_file(&path, true) {
        Ok(file) => Ok(OpenedLockFile {
            file,
            leaf: Some(OsString::from(LOCK_FILE_NAME)),
            existed: false,
        }),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            match open_windows_lock_file(&path, false) {
                Ok(file) => Ok(OpenedLockFile {
                    file,
                    leaf: Some(OsString::from(LOCK_FILE_NAME)),
                    existed: true,
                }),
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
fn open_windows_lock_file(path: impl AsRef<Path>, create_new: bool) -> std::io::Result<File> {
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
    let path: Vec<u16> = path
        .as_ref()
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
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
fn open_lock_file(_directory: &BoundProjectDirectory) -> Result<OpenedLockFile, ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn publish_new_lock(
    directory: &BoundProjectDirectory,
    acquisition: &mut LockAcquisitionGuard,
) -> Result<PublishLockOutcome, ProjectIoError> {
    if !acquisition.newly_created {
        return Ok(PublishLockOutcome::Published);
    }
    use rustix::fs::{AtFlags, CWD, linkat};
    let proc_path = proc_fd_path(acquisition.file());
    let held_identity = acquisition
        .identity
        .as_ref()
        .ok_or(ProjectIoError::FilesystemError)?;
    if proc_fd_identity(&proc_path)? != *held_identity {
        return Err(ProjectIoError::FilesystemError);
    }
    match linkat(
        CWD,
        &proc_path,
        directory.file(),
        LOCK_FILE_NAME,
        AtFlags::SYMLINK_FOLLOW,
    ) {
        Ok(()) => {
            acquisition.published();
            directory.file().sync_all()?;
            Ok(PublishLockOutcome::Published)
        }
        Err(rustix::io::Errno::EXIST) => Ok(PublishLockOutcome::Collision),
        Err(_) => Err(ProjectIoError::FilesystemError),
    }
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn proc_fd_path(file: &File) -> PathBuf {
    use std::os::fd::AsRawFd;
    PathBuf::from(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn proc_fd_identity(path: &Path) -> Result<LockIdentity, ProjectIoError> {
    let file = File::open(path).map_err(|_| ProjectIoError::FilesystemError)?;
    lock_identity(&file)
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "android"))))]
fn publish_new_lock(
    _directory: &BoundProjectDirectory,
    acquisition: &mut LockAcquisitionGuard,
) -> Result<PublishLockOutcome, ProjectIoError> {
    if acquisition.newly_created {
        Err(ProjectIoError::FilesystemError)
    } else {
        Ok(PublishLockOutcome::Published)
    }
}

#[cfg(windows)]
fn publish_new_lock(
    _directory: &BoundProjectDirectory,
    _acquisition: &mut LockAcquisitionGuard,
) -> Result<PublishLockOutcome, ProjectIoError> {
    Ok(PublishLockOutcome::Published)
}

#[cfg(not(any(unix, windows)))]
fn publish_new_lock(
    _directory: &BoundProjectDirectory,
    _acquisition: &mut LockAcquisitionGuard,
) -> Result<PublishLockOutcome, ProjectIoError> {
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
    leaf: &OsStr,
    file: &File,
    expected: &LockIdentity,
) -> Result<(), ProjectIoError> {
    quarantine_unix_lock(directory, leaf, file, Some(expected))
}

#[cfg(unix)]
fn remove_newly_created_lock(
    directory: &Path,
    leaf: &OsStr,
    file: &File,
    expected: Option<&LockIdentity>,
) -> Result<(), ProjectIoError> {
    quarantine_unix_lock(directory, leaf, file, expected)
}

#[cfg(unix)]
fn quarantine_unix_lock(
    directory: &Path,
    leaf: &OsStr,
    file: &File,
    expected: Option<&LockIdentity>,
) -> Result<(), ProjectIoError> {
    use rustix::fs::{AtFlags, RenameFlags, renameat_with, unlinkat};
    use std::os::unix::fs::OpenOptionsExt;

    let directory_file = File::open(directory)?;
    let quarantine = OsString::from(format!(".aethertwin.lock.quarantine-{}", Uuid::new_v4()));
    renameat_with(
        &directory_file,
        leaf,
        &directory_file,
        &quarantine,
        RenameFlags::NOREPLACE,
    )
    .map_err(|_| ProjectIoError::FilesystemError)?;

    let Some(expected) = expected else {
        // Identity acquisition failed before the unique pending leaf was
        // published. Leave only an unambiguous quarantine artifact; never
        // create false `.aethertwin.lock` crash residue or guess by pathname.
        return Ok(());
    };
    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
    let current = match options.open(directory.join(&quarantine)) {
        Ok(current) => current,
        Err(error) => {
            let _ = renameat_with(
                &directory_file,
                &quarantine,
                &directory_file,
                leaf,
                RenameFlags::NOREPLACE,
            );
            return Err(error.into());
        }
    };
    if lock_identity(file)? != *expected || lock_identity(&current)? != *expected {
        drop(current);
        let _ = renameat_with(
            &directory_file,
            &quarantine,
            &directory_file,
            leaf,
            RenameFlags::NOREPLACE,
        );
        return Err(ProjectIoError::FilesystemError);
    }
    drop(current);
    unlinkat(&directory_file, &quarantine, AtFlags::empty())
        .map_err(|_| ProjectIoError::FilesystemError)?;
    directory_file.sync_all()?;
    Ok(())
}

#[cfg(windows)]
fn remove_locked_file(
    _directory: &Path,
    _leaf: &OsStr,
    file: &File,
    expected: &LockIdentity,
) -> Result<(), ProjectIoError> {
    if lock_identity(file)? != *expected {
        return Err(ProjectIoError::FilesystemError);
    }
    mark_file_for_deletion(file)
}

#[cfg(windows)]
fn remove_newly_created_lock(
    _directory: &Path,
    _leaf: &OsStr,
    file: &File,
    _expected: Option<&LockIdentity>,
) -> Result<(), ProjectIoError> {
    // The guard owns this exact handle from CREATE_NEW, so no path lookup or
    // identity query is needed even when identity acquisition itself failed.
    mark_file_for_deletion(file)
}

#[cfg(windows)]
fn mark_file_for_deletion(file: &File) -> Result<(), ProjectIoError> {
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
    _leaf: &OsStr,
    _file: &File,
    _expected: &LockIdentity,
) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}

#[cfg(not(any(unix, windows)))]
fn remove_newly_created_lock(
    _directory: &Path,
    _leaf: &OsStr,
    _file: &File,
    _expected: Option<&LockIdentity>,
) -> Result<(), ProjectIoError> {
    Err(ProjectIoError::FilesystemError)
}
