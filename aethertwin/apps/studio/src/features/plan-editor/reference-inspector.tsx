import type { PlanLayer, PlanReference } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { parseLength } from "@aethertwin/plan-engine";
import { useEffect, useRef, useState } from "react";
import { useDisplayName } from "../../i18n/display-name-provider";
import { useI18n } from "../../i18n/locale-provider";

export interface ReferenceInspectorProps {
  readonly reference: PlanReference;
  readonly layer: PlanLayer;
  readonly onApplyPlanReferencePatch: (
    before: PlanReference,
    after: PlanReference | null,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

function parsedTags(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

function signedLength(value: string): number | null {
  const normalized = value.trim();
  const sign = normalized.startsWith("-") ? -1 : 1;
  const magnitude = normalized.startsWith("-") || normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;
  if (magnitude.trim().length === 0) return null;
  const parsed = parseLength(magnitude, "mm");
  if (!parsed.ok) return null;
  const result = sign * parsed.value;
  return Number.isFinite(result) ? result : null;
}

export function ReferenceInspector({
  reference,
  layer,
  onApplyPlanReferencePatch,
  onError,
}: ReferenceInspectorProps) {
  const { t } = useI18n();
  const displayName = useDisplayName();
  const committedName = reference.name;
  const committedTags = reference.tags.join(", ");
  const committedOpacity = String(reference.opacity);
  const committedX = String(reference.transform.translation.x);
  const committedY = String(reference.transform.translation.y);
  const committedRotation = String(reference.transform.rotation * 180 / Math.PI);
  const [name, setName] = useState(committedName);
  const [tags, setTags] = useState(committedTags);
  const [opacity, setOpacity] = useState(committedOpacity);
  const [x, setX] = useState(committedX);
  const [y, setY] = useState(committedY);
  const [rotation, setRotation] = useState(committedRotation);
  const [localError, setLocalError] = useState<string | null>(null);
  const publishingRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const layerAllowsEdits = layer.visible && !layer.locked;
  const propertiesReadOnly = reference.locked || !layerAllowsEdits;

  useEffect(() => {
    setName(committedName);
    setTags(committedTags);
    setOpacity(committedOpacity);
    setX(committedX);
    setY(committedY);
    setRotation(committedRotation);
    setLocalError(null);
  }, [
    reference.id,
    committedName,
    committedTags,
    committedOpacity,
    committedX,
    committedY,
    committedRotation,
  ]);

  async function publish(after: PlanReference | null): Promise<void> {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    setLocalError(null);
    try {
      await onApplyPlanReferencePatch(reference, after);
    } catch (error) {
      onError(error);
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  async function commit(): Promise<void> {
    if (propertiesReadOnly || publishingRef.current) return;
    const nextOpacity = Number(opacity.trim());
    const nextX = signedLength(x);
    const nextY = signedLength(y);
    const nextRotationDegrees = Number(rotation.trim());
    if (
      opacity.trim().length === 0
      || !Number.isFinite(nextOpacity)
      || nextOpacity < 0
      || nextOpacity > 1
      || nextX === null
      || nextY === null
      || rotation.trim().length === 0
      || !Number.isFinite(nextRotationDegrees)
    ) {
      setLocalError(t("inspector.invalidReference"));
      return;
    }

    const after: PlanReference = {
      ...reference,
      name: name.trim() || reference.name,
      tags: parsedTags(tags),
      opacity: nextOpacity,
      transform: {
        ...reference.transform,
        translation: { x: nextX, y: nextY },
        rotation: nextRotationDegrees * Math.PI / 180,
      },
    };
    if (JSON.stringify(after) === JSON.stringify(reference)) return;
    await publish(after);
  }

  return (
    <div className="studio-inspector-form" aria-busy={publishing}>
      <h2>{t("inspector.reference")}</h2>
      <p>{displayName({ kind: "plan-reference", id: reference.id, authoredName: reference.name })}</p>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("inspector.entityLayer")}</dt><dd>{displayName({ kind: "layer", id: layer.id, authoredName: layer.name })}</dd></div>
        <div>
          <dt>{t("inspector.status")}</dt>
          <dd>{reference.locked ? t("inspector.locked") : t("inspector.editable")}</dd>
        </div>
      </dl>
      {layer.locked ? (
        <StatusNotice tone="info">{t("inspector.referenceLayerLocked")}</StatusNotice>
      ) : null}
      {!layer.visible ? (
        <StatusNotice tone="info">{t("inspector.referenceLayerHidden")}</StatusNotice>
      ) : null}
      {localError === null ? null : (
        <StatusNotice tone="error">{localError}</StatusNotice>
      )}
      <Field
        label={t("inspector.referenceName")}
        value={name}
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.referenceTags")}
        value={tags}
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setTags(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.referenceOpacity")}
        value={opacity}
        inputMode="decimal"
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setOpacity(event.currentTarget.value)}
      />
      <Field
        label="X (mm)"
        value={x}
        inputMode="decimal"
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setX(event.currentTarget.value)}
      />
      <Field
        label="Y (mm)"
        value={y}
        inputMode="decimal"
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setY(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.referenceRotation")}
        value={rotation}
        inputMode="decimal"
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setRotation(event.currentTarget.value)}
      />
      <label className="studio-plan-inspector__check">
        <input
          type="checkbox"
          checked={reference.locked}
          disabled={!layerAllowsEdits || publishing}
          aria-label={t("inspector.referenceLock")}
          onChange={(event) => {
            void publish({ ...reference, locked: event.currentTarget.checked });
          }}
        />
        {t("inspector.referenceLock")}
      </label>
      <Button
        variant="secondary"
        disabled={propertiesReadOnly || publishing}
        onClick={() => void commit()}
      >
        {t("inspector.applyReference")}
      </Button>
      <Button
        variant="secondary"
        disabled={propertiesReadOnly || publishing}
        onClick={() => void publish(null)}
      >
        {t("inspector.deleteReference")}
      </Button>
    </div>
  );
}
