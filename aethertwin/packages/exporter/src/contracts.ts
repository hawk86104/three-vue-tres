import type {
  SceneAssetIssue,
  SceneExportCapture,
  SceneExportFrame,
  SceneExportPort,
  SceneExportProvenance,
} from "@aethertwin/render-scene-3d";

export type {
  SceneAssetIssue,
  SceneExportFrame,
  SceneExportPort,
  SceneExportProvenance,
};

export type ProjectExportPreset = "full-hd" | "ultra-hd";

export type ProjectExportPhase =
  | "preparing-textures"
  | "rendering"
  | "uploading"
  | "encoding-publishing";

export interface ProjectExportProgress {
  readonly phase: ProjectExportPhase;
  readonly sentBytes: number | null;
  readonly totalBytes: number | null;
}

export type ProjectExportDimensions =
  | {
      readonly preset: "full-hd";
      readonly width: 1920;
      readonly height: 1080;
    }
  | {
      readonly preset: "ultra-hd";
      readonly width: 3840;
      readonly height: 2160;
    };

export type ProjectExportResult = ProjectExportDimensions & {
  readonly relativePath: string;
  readonly byteSize: number;
  readonly sha256: string;
};

export interface ProjectExportContext {
  readonly projectPath: string;
  readonly projectId: string;
  readonly snapshotSequence: number;
  readonly activeFloorId: string;
  readonly sessionGeneration: number;
  readonly assetIssues: readonly SceneAssetIssue[];
  readonly isCurrent: () => boolean;
}

export interface PreparedProjectExport {
  readonly capture: SceneExportCapture;
  readonly dimensions: ProjectExportDimensions;
  readonly expectedByteLength: number;
}

export interface ProjectExportBeginRequest {
  readonly provenance: SceneExportProvenance;
  readonly preset: ProjectExportPreset;
}

export type ProjectExportBeginResult = ProjectExportDimensions & {
  readonly exportId: string;
  readonly expectedByteLength: number;
  readonly maxChunkBytes: 1048576;
};

export interface ProjectExportBackend {
  begin(
    projectPath: string,
    request: ProjectExportBeginRequest,
  ): Promise<ProjectExportBeginResult>;
  writeChunk(
    projectPath: string,
    exportId: string,
    chunkIndex: number,
    bytes: Uint8Array,
  ): Promise<void>;
  finish(projectPath: string, exportId: string): Promise<ProjectExportResult>;
  cancel(projectPath: string, exportId: string): Promise<void>;
}
