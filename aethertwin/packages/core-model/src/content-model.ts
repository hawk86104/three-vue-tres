import type { Point2 } from "./geometry";
import type { ProjectProfile } from "./model";
import type { ProjectRecordBase } from "./spatial-entities";

export interface Opening extends ProjectRecordBase { readonly wallId: string; readonly kind: "door" | "window"; readonly distanceAlongWall: number; readonly width: number; readonly height: number; readonly sillHeight: number }
export interface Vendor extends ProjectRecordBase { readonly spaceUnitId: string | null; readonly externalId: string; readonly category: string; readonly status: "unassigned" | "active" | "inactive" }
export interface ProductContent extends ProjectRecordBase { readonly targetEntityId: string; readonly description: string; readonly mediaAssetIds: readonly string[] }
export interface MediaAsset extends ProjectRecordBase { readonly assetId: string; readonly kind: "image" | "video" | "audio" | "model" | "document" }
export interface RouteNode extends ProjectRecordBase { readonly position: Point2; readonly floorId: string; readonly kind: string }
export interface RouteEdge extends ProjectRecordBase { readonly from: string; readonly to: string; readonly distance: number; readonly bidirectional: boolean; readonly accessible: boolean; readonly enabled: boolean; readonly width: number; readonly weight: number }
export interface RouteNetwork extends ProjectRecordBase { readonly nodes: readonly RouteNode[]; readonly edges: readonly RouteEdge[] }
export interface ThemeConfig extends ProjectRecordBase { readonly profile: ProjectProfile; readonly values: Readonly<Record<string, string | number | boolean>> }
export interface CameraShot extends ProjectRecordBase { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fieldOfView: number }
export interface StorySequence extends ProjectRecordBase { readonly cameraShotIds: readonly string[]; readonly duration: number }
