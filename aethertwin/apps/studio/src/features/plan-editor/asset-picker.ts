import { open as openPlanDialog } from "@tauri-apps/plugin-dialog";
import type { AssetImportRequest } from "@aethertwin/project-store";

export type PlanAssetSource = AssetImportRequest["source"];
export type PlanAssetRole = AssetImportRequest["role"];

export interface PlanAssetPicker {
  pick(role?: PlanAssetRole): Promise<PlanAssetSource | null>;
}

const roleOptions = {
  "plan-reference": {
    accept: ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml",
    filter: { name: "\u5e73\u9762\u56fe", extensions: ["png", "jpg", "jpeg", "svg"] },
  },
  "content-image": {
    accept: ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml",
    filter: { name: "\u4ea7\u54c1\u56fe\u7247", extensions: ["png", "jpg", "jpeg", "svg"] },
  },
  "material-texture": {
    accept: ".png,.jpg,.svg",
    filter: { name: "\u6750\u8d28\u7eb9\u7406", extensions: ["png", "jpg", "svg"] },
  },
  "content-video": {
    accept: ".mp4,.webm,video/mp4,video/webm",
    filter: { name: "\u4ea7\u54c1\u89c6\u9891", extensions: ["mp4", "webm"] },
  },
} satisfies Record<PlanAssetRole, {
  readonly accept: string;
  readonly filter: { readonly name: string; readonly extensions: readonly string[] };
}>;

function displayNameFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

export function createDesktopPlanAssetPicker(
  openDialog: typeof openPlanDialog = openPlanDialog,
): PlanAssetPicker {
  return Object.freeze({
    async pick(
      role: PlanAssetRole = "plan-reference",
    ): Promise<PlanAssetSource | null> {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        filters: [roleOptions[role].filter],
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
    pick(role: PlanAssetRole = "plan-reference"): Promise<PlanAssetSource | null> {
      return new Promise((resolve) => {
        const input = ownerDocument.createElement("input");
        input.type = "file";
        input.accept = roleOptions[role].accept;
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
