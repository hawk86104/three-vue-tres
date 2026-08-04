import {
  Group,
  Mesh,
  SRGBColorSpace,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";
import {
  createThreeSceneResourceFactory,
} from "./three-resources";
import type {
  SceneGeometry,
  SceneMaterialProjection,
  SceneRecord,
} from "./types";

function geometry(): SceneGeometry {
  return {
    topology: "triangles",
    positions: [0, 0, 0, 1, 0, 0, 0, 0, -1],
    indices: [0, 1, 2],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 0, 1],
  };
}

function material(): SceneMaterialProjection {
  return {
    role: "fixture",
    definitionId: "material-a",
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 0.75,
    textureAssetId: "texture-a",
    textureColorSpace: "srgb",
  };
}

function record(selected: boolean): SceneRecord {
  return {
    key: "fixture-part:fixture-a:body",
    kind: "fixture-part",
    sourceIds: ["fixture-a"],
    selectionId: "fixture-a",
    selected,
    bounds: {
      min: { x: 0, y: 0, z: -1 },
      max: { x: 1, y: 1, z: 0 },
    },
    geometry: geometry(),
    material: material(),
    materialTargetId: "fixture-a",
    selectionOverlay: selected ? { color: "#58b8c4" } : null,
  };
}

describe("Three scene resources", () => {
  it("owns geometry/material/texture explicitly while bindings attach, update overlays, and detach", async () => {
    const root = new Group();
    const invalidations: string[] = [];
    const texture = new Texture();
    let textureDisposals = 0;
    texture.addEventListener("dispose", () => {
      textureDisposals += 1;
    });
    const factory = createThreeSceneResourceFactory({
      root,
      invalidate: () => invalidations.push("invalidate"),
      textureLoader: {
        async loadAsync() {
          return texture;
        },
      },
    });

    const textureResource = await factory.decodeTexture({
      assetId: "texture-a",
      url: "asset://localhost/texture-a",
      mediaType: "image/png",
    });
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    const geometryResource = factory.createGeometry(record(true));
    const materialResource = factory.createMaterial(material(), textureResource);
    const binding = factory.createBinding(
      record(true),
      geometryResource,
      materialResource,
    );

    binding.attach();
    expect(root.children).toHaveLength(1);
    const object = root.children[0]!;
    expect(object).toBeInstanceOf(Mesh);
    expect(object.userData.selectionId).toBe("fixture-a");
    expect(object.children).toHaveLength(1);

    binding.update(record(false), geometryResource, materialResource);
    expect(object.children).toHaveLength(0);
    binding.detach();
    binding.dispose?.();
    binding.dispose?.();
    expect(root.children).toEqual([]);

    let geometryDisposals = 0;
    let materialDisposals = 0;
    const mesh = object as Mesh;
    mesh.geometry.addEventListener("dispose", () => {
      geometryDisposals += 1;
    });
    const meshMaterial = Array.isArray(mesh.material)
      ? mesh.material[0]!
      : mesh.material;
    meshMaterial.addEventListener("dispose", () => {
      materialDisposals += 1;
    });

    geometryResource.dispose();
    materialResource.dispose();
    textureResource.dispose();
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
    expect(textureDisposals).toBe(1);
    expect(invalidations.length).toBeGreaterThanOrEqual(3);
  });
});
