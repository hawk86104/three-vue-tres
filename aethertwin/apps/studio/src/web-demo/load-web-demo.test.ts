import { readFileSync } from "node:fs";
import manifestFixture from "../../../../fixtures/assets/showroom-demo/manifest.json";
import snapshotFixture from "../../../../fixtures/contracts/showroom-demo.v3.json";
import { describe, expect, it, vi } from "vitest";
import {
  WEB_DEMO_ASSET_FILES,
  WebDemoLoadError,
  loadWebDemoSeed,
  type WebDemoAssetFile,
  type WebDemoFixtureSources,
} from "./load-web-demo";

const MEDIA_TYPES: Readonly<Record<WebDemoAssetFile, string>> = Object.freeze({
  "plan-reference.svg": "image/svg+xml",
  "floor.png": "image/png",
  "wall.jpg": "image/jpeg",
  "fixture.svg": "image/svg+xml",
});

const ASSET_BYTES = Object.freeze(Object.fromEntries(
  WEB_DEMO_ASSET_FILES.map((file) => [
    file,
    new Uint8Array(readFileSync(new URL(
      `../../../../fixtures/assets/showroom-demo/${file}`,
      import.meta.url,
    ))),
  ]),
) as Record<WebDemoAssetFile, Uint8Array>);

type MutableManifestEntry = {
  file: string;
  sha256: string;
  mediaType: string;
  purpose: string;
  [key: string]: unknown;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sources(
  overrides: Partial<WebDemoFixtureSources> = {},
): WebDemoFixtureSources {
  return {
    snapshot: clone(snapshotFixture),
    manifest: clone(manifestFixture),
    assetUrls: Object.freeze(Object.fromEntries(
      WEB_DEMO_ASSET_FILES.map((file) => [file, `local:${file}`]),
    ) as Record<WebDemoAssetFile, string>),
    ...overrides,
  };
}

function responseFor(file: WebDemoAssetFile, bytes = ASSET_BYTES[file]): Response {
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: { "content-type": `${MEDIA_TYPES[file]}; charset=binary` },
  });
}

function fileForInput(input: RequestInfo | URL): WebDemoAssetFile {
  const value = String(input);
  const file = WEB_DEMO_ASSET_FILES.find((candidate) => value === `local:${candidate}`);
  if (file === undefined) throw new Error("unexpected local fixture URL");
  return file;
}

function fixtureFetch(
  respond: (file: WebDemoAssetFile) => Response | Promise<Response> = responseFor,
): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => respond(fileForInput(input))) as unknown as typeof fetch;
}

async function expectCode(
  promise: Promise<unknown>,
  code: WebDemoLoadError["code"],
): Promise<void> {
  await expect(promise).rejects.toEqual(expect.objectContaining({
    name: "WebDemoLoadError",
    code,
    message: code,
  }));
}

describe("loadWebDemoSeed", () => {
  it("loads and verifies the canonical snapshot and all four local assets", async () => {
    const signal = new AbortController().signal;
    const fetch = fixtureFetch();
    const seed = await loadWebDemoSeed({ signal, fetch, sources: sources() });

    expect(seed).toMatchObject({
      openedProject: {
        projectPath: "sandbox://e2500000-0000-4000-8000-000000000001",
        recovered: false,
        snapshot: { schemaVersion: 3 },
      },
      assets: snapshotFixture.assets.map(({ relativePath }) => ({ relativePath })),
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.signal).toBe(signal);
    }
    expect(seed.openedProject.manifest).toMatchObject({
      createdAt: "2026-08-09T12:34:56.789Z",
      updatedAt: "2026-08-09T12:34:56.789Z",
      appVersion: "0.1.0-web-demo",
      minCompatibleAppVersion: "0.1.0-web-demo",
    });
  });

  it("maps malformed project data to the stable project error", async () => {
    const invalid = sources({
      snapshot: { ...clone(snapshotFixture), schemaVersion: 99 },
    });
    await expectCode(loadWebDemoSeed({
      signal: new AbortController().signal,
      fetch: fixtureFetch(),
      sources: invalid,
    }), "WEB_DEMO_PROJECT_INVALID");
  });

  it.each([
    ["unknown key", (entries: MutableManifestEntry[]) => { entries[0]!.unexpected = true; }],
    ["duplicate file", (entries: MutableManifestEntry[]) => { entries[1]!.file = entries[0]!.file; }],
    ["unknown file", (entries: MutableManifestEntry[]) => { entries[0]!.file = "remote.png"; }],
    ["missing file", (entries: MutableManifestEntry[]) => { entries.pop(); }],
    ["extra file", (entries: MutableManifestEntry[]) => { entries.push(clone(entries[0]!)); }],
    ["uppercase digest", (entries: MutableManifestEntry[]) => { entries[0]!.sha256 = entries[0]!.sha256.toUpperCase(); }],
    ["wrong media type", (entries: MutableManifestEntry[]) => { entries[0]!.mediaType = "image/png"; }],
    ["invalid purpose", (entries: MutableManifestEntry[]) => { entries[0]!.purpose = ""; }],
  ])("rejects an invalid manifest: %s", async (_name, mutate) => {
    const entries = clone(manifestFixture) as MutableManifestEntry[];
    mutate(entries);
    await expectCode(loadWebDemoSeed({
      signal: new AbortController().signal,
      fetch: fixtureFetch(),
      sources: sources({ manifest: entries }),
    }), "WEB_DEMO_ASSET_INVALID");
  });

  it("maps HTTP, fetch, and body-read failures to the stable unavailable error", async () => {
    const signal = new AbortController().signal;
    await expectCode(loadWebDemoSeed({
      signal,
      fetch: fixtureFetch(() => new Response(null, { status: 404 })),
      sources: sources(),
    }), "WEB_DEMO_ASSET_UNAVAILABLE");

    await expectCode(loadWebDemoSeed({
      signal,
      fetch: vi.fn().mockRejectedValue(new Error("C:\\secret\\asset.png")) as typeof fetch,
      sources: sources(),
    }), "WEB_DEMO_ASSET_UNAVAILABLE");

    await expectCode(loadWebDemoSeed({
      signal,
      fetch: fixtureFetch((file) => {
        const response = responseFor(file);
        Object.defineProperty(response, "arrayBuffer", {
          value: vi.fn().mockRejectedValue(new Error("raw browser failure")),
        });
        return response;
      }),
      sources: sources(),
    }), "WEB_DEMO_ASSET_UNAVAILABLE");
  });

  it.each([
    ["media type", (file: WebDemoAssetFile) => new Response(
      Uint8Array.from(ASSET_BYTES[file]).buffer,
      { status: 200, headers: { "content-type": "application/octet-stream" } },
    )],
    ["byte length", (file: WebDemoAssetFile) => responseFor(
      file,
      ASSET_BYTES[file].slice(0, Math.max(0, ASSET_BYTES[file].byteLength - 1)),
    )],
    ["digest", (file: WebDemoAssetFile) => {
      const changed = Uint8Array.from(ASSET_BYTES[file]);
      changed[0] = (changed[0]! + 1) & 0xff;
      return responseFor(file, changed);
    }],
  ])("rejects a wrong response %s", async (_name, respond) => {
    await expectCode(loadWebDemoSeed({
      signal: new AbortController().signal,
      fetch: fixtureFetch((file) => respond(file)),
      sources: sources(),
    }), "WEB_DEMO_ASSET_INVALID");
  });

  it("requires each manifest digest to match exactly one snapshot asset", async () => {
    const zero = clone(snapshotFixture);
    zero.assets[0]!.sha256 = "f".repeat(64);
    zero.assets[0]!.relativePath = `assets/sha256/ff/${"f".repeat(64)}.svg`;
    await expectCode(loadWebDemoSeed({
      signal: new AbortController().signal,
      fetch: fixtureFetch(),
      sources: sources({ snapshot: zero }),
    }), "WEB_DEMO_ASSET_INVALID");

    const duplicate = clone(snapshotFixture);
    duplicate.assets[1] = {
      ...duplicate.assets[0]!,
      id: duplicate.assets[1]!.id,
    };
    await expectCode(loadWebDemoSeed({
      signal: new AbortController().signal,
      fetch: fixtureFetch(),
      sources: sources({ snapshot: duplicate }),
    }), "WEB_DEMO_ASSET_INVALID");
  });

  it("preserves abort errors and never returns a partial seed", async () => {
    const controller = new AbortController();
    const fetch = fixtureFetch(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    await expect(loadWebDemoSeed({
      signal: controller.signal,
      fetch,
      sources: sources(),
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns frozen owned records, snapshot, manifest, and asset bytes", async () => {
    const input = sources();
    const seed = await loadWebDemoSeed({
      signal: new AbortController().signal,
      fetch: fixtureFetch(),
      sources: input,
    });

    expect(Object.isFrozen(seed)).toBe(true);
    expect(Object.isFrozen(seed.openedProject)).toBe(true);
    expect(Object.isFrozen(seed.openedProject.snapshot)).toBe(true);
    expect(Object.isFrozen(seed.openedProject.snapshot.assets[0])).toBe(true);
    expect(Object.isFrozen(seed.openedProject.manifest)).toBe(true);
    expect(Object.isFrozen(seed.assets)).toBe(true);
    expect(Object.isFrozen(seed.assets[0])).toBe(true);
    expect(new Uint8Array(await seed.assets[0]!.blob.arrayBuffer())).toEqual(
      ASSET_BYTES["plan-reference.svg"],
    );
    expect(seed.openedProject.snapshot).not.toBe(input.snapshot);
    expect(seed.openedProject.manifest).not.toBe(input.manifest);
  });
});
