use crate::error::HostError;
use project_io::{
    AssetRecord, CommitBatch, Floor, JournalAction, JournalOperation, ProjectProfile,
    PlanLayer, ProjectSnapshot, SpatialProject, validate_commit_batch,
};
use serde::Deserialize;
use serde_json::Value;
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
    snapshot: ProjectSnapshotDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloseProjectDto {
    session_id: String,
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
        Ok((self.session_id, self.snapshot.into_native()?))
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
    before: ProjectSnapshotDto,
    after: ProjectSnapshotDto,
    journal: Vec<JournalOperationDto>,
}

impl CommitBatchDto {
    fn into_native(self) -> Result<CommitBatch, HostError> {
        Ok(CommitBatch {
            before: self.before.into_native()?,
            after: self.after.into_native()?,
            journal: self
                .journal
                .into_iter()
                .map(JournalOperationDto::into_native)
                .collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectSnapshotDto {
    schema_version: u32,
    sequence: u64,
    checkpoint_sequence: u64,
    project: SpatialProjectDto,
    assets: Vec<AssetRecordDto>,
}

impl ProjectSnapshotDto {
    fn into_native(self) -> Result<ProjectSnapshot, HostError> {
        Ok(ProjectSnapshot {
            schema_version: self.schema_version,
            sequence: self.sequence,
            checkpoint_sequence: self.checkpoint_sequence,
            project: self.project.into_native()?,
            assets: self
                .assets
                .into_iter()
                .map(AssetRecordDto::into_native)
                .collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SpatialProjectDto {
    id: String,
    name: String,
    tags: Vec<String>,
    profile: String,
    floors: Vec<FloorDto>,
    entities: Vec<Value>,
    vendors: Vec<Value>,
    product_contents: Vec<Value>,
    media_assets: Vec<Value>,
    route_networks: Vec<Value>,
    themes: Vec<Value>,
    camera_shots: Vec<Value>,
    story_sequences: Vec<Value>,
}

impl SpatialProjectDto {
    fn into_native(self) -> Result<SpatialProject, HostError> {
        Ok(SpatialProject {
            id: canonical_uuid(&self.id)?,
            name: self.name,
            tags: self.tags,
            profile: profile(&self.profile)?,
            floors: self
                .floors
                .into_iter()
                .map(FloorDto::into_native)
                .collect::<Result<_, _>>()?,
            entities: self.entities,
            vendors: self.vendors,
            product_contents: self.product_contents,
            media_assets: self.media_assets,
            route_networks: self.route_networks,
            themes: self.themes,
            camera_shots: self.camera_shots,
            story_sequences: self.story_sequences,
        })
    }
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
struct AssetRecordDto {
    id: String,
    sha256: String,
    relative_path: String,
    media_type: String,
    size: u64,
}

impl AssetRecordDto {
    fn into_native(self) -> Result<AssetRecord, HostError> {
        Ok(AssetRecord {
            id: canonical_uuid(&self.id)?,
            sha256: self.sha256,
            relative_path: self.relative_path,
            media_type: self.media_type,
            size: self.size,
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
        && object.keys().all(|key| required.contains(&key.as_str()) || key == "index")
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
    canonical_uuid(floor_id)
        .is_ok_and(|id| before.id == id && after.id == id)
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
