import type { Opening, PlanLayer, Wall } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { parseLength } from "@aethertwin/plan-engine";
import { useEffect, useRef, useState } from "react";

export interface OpeningInspectorProps {
  readonly opening: Opening;
  readonly wall: Wall;
  readonly layer: PlanLayer;
  readonly onApplyOpeningPatch: (
    before: Opening,
    after: Opening | null,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
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

function positiveLength(value: string): number | null {
  const parsed = signedLength(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegativeLength(value: string): number | null {
  const parsed = signedLength(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

export function OpeningInspector({
  opening,
  wall,
  layer,
  onApplyOpeningPatch,
  onError,
}: OpeningInspectorProps) {
  const committedName = opening.name;
  const committedKind = opening.kind;
  const committedWidth = String(opening.width);
  const committedHeight = String(opening.height);
  const committedSillHeight = String(opening.sillHeight);
  const committedDistance = String(opening.distanceAlongWall);
  const [name, setName] = useState(committedName);
  const [kind, setKind] = useState<Opening["kind"]>(committedKind);
  const [width, setWidth] = useState(committedWidth);
  const [height, setHeight] = useState(committedHeight);
  const [sillHeight, setSillHeight] = useState(committedSillHeight);
  const [distance, setDistance] = useState(committedDistance);
  const [localError, setLocalError] = useState<string | null>(null);
  const publishingRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const editable = layer.visible && !layer.locked && !wall.locked;

  useEffect(() => {
    setName(committedName);
    setKind(committedKind);
    setWidth(committedWidth);
    setHeight(committedHeight);
    setSillHeight(committedSillHeight);
    setDistance(committedDistance);
    setLocalError(null);
  }, [
    opening.id,
    committedName,
    committedKind,
    committedWidth,
    committedHeight,
    committedSillHeight,
    committedDistance,
  ]);

  async function publish(after: Opening | null): Promise<void> {
    if (!editable || publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    setLocalError(null);
    try {
      await onApplyOpeningPatch(opening, after);
    } catch (error) {
      onError(error);
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  async function commit(): Promise<void> {
    if (!editable || publishingRef.current) return;
    const nextWidth = positiveLength(width);
    const nextHeight = positiveLength(height);
    const nextSillHeight = nonNegativeLength(sillHeight);
    const nextDistance = nonNegativeLength(distance);
    if (
      nextWidth === null
      || nextHeight === null
      || nextSillHeight === null
      || nextDistance === null
    ) {
      setLocalError(
        "宽度和高度必须为正长度，窗台高度和沿墙距离必须为非负有限长度。",
      );
      return;
    }

    const after: Opening = {
      ...opening,
      name: name.trim() || opening.name,
      kind,
      distanceAlongWall: nextDistance,
      width: nextWidth,
      height: nextHeight,
      sillHeight: kind === "door" ? 0 : nextSillHeight,
    };
    if (JSON.stringify(after) === JSON.stringify(opening)) return;
    await publish(after);
  }

  return (
    <div className="studio-inspector-form" aria-busy={publishing}>
      <h2>门窗</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>支撑墙</dt><dd>{wall.name}</dd></div>
        <div><dt>支撑墙 ID</dt><dd>{wall.id}</dd></div>
        <div><dt>图层</dt><dd>{layer.name}</dd></div>
        <div><dt>状态</dt><dd>{editable ? "可编辑" : "已锁定"}</dd></div>
      </dl>
      {!editable ? (
        <StatusNotice tone="info">支撑墙或图层不可编辑</StatusNotice>
      ) : null}
      {localError === null ? null : (
        <StatusNotice tone="error">{localError}</StatusNotice>
      )}
      <Field
        label="门窗名称"
        value={name}
        readOnly={!editable || publishing}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <label className="studio-plan-inspector__select">
        门窗类型
        <select
          aria-label="门窗类型"
          value={kind}
          disabled={!editable || publishing}
          onChange={(event) => setKind(event.currentTarget.value as Opening["kind"])}
        >
          <option value="door">Door</option>
          <option value="window">Window</option>
        </select>
      </label>
      <Field
        label="宽度 (mm)"
        value={width}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setWidth(event.currentTarget.value)}
      />
      <Field
        label="高度 (mm)"
        value={height}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setHeight(event.currentTarget.value)}
      />
      <Field
        label="窗台高度 (mm)"
        value={sillHeight}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setSillHeight(event.currentTarget.value)}
      />
      <Field
        label="沿墙距离 (mm)"
        value={distance}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setDistance(event.currentTarget.value)}
      />
      <Button
        variant="secondary"
        disabled={!editable || publishing}
        onClick={() => void commit()}
      >
        应用门窗
      </Button>
      <Button
        variant="secondary"
        disabled={!editable || publishing}
        onClick={() => void publish(null)}
      >
        删除门窗
      </Button>
    </div>
  );
}
