import snapshot from "../../../../fixtures/contracts/showroom-demo.v3.json";
import manifest from "../../../../fixtures/assets/showroom-demo/manifest.json";
import planReferenceUrl from "../../../../fixtures/assets/showroom-demo/plan-reference.svg?url&no-inline";
import floorUrl from "../../../../fixtures/assets/showroom-demo/floor.png?url&no-inline";
import wallUrl from "../../../../fixtures/assets/showroom-demo/wall.jpg?url&no-inline";
import fixtureUrl from "../../../../fixtures/assets/showroom-demo/fixture.svg?url&no-inline";
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
