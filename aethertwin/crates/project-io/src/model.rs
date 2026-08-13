#[cfg(test)]
use crate::opening_geometry::{
    GEOMETRY_EPSILON_MM, WallGeometry, effective_wall_thickness, locate_opening,
    wall_metric_segments,
};
use crate::{
    ProjectIoError,
    opening_geometry::{validate_opening_geometry, wall_geometry_from_entity},
    validate_relative_resource_path,
};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
};
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: u32 = 3;
pub const MIN_SUPPORTED_SCHEMA_VERSION: u32 = 1;
const TYPESCRIPT_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_COLLECTION_JSON_BYTES: usize = 16 * 1024 * 1024;
const MAX_INTRINSIC_AXIS: u64 = 16_384;
const MAX_DECODED_PIXELS: u64 = 268_435_456;
const MAX_WORLD_COORDINATE_MM: f64 = 1_000_000_000.0;
const ROUTE_GEOMETRY_EPSILON_MM: f64 = 1e-7;

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectCreationIdentity {
    pub project_id: Uuid,
    pub floor_id: Uuid,
    pub layer_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Floor {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub layers: Vec<PlanLayer>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanLayer {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub visible: bool,
    pub locked: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Point2 {
    #[serde(serialize_with = "serialize_js_number")]
    pub x: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IntrinsicSize {
    pub width: u64,
    pub height: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transform2D {
    pub translation: Point2,
    #[serde(serialize_with = "serialize_js_number")]
    pub rotation: f64,
    pub scale: Point2,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalibrationEvidence {
    pub source_point_a: Point2,
    pub source_point_b: Point2,
    #[serde(serialize_with = "serialize_js_number")]
    pub measured_distance_mm: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanReference {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub floor_id: Uuid,
    #[serde(with = "contract_uuid")]
    pub layer_id: Uuid,
    #[serde(with = "contract_uuid")]
    pub asset_id: Uuid,
    pub intrinsic_size: IntrinsicSize,
    pub transform: Transform2D,
    #[serde(serialize_with = "serialize_js_number")]
    pub opacity: f64,
    pub locked: bool,
    pub calibration: Option<CalibrationEvidence>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OpeningKind {
    Door,
    Window,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Opening {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub wall_id: Uuid,
    pub kind: OpeningKind,
    #[serde(serialize_with = "serialize_js_number")]
    pub distance_along_wall: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub width: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub height: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub sill_height: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductContent {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub target_entity_id: Uuid,
    pub description: String,
    #[serde(with = "contract_uuid_vec")]
    pub media_asset_ids: Vec<Uuid>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaAssetKind {
    Image,
    Video,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaAsset {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub asset_id: Uuid,
    pub kind: MediaAssetKind,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RouteNodeKind {
    Junction,
    Entrance,
    ShowroomStop,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RouteNode {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub position: Point2,
    #[serde(with = "contract_uuid")]
    pub floor_id: Uuid,
    pub kind: RouteNodeKind,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RouteEdge {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub from: Uuid,
    #[serde(with = "contract_uuid")]
    pub to: Uuid,
    #[serde(serialize_with = "serialize_js_number")]
    pub distance: f64,
    pub bidirectional: bool,
    pub accessible: bool,
    pub enabled: bool,
    #[serde(serialize_with = "serialize_js_number")]
    pub width: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub weight: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RouteNetwork {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub nodes: Vec<RouteNode>,
    pub edges: Vec<RouteEdge>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuidedRoute {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub route_network_id: Uuid,
    #[serde(with = "contract_uuid_vec")]
    pub stop_node_ids: Vec<Uuid>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialDefinition {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    pub base_color: String,
    #[serde(serialize_with = "serialize_js_number")]
    pub roughness: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub metalness: f64,
    #[serde(serialize_with = "serialize_js_number")]
    pub opacity: f64,
    #[serde(with = "optional_contract_uuid")]
    pub asset_id: Option<Uuid>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MaterialTargetKind {
    SpaceFloor,
    Wall,
    Fixture,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaterialAssignment {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub name: String,
    pub tags: Vec<String>,
    #[serde(with = "contract_uuid")]
    pub material_id: Uuid,
    pub target_kind: MaterialTargetKind,
    #[serde(with = "contract_uuid")]
    pub target_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AmbientLight {
    pub color: String,
    #[serde(serialize_with = "serialize_js_number")]
    pub intensity: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KeyLight {
    pub color: String,
    #[serde(serialize_with = "serialize_js_number")]
    pub intensity: f64,
    #[serde(serialize_with = "serialize_js_vector3")]
    pub direction: [f64; 3],
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SceneEnvironment {
    pub background_color: String,
    pub ambient: AmbientLight,
    pub key: KeyLight,
    pub shadows_enabled: bool,
    #[serde(serialize_with = "serialize_js_number")]
    pub shadow_softness: f64,
}

impl Default for SceneEnvironment {
    fn default() -> Self {
        Self {
            background_color: "#101820".into(),
            ambient: AmbientLight {
                color: "#dce8f0".into(),
                intensity: 0.55,
            },
            key: KeyLight {
                color: "#fff1dc".into(),
                intensity: 1.1,
                direction: [4.0, 8.0, 5.0],
            },
            shadows_enabled: true,
            shadow_softness: 0.5,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    pub product_contents: Vec<ProductContent>,
    #[serde(default)]
    pub media_assets: Vec<MediaAsset>,
    #[serde(default)]
    pub route_networks: Vec<RouteNetwork>,
    #[serde(default)]
    pub themes: Vec<serde_json::Value>,
    #[serde(default)]
    pub camera_shots: Vec<serde_json::Value>,
    #[serde(default)]
    pub story_sequences: Vec<serde_json::Value>,
    #[serde(default)]
    pub plan_references: Vec<PlanReference>,
    #[serde(default)]
    pub openings: Vec<Opening>,
    #[serde(default)]
    pub guided_routes: Vec<GuidedRoute>,
    #[serde(default)]
    pub materials: Vec<MaterialDefinition>,
    #[serde(default)]
    pub material_assignments: Vec<MaterialAssignment>,
    #[serde(default)]
    pub scene_environment: SceneEnvironment,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetRecord {
    #[serde(with = "contract_uuid")]
    pub id: Uuid,
    pub sha256: String,
    pub relative_path: String,
    pub media_type: String,
    pub size: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectSnapshot {
    pub schema_version: u32,
    pub sequence: u64,
    pub checkpoint_sequence: u64,
    pub project: SpatialProject,
    pub assets: Vec<AssetRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectSnapshotWire {
    schema_version: u32,
    sequence: u64,
    checkpoint_sequence: u64,
    project: SpatialProject,
    assets: Vec<AssetRecord>,
}

impl<'de> Deserialize<'de> for ProjectSnapshot {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = Value::deserialize(deserializer)?;
        let schema_version = value
            .as_object()
            .and_then(|source| source.get("schemaVersion"))
            .and_then(Value::as_u64)
            .ok_or_else(|| D::Error::custom("invalid schemaVersion"))?;
        if schema_version == 3 {
            require_exact_keys::<D::Error>(
                &value,
                &[
                    "schemaVersion",
                    "sequence",
                    "checkpointSequence",
                    "project",
                    "assets",
                ],
            )?;
            let project = value
                .as_object()
                .and_then(|source| source.get("project"))
                .ok_or_else(|| D::Error::custom("missing project"))?;
            require_exact_keys::<D::Error>(
                project,
                &[
                    "id",
                    "name",
                    "tags",
                    "profile",
                    "floors",
                    "entities",
                    "vendors",
                    "productContents",
                    "mediaAssets",
                    "routeNetworks",
                    "themes",
                    "cameraShots",
                    "storySequences",
                    "planReferences",
                    "openings",
                    "guidedRoutes",
                    "materials",
                    "materialAssignments",
                    "sceneEnvironment",
                ],
            )?;
            let project = project
                .as_object()
                .ok_or_else(|| D::Error::custom("project must be an object"))?;
            let floors = project
                .get("floors")
                .and_then(Value::as_array)
                .ok_or_else(|| D::Error::custom("floors must be an array"))?;
            for floor in floors {
                require_exact_keys::<D::Error>(floor, &["id", "name", "tags", "layers"])?;
                let layers = floor
                    .as_object()
                    .and_then(|source| source.get("layers"))
                    .and_then(Value::as_array)
                    .ok_or_else(|| D::Error::custom("layers must be an array"))?;
                for layer in layers {
                    require_exact_keys::<D::Error>(
                        layer,
                        &["id", "name", "tags", "visible", "locked"],
                    )?;
                }
            }
            let assets = value
                .as_object()
                .and_then(|source| source.get("assets"))
                .and_then(Value::as_array)
                .ok_or_else(|| D::Error::custom("assets must be an array"))?;
            for asset in assets {
                require_exact_keys::<D::Error>(
                    asset,
                    &["id", "sha256", "relativePath", "mediaType", "size"],
                )?;
            }
        }
        let wire: ProjectSnapshotWire = serde_json::from_value(value).map_err(D::Error::custom)?;
        let snapshot = Self {
            schema_version: wire.schema_version,
            sequence: wire.sequence,
            checkpoint_sequence: wire.checkpoint_sequence,
            project: wire.project,
            assets: wire.assets,
        };
        snapshot.validate().map_err(D::Error::custom)?;
        Ok(snapshot)
    }
}

fn require_exact_keys<E: serde::de::Error>(value: &Value, expected: &[&str]) -> Result<(), E> {
    let source = value
        .as_object()
        .ok_or_else(|| E::custom("expected an object"))?;
    if source.len() != expected.len() || !expected.iter().all(|key| source.contains_key(*key)) {
        return Err(E::custom("object keys do not match schema v3"));
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

fn deserialize_present_record_index<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    u64::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(transparent)]
pub struct NullableRecord<T>(pub Option<T>);

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordChange<T> {
    pub id: String,
    pub before: NullableRecord<T>,
    pub after: NullableRecord<T>,
    #[serde(
        default,
        deserialize_with = "deserialize_present_record_index",
        skip_serializing_if = "Option::is_none"
    )]
    pub index: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "collection", deny_unknown_fields)]
pub enum SnapshotRecordsPatch {
    #[serde(rename = "entities")]
    Entities { changes: Vec<RecordChange<Value>> },
    #[serde(rename = "assets")]
    Assets {
        changes: Vec<RecordChange<AssetRecord>>,
    },
    #[serde(rename = "planReferences")]
    PlanReferences {
        changes: Vec<RecordChange<PlanReference>>,
    },
    #[serde(rename = "openings")]
    Openings { changes: Vec<RecordChange<Opening>> },
    #[serde(rename = "productContents")]
    ProductContents {
        changes: Vec<RecordChange<ProductContent>>,
    },
    #[serde(rename = "mediaAssets")]
    MediaAssets {
        changes: Vec<RecordChange<MediaAsset>>,
    },
    #[serde(rename = "routeNetworks")]
    RouteNetworks {
        changes: Vec<RecordChange<RouteNetwork>>,
    },
    #[serde(rename = "guidedRoutes")]
    GuidedRoutes {
        changes: Vec<RecordChange<GuidedRoute>>,
    },
    #[serde(rename = "materials")]
    Materials {
        changes: Vec<RecordChange<MaterialDefinition>>,
    },
    #[serde(rename = "materialAssignments")]
    MaterialAssignments {
        changes: Vec<RecordChange<MaterialAssignment>>,
    },
}

fn changes_have_inverse_values<T: PartialEq>(
    payload: &[RecordChange<T>],
    inverse: &[RecordChange<T>],
    exact_index: bool,
) -> bool {
    payload.len() == inverse.len()
        && payload.iter().rev().zip(inverse).all(|(change, reversed)| {
            change.id == reversed.id
                && change.before == reversed.after
                && change.after == reversed.before
                && if exact_index {
                    change.index == reversed.index
                } else {
                    change.index.is_none()
                        || reversed.index.is_none()
                        || change.index == reversed.index
                }
        })
}

impl SnapshotRecordsPatch {
    pub fn has_inverse_values(&self, inverse: &Self) -> bool {
        self.inverse_matches(inverse, false)
    }

    pub(crate) fn has_exact_inverse(&self, inverse: &Self) -> bool {
        self.inverse_matches(inverse, true)
    }

    fn inverse_matches(&self, inverse: &Self, exact_index: bool) -> bool {
        match (self, inverse) {
            (Self::Entities { changes }, Self::Entities { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::Assets { changes }, Self::Assets { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::PlanReferences { changes }, Self::PlanReferences { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::Openings { changes }, Self::Openings { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::ProductContents { changes }, Self::ProductContents { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::MediaAssets { changes }, Self::MediaAssets { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::RouteNetworks { changes }, Self::RouteNetworks { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::GuidedRoutes { changes }, Self::GuidedRoutes { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (Self::Materials { changes }, Self::Materials { changes: reversed }) => {
                changes_have_inverse_values(changes, reversed, exact_index)
            }
            (
                Self::MaterialAssignments { changes },
                Self::MaterialAssignments { changes: reversed },
            ) => changes_have_inverse_values(changes, reversed, exact_index),
            _ => false,
        }
    }
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

        let mut identities = BTreeSet::from([self.project.id]);
        let mut floor_ids = BTreeSet::new();
        let mut asset_ids = BTreeSet::new();
        let mut layers_by_floor = BTreeMap::new();
        for floor in &self.project.floors {
            if !valid_uuid(&floor.id)
                || floor.name.trim().is_empty()
                || !identities.insert(floor.id)
                || !floor_ids.insert(floor.id)
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            if self.schema_version == 1 && !floor.layers.is_empty() {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            let mut layer_ids = BTreeSet::new();
            for layer in &floor.layers {
                if !valid_uuid(&layer.id)
                    || layer.name.trim().is_empty()
                    || !identities.insert(layer.id)
                    || !layer_ids.insert(layer.id)
                {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
            }
            layers_by_floor.insert(floor.id, layer_ids);
        }

        for asset in &self.assets {
            if !valid_uuid(&asset.id)
                || asset.sha256.len() != 64
                || !asset
                    .sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
                || asset.size > TYPESCRIPT_MAX_SAFE_INTEGER
                || !identities.insert(asset.id)
                || !asset_ids.insert(asset.id)
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            if self.schema_version == 3 {
                validate_canonical_asset(asset)?;
            } else if asset.media_type.trim().is_empty()
                || validate_relative_resource_path(&asset.relative_path).is_err()
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }

        let deferred_collections = [
            &self.project.entities,
            &self.project.vendors,
            &self.project.themes,
            &self.project.camera_shots,
            &self.project.story_sequences,
        ];
        if self.schema_version == 1
            && (deferred_collections
                .iter()
                .any(|collection| !collection.is_empty())
                || !self.project.product_contents.is_empty()
                || !self.project.media_assets.is_empty()
                || !self.project.route_networks.is_empty())
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        if self.schema_version < 3
            && (!self.project.plan_references.is_empty()
                || !self.project.openings.is_empty()
                || !self.project.guided_routes.is_empty()
                || !self.project.materials.is_empty()
                || !self.project.material_assignments.is_empty()
                || self.project.scene_environment != SceneEnvironment::default())
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        for collection in deferred_collections {
            validate_json_collection(collection)?;
        }
        validate_typed_collection(&self.project.product_contents)?;
        validate_typed_collection(&self.project.media_assets)?;
        validate_typed_collection(&self.project.route_networks)?;

        let mut entity_types = BTreeMap::new();
        let mut entity_geometries = BTreeMap::new();
        let mut wall_geometries = Vec::new();
        let mut product_target_ids = BTreeSet::new();
        let mut product_hotspot_ids = BTreeSet::new();
        for entity in &self.project.entities {
            let source = entity
                .as_object()
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let (id, _) = json_record_base(source, &mut identities)?;
            let entity_type = source
                .get("type")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let floor_id = json_uuid(source, "floorId")?;
            let layer_id = json_uuid(source, "layerId")?;
            if !floor_ids.contains(&floor_id)
                || !layers_by_floor
                    .get(&floor_id)
                    .is_some_and(|layers| layers.contains(&layer_id))
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            let geometry = match entity_type {
                "boundary" | "zone" => {
                    EntityReferenceGeometry::Closed(json_array_len(source, "polygon")?)
                }
                "space-unit" => {
                    EntityReferenceGeometry::Closed(json_array_len(source, "footprint")?)
                }
                "wall" => EntityReferenceGeometry::Open(json_array_len(source, "centerLine")?),
                _ => EntityReferenceGeometry::OriginOnly,
            };
            if entity_type == "wall" {
                wall_geometries.push(wall_geometry_from_entity(source)?);
            }
            if entity_type == "fixture" {
                product_target_ids.insert(id);
            } else if entity_type == "poi"
                && source.get("kind").and_then(Value::as_str) == Some("product-hotspot")
            {
                product_target_ids.insert(id);
                product_hotspot_ids.insert(id);
            }
            entity_types.insert(id, entity_type.to_owned());
            entity_geometries.insert(id, geometry);
        }
        for entity in &self.project.entities {
            let source = entity
                .as_object()
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            if source.get("type").and_then(Value::as_str) == Some("dimension") {
                validate_dimension_anchor(
                    source
                        .get("start")
                        .ok_or(ProjectIoError::InvalidProjectStructure)?,
                    &entity_geometries,
                )?;
                validate_dimension_anchor(
                    source
                        .get("end")
                        .ok_or(ProjectIoError::InvalidProjectStructure)?,
                    &entity_geometries,
                )?;
            }
        }

        let _vendor_ids = register_json_record_ids(&self.project.vendors, &mut identities)?;
        for content in &self.project.product_contents {
            validate_record(content.id, &content.name, &mut identities)?;
        }
        let mut media_asset_ids = BTreeSet::new();
        for media_asset in &self.project.media_assets {
            validate_record(media_asset.id, &media_asset.name, &mut identities)?;
            media_asset_ids.insert(media_asset.id);
        }
        let route_nodes = register_route_networks(
            &self.project.route_networks,
            &floor_ids,
            self.schema_version == 3,
            &mut identities,
        )?;
        let _theme_ids = register_json_record_ids(&self.project.themes, &mut identities)?;
        let camera_shot_ids =
            register_json_record_ids(&self.project.camera_shots, &mut identities)?;
        let _story_sequence_ids =
            register_json_record_ids(&self.project.story_sequences, &mut identities)?;

        let entity_ids = entity_types.keys().copied().collect();
        let space_unit_ids = entity_types
            .iter()
            .filter_map(|(id, entity_type)| (entity_type == "space-unit").then_some(*id))
            .collect();
        validate_vendor_references(&self.project.vendors, &space_unit_ids)?;
        validate_product_references(
            &self.project.product_contents,
            &entity_ids,
            &product_target_ids,
            &product_hotspot_ids,
            &media_asset_ids,
            self.schema_version == 3,
        )?;
        let assets_by_id: BTreeMap<_, _> =
            self.assets.iter().map(|asset| (asset.id, asset)).collect();
        validate_media_asset_references(
            &self.project.media_assets,
            &assets_by_id,
            self.schema_version == 3,
        )?;
        validate_story_references(&self.project.story_sequences, &camera_shot_ids)?;

        if self.schema_version == 3 {
            for reference in &self.project.plan_references {
                validate_record(reference.id, &reference.name, &mut identities)?;
                if !floor_ids.contains(&reference.floor_id)
                    || !layers_by_floor
                        .get(&reference.floor_id)
                        .is_some_and(|layers| layers.contains(&reference.layer_id))
                    || !assets_by_id
                        .get(&reference.asset_id)
                        .is_some_and(|asset| is_plan_media(&asset.media_type))
                {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
                validate_plan_reference(reference)?;
            }

            for opening in &self.project.openings {
                validate_record(opening.id, &opening.name, &mut identities)?;
                if entity_types.get(&opening.wall_id).map(String::as_str) != Some("wall")
                    || !finite_non_negative(opening.distance_along_wall)
                    || !finite_positive(opening.width)
                    || !finite_positive(opening.height)
                    || !finite_non_negative(opening.sill_height)
                {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
            }

            if !validate_opening_geometry(&wall_geometries, &self.project.openings).is_empty() {
                return Err(ProjectIoError::InvalidProjectStructure);
            }

            for route in &self.project.guided_routes {
                validate_record(route.id, &route.name, &mut identities)?;
                let nodes = route_nodes
                    .get(&route.route_network_id)
                    .ok_or(ProjectIoError::InvalidProjectStructure)?;
                if route.stop_node_ids.len() < 2 {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
                let mut route_floor = None;
                let mut previous_node_id = None;
                for node_id in &route.stop_node_ids {
                    let floor = nodes
                        .get(node_id)
                        .ok_or(ProjectIoError::InvalidProjectStructure)?;
                    if route_floor.is_some_and(|candidate| candidate != *floor)
                        || previous_node_id == Some(*node_id)
                    {
                        return Err(ProjectIoError::InvalidProjectStructure);
                    }
                    route_floor = Some(*floor);
                    previous_node_id = Some(*node_id);
                }
            }

            let mut material_ids = BTreeSet::new();
            for material in &self.project.materials {
                validate_record(material.id, &material.name, &mut identities)?;
                material_ids.insert(material.id);
                if !valid_color(&material.base_color)
                    || !bounded(material.roughness, 0.0, 1.0)
                    || !bounded(material.metalness, 0.0, 1.0)
                    || !finite_positive(material.opacity)
                    || material.opacity > 1.0
                    || material.asset_id.is_some_and(|id| {
                        !assets_by_id
                            .get(&id)
                            .is_some_and(|asset| is_plan_media(&asset.media_type))
                    })
                {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
            }

            let mut assigned_targets = BTreeSet::new();
            for assignment in &self.project.material_assignments {
                validate_record(assignment.id, &assignment.name, &mut identities)?;
                let entity_type = entity_types.get(&assignment.target_id).map(String::as_str);
                let valid_target = match assignment.target_kind {
                    MaterialTargetKind::SpaceFloor => {
                        matches!(entity_type, Some("space-unit" | "zone"))
                    }
                    MaterialTargetKind::Wall => entity_type == Some("wall"),
                    MaterialTargetKind::Fixture => entity_type == Some("fixture"),
                };
                if !material_ids.contains(&assignment.material_id)
                    || !valid_target
                    || !assigned_targets.insert((assignment.target_kind, assignment.target_id))
                {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
            }
            validate_scene_environment(&self.project.scene_environment)?;
        }
        Ok(())
    }
}

fn validate_record(
    id: Uuid,
    name: &str,
    identities: &mut BTreeSet<Uuid>,
) -> Result<(), ProjectIoError> {
    if !valid_uuid(&id) || name.trim().is_empty() || !identities.insert(id) {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(())
}

fn json_record_base<'a>(
    source: &'a serde_json::Map<String, Value>,
    identities: &mut BTreeSet<Uuid>,
) -> Result<(Uuid, &'a str), ProjectIoError> {
    let id = json_uuid(source, "id")?;
    let name = source
        .get("name")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    let tags = source
        .get("tags")
        .and_then(Value::as_array)
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    if tags.iter().any(|tag| !tag.is_string()) || !identities.insert(id) {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok((id, name))
}

fn json_uuid(source: &serde_json::Map<String, Value>, key: &str) -> Result<Uuid, ProjectIoError> {
    source
        .get(key)
        .and_then(Value::as_str)
        .ok_or(ProjectIoError::InvalidProjectStructure)
        .and_then(parse_contract_uuid)
}

#[derive(Clone, Copy)]
enum EntityReferenceGeometry {
    OriginOnly,
    Closed(usize),
    Open(usize),
}

fn json_array_len(
    source: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<usize, ProjectIoError> {
    source
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::len)
        .ok_or(ProjectIoError::InvalidProjectStructure)
}

fn validate_dimension_anchor(
    value: &Value,
    entities: &BTreeMap<Uuid, EntityReferenceGeometry>,
) -> Result<(), ProjectIoError> {
    let source = value
        .as_object()
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    match source.get("kind").and_then(Value::as_str) {
        Some("point") => {
            let point = source
                .get("point")
                .and_then(Value::as_object)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let x = point
                .get("x")
                .and_then(Value::as_f64)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let y = point
                .get("y")
                .and_then(Value::as_f64)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            if source.len() != 2 || point.len() != 2 || !x.is_finite() || !y.is_finite() {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        Some("entity") => {
            let entity_id = json_uuid(source, "entityId")?;
            let geometry = entities
                .get(&entity_id)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let locator = source
                .get("locator")
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            if source.len() != 3 || !valid_dimension_locator(locator, *geometry) {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        _ => return Err(ProjectIoError::InvalidProjectStructure),
    }
    Ok(())
}

fn valid_dimension_locator(locator: &Value, geometry: EntityReferenceGeometry) -> bool {
    if locator.as_str() == Some("origin") {
        return true;
    }
    let source = match locator.as_object() {
        Some(source) => source,
        None => return false,
    };
    match geometry {
        EntityReferenceGeometry::OriginOnly => false,
        EntityReferenceGeometry::Closed(points) => valid_index_locator(source, points, points),
        EntityReferenceGeometry::Open(points) => {
            valid_index_locator(source, points, points.saturating_sub(1))
        }
    }
}

fn valid_index_locator(
    source: &serde_json::Map<String, Value>,
    vertex_count: usize,
    segment_count: usize,
) -> bool {
    if source.len() == 1 {
        return source
            .get("vertex")
            .and_then(Value::as_u64)
            .and_then(|index| usize::try_from(index).ok())
            .is_some_and(|index| index < vertex_count);
    }
    if source.len() == 2 {
        let segment = source
            .get("segment")
            .and_then(Value::as_u64)
            .and_then(|index| usize::try_from(index).ok());
        let t = source.get("t").and_then(Value::as_f64);
        return segment.is_some_and(|index| index < segment_count)
            && t.is_some_and(|value| bounded(value, 0.0, 1.0));
    }
    false
}

fn json_uuid_array(
    source: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<Vec<Uuid>, ProjectIoError> {
    source
        .get(key)
        .and_then(Value::as_array)
        .ok_or(ProjectIoError::InvalidProjectStructure)?
        .iter()
        .map(|value| {
            value
                .as_str()
                .ok_or(ProjectIoError::InvalidProjectStructure)
                .and_then(parse_contract_uuid)
        })
        .collect()
}

fn validate_vendor_references(
    values: &[Value],
    space_unit_ids: &BTreeSet<Uuid>,
) -> Result<(), ProjectIoError> {
    for value in values {
        let source = value
            .as_object()
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        match source.get("spaceUnitId") {
            Some(Value::Null) => {}
            Some(value) => {
                let id = value
                    .as_str()
                    .ok_or(ProjectIoError::InvalidProjectStructure)
                    .and_then(parse_contract_uuid)?;
                if !space_unit_ids.contains(&id) {
                    return Err(ProjectIoError::InvalidProjectStructure);
                }
            }
            None => return Err(ProjectIoError::InvalidProjectStructure),
        }
    }
    Ok(())
}

fn validate_product_references(
    values: &[ProductContent],
    entity_ids: &BTreeSet<Uuid>,
    product_target_ids: &BTreeSet<Uuid>,
    product_hotspot_ids: &BTreeSet<Uuid>,
    media_asset_ids: &BTreeSet<Uuid>,
    strict_v3: bool,
) -> Result<(), ProjectIoError> {
    let mut content_target_ids = BTreeSet::new();
    for value in values {
        if !entity_ids.contains(&value.target_entity_id)
            || (strict_v3 && !product_target_ids.contains(&value.target_entity_id))
            || (strict_v3 && !content_target_ids.insert(value.target_entity_id))
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let mut content_media_ids = BTreeSet::new();
        for media_asset_id in &value.media_asset_ids {
            if !media_asset_ids.contains(media_asset_id)
                || (strict_v3 && !content_media_ids.insert(*media_asset_id))
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
    }
    if strict_v3
        && product_hotspot_ids
            .iter()
            .any(|id| !content_target_ids.contains(id))
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(())
}

fn validate_media_asset_references(
    values: &[MediaAsset],
    assets_by_id: &BTreeMap<Uuid, &AssetRecord>,
    strict_v3: bool,
) -> Result<(), ProjectIoError> {
    for value in values {
        let asset = assets_by_id
            .get(&value.asset_id)
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        let matching_type = match value.kind {
            MediaAssetKind::Image => is_image_media(&asset.media_type),
            MediaAssetKind::Video => is_video_media(&asset.media_type),
        };
        if strict_v3 && !matching_type {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    Ok(())
}

fn validate_story_references(
    values: &[Value],
    camera_shot_ids: &BTreeSet<Uuid>,
) -> Result<(), ProjectIoError> {
    for value in values {
        let source = value
            .as_object()
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        if json_uuid_array(source, "cameraShotIds")?
            .iter()
            .any(|id| !camera_shot_ids.contains(id))
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    Ok(())
}

fn register_json_record_ids(
    values: &[Value],
    identities: &mut BTreeSet<Uuid>,
) -> Result<BTreeSet<Uuid>, ProjectIoError> {
    let mut ids = BTreeSet::new();
    for value in values {
        let source = value
            .as_object()
            .ok_or(ProjectIoError::InvalidProjectStructure)?;
        let (id, _) = json_record_base(source, identities)?;
        ids.insert(id);
    }
    Ok(ids)
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum RouteBucketAxis {
    Index(i64),
    Exact(u64),
}

fn route_bucket_axis(coordinate: f64) -> (RouteBucketAxis, Vec<RouteBucketAxis>) {
    let index = (coordinate / (ROUTE_GEOMETRY_EPSILON_MM * 2.0)).floor();
    if index.is_finite() && index.abs() <= TYPESCRIPT_MAX_SAFE_INTEGER as f64 {
        let index = index as i64;
        return (
            RouteBucketAxis::Index(index),
            vec![
                RouteBucketAxis::Index(index - 1),
                RouteBucketAxis::Index(index),
                RouteBucketAxis::Index(index + 1),
            ],
        );
    }
    let exact = RouteBucketAxis::Exact(if coordinate == 0.0 {
        0.0_f64.to_bits()
    } else {
        coordinate.to_bits()
    });
    (exact, vec![exact])
}

fn register_route_networks(
    values: &[RouteNetwork],
    floor_ids: &BTreeSet<Uuid>,
    strict_v3: bool,
    identities: &mut BTreeSet<Uuid>,
) -> Result<BTreeMap<Uuid, BTreeMap<Uuid, Uuid>>, ProjectIoError> {
    let mut result = BTreeMap::new();
    for network in values {
        validate_record(network.id, &network.name, identities)?;
        let mut network_nodes = BTreeMap::new();
        let mut node_positions = BTreeMap::new();
        let mut nodes_by_bucket: BTreeMap<(Uuid, RouteBucketAxis, RouteBucketAxis), Vec<Point2>> =
            BTreeMap::new();
        for node in &network.nodes {
            validate_record(node.id, &node.name, identities)?;
            if !floor_ids.contains(&node.floor_id)
                || !finite_point(node.position)
                || network_nodes.insert(node.id, node.floor_id).is_some()
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            if strict_v3 {
                let (home_x, neighbor_x) = route_bucket_axis(node.position.x);
                let (home_y, neighbor_y) = route_bucket_axis(node.position.y);
                for x in &neighbor_x {
                    for y in &neighbor_y {
                        if nodes_by_bucket
                            .get(&(node.floor_id, *x, *y))
                            .is_some_and(|candidates| {
                                candidates.iter().any(|prior| {
                                    (node.position.x - prior.x).hypot(node.position.y - prior.y)
                                        <= ROUTE_GEOMETRY_EPSILON_MM
                                })
                            })
                        {
                            return Err(ProjectIoError::InvalidProjectStructure);
                        }
                    }
                }
                nodes_by_bucket
                    .entry((node.floor_id, home_x, home_y))
                    .or_default()
                    .push(node.position);
            }
            node_positions.insert(node.id, node.position);
        }
        let mut directed_arcs = BTreeSet::new();
        for edge in &network.edges {
            validate_record(edge.id, &edge.name, identities)?;
            let from_floor = network_nodes
                .get(&edge.from)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let to_floor = network_nodes
                .get(&edge.to)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let from = node_positions
                .get(&edge.from)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let to = node_positions
                .get(&edge.to)
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let expected_distance = (to.x - from.x).hypot(to.y - from.y);
            if !finite_positive(edge.distance)
                || !finite_positive(edge.width)
                || !edge.weight.is_finite()
                || edge.weight < 1.0
                || (strict_v3
                    && (edge.from == edge.to
                        || from_floor != to_floor
                        || !expected_distance.is_finite()
                        || (edge.distance - expected_distance).abs() > ROUTE_GEOMETRY_EPSILON_MM
                        || !directed_arcs.insert((edge.from, edge.to))
                        || (edge.bidirectional && !directed_arcs.insert((edge.to, edge.from)))))
            {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
        }
        result.insert(network.id, network_nodes);
    }
    Ok(result)
}

fn validate_canonical_asset(asset: &AssetRecord) -> Result<(), ProjectIoError> {
    let (extension, maximum) =
        asset_policy(&asset.media_type).ok_or(ProjectIoError::InvalidProjectStructure)?;
    let expected = format!(
        "assets/sha256/{}/{}.{}",
        &asset.sha256[..2],
        asset.sha256,
        extension
    );
    if asset.relative_path != expected || asset.size > maximum {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(())
}

pub(crate) fn canonical_asset_path(sha256: &str, media_type: &str) -> Option<String> {
    let (extension, _) = asset_policy(media_type)?;
    Some(format!(
        "assets/sha256/{}/{}.{}",
        &sha256[..2],
        sha256,
        extension
    ))
}

fn asset_policy(media_type: &str) -> Option<(&'static str, u64)> {
    match media_type {
        "image/png" => Some(("png", 268_435_456)),
        "image/jpeg" => Some(("jpg", 268_435_456)),
        "image/svg+xml" => Some(("svg", 33_554_432)),
        "video/mp4" => Some(("mp4", 4_294_967_296)),
        "video/webm" => Some(("webm", 4_294_967_296)),
        _ => None,
    }
}

fn is_image_media(media_type: &str) -> bool {
    matches!(media_type, "image/png" | "image/jpeg" | "image/svg+xml")
}

fn is_video_media(media_type: &str) -> bool {
    matches!(media_type, "video/mp4" | "video/webm")
}

fn is_plan_media(media_type: &str) -> bool {
    is_image_media(media_type)
}

fn validate_plan_reference(reference: &PlanReference) -> Result<(), ProjectIoError> {
    let size = reference.intrinsic_size;
    if size.width == 0
        || size.height == 0
        || size.width > MAX_INTRINSIC_AXIS
        || size.height > MAX_INTRINSIC_AXIS
        || size.width > MAX_DECODED_PIXELS / size.height
        || !finite_point(reference.transform.translation)
        || !reference.transform.rotation.is_finite()
        || !finite_positive(reference.transform.scale.x)
        || !finite_positive(reference.transform.scale.y)
        || !bounded(reference.opacity, 0.0, 1.0)
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    if let Some(calibration) = reference.calibration {
        if !finite_point(calibration.source_point_a)
            || !finite_point(calibration.source_point_b)
            || calibration.source_point_a.x < 0.0
            || calibration.source_point_a.y < 0.0
            || calibration.source_point_b.x < 0.0
            || calibration.source_point_b.y < 0.0
            || calibration.source_point_a.x > size.width as f64
            || calibration.source_point_b.x > size.width as f64
            || calibration.source_point_a.y > size.height as f64
            || calibration.source_point_b.y > size.height as f64
            || calibration.source_point_a == calibration.source_point_b
            || !finite_positive(calibration.measured_distance_mm)
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
        let pixel_distance = (calibration.source_point_b.x - calibration.source_point_a.x)
            .hypot(calibration.source_point_b.y - calibration.source_point_a.y);
        let calibrated_scale = calibration.measured_distance_mm / pixel_distance;
        if !finite_positive(calibrated_scale)
            || reference.transform.scale.x != reference.transform.scale.y
            || reference.transform.scale.x != calibrated_scale
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    validate_plan_bounds(reference)
}

fn validate_plan_bounds(reference: &PlanReference) -> Result<(), ProjectIoError> {
    let transform = reference.transform;
    let cosine = transform.rotation.cos();
    let sine = transform.rotation.sin();
    let width = reference.intrinsic_size.width as f64;
    let height = reference.intrinsic_size.height as f64;
    for (x, y) in [(0.0, 0.0), (width, 0.0), (width, height), (0.0, height)] {
        let scaled_x = x * transform.scale.x;
        let scaled_y = y * transform.scale.y;
        let world_x = scaled_x * cosine - scaled_y * sine + transform.translation.x;
        let world_y = scaled_x * sine + scaled_y * cosine + transform.translation.y;
        if !world_x.is_finite()
            || !world_y.is_finite()
            || world_x.abs() > MAX_WORLD_COORDINATE_MM
            || world_y.abs() > MAX_WORLD_COORDINATE_MM
        {
            return Err(ProjectIoError::InvalidProjectStructure);
        }
    }
    Ok(())
}

pub(crate) fn validate_scene_environment(
    environment: &SceneEnvironment,
) -> Result<(), ProjectIoError> {
    if !valid_color(&environment.background_color)
        || !valid_color(&environment.ambient.color)
        || !valid_color(&environment.key.color)
        || !bounded(environment.ambient.intensity, 0.0, 4.0)
        || !bounded(environment.key.intensity, 0.0, 8.0)
        || !bounded(environment.shadow_softness, 0.0, 1.0)
        || environment
            .key
            .direction
            .iter()
            .any(|component| !bounded(*component, -100.0, 100.0))
        || environment
            .key
            .direction
            .iter()
            .all(|component| *component == 0.0)
    {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(())
}

fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}

fn finite_point(point: Point2) -> bool {
    point.x.is_finite() && point.y.is_finite()
}

fn finite_positive(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

fn finite_non_negative(value: f64) -> bool {
    value.is_finite() && value >= 0.0
}

fn bounded(value: f64, minimum: f64, maximum: f64) -> bool {
    value.is_finite() && value >= minimum && value <= maximum
}

fn validate_typed_collection<T: Serialize>(values: &[T]) -> Result<(), ProjectIoError> {
    let values = values
        .iter()
        .map(|value| {
            serde_json::to_value(value).map_err(|_| ProjectIoError::InvalidProjectStructure)
        })
        .collect::<Result<Vec<_>, _>>()?;
    validate_json_collection(&values)
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
            serde_json::from_str(r#"{ "nested": { "value": 9007199254740992.0 } }"#).unwrap(),
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

fn serialize_js_number<S: serde::Serializer>(
    value: &f64,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    if value.fract() == 0.0 && *value >= i64::MIN as f64 && *value <= i64::MAX as f64 {
        serializer.serialize_i64(*value as i64)
    } else {
        serializer.serialize_f64(*value)
    }
}

fn serialize_js_vector3<S: serde::Serializer>(
    values: &[f64; 3],
    serializer: S,
) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeSeq;
    let mut sequence = serializer.serialize_seq(Some(3))?;
    for value in values {
        if value.fract() == 0.0 && *value >= i64::MIN as f64 && *value <= i64::MAX as f64 {
            sequence.serialize_element(&(*value as i64))?;
        } else {
            sequence.serialize_element(value)?;
        }
    }
    sequence.end()
}

mod contract_uuid_vec {
    use super::{Uuid, contract_uuid_text};
    use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error as _};

    pub fn serialize<S: Serializer>(values: &[Uuid], serializer: S) -> Result<S::Ok, S::Error> {
        values
            .iter()
            .map(|value| value.hyphenated().to_string())
            .collect::<Vec<_>>()
            .serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<Uuid>, D::Error> {
        Vec::<String>::deserialize(deserializer)?
            .into_iter()
            .map(|value| {
                if !contract_uuid_text(&value) {
                    return Err(D::Error::custom("invalid project UUID"));
                }
                Uuid::parse_str(&value).map_err(|_| D::Error::custom("invalid project UUID"))
            })
            .collect()
    }
}

mod optional_contract_uuid {
    use super::{Uuid, contract_uuid_text};
    use serde::{Deserialize, Deserializer, Serializer, de::Error as _};

    pub fn serialize<S: Serializer>(
        value: &Option<Uuid>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.serialize_some(&value.map(|id| id.hyphenated().to_string()))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Uuid>, D::Error> {
        Option::<String>::deserialize(deserializer)?
            .map(|value| {
                if !contract_uuid_text(&value) {
                    return Err(D::Error::custom("invalid project UUID"));
                }
                Uuid::parse_str(&value).map_err(|_| D::Error::custom("invalid project UUID"))
            })
            .transpose()
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

#[cfg(test)]
#[path = "opening_geometry_contract_tests.rs"]
mod opening_geometry_contract_tests;
