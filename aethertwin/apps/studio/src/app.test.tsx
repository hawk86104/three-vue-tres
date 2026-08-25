// @vitest-environment jsdom

import type { ProjectExportBackend, ProjectExportOperation } from "@aethertwin/exporter";
import type * as ProjectStoreModule from "@aethertwin/project-store";
import { SandboxProjectBackend, type ProjectBackend } from "@aethertwin/project-store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const observations = vi.hoisted(() => ({
  projectBackends: [] as unknown[],
  planEditorProps: [] as Array<Record<string, unknown>>,
  projectStores: [] as unknown[],
  disposedStores: [] as unknown[],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

vi.mock("@aethertwin/project-store", async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectStoreModule>();
  class ObservedProjectStore extends actual.ProjectStore {
    constructor(backend: ProjectBackend) {
      observations.projectBackends.push(backend);
      super(backend);
      observations.projectStores.push(this);
    }

    override async dispose(): Promise<void> {
      observations.disposedStores.push(this);
      await super.dispose();
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
  cleanup();
  observations.projectBackends.length = 0;
  observations.planEditorProps.length = 0;
  observations.projectStores.length = 0;
  observations.disposedStores.length = 0;
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

  it("awaits the published export cancellation barrier before disposing the store", async () => {
    const projectBackend = new SandboxProjectBackend();
    const exportBackend = exportBackendStub();
    let resolveCancellation!: () => void;
    const cancellationGate = new Promise<void>((resolve) => {
      resolveCancellation = resolve;
    });
    const cancel = vi.fn(() => cancellationGate);
    const operation: ProjectExportOperation = {
      cancel,
      result: new Promise<never>(() => undefined),
    };

    const rendered = render(<App backend={projectBackend} exportBackend={exportBackend} />);
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    await screen.findByTestId("plan-editor");
    const currentStore = observations.projectStores.at(-1);
    if (currentStore === undefined) throw new Error("Expected the active ProjectStore");

    const publishOperation = observations.planEditorProps.at(-1)?.onExportOperationChange;
    if (typeof publishOperation !== "function") {
      throw new Error("Expected PlanEditor export-operation publication callback");
    }
    publishOperation(operation);
    rendered.unmount();

    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(observations.disposedStores).not.toContain(currentStore);

    resolveCancellation();
    await waitFor(() => expect(observations.disposedStores).toContain(currentStore));
  });

  it("injects export-result actions only for a desktop backend with both audited capabilities", async () => {
    const openExportResult = vi.fn();
    const revealExportResult = vi.fn();
    const projectBackend = Object.assign(new SandboxProjectBackend(), {
      mode: "desktop" as const,
      openExportResult,
      revealExportResult,
    }) as unknown as ProjectBackend;

    render(<App backend={projectBackend} exportBackend={exportBackendStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    await screen.findByTestId("plan-editor");

    const dependencies = observations.planEditorProps.at(-1)?.dependencies as {
      exportResultActions?: { open: (result: { relativePath: string }) => Promise<void>; reveal: (result: { relativePath: string }) => Promise<void> };
    };
    expect(dependencies.exportResultActions).toBeDefined();
    await dependencies.exportResultActions!.open({ relativePath: "exports/result.png" });
    await dependencies.exportResultActions!.reveal({ relativePath: "exports/result.png" });
    expect(openExportResult).toHaveBeenCalledWith(
      "sandbox://00000000-0000-4000-8000-000000000001", "exports/result.png",
    );
    expect(revealExportResult).toHaveBeenCalledWith(
      "sandbox://00000000-0000-4000-8000-000000000001", "exports/result.png",
    );
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
