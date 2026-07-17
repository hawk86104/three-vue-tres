import type { CommitBatch } from "@aethertwin/command-bus";
import {
  createInitialSnapshot,
  createManifest,
  parseManifest,
  parseSnapshot,
  type ProjectManifest,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type { CreateProjectRequest, OpenedProject, ProjectBackend } from "./backend";

const SANDBOX_APP_VERSION = "0.1.0";

function cloneOpenedProject(project: OpenedProject): OpenedProject {
  return Object.freeze({
    projectPath: project.projectPath,
    manifest: parseManifest(project.manifest),
    snapshot: parseSnapshot(project.snapshot),
    recovered: project.recovered,
  });
}

export class SandboxProjectBackend implements ProjectBackend {
  readonly mode = "sandbox" as const;
  checkpointCount = 0;
  failNextCommit: Error | null = null;

  private readonly projects = new Map<string, OpenedProject>();
  private nextId = 1;
  private nextTimestamp = 0;

  async createProject(request: CreateProjectRequest): Promise<OpenedProject> {
    const snapshot = createInitialSnapshot({
      name: request.name,
      profile: request.profile,
      uuid: () => this.createUuid(),
    });
    const manifest = createManifest(snapshot, {
      now: () => this.createTimestamp(),
      appVersion: SANDBOX_APP_VERSION,
    });
    const projectPath = `sandbox://${snapshot.project.id}`;
    const opened = cloneOpenedProject({
      projectPath,
      manifest,
      snapshot,
      recovered: false,
    });
    this.projects.set(projectPath, cloneOpenedProject(opened));
    return cloneOpenedProject(opened);
  }

  async openProject(projectPath: string): Promise<OpenedProject> {
    return cloneOpenedProject(this.getProject(projectPath));
  }

  async commit(projectPath: string, batch: CommitBatch<ProjectSnapshot>): Promise<void> {
    const failure = this.failNextCommit;
    this.failNextCommit = null;
    if (failure !== null) {
      throw failure;
    }

    const current = this.getProject(projectPath);
    const snapshot = parseSnapshot(batch.after);
    this.projects.set(
      projectPath,
      cloneOpenedProject({ ...current, snapshot }),
    );
  }

  async checkpoint(projectPath: string, snapshot: ProjectSnapshot): Promise<ProjectManifest> {
    const current = this.getProject(projectPath);
    const ownedSnapshot = parseSnapshot(snapshot);
    const manifest = parseManifest({
      ...current.manifest,
      name: ownedSnapshot.project.name,
      profile: ownedSnapshot.project.profile,
      updatedAt: this.createTimestamp(),
    });
    this.checkpointCount += 1;
    this.projects.set(
      projectPath,
      cloneOpenedProject({ ...current, manifest, snapshot: ownedSnapshot, recovered: false }),
    );
    return parseManifest(manifest);
  }

  async closeProject(projectPath: string): Promise<void> {
    this.getProject(projectPath);
  }

  private getProject(projectPath: string): OpenedProject {
    const project = this.projects.get(projectPath);
    if (project === undefined) {
      throw new Error(`Sandbox project not found: ${projectPath}`);
    }
    return project;
  }

  private createUuid(): string {
    const suffix = String(this.nextId).padStart(12, "0");
    this.nextId += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }

  private createTimestamp(): string {
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, this.nextTimestamp)).toISOString();
    this.nextTimestamp += 1;
    return timestamp;
  }
}
