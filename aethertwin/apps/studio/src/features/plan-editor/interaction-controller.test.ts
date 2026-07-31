import {
  parseSnapshotV3,
  type AssetRecord,
  type Opening,
  type PlanReference,
  type ProjectSnapshot,
  type Wall,
} from "@aethertwin/core-model";
import {
  screenToWorld,
  type PlanEditIntent,
  type SpatialEntity,
} from "@aethertwin/plan-engine";
import type {
  AnySnapshotRecordsPatch,
  BuildingStructurePatch,
} from "@aethertwin/project-store";
import type { PlanPointerEvent } from "@aethertwin/render-plan-2d";
import { describe, expect, it, vi } from "vitest";
import { createPlanEditorStore } from "./editor-session";
import {
  createInteractionController,
  type InteractionController,
} from "./interaction-controller";
import { createPlanEditorTestHarness, pointerAt } from "./plan-editor.test-support";

type Harness = ReturnType<typeof createPlanEditorTestHarness>;

function eventAt(
  type: PlanPointerEvent["type"],
  x: number,
  y: number,
  overrides: Partial<PlanPointerEvent> = {},
): PlanPointerEvent {
  return { ...pointerAt(type, x, y), ...overrides };
}

async function click(
  controller: InteractionController,
  x: number,
  y: number,
  overrides: Partial<PlanPointerEvent> = {},
): Promise<void> {
  await controller.handle(eventAt("pointerdown", x, y, overrides));
  await controller.handle(eventAt("pointerup", x, y, { ...overrides, buttons: 0 }));
}

function firstIntent(harness: Pick<Harness, "applyPlanEdit">): PlanEditIntent {
  const intent = harness.applyPlanEdit.mock.calls[0]?.[0];
  if (intent === undefined) throw new Error("Expected one committed intent.");
  return intent;
}

function createdEntity(harness: Pick<Harness, "applyPlanEdit">): SpatialEntity {
  const after = firstIntent(harness).changes[0]?.after;
  if (after === null || after === undefined) throw new Error("Expected one created entity.");
  return after;
}

function createSnapshotController(
  snapshot: ProjectSnapshot,
  options: {
    readonly getSnapshot?: () => ProjectSnapshot;
    readonly makeId?: () => string;
    readonly applySnapshotRecordPatches?: (
      patches: readonly AnySnapshotRecordsPatch[],
    ) => Promise<void>;
    readonly applyBuildingStructurePatch?: (
      patch: BuildingStructurePatch,
    ) => Promise<void>;
  } = {},
) {
  const activeFloorId = snapshot.project.floors[0]!.id;
  const store = createPlanEditorStore({ activeFloorId });
  const applyPlanEdit = vi.fn(async (intent: PlanEditIntent) => {
    void intent;
    return undefined;
  });
  const applyPlanReferencePatch = vi.fn(async (
    before: PlanReference,
    after: PlanReference | null,
  ) => {
    void before;
    void after;
    return undefined;
  });
  const applySnapshotRecordPatches = options.applySnapshotRecordPatches
    ?? vi.fn(async (patches: readonly AnySnapshotRecordsPatch[]) => {
      void patches;
      return undefined;
    });
  const applyBuildingStructurePatch = options.applyBuildingStructurePatch
    ?? vi.fn(async (patch: BuildingStructurePatch) => {
      void patch;
      return undefined;
    });
  const errors: unknown[] = [];
  let nextId = 100;
  const controller = createInteractionController({
    getSnapshot: options.getSnapshot ?? (() => snapshot),
    store,
    makeId: options.makeId ?? (
      () => `00000000-0000-4000-8000-${(nextId++).toString().padStart(12, "0")}`
    ),
    applyPlanEdit,
    applyPlanReferencePatch,
    applySnapshotRecordPatches,
    applyBuildingStructurePatch,
    onError: (error) => errors.push(error),
  } as Parameters<typeof createInteractionController>[0] & {
    readonly applyPlanReferencePatch: (
      before: PlanReference,
      after: PlanReference | null,
    ) => Promise<void>;
    readonly applySnapshotRecordPatches: (
      patches: readonly AnySnapshotRecordsPatch[],
    ) => Promise<void>;
    readonly applyBuildingStructurePatch: (
      patch: BuildingStructurePatch,
    ) => Promise<void>;
  });
  return {
    snapshot,
    store,
    controller,
    applyPlanEdit,
    applyPlanReferencePatch,
    applySnapshotRecordPatches,
    applyBuildingStructurePatch,
    errors,
  };
}

describe("plan editor interaction controller", () => {

function planReference(
  snapshot: ProjectSnapshot,
  overrides: Partial<PlanReference> = {},
): PlanReference {
  const floor = snapshot.project.floors[0]!;
  return {
    id: "00000000-0000-4000-8000-000000000030",
    name: "Floor plan",
    tags: ["reference"],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    assetId: "00000000-0000-4000-8000-000000000031",
    intrinsicSize: { width: 100, height: 100 },
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    opacity: 0.65,
    locked: false,
    calibration: null,
    ...overrides,
  };
}

function snapshotWithReferences(
  base: ProjectSnapshot,
  references: readonly PlanReference[],
  entities = base.project.entities,
): ProjectSnapshot {
  return parseSnapshotV3({
    ...base,
    assets: assetsForReferences(base, references),
    project: {
      ...base.project,
      entities,
      planReferences: references,
    },
  });
}

function assetsForReferences(
  base: ProjectSnapshot,
  references: readonly PlanReference[],
): readonly AssetRecord[] {
  const existingIds = new Set(base.assets.map(({ id }) => id));
  const missingIds = [...new Set(references.map(({ assetId }) => assetId))]
    .filter((assetId) => !existingIds.has(assetId));
  return [
    ...base.assets,
    ...missingIds.map((assetId, index): AssetRecord => {
      const sha256 = (index + 1).toString(16).repeat(64);
      return {
        id: assetId,
        sha256,
        relativePath: `assets/sha256/${sha256.slice(0, 2)}/${sha256}.png`,
        mediaType: "image/png",
        size: 1,
      };
    }),
  ];
}
  it("creates one boundary intent after three snapped clicks and Enter", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("boundary");

    await click(harness.controller, 50, 50);
    await click(harness.controller, 150, 50);
    await harness.controller.handle(pointerAt("pointermove", 150, -50, 0));

    expect(harness.store.getState().draft).toMatchObject({
      kind: "create",
      tool: "boundary",
      preview: [{
        type: "boundary",
        polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      }],
    });
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    await click(harness.controller, 150, -50);
    expect(harness.store.getState().draft).toMatchObject({
      kind: "create",
      tool: "boundary",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    });

    await harness.controller.keyDown("Enter");

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness)).toMatchObject({
      reason: "create",
      changes: [{ before: null }],
    });
    expect(createdEntity(harness)).toMatchObject({
      type: "boundary",
      name: "Boundary",
      tags: [],
      floorId: harness.floorA.id,
      layerId: harness.floorA.layers[0]!.id,
      locked: false,
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    });
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
  });

  it("creates one wall intent after two snapped clicks", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("wall");

    await click(harness.controller, 250, 50);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    await click(harness.controller, 350, 50);

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness).reason).toBe("create");
    expect(createdEntity(harness)).toMatchObject({
      type: "wall",
      name: "Wall",
      centerLine: [{ x: 200, y: 0 }, { x: 300, y: 0 }],
      thickness: 100,
      floorId: harness.floorA.id,
      layerId: harness.floorA.layers[0]!.id,
    });
  });

  it("creates one zone intent after three snapped clicks and Enter", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("zone");

    await click(harness.controller, 250, 50);
    await click(harness.controller, 350, 50);
    await click(harness.controller, 350, -50);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    await harness.controller.keyDown("Enter");

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness).reason).toBe("create");
    expect(createdEntity(harness)).toMatchObject({
      type: "zone",
      name: "Zone",
      polygon: [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }],
      purpose: "Zone",
      color: "#808080",
    });
  });

  it("creates one market booth space unit from a drag rectangle", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("space-unit");

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    await harness.controller.handle(pointerAt("pointermove", 150, -50));
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    await harness.controller.handle(pointerAt("pointerup", 150, -50, 0));

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness).reason).toBe("create");
    expect(createdEntity(harness)).toMatchObject({
      type: "space-unit",
      name: "Space Unit",
      kind: "booth",
      footprint: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    });
  });

  it("creates one generic fixture from a drag rectangle", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("fixture");

    await harness.controller.handle(pointerAt("pointerdown", 250, 50));
    await harness.controller.handle(pointerAt("pointermove", 350, -50));
    const draft = harness.store.getState().draft;
    expect(draft?.kind).toBe("create");
    if (draft?.kind !== "create") throw new Error("Expected a fixture creation draft.");
    expect(draft.preview[0]).toMatchObject({
      type: "fixture",
      transform: { translation: { x: 200, y: 0 } },
      size: { width: 100, height: 100 },
    });
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    await harness.controller.handle(pointerAt("pointerup", 350, -50, 0));

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness).reason).toBe("create");
    expect(createdEntity(harness)).toMatchObject({
      type: "fixture",
      name: "Fixture",
      kind: "generic",
      transform: { translation: { x: 200, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      size: { width: 100, height: 100 },
    });
  });

  it("previews and creates one centred showroom catalogue fixture while retaining its kind", async () => {
    const base = createPlanEditorTestHarness();
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: { ...base.snapshot.project, profile: "showroom" },
    });
    const harness = createSnapshotController(snapshot);
    harness.store.getState().setActiveTool("fixture");
    harness.store.getState().setSelectedFixtureKind("display-case");

    await harness.controller.handle(eventAt("pointermove", 250, 50, { buttons: 0 }));

    expect(harness.store.getState().draft).toMatchObject({
      kind: "create",
      tool: "fixture",
      points: [{ x: 200, y: 0 }],
      preview: [{
        type: "fixture",
        name: "展示柜",
        kind: "display-case",
        transform: {
          translation: { x: -400, y: -300 },
          rotation: 0,
          scale: { x: 1, y: 1 },
        },
        size: { width: 1_200, height: 600 },
        spatial3D: { elevation: 0, height: 1_200 },
      }],
    });
    expect(harness.store.getState().gestureActive).toBe(false);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();

    await harness.controller.handle(eventAt("pointerup", 250, 50, { buttons: 0 }));

    expect(harness.applyPlanEdit).toHaveBeenCalledOnce();
    expect(firstIntent(harness)).toEqual({
      reason: "create",
      changes: [{
        id: "00000000-0000-4000-8000-000000000100",
        before: null,
        after: {
          type: "fixture",
          id: "00000000-0000-4000-8000-000000000100",
          name: "展示柜",
          tags: [],
          floorId: snapshot.project.floors[0]!.id,
          layerId: snapshot.project.floors[0]!.layers[0]!.id,
          locked: false,
          transform: {
            translation: { x: -400, y: -300 },
            rotation: 0,
            scale: { x: 1, y: 1 },
          },
          kind: "display-case",
          size: { width: 1_200, height: 600 },
          spatial3D: { elevation: 0, height: 1_200 },
        },
      }],
    });
    expect([...harness.store.getState().selectedIds]).toEqual([
      "00000000-0000-4000-8000-000000000100",
    ]);
    expect(harness.store.getState().selectedFixtureKind).toBe("display-case");
  });

  it("rereads the showroom creation layer at pointer-up", async () => {
    const base = createPlanEditorTestHarness();
    const initialFloor = base.snapshot.project.floors[0]!;
    const replacementLayer = {
      id: "00000000-0000-4000-8000-000000000099",
      name: "Placement",
      tags: [],
      visible: true,
      locked: false,
    };
    let current = parseSnapshotV3({
      ...base.snapshot,
      project: { ...base.snapshot.project, profile: "showroom" },
    });
    const harness = createSnapshotController(current, { getSnapshot: () => current });
    harness.store.getState().setActiveTool("fixture");
    harness.store.getState().setSelectedFixtureKind("signage");
    await harness.controller.handle(eventAt("pointermove", 250, 50, { buttons: 0 }));

    current = parseSnapshotV3({
      ...current,
      project: {
        ...current.project,
        floors: [{
          ...initialFloor,
          layers: [
            { ...initialFloor.layers[0]!, locked: true },
            replacementLayer,
          ],
        }, ...current.project.floors.slice(1)],
      },
    });
    await harness.controller.handle(eventAt("pointerup", 250, 50, { buttons: 0 }));

    expect(createdEntity(harness)).toMatchObject({
      type: "fixture",
      kind: "signage",
      layerId: replacementLayer.id,
      size: { width: 600, height: 100 },
      spatial3D: { elevation: 0, height: 1_800 },
    });
  });

  it("retains the showroom choice and preview after persistence or creation-layer failure", async () => {
    const base = createPlanEditorTestHarness();
    let current = parseSnapshotV3({
      ...base.snapshot,
      project: { ...base.snapshot.project, profile: "showroom" },
    });
    const harness = createSnapshotController(current, { getSnapshot: () => current });
    harness.store.getState().setActiveTool("fixture");
    harness.store.getState().setSelectedFixtureKind("screen");
    await harness.controller.handle(eventAt("pointermove", 250, 50, { buttons: 0 }));
    const preview = harness.store.getState().draft;
    harness.applyPlanEdit.mockRejectedValueOnce(new Error("checkpoint unavailable"));

    await harness.controller.handle(eventAt("pointerup", 250, 50, { buttons: 0 }));

    expect(harness.store.getState().selectedFixtureKind).toBe("screen");
    expect(harness.store.getState().draft).toEqual(preview);
    expect(String(harness.errors.at(-1))).toContain("checkpoint unavailable");

    const floor = current.project.floors[0]!;
    current = parseSnapshotV3({
      ...current,
      project: {
        ...current.project,
        floors: [{
          ...floor,
          layers: floor.layers.map((layer) => ({ ...layer, locked: true })),
        }, ...current.project.floors.slice(1)],
      },
    });
    harness.applyPlanEdit.mockClear();
    await harness.controller.handle(eventAt("pointerup", 250, 50, { buttons: 0 }));

    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(harness.store.getState().selectedFixtureKind).toBe("screen");
    expect(harness.store.getState().draft).toEqual(preview);
    expect(String(harness.errors.at(-1))).toContain("No visible, unlocked layer");
  });

  it("clears a showroom catalogue choice and preview on Escape without affecting Market fixture mode", async () => {
    const base = createPlanEditorTestHarness();
    const showroom = parseSnapshotV3({
      ...base.snapshot,
      project: { ...base.snapshot.project, profile: "showroom" },
    });
    const harness = createSnapshotController(showroom);
    harness.store.getState().setActiveTool("fixture");
    harness.store.getState().setSelectedFixtureKind("partition");
    await harness.controller.handle(eventAt("pointermove", 250, 50, { buttons: 0 }));

    await harness.controller.keyDown("Escape");

    expect(harness.store.getState()).toMatchObject({
      activeTool: "select",
      selectedFixtureKind: null,
      draft: null,
    });
  });
  it("creates one custom POI from one snapped click", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("poi");

    await click(harness.controller, 250, 50);

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness).reason).toBe("create");
    expect(createdEntity(harness)).toMatchObject({
      type: "poi",
      name: "Point of Interest",
      kind: "custom",
      radius: 100,
      transform: { translation: { x: 200, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    });
  });

  it("creates one dimension from two anchors and an offset-placement click", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("dimension");

    await click(harness.controller, 50, 50);
    await click(harness.controller, 250, 50);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    await click(harness.controller, 250, -50);

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness).reason).toBe("create");
    expect(createdEntity(harness)).toMatchObject({
      type: "dimension",
      name: "Dimension",
      start: { kind: "entity", entityId: harness.fixture.id, locator: "origin" },
      end: { kind: "point", point: { x: 200, y: 0 } },
      offset: 100,
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    });
  });

  it("replaces click selection and Shift-toggles without committing", async () => {
    const harness = createPlanEditorTestHarness();

    await click(harness.controller, 100, 0);
    expect([...harness.store.getState().selectedIds]).toEqual([harness.fixture.id]);

    await click(harness.controller, 100, 0, { shiftKey: true });
    expect([...harness.store.getState().selectedIds]).toEqual([]);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });


  it("selects a visible active-floor plan reference from the canvas without committing", async () => {
    const base = createPlanEditorTestHarness();
    const reference = planReference(base.snapshot);
    const harness = createSnapshotController(snapshotWithReferences(
      base.snapshot,
      [reference],
      [],
    ));

    await click(harness.controller, 75, 25);

    expect([...harness.store.getState().selectedIds]).toEqual([reference.id]);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
  });

  it("replaces an existing reference selection with the one canvas-selected reference", async () => {
    const base = createPlanEditorTestHarness();
    const first = planReference(base.snapshot);
    const second = planReference(base.snapshot, {
      id: "00000000-0000-4000-8000-000000000032",
      transform: {
        translation: { x: 500, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });
    const harness = createSnapshotController(snapshotWithReferences(
      base.snapshot,
      [first, second],
      [],
    ));
    harness.store.getState().setSelection([second.id]);

    await click(harness.controller, 75, 25);

    expect([...harness.store.getState().selectedIds]).toEqual([first.id]);
    expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
  });

  it("gives a business entity priority over an overlapping plan reference", async () => {
    const base = createPlanEditorTestHarness();
    const reference = planReference(base.snapshot);
    const harness = createSnapshotController(snapshotWithReferences(
      base.snapshot,
      [reference],
      [base.fixture],
    ));

    await click(harness.controller, 75, 25);

    expect([...harness.store.getState().selectedIds]).toEqual([base.fixture.id]);
    expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
  });

  it.each([
    ["reference-locked", true, false],
    ["layer-locked", false, true],
  ] as const)(
    "keeps a visible %s plan reference canvas-selectable for inspection",
    async (_kind, referenceLocked, layerLocked) => {
      const base = createPlanEditorTestHarness();
      const layer = {
        ...base.floorA.layers[0]!,
        locked: layerLocked,
      };
      const snapshot = parseSnapshotV3({
        ...base.snapshot,
        assets: assetsForReferences(base.snapshot, [planReference(base.snapshot)]),
        project: {
          ...base.snapshot.project,
          floors: [
            { ...base.floorA, layers: [layer] },
            base.floorB,
          ],
          entities: [],
          planReferences: [planReference(base.snapshot, {
            layerId: layer.id,
            locked: referenceLocked,
          })],
        },
      });
      const reference = snapshot.project.planReferences[0]!;
      const harness = createSnapshotController(snapshot);

      await click(harness.controller, 75, 25);

      expect([...harness.store.getState().selectedIds]).toEqual([reference.id]);
      expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
    },
  );

  it("does not canvas-select a plan reference on a hidden layer", async () => {
    const base = createPlanEditorTestHarness();
    const hiddenLayer = {
      ...base.floorA.layers[0]!,
      visible: false,
    };
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      assets: assetsForReferences(base.snapshot, [planReference(base.snapshot)]),
      project: {
        ...base.snapshot.project,
        floors: [
          { ...base.floorA, layers: [hiddenLayer] },
          base.floorB,
        ],
        entities: [],
        planReferences: [planReference(base.snapshot, {
          layerId: hiddenLayer.id,
        })],
      },
    });
    const harness = createSnapshotController(snapshot);

    await click(harness.controller, 75, 25);

    expect([...harness.store.getState().selectedIds]).toEqual([]);
    expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
  });

  it("previews reference translation transiently and commits one exact patch on pointer up", async () => {
    const base = createPlanEditorTestHarness();
    const reference = planReference(base.snapshot);
    const harness = createSnapshotController(snapshotWithReferences(
      base.snapshot,
      [reference],
      [],
    ));
    harness.store.getState().setSelection([reference.id]);

    await harness.controller.handle(eventAt("pointerdown", 75, 25, { altKey: true }));
    await harness.controller.handle(eventAt("pointermove", 95, 25, { altKey: true }));

    expect(harness.store.getState().draft).toMatchObject({
      kind: "reference-transform",
      origin: { x: 25, y: 25 },
      preview: {
        id: reference.id,
        transform: { translation: { x: 20, y: 0 } },
      },
    });
    expect(harness.snapshot.project.planReferences[0]).toEqual(reference);
    expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();

    await harness.controller.handle(eventAt("pointerup", 95, 25, {
      altKey: true,
      buttons: 0,
    }));

    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(harness.applyPlanReferencePatch).toHaveBeenCalledOnce();
    expect(harness.applyPlanReferencePatch).toHaveBeenCalledWith(reference, {
      ...reference,
      transform: {
        ...reference.transform,
        translation: { x: 20, y: 0 },
      },
    });
    expect(harness.store.getState()).toMatchObject({
      draft: null,
      gestureActive: false,
    });
  });

  it.each(["Escape", "pointercancel", "blur"] as const)(
    "discards a transient reference translation on %s",
    async (cancelKind) => {
      const base = createPlanEditorTestHarness();
      const reference = planReference(base.snapshot);
      const harness = createSnapshotController(snapshotWithReferences(
        base.snapshot,
        [reference],
        [],
      ));
      harness.store.getState().setSelection([reference.id]);

      await harness.controller.handle(eventAt("pointerdown", 75, 25, { altKey: true }));
      await harness.controller.handle(eventAt("pointermove", 95, 25, { altKey: true }));
      expect(harness.store.getState().draft).toMatchObject({
        kind: "reference-transform",
      });

      if (cancelKind === "Escape") {
        await harness.controller.keyDown("Escape");
      } else if (cancelKind === "pointercancel") {
        await harness.controller.handle(eventAt("pointercancel", 95, 25, {
          altKey: true,
          buttons: 0,
        }));
      } else {
        harness.controller.cancel();
      }

      expect(harness.store.getState()).toMatchObject({
        draft: null,
        gestureActive: false,
      });
      expect(harness.snapshot.project.planReferences[0]).toEqual(reference);
      expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
    },
  );

  it("deletes one unlocked selected reference through an exact record patch", async () => {
    const base = createPlanEditorTestHarness();
    const reference = planReference(base.snapshot);
    const harness = createSnapshotController(snapshotWithReferences(
      base.snapshot,
      [reference],
      [],
    ));
    harness.store.getState().setSelection([reference.id]);

    await harness.controller.keyDown("Delete");

    expect(harness.applyPlanReferencePatch).toHaveBeenCalledOnce();
    expect(harness.applyPlanReferencePatch).toHaveBeenCalledWith(reference, null);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect([...harness.store.getState().selectedIds]).toEqual([]);
  });

  it.each([
    ["reference-locked", true, false],
    ["layer-locked", false, true],
  ] as const)(
    "blocks drag, keyboard movement, and deletion for a selected %s reference",
    async (_kind, referenceLocked, layerLocked) => {
      const base = createPlanEditorTestHarness();
      const layer = {
        ...base.floorA.layers[0]!,
        locked: layerLocked,
      };
      const snapshot = parseSnapshotV3({
        ...base.snapshot,
        assets: assetsForReferences(base.snapshot, [planReference(base.snapshot)]),
        project: {
          ...base.snapshot.project,
          floors: [
            { ...base.floorA, layers: [layer] },
            base.floorB,
          ],
          entities: [],
          planReferences: [planReference(base.snapshot, {
            layerId: layer.id,
            locked: referenceLocked,
          })],
        },
      });
      const reference = snapshot.project.planReferences[0]!;
      const harness = createSnapshotController(snapshot);
      harness.store.getState().setSelection([reference.id]);

      await harness.controller.handle(eventAt("pointerdown", 75, 25, { altKey: true }));
      await harness.controller.handle(eventAt("pointermove", 95, 25, { altKey: true }));
      await harness.controller.handle(eventAt("pointerup", 95, 25, {
        altKey: true,
        buttons: 0,
      }));
      await harness.controller.keyDown("ArrowRight");
      await harness.controller.keyDown("Delete");

      expect([...harness.store.getState().selectedIds]).toEqual([reference.id]);
      expect(harness.store.getState().draft).toBeNull();
      expect(harness.applyPlanReferencePatch).not.toHaveBeenCalled();
      expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    },
  );
  it("replaces selection from an empty-origin drag box without committing", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setSelection(["00000000-0000-4000-8000-000000000099"]);

    await harness.controller.handle(pointerAt("pointerdown", 40, 60));
    await harness.controller.handle(pointerAt("pointermove", 160, -60));
    expect(harness.store.getState().draft).toMatchObject({
      kind: "box-select",
      start: { x: -10, y: -10 },
      current: { x: 110, y: 110 },
    });
    await harness.controller.handle(pointerAt("pointerup", 160, -60, 0));

    expect([...harness.store.getState().selectedIds]).toEqual([harness.fixture.id]);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });

  it("previews selected-object multi-move and commits one plan-engine transform on pointer up", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setSelection([harness.fixture.id]);

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    await harness.controller.handle(pointerAt("pointermove", 60, 50));
    await harness.controller.handle(pointerAt("pointermove", 70, 50));

    expect(harness.store.getState().draft).toMatchObject({
      kind: "transform",
      origin: { x: 0, y: 0 },
      preview: [{
        id: harness.fixture.id,
        transform: { translation: { x: 20, y: 0 } },
      }],
    });
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();

    await harness.controller.handle(pointerAt("pointerup", 70, 50, 0));

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness)).toMatchObject({
      reason: "transform",
      changes: [{
        id: harness.fixture.id,
        before: { transform: { translation: { x: 0, y: 0 } } },
        after: { transform: { translation: { x: 20, y: 0 } } },
      }],
    });
  });

  it("pans by mutating only the transient viewport", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("pan");

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    await harness.controller.handle(pointerAt("pointermove", 70, 60));
    await harness.controller.handle(pointerAt("pointerup", 70, 60, 0));

    expect(harness.store.getState().viewport).toEqual({
      width: 100,
      height: 100,
      center: { x: -20, y: 10 },
      pixelsPerMillimetre: 1,
    });
    expect(harness.store.getState().draft).toBeNull();
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });

  it("zooms around the cursor while mutating only the transient viewport", async () => {
    const harness = createPlanEditorTestHarness();
    const cursor = { x: 75, y: 25 };
    const beforeViewport = harness.store.getState().viewport;
    const beforeWorld = screenToWorld(cursor, beforeViewport);

    await harness.controller.handle(eventAt("wheel", cursor.x, cursor.y, {
      buttons: 0,
      wheelDelta: { x: 0, y: -100 },
    }));

    const afterViewport = harness.store.getState().viewport;
    expect(afterViewport.pixelsPerMillimetre).toBeGreaterThan(beforeViewport.pixelsPerMillimetre);
    expect(screenToWorld(cursor, afterViewport)).toEqual(beforeWorld);
    expect(afterViewport.pixelsPerMillimetre).toBeGreaterThan(0);
    expect(Number.isFinite(afterViewport.pixelsPerMillimetre)).toBe(true);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });

  it("uses enabled snapping to change authored translation delta deterministically", async () => {
    const snapped = createPlanEditorTestHarness();
    snapped.store.getState().setSelection([snapped.fixture.id]);
    await snapped.controller.handle(pointerAt("pointerdown", 50, 50));
    await snapped.controller.handle(pointerAt("pointermove", 147, 50));
    await snapped.controller.handle(pointerAt("pointerup", 147, 50, 0));

    const unsnapped = createPlanEditorTestHarness();
    unsnapped.store.getState().setSelection([unsnapped.fixture.id]);
    unsnapped.store.getState().setSnapModes([]);
    await unsnapped.controller.handle(pointerAt("pointerdown", 50, 50));
    await unsnapped.controller.handle(pointerAt("pointermove", 147, 50));
    await unsnapped.controller.handle(pointerAt("pointerup", 147, 50, 0));

    expect(snapped.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(unsnapped.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(snapped)).toMatchObject({
      reason: "transform",
      changes: [{ after: { transform: { translation: { x: 100, y: 0 } } } }],
    });
    expect(firstIntent(unsnapped)).toMatchObject({
      reason: "transform",
      changes: [{ after: { transform: { translation: { x: 97, y: 0 } } } }],
    });
  });

  it("copies transiently and pastes fresh IDs at the default offset in one intent", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setSelection([harness.fixture.id]);

    harness.controller.copy();
    expect(harness.store.getState().clipboard).toEqual([harness.fixture]);
    expect(harness.store.getState().clipboard[0]).not.toBe(harness.fixture);
    await harness.controller.paste();

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness)).toMatchObject({
      reason: "duplicate",
      changes: [{
        id: "00000000-0000-4000-8000-000000000020",
        before: null,
        after: {
          id: "00000000-0000-4000-8000-000000000020",
          type: "fixture",
          transform: { translation: { x: 100, y: -100 } },
          size: { width: 100, height: 100 },
        },
      }],
    });
    expect(firstIntent(harness).changes[0]!.id).not.toBe(harness.fixture.id);
  });

  it("cancels Escape, pointercancel, and lost-focus drafts without committing", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("boundary");

    await click(harness.controller, 50, 50);
    expect(harness.store.getState().draft).not.toBeNull();
    await harness.controller.keyDown("Escape");
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });

    harness.store.getState().setActiveTool("fixture");
    await harness.controller.handle(pointerAt("pointerdown", 250, 50));
    await harness.controller.handle(pointerAt("pointermove", 350, -50));
    expect(harness.store.getState().draft).not.toBeNull();
    await harness.controller.handle(pointerAt("pointercancel", 350, -50, 0));
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });

    harness.store.getState().setActiveTool("boundary");
    await click(harness.controller, 250, 50);
    expect(harness.store.getState().draft).not.toBeNull();
    harness.controller.cancel();
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });

  it("deletes a valid selected active-floor entity in one intent", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setSelection([harness.fixture.id]);

    await harness.controller.keyDown("Delete");

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness)).toEqual({
      reason: "delete",
      changes: [{
        id: harness.fixture.id,
        before: harness.fixture,
        after: null,
      }],
    });
    expect([...harness.store.getState().selectedIds]).toEqual([]);
  });

  it.each(["entity-locked", "hidden-layer", "locked-layer"] as const)(
    "keeps mixed selection atomic when Delete includes an ineligible %s entity",
    async (kind) => {
      const base = createPlanEditorTestHarness();
      const restrictedLayer = {
        ...base.floorA.layers[0]!,
        id: "00000000-0000-4000-8000-000000000006",
        name: "Restricted",
        visible: kind !== "hidden-layer",
        locked: kind === "locked-layer",
      };
      const ineligible = {
        ...base.fixture,
        id: "00000000-0000-4000-8000-000000000011",
        name: "Ineligible Fixture",
        layerId: kind === "entity-locked"
          ? base.fixture.layerId
          : restrictedLayer.id,
        locked: kind === "entity-locked",
        transform: {
          ...base.fixture.transform,
          translation: { x: 400, y: 0 },
        },
      };
      const snapshot = parseSnapshotV3({
        ...base.snapshot,
        project: {
          ...base.snapshot.project,
          floors: base.snapshot.project.floors.map((floor) => (
            floor.id === base.floorA.id
              ? { ...floor, layers: [...floor.layers, restrictedLayer] }
              : floor
          )),
          entities: [base.fixture, ineligible],
        },
      });
      const harness = createSnapshotController(snapshot);
      const selection = [base.fixture.id, ineligible.id];
      harness.store.getState().setSelection(selection);

      await harness.controller.keyDown("Delete");

      expect(harness.applyPlanEdit).not.toHaveBeenCalled();
      expect([...harness.store.getState().selectedIds]).toEqual(selection);
      expect(harness.errors).toEqual([]);
    },
  );

  it("clears rejected durable previews, preserves selection, and reports once", async () => {
    const harness = createPlanEditorTestHarness();
    const rejection = new Error("persistence rejected");
    harness.applyPlanEdit.mockRejectedValueOnce(rejection);
    harness.store.getState().setSelection([harness.fixture.id]);

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    await harness.controller.handle(pointerAt("pointermove", 70, 50));
    await harness.controller.handle(pointerAt("pointerup", 70, 50, 0));

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(firstIntent(harness)).toMatchObject({
      reason: "transform",
      changes: [{ after: { transform: { translation: { x: 20, y: 0 } } } }],
    });
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
    expect([...harness.store.getState().selectedIds]).toEqual([harness.fixture.id]);
    expect(harness.errors).toEqual([rejection]);
  });

  it("atomically consumes a deferred commit and blocks public mutations until it settles", async () => {
    const harness = createPlanEditorTestHarness();
    let resolveCommit!: () => void;
    const pendingCommit = new Promise<undefined>((resolve) => {
      resolveCommit = () => resolve(undefined);
    });
    harness.applyPlanEdit.mockImplementationOnce(async () => pendingCommit);
    harness.store.getState().setSelection([harness.fixture.id]);
    harness.store.getState().setActiveTool("wall");

    await click(harness.controller, 250, 50);
    await harness.controller.handle(pointerAt("pointerdown", 350, 50));
    const completion = harness.controller.handle(pointerAt("pointerup", 350, 50, 0));
    await Promise.resolve();

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });

    const viewportBefore = harness.store.getState().viewport;
    harness.store.getState().setActiveTool("poi");
    await harness.controller.handle(pointerAt("pointerdown", 450, 50));
    await harness.controller.handle(pointerAt("pointerup", 350, 50, 0));
    await harness.controller.keyDown("Enter");
    await harness.controller.keyDown("Delete");
    harness.controller.copy();
    await harness.controller.paste();
    harness.controller.cancel();
    await harness.controller.handle(eventAt("wheel", 75, 25, {
      buttons: 0,
      wheelDelta: { x: 0, y: -100 },
    }));

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(harness.store.getState().draft).toBeNull();
    expect(harness.store.getState().clipboard).toEqual([]);
    expect(harness.store.getState().viewport).toEqual(viewportBefore);

    resolveCommit();
    await completion;

    await click(harness.controller, 450, 50);
    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(2);
    expect(harness.applyPlanEdit.mock.calls[1]![0]).toMatchObject({
      reason: "create",
      changes: [{ after: { type: "poi", transform: { translation: { x: 400, y: 0 } } } }],
    });
  });

  it("invalidates a polygon gesture before keyDown after an external tool switch", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("boundary");
    await click(harness.controller, 250, 50);
    await click(harness.controller, 350, 50);
    await click(harness.controller, 350, -50);

    harness.store.getState().setActiveTool("select");
    await harness.controller.keyDown("Enter");

    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(harness.store.getState()).toMatchObject({
      activeTool: "select",
      draft: null,
      gestureActive: false,
    });
  });

  it("marks pan active so floor switches reject, then clears it on completion", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("pan");

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    expect(harness.store.getState().gestureActive).toBe(true);
    expect(harness.store.getState().setActiveFloor(harness.floorB.id)).toBe(false);

    await harness.controller.handle(pointerAt("pointerup", 50, 50, 0));
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
  });

  it("keeps dimension offset hover transient until the third click confirms placement", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("dimension");

    await click(harness.controller, 50, 50);
    await harness.controller.handle(pointerAt("pointerdown", 250, 50));
    await harness.controller.handle(pointerAt("pointermove", 250, -50, 0));
    await harness.controller.handle(pointerAt("pointerup", 250, 50, 0));

    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(harness.store.getState().draft).toMatchObject({
      kind: "create",
      tool: "dimension",
      preview: [{ type: "dimension", offset: 100 }],
    });

    await harness.controller.handle(pointerAt("pointerdown", 250, -50));
    await harness.controller.handle(pointerAt("pointerup", 250, -50, 0));

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(harness.applyPlanEdit.mock.calls[0]![0]).toMatchObject({
      reason: "create",
      changes: [{ after: { type: "dimension", offset: 100 } }],
    });
  });

  it("excludes locked-layer entities from edits while retaining them as snap targets", async () => {
    const base = createPlanEditorTestHarness();
    const lockedLayer = { ...base.floorA.layers[0]!, locked: true };
    const editableLayer = {
      id: "00000000-0000-4000-8000-000000000006",
      name: "Editable",
      tags: [],
      visible: true,
      locked: false,
    };
    const lockedFixture = { ...base.fixture, layerId: lockedLayer.id };
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: {
        ...base.snapshot.project,
        floors: [
          { ...base.floorA, layers: [lockedLayer, editableLayer] },
          base.floorB,
        ],
        entities: [lockedFixture],
      },
    });
    const harness = createSnapshotController(snapshot);

    await click(harness.controller, 100, 0);
    expect([...harness.store.getState().selectedIds]).toEqual([]);

    await harness.controller.handle(pointerAt("pointerdown", 40, 60));
    await harness.controller.handle(pointerAt("pointermove", 160, -60));
    await harness.controller.handle(pointerAt("pointerup", 160, -60, 0));
    expect([...harness.store.getState().selectedIds]).toEqual([]);

    harness.store.getState().setSelection([lockedFixture.id]);
    harness.controller.copy();
    expect(harness.store.getState().clipboard).toEqual([]);
    harness.store.getState().setClipboard([lockedFixture]);
    await harness.controller.paste();
    await harness.controller.keyDown("Delete");
    await harness.controller.handle(pointerAt("pointerdown", 100, 0));
    await harness.controller.handle(pointerAt("pointermove", 120, 0));
    await harness.controller.handle(pointerAt("pointerup", 120, 0, 0));
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();

    harness.store.getState().setSelection([]);
    harness.store.getState().setClipboard([]);
    harness.store.getState().setActiveTool("poi");
    await click(harness.controller, 147, 50);

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(harness.applyPlanEdit.mock.calls[0]![0]).toMatchObject({
      reason: "create",
      changes: [{
        after: {
          type: "poi",
          layerId: editableLayer.id,
          transform: { translation: { x: 100, y: 0 } },
        },
      }],
    });
  });

  it("ignores non-primary pointer-down for authoring tools", async () => {
    const harness = createPlanEditorTestHarness();

    for (const tool of ["boundary", "select", "pan"] as const) {
      harness.store.getState().setActiveTool(tool);
      await harness.controller.handle(eventAt("pointerdown", 50, 50, { buttons: 2 }));
      expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
    }
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });

  it("owns pan by pointer and cancels when primary buttons are lost", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("pan");
    const initialViewport = harness.store.getState().viewport;

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    await harness.controller.handle(eventAt("pointermove", 80, 80, {
      pointerId: 2,
      buttons: 1,
    }));
    await harness.controller.handle(eventAt("pointerup", 80, 80, {
      pointerId: 2,
      buttons: 0,
    }));
    await harness.controller.handle(eventAt("pointercancel", 80, 80, {
      pointerId: 2,
      buttons: 0,
    }));
    expect(harness.store.getState().viewport).toEqual(initialViewport);
    expect(harness.store.getState().gestureActive).toBe(true);

    await harness.controller.handle(pointerAt("pointermove", 80, 80, 0));
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
    expect(harness.store.getState().viewport).toEqual(initialViewport);

    await harness.controller.handle(pointerAt("pointerdown", 50, 50));
    await harness.controller.handle(pointerAt("pointermove", 70, 60));
    await harness.controller.handle(pointerAt("pointerup", 70, 60, 0));
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
    expect(harness.store.getState().viewport.center).toEqual({ x: -20, y: 10 });
  });

  it("ignores foreign point hover, pointer-up, and pointer cancellation", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setActiveTool("boundary");
    await click(harness.controller, 50, 50);

    await harness.controller.handle(pointerAt("pointermove", 150, -50, 0));
    expect(harness.store.getState().gestureActive).toBe(true);
    const draftAfterOwnedHover = harness.store.getState().draft;

    await harness.controller.handle(eventAt("pointermove", 150, -50, {
      pointerId: 2,
      buttons: 0,
    }));
    await harness.controller.handle(eventAt("pointerup", 150, -50, {
      pointerId: 2,
      buttons: 0,
    }));
    await harness.controller.handle(eventAt("pointercancel", 150, -50, {
      pointerId: 2,
      buttons: 0,
    }));

    expect(harness.store.getState().draft).toEqual(draftAfterOwnedHover);
    expect(harness.store.getState().gestureActive).toBe(true);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
  });

  it("does not translate a selected entity when raw pointer down and up are identical near a snap", async () => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setSelection([harness.fixture.id]);

    await harness.controller.handle(pointerAt("pointerdown", 147, 50));
    await harness.controller.handle(pointerAt("pointerup", 147, 50, 0));

    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect([...harness.store.getState().selectedIds]).toEqual([harness.fixture.id]);
    expect(harness.store.getState()).toMatchObject({ draft: null, gestureActive: false });
  });

  it("authors an entity-origin dimension anchor when the origin is not a geometry vertex", async () => {
    const base = createPlanEditorTestHarness();
    const boundary: SpatialEntity = {
      type: "boundary",
      id: "00000000-0000-4000-8000-000000000011",
      name: "Centred Boundary",
      tags: [],
      floorId: base.floorA.id,
      layerId: base.floorA.layers[0]!.id,
      locked: false,
      transform: {
        translation: { x: 300, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      polygon: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 0, y: 50 }],
    };
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: {
        ...base.snapshot.project,
        entities: [base.fixture, boundary],
      },
    });
    const harness = createSnapshotController(snapshot);
    harness.store.getState().setActiveTool("dimension");

    await click(harness.controller, 350, 50);
    await click(harness.controller, 450, 50);
    await click(harness.controller, 450, -50);

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(harness.applyPlanEdit.mock.calls[0]![0]).toMatchObject({
      reason: "create",
      changes: [{
        after: {
          type: "dimension",
          start: { kind: "entity", entityId: boundary.id, locator: "origin" },
        },
      }],
    });
  });

  it("contains keyDown snapshot and validation errors with one report and preserved selection", async () => {
    const base = createPlanEditorTestHarness();
    const snapshotFailure = new Error("snapshot unavailable");
    let throwOnRead = false;
    const throwing = createSnapshotController(base.snapshot, {
      getSnapshot: () => {
        if (throwOnRead) throw snapshotFailure;
        return base.snapshot;
      },
    });
    throwing.store.getState().setSelection([base.fixture.id]);
    throwing.store.getState().setActiveTool("boundary");
    await click(throwing.controller, 250, 50);
    await click(throwing.controller, 350, 50);
    await click(throwing.controller, 350, -50);
    throwOnRead = true;

    await expect(throwing.controller.keyDown("Enter")).resolves.toBeUndefined();
    expect(throwing.applyPlanEdit).not.toHaveBeenCalled();
    expect(throwing.errors).toEqual([snapshotFailure]);
    expect([...throwing.store.getState().selectedIds]).toEqual([base.fixture.id]);
    expect(throwing.store.getState()).toMatchObject({ draft: null, gestureActive: false });

    const invalid = createSnapshotController(base.snapshot, {
      makeId: () => "not-a-canonical-uuid",
    });
    invalid.store.getState().setSelection([base.fixture.id]);
    invalid.store.getState().setActiveTool("boundary");
    await click(invalid.controller, 250, 50);
    await click(invalid.controller, 350, 50);
    await click(invalid.controller, 350, -50);
    await expect(invalid.controller.keyDown("Enter")).resolves.toBeUndefined();

    expect(invalid.applyPlanEdit).not.toHaveBeenCalled();
    expect(invalid.errors).toEqual([expect.any(Error)]);
    expect((invalid.errors[0] as Error).message).toMatch(/uuid/i);
    expect([...invalid.store.getState().selectedIds]).toEqual([base.fixture.id]);
    expect(invalid.store.getState()).toMatchObject({ draft: null, gestureActive: false });
  });

  it("preserves an externally changed selection when a deferred delete succeeds", async () => {
    const base = createPlanEditorTestHarness();
    const other = {
      ...base.fixture,
      id: "00000000-0000-4000-8000-000000000012",
      name: "Other Fixture",
      transform: {
        ...base.fixture.transform,
        translation: { x: 400, y: 0 },
      },
    };
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: {
        ...base.snapshot.project,
        entities: [base.fixture, other],
      },
    });
    const harness = createSnapshotController(snapshot);
    let resolveCommit!: () => void;
    const pendingCommit = new Promise<undefined>((resolve) => {
      resolveCommit = () => resolve(undefined);
    });
    harness.applyPlanEdit.mockImplementationOnce(async () => pendingCommit);
    harness.store.getState().setSelection([base.fixture.id]);

    const completion = harness.controller.keyDown("Delete");
    await Promise.resolve();
    expect(harness.applyPlanEdit).toHaveBeenCalledWith({
      reason: "delete",
      changes: [{
        id: base.fixture.id,
        before: base.fixture,
        after: null,
      }],
    });

    harness.store.getState().setSelection([other.id]);
    resolveCommit();
    await completion;

    expect([...harness.store.getState().selectedIds]).toEqual([other.id]);
    expect(harness.errors).toEqual([]);
  });

  it("preserves an externally changed selection when a deferred delete fails", async () => {
    const base = createPlanEditorTestHarness();
    const other = {
      ...base.fixture,
      id: "00000000-0000-4000-8000-000000000012",
      name: "Other Fixture",
      transform: {
        ...base.fixture.transform,
        translation: { x: 400, y: 0 },
      },
    };
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: {
        ...base.snapshot.project,
        entities: [base.fixture, other],
      },
    });
    const harness = createSnapshotController(snapshot);
    const rejection = new Error("delete rejected");
    let rejectCommit!: (error: Error) => void;
    const pendingCommit = new Promise<undefined>((_resolve, reject) => {
      rejectCommit = (error) => reject(error);
    });
    harness.applyPlanEdit.mockImplementationOnce(async () => pendingCommit);
    harness.store.getState().setSelection([base.fixture.id]);

    const completion = harness.controller.keyDown("Delete");
    await Promise.resolve();
    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);

    harness.store.getState().setSelection([other.id]);
    rejectCommit(rejection);
    await completion;

    expect([...harness.store.getState().selectedIds]).toEqual([other.id]);
    expect(harness.errors).toEqual([rejection]);
  });

  it("uses the exact snap candidate coordinate for a dimension entity origin anchor", async () => {
    const base = createPlanEditorTestHarness();
    const preciseFixture = {
      ...base.fixture,
      transform: {
        ...base.fixture.transform,
        translation: { x: 1e-20, y: 0 },
      },
    };
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: {
        ...base.snapshot.project,
        entities: [preciseFixture],
      },
    });
    const harness = createSnapshotController(snapshot);
    harness.store.getState().setActiveTool("dimension");

    await click(harness.controller, 51, 50);
    expect(harness.store.getState().draft).toMatchObject({
      kind: "create",
      tool: "dimension",
      points: [{ x: 1e-20, y: 0 }],
    });

    await click(harness.controller, 250, 50);
    await click(harness.controller, 250, -50);

    expect(harness.applyPlanEdit).toHaveBeenCalledTimes(1);
    expect(harness.applyPlanEdit.mock.calls[0]![0]).toMatchObject({
      reason: "create",
      changes: [{
        after: {
          type: "dimension",
          start: {
            kind: "entity",
            entityId: preciseFixture.id,
            locator: "origin",
          },
          end: { kind: "point", point: { x: 200, y: 0 } },
          offset: 100,
        },
      }],
    });
  });
});

describe("InteractionController keyboard grid movement", () => {
  it.each([
    ["ArrowLeft", { x: -100, y: 0 }],
    ["ArrowRight", { x: 100, y: 0 }],
    ["ArrowUp", { x: 0, y: 100 }],
    ["ArrowDown", { x: 0, y: -100 }],
  ] as const)("moves one exact grid step for %s", async (key, delta) => {
    const harness = createPlanEditorTestHarness();
    harness.store.getState().setSelection([harness.fixture.id]);
    await harness.controller.keyDown(key);
    expect(harness.applyPlanEdit).toHaveBeenCalledOnce();
    expect(harness.applyPlanEdit).toHaveBeenCalledWith({
      reason: "transform",
      changes: [{
        id: harness.fixture.id,
        before: harness.fixture,
        after: {
          ...harness.fixture,
          transform: {
            ...harness.fixture.transform,
            translation: {
              x: harness.fixture.transform.translation.x + delta.x,
              y: harness.fixture.transform.translation.y + delta.y,
            },
          },
        },
      }],
    });
  });

  it.each(["entity-locked", "hidden-layer", "locked-layer"] as const)(
    "does not move an ineligible %s selection",
    async (kind) => {
      const base = createPlanEditorTestHarness();
      const layer = base.floorA.layers[0]!;
      const snapshot = parseSnapshotV3({
        ...base.snapshot,
        project: {
          ...base.snapshot.project,
          floors: base.snapshot.project.floors.map((floor) => (
            floor.id !== base.floorA.id ? floor : {
              ...floor,
              layers: floor.layers.map((candidate) => (
                candidate.id !== layer.id ? candidate : {
                  ...candidate,
                  visible: kind === "hidden-layer" ? false : candidate.visible,
                  locked: kind === "locked-layer" ? true : candidate.locked,
                }
              )),
            }
          )),
          entities: base.snapshot.project.entities.map((entity) => (
            entity.id === base.fixture.id && kind === "entity-locked"
              ? { ...entity, locked: true }
              : entity
          )),
        },
      });
      const harness = createSnapshotController(snapshot);
      harness.store.getState().setSelection([base.fixture.id]);
      await harness.controller.keyDown("ArrowRight");
      expect(harness.applyPlanEdit).not.toHaveBeenCalled();
      expect(harness.errors).toEqual([]);
    },
  );
});
function openingWall(
  snapshot: ProjectSnapshot,
  id: string,
  options: {
    readonly floorId?: string;
    readonly layerId?: string;
    readonly locked?: boolean;
    readonly y?: number;
    readonly startX?: number;
    readonly endX?: number;
  } = {},
): Wall {
  const floor = snapshot.project.floors[0]!;
  return {
    type: "wall",
    id,
    name: `Wall ${id.slice(-2)}`,
    tags: [],
    floorId: options.floorId ?? floor.id,
    layerId: options.layerId ?? floor.layers[0]!.id,
    locked: options.locked ?? false,
    transform: {
      translation: { x: 0, y: options.y ?? 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    centerLine: [
      { x: options.startX ?? -2_000, y: 0 },
      { x: options.endX ?? 2_000, y: 0 },
    ],
    thickness: 100,
  };
}

function snapshotForOpeningCreation(
  base: ProjectSnapshot,
  walls: readonly Wall[],
  overrides: Partial<ProjectSnapshot["project"]> = {},
): ProjectSnapshot {
  return parseSnapshotV3({
    ...base,
    project: {
      ...base.project,
      profile: "showroom",
      entities: walls,
      openings: [],
      ...overrides,
    },
  });
}

describe("InteractionController Task 8 opening creation", () => {
  it("filters ineligible walls and deterministically previews the lowest tied wall id", async () => {
    const base = createPlanEditorTestHarness();
    const editableLayer = base.floorA.layers[0]!;
    const hiddenLayer = {
      id: "00000000-0000-4000-8000-000000000040",
      name: "Hidden",
      tags: [],
      visible: false,
      locked: false,
    };
    const lockedLayer = {
      id: "00000000-0000-4000-8000-000000000041",
      name: "Locked",
      tags: [],
      visible: true,
      locked: true,
    };
    const floorA = {
      ...base.floorA,
      layers: [editableLayer, hiddenLayer, lockedLayer],
    };
    const eligibleLow = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
      { y: -54 },
    );
    const eligibleHigh = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000031",
      { y: 54 },
    );
    const snapshot = snapshotForOpeningCreation(base.snapshot, [
      eligibleHigh,
      openingWall(base.snapshot, "00000000-0000-4000-8000-000000000020", {
        layerId: hiddenLayer.id,
      }),
      openingWall(base.snapshot, "00000000-0000-4000-8000-000000000021", {
        layerId: lockedLayer.id,
      }),
      openingWall(base.snapshot, "00000000-0000-4000-8000-000000000022", {
        locked: true,
      }),
      openingWall(base.snapshot, "00000000-0000-4000-8000-000000000023", {
        floorId: base.floorB.id,
        layerId: base.floorB.layers[0]!.id,
      }),
      eligibleLow,
    ], { floors: [floorA, base.floorB] });
    const makeId = vi.fn(() => "00000000-0000-4000-8000-000000000100");
    const harness = createSnapshotController(snapshot, { makeId });
    harness.store.getState().setViewport({
      ...harness.store.getState().viewport,
      pixelsPerMillimetre: 2,
    });
    harness.store.getState().setActiveTool("door");

    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));

    expect(harness.store.getState().openingPreview).toMatchObject({
      sessionId: harness.store.getState().sessionId,
      tool: "door",
      width: 900,
      height: 2_100,
      sillHeight: 0,
      candidate: {
        wallId: eligibleLow.id,
        distanceAlongWall: 2_000,
        valid: true,
      },
    });
    expect(makeId).not.toHaveBeenCalled();
  });

  it("converts the shared eight-pixel tolerance to world units", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
      { y: 54 },
    );
    const snapshot = snapshotForOpeningCreation(base.snapshot, [wall]);
    const harness = createSnapshotController(snapshot);
    harness.store.getState().setViewport({
      ...harness.store.getState().viewport,
      pixelsPerMillimetre: 2,
    });
    harness.store.getState().setActiveTool("door");

    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));
    expect(harness.store.getState().openingPreview?.candidate.wallId).toBe(wall.id);

    await harness.controller.handle(eventAt("pointermove", 50, 51, { buttons: 0 }));
    expect(harness.store.getState().openingPreview).toBeNull();
  });

  it("retains an invalid default-span preview without allocating or persisting", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
      { startX: -499.5, endX: 499.5 },
    );
    const snapshot = snapshotForOpeningCreation(base.snapshot, [wall]);
    const makeId = vi.fn(() => "00000000-0000-4000-8000-000000000100");
    const applySnapshotRecordPatches = vi.fn(async (
      patches: readonly AnySnapshotRecordsPatch[],
    ) => { void patches; });
    const harness = createSnapshotController(snapshot, {
      makeId,
      applySnapshotRecordPatches,
    });
    harness.store.getState().setActiveTool("door");

    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));
    expect(harness.store.getState().openingPreview).toMatchObject({
      candidate: {
        wallId: wall.id,
        valid: false,
        issue: { code: "OPENING_ENDPOINT_CLEARANCE" },
      },
    });

    await click(harness.controller, 50, 50);
    expect(makeId).not.toHaveBeenCalled();
    expect(applySnapshotRecordPatches).not.toHaveBeenCalled();
    expect(harness.store.getState().activeTool).toBe("door");
    expect(harness.store.getState().openingPreview?.candidate.valid).toBe(false);

    await harness.controller.keyDown("Escape");
    expect(harness.store.getState().activeTool).toBe("select");
    expect(harness.store.getState().openingPreview).toBeNull();
  });

  it("persists one opening record per click, selects it, and keeps the tool for repetition", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    let current = snapshotForOpeningCreation(base.snapshot, [wall]);
    const ids = [
      "00000000-0000-4000-8000-000000000100",
      "00000000-0000-4000-8000-000000000101",
    ];
    const makeId = vi.fn(() => ids.shift()!);
    const applySnapshotRecordPatches = vi.fn(async (
      patches: readonly AnySnapshotRecordsPatch[],
    ) => {
      const patch = patches[0];
      const created = patch?.collection === "openings"
        ? patch.changes[0]?.after as Opening | null | undefined
        : undefined;
      if (created === undefined || created === null) {
        throw new Error("Expected one created opening patch.");
      }
      current = parseSnapshotV3({
        ...current,
        sequence: current.sequence + 1,
        project: {
          ...current.project,
          openings: [...current.project.openings, created],
        },
      });
    });
    const harness = createSnapshotController(current, {
      getSnapshot: () => current,
      makeId,
      applySnapshotRecordPatches,
    });
    harness.store.getState().setActiveTool("door");

    await harness.controller.handle(eventAt("pointermove", -550, 50, { buttons: 0 }));
    expect(makeId).not.toHaveBeenCalled();
    await click(harness.controller, -550, 50);

    expect(applySnapshotRecordPatches).toHaveBeenCalledTimes(1);
    expect(applySnapshotRecordPatches).toHaveBeenLastCalledWith([{
      collection: "openings",
      changes: [{
        id: "00000000-0000-4000-8000-000000000100",
        before: null,
        after: {
          id: "00000000-0000-4000-8000-000000000100",
          name: "Door",
          tags: [],
          wallId: wall.id,
          kind: "door",
          distanceAlongWall: 1_400,
          width: 900,
          height: 2_100,
          sillHeight: 0,
        },
      }],
    }]);
    expect([...harness.store.getState().selectedIds]).toEqual([
      "00000000-0000-4000-8000-000000000100",
    ]);
    expect(harness.store.getState().activeTool).toBe("door");
    expect(harness.store.getState().openingPreview).toBeNull();

    await harness.controller.handle(eventAt("pointermove", 650, 50, { buttons: 0 }));
    await click(harness.controller, 650, 50);

    expect(applySnapshotRecordPatches).toHaveBeenCalledTimes(2);
    expect(makeId).toHaveBeenCalledTimes(2);
    expect([...harness.store.getState().selectedIds]).toEqual([
      "00000000-0000-4000-8000-000000000101",
    ]);
    expect(harness.store.getState().activeTool).toBe("door");
  });

  it("retains tool, selection, preview, and persistence error after a rejected patch", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const snapshot = snapshotForOpeningCreation(base.snapshot, [wall]);
    const rejection = new Error("checkpoint unavailable");
    const applySnapshotRecordPatches = vi.fn(async () => {
      throw rejection;
    });
    const harness = createSnapshotController(snapshot, { applySnapshotRecordPatches });
    harness.store.getState().setActiveTool("window");
    harness.store.getState().setSelection([base.fixture.id]);

    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));
    await click(harness.controller, 50, 50);

    expect(harness.store.getState().activeTool).toBe("window");
    expect([...harness.store.getState().selectedIds]).toEqual([base.fixture.id]);
    expect(harness.store.getState().openingPreview).toMatchObject({
      tool: "window",
      width: 1_200,
      height: 1_200,
      sillHeight: 900,
      persistenceError: "checkpoint unavailable",
      candidate: { wallId: wall.id, valid: true },
    });
    expect(harness.errors).toEqual([rejection]);
  });

  it("ignores a late completion after session replacement and clears previews on cancel", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const snapshot = snapshotForOpeningCreation(base.snapshot, [wall]);
    let resolvePatch!: () => void;
    const applySnapshotRecordPatches = vi.fn(() => new Promise<void>((resolve) => {
      resolvePatch = resolve;
    }));
    const harness = createSnapshotController(snapshot, { applySnapshotRecordPatches });
    harness.store.getState().setActiveTool("door");
    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));
    harness.controller.cancel();
    expect(harness.store.getState().openingPreview).toBeNull();

    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));
    await harness.controller.handle(eventAt("pointerdown", 50, 50));
    const completion = harness.controller.handle(eventAt("pointerup", 50, 50, { buttons: 0 }));
    expect(applySnapshotRecordPatches).toHaveBeenCalledOnce();

    harness.store.getState().replaceSession("replacement-session", base.floorA.id);
    resolvePatch();
    await completion;

    expect(harness.store.getState()).toMatchObject({
      sessionId: "replacement-session",
      activeTool: "select",
      openingPreview: null,
    });
    expect([...harness.store.getState().selectedIds]).toEqual([]);
    expect(harness.errors).toEqual([]);
  });

  it("does not preview or persist showroom openings for a Market snapshot", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const snapshot = parseSnapshotV3({
      ...base.snapshot,
      project: {
        ...base.snapshot.project,
        profile: "market",
        entities: [wall],
      },
    });
    const makeId = vi.fn(() => "00000000-0000-4000-8000-000000000100");
    const applySnapshotRecordPatches = vi.fn(async () => undefined);
    const harness = createSnapshotController(snapshot, {
      makeId,
      applySnapshotRecordPatches,
    });
    harness.store.getState().setActiveTool("door");

    await harness.controller.handle(eventAt("pointermove", 50, 50, { buttons: 0 }));
    await click(harness.controller, 50, 50);

    expect(harness.store.getState().openingPreview).toBeNull();
    expect(makeId).not.toHaveBeenCalled();
    expect(applySnapshotRecordPatches).not.toHaveBeenCalled();
  });
});
function openingOn(
  wall: Wall,
  overrides: Partial<Opening> = {},
): Opening {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    name: "Main door",
    tags: [],
    wallId: wall.id,
    kind: "door",
    distanceAlongWall: 2_000,
    width: 900,
    height: 2_100,
    sillHeight: 0,
    ...overrides,
  };
}

function snapshotWithOpenings(
  base: ProjectSnapshot,
  walls: readonly Wall[],
  openings: readonly Opening[],
): ProjectSnapshot {
  return parseSnapshotV3({
    ...base,
    project: {
      ...base.project,
      profile: "showroom",
      entities: walls,
      openings,
    },
  });
}

describe("InteractionController Task 9 opening selection and mutation", () => {
  it("hits an opening before its supporting wall and commits an along-wall-only drag", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const opening = openingOn(wall);
    let current = snapshotWithOpenings(base.snapshot, [wall], [opening]);
    const applySnapshotRecordPatches = vi.fn(async (
      patches: readonly AnySnapshotRecordsPatch[],
    ) => {
      const patch = patches[0];
      const after = patch?.collection === "openings"
        ? patch.changes[0]?.after as Opening | null | undefined
        : undefined;
      if (after === undefined || after === null) {
        throw new Error("Expected an opening update.");
      }
      current = snapshotWithOpenings(base.snapshot, [wall], [after]);
    });
    const harness = createSnapshotController(current, {
      getSnapshot: () => current,
      applySnapshotRecordPatches,
    });

    await harness.controller.handle(eventAt("pointerdown", 50, 50));

    expect([...harness.store.getState().selectedIds]).toEqual([opening.id]);
    expect(harness.store.getState().draft).toMatchObject({
      kind: "opening-transform",
      preview: opening,
    });

    await harness.controller.handle(eventAt("pointermove", 350, 50));
    expect(harness.store.getState().draft).toMatchObject({
      kind: "opening-transform",
      preview: {
        ...opening,
        wallId: wall.id,
        distanceAlongWall: 2_300,
      },
    });

    await harness.controller.handle(eventAt("pointerup", 350, 50, { buttons: 0 }));

    expect(applySnapshotRecordPatches).toHaveBeenCalledOnce();
    expect(applySnapshotRecordPatches).toHaveBeenCalledWith([{
      collection: "openings",
      changes: [{
        id: opening.id,
        before: opening,
        after: {
          ...opening,
          distanceAlongWall: 2_300,
        },
      }],
    }]);
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect([...harness.store.getState().selectedIds]).toEqual([opening.id]);
    expect(harness.store.getState().draft).toBeNull();
  });

  it("previews but rejects an invalid along-wall drag with the affected opening id", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const opening = openingOn(wall);
    const snapshot = snapshotWithOpenings(base.snapshot, [wall], [opening]);
    const harness = createSnapshotController(snapshot);

    await harness.controller.handle(eventAt("pointerdown", 50, 50));
    await harness.controller.handle(eventAt("pointermove", 1_750, 50));

    expect(harness.store.getState().draft).toMatchObject({
      kind: "opening-transform",
      preview: {
        ...opening,
        wallId: wall.id,
        distanceAlongWall: 3_700,
      },
      issue: {
        code: "OPENING_ENDPOINT_CLEARANCE",
        openingId: opening.id,
      },
    });

    await harness.controller.handle(eventAt("pointerup", 1_750, 50, { buttons: 0 }));

    expect(harness.applySnapshotRecordPatches).not.toHaveBeenCalled();
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(harness.errors).toHaveLength(1);
    expect(String(harness.errors[0])).toContain("OPENING_ENDPOINT_CLEARANCE");
    expect(String(harness.errors[0])).toContain(opening.id);
    expect([...harness.store.getState().selectedIds]).toEqual([opening.id]);
  });

  it("deletes an opening through one record patch and clears only its shared selection", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const opening = openingOn(wall);
    const snapshot = snapshotWithOpenings(base.snapshot, [wall], [opening]);
    const harness = createSnapshotController(snapshot);
    harness.store.getState().setSelection([opening.id]);

    await harness.controller.keyDown("Delete");

    expect(harness.applySnapshotRecordPatches).toHaveBeenCalledOnce();
    expect(harness.applySnapshotRecordPatches).toHaveBeenCalledWith([{
      collection: "openings",
      changes: [{ id: opening.id, before: opening, after: null }],
    }]);
    expect(harness.applyBuildingStructurePatch).not.toHaveBeenCalled();
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect([...harness.store.getState().selectedIds]).toEqual([]);
  });

  it("deletes a wall and every attached opening through one building structure patch", async () => {
    const base = createPlanEditorTestHarness();
    const wall = openingWall(
      base.snapshot,
      "00000000-0000-4000-8000-000000000030",
    );
    const attachedA = openingOn(wall);
    const attachedB = openingOn(wall, {
      id: "00000000-0000-4000-8000-000000000101",
      name: "Side window",
      kind: "window",
      distanceAlongWall: 3_200,
      width: 800,
      height: 1_200,
      sillHeight: 900,
    });
    const snapshot = snapshotWithOpenings(
      base.snapshot,
      [wall],
      [attachedA, attachedB],
    );
    const harness = createSnapshotController(snapshot);
    harness.store.getState().setSelection([wall.id]);

    await harness.controller.keyDown("Delete");

    expect(harness.applyBuildingStructurePatch).toHaveBeenCalledOnce();
    expect(harness.applyBuildingStructurePatch).toHaveBeenCalledWith({
      reason: "delete",
      wallChanges: [{ id: wall.id, before: wall, after: null }],
      openingChanges: [
        { id: attachedA.id, before: attachedA, after: null },
        { id: attachedB.id, before: attachedB, after: null },
      ],
    });
    expect(harness.applySnapshotRecordPatches).not.toHaveBeenCalled();
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect([...harness.store.getState().selectedIds]).toEqual([]);
  });
});
