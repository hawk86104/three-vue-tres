use project_io::{
    CommitBatch, CreateProjectRequest, JournalAction, JournalOperation, ProjectProfile,
    ProjectSnapshot, SaveState, create_project, open_session, recover_project,
};
use serde_json::{Value, json};
use tempfile::tempdir;

const FIXTURE: &str = include_str!("../../../fixtures/contracts/showroom-m2-4.v3.json");

fn replace_string(value: &mut Value, from: &str, to: &str) {
    match value {
        Value::String(text) if text == from => *text = to.into(),
        Value::Array(values) => values
            .iter_mut()
            .for_each(|value| replace_string(value, from, to)),
        Value::Object(values) => values
            .values_mut()
            .for_each(|value| replace_string(value, from, to)),
        _ => {}
    }
}

fn adapted_fixture(initial: &ProjectSnapshot) -> Value {
    let mut fixture: Value = serde_json::from_str(FIXTURE).unwrap();
    let initial_value = serde_json::to_value(initial).unwrap();
    for (from, to) in [
        (
            "17000000-0000-4000-8000-000000000001",
            initial_value["project"]["id"].as_str().unwrap(),
        ),
        (
            "17000000-0000-4000-8000-000000000002",
            initial_value["project"]["floors"][0]["id"]
                .as_str()
                .unwrap(),
        ),
        (
            "17000000-0000-4000-8000-000000000003",
            initial_value["project"]["floors"][0]["layers"][0]["id"]
                .as_str()
                .unwrap(),
        ),
    ] {
        replace_string(&mut fixture, from, to);
    }
    fixture["project"]["id"] = initial_value["project"]["id"].clone();
    fixture["project"]["floors"] = initial_value["project"]["floors"].clone();
    fixture["project"]["name"] = initial_value["project"]["name"].clone();
    fixture["project"]["tags"] = initial_value["project"]["tags"].clone();
    fixture
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

fn operation(
    transaction_id: &str,
    sequence: u64,
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
        timestamp: "2026-08-05T00:00:00.000Z".into(),
    }
}

fn record_patch(collection: &str, records: &[Value], start_index: usize) -> (Value, Value) {
    let changes: Vec<Value> = records
        .iter()
        .enumerate()
        .map(|(offset, record)| {
            json!({
                "id": record["id"], "before": null, "after": record, "index": start_index + offset
            })
        })
        .collect();
    let inverse = inverse_changes(&changes);
    (
        json!({ "collection": collection, "changes": changes }),
        json!({ "collection": collection, "changes": inverse }),
    )
}

#[test]
fn complete_m2_4_showroom_checkpoints_reopens_and_recovers_dirty_material_and_environment() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Task 17 M2.4 Showroom".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let fixture = adapted_fixture(&initial);
    let entities = fixture["project"]["entities"].as_array().unwrap();
    let wall = entities
        .iter()
        .find(|entity| entity["type"] == "wall")
        .unwrap();
    let openings = fixture["project"]["openings"].as_array().unwrap();

    let wall_changes = vec![json!({ "id": wall["id"], "before": null, "after": wall, "index": 0 })];
    let opening_changes: Vec<Value> = openings
        .iter()
        .enumerate()
        .map(|(index, opening)| {
            json!({
                "id": opening["id"], "before": null, "after": opening, "index": index
            })
        })
        .collect();
    let building_payload = json!({
        "reason": "create", "wallChanges": wall_changes, "openingChanges": opening_changes
    });
    let building_inverse = json!({
        "reason": "create",
        "wallChanges": inverse_changes(building_payload["wallChanges"].as_array().unwrap()),
        "openingChanges": inverse_changes(building_payload["openingChanges"].as_array().unwrap())
    });
    let plan_changes: Vec<Value> = entities
        .iter()
        .enumerate()
        .filter(|(_, entity)| entity["type"] != "wall")
        .map(|(index, entity)| {
            json!({
                "id": entity["id"], "before": null, "after": entity, "index": index
            })
        })
        .collect();

    let mut target = fixture.clone();
    target["sequence"] = json!(9);
    target["checkpointSequence"] = json!(0);
    let complete: ProjectSnapshot = serde_json::from_value(target).unwrap();
    let mut journal = vec![
        operation(
            "17000000-0000-4000-8000-000000000099",
            1,
            "building.structure.patch",
            building_payload,
            building_inverse,
        ),
        operation(
            "17000000-0000-4000-8000-000000000099",
            2,
            "plan.entities.patch",
            json!({ "reason": "create", "changes": plan_changes }),
            json!({ "reason": "create", "changes": inverse_changes(&plan_changes) }),
        ),
    ];
    for (offset, collection) in [
        "productContents",
        "routeNetworks",
        "guidedRoutes",
        "assets",
        "materials",
        "materialAssignments",
    ]
    .iter()
    .enumerate()
    {
        let records = if *collection == "assets" {
            fixture["assets"].as_array().unwrap()
        } else {
            fixture["project"][*collection].as_array().unwrap()
        };
        let (payload, inverse) = record_patch(collection, records, 0);
        journal.push(operation(
            "17000000-0000-4000-8000-000000000099",
            (offset + 3) as u64,
            "snapshot.records.patch",
            payload,
            inverse,
        ));
    }
    let before_environment = serde_json::to_value(&initial.project.scene_environment).unwrap();
    let after_environment = fixture["project"]["sceneEnvironment"].clone();
    journal.push(operation(
        "17000000-0000-4000-8000-000000000099",
        9,
        "scene.environment.patch",
        json!({ "before": before_environment, "after": after_environment }),
        json!({ "before": after_environment, "after": before_environment }),
    ));
    session
        .commit(CommitBatch {
            before: initial,
            after: complete.clone(),
            journal,
        })
        .unwrap();

    let checkpoint = session.checkpoint(complete).unwrap().snapshot;
    assert_eq!(checkpoint.sequence, 9);
    assert_eq!(checkpoint.checkpoint_sequence, 9);
    assert_eq!(checkpoint.project.materials.len(), 3);
    assert_eq!(checkpoint.project.material_assignments.len(), 3);
    session.close().unwrap();

    let mut reopened = open_session(&opened.project_path, false).unwrap();
    assert_eq!(reopened.snapshot(), &checkpoint);
    let mut dirty_value = serde_json::to_value(&checkpoint).unwrap();
    let material_before = dirty_value["project"]["materials"][0].clone();
    dirty_value["project"]["materials"][0]["baseColor"] = json!("#335577");
    let material_after = dirty_value["project"]["materials"][0].clone();
    let environment_before = dirty_value["project"]["sceneEnvironment"].clone();
    dirty_value["project"]["sceneEnvironment"]["backgroundColor"] = json!("#0f1720");
    let environment_after = dirty_value["project"]["sceneEnvironment"].clone();
    dirty_value["sequence"] = json!(11);
    let dirty: ProjectSnapshot = serde_json::from_value(dirty_value).unwrap();
    let material_changes = vec![json!({
        "id": material_before["id"], "before": material_before, "after": material_after, "index": 0
    })];
    let (material_payload, material_inverse) = (
        json!({ "collection": "materials", "changes": material_changes }),
        json!({ "collection": "materials", "changes": inverse_changes(&material_changes) }),
    );
    reopened
        .commit(CommitBatch {
            before: checkpoint.clone(),
            after: dirty.clone(),
            journal: vec![
                operation(
                    "17000000-0000-4000-8000-000000000100",
                    10,
                    "snapshot.records.patch",
                    material_payload,
                    material_inverse,
                ),
                operation(
                    "17000000-0000-4000-8000-000000000100",
                    11,
                    "scene.environment.patch",
                    json!({ "before": environment_before, "after": environment_after }),
                    json!({ "before": environment_after, "after": environment_before }),
                ),
            ],
        })
        .unwrap();
    assert_eq!(reopened.save_state(), SaveState::Dirty);
    drop(reopened);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot, dirty);
    assert_eq!(recovered.snapshot.checkpoint_sequence, 9);
}
