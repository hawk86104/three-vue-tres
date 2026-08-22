import type { PlanReference, ProjectSnapshot } from "@aethertwin/core-model";
import { Button, StatusNotice } from "@aethertwin/design-system";
import type { AssetImportProgress, ProjectStoreState } from "@aethertwin/project-store";
import { useDisplayName } from "../../i18n/display-name-provider";
import type { StudioTranslator } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";

function stageLabel(stage: AssetImportProgress["stage"], t: StudioTranslator): string {
  if (stage === "capture") return t("asset.importStage.capture");
  if (stage === "validate") return t("asset.importStage.validate");
  if (stage === "hash") return t("asset.importStage.hash");
  if (stage === "publish") return t("asset.importStage.publish");
  return t("asset.importStage.complete");
}

function issueLabel(
  code: ProjectStoreState["assetIssues"][number]["code"],
  t: StudioTranslator,
): string {
  if (code === "ASSET_MISSING") return t("asset.issueMissing");
  if (code === "ASSET_CORRUPT") return t("asset.issueCorrupt");
  return t("asset.issuePreviewUnavailable");
}

function mediaLabel(snapshot: ProjectSnapshot, reference: PlanReference, t: StudioTranslator): string {
  const mediaType = snapshot.assets.find(({ id }) => id === reference.assetId)?.mediaType;
  if (mediaType === "image/png") return t("asset.media.png");
  if (mediaType === "image/jpeg") return t("asset.media.jpeg");
  if (mediaType === "image/svg+xml") return t("asset.media.svg");
  return t("asset.media.image");
}

function formattedBytes(value: number, t: StudioTranslator): string {
  if (!Number.isFinite(value) || value <= 0) return t("asset.bytes", { value: "0" });
  if (value < 1024) return t("asset.bytes", { value: String(value) });
  return t("asset.kib", { value: (value / 1024).toFixed(1) });
}

export interface AssetLibraryProps {
  readonly snapshot: ProjectSnapshot;
  readonly assetIssues: ProjectStoreState["assetIssues"];
  readonly selectedIds: ReadonlySet<string>;
  readonly progress: AssetImportProgress | null;
  readonly importDisabled: boolean;
  readonly onImport: (initiator: HTMLButtonElement) => void;
  readonly onCancel: () => void;
  readonly onSelect: (referenceId: string) => void;
  readonly onReimport: (reference: PlanReference, initiator: HTMLButtonElement) => void;
}

export function AssetLibrary({
  snapshot,
  assetIssues,
  selectedIds,
  progress,
  importDisabled,
  onImport,
  onCancel,
  onSelect,
  onReimport,
}: AssetLibraryProps) {
  const { t } = useI18n();
  const displayName = useDisplayName();
  const issueByAssetId = new Map(assetIssues.map((issue) => [issue.assetId, issue]));
  const references = snapshot.project.planReferences;

  return (
    <section className="studio-asset-library" role="region" aria-label={t("asset.library")}>
      <div className="studio-asset-library__heading">
        <div>
          <h2>{t("asset.library")}</h2>
          <p>{t("asset.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          disabled={importDisabled}
          onClick={(event) => onImport(event.currentTarget)}
        >
          {t("asset.import")}
        </Button>
      </div>

      {progress === null ? null : (
        <StatusNotice className="studio-asset-library__progress" tone="info">
          <strong>{stageLabel(progress.stage, t)}</strong>
          <progress
            aria-label={t("asset.importProgress")}
            max={Math.max(progress.totalBytes, 1)}
            value={Math.min(progress.completedBytes, Math.max(progress.totalBytes, 1))}
          />
          <span>
            {t("asset.progressValue", {
              completed: formattedBytes(progress.completedBytes, t),
              total: formattedBytes(progress.totalBytes, t),
            })}
          </span>
          <Button variant="ghost" onClick={onCancel}>
            {t("asset.cancelImport")}
          </Button>
        </StatusNotice>
      )}

      {references.length === 0 ? (
        <p className="studio-asset-library__empty">
          {t("asset.empty")}
        </p>
      ) : (
        <ul className="studio-asset-library__list" aria-label={t("asset.references")}>
          {references.map((reference) => {
            const issue = issueByAssetId.get(reference.assetId);
            const selected = selectedIds.has(reference.id);
            const name = displayName({
              kind: "plan-reference",
              id: reference.id,
              authoredName: reference.name,
            });
            return (
              <li
                key={reference.id}
                className={selected
                  ? "studio-asset-library__item studio-asset-library__item--selected"
                  : "studio-asset-library__item"}
                data-plan-reference-id={reference.id}
              >
                <button
                  type="button"
                  className="studio-asset-library__select"
                  aria-pressed={selected}
                  aria-label={t("asset.selectReference", { name })}
                  onClick={() => onSelect(reference.id)}
                >
                  <strong>{name}</strong>
                  <span>{mediaLabel(snapshot, reference, t)}</span>
                </button>
                <dl className="studio-asset-library__metadata">
                  <div>
                    <dt>{t("asset.calibration")}</dt>
                    <dd>{reference.calibration === null ? t("asset.unscaled") : t("asset.calibrated")}</dd>
                  </div>
                  <div>
                    <dt>{t("asset.lock")}</dt>
                    <dd>{reference.locked ? t("asset.locked") : t("asset.unlocked")}</dd>
                  </div>
                </dl>
                {issue === undefined ? null : (
                  <div className="studio-asset-library__issue" data-issue-code={issue.code}>
                    <StatusNotice tone="error">{issueLabel(issue.code, t)}</StatusNotice>
                    {(issue.code === "ASSET_MISSING" || issue.code === "ASSET_CORRUPT") ? (
                      <Button
                        variant="secondary"
                        disabled={importDisabled}
                        aria-label={t("asset.retryImport", { name })}
                        onClick={(event) => onReimport(reference, event.currentTarget)}
                      >
                        {t("asset.retryImport", { name })}
                      </Button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
