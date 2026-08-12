// @vitest-environment jsdom

import type { ProjectExportBackend } from "@aethertwin/exporter";
import { SandboxProjectBackend, type ProjectBackend } from "@aethertwin/project-store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const observations = vi.hoisted(() => ({
  projectBackends: [] as unknown[],
  planEditorProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

vi.mock("@aethertwin/project-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aethertwin/project-store")>();
  class ObservedProjectStore extends actual.ProjectStore {
    constructor(backend: ProjectBackend) {
      observations.projectBackends.push(backend);
      super(backend);
    }
  }
  return { ...actual, ProjectStore: ObservedProjectStore };
});

vi.mock("./features/project-center/project-center", () => ({
  ProjectCenter: ({ onStartCreate }: {
    readonly onStartCreate: (profile: "showroom") => void;
  }) => <button onClick={() => onStartCreate("showroom")}>start</button>,
}));

vi.mock("./features/project-center/create-project-dialog", () => ({
  CreateProjectDialog: ({ open, onCreate }: {
    readonly open: boolean;
    readonly onCreate: (
      name: string,
      profile: "showroom",
      selectedLocation?: string,
    ) => Promise<void>;
  }) => open
    ? <button onClick={() => void onCreate("Demo", "showroom", "sandbox")}>create</button>
    : null,
}));

vi.mock("./features/plan-editor/plan-editor", () => ({
  PlanEditor: (props: Record<string, unknown>) => {
    observations.planEditorProps.push(props);
    return <div data-testid="plan-editor" />;
  },
}));

afterEach(() => {
  observations.projectBackends.length = 0;
  observations.planEditorProps.length = 0;
});

describe("App backend capability injection", () => {
  it.each([
    ["an explicit export backend", false],
    ["no export backend", true],
  ] as const)("passes %s separately and never casts ProjectBackend", async (_label, useNull) => {
    const projectBackend = Object.assign(new SandboxProjectBackend(), exportBackendStub());
    const explicitExportBackend = exportBackendStub();
    const exportBackend = useNull ? null : explicitExportBackend;

    render(<App backend={projectBackend} exportBackend={exportBackend} />);
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    await screen.findByTestId("plan-editor");

    expect(observations.projectBackends).toEqual([projectBackend]);
    await waitFor(() => expect(observations.planEditorProps).not.toHaveLength(0));
    expect(observations.planEditorProps.at(-1)).toMatchObject({ exportBackend });
    if (useNull) {
      expect(observations.planEditorProps.at(-1)?.exportBackend).not.toBe(projectBackend);
    }
  });
});

function exportBackendStub(): ProjectExportBackend {
  return {
    begin: vi.fn(),
    writeChunk: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
  };
}
