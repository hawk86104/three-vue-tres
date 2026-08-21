import type {
  Floor,
  PlanLayer,
  PlanReference,
  ProjectSnapshot,
  RouteNode,
  SpatialEntity,
} from "@aethertwin/core-model";
import { Button, Field } from "@aethertwin/design-system";
import type { FloorChange } from "@aethertwin/plan-engine";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/locale-provider";

interface LayerTreeItemProps {
  readonly floor: Floor;
  readonly layer: PlanLayer;
  readonly index: number;
  readonly activeFloor: boolean;
  readonly entities: readonly SpatialEntity[];
  readonly references: readonly PlanReference[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onSelect: () => void;
  readonly onEntitySelect: (entityId: string, additive: boolean) => void;
  readonly onReferenceSelect: (referenceId: string) => void;
  readonly onApplyFloorPatch: (change: FloorChange) => Promise<void>;
}

function stopPropagation(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

function LayerTreeItem({
  floor,
  layer,
  index,
  activeFloor,
  entities,
  references,
  selectedIds,
  onSelect,
  onEntitySelect,
  onReferenceSelect,
  onApplyFloorPatch,
}: LayerTreeItemProps) {
  const { t } = useI18n();
  const [name, setName] = useState(layer.name);

  useEffect(() => {
    setName(layer.name);
  }, [layer.name]);

  async function changeLayer(nextLayer: PlanLayer) {
    const layers = [...floor.layers];
    layers[index] = nextLayer;
    await onApplyFloorPatch({
      floorId: floor.id,
      before: floor,
      after: { ...floor, layers },
    });
  }

  async function move(offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= floor.layers.length) return;
    const layers = [...floor.layers];
    const [moved] = layers.splice(index, 1);
    if (moved === undefined) return;
    layers.splice(destination, 0, moved);
    await onApplyFloorPatch({
      floorId: floor.id,
      before: floor,
      after: { ...floor, layers },
    });
  }

  async function commitName() {
    const normalized = name.trim();
    if (normalized.length === 0 || normalized === layer.name) {
      setName(layer.name);
      return;
    }
    await changeLayer({ ...layer, name: normalized });
  }

  return (
    <li
      className="studio-floor-tree__layer"
      role="treeitem"
      aria-label={layer.name}
      aria-selected={false}
      data-layer-id={layer.id}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="studio-floor-tree__row studio-floor-tree__layer-row">
        <button
          type="button"
          className="studio-floor-tree__selection studio-floor-tree__layer-selection"
          aria-label={t("layer.select", { name: layer.name })}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <span className="studio-floor-tree__row-label">{layer.name}</span>
        </button>
        <label className="studio-floor-tree__toggle" onClick={stopPropagation}>
          <input
            type="checkbox"
            checked={layer.visible}
            aria-label={t("layer.visible", { name: layer.name })}
            onChange={(event) => void changeLayer({
              ...layer,
              visible: event.currentTarget.checked,
            })}
          />
          {t("layer.show")}
        </label>
        <label className="studio-floor-tree__toggle" onClick={stopPropagation}>
          <input
            type="checkbox"
            checked={layer.locked}
            aria-label={t("layer.locked", { name: layer.name })}
            onChange={(event) => void changeLayer({
              ...layer,
              locked: event.currentTarget.checked,
            })}
          />
          {t("layer.lock")}
        </label>
      </div>
      <div
        className="studio-floor-tree__layer-actions"
        onClick={stopPropagation}
      >
        <Field
          label={t("layer.name", { name: layer.name })}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={() => void commitName()}
        />
        <Button
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void commitName()}
        >
          {t("layer.applyName", { name: layer.name })}
        </Button>
        <div className="studio-floor-tree__order-actions">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => void move(-1)}
          >
            {t("layer.moveUp", { name: layer.name })}
          </Button>
          <Button
            variant="ghost"
            disabled={index === floor.layers.length - 1}
            onClick={() => void move(1)}
          >
            {t("layer.moveDown", { name: layer.name })}
          </Button>
        </div>
      </div>
      {activeFloor && layer.visible && (entities.length > 0 || references.length > 0) ? (
        <ul role="group" className="studio-floor-tree__entities">
          {references.map((reference) => (
            <li
              key={reference.id}
              role="treeitem"
              aria-label={reference.name}
              aria-selected={selectedIds.has(reference.id)}
              className={
                selectedIds.has(reference.id)
                  ? "studio-floor-tree__entity studio-floor-tree__entity--selected"
                  : "studio-floor-tree__entity"
              }
              data-reference-id={reference.id}
              onClick={(event) => {
                event.stopPropagation();
                onReferenceSelect(reference.id);
              }}
            >
              <button
                type="button"
                className="studio-floor-tree__selection studio-floor-tree__entity-selection"
                aria-label={`${"\u9009\u62e9\u5e73\u9762\u53c2\u8003\uff1a"}${reference.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onReferenceSelect(reference.id);
                }}
              >
                <span>{reference.name}</span>
                <small>{"\u5e73\u9762\u53c2\u8003"}</small>
                {reference.locked ? <small>{"\u5df2\u9501\u5b9a"}</small> : null}
              </button>
            </li>
          ))}
          {entities.map((entity) => (
            <li
              key={entity.id}
              role="treeitem"
              aria-label={entity.name}
              aria-selected={selectedIds.has(entity.id)}
              className={
                selectedIds.has(entity.id)
                  ? "studio-floor-tree__entity studio-floor-tree__entity--selected"
                  : "studio-floor-tree__entity"
              }
              data-entity-id={entity.id}
              onClick={(event) => {
                event.stopPropagation();
                onEntitySelect(entity.id, event.shiftKey);
              }}
            >
              <button
                type="button"
                className="studio-floor-tree__selection studio-floor-tree__entity-selection"
                aria-label={`选择对象：${entity.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onEntitySelect(entity.id, event.shiftKey);
                }}
              >
                <span>{entity.name}</span>
                <small>{entity.type}</small>
                {entity.locked ? <small>已锁定</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export interface FloorTreeProps {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly floorSelectionDisabled?: boolean;
  readonly onFloorSelect: (floorId: string) => void;
  readonly onLayerSelect: (floorId: string, layerId: string) => void;
  readonly onEntitySelect: (entityId: string, additive: boolean) => void;
  readonly onReferenceSelect?: (referenceId: string) => void;
  readonly onRouteNodeSelect?: (nodeId: string) => void;
  readonly onApplyFloorPatch: (change: FloorChange) => Promise<void>;
}

export function FloorTree({
  snapshot,
  activeFloorId,
  selectedIds,
  floorSelectionDisabled = false,
  onFloorSelect,
  onLayerSelect,
  onEntitySelect,
  onReferenceSelect = () => undefined,
  onRouteNodeSelect = () => undefined,
  onApplyFloorPatch,
}: FloorTreeProps) {
  const { t } = useI18n();
  const activeEntities = snapshot.project.entities.filter(
    (entity) => entity.floorId === activeFloorId,
  );
  const activeReferences = snapshot.project.planReferences.filter(
    (reference) => reference.floorId === activeFloorId,
  );
  const activeRouteNodes = snapshot.project.routeNetworks.flatMap((network) => (
    network.nodes.filter((node) => node.floorId === activeFloorId)
  ));

  return (
    <div className="studio-floor-tree">
      <div className="studio-floor-tree__heading">
        <h2>{t("floor.heading")}</h2>
        <p>{snapshot.project.name}</p>
      </div>
      <ul role="tree" aria-label={t("floor.tree")} className="studio-floor-tree__root">
        {snapshot.project.floors.map((floor) => {
          const active = floor.id === activeFloorId;
          return (
            <li
              key={floor.id}
              role="treeitem"
              aria-expanded="true"
              aria-label={floor.name}
              aria-selected={active}
              data-floor-id={floor.id}
              className={
                active
                  ? "studio-floor-tree__floor studio-floor-tree__floor--active"
                  : "studio-floor-tree__floor"
              }
              onClick={() => {
                if (!floorSelectionDisabled) onFloorSelect(floor.id);
              }}
            >
              <button
                type="button"
                disabled={floorSelectionDisabled}
                className="studio-floor-tree__row studio-floor-tree__selection"
                aria-label={t("floor.select", { name: floor.name })}
                onClick={(event) => {
                  event.stopPropagation();
                  onFloorSelect(floor.id);
                }}
              >
                <span className="studio-floor-tree__row-label">{floor.name}</span>
                {active ? <small>{t("floor.current")}</small> : null}
              </button>
              <ul role="group" className="studio-floor-tree__layers">
                {floor.layers.map((layer, index) => (
                  <LayerTreeItem
                    key={layer.id}
                    floor={floor}
                    layer={layer}
                    index={index}
                    activeFloor={active}
                    entities={activeEntities.filter(
                      (entity) => entity.layerId === layer.id,
                    )}
                    references={activeReferences.filter(
                      (reference) => reference.layerId === layer.id,
                    )}
                    selectedIds={selectedIds}
                    onSelect={() => onLayerSelect(floor.id, layer.id)}
                    onEntitySelect={onEntitySelect}
                    onReferenceSelect={onReferenceSelect}
                    onApplyFloorPatch={onApplyFloorPatch}
                  />
                ))}
                {active && activeRouteNodes.map((node: RouteNode) => (
                  <li
                    key={node.id}
                    role="treeitem"
                    aria-label={node.name}
                    aria-selected={selectedIds.has(node.id)}
                    className={
                      selectedIds.has(node.id)
                        ? "studio-floor-tree__entity studio-floor-tree__entity--selected"
                        : "studio-floor-tree__entity"
                    }
                    data-route-node-id={node.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRouteNodeSelect(node.id);
                    }}
                  >
                    <button
                      type="button"
                      className="studio-floor-tree__selection studio-floor-tree__entity-selection"
                      aria-label={`选择路线节点：${node.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRouteNodeSelect(node.id);
                      }}
                    >
                      <span>{node.name}</span>
                      <small>{node.kind}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
