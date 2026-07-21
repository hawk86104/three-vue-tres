use crate::{ProjectIoError, validate_relative_resource_path};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u32 = 2;
pub const MIN_SUPPORTED_SCHEMA_VERSION: u32 = 1;
const TYPESCRIPT_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_COLLECTION_JSON_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectProfile {
    Showroom,
    Market,
}

#[derive(Clone, Debug)]
pub struct CreateProjectRequest {
    pub parent: PathBuf,
    pub name: String,
    pub profile: ProjectProfile,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    #[serde(with = "contract_uuid")]
    pub project_id: Uuid,
    pub name: String,
    pub profile: ProjectProfile,
    pub created_at: String,
    pub updated_at: String,
    pub app_version: String,
    pub min_compatible_app_version: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Floor {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub layers: Vec<PlanLayer>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanLayer {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub visible: bool,
    pub locked: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialProject {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub profile: ProjectProfile,
    pub floors: Vec<Floor>,
    #[serde(default)]
    pub entities: Vec<serde_json::Value>,
    #[serde(default)]
    pub vendors: Vec<serde_json::Value>,
    #[serde(default)]
    pub product_contents: Vec<serde_json::Value>,
    #[serde(default)]
    pub media_assets: Vec<serde_json::Value>,
    #[serde(default)]
    pub route_networks: Vec<serde_json::Value>,
    #[serde(default)]
    pub themes: Vec<serde_json::Value>,
    #[serde(default)]
    pub camera_shots: Vec<serde_json::Value>,
    #[serde(default)]
    pub story_sequences: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub sha256: String,
    pub relative_path: String,
    pub media_type: String,
    pub size: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub schema_version: u32,
    pub sequence: u64,
    pub checkpoint_sequence: u64,
    pub project: SpatialProject,
    pub assets: Vec<AssetRecord>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointResult {
    pub manifest: ProjectManifest,
    pub snapshot: ProjectSnapshot,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalOperation {
    pub sequence: u64,
    pub transaction_id: String,
    pub command_type: String,
    pub payload: serde_json::Value,
    pub inverse_payload: serde_json::Value,
    pub action: JournalAction,
    pub timestamp: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JournalAction {
    Apply,
    Undo,
    Redo,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveState {
    Dirty,
    Saving,
    Saved,
    Error,
    Recovered,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitBatch {
    pub before: ProjectSnapshot,
    pub after: ProjectSnapshot,
    pub journal: Vec<JournalOperation>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenedProject {
    pub project_path: PathBuf,
    pub manifest: ProjectManifest,
    pub snapshot: ProjectSnapshot,
    pub recovered: bool,
}

impl ProjectManifest {
    pub(crate) fn validate(&self) -> Result<(), ProjectIoError> {
        if self.schema_version > CURRENT_SCHEMA_VERSION {
            return Err(ProjectIoError::UnsupportedSchemaVersion);
        }
        if self.schema_version < MIN_SUPPORTED_SCHEMA_VERSION
            || !valid_uuid(&self.project_id)
            || self.name.trim().is_empty()
            || self.app_version.trim().is_empty()
            || self.min_compatible_app_version.trim().is_empty()
            || !valid_timestamp(&self.created_at)
            || !valid_timestamp(&self.updated_at)
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        Ok(())
    }
}

impl JournalOperation {
    pub fn rename(sequence: u64, transaction_id: &str, before: &str, after: &str) -> Self {
        Self {
            sequence,
            transaction_id: transaction_id.into(),
            command_type: "project.rename".into(),
            payload: serde_json::json!({ "name": after }),
            inverse_payload: serde_json::json!({ "name": before }),
            action: JournalAction::Apply,
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}

impl ProjectSnapshot {
    pub(crate) fn validate(&self) -> Result<(), ProjectIoError> {
        if self.schema_version > CURRENT_SCHEMA_VERSION {
            return Err(ProjectIoError::UnsupportedSchemaVersion);
        }
        if self.schema_version < MIN_SUPPORTED_SCHEMA_VERSION
            || self.sequence > TYPESCRIPT_MAX_SAFE_INTEGER
            || self.checkpoint_sequence > TYPESCRIPT_MAX_SAFE_INTEGER
            || !valid_uuid(&self.project.id)
            || self.project.name.trim().is_empty()
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let mut identities = std::collections::BTreeSet::from([self.project.id]);
        let mut floor_ids = std::collections::BTreeSet::new();
        for floor in &self.project.floors {
            if !valid_uuid(&floor.id) || floor.name.trim().is_empty() {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            if !identities.insert(floor.id) || !floor_ids.insert(floor.id) {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            if self.schema_version == 1 && !floor.layers.is_empty() {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            for layer in &floor.layers {
                if !valid_uuid(&layer.id)
                    || layer.name.trim().is_empty()
                    || !identities.insert(layer.id)
                {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
            }
        }
        for asset in &self.assets {
            if !valid_uuid(&asset.id)
                || asset.sha256.len() != 64
                || !asset
                    .sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
                || asset.media_type.trim().is_empty()
                || asset.size > TYPESCRIPT_MAX_SAFE_INTEGER
                || validate_relative_resource_path(&asset.relative_path).is_err()
                || !identities.insert(asset.id)
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        let collections = [
            &self.project.entities,
            &self.project.vendors,
            &self.project.product_contents,
            &self.project.media_assets,
            &self.project.route_networks,
            &self.project.themes,
            &self.project.camera_shots,
            &self.project.story_sequences,
        ];
        if self.schema_version == 1 && collections.iter().any(|collection| !collection.is_empty()) {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        for collection in collections {
            validate_json_collection(collection)?;
        }
        for entity in &self.project.entities {
            let source = entity
                .as_object()
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let id_text = source
                .get("id")
                .and_then(serde_json::Value::as_str)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let id = parse_contract_uuid(id_text)?;
            let entity_type = source
                .get("type")
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let floor_id_text = source
                .get("floorId")
                .and_then(serde_json::Value::as_str)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let floor_id = parse_contract_uuid(floor_id_text)?;
            if id.hyphenated().to_string() != id_text
                || floor_id.hyphenated().to_string() != floor_id_text
                || entity_type.trim().is_empty()
                || !floor_ids.contains(&floor_id)
                || !identities.insert(id)
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        Ok(())
    }
}

fn validate_json_collection(values: &[serde_json::Value]) -> Result<(), ProjectIoError> {
    let mut size = 2usize;
    for value in values {
        if !value.is_object() {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        validate_json_value(value)?;
        size = size
            .checked_add(
                serde_json::to_vec(value)
                    .map_err(|_| ProjectIoError::InvalidProjectStructure)?
                    .len(),
            )
            .and_then(|size| size.checked_add(1))
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        if size > MAX_COLLECTION_JSON_BYTES {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    Ok(())
}

fn validate_json_value(value: &serde_json::Value) -> Result<(), ProjectIoError> {
    match value {
        serde_json::Value::Number(number) => {
            let max = TYPESCRIPT_MAX_SAFE_INTEGER as i64;
            let outside_safe_integer_range = if let Some(value) = number.as_i64() {
                value < -max || value > max
            } else if let Some(value) = number.as_u64() {
                value > TYPESCRIPT_MAX_SAFE_INTEGER
            } else if let Some(value) = number.as_f64() {
                value.fract() == 0.0 && value.abs() > TYPESCRIPT_MAX_SAFE_INTEGER as f64
            } else {
                true
            };
            if outside_safe_integer_range {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                validate_json_value(value)?;
            }
        }
        serde_json::Value::Object(values) => {
            for value in values.values() {
                validate_json_value(value)?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod collection_validation_tests {
    use super::validate_json_collection;
    use serde_json::json;

    #[test]
    fn recursively_accepts_javascript_safe_integer_boundaries() {
        let values = vec![
            json!({
                "nested": {
                    "values": [
                        9_007_199_254_740_991_i64,
                        -9_007_199_254_740_991_i64
                    ]
                }
            }),
            serde_json::from_str::<serde_json::Value>(
                r#"{ "positive": 9007199254740991.0, "negative": -9007199254740991.0 }"#,
            )
            .unwrap(),
            serde_json::from_str::<serde_json::Value>(
                r#"{ "positiveExponent": 9.007199254740991e15, "negativeExponent": -9.007199254740991e15 }"#,
            )
            .unwrap(),
        ];

        validate_json_collection(&values).unwrap();
    }

    #[test]
    fn recursively_rejects_integral_numbers_outside_javascript_safe_range() {
        for value in [
            json!({ "nested": [{ "value": 9_007_199_254_740_992_u64 }] }),
            json!({ "nested": [{ "value": -9_007_199_254_740_992_i64 }] }),
            serde_json::from_str(r#"{ "nested": { "value": 9007199254740992.0 } }"#)
                .unwrap(),
        ] {
            let error = validate_json_collection(&[value]).unwrap_err();
            assert_eq!(error.code(), "INVALID_PROJECT_STRUCTURE");
        }
    }
}

pub(crate) fn valid_uuid(value: &Uuid) -> bool {
    matches!(value.get_version_num(), 1..=5)
        && matches!(value.get_variant(), uuid::Variant::RFC4122)
}

pub(crate) fn parse_contract_uuid(value: &str) -> Result<Uuid, ProjectIoError> {
    if !contract_uuid_text(value) {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Uuid::parse_str(value).map_err(|_| ProjectIoError::InvalidProjectStructure)
}

fn contract_uuid_text(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36
        || bytes[8] != b'-'
        || bytes[13] != b'-'
        || bytes[18] != b'-'
        || bytes[23] != b'-'
        || !matches!(bytes[14], b'1'..=b'5')
        || !matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
    {
        return false;
    }
    bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| matches!(index, 8 | 13 | 18 | 23) || byte.is_ascii_hexdigit())
}

mod contract_uuid {
    use super::{Uuid, contract_uuid_text};
    use serde::{Deserialize, Deserializer, Serializer, de::Error as _};

    pub fn serialize<S: Serializer>(value: &Uuid, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.hyphenated().to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Uuid, D::Error> {
        let value = String::deserialize(deserializer)?;
        if !contract_uuid_text(&value) {
            return Err(D::Error::custom("invalid project UUID"));
        }
        Uuid::parse_str(&value).map_err(|_| D::Error::custom("invalid project UUID"))
    }
}

pub(crate) fn valid_timestamp(value: &str) -> bool {
    if !value.ends_with('Z') {
        return false;
    }
    let Ok(parsed) = DateTime::parse_from_rfc3339(value) else {
        return false;
    };
    if parsed.timestamp_subsec_nanos() % 1_000_000 != 0 {
        return false;
    }
    let canonical = parsed
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    value == canonical || (canonical.ends_with(".000Z") && value == canonical.replace(".000Z", "Z"))
}
