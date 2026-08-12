import type { ProjectExportBackend } from "@aethertwin/exporter";
import type { ProjectBackend } from "@aethertwin/project-store";

export type ForcedBackend = "desktop" | "sandbox" | undefined;
export interface StudioBackendSelection {
  readonly projectBackend: ProjectBackend;
  readonly exportBackend: ProjectExportBackend | null;
}


export async function selectBackend(force?: ForcedBackend): Promise<StudioBackendSelection> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (force === "desktop" || isTauri) {
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    return Object.freeze({ projectBackend: backend, exportBackend: backend });
  }
  if (import.meta.env.DEV) {
    const { SandboxProjectBackend } = await import("@aethertwin/project-store");
    return Object.freeze({
      projectBackend: new SandboxProjectBackend(),
      exportBackend: null,
    });
  }
  throw new Error(force === "sandbox" ? "WEB_SANDBOX_DISABLED" : "TAURI_RUNTIME_REQUIRED");
}
