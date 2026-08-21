import type { ProjectProfile } from "@aethertwin/core-model";
import { Badge, Button, Dialog, Panel, StatusNotice } from "@aethertwin/design-system";
import type { RecentProject } from "@aethertwin/project-store";
import { useState } from "react";
import { type StudioMessageDescriptor, type StudioMessageId } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";
import { LanguageSwitcher } from "../../i18n/language-switcher";

const profileLabelIds: Readonly<Record<ProjectProfile, StudioMessageId>> = {
  showroom: "profile.showroom",
  market: "profile.market",
};
const backendBadgeIds: Readonly<Record<NonNullable<ProjectCenterProps["mode"]>, StudioMessageId>> = {
  desktop: "projectCenter.desktopBadge",
  sandbox: "projectCenter.sandboxBadge",
};

export interface ProjectCenterProps {
  mode?: "desktop" | "sandbox";
  error: StudioMessageDescriptor | null;
  opening: boolean;
  recoveryAvailable?: boolean;
  recentProjects: readonly RecentProject[];
  onOpen(path: string): void;
  onOpenExisting?(): void;
  onRecover?(): void;
  onStartCreate(profile: ProjectProfile): void;
}

export function ProjectCenter({
  mode = "sandbox",
  error,
  opening,
  recoveryAvailable = false,
  recentProjects,
  onOpen,
  onOpenExisting = () => undefined,
  onRecover = () => undefined,
  onStartCreate,
}: ProjectCenterProps) {
  const [confirmingRecovery, setConfirmingRecovery] = useState(false);
  const newestProject = recentProjects[0];
  const isDesktop = mode === "desktop";
  const { format, t } = useI18n();

  return (
    <main className="studio-project-center">
      <header className="studio-project-center__hero">
        <div>
          <p className="studio-project-center__eyebrow">{t("projectCenter.eyebrow")}</p>
          <h1>{t("projectCenter.title")}</h1>
          <p className="studio-project-center__summary">
            {isDesktop
              ? t("projectCenter.desktopSummary") : t("projectCenter.sandboxSummary")}
          </p>
        </div>
        <Badge tone="accent">
          {t(backendBadgeIds[mode])}
        </Badge>
        <LanguageSwitcher />
      </header>

      {error === null ? null : (
        <div>
          <StatusNotice tone="error">{format(error)}</StatusNotice>
          {isDesktop && recoveryAvailable ? (
            <Button variant="secondary" onClick={() => setConfirmingRecovery(true)}>
              {t("projectCenter.recover")}
            </Button>
          ) : null}
        </div>
      )}

      <Dialog
        open={confirmingRecovery}
        onOpenChange={setConfirmingRecovery}
        title={t("projectCenter.recoveryTitle")}
        description={t("projectCenter.recoveryDescription")}
      >
        <div className="aether-dialog__actions">
          <Button variant="ghost" onClick={() => setConfirmingRecovery(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button
            onClick={() => {
              setConfirmingRecovery(false);
              onRecover();
            }}
          >
            {t("projectCenter.confirmRecover")}
          </Button>
        </div>
      </Dialog>

      <section className="studio-project-center__actions" aria-label={t("projectCenter.actionsLabel")}>
        <Panel className="studio-project-center__action-card">
          <p className="studio-project-center__card-kicker">{t("projectCenter.showroomKicker")}</p>
          <h2>{t("projectCenter.showroom")}</h2>
          <p>{t("projectCenter.showroomDescription")}</p>
          <Button onClick={() => onStartCreate("showroom")}>{t("projectCenter.createShowroom")}</Button>
        </Panel>
        <Panel className="studio-project-center__action-card">
          <p className="studio-project-center__card-kicker">{t("projectCenter.marketKicker")}</p>
          <h2>{t("projectCenter.market")}</h2>
          <p>{t("projectCenter.marketDescription")}</p>
          <Button onClick={() => onStartCreate("market")}>{t("projectCenter.createMarket")}</Button>
        </Panel>
        <Panel className="studio-project-center__action-card">
          <p className="studio-project-center__card-kicker">
            {isDesktop ? t("projectCenter.desktopOpenKicker") : t("projectCenter.sandboxOpenKicker")}
          </p>
          <h2>{t("projectCenter.openProject")}</h2>
          <p>
            {isDesktop
              ? t("projectCenter.openDesktopDescription") : t("projectCenter.openSandboxDescription")}
          </p>
          {isDesktop ? (
            <Button
              variant="secondary"
              busy={opening}
              disabled={opening}
              onClick={onOpenExisting}
            >
              {t("projectCenter.openDesktop")}
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
              {t("projectCenter.openSandbox")}
            </Button>
          )}
        </Panel>
      </section>

      <Panel className="studio-project-center__recent" aria-label={t("projectCenter.recent")}>
        <div className="studio-project-center__recent-heading">
          <div>
            <p className="studio-project-center__card-kicker">{t("projectCenter.recentKicker")}</p>
            <h2>{t("projectCenter.recent")}</h2>
          </div>
          <span>{t("projectCenter.projectCount", { count: recentProjects.length })}</span>
        </div>
        {recentProjects.length === 0 ? (
          <div className="studio-empty-state">
            <p>{isDesktop ? t("projectCenter.desktopEmpty") : t("projectCenter.sandboxEmpty")}</p>
            <span>
              {isDesktop
                ? t("projectCenter.desktopEmptyDescription") : t("projectCenter.sandboxEmptyDescription")}
            </span>
          </div>
        ) : (
          <ul className="studio-recent-list">
            {recentProjects.map((project) => (
              <li key={project.path}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{t(profileLabelIds[project.profile])}</span>
                </div>
                <Badge tone="accent">{t(profileLabelIds[project.profile])}</Badge>
                <Button
                  variant="ghost"
                  disabled={opening}
                  onClick={() => onOpen(project.path)}
                  aria-label={t("projectCenter.reopenProject", { name: project.name })}
                >
                  {t("projectCenter.reopen")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
