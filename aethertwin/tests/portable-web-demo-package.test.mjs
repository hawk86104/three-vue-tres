import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  PortablePackageError,
  assemblePortablePackage,
  buildInfoDocument,
  normalizePortableRelativePath,
  resolveBuiltAtUtc,
  validateChecksumManifest,
} from "../scripts/portable-web-demo/assemble.mjs";
import {
  assertZip32Bounds,
  createZip32,
} from "../scripts/portable-web-demo/zip.mjs";
import { runPortablePackage } from "../scripts/portable-web-demo/package-win-x64.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const BUILT_AT = "2026-08-15T02:03:04.000Z";
const PACKAGE_RELATIVE =
  "artifacts/portable-web-demo/win-x64/AetherTwin-Preview";

async function write(root, relative, bytes) {
  const target = join(root, ...relative.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "aethertwin-portable-package-"));
  const files = new Map([
    [
      "apps/studio/dist/index.html",
      Buffer.from(
        [
          "<!doctype html>",
          '<link rel="stylesheet" href="./assets/style-12345678.css">',
          '<link rel="modulepreload" href="./assets/chunk-12345678.js">',
          '<script type="module" src="./assets/app-12345678.js"></script>',
          '<img src="./assets/icon-12345678.svg">',
        ].join("\n"),
      ),
    ],
    ["apps/studio/dist/assets/app-12345678.js", Buffer.from("export const demo = true;\n")],
    ["apps/studio/dist/assets/chunk-12345678.js", Buffer.from("export const chunk = true;\n")],
    ["apps/studio/dist/assets/style-12345678.css", Buffer.from("body{color:#fff}\n")],
    ["apps/studio/dist/assets/data-12345678.json", Buffer.from('{"demo":true}\n')],
    ["apps/studio/dist/assets/icon-12345678.svg", Buffer.from("<svg/>\n")],
    ["apps/studio/dist/assets/pixel-12345678.png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ["apps/studio/dist/assets/photo-12345678.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    [
      "target/x86_64-pc-windows-msvc/release/aethertwin-web-demo-host.exe",
      Buffer.from("portable-host-binary"),
    ],
    [
      "packaging/web-demo/README.txt",
      Buffer.from("Portable preview instructions\n", "utf8"),
    ],
    [
      "THIRD_PARTY_NOTICES.md",
      Buffer.from("# Third-party notices\n\nFixture notices.\n", "utf8"),
    ],
  ]);
  for (const [relative, bytes] of files) {
    await write(root, relative, bytes);
  }
  return { root, files };
}

function assemblyOptions(root, overrides = {}) {
  return {
    repositoryRoot: root,
    appDist: "apps/studio/dist",
    hostExecutable:
      "target/x86_64-pc-windows-msvc/release/aethertwin-web-demo-host.exe",
    readme: "packaging/web-demo/README.txt",
    notices: "THIRD_PARTY_NOTICES.md",
    stagingDirectory:
      "artifacts/portable-web-demo/win-x64/AetherTwin-Preview",
    zipFile: "artifacts/AetherTwin-Preview-win-x64.zip",
    sourceCommit: COMMIT,
    builtAtUtc: BUILT_AT,
    ...overrides,
  };
}

async function withFixture(run) {
  const fixture = await createFixture();
  try {
    return await run(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function listFiles(root, relative = "") {
  const { readdir } = await import("node:fs/promises");
  const directory = join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, child)));
    } else {
      files.push(child.replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseZip32(bytes) {
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  assert.notEqual(eocd, -1, "end of central directory");
  assert.equal(bytes.readUInt16LE(eocd + 4), 0);
  assert.equal(bytes.readUInt16LE(eocd + 6), 0);
  const count = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  assert.equal(centralOffset + centralSize, eocd);
  assert.equal(bytes.readUInt16LE(eocd + 20), 0);

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const dosTime = bytes.readUInt16LE(cursor + 12);
    const dosDate = bytes.readUInt16LE(cursor + 14);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    assert.equal(flags & 0x0800, 0x0800, `UTF-8 flag for ${name}`);
    assert.equal(method, 0, `stored entry for ${name}`);
    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes
      .subarray(localOffset + 30, localOffset + 30 + localNameLength)
      .toString("utf8");
    assert.equal(localName, name);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataOffset, dataOffset + compressedSize);
    assert.equal(compressedSize, uncompressedSize);
    assert.equal(crc32(data), crc, `CRC for ${name}`);
    entries.push({ name, data: Buffer.from(data), dosTime, dosDate });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, eocd);
  return entries;
}

function checksumPaths(text) {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => {
      assert.match(line, /^[0-9a-f]{64} {2}[^\\]+$/u);
      return line.slice(66);
    });
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof PortablePackageError);
    assert.equal(error.message, code);
    assert.equal(String(error), `PortablePackageError: ${code}`);
    return true;
  });
}

test("assembler creates the exact staging tree, hashes, and byte-identical payload", async () => {
  await withFixture(async ({ root, files }) => {
    const sourceBefore = new Map();
    for (const [relative] of files) {
      sourceBefore.set(relative, await readFile(join(root, ...relative.split("/"))));
    }

    const result = await assemblePortablePackage(assemblyOptions(root));
    const packageRoot = join(
      root,
      "artifacts",
      "portable-web-demo",
      "win-x64",
      "AetherTwin-Preview",
    );
    const stagedFiles = await listFiles(packageRoot);
    assert.deepEqual(stagedFiles, [
      "AetherTwin-Preview.exe",
      "BUILD_INFO.json",
      "README.txt",
      "SHA256SUMS.txt",
      "THIRD_PARTY_NOTICES.md",
      "app/assets/app-12345678.js",
      "app/assets/chunk-12345678.js",
      "app/assets/data-12345678.json",
      "app/assets/icon-12345678.svg",
      "app/assets/photo-12345678.jpg",
      "app/assets/pixel-12345678.png",
      "app/assets/style-12345678.css",
      "app/index.html",
    ]);
    assert.deepEqual(
      await readFile(join(packageRoot, "AetherTwin-Preview.exe")),
      files.get("target/x86_64-pc-windows-msvc/release/aethertwin-web-demo-host.exe"),
    );
    assert.deepEqual(
      await readFile(join(packageRoot, "README.txt")),
      files.get("packaging/web-demo/README.txt"),
    );
    assert.deepEqual(
      await readFile(join(packageRoot, "THIRD_PARTY_NOTICES.md")),
      files.get("THIRD_PARTY_NOTICES.md"),
    );
    for (const [relative, before] of sourceBefore) {
      assert.deepEqual(
        await readFile(join(root, ...relative.split("/"))),
        before,
        `source mutated: ${relative}`,
      );
    }

    const buildInfoBytes = await readFile(join(packageRoot, "BUILD_INFO.json"));
    assert.equal(buildInfoBytes.at(-1), 0x0a);
    const buildInfo = JSON.parse(buildInfoBytes.toString("utf8"));
    assert.deepEqual(Object.keys(buildInfo), [
      "schemaVersion",
      "product",
      "version",
      "platform",
      "architecture",
      "sourceCommit",
      "builtAtUtc",
      "entrypoint",
      "appRoot",
      "runtimeRequirements",
    ]);
    assert.deepEqual(buildInfo, {
      schemaVersion: 1,
      product: "AetherTwin Portable Web Demo",
      version: "0.1.0",
      platform: "windows",
      architecture: "x64",
      sourceCommit: COMMIT,
      builtAtUtc: BUILT_AT,
      entrypoint: "AetherTwin-Preview.exe",
      appRoot: "app",
      runtimeRequirements: [],
    });

    const checksumBytes = await readFile(join(packageRoot, "SHA256SUMS.txt"));
    assert.equal(checksumBytes.at(-1), 0x0a);
    assert.deepEqual(
      checksumPaths(checksumBytes.toString("utf8")),
      stagedFiles.filter((path) => path !== "SHA256SUMS.txt"),
    );
    await validateChecksumManifest({
      repositoryRoot: root,
      packageRoot: PACKAGE_RELATIVE,
      manifestBytes: checksumBytes,
    });
    assert.equal(result.packageRoot, packageRoot);
  });
});

test("ZIP is independently parseable, sorted, exact, and has no enclosing folder", async () => {
  await withFixture(async ({ root }) => {
    await assemblePortablePackage(assemblyOptions(root));
    const packageRoot = join(
      root,
      "artifacts",
      "portable-web-demo",
      "win-x64",
      "AetherTwin-Preview",
    );
    const archive = await readFile(
      join(root, "artifacts", "AetherTwin-Preview-win-x64.zip"),
    );
    const entries = parseZip32(archive);
    const staged = await listFiles(packageRoot);
    assert.deepEqual(
      entries.map(({ name }) => name),
      staged,
    );
    for (const { name, data } of entries) {
      assert.deepEqual(data, await readFile(join(packageRoot, ...name.split("/"))));
      assert.doesNotMatch(name, /^AetherTwin-Preview\//u);
    }
    assert.equal(new Set(entries.map(({ dosTime }) => dosTime)).size, 1);
    assert.equal(new Set(entries.map(({ dosDate }) => dosDate)).size, 1);
  });
});

test("build info and SOURCE_DATE_EPOCH are canonical and deterministic", () => {
  assert.equal(
    buildInfoDocument({ sourceCommit: COMMIT, builtAtUtc: BUILT_AT }),
    [
      "{",
      '  "schemaVersion": 1,',
      '  "product": "AetherTwin Portable Web Demo",',
      '  "version": "0.1.0",',
      '  "platform": "windows",',
      '  "architecture": "x64",',
      `  "sourceCommit": "${COMMIT}",`,
      `  "builtAtUtc": "${BUILT_AT}",`,
      '  "entrypoint": "AetherTwin-Preview.exe",',
      '  "appRoot": "app",',
      '  "runtimeRequirements": []',
      "}",
      "",
    ].join("\n"),
  );
  assert.equal(
    resolveBuiltAtUtc({ sourceDateEpoch: "0", now: () => new Date(BUILT_AT) }),
    "1970-01-01T00:00:00.000Z",
  );
  assert.equal(
    resolveBuiltAtUtc({ sourceDateEpoch: undefined, now: () => new Date(BUILT_AT) }),
    BUILT_AT,
  );
  for (const value of ["", "-1", "+1", "1.5", " 1", "01", "9007199254740992"]) {
    assert.throws(
      () => resolveBuiltAtUtc({ sourceDateEpoch: value, now: () => new Date(BUILT_AT) }),
      (error) => error instanceof PortablePackageError && error.message === "PACKAGE_INPUT_INVALID",
      value,
    );
  }
});

test("HTML accepts only present relative local references", async () => {
  const invalid = [
    "/assets/app-12345678.js",
    "//example.invalid/app.js",
    "http://example.invalid/app.js",
    "https://example.invalid/app.js",
    "file:///C:/app.js",
    "data:text/javascript,alert(1)",
    "./assets/%2e%2e/app.js",
    "./assets\\app.js",
    "../outside.js",
    "./assets/missing.js",
    "//example.invalid/unquoted.js",
  ];
  for (const reference of invalid) {
    await withFixture(async ({ root }) => {
      await write(
        root,
        "apps/studio/dist/index.html",
        Buffer.from(
          reference.endsWith("unquoted.js")
            ? `<script type="module" src=${reference}></script>\n`
            : `<script type="module" src="${reference}"></script>\n`,
        ),
      );
      await expectCode(
        () => assemblePortablePackage(assemblyOptions(root)),
        "PACKAGE_TREE_INVALID",
      );
    });
  }

  await withFixture(async ({ root }) => {
    await write(
      root,
      "apps/studio/dist/index.html",
      Buffer.from(
        '<script type="module" src="./assets/app-12345678.js?cache=1#module"></script>\n',
      ),
    );
    await assemblePortablePackage(assemblyOptions(root));
  });
});

test("all exported package paths reject non-portable or escaping values", async () => {
  for (const value of [
    "",
    ".",
    "..",
    "./app",
    "app/.",
    "app/..",
    "app//x",
    "/absolute",
    "C:/drive",
    "C:\\drive",
    "app\\x",
    "app/\0x",
    "app/%2e",
    "app space/x",
    "app:stream",
    "app?query/x",
    "app#fragment/x",
    "你好/x",
  ]) {
    assert.throws(
      () => normalizePortableRelativePath(value),
      (error) => error instanceof PortablePackageError && error.message === "PACKAGE_INPUT_INVALID",
      JSON.stringify(value),
    );
  }

  await withFixture(async ({ root }) => {
    await expectCode(
      () =>
        assemblePortablePackage(
          assemblyOptions(root, { appDist: "../outside" }),
        ),
      "PACKAGE_INPUT_INVALID",
    );
    for (const overrides of [
      { stagingDirectory: "scratch/stage" },
      { zipFile: "scratch/archive.zip" },
    ]) {
      await expectCode(
        () => assemblePortablePackage(assemblyOptions(root, overrides)),
        "PACKAGE_INPUT_INVALID",
      );
    }
  });
});

test("symlinked input is rejected when the OS permits the fixture", async (t) => {
  await withFixture(async ({ root }) => {
    const outside = join(root, "outside.js");
    await writeFile(outside, "outside");
    const link = join(root, "apps", "studio", "dist", "assets", "linked.js");
    try {
      await symlink(outside, link, "file");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
        t.skip("Windows symlink privilege unavailable");
        return;
      }
      throw error;
    }
    await expectCode(
      () => assemblePortablePackage(assemblyOptions(root)),
      "PACKAGE_TREE_INVALID",
    );
  });
});

test("checksum verification rejects tamper, extra, missing, duplicate, and malformed entries", async () => {
  await withFixture(async ({ root }) => {
    await assemblePortablePackage(assemblyOptions(root));
    const packageRoot = join(
      root,
      "artifacts",
      "portable-web-demo",
      "win-x64",
      "AetherTwin-Preview",
    );
    const manifestBytes = await readFile(join(packageRoot, "SHA256SUMS.txt"));
    await writeFile(join(packageRoot, "app", "assets", "app-12345678.js"), "tampered");
    await expectCode(
      () =>
        validateChecksumManifest({
          repositoryRoot: root,
          packageRoot: PACKAGE_RELATIVE,
          manifestBytes,
        }),
      "PACKAGE_HASH_INVALID",
    );
  });

  await withFixture(async ({ root }) => {
    await assemblePortablePackage(assemblyOptions(root));
    const packageRoot = join(
      root,
      "artifacts",
      "portable-web-demo",
      "win-x64",
      "AetherTwin-Preview",
    );
    const manifestBytes = await readFile(join(packageRoot, "SHA256SUMS.txt"));
    await writeFile(join(packageRoot, "extra.txt"), "extra");
    await expectCode(
      () =>
        validateChecksumManifest({
          repositoryRoot: root,
          packageRoot: PACKAGE_RELATIVE,
          manifestBytes,
        }),
      "PACKAGE_HASH_INVALID",
    );
    const text = manifestBytes.toString("utf8");
    const first = text.split("\n")[0];
    await expectCode(
      () =>
        validateChecksumManifest({
          repositoryRoot: root,
          packageRoot: PACKAGE_RELATIVE,
          manifestBytes: Buffer.from(`${text}${first}\n`),
        }),
      "PACKAGE_HASH_INVALID",
    );
    await expectCode(
      () =>
        validateChecksumManifest({
          repositoryRoot: root,
          packageRoot: PACKAGE_RELATIVE,
          manifestBytes: Buffer.from("not-a-digest  app/index.html\n"),
        }),
      "PACKAGE_HASH_INVALID",
    );
  });
});

test("ZIP32 writer rejects invalid names and oversized declared bounds", () => {
  assert.throws(
    () =>
      createZip32({
        entries: [{ name: "../escape", bytes: Buffer.from("x") }],
        builtAtUtc: BUILT_AT,
      }),
    (error) => error instanceof PortablePackageError && error.message === "PACKAGE_ZIP_FAILED",
  );
  for (const limits of [
    { entryCount: 65_536, entrySize: 0, archiveOffset: 0, centralSize: 0 },
    { entryCount: 1, entrySize: 0x1_0000_0000, archiveOffset: 0, centralSize: 0 },
    { entryCount: 1, entrySize: 0, archiveOffset: 0x1_0000_0000, centralSize: 0 },
    { entryCount: 1, entrySize: 0, archiveOffset: 0, centralSize: 0x1_0000_0000 },
  ]) {
    assert.throws(
      () => assertZip32Bounds(limits),
      (error) => error instanceof PortablePackageError && error.message === "PACKAGE_ZIP_FAILED",
    );
  }
});

test("CLI uses only the fixed Windows x64 child sequence with shell false", async () => {
  await withFixture(async ({ root }) => {
    const calls = [];
    const result = await runPortablePackage({
      args: [],
      platform: "win32",
      architecture: "x64",
      repositoryRoot: root,
      environment: { SOURCE_DATE_EPOCH: "0" },
      now: () => new Date(BUILT_AT),
      readSourceCommit: async () => COMMIT,
      runChild: async (call) => {
        calls.push(call);
        return { code: 0 };
      },
    });
    assert.deepEqual(calls, [
      {
        executable: "pnpm.cmd",
        args: ["--filter", "@aethertwin/studio", "build:web-demo"],
        cwd: root,
        shell: false,
        stdio: "inherit",
      },
      {
        executable: "cargo",
        args: [
          "build",
          "--release",
          "--target",
          "x86_64-pc-windows-msvc",
          "-p",
          "aethertwin-web-demo-host",
        ],
        cwd: root,
        shell: false,
        stdio: "inherit",
      },
    ]);
    assert.equal(result.buildInfo.builtAtUtc, "1970-01-01T00:00:00.000Z");
  });
});

test("CLI rejects arguments/platform drift and redacts child failures", async () => {
  const calls = [];
  const base = {
    args: [],
    platform: "win32",
    architecture: "x64",
    repositoryRoot: "C:/untrusted-secret-root",
    environment: {},
    now: () => new Date(BUILT_AT),
    readSourceCommit: async () => COMMIT,
    runChild: async (call) => {
      calls.push(call);
      return { code: 0 };
    },
  };
  await expectCode(
    () => runPortablePackage({ ...base, args: ["--root", "C:/escape"] }),
    "PACKAGE_INPUT_INVALID",
  );
  await expectCode(
    () => runPortablePackage({ ...base, platform: "linux" }),
    "PACKAGE_INPUT_INVALID",
  );
  await expectCode(
    () => runPortablePackage({ ...base, architecture: "arm64" }),
    "PACKAGE_INPUT_INVALID",
  );
  assert.deepEqual(calls, []);

  await withFixture(async ({ root }) => {
    await expectCode(
      () =>
        runPortablePackage({
          ...base,
          repositoryRoot: root,
          runChild: async () => ({
            code: 7,
            stderr: "C:/private/untrusted-output",
          }),
        }),
      "PACKAGE_BUILD_FAILED",
    );
    await expectCode(
      () =>
        runPortablePackage({
          ...base,
          repositoryRoot: root,
          runChild: async () => {
            throw new Error("spawn failed at C:/private/path");
          },
        }),
      "PACKAGE_BUILD_FAILED",
    );
  });
});
