import type { Point2, Wall } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  normalizeWallTopology,
  type NormalizedRoomTopology,
} from "./index";

const FLOOR_ID = "00000000-0000-4000-8000-000000000010";
const LAYER_ID = "00000000-0000-4000-8000-000000000011";

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
    floorId: FLOOR_ID,
    layerId: LAYER_ID,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    spatial3D: { elevation: 0, height: 3000 },
    locked: false,
    centerLine,
    thickness: 100,
    ...overrides,
  };
}

function expectSuccess(
  result: ReturnType<typeof normalizeWallTopology>,
): NormalizedRoomTopology {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected topology success, received ${result.issue.code}`);
  return result.value;
}

function expectFailure(
  result: ReturnType<typeof normalizeWallTopology>,
  code: string,
) {
  expect(result).toMatchObject({ ok: false, issue: { code } });
  if (result.ok) throw new Error(`Expected ${code}, received topology success`);
  return result.issue;
}

describe("normalizeWallTopology", () => {
  it("transforms polylines, extracts only nonzero segments, and reports removed zero-length segments", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall(
          "wall-b",
          [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
          {
            transform: {
              translation: { x: 100, y: 200 },
              rotation: Math.PI / 2,
              scale: { x: 2, y: 3 },
            },
          },
        ),
      ],
      toleranceMm: 0.1,
    }));

    expect(candidate.vertices).toEqual([
      { x: 70, y: 220 },
      { x: 100, y: 200 },
      { x: 100, y: 220 },
    ]);
    expect(candidate.edges).toEqual([
      { a: 0, b: 2, wallIds: ["wall-b"] },
      { a: 1, b: 2, wallIds: ["wall-b"] },
    ]);
    expect(candidate.diagnostics).toContainEqual({
      code: "ZERO_LENGTH_SEGMENT",
      wallIds: ["wall-b"],
      segmentIndices: [0],
    });
  });

  it("splits exact non-collinear crossings into deterministic vertices and edges", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall("wall-horizontal", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
        wall("wall-vertical", [{ x: 5, y: -5 }, { x: 5, y: 5 }]),
      ],
      toleranceMm: 0.01,
    }));

    expect(candidate.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: -5 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]);
    expect(candidate.edges).toEqual([
      { a: 0, b: 2, wallIds: ["wall-horizontal"] },
      { a: 1, b: 2, wallIds: ["wall-vertical"] },
      { a: 2, b: 3, wallIds: ["wall-vertical"] },
      { a: 2, b: 4, wallIds: ["wall-horizontal"] },
    ]);
  });

  it("projects endpoint-on-segment T-junctions within tolerance and uses the projected coordinate", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall("wall-horizontal", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
        wall("wall-vertical", [{ x: 5, y: 0.04 }, { x: 5, y: 5 }]),
      ],
      toleranceMm: 0.1,
    }));

    expect(candidate.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]);
    expect(candidate.edges).toEqual([
      { a: 0, b: 1, wallIds: ["wall-horizontal"] },
      { a: 1, b: 2, wallIds: ["wall-vertical"] },
      { a: 1, b: 3, wallIds: ["wall-horizontal"] },
    ]);
  });

  it("collects every split parameter before emitting a segment crossed multiple times", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall("wall-main", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
        wall("wall-left", [{ x: 2, y: -2 }, { x: 2, y: 2 }]),
        wall("wall-right", [{ x: 8, y: -2 }, { x: 8, y: 2 }]),
      ],
      toleranceMm: 0.01,
    }));

    const mainEdges = candidate.edges.filter((edge) => edge.wallIds.includes("wall-main"));
    expect(mainEdges).toHaveLength(3);
    expect(mainEdges.map((edge) => [
      candidate.vertices[edge.a],
      candidate.vertices[edge.b],
    ])).toEqual([
      [{ x: 0, y: 0 }, { x: 2, y: 0 }],
      [{ x: 2, y: 0 }, { x: 8, y: 0 }],
      [{ x: 8, y: 0 }, { x: 10, y: 0 }],
    ]);
  });

  it("clusters by the first sorted representative rather than transitively or by averaging", () => {
    const walls = [
      wall("wall-a", [{ x: -10, y: 0 }, { x: 0, y: 0 }]),
      wall("wall-b", [{ x: 0.08, y: 0 }, { x: 0.08, y: 10 }]),
      wall("wall-c", [{ x: 0.16, y: 0 }, { x: 10, y: 0 }]),
    ];
    const candidate = expectSuccess(normalizeWallTopology({
      walls,
      toleranceMm: 0.1,
    }));
    const permuted = expectSuccess(normalizeWallTopology({
      walls: [walls[2]!, walls[0]!, walls[1]!],
      toleranceMm: 0.1,
    }));

    expect(candidate.vertices).toContainEqual({ x: 0, y: 0 });
    expect(candidate.vertices).toContainEqual({ x: 0.16, y: 0 });
    expect(candidate.vertices).not.toContainEqual({ x: 0.04, y: 0 });
    expect(JSON.stringify(permuted)).toBe(JSON.stringify(candidate));
  });

  it("removes edges collapsed by clustering and reports the deterministic diagnostic", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall("wall-short", [{ x: 0, y: 0 }, { x: 0.05, y: 0 }]),
      ],
      toleranceMm: 0.1,
    }));

    expect(candidate.vertices).toEqual([{ x: 0, y: 0 }]);
    expect(candidate.edges).toEqual([]);
    expect(candidate.diagnostics).toContainEqual({
      code: "NORMALIZED_ZERO_LENGTH_EDGE",
      wallIds: ["wall-short"],
      segmentIndices: [0],
    });
  });

  it("merges duplicate normalized edges and sorts all contributing wall IDs", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall("wall-z", [{ x: 0, y: 0.05 }, { x: 10, y: 0.05 }]),
        wall("wall-a", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
      ],
      toleranceMm: 0.1,
    }));

    expect(candidate.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(candidate.edges).toEqual([
      { a: 0, b: 1, wallIds: ["wall-a", "wall-z"] },
    ]);
    expect(candidate.diagnostics).toContainEqual({
      code: "DUPLICATE_EDGE",
      wallIds: ["wall-a", "wall-z"],
    });
  });

  it("rejects positive-length collinear overlap without returning partial topology", () => {
    const issue = expectFailure(normalizeWallTopology({
      walls: [
        wall("wall-z", [{ x: 5, y: 0 }, { x: 15, y: 0 }]),
        wall("wall-a", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
      ],
      toleranceMm: 0.1,
    }), "COLLINEAR_OVERLAP");

    expect(issue).toEqual({
      code: "COLLINEAR_OVERLAP",
      message: "Collinear wall segments overlap over a positive length.",
      wallIds: ["wall-a", "wall-z"],
      segmentIndices: [0, 0],
    });
    expect("value" in issue).toBe(false);
  });

  it("allows collinear walls that meet only at a shared endpoint", () => {
    const candidate = expectSuccess(normalizeWallTopology({
      walls: [
        wall("wall-b", [{ x: 10, y: 0 }, { x: 20, y: 0 }]),
        wall("wall-a", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
      ],
      toleranceMm: 0.1,
    }));

    expect(candidate.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(candidate.edges).toEqual([
      { a: 0, b: 1, wallIds: ["wall-a"] },
      { a: 1, b: 2, wallIds: ["wall-b"] },
    ]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid tolerance %s",
    (toleranceMm) => {
      expectFailure(normalizeWallTopology({
        walls: [],
        toleranceMm,
      }), "INVALID_ROOM_TOLERANCE");
    },
  );

  it("rejects non-finite transformed wall geometry with the responsible wall and segment", () => {
    const issue = expectFailure(normalizeWallTopology({
      walls: [
        wall("wall-invalid", [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }]),
      ],
      toleranceMm: 0.1,
    }), "NON_FINITE_WALL_GEOMETRY");

    expect(issue).toMatchObject({
      wallIds: ["wall-invalid"],
      segmentIndices: [0],
    });
  });

  it("orders bounding-box candidates independently of wall input order", () => {
    const walls = [
      wall("wall-d", [{ x: 100, y: 100 }, { x: 110, y: 100 }]),
      wall("wall-c", [{ x: 5, y: -5 }, { x: 5, y: 5 }]),
      wall("wall-b", [{ x: 20, y: 20 }, { x: 30, y: 20 }]),
      wall("wall-a", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
    ];
    const canonical = expectSuccess(normalizeWallTopology({
      walls,
      toleranceMm: 0.01,
      maxPairComparisons: 1,
    }));
    const reversed = expectSuccess(normalizeWallTopology({
      walls: [...walls].reverse(),
      toleranceMm: 0.01,
      maxPairComparisons: 1,
    }));

    expect(JSON.stringify(reversed)).toBe(JSON.stringify(canonical));
  });

  it("allows exactly the comparison limit and fails before emitting partial data when it is exceeded", () => {
    const walls = [
      wall("wall-a", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
      wall("wall-b", [{ x: 0, y: 0 }, { x: 0, y: 10 }]),
      wall("wall-c", [{ x: 0, y: 0 }, { x: -10, y: 5 }]),
    ];

    expect(normalizeWallTopology({
      walls,
      toleranceMm: 0.01,
      maxPairComparisons: 3,
    }).ok).toBe(true);
    const issue = expectFailure(normalizeWallTopology({
      walls,
      toleranceMm: 0.01,
      maxPairComparisons: 2,
    }), "TOPOLOGY_COMPLEXITY_LIMIT");
    expect(issue).toMatchObject({
      comparisonCount: 3,
      maxPairComparisons: 2,
    });
  });

  it("produces byte-identical vertices, edges, diagnostics, and failures under wall and segment permutation", () => {
    const walls = [
      wall("wall-c", [{ x: 5, y: -5 }, { x: 5, y: 5 }]),
      wall("wall-a", [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]),
      wall("wall-b", [{ x: 0, y: 0.05 }, { x: 10, y: 0.05 }]),
    ];
    const permutedWalls = [
      wall("wall-b", [{ x: 10, y: 0.05 }, { x: 0, y: 0.05 }]),
      wall("wall-a", [{ x: 10, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }]),
      wall("wall-c", [{ x: 5, y: 5 }, { x: 5, y: -5 }]),
    ];

    const original = normalizeWallTopology({ walls, toleranceMm: 0.1 });
    const permuted = normalizeWallTopology({
      walls: permutedWalls,
      toleranceMm: 0.1,
    });
    expect(JSON.stringify(permuted)).toBe(JSON.stringify(original));

    const overlap = [
      wall("wall-z", [{ x: 5, y: 0 }, { x: 15, y: 0 }]),
      wall("wall-a", [{ x: 0, y: 0 }, { x: 10, y: 0 }]),
    ];
    const reversedOverlap = [
      wall("wall-a", [{ x: 10, y: 0 }, { x: 0, y: 0 }]),
      wall("wall-z", [{ x: 15, y: 0 }, { x: 5, y: 0 }]),
    ];
    expect(JSON.stringify(normalizeWallTopology({
      walls: overlap,
      toleranceMm: 0.1,
    }))).toBe(JSON.stringify(normalizeWallTopology({
      walls: reversedOverlap,
      toleranceMm: 0.1,
    })));
  });
});
