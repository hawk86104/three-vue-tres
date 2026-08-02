import type { ProjectProfile } from "@aethertwin/core-model";
import { Button } from "@aethertwin/design-system";
import {
  SHOWROOM_TOOL_GROUPS,
  type ShowroomToolActionId,
} from "@aethertwin/mode-showroom";
import type { PlanTool } from "./editor-session";

interface ToolDefinition {
  readonly tool: PlanTool;
  readonly label: string;
}

interface DisabledToolAction {
  readonly id: ShowroomToolActionId;
  readonly label: string;
}

interface ToolGroup {
  readonly label: string;
  readonly tools: readonly ToolDefinition[];
  readonly disabledActions?: readonly DisabledToolAction[];
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

const showroomContentActions: readonly DisabledToolAction[] = Object.freeze([
  { id: "attach-product-media", label: "\u6dfb\u52a0\u5a92\u4f53" },
]);
const showroomTourActions: readonly DisabledToolAction[] = Object.freeze([
  { id: "edit-route-stops", label: "\u7f16\u8f91\u505c\u9760\u70b9" },
  { id: "preview-guided-route", label: "\u9884\u89c8\u8def\u7ebf" },
]);
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
      disabledActions: showroomContentActions,
    },
    {
      label: "导览",
      tools: showroomTourTools,
      disabledActions: showroomTourActions,
    },
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
            {group.disabledActions?.map(({ id, label }) => (
              <Button
                key={id}
                variant="secondary"
                className="studio-plan-toolbar__action"
                data-action={id}
                disabled
              >
                {label}
              </Button>
            ))}
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
