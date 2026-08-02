import { describe, expect, it } from "vitest";
import contentRoutesVectorsJson from "../../../fixtures/contracts/content-routes.v1.json";
import * as coreModel from "./index";
import {
  ModelValidationError,
  parseSnapshot,
  type ModelIssueCode,
} from "./index";

type JsonPath = readonly (string | number)[];
type JsonRecord = Record<string, unknown>;

type VectorOperation =
  | { readonly op: "set"; readonly path: JsonPath; readonly value: unknown }
  | { readonly op: "append"; readonly path: JsonPath; readonly value: unknown }
  | { readonly op: "remove"; readonly path: JsonPath };

interface VectorCase {
  readonly name: string;
  readonly operations: readonly VectorOperation[];
}

interface InvalidVectorCase extends VectorCase {
  readonly expected: {
    readonly code: ModelIssueCode;
    readonly path: string;
  };
}

interface ContentRoutesVectors {
  readonly version: number;
  readonly routeGeometryEpsilonMm: number;
  readonly baseSnapshot: unknown;
  readonly validCases: readonly VectorCase[];
  readonly invalidCases: readonly InvalidVectorCase[];
}

const vectors = contentRoutesVectorsJson as unknown as ContentRoutesVectors;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function contractId(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAtPath(value: unknown, path: JsonPath): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        throw new Error(`Expected array entry at ${JSON.stringify(path)}`);
      }
      current = current[segment];
      continue;
    }
    if (!isJsonRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new Error(`Expected object property at ${JSON.stringify(path)}`);
    }
    current = current[segment];
  }
  return current;
}

function applyOperation(value: unknown, operation: VectorOperation): void {
  if (operation.op === "append") {
    const target = valueAtPath(value, operation.path);
    if (!Array.isArray(target)) {
      throw new Error(`Expected append target at ${JSON.stringify(operation.path)}`);
    }
    target.push(cloneJson(operation.value));
    return;
  }

  const key = operation.path.at(-1);
  if (key === undefined) throw new Error("Contract operations require a non-empty path");
  const parent = valueAtPath(value, operation.path.slice(0, -1));
  if (typeof key === "number") {
    if (!Array.isArray(parent) || key < 0 || key >= parent.length) {
      throw new Error(`Expected array entry at ${JSON.stringify(operation.path)}`);
    }
    if (operation.op === "remove") {
      parent.splice(key, 1);
    } else {
      parent[key] = cloneJson(operation.value);
    }
    return;
  }

  if (!isJsonRecord(parent) || !Object.prototype.hasOwnProperty.call(parent, key)) {
    throw new Error(`Expected object property at ${JSON.stringify(operation.path)}`);
  }
  if (operation.op === "remove") {
    delete parent[key];
  } else {
    parent[key] = cloneJson(operation.value);
  }
}

function candidateFor(vector: VectorCase): unknown {
  const candidate = cloneJson(vectors.baseSnapshot);
  vector.operations.forEach((operation) => applyOperation(candidate, operation));
  return candidate;
}

function expectModelIssue(
  action: () => unknown,
  expected: InvalidVectorCase["expected"],
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ModelValidationError);
  expect(thrown).toMatchObject(expected);
}

describe("M2.3 content and route shared contract", () => {
  it("publishes the exact contract version and route geometry epsilon", () => {
    expect(vectors.version).toBe(1);
    expect(
      (coreModel as unknown as Record<string, unknown>).ROUTE_GEOMETRY_EPSILON_MM,
    ).toBe(vectors.routeGeometryEpsilonMm);
  });

  it("accepts and deeply freezes the complete base snapshot", () => {
    const parsed = parseSnapshot(cloneJson(vectors.baseSnapshot));

    expect(parsed).toEqual(vectors.baseSnapshot);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.project.productContents[0]?.mediaAssetIds)).toBe(true);
    expect(Object.isFrozen(parsed.project.routeNetworks[0]?.edges[0])).toBe(true);
    expect(Object.isFrozen(parsed.project.guidedRoutes[0]?.stopNodeIds)).toBe(true);
  });

  it.each(vectors.validCases)("accepts valid vector: $name", (vector) => {
    const candidate = candidateFor(vector);
    expect(parseSnapshot(candidate)).toEqual(candidate);
  });

  it("validates a large sparse route network without quadratic pair scanning", () => {
    const candidate = cloneJson(vectors.baseSnapshot);
    const nodes = valueAtPath(candidate, ["project", "routeNetworks", 0, "nodes"]);
    if (!Array.isArray(nodes)) throw new Error("Expected route-network nodes");

    for (let index = 0; index < 20_000; index += 1) {
      nodes.push({
        id: contractId(100_000 + index),
        name: `Sparse node ${index}`,
        tags: [],
        position: { x: 10_000 + index, y: 20_000 },
        floorId: "00000000-0000-4000-8000-000000000002",
        kind: "junction",
      });
    }

    expect(parseSnapshot(candidate).project.routeNetworks[0]?.nodes).toHaveLength(20_004);
  }, 2_000);

  it.each(vectors.invalidCases)("rejects invalid vector: $name", (vector) => {
    expectModelIssue(() => parseSnapshot(candidateFor(vector)), vector.expected);
  });
});
