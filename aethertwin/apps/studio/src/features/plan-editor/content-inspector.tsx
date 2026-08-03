import type {
  Fixture,
  MediaAsset,
  PointOfInterest,
  ProductContent,
} from "@aethertwin/core-model";
import { Button, Field } from "@aethertwin/design-system";
import { reorderProductMedia } from "@aethertwin/plan-engine";
import type {
  ProjectAssetSource,
  ProjectStoreState,
} from "@aethertwin/project-store";
import { useEffect, useState, type Ref } from "react";

export type ProductMediaRole = "content-image" | "content-video";
type AssetIssue = ProjectStoreState["assetIssues"][number];

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
    return <p>{"\u5f53\u524d\u5e73\u53f0\u65e0\u6cd5\u9884\u89c8\u6b64\u89c6\u9891\u7f16\u7801"}</p>;
  }
  if (unavailable || failed) {
    return <p>{"\u8d44\u6e90\u9884\u89c8\u4e0d\u53ef\u7528"}</p>;
  }
  if (source === null) {
    return <p>{"\u6b63\u5728\u52a0\u8f7d\u9884\u89c8"}</p>;
  }
  const label = `${media.name} ${"\u9884\u89c8"}`;
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
  const committedName = content.name;
  const committedDescription = content.description;
  const committedTags = content.tags.join(", ");
  const [name, setName] = useState(committedName);
  const [description, setDescription] = useState(committedDescription);
  const [tags, setTags] = useState(committedTags);
  const [patchBusy, setPatchBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);

  useEffect(() => {
    setName(committedName);
    setDescription(committedDescription);
    setTags(committedTags);
  }, [content.id, committedDescription, committedName, committedTags, target.id]);

  async function patch(after: ProductContent): Promise<void> {
    if (disabled || patchBusy) return;
    setPatchBusy(true);
    try {
      await onPatch(content, after);
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
    setImportBusy(true);
    try {
      await onImport(role, initiator);
    } finally {
      setImportBusy(false);
    }
  }

  async function repair(item: MediaAsset, initiator: HTMLElement) {
    if (disabled || assetOperationBusy || repairingId !== null) return;
    setRepairingId(item.id);
    try {
      await onRepair(item, initiator);
    } finally {
      setRepairingId(null);
    }
  }

  const issueByAssetId = new Map(assetIssues.map((issue) => [issue.assetId, issue]));

  return (
    <section className="studio-content-inspector" aria-labelledby="studio-content-heading">
      <h2 id="studio-content-heading">{"\u4ea7\u54c1\u5185\u5bb9"}</h2>
      <Field
        label={"\u5185\u5bb9\u540d\u79f0"}
        value={name}
        disabled={disabled}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <label className="studio-content-inspector__description">
        <span>{"\u5185\u5bb9\u63cf\u8ff0"}</span>
        <textarea
          value={description}
          disabled={disabled}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
      </label>
      <Field
        label={"\u5185\u5bb9\u6807\u7b7e"}
        value={tags}
        disabled={disabled}
        helpText={"\u4f7f\u7528\u82f1\u6587\u9017\u53f7\u5206\u9694\u6807\u7b7e"}
        onChange={(event) => setTags(event.currentTarget.value)}
      />
      <Button
        variant="secondary"
        disabled={disabled || patchBusy}
        onClick={() => void applyMetadata()}
      >
        {"\u5e94\u7528\u5185\u5bb9"}
      </Button>
      <div className="studio-content-inspector__imports">
        <Button
          ref={importImageButtonRef}
          variant="secondary"
          disabled={disabled || assetOperationBusy || importBusy}
          onClick={(event) => void runImport("content-image", event.currentTarget)}
        >
          {"\u5bfc\u5165\u56fe\u7247"}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || assetOperationBusy || importBusy}
          onClick={(event) => void runImport("content-video", event.currentTarget)}
        >
          {"\u5bfc\u5165\u89c6\u9891"}
        </Button>
      </div>
      <ul className="studio-content-inspector__media" aria-label={"\u4ea7\u54c1\u5a92\u4f53"}>
        {media.map((item, index) => {
          const issue = issueByAssetId.get(item.assetId);
          const repairable = issue?.code === "ASSET_MISSING"
            || issue?.code === "ASSET_CORRUPT";
          return (
            <li key={item.id}>
              <strong>{item.name}</strong>
              <ContentPreview
                media={item}
                issue={issue}
                resolveAsset={resolveAsset}
              />
              <div className="studio-content-inspector__media-actions">
                <Button
                  variant="ghost"
                  aria-label={`${"\u4e0a\u79fb"} ${item.name}`}
                  disabled={disabled || patchBusy || index === 0}
                  onClick={() => void move(item.id, "up")}
                >
                  {"\u4e0a\u79fb"}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`${"\u4e0b\u79fb"} ${item.name}`}
                  disabled={disabled || patchBusy || index === media.length - 1}
                  onClick={() => void move(item.id, "down")}
                >
                  {"\u4e0b\u79fb"}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`${"\u79fb\u9664"} ${item.name}`}
                  disabled={disabled || patchBusy}
                  onClick={() => void remove(item.id)}
                >
                  {"\u79fb\u9664\u5f15\u7528"}
                </Button>
                {repairable ? (
                  <Button
                    variant="secondary"
                    aria-label={`${"\u4fee\u590d"} ${item.name}`}
                    disabled={disabled || assetOperationBusy || repairingId !== null}
                    onClick={(event) => void repair(item, event.currentTarget)}
                  >
                    {"\u4fee\u590d"}
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
