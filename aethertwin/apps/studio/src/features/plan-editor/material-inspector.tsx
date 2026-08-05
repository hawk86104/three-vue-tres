import type {
  Fixture,
  MaterialAssignment,
  MaterialDefinition,
  ProjectSnapshot,
  SpaceUnit,
  Wall,
  Zone,
} from "@aethertwin/core-model";
import { Button, Field, StatusNotice } from "@aethertwin/design-system";
import type {
  AnySnapshotRecordsPatch,
  ProjectStoreState,
} from "@aethertwin/project-store";
import { useEffect, useId, useRef, useState } from "react";

export type MaterialTarget = SpaceUnit | Zone | Wall | Fixture;
type AssetIssue = ProjectStoreState["assetIssues"][number];
type MaterialTargetKind = MaterialAssignment["targetKind"];

const DEFAULT_SELECTION = "__default__";
const NEW_SELECTION = "__new__";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const INVALID_MATERIAL_MESSAGE =
  "基础颜色必须是 #RRGGBB，粗糙度、金属度必须在 0 到 1，透明度必须大于 0 且不超过 1";

const targetDefaults: Readonly<Record<
  MaterialTargetKind,
  Pick<MaterialDefinition, "baseColor" | "roughness" | "metalness" | "opacity">
>> = Object.freeze({
  "space-floor": Object.freeze({
    baseColor: "#445760",
    roughness: 0.9,
    metalness: 0,
    opacity: 1,
  }),
  wall: Object.freeze({
    baseColor: "#c8d2d8",
    roughness: 0.82,
    metalness: 0,
    opacity: 1,
  }),
  fixture: Object.freeze({
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 1,
  }),
});

export interface MaterialInspectorProps {
  readonly snapshot: ProjectSnapshot;
  readonly target: MaterialTarget;
  readonly disabled: boolean;
  readonly assetIssues: readonly AssetIssue[];
  readonly assetOperationBusy: boolean;
  readonly makeId: () => string;
  readonly onApplyPatches: (
    patches: readonly AnySnapshotRecordsPatch[],
  ) => Promise<void>;
  readonly onImportTexture: (
    material: MaterialDefinition,
    target: MaterialTarget,
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

export function materialTargetKind(target: MaterialTarget): MaterialTargetKind {
  if (target.type === "space-unit" || target.type === "zone") {
    return "space-floor";
  }
  return target.type;
}

function finiteUnit(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : null;
}

export function MaterialInspector({
  snapshot,
  target,
  disabled,
  assetIssues,
  assetOperationBusy,
  makeId,
  onApplyPatches,
  onImportTexture,
  onError,
}: MaterialInspectorProps) {
  const targetKind = materialTargetKind(target);
  const assignment = snapshot.project.materialAssignments.find(
    (candidate) => (
      candidate.targetKind === targetKind && candidate.targetId === target.id
    ),
  ) ?? null;
  const assignedMaterial = assignment === null
    ? null
    : snapshot.project.materials.find(
        (candidate) => candidate.id === assignment.materialId,
      ) ?? null;
  const sharedCount = assignedMaterial === null
    ? 0
    : snapshot.project.materialAssignments.filter(
        ({ materialId }) => materialId === assignedMaterial.id,
      ).length;
  const textureIssue = assignedMaterial?.assetId === null
    || assignedMaterial?.assetId === undefined
    ? undefined
    : assetIssues.find(({ assetId }) => assetId === assignedMaterial.assetId);
  const repairable = textureIssue?.code === "ASSET_MISSING"
    || textureIssue?.code === "ASSET_CORRUPT";

  const [baseColor, setBaseColor] = useState(
    assignedMaterial?.baseColor ?? targetDefaults[targetKind].baseColor,
  );
  const [roughness, setRoughness] = useState(
    String(assignedMaterial?.roughness ?? targetDefaults[targetKind].roughness),
  );
  const [metalness, setMetalness] = useState(
    String(assignedMaterial?.metalness ?? targetDefaults[targetKind].metalness),
  );
  const [opacity, setOpacity] = useState(
    String(assignedMaterial?.opacity ?? targetDefaults[targetKind].opacity),
  );
  const [operationBusy, setOperationBusy] = useState(false);
  const operationBusyRef = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const localErrorId = `material-inspector-error-${useId().replaceAll(":", "")}`;
  function fieldIssueProps(invalid: boolean) {
    const visible = localError !== null && invalid;
    return {
      "aria-describedby": visible ? localErrorId : undefined,
      "aria-invalid": visible ? true : undefined,
    };
  }


  useEffect(() => {
    const defaults = targetDefaults[targetKind];
    setBaseColor(assignedMaterial?.baseColor ?? defaults.baseColor);
    setRoughness(String(assignedMaterial?.roughness ?? defaults.roughness));
    setMetalness(String(assignedMaterial?.metalness ?? defaults.metalness));
    setOpacity(String(assignedMaterial?.opacity ?? defaults.opacity));
    setLocalError(null);
  }, [
    assignedMaterial?.baseColor,
    assignedMaterial?.id,
    assignedMaterial?.metalness,
    assignedMaterial?.opacity,
    assignedMaterial?.roughness,
    target.id,
    targetKind,
  ]);

  async function run(operation: () => Promise<void>): Promise<void> {
    if (disabled || operationBusyRef.current) return;
    operationBusyRef.current = true;
    setOperationBusy(true);
    setLocalError(null);
    try {
      await operation();
    } catch (error) {
      onError(error);
    } finally {
      operationBusyRef.current = false;
      setOperationBusy(false);
    }
  }

  async function changeAssignment(selection: string): Promise<void> {
    if (selection === DEFAULT_SELECTION) {
      if (assignment === null) return;
      await run(() => onApplyPatches([{
        collection: "materialAssignments",
        changes: [{ id: assignment.id, before: assignment, after: null }],
      }]));
      return;
    }

    if (selection === NEW_SELECTION) {
      await run(() => {
        const materialId = makeId();
        const nextMaterial: MaterialDefinition = {
          id: materialId,
          name: `${target.name} 材质`,
          tags: [],
          ...targetDefaults[targetKind],
          assetId: null,
        };
        const assignmentId = assignment?.id ?? makeId();
        const nextAssignment: MaterialAssignment = {
          id: assignmentId,
          name: `${target.name} 材质分配`,
          tags: [],
          materialId,
          targetKind,
          targetId: target.id,
        };
        return onApplyPatches([
          {
            collection: "materials",
            changes: [{
              id: materialId,
              before: null,
              after: nextMaterial,
              index: snapshot.project.materials.length,
            }],
          },
          {
            collection: "materialAssignments",
            changes: [{
              id: assignmentId,
              before: assignment,
              after: nextAssignment,
              ...(assignment === null
                ? { index: snapshot.project.materialAssignments.length }
                : {}),
            }],
          },
        ]);
      });
      return;
    }

    if (
      !snapshot.project.materials.some(({ id }) => id === selection)
      || assignment?.materialId === selection
    ) return;
    const assignmentId = assignment?.id ?? makeId();
    const nextAssignment: MaterialAssignment = assignment === null
      ? {
          id: assignmentId,
          name: `${target.name} 材质分配`,
          tags: [],
          materialId: selection,
          targetKind,
          targetId: target.id,
        }
      : { ...assignment, materialId: selection };
    await run(() => onApplyPatches([{
      collection: "materialAssignments",
      changes: [{
        id: assignmentId,
        before: assignment,
        after: nextAssignment,
        ...(assignment === null
          ? { index: snapshot.project.materialAssignments.length }
          : {}),
      }],
    }]));
  }

  async function applyMaterial(): Promise<void> {
    if (assignedMaterial === null) return;
    const nextRoughness = finiteUnit(roughness);
    const nextMetalness = finiteUnit(metalness);
    const nextOpacity = finiteUnit(opacity);
    if (
      !COLOR_PATTERN.test(baseColor)
      || nextRoughness === null
      || nextMetalness === null
      || nextOpacity === null
      || nextOpacity === 0
    ) {
      setLocalError(INVALID_MATERIAL_MESSAGE);
      return;
    }
    const after: MaterialDefinition = {
      ...assignedMaterial,
      baseColor: baseColor.toLowerCase(),
      roughness: nextRoughness,
      metalness: nextMetalness,
      opacity: nextOpacity,
    };
    if (JSON.stringify(after) === JSON.stringify(assignedMaterial)) {
      setLocalError(null);
      return;
    }
    await run(() => onApplyPatches([{
      collection: "materials",
      changes: [{
        id: assignedMaterial.id,
        before: assignedMaterial,
        after,
      }],
    }]));
  }

  async function removeTexture(): Promise<void> {
    if (assignedMaterial?.assetId === null || assignedMaterial === null) return;
    await run(() => onApplyPatches([{
      collection: "materials",
      changes: [{
        id: assignedMaterial.id,
        before: assignedMaterial,
        after: { ...assignedMaterial, assetId: null },
      }],
    }]));
  }

  return (
    <details
      className="studio-material-inspector"
      role="group"
      aria-label="材质"
    >
      <summary>材质</summary>
      <div className="studio-material-inspector__body">
        <label className="studio-material-inspector__assignment">
          <span>材质分配</span>
          <select
            aria-label="材质分配"
            value={assignedMaterial?.id ?? DEFAULT_SELECTION}
            disabled={disabled || operationBusy}
            onChange={(event) => void changeAssignment(event.currentTarget.value)}
          >
            <option value={DEFAULT_SELECTION}>默认材质</option>
            {snapshot.project.materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
            <option value={NEW_SELECTION}>新建材质</option>
          </select>
        </label>
        {assignment !== null && assignedMaterial === null ? (
          <StatusNotice tone="error">材质分配引用了不存在的材质。</StatusNotice>
        ) : null}
        {assignedMaterial === null ? null : (
          <>
            <p className="studio-material-inspector__impact">
              此材质影响 {sharedCount} 个对象
            </p>
            <Field
              label="基础颜色"
              value={baseColor}
              disabled={disabled || operationBusy}
              {...fieldIssueProps(!COLOR_PATTERN.test(baseColor))}
              onChange={(event) => setBaseColor(event.currentTarget.value)}
            />
            <Field
              label="粗糙度"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={roughness}
              disabled={disabled || operationBusy}
              {...fieldIssueProps(finiteUnit(roughness) === null)}
              onChange={(event) => setRoughness(event.currentTarget.value)}
            />
            <Field
              label="金属度"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={metalness}
              disabled={disabled || operationBusy}
              {...fieldIssueProps(finiteUnit(metalness) === null)}
              onChange={(event) => setMetalness(event.currentTarget.value)}
            />
            <Field
              label="透明度"
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              value={opacity}
              disabled={disabled || operationBusy}
              {...fieldIssueProps(finiteUnit(opacity) === null || Number(opacity) === 0)}
              onChange={(event) => setOpacity(event.currentTarget.value)}
            />
            {localError === null ? null : (
              <StatusNotice id={localErrorId} tone="error">{localError}</StatusNotice>
            )}
            <Button
              variant="secondary"
              disabled={disabled || operationBusy}
              onClick={() => void applyMaterial()}
            >
              应用材质
            </Button>
            <div className="studio-material-inspector__texture-actions">
              <Button
                variant="secondary"
                disabled={disabled || operationBusy || assetOperationBusy}
                onClick={(event) => void run(() => onImportTexture(
                  assignedMaterial,
                  target,
                  event.currentTarget,
                ))}
              >
                {repairable
                  ? "修复纹理"
                  : assignedMaterial.assetId === null
                    ? "导入纹理"
                    : "替换纹理"}
              </Button>
              {assignedMaterial.assetId === null ? null : (
                <Button
                  variant="ghost"
                  disabled={disabled || operationBusy}
                  onClick={() => void removeTexture()}
                >
                  移除纹理
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
