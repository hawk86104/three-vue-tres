import type { CommitBatch } from "@aethertwin/command-bus";
import { SaxesParser } from "saxes";
import {
  AssetPolicyError,
  assertAssetImportRequest,
  assertRoleAllowsMedia,
  classifyAssetMedia,
  type AssetImportProgress,
  type AssetImportRequest,
  type AssetImportResult,
  type AssetMediaFacts,
} from "@aethertwin/asset-pipeline";
import {
  createInitialSnapshot,
  createManifest,
  parseManifest,
  parseSnapshot,
  type ProjectSnapshot,
  type AssetMediaType,
} from "@aethertwin/core-model";
import type {
  CheckpointResult,
  CreateProjectRequest,
  OpenedProject,
  ProjectBackend,
  RecoveryConfirmation,
} from "./backend";

const SANDBOX_APP_VERSION = "0.1.0";
const SANDBOX_MAX_BUFFERED_ASSET_BYTES = 32 * 1024 * 1024;
const SVG_MAX_AXIS = 16_384;
const SVG_MAX_PIXELS = 268_435_456;
const SVG_FORBIDDEN_ELEMENTS = new Set([
  "script", "foreignobject", "iframe", "object", "embed", "image", "audio", "video",
  "style", "animate", "animatemotion", "animatetransform", "set", "link", "meta", "base",
]);
const SVG_PRESENTATION_ATTRIBUTES = new Set([
  "alignment-baseline", "baseline-shift", "clip", "clip-path", "color-profile", "clip-rule",
  "color", "color-interpolation", "color-interpolation-filters", "color-rendering", "cursor",
  "direction", "enable-background", "display", "dominant-baseline", "fill", "fill-opacity",
  "fill-rule", "filter", "flood-color", "flood-opacity", "font-family", "font-size",
  "font-stretch", "font-style", "font-size-adjust", "font-variant", "font-weight",
  "image-rendering", "letter-spacing", "lighting-color", "glyph-orientation-horizontal",
  "glyph-orientation-vertical", "marker-end", "marker-mid", "marker-start", "kerning", "mask",
  "opacity", "overflow", "paint-order", "pointer-events", "shape-rendering", "stop-color",
  "stop-opacity", "stroke", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width", "text-anchor",
  "text-decoration", "text-rendering", "unicode-bidi", "vector-effect", "visibility",
  "word-spacing", "writing-mode",
]);

interface InspectedSandboxMedia {
  readonly mediaType: AssetMediaType;
  readonly canonicalExtension: "png" | "jpg" | "svg" | "mp4" | "webm";
  readonly facts: AssetMediaFacts;
}

interface ActiveSandboxImport {
  readonly projectPath: string;
  cancelled: boolean;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function pngFacts(bytes: Uint8Array): AssetMediaFacts | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte) ||
    new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { kind: "image", width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegFacts(bytes: Uint8Array): AssetMediaFacts | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        kind: "image",
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function svgLocalName(name: string): string {
  if ([...name].some((character) => character.codePointAt(0)! > 0x7f)) throw new Error("unsafe SVG");
  return name.toLowerCase().split(":").at(-1)!;
}

function isLocalSvgFragment(value: string): boolean {
  return /^#[A-Za-z0-9_.:-]+$/.test(value);
}

function containsAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validateSvgUrlFunctions(value: string): void {
  let remaining = value;
  while (true) {
    const start = remaining.indexOf("url(");
    if (start < 0) return;
    remaining = remaining.slice(start + 4);
    const end = remaining.indexOf(")");
    if (end < 0) throw new Error("unsafe SVG");
    const target = remaining.slice(0, end).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!isLocalSvgFragment(target) || /\s/.test(target) || containsAsciiControl(target)) {
      throw new Error("unsafe SVG");
    }
    remaining = remaining.slice(end + 1);
  }
}

function validateSvgPresentationValue(value: string): void {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.length === 0 || trimmed.includes("\\") || lower.includes("/*") ||
    lower.includes("*/") || lower.includes("@import") || lower.includes("expression") ||
    containsAsciiControl(trimmed)) throw new Error("unsafe SVG");
  if (/^url\(#[A-Za-z0-9_.:-]+\)$/.test(trimmed)) return;
  if (lower.includes("url") || /[():]/.test(lower) || lower.includes("//")) {
    throw new Error("unsafe SVG");
  }
}

function validateSvgAttribute(name: string, value: string): void {
  const lower = value.toLowerCase();
  if (["javascript:", "data:", "file:", "http:", "https:", "expression("].some((part) =>
    lower.includes(part)) || lower.startsWith("//") || lower.startsWith("/")) {
    throw new Error("unsafe SVG");
  }
  if ((name === "href" || name === "src") && !isLocalSvgFragment(value)) {
    throw new Error("unsafe SVG");
  }
  validateSvgUrlFunctions(lower);
}

function parseSvgAxis(value: string): number {
  const number = value.endsWith("px") ? value.slice(0, -2) : value;
  if (!/^[0-9]+$/.test(number)) throw new Error("invalid SVG dimensions");
  const parsed = Number(number);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > SVG_MAX_AXIS) {
    throw new Error("invalid SVG dimensions");
  }
  return parsed;
}

function requireSvgValue(value: string | null): string {
  if (value === null) throw new Error("invalid SVG dimensions");
  return value;
}

function validateSvgDimensions(width: number, height: number): AssetMediaFacts {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
    width > SVG_MAX_AXIS || height > SVG_MAX_AXIS || width * height > SVG_MAX_PIXELS) {
    throw new Error("invalid SVG dimensions");
  }
  return { kind: "image", width, height };
}

function svgFacts(bytes: Uint8Array): AssetMediaFacts | null {
  if ((bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) || bytes.includes(0x26)) {
    return null;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let depth = 0;
    let rootCount = 0;
    let width: string | null = null;
    let height: string | null = null;
    let viewBox: string | null = null;
    const parser = new SaxesParser();
    const reject = (): never => { throw new Error("unsafe SVG"); };
    parser.on("error", reject);
    parser.on("xmldecl", reject);
    parser.on("processinginstruction", reject);
    parser.on("doctype", reject);
    parser.on("text", (value) => { if (depth === 0 && value.trim() !== "") reject(); });
    parser.on("cdata", (value) => { if (depth === 0 && value.trim() !== "") reject(); });
    parser.on("opentag", (tag) => {
      const isRoot = depth === 0;
      const elementName = svgLocalName(tag.name);
      if (isRoot) {
        rootCount += 1;
        if (rootCount !== 1 || elementName !== "svg") reject();
      } else if (SVG_FORBIDDEN_ELEMENTS.has(elementName)) reject();
      const normalized = new Set<string>();
      for (const [rawName, rawValue] of Object.entries(tag.attributes)) {
        const fullName = svgLocalName(rawName.includes(":") ? rawName : `:${rawName}`);
        const lowerRawName = rawName.toLowerCase();
        if (lowerRawName === "xmlns" || lowerRawName.startsWith("xmlns:")) continue;
        const value = rawValue.trim();
        if (fullName === "style" || fullName.startsWith("on") || normalized.has(fullName)) reject();
        normalized.add(fullName);
        if (SVG_PRESENTATION_ATTRIBUTES.has(fullName)) validateSvgPresentationValue(value);
        validateSvgAttribute(fullName, value);
        if (isRoot) {
          if (fullName === "width") width = value;
          if (fullName === "height") height = value;
          if (fullName === "viewbox") viewBox = value;
        }
      }
      depth += 1;
    });
    parser.on("closetag", () => { depth -= 1; if (depth < 0) reject(); });
    parser.write(text).close();
    if (rootCount !== 1 || depth !== 0) reject();

    if (width !== null || height !== null) {
      return validateSvgDimensions(
        parseSvgAxis(requireSvgValue(width)),
        parseSvgAxis(requireSvgValue(height)),
      );
    }
    const values = requireSvgValue(viewBox).split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) reject();
    return validateSvgDimensions(values[2]!, values[3]!);
  } catch {
    return null;
  }
}

function inspectSandboxMedia(bytes: Uint8Array, displayName: string): InspectedSandboxMedia {
  const png = pngFacts(bytes);
  const jpeg = png === null ? jpegFacts(bytes) : null;
  const svg = png === null && jpeg === null ? svgFacts(bytes) : null;
  let signature: AssetMediaType;
  let facts: AssetMediaFacts;
  if (png !== null) {
    signature = "image/png";
    facts = png;
  } else if (jpeg !== null) {
    signature = "image/jpeg";
    facts = jpeg;
  } else if (svg !== null) {
    signature = "image/svg+xml";
    facts = svg;
  } else if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp") {
    signature = "video/mp4";
    facts = { kind: "video" };
  } else if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    signature = "video/webm";
    facts = { kind: "video" };
  } else {
    throw new AssetPolicyError("ASSET_UNSUPPORTED_MEDIA", "The Blob media signature is unsupported.");
  }
  return classifyAssetMedia({
    displayName,
    signature,
    byteLength: bytes.byteLength,
    facts,
  });
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}

function cloneOpenedProject(project: OpenedProject): OpenedProject {
  return Object.freeze({
    projectPath: project.projectPath,
    manifest: parseManifest(project.manifest),
    snapshot: parseSnapshot(project.snapshot),
    recovered: project.recovered,
  });
}

export class SandboxProjectBackend implements ProjectBackend {
  readonly mode = "sandbox" as const;
  checkpointCount = 0;
  failNextCommit: Error | null = null;

  private readonly projects = new Map<string, OpenedProject>();
  private readonly blobs = new Map<string, Map<string, Blob>>();
  private readonly objectUrls = new Map<string, Map<string, string>>();
  private readonly activeImports = new Map<string, ActiveSandboxImport>();
  private nextId = 1;
  private nextTimestamp = 0;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  async createProject(request: CreateProjectRequest): Promise<OpenedProject> {
    const snapshot = createInitialSnapshot({
      name: request.name,
      profile: request.profile,
      uuid: () => this.createUuid(),
    });
    const manifest = createManifest(snapshot, {
      now: () => this.createTimestamp(),
      appVersion: SANDBOX_APP_VERSION,
    });
    const projectPath = `sandbox://${snapshot.project.id}`;
    const opened = cloneOpenedProject({
      projectPath,
      manifest,
      snapshot,
      recovered: false,
    });
    this.projects.set(projectPath, cloneOpenedProject(opened));
    return cloneOpenedProject(opened);
  }

  async openProject(projectPath: string): Promise<OpenedProject> {
    return cloneOpenedProject(this.getProject(projectPath));
  }

  async recoverProject(
    projectPath: string,
    confirmation: RecoveryConfirmation,
  ): Promise<OpenedProject> {
    void projectPath;
    void confirmation;
    throw new Error("Stale-lock recovery is unavailable in the Web sandbox");
  }

  async importAsset(
    projectPath: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<AssetImportResult> {
    this.requireActive();
    this.getProject(projectPath);
    assertAssetImportRequest(request);
    if (request.source.kind !== "sandbox-blob" || !(request.source.blob instanceof Blob)) {
      throw new AssetPolicyError("INVALID_ASSET_SOURCE", "Sandbox imports require a Blob source.");
    }
    if (request.source.blob.size > SANDBOX_MAX_BUFFERED_ASSET_BYTES) {
      throw new AssetPolicyError(
        "ASSET_TOO_LARGE",
        "The sandbox asset exceeds the buffered import limit.",
      );
    }
    const key = `${projectPath}\u0000${request.operationId}`;
    if (this.activeImports.has(key)) {
      throw new AssetPolicyError("ASSET_IMPORT_OPERATION_EXISTS", "The import operation already exists.");
    }
    const active: ActiveSandboxImport = { projectPath, cancelled: false };
    this.activeImports.set(key, active);
    try {
      const bytes = new Uint8Array(await request.source.blob.arrayBuffer());
      const totalBytes = bytes.byteLength;
      const assertNotCancelled = (): void => {
        if (active.cancelled) {
          throw new AssetPolicyError("ASSET_IMPORT_CANCELLED", "Asset import cancelled.");
        }
      };
      const emit = (stage: AssetImportProgress["stage"], completedBytes: number): void => {
        assertNotCancelled();
        onProgress(Object.freeze({
          operationId: request.operationId,
          stage,
          completedBytes,
          totalBytes,
        }));
        assertNotCancelled();
      };
      emit("capture", 0);
      const inspected = inspectSandboxMedia(bytes, request.source.displayName);
      assertRoleAllowsMedia(request.role, inspected.mediaType);
      emit("validate", 0);
      const sha256 = await digestHex(bytes);
      emit("hash", totalBytes);
      const relativePath = `assets/sha256/${sha256.slice(0, 2)}/${sha256}.${inspected.canonicalExtension}`;
      const projectBlobs = this.blobs.get(projectPath) ?? new Map<string, Blob>();
      if (!projectBlobs.has(relativePath)) {
        projectBlobs.set(relativePath, new Blob([ownedArrayBuffer(bytes)], {
          type: inspected.mediaType,
        }));
      }
      this.blobs.set(projectPath, projectBlobs);
      emit("publish", totalBytes);
      const result: AssetImportResult = Object.freeze({
        asset: Object.freeze({
          id: this.createUuid(),
          sha256,
          relativePath,
          mediaType: inspected.mediaType,
          size: totalBytes,
        }),
        facts: Object.freeze({ ...inspected.facts }),
      });
      emit("complete", totalBytes);
      assertNotCancelled();
      return result;
    } finally {
      this.activeImports.delete(key);
    }
  }

  async cancelAssetImport(projectPath: string, operationId: string): Promise<void> {
    this.requireActive();
    this.getProject(projectPath);
    const active = this.activeImports.get(`${projectPath}\u0000${operationId}`);
    if (active !== undefined) active.cancelled = true;
  }

  async resolveAsset(projectPath: string, assetId: string): Promise<{ readonly assetId: string; readonly url: string }> {
    this.requireActive();
    const project = this.getProject(projectPath);
    const asset = project.snapshot.assets.find(({ id }) => id === assetId);
    if (asset === undefined) {
      throw new AssetPolicyError("ASSET_MISSING", "The asset is missing from the project snapshot.");
    }
    const blob = this.blobs.get(projectPath)?.get(asset.relativePath);
    if (blob === undefined) {
      throw new AssetPolicyError("ASSET_MISSING", "The asset bytes are unavailable.");
    }
    const projectUrls = this.objectUrls.get(projectPath) ?? new Map<string, string>();
    let url = projectUrls.get(asset.relativePath);
    if (url === undefined) {
      url = URL.createObjectURL(blob);
      projectUrls.set(asset.relativePath, url);
      this.objectUrls.set(projectPath, projectUrls);
    }
    return Object.freeze({ assetId, url });
  }

  async commit(projectPath: string, batch: CommitBatch<ProjectSnapshot>): Promise<void> {
    this.requireActive();
    const failure = this.failNextCommit;
    this.failNextCommit = null;
    if (failure !== null) {
      throw failure;
    }

    const current = this.getProject(projectPath);
    if (JSON.stringify(current.snapshot) !== JSON.stringify(batch.before)) {
      throw new Error("Sandbox commit does not own the current snapshot");
    }
    const snapshot = parseSnapshot(batch.after);
    this.projects.set(
      projectPath,
      cloneOpenedProject({ ...current, snapshot }),
    );
    this.revokeInvalidatedUrls(projectPath, snapshot);
  }

  async checkpoint(projectPath: string, snapshot: ProjectSnapshot): Promise<CheckpointResult> {
    const current = this.getProject(projectPath);
    const requestedSnapshot = parseSnapshot(snapshot);
    if (JSON.stringify(current.snapshot) !== JSON.stringify(requestedSnapshot)) {
      throw new Error("Sandbox checkpoint does not own the current snapshot");
    }
    const ownedSnapshot = parseSnapshot({
      ...requestedSnapshot,
      checkpointSequence: requestedSnapshot.sequence,
    });
    const manifest = parseManifest({
      ...current.manifest,
      name: ownedSnapshot.project.name,
      profile: ownedSnapshot.project.profile,
      updatedAt: this.createTimestamp(),
    });
    this.checkpointCount += 1;
    this.projects.set(
      projectPath,
      cloneOpenedProject({ ...current, manifest, snapshot: ownedSnapshot, recovered: false }),
    );
    return Object.freeze({
      manifest: parseManifest(manifest),
      snapshot: parseSnapshot(ownedSnapshot),
    });
  }

  async closeProject(projectPath: string): Promise<void> {
    this.getProject(projectPath);
    this.revokeProjectUrls(projectPath);
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== null) return this.disposePromise;
    this.disposed = true;
    for (const projectPath of this.objectUrls.keys()) this.revokeProjectUrls(projectPath);
    for (const active of this.activeImports.values()) active.cancelled = true;
    this.activeImports.clear();
    this.disposePromise = Promise.resolve();
    return this.disposePromise;
  }

  private revokeInvalidatedUrls(projectPath: string, snapshot: ProjectSnapshot): void {
    const retained = new Set(snapshot.assets.map(({ relativePath }) => relativePath));
    const urls = this.objectUrls.get(projectPath);
    if (urls === undefined) return;
    for (const [relativePath, url] of urls) {
      if (!retained.has(relativePath)) {
        URL.revokeObjectURL(url);
        urls.delete(relativePath);
      }
    }
    if (urls.size === 0) this.objectUrls.delete(projectPath);
  }

  private revokeProjectUrls(projectPath: string): void {
    const urls = this.objectUrls.get(projectPath);
    if (urls === undefined) return;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    this.objectUrls.delete(projectPath);
  }

  private requireActive(): void {
    if (this.disposed) throw new Error("SandboxProjectBackend is disposed");
  }

  private getProject(projectPath: string): OpenedProject {
    const project = this.projects.get(projectPath);
    if (project === undefined) {
      throw new Error(`Sandbox project not found: ${projectPath}`);
    }
    return project;
  }

  private createUuid(): string {
    const suffix = String(this.nextId).padStart(12, "0");
    this.nextId += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }

  private createTimestamp(): string {
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, this.nextTimestamp)).toISOString();
    this.nextTimestamp += 1;
    return timestamp;
  }
}
