use crate::{
    ProjectIoError,
    model::{Opening, OpeningKind, Point2, Transform2D, parse_contract_uuid},
};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use uuid::Uuid;

pub(crate) const GEOMETRY_EPSILON_MM: f64 = 1e-7;

const MAX_WORLD_COORDINATE_MM: f64 = 1_000_000_000.0;
const DEFAULT_WALL_HEIGHT_MM: f64 = 3000.0;
const MIN_ENDPOINT_CLEARANCE_MM: f64 = 1.0;
const MIN_OPENING_GAP_MM: f64 = 1.0;

#[derive(Clone, Debug)]
pub(crate) struct WallGeometry {
    pub(crate) id: Uuid,
    pub(crate) center_line: Vec<Point2>,
    pub(crate) thickness: f64,
    pub(crate) transform: Transform2D,
    pub(crate) height: Option<f64>,
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Clone, Copy, Debug)]
pub(crate) struct WallMetricSegment {
    pub(crate) segment_index: usize,
    pub(crate) start: Point2,
    pub(crate) end: Point2,
    pub(crate) tangent: Point2,
    pub(crate) length: f64,
    pub(crate) cumulative_start: f64,
    pub(crate) cumulative_end: f64,
    pub(crate) effective_thickness: f64,
}

#[cfg(test)]
#[derive(Clone, Copy, Debug)]
pub(crate) struct OpeningProjection {
    pub(crate) opening_id: Uuid,
    pub(crate) wall_id: Uuid,
    pub(crate) segment_index: usize,
    pub(crate) center: Point2,
    pub(crate) tangent: Point2,
    pub(crate) distance_along_segment: f64,
    pub(crate) effective_thickness: f64,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum OpeningGeometryIssueCode {
    WallNotFound,
    WallGeometryInvalid,
    SpanCrossesJoint,
    EndpointClearance,
    Overlap,
    HeightExceeded,
    DoorSillNonzero,
}

impl OpeningGeometryIssueCode {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::WallNotFound => "OPENING_WALL_NOT_FOUND",
            Self::WallGeometryInvalid => "OPENING_WALL_GEOMETRY_INVALID",
            Self::SpanCrossesJoint => "OPENING_SPAN_CROSSES_JOINT",
            Self::EndpointClearance => "OPENING_ENDPOINT_CLEARANCE",
            Self::Overlap => "OPENING_OVERLAP",
            Self::HeightExceeded => "OPENING_HEIGHT_EXCEEDED",
            Self::DoorSillNonzero => "OPENING_DOOR_SILL_NONZERO",
        }
    }
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Clone, Copy, Debug)]
pub(crate) struct OpeningGeometryIssue {
    pub(crate) code: OpeningGeometryIssueCode,
    pub(crate) opening_id: Uuid,
    pub(crate) wall_id: Uuid,
    pub(crate) related_opening_id: Option<Uuid>,
}

#[derive(Clone, Copy)]
struct OpeningInterval<'a> {
    opening: &'a Opening,
    start: f64,
    end: f64,
}

fn json_number(source: &Map<String, Value>, key: &str) -> Result<f64, ProjectIoError> {
    source
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or(ProjectIoError::InvalidProjectStructure)
}

fn json_point(value: &Value) -> Result<Point2, ProjectIoError> {
    let source = value
        .as_object()
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    Ok(Point2 {
        x: json_number(source, "x")?,
        y: json_number(source, "y")?,
    })
}

fn json_transform(value: &Value) -> Result<Transform2D, ProjectIoError> {
    let source = value
        .as_object()
        .ok_or(ProjectIoError::InvalidProjectStructure)?;
    let scale = json_point(
        source
            .get("scale")
            .ok_or(ProjectIoError::InvalidProjectStructure)?,
    )?;
    let transform = Transform2D {
        translation: json_point(
            source
                .get("translation")
                .ok_or(ProjectIoError::InvalidProjectStructure)?,
        )?,
        rotation: json_number(source, "rotation")?,
        scale,
    };
    if transform.scale.x <= 0.0 || transform.scale.y <= 0.0 {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    Ok(transform)
}

pub(crate) fn wall_geometry_from_entity(
    source: &Map<String, Value>,
) -> Result<WallGeometry, ProjectIoError> {
    let id = source
        .get("id")
        .and_then(Value::as_str)
        .ok_or(ProjectIoError::InvalidProjectStructure)
        .and_then(parse_contract_uuid)?;
    let center_line: Vec<_> = source
        .get("centerLine")
        .and_then(Value::as_array)
        .ok_or(ProjectIoError::InvalidProjectStructure)?
        .iter()
        .map(json_point)
        .collect::<Result<_, _>>()?;
    if center_line.len() < 2 || !center_line.windows(2).any(|points| points[0] != points[1]) {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    let thickness = json_number(source, "thickness")?;
    if thickness <= 0.0 {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    let transform = json_transform(
        source
            .get("transform")
            .ok_or(ProjectIoError::InvalidProjectStructure)?,
    )?;
    if source.get("locked").and_then(Value::as_bool).is_none() {
        return Err(ProjectIoError::InvalidProjectStructure);
    }
    let height = match source.get("spatial3D") {
        None => None,
        Some(value) => {
            let spatial = value
                .as_object()
                .ok_or(ProjectIoError::InvalidProjectStructure)?;
            let elevation = json_number(spatial, "elevation")?;
            let height = json_number(spatial, "height")?;
            if !elevation.is_finite() || height <= 0.0 {
                return Err(ProjectIoError::InvalidProjectStructure);
            }
            Some(height)
        }
    };
    Ok(WallGeometry {
        id,
        center_line,
        thickness,
        transform,
        height,
    })
}

fn transform_point(wall: &WallGeometry, point: Point2) -> Option<Point2> {
    let scaled_x = point.x * wall.transform.scale.x;
    let scaled_y = point.y * wall.transform.scale.y;
    let cosine = wall.transform.rotation.cos();
    let sine = wall.transform.rotation.sin();
    let x = scaled_x * cosine - scaled_y * sine + wall.transform.translation.x;
    let y = scaled_x * sine + scaled_y * cosine + wall.transform.translation.y;
    (x.is_finite()
        && y.is_finite()
        && x.abs() <= MAX_WORLD_COORDINATE_MM
        && y.abs() <= MAX_WORLD_COORDINATE_MM)
        .then_some(Point2 { x, y })
}

pub(crate) fn wall_metric_segments(wall: &WallGeometry) -> Vec<WallMetricSegment> {
    let world_points: Option<Vec<_>> = wall
        .center_line
        .iter()
        .copied()
        .map(|point| transform_point(wall, point))
        .collect();
    let Some(world_points) = world_points else {
        return Vec::new();
    };
    let mut segments = Vec::new();
    let mut cumulative_length = 0.0;
    for segment_index in 0..wall.center_line.len() - 1 {
        let local_start = wall.center_line[segment_index];
        let local_end = wall.center_line[segment_index + 1];
        let local_delta_x = local_end.x - local_start.x;
        let local_delta_y = local_end.y - local_start.y;
        let local_length = local_delta_x.hypot(local_delta_y);
        if !local_length.is_finite() || local_length == 0.0 {
            continue;
        }
        let start = world_points[segment_index];
        let end = world_points[segment_index + 1];
        let delta_x = end.x - start.x;
        let delta_y = end.y - start.y;
        let length = delta_x.hypot(delta_y);
        if !length.is_finite() || length == 0.0 {
            continue;
        }
        let tangent_scale = (local_delta_x * wall.transform.scale.x)
            .hypot(local_delta_y * wall.transform.scale.y)
            / local_length;
        let normal_scale = wall.transform.scale.x * wall.transform.scale.y / tangent_scale;
        let effective_thickness = wall.thickness * normal_scale;
        if !effective_thickness.is_finite() || effective_thickness <= 0.0 {
            return Vec::new();
        }
        segments.push(WallMetricSegment {
            segment_index,
            start,
            end,
            tangent: Point2 {
                x: delta_x / length,
                y: delta_y / length,
            },
            length,
            cumulative_start: cumulative_length,
            cumulative_end: cumulative_length + length,
            effective_thickness,
        });
        cumulative_length += length;
    }
    segments
}

#[cfg(test)]
pub(crate) fn effective_wall_thickness(wall: &WallGeometry, segment_index: usize) -> Option<f64> {
    wall_metric_segments(wall)
        .into_iter()
        .find(|segment| segment.segment_index == segment_index)
        .map(|segment| segment.effective_thickness)
}

#[cfg(test)]
pub(crate) fn locate_opening(wall: &WallGeometry, opening: &Opening) -> Option<OpeningProjection> {
    if opening.wall_id != wall.id || !opening.distance_along_wall.is_finite() {
        return None;
    }
    let segment = wall_metric_segments(wall).into_iter().find(|segment| {
        opening.distance_along_wall >= segment.cumulative_start - GEOMETRY_EPSILON_MM
            && opening.distance_along_wall <= segment.cumulative_end + GEOMETRY_EPSILON_MM
    })?;
    let distance_along_segment = opening.distance_along_wall - segment.cumulative_start;
    Some(OpeningProjection {
        opening_id: opening.id,
        wall_id: wall.id,
        segment_index: segment.segment_index,
        center: Point2 {
            x: segment.start.x + segment.tangent.x * distance_along_segment,
            y: segment.start.y + segment.tangent.y * distance_along_segment,
        },
        tangent: segment.tangent,
        distance_along_segment,
        effective_thickness: segment.effective_thickness,
    })
}

fn issue(
    code: OpeningGeometryIssueCode,
    opening: &Opening,
    related_opening_id: Option<Uuid>,
) -> OpeningGeometryIssue {
    OpeningGeometryIssue {
        code,
        opening_id: opening.id,
        wall_id: opening.wall_id,
        related_opening_id,
    }
}

pub(crate) fn validate_opening_geometry(
    walls: &[WallGeometry],
    openings: &[Opening],
) -> Vec<OpeningGeometryIssue> {
    let walls_by_id: BTreeMap<_, _> = walls.iter().map(|wall| (wall.id, wall)).collect();
    let mut intervals_by_wall: BTreeMap<Uuid, Vec<OpeningInterval<'_>>> = BTreeMap::new();
    let mut issues = Vec::new();

    for opening in openings {
        let Some(wall) = walls_by_id.get(&opening.wall_id).copied() else {
            issues.push(issue(OpeningGeometryIssueCode::WallNotFound, opening, None));
            continue;
        };
        let segments = wall_metric_segments(wall);
        if segments.is_empty() {
            issues.push(issue(
                OpeningGeometryIssueCode::WallGeometryInvalid,
                opening,
                None,
            ));
            continue;
        }
        let interval_start = opening.distance_along_wall - opening.width / 2.0;
        let interval_end = opening.distance_along_wall + opening.width / 2.0;
        let carrying_segment = segments.iter().find(|segment| {
            interval_start >= segment.cumulative_start - GEOMETRY_EPSILON_MM
                && interval_end <= segment.cumulative_end + GEOMETRY_EPSILON_MM
        });
        if let Some(segment) = carrying_segment {
            let clearance = MIN_ENDPOINT_CLEARANCE_MM.max(segment.effective_thickness / 2.0);
            let start_clearance = interval_start - segment.cumulative_start;
            let end_clearance = segment.cumulative_end - interval_end;
            if start_clearance < clearance - GEOMETRY_EPSILON_MM
                || end_clearance < clearance - GEOMETRY_EPSILON_MM
            {
                issues.push(issue(
                    OpeningGeometryIssueCode::EndpointClearance,
                    opening,
                    None,
                ));
            }
        } else {
            let total_length = segments.last().unwrap().cumulative_end;
            let code = if interval_start >= -GEOMETRY_EPSILON_MM
                && interval_end <= total_length + GEOMETRY_EPSILON_MM
            {
                OpeningGeometryIssueCode::SpanCrossesJoint
            } else {
                OpeningGeometryIssueCode::EndpointClearance
            };
            issues.push(issue(code, opening, None));
        }

        if opening.kind == OpeningKind::Door && opening.sill_height.abs() > GEOMETRY_EPSILON_MM {
            issues.push(issue(
                OpeningGeometryIssueCode::DoorSillNonzero,
                opening,
                None,
            ));
        }
        let wall_height = wall.height.unwrap_or(DEFAULT_WALL_HEIGHT_MM);
        let opening_top = match opening.kind {
            OpeningKind::Door => opening.height,
            OpeningKind::Window => opening.sill_height + opening.height,
        };
        if opening_top > wall_height + GEOMETRY_EPSILON_MM {
            issues.push(issue(
                OpeningGeometryIssueCode::HeightExceeded,
                opening,
                None,
            ));
        }
        intervals_by_wall
            .entry(wall.id)
            .or_default()
            .push(OpeningInterval {
                opening,
                start: interval_start,
                end: interval_end,
            });
    }

    for intervals in intervals_by_wall.values_mut() {
        intervals.sort_by(|left, right| {
            left.start
                .total_cmp(&right.start)
                .then_with(|| left.end.total_cmp(&right.end))
                .then_with(|| left.opening.id.cmp(&right.opening.id))
        });
        for left_index in 0..intervals.len() {
            let left = intervals[left_index];
            for right in &intervals[left_index + 1..] {
                let gap = right.start - left.end;
                if gap >= MIN_OPENING_GAP_MM - GEOMETRY_EPSILON_MM {
                    break;
                }
                issues.push(issue(
                    OpeningGeometryIssueCode::Overlap,
                    left.opening,
                    Some(right.opening.id),
                ));
                issues.push(issue(
                    OpeningGeometryIssueCode::Overlap,
                    right.opening,
                    Some(left.opening.id),
                ));
            }
        }
    }

    issues.sort_by(|left, right| {
        left.opening_id
            .cmp(&right.opening_id)
            .then_with(|| left.code.as_str().cmp(right.code.as_str()))
            .then_with(|| left.related_opening_id.cmp(&right.related_opening_id))
    });
    issues
}
