import type { CommitBatch } from "@aethertwin/command-bus";
import type { ProjectManifest, ProjectProfile, ProjectSnapshot } from "@aethertwin/core-model";
import type {
  AssetImportProgress,
  AssetImportRequest,
  AssetImportResult,
} from "@aethertwin/asset-pipeline";

export interface BackendAssetSource {
  readonly assetId: string;
  readonly url: string;
}

export interface CreateProjectRequest {
  name: string;
  location: string;
  profile: ProjectProfile;
}

export interface OpenedProject {
  projectPath: string;
  manifest: ProjectManifest;
  snapshot: ProjectSnapshot;
  recovered: boolean;
}

export interface CheckpointResult {
  readonly manifest: ProjectManifest;
  readonly snapshot: ProjectSnapshot;
}

export interface RecoveryConfirmation {
  readonly confirmed: true;
}

export interface ProjectBackend {
  readonly mode: "desktop" | "sandbox";
  createProject(request: CreateProjectRequest): Promise<OpenedProject>;
  openProject(projectPath: string): Promise<OpenedProject>;
  recoverProject(
    projectPath: string,
    confirmation: RecoveryConfirmation,
  ): Promise<OpenedProject>;
  importAsset(
    projectPath: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<AssetImportResult>;
  cancelAssetImport(projectPath: string, operationId: string): Promise<void>;
  resolveAsset(projectPath: string, assetId: string): Promise<BackendAssetSource>;
  commit(projectPath: string, batch: CommitBatch<ProjectSnapshot>): Promise<void>;
  checkpoint(projectPath: string, snapshot: ProjectSnapshot): Promise<CheckpointResult>;
  closeProject(projectPath: string): Promise<void>;
  /** Desktop-only capabilities. They are deliberately absent from sandbox backends. */
  openExportResult?(projectPath: string, relativePath: string): Promise<void>;
  revealExportResult?(projectPath: string, relativePath: string): Promise<void>;
}

export type {
  AssetImportProgress,
  AssetImportRequest,
  AssetImportResult,
} from "@aethertwin/asset-pipeline";
