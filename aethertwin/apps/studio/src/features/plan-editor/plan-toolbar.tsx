import type { ProjectProfile } from "@aethertwin/core-model";
import { Button } from "@aethertwin/design-system";
import {
  SHOWROOM_TOOL_GROUPS,
  type ShowroomToolActionId,
} from "@aethertwin/mode-showroom";
import type { SceneRendererStatus } from "@aethertwin/render-scene-3d";
import type { PlanTool, SceneViewMode } from "./editor-session";
import { useEffect, useId, useRef } from "react";

interface ToolDefinition {
  readonly tool: PlanTool;
  readonly label: string;
}

interface ToolActionDefinition {
  readonly id: ShowroomToolActionId;
  readonly label: string;
}

interface ToolGroup {
  readonly label: string;
  readonly tools: readonly ToolDefinition[];
  readonly actions?: readonly ToolActionDefinition[];
}

const toolById: Readonly<Record<PlanTool, ToolDefinition>> = {
  select: { tool: "select", label: "选择" },
  pan: { tool: "pan", label: "平移" },
  boundary: { tool: "boundary", label: "边界" },
  wall: { tool: "wall", label: "墙体" },
  door: { tool: "door", label: "门" },
  window: { tool: "window", label: "窗" },
  zone: { tool: "zone", label: "区域" },
  "space-unit": { tool: "space-unit", label: "空间单元" },
  fixture: { tool: "fixture", label: "展具" },
  poi: { tool: "poi", label: "兴趣点" },
  dimension: { tool: "dimension", label: "尺寸" },
  "product-hotspot": { tool: "product-hotspot", label: "\u4ea7\u54c1\u70ed\u70b9" },
  "route-node": { tool: "route-node", label: "\u8def\u7ebf\u8282\u70b9" },
  "route-edge": { tool: "route-edge", label: "\u8def\u7ebf\u8fb9" },
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
        ? [{ ...toolById.fixture, label: "展具目录" }]
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
  { id: "attach-product-media", label: "\u6dfb\u52a0\u5a92\u4f53" },
]);
const showroomTourActions: readonly ToolActionDefinition[] = Object.freeze([
  { id: "edit-route-stops", label: "\u7f16\u8f91\u505c\u9760\u70b9" },
  { id: "preview-guided-route", label: "\u9884\u89c8\u8def\u7ebf" },
]);
const showroomPreviewActions: readonly ToolActionDefinition[] =
  SHOWROOM_TOOL_GROUPS.find(({ id }) => id === "preview")?.actions
  ?? Object.freeze([]);
const profileGroups: Readonly<Record<ProjectProfile, readonly ToolGroup[]>> = {
  market: [
    { label: "选择", tools: [toolById.select, toolById.pan] },
    {
      label: "场地",
      tools: [toolById.boundary, toolById.wall, toolById.zone],
    },
    {
      label: "空间单元",
      tools: [{ ...toolById["space-unit"], label: "摊位" }, toolById.fixture],
    },
    { label: "标记", tools: [toolById.poi, toolById.dimension] },
  ],
  showroom: [
    { label: "选择", tools: [toolById.select, toolById.pan] },
    {
      label: "建筑",
      tools: [
        toolById.boundary,
        toolById.wall,
        ...showroomOpeningTools,
        toolById.zone,
        { ...toolById["space-unit"], label: "房间" },
      ],
    },
    {
      label: "展具",
      tools: showroomFixtureTools,
    },
    {
      label: "内容",
      tools: showroomContentTools,
      actions: showroomContentActions,
    },
    {
      label: "导览",
      tools: showroomTourTools,
      actions: showroomTourActions,
    },
    {
      label: "预览",
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
  readonly onViewModeChange: (mode: SceneViewMode, initiator: HTMLButtonElement) => void;
  readonly onFrameSelection: (initiator: HTMLButtonElement) => void;
  readonly onFrameRoute: (initiator: HTMLButtonElement) => void;
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
  onViewModeChange,
  onFrameSelection,
  onFrameRoute,
  onToolChange,
  onImportFloorPlan,
  importFloorPlanDisabled = false,
  onCalibrate,
  onRecognizeRooms,
  onAttachProductMedia,
  onEditRouteStops,
  onPreviewGuidedRoute,
}: PlanToolbarProps) {
  const rendererUnavailable =
    rendererStatus === "failed" || rendererStatus === "disabled";
  const showRendererIssue = profile === "showroom" && rendererUnavailable;
  const rendererStatusId = useId();
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

  const rendererIssueText = rendererStatus === "disabled"
    ? "3D 预览已停用"
    : "3D 预览不可用";
  return (
    <div className="studio-plan-toolbar" data-profile={profile}>
      {profileGroups[profile].map((group) => (
        <div
          key={group.label}
          className="studio-plan-toolbar__group"
          role="group"
          aria-label={group.label}
        >
          <span className="studio-plan-toolbar__group-label" aria-hidden="true">
            {group.label}
          </span>
          <div className="studio-plan-toolbar__tools">
            {group.tools.map(({ tool, label }) => {
              const active = tool === activeTool;
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
                  onClick={(event) => onToolChange(tool, event.currentTarget)}
                >
                  {label}
                </Button>
              );
            })}
            {group.actions?.map(({ id, label }) => {
              let mode: SceneViewMode | null = null;
              let onClick: ((initiator: HTMLButtonElement) => void) | undefined;
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
              }
              const active = mode !== null && mode === viewMode;
              const unavailableViewAction =
                id === "view-3d" || id === "view-split";
              const disabled = onClick === undefined
                || (rendererUnavailable && unavailableViewAction);
              return (
                <Button
                  ref={id === "view-2d" ? twoDButtonRef : undefined}
                  key={id}
                  variant={active ? "primary" : "secondary"}
                  className="studio-plan-toolbar__action"
                  aria-pressed={mode === null ? undefined : active}
                  aria-describedby={
                    rendererUnavailable && unavailableViewAction
                      ? rendererStatusId
                      : undefined
                  }
                  data-active={active ? "true" : undefined}
                  data-action={id}
                  disabled={disabled}
                  onClick={onClick === undefined
                    ? undefined
                    : (event) => onClick(event.currentTarget)}
                >
                  {label}
                </Button>
              );
            })}
            {profile === "showroom"
            && group.tools.some(({ tool }) => tool === "space-unit")
            && onRecognizeRooms !== undefined ? (
              <Button
                variant="secondary"
                className="studio-plan-toolbar__action"
                onClick={(event) => onRecognizeRooms(event.currentTarget)}
              >
                识别房间
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
                导入平面图
              </Button>
            ) : null}
            {onCalibrate !== undefined
            && group.tools.some(({ tool }) => tool === "boundary") ? (
              <Button
                variant="secondary"
                className="studio-plan-toolbar__action"
                onClick={(event) => onCalibrate(event.currentTarget)}
              >
                校准
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {!showRendererIssue ? null : (
        <div
          id={rendererStatusId}
          className="studio-plan-toolbar__renderer-status"
          role="status"
          aria-label="3D 预览状态"
          aria-live="polite"
        >
          <strong>{rendererIssueText}</strong>
          <span>：{rendererError ?? "当前环境无法启动 WebGL。"}</span>
        </div>
      )}
    </div>
  );
}
