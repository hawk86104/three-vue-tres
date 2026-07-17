use crate::model::{CURRENT_SCHEMA_VERSION, Floor, parse_contract_uuid};
use crate::paths::{
    PROJECT_SUFFIX, StagingWorkspace, canonical_parent, normalize_project_name,
    validate_project_extension, validate_project_structure,
};
use crate::schema::{create_database, latest_snapshot, open_database, read_meta};
use crate::{
    CreateProjectRequest, OpenedProject, ProjectIoError, ProjectManifest, ProjectProfile,
    ProjectSnapshot, SpatialProject,
};
use chrono::{SecondsFormat, Utc};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use uuid::Uuid;

const APP_VERSION: &str = "0.1.0";
const PROJECT_DIRECTORIES: [&str; 4] = ["assets", "thumbnails", "derived", "exports"];

pub fn create_project(request: CreateProjectRequest) -> Result<OpenedProject, ProjectIoError> {
    let name = normalize_project_name(&request.name)?;
    let parent = canonical_parent(&request.parent)?;
    let destination = parent.join(format!("{name}{PROJECT_SUFFIX}"));
    if path_entry_exists(&destination) {
        return Err(ProjectIoError::ProjectAlreadyExists);
    }

    let mut staging = StagingWorkspace::create(&parent, &name)?;
    let staging_path = staging.bound_project_path().to_owned();

    let result = (|| {
        for directory in PROJECT_DIRECTORIES {
            fs::create_dir(staging_path.join(directory))?;
        }

        let timestamp = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        let project_id = Uuid::new_v4();
        let manifest = ProjectManifest {
            schema_version: CURRENT_SCHEMA_VERSION,
            project_id,
            name: name.clone(),
            profile: request.profile,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            app_version: APP_VERSION.into(),
            min_compatible_app_version: APP_VERSION.into(),
        };
        manifest.validate()?;
        let snapshot = initial_snapshot(project_id, &name, request.profile);
        snapshot.validate()?;

        create_database(&staging_path.join("project.db"), &manifest, &snapshot)?;
        write_manifest_atomically(&staging_path, &manifest)?;

        staging.publish(&destination)?;
        sync_directory(&parent)?;

        Ok(OpenedProject {
            project_path: destination,
            manifest,
            snapshot,
            recovered: false,
        })
    })();

    result
}

pub fn open_project(path: &Path) -> Result<OpenedProject, ProjectIoError> {
    validate_project_extension(path)?;
    let project_path = validate_project_structure(path)?;
    let mut manifest = read_manifest(&project_path.join("manifest.json"))?;
    let connection = open_database(&project_path.join("project.db"))?;

    let database_schema: u32 = read_immutable_meta(&connection, "schemaVersion")?;
    let database_id_text: String = read_immutable_meta(&connection, "projectId")?;
    let database_id = parse_contract_uuid(&database_id_text)
        .map_err(|_| ProjectIoError::ManifestDatabaseMismatch)?;
    let database_profile: ProjectProfile = read_immutable_meta(&connection, "profile")?;
    let database_created_at: String = read_immutable_meta(&connection, "createdAt")?;
    let database_app_version: String = read_immutable_meta(&connection, "appVersion")?;
    let database_min_compatible_app_version: String =
        read_immutable_meta(&connection, "minCompatibleAppVersion")?;
    if manifest.schema_version != database_schema
        || manifest.project_id != database_id
        || manifest.profile != database_profile
        || manifest.created_at != database_created_at
        || manifest.app_version != database_app_version
        || manifest.min_compatible_app_version != database_min_compatible_app_version
    {
        return Err(ProjectIoError::ManifestDatabaseMismatch);
    }

    let snapshot = latest_snapshot(&connection)?;
    if snapshot.schema_version != manifest.schema_version
        || snapshot.project.id != manifest.project_id
        || snapshot.project.profile != manifest.profile
    {
        return Err(ProjectIoError::ManifestDatabaseMismatch);
    }

    let database_name: String = read_meta(&connection, "name")?;
    let database_updated_at: String = read_meta(&connection, "updatedAt")?;
    if manifest.name != database_name || manifest.updated_at != database_updated_at {
        manifest.name = database_name;
        manifest.updated_at = database_updated_at;
        manifest.validate()?;
        write_manifest_atomically(&project_path, &manifest)?;
    }

    Ok(OpenedProject {
        project_path,
        manifest,
        snapshot,
        recovered: false,
    })
}

fn read_immutable_meta<T: DeserializeOwned>(
    connection: &rusqlite::Connection,
    key: &str,
) -> Result<T, ProjectIoError> {
    read_meta(connection, key).map_err(|_| ProjectIoError::ManifestDatabaseMismatch)
}

fn initial_snapshot(id: Uuid, name: &str, profile: ProjectProfile) -> ProjectSnapshot {
    ProjectSnapshot {
        schema_version: CURRENT_SCHEMA_VERSION,
        sequence: 0,
        checkpoint_sequence: 0,
        project: SpatialProject {
            id,
            name: name.into(),
            tags: Vec::new(),
            profile,
            floors: vec![Floor {
                id: Uuid::new_v4(),
                name: "一层".into(),
                tags: Vec::new(),
            }],
        },
        assets: Vec::new(),
    }
}

fn path_entry_exists(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => true,
    }
}

fn read_manifest(path: &Path) -> Result<ProjectManifest, ProjectIoError> {
    let bytes = fs::read(path).map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    match value.get("schemaVersion").and_then(Value::as_u64) {
        Some(version) if version > u64::from(CURRENT_SCHEMA_VERSION) => {
            return Err(ProjectIoError::UnsupportedSchemaVersion);
        }
        Some(_) => {}
        None => return Err(ProjectIoError::InvalidProjectStructure),
    }
    let manifest: ProjectManifest =
        serde_json::from_value(value).map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    manifest.validate()?;
    Ok(manifest)
}

fn write_manifest_atomically(
    project_path: &Path,
    manifest: &ProjectManifest,
) -> Result<(), ProjectIoError> {
    let temporary = project_path.join(format!("manifest.json.tmp-{}", Uuid::new_v4()));
    let destination = project_path.join("manifest.json");
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        serde_json::to_writer_pretty(&mut file, manifest)
            .map_err(|_| ProjectIoError::FilesystemError)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        drop(file);
        let replace_existing = path_entry_exists(&destination);
        replace_file_atomically(&temporary, &destination, replace_existing)?;
        sync_directory(project_path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), ProjectIoError> {
    fs::File::open(path)?.sync_all()?;
    Ok(())
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), ProjectIoError> {
    Ok(())
}

#[cfg(not(windows))]
fn replace_file_atomically(
    source: &Path,
    destination: &Path,
    _replace_existing: bool,
) -> Result<(), ProjectIoError> {
    fs::rename(source, destination).map_err(ProjectIoError::from)
}

#[cfg(windows)]
fn replace_file_atomically(
    source: &Path,
    destination: &Path,
    replace_existing: bool,
) -> Result<(), ProjectIoError> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: both path buffers are NUL-terminated and remain alive for the duration of the call.
    let flags = MOVEFILE_WRITE_THROUGH
        | if replace_existing {
            MOVEFILE_REPLACE_EXISTING
        } else {
            0
        };
    let result = unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), flags) };
    if result == 0 {
        return Err(ProjectIoError::FilesystemError);
    }
    Ok(())
}
