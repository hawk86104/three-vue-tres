export type RouteMutationErrorCode =
  | "ROUTE_ZERO_LENGTH"
  | "ROUTE_COLLINEAR_OVERLAP"
  | "ROUTE_COMPLEXITY_LIMIT";

export interface RouteMutationError {
  readonly code: RouteMutationErrorCode;
  readonly message: string;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function routeSuccess<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function routeFailure<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
