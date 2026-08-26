import { createStudioStage } from "./studio-stage.js";
import { createPorcelainBrassSubmarine } from
  "./submarine-model.js";

const GROUND_Y = -1.34;

export function createPorcelainBrassSubmarineScene({
  renderer,
  scene,
  camera,
  controls,
}) {
  const stage = createStudioStage({
    renderer,
    scene,
    groundY: GROUND_Y,
    shadowExtent: 3.2,
    shadowFar: 16,
    blushSize: [6.4, 3.4],
    blushCenter: [0, -0.1],
  });

  const submarine = createPorcelainBrassSubmarine();
  scene.add(submarine.object);

  const meshVisibility = new Map();
  submarine.object.traverse((object) => {
    if (object.isMesh) meshVisibility.set(object, object.visible);
  });
  let propellerSpeed = 1.1;
  let buoyancy = 1;

  return {
    setParameters(value) {
      propellerSpeed = value.propellerSpeed;
      buoyancy = value.buoyancy;
      submarine.materials.glass.roughness = value.glassRoughness;
      submarine.materials.glass.transmission = value.glassTransmission;
      for (const [mesh, visible] of meshVisibility) {
        mesh.visible = visible && !(
            !value.showGlass &&
            (mesh.material === submarine.materials.glass ||
              mesh.material === submarine.materials.lampGlass)
          );
      }
    },
    update({ delta, elapsed }) {
      submarine.update({ delta, elapsed, propellerSpeed, buoyancy });
      if (controls) {
        controls.target.y = Math.max(GROUND_Y + 0.25, controls.target.y);
        camera.position.y = Math.max(GROUND_Y + 0.12, camera.position.y);
      }
    },
    dispose() {
      submarine.dispose();
      stage.dispose();
    },
  };
}
