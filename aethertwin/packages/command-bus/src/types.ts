export interface PreparedMutation<S> {
  next: S;
  inversePayload: unknown;
}

export interface SequencedState {
  sequence: number;
}

export interface CommandDefinition<S extends SequencedState, P> {
  type: string;
  prepare(state: S, payload: P): PreparedMutation<S>;
  applyInverse(state: S, inversePayload: unknown): S;
}

export interface CommandIntent<S extends SequencedState> {
  type: string;
  payload: unknown;
  prepare(state: S): PreparedMutation<S>;
  applyInverse(state: S, inversePayload: unknown): S;
}

export function commandIntent<S extends SequencedState, P>(
  definition: CommandDefinition<S, P>,
  payload: P,
): CommandIntent<S> {
  return {
    type: definition.type,
    payload,
    prepare: (state) => definition.prepare(state, payload),
    applyInverse: (state, inversePayload) => definition.applyInverse(state, inversePayload),
  };
}

export interface JournalOperation {
  sequence: number;
  transactionId: string;
  commandType: string;
  payload: unknown;
  inversePayload: unknown;
  action: "apply" | "undo" | "redo";
  timestamp: string;
}

export interface CommitBatch<S extends SequencedState> {
  before: S;
  after: S;
  journal: JournalOperation[];
}

export interface PersistencePort<S extends SequencedState> {
  commit(batch: CommitBatch<S>): Promise<void>;
}
