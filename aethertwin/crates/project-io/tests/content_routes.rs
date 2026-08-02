use project_io::{
    AssetRecord, CommitBatch, CreateProjectRequest, JournalAction, JournalOperation,
    ProjectProfile, ProjectSnapshot, create_project, open_session, recover_project,
};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{Value, json};
use std::fs;
use tempfile::tempdir;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractVectors {
    version: u32,
    route_geometry_epsilon_mm: f64,
    base_snapshot: Value,
    valid_cases: Vec<VectorCase>,
    invalid_cases: Vec<VectorCase>,
}

#[derive(Debug, Deserialize)]
struct VectorCase {
    name: String,
    operations: Vec<VectorOperation>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
enum VectorOperation {
    Set {
        path: Vec<PathSegment>,
        value: Value,
    },
    Append {
        path: Vec<PathSegment>,
        value: Value,
    },
    Remove {
        path: Vec<PathSegment>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PathSegment {
    Key(String),
    Index(usize),
}

fn vectors() -> ContractVectors {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/content-routes.v1.json");
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}

fn value_at_path_mut<'a>(mut value: &'a mut Value, path: &[PathSegment]) -> &'a mut Value {
    for segment in path {
        value = match segment {
            PathSegment::Key(key) => value
                .as_object_mut()
                .and_then(|source| source.get_mut(key))
                .unwrap_or_else(|| panic!("missing object path segment {key}")),
            PathSegment::Index(index) => value
                .as_array_mut()
                .and_then(|source| source.get_mut(*index))
                .unwrap_or_else(|| panic!("missing array path segment {index}")),
        };
    }
    value
}

fn replace_at_path(value: &mut Value, path: &[PathSegment], replacement: Value) {
    let (last, parent_path) = path.split_last().expect("set requires a non-empty path");
    let parent = value_at_path_mut(value, parent_path);
    match last {
        PathSegment::Key(key) => {
            let entry = parent
                .as_object_mut()
                .and_then(|source| source.get_mut(key))
                .unwrap_or_else(|| panic!("missing set property {key}"));
            *entry = replacement;
        }
        PathSegment::Index(index) => {
            let entry = parent
                .as_array_mut()
                .and_then(|source| source.get_mut(*index))
                .unwrap_or_else(|| panic!("missing set index {index}"));
            *entry = replacement;
        }
    }
}

fn remove_at_path(value: &mut Value, path: &[PathSegment]) {
    let (last, parent_path) = path.split_last().expect("remove requires a non-empty path");
    let parent = value_at_path_mut(value, parent_path);
    match last {
        PathSegment::Key(key) => {
            assert!(
                parent
                    .as_object_mut()
                    .and_then(|source| source.remove(key))
                    .is_some(),
                "missing remove property {key}",
            );
        }
        PathSegment::Index(index) => {
            let source = parent
                .as_array_mut()
                .expect("remove target is not an array");
            assert!(*index < source.len(), "missing remove index {index}");
            source.remove(*index);
        }
    }
}

fn apply_operation(value: &mut Value, operation: &VectorOperation) {
    match operation {
        VectorOperation::Set {
            path,
            value: replacement,
        } => replace_at_path(value, path, replacement.clone()),
        VectorOperation::Append { path, value: item } => value_at_path_mut(value, path)
            .as_array_mut()
            .expect("append target is not an array")
            .push(item.clone()),
        VectorOperation::Remove { path } => remove_at_path(value, path),
    }
}

fn candidate(base: &Value, vector: &VectorCase) -> Value {
    let mut value = base.clone();
    for operation in &vector.operations {
        apply_operation(&mut value, operation);
    }
    value
}

fn inverse_changes(changes: &[Value]) -> Vec<Value> {
    changes
        .iter()
        .rev()
        .map(|change| {
            json!({
                "id": change["id"],
                "before": change["after"],
                "after": change["before"],
                "index": change["index"],
            })
        })
        .collect()
}

fn transaction_operations(
    patches: &[(&str, Value, Value)],
    first_sequence: u64,
    transaction_id: &str,
    action: JournalAction,
    reverse: bool,
) -> Vec<JournalOperation> {
    let indices = if reverse {
        (0..patches.len()).rev().collect::<Vec<_>>()
    } else {
        (0..patches.len()).collect::<Vec<_>>()
    };
    indices
        .into_iter()
        .enumerate()
        .map(|(offset, index)| {
            let (command_type, payload, inverse_payload) = &patches[index];
            JournalOperation {
                sequence: first_sequence + offset as u64,
                transaction_id: transaction_id.into(),
                command_type: (*command_type).into(),
                payload: payload.clone(),
                inverse_payload: inverse_payload.clone(),
                action,
                timestamp: "2026-08-02T00:00:00.000Z".into(),
            }
        })
        .collect()
}

fn assert_normalized_row(
    connection: &Connection,
    id: &str,
    expected_type: &str,
    expected_parent: &str,
    expected_payload: &Value,
) {
    let (entity_type, parent_id, payload_json): (String, Option<String>, String) = connection
        .query_row(
            "SELECT entity_type, parent_id, payload_json FROM entity_records WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(entity_type, expected_type);
    assert_eq!(parent_id.as_deref(), Some(expected_parent));
    assert_eq!(
        serde_json::from_str::<Value>(&payload_json).unwrap(),
        *expected_payload,
    );
}

#[test]
fn shared_contract_metadata_is_exact() {
    let vectors = vectors();
    assert_eq!(vectors.version, 1);
    assert_eq!(vectors.route_geometry_epsilon_mm, 1e-7);
}

#[test]
fn rust_accepts_and_round_trips_every_shared_valid_candidate() {
    let vectors = vectors();
    let mut cases = Vec::with_capacity(vectors.valid_cases.len() + 1);
    cases.push(("base snapshot", vectors.base_snapshot.clone()));
    cases.extend(vectors.valid_cases.iter().map(|vector| {
        (
            vector.name.as_str(),
            candidate(&vectors.base_snapshot, vector),
        )
    }));

    for (name, value) in cases {
        let snapshot: ProjectSnapshot = serde_json::from_value(value.clone())
            .unwrap_or_else(|error| panic!("valid vector {name:?} was rejected: {error}"));
        assert_eq!(
            serde_json::to_value(snapshot).unwrap(),
            value,
            "valid vector {name:?} did not round-trip exactly",
        );
    }
}

#[test]
fn rust_rejects_every_shared_invalid_candidate() {
    let vectors = vectors();
    let accepted = vectors
        .invalid_cases
        .iter()
        .filter_map(|vector| {
            serde_json::from_value::<ProjectSnapshot>(candidate(&vectors.base_snapshot, vector))
                .is_ok()
                .then_some(vector.name.as_str())
        })
        .collect::<Vec<_>>();

    assert!(
        accepted.is_empty(),
        "Rust accepted invalid shared vectors: {accepted:?}",
    );
}

#[test]
fn typed_record_patches_persist_normalize_undo_redo_and_recover() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Typed record replay".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let floor = &initial.project.floors[0];
    let fixture_id = "00000000-0000-4000-8000-000000000078";
    let asset_id = "00000000-0000-4000-8000-000000000080";
    let media_id = "00000000-0000-4000-8000-000000000081";
    let content_id = "00000000-0000-4000-8000-000000000082";
    let network_id = "00000000-0000-4000-8000-000000000083";
    let first_node_id = "00000000-0000-4000-8000-000000000084";
    let second_node_id = "00000000-0000-4000-8000-000000000085";
    let edge_id = "00000000-0000-4000-8000-000000000086";

    let fixture = json!({
        "type": "fixture",
        "id": fixture_id,
        "name": "Display",
        "tags": [],
        "floorId": floor.id,
        "layerId": floor.layers[0].id,
        "transform": {
            "translation": { "x": 0, "y": 0 },
            "rotation": 0,
            "scale": { "x": 1, "y": 1 }
        },
        "locked": false,
        "kind": "generic",
        "size": { "width": 1000, "height": 500 }
    });
    let asset = AssetRecord {
        id: uuid::Uuid::parse_str(asset_id).unwrap(),
        sha256: "c".repeat(64),
        relative_path: format!("assets/sha256/cc/{}.png", "c".repeat(64)),
        media_type: "image/png".into(),
        size: 64,
    };
    let asset_value = serde_json::to_value(&asset).unwrap();
    let media = json!({
        "id": media_id,
        "name": "Product image",
        "tags": [],
        "assetId": asset_id,
        "kind": "image"
    });
    let content = json!({
        "id": content_id,
        "name": "Product content",
        "tags": [],
        "targetEntityId": fixture_id,
        "description": "Featured",
        "mediaAssetIds": [media_id]
    });
    let network = json!({
        "id": network_id,
        "name": "Showroom route",
        "tags": [],
        "nodes": [
            {
                "id": first_node_id,
                "name": "Entrance",
                "tags": [],
                "position": { "x": 0, "y": 0 },
                "floorId": floor.id,
                "kind": "entrance"
            },
            {
                "id": second_node_id,
                "name": "Stop",
                "tags": [],
                "position": { "x": 1000, "y": 0 },
                "floorId": floor.id,
                "kind": "showroom-stop"
            }
        ],
        "edges": [{
            "id": edge_id,
            "name": "Entrance to stop",
            "tags": [],
            "from": first_node_id,
            "to": second_node_id,
            "distance": 1000,
            "bidirectional": true,
            "accessible": true,
            "enabled": true,
            "width": 1200,
            "weight": 1
        }]
    });

    let entity_changes = vec![json!({
        "id": fixture_id,
        "before": null,
        "after": fixture,
        "index": 0
    })];
    let asset_changes = vec![json!({
        "id": asset_id,
        "before": null,
        "after": asset_value,
        "index": 0
    })];
    let media_changes = vec![json!({
        "id": media_id,
        "before": null,
        "after": media,
        "index": 0
    })];
    let content_changes = vec![json!({
        "id": content_id,
        "before": null,
        "after": content,
        "index": 0
    })];
    let network_changes = vec![json!({
        "id": network_id,
        "before": null,
        "after": network,
        "index": 0
    })];
    let patches = vec![
        (
            "plan.entities.patch",
            json!({ "reason": "create", "changes": entity_changes }),
            json!({ "reason": "create", "changes": inverse_changes(&entity_changes) }),
        ),
        (
            "snapshot.records.patch",
            json!({ "collection": "assets", "changes": asset_changes }),
            json!({ "collection": "assets", "changes": inverse_changes(&asset_changes) }),
        ),
        (
            "snapshot.records.patch",
            json!({ "collection": "mediaAssets", "changes": media_changes }),
            json!({ "collection": "mediaAssets", "changes": inverse_changes(&media_changes) }),
        ),
        (
            "snapshot.records.patch",
            json!({ "collection": "productContents", "changes": content_changes }),
            json!({ "collection": "productContents", "changes": inverse_changes(&content_changes) }),
        ),
        (
            "snapshot.records.patch",
            json!({ "collection": "routeNetworks", "changes": network_changes }),
            json!({ "collection": "routeNetworks", "changes": inverse_changes(&network_changes) }),
        ),
    ];

    let mut applied = initial.clone();
    applied.project.entities = vec![fixture.clone()];
    applied.assets = vec![asset.clone()];
    applied.project.media_assets = vec![serde_json::from_value(media.clone()).unwrap()];
    applied.project.product_contents = vec![serde_json::from_value(content.clone()).unwrap()];
    applied.project.route_networks = vec![serde_json::from_value(network.clone()).unwrap()];
    applied.sequence = 5;
    session
        .commit(CommitBatch {
            before: initial.clone(),
            after: applied.clone(),
            journal: transaction_operations(
                &patches,
                1,
                "00000000-0000-4000-8000-000000000780",
                JournalAction::Apply,
                false,
            ),
        })
        .unwrap();

    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let project_id = initial.project.id.hyphenated().to_string();
    assert_normalized_row(&connection, media_id, "media-asset", &project_id, &media);
    assert_normalized_row(
        &connection,
        content_id,
        "product-content",
        fixture_id,
        &content,
    );
    assert_normalized_row(
        &connection,
        network_id,
        "route-network",
        &project_id,
        &network,
    );
    assert_normalized_row(
        &connection,
        first_node_id,
        "route-node",
        network_id,
        &network["nodes"][0],
    );
    assert_normalized_row(
        &connection,
        second_node_id,
        "route-node",
        network_id,
        &network["nodes"][1],
    );
    assert_normalized_row(
        &connection,
        edge_id,
        "route-edge",
        network_id,
        &network["edges"][0],
    );
    drop(connection);

    let mut undone = initial.clone();
    undone.sequence = 10;
    session
        .commit(CommitBatch {
            before: applied.clone(),
            after: undone.clone(),
            journal: transaction_operations(
                &patches,
                6,
                "00000000-0000-4000-8000-000000000781",
                JournalAction::Undo,
                true,
            ),
        })
        .unwrap();
    assert_eq!(session.snapshot(), &undone);

    let mut redone = applied;
    redone.sequence = 15;
    session
        .commit(CommitBatch {
            before: undone,
            after: redone.clone(),
            journal: transaction_operations(
                &patches,
                11,
                "00000000-0000-4000-8000-000000000782",
                JournalAction::Redo,
                false,
            ),
        })
        .unwrap();
    assert_eq!(session.snapshot(), &redone);
    drop(session);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(recovered.snapshot, redone);
    assert!(recovered.recovered);
}
