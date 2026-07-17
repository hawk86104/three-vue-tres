import {
  commandIntent,
  type CommandDefinition,
  type CommandIntent,
  type JournalOperation,
  type PersistencePort,
  type SequencedState,
} from "./types";

interface HistoryOperation<S extends SequencedState> {
  readonly intent: CommandIntent<S>;
  readonly inversePayload: unknown;
  readonly applyRecord: JournalOperation;
}

interface HistoryEntry<S extends SequencedState> {
  readonly before: S;
  readonly after: S;
  readonly operations: readonly HistoryOperation<S>[];
}

type QueuedOperation = () => Promise<void>;

export class CommandBus<S extends SequencedState> {
  private state: S;
  private readonly persistence: PersistencePort<S>;
  private readonly undoStack: HistoryEntry<S>[] = [];
  private readonly redoStack: HistoryEntry<S>[] = [];
  private readonly queue: QueuedOperation[] = [];
  private queueRunning = false;

  constructor(initial: S, persistence: PersistencePort<S>) {
    this.state = initial;
    this.persistence = persistence;
  }

  getSnapshot(): S {
    return this.state;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute<P>(definition: CommandDefinition<S, P>, payload: P): Promise<S> {
    return this.transaction([commandIntent(definition, payload)]);
  }

  transaction(intents: readonly CommandIntent<S>[]): Promise<S> {
    const queuedIntents = [...intents];
    return this.enqueue(() => this.applyTransaction(queuedIntents));
  }

  undo(): Promise<S> {
    return this.enqueue(() => this.applyUndo());
  }

  redo(): Promise<S> {
    return this.enqueue(() => this.applyRedo());
  }

  private async applyTransaction(intents: readonly CommandIntent<S>[]): Promise<S> {
    if (intents.length === 0) {
      return this.state;
    }

    const before = this.state;
    const transactionId = crypto.randomUUID();
    const journal: JournalOperation[] = [];
    const operations: HistoryOperation<S>[] = [];
    let candidate = before;

    for (const intent of intents) {
      const prepared = intent.prepare(candidate);
      candidate = this.withNextSequence(prepared.next, candidate.sequence);
      const applyRecord: JournalOperation = {
        sequence: candidate.sequence,
        transactionId,
        commandType: intent.type,
        payload: intent.payload,
        inversePayload: prepared.inversePayload,
        action: "apply",
        timestamp: new Date().toISOString(),
      };
      journal.push(applyRecord);
      operations.push({ intent, inversePayload: prepared.inversePayload, applyRecord });
    }

    const historyEntry: HistoryEntry<S> = { before, after: candidate, operations };
    await this.persistence.commit({ before, after: candidate, journal });

    this.state = candidate;
    this.undoStack.push(historyEntry);
    this.redoStack.length = 0;
    return this.state;
  }

  private async applyUndo(): Promise<S> {
    const historyEntry = this.undoStack.at(-1);
    if (historyEntry === undefined) {
      return this.state;
    }

    const before = this.state;
    const transactionId = crypto.randomUUID();
    const journal: JournalOperation[] = [];
    let candidate = before;

    for (const operation of [...historyEntry.operations].reverse()) {
      const inverse = operation.intent.applyInverse(candidate, operation.inversePayload);
      candidate = this.withNextSequence(inverse, candidate.sequence);
      journal.push(
        this.replayRecord(operation.applyRecord, candidate.sequence, transactionId, "undo"),
      );
    }

    await this.persistence.commit({ before, after: candidate, journal });

    this.state = candidate;
    this.undoStack.pop();
    this.redoStack.push(historyEntry);
    return this.state;
  }

  private async applyRedo(): Promise<S> {
    const historyEntry = this.redoStack.at(-1);
    if (historyEntry === undefined) {
      return this.state;
    }

    const before = this.state;
    const transactionId = crypto.randomUUID();
    const journal: JournalOperation[] = [];
    let candidate = before;

    for (const operation of historyEntry.operations) {
      const prepared = operation.intent.prepare(candidate);
      candidate = this.withNextSequence(prepared.next, candidate.sequence);
      journal.push(
        this.replayRecord(operation.applyRecord, candidate.sequence, transactionId, "redo"),
      );
    }

    await this.persistence.commit({ before, after: candidate, journal });

    this.state = candidate;
    this.redoStack.pop();
    this.undoStack.push(historyEntry);
    return this.state;
  }

  private withNextSequence(state: S, previousSequence: number): S {
    return { ...state, sequence: previousSequence + 1 };
  }

  private replayRecord(
    original: JournalOperation,
    sequence: number,
    transactionId: string,
    action: "undo" | "redo",
  ): JournalOperation {
    return {
      ...original,
      sequence,
      transactionId,
      action,
      timestamp: new Date().toISOString(),
    };
  }

  private enqueue<R>(operation: () => Promise<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const queuedOperation = async (): Promise<void> => {
        try {
          const result = await operation();
          this.finishQueuedOperation();
          resolve(result);
        } catch (error) {
          this.finishQueuedOperation();
          reject(error);
        }
      };

      this.queue.push(queuedOperation);
      this.startNextOperation();
    });
  }

  private startNextOperation(): void {
    if (this.queueRunning) {
      return;
    }

    const operation = this.queue.shift();
    if (operation === undefined) {
      return;
    }

    this.queueRunning = true;
    void operation();
  }

  private finishQueuedOperation(): void {
    this.queueRunning = false;
    this.startNextOperation();
  }
}
