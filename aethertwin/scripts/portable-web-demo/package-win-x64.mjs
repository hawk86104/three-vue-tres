import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PortablePackageError,
  assemblePortablePackage,
  resolveBuiltAtUtc,
} from "./assemble.mjs";

const WEB_BUILD = Object.freeze({
  executable: "pnpm.cmd",
  args: ["--filter", "@aethertwin/studio", "build:web-demo"],
});
const HOST_BUILD = Object.freeze({
  executable: "cargo",
  args: [
    "build",
    "--release",
    "--target",
    "x86_64-pc-windows-msvc",
    "-p",
    "aethertwin-web-demo-host",
  ],
});
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..", "..");

function inputError(cause) {
  return new PortablePackageError(
    "PACKAGE_INPUT_INVALID",
    cause === undefined ? undefined : { cause },
  );
}

function buildError(cause) {
  return new PortablePackageError(
    "PACKAGE_BUILD_FAILED",
    cause === undefined ? undefined : { cause },
  );
}

function defaultRunChild({ executable, args, cwd, shell, stdio }) {
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      const isWindowsCommand =
        process.platform === "win32" && executable.toLowerCase().endsWith(".cmd");
      child = spawn(
        isWindowsCommand ? (process.env.ComSpec ?? "cmd.exe") : executable,
        isWindowsCommand ? ["/d", "/s", "/c", executable, ...args] : args,
        { cwd, shell, stdio },
      );
    } catch (error) {
      reject(error);
      return;
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolvePromise({ code, signal });
    });
  });
}

function defaultReadSourceCommit(repositoryRoot) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "git",
      ["rev-parse", "HEAD"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(stdout.trim());
      },
    );
  });
}

async function runFixedChild(runChild, call) {
  let result;
  try {
    result = await runChild(call);
  } catch (error) {
    throw buildError(error);
  }
  if (
    result === null ||
    typeof result !== "object" ||
    result.code !== 0
  ) {
    throw buildError();
  }
}

export async function runPortablePackage({
  args = process.argv.slice(2),
  platform = process.platform,
  architecture = process.arch,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  environment = process.env,
  now = () => new Date(),
  runChild = defaultRunChild,
  readSourceCommit = () => defaultReadSourceCommit(repositoryRoot),
} = {}) {
  if (
    !Array.isArray(args) ||
    args.length !== 0 ||
    platform !== "win32" ||
    architecture !== "x64"
  ) {
    throw inputError();
  }
  const builtAtUtc = resolveBuiltAtUtc({
    sourceDateEpoch: environment.SOURCE_DATE_EPOCH,
    now,
  });
  const childOptions = {
    cwd: repositoryRoot,
    shell: false,
    stdio: "inherit",
  };
  await runFixedChild(runChild, { ...WEB_BUILD, ...childOptions });
  await runFixedChild(runChild, { ...HOST_BUILD, ...childOptions });

  let sourceCommit;
  try {
    sourceCommit = await readSourceCommit();
  } catch (error) {
    throw buildError(error);
  }
  return assemblePortablePackage({
    repositoryRoot,
    appDist: "apps/studio/dist",
    hostExecutable:
      "target/x86_64-pc-windows-msvc/release/aethertwin-web-demo-host.exe",
    readme: "packaging/web-demo/README.txt",
    notices: "THIRD_PARTY_NOTICES.md",
    stagingDirectory:
      "artifacts/portable-web-demo/win-x64/AetherTwin-Preview",
    zipFile: "artifacts/AetherTwin-Preview-win-x64.zip",
    sourceCommit,
    builtAtUtc,
  });
}

function isDirectExecution() {
  const entry = process.argv[1];
  return (
    typeof entry === "string" &&
    pathToFileURL(resolve(entry)).href === import.meta.url
  );
}

if (isDirectExecution()) {
  runPortablePackage().catch((error) => {
    const safe =
      error instanceof PortablePackageError
        ? error.message
        : "PACKAGE_BUILD_FAILED";
    console.error(safe);
    process.exitCode = 1;
  });
}
