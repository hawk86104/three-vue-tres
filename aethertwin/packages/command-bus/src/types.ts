import { ownedCopy } from "./ownership";

export interface PreparedMutation<S> {
  readonly next: S;
  readonly inversePayload: unknown;
}

export interface SequencedState {
  readonly sequence: number;
}

export interface CommandDefinition<S extends SequencedState, P> {
  readonly type: string;
  readonly prepare: (state: S, payload: P) => PreparedMutation<S>;
  readonly applyInverse: (state: S, inversePayload: unknown) => S;
}

export interface CommandIntent<S extends SequencedState> {
  readonly type: string;
  readonly payload: unknown;
  readonly prepare: (state: S) => PreparedMutation<S>;
  readonly applyInverse: (state: S, inversePayload: unknown) => S;
}

export function commandIntent<S extends SequencedState, P>(
  definition: CommandDefinition<S, P>,
  payload: P,
): CommandIntent<S> {
  const type = definition.type;
  const prepare = definition.prepare;
  const applyInverse = definition.applyInverse;
  const ownedPayload = ownedCopy(payload);
  return {
    type,
    payload: ownedPayload,
    prepare: (state: S) => prepare(state, ownedPayload),
    applyInverse: (state: S, inversePayload: unknown) => applyInverse(state, inversePayload),
  };
}

export interface JournalOperation {
  readonly sequence: number;
  readonly transactionId: string;
  readonly commandType: string;
  readonly payload: unknown;
  readonly inversePayload: unknown;
  readonly action: "apply" | "undo" | "redo";
  readonly timestamp: string;
}

export interface CommitBatch<S extends SequencedState> {
  readonly before: S;
  readonly after: S;
  readonly journal: readonly JournalOperation[];
}

export interface PersistencePort<S extends SequencedState> {
  readonly commit: (batch: CommitBatch<S>) => Promise<void>;
}
