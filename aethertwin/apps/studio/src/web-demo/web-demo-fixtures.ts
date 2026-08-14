import snapshot from "../../../../fixtures/contracts/showroom-demo.v3.json";
import manifest from "../../../../fixtures/assets/showroom-demo/manifest.json";
import planReferenceUrl from "../../../../fixtures/assets/showroom-demo/plan-reference.svg?url";
import floorUrl from "../../../../fixtures/assets/showroom-demo/floor.png?url";
import wallUrl from "../../../../fixtures/assets/showroom-demo/wall.jpg?url";
import fixtureUrl from "../../../../fixtures/assets/showroom-demo/fixture.svg?url";
import type { WebDemoFixtureSources } from "./load-web-demo";

export const canonicalWebDemoSources: WebDemoFixtureSources = Object.freeze({
  snapshot,
  manifest,
  assetUrls: Object.freeze({
    "plan-reference.svg": planReferenceUrl,
    "floor.png": floorUrl,
    "wall.jpg": wallUrl,
    "fixture.svg": fixtureUrl,
  }),
});
