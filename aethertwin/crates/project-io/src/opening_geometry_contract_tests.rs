use super::*;
use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractVectors {
    geometry_epsilon_mm: f64,
    metric_cases: Vec<MetricCase>,
    projection_cases: Vec<ProjectionCase>,
    validation_cases: Vec<ValidationCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetricCase {
    name: String,
    wall: VectorWall,
    expected_segments: Vec<ExpectedSegment>,
}

#[derive(Deserialize)]
struct ProjectionCase {
    name: String,
    wall: VectorWall,
    opening: VectorOpening,
    expected: ExpectedProjection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidationCase {
    name: String,
    walls: Vec<VectorWall>,
    openings: Vec<VectorOpening>,
    expected_issues: Vec<ExpectedIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VectorWall {
    id: String,
    center_line: Vec<Point2>,
    thickness: f64,
    height: Option<f64>,
    transform: Transform2D,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VectorOpening {
    id: String,
    wall_id: String,
    kind: OpeningKind,
    distance_along_wall: f64,
    width: f64,
    height: f64,
    sill_height: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedSegment {
    segment_index: usize,
    start: Point2,
    end: Point2,
    tangent: Point2,
    length: f64,
    cumulative_start: f64,
    cumulative_end: f64,
    effective_thickness: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedProjection {
    segment_index: usize,
    center: Point2,
    tangent: Point2,
    distance_along_segment: f64,
    effective_thickness: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedIssue {
    code: String,
    opening_id: String,
    wall_id: String,
    related_opening_id: Option<String>,
}

fn vectors() -> ContractVectors {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/contracts/opening-geometry.v1.json");
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}

fn wall(input: VectorWall) -> WallGeometry {
    WallGeometry {
        id: parse_contract_uuid(&input.id).unwrap(),
        center_line: input.center_line,
        thickness: input.thickness,
        transform: input.transform,
        height: input.height,
    }
}

fn opening(input: VectorOpening) -> Opening {
    Opening {
        id: parse_contract_uuid(&input.id).unwrap(),
        name: input.id,
        tags: Vec::new(),
        wall_id: parse_contract_uuid(&input.wall_id).unwrap(),
        kind: input.kind,
        distance_along_wall: input.distance_along_wall,
        width: input.width,
        height: input.height,
        sill_height: input.sill_height,
    }
}

fn assert_number(label: &str, actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() <= GEOMETRY_EPSILON_MM,
        "{label}: expected {expected}, got {actual}"
    );
}

fn assert_point(label: &str, actual: Point2, expected: Point2) {
    assert_number(&format!("{label}.x"), actual.x, expected.x);
    assert_number(&format!("{label}.y"), actual.y, expected.y);
}

#[test]
fn shared_opening_geometry_metrics_match_typescript_vectors() {
    let vectors = vectors();
    assert_eq!(vectors.geometry_epsilon_mm, GEOMETRY_EPSILON_MM);

    for case in vectors.metric_cases {
        let wall = wall(case.wall);
        let segments = wall_metric_segments(&wall);
        assert_eq!(
            segments.len(),
            case.expected_segments.len(),
            "{} segment count",
            case.name
        );
        for (actual, expected) in segments.iter().zip(case.expected_segments) {
            assert_eq!(
                actual.segment_index, expected.segment_index,
                "{} segment index",
                case.name
            );
            assert_point(
                &format!("{}.start", case.name),
                actual.start,
                expected.start,
            );
            assert_point(&format!("{}.end", case.name), actual.end, expected.end);
            assert_point(
                &format!("{}.tangent", case.name),
                actual.tangent,
                expected.tangent,
            );
            assert_number(
                &format!("{}.length", case.name),
                actual.length,
                expected.length,
            );
            assert_number(
                &format!("{}.cumulativeStart", case.name),
                actual.cumulative_start,
                expected.cumulative_start,
            );
            assert_number(
                &format!("{}.cumulativeEnd", case.name),
                actual.cumulative_end,
                expected.cumulative_end,
            );
            assert_number(
                &format!("{}.effectiveThickness", case.name),
                actual.effective_thickness,
                expected.effective_thickness,
            );
            assert_number(
                &format!("{}.thicknessLookup", case.name),
                effective_wall_thickness(&wall, expected.segment_index).unwrap(),
                expected.effective_thickness,
            );
        }
    }
}

#[test]
fn shared_opening_geometry_projections_match_typescript_vectors() {
    for case in vectors().projection_cases {
        let wall = wall(case.wall);
        let opening = opening(case.opening);
        let actual = locate_opening(&wall, &opening)
            .unwrap_or_else(|| panic!("{} did not project", case.name));
        assert_eq!(actual.opening_id, opening.id, "{} opening id", case.name);
        assert_eq!(actual.wall_id, wall.id, "{} wall id", case.name);
        assert_eq!(
            actual.segment_index, case.expected.segment_index,
            "{}",
            case.name
        );
        assert_point(
            &format!("{}.center", case.name),
            actual.center,
            case.expected.center,
        );
        assert_point(
            &format!("{}.tangent", case.name),
            actual.tangent,
            case.expected.tangent,
        );
        assert_number(
            &format!("{}.distanceAlongSegment", case.name),
            actual.distance_along_segment,
            case.expected.distance_along_segment,
        );
        assert_number(
            &format!("{}.effectiveThickness", case.name),
            actual.effective_thickness,
            case.expected.effective_thickness,
        );
    }
}

#[test]
fn shared_opening_geometry_issues_match_typescript_vectors() {
    for case in vectors().validation_cases {
        let walls: Vec<_> = case.walls.into_iter().map(wall).collect();
        let openings: Vec<_> = case.openings.into_iter().map(opening).collect();
        let actual = validate_opening_geometry(&walls, &openings);
        let actual: Vec<_> = actual
            .iter()
            .map(|issue| {
                (
                    issue.code.as_str().to_owned(),
                    issue.opening_id.to_string(),
                    issue.wall_id.to_string(),
                    issue.related_opening_id.map(|id| id.to_string()),
                )
            })
            .collect();
        let expected: Vec<_> = case
            .expected_issues
            .into_iter()
            .map(|issue| {
                (
                    issue.code,
                    issue.opening_id,
                    issue.wall_id,
                    issue.related_opening_id,
                )
            })
            .collect();
        assert_eq!(actual, expected, "{}", case.name);
    }
}
