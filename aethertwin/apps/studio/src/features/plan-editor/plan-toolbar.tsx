import type { ProjectProfile } from "@aethertwin/core-model";
import { Button } from "@aethertwin/design-system";
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
  zone: { tool: "zone", label: "区域" },
  "space-unit": { tool: "space-unit", label: "空间单元" },
  fixture: { tool: "fixture", label: "展具" },
  poi: { tool: "poi", label: "兴趣点" },
  dimension: { tool: "dimension", label: "尺寸" },
};

const profileGroups: Readonly<Record<ProjectProfile, readonly ToolGroup[]>> = {
  market: [
    { label: "选择", tools: [toolById.select, toolById.pan] },
    {
      label: "场地",
      tools: [toolById.boundary, toolById.wall, toolById.zone],
    },
    {
      label: "空间单元",
      tools: [toolById["space-unit"], toolById.fixture],
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
        toolById.zone,
        toolById["space-unit"],
      ],
    },
    { label: "展具", tools: [toolById.fixture] },
    { label: "标记", tools: [toolById.poi, toolById.dimension] },
  ],
};

export interface PlanToolbarProps {
  readonly profile: ProjectProfile;
  readonly activeTool: PlanTool;
  readonly onToolChange: (tool: PlanTool) => void;
}

export function PlanToolbar({
  profile,
  activeTool,
  onToolChange,
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
                  onClick={() => onToolChange(tool)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
