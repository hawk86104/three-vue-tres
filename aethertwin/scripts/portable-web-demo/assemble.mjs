import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  PortablePackageError,
  createZip32,
} from "./zip.mjs";

export { PortablePackageError };

const PACKAGE_ROOT_FILES = new Set([
  "AetherTwin-Preview.exe",
  "BUILD_INFO.json",
  "README.txt",
  "SHA256SUMS.txt",
  "THIRD_PARTY_NOTICES.md",
]);
const FIXED_PATHS = Object.freeze({
  appDist: "apps/studio/dist",
  hostExecutable:
    "target/x86_64-pc-windows-msvc/release/aethertwin-web-demo-host.exe",
  readme: "packaging/web-demo/README.txt",
  notices: "THIRD_PARTY_NOTICES.md",
  stagingDirectory:
    "artifacts/portable-web-demo/win-x64/AetherTwin-Preview",
  zipFile: "artifacts/AetherTwin-Preview-win-x64.zip",
});
const APP_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".wasm",
  ".woff",
  ".woff2",
]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function packageError(code, cause) {
  return new PortablePackageError(code, cause === undefined ? undefined : { cause });
}

function throwCode(code, cause) {
  throw packageError(code, cause);
}

function comparePortablePath(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateFixedPaths(options) {
  if (options === null || typeof options !== "object") {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  for (const [key, value] of Object.entries(FIXED_PATHS)) {
    if (options[key] !== value) {
      throwCode("PACKAGE_INPUT_INVALID");
    }
  }
}

function isWithin(root, target) {
  const child = relative(root, target);
  return (
    child === "" ||
    (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`))
  );
}

export function normalizePortableRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /[^\x21-\x7e]|[%:?#]/u.test(value) ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    isAbsolute(value) ||
    /^[a-z]:/iu.test(value)
  ) {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  return segments.join("/");
}

function resolveRepositoryPath(repositoryRoot, value) {
  const normalized = normalizePortableRelativePath(value);
  const target = resolve(repositoryRoot, ...normalized.split("/"));
  if (!isWithin(repositoryRoot, target)) {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  return { normalized, target };
}

function isLink(stats) {
  return stats.isSymbolicLink();
}

async function canonicalRepositoryRoot(value) {
  try {
    const absolute = resolve(value);
    const stats = await lstat(absolute);
    if (!stats.isDirectory() || isLink(stats)) {
      throwCode("PACKAGE_INPUT_INVALID");
    }
    return {
      absolute,
      canonical: await realpath(absolute),
    };
  } catch (error) {
    if (error instanceof PortablePackageError) {
      throw error;
    }
    throwCode("PACKAGE_INPUT_INVALID", error);
  }
}

async function inspectPath(root, value, expectedKind) {
  const { normalized, target } = resolveRepositoryPath(root.absolute, value);
  let cursor = root.absolute;
  try {
    for (const segment of normalized.split("/")) {
      cursor = join(cursor, segment);
      const stats = await lstat(cursor);
      if (isLink(stats)) {
        throwCode("PACKAGE_TREE_INVALID");
      }
      const canonical = await realpath(cursor);
      if (!isWithin(root.canonical, canonical)) {
        throwCode("PACKAGE_TREE_INVALID");
      }
    }
    const stats = await lstat(target);
    if (
      (expectedKind === "file" && !stats.isFile()) ||
      (expectedKind === "directory" && !stats.isDirectory())
    ) {
      throwCode("PACKAGE_INPUT_INVALID");
    }
    return { normalized, target };
  } catch (error) {
    if (error instanceof PortablePackageError) {
      throw error;
    }
    throwCode("PACKAGE_INPUT_INVALID", error);
  }
}

async function ensureOutputPath(root, value, expectedKind) {
  const resolved = resolveRepositoryPath(root.absolute, value);
  let cursor = root.absolute;
  const segments = resolved.normalized.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    cursor = join(cursor, segments[index]);
    try {
      const stats = await lstat(cursor);
      if (isLink(stats)) {
        throwCode("PACKAGE_TREE_INVALID");
      }
      if (index < segments.length - 1 && !stats.isDirectory()) {
        throwCode("PACKAGE_TREE_INVALID");
      }
      if (
        index === segments.length - 1 &&
        ((expectedKind === "directory" && !stats.isDirectory()) ||
          (expectedKind === "file" && !stats.isFile()))
      ) {
        throwCode("PACKAGE_TREE_INVALID");
      }
      const canonical = await realpath(cursor);
      if (!isWithin(root.canonical, canonical)) {
        throwCode("PACKAGE_TREE_INVALID");
      }
    } catch (error) {
      if (error instanceof PortablePackageError) {
        throw error;
      }
      if (error?.code === "ENOENT") {
        break;
      }
      throwCode("PACKAGE_TREE_INVALID", error);
    }
  }
  return resolved;
}

async function scanRegularTree(rootPath, code = "PACKAGE_TREE_INVALID") {
  let canonicalRoot;
  try {
    const rootStats = await lstat(rootPath);
    if (!rootStats.isDirectory() || isLink(rootStats)) {
      throwCode(code);
    }
    canonicalRoot = await realpath(rootPath);
  } catch (error) {
    if (error instanceof PortablePackageError) {
      throw error;
    }
    throwCode(code, error);
  }

  const files = [];
  async function visit(directory, prefix) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throwCode(code, error);
    }
    entries.sort((left, right) => comparePortablePath(left.name, right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const portable = prefix ? `${prefix}/${entry.name}` : entry.name;
      let stats;
      try {
        stats = await lstat(absolute);
      } catch (error) {
        throwCode(code, error);
      }
      if (isLink(stats)) {
        throwCode(code);
      }
      let canonical;
      try {
        canonical = await realpath(absolute);
      } catch (error) {
        throwCode(code, error);
      }
      if (!isWithin(canonicalRoot, canonical)) {
        throwCode(code);
      }
      if (stats.isDirectory()) {
        await visit(absolute, portable);
      } else if (stats.isFile()) {
        files.push({
          absolute,
          relative: portable.replaceAll("\\", "/"),
          size: stats.size,
        });
      } else {
        throwCode(code);
      }
    }
  }
  await visit(rootPath, "");
  return files;
}

function extension(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function validateAppPaths(files) {
  const names = new Set(files.map(({ relative: path }) => path));
  if (!names.has("index.html")) {
    throwCode("PACKAGE_TREE_INVALID");
  }
  for (const path of names) {
    if (!APP_EXTENSIONS.has(extension(path))) {
      throwCode("PACKAGE_TREE_INVALID");
    }
    if (
      /(?:^|\/)(?:service-worker(?:\.|$)|sw\.js$|node(?:\.exe)?$|pnpm(?:\.cmd)?$|player(?:\.|$)|publish(?:\.|$))/iu.test(
        path,
      ) ||
      path.endsWith(".twinproj")
    ) {
      throwCode("PACKAGE_TREE_INVALID");
    }
  }
  return names;
}

function localHtmlReference(value) {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.includes("%") ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  ) {
    throwCode("PACKAGE_TREE_INVALID");
  }
  const withoutSuffix = value.split(/[?#]/u, 1)[0];
  if (withoutSuffix.length === 0) {
    throwCode("PACKAGE_TREE_INVALID");
  }
  const relativeValue = withoutSuffix.startsWith("./")
    ? withoutSuffix.slice(2)
    : withoutSuffix;
  try {
    return normalizePortableRelativePath(relativeValue);
  } catch {
    throwCode("PACKAGE_TREE_INVALID");
  }
}

async function validateHtmlReferences(appRoot, appFiles) {
  let html;
  try {
    html = UTF8.decode(await readFile(join(appRoot, "index.html")));
  } catch (error) {
    throwCode("PACKAGE_TREE_INVALID", error);
  }
  const attribute = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
  for (const match of html.matchAll(attribute)) {
    const reference = match[1] ?? match[2] ?? match[3];
    const target = localHtmlReference(reference);
    if (!appFiles.has(target)) {
      throwCode("PACKAGE_TREE_INVALID");
    }
  }
}

function validateCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  return value;
}

function validateBuiltAt(value) {
  if (typeof value !== "string") {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  return value;
}

export function resolveBuiltAtUtc({ sourceDateEpoch, now }) {
  if (sourceDateEpoch !== undefined) {
    if (
      typeof sourceDateEpoch !== "string" ||
      !/^(?:0|[1-9][0-9]*)$/u.test(sourceDateEpoch)
    ) {
      throwCode("PACKAGE_INPUT_INVALID");
    }
    const seconds = Number(sourceDateEpoch);
    if (!Number.isSafeInteger(seconds)) {
      throwCode("PACKAGE_INPUT_INVALID");
    }
    const value = new Date(seconds * 1000);
    if (Number.isNaN(value.valueOf())) {
      throwCode("PACKAGE_INPUT_INVALID");
    }
    return value.toISOString();
  }
  let current;
  try {
    current = now();
  } catch (error) {
    throwCode("PACKAGE_INPUT_INVALID", error);
  }
  if (!(current instanceof Date) || Number.isNaN(current.valueOf())) {
    throwCode("PACKAGE_INPUT_INVALID");
  }
  return current.toISOString();
}

function buildInfo({ sourceCommit, builtAtUtc }) {
  return {
    schemaVersion: 1,
    product: "AetherTwin Portable Web Demo",
    version: "0.1.0",
    platform: "windows",
    architecture: "x64",
    sourceCommit: validateCommit(sourceCommit),
    builtAtUtc: validateBuiltAt(builtAtUtc),
    entrypoint: "AetherTwin-Preview.exe",
    appRoot: "app",
    runtimeRequirements: [],
  };
}

export function buildInfoDocument(values) {
  return `${JSON.stringify(buildInfo(values), null, 2)}\n`;
}

async function sha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

function validateStagingPaths(files) {
  for (const { relative: path } of files) {
    const first = path.split("/", 1)[0];
    if (path.startsWith("app/")) {
      continue;
    }
    if (!PACKAGE_ROOT_FILES.has(first) || path !== first) {
      throwCode("PACKAGE_TREE_INVALID");
    }
  }
  const names = new Set(files.map(({ relative: path }) => path));
  for (const required of PACKAGE_ROOT_FILES) {
    if (!names.has(required)) {
      throwCode("PACKAGE_TREE_INVALID");
    }
  }
}

function decodeManifest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.at(-1) !== 0x0a) {
    throwCode("PACKAGE_HASH_INVALID");
  }
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch (error) {
    throwCode("PACKAGE_HASH_INVALID", error);
  }
  if (text.includes("\r")) {
    throwCode("PACKAGE_HASH_INVALID");
  }
  return text;
}

export async function validateChecksumManifest({
  repositoryRoot,
  packageRoot,
  manifestBytes,
}) {
  const root = await canonicalRepositoryRoot(repositoryRoot);
  const packagePath = await inspectPath(root, packageRoot, "directory");
  const text = decodeManifest(manifestBytes);
  const records = [];
  const seen = new Set();
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/u.exec(line);
    if (!match) {
      throwCode("PACKAGE_HASH_INVALID");
    }
    let path;
    try {
      path = normalizePortableRelativePath(match[2]);
    } catch {
      throwCode("PACKAGE_HASH_INVALID");
    }
    if (path === "SHA256SUMS.txt" || seen.has(path)) {
      throwCode("PACKAGE_HASH_INVALID");
    }
    seen.add(path);
    records.push({ digest: match[1], path });
  }
  const sorted = [...records].sort((left, right) =>
    comparePortablePath(left.path, right.path),
  );
  if (records.some((record, index) => record.path !== sorted[index].path)) {
    throwCode("PACKAGE_HASH_INVALID");
  }

  const actual = (await scanRegularTree(packagePath.target, "PACKAGE_HASH_INVALID"))
    .map(({ relative: path }) => path)
    .filter((path) => path !== "SHA256SUMS.txt")
    .sort(comparePortablePath);
  if (
    actual.length !== records.length ||
    actual.some((path, index) => path !== records[index].path)
  ) {
    throwCode("PACKAGE_HASH_INVALID");
  }
  for (const record of records) {
    const digest = await sha256(
      join(packagePath.target, ...record.path.split("/")),
    );
    if (digest !== record.digest) {
      throwCode("PACKAGE_HASH_INVALID");
    }
  }
  return records;
}

async function copyApp(appSource, appDestination, files) {
  await mkdir(appDestination, { recursive: true });
  for (const file of files) {
    const destination = join(appDestination, ...file.relative.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file.absolute, destination);
  }
}

async function checksumDocument(packageRoot) {
  const files = (await scanRegularTree(packageRoot))
    .filter(({ relative: path }) => path !== "SHA256SUMS.txt")
    .sort((left, right) => comparePortablePath(left.relative, right.relative));
  const lines = [];
  for (const file of files) {
    lines.push(`${await sha256(file.absolute)}  ${file.relative}`);
  }
  return `${lines.join("\n")}\n`;
}

async function zipEntries(packageRoot) {
  const files = (await scanRegularTree(packageRoot)).sort((left, right) =>
    comparePortablePath(left.relative, right.relative),
  );
  const entries = [];
  for (const file of files) {
    entries.push({
      name: file.relative,
      bytes: await readFile(file.absolute),
    });
  }
  return entries;
}

export async function assemblePortablePackage(options) {
  let packageAbsolute;
  let zipAbsolute;
  try {
    validateFixedPaths(options);
    const root = await canonicalRepositoryRoot(options.repositoryRoot);
    const app = await inspectPath(root, options.appDist, "directory");
    const host = await inspectPath(root, options.hostExecutable, "file");
    const readme = await inspectPath(root, options.readme, "file");
    const notices = await inspectPath(root, options.notices, "file");
    const staging = await ensureOutputPath(
      root,
      options.stagingDirectory,
      "directory",
    );
    const zip = await ensureOutputPath(root, options.zipFile, "file");
    packageAbsolute = staging.target;
    zipAbsolute = zip.target;

    const appFiles = await scanRegularTree(app.target);
    const appNames = validateAppPaths(appFiles);
    await validateHtmlReferences(app.target, appNames);
    if (
      (await lstat(host.target)).size === 0 ||
      (await lstat(readme.target)).size === 0 ||
      (await lstat(notices.target)).size === 0
    ) {
      throwCode("PACKAGE_INPUT_INVALID");
    }

    await rm(packageAbsolute, { recursive: true, force: true });
    await rm(zipAbsolute, { force: true });
    await mkdir(packageAbsolute, { recursive: true });
    await copyFile(host.target, join(packageAbsolute, "AetherTwin-Preview.exe"));
    await copyApp(app.target, join(packageAbsolute, "app"), appFiles);
    await copyFile(readme.target, join(packageAbsolute, "README.txt"));
    await copyFile(notices.target, join(packageAbsolute, "THIRD_PARTY_NOTICES.md"));

    const info = buildInfo({
      sourceCommit: options.sourceCommit,
      builtAtUtc: options.builtAtUtc,
    });
    await writeFile(
      join(packageAbsolute, "BUILD_INFO.json"),
      `${JSON.stringify(info, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(packageAbsolute, "SHA256SUMS.txt"),
      await checksumDocument(packageAbsolute),
      "utf8",
    );

    const stagedFiles = await scanRegularTree(packageAbsolute);
    validateStagingPaths(stagedFiles);
    const manifestBytes = await readFile(
      join(packageAbsolute, "SHA256SUMS.txt"),
    );
    await validateChecksumManifest({
      repositoryRoot: root.absolute,
      packageRoot: staging.normalized,
      manifestBytes,
    });

    const archive = createZip32({
      entries: await zipEntries(packageAbsolute),
      builtAtUtc: options.builtAtUtc,
    });
    await mkdir(dirname(zipAbsolute), { recursive: true });
    await writeFile(zipAbsolute, archive);
    return {
      packageRoot: packageAbsolute,
      zipFile: zipAbsolute,
      buildInfo: info,
    };
  } catch (error) {
    if (packageAbsolute !== undefined) {
      await rm(packageAbsolute, { recursive: true, force: true }).catch(() => {});
    }
    if (zipAbsolute !== undefined) {
      await rm(zipAbsolute, { force: true }).catch(() => {});
    }
    if (error instanceof PortablePackageError) {
      throw error;
    }
    throwCode("PACKAGE_TREE_INVALID", error);
  }
}
