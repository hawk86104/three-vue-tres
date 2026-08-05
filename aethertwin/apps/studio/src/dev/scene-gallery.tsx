import { StatusNotice } from "@aethertwin/design-system";
import type {
  ProjectStore,
  ProjectStoreState,
  RendererAssetIssue,
} from "@aethertwin/project-store";
import type { SceneRendererFactory } from "@aethertwin/render-scene-3d";
import { useState } from "react";
import { createPlanEditorStore } from "../features/plan-editor/editor-session";
import { SceneCanvas } from "../features/plan-editor/scene-canvas";
import {
  SCENE_GALLERY_MISSING_TEXTURE_ASSET_ID,
  SCENE_GALLERY_SNAPSHOT,
} from "./scene-gallery-fixture";

const activeFloorId = SCENE_GALLERY_SNAPSHOT.project.floors[0]!.id;
const galleryAssetIssues: ProjectStoreState["assetIssues"] = Object.freeze([{
  assetId: SCENE_GALLERY_MISSING_TEXTURE_ASSET_ID,
  code: "ASSET_MISSING",
}]);
const galleryStore: Pick<
  ProjectStore,
  "resolveAsset" | "reportRendererAssetIssue" | "clearRendererAssetIssue"
> = {
  async resolveAsset(assetId) {
    throw Object.assign(
      new Error(`Scene gallery asset bytes are intentionally unavailable: ${assetId}`),
      { code: "ASSET_MISSING" },
    );
  },
  reportRendererAssetIssue(_issue: RendererAssetIssue, _expectedEpoch: number) {},
  clearRendererAssetIssue(_assetId: string, _expectedEpoch: number) {},
};

export interface SceneGalleryProps {
  readonly rendererFactory?: SceneRendererFactory;
}

export function SceneGallery({ rendererFactory }: SceneGalleryProps) {
  const [sessionStore] = useState(() => createPlanEditorStore({
    activeFloorId,
    sessionId: "dev-scene-gallery",
  }));
  const [rendererError, setRendererError] = useState<string | null>(null);

  return (
    <main className="studio-scene-gallery">
      <header>
        <p className="studio-project-center__eyebrow">DEVELOPMENT REFERENCE</p>
        <h1>AetherTwin 3D Scene Gallery</h1>
        <p>
          Deterministic local schema-v3 showroom input for renderer development.
        </p>
      </header>
      {rendererError === null ? null : (
        <StatusNotice tone="error">{rendererError}</StatusNotice>
      )}
      <section
        className="studio-scene-gallery__viewport"
        aria-label="Deterministic 3D scene gallery"
      >
        <SceneCanvas
          store={galleryStore}
          assetSourceEpoch={0}
          snapshot={SCENE_GALLERY_SNAPSHOT}
          assetIssues={galleryAssetIssues}
          activeFloorId={activeFloorId}
          sessionStore={sessionStore}
          {...(rendererFactory === undefined ? {} : { rendererFactory })}
          onError={(error) => {
            setRendererError(error instanceof Error ? error.message : String(error));
          }}
        />
      </section>
    </main>
  );
}
