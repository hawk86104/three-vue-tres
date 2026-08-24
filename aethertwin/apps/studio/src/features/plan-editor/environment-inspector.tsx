import type { SceneEnvironment } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import type { SceneEnvironmentPatch } from "@aethertwin/project-store";
import { useEffect, useId, useMemo, useState } from "react";
import { message, type StudioMessageDescriptor } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";

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
type DraftErrors = Partial<Record<DraftField, StudioMessageDescriptor>>;

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
    errors.backgroundColor = message("environment.invalidColor", { label: "background" });
  }
  if (!COLOR_PATTERN.test(draft.ambientColor)) {
    errors.ambientColor = message("environment.invalidColor", { label: "ambient" });
  }
  if (!COLOR_PATTERN.test(draft.keyColor)) {
    errors.keyColor = message("environment.invalidColor", { label: "key light" });
  }
  const ambientIntensity = bounded(draft.ambientIntensity, 0, 4);
  const keyIntensity = bounded(draft.keyIntensity, 0, 8);
  const shadowSoftness = bounded(draft.shadowSoftness, 0, 1);
  if (ambientIntensity === null) {
    errors.ambientIntensity = message("environment.invalidRange", { label: "ambient intensity", minimum: 0, maximum: 4 });
  }
  if (keyIntensity === null) {
    errors.keyIntensity = message("environment.invalidRange", { label: "key light intensity", minimum: 0, maximum: 8 });
  }
  if (shadowSoftness === null) {
    errors.shadowSoftness = message("environment.invalidRange", { label: "shadow softness", minimum: 0, maximum: 1 });
  }
  const directions = [draft.directionX, draft.directionY, draft.directionZ].map(
    (value) => bounded(value, -100, 100),
  );
  const directionFields = ["directionX", "directionY", "directionZ"] as const;
  directions.forEach((value, index) => {
    if (value === null) {
      errors[directionFields[index]!] = message("environment.invalidRange", { label: "key light direction", minimum: -100, maximum: 100 });
    }
  });
  if (directions.every((value) => value === 0)) {
    for (const field of directionFields) {
      errors[field] = message("environment.invalidDirection");
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
  onError,
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
  const errorId = "environment-inspector-error-" + useId().replaceAll(":", "");

  useEffect(() => {
    setDraft(committedDraft);
    setErrors({});
  }, [committedDraft]);

  function update(patch: Partial<EnvironmentDraft>): void {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
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
    try {
      await onApplyPatch({ before: environment, after: result.after });
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setDraft(committedDraft);
    setErrors({});
  }

  const messages = [...new Map(
    Object.values(errors)
      .filter((value): value is StudioMessageDescriptor => value !== undefined)
      .map((value) => [JSON.stringify(value), format(value)]),
  ).values()];

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
