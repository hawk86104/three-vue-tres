import { createPorcelainBrassSubmarineScene } from "./submarine-scene.js";

export default {
  backend: "webgpu",
  assetBase: "/plugins/visualArts/porcelainBrassSubmarine/",
  setup(context) {
    return createPorcelainBrassSubmarineScene(context);
  },
};
