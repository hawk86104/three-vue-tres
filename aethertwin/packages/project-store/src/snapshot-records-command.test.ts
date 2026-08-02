import {
  createInitialSnapshot,
  identityTransform2D,
  parseSnapshot,
  type AssetRecord,
  type Fixture,
  type GuidedRoute,
  type MediaAsset,
  type PlanReference,
  type ProductContent,
  type ProjectSnapshot,
  type RouteNetwork,
} from "@aethertwin/core-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectStore,
  SandboxProjectBackend,
  patchSnapshotRecordsCommand,
  type SnapshotRecordsPatch,
} from "./index";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const digest = (character: string): string => character.repeat(64);

function asset(id: string, character: string): AssetRecord {
  const sha256 = digest(character);
  return {
    id,
    sha256,
    relativePath: `assets/sha256/${sha256.slice(0, 2)}/${sha256}.png`,
    mediaType: "image/png",
    size: 16,
  };
}

function reference(
  snapshot: ProjectSnapshot,
  assetId: string,
  id: string,
  name: string,
  opacity = 1,
): PlanReference {
  const floor = snapshot.project.floors[0]!;
  return {
    id,
    name,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    assetId,
    intrinsicSize: { width: 100, height: 50 },
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    opacity,
    locked: false,
    calibration: null,
  };
}

function initialSnapshot(): ProjectSnapshot {
  return createInitialSnapshot({
    name: "Records",
    profile: "showroom",
    uuid: (() => {
      let value = 1;
      return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
    })(),
  });
}

describe("snapshot.records.patch", () => {
  it("applies ordered asset insert, update, and removal and produces an exact inverse", () => {
    const empty = initialSnapshot();
    const first = asset("00000000-0000-4000-8000-000000000010", "a");
    const middle = asset("00000000-0000-4000-8000-000000000011", "b");
    const second = asset("00000000-0000-4000-8000-000000000012", "c");
    const updatedSecond = { ...second, size: 32 };
    const initial = parseSnapshot({ ...empty, assets: [first, second] });
    const payload: SnapshotRecordsPatch<"assets"> = {
      collection: "assets",
      changes: [
        { id: middle.id, before: null, after: middle, index: 1 },
        { id: second.id, before: second, after: updatedSecond, index: 2 },
        { id: first.id, before: first, after: null },
      ],
    };

    const prepared = patchSnapshotRecordsCommand.prepare(initial, payload);

    expect(prepared.next.assets).toEqual([middle, updatedSecond]);
    expect(prepared.inversePayload).toEqual({
      collection: "assets",
      changes: [
        { id: first.id, before: null, after: first, index: 0 },
        { id: second.id, before: updatedSecond, after: second, index: 2 },
        { id: middle.id, before: middle, after: null, index: 1 },
      ],
    });
    expect(
      patchSnapshotRecordsCommand.applyInverse(prepared.next, prepared.inversePayload),
    ).toEqual(initial);
  });

  it("preserves plan reference ordering through insert, update, removal, and inverse replay", () => {
    const empty = initialSnapshot();
    const source = asset("00000000-0000-4000-8000-000000000020", "d");
    const first = reference(empty, source.id, "00000000-0000-4000-8000-000000000021", "First");
    const middle = reference(empty, source.id, "00000000-0000-4000-8000-000000000022", "Middle");
    const second = reference(empty, source.id, "00000000-0000-4000-8000-000000000023", "Second");
    const updatedSecond = { ...second, opacity: 0.5 };
    const initial = parseSnapshot({
      ...empty,
      assets: [source],
      project: { ...empty.project, planReferences: [first, second] },
    });

    const prepared = patchSnapshotRecordsCommand.prepare(initial, {
      collection: "planReferences",
      changes: [
        { id: middle.id, before: null, after: middle, index: 1 },
        { id: second.id, before: second, after: updatedSecond },
        { id: first.id, before: first, after: null, index: 0 },
      ],
    });

    expect(prepared.next.project.planReferences).toEqual([middle, updatedSecond]);
    expect(
      patchSnapshotRecordsCommand.applyInverse(prepared.next, prepared.inversePayload),
    ).toEqual(initial);
  });

  it("commits heterogeneous patches as one history step and undoes and redoes them together", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const commit = vi.spyOn(backend, "commit");
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Atomic records", location: "sandbox", profile: "showroom" });
    const initial = store.getState().snapshot!;
    const source = asset("00000000-0000-4000-8000-000000000030", "e");
    const planReference = reference(
      initial,
      source.id,
      "00000000-0000-4000-8000-000000000031",
      "Reference",
    );

    await store.applySnapshotRecordPatches([
      {
        collection: "assets",
        changes: [{ id: source.id, before: null, after: source }],
      },
      {
        collection: "planReferences",
        changes: [{ id: planReference.id, before: null, after: planReference }],
      },
    ]);

    expect(store.getState().snapshot).toMatchObject({
      sequence: 2,
      assets: [source],
      project: { planReferences: [planReference] },
    });
    const applyBatch = commit.mock.calls[0]![1];
    expect(applyBatch.journal).toHaveLength(2);
    expect(new Set(applyBatch.journal.map((operation) => operation.transactionId)).size).toBe(1);
    expect(applyBatch.journal.map((operation) => operation.commandType)).toEqual([
      "snapshot.records.patch",
      "snapshot.records.patch",
    ]);

    await store.undo();
    expect(store.getState().snapshot).toMatchObject({
      sequence: 4,
      assets: [],
      project: { planReferences: [] },
    });
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true });

    await store.redo();
    expect(store.getState().snapshot).toMatchObject({
      sequence: 6,
      assets: [source],
      project: { planReferences: [planReference] },
    });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });
    await store.dispose();
  });

  it("rejects stale before values, duplicate ids, unknown collections, paths, and extra fields", () => {
    const initial = initialSnapshot();
    const source = asset("00000000-0000-4000-8000-000000000040", "f");
    const stale = { ...source, size: 99 };
    const invalidPayloads: unknown[] = [
      {
        collection: "assets",
        changes: [{ id: source.id, before: stale, after: source }],
      },
      {
        collection: "assets",
        changes: [
          { id: source.id, before: null, after: source },
          { id: source.id, before: null, after: source },
        ],
      },
      { collection: "vendors", changes: [] },
      { collection: "assets", path: "/assets/0", changes: [] },
      { collection: "assets", changes: [], extra: true },
      {
        collection: "assets",
        changes: [{ id: source.id, before: null, after: source, extra: true }],
      },
      {
        collection: "assets",
        changes: [{ id: source.id, before: null, after: null }],
      },
      {
        collection: "assets",
        changes: [{ id: source.id, before: null, after: { ...source, unexpected: true } }],
      },
    ];

    for (const payload of invalidPayloads) {
      expect(() =>
        patchSnapshotRecordsCommand.prepare(
          initial,
          payload as SnapshotRecordsPatch<"assets">,
        ),
      ).toThrow();
    }
  });

  it("parses the complete resulting schema-v3 snapshot before publication", () => {
    const initial = initialSnapshot();
    const missingAssetReference = reference(
      initial,
      "00000000-0000-4000-8000-000000000099",
      "00000000-0000-4000-8000-000000000050",
      "Broken",
    );

    expect(() =>
      patchSnapshotRecordsCommand.prepare(initial, {
        collection: "planReferences",
        changes: [{
          id: missingAssetReference.id,
          before: null,
          after: missingAssetReference,
        }],
      }),
    ).toThrow(/asset|reference/i);
    expect(initial.project.planReferences).toEqual([]);
  });

  it("replays fixture content and guided routes as one heterogeneous history step", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({
      name: "Content route replay",
      location: "sandbox",
      profile: "showroom",
    });
    const initial = store.getState().snapshot!;
    const floor = initial.project.floors[0]!;
    const fixture: Fixture = {
      id: "00000000-0000-4000-8000-000000000081",
      name: "Replay fixture",
      tags: [],
      floorId: floor.id,
      layerId: floor.layers[0]!.id,
      transform: identityTransform2D,
      locked: false,
      type: "fixture",
      kind: "display-table",
      size: { width: 1200, height: 600 },
    };
    await store.applyPlanEdit({
      reason: "create",
      changes: [{ id: fixture.id, before: null, after: fixture }],
    });
    const source = asset("00000000-0000-4000-8000-000000000080", "a");
    const media: MediaAsset = {
      id: "00000000-0000-4000-8000-000000000082",
      name: "Replay image",
      tags: [],
      assetId: source.id,
      kind: "image",
    };
    const content: ProductContent = {
      id: "00000000-0000-4000-8000-000000000083",
      name: "Replay content",
      tags: [],
      targetEntityId: fixture.id,
      description: "Durable content",
      mediaAssetIds: [media.id],
    };
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000000084",
      name: "Replay network",
      tags: [],
      nodes: [
        {
          id: "00000000-0000-4000-8000-000000000085",
          name: "Entrance",
          tags: [],
          position: { x: 0, y: 0 },
          floorId: floor.id,
          kind: "entrance",
        },
        {
          id: "00000000-0000-4000-8000-000000000086",
          name: "Product stop",
          tags: [],
          position: { x: 1000, y: 0 },
          floorId: floor.id,
          kind: "showroom-stop",
        },
      ],
      edges: [{
        id: "00000000-0000-4000-8000-000000000087",
        name: "Entrance to product",
        tags: [],
        from: "00000000-0000-4000-8000-000000000085",
        to: "00000000-0000-4000-8000-000000000086",
        distance: 1000,
        bidirectional: true,
        accessible: true,
        enabled: true,
        width: 1200,
        weight: 1,
      }],
    };
    const guided: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000000088",
      name: "Replay guide",
      tags: [],
      routeNetworkId: network.id,
      stopNodeIds: [network.nodes[0]!.id, network.nodes[1]!.id],
    };
    const commit = vi.spyOn(backend, "commit");

    await store.applySnapshotRecordPatches([
      { collection: "assets", changes: [{ id: source.id, before: null, after: source }] },
      { collection: "mediaAssets", changes: [{ id: media.id, before: null, after: media }] },
      { collection: "productContents", changes: [{ id: content.id, before: null, after: content }] },
      { collection: "routeNetworks", changes: [{ id: network.id, before: null, after: network }] },
      { collection: "guidedRoutes", changes: [{ id: guided.id, before: null, after: guided }] },
    ]);

    expect(store.getState().snapshot).toMatchObject({
      sequence: 6,
      assets: [source],
      project: {
        entities: [fixture],
        mediaAssets: [media],
        productContents: [content],
        routeNetworks: [network],
        guidedRoutes: [guided],
      },
    });
    const journal = commit.mock.calls[0]![1].journal;
    expect(journal).toHaveLength(5);
    expect(new Set(journal.map(({ transactionId }) => transactionId)).size).toBe(1);

    await store.undo();
    expect(store.getState().snapshot).toMatchObject({
      sequence: 11,
      assets: [],
      project: {
        entities: [fixture],
        mediaAssets: [],
        productContents: [],
        routeNetworks: [],
        guidedRoutes: [],
      },
    });
    await store.redo();
    expect(store.getState().snapshot).toMatchObject({
      sequence: 16,
      assets: [source],
      project: {
        mediaAssets: [media],
        productContents: [content],
        routeNetworks: [network],
        guidedRoutes: [guided],
      },
    });
    await store.dispose();
  });
});
