use crate::error::HostError;
use asset_io::{AssetImportRole, AssetMediaFacts, ImportResult};
use project_io::{
    CommitBatch, Floor, JournalAction, JournalOperation, PlanLayer, ProjectExportPreset,
    ProjectProfile, ProjectSnapshot, validate_commit_batch,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fmt;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateProjectDto {
    pub parent: String,
    pub name: String,
    pub profile: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenProjectDto {
    pub path: String,
    pub recover_stale_lock: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoverProjectDto {
    pub path: String,
    pub confirm: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommitProjectDto {
    session_id: String,
    batch: CommitBatchDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckpointProjectDto {
    session_id: String,
    snapshot: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloseProjectDto {
    session_id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectExportPresetDto {
    FullHd,
    UltraHd,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BeginProjectExportRequestDto {
    pub session_id: String,
    pub project_id: String,
    pub snapshot_sequence: u64,
    pub active_floor_id: String,
    pub preset: ProjectExportPresetDto,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FinishProjectExportRequestDto {
    pub session_id: String,
    pub export_id: String,
}

impl BeginProjectExportRequestDto {
    pub fn into_native(self) -> Result<(Uuid, Uuid, u64, Uuid, ProjectExportPreset), HostError> {
        const MAX_JS_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
        if self.snapshot_sequence > MAX_JS_SAFE_INTEGER {
            return Err(HostError::IpcInvalidRequest);
        }
        Ok((
            canonical_uuid(&self.session_id)?,
            canonical_uuid(&self.project_id)?,
            self.snapshot_sequence,
            canonical_uuid(&self.active_floor_id)?,
            self.preset.into(),
        ))
    }
}

impl FinishProjectExportRequestDto {
    pub fn into_native(self) -> Result<(Uuid, Uuid), HostError> {
        Ok((
            canonical_uuid(&self.session_id)?,
            canonical_uuid(&self.export_id)?,
        ))
    }
}

impl From<ProjectExportPresetDto> for ProjectExportPreset {
    fn from(value: ProjectExportPresetDto) -> Self {
        match value {
            ProjectExportPresetDto::FullHd => Self::FullHd,
            ProjectExportPresetDto::UltraHd => Self::UltraHd,
        }
    }
}

impl CommitProjectDto {
    pub(crate) fn into_native(self) -> Result<(String, CommitBatch), HostError> {
        let batch = self.batch.into_native()?;
        validate_payload_shapes(&batch)?;
        validate_commit_batch(&batch).map_err(|_| HostError::IpcInvalidRequest)?;
        Ok((self.session_id, batch))
    }
}

impl CheckpointProjectDto {
    pub(crate) fn into_native(self) -> Result<(String, ProjectSnapshot), HostError> {
        Ok((self.session_id, strict_v3_snapshot(self.snapshot)?))
    }
}

impl CloseProjectDto {
    pub(crate) fn into_session_id(self) -> String {
        self.session_id
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommitBatchDto {
    before: Value,
    after: Value,
    journal: Vec<JournalOperationDto>,
}

impl CommitBatchDto {
    fn into_native(self) -> Result<CommitBatch, HostError> {
        Ok(CommitBatch {
            before: strict_v3_snapshot(self.before)?,
            after: strict_v3_snapshot(self.after)?,
            journal: self
                .journal
                .into_iter()
                .map(JournalOperationDto::into_native)
                .collect::<Result<_, _>>()?,
        })
    }
}

fn strict_v3_snapshot(value: Value) -> Result<ProjectSnapshot, HostError> {
    let snapshot: ProjectSnapshot =
        serde_json::from_value(value).map_err(|_| HostError::IpcInvalidRequest)?;
    if snapshot.schema_version != 3 {
        return Err(HostError::IpcInvalidRequest);
    }
    Ok(snapshot)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FloorDto {
    id: String,
    name: String,
    tags: Vec<String>,
    layers: Vec<PlanLayerDto>,
}

impl FloorDto {
    fn into_native(self) -> Result<Floor, HostError> {
        Ok(Floor {
            id: canonical_uuid(&self.id)?,
            name: self.name,
            tags: self.tags,
            layers: self
                .layers
                .into_iter()
                .map(PlanLayerDto::into_native)
                .collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PlanLayerDto {
    id: String,
    name: String,
    tags: Vec<String>,
    visible: bool,
    locked: bool,
}

impl PlanLayerDto {
    fn into_native(self) -> Result<PlanLayer, HostError> {
        Ok(PlanLayer {
            id: canonical_uuid(&self.id)?,
            name: self.name,
            tags: self.tags,
            visible: self.visible,
            locked: self.locked,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JournalOperationDto {
    sequence: u64,
    transaction_id: String,
    command_type: String,
    payload: Value,
    inverse_payload: Value,
    action: String,
    timestamp: String,
}

impl JournalOperationDto {
    fn into_native(self) -> Result<JournalOperation, HostError> {
        let action = match self.action.as_str() {
            "apply" => JournalAction::Apply,
            "undo" => JournalAction::Undo,
            "redo" => JournalAction::Redo,
            _ => return Err(HostError::IpcInvalidRequest),
        };
        Ok(JournalOperation {
            sequence: self.sequence,
            transaction_id: self.transaction_id,
            command_type: self.command_type,
            payload: self.payload,
            inverse_payload: self.inverse_payload,
            action,
            timestamp: self.timestamp,
        })
    }
}

pub(crate) fn profile(value: &str) -> Result<ProjectProfile, HostError> {
    match value {
        "showroom" => Ok(ProjectProfile::Showroom),
        "market" => Ok(ProjectProfile::Market),
        _ => Err(HostError::IpcInvalidRequest),
    }
}

fn canonical_uuid(value: &str) -> Result<Uuid, HostError> {
    let parsed = Uuid::parse_str(value).map_err(|_| HostError::IpcInvalidRequest)?;
    if parsed.hyphenated().to_string() != value
        || !matches!(parsed.get_version_num(), 1..=5)
        || !matches!(parsed.get_variant(), uuid::Variant::RFC4122)
    {
        return Err(HostError::IpcInvalidRequest);
    }
    Ok(parsed)
}

fn validate_payload_shapes(batch: &CommitBatch) -> Result<(), HostError> {
    for operation in &batch.journal {
        let valid = match operation.command_type.as_str() {
            "project.rename" => {
                exact_string(&operation.payload, "name")
                    && exact_string(&operation.inverse_payload, "name")
            }
            "project.tags.set" => {
                exact_strings(&operation.payload, "tags")
                    && exact_strings(&operation.inverse_payload, "tags")
            }
            "plan.entities.patch" => {
                exact_entity_patch_pair(&operation.payload, &operation.inverse_payload)
            }
            "snapshot.records.patch" => true,
            "scene.environment.patch" => {
                exact_scene_environment_patch_pair(&operation.payload, &operation.inverse_payload)
            }
            "building.structure.patch" => {
                exact_building_patch_pair(&operation.payload, &operation.inverse_payload)
            }
            "plan.floor.patch" => {
                exact_floor_patch_pair(&operation.payload, &operation.inverse_payload)
            }
            _ => false,
        };
        if !valid {
            return Err(HostError::IpcInvalidRequest);
        }
    }
    Ok(())
}

fn exact_object(value: &Value, keys: &[&str]) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == keys.len() && keys.iter().all(|key| object.contains_key(*key))
    })
}

fn exact_scene_environment(value: &Value) -> bool {
    exact_object(
        value,
        &[
            "backgroundColor",
            "ambient",
            "key",
            "shadowsEnabled",
            "shadowSoftness",
        ],
    ) && value["backgroundColor"].as_str().is_some()
        && exact_object(&value["ambient"], &["color", "intensity"])
        && value["ambient"]["color"].as_str().is_some()
        && value["ambient"]["intensity"].as_f64().is_some()
        && exact_object(&value["key"], &["color", "intensity", "direction"])
        && value["key"]["color"].as_str().is_some()
        && value["key"]["intensity"].as_f64().is_some()
        && value["key"]["direction"]
            .as_array()
            .is_some_and(|direction| {
                direction.len() == 3
                    && direction
                        .iter()
                        .all(|component| component.as_f64().is_some())
            })
        && value["shadowsEnabled"].as_bool().is_some()
        && value["shadowSoftness"].as_f64().is_some()
}

fn exact_scene_environment_patch_pair(payload: &Value, inverse: &Value) -> bool {
    exact_object(payload, &["before", "after"])
        && exact_object(inverse, &["before", "after"])
        && exact_scene_environment(&payload["before"])
        && exact_scene_environment(&payload["after"])
        && exact_scene_environment(&inverse["before"])
        && exact_scene_environment(&inverse["after"])
        && payload["before"] == inverse["after"]
        && payload["after"] == inverse["before"]
}

fn plan_reason(value: &Value) -> bool {
    value.as_str().is_some_and(|reason| {
        matches!(
            reason,
            "create"
                | "delete"
                | "transform"
                | "properties"
                | "duplicate"
                | "array"
                | "align"
                | "distribute"
        )
    })
}

fn exact_entity_side(value: &Value, id: &str) -> bool {
    value.is_null()
        || value
            .as_object()
            .and_then(|source| source.get("id"))
            .and_then(Value::as_str)
            .is_some_and(|side_id| side_id == id && canonical_uuid(side_id).is_ok())
}

fn entity_patch_parts(value: &Value) -> Option<(&str, &[Value])> {
    if !exact_object(value, &["reason", "changes"]) || !plan_reason(&value["reason"]) {
        return None;
    }
    Some((
        value["reason"].as_str()?,
        value["changes"].as_array()?.as_slice(),
    ))
}

fn exact_entity_change(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    let required = ["id", "before", "after"];
    (object.len() == required.len() || object.len() == required.len() + 1)
        && required.iter().all(|key| object.contains_key(*key))
        && object
            .keys()
            .all(|key| required.contains(&key.as_str()) || key == "index")
        && object.get("index").is_none_or(|index| {
            index
                .as_u64()
                .is_some_and(|index| index <= 9_007_199_254_740_991)
        })
}

fn exact_entity_patch(value: &Value) -> bool {
    let Some((_, changes)) = entity_patch_parts(value) else {
        return false;
    };
    let mut ids = std::collections::BTreeSet::new();
    changes.iter().all(|change| {
        if !exact_entity_change(change) {
            return false;
        }
        let Some(id) = change["id"].as_str() else {
            return false;
        };
        canonical_uuid(id).is_ok()
            && ids.insert(id)
            && !(change["before"].is_null() && change["after"].is_null())
            && exact_entity_side(&change["before"], id)
            && exact_entity_side(&change["after"], id)
    })
}

fn exact_entity_patch_pair(payload: &Value, inverse: &Value) -> bool {
    if !exact_entity_patch(payload) || !exact_entity_patch(inverse) {
        return false;
    }
    let Some((reason, changes)) = entity_patch_parts(payload) else {
        return false;
    };
    let Some((inverse_reason, inverse_changes)) = entity_patch_parts(inverse) else {
        return false;
    };
    reason == inverse_reason
        && changes.len() == inverse_changes.len()
        && changes
            .iter()
            .rev()
            .zip(inverse_changes)
            .all(|(change, reversed)| {
                change["id"] == reversed["id"]
                    && change["before"] == reversed["after"]
                    && change["after"] == reversed["before"]
                    && change
                        .get("index")
                        .is_none_or(|index| reversed.get("index") == Some(index))
            })
}

fn exact_building_wall_side(value: &Value, id: &str) -> bool {
    if value.is_null() {
        return true;
    }
    let Some(source) = value.as_object() else {
        return false;
    };
    let required = [
        "type",
        "id",
        "name",
        "tags",
        "floorId",
        "layerId",
        "transform",
        "locked",
        "centerLine",
        "thickness",
    ];
    required.iter().all(|key| source.contains_key(*key))
        && source
            .keys()
            .all(|key| required.contains(&key.as_str()) || key == "spatial3D")
        && source.get("type").and_then(Value::as_str) == Some("wall")
        && source
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|side_id| side_id == id && canonical_uuid(side_id).is_ok())
}

fn exact_building_opening_side(value: &Value, id: &str) -> bool {
    value.is_null()
        || (exact_object(
            value,
            &[
                "id",
                "name",
                "tags",
                "wallId",
                "kind",
                "distanceAlongWall",
                "width",
                "height",
                "sillHeight",
            ],
        ) && value
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|side_id| side_id == id && canonical_uuid(side_id).is_ok()))
}

fn exact_building_change(value: &Value, side: fn(&Value, &str) -> bool) -> Option<String> {
    if !exact_entity_change(value) {
        return None;
    }
    let id = value.get("id")?.as_str()?;
    if canonical_uuid(id).is_err()
        || (value["before"].is_null() && value["after"].is_null())
        || !side(&value["before"], id)
        || !side(&value["after"], id)
    {
        return None;
    }
    Some(id.to_owned())
}

fn building_patch_parts(value: &Value) -> Option<(&str, &[Value], &[Value])> {
    if !exact_object(value, &["reason", "wallChanges", "openingChanges"])
        || !plan_reason(&value["reason"])
    {
        return None;
    }
    let walls = value["wallChanges"].as_array()?.as_slice();
    let openings = value["openingChanges"].as_array()?.as_slice();
    if walls.is_empty() && openings.is_empty() {
        return None;
    }
    Some((value["reason"].as_str()?, walls, openings))
}

fn exact_building_patch(value: &Value) -> bool {
    let Some((_, walls, openings)) = building_patch_parts(value) else {
        return false;
    };
    let mut ids = std::collections::BTreeSet::new();
    walls
        .iter()
        .filter_map(|change| exact_building_change(change, exact_building_wall_side))
        .chain(
            openings
                .iter()
                .filter_map(|change| exact_building_change(change, exact_building_opening_side)),
        )
        .all(|id| ids.insert(id))
        && ids.len() == walls.len() + openings.len()
}

fn exact_building_change_pairs(changes: &[Value], inverse: &[Value]) -> bool {
    changes.len() == inverse.len()
        && changes.iter().rev().zip(inverse).all(|(change, reversed)| {
            change["id"] == reversed["id"]
                && change["before"] == reversed["after"]
                && change["after"] == reversed["before"]
                && change
                    .get("index")
                    .is_none_or(|index| reversed.get("index") == Some(index))
        })
}

fn exact_building_patch_pair(payload: &Value, inverse: &Value) -> bool {
    if !exact_building_patch(payload) || !exact_building_patch(inverse) {
        return false;
    }
    let Some((reason, walls, openings)) = building_patch_parts(payload) else {
        return false;
    };
    let Some((inverse_reason, inverse_walls, inverse_openings)) = building_patch_parts(inverse)
    else {
        return false;
    };
    reason == inverse_reason
        && exact_building_change_pairs(walls, inverse_walls)
        && exact_building_change_pairs(openings, inverse_openings)
}
fn strict_floor(value: &Value) -> Option<Floor> {
    serde_json::from_value::<FloorDto>(value.clone())
        .ok()?
        .into_native()
        .ok()
}

fn exact_floor_patch(value: &Value) -> bool {
    if !exact_object(value, &["floorId", "before", "after"]) {
        return false;
    }
    let Some(floor_id) = value["floorId"].as_str() else {
        return false;
    };
    let Some(before) = strict_floor(&value["before"]) else {
        return false;
    };
    let Some(after) = strict_floor(&value["after"]) else {
        return false;
    };
    canonical_uuid(floor_id).is_ok_and(|id| before.id == id && after.id == id)
}

fn exact_floor_patch_pair(payload: &Value, inverse: &Value) -> bool {
    exact_floor_patch(payload)
        && exact_floor_patch(inverse)
        && payload["floorId"] == inverse["floorId"]
        && payload["before"] == inverse["after"]
        && payload["after"] == inverse["before"]
}

fn exact_string(value: &Value, key: &str) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == 1
            && object
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(|value| !value.trim().is_empty())
    })
}

fn exact_strings(value: &Value, key: &str) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == 1
            && object
                .get(key)
                .and_then(Value::as_array)
                .is_some_and(|values| values.iter().all(Value::is_string))
    })
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportProjectAssetDto {
    pub session_id: String,
    pub operation_id: String,
    pub role: String,
    pub source_path: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelProjectAssetImportDto {
    pub session_id: String,
    pub operation_id: String,
}

#[derive(Clone)]
pub(crate) struct NativeImportProjectAsset {
    pub session_id: Uuid,
    pub operation_id: Uuid,
    pub role: AssetImportRole,
    pub source_path: PathBuf,
}
impl fmt::Debug for ImportProjectAssetDto {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ImportProjectAssetDto")
            .field("session_id", &self.session_id)
            .field("operation_id", &self.operation_id)
            .field("role", &self.role)
            .finish()
    }
}

impl fmt::Debug for NativeImportProjectAsset {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("NativeImportProjectAsset")
            .field("session_id", &self.session_id)
            .field("operation_id", &self.operation_id)
            .field("role", &self.role)
            .finish()
    }
}

impl ImportProjectAssetDto {
    pub(crate) fn into_native(self) -> Result<NativeImportProjectAsset, HostError> {
        let role = match self.role.as_str() {
            "plan-reference" => AssetImportRole::PlanReference,
            "content-image" => AssetImportRole::ContentImage,
            "content-video" => AssetImportRole::ContentVideo,
            "material-texture" => AssetImportRole::MaterialTexture,
            _ => return Err(HostError::IpcInvalidRequest),
        };
        let source_path = strict_native_path(&self.source_path)?;
        Ok(NativeImportProjectAsset {
            session_id: canonical_uuid(&self.session_id)?,
            operation_id: canonical_uuid(&self.operation_id)?,
            role,
            source_path,
        })
    }
}

impl CancelProjectAssetImportDto {
    pub(crate) fn into_native(self) -> Result<(Uuid, Uuid), HostError> {
        Ok((
            canonical_uuid(&self.session_id)?,
            canonical_uuid(&self.operation_id)?,
        ))
    }
}

fn strict_native_path(value: &str) -> Result<PathBuf, HostError> {
    if value.is_empty() || value.trim() != value || value.contains('\0') {
        return Err(HostError::IpcInvalidRequest);
    }
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err(HostError::IpcInvalidRequest);
    }
    Ok(path.to_owned())
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgressDto {
    pub operation_id: String,
    pub stage: String,
    pub completed_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResultDto {
    pub asset: project_io::AssetRecord,
    pub facts: Value,
}

impl From<ImportResult> for ImportResultDto {
    fn from(result: ImportResult) -> Self {
        let facts = match result.facts {
            AssetMediaFacts::Image { width, height } => {
                json!({ "kind": "image", "width": width, "height": height })
            }
            AssetMediaFacts::Video => json!({ "kind": "video" }),
        };
        Self {
            asset: result.asset,
            facts,
        }
    }
}

#[cfg(test)]
mod import_debug_tests {
    use super::*;

    #[test]
    fn asset_import_debug_output_never_contains_the_native_source_path() {
        let source_path = if cfg!(windows) {
            r"C:\private\debug-must-not-leak.png"
        } else {
            "/private/debug-must-not-leak.png"
        };
        let dto = ImportProjectAssetDto {
            session_id: "10000000-0000-4000-8000-000000000001".into(),
            operation_id: "30000000-0000-4000-8000-000000000001".into(),
            role: "plan-reference".into(),
            source_path: source_path.into(),
        };
        let native = dto.clone().into_native().unwrap();

        for debug in [format!("{dto:?}"), format!("{native:?}")] {
            assert!(debug.contains("10000000-0000-4000-8000-000000000001"));
            assert!(debug.contains("30000000-0000-4000-8000-000000000001"));
            assert!(!debug.contains(source_path));
            assert!(!debug.contains("debug-must-not-leak"));
            assert!(!debug.contains("source_path"));
        }
    }
}
