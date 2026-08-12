import { parseProjectExportPreset } from "@aethertwin/exporter";
import type {
  ProjectExportPreset,
  ProjectExportProgress,
  ProjectExportResult,
} from "@aethertwin/exporter";
import { useEffect } from "react";

export type StudioExportScope = Readonly<{
  sessionId: string;
  sessionGeneration: number;
  projectPath: string;
  projectId: string;
  floorId: string;
  rendererGeneration: number;
}>;

export type StudioExportState =
  | Readonly<{ kind: "idle"; preset: ProjectExportPreset }>
  | Readonly<{
      kind: "running";
      preset: ProjectExportPreset;
      progress: ProjectExportProgress;
    }>
  | Readonly<{
      kind: "failed";
      preset: ProjectExportPreset;
      code: string;
      message: string;
    }>
  | Readonly<{
      kind: "succeeded";
      preset: ProjectExportPreset;
      result: ProjectExportResult;
    }>;

export type ExportPanelProps = Readonly<{
  state: StudioExportState;
  ultraHdDisabledReason: string | null;
  textureIssueAssetIds: readonly string[];
  onPresetChange: (preset: ProjectExportPreset) => void;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
  onExportAgain: () => void;
}>;

function progressText(progress: ProjectExportProgress): string {
  switch (progress.phase) {
    case "preparing-textures":
      return "Preparing textures";
    case "rendering":
      return "Rendering";
    case "uploading":
      return `Uploading ${progress.sentBytes ?? 0} / ${progress.totalBytes ?? 0} bytes`;
    case "encoding-publishing":
      return "Encoding and publishing";
  }
}

export function ExportPanel({
  state,
  ultraHdDisabledReason,
  textureIssueAssetIds,
  onPresetChange,
  onStart,
  onCancel,
  onClose,
  onExportAgain,
}: ExportPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isRunning = state.kind === "running";
  const isFailed = state.kind === "failed";
  const isSucceeded = state.kind === "succeeded";
  const sortedTextureIssueAssetIds = [...textureIssueAssetIds].sort();
  const hasTextureIssues = sortedTextureIssueAssetIds.length > 0;

  return (
    <aside className="studio-export-panel" aria-label="Export PNG">
      {isSucceeded ? (
        <>
          <p>{state.result.relativePath}</p>
          <p>{`${state.result.width} x ${state.result.height}`}</p>
          <p>{state.result.byteSize}</p>
          <p>{state.result.sha256}</p>
          <button type="button" onClick={onExportAgain}>
            Export Again
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      ) : isFailed ? (
        <>
          <p>{state.code}</p>
          <p>{state.message}</p>
          <button type="button" onClick={onExportAgain}>
            Export Again
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      ) : (
        <>
          <label>
            PNG resolution
            <select
              aria-label="PNG resolution"
              disabled={isRunning}
              value={state.preset}
              onChange={(event) => {
                const preset = parseProjectExportPreset(event.currentTarget.value);
                if (preset === "ultra-hd" && ultraHdDisabledReason !== null) return;
                onPresetChange(preset);
              }}
            >
              <option value="full-hd">Full HD - 1920 x 1080</option>
              <option value="ultra-hd" disabled={ultraHdDisabledReason !== null}>
                Ultra HD - 3840 x 2160
              </option>
            </select>
          </label>
          {ultraHdDisabledReason !== null ? <p>{ultraHdDisabledReason}</p> : null}
          {hasTextureIssues ? (
            <ul>
              {sortedTextureIssueAssetIds.map((assetId) => (
                <li key={assetId}>{assetId}</li>
              ))}
            </ul>
          ) : null}
          {isRunning ? (
            <>
              <p role="status">{progressText(state.progress)}</p>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={hasTextureIssues} onClick={onStart}>
                Export PNG
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}
