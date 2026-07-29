import { describe, expect, it } from "vitest";
import openingGeometryVectors from "../../../fixtures/contracts/opening-geometry.v1.json";
import type { Opening, Point2, Wall } from "./index";
import {
  GEOMETRY_EPSILON_MM,
  effectiveWallThickness,
  locateOpening,
  validateOpeningGeometry,
  wallMetricSegments,
  type OpeningGeometryIssue,
} from "./opening-geometry";

interface VectorWall {
  readonly id: string;
  readonly centerLine: readonly Point2[];
  readonly thickness: number;
  readonly height?: number;
  readonly locked?: boolean;
  readonly transform: Wall["transform"];
}

interface VectorOpening {
  readonly id: string;
  readonly wallId: string;
  readonly kind: Opening["kind"];
  readonly distanceAlongWall: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
}

function wall(input: VectorWall): Wall {
  const base = {
    id: input.id,
    name: input.id,
    tags: [],
    type: "wall" as const,
    floorId: "00000000-0000-4000-8000-000000000001",
    layerId: "00000000-0000-4000-8000-000000000002",
    transform: input.transform,
    locked: input.locked ?? false,
    centerLine: input.centerLine,
    thickness: input.thickness,
  };
  return input.height === undefined
    ? base
    : { ...base, spatial3D: { elevation: 0, height: input.height } };
}

function opening(input: VectorOpening): Opening {
  return {
    ...input,
    name: input.id,
    tags: [],
  };
}

function expectNumber(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(GEOMETRY_EPSILON_MM);
}

function expectPoint(actual: Point2, expected: Point2): void {
  expectNumber(actual.x, expected.x);
  expectNumber(actual.y, expected.y);
}

describe("opening geometry shared contract", () => {
  it("publishes the exact shared epsilon", () => {
    expect(GEOMETRY_EPSILON_MM).toBe(openingGeometryVectors.geometryEpsilonMm);
  });

  it.each(openingGeometryVectors.metricCases)(
    "computes transformed wall metrics: $name",
    ({ wall: wallInput, expectedSegments }) => {
      const candidate = wall(wallInput as VectorWall);
      const segments = wallMetricSegments(candidate);

      expect(segments).toHaveLength(expectedSegments.length);
      expectedSegments.forEach((expected, index) => {
        const actual = segments[index]!;
        expect(actual.segmentIndex).toBe(expected.segmentIndex);
        expectPoint(actual.start, expected.start);
        expectPoint(actual.end, expected.end);
        expectPoint(actual.tangent, expected.tangent);
        expectNumber(actual.length, expected.length);
        expectNumber(actual.cumulativeStart, expected.cumulativeStart);
        expectNumber(actual.cumulativeEnd, expected.cumulativeEnd);
        expectNumber(actual.effectiveThickness, expected.effectiveThickness);
        expectNumber(
          effectiveWallThickness(candidate, expected.segmentIndex)!,
          expected.effectiveThickness,
        );
      });
      expect(Object.isFrozen(segments)).toBe(true);
      segments.forEach((segment) => {
        expect(Object.isFrozen(segment)).toBe(true);
        expect(Object.isFrozen(segment.start)).toBe(true);
        expect(Object.isFrozen(segment.end)).toBe(true);
        expect(Object.isFrozen(segment.tangent)).toBe(true);
      });
    },
  );

  it("returns no thickness for zero-length or out-of-range source segments", () => {
    const candidate = wall(openingGeometryVectors.metricCases[2]!.wall as VectorWall);
    expect(effectiveWallThickness(candidate, 1)).toBeUndefined();
    expect(effectiveWallThickness(candidate, 99)).toBeUndefined();
  });

  it.each(openingGeometryVectors.projectionCases)(
    "locates an opening by cumulative world length: $name",
    ({ wall: wallInput, opening: openingInput, expected }) => {
      const projection = locateOpening(
        wall(wallInput as VectorWall),
        opening(openingInput as VectorOpening),
      );

      expect(projection).toBeDefined();
      expect(projection!.openingId).toBe(openingInput.id);
      expect(projection!.wallId).toBe(wallInput.id);
      expect(projection!.segmentIndex).toBe(expected.segmentIndex);
      expectPoint(projection!.center, expected.center);
      expectPoint(projection!.tangent, expected.tangent);
      expectNumber(projection!.distanceAlongSegment, expected.distanceAlongSegment);
      expectNumber(projection!.effectiveThickness, expected.effectiveThickness);
      expect(Object.isFrozen(projection)).toBe(true);
      expect(Object.isFrozen(projection!.center)).toBe(true);
      expect(Object.isFrozen(projection!.tangent)).toBe(true);
    },
  );

  it.each(openingGeometryVectors.validationCases)(
    "validates openings deterministically: $name",
    ({ walls, openings, expectedIssues }) => {
      const issues = validateOpeningGeometry(
        walls.map((item) => wall(item as VectorWall)),
        openings.map((item) => opening(item as VectorOpening)),
      );

      expect(issues).toEqual(expectedIssues as readonly OpeningGeometryIssue[]);
      expect(Object.isFrozen(issues)).toBe(true);
      issues.forEach((issue) => expect(Object.isFrozen(issue)).toBe(true));
    },
  );

  it("does not rewrite persisted values at epsilon boundaries", () => {
    const vector = openingGeometryVectors.validationCases.find(
      ({ name }) => name === "admits endpoint clearance within epsilon",
    )!;
    const input = opening(vector.openings[0] as VectorOpening);
    const before = structuredClone(input);

    expect(validateOpeningGeometry(
      vector.walls.map((item) => wall(item as VectorWall)),
      [input],
    )).toEqual([]);
    expect(input).toEqual(before);
  });
});
