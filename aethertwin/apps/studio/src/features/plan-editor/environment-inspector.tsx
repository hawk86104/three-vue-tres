import type { SceneEnvironment } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import type { SceneEnvironmentPatch } from "@aethertwin/project-store";
import { useEffect, useId, useMemo, useState } from "react";
import { message, type StudioMessageDescriptor } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";
import { localizedErrorDescriptor, localizedErrorLogRef } from "../../i18n/localized-error";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface EnvironmentDraft {
  readonly backgroundColor: string;
  readonly ambientColor: string;
  readonly ambientIntensity: string;
  readonly keyColor: string;
  readonly keyIntensity: string;
  readonly directionX: string;
  readonly directionY: string;
  readonly directionZ: string;
  readonly shadowsEnabled: boolean;
  readonly shadowSoftness: string;
}

type DraftField = Exclude<keyof EnvironmentDraft, "shadowsEnabled">;
type EnvironmentIssue =
  | { readonly code: "color" }
  | { readonly code: "range"; readonly minimum: number; readonly maximum: number }
  | { readonly code: "direction" };
type DraftErrors = Partial<Record<DraftField, EnvironmentIssue>>;
interface SafeFailure {
  readonly descriptor: StudioMessageDescriptor;
  readonly logRef: string | null;
}

export interface EnvironmentInspectorProps {
  readonly environment: SceneEnvironment;
  readonly onApplyPatch: (patch: SceneEnvironmentPatch) => Promise<void>;
  readonly onError: (error: unknown) => void;
}


function bounded(value: string, minimum: number, maximum: number): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function equals(left: SceneEnvironment, right: SceneEnvironment): boolean {
  return left.backgroundColor === right.backgroundColor
    && left.ambient.color === right.ambient.color
    && left.ambient.intensity === right.ambient.intensity
    && left.key.color === right.key.color
    && left.key.intensity === right.key.intensity
    && left.key.direction.every((value, index) => value === right.key.direction[index])
    && left.shadowsEnabled === right.shadowsEnabled
    && left.shadowSoftness === right.shadowSoftness;
}

function validate(draft: EnvironmentDraft): {
  readonly after: SceneEnvironment | null;
  readonly errors: DraftErrors;
} {
  const errors: DraftErrors = {};
  if (!COLOR_PATTERN.test(draft.backgroundColor)) {
    errors.backgroundColor = { code: "color" };
  }
  if (!COLOR_PATTERN.test(draft.ambientColor)) {
    errors.ambientColor = { code: "color" };
  }
  if (!COLOR_PATTERN.test(draft.keyColor)) {
    errors.keyColor = { code: "color" };
  }
  const ambientIntensity = bounded(draft.ambientIntensity, 0, 4);
  const keyIntensity = bounded(draft.keyIntensity, 0, 8);
  const shadowSoftness = bounded(draft.shadowSoftness, 0, 1);
  if (ambientIntensity === null) {
    errors.ambientIntensity = { code: "range", minimum: 0, maximum: 4 };
  }
  if (keyIntensity === null) {
    errors.keyIntensity = { code: "range", minimum: 0, maximum: 8 };
  }
  if (shadowSoftness === null) {
    errors.shadowSoftness = { code: "range", minimum: 0, maximum: 1 };
  }
  const directions = [draft.directionX, draft.directionY, draft.directionZ].map(
    (value) => bounded(value, -100, 100),
  );
  const directionFields = ["directionX", "directionY", "directionZ"] as const;
  directions.forEach((value, index) => {
    if (value === null) {
      errors[directionFields[index]!] = { code: "range", minimum: -100, maximum: 100 };
    }
  });
  if (directions.every((value) => value === 0)) {
    for (const field of directionFields) {
      errors[field] = { code: "direction" };
    }
  }
  if (
    Object.keys(errors).length > 0
    || ambientIntensity === null
    || keyIntensity === null
    || shadowSoftness === null
    || directions.some((value) => value === null)
  ) {
    return { after: null, errors };
  }
  return {
    after: {
      backgroundColor: draft.backgroundColor,
      ambient: { color: draft.ambientColor, intensity: ambientIntensity },
      key: {
        color: draft.keyColor,
        intensity: keyIntensity,
        direction: directions as [number, number, number],
      },
      shadowsEnabled: draft.shadowsEnabled,
      shadowSoftness,
    },
    errors,
  };
}

export function EnvironmentInspector({
  environment,
  onApplyPatch,
  onError: _onError,
}: EnvironmentInspectorProps) {
  const { format, t } = useI18n();
  const committedDraft = useMemo(
    () => ({
      backgroundColor: environment.backgroundColor,
      ambientColor: environment.ambient.color,
      ambientIntensity: String(environment.ambient.intensity),
      keyColor: environment.key.color,
      keyIntensity: String(environment.key.intensity),
      directionX: String(environment.key.direction[0]),
      directionY: String(environment.key.direction[1]),
      directionZ: String(environment.key.direction[2]),
      shadowsEnabled: environment.shadowsEnabled,
      shadowSoftness: String(environment.shadowSoftness),
    }),
    [
      environment.backgroundColor,
      environment.ambient.color,
      environment.ambient.intensity,
      environment.key.color,
      environment.key.intensity,
      environment.key.direction[0],
      environment.key.direction[1],
      environment.key.direction[2],
      environment.shadowsEnabled,
      environment.shadowSoftness,
    ],
  );
  const [draft, setDraft] = useState(committedDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SafeFailure | null>(null);
  const errorId = "environment-inspector-error-" + useId().replaceAll(":", "");

  useEffect(() => {
    setDraft(committedDraft);
    setErrors({});
    setFailure(null);
  }, [committedDraft]);

  function update(patch: Partial<EnvironmentDraft>): void {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
    setFailure(null);
  }

  function issue(field: DraftField) {
    return errors[field] === undefined
      ? {}
      : { "aria-describedby": errorId, "aria-invalid": true as const };
  }

  function renderField(field: DraftField, label: string, inputMode?: "decimal") {
    return (
      <Field
        key={field}
        label={label}
        inputMode={inputMode}
        value={draft[field]}
        disabled={busy}
        {...issue(field)}
        onChange={(event) => update({ [field]: event.currentTarget.value })}
      />
    );
  }

  async function apply(): Promise<void> {
    if (busy) return;
    const result = validate(draft);
    setErrors(result.errors);
    if (result.after === null || equals(environment, result.after)) return;
    setBusy(true);
    setFailure(null);
    try {
      await onApplyPatch({ before: environment, after: result.after });
    } catch (error) {
      setFailure({ descriptor: localizedErrorDescriptor(error), logRef: localizedErrorLogRef(error) });
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setDraft(committedDraft);
    setErrors({});
    setFailure(null);
  }

  function fieldLabel(field: DraftField): string {
    const ids = {
      backgroundColor: "environment.backgroundColor", ambientColor: "environment.ambientColor", ambientIntensity: "environment.ambientIntensity", keyColor: "environment.keyColor", keyIntensity: "environment.keyIntensity", directionX: "environment.directionX", directionY: "environment.directionY", directionZ: "environment.directionZ", shadowSoftness: "environment.shadowSoftness",
    } as const;
    return t(ids[field]);
  }

  function formatIssue(field: DraftField, issue: EnvironmentIssue): string {
    if (issue.code === "color") return t("environment.invalidColor", { label: fieldLabel(field) });
    if (issue.code === "range") return t("environment.invalidRange", { label: fieldLabel(field), minimum: issue.minimum, maximum: issue.maximum });
    return t("environment.invalidDirection");
  }

  const messages = [...new Set(
    (Object.entries(errors) as [DraftField, EnvironmentIssue][]).map(
      ([field, issue]) => formatIssue(field, issue),
    ),
  )];

  return (
    <details className="studio-environment-inspector" role="group" aria-label={t("environment.section")}>
      <summary>{t("environment.section")}</summary>
      <div className="studio-environment-inspector__body">
        {renderField("backgroundColor", t("environment.backgroundColor"))}
        {renderField("ambientColor", t("environment.ambientColor"))}
        {renderField("ambientIntensity", t("environment.ambientIntensity"), "decimal")}
        {renderField("keyColor", t("environment.keyColor"))}
        {renderField("keyIntensity", t("environment.keyIntensity"), "decimal")}
        <div className="studio-environment-inspector__direction">
          {renderField("directionX", t("environment.directionX"), "decimal")}
          {renderField("directionY", t("environment.directionY"), "decimal")}
          {renderField("directionZ", t("environment.directionZ"), "decimal")}
        </div>
        <label className="studio-environment-inspector__toggle">
          <input
            type="checkbox"
            checked={draft.shadowsEnabled}
            disabled={busy}
            onChange={(event) => update({ shadowsEnabled: event.currentTarget.checked })}
          />
          <span>{t("environment.shadows")}</span>
        </label>
        {renderField("shadowSoftness", t("environment.shadowSoftness"), "decimal")}
        {messages.length === 0 ? null : (
          <StatusNotice id={errorId} tone="error">
            <ul className="studio-environment-inspector__errors">
              {messages.map((message) => <li key={message}>{message}</li>)}
            </ul>
          </StatusNotice>
        )}
        {failure === null ? null : (
          <StatusNotice tone="error">
            {format(failure.descriptor)}
            {failure.logRef === null ? null : ` ${t("error.diagnosticReference", { logRef: failure.logRef })}`}
          </StatusNotice>
        )}
        <Button variant="ghost" disabled={busy} onClick={reset}>
          {t("environment.reset")}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void apply()}>
          {t("environment.apply")}
        </Button>
      </div>
    </details>
  );
}
