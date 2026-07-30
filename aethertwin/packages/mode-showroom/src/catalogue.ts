import type { FixtureKind } from "@aethertwin/core-model";

export type ShowroomFixtureKind = Exclude<FixtureKind, "generic">;

export interface FixturePrimitivePart {
  readonly key: string;
  readonly shape: "box";
  readonly center: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly size: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export interface ShowroomFixtureDescriptor {
  readonly kind: ShowroomFixtureKind;
  readonly label: string;
  readonly defaultName: string;
  readonly defaultSize: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  };
  readonly parts: readonly FixturePrimitivePart[];
}

type Vector3Tuple = readonly [x: number, y: number, z: number];

function vector3([x, y, z]: Vector3Tuple) {
  return Object.freeze({ x, y, z });
}

function box(
  key: string,
  center: Vector3Tuple,
  size: Vector3Tuple,
): FixturePrimitivePart {
  return Object.freeze({
    key,
    shape: "box",
    center: vector3(center),
    size: vector3(size),
  });
}

function fixture(
  kind: ShowroomFixtureKind,
  label: string,
  width: number,
  depth: number,
  height: number,
  parts: readonly FixturePrimitivePart[],
): ShowroomFixtureDescriptor {
  return Object.freeze({
    kind,
    label,
    defaultName: label,
    defaultSize: Object.freeze({ width, depth, height }),
    parts: Object.freeze(parts),
  });
}

export const SHOWROOM_FIXTURE_CATALOGUE: readonly ShowroomFixtureDescriptor[] =
  Object.freeze([
    fixture("display-case", "展示柜", 1200, 600, 1200, [
      box("base", [0.5, 0.5, 0.05], [1, 1, 0.1]),
      box("case", [0.5, 0.5, 0.5], [0.9, 0.9, 0.8]),
      box("top", [0.5, 0.5, 0.95], [1, 1, 0.1]),
    ]),
    fixture("display-table", "展示桌", 1500, 750, 900, [
      box("top", [0.5, 0.5, 0.9], [1, 1, 0.2]),
      box("leg-fl", [0.08, 0.08, 0.4], [0.08, 0.08, 0.8]),
      box("leg-fr", [0.92, 0.08, 0.4], [0.08, 0.08, 0.8]),
      box("leg-rl", [0.08, 0.92, 0.4], [0.08, 0.08, 0.8]),
      box("leg-rr", [0.92, 0.92, 0.4], [0.08, 0.08, 0.8]),
    ]),
    fixture("shelf", "货架", 1000, 400, 2000, [
      box("back", [0.5, 0.95, 0.5], [1, 0.1, 1]),
      box("side-left", [0.025, 0.5, 0.5], [0.05, 0.9, 1]),
      box("side-right", [0.975, 0.5, 0.5], [0.05, 0.9, 1]),
      box("shelf-0", [0.5, 0.5, 0.025], [0.9, 0.9, 0.05]),
      box("shelf-1", [0.5, 0.5, 0.35], [0.9, 0.9, 0.05]),
      box("shelf-2", [0.5, 0.5, 0.65], [0.9, 0.9, 0.05]),
      box("shelf-3", [0.5, 0.5, 0.975], [0.9, 0.9, 0.05]),
    ]),
    fixture("checkout", "收银台", 1600, 700, 1000, [
      box("body", [0.5, 0.5, 0.45], [1, 1, 0.9]),
      box("top", [0.5, 0.5, 0.95], [1, 1, 0.1]),
    ]),
    fixture("screen", "屏幕", 1200, 100, 1800, [
      box("base", [0.5, 0.5, 0.03], [0.6, 1, 0.06]),
      box("post", [0.5, 0.5, 0.33], [0.08, 0.3, 0.6]),
      box("display", [0.5, 0.5, 0.8], [1, 0.2, 0.4]),
    ]),
    fixture("partition", "隔断", 1200, 100, 2400, [
      box("panel", [0.5, 0.5, 0.5], [1, 1, 1]),
    ]),
    fixture("signage", "标牌", 600, 100, 1800, [
      box("base", [0.5, 0.5, 0.03], [0.7, 1, 0.06]),
      box("post", [0.5, 0.5, 0.35], [0.08, 0.3, 0.64]),
      box("board", [0.5, 0.5, 0.82], [1, 0.2, 0.36]),
    ]),
  ]);

export function showroomFixture(
  kind: ShowroomFixtureKind,
): ShowroomFixtureDescriptor {
  const descriptor = SHOWROOM_FIXTURE_CATALOGUE.find(
    (candidate) => candidate.kind === kind,
  );
  if (descriptor === undefined) {
    throw new RangeError(`Unknown showroom fixture kind: ${String(kind)}`);
  }
  return descriptor;
}
