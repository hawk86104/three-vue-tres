import type {
  CameraShot,
  MediaAsset,
  ProductContent,
  RouteEdge,
  RouteNetwork,
  RouteNode,
  StorySequence,
  ThemeConfig,
  Vendor,
} from "./content-model";
import { parsePoint, polygon, polyline } from "./geometry-validation";
import type { Point2, Size2, Spatial3D, Transform2D } from "./geometry";
import { deepFreeze } from "./immutability";
import type {
  AssetRecord,
  ProjectManifest,
  ProjectProfile,
  ProjectSnapshot,
  SpatialProject,
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

const SCHEMA_VERSION = 2 as const;
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

function schemaVersion(value: unknown, path: string): typeof SCHEMA_VERSION {
  if (value !== SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA_VERSION", path, `expected ${SCHEMA_VERSION}`);
  }
  return SCHEMA_VERSION;
}

function storedManifestSchemaVersion(value: unknown): typeof SCHEMA_VERSION {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail("INVALID_VALUE", "schemaVersion", "expected a positive safe integer");
  }
  if ((value as number) > SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", `expected at most ${SCHEMA_VERSION}`);
  }
  return SCHEMA_VERSION;
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

function parseAsset(value: unknown, path: string, registerId: RegisterId): AssetRecord {
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
    relativePath: parseRelativePath(source.relativePath, `${path}.relativePath`),
    mediaType: nonEmpty(source.mediaType, `${path}.mediaType`),
    size: nonNegativeInteger(source.size, `${path}.size`),
  };
}

function parseRelativePath(value: unknown, path: string): string {
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

function parseProject(value: unknown, registerId: RegisterId): SpatialProject {
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

function validateReferences(snapshot: ProjectSnapshot): void {
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

export function parseSnapshotV2(value: unknown): ProjectSnapshot {
  const source = record(value, "snapshot");
  const seenIds = new Map<string, string>();
  const registerId: RegisterId = (id, path) => {
    const firstPath = seenIds.get(id);
    if (firstPath !== undefined) {
      fail("DUPLICATE_UUID", path, `duplicates ${firstPath}`);
    }
    seenIds.set(id, path);
  };

  const candidate: ProjectSnapshot = {
    schemaVersion: schemaVersion(source.schemaVersion, "schemaVersion"),
    sequence: nonNegativeInteger(source.sequence, "sequence"),
    checkpointSequence: nonNegativeInteger(source.checkpointSequence, "checkpointSequence"),
    project: parseProject(source.project, registerId),
    assets: list(source.assets, "assets").map((asset, index) =>
      parseAsset(asset, `assets[${index}]`, registerId)),
  };

  validateReferences(candidate);
  return deepFreeze(candidate);
}

// Compatibility for the existing migration dispatcher; it validates the current snapshot shape.
export const parseSnapshotV1 = parseSnapshotV2;
