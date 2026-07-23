import type { Point2 } from "./geometry";
import type { Size2, Transform2D } from "./geometry";
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

export interface CalibrationEvidence {
  readonly sourcePointA: Point2;
  readonly sourcePointB: Point2;
  readonly measuredDistanceMm: number;
}

export interface PlanReference extends ProjectRecordBase {
  readonly floorId: string; readonly layerId: string; readonly assetId: string;
  readonly intrinsicSize: Size2; readonly transform: Transform2D;
  readonly opacity: number; readonly locked: boolean;
  readonly calibration: CalibrationEvidence | null;
}

export interface GuidedRoute extends ProjectRecordBase {
  readonly routeNetworkId: string;
  readonly stopNodeIds: readonly string[];
}

export interface MaterialDefinition extends ProjectRecordBase {
  readonly baseColor: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly opacity: number;
  readonly assetId: string | null;
}

export interface MaterialAssignment extends ProjectRecordBase {
  readonly materialId: string;
  readonly targetKind: "space-floor" | "wall" | "fixture";
  readonly targetId: string;
}

export interface SceneEnvironment {
  readonly backgroundColor: string;
  readonly ambient: { readonly color: string; readonly intensity: number };
  readonly key: { readonly color: string; readonly intensity: number; readonly direction: readonly [number, number, number] };
  readonly shadowsEnabled: boolean;
  readonly shadowSoftness: number;
}
