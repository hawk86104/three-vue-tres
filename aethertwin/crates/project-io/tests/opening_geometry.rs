use project_io::ProjectSnapshot;
use serde_json::{Value, json};
use std::fs;

fn fixture_snapshot() -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/snapshot.v3.json");
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}

fn wall_entity(wall: &Value) -> Value {
    let mut entity = json!({
        "type": "wall",
        "id": wall["id"],
        "name": wall["id"],
        "tags": [],
        "floorId": "00000000-0000-4000-8000-000000000002",
        "layerId": "00000000-0000-4000-8000-000000000003",
        "transform": wall["transform"],
        "locked": wall.get("locked").and_then(Value::as_bool).unwrap_or(false),
        "centerLine": wall["centerLine"],
        "thickness": wall["thickness"]
    });
    if let Some(height) = wall.get("height") {
        entity["spatial3D"] = json!({ "elevation": 0, "height": height });
    }
    entity
}

fn opening_record(opening: &Value) -> Value {
    json!({
        "id": opening["id"],
        "name": opening["id"],
        "tags": [],
        "wallId": opening["wallId"],
        "kind": opening["kind"],
        "distanceAlongWall": opening["distanceAlongWall"],
        "width": opening["width"],
        "height": opening["height"],
        "sillHeight": opening["sillHeight"]
    })
}

#[test]
fn shared_opening_geometry_validation_vectors_match_snapshot_acceptance() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/opening-geometry.v1.json");
    let vectors: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    let mut mismatches = Vec::new();

    for case in vectors["validationCases"].as_array().unwrap() {
        let mut snapshot = fixture_snapshot();
        snapshot["project"]["entities"] = Value::Array(
            case["walls"]
                .as_array()
                .unwrap()
                .iter()
                .map(wall_entity)
                .collect(),
        );
        snapshot["project"]["openings"] = Value::Array(
            case["openings"]
                .as_array()
                .unwrap()
                .iter()
                .map(opening_record)
                .collect(),
        );
        let expected_valid = case["expectedIssues"].as_array().unwrap().is_empty();
        let actual_valid = serde_json::from_value::<ProjectSnapshot>(snapshot).is_ok();
        if actual_valid != expected_valid {
            mismatches.push(format!(
                "{}: expected {}, got {}",
                case["name"].as_str().unwrap(),
                if expected_valid { "valid" } else { "invalid" },
                if actual_valid { "valid" } else { "invalid" },
            ));
        }
    }

    assert!(
        mismatches.is_empty(),
        "Rust snapshot validation diverged from shared vectors:\n{}",
        mismatches.join("\n")
    );
}
