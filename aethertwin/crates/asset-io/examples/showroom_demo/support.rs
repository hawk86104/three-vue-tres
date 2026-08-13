use asset_io::{
    AssetImportRole, ImportObserver, ImportProgress, ImportRequest, import_project_asset,
};
use project_io::{
    AssetRecord, CommitBatch, CreateProjectRequest, JournalAction, JournalOperation,
    ProjectCreationIdentity, ProjectProfile, ProjectSnapshot, create_project_with_identity,
    open_session, recover_project,
};
use serde_json::{Value, json};
use std::{
    error::Error,
    ffi::OsStr,
    fs,
    io::{Error as IoError, ErrorKind},
    path::{Path, PathBuf},
};
use tempfile::{Builder as TempDirBuilder, tempdir};
use uuid::Uuid;

const DEMO_FILE_NAME: &str = "AetherTwin Showroom Demo.twinproj";
const FIXTURE: &str = include_str!("../../../../fixtures/contracts/showroom-demo.v3.json");
const TRANSACTION_ID: &str = "e2500000-0000-4000-8000-000000001999";
const TIMESTAMP: &str = "2026-08-09T12:34:56.789Z";

type DemoResult<T> = Result<T, Box<dyn Error>>;

struct NoopObserver;

impl ImportObserver for NoopObserver {
    fn progress(&self, _value: ImportProgress) {}

    fn is_cancelled(&self) -> bool {
        false
    }
}

pub fn generate_showroom_demo(destination: &Path) -> DemoResult<PathBuf> {
    validate_destination(destination)?;
    let expected: ProjectSnapshot = serde_json::from_str(FIXTURE)?;
    let parent = destination_parent(destination);
    let staging_root = TempDirBuilder::new()
        .prefix(".aethertwin-showroom-demo-")
        .tempdir_in(parent)?;
    let staged_project = staging_root.path().join(DEMO_FILE_NAME);
    materialize_exact(&staged_project, &expected)?;
    verify_recovery_path(&expected)?;
    publish_directory_no_replace(&staged_project, destination)?;
    Ok(destination.to_path_buf())
}

fn validate_destination(destination: &Path) -> DemoResult<()> {
    if destination.extension() != Some(OsStr::new("twinproj"))
        || destination.file_stem().is_none_or(|stem| stem.is_empty())
    {
        return Err(invalid_input(
            "destination must use the .twinproj extension",
        ));
    }
    if destination.exists() {
        return Err(invalid_input("destination already exists"));
    }
    let parent = destination_parent(destination);
    if !parent.is_dir() {
        return Err(invalid_input("destination parent must exist"));
    }
    Ok(())
}

fn destination_parent(destination: &Path) -> &Path {
    destination
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
}

#[cfg(windows)]
fn publish_directory_no_replace(source: &Path, destination: &Path) -> DemoResult<()> {
    fs::rename(source, destination).map_err(|error| {
        if destination.exists() {
            invalid_input("destination already exists")
        } else {
            Box::new(error)
        }
    })
}

#[cfg(any(
    target_os = "linux",
    target_os = "android",
    target_vendor = "apple",
    target_os = "redox"
))]
fn publish_directory_no_replace(source: &Path, destination: &Path) -> DemoResult<()> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};

    renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE).map_err(|error| {
        if error == rustix::io::Errno::EXIST {
            invalid_input("destination already exists")
        } else {
            Box::new(error)
        }
    })
}

#[cfg(not(any(
    windows,
    target_os = "linux",
    target_os = "android",
    target_vendor = "apple",
    target_os = "redox"
)))]
fn publish_directory_no_replace(_source: &Path, _destination: &Path) -> DemoResult<()> {
    Err(invalid_input(
        "atomic no-replace demo publication is unsupported on this platform",
    ))
}
fn materialize_exact(destination: &Path, expected: &ProjectSnapshot) -> DemoResult<()> {
    let parent = destination
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let opened = create_project_with_identity(
        CreateProjectRequest {
            parent: parent.to_path_buf(),
            name: "AetherTwin Showroom Demo".into(),
            profile: ProjectProfile::Showroom,
        },
        ProjectCreationIdentity {
            project_id: uuid("e2500000-0000-4000-8000-000000000001")?,
            floor_id: uuid("e2500000-0000-4000-8000-000000000002")?,
            layer_id: uuid("e2500000-0000-4000-8000-000000000003")?,
            created_at: TIMESTAMP.parse()?,
        },
    )?;
    let project_path = opened.project_path.clone();
    let requested_path = fs::canonicalize(parent)?.join(DEMO_FILE_NAME);
    if project_path != requested_path {
        let _ = fs::remove_dir_all(&project_path);
        return Err(invalid_data(
            "created project path did not match destination",
        ));
    }

    let result = (|| -> DemoResult<()> {
        let mut session = open_session(&project_path, false)?;
        let initial = session.snapshot().clone();
        ensure_initial_snapshot(&initial, expected)?;

        let imported_assets = import_fixture_assets(&project_path, &expected.assets)?;
        if imported_assets != expected.assets {
            return Err(invalid_data(
                "imported assets did not match the canonical fixture",
            ));
        }

        let mut committed = expected.clone();
        committed.checkpoint_sequence = 0;
        let journal = build_journal(&initial, &committed)?;
        if journal.len() != 11 {
            return Err(invalid_data(
                "demo journal must contain exactly 11 operations",
            ));
        }
        session
            .commit(CommitBatch {
                before: initial,
                after: committed.clone(),
                journal,
            })
            .map_err(|error| invalid_data(format!("demo commit failed: {error}")))?;
        if session.snapshot() != &committed {
            return Err(invalid_data(
                "committed demo snapshot differed from the target",
            ));
        }

        let checkpoint = session
            .checkpoint(committed)
            .map_err(|error| invalid_data(format!("demo checkpoint failed: {error}")))?;
        if checkpoint.snapshot != *expected {
            return Err(invalid_data(
                "checkpoint differed from the canonical fixture",
            ));
        }
        session.close()?;

        let mut reopened = open_session(&project_path, false)?;
        if reopened.snapshot() != expected {
            return Err(invalid_data(
                "reopened demo differed from the canonical fixture",
            ));
        }
        reopened.close()?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&project_path);
    }
    result
}

fn ensure_initial_snapshot(
    initial: &ProjectSnapshot,
    expected: &ProjectSnapshot,
) -> DemoResult<()> {
    let mut baseline = expected.clone();
    baseline.sequence = 0;
    baseline.checkpoint_sequence = 0;
    baseline.assets.clear();
    baseline.project.entities.clear();
    baseline.project.product_contents.clear();
    baseline.project.media_assets.clear();
    baseline.project.route_networks.clear();
    baseline.project.plan_references.clear();
    baseline.project.openings.clear();
    baseline.project.guided_routes.clear();
    baseline.project.materials.clear();
    baseline.project.material_assignments.clear();
    baseline.project.scene_environment = initial.project.scene_environment.clone();
    if initial != &baseline {
        return Err(invalid_data(
            "canonical fixture contains state not represented by the 11-operation journal",
        ));
    }
    Ok(())
}

fn import_fixture_assets(
    project_path: &Path,
    expected_assets: &[AssetRecord],
) -> DemoResult<Vec<AssetRecord>> {
    let fixture_root =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/assets/showroom-demo");
    let imports = [
        (
            "plan-reference.svg",
            AssetImportRole::PlanReference,
            "e2500000-0000-4000-8000-000000001501",
        ),
        (
            "floor.png",
            AssetImportRole::MaterialTexture,
            "e2500000-0000-4000-8000-000000001502",
        ),
        (
            "wall.jpg",
            AssetImportRole::MaterialTexture,
            "e2500000-0000-4000-8000-000000001503",
        ),
        (
            "fixture.svg",
            AssetImportRole::MaterialTexture,
            "e2500000-0000-4000-8000-000000001504",
        ),
    ];
    if expected_assets.len() != imports.len() {
        return Err(invalid_data("canonical fixture must contain four assets"));
    }

    imports
        .iter()
        .zip(expected_assets)
        .map(|((source, role, operation_id), expected)| {
            let result = import_project_asset(
                ImportRequest {
                    project_root: project_path.to_path_buf(),
                    source: fixture_root.join(source),
                    operation_id: uuid(operation_id)?,
                    role: *role,
                },
                &NoopObserver,
            )?;
            let mut asset = result.asset;
            asset.id = expected.id;
            verify_canonical_asset(asset, expected)
        })
        .collect()
}

pub(crate) fn verify_canonical_asset(
    asset: AssetRecord,
    expected: &AssetRecord,
) -> DemoResult<AssetRecord> {
    if asset != *expected {
        return Err(invalid_data(format!(
            "imported asset did not match canonical record {}",
            expected.id
        )));
    }
    Ok(asset)
}

fn build_journal(
    initial: &ProjectSnapshot,
    committed: &ProjectSnapshot,
) -> DemoResult<Vec<JournalOperation>> {
    let snapshot = serde_json::to_value(committed)?;
    let initial_environment = serde_json::to_value(&initial.project.scene_environment)?;
    let target_environment = snapshot["project"]["sceneEnvironment"].clone();
    let collections = [
        ("entities", snapshot["project"]["entities"].as_array()),
        ("assets", snapshot["assets"].as_array()),
        (
            "planReferences",
            snapshot["project"]["planReferences"].as_array(),
        ),
        ("openings", snapshot["project"]["openings"].as_array()),
        (
            "productContents",
            snapshot["project"]["productContents"].as_array(),
        ),
        ("mediaAssets", snapshot["project"]["mediaAssets"].as_array()),
        (
            "routeNetworks",
            snapshot["project"]["routeNetworks"].as_array(),
        ),
        (
            "guidedRoutes",
            snapshot["project"]["guidedRoutes"].as_array(),
        ),
        ("materials", snapshot["project"]["materials"].as_array()),
        (
            "materialAssignments",
            snapshot["project"]["materialAssignments"].as_array(),
        ),
    ];

    let mut journal = Vec::with_capacity(11);
    for (offset, (collection, records)) in collections.into_iter().enumerate() {
        let records = records.ok_or_else(|| invalid_data("fixture collection was not an array"))?;
        let (payload, inverse_payload) = record_patch(collection, records);
        journal.push(operation(
            (offset + 1) as u64,
            "snapshot.records.patch",
            payload,
            inverse_payload,
        ));
    }
    journal.push(operation(
        11,
        "scene.environment.patch",
        json!({ "before": initial_environment, "after": target_environment }),
        json!({ "before": target_environment, "after": initial_environment }),
    ));
    Ok(journal)
}

fn record_patch(collection: &str, records: &[Value]) -> (Value, Value) {
    let changes: Vec<Value> = records
        .iter()
        .enumerate()
        .map(|(index, record)| {
            json!({
                "id": record["id"],
                "before": null,
                "after": record,
                "index": index,
            })
        })
        .collect();
    let inverse_changes: Vec<Value> = changes
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
        .collect();
    (
        json!({ "collection": collection, "changes": changes }),
        json!({ "collection": collection, "changes": inverse_changes }),
    )
}

fn operation(
    sequence: u64,
    command_type: &str,
    payload: Value,
    inverse_payload: Value,
) -> JournalOperation {
    JournalOperation {
        sequence,
        transaction_id: TRANSACTION_ID.into(),
        command_type: command_type.into(),
        payload,
        inverse_payload,
        action: JournalAction::Apply,
        timestamp: TIMESTAMP.into(),
    }
}

fn verify_recovery_path(expected: &ProjectSnapshot) -> DemoResult<()> {
    let probe_root = tempdir()?;
    let probe = probe_root.path().join(DEMO_FILE_NAME);
    materialize_exact(&probe, expected)?;
    let dirty = open_session(&probe, false)?;
    if dirty.snapshot() != expected {
        return Err(invalid_data(
            "recovery probe did not open the canonical fixture",
        ));
    }
    drop(dirty);

    let recovered = recover_project(&probe, true)?;
    if !recovered.recovered || recovered.snapshot != *expected {
        return Err(invalid_data(
            "recovery probe did not recover the canonical fixture",
        ));
    }
    Ok(())
}

fn uuid(value: &str) -> DemoResult<Uuid> {
    Ok(Uuid::parse_str(value)?)
}

fn invalid_input(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(IoError::new(ErrorKind::InvalidInput, message.into()))
}

fn invalid_data(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(IoError::new(ErrorKind::InvalidData, message.into()))
}
