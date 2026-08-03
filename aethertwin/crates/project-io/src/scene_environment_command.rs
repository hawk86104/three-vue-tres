use crate::model::{SceneEnvironment, validate_scene_environment};
use crate::{ProjectIoError, ProjectSnapshot};
use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SceneEnvironmentPatchPayload {
    before: SceneEnvironment,
    after: SceneEnvironment,
}

pub(crate) fn scene_environment_patch(
    value: &Value,
) -> Result<SceneEnvironmentPatchPayload, ProjectIoError> {
    let payload: SceneEnvironmentPatchPayload =
        serde_json::from_value(value.clone()).map_err(|_| ProjectIoError::DatabaseError)?;
    validate_scene_environment(&payload.before).map_err(|_| ProjectIoError::DatabaseError)?;
    validate_scene_environment(&payload.after).map_err(|_| ProjectIoError::DatabaseError)?;
    Ok(payload)
}

fn same_number(left: f64, right: f64) -> bool {
    left.to_bits() == right.to_bits()
}

pub(crate) fn same_scene_environment(left: &SceneEnvironment, right: &SceneEnvironment) -> bool {
    left.background_color == right.background_color
        && left.ambient.color == right.ambient.color
        && same_number(left.ambient.intensity, right.ambient.intensity)
        && left.key.color == right.key.color
        && same_number(left.key.intensity, right.key.intensity)
        && left
            .key
            .direction
            .iter()
            .zip(right.key.direction.iter())
            .all(|(left, right)| same_number(*left, *right))
        && left.shadows_enabled == right.shadows_enabled
        && same_number(left.shadow_softness, right.shadow_softness)
}

pub(crate) fn scene_environment_has_exact_inverse(
    payload: &SceneEnvironmentPatchPayload,
    inverse: &SceneEnvironmentPatchPayload,
) -> bool {
    same_scene_environment(&payload.before, &inverse.after)
        && same_scene_environment(&payload.after, &inverse.before)
}

pub(crate) fn apply_scene_environment_patch(
    snapshot: &mut ProjectSnapshot,
    payload: &SceneEnvironmentPatchPayload,
) -> Result<(), ProjectIoError> {
    if !same_scene_environment(&snapshot.project.scene_environment, &payload.before) {
        return Err(ProjectIoError::DatabaseError);
    }
    snapshot.project.scene_environment = payload.after.clone();
    Ok(())
}
