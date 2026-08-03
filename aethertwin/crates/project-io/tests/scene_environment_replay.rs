use project_io::{
    CommitBatch, CreateProjectRequest, JournalAction, JournalOperation, ProjectProfile,
    ProjectSnapshot, create_project, open_session, recover_project,
};
use serde_json::{Value, json};
use tempfile::tempdir;
use uuid::Uuid;

fn set_approved_environment(snapshot: &mut ProjectSnapshot) {
    let environment = &mut snapshot.project.scene_environment;
    environment.background_color = "#203040".into();
    environment.ambient.color = "#aabbcc".into();
    environment.ambient.intensity = 4.0;
    environment.key.color = "#ddeeff".into();
    environment.key.intensity = 8.0;
    environment.key.direction = [-100.0, 0.0, 100.0];
    environment.shadows_enabled = false;
    environment.shadow_softness = 1.0;
}

fn environment_value(snapshot: &ProjectSnapshot) -> Value {
    serde_json::to_value(&snapshot.project.scene_environment).unwrap()
}

fn payload_pair(before: &ProjectSnapshot, after: &ProjectSnapshot) -> (Value, Value) {
    let before = environment_value(before);
    let after = environment_value(after);
    (
        json!({ "before": before, "after": after }),
        json!({ "before": after, "after": before }),
    )
}

fn inverse_for(payload: &Value) -> Value {
    json!({
        "before": payload["after"],
        "after": payload["before"]
    })
}

fn operation(
    sequence: u64,
    payload: Value,
    inverse_payload: Value,
    action: JournalAction,
) -> JournalOperation {
    JournalOperation {
        sequence,
        transaction_id: Uuid::new_v4().to_string(),
        command_type: "scene.environment.patch".into(),
        payload,
        inverse_payload,
        action,
        timestamp: "2026-08-03T00:00:00.000Z".into(),
    }
}

fn batch(
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
    payload: Value,
    inverse_payload: Value,
    action: JournalAction,
) -> CommitBatch {
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![operation(after.sequence, payload, inverse_payload, action)],
    }
}

#[test]
fn scene_environment_patch_replays_apply_undo_redo_and_dirty_recovery() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Scene Environment Replay".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let mut changed = initial.clone();
    set_approved_environment(&mut changed);
    changed.sequence = 1;
    let (payload, inverse) = payload_pair(&initial, &changed);

    session
        .commit(batch(
            &initial,
            &changed,
            payload.clone(),
            inverse.clone(),
            JournalAction::Apply,
        ))
        .unwrap();
    let checkpoint = session.checkpoint(session.snapshot().clone()).unwrap();
    assert_eq!(checkpoint.snapshot.checkpoint_sequence, 1);
    let applied = session.snapshot().clone();

    let mut undone = applied.clone();
    undone.project.scene_environment = initial.project.scene_environment.clone();
    undone.sequence = 2;
    session
        .commit(batch(
            &applied,
            &undone,
            payload.clone(),
            inverse.clone(),
            JournalAction::Undo,
        ))
        .unwrap();

    let mut redone = undone.clone();
    redone.project.scene_environment = changed.project.scene_environment.clone();
    redone.sequence = 3;
    session
        .commit(batch(
            &undone,
            &redone,
            payload,
            inverse,
            JournalAction::Redo,
        ))
        .unwrap();
    assert_eq!(
        environment_value(session.snapshot()),
        environment_value(&changed)
    );
    drop(session);

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.snapshot.sequence, 3);
    assert_eq!(recovered.snapshot.checkpoint_sequence, 1);
    assert_eq!(
        environment_value(&recovered.snapshot),
        environment_value(&changed)
    );
}

#[test]
fn scene_environment_patch_rejects_malformed_stale_and_non_inverse_payloads_atomically() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Scene Environment Rejection".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let mut changed = initial.clone();
    set_approved_environment(&mut changed);
    changed.sequence = 1;
    let (payload, inverse) = payload_pair(&initial, &changed);

    let mut unknown_root = payload.clone();
    unknown_root["extra"] = json!(true);
    let mut missing_after = payload.clone();
    missing_after.as_object_mut().unwrap().remove("after");
    let mut unknown_nested = payload.clone();
    unknown_nested["after"]["ambient"]["extra"] = json!(true);
    let mut out_of_range = payload.clone();
    out_of_range["after"]["ambient"]["intensity"] = json!(4.01);
    let mut zero_direction = payload.clone();
    zero_direction["after"]["key"]["direction"] = json!([0, 0, 0]);
    let mut stale_before = payload.clone();
    stale_before["before"]["backgroundColor"] = json!("#ffffff");
    let mut wrong_inverse = inverse.clone();
    wrong_inverse["after"] = wrong_inverse["before"].clone();

    let invalid_pairs = vec![
        (unknown_root.clone(), inverse_for(&unknown_root)),
        (missing_after, inverse.clone()),
        (unknown_nested.clone(), inverse_for(&unknown_nested)),
        (out_of_range.clone(), inverse_for(&out_of_range)),
        (zero_direction.clone(), inverse_for(&zero_direction)),
        (stale_before.clone(), inverse_for(&stale_before)),
        (payload.clone(), wrong_inverse),
    ];

    for (candidate, candidate_inverse) in invalid_pairs {
        let error = session
            .commit(batch(
                &initial,
                &changed,
                candidate,
                candidate_inverse,
                JournalAction::Apply,
            ))
            .unwrap_err();
        assert_eq!(error.code(), "DATABASE_ERROR");
        assert_eq!(session.snapshot(), &initial);
    }

    session
        .commit(batch(
            &initial,
            &changed,
            payload,
            inverse,
            JournalAction::Apply,
        ))
        .unwrap();
    assert_eq!(session.snapshot(), &changed);
}

#[test]
fn scene_environment_exact_before_distinguishes_positive_and_negative_zero() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Scene Environment Signed Zero".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut before = opened.snapshot;
    before.project.scene_environment.ambient.intensity = 0.0;
    let mut after = before.clone();
    after.project.scene_environment.background_color = "#203040".into();
    after.sequence = 1;
    let (mut payload, _) = payload_pair(&before, &after);
    payload["before"]["ambient"]["intensity"] = json!(-0.0);
    let inverse = inverse_for(&payload);

    let error = project_io::validate_commit_batch(&batch(
        &before,
        &after,
        payload,
        inverse,
        JournalAction::Apply,
    ))
    .unwrap_err();
    assert_eq!(error.code(), "DATABASE_ERROR");
}

#[test]
fn project_session_rejects_signed_zero_spoofing_in_batch_before() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Scene Environment Before Ownership".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let mut zero = initial.clone();
    zero.project.scene_environment.ambient.intensity = 0.0;
    zero.sequence = 1;
    let (payload, inverse) = payload_pair(&initial, &zero);
    session
        .commit(batch(
            &initial,
            &zero,
            payload,
            inverse,
            JournalAction::Apply,
        ))
        .unwrap();

    let owned = session.snapshot().clone();
    let mut spoofed_before = owned.clone();
    spoofed_before.project.scene_environment.ambient.intensity = -0.0;
    let mut claimed_after = spoofed_before.clone();
    claimed_after.project.scene_environment.ambient.intensity = 0.0;
    claimed_after.project.scene_environment.background_color = "#203040".into();
    claimed_after.sequence = 2;
    let (mut payload, _) = payload_pair(&spoofed_before, &claimed_after);
    payload["before"]["ambient"]["intensity"] = json!(-0.0);
    let inverse = inverse_for(&payload);
    assert_eq!(spoofed_before, owned);
    assert!(
        payload["before"]["ambient"]["intensity"]
            .as_f64()
            .unwrap()
            .is_sign_negative()
    );
    assert!(
        project_io::validate_commit_batch(&batch(
            &spoofed_before,
            &claimed_after,
            payload.clone(),
            inverse.clone(),
            JournalAction::Apply,
        ))
        .is_ok()
    );

    let error = session
        .commit(batch(
            &spoofed_before,
            &claimed_after,
            payload,
            inverse,
            JournalAction::Apply,
        ))
        .unwrap_err();
    assert_eq!(error.code(), "DATABASE_ERROR");
    assert_eq!(session.snapshot(), &owned);
}

#[test]
fn validate_commit_batch_rejects_signed_zero_spoofing_in_claimed_after() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Scene Environment After Ownership".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut before = opened.snapshot;
    before.project.scene_environment.ambient.intensity = 0.0;
    let mut replayed_after = before.clone();
    replayed_after.project.scene_environment.background_color = "#203040".into();
    replayed_after.sequence = 1;
    let (payload, inverse) = payload_pair(&before, &replayed_after);
    let mut claimed_after = replayed_after;
    claimed_after.project.scene_environment.ambient.intensity = -0.0;

    let error = project_io::validate_commit_batch(&batch(
        &before,
        &claimed_after,
        payload,
        inverse,
        JournalAction::Apply,
    ))
    .unwrap_err();
    assert_eq!(error.code(), "DATABASE_ERROR");
}

#[test]
fn checkpoint_rejects_signed_zero_environment_spoofing() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Scene Environment Checkpoint Ownership".into(),
        profile: ProjectProfile::Showroom,
    })
    .unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let initial = session.snapshot().clone();
    let mut zero = initial.clone();
    zero.project.scene_environment.ambient.intensity = 0.0;
    zero.sequence = 1;
    let (payload, inverse) = payload_pair(&initial, &zero);
    session
        .commit(batch(
            &initial,
            &zero,
            payload,
            inverse,
            JournalAction::Apply,
        ))
        .unwrap();

    let owned = session.snapshot().clone();
    let mut spoofed = owned.clone();
    spoofed.project.scene_environment.ambient.intensity = -0.0;
    let error = session.checkpoint(spoofed).unwrap_err();
    assert_eq!(error.code(), "DATABASE_ERROR");
    assert_eq!(session.snapshot(), &owned);
}
