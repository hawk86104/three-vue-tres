export interface PlanIssue {
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
}

export type PlanResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: PlanIssue };

export function planSuccess<T>(value: T): PlanResult<T> {
  return { ok: true, value };
}

export function planFailure<T>(code: string, message: string, entityId?: string): PlanResult<T> {
  return entityId === undefined
    ? { ok: false, issue: { code, message } }
    : { ok: false, issue: { code, message, entityId } };
}
