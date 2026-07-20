import type { ProjectProfile } from "@aethertwin/core-model";
import { Badge, Button, Panel, StatusNotice } from "@aethertwin/design-system";
import type { RecentProject } from "@aethertwin/project-store";

export interface ProjectCenterProps {
  mode?: "desktop" | "sandbox";
  error: string | null;
  opening: boolean;
  recentProjects: readonly RecentProject[];
  onOpen(path: string): void;
  onOpenExisting?(): void;
  onStartCreate(profile: ProjectProfile): void;
}

const profileLabels: Record<ProjectProfile, string> = {
  showroom: "店铺展厅",
  market: "市集导览",
};

export function ProjectCenter({
  mode = "sandbox",
  error,
  opening,
  recentProjects,
  onOpen,
  onOpenExisting = () => undefined,
  onStartCreate,
}: ProjectCenterProps) {
  const newestProject = recentProjects[0];
  const isDesktop = mode === "desktop";

  return (
    <main className="studio-project-center">
      <header className="studio-project-center__hero">
        <div>
          <p className="studio-project-center__eyebrow">灵境孪生</p>
          <h1>AetherTwin Studio</h1>
          <p className="studio-project-center__summary">
            {isDesktop
              ? "从两个明确的空间档案开始，在本地持久化真实项目。"
              : "从两个明确的空间档案开始，在浏览器会话中体验真实项目流程。"}
          </p>
        </div>
        <Badge tone="accent">
          {isDesktop ? "本地项目 · 持久保存" : "Web 沙盒 · 不持久保存"}
        </Badge>
      </header>

      {error === null ? null : <StatusNotice tone="error">{error}</StatusNotice>}

      <section className="studio-project-center__actions" aria-label="项目操作">
        <Panel className="studio-project-center__action-card">
          <p className="studio-project-center__card-kicker">SHOWROOM</p>
          <h2>店铺展厅</h2>
          <p>创建带有初始楼层的店铺展厅项目。</p>
          <Button onClick={() => onStartCreate("showroom")}>新建店铺展厅</Button>
        </Panel>
        <Panel className="studio-project-center__action-card">
          <p className="studio-project-center__card-kicker">MARKET</p>
          <h2>市集导览</h2>
          <p>创建带有初始楼层的市集导览项目。</p>
          <Button onClick={() => onStartCreate("market")}>新建市集导览</Button>
        </Panel>
        <Panel className="studio-project-center__action-card">
          <p className="studio-project-center__card-kicker">
            {isDesktop ? "OPEN PROJECT" : "SANDBOX"}
          </p>
          <h2>{isDesktop ? "本地项目" : "当前会话"}</h2>
          <p>
            {isDesktop
              ? "从本地选择一个现有 AetherTwin 项目并打开。"
              : "重新打开当前 Web 沙盒会话中最近使用的项目。"}
          </p>
          {isDesktop ? (
            <Button
              variant="secondary"
              busy={opening}
              disabled={opening}
              onClick={onOpenExisting}
            >
              打开本地项目
            </Button>
          ) : (
            <Button
              variant="secondary"
              busy={opening}
              disabled={newestProject === undefined}
              onClick={() => {
                if (newestProject !== undefined) onOpen(newestProject.path);
              }}
            >
              打开沙盒项目
            </Button>
          )}
        </Panel>
      </section>

      <Panel className="studio-project-center__recent" aria-label="最近项目">
        <div className="studio-project-center__recent-heading">
          <div>
            <p className="studio-project-center__card-kicker">RECENT</p>
            <h2>最近项目</h2>
          </div>
          <span>{recentProjects.length} 个</span>
        </div>
        {recentProjects.length === 0 ? (
          <div className="studio-empty-state">
            <p>{isDesktop ? "还没有本地项目" : "还没有沙盒项目"}</p>
            <span>
              {isDesktop
                ? "打开或新建的本地项目会显示在这里。"
                : "新建的项目会在当前会话中显示在这里。"}
            </span>
          </div>
        ) : (
          <ul className="studio-recent-list">
            {recentProjects.map((project) => (
              <li key={project.path}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{profileLabels[project.profile]}</span>
                </div>
                <Badge tone="accent">{project.profile}</Badge>
                <Button
                  variant="ghost"
                  disabled={opening}
                  onClick={() => onOpen(project.path)}
                  aria-label={`重新打开 ${project.name}`}
                >
                  重新打开
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
