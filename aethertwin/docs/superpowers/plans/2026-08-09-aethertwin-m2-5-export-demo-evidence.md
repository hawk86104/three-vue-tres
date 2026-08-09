# AetherTwin M2.5 Export, Demo, and Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前 Showroom 同步 3D 视图提供项目绑定的 1080p/4K 不透明 PNG 导出、确定性 Showroom Demo 生成器，以及诚实可审计的 M2 收尾证据。

**Architecture:** 浏览器侧 `render-scene-3d` 捕获不可变场景、相机和来源信息，纯 TypeScript `exporter` 完成预检、行翻转、分块、进度和取消；原生侧 `desktop-host` 只协调严格 IPC 与会话生命周期，`project-io` 独占项目路径/暂存/发布，`media-export` 独占流式 PNG 编码与验证。导出是项目外部输出，不进入 ProjectStore、CommandBus、journal、checkpoint、dirty state、undo/redo 或 AssetRecord。

**Tech Stack:** TypeScript 6.0.3、React 19.2.7、Zustand 5.0.14、Three 0.185.1、R3F 9.6.1、Vitest 4.1.10、Tauri 2、Rust 1.94、`png = "=0.18.1"`、SQLite/rusqlite、Node test runner。

## Global Constraints

- 执行基线固定为 `codex/aethertwin-m2@26cc7534ba47d3a518ef385f532056f805ff83dc`；M2.4 closure 为 `0df14ac9`。
- `CURRENT_SCHEMA_VERSION` 保持 3；不新增项目 schema migration 或 SQLite migration。
- Tauri invoke 从 8 个增加到且仅增加到 12 个：`begin_project_export`、`write_project_export_chunk`、`finish_project_export`、`cancel_project_export`。
- desktop capabilities 保持且仅保持现有 2 个；不得新增 filesystem、shell、HTTP、clipboard 或 path reveal 权限。
- 仅支持不透明 PNG：`full-hd = 1920×1080`、`ultra-hd = 3840×2160`；不得静默降级、任意尺寸或透明输出。
- `png` 必须精确锁定 `=0.18.1`；TypeScript exporter 不得依赖 React、Tauri、filesystem、CDN 或远程运行时资源。
- Market 保持纯 2D且不显示 Export；Sandbox 生产路径不模拟成功，必须以 desktop-only 原因禁用 Export。
- 不实现 Player、MP4、`.twinpack`、GLTF、Save As、Open Folder、publish、share、clipboard path、end-user Create Demo 或 Export 之外的新入口。
- camera、view mode、renderer/export status 只能是瞬态 UI 状态；材质、环境和其他业务事实仍只由 ProjectStore 持有。
- 导出结果只返回 `exports/<name>.png` 相对路径、preset、尺寸、PNG 字节数和小写 SHA-256；错误不得泄漏绝对路径、源文件名、SQL、header、RGBA、staging name 或系统原始错误。
- `crates/asset-io/Cargo.toml` 必须保持 SHA256 `9D22219E9F87C64E34BD201446C6CC2DC05EE91372C11C60A0D3FFA692DE7606`，不得恢复、格式化、修改、暂存或提交。
- `crates/desktop-host/Cargo.toml` 必须保持 SHA256 `3713E909384117E3D3E8D63B246642A44FFEA51F90CCAF4D64B4C601B6C5900E`，不得恢复、格式化、修改、暂存或提交。
- local master/origin 的 `57 2` divergence 未解决；不得 rebase、merge、reset、切换 baseline 或代替人工执行最终集成。
- 每个产品任务遵循：先写 RED，经当轮用户批准后运行；最小实现；GREEN/类型或 Rust 验证；`git diff --check`；独立规格与代码审查；只提交该任务文件。
- 未经当轮明确批准，不运行 build、dev、debug、serve、preview、浏览器、Playwright、打包、截图、真实 GPU、视觉正确性或性能验证。
- 失败时只撤销当前任务尚未提交的文件或当前任务提交；不得重置工作树，也不得触碰两个受保护 manifest。

---

## File Ownership Map

| Boundary | Files | Single responsibility |
| --- | --- | --- |
| TypeScript export contract | `packages/exporter/src/contracts.ts`, `presets.ts`, `errors.ts`, `preflight.ts` | 闭合集合类型、preset、错误、来源/GPU/纹理/frame 纯校验 |
| TypeScript streaming/coordinator | `packages/exporter/src/row-chunks.ts`, `coordinator.ts` | 单缓冲区行翻转分块、进度、取消和严格调用顺序 |
| Renderer capture | `packages/render-scene-3d/src/types.ts`, `renderer.ts` | 为现有不可变 capture 加 provenance，继续由 renderer generation 判定有效性 |
| PNG codec | `crates/media-export/src/png_stream.rs`, `validation.rs` | 8-bit sRGB RGBA 流式编码、opaque alpha、结构校验和内容哈希；不接收路径 |
| Project publication | `crates/project-io/src/export_path.rs`, `project_export.rs` | 绑定 `exports/`、命名、staging、fsync、no-overwrite、清理和项目相对结果 |
| Native IPC/lifecycle | `crates/desktop-host/src/export_boundary.rs`, `export_registry.rs`, existing DTO/state/commands/error modules | 严格 JSON/raw headers、每会话一个导出、finish/cancel/close 串行化和安全错误 |
| Desktop adapter | `apps/studio/src/backend/tauri-backend.ts`, `select-backend.ts` | `ProjectExportBackend` 的 Tauri 调用；Sandbox 返回无导出能力 |
| Studio workflow | `plan-toolbar.tsx`, `scene-canvas.tsx`, `export-panel.tsx`, `plan-editor.tsx`, `app.tsx`, `app.css` | 入口、16:9 letterbox、port publication、预设/进度/取消/结果/焦点与锁定 |
| Demo source/tooling | `fixtures/contracts/showroom-demo.v3.json`, `fixtures/assets/showroom-demo/`, `crates/asset-io/examples/` | 固定资产/快照、真实 create/import/commit/checkpoint/reopen/recovery 生成器 |
| Evidence/policy | `tests/*.test.mjs`, `docs/M2_REPORT.md`, milestone docs | 精确 12 commands/2 capabilities/offline/path policy 和实际执行证据 |

## Locked Cross-Task Interfaces

```ts
export interface SceneExportProvenance {
  readonly projectId: string;
  readonly snapshotSequence: number;
  readonly activeFloorId: string;
}

export type ProjectExportPreset = "full-hd" | "ultra-hd";
export type ProjectExportPhase =
  | "preparing-textures"
  | "rendering"
  | "uploading"
  | "encoding-publishing";

export interface ProjectExportProgress {
  readonly phase: ProjectExportPhase;
  readonly sentBytes: number | null;
  readonly totalBytes: number | null;
}

export type ProjectExportDimensions =
  | { readonly preset: "full-hd"; readonly width: 1920; readonly height: 1080 }
  | { readonly preset: "ultra-hd"; readonly width: 3840; readonly height: 2160 };

export type ProjectExportResult = ProjectExportDimensions & {
  readonly relativePath: string;
  readonly byteSize: number;
  readonly sha256: string;
};

export interface ProjectExportBeginRequest {
  readonly provenance: SceneExportProvenance;
  readonly preset: ProjectExportPreset;
}

export type ProjectExportBeginResult = ProjectExportDimensions & {
  readonly exportId: string;
  readonly expectedByteLength: number;
  readonly maxChunkBytes: 1048576;
};

export interface ProjectExportBackend {
  begin(projectPath: string, request: ProjectExportBeginRequest): Promise<ProjectExportBeginResult>;
  writeChunk(projectPath: string, exportId: string, chunkIndex: number, bytes: Uint8Array): Promise<void>;
  finish(projectPath: string, exportId: string): Promise<ProjectExportResult>;
  cancel(projectPath: string, exportId: string): Promise<void>;
}
```

---

### Task 0: Save the approved plan baseline

**Status:** [x] Complete in the plan-only commit created from baseline `26cc7534`.

**Files:**
- Create: `docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md`
- Read only: `docs/superpowers/specs/2026-08-09-aethertwin-m2-5-export-demo-evidence-design.md`

**Interfaces:**
- Consumes: approved M2.5 design and the two protected-manifest hashes.
- Produces: Tasks 1–20, exact dependency order, file ownership, RED/GREEN commands, rollback boundaries and closure gate.

- [x] **Step 1: Record baseline, global constraints, interfaces, file map and tasks**

```text
branch = codex/aethertwin-m2
plan baseline = 26cc7534ba47d3a518ef385f532056f805ff83dc
schema = 3
native commands after M2.5 = 12
desktop capabilities = 2
```

- [x] **Step 2: Verify the plan-only diff**

Run: `git diff --check -- docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md`

Expected: exit code 0 and no whitespace error.

- [x] **Step 3: Verify protected files remain unstaged and unchanged**

```powershell
git diff --cached --name-only
Get-FileHash -Algorithm SHA256 -LiteralPath crates/asset-io/Cargo.toml
Get-FileHash -Algorithm SHA256 -LiteralPath crates/desktop-host/Cargo.toml
```

Expected: cached list contains only the plan at commit time; hashes equal the Global Constraints values.

- [x] **Step 4: Commit the plan alone**

```bash
git add -- docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md
git diff --cached --check
git commit -m "docs: plan AetherTwin M2.5 export evidence"
```

**Do not modify:** product source, tests, lockfiles, manifests, milestone closure documents.

**Acceptance / rollback:** the commit contains exactly this plan. If the plan check fails, amend only this document before committing; do not alter the baseline.

---

### Task 1: Activate the pure TypeScript exporter contract and exact presets

**Files:**
- Delete: `packages/exporter/.gitkeep`
- Create: `packages/exporter/package.json`
- Create: `packages/exporter/tsconfig.json`
- Create: `packages/exporter/src/contracts.ts`
- Create: `packages/exporter/src/errors.ts`
- Create: `packages/exporter/src/presets.ts`
- Create: `packages/exporter/src/presets.test.ts`
- Create: `packages/exporter/src/index.ts`
- Modify: `apps/studio/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/workspace-structure.test.mjs`
- Modify: `tests/offline-source-policy.test.mjs`

**Interfaces:**
- Consumes: `SceneExportProvenance`, `SceneExportPort`, `SceneExportFrame`, `SceneAssetIssue` from `@aethertwin/render-scene-3d`.
- Produces: all locked TypeScript interfaces above; `PROJECT_EXPORT_MAX_CHUNK_BYTES = 1048576`; `projectExportDimensions(preset)`; `parseProjectExportPreset(value)`; `ProjectExportError` with the six stable frontend codes.

- [ ] **Step 1: Write RED policy and preset tests**

```ts
import { describe, expect, it } from "vitest";
import {
  PROJECT_EXPORT_MAX_CHUNK_BYTES,
  parseProjectExportPreset,
  projectExportDimensions,
} from "./index";

describe("project export presets", () => {
  it.each([
    ["full-hd", 1920, 1080, 8_294_400],
    ["ultra-hd", 3840, 2160, 33_177_600],
  ] as const)("maps %s without fallback", (preset, width, height, bytes) => {
    const dimensions = projectExportDimensions(preset);
    expect(dimensions).toEqual({ preset, width, height });
    expect(width * height * 4).toBe(bytes);
    expect(Object.isFrozen(dimensions)).toBe(true);
  });

  it("locks the native chunk ceiling", () => {
    expect(PROJECT_EXPORT_MAX_CHUNK_BYTES).toBe(1_048_576);
  });

  it.each(["full-hd", "ultra-hd"] as const)("parses %s", (preset) => {
    expect(parseProjectExportPreset(preset)).toBe(preset);
  });

  it.each(["", "4k", null, 1])("rejects unsupported preset %j", (value) => {
    expect(() => parseProjectExportPreset(value)).toThrowError(
      expect.objectContaining({ code: "EXPORT_FRAME_INVALID" }),
    );
  });
});
```

Add policy assertions that `packages/exporter/package.json` has only `@aethertwin/render-scene-3d: workspace:*`, Studio has `@aethertwin/exporter: workspace:*`, and exporter source contains no `@tauri-apps`, React import, URL, CDN, filesystem or DOM renderer dependency.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs
pnpm.cmd vitest run packages/exporter/src/presets.test.ts
```

Expected: FAIL because `packages/exporter/package.json` and exports do not exist.

- [ ] **Step 3: Add the package, closed types, errors and presets**

```json
{
  "name": "@aethertwin/exporter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --root ../.. packages/exporter/src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@aethertwin/render-scene-3d": "workspace:*"
  }
}
```

```ts
export const PROJECT_EXPORT_MAX_CHUNK_BYTES = 1_048_576 as const;

const dimensions = Object.freeze({
  "full-hd": Object.freeze({ preset: "full-hd", width: 1920, height: 1080 }),
  "ultra-hd": Object.freeze({ preset: "ultra-hd", width: 3840, height: 2160 }),
} satisfies Readonly<Record<ProjectExportPreset, ProjectExportDimensions>>);

export function projectExportDimensions(
  preset: ProjectExportPreset,
): ProjectExportDimensions {
  const value = dimensions[preset];
  if (value === undefined) throw new ProjectExportError("EXPORT_FRAME_INVALID");
  return value;
}

export function parseProjectExportPreset(value: unknown): ProjectExportPreset {
  if (value === "full-hd" || value === "ultra-hd") return value;
  throw new ProjectExportError("EXPORT_FRAME_INVALID");
}
```

```ts
export type ProjectExportErrorCode =
  | "EXPORT_RENDERER_NOT_READY"
  | "EXPORT_CAPTURE_EXPIRED"
  | "EXPORT_TEXTURE_UNAVAILABLE"
  | "EXPORT_RESOLUTION_UNSUPPORTED"
  | "EXPORT_FRAME_INVALID"
  | "EXPORT_CANCELLED";

export class ProjectExportError extends Error {
  readonly name = "ProjectExportError";
  constructor(
    readonly code: ProjectExportErrorCode,
    readonly details: Readonly<Record<string, unknown>> = Object.freeze({}),
  ) {
    super(code);
  }
}
```

Put the exact locked contracts in `contracts.ts`, re-export them and all renderer types used by callers through `index.ts`, add the workspace dependency to Studio, then update `pnpm-lock.yaml` with the local workspace importer only.

- [ ] **Step 4: Update and verify the lockfile after explicit approval**

Run:

```text
pnpm.cmd install --lockfile-only
pnpm.cmd install --frozen-lockfile
```

Expected: both commands exit 0; no external exporter dependency is downloaded or introduced.

- [ ] **Step 5: Run GREEN and package typecheck after explicit approval**

Run:

```text
node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs
pnpm.cmd vitest run packages/exporter/src/presets.test.ts
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: all tests pass; both typechecks and diff check exit 0.

- [ ] **Step 6: Review and commit**

Review must confirm no React/Tauri/filesystem ownership, exact presets, no range versions, no remote source, and protected manifests absent from staged files.

```bash
git add -- packages/exporter apps/studio/package.json pnpm-lock.yaml tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs
git diff --cached --check
git commit -m "feat: define AetherTwin project export contracts"
```

**Do not modify:** ProjectStore, renderer behavior, Rust workspace, Tauri commands, Sandbox backend behavior.

**Risk / rollback:** the only dependency risk is lockfile drift; revert only Task 1 files and regenerate no alternative versions.

---

### Task 2: Stream bottom-left RGBA as bounded top-left chunks

**Files:**
- Create: `packages/exporter/src/row-chunks.ts`
- Create: `packages/exporter/src/row-chunks.test.ts`
- Modify: `packages/exporter/src/index.ts`

**Interfaces:**
- Consumes: `SceneExportFrame`, `PROJECT_EXPORT_MAX_CHUNK_BYTES`, `ProjectExportError`.
- Produces:

```ts
export async function streamTopLeftRgbaChunks(
  frame: SceneExportFrame,
  maxChunkBytes: number,
  write: (chunkIndex: number, bytes: Uint8Array) => Promise<void>,
): Promise<number>;
```

- [ ] **Step 1: Write RED row-order, boundary and memory tests**

```ts
it("reverses rows while a row crosses chunk boundaries", async () => {
  const chunks: number[][] = [];
  const frame = {
    width: 2,
    height: 3,
    origin: "bottom-left" as const,
    rgba: Uint8Array.from([
      1, 1, 1, 255, 2, 2, 2, 255,
      3, 3, 3, 255, 4, 4, 4, 255,
      5, 5, 5, 255, 6, 6, 6, 255,
    ]),
  };
  const sent = await streamTopLeftRgbaChunks(frame, 5, async (index, bytes) => {
    expect(index).toBe(chunks.length);
    chunks.push([...bytes]);
  });
  expect(sent).toBe(24);
  expect(chunks.flat()).toEqual([
    5, 5, 5, 255, 6, 6, 6, 255,
    3, 3, 3, 255, 4, 4, 4, 255,
    1, 1, 1, 255, 2, 2, 2, 255,
  ]);
});
```

Add named cases for wrong origin, non-safe dimensions, byte-length mismatch, zero/oversized chunk limit, empty write, sequential awaiting, and 4K instrumentation proving the largest temporary allocation is at most 1,048,576 bytes and never `width * height * 4`.

- [ ] **Step 2: Run RED after explicit approval**

Run: `pnpm.cmd vitest run packages/exporter/src/row-chunks.test.ts`

Expected: FAIL with missing `streamTopLeftRgbaChunks` export.

- [ ] **Step 3: Implement one reusable bounded buffer**

```ts
export async function streamTopLeftRgbaChunks(
  frame: SceneExportFrame,
  maxChunkBytes: number,
  write: (chunkIndex: number, bytes: Uint8Array) => Promise<void>,
): Promise<number> {
  assertFrameShape(frame);
  if (
    !Number.isSafeInteger(maxChunkBytes)
    || maxChunkBytes <= 0
    || maxChunkBytes > PROJECT_EXPORT_MAX_CHUNK_BYTES
  ) throw new ProjectExportError("EXPORT_FRAME_INVALID");

  const buffer = new Uint8Array(maxChunkBytes);
  const rowBytes = frame.width * 4;
  let used = 0;
  let sent = 0;
  let chunkIndex = 0;
  for (let sourceRow = frame.height - 1; sourceRow >= 0; sourceRow -= 1) {
    let cursor = sourceRow * rowBytes;
    const rowEnd = cursor + rowBytes;
    while (cursor < rowEnd) {
      const count = Math.min(rowEnd - cursor, buffer.length - used);
      buffer.set(frame.rgba.subarray(cursor, cursor + count), used);
      cursor += count;
      used += count;
      if (used === buffer.length) {
        await write(chunkIndex, buffer.subarray(0, used));
        chunkIndex += 1;
        sent += used;
        used = 0;
      }
    }
  }
  if (used > 0) {
    await write(chunkIndex, buffer.subarray(0, used));
    sent += used;
  }
  return sent;
}
```

`assertFrameShape` must require `origin === "bottom-left"`, positive safe dimensions and exact safe `width * height * 4 === rgba.byteLength` before allocating the chunk buffer.

- [ ] **Step 4: Run GREEN and typecheck after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/exporter/src/row-chunks.test.ts
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
git diff --check
```

Expected: all cases pass; typecheck and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must prove row reversal is global top-to-bottom, row boundaries may cross chunks, indices are zero-based/contiguous, writes are awaited serially, and no second full frame is allocated.

```bash
git add -- packages/exporter/src/row-chunks.ts packages/exporter/src/row-chunks.test.ts packages/exporter/src/index.ts
git diff --cached --check
git commit -m "feat: stream export frames in top-left row order"
```

**Do not modify:** renderer frame origin, Tauri adapter, native encoding, preset dimensions.

**Risk / rollback:** incorrect buffer reuse can corrupt retained asynchronous input; the writer contract is serial and each Promise must resolve only after consuming its view. Revert Task 2 if that contract cannot be demonstrated.

---

### Task 3: Bind immutable renderer captures to project provenance

**Files:**
- Modify: `packages/render-scene-3d/src/types.ts`
- Modify: `packages/render-scene-3d/src/renderer.ts`
- Modify: `packages/render-scene-3d/src/index.ts`
- Modify: `packages/render-scene-3d/src/renderer.test.ts`
- Modify: `packages/render-scene-3d/src/offscreen-render.test.ts`
- Modify: `apps/studio/src/features/plan-editor/scene-canvas.test-support.ts`

**Interfaces:**
- Consumes: current `SceneRendererInput.snapshot`, `activeFloorId`, renderer generation and existing immutable capture registry.
- Produces: `SceneExportProvenance`; required `SceneExportCapture.provenance`; capture validity still tied to the exact renderer generation.

- [ ] **Step 1: Write RED provenance and expiry tests**

```ts
it("freezes provenance from the input that produced the scene", async () => {
  renderer.update(input({ projectId: PROJECT_ID, sequence: 17, floorId: FLOOR_ID }));
  const capture = renderer.exportPort.capture();
  expect(capture.provenance).toEqual({
    projectId: PROJECT_ID,
    snapshotSequence: 17,
    activeFloorId: FLOOR_ID,
  });
  expect(Object.isFrozen(capture.provenance)).toBe(true);
  renderer.update(input({ projectId: PROJECT_ID, sequence: 18, floorId: FLOOR_ID }));
  expect(capture.provenance.snapshotSequence).toBe(17);
});
```

Add exact cases proving capture fails before ready, old capture is rejected after context loss/retry/backend replacement/destroy, required texture IDs and limits are frozen, and offscreen cleanup still restores visible state exactly once.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/render-scene-3d/src/renderer.test.ts packages/render-scene-3d/src/offscreen-render.test.ts
```

Expected: FAIL because `SceneExportCapture.provenance` does not exist.

- [ ] **Step 3: Capture and freeze the exact provenance**

```ts
export interface SceneExportProvenance {
  readonly projectId: string;
  readonly snapshotSequence: number;
  readonly activeFloorId: string;
}

function freezeProvenance(input: SceneRendererInput): SceneExportProvenance {
  return Object.freeze({
    projectId: input.snapshot.project.id,
    snapshotSequence: input.snapshot.sequence,
    activeFloorId: input.activeFloorId,
  });
}
```

Inside the existing capture method, construct:

```ts
const capture = Object.freeze({
  provenance: freezeProvenance(this.currentInput),
  scene: this.currentProjection,
  camera: freezeCamera(this.currentCamera),
  requiredTextureAssetIds: Object.freeze([...this.currentProjection.requiredTextureAssetIds]),
  limits: freezeLimits(this.backend.getLimits()),
});
this.captureGenerations.set(capture, this.backendGeneration);
return capture;
```

Do not derive provenance from later Studio state and do not relax the existing generation comparison in `waitForTextures` or `render`.

- [ ] **Step 4: Run GREEN and focused typechecks after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/render-scene-3d/src/renderer.test.ts packages/render-scene-3d/src/offscreen-render.test.ts apps/studio/src/features/plan-editor/scene-canvas.test.tsx
pnpm.cmd exec tsc -p packages/render-scene-3d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: tests pass; typechecks and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must confirm immutable provenance is from the same projection input, renderer generation expiry remains exact, and no camera/project state is persisted.

```bash
git add -- packages/render-scene-3d/src/types.ts packages/render-scene-3d/src/renderer.ts packages/render-scene-3d/src/index.ts packages/render-scene-3d/src/renderer.test.ts packages/render-scene-3d/src/offscreen-render.test.ts apps/studio/src/features/plan-editor/scene-canvas.test-support.ts
git diff --cached --check
git commit -m "feat: bind scene export captures to project provenance"
```

**Do not modify:** scene projection, camera math, texture ownership, Blob URL lifecycle, visible renderer output.

**Risk / rollback:** a provenance value sourced after projection publication can authorize stale exports; revert Task 3 and keep M2.4 capture API if same-input proof fails.

---

### Task 4: Implement pure export preflight and frame validation

**Files:**
- Create: `packages/exporter/src/preflight.ts`
- Create: `packages/exporter/src/preflight.test.ts`
- Modify: `packages/exporter/src/contracts.ts`
- Modify: `packages/exporter/src/index.ts`

**Interfaces:**
- Consumes: `SceneExportPort.capture()`, current Studio facts, exact presets, capture provenance, limits and asset issues.
- Produces: `ProjectExportContext`, `PreparedProjectExport`, `prepareProjectExport`, `assertProjectExportCurrent`, `validateProjectExportFrame`.

```ts
export interface ProjectExportContext {
  readonly projectPath: string;
  readonly projectId: string;
  readonly snapshotSequence: number;
  readonly activeFloorId: string;
  readonly sessionGeneration: number;
  readonly assetIssues: readonly SceneAssetIssue[];
  readonly isCurrent: () => boolean;
}

export interface PreparedProjectExport {
  readonly capture: SceneExportCapture;
  readonly dimensions: ProjectExportDimensions;
  readonly expectedByteLength: number;
}
```

- [ ] **Step 1: Write RED table-driven preflight tests**

```ts
it("rejects required texture issues with sorted IDs", () => {
  const context = exportContext({
    assetIssues: [
      { assetId: "texture-b", code: "ASSET_CORRUPT" },
      { assetId: "texture-a", code: "ASSET_MISSING" },
    ],
  });
  expect(() => prepareProjectExport(port(["texture-b", "texture-a"]), "full-hd", context))
    .toThrowError(expect.objectContaining({
      code: "EXPORT_TEXTURE_UNAVAILABLE",
      details: { assetIds: ["texture-a", "texture-b"] },
    }));
});
```

Add exact cases for renderer capture failure, project/sequence/floor mismatch, false `isCurrent`, maxTextureSize and maxRenderbufferSize independently below width or height, exact-limit acceptance, unsupported preset input, wrong origin/dimensions/byte length, and safe-integer overflow.

- [ ] **Step 2: Run RED after explicit approval**

Run: `pnpm.cmd vitest run packages/exporter/src/preflight.test.ts`

Expected: FAIL with missing preflight exports.

- [ ] **Step 3: Implement closed preflight checks**

```ts
export function assertProjectExportCurrent(
  capture: SceneExportCapture,
  context: ProjectExportContext,
): void {
  const current = context.isCurrent();
  const provenance = capture.provenance;
  if (
    !current
    || provenance.projectId !== context.projectId
    || provenance.snapshotSequence !== context.snapshotSequence
    || provenance.activeFloorId !== context.activeFloorId
  ) throw new ProjectExportError("EXPORT_CAPTURE_EXPIRED");
}

export function prepareProjectExport(
  port: SceneExportPort,
  preset: ProjectExportPreset,
  context: ProjectExportContext,
): PreparedProjectExport {
  const capture = port.capture();
  assertProjectExportCurrent(capture, context);
  const dimensions = projectExportDimensions(preset);
  const requiredLimit = Math.max(dimensions.width, dimensions.height);
  if (
    capture.limits.maxTextureSize < requiredLimit
    || capture.limits.maxRenderbufferSize < requiredLimit
  ) {
    throw new ProjectExportError("EXPORT_RESOLUTION_UNSUPPORTED", Object.freeze({
      preset,
      maxTextureSize: capture.limits.maxTextureSize,
      maxRenderbufferSize: capture.limits.maxRenderbufferSize,
    }));
  }
  const required = new Set(capture.requiredTextureAssetIds);
  const assetIds = [...new Set(
    context.assetIssues
      .filter((issue) => required.has(issue.assetId))
      .map((issue) => issue.assetId),
  )].sort();
  if (assetIds.length > 0) {
    throw new ProjectExportError(
      "EXPORT_TEXTURE_UNAVAILABLE",
      Object.freeze({ assetIds: Object.freeze(assetIds) }),
    );
  }
  return Object.freeze({
    capture,
    dimensions,
    expectedByteLength: dimensions.width * dimensions.height * 4,
  });
}
```

`validateProjectExportFrame` must require the exact preset dimensions, `origin === "bottom-left"`, exact safe RGBA length, and return the same frame without copying it.

- [ ] **Step 4: Run GREEN and typecheck after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/exporter/src/preflight.test.ts
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
git diff --check
```

Expected: all cases pass; typecheck and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must confirm all required texture failures block export, IDs are stable/sorted, both GPU limits are enforced without fallback, and validation allocates no frame copy.

```bash
git add -- packages/exporter/src/preflight.ts packages/exporter/src/preflight.test.ts packages/exporter/src/contracts.ts packages/exporter/src/index.ts
git diff --cached --check
git commit -m "feat: validate project export captures"
```

**Do not modify:** texture resolution itself, renderer state, native calls, UI.

**Risk / rollback:** checking only one GPU limit can make 4K fail after native begin; revert Task 4 if the independent-limit tests do not fail before begin.

---

### Task 5: Coordinate export progress, cancellation and late-result rejection

**Files:**
- Create: `packages/exporter/src/coordinator.ts`
- Create: `packages/exporter/src/coordinator.test.ts`
- Modify: `packages/exporter/src/contracts.ts`
- Modify: `packages/exporter/src/index.ts`

**Interfaces:**
- Consumes: Tasks 1–4, `SceneExportPort`, `ProjectExportBackend`.
- Produces:

```ts
export interface StartProjectExportRequest {
  readonly port: SceneExportPort;
  readonly preset: ProjectExportPreset;
  readonly context: ProjectExportContext;
  readonly onProgress: (progress: ProjectExportProgress) => void;
}

export interface ProjectExportOperation {
  readonly result: Promise<ProjectExportResult>;
  cancel(): Promise<void>;
}

export interface ProjectExportCoordinator {
  start(request: StartProjectExportRequest): ProjectExportOperation;
}

export function createProjectExportCoordinator(
  backend: ProjectExportBackend,
): ProjectExportCoordinator;
```

- [ ] **Step 1: Write RED ordering, progress and cancellation tests**

```ts
it("runs the approved source-to-publication order", async () => {
  const events: string[] = [];
  const operation = createProjectExportCoordinator(fakeBackend(events)).start({
    port: fakePort(events),
    preset: "full-hd",
    context: exportContext(),
    onProgress: (value) => events.push(`progress:${value.phase}`),
  });
  await expect(operation.result).resolves.toMatchObject({
    preset: "full-hd",
    relativePath: "exports/demo-full-hd.png",
  });
  expect(events).toEqual([
    "capture",
    "progress:preparing-textures",
    "textures",
    "begin",
    "progress:rendering",
    "render",
    "progress:uploading",
    "write:0",
    "progress:uploading",
    "progress:encoding-publishing",
    "finish",
  ]);
});
```

Add cases for one active operation, cancellation before begin, during texture wait, during render, during upload and during finish; native cancel awaited once after begin; late texture/frame/progress/finish discarded; session/project/floor/renderer generation change; begin/render/write/finish failures; no chunk after cancellation; exact sent/total bytes only during upload; no invented percentage in other phases.

- [ ] **Step 2: Run RED after explicit approval**

Run: `pnpm.cmd vitest run packages/exporter/src/coordinator.test.ts`

Expected: FAIL with missing `createProjectExportCoordinator`.

- [ ] **Step 3: Implement a single-active coordinator**

```ts
class DefaultProjectExportCoordinator implements ProjectExportCoordinator {
  private active: ActiveOperation | null = null;

  constructor(private readonly backend: ProjectExportBackend) {}

  start(request: StartProjectExportRequest): ProjectExportOperation {
    if (this.active !== null) throw new ProjectExportError("EXPORT_RENDERER_NOT_READY");
    const active = new ActiveOperation(this.backend, request, () => {
      if (this.active === active) this.active = null;
    });
    this.active = active;
    active.run();
    return active.publicOperation;
  }
}
```

The `ActiveOperation.run()` body must execute this exact awaited sequence:

```ts
const prepared = prepareProjectExport(request.port, request.preset, request.context);
progress("preparing-textures", null, null);
await request.port.waitForTextures(prepared.capture);
assertLive();
const begun = await backend.begin(request.context.projectPath, {
  provenance: prepared.capture.provenance,
  preset: request.preset,
});
exportId = begun.exportId;
validateBeginResult(begun, prepared);
progress("rendering", null, null);
const frame = validateProjectExportFrame(
  await request.port.render(prepared.capture, prepared.dimensions),
  prepared.dimensions,
);
assertLive();
progress("uploading", 0, begun.expectedByteLength);
await streamTopLeftRgbaChunks(frame, begun.maxChunkBytes, async (index, bytes) => {
  assertLive();
  await backend.writeChunk(request.context.projectPath, begun.exportId, index, bytes);
  sentBytes += bytes.byteLength;
  progress("uploading", sentBytes, begun.expectedByteLength);
});
assertLive();
progress("encoding-publishing", null, null);
resolve(await backend.finish(request.context.projectPath, begun.exportId));
```

`cancel()` sets the terminal cancelled flag immediately; if `exportId` exists it awaits one idempotent `backend.cancel`; every awaited boundary calls `assertLive`; non-cancellation failure also cancels a begun native session before rejecting; completion clears the coordinator slot exactly once.

- [ ] **Step 4: Run GREEN and typecheck after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/exporter/src/coordinator.test.ts packages/exporter/src/preflight.test.ts packages/exporter/src/row-chunks.test.ts
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
git diff --check
```

Expected: all tests pass; typecheck and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must trace every await, prove native cancel is idempotent/awaited, prove late values cannot publish or emit progress, and prove ordinary project edits after native begin do not rewrite the immutable capture.

```bash
git add -- packages/exporter/src/coordinator.ts packages/exporter/src/coordinator.test.ts packages/exporter/src/contracts.ts packages/exporter/src/index.ts
git diff --cached --check
git commit -m "feat: coordinate cancellable project exports"
```

**Do not modify:** React UI, native adapter, renderer resources, ProjectStore.

**Risk / rollback:** cancellation races are the highest TypeScript risk. Revert Task 5 if any test observes a post-cancel write, finish, progress or result.

---
### Task 6: Activate `media-export` with streaming opaque sRGB PNG encoding

**Files:**
- Delete: `crates/media-export/.gitkeep`
- Create: `crates/media-export/Cargo.toml`
- Create: `crates/media-export/src/lib.rs`
- Create: `crates/media-export/src/error.rs`
- Create: `crates/media-export/src/png_stream.rs`
- Create: `crates/media-export/src/validation.rs`
- Create: `crates/media-export/tests/png_stream.rs`
- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `tests/workspace-structure.test.mjs`
- Modify: `tests/offline-source-policy.test.mjs`

**Interfaces:**
- Consumes: `png = "=0.18.1"`, workspace `sha2`, `thiserror`, `std::io::{Read, Seek, Write}`.
- Produces:

```rust
pub const PNG_STREAM_BUFFER_BYTES: usize = 65_536;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PngDimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PngSummary {
    pub byte_size: u64,
    pub sha256: String,
}

pub struct PngRgbaStream<W: std::io::Write>;

impl<W: std::io::Write> PngRgbaStream<W> {
    pub fn new(output: W, dimensions: PngDimensions) -> Result<Self, MediaExportError>;
    pub fn expected_raw_bytes(&self) -> u64;
    pub fn written_raw_bytes(&self) -> u64;
    pub fn write_rgba(&mut self, bytes: &[u8]) -> Result<(), MediaExportError>;
    pub fn finish(self) -> Result<(), MediaExportError>;
}

pub fn validate_png_and_hash<R: std::io::Read + std::io::Seek>(
    reader: &mut R,
    expected: PngDimensions,
) -> Result<PngSummary, MediaExportError>;
```

- [ ] **Step 1: Write RED codec tests**

```rust
#[test]
fn streams_opaque_rgba_as_eight_bit_srgb_png() {
    let target = tempfile::NamedTempFile::new().unwrap();
    let dimensions = PngDimensions { width: 2, height: 2 };
    let pixels = [
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 255, 255, 255, 255,
    ];
    let mut stream = PngRgbaStream::new(target.reopen().unwrap(), dimensions).unwrap();
    stream.write_rgba(&pixels[..5]).unwrap();
    stream.write_rgba(&pixels[5..]).unwrap();
    stream.finish().unwrap();
    let mut png_file = target.reopen().unwrap();
    let summary = validate_png_and_hash(&mut png_file, dimensions).unwrap();
    assert!(summary.byte_size > 8);
    assert_eq!(summary.sha256.len(), 64);
    assert_eq!(decode_rgba(target.path()), pixels);
}
```

Add named tests for zero/overflow dimensions, empty chunks, alpha not equal to 255 at every global RGBA offset including a chunk boundary, overrun, underrun, write failure, encoder finish failure, PNG signature, IHDR dimensions, color type RGBA, bit depth 8, sRGB chunk, deterministic hash and tampered structure.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs
cargo test -p media-export --test png_stream
```

Expected: FAIL because `media-export` is not a workspace crate.

- [ ] **Step 3: Add the exact crate and stream encoder**

```toml
[package]
name = "media-export"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
png.workspace = true
sha2.workspace = true
thiserror.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

Update the root workspace to include `crates/media-export` and add exactly:

```toml
png = "=0.18.1"
```

The constructor configures the encoder before consuming it:

```rust
let mut encoder = png::Encoder::new(output, dimensions.width, dimensions.height);
encoder.set_color(png::ColorType::Rgba);
encoder.set_depth(png::BitDepth::Eight);
encoder.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
let writer = encoder
    .write_header()
    .map_err(|_| MediaExportError::EncodeFailed)?
    .into_stream_writer_with_size(PNG_STREAM_BUFFER_BYTES)
    .map_err(|_| MediaExportError::EncodeFailed)?;
```

Before every `write_all`, calculate the cumulative end with `checked_add`, reject bytes whose global offset modulo four is three and whose value is not 255, and reject cumulative bytes above `width * height * 4`. `finish` requires exact equality, then consumes `StreamWriter::finish()`; no path is accepted or resolved in this crate.

`validate_png_and_hash` seeks to zero, hashes the complete encoded stream, seeks again, validates PNG signature/IHDR/RGBA/8-bit/sRGB and rejects trailing structural corruption; it returns no filename or path.

- [ ] **Step 4: Update the lock and run GREEN after explicit approval**

Run:

```text
cargo test -p media-export --test png_stream
cargo check -p media-export --all-targets
node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs
cargo fmt --all -- --check
git diff --check
```

Expected: codec tests decode exact pixels; policy tests, Cargo check, rustfmt check and diff check pass; `Cargo.lock` resolves `png 0.18.1` exactly.

- [ ] **Step 5: Review and commit**

Review must confirm streaming encode, global alpha offsets, exact raw accounting, no path ownership, no full-frame buffer, and no dependency change to the protected manifests.

```bash
git add -- Cargo.toml Cargo.lock crates/media-export tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs
git diff --cached --check
git commit -m "feat: stream opaque sRGB PNG exports"
```

**Do not modify:** project paths, Tauri, Studio, protected manifests.

**Risk / rollback:** the principal risk is a codec API/lifetime mismatch. Use `Writer::into_stream_writer_with_size`, never unsafe lifetime extension; revert Task 6 if ownership cannot remain safe.

---
### Task 7: Bind export names, staging and cleanup to the project `exports/` directory

**Files:**
- Create: `crates/project-io/src/export_path.rs`
- Create: `crates/project-io/tests/export_path.rs`
- Modify: `crates/project-io/src/lib.rs`
- Modify: `crates/project-io/src/error.rs`
- Modify: `crates/project-io/src/paths.rs`

**Interfaces:**
- Consumes: existing verified project-directory and regular-file/reparse defenses.
- Produces internal `BoundExportsDirectory`, public `ProjectExportSeed`, deterministic sanitization and cleanup entry point.

```rust
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectExportSeed {
    pub export_id: uuid::Uuid,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub fn sanitize_project_export_stem(project_name: &str, project_id: uuid::Uuid) -> String;
pub fn cleanup_project_export_staging(project_path: &std::path::Path)
    -> Result<(), ProjectIoError>;
```

- [ ] **Step 1: Write RED naming and path-safety tests**

```rust
#[test]
fn sanitizes_and_suffixes_without_overwrite() {
    assert_eq!(
        sanitize_project_export_stem(" Demo<>:\"/\\|?*... ", project_id()),
        "Demo-"
    );
    assert_eq!(
        export_leaf("Demo", fixed_time(), ProjectExportPreset::FullHd, 0),
        "Demo-20260809T123456789Z-full-hd.png"
    );
    assert_eq!(
        export_leaf("Demo", fixed_time(), ProjectExportPreset::FullHd, 1),
        "Demo-20260809T123456789Z-full-hd-1.png"
    );
}
```

Add cases for control characters, replacement-run collapse, trailing dots/spaces, empty fallback `aethertwin-<first-eight-project-id-hex>`, UTF-8 boundary truncation to 80 bytes, collision first-absent selection, pre-existing destination preservation, staging prefix isolation, non-regular entries, symlink/reparse refusal, identity mismatch, cleanup limited to verified matching staging files, and project-relative forward-slash result.

- [ ] **Step 2: Run RED after explicit approval**

Run: `cargo test -p project-io --test export_path`

Expected: FAIL with missing export path API.

- [ ] **Step 3: Implement exact sanitization and bound directory operations**

```rust
const EXPORT_STAGE_PREFIX: &str = ".aethertwin-export-";
const EXPORT_STEM_MAX_UTF8_BYTES: usize = 80;

pub fn sanitize_project_export_stem(project_name: &str, project_id: Uuid) -> String {
    let mut output = String::new();
    let mut replacing = false;
    for character in project_name.chars() {
        let forbidden = character.is_control() || r#"<>:"/\|?*"#.contains(character);
        if forbidden {
            if !replacing && !output.is_empty() { output.push('-'); }
            replacing = true;
        } else {
            output.push(character);
            replacing = false;
        }
    }
    while output.ends_with('.') || output.ends_with(' ') { output.pop(); }
    while output.len() > EXPORT_STEM_MAX_UTF8_BYTES { output.pop(); }
    if output.is_empty() {
        format!("aethertwin-{}", &project_id.simple().to_string()[..8])
    } else {
        output
    }
}
```

`BoundExportsDirectory::bind` must derive only `<verified project>/exports`, create it if absent, reopen/verify directory identity, and never accept a caller-provided output leaf. Stage creation uses `create_new`; publication uses a no-replace primitive and retries suffixes beginning at `-1`. Cleanup enumerates only the bound directory and removes only verified regular files whose complete leaf starts with `EXPORT_STAGE_PREFIX`; unexpected types return a safe error without following them.

- [ ] **Step 4: Run GREEN and platform-focused checks after explicit approval**

Run:

```text
cargo test -p project-io --test export_path
cargo check -p project-io --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: all portable tests pass. If the existing Windows environment cannot create privileged reparse fixtures, only that named test is recorded ignored with the same documented privilege reason; ordinary symlink/regular-file defenses still pass.

- [ ] **Step 5: Review and commit**

Review must confirm no arbitrary path input, no overwrite open mode, safe UTF-8 truncation, suffix begins at `-1`, cleanup cannot escape/follow links, and all errors redact paths.

```bash
git add -- crates/project-io/src/export_path.rs crates/project-io/src/lib.rs crates/project-io/src/error.rs crates/project-io/src/paths.rs crates/project-io/tests/export_path.rs
git diff --cached --check
git commit -m "feat: bind export publication to AetherTwin projects"
```

**Do not modify:** schema, database, journal, checkpoint, asset paths, native commands.

**Risk / rollback:** path traversal and no-overwrite errors are blocking. Revert Task 7 entirely if any link/collision test can alter an existing file.

---
### Task 8: Implement the project-bound streaming export operation

**Files:**
- Create: `crates/project-io/src/project_export.rs`
- Create: `crates/project-io/tests/project_export.rs`
- Modify: `crates/project-io/Cargo.toml`
- Modify: `crates/project-io/src/lib.rs`
- Modify: `crates/project-io/src/error.rs`

**Interfaces:**
- Consumes: Tasks 6 and 7, `ProjectSnapshot`, `ProjectProfile::Showroom`.
- Produces:

```rust
pub const PROJECT_EXPORT_MAX_CHUNK_BYTES: usize = 1_048_576;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectExportPreset { FullHd, UltraHd }

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectExportResult {
    pub preset: ProjectExportPreset,
    pub width: u32,
    pub height: u32,
    pub relative_path: String,
    pub byte_size: u64,
    pub sha256: String,
}

pub struct ProjectExportOperation;

pub fn begin_project_export(
    project_path: &std::path::Path,
    snapshot: &ProjectSnapshot,
    active_floor_id: uuid::Uuid,
    preset: ProjectExportPreset,
) -> Result<ProjectExportOperation, ProjectIoError>;

pub fn begin_project_export_with_seed(
    project_path: &std::path::Path,
    snapshot: &ProjectSnapshot,
    active_floor_id: uuid::Uuid,
    preset: ProjectExportPreset,
    seed: ProjectExportSeed,
) -> Result<ProjectExportOperation, ProjectIoError>;

impl ProjectExportOperation {
    pub fn export_id(&self) -> uuid::Uuid;
    pub fn preset(&self) -> ProjectExportPreset;
    pub fn width(&self) -> u32;
    pub fn height(&self) -> u32;
    pub fn expected_byte_length(&self) -> u64;
    pub fn next_chunk_index(&self) -> u64;
    pub fn write_chunk(&mut self, index: u64, bytes: &[u8]) -> Result<(), ProjectIoError>;
    pub fn finish(self) -> Result<ProjectExportResult, ProjectIoError>;
    pub fn cancel(self) -> Result<(), ProjectIoError>;
}
```

- [ ] **Step 1: Write RED operation tests**

```rust
#[test]
fn streams_finishes_and_returns_only_project_relative_evidence() {
    let fixture = showroom_project();
    let mut operation = begin_project_export_with_seed(
        fixture.path(),
        fixture.snapshot(),
        fixture.floor_id(),
        ProjectExportPreset::FullHd,
        fixed_seed(),
    ).unwrap();
    let expected = operation.expected_byte_length();
    for (index, bytes) in opaque_chunks(expected, PROJECT_EXPORT_MAX_CHUNK_BYTES).enumerate() {
        operation.write_chunk(index as u64, &bytes).unwrap();
    }
    let result = operation.finish().unwrap();
    assert_eq!(result.relative_path, "exports/Demo-20260809T123456789Z-full-hd.png");
    assert!(!result.relative_path.contains(fixture.path().to_string_lossy().as_ref()));
    assert_eq!(result.width, 1920);
    assert_eq!(result.height, 1080);
    assert_eq!(result.sha256.len(), 64);
}
```

Add cases for Market rejection, project ID/floor membership integrity, both exact preset byte counts, zero/gap/repeat/out-of-order/oversized/overrun chunks, underrun finish, non-opaque alpha, encoder failure, validation failure, publication failure, cancellation, idempotent cleanup, collision suffix and unchanged sequence/checkpoint/recovery/clean-shutdown state.

- [ ] **Step 2: Run RED after explicit approval**

Run: `cargo test -p project-io --test project_export`

Expected: FAIL with missing `project_export` module and dependency.

- [ ] **Step 3: Implement the operation and dependency edge**

Add only this dependency to `crates/project-io/Cargo.toml`:

```toml
media-export = { path = "../media-export" }
```

Preset mapping is closed:

```rust
impl ProjectExportPreset {
    pub const fn dimensions(self) -> (u32, u32) {
        match self {
            Self::FullHd => (1920, 1080),
            Self::UltraHd => (3840, 2160),
        }
    }
}
```

`begin_project_export_with_seed` validates schema v3, Showroom profile, exact active floor membership and a valid RFC4122 export UUID; binds exports, creates one verified stage, starts `PngRgbaStream<File>`, and changes no project metadata. `write_chunk` requires nonempty bytes, `index == next_chunk_index`, `bytes.len() <= 1_048_576`, no total overrun, then advances only after codec write succeeds. Any write failure takes and cancels the internal writer/stage so no later write or finish can act on it.

`finish` requires exact raw total, finalizes codec, reopens/fsyncs the stage, calls `validate_png_and_hash`, fsyncs the exports directory, publishes no-replace and returns a forward-slash relative path. `cancel` removes only the verified matching stage and never a published file.

- [ ] **Step 4: Run GREEN and Rust checks after explicit approval**

Run:

```text
cargo test -p project-io --test project_export
cargo test -p media-export --test png_stream
cargo check -p media-export -p project-io --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: all tests and checks pass; protected manifests retain their hashes.

- [ ] **Step 5: Review and commit**

Review must prove every terminal path releases one stage exactly once, metadata-free export cannot mutate snapshot state, and project-io, not desktop-host, owns every path decision.

```bash
git add -- crates/project-io/Cargo.toml crates/project-io/src/project_export.rs crates/project-io/src/lib.rs crates/project-io/src/error.rs crates/project-io/tests/project_export.rs
git diff --cached --check
git commit -m "feat: publish project-bound PNG exports"
```

**Do not modify:** schema/model serialization, database tables, CommandBus replay, protected manifests.

**Risk / rollback:** a terminal state that leaves `ProjectExportOperation` reusable can publish partial output. Revert Task 8 if exact-once consumption cannot be proven.

---
### Task 9: Parse strict export JSON and raw Tauri chunk requests

**Files:**
- Create: `crates/desktop-host/src/export_boundary.rs`
- Create: `crates/desktop-host/tests/export_boundary.rs`
- Modify: `crates/desktop-host/src/dto.rs`
- Modify: `crates/desktop-host/src/boundary.rs`
- Modify: `crates/desktop-host/src/error.rs`
- Modify: `crates/desktop-host/src/lib.rs`

**Interfaces:**
- Consumes: `tauri::ipc::{InvokeBody, Request}`, UUID and JS-safe integer validators.
- Produces strict native request/response DTOs and `parse_project_export_chunk`.

```rust
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectExportPresetDto {
    FullHd,
    UltraHd,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BeginProjectExportRequestDto {
    pub session_id: String,
    pub project_id: String,
    pub snapshot_sequence: u64,
    pub active_floor_id: String,
    pub preset: ProjectExportPresetDto,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FinishProjectExportRequestDto {
    pub session_id: String,
    pub export_id: String,
}

pub struct ParsedProjectExportChunk<'a> {
    pub session_id: uuid::Uuid,
    pub export_id: uuid::Uuid,
    pub chunk_index: u64,
    pub bytes: &'a [u8],
}
```

- [ ] **Step 1: Write RED strict-boundary tests**

```rust
#[test]
fn parses_only_raw_body_and_three_canonical_headers() {
    let request = raw_request(
        &[1, 2, 3, 255],
        &[
            ("X-Aether-Session-Id", SESSION_ID),
            ("X-Aether-Export-Id", EXPORT_ID),
            ("X-Aether-Chunk-Index", "0"),
            ("content-type", "application/octet-stream"),
        ],
    );
    let parsed = parse_project_export_chunk(&request).unwrap();
    assert_eq!(parsed.session_id.to_string(), SESSION_ID);
    assert_eq!(parsed.export_id.to_string(), EXPORT_ID);
    assert_eq!(parsed.chunk_index, 0);
    assert_eq!(parsed.bytes, &[1, 2, 3, 255]);
}
```

Add exact rejection cases for JSON body, missing/duplicate application headers, unknown `X-Aether-*`, uppercase/noncanonical UUID, `+1`, `01`, whitespace, negative, overflow, empty body and body above 1,048,576 bytes. Add acceptance cases showing unrelated Tauri/internal transport headers are ignored. JSON tests reject missing wrapper, unknown top-level/nested keys, invalid preset and sequence above `9_007_199_254_740_991`.

- [ ] **Step 2: Run RED after explicit approval**

Run: `cargo test -p desktop-host --test export_boundary`

Expected: FAIL because export DTOs and raw parser do not exist.

- [ ] **Step 3: Implement strict parsers without logging request data**

```rust
pub fn parse_project_export_chunk(
    request: &tauri::ipc::Request<'_>,
) -> Result<ParsedProjectExportChunk<'_>, HostError> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if !bytes.is_empty() => bytes.as_slice(),
        _ => return Err(HostError::InvalidIpcPayload),
    };
    if bytes.len() > project_io::PROJECT_EXPORT_MAX_CHUNK_BYTES {
        return Err(HostError::ExportChunkTooLarge);
    }
    let headers = parse_exact_aether_export_headers(request.headers())?;
    Ok(ParsedProjectExportChunk {
        session_id: validate_session_id(headers.session_id)?,
        export_id: validate_export_id(headers.export_id)?,
        chunk_index: parse_canonical_chunk_index(headers.chunk_index)?,
        bytes,
    })
}
```

`parse_exact_aether_export_headers` lowercases header names through `HeaderMap`, permits exactly the three named application headers once each, rejects every other `x-aether-*`, and does not copy/log the body or headers. The JSON DTO `into_native` methods use the existing canonical UUID policy and explicit JS-safe integer bound.

- [ ] **Step 4: Run GREEN and Rust checks after explicit approval**

Run:

```text
cargo test -p desktop-host --test export_boundary
cargo check -p desktop-host --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: all strict cases pass; checks exit 0.

- [ ] **Step 5: Review and commit**

Review must confirm JSON/raw separation, exactly three application headers, canonical integers, safe bounds and zero sensitive-data logging.

```bash
git add -- crates/desktop-host/src/export_boundary.rs crates/desktop-host/tests/export_boundary.rs crates/desktop-host/src/dto.rs crates/desktop-host/src/boundary.rs crates/desktop-host/src/error.rs crates/desktop-host/src/lib.rs
git diff --cached --check
git commit -m "feat: validate native export IPC boundaries"
```

**Do not modify:** Tauri command list, AppService session behavior, capabilities, protected manifest.

**Risk / rollback:** accepting JSON for chunk bytes or treating internal headers as application metadata breaks the protocol. Revert Task 9 if the pure parser tests cannot distinguish both.

---
### Task 10: Add the exact twelve-command native export surface and success path

**Files:**
- Create: `crates/desktop-host/src/export_registry.rs`
- Create: `crates/desktop-host/tests/project_export.rs`
- Modify: `crates/desktop-host/src/state.rs`
- Modify: `crates/desktop-host/src/commands.rs`
- Modify: `crates/desktop-host/src/lib.rs`
- Modify: `crates/desktop-host/src/registry.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`

**Interfaces:**
- Consumes: Tasks 8 and 9 and the existing tracked `SessionEntry`/lifecycle read lease.
- Produces the four exact commands, per-session one-active registry and success result mapping.

```rust
pub(crate) struct ActiveProjectExport {
    pub(crate) session_id: uuid::Uuid,
    pub(crate) operation: Option<project_io::ProjectExportOperation>,
}

pub(crate) type ActiveProjectExportHandle =
    std::sync::Arc<std::sync::Mutex<ActiveProjectExport>>;
```

- [ ] **Step 1: Write RED native success and command-surface tests**

```rust
#[test]
fn command_surface_is_exactly_twelve_with_one_raw_command() {
    let commands = include_str!("../src/commands.rs");
    assert_eq!(commands.matches("#[tauri::command]").count(), 12);
    for name in [
        "begin_project_export",
        "write_project_export_chunk",
        "finish_project_export",
        "cancel_project_export",
    ] {
        assert_eq!(commands.matches(&format!("fn {name}(")).count(), 1);
    }
    assert_eq!(commands.matches("payload: Option<Value>").count(), 11);
    assert_eq!(commands.matches("request: tauri::ipc::Request<'_>").count(), 1);
}
```

Add a native success test that opens a Showroom project, begins with exact project/sequence/floor, writes contiguous opaque bytes through raw invoke headers, finishes, validates the returned relative result and PNG, and confirms project sequence/checkpoint remain unchanged. Add begin rejection for Market, mismatched project, sequence, floor, session and second active export.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
cargo test -p desktop-host --test command_contract command_surface_is_exactly_twelve_with_one_raw_command
cargo test -p desktop-host --test project_export native_export_success
```

Expected: FAIL because only eight commands exist.

- [ ] **Step 3: Add registry and four handlers**

Add AppService fields initialized in `with_log_sink`:

```rust
project_exports: Mutex<HashMap<Uuid, ActiveProjectExportHandle>>,
project_exports_changed: Condvar,
last_cancelled_exports: Mutex<HashMap<Uuid, Uuid>>,
```

The raw command is the only handler without `payload: Option<Value>`:

```rust
#[tauri::command]
pub fn write_project_export_chunk(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, AppService>,
) -> Result<(), NativeErrorDto> {
    state.write_project_export_chunk(parse_project_export_chunk(&request)?)
}
```

The other handlers pass `payload: Option<Value>` through the existing strict DTO parser. Register all four once in `tauri::generate_handler!`.

`begin_project_export` acquires the lifecycle read lease, looks up the tracked session, locks the session snapshot, validates Showroom/project/sequence/floor, rejects an existing session registry entry, calls `project_io::begin_project_export`, inserts one `Arc<Mutex<_>>`, then returns exact dimensions/expected bytes/max chunk. `write` and `finish` resolve by session plus export ID; finish takes the operation from `Option`, publishes once, removes the same handle from the registry and maps the result without a path prefix.

- [ ] **Step 4: Run GREEN and focused native checks after explicit approval**

Run:

```text
cargo test -p desktop-host --test project_export native_export_success
cargo test -p desktop-host --test command_contract command_surface_is_exactly_twelve_with_one_raw_command
cargo test -p desktop-host --test command_contract tauri_configuration_and_capability_are_exact_and_least_privilege
cargo check -p media-export -p project-io -p desktop-host --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: success path passes; commands are exactly 12; capabilities remain exactly 2; checks exit 0.

- [ ] **Step 5: Review and commit**

Review must trace the session lease, one-active insertion race, exact handle identity removal, raw body command signature, result redaction and unchanged capabilities.

```bash
git add -- crates/desktop-host/src/export_registry.rs crates/desktop-host/src/state.rs crates/desktop-host/src/commands.rs crates/desktop-host/src/lib.rs crates/desktop-host/src/registry.rs crates/desktop-host/tests/project_export.rs crates/desktop-host/tests/command_contract.rs
git diff --cached --check
git commit -m "feat: expose project-bound native PNG export"
```

**Do not modify:** capabilities JSON, protected manifest, schema/database, asset protocol.

**Risk / rollback:** inserting after file creation without atomic registry ownership can permit two operations. Revert Task 10 if concurrent begin does not yield exactly one success.

---
### Task 11: Close native cancellation, failure, recovery and terminal races

**Files:**
- Modify: `crates/desktop-host/src/export_registry.rs`
- Modify: `crates/desktop-host/src/state.rs`
- Modify: `crates/desktop-host/src/error.rs`
- Modify: `crates/desktop-host/tests/project_export.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`
- Modify: `crates/project-io/tests/project_export.rs`

**Interfaces:**
- Consumes: Task 10 registry and existing `close_project`/`close_all` lifecycle write gate.
- Produces idempotent cancel marker per live session; exact terminal winner; close waits for cleanup; stable native codes.

- [ ] **Step 1: Write RED failure and race tests**

```rust
#[test]
fn finish_cancel_and_close_publish_at_most_once() {
    let fixture = active_native_export();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let finish = fixture.spawn_finish(barrier.clone());
    let cancel = fixture.spawn_cancel(barrier.clone());
    barrier.wait();
    let outcomes = [finish.join().unwrap(), cancel.join().unwrap()];
    assert_eq!(outcomes.iter().filter(|outcome| outcome.is_ok()).count(), 1);
    assert!(fixture.published_files().len() <= 1);
    assert!(fixture.staging_files().is_empty());
    fixture.service.close_project(&fixture.session_id).unwrap();
}
```

Add named tests for gap/repeat/out-of-order/empty/oversized/overrun/underrun, cross-session IDs, unknown/completed IDs, duplicate cancel for last-cancelled same session, second cancel after close, finish/finish, finish/cancel, cancel/close, finish/close, close_all with multiple sessions, context failure, encode/publish failure, crash staging cleanup on open/recovery, symlink/reparse/identity mismatch and exactly-once stage removal.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
cargo test -p desktop-host --test project_export export_failure
cargo test -p desktop-host --test project_export export_race
cargo test -p project-io --test project_export cleanup
```

Expected: at least one race/cleanup case fails because terminal coordination is incomplete.

- [ ] **Step 3: Serialize terminal transitions and close cleanup**

Use the per-operation mutex as the sole terminal linearization point:

```rust
enum ExportTerminalAction {
    Finish,
    Cancel,
}

fn take_operation_for_terminal(
    handle: &ActiveProjectExportHandle,
    action: ExportTerminalAction,
) -> Result<project_io::ProjectExportOperation, HostError> {
    let mut active = handle.lock().map_err(|_| HostError::HostStateUnavailable)?;
    active.operation.take().ok_or(match action {
        ExportTerminalAction::Finish => HostError::ExportNotFound,
        ExportTerminalAction::Cancel => HostError::ExportNotFound,
    })
}
```

After taking, exactly one caller owns cleanup/publication. Remove the registry entry only when `Arc::ptr_eq` confirms it is the same handle. A successful same-session cancel writes one bounded `last_cancelled_exports[session_id] = export_id`; duplicate matching cancel returns success; unknown, cross-session or completed ID returns `EXPORT_NOT_FOUND` or `EXPORT_SESSION_MISMATCH` and touches no file. Clear the marker on close.

Before closing a session, take/cancel its active operation, wait on `project_exports_changed` until the session has no entry, then close the ProjectSession. `close_all` performs the same cancellation for every snapshot entry while holding the existing lifecycle write gate. Project open/recovery calls `cleanup_project_export_staging` before publication can begin.

Map stable codes exactly: `EXPORT_ALREADY_ACTIVE`, `EXPORT_NOT_FOUND`, `EXPORT_SESSION_MISMATCH`, `EXPORT_CHUNK_OUT_OF_ORDER`, `EXPORT_CHUNK_TOO_LARGE`, `EXPORT_BYTE_COUNT_MISMATCH`, `EXPORT_ENCODE_FAILED`, `EXPORT_VALIDATION_FAILED`, `EXPORT_PUBLISH_FAILED`. Safe details contain only preset/dimensions/counts/logRef.

- [ ] **Step 4: Run GREEN and native regression checks after explicit approval**

Run:

```text
cargo test -p desktop-host --test project_export
cargo test -p desktop-host --test command_contract
cargo test -p project-io --test project_export
cargo test -p project-io --test create_open
cargo test -p project-io --test commit_recovery
cargo check -p media-export -p project-io -p desktop-host --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: all tests pass except the already documented Windows privileged reparse test if that privilege remains unavailable; no staging residue, duplicate publication or path leakage.

- [ ] **Step 5: Review and commit**

Review must establish one linearization point, close waits, bounded terminal markers, no deadlock order inversion with session lifecycle/asset imports, safe cleanup and redacted errors.

```bash
git add -- crates/desktop-host/src/export_registry.rs crates/desktop-host/src/state.rs crates/desktop-host/src/error.rs crates/desktop-host/tests/project_export.rs crates/desktop-host/tests/command_contract.rs crates/project-io/tests/project_export.rs
git diff --cached --check
git commit -m "fix: harden native export lifecycle races"
```

**Do not modify:** asset import cancellation semantics, project close durability, capability files, protected manifest.

**Risk / rollback:** mutex/condvar lock order is the highest native risk. If review finds a cycle, revert Task 11 and redesign the order before further Studio work.

---
### Task 12: Implement the desktop `ProjectExportBackend` raw-byte adapter

**Files:**
- Modify: `apps/studio/src/backend/tauri-backend.ts`
- Modify: `apps/studio/src/backend/tauri-backend.test.ts`
- Modify: `apps/studio/src/backend/select-backend.ts`
- Modify: `apps/studio/src/app.tsx`
- Create: `apps/studio/src/app.test.tsx`

**Interfaces:**
- Consumes: `ProjectExportBackend`, four native commands, and existing projectPath-to-sessionId tracking.
- Produces `TauriProjectBackend implements ProjectBackend, ProjectExportBackend`; explicit composition result:

```ts
export interface StudioBackendSelection {
  readonly projectBackend: ProjectBackend;
  readonly exportBackend: ProjectExportBackend | null;
}
```

- [ ] **Step 1: Write RED adapter and composition tests**

```ts
it("sends chunk bytes as raw invoke data with exact headers", async () => {
  const backend = openedTauriBackend(PROJECT_PATH, SESSION_ID);
  const bytes = Uint8Array.from([1, 2, 3, 255]);
  await backend.writeChunk(PROJECT_PATH, EXPORT_ID, 7, bytes);
  expect(invoke).toHaveBeenCalledWith(
    "write_project_export_chunk",
    bytes,
    { headers: {
      "X-Aether-Session-Id": SESSION_ID,
      "X-Aether-Export-Id": EXPORT_ID,
      "X-Aether-Chunk-Index": "7",
    } },
  );
});
```

Add exact begin/finish/cancel payload tests, strict response validation, missing/stale projectPath session rejection, safe native error mapping, disposal cancellation behavior, desktop selection returning the same instance as both capabilities, Sandbox selection returning `exportBackend: null`, and App injection that never casts ProjectBackend into export support.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/app.test.tsx
```

Expected: FAIL because `ProjectExportBackend` methods and `StudioBackendSelection` are absent.

- [ ] **Step 3: Implement exact invoke calls and explicit composition**

```ts
export class TauriProjectBackend implements ProjectBackend, ProjectExportBackend {
  async writeChunk(
    projectPath: string,
    exportId: string,
    chunkIndex: number,
    bytes: Uint8Array,
  ): Promise<void> {
    const sessionId = this.requireSessionId(projectPath);
    await invoke("write_project_export_chunk", bytes, { headers: {
      "X-Aether-Session-Id": sessionId,
      "X-Aether-Export-Id": exportId,
      "X-Aether-Chunk-Index": String(chunkIndex),
    } });
  }
}
```

`begin` sends only `{ sessionId, projectId, snapshotSequence, activeFloorId, preset }`; `finish` and `cancel` send only `{ sessionId, exportId }`. Validate every native response key, preset, dimension, safe count, 1,048,576 ceiling, relative `exports/` path and 64-character lowercase hex digest before returning it.

`selectBackend` returns `{ projectBackend: tauri, exportBackend: tauri }` in desktop mode and `{ projectBackend: sandbox, exportBackend: null }` in Sandbox mode. `StudioApp` passes `projectBackend` only to `ProjectStore` and passes the optional export capability separately to PlanEditor; dispose the shared desktop instance once.

- [ ] **Step 4: Run GREEN and Studio typecheck after explicit approval**

Run:

```text
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/app.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
git diff --check
```

Expected: all tests pass; typechecks and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must confirm raw `Uint8Array` is the invoke body, headers are exact, absolute paths never return, Sandbox cannot simulate success, ProjectStore sees only ProjectBackend and shared disposal occurs once.

```bash
git add -- apps/studio/src/backend/tauri-backend.ts apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/backend/select-backend.ts apps/studio/src/app.tsx apps/studio/src/app.test.tsx
git diff --cached --check
git commit -m "feat: connect Studio to native project export"
```

**Do not modify:** SandboxProjectBackend, ProjectStore interface, native protocol names, renderer.

**Risk / rollback:** implicit capability casting could enable false Sandbox success. Revert Task 12 if export support is not represented by explicit nullable composition.

---
### Task 13: Add the Showroom Export action and transient capability policy

**Files:**
- Modify: `packages/mode-showroom/src/tool-policy.ts`
- Modify: `packages/mode-showroom/src/tool-policy.test.ts`
- Modify: `packages/mode-showroom/src/index.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-toolbar.tsx`
- Create: `apps/studio/src/features/plan-editor/plan-toolbar.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `tests/visible-actions.test.mjs`

**Interfaces:**
- Consumes: `ProjectExportBackend | null`, profile, view mode, renderer status and current export-active flag.
- Produces exact Showroom Preview order `2D / 3D / Split / Frame Selection / Frame Route / Export`; no Market action.

```ts
export interface ExportActionState {
  readonly disabled: boolean;
  readonly reason: string | null;
  readonly active: boolean;
}
```

- [ ] **Step 1: Write RED policy and toolbar tests**

```ts
it("shows Export last only for Showroom and explains every disabled state", async () => {
  const onExport = vi.fn();
  const { rerender } = render(toolbar({
    profile: "showroom",
    viewMode: "2d",
    rendererStatus: "ready",
    exportAction: { disabled: true, reason: "Switch to 3D or Split to export.", active: false },
    onExport,
  }));
  const exportButton = screen.getByRole("button", { name: "Export" });
  expect(exportButton).toBeDisabled();
  expect(exportButton).toHaveAccessibleDescription("Switch to 3D or Split to export.");
  rerender(toolbar({ profile: "market", onExport }));
  expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
});
```

Add cases for 3D/split ready enabled, renderer initializing/failed/disabled, missing desktop capability, stale export handle, active operation, focus retention, exact action order and no dormant callback.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/mode-showroom/src/tool-policy.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
node --test tests/visible-actions.test.mjs
```

Expected: FAIL because `export` is not an action and visible-action policy still forbids it.

- [ ] **Step 3: Add the exact action and closed disabled-reason policy**

Append to `ShowroomToolActionId` and the Preview group after `frame-route`:

```ts
action("export", "Export")
```

Extend toolbar props:

```ts
readonly exportAction: ExportActionState;
readonly onExport: (initiator: HTMLButtonElement) => void;
```

Handle the action explicitly:

```ts
case "export":
  onClick = onExport;
  disabled = exportAction.disabled;
  describedBy = exportAction.reason === null ? undefined : exportReasonId;
  break;
```

PlanEditor derives one reason in priority order:

```ts
function exportDisabledReason(input: {
  profile: ProjectProfile;
  backendAvailable: boolean;
  viewMode: SceneViewMode;
  rendererStatus: SceneRendererStatus;
  handleCurrent: boolean;
  active: boolean;
}): string | null {
  if (input.profile !== "showroom") return "Export is available only for Showroom projects.";
  if (!input.backendAvailable) return "PNG export requires the desktop app.";
  if (input.viewMode === "2d") return "Switch to 3D or Split to export.";
  if (input.rendererStatus !== "ready") return "3D preview is not ready.";
  if (!input.handleCurrent) return "3D export capture is not current.";
  if (input.active) return "Another export is already running.";
  return null;
}
```

Render the reason once as an accessible description. Do not show Export for Market and do not create an alternate menu entry.

- [ ] **Step 4: Run GREEN and typechecks after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/mode-showroom/src/tool-policy.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
node --test tests/visible-actions.test.mjs
pnpm.cmd exec tsc -p packages/mode-showroom/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: tests pass; Preview order is exact; typechecks and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must confirm every visible action has a real callback, Market absence, 2D instruction, desktop-only Sandbox reason and no export or Player false affordance.

```bash
git add -- packages/mode-showroom/src/tool-policy.ts packages/mode-showroom/src/tool-policy.test.ts packages/mode-showroom/src/index.ts apps/studio/src/features/plan-editor/plan-toolbar.tsx apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/plan-editor.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx tests/visible-actions.test.mjs
git diff --cached --check
git commit -m "feat: expose the Showroom export action"
```

**Do not modify:** Market tools, ProjectStore, renderer implementation, export panel behavior.

**Risk / rollback:** an enabled action without a current renderer port is a false affordance. Revert Task 13 if `handleCurrent` cannot be proven at click time.

---
### Task 14: Publish the current export port and enforce real 16:9 framing

**Files:**
- Modify: `apps/studio/src/features/plan-editor/scene-canvas.tsx`
- Modify: `apps/studio/src/features/plan-editor/scene-canvas.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/scene-canvas.test-support.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/app.css`

**Interfaces:**
- Consumes: existing `SceneRendererScope`, `SceneRenderer.exportPort`, renderer status and ResizeObserver path.
- Produces:

```ts
export interface SceneCanvasExportHandle {
  readonly scope: SceneRendererScope;
  readonly port: SceneExportPort;
}

export interface SceneCanvasProps {
  readonly onExportHandleChange: (handle: SceneCanvasExportHandle | null) => void;
  readonly exportPanelOpen: boolean;
  readonly interactionLocked: boolean;
}
```

- [ ] **Step 1: Write RED handle, aspect and lifecycle tests**

```tsx
it("publishes only the ready current port and clears it before destroy", async () => {
  const changes: Array<SceneCanvasExportHandle | null> = [];
  const fixture = renderSceneCanvas({ onExportHandleChange: (value) => changes.push(value) });
  await fixture.renderer.resolveInit();
  act(() => fixture.renderer.emitStatus("ready"));
  expect(changes.at(-1)).toMatchObject({
    scope: {
      sessionId: fixture.store.getState().sessionId,
      floorId: fixture.store.getState().activeFloorId,
      generation: fixture.store.getState().rendererGeneration,
    },
    port: fixture.renderer.exportPort,
  });
  fixture.unmount();
  expect(changes.at(-1)).toBeNull();
  expect(fixture.renderer.destroyCount).toBe(1);
});
```

Add exact tests for late init/status/camera after replacement, context loss/retry clearing old handle, floor/session generation replacement, 1600 x 900 and 800 x 450 ResizeObserver inputs while the panel is open, removal of aspect lock on close, split remaining fixed 50/50 with 2D mounted, and pointer/wheel input blocked only while an operation is active.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
pnpm.cmd vitest run apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: FAIL because SceneCanvas has no export handle or framing props.

- [ ] **Step 3: Publish and retire a scope-safe handle**

Inside the active renderer effect, publish only after initialization and current-scope readiness:

```ts
const publishExportHandle = (): void => {
  const state = sessionStore.getState();
  if (disposed || !active.initialized || !scopeCurrent(state, scope)) return;
  onExportHandleChangeRef.current(Object.freeze({
    scope,
    port: renderer.exportPort,
  }));
};
```

Every transition to `failed`, `disabled`, `recovering`, renderer replacement or cleanup first calls `onExportHandleChangeRef.current(null)`. Generation checks reject all late publications. Do not copy or wrap `SceneExportPort`.

Use a dedicated wrapper rather than CSS-transforming the canvas:

```tsx
<div
  className={exportPanelOpen
    ? "studio-scene-viewport studio-scene-viewport--export"
    : "studio-scene-viewport"}
>
  <SceneCanvas interactionLocked={interactionLocked} />
  {interactionLocked ? <div className="studio-scene-input-lock" aria-hidden="true" /> : null}
</div>
```

```css
.studio-scene-viewport--export {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
}
.studio-scene-viewport--export > .studio-scene-canvas {
  width: min(100%, calc(100vh * 16 / 9));
  max-height: 100%;
  aspect-ratio: 16 / 9;
}
.studio-scene-input-lock {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
```

The actual observed host dimensions must be 16:9; do not stretch a non-16:9 render with CSS. In split, keep the existing pane grid at 50/50 and apply this wrapper only inside the 3D half.

- [ ] **Step 4: Run GREEN and typecheck after explicit approval**

Run:

```text
pnpm.cmd vitest run apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: lifecycle/aspect/split tests pass; typecheck and diff check exit 0.

- [ ] **Step 5: Review and commit**

Review must confirm current scope, null-before-destroy ordering, no late handle, real ResizeObserver dimensions, fixed split and input lock without camera persistence.

```bash
git add -- apps/studio/src/features/plan-editor/scene-canvas.tsx apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/scene-canvas.test-support.ts apps/studio/src/features/plan-editor/plan-editor.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/app.css
git diff --cached --check
git commit -m "feat: expose scope-safe 3D export framing"
```

**Do not modify:** R3F rendering math, offscreen target aspect, split ratio, 2D mount lifecycle.

**Risk / rollback:** visual letterboxing that does not change renderer resize is invalid. Revert Task 14 if ResizeObserver does not receive exact 16:9 dimensions.

---
### Task 15: Build the Export panel and connect the cancellable workflow

**Files:**
- Create: `apps/studio/src/features/plan-editor/export-panel.tsx`
- Create: `apps/studio/src/features/plan-editor/export-panel.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test-support.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-toolbar.tsx`
- Modify: `apps/studio/src/features/plan-editor/floor-tree.tsx`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Modify: `apps/studio/src/app.css`

**Interfaces:**
- Consumes: Tasks 5 and 12-14, ProjectStore state, current `SceneCanvasExportHandle`.
- Produces a controlled panel state, one PlanEditor-owned active operation, and a monotonic transient `sessionGeneration` that increments only when `replaceSession` installs a replacement editor session.

```ts
export type StudioExportState =
  | { readonly kind: "idle"; readonly preset: ProjectExportPreset }
  | { readonly kind: "running"; readonly preset: ProjectExportPreset; readonly progress: ProjectExportProgress }
  | { readonly kind: "failed"; readonly preset: ProjectExportPreset; readonly code: string; readonly message: string }
  | { readonly kind: "succeeded"; readonly preset: ProjectExportPreset; readonly result: ProjectExportResult };

export interface StudioExportScope {
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly projectPath: string;
  readonly projectId: string;
  readonly floorId: string;
  readonly rendererGeneration: number;
}

export interface ExportPanelProps {
  readonly state: StudioExportState;
  readonly ultraHdDisabledReason: string | null;
  readonly textureIssueAssetIds: readonly string[];
  readonly onPresetChange: (preset: ProjectExportPreset) => void;
  readonly onStart: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
  readonly onExportAgain: () => void;
}
```

- [ ] **Step 1: Write RED panel, integration and focus tests**

```tsx
it("reports truthful phases and returns focus after awaited cancellation", async () => {
  const backend = new ControlledProjectExportBackend();
  const fixture = renderExportingPlanEditor({ exportBackend: backend });
  await fixture.openThreeDimensionalExport();
  await fixture.startExport("full-hd");
  expect(screen.getByText("Preparing textures")).toBeVisible();
  backend.resolveBegin();
  expect(screen.getByText("Rendering")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(backend.cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("complementary", { name: "Export PNG" })).toBeVisible();
  backend.resolveCancel();
  await waitFor(() => expect(screen.queryByRole("complementary", { name: "Export PNG" })).toBeNull());
  expect(fixture.exportButton).toHaveFocus();
});
```

Add exact tests for two presets only, 4K disabled with actual maxTextureSize/maxRenderbufferSize, required texture IDs sorted, no start on texture issue, real 16:9 open state, exact upload bytes, no percentage in preparing/rendering/encoding, camera/floor/view/preset controls locked only while running, project replacement/unmount/context loss cancellation, late progress/result/focus rejection, failure retry retaining preset, success fields, Export Again, no absolute path/Open Folder/Save As/share/clipboard action, and ordinary project edit after native begin not cancelling the immutable operation.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
pnpm.cmd vitest run apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: FAIL because the panel and coordinator integration do not exist.

- [ ] **Step 3: Implement the controlled panel surface**

Render only the closed preset set:

```tsx
<select
  aria-label="PNG resolution"
  value={state.preset}
  disabled={state.kind === "running"}
  onChange={(event) => onPresetChange(parseProjectExportPreset(event.currentTarget.value))}
>
  <option value="full-hd">Full HD - 1920 x 1080</option>
  <option value="ultra-hd" disabled={ultraHdDisabledReason !== null}>
    Ultra HD - 3840 x 2160
  </option>
</select>
```

Map phases without invented percentage:

```ts
function progressText(progress: ProjectExportProgress): string {
  switch (progress.phase) {
    case "preparing-textures": return "Preparing textures";
    case "rendering": return "Rendering";
    case "uploading": return `Uploading ${progress.sentBytes ?? 0} / ${progress.totalBytes ?? 0} bytes`;
    case "encoding-publishing": return "Encoding and publishing";
  }
}
```

The result view renders only relative path, resolution, byte size, SHA-256, Export Again and Close.

- [ ] **Step 4: Connect a scope-safe coordinator in PlanEditor**

Add `sessionGeneration: number` to `PlanEditorState`, initialize it to `0`, and set it to `state.sessionGeneration + 1` only in `replaceSession`; floor/view/renderer changes do not increment it. Add a focused store test proving a stale generation is distinguishable even if a test supplies the same session ID twice.

At click time, capture the current ProjectStore and renderer scope. Reject the click unless the handle's session/floor/generation exactly matches the current editor state. Construct `ProjectExportContext` with fixed project path/ID/sequence/floor and asset issues. Its `isCurrent` callback checks the captured session ID and generation, project path/ID, active floor, renderer generation and current handle generation; it deliberately does not compare a later snapshot sequence after native begin, so ordinary edits do not invalidate the immutable output. Native begin still validates the exact captured sequence before accepting bytes.

```ts
if (
  exportHandle.scope.sessionId !== sessionState.sessionId
  || exportHandle.scope.floorId !== sessionState.activeFloorId
  || exportHandle.scope.generation !== sessionState.rendererGeneration
) return;

const scope: StudioExportScope = Object.freeze({
  sessionId: sessionState.sessionId,
  sessionGeneration: sessionState.sessionGeneration,
  projectPath,
  projectId: snapshot.project.id,
  floorId: sessionState.activeFloorId,
  rendererGeneration: exportHandle.scope.generation,
});
const exportScopeStillCurrent = (): boolean => {
  const currentProject = store.getState();
  const currentSession = sessionStore.getState();
  const currentHandle = exportHandleRef.current;
  return currentSession.sessionId === scope.sessionId
    && currentSession.sessionGeneration === scope.sessionGeneration
    && currentSession.activeFloorId === scope.floorId
    && currentSession.rendererGeneration === scope.rendererGeneration
    && currentProject.projectPath === scope.projectPath
    && currentProject.snapshot?.project.id === scope.projectId
    && currentHandle?.scope.sessionId === scope.sessionId
    && currentHandle.scope.floorId === scope.floorId
    && currentHandle.scope.generation === scope.rendererGeneration;
};

const preset = exportState.preset;
const operation = coordinator.start({
  port: exportHandle.port,
  preset,
  context: {
    projectPath: scope.projectPath,
    projectId: scope.projectId,
    snapshotSequence: snapshot.sequence,
    activeFloorId: scope.floorId,
    sessionGeneration: scope.sessionGeneration,
    assetIssues: state.assetIssues,
    isCurrent: exportScopeStillCurrent,
  },
  onProgress: (progress) => {
    if (exportScopeStillCurrent()) {
      setExportState({ kind: "running", preset, progress });
    }
  },
});
activeExportRef.current = operation;
```

Opening the panel takes a disposable preview capture only to display current GPU/texture availability; Start always recaptures through the coordinator. While running, disable floor/view/preset controls and set `SceneCanvas.interactionLocked`; do not block normal ProjectStore edits. Closing/Escape/project replacement/unmount calls the same `await operation.cancel()` before panel removal or focus restoration. A monotonically increasing panel generation rejects late callbacks.

- [ ] **Step 5: Run GREEN and focused checks after explicit approval**

Run:

```text
pnpm.cmd vitest run apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/scene-canvas.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
git diff --check
```

Expected: all workflow/lifecycle/accessibility tests pass; typechecks and diff check exit 0.

- [ ] **Step 6: Review and commit**

Review must trace panel generation, awaited cancellation, exact locked controls, immutable edit rule, preview-capture disposal, safe result content, focus and every late callback.

```bash
git add -- apps/studio/src/features/plan-editor/export-panel.tsx apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-editor.test-support.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx apps/studio/src/features/plan-editor/plan-toolbar.tsx apps/studio/src/features/plan-editor/floor-tree.tsx apps/studio/src/features/plan-editor/editor-session.ts apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/app.css
git diff --cached --check
git commit -m "feat: export Showroom views as project PNGs"
```

**Do not modify:** ProjectStore state shape, durable camera data, Market UI, split ratio, renderer asset ownership.

**Risk / rollback:** unawaited cancellation can publish after close; stale scope can update a replacement project. Revert Task 15 if either is observable.

---
### Task 16: Add the deterministic Showroom Demo source fixture and local assets

**Files:**
- Create: `fixtures/contracts/showroom-demo.v3.json`
- Create: `fixtures/assets/showroom-demo/generate-assets.mjs`
- Create: `fixtures/assets/showroom-demo/manifest.json`
- Create: `fixtures/assets/showroom-demo/plan-reference.svg`
- Create: `fixtures/assets/showroom-demo/floor.png`
- Create: `fixtures/assets/showroom-demo/wall.jpg`
- Create: `fixtures/assets/showroom-demo/fixture.svg`
- Create: `tests/showroom-demo.test.mjs`
- Modify: `packages/core-model/src/core-model.test.ts`

**Interfaces:**
- Consumes: schema-v3 parser, seven exact Showroom catalogue kinds and existing asset media contracts.
- Produces one canonical snapshot at `sequence = checkpointSequence = 11`, four deterministic asset files and a SHA-256/media-type/purpose manifest.

**Deterministic ID allocation:**

```text
project/layer:  e2500000-0000-4000-8000-000000000001 .. 0003
rooms/zone:     e2500000-0000-4000-8000-000000000101 .. 0110
walls/openings: e2500000-0000-4000-8000-000000000201 .. 0308
fixtures:       e2500000-0000-4000-8000-000000000401 .. 0422
assets:         e2500000-0000-4000-8000-000000000501 .. 0504
materials:      e2500000-0000-4000-8000-000000000601 .. 0610
hotspots/media: e2500000-0000-4000-8000-000000000701 .. 0730
route:          e2500000-0000-4000-8000-000000000901 .. 0991
```

- [ ] **Step 1: Write RED semantic and asset-manifest tests**

```js
test("Showroom Demo has the exact approved semantic inventory", () => {
  const snapshot = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.sequence, 11);
  assert.equal(snapshot.checkpointSequence, 11);
  assert.equal(snapshot.project.profile, "showroom");
  assert.equal(snapshot.project.floors.length, 1);
  assert.equal(snapshot.project.entities.filter(({ type }) => type === "space-unit").length, 4);
  assert.equal(snapshot.project.entities.filter(({ type }) => type === "zone").length, 1);
  assert.equal(snapshot.project.openings.filter(({ kind }) => kind === "door").length, 4);
  assert.equal(snapshot.project.openings.filter(({ kind }) => kind === "window").length, 4);
  const fixtures = snapshot.project.entities.filter(({ type }) => type === "fixture");
  assert.equal(fixtures.length, 22);
  for (const kind of [
    "display-case", "display-table", "shelf", "checkout",
    "screen", "partition", "signage",
  ]) assert.equal(fixtures.filter((fixture) => fixture.kind === kind).length, 3);
  assert.equal(fixtures.filter((fixture) => fixture.kind === "generic").length, 1);
});
```

Add assertions for one calibrated sanitized SVG plan reference, ten product-hotspot POIs, ten ProductContent records, ten MediaAsset records sharing exactly three content/texture image AssetRecords, one additional plan-reference AssetRecord, three material definitions and floor/wall/fixture assignments, PNG/JPEG/safe-SVG textures, one connected network, one guided route with five ordered stops, soft-light/shadow environment, strict UUID/order stability, manifest hashes and no script/event/remote URL in either SVG.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
node --test tests/showroom-demo.test.mjs
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
```

Expected: FAIL because the fixture and asset manifest do not exist.

- [ ] **Step 3: Generate four fixed local asset files and their manifest**

`generate-assets.mjs` contains literal bytes and overwrites only the four named fixture outputs plus `manifest.json` in its own directory:

```js
const assets = [
  {
    name: "plan-reference.svg",
    mediaType: "image/svg+xml",
    purpose: "calibrated plan reference",
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4f1e8"/><path d="M80 80H1120V720H80Z M600 80V720 M80 400H1120" fill="none" stroke="#52636d" stroke-width="12"/></svg>'),
  },
  {
    name: "floor.png",
    mediaType: "image/png",
    purpose: "space-floor texture and shared content image",
    bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl8sAAAAASUVORK5CYII=", "base64"),
  },
  {
    name: "wall.jpg",
    mediaType: "image/jpeg",
    purpose: "wall texture and shared content image",
    bytes: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64"),
  },
  {
    name: "fixture.svg",
    mediaType: "image/svg+xml",
    purpose: "fixture texture and shared content image",
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#78909c"/><path d="M0 16H64M0 48H64" stroke="#c8d2d8" stroke-width="4"/></svg>'),
  },
];
for (const asset of assets) writeFileSync(join(root, asset.name), asset.bytes);
writeFileSync(
  join(root, "manifest.json"),
  `${JSON.stringify(assets.map((asset) => ({
    file: asset.name,
    sha256: createHash("sha256").update(asset.bytes).digest("hex"),
    mediaType: asset.mediaType,
    purpose: asset.purpose,
  })), null, 2)}\n`,
);
```

The test decodes the complete inline JPEG constant and rejects a truncated byte stream. Run exactly: `node fixtures/assets/showroom-demo/generate-assets.mjs`.

- [ ] **Step 4: Author the canonical schema-v3 snapshot**

The JSON has one floor/layer and the exact ID ranges above. Use four non-overlapping room polygons, one zone, perimeter/interior walls with four valid doors and four valid windows, catalogue durable dimensions for 21 typed fixtures plus one generic fixture, ten hotspots each linked by one ProductContent to one MediaAsset, and distribute the ten MediaAssets deterministically across asset IDs 0502-0504.

Set one complete plan calibration with two distinct source points, `distance = 10000`, `unit = "mm"` and the sanitized plan SVG asset. Use three MaterialDefinitions whose `assetId` values are floor.png, wall.jpg and fixture.svg and assign them to at least one space-floor, one wall and all fixtures. Route node IDs 0901-0905 form a connected chain with positive distances and the guided route stop list contains those five IDs in order. Use the approved soft environment with nonzero key direction and shadows enabled. Arrays are sorted by ID.

- [ ] **Step 5: Run GREEN and fixture policy after explicit approval**

Run:

```text
node --test tests/showroom-demo.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
git diff --check
```

Expected: exact inventory, parser, asset hashes, safe SVG and offline tests pass; typecheck and diff check exit 0.

- [ ] **Step 6: Review and commit**

Review must independently count every entity/record, verify fixture/material/route semantics, decode all assets, recompute hashes, and confirm no binary `.twinproj` or PNG export output is staged.

```bash
git add -- fixtures/contracts/showroom-demo.v3.json fixtures/assets/showroom-demo tests/showroom-demo.test.mjs packages/core-model/src/core-model.test.ts
git diff --cached --check
git commit -m "test: add deterministic AetherTwin Showroom Demo"
```

**Do not modify:** schema, Showroom catalogue, production UI, remote assets, generated project packages.

**Risk / rollback:** fixture drift invalidates evidence. Revert Task 16 if regeneration changes any hash or semantic digest without an approved design change.

---
### Task 17: Materialize the Demo through real create/import/commit/checkpoint/recovery paths

**Files:**
- Create: `crates/asset-io/examples/generate_showroom_demo.rs`
- Create: `crates/asset-io/examples/showroom_demo/support.rs`
- Create: `crates/asset-io/tests/showroom_demo.rs`
- Modify: `crates/project-io/src/model.rs`
- Modify: `crates/project-io/src/project.rs`
- Modify: `crates/project-io/src/lib.rs`
- Modify: `crates/project-io/tests/create_open.rs`

**Interfaces:**
- Consumes: Task 16 fixture/assets, public asset import, ProjectSession commit/checkpoint/close/open/recover.
- Produces a deterministic identity injection used only by developer tooling/tests and one example accepting exactly one destination path.

```rust
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectCreationIdentity {
    pub project_id: uuid::Uuid,
    pub floor_id: uuid::Uuid,
    pub layer_id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub fn create_project_with_identity(
    request: CreateProjectRequest,
    identity: ProjectCreationIdentity,
) -> Result<OpenedProject, ProjectIoError>;
```

- [ ] **Step 1: Write RED identity and materialization tests**

```rust
#[test]
fn materializes_reopens_and_recovers_the_exact_demo_snapshot() {
    let root = tempfile::tempdir().unwrap();
    let destination = root.path().join("AetherTwin Showroom Demo.twinproj");
    let generated = support::generate_showroom_demo(&destination).unwrap();
    assert_eq!(generated, destination);
    let mut reopened = project_io::open_session(&destination, false).unwrap();
    let expected: project_io::ProjectSnapshot =
        serde_json::from_str(include_str!("../../../fixtures/contracts/showroom-demo.v3.json")).unwrap();
    assert_eq!(reopened.snapshot(), &expected);
    reopened.close().unwrap();

    let recovery_root = tempfile::tempdir().unwrap();
    let recovery_project = recovery_root.path().join("recovery-demo.twinproj");
    support::generate_showroom_demo(&recovery_project).unwrap();
    let dirty = project_io::open_session(&recovery_project, false).unwrap();
    drop(dirty);
    let recovered = project_io::recover_project(&recovery_project, true).unwrap();
    assert_eq!(recovered.snapshot, expected);
}
```

Add cases for deterministic project/floor/layer/createdAt, invalid identity, existing destination refusal without alteration, wrong extension, asset hash/media mismatch, import sanitizer rejection, exact 11-operation transaction, checkpoint equality, clean close, semantic digest stability and no extra output beside the requested project.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
cargo test -p project-io --test create_open deterministic_identity
cargo test -p asset-io --test showroom_demo
```

Expected: FAIL because deterministic identity and generator support do not exist.

- [ ] **Step 3: Refactor create into one production-safe identity boundary**

Production remains unchanged:

```rust
pub fn create_project(request: CreateProjectRequest) -> Result<OpenedProject, ProjectIoError> {
    create_project_with_identity(
        request,
        ProjectCreationIdentity {
            project_id: Uuid::new_v4(),
            floor_id: Uuid::new_v4(),
            layer_id: Uuid::new_v4(),
            created_at: Utc::now(),
        },
    )
}
```

`create_project_with_identity` runs the existing validation, exclusive create, manifest/database/checkpoint/fsync path with the supplied IDs/time; it validates three distinct RFC4122 UUIDs and never becomes a Tauri command. Keep all failure cleanup identical to production create.

- [ ] **Step 4: Implement the generator support and exact journal**

The example main accepts exactly one OS path argument, rejects missing/extra arguments and an existing target, then calls:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = std::env::args_os().skip(1);
    let destination = arguments.next().ok_or("one destination path is required")?;
    if arguments.next().is_some() { return Err("exactly one destination path is required".into()); }
    support::generate_showroom_demo(std::path::Path::new(&destination))?;
    Ok(())
}
```

`support::generate_showroom_demo` parses the canonical fixture, calls `create_project_with_identity` with IDs 0001-0003 and `2026-08-09T12:34:56.789Z`, imports the four fixture assets using fixed operation UUIDs and their approved roles, verifies returned hash/media/relative path, then replaces each random imported AssetRecord ID with the canonical fixed ID before committing.

Build one CommitBatch containing exactly 11 sequential JournalOperations in one transaction:

```text
1 entities snapshot.records.patch
2 assets snapshot.records.patch
3 planReferences snapshot.records.patch
4 openings snapshot.records.patch
5 productContents snapshot.records.patch
6 mediaAssets snapshot.records.patch
7 routeNetworks snapshot.records.patch
8 guidedRoutes snapshot.records.patch
9 materials snapshot.records.patch
10 materialAssignments snapshot.records.patch
11 scene.environment.patch
```

Every records payload adds the full sorted target collection from `before: null` to `after: record`; inverse reverses order and values. The environment payload is exact `{ before: initialEnvironment, after: demoEnvironment }` with the inverse swapped. The committed snapshot uses `sequence = 11, checkpointSequence = 0`; checkpoint requests the canonical `sequence = checkpointSequence = 11`. Close, reopen and compare the complete snapshot.

For recovery evidence, perform the same fixed materialization inside a `tempfile::TempDir`, open and drop that probe uncleanly, call confirmed recovery, compare equality, close recovered state and let only the temporary probe be deleted. The requested destination remains clean and contains no export.

- [ ] **Step 5: Run GREEN and generator checks after explicit approval**

Run:

```text
cargo test -p project-io --test create_open deterministic_identity
cargo test -p asset-io --test showroom_demo
cargo check -p asset-io -p project-io --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: deterministic identity, import, 11-operation replay, checkpoint, close/reopen and recovery equality pass; example compiles through `--all-targets`; no protected manifest change.

- [ ] **Step 6: Review and commit**

Review must validate production create equivalence, no Tauri exposure, exact journal inverse/order, fixed asset identities, existing-target refusal, temporary recovery probe containment and absence of committed `.twinproj`.

```bash
git add -- crates/asset-io/examples crates/asset-io/tests/showroom_demo.rs crates/project-io/src/model.rs crates/project-io/src/project.rs crates/project-io/src/lib.rs crates/project-io/tests/create_open.rs
git diff --cached --check
git commit -m "feat: generate the deterministic Showroom Demo"
```

**Do not modify:** protected manifests, production create DTO, schema, Studio routes, committed binary projects.

**Risk / rollback:** changing production create semantics is blocking. Revert Task 17 if random production creation is not byte-for-byte behaviorally equivalent outside supplied identity values.

---
### Task 18: Run a complete M2.5 vertical acceptance with injected rendering

**Files:**
- Create: `packages/exporter/src/m2-5-vertical-acceptance.test.ts`
- Create: `apps/studio/src/features/plan-editor/m2-5-vertical-acceptance.test.tsx`
- Create: `crates/project-io/tests/m2_5_vertical_acceptance.rs`
- Create: `crates/desktop-host/tests/m2_5_vertical_acceptance.rs`
- Modify only if a demonstrated acceptance gap requires it: M2.5 source files from Tasks 1-17

**Interfaces:**
- Consumes: complete TypeScript and native export stacks plus canonical Demo.
- Produces executable evidence across projection capture, orientation/chunking, PNG codec, project publication, Studio state and recovery; injected rendering is explicitly not real-GPU evidence.

- [ ] **Step 1: Write RED end-to-end acceptance tests**

```ts
it.each([
  ["full-hd", 1920, 1080, 8_294_400],
  ["ultra-hd", 3840, 2160, 33_177_600],
] as const)("exports %s with fixed camera and top-left output", async (
  preset, width, height, byteLength,
) => {
  const fixture = verticalExportFixture({ preset, width, height });
  const result = await fixture.coordinator.start(fixture.request).result;
  expect(fixture.port.render).toHaveBeenCalledWith(
    expect.objectContaining({ camera: fixture.camera, provenance: fixture.provenance }),
    { width, height },
  );
  expect(fixture.backend.receivedBytes).toHaveLength(byteLength);
  expect(fixture.backend.receivedBytes.slice(0, 4)).toEqual(fixture.topLeftPixel);
  expect(result).toMatchObject({ preset, width, height });
});
```

Rust acceptance writes deterministic corner/row colors through `AppService`, finishes, decodes the published PNG and asserts top-left/right and bottom-left/right pixels, 8-bit RGBA/sRGB/opaque alpha, relative path/hash, unchanged snapshot sequence, close/reopen equality and no stage file. A second case cancels at every phase and asserts no publication. Studio acceptance exercises Showroom 2D/3D/split, Market absence, 16:9, 4K capability disablement, progress, focus and replacement cancellation using fake renderer/backend.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/exporter/src/m2-5-vertical-acceptance.test.ts apps/studio/src/features/plan-editor/m2-5-vertical-acceptance.test.tsx
cargo test -p project-io --test m2_5_vertical_acceptance
cargo test -p desktop-host --test m2_5_vertical_acceptance
```

Expected: tests compile; any failure identifies a concrete M2.5 acceptance gap. If all pass on first run, record that RED introduced no new missing behavior and do not manufacture a failure.

- [ ] **Step 3: Fix only demonstrated M2.5 gaps**

For every failure, record command, test name, error, owning task and changed file before editing. The permitted repair flow is:

```text
capture/provenance/GPU/frame -> packages/render-scene-3d or packages/exporter
row/progress/cancel -> packages/exporter
PNG bytes/structure/hash -> crates/media-export
path/staging/publication -> crates/project-io
DTO/header/session/race -> crates/desktop-host
action/panel/focus/letterbox -> apps/studio
Demo semantics/persistence -> fixtures or generator
```

Do not broaden the milestone or change a locked interface to make the acceptance test easier.

- [ ] **Step 4: Run GREEN acceptance and focused type/Rust checks after explicit approval**

Run:

```text
pnpm.cmd vitest run packages/exporter/src/m2-5-vertical-acceptance.test.ts apps/studio/src/features/plan-editor/m2-5-vertical-acceptance.test.tsx packages/render-scene-3d/src/renderer.test.ts
pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/render-scene-3d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
cargo test -p media-export
cargo test -p project-io --test m2_5_vertical_acceptance
cargo test -p desktop-host --test m2_5_vertical_acceptance
cargo check -p media-export -p project-io -p asset-io -p desktop-host --all-targets
cargo fmt --all -- --check
git diff --check
```

Expected: all named acceptance/check commands pass, except only the already documented privileged Windows reparse test if still unavailable. The evidence makes no browser/GPU/visual claim.

- [ ] **Step 5: Independent specification and code review**

The reviewer receives the approved design, this plan, Task 18 diff and actual command outputs. Required verdict fields are `Spec Compliance`, `Code Quality`, `Critical`, `Important`, `Minor`, `Ready`. Resolve every Critical/Important finding and rerun the directly affected command; record any accepted Minor with exact reason.

- [ ] **Step 6: Commit vertical acceptance**

```bash
git add -- packages/exporter/src/m2-5-vertical-acceptance.test.ts apps/studio/src/features/plan-editor/m2-5-vertical-acceptance.test.tsx crates/project-io/tests/m2_5_vertical_acceptance.rs crates/desktop-host/tests/m2_5_vertical_acceptance.rs
```

If Step 3 changed source, stage each recorded repair file by its exact path before the following check; never stage a directory or glob.

```bash
git diff --cached --check
git commit -m "test: accept AetherTwin M2.5 export workflow"
```

**Do not modify:** M3 scope, Player, runtime permissions, protected manifests, unrelated pre-existing code.

**Risk / rollback:** a fake renderer can prove contracts but not visual correctness. Revert only Task 18 repairs/tests if they encode behavior outside the approved spec.

---
### Task 19: Document M2.5 policy and assemble truthful M2 evidence

**Files:**
- Create: `docs/M2_REPORT.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/PROJECT_FORMAT.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/DECISIONS.md`
- Modify: `HANDOFF.md`
- Modify: `PLANS.md`
- Modify: `docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md`
- Modify: `tests/workspace-structure.test.mjs`
- Modify: `tests/project-format-policy.test.mjs`
- Modify: `tests/offline-source-policy.test.mjs`
- Modify: `tests/visible-actions.test.mjs`

**Interfaces:**
- Consumes: actual focused command outputs and review verdicts from Tasks 1-18.
- Produces stable architecture/product/format decisions and a report that distinguishes automated contract evidence from unperformed runtime evidence.

- [ ] **Step 1: Write RED documentation-policy tests**

```js
test("M2.5 policy locks export ownership without changing schema", () => {
  const architecture = readFileSync(join(root, "docs/ARCHITECTURE.md"), "utf8");
  const format = readFileSync(join(root, "docs/PROJECT_FORMAT.md"), "utf8");
  const report = readFileSync(join(root, "docs/M2_REPORT.md"), "utf8");
  assert.match(architecture, /render-scene-3d.*exporter.*desktop-host.*project-io.*media-export/is);
  assert.match(format, /schema v3/i);
  assert.match(format, /exports\/.*output/i);
  assert.match(report, /exactly twelve/i);
  assert.match(report, /real GPU.*not verified/i);
});
```

Add policy assertions for exactly 12 commands, exactly 2 capabilities, both protected manifests, two presets, project-relative result, no `.twinproj`/export PNG committed, no Player/Market 3D/export false entry, Demo fixture/generator locations, offline sources, M2.1 durable decisions retained and unresolved `57 2` branch divergence guard retained.

- [ ] **Step 2: Run RED after explicit approval**

Run:

```text
node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs
```

Expected: FAIL because `docs/M2_REPORT.md` and M2.5 policy text are absent.

- [ ] **Step 3: Update long-lived documents without deleting prior decisions**

Record these exact durable facts:

```text
schema: v3
native invoke surface: exactly 12
desktop capabilities: exactly 2
export presets: full-hd 1920x1080; ultra-hd 3840x2160
export result: project-relative exports/<name>.png + dimensions + byteSize + sha256
business state owner: ProjectStore
renderer state owner: transient Studio/R3F
PNG codec owner: media-export
path/publication owner: project-io
Sandbox export capability: absent
Market Export action: absent
```

`PROJECT_FORMAT.md` describes `exports/` as generated output outside schema/journal/checkpoint/AssetRecord semantics, names the private stage prefix, no-overwrite rule and crash cleanup; it does not make exports required project content.

`DECISIONS.md` retains content-addressed publication/undo-not-delete, verified protocol reads, atomic reference/calibration and explicit recovery/shutdown decisions, then appends M2.5 ownership/protocol decisions. `HANDOFF.md` retains `57 2`, no rebase/merge/reset/baseline-change and human integration guard.

- [ ] **Step 4: Write `docs/M2_REPORT.md` from actual evidence**

Use this fixed section order:

```markdown
# AetherTwin M2 Evidence Report
## Scope and explicit exclusions
## M2.1-M2.5 completed capabilities
## Deterministic Showroom Demo inventory and semantic digest
## PNG export contract and publication evidence
## Lifecycle, cancellation and cleanup evidence
## Schema, command, capability, offline and redaction policy
## Commands actually executed
## Failures, repairs and retries
## Independent review verdicts
## Runtime evidence not performed
```

For every command actually run, record date, exact command, exit code, test count when emitted, failure summary, changed files and retry outcome. Never infer a pass. State that injected/fake renderer tests prove request construction, orientation, state restoration, encoding, publication, cancellation and cleanup but do not prove a real GPU frame or visual correctness. If build/browser/GPU/visual execution was not separately authorized and run, state each as not verified.

Mark Tasks 1-19 complete in this plan only after their commits and reviews exist; leave Task 20 unchecked. `PLANS.md` names Task 20 as the only remaining M2 item.

- [ ] **Step 5: Run GREEN policy and document checks after explicit approval**

Run:

```text
node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs tests/showroom-demo.test.mjs
git diff --check
```

Expected: all policy tests pass; diff check exits 0; no build/browser/GPU claim appears.

- [ ] **Step 6: Independent documentation review and commit**

The reviewer checks every number/path/claim against source and actual logs, confirms all prior durable decisions and branch guards remain, and returns no unresolved Critical/Important finding.

```bash
git add -- README.md docs/ARCHITECTURE.md docs/PRODUCT_SPEC.md docs/PROJECT_FORMAT.md docs/ROADMAP.md docs/DECISIONS.md docs/M2_REPORT.md HANDOFF.md PLANS.md docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs
git diff --cached --check
git commit -m "docs: document AetherTwin M2 export evidence"
```

**Do not modify:** AGENTS.md with temporary progress, historical M2.1-M2.4 evidence, protected manifests, generated project/export outputs.

**Risk / rollback:** overstated evidence is a release blocker. Revert Task 19 if any claimed command, test count, runtime result or review cannot be traced to actual output.

---
### Task 20: Run the full non-build gate, final review and M2 closure

**Files:**
- Modify after actual verification: `docs/M2_REPORT.md`
- Modify after actual verification: `README.md`
- Modify after actual verification: `docs/ROADMAP.md`
- Modify after actual verification: `HANDOFF.md`
- Modify after actual verification: `PLANS.md`
- Modify after actual verification: `docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md`
- Modify only when a gate demonstrates an M2.5 regression: the exact failing M2.5 source/test file

**Interfaces:**
- Consumes: all committed Tasks 0-19 and their evidence.
- Produces accepted M2.5/M2 closure with actual complete gate logs, final independent verdict and no unresolved blocking finding.

- [ ] **Step 1: Record the pre-gate repository invariants**

Run read-only checks:

```text
git status --short --branch
git rev-parse HEAD
git diff --cached --name-only
git diff --name-only
```

Run exact source/policy checks:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath crates/asset-io/Cargo.toml
Get-FileHash -Algorithm SHA256 -LiteralPath crates/desktop-host/Cargo.toml
rg -n '#\[tauri::command\]' crates/desktop-host/src/commands.rs
Get-Content -Raw -LiteralPath crates/desktop-host/capabilities/default.json
```

Expected: only the two known protected manifests are unstaged before Task 20 edits; cached diff is empty; hashes match Global Constraints; command count is 12; capability policy remains exactly 2. If another file is dirty, identify ownership before continuing and do not overwrite it.

- [ ] **Step 2: Obtain explicit approval and run the complete gate exactly**

Run in this order and preserve each complete output:

```text
pnpm.cmd install --frozen-lockfile
pnpm.cmd lint
pnpm.cmd typecheck
node --test tests/*.test.mjs
pnpm.cmd vitest run
cargo fmt --all -- --check
cargo test -p media-export -p project-io -p asset-io -p desktop-host
cargo check -p media-export -p project-io -p asset-io -p desktop-host --all-targets
git diff --check
```

Expected: every command exits 0 except only a pre-approved/documented privileged Windows reparse test may remain ignored rather than failed. Record actual Node/Vitest/Rust counts from output. Do not run build, dev, debug, browser, Playwright, packaging, screenshot, real-GPU, visual or performance commands.

- [ ] **Step 3: Classify and repair any gate failure before claiming success**

For each failure, record:

```text
command
first failing test/lint/type/error
whether it existed at the Task 0 baseline
whether an M2.5 file caused it
exact repair files
focused rerun
full-command rerun
```

Repair only demonstrated M2.5 regressions. Preserve existing public behavior and all locked decisions. A dependency/network failure is recorded and retried only after connectivity returns; do not change versions or introduce a CDN. Do not classify a Task 19 documentation regression as pre-existing.

- [ ] **Step 4: Run final independent specification and code review**

Provide the reviewer the approved design, this plan, commits since `26cc7534`, final staged/unstaged diff, complete gate logs and M2 report. Require:

```text
Spec Compliance: Pass
Code Quality: Approved
Critical: None
Important: None
Minor: explicit list or None
Ready: Yes
```

Resolve every Critical/Important finding and rerun all affected focused/full gates. A Minor may remain only when it does not violate acceptance and its exact reason/risk is recorded in `docs/M2_REPORT.md`.

- [ ] **Step 5: Convert documents to final closure state**

Update `docs/M2_REPORT.md` with actual commands, exit codes, counts, failures/repairs/retries and final review. Mark M2.5 accepted and M2 closed in README/ROADMAP/HANDOFF/PLANS only after Step 2 and Step 4 succeed. Mark Task 20 and every remaining checkbox in this plan complete. State explicitly:

```text
schema v3
exactly 12 native commands
exactly 2 desktop capabilities
protected manifest hashes unchanged
Showroom Demo semantic digest verified
build/browser/GPU/visual validation not run and not claimed
local master/origin 57 2 divergence still requires human integration
```

- [ ] **Step 6: Verify the closure-only staged scope and commit**

Run:

```text
git status --short --branch
git diff --check
git diff --cached --check
git diff --cached --name-only
```

Expected: staged files are only reviewed Task 20 repairs, closure documents and this plan; protected manifests are unstaged and absent from cached diff; no `.env`, credential, build artifact, `.twinproj`, export PNG or unrelated file is staged.

```bash
git commit -m "chore: close AetherTwin M2 export evidence"
```

After commit, rerun `git status --short --branch` and record the new HEAD in HANDOFF only in a follow-up documentation commit if the exact hash must be persisted; never invent a hash before commit.

**Do not modify:** AGENTS.md with temporary status, protected manifests, branch baseline/divergence, M3 implementation, runtime permissions.

**Risk / rollback:** closure is invalid if a command was not actually run, a review is not clean, or runtime evidence is overstated. Revert only the closure commit while retaining reviewed product commits if any condition is discovered later.

---

## Spec Coverage Matrix

| Approved design section | Implementing tasks |
| --- | --- |
| Goal, scope and platform boundaries | 0, 1, 6, 19, 20 |
| Renderer provenance and immutable capture | 3, 4, 14, 18 |
| Pure exporter presets, validation, row order, progress and cancellation | 1, 2, 4, 5, 18 |
| Streaming opaque sRGB PNG | 6, 8, 18 |
| Project-bound naming, staging, fsync, collision and cleanup | 7, 8, 11, 18 |
| Four-command strict native protocol | 9, 10, 11, 12 |
| Studio action, 16:9 framing, panel, focus and lifecycle | 13, 14, 15, 18 |
| Deterministic Demo fixture/assets/generator/recovery | 16, 17, 18 |
| Errors, redaction, races and close semantics | 4, 5, 9, 10, 11, 12, 15 |
| Automated verification and truthful evidence | 18, 19, 20 |
| Explicit exclusions and no runtime overclaim | Global Constraints, 19, 20 |

## Execution Dependency Order

```text
Task 0 -> Task 1
Task 1 -> Task 2
Task 1 -> Task 3 -> Task 4
Tasks 1-4 -> Task 5
Task 6 -> Task 7 -> Task 8 -> Task 9 -> Task 10 -> Task 11 -> Task 12
Tasks 1 and 12 -> Task 13
Tasks 3 and 13 -> Task 14
Tasks 5, 12, 13 and 14 -> Task 15; Task 16 -> Task 17
Tasks 1-17 -> Task 18 -> Task 19 -> Task 20
```

Tasks may be prepared in parallel only when the graph shows no dependency, but shared files must never be edited concurrently. Every task remains a separate review and commit boundary.
