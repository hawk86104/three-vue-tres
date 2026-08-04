import type { AssetMediaType, ProjectSnapshot } from "@aethertwin/core-model";
import type {
  SceneAssetIssue,
  SceneMaterialProjection,
  SceneMaterialRole,
  SceneRecord,
} from "./types";

const SELECTION_COLOR = "#58b8c4";
const SELECTION_OVERLAY = { color: SELECTION_COLOR } as const;
const TEXTURE_MEDIA_TYPES = new Set<AssetMediaType>([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

const DEFAULT_MATERIALS: Readonly<Record<
  Extract<SceneMaterialRole, "space-floor" | "wall" | "fixture">,
  Omit<SceneMaterialProjection, "role">
>> = {
  "space-floor": {
    definitionId: null,
    baseColor: "#445760",
    roughness: 0.9,
    metalness: 0,
    opacity: 1,
    textureAssetId: null,
    textureColorSpace: null,
  },
  wall: {
    definitionId: null,
    baseColor: "#c8d2d8",
    roughness: 0.82,
    metalness: 0,
    opacity: 1,
    textureAssetId: null,
    textureColorSpace: null,
  },
  fixture: {
    definitionId: null,
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 1,
    textureAssetId: null,
    textureColorSpace: null,
  },
};

export interface MaterialProjectionResult {
  readonly records: readonly SceneRecord[];
  readonly requiredTextureAssetIds: readonly string[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assignedMaterial(
  snapshot: ProjectSnapshot,
  role: Extract<SceneMaterialRole, "space-floor" | "wall" | "fixture">,
  targetId: string,
  failedAssetIds: ReadonlySet<string>,
): SceneMaterialProjection {
  const assignment = snapshot.project.materialAssignments
    .filter((candidate) => candidate.targetKind === role && candidate.targetId === targetId)
    .sort((left, right) => compareText(left.id, right.id))[0];
  const definition = assignment === undefined
    ? undefined
    : snapshot.project.materials.find(({ id }) => id === assignment.materialId);
  if (definition === undefined) return { role, ...DEFAULT_MATERIALS[role] };

  const asset = definition.assetId === null
    ? undefined
    : snapshot.assets.find(({ id }) => id === definition.assetId);
  const textureAssetId = asset !== undefined
    && TEXTURE_MEDIA_TYPES.has(asset.mediaType)
    && !failedAssetIds.has(asset.id)
    ? asset.id
    : null;
  return {
    role,
    definitionId: definition.id,
    baseColor: definition.baseColor,
    roughness: definition.roughness,
    metalness: definition.metalness,
    opacity: definition.opacity,
    textureAssetId,
    textureColorSpace: textureAssetId === null ? null : "srgb",
  };
}

function resolvedMaterial(
  snapshot: ProjectSnapshot,
  record: SceneRecord,
  failedAssetIds: ReadonlySet<string>,
): SceneMaterialProjection {
  if (
    record.materialTargetId === null
    || (record.material.role !== "space-floor"
      && record.material.role !== "wall"
      && record.material.role !== "fixture")
  ) return { ...record.material, textureColorSpace: null };

  const resolved = assignedMaterial(
    snapshot,
    record.material.role,
    record.materialTargetId,
    failedAssetIds,
  );
  return record.kind === "opening"
    ? { ...resolved, opacity: resolved.opacity * 0.24 }
    : resolved;
}

export function projectMaterials(
  snapshot: ProjectSnapshot,
  records: readonly SceneRecord[],
  assetIssues: readonly SceneAssetIssue[],
): MaterialProjectionResult {
  const failedAssetIds = new Set(assetIssues.map(({ assetId }) => assetId));
  const requiredTextureAssetIds = new Set<string>();
  const projected = records.map((record) => {
    const material = resolvedMaterial(snapshot, record, failedAssetIds);
    if (material.textureAssetId !== null) requiredTextureAssetIds.add(material.textureAssetId);
    return {
      ...record,
      material,
      selectionOverlay: record.selected ? SELECTION_OVERLAY : null,
    };
  });
  return {
    records: projected,
    requiredTextureAssetIds: [...requiredTextureAssetIds].sort(compareText),
  };
}
