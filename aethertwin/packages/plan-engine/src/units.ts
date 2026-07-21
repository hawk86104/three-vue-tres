import { planFailure, planSuccess, type PlanResult } from "./result";

export type DisplayUnit = "m" | "cm" | "mm";

const millimetresPerUnit: Readonly<Record<DisplayUnit, number>> = {
  m: 1000,
  cm: 10,
  mm: 1,
};

const lengthPattern = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(m|cm|mm)?\s*$/;

function invalidLength(text: string): PlanResult<number> {
  return planFailure("INVALID_LENGTH", `Invalid length: "${text}".`);
}

function isDisplayUnit(unit: string): unit is DisplayUnit {
  return unit === "m" || unit === "cm" || unit === "mm";
}

export function parseLength(text: string, defaultUnit: DisplayUnit): PlanResult<number> {
  if (!isDisplayUnit(defaultUnit)) return invalidLength(text);

  const match = lengthPattern.exec(text);
  if (match === null) return invalidLength(text);

  const value = Number(match[1]);
  const unit = match[2] ?? defaultUnit;
  if (!Number.isFinite(value) || value < 0 || !isDisplayUnit(unit)) return invalidLength(text);

  return planSuccess(value * millimetresPerUnit[unit]);
}

export function formatLength(
  millimetres: number,
  unit: DisplayUnit,
  maximumFractionDigits = 3,
): string {
  if (
    !Number.isFinite(millimetres)
    || !isDisplayUnit(unit)
    || !Number.isInteger(maximumFractionDigits)
    || maximumFractionDigits < 0
    || maximumFractionDigits > 100
  ) {
    throw new RangeError("Length and formatting precision must be finite and valid.");
  }

  const value = millimetres / millimetresPerUnit[unit];
  const formatted = value.toFixed(maximumFractionDigits);
  const trimmed = formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
  return `${trimmed === "-0" ? "0" : trimmed}${unit}`;
}
