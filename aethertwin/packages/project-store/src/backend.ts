import type { CommitBatch } from "@aethertwin/command-bus";
import type { ProjectManifest, ProjectProfile, ProjectSnapshot } from "@aethertwin/core-model";

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

export interface ProjectBackend {
  readonly mode: "desktop" | "sandbox";
  createProject(request: CreateProjectRequest): Promise<OpenedProject>;
  openProject(projectPath: string): Promise<OpenedProject>;
  commit(projectPath: string, batch: CommitBatch<ProjectSnapshot>): Promise<void>;
  checkpoint(projectPath: string, snapshot: ProjectSnapshot): Promise<ProjectManifest>;
  closeProject(projectPath: string): Promise<void>;
}
