import type { Fixture, ProjectSnapshot, RouteNode, Wall } from "@aethertwin/core-model";
import { showroomFixture } from "@aethertwin/mode-showroom";
import type { StoreApi } from "zustand/vanilla";
import type { PlanEditorState } from "./editor-session";
import type { InteractionController } from "./interaction-controller";

import { useState, type FormEvent } from 'react';
import { useI18n } from "../../i18n/locale-provider";

export interface PlanAccessibilityProps {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly controller: InteractionController;
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

function fixtureDetails(fixture: Fixture): string {
  const verticalHeight = fixture.spatial3D?.height ?? (
    fixture.kind === "generic"
      ? null
      : showroomFixture(fixture.kind).defaultSize.height
  );
  return [
    `展具种类 ${fixture.kind}`,
    `宽度 ${metric(fixture.size.width)} mm`,
    `深度 ${metric(fixture.size.height)} mm`,
    `垂直高度 ${verticalHeight === null ? "未设置" : `${metric(verticalHeight)} mm`}`,
  ].join(" · ");
}

export function PlanAccessibility({
  snapshot,
  activeFloorId,
  selectedIds,
  sessionStore,
  controller,
  onStartCalibration,
}: PlanAccessibilityProps) {
  const { t } = useI18n();
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
  const routeNodes = snapshot.project.routeNetworks.flatMap((network) => (
    network.nodes.filter((node) => node.floorId === activeFloorId)
  ));
  const wallsById = new Map(
    entities
      .filter((entity): entity is Wall => entity.type === "wall")
      .map((wall) => [wall.id, wall] as const),
  );
  const openings = snapshot.project.openings.flatMap((opening) => {
    const wall = wallsById.get(opening.wallId);
    return wall === undefined ? [] : [{
      opening,
      wall,
      locked: wall.locked || visibleLayers.get(wall.layerId) === true,
    }];
  });
  const roomRecognition = sessionStore.getState().roomRecognition;
  const activeTool = sessionStore.getState().activeTool;
  const [hotspotX, setHotspotX] = useState('0');
  const [hotspotY, setHotspotY] = useState('0');
  const hotspotPoint = {
    x: Number(hotspotX.trim()),
    y: Number(hotspotY.trim()),
  };
  const hotspotPointIsValid = hotspotX.trim() !== ''
    && hotspotY.trim() !== ''
    && Number.isFinite(hotspotPoint.x)
    && Number.isFinite(hotspotPoint.y);

  const submitProductHotspot = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!hotspotPointIsValid) return;
    const canvas = event.currentTarget.closest('.studio-plan-canvas');
    await controller.createAt(hotspotPoint);
    if (canvas instanceof HTMLElement) canvas.focus();
  };

  return (
    <section
      aria-label={t("access.list")}
      className="studio-plan-accessibility"
    >
      <h2>{t("access.heading")}</h2>
      {snapshot.project.profile === 'showroom'
      && activeTool === 'product-hotspot' ? (
        <form onSubmit={(event) => { void submitProductHotspot(event); }}>
          <label htmlFor='product-hotspot-x'>{t("access.hotspotX")}</label>
          <input
            id='product-hotspot-x'
            inputMode='decimal'
            type='text'
            value={hotspotX}
            onChange={(event) => setHotspotX(event.currentTarget.value)}
          />
          <label htmlFor='product-hotspot-y'>{t("access.hotspotY")}</label>
          <input
            id='product-hotspot-y'
            inputMode='decimal'
            type='text'
            value={hotspotY}
            onChange={(event) => setHotspotY(event.currentTarget.value)}
          />
          <button type='submit' disabled={!hotspotPointIsValid}>
            {t("access.createHotspot")}
          </button>
        </form>
      ) : null}
      {entities.length === 0 && references.length === 0 && routeNodes.length === 0 && openings.length === 0
      && (roomRecognition === null || roomRecognition.candidates.length === 0) ? (
        <p>{t("access.empty")}</p>
      ) : (
        <ul>
          {roomRecognition?.candidates.map((candidate, index) => (
            <li key={`room-candidate-${candidate.key}`}>
              <span>
                房间候选 {index + 1} · {metric(candidate.area / 1_000_000)} m² · {candidate.key === roomRecognition?.selectedCandidateKey ? "已选择" : "未选择"} · {roomRecognition?.stale ? "已过期" : "可预览"}
              </span>
              <button
                type="button"
                aria-label={`预览候选 ${index + 1}`}
                aria-pressed={candidate.key === roomRecognition?.selectedCandidateKey}
                onClick={() => sessionStore.getState().selectRoomCandidate(candidate.key)}
              >
                预览
              </button>
            </li>
          ))}
          {entities.map((entity) => {
            const selected = selectedIds.has(entity.id);
            const locked = entity.locked || visibleLayers.get(entity.layerId) === true;
            return (
              <li key={entity.id}>
                <span>
                  {entity.type === 'poi' ? `${entity.kind} · ` : ''}
                  {entity.type} · {entity.type === "fixture" ? `${fixtureDetails(entity)} · ` : ""}{entity.name} · {selected ? t("access.selected") : t("access.unselected")} · {locked ? t("access.locked") : t("access.editable")}
                </span>
                <button
                  type="button"
                  aria-label={t("access.selectEntity", { name: entity.name })}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([entity.id])}
                >
                  {t("access.select")}
                </button>
              </li>
            );
          })}
          {routeNodes.map((node: RouteNode) => {
            const selected = selectedIds.has(node.id);
            return (
              <li key={node.id} data-route-node-id={node.id}>
                <span>
                  路线节点 · {node.name} · {node.kind} · {selected ? "已选择" : "未选择"}
                </span>
                <button
                  type="button"
                  aria-label={`选择路线节点：${node.name}`}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([node.id])}
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
          {openings.map(({ opening, wall, locked }) => {
            const selected = selectedIds.has(opening.id);
            return (
              <li
                key={opening.id}
                data-testid={`accessible-opening-${opening.id}`}
                data-opening-id={opening.id}
              >
                <span>
                  {opening.kind} · {opening.name} · {wall.name} · {wall.id} · 沿墙距离 {metric(opening.distanceAlongWall)} mm · {metric(opening.width)} × {metric(opening.height)} mm · 窗台高度 {metric(opening.sillHeight)} mm · {selected ? "已选择" : "未选择"} · {locked ? "已锁定" : "可编辑"}
                </span>
                <button
                  type="button"
                  aria-label={`选择门窗：${opening.name}`}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([opening.id])}
                >
                  选择
                </button>
                <button
                  type="button"
                  aria-label={`删除门窗：${opening.name}`}
                  disabled={locked}
                  onClick={() => {
                    sessionStore.getState().setSelection([opening.id]);
                    void controller.keyDown("Delete");
                  }}
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
