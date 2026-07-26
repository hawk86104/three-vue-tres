import {
  commandIntent,
  type CommandDefinition,
  type CommandIntent,
  type CommitBatch,
  type JournalOperation,
  type PersistencePort,
  type SequencedState,
} from "./types";
import { deepFreeze, ownedCopy } from "./ownership";

interface HistoryOperation {
  readonly applyRecord: JournalOperation;
}

interface HistoryEntry<S extends SequencedState> {
  readonly before: S;
  readonly after: S;
  readonly operations: readonly HistoryOperation[];
}

type QueuedOperation = () => Promise<void>;

export class CommandBus<S extends SequencedState> {
  private state: S;
  private readonly commit: PersistencePort<S>["commit"];
  private readonly undoStack: HistoryEntry<S>[] = [];
  private readonly redoStack: HistoryEntry<S>[] = [];
  private readonly queue: QueuedOperation[] = [];
  private queueRunning = false;

  constructor(initial: S, persistence: PersistencePort<S>) {
    this.state = ownedCopy(initial);
    this.commit = persistence.commit.bind(persistence);
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
    const queuedIntents = intents.map((intent) => this.captureIntent(intent));
    return this.enqueue(() => this.applyTransaction(queuedIntents));
  }

  undo(): Promise<S> {
    return this.enqueue(() => this.applyUndo());
  }

  redo(): Promise<S> {
    return this.enqueue(() => this.applyRedo());
  }

  acknowledge(rebase: (snapshot: S) => S): Promise<S> {
    const capturedRebase = rebase;
    return this.enqueue(() => this.applyAcknowledgement(capturedRebase));
  }

  private async applyTransaction(intents: readonly CommandIntent<S>[]): Promise<S> {
    if (intents.length === 0) {
      return this.state;
    }

    const before = this.state;
    const transactionId = crypto.randomUUID();
    const journal: JournalOperation[] = [];
    const operations: HistoryOperation[] = [];
    let candidate = before;

    for (const intent of intents) {
      const prepared = intent.prepare(candidate);
      candidate = this.withNextSequence(prepared.next, candidate.sequence);
      const applyRecord = ownedCopy<JournalOperation>({
        sequence: candidate.sequence,
        transactionId,
        commandType: intent.type,
        payload: intent.payload,
        inversePayload: ownedCopy(prepared.inversePayload),
        action: "apply",
        timestamp: new Date().toISOString(),
      });
      journal.push(applyRecord);
      operations.push(deepFreeze({ applyRecord }));
    }

    const historyEntry = this.createHistoryEntry(before, candidate, operations);
    await this.commitOwnedBatch(before, candidate, journal);

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
    const reversedOperations = [...historyEntry.operations].reverse();

    for (const [index, operation] of reversedOperations.entries()) {
      journal.push(
        this.replayRecord(
          operation.applyRecord,
          before.sequence + index + 1,
          transactionId,
          "undo",
        ),
      );
    }
    const candidate = this.withSequence(
      historyEntry.before,
      before.sequence + historyEntry.operations.length,
    );

    await this.commitOwnedBatch(before, candidate, journal);

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

    for (const [index, operation] of historyEntry.operations.entries()) {
      journal.push(
        this.replayRecord(
          operation.applyRecord,
          before.sequence + index + 1,
          transactionId,
          "redo",
        ),
      );
    }
    const candidate = this.withSequence(
      historyEntry.after,
      before.sequence + historyEntry.operations.length,
    );

    await this.commitOwnedBatch(before, candidate, journal);

    this.state = candidate;
    this.redoStack.pop();
    this.undoStack.push(historyEntry);
    return this.state;
  }

  private async applyAcknowledgement(rebase: (snapshot: S) => S): Promise<S> {
    const rebaseSnapshot = (snapshot: S): S => {
      const rebased = ownedCopy(rebase(snapshot));
      if (rebased.sequence !== snapshot.sequence) {
        throw new Error("Acknowledgement cannot change snapshot sequence");
      }
      return rebased;
    };
    const state = rebaseSnapshot(this.state);
    const undoStack = this.undoStack.map((entry) =>
      this.createHistoryEntry(
        rebaseSnapshot(entry.before),
        rebaseSnapshot(entry.after),
        entry.operations,
      ),
    );
    const redoStack = this.redoStack.map((entry) =>
      this.createHistoryEntry(
        rebaseSnapshot(entry.before),
        rebaseSnapshot(entry.after),
        entry.operations,
      ),
    );

    this.state = state;
    this.undoStack.splice(0, this.undoStack.length, ...undoStack);
    this.redoStack.splice(0, this.redoStack.length, ...redoStack);
    return this.state;
  }

  private withNextSequence(state: S, previousSequence: number): S {
    return this.withSequence(state, previousSequence + 1);
  }

  private withSequence(state: S, sequence: number): S {
    return ownedCopy({ ...state, sequence });
  }

  private replayRecord(
    original: JournalOperation,
    sequence: number,
    transactionId: string,
    action: "undo" | "redo",
  ): JournalOperation {
    return ownedCopy({
      ...original,
      sequence,
      transactionId,
      action,
      timestamp: new Date().toISOString(),
    });
  }

  private captureIntent(intent: CommandIntent<S>): CommandIntent<S> {
    const type = intent.type;
    const payload = ownedCopy(intent.payload);
    const prepare = intent.prepare;
    const applyInverse = intent.applyInverse;
    return deepFreeze({ type, payload, prepare, applyInverse });
  }

  private createHistoryEntry(
    before: S,
    after: S,
    operations: readonly HistoryOperation[],
  ): HistoryEntry<S> {
    return deepFreeze({
      before: ownedCopy(before),
      after: ownedCopy(after),
      operations: operations.map((operation) => ownedCopy(operation)),
    });
  }

  private async commitOwnedBatch(
    before: S,
    after: S,
    journal: readonly JournalOperation[],
  ): Promise<void> {
    const batch = ownedCopy<CommitBatch<S>>({ before, after, journal });
    await this.commit(batch);
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
