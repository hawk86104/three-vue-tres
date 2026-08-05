// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  type Fixture,
  type MaterialAssignment,
  type MaterialDefinition,
} from "@aethertwin/core-model";
import {
  ProjectStore,
  SandboxProjectBackend,
  type AssetImportProgress,
} from "@aethertwin/project-store";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanEditorStore } from "./editor-session";
import type { PlanAssetPicker, PlanAssetSource } from "./asset-picker";
import { PlanEditor } from "./plan-editor";

vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void {}
  },
}));

class TestResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const FIXTURE_ID = "00000000-0000-4000-8000-000000000301";
const FIXTURE_B_ID = "00000000-0000-4000-8000-000000000302";
const MATERIAL_ID = "00000000-0000-4000-8000-000000000303";
const ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000304";
const ASSIGNMENT_B_ID = "00000000-0000-4000-8000-000000000305";
const NEW_MATERIAL_ID = "00000000-0000-4000-8000-000000000306";
const NEW_ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000307";

const stores: ProjectStore[] = [];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

afterEach(async () => {
  cleanup();
  await Promise.allSettled(stores.splice(0).map((store) => store.dispose()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function project() {
  const store = new ProjectStore(
    new SandboxProjectBackend(),
    { autosaveDelayMs: 60_000 },
  );
  stores.push(store);
  await store.create({
    name: "Material integration",
    location: "sandbox",
    profile: "showroom",
  });
  const snapshot = store.getState().snapshot!;
  const floor = snapshot.project.floors[0]!;
  const fixture = (
    id: string,
    name: string,
    x: number,
  ): Fixture => ({
    type: "fixture",
    id,
    name,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    locked: false,
    transform: {
      translation: { x, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    kind: "generic",
    size: { width: 1000, height: 500 },
  });
  const fixtureA = fixture(FIXTURE_ID, "Display A", 0);
  const fixtureB = fixture(FIXTURE_B_ID, "Display B", 1500);
  await store.applyPlanEdit({
    reason: "create",
    changes: [
      { id: fixtureA.id, before: null, after: fixtureA },
      { id: fixtureB.id, before: null, after: fixtureB },
    ],
  });
  return { store, floor, fixtureA, fixtureB };
}

function material(): MaterialDefinition {
  return {
    id: MATERIAL_ID,
    name: "Shared material",
    tags: [],
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 1,
    assetId: null,
  };
}

function assigned(id: string, targetId: string): MaterialAssignment {
  return {
    id,
    name: "Shared assignment",
    tags: [],
    materialId: MATERIAL_ID,
    targetKind: "fixture",
    targetId,
  };
}

async function openSelectedFixture(
  store: ProjectStore,
  floorId: string,
  makeId: () => string,
  assetPicker: PlanAssetPicker | null = null,
) {
  const sessionStore = createPlanEditorStore({ activeFloorId: floorId });
  render(
    <PlanEditor
      store={store}
      backendMode="sandbox"
      dependencies={{ sessionStore, makeId, assetPicker }}
    />,
  );
  act(() => sessionStore.getState().setSelection([FIXTURE_ID]));
  const section = await screen.findByRole("group", { name: "材质" });
  const user = userEvent.setup();
  await user.click(within(section).getByText("材质"));
  return { section, sessionStore, user };
}

describe("PlanEditor material integration", () => {
  it("creates and clears an assignment atomically and preserves undo/redo", async () => {
    const { store, floor } = await project();
    const ids = [NEW_MATERIAL_ID, NEW_ASSIGNMENT_ID];
    const { section, user } = await openSelectedFixture(
      store,
      floor.id,
      () => ids.shift()!,
    );

    await user.selectOptions(
      within(section).getByRole("combobox", { name: "材质分配" }),
      "__new__",
    );
    await waitFor(() => expect(store.getState().snapshot?.project).toMatchObject({
      materials: [expect.objectContaining({ id: NEW_MATERIAL_ID })],
      materialAssignments: [
        expect.objectContaining({
          id: NEW_ASSIGNMENT_ID,
          materialId: NEW_MATERIAL_ID,
          targetId: FIXTURE_ID,
        }),
      ],
    }));

    await act(async () => store.undo());
    expect(store.getState().snapshot?.project.materials).toEqual([]);
    expect(store.getState().snapshot?.project.materialAssignments).toEqual([]);

    await act(async () => store.redo());
    expect(store.getState().snapshot?.project.materials).toHaveLength(1);
    expect(store.getState().snapshot?.project.materialAssignments).toHaveLength(1);

    await user.selectOptions(
      within(section).getByRole("combobox", { name: "材质分配" }),
      "__default__",
    );
    await waitFor(() => expect(
      store.getState().snapshot?.project.materialAssignments,
    ).toEqual([]));
    expect(store.getState().snapshot?.project.materials).toHaveLength(1);

    await act(async () => store.undo());
    expect(store.getState().snapshot?.project.materialAssignments).toHaveLength(1);
  });

  it("edits a shared definition once and keeps both assignments", async () => {
    const { store, floor, fixtureA, fixtureB } = await project();
    const shared = material();
    await store.applySnapshotRecordPatches([
      {
        collection: "materials",
        changes: [{ id: shared.id, before: null, after: shared }],
      },
      {
        collection: "materialAssignments",
        changes: [
          {
            id: ASSIGNMENT_ID,
            before: null,
            after: assigned(ASSIGNMENT_ID, fixtureA.id),
          },
          {
            id: ASSIGNMENT_B_ID,
            before: null,
            after: assigned(ASSIGNMENT_B_ID, fixtureB.id),
          },
        ],
      },
    ]);
    const { section, user } = await openSelectedFixture(
      store,
      floor.id,
      () => NEW_MATERIAL_ID,
    );
    expect(within(section).getByText("此材质影响 2 个对象")).toBeVisible();

    await user.clear(within(section).getByLabelText("基础颜色"));
    await user.type(within(section).getByLabelText("基础颜色"), "#112233");
    await user.click(within(section).getByRole("button", { name: "应用材质" }));

    await waitFor(() => expect(
      store.getState().snapshot?.project.materials[0]?.baseColor,
    ).toBe("#112233"));
    expect(store.getState().snapshot?.project.materialAssignments).toHaveLength(2);
    await act(async () => store.undo());
    expect(store.getState().snapshot?.project.materials[0]?.baseColor)
      .toBe("#78909c");
  });

  it("uses the one shared progress/cancel owner and rejects a stale selection", async () => {
    const { store, floor, fixtureA } = await project();
    const shared = material();
    await store.applySnapshotRecordPatches([
      {
        collection: "materials",
        changes: [{ id: shared.id, before: null, after: shared }],
      },
      {
        collection: "materialAssignments",
        changes: [{
          id: ASSIGNMENT_ID,
          before: null,
          after: assigned(ASSIGNMENT_ID, fixtureA.id),
        }],
      },
    ]);
    const source: PlanAssetSource = {
      kind: "sandbox-blob",
      blob: new File(["texture"], "texture.png", { type: "image/png" }),
      displayName: "texture.png",
    };
    let resolveSecondPick!: (value: PlanAssetSource | null) => void;
    const secondPick = new Promise<PlanAssetSource | null>((resolve) => {
      resolveSecondPick = resolve;
    });
    const picker: PlanAssetPicker = {
      pick: vi.fn()
        .mockResolvedValueOnce(source)
        .mockReturnValueOnce(secondPick),
    };
    let rejectImport!: (error: unknown) => void;
    const pendingImport = new Promise<MaterialDefinition>((_resolve, reject) => {
      rejectImport = reject;
    });
    const importTexture = vi.spyOn(store, "importMaterialTexture")
      .mockImplementation(async (_request, _before, onProgress) => {
        const progress: AssetImportProgress = {
          operationId: "00000000-0000-4000-8000-000000000308",
          stage: "validate",
          completedBytes: 2,
          totalBytes: 7,
        };
        onProgress?.(progress);
        return pendingImport;
      });
    const cancel = vi.spyOn(store, "cancelAssetImport")
      .mockImplementation(async () => {
        rejectImport(Object.assign(new Error("cancelled"), {
          code: "ASSET_IMPORT_CANCELLED",
        }));
      });
    const ids = [
      "00000000-0000-4000-8000-000000000308",
      "00000000-0000-4000-8000-000000000309",
    ];
    const { section, sessionStore, user } = await openSelectedFixture(
      store,
      floor.id,
      () => ids.shift()!,
      picker,
    );

    const importButton = within(section).getByRole("button", { name: "导入纹理" });
    await user.click(importButton);
    await waitFor(() => expect(importTexture).toHaveBeenCalledOnce());
    expect(picker.pick).toHaveBeenCalledWith("material-texture");
    expect(screen.getByRole("progressbar", { name: "导入进度" })).toHaveValue(2);

    await user.click(screen.getByRole("button", { name: "取消导入" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    await waitFor(() => expect(
      screen.queryByRole("progressbar", { name: "导入进度" }),
    ).not.toBeInTheDocument());

    const snapshotBeforeStalePick = store.getState().snapshot;
    sessionStore.getState().setSelection([FIXTURE_ID]);
    const reopened = await screen.findByRole("group", { name: "材质" });
    await user.click(within(reopened).getByText("材质"));
    await user.click(within(reopened).getByRole("button", { name: "导入纹理" }));
    act(() => sessionStore.getState().setSelection([]));
    await act(async () => {
      resolveSecondPick(source);
      await secondPick;
      await Promise.resolve();
    });
    expect(picker.pick).toHaveBeenCalledTimes(2);
    expect(importTexture).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot).toBe(snapshotBeforeStalePick);
  });
});
