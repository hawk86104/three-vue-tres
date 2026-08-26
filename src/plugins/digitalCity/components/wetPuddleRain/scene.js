import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  createPuddleMaterial,
  createRainDrops,
  createSplashSystem,
  loadWetPuddleRainTextures,
  wetPuddleRainAssetPaths,
} from "./rain-puddle-system.js";

async function loadTrashMaterial(resolveAsset) {
  const loader = new THREE.TextureLoader();
  const load = async (name, srgb = false) => {
    const texture = await loader.loadAsync(resolveAsset(`trash/${name}`));
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };
  const maps = {
    map: await load("shmpulh_4K_Albedo.jpg", true),
    alphaMap: await load("shmpulh_4K_Opacity.jpg"),
    normalMap: await load("shmpulh_4K_Normal.jpg"),
    roughnessMap: await load("shmpulh_4K_Roughness.jpg"),
    aoMap: await load("shmpulh_4K_AO.jpg"),
  };
  const material = new THREE.MeshStandardMaterial({
    ...maps,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  material.userData.maps = maps;
  return material;
}

export default {
  assetBase: "/plugins/digitalCity/wetPuddleRain/",
  initialTime: 4.85,
  async setup({ renderer, scene, camera, resolveAsset }) {
    const hdr = await new RGBELoader().loadAsync(
      resolveAsset("cyberpunk.hdr"),
    );
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.environmentIntensity = 1.75;
    scene.background = new THREE.Color(0x00010b);
    const previousFilter = renderer.domElement.style.filter;
    renderer.domElement.style.filter = "contrast(1.2) saturate(1.1) brightness(1.1)";

    const rainProgress = { value: 0 };
    const maps = await loadWetPuddleRainTextures({
      paths: wetPuddleRainAssetPaths.road,
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    const puddleMaterial = createPuddleMaterial({ maps, rainProgress });

    const floorGroup = new THREE.Group();
    floorGroup.rotation.x = -Math.PI / 2;
    scene.add(floorGroup);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), puddleMaterial);
    floor.geometry.setAttribute("uv1", floor.geometry.attributes.uv);
    floorGroup.add(floor);

    const trashMaterial = await loadTrashMaterial(resolveAsset);
    const trash = new THREE.Mesh(new THREE.CircleGeometry(0.5, 96), trashMaterial);
    trash.rotation.z = THREE.MathUtils.degToRad(30);
    trash.position.z = 0.002;
    trash.renderOrder = 1;
    floorGroup.add(trash);

    floorGroup.updateMatrixWorld(true);

    const drops = createRainDrops({
      count: 1000,
      rainProgress,
    });
    scene.add(drops.mesh);

    const splashTexture = await new THREE.TextureLoader().loadAsync(
      wetPuddleRainAssetPaths.splashFlipbook,
    );
    splashTexture.colorSpace = THREE.SRGBColorSpace;
    const splashes = await createSplashSystem({
      targetGroup: floorGroup,
      texture: splashTexture,
      count: 1000,
      rainProgress,
    });
    scene.add(splashes.mesh);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.05, 0.0, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    let rainSpeed = 1;

    return {
      setParameters(value) {
        rainProgress.value = value.rainAmount;
        rainSpeed = value.rainSpeed;
        bloom.strength = value.bloomStrength;
        renderer.domElement.style.filter = `contrast(${value.contrast}) saturate(${value.saturation})`;
      },
      update({ delta }) {
        const frameDelta = delta * rainSpeed;
        puddleMaterial.userData.rainUniforms.uTime.value += frameDelta;
        drops.update({ camera, delta: frameDelta });
        splashes.update({ camera, delta: frameDelta });
      },
      resize({ width, height, dpr }) {
        composer.setPixelRatio(dpr);
        composer.setSize(width, height);
      },
      render() {
        composer.render();
      },
      dispose() {
        drops.dispose();
        splashes.dispose();
        composer.dispose();
        renderer.domElement.style.filter = previousFilter;
        floor.geometry.dispose();
        puddleMaterial.dispose();
        trash.geometry.dispose();
        trashMaterial.dispose();
        splashTexture.dispose();
        for (const texture of Object.values(maps)) texture.dispose();
        for (const texture of Object.values(trashMaterial.userData.maps)) {
          texture.dispose();
        }
        hdr.dispose();
      },
    };
  },
};
