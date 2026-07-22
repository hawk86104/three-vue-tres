import type {
  Floor,
  PlanLayer,
  ProjectSnapshot,
  SaveState,
  SpatialEntity,
} from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import {
  alignEntities,
  distributeEntities,
  linearArray,
  parseLength,
  rectangularArray,
  type FloorChange,
  type PlanEditIntent,
  type PlanIssue,
  type PlanResult,
} from "@aethertwin/plan-engine";
import type { ProjectBackend } from "@aethertwin/project-store";
import { useEffect, useId, useState } from "react";
import { validateProjectName } from "../project-center/create-project-dialog";
import type { InteractionController } from "./interaction-controller";

export type InspectorContext =
  | { readonly kind: "project" }
  | { readonly kind: "floor"; readonly floorId: string }
  | { readonly kind: "layer"; readonly floorId: string; readonly layerId: string }
  | { readonly kind: "entity"; readonly entityId: string }
  | { readonly kind: "multi"; readonly entityIds: readonly string[] };

const saveStateLabels: Record<SaveState, string> = {
  dirty: "未保存",
  saving: "保存中",
  saved: "已保存",
  error: "保存失败",
  recovered: "已恢复",
};

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function logReference(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("logRef" in value)) {
    return null;
  }
  return typeof value.logRef === "string" && value.logRef.length > 0
    ? value.logRef
    : null;
}

function parsedTags(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

function positiveLength(value: string): number | null {
  const parsed = parseLength(value, "mm");
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

function signedLength(value: string): number | null {
  const normalized = value.trim();
  const sign = normalized.startsWith("-")
    ? -1
    : 1;
  const magnitude = normalized.startsWith("-") || normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;
  if (magnitude.trim().length === 0) return null;
  const parsed = parseLength(magnitude, "mm");
  if (!parsed.ok) return null;
  const result = sign * parsed.value;
  return Number.isFinite(result) ? result : null;
}

interface ProjectInspectorProps {
  readonly snapshot: ProjectSnapshot;
  readonly saveState: SaveState;
  readonly backendMode: ProjectBackend["mode"];
  readonly projectPath: string;
  readonly onHandledStoreError: (error: Error | null) => void;
  readonly onRename: (name: string) => Promise<void>;
  readonly onSetTags: (tags: readonly string[]) => Promise<void>;
}

function ProjectInspector({
  snapshot,
  saveState,
  backendMode,
  projectPath,
  onHandledStoreError,
  onRename,
  onSetTags,
}: ProjectInspectorProps) {
  const committedName = snapshot.project.name;
  const committedTags = snapshot.project.tags.join(", ");
  const [name, setName] = useState(committedName);
  const [tags, setTags] = useState(committedTags);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [nameHandledError, setNameHandledError] = useState<Error | null>(null);
  const [tagsHandledError, setTagsHandledError] = useState<Error | null>(null);
  const nameErrorId = `plan-inspector-name-error-${useId().replaceAll(":", "")}`;
  const tagsErrorId = `plan-inspector-tags-error-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    setName(committedName);
    setTags(committedTags);
    setNameError(null);
    setTagsError(null);
    setNameHandledError(null);
    setTagsHandledError(null);
  }, [committedName, committedTags]);

  function clearNameError() {
    setNameError(null);
    setNameHandledError(null);
    onHandledStoreError(tagsHandledError);
  }

  function clearTagsError() {
    setTagsError(null);
    setTagsHandledError(null);
    onHandledStoreError(nameHandledError);
  }

  async function commitName() {
    const validation = validateProjectName(name);
    if (!validation.ok) {
      setNameError(validation.error);
      setNameHandledError(null);
      onHandledStoreError(tagsHandledError);
      return;
    }
    if (validation.name === committedName) {
      clearNameError();
      return;
    }
    try {
      await onRename(validation.name);
      clearNameError();
    } catch (error) {
      const handled = errorValue(error);
      onHandledStoreError(handled);
      setNameError(handled.message);
      setNameHandledError(handled);
    }
  }

  async function commitTags() {
    const nextTags = parsedTags(tags);
    if (
      nextTags.length === snapshot.project.tags.length
      && nextTags.every((tag, index) => tag === snapshot.project.tags[index])
    ) {
      clearTagsError();
      return;
    }
    try {
      await onSetTags(nextTags);
      clearTagsError();
    } catch (error) {
      const handled = errorValue(error);
      onHandledStoreError(handled);
      setTagsError(handled.message);
      setTagsHandledError(handled);
    }
  }

  const nameLogRef = logReference(nameHandledError);
  const tagsLogRef = logReference(tagsHandledError);

  return (
    <div className="studio-inspector-form">
      <h2>项目</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>项目档案</dt><dd>{snapshot.project.profile}</dd></div>
        <div><dt>Schema</dt><dd>{snapshot.schemaVersion}</dd></div>
        <div><dt>保存状态</dt><dd>{saveStateLabels[saveState]}</dd></div>
        <div><dt>后端模式</dt><dd>{backendMode}</dd></div>
        <div><dt>项目位置</dt><dd>{projectPath}</dd></div>
      </dl>
      {nameError === null ? null : (
        <StatusNotice id={nameErrorId} tone="error">
          <span>{nameError}</span>
          {nameLogRef === null ? null : <span>日志参考：{nameLogRef}</span>}
        </StatusNotice>
      )}
      {tagsError === null ? null : (
        <StatusNotice id={tagsErrorId} tone="error">
          <span>{tagsError}</span>
          {tagsLogRef === null ? null : <span>日志参考：{tagsLogRef}</span>}
        </StatusNotice>
      )}
      <Field
        label="项目名称"
        value={name}
        aria-describedby={nameError === null ? undefined : nameErrorId}
        aria-invalid={nameError === null ? undefined : true}
        onChange={(event) => {
          setName(event.currentTarget.value);
          clearNameError();
        }}
        onBlur={() => void commitName()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitName()}
      >
        应用名称
      </Button>
      <Field
        label="项目标签"
        value={tags}
        aria-describedby={tagsError === null ? undefined : tagsErrorId}
        aria-invalid={tagsError === null ? undefined : true}
        helpText="使用英文逗号分隔标签"
        onChange={(event) => {
          setTags(event.currentTarget.value);
          clearTagsError();
        }}
        onBlur={() => void commitTags()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitTags()}
      >
        应用标签
      </Button>
    </div>
  );
}

interface FloorInspectorProps {
  readonly floor: Floor;
  readonly order: number;
  readonly onApplyFloorPatch: (change: FloorChange) => Promise<void>;
}

function FloorInspector({
  floor,
  order,
  onApplyFloorPatch,
}: FloorInspectorProps) {
  const [name, setName] = useState(floor.name);

  useEffect(() => {
    setName(floor.name);
  }, [floor.name]);

  async function commitName() {
    const normalized = name.trim();
    if (normalized.length === 0 || normalized === floor.name) {
      setName(floor.name);
      return;
    }
    await onApplyFloorPatch({
      floorId: floor.id,
      before: floor,
      after: { ...floor, name: normalized },
    });
  }

  return (
    <div className="studio-inspector-form">
      <h2>楼层</h2>
      <p>{floor.name}</p>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>顺序</dt><dd>{order + 1}</dd></div>
      </dl>
      <Field
        label="楼层名称"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => void commitName()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitName()}
      >
        应用楼层名称
      </Button>
    </div>
  );
}

interface LayerInspectorProps {
  readonly floor: Floor;
  readonly layer: PlanLayer;
  readonly order: number;
  readonly onApplyFloorPatch: (change: FloorChange) => Promise<void>;
}

function LayerInspector({
  floor,
  layer,
  order,
  onApplyFloorPatch,
}: LayerInspectorProps) {
  const [name, setName] = useState(layer.name);

  useEffect(() => {
    setName(layer.name);
  }, [layer.name]);

  async function patch(nextLayer: PlanLayer) {
    const layers = floor.layers.map((candidate) => (
      candidate.id === layer.id ? nextLayer : candidate
    ));
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
    await patch({ ...layer, name: normalized });
  }

  return (
    <div className="studio-inspector-form">
      <h2>图层</h2>
      <p>{layer.name}</p>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>顺序</dt><dd>{order + 1}</dd></div>
        <div><dt>可见</dt><dd>{layer.visible ? "是" : "否"}</dd></div>
        <div><dt>锁定</dt><dd>{layer.locked ? "是" : "否"}</dd></div>
      </dl>
      <Field
        label="图层名称"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => void commitName()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitName()}
      >
        应用图层名称
      </Button>
      <label className="studio-plan-inspector__check">
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(event) => {
            void patch({
              ...layer,
              visible: event.currentTarget.checked,
            });
          }}
        />
        图层可见
      </label>
      <label className="studio-plan-inspector__check">
        <input
          type="checkbox"
          checked={layer.locked}
          onChange={(event) => {
            void patch({
              ...layer,
              locked: event.currentTarget.checked,
            });
          }}
        />
        图层锁定
      </label>
    </div>
  );
}

interface EntityInspectorProps {
  readonly entity: SpatialEntity;
  readonly floor: Floor;
  readonly onApplyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

type EntityIssueField =
  | "x"
  | "y"
  | "rotation"
  | "width"
  | "height"
  | "thickness"
  | "radius"
  | "offset";

interface EntityFieldIssue {
  readonly field: EntityIssueField;
  readonly issue: PlanIssue;
}

function EntityInspector({
  entity,
  floor,
  onApplyPlanEdit,
  onError,
}: EntityInspectorProps) {
  const committedName = entity.name;
  const committedX = String(entity.transform.translation.x);
  const committedY = String(entity.transform.translation.y);
  const committedRotation = String(entity.transform.rotation * 180 / Math.PI);
  const committedLayerId = entity.layerId;
  const committedLocked = entity.locked;
  const committedTags = entity.tags.join(", ");
  const committedWidth = entity.type === "fixture" ? String(entity.size.width) : "";
  const committedHeight = entity.type === "fixture" ? String(entity.size.height) : "";
  const committedThickness = entity.type === "wall" ? String(entity.thickness) : "";
  const committedRadius = (
    entity.type === "poi" && entity.radius !== undefined ? String(entity.radius) : ""
  );
  const committedOffset = entity.type === "dimension" ? String(entity.offset) : "";
  const [name, setName] = useState(committedName);
  const [x, setX] = useState(committedX);
  const [y, setY] = useState(committedY);
  const [rotation, setRotation] = useState(committedRotation);
  const [layerId, setLayerId] = useState(committedLayerId);
  const [locked, setLocked] = useState(committedLocked);
  const [tags, setTags] = useState(committedTags);
  const [width, setWidth] = useState(committedWidth);
  const [height, setHeight] = useState(committedHeight);
  const [thickness, setThickness] = useState(committedThickness);
  const [radius, setRadius] = useState(committedRadius);
  const [offset, setOffset] = useState(committedOffset);
  const currentLayer = floor.layers.find((layer) => layer.id === entity.layerId);
  const layerAllowsEdits = (
    currentLayer !== undefined
    && currentLayer.visible
    && !currentLayer.locked
  );
  const propertiesDisabled = entity.locked || !layerAllowsEdits;
  const [localError, setLocalError] = useState<EntityFieldIssue | null>(null);
  const localErrorId = `plan-inspector-entity-error-${useId().replaceAll(":", "")}`;

  function reportFieldIssue(
    field: EntityIssueField,
    code: string,
    message: string,
  ): void {
    setLocalError({
      field,
      issue: { code, message, entityId: entity.id },
    });
  }

  function fieldIssueProps(field: EntityIssueField) {
    const invalid = localError?.field === field;
    return {
      "aria-describedby": invalid ? localErrorId : undefined,
      "aria-invalid": invalid ? true : undefined,
    };
  }

  useEffect(() => {
    setName(committedName);
    setX(committedX);
    setY(committedY);
    setRotation(committedRotation);
    setLayerId(committedLayerId);
    setLocked(committedLocked);
    setTags(committedTags);
    setWidth(committedWidth);
    setHeight(committedHeight);
    setThickness(committedThickness);
    setRadius(committedRadius);
    setOffset(committedOffset);
    setLocalError(null);
  }, [
    entity.id,
    entity.type,
    committedName,
    committedX,
    committedY,
    committedRotation,
    committedLayerId,
    committedLocked,
    committedTags,
    committedWidth,
    committedHeight,
    committedThickness,
    committedRadius,
    committedOffset,
  ]);

  async function commit() {
    if (!layerAllowsEdits) return;
    if (entity.locked) {
      if (locked) return;
      setLocalError(null);
      try {
        await onApplyPlanEdit({
          reason: "properties",
          changes: [{
            id: entity.id,
            before: entity,
            after: { ...entity, locked: false },
          }],
        });
      } catch (error) {
        onError(error);
      }
      return;
    }

    const nextX = signedLength(x);
    const nextY = signedLength(y);
    const normalizedRotation = rotation.trim();
    const nextRotation = normalizedRotation.length === 0 ? Number.NaN : Number(normalizedRotation);
    if (nextX === null) {
      reportFieldIssue("x", "INVALID_LENGTH", "位置和角度必须是有限数字");
      return;
    }
    if (nextY === null) {
      reportFieldIssue("y", "INVALID_LENGTH", "位置和角度必须是有限数字");
      return;
    }
    if (!Number.isFinite(nextRotation)) {
      reportFieldIssue("rotation", "INVALID_ROTATION", "位置和角度必须是有限数字");
      return;
    }

    let after = {
      ...entity,
      name: name.trim() || entity.name,
      tags: parsedTags(tags),
      layerId,
      locked,
      transform: {
        ...entity.transform,
        translation: { x: nextX, y: nextY },
        rotation: nextRotation * Math.PI / 180,
      },
    } as SpatialEntity;

    if (after.type === "fixture") {
      const nextWidth = positiveLength(width);
      const nextHeight = positiveLength(height);
      if (nextWidth === null) {
        reportFieldIssue("width", "INVALID_LENGTH", "宽度和高度必须是正数");
        return;
      }
      if (nextHeight === null) {
        reportFieldIssue("height", "INVALID_LENGTH", "宽度和高度必须是正数");
        return;
      }
      after = {
        ...after,
        size: { width: nextWidth, height: nextHeight },
      };
    }

    if (after.type === "wall") {
      const nextThickness = positiveLength(thickness);
      if (nextThickness === null) {
        reportFieldIssue("thickness", "INVALID_LENGTH", "墙体厚度必须是正数");
        return;
      }
      after = {
        ...after,
        thickness: nextThickness,
      };
    }

    if (after.type === "poi") {
      const normalizedRadius = radius.trim();
      if (normalizedRadius.length === 0) {
        const withoutRadius = { ...after };
        delete withoutRadius.radius;
        after = withoutRadius;
      } else {
        const nextRadius = positiveLength(normalizedRadius);
        if (nextRadius === null) {
          reportFieldIssue("radius", "INVALID_LENGTH", "兴趣点半径必须是正数");
          return;
        }
        after = {
          ...after,
          radius: nextRadius,
        };
      }
    }

    if (after.type === "dimension") {
      const nextOffset = signedLength(offset);
      if (nextOffset === null) {
        reportFieldIssue("offset", "INVALID_LENGTH", "尺寸偏移必须是有限数字");
        return;
      }
      after = {
        ...after,
        offset: nextOffset,
      };
    }

    if (JSON.stringify(after) === JSON.stringify(entity)) {
      setLocalError(null);
      return;
    }

    const transformOnly = (
      after.name === entity.name
      && after.layerId === entity.layerId
      && after.locked === entity.locked
      && JSON.stringify(after.tags) === JSON.stringify(entity.tags)
      && (
        entity.type !== "fixture"
        || (
          after.type === "fixture"
          && after.size.width === entity.size.width
          && after.size.height === entity.size.height
        )
      )
      && (
        entity.type !== "wall"
        || (after.type === "wall" && after.thickness === entity.thickness)
      )
      && (
        entity.type !== "poi"
        || (
          after.type === "poi"
          && after.radius === entity.radius
        )
      )
      && (
        entity.type !== "dimension"
        || (
          after.type === "dimension"
          && after.offset === entity.offset
        )
      )
    );

    setLocalError(null);
    try {
      await onApplyPlanEdit({
        reason: transformOnly ? "transform" : "properties",
        changes: [{ id: entity.id, before: entity, after }],
      });
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="studio-inspector-form">
      <h2>对象</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>类型</dt><dd>{entity.type}</dd></div>
      </dl>
      {localError === null ? null : (
        <StatusNotice
          id={localErrorId}
          tone="error"
          data-issue-code={localError.issue.code}
        >{localError.issue.message}</StatusNotice>
      )}
      <Field
        label="对象名称"
        value={name}
        disabled={propertiesDisabled}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Field
        label="对象 X (mm)"
        value={x}
        disabled={propertiesDisabled}
        {...fieldIssueProps("x")}
        onChange={(event) => setX(event.currentTarget.value)}
      />
      <Field
        label="对象 Y (mm)"
        value={y}
        disabled={propertiesDisabled}
        {...fieldIssueProps("y")}
        onChange={(event) => setY(event.currentTarget.value)}
      />
      <Field
        label="对象旋转 (°)"
        value={rotation}
        disabled={propertiesDisabled}
        {...fieldIssueProps("rotation")}
        onChange={(event) => setRotation(event.currentTarget.value)}
      />
      <label className="studio-plan-inspector__select">
        图层
        <select
          value={layerId}
          aria-label="对象图层"
          disabled={propertiesDisabled}
          onChange={(event) => setLayerId(event.currentTarget.value)}
        >
          {floor.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>{layer.name}</option>
          ))}
        </select>
      </label>
      <label className="studio-plan-inspector__check">
        <input
          type="checkbox"
          checked={locked}
          disabled={!layerAllowsEdits}
          onChange={(event) => setLocked(event.currentTarget.checked)}
        />
        对象锁定
      </label>
      <Field
        label="对象标签"
        value={tags}
        disabled={propertiesDisabled}
        onChange={(event) => setTags(event.currentTarget.value)}
      />
      {entity.type === "fixture" ? (
        <>
          <Field
            label="对象宽度 (mm)"
            value={width}
            disabled={propertiesDisabled}
            {...fieldIssueProps("width")}
            onChange={(event) => setWidth(event.currentTarget.value)}
          />
          <Field
            label="对象高度 (mm)"
            value={height}
            disabled={propertiesDisabled}
            {...fieldIssueProps("height")}
            onChange={(event) => setHeight(event.currentTarget.value)}
          />
        </>
      ) : null}
      {entity.type === "wall" ? (
        <Field
          label="墙体厚度 (mm)"
          value={thickness}
          disabled={propertiesDisabled}
          {...fieldIssueProps("thickness")}
          onChange={(event) => setThickness(event.currentTarget.value)}
        />
      ) : null}
      {entity.type === "poi" ? (
        <Field
          label="兴趣点半径 (mm)"
          value={radius}
          disabled={propertiesDisabled}
          {...fieldIssueProps("radius")}
          onChange={(event) => setRadius(event.currentTarget.value)}
        />
      ) : null}
      {entity.type === "dimension" ? (
        <Field
          label="尺寸偏移 (mm)"
          value={offset}
          disabled={propertiesDisabled}
          {...fieldIssueProps("offset")}
          onChange={(event) => setOffset(event.currentTarget.value)}
        />
      ) : null}
      <Button
        variant="secondary"
        disabled={!layerAllowsEdits || (entity.locked && locked)}
        onClick={() => void commit()}
      >
        应用对象属性
      </Button>
    </div>
  );
}

interface MultiInspectorProps {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly entityIds: readonly string[];
  readonly controller: InteractionController;
  readonly makeId: () => string;
  readonly onApplyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

function MultiInspector({
  snapshot,
  activeFloorId,
  entityIds,
  controller,
  makeId,
  onApplyPlanEdit,
  onError,
}: MultiInspectorProps) {
  const byId = new Map(snapshot.project.entities.map((entity) => [entity.id, entity]));
  const entities = entityIds.flatMap((id) => {
    const entity = byId.get(id);
    return entity === undefined ? [] : [entity];
  });
  const floor = snapshot.project.floors.find(
    (candidate) => candidate.id === activeFloorId,
  );
  const layers = new Map(floor?.layers.map((layer) => [layer.id, layer]) ?? []);
  const editable = (
    entities.length === entityIds.length
    && entities.length > 0
    && entities.every((entity) => {
      const layer = layers.get(entity.layerId);
      return (
        entity.floorId === activeFloorId
        && layer !== undefined
        && layer.visible
        && !layer.locked
        && !entity.locked
      );
    })
  );

  async function apply(result: PlanResult<PlanEditIntent>) {
    if (!result.ok) {
      onError(result.issue);
      return;
    }
    try {
      await onApplyPlanEdit(result.value);
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="studio-inspector-form">
      <h2>多选</h2>
      <p>已选择 {entityIds.length} 个对象</p>
      {!editable ? (
        <StatusNotice tone="info">选择包含隐藏、锁定、跨楼层或缺失对象，无法批量修改。</StatusNotice>
      ) : null}
      <div className="studio-plan-inspector__batch-actions">
        <Button
          variant="secondary"
          disabled={!editable}
          onClick={() => controller.copy()}
        >
          复制
        </Button>
        <Button
          variant="secondary"
          disabled={!editable}
          onClick={() => void controller.paste()}
        >
          粘贴
        </Button>
        <Button
          variant="secondary"
          disabled={!editable}
          onClick={() => void apply(linearArray(
            entities,
            { count: 2, delta: { x: 100, y: 0 } },
            makeId,
          ))}
        >
          线性阵列
        </Button>
        <Button
          variant="secondary"
          disabled={!editable}
          onClick={() => void apply(rectangularArray(
            entities,
            { rows: 2, columns: 2, rowGap: 100, columnGap: 100 },
            makeId,
          ))}
        >
          矩形阵列
        </Button>
        <Button
          variant="secondary"
          disabled={!editable || entities.length < 2}
          onClick={() => void apply(alignEntities(entities, "left"))}
        >
          左对齐
        </Button>
        <Button
          variant="secondary"
          disabled={!editable || entities.length < 3}
          onClick={() => void apply(distributeEntities(
            entities,
            "horizontal",
            "centers",
          ))}
        >
          水平等距
        </Button>
      </div>
    </div>
  );
}

export interface PlanInspectorProps {
  readonly snapshot: ProjectSnapshot;
  readonly context: InspectorContext;
  readonly activeFloorId: string;
  readonly saveState: SaveState;
  readonly backendMode: ProjectBackend["mode"];
  readonly projectPath: string;
  readonly controller: InteractionController;
  readonly makeId: () => string;
  readonly onHandledStoreError: (error: Error | null) => void;
  readonly onRenameProject: (name: string) => Promise<void>;
  readonly onSetProjectTags: (tags: readonly string[]) => Promise<void>;
  readonly onApplyFloorPatch: (change: FloorChange) => Promise<void>;
  readonly onApplyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

export function PlanInspector({
  snapshot,
  context,
  activeFloorId,
  saveState,
  backendMode,
  projectPath,
  controller,
  makeId,
  onHandledStoreError,
  onRenameProject,
  onSetProjectTags,
  onApplyFloorPatch,
  onApplyPlanEdit,
  onError,
}: PlanInspectorProps) {
  if (context.kind === "project") {
    return (
      <ProjectInspector
        snapshot={snapshot}
        saveState={saveState}
        backendMode={backendMode}
        projectPath={projectPath}
        onHandledStoreError={onHandledStoreError}
        onRename={onRenameProject}
        onSetTags={onSetProjectTags}
      />
    );
  }

  if (context.kind === "floor") {
    const order = snapshot.project.floors.findIndex(
      (floor) => floor.id === context.floorId,
    );
    const floor = snapshot.project.floors[order];
    return floor === undefined ? (
      <StatusNotice tone="error">楼层不存在</StatusNotice>
    ) : (
      <FloorInspector
        floor={floor}
        order={order}
        onApplyFloorPatch={onApplyFloorPatch}
      />
    );
  }

  if (context.kind === "layer") {
    const floor = snapshot.project.floors.find(
      (candidate) => candidate.id === context.floorId,
    );
    const order = floor?.layers.findIndex(
      (layer) => layer.id === context.layerId,
    ) ?? -1;
    const layer = floor?.layers[order];
    return floor === undefined || layer === undefined ? (
      <StatusNotice tone="error">图层不存在</StatusNotice>
    ) : (
      <LayerInspector
        floor={floor}
        layer={layer}
        order={order}
        onApplyFloorPatch={onApplyFloorPatch}
      />
    );
  }

  if (context.kind === "entity") {
    const entity = snapshot.project.entities.find(
      (candidate) => candidate.id === context.entityId,
    );
    const floor = entity === undefined
      ? undefined
      : snapshot.project.floors.find(
          (candidate) => candidate.id === entity.floorId,
        );
    return entity === undefined || floor === undefined ? (
      <StatusNotice tone="error">对象不存在</StatusNotice>
    ) : (
      <EntityInspector
        entity={entity}
        floor={floor}
        onApplyPlanEdit={onApplyPlanEdit}
        onError={onError}
      />
    );
  }

  return (
    <MultiInspector
      snapshot={snapshot}
      activeFloorId={activeFloorId}
      entityIds={context.entityIds}
      controller={controller}
      makeId={makeId}
      onApplyPlanEdit={onApplyPlanEdit}
      onError={onError}
    />
  );
}
