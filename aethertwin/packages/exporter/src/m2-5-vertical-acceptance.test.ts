import showroomDemoFixture from "../../../fixtures/contracts/showroom-demo.v3.json";
import { parseSnapshotV3 } from "@aethertwin/core-model";
import {
  projectScene,
  SceneCameraState,
  SceneExportCapture,
  SceneExportFrame,
  SceneExportPort,
  SceneRendererInput,
} from "@aethertwin/render-scene-3d";
import { describe, expect, it, vi } from "vitest";
import type {
  ProjectExportBackend,
  ProjectExportPreset,
  ProjectExportResult,
} from "./contracts";
import {
  createProjectExportCoordinator,
  projectExportDimensions,
  PROJECT_EXPORT_MAX_CHUNK_BYTES,
} from "./index";

const camera: SceneCameraState = Object.freeze({
  position: Object.freeze({ x: 4, y: 8, z: 12 }),
  target: Object.freeze({ x: 0, y: 0, z: 0 }),
  fieldOfView: 45,
});
const snapshot = parseSnapshotV3(showroomDemoFixture);
const activeFloorId = snapshot.project.floors[0]!.id;
const projectionInput: SceneRendererInput = Object.freeze({
  snapshot,
  activeFloorId,
  selectedIds: new Set<string>(),
  activeGuidedRoute: null,
  camera,
  assetIssues: Object.freeze([]),
});
const scene = projectScene(projectionInput);
const provenance = Object.freeze({
  projectId: snapshot.project.id,
  snapshotSequence: snapshot.sequence,
  activeFloorId,
});

function writePixel(bytes: Uint8Array, offset: number, pixel: readonly number[]): void {
  bytes.set(pixel, offset);
}

function bottomLeftFrame(width: number, height: number): {
  readonly frame: SceneExportFrame;
  readonly topLeft: readonly number[];
  readonly topRight: readonly number[];
  readonly bottomLeft: readonly number[];
  readonly bottomRight: readonly number[];
} {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 3; offset < rgba.byteLength; offset += 4) rgba[offset] = 255;
  const topLeft = [11, 22, 33, 255] as const;
  const topRight = [44, 55, 66, 255] as const;
  const bottomLeft = [77, 88, 99, 255] as const;
  const bottomRight = [111, 122, 133, 255] as const;
  const rowBytes = width * 4;
  writePixel(rgba, 0, bottomLeft);
  writePixel(rgba, rowBytes - 4, bottomRight);
  writePixel(rgba, (height - 1) * rowBytes, topLeft);
  writePixel(rgba, height * rowBytes - 4, topRight);
  return {
    frame: Object.freeze({ width, height, origin: "bottom-left", rgba }),
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  };
}

describe("M2.5 injected-rendering vertical acceptance", () => {
  it.each([
    ["full-hd", 1920, 1080, 8_294_400],
    ["ultra-hd", 3840, 2160, 33_177_600],
  ] as const)("exports %s with fixed capture, top-left rows, and exact chunks", async (
    preset: ProjectExportPreset,
    width,
    height,
    byteLength,
  ) => {
    const dimensions = projectExportDimensions(preset);
    expect(dimensions).toEqual({ preset, width, height });
    expect(scene.records.length).toBeGreaterThan(0);
    expect(scene.issues).toEqual([]);
    const pixels = bottomLeftFrame(width, height);
    const capture: SceneExportCapture = Object.freeze({
      scene,
      camera,
      provenance,
      requiredTextureAssetIds: scene.requiredTextureAssetIds,
      limits: Object.freeze({
        maxTextureSize: 4096,
        maxRenderbufferSize: 4096,
        maxSamples: 4,
      }),
    });
    const port: SceneExportPort = {
      capture: vi.fn(() => capture),
      waitForTextures: vi.fn(async () => undefined),
      render: vi.fn(async () => pixels.frame),
    };
    const chunks: Uint8Array[] = [];
    const result: ProjectExportResult = {
      ...dimensions,
      relativePath: `exports/demo-${preset}.png`,
      byteSize: 1234,
      sha256: "a".repeat(64),
    };
    const backend: ProjectExportBackend = {
      begin: vi.fn(async (_path, _request) => ({
        ...dimensions,
        exportId: "e2500000-0000-4000-8000-000000009001",
        expectedByteLength: byteLength,
        maxChunkBytes: PROJECT_EXPORT_MAX_CHUNK_BYTES,
      })),
      writeChunk: vi.fn(async (_path, _exportId, index, bytes) => {
        expect(index).toBe(chunks.length);
        expect(bytes.byteLength).toBeLessThanOrEqual(1_048_576);
        chunks.push(bytes.slice());
      }),
      finish: vi.fn(async () => result),
      cancel: vi.fn(async () => undefined),
    };

    const operation = createProjectExportCoordinator(backend).start({
      port,
      preset,
      context: {
        projectPath: "projects/showroom-demo.twinproj",
        projectId: provenance.projectId,
        snapshotSequence: provenance.snapshotSequence,
        activeFloorId: provenance.activeFloorId,
        sessionGeneration: 3,
        assetIssues: [],
        isCurrent: () => true,
      },
      onProgress: vi.fn(),
    });
    await expect(operation.result).resolves.toEqual(result);

    expect(port.capture).toHaveBeenCalledOnce();
    expect(port.waitForTextures).toHaveBeenCalledWith(capture);
    expect(port.render).toHaveBeenCalledWith(capture, dimensions);
    expect(backend.begin).toHaveBeenCalledWith(
      "projects/showroom-demo.twinproj",
      { preset, provenance },
    );
    const received = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      received.set(chunk, offset);
      offset += chunk.byteLength;
    }
    expect(chunks).toHaveLength(Math.ceil(byteLength / 1_048_576));
    expect(offset).toBe(byteLength);
    expect([...received.slice(0, 4)]).toEqual(pixels.topLeft);
    expect([...received.slice(width * 4 - 4, width * 4)]).toEqual(pixels.topRight);
    expect([...received.slice(byteLength - width * 4, byteLength - width * 4 + 4)])
      .toEqual(pixels.bottomLeft);
    expect([...received.slice(byteLength - 4)]).toEqual(pixels.bottomRight);
    expect(backend.cancel).not.toHaveBeenCalled();
  });
});
