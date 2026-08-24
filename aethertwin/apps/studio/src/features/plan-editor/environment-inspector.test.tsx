// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneEnvironment } from "@aethertwin/core-model";
import { ProjectBackendError } from "../../backend/project-backend-error";
import { LocaleProvider } from "../../i18n/locale-provider";
import { useI18n } from "../../i18n/locale-provider";
import {
  ProjectStore,
  SandboxProjectBackend,
} from "@aethertwin/project-store";
import { PlanEditor } from "./plan-editor";
import { EnvironmentInspector } from "./environment-inspector";

vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void {}
  },
}));

const LABELS = {
  section: "\u73af\u5883",
  backgroundColor: "\u80cc\u666f\u989c\u8272",
  ambientColor: "\u73af\u5883\u5149\u989c\u8272",
  ambientIntensity: "\u73af\u5883\u5149\u5f3a\u5ea6",
  keyColor: "\u4e3b\u5149\u989c\u8272",
  keyIntensity: "\u4e3b\u5149\u5f3a\u5ea6",
  directionX: "\u4e3b\u5149\u65b9\u5411 X",
  directionY: "\u4e3b\u5149\u65b9\u5411 Y",
  directionZ: "\u4e3b\u5149\u65b9\u5411 Z",
  shadowsEnabled: "\u542f\u7528\u9634\u5f71",
  shadowSoftness: "\u9634\u5f71\u67d4\u548c\u5ea6",
  apply: "\u5e94\u7528\u73af\u5883",
  undo: "\u64a4\u9500",
  redo: "\u91cd\u505a",
  save: "\u4fdd\u5b58",
  close: "\u5173\u95ed",
} as const;

const stores: ProjectStore[] = [];

function SwitchToEnglish() {
  const { setLocale } = useI18n();
  return <button type="button" onClick={() => setLocale("en")}>switch</button>;
}

async function renderEnvironmentProject(name: string, locale: "zh-CN" | "en" = "zh-CN") {
  const backend = new SandboxProjectBackend();
  const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
  stores.push(store);
  await store.create({ name, location: "sandbox", profile: "showroom" });
  const projectPath = store.getState().projectPath!;
  const commitProject = backend.commit.bind(backend);
  const commit = vi.spyOn(backend, "commit");
  const view = render(
    <LocaleProvider preference={{ read: () => locale, write: () => undefined }}>
      <SwitchToEnglish />
      <PlanEditor
        store={store}
        backendMode="sandbox"
        dependencies={{
          assetPicker: null,
          workspace: () => <div />,
        }}
      />
    </LocaleProvider>,
  );
  const user = userEvent.setup();
  const sectionName = locale === "en" ? "Environment" : LABELS.section;
  await user.click(screen.getByText(sectionName));
  const section = screen.getByRole("group", { name: sectionName });
  return {
    backend,
    commit,
    commitProject,
    projectPath,
    section,
    store,
    user,
    view,
  };
}

function field(section: HTMLElement, label: string): HTMLInputElement {
  return within(section).getByLabelText(label) as HTMLInputElement;
}

afterEach(async () => {
  cleanup();
  const settlements = await Promise.allSettled(
    stores.splice(0).map((store) => store.dispose()),
  );
  for (const settlement of settlements) {
    expect(settlement.status).toBe("fulfilled");
  }
  vi.restoreAllMocks();
});

describe("Environment Inspector", () => {
  it("commits the complete exact before/after singleton and supports undo, redo, save, close, and reopen", async () => {
    const { commit, projectPath, section, store, user, view } =
      await renderEnvironmentProject("Environment durability");
    const before = structuredClone(store.getState().snapshot!.project.sceneEnvironment);
    const after = {
      backgroundColor: "#203040",
      ambient: { color: "#aabbcc", intensity: 4 },
      key: {
        color: "#ddeeff",
        intensity: 8,
        direction: [-100, 0, 100] as const,
      },
      shadowsEnabled: false,
      shadowSoftness: 1,
    };

    await user.click(within(section).getByRole("button", { name: LABELS.apply }));
    await act(async () => Promise.resolve());
    expect(commit).not.toHaveBeenCalled();

    fireEvent.change(field(section, LABELS.backgroundColor), {
      target: { value: after.backgroundColor },
    });
    fireEvent.change(field(section, LABELS.ambientColor), {
      target: { value: after.ambient.color },
    });
    fireEvent.change(field(section, LABELS.ambientIntensity), {
      target: { value: String(after.ambient.intensity) },
    });
    fireEvent.change(field(section, LABELS.keyColor), {
      target: { value: after.key.color },
    });
    fireEvent.change(field(section, LABELS.keyIntensity), {
      target: { value: String(after.key.intensity) },
    });
    fireEvent.change(field(section, LABELS.directionX), {
      target: { value: String(after.key.direction[0]) },
    });
    fireEvent.change(field(section, LABELS.directionY), {
      target: { value: String(after.key.direction[1]) },
    });
    fireEvent.change(field(section, LABELS.directionZ), {
      target: { value: String(after.key.direction[2]) },
    });
    await user.click(field(section, LABELS.shadowsEnabled));
    fireEvent.change(field(section, LABELS.shadowSoftness), {
      target: { value: String(after.shadowSoftness) },
    });
    await user.click(within(section).getByRole("button", { name: LABELS.apply }));

    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(commit.mock.calls[0]?.[1].journal).toEqual([
      expect.objectContaining({
        commandType: "scene.environment.patch",
        payload: { before, after },
        inversePayload: { before: after, after: before },
        action: "apply",
      }),
    ]);
    expect(store.getState().snapshot!.project.sceneEnvironment).toEqual(after);

    await user.click(screen.getByRole("button", { name: LABELS.undo }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.sceneEnvironment,
    ).toEqual(before));
    await user.click(screen.getByRole("button", { name: LABELS.redo }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.sceneEnvironment,
    ).toEqual(after));

    await user.click(screen.getByRole("button", { name: LABELS.save }));
    await waitFor(() => expect(store.getState().saveState).toBe("saved"));
    expect(store.getState().snapshot!.checkpointSequence).toBe(
      store.getState().snapshot!.sequence,
    );
    await user.click(screen.getByRole("button", { name: LABELS.close }));
    await waitFor(() => expect(store.getState().projectPath).toBeNull());
    view.unmount();

    await store.open(projectPath);
    expect(store.getState().snapshot!.project.sceneEnvironment).toEqual(after);
  });

  it("keeps invalid color and bounded-number drafts in the UI without publishing a command", async () => {
    const { commit, section, store, user } = await renderEnvironmentProject(
      "Environment validation",
    );
    const before = structuredClone(store.getState().snapshot!.project.sceneEnvironment);
    const invalid = [
      [LABELS.backgroundColor, "#123"],
      [LABELS.ambientColor, "not-a-color"],
      [LABELS.ambientIntensity, "4.1"],
      [LABELS.keyColor, "#abcd"],
      [LABELS.keyIntensity, "8.1"],
      [LABELS.directionX, "101"],
      [LABELS.shadowSoftness, "1.1"],
    ] as const;
    for (const [label, value] of invalid) {
      fireEvent.change(field(section, label), { target: { value } });
    }

    await user.click(within(section).getByRole("button", { name: LABELS.apply }));

    for (const [label, value] of invalid) {
      expect(field(section, label)).toHaveValue(value);
      expect(field(section, label)).toHaveAttribute("aria-invalid", "true");
    }
    expect(within(section).getByRole("alert")).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
    expect(store.getState().snapshot!.project.sceneEnvironment).toEqual(before);
  });

  it("rejects an all-zero key direction while preserving the three direction drafts", async () => {
    const { commit, section, store, user } = await renderEnvironmentProject(
      "Environment direction",
    );
    const before = structuredClone(store.getState().snapshot!.project.sceneEnvironment);
    for (const label of [LABELS.directionX, LABELS.directionY, LABELS.directionZ]) {
      fireEvent.change(field(section, label), { target: { value: "0" } });
    }

    await user.click(within(section).getByRole("button", { name: LABELS.apply }));

    for (const label of [LABELS.directionX, LABELS.directionY, LABELS.directionZ]) {
      expect(field(section, label)).toHaveValue("0");
      expect(field(section, label)).toHaveAttribute("aria-invalid", "true");
    }
    expect(within(section).getByRole("alert")).toHaveTextContent(
      "\u4e3b\u5149\u65b9\u5411\u4e0d\u80fd\u5168\u4e3a 0",
    );
    expect(commit).not.toHaveBeenCalled();
    expect(store.getState().snapshot!.project.sceneEnvironment).toEqual(before);
  });
  it("clears a failed environment action when an unchanged draft succeeds on retry", async () => {
    const { commit, commitProject, section, store, user } =
      await renderEnvironmentProject("Environment retry");
    const failure = new ProjectBackendError("ASSET_IO_FAILED", "C:\\secret\\environment.json", { path: "C:\\secret\\environment.json" }, "environment-safe-ref");
    commit.mockRejectedValueOnce(failure).mockImplementation(commitProject);
    fireEvent.change(field(section, LABELS.backgroundColor), {
      target: { value: "#203040" },
    });

    await user.click(within(section).getByRole("button", { name: LABELS.apply }));
    expect(store.getState().snapshot!.project.sceneEnvironment.backgroundColor)
      .toBe("#101820");

    await user.click(within(section).getByRole("button", { name: LABELS.apply }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.sceneEnvironment.backgroundColor,
    ).toBe("#203040"));
    expect(screen.queryByText("environment-safe-ref")).not.toBeInTheDocument();
  });

  it("reformats environment controls in English without publishing a patch", async () => {
    const { commit, section } = await renderEnvironmentProject("Environment English", "en");
    expect(within(section).getByLabelText("Background color")).toBeVisible();
    expect(within(section).getByLabelText("Key light direction X")).toBeVisible();
    expect(within(section).getByRole("button", { name: "Reset" })).toBeVisible();
    expect(within(section).getByRole("button", { name: "Apply environment" })).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps unsaved environment edits through a live switch without committing", async () => {
    const { commit, section, user } = await renderEnvironmentProject("Environment switch");
    fireEvent.change(field(section, LABELS.backgroundColor), { target: { value: "#203040" } });
    await user.click(screen.getByRole("button", { name: "switch" }));
    const english = screen.getByRole("group", { name: "Environment" });
    expect(field(english, "Background color")).toHaveValue("#203040");
    expect(commit).not.toHaveBeenCalled();
  });

  it("redacts a real environment backend failure in Chinese and after switching to English", async () => {
    const user = userEvent.setup();
    const environment: SceneEnvironment = {
      backgroundColor: "#101820", ambient: { color: "#dce8f0", intensity: 0.55 },
      key: { color: "#fff1dc", intensity: 1.1, direction: [4, 8, 5] },
      shadowsEnabled: true, shadowSoftness: 0.5,
    };
    const onError = vi.fn();
    render(<LocaleProvider preference={{ read: () => "zh-CN", write: () => undefined }}><SwitchToEnglish /><EnvironmentInspector environment={environment} onError={onError}
      onApplyPatch={async () => { throw new ProjectBackendError("ASSET_IO_FAILED", "C:\\secret\\environment.json", { path: "C:\\secret\\environment.json" }, "environment-safe-ref"); }} />
    </LocaleProvider>);
    await user.click(screen.getByText("环境"));
    fireEvent.change(screen.getByLabelText("背景颜色"), { target: { value: "#203040" } });
    await user.click(screen.getByRole("button", { name: "应用环境" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("environment-safe-ref");
    expect(screen.queryByText("C:\\secret\\environment.json")).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The asset operation could not be completed");
  });

});
