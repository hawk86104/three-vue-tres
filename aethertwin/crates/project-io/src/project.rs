use crate::lock::ProjectLock;
use crate::model::{
    CURRENT_SCHEMA_VERSION, CommitBatch, Floor, JournalAction, JournalOperation, SaveState,
    parse_contract_uuid,
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
    CreateProjectRequest, OpenedProject, ProjectIoError, ProjectManifest, ProjectProfile,
    ProjectSnapshot, SpatialProject,
};
use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, params};
use serde::de::DeserializeOwned;
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

pub struct ProjectSession {
    project_path: std::path::PathBuf,
    snapshot: ProjectSnapshot,
    manifest: ProjectManifest,
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
    let opened_result = if recovered {
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
    let connection = match (|| {
        let connection = open_database(&lock.bound_path().join("project.db"))?;
        upsert_meta(&connection, "cleanShutdown", &false)?;
        Ok::<_, ProjectIoError>(connection)
    })() {
        Ok(connection) => connection,
        Err(error) => {
            if !lock.stale_recovered() {
                let _ = lock.clean_close();
            }
            return Err(error);
        }
    };
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
    recover_with_lock(&lock)
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

    pub fn checkpoint(&mut self) -> Result<ProjectManifest, ProjectIoError> {
        self.save_state = SaveState::Saving;
        let result = self.checkpoint_inner();
        if result.is_err() {
            self.save_state = SaveState::Error;
        }
        result
    }

    fn checkpoint_inner(&mut self) -> Result<ProjectManifest, ProjectIoError> {
        if self.closed {
            return Err(ProjectIoError::DatabaseError);
        }
        self.ensure_connection()?;
        let mut checkpoint = self.snapshot.clone();
        checkpoint.checkpoint_sequence = checkpoint.sequence;
        checkpoint.validate()?;
        let snapshot_json =
            serde_json::to_string(&checkpoint).map_err(|_| ProjectIoError::DatabaseError)?;
        let updated_at = timestamp_now();
        let connection = self
            .connection
            .as_mut()
            .ok_or(ProjectIoError::DatabaseError)?;
        let transaction = connection.transaction()?;
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
        upsert_meta(&transaction, "name", &checkpoint.project.name)?;
        upsert_meta(&transaction, "updatedAt", &updated_at)?;
        upsert_meta(&transaction, "cleanShutdown", &false)?;
        transaction.commit()?;

        self.snapshot = checkpoint;
        let mut manifest = self.manifest.clone();
        manifest.name = self.snapshot.project.name.clone();
        manifest.updated_at = updated_at;
        manifest.validate()?;
        let io_path = self
            .lock
            .as_ref()
            .ok_or(ProjectIoError::FilesystemError)?
            .bound_path();
        write_manifest_atomically(io_path, &manifest)?;
        self.manifest = manifest.clone();
        self.save_state = SaveState::Saved;
        Ok(manifest)
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
        self.checkpoint_inner()?;
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

fn validate_commit_batch(batch: &CommitBatch) -> Result<(), ProjectIoError> {
    batch.before.validate()?;
    batch.after.validate()?;
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

fn apply_operation(
    snapshot: &mut ProjectSnapshot,
    operation: &JournalOperation,
) -> Result<(), ProjectIoError> {
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
            if snapshot.project.name != expected_before {
                return Err(ProjectIoError::DatabaseError);
            }
            snapshot.project.name = next.to_owned();
        }
        "project.tags.set" => {
            let payload = string_array(&operation.payload, "tags")?;
            let inverse = string_array(&operation.inverse_payload, "tags")?;
            let (expected_before, next) = match operation.action {
                JournalAction::Undo => (&payload, &inverse),
                JournalAction::Apply | JournalAction::Redo => (&inverse, &payload),
            };
            if &snapshot.project.tags != expected_before {
                return Err(ProjectIoError::DatabaseError);
            }
            snapshot.project.tags = next.clone();
        }
        _ => return Err(ProjectIoError::DatabaseError),
    }
    snapshot.sequence = operation.sequence;
    snapshot.validate()?;
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

fn write_entity_records(
    connection: &Connection,
    snapshot: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    connection.execute("DELETE FROM entity_records", [])?;
    connection.execute(
        "INSERT INTO entity_records(id, entity_type, parent_id, revision, payload_json)
         VALUES (?1, 'project', NULL, ?2, ?3)",
        params![
            snapshot.project.id.hyphenated().to_string(),
            sequence_i64(snapshot.sequence)?,
            serde_json::to_string(&snapshot.project).map_err(|_| ProjectIoError::DatabaseError)?,
        ],
    )?;
    for floor in &snapshot.project.floors {
        connection.execute(
            "INSERT INTO entity_records(id, entity_type, parent_id, revision, payload_json)
             VALUES (?1, 'floor', ?2, ?3, ?4)",
            params![
                floor.id.hyphenated().to_string(),
                snapshot.project.id.hyphenated().to_string(),
                sequence_i64(snapshot.sequence)?,
                serde_json::to_string(floor).map_err(|_| ProjectIoError::DatabaseError)?,
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
        let mut expected = BTreeMap::new();
        expected.insert(
            snapshot.project.id.hyphenated().to_string(),
            (
                "project".to_owned(),
                None,
                sequence_i64(snapshot.sequence)?,
                serde_json::to_string(&snapshot.project)
                    .map_err(|_| ProjectIoError::RecoveryFailed)?,
            ),
        );
        for floor in &snapshot.project.floors {
            expected.insert(
                floor.id.hyphenated().to_string(),
                (
                    "floor".to_owned(),
                    Some(snapshot.project.id.hyphenated().to_string()),
                    sequence_i64(snapshot.sequence)?,
                    serde_json::to_string(floor).map_err(|_| ProjectIoError::RecoveryFailed)?,
                ),
            );
        }
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
