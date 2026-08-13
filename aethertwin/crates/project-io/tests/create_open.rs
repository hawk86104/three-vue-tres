use chrono::{DateTime, Utc};
use project_io::{
    CreateProjectRequest, ProjectCreationIdentity, ProjectIoError, ProjectProfile, create_project,
    create_project_with_identity, open_project, snapshot_checksum,
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::fs;
use tempfile::tempdir;
use uuid::Uuid;

fn request(parent: &std::path::Path, name: &str, profile: ProjectProfile) -> CreateProjectRequest {
    CreateProjectRequest {
        parent: parent.to_path_buf(),
        name: name.into(),
        profile,
    }
}

fn fixed_creation_identity() -> ProjectCreationIdentity {
    ProjectCreationIdentity {
        project_id: Uuid::parse_str("e2500000-0000-4000-8000-000000000001").unwrap(),
        floor_id: Uuid::parse_str("e2500000-0000-4000-8000-000000000002").unwrap(),
        layer_id: Uuid::parse_str("e2500000-0000-4000-8000-000000000003").unwrap(),
        created_at: "2026-08-09T12:34:56.789Z".parse::<DateTime<Utc>>().unwrap(),
    }
}

#[test]
fn deterministic_identity_uses_supplied_values_and_reopens_exactly() {
    let root = tempdir().unwrap();
    let identity = fixed_creation_identity();
    let opened = create_project_with_identity(
        request(
            root.path(),
            "Deterministic Identity",
            ProjectProfile::Showroom,
        ),
        identity.clone(),
    )
    .unwrap();

    assert_eq!(opened.manifest.project_id, identity.project_id);
    assert_eq!(opened.manifest.created_at, "2026-08-09T12:34:56.789Z");
    assert_eq!(opened.manifest.updated_at, opened.manifest.created_at);
    assert_eq!(opened.snapshot.project.id, identity.project_id);
    assert_eq!(opened.snapshot.project.floors[0].id, identity.floor_id);
    assert_eq!(
        opened.snapshot.project.floors[0].layers[0].id,
        identity.layer_id
    );

    let reopened = open_project(&opened.project_path).unwrap();
    assert_eq!(reopened.manifest, opened.manifest);
    assert_eq!(reopened.snapshot, opened.snapshot);
}

#[test]
fn deterministic_identity_rejects_invalid_or_duplicate_uuids_without_writing() {
    let valid = fixed_creation_identity();
    let invalid = [
        ProjectCreationIdentity {
            project_id: Uuid::nil(),
            ..valid.clone()
        },
        ProjectCreationIdentity {
            floor_id: valid.project_id,
            ..valid.clone()
        },
        ProjectCreationIdentity {
            layer_id: valid.floor_id,
            ..valid
        },
    ];

    for (index, identity) in invalid.into_iter().enumerate() {
        let root = tempdir().unwrap();
        assert_code(
            create_project_with_identity(
                request(
                    root.path(),
                    &format!("Invalid Identity {index}"),
                    ProjectProfile::Showroom,
                ),
                identity,
            )
            .unwrap_err(),
            "INVALID_PROJECT_STRUCTURE",
        );
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }
}

fn assert_code(error: ProjectIoError, expected: &str) {
    assert_eq!(error.code(), expected, "unexpected error: {error}");
}

#[test]
fn creates_and_reopens_both_profiles() {
    for profile in [ProjectProfile::Showroom, ProjectProfile::Market] {
        let root = tempdir().unwrap();
        let opened = create_project(request(root.path(), "Demo", profile)).unwrap();

        assert!(opened.project_path.ends_with("Demo.twinproj"));
        for entry in [
            "manifest.json",
            "project.db",
            "assets",
            "thumbnails",
            "derived",
            "exports",
        ] {
            assert!(opened.project_path.join(entry).exists(), "missing {entry}");
        }
        assert!(!opened.project_path.join("manifest.json.tmp").exists());
        assert!(!opened.recovered);

        let reopened = open_project(&opened.project_path).unwrap();
        assert_eq!(opened.manifest, reopened.manifest);
        assert_eq!(opened.snapshot, reopened.snapshot);
        assert_eq!(opened.manifest.project_id, opened.snapshot.project.id);
        assert_eq!(opened.manifest.profile, opened.snapshot.project.profile);
        assert_eq!(opened.snapshot.schema_version, 3);
        assert_eq!(opened.manifest.schema_version, 3);
        assert_eq!(opened.snapshot.project.floors[0].layers.len(), 1);
        assert!(opened.snapshot.project.entities.is_empty());
        let project = serde_json::to_value(&opened.snapshot.project).unwrap();
        for collection in [
            "planReferences",
            "openings",
            "guidedRoutes",
            "materials",
            "materialAssignments",
        ] {
            assert_eq!(project[collection], json!([]), "unexpected {collection}");
        }
        assert_eq!(project["sceneEnvironment"]["backgroundColor"], "#101820");
        assert!(!reopened.recovered);
    }
}

#[test]
fn never_overwrites_an_existing_project_or_leaves_staging() {
    let root = tempdir().unwrap();
    let request = request(root.path(), "Demo", ProjectProfile::Market);
    let first = create_project(request.clone()).unwrap();
    let original_manifest = fs::read(first.project_path.join("manifest.json")).unwrap();

    assert_code(
        create_project(request).unwrap_err(),
        "PROJECT_ALREADY_EXISTS",
    );
    assert_eq!(
        fs::read(first.project_path.join("manifest.json")).unwrap(),
        original_manifest
    );
    let leftovers: Vec<_> = fs::read_dir(root.path())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(".staging-"))
        .collect();
    assert!(
        leftovers.is_empty(),
        "staging directories remained: {leftovers:?}"
    );
}

#[test]
fn rejects_blank_and_path_like_project_names_without_writing() {
    for name in [
        "",
        "   ",
        ".",
        "..",
        "Demo/Child",
        "Demo\\Child",
        "C:Demo",
        "Demo.",
        "Demo ",
        "CON",
        "CONIN$",
        "CONOUT$",
        "COM¹",
        "COM².txt",
        "COM³",
        "LPT¹",
        "LPT².log",
        "LPT³",
        "Demo.twinproj.twinproj",
    ] {
        let root = tempdir().unwrap();
        assert_code(
            create_project(request(root.path(), name, ProjectProfile::Showroom)).unwrap_err(),
            "INVALID_PROJECT_NAME",
        );
        assert_eq!(
            fs::read_dir(root.path()).unwrap().count(),
            0,
            "wrote for {name:?}"
        );
    }
}

#[test]
fn applies_one_canonical_project_suffix_and_requires_it_on_open() {
    for requested in ["Named", "Named.twinproj", "Named.TWINPROJ"] {
        let root = tempdir().unwrap();
        let opened =
            create_project(request(root.path(), requested, ProjectProfile::Showroom)).unwrap();
        assert_eq!(
            opened.project_path.file_name().unwrap(),
            std::ffi::OsStr::new("Named.twinproj")
        );
    }

    let root = tempdir().unwrap();
    let opened = create_project(request(
        root.path(),
        "Wrong Extension",
        ProjectProfile::Market,
    ))
    .unwrap();
    let wrong_path = root.path().join("Wrong Extension.project");
    fs::rename(&opened.project_path, &wrong_path).unwrap();
    assert_code(
        open_project(&wrong_path).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );

    for invalid_name in [".twinproj", "Wrong Extension.twinproj.twinproj"] {
        let invalid_path = root.path().join(invalid_name);
        fs::rename(&wrong_path, &invalid_path).unwrap();
        assert_code(
            open_project(&invalid_path).unwrap_err(),
            "INVALID_PROJECT_STRUCTURE",
        );
        fs::rename(&invalid_path, &wrong_path).unwrap();
    }
}

#[test]
fn creates_schema_migration_and_sqlite_runtime_settings() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Schema", ProjectProfile::Showroom)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();

    let journal_mode: String = connection
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();
    assert_eq!(journal_mode.to_ascii_lowercase(), "wal");

    let tables: Vec<String> = connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    for table in [
        "asset_records",
        "command_journal",
        "entity_records",
        "project_meta",
        "schema_migrations",
        "snapshots",
    ] {
        assert!(
            tables.iter().any(|candidate| candidate == table),
            "missing {table}"
        );
    }

    let (version, checksum): (u32, String) = connection
        .query_row(
            "SELECT version, checksum FROM schema_migrations",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(version, 1);
    assert_eq!(checksum.len(), 64);
    assert!(
        checksum
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    );
}

#[test]
fn rejects_migration_checksum_drift() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Drift", ProjectProfile::Market)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE schema_migrations SET checksum = 'bad' WHERE version = 1",
            [],
        )
        .unwrap();
    drop(connection);

    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "DATABASE_ERROR",
    );
}

#[test]
fn reports_project_not_found_for_a_missing_project_root() {
    let root = tempdir().unwrap();
    let missing = root.path().join("Missing.twinproj");
    assert!(!missing.exists());
    assert_code(open_project(&missing).unwrap_err(), "PROJECT_NOT_FOUND");
}

#[test]
fn rejects_existing_project_roots_with_missing_or_malformed_structure() {
    let root = tempdir().unwrap();
    let missing_manifest = root.path().join("Missing Manifest.twinproj");
    fs::create_dir(&missing_manifest).unwrap();
    assert_code(
        open_project(&missing_manifest).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );

    let opened = create_project(request(root.path(), "Broken", ProjectProfile::Showroom)).unwrap();
    fs::remove_dir_all(opened.project_path.join("assets")).unwrap();
    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
}

#[test]
fn rejects_invalid_manifest_fields_and_unsupported_schema() {
    let root = tempdir().unwrap();
    let opened =
        create_project(request(root.path(), "Manifest", ProjectProfile::Showroom)).unwrap();
    let manifest_path = opened.project_path.join("manifest.json");
    let original: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();

    for (field, invalid) in [
        ("projectId", json!("not-a-uuid")),
        ("createdAt", json!("not-a-timestamp")),
        ("updatedAt", json!("2026-13-40T25:61:61Z")),
        ("profile", json!("iot")),
        ("appVersion", json!(" ")),
        ("minCompatibleAppVersion", json!("")),
    ] {
        let mut changed = original.clone();
        changed[field] = invalid;
        fs::write(&manifest_path, serde_json::to_vec_pretty(&changed).unwrap()).unwrap();
        assert_code(
            open_project(&opened.project_path).unwrap_err(),
            "INVALID_PROJECT_STRUCTURE",
        );
    }

    let mut newer = original;
    newer["schemaVersion"] = json!(4);
    fs::write(&manifest_path, serde_json::to_vec_pretty(&newer).unwrap()).unwrap();
    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "UNSUPPORTED_SCHEMA_VERSION",
    );
}

#[test]
fn opens_a_coherent_schema_v1_project_for_pre_editor_upgrade() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Legacy", ProjectProfile::Market)).unwrap();
    let manifest_path = opened.project_path.join("manifest.json");
    let database_path = opened.project_path.join("project.db");

    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["schemaVersion"] = json!(1);
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();

    let mut snapshot = serde_json::to_value(&opened.snapshot).unwrap();
    snapshot["schemaVersion"] = json!(1);
    for floor in snapshot["project"]["floors"].as_array_mut().unwrap() {
        floor.as_object_mut().unwrap().remove("layers");
    }
    for collection in [
        "entities",
        "vendors",
        "productContents",
        "mediaAssets",
        "routeNetworks",
        "themes",
        "cameraShots",
        "storySequences",
    ] {
        snapshot["project"]
            .as_object_mut()
            .unwrap()
            .remove(collection);
    }
    let snapshot_json = serde_json::to_string(&snapshot).unwrap();
    let connection = Connection::open(database_path).unwrap();
    connection
        .execute(
            "UPDATE project_meta SET value_json = '1' WHERE key = 'schemaVersion'",
            [],
        )
        .unwrap();
    connection
        .execute(
            "UPDATE snapshots SET snapshot_json = ?1, checksum = ?2",
            params![snapshot_json, snapshot_checksum(&snapshot_json)],
        )
        .unwrap();
    drop(connection);

    let legacy = open_project(&opened.project_path).unwrap();
    assert_eq!(legacy.manifest.schema_version, 1);
    assert_eq!(legacy.snapshot.schema_version, 1);
    assert!(legacy.snapshot.project.floors[0].layers.is_empty());
}

#[test]
fn rejects_immutable_manifest_database_mismatch() {
    for (key, value) in [
        ("projectId", json!("00000000-0000-4000-8000-000000000099")),
        ("profile", json!("market")),
        ("schemaVersion", json!(99)),
    ] {
        let root = tempdir().unwrap();
        let opened =
            create_project(request(root.path(), "Mismatch", ProjectProfile::Showroom)).unwrap();
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        connection
            .execute(
                "UPDATE project_meta SET value_json = ?1 WHERE key = ?2",
                params![serde_json::to_string(&value).unwrap(), key],
            )
            .unwrap();
        drop(connection);

        assert_code(
            open_project(&opened.project_path).unwrap_err(),
            "MANIFEST_DATABASE_MISMATCH",
        );
    }
}

#[test]
fn rejects_all_immutable_manifest_database_mismatches_and_missing_metadata() {
    for (key, value) in [
        ("createdAt", json!("2026-07-17T03:00:00.000Z")),
        ("appVersion", json!("0.2.0")),
        ("minCompatibleAppVersion", json!("0.0.9")),
    ] {
        let root = tempdir().unwrap();
        let opened =
            create_project(request(root.path(), "Immutable", ProjectProfile::Showroom)).unwrap();
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        connection
            .execute(
                "UPDATE project_meta SET value_json = ?1 WHERE key = ?2",
                params![serde_json::to_string(&value).unwrap(), key],
            )
            .unwrap();
        drop(connection);
        assert_code(
            open_project(&opened.project_path).unwrap_err(),
            "MANIFEST_DATABASE_MISMATCH",
        );
    }

    let root = tempdir().unwrap();
    let opened = create_project(request(
        root.path(),
        "Missing Immutable",
        ProjectProfile::Market,
    ))
    .unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute("DELETE FROM project_meta WHERE key = 'createdAt'", [])
        .unwrap();
    drop(connection);
    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "MANIFEST_DATABASE_MISMATCH",
    );
}

#[test]
fn loads_the_latest_checksum_valid_snapshot() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Latest", ProjectProfile::Market)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let mut latest = opened.snapshot.clone();
    latest.sequence = 3;
    latest.checkpoint_sequence = 3;
    latest.project.name = "Latest Name".into();
    let snapshot_json = serde_json::to_string(&latest).unwrap();
    let checksum = project_io::snapshot_checksum(&snapshot_json);
    connection
        .execute(
            "INSERT INTO snapshots(sequence, snapshot_json, checksum, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![3_i64, snapshot_json, checksum, "2026-07-17T01:00:00.000Z"],
        )
        .unwrap();
    drop(connection);

    let reopened = open_project(&opened.project_path).unwrap();
    assert_eq!(reopened.snapshot, latest);
}

#[test]
fn rejects_a_snapshot_with_a_bad_checksum() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Checksum", ProjectProfile::Market)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE snapshots SET checksum = 'bad' WHERE sequence = 0",
            [],
        )
        .unwrap();
    drop(connection);

    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
}

#[test]
fn repairs_mutable_manifest_cache_fields_from_sqlite() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Cache", ProjectProfile::Showroom)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE project_meta SET value_json = ?1 WHERE key = 'name'",
            [serde_json::to_string("Database Name").unwrap()],
        )
        .unwrap();
    connection
        .execute(
            "UPDATE project_meta SET value_json = ?1 WHERE key = 'updatedAt'",
            [serde_json::to_string("2026-07-17T02:00:00.000Z").unwrap()],
        )
        .unwrap();
    drop(connection);

    let reopened = open_project(&opened.project_path).unwrap();
    assert_eq!(reopened.manifest.name, "Database Name");
    assert_eq!(reopened.manifest.updated_at, "2026-07-17T02:00:00.000Z");
    let disk_manifest: project_io::ProjectManifest =
        serde_json::from_slice(&fs::read(opened.project_path.join("manifest.json")).unwrap())
            .unwrap();
    assert_eq!(disk_manifest, reopened.manifest);
    assert!(!opened.project_path.join("manifest.json.tmp").exists());
}

#[test]
fn fixed_manifest_temp_residue_does_not_block_atomic_repair() {
    let root = tempdir().unwrap();
    let opened = create_project(request(root.path(), "Residue", ProjectProfile::Showroom)).unwrap();
    let residue = opened.project_path.join("manifest.json.tmp");
    fs::write(&residue, b"crash residue").unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE project_meta SET value_json = ?1 WHERE key = 'name'",
            [serde_json::to_string("Repaired Despite Residue").unwrap()],
        )
        .unwrap();
    drop(connection);

    let reopened = open_project(&opened.project_path).unwrap();
    assert_eq!(reopened.manifest.name, "Repaired Despite Residue");
    assert_eq!(fs::read(&residue).unwrap(), b"crash residue");
    let unique_temps: Vec<_> = fs::read_dir(&opened.project_path)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("manifest.json.tmp-")
        })
        .collect();
    assert!(
        unique_temps.is_empty(),
        "unique manifest temps remained: {unique_temps:?}"
    );
}

#[test]
fn rejects_live_schema_tampering_despite_a_valid_migration_checksum() {
    for tamper in [
        "DROP TABLE asset_records;
         CREATE TABLE asset_records (
           id TEXT PRIMARY KEY,
           sha256 TEXT NOT NULL,
           relative_path TEXT NOT NULL,
           media_type TEXT NOT NULL,
           size INTEGER NOT NULL,
           metadata_json TEXT NOT NULL
         );",
        "DROP TABLE command_journal;
         CREATE TABLE command_journal (
           sequence INTEGER PRIMARY KEY,
           transaction_id TEXT NOT NULL,
           command_type TEXT NOT NULL,
           payload_json TEXT NOT NULL,
           inverse_payload_json TEXT NOT NULL,
           action TEXT NOT NULL,
           created_at TEXT NOT NULL
         );",
    ] {
        let root = tempdir().unwrap();
        let opened = create_project(request(
            root.path(),
            "Forged Schema",
            ProjectProfile::Market,
        ))
        .unwrap();
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        connection.execute_batch(tamper).unwrap();
        let checksum: String = connection
            .query_row(
                "SELECT checksum FROM schema_migrations WHERE version = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            checksum.len(),
            64,
            "tamper changed the self-reported migration checksum"
        );
        drop(connection);

        assert_code(
            open_project(&opened.project_path).unwrap_err(),
            "DATABASE_ERROR",
        );
    }
}

#[test]
fn rejects_extra_sqlite_schema_objects_despite_exact_required_tables() {
    for statement in [
        "CREATE TABLE injected_table(value TEXT)",
        "CREATE TABLE sqliteX(value TEXT)",
        "CREATE VIEW injected_view AS SELECT key FROM project_meta",
        "CREATE INDEX injected_index ON project_meta(value_json)",
        "CREATE TRIGGER injected_trigger AFTER UPDATE ON project_meta BEGIN DELETE FROM snapshots; END",
    ] {
        let root = tempdir().unwrap();
        let opened = create_project(request(
            root.path(),
            "Extra Schema Object",
            ProjectProfile::Market,
        ))
        .unwrap();
        let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
        connection.execute_batch(statement).unwrap();
        drop(connection);

        assert_code(
            open_project(&opened.project_path).unwrap_err(),
            "DATABASE_ERROR",
        );
    }
}

#[test]
fn enforces_cross_platform_relative_resource_paths() {
    assert!(project_io::validate_relative_resource_path("assets/images/item.png").is_ok());
    for invalid in [
        "",
        "/assets/item.png",
        "C:\\assets\\item.png",
        "C:/assets/item.png",
        "\\\\server\\share\\item.png",
        "assets\\item.png",
        "assets/../item.png",
    ] {
        assert_code(
            project_io::validate_relative_resource_path(invalid).unwrap_err(),
            "INVALID_RESOURCE_PATH",
        );
    }
}

#[test]
fn rejects_snapshot_numbers_outside_typescript_safe_integer_range() {
    let root = tempdir().unwrap();
    let opened =
        create_project(request(root.path(), "Safe Integer", ProjectProfile::Market)).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let mut snapshot = serde_json::to_value(&opened.snapshot).unwrap();
    snapshot["assets"] = json!([{
        "id": "00000000-0000-4000-8000-000000000123",
        "sha256": "a".repeat(64),
        "relativePath": "assets/item.png",
        "mediaType": "image/png",
        "size": 9_007_199_254_740_992_u64
    }]);
    let snapshot_json = serde_json::to_string(&snapshot).unwrap();
    connection
        .execute(
            "UPDATE snapshots SET snapshot_json = ?1, checksum = ?2 WHERE sequence = 0",
            params![snapshot_json, project_io::snapshot_checksum(&snapshot_json)],
        )
        .unwrap();
    drop(connection);

    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
}

#[test]
fn does_not_repair_manifest_until_the_database_is_fully_valid() {
    let root = tempdir().unwrap();
    let opened =
        create_project(request(root.path(), "Safe Open", ProjectProfile::Showroom)).unwrap();
    let manifest_path = opened.project_path.join("manifest.json");
    let original_manifest = fs::read(&manifest_path).unwrap();
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    connection
        .execute(
            "UPDATE project_meta SET value_json = ?1 WHERE key = 'name'",
            [serde_json::to_string("Must Not Be Repaired").unwrap()],
        )
        .unwrap();
    connection
        .execute(
            "UPDATE snapshots SET checksum = 'bad' WHERE sequence = 0",
            [],
        )
        .unwrap();
    drop(connection);

    assert_code(
        open_project(&opened.project_path).unwrap_err(),
        "INVALID_PROJECT_STRUCTURE",
    );
    assert_eq!(fs::read(manifest_path).unwrap(), original_manifest);
}
