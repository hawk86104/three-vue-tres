import type { Point2, PointOfInterest } from "@aethertwin/core-model";
import { applyTransform } from "@aethertwin/plan-engine";
import { geometryBounds } from "./box-geometry";
import { millimetresToScenePoint } from "./coordinates";
import type {
  SceneMaterialProjection,
  SceneProjectionIssueCode,
  SceneRecord,
} from "./types";

const MARKER_RADIUS_MM = 60;
const MARKER_CROSS_HEIGHT_MM = 160;
const MARKER_HEIGHT_MM = 200;

export interface HotspotProjectionFailure {
  readonly code: Extract<SceneProjectionIssueCode, "SCENE_INVALID_RECORD">;
  readonly sourceIds: readonly string[];
}

function hotspotMaterial(): SceneMaterialProjection {
  return {
    role: "hotspot",
    definitionId: null,
    baseColor: "#e6b85c",
    roughness: 0.72,
    metalness: 0,
    opacity: 1,
    textureAssetId: null,
    textureColorSpace: null,
  };
}

export function projectHotspotRecord(
  hotspot: PointOfInterest,
  selectedIds: ReadonlySet<string>,
): SceneRecord | HotspotProjectionFailure {
  const elevation = hotspot.spatial3D?.elevation ?? 0;
  let world: Point2;
  try {
    world = applyTransform({ x: 0, y: 0 }, hotspot.transform);
  } catch {
    return { code: "SCENE_INVALID_RECORD", sourceIds: [hotspot.id] };
  }
  if (!Number.isFinite(elevation)) {
    return { code: "SCENE_INVALID_RECORD", sourceIds: [hotspot.id] };
  }
  const points = [
    millimetresToScenePoint(world, elevation),
    millimetresToScenePoint(world, elevation + MARKER_HEIGHT_MM),
    millimetresToScenePoint(
      { x: world.x - MARKER_RADIUS_MM, y: world.y },
      elevation + MARKER_CROSS_HEIGHT_MM,
    ),
    millimetresToScenePoint(
      { x: world.x + MARKER_RADIUS_MM, y: world.y },
      elevation + MARKER_CROSS_HEIGHT_MM,
    ),
    millimetresToScenePoint(
      { x: world.x, y: world.y + MARKER_RADIUS_MM },
      elevation + MARKER_CROSS_HEIGHT_MM,
    ),
    millimetresToScenePoint(
      { x: world.x, y: world.y - MARKER_RADIUS_MM },
      elevation + MARKER_CROSS_HEIGHT_MM,
    ),
  ];
  const geometry = {
    topology: "lines" as const,
    positions: points.flatMap((point) => [point.x, point.y, point.z]),
    indices: [0, 1, 2, 3, 4, 5],
    normals: points.flatMap(() => [0, 0, 0]),
    uvs: points.flatMap(() => [0, 0]),
  };
  const selected = selectedIds.has(hotspot.id);
  return {
    key: `hotspot:${hotspot.id}`,
    kind: "hotspot",
    sourceIds: [hotspot.id],
    selectionId: hotspot.id,
    selected,
    bounds: geometryBounds(geometry),
    geometry,
    material: hotspotMaterial(),
    materialTargetId: null,
    selectionOverlay: null,
  };
}
