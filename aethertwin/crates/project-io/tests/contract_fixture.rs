use project_io::{
    AssetRecord, Floor, ProjectIoError, ProjectManifest, ProjectProfile, ProjectSnapshot,
    SpatialProject,
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
        schema_version: 1,
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
            }],
        },
        assets: vec![AssetRecord {
            id: asset_id,
            sha256: "a".repeat(64),
            relative_path: "assets/item.png".into(),
            media_type: "image/png".into(),
            size: 12,
        }],
    };
    let expected = json!({
        "schemaVersion": 1,
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
                "tags": []
            }]
        },
        "assets": [{
            "id": "00000000-0000-4000-8000-000000000003",
            "sha256": "a".repeat(64),
            "relativePath": "assets/item.png",
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
