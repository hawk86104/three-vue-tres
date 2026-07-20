import type { ProjectBackend } from "@aethertwin/project-store";

export type ForcedBackend = "desktop" | "sandbox" | undefined;

export async function selectBackend(force?: ForcedBackend): Promise<ProjectBackend> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (force === "desktop" || isTauri) {
    const { TauriProjectBackend } = await import("./tauri-backend");
    return new TauriProjectBackend();
  }
  if (import.meta.env.DEV) {
    const { SandboxProjectBackend } = await import("@aethertwin/project-store");
    return new SandboxProjectBackend();
  }
  throw new Error(force === "sandbox" ? "WEB_SANDBOX_DISABLED" : "TAURI_RUNTIME_REQUIRED");
}
