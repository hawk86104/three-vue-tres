use crate::{ProjectIoError, ProjectManifest, ProjectSnapshot};
use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OpenFlags, OptionalExtension, params};
use serde::Serialize;
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::Duration;

const MIGRATION_1_SQL: &str = r#"
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE project_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE entity_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  parent_id TEXT,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE command_journal (
  sequence INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  inverse_payload_json TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('apply','undo','redo')),
  created_at TEXT NOT NULL
);
CREATE TABLE snapshots (
  sequence INTEGER PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE asset_records (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size >= 0),
  metadata_json TEXT NOT NULL
);
"#;

const REQUIRED_TABLES: [&str; 6] = [
    "schema_migrations",
    "project_meta",
    "entity_records",
    "command_journal",
    "snapshots",
    "asset_records",
];

pub(crate) fn create_database(
    path: &Path,
    manifest: &ProjectManifest,
    snapshot: &ProjectSnapshot,
) -> Result<(), ProjectIoError> {
    let mut connection = configured_connection(path, true)?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(MIGRATION_1_SQL)?;
    transaction.execute(
        "INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (1, ?1, ?2)",
        params![migration_1_checksum(), now()],
    )?;

    write_meta(&transaction, "schemaVersion", &manifest.schema_version)?;
    write_meta(&transaction, "projectId", &manifest.project_id)?;
    write_meta(&transaction, "name", &manifest.name)?;
    write_meta(&transaction, "profile", &manifest.profile)?;
    write_meta(&transaction, "createdAt", &manifest.created_at)?;
    write_meta(&transaction, "updatedAt", &manifest.updated_at)?;
    write_meta(&transaction, "appVersion", &manifest.app_version)?;
    write_meta(
        &transaction,
        "minCompatibleAppVersion",
        &manifest.min_compatible_app_version,
    )?;
    write_meta(&transaction, "lastCommittedSequence", &snapshot.sequence)?;
    write_meta(
        &transaction,
        "lastCheckpointSequence",
        &snapshot.checkpoint_sequence,
    )?;

    let snapshot_json =
        serde_json::to_string(snapshot).map_err(|_| ProjectIoError::DatabaseError)?;
    transaction.execute(
        "INSERT INTO snapshots(sequence, snapshot_json, checksum, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            i64::try_from(snapshot.sequence).map_err(|_| ProjectIoError::DatabaseError)?,
            snapshot_json,
            snapshot_checksum(&snapshot_json),
            manifest.created_at,
        ],
    )?;
    transaction.commit()?;
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    connection
        .close()
        .map_err(|_| ProjectIoError::DatabaseError)
}

pub(crate) fn open_database(path: &Path) -> Result<Connection, ProjectIoError> {
    let connection = configured_connection(path, false)?;
    validate_migrations(&connection)?;
    Ok(connection)
}

fn configured_connection(path: &Path, create: bool) -> Result<Connection, ProjectIoError> {
    let connection = if create {
        Connection::open(path)?
    } else {
        Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?
    };
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    Ok(connection)
}

fn validate_migrations(connection: &Connection) -> Result<(), ProjectIoError> {
    for table in REQUIRED_TABLES {
        let exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [table],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    let migrations: Vec<(i64, String)> = connection
        .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    if migrations.len() != 1 || migrations[0].0 != 1 {
        return Err(ProjectIoError::DatabaseError);
    }
    if migrations[0].1 != migration_1_checksum() {
        return Err(ProjectIoError::DatabaseError);
    }
    Ok(())
}

pub(crate) fn read_meta<T: DeserializeOwned>(
    connection: &Connection,
    key: &str,
) -> Result<T, ProjectIoError> {
    let raw: Option<String> = connection
        .query_row(
            "SELECT value_json FROM project_meta WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()?;
    let raw = raw.ok_or(ProjectIoError::InvalidProjectStructure)?;
    serde_json::from_str(&raw).map_err(|_| ProjectIoError::InvalidProjectStructure)
}

pub(crate) fn latest_snapshot(connection: &Connection) -> Result<ProjectSnapshot, ProjectIoError> {
    let row: Option<(i64, String, String)> = connection
        .query_row(
            "SELECT sequence, snapshot_json, checksum FROM snapshots ORDER BY sequence DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let (sequence, snapshot_json, checksum) = row.ok_or(ProjectIoError::InvalidProjectStructure)?;
    if sequence < 0 || checksum != snapshot_checksum(&snapshot_json) {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    let snapshot: ProjectSnapshot = serde_json::from_str(&snapshot_json)
        .map_err(|_| ProjectIoError::InvalidProjectStructure)?;
    snapshot.validate()?;
    if snapshot.sequence != sequence as u64 {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(snapshot)
}

fn write_meta(
    connection: &Connection,
    key: &str,
    value: &impl Serialize,
) -> Result<(), ProjectIoError> {
    let value_json = serde_json::to_string(value).map_err(|_| ProjectIoError::DatabaseError)?;
    connection.execute(
        "INSERT INTO project_meta(key, value_json) VALUES (?1, ?2)",
        params![key, value_json],
    )?;
    Ok(())
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn migration_1_checksum() -> String {
    snapshot_checksum(MIGRATION_1_SQL)
}

pub fn snapshot_checksum(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    let mut result = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write as _;
        let _ = write!(result, "{byte:02x}");
    }
    result
}
