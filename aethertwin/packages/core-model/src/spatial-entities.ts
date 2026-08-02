import type { Point2, Size2, Spatial3D, Transform2D } from "./geometry";

export interface ProjectRecordBase { readonly id: string; readonly name: string; readonly tags: readonly string[] }
export interface PlanLayer extends ProjectRecordBase { readonly visible: boolean; readonly locked: boolean }
export interface Floor extends ProjectRecordBase { readonly layers: readonly PlanLayer[] }
export interface SpatialEntityBase extends ProjectRecordBase {
  readonly floorId: string; readonly layerId: string; readonly transform: Transform2D;
  readonly spatial3D?: Spatial3D; readonly locked: boolean;
}
export type SpaceUnitKind = "room" | "shop" | "booth" | "exhibition" | "service" | "restricted";
export type FixtureKind = "display-case" | "display-table" | "shelf" | "checkout" | "screen" | "partition" | "signage" | "generic";
export type PointOfInterestKind = "entrance" | "exit" | "service-desk" | "restroom" | "accessible-restroom" | "stage" | "food" | "rest-area" | "medical" | "fire-safety" | "parking" | "charging" | "storage" | "nursery" | "water" | "atm" | "closed-area" | "custom" | "product-hotspot";
export interface Boundary extends SpatialEntityBase { readonly type: "boundary"; readonly polygon: readonly Point2[] }
export interface Wall extends SpatialEntityBase { readonly type: "wall"; readonly centerLine: readonly Point2[]; readonly thickness: number }
export interface Zone extends SpatialEntityBase { readonly type: "zone"; readonly polygon: readonly Point2[]; readonly purpose: string; readonly color: string }
export interface SpaceUnit extends SpatialEntityBase { readonly type: "space-unit"; readonly kind: SpaceUnitKind; readonly footprint: readonly Point2[] }
export interface Fixture extends SpatialEntityBase { readonly type: "fixture"; readonly kind: FixtureKind; readonly size: Size2 }
export interface PointOfInterest extends SpatialEntityBase { readonly type: "poi"; readonly kind: PointOfInterestKind; readonly radius?: number }
export type DimensionAnchor = { readonly kind: "point"; readonly point: Point2 } | { readonly kind: "entity"; readonly entityId: string; readonly locator: "origin" | { readonly vertex: number } | { readonly segment: number; readonly t: number } };
export interface DimensionAnnotation extends SpatialEntityBase { readonly type: "dimension"; readonly start: DimensionAnchor; readonly end: DimensionAnchor; readonly offset: number; readonly displayUnit?: "m" | "cm" | "mm" }
export type SpatialEntity = Boundary | Wall | Zone | SpaceUnit | Fixture | PointOfInterest | DimensionAnnotation;
