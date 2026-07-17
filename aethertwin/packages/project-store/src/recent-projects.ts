import type { ProjectProfile } from "@aethertwin/core-model";

const RECENT_PROJECTS_STORAGE_KEY = "aethertwin.recentProjects.v1";

export interface RecentProject {
  readonly path: string;
  readonly name: string;
  readonly profile: ProjectProfile;
  readonly openedAt: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function parseRecentProject(value: unknown): RecentProject | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.path !== "string" ||
    typeof record.name !== "string" ||
    (record.profile !== "showroom" && record.profile !== "market") ||
    typeof record.openedAt !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    path: record.path,
    name: record.name,
    profile: record.profile,
    openedAt: record.openedAt,
  });
}

function ownedRecentProjects(values: readonly RecentProject[]): readonly RecentProject[] {
  return Object.freeze(
    values.map((value) =>
      Object.freeze({
        path: value.path,
        name: value.name,
        profile: value.profile,
        openedAt: value.openedAt,
      }),
    ),
  );
}

export class RecentProjects {
  constructor(private readonly storage: KeyValueStorage) {}

  list(): readonly RecentProject[] {
    const serialized = this.storage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (serialized === null) {
      return ownedRecentProjects([]);
    }

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!Array.isArray(parsed)) {
        return ownedRecentProjects([]);
      }
      const projects = parsed.map(parseRecentProject);
      if (projects.some((project) => project === null)) {
        return ownedRecentProjects([]);
      }
      return ownedRecentProjects(projects as RecentProject[]);
    } catch {
      return ownedRecentProjects([]);
    }
  }

  record(project: RecentProject): void {
    const owned = parseRecentProject(project);
    if (owned === null) {
      throw new Error("Invalid recent project");
    }
    const next = [owned, ...this.list().filter((recent) => recent.path !== owned.path)];
    this.storage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
  }
}
