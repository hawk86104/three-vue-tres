import type { Point2 } from "./geometry";
import { fail, finite, list, record } from "./validation-primitives";

export function parsePoint(value: unknown, path: string): Point2 {
  const item = record(value, path);
  return { x: finite(item.x, `${path}.x`), y: finite(item.y, `${path}.y`) };
}

function cross(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point2, b: Point2, point: Point2): boolean {
  return Math.min(a.x, b.x) <= point.x && point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y && point.y <= Math.max(a.y, b.y);
}

function intersects(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

export function polygon(value: unknown, path: string): Point2[] {
  const points = list(value, path).map((item, i) => parsePoint(item, `${path}[${i}]`));
  if (points.length < 3) fail("DEGENERATE_GEOMETRY", path, "requires at least three points");

  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === points.length - 1)) continue;
      if (intersects(
        points[first]!,
        points[(first + 1) % points.length]!,
        points[second]!,
        points[(second + 1) % points.length]!,
      )) {
        fail("SELF_INTERSECTING_POLYGON", path, "self-intersecting polygon");
      }
    }
  }

  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  if (twiceArea === 0) fail("DEGENERATE_GEOMETRY", path, "must have non-zero area");
  return points;
}

export function polyline(value: unknown, path: string): Point2[] {
  const points = list(value, path).map((item, index) => parsePoint(item, `${path}[${index}]`));
  if (points.length < 2) fail("DEGENERATE_GEOMETRY", path, "requires at least two points");
  const hasLength = points.some((point, index) => {
    const next = points[index + 1];
    return next !== undefined && (point.x !== next.x || point.y !== next.y);
  });
  if (!hasLength) fail("DEGENERATE_GEOMETRY", path, "must have non-zero length");
  return points;
}
