use project_io::{
    AssetRecord, CommitBatch, CreateProjectRequest, JournalAction, JournalOperation,
    ProjectProfile, ProjectSnapshot, SaveState, create_project, open_session, recover_project,
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

fn create(name: &str) -> TestProject {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: name.into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    TestProject {
        _root: root,
        opened,
    }
}

fn operation(
    sequence: u64,
    transaction_id: &str,
    payload: Value,
    inverse_payload: Value,
) -> JournalOperation {
    JournalOperation {
        sequence,
        transaction_id: transaction_id.into(),
        command_type: "snapshot.records.patch".into(),
        payload,
        inverse_payload,
        action: JournalAction::Apply,
        timestamp: "2026-07-29T00:00:00.000Z".into(),
    }
}

fn inverse_changes(changes: &[Value]) -> Vec<Value> {
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

fn patch(collection: &str, changes: Vec<Value>) -> (Value, Value) {
    let inverse = inverse_changes(&changes);
    (
        json!({ "collection": collection, "changes": changes }),
        json!({ "collection": collection, "changes": inverse }),
    )
}

fn canonical_asset() -> AssetRecord {
    let sha256 = "c".repeat(64);
    AssetRecord {
        id: uuid::Uuid::parse_str("00000000-0000-4000-8000-000000000141").unwrap(),
        relative_path: format!("assets/sha256/cc/{sha256}.png"),
        sha256,
        media_type: "image/png".into(),
        size: 1024,
    }
}

fn calibrated_locked_reference(snapshot: &ProjectSnapshot, asset: &AssetRecord) -> Value {
    let floor = &snapshot.project.floors[0];
    json!({
        "id": "00000000-0000-4000-8000-000000000142",
        "name": "Locked calibrated plan",
        "tags": ["survey"],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "assetId": asset.id,
        "intrinsicSize": { "width": 200, "height": 100 },
        "transform": {
            "translation": { "x": 1200, "y": -800 },
            "rotation": 0.25,
            "scale": { "x": 25, "y": 25 }
        },
        "opacity": 0.8,
        "locked": true,
        "calibration": {
            "sourcePointA": { "x": 0, "y": 0 },
            "sourcePointB": { "x": 100, "y": 0 },
            "measuredDistanceMm": 2500
        }
    })
}

fn downgrade_to_v2(opened: &project_io::OpenedProject) -> ProjectSnapshot {
    let manifest_path = opened.project_path.join("manifest.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["schemaVersion"] = json!(2);
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();

    let expected = opened.snapshot.clone();
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
    connection.execute("DELETE FROM snapshots", []).unwrap();
    connection
        .execute(
            "INSERT INTO snapshots(sequence, snapshot_json, checksum, created_at)
             VALUES (0, ?1, ?2, '2026-07-29T00:00:00.000Z')",
            (
                &snapshot_json,
                project_io::snapshot_checksum(&snapshot_json),
            ),
        )
        .unwrap();
    connection
        .execute(
            "UPDATE project_meta SET value_json = '2' WHERE key = 'schemaVersion'",
            [],
        )
        .unwrap();
    expected
}

#[test]
fn coherent_schema_v2_is_upgraded_to_v3_before_a_session_is_published() {
    let opened = create("Schema V2 Publication");
    let expected = downgrade_to_v2(&opened);

    let mut session = open_session(&opened.project_path, false).unwrap();

    assert_eq!(session.manifest().schema_version, 3);
    assert_eq!(session.snapshot(), &expected);
    assert_eq!(session.snapshot().schema_version, 3);
    assert_eq!(
        serde_json::from_slice::<Value>(
            &fs::read(opened.project_path.join("manifest.json")).unwrap()
        )
        .unwrap()["schemaVersion"],
        3
    );
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let stored_schema: String = connection
        .query_row(
            "SELECT value_json FROM project_meta WHERE key = 'schemaVersion'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(stored_schema, "3");
    drop(connection);
    session.close().unwrap();
}

#[test]
fn calibrated_locked_asset_reference_survives_checkpoint_reopen_and_stale_recovery() {
    let opened = create("V3 Reference Recovery");
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let asset = canonical_asset();
    let reference = calibrated_locked_reference(&initial, &asset);
    let asset_changes = vec![json!({
        "id": asset.id,
        "before": null,
        "after": serde_json::to_value(&asset).unwrap(),
        "index": 0
    })];
    let reference_changes = vec![json!({
        "id": reference["id"],
        "before": null,
        "after": reference,
        "index": 0
    })];
    let (asset_payload, asset_inverse) = patch("assets", asset_changes);
    let (reference_payload, reference_inverse) = patch("planReferences", reference_changes);
    let mut applied = initial.clone();
    applied.assets = vec![asset.clone()];
    applied.project.plan_references = vec![serde_json::from_value(reference).unwrap()];
    applied.sequence = 2;
    session
        .commit(CommitBatch {
            before: initial,
            after: applied.clone(),
            journal: vec![
                operation(
                    1,
                    "00000000-0000-4000-8000-000000000143",
                    asset_payload,
                    asset_inverse,
                ),
                operation(
                    2,
                    "00000000-0000-4000-8000-000000000143",
                    reference_payload,
                    reference_inverse,
                ),
            ],
        })
        .unwrap();
    let checkpoint = session
        .checkpoint(session.snapshot().clone())
        .unwrap()
        .snapshot;
    assert_eq!(checkpoint.checkpoint_sequence, 2);
    assert_eq!(checkpoint.assets[0].relative_path, asset.relative_path);
    assert_eq!(
        checkpoint.project.plan_references[0]
            .calibration
            .as_ref()
            .unwrap()
            .measured_distance_mm,
        2500.0
    );
    assert!(checkpoint.project.plan_references[0].locked);
    session.close().unwrap();

    let mut reopened = open_session(&opened.project_path, false).unwrap();
    assert_eq!(reopened.snapshot(), &checkpoint);
    let prior_reference = reopened.snapshot().project.plan_references[0].clone();
    let mut updated_reference = prior_reference.clone();
    updated_reference.name = "Recovered locked calibrated plan".into();
    let changes = vec![json!({
        "id": updated_reference.id,
        "before": serde_json::to_value(&prior_reference).unwrap(),
        "after": serde_json::to_value(&updated_reference).unwrap(),
        "index": 0
    })];
    let (payload, inverse) = patch("planReferences", changes);
    let mut dirty = checkpoint.clone();
    dirty.project.plan_references = vec![updated_reference];
    dirty.sequence = 3;
    reopened
        .commit(CommitBatch {
            before: checkpoint,
            after: dirty.clone(),
            journal: vec![operation(
                3,
                "00000000-0000-4000-8000-000000000144",
                payload,
                inverse,
            )],
        })
        .unwrap();
    assert_eq!(reopened.save_state(), SaveState::Dirty);
    drop(reopened);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, dirty);
    assert_eq!(
        recovered.snapshot.assets[0].relative_path,
        asset.relative_path
    );
    assert!(recovered.snapshot.project.plan_references[0].locked);
    assert_eq!(
        recovered.snapshot.project.plan_references[0]
            .calibration
            .as_ref()
            .unwrap()
            .measured_distance_mm,
        2500.0
    );
}

#[test]
fn failed_checkpoint_keeps_the_previous_durable_project_reopenable() {
    let opened = create("Checkpoint Durability");
    let manifest_path = opened.project_path.join("manifest.json");
    let manifest_before = fs::read(&manifest_path).unwrap();
    let snapshot_before: String = Connection::open(opened.project_path.join("project.db"))
        .unwrap()
        .query_row(
            "SELECT snapshot_json FROM snapshots WHERE sequence = 0",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let durable_snapshot = session.snapshot().clone();
    Connection::open(opened.project_path.join("project.db"))
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER fail_checkpoint BEFORE INSERT ON snapshots
             WHEN NEW.sequence = 0
             BEGIN SELECT RAISE(ABORT, 'forced checkpoint failure'); END;",
        )
        .unwrap();

    let error = session.checkpoint(durable_snapshot.clone()).unwrap_err();
    assert_eq!(error.code(), "DATABASE_ERROR");
    assert_eq!(session.save_state(), SaveState::Error);
    assert_eq!(fs::read(&manifest_path).unwrap(), manifest_before);
    drop(session);

    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute("DROP TRIGGER fail_checkpoint", [])
        .unwrap();
    let snapshot_after: String = connection
        .query_row(
            "SELECT snapshot_json FROM snapshots WHERE sequence = 0",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(snapshot_after, snapshot_before);
    drop(connection);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, durable_snapshot);
    assert_eq!(fs::read(&manifest_path).unwrap(), manifest_before);
}
