use project_io::{
    CommitBatch, CreateProjectRequest, JournalAction, JournalOperation, ProjectIoError,
    ProjectProfile, ProjectSnapshot, SaveState, create_project, open_session, recover_project,
};
use rusqlite::Connection;
use serde_json::json;
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

fn assert_code(error: ProjectIoError, code: &str) {
    assert_eq!(error.code(), code, "unexpected error: {error}");
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

    let manifest = session.checkpoint().unwrap();
    assert_eq!(manifest.name, "Checkpoint Name");
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

    assert!(session.checkpoint().is_err());
    assert_eq!(session.save_state(), SaveState::Error);
    assert_eq!(session.snapshot().checkpoint_sequence, 0);
    connection
        .execute("DROP TRIGGER fail_checkpoint", [])
        .unwrap();
    drop(connection);

    session.checkpoint().unwrap();
    assert_eq!(session.save_state(), SaveState::Saved);
    assert_eq!(session.snapshot().checkpoint_sequence, 1);
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

    assert_code(
        recover_project(&opened.project_path, true).unwrap_err(),
        "RECOVERY_FAILED",
    );
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
