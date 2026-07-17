import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createManifest,
  createInitialSnapshot,
  migrateSnapshot,
  parseManifest,
  parseSnapshot,
} from "./index";

const validManifest = {
  schemaVersion: 1,
  projectId: "00000000-0000-4000-8000-000000000001",
  name: "Demo",
  profile: "showroom",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  appVersion: "0.1.0",
  minCompatibleAppVersion: "0.1.0",
};

describe("core model", () => {
  it.each(["showroom", "market"] as const)("creates a %s project", (profile) => {
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ];
    const snapshot = createInitialSnapshot({
      name: "Demo",
      profile,
      uuid: () => ids.shift()!,
    });

    expect(snapshot.project.profile).toBe(profile);
    expect(snapshot.project.floors).toHaveLength(1);
    expect(snapshot.project.floors[0]?.name).toBe("一层");
    expect(snapshot.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(
      createManifest(snapshot, {
        now: () => "2026-07-17T00:00:00.000Z",
        appVersion: "0.1.0",
      }),
    ).toMatchObject({ projectId: snapshot.project.id, profile });
  });

  it("rejects a third profile", () => {
    expect(() => parseManifest({ ...validManifest, profile: "iot" })).toThrow(/profile/i);
  });

  it("rejects malformed UUIDs and timestamps", () => {
    expect(() => parseManifest({ ...validManifest, projectId: "not-a-uuid" })).toThrow(/projectId/i);
    expect(() => parseManifest({ ...validManifest, createdAt: "2026-07-17" })).toThrow(/createdAt/i);
  });

  it.each(["/media/x.png", "\\media\\x.png", "C:\\media\\x.png", "\\\\server\\share\\x.png", "media/../x.png"])(
    "rejects unsafe asset path %s",
    (relativePath) => {
      const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
      expect(() =>
        parseSnapshot({
          ...snapshot,
          assets: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              sha256: "a".repeat(64),
              relativePath,
              mediaType: "image/png",
              size: 1,
            },
          ],
        }),
      ).toThrow(/relativePath/i);
    },
  );

  it("rejects invalid asset digests and invalid snapshot UUIDs", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
    expect(() =>
      parseSnapshot({
        ...snapshot,
        project: { ...snapshot.project, id: "invalid" },
      }),
    ).toThrow(/project.id/i);
    expect(() =>
      parseSnapshot({
        ...snapshot,
        assets: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            sha256: "A".repeat(64),
            relativePath: "assets/x.png",
            mediaType: "image/png",
            size: 1,
          },
        ],
      }),
    ).toThrow(/sha256/i);
  });

  it("migrates the current snapshot and rejects newer schema versions", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    expect(migrateSnapshot(snapshot)).toEqual(snapshot);
    expect(() => migrateSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow(
      "UNSUPPORTED_SCHEMA_VERSION",
    );
  });

  it("returns deeply immutable snapshots and manifests from creators and parsers", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    const parsedSnapshot = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));
    const parsedSnapshotWithAsset = parseSnapshot({
      ...JSON.parse(JSON.stringify(snapshot)),
      assets: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          sha256: "a".repeat(64),
          relativePath: "assets/x.png",
          mediaType: "image/png",
          size: 1,
        },
      ],
    });
    const manifest = createManifest(snapshot, {
      now: () => "2026-07-17T00:00:00.000Z",
      appVersion: "0.1.0",
    });
    const parsedManifest = parseManifest({ ...validManifest });

    for (const immutableSnapshot of [snapshot, parsedSnapshot]) {
      expect(Object.isFrozen(immutableSnapshot)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project.tags)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project.floors)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project.floors[0])).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.assets)).toBe(true);
      expect(() => {
        (immutableSnapshot.project as { profile: string }).profile = "market";
      }).toThrow(TypeError);
      expect(() => {
        (immutableSnapshot.project.floors as unknown as { push: (value: unknown) => void }).push({});
      }).toThrow(TypeError);
    }

    const asset = parsedSnapshotWithAsset.assets[0];
    if (asset === undefined) {
      throw new Error("expected parsed asset");
    }
    expect(Object.isFrozen(asset)).toBe(true);
    expect(() => {
      (asset as { mediaType: string }).mediaType = "text/plain";
    }).toThrow(TypeError);

    for (const immutableManifest of [manifest, parsedManifest]) {
      expect(Object.isFrozen(immutableManifest)).toBe(true);
      expect(() => {
        (immutableManifest as { name: string }).name = "Changed";
      }).toThrow(TypeError);
    }
  });

  it.each([
    [{ name: "   ", profile: "showroom" }, /name/i],
    [{ name: "Demo", profile: "iot" as never }, /profile/i],
    [{ name: "Demo", profile: "showroom", uuid: () => "invalid" }, /uuid/i],
    [
      {
        name: "Demo",
        profile: "showroom",
        uuid: (() => {
          const ids = ["00000000-0000-4000-8000-000000000001", "invalid"];
          return () => ids.shift()!;
        })(),
      },
      /uuid/i,
    ],
  ])("rejects invalid initial project input %#", (input, error) => {
    expect(() => createInitialSnapshot(input as Parameters<typeof createInitialSnapshot>[0])).toThrow(error);
  });

  it("rejects invalid manifest creator inputs", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    expect(() =>
      createManifest(snapshot, { now: () => "2026-02-30T00:00:00.000Z", appVersion: "0.1.0" }),
    ).toThrow(/createdAt/i);
    expect(() =>
      createManifest(snapshot, { now: () => "2026-07-17T00:00:00.000Z", appVersion: " " }),
    ).toThrow(/appVersion/i);
    expect(() =>
      createManifest(
        {
          ...snapshot,
          project: { ...snapshot.project, id: "invalid" },
        },
        { now: () => "2026-07-17T00:00:00.000Z", appVersion: "0.1.0" },
      ),
    ).toThrow(/project.id/i);
  });
});
