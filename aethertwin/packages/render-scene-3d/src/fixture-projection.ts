import type { Fixture } from "@aethertwin/core-model";
import {
  showroomFixture,
  type FixturePrimitivePart,
  type ShowroomFixtureDescriptor,
} from "@aethertwin/mode-showroom";
import { geometryBounds, transformedBoxGeometry } from "./box-geometry";
import type {
  SceneMaterialProjection,
  SceneProjectionIssueCode,
  SceneRecord,
} from "./types";

const GENERIC_HEIGHT_MM = 1_000;
const GENERIC_PART: FixturePrimitivePart = {
  key: "generic",
  shape: "box",
  center: { x: 0.5, y: 0.5, z: 0.5 },
  size: { x: 1, y: 1, z: 1 },
};

export interface FixtureProjectionFailure {
  readonly code: Extract<SceneProjectionIssueCode, "SCENE_FIXTURE_PROJECTION_FAILED">;
  readonly sourceIds: readonly string[];
}

function fixtureFailure(fixture: Fixture): FixtureProjectionFailure {
  return { code: "SCENE_FIXTURE_PROJECTION_FAILED", sourceIds: [fixture.id] };
}

function fixtureMaterial(): SceneMaterialProjection {
  return {
    role: "fixture",
    definitionId: null,
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 1,
    textureAssetId: null,
    textureColorSpace: null,
  };
}

export function projectFixtureRecords(
  fixture: Fixture,
  selectedIds: ReadonlySet<string>,
): readonly SceneRecord[] | FixtureProjectionFailure {
  let descriptor: ShowroomFixtureDescriptor | null;
  try {
    descriptor = fixture.kind === "generic"
      ? null
      : showroomFixture(fixture.kind);
  } catch {
    return fixtureFailure(fixture);
  }
  const parts = descriptor?.parts ?? [GENERIC_PART];
  const width = fixture.size.width;
  const depth = fixture.size.height;
  const height = fixture.spatial3D?.height
    ?? descriptor?.defaultSize.height
    ?? GENERIC_HEIGHT_MM;
  const elevation = fixture.spatial3D?.elevation ?? 0;
  if (
    !Number.isFinite(width) || width <= 0
    || !Number.isFinite(depth) || depth <= 0
    || !Number.isFinite(height) || height <= 0
    || !Number.isFinite(elevation)
  ) return fixtureFailure(fixture);

  const selected = selectedIds.has(fixture.id);
  const records: SceneRecord[] = [];
  for (const part of parts) {
    const halfWidth = part.size.x * width / 2;
    const halfDepth = part.size.y * depth / 2;
    const halfHeight = part.size.z * height / 2;
    const centerX = part.center.x * width;
    const centerY = part.center.y * depth;
    const centerZ = part.center.z * height;
    const geometry = transformedBoxGeometry({
      minX: centerX - halfWidth,
      maxX: centerX + halfWidth,
      minY: centerY - halfDepth,
      maxY: centerY + halfDepth,
      minZ: centerZ - halfHeight,
      maxZ: centerZ + halfHeight,
    }, fixture.transform, elevation, {
      minX: 0,
      maxX: width,
      minY: 0,
      maxY: depth,
      minZ: 0,
      maxZ: height,
    });
    if (geometry === null) return fixtureFailure(fixture);
    records.push({
      key: `fixture-part:${fixture.id}:${part.key}`,
      kind: "fixture-part",
      sourceIds: [fixture.id],
      selectionId: fixture.id,
      selected,
      bounds: geometryBounds(geometry),
      geometry,
      material: fixtureMaterial(),
      materialTargetId: fixture.id,
      selectionOverlay: null,
    });
  }
  return records;
}
