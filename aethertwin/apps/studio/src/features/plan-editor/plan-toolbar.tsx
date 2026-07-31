import type { ProjectProfile } from "@aethertwin/core-model";
import { Button } from "@aethertwin/design-system";
import { SHOWROOM_TOOL_GROUPS } from "@aethertwin/mode-showroom";
import type { PlanTool } from "./editor-session";

interface ToolDefinition {
  readonly tool: PlanTool;
  readonly label: string;
}

interface ToolGroup {
  readonly label: string;
  readonly tools: readonly ToolDefinition[];
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
};

const showroomOpeningTools: readonly ToolDefinition[] = Object.freeze(
  SHOWROOM_TOOL_GROUPS
    .find(({ id }) => id === "building")
    ?.actions.flatMap(({ id }) => (
      id === "door" || id === "window" ? [toolById[id]] : []
    )) ?? [],
);

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
    { label: "展具", tools: [toolById.fixture] },
    { label: "标记", tools: [toolById.poi, toolById.dimension] },
  ],
};

export interface PlanToolbarProps {
  readonly profile: ProjectProfile;
  readonly activeTool: PlanTool;
  readonly onToolChange: (tool: PlanTool, initiator: HTMLButtonElement) => void;
  readonly onImportFloorPlan?: (initiator: HTMLButtonElement) => void;
  readonly importFloorPlanDisabled?: boolean;
  readonly onCalibrate?: (initiator: HTMLButtonElement) => void;
  readonly onRecognizeRooms?: (initiator: HTMLButtonElement) => void;
}

export function PlanToolbar({
  profile,
  activeTool,
  onToolChange,
  onImportFloorPlan,
  importFloorPlanDisabled = false,
  onCalibrate,
  onRecognizeRooms,
}: PlanToolbarProps) {
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
    </div>
  );
}
