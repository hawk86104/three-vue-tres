import type { ProjectProfile } from "@aethertwin/core-model";
import { Button } from "@aethertwin/design-system";
import {
  SHOWROOM_TOOL_GROUPS,
  type ShowroomToolActionId,
} from "@aethertwin/mode-showroom";
import type { SceneRendererStatus } from "@aethertwin/render-scene-3d";
import type { PlanTool, SceneViewMode } from "./editor-session";
import { useEffect, useId, useRef } from "react";
import { SHOWROOM_TOOL_ACTION_MESSAGE_IDS, SHOWROOM_TOOL_GROUP_MESSAGE_IDS } from "../../i18n/display-message-ids";
import type { StudioMessageId } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";

interface ToolDefinition {
  readonly tool: PlanTool;
  readonly label: StudioMessageId;
}

interface ToolActionDefinition {
  readonly id: ShowroomToolActionId;
  readonly label: StudioMessageId;
}

interface ToolGroup {
  readonly id: string;
  readonly label: StudioMessageId;
  readonly tools: readonly ToolDefinition[];
  readonly actions?: readonly ToolActionDefinition[];
}

export interface ExportActionState {
  readonly disabled: boolean;
  readonly reason: string | null;
  readonly active: boolean;
}

const toolById: Readonly<Record<PlanTool, ToolDefinition>> = {
  select: { tool: "select", label: "action.select" }, pan: { tool: "pan", label: "action.pan" },
  boundary: { tool: "boundary", label: "action.boundary" }, wall: { tool: "wall", label: "action.wall" },
  door: { tool: "door", label: "action.door" }, window: { tool: "window", label: "action.window" },
  zone: { tool: "zone", label: "action.zone" }, "space-unit": { tool: "space-unit", label: "toolbar.market.units" },
  fixture: { tool: "fixture", label: "action.fixtureCatalogue" }, poi: { tool: "poi", label: "action.poi" },
  dimension: { tool: "dimension", label: "action.dimension" }, "product-hotspot": { tool: "product-hotspot", label: "action.productHotspot" },
  "route-node": { tool: "route-node", label: "action.routeNode" }, "route-edge": { tool: "route-edge", label: "action.routeEdge" },
};

const showroomOpeningTools: readonly ToolDefinition[] = Object.freeze(
  SHOWROOM_TOOL_GROUPS
    .find(({ id }) => id === "building")
    ?.actions.flatMap(({ id }) => (
      id === "door" || id === "window" ? [toolById[id]] : []
    )) ?? [],
);

const showroomFixtureTools: readonly ToolDefinition[] = Object.freeze(
  SHOWROOM_TOOL_GROUPS
    .find(({ id }) => id === "fixtures")
    ?.actions.flatMap(({ id }) => (
      id === "fixture-catalogue"
        ? [{ ...toolById.fixture, label: SHOWROOM_TOOL_ACTION_MESSAGE_IDS[id] }]
        : []
    )) ?? [],
);
const showroomContentTools: readonly ToolDefinition[] = Object.freeze(
  SHOWROOM_TOOL_GROUPS
    .find(({ id }) => id === "content")
    ?.actions.flatMap(({ id }) => (
      id === "poi" || id === "dimension" || id === "product-hotspot"
        ? [toolById[id]]
        : []
    )) ?? [],
);

const showroomTourTools: readonly ToolDefinition[] = Object.freeze(
  SHOWROOM_TOOL_GROUPS
    .find(({ id }) => id === "tour")
    ?.actions.flatMap(({ id }) => (
      id === "route-node" || id === "route-edge"
        ? [toolById[id]]
        : []
    )) ?? [],
);

const showroomContentActions: readonly ToolActionDefinition[] = Object.freeze([
  { id: "attach-product-media", label: SHOWROOM_TOOL_ACTION_MESSAGE_IDS["attach-product-media"] },
]);
const showroomTourActions: readonly ToolActionDefinition[] = Object.freeze([
  { id: "edit-route-stops", label: SHOWROOM_TOOL_ACTION_MESSAGE_IDS["edit-route-stops"] },
  { id: "preview-guided-route", label: SHOWROOM_TOOL_ACTION_MESSAGE_IDS["preview-guided-route"] },
]);
const showroomPreviewActions: readonly ToolActionDefinition[] =
  SHOWROOM_TOOL_GROUPS.find(({ id }) => id === "preview")?.actions.map(({ id }) => ({
    id,
    label: SHOWROOM_TOOL_ACTION_MESSAGE_IDS[id],
  })) ?? Object.freeze([]);
const profileGroups: Readonly<Record<ProjectProfile, readonly ToolGroup[]>> = {
  market: [
    { id: "select", label: "toolbar.market.select", tools: [toolById.select, toolById.pan] },
    {
      id: "site", label: "toolbar.market.site",
      tools: [toolById.boundary, toolById.wall, toolById.zone],
    },
    {
      id: "units", label: "toolbar.market.units", tools: [toolById["space-unit"], toolById.fixture],
    },
    { id: "markers", label: "toolbar.market.markers", tools: [toolById.poi, toolById.dimension] },
  ],
  showroom: [
    { id: "select", label: SHOWROOM_TOOL_GROUP_MESSAGE_IDS.select, tools: [toolById.select, toolById.pan] },
    {
      id: "building", label: SHOWROOM_TOOL_GROUP_MESSAGE_IDS.building,
      tools: [
        toolById.boundary,
        toolById.wall,
        ...showroomOpeningTools,
        toolById.zone,
        { ...toolById["space-unit"], label: SHOWROOM_TOOL_ACTION_MESSAGE_IDS.room },
      ],
    },
    {
      id: "fixtures", label: SHOWROOM_TOOL_GROUP_MESSAGE_IDS.fixtures,
      tools: showroomFixtureTools,
    },
    {
      id: "content", label: SHOWROOM_TOOL_GROUP_MESSAGE_IDS.content,
      tools: showroomContentTools,
      actions: showroomContentActions,
    },
    {
      id: "tour", label: SHOWROOM_TOOL_GROUP_MESSAGE_IDS.tour,
      tools: showroomTourTools,
      actions: showroomTourActions,
    },
    {
      id: "preview", label: SHOWROOM_TOOL_GROUP_MESSAGE_IDS.preview,
      tools: [],
      actions: showroomPreviewActions,
    },
  ],
};

export interface PlanToolbarProps {
  readonly profile: ProjectProfile;
  readonly activeTool: PlanTool;
  readonly viewMode: SceneViewMode;
  readonly rendererStatus: SceneRendererStatus;
  readonly rendererError: string | null;
  readonly onRendererRetry: (initiator: HTMLButtonElement) => void;
  readonly onViewModeChange: (mode: SceneViewMode, initiator: HTMLButtonElement) => void;
  readonly onFrameSelection: (initiator: HTMLButtonElement) => void;
  readonly onFrameRoute: (initiator: HTMLButtonElement) => void;
  readonly previewLocked?: boolean;
  readonly exportAction: ExportActionState;
  readonly onExport: (initiator: HTMLButtonElement) => void;
  readonly onToolChange: (tool: PlanTool, initiator: HTMLButtonElement) => void;
  readonly onImportFloorPlan?: (initiator: HTMLButtonElement) => void;
  readonly importFloorPlanDisabled?: boolean;
  readonly onCalibrate?: (initiator: HTMLButtonElement) => void;
  readonly onRecognizeRooms?: (initiator: HTMLButtonElement) => void;
  readonly onAttachProductMedia?: (initiator: HTMLButtonElement) => void;
  readonly onEditRouteStops?: (initiator: HTMLButtonElement) => void;
  readonly onPreviewGuidedRoute?: (initiator: HTMLButtonElement) => void;
}

export function PlanToolbar({
  profile,
  activeTool,
  viewMode,
  rendererStatus,
  rendererError,
  onRendererRetry,
  onViewModeChange,
  onFrameSelection,
  onFrameRoute,
  previewLocked = false,
  exportAction,
  onExport,
  onToolChange,
  onImportFloorPlan,
  importFloorPlanDisabled = false,
  onCalibrate,
  onRecognizeRooms,
  onAttachProductMedia,
  onEditRouteStops,
  onPreviewGuidedRoute,
}: PlanToolbarProps) {
  const { t } = useI18n();
  const rendererUnavailable =
    rendererStatus === "failed" || rendererStatus === "disabled";
  const showRendererIssue = profile === "showroom" && rendererUnavailable;
  const rendererStatusId = useId();
  const exportReasonId = useId();
  const twoDButtonRef = useRef<HTMLButtonElement>(null);
  const previousRendererUnavailable = useRef(false);

  useEffect(() => {
    const newlyUnavailable =
      showRendererIssue && !previousRendererUnavailable.current;
    previousRendererUnavailable.current = showRendererIssue;
    if (!newlyUnavailable) return;
    const activeElement = document.activeElement;
    const action = activeElement instanceof HTMLElement
      ? activeElement.dataset.action
      : undefined;
    if (action !== "view-3d" && action !== "view-split") return;
    queueMicrotask(() => {
      if (document.activeElement !== activeElement) return;
      if (twoDButtonRef.current?.isConnected) twoDButtonRef.current.focus();
    });
  }, [showRendererIssue]);

  const rendererIssueText = t(rendererStatus === "disabled"
    ? "toolbar.rendererDisabled"
    : "toolbar.rendererUnavailable");
  return (
    <div className="studio-plan-toolbar" data-profile={profile}>
      {profileGroups[profile].map((group) => (
        <div
          key={group.id}
          className="studio-plan-toolbar__group"
          role="group"
          aria-label={t(group.label)}
        >
          <span className="studio-plan-toolbar__group-label" aria-hidden="true">
            {t(group.label)}
          </span>
          <div className="studio-plan-toolbar__tools">
            {group.tools.map(({ tool, label }) => {
              const active = tool === activeTool;
              const actionId = tool === "space-unit"
                ? "room"
                : tool === "fixture"
                  ? "fixture-catalogue"
                  : tool;
              return (
                <Button
                  key={tool}
                  variant="ghost"
                  className={
                    active
                      ? "studio-plan-toolbar__tool studio-plan-toolbar__tool--active"
                      : "studio-plan-toolbar__tool"
                  }
                  aria-pressed={active}
                  data-active={active ? "true" : undefined}
                  data-tool={tool}
                  data-action={profile === "showroom" ? actionId : undefined}
                  onClick={(event) => onToolChange(tool, event.currentTarget)}
                >
                  {t(label)}
                </Button>
              );
            })}
            {group.actions?.map(({ id, label }) => {
              let mode: SceneViewMode | null = null;
              let onClick: ((initiator: HTMLButtonElement) => void) | undefined;
              let actionDisabled = false;
              let describedBy: string | undefined;
              switch (id) {
                case "attach-product-media":
                  onClick = onAttachProductMedia;
                  break;
                case "edit-route-stops":
                  onClick = onEditRouteStops;
                  break;
                case "preview-guided-route":
                  onClick = onPreviewGuidedRoute;
                  break;
                case "view-2d":
                  mode = "2d";
                  onClick = (initiator) => onViewModeChange("2d", initiator);
                  break;
                case "view-3d":
                  mode = "3d";
                  onClick = (initiator) => onViewModeChange("3d", initiator);
                  break;
                case "view-split":
                  mode = "split";
                  onClick = (initiator) => onViewModeChange("split", initiator);
                  break;
                case "frame-selection":
                  onClick = onFrameSelection;
                  break;
                case "frame-route":
                  onClick = onFrameRoute;
                  break;
                case "export":
                  onClick = onExport;
                  actionDisabled = exportAction.disabled;
                  describedBy = exportAction.reason === null
                    ? undefined
                    : exportReasonId;
                  break;
              }
              const active = mode !== null && mode === viewMode;
              const previewAction = id === "view-2d"
                || id === "view-3d"
                || id === "view-split"
                || id === "frame-selection"
                || id === "frame-route";
              const unavailableViewAction =
                id === "view-3d" || id === "view-split";
              const disabled = actionDisabled || onClick === undefined
                || (previewLocked && previewAction)
                || (rendererUnavailable && unavailableViewAction);
              return (
                <Button
                  ref={id === "view-2d" ? twoDButtonRef : undefined}
                  key={id}
                  variant={active ? "primary" : "secondary"}
                  className="studio-plan-toolbar__action"
                  aria-pressed={mode === null ? undefined : active}
                  aria-describedby={describedBy ?? (
                    rendererUnavailable && unavailableViewAction
                      ? rendererStatusId
                      : undefined
                  )}
                  aria-busy={id === "export" && exportAction.active ? true : undefined}
                  data-active={active || (id === "export" && exportAction.active) ? "true" : undefined}
                  data-action={id}
                  disabled={disabled}
                  onClick={onClick === undefined
                    ? undefined
                    : (event) => onClick(event.currentTarget)}
                >
                  {t(label)}
                </Button>
              );
            })}
            {profile === "showroom"
            && group.tools.some(({ tool }) => tool === "space-unit")
            && onRecognizeRooms !== undefined ? (
              <Button
                variant="secondary"
                className="studio-plan-toolbar__action"
                data-action="recognize-rooms"
                onClick={(event) => onRecognizeRooms(event.currentTarget)}
              >
                {t("action.recognizeRooms")}
              </Button>
            ) : null}
            {onImportFloorPlan !== undefined
            && group.tools.some(({ tool }) => tool === "boundary") ? (
              <Button
                variant="secondary"
                className="studio-plan-toolbar__action"
                disabled={importFloorPlanDisabled}
                onClick={(event) => onImportFloorPlan(event.currentTarget)}
              >
                {t("toolbar.importFloorPlan")}
              </Button>
            ) : null}
            {onCalibrate !== undefined
            && group.tools.some(({ tool }) => tool === "boundary") ? (
              <Button
                variant="secondary"
                className="studio-plan-toolbar__action"
                onClick={(event) => onCalibrate(event.currentTarget)}
              >
                {t("toolbar.calibrate")}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {profile !== "showroom" || exportAction.reason === null ? null : (
        <span id={exportReasonId} className="studio-plan-toolbar__action-reason">
          {exportAction.reason}
        </span>
      )}
      {!showRendererIssue ? null : (
        <div
          id={rendererStatusId}
          className="studio-plan-toolbar__renderer-status"
          role="status"
          aria-label={t("toolbar.rendererStatus")}
          aria-live="polite"
        >
          <strong>{rendererIssueText}</strong>
          <span>：{rendererError ?? t("toolbar.rendererFallback")}</span>
          <Button
            variant="secondary"
            className="studio-plan-toolbar__renderer-retry"
            onClick={(event) => onRendererRetry(event.currentTarget)}
          >
            {t("toolbar.retry3d")}
          </Button>
        </div>
      )}
    </div>
  );
}
