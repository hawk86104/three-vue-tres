import type {
  CalibrationEvidence,
  CameraShot,
  GuidedRoute,
  MaterialAssignment,
  MaterialDefinition,
  MediaAsset,
  Opening,
  PlanReference,
  ProductContent,
  RouteEdge,
  RouteNetwork,
  RouteNode,
  StorySequence,
  ThemeConfig,
  Vendor,
  SceneEnvironment,
} from "./content-model";
import { parsePoint, polygon, polyline } from "./geometry-validation";
import type { Point2, Size2, Spatial3D, Transform2D } from "./geometry";
import { deepFreeze } from "./immutability";
import {
  validateOpeningGeometry,
  type OpeningGeometryIssueCode,
} from "./opening-geometry";
import type {
  AssetRecord,
  AssetMediaType,
  AssetRecordV2,
  ProjectManifest,
  ProjectProfile,
  ProjectSnapshot,
  ProjectSnapshotV2,
  SpatialProject,
  SpatialProjectV2,
} from "./model";
import type {
  DimensionAnchor,
  Floor,
  PlanLayer,
  ProjectRecordBase,
  SpatialEntity,
  SpatialEntityBase,
} from "./spatial-entities";
import {
  bool,
  fail,
  finite,
  list,
  nonEmpty,
  nonNegativeInteger,
  oneOf,
  positive,
  record,
  strings,
  text,
  uuid,
  type UnknownRecord,
} from "./validation-primitives";

export { ModelValidationError, type ModelIssueCode } from "./validation-primitives";

const CURRENT_SCHEMA_VERSION = 3 as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PROJECT_PROFILES = ["showroom", "market"] as const;
const ENTITY_TYPES = ["boundary", "wall", "zone", "space-unit", "fixture", "poi", "dimension"] as const;
const SPACE_UNIT_KINDS = ["room", "shop", "booth", "exhibition", "service", "restricted"] as const;
const FIXTURE_KINDS = ["display-case", "display-table", "shelf", "checkout", "screen", "partition", "signage", "generic"] as const;
const POI_KINDS = [
  "entrance", "exit", "service-desk", "restroom", "accessible-restroom", "stage", "food",
  "rest-area", "medical", "fire-safety", "parking", "charging", "storage", "nursery",
  "water", "atm", "closed-area", "custom",
] as const;
const VENDOR_STATUSES = ["unassigned", "active", "inactive"] as const;
const MEDIA_KINDS = ["image", "video", "audio", "model", "document"] as const;
const DISPLAY_UNITS = ["m", "cm", "mm"] as const;
const ASSET_MEDIA_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "video/mp4", "video/webm"] as const;
const PLAN_MEDIA_TYPES: ReadonlySet<AssetMediaType> = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const ASSET_EXTENSION: Readonly<Record<AssetMediaType, string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
});
const ASSET_SIZE_LIMIT: Readonly<Record<AssetMediaType, number>> = Object.freeze({
  "image/png": 268_435_456,
  "image/jpeg": 268_435_456,
  "image/svg+xml": 33_554_432,
  "video/mp4": 4_294_967_296,
  "video/webm": 4_294_967_296,
});
const MAX_INTRINSIC_AXIS = 16_384;
const MAX_DECODED_PIXELS = 268_435_456;
const MAX_WORLD_COORDINATE_MM = 1_000_000_000;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MATERIAL_TARGET_KINDS = ["space-floor", "wall", "fixture"] as const;

type RegisterId = (id: string, path: string) => void;

export const assertString = text;
export const assertNonEmptyString = nonEmpty;
export const assertUuid = uuid;

export function assertProfile(value: unknown, path: string): ProjectProfile {
  return oneOf(value, path, PROJECT_PROFILES);
}

export function assertTimestamp(value: unknown, path: string): string {
  const timestamp = text(value, path);
  if (!UTC_TIMESTAMP_PATTERN.test(timestamp)) {
    fail("INVALID_VALUE", path, "expected an ISO 8601 UTC timestamp");
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    fail("INVALID_VALUE", path, "expected a real ISO 8601 timestamp");
  }

  const canonical = parsed.toISOString();
  if (timestamp !== canonical && timestamp !== canonical.replace(".000Z", "Z")) {
    fail("INVALID_VALUE", path, "expected a real ISO 8601 timestamp");
  }
  return timestamp;
}

function schemaVersionV2(value: unknown, path: string): 2 {
  if (value !== 2) {
    fail("UNSUPPORTED_SCHEMA_VERSION", path, "expected 2");
  }
  return 2;
}

function storedManifestSchemaVersion(value: unknown): typeof CURRENT_SCHEMA_VERSION {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail("INVALID_VALUE", "schemaVersion", "expected a positive safe integer");
  }
  if ((value as number) > CURRENT_SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", `expected at most ${CURRENT_SCHEMA_VERSION}`);
  }
  return CURRENT_SCHEMA_VERSION;
}

function exactKeys(value: unknown, path: string, allowedKeys: readonly string[]): UnknownRecord {
  const source = record(value, path);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      fail("INVALID_VALUE", `${path}.${key}`, "unknown property");
    }
  }
  return source;
}

function assertPointExact(value: unknown, path: string): void {
  exactKeys(value, path, ["x", "y"]);
}

function assertPointListExact(value: unknown, path: string): void {
  list(value, path).forEach((point, index) => assertPointExact(point, `${path}[${index}]`));
}

function assertTransformExact(value: unknown, path: string): void {
  const source = exactKeys(value, path, ["translation", "rotation", "scale"]);
  assertPointExact(source.translation, `${path}.translation`);
  exactKeys(source.scale, `${path}.scale`, ["x", "y"]);
}

function assertRecordBaseExact(
  value: unknown,
  path: string,
  additionalKeys: readonly string[],
): UnknownRecord {
  return exactKeys(value, path, ["id", "name", "tags", ...additionalKeys]);
}

function assertDimensionAnchorExact(value: unknown, path: string): void {
  const candidate = record(value, path);
  const kind = oneOf(candidate.kind, `${path}.kind`, ["point", "entity"] as const);
  if (kind === "point") {
    const source = exactKeys(candidate, path, ["kind", "point"]);
    assertPointExact(source.point, `${path}.point`);
    return;
  }
  const source = exactKeys(candidate, path, ["kind", "entityId", "locator"]);
  if (source.locator === "origin") return;
  const locator = record(source.locator, `${path}.locator`);
  exactKeys(locator, `${path}.locator`, locator.vertex !== undefined ? ["vertex"] : ["segment", "t"]);
}

function assertSpatialEntityExact(value: unknown, path: string): void {
  const candidate = record(value, path);
  const type = oneOf(candidate.type, `${path}.type`, ENTITY_TYPES);
  const common = ["type", "floorId", "layerId", "transform", "spatial3D", "locked"];
  const keysByType: Readonly<Record<(typeof ENTITY_TYPES)[number], readonly string[]>> = {
    boundary: ["polygon"],
    wall: ["centerLine", "thickness"],
    zone: ["polygon", "purpose", "color"],
    "space-unit": ["kind", "footprint"],
    fixture: ["kind", "size"],
    poi: ["kind", "radius"],
    dimension: ["start", "end", "offset", "displayUnit"],
  };
  const source = assertRecordBaseExact(candidate, path, [...common, ...keysByType[type]]);
  assertTransformExact(source.transform, `${path}.transform`);
  if (source.spatial3D !== undefined) {
    exactKeys(source.spatial3D, `${path}.spatial3D`, ["elevation", "height"]);
  }
  switch (type) {
    case "boundary":
    case "zone":
      assertPointListExact(source.polygon, `${path}.polygon`);
      break;
    case "wall":
      assertPointListExact(source.centerLine, `${path}.centerLine`);
      break;
    case "space-unit":
      assertPointListExact(source.footprint, `${path}.footprint`);
      break;
    case "fixture":
      exactKeys(source.size, `${path}.size`, ["width", "height"]);
      break;
    case "dimension":
      assertDimensionAnchorExact(source.start, `${path}.start`);
      assertDimensionAnchorExact(source.end, `${path}.end`);
      break;
    case "poi":
      break;
  }
}

function assertRouteNetworkExact(value: unknown, path: string): void {
  const source = assertRecordBaseExact(value, path, ["nodes", "edges"]);
  list(source.nodes, `${path}.nodes`).forEach((node, index) => {
    const nodePath = `${path}.nodes[${index}]`;
    const nodeSource = assertRecordBaseExact(node, nodePath, ["position", "floorId", "kind"]);
    assertPointExact(nodeSource.position, `${nodePath}.position`);
  });
  list(source.edges, `${path}.edges`).forEach((edge, index) => {
    assertRecordBaseExact(edge, `${path}.edges[${index}]`, [
      "from", "to", "distance", "bidirectional", "accessible", "enabled", "width", "weight",
    ]);
  });
}

function assertPlanReferenceExact(value: unknown, path: string): void {
  const source = assertRecordBaseExact(value, path, [
    "floorId", "layerId", "assetId", "intrinsicSize", "transform", "opacity", "locked", "calibration",
  ]);
  exactKeys(source.intrinsicSize, `${path}.intrinsicSize`, ["width", "height"]);
  assertTransformExact(source.transform, `${path}.transform`);
  if (source.calibration !== null) {
    const calibration = exactKeys(source.calibration, `${path}.calibration`, [
      "sourcePointA", "sourcePointB", "measuredDistanceMm",
    ]);
    assertPointExact(calibration.sourcePointA, `${path}.calibration.sourcePointA`);
    assertPointExact(calibration.sourcePointB, `${path}.calibration.sourcePointB`);
  }
}

function assertSceneEnvironmentExact(value: unknown, path: string): void {
  const source = exactKeys(value, path, [
    "backgroundColor", "ambient", "key", "shadowsEnabled", "shadowSoftness",
  ]);
  exactKeys(source.ambient, `${path}.ambient`, ["color", "intensity"]);
  exactKeys(source.key, `${path}.key`, ["color", "intensity", "direction"]);
}

function assertSnapshotV3ExactKeys(value: unknown): void {
  const source = exactKeys(value, "snapshot", [
    "schemaVersion", "sequence", "checkpointSequence", "project", "assets",
  ]);
  const project = assertRecordBaseExact(source.project, "project", [
    "profile", "floors", "entities", "vendors", "productContents", "mediaAssets",
    "routeNetworks", "themes", "cameraShots", "storySequences", "planReferences",
    "openings", "guidedRoutes", "materials", "materialAssignments", "sceneEnvironment",
  ]);
  list(project.floors, "project.floors").forEach((floor, floorIndex) => {
    const floorPath = `project.floors[${floorIndex}]`;
    const floorSource = assertRecordBaseExact(floor, floorPath, ["layers"]);
    list(floorSource.layers, `${floorPath}.layers`).forEach((layer, layerIndex) =>
      assertRecordBaseExact(layer, `${floorPath}.layers[${layerIndex}]`, ["visible", "locked"]));
  });
  list(project.entities, "project.entities").forEach((entity, index) =>
    assertSpatialEntityExact(entity, `project.entities[${index}]`));
  list(project.vendors, "project.vendors").forEach((vendor, index) =>
    assertRecordBaseExact(vendor, `project.vendors[${index}]`, ["spaceUnitId", "externalId", "category", "status"]));
  list(project.productContents, "project.productContents").forEach((content, index) =>
    assertRecordBaseExact(content, `project.productContents[${index}]`, ["targetEntityId", "description", "mediaAssetIds"]));
  list(project.mediaAssets, "project.mediaAssets").forEach((asset, index) =>
    assertRecordBaseExact(asset, `project.mediaAssets[${index}]`, ["assetId", "kind"]));
  list(project.routeNetworks, "project.routeNetworks").forEach((network, index) =>
    assertRouteNetworkExact(network, `project.routeNetworks[${index}]`));
  list(project.themes, "project.themes").forEach((theme, index) => {
    const path = `project.themes[${index}]`;
    const themeSource = assertRecordBaseExact(theme, path, ["profile", "values"]);
    record(themeSource.values, `${path}.values`);
  });
  list(project.cameraShots, "project.cameraShots").forEach((shot, index) =>
    assertRecordBaseExact(shot, `project.cameraShots[${index}]`, ["position", "target", "fieldOfView"]));
  list(project.storySequences, "project.storySequences").forEach((sequence, index) =>
    assertRecordBaseExact(sequence, `project.storySequences[${index}]`, ["cameraShotIds", "duration"]));
  list(project.planReferences, "project.planReferences").forEach((reference, index) =>
    assertPlanReferenceExact(reference, `project.planReferences[${index}]`));
  list(project.openings, "project.openings").forEach((opening, index) =>
    assertRecordBaseExact(opening, `project.openings[${index}]`, [
      "wallId", "kind", "distanceAlongWall", "width", "height", "sillHeight",
    ]));
  list(project.guidedRoutes, "project.guidedRoutes").forEach((route, index) =>
    assertRecordBaseExact(route, `project.guidedRoutes[${index}]`, ["routeNetworkId", "stopNodeIds"]));
  list(project.materials, "project.materials").forEach((material, index) =>
    assertRecordBaseExact(material, `project.materials[${index}]`, [
      "baseColor", "roughness", "metalness", "opacity", "assetId",
    ]));
  list(project.materialAssignments, "project.materialAssignments").forEach((assignment, index) =>
    assertRecordBaseExact(assignment, `project.materialAssignments[${index}]`, [
      "materialId", "targetKind", "targetId",
    ]));
  assertSceneEnvironmentExact(project.sceneEnvironment, "project.sceneEnvironment");
  list(source.assets, "assets").forEach((asset, index) =>
    exactKeys(asset, `assets[${index}]`, ["id", "sha256", "relativePath", "mediaType", "size"]));
}

function parseRecordBase(source: UnknownRecord, path: string, registerId: RegisterId): ProjectRecordBase {
  const id = uuid(source.id, `${path}.id`);
  registerId(id, `${path}.id`);
  return {
    id,
    name: nonEmpty(source.name, `${path}.name`),
    tags: strings(source.tags, `${path}.tags`),
  };
}

function parsePlanLayer(value: unknown, path: string, registerId: RegisterId): PlanLayer {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    visible: bool(source.visible, `${path}.visible`),
    locked: bool(source.locked, `${path}.locked`),
  };
}

function parseFloor(value: unknown, path: string, registerId: RegisterId): Floor {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    layers: list(source.layers, `${path}.layers`).map((layer, index) =>
      parsePlanLayer(layer, `${path}.layers[${index}]`, registerId)),
  };
}

function parseTransform(value: unknown, path: string): Transform2D {
  const source = record(value, path);
  const scaleSource = record(source.scale, `${path}.scale`);
  return {
    translation: parsePoint(source.translation, `${path}.translation`),
    rotation: finite(source.rotation, `${path}.rotation`),
    scale: {
      x: positive(scaleSource.x, `${path}.scale.x`),
      y: positive(scaleSource.y, `${path}.scale.y`),
    },
  };
}

function parseSpatial3D(value: unknown, path: string): Spatial3D {
  const source = record(value, path);
  return {
    elevation: finite(source.elevation, `${path}.elevation`),
    height: positive(source.height, `${path}.height`),
  };
}

function parseSize(value: unknown, path: string): Size2 {
  const source = record(value, path);
  return {
    width: positive(source.width, `${path}.width`),
    height: positive(source.height, `${path}.height`),
  };
}

function parseSpatialBase(source: UnknownRecord, path: string, registerId: RegisterId): SpatialEntityBase {
  const base = {
    ...parseRecordBase(source, path, registerId),
    floorId: uuid(source.floorId, `${path}.floorId`),
    layerId: uuid(source.layerId, `${path}.layerId`),
    transform: parseTransform(source.transform, `${path}.transform`),
    locked: bool(source.locked, `${path}.locked`),
  };
  return source.spatial3D === undefined
    ? base
    : { ...base, spatial3D: parseSpatial3D(source.spatial3D, `${path}.spatial3D`) };
}

function parseDimensionLocator(value: unknown, path: string): "origin" | { readonly vertex: number } | { readonly segment: number; readonly t: number } {
  if (value === "origin") return value;
  const source = record(value, path);
  const hasVertex = source.vertex !== undefined;
  const hasSegment = source.segment !== undefined || source.t !== undefined;
  if (hasVertex === hasSegment) {
    fail("INVALID_VALUE", path, "expected exactly one vertex or segment locator");
  }
  if (hasVertex) {
    return { vertex: nonNegativeInteger(source.vertex, `${path}.vertex`) };
  }
  const t = finite(source.t, `${path}.t`);
  if (t < 0 || t > 1) fail("INVALID_VALUE", `${path}.t`, "must be between 0 and 1");
  return { segment: nonNegativeInteger(source.segment, `${path}.segment`), t };
}

function parseDimensionAnchor(value: unknown, path: string): DimensionAnchor {
  const source = record(value, path);
  const kind = oneOf(source.kind, `${path}.kind`, ["point", "entity"] as const);
  return kind === "point"
    ? { kind, point: parsePoint(source.point, `${path}.point`) }
    : {
        kind,
        entityId: uuid(source.entityId, `${path}.entityId`),
        locator: parseDimensionLocator(source.locator, `${path}.locator`),
      };
}

function parseSpatialEntity(value: unknown, path: string, registerId: RegisterId): SpatialEntity {
  const source = record(value, path);
  const type = oneOf(source.type, `${path}.type`, ENTITY_TYPES);
  const base = parseSpatialBase(source, path, registerId);

  switch (type) {
    case "boundary":
      return { ...base, type, polygon: polygon(source.polygon, `${path}.polygon`) };
    case "wall":
      return {
        ...base,
        type,
        centerLine: polyline(source.centerLine, `${path}.centerLine`),
        thickness: positive(source.thickness, `${path}.thickness`),
      };
    case "zone":
      return {
        ...base,
        type,
        polygon: polygon(source.polygon, `${path}.polygon`),
        purpose: nonEmpty(source.purpose, `${path}.purpose`),
        color: nonEmpty(source.color, `${path}.color`),
      };
    case "space-unit":
      return {
        ...base,
        type,
        kind: oneOf(source.kind, `${path}.kind`, SPACE_UNIT_KINDS),
        footprint: polygon(source.footprint, `${path}.footprint`),
      };
    case "fixture":
      return {
        ...base,
        type,
        kind: oneOf(source.kind, `${path}.kind`, FIXTURE_KINDS),
        size: parseSize(source.size, `${path}.size`),
      };
    case "poi": {
      const poi = {
        ...base,
        type,
        kind: oneOf(source.kind, `${path}.kind`, POI_KINDS),
      };
      return source.radius === undefined
        ? poi
        : { ...poi, radius: positive(source.radius, `${path}.radius`) };
    }
    case "dimension": {
      const dimension = {
        ...base,
        type,
        start: parseDimensionAnchor(source.start, `${path}.start`),
        end: parseDimensionAnchor(source.end, `${path}.end`),
        offset: finite(source.offset, `${path}.offset`),
      };
      return source.displayUnit === undefined
        ? dimension
        : { ...dimension, displayUnit: oneOf(source.displayUnit, `${path}.displayUnit`, DISPLAY_UNITS) };
    }
  }
}

function parseAssetV2(value: unknown, path: string, registerId: RegisterId): AssetRecordV2 {
  const source = record(value, path);
  const id = uuid(source.id, `${path}.id`);
  registerId(id, `${path}.id`);
  const sha256 = text(source.sha256, `${path}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    fail("INVALID_VALUE", `${path}.sha256`, "expected a lowercase SHA-256 digest");
  }
  return {
    id,
    sha256,
    relativePath: parseRelativePathV2(source.relativePath, `${path}.relativePath`),
    mediaType: nonEmpty(source.mediaType, `${path}.mediaType`),
    size: nonNegativeInteger(source.size, `${path}.size`),
  };
}

function parseRelativePathV2(value: unknown, path: string): string {
  const candidate = nonEmpty(value, path);
  const segments = candidate.split("/");
  if (
    candidate.startsWith("/") || candidate.startsWith("\\") || candidate.includes("\\") ||
    /^[a-zA-Z]:/.test(candidate) || segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    fail("INVALID_RELATIVE_PATH", path, "must be a normalized project-relative path");
  }
  return candidate;
}

function parseAssetV3(value: unknown, path: string, registerId: RegisterId): AssetRecord {
  const source = record(value, path);
  const id = uuid(source.id, `${path}.id`);
  registerId(id, `${path}.id`);
  const sha256 = text(source.sha256, `${path}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    fail("INVALID_VALUE", `${path}.sha256`, "expected a lowercase SHA-256 digest");
  }
  const mediaType = oneOf(source.mediaType, `${path}.mediaType`, ASSET_MEDIA_TYPES);
  const relativePath = nonEmpty(source.relativePath, `${path}.relativePath`);
  const expectedPath = `assets/sha256/${sha256.slice(0, 2)}/${sha256}.${ASSET_EXTENSION[mediaType]}`;
  if (relativePath !== expectedPath) {
    fail("INVALID_RELATIVE_PATH", `${path}.relativePath`, `expected ${expectedPath}`);
  }
  const size = nonNegativeInteger(source.size, `${path}.size`);
  if (size > ASSET_SIZE_LIMIT[mediaType]) {
    fail("INVALID_VALUE", `${path}.size`, `exceeds ${ASSET_SIZE_LIMIT[mediaType]} bytes`);
  }
  return { id, sha256, relativePath, mediaType, size };
}

function bounded(value: unknown, path: string, minimum: number, maximum: number): number {
  const result = finite(value, path);
  if (result < minimum || result > maximum) {
    fail("INVALID_VALUE", path, `must be between ${minimum} and ${maximum}`);
  }
  return result;
}

function positiveSafeIntegerAtMost(value: unknown, path: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    fail("INVALID_VALUE", path, `expected an integer from 1 through ${maximum}`);
  }
  return value as number;
}

function parseIntrinsicSize(value: unknown, path: string): Size2 {
  const source = record(value, path);
  const width = positiveSafeIntegerAtMost(source.width, `${path}.width`, MAX_INTRINSIC_AXIS);
  const height = positiveSafeIntegerAtMost(source.height, `${path}.height`, MAX_INTRINSIC_AXIS);
  if (width > Math.floor(MAX_DECODED_PIXELS / height)) {
    fail("INVALID_VALUE", path, `decoded pixels exceed ${MAX_DECODED_PIXELS}`);
  }
  return { width, height };
}

function assertSourcePointInBounds(point: Point2, size: Size2, path: string): void {
  if (point.x < 0 || point.x > size.width) {
    fail("INVALID_VALUE", `${path}.x`, "must be within the intrinsic width");
  }
  if (point.y < 0 || point.y > size.height) {
    fail("INVALID_VALUE", `${path}.y`, "must be within the intrinsic height");
  }
}

function parseCalibrationEvidence(
  value: unknown,
  path: string,
  intrinsicSize: Size2,
  transform: Transform2D,
): CalibrationEvidence {
  const source = record(value, path);
  const sourcePointA = parsePoint(source.sourcePointA, `${path}.sourcePointA`);
  const sourcePointB = parsePoint(source.sourcePointB, `${path}.sourcePointB`);
  assertSourcePointInBounds(sourcePointA, intrinsicSize, `${path}.sourcePointA`);
  assertSourcePointInBounds(sourcePointB, intrinsicSize, `${path}.sourcePointB`);
  if (sourcePointA.x === sourcePointB.x && sourcePointA.y === sourcePointB.y) {
    fail("INVALID_VALUE", `${path}.sourcePointB`, "must be distinct from sourcePointA");
  }
  const measuredDistanceMm = positive(source.measuredDistanceMm, `${path}.measuredDistanceMm`);
  const pixelDistance = Math.hypot(
    sourcePointB.x - sourcePointA.x,
    sourcePointB.y - sourcePointA.y,
  );
  const calibratedScale = measuredDistanceMm / pixelDistance;
  if (!Number.isFinite(calibratedScale) || calibratedScale <= 0) {
    fail("INVALID_VALUE", `${path}.measuredDistanceMm`, "produces an invalid calibrated scale");
  }
  if (
    transform.scale.x !== transform.scale.y
    || transform.scale.x !== calibratedScale
  ) {
    fail("INVALID_VALUE", path.replace(/\.calibration$/, ".transform.scale"), "must match the uniform calibrated scale");
  }
  return { sourcePointA, sourcePointB, measuredDistanceMm };
}

function validatePlanTransformBounds(transform: Transform2D, size: Size2, path: string): void {
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  const corners: readonly Point2[] = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height },
  ];
  for (const corner of corners) {
    const scaledX = corner.x * transform.scale.x;
    const scaledY = corner.y * transform.scale.y;
    const worldX = scaledX * cosine - scaledY * sine + transform.translation.x;
    const worldY = scaledX * sine + scaledY * cosine + transform.translation.y;
    if (
      !Number.isFinite(worldX)
      || !Number.isFinite(worldY)
      || Math.abs(worldX) > MAX_WORLD_COORDINATE_MM
      || Math.abs(worldY) > MAX_WORLD_COORDINATE_MM
    ) {
      fail("INVALID_VALUE", path, `transformed bounds must stay within +/-${MAX_WORLD_COORDINATE_MM} mm`);
    }
  }
}

function parsePlanReference(value: unknown, path: string, registerId: RegisterId): PlanReference {
  const source = record(value, path);
  const base = parseRecordBase(source, path, registerId);
  const intrinsicSize = parseIntrinsicSize(source.intrinsicSize, `${path}.intrinsicSize`);
  const transform = parseTransform(source.transform, `${path}.transform`);
  const opacity = bounded(source.opacity, `${path}.opacity`, 0, 1);
  const calibration = source.calibration === null
    ? null
    : parseCalibrationEvidence(source.calibration, `${path}.calibration`, intrinsicSize, transform);
  validatePlanTransformBounds(transform, intrinsicSize, `${path}.transform`);
  return {
    ...base,
    floorId: uuid(source.floorId, `${path}.floorId`),
    layerId: uuid(source.layerId, `${path}.layerId`),
    assetId: uuid(source.assetId, `${path}.assetId`),
    intrinsicSize,
    transform,
    opacity,
    locked: bool(source.locked, `${path}.locked`),
    calibration,
  };
}

function parseOpening(value: unknown, path: string, registerId: RegisterId): Opening {
  const source = record(value, path);
  const distanceAlongWall = finite(source.distanceAlongWall, `${path}.distanceAlongWall`);
  const sillHeight = finite(source.sillHeight, `${path}.sillHeight`);
  if (distanceAlongWall < 0) fail("INVALID_VALUE", `${path}.distanceAlongWall`, "must be non-negative");
  if (sillHeight < 0) fail("INVALID_VALUE", `${path}.sillHeight`, "must be non-negative");
  return {
    ...parseRecordBase(source, path, registerId),
    wallId: uuid(source.wallId, `${path}.wallId`),
    kind: oneOf(source.kind, `${path}.kind`, ["door", "window"] as const),
    distanceAlongWall,
    width: positive(source.width, `${path}.width`),
    height: positive(source.height, `${path}.height`),
    sillHeight,
  };
}

function parseGuidedRoute(value: unknown, path: string, registerId: RegisterId): GuidedRoute {
  const source = record(value, path);
  const stopNodeIds = list(source.stopNodeIds, `${path}.stopNodeIds`).map((id, index) =>
    uuid(id, `${path}.stopNodeIds[${index}]`));
  if (stopNodeIds.length < 2) {
    fail("INVALID_VALUE", `${path}.stopNodeIds`, "requires at least two stops");
  }
  return {
    ...parseRecordBase(source, path, registerId),
    routeNetworkId: uuid(source.routeNetworkId, `${path}.routeNetworkId`),
    stopNodeIds,
  };
}

function parseColor(value: unknown, path: string): string {
  const color = text(value, path);
  if (!COLOR_PATTERN.test(color)) fail("INVALID_VALUE", path, "expected #RRGGBB");
  return color;
}

function parseMaterial(value: unknown, path: string, registerId: RegisterId): MaterialDefinition {
  const source = record(value, path);
  const opacity = bounded(source.opacity, `${path}.opacity`, 0, 1);
  if (opacity === 0) fail("INVALID_VALUE", `${path}.opacity`, "must be positive");
  return {
    ...parseRecordBase(source, path, registerId),
    baseColor: parseColor(source.baseColor, `${path}.baseColor`),
    roughness: bounded(source.roughness, `${path}.roughness`, 0, 1),
    metalness: bounded(source.metalness, `${path}.metalness`, 0, 1),
    opacity,
    assetId: source.assetId === null ? null : uuid(source.assetId, `${path}.assetId`),
  };
}

function parseMaterialAssignment(value: unknown, path: string, registerId: RegisterId): MaterialAssignment {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    materialId: uuid(source.materialId, `${path}.materialId`),
    targetKind: oneOf(source.targetKind, `${path}.targetKind`, MATERIAL_TARGET_KINDS),
    targetId: uuid(source.targetId, `${path}.targetId`),
  };
}

function parseSceneEnvironment(value: unknown, path: string): SceneEnvironment {
  const source = record(value, path);
  const ambient = record(source.ambient, `${path}.ambient`);
  const key = record(source.key, `${path}.key`);
  const direction = parseVector3(key.direction, `${path}.key.direction`);
  direction.forEach((component, index) => {
    if (component < -100 || component > 100) {
      fail("INVALID_VALUE", `${path}.key.direction[${index}]`, "must be between -100 and 100");
    }
  });
  if (direction.every((component) => component === 0)) {
    fail("INVALID_VALUE", `${path}.key.direction`, "must be non-zero");
  }
  return {
    backgroundColor: parseColor(source.backgroundColor, `${path}.backgroundColor`),
    ambient: {
      color: parseColor(ambient.color, `${path}.ambient.color`),
      intensity: bounded(ambient.intensity, `${path}.ambient.intensity`, 0, 4),
    },
    key: {
      color: parseColor(key.color, `${path}.key.color`),
      intensity: bounded(key.intensity, `${path}.key.intensity`, 0, 8),
      direction,
    },
    shadowsEnabled: bool(source.shadowsEnabled, `${path}.shadowsEnabled`),
    shadowSoftness: bounded(source.shadowSoftness, `${path}.shadowSoftness`, 0, 1),
  };
}

function parseVendor(value: unknown, path: string, registerId: RegisterId): Vendor {
  const source = record(value, path);
  const spaceUnitId = source.spaceUnitId === null ? null : uuid(source.spaceUnitId, `${path}.spaceUnitId`);
  return {
    ...parseRecordBase(source, path, registerId),
    spaceUnitId,
    externalId: nonEmpty(source.externalId, `${path}.externalId`),
    category: nonEmpty(source.category, `${path}.category`),
    status: oneOf(source.status, `${path}.status`, VENDOR_STATUSES),
  };
}

function parseProductContent(value: unknown, path: string, registerId: RegisterId): ProductContent {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    targetEntityId: uuid(source.targetEntityId, `${path}.targetEntityId`),
    description: text(source.description, `${path}.description`),
    mediaAssetIds: list(source.mediaAssetIds, `${path}.mediaAssetIds`).map((id, index) =>
      uuid(id, `${path}.mediaAssetIds[${index}]`)),
  };
}

function parseMediaAsset(value: unknown, path: string, registerId: RegisterId): MediaAsset {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    assetId: uuid(source.assetId, `${path}.assetId`),
    kind: oneOf(source.kind, `${path}.kind`, MEDIA_KINDS),
  };
}

function parseRouteNode(value: unknown, path: string, registerId: RegisterId): RouteNode {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    position: parsePoint(source.position, `${path}.position`),
    floorId: uuid(source.floorId, `${path}.floorId`),
    kind: nonEmpty(source.kind, `${path}.kind`),
  };
}

function parseRouteEdge(value: unknown, path: string, registerId: RegisterId): RouteEdge {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    from: uuid(source.from, `${path}.from`),
    to: uuid(source.to, `${path}.to`),
    distance: positive(source.distance, `${path}.distance`),
    bidirectional: bool(source.bidirectional, `${path}.bidirectional`),
    accessible: bool(source.accessible, `${path}.accessible`),
    enabled: bool(source.enabled, `${path}.enabled`),
    width: positive(source.width, `${path}.width`),
    weight: positive(source.weight, `${path}.weight`),
  };
}

function parseRouteNetwork(value: unknown, path: string, registerId: RegisterId): RouteNetwork {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    nodes: list(source.nodes, `${path}.nodes`).map((node, index) =>
      parseRouteNode(node, `${path}.nodes[${index}]`, registerId)),
    edges: list(source.edges, `${path}.edges`).map((edge, index) =>
      parseRouteEdge(edge, `${path}.edges[${index}]`, registerId)),
  };
}

function parseThemeValue(value: unknown, path: string): string | number | boolean {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return finite(value, path);
  fail("INVALID_TYPE", path, "expected a JSON-safe primitive");
}

function parseTheme(value: unknown, path: string, registerId: RegisterId): ThemeConfig {
  const source = record(value, path);
  const valueSource = record(source.values, `${path}.values`);
  const values = Object.fromEntries(
    Object.entries(valueSource).map(([key, item]) => [
      key,
      parseThemeValue(item, `${path}.values.${key}`),
    ]),
  );
  return {
    ...parseRecordBase(source, path, registerId),
    profile: assertProfile(source.profile, `${path}.profile`),
    values,
  };
}

function parseVector3(value: unknown, path: string): readonly [number, number, number] {
  const values = list(value, path);
  if (values.length !== 3) fail("INVALID_VALUE", path, "expected exactly three coordinates");
  return [
    finite(values[0], `${path}[0]`),
    finite(values[1], `${path}[1]`),
    finite(values[2], `${path}[2]`),
  ];
}

function parseCameraShot(value: unknown, path: string, registerId: RegisterId): CameraShot {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    position: parseVector3(source.position, `${path}.position`),
    target: parseVector3(source.target, `${path}.target`),
    fieldOfView: positive(source.fieldOfView, `${path}.fieldOfView`),
  };
}

function parseStorySequence(value: unknown, path: string, registerId: RegisterId): StorySequence {
  const source = record(value, path);
  return {
    ...parseRecordBase(source, path, registerId),
    cameraShotIds: list(source.cameraShotIds, `${path}.cameraShotIds`).map((id, index) =>
      uuid(id, `${path}.cameraShotIds[${index}]`)),
    duration: positive(source.duration, `${path}.duration`),
  };
}

function parseProjectV2(value: unknown, registerId: RegisterId): SpatialProjectV2 {
  const source = record(value, "project");
  const base = parseRecordBase(source, "project", registerId);
  return {
    ...base,
    profile: assertProfile(source.profile, "project.profile"),
    floors: list(source.floors, "project.floors").map((floor, index) =>
      parseFloor(floor, `project.floors[${index}]`, registerId)),
    entities: list(source.entities, "project.entities").map((entity, index) =>
      parseSpatialEntity(entity, `project.entities[${index}]`, registerId)),
    vendors: list(source.vendors, "project.vendors").map((vendor, index) =>
      parseVendor(vendor, `project.vendors[${index}]`, registerId)),
    productContents: list(source.productContents, "project.productContents").map((content, index) =>
      parseProductContent(content, `project.productContents[${index}]`, registerId)),
    mediaAssets: list(source.mediaAssets, "project.mediaAssets").map((asset, index) =>
      parseMediaAsset(asset, `project.mediaAssets[${index}]`, registerId)),
    routeNetworks: list(source.routeNetworks, "project.routeNetworks").map((network, index) =>
      parseRouteNetwork(network, `project.routeNetworks[${index}]`, registerId)),
    themes: list(source.themes, "project.themes").map((theme, index) =>
      parseTheme(theme, `project.themes[${index}]`, registerId)),
    cameraShots: list(source.cameraShots, "project.cameraShots").map((shot, index) =>
      parseCameraShot(shot, `project.cameraShots[${index}]`, registerId)),
    storySequences: list(source.storySequences, "project.storySequences").map((sequence, index) =>
      parseStorySequence(sequence, `project.storySequences[${index}]`, registerId)),
  };
}

function requireReference(ids: ReadonlySet<string>, id: string, path: string, detail: string): void {
  if (!ids.has(id)) fail("INVALID_REFERENCE", path, detail);
}

function validateAnchorReference(
  anchor: DimensionAnchor,
  path: string,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
): void {
  if (anchor.kind !== "entity") return;

  const entity = entitiesById.get(anchor.entityId);
  if (entity === undefined) {
    fail("INVALID_REFERENCE", `${path}.entityId`, "unknown entity");
  }
  if (anchor.locator === "origin") return;

  const locatorPath = "vertex" in anchor.locator
    ? `${path}.locator.vertex`
    : `${path}.locator.segment`;
  let points: readonly Point2[];
  let closed: boolean;
  switch (entity.type) {
    case "boundary":
    case "zone":
      points = entity.polygon;
      closed = true;
      break;
    case "space-unit":
      points = entity.footprint;
      closed = true;
      break;
    case "wall":
      points = entity.centerLine;
      closed = false;
      break;
    default:
      fail("INVALID_REFERENCE", locatorPath, `${entity.type} entities only support origin locators`);
  }

  if ("vertex" in anchor.locator) {
    if (anchor.locator.vertex >= points.length) {
      fail("INVALID_REFERENCE", locatorPath, "vertex index is out of range");
    }
    return;
  }

  const segmentCount = closed ? points.length : points.length - 1;
  if (anchor.locator.segment >= segmentCount) {
    fail("INVALID_REFERENCE", locatorPath, "segment index is out of range");
  }
}

function validateV2References(snapshot: ProjectSnapshotV2 | ProjectSnapshot): void {
  const floorIds = new Set(snapshot.project.floors.map((floor) => floor.id));
  const layersByFloor = new Map(snapshot.project.floors.map((floor) => [
    floor.id,
    new Set(floor.layers.map((layer) => layer.id)),
  ]));
  const entitiesById = new Map(snapshot.project.entities.map((entity) => [entity.id, entity]));
  const entityIds = new Set(entitiesById.keys());
  const spaceUnitIds = new Set(snapshot.project.entities.filter((entity) => entity.type === "space-unit").map((entity) => entity.id));
  const mediaAssetIds = new Set(snapshot.project.mediaAssets.map((asset) => asset.id));
  const assetIds = new Set(snapshot.assets.map((asset) => asset.id));
  const cameraShotIds = new Set(snapshot.project.cameraShots.map((shot) => shot.id));

  snapshot.project.entities.forEach((entity, index) => {
    const path = `project.entities[${index}]`;
    requireReference(floorIds, entity.floorId, `${path}.floorId`, "unknown floor");
    const layerIds = layersByFloor.get(entity.floorId);
    if (!layerIds?.has(entity.layerId)) {
      fail("INVALID_REFERENCE", `${path}.layerId`, "layer does not belong to floor");
    }
    if (entity.type === "dimension") {
      validateAnchorReference(entity.start, `${path}.start`, entitiesById);
      validateAnchorReference(entity.end, `${path}.end`, entitiesById);
    }
  });

  snapshot.project.vendors.forEach((vendor, index) => {
    if (vendor.spaceUnitId !== null) {
      requireReference(spaceUnitIds, vendor.spaceUnitId, `project.vendors[${index}].spaceUnitId`, "unknown space unit");
    }
  });
  snapshot.project.productContents.forEach((content, index) => {
    requireReference(entityIds, content.targetEntityId, `project.productContents[${index}].targetEntityId`, "unknown entity");
    content.mediaAssetIds.forEach((id, mediaIndex) =>
      requireReference(mediaAssetIds, id, `project.productContents[${index}].mediaAssetIds[${mediaIndex}]`, "unknown media asset"));
  });
  snapshot.project.mediaAssets.forEach((asset, index) =>
    requireReference(assetIds, asset.assetId, `project.mediaAssets[${index}].assetId`, "unknown asset"));
  snapshot.project.routeNetworks.forEach((network, networkIndex) => {
    const nodeIds = new Set(network.nodes.map((node) => node.id));
    network.nodes.forEach((node, nodeIndex) =>
      requireReference(floorIds, node.floorId, `project.routeNetworks[${networkIndex}].nodes[${nodeIndex}].floorId`, "unknown floor"));
    network.edges.forEach((edge, edgeIndex) => {
      const path = `project.routeNetworks[${networkIndex}].edges[${edgeIndex}]`;
      requireReference(nodeIds, edge.from, `${path}.from`, "unknown route node in this network");
      requireReference(nodeIds, edge.to, `${path}.to`, "unknown route node in this network");
    });
  });
  snapshot.project.storySequences.forEach((sequence, sequenceIndex) =>
    sequence.cameraShotIds.forEach((id, shotIndex) =>
      requireReference(cameraShotIds, id, `project.storySequences[${sequenceIndex}].cameraShotIds[${shotIndex}]`, "unknown camera shot")));
}

function validateV3References(snapshot: ProjectSnapshot): void {
  const floorIds = new Set(snapshot.project.floors.map((floor) => floor.id));
  const layersByFloor = new Map(snapshot.project.floors.map((floor) => [
    floor.id,
    new Set(floor.layers.map((layer) => layer.id)),
  ]));
  const assetsById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const entitiesById = new Map(snapshot.project.entities.map((entity) => [entity.id, entity]));
  const routeNetworksById = new Map(snapshot.project.routeNetworks.map((network) => [network.id, network]));
  const materialsById = new Map(snapshot.project.materials.map((material) => [material.id, material]));

  snapshot.project.planReferences.forEach((reference, index) => {
    const path = `project.planReferences[${index}]`;
    requireReference(floorIds, reference.floorId, `${path}.floorId`, "unknown floor");
    if (!layersByFloor.get(reference.floorId)?.has(reference.layerId)) {
      fail("INVALID_REFERENCE", `${path}.layerId`, "layer does not belong to floor");
    }
    const asset = assetsById.get(reference.assetId);
    if (asset === undefined) {
      fail("INVALID_REFERENCE", `${path}.assetId`, "unknown asset");
    }
    if (!PLAN_MEDIA_TYPES.has(asset.mediaType)) {
      fail("INVALID_REFERENCE", `${path}.assetId`, "plan references require PNG, JPEG, or sanitized SVG");
    }
  });

  snapshot.project.openings.forEach((opening, index) => {
    const wall = entitiesById.get(opening.wallId);
    if (wall?.type !== "wall") {
      fail("INVALID_REFERENCE", `project.openings[${index}].wallId`, "expected an existing wall");
    }
  });

  snapshot.project.guidedRoutes.forEach((route, routeIndex) => {
    const path = `project.guidedRoutes[${routeIndex}]`;
    const network = routeNetworksById.get(route.routeNetworkId);
    if (network === undefined) {
      fail("INVALID_REFERENCE", `${path}.routeNetworkId`, "unknown route network");
    }
    const nodesById = new Map(network.nodes.map((node) => [node.id, node]));
    let floorId: string | undefined;
    route.stopNodeIds.forEach((nodeId, stopIndex) => {
      const node = nodesById.get(nodeId);
      if (node === undefined) {
        fail("INVALID_REFERENCE", `${path}.stopNodeIds[${stopIndex}]`, "unknown route node in this network");
      }
      floorId ??= node.floorId;
      if (node.floorId !== floorId) {
        fail("INVALID_REFERENCE", `${path}.stopNodeIds[${stopIndex}]`, "guided route stops must share one floor");
      }
    });
  });

  snapshot.project.materials.forEach((material, index) => {
    if (material.assetId === null) return;
    const asset = assetsById.get(material.assetId);
    if (asset === undefined) {
      fail("INVALID_REFERENCE", `project.materials[${index}].assetId`, "unknown asset");
    }
    if (!PLAN_MEDIA_TYPES.has(asset.mediaType)) {
      fail("INVALID_REFERENCE", `project.materials[${index}].assetId`, "material textures require an image asset");
    }
  });

  const assignedTargets = new Set<string>();
  snapshot.project.materialAssignments.forEach((assignment, index) => {
    const path = `project.materialAssignments[${index}]`;
    if (!materialsById.has(assignment.materialId)) {
      fail("INVALID_REFERENCE", `${path}.materialId`, "unknown material");
    }
    const target = entitiesById.get(assignment.targetId);
    const validTarget = assignment.targetKind === "space-floor"
      ? target?.type === "space-unit" || target?.type === "zone"
      : target?.type === assignment.targetKind;
    if (!validTarget) {
      fail("INVALID_REFERENCE", `${path}.targetId`, `expected a ${assignment.targetKind} target`);
    }
    const targetKey = `${assignment.targetKind}:${assignment.targetId}`;
    if (assignedTargets.has(targetKey)) {
      fail("INVALID_REFERENCE", `${path}.targetId`, "target already has a material assignment");
    }
    assignedTargets.add(targetKey);
  });
}

const OPENING_ISSUE_FIELD: Readonly<Record<OpeningGeometryIssueCode, string>> =
  Object.freeze({
    OPENING_WALL_NOT_FOUND: "wallId",
    OPENING_WALL_GEOMETRY_INVALID: "wallId",
    OPENING_SPAN_CROSSES_JOINT: "distanceAlongWall",
    OPENING_ENDPOINT_CLEARANCE: "distanceAlongWall",
    OPENING_OVERLAP: "distanceAlongWall",
    OPENING_HEIGHT_EXCEEDED: "height",
    OPENING_DOOR_SILL_NONZERO: "sillHeight",
    OPENING_TARGET_LOCKED: "wallId",
  });

function validateV3OpeningGeometry(snapshot: ProjectSnapshot): void {
  const walls = snapshot.project.entities.filter(
    (entity) => entity.type === "wall",
  );
  const firstIssue = validateOpeningGeometry(
    walls,
    snapshot.project.openings,
  )[0];
  if (firstIssue === undefined) return;

  const openingIndex = snapshot.project.openings.findIndex(
    (opening) => opening.id === firstIssue.openingId,
  );
  const related = firstIssue.relatedOpeningId === undefined
    ? ""
    : `; related opening ${firstIssue.relatedOpeningId}`;
  fail(
    "DEGENERATE_GEOMETRY",
    `project.openings[${openingIndex}].${OPENING_ISSUE_FIELD[firstIssue.code]}`,
    `${firstIssue.code} on wall ${firstIssue.wallId}${related}`,
  );
}

export function parseManifest(value: unknown): ProjectManifest {
  const source = record(value, "manifest");
  return deepFreeze({
    schemaVersion: storedManifestSchemaVersion(source.schemaVersion),
    projectId: uuid(source.projectId, "projectId"),
    name: nonEmpty(source.name, "name"),
    profile: assertProfile(source.profile, "profile"),
    createdAt: assertTimestamp(source.createdAt, "createdAt"),
    updatedAt: assertTimestamp(source.updatedAt, "updatedAt"),
    appVersion: nonEmpty(source.appVersion, "appVersion"),
    minCompatibleAppVersion: nonEmpty(source.minCompatibleAppVersion, "minCompatibleAppVersion"),
  });
}

export function parseSnapshotV2(value: unknown): ProjectSnapshotV2 {
  const source = record(value, "snapshot");
  const seenIds = new Map<string, string>();
  const registerId: RegisterId = (id, path) => {
    const firstPath = seenIds.get(id);
    if (firstPath !== undefined) {
      fail("DUPLICATE_UUID", path, `duplicates ${firstPath}`);
    }
    seenIds.set(id, path);
  };

  const candidate: ProjectSnapshotV2 = {
    schemaVersion: schemaVersionV2(source.schemaVersion, "schemaVersion"),
    sequence: nonNegativeInteger(source.sequence, "sequence"),
    checkpointSequence: nonNegativeInteger(source.checkpointSequence, "checkpointSequence"),
    project: parseProjectV2(source.project, registerId),
    assets: list(source.assets, "assets").map((asset, index) =>
      parseAssetV2(asset, `assets[${index}]`, registerId)),
  };

  validateV2References(candidate);
  return deepFreeze(candidate);
}

export function parseSnapshotV3(value: unknown): ProjectSnapshot {
  assertSnapshotV3ExactKeys(value);
  const source = record(value, "snapshot");
  if (source.schemaVersion !== 3) {
    fail("UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", "expected 3");
  }
  const seenIds = new Map<string, string>();
  const registerId: RegisterId = (id, path) => {
    const firstPath = seenIds.get(id);
    if (firstPath !== undefined) {
      fail("DUPLICATE_UUID", path, `duplicates ${firstPath}`);
    }
    seenIds.set(id, path);
  };
  const projectSource = record(source.project, "project");
  const projectV2 = parseProjectV2(projectSource, registerId);
  const project: SpatialProject = {
    ...projectV2,
    planReferences: list(projectSource.planReferences, "project.planReferences").map((reference, index) =>
      parsePlanReference(reference, `project.planReferences[${index}]`, registerId)),
    openings: list(projectSource.openings, "project.openings").map((opening, index) =>
      parseOpening(opening, `project.openings[${index}]`, registerId)),
    guidedRoutes: list(projectSource.guidedRoutes, "project.guidedRoutes").map((route, index) =>
      parseGuidedRoute(route, `project.guidedRoutes[${index}]`, registerId)),
    materials: list(projectSource.materials, "project.materials").map((material, index) =>
      parseMaterial(material, `project.materials[${index}]`, registerId)),
    materialAssignments: list(projectSource.materialAssignments, "project.materialAssignments").map((assignment, index) =>
      parseMaterialAssignment(assignment, `project.materialAssignments[${index}]`, registerId)),
    sceneEnvironment: parseSceneEnvironment(projectSource.sceneEnvironment, "project.sceneEnvironment"),
  };
  const candidate: ProjectSnapshot = {
    schemaVersion: 3,
    sequence: nonNegativeInteger(source.sequence, "sequence"),
    checkpointSequence: nonNegativeInteger(source.checkpointSequence, "checkpointSequence"),
    project,
    assets: list(source.assets, "assets").map((asset, index) =>
      parseAssetV3(asset, `assets[${index}]`, registerId)),
  };

  validateV2References(candidate);
  validateV3References(candidate);
  validateV3OpeningGeometry(candidate);
  return deepFreeze(candidate);
}

export const parseSnapshotV1 = parseSnapshotV2;
