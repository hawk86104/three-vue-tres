import { Button } from "@aethertwin/design-system";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/locale-provider";
import type { RoomRecognitionState } from "./editor-session";

export interface RoomRecognitionPanelProps {
  readonly state: RoomRecognitionState;
  readonly representedKeys: ReadonlySet<string>;
  readonly canReplaceSelectedRoom: boolean;
  readonly busy: boolean;
  readonly onToleranceChange: (toleranceMm: number) => void;
  readonly onRecognize: () => void;
  readonly onSelectCandidate: (key: string) => void;
  readonly onConfirmOne: () => void;
  readonly onConfirmAll: () => void;
  readonly onReplaceSelectedRoom: () => void;
  readonly onClose: () => void;
}

function metric(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toPrecision(12)));
}

export function RoomRecognitionPanel({
  state,
  representedKeys,
  canReplaceSelectedRoom,
  busy,
  onToleranceChange,
  onRecognize,
  onSelectCandidate,
  onConfirmOne,
  onConfirmAll,
  onReplaceSelectedRoom,
  onClose,
}: RoomRecognitionPanelProps) {
  const { t } = useI18n();
  const [toleranceText, setToleranceText] = useState(String(state.toleranceMm));
  useEffect(() => setToleranceText(String(state.toleranceMm)), [state.toleranceMm]);
  const parsedTolerance = Number(toleranceText);
  const toleranceValid = toleranceText.trim().length > 0
    && Number.isFinite(parsedTolerance)
    && parsedTolerance >= 0.1
    && parsedTolerance <= 100;
  const selected = state.candidates.find(
    (candidate) => candidate.key === state.selectedCandidateKey,
  );
  const selectedRepresented = selected !== undefined
    && representedKeys.has(selected.key);
  const unrepresentedCount = state.candidates.filter(
    (candidate) => !representedKeys.has(candidate.key),
  ).length;
  const mutationsDisabled = busy || state.stale;

  function recognizeFromKeyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !toleranceValid || busy) return;
    event.preventDefault();
    onRecognize();
  }

  return (
    <section
      className="studio-room-recognition"
      role="region"
      aria-label={t("recognition.panel")}
    >
      <header>
        <strong>{t("recognition.panel")}</strong>
        <Button variant="ghost" onClick={onClose}>{t("recognition.close")}</Button>
      </header>
      <label>
        {t("recognition.tolerance")}
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.1}
          value={toleranceText}
          aria-label={t("recognition.tolerance")}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setToleranceText(value);
            const parsed = Number(value);
            if (
              value.trim().length > 0
              && Number.isFinite(parsed)
              && parsed >= 0.1
              && parsed <= 100
            ) onToleranceChange(parsed);
          }}
          onKeyDown={recognizeFromKeyboard}
        />
      </label>
      {toleranceValid ? null : (
        <p role="alert">{t("recognition.invalidTolerance")}</p>
      )}
      <Button
        variant="secondary"
        disabled={!toleranceValid || busy}
        onClick={onRecognize}
      >
        {t("recognition.run")}
      </Button>
      {state.stale ? <p>{t("recognition.stale")}</p> : null}
      {state.persistenceError === undefined ? null : (
        <p>{t("recognition.persistenceFailed")}</p>
      )}
      <ul aria-label={t("recognition.candidates")}>
        {state.candidates.map((candidate, index) => {
          const represented = representedKeys.has(candidate.key);
          return (
            <li key={candidate.key}>
              <button
                type="button"
                aria-label={t("recognition.candidate", { index: index + 1 })}
                aria-pressed={candidate.key === state.selectedCandidateKey}
                onClick={() => onSelectCandidate(candidate.key)}
              >
                {t("recognition.candidateSummary", {
                  index: index + 1,
                  area: metric(candidate.area / 1_000_000),
                  perimeter: metric(candidate.perimeter / 1_000),
                  walls: candidate.wallIds.length,
                  state: represented ? t("recognition.represented") : t("recognition.pending"),
                })}
              </button>
            </li>
          );
        })}
      </ul>
      {state.diagnostics.length === 0 ? null : (
        <ul aria-label={t("recognition.diagnostics")}>
          {state.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${diagnostic.wallIds.join("-")}-${index}`}>
              {t("recognition.diagnostic")}
            </li>
          ))}
        </ul>
      )}
      <footer>
        <Button
          variant="primary"
          disabled={
            mutationsDisabled || selected === undefined || selectedRepresented
          }
          onClick={onConfirmOne}
        >
          {t("recognition.confirmOne")}
        </Button>
        <Button
          variant="secondary"
          disabled={mutationsDisabled || unrepresentedCount === 0}
          onClick={onConfirmAll}
        >
          {t("recognition.confirmAll")}
        </Button>
        <Button
          variant="secondary"
          disabled={
            mutationsDisabled || selected === undefined || !canReplaceSelectedRoom
          }
          onClick={onReplaceSelectedRoom}
        >
          {t("recognition.replace")}
        </Button>
      </footer>
    </section>
  );
}
