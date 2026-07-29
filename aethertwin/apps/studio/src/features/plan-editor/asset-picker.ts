import { open as openPlanDialog } from "@tauri-apps/plugin-dialog";
import type { AssetImportRequest } from "@aethertwin/project-store";

export type PlanAssetSource = AssetImportRequest["source"];

export interface PlanAssetPicker {
  pick(): Promise<PlanAssetSource | null>;
}

const PLAN_ACCEPT = ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml";

function displayNameFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

export function createDesktopPlanAssetPicker(
  openDialog: typeof openPlanDialog = openPlanDialog,
): PlanAssetPicker {
  return Object.freeze({
    async pick(): Promise<PlanAssetSource | null> {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        filters: [{
          name: "\u5e73\u9762\u56fe",
          extensions: ["png", "jpg", "jpeg", "svg"],
        }],
      });
      if (typeof selected !== "string") return null;
      return Object.freeze({
        kind: "native-path" as const,
        path: selected,
        displayName: displayNameFromPath(selected),
      });
    },
  });
}

export function createSandboxPlanAssetPicker(
  ownerDocument: Document = document,
): PlanAssetPicker {
  return Object.freeze({
    pick(): Promise<PlanAssetSource | null> {
      return new Promise((resolve) => {
        const input = ownerDocument.createElement("input");
        input.type = "file";
        input.accept = PLAN_ACCEPT;
        input.tabIndex = -1;
        input.hidden = true;
        input.setAttribute("aria-hidden", "true");

        let settled = false;
        const finish = (source: PlanAssetSource | null): void => {
          if (settled) return;
          settled = true;
          input.removeEventListener("change", changed);
          input.removeEventListener("cancel", cancelled);
          input.remove();
          resolve(source);
        };
        const changed = (): void => {
          const file = input.files?.[0];
          finish(file === undefined
            ? null
            : Object.freeze({
                kind: "sandbox-blob" as const,
                blob: file,
                displayName: file.name,
              }));
        };
        const cancelled = (): void => finish(null);

        input.addEventListener("change", changed, { once: true });
        input.addEventListener("cancel", cancelled, { once: true });
        ownerDocument.body.append(input);
        input.click();
      });
    },
  });
}
