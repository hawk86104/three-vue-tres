import type {
  Fixture,
  MediaAsset,
  PointOfInterest,
  ProductContent,
} from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { reorderProductMedia } from "@aethertwin/plan-engine";
import type {
  ProjectAssetSource,
  ProjectStoreState,
} from "@aethertwin/project-store";
import { useEffect, useState, type Ref } from "react";
import { useI18n } from "../../i18n/locale-provider";
import { useDisplayName } from "../../i18n/display-name-provider";
import { type StudioMessageDescriptor } from "../../i18n/format-message";
import { localizedErrorDescriptor, localizedErrorLogRef } from "../../i18n/localized-error";

export type ProductMediaRole = "content-image" | "content-video";
type AssetIssue = ProjectStoreState["assetIssues"][number];
interface SafeFailure { readonly descriptor: StudioMessageDescriptor; readonly logRef: string | null }

export interface ContentInspectorProps {
  readonly content: ProductContent;
  readonly target: Fixture | PointOfInterest;
  readonly media: readonly MediaAsset[];
  readonly assetIssues: readonly AssetIssue[];
  readonly onPatch: (
    before: ProductContent,
    after: ProductContent,
  ) => Promise<void>;
  readonly onImport: (
    role: ProductMediaRole,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly onRepair: (
    media: MediaAsset,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly resolveAsset: (assetId: string) => Promise<ProjectAssetSource>;
  readonly disabled?: boolean;
  readonly assetOperationBusy?: boolean;
  readonly importImageButtonRef?: Ref<HTMLButtonElement> | undefined;
}

function parsedTags(value: string): readonly string[] {
  return [...new Set(
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  )];
}

function ContentPreview({
  media,
  issue,
  resolveAsset,
}: {
  readonly media: MediaAsset;
  readonly issue: AssetIssue | undefined;
  readonly resolveAsset: (assetId: string) => Promise<ProjectAssetSource>;
}) {
  const { format, t } = useI18n();
  const displayName = useDisplayName();
  const [source, setSource] = useState<ProjectAssetSource | null>(null);
  const [failed, setFailed] = useState(false);
  const unavailable = issue?.code === "ASSET_MISSING"
    || issue?.code === "ASSET_CORRUPT";
  const codecUnavailable = issue?.code === "ASSET_CODEC_PREVIEW_UNAVAILABLE";

  useEffect(() => {
    let current = true;
    setSource(null);
    setFailed(false);
    if (unavailable || codecUnavailable) return () => {
      current = false;
    };
    void resolveAsset(media.assetId).then(
      (resolved) => {
        if (current) setSource(resolved);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [codecUnavailable, media.assetId, resolveAsset, unavailable]);

  if (codecUnavailable) {
    return <p>{t("content.codecUnavailable")}</p>;
  }
  if (unavailable || failed) {
    return <p>{t("content.previewUnavailable")}</p>;
  }
  if (source === null) {
    return <p>{t("content.previewLoading")}</p>;
  }
  const label = t("content.preview", { name: media.name });
  return media.kind === "image" ? (
    <img src={source.url} alt={label} />
  ) : (
    <video src={source.url} aria-label={label} controls />
  );
}

export function ContentInspector({
  content,
  target,
  media,
  assetIssues,
  onPatch,
  onImport,
  onRepair,
  resolveAsset,
  disabled = false,
  assetOperationBusy = false,
  importImageButtonRef,
}: ContentInspectorProps) {
  const { format, t } = useI18n();
  const displayName = useDisplayName();
  const committedName = content.name;
  const committedDescription = content.description;
  const committedTags = content.tags.join(", ");
  const [name, setName] = useState(committedName);
  const [description, setDescription] = useState(committedDescription);
  const [tags, setTags] = useState(committedTags);
  const [patchBusy, setPatchBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<SafeFailure | null>(null);

  useEffect(() => {
    setName(committedName);
    setDescription(committedDescription);
    setTags(committedTags);
    setFailure(null);
  }, [content.id, committedDescription, committedName, committedTags, target.id]);

  async function patch(after: ProductContent): Promise<void> {
    if (disabled || patchBusy) return;
    setFailure(null);
    setPatchBusy(true);
    try {
      await onPatch(content, after);
      setFailure(null);
    } catch (error) {
      setFailure({ descriptor: localizedErrorDescriptor(error), logRef: localizedErrorLogRef(error) });
    } finally {
      setPatchBusy(false);
    }
  }

  async function applyMetadata(): Promise<void> {
    const normalizedName = name.trim() || target.name;
    await patch({
      ...content,
      name: normalizedName,
      description: description.trim(),
      tags: parsedTags(tags),
    });
  }

  async function move(mediaAssetId: string, direction: "up" | "down") {
    const result = reorderProductMedia(content, mediaAssetId, direction);
    if (result.ok) await patch(result.value);
  }

  async function remove(mediaAssetId: string): Promise<void> {
    await patch({
      ...content,
      mediaAssetIds: content.mediaAssetIds.filter((id) => id !== mediaAssetId),
    });
  }

  async function runImport(
    role: ProductMediaRole,
    initiator: HTMLElement,
  ): Promise<void> {
    if (disabled || assetOperationBusy || importBusy) return;
    setFailure(null);
    setImportBusy(true);
    try {
      await onImport(role, initiator);
      setFailure(null);
    } catch (error) {
      setFailure({ descriptor: localizedErrorDescriptor(error), logRef: localizedErrorLogRef(error) });
    } finally {
      setImportBusy(false);
    }
  }

  async function repair(item: MediaAsset, initiator: HTMLElement) {
    if (disabled || assetOperationBusy || repairingId !== null) return;
    setFailure(null);
    setRepairingId(item.id);
    try {
      await onRepair(item, initiator);
      setFailure(null);
    } catch (error) {
      setFailure({ descriptor: localizedErrorDescriptor(error), logRef: localizedErrorLogRef(error) });
    } finally {
      setRepairingId(null);
    }
  }

  const issueByAssetId = new Map(assetIssues.map((issue) => [issue.assetId, issue]));

  return (
    <section className="studio-content-inspector" aria-labelledby="studio-content-heading">
      <h2 id="studio-content-heading">{t("content.heading")}</h2>
      {failure === null ? null : <StatusNotice tone="error">{format(failure.descriptor)}{failure.logRef === null ? null : <> {t("error.diagnosticReference", { logRef: failure.logRef })}</>}</StatusNotice>}
      <Field
        label={t("content.name")}
        value={name}
        disabled={disabled}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <label className="studio-content-inspector__description">
        <span>{t("content.description")}</span>
        <textarea
          value={description}
          disabled={disabled}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
      </label>
      <Field
        label={t("content.tags")}
        value={tags}
        disabled={disabled}
        helpText={t("content.tagsHelp")}
        onChange={(event) => setTags(event.currentTarget.value)}
      />
      <Button
        variant="secondary"
        disabled={disabled || patchBusy}
        onClick={() => void applyMetadata()}
      >
        {t("content.apply")}
      </Button>
      <div className="studio-content-inspector__imports">
        <Button
          ref={importImageButtonRef}
          variant="secondary"
          disabled={disabled || assetOperationBusy || importBusy}
          onClick={(event) => void runImport("content-image", event.currentTarget)}
        >
          {t("content.importImage")}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || assetOperationBusy || importBusy}
          onClick={(event) => void runImport("content-video", event.currentTarget)}
        >
          {t("content.importVideo")}
        </Button>
      </div>
      <ul className="studio-content-inspector__media" aria-label={t("content.media")}>
        {media.map((item, index) => {
          const issue = issueByAssetId.get(item.assetId);
          const repairable = issue?.code === "ASSET_MISSING"
            || issue?.code === "ASSET_CORRUPT";
          return (
            <li key={item.id}>
              <strong>{displayName({ kind: "media-asset", id: item.id, authoredName: item.name })}</strong>
              <ContentPreview
                media={item}
                issue={issue}
                resolveAsset={resolveAsset}
              />
              <div className="studio-content-inspector__media-actions">
                <Button
                  variant="ghost"
                  aria-label={t("content.moveUp", { name: item.name })}
                  disabled={disabled || patchBusy || index === 0}
                  onClick={() => void move(item.id, "up")}
                >
                  {t("content.moveUp", { name: item.name })}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={t("content.moveDown", { name: item.name })}
                  disabled={disabled || patchBusy || index === media.length - 1}
                  onClick={() => void move(item.id, "down")}
                >
                  {t("content.moveDown", { name: item.name })}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={t("content.remove", { name: item.name })}
                  disabled={disabled || patchBusy}
                  onClick={() => void remove(item.id)}
                >
                  {t("content.removeReference")}
                </Button>
                {repairable ? (
                  <Button
                    variant="secondary"
                    aria-label={t("content.repair", { name: item.name })}
                    disabled={disabled || assetOperationBusy || repairingId !== null}
                    onClick={(event) => void repair(item, event.currentTarget)}
                  >
                    {t("content.repair", { name: item.name })}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
