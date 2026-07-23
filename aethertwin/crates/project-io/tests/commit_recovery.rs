use project_io::{
    AssetRecord, CommitBatch, CreateProjectRequest, JournalAction, JournalOperation,
    ProjectIoError, ProjectProfile, ProjectSnapshot, SaveState, create_project,
    open_session, recover_project,
};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::fs;
use tempfile::tempdir;

struct TestProject {
    _root: tempfile::TempDir,
    opened: project_io::OpenedProject,
}

impl std::ops::Deref for TestProject {
    type Target = project_io::OpenedProject;

    fn deref(&self) -> &Self::Target {
        &self.opened
    }
}

fn create(name: &str, profile: ProjectProfile) -> TestProject {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: name.into(),
        profile,
    })
    .unwrap();
    TestProject {
        _root: root,
        opened,
    }
}

fn renamed(mut snapshot: ProjectSnapshot, name: &str, sequence: u64) -> ProjectSnapshot {
    snapshot.project.name = name.into();
    snapshot.sequence = sequence;
    snapshot
}

fn rename_operation(
    sequence: u64,
    transaction_id: &str,
    before: &str,
    after: &str,
    action: JournalAction,
) -> JournalOperation {
    let mut operation = JournalOperation::rename(sequence, transaction_id, before, after);
    operation.action = action;
    operation
}

fn rename_batch(before: &ProjectSnapshot, after: &ProjectSnapshot) -> CommitBatch {
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![rename_operation(
            after.sequence,
            "00000000-0000-4000-8000-000000000111",
            &before.project.name,
            &after.project.name,
            JournalAction::Apply,
        )],
    }
}

fn deterministic_layer_id(floor_id: uuid::Uuid) -> uuid::Uuid {
    let mut bytes = *floor_id.as_bytes();
    bytes[15] ^= 0xa7;
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid::Uuid::from_bytes(bytes)
}


fn downgrade_to_v1(opened: &project_io::OpenedProject) -> Vec<u8> {
    let manifest_path = opened.project_path.join("manifest.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["schemaVersion"] = json!(1);
    let manifest_bytes = serde_json::to_vec_pretty(&manifest).unwrap();
    fs::write(&manifest_path, &manifest_bytes).unwrap();

    let mut snapshot = serde_json::to_value(&opened.snapshot).unwrap();
    snapshot["schemaVersion"] = json!(1);
    for floor in snapshot["project"]["floors"].as_array_mut().unwrap() {
        floor.as_object_mut().unwrap().remove("layers");
    }
    for collection in [
        "entities", "vendors", "productContents", "mediaAssets", "routeNetworks", "themes",
        "cameraShots", "storySequences", "planReferences", "openings", "guidedRoutes",
        "materials", "materialAssignments", "sceneEnvironment",
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
            (
                &snapshot_json,
                project_io::snapshot_checksum(&snapshot_json),
            ),
        )
        .unwrap();
    manifest_bytes
}

fn downgrade_to_v2(
    opened: &project_io::OpenedProject,
    sequence: u64,
    checkpoint_sequence: u64,
) -> ProjectSnapshot {
    let manifest_path = opened.project_path.join("manifest.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["schemaVersion"] = json!(2);
    fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest).unwrap()).unwrap();

    let mut expected = opened.snapshot.clone();
    expected.sequence = sequence;
    expected.checkpoint_sequence = checkpoint_sequence;
    let mut snapshot = serde_json::to_value(&expected).unwrap();
    snapshot["schemaVersion"] = json!(2);
    for field in [
        "planReferences",
        "openings",
        "guidedRoutes",
        "materials",
        "materialAssignments",
        "sceneEnvironment",
    ] {
        snapshot["project"].as_object_mut().unwrap().remove(field);
    }
    let snapshot_json = serde_json::to_string(&snapshot).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute("DELETE FROM snapshots", [])
        .unwrap();
    connection
        .execute(
            "INSERT INTO snapshots(sequence, snapshot_json, checksum, created_at)
             VALUES (?1, ?2, ?3, '2026-07-23T00:00:00.000Z')",
            (
                i64::try_from(sequence).unwrap(),
                &snapshot_json,
                project_io::snapshot_checksum(&snapshot_json),
            ),
        )
        .unwrap();
    for (key, value) in [
        ("schemaVersion", json!(2)),
        ("lastCommittedSequence", json!(sequence)),
        ("lastCheckpointSequence", json!(checkpoint_sequence)),
    ] {
        connection
            .execute(
                "UPDATE project_meta SET value_json = ?1 WHERE key = ?2",
                (serde_json::to_string(&value).unwrap(), key),
            )
            .unwrap();
    }
    expected
}

#[test]
fn every_published_session_is_schema_v3() {
    let opened = create("Schema V3 Session", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();

    assert_eq!(session.manifest().schema_version, 3);
    assert_eq!(session.snapshot().schema_version, 3);
    assert_eq!(session.manifest().schema_version, session.snapshot().schema_version);

    session.close().unwrap();
}

#[test]
fn session_exposes_bound_manifest_and_project_path() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Getter Demo".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();

    assert_eq!(session.manifest(), &opened.manifest);
    assert_eq!(session.project_path(), opened.project_path.as_path());
    session.close().unwrap();
}

fn assert_code(error: ProjectIoError, code: &str) {
    assert_eq!(error.code(), code, "unexpected error: {error}");
}

fn sqlite_source_fingerprint(
    project_path: &std::path::Path,
) -> Vec<(&'static str, Option<Vec<u8>>)> {
    ["project.db", "project.db-wal", "project.db-shm"]
        .into_iter()
        .map(|name| (name, fs::read(project_path.join(name)).ok()))
        .collect()
}

fn checkpoint_then_commit(opened: &project_io::OpenedProject) -> ProjectSnapshot {
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let checkpoint = renamed(initial.clone(), "Checkpoint", 1);
    session.commit(rename_batch(&initial, &checkpoint)).unwrap();
    session.checkpoint(session.snapshot().clone()).unwrap();
    let checkpoint = session.snapshot().clone();
    let final_snapshot = renamed(checkpoint.clone(), "Final", 2);
    let mut final_batch = rename_batch(&checkpoint, &final_snapshot);
    final_batch.journal[0].transaction_id = "00000000-0000-4000-8000-000000000222".into();
    session.commit(final_batch).unwrap();
    drop(session);
    final_snapshot
}

fn overwrite_checkpoint(project_path: &std::path::Path, snapshot: &ProjectSnapshot) {
    let snapshot_json = serde_json::to_string(snapshot).unwrap();
    Connection::open(project_path.join("project.db"))
        .unwrap()
        .execute(
            "UPDATE snapshots SET snapshot_json = ?1, checksum = ?2 WHERE sequence = 1",
            (
                &snapshot_json,
                project_io::snapshot_checksum(&snapshot_json),
            ),
        )
        .unwrap();
}

#[test]
fn commit_is_atomic_and_recovery_replays_after_checkpoint() {
    let opened = create("Market Demo", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Recovered Name", 1);

    session.commit(rename_batch(&original, &next)).unwrap();
    assert_eq!(session.save_state(), SaveState::Dirty);
    drop(session);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(recovered.snapshot.project.name, "Recovered Name");
    assert_eq!(recovered.snapshot.sequence, 1);
    assert!(recovered.recovered);
}

#[test]
fn failed_batch_changes_neither_entities_nor_journal_and_is_retryable() {
    let opened = create("Showroom Demo", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    Connection::open(opened.project_path.join("project.db"))
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER fail_journal BEFORE INSERT ON command_journal
             BEGIN SELECT RAISE(ABORT, 'forced journal failure'); END;",
        )
        .unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Never Published", 1);

    assert!(session.commit(rename_batch(&original, &next)).is_err());
    assert_eq!(session.snapshot(), &original);
    assert_eq!(session.save_state(), SaveState::Error);

    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let journal_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM command_journal", [], |row| row.get(0))
        .unwrap();
    let entity_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM entity_records", [], |row| row.get(0))
        .unwrap();
    assert_eq!((journal_count, entity_count), (0, 0));
    connection.execute("DROP TRIGGER fail_journal", []).unwrap();
    drop(connection);

    session.commit(rename_batch(&original, &next)).unwrap();
    assert_eq!(session.snapshot(), &next);
}

#[test]
fn rejects_non_owned_before_and_noncontiguous_journal_without_publishing() {
    let opened = create("Sequence Demo", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let mut wrong_before = original.clone();
    wrong_before.project.name = "Not owned".into();
    let after = renamed(original.clone(), "Candidate", 1);
    let mut wrong_batch = rename_batch(&wrong_before, &after);
    assert_code(session.commit(wrong_batch).unwrap_err(), "DATABASE_ERROR");
    assert_eq!(session.snapshot(), &original);

    let mut skipped = after.clone();
    skipped.sequence = 2;
    wrong_batch = rename_batch(&original, &skipped);
    wrong_batch.journal[0].sequence = 2;
    assert_code(session.commit(wrong_batch).unwrap_err(), "DATABASE_ERROR");
    assert_eq!(session.snapshot(), &original);

    session.commit(rename_batch(&original, &after)).unwrap();
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn rejects_reusing_a_transaction_id_across_commit_batches() {
    let opened = create("Transaction Demo", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let first = renamed(original.clone(), "First", 1);
    session.commit(rename_batch(&original, &first)).unwrap();
    let second = renamed(first.clone(), "Second", 2);

    assert_code(
        session.commit(rename_batch(&first, &second)).unwrap_err(),
        "DATABASE_ERROR",
    );
    assert_eq!(session.snapshot(), &first);
}

#[test]
fn active_lock_is_exclusive_and_crash_residue_requires_confirmation() {
    let opened = create("Lock Demo", ProjectProfile::Showroom);
    let session = open_session(&opened.project_path, false).unwrap();
    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "PROJECT_LOCKED",
    );
    drop(session);

    let metadata: serde_json::Value =
        serde_json::from_slice(&fs::read(opened.project_path.join(".aethertwin.lock")).unwrap())
            .unwrap();
    assert!(metadata["pid"].as_u64().is_some_and(|pid| pid > 0));
    let session_id = uuid::Uuid::parse_str(metadata["sessionId"].as_str().unwrap()).unwrap();
    assert_eq!(session_id.get_version_num(), 4);
    assert!(matches!(session_id.get_variant(), uuid::Variant::RFC4122));
    let opened_at = metadata["openedAt"].as_str().unwrap();
    assert!(opened_at.ends_with('Z'));
    assert!(chrono::DateTime::parse_from_rfc3339(opened_at).is_ok());

    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "STALE_PROJECT_LOCK",
    );
    let recovered_session = open_session(&opened.project_path, true).unwrap();
    assert_eq!(recovered_session.save_state(), SaveState::Recovered);
}

#[test]
fn clean_shutdown_false_requires_recovery_even_when_the_lock_file_was_deleted() {
    let opened = create("Deleted Crash Lock", ProjectProfile::Market);
    let session = open_session(&opened.project_path, false).unwrap();
    drop(session);
    fs::remove_file(opened.project_path.join(".aethertwin.lock")).unwrap();

    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "STALE_PROJECT_LOCK",
    );
    assert!(!opened.project_path.join(".aethertwin.lock").exists());
    let recovered = open_session(&opened.project_path, true).unwrap();
    assert_eq!(recovered.save_state(), SaveState::Recovered);
}

#[test]
fn refused_no_lock_crash_recovery_never_touches_source_sqlite_or_sidecars() {
    let opened = create("Immutable Refusal", ProjectProfile::Market);
    let session = open_session(&opened.project_path, false).unwrap();
    drop(session);
    fs::remove_file(opened.project_path.join(".aethertwin.lock")).unwrap();
    fs::write(opened.project_path.join("project.db-wal"), b"wal-sentinel").unwrap();
    fs::write(opened.project_path.join("project.db-shm"), b"shm-sentinel").unwrap();
    let before = sqlite_source_fingerprint(&opened.project_path);

    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "STALE_PROJECT_LOCK",
    );
    assert_eq!(sqlite_source_fingerprint(&opened.project_path), before);
}

#[test]
fn refused_stale_lock_recovery_never_touches_source_sqlite_or_sidecars() {
    let opened = create("Immutable Stale Refusal", ProjectProfile::Showroom);
    let session = open_session(&opened.project_path, false).unwrap();
    drop(session);
    fs::write(opened.project_path.join("project.db-wal"), b"wal-stale").unwrap();
    fs::write(opened.project_path.join("project.db-shm"), b"shm-stale").unwrap();
    let before = sqlite_source_fingerprint(&opened.project_path);

    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "STALE_PROJECT_LOCK",
    );
    assert_eq!(sqlite_source_fingerprint(&opened.project_path), before);
}

#[test]
fn failed_recovery_cleans_only_the_new_lock_created_for_the_attempt() {
    let opened = create("Failed New Lock Recovery", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Committed", 1);
    session.commit(rename_batch(&original, &next)).unwrap();
    drop(session);
    fs::remove_file(opened.project_path.join(".aethertwin.lock")).unwrap();
    Connection::open(opened.project_path.join("project.db"))
        .unwrap()
        .execute(
            "UPDATE entity_records SET payload_json = '{\"corrupt\":true}'
             WHERE entity_type = 'project'",
            [],
        )
        .unwrap();

    assert_code(
        open_session(&opened.project_path, true).unwrap_err(),
        "RECOVERY_FAILED",
    );
    assert!(!opened.project_path.join(".aethertwin.lock").exists());
}

#[test]
fn missing_or_malformed_clean_shutdown_markers_fail_stably() {
    for malformed in [None, Some("not-json")] {
        let opened = create("Bad Shutdown Marker", ProjectProfile::Showroom);
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        match malformed {
            None => {
                connection
                    .execute("DELETE FROM project_meta WHERE key = 'cleanShutdown'", [])
                    .unwrap();
            }
            Some(value) => {
                connection
                    .execute(
                        "UPDATE project_meta SET value_json = ?1 WHERE key = 'cleanShutdown'",
                        [value],
                    )
                    .unwrap();
            }
        }
        drop(connection);

        assert_code(
            open_session(&opened.project_path, false).unwrap_err(),
            "INVALID_PROJECT_STRUCTURE",
        );
        assert!(!opened.project_path.join(".aethertwin.lock").exists());
    }
}

#[test]
fn malformed_lock_metadata_is_rewritten_only_after_explicit_confirmation() {
    let opened = create("Malformed Lock Demo", ProjectProfile::Market);
    let lock_path = opened.project_path.join(".aethertwin.lock");
    fs::write(
        &lock_path,
        br#"{"pid":0,"sessionId":"not-a-uuid","openedAt":"not-a-time"}"#,
    )
    .unwrap();

    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "STALE_PROJECT_LOCK",
    );
    assert_eq!(
        fs::read(&lock_path).unwrap(),
        br#"{"pid":0,"sessionId":"not-a-uuid","openedAt":"not-a-time"}"#
    );

    let recovered = open_session(&opened.project_path, true).unwrap();
    assert_eq!(recovered.save_state(), SaveState::Recovered);
    drop(recovered);
    let metadata: serde_json::Value =
        serde_json::from_slice(&fs::read(&lock_path).unwrap()).unwrap();
    assert!(metadata["pid"].as_u64().is_some_and(|pid| pid > 0));
    assert_eq!(
        uuid::Uuid::parse_str(metadata["sessionId"].as_str().unwrap())
            .unwrap()
            .get_version_num(),
        4
    );
    let mut reopened = open_session(&opened.project_path, true).unwrap();
    reopened.close().unwrap();
}

#[test]
fn rejected_open_does_not_leave_false_stale_lock_metadata() {
    let opened = create("Rejected Open Demo", ProjectProfile::Market);
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TRIGGER rejected_open_trigger AFTER UPDATE ON project_meta
             BEGIN SELECT 1; END;",
        )
        .unwrap();
    drop(connection);

    assert_code(
        open_session(&opened.project_path, false).unwrap_err(),
        "DATABASE_ERROR",
    );
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute("DROP TRIGGER rejected_open_trigger", [])
        .unwrap();
    drop(connection);

    let mut session = open_session(&opened.project_path, false).unwrap();
    session.close().unwrap();
}

#[test]
fn lock_file_never_follows_a_symlink_or_reparse_point() {
    let opened = create("Redirected Lock Demo", ProjectProfile::Showroom);
    let outside = tempdir().unwrap();
    let target = outside.path().join("outside-lock");
    fs::write(&target, b"outside").unwrap();
    let lock_path = opened.project_path.join(".aethertwin.lock");

    #[cfg(windows)]
    if std::os::windows::fs::symlink_file(&target, &lock_path).is_err() {
        // Creating reparse points can require Developer Mode or elevated privileges.
        return;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(&target, &lock_path).unwrap();

    assert_code(
        open_session(&opened.project_path, true).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
    assert_eq!(fs::read(target).unwrap(), b"outside");
}

#[test]
fn recovery_never_follows_a_replaced_derived_directory() {
    let opened = create("Redirected Derived", ProjectProfile::Market);
    let session = open_session(&opened.project_path, false).unwrap();
    drop(session);
    let outside = tempdir().unwrap();
    let derived = opened.project_path.join("derived");
    let preserved = opened.project_path.join("derived-preserved");
    fs::rename(&derived, &preserved).unwrap();

    #[cfg(windows)]
    if std::os::windows::fs::symlink_dir(outside.path(), &derived).is_err() {
        fs::rename(&preserved, &derived).unwrap();
        return;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &derived).unwrap();

    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
}

#[test]
fn recovery_never_follows_a_replaced_source_entry() {
    let opened = create("Redirected Source", ProjectProfile::Showroom);
    let session = open_session(&opened.project_path, false).unwrap();
    drop(session);
    let outside = tempdir().unwrap();
    let outside_manifest = outside.path().join("outside-manifest.json");
    fs::write(&outside_manifest, b"outside-must-not-change").unwrap();
    let manifest = opened.project_path.join("manifest.json");
    let preserved = opened.project_path.join("manifest-preserved.json");
    fs::rename(&manifest, &preserved).unwrap();

    #[cfg(windows)]
    if std::os::windows::fs::symlink_file(&outside_manifest, &manifest).is_err() {
        fs::rename(&preserved, &manifest).unwrap();
        return;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside_manifest, &manifest).unwrap();

    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
    assert_eq!(
        fs::read(outside_manifest).unwrap(),
        b"outside-must-not-change"
    );
}

#[cfg(unix)]
#[test]
fn replacing_the_lock_path_cannot_bypass_the_bound_project_writer_lock() {
    let opened = create("Replaced Lock Demo", ProjectProfile::Market);
    let session = open_session(&opened.project_path, false).unwrap();
    let lock_path = opened.project_path.join(".aethertwin.lock");
    fs::remove_file(&lock_path).unwrap();
    fs::write(&lock_path, b"replacement").unwrap();

    assert_code(
        open_session(&opened.project_path, true).unwrap_err(),
        "PROJECT_LOCKED",
    );
    drop(session);
}

#[test]
fn clean_close_checkpoints_then_removes_lock_and_reopens_equivalently() {
    let opened = create("Close Demo", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Closed Name", 1);
    session.commit(rename_batch(&original, &next)).unwrap();

    session.close().unwrap();
    assert!(!opened.project_path.join(".aethertwin.lock").exists());
    let reopened = open_session(&opened.project_path, false).unwrap();
    assert_eq!(reopened.snapshot().project.name, "Closed Name");
    assert_eq!(reopened.snapshot().checkpoint_sequence, 1);
    assert_eq!(reopened.save_state(), SaveState::Saved);
}

#[test]
fn checkpoint_writes_a_checksum_snapshot_and_manifest_cache() {
    let opened = create("Checkpoint Demo", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Checkpoint Name", 1);
    session.commit(rename_batch(&original, &next)).unwrap();

    let checkpoint = session.checkpoint(session.snapshot().clone()).unwrap();
    assert_eq!(checkpoint.manifest.name, "Checkpoint Name");
    assert_eq!(checkpoint.snapshot, *session.snapshot());
    assert_eq!(
        checkpoint.snapshot.checkpoint_sequence,
        checkpoint.snapshot.sequence
    );
    assert_eq!(session.save_state(), SaveState::Saved);
    assert_eq!(session.snapshot().checkpoint_sequence, 1);
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let (json, checksum): (String, String) = connection
        .query_row(
            "SELECT snapshot_json, checksum FROM snapshots WHERE sequence = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(checksum, project_io::snapshot_checksum(&json));
}

#[test]
fn post_checkpoint_snapshot_can_commit_and_manifest_failure_does_not_publish_it() {
    let opened = create("Checkpoint Publication", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let first = renamed(original.clone(), "First", 1);
    session.commit(rename_batch(&original, &first)).unwrap();
    let checkpoint = session.checkpoint(session.snapshot().clone()).unwrap();
    let second = renamed(checkpoint.snapshot.clone(), "Second", 2);
    let second_batch = CommitBatch {
        before: checkpoint.snapshot.clone(),
        after: second.clone(),
        journal: vec![rename_operation(
            second.sequence,
            "00000000-0000-4000-8000-000000000222",
            &checkpoint.snapshot.project.name,
            &second.project.name,
            JournalAction::Apply,
        )],
    };
    assert_eq!(session.snapshot(), &second_batch.before);
    project_io::validate_commit_batch(&second_batch).unwrap();
    session.commit(second_batch).unwrap();
    assert_eq!(session.snapshot(), &second);

    let manifest_path = opened.project_path.join("manifest.json");
    let manifest_bytes = fs::read(&manifest_path).unwrap();
    fs::remove_file(&manifest_path).unwrap();
    fs::create_dir(&manifest_path).unwrap();
    let before_failure = session.snapshot().clone();

    assert!(session.checkpoint(session.snapshot().clone()).is_err());
    assert_eq!(session.snapshot(), &before_failure);

    fs::remove_dir(&manifest_path).unwrap();
    fs::write(&manifest_path, manifest_bytes).unwrap();
    let retry = session.checkpoint(session.snapshot().clone()).unwrap();
    assert_eq!(retry.snapshot.checkpoint_sequence, retry.snapshot.sequence);
}

#[test]
fn failed_checkpoint_sets_error_and_can_be_retried_after_the_cause_is_removed() {
    let opened = create("Checkpoint Retry Demo", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Retry Name", 1);
    session.commit(rename_batch(&original, &next)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TRIGGER fail_checkpoint BEFORE INSERT ON snapshots
             BEGIN SELECT RAISE(ABORT, 'forced checkpoint failure'); END;",
        )
        .unwrap();

    assert!(session.checkpoint(session.snapshot().clone()).is_err());
    assert_eq!(session.save_state(), SaveState::Error);
    assert_eq!(session.snapshot().checkpoint_sequence, 0);
    connection
        .execute("DROP TRIGGER fail_checkpoint", [])
        .unwrap();
    drop(connection);

    session.checkpoint(session.snapshot().clone()).unwrap();
    assert_eq!(session.save_state(), SaveState::Saved);
    assert_eq!(session.snapshot().checkpoint_sequence, 1);
}

#[test]
fn coherent_v1_is_upgraded_through_v2_to_v3_before_session_publication() {
    let opened = create("Legacy Chain Upgrade", ProjectProfile::Market);
    let project_id = opened.snapshot.project.id;
    let floor = opened.snapshot.project.floors[0].clone();
    let sequence = opened.snapshot.sequence;
    let checkpoint_sequence = opened.snapshot.checkpoint_sequence;
    downgrade_to_v1(&opened);

    let mut session = open_session(&opened.project_path, false).unwrap();

    assert_eq!(session.manifest().schema_version, 3);
    assert_eq!(session.snapshot().schema_version, 3);
    assert_eq!(session.snapshot().sequence, sequence);
    assert_eq!(session.snapshot().checkpoint_sequence, checkpoint_sequence);
    assert_eq!(session.snapshot().project.id, project_id);
    assert_eq!(session.snapshot().project.floors[0].id, floor.id);
    assert_eq!(session.snapshot().project.floors[0].name, floor.name);
    assert_eq!(
        session.snapshot().project.floors[0].layers[0].id,
        deterministic_layer_id(floor.id)
    );
    let project = serde_json::to_value(&session.snapshot().project).unwrap();
    assert_eq!(project["planReferences"], json!([]));
    assert_eq!(project["sceneEnvironment"]["backgroundColor"], "#10151c");

    let disk_manifest: Value = serde_json::from_slice(
        &fs::read(opened.project_path.join("manifest.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(disk_manifest["schemaVersion"], 3);
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let database_schema: String = connection
        .query_row(
            "SELECT value_json FROM project_meta WHERE key = 'schemaVersion'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let snapshot_json: String = connection
        .query_row(
            "SELECT snapshot_json FROM snapshots ORDER BY sequence DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(database_schema, "3");
    assert_eq!(
        serde_json::from_str::<Value>(&snapshot_json).unwrap()["schemaVersion"],
        3
    );
    drop(connection);
    session.close().unwrap();
}

#[test]
fn coherent_v2_upgrade_preserves_ids_values_order_sequence_and_checkpoint_sequence() {
    let opened = create("Exact V2 Upgrade", ProjectProfile::Showroom);
    let expected = downgrade_to_v2(&opened, 4, 3);

    let session = open_session(&opened.project_path, false).unwrap();

    assert_eq!(session.manifest().schema_version, 3);
    assert_eq!(session.snapshot(), &expected);
    assert_eq!(session.snapshot().sequence, 4);
    assert_eq!(session.snapshot().checkpoint_sequence, 3);
    assert_eq!(
        session.snapshot().project.scene_environment,
        Default::default()
    );
    drop(session);
}

#[test]
fn automatic_v2_upgrade_database_failure_restores_the_old_coherent_pair() {
    let opened = create("V2 Upgrade Database Failure", ProjectProfile::Market);
    let expected = downgrade_to_v2(&opened, 4, 3);
    let manifest_path = opened.project_path.join("manifest.json");
    let database_path = opened.project_path.join("project.db");
    let manifest_before = fs::read(&manifest_path).unwrap();
    let connection = Connection::open(&database_path).unwrap();
    let stored_before: (String, String) = connection
        .query_row(
            "SELECT (SELECT value_json FROM project_meta WHERE key = 'schemaVersion'),
               (SELECT snapshot_json FROM snapshots ORDER BY sequence DESC LIMIT 1)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    drop(connection);
    let original_permissions = fs::metadata(&database_path).unwrap().permissions();
    let mut read_only_permissions = original_permissions.clone();
    read_only_permissions.set_readonly(true);
    fs::set_permissions(&database_path, read_only_permissions).unwrap();

    let error = open_session(&opened.project_path, false).unwrap_err();
    fs::set_permissions(&database_path, original_permissions).unwrap();

    assert_code(error, "DATABASE_ERROR");
    assert_eq!(fs::read(&manifest_path).unwrap(), manifest_before);
    let connection = Connection::open(&database_path).unwrap();
    let stored_after: (String, String) = connection
        .query_row(
            "SELECT (SELECT value_json FROM project_meta WHERE key = 'schemaVersion'),
               (SELECT snapshot_json FROM snapshots ORDER BY sequence DESC LIMIT 1)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(stored_after, stored_before);
    drop(connection);

    let session = open_session(&opened.project_path, false).unwrap();
    assert_eq!(session.snapshot(), &expected);
}

#[test]
fn recovery_uses_newest_valid_checkpoint_creates_unique_copies_and_replays_actions() {
    let opened = create("Replay Demo", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let applied = renamed(original.clone(), "Applied", 1);
    session.commit(rename_batch(&original, &applied)).unwrap();

    let undone = renamed(applied.clone(), &original.project.name, 2);
    session
        .commit(CommitBatch {
            before: applied.clone(),
            after: undone.clone(),
            journal: vec![rename_operation(
                2,
                "00000000-0000-4000-8000-000000000222",
                &original.project.name,
                &applied.project.name,
                JournalAction::Undo,
            )],
        })
        .unwrap();
    let redone = renamed(undone.clone(), "Applied", 3);
    session
        .commit(CommitBatch {
            before: undone,
            after: redone.clone(),
            journal: vec![rename_operation(
                3,
                "00000000-0000-4000-8000-000000000333",
                &original.project.name,
                &redone.project.name,
                JournalAction::Redo,
            )],
        })
        .unwrap();
    drop(session);

    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "INSERT INTO snapshots(sequence, snapshot_json, checksum, created_at)
             VALUES (2, ?1, 'bad', '2026-07-17T00:00:00.000Z')",
            [serde_json::to_string(&redone).unwrap()],
        )
        .unwrap();
    drop(connection);

    let first = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(first.snapshot.project.name, "Applied");
    assert_eq!(first.snapshot.sequence, 3);
    let first_copies = recovery_directories(&opened.project_path);
    assert_eq!(first_copies.len(), 1);
    assert!(first_copies[0].join("manifest.json").is_file());
    assert!(first_copies[0].join("project.db").is_file());

    let second = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(second.snapshot, first.snapshot);
    let second_copies = recovery_directories(&opened.project_path);
    assert_eq!(second_copies.len(), 2);
    assert_ne!(second_copies[0], second_copies[1]);
}

#[test]
fn recovery_falls_back_when_the_intended_checkpoint_is_semantically_corrupt() {
    let mut corruptions: Vec<Box<dyn Fn(&mut ProjectSnapshot)>> = vec![
        Box::new(|snapshot| snapshot.project.id = uuid::Uuid::new_v4()),
        Box::new(|snapshot| snapshot.checkpoint_sequence = 0),
        Box::new(|snapshot| snapshot.sequence = 3),
        Box::new(|snapshot| snapshot.project.name = "Diverged".into()),
    ];
    for corrupt in corruptions.drain(..) {
        let opened = create("Semantic Fallback", ProjectProfile::Market);
        let expected = checkpoint_then_commit(&opened);
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        let snapshot_json: String = connection
            .query_row(
                "SELECT snapshot_json FROM snapshots WHERE sequence = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        drop(connection);
        let mut corrupt_checkpoint: ProjectSnapshot = serde_json::from_str(&snapshot_json).unwrap();
        corrupt(&mut corrupt_checkpoint);
        overwrite_checkpoint(&opened.project_path, &corrupt_checkpoint);

        let recovered = recover_project(&opened.project_path, true).unwrap();
        assert_eq!(recovered.snapshot.project, expected.project);
        assert_eq!(recovered.snapshot.sequence, expected.sequence);
        assert_eq!(recovered.snapshot.checkpoint_sequence, 0);
    }
}

#[test]
fn recovery_rejects_a_transaction_id_reused_across_the_checkpoint_boundary() {
    let opened = create("Cross Boundary Transaction", ProjectProfile::Market);
    checkpoint_then_commit(&opened);
    Connection::open(opened.project_path.join("project.db"))
        .unwrap()
        .execute(
            "UPDATE command_journal SET transaction_id =
             '00000000-0000-4000-8000-000000000111' WHERE sequence = 2",
            [],
        )
        .unwrap();

    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "RECOVERY_FAILED",
    );
}

#[test]
fn failed_recovery_preserves_source_manifest_and_checkpoint_state() {
    let opened = create("Invariant Demo", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Durable", 1);
    session.commit(rename_batch(&original, &next)).unwrap();
    drop(session);

    let manifest_before = fs::read(opened.project_path.join("manifest.json")).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE entity_records SET payload_json = ?1 WHERE entity_type = 'project'",
            [serde_json::to_string(&json!({ "corrupt": true })).unwrap()],
        )
        .unwrap();
    drop(connection);

    let source_before = sqlite_source_fingerprint(&opened.project_path);
    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "RECOVERY_FAILED",
    );
    assert_eq!(
        sqlite_source_fingerprint(&opened.project_path),
        source_before
    );
    assert_eq!(recovery_directories(&opened.project_path).len(), 1);
    assert_eq!(
        fs::read(opened.project_path.join("manifest.json")).unwrap(),
        manifest_before
    );
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let snapshot_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM snapshots", [], |row| row.get(0))
        .unwrap();
    let checkpoint: u64 = serde_json::from_str(
        &connection
            .query_row(
                "SELECT value_json FROM project_meta WHERE key = 'lastCheckpointSequence'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
    )
    .unwrap();
    assert_eq!((snapshot_count, checkpoint), (1, 0));
}

#[test]
fn recovery_rejects_orphan_asset_rows_even_before_the_first_commit() {
    let opened = create("Asset Invariant Demo", ProjectProfile::Showroom);
    let session = open_session(&opened.project_path, false).unwrap();
    drop(session);
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "INSERT INTO asset_records(
               id, sha256, relative_path, media_type, size, metadata_json
             ) VALUES (?1, ?2, ?3, ?4, 1, '{}')",
            [
                "00000000-0000-4000-8000-000000000999",
                &"a".repeat(64),
                "assets/orphan.png",
                "image/png",
            ],
        )
        .unwrap();
    drop(connection);

    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "RECOVERY_FAILED",
    );
}

#[test]
fn recovery_requires_compiled_empty_asset_metadata() {
    let opened = create("Asset Metadata Invariant", ProjectProfile::Market);
    let mut snapshot = opened.snapshot.clone();
    let asset = AssetRecord {
        id: uuid::Uuid::new_v4(),
        sha256: "a".repeat(64),
        relative_path: "assets/example.png".into(),
        media_type: "image/png".into(),
        size: 7,
    };
    snapshot.assets.push(asset.clone());
    let snapshot_json = serde_json::to_string(&snapshot).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE snapshots SET snapshot_json = ?1, checksum = ?2 WHERE sequence = 0",
            (
                &snapshot_json,
                project_io::snapshot_checksum(&snapshot_json),
            ),
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO asset_records(
               id, sha256, relative_path, media_type, size, metadata_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, '{\"unexpected\":true}')",
            rusqlite::params![
                asset.id.hyphenated().to_string(),
                asset.sha256,
                asset.relative_path,
                asset.media_type,
                asset.size as i64,
            ],
        )
        .unwrap();
    drop(connection);

    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "RECOVERY_FAILED",
    );
}

fn recovery_directories(project_path: &std::path::Path) -> Vec<std::path::PathBuf> {
    let root = project_path.join("derived/recovery");
    let mut directories: Vec<_> = fs::read_dir(root)
        .unwrap()
        .map(Result::unwrap)
        .map(|entry| entry.path())
        .collect();
    directories.sort();
    directories
}

#[test]
fn journal_contract_serializes_camel_case_and_lowercase_actions() {
    let operation = rename_operation(
        1,
        "00000000-0000-4000-8000-000000000444",
        "Before",
        "After",
        JournalAction::Redo,
    );
    let value = serde_json::to_value(operation).unwrap();
    assert_eq!(
        value["transactionId"],
        json!("00000000-0000-4000-8000-000000000444")
    );
    assert_eq!(value["commandType"], json!("project.rename"));
    assert_eq!(value["inversePayload"], json!({ "name": "Before" }));
    assert_eq!(value["action"], json!("redo"));
}
fn plan_fixture(snapshot: &ProjectSnapshot, id: &str, name: &str) -> Value {
    let floor = &snapshot.project.floors[0];
    json!({
        "type": "fixture",
        "id": id,
        "name": name,
        "tags": [],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "locked": false,
        "transform": {
            "translation": { "x": 0, "y": 0 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "kind": "generic",
        "size": { "width": 1000, "height": 500 }
    })
}

fn plan_operation(
    sequence: u64,
    transaction_id: &str,
    command_type: &str,
    payload: Value,
    inverse_payload: Value,
    action: JournalAction,
) -> JournalOperation {
    JournalOperation {
        sequence,
        transaction_id: transaction_id.into(),
        command_type: command_type.into(),
        payload,
        inverse_payload,
        action,
        timestamp: "2026-07-21T00:00:00.000Z".into(),
    }
}

fn patch_batch(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    operation: JournalOperation,
) -> CommitBatch {
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![operation],
    }
}

fn entity_patch_payload(reason: &str, changes: Vec<Value>) -> Value {
    json!({ "reason": reason, "changes": changes })
}

fn inverse_entity_changes(changes: &[Value]) -> Vec<Value> {
    changes
        .iter()
        .rev()
        .map(|change| {
            let mut inverse = json!({
                "id": change["id"],
                "before": change["after"],
                "after": change["before"]
            });
            if let Some(index) = change.get("index") {
                inverse["index"] = index.clone();
            }
            inverse
        })
        .collect()
}

#[test]
fn plan_entity_patch_replays_entity_and_floor_apply_undo_redo_checkpoint_reopen_and_recovery() {
    let opened = create("Plan Replay", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let first = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000010",
        "First",
    );
    let second = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000011",
        "Second",
    );
    let entity_changes = vec![
        json!({ "id": first["id"], "before": null, "after": first, "index": 0 }),
        json!({ "id": second["id"], "before": null, "after": second, "index": 1 }),
    ];
    let entity_payload = entity_patch_payload("create", entity_changes.clone());
    let entity_inverse =
        entity_patch_payload("create", inverse_entity_changes(&entity_changes));
    let mut entities_applied = initial.clone();
    entities_applied.project.entities = vec![first.clone(), second.clone()];
    entities_applied.sequence = 1;
    session
        .commit(patch_batch(
            &initial,
            &entities_applied,
            plan_operation(
                1,
                "00000000-0000-4000-8000-000000000601",
                "plan.entities.patch",
                entity_payload.clone(),
                entity_inverse.clone(),
                JournalAction::Apply,
            ),
        ))
        .unwrap();
    session.checkpoint(session.snapshot().clone()).unwrap();
    session.close().unwrap();

    let mut session = open_session(&opened.project_path, false).unwrap();
    assert_eq!(
        session.snapshot().project.entities,
        vec![first.clone(), second.clone()]
    );
    let floor_before = session.snapshot().project.floors[0].clone();
    let mut floor_after = floor_before.clone();
    floor_after.layers[0].visible = false;
    let floor_payload = json!({
        "floorId": floor_before.id,
        "before": floor_before,
        "after": floor_after
    });
    let floor_inverse = json!({
        "floorId": floor_before.id,
        "before": floor_after,
        "after": floor_before
    });
    let before_floor_patch = session.snapshot().clone();
    let mut after_floor_patch = before_floor_patch.clone();
    after_floor_patch.project.floors[0] = floor_after.clone();
    after_floor_patch.sequence = 2;
    session
        .commit(patch_batch(
            &before_floor_patch,
            &after_floor_patch,
            plan_operation(
                2,
                "00000000-0000-4000-8000-000000000602",
                "plan.floor.patch",
                floor_payload.clone(),
                floor_inverse.clone(),
                JournalAction::Apply,
            ),
        ))
        .unwrap();

    let mut floor_undone = after_floor_patch.clone();
    floor_undone.project.floors[0] = floor_before.clone();
    floor_undone.sequence = 3;
    session
        .commit(patch_batch(
            &after_floor_patch,
            &floor_undone,
            plan_operation(
                3,
                "00000000-0000-4000-8000-000000000603",
                "plan.floor.patch",
                floor_payload.clone(),
                floor_inverse.clone(),
                JournalAction::Undo,
            ),
        ))
        .unwrap();
    let mut floor_redone = floor_undone.clone();
    floor_redone.project.floors[0] = floor_after.clone();
    floor_redone.sequence = 4;
    session
        .commit(patch_batch(
            &floor_undone,
            &floor_redone,
            plan_operation(
                4,
                "00000000-0000-4000-8000-000000000604",
                "plan.floor.patch",
                floor_payload,
                floor_inverse,
                JournalAction::Redo,
            ),
        ))
        .unwrap();

    let mut entities_undone = floor_redone.clone();
    entities_undone.project.entities.clear();
    entities_undone.sequence = 5;
    session
        .commit(patch_batch(
            &floor_redone,
            &entities_undone,
            plan_operation(
                5,
                "00000000-0000-4000-8000-000000000605",
                "plan.entities.patch",
                entity_payload.clone(),
                entity_inverse.clone(),
                JournalAction::Undo,
            ),
        ))
        .unwrap();
    let mut entities_redone = entities_undone.clone();
    entities_redone.project.entities = vec![first.clone(), second.clone()];
    entities_redone.sequence = 6;
    session
        .commit(patch_batch(
            &entities_undone,
            &entities_redone,
            plan_operation(
                6,
                "00000000-0000-4000-8000-000000000606",
                "plan.entities.patch",
                entity_payload,
                entity_inverse,
                JournalAction::Redo,
            ),
        ))
        .unwrap();
    assert_eq!(
        session.snapshot().project.entities,
        vec![first.clone(), second.clone()]
    );
    assert!(!session.snapshot().project.floors[0].layers[0].visible);
    drop(session);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(recovered.snapshot.project.entities, vec![first, second]);
    assert!(!recovered.snapshot.project.floors[0].layers[0].visible);
    assert_eq!(recovered.snapshot.sequence, 6);
    assert!(recovered.recovered);
}

#[test]
fn plan_entity_patch_rejects_explicit_null_index_without_publication() {
    let opened = create("Null Index Rejection", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let fixture = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000010",
        "Fixture",
    );
    let payload = entity_patch_payload(
        "create",
        vec![json!({
            "id": fixture["id"],
            "before": null,
            "after": fixture,
            "index": null
        })],
    );
    let inverse = entity_patch_payload(
        "create",
        vec![json!({
            "id": fixture["id"],
            "before": fixture,
            "after": null,
            "index": 0
        })],
    );
    let mut claimed_after = initial.clone();
    claimed_after.project.entities = vec![fixture];
    claimed_after.sequence = 1;

    assert_code(
        session
            .commit(patch_batch(
                &initial,
                &claimed_after,
                plan_operation(
                    1,
                    "00000000-0000-4000-8000-000000000616",
                    "plan.entities.patch",
                    payload,
                    inverse,
                    JournalAction::Apply,
                ),
            ))
            .unwrap_err(),
        "DATABASE_ERROR",
    );
    assert_eq!(session.snapshot(), &initial);
    let journal_count: i64 = Connection::open(opened.project_path.join("project.db"))
        .unwrap()
        .query_row("SELECT COUNT(*) FROM command_journal", [], |row| row.get(0))
        .unwrap();
    assert_eq!(journal_count, 0);
}

#[test]
fn plan_entity_patch_preserves_middle_order_through_undo_redo_and_dirty_recovery() {
    let opened = create("Indexed Plan Replay", ProjectProfile::Market);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let first = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000010",
        "First",
    );
    let middle = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000011",
        "Middle",
    );
    let last = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000012",
        "Last",
    );
    let create_changes = vec![
        json!({ "id": first["id"], "before": null, "after": first }),
        json!({ "id": middle["id"], "before": null, "after": middle }),
        json!({ "id": last["id"], "before": null, "after": last }),
    ];
    let create_payload = entity_patch_payload("create", create_changes);
    let create_inverse = entity_patch_payload(
        "create",
        vec![
            json!({ "id": last["id"], "before": last, "after": null, "index": 2 }),
            json!({ "id": middle["id"], "before": middle, "after": null, "index": 1 }),
            json!({ "id": first["id"], "before": first, "after": null, "index": 0 }),
        ],
    );
    let mut created = initial.clone();
    created.project.entities = vec![first.clone(), middle.clone(), last.clone()];
    created.sequence = 1;
    session
        .commit(patch_batch(
            &initial,
            &created,
            plan_operation(
                1,
                "00000000-0000-4000-8000-000000000611",
                "plan.entities.patch",
                create_payload,
                create_inverse,
                JournalAction::Apply,
            ),
        ))
        .unwrap();
    session.checkpoint(session.snapshot().clone()).unwrap();
    let created = session.snapshot().clone();

    let delete_payload = entity_patch_payload(
        "delete",
        vec![json!({ "id": middle["id"], "before": middle, "after": null })],
    );
    let delete_inverse = entity_patch_payload(
        "delete",
        vec![json!({ "id": middle["id"], "before": null, "after": middle, "index": 1 })],
    );
    let mut deleted = created.clone();
    deleted.project.entities = vec![first.clone(), last.clone()];
    deleted.sequence = 2;
    session
        .commit(patch_batch(
            &created,
            &deleted,
            plan_operation(
                2,
                "00000000-0000-4000-8000-000000000612",
                "plan.entities.patch",
                delete_payload.clone(),
                delete_inverse.clone(),
                JournalAction::Apply,
            ),
        ))
        .unwrap();
    assert_eq!(session.snapshot().project.entities, vec![first.clone(), last.clone()]);

    let mut undone = deleted.clone();
    undone.project.entities = vec![first.clone(), middle.clone(), last.clone()];
    undone.sequence = 3;
    session
        .commit(patch_batch(
            &deleted,
            &undone,
            plan_operation(
                3,
                "00000000-0000-4000-8000-000000000613",
                "plan.entities.patch",
                delete_payload.clone(),
                delete_inverse.clone(),
                JournalAction::Undo,
            ),
        ))
        .unwrap();
    assert_eq!(
        session.snapshot().project.entities,
        vec![first.clone(), middle.clone(), last.clone()]
    );

    let mut redone = undone.clone();
    redone.project.entities = vec![first.clone(), last.clone()];
    redone.sequence = 4;
    session
        .commit(patch_batch(
            &undone,
            &redone,
            plan_operation(
                4,
                "00000000-0000-4000-8000-000000000614",
                "plan.entities.patch",
                delete_payload.clone(),
                delete_inverse.clone(),
                JournalAction::Redo,
            ),
        ))
        .unwrap();
    assert_eq!(session.snapshot().project.entities, vec![first.clone(), last.clone()]);

    let mut restored = redone.clone();
    restored.project.entities = vec![first.clone(), middle.clone(), last.clone()];
    restored.sequence = 5;
    session
        .commit(patch_batch(
            &redone,
            &restored,
            plan_operation(
                5,
                "00000000-0000-4000-8000-000000000615",
                "plan.entities.patch",
                delete_payload,
                delete_inverse,
                JournalAction::Undo,
            ),
        ))
        .unwrap();
    assert_eq!(
        session.snapshot().project.entities,
        vec![first.clone(), middle.clone(), last.clone()]
    );
    assert_eq!(session.save_state(), SaveState::Dirty);
    drop(session);
    let source_manifest = fs::read(opened.project_path.join("manifest.json")).unwrap();
    let source_sqlite = sqlite_source_fingerprint(&opened.project_path);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(fs::read(opened.project_path.join("manifest.json")).unwrap(), source_manifest);
    assert_eq!(sqlite_source_fingerprint(&opened.project_path), source_sqlite);
    assert_eq!(
        recovered.snapshot.project.entities,
        vec![first, middle, last]
    );
    assert_eq!(recovered.snapshot.sequence, 5);
    assert_eq!(recovered.snapshot.checkpoint_sequence, 1);
    assert!(recovered.recovered);
}

#[test]
fn plan_entity_patch_rejects_stale_before_and_unknown_layer_without_publication() {
    let opened = create("Plan Rejection", ProjectProfile::Showroom);
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let current = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000010",
        "Current",
    );
    let stale = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000010",
        "Stale",
    );
    let next = plan_fixture(
        &initial,
        "00000000-0000-4000-8000-000000000010",
        "Next",
    );
    let stale_changes = vec![json!({
        "id": current["id"],
        "before": stale,
        "after": next,
        "index": 0
    })];
    let stale_payload = entity_patch_payload("properties", stale_changes.clone());
    let stale_inverse =
        entity_patch_payload("properties", inverse_entity_changes(&stale_changes));
    let mut claimed_after = initial.clone();
    claimed_after.project.entities = vec![next];
    claimed_after.sequence = 1;
    assert_code(
        session
            .commit(patch_batch(
                &initial,
                &claimed_after,
                plan_operation(
                    1,
                    "00000000-0000-4000-8000-000000000607",
                    "plan.entities.patch",
                    stale_payload,
                    stale_inverse,
                    JournalAction::Apply,
                ),
            ))
            .unwrap_err(),
        "DATABASE_ERROR",
    );
    assert_eq!(session.snapshot(), &initial);

    let mut invalid_layer = current;
    invalid_layer["layerId"] = json!("00000000-0000-4000-8000-000000000099");
    let invalid_changes = vec![json!({
        "id": invalid_layer["id"],
        "before": null,
        "after": invalid_layer,
        "index": 0
    })];
    let invalid_payload = entity_patch_payload("create", invalid_changes.clone());
    let invalid_inverse =
        entity_patch_payload("create", inverse_entity_changes(&invalid_changes));
    let mut invalid_after = initial.clone();
    invalid_after.project.entities = vec![invalid_layer];
    invalid_after.sequence = 1;
    assert_code(
        session
            .commit(patch_batch(
                &initial,
                &invalid_after,
                plan_operation(
                    1,
                    "00000000-0000-4000-8000-000000000608",
                    "plan.entities.patch",
                    invalid_payload,
                    invalid_inverse,
                    JournalAction::Apply,
                ),
            ))
            .unwrap_err(),
        "DATABASE_ERROR",
    );
    assert_eq!(session.snapshot(), &initial);
}
