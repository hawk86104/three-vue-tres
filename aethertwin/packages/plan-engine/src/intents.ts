import type { Floor, SpatialEntity } from "@aethertwin/core-model";

export type PlanEditReason =
  | "create"
  | "delete"
  | "transform"
  | "properties"
  | "duplicate"
  | "array"
  | "align"
  | "distribute";

export interface EntityChange {
  readonly id: string;
  readonly before: SpatialEntity | null;
  readonly after: SpatialEntity | null;
  readonly index?: number;
}

export interface PlanEditIntent { readonly reason: PlanEditReason; readonly changes: readonly EntityChange[] }

export interface FloorChange { readonly floorId: string; readonly before: Floor; readonly after: Floor }
