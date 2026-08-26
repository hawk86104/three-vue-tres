import { TeapotGeometry } from "three/addons/geometries/TeapotGeometry.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { color, Fn, mix, pass, uv } from "three/tsl";
import {
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  PostProcessing,
} from "three/webgpu";
import {
  VolumetricFluidFire,
  VOLUMETRIC_FLUID_FIRE_PRESET,
} from "./volumetric-fluid-fire.js";

const VOLUME_LAYER = 10;
const THUMBNAIL_WARMUP_FRAMES = 120;

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  backend: "webgpu",
  assetBase: "/plugins/digitalCity/volumetricFluidFire/",
  async setup({ THREE, renderer, scene, camera, controls, resolveAsset }) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.transmitted = true;
    scene.background = new THREE.Color(0x000000);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("./draco/");
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    const gltf = await gltfLoader.loadAsync(
      resolveAsset("demo-scene.glb"),
    );
    scene.add(gltf.scene);

    const volumeBounds = gltf.scene.getObjectByName("sim");
    const fireEmitter = gltf.scene.getObjectByName("fire");
    const backdrop = gltf.scene.getObjectByName("backdrop");
    const teapotAnchor = gltf.scene.getObjectByName("teapot");
    const authoredCamera = gltf.cameras[0];
    if (!volumeBounds || !fireEmitter || !backdrop || !teapotAnchor || !authoredCamera) {
      throw new Error("The volumetric fire stage is missing required named objects.");
    }

    camera.position.copy(authoredCamera.position);
    camera.rotation.copy(authoredCamera.rotation);
    camera.fov = authoredCamera.fov + 20;
    camera.translateZ(-11);
    camera.updateProjectionMatrix();
    controls.target.y = 2;
    controls.update();

    const spotLight = new THREE.SpotLight(0xffffff, 11);
    spotLight.position.set(0, 12, 0);
    spotLight.angle = Math.PI;
    spotLight.penumbra = 1;
    spotLight.decay = 1;
    spotLight.distance = 0;
    spotLight.castShadow = true;
    spotLight.shadow.intensity = 0.98;
    spotLight.shadow.mapSize.set(1024, 1024);
    spotLight.shadow.camera.near = 1;
    spotLight.shadow.camera.far = 66;
    spotLight.shadow.focus = 1;
    spotLight.layers.enable(VOLUME_LAYER);
    spotLight.target.position.set(0, 0, 0);
    scene.add(spotLight, spotLight.target);

    backdrop.material = new MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      colorNode: Fn(() => {
        const uvNode = uv();
        const checker = uvNode.x
          .mul(20)
          .floor()
          .add(uvNode.y.mul(20).floor())
          .mod(2);
        return mix(color("#bdbdbd").mul(0.1), color("#8c8c8c").mul(0.1), checker);
      })(),
    });

    const collidersMaterial = new MeshPhysicalNodeMaterial({
      colorNode: color("black"),
      roughness: 1,
      metalness: 0,
    });
    const teapot = new THREE.Mesh(
      new TeapotGeometry(0.5, 5),
      collidersMaterial,
    );
    teapotAnchor.add(teapot);

    const worldHalfExtents = volumeBounds.scale.clone();
    const fullSize = worldHalfExtents.clone().multiplyScalar(2);
    const voxelSizeRender = Math.max(fullSize.x, fullSize.y, fullSize.z) / 100;
    const voxelSizePhysics = Math.max(fullSize.x, fullSize.y, fullSize.z) / 80;
    const fire = new VolumetricFluidFire(renderer, {
      renderLayer: VOLUME_LAYER,
      size: {
        boundingBox: fullSize,
        renderResolution: fullSize.clone().divideScalar(voxelSizeRender).round(),
        physicsResolution: fullSize.clone().divideScalar(voxelSizePhysics).round(),
      },
      steps: 22,
      burnableMeshes: [
        { geometriesInsideOf: fireEmitter, maxCount: 1, id: "primary" },
        { geometriesInsideOf: teapot, maxCount: 1, id: "teapot" },
      ],
      noise: { size: 64, frecuency: 30 },
      vertexEmissionWorldRadius: 0.01,
      blurStrength: 0,
      debug: {},
      collisions: { disabled: false },
    });
    fire.keyLightPosition = spotLight.position;
    fire.position.copy(volumeBounds.position);
    fire.rotation.copy(volumeBounds.rotation);
    scene.add(fire);

    fireEmitter.material = new MeshStandardNodeMaterial({
      color: "#222222",
      wireframe: true,
    });
    fireEmitter.add(
      fire.getFireFor("primary", { emitMultiplier: 13, tintFactor: 0 }),
    );
    teapot.add(
      fire.getFireFor("teapot", { emitMultiplier: 22, tintFactor: 1 }),
    );

    const hemisphere = new THREE.HemisphereLight(0, "#ffce8e", 5);
    scene.add(hemisphere);

    const random = createSeededRandom(0x51f15e);
    const colliders = [];
    gltf.scene.traverse((object) => {
      if (!object.userData.collider) return;
      const collider = object.children[0];
      if (!collider) return;
      colliders.push(object);
      fire.makeObjectCollidable(collider, object.userData.collider);
      collider.material = collidersMaterial;
      object.userData.angularSpeed = 1 + random();
    });

    await fire.initialize();

    const postProcessing = new PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    const sceneDepth = scenePass.getTextureNode("depth");
    const fireScene = fire.getRenderPass(scene, camera, sceneDepth);
    const scenePassColor = scenePass.add(fireScene);
    const compositedOutput = scenePassColor.add(
      bloom(fireScene, 0.01, 0.1, 13),
    );
    postProcessing.outputNode = compositedOutput;
    fire.applySettingsSnapshot(VOLUMETRIC_FLUID_FIRE_PRESET);
    let simulationSpeed = 1;

    const advanceScene = (delta, elapsed) => {
      teapot.rotateZ(delta);
      teapot.rotateY(delta * 0.2);
      teapot.position.y = 1 + Math.cos(elapsed) * 0.3;
      for (const collider of colliders) {
        collider.rotateY(delta * collider.userData.angularSpeed);
      }
      fire.update?.(delta);
    };

    if (new URLSearchParams(globalThis.location.search).get("galleryThumbnail") === "1") {
      let warmElapsed = 0;
      for (let frame = 0; frame < THUMBNAIL_WARMUP_FRAMES; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        warmElapsed += 1 / 60;
        advanceScene(1 / 60, warmElapsed);
      }
    }

    return {
      setParameters(value) {
        simulationSpeed = value.simulationSpeed;
        fire.vorticityConfinementStrength = value.vorticity;
        fire.densityDissipation = value.densityDissipation;
        fire.pressureIterations = value.pressureIterations;
        fire.config.steps = value.raymarchSteps;
        fire.volumetricMaterial.steps = value.raymarchSteps;
      },
      update({ delta, elapsed }) {
        controls.target.set(
          THREE.MathUtils.clamp(controls.target.x, -3.81, 3.81),
          THREE.MathUtils.clamp(controls.target.y, 0.25, 5.75),
          THREE.MathUtils.clamp(controls.target.z, -1.88, 1.88),
        );
        controls.update();
        if (delta <= 0) return;
        advanceScene(delta * simulationSpeed, elapsed * simulationSpeed);
      },
      render() {
        postProcessing.render();
      },
      dispose() {
        postProcessing.dispose();
        dracoLoader.dispose();
        teapot.geometry.dispose();
        collidersMaterial.dispose();
        backdrop.material.dispose();
        fireEmitter.material.dispose();
      },
    };
  },
};
