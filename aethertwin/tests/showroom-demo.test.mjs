import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const fixturePath = "fixtures/contracts/showroom-demo.v3.json";
const assetRoot = "fixtures/assets/showroom-demo";
const manifestPath = `${assetRoot}/manifest.json`;
const id = (suffix) => `e2500000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function loadFixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function assertSortedById(records, label) {
  assert.deepEqual(
    records.map(({ id: recordId }) => recordId),
    records.map(({ id: recordId }) => recordId).toSorted(),
    `${label} must be sorted by id`,
  );
}

function allRecords(snapshot) {
  const { project } = snapshot;
  return [
    { id: project.id },
    ...project.floors,
    ...project.floors.flatMap(({ layers }) => layers),
    ...project.entities,
    ...project.vendors,
    ...project.productContents,
    ...project.mediaAssets,
    ...project.routeNetworks,
    ...project.routeNetworks.flatMap(({ nodes }) => nodes),
    ...project.routeNetworks.flatMap(({ edges }) => edges),
    ...project.themes,
    ...project.cameraShots,
    ...project.storySequences,
    ...project.planReferences,
    ...project.openings,
    ...project.guidedRoutes,
    ...project.materials,
    ...project.materialAssignments,
    ...snapshot.assets,
  ];
}

function bounds(entity) {
  const points = entity.footprint ?? entity.polygon;
  const xs = points.map(({ x }) => x + entity.transform.translation.x);
  const ys = points.map(({ y }) => y + entity.transform.translation.y);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

function overlapsInterior(left, right) {
  return left.minX < right.maxX && left.maxX > right.minX
    && left.minY < right.maxY && left.maxY > right.minY;
}

test("Showroom Demo has the exact approved semantic inventory", () => {
  const snapshot = loadFixture();
  const { project } = snapshot;
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.sequence, 11);
  assert.equal(snapshot.checkpointSequence, 11);
  assert.equal(project.profile, "showroom");
  assert.equal(project.floors.length, 1);
  assert.equal(project.floors[0].layers.length, 1);

  const rooms = project.entities.filter(({ type }) => type === "space-unit");
  const zones = project.entities.filter(({ type }) => type === "zone");
  const walls = project.entities.filter(({ type }) => type === "wall");
  const fixtures = project.entities.filter(({ type }) => type === "fixture");
  const hotspots = project.entities.filter(
    ({ type, kind }) => type === "poi" && kind === "product-hotspot",
  );
  assert.deepEqual(rooms.map(({ id: roomId }) => roomId), [101, 102, 103, 104].map(id));
  assert.deepEqual(zones.map(({ id: zoneId }) => zoneId), [id(110)]);
  assert.equal(walls.length, 8);
  assert.equal(project.openings.filter(({ kind }) => kind === "door").length, 4);
  assert.equal(project.openings.filter(({ kind }) => kind === "window").length, 4);
  assert.equal(fixtures.length, 22);
  assert.deepEqual(
    fixtures.map(({ id: fixtureId }) => fixtureId),
    Array.from({ length: 22 }, (_, index) => id(401 + index)),
  );
  assert.equal(hotspots.length, 10);

  const expectedSizes = new Map([
    ["display-case", [1200, 600, 1200]],
    ["display-table", [1500, 750, 900]],
    ["shelf", [1000, 400, 2000]],
    ["checkout", [1600, 700, 1000]],
    ["screen", [1200, 100, 1800]],
    ["partition", [1200, 100, 2400]],
    ["signage", [600, 100, 1800]],
  ]);
  for (const [kind, [width, depth, height]] of expectedSizes) {
    const matches = fixtures.filter((fixture) => fixture.kind === kind);
    assert.equal(matches.length, 3, `${kind} count`);
    for (const fixture of matches) {
      assert.deepEqual(
        [fixture.size.width, fixture.size.height, fixture.spatial3D.height],
        [width, depth, height],
        `${fixture.id} durable dimensions`,
      );
    }
  }
  assert.equal(fixtures.filter(({ kind }) => kind === "generic").length, 1);

  for (let left = 0; left < rooms.length; left += 1) {
    for (let right = left + 1; right < rooms.length; right += 1) {
      assert.equal(
        overlapsInterior(bounds(rooms[left]), bounds(rooms[right])),
        false,
        `${rooms[left].id} overlaps ${rooms[right].id}`,
      );
    }
  }
  const wallIds = new Set(walls.map(({ id: wallId }) => wallId));
  for (const opening of project.openings) assert.ok(wallIds.has(opening.wallId));
});

test("Showroom Demo links calibrated plans, product content, textures, and materials", () => {
  const snapshot = loadFixture();
  const { project } = snapshot;
  assert.equal(project.planReferences.length, 1);
  const reference = project.planReferences[0];
  assert.equal(reference.assetId, id(501));
  assert.deepEqual(reference.intrinsicSize, { width: 1200, height: 800 });
  assert.deepEqual(reference.calibration, {
    sourcePointA: { x: 100, y: 100 },
    sourcePointB: { x: 1100, y: 100 },
    measuredDistanceMm: 10000,
  });
  assert.deepEqual(reference.transform.scale, { x: 10, y: 10 });

  assert.equal(project.productContents.length, 10);
  assert.equal(project.mediaAssets.length, 10);
  const mediaById = new Map(project.mediaAssets.map((media) => [media.id, media]));
  const hotspotIds = new Set(project.entities
    .filter(({ type, kind }) => type === "poi" && kind === "product-hotspot")
    .map(({ id: hotspotId }) => hotspotId));
  for (const [index, content] of project.productContents.entries()) {
    assert.ok(hotspotIds.has(content.targetEntityId));
    assert.deepEqual(content.mediaAssetIds, [id(721 + index)]);
    assert.equal(mediaById.get(content.mediaAssetIds[0]).kind, "image");
  }
  assert.deepEqual(
    project.mediaAssets.map(({ assetId }) => assetId),
    [502, 503, 504, 502, 503, 504, 502, 503, 504, 502].map(id),
  );

  assert.equal(project.materials.length, 3);
  assert.deepEqual(project.materials.map(({ assetId }) => assetId), [502, 503, 504].map(id));
  const assignments = project.materialAssignments;
  assert.equal(assignments.length, 24);
  assert.deepEqual(
    assignments.map(({ id: assignmentId }) => assignmentId),
    Array.from({ length: 24 }, (_, index) => id(604 + index)),
  );
  assert.deepEqual(
    assignments.filter(({ targetKind }) => targetKind === "space-floor")
      .map(({ targetId }) => targetId),
    [id(101)],
  );
  assert.deepEqual(
    assignments.filter(({ targetKind }) => targetKind === "wall")
      .map(({ targetId }) => targetId),
    [id(201)],
  );
  assert.deepEqual(
    assignments.filter(({ targetKind }) => targetKind === "fixture")
      .map(({ targetId }) => targetId),
    Array.from({ length: 22 }, (_, index) => id(401 + index)),
  );
});

test("Showroom Demo keeps one connected ordered route and stable record ordering", () => {
  const snapshot = loadFixture();
  const { project } = snapshot;
  assert.equal(project.routeNetworks.length, 1);
  assert.equal(project.guidedRoutes.length, 1);
  const network = project.routeNetworks[0];
  assert.deepEqual(network.nodes.map(({ id: nodeId }) => nodeId), [901, 902, 903, 904, 905].map(id));
  assert.equal(network.edges.length, 4);
  for (const [index, edge] of network.edges.entries()) {
    assert.equal(edge.from, id(901 + index));
    assert.equal(edge.to, id(902 + index));
    assert.ok(edge.distance > 0);
    assert.equal(edge.enabled, true);
  }
  assert.deepEqual(project.guidedRoutes[0].stopNodeIds, [901, 902, 903, 904, 905].map(id));
  assert.deepEqual(project.sceneEnvironment, {
    backgroundColor: "#18242d",
    ambient: { color: "#c9dde6", intensity: 0.8 },
    key: { color: "#ffe4c7", intensity: 1.6, direction: [5, 9, 4] },
    shadowsEnabled: true,
    shadowSoftness: 0.7,
  });

  for (const [label, records] of Object.entries({
    floors: project.floors,
    entities: project.entities,
    productContents: project.productContents,
    mediaAssets: project.mediaAssets,
    routeNetworks: project.routeNetworks,
    planReferences: project.planReferences,
    openings: project.openings,
    guidedRoutes: project.guidedRoutes,
    materials: project.materials,
    materialAssignments: project.materialAssignments,
    assets: snapshot.assets,
  })) assertSortedById(records, label);
  assertSortedById(project.floors[0].layers, "layers");
  assertSortedById(network.nodes, "route nodes");
  assertSortedById(network.edges, "route edges");

  const records = allRecords(snapshot);
  const recordIds = records.map(({ id: recordId }) => recordId);
  assert.equal(new Set(recordIds).size, recordIds.length, "all record IDs must be unique");
  for (const recordId of recordIds) {
    assert.match(recordId, uuidV4);
    assert.ok(recordId.startsWith("e2500000-"), recordId);
  }
});

test("Showroom Demo asset manifest is exact, local, complete, and sanitized", () => {
  const snapshot = loadFixture();
  const manifest = loadManifest();
  assert.deepEqual(manifest.map(({ file }) => file), [
    "plan-reference.svg", "floor.png", "wall.jpg", "fixture.svg",
  ]);
  assert.deepEqual(manifest.map(({ mediaType }) => mediaType), [
    "image/svg+xml", "image/png", "image/jpeg", "image/svg+xml",
  ]);
  assert.deepEqual(manifest.map(({ purpose }) => purpose), [
    "calibrated plan reference",
    "space-floor texture and shared content image",
    "wall texture and shared content image",
    "fixture texture and shared content image",
  ]);

  const extension = new Map([
    ["image/png", "png"], ["image/jpeg", "jpg"], ["image/svg+xml", "svg"],
  ]);
  for (const [index, entry] of manifest.entries()) {
    const bytes = readFileSync(`${assetRoot}/${entry.file}`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(entry.sha256, digest);
    const asset = snapshot.assets[index];
    assert.equal(asset.id, id(501 + index));
    assert.equal(asset.sha256, digest);
    assert.equal(asset.mediaType, entry.mediaType);
    assert.equal(asset.size, bytes.length);
    assert.equal(
      asset.relativePath,
      `assets/sha256/${digest.slice(0, 2)}/${digest}.${extension.get(entry.mediaType)}`,
    );
  }

  const png = readFileSync(`${assetRoot}/floor.png`);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const jpeg = readFileSync(`${assetRoot}/wall.jpg`);
  const completeJpeg = (bytes) => bytes.length > 4
    && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  assert.equal(completeJpeg(jpeg), true);
  assert.equal(completeJpeg(jpeg.subarray(0, -1)), false);

  for (const file of ["plan-reference.svg", "fixture.svg"]) {
    const svg = readFileSync(`${assetRoot}/${file}`, "utf8");
    assert.match(svg, /^<svg\b/u);
    assert.doesNotMatch(svg, /<script\b|\bon[a-z]+\s*=|(?:href|src)\s*=/iu);
    assert.doesNotMatch(
      svg.replace("http://www.w3.org/2000/svg", ""),
      /(?:https?:|wss?:|\/\/)/iu,
    );
  }
});
