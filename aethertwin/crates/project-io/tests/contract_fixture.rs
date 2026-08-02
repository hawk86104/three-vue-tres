use project_io::{
    AssetRecord, Floor, MediaAssetKind, PlanLayer, ProjectIoError, ProjectManifest, ProjectProfile,
    ProjectSnapshot, RouteNodeKind, SpatialProject,
};
use serde_json::{Value, json};
use std::fs;
use uuid::Uuid;

#[test]
fn rust_manifest_contract_matches_the_shared_typescript_fixture() {
    let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/manifest.v1.json");
    let source = fs::read_to_string(fixture_path).unwrap();
    let expected: Value = serde_json::from_str(&source).unwrap();
    let manifest: ProjectManifest = serde_json::from_str(&source).unwrap();

    assert_eq!(manifest.profile, ProjectProfile::Showroom);
    let actual = serde_json::to_value(manifest).unwrap();
    assert_eq!(actual, expected);
}

#[test]
fn snapshot_serde_shape_matches_the_typescript_contract() {
    let project_id = Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
    let floor_id = Uuid::parse_str("00000000-0000-4000-8000-000000000002").unwrap();
    let asset_id = Uuid::parse_str("00000000-0000-4000-8000-000000000003").unwrap();
    let snapshot = ProjectSnapshot {
        schema_version: 3,
        sequence: 4,
        checkpoint_sequence: 3,
        project: SpatialProject {
            id: project_id,
            name: "Demo".into(),
            tags: vec!["quiet".into()],
            profile: ProjectProfile::Market,
            floors: vec![Floor {
                id: floor_id,
                name: "Floor".into(),
                tags: Vec::new(),
                layers: vec![PlanLayer {
                    id: Uuid::parse_str("00000000-0000-4000-8000-000000000005").unwrap(),
                    name: "Default".into(),
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
            scene_environment: Default::default(),
        },
        assets: vec![AssetRecord {
            id: asset_id,
            sha256: "a".repeat(64),
            relative_path: format!("assets/sha256/aa/{}.png", "a".repeat(64)),
            media_type: "image/png".into(),
            size: 12,
        }],
    };
    let expected = json!({
        "schemaVersion": 3,
        "sequence": 4,
        "checkpointSequence": 3,
        "project": {
            "id": "00000000-0000-4000-8000-000000000001",
            "name": "Demo",
            "tags": ["quiet"],
            "profile": "market",
            "floors": [{
                "id": "00000000-0000-4000-8000-000000000002",
                "name": "Floor",
                "tags": [],
                "layers": [{
                    "id": "00000000-0000-4000-8000-000000000005",
                    "name": "Default",
                    "tags": [],
                    "visible": true,
                    "locked": false
                }]
            }],
            "entities": [],
            "vendors": [],
            "productContents": [],
            "mediaAssets": [],
            "routeNetworks": [],
            "themes": [],
            "cameraShots": [],
            "storySequences": [],
            "planReferences": [],
            "openings": [],
            "guidedRoutes": [],
            "materials": [],
            "materialAssignments": [],
            "sceneEnvironment": { "backgroundColor": "#101820", "ambient": { "color": "#dce8f0", "intensity": 0.55 }, "key": { "color": "#fff1dc", "intensity": 1.1, "direction": [4, 8, 5] }, "shadowsEnabled": true, "shadowSoftness": 0.5 }
        },
        "assets": [{
            "id": "00000000-0000-4000-8000-000000000003",
            "sha256": "a".repeat(64),
            "relativePath": format!("assets/sha256/aa/{}.png", "a".repeat(64)),
            "mediaType": "image/png",
            "size": 12
        }]
    });

    assert_eq!(serde_json::to_value(&snapshot).unwrap(), expected);
    assert_eq!(
        serde_json::from_value::<ProjectSnapshot>(expected).unwrap(),
        snapshot
    );
}

#[test]
fn snapshot_fixtures_deserialize_and_preserve_every_version_exactly() {
    let fixtures =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/contracts");
    let v1: ProjectSnapshot =
        serde_json::from_slice(&fs::read(fixtures.join("snapshot.v1.json")).unwrap()).unwrap();
    assert_eq!(v1.schema_version, 1);
    assert!(v1.project.floors[0].layers.is_empty());

    let source = fs::read(fixtures.join("snapshot.v2.json")).unwrap();
    let expected: Value = serde_json::from_slice(&source).unwrap();
    let v2: ProjectSnapshot = serde_json::from_slice(&source).unwrap();
    assert_eq!(v2.schema_version, 2);
    let actual = serde_json::to_value(v2).unwrap();
    for key in [
        "id",
        "name",
        "tags",
        "profile",
        "floors",
        "entities",
        "vendors",
        "productContents",
        "mediaAssets",
        "routeNetworks",
        "themes",
        "cameraShots",
        "storySequences",
    ] {
        assert_eq!(
            actual["project"][key], expected["project"][key],
            "changed {key}"
        );
    }

    let source = fs::read(fixtures.join("snapshot.v3.json")).unwrap();
    let expected: Value = serde_json::from_slice(&source).unwrap();
    let v3: ProjectSnapshot = serde_json::from_slice(&source).unwrap();
    assert_eq!(v3.schema_version, 3);
    assert_eq!(serde_json::to_value(v3).unwrap(), expected);
}

#[test]
fn content_and_route_records_use_public_typed_contracts() {
    let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/content-routes.v1.json");
    let fixture: Value = serde_json::from_slice(&fs::read(fixture_path).unwrap()).unwrap();
    let expected = fixture["baseSnapshot"].clone();
    let snapshot: ProjectSnapshot = serde_json::from_value(expected.clone()).unwrap();

    assert_eq!(snapshot.project.media_assets[0].kind, MediaAssetKind::Image);
    assert_eq!(
        snapshot.project.route_networks[0].nodes[2].kind,
        RouteNodeKind::ShowroomStop
    );
    assert_eq!(serde_json::to_value(snapshot).unwrap(), expected);
}

fn complete_v3_reference_snapshot() -> Value {
    let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/snapshot.v3.json");
    let mut snapshot: Value = serde_json::from_slice(&fs::read(fixture_path).unwrap()).unwrap();
    let floor_id = "00000000-0000-4000-8000-000000000002";
    let layer_id = "00000000-0000-4000-8000-000000000003";
    let transform = json!({
        "translation": { "x": 0, "y": 0 },
        "rotation": 0,
        "scale": { "x": 1, "y": 1 }
    });
    snapshot["assets"] = json!([{
        "id": "00000000-0000-4000-8000-000000000030",
        "sha256": "a".repeat(64),
        "relativePath": format!("assets/sha256/aa/{}.png", "a".repeat(64)),
        "mediaType": "image/png",
        "size": 42
    }]);
    snapshot["project"]["entities"] = json!([
        {
            "type": "dimension",
            "id": "00000000-0000-4000-8000-000000000012",
            "name": "Width",
            "tags": [],
            "floorId": floor_id,
            "layerId": layer_id,
            "transform": transform,
            "locked": false,
            "start": { "kind": "point", "point": { "x": 0, "y": 0 } },
            "end": {
                "kind": "entity",
                "entityId": "00000000-0000-4000-8000-000000000011",
                "locator": "origin"
            },
            "offset": 50,
            "displayUnit": "mm"
        },
        {
            "type": "space-unit",
            "id": "00000000-0000-4000-8000-000000000010",
            "name": "Shop",
            "tags": [],
            "floorId": floor_id,
            "layerId": layer_id,
            "transform": transform,
            "locked": false,
            "kind": "shop",
            "footprint": [
                { "x": 0, "y": 0 },
                { "x": 1000, "y": 0 },
                { "x": 1000, "y": 1000 },
                { "x": 0, "y": 1000 }
            ]
        },
        {
            "type": "fixture",
            "id": "00000000-0000-4000-8000-000000000011",
            "name": "Display",
            "tags": [],
            "floorId": floor_id,
            "layerId": layer_id,
            "transform": transform,
            "locked": false,
            "kind": "generic",
            "size": { "width": 1000, "height": 500 }
        }
    ]);
    snapshot["project"]["vendors"] = json!([{
        "id": "00000000-0000-4000-8000-000000000020",
        "name": "Vendor",
        "tags": [],
        "spaceUnitId": "00000000-0000-4000-8000-000000000010",
        "externalId": "vendor-1",
        "category": "retail",
        "status": "active"
    }]);
    snapshot["project"]["mediaAssets"] = json!([{
        "id": "00000000-0000-4000-8000-000000000021",
        "name": "Display image",
        "tags": [],
        "assetId": "00000000-0000-4000-8000-000000000030",
        "kind": "image"
    }]);
    snapshot["project"]["productContents"] = json!([{
        "id": "00000000-0000-4000-8000-000000000022",
        "name": "Product",
        "tags": [],
        "targetEntityId": "00000000-0000-4000-8000-000000000011",
        "description": "Featured",
        "mediaAssetIds": ["00000000-0000-4000-8000-000000000021"]
    }]);
    snapshot["project"]["cameraShots"] = json!([{
        "id": "00000000-0000-4000-8000-000000000023",
        "name": "Overview",
        "tags": [],
        "position": [0, 2000, 3000],
        "target": [0, 0, 0],
        "fieldOfView": 45
    }]);
    snapshot["project"]["storySequences"] = json!([{
        "id": "00000000-0000-4000-8000-000000000024",
        "name": "Tour",
        "tags": [],
        "cameraShotIds": ["00000000-0000-4000-8000-000000000023"],
        "duration": 5
    }]);
    snapshot
}

#[test]
fn rust_v3_reference_validation_matches_the_typescript_contract() {
    let valid = complete_v3_reference_snapshot();
    serde_json::from_value::<ProjectSnapshot>(valid.clone()).unwrap();
    let unknown = "00000000-0000-4000-8000-999999999999";

    let mut invalid_cases = Vec::new();
    let mut candidate = valid.clone();
    candidate["project"]["vendors"][0]["spaceUnitId"] =
        json!("00000000-0000-4000-8000-000000000011");
    invalid_cases.push(("vendor space-unit type", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["productContents"][0]["targetEntityId"] = json!(unknown);
    invalid_cases.push(("product target", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["productContents"][0]["mediaAssetIds"][0] = json!(unknown);
    invalid_cases.push(("product media asset", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["mediaAssets"][0]["assetId"] = json!(unknown);
    invalid_cases.push(("media source asset", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["storySequences"][0]["cameraShotIds"][0] = json!(unknown);
    invalid_cases.push(("story camera shot", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["entities"][0]["end"]["entityId"] = json!(unknown);
    invalid_cases.push(("dimension entity", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["entities"][0]["end"]["locator"] = json!({ "vertex": 0 });
    invalid_cases.push(("dimension locator compatibility", candidate));

    let mut candidate = valid.clone();
    candidate["project"]["entities"][0]["end"] = json!({
        "kind": "entity",
        "entityId": "00000000-0000-4000-8000-000000000010",
        "locator": { "vertex": 99 }
    });
    invalid_cases.push(("dimension locator range", candidate));

    for (label, candidate) in invalid_cases {
        assert!(
            serde_json::from_value::<ProjectSnapshot>(candidate).is_err(),
            "accepted invalid {label} reference"
        );
    }
}

#[test]
fn project_io_errors_expose_stable_codes() {
    let cases = [
        (ProjectIoError::InvalidProjectName, "INVALID_PROJECT_NAME"),
        (
            ProjectIoError::ProjectAlreadyExists,
            "PROJECT_ALREADY_EXISTS",
        ),
        (ProjectIoError::ProjectNotFound, "PROJECT_NOT_FOUND"),
        (
            ProjectIoError::InvalidProjectStructure,
            "INVALID_PROJECT_STRUCTURE",
        ),
        (
            ProjectIoError::UnsupportedSchemaVersion,
            "UNSUPPORTED_SCHEMA_VERSION",
        ),
        (
            ProjectIoError::ManifestDatabaseMismatch,
            "MANIFEST_DATABASE_MISMATCH",
        ),
        (ProjectIoError::DatabaseError, "DATABASE_ERROR"),
        (ProjectIoError::ProjectLocked, "PROJECT_LOCKED"),
        (ProjectIoError::StaleProjectLock, "STALE_PROJECT_LOCK"),
        (ProjectIoError::InvalidResourcePath, "INVALID_RESOURCE_PATH"),
        (ProjectIoError::RecoveryFailed, "RECOVERY_FAILED"),
    ];
    for (error, expected) in cases {
        assert_eq!(error.code(), expected);
    }
}

#[test]
fn uuid_serde_matches_the_typescript_canonical_regex() {
    let fixture_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/manifest.v1.json");
    let mut manifest: Value =
        serde_json::from_str(&fs::read_to_string(fixture_path).unwrap()).unwrap();

    manifest["projectId"] = json!("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA");
    let uppercase: ProjectManifest = serde_json::from_value(manifest.clone()).unwrap();
    assert_eq!(
        serde_json::to_value(uppercase).unwrap()["projectId"],
        json!("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    );

    for rejected in [
        "00000000000040008000000000000001",
        "{00000000-0000-4000-8000-000000000001}",
        "urn:uuid:00000000-0000-4000-8000-000000000001",
        "00000000-0000-0000-8000-000000000001",
        "00000000-0000-6000-8000-000000000001",
        "00000000-0000-4000-7000-000000000001",
        "00000000-0000-4000-c000-000000000001",
    ] {
        manifest["projectId"] = json!(rejected);
        assert!(
            serde_json::from_value::<ProjectManifest>(manifest.clone()).is_err(),
            "accepted {rejected}"
        );
    }
}
