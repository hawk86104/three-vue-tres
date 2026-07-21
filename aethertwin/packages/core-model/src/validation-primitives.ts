export type ModelIssueCode =
  | "INVALID_TYPE"
  | "INVALID_VALUE"
  | "INVALID_UUID"
  | "DUPLICATE_UUID"
  | "INVALID_REFERENCE"
  | "INVALID_RELATIVE_PATH"
  | "DEGENERATE_GEOMETRY"
  | "SELF_INTERSECTING_POLYGON"
  | "UNSUPPORTED_SCHEMA_VERSION";

export class ModelValidationError extends Error {
  constructor(
    readonly code: ModelIssueCode,
    readonly path: string,
    detail: string,
  ) {
    super(`Invalid ${path}: ${detail}`);
    this.name = "ModelValidationError";
    Object.freeze(this);
  }
}

export type UnknownRecord = Record<string, unknown>;

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function fail(code: ModelIssueCode, path: string, detail: string): never {
  throw new ModelValidationError(code, path, detail);
}

export function record(value: unknown, path: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_TYPE", path, "expected an object");
  }
  return value as UnknownRecord;
}

export function text(value: unknown, path: string): string {
  if (typeof value !== "string") fail("INVALID_TYPE", path, "expected a string");
  return value;
}

export function nonEmpty(value: unknown, path: string): string {
  const result = text(value, path);
  if (!result.trim()) fail("INVALID_VALUE", path, "must not be empty");
  return result;
}

export function uuid(value: unknown, path: string): string {
  const result = text(value, path);
  if (!uuidPattern.test(result)) fail("INVALID_UUID", path, "expected a UUID");
  return result.toLowerCase();
}

export function finite(value: unknown, path: string): number {
  if (typeof value !== "number") fail("INVALID_TYPE", path, "expected a number");
  if (!Number.isFinite(value)) fail("INVALID_VALUE", path, "expected a finite number");
  return value;
}

export function positive(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result <= 0) fail("INVALID_VALUE", path, "must be positive");
  return result;
}

export function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail("INVALID_VALUE", path, "expected a non-negative safe integer");
  }
  return value as number;
}

export function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail("INVALID_TYPE", path, "expected a boolean");
  return value;
}

export function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_TYPE", path, "expected an array");
  return value;
}

export function strings(value: unknown, path: string): string[] {
  return list(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

export function oneOf<const Values extends readonly string[]>(
  value: unknown,
  path: string,
  values: Values,
): Values[number] {
  const candidate = text(value, path);
  if (!values.includes(candidate)) {
    fail("INVALID_VALUE", path, `expected one of ${values.join(", ")}`);
  }
  return candidate as Values[number];
}
