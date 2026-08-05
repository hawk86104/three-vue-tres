import type { SceneEnvironment } from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import type { SceneEnvironmentPatch } from "@aethertwin/project-store";
import { useEffect, useId, useMemo, useState } from "react";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const LABELS = {
  section: "\u73af\u5883",
  backgroundColor: "\u80cc\u666f\u989c\u8272",
  ambientColor: "\u73af\u5883\u5149\u989c\u8272",
  ambientIntensity: "\u73af\u5883\u5149\u5f3a\u5ea6",
  keyColor: "\u4e3b\u5149\u989c\u8272",
  keyIntensity: "\u4e3b\u5149\u5f3a\u5ea6",
  directionX: "\u4e3b\u5149\u65b9\u5411 X",
  directionY: "\u4e3b\u5149\u65b9\u5411 Y",
  directionZ: "\u4e3b\u5149\u65b9\u5411 Z",
  shadowsEnabled: "\u542f\u7528\u9634\u5f71",
  shadowSoftness: "\u9634\u5f71\u67d4\u548c\u5ea6",
  apply: "\u5e94\u7528\u73af\u5883",
} as const;

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
type DraftErrors = Partial<Record<DraftField, string>>;

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
    errors.backgroundColor = "\u80cc\u666f\u989c\u8272\u5fc5\u987b\u4f7f\u7528 #RRGGBB \u683c\u5f0f";
  }
  if (!COLOR_PATTERN.test(draft.ambientColor)) {
    errors.ambientColor = "\u73af\u5883\u5149\u989c\u8272\u5fc5\u987b\u4f7f\u7528 #RRGGBB \u683c\u5f0f";
  }
  if (!COLOR_PATTERN.test(draft.keyColor)) {
    errors.keyColor = "\u4e3b\u5149\u989c\u8272\u5fc5\u987b\u4f7f\u7528 #RRGGBB \u683c\u5f0f";
  }
  const ambientIntensity = bounded(draft.ambientIntensity, 0, 4);
  const keyIntensity = bounded(draft.keyIntensity, 0, 8);
  const shadowSoftness = bounded(draft.shadowSoftness, 0, 1);
  if (ambientIntensity === null) {
    errors.ambientIntensity = "\u73af\u5883\u5149\u5f3a\u5ea6\u5fc5\u987b\u5728 0 \u5230 4 \u4e4b\u95f4";
  }
  if (keyIntensity === null) {
    errors.keyIntensity = "\u4e3b\u5149\u5f3a\u5ea6\u5fc5\u987b\u5728 0 \u5230 8 \u4e4b\u95f4";
  }
  if (shadowSoftness === null) {
    errors.shadowSoftness = "\u9634\u5f71\u67d4\u548c\u5ea6\u5fc5\u987b\u5728 0 \u5230 1 \u4e4b\u95f4";
  }
  const directions = [draft.directionX, draft.directionY, draft.directionZ].map(
    (value) => bounded(value, -100, 100),
  );
  const directionFields = ["directionX", "directionY", "directionZ"] as const;
  directions.forEach((value, index) => {
    if (value === null) {
      errors[directionFields[index]!] = "\u4e3b\u5149\u65b9\u5411\u6bcf\u4e2a\u5206\u91cf\u5fc5\u987b\u5728 -100 \u5230 100 \u4e4b\u95f4";
    }
  });
  if (directions.every((value) => value === 0)) {
    for (const field of directionFields) {
      errors[field] = "\u4e3b\u5149\u65b9\u5411\u4e0d\u80fd\u5168\u4e3a 0";
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

  const messages = [...new Set(
    Object.values(errors).filter((message): message is string => message !== undefined),
  )];

  return (
    <details className="studio-environment-inspector" role="group" aria-label={LABELS.section}>
      <summary>{LABELS.section}</summary>
      <div className="studio-environment-inspector__body">
        {renderField("backgroundColor", LABELS.backgroundColor)}
        {renderField("ambientColor", LABELS.ambientColor)}
        {renderField("ambientIntensity", LABELS.ambientIntensity, "decimal")}
        {renderField("keyColor", LABELS.keyColor)}
        {renderField("keyIntensity", LABELS.keyIntensity, "decimal")}
        <div className="studio-environment-inspector__direction">
          {renderField("directionX", LABELS.directionX, "decimal")}
          {renderField("directionY", LABELS.directionY, "decimal")}
          {renderField("directionZ", LABELS.directionZ, "decimal")}
        </div>
        <label className="studio-environment-inspector__toggle">
          <input
            type="checkbox"
            checked={draft.shadowsEnabled}
            disabled={busy}
            onChange={(event) => update({ shadowsEnabled: event.currentTarget.checked })}
          />
          <span>{LABELS.shadowsEnabled}</span>
        </label>
        {renderField("shadowSoftness", LABELS.shadowSoftness, "decimal")}
        {messages.length === 0 ? null : (
          <StatusNotice id={errorId} tone="error">
            <ul className="studio-environment-inspector__errors">
              {messages.map((message) => <li key={message}>{message}</li>)}
            </ul>
          </StatusNotice>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => void apply()}>
          {LABELS.apply}
        </Button>
      </div>
    </details>
  );
}
