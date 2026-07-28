import type {
  AssetMediaType,
  Bounds2,
  Point2,
  ProjectSnapshot,
  SpatialEntity,
} from "@aethertwin/core-model";
import type { CalibrationPreview, ViewportTransform } from "@aethertwin/plan-engine";

export interface PlanRendererInput {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly viewport: ViewportTransform;
  readonly selectedIds: ReadonlySet<string>;
  readonly draft: readonly SpatialEntity[] | null;
  readonly calibrationPreview?: CalibrationPreview | null;
}

export interface ProjectAssetSource {
  readonly assetId: string;
  readonly url: string;
  readonly mediaType: AssetMediaType;
}

export interface PlanAssetSourcePort {
  resolve(assetId: string): Promise<ProjectAssetSource>;
  reportRetirementError?(error: unknown): void;
}

export interface PlanPointerEvent {
  readonly type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "wheel";
  readonly pointerId: number;
  readonly screen: Point2;
  readonly buttons: number;
  readonly wheelDelta?: Point2;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export interface PlanRendererEventSink {
  handle(event: PlanPointerEvent): void;
}

export interface PlanRenderer {
  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void>;
  update(input: PlanRendererInput): void;
  invalidateAsset?(assetId: string): void;
  resize(width: number, height: number, resolution: number): void;
  destroy(): void;
}

export type PlanRendererFactory = () => PlanRenderer;

export type RenderGeometry =
  | {
      readonly kind: "polygon" | "polyline";
      readonly points: readonly Point2[];
      readonly closed: boolean;
    }
  | { readonly kind: "circle"; readonly center: Point2; readonly radius: number }
  | {
      readonly kind: "dimension";
      readonly start: Point2;
      readonly end: Point2;
      readonly label: Point2;
      readonly millimetres: number;
    }
  | {
      readonly kind: "image";
      readonly assetId: string;
      readonly corners: readonly [Point2, Point2, Point2, Point2];
      readonly opacity: number;
    };

export interface RenderNode {
  readonly key: string;
  readonly entityId: string;
  readonly layer: "grid" | "reference" | "content" | "annotation" | "overlay";
  readonly geometry: RenderGeometry;
  readonly bounds: Bounds2;
  readonly styleToken: string;
  readonly selected: boolean;
  readonly locked: boolean;
}

export interface RenderScene {
  readonly nodes: readonly RenderNode[];
}

export interface PlanRenderPort {
  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void>;
  upsert(node: RenderNode): void;
  remove(key: string): void;
  invalidateAsset(assetId: string): void;
  resize(width: number, height: number, resolution: number): void;
  render(): void;
  destroy(): void;
}

export type PlanRenderPortFactory = (sourcePort: PlanAssetSourcePort) => PlanRenderPort;
