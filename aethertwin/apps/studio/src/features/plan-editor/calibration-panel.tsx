import type { PlanReference, Point2 } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { parseLength, previewCalibration } from "@aethertwin/plan-engine";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import { useDisplayName } from "../../i18n/display-name-provider";
import { message, type StudioMessageDescriptor } from "../../i18n/format-message";
import { localizedErrorDescriptor } from "../../i18n/localized-error";
import { useI18n } from "../../i18n/locale-provider";
import type { CalibrationDraft, PlanEditorState } from "./editor-session";

export interface CalibrationPanelProps {
  readonly reference: PlanReference;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly onConfirm: (
    before: PlanReference,
    after: PlanReference,
  ) => Promise<void>;
  readonly onCancel: () => void;
  readonly onReturnFocus: () => void;
}

interface PointFields {
  readonly x: string;
  readonly y: string;
}

function pointFromFields(fields: PointFields): Point2 | null {
  if (fields.x.trim().length === 0 || fields.y.trim().length === 0) return null;
  const x = Number(fields.x);
  const y = Number(fields.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function fieldsFromPoint(point: Point2 | null): PointFields {
  return point === null
    ? { x: "", y: "" }
    : { x: String(point.x), y: String(point.y) };
}

function samePoint(left: Point2 | null, right: Point2 | null): boolean {
  return left === null
    ? right === null
    : right !== null && left.x === right.x && left.y === right.y;
}

function metric(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toPrecision(12)));
}

export function CalibrationPanel({
  reference,
  sessionStore,
  onConfirm,
  onCancel,
  onReturnFocus,
}: CalibrationPanelProps) {
  const { t, format } = useI18n();
  const displayName = useDisplayName();
  const subscribe = useCallback(
    (listener: () => void) => sessionStore.subscribe(listener),
    [sessionStore],
  );
  const getSnapshot = useCallback(
    () => sessionStore.getState().calibrationDraft,
    [sessionStore],
  );
  const draft = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [pointA, setPointA] = useState<PointFields>(
    fieldsFromPoint(draft?.sourcePointA ?? null),
  );
  const [pointB, setPointB] = useState<PointFields>(
    fieldsFromPoint(draft?.sourcePointB ?? null),
  );
  const [distanceText, setDistanceText] = useState(draft?.distanceText ?? "");
  const [error, setError] = useState<StudioMessageDescriptor | null>(null);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const previewReferenceRef = useRef<PlanReference | null>(null);

  useEffect(() => {
    setPointA(fieldsFromPoint(draft?.sourcePointA ?? null));
    setPointB(fieldsFromPoint(draft?.sourcePointB ?? null));
    setDistanceText(draft?.distanceText ?? "");
    setError(null);
  }, [draft?.referenceId]);

  useEffect(() => {
    if (draft?.preview === null || draft === null) {
      previewReferenceRef.current = null;
      return;
    }
    if (previewReferenceRef.current !== reference) {
      updateDraft({ preview: null });
    }
  }, [draft?.preview, reference]);

  useEffect(() => {
    const sourcePointA = draft?.sourcePointA ?? null;
    if (
      sourcePointA !== null
      && !samePoint(pointFromFields(pointA), sourcePointA)
    ) {
      setPointA(fieldsFromPoint(sourcePointA));
    }
  }, [draft?.sourcePointA?.x, draft?.sourcePointA?.y]);

  useEffect(() => {
    const sourcePointB = draft?.sourcePointB ?? null;
    if (
      sourcePointB !== null
      && !samePoint(pointFromFields(pointB), sourcePointB)
    ) {
      setPointB(fieldsFromPoint(sourcePointB));
    }
  }, [draft?.sourcePointB?.x, draft?.sourcePointB?.y]);

  function updateDraft(
    patch: Partial<Omit<CalibrationDraft, "referenceId">>,
  ): void {
    const current = sessionStore.getState().calibrationDraft;
    if (current === null) return;
    sessionStore.getState().updateCalibration({
      ...current,
      ...patch,
    });
  }

  function changePoint(
    target: "a" | "b",
    axis: "x" | "y",
    value: string,
  ): void {
    const currentFields = target === "a" ? pointA : pointB;
    const next = { ...currentFields, [axis]: value };
    if (target === "a") setPointA(next);
    else setPointB(next);
    setError(null);
    updateDraft({
      ...(target === "a"
        ? { sourcePointA: pointFromFields(next) }
        : { sourcePointB: pointFromFields(next) }),
      preview: null,
    });
  }

  function changeDistance(value: string): void {
    setDistanceText(value);
    setError(null);
    updateDraft({ distanceText: value, preview: null });
  }

  function preview(): void {
    const current = sessionStore.getState().calibrationDraft;
    if (current === null) return;
    const sourcePointA = pointFromFields(pointA);
    const sourcePointB = pointFromFields(pointB);
    const parsedDistance = parseLength(distanceText, "mm");
    if (
      sourcePointA === null
      || sourcePointB === null
      || !parsedDistance.ok
      || !Number.isFinite(parsedDistance.value)
      || parsedDistance.value <= 0
    ) {
      updateDraft({
        sourcePointA,
        sourcePointB,
        distanceText,
        preview: null,
      });
      setError(message("calibration.invalidInput"));
      return;
    }

    const result = previewCalibration(reference, {
      sourcePointA,
      sourcePointB,
      measuredDistanceMm: parsedDistance.value,
    });
    if (!result.ok) {
      updateDraft({
        sourcePointA,
        sourcePointB,
        distanceText,
        preview: null,
      });
      setError(message("calibration.invalidPreview"));
      return;
    }

    previewReferenceRef.current = reference;
    updateDraft({
      sourcePointA,
      sourcePointB,
      distanceText,
      preview: result.value,
    });
    setError(null);
  }

  async function confirm(): Promise<void> {
    const previewValue = sessionStore.getState().calibrationDraft?.preview;
    if (
      previewValue !== null
      && previewValue !== undefined
      && previewReferenceRef.current !== reference
    ) {
      updateDraft({ preview: null });
      return;
    }
    if (previewValue === null || previewValue === undefined || publishingRef.current) {
      return;
    }
    publishingRef.current = true;
    setPublishing(true);
    setError(null);
    try {
      await onConfirm(reference, previewValue.after);
      sessionStore.getState().cancelCalibration();
      onReturnFocus();
    } catch (value) {
      setError(localizedErrorDescriptor(value));
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  const cancel = useCallback(() => {
    if (
      publishingRef.current
      || sessionStore.getState().calibrationDraft === null
    ) return;
    sessionStore.getState().cancelCalibration();
    try {
      onCancel();
    } finally {
      onReturnFocus();
    }
  }, [onCancel, onReturnFocus, sessionStore]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape" || sessionStore.getState().calibrationDraft === null) {
        return;
      }
      event.preventDefault();
      cancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cancel, sessionStore]);

  if (draft === null || draft.referenceId !== reference.id) return null;
  const proposedWidth = draft.preview === null
    ? null
    : draft.preview.bounds.max.x - draft.preview.bounds.min.x;
  const proposedHeight = draft.preview === null
    ? null
    : draft.preview.bounds.max.y - draft.preview.bounds.min.y;
  const referenceName = displayName({
    kind: "plan-reference",
    id: reference.id,
    authoredName: reference.name,
  });

  return (
    <aside
      className="studio-calibration-panel"
      aria-label={t("calibration.panelLabel", { name: referenceName })}
      aria-busy={publishing}
    >
      <h2>{t("calibration.heading")}</h2>
      <p>{t("calibration.instructions")}</p>
      {error === null ? null : (
        <StatusNotice tone="error">{format(error)}</StatusNotice>
      )}
      <div className="studio-calibration-panel__point-grid">
        <Field
          label={t("calibration.pointAX")}
          value={pointA.x}
          inputMode="decimal"
          disabled={publishing}
          onChange={(event) => changePoint("a", "x", event.currentTarget.value)}
        />
        <Field
          label={t("calibration.pointAY")}
          value={pointA.y}
          inputMode="decimal"
          disabled={publishing}
          onChange={(event) => changePoint("a", "y", event.currentTarget.value)}
        />
        <Field
          label={t("calibration.pointBX")}
          value={pointB.x}
          inputMode="decimal"
          disabled={publishing}
          onChange={(event) => changePoint("b", "x", event.currentTarget.value)}
        />
        <Field
          label={t("calibration.pointBY")}
          value={pointB.y}
          inputMode="decimal"
          disabled={publishing}
          onChange={(event) => changePoint("b", "y", event.currentTarget.value)}
        />
      </div>
      <Field
        label={t("calibration.distance")}
        value={distanceText}
        inputMode="decimal"
        helpText={t("calibration.distanceHelp")}
        disabled={publishing}
        onChange={(event) => changeDistance(event.currentTarget.value)}
      />
      {draft.preview === null ? null : (
        <div className="studio-calibration-panel__preview" aria-live="polite">
          <strong>{t("calibration.previewScale", { value: metric(draft.preview.millimetresPerPixel) })}</strong>
          <span>{t("calibration.proposedWidth", { value: metric(proposedWidth!) })}</span>
          <span>{t("calibration.proposedHeight", { value: metric(proposedHeight!) })}</span>
        </div>
      )}
      <div className="studio-calibration-panel__actions">
        <Button
          variant="secondary"
          disabled={publishing}
          onClick={preview}
        >
          {t("calibration.preview")}
        </Button>
        <Button
          disabled={draft.preview === null || publishing}
          onClick={() => void confirm()}
        >
          {t("calibration.apply")}
        </Button>
        <Button
          variant="ghost"
          disabled={publishing}
          onClick={cancel}
        >
          {t("calibration.cancel")}
        </Button>
      </div>
    </aside>
  );
}
