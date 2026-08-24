// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  createInitialSnapshot,
  parseSnapshotV3,
  type Fixture,
  type MaterialAssignment,
  type MaterialDefinition,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type { AnySnapshotRecordsPatch } from "@aethertwin/project-store";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n/locale-provider";
import { ProjectBackendError } from "../../backend/project-backend-error";
import { useI18n } from "../../i18n/locale-provider";
import {
  MaterialInspector,
  materialTargetKind,
  type MaterialInspectorProps,
  type MaterialTarget,
} from "./material-inspector";

const FIXTURE_A_ID = "00000000-0000-4000-8000-000000000201";
const FIXTURE_B_ID = "00000000-0000-4000-8000-000000000202";
const MATERIAL_A_ID = "00000000-0000-4000-8000-000000000203";
const MATERIAL_B_ID = "00000000-0000-4000-8000-000000000204";
const ASSIGNMENT_A_ID = "00000000-0000-4000-8000-000000000205";
const ASSIGNMENT_B_ID = "00000000-0000-4000-8000-000000000206";
const TEXTURE_ID = "00000000-0000-4000-8000-000000000207";
const NEW_MATERIAL_ID = "00000000-0000-4000-8000-000000000208";
const NEW_ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000209";

function material(
  id: string,
  name: string,
  overrides: Partial<MaterialDefinition> = {},
): MaterialDefinition {
  return {
    id,
    name,
    tags: [],
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 1,
    assetId: null,
    ...overrides,
  };
}

function assignment(
  id: string,
  targetId: string,
  materialId: string,
): MaterialAssignment {
  return {
    id,
    name: "Fixture material",
    tags: [],
    materialId,
    targetKind: "fixture",
    targetId,
  };
}

function fixture(id: string, name: string): Fixture {
  return {
    type: "fixture",
    id,
    name,
    tags: [],
    floorId: "00000000-0000-4000-8000-000000000210",
    layerId: "00000000-0000-4000-8000-000000000211",
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    kind: "generic",
    size: { width: 1000, height: 500 },
  };
}

function projectSnapshot(
  entities: readonly Fixture[],
  materials: readonly MaterialDefinition[] = [],
  materialAssignments: readonly MaterialAssignment[] = [],
): ProjectSnapshot {
  const ids = [
    "00000000-0000-4000-8000-000000000210",
    "00000000-0000-4000-8000-000000000211",
    "00000000-0000-4000-8000-000000000212",
  ];
  const initial = createInitialSnapshot({
    name: "Material inspector",
    profile: "showroom",
    uuid: () => ids.shift()!,
  });
  const floor = initial.project.floors[0]!;
  const textureAssetIds = [...new Set(materials.flatMap(({ assetId }) => (
    assetId === null ? [] : [assetId]
  )))];
  return parseSnapshotV3({
    ...initial,
    assets: textureAssetIds.map((id) => ({
      id,
      sha256: "a".repeat(64),
      relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
      size: 1,
      mediaType: "image/png",
    })),
    project: {
      ...initial.project,
      entities: entities.map((entity) => ({
        ...entity,
        floorId: floor.id,
        layerId: floor.layers[0]!.id,
      })),
      materials,
      materialAssignments,
    },
  });
}

afterEach(cleanup);

function renderInspector(
  snapshot: ProjectSnapshot,
  target: Fixture,
  overrides: Partial<MaterialInspectorProps> & { readonly locale?: "zh-CN" | "en" } = {},
) {
  const onApplyPatches = vi.fn<
    (patches: readonly AnySnapshotRecordsPatch[]) => Promise<void>
  >(async () => undefined);
  const onImportTexture = vi.fn(async () => undefined);
  const onError = vi.fn();
  const ids = [NEW_MATERIAL_ID, NEW_ASSIGNMENT_ID];
  const { locale, ...propOverrides } = overrides;
  const props: MaterialInspectorProps = {
    snapshot,
    target: snapshot.project.entities.find(({ id }) => id === target.id) as Fixture,
    disabled: false,
    assetIssues: [],
    assetOperationBusy: false,
    makeId: () => ids.shift()!,
    onApplyPatches,
    onImportTexture,
    onError,
    ...propOverrides,
  };
  const content = <MaterialInspector {...props} />;
  const view = render(locale === undefined ? content : (
    <LocaleProvider preference={{ read: () => locale, write: () => undefined }}>
      {content}
    </LocaleProvider>
  ));
  return { ...view, props, onApplyPatches, onImportTexture, onError };
}

function SwitchToEnglish() {
  const { setLocale } = useI18n();
  return <button type="button" onClick={() => setLocale("en")}>switch</button>;
}

async function openMaterialSection(label = "材质"): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(screen.getByText(label));
  return screen.getByRole("group", { name: label });
}

describe("MaterialInspector", () => {
  it.each([
    ["space-unit", "space-floor"],
    ["zone", "space-floor"],
    ["wall", "wall"],
    ["fixture", "fixture"],
  ] as const)("maps %s to the durable assignment kind", (type, expected) => {
    expect(materialTargetKind({ type } as MaterialTarget)).toBe(expected);
  });

  it("creates a definition and assignment in one transaction using target defaults", async () => {
    const target = fixture(FIXTURE_A_ID, "Display");
    const view = renderInspector(projectSnapshot([target]), target);
    const user = userEvent.setup();
    const section = await openMaterialSection();

    await user.selectOptions(
      within(section).getByRole("combobox", { name: "材质分配" }),
      "__new__",
    );

    await waitFor(() => expect(view.onApplyPatches).toHaveBeenCalledOnce());
    expect(view.onApplyPatches).toHaveBeenCalledWith([
      {
        collection: "materials",
        changes: [{
          id: NEW_MATERIAL_ID,
          before: null,
          after: {
            id: NEW_MATERIAL_ID,
            name: "Display 材质",
            tags: [],
            baseColor: "#78909c",
            roughness: 0.6,
            metalness: 0.08,
            opacity: 1,
            assetId: null,
          },
          index: 0,
        }],
      },
      {
        collection: "materialAssignments",
        changes: [{
          id: NEW_ASSIGNMENT_ID,
          before: null,
          after: {
            id: NEW_ASSIGNMENT_ID,
            name: "Display 材质分配",
            tags: [],
            materialId: NEW_MATERIAL_ID,
            targetKind: "fixture",
            targetId: FIXTURE_A_ID,
          },
          index: 0,
        }],
      },
    ]);
  });

  it("switches and clears assignments without deleting definitions", async () => {
    const target = fixture(FIXTURE_A_ID, "Display");
    const materialA = material(MATERIAL_A_ID, "Metal");
    const materialB = material(MATERIAL_B_ID, "Fabric");
    const assigned = assignment(ASSIGNMENT_A_ID, target.id, materialA.id);
    const view = renderInspector(
      projectSnapshot([target], [materialA, materialB], [assigned]),
      target,
    );
    const user = userEvent.setup();
    const section = await openMaterialSection();
    const select = within(section).getByRole("combobox", { name: "材质分配" });

    await user.selectOptions(select, MATERIAL_B_ID);
    await waitFor(() => expect(view.onApplyPatches).toHaveBeenCalledTimes(1));
    expect(view.onApplyPatches.mock.calls[0]?.[0]).toEqual([{
      collection: "materialAssignments",
      changes: [{
        id: ASSIGNMENT_A_ID,
        before: assigned,
        after: { ...assigned, materialId: MATERIAL_B_ID },
      }],
    }]);

    await user.selectOptions(select, "__default__");
    await waitFor(() => expect(view.onApplyPatches).toHaveBeenCalledTimes(2));
    expect(view.onApplyPatches.mock.calls[1]?.[0]).toEqual([{
      collection: "materialAssignments",
      changes: [{ id: ASSIGNMENT_A_ID, before: assigned, after: null }],
    }]);
  });

  it("shows shared impact, validates exact bounds, and prevents duplicate submits", async () => {
    const targetA = fixture(FIXTURE_A_ID, "Display A");
    const targetB = fixture(FIXTURE_B_ID, "Display B");
    const shared = material(MATERIAL_A_ID, "Shared");
    const assignments = [
      assignment(ASSIGNMENT_A_ID, targetA.id, shared.id),
      assignment(ASSIGNMENT_B_ID, targetB.id, shared.id),
    ];
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onApplyPatches = vi.fn(() => pending);
    const view = renderInspector(
      projectSnapshot([targetA, targetB], [shared], assignments),
      targetA,
      { onApplyPatches },
    );
    const section = await openMaterialSection();
    expect(within(section).getByText("此材质影响 2 个对象")).toBeVisible();

    fireEvent.change(within(section).getByLabelText("基础颜色"), {
      target: { value: "#xyzxyz" },
    });
    fireEvent.change(within(section).getByLabelText("粗糙度"), {
      target: { value: "1.1" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "应用材质" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "基础颜色必须是 #RRGGBB，粗糙度、金属度必须在 0 到 1，透明度必须大于 0 且不超过 1",
    );
    expect(within(section).getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(within(section).getAllByRole("spinbutton")[0]).toHaveAttribute("aria-describedby");
    expect(onApplyPatches).not.toHaveBeenCalled();

    fireEvent.change(within(section).getByLabelText("基础颜色"), {
      target: { value: "#AABBCC" },
    });
    fireEvent.change(within(section).getByLabelText("粗糙度"), {
      target: { value: "0.25" },
    });
    const apply = within(section).getByRole("button", { name: "应用材质" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(onApplyPatches).toHaveBeenCalledOnce();
    expect(onApplyPatches).toHaveBeenCalledWith([{
      collection: "materials",
      changes: [{
        id: MATERIAL_A_ID,
        before: shared,
        after: {
          ...shared,
          baseColor: "#aabbcc",
          roughness: 0.25,
        },
      }],
    }]);
    finish();
    await pending;
    expect(view.onError).not.toHaveBeenCalled();
  });

  it("imports, repairs, and removes texture references while preserving asset bytes", async () => {
    const target = fixture(FIXTURE_A_ID, "Display");
    const textured = material(MATERIAL_A_ID, "Textured", { assetId: TEXTURE_ID });
    const assigned = assignment(ASSIGNMENT_A_ID, target.id, textured.id);
    const view = renderInspector(
      projectSnapshot([target], [textured], [assigned]),
      target,
      {
        assetIssues: [{ assetId: TEXTURE_ID, code: "ASSET_MISSING" }],
      },
    );
    const user = userEvent.setup();
    const section = await openMaterialSection();

    await user.click(within(section).getByRole("button", { name: "修复纹理" }));
    expect(view.onImportTexture).toHaveBeenCalledWith(
      textured,
      expect.objectContaining({ id: target.id }),
      expect.any(HTMLElement),
    );

    await user.click(within(section).getByRole("button", { name: "移除纹理" }));
    expect(view.onApplyPatches).toHaveBeenCalledWith([{
      collection: "materials",
      changes: [{
        id: MATERIAL_A_ID,
        before: textured,
        after: { ...textured, assetId: null },
      }],
    }]);
  });

  it("reformats material controls in English while retaining authored material names", async () => {
    const target = fixture(FIXTURE_A_ID, "展示台");
    const assigned = material(MATERIAL_A_ID, "Copper", { assetId: TEXTURE_ID });
    const view = renderInspector(
      projectSnapshot([target], [assigned], [assignment(ASSIGNMENT_A_ID, target.id, assigned.id)]),
      target,
      { locale: "en" },
    );
    const section = await openMaterialSection("Material");
    expect(within(section).getByRole("combobox", { name: "Material assignment" }))
      .toHaveValue(MATERIAL_A_ID);
    expect(within(section).getByRole("option", { name: "Copper" })).toBeVisible();
    expect(within(section).getByRole("button", { name: "Apply material" })).toBeVisible();
    expect(view.onApplyPatches).not.toHaveBeenCalled();
  });

  it("redacts a real texture failure in Chinese and English", async () => {
    const user = userEvent.setup();
    const target = fixture(FIXTURE_A_ID, "Display");
    const assigned = material(MATERIAL_A_ID, "Copper", { assetId: TEXTURE_ID });
    const patch = assignment(ASSIGNMENT_A_ID, target.id, assigned.id);
    const onError = vi.fn();
    const props: MaterialInspectorProps = {
      snapshot: projectSnapshot([target], [assigned], [patch]), target, disabled: false,
      assetIssues: [], assetOperationBusy: false, makeId: () => NEW_MATERIAL_ID,
      onApplyPatches: async () => undefined,
      onImportTexture: async () => { throw new ProjectBackendError("ASSET_IO_FAILED", "C:\\secret\\texture.png", { path: "C:\\secret\\texture.png" }, "material-safe-ref"); },
      onError,
    };
    render(<LocaleProvider preference={{ read: () => "zh-CN", write: () => undefined }}><SwitchToEnglish /><MaterialInspector {...props} /></LocaleProvider>);
    const section = await openMaterialSection();
    await user.click(within(section).getByRole("button", { name: "替换纹理" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("material-safe-ref");
    expect(screen.queryByText("C:\\secret\\texture.png")).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "switch" }));
    expect(within(screen.getByRole("group", { name: "Material" })).getByRole("alert")).toHaveTextContent("The asset operation could not be completed");
  });

  it("keeps an unsaved material field through a live switch without applying", async () => {
    const user = userEvent.setup();
    const target = fixture(FIXTURE_A_ID, "Display");
    const assigned = material(MATERIAL_A_ID, "Copper");
    const patch = assignment(ASSIGNMENT_A_ID, target.id, assigned.id);
    const onApplyPatches = vi.fn(async () => undefined);
    render(<LocaleProvider preference={{ read: () => "zh-CN", write: () => undefined }}><SwitchToEnglish /><MaterialInspector
      snapshot={projectSnapshot([target], [assigned], [patch])} target={target} disabled={false}
      assetIssues={[]} assetOperationBusy={false} makeId={() => NEW_MATERIAL_ID}
      onApplyPatches={onApplyPatches} onImportTexture={async () => undefined} onError={vi.fn()}
    /></LocaleProvider>);
    const section = await openMaterialSection();
    fireEvent.change(within(section).getByLabelText("基础颜色"), { target: { value: "#abcdef" } });
    await user.click(screen.getByRole("button", { name: "switch" }));
    const english = screen.getByRole("group", { name: "Material" });
    expect(within(english).getByLabelText("Base color")).toHaveValue("#abcdef");
    expect(onApplyPatches).not.toHaveBeenCalled();
  });
});
