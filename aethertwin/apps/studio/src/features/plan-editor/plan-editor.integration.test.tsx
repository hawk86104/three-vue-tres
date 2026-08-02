// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { Blob as NodeBlob } from "node:buffer";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  identityTransform2D,
  type AssetRecord,
  type Fixture,
  type Opening,
  type PlanReference,
  type SpaceUnit,
  type Wall,
} from "@aethertwin/core-model";
import { SHOWROOM_FIXTURE_CATALOGUE } from "@aethertwin/mode-showroom";
import { ProjectStore, SandboxProjectBackend } from "@aethertwin/project-store";
import { createPlanEditorStore } from "./editor-session";
import { PlanCanvas } from "./plan-canvas";
import { PlanEditor } from "./plan-editor";
import {
  FakePlanRenderer,
  pointerAt,
  renderPlanEditorFixture,
} from "./plan-editor.test-support";

vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void {}
  },
}));

describe("PlanEditor M1 integration", () => {
  it("opens directly into one active floor and keeps tree, Canvas, and Inspector selection exact", async () => {
    const user = userEvent.setup();
    const renderer = new FakePlanRenderer();
    const {
      floorA,
      floorB,
      fixture,
      sessionStore,
      projectStore,
    } = renderPlanEditorFixture({ renderer });

    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();
    expect(screen.getByRole("tree", { name: "楼层和空间" })).toBeVisible();
    expect(screen.getByRole("region", { name: "二维平面画布" })).toBeVisible();
    await waitFor(() => expect(renderer.updateInputs.length).toBeGreaterThan(0));
    expect(renderer.updateInputs.at(-1)?.activeFloorId).toBe(floorA.id);

    const canvas = screen.getByRole("region", { name: "二维平面画布" });
    expect(
      within(canvas).getByRole("button", { name: `选择对象：${fixture.name}` }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: `选择楼层：${floorB.name}` }));
    await waitFor(() => {
      expect(renderer.updateInputs.at(-1)?.activeFloorId).toBe(floorB.id);
    });
    expect(
      within(canvas).queryByRole("button", { name: `选择对象：${fixture.name}` }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `选择楼层：${floorA.name}` }));
    await user.click(
      within(screen.getByRole("tree", { name: "楼层和空间" }))
        .getByRole("button", { name: `选择对象：${fixture.name}` }),
    );
    expect([...sessionStore.getState().selectedIds]).toEqual([fixture.id]);
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent("对象");
    expect(
      within(canvas).getByRole("button", { name: `选择对象：${fixture.name}` }),
    ).toHaveAttribute("aria-pressed", "true");

    act(() => sessionStore.getState().setSelection([]));
    await act(async () => {
      renderer.emit(pointerAt("pointerdown", 50, 50));
      renderer.emit(pointerAt("pointerup", 50, 50));
    });
    await waitFor(() => {
      expect([...sessionStore.getState().selectedIds]).toEqual([fixture.id]);
    });
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent("对象");

    const x = screen.getByLabelText("对象 X (mm)");
    await user.clear(x);
    await user.type(x, "1.25m");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    await waitFor(() => {
      const current = projectStore.getState().snapshot!.project.entities.find(
        (entity) => entity.id === fixture.id,
      );
      expect(current?.transform.translation.x).toBe(1250);
    });
    expect(document.querySelector('[data-save-state="dirty"]')).toBeVisible();

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(document.querySelector('[data-save-state="saved"]')).toBeVisible();
    });

    for (const deferred of ["3D", "路线", "导入", "导出"]) {
      expect(screen.queryByRole("button", { name: new RegExp(deferred, "i") }))
        .not.toBeInTheDocument();
    }
  });
});
const task14Stores: ProjectStore[] = [];

function installObjectUrlSupport(): void {
  vi.stubGlobal("Blob", NodeBlob);
  const NativeUrl = URL;
  let nextUrl = 1;
  class TestUrl extends NativeUrl {
    static createObjectURL(): string {
      return `blob:aethertwin-task14-${nextUrl++}`;
    }

    static revokeObjectURL(): void {}
  }
  vi.stubGlobal("URL", TestUrl);
}

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

function jpegBytes(width: number, height: number): Uint8Array {
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8];
  bytes.push((height >>> 8) & 0xff, height & 0xff);
  bytes.push((width >>> 8) & 0xff, width & 0xff);
  bytes.push(3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9);
  return Uint8Array.from(bytes);
}

function sandboxAssetRequest(
  bytes: Uint8Array,
  operationId: string,
  displayName: string,
) {
  const owned = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return {
    operationId,
    role: "plan-reference" as const,
    source: {
      kind: "sandbox-blob" as const,
      blob: new Blob([owned], { type: "application/octet-stream" }),
      displayName,
    },
  };
}


afterEach(async () => {
  cleanup();
  const settlements = await Promise.allSettled(
    task14Stores.splice(0).map((store) => store.dispose()),
  );
  for (const settlement of settlements) {
    expect(settlement.status).toBe("fulfilled");
  }
  vi.unstubAllGlobals();
});

describe("PlanEditor M2.1 vertical integration", () => {
  it("drives PNG, JPEG, and SVG import, placement, calibration, lock, save, and reopen through PlanEditor", async () => {
    installObjectUrlSupport();
    const user = userEvent.setup();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    task14Stores.push(store);
    await store.create({ name: "M2.1 vertical", location: "sandbox", profile: "showroom" });
    const projectPath = store.getState().projectPath!;
    const variants = [
      {
        bytes: pngBytes(100, 50),
        displayName: "floor.png",
        mediaType: "image/png",
        extension: "png",
      },
      {
        bytes: jpegBytes(80, 40),
        displayName: "floor.jpg",
        mediaType: "image/jpeg",
        extension: "jpg",
      },
      {
        bytes: new TextEncoder().encode(
          '<svg width="16px" height="8px"><rect width="16" height="8"/></svg>',
        ),
        displayName: "floor.svg",
        mediaType: "image/svg+xml",
        extension: "svg",
      },
    ] as const;
    const sources = variants.map((variant, index) => sandboxAssetRequest(
      variant.bytes,
      `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      variant.displayName,
    ).source);
    let nextSource = 0;
    const assetPicker = {
      pick: vi.fn(async () => sources[nextSource++] ?? null),
    };
    const sessionStore = createPlanEditorStore({
      activeFloorId: store.getState().snapshot!.project.floors[0]!.id,
    });
    const view = render(
      <PlanEditor
        store={store}
        backendMode="sandbox"
        dependencies={{
          sessionStore,
          assetPicker,
          workspace: () => <div />,
        }}
      />,
    );
    const buildingTools = screen.getByRole("group", { name: "\u5efa\u7b51" });
    const importFloorPlan = within(buildingTools).getByRole("button", {
      name: "\u5bfc\u5165\u5e73\u9762\u56fe",
    });

    for (const [index, variant] of variants.entries()) {
      await user.click(importFloorPlan);
      await waitFor(() => expect(store.getState().snapshot!.assets).toHaveLength(index + 1));
      const snapshot = store.getState().snapshot!;
      const asset = snapshot.assets[index]!;
      const reference = snapshot.project.planReferences[index]!;
      expect(asset.mediaType).toBe(variant.mediaType);
      expect(asset.relativePath).toBe(
        `assets/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256}.${variant.extension}`,
      );
      expect(reference.assetId).toBe(asset.id);

      if (index === 0) {
        await user.click(screen.getByRole("button", { name: "\u64a4\u9500" }));
        await waitFor(() => expect(store.getState().snapshot!.assets).toEqual([]));
        expect(store.getState().snapshot!.project.planReferences).toEqual([]);
        await user.click(screen.getByRole("button", { name: "\u91cd\u505a" }));
        await waitFor(() => expect(store.getState().snapshot!.assets).toHaveLength(1));
        expect(store.getState().snapshot!.project.planReferences).toHaveLength(1);
      }
    }
    expect(assetPicker.pick).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole("tab", { name: "\u9879\u76ee\u6811" }));
    const imported = store.getState().snapshot!.project.planReferences[0]!;
    const referenceRow = await waitFor(() => {
      const row = document.querySelector(`[data-reference-id="${imported.id}"]`);
      expect(row).toBeInstanceOf(HTMLElement);
      return row as HTMLElement;
    });
    await user.click(referenceRow);
    const inspector = screen.getByRole("complementary", { name: "\u68c0\u67e5\u5668" });
    fireEvent.change(within(inspector).getByLabelText("X (mm)"), {
      target: { value: "1250" },
    });
    fireEvent.change(within(inspector).getByLabelText("Y (mm)"), {
      target: { value: "750" },
    });
    await user.click(within(inspector).getByRole("button", {
      name: "\u5e94\u7528\u5e73\u9762\u53c2\u8003",
    }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.planReferences[0]!.transform.translation,
    ).toEqual({ x: 1250, y: 750 }));

    const calibrate = within(buildingTools).getByRole("button", { name: "\u6821\u51c6" });
    await user.click(calibrate);
    for (const [label, value] of [
      ["\u6821\u51c6\u70b9 A X (px)", "0"],
      ["\u6821\u51c6\u70b9 A Y (px)", "0"],
      ["\u6821\u51c6\u70b9 B X (px)", "10"],
      ["\u6821\u51c6\u70b9 B Y (px)", "0"],
      ["\u5b9e\u6d4b\u8ddd\u79bb", "2m"],
    ] as const) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
    await user.click(screen.getByRole("button", { name: "\u9884\u89c8\u6821\u51c6" }));
    expect(sessionStore.getState().calibrationDraft?.preview).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "\u786e\u8ba4\u6821\u51c6" }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.planReferences[0]!.transform.scale,
    ).toEqual({ x: 200, y: 200 }));

    await user.click(within(inspector).getByRole("checkbox", {
      name: "\u9501\u5b9a\u5e73\u9762\u53c2\u8003",
    }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.planReferences[0]!.locked,
    ).toBe(true));
    const calibrated = structuredClone(
      store.getState().snapshot!.project.planReferences[0]!,
    );
    expect(calibrated.calibration).toEqual({
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 10, y: 0 },
      measuredDistanceMm: 2000,
    });

    await user.click(screen.getByRole("button", { name: "\u64a4\u9500" }));
    await waitFor(() => expect(store.getState().snapshot!.project.planReferences[0]!.locked).toBe(false));
    await user.click(screen.getByRole("button", { name: "\u91cd\u505a" }));
    await waitFor(() => expect(store.getState().snapshot!.project.planReferences[0]).toEqual(calibrated));
    await user.click(screen.getByRole("button", { name: "\u4fdd\u5b58" }));
    await waitFor(() => expect(store.getState().saveState).toBe("saved"));
    const beforeClose = structuredClone(store.getState().snapshot!);
    expect(beforeClose.checkpointSequence).toBe(beforeClose.sequence);
    await user.click(screen.getByRole("button", { name: "\u5173\u95ed" }));
    await waitFor(() => expect(store.getState().projectPath).toBeNull());
    view.unmount();
    await store.open(projectPath);
    expect(store.getState().snapshot).toEqual(beforeClose);

    const resolved = await store.resolveAsset(calibrated.assetId);
    expect(resolved).toMatchObject({
      assetId: calibrated.assetId,
      mediaType: "image/png",
    });
    expect(resolved.url).toMatch(/^blob:/);

    const reopenedRenderer = new FakePlanRenderer();
    const reopenedSession = createPlanEditorStore({ activeFloorId: calibrated.floorId });
    render(
      <PlanEditor
        store={store}
        backendMode="sandbox"
        dependencies={{
          sessionStore: reopenedSession,
          assetPicker: null,
          workspace: ({ snapshot, activeFloorId, sessionStore: editorStore, controller }) => (
            <PlanCanvas
              store={store}
              assetSourceEpoch={store.getAssetSourceEpoch()}
              snapshot={snapshot}
              activeFloorId={activeFloorId}
              sessionStore={editorStore}
              controller={controller}
              rendererFactory={() => reopenedRenderer}
              onError={vi.fn()}
            />
          ),
        }}
      />,
    );
    await waitFor(() => expect(reopenedRenderer.updateInputs.length).toBeGreaterThan(0));
    expect(
      reopenedRenderer.updateInputs.at(-1)!.snapshot.project.planReferences.find(
        ({ id }) => id === calibrated.id,
      ),
    ).toEqual(calibrated);
  });

  it("keeps structural editing available when bytes are missing and repairs the reference by reimport", async () => {
    installObjectUrlSupport();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    task14Stores.push(store);
    await store.create({ name: "M2.1 repair", location: "sandbox", profile: "showroom" });
    const floor = store.getState().snapshot!.project.floors[0]!;
    const digest = "a".repeat(64);
    const missingAsset: AssetRecord = {
      id: "73000000-0000-4000-8000-000000000001",
      sha256: digest,
      relativePath: `assets/sha256/aa/${digest}.png`,
      mediaType: "image/png",
      size: 45,
    };
    const missingReference: PlanReference = {
      id: "74000000-0000-4000-8000-000000000001",
      name: "Missing floor",
      tags: ["repair"],
      floorId: floor.id,
      layerId: floor.layers[0]!.id,
      assetId: missingAsset.id,
      intrinsicSize: { width: 100, height: 50 },
      transform: {
        translation: { x: 500, y: 700 },
        rotation: 0,
        scale: { x: 200, y: 200 },
      },
      opacity: 0.65,
      locked: false,
      calibration: {
        sourcePointA: { x: 0, y: 0 },
        sourcePointB: { x: 10, y: 0 },
        measuredDistanceMm: 2000,
      },
    };
    await store.applySnapshotRecordPatches([
      {
        collection: "assets",
        changes: [{ id: missingAsset.id, before: null, after: missingAsset }],
      },
      {
        collection: "planReferences",
        changes: [{ id: missingReference.id, before: null, after: missingReference }],
      },
    ]);

    await expect(store.resolveAsset(missingAsset.id)).rejects.toMatchObject({
      code: "ASSET_MISSING",
    });
    expect(store.getState().assetIssues).toEqual([
      { assetId: missingAsset.id, code: "ASSET_MISSING" },
    ]);

    const repaired = await store.replaceBrokenPlanReference(
      missingReference.id,
      sandboxAssetRequest(
        pngBytes(120, 60),
        "75000000-0000-4000-8000-000000000001",
        "replacement.png",
      ),
    );
    expect(repaired).toMatchObject({
      id: missingReference.id,
      transform: missingReference.transform,
      calibration: null,
    });
    expect(repaired.assetId).not.toBe(missingAsset.id);
    expect(store.getState().snapshot!.assets).toContainEqual(missingAsset);
    expect(store.getState().assetIssues).toEqual([]);
    await expect(store.resolveAsset(repaired.assetId)).resolves.toMatchObject({
      assetId: repaired.assetId,
      mediaType: "image/png",
    });
  });
});

describe("PlanEditor M2.2 vertical integration", () => {
  it("renders the complete reopened building while selecting a legacy fixture remains read-only", async () => {
    const backend = new SandboxProjectBackend();
    const commit = vi.spyOn(backend, "commit");
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    task14Stores.push(store);
    await store.create({ name: "M2.2 Studio acceptance", location: "sandbox", profile: "showroom" });
    const snapshot = store.getState().snapshot!;
    const floor = snapshot.project.floors[0]!;
    const layer = floor.layers[0]!;
    const wall: Wall = {
      type: "wall",
      id: "00000000-0000-4000-8000-000000000400",
      name: "Studio entrance wall",
      tags: [],
      floorId: floor.id,
      layerId: layer.id,
      transform: identityTransform2D,
      spatial3D: { elevation: 0, height: 2_800 },
      locked: false,
      centerLine: [{ x: 0, y: 0 }, { x: 10_000, y: 0 }],
      thickness: 120,
    };
    const openings: Opening[] = [
      {
        id: "00000000-0000-4000-8000-000000000401",
        name: "Studio door",
        tags: [],
        wallId: wall.id,
        kind: "door",
        distanceAlongWall: 2_000,
        width: 900,
        height: 2_100,
        sillHeight: 0,
      },
      {
        id: "00000000-0000-4000-8000-000000000402",
        name: "Studio window",
        tags: [],
        wallId: wall.id,
        kind: "window",
        distanceAlongWall: 6_000,
        width: 1_200,
        height: 1_200,
        sillHeight: 900,
      },
    ];
    await store.applyBuildingStructurePatch({
      reason: "create",
      wallChanges: [{ id: wall.id, before: null, after: wall }],
      openingChanges: openings.map((opening) => ({
        id: opening.id,
        before: null,
        after: opening,
      })),
    });

    const rooms: SpaceUnit[] = Array.from({ length: 4 }, (_, index) => {
      const x = index * 2_000;
      return {
        type: "space-unit",
        kind: "room",
        id: `00000000-0000-4000-8000-${String(410 + index).padStart(12, "0")}`,
        name: `Studio confirmed room ${index + 1}`,
        tags: ["confirmed"],
        floorId: floor.id,
        layerId: layer.id,
        transform: identityTransform2D,
        locked: false,
        footprint: [
          { x, y: 1_000 },
          { x: x + 1_500, y: 1_000 },
          { x: x + 1_500, y: 2_500 },
          { x, y: 2_500 },
        ],
      };
    });
    const catalogueFixtures = SHOWROOM_FIXTURE_CATALOGUE.map(
      (descriptor, index): Fixture => ({
        type: "fixture",
        kind: descriptor.kind,
        id: `00000000-0000-4000-8000-${String(420 + index).padStart(12, "0")}`,
        name: `Studio catalogue ${descriptor.kind}`,
        tags: [],
        floorId: floor.id,
        layerId: layer.id,
        transform: {
          ...identityTransform2D,
          translation: { x: index * 1_000, y: 3_000 },
        },
        spatial3D: { elevation: 0, height: descriptor.defaultSize.height },
        locked: false,
        size: {
          width: descriptor.defaultSize.width,
          height: descriptor.defaultSize.depth,
        },
      }),
    );
    const legacyFixture: Fixture = {
      type: "fixture",
      kind: "display-case",
      id: "00000000-0000-4000-8000-000000000427",
      name: "Studio legacy fixture",
      tags: ["legacy"],
      floorId: floor.id,
      layerId: layer.id,
      transform: {
        ...identityTransform2D,
        translation: { x: 8_000, y: 3_000 },
      },
      locked: false,
      size: { width: 1_200, height: 600 },
    };
    await store.applyPlanEdit({
      reason: "create",
      changes: [...rooms, ...catalogueFixtures, legacyFixture].map((entity) => ({
        id: entity.id,
        before: null,
        after: entity,
      })),
    });
    const projectPath = store.getState().projectPath!;
    await store.save();
    await store.close();
    await store.open(projectPath);

    const reopened = store.getState().snapshot!;
    expect(reopened.project.entities.filter(({ type }) => type === "space-unit"))
      .toHaveLength(4);
    expect(reopened.project.entities.filter(({ type }) => type === "fixture"))
      .toHaveLength(8);
    expect(reopened.project.openings.map(({ kind }) => kind)).toEqual(["door", "window"]);
    expect(reopened.project.entities.find(({ id }) => id === legacyFixture.id))
      .not.toHaveProperty("spatial3D");

    const commitCount = commit.mock.calls.length;
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    render(
      <PlanEditor
        store={store}
        backendMode="sandbox"
        dependencies={{ sessionStore, assetPicker: null }}
      />,
    );
    for (const entity of [...rooms, ...catalogueFixtures, legacyFixture]) {
      expect(document.querySelector(`[data-entity-id="${entity.id}"]`))
        .toBeInstanceOf(HTMLElement);
    }
    for (const opening of openings) {
      expect(screen.getByTestId(`accessible-opening-${opening.id}`)).toBeVisible();
    }

    const user = userEvent.setup();
    await user.click(document.querySelector(
      `[data-entity-id="${legacyFixture.id}"]`,
    ) as HTMLElement);
    expect([...sessionStore.getState().selectedIds]).toEqual([legacyFixture.id]);
    expect(store.getState().snapshot!.project.entities.find(({ id }) => id === legacyFixture.id))
      .toEqual(legacyFixture);
    expect(commit.mock.calls).toHaveLength(commitCount);

    await user.click(screen.getByRole("button", { name: "\u5c55\u5177\u76ee\u5f55" }));
    const catalogue = screen.getByRole("region", { name: "\u5c55\u5177\u76ee\u5f55" });
    expect(within(catalogue).getAllByRole("button")).toHaveLength(7);
    expect(within(catalogue).queryByText(/generic|\u901a\u7528/i)).not.toBeInTheDocument();
  });
});
