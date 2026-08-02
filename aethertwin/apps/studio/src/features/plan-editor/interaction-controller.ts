import {
  parseSnapshotV3,
  validateOpeningGeometry,
  type DimensionAnchor,
  type Fixture,
  type Opening,
  type OpeningGeometryIssue,
  type PlanLayer,
  type PlanReference,
  type Point2,
  type ProjectSnapshot,
  type SpatialEntity,
  type Wall,
} from "@aethertwin/core-model";
import {
  alignmentGuides,
  applyPlanReferenceTransform,
  boxSelect,
  createProductHotspotIntent,
  duplicateEntities,
  entityWorldVertices,
  findSnap,
  hitTestOpening,
  hitTestPlan,
  nearestOpeningPlacement,
  screenToWorld,
  translateEntities,
  UniformGridSpatialIndex,
  type PlanEditIntent,
  type PointSnapCandidate,
  type PointSnapMode,
  type SnapResult,
  type ViewportTransform,
} from "@aethertwin/plan-engine";
import {
  showroomFixture,
  type ShowroomFixtureDescriptor,
} from "@aethertwin/mode-showroom";
import type {
  AnySnapshotRecordsPatch,
  BuildingStructurePatch,
} from "@aethertwin/project-store";
import type { PlanPointerEvent } from "@aethertwin/render-plan-2d";
import type { StoreApi } from "zustand/vanilla";
import type {
  OpeningCreationTool,
  OpeningPreviewState,
  PlanEditorState,
  PlanTool,
} from "./editor-session";

export interface InteractionControllerDeps {
  readonly getSnapshot: () => ProjectSnapshot;
  readonly store: StoreApi<PlanEditorState>;
  readonly makeId: () => string;
  readonly applyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly applyPlanReferencePatch?: (
    before: PlanReference,
    after: PlanReference | null,
  ) => Promise<void>;
  readonly applySnapshotRecordPatches?: (
    patches: readonly AnySnapshotRecordsPatch[],
  ) => Promise<void>;
  readonly applyBuildingStructurePatch?: (
    patch: BuildingStructurePatch,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

export interface InteractionController {
  handle(event: PlanPointerEvent): Promise<void>;
  createAt(point: Point2): Promise<void>;
  keyDown(
    key:
      | "Enter"
      | "Escape"
      | "Delete"
      | "ArrowLeft"
      | "ArrowRight"
      | "ArrowUp"
      | "ArrowDown",
    modifiers?: { shiftKey?: boolean },
  ): Promise<void>;
  copy(): void;
  paste(offset?: Point2): Promise<void>;
  cancel(): void;
}

const SNAP_TOLERANCE_PIXELS = 8;
const GRID_SIZE_MILLIMETRES = 100;
const MIN_PIXELS_PER_MILLIMETRE = 0.0001;
const MAX_PIXELS_PER_MILLIMETRE = 10_000;
const WHEEL_ZOOM_SENSITIVITY = 0.001;
const PREVIEW_OPENING_ID = "00000000-0000-4000-8000-000000000000";
const PREVIEW_FIXTURE_ID = "00000000-0000-4000-8000-000000000000";
const PREVIEW_PRODUCT_HOTSPOT_ID = '00000000-0000-4000-8000-000000000010';
const OPENING_DEFAULTS: Readonly<Record<OpeningCreationTool, {
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
}>> = Object.freeze({
  door: Object.freeze({ width: 900, height: 2_100, sillHeight: 0 }),
  window: Object.freeze({ width: 1_200, height: 1_200, sillHeight: 900 }),
});

type CreationTool = Exclude<PlanTool, "select" | "pan">;
type PointCreationTool = Extract<CreationTool, "boundary" | "wall" | "zone">;

interface ActiveContext {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly editableLayerIds: ReadonlySet<string>;
  readonly entities: readonly SpatialEntity[];
  readonly openings: readonly Opening[];
  readonly creationLayer: PlanLayer | null;
  readonly references: readonly PlanReference[];
  readonly editableReferenceIds: ReadonlySet<string>;
}

interface EntitySeed {
  readonly id: string;
  readonly floorId: string;
  readonly layerId: string;
  readonly profile: ProjectSnapshot["project"]["profile"];
}

type ControllerGesture =
  | {
      readonly kind: "point-create";
      readonly tool: PointCreationTool;
      readonly pointerId: number;
      readonly seed: EntitySeed;
      readonly points: readonly Point2[];
    }
  | {
      readonly kind: "rectangle-create";
      readonly tool: "space-unit" | "fixture";
      readonly pointerId: number;
      readonly seed: EntitySeed;
      readonly start: Point2;
      readonly current: Point2;
    }
  | {
      readonly kind: "poi-create";
      readonly tool: "poi";
      readonly pointerId: number;
      readonly seed: EntitySeed;
      readonly point: Point2;
    }
  | {
      readonly kind: "dimension-create";
      readonly tool: "dimension";
      readonly pointerId: number;
      readonly seed: EntitySeed;
      readonly anchors: readonly DimensionAnchor[];
      readonly anchorPoints: readonly Point2[];
      readonly hoverOffsetPoint?: Point2;
      readonly confirmedOffsetPoint?: Point2;
    }
  | {
      readonly kind: "transform";
      readonly tool: "select";
      readonly pointerId: number;
      readonly origin: Point2;
      readonly originScreen: Point2;
      readonly selectedIds: readonly string[];
      readonly selectionBefore: readonly string[];
    }
  | {
      readonly kind: "reference-transform";
      readonly tool: "select";
      readonly pointerId: number;
      readonly origin: Point2;
      readonly originScreen: Point2;
      readonly referenceBefore: PlanReference;
      readonly selectionBefore: readonly string[];
    }
  | {
      readonly kind: "opening-transform";
      readonly tool: "select";
      readonly pointerId: number;
      readonly origin: Point2;
      readonly originScreen: Point2;
      readonly openingBefore: Opening;
      readonly selectionBefore: readonly string[];
    }
  | {
      readonly kind: "box-select";
      readonly tool: "select";
      readonly pointerId: number;
      readonly start: Point2;
      readonly current: Point2;
    }
  | {
      readonly kind: "pan";
      readonly tool: "pan";
      readonly pointerId: number;
      readonly startScreen: Point2;
      readonly startViewport: ViewportTransform;
    };

interface SnappedPoint {
  readonly point: Point2;
  readonly snap: SnapResult;
}

interface ProductHotspotPreview {
  readonly point: Point2;
  readonly sessionId: string;
  readonly floorId: string;
  readonly layerId: string;
}

function identityTransform(translation: Point2 = { x: 0, y: 0 }) {
  return {
    translation: { ...translation },
    rotation: 0,
    scale: { x: 1, y: 1 },
  } as const;
}

function activeContext(
  snapshot: ProjectSnapshot,
  state: PlanEditorState,
): ActiveContext {
  const floor = snapshot.project.floors.find((candidate) => candidate.id === state.activeFloorId);
  const visibleLayers = floor?.layers.filter((layer) => layer.visible) ?? [];
  const visibleLayerIds = new Set(visibleLayers.map((layer) => layer.id));
  const editableLayerIds = new Set(
    visibleLayers.filter((layer) => !layer.locked).map((layer) => layer.id),
  );
  const entities = snapshot.project.entities.filter((entity) => (
    entity.floorId === state.activeFloorId && visibleLayerIds.has(entity.layerId)
  ));
  const visibleWallIds = new Set(entities.flatMap((entity) => (
    entity.type === "wall" ? [entity.id] : []
  )));
  const references = snapshot.project.planReferences.filter((reference) => (
    reference.floorId === state.activeFloorId && visibleLayerIds.has(reference.layerId)
  ));
  return {
    snapshot,
    activeFloorId: state.activeFloorId,
    visibleLayerIds,
    editableLayerIds,
    entities,
    openings: snapshot.project.openings.filter((opening) => (
      visibleWallIds.has(opening.wallId)
    )),
    references,
    editableReferenceIds: new Set(references.filter((reference) => (
      !reference.locked && editableLayerIds.has(reference.layerId)
    )).map((reference) => reference.id)),
    creationLayer: visibleLayers.find((layer) => !layer.locked) ?? null,
  };
}

function pointModes(modes: ReadonlySet<PlanEditorState["snapModes"] extends ReadonlySet<infer T> ? T : never>) {
  const enabled = new Set<PointSnapMode>();
  for (const mode of modes) {
    if (mode !== "angle") enabled.add(mode);
  }
  return enabled;
}

function segmentCount(entity: SpatialEntity, points: readonly Point2[]): number {
  switch (entity.type) {
    case "boundary":
    case "zone":
    case "space-unit":
    case "fixture":
      return points.length;
    case "wall":
    case "dimension":
      return Math.max(0, points.length - 1);
    case "poi":
      return 0;
  }
}

function projectedPoint(point: Point2, start: Point2, end: Point2): Point2 {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return start;
  const t = Math.max(0, Math.min(1, (
    (point.x - start.x) * deltaX + (point.y - start.y) * deltaY
  ) / lengthSquared));
  return {
    x: start.x + deltaX * t,
    y: start.y + deltaY * t,
  };
}

function snapCandidates(
  worldPoint: Point2,
  entities: readonly SpatialEntity[],
): readonly PointSnapCandidate[] {
  const candidates: PointSnapCandidate[] = [];
  const referencePoints: Point2[] = [];

  for (const entity of entities) {
    const origin = entity.transform.translation;
    referencePoints.push(origin);
    candidates.push({ mode: "endpoint", point: origin, entityId: entity.id });

    const points = entityWorldVertices(entity);
    for (const point of points) {
      referencePoints.push(point);
      if (!samePoint(point, origin)) {
        candidates.push({ mode: "endpoint", point, entityId: entity.id });
      }
    }

    const count = segmentCount(entity, points);
    for (let index = 0; index < count; index += 1) {
      const start = points[index]!;
      const end = points[(index + 1) % points.length]!;
      candidates.push({
        mode: "midpoint",
        point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        entityId: entity.id,
      });
      candidates.push({
        mode: "edge",
        point: projectedPoint(worldPoint, start, end),
        entityId: entity.id,
      });
    }
  }

  const alignment = alignmentGuides({ worldPoint, referencePoints });
  if (alignment.ok) candidates.push(...alignment.value);
  return candidates;
}

function snappedPoint(
  event: PlanPointerEvent,
  context: ActiveContext,
  state: PlanEditorState,
): SnappedPoint {
  const worldPoint = screenToWorld(event.screen, state.viewport);
  if (event.altKey) {
    return { point: worldPoint, snap: { candidate: null, delta: { x: 0, y: 0 } } };
  }

  const result = findSnap({
    worldPoint,
    pixelsPerMillimetre: state.viewport.pixelsPerMillimetre,
    tolerancePixels: SNAP_TOLERANCE_PIXELS,
    modes: pointModes(state.snapModes),
    gridSize: GRID_SIZE_MILLIMETRES,
    candidates: snapCandidates(worldPoint, context.entities),
  });
  if (!result.ok) throw result.issue;
  const candidatePoint = result.value.candidate?.point;
  return {
    point: candidatePoint === undefined
      ? {
          x: worldPoint.x + result.value.delta.x,
          y: worldPoint.y + result.value.delta.y,
        }
      : { x: candidatePoint.x, y: candidatePoint.y },
    snap: result.value,
  };
}

function selectableEntities(
  context: ActiveContext,
  selectedIds?: ReadonlySet<string>,
): readonly SpatialEntity[] {
  return context.entities.filter((entity) => (
    !entity.locked
    && context.editableLayerIds.has(entity.layerId)
    && (selectedIds === undefined || selectedIds.has(entity.id))
  ));
}

function hitPlan(context: ActiveContext, state: PlanEditorState, point: Point2) {
  const entities = context.entities;
  const selectableIds = new Set([
    ...selectableEntities(context).map((entity) => entity.id),
    ...context.references.map((reference) => reference.id),
  ]);
  const result = hitTestPlan({
    point,
    tolerance: SNAP_TOLERANCE_PIXELS / state.viewport.pixelsPerMillimetre,
    entities,
    index: UniformGridSpatialIndex.from(entities),
    references: context.references,
    selectableIds,
  });
  if (!result.ok) throw result.issue;
  return result.value;
}

function openingAt(
  context: ActiveContext,
  state: PlanEditorState,
  point: Point2,
): Opening | undefined {
  const wallsById = new Map(
    context.entities
      .filter((entity): entity is Wall => entity.type === "wall")
      .map((wall) => [wall.id, wall] as const),
  );
  const toleranceWorld = SNAP_TOLERANCE_PIXELS
    / state.viewport.pixelsPerMillimetre;
  return [...context.openings]
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((opening) => {
      const wall = wallsById.get(opening.wallId);
      return wall !== undefined
        && hitTestOpening(point, opening, wall, toleranceWorld);
    });
}

function editableOpening(
  context: ActiveContext,
  opening: Opening,
): boolean {
  const wall = context.entities.find(
    (entity): entity is Wall => entity.type === "wall" && entity.id === opening.wallId,
  );
  return wall !== undefined
    && !wall.locked
    && context.editableLayerIds.has(wall.layerId);
}

interface OpeningDragPreview {
  readonly preview: Opening;
  readonly issue?: OpeningGeometryIssue;
}

function openingDragAt(
  context: ActiveContext,
  state: PlanEditorState,
  opening: Opening,
  point: Point2,
): OpeningDragPreview | null {
  const wall = context.entities.find(
    (entity): entity is Wall => entity.type === "wall" && entity.id === opening.wallId,
  );
  if (
    wall === undefined
    || wall.locked
    || !context.editableLayerIds.has(wall.layerId)
  ) return null;
  const candidate = nearestOpeningPlacement({
    point,
    walls: [wall],
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
    kind: opening.kind,
    hitToleranceWorld: SNAP_TOLERANCE_PIXELS / state.viewport.pixelsPerMillimetre,
  });
  if (candidate === undefined) return null;

  const preview: Opening = {
    ...opening,
    distanceAlongWall: candidate.distanceAlongWall,
  };
  const allWalls = context.snapshot.project.entities.filter(
    (entity): entity is Wall => entity.type === "wall",
  );
  const openings = context.snapshot.project.openings.map((record) => (
    record.id === opening.id ? preview : record
  ));
  const issue = validateOpeningGeometry(allWalls, openings).find(
    (candidateIssue) => candidateIssue.openingId === opening.id,
  );
  return issue === undefined ? { preview } : { preview, issue };
}

function openingGeometryError(issue: OpeningGeometryIssue): Error {
  const related = issue.relatedOpeningId === undefined
    ? ""
    : `; related opening ${issue.relatedOpeningId}`;
  return new Error(
    `${issue.code}: opening ${issue.openingId} on wall ${issue.wallId}${related}`,
  );
}

function baseEntity(seed: EntitySeed, name: string) {
  return {
    id: seed.id,
    name,
    tags: [],
    floorId: seed.floorId,
    layerId: seed.layerId,
    locked: false,
  } as const;
}

function pointCreationEntity(
  gesture: Extract<ControllerGesture, { kind: "point-create" }>,
): SpatialEntity | null {
  const base = baseEntity(gesture.seed, (
    gesture.tool === "boundary" ? "Boundary" : gesture.tool === "wall" ? "Wall" : "Zone"
  ));
  if (gesture.tool === "wall") {
    return gesture.points.length < 2 ? null : {
      ...base,
      type: "wall",
      transform: identityTransform(),
      centerLine: gesture.points,
      thickness: 100,
    };
  }
  if (gesture.points.length < 3) return null;
  return gesture.tool === "boundary"
    ? {
        ...base,
        type: "boundary",
        transform: identityTransform(),
        polygon: gesture.points,
      }
    : {
        ...base,
        type: "zone",
        transform: identityTransform(),
        polygon: gesture.points,
        purpose: "Zone",
        color: "#808080",
      };
}

function rectangleEntity(
  gesture: Extract<ControllerGesture, { kind: "rectangle-create" }>,
): SpatialEntity | null {
  const min = {
    x: Math.min(gesture.start.x, gesture.current.x),
    y: Math.min(gesture.start.y, gesture.current.y),
  };
  const max = {
    x: Math.max(gesture.start.x, gesture.current.x),
    y: Math.max(gesture.start.y, gesture.current.y),
  };
  const width = max.x - min.x;
  const height = max.y - min.y;
  if (width === 0 || height === 0) return null;

  if (gesture.tool === "fixture") {
    return {
      ...baseEntity(gesture.seed, "Fixture"),
      type: "fixture",
      transform: identityTransform(min),
      kind: "generic",
      size: { width, height },
    };
  }
  return {
    ...baseEntity(gesture.seed, "Space Unit"),
    type: "space-unit",
    transform: identityTransform(),
    kind: gesture.seed.profile === "market" ? "booth" : "room",
    footprint: [
      min,
      { x: max.x, y: min.y },
      max,
      { x: min.x, y: max.y },
    ],
  };
}

interface CatalogueFixturePlacement {
  readonly entity: Fixture;
  readonly center: Point2;
}

function catalogueFixtureEntity(
  seed: EntitySeed,
  descriptor: ShowroomFixtureDescriptor,
  center: Point2,
): Fixture {
  return {
    ...baseEntity(seed, descriptor.defaultName),
    type: "fixture",
    transform: identityTransform({
      x: center.x - descriptor.defaultSize.width / 2,
      y: center.y - descriptor.defaultSize.depth / 2,
    }),
    kind: descriptor.kind,
    size: {
      width: descriptor.defaultSize.width,
      height: descriptor.defaultSize.depth,
    },
    spatial3D: {
      elevation: 0,
      height: descriptor.defaultSize.height,
    },
  };
}

function catalogueFixturePlacement(
  event: PlanPointerEvent,
  context: ActiveContext,
  state: PlanEditorState,
  id: string,
): CatalogueFixturePlacement | null {
  if (
    context.snapshot.project.profile !== "showroom"
    || state.activeTool !== "fixture"
    || state.selectedFixtureKind === null
    || context.creationLayer === null
  ) return null;
  const descriptor = showroomFixture(state.selectedFixtureKind);
  const center = snappedPoint(event, context, state).point;
  return {
    center,
    entity: catalogueFixtureEntity({
      id,
      floorId: context.activeFloorId,
      layerId: context.creationLayer.id,
      profile: context.snapshot.project.profile,
    }, descriptor, center),
  };
}

function productHotspotPreviewEntity(
  preview: ProductHotspotPreview,
): SpatialEntity {
  return {
    id: PREVIEW_PRODUCT_HOTSPOT_ID,
    name: 'Product Hotspot',
    tags: [],
    floorId: preview.floorId,
    layerId: preview.layerId,
    transform: identityTransform(preview.point),
    locked: false,
    type: 'poi',
    kind: 'product-hotspot',
  };
}

function poiEntity(
  gesture: Extract<ControllerGesture, { kind: "poi-create" }>,
): SpatialEntity {
  return {
    ...baseEntity(gesture.seed, "Point of Interest"),
    type: "poi",
    transform: identityTransform(gesture.point),
    kind: "custom",
    radius: 100,
  };
}

function dimensionOffset(start: Point2, end: Point2, placement: Point2): number | null {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) return null;
  return (
    (placement.x - start.x) * (-deltaY / length)
    + (placement.y - start.y) * (deltaX / length)
  );
}

function dimensionEntity(
  gesture: Extract<ControllerGesture, { kind: "dimension-create" }>,
  placement = gesture.confirmedOffsetPoint,
): SpatialEntity | null {
  if (
    gesture.anchors.length !== 2
    || gesture.anchorPoints.length !== 2
    || placement === undefined
  ) return null;
  const offset = dimensionOffset(
    gesture.anchorPoints[0]!,
    gesture.anchorPoints[1]!,
    placement,
  );
  if (offset === null) return null;
  return {
    ...baseEntity(gesture.seed, "Dimension"),
    type: "dimension",
    transform: identityTransform(),
    start: gesture.anchors[0]!,
    end: gesture.anchors[1]!,
    offset,
  };
}

function createIntent(snapshot: ProjectSnapshot, entity: SpatialEntity): PlanEditIntent {
  const parsed = parseSnapshotV3({
    ...snapshot,
    project: {
      ...snapshot.project,
      entities: [...snapshot.project.entities, entity],
    },
  });
  const validated = parsed.project.entities.find((candidate) => candidate.id === entity.id);
  if (validated === undefined) throw new Error("Validated creation candidate was not retained.");
  return {
    reason: "create",
    changes: [{ id: validated.id, before: null, after: validated }],
  };
}

function transformPreview(intent: PlanEditIntent): readonly SpatialEntity[] {
  return intent.changes.flatMap((change) => change.after === null ? [] : [change.after]);
}

function samePoint(left: Point2, right: Point2): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameSelection(
  current: ReadonlySet<string>,
  expected: readonly string[],
): boolean {
  return current.size === expected.length && expected.every((id) => current.has(id));
}

function dimensionAnchor(
  snapped: SnappedPoint,
  context: ActiveContext,
): DimensionAnchor {
  const entityId = snapped.snap.candidate?.entityId;
  const entity = entityId === undefined
    ? undefined
    : context.entities.find((candidate) => candidate.id === entityId);
  if (entity !== undefined && samePoint(snapped.point, entity.transform.translation)) {
    return { kind: "entity", entityId: entity.id, locator: "origin" };
  }
  return { kind: "point", point: snapped.point };
}

function isOpeningCreationTool(tool: PlanTool): tool is OpeningCreationTool {
  return tool === "door" || tool === "window";
}

function eligibleOpeningWalls(context: ActiveContext): readonly Wall[] {
  if (context.snapshot.project.profile !== "showroom") return [];
  return context.entities.filter((entity): entity is Wall => (
    entity.type === "wall"
    && !entity.locked
    && context.editableLayerIds.has(entity.layerId)
  ));
}

function openingPreviewAt(
  event: PlanPointerEvent,
  context: ActiveContext,
  state: PlanEditorState,
): OpeningPreviewState | null {
  if (!isOpeningCreationTool(state.activeTool)) return null;
  const walls = eligibleOpeningWalls(context);
  if (walls.length === 0) return null;
  const dimensions = OPENING_DEFAULTS[state.activeTool];
  const candidate = nearestOpeningPlacement({
    point: screenToWorld(event.screen, state.viewport),
    walls,
    width: dimensions.width,
    height: dimensions.height,
    sillHeight: dimensions.sillHeight,
    kind: state.activeTool,
    hitToleranceWorld: SNAP_TOLERANCE_PIXELS / state.viewport.pixelsPerMillimetre,
  });
  if (candidate === undefined) return null;

  const previewOpening: Opening = {
    id: PREVIEW_OPENING_ID,
    name: "",
    tags: [],
    wallId: candidate.wallId,
    kind: state.activeTool,
    distanceAlongWall: candidate.distanceAlongWall,
    width: dimensions.width,
    height: dimensions.height,
    sillHeight: dimensions.sillHeight,
  };
  const allWalls = context.snapshot.project.entities.filter(
    (entity): entity is Wall => entity.type === "wall",
  );
  const issue = validateOpeningGeometry(
    allWalls,
    [...context.snapshot.project.openings, previewOpening],
  ).find(({ openingId }) => openingId === PREVIEW_OPENING_ID);
  const resolvedCandidate = issue === undefined
    ? { ...candidate, valid: true as const }
    : { ...candidate, valid: false as const, issue };
  return {
    sessionId: state.sessionId,
    tool: state.activeTool,
    candidate: resolvedCandidate,
    ...dimensions,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function cursorCentredZoom(
  event: PlanPointerEvent,
  viewport: ViewportTransform,
): ViewportTransform {
  const deltaY = event.wheelDelta?.y ?? 0;
  const factor = Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
  const pixelsPerMillimetre = Math.max(
    MIN_PIXELS_PER_MILLIMETRE,
    Math.min(MAX_PIXELS_PER_MILLIMETRE, viewport.pixelsPerMillimetre * factor),
  );
  const cursorWorld = screenToWorld(event.screen, viewport);
  return {
    width: viewport.width,
    height: viewport.height,
    pixelsPerMillimetre,
    center: {
      x: cursorWorld.x - (event.screen.x - viewport.width / 2) / pixelsPerMillimetre,
      y: cursorWorld.y + (event.screen.y - viewport.height / 2) / pixelsPerMillimetre,
    },
  };
}

export function createInteractionController(
  deps: InteractionControllerDeps,
): InteractionController {
  let gesture: ControllerGesture | null = null;
  let commitToken: symbol | null = null;
  let productHotspotPreview: ProductHotspotPreview | null = null;
  let productHotspotPointerId: number | null = null;

  const clearGesture = (): void => {
    gesture = null;
    deps.store.getState().cancelDraft();
  };

  const fail = (error: unknown, selection?: readonly string[]): void => {
    clearGesture();
    if (selection !== undefined) deps.store.getState().setSelection(selection);
    deps.onError(error);
  };

  const contextNow = (): ActiveContext => (
    activeContext(deps.getSnapshot(), deps.store.getState())
  );

  const publishOpeningPreview = (event: PlanPointerEvent): OpeningPreviewState | null => {
    const state = deps.store.getState();
    const preview = openingPreviewAt(event, contextNow(), state);
    if (preview === null) state.clearOpeningPreview();
    else state.setOpeningPreview(preview);
    return preview;
  };

  const publishCatalogueFixturePreview = (
    event: PlanPointerEvent,
  ): CatalogueFixturePlacement | null => {
    const state = deps.store.getState();
    const placement = catalogueFixturePlacement(
      event,
      contextNow(),
      state,
      PREVIEW_FIXTURE_ID,
    );
    if (placement !== null) {
      state.setFixturePlacementPreview(placement.entity, placement.center);
    }
    return placement;
  };
  const creationSeed = (context: ActiveContext): EntitySeed | null => {
    if (context.creationLayer === null) {
      fail(new Error("No visible, unlocked layer is available for creation."));
      return null;
    }
    return {
      id: deps.makeId(),
      floorId: context.activeFloorId,
      layerId: context.creationLayer.id,
      profile: context.snapshot.project.profile,
    };
  };

  const publishCreationDraft = (
    tool: CreationTool,
    points: readonly Point2[],
    preview: SpatialEntity | null,
  ): void => {
    const draft = {
      kind: "create" as const,
      tool,
      points,
      preview: preview === null ? [] : [preview],
    };
    const state = deps.store.getState();
    if (state.gestureActive) state.updateDraft(draft);
    else state.beginGesture(draft);
  };

  const clearProductHotspotPreview = (): void => {
    productHotspotPreview = null;
    productHotspotPointerId = null;
    const state = deps.store.getState();
    if (state.draft?.kind === 'create' && state.draft.tool === 'product-hotspot') {
      deps.store.setState({ draft: null, gestureActive: false });
    }
  };

  const publishProductHotspotDraft = (
    preview: ProductHotspotPreview,
  ): void => {
    deps.store.getState().updateDraft({
      kind: 'create',
      tool: 'product-hotspot',
      points: [preview.point],
      preview: [productHotspotPreviewEntity(preview)],
    });
    deps.store.setState({ gestureActive: false });
  };

  const publishProductHotspotPreview = (
    event: PlanPointerEvent,
  ): ProductHotspotPreview | null => {
    const state = deps.store.getState();
    const snapshot = deps.getSnapshot();
    const context = activeContext(snapshot, state);
    if (
      snapshot.project.profile !== 'showroom'
      || state.activeTool !== 'product-hotspot'
      || context.creationLayer === null
    ) {
      clearProductHotspotPreview();
      return null;
    }
    const preview: ProductHotspotPreview = {
      point: snappedPoint(event, context, state).point,
      sessionId: state.sessionId,
      floorId: state.activeFloorId,
      layerId: context.creationLayer.id,
    };
    productHotspotPreview = preview;
    publishProductHotspotDraft(preview);
    return preview;
  };

  const commitProductHotspot = async (
    preview: ProductHotspotPreview,
  ): Promise<void> => {
    if (commitToken !== null) return;
    const stateAtStart = deps.store.getState();
    const snapshot = deps.getSnapshot();
    const context = activeContext(snapshot, stateAtStart);
    const layerIsEligible = context.creationLayer?.id === preview.layerId
      && context.editableLayerIds.has(preview.layerId);
    if (
      snapshot.project.profile !== 'showroom'
      || stateAtStart.activeTool !== 'product-hotspot'
      || stateAtStart.sessionId !== preview.sessionId
      || stateAtStart.activeFloorId !== preview.floorId
      || !layerIsEligible
      || !Number.isFinite(preview.point.x)
      || !Number.isFinite(preview.point.y)
    ) {
      clearProductHotspotPreview();
      return;
    }
    if (deps.applySnapshotRecordPatches === undefined) {
      clearProductHotspotPreview();
      deps.onError(new Error('Product hotspot mutations are unavailable.'));
      return;
    }

    let entityId: string;
    let contentId: string;
    try {
      entityId = deps.makeId();
      contentId = deps.makeId();
    } catch (error) {
      clearProductHotspotPreview();
      deps.onError(error);
      return;
    }
    const result = createProductHotspotIntent({
      entityId,
      contentId,
      floorId: preview.floorId,
      layerId: preview.layerId,
      point: preview.point,
      name: 'Product Hotspot',
    });
    if (!result.ok) {
      clearProductHotspotPreview();
      deps.onError(result.issue);
      return;
    }

    const selectionBefore = [...stateAtStart.selectedIds];
    const token = Symbol('product-hotspot-commit');
    commitToken = token;
    productHotspotPreview = null;
    stateAtStart.finishGesture();
    try {
      await deps.applySnapshotRecordPatches([
        {
          collection: 'entities',
          changes: [{ id: entityId, before: null, after: result.value.entity }],
        },
        {
          collection: 'productContents',
          changes: [{ id: contentId, before: null, after: result.value.content }],
        },
      ]);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      const state = deps.store.getState();
      if (
        state.sessionId !== preview.sessionId
        || state.activeFloorId !== preview.floorId
        || state.activeTool !== 'product-hotspot'
      ) return;
      productHotspotPreview = preview;
      publishProductHotspotDraft(preview);
      if (sameSelection(state.selectedIds, selectionBefore)) {
        state.setSelection(selectionBefore);
      }
      deps.onError(error);
      return;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (
      state.sessionId !== preview.sessionId
      || state.activeFloorId !== preview.floorId
      || state.activeTool !== 'product-hotspot'
    ) return;
    if (sameSelection(state.selectedIds, selectionBefore)) {
      state.setSelection([entityId]);
    }
  };

  const commit = async (
    intent: PlanEditIntent,
    selectionBefore: readonly string[],
    selectionAfter?: readonly string[],
  ): Promise<boolean> => {
    if (commitToken !== null) return false;

    const token = Symbol("plan-edit-commit");
    const commitStartSelection = [...deps.store.getState().selectedIds];
    commitToken = token;
    gesture = null;
    deps.store.getState().finishGesture();

    try {
      await deps.applyPlanEdit(intent);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      const state = deps.store.getState();
      if (sameSelection(state.selectedIds, commitStartSelection)) {
        state.setSelection(selectionBefore);
      }
      deps.onError(error);
      return false;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (
      selectionAfter !== undefined
      && sameSelection(state.selectedIds, commitStartSelection)
    ) {
      state.setSelection(selectionAfter);
    }
    return true;
  };
  const commitReferencePatch = async (
    before: PlanReference,
    after: PlanReference | null,
    selectionBefore: readonly string[],
    selectionAfter?: readonly string[],
  ): Promise<boolean> => {
    if (commitToken !== null) return false;

    const token = Symbol("plan-reference-commit");
    const commitStartSelection = [...deps.store.getState().selectedIds];
    commitToken = token;
    gesture = null;
    deps.store.getState().finishGesture();

    try {
      if (deps.applyPlanReferencePatch === undefined) {
        throw new Error("Plan-reference mutations are unavailable.");
      }
      await deps.applyPlanReferencePatch(before, after);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      const state = deps.store.getState();
      if (sameSelection(state.selectedIds, commitStartSelection)) {
        state.setSelection(selectionBefore);
      }
      deps.onError(error);
      return false;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (
      selectionAfter !== undefined
      && sameSelection(state.selectedIds, commitStartSelection)
    ) {
      state.setSelection(selectionAfter);
    }
    return true;
  };


  const commitOpeningPatch = async (
    before: Opening,
    after: Opening | null,
    selectionBefore: readonly string[],
    selectionAfter?: readonly string[],
  ): Promise<boolean> => {
    if (commitToken !== null) return false;

    const token = Symbol("opening-patch-commit");
    const stateAtStart = deps.store.getState();
    const commitStartSelection = [...stateAtStart.selectedIds];
    const sessionId = stateAtStart.sessionId;
    commitToken = token;
    gesture = null;
    stateAtStart.finishGesture();

    try {
      if (deps.applySnapshotRecordPatches === undefined) {
        throw new Error("Opening mutations are unavailable.");
      }
      await deps.applySnapshotRecordPatches([{
        collection: "openings",
        changes: [{ id: before.id, before, after }],
      }]);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      const state = deps.store.getState();
      if (state.sessionId !== sessionId) return false;
      if (sameSelection(state.selectedIds, commitStartSelection)) {
        state.setSelection(selectionBefore);
      }
      deps.onError(error);
      return false;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (state.sessionId !== sessionId) return true;
    if (
      selectionAfter !== undefined
      && sameSelection(state.selectedIds, commitStartSelection)
    ) {
      state.setSelection(selectionAfter);
    }
    return true;
  };

  const commitBuildingStructurePatch = async (
    patch: BuildingStructurePatch,
    selectionBefore: readonly string[],
    selectionAfter?: readonly string[],
  ): Promise<boolean> => {
    if (commitToken !== null) return false;

    const token = Symbol("building-structure-commit");
    const stateAtStart = deps.store.getState();
    const commitStartSelection = [...stateAtStart.selectedIds];
    const sessionId = stateAtStart.sessionId;
    commitToken = token;
    gesture = null;
    stateAtStart.finishGesture();

    try {
      if (deps.applyBuildingStructurePatch === undefined) {
        throw new Error("Building structure mutations are unavailable.");
      }
      await deps.applyBuildingStructurePatch(patch);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      const state = deps.store.getState();
      if (state.sessionId !== sessionId) return false;
      if (sameSelection(state.selectedIds, commitStartSelection)) {
        state.setSelection(selectionBefore);
      }
      deps.onError(error);
      return false;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (state.sessionId !== sessionId) return true;
    if (
      selectionAfter !== undefined
      && sameSelection(state.selectedIds, commitStartSelection)
    ) {
      state.setSelection(selectionAfter);
    }
    return true;
  };

  const commitOpening = async (event: PlanPointerEvent): Promise<void> => {
    if (commitToken !== null) return;
    const preview = publishOpeningPreview(event);
    if (preview === null || !preview.candidate.valid) return;

    const openingId = deps.makeId();
    const opening: Opening = {
      id: openingId,
      name: preview.tool === "door" ? "Door" : "Window",
      tags: [],
      wallId: preview.candidate.wallId,
      kind: preview.tool,
      distanceAlongWall: preview.candidate.distanceAlongWall,
      width: preview.width,
      height: preview.height,
      sillHeight: preview.sillHeight,
    };
    const token = Symbol("opening-commit");
    const commitStartSelection = [...deps.store.getState().selectedIds];
    commitToken = token;

    try {
      if (deps.applySnapshotRecordPatches === undefined) {
        throw new Error("Opening mutations are unavailable.");
      }
      await deps.applySnapshotRecordPatches([{
        collection: "openings",
        changes: [{ id: openingId, before: null, after: opening }],
      }]);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      const state = deps.store.getState();
      if (state.sessionId !== preview.sessionId) return;
      state.setOpeningPreview({
        ...preview,
        persistenceError: errorMessage(error),
      });
      deps.onError(error);
      return;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (state.sessionId !== preview.sessionId) return;
    if (sameSelection(state.selectedIds, commitStartSelection)) {
      state.setSelection([openingId]);
    }
    if (state.openingPreview?.sessionId === preview.sessionId) {
      state.clearOpeningPreview();
    }
  };

  const commitCatalogueFixture = async (event: PlanPointerEvent): Promise<void> => {
    if (commitToken !== null) return;
    const stateAtStart = deps.store.getState();
    const snapshot = deps.getSnapshot();
    const context = activeContext(snapshot, stateAtStart);
    if (
      snapshot.project.profile !== "showroom"
      || stateAtStart.activeTool !== "fixture"
      || stateAtStart.selectedFixtureKind === null
    ) return;
    if (context.creationLayer === null) {
      deps.onError(new Error("No visible, unlocked layer is available for creation."));
      return;
    }

    const selectedKind = stateAtStart.selectedFixtureKind;
    let placement: CatalogueFixturePlacement;
    let intent: PlanEditIntent;
    try {
      const candidate = catalogueFixturePlacement(
        event,
        context,
        stateAtStart,
        deps.makeId(),
      );
      if (candidate === null) return;
      placement = candidate;
      intent = createIntent(snapshot, placement.entity);
    } catch (error) {
      deps.onError(error);
      return;
    }

    const token = Symbol("catalogue-fixture-commit");
    const sessionId = stateAtStart.sessionId;
    const commitStartSelection = [...stateAtStart.selectedIds];
    commitToken = token;
    try {
      await deps.applyPlanEdit(intent);
    } catch (error) {
      if (commitToken === token) commitToken = null;
      if (deps.store.getState().sessionId !== sessionId) return;
      deps.onError(error);
      return;
    }

    if (commitToken === token) commitToken = null;
    const state = deps.store.getState();
    if (
      state.sessionId !== sessionId
      || state.activeTool !== "fixture"
      || state.selectedFixtureKind !== selectedKind
    ) return;
    if (sameSelection(state.selectedIds, commitStartSelection)) {
      state.setSelection([placement.entity.id]);
    }
  };

  const commitCreation = async (
    entity: SpatialEntity | null,
    selectionBefore: readonly string[],
  ): Promise<void> => {
    if (entity === null) {
      clearGesture();
      return;
    }
    const snapshot = deps.getSnapshot();
    const current = activeContext(snapshot, deps.store.getState());
    const layerIsEligible = entity.floorId === current.activeFloorId
      && current.creationLayer !== null
      && current.editableLayerIds.has(entity.layerId);
    if (!layerIsEligible) {
      fail(new Error("The creation layer is no longer visible and unlocked."), selectionBefore);
      return;
    }

    let intent: PlanEditIntent;
    try {
      intent = createIntent(snapshot, entity);
    } catch (error) {
      fail(error, selectionBefore);
      return;
    }
    await commit(intent, selectionBefore);
  };

  const synchronizeGesture = (): void => {
    if (gesture === null) return;
    const state = deps.store.getState();
    if (gesture.tool !== state.activeTool || (gesture.kind !== "pan" && !state.gestureActive)) {
      gesture = null;
    }
  };

  const beginPointCreation = (
    tool: PointCreationTool,
    event: PlanPointerEvent,
    context: ActiveContext,
  ): void => {
    const snapped = snappedPoint(event, context, deps.store.getState()).point;
    if (gesture?.kind === "point-create" && gesture.tool === tool) {
      gesture = { ...gesture, points: [...gesture.points, snapped] };
    } else {
      const seed = creationSeed(context);
      if (seed === null) return;
      gesture = {
        kind: "point-create",
        tool,
        pointerId: event.pointerId,
        seed,
        points: [snapped],
      };
    }
    publishCreationDraft(tool, gesture.points, pointCreationEntity(gesture));
  };

  const beginRectangleCreation = (
    tool: "space-unit" | "fixture",
    event: PlanPointerEvent,
    context: ActiveContext,
  ): void => {
    const seed = creationSeed(context);
    if (seed === null) return;
    const point = snappedPoint(event, context, deps.store.getState()).point;
    gesture = {
      kind: "rectangle-create",
      tool,
      pointerId: event.pointerId,
      seed,
      start: point,
      current: point,
    };
    publishCreationDraft(tool, [point], null);
  };

  const beginPoiCreation = (
    event: PlanPointerEvent,
    context: ActiveContext,
  ): void => {
    const seed = creationSeed(context);
    if (seed === null) return;
    const point = snappedPoint(event, context, deps.store.getState()).point;
    gesture = {
      kind: "poi-create",
      tool: "poi",
      pointerId: event.pointerId,
      seed,
      point,
    };
    publishCreationDraft("poi", [point], poiEntity(gesture));
  };

  const beginDimensionCreation = (
    event: PlanPointerEvent,
    context: ActiveContext,
  ): void => {
    const snapped = snappedPoint(event, context, deps.store.getState());
    if (gesture?.kind !== "dimension-create") {
      const seed = creationSeed(context);
      if (seed === null) return;
      gesture = {
        kind: "dimension-create",
        tool: "dimension",
        pointerId: event.pointerId,
        seed,
        anchors: [dimensionAnchor(snapped, context)],
        anchorPoints: [snapped.point],
      };
    } else if (gesture.anchors.length < 2) {
      gesture = {
        ...gesture,
        anchors: [...gesture.anchors, dimensionAnchor(snapped, context)],
        anchorPoints: [...gesture.anchorPoints, snapped.point],
      };
    } else {
      gesture = { ...gesture, confirmedOffsetPoint: snapped.point };
    }
    const placement = gesture.confirmedOffsetPoint ?? gesture.hoverOffsetPoint;
    publishCreationDraft(
      "dimension",
      placement === undefined
        ? gesture.anchorPoints
        : [...gesture.anchorPoints, placement],
      dimensionEntity(gesture, placement),
    );
  };

  const beginSelection = (
    event: PlanPointerEvent,
    context: ActiveContext,
  ): void => {
    const state = deps.store.getState();
    const world = screenToWorld(event.screen, state.viewport);
    const opening = openingAt(context, state, world);
    if (opening !== undefined) {
      state.setSelection([opening.id]);
      if (!editableOpening(context, opening)) {
        gesture = null;
        return;
      }
      gesture = {
        kind: "opening-transform",
        tool: "select",
        pointerId: event.pointerId,
        origin: world,
        originScreen: { ...event.screen },
        openingBefore: opening,
        selectionBefore: [opening.id],
      };
      state.beginGesture({
        kind: "opening-transform",
        origin: world,
        preview: opening,
      });
      return;
    }

    const hit = hitPlan(context, state, world);
    if (hit === null) {
      gesture = {
        kind: "box-select",
        tool: "select",
        pointerId: event.pointerId,
        start: world,
        current: world,
      };
      state.beginGesture({ kind: "box-select", start: world, current: world });
      return;
    }

    if (hit.kind === "plan-reference") {
      const reference = context.references.find(({ id }) => id === hit.referenceId);
      if (reference === undefined) {
        gesture = null;
        return;
      }
      state.setSelection([reference.id]);
      if (!context.editableReferenceIds.has(reference.id)) {
        gesture = null;
        return;
      }
      gesture = {
        kind: "reference-transform",
        tool: "select",
        pointerId: event.pointerId,
        origin: world,
        originScreen: { ...event.screen },
        referenceBefore: reference,
        selectionBefore: [reference.id],
      };
      state.beginGesture({
        kind: "reference-transform",
        origin: world,
        preview: reference,
      });
      return;
    }

    const entityId = hit.entityId;
    const current = [...state.selectedIds];
    if (event.shiftKey) {
      const entityIds = new Set(context.entities.map(({ id }) => id));
      const currentEntities = current.filter((id) => entityIds.has(id));
      state.setSelection(
        state.selectedIds.has(entityId)
          ? currentEntities.filter((id) => id !== entityId)
          : [...currentEntities, entityId],
      );
      gesture = null;
      return;
    }

    if (!state.selectedIds.has(entityId)) state.setSelection([entityId]);
    const selectedIds = [...deps.store.getState().selectedIds];
    const selected = selectableEntities(context, new Set(selectedIds));
    if (selected.length === 0) {
      gesture = null;
      return;
    }
    const previewResult = translateEntities(selected, { x: 0, y: 0 });
    if (!previewResult.ok) throw previewResult.issue;
    gesture = {
      kind: "transform",
      tool: "select",
      pointerId: event.pointerId,
      origin: world,
      originScreen: { ...event.screen },
      selectedIds,
      selectionBefore: selectedIds,
    };
    deps.store.getState().beginGesture({
      kind: "transform",
      origin: world,
      preview: transformPreview(previewResult.value),
    });
  };

  const beginPan = (event: PlanPointerEvent): void => {
    gesture = {
      kind: "pan",
      tool: "pan",
      pointerId: event.pointerId,
      startScreen: event.screen,
      startViewport: deps.store.getState().viewport,
    };
    deps.store.setState({ draft: null, gestureActive: true });
  };

  const handlePointerDown = (event: PlanPointerEvent): void => {
    const state = deps.store.getState();
    const context = contextNow();
    switch (state.activeTool) {
      case "boundary":
      case "wall":
      case "zone":
        beginPointCreation(state.activeTool, event, context);
        break;
      case "space-unit":
      case "fixture":
        beginRectangleCreation(state.activeTool, event, context);
        break;
      case "poi":
        beginPoiCreation(event, context);
        break;
      case "dimension":
        beginDimensionCreation(event, context);
        break;
      case "select":
        beginSelection(event, context);
        break;
      case "pan":
        beginPan(event);
        break;
    }
  };

  const previewTransform = (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "transform" }>,
    context: ActiveContext,
  ): void => {
    const point = snappedPoint(event, context, deps.store.getState()).point;
    const delta = {
      x: point.x - currentGesture.origin.x,
      y: point.y - currentGesture.origin.y,
    };
    const selected = selectableEntities(context, new Set(currentGesture.selectedIds));
    const result = translateEntities(selected, delta);
    if (!result.ok) throw result.issue;
    deps.store.getState().updateDraft({
      kind: "transform",
      origin: currentGesture.origin,
      preview: transformPreview(result.value),
    });
  };
  const previewReferenceTransform = (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "reference-transform" }>,
    context: ActiveContext,
  ): void => {
    if (!context.editableReferenceIds.has(currentGesture.referenceBefore.id)) {
      clearGesture();
      return;
    }
    const point = snappedPoint(event, context, deps.store.getState()).point;
    const delta = {
      x: point.x - currentGesture.origin.x,
      y: point.y - currentGesture.origin.y,
    };
    const reference = currentGesture.referenceBefore;
    const result = applyPlanReferenceTransform(reference, {
      ...reference.transform,
      translation: {
        x: reference.transform.translation.x + delta.x,
        y: reference.transform.translation.y + delta.y,
      },
    });
    if (!result.ok) throw result.issue;
    deps.store.getState().updateDraft({
      kind: "reference-transform",
      origin: currentGesture.origin,
      preview: result.value,
    });
  };


  const previewOpeningTransform = (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "opening-transform" }>,
    context: ActiveContext,
  ): void => {
    const opening = context.openings.find(
      (candidate) => candidate.id === currentGesture.openingBefore.id,
    );
    if (opening === undefined || !editableOpening(context, opening)) {
      clearGesture();
      return;
    }
    const point = screenToWorld(event.screen, deps.store.getState().viewport);
    const result = openingDragAt(context, deps.store.getState(), opening, point);
    if (result === null) return;
    deps.store.getState().updateDraft({
      kind: "opening-transform",
      origin: currentGesture.origin,
      preview: result.preview,
      ...(result.issue === undefined ? {} : { issue: result.issue }),
    });
  };

  const handlePointerMove = (event: PlanPointerEvent): void => {
    if (gesture === null) return;
    if (gesture.pointerId !== event.pointerId) return;
    if (
      (event.buttons & 1) === 0
      && gesture.kind !== "point-create"
      && gesture.kind !== "dimension-create"
    ) {
      clearGesture();
      return;
    }

    if (gesture.kind === "pan") {
      const { startViewport } = gesture;
      deps.store.getState().setViewport({
        ...startViewport,
        center: {
          x: startViewport.center.x
            - (event.screen.x - gesture.startScreen.x) / startViewport.pixelsPerMillimetre,
          y: startViewport.center.y
            + (event.screen.y - gesture.startScreen.y) / startViewport.pixelsPerMillimetre,
        },
      });
      return;
    }

    const context = contextNow();
    if (gesture.kind === "point-create") {
      const point = snappedPoint(event, context, deps.store.getState()).point;
      const previewGesture = { ...gesture, points: [...gesture.points, point] };
      publishCreationDraft(
        gesture.tool, previewGesture.points, pointCreationEntity(previewGesture),
      );
    } else if (gesture.kind === "rectangle-create") {
      const point = snappedPoint(event, context, deps.store.getState()).point;
      gesture = { ...gesture, current: point };
      publishCreationDraft(gesture.tool, [gesture.start, point], rectangleEntity(gesture));
    } else if (gesture.kind === "poi-create") {
      const point = snappedPoint(event, context, deps.store.getState()).point;
      gesture = { ...gesture, point };
      publishCreationDraft("poi", [point], poiEntity(gesture));
    } else if (gesture.kind === "dimension-create" && gesture.anchors.length === 2) {
      const point = snappedPoint(event, context, deps.store.getState()).point;
      gesture = { ...gesture, hoverOffsetPoint: point };
      publishCreationDraft(
        "dimension",
        [...gesture.anchorPoints, point],
        dimensionEntity(gesture, point),
      );
    } else if (gesture.kind === "transform") {
      previewTransform(event, gesture, context);
    } else if (gesture.kind === "reference-transform") {
      previewReferenceTransform(event, gesture, context);
    } else if (gesture.kind === "opening-transform") {
      previewOpeningTransform(event, gesture, context);
    } else if (gesture.kind === "box-select") {
      const current = screenToWorld(event.screen, deps.store.getState().viewport);
      gesture = { ...gesture, current };
      deps.store.getState().updateDraft({
        kind: "box-select",
        start: gesture.start,
        current,
      });
    }
  };

  const finishTransform = async (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "transform" }>,
    context: ActiveContext,
  ): Promise<void> => {
    if (samePoint(event.screen, currentGesture.originScreen)) {
      clearGesture();
      return;
    }
    const point = snappedPoint(event, context, deps.store.getState()).point;
    const delta = {
      x: point.x - currentGesture.origin.x,
      y: point.y - currentGesture.origin.y,
    };
    if (delta.x === 0 && delta.y === 0) {
      clearGesture();
      return;
    }
    const selected = selectableEntities(context, new Set(currentGesture.selectedIds));
    const result = translateEntities(selected, delta);
    if (!result.ok) {
      fail(result.issue, currentGesture.selectionBefore);
      return;
    }
    await commit(result.value, currentGesture.selectionBefore);
  };
  const finishReferenceTransform = async (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "reference-transform" }>,
    context: ActiveContext,
  ): Promise<void> => {
    if (samePoint(event.screen, currentGesture.originScreen)) {
      clearGesture();
      return;
    }
    if (!context.editableReferenceIds.has(currentGesture.referenceBefore.id)) {
      clearGesture();
      return;
    }
    const point = snappedPoint(event, context, deps.store.getState()).point;
    const delta = {
      x: point.x - currentGesture.origin.x,
      y: point.y - currentGesture.origin.y,
    };
    if (delta.x === 0 && delta.y === 0) {
      clearGesture();
      return;
    }
    const reference = currentGesture.referenceBefore;
    const result = applyPlanReferenceTransform(reference, {
      ...reference.transform,
      translation: {
        x: reference.transform.translation.x + delta.x,
        y: reference.transform.translation.y + delta.y,
      },
    });
    if (!result.ok) {
      fail(result.issue, currentGesture.selectionBefore);
      return;
    }
    await commitReferencePatch(reference, result.value, currentGesture.selectionBefore);
  };


  const finishOpeningTransform = async (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "opening-transform" }>,
    context: ActiveContext,
  ): Promise<void> => {
    if (samePoint(event.screen, currentGesture.originScreen)) {
      clearGesture();
      return;
    }
    const opening = context.openings.find(
      (candidate) => candidate.id === currentGesture.openingBefore.id,
    );
    if (opening === undefined || !editableOpening(context, opening)) {
      clearGesture();
      return;
    }
    const point = screenToWorld(event.screen, deps.store.getState().viewport);
    const result = openingDragAt(context, deps.store.getState(), opening, point);
    if (result === null) {
      clearGesture();
      return;
    }
    if (result.issue !== undefined) {
      fail(openingGeometryError(result.issue), currentGesture.selectionBefore);
      return;
    }
    if (result.preview.distanceAlongWall === opening.distanceAlongWall) {
      clearGesture();
      return;
    }
    await commitOpeningPatch(
      opening,
      result.preview,
      currentGesture.selectionBefore,
    );
  };

  const finishBoxSelection = (
    event: PlanPointerEvent,
    currentGesture: Extract<ControllerGesture, { kind: "box-select" }>,
    context: ActiveContext,
  ): void => {
    const current = screenToWorld(event.screen, deps.store.getState().viewport);
    const result = boxSelect({
      bounds: { min: currentGesture.start, max: current },
      mode: "contain",
      entities: context.entities,
      index: UniformGridSpatialIndex.from(context.entities),
      selectableIds: new Set(selectableEntities(context).map((entity) => entity.id)),
    });
    if (!result.ok) {
      fail(result.issue);
      return;
    }
    gesture = null;
    deps.store.getState().setSelection(result.value);
    deps.store.getState().finishGesture();
  };

  const handlePointerUp = async (event: PlanPointerEvent): Promise<void> => {
    if (gesture === null) return;
    if ("pointerId" in gesture && gesture.pointerId !== event.pointerId) return;

    if (gesture.kind === "pan") {
      clearGesture();
      return;
    }

    const context = contextNow();
    const selectionBefore = [...deps.store.getState().selectedIds];
    if (gesture.kind === "point-create") {
      if (gesture.tool === "wall" && gesture.points.length >= 2) {
        await commitCreation(pointCreationEntity(gesture), selectionBefore);
      }
    } else if (gesture.kind === "rectangle-create") {
      const point = snappedPoint(event, context, deps.store.getState()).point;
      gesture = { ...gesture, current: point };
      await commitCreation(rectangleEntity(gesture), selectionBefore);
    } else if (gesture.kind === "poi-create") {
      await commitCreation(poiEntity(gesture), selectionBefore);
    } else if (gesture.kind === "dimension-create") {
      if (gesture.confirmedOffsetPoint !== undefined) {
        await commitCreation(dimensionEntity(gesture), selectionBefore);
      }
    } else if (gesture.kind === "transform") {
      await finishTransform(event, gesture, context);
    } else if (gesture.kind === "reference-transform") {
      await finishReferenceTransform(event, gesture, context);
    } else if (gesture.kind === "opening-transform") {
      await finishOpeningTransform(event, gesture, context);
    } else if (gesture.kind === "box-select") {
      finishBoxSelection(event, gesture, context);
    }
  };

  const deleteSelection = async (): Promise<void> => {
    const context = contextNow();
    const selectionBefore = [...deps.store.getState().selectedIds];
    if (selectionBefore.length === 1) {
      const opening = context.openings.find(({ id }) => id === selectionBefore[0]);
      if (opening !== undefined) {
        if (!editableOpening(context, opening)) return;
        await commitOpeningPatch(opening, null, selectionBefore, []);
        return;
      }
      const reference = context.references.find(({ id }) => id === selectionBefore[0]);
      if (reference !== undefined) {
        if (!context.editableReferenceIds.has(reference.id)) return;
        await commitReferencePatch(reference, null, selectionBefore, []);
        return;
      }
    }

    const entities = selectableEntities(context, new Set(selectionBefore));
    if (entities.length === 0 || entities.length !== selectionBefore.length) {
      return;
    }
    const selectedWalls = entities.filter(
      (entity): entity is Wall => entity.type === "wall",
    );
    const selectedWallIds = new Set(selectedWalls.map(({ id }) => id));
    const attachedOpenings = context.snapshot.project.openings.filter((opening) => (
      selectedWallIds.has(opening.wallId)
    ));
    if (attachedOpenings.length > 0) {
      if (selectedWalls.length !== entities.length) {
        fail(
          new Error("Delete walls with attached openings separately from other objects."),
          selectionBefore,
        );
        return;
      }
      await commitBuildingStructurePatch({
        reason: "delete",
        wallChanges: selectedWalls.map((wall) => ({
          id: wall.id,
          before: wall,
          after: null,
        })),
        openingChanges: attachedOpenings.map((opening) => ({
          id: opening.id,
          before: opening,
          after: null,
        })),
      }, selectionBefore, []);
      return;
    }

    const intent: PlanEditIntent = {
      reason: "delete",
      changes: entities.map((entity) => ({
        id: entity.id,
        before: structuredClone(entity),
        after: null,
      })),
    };
    await commit(intent, selectionBefore, []);
  };

  return {
    async createAt(point) {
      try {
        synchronizeGesture();
        if (commitToken !== null) return;
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          clearProductHotspotPreview();
          deps.onError(new Error('Product hotspot coordinates must be finite.'));
          return;
        }
        const state = deps.store.getState();
        const snapshot = deps.getSnapshot();
        const context = activeContext(snapshot, state);
        if (
          snapshot.project.profile !== 'showroom'
          || state.activeTool !== 'product-hotspot'
          || context.creationLayer === null
        ) {
          clearProductHotspotPreview();
          return;
        }
        await commitProductHotspot({
          point: { x: point.x, y: point.y },
          sessionId: state.sessionId,
          floorId: state.activeFloorId,
          layerId: context.creationLayer.id,
        });
      } catch (error) {
        clearProductHotspotPreview();
        deps.onError(error);
      }
    },

    async handle(event) {
      try {
        synchronizeGesture();
        if (commitToken !== null) return;

        const activeTool = deps.store.getState().activeTool;
        if (activeTool !== 'product-hotspot' && productHotspotPreview !== null) {
          clearProductHotspotPreview();
        }
        if (activeTool === 'product-hotspot' && event.type !== 'wheel') {
          if (event.type === 'pointercancel') {
            if (
              productHotspotPointerId !== null
              && productHotspotPointerId !== event.pointerId
            ) return;
            clearProductHotspotPreview();
          } else if (event.type === 'pointermove') {
            if (
              productHotspotPointerId !== null
              && productHotspotPointerId !== event.pointerId
            ) return;
            publishProductHotspotPreview(event);
          } else if (event.type === 'pointerdown') {
            if ((event.buttons & 1) === 0) return;
            if (
              productHotspotPointerId !== null
              && productHotspotPointerId !== event.pointerId
            ) return;
            if (publishProductHotspotPreview(event) !== null) {
              productHotspotPointerId = event.pointerId;
            }
          } else if (productHotspotPointerId === event.pointerId) {
            productHotspotPointerId = null;
            if (productHotspotPreview !== null) {
              await commitProductHotspot(productHotspotPreview);
            }
          }
          return;
        }
        if (
          activeTool === "fixture"
          && deps.getSnapshot().project.profile === "showroom"
          && event.type !== "wheel"
        ) {
          if (event.type === "pointercancel") {
            deps.store.getState().clearFixturePlacementPreview();
          } else if (event.type === "pointermove") {
            publishCatalogueFixturePreview(event);
          } else if (event.type === "pointerup") {
            await commitCatalogueFixture(event);
          }
          return;
        }
        if (isOpeningCreationTool(activeTool)) {
          if (event.type === "pointercancel") {
            deps.store.getState().clearOpeningPreview();
            return;
          }
          if (event.type === "pointermove") {
            publishOpeningPreview(event);
            return;
          }
          if (event.type === "pointerdown") return;
          if (event.type === "pointerup") {
            await commitOpening(event);
            return;
          }
        }

        if (event.type === "pointercancel") {
          if (gesture !== null && gesture.pointerId !== event.pointerId) return;
          clearGesture();
        } else if (event.type === "wheel") {
          deps.store.getState().setViewport(
            cursorCentredZoom(event, deps.store.getState().viewport),
          );
        } else if (event.type === "pointerdown") {
          if ((event.buttons & 1) === 0) return;
          if (gesture !== null && gesture.pointerId !== event.pointerId) return;
          handlePointerDown(event);
        } else if (event.type === "pointermove") {
          handlePointerMove(event);
        } else {
          await handlePointerUp(event);
        }
      } catch (error) {
        fail(error);
      }
    },

    async keyDown(key, modifiers) {
      const selectionBefore = [...deps.store.getState().selectedIds];
      void modifiers;
      try {
        synchronizeGesture();
        if (commitToken !== null) return;

        if (key === "Escape") {
          const state = deps.store.getState();
          clearGesture();
          state.clearOpeningPreview();
          if (
            isOpeningCreationTool(state.activeTool)
            || state.activeTool === 'product-hotspot'
            || (
              state.activeTool === "fixture"
              && deps.getSnapshot().project.profile === "showroom"
            )
          ) {
            state.setActiveTool("select");
          }
          return;
        }
        if (key === "Delete") {
          await deleteSelection();
          return;
        }
        if (
          key === "ArrowLeft"
          || key === "ArrowRight"
          || key === "ArrowUp"
          || key === "ArrowDown"
        ) {
          const context = contextNow();
          const delta = key === "ArrowLeft"
            ? { x: -GRID_SIZE_MILLIMETRES, y: 0 }
            : key === "ArrowRight"
              ? { x: GRID_SIZE_MILLIMETRES, y: 0 }
              : key === "ArrowUp"
                ? { x: 0, y: GRID_SIZE_MILLIMETRES }
                : { x: 0, y: -GRID_SIZE_MILLIMETRES };

          if (selectionBefore.length === 1) {
            const reference = context.references.find(({ id }) => id === selectionBefore[0]);
            if (reference !== undefined) {
              if (!context.editableReferenceIds.has(reference.id)) return;
              const result = applyPlanReferenceTransform(reference, {
                ...reference.transform,
                translation: {
                  x: reference.transform.translation.x + delta.x,
                  y: reference.transform.translation.y + delta.y,
                },
              });
              if (!result.ok) {
                fail(result.issue, selectionBefore);
                return;
              }
              await commitReferencePatch(reference, result.value, selectionBefore);
              return;
            }
          }

          const selected = selectableEntities(
            context,
            deps.store.getState().selectedIds,
          );
          if (selected.length === 0 || selected.length !== selectionBefore.length) return;
          const result = translateEntities(selected, delta);
          if (!result.ok) {
            fail(result.issue, selectionBefore);
            return;
          }
          await commit(result.value, selectionBefore);
          return;
        }
        if (
          key === "Enter"
          && gesture?.kind === "point-create"
          && (gesture.tool === "boundary" || gesture.tool === "zone")
        ) {
          if (gesture.points.length < 3) {
            clearGesture();
            return;
          }
          await commitCreation(pointCreationEntity(gesture), selectionBefore);
        }
      } catch (error) {
        fail(error, selectionBefore);
      }
    },

    copy() {
      try {
        synchronizeGesture();
        if (commitToken !== null) return;

        const context = contextNow();
        const selected = selectableEntities(
          context,
          deps.store.getState().selectedIds,
        );
        deps.store.getState().setClipboard(selected);
      } catch (error) {
        fail(error);
      }
    },

    async paste(offset = { x: 100, y: -100 }) {
      const selectionBefore = [...deps.store.getState().selectedIds];
      try {
        synchronizeGesture();
        if (commitToken !== null) return;

        const context = contextNow();
        const clipboard = deps.store.getState().clipboard.filter((entity) => (
          entity.floorId === context.activeFloorId
          && context.editableLayerIds.has(entity.layerId)
          && !entity.locked
        ));
        if (clipboard.length === 0) return;
        const result = duplicateEntities(clipboard, offset, deps.makeId);
        if (!result.ok) {
          fail(result.issue, selectionBefore);
          return;
        }

        const additions = result.value.changes.flatMap((change) => (
          change.after === null ? [] : [change.after]
        ));
        const parsed = parseSnapshotV3({
          ...context.snapshot,
          project: {
            ...context.snapshot.project,
            entities: [...context.snapshot.project.entities, ...additions],
          },
        });
        const validatedById = new Map(parsed.project.entities.map((entity) => [entity.id, entity]));
        const intent: PlanEditIntent = {
          ...result.value,
          changes: result.value.changes.map((change) => ({
            ...change,
            after: validatedById.get(change.id) ?? null,
          })),
        };
        await commit(intent, selectionBefore);
      } catch (error) {
        fail(error, selectionBefore);
      }
    },

    cancel() {
      synchronizeGesture();
      if (commitToken !== null) return;
      clearGesture();
      clearProductHotspotPreview();
      deps.store.getState().clearOpeningPreview();
    },
  };
}
