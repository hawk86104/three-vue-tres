#[path = "../examples/showroom_demo/support.rs"]
mod support;

use asset_io::{
    AssetImportRole, ImportObserver, ImportProgress, ImportRequest, import_project_asset,
};
use project_io::{
    JournalAction, ProjectSnapshot, open_session, read_project_journal_for_evidence,
    recover_project, snapshot_checksum,
};
use serde_json::{Value, json};
use std::{fs, path::Path};
use tempfile::tempdir;
use uuid::Uuid;

fn expected_snapshot() -> ProjectSnapshot {
    serde_json::from_str(include_str!(
        "../../../fixtures/contracts/showroom-demo.v3.json"
    ))
    .unwrap()
}

#[test]
fn materializes_reopens_and_recovers_the_exact_demo_snapshot() {
    let root = tempdir().unwrap();
    let destination = root.path().join("requested-demo.twinproj");
    let generated = support::generate_showroom_demo(&destination).unwrap();
    assert_eq!(generated, destination);

    let expected = expected_snapshot();
    let mut reopened = open_session(&destination, false).unwrap();
    assert_eq!(reopened.snapshot(), &expected);
    assert_eq!(reopened.snapshot().sequence, 11);
    assert_eq!(reopened.snapshot().checkpoint_sequence, 11);
    const EXPECTED_SEMANTIC_DIGEST: &str =
        "9c613551a8cf59d6af4560a53b9cef6766da01f7b0c2d108a18e3797ef5a6ada";
    assert_eq!(
        snapshot_checksum(&serde_json::to_string(reopened.snapshot()).unwrap()),
        EXPECTED_SEMANTIC_DIGEST
    );
    reopened.close().unwrap();

    let recovery_root = tempdir().unwrap();
    let recovery_project = recovery_root.path().join("recovery-demo.twinproj");
    support::generate_showroom_demo(&recovery_project).unwrap();
    let dirty = open_session(&recovery_project, false).unwrap();
    assert_eq!(dirty.snapshot(), &expected);
    drop(dirty);
    let recovered = recover_project(&recovery_project, true).unwrap();
    assert_eq!(recovered.snapshot, expected);
}

#[test]
fn refuses_existing_or_wrong_extension_destinations_without_alteration() {
    let root = tempdir().unwrap();
    let destination = root.path().join("Existing Demo.twinproj");
    support::generate_showroom_demo(&destination).unwrap();
    let original_manifest = fs::read(destination.join("manifest.json")).unwrap();

    assert!(support::generate_showroom_demo(&destination).is_err());
    assert_eq!(
        fs::read(destination.join("manifest.json")).unwrap(),
        original_manifest
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);

    let invalid_root = tempdir().unwrap();
    let invalid = invalid_root.path().join("Wrong Extension.project");
    assert!(support::generate_showroom_demo(&invalid).is_err());
    assert_eq!(fs::read_dir(invalid_root.path()).unwrap().count(), 0);
}

#[test]
fn publishes_exact_fixture_assets_and_no_unrequested_output() {
    let root = tempdir().unwrap();
    let destination = root.path().join("asset-output.twinproj");
    support::generate_showroom_demo(&destination).unwrap();
    let expected = expected_snapshot();
    let fixture_root =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/assets/showroom-demo");
    let source_files = ["plan-reference.svg", "floor.png", "wall.jpg", "fixture.svg"];

    for (asset, source_file) in expected.assets.iter().zip(source_files) {
        assert_eq!(
            fs::read(destination.join(&asset.relative_path)).unwrap(),
            fs::read(fixture_root.join(source_file)).unwrap(),
            "asset bytes differ for {}",
            asset.id
        );
    }
    assert_eq!(
        fs::read_dir(destination.join("exports")).unwrap().count(),
        0
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn persists_the_exact_eleven_operation_transaction_and_inverses() {
    let root = tempdir().unwrap();
    let destination = root.path().join("journal-evidence.twinproj");
    support::generate_showroom_demo(&destination).unwrap();

    let expected = expected_snapshot();
    let snapshot = serde_json::to_value(&expected).unwrap();
    let collections: [(&str, &Value); 10] = [
        ("entities", &snapshot["project"]["entities"]),
        ("assets", &snapshot["assets"]),
        ("planReferences", &snapshot["project"]["planReferences"]),
        ("openings", &snapshot["project"]["openings"]),
        ("productContents", &snapshot["project"]["productContents"]),
        ("mediaAssets", &snapshot["project"]["mediaAssets"]),
        ("routeNetworks", &snapshot["project"]["routeNetworks"]),
        ("guidedRoutes", &snapshot["project"]["guidedRoutes"]),
        ("materials", &snapshot["project"]["materials"]),
        (
            "materialAssignments",
            &snapshot["project"]["materialAssignments"],
        ),
    ];
    let journal = read_project_journal_for_evidence(&destination).unwrap();
    assert_eq!(journal.len(), 11);

    for (offset, ((collection, records), operation)) in
        collections.iter().zip(journal.iter()).enumerate()
    {
        let sequence = (offset + 1) as u64;
        assert_eq!(operation.sequence, sequence);
        assert_eq!(
            operation.transaction_id,
            "e2500000-0000-4000-8000-000000001999"
        );
        assert_eq!(operation.command_type, "snapshot.records.patch");
        assert_eq!(operation.action, JournalAction::Apply);
        assert_eq!(operation.timestamp, "2026-08-09T12:34:56.789Z");
        assert_eq!(
            operation.payload["collection"],
            Value::String((*collection).into())
        );
        assert_eq!(
            operation.inverse_payload["collection"],
            Value::String((*collection).into())
        );

        let records = records.as_array().unwrap();
        let changes = operation.payload["changes"].as_array().unwrap();
        let inverse = operation.inverse_payload["changes"].as_array().unwrap();
        assert_eq!(changes.len(), records.len());
        assert_eq!(inverse.len(), records.len());
        for (index, (record, change)) in records.iter().zip(changes).enumerate() {
            assert_eq!(change["id"], record["id"]);
            assert!(change["before"].is_null());
            assert_eq!(change["after"], *record);
            assert_eq!(change["index"], index);
        }
        for (inverse_change, change) in inverse.iter().zip(changes.iter().rev()) {
            assert_eq!(inverse_change["id"], change["id"]);
            assert_eq!(inverse_change["before"], change["after"]);
            assert!(inverse_change["after"].is_null());
            assert_eq!(inverse_change["index"], change["index"]);
        }
    }

    let environment = &journal[10];
    assert_eq!(environment.sequence, 11);
    assert_eq!(
        environment.transaction_id,
        "e2500000-0000-4000-8000-000000001999"
    );
    assert_eq!(environment.command_type, "scene.environment.patch");
    assert_eq!(environment.action, JournalAction::Apply);
    assert_eq!(environment.timestamp, "2026-08-09T12:34:56.789Z");
    assert_eq!(
        environment.payload["before"],
        json!({
            "backgroundColor": "#101820",
            "ambient": { "color": "#dce8f0", "intensity": 0.55 },
            "key": {
                "color": "#fff1dc",
                "intensity": 1.1,
                "direction": [4, 8, 5]
            },
            "shadowsEnabled": true,
            "shadowSoftness": 0.5
        })
    );
    assert_eq!(
        environment.payload["after"],
        snapshot["project"]["sceneEnvironment"]
    );
    assert_eq!(
        environment.inverse_payload["before"],
        environment.payload["after"]
    );
    assert_eq!(
        environment.inverse_payload["after"],
        environment.payload["before"]
    );
}

struct NoopObserver;

impl ImportObserver for NoopObserver {
    fn progress(&self, _value: ImportProgress) {}

    fn is_cancelled(&self) -> bool {
        false
    }
}

#[test]
fn rejects_unsafe_svg_and_canonical_asset_hash_or_media_mismatches() {
    let root = tempdir().unwrap();
    let project_root = root.path().join("import-probe.twinproj");
    fs::create_dir(&project_root).unwrap();
    let unsafe_svg = root.path().join("unsafe.svg");
    fs::write(
        &unsafe_svg,
        br#"<svg width="1" height="1"><image href="https://example.test/x.png"/></svg>"#,
    )
    .unwrap();
    let error = import_project_asset(
        ImportRequest {
            project_root,
            source: unsafe_svg,
            operation_id: Uuid::parse_str("e2500000-0000-4000-8000-000000001998").unwrap(),
            role: AssetImportRole::MaterialTexture,
        },
        &NoopObserver,
    )
    .unwrap_err();
    assert_eq!(error.code(), "UNSAFE_SVG");

    let canonical = expected_snapshot().assets[0].clone();
    let mut wrong_hash = canonical.clone();
    wrong_hash.sha256 = "0".repeat(64);
    assert!(support::verify_canonical_asset(canonical.clone(), &wrong_hash).is_err());

    let mut wrong_media = canonical.clone();
    wrong_media.media_type = "image/png".into();
    assert!(support::verify_canonical_asset(canonical, &wrong_media).is_err());
}
