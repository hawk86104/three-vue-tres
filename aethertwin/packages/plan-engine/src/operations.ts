import type { Bounds2, Point2, SpatialEntity, Transform2D } from "@aethertwin/core-model";
import { entityWorldBounds } from "./bounds";
import type { PlanEditIntent, PlanEditReason } from "./intents";
import { planFailure, planSuccess, type PlanResult } from "./result";
import { normalizeTransform } from "./transforms";

const canonicalIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Bound one array intent before allocation, cloning, or ID generation.
const MAX_ARRAY_CHANGES = 10_000;
const INVALID_RESIZE_MESSAGE =
  "Resize result must contain finite, positive, non-degenerate geometry.";

export interface LinearArrayInput {
  readonly count: number;
  readonly delta: Point2;
}

export interface RectangularArrayInput {
  readonly rows: number;
  readonly columns: number;
  readonly rowGap: number;
  readonly columnGap: number;
}

type AlignmentAxis = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
type DistributionAxis = "horizontal" | "vertical";
type DistributionMode = "centers" | "gap";

interface EntityBounds {
  readonly entity: SpatialEntity;
  readonly bounds: Bounds2;
  readonly order: number;
}

function ownEntity<T extends SpatialEntity>(entity: T): T {
  return structuredClone(entity);
}

function validateSelection(entities: readonly SpatialEntity[]): PlanResult<true> {
  if (entities.length === 0) {
    return planFailure("EMPTY_SELECTION", "Select at least one entity.");
  }

  const ids = new Set<string>();
  for (const entity of entities) {
    if (entity.locked) {
      return planFailure(
        "LOCKED_ENTITY",
        "Locked entities cannot be edited.",
        entity.id,
      );
    }
    if (ids.has(entity.id)) {
      return planFailure(
        "DUPLICATE_ENTITY_ID",
        "Each selected entity must be unique.",
        entity.id,
      );
    }
    ids.add(entity.id);
  }
  return planSuccess(true);
}

function validateFinitePoint(point: Point2, code: string, message: string): PlanResult<true> {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    ? planSuccess(true)
    : planFailure(code, message);
}

function normalizedEntityTransform(
  entity: SpatialEntity,
  transform: Transform2D,
): PlanResult<Transform2D> {
  const normalized = normalizeTransform(transform);
  return normalized.ok
    ? normalized
    : planFailure(normalized.issue.code, normalized.issue.message, entity.id);
}

function translatedEntity(entity: SpatialEntity, delta: Point2): PlanResult<SpatialEntity> {
  const transform = normalizedEntityTransform(entity, {
    ...entity.transform,
    translation: {
      x: entity.transform.translation.x + delta.x,
      y: entity.transform.translation.y + delta.y,
    },
  });
  if (!transform.ok) return transform;
  return planSuccess({ ...ownEntity(entity), transform: transform.value } as SpatialEntity);
}

function transformIntent(
  entities: readonly SpatialEntity[],
  reason: PlanEditReason,
  transform: (entity: SpatialEntity) => PlanResult<SpatialEntity>,
): PlanResult<PlanEditIntent> {
  const changes: Array<PlanEditIntent["changes"][number]> = [];
  for (const entity of entities) {
    const after = transform(entity);
    if (!after.ok) return after;
    changes.push({
      id: entity.id,
      before: ownEntity(entity),
      after: after.value,
    });
  }
  return planSuccess({ reason, changes });
}

function invalidResize(entity: SpatialEntity): PlanResult<never> {
  return planFailure("INVALID_RESIZE", INVALID_RESIZE_MESSAGE, entity.id);
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

type PolygonOrientation = -1 | 0 | 1;

interface ExactBinary64 {
  readonly mantissa: bigint;
  readonly exponent: number;
}

function exactBinary64(value: number): ExactBinary64 {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  const high = view.getUint32(0, false);
  const low = view.getUint32(4, false);
  const negative = (high & 0x8000_0000) !== 0;
  const exponentBits = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0x000f_ffff) << 32n) | BigInt(low);
  const mantissa = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
  return {
    mantissa: negative ? -mantissa : mantissa,
    exponent: exponentBits === 0 ? -1074 : exponentBits - 1075,
  };
}

function exactDifference(left: number, right: number): ExactBinary64 {
  const exactLeft = exactBinary64(left);
  const exactRight = exactBinary64(right);
  const exponent = Math.min(exactLeft.exponent, exactRight.exponent);
  const leftMantissa = exactLeft.mantissa
    << BigInt(exactLeft.exponent - exponent);
  const rightMantissa = exactRight.mantissa
    << BigInt(exactRight.exponent - exponent);
  return { mantissa: leftMantissa - rightMantissa, exponent };
}

function exactProduct(left: ExactBinary64, right: ExactBinary64): ExactBinary64 {
  return {
    mantissa: left.mantissa * right.mantissa,
    exponent: left.exponent + right.exponent,
  };
}

function exactPolygonOrientation(a: Point2, b: Point2, c: Point2): PolygonOrientation {
  const firstProduct = exactProduct(
    exactDifference(b.x, a.x),
    exactDifference(c.y, a.y),
  );
  const secondProduct = exactProduct(
    exactDifference(b.y, a.y),
    exactDifference(c.x, a.x),
  );
  const exponent = Math.min(firstProduct.exponent, secondProduct.exponent);
  const firstMantissa = firstProduct.mantissa
    << BigInt(firstProduct.exponent - exponent);
  const secondMantissa = secondProduct.mantissa
    << BigInt(secondProduct.exponent - exponent);
  const determinant = firstMantissa - secondMantissa;
  if (determinant === 0n) return 0;
  return determinant > 0n ? 1 : -1;
}

function polygonOrientation(a: Point2, b: Point2, c: Point2): PolygonOrientation {
  const rawCross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (!Number.isFinite(rawCross)) return exactPolygonOrientation(a, b, c);
  if (rawCross === 0) return 0;
  return rawCross > 0 ? 1 : -1;
}

function pointOnPolygonSegment(a: Point2, b: Point2, point: Point2): boolean {
  return Math.min(a.x, b.x) <= point.x && point.x <= Math.max(a.x, b.x)
    && Math.min(a.y, b.y) <= point.y && point.y <= Math.max(a.y, b.y);
}

function polygonEdgesIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = polygonOrientation(a, b, c);
  const abD = polygonOrientation(a, b, d);
  const cdA = polygonOrientation(c, d, a);
  const cdB = polygonOrientation(c, d, b);
  if (abC === 0 && pointOnPolygonSegment(a, b, c)) return true;
  if (abD === 0 && pointOnPolygonSegment(a, b, d)) return true;
  if (cdA === 0 && pointOnPolygonSegment(c, d, a)) return true;
  if (cdB === 0 && pointOnPolygonSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0)
    && (cdA > 0) !== (cdB > 0);
}

function finitePolygon(points: readonly Point2[]): boolean {
  if (points.length < 3 || !points.every(finitePoint)) return false;

  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  // Match core-model's exact-zero rule, including an underflowed zero area.
  if (twiceArea === 0) return false;

  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === points.length - 1)) continue;
      if (polygonEdgesIntersect(
        points[first]!,
        points[(first + 1) % points.length]!,
        points[second]!,
        points[(second + 1) % points.length]!,
      )) return false;
    }
  }

  if (Number.isFinite(twiceArea)) return true;

  let maximumCoordinate = 0;
  for (const point of points) {
    maximumCoordinate = Math.max(maximumCoordinate, Math.abs(point.x), Math.abs(point.y));
  }
  const arithmeticExponent = Math.min(1023, Math.floor(Math.log2(maximumCoordinate)));
  const arithmeticScale = 2 ** arithmeticExponent;
  const arithmeticPoints = points.map((point) => ({
    x: point.x / arithmeticScale,
    y: point.y / arithmeticScale,
  }));

  let arithmeticTwiceArea = 0;
  for (let index = 0; index < arithmeticPoints.length; index += 1) {
    const current = arithmeticPoints[index]!;
    const next = arithmeticPoints[(index + 1) % arithmeticPoints.length]!;
    arithmeticTwiceArea += current.x * next.y - next.x * current.y;
  }
  return Number.isFinite(arithmeticTwiceArea) && arithmeticTwiceArea !== 0;
}

function finitePolyline(points: readonly Point2[]): boolean {
  return points.length >= 2
    && points.every(finitePoint)
    && points.some((point, index) => {
      const next = points[index + 1];
      return next !== undefined && (point.x !== next.x || point.y !== next.y);
    });
}

function finiteWorldBounds(entity: SpatialEntity): boolean {
  try {
    const bounds = entityWorldBounds(entity);
    return [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].every(Number.isFinite);
  } catch {
    return false;
  }
}

function representableResize(entity: SpatialEntity): boolean {
  let localGeometryIsValid: boolean;
  switch (entity.type) {
    case "boundary":
    case "zone":
      localGeometryIsValid = finitePolygon(entity.polygon);
      break;
    case "space-unit":
      localGeometryIsValid = finitePolygon(entity.footprint);
      break;
    case "fixture":
      localGeometryIsValid =
        finitePositive(entity.size.width) && finitePositive(entity.size.height);
      break;
    case "wall":
      localGeometryIsValid =
        finitePolyline(entity.centerLine) && finitePositive(entity.thickness);
      break;
    case "poi":
      localGeometryIsValid =
        entity.radius === undefined || finitePositive(entity.radius);
      break;
    case "dimension":
      localGeometryIsValid = Number.isFinite(entity.offset);
      break;
  }
  return localGeometryIsValid && finiteWorldBounds(entity);
}

function scalePoint(point: Point2, scale: Point2): Point2 {
  return { x: point.x * scale.x, y: point.y * scale.y };
}

function resizedEntity(entity: SpatialEntity, requestedScale: Point2): PlanResult<SpatialEntity> {
  const sourceTransform = normalizedEntityTransform(entity, entity.transform);
  if (!sourceTransform.ok) return invalidResize(entity);
  const bakedScale = {
    x: sourceTransform.value.scale.x * requestedScale.x,
    y: sourceTransform.value.scale.y * requestedScale.y,
  };

  if (
    entity.type === "wall"
    && (requestedScale.x !== requestedScale.y || bakedScale.x !== bakedScale.y)
  ) {
    return planFailure(
      "NON_UNIFORM_WALL_SCALE",
      "Walls require a uniform resize scale.",
      entity.id,
    );
  }
  if (!finitePositive(bakedScale.x) || !finitePositive(bakedScale.y)) {
    return invalidResize(entity);
  }

  const owned = ownEntity(entity);
  const identityScaleTransform: Transform2D = {
    ...sourceTransform.value,
    scale: { x: 1, y: 1 },
  };
  let candidate: SpatialEntity;
  switch (owned.type) {
    case "boundary":
    case "zone":
      candidate = {
        ...owned,
        transform: identityScaleTransform,
        polygon: owned.polygon.map((point) => scalePoint(point, bakedScale)),
      };
      break;
    case "space-unit":
      candidate = {
        ...owned,
        transform: identityScaleTransform,
        footprint: owned.footprint.map((point) => scalePoint(point, bakedScale)),
      };
      break;
    case "fixture":
      candidate = {
        ...owned,
        transform: identityScaleTransform,
        size: {
          width: owned.size.width * bakedScale.x,
          height: owned.size.height * bakedScale.y,
        },
      };
      break;
    case "wall":
      candidate = {
        ...owned,
        transform: identityScaleTransform,
        centerLine: owned.centerLine.map((point) => scalePoint(point, bakedScale)),
        thickness: owned.thickness * bakedScale.x,
      };
      break;
    case "poi":
    case "dimension": {
      const transform = normalizedEntityTransform(entity, {
        ...sourceTransform.value,
        scale: bakedScale,
      });
      if (!transform.ok) return invalidResize(entity);
      candidate = { ...owned, transform: transform.value } as SpatialEntity;
      break;
    }
  }

  return representableResize(candidate)
    ? planSuccess(candidate)
    : invalidResize(entity);
}

function arrayChangeCount(
  sourceCount: number,
  copiesPerSource: number,
): PlanResult<number> {
  if (
    !Number.isSafeInteger(copiesPerSource)
    || copiesPerSource < 1
    || sourceCount > Math.floor(Number.MAX_SAFE_INTEGER / copiesPerSource)
  ) {
    return planFailure(
      "ARRAY_LIMIT_EXCEEDED",
      `Array operations may create at most ${MAX_ARRAY_CHANGES} entities.`,
    );
  }
  const total = sourceCount * copiesPerSource;
  return total <= MAX_ARRAY_CHANGES
    ? planSuccess(total)
    : planFailure(
        "ARRAY_LIMIT_EXCEEDED",
        `Array operations may create at most ${MAX_ARRAY_CHANGES} entities.`,
      );
}

function generatedIds(
  entities: readonly SpatialEntity[],
  count: number,
  makeId: () => string,
): PlanResult<readonly string[]> {
  const seen = new Set(entities.map((entity) => entity.id));
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    let id: string;
    try {
      id = makeId();
    } catch {
      return planFailure("INVALID_GENERATED_ID", "The ID generator did not return a canonical UUID.");
    }
    if (!canonicalIdPattern.test(id) || seen.has(id)) {
      return planFailure(
        "INVALID_GENERATED_ID",
        "Generated IDs must be canonical UUIDs unique from sources and other copies.",
      );
    }
    seen.add(id);
    ids.push(id);
  }
  return planSuccess(ids);
}

function copiesAtOffsets(
  entities: readonly SpatialEntity[],
  offsets: readonly Point2[],
  reason: "duplicate" | "array",
  makeId: () => string,
): PlanResult<PlanEditIntent> {
  const templates: SpatialEntity[] = [];
  for (const entity of entities) {
    for (const offset of offsets) {
      const template = translatedEntity(entity, offset);
      if (!template.ok) return template;
      templates.push(template.value);
    }
  }

  const ids = generatedIds(entities, templates.length, makeId);
  if (!ids.ok) return ids;
  return planSuccess({
    reason,
    changes: templates.map((template, index) => {
      const after = { ...template, id: ids.value[index]! } as SpatialEntity;
      return { id: after.id, before: null, after };
    }),
  });
}

function entityBounds(entities: readonly SpatialEntity[]): PlanResult<readonly EntityBounds[]> {
  const values: EntityBounds[] = [];
  for (const [order, entity] of entities.entries()) {
    const transform = normalizedEntityTransform(entity, entity.transform);
    if (!transform.ok) return transform;
    let bounds: Bounds2;
    try {
      bounds = entityWorldBounds(entity);
    } catch {
      return planFailure("INVALID_BOUNDS", "Entity bounds could not be resolved.", entity.id);
    }
    if (![bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].every(Number.isFinite)) {
      return planFailure("INVALID_BOUNDS", "Entity bounds must be finite.", entity.id);
    }
    values.push({ entity, bounds, order });
  }
  return planSuccess(values);
}

function safeMidpoint(first: number, second: number): number {
  if (first === second) return first;
  return Math.sign(first) === Math.sign(second)
    ? first + (second - first) / 2
    : first / 2 + second / 2;
}

function safeInterpolate(
  first: number,
  last: number,
  index: number,
  steps: number,
): number {
  if (index * 2 === steps) return safeMidpoint(first, last);
  const ratio = index / steps;
  return first * (1 - ratio) + last * ratio;
}

function finiteDifference(left: number, right: number): number | null {
  const difference = left - right;
  return Number.isFinite(difference) ? difference : null;
}

function shiftedIntent(
  entities: readonly SpatialEntity[],
  reason: "align" | "distribute",
  deltaById: ReadonlyMap<string, Point2>,
): PlanResult<PlanEditIntent> {
  return transformIntent(entities, reason, (entity) => {
    const delta = deltaById.get(entity.id) ?? { x: 0, y: 0 };
    return delta.x === 0 && delta.y === 0
      ? planSuccess(ownEntity(entity))
      : translatedEntity(entity, delta);
  });
}

export function translateEntities(
  entities: readonly SpatialEntity[],
  delta: Point2,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  const validDelta = validateFinitePoint(
    delta,
    "INVALID_TRANSLATION",
    "Translation delta must be finite.",
  );
  if (!validDelta.ok) return validDelta;
  return transformIntent(entities, "transform", (entity) => translatedEntity(entity, delta));
}

export function rotateEntities(
  entities: readonly SpatialEntity[],
  deltaRadians: number,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  if (!Number.isFinite(deltaRadians)) {
    return planFailure("INVALID_ROTATION", "Rotation delta must be finite.");
  }
  return transformIntent(entities, "transform", (entity) => {
    const transform = normalizedEntityTransform(entity, {
      ...entity.transform,
      rotation: entity.transform.rotation + deltaRadians,
    });
    if (!transform.ok) return transform;
    return planSuccess({ ...ownEntity(entity), transform: transform.value } as SpatialEntity);
  });
}

export function resizeEntities(
  entities: readonly SpatialEntity[],
  scale: Point2,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  if (!Number.isFinite(scale.x) || !Number.isFinite(scale.y) || scale.x <= 0 || scale.y <= 0) {
    return planFailure("INVALID_RESIZE", "Resize scale must be finite and positive.");
  }
  return transformIntent(entities, "transform", (entity) => resizedEntity(entity, scale));
}

export function duplicateEntities(
  entities: readonly SpatialEntity[],
  offset: Point2,
  makeId: () => string,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  const validOffset = validateFinitePoint(offset, "INVALID_OFFSET", "Duplicate offset must be finite.");
  if (!validOffset.ok) return validOffset;
  return copiesAtOffsets(entities, [offset], "duplicate", makeId);
}

export function linearArray(
  entities: readonly SpatialEntity[],
  input: LinearArrayInput,
  makeId: () => string,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  if (!Number.isSafeInteger(input.count) || input.count < 2) {
    return planFailure("INVALID_ARRAY_COUNT", "Linear arrays require at least two safe-integer instances.");
  }
  const changeCount = arrayChangeCount(entities.length, input.count - 1);
  if (!changeCount.ok) return changeCount;
  const validDelta = validateFinitePoint(input.delta, "INVALID_ARRAY_DELTA", "Array delta must be finite.");
  if (!validDelta.ok) return validDelta;
  const furthest = {
    x: input.delta.x * (input.count - 1),
    y: input.delta.y * (input.count - 1),
  };
  if (!Number.isFinite(furthest.x) || !Number.isFinite(furthest.y)) {
    return planFailure("INVALID_ARRAY_DELTA", "Array offsets must remain finite.");
  }
  const offsets = Array.from({ length: input.count - 1 }, (_, index) => ({
    x: input.delta.x * (index + 1),
    y: input.delta.y * (index + 1),
  }));
  return copiesAtOffsets(entities, offsets, "array", makeId);
}

export function rectangularArray(
  entities: readonly SpatialEntity[],
  input: RectangularArrayInput,
  makeId: () => string,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  const totalInstances = input.rows * input.columns;
  if (
    !Number.isSafeInteger(input.rows)
    || !Number.isSafeInteger(input.columns)
    || input.rows < 1
    || input.columns < 1
    || !Number.isSafeInteger(totalInstances)
    || totalInstances < 2
  ) {
    return planFailure(
      "INVALID_ARRAY_COUNT",
      "Rectangular arrays require at least two safe-integer total instances.",
    );
  }
  const changeCount = arrayChangeCount(entities.length, totalInstances - 1);
  if (!changeCount.ok) return changeCount;
  if (!Number.isFinite(input.rowGap) || !Number.isFinite(input.columnGap)) {
    return planFailure("INVALID_ARRAY_DELTA", "Array gaps must be finite.");
  }
  if (
    !Number.isFinite(input.rowGap * (input.rows - 1))
    || !Number.isFinite(input.columnGap * (input.columns - 1))
  ) {
    return planFailure("INVALID_ARRAY_DELTA", "Array offsets must remain finite.");
  }

  const offsets: Point2[] = [];
  for (let row = 0; row < input.rows; row += 1) {
    for (let column = 0; column < input.columns; column += 1) {
      if (row === 0 && column === 0) continue;
      offsets.push({ x: column * input.columnGap, y: row * input.rowGap });
    }
  }
  return copiesAtOffsets(entities, offsets, "array", makeId);
}

export function alignEntities(
  entities: readonly SpatialEntity[],
  axis: AlignmentAxis,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  if (!["left", "center-x", "right", "top", "center-y", "bottom"].includes(axis)) {
    return planFailure("INVALID_ALIGNMENT", "Alignment axis is not supported.");
  }
  const bounds = entityBounds(entities);
  if (!bounds.ok) return bounds;

  const selectionBounds = bounds.value.reduce<Bounds2>((combined, value) => ({
    min: {
      x: Math.min(combined.min.x, value.bounds.min.x),
      y: Math.min(combined.min.y, value.bounds.min.y),
    },
    max: {
      x: Math.max(combined.max.x, value.bounds.max.x),
      y: Math.max(combined.max.y, value.bounds.max.y),
    },
  }), bounds.value[0]!.bounds);
  const deltaById = new Map<string, Point2>();
  for (const value of bounds.value) {
    let deltaX = 0;
    let deltaY = 0;
    switch (axis) {
      case "left":
        deltaX = selectionBounds.min.x - value.bounds.min.x;
        break;
      case "center-x":
        deltaX = safeMidpoint(selectionBounds.min.x, selectionBounds.max.x)
          - safeMidpoint(value.bounds.min.x, value.bounds.max.x);
        break;
      case "right":
        deltaX = selectionBounds.max.x - value.bounds.max.x;
        break;
      case "top":
        deltaY = selectionBounds.min.y - value.bounds.min.y;
        break;
      case "center-y":
        deltaY = safeMidpoint(selectionBounds.min.y, selectionBounds.max.y)
          - safeMidpoint(value.bounds.min.y, value.bounds.max.y);
        break;
      case "bottom":
        deltaY = selectionBounds.max.y - value.bounds.max.y;
        break;
    }
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return planFailure(
        "INVALID_ALIGNMENT",
        "Alignment offsets must be finite.",
        value.entity.id,
      );
    }
    deltaById.set(value.entity.id, { x: deltaX, y: deltaY });
  }
  return shiftedIntent(entities, "align", deltaById);
}

export function distributeEntities(
  entities: readonly SpatialEntity[],
  axis: DistributionAxis,
  mode: DistributionMode,
): PlanResult<PlanEditIntent> {
  const selection = validateSelection(entities);
  if (!selection.ok) return selection;
  if (axis !== "horizontal" && axis !== "vertical") {
    return planFailure("INVALID_DISTRIBUTION", "Distribution axis is not supported.");
  }
  if (mode !== "centers" && mode !== "gap") {
    return planFailure("INVALID_DISTRIBUTION", "Distribution mode is not supported.");
  }
  const bounds = entityBounds(entities);
  if (!bounds.ok) return bounds;

  const minimum = (value: EntityBounds): number => (
    axis === "horizontal" ? value.bounds.min.x : value.bounds.min.y
  );
  const maximum = (value: EntityBounds): number => (
    axis === "horizontal" ? value.bounds.max.x : value.bounds.max.y
  );
  const center = (value: EntityBounds): number => safeMidpoint(minimum(value), maximum(value));
  const ordered = [...bounds.value].sort((left, right) => {
    const leftCenter = center(left);
    const rightCenter = center(right);
    return leftCenter < rightCenter
      ? -1
      : leftCenter > rightCenter
        ? 1
        : left.entity.id.localeCompare(right.entity.id) || left.order - right.order;
  });
  const deltaById = new Map<string, Point2>(
    entities.map((entity) => [entity.id, { x: 0, y: 0 }]),
  );
  if (ordered.length > 2) {
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    if (mode === "centers") {
      const firstCenter = center(first);
      const lastCenter = center(last);
      for (let index = 1; index < ordered.length - 1; index += 1) {
        const value = ordered[index]!;
        const target = safeInterpolate(
          firstCenter,
          lastCenter,
          index,
          ordered.length - 1,
        );
        const delta = finiteDifference(target, center(value));
        if (delta === null) {
          return planFailure("INVALID_DISTRIBUTION", "Distribution offsets must be finite.");
        }
        deltaById.set(value.entity.id, axis === "horizontal"
          ? { x: delta, y: 0 }
          : { x: 0, y: delta });
      }
    } else {
      const divisor = ordered.length - 1;
      const sizes: number[] = [];
      for (const value of ordered) {
        const size = finiteDifference(maximum(value), minimum(value));
        if (size === null || size < 0) {
          return planFailure("INVALID_DISTRIBUTION", "Distribution offsets must be finite.");
        }
        sizes.push(size);
      }
      let gap = maximum(last) / divisor - minimum(first) / divisor;
      for (const size of sizes) gap -= size / divisor;
      if (!Number.isFinite(gap)) {
        return planFailure("INVALID_DISTRIBUTION", "Distribution offsets must be finite.");
      }

      let cursor = maximum(first) + gap;
      if (!Number.isFinite(cursor)) {
        return planFailure("INVALID_DISTRIBUTION", "Distribution offsets must be finite.");
      }
      for (let index = 1; index < ordered.length - 1; index += 1) {
        const value = ordered[index]!;
        const delta = finiteDifference(cursor, minimum(value));
        if (delta === null) {
          return planFailure("INVALID_DISTRIBUTION", "Distribution offsets must be finite.");
        }
        deltaById.set(value.entity.id, axis === "horizontal"
          ? { x: delta, y: 0 }
          : { x: 0, y: delta });
        cursor += sizes[index]! + gap;
        if (!Number.isFinite(cursor)) {
          return planFailure("INVALID_DISTRIBUTION", "Distribution offsets must be finite.");
        }
      }
    }
  }
  return shiftedIntent(entities, "distribute", deltaById);
}
