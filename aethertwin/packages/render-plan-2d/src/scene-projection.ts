import type {
  Bounds2,
  Floor,
  Point2,
  SpatialEntity,
} from "@aethertwin/core-model";
import {
  applyTransform,
  dimensionGeometry,
  entityWorldBounds,
  entityWorldVertices,
  UniformGridSpatialIndex,
  worldToScreen,
  type ViewportTransform,
} from "@aethertwin/plan-engine";
import type {
  PlanRendererInput,
  RenderGeometry,
  RenderNode,
  RenderScene,
} from "./types";

const GRID_NAMESPACE = "__aethertwin:grid:";
const DRAFT_NAMESPACE = "__aethertwin:draft:";
const SELECTION_NAMESPACE = "__aethertwin:selection:";
const GRID_TARGET_PIXELS = 32;
const POI_MIN_MARKER_PIXELS = 6;
const POI_POLYGON_SEGMENTS = 32;

interface ProjectedGeometry {
  readonly geometry: RenderGeometry;
  readonly bounds: Bounds2;
  readonly worldBounds: Bounds2;
}

function compareKeys(left: RenderNode, right: RenderNode): number {
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

function boundsFromPoints(points: readonly Point2[]): Bounds2 {
  const first = points[0] ?? { x: 0, y: 0 };
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function screenBoundsFromWorldBounds(
  bounds: Bounds2,
  viewport: ViewportTransform,
): Bounds2 {
  const topLeft = worldToScreen({ x: bounds.min.x, y: bounds.max.y }, viewport);
  const bottomRight = worldToScreen({ x: bounds.max.x, y: bounds.min.y }, viewport);
  return {
    min: { x: topLeft.x, y: topLeft.y },
    max: { x: bottomRight.x, y: bottomRight.y },
  };
}

function viewportWorldBounds(viewport: ViewportTransform): Bounds2 {
  worldToScreen(viewport.center, viewport);
  const halfWidth = viewport.width / (2 * viewport.pixelsPerMillimetre);
  const halfHeight = viewport.height / (2 * viewport.pixelsPerMillimetre);
  return {
    min: { x: viewport.center.x - halfWidth, y: viewport.center.y - halfHeight },
    max: { x: viewport.center.x + halfWidth, y: viewport.center.y + halfHeight },
  };
}

function intersects(left: Bounds2, right: Bounds2): boolean {
  return left.min.x <= right.max.x
    && left.max.x >= right.min.x
    && left.min.y <= right.max.y
    && left.max.y >= right.min.y;
}

function screenPoints(points: readonly Point2[], viewport: ViewportTransform): readonly Point2[] {
  return points.map((point) => worldToScreen(point, viewport));
}

function dimensionProjection(
  entity: Extract<SpatialEntity, { type: "dimension" }>,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
  viewport: ViewportTransform,
): ProjectedGeometry | null {
  const result = dimensionGeometry(entity, entitiesById);
  if (!result.ok) return null;
  const value = result.value;
  const worldPoints = [
    value.extensionLines[0].start,
    value.extensionLines[0].end,
    value.extensionLines[1].start,
    value.extensionLines[1].end,
    value.dimensionLine.start,
    value.dimensionLine.end,
    value.labelPoint,
  ];
  const worldBounds = boundsFromPoints(worldPoints);
  return {
    geometry: {
      kind: "dimension",
      start: worldToScreen(value.dimensionLine.start, viewport),
      end: worldToScreen(value.dimensionLine.end, viewport),
      label: worldToScreen(value.labelPoint, viewport),
      millimetres: value.measuredMillimetres,
    },
    bounds: screenBoundsFromWorldBounds(worldBounds, viewport),
    worldBounds,
  };
}

function entityProjection(
  entity: SpatialEntity,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
  viewport: ViewportTransform,
): ProjectedGeometry | null {
  if (entity.type === "dimension") {
    return dimensionProjection(entity, entitiesById, viewport);
  }

  const worldBounds = entityWorldBounds(entity);
  const bounds = screenBoundsFromWorldBounds(worldBounds, viewport);
  switch (entity.type) {
    case "boundary":
    case "zone":
    case "space-unit":
    case "fixture":
      return {
        geometry: {
          kind: "polygon",
          points: screenPoints(entityWorldVertices(entity), viewport),
          closed: true,
        },
        bounds,
        worldBounds,
      };
    case "wall":
      return {
        geometry: {
          kind: "polyline",
          points: screenPoints(entityWorldVertices(entity), viewport),
          closed: false,
        },
        bounds,
        worldBounds,
      };
    case "poi": {
      const center = worldToScreen(applyTransform({ x: 0, y: 0 }, entity.transform), viewport);
      const radius = Math.max(0, entity.radius ?? 0);
      const scaleX = Math.abs(entity.transform.scale.x);
      const scaleY = Math.abs(entity.transform.scale.y);
      const maximumScreenRadius = radius
        * Math.max(scaleX, scaleY)
        * viewport.pixelsPerMillimetre;
      const geometry: RenderGeometry = maximumScreenRadius < POI_MIN_MARKER_PIXELS
        || scaleX === scaleY
        ? {
            kind: "circle",
            center,
            radius: Math.max(maximumScreenRadius, POI_MIN_MARKER_PIXELS),
          }
        : {
            kind: "polygon",
            points: Array.from({ length: POI_POLYGON_SEGMENTS }, (_, index) => {
              const angle = (index * Math.PI * 2) / POI_POLYGON_SEGMENTS;
              const localPoint = {
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
              };
              return worldToScreen(applyTransform(localPoint, entity.transform), viewport);
            }),
            closed: true,
          };
      return {
        geometry,
        bounds,
        worldBounds,
      };
    }
  }
}

function styleTokenFor(entity: SpatialEntity): string {
  return entity.type === "dimension" ? "dimension" : `entity-${entity.type}`;
}

function projectEntity(
  entity: SpatialEntity,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
  viewport: ViewportTransform,
  viewportBounds: Bounds2,
  layerLocked: boolean,
  selected: boolean,
  key: string,
  layer: RenderNode["layer"],
  styleToken: string,
): RenderNode | null {
  const projected = entityProjection(entity, entitiesById, viewport);
  if (projected === null || !intersects(projected.worldBounds, viewportBounds)) return null;
  return {
    key,
    entityId: entity.id,
    layer,
    geometry: projected.geometry,
    bounds: projected.bounds,
    styleToken,
    selected,
    locked: entity.locked || layerLocked,
  };
}

function adaptiveGridStep(pixelsPerMillimetre: number): number {
  const targetWorldUnits = GRID_TARGET_PIXELS / pixelsPerMillimetre;
  const magnitude = 10 ** Math.floor(Math.log10(targetWorldUnits));
  const candidates = [magnitude, 2 * magnitude, 5 * magnitude, 10 * magnitude];
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate * pixelsPerMillimetre - GRID_TARGET_PIXELS)
      < Math.abs(best * pixelsPerMillimetre - GRID_TARGET_PIXELS)
      ? candidate
      : best
  ));
}

function canonicalNumber(value: number): number {
  if (Object.is(value, -0) || Math.abs(value) < 1e-10) return 0;
  return Number(value.toPrecision(12));
}

function gridKey(axis: "horizontal" | "vertical", step: number, index: number): string {
  return `${GRID_NAMESPACE}${axis}:${canonicalNumber(step)}:${index}`;
}

function gridNode(
  axis: "horizontal" | "vertical",
  step: number,
  index: number,
  viewport: ViewportTransform,
): RenderNode {
  const coordinate = canonicalNumber(index * step);
  const points = axis === "vertical"
    ? [
        worldToScreen({ x: coordinate, y: viewport.center.y + viewport.height / (2 * viewport.pixelsPerMillimetre) }, viewport),
        worldToScreen({ x: coordinate, y: viewport.center.y - viewport.height / (2 * viewport.pixelsPerMillimetre) }, viewport),
      ]
    : [
        worldToScreen({ x: viewport.center.x - viewport.width / (2 * viewport.pixelsPerMillimetre), y: coordinate }, viewport),
        worldToScreen({ x: viewport.center.x + viewport.width / (2 * viewport.pixelsPerMillimetre), y: coordinate }, viewport),
      ];
  const boundedPoints = points.map((point) => ({
    x: canonicalNumber(Math.min(viewport.width, Math.max(0, point.x))),
    y: canonicalNumber(Math.min(viewport.height, Math.max(0, point.y))),
  }));
  const key = gridKey(axis, step, index);
  return {
    key,
    entityId: key,
    layer: "grid",
    geometry: { kind: "polyline", points: boundedPoints, closed: false },
    bounds: boundsFromPoints(boundedPoints),
    styleToken: index === 0 ? "grid-axis" : "grid-major",
    selected: false,
    locked: true,
  };
}

function projectGrid(viewport: ViewportTransform, bounds: Bounds2): readonly RenderNode[] {
  const step = adaptiveGridStep(viewport.pixelsPerMillimetre);
  const verticalStart = Math.ceil(bounds.min.x / step);
  const verticalEnd = Math.floor(bounds.max.x / step);
  const horizontalStart = Math.ceil(bounds.min.y / step);
  const horizontalEnd = Math.floor(bounds.max.y / step);
  const nodes: RenderNode[] = [];
  for (let index = verticalStart; index <= verticalEnd; index += 1) {
    nodes.push(gridNode("vertical", step, index, viewport));
  }
  for (let index = horizontalStart; index <= horizontalEnd; index += 1) {
    nodes.push(gridNode("horizontal", step, index, viewport));
  }
  return nodes.sort(compareKeys);
}

function visibleLayerMap(activeFloor: Floor | undefined): ReadonlyMap<string, boolean> {
  return new Map(
    activeFloor?.layers
      .filter((layer) => layer.visible)
      .map((layer) => [layer.id, layer.locked] as const) ?? [],
  );
}

export function projectScene(input: PlanRendererInput): RenderScene {
  const viewportBounds = viewportWorldBounds(input.viewport);
  const grid = projectGrid(input.viewport, viewportBounds);
  const activeFloor = input.snapshot.project.floors.find(
    (floor) => floor.id === input.activeFloorId,
  );
  const visibleLayers = visibleLayerMap(activeFloor);
  const snapshotEntitiesById = new Map(
    input.snapshot.project.entities.map((entity) => [entity.id, entity]),
  );
  const visibleSnapshotEntityIds = new Set(
    UniformGridSpatialIndex.from(input.snapshot.project.entities).query(viewportBounds),
  );
  const content: RenderNode[] = [];
  const annotation: RenderNode[] = [];
  const overlay: RenderNode[] = [];

  for (const entity of input.snapshot.project.entities) {
    if (!visibleSnapshotEntityIds.has(entity.id)) continue;
    if (entity.floorId !== input.activeFloorId) continue;
    const layerLocked = visibleLayers.get(entity.layerId);
    if (layerLocked === undefined) continue;
    const layer = entity.type === "dimension" ? "annotation" : "content";
    const node = projectEntity(
      entity,
      snapshotEntitiesById,
      input.viewport,
      viewportBounds,
      layerLocked,
      input.selectedIds.has(entity.id),
      entity.id,
      layer,
      styleTokenFor(entity),
    );
    if (node === null) continue;
    (layer === "annotation" ? annotation : content).push(node);
    if (node.selected) {
      overlay.push({
        ...node,
        key: `${SELECTION_NAMESPACE}${entity.id}`,
        layer: "overlay",
        styleToken: `selection-${entity.type}`,
      });
    }
  }

  if (input.draft !== null) {
    const draftEntitiesById = new Map(snapshotEntitiesById);
    for (const entity of input.draft) draftEntitiesById.set(entity.id, entity);
    const visibleDraftEntityIds = new Set(
      UniformGridSpatialIndex.from([...draftEntitiesById.values()]).query(viewportBounds),
    );
    for (const entity of input.draft) {
      if (!visibleDraftEntityIds.has(entity.id)) continue;
      if (entity.floorId !== input.activeFloorId) continue;
      const layerLocked = visibleLayers.get(entity.layerId);
      if (layerLocked === undefined) continue;
      const node = projectEntity(
        entity,
        draftEntitiesById,
        input.viewport,
        viewportBounds,
        layerLocked,
        input.selectedIds.has(entity.id),
        `${DRAFT_NAMESPACE}${entity.id}`,
        "overlay",
        `draft-${entity.type}`,
      );
      if (node !== null) overlay.push(node);
    }
  }

  return {
    nodes: [
      ...grid,
      ...content.sort(compareKeys),
      ...annotation.sort(compareKeys),
      ...overlay.sort(compareKeys),
    ],
  };
}
