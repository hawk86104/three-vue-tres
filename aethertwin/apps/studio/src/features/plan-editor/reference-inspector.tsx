import type { PlanLayer, PlanReference } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { parseLength } from "@aethertwin/plan-engine";
import { useEffect, useRef, useState } from "react";

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
      setLocalError("\u900f\u660e\u5ea6\u5fc5\u987b\u5728 0 \u5230 1 \u4e4b\u95f4\uff0c\u4f4d\u7f6e\u548c\u89d2\u5ea6\u5fc5\u987b\u662f\u6709\u9650\u6570\u5b57\u3002");
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
      <h2>{"\u5e73\u9762\u53c2\u8003"}</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{"\u56fe\u5c42"}</dt><dd>{layer.name}</dd></div>
        <div>
          <dt>{"\u72b6\u6001"}</dt>
          <dd>{reference.locked ? "\u5df2\u9501\u5b9a" : "\u53ef\u7f16\u8f91"}</dd>
        </div>
      </dl>
      {layer.locked ? (
        <StatusNotice tone="info">{"\u56fe\u5c42\u5df2\u9501\u5b9a"}</StatusNotice>
      ) : null}
      {!layer.visible ? (
        <StatusNotice tone="info">{"\u56fe\u5c42\u5df2\u9690\u85cf"}</StatusNotice>
      ) : null}
      {localError === null ? null : (
        <StatusNotice tone="error">{localError}</StatusNotice>
      )}
      <Field
        label={"\u5e73\u9762\u53c2\u8003\u540d\u79f0"}
        value={name}
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Field
        label={"\u5e73\u9762\u53c2\u8003\u6807\u7b7e"}
        value={tags}
        readOnly={propertiesReadOnly || publishing}
        onChange={(event) => setTags(event.currentTarget.value)}
      />
      <Field
        label={"\u900f\u660e\u5ea6"}
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
        label={"\u65cb\u8f6c (\u00b0)"}
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
          aria-label={"\u9501\u5b9a\u5e73\u9762\u53c2\u8003"}
          onChange={(event) => {
            void publish({ ...reference, locked: event.currentTarget.checked });
          }}
        />
        {"\u9501\u5b9a\u5e73\u9762\u53c2\u8003"}
      </label>
      <Button
        variant="secondary"
        disabled={propertiesReadOnly || publishing}
        onClick={() => void commit()}
      >
        {"\u5e94\u7528\u5e73\u9762\u53c2\u8003"}
      </Button>
      <Button
        variant="secondary"
        disabled={propertiesReadOnly || publishing}
        onClick={() => void publish(null)}
      >
        {"\u5220\u9664\u5e73\u9762\u53c2\u8003"}
      </Button>
    </div>
  );
}
