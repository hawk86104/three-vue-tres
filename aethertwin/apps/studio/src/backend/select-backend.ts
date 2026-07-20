import { SandboxProjectBackend, type ProjectBackend } from "@aethertwin/project-store";

export type ForcedBackend = "sandbox" | undefined;

export function selectBackend(_force?: ForcedBackend): ProjectBackend {
  return new SandboxProjectBackend();
}
