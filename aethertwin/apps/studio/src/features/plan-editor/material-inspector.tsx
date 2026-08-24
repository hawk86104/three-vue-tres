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
import { message, type StudioMessageDescriptor } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";
import { localizedErrorDescriptor, localizedErrorLogRef } from "../../i18n/localized-error";

export type MaterialTarget = SpaceUnit | Zone | Wall | Fixture;
type AssetIssue = ProjectStoreState["assetIssues"][number];
type MaterialTargetKind = MaterialAssignment["targetKind"];

const DEFAULT_SELECTION = "__default__";
const NEW_SELECTION = "__new__";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
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

interface SafeFailure {
  readonly descriptor: StudioMessageDescriptor;
  readonly logRef: string | null;
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
  onError: _onError,
}: MaterialInspectorProps) {
  const { format, t } = useI18n();
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
  const [localError, setLocalError] = useState<StudioMessageDescriptor | null>(null);
  const [failure, setFailure] = useState<SafeFailure | null>(null);
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
    setFailure(null);
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
    setFailure(null);
    try {
      await operation();
    } catch (error) {
      setFailure({
        descriptor: localizedErrorDescriptor(error),
        logRef: localizedErrorLogRef(error),
      });
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
      setLocalError(message("material.invalid"));
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
      aria-label={t("material.section")}
    >
      <summary>{t("material.section")}</summary>
      <div className="studio-material-inspector__body">
        <label className="studio-material-inspector__assignment">
          <span>{t("material.assignment")}</span>
          <select
            aria-label={t("material.assignment")}
            value={assignedMaterial?.id ?? DEFAULT_SELECTION}
            disabled={disabled || operationBusy}
            onChange={(event) => void changeAssignment(event.currentTarget.value)}
          >
            <option value={DEFAULT_SELECTION}>{t("material.default")}</option>
            {snapshot.project.materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
            <option value={NEW_SELECTION}>{t("material.new")}</option>
          </select>
        </label>
        {assignment !== null && assignedMaterial === null ? (
          <StatusNotice tone="error">{t("material.missing")}</StatusNotice>
        ) : null}
        {assignedMaterial === null ? null : (
          <>
            <p className="studio-material-inspector__impact">
              {t("material.impact", { count: sharedCount })}
            </p>
            <Field
              label={t("material.baseColor")}
              value={baseColor}
              disabled={disabled || operationBusy}
              {...fieldIssueProps(!COLOR_PATTERN.test(baseColor))}
              onChange={(event) => setBaseColor(event.currentTarget.value)}
            />
            <Field
              label={t("material.roughness")}
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
              label={t("material.metalness")}
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
              label={t("material.opacity")}
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
              <StatusNotice id={localErrorId} tone="error">{format(localError)}</StatusNotice>
            )}
            {failure === null ? null : (
              <StatusNotice tone="error">
                {format(failure.descriptor)}
                {failure.logRef === null ? null : ` ${t("error.diagnosticReference", { logRef: failure.logRef })}`}
              </StatusNotice>
            )}
            <Button
              variant="secondary"
              disabled={disabled || operationBusy}
              onClick={() => void applyMaterial()}
            >
              {t("material.apply")}
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
                  ? t("material.repairTexture")
                  : assignedMaterial.assetId === null
                    ? t("material.importTexture")
                    : t("material.replaceTexture")}
              </Button>
              {assignedMaterial.assetId === null ? null : (
                <Button
                  variant="ghost"
                  disabled={disabled || operationBusy}
                  onClick={() => void removeTexture()}
                >
                  {t("material.removeTexture")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
