import type { Fixture, ProjectSnapshot, RouteNode, Wall } from "@aethertwin/core-model";
import { showroomFixture } from "@aethertwin/mode-showroom";
import type { StoreApi } from "zustand/vanilla";
import type { PlanEditorState } from "./editor-session";
import type { InteractionController } from "./interaction-controller";

import { useState, type FormEvent } from 'react';
import { useI18n } from "../../i18n/locale-provider";
import { ENTITY_TYPE_MESSAGE_IDS, FIXTURE_KIND_MESSAGE_IDS, OPENING_KIND_MESSAGE_IDS, POINT_OF_INTEREST_KIND_MESSAGE_IDS, ROUTE_NODE_KIND_MESSAGE_IDS, SPACE_UNIT_KIND_MESSAGE_IDS } from "../../i18n/display-message-ids";
import type { StudioTranslator } from "../../i18n/message-schema";

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

function fixtureDetails(fixture: Fixture, t: StudioTranslator): string {
  const verticalHeight = fixture.spatial3D?.height ?? (
    fixture.kind === "generic"
      ? null
      : showroomFixture(fixture.kind).defaultSize.height
  );
  return [
    `${t("access.fixtureKind")} ${t(FIXTURE_KIND_MESSAGE_IDS[fixture.kind])}`,
    `${t("access.width")} ${metric(fixture.size.width)} mm`,
    `${t("access.depth")} ${metric(fixture.size.height)} mm`,
    `${t("access.height")} ${verticalHeight === null ? t("access.unset") : `${metric(verticalHeight)} mm`}`,
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
                {t("access.roomCandidate", { index: index + 1 })} · {metric(candidate.area / 1_000_000)} m² · {candidate.key === roomRecognition?.selectedCandidateKey ? t("access.selected") : t("access.unselected")} · {roomRecognition?.stale ? t("access.stale") : t("access.available")}
              </span>
              <button
                type="button"
                aria-label={t("access.previewCandidate", { index: index + 1 })}
                aria-pressed={candidate.key === roomRecognition?.selectedCandidateKey}
                onClick={() => sessionStore.getState().selectRoomCandidate(candidate.key)}
              >
                {t("access.preview")}
              </button>
            </li>
          ))}
          {entities.map((entity) => {
            const selected = selectedIds.has(entity.id);
            const locked = entity.locked || visibleLayers.get(entity.layerId) === true;
            const semanticName = entity.type === "space-unit"
              ? t(SPACE_UNIT_KIND_MESSAGE_IDS[entity.kind])
              : entity.type === "fixture"
              ? t(FIXTURE_KIND_MESSAGE_IDS[entity.kind])
              : entity.type === "poi"
                ? t(POINT_OF_INTEREST_KIND_MESSAGE_IDS[entity.kind])
                : t(ENTITY_TYPE_MESSAGE_IDS[entity.type]);
            return (
              <li key={entity.id}>
                <span>
                  {semanticName} · {entity.type === "fixture" ? `${fixtureDetails(entity, t)} · ` : ""}{entity.name} · {selected ? t("access.selected") : t("access.unselected")} · {locked ? t("access.locked") : t("access.editable")}
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
                  {t("access.routeNode")} · {node.name} · {t(ROUTE_NODE_KIND_MESSAGE_IDS[node.kind])} · {selected ? t("access.selected") : t("access.unselected")}
                </span>
                <button
                  type="button"
                  aria-label={t("access.selectRouteNode", { name: node.name })}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([node.id])}
                >
                  {t("access.select")}
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
                  {t("access.reference")} · {reference.name} · {reference.id} · {selected ? t("access.selected") : t("access.unselected")} · {calibrated ? t("access.calibrated") : t("access.unscaled")} · {calibrated ? `${metric(reference.transform.scale.x)} mm/px · ` : ""}{locked ? t("access.locked") : t("access.unlocked")} · {metric(reference.opacity * 100)}%
                </span>
                <button
                  type="button"
                  aria-label={t("access.selectReference", { name: reference.name })}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([reference.id])}
                >
                  {t("access.select")}
                </button>
                <button
                  type="button"
                  aria-label={t("access.calibrateReference", { name: reference.name })}
                  disabled={locked || onStartCalibration === undefined}
                  onClick={(event) => {
                    onStartCalibration?.(reference.id, event.currentTarget);
                  }}
                >
                  {t("toolbar.calibrate")}
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
                  {t(OPENING_KIND_MESSAGE_IDS[opening.kind])} · {opening.name} · {wall.name} · {wall.id} · {t("access.distanceAlongWall")} {metric(opening.distanceAlongWall)} mm · {metric(opening.width)} × {metric(opening.height)} mm · {t("access.sillHeight")} {metric(opening.sillHeight)} mm · {selected ? t("access.selected") : t("access.unselected")} · {locked ? t("access.locked") : t("access.editable")}
                </span>
                <button
                  type="button"
                  aria-label={t("access.selectOpening", { name: opening.name })}
                  aria-pressed={selected}
                  onClick={() => sessionStore.getState().setSelection([opening.id])}
                >
                  {t("access.select")}
                </button>
                <button
                  type="button"
                  aria-label={t("access.deleteOpening", { name: opening.name })}
                  disabled={locked}
                  onClick={() => {
                    sessionStore.getState().setSelection([opening.id]);
                    void controller.keyDown("Delete");
                  }}
                >
                  {t("access.delete")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
