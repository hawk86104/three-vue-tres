import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import {
  makeDiamond,
  setDiamondResolution,
} from "./diamond-material.js";

export default {
  assetBase: "/plugins/basic/materials/raytracedDiamond/",
  async setup({ renderer, scene, camera, resolveAsset }) {
    scene.background = new THREE.Color(0x000000);

    // The studio HDRI is never drawn as the background: it feeds the gem's
    // refraction/reflection and the floor's image-based lighting only.
    const hdriTexture = await new EXRLoader().loadAsync(
      resolveAsset("colorful_studio.exr"),
    );
    hdriTexture.mapping = THREE.EquirectangularReflectionMapping;
    hdriTexture.generateMipmaps = true;
    hdriTexture.minFilter = THREE.LinearMipmapLinearFilter;
    scene.environment = hdriTexture;

    // Semi-reflective dark floor in two layers: a planar mirror underneath
    // reflects actual scene geometry (the gem), and the slightly transparent
    // glossy disc above keeps the HDRI-lit dark finish while dimming the
    // mirror to semi-reflective strength.
    const mirror = new Reflector(new THREE.CircleGeometry(70, 64), {
      clipBias: 0.003,
      textureWidth: 1024,
      textureHeight: 1024,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.02;
    scene.add(mirror);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(70, 64),
      new THREE.MeshStandardMaterial({
        color: 0x060606,
        roughness: 0.18,
        metalness: 0.35,
        envMapIntensity: 0.5,
        transparent: true,
        opacity: 0.78,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const gltf = await new GLTFLoader().loadAsync(resolveAsset("diamond.glb"));
    const diamondGeo =
      gltf.scene.children[0].children[0].children[0].children[0].children[0]
        .geometry;
    diamondGeo.scale(10, 10, 10);
    diamondGeo.translate(0, 5, 0);

    // The gem's material samples a cube map: convert the equirectangular
    // HDRI once into a mipmapped HDR cube target. The mipmapped filtering it
    // inherits from the HDRI keeps the material's mip-correct sampling live.
    const envCubeTarget = new THREE.WebGLCubeRenderTarget(512, {
      type: THREE.HalfFloatType,
    });
    envCubeTarget.fromEquirectangularTexture(renderer, hdriTexture);

    const diamond = makeDiamond(diamondGeo, {
      envMap: envCubeTarget.texture,
      camera,
      resolution: new THREE.Vector2(1, 1),
      aberrationStrength: 0.05,
    });
    scene.add(diamond);
    const uniforms = diamond.material.uniforms;

    return {
      setParameters(value) {
        uniforms.bounces.value = value.bounces;
        uniforms.ior.value = value.ior;
        uniforms.aberrationStrength.value = value.aberrationStrength;
        uniforms.chromaticAberration.value = value.chromaticAberration;
        uniforms.correctMips.value = value.correctMips;
      },
      resize({ bufferWidth, bufferHeight }) {
        setDiamondResolution(diamond.material, bufferWidth, bufferHeight);
      },
      dispose() {
        diamondGeo.dispose();
        diamond.material.dispose();
        mirror.dispose();
        mirror.geometry.dispose();
        floor.geometry.dispose();
        floor.material.dispose();
        hdriTexture.dispose();
        envCubeTarget.dispose();
      },
    };
  },
};
