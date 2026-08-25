import { parseProjectExportPreset } from "@aethertwin/exporter";
import type {
  ProjectExportPreset,
  ProjectExportProgress,
  ProjectExportResult,
} from "@aethertwin/exporter";
import { useEffect } from "react";
import { EXPORT_PHASE_MESSAGE_IDS, EXPORT_PRESET_MESSAGE_IDS } from "../../i18n/display-message-ids";
import { EXPORT_DISABLED_REASON_MESSAGE_IDS } from "../../i18n/display-message-ids";
import { localizedErrorDescriptor } from "../../i18n/localized-error";
import { useI18n } from "../../i18n/locale-provider";

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
      logRef?: string | null;
    }>
  | Readonly<{
      kind: "succeeded";
      preset: ProjectExportPreset;
      result: ProjectExportResult;
    }>;

export type ExportDisabledReason = keyof typeof EXPORT_DISABLED_REASON_MESSAGE_IDS;

export type ExportPanelProps = Readonly<{
  state: StudioExportState;
  ultraHdDisabledReason: ExportDisabledReason | null;
  textureIssueAssetIds: readonly string[];
  onPresetChange: (preset: ProjectExportPreset) => void;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
  onExportAgain: () => void;
}>;

function progressText(
  progress: ProjectExportProgress,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (progress.phase) {
    case "preparing-textures":
      return t(EXPORT_PHASE_MESSAGE_IDS[progress.phase]);
    case "rendering":
      return t(EXPORT_PHASE_MESSAGE_IDS[progress.phase]);
    case "uploading":
      return t(EXPORT_PHASE_MESSAGE_IDS[progress.phase], {
        sent: progress.sentBytes ?? 0,
        total: progress.totalBytes ?? 0,
      });
    case "encoding-publishing":
      return t(EXPORT_PHASE_MESSAGE_IDS[progress.phase]);
  }
}

function safeLogRef(value: string | null | undefined): string | null {
  return value !== null
    && value !== undefined
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? value
    : null;
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
  const { t } = useI18n();
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
    <aside className="studio-export-panel" aria-label={t("export.panel.label")}>
      {isSucceeded ? (
        <>
          <p>{t("export.result.path")}: {state.result.relativePath}</p>
          <p>{t("export.result.dimensions", { width: state.result.width, height: state.result.height })}</p>
          <p>{t("export.result.bytes", { value: state.result.byteSize })}</p>
          <p>{t("export.result.checksum")}: {state.result.sha256}</p>
          <button type="button" onClick={onExportAgain}>
            {t("export.again")}
          </button>
          <button type="button" onClick={onClose}>
            {t("export.close")}
          </button>
        </>
      ) : isFailed ? (
        <>
          <p data-error-code={state.code}>{t(localizedErrorDescriptor({ code: state.code }).id)}</p>
          {safeLogRef(state.logRef) === null ? null : (
            <p>{t("error.diagnosticReference", { logRef: safeLogRef(state.logRef)! })}</p>
          )}
          <button type="button" onClick={onExportAgain}>
            {t("export.again")}
          </button>
          <button type="button" onClick={onClose}>
            {t("export.close")}
          </button>
        </>
      ) : (
        <>
          <label>
            {t("export.resolution")}
            <select
              aria-label={t("export.resolution")}
              disabled={isRunning}
              value={state.preset}
              onChange={(event) => {
                const preset = parseProjectExportPreset(event.currentTarget.value);
                if (preset === "ultra-hd" && ultraHdDisabledReason !== null) return;
                onPresetChange(preset);
              }}
            >
              <option value="full-hd">{t(EXPORT_PRESET_MESSAGE_IDS["full-hd"])}</option>
              <option value="ultra-hd" disabled={ultraHdDisabledReason !== null}>
                {t(EXPORT_PRESET_MESSAGE_IDS["ultra-hd"])}
              </option>
            </select>
          </label>
          {ultraHdDisabledReason !== null ? <p>{t(EXPORT_DISABLED_REASON_MESSAGE_IDS[ultraHdDisabledReason])}</p> : null}
          {hasTextureIssues ? (
            <ul>
              {sortedTextureIssueAssetIds.map((assetId) => (
                <li key={assetId}>{assetId}</li>
              ))}
            </ul>
          ) : null}
          {isRunning ? (
            <>
              <p role="status">{progressText(state.progress, t)}</p>
              <button type="button" onClick={onCancel}>
                {t("export.cancel")}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={hasTextureIssues} onClick={onStart}>
                {t("export.panel.label")}
              </button>
              <button type="button" onClick={onClose}>
                {t("export.close")}
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}
