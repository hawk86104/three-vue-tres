// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  parseSnapshotV3,
  type Fixture,
  type PlanReference,
  type ProductContent,
} from "@aethertwin/core-model";
import { ProjectStore, SandboxProjectBackend } from "@aethertwin/project-store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useI18n } from "../../i18n/locale-provider";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { ProjectBackendError } from "../../backend/project-backend-error";
import { formatMessageDescriptor } from "../../i18n/format-message";
import { localizedErrorDescriptor } from "../../i18n/localized-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanEditorStore } from "./editor-session";
import {
  createDesktopPlanAssetPicker,
  createSandboxPlanAssetPicker,
  type PlanAssetPicker,
} from "./asset-picker";
import { PlanEditor } from "./plan-editor";

type AssetImportSource = Parameters<ProjectStore["importPlanReference"]>[0]["source"];

const { openPlanDialog } = vi.hoisted(() => ({ openPlanDialog: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openPlanDialog }));
vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void {}
  },
}));

class AssetLibraryResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const OPERATION_ID = "00000000-0000-4000-8000-000000000101";
const REFERENCE_ID = "00000000-0000-4000-8000-000000000102";
const REPLACEMENT_OPERATION_ID = "00000000-0000-4000-8000-000000000103";
const ASSET_ID = "00000000-0000-4000-8000-000000000104";
const PRODUCT_FIXTURE_ID = "00000000-0000-4000-8000-000000000201";
const PRODUCT_CONTENT_ID = "00000000-0000-4000-8000-000000000202";
const PRODUCT_MEDIA_ID = "00000000-0000-4000-8000-000000000203";
const PRIVATE_SOURCE_PATH = "E:\\private\\plans\\sensitive-floor.png";
const stores: ProjectStore[] = [];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", AssetLibraryResizeObserver);
  openPlanDialog.mockReset();
});

afterEach(async () => {
  cleanup();
  await Promise.allSettled(stores.splice(0).map((store) => store.dispose()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pngBlob(): Blob {
  return new Blob([new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ])], { type: "image/png" });
}

function sandboxSource(name = "north-floor.png"): AssetImportSource {
  return { kind: "sandbox-blob", blob: pngBlob(), displayName: name };
}

async function sandboxSvgSource(
  name: string,
  width: number,
): Promise<Extract<AssetImportSource, { readonly kind: "sandbox-blob" }>> {
  const { Blob: NativeBlob } = await import("node:buffer");
  const blob = new NativeBlob([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1"></svg>`,
  ], { type: "image/svg+xml" }) as unknown as Blob;
  return {
    kind: "sandbox-blob",
    blob,
    displayName: name,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function createProject() {
  const backend = new SandboxProjectBackend();
  const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
  stores.push(store);
  await store.create({ name: "Task 11", location: "sandbox", profile: "showroom" });
  return { backend, store };
}

async function addProductTarget(store: ProjectStore) {
  const floor = store.getState().snapshot!.project.floors[0]!;
  const fixture: Fixture = {
    id: PRODUCT_FIXTURE_ID,
    name: "North display",
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    locked: false,
    type: "fixture",
    kind: "display-table",
    size: { width: 1_200, height: 600 },
  };
  const content: ProductContent = {
    id: PRODUCT_CONTENT_ID,
    name: "North product",
    tags: [],
    targetEntityId: fixture.id,
    description: "",
    mediaAssetIds: [],
  };
  await store.applySnapshotRecordPatches([
    {
      collection: "entities",
      changes: [{ id: fixture.id, before: null, after: fixture }],
    },
    {
      collection: "productContents",
      changes: [{ id: content.id, before: null, after: content }],
    },
  ]);
  return { fixture, content };
}

function referenceResult(store: ProjectStore, referenceId = REFERENCE_ID): PlanReference {
  const snapshot = store.getState().snapshot!;
  const floor = snapshot.project.floors[0]!;
  return {
    id: referenceId,
    name: "north-floor",
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    assetId: ASSET_ID,
    intrinsicSize: { width: 1, height: 1 },
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    opacity: 1,
    locked: false,
    calibration: null,
  };
}

function renderImportEditor(
  store: ProjectStore,
  options: {
    readonly backendMode?: "desktop" | "sandbox";
    readonly picker?: PlanAssetPicker | null;
    readonly ids?: readonly string[];
    readonly enableLocaleSwitch?: boolean;
  } = {},
) {
  const snapshot = store.getState().snapshot!;
  const sessionStore = createPlanEditorStore({
    activeFloorId: snapshot.project.floors[0]!.id,
  });
  const ids = [...(options.ids ?? [OPERATION_ID, REFERENCE_ID])];
  const makeId = vi.fn(() => ids.shift() ?? crypto.randomUUID());
  const dependencies = {
    sessionStore,
    makeId,
    ...(Object.hasOwn(options, "picker") ? { assetPicker: options.picker } : {}),
  };
  function LocaleSwitch() {
    const { setLocale } = useI18n();
    return options.enableLocaleSwitch ? (
      <button type="button" onClick={() => setLocale("en")}>Switch locale</button>
    ) : null;
  }
  const result = render(
    <StudioI18nTestProvider>
      <LocaleSwitch />
      <PlanEditor
        store={store}
        backendMode={options.backendMode ?? "sandbox"}
        dependencies={dependencies}
      />
    </StudioI18nTestProvider>,
  );
  return { ...result, sessionStore, makeId };
}

function toolbarImportButton(): HTMLButtonElement {
  return within(screen.getByRole("group", { name: "\u5efa\u7b51" })).getByRole("button", {
    name: "\u5bfc\u5165\u5e73\u9762\u56fe",
  });
}

describe("Task 11 plan asset picker", () => {
  it("allows only one picker request while the first selection is pending", async () => {
    const { store } = await createProject();
    const selection = deferred<AssetImportSource | null>();
    const pick = vi.fn(() => selection.promise);
    const importPlanReference = vi.spyOn(store, "importPlanReference");
    const { makeId } = renderImportEditor(store, { picker: { pick } });
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);
    expect(importButton).toBeDisabled();
    await user.click(importButton);

    expect(pick).toHaveBeenCalledOnce();
    expect(makeId).not.toHaveBeenCalled();
    expect(importPlanReference).not.toHaveBeenCalled();

    await act(async () => selection.resolve(null));
    expect(importButton).toHaveFocus();
    await waitFor(() => expect(importButton).toBeEnabled());
  });

  it("uses the desktop dialog PNG/JPEG/SVG filters and treats cancellation as a focused no-op", async () => {
    const { store } = await createProject();
    const importPlanReference = vi.spyOn(store, "importPlanReference");
    openPlanDialog.mockResolvedValueOnce(null);
    const { makeId } = renderImportEditor(store, { backendMode: "desktop" });
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);

    await waitFor(() => expect(openPlanDialog).toHaveBeenCalledOnce());
    expect(openPlanDialog).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
      filters: [{
        name: "\u5e73\u9762\u56fe",
        extensions: ["png", "jpg", "jpeg", "svg"],
      }],
    });
    expect(importPlanReference).not.toHaveBeenCalled();
    expect(makeId).not.toHaveBeenCalled();
    expect(importButton).toHaveFocus();
    expect(document.body).not.toHaveTextContent(PRIVATE_SOURCE_PATH);
  });

  it("redacts native paths from picker failures while preserving a safe log reference", async () => {
    const { store } = await createProject();
    const failure = Object.assign(
      new Error(`Could not open ${PRIVATE_SOURCE_PATH}`),
      { logRef: "picker-safe-ref" },
    );
    const picker = { pick: vi.fn(async () => { throw failure; }) };
    const { makeId } = renderImportEditor(store, { picker });
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("\u5e73\u9762\u56fe\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002");
    expect(alert).toHaveTextContent("picker-safe-ref");
    expect(alert).not.toHaveTextContent(PRIVATE_SOURCE_PATH);
    expect(makeId).not.toHaveBeenCalled();
    expect(importButton).toHaveFocus();
  });
  it("owns a hidden sandbox file input and imports the selected Blob exactly once", async () => {
    const { backend, store } = await createProject();
    const completion = deferred<void>();
    vi.spyOn(backend, "importAsset").mockImplementation(async (
      _projectPath,
      request,
      onProgress,
    ) => {
      onProgress({
        operationId: request.operationId,
        stage: "validate",
        completedBytes: 0,
        totalBytes: 24,
      });
      await completion.promise;
      return {
        asset: {
          id: ASSET_ID,
          sha256: "0".repeat(64),
          relativePath: `assets/sha256/00/${"0".repeat(64)}.png`,
          mediaType: "image/png",
          size: 24,
        },
        facts: { kind: "image", width: 1, height: 1 },
      };
    });
    const importPlanReference = vi.spyOn(store, "importPlanReference");
    const { sessionStore } = renderImportEditor(store);
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("accept", ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml");
    expect(input).not.toHaveAttribute("multiple");
    expect(input).toHaveAttribute("aria-hidden", "true");

    const file = new File([pngBlob()], "north-floor.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input!);

    await waitFor(() => expect(importPlanReference).toHaveBeenCalledOnce());
    expect(importPlanReference).toHaveBeenCalledWith(
      {
        operationId: OPERATION_ID,
        role: "plan-reference",
        source: {
          kind: "sandbox-blob",
          blob: file,
          displayName: "north-floor.png",
        },
      },
      {
        id: REFERENCE_ID,
        name: "north-floor",
        tags: [],
        floorId: store.getState().snapshot!.project.floors[0]!.id,
        layerId: store.getState().snapshot!.project.floors[0]!.layers[0]!.id,
      },
      expect.any(Function),
    );
    expect(screen.getByRole("tab", { name: "\u8d44\u4ea7\u5e93" })).toHaveAttribute("aria-selected", "true");
    const library = screen.getByRole("region", { name: "\u8d44\u4ea7\u5e93" });
    expect(within(library).getByRole("status")).toHaveTextContent("\u6b63\u5728\u9a8c\u8bc1\u683c\u5f0f");
    expect(within(library).getByRole("button", { name: "\u53d6\u6d88\u5bfc\u5165" })).toBeEnabled();

    await act(async () => completion.resolve());
    await waitFor(() => expect(sessionStore.getState().selectedIds.has(REFERENCE_ID)).toBe(true));
    expect(store.getState().snapshot?.project.planReferences).toContainEqual(
      expect.objectContaining({
        id: REFERENCE_ID,
        assetId: ASSET_ID,
        intrinsicSize: { width: 1, height: 1 },
      }),
    );
    expect(importButton).toHaveFocus();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });
});
  it("treats a sandbox input cancel event as a focused no-op", async () => {
    const { store } = await createProject();
    const importPlanReference = vi.spyOn(store, "importPlanReference");
    const { makeId } = renderImportEditor(store);
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent(input!, new Event("cancel"));

    await waitFor(() => expect(input).not.toBeInTheDocument());
    expect(importPlanReference).not.toHaveBeenCalled();
    expect(makeId).not.toHaveBeenCalled();
    expect(importButton).toHaveFocus();
  });


describe("Task 11 sidebar tabs", () => {
  it("uses roving focus, arrow navigation, and linked tabpanels", async () => {
    const { store } = await createProject();
    renderImportEditor(store, { picker: { pick: vi.fn(async () => null) } });
    const user = userEvent.setup();
    const treeTab = screen.getByRole("tab", { name: "\u9879\u76ee\u6811" });
    const assetTab = screen.getByRole("tab", { name: "\u8d44\u4ea7\u5e93" });

    expect(treeTab).toHaveAttribute("tabindex", "0");
    expect(assetTab).toHaveAttribute("tabindex", "-1");
    const treePanel = screen.getByRole("tabpanel");
    expect(treeTab).toHaveAttribute("aria-controls", treePanel.id);
    expect(treePanel).toHaveAttribute("aria-labelledby", treeTab.id);

    treeTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(assetTab).toHaveFocus();
    expect(assetTab).toHaveAttribute("aria-selected", "true");
    expect(assetTab).toHaveAttribute("tabindex", "0");
    expect(treeTab).toHaveAttribute("tabindex", "-1");
    const assetPanel = screen.getByRole("tabpanel");
    expect(assetTab).toHaveAttribute("aria-controls", assetPanel.id);
    expect(assetPanel).toHaveAttribute("aria-labelledby", assetTab.id);

    await user.keyboard("{ArrowLeft}");
    expect(treeTab).toHaveFocus();
    expect(treeTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("Task 11 Asset Library workflow", () => {
  it("reformats an active import without restarting or cancelling the operation", async () => {
    const { store } = await createProject();
    const importPlanReference = vi.spyOn(store, "importPlanReference").mockImplementation(async (
      request,
      _reference,
      onProgress,
    ) => {
      onProgress?.({
        operationId: request.operationId,
        stage: "hash",
        completedBytes: 12,
        totalBytes: 24,
      });
      return new Promise<PlanReference>(() => undefined);
    });
    const cancelAssetImport = vi.spyOn(store, "cancelAssetImport");
    renderImportEditor(store, {
      picker: { pick: vi.fn(async () => sandboxSource()) },
      enableLocaleSwitch: true,
    });
    const user = userEvent.setup();

    await user.click(toolbarImportButton());
    expect(await screen.findByText("正在计算指纹")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Switch locale" }));

    const library = screen.getByRole("region", { name: "Asset library" });
    expect(library).toBeVisible();
    expect(within(library).getByRole("button", { name: "Import floor plan" })).toBeDisabled();
    expect(screen.getByText("Calculating fingerprint")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel import" })).toBeEnabled();
    expect(importPlanReference).toHaveBeenCalledOnce();
    expect(cancelAssetImport).not.toHaveBeenCalled();
  });

  it.each([
    ["zh-CN", "资源操作未能完成，请重试。"],
    ["en", "The asset operation could not be completed. Try again."],
  ] as const)("redacts ProjectBackendError paths in %s", (locale, expected) => {
    const failure = new ProjectBackendError(
      "ASSET_IO_FAILED",
      `Could not import ${PRIVATE_SOURCE_PATH}`,
      { path: PRIVATE_SOURCE_PATH },
      "asset-safe-ref",
    );

    const rendered = formatMessageDescriptor(locale, localizedErrorDescriptor(failure));

    expect(rendered).toBe(expected);
    expect(rendered).not.toContain(PRIVATE_SOURCE_PATH);
  });
  it("cancels the active operation UUID without surfacing cancellation as an error", async () => {
    const { store } = await createProject();
    const completion = deferred<PlanReference>();
    const source = sandboxSource();
    vi.spyOn(store, "importPlanReference").mockImplementation(async (request, _reference, onProgress) => {
      onProgress?.({
        operationId: request.operationId,
        stage: "hash",
        completedBytes: 12,
        totalBytes: 24,
      });
      return completion.promise;
    });
    const cancelAssetImport = vi.spyOn(store, "cancelAssetImport").mockResolvedValue();
    renderImportEditor(store, { picker: { pick: vi.fn(async () => source) } });
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);
    expect(await screen.findByText("\u6b63\u5728\u8ba1\u7b97\u6307\u7eb9")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "\u53d6\u6d88\u5bfc\u5165" }));
    expect(cancelAssetImport).toHaveBeenCalledOnce();
    expect(cancelAssetImport).toHaveBeenCalledWith(OPERATION_ID);

    await act(async () => completion.reject(Object.assign(new Error("Asset import cancelled"), {
      code: "ASSET_IMPORT_CANCELLED",
    })));
    await waitFor(() => expect(screen.queryByText("\u6b63\u5728\u8ba1\u7b97\u6307\u7eb9")).not.toBeInTheDocument());
    expect(screen.queryByText("Asset import cancelled")).not.toBeInTheDocument();
    expect(importButton).toHaveFocus();
  });

  it("redacts native paths from cancel failures", async () => {
    const { store } = await createProject();
    const completion = deferred<PlanReference>();
    vi.spyOn(store, "importPlanReference").mockImplementation(async () => completion.promise);
    vi.spyOn(store, "cancelAssetImport").mockRejectedValueOnce(Object.assign(
      new Error(`Cancel failed for ${PRIVATE_SOURCE_PATH}`),
      { logRef: "cancel-safe-ref" },
    ));
    renderImportEditor(store, {
      picker: { pick: vi.fn(async () => sandboxSource()) },
    });
    const user = userEvent.setup();

    await user.click(toolbarImportButton());
    await user.click(await screen.findByRole("button", { name: "\u53d6\u6d88\u5bfc\u5165" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("\u5e73\u9762\u56fe\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002");
    expect(alert).toHaveTextContent("cancel-safe-ref");
    expect(alert).not.toHaveTextContent(PRIVATE_SOURCE_PATH);

    await act(async () => completion.reject(Object.assign(
      new Error("Asset import cancelled"),
      { code: "ASSET_IMPORT_CANCELLED" },
    )));
    await waitFor(() => expect(screen.queryByRole("button", {
      name: "\u53d6\u6d88\u5bfc\u5165",
    })).not.toBeInTheDocument());
  });

  it("falls back to the Asset Library tab when successful reimport removes its button", async () => {
    const { store } = await createProject();
    const brokenSource = await sandboxSvgSource("broken.svg", 1);
    vi.stubGlobal("Blob", brokenSource.blob.constructor);
    const snapshot = store.getState().snapshot!;
    const floor = snapshot.project.floors[0]!;
    const reference = await store.importPlanReference(
      {
        operationId: "00000000-0000-4000-8000-000000000105",
        role: "plan-reference",
        source: brokenSource,
      },
      {
        id: REFERENCE_ID,
        name: "broken",
        tags: [],
        floorId: floor.id,
        layerId: floor.layers[0]!.id,
      },
    );
    const state = store.getState();
    (store as unknown as { state: ReturnType<ProjectStore["getState"]> }).state =
      Object.freeze({
        ...state,
        assetIssues: Object.freeze([{
          assetId: reference.assetId,
          code: "ASSET_CORRUPT" as const,
        }]),
      });
    const replacementSource = await sandboxSvgSource("replacement.svg", 2);
    renderImportEditor(store, {
      picker: { pick: vi.fn(async () => replacementSource) },
      ids: [REPLACEMENT_OPERATION_ID],
    });
    const user = userEvent.setup();
    const assetTab = screen.getByRole("tab", { name: "\u8d44\u4ea7\u5e93" });
    await user.click(assetTab);
    const reimport = screen.getByRole("button", { name: "\u91cd\u65b0\u5bfc\u5165 broken" });

    await user.click(reimport);

    await waitFor(() => expect(screen.queryByRole("button", {
      name: "\u91cd\u65b0\u5bfc\u5165 broken",
    })).not.toBeInTheDocument());
    expect(store.getState().assetIssues).toEqual([]);
    expect(assetTab).toHaveFocus();
  });

  it("shows a safe commit failure, publishes no library row, and restores focus", async () => {
    const { store } = await createProject();
    const source: AssetImportSource = {
      kind: "native-path",
      path: PRIVATE_SOURCE_PATH,
      displayName: "sensitive-floor.png",
    };
    vi.spyOn(store, "importPlanReference").mockRejectedValueOnce(Object.assign(
      new Error(`Commit failed for ${PRIVATE_SOURCE_PATH}`),
      { code: "COMMIT_FAILED", logRef: "asset-import-commit" },
    ));
    renderImportEditor(store, {
      picker: { pick: vi.fn(async () => source) },
    });
    const user = userEvent.setup();
    const importButton = toolbarImportButton();

    await user.click(importButton);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("\u5e73\u9762\u56fe\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002");
    expect(alert).toHaveTextContent("asset-import-commit");
    expect(document.body).not.toHaveTextContent(PRIVATE_SOURCE_PATH);
    expect(screen.queryByText("sensitive-floor")).not.toBeInTheDocument();
    expect(importButton).toHaveFocus();
  });

  it("lists only safe reference metadata and reimports a corrupt asset with one new operation UUID", async () => {
    const { store } = await createProject();
    const state = store.getState();
    const reference = referenceResult(store);
    const sha256 = "0".repeat(64);
    const snapshot = parseSnapshotV3({
      ...state.snapshot!,
      project: {
        ...state.snapshot!.project,
        planReferences: [reference],
      },
      assets: [{
        id: ASSET_ID,
        sha256,
        relativePath: `assets/sha256/00/${sha256}.png`,
        mediaType: "image/png",
        size: 24,
      }],
    });
    (store as unknown as { state: ReturnType<ProjectStore["getState"]> }).state =
      Object.freeze({
        ...state,
        snapshot,
        assetIssues: Object.freeze([{
          assetId: reference.assetId,
          code: "ASSET_CORRUPT" as const,
        }]),
      });
    expect(store.getState().assetIssues).toEqual([{
      assetId: reference.assetId,
      code: "ASSET_CORRUPT",
    }]);

    const replacementSource = sandboxSource("replacement.svg");
    const replaceBrokenPlanReference = vi
      .spyOn(store, "replaceBrokenPlanReference")
      .mockResolvedValue(reference);
    renderImportEditor(store, {
      picker: { pick: vi.fn(async () => replacementSource) },
      ids: [REPLACEMENT_OPERATION_ID],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "\u8d44\u4ea7\u5e93" }));
    const library = screen.getByRole("region", { name: "\u8d44\u4ea7\u5e93" });

    expect(within(library).getByText("north-floor")).toBeVisible();
    expect(within(library).getByText("PNG")).toBeVisible();
    expect(within(library).getByText("\u672a\u6821\u51c6")).toBeVisible();
    expect(within(library).getByText("\u672a\u9501\u5b9a")).toBeVisible();
    expect(within(library).getByText("\u8d44\u4ea7\u5df2\u635f\u574f")).toBeVisible();
    expect(document.body).not.toHaveTextContent(PRIVATE_SOURCE_PATH);
    expect(within(library).queryByRole("button", {
      name: /\u5f00\u53e3|\u5185\u5bb9|\u8def\u7ebf|3D|\u5bfc\u51fa/,
    })).not.toBeInTheDocument();

    const reimport = within(library).getByRole("button", { name: "\u91cd\u65b0\u5bfc\u5165 north-floor" });
    await user.click(reimport);
    await waitFor(() => expect(replaceBrokenPlanReference).toHaveBeenCalledOnce());
    expect(replaceBrokenPlanReference).toHaveBeenCalledWith(
      reference.id,
      {
        operationId: REPLACEMENT_OPERATION_ID,
        role: "plan-reference",
        source: replacementSource,
      },
      expect.any(Function),
    );
    expect(reimport).toHaveFocus();
  });
});

describe('M2.3 Task 11 product-media picker roles', () => {
  it.each([
    ['content-image', {
      name: '产品图片',
      extensions: ['png', 'jpg', 'jpeg', 'svg'],
    }],
    ['material-texture', {
      name: '\u6750\u8d28\u7eb9\u7406',
      extensions: ['png', 'jpg', 'svg'],
    }],
    ['content-video', {
      name: '产品视频',
      extensions: ['mp4', 'webm'],
    }],
  ] as const)(
    'uses an exact desktop dialog filter for %s',
    async (role, filter) => {
      openPlanDialog.mockResolvedValueOnce(null);
      const picker = createDesktopPlanAssetPicker(openPlanDialog);

      await picker.pick(role);

      expect(openPlanDialog).toHaveBeenCalledWith({
        directory: false,
        multiple: false,
        filters: [filter],
      });
    },
  );

  it.each([
    [
      'content-image',
      '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml',
    ],
    [
      'material-texture',
      '.png,.jpg,.svg',
    ],
    [
      'content-video',
      '.mp4,.webm,video/mp4,video/webm',
    ],
  ] as const)(
    'owns a sandbox input with an exact accept list for %s',
    async (role, accept) => {
      const picker = createSandboxPlanAssetPicker(document);
      const picked = picker.pick(role);
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');

      expect(input).not.toBeNull();
      expect(input).toHaveAttribute('accept', accept);
      expect(input).not.toHaveAttribute('multiple');
      fireEvent(input!, new Event('cancel'));

      await expect(picked).resolves.toBeNull();
      expect(input).not.toBeInTheDocument();
    },
  );
});

describe('M2.3 Task 11 product-media import ownership', () => {
  it('rejects a stale product target when selection changes while the picker is open', async () => {
    const { store } = await createProject();
    const { fixture } = await addProductTarget(store);
    const secondFixture: Fixture = {
      ...fixture,
      id: '00000000-0000-4000-8000-000000000204',
      name: 'South display',
      transform: {
        ...fixture.transform,
        translation: { x: 2_000, y: 0 },
      },
    };
    await store.applyPlanEdit({
      reason: 'create',
      changes: [{ id: secondFixture.id, before: null, after: secondFixture }],
    });
    const source = sandboxSource('stale.png');
    const pickerResult = deferred<AssetImportSource | null>();
    const pick = vi.fn(async () => pickerResult.promise);
    const importProductMedia = vi.spyOn(store, 'importProductMedia');
    renderImportEditor(store, {
      picker: { pick },
      ids: [OPERATION_ID, PRODUCT_MEDIA_ID],
    });
    const user = userEvent.setup();

    await user.click(document.querySelector<HTMLElement>(
      `[data-entity-id="${fixture.id}"]`,
    )!);
    await user.click(screen.getByRole('button', { name: '\u5bfc\u5165\u56fe\u7247' }));
    await user.click(document.querySelector<HTMLElement>(
      `[data-entity-id="${secondFixture.id}"]`,
    )!);
    expect(screen.getByRole('button', { name: '\u5bfc\u5165\u56fe\u7247' }))
      .toBeDisabled();
    await act(async () => pickerResult.resolve(source));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      '\u4ea7\u54c1\u5a92\u4f53\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002',
    ));
    expect(importProductMedia).not.toHaveBeenCalled();
    expect(store.getState().snapshot!.project.mediaAssets).toEqual([]);
  });

  it('uses the shared progress and cancellation owner for a product image import', async () => {
    const { store } = await createProject();
    const { fixture, content } = await addProductTarget(store);
    const source = sandboxSource('hero.png');
    const completion = deferred<
      Awaited<ReturnType<ProjectStore['importProductMedia']>>
    >();
    const importProductMedia = vi
      .spyOn(store, 'importProductMedia')
      .mockImplementation(async (_input, onProgress) => {
        onProgress?.({
          operationId: OPERATION_ID,
          stage: 'hash',
          completedBytes: 12,
          totalBytes: 24,
        });
        return completion.promise;
      });
    const cancelAssetImport = vi
      .spyOn(store, 'cancelAssetImport')
      .mockResolvedValue();
    const pick = vi.fn(async () => source);
    renderImportEditor(store, {
      picker: { pick },
      ids: [OPERATION_ID, PRODUCT_MEDIA_ID],
    });
    const user = userEvent.setup();

    await user.click(document.querySelector<HTMLElement>(
      `[data-entity-id="${fixture.id}"]`,
    )!);
    const importButton = screen.getByRole('button', { name: '导入图片' });
    await user.click(importButton);

    expect(pick).toHaveBeenCalledOnce();
    expect(pick).toHaveBeenCalledWith('content-image');
    expect(importProductMedia).toHaveBeenCalledWith(
      {
        request: {
          operationId: OPERATION_ID,
          role: 'content-image',
          source,
        },
        media: {
          id: PRODUCT_MEDIA_ID,
          name: 'hero',
          tags: [],
          kind: 'image',
        },
        contentBefore: content,
        contentAfter: {
          ...content,
          mediaAssetIds: [PRODUCT_MEDIA_ID],
        },
      },
      expect.any(Function),
    );
    expect(await screen.findByText('正在计算指纹')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '取消导入' }));
    expect(cancelAssetImport).toHaveBeenCalledWith(OPERATION_ID);

    await act(async () => completion.reject(Object.assign(
      new Error('Asset import cancelled'),
      { code: 'ASSET_IMPORT_CANCELLED' },
    )));
    await waitFor(() => {
      expect(screen.queryByText('正在计算指纹')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Asset import cancelled')).not.toBeInTheDocument();
    expect(importButton).toHaveFocus();
  });

  it('redacts native paths from product-media commit failures and restores focus', async () => {
    const { store } = await createProject();
    const { fixture } = await addProductTarget(store);
    const source: AssetImportSource = {
      kind: 'native-path',
      path: PRIVATE_SOURCE_PATH,
      displayName: 'sensitive-product.png',
    };
    vi.spyOn(store, 'importProductMedia').mockRejectedValueOnce(Object.assign(
      new Error(`Commit failed for ${PRIVATE_SOURCE_PATH}`),
      { code: 'COMMIT_FAILED', logRef: 'product-media-commit' },
    ));
    renderImportEditor(store, {
      picker: { pick: vi.fn(async () => source) },
      ids: [OPERATION_ID, PRODUCT_MEDIA_ID],
    });
    const user = userEvent.setup();

    await user.click(document.querySelector<HTMLElement>(
      `[data-entity-id="${fixture.id}"]`,
    )!);
    const importButton = screen.getByRole('button', { name: '导入图片' });
    await user.click(importButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('产品媒体导入失败，请重试。');
    expect(alert).toHaveTextContent('product-media-commit');
    expect(document.body).not.toHaveTextContent(PRIVATE_SOURCE_PATH);
    expect(screen.queryByText('sensitive-product')).not.toBeInTheDocument();
    await waitFor(() => expect(importButton).toHaveFocus());
    expect(store.getState().snapshot!.project.mediaAssets).toEqual([]);
  });

  it('repairs corrupt product media in place with the matching media role', async () => {
    const { store } = await createProject();
    const { fixture, content } = await addProductTarget(store);
    const originalSource = await sandboxSvgSource('hero.svg', 1);
    vi.stubGlobal('Blob', originalSource.blob.constructor);
    const imported = await store.importProductMedia({
      request: {
        operationId: OPERATION_ID,
        role: 'content-image',
        source: originalSource,
      },
      media: {
        id: PRODUCT_MEDIA_ID,
        name: 'hero',
        tags: [],
        kind: 'image',
      },
      contentBefore: content,
      contentAfter: {
        ...content,
        mediaAssetIds: [PRODUCT_MEDIA_ID],
      },
    });
    const state = store.getState();
    (store as unknown as { state: ReturnType<ProjectStore['getState']> }).state =
      Object.freeze({
        ...state,
        assetIssues: Object.freeze([{
          assetId: imported.media.assetId,
          code: 'ASSET_CORRUPT' as const,
        }]),
      });
    const replacement = await sandboxSvgSource('replacement.svg', 2);
    const replaceBrokenProductMedia = vi
      .spyOn(store, 'replaceBrokenProductMedia')
      .mockResolvedValue(imported.media);
    const pick = vi.fn(async () => replacement);
    renderImportEditor(store, {
      picker: { pick },
      ids: [REPLACEMENT_OPERATION_ID],
    });
    const user = userEvent.setup();

    await user.click(document.querySelector<HTMLElement>(
      `[data-entity-id="${fixture.id}"]`,
    )!);
    const repairButton = screen.getByRole('button', { name: '修复 hero' });
    await user.click(repairButton);

    expect(pick).toHaveBeenCalledWith('content-image');
    expect(replaceBrokenProductMedia).toHaveBeenCalledWith(
      PRODUCT_MEDIA_ID,
      {
        operationId: REPLACEMENT_OPERATION_ID,
        role: 'content-image',
        source: replacement,
      },
      expect.any(Function),
    );
    await waitFor(() => expect(repairButton).toHaveFocus());
    expect(store.getState().snapshot!.project.productContents[0]!.mediaAssetIds)
      .toEqual([PRODUCT_MEDIA_ID]);
  });
});
