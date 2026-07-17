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
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialProject {
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub profile: ProjectProfile,
    pub floors: Vec<Floor>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
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
