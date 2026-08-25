import {
  validateOpeningGeometry,
  type Fixture,
  type Floor,
  type MaterialDefinition,
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
  AnySnapshotRecordsPatch,
  BuildingStructurePatch,
  ProjectBackend,
  ProjectAssetSource,
  ProjectStoreState,
  SceneEnvironmentPatch,
} from "@aethertwin/project-store";
import { useEffect, useId, useState, type Ref } from "react";
import { message, type StudioMessageDescriptor, type StudioMessageId } from "../../i18n/format-message";
import { localizedErrorDescriptor, localizedErrorLogRef } from "../../i18n/localized-error";
import {
  ENTITY_TYPE_MESSAGE_IDS,
  FIXTURE_KIND_MESSAGE_IDS,
  POINT_OF_INTEREST_KIND_MESSAGE_IDS,
  PROFILE_MESSAGE_IDS,
  SPACE_UNIT_KIND_MESSAGE_IDS,
} from "../../i18n/display-message-ids";
import { useDisplayName } from "../../i18n/display-name-provider";
import { useI18n } from "../../i18n/locale-provider";
import { normalizeProjectName, validateProjectName, type ProjectNameValidationReason } from "../project-center/create-project-dialog";
import type { InteractionController } from "./interaction-controller";
import { OpeningInspector } from "./opening-inspector";
import { ReferenceInspector } from "./reference-inspector";
import {
  ContentInspector,
  type ProductMediaRole,
} from "./content-inspector";
import {
  MaterialInspector,
  type MaterialTarget,
} from "./material-inspector";
import { EnvironmentInspector } from "./environment-inspector";

type AssetIssue = ProjectStoreState["assetIssues"][number];

const projectNameValidationDescriptors: Readonly<Record<ProjectNameValidationReason, StudioMessageDescriptor>> = {
  empty: message("validation.empty"),
  "dot-path": message("validation.dotPath"),
  separator: message("validation.separator"),
  "reserved-name": message("validation.reservedName"),
  "trailing-dot-or-space": message("validation.trailing"),
  "too-long": message("validation.tooLong"),
};

export type InspectorContext =
  | { readonly kind: "project" }
  | { readonly kind: "floor"; readonly floorId: string }
  | { readonly kind: "layer"; readonly floorId: string; readonly layerId: string }
  | { readonly kind: "plan-reference"; readonly referenceId: string }
  | { readonly kind: "opening"; readonly openingId: string }
  | { readonly kind: "entity"; readonly entityId: string }
  | { readonly kind: "multi"; readonly entityIds: readonly string[] };

const saveStateMessageIds = {
  dirty: "editor.save.dirty",
  saving: "editor.save.saving",
  saved: "editor.save.saved",
  error: "editor.save.error",
  recovered: "editor.save.recovered",
} as const satisfies Readonly<Record<SaveState, StudioMessageId>>;

const backendModeMessageIds = {
  desktop: "backend.desktop",
  sandbox: "backend.sandbox",
} as const satisfies Readonly<Record<ProjectBackend["mode"], StudioMessageId>>;

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

interface InspectorFieldError {
  readonly descriptor: StudioMessageDescriptor;
  readonly logRef: string | null;
}

function inspectorFieldError(value: unknown): InspectorFieldError {
  return {
    descriptor: localizedErrorDescriptor(value),
    logRef: localizedErrorLogRef(value),
  };
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
  readonly onApplySceneEnvironmentPatch: (
    patch: SceneEnvironmentPatch,
  ) => Promise<void>;
  readonly onError: (error: unknown) => void;
}

function ProjectInspector({
  snapshot,
  saveState,
  backendMode,
  projectPath,
  onHandledStoreError,
  onRename,
  onSetTags,
  onApplySceneEnvironmentPatch,
  onError,
}: ProjectInspectorProps) {
  const committedName = snapshot.project.name;
  const committedTags = snapshot.project.tags.join(", ");
  const [name, setName] = useState(committedName);
  const [tags, setTags] = useState(committedTags);
  const [nameError, setNameError] = useState<InspectorFieldError | null>(null);
  const [nameValidationError, setNameValidationError] = useState<ProjectNameValidationReason | null>(null);
  const [tagsError, setTagsError] = useState<InspectorFieldError | null>(null);
  const [nameHandledError, setNameHandledError] = useState<Error | null>(null);
  const [tagsHandledError, setTagsHandledError] = useState<Error | null>(null);
  const nameErrorId = `plan-inspector-name-error-${useId().replaceAll(":", "")}`;
  const tagsErrorId = `plan-inspector-tags-error-${useId().replaceAll(":", "")}`;
  const { format, t } = useI18n();

  useEffect(() => {
    setName(committedName);
    setTags(committedTags);
    setNameError(null);
    setNameValidationError(null);
    setTagsError(null);
    setNameHandledError(null);
    setTagsHandledError(null);
  }, [committedName, committedTags]);

  function clearNameError() {
    setNameError(null);
    setNameValidationError(null);
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
    if (validation !== null) {
      setNameError(null);
      setNameValidationError(validation);
      setNameHandledError(null);
      onHandledStoreError(tagsHandledError);
      return;
    }
    const canonicalName = normalizeProjectName(name);
    if (canonicalName === committedName) {
      clearNameError();
      return;
    }
    try {
      await onRename(canonicalName);
      clearNameError();
    } catch (error) {
      const handled = errorValue(error);
      setNameValidationError(null);
      onHandledStoreError(handled);
      setNameError(inspectorFieldError(error));
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
      setTagsError(inspectorFieldError(error));
      setTagsHandledError(handled);
    }
  }

  const nameLogRef = nameError?.logRef ?? null;
  const tagsLogRef = tagsError?.logRef ?? null;
  const renderedNameError = nameValidationError === null
    ? nameError === null ? null : format(nameError.descriptor)
    : format(projectNameValidationDescriptors[nameValidationError]);

  return (
    <div className="studio-inspector-stack">
      <div className="studio-inspector-form">
      <h2>{t("inspector.project")}</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("inspector.profile")}</dt><dd>{t(PROFILE_MESSAGE_IDS[snapshot.project.profile])}</dd></div>
        <div><dt>{t("inspector.schema")}</dt><dd>{snapshot.schemaVersion}</dd></div>
        <div><dt>{t("inspector.saveState")}</dt><dd>{t(saveStateMessageIds[saveState])}</dd></div>
        <div><dt>{t("inspector.backend")}</dt><dd>{t(backendModeMessageIds[backendMode])}</dd></div>
        <div><dt>{t("inspector.projectPath")}</dt><dd>{projectPath}</dd></div>
      </dl>
      {renderedNameError === null ? null : (
        <StatusNotice id={nameErrorId} tone="error">
          <span>{renderedNameError}</span>
          {nameLogRef === null ? null : <span>{t("error.diagnosticReference", { logRef: nameLogRef })}</span>}
        </StatusNotice>
      )}
      {tagsError === null ? null : (
        <StatusNotice id={tagsErrorId} tone="error">
          <span>{format(tagsError.descriptor)}</span>
          {tagsLogRef === null ? null : <span>{t("error.diagnosticReference", { logRef: tagsLogRef })}</span>}
        </StatusNotice>
      )}
      <Field
        label={t("inspector.projectName")}
        value={name}
        aria-describedby={renderedNameError === null ? undefined : nameErrorId}
        aria-invalid={renderedNameError === null ? undefined : true}
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
        {t("inspector.applyName")}
      </Button>
      <Field
        label={t("inspector.projectTags")}
        value={tags}
        aria-describedby={tagsError === null ? undefined : tagsErrorId}
        aria-invalid={tagsError === null ? undefined : true}
        helpText={t("inspector.tagsHelp")}
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
        {t("inspector.applyTags")}
      </Button>
      </div>
      <EnvironmentInspector
        environment={snapshot.project.sceneEnvironment}
        onApplyPatch={onApplySceneEnvironmentPatch}
        onError={onError}
      />
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
  const { t } = useI18n();
  const displayName = useDisplayName();
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
      <h2>{t("inspector.floor")}</h2>
      <p>{displayName({ kind: "floor", id: floor.id, authoredName: floor.name })}</p>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("inspector.order")}</dt><dd>{order + 1}</dd></div>
      </dl>
      <Field
        label={t("inspector.floorName")}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => void commitName()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitName()}
      >
        {t("inspector.applyFloorName")}
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
  const { t } = useI18n();
  const displayName = useDisplayName();
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
      <h2>{t("inspector.layer")}</h2>
      <p>{displayName({ kind: "layer", id: layer.id, authoredName: layer.name })}</p>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("inspector.order")}</dt><dd>{order + 1}</dd></div>
        <div><dt>{t("inspector.visible")}</dt><dd>{t(layer.visible ? "inspector.yes" : "inspector.no")}</dd></div>
        <div><dt>{t("inspector.locked")}</dt><dd>{t(layer.locked ? "inspector.yes" : "inspector.no")}</dd></div>
      </dl>
      <Field
        label={t("inspector.layerName")}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => void commitName()}
      />
      <Button
        variant="secondary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void commitName()}
      >
        {t("inspector.applyLayerName")}
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
        {t("inspector.layerVisible")}
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
        {t("inspector.layerLocked")}
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
  const { t } = useI18n();
  const displayName = useDisplayName();
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
      reportFieldIssue("x", "INVALID_LENGTH", t("inspector.invalidPosition"));
      return;
    }
    if (nextY === null) {
      reportFieldIssue("y", "INVALID_LENGTH", t("inspector.invalidPosition"));
      return;
    }
    if (!Number.isFinite(nextRotation)) {
      reportFieldIssue("rotation", "INVALID_ROTATION", t("inspector.invalidPosition"));
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
        reportFieldIssue("width", "INVALID_LENGTH", t("inspector.invalidSize"));
        return;
      }
      if (nextDepth === null) {
        reportFieldIssue("depth", "INVALID_LENGTH", t("inspector.invalidSize"));
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
            t("inspector.invalidVerticalHeight"),
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
            t("inspector.invalidVerticalHeight"),
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
        reportFieldIssue("thickness", "INVALID_LENGTH", t("inspector.invalidWallThickness"));
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
          reportFieldIssue("radius", "INVALID_LENGTH", t("inspector.invalidPoiRadius"));
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
        reportFieldIssue("offset", "INVALID_LENGTH", t("inspector.invalidDimensionOffset"));
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
      <h2>{t("inspector.entity")}</h2>
      <dl className="studio-plan-inspector__metadata">
        <div><dt>{t("inspector.entityName")}</dt><dd>{displayName({ kind: "entity", id: entity.id, authoredName: entity.name })}</dd></div>
        <div><dt>{t("inspector.entityType")}</dt><dd>{t(ENTITY_TYPE_MESSAGE_IDS[entity.type])}</dd></div>
        {entity.type === "fixture" ? (
          <div><dt>{t("inspector.entityKind")}</dt><dd>{t(FIXTURE_KIND_MESSAGE_IDS[entity.kind])}</dd></div>
        ) : entity.type === "space-unit" ? (
          <div><dt>{t("inspector.entityKind")}</dt><dd>{t(SPACE_UNIT_KIND_MESSAGE_IDS[entity.kind])}</dd></div>
        ) : entity.type === "poi" ? (
          <div><dt>{t("inspector.entityKind")}</dt><dd>{t(POINT_OF_INTEREST_KIND_MESSAGE_IDS[entity.kind])}</dd></div>
        ) : null}
      </dl>
      {localError === null ? null : (
        <StatusNotice
          id={localErrorId}
          tone="error"
          data-issue-code={localError.issue.code}
        >{t(localizedErrorDescriptor({ code: localError.issue.code }).id)}</StatusNotice>
      )}
      <Field
        label={t("inspector.entityName")}
        value={name}
        disabled={propertiesDisabled}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.x")}
        value={x}
        disabled={propertiesDisabled}
        {...fieldIssueProps("x")}
        onChange={(event) => setX(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.y")}
        value={y}
        disabled={propertiesDisabled}
        {...fieldIssueProps("y")}
        onChange={(event) => setY(event.currentTarget.value)}
      />
      <Field
        label={t("inspector.rotation")}
        value={rotation}
        disabled={propertiesDisabled}
        {...fieldIssueProps("rotation")}
        onChange={(event) => setRotation(event.currentTarget.value)}
      />
      <label className="studio-plan-inspector__select">
        {t("inspector.entityLayer")}
        <select
          value={layerId}
          aria-label={t("inspector.entityLayerSelect")}
          disabled={propertiesDisabled}
          onChange={(event) => setLayerId(event.currentTarget.value)}
        >
          {floor.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>{displayName({ kind: "layer", id: layer.id, authoredName: layer.name })}</option>
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
        {t("inspector.entityLocked")}
      </label>
      <Field
        label={t("inspector.entityTags")}
        value={tags}
        disabled={propertiesDisabled}
        onChange={(event) => setTags(event.currentTarget.value)}
      />
      {entity.type === "fixture" ? (
        <>
          <Field
            label={t("inspector.width")}
            value={width}
            disabled={propertiesDisabled}
            {...fieldIssueProps("width")}
            onChange={(event) => setWidth(event.currentTarget.value)}
          />
          <Field
            label={t("inspector.depth")}
            value={depth}
            disabled={propertiesDisabled}
            {...fieldIssueProps("depth")}
            onChange={(event) => setDepth(event.currentTarget.value)}
          />
          <Field
            label={t("inspector.verticalHeight")}
            value={verticalHeight}
            disabled={propertiesDisabled}
            {...fieldIssueProps("verticalHeight")}
            onChange={(event) => setVerticalHeight(event.currentTarget.value)}
          />
        </>
      ) : null}
      {entity.type === "wall" ? (
        <Field
          label={t("inspector.wallThickness")}
          value={thickness}
          disabled={propertiesDisabled}
          {...fieldIssueProps("thickness")}
          onChange={(event) => setThickness(event.currentTarget.value)}
        />
      ) : null}
      {entity.type === "poi" ? (
        <Field
          label={t("inspector.poiRadius")}
          value={radius}
          disabled={propertiesDisabled}
          {...fieldIssueProps("radius")}
          onChange={(event) => setRadius(event.currentTarget.value)}
        />
      ) : null}
      {entity.type === "dimension" ? (
        <Field
          label={t("inspector.dimensionOffset")}
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
        {t("inspector.applyProperties")}
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
  const { t } = useI18n();
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
      <h2>{t("inspector.multi")}</h2>
      <p>{t("inspector.multiSelected", { count: entityIds.length })}</p>
      {!editable ? (
        <StatusNotice tone="info">{t("inspector.multiUnavailable")}</StatusNotice>
      ) : null}
      <div className="studio-plan-inspector__batch-actions">
        <Button
          variant="secondary"
          disabled={!editable}
          onClick={() => controller.copy()}
        >
          {t("inspector.copy")}
        </Button>
        <Button
          variant="secondary"
          disabled={!editable}
          onClick={() => void controller.paste()}
        >
          {t("inspector.paste")}
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
          {t("inspector.linearArray")}
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
          {t("inspector.rectangularArray")}
        </Button>
        <Button
          variant="secondary"
          disabled={!editable || entities.length < 2}
          onClick={() => void apply(alignEntities(entities, "left"))}
        >
          {t("inspector.alignLeft")}
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
          {t("inspector.distributeHorizontal")}
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
  readonly onApplyMaterialPatches: (
    target: MaterialTarget,
    patches: readonly AnySnapshotRecordsPatch[],
  ) => Promise<void>;
  readonly onImportMaterialTexture: (
    material: MaterialDefinition,
    target: MaterialTarget,
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
  onApplyMaterialPatches,
  onImportMaterialTexture,
  resolveAsset,
  onError,
}: EntityInspectorWithContentProps) {
  const { t } = useI18n();
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
  const materialTarget: MaterialTarget | null = entity.type === "space-unit"
    || entity.type === "zone"
    || entity.type === "wall"
    || entity.type === "fixture"
    ? entity
    : null;
  const materialLayer = materialTarget === null
    ? undefined
    : floor.layers.find(({ id }) => id === materialTarget.layerId);
  const materialInspector = materialTarget === null ? null : (
    <MaterialInspector
      snapshot={snapshot}
      target={materialTarget}
      disabled={
        materialTarget.locked
        || materialLayer === undefined
        || !materialLayer.visible
        || materialLayer.locked
      }
      assetIssues={assetIssues}
      assetOperationBusy={assetOperationBusy}
      makeId={makeId}
      onApplyPatches={(patches) => (
        onApplyMaterialPatches(materialTarget, patches)
      )}
      onImportTexture={onImportMaterialTexture}
      onError={onError}
    />
  );
  const target = entity.type === "fixture"
    || (entity.type === "poi" && entity.kind === "product-hotspot")
    ? entity
    : null;
  if (target === null) {
    return materialInspector === null ? entityInspector : (
      <div className="studio-inspector-stack">
        {entityInspector}
        {materialInspector}
      </div>
    );
  }

  const storedContent = snapshot.project.productContents.find(
    (candidate) => candidate.targetEntityId === target.id,
  );
  if (target.type === "poi" && storedContent === undefined) {
    return (
      <div className="studio-inspector-stack">
        {entityInspector}
        <StatusNotice tone="error">
          {t("inspector.productHotspotContentMissing")}
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
      {materialInspector}
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
  readonly onApplySceneEnvironmentPatch: (
    patch: SceneEnvironmentPatch,
  ) => Promise<void>;
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
  readonly onApplyMaterialPatches: (
    target: MaterialTarget,
    patches: readonly AnySnapshotRecordsPatch[],
  ) => Promise<void>;
  readonly onImportMaterialTexture: (
    material: MaterialDefinition,
    target: MaterialTarget,
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
  onApplySceneEnvironmentPatch,
  onApplyFloorPatch,
  onApplyPlanEdit,
  onApplyPlanReferencePatch,
  onApplyOpeningPatch,
  onApplyBuildingStructurePatch,
  onApplyMaterialPatches,
  onImportMaterialTexture,
  onApplyProductContentPatch,
  onImportProductMedia,
  onRepairProductMedia,
  resolveAsset,
  onError,
}: PlanInspectorProps) {
  const { t } = useI18n();
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
        onApplySceneEnvironmentPatch={onApplySceneEnvironmentPatch}
        onError={onError}
      />
    );
  }

  if (context.kind === "floor") {
    const order = snapshot.project.floors.findIndex(
      (floor) => floor.id === context.floorId,
    );
    const floor = snapshot.project.floors[order];
    return floor === undefined ? (
      <StatusNotice tone="error">{t("inspector.floorMissing")}</StatusNotice>
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
      <StatusNotice tone="error">{t("inspector.layerMissing")}</StatusNotice>
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
        <StatusNotice tone="error">{t("inspector.referenceMissing")}</StatusNotice>
      );
    }
    return (
      <ReferenceInspector
        reference={reference}
        layer={layer}
        onApplyPlanReferencePatch={async (before, after) => {
          if (onApplyPlanReferencePatch === undefined) {
            onError(new Error(t("inspector.referenceMutationsUnavailable")));
            return;
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
      return <StatusNotice tone="error">{t("inspector.openingMissing")}</StatusNotice>;
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
      <StatusNotice tone="error">{t("inspector.entityMissing")}</StatusNotice>
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
        onApplyMaterialPatches={onApplyMaterialPatches}
        onImportMaterialTexture={onImportMaterialTexture}
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
