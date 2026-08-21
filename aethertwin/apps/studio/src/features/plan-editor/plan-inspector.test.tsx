// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { PlanInspector, type PlanInspectorProps } from "./plan-inspector";
import { createPlanEditorTestHarness } from "./plan-editor.test-support";

function inspectorProps(): PlanInspectorProps {
  const fixture = createPlanEditorTestHarness();
  return {
    snapshot: fixture.snapshot,
    assetIssues: [],
    assetOperationBusy: false,
    context: { kind: "project" },
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
});
