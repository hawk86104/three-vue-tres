import {
  createManifest,
  parseSnapshot,
  type AssetRecord,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type { SandboxProjectSeed } from "@aethertwin/project-store";
import { canonicalWebDemoSources } from "./web-demo-fixtures";

export const WEB_DEMO_TIMESTAMP = "2026-08-09T12:34:56.789Z";
export const WEB_DEMO_APP_VERSION = "0.1.0-web-demo";
export const WEB_DEMO_ASSET_FILES = Object.freeze([
  "plan-reference.svg",
  "floor.png",
  "wall.jpg",
  "fixture.svg",
] as const);

export type WebDemoAssetFile = typeof WEB_DEMO_ASSET_FILES[number];

export type WebDemoErrorCode =
  | "WEB_DEMO_PROJECT_INVALID"
  | "WEB_DEMO_ASSET_UNAVAILABLE"
  | "WEB_DEMO_ASSET_INVALID"
  | "WEB_DEMO_INITIALIZATION_FAILED";

export class WebDemoLoadError extends Error {
  constructor(readonly code: WebDemoErrorCode) {
    super(code);
    this.name = "WebDemoLoadError";
  }
}

export interface WebDemoFixtureSources {
  readonly snapshot: unknown;
  readonly manifest: unknown;
  readonly assetUrls: Readonly<Record<WebDemoAssetFile, string>>;
}

export interface LoadWebDemoSeedOptions {
  readonly signal: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
  readonly sources?: WebDemoFixtureSources;
}

interface WebDemoManifestEntry {
  readonly file: WebDemoAssetFile;
  readonly sha256: string;
  readonly mediaType: string;
  readonly purpose: string;
}

const MANIFEST_KEYS = Object.freeze(["file", "sha256", "mediaType", "purpose"] as const);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EXPECTED_MEDIA_TYPES: Readonly<Record<WebDemoAssetFile, string>> = Object.freeze({
  "plan-reference.svg": "image/svg+xml",
  "floor.png": "image/png",
  "wall.jpg": "image/jpeg",
  "fixture.svg": "image/svg+xml",
});
const EXPECTED_PURPOSES: Readonly<Record<WebDemoAssetFile, string>> = Object.freeze({
  "plan-reference.svg": "calibrated plan reference",
  "floor.png": "space-floor texture and shared content image",
  "wall.jpg": "wall texture and shared content image",
  "fixture.svg": "fixture texture and shared content image",
});

function invalidAsset(): never {
  throw new WebDemoLoadError("WEB_DEMO_ASSET_INVALID");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWebDemoManifest(value: unknown): readonly WebDemoManifestEntry[] {
  if (!Array.isArray(value) || value.length !== WEB_DEMO_ASSET_FILES.length) {
    return invalidAsset();
  }
  const seen = new Set<string>();
  const entries = value.map((candidate, index) => {
    if (!isRecord(candidate)) return invalidAsset();
    const keys = Object.keys(candidate);
    if (
      keys.length !== MANIFEST_KEYS.length
      || keys.some((key, keyIndex) => key !== MANIFEST_KEYS[keyIndex])
    ) return invalidAsset();

    const expectedFile = WEB_DEMO_ASSET_FILES[index]!;
    const { file, sha256, mediaType, purpose } = candidate;
    if (
      file !== expectedFile
      || typeof sha256 !== "string"
      || !SHA256_PATTERN.test(sha256)
      || mediaType !== EXPECTED_MEDIA_TYPES[expectedFile]
      || purpose !== EXPECTED_PURPOSES[expectedFile]
      || seen.has(expectedFile)
    ) return invalidAsset();
    seen.add(expectedFile);
    return Object.freeze({ file: expectedFile, sha256, mediaType, purpose });
  });
  return Object.freeze(entries);
}

function validateAssetUrls(
  urls: Readonly<Record<WebDemoAssetFile, string>>,
): void {
  if (!isRecord(urls)) return invalidAsset();
  const keys = Object.keys(urls);
  if (
    keys.length !== WEB_DEMO_ASSET_FILES.length
    || keys.some((key) => !WEB_DEMO_ASSET_FILES.includes(key as WebDemoAssetFile))
    || WEB_DEMO_ASSET_FILES.some((file) => typeof urls[file] !== "string" || urls[file].length === 0)
  ) invalidAsset();
}

function indexSnapshotAssets(snapshot: ProjectSnapshot): ReadonlyMap<string, readonly AssetRecord[]> {
  const mutable = new Map<string, AssetRecord[]>();
  for (const asset of snapshot.assets) {
    const matches = mutable.get(asset.sha256) ?? [];
    matches.push(asset);
    mutable.set(asset.sha256, matches);
  }
  return mutable;
}

function normalizedContentType(response: Response): string | null {
  const value = response.headers.get("content-type");
  if (value === null) return null;
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function requireExactAsset(
  entry: WebDemoManifestEntry,
  response: Response,
  bytes: Uint8Array,
  digest: string,
  assetsByDigest: ReadonlyMap<string, readonly AssetRecord[]>,
): AssetRecord {
  const matches = assetsByDigest.get(entry.sha256) ?? [];
  const asset = matches.length === 1 ? matches[0] : undefined;
  if (
    asset === undefined
    || digest !== entry.sha256
    || normalizedContentType(response) !== entry.mediaType
    || asset.mediaType !== entry.mediaType
    || asset.size !== bytes.byteLength
    || asset.sha256 !== digest
  ) return invalidAsset();
  return asset;
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}

function throwAbort(signal: AbortSignal, error: unknown): never {
  if (signal.aborted) throw error;
  throw new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE");
}

export async function loadWebDemoSeed(
  options: LoadWebDemoSeedOptions,
): Promise<SandboxProjectSeed> {
  const fetchAsset = options.fetch ?? globalThis.fetch;
  const sources = options.sources ?? canonicalWebDemoSources;
  options.signal.throwIfAborted();

  let snapshot: ProjectSnapshot;
  try {
    snapshot = parseSnapshot(structuredClone(sources.snapshot));
  } catch {
    throw new WebDemoLoadError("WEB_DEMO_PROJECT_INVALID");
  }

  const entries = parseWebDemoManifest(sources.manifest);
  validateAssetUrls(sources.assetUrls);
  const assetsByDigest = indexSnapshotAssets(snapshot);
  const loaded = await Promise.all(entries.map(async (entry) => {
    options.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetchAsset(sources.assetUrls[entry.file], {
        signal: options.signal,
      });
    } catch (error) {
      return throwAbort(options.signal, error);
    }
    if (!response.ok) {
      throw new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE");
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      return throwAbort(options.signal, error);
    }

    let digest: string;
    try {
      digest = await digestHex(bytes);
    } catch (error) {
      if (options.signal.aborted) throw error;
      throw new WebDemoLoadError("WEB_DEMO_INITIALIZATION_FAILED");
    }
    const asset = requireExactAsset(entry, response, bytes, digest, assetsByDigest);
    return Object.freeze({
      asset,
      seedAsset: Object.freeze({
        relativePath: asset.relativePath,
        blob: new Blob([ownedArrayBuffer(bytes)], { type: asset.mediaType }),
      }),
    });
  }));

  options.signal.throwIfAborted();
  const consumed = new Set(loaded.map(({ asset }) => asset.id));
  if (
    consumed.size !== snapshot.assets.length
    || snapshot.assets.some(({ id }) => !consumed.has(id))
  ) invalidAsset();

  let manifest;
  try {
    manifest = createManifest(snapshot, {
      now: () => WEB_DEMO_TIMESTAMP,
      appVersion: WEB_DEMO_APP_VERSION,
    });
  } catch {
    throw new WebDemoLoadError("WEB_DEMO_INITIALIZATION_FAILED");
  }
  return Object.freeze({
    openedProject: Object.freeze({
      projectPath: `sandbox://${snapshot.project.id}`,
      manifest,
      snapshot,
      recovered: false,
    }),
    assets: Object.freeze(loaded.map(({ seedAsset }) => seedAsset)),
  });
}
