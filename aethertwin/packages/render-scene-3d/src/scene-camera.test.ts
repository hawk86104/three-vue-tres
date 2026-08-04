import { describe, expect, it } from "vitest";
import { frameCameraToProjection } from "./scene-camera";
import type {
  SceneCameraState,
  SceneProjection,
  SceneRecord,
} from "./types";

const camera: SceneCameraState = {
  position: { x: 8, y: 6, z: 8 },
  target: { x: 0, y: 0, z: 0 },
  fieldOfView: 45,
};

function record(
  key: string,
  kind: SceneRecord["kind"],
  selected: boolean,
  minX: number,
  maxX: number,
): SceneRecord {
  return {
    key,
    kind,
    sourceIds: [key],
    selectionId: key,
    selected,
    bounds: {
      min: { x: minX, y: 0, z: -2 },
      max: { x: maxX, y: 2, z: 0 },
    },
    geometry: {
      topology: kind === "route" ? "lines" : "triangles",
      positions: [],
      indices: [],
      normals: [],
      uvs: [],
    },
    material: {
      role: kind === "route" ? "route" : "fixture",
      definitionId: null,
      baseColor: "#78909c",
      roughness: 0.6,
      metalness: 0,
      opacity: 1,
      textureAssetId: null,
      textureColorSpace: null,
    },
    materialTargetId: null,
    selectionOverlay: selected ? { color: "#58b8c4" } : null,
  };
}

function projection(): SceneProjection {
  const records = [
    record("left", "fixture-part", false, -6, -2),
    record("selected", "fixture-part", true, 2, 4),
    record("route", "route", false, 10, 14),
  ];
  return {
    records,
    bounds: {
      min: { x: -6, y: 0, z: -2 },
      max: { x: 14, y: 2, z: 0 },
    },
    requiredTextureAssetIds: [],
    environment: null,
    issues: [],
  };
}

describe("scene camera framing", () => {
  it("frames scene, selection, and route bounds without changing field of view", () => {
    const scene = frameCameraToProjection(projection(), camera, "scene");
    const selection = frameCameraToProjection(projection(), camera, "selection");
    const route = frameCameraToProjection(projection(), camera, "route");

    expect(scene?.target).toEqual({ x: 4, y: 1, z: -1 });
    expect(selection?.target).toEqual({ x: 3, y: 1, z: -1 });
    expect(route?.target).toEqual({ x: 12, y: 1, z: -1 });
    for (const result of [scene, selection, route]) {
      expect(result?.fieldOfView).toBe(45);
      expect(Object.values(result!.position).every(Number.isFinite)).toBe(true);
    }
  });

  it("returns null when the requested selection or route has no records", () => {
    const empty: SceneProjection = {
      ...projection(),
      records: projection().records.filter(({ kind }) => kind !== "route")
        .map((value) => ({ ...value, selected: false, selectionOverlay: null })),
    };
    expect(frameCameraToProjection(empty, camera, "selection")).toBeNull();
    expect(frameCameraToProjection(empty, camera, "route")).toBeNull();
  });

  it("fits horizontal bounds in a portrait viewport", () => {
    const portraitCamera: SceneCameraState = {
      position: { x: 0, y: 1, z: 10 },
      target: { x: 0, y: 1, z: -1 },
      fieldOfView: 45,
    };
    const portraitProjection: SceneProjection = {
      ...projection(),
      records: [record("wide", "fixture-part", false, -10, 10)],
      bounds: {
        min: { x: -10, y: 0, z: -2 },
        max: { x: 10, y: 2, z: 0 },
      },
    };
    const aspect = 0.25;
    const framed = frameCameraToProjection(
      portraitProjection,
      portraitCamera,
      "scene",
      aspect,
    );

    const depth = framed!.position.z - framed!.target.z;
    const horizontalCapacity = depth * Math.tan(Math.PI / 8) * aspect;
    expect(horizontalCapacity).toBeGreaterThanOrEqual(10);
  });
});
