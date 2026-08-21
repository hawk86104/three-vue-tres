// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryLocalePreference } from "../../i18n/locale-preference";
import { LocaleProvider, useI18n } from "../../i18n/locale-provider";
import { DisplayNameProvider } from "../../i18n/display-name-provider";
import type { Opening, PlanReference, Wall } from "@aethertwin/core-model";
import { describe, expect, it, vi } from "vitest";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { PlanInspector, type PlanInspectorProps } from "./plan-inspector";
import { createPlanEditorTestHarness } from "./plan-editor.test-support";

function inspectorProps(context: PlanInspectorProps["context"] = { kind: "project" }): PlanInspectorProps {
  const fixture = createPlanEditorTestHarness();
  return {
    snapshot: fixture.snapshot,
    assetIssues: [],
    assetOperationBusy: false,
    context,
    activeFloorId: fixture.floorA.id,
    saveState: "saved",
    backendMode: "sandbox",
    projectPath: "sandbox://fixture",
    controller: fixture.controller,
    makeId: () => "00000000-0000-4000-8000-000000000020",
    onHandledStoreError: vi.fn(),
    onRenameProject: vi.fn(async () => undefined),
    onSetProjectTags: vi.fn(async () => undefined),
    onApplySceneEnvironmentPatch: vi.fn(async () => undefined),
    onApplyFloorPatch: vi.fn(async () => undefined),
    onApplyPlanEdit: vi.fn(async () => undefined),
    onApplyPlanReferencePatch: vi.fn(async () => undefined),
    onApplyOpeningPatch: vi.fn(async () => undefined),
    onApplyBuildingStructurePatch: vi.fn(async () => undefined),
    onApplyProductContentPatch: vi.fn(async () => undefined),
    onImportProductMedia: vi.fn(async () => undefined),
    onRepairProductMedia: vi.fn(async () => undefined),
    onApplyMaterialPatches: vi.fn(async () => undefined),
    onImportMaterialTexture: vi.fn(async () => undefined),
    resolveAsset: vi.fn(async () => ({
      assetId: "00000000-0000-4000-8000-000000000020",
      url: "blob:fixture",
      mediaType: "image/png" as const,
    })),
    onError: vi.fn(),
  };
}

function selectionProps(kind: "plan-reference" | "opening"): PlanInspectorProps {
  const props = inspectorProps(kind === "plan-reference" ? { kind, referenceId: "00000000-0000-4000-8000-000000000101" } : { kind, openingId: "00000000-0000-4000-8000-000000000102" });
  const floor = props.snapshot.project.floors[0]!;
  const layer = floor.layers[0]!;
  const wall: Wall = { type: "wall", id: "00000000-0000-4000-8000-000000000100", name: "North wall", tags: [], floorId: floor.id, layerId: layer.id, locked: false, transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }, centerLine: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], thickness: 100 };
  const reference: PlanReference = { id: "00000000-0000-4000-8000-000000000101", name: "Plan image", tags: [], floorId: floor.id, layerId: layer.id, assetId: "00000000-0000-4000-8000-000000000103", intrinsicSize: { width: 100, height: 100 }, transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }, opacity: 1, locked: false, calibration: null };
  const opening: Opening = { id: "00000000-0000-4000-8000-000000000102", name: "North window", tags: [], wallId: wall.id, kind: "window", distanceAlongWall: 100, width: 300, height: 400, sillHeight: 50 };
  return { ...props, snapshot: { ...props.snapshot, project: { ...props.snapshot.project, entities: [...props.snapshot.project.entities, wall], planReferences: [reference], openings: [opening] } } };
}

function LocaleSwitch({ children }: { readonly children: ReactNode }) {
  const { setLocale } = useI18n();
  return <><button type="button" onClick={() => setLocale("en")}>Switch locale</button>{children}</>;
}

function renderSwitchableInspector(props: PlanInspectorProps) {
  return render(
    <LocaleProvider preference={createMemoryLocalePreference("zh-CN")}>
      <DisplayNameProvider><LocaleSwitch><PlanInspector {...props} /></LocaleSwitch></DisplayNameProvider>
    </LocaleProvider>,
  );
}

describe("PlanInspector localization", () => {
  it("renders the project inspector in English", () => {
    render(
      <StudioI18nTestProvider locale="en">
        <PlanInspector {...inspectorProps()} />
      </StudioI18nTestProvider>,
    );

    expect(screen.getByRole("heading", { name: "Project" })).toBeTruthy();
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Editor");
    expect(screen.getByRole("button", { name: "Apply name" })).toBeTruthy();
  });

  it.each([
    ["zh-CN", { kind: "project" }, "项目"],
    ["en", { kind: "project" }, "Project"],
    ["zh-CN", { kind: "floor", floorId: "00000000-0000-4000-8000-000000000002" }, "楼层"],
    ["en", { kind: "floor", floorId: "00000000-0000-4000-8000-000000000002" }, "Floor"],
    ["zh-CN", { kind: "layer", floorId: "00000000-0000-4000-8000-000000000002", layerId: "00000000-0000-4000-8000-000000000003" }, "图层"],
    ["en", { kind: "layer", floorId: "00000000-0000-4000-8000-000000000002", layerId: "00000000-0000-4000-8000-000000000003" }, "Layer"],
    ["zh-CN", { kind: "entity", entityId: "00000000-0000-4000-8000-000000000010" }, "对象"],
    ["en", { kind: "entity", entityId: "00000000-0000-4000-8000-000000000010" }, "Object"],
    ["zh-CN", { kind: "multi", entityIds: [] }, "多选"],
    ["en", { kind: "multi", entityIds: [] }, "Multiple selection"],
  ] as const)("renders %s %o inspector heading", (locale, context, heading) => {
    render(<StudioI18nTestProvider locale={locale}><PlanInspector {...inspectorProps(context)} /></StudioI18nTestProvider>);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    cleanup();
  });

  it.each([
    ["zh-CN", { kind: "plan-reference", referenceId: "missing" }, "平面参考不存在"],
    ["en", { kind: "plan-reference", referenceId: "missing" }, "Plan reference does not exist"],
    ["zh-CN", { kind: "opening", openingId: "missing" }, "门窗不存在"],
    ["en", { kind: "opening", openingId: "missing" }, "Opening does not exist"],
    ["zh-CN", { kind: "entity", entityId: "missing" }, "对象不存在"],
    ["en", { kind: "entity", entityId: "missing" }, "Object does not exist"],
  ] as const)("renders %s safe stale notice", (locale, context, notice) => {
    render(<StudioI18nTestProvider locale={locale}><PlanInspector {...inspectorProps(context)} /></StudioI18nTestProvider>);
    expect(screen.getByText(notice)).toBeTruthy();
    cleanup();
  });

  it("keeps authored values and IDs as mutation values while resolving presentation names", () => {
    const context = { kind: "floor", floorId: "00000000-0000-4000-8000-000000000002" } as const;
    render(
      <StudioI18nTestProvider locale="en" resolver={(subject) => (
        subject.kind === "floor" ? { id: "webDemo.displayName", args: [{ zh: "一层", en: "Level 1" }] } : null
      )}>
        <PlanInspector {...inspectorProps(context)} />
      </StudioI18nTestProvider>,
    );
    expect(screen.getByText("Level 1")).toBeTruthy();
    expect((screen.getByLabelText("Floor name") as HTMLInputElement).value).toBe("一层");
  });

  it.each([
    ["zh-CN", "plan-reference", "参考图", "参考图名称", "应用参考图"], ["en", "plan-reference", "Reference image", "Reference image name", "Apply reference image"],
    ["zh-CN", "opening", "门窗", "门窗名称", "应用门窗"], ["en", "opening", "Opening", "Opening name", "Apply opening"],
  ] as const)("renders valid %s %s selection controls", (locale, kind, heading, field, action) => {
    render(<StudioI18nTestProvider locale={locale}><PlanInspector {...selectionProps(kind)} /></StudioI18nTestProvider>);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByLabelText(field)).toBeTruthy();
    expect(screen.getByRole("button", { name: action })).toBeTruthy();
    cleanup();
  });

  it("preserves a valid reference selection, unsaved form value, and raw reference patch through an in-place locale switch", async () => {
    const props = selectionProps("plan-reference");
    renderSwitchableInspector(props);
    fireEvent.change(screen.getByLabelText("参考图名称"), { target: { value: "Draft reference" } });
    fireEvent.change(screen.getByLabelText("透明度"), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText("X (mm)"), { target: { value: "1.25 m" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));
    expect(screen.getByRole("heading", { name: "Reference image" })).toBeTruthy();
    expect((screen.getByLabelText("Reference image name") as HTMLInputElement).value).toBe("Draft reference");
    expect((screen.getByLabelText("Opacity") as HTMLInputElement).value).toBe("0.4");
    expect((screen.getByLabelText("X (mm)") as HTMLInputElement).value).toBe("1.25 m");
    fireEvent.click(screen.getByRole("button", { name: "Apply reference image" }));
    await waitFor(() => expect(props.onApplyPlanReferencePatch).toHaveBeenCalledOnce());
    const [before, after] = (props.onApplyPlanReferencePatch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(before.id).toBe("00000000-0000-4000-8000-000000000101");
    expect(after.name).toBe("Draft reference");
    expect(after.opacity).toBe(0.4);
    expect(after.transform.translation.x).toBe(1250);
    cleanup();
  });

  it("preserves a valid opening selection, unsaved kind, and raw opening patch through an in-place locale switch", async () => {
    const props = selectionProps("opening");
    renderSwitchableInspector(props);
    fireEvent.change(screen.getByLabelText("门窗名称"), { target: { value: "Draft door" } });
    fireEvent.change(screen.getByRole("combobox", { name: "门窗类型" }), { target: { value: "door" } });
    fireEvent.change(screen.getByLabelText("宽度 (mm)"), { target: { value: "1 m" } });
    fireEvent.change(screen.getByLabelText("沿墙距离 (mm)"), { target: { value: "275" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));
    expect(screen.getByRole("heading", { name: "Opening" })).toBeTruthy();
    expect((screen.getByLabelText("Opening name") as HTMLInputElement).value).toBe("Draft door");
    expect((screen.getByRole("combobox", { name: "Opening type" }) as HTMLSelectElement).value).toBe("door");
    expect((screen.getByLabelText("Width (mm)") as HTMLInputElement).value).toBe("1 m");
    fireEvent.click(screen.getByRole("button", { name: "Apply opening" }));
    await waitFor(() => expect(props.onApplyOpeningPatch).toHaveBeenCalledOnce());
    const [before, after] = (props.onApplyOpeningPatch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(before.id).toBe("00000000-0000-4000-8000-000000000102");
    expect(after.kind).toBe("door");
    expect(after.width).toBe(1000);
    expect(after.distanceAlongWall).toBe(275);
  });
});
