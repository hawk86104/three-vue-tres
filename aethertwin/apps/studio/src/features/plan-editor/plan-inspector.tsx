import {
  validateOpeningGeometry,
  type Fixture,
  type Floor,
  type MediaAsset,
  type Opening,
  type PlanLayer,
  type PlanReference,
  type PointOfInterest,
  type ProductContent,
  type ProjectSnapshot,
  type SaveState,
  type SpatialEntity,
  type Wall,
} from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import { showroomFixture } from "@aethertwin/mode-showroom";
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
import type {
  BuildingStructurePatch,
  ProjectBackend,
  ProjectAssetSource,
  ProjectStoreState,
} from "@aethertwin/project-store";
import { useEffect, useId, useState, type Ref } from "react";
import { validateProjectName } from "../project-center/create-project-dialog";
import type { InteractionController } from "./interaction-controller";
import { OpeningInspector } from "./opening-inspector";
import { ReferenceInspector } from "./reference-inspector";
import {
  ContentInspector,
  type ProductMediaRole,
} from "./content-inspector";

type AssetIssue = ProjectStoreState["assetIssues"][number];

export type InspectorContext =
  | { readonly kind: "project" }
  | { readonly kind: "floor"; readonly floorId: string }
  | { readonly kind: "layer"; readonly floorId: string; readonly layerId: string }
  | { readonly kind: "plan-reference"; readonly referenceId: string }
  | { readonly kind: "opening"; readonly openingId: string }
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

function fixtureVerticalHeight(fixture: Fixture): number | null {
  if (fixture.spatial3D !== undefined) return fixture.spatial3D.height;
  return fixture.kind === "generic"
    ? null
    : showroomFixture(fixture.kind).defaultSize.height;
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
  readonly snapshot: ProjectSnapshot;
  readonly entity: SpatialEntity;
  readonly floor: Floor;
  readonly onApplyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onApplyBuildingStructurePatch: (
    patch: BuildingStructurePatch,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

type EntityIssueField =
  | "x"
  | "y"
  | "rotation"
  | "width"
  | "depth"
  | "verticalHeight"
  | "thickness"
  | "radius"
  | "offset";

interface EntityFieldIssue {
  readonly field: EntityIssueField;
  readonly issue: PlanIssue;
}

function EntityInspector({
  snapshot,
  entity,
  floor,
  onApplyPlanEdit,
  onApplyBuildingStructurePatch,
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
  const committedDepth = entity.type === "fixture" ? String(entity.size.height) : "";
  const committedVerticalHeight = entity.type === "fixture"
    ? String(fixtureVerticalHeight(entity) ?? "")
    : "";
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
  const [depth, setDepth] = useState(committedDepth);
  const [verticalHeight, setVerticalHeight] = useState(committedVerticalHeight);
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
    setDepth(committedDepth);
    setVerticalHeight(committedVerticalHeight);
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
    committedDepth,
    committedVerticalHeight,
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
      const nextDepth = positiveLength(depth);
      if (nextWidth === null) {
        reportFieldIssue("width", "INVALID_LENGTH", "宽度和深度必须是正数");
        return;
      }
      if (nextDepth === null) {
        reportFieldIssue("depth", "INVALID_LENGTH", "宽度和深度必须是正数");
        return;
      }
      after = {
        ...after,
        size: { width: nextWidth, height: nextDepth },
      };

      const normalizedVerticalHeight = verticalHeight.trim();
      if (normalizedVerticalHeight.length === 0) {
        if (after.kind !== "generic") {
          reportFieldIssue(
            "verticalHeight",
            "INVALID_LENGTH",
            "垂直高度必须是正数",
          );
          return;
        }
        const withoutSpatial3D = { ...after };
        delete withoutSpatial3D.spatial3D;
        after = withoutSpatial3D;
      } else {
        const nextVerticalHeight = positiveLength(normalizedVerticalHeight);
        if (nextVerticalHeight === null) {
          reportFieldIssue(
            "verticalHeight",
            "INVALID_LENGTH",
            "垂直高度必须是正数",
          );
          return;
        }
        after = {
          ...after,
          spatial3D: {
            elevation: after.spatial3D?.elevation ?? 0,
            height: nextVerticalHeight,
          },
        };
      }
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
      && JSON.stringify(after.spatial3D) === JSON.stringify(entity.spatial3D)
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

    const attachedOpenings = entity.type === "wall"
      ? snapshot.project.openings.filter((opening) => opening.wallId === entity.id)
      : [];
    if (entity.type === "wall" && after.type === "wall") {
      const nextWall: Wall = after;
      const walls = snapshot.project.entities.flatMap((candidate): Wall[] => {
        if (candidate.id === entity.id) return [nextWall];
        return candidate.type === "wall" ? [candidate] : [];
      });
      const affectedIds = new Set(attachedOpenings.map(({ id }) => id));
      const issues = validateOpeningGeometry(walls, snapshot.project.openings)
        .filter((issue) => affectedIds.has(issue.openingId));
      if (issues.length > 0) {
        const first = issues[0]!;
        reportFieldIssue(
          "thickness",
          first.code,
          `${first.code}: affected openings ${[
            ...new Set(issues.map(({ openingId }) => openingId)),
          ].join(", ")}`,
        );
        return;
      }
    }

    setLocalError(null);
    try {
      if (
        entity.type === "wall"
        && after.type === "wall"
        && attachedOpenings.length > 0
        && !transformOnly
      ) {
        await onApplyBuildingStructurePatch({
          reason: "properties",
          wallChanges: [{ id: entity.id, before: entity, after }],
          openingChanges: [],
        });
      } else {
        await onApplyPlanEdit({
          reason: transformOnly ? "transform" : "properties",
          changes: [{ id: entity.id, before: entity, after }],
        });
      }
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="studio-inspector-form">
      <h2>对象</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>类型</dt><dd>{entity.type}</dd></div>
        {entity.type === "fixture" ? (
          <div><dt>展具种类</dt><dd>{entity.kind}</dd></div>
        ) : null}
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
            label="对象深度 (mm)"
            value={depth}
            disabled={propertiesDisabled}
            {...fieldIssueProps("depth")}
            onChange={(event) => setDepth(event.currentTarget.value)}
          />
          <Field
            label="对象垂直高度 (mm)"
            value={verticalHeight}
            disabled={propertiesDisabled}
            {...fieldIssueProps("verticalHeight")}
            onChange={(event) => setVerticalHeight(event.currentTarget.value)}
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

interface EntityInspectorWithContentProps {
  readonly productMediaImageButtonRef?: Ref<HTMLButtonElement> | undefined;
  readonly snapshot: ProjectSnapshot;
  readonly assetIssues: readonly AssetIssue[];
  readonly assetOperationBusy: boolean;
  readonly entity: SpatialEntity;
  readonly floor: Floor;
  readonly makeId: () => string;
  readonly onApplyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onApplyBuildingStructurePatch: (
    patch: BuildingStructurePatch,
  ) => Promise<void>;
  readonly onApplyProductContentPatch: (
    before: ProductContent | null,
    after: ProductContent,
  ) => Promise<void>;
  readonly onImportProductMedia: (
    role: ProductMediaRole,
    target: Fixture | PointOfInterest,
    content: ProductContent | null,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly onRepairProductMedia: (
    media: MediaAsset,
    target: Fixture | PointOfInterest,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly resolveAsset: (assetId: string) => Promise<ProjectAssetSource>;
  readonly onError: (error: unknown) => void;
}

function EntityInspectorWithContent({
  productMediaImageButtonRef,
  snapshot,
  assetIssues,
  assetOperationBusy,
  entity,
  floor,
  makeId,
  onApplyPlanEdit,
  onApplyBuildingStructurePatch,
  onApplyProductContentPatch,
  onImportProductMedia,
  onRepairProductMedia,
  resolveAsset,
  onError,
}: EntityInspectorWithContentProps) {
  const entityInspector = (
    <EntityInspector
      snapshot={snapshot}
      entity={entity}
      floor={floor}
      onApplyPlanEdit={onApplyPlanEdit}
      onApplyBuildingStructurePatch={onApplyBuildingStructurePatch}
      onError={onError}
    />
  );
  const target = entity.type === "fixture"
    || (entity.type === "poi" && entity.kind === "product-hotspot")
    ? entity
    : null;
  if (target === null) return entityInspector;

  const storedContent = snapshot.project.productContents.find(
    (candidate) => candidate.targetEntityId === target.id,
  );
  if (target.type === "poi" && storedContent === undefined) {
    return (
      <div className="studio-inspector-stack">
        {entityInspector}
        <StatusNotice tone="error">
          {"\u4ea7\u54c1\u70ed\u70b9\u7f3a\u5c11\u5185\u5bb9\u8bb0\u5f55"}
        </StatusNotice>
      </div>
    );
  }

  const content: ProductContent = storedContent ?? {
    id: "00000000-0000-4000-8000-000000000000",
    name: target.name,
    tags: [...target.tags],
    targetEntityId: target.id,
    description: "",
    mediaAssetIds: [],
  };
  const mediaById = new Map(
    snapshot.project.mediaAssets.map((item) => [item.id, item]),
  );
  const media = content.mediaAssetIds.flatMap((id) => {
    const item = mediaById.get(id);
    return item === undefined ? [] : [item];
  });
  const targetLayer = floor.layers.find((layer) => layer.id === target.layerId);
  const contentDisabled = target.locked
    || targetLayer === undefined
    || !targetLayer.visible
    || targetLayer.locked;
  return (
    <div className="studio-inspector-stack">
      {entityInspector}
      <ContentInspector
        importImageButtonRef={productMediaImageButtonRef}
        content={content}
        target={target}
        media={media}
        assetIssues={assetIssues}
        disabled={contentDisabled}
        assetOperationBusy={assetOperationBusy}
        onPatch={async (_before, after) => {
          try {
            const next = storedContent === undefined
              ? { ...after, id: makeId(), targetEntityId: target.id }
              : after;
            await onApplyProductContentPatch(storedContent ?? null, next);
          } catch (error) {
            onError(error);
          }
        }}
        onImport={(role, initiator) => (
          onImportProductMedia(role, target, storedContent ?? null, initiator)
        )}
        onRepair={(mediaItem, initiator) => (
          onRepairProductMedia(mediaItem, target, initiator)
        )}
        resolveAsset={resolveAsset}
      />
    </div>
  );
}

export interface PlanInspectorProps {
  readonly productMediaImageButtonRef?: Ref<HTMLButtonElement> | undefined;
  readonly snapshot: ProjectSnapshot;
  readonly assetIssues: readonly AssetIssue[];
  readonly assetOperationBusy: boolean;
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
  readonly onApplyPlanReferencePatch?: (
    before: PlanReference,
    after: PlanReference | null,
  ) => Promise<void>;
  readonly onApplyOpeningPatch: (
    before: Opening,
    after: Opening | null,
  ) => Promise<void>;
  readonly onApplyBuildingStructurePatch: (
    patch: BuildingStructurePatch,
  ) => Promise<void>;
  readonly onApplyProductContentPatch: (
    before: ProductContent | null,
    after: ProductContent,
  ) => Promise<void>;
  readonly onImportProductMedia: (
    role: ProductMediaRole,
    target: Fixture | PointOfInterest,
    content: ProductContent | null,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly onRepairProductMedia: (
    media: MediaAsset,
    target: Fixture | PointOfInterest,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly resolveAsset: (assetId: string) => Promise<ProjectAssetSource>;
  readonly onError: (error: unknown) => void;
}

export function PlanInspector({
  productMediaImageButtonRef,
  snapshot,
  assetIssues,
  assetOperationBusy,
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
  onApplyPlanReferencePatch,
  onApplyOpeningPatch,
  onApplyBuildingStructurePatch,
  onApplyProductContentPatch,
  onImportProductMedia,
  onRepairProductMedia,
  resolveAsset,
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

  if (context.kind === "plan-reference") {
    const reference = snapshot.project.planReferences.find(
      (candidate) => candidate.id === context.referenceId,
    );
    const floor = reference === undefined
      ? undefined
      : snapshot.project.floors.find(({ id }) => id === reference.floorId);
    const layer = reference === undefined
      ? undefined
      : floor?.layers.find(({ id }) => id === reference.layerId);
    if (reference === undefined || layer === undefined) {
      return (
        <StatusNotice tone="error">{"\u5e73\u9762\u53c2\u8003\u4e0d\u5b58\u5728"}</StatusNotice>
      );
    }
    return (
      <ReferenceInspector
        reference={reference}
        layer={layer}
        onApplyPlanReferencePatch={async (before, after) => {
          if (onApplyPlanReferencePatch === undefined) {
            throw new Error("Plan-reference mutations are unavailable.");
          }
          await onApplyPlanReferencePatch(before, after);
        }}
        onError={onError}
      />
    );
  }

  if (context.kind === "opening") {
    const opening = snapshot.project.openings.find(
      (candidate) => candidate.id === context.openingId,
    );
    const wall = opening === undefined
      ? undefined
      : snapshot.project.entities.find(
          (candidate): candidate is Wall => (
            candidate.type === "wall" && candidate.id === opening.wallId
          ),
        );
    const floor = wall === undefined
      ? undefined
      : snapshot.project.floors.find(({ id }) => id === wall.floorId);
    const layer = wall === undefined
      ? undefined
      : floor?.layers.find(({ id }) => id === wall.layerId);
    if (opening === undefined || wall === undefined || layer === undefined) {
      return <StatusNotice tone="error">门窗不存在</StatusNotice>;
    }
    return (
      <OpeningInspector
        opening={opening}
        wall={wall}
        layer={layer}
        onApplyOpeningPatch={onApplyOpeningPatch}
        onError={onError}
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
      <EntityInspectorWithContent
        productMediaImageButtonRef={productMediaImageButtonRef}
        snapshot={snapshot}
        assetIssues={assetIssues}
        assetOperationBusy={assetOperationBusy}
        entity={entity}
        floor={floor}
        makeId={makeId}
        onApplyPlanEdit={onApplyPlanEdit}
        onApplyBuildingStructurePatch={onApplyBuildingStructurePatch}
        onApplyProductContentPatch={onApplyProductContentPatch}
        onImportProductMedia={onImportProductMedia}
        onRepairProductMedia={onRepairProductMedia}
        resolveAsset={resolveAsset}
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
