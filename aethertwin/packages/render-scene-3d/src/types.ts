import type {
  AssetMediaType,
  ProjectSnapshot,
} from "@aethertwin/core-model";
import type { ResolvedRoute } from "@aethertwin/route-engine";

export interface SceneVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SceneBounds3 {
  readonly min: SceneVector3;
  readonly max: SceneVector3;
}

export interface SceneCameraState {
  readonly position: SceneVector3;
  readonly target: SceneVector3;
  readonly fieldOfView: number;
}

export type SceneAssetIssueCode =
  | "ASSET_MISSING"
  | "ASSET_CORRUPT"
  | "ASSET_CODEC_PREVIEW_UNAVAILABLE";

export interface SceneAssetIssue {
  readonly assetId: string;
  readonly code: SceneAssetIssueCode;
}

export interface SceneGuidedRouteProjection {
  readonly guidedRouteId: string;
  readonly routeNetworkId: string;
  readonly resolvedRoute: ResolvedRoute;
}

export interface SceneRendererInput {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly activeGuidedRoute: SceneGuidedRouteProjection | null;
  readonly camera: SceneCameraState;
  readonly assetIssues: readonly SceneAssetIssue[];
}

export type SceneRecordKind =
  | "floor"
  | "wall-piece"
  | "opening"
  | "fixture-part"
  | "hotspot"
  | "route";

export type ScenePrimitiveTopology = "triangles" | "lines" | "points";

export interface SceneGeometry {
  readonly topology: ScenePrimitiveTopology;
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly normals: readonly number[];
  readonly uvs: readonly number[];
}

export type SceneMaterialRole =
  | "space-floor"
  | "wall"
  | "fixture"
  | "hotspot"
  | "route";

export interface SceneMaterialProjection {
  readonly role: SceneMaterialRole;
  readonly definitionId: string | null;
  readonly baseColor: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly opacity: number;
  readonly textureAssetId: string | null;
  readonly textureColorSpace: "srgb" | null;
}

export interface SceneSelectionOverlay {
  readonly color: "#58b8c4";
}

interface SceneRecordBase<Kind extends SceneRecordKind> {
  readonly key: string;
  readonly kind: Kind;
  readonly sourceIds: readonly string[];
  readonly selectionId: string | null;
  readonly selected: boolean;
  readonly bounds: SceneBounds3;
  readonly geometry: SceneGeometry;
  readonly material: SceneMaterialProjection;
  readonly materialTargetId: string | null;
  readonly selectionOverlay: SceneSelectionOverlay | null;
}

export type SceneRecord =
  | SceneRecordBase<"floor">
  | SceneRecordBase<"wall-piece">
  | SceneRecordBase<"opening">
  | SceneRecordBase<"fixture-part">
  | SceneRecordBase<"hotspot">
  | SceneRecordBase<"route">;

export type SceneProjectionIssueCode =
  | "SCENE_INVALID_RECORD"
  | "SCENE_FLOOR_TRIANGULATION_FAILED"
  | "SCENE_WALL_PROJECTION_FAILED"
  | "SCENE_FIXTURE_PROJECTION_FAILED"
  | "SCENE_ROUTE_PROJECTION_FAILED";

export interface SceneProjectionIssue {
  readonly code: SceneProjectionIssueCode;
  readonly sourceIds: readonly string[];
}

export interface SceneEnvironmentProjection {
  readonly backgroundColor: string;
  readonly ambient: {
    readonly color: string;
    readonly intensity: number;
  };
  readonly key: {
    readonly color: string;
    readonly intensity: number;
    readonly position: SceneVector3;
  };
  readonly shadows: {
    readonly enabled: boolean;
    readonly radius: number;
    readonly cameraBounds: SceneBounds3 | null;
  };
}

export interface SceneProjection {
  readonly records: readonly SceneRecord[];
  readonly bounds: SceneBounds3 | null;
  readonly requiredTextureAssetIds: readonly string[];
  readonly environment: SceneEnvironmentProjection | null;
  readonly issues: readonly SceneProjectionIssue[];
}

export interface SceneAssetSource {
  readonly assetId: string;
  readonly url: string;
  readonly mediaType: AssetMediaType;
}

export interface SceneAssetSourcePort {
  resolve(assetId: string): Promise<SceneAssetSource>;
}

export interface SceneRendererIssueReporter {
  report(issue: SceneAssetIssue): void;
  clear(assetId: string): void;
}

export type SceneRendererStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "recovering"
  | "failed"
  | "disabled"
  | "destroyed";

export interface SceneRendererEventSink {
  onSelectionChange(selectedIds: ReadonlySet<string>): void;
  onCameraChange(camera: SceneCameraState): void;
  onStatusChange(status: SceneRendererStatus, error: Error | null): void;
}

export type SceneFrameTarget = "scene" | "selection" | "route";

export interface SceneGpuLimits {
  readonly maxTextureSize: number;
  readonly maxRenderbufferSize: number;
  readonly maxSamples: number;
}

export interface SceneExportCapture {
  readonly scene: SceneProjection;
  readonly camera: SceneCameraState;
  readonly requiredTextureAssetIds: readonly string[];
  readonly limits: SceneGpuLimits;
}

export interface SceneExportRenderRequest {
  readonly width: number;
  readonly height: number;
}

export interface SceneExportFrame {
  readonly width: number;
  readonly height: number;
  readonly origin: "bottom-left";
  readonly rgba: Uint8Array;
}

export interface SceneExportPort {
  capture(): SceneExportCapture;
  waitForTextures(capture: SceneExportCapture): Promise<void>;
  render(
    capture: SceneExportCapture,
    request: SceneExportRenderRequest,
  ): Promise<SceneExportFrame>;
}

export interface SceneRendererDependencies {
  readonly assetSource: SceneAssetSourcePort;
  readonly issueReporter: SceneRendererIssueReporter;
}

export interface SceneRenderer {
  readonly exportPort: SceneExportPort;
  init(host: HTMLElement, sink: SceneRendererEventSink): Promise<void>;
  update(input: SceneRendererInput): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  frame(target: SceneFrameTarget): void;
  retry(): Promise<void>;
  destroy(): void;
}

export type SceneRendererFactory = (
  dependencies: SceneRendererDependencies,
) => SceneRenderer;
