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
    typed_operation(
        sequence,
        transaction_id,
        "snapshot.records.patch",
        payload,
        inverse_payload,
    )
}

fn typed_operation(
    sequence: u64,
    transaction_id: &str,
    command_type: &str,
    payload: Value,
    inverse_payload: Value,
) -> JournalOperation {
    JournalOperation {
        sequence,
        transaction_id: transaction_id.into(),
        command_type: command_type.into(),
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

fn showroom_replay_records(snapshot: &ProjectSnapshot) -> (Value, Vec<(&'static str, Value)>) {
    let floor = serde_json::to_value(&snapshot.project.floors[0]).unwrap();
    let floor_id = floor["id"].clone();
    let layer_id = floor["layers"][0]["id"].clone();
    let asset_id = json!("90000000-0000-4000-8000-000000000001");
    let fixture_id = json!("90000000-0000-4000-8000-000000000002");
    let media_id = json!("90000000-0000-4000-8000-000000000003");
    let network_id = json!("90000000-0000-4000-8000-000000000005");
    let entrance_id = json!("90000000-0000-4000-8000-000000000006");
    let stop_id = json!("90000000-0000-4000-8000-000000000007");
    let sha256 = "d".repeat(64);
    let fixture = json!({
        "type": "fixture",
        "id": fixture_id,
        "name": "Replay fixture",
        "tags": [],
        "floorId": floor_id,
        "layerId": layer_id,
        "transform": {
            "translation": { "x": 0, "y": 0 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "locked": false,
        "kind": "display-table",
        "size": { "width": 1200, "height": 600 }
    });
    let asset = json!({
        "id": asset_id,
        "sha256": sha256,
        "relativePath": format!("assets/sha256/dd/{sha256}.png"),
        "mediaType": "image/png",
        "size": 128
    });
    let media = json!({
        "id": media_id,
        "name": "Replay image",
        "tags": [],
        "assetId": asset_id,
        "kind": "image"
    });
    let content = json!({
        "id": "90000000-0000-4000-8000-000000000004",
        "name": "Replay content",
        "tags": [],
        "targetEntityId": fixture_id,
        "description": "Recovered product content",
        "mediaAssetIds": [media_id]
    });
    let network = json!({
        "id": network_id,
        "name": "Replay network",
        "tags": [],
        "nodes": [
            {
                "id": entrance_id,
                "name": "Entrance",
                "tags": [],
                "position": { "x": 0, "y": 0 },
                "floorId": floor_id,
                "kind": "entrance"
            },
            {
                "id": stop_id,
                "name": "Product stop",
                "tags": [],
                "position": { "x": 1500, "y": 0 },
                "floorId": floor_id,
                "kind": "showroom-stop"
            }
        ],
        "edges": [{
            "id": "90000000-0000-4000-8000-000000000008",
            "name": "Entrance to product",
            "tags": [],
            "from": entrance_id,
            "to": stop_id,
            "distance": 1500,
            "bidirectional": true,
            "accessible": true,
            "enabled": true,
            "width": 1200,
            "weight": 1
        }]
    });
    let guided = json!({
        "id": "90000000-0000-4000-8000-000000000009",
        "name": "Replay guide",
        "tags": [],
        "routeNetworkId": network_id,
        "stopNodeIds": [entrance_id, stop_id]
    });
    (
        fixture,
        vec![
            ("assets", asset),
            ("mediaAssets", media),
            ("productContents", content),
            ("routeNetworks", network),
            ("guidedRoutes", guided),
        ],
    )
}

fn with_showroom_replay_records(
    snapshot: &ProjectSnapshot,
    fixture: &Value,
    records: &[(&str, Value)],
    sequence: u64,
) -> ProjectSnapshot {
    let mut value = serde_json::to_value(snapshot).unwrap();
    value["sequence"] = json!(sequence);
    value["project"]["entities"]
        .as_array_mut()
        .unwrap()
        .push(fixture.clone());
    for (collection, record) in records {
        let target = if *collection == "assets" {
            &mut value["assets"]
        } else {
            &mut value["project"][*collection]
        };
        target.as_array_mut().unwrap().push(record.clone());
    }
    serde_json::from_value(value).unwrap()
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

#[test]
fn dirty_building_structure_patch_recovers_wall_and_opening_together() {
    let opened = create("Building Dirty Recovery");
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let floor = &initial.project.floors[0];
    let wall = json!({
        "type": "wall",
        "id": "00000000-0000-4000-8000-000000000180",
        "name": "Wall",
        "tags": [],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "transform": {
            "translation": { "x": 0, "y": 0 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "spatial3D": { "elevation": 0, "height": 2800 },
        "locked": false,
        "centerLine": [{ "x": 0, "y": 0 }, { "x": 4000, "y": 0 }],
        "thickness": 120
    });
    let opening = json!({
        "id": "00000000-0000-4000-8000-000000000181",
        "name": "Door",
        "tags": [],
        "wallId": wall["id"],
        "kind": "door",
        "distanceAlongWall": 2000,
        "width": 900,
        "height": 2100,
        "sillHeight": 0
    });
    let wall_change = json!({
        "id": wall["id"],
        "before": null,
        "after": wall,
        "index": 0
    });
    let opening_change = json!({
        "id": opening["id"],
        "before": null,
        "after": opening,
        "index": 0
    });
    let payload = json!({
        "reason": "create",
        "wallChanges": [wall_change.clone()],
        "openingChanges": [opening_change.clone()]
    });
    let inverse = json!({
        "reason": "create",
        "wallChanges": [{
            "id": wall_change["id"],
            "before": wall_change["after"],
            "after": wall_change["before"],
            "index": 0
        }],
        "openingChanges": [{
            "id": opening_change["id"],
            "before": opening_change["after"],
            "after": opening_change["before"],
            "index": 0
        }]
    });
    let mut dirty = initial.clone();
    dirty.project.entities = vec![wall];
    dirty.project.openings = vec![serde_json::from_value(opening).unwrap()];
    dirty.sequence = 1;
    session
        .commit(CommitBatch {
            before: initial,
            after: dirty.clone(),
            journal: vec![JournalOperation {
                sequence: 1,
                transaction_id: "00000000-0000-4000-8000-000000000182".into(),
                command_type: "building.structure.patch".into(),
                payload,
                inverse_payload: inverse,
                action: JournalAction::Apply,
                timestamp: "2026-07-29T00:00:00.000Z".into(),
            }],
        })
        .unwrap();
    drop(session);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, dirty);
}

#[test]
fn complete_m2_2_building_survives_checkpoint_reopen_and_dirty_recovery() {
    let opened = create("M2.2 Vertical Recovery");
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let floor = initial.project.floors[0].clone();
    let wall = json!({
        "type": "wall",
        "id": "00000000-0000-4000-8000-000000000500",
        "name": "Recovery wall",
        "tags": [],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "transform": {
            "translation": { "x": 0, "y": 0 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "spatial3D": { "elevation": 0, "height": 2800 },
        "locked": false,
        "centerLine": [{ "x": 0, "y": 0 }, { "x": 10000, "y": 0 }],
        "thickness": 120
    });
    let door = json!({
        "id": "00000000-0000-4000-8000-000000000501",
        "name": "Recovery door",
        "tags": [],
        "wallId": wall["id"],
        "kind": "door",
        "distanceAlongWall": 2000,
        "width": 900,
        "height": 2100,
        "sillHeight": 0
    });
    let window = json!({
        "id": "00000000-0000-4000-8000-000000000502",
        "name": "Recovery window",
        "tags": [],
        "wallId": wall["id"],
        "kind": "window",
        "distanceAlongWall": 6000,
        "width": 1200,
        "height": 1200,
        "sillHeight": 900
    });
    let wall_changes = vec![json!({
        "id": wall["id"],
        "before": null,
        "after": wall,
        "index": 0
    })];
    let opening_changes = vec![
        json!({
            "id": door["id"],
            "before": null,
            "after": door,
            "index": 0
        }),
        json!({
            "id": window["id"],
            "before": null,
            "after": window,
            "index": 1
        }),
    ];
    let building_payload = json!({
        "reason": "create",
        "wallChanges": wall_changes,
        "openingChanges": opening_changes
    });
    let building_inverse = json!({
        "reason": "create",
        "wallChanges": inverse_changes(&wall_changes),
        "openingChanges": inverse_changes(&opening_changes)
    });
    let mut building_applied = initial.clone();
    building_applied.project.entities = vec![wall.clone()];
    building_applied.project.openings = vec![
        serde_json::from_value(door.clone()).unwrap(),
        serde_json::from_value(window.clone()).unwrap(),
    ];
    building_applied.sequence = 1;
    session
        .commit(CommitBatch {
            before: initial,
            after: building_applied.clone(),
            journal: vec![typed_operation(
                1,
                "00000000-0000-4000-8000-000000000503",
                "building.structure.patch",
                building_payload,
                building_inverse,
            )],
        })
        .unwrap();

    let rooms: Vec<Value> = (0..4)
        .map(|index| {
            let x = index * 2000;
            json!({
                "type": "space-unit",
                "kind": "room",
                "id": format!("00000000-0000-4000-8000-{:012}", 510 + index),
                "name": format!("Recovered room {}", index + 1),
                "tags": ["confirmed"],
                "floorId": floor.id,
                "layerId": floor.layers[0].id,
                "transform": {
                    "translation": { "x": 0, "y": 0 },
                    "rotation": 0,
                    "scale": { "x": 1, "y": 1 }
                },
                "locked": false,
                "footprint": [
                    { "x": x, "y": 1000 },
                    { "x": x + 1500, "y": 1000 },
                    { "x": x + 1500, "y": 2500 },
                    { "x": x, "y": 2500 }
                ]
            })
        })
        .collect();
    let catalogue = [
        ("display-case", 1200, 600, 1200),
        ("display-table", 1500, 750, 900),
        ("shelf", 1000, 400, 2000),
        ("checkout", 1600, 700, 1000),
        ("screen", 1200, 100, 1800),
        ("partition", 1200, 100, 2400),
        ("signage", 600, 100, 1800),
    ];
    let fixtures: Vec<Value> = catalogue
        .iter()
        .enumerate()
        .map(|(index, (kind, width, depth, height))| {
            json!({
                "type": "fixture",
                "kind": kind,
                "id": format!("00000000-0000-4000-8000-{:012}", 520 + index),
                "name": format!("Recovered catalogue {kind}"),
                "tags": [],
                "floorId": floor.id,
                "layerId": floor.layers[0].id,
                "transform": {
                    "translation": { "x": index * 1000, "y": 3000 },
                    "rotation": 0,
                    "scale": { "x": 1, "y": 1 }
                },
                "spatial3D": { "elevation": 0, "height": height },
                "locked": false,
                "size": { "width": width, "height": depth }
            })
        })
        .collect();
    let legacy_fixture = json!({
        "type": "fixture",
        "kind": "display-case",
        "id": "00000000-0000-4000-8000-000000000527",
        "name": "Recovered legacy fixture",
        "tags": ["legacy"],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "transform": {
            "translation": { "x": 8000, "y": 3000 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "locked": false,
        "size": { "width": 1200, "height": 600 }
    });
    let mut durable_entities = rooms.clone();
    durable_entities.extend(fixtures.clone());
    durable_entities.push(legacy_fixture.clone());
    let entity_changes: Vec<Value> = durable_entities
        .iter()
        .enumerate()
        .map(|(index, entity)| {
            json!({
                "id": entity["id"],
                "before": null,
                "after": entity,
                "index": index + 1
            })
        })
        .collect();
    let entity_payload = json!({ "reason": "create", "changes": entity_changes });
    let entity_inverse = json!({
        "reason": "create",
        "changes": inverse_changes(&entity_changes)
    });
    let mut complete = building_applied.clone();
    complete.project.entities.extend(durable_entities);
    complete.sequence = 2;
    session
        .commit(CommitBatch {
            before: building_applied,
            after: complete.clone(),
            journal: vec![typed_operation(
                2,
                "00000000-0000-4000-8000-000000000504",
                "plan.entities.patch",
                entity_payload,
                entity_inverse,
            )],
        })
        .unwrap();
    let checkpoint = session
        .checkpoint(session.snapshot().clone())
        .unwrap()
        .snapshot;
    assert_eq!(checkpoint.schema_version, 3);
    assert_eq!(checkpoint.checkpoint_sequence, 2);
    session.close().unwrap();

    let mut reopened = open_session(&opened.project_path, false).unwrap();
    assert_eq!(reopened.snapshot(), &checkpoint);
    let edited_window = json!({
        "id": window["id"],
        "name": "Recovered edited window",
        "tags": [],
        "wallId": wall["id"],
        "kind": "window",
        "distanceAlongWall": 6250,
        "width": 1400,
        "height": 1200,
        "sillHeight": 900
    });
    let edit_changes = vec![json!({
        "id": window["id"],
        "before": window,
        "after": edited_window,
        "index": 1
    })];
    let edit_payload = json!({
        "reason": "properties",
        "wallChanges": [],
        "openingChanges": edit_changes
    });
    let edit_inverse = json!({
        "reason": "properties",
        "wallChanges": [],
        "openingChanges": inverse_changes(&edit_changes)
    });
    let mut dirty = checkpoint.clone();
    dirty.project.openings[1] = serde_json::from_value(edited_window).unwrap();
    dirty.sequence = 3;
    reopened
        .commit(CommitBatch {
            before: checkpoint,
            after: dirty.clone(),
            journal: vec![typed_operation(
                3,
                "00000000-0000-4000-8000-000000000505",
                "building.structure.patch",
                edit_payload,
                edit_inverse,
            )],
        })
        .unwrap();
    assert_eq!(reopened.save_state(), SaveState::Dirty);
    drop(reopened);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, dirty);
    assert_eq!(
        recovered
            .snapshot
            .project
            .entities
            .iter()
            .filter(|entity| entity["type"] == "space-unit")
            .count(),
        4
    );
    assert_eq!(
        recovered
            .snapshot
            .project
            .entities
            .iter()
            .filter(|entity| entity["type"] == "fixture")
            .count(),
        8
    );
    assert_eq!(recovered.snapshot.project.openings.len(), 2);
    let recovered_legacy = recovered
        .snapshot
        .project
        .entities
        .iter()
        .find(|entity| entity["id"] == legacy_fixture["id"])
        .unwrap();
    assert!(recovered_legacy.get("spatial3D").is_none());
    let durable_json = serde_json::to_string(&recovered.snapshot).unwrap();
    for transient in ["roomCandidates", "candidateKey", "fingerprint", "parts"] {
        assert!(!durable_json.contains(transient));
    }
}

#[test]
fn content_and_routes_survive_checkpoint_reopen_and_dirty_recovery() {
    let opened = create("Content Route Recovery");
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let (fixture, records) = showroom_replay_records(&initial);
    let transaction_id = "90000000-0000-4000-8000-000000000010";
    let entity_changes = vec![json!({
        "id": fixture["id"],
        "before": null,
        "after": fixture,
        "index": 0
    })];
    let mut journal = vec![typed_operation(
        1,
        transaction_id,
        "plan.entities.patch",
        json!({ "reason": "create", "changes": entity_changes }),
        json!({
            "reason": "create",
            "changes": inverse_changes(&entity_changes)
        }),
    )];
    for (index, (collection, record)) in records.iter().enumerate() {
        let changes = vec![json!({
            "id": record["id"],
            "before": null,
            "after": record,
            "index": 0
        })];
        let (payload, inverse_payload) = patch(collection, changes);
        journal.push(operation(
            u64::try_from(index + 2).unwrap(),
            transaction_id,
            payload,
            inverse_payload,
        ));
    }
    let applied = with_showroom_replay_records(&initial, &fixture, &records, 6);
    session
        .commit(CommitBatch {
            before: initial,
            after: applied,
            journal,
        })
        .unwrap();
    let checkpoint = session
        .checkpoint(session.snapshot().clone())
        .unwrap()
        .snapshot;
    assert_eq!(checkpoint.sequence, 6);
    assert_eq!(checkpoint.checkpoint_sequence, 6);
    session.close().unwrap();

    let mut reopened = open_session(&opened.project_path, false).unwrap();
    assert_eq!(reopened.snapshot(), &checkpoint);
    let guided_before = records
        .iter()
        .find(|(collection, _)| *collection == "guidedRoutes")
        .unwrap()
        .1
        .clone();
    let mut guided_after = guided_before.clone();
    guided_after["name"] = json!("Recovered guide edit");
    let changes = vec![json!({
        "id": guided_before["id"],
        "before": guided_before,
        "after": guided_after,
        "index": 0
    })];
    let (payload, inverse_payload) = patch("guidedRoutes", changes);
    let mut dirty_value = serde_json::to_value(&checkpoint).unwrap();
    dirty_value["sequence"] = json!(7);
    dirty_value["project"]["guidedRoutes"][0] = guided_after;
    let dirty: ProjectSnapshot = serde_json::from_value(dirty_value).unwrap();
    reopened
        .commit(CommitBatch {
            before: checkpoint,
            after: dirty.clone(),
            journal: vec![operation(
                7,
                "90000000-0000-4000-8000-000000000011",
                payload,
                inverse_payload,
            )],
        })
        .unwrap();
    assert_eq!(reopened.save_state(), SaveState::Dirty);
    drop(reopened);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, dirty);
}

#[test]
fn product_hotspot_entity_and_content_replay_as_one_record_transaction() {
    let opened = create("Product Hotspot Record Recovery");
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let floor = serde_json::to_value(&initial.project.floors[0]).unwrap();
    let hotspot = json!({
        "id": "90000000-0000-4000-8000-000000000020",
        "name": "Recovered hotspot",
        "tags": [],
        "floorId": floor["id"],
        "layerId": floor["layers"][0]["id"],
        "transform": {
            "translation": { "x": 1250, "y": -750 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "locked": false,
        "type": "poi",
        "kind": "product-hotspot"
    });
    let content = json!({
        "id": "90000000-0000-4000-8000-000000000021",
        "name": "Recovered hotspot",
        "tags": [],
        "targetEntityId": hotspot["id"],
        "description": "",
        "mediaAssetIds": []
    });
    let entity_changes = vec![json!({
        "id": hotspot["id"],
        "before": null,
        "after": hotspot,
        "index": 0
    })];
    let content_changes = vec![json!({
        "id": content["id"],
        "before": null,
        "after": content,
        "index": 0
    })];
    let (entity_payload, entity_inverse) = patch("entities", entity_changes);
    let (content_payload, content_inverse) = patch("productContents", content_changes);
    let mut applied_value = serde_json::to_value(&initial).unwrap();
    applied_value["sequence"] = json!(2);
    applied_value["project"]["entities"]
        .as_array_mut()
        .unwrap()
        .push(hotspot);
    applied_value["project"]["productContents"]
        .as_array_mut()
        .unwrap()
        .push(content);
    let applied: ProjectSnapshot = serde_json::from_value(applied_value).unwrap();
    let transaction_id = "90000000-0000-4000-8000-000000000022";

    session
        .commit(CommitBatch {
            before: initial,
            after: applied.clone(),
            journal: vec![
                operation(1, transaction_id, entity_payload, entity_inverse),
                operation(2, transaction_id, content_payload, content_inverse),
            ],
        })
        .unwrap();
    assert_eq!(session.snapshot(), &applied);
    drop(session);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(recovered.snapshot, applied);
    assert!(recovered.recovered);
}

#[test]
fn complete_m2_3_showroom_survives_checkpoint_reopen_and_dirty_recovery() {
    let opened = create("Complete M2.3 Recovery");
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let floor = serde_json::to_value(&initial.project.floors[0]).unwrap();
    let floor_id = floor["id"].clone();
    let layer_id = floor["layers"][0]["id"].clone();
    let mut hotspots = Vec::new();
    let mut assets = Vec::new();
    let mut media_assets = Vec::new();
    let mut contents = Vec::new();
    for index in 0..10_u32 {
        let suffix = format!("{:012}", index + 1);
        let hotspot_id = format!("c1000000-0000-4000-8000-{suffix}");
        let asset_id = format!("c1100000-0000-4000-8000-{suffix}");
        let media_id = format!("c1200000-0000-4000-8000-{suffix}");
        let content_id = format!("c1300000-0000-4000-8000-{suffix}");
        let video = index == 1;
        let digest = format!("{value:064x}", value = index + 1);
        let extension = if video { "mp4" } else { "png" };
        let media_type = if video { "video/mp4" } else { "image/png" };
        let media_kind = if video { "video" } else { "image" };
        hotspots.push(json!({
            "id": hotspot_id,
            "name": format!("Milestone hotspot {}", index + 1),
            "tags": ["m2.3"],
            "floorId": floor_id,
            "layerId": layer_id,
            "transform": {
                "translation": { "x": index * 1000, "y": 1000 },
                "rotation": 0,
                "scale": { "x": 1, "y": 1 }
            },
            "locked": false,
            "type": "poi",
            "kind": "product-hotspot"
        }));
        assets.push(json!({
            "id": asset_id,
            "sha256": digest,
            "relativePath": format!("assets/sha256/{}/{}.{}", &digest[..2], digest, extension),
            "mediaType": media_type,
            "size": if video { 12 } else { 45 }
        }));
        media_assets.push(json!({
            "id": media_id,
            "name": format!("Milestone media {}", index + 1),
            "tags": ["local"],
            "assetId": asset_id,
            "kind": media_kind
        }));
        contents.push(json!({
            "id": content_id,
            "name": format!("Milestone product {}", index + 1),
            "tags": ["showroom"],
            "targetEntityId": hotspot_id,
            "description": format!("Product {}", index + 1),
            "mediaAssetIds": [media_id]
        }));
    }
    let entrance_id = json!("c1400000-0000-4000-8000-000000000001");
    let junction_id = json!("c1400000-0000-4000-8000-000000000002");
    let stop_id = json!("c1400000-0000-4000-8000-000000000003");
    let network = json!({
        "id": "c1400000-0000-4000-8000-000000000004",
        "name": "Connected milestone network",
        "tags": ["showroom"],
        "nodes": [
            { "id": entrance_id, "name": "Entrance", "tags": [], "position": { "x": 0, "y": 0 }, "floorId": floor_id, "kind": "entrance" },
            { "id": junction_id, "name": "Junction", "tags": [], "position": { "x": 1000, "y": 0 }, "floorId": floor_id, "kind": "junction" },
            { "id": stop_id, "name": "Showroom stop", "tags": [], "position": { "x": 2000, "y": 0 }, "floorId": floor_id, "kind": "showroom-stop" }
        ],
        "edges": [
            { "id": "c1400000-0000-4000-8000-000000000005", "name": "Entrance link", "tags": [], "from": entrance_id, "to": junction_id, "distance": 1000, "bidirectional": true, "accessible": true, "enabled": true, "width": 1200, "weight": 1 },
            { "id": "c1400000-0000-4000-8000-000000000006", "name": "Stop link", "tags": [], "from": junction_id, "to": stop_id, "distance": 1000, "bidirectional": true, "accessible": true, "enabled": true, "width": 1200, "weight": 1 }
        ]
    });
    let guided = json!({
        "id": "c1400000-0000-4000-8000-000000000007",
        "name": "Only milestone guide",
        "tags": [],
        "routeNetworkId": network["id"],
        "stopNodeIds": [entrance_id, stop_id]
    });
    let collections = vec![
        ("entities", hotspots),
        ("assets", assets),
        ("mediaAssets", media_assets),
        ("productContents", contents),
        ("routeNetworks", vec![network]),
        ("guidedRoutes", vec![guided]),
    ];
    let transaction_id = "c1500000-0000-4000-8000-000000000001";
    let mut applied_value = serde_json::to_value(&initial).unwrap();
    let mut journal = Vec::new();
    for (collection_index, (collection, records)) in collections.iter().enumerate() {
        let changes = records
            .iter()
            .enumerate()
            .map(|(index, record)| {
                json!({
                    "id": record["id"],
                    "before": null,
                    "after": record,
                    "index": index
                })
            })
            .collect::<Vec<_>>();
        let (payload, inverse_payload) = patch(collection, changes);
        journal.push(operation(
            u64::try_from(collection_index + 1).unwrap(),
            transaction_id,
            payload,
            inverse_payload,
        ));
        let target = if *collection == "assets" {
            &mut applied_value["assets"]
        } else {
            &mut applied_value["project"][*collection]
        };
        target
            .as_array_mut()
            .unwrap()
            .extend(records.iter().cloned());
    }
    applied_value["sequence"] = json!(6);
    let applied: ProjectSnapshot = serde_json::from_value(applied_value).unwrap();
    session
        .commit(CommitBatch {
            before: initial,
            after: applied.clone(),
            journal,
        })
        .unwrap();
    let checkpoint = session.checkpoint(applied).unwrap().snapshot;
    assert_eq!(checkpoint.sequence, 6);
    assert_eq!(checkpoint.checkpoint_sequence, 6);
    session.close().unwrap();

    let mut reopened = open_session(&opened.project_path, false).unwrap();
    assert_eq!(reopened.snapshot(), &checkpoint);
    let checkpoint_value = serde_json::to_value(&checkpoint).unwrap();
    let content_before = checkpoint_value["project"]["productContents"][0].clone();
    let route_before = checkpoint_value["project"]["guidedRoutes"][0].clone();
    let mut content_after = content_before.clone();
    content_after["description"] = json!("Dirty recovered product copy");
    let mut route_after = route_before.clone();
    route_after["name"] = json!("Dirty recovered guide");
    let content_changes = vec![json!({
        "id": content_before["id"],
        "before": content_before,
        "after": content_after,
        "index": 0
    })];
    let route_changes = vec![json!({
        "id": route_before["id"],
        "before": route_before,
        "after": route_after,
        "index": 0
    })];
    let (content_payload, content_inverse) = patch("productContents", content_changes);
    let (route_payload, route_inverse) = patch("guidedRoutes", route_changes);
    let mut dirty_value = checkpoint_value;
    dirty_value["sequence"] = json!(8);
    dirty_value["project"]["productContents"][0] = content_after;
    dirty_value["project"]["guidedRoutes"][0] = route_after;
    let dirty: ProjectSnapshot = serde_json::from_value(dirty_value).unwrap();
    let dirty_transaction = "c1500000-0000-4000-8000-000000000002";
    reopened
        .commit(CommitBatch {
            before: checkpoint,
            after: dirty.clone(),
            journal: vec![
                operation(7, dirty_transaction, content_payload, content_inverse),
                operation(8, dirty_transaction, route_payload, route_inverse),
            ],
        })
        .unwrap();
    assert_eq!(reopened.save_state(), SaveState::Dirty);
    drop(reopened);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, dirty);
    let recovered_value = serde_json::to_value(&recovered.snapshot).unwrap();
    assert_eq!(recovered_value["schemaVersion"], 3);
    let recovered_hotspots = recovered_value["project"]["entities"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|entity| entity["type"] == "poi" && entity["kind"] == "product-hotspot")
        .collect::<Vec<_>>();
    let recovered_contents = recovered_value["project"]["productContents"]
        .as_array()
        .unwrap();
    assert_eq!(recovered_hotspots.len(), 10);
    assert_eq!(recovered_contents.len(), 10);
    for hotspot in recovered_hotspots {
        let owned = recovered_contents
            .iter()
            .filter(|content| content["targetEntityId"] == hotspot["id"])
            .collect::<Vec<_>>();
        assert_eq!(owned.len(), 1);
        assert!(!owned[0]["mediaAssetIds"].as_array().unwrap().is_empty());
    }
    let recovered_assets = recovered_value["assets"].as_array().unwrap();
    assert!(recovered_assets.iter().all(|asset| {
        asset["relativePath"]
            .as_str()
            .is_some_and(|path| path.starts_with("assets/sha256/") && !path.contains('\\'))
    }));
    assert!(
        recovered_assets
            .iter()
            .any(|asset| asset["mediaType"] == "image/png")
    );
    assert!(
        recovered_assets
            .iter()
            .any(|asset| asset["mediaType"] == "video/mp4")
    );
    let networks = recovered_value["project"]["routeNetworks"]
        .as_array()
        .unwrap();
    let routes = recovered_value["project"]["guidedRoutes"]
        .as_array()
        .unwrap();
    assert_eq!(networks.len(), 1);
    assert_eq!(routes.len(), 1);
    assert_eq!(
        networks[0]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|node| node["kind"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec!["entrance", "junction", "showroom-stop"]
    );
    let stop_ids = routes[0]["stopNodeIds"].as_array().unwrap();
    assert!(stop_ids.len() >= 2);
    assert_ne!(stop_ids[0], stop_ids[1]);
}
