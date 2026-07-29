import type { ProjectSnapshot } from "@aethertwin/core-model";
import type { StoreApi } from "zustand/vanilla";
import type { PlanEditorState } from "./editor-session";

export interface PlanAccessibilityProps {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly onStartCalibration?: (
    referenceId: string,
    initiator: HTMLButtonElement,
  ) => void;
}

function metric(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toPrecision(12)));
}

export function PlanAccessibility({
  snapshot,
  activeFloorId,
  selectedIds,
  sessionStore,
  onStartCalibration,
}: PlanAccessibilityProps) {
  const floor = snapshot.project.floors.find((candidate) => (
    candidate.id === activeFloorId
  ));
  const visibleLayers = new Map(
    floor?.layers
      .filter((layer) => layer.visible)
      .map((layer) => [layer.id, layer.locked] as const) ?? [],
  );
  const entities = snapshot.project.entities.filter((entity) => (
    entity.floorId === activeFloorId && visibleLayers.has(entity.layerId)
  ));
  const references = snapshot.project.planReferences.filter((reference) => (
    reference.floorId === activeFloorId && visibleLayers.has(reference.layerId)
  ));

  return (
    <section
      aria-label="可访问对象列表"
      className="studio-plan-accessibility"
    >
      <h2>平面对象</h2>
      {entities.length === 0 && references.length === 0 ? (
        <p>当前楼层没有可见对象。使用选择工具检查对象，或选择绘制工具开始创建。</p>
      ) : (
        <ul>
          {entities.map((entity) => {
            const selected = selectedIds.has(entity.id);
            const locked = entity.locked || visibleLayers.get(entity.layerId) === true;
            return (
              <li key={entity.id}>
                <span>
                  {entity.type} · {entity.name} · {selected ? "已选择" : "未选择"} · {locked ? "已锁定" : "可编辑"}
                </span>
                <button
                  type="button"
                  aria-label={`选择对象：${entity.name}`}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([entity.id])}
                >
                  选择
                </button>
              </li>
            );
          })}
          {references.map((reference) => {
            const selected = selectedIds.has(reference.id);
            const locked = reference.locked
              || visibleLayers.get(reference.layerId) === true;
            const calibrated = reference.calibration !== null;
            return (
              <li
                key={reference.id}
                data-testid={`accessible-reference-${reference.id}`}
                data-reference-id={reference.id}
              >
                <span>
                  平面参考 · {reference.name} · {reference.id} · {selected ? "已选择" : "未选择"} · {calibrated ? "已校准" : "未缩放"} · {calibrated ? `${metric(reference.transform.scale.x)} mm/px · ` : ""}{locked ? "已锁定" : "未锁定"} · {metric(reference.opacity * 100)}%
                </span>
                <button
                  type="button"
                  aria-label={`选择平面参考：${reference.name}`}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([reference.id])}
                >
                  选择
                </button>
                <button
                  type="button"
                  aria-label={`校准平面参考：${reference.name}`}
                  disabled={locked || onStartCalibration === undefined}
                  onClick={(event) => {
                    onStartCalibration?.(reference.id, event.currentTarget);
                  }}
                >
                  校准
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
