import type { PlanReference, ProjectSnapshot } from "@aethertwin/core-model";
import { Button, StatusNotice } from "@aethertwin/design-system";
import type { AssetImportProgress, ProjectStoreState } from "@aethertwin/project-store";

const stageLabels: Readonly<Record<AssetImportProgress["stage"], string>> = {
  capture: "\u6b63\u5728\u8bfb\u53d6\u6587\u4ef6",
  validate: "\u6b63\u5728\u9a8c\u8bc1\u683c\u5f0f",
  hash: "\u6b63\u5728\u8ba1\u7b97\u6307\u7eb9",
  publish: "\u6b63\u5728\u53d1\u5e03\u8d44\u4ea7",
  complete: "\u5bfc\u5165\u5b8c\u6210",
};

const issueLabels: Readonly<Record<ProjectStoreState["assetIssues"][number]["code"], string>> = {
  ASSET_MISSING: "\u8d44\u4ea7\u5df2\u4e22\u5931",
  ASSET_CORRUPT: "\u8d44\u4ea7\u5df2\u635f\u574f",
  ASSET_CODEC_PREVIEW_UNAVAILABLE: "\u9884\u89c8\u4e0d\u53ef\u7528",
};

function mediaLabel(snapshot: ProjectSnapshot, reference: PlanReference): string {
  const mediaType = snapshot.assets.find(({ id }) => id === reference.assetId)?.mediaType;
  if (mediaType === "image/png") return "PNG";
  if (mediaType === "image/jpeg") return "JPEG";
  if (mediaType === "image/svg+xml") return "SVG";
  return "Image";
}

function formattedBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
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
  const issueByAssetId = new Map(assetIssues.map((issue) => [issue.assetId, issue]));
  const references = snapshot.project.planReferences;

  return (
    <section className="studio-asset-library" role="region" aria-label={"\u8d44\u4ea7\u5e93"}>
      <div className="studio-asset-library__heading">
        <div>
          <h2>{"\u8d44\u4ea7\u5e93"}</h2>
          <p>{"\u5e73\u9762\u53c2\u8003"}</p>
        </div>
        <Button
          variant="secondary"
          disabled={importDisabled}
          onClick={(event) => onImport(event.currentTarget)}
        >
          {"\u5bfc\u5165\u5e73\u9762\u56fe"}
        </Button>
      </div>

      {progress === null ? null : (
        <StatusNotice className="studio-asset-library__progress" tone="info">
          <strong>{stageLabels[progress.stage]}</strong>
          <progress
            aria-label={"\u5bfc\u5165\u8fdb\u5ea6"}
            max={Math.max(progress.totalBytes, 1)}
            value={Math.min(progress.completedBytes, Math.max(progress.totalBytes, 1))}
          />
          <span>
            {formattedBytes(progress.completedBytes)} / {formattedBytes(progress.totalBytes)}
          </span>
          <Button variant="ghost" onClick={onCancel}>
            {"\u53d6\u6d88\u5bfc\u5165"}
          </Button>
        </StatusNotice>
      )}

      {references.length === 0 ? (
        <p className="studio-asset-library__empty">
          {"\u5c1a\u672a\u5bfc\u5165\u5e73\u9762\u53c2\u8003"}
        </p>
      ) : (
        <ul className="studio-asset-library__list" aria-label={"\u5e73\u9762\u53c2\u8003"}>
          {references.map((reference) => {
            const issue = issueByAssetId.get(reference.assetId);
            const selected = selectedIds.has(reference.id);
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
                  aria-label={`${"\u9009\u62e9\u53c2\u8003"} ${reference.name}`}
                  onClick={() => onSelect(reference.id)}
                >
                  <strong>{reference.name}</strong>
                  <span>{mediaLabel(snapshot, reference)}</span>
                </button>
                <dl className="studio-asset-library__metadata">
                  <div>
                    <dt>{"\u6807\u5b9a"}</dt>
                    <dd>{reference.calibration === null ? "\u672a\u6821\u51c6" : "\u5df2\u6821\u51c6"}</dd>
                  </div>
                  <div>
                    <dt>{"\u9501\u5b9a"}</dt>
                    <dd>{reference.locked ? "\u5df2\u9501\u5b9a" : "\u672a\u9501\u5b9a"}</dd>
                  </div>
                </dl>
                {issue === undefined ? null : (
                  <div className="studio-asset-library__issue" data-issue-code={issue.code}>
                    <StatusNotice tone="error">{issueLabels[issue.code]}</StatusNotice>
                    {(issue.code === "ASSET_MISSING" || issue.code === "ASSET_CORRUPT") ? (
                      <Button
                        variant="secondary"
                        disabled={importDisabled}
                        aria-label={`${"\u91cd\u65b0\u5bfc\u5165"} ${reference.name}`}
                        onClick={(event) => onReimport(reference, event.currentTarget)}
                      >
                        {"\u91cd\u65b0\u5bfc\u5165"}
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
