import { SandboxProjectBackend, type ProjectBackend } from "@aethertwin/project-store";

export type ForcedBackend = "sandbox" | undefined;
export type StudioBackend = ProjectBackend & { readonly mode: "sandbox" };

export function selectBackend(_force?: ForcedBackend): StudioBackend {
  return new SandboxProjectBackend();
}
