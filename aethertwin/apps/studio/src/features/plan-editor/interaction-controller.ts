import {
  parseSnapshotV3,
  type DimensionAnchor,
  type PlanLayer,
  type Point2,
  type ProjectSnapshot,
  type SpatialEntity,
} from "@aethertwin/core-model";
import {
  alignmentGuides,
  boxSelect,
  duplicateEntities,
  entityWorldVertices,
  findSnap,
  hitTest,
  screenToWorld,
  translateEntities,
  UniformGridSpatialIndex,
  type PlanEditIntent,
  type PointSnapCandidate,
  type PointSnapMode,
  type SnapResult,
  type ViewportTransform,
} from "@aethertwin/plan-engine";
import type { PlanPointerEvent } from "@aethertwin/render-plan-2d";
import type { StoreApi } from "zustand/vanilla";
import type { PlanEditorState, PlanTool } from "./editor-session";

export interface InteractionControllerDeps {
  readonly getSnapshot: () => ProjectSnapshot;
  readonly store: StoreApi<PlanEditorState>;
  readonly makeId: () => string;
  readonly applyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

export interface InteractionController {
  handle(event: PlanPointerEvent): Promise<void>;
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

type CreationTool = Exclude<PlanTool, "select" | "pan">;
type PointCreationTool = Extract<CreationTool, "boundary" | "wall" | "zone">;

interface ActiveContext {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly visibleLayerIds: ReadonlySet<string>;
  readonly editableLayerIds: ReadonlySet<string>;
  readonly entities: readonly SpatialEntity[];
  readonly creationLayer: PlanLayer | null;
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
  return {
    snapshot,
    activeFloorId: state.activeFloorId,
    visibleLayerIds,
    editableLayerIds,
    entities: snapshot.project.entities.filter((entity) => (
      entity.floorId === state.activeFloorId && visibleLayerIds.has(entity.layerId)
    )),
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

function hitEntity(context: ActiveContext, state: PlanEditorState, point: Point2): string | null {
  const entities = context.entities;
  const result = hitTest({
    point,
    tolerance: SNAP_TOLERANCE_PIXELS / state.viewport.pixelsPerMillimetre,
    entities,
    index: UniformGridSpatialIndex.from(entities),
    selectableIds: new Set(selectableEntities(context).map((entity) => entity.id)),
  });
  if (!result.ok) throw result.issue;
  return result.value;
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
    const hit = hitEntity(context, state, world);
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

    const current = [...state.selectedIds];
    if (event.shiftKey) {
      state.setSelection(
        state.selectedIds.has(hit)
          ? current.filter((id) => id !== hit)
          : [...current, hit],
      );
      gesture = null;
      return;
    }

    if (!state.selectedIds.has(hit)) state.setSelection([hit]);
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
    } else if (gesture.kind === "box-select") {
      finishBoxSelection(event, gesture, context);
    }
  };

  const deleteSelection = async (): Promise<void> => {
    const context = contextNow();
    const selectionBefore = [...deps.store.getState().selectedIds];
    const entities = selectableEntities(context, new Set(selectionBefore));
    if (entities.length === 0 || entities.length !== selectionBefore.length) {
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
    async handle(event) {
      try {
        synchronizeGesture();
        if (commitToken !== null) return;

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

    async keyDown(key, _modifiers) {
      const selectionBefore = [...deps.store.getState().selectedIds];
      try {
        synchronizeGesture();
        if (commitToken !== null) return;

        if (key === "Escape") {
          clearGesture();
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
          const selected = selectableEntities(
            context,
            deps.store.getState().selectedIds,
          );
          if (selected.length === 0 || selected.length !== selectionBefore.length) return;
          const delta = key === "ArrowLeft"
            ? { x: -GRID_SIZE_MILLIMETRES, y: 0 }
            : key === "ArrowRight"
              ? { x: GRID_SIZE_MILLIMETRES, y: 0 }
              : key === "ArrowUp"
                ? { x: 0, y: GRID_SIZE_MILLIMETRES }
                : { x: 0, y: -GRID_SIZE_MILLIMETRES };
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
    },
  };
}
