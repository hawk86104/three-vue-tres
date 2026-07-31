import type {
  Floor,
  ProjectSnapshot,
  SpaceUnit,
  SpatialEntity,
} from "@aethertwin/core-model";
import {
  representedRoomCandidateKeys,
  type RoomCandidate,
} from "./rooms";
import {
  planFailure,
  planSuccess,
  type PlanResult,
} from "./result";

export type PlanEditReason =
  | "create"
  | "delete"
  | "transform"
  | "properties"
  | "duplicate"
  | "array"
  | "align"
  | "distribute";

export interface EntityChange {
  readonly id: string;
  readonly before: SpatialEntity | null;
  readonly after: SpatialEntity | null;
  readonly index?: number;
}

export interface PlanEditIntent { readonly reason: PlanEditReason; readonly changes: readonly EntityChange[] }

export interface FloorChange { readonly floorId: string; readonly before: Floor; readonly after: Floor }

export interface RoomCreationInput {
  readonly snapshot: ProjectSnapshot;
  readonly floorId: string;
  readonly candidates: readonly RoomCandidate[];
  readonly makeId: () => string;
}

export interface RoomReplacementInput {
  readonly snapshot: ProjectSnapshot;
  readonly roomId: string;
  readonly candidate: RoomCandidate;
}

const IDENTITY_TRANSFORM = Object.freeze({
  translation: Object.freeze({ x: 0, y: 0 }),
  rotation: 0,
  scale: Object.freeze({ x: 1, y: 1 }),
});

function nextRoomName(
  existingNames: Set<string>,
  state: { value: number },
): string {
  while (existingNames.has(`Room ${state.value}`)) state.value += 1;
  const name = `Room ${state.value}`;
  existingNames.add(name);
  state.value += 1;
  return name;
}

export function roomCreationIntent(
  input: RoomCreationInput,
): PlanResult<PlanEditIntent> {
  const floor = input.snapshot.project.floors.find(
    (candidate) => candidate.id === input.floorId,
  );
  const creationLayer = floor?.layers.find(
    (candidate) => candidate.visible && !candidate.locked,
  );
  if (creationLayer === undefined) {
    return planFailure(
      "NO_EDITABLE_CREATION_LAYER",
      "Room creation requires a visible unlocked layer on the active floor.",
    );
  }

  const represented = new Set(representedRoomCandidateKeys({
    candidates: input.candidates,
    entities: input.snapshot.project.entities,
    floorId: input.floorId,
  }));
  const additions = input.candidates.filter(
    (candidate) => !represented.has(candidate.key),
  );
  if (additions.length === 0) {
    return planFailure(
      "NO_UNREPRESENTED_ROOM_CANDIDATES",
      "Every selected room candidate is already represented.",
    );
  }

  const existingIds = new Set(
    input.snapshot.project.entities.map((entity) => entity.id),
  );
  const existingNames = new Set(
    input.snapshot.project.entities.map((entity) => entity.name),
  );
  const nameState = { value: 1 };
  const changes: EntityChange[] = [];
  for (const candidate of additions) {
    const id = input.makeId();
    if (existingIds.has(id)) {
      return planFailure(
        "INVALID_ROOM_ID",
        "Room creation produced a duplicate entity ID.",
        id,
      );
    }
    existingIds.add(id);
    const entity: SpaceUnit = Object.freeze({
      type: "space-unit",
      kind: "room",
      id,
      name: nextRoomName(existingNames, nameState),
      tags: Object.freeze([]),
      floorId: input.floorId,
      layerId: creationLayer.id,
      transform: IDENTITY_TRANSFORM,
      locked: false,
      footprint: candidate.footprint,
    });
    changes.push(Object.freeze({
      id,
      before: null,
      after: entity,
    }));
  }
  return planSuccess(Object.freeze({
    reason: "create",
    changes: Object.freeze(changes),
  }));
}

export function roomReplacementIntent(
  input: RoomReplacementInput,
): PlanResult<PlanEditIntent> {
  const entity = input.snapshot.project.entities.find(
    (candidate) => candidate.id === input.roomId,
  );
  if (entity?.type !== "space-unit" || entity.kind !== "room") {
    return planFailure(
      "INVALID_ROOM_REPLACEMENT",
      "Room replacement requires one existing room.",
      input.roomId,
    );
  }
  const floor = input.snapshot.project.floors.find(
    (candidate) => candidate.id === entity.floorId,
  );
  const targetLayer = floor?.layers.find(
    (candidate) => candidate.id === entity.layerId,
  );
  if (
    entity.locked
    || targetLayer === undefined
    || !targetLayer.visible
    || targetLayer.locked
  ) {
    return planFailure(
      "INVALID_ROOM_REPLACEMENT",
      "Room replacement requires an unlocked room on a visible unlocked layer.",
      input.roomId,
    );
  }

  const after: SpaceUnit = Object.freeze({
    ...entity,
    footprint: input.candidate.footprint,
    transform: IDENTITY_TRANSFORM,
  });
  return planSuccess(Object.freeze({
    reason: "properties",
    changes: Object.freeze([Object.freeze({
      id: entity.id,
      before: entity,
      after,
    })]),
  }));
}
