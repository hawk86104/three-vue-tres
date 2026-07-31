import { Button } from "@aethertwin/design-system";
import { useEffect, useState, type KeyboardEvent } from "react";
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
      aria-label="房间识别"
    >
      <header>
        <strong>房间识别</strong>
        <Button variant="ghost" onClick={onClose}>关闭房间识别</Button>
      </header>
      <label>
        识别容差（毫米）
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.1}
          value={toleranceText}
          aria-label="识别容差（毫米）"
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
        <p role="alert">容差必须在 0.1 到 100 毫米之间。</p>
      )}
      <Button
        variant="secondary"
        disabled={!toleranceValid || busy}
        onClick={onRecognize}
      >
        重新识别
      </Button>
      {state.stale ? <p>识别结果已过期，请重新识别。</p> : null}
      {state.persistenceError === undefined ? null : (
        <p>保存失败：{state.persistenceError}</p>
      )}
      <ul aria-label="房间候选">
        {state.candidates.map((candidate, index) => {
          const represented = representedKeys.has(candidate.key);
          return (
            <li key={candidate.key}>
              <button
                type="button"
                aria-label={`选择房间候选 ${index + 1}`}
                aria-pressed={candidate.key === state.selectedCandidateKey}
                onClick={() => onSelectCandidate(candidate.key)}
              >
                候选 {index + 1} · {metric(candidate.area / 1_000_000)} m² ·{" "}
                {metric(candidate.perimeter / 1_000)} m · {candidate.wallIds.length} 面墙 ·{" "}
                {represented ? "已存在" : "待确认"}
              </button>
            </li>
          );
        })}
      </ul>
      {state.diagnostics.length === 0 ? null : (
        <ul aria-label="识别诊断">
          {state.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${diagnostic.wallIds.join("-")}-${index}`}>
              {diagnostic.code} · {diagnostic.wallIds.join(", ")}
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
          确认当前候选
        </Button>
        <Button
          variant="secondary"
          disabled={mutationsDisabled || unrepresentedCount === 0}
          onClick={onConfirmAll}
        >
          确认全部候选
        </Button>
        <Button
          variant="secondary"
          disabled={
            mutationsDisabled || selected === undefined || !canReplaceSelectedRoom
          }
          onClick={onReplaceSelectedRoom}
        >
          用候选替换所选房间
        </Button>
      </footer>
    </section>
  );
}
