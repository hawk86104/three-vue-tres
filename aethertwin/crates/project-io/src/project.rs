use crate::lock::ProjectLock;
use crate::model::{
    CURRENT_SCHEMA_VERSION, AssetRecord, CommitBatch, Floor, GuidedRoute, JournalAction,
    JournalOperation, MaterialAssignment, MaterialDefinition, MediaAsset,
    Opening, PlanLayer, PlanReference, ProductContent, RecordChange, RouteNetwork, SaveState,
    SceneEnvironment, SnapshotRecordsPatch, canonical_asset_path, parse_contract_uuid,
};
use crate::paths::{
    PROJECT_SUFFIX, RecoveryCopy, StagingWorkspace, canonical_parent, normalize_project_name,
    validate_project_extension, validate_project_structure,
};
use crate::schema::{
    checkpoint_wal, create_database, latest_snapshot, open_database, read_meta, snapshot_checksum,
    timestamp_now, upsert_meta,
};
use crate::{
    CheckpointResult, CreateProjectRequest, OpenedProject, ProjectIoError, ProjectManifest,
    ProjectProfile, ProjectSnapshot, SpatialProject,
};
use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
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
    load_opened_project(&project_path, &project_path, true)
}

pub(crate) fn load_opened_project(
    io_path: &Path,
    returned_path: &Path,
    repair_manifest: bool,
) -> Result<OpenedProject, ProjectIoError> {
    let mut manifest = read_manifest(&io_path.join("manifest.json"))?;
    let connection = open_database(&io_path.join("project.db"))?;

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
        if repair_manifest {
            write_manifest_atomically(io_path, &manifest)?;
        }
    }

    Ok(OpenedProject {
        project_path: returned_path.to_owned(),
        manifest,
        snapshot,
        recovered: false,
    })
}

fn upgrade_opened_project(
    connection: &mut Connection,
    io_path: &Path,
    opened: OpenedProject,
    previous_manifest: &[u8],
) -> Result<(OpenedProject, Vec<u8>), ProjectIoError> {
    if opened.snapshot.schema_version == CURRENT_SCHEMA_VERSION {
        if opened.manifest.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(ProjectIoError::ManifestDatabaseMismatch);
        }
        return Ok((opened, previous_manifest.to_vec()));
    }
    if opened.manifest.schema_version != opened.snapshot.schema_version {
        return Err(ProjectIoError::ManifestDatabaseMismatch);
    }

    let opened_snapshot_value =
        serde_json::to_value(&opened.snapshot).map_err(|_| ProjectIoError::DatabaseError)?;
    let migrated_opened_snapshot = migrate_snapshot_value(opened_snapshot_value)?;
    let mut migrated_manifest = opened.manifest.clone();
    migrated_manifest.schema_version = CURRENT_SCHEMA_VERSION;
    migrated_manifest.validate()?;
    let published_manifest = serialize_manifest(&migrated_manifest)?;

    let transaction = connection.transaction()?;
    let stored_rows: Vec<(i64, String, String)> = {
        let mut statement = transaction.prepare(
            "SELECT sequence, snapshot_json, checksum FROM snapshots ORDER BY sequence",
        )?;
        statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<_, _>>()?
    };
    if stored_rows.is_empty() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    let mut migrated_rows = Vec::with_capacity(stored_rows.len());
    for (row_sequence, snapshot_json, checksum) in stored_rows {
        if row_sequence < 0 || checksum != snapshot_checksum(&snapshot_json) {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let stored: ProjectSnapshot = serde_json::from_str(&snapshot_json)
            .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
        stored.validate()?;
        if stored.sequence != row_sequence as u64
            || stored.schema_version != opened.snapshot.schema_version
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let migrated = migrate_snapshot_value(
            serde_json::from_str(&snapshot_json)
                .map_err(|_| ProjectIoError::InvalidProjectStructure)?,
        )?;
        let migrated_json =
            serde_json::to_string(&migrated).map_err(|_| ProjectIoError::DatabaseError)?;
        migrated_rows.push((row_sequence, migrated_json));
    }

    for (row_sequence, snapshot_json) in migrated_rows {
        transaction.execute(
            "UPDATE snapshots SET snapshot_json = ?1, checksum = ?2 WHERE sequence = ?3",
            params![
                snapshot_json,
                snapshot_checksum(&snapshot_json),
                row_sequence,
            ],
        )?;
    }
    upsert_meta(&transaction, "schemaVersion", &CURRENT_SCHEMA_VERSION)?;
    write_entity_records(&transaction, &migrated_opened_snapshot)?;
    write_asset_records(&transaction, &migrated_opened_snapshot)?;

    publish_manifest_with_restore(io_path, &published_manifest, previous_manifest)?;
    if transaction.commit().is_err() {
        if write_manifest_bytes_atomically(io_path, previous_manifest).is_err() {
            return Err(ProjectIoError::RecoveryFailed);
        }
        return Err(ProjectIoError::DatabaseError);
    }

    Ok((
        OpenedProject {
            project_path: opened.project_path,
            manifest: migrated_manifest,
            snapshot: migrated_opened_snapshot,
            recovered: opened.recovered,
        },
        published_manifest,
    ))
}

pub struct ProjectSession {
    project_path: std::path::PathBuf,
    snapshot: ProjectSnapshot,
    manifest: ProjectManifest,
    manifest_bytes: Vec<u8>,
    save_state: SaveState,
    connection: Option<Connection>,
    lock: Option<ProjectLock>,
    closed: bool,
}

impl std::fmt::Debug for ProjectSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ProjectSession")
            .field("project_path", &self.project_path)
            .field("snapshot", &self.snapshot)
            .field("manifest", &self.manifest)
            .field("save_state", &self.save_state)
            .field("closed", &self.closed)
            .finish_non_exhaustive()
    }
}

pub fn open_session(
    path: &Path,
    recover_stale_lock: bool,
) -> Result<ProjectSession, ProjectIoError> {
    let mut lock = ProjectLock::acquire(path, recover_stale_lock)?;
    let mut recovery_copy = None;
    let recovered = if lock.stale_recovered() {
        true
    } else {
        let copy = match lock.create_recovery_copy() {
            Ok(copy) => copy,
            Err(error) => {
                let _ = lock.clean_close();
                return Err(error);
            }
        };
        match inspect_clean_shutdown_copy(&copy) {
            Ok(true) => {
                if let Err(error) = copy.remove() {
                    let _ = lock.clean_close();
                    return Err(error);
                }
                false
            }
            Ok(false) => {
                recovery_copy = Some(copy);
                true
            }
            Err(error) => {
                let _ = lock.clean_close();
                return Err(error);
            }
        }
    };
    if recovered && !recover_stale_lock {
        if let Some(copy) = recovery_copy.take() {
            let _ = copy.remove();
        }
        if !lock.stale_recovered() {
            let _ = lock.clean_close();
        }
        return Err(ProjectIoError::StaleProjectLock);
    }
    let mut opened_result = if recovered {
        let recovered = match recovery_copy {
            Some(copy) => recover_from_copy(copy, lock.canonical_path()),
            None => recover_with_lock(&lock),
        };
        match recovered {
            Ok(opened) => opened,
            Err(error) => {
                if !lock.stale_recovered() {
                    let _ = lock.clean_close();
                }
                return Err(error);
            }
        }
    } else {
        match load_opened_project(lock.bound_path(), lock.canonical_path(), true) {
            Ok(opened) => opened,
            Err(error) => {
                let _ = lock.clean_close();
                return Err(error);
            }
        }
    };
    let mut manifest_bytes = match fs::read(lock.bound_path().join("manifest.json")) {
        Ok(bytes) => bytes,
        Err(error) => {
            if !lock.stale_recovered() {
                let _ = lock.clean_close();
            }
            return Err(error.into());
        }
    };
    let mut connection = match open_database(&lock.bound_path().join("project.db")) {
        Ok(connection) => connection,
        Err(error) => {
            if !lock.stale_recovered() {
                let _ = lock.clean_close();
            }
            return Err(error);
        }
    };
    if opened_result.snapshot.schema_version != CURRENT_SCHEMA_VERSION {
        match upgrade_opened_project(
            &mut connection,
            lock.bound_path(),
            opened_result,
            &manifest_bytes,
        ) {
            Ok((upgraded, published_manifest)) => {
                opened_result = upgraded;
                manifest_bytes = published_manifest;
            }
            Err(error) => {
                drop(connection);
                if !lock.stale_recovered() {
                    let _ = lock.clean_close();
                }
                return Err(error);
            }
        }
    }
    if let Err(error) = upsert_meta(&connection, "cleanShutdown", &false) {
        drop(connection);
        if !lock.stale_recovered() {
            let _ = lock.clean_close();
        }
        return Err(error);
    }
    let save_state = if recovered {
        SaveState::Recovered
    } else if opened_result.snapshot.sequence == opened_result.snapshot.checkpoint_sequence {
        SaveState::Saved
    } else {
        SaveState::Dirty
    };
    Ok(ProjectSession {
        project_path: opened_result.project_path,
        snapshot: opened_result.snapshot,
        manifest: opened_result.manifest,
        manifest_bytes,
        save_state,
        connection: Some(connection),
        lock: Some(lock),
        closed: false,
    })
}

pub fn recover_project(path: &Path, confirm: bool) -> Result<OpenedProject, ProjectIoError> {
    if !confirm {
        return Err(ProjectIoError::StaleProjectLock);
    }
    let lock = ProjectLock::acquire(path, true)?;
    let opened = recover_with_lock(&lock)?;
    let previous_manifest = fs::read(lock.bound_path().join("manifest.json"))?;
    let mut connection = open_database(&lock.bound_path().join("project.db"))?;
    let (upgraded, _) = upgrade_opened_project(
        &mut connection,
        lock.bound_path(),
        opened,
        &previous_manifest,
    )?;
    Ok(upgraded)
}

impl ProjectSession {
    pub fn project_path(&self) -> &Path {
        &self.project_path
    }

    pub fn manifest(&self) -> &ProjectManifest {
        &self.manifest
    }

    pub fn snapshot(&self) -> &ProjectSnapshot {
        &self.snapshot
    }

    pub fn save_state(&self) -> SaveState {
        self.save_state
    }

    pub fn commit(&mut self, batch: CommitBatch) -> Result<(), ProjectIoError> {
        let result = self.commit_inner(batch);
        if result.is_err() {
            self.save_state = SaveState::Error;
        }
        result
    }

    fn commit_inner(&mut self, batch: CommitBatch) -> Result<(), ProjectIoError> {
        if self.closed || batch.before != self.snapshot {
            return Err(ProjectIoError::DatabaseError);
        }
        validate_commit_batch(&batch)?;
        let connection = self
            .connection
            .as_mut()
            .ok_or(ProjectIoError::DatabaseError)?;
        let last_committed: u64 = read_meta(connection, "lastCommittedSequence")?;
        if last_committed != self.snapshot.sequence {
            return Err(ProjectIoError::DatabaseError);
        }

        let transaction = connection.transaction()?;
        let reused_transaction: bool = transaction.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM command_journal WHERE transaction_id = ?1
             )",
            [&batch.journal[0].transaction_id],
            |row| row.get(0),
        )?;
        if reused_transaction {
            return Err(ProjectIoError::DatabaseError);
        }
        write_entity_records(&transaction, &batch.after)?;
        write_asset_records(&transaction, &batch.after)?;
        for operation in &batch.journal {
            transaction.execute(
                "INSERT INTO command_journal(
                   sequence, transaction_id, command_type, payload_json,
                   inverse_payload_json, action, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    sequence_i64(operation.sequence)?,
                    operation.transaction_id,
                    operation.command_type,
                    serde_json::to_string(&operation.payload)
                        .map_err(|_| ProjectIoError::DatabaseError)?,
                    serde_json::to_string(&operation.inverse_payload)
                        .map_err(|_| ProjectIoError::DatabaseError)?,
                    journal_action_text(operation.action),
                    operation.timestamp,
                ],
            )?;
        }
        let updated_at = timestamp_now();
        upsert_meta(&transaction, "lastCommittedSequence", &batch.after.sequence)?;
        upsert_meta(&transaction, "name", &batch.after.project.name)?;
        upsert_meta(&transaction, "updatedAt", &updated_at)?;
        upsert_meta(&transaction, "cleanShutdown", &false)?;
        transaction.commit()?;

        self.snapshot = batch.after;
        self.save_state = SaveState::Dirty;
        Ok(())
    }

    pub fn checkpoint(
        &mut self,
        requested: ProjectSnapshot,
    ) -> Result<CheckpointResult, ProjectIoError> {
        self.save_state = SaveState::Saving;
        let result = validate_checkpoint_request(&self.snapshot, &requested)
            .and_then(|()| self.checkpoint_inner(requested));
        if result.is_err() {
            self.save_state = SaveState::Error;
        }
        result
    }

    fn checkpoint_inner(
        &mut self,
        requested: ProjectSnapshot,
    ) -> Result<CheckpointResult, ProjectIoError> {
        if self.closed {
            return Err(ProjectIoError::DatabaseError);
        }
        self.ensure_connection()?;
        let mut checkpoint = requested;
        checkpoint.checkpoint_sequence = checkpoint.sequence;
        checkpoint.validate()?;
        let snapshot_json =
            serde_json::to_string(&checkpoint).map_err(|_| ProjectIoError::DatabaseError)?;
        let updated_at = timestamp_now();
        let mut manifest = self.manifest.clone();
        manifest.schema_version = checkpoint.schema_version;
        manifest.name = checkpoint.project.name.clone();
        manifest.updated_at = updated_at.clone();
        manifest.validate()?;
        let published_manifest = serialize_manifest(&manifest)?;
        let io_path = self
            .lock
            .as_ref()
            .ok_or(ProjectIoError::FilesystemError)?
            .bound_path()
            .to_owned();
        let previous_manifest = self.manifest_bytes.clone();
        let connection = self
            .connection
            .as_mut()
            .ok_or(ProjectIoError::DatabaseError)?;
        let transaction = connection.transaction()?;
        write_entity_records(&transaction, &checkpoint)?;
        write_asset_records(&transaction, &checkpoint)?;
        transaction.execute(
            "INSERT INTO snapshots(sequence, snapshot_json, checksum, created_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(sequence) DO UPDATE SET
               snapshot_json = excluded.snapshot_json,
               checksum = excluded.checksum,
               created_at = excluded.created_at",
            params![
                sequence_i64(checkpoint.sequence)?,
                snapshot_json,
                snapshot_checksum(&snapshot_json),
                updated_at,
            ],
        )?;
        upsert_meta(&transaction, "lastCheckpointSequence", &checkpoint.sequence)?;
        upsert_meta(&transaction, "schemaVersion", &checkpoint.schema_version)?;
        upsert_meta(&transaction, "name", &checkpoint.project.name)?;
        upsert_meta(&transaction, "updatedAt", &updated_at)?;
        upsert_meta(&transaction, "cleanShutdown", &false)?;
        publish_manifest_with_restore(
            &io_path,
            &published_manifest,
            &previous_manifest,
        )?;
        if transaction.commit().is_err() {
            if write_manifest_bytes_atomically(&io_path, &previous_manifest).is_err() {
                return Err(ProjectIoError::RecoveryFailed);
            }
            return Err(ProjectIoError::DatabaseError);
        }
        self.snapshot = checkpoint.clone();
        self.manifest = manifest.clone();
        self.manifest_bytes = published_manifest;
        self.save_state = SaveState::Saved;
        Ok(CheckpointResult {
            manifest,
            snapshot: checkpoint,
        })
    }

    pub fn close(&mut self) -> Result<(), ProjectIoError> {
        if self.closed {
            return Ok(());
        }
        if let Err(error) = self.close_inner() {
            self.save_state = SaveState::Error;
            return Err(error);
        }
        self.save_state = SaveState::Saved;
        self.closed = true;
        Ok(())
    }

    fn close_inner(&mut self) -> Result<(), ProjectIoError> {
        if self.snapshot.schema_version == CURRENT_SCHEMA_VERSION {
            self.checkpoint_inner(self.snapshot.clone())?;
        }
        let connection = self
            .connection
            .as_ref()
            .ok_or(ProjectIoError::DatabaseError)?;
        upsert_meta(connection, "cleanShutdown", &true)?;
        checkpoint_wal(connection)?;
        let connection = self
            .connection
            .take()
            .ok_or(ProjectIoError::DatabaseError)?;
        if let Err((connection, _)) = connection.close() {
            self.connection = Some(connection);
            return Err(ProjectIoError::DatabaseError);
        }
        self.lock
            .as_mut()
            .ok_or(ProjectIoError::FilesystemError)?
            .clean_close()?;
        self.lock.take();
        Ok(())
    }

    fn ensure_connection(&mut self) -> Result<(), ProjectIoError> {
        if self.connection.is_none() {
            let path = self
                .lock
                .as_ref()
                .ok_or(ProjectIoError::DatabaseError)?
                .bound_path()
                .join("project.db");
            self.connection = Some(open_database(&path)?);
        }
        Ok(())
    }
}

impl Drop for ProjectSession {
    fn drop(&mut self) {
        self.connection.take();
        // ProjectLock::drop releases only the OS lock; crash metadata is intentionally retained.
    }
}

fn validate_checkpoint_request(
    current: &ProjectSnapshot,
    requested: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    current.validate()?;
    requested.validate()?;
    if current == requested && current.schema_version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    }
    if current.schema_version != 1
        || requested.schema_version != 2
        || current.sequence != requested.sequence
        || current.checkpoint_sequence != requested.checkpoint_sequence
        || current.project.id != requested.project.id
        || current.project.name != requested.project.name
        || current.project.tags != requested.project.tags
        || current.project.profile != requested.project.profile
        || current.assets != requested.assets
        || current.project.floors.len() != requested.project.floors.len()
        || !requested.project.entities.is_empty()
        || !requested.project.vendors.is_empty()
        || !requested.project.product_contents.is_empty()
        || !requested.project.media_assets.is_empty()
        || !requested.project.route_networks.is_empty()
        || !requested.project.themes.is_empty()
        || !requested.project.camera_shots.is_empty()
        || !requested.project.story_sequences.is_empty()
    {
        return Err(ProjectIoError::DatabaseError);
    }
    for (before, after) in current
        .project
        .floors
        .iter()
        .zip(&requested.project.floors)
    {
        let expected_layer = PlanLayer {
            id: default_layer_id_for_floor(before.id),
            name: "默认图层".into(),
            tags: Vec::new(),
            visible: true,
            locked: false,
        };
        if before.id != after.id
            || before.name != after.name
            || before.tags != after.tags
            || !before.layers.is_empty()
            || after.layers.len() != 1
            || after.layers.first() != Some(&expected_layer)
        {
            return Err(ProjectIoError::DatabaseError);
        }
    }
    Ok(())
}

fn default_layer_id_for_floor(floor_id: Uuid) -> Uuid {
    let mut bytes = *floor_id.as_bytes();
    bytes[15] ^= 0xa7;
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

pub fn validate_commit_batch(batch: &CommitBatch) -> Result<(), ProjectIoError> {
    batch
        .before
        .validate()
        .map_err(|_| ProjectIoError::DatabaseError)?;
    batch.after.validate().map_err(|_| ProjectIoError::DatabaseError)?;
    if batch.journal.is_empty()
        || batch.after.checkpoint_sequence != batch.before.checkpoint_sequence
        || batch.after.sequence
            != batch
                .before
                .sequence
                .checked_add(batch.journal.len() as u64)
                .ok_or(ProjectIoError::DatabaseError)?
    {
        return Err(ProjectIoError::DatabaseError);
    }
    let transaction_id = &batch.journal[0].transaction_id;
    let action = batch.journal[0].action;
    if !valid_transaction_id(transaction_id) {
        return Err(ProjectIoError::DatabaseError);
    }

    let mut replayed = batch.before.clone();
    for (index, operation) in batch.journal.iter().enumerate() {
        let expected_sequence = batch.before.sequence + index as u64 + 1;
        if operation.sequence != expected_sequence
            || operation.transaction_id != *transaction_id
            || operation.action != action
            || !valid_journal_timestamp(&operation.timestamp)
        {
            return Err(ProjectIoError::DatabaseError);
        }
        apply_operation(&mut replayed, operation)?;
    }
    if replayed != batch.after {
        return Err(ProjectIoError::DatabaseError);
    }
    Ok(())
}

fn valid_transaction_id(value: &str) -> bool {
    let Ok(uuid) = Uuid::parse_str(value) else {
        return false;
    };
    matches!(uuid.get_version_num(), 1..=5)
        && matches!(uuid.get_variant(), uuid::Variant::RFC4122)
        && uuid.hyphenated().to_string() == value.to_ascii_lowercase()
}

fn valid_journal_timestamp(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value).is_ok()
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum PlanEditReason {
    Create,
    Delete,
    Transform,
    Properties,
    Duplicate,
    Array,
    Align,
    Distribute,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntityPatchPayload {
    reason: PlanEditReason,
    changes: Vec<EntityPatchChange>,
}

fn deserialize_present_entity_index<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    u64::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EntityPatchChange {
    id: String,
    before: Value,
    after: Value,
    #[serde(default, deserialize_with = "deserialize_present_entity_index")]
    index: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FloorPatchPayload {
    floor_id: String,
    before: ReplayFloor,
    after: ReplayFloor,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayFloor {
    id: String,
    name: String,
    tags: Vec<String>,
    layers: Vec<ReplayPlanLayer>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayPlanLayer {
    id: String,
    name: String,
    tags: Vec<String>,
    visible: bool,
    locked: bool,
}

impl ReplayFloor {
    fn into_native(self) -> Result<Floor, ProjectIoError> {
        Ok(Floor {
            id: canonical_patch_id(&self.id)?,
            name: self.name,
            tags: self.tags,
            layers: self
                .layers
                .into_iter()
                .map(|layer| {
                    Ok(PlanLayer {
                        id: canonical_patch_id(&layer.id)?,
                        name: layer.name,
                        tags: layer.tags,
                        visible: layer.visible,
                        locked: layer.locked,
                    })
                })
                .collect::<Result<_, ProjectIoError>>()?,
        })
    }
}

fn canonical_patch_id(value: &str) -> Result<Uuid, ProjectIoError> {
    let id = parse_contract_uuid(value).map_err(|_| ProjectIoError::DatabaseError)?;
    if id.hyphenated().to_string() != value {
        return Err(ProjectIoError::DatabaseError);
    }
    Ok(id)
}

fn entity_patch(value: &Value) -> Result<EntityPatchPayload, ProjectIoError> {
    const MAX_JSON_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

    let payload: EntityPatchPayload =
        serde_json::from_value(value.clone()).map_err(|_| ProjectIoError::DatabaseError)?;
    let mut ids = BTreeSet::new();
    for change in &payload.changes {
        canonical_patch_id(&change.id)?;
        if !ids.insert(change.id.as_str()) || (change.before.is_null() && change.after.is_null()) {
            return Err(ProjectIoError::DatabaseError);
        }
        if change.index.is_some_and(|index| index > MAX_JSON_SAFE_INTEGER) {
            return Err(ProjectIoError::DatabaseError);
        }
        for side in [&change.before, &change.after] {
            if side.is_null() {
                continue;
            }
            let id = side
                .as_object()
                .and_then(|source| source.get("id"))
                .and_then(Value::as_str)
                .ok_or(ProjectIoError::DatabaseError)?;
            canonical_patch_id(id)?;
            if id != change.id {
                return Err(ProjectIoError::DatabaseError);
            }
        }
    }
    Ok(payload)
}

fn exact_entity_inverse(payload: &EntityPatchPayload, inverse: &EntityPatchPayload) -> bool {
    payload.reason == inverse.reason
        && payload.changes.len() == inverse.changes.len()
        && payload
            .changes
            .iter()
            .rev()
            .zip(&inverse.changes)
            .all(|(change, reversed)| {
                change.id == reversed.id
                    && change.before == reversed.after
                    && change.after == reversed.before
                    && change.index == reversed.index
            })
}

fn apply_entity_patch(
    snapshot: &mut ProjectSnapshot,
    payload: &EntityPatchPayload,
) -> Result<EntityPatchPayload, ProjectIoError> {
    let mut entities = snapshot.project.entities.clone();
    let mut changes = Vec::with_capacity(payload.changes.len());
    for change in &payload.changes {
        let position = entities.iter().position(|entity| {
            entity
                .as_object()
                .and_then(|source| source.get("id"))
                .and_then(Value::as_str)
                == Some(change.id.as_str())
        });
        let supplied_index = change
            .index
            .map(usize::try_from)
            .transpose()
            .map_err(|_| ProjectIoError::DatabaseError)?;
        if change.before.is_null() {
            if position.is_some() {
                return Err(ProjectIoError::DatabaseError);
            }
            let index = supplied_index.unwrap_or(entities.len());
            if index > entities.len() {
                return Err(ProjectIoError::DatabaseError);
            }
            entities.insert(index, change.after.clone());
            changes.push(EntityPatchChange {
                id: change.id.clone(),
                before: change.before.clone(),
                after: change.after.clone(),
                index: Some(index as u64),
            });
        } else {
            let index = position.ok_or(ProjectIoError::DatabaseError)?;
            if entities[index] != change.before
                || supplied_index.is_some_and(|supplied| supplied != index)
            {
                return Err(ProjectIoError::DatabaseError);
            }
            changes.push(EntityPatchChange {
                id: change.id.clone(),
                before: change.before.clone(),
                after: change.after.clone(),
                index: Some(index as u64),
            });
            if change.after.is_null() {
                entities.remove(index);
            } else {
                entities[index] = change.after.clone();
            }
        }
    }
    snapshot.project.entities = entities;
    Ok(EntityPatchPayload {
        reason: payload.reason.clone(),
        changes,
    })
}

trait SnapshotPatchRecord {
    fn patch_id(&self) -> Uuid;
}

macro_rules! impl_snapshot_patch_record {
    ($($record:ty),+ $(,)?) => {
        $(
            impl SnapshotPatchRecord for $record {
                fn patch_id(&self) -> Uuid {
                    self.id
                }
            }
        )+
    };
}

impl_snapshot_patch_record!(
    AssetRecord,
    PlanReference,
    Opening,
    ProductContent,
    MediaAsset,
    RouteNetwork,
    GuidedRoute,
    MaterialDefinition,
    MaterialAssignment,
);

fn validate_record_changes<T: SnapshotPatchRecord>(
    changes: &[RecordChange<T>],
) -> Result<(), ProjectIoError> {
    const MAX_JSON_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

    let mut ids = BTreeSet::new();
    for change in changes {
        let id = canonical_patch_id(&change.id)?;
        if !ids.insert(change.id.as_str())
            || (change.before.0.is_none() && change.after.0.is_none())
            || change
                .index
                .is_some_and(|index| index > MAX_JSON_SAFE_INTEGER)
        {
            return Err(ProjectIoError::DatabaseError);
        }
        for side in [change.before.0.as_ref(), change.after.0.as_ref()] {
            if side.is_some_and(|record| record.patch_id() != id) {
                return Err(ProjectIoError::DatabaseError);
            }
        }
    }
    Ok(())
}

fn validate_snapshot_records_patch(
    patch: &SnapshotRecordsPatch,
) -> Result<(), ProjectIoError> {
    match patch {
        SnapshotRecordsPatch::Assets { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::PlanReferences { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::Openings { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::ProductContents { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::MediaAssets { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::RouteNetworks { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::GuidedRoutes { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::Materials { changes } => validate_record_changes(changes),
        SnapshotRecordsPatch::MaterialAssignments { changes } => validate_record_changes(changes),
    }
}

fn snapshot_records_patch(value: &Value) -> Result<SnapshotRecordsPatch, ProjectIoError> {
    let patch: SnapshotRecordsPatch =
        serde_json::from_value(value.clone()).map_err(|_| ProjectIoError::DatabaseError)?;
    validate_snapshot_records_patch(&patch)?;
    Ok(patch)
}

fn apply_record_changes<T>(
    records: &mut Vec<T>,
    changes: &[RecordChange<T>],
) -> Result<Vec<RecordChange<T>>, ProjectIoError>
where
    T: Clone + PartialEq + SnapshotPatchRecord,
{
    let mut normalized = Vec::with_capacity(changes.len());
    for change in changes {
        let id = canonical_patch_id(&change.id)?;
        let positions = records
            .iter()
            .enumerate()
            .filter_map(|(index, record)| (record.patch_id() == id).then_some(index))
            .collect::<Vec<_>>();
        let supplied_index = change
            .index
            .map(usize::try_from)
            .transpose()
            .map_err(|_| ProjectIoError::DatabaseError)?;
        match change.before.0.as_ref() {
            None => {
                if !positions.is_empty() {
                    return Err(ProjectIoError::DatabaseError);
                }
                let index = supplied_index.unwrap_or(records.len());
                if index > records.len() {
                    return Err(ProjectIoError::DatabaseError);
                }
                records.insert(
                    index,
                    change
                        .after
                        .0
                        .clone()
                        .ok_or(ProjectIoError::DatabaseError)?,
                );
                normalized.push(RecordChange {
                    id: change.id.clone(),
                    before: change.before.clone(),
                    after: change.after.clone(),
                    index: Some(index as u64),
                });
            }
            Some(before) => {
                if positions.len() != 1 {
                    return Err(ProjectIoError::DatabaseError);
                }
                let index = positions[0];
                if &records[index] != before
                    || supplied_index.is_some_and(|supplied| supplied != index)
                {
                    return Err(ProjectIoError::DatabaseError);
                }
                normalized.push(RecordChange {
                    id: change.id.clone(),
                    before: change.before.clone(),
                    after: change.after.clone(),
                    index: Some(index as u64),
                });
                match change.after.0.as_ref() {
                    Some(after) => records[index] = after.clone(),
                    None => {
                        records.remove(index);
                    }
                }
            }
        }
    }
    Ok(normalized)
}

fn typed_records<T: DeserializeOwned>(values: &[Value]) -> Result<Vec<T>, ProjectIoError> {
    values
        .iter()
        .cloned()
        .map(|value| serde_json::from_value(value).map_err(|_| ProjectIoError::DatabaseError))
        .collect()
}

fn record_values<T: Serialize>(records: &[T]) -> Result<Vec<Value>, ProjectIoError> {
    records
        .iter()
        .map(|record| serde_json::to_value(record).map_err(|_| ProjectIoError::DatabaseError))
        .collect()
}

fn apply_snapshot_records_patch(
    snapshot: &mut ProjectSnapshot,
    patch: &SnapshotRecordsPatch,
) -> Result<SnapshotRecordsPatch, ProjectIoError> {
    match patch {
        SnapshotRecordsPatch::Assets { changes } => Ok(SnapshotRecordsPatch::Assets {
            changes: apply_record_changes(&mut snapshot.assets, changes)?,
        }),
        SnapshotRecordsPatch::PlanReferences { changes } =>
            Ok(SnapshotRecordsPatch::PlanReferences {
                changes: apply_record_changes(&mut snapshot.project.plan_references, changes)?,
            }),
        SnapshotRecordsPatch::Openings { changes } => Ok(SnapshotRecordsPatch::Openings {
            changes: apply_record_changes(&mut snapshot.project.openings, changes)?,
        }),
        SnapshotRecordsPatch::ProductContents { changes } => {
            let mut records = typed_records::<ProductContent>(&snapshot.project.product_contents)?;
            let normalized = apply_record_changes(&mut records, changes)?;
            snapshot.project.product_contents = record_values(&records)?;
            Ok(SnapshotRecordsPatch::ProductContents { changes: normalized })
        }
        SnapshotRecordsPatch::MediaAssets { changes } => {
            let mut records = typed_records::<MediaAsset>(&snapshot.project.media_assets)?;
            let normalized = apply_record_changes(&mut records, changes)?;
            snapshot.project.media_assets = record_values(&records)?;
            Ok(SnapshotRecordsPatch::MediaAssets { changes: normalized })
        }
        SnapshotRecordsPatch::RouteNetworks { changes } => {
            let mut records = typed_records::<RouteNetwork>(&snapshot.project.route_networks)?;
            let normalized = apply_record_changes(&mut records, changes)?;
            snapshot.project.route_networks = record_values(&records)?;
            Ok(SnapshotRecordsPatch::RouteNetworks { changes: normalized })
        }
        SnapshotRecordsPatch::GuidedRoutes { changes } => Ok(SnapshotRecordsPatch::GuidedRoutes {
            changes: apply_record_changes(&mut snapshot.project.guided_routes, changes)?,
        }),
        SnapshotRecordsPatch::Materials { changes } => Ok(SnapshotRecordsPatch::Materials {
            changes: apply_record_changes(&mut snapshot.project.materials, changes)?,
        }),
        SnapshotRecordsPatch::MaterialAssignments { changes } =>
            Ok(SnapshotRecordsPatch::MaterialAssignments {
                changes: apply_record_changes(
                    &mut snapshot.project.material_assignments,
                    changes,
                )?,
            }),
    }
}

fn floor_patch(value: &Value) -> Result<FloorPatchPayload, ProjectIoError> {
    let payload: FloorPatchPayload =
        serde_json::from_value(value.clone()).map_err(|_| ProjectIoError::DatabaseError)?;
    let floor_id = canonical_patch_id(&payload.floor_id)?;
    if canonical_patch_id(&payload.before.id)? != floor_id
        || canonical_patch_id(&payload.after.id)? != floor_id
    {
        return Err(ProjectIoError::DatabaseError);
    }
    Ok(payload)
}

fn exact_floor_inverse(payload: &FloorPatchPayload, inverse: &FloorPatchPayload) -> bool {
    payload.floor_id == inverse.floor_id
        && payload.before == inverse.after
        && payload.after == inverse.before
}

fn apply_floor_patch(
    snapshot: &mut ProjectSnapshot,
    payload: FloorPatchPayload,
) -> Result<(), ProjectIoError> {
    let floor_id = canonical_patch_id(&payload.floor_id)?;
    let before = payload.before.into_native()?;
    let after = payload.after.into_native()?;
    let positions = snapshot
        .project
        .floors
        .iter()
        .enumerate()
        .filter_map(|(index, floor)| (floor.id == floor_id).then_some(index))
        .collect::<Vec<_>>();
    if positions.len() != 1 || snapshot.project.floors[positions[0]] != before {
        return Err(ProjectIoError::DatabaseError);
    }
    snapshot.project.floors[positions[0]] = after;
    Ok(())
}

fn validate_entity_floor_layer_references(
    snapshot: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    for entity in &snapshot.project.entities {
        let source = entity
            .as_object()
            .ok_or(ProjectIoError::DatabaseError)?;
        let floor_id = source
            .get("floorId")
            .and_then(Value::as_str)
            .ok_or(ProjectIoError::DatabaseError)?;
        let layer_id = source
            .get("layerId")
            .and_then(Value::as_str)
            .ok_or(ProjectIoError::DatabaseError)?;
        let floor_id = canonical_patch_id(floor_id)?;
        let layer_id = canonical_patch_id(layer_id)?;
        let floor = snapshot
            .project
            .floors
            .iter()
            .find(|floor| floor.id == floor_id)
            .ok_or(ProjectIoError::DatabaseError)?;
        if !floor.layers.iter().any(|layer| layer.id == layer_id) {
            return Err(ProjectIoError::DatabaseError);
        }
    }
    Ok(())
}

fn apply_operation(
    snapshot: &mut ProjectSnapshot,
    operation: &JournalOperation,
) -> Result<(), ProjectIoError> {
    let mut candidate = snapshot.clone();
    match operation.command_type.as_str() {
        "project.rename" => {
            let payload = operation
                .payload
                .get("name")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or(ProjectIoError::DatabaseError)?;
            let inverse = operation
                .inverse_payload
                .get("name")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or(ProjectIoError::DatabaseError)?;
            let (expected_before, next) = match operation.action {
                JournalAction::Undo => (payload, inverse),
                JournalAction::Apply | JournalAction::Redo => (inverse, payload),
            };
            if candidate.project.name != expected_before {
                return Err(ProjectIoError::DatabaseError);
            }
            candidate.project.name = next.to_owned();
        }
        "project.tags.set" => {
            let payload = string_array(&operation.payload, "tags")?;
            let inverse = string_array(&operation.inverse_payload, "tags")?;
            let (expected_before, next) = match operation.action {
                JournalAction::Undo => (&payload, &inverse),
                JournalAction::Apply | JournalAction::Redo => (&inverse, &payload),
            };
            if &candidate.project.tags != expected_before {
                return Err(ProjectIoError::DatabaseError);
            }
            candidate.project.tags = next.clone();
        }
        "plan.entities.patch" => {
            let payload = entity_patch(&operation.payload)?;
            let inverse = entity_patch(&operation.inverse_payload)?;
            let matching_values = payload.reason == inverse.reason
                && payload.changes.len() == inverse.changes.len()
                && payload
                    .changes
                    .iter()
                    .rev()
                    .zip(&inverse.changes)
                    .all(|(change, reversed)| {
                        change.id == reversed.id
                            && change.before == reversed.after
                            && change.after == reversed.before
                    });
            if !matching_values {
                return Err(ProjectIoError::DatabaseError);
            }
            match operation.action {
                JournalAction::Apply | JournalAction::Redo => {
                    let normalized = apply_entity_patch(&mut candidate, &payload)?;
                    if !exact_entity_inverse(&normalized, &inverse) {
                        return Err(ProjectIoError::DatabaseError);
                    }
                }
                JournalAction::Undo => {
                    let normalized_inverse = apply_entity_patch(&mut candidate, &inverse)?;
                    let mut replayed = candidate.clone();
                    let normalized_payload = apply_entity_patch(&mut replayed, &payload)?;
                    if !exact_entity_inverse(&normalized_payload, &normalized_inverse) {
                        return Err(ProjectIoError::DatabaseError);
                    }
                }
            }
        }
        "snapshot.records.patch" => {
            let payload = snapshot_records_patch(&operation.payload)?;
            let inverse = snapshot_records_patch(&operation.inverse_payload)?;
            if !payload.has_inverse_values(&inverse) {
                return Err(ProjectIoError::DatabaseError);
            }
            match operation.action {
                JournalAction::Apply | JournalAction::Redo => {
                    let normalized =
                        apply_snapshot_records_patch(&mut candidate, &payload)?;
                    if !normalized.has_exact_inverse(&inverse) {
                        return Err(ProjectIoError::DatabaseError);
                    }
                }
                JournalAction::Undo => {
                    let normalized_inverse =
                        apply_snapshot_records_patch(&mut candidate, &inverse)?;
                    let mut replayed = candidate.clone();
                    let normalized_payload =
                        apply_snapshot_records_patch(&mut replayed, &payload)?;
                    if !normalized_payload.has_exact_inverse(&normalized_inverse) {
                        return Err(ProjectIoError::DatabaseError);
                    }
                }
            }
        }
        "plan.floor.patch" => {
            let payload = floor_patch(&operation.payload)?;
            let inverse = floor_patch(&operation.inverse_payload)?;
            if !exact_floor_inverse(&payload, &inverse) {
                return Err(ProjectIoError::DatabaseError);
            }
            let selected = match operation.action {
                JournalAction::Undo => inverse,
                JournalAction::Apply | JournalAction::Redo => payload,
            };
            apply_floor_patch(&mut candidate, selected)?;
        }
        _ => return Err(ProjectIoError::DatabaseError),
    }
    candidate.sequence = operation.sequence;
    candidate.validate()?;
    validate_entity_floor_layer_references(&candidate)?;
    *snapshot = candidate;
    Ok(())
}

fn string_array(value: &Value, key: &str) -> Result<Vec<String>, ProjectIoError> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or(ProjectIoError::DatabaseError)?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or(ProjectIoError::DatabaseError)
        })
        .collect()
}

struct NormalizedEntityRow {
    id: String,
    entity_type: String,
    parent_id: Option<String>,
    payload_json: String,
}

fn normalized_typed_row<T: Serialize>(
    id: Uuid,
    entity_type: &str,
    parent_id: Option<Uuid>,
    record: &T,
) -> Result<NormalizedEntityRow, ProjectIoError> {
    Ok(NormalizedEntityRow {
        id: id.hyphenated().to_string(),
        entity_type: entity_type.to_owned(),
        parent_id: parent_id.map(|id| id.hyphenated().to_string()),
        payload_json: serde_json::to_string(record)
            .map_err(|_| ProjectIoError::DatabaseError)?,
    })
}

fn normalized_entity_rows(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<NormalizedEntityRow>, ProjectIoError> {
    let project_id = snapshot.project.id;
    let mut rows = vec![normalized_typed_row(
        project_id,
        "project",
        None,
        &snapshot.project,
    )?];
    for floor in &snapshot.project.floors {
        rows.push(normalized_typed_row(
            floor.id,
            "floor",
            Some(project_id),
            floor,
        )?);
    }
    for entity in &snapshot.project.entities {
        let source = entity
            .as_object()
            .ok_or(ProjectIoError::DatabaseError)?;
        let id = source
            .get("id")
            .and_then(Value::as_str)
            .ok_or(ProjectIoError::DatabaseError)?;
        let entity_type = source
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or(ProjectIoError::DatabaseError)?;
        let floor_id = source
            .get("floorId")
            .and_then(Value::as_str)
            .ok_or(ProjectIoError::DatabaseError)?;
        canonical_patch_id(id)?;
        canonical_patch_id(floor_id)?;
        rows.push(NormalizedEntityRow {
            id: id.to_owned(),
            entity_type: entity_type.to_owned(),
            parent_id: Some(floor_id.to_owned()),
            payload_json: serde_json::to_string(entity)
                .map_err(|_| ProjectIoError::DatabaseError)?,
        });
    }
    for reference in &snapshot.project.plan_references {
        rows.push(normalized_typed_row(
            reference.id,
            "plan-reference",
            Some(reference.floor_id),
            reference,
        )?);
    }
    for opening in &snapshot.project.openings {
        rows.push(normalized_typed_row(
            opening.id,
            "opening",
            Some(opening.wall_id),
            opening,
        )?);
    }
    for value in &snapshot.project.product_contents {
        let record: ProductContent = serde_json::from_value(value.clone())
            .map_err(|_| ProjectIoError::DatabaseError)?;
        rows.push(normalized_typed_row(
            record.id,
            "product-content",
            Some(record.target_entity_id),
            &record,
        )?);
    }
    for value in &snapshot.project.media_assets {
        let record: MediaAsset = serde_json::from_value(value.clone())
            .map_err(|_| ProjectIoError::DatabaseError)?;
        rows.push(normalized_typed_row(
            record.id,
            "media-asset",
            Some(project_id),
            &record,
        )?);
    }
    for value in &snapshot.project.route_networks {
        let network: RouteNetwork = serde_json::from_value(value.clone())
            .map_err(|_| ProjectIoError::DatabaseError)?;
        rows.push(normalized_typed_row(
            network.id,
            "route-network",
            Some(project_id),
            &network,
        )?);
        for node in &network.nodes {
            rows.push(normalized_typed_row(
                node.id,
                "route-node",
                Some(network.id),
                node,
            )?);
        }
        for edge in &network.edges {
            rows.push(normalized_typed_row(
                edge.id,
                "route-edge",
                Some(network.id),
                edge,
            )?);
        }
    }
    for route in &snapshot.project.guided_routes {
        rows.push(normalized_typed_row(
            route.id,
            "guided-route",
            Some(route.route_network_id),
            route,
        )?);
    }
    for material in &snapshot.project.materials {
        rows.push(normalized_typed_row(
            material.id,
            "material",
            Some(project_id),
            material,
        )?);
    }
    for assignment in &snapshot.project.material_assignments {
        rows.push(normalized_typed_row(
            assignment.id,
            "material-assignment",
            Some(assignment.target_id),
            assignment,
        )?);
    }
    Ok(rows)
}

fn write_entity_records(
    connection: &Connection,
    snapshot: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    connection.execute("DELETE FROM entity_records", [])?;
    for row in normalized_entity_rows(snapshot)? {
        connection.execute(
            "INSERT INTO entity_records(id, entity_type, parent_id, revision, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                row.id,
                row.entity_type,
                row.parent_id,
                sequence_i64(snapshot.sequence)?,
                row.payload_json,
            ],
        )?;
    }
    Ok(())
}

fn write_asset_records(
    connection: &Connection,
    snapshot: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    connection.execute("DELETE FROM asset_records", [])?;
    for asset in &snapshot.assets {
        connection.execute(
            "INSERT INTO asset_records(
               id, sha256, relative_path, media_type, size, metadata_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, '{}')",
            params![
                asset.id.hyphenated().to_string(),
                asset.sha256,
                asset.relative_path,
                asset.media_type,
                sequence_i64(asset.size)?,
            ],
        )?;
    }
    Ok(())
}

fn journal_action_text(action: JournalAction) -> &'static str {
    match action {
        JournalAction::Apply => "apply",
        JournalAction::Undo => "undo",
        JournalAction::Redo => "redo",
    }
}

fn parse_journal_action(value: &str) -> Result<JournalAction, ProjectIoError> {
    match value {
        "apply" => Ok(JournalAction::Apply),
        "undo" => Ok(JournalAction::Undo),
        "redo" => Ok(JournalAction::Redo),
        _ => Err(ProjectIoError::RecoveryFailed),
    }
}

fn sequence_i64(value: u64) -> Result<i64, ProjectIoError> {
    i64::try_from(value).map_err(|_| ProjectIoError::DatabaseError)
}

fn recover_with_lock(lock: &ProjectLock) -> Result<OpenedProject, ProjectIoError> {
    let recovery = lock.create_recovery_copy()?;
    recover_from_copy(recovery, lock.canonical_path())
}

fn inspect_clean_shutdown_copy(recovery: &RecoveryCopy) -> Result<bool, ProjectIoError> {
    let connection = open_database(&recovery.bound_path().join("project.db"))?;
    read_meta(&connection, "cleanShutdown")
}

fn recover_from_copy(
    recovery: RecoveryCopy,
    project_path: &Path,
) -> Result<OpenedProject, ProjectIoError> {
    reconstruct_recovery(recovery.bound_path(), project_path)
        .map_err(|_| ProjectIoError::RecoveryFailed)
}

fn reconstruct_recovery(
    recovery_path: &Path,
    project_path: &Path,
) -> Result<OpenedProject, ProjectIoError> {
    let mut manifest = read_manifest(&recovery_path.join("manifest.json"))?;
    let connection = open_database(&recovery_path.join("project.db"))?;
    validate_recovery_identity(&connection, &manifest)?;
    let _: bool = read_meta(&connection, "cleanShutdown")?;
    let last_committed: u64 = read_meta(&connection, "lastCommittedSequence")?;
    let last_checkpoint: u64 = read_meta(&connection, "lastCheckpointSequence")?;
    if last_checkpoint > last_committed {
        return Err(ProjectIoError::RecoveryFailed);
    }
    let operations = read_recovery_journal(&connection, 0)?;
    if operations.len() as u64 != last_committed
        || operations
            .iter()
            .enumerate()
            .any(|(index, operation)| operation.sequence != index as u64 + 1)
    {
        return Err(ProjectIoError::RecoveryFailed);
    }
    validate_recovery_journal_groups(&operations)?;
    if checkpoint_splits_transaction(&operations, last_checkpoint) {
        return Err(ProjectIoError::RecoveryFailed);
    }
    let candidates = read_recovery_candidates(&connection, last_checkpoint)?;
    if !candidates
        .iter()
        .any(|(row_sequence, _, _)| *row_sequence == last_checkpoint)
    {
        return Err(ProjectIoError::RecoveryFailed);
    }

    let mut recovered_snapshot = None;
    for (row_sequence, snapshot_json, checksum) in candidates {
        if checksum != snapshot_checksum(&snapshot_json) {
            continue;
        }
        let Ok(mut snapshot) = serde_json::from_str::<ProjectSnapshot>(&snapshot_json) else {
            continue;
        };
        if snapshot.validate().is_err()
            || snapshot.sequence != row_sequence
            || snapshot.checkpoint_sequence != row_sequence
            || snapshot.sequence > last_committed
            || snapshot.schema_version != manifest.schema_version
            || snapshot.project.id != manifest.project_id
            || snapshot.project.profile != manifest.profile
            || checkpoint_splits_transaction(&operations, row_sequence)
        {
            continue;
        }
        let replayed = operations
            .iter()
            .filter(|operation| operation.sequence > row_sequence)
            .try_for_each(|operation| apply_operation(&mut snapshot, operation));
        if replayed.is_err()
            || snapshot.sequence != last_committed
            || validate_entity_invariants(&connection, &snapshot).is_err()
        {
            continue;
        }
        recovered_snapshot = Some(snapshot);
        break;
    }
    let snapshot = recovered_snapshot.ok_or(ProjectIoError::RecoveryFailed)?;

    let database_name: String = read_meta(&connection, "name")?;
    let database_updated_at: String = read_meta(&connection, "updatedAt")?;
    if database_name != snapshot.project.name {
        return Err(ProjectIoError::RecoveryFailed);
    }
    manifest.name = database_name;
    manifest.updated_at = database_updated_at;
    manifest.validate()?;
    drop(connection);
    Ok(OpenedProject {
        project_path: project_path.to_owned(),
        manifest,
        snapshot,
        recovered: true,
    })
}

fn read_recovery_candidates(
    connection: &Connection,
    last_checkpoint: u64,
) -> Result<Vec<(u64, String, String)>, ProjectIoError> {
    let mut statement = connection.prepare(
        "SELECT sequence, snapshot_json, checksum FROM snapshots
         WHERE sequence <= ?1 ORDER BY sequence DESC",
    )?;
    statement
        .query_map([sequence_i64(last_checkpoint)?], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .map(|row| {
            let (sequence, snapshot_json, checksum) = row?;
            if sequence < 0 {
                return Err(ProjectIoError::RecoveryFailed);
            }
            Ok((sequence as u64, snapshot_json, checksum))
        })
        .collect()
}

fn checkpoint_splits_transaction(operations: &[JournalOperation], sequence: u64) -> bool {
    if sequence == 0 || sequence >= operations.len() as u64 {
        return false;
    }
    operations[(sequence - 1) as usize].transaction_id
        == operations[sequence as usize].transaction_id
}

fn validate_recovery_identity(
    connection: &Connection,
    manifest: &ProjectManifest,
) -> Result<(), ProjectIoError> {
    let schema_version: u32 = read_immutable_meta(connection, "schemaVersion")?;
    let project_id: String = read_immutable_meta(connection, "projectId")?;
    let profile: ProjectProfile = read_immutable_meta(connection, "profile")?;
    let created_at: String = read_immutable_meta(connection, "createdAt")?;
    let app_version: String = read_immutable_meta(connection, "appVersion")?;
    let minimum: String = read_immutable_meta(connection, "minCompatibleAppVersion")?;
    if schema_version != manifest.schema_version
        || parse_contract_uuid(&project_id).ok() != Some(manifest.project_id)
        || profile != manifest.profile
        || created_at != manifest.created_at
        || app_version != manifest.app_version
        || minimum != manifest.min_compatible_app_version
    {
        return Err(ProjectIoError::RecoveryFailed);
    }
    Ok(())
}

fn read_recovery_journal(
    connection: &Connection,
    after_sequence: u64,
) -> Result<Vec<JournalOperation>, ProjectIoError> {
    let mut statement = connection.prepare(
        "SELECT sequence, transaction_id, command_type, payload_json,
                inverse_payload_json, action, created_at
         FROM command_journal WHERE sequence > ?1 ORDER BY sequence",
    )?;
    statement
        .query_map([sequence_i64(after_sequence)?], |row| {
            let sequence: i64 = row.get(0)?;
            let payload: String = row.get(3)?;
            let inverse: String = row.get(4)?;
            let action: String = row.get(5)?;
            Ok((
                sequence,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                payload,
                inverse,
                action,
                row.get::<_, String>(6)?,
            ))
        })?
        .map(|row| {
            let (sequence, transaction_id, command_type, payload, inverse, action, timestamp) =
                row?;
            if sequence < 0
                || !valid_transaction_id(&transaction_id)
                || !valid_journal_timestamp(&timestamp)
            {
                return Err(ProjectIoError::RecoveryFailed);
            }
            Ok(JournalOperation {
                sequence: sequence as u64,
                transaction_id,
                command_type,
                payload: serde_json::from_str(&payload)
                    .map_err(|_| ProjectIoError::RecoveryFailed)?,
                inverse_payload: serde_json::from_str(&inverse)
                    .map_err(|_| ProjectIoError::RecoveryFailed)?,
                action: parse_journal_action(&action)?,
                timestamp,
            })
        })
        .collect()
}

fn validate_recovery_journal_groups(operations: &[JournalOperation]) -> Result<(), ProjectIoError> {
    let mut completed = BTreeSet::new();
    let mut current: Option<(&str, JournalAction)> = None;
    for operation in operations {
        match current {
            Some((transaction_id, action)) if transaction_id == operation.transaction_id => {
                if action != operation.action {
                    return Err(ProjectIoError::RecoveryFailed);
                }
            }
            Some((transaction_id, _)) => {
                completed.insert(transaction_id.to_owned());
                if completed.contains(&operation.transaction_id) {
                    return Err(ProjectIoError::RecoveryFailed);
                }
                current = Some((&operation.transaction_id, operation.action));
            }
            None => current = Some((&operation.transaction_id, operation.action)),
        }
    }
    Ok(())
}

fn validate_entity_invariants(
    connection: &Connection,
    snapshot: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    let actual_entities: BTreeMap<String, (String, Option<String>, i64, String)> = connection
        .prepare(
            "SELECT id, entity_type, parent_id, revision, payload_json
             FROM entity_records ORDER BY id",
        )?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ),
            ))
        })?
        .collect::<Result<_, _>>()?;
    if snapshot.sequence != 0 || !actual_entities.is_empty() {
        let expected = normalized_entity_rows(snapshot)
            .map_err(|_| ProjectIoError::RecoveryFailed)?
            .into_iter()
            .map(|row| {
                Ok((
                    row.id,
                    (
                        row.entity_type,
                        row.parent_id,
                        sequence_i64(snapshot.sequence)?,
                        row.payload_json,
                    ),
                ))
            })
            .collect::<Result<BTreeMap<_, _>, ProjectIoError>>()?;
        if actual_entities != expected {
            return Err(ProjectIoError::RecoveryFailed);
        }
    }

    let actual_assets: BTreeMap<String, (String, String, String, i64, String)> = connection
        .prepare(
            "SELECT id, sha256, relative_path, media_type, size, metadata_json
             FROM asset_records ORDER BY id",
        )?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                ),
            ))
        })?
        .collect::<Result<_, _>>()?;
    let expected_assets = snapshot
        .assets
        .iter()
        .map(|asset| {
            Ok((
                asset.id.hyphenated().to_string(),
                (
                    asset.sha256.clone(),
                    asset.relative_path.clone(),
                    asset.media_type.clone(),
                    sequence_i64(asset.size)?,
                    "{}".to_owned(),
                ),
            ))
        })
        .collect::<Result<BTreeMap<_, _>, ProjectIoError>>()?;
    if actual_assets != expected_assets {
        return Err(ProjectIoError::RecoveryFailed);
    }
    Ok(())
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
                layers: vec![PlanLayer {
                    id: Uuid::new_v4(),
                    name: "默认图层".into(),
                    tags: Vec::new(),
                    visible: true,
                    locked: false,
                }],
            }],
            entities: Vec::new(),
            vendors: Vec::new(),
            product_contents: Vec::new(),
            media_assets: Vec::new(),
            route_networks: Vec::new(),
            themes: Vec::new(),
            camera_shots: Vec::new(),
            story_sequences: Vec::new(),
            plan_references: Vec::new(),
            openings: Vec::new(),
            guided_routes: Vec::new(),
            materials: Vec::new(),
            material_assignments: Vec::new(),
            scene_environment: SceneEnvironment::default(),
        },
        assets: Vec::new(),
    }
}

fn migrate_snapshot_value(mut value: Value) -> Result<ProjectSnapshot, ProjectIoError> {
    let mut schema_version = snapshot_schema_version(&value)?;
    if schema_version > CURRENT_SCHEMA_VERSION {
        return Err(ProjectIoError::UnsupportedSchemaVersion);
    }
    while schema_version < CURRENT_SCHEMA_VERSION {
        value = match schema_version {
            1 => migrate_snapshot_v1_to_v2(value)?,
            2 => migrate_snapshot_v2_to_v3(value)?,
            _ => return Err(ProjectIoError::UnsupportedSchemaVersion),
        };
        schema_version = snapshot_schema_version(&value)?;
    }
    let snapshot: ProjectSnapshot =
        serde_json::from_value(value).map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    snapshot.validate()?;
    Ok(snapshot)
}

fn snapshot_schema_version(value: &Value) -> Result<u32, ProjectIoError> {
    let version = value
        .as_object()
        .and_then(|source| source.get("schemaVersion"))
        .and_then(Value::as_u64)
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    if version == 0 || version > 9_007_199_254_740_991 {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    u32::try_from(version).map_err(|_| ProjectIoError::UnsupportedSchemaVersion)
}

fn migrate_snapshot_v1_to_v2(mut value: Value) -> Result<Value, ProjectIoError> {
    let source = value
        .as_object_mut()
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    source.insert("schemaVersion".into(), Value::from(2));
    let assets = source
        .get_mut("assets")
        .and_then(Value::as_array_mut)
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    for asset in assets {
        let asset = asset
            .as_object_mut()
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        let sha256 = asset.get("sha256").and_then(Value::as_str);
        let media_type = asset.get("mediaType").and_then(Value::as_str);
        if let (Some(sha256), Some(media_type)) = (sha256, media_type)
            && sha256.len() == 64
            && sha256.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
            && let Some(relative_path) = canonical_asset_path(sha256, media_type)
        {
            asset.insert("relativePath".into(), Value::String(relative_path));
        }
    }
    let project = source
        .get_mut("project")
        .and_then(Value::as_object_mut)
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    let floors = project
        .get_mut("floors")
        .and_then(Value::as_array_mut)
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    for floor in floors {
        let floor = floor
            .as_object_mut()
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        let floor_id = floor
            .get("id")
            .and_then(Value::as_str)
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        let layer_id = default_layer_id_for_floor(parse_contract_uuid(floor_id)?);
        floor.insert(
            "layers".into(),
            serde_json::json!([{
                "id": layer_id.hyphenated().to_string(),
                "name": "默认图层",
                "tags": [],
                "visible": true,
                "locked": false
            }]),
        );
    }
    for collection in [
        "entities", "vendors", "productContents", "mediaAssets", "routeNetworks", "themes",
        "cameraShots", "storySequences",
    ] {
        project.insert(collection.into(), Value::Array(Vec::new()));
    }
    Ok(value)
}

fn migrate_snapshot_v2_to_v3(mut value: Value) -> Result<Value, ProjectIoError> {
    let source = value
        .as_object_mut()
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    source.insert("schemaVersion".into(), Value::from(3));
    let project = source
        .get_mut("project")
        .and_then(Value::as_object_mut)
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    for collection in [
        "planReferences", "openings", "guidedRoutes", "materials", "materialAssignments",
    ] {
        project.insert(collection.into(), Value::Array(Vec::new()));
    }
    project.insert(
        "sceneEnvironment".into(),
        serde_json::to_value(SceneEnvironment::default())
            .map_err(|_| ProjectIoError::InvalidProjectStructure)?,
    );
    Ok(value)
}

fn path_entry_exists(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => true,
    }
}

pub(crate) fn read_manifest(path: &Path) -> Result<ProjectManifest, ProjectIoError> {
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

pub(crate) fn write_manifest_atomically(
    project_path: &Path,
    manifest: &ProjectManifest,
) -> Result<(), ProjectIoError> {
    write_manifest_bytes_atomically(project_path, &serialize_manifest(manifest)?)
}

fn serialize_manifest(manifest: &ProjectManifest) -> Result<Vec<u8>, ProjectIoError> {
    let mut bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|_| ProjectIoError::FilesystemError)?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn write_manifest_bytes_atomically(
    project_path: &Path,
    bytes: &[u8],
) -> Result<(), ProjectIoError> {
    write_manifest_bytes_with_state(project_path, bytes).map_err(|failure| failure.error)
}

struct ManifestPublicationFailure {
    error: ProjectIoError,
    replaced: bool,
}

fn write_manifest_bytes_with_state(
    project_path: &Path,
    bytes: &[u8],
) -> Result<(), ManifestPublicationFailure> {
    let temporary = project_path.join(format!("manifest.json.tmp-{}", Uuid::new_v4()));
    let destination = project_path.join("manifest.json");
    let mut replaced = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace_file_atomically(&temporary, &destination, path_entry_exists(&destination))?;
        replaced = true;
        fail_after_manifest_replace_for_test()?;
        sync_directory(project_path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|error| ManifestPublicationFailure { error, replaced })
}

fn publish_manifest_with_restore(
    project_path: &Path,
    published: &[u8],
    previous: &[u8],
) -> Result<(), ProjectIoError> {
    match write_manifest_bytes_with_state(project_path, published) {
        Ok(()) => Ok(()),
        Err(publication_failure) => {
            if publication_failure.replaced
                && write_manifest_bytes_atomically(project_path, previous).is_err()
            {
                return Err(ProjectIoError::RecoveryFailed);
            }
            Err(publication_failure.error)
        }
    }
}

#[cfg(test)]
thread_local! {
    static FAIL_AFTER_MANIFEST_REPLACE: std::cell::Cell<bool> = std::cell::Cell::new(false);
}

#[cfg(test)]
fn fail_next_manifest_directory_sync() {
    FAIL_AFTER_MANIFEST_REPLACE.with(|fail| fail.set(true));
}

#[cfg(test)]
fn fail_after_manifest_replace_for_test() -> Result<(), ProjectIoError> {
    FAIL_AFTER_MANIFEST_REPLACE.with(|fail| {
        if fail.replace(false) {
            Err(ProjectIoError::FilesystemError)
        } else {
            Ok(())
        }
    })
}

#[cfg(not(test))]
fn fail_after_manifest_replace_for_test() -> Result<(), ProjectIoError> {
    Ok(())
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

#[cfg(test)]
mod checkpoint_publication_tests {
    use super::{
        fail_next_manifest_directory_sync, open_session,
    };
    use crate::{
        CreateProjectRequest, ProjectProfile, create_project, snapshot_checksum,
    };
    use rusqlite::{Connection, params};
    use serde_json::{Value, json};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn automatic_upgrade_manifest_sync_failure_restores_v1_manifest_and_database() {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_path_buf(),
            name: "Post Replace Failure".into(),
            profile: ProjectProfile::Showroom,
        })
        .unwrap();
        let manifest_path = opened.project_path.join("manifest.json");
        let mut manifest: Value =
            serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
        manifest["schemaVersion"] = json!(1);
        let previous_manifest = serde_json::to_vec_pretty(&manifest).unwrap();
        fs::write(&manifest_path, &previous_manifest).unwrap();

        let mut snapshot = serde_json::to_value(&opened.snapshot).unwrap();
        snapshot["schemaVersion"] = json!(1);
        for floor in snapshot["project"]["floors"].as_array_mut().unwrap() {
            floor.as_object_mut().unwrap().remove("layers");
        }
        for collection in [
            "entities",
            "vendors",
            "productContents",
            "mediaAssets",
            "routeNetworks",
            "themes",
            "cameraShots",
            "storySequences",
            "planReferences",
            "openings",
            "guidedRoutes",
            "materials",
            "materialAssignments",
            "sceneEnvironment",
        ] {
            snapshot["project"].as_object_mut().unwrap().remove(collection);
        }
        let snapshot_json = serde_json::to_string(&snapshot).unwrap();
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        connection
            .execute(
                "UPDATE project_meta SET value_json = '1' WHERE key = 'schemaVersion'",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE snapshots SET snapshot_json = ?1, checksum = ?2",
                params![snapshot_json, snapshot_checksum(&snapshot_json)],
            )
            .unwrap();
        drop(connection);

        fail_next_manifest_directory_sync();
        let error = open_session(&opened.project_path, false).unwrap_err();

        assert_eq!(error.code(), "FILESYSTEM_ERROR");
        assert_eq!(
            fs::read(&manifest_path).unwrap(),
            previous_manifest
        );
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        let database_schema: String = connection
            .query_row(
                "SELECT value_json FROM project_meta WHERE key = 'schemaVersion'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let stored_snapshot: String = connection
            .query_row(
                "SELECT snapshot_json FROM snapshots ORDER BY sequence DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(database_schema, "1");
        assert_eq!(
            serde_json::from_str::<Value>(&stored_snapshot).unwrap()["schemaVersion"],
            1
        );
        drop(connection);

        let session = open_session(&opened.project_path, false).unwrap();
        assert_eq!(session.snapshot().schema_version, 3);
    }
}
