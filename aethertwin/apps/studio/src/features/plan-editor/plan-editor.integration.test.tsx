// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
