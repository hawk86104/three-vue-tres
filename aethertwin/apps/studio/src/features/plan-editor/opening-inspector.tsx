import type { Opening, PlanLayer, Wall } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { parseLength } from "@aethertwin/plan-engine";
import { useEffect, useRef, useState } from "react";
import { OPENING_KIND_MESSAGE_IDS } from "../../i18n/display-message-ids";
import { useDisplayName } from "../../i18n/display-name-provider";
import { message, type StudioMessageDescriptor } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";
import { localizedErrorDescriptor, localizedErrorLogRef } from "../../i18n/localized-error";

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

interface SafeFailure {
  readonly descriptor: StudioMessageDescriptor;
  readonly logRef: string | null;
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
}: OpeningInspectorProps) {
  const { format, t } = useI18n();
  const displayName = useDisplayName();
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
  const [localError, setLocalError] = useState<StudioMessageDescriptor | null>(null);
  const [failure, setFailure] = useState<SafeFailure | null>(null);
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
    setFailure(null);
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
    setFailure(null);
    try {
      await onApplyOpeningPatch(opening, after);
    } catch (error) {
      setFailure({
        descriptor: localizedErrorDescriptor(error),
        logRef: localizedErrorLogRef(error),
      });
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
      setLocalError(message("inspector.invalidOpening"));
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
      <h2>{t("inspector.opening")}</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("inspector.supportWall")}</dt><dd>{displayName({ kind: "entity", id: wall.id, authoredName: wall.name })}</dd></div>
        <div><dt>{t("inspector.supportWallId")}</dt><dd>{wall.id}</dd></div>
        <div><dt>{t("inspector.entityLayer")}</dt><dd>{displayName({ kind: "layer", id: layer.id, authoredName: layer.name })}</dd></div>
        <div><dt>{t("inspector.status")}</dt><dd>{editable ? t("inspector.editable") : t("inspector.locked")}</dd></div>
      </dl>
      {!editable ? (
        <StatusNotice tone="info">{t("inspector.openingUnavailable")}</StatusNotice>
      ) : null}
      {localError === null ? null : (
        <StatusNotice tone="error">{format(localError)}</StatusNotice>
      )}
      {failure === null ? null : (
        <StatusNotice tone="error">
          {format(failure.descriptor)}
          {failure.logRef === null ? null : ` ${t("error.diagnosticReference", { logRef: failure.logRef })}`}
        </StatusNotice>
      )}
      <Field
        label={t("inspector.openingName")}
        value={name}
        readOnly={!editable || publishing}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <label className="studio-plan-inspector__select">
        {t("inspector.openingType")}
        <select
          aria-label={t("inspector.openingType")}
          value={kind}
          disabled={!editable || publishing}
          onChange={(event) => setKind(event.currentTarget.value as Opening["kind"])}
        >
          <option value="door">{t(OPENING_KIND_MESSAGE_IDS.door)}</option>
          <option value="window">{t(OPENING_KIND_MESSAGE_IDS.window)}</option>
        </select>
      </label>
      <Field
        label={t("inspector.openingWidth")}
        value={width}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setWidth(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.openingHeight")}
        value={height}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setHeight(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.sillHeight")}
        value={sillHeight}
        inputMode="decimal"
        readOnly={!editable || publishing}
        onChange={(event) => setSillHeight(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.distanceAlongWall")}
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
        {t("inspector.applyOpening")}
      </Button>
      <Button
        variant="secondary"
        disabled={!editable || publishing}
        onClick={() => void publish(null)}
      >
        {t("inspector.deleteOpening")}
      </Button>
    </div>
  );
}
