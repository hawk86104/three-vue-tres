use crate::{ProjectIoError, validate_relative_resource_path};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
const TYPESCRIPT_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

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
        if self.schema_version != CURRENT_SCHEMA_VERSION
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
        if self.schema_version != CURRENT_SCHEMA_VERSION
            || self.sequence > TYPESCRIPT_MAX_SAFE_INTEGER
            || self.checkpoint_sequence > TYPESCRIPT_MAX_SAFE_INTEGER
            || !valid_uuid(&self.project.id)
            || self.project.name.trim().is_empty()
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        for floor in &self.project.floors {
            if !valid_uuid(&floor.id) || floor.name.trim().is_empty() {
                return Err(ProjectIoError::InvalidProjectStructure);
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
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        Ok(())
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
