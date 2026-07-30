import type { Opening, Point2, Wall } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  hitTestOpening,
  nearestOpeningPlacement,
} from "./index";

function wall(
  id: string,
  centerLine: readonly Point2[],
  overrides: Partial<Wall> = {},
): Wall {
  return {
    type: "wall",
    id,
    name: id,
    tags: [],
    floorId: "00000000-0000-4000-8000-000000000010",
    layerId: "00000000-0000-4000-8000-000000000011",
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    spatial3D: { elevation: 0, height: 3000 },
    locked: false,
    centerLine,
    thickness: 10,
    ...overrides,
  };
}

function opening(
  wallId: string,
  overrides: Partial<Opening> = {},
): Opening {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    name: "Door",
    tags: [],
    wallId,
    kind: "door",
    distanceAlongWall: 50,
    width: 20,
    height: 2100,
    sillHeight: 0,
    ...overrides,
  };
}

function placement(
  point: Point2,
  walls: readonly Wall[],
  overrides: Partial<Parameters<typeof nearestOpeningPlacement>[0]> = {},
) {
  return nearestOpeningPlacement({
    point,
    walls,
    width: 20,
    height: 2100,
    sillHeight: 0,
    kind: "door",
    hitToleranceWorld: 0,
    ...overrides,
  });
}

describe("nearestOpeningPlacement", () => {
  it("projects onto transformed metric segments and returns cumulative distance data", () => {
    const candidate = placement(
      { x: 20, y: 120 },
      [
        wall(
          "00000000-0000-4000-8000-000000000101",
          [{ x: 0, y: 0 }, { x: 100, y: 0 }],
          {
            transform: {
              translation: { x: 10, y: 20 },
              rotation: Math.PI / 2,
              scale: { x: 2, y: 3 },
            },
          },
        ),
      ],
    );

    expect(candidate).toMatchObject({
      wallId: "00000000-0000-4000-8000-000000000101",
      valid: true,
    });
    expect(candidate?.distanceAlongWall).toBeCloseTo(100);
    expect(candidate?.worldCenter.x).toBeCloseTo(10);
    expect(candidate?.worldCenter.y).toBeCloseTo(120);
    expect(candidate?.tangent.x).toBeCloseTo(0);
    expect(candidate?.tangent.y).toBeCloseTo(1);
    expect(candidate?.effectiveThickness).toBeCloseTo(30);
    expect(candidate?.issue).toBeUndefined();
  });

  it("uses the caller-converted world tolerance plus effective half-thickness", () => {
    const candidateWall = wall(
      "00000000-0000-4000-8000-000000000102",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    const eightPixelsAtTwoPixelsPerMillimetre = 4;

    expect(
      placement(
        { x: 50, y: 9 },
        [candidateWall],
        { hitToleranceWorld: eightPixelsAtTwoPixelsPerMillimetre },
      ),
    ).toBeDefined();
    expect(
      placement(
        { x: 50, y: 9 + 1e-6 },
        [candidateWall],
        { hitToleranceWorld: eightPixelsAtTwoPixelsPerMillimetre },
      ),
    ).toBeUndefined();
  });

  it("retains an invalid in-range preview with the first core geometry issue", () => {
    const candidateWall = wall(
      "00000000-0000-4000-8000-000000000103",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    const candidate = placement({ x: 5, y: 0 }, [candidateWall]);

    expect(candidate).toMatchObject({
      wallId: candidateWall.id,
      distanceAlongWall: 5,
      valid: false,
      issue: {
        code: "OPENING_ENDPOINT_CLEARANCE",
        wallId: candidateWall.id,
      },
    });
  });

  it("sorts candidates by perpendicular distance, wall ID, then segment index", () => {
    const fartherEarlier = wall(
      "00000000-0000-4000-8000-000000000104",
      [{ x: -100, y: 4 }, { x: 100, y: 4 }],
    );
    const closerLater = wall(
      "00000000-0000-4000-8000-000000000105",
      [{ x: -100, y: 2 }, { x: 100, y: 2 }],
    );
    expect(
      placement(
        { x: 0, y: 0 },
        [fartherEarlier, closerLater],
        { hitToleranceWorld: 5 },
      )?.wallId,
    ).toBe(closerLater.id);

    const equalEarlier = wall(
      "00000000-0000-4000-8000-000000000106",
      [{ x: -100, y: -2 }, { x: 100, y: -2 }],
    );
    const equalLater = wall(
      "00000000-0000-4000-8000-000000000107",
      [{ x: -100, y: 2 }, { x: 100, y: 2 }],
    );
    expect(
      placement(
        { x: 0, y: 0 },
        [equalLater, equalEarlier],
        { hitToleranceWorld: 5 },
      )?.wallId,
    ).toBe(equalEarlier.id);

    const twoSegments = wall(
      "00000000-0000-4000-8000-000000000108",
      [{ x: -10, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 10 }],
      { thickness: 1 },
    );
    const segmentTie = placement(
      { x: 0, y: 5 },
      [twoSegments],
      { width: 1, hitToleranceWorld: 4 },
    );
    expect(segmentTie?.worldCenter.x).toBeCloseTo(-2.5);
    expect(segmentTie?.worldCenter.y).toBeCloseTo(2.5);
  });

  it("ignores degenerate walls and rejects invalid pointer parameters", () => {
    const degenerate = wall(
      "00000000-0000-4000-8000-000000000109",
      [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    );
    expect(placement({ x: 0, y: 0 }, [degenerate])).toBeUndefined();
    expect(placement({ x: Number.NaN, y: 0 }, [])).toBeUndefined();
    expect(
      placement(
        { x: 0, y: 0 },
        [],
        { hitToleranceWorld: Number.POSITIVE_INFINITY },
      ),
    ).toBeUndefined();
  });
});

describe("hitTestOpening", () => {
  it("uses transformed opening projection and includes exact expanded boundaries", () => {
    const candidateWall = wall(
      "00000000-0000-4000-8000-000000000110",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      {
        transform: {
          translation: { x: 10, y: 20 },
          rotation: Math.PI / 2,
          scale: { x: 2, y: 3 },
        },
      },
    );
    const candidateOpening = opening(candidateWall.id, {
      distanceAlongWall: 100,
      width: 20,
    });

    expect(
      hitTestOpening(
        { x: 27, y: 132 },
        candidateOpening,
        candidateWall,
        2,
      ),
    ).toBe(true);
    expect(
      hitTestOpening(
        { x: 27 + 1e-6, y: 132 },
        candidateOpening,
        candidateWall,
        2,
      ),
    ).toBe(false);
    expect(
      hitTestOpening(
        { x: 27, y: 132 + 1e-6 },
        candidateOpening,
        candidateWall,
        2,
      ),
    ).toBe(false);
  });

  it("returns opening hit data independently so callers can prioritize it over its wall", () => {
    const candidateWall = wall(
      "00000000-0000-4000-8000-000000000111",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    const candidateOpening = opening(candidateWall.id);
    expect(
      hitTestOpening(
        { x: 50, y: 0 },
        candidateOpening,
        candidateWall,
        0,
      ),
    ).toBe(true);
  });

  it("rejects mismatched, degenerate, and non-finite inputs", () => {
    const candidateWall = wall(
      "00000000-0000-4000-8000-000000000112",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    const candidateOpening = opening(
      "00000000-0000-4000-8000-000000000113",
    );
    expect(
      hitTestOpening(
        { x: 50, y: 0 },
        candidateOpening,
        candidateWall,
        0,
      ),
    ).toBe(false);
    expect(
      hitTestOpening(
        { x: Number.NaN, y: 0 },
        opening(candidateWall.id),
        candidateWall,
        0,
      ),
    ).toBe(false);
    expect(
      hitTestOpening(
        { x: 50, y: 0 },
        opening(candidateWall.id),
        candidateWall,
        -1,
      ),
    ).toBe(false);
  });
});
