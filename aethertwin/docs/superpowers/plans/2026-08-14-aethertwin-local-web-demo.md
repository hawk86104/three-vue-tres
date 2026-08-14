# AetherTwin Local Web Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `http://127.0.0.1:4173` 提供首个可本地体验的 AetherTwin Web Demo，自动打开经过完整校验的 canonical Showroom Demo，并保留现有 2D、3D、split 编辑体验。

**Architecture:** 新增仅由 Vite `web-demo` mode 启用的独立根组件；它异步校验 bundled snapshot 和四个本地资产，把不可变 seed 注入 `SandboxProjectBackend`，再用独立 `ProjectStore` 直接打开 `PlanEditor`。普通 `App`、`selectBackend()`、Tauri 后端、原生命令和桌面导出路径保持原样。

**Tech Stack:** React 19.2.7、TypeScript 6.0.3、Vite 8.1.5、Vitest 4.1.10、ProjectStore、SandboxProjectBackend、现有 PlanEditor / 2D / Three.js + R3F 渲染链。

## Global Constraints

- 基线为 `codex/aethertwin-m2@161020bc2bb94fef0c3d3bcb29f60f2b1b5d0049`。
- 权威规格为 `docs/superpowers/specs/2026-08-14-aethertwin-local-web-demo-design.md`。
- schema 保持 v3；Tauri invoke 保持 12 个；desktop capability 保持 2 个。
- 不修改 `apps/studio/src/backend/select-backend.ts` 的普通 production fail-closed 行为。
- 不新增 Tauri command、Rust crate、SQLite migration、远程 URL、CDN、遥测、运行时网络后备或新依赖。
- `crates/asset-io/Cargo.toml`、`crates/desktop-host/Cargo.toml`、`packages/mode-showroom/src/index.ts` 是既有用户修改：不得恢复、格式化、暂存或提交。
- 不提交 `.env`、`dist/`、`.twinproj`、导出 PNG、凭据或浏览器缓存。
- Web Demo 传入 `exportBackend={null}`；Export 保持可见但禁用，理由继续使用桌面版限定。
- 默认视图保持 2D；3D/split 只复用现有能力，不新增 Web 专用几何或渲染状态。
- 刷新、Back 和 Retry 都恢复 exact canonical Demo；不使用 IndexedDB、localStorage 项目持久化或 service worker。
- 每个代码任务先建立有效 RED，再做最小 GREEN；每项独立审查、`git diff --check`、独立提交。
- Task 1–5 不运行 build、dev、preview、浏览器、Playwright、截图或真实 GPU。
- Task 6 只有在用户当轮明确批准 build、dev 和浏览器验证后才执行；无批准时保持未完成且不得声称已可见运行。

---

## File Responsibility Map

**Create**

- `apps/studio/src/web-demo/web-demo-fixtures.ts` — bundled JSON 和四个 `?url` 资产的唯一静态入口。
- `apps/studio/src/web-demo/load-web-demo.ts` — 解析、获取、校验、digest 和 seed 构造；不创建 React 状态。
- `apps/studio/src/web-demo/load-web-demo.test.ts` — loader 原子性、错误分类、Abort 和真实 fixture 契约。
- `apps/studio/src/web-demo/web-demo-app.tsx` — generation、AbortController、ProjectStore/backend 生命周期和用户状态。
- `apps/studio/src/web-demo/web-demo-app.test.tsx` — loading/ready/error/retry/back/unmount/late-result 测试。
- `apps/studio/src/studio-root.tsx` — ordinary App 与 WebDemoApp 的 compile-time mode 选择。
- `apps/studio/src/studio-root.test.tsx` — 两条根路径的互斥挂载测试。
- `apps/studio/vite.config.test.ts` — web-demo flag、ordinary mode 和相对 base 测试。
- `tests/web-demo-policy.test.mjs` — scripts、无 `.env`、无持久化/远程/native 假入口和静态输出策略。

**Modify**

- `packages/project-store/src/sandbox-backend.ts` — 增加可选且严格的 seed 构造路径；无参行为不变。
- `packages/project-store/src/index.ts` — 导出 seed types。
- `packages/project-store/src/project-store.test.ts` — seed 边界与 Blob URL 生命周期。
- `apps/studio/src/main.tsx` — 只渲染 `StudioRoot`。
- `apps/studio/vite.config.ts` — 仅 `web-demo` mode 定义 flag。
- `apps/studio/package.json` — 增加两个精确脚本，不改依赖。
- `apps/studio/src/app.css` — Web Demo notice、loading/error shell 和 editor wrapper。
- `README.md`、`docs/ARCHITECTURE.md`、`docs/PRODUCT_SPEC.md`、`docs/ROADMAP.md`、`HANDOFF.md`、`PLANS.md` — 记录真实能力、命令和未运行验证。
- 本实施计划 — 每项完成后勾选相应任务。

**Must not modify**

- `apps/studio/src/app.tsx`
- `apps/studio/src/backend/select-backend.ts`
- `apps/studio/src/features/plan-editor/plan-editor.tsx`
- `packages/render-scene-3d/**`
- `crates/**`
- `fixtures/contracts/showroom-demo.v3.json`
- `fixtures/assets/showroom-demo/**`
- `pnpm-lock.yaml`

---

### Task 1: Seeded SandboxProjectBackend

**Files:**
- Modify: `packages/project-store/src/sandbox-backend.ts`
- Modify: `packages/project-store/src/index.ts`
- Test: `packages/project-store/src/project-store.test.ts`

**Interfaces:**
- Consumes: existing `OpenedProject`, `AssetRecord`, `parseManifest()`, `parseSnapshot()`, Blob ownership and URL revocation logic.
- Produces:

```ts
export interface SandboxProjectSeedAsset {
  readonly relativePath: string;
  readonly blob: Blob;
}

export interface SandboxProjectSeed {
  readonly openedProject: OpenedProject;
  readonly assets: readonly SandboxProjectSeedAsset[];
}

export interface SandboxProjectBackendOptions {
  readonly seed?: SandboxProjectSeed;
}
```

- `new SandboxProjectBackend()` keeps the current deterministic empty behavior.
- `new SandboxProjectBackend({ seed })` synchronously validates and atomically installs one opened project.

- [x] **Step 1: Write the seeded-backend RED tests**

Add one `describe("SandboxProjectBackend seeded project", ...)` block. Use `createManifest()` and a small parsed snapshot with two distinct `AssetRecord` entries. Cover these exact assertions:

```ts
const backend = new SandboxProjectBackend({
  seed: {
    openedProject: {
      projectPath: `sandbox://\${snapshot.project.id}`,
      manifest,
      snapshot,
      recovered: false,
    },
    assets: [
      { relativePath: snapshot.assets[0]!.relativePath, blob: pngBlob },
      { relativePath: snapshot.assets[1]!.relativePath, blob: svgBlob },
    ],
  },
});

await expect(backend.openProject(`sandbox://\${snapshot.project.id}`))
  .resolves.toMatchObject({ snapshot, manifest, recovered: false });
```

Also verify:

- caller mutation after construction cannot change the opened manifest, snapshot, asset array or stored Blob bytes;
- no-argument construction still creates `sandbox://00000000-0000-4000-8000-000000000001`;
- project path mismatch is rejected;
- each manifest mismatch (`projectId`, `name`, `profile`, `schemaVersion`) is rejected;
- duplicate, missing and extra `relativePath` values are rejected;
- wrong Blob `type` and wrong Blob `size` are rejected;
- seeded assets resolve through one backend-owned URL per relative path;
- `closeProject()` and idempotent `dispose()` revoke each created URL exactly once;
- a rejected seed publishes neither a project nor a Blob map.

- [x] **Step 2: Run RED**

Run:

```powershell
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts -t "SandboxProjectBackend seeded project"
```

Expected: FAIL because the constructor ignores the seed and `openProject()` reports that the seeded sandbox project is missing.

- [x] **Step 3: Add the seed interfaces and atomic constructor**

Implement this constructor boundary:

```ts
export class SandboxProjectBackend implements ProjectBackend {
  // existing fields stay unchanged

  constructor(options: SandboxProjectBackendOptions = {}) {
    if (options.seed !== undefined) this.installSeed(options.seed);
  }

  private installSeed(seed: SandboxProjectSeed): void {
    const opened = cloneOpenedProject(seed.openedProject);
    const snapshot = parseSnapshot(opened.snapshot);
    const manifest = parseManifest(opened.manifest);
    const expectedPath = `sandbox://\${snapshot.project.id}`;

    if (opened.projectPath !== expectedPath) throw new Error("Invalid sandbox seed");
    if (
      manifest.projectId !== snapshot.project.id
      || manifest.name !== snapshot.project.name
      || manifest.profile !== snapshot.project.profile
      || manifest.schemaVersion !== snapshot.schemaVersion
    ) throw new Error("Invalid sandbox seed");

    const expectedAssets = new Map(
      snapshot.assets.map((asset) => [asset.relativePath, asset] as const),
    );
    const ownedBlobs = new Map<string, Blob>();
    for (const input of seed.assets) {
      if (ownedBlobs.has(input.relativePath)) throw new Error("Invalid sandbox seed");
      const asset = expectedAssets.get(input.relativePath);
      if (
        asset === undefined
        || !(input.blob instanceof Blob)
        || input.blob.type !== asset.mediaType
        || input.blob.size !== asset.size
      ) throw new Error("Invalid sandbox seed");
      ownedBlobs.set(
        input.relativePath,
        new Blob([input.blob], { type: asset.mediaType }),
      );
    }
    if (ownedBlobs.size !== expectedAssets.size) throw new Error("Invalid sandbox seed");

    this.projects.set(expectedPath, cloneOpenedProject({
      projectPath: expectedPath,
      manifest,
      snapshot,
      recovered: opened.recovered,
    }));
    this.blobs.set(expectedPath, ownedBlobs);
  }
}
```

Keep all validation in local values and mutate `projects`/`blobs` only after every check passes. Do not hash here: async SHA-256 verification belongs to Task 2.

- [x] **Step 4: Export the exact public types**

Update `packages/project-store/src/index.ts`:

```ts
export {
  SandboxProjectBackend,
  type SandboxProjectBackendOptions,
  type SandboxProjectSeed,
  type SandboxProjectSeedAsset,
} from "./sandbox-backend";
```

- [x] **Step 5: Run GREEN and type checks**

Run:

```powershell
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts -t "SandboxProjectBackend seeded project|SandboxProjectBackend asset equivalence"
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
git diff --check
```

Expected: seeded and existing Sandbox tests PASS; ProjectStore typecheck exits 0; diff check has no whitespace error.

- [x] **Step 6: Review and commit**

Confirm `git diff --name-only` contains only the three Task 1 files plus this plan checkbox update. Confirm all three protected dirty files remain unstaged.

```powershell
git add -- packages/project-store/src/sandbox-backend.ts packages/project-store/src/index.ts packages/project-store/src/project-store.test.ts docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md
git commit -m "feat: seed the AetherTwin sandbox backend"
```

---

### Task 2: Verified Canonical Demo Loader

**Files:**
- Create: `apps/studio/src/web-demo/web-demo-fixtures.ts`
- Create: `apps/studio/src/web-demo/load-web-demo.ts`
- Create: `apps/studio/src/web-demo/load-web-demo.test.ts`

**Interfaces:**
- Consumes: `SandboxProjectSeed` from Task 1, `parseSnapshot()`, `createManifest()`, canonical fixture JSON and four bundled asset URLs.
- Produces:

```ts
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

export function loadWebDemoSeed(
  options: LoadWebDemoSeedOptions,
): Promise<SandboxProjectSeed>;
```

- [x] **Step 1: Write loader RED tests**

Create fetch fixtures with `new Response(bytes, { status: 200, headers: { "content-type": mediaType } })`. Cover:

```ts
await expect(loadWebDemoSeed({
  signal: new AbortController().signal,
  fetch: fixtureFetch,
  sources,
})).resolves.toMatchObject({
  openedProject: {
    projectPath: "sandbox://e2500000-0000-4000-8000-000000000001",
    recovered: false,
    snapshot: { schemaVersion: 3 },
  },
  assets: [
    { relativePath: snapshot.assets[0]!.relativePath },
    { relativePath: snapshot.assets[1]!.relativePath },
    { relativePath: snapshot.assets[2]!.relativePath },
    { relativePath: snapshot.assets[3]!.relativePath },
  ],
});
```

Add exact rejection tests for:

- malformed snapshot → `WEB_DEMO_PROJECT_INVALID`;
- malformed manifest entry, duplicate file, unknown file, missing file or extra file → `WEB_DEMO_ASSET_INVALID`;
- non-OK response、rejected fetch 或 rejected response body read → `WEB_DEMO_ASSET_UNAVAILABLE`;
- wrong response media type, byte length or SHA-256 → `WEB_DEMO_ASSET_INVALID`;
- manifest digest matching zero or two snapshot assets → `WEB_DEMO_ASSET_INVALID`;
- AbortSignal cancellation rejects as an abort and publishes no seed;
- returned arrays, manifest, snapshot and records are frozen/owned;
- fetch receives the same AbortSignal for all four local URLs.

- [x] **Step 2: Run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/web-demo/load-web-demo.test.ts
```

Expected: FAIL because `load-web-demo.ts` and its exports do not exist.

- [x] **Step 3: Create the static fixture boundary**

`web-demo-fixtures.ts` must contain only imports and immutable constants:

```ts
import snapshot from "../../../../fixtures/contracts/showroom-demo.v3.json";
import manifest from "../../../../fixtures/assets/showroom-demo/manifest.json";
import planReferenceUrl from "../../../../fixtures/assets/showroom-demo/plan-reference.svg?url";
import floorUrl from "../../../../fixtures/assets/showroom-demo/floor.png?url";
import wallUrl from "../../../../fixtures/assets/showroom-demo/wall.jpg?url";
import fixtureUrl from "../../../../fixtures/assets/showroom-demo/fixture.svg?url";
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
```

No `new URL(userValue)`, remote fallback or filesystem path is allowed.

- [x] **Step 4: Implement strict parsing and seed construction**

Lock these constants:

```ts
export const WEB_DEMO_TIMESTAMP = "2026-08-09T12:34:56.789Z";
export const WEB_DEMO_APP_VERSION = "0.1.0-web-demo";
export const WEB_DEMO_ASSET_FILES = Object.freeze([
  "plan-reference.svg",
  "floor.png",
  "wall.jpg",
  "fixture.svg",
] as const);
export type WebDemoAssetFile = typeof WEB_DEMO_ASSET_FILES[number];
```

Implement the algorithm in this exact order:

```ts
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
  const assetsByDigest = indexSnapshotAssets(snapshot);
  const loaded = await Promise.all(entries.map(async (entry) => {
    options.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetchAsset(sources.assetUrls[entry.file], {
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal.aborted) throw error;
      throw new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE");
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (options.signal.aborted) throw error;
      throw new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE");
    }
    const digest = await digestHex(bytes);
    const asset = requireExactAsset(entry, response, bytes, digest, assetsByDigest);
    return Object.freeze({
      relativePath: asset.relativePath,
      blob: new Blob([ownedArrayBuffer(bytes)], { type: asset.mediaType }),
    });
  }));

  options.signal.throwIfAborted();
  const manifest = createManifest(snapshot, {
    now: () => WEB_DEMO_TIMESTAMP,
    appVersion: WEB_DEMO_APP_VERSION,
  });
  return Object.freeze({
    openedProject: Object.freeze({
      projectPath: `sandbox://\${snapshot.project.id}`,
      manifest,
      snapshot,
      recovered: false,
    }),
    assets: Object.freeze(loaded),
  });
}
```

`parseWebDemoManifest()` must require an array of exactly four objects, exact keys `file/sha256/mediaType/purpose`, the approved file order, lowercase 64-hex digests, matching allowed media types and no duplicate. `requireExactAsset()` must normalize Content-Type before `;`, require one matching snapshot digest, equal media type, equal byte length and equal digest. After all four loads, require every snapshot asset to be consumed exactly once.

- [x] **Step 5: Run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/web-demo/load-web-demo.test.ts
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: loader tests PASS; Studio typecheck exits 0; no whitespace error.

- [x] **Step 6: Review and commit**

```powershell
git add -- apps/studio/src/web-demo/web-demo-fixtures.ts apps/studio/src/web-demo/load-web-demo.ts apps/studio/src/web-demo/load-web-demo.test.ts docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md
git commit -m "feat: verify the bundled AetherTwin Web Demo"
```

---

### Task 3: WebDemoApp Lifecycle and Editor Session

**Files:**
- Create: `apps/studio/src/web-demo/web-demo-app.tsx`
- Create: `apps/studio/src/web-demo/web-demo-app.test.tsx`
- Modify: `apps/studio/src/app.css`

**Interfaces:**
- Consumes: Task 2 `loadWebDemoSeed()`, Task 1 seeded backend, `ProjectStore.open()`, `PlanEditor`.
- Produces:

```ts
export interface WebDemoAppDependencies {
  readonly loadSeed: typeof loadWebDemoSeed;
  readonly createBackend: (seed: SandboxProjectSeed) => SandboxProjectBackend;
  readonly createStore: (backend: SandboxProjectBackend) => ProjectStore;
}

export interface WebDemoAppProps {
  readonly dependencies?: WebDemoAppDependencies;
}

export function WebDemoApp(props: WebDemoAppProps): ReactNode;
```

- [x] **Step 1: Write lifecycle RED tests**

Mock only `PlanEditor`; use real `ProjectStore` and `SandboxProjectBackend` where timing permits. Cover:

- loading renders no PlanEditor and no invented percentage;
- loader success opens the exact seed path before publishing PlanEditor;
- ready props are `backendMode="sandbox"`, `exportBackend={null}`, the opened store and one reset callback;
- notice text is exactly `本地预览 · 修改将在刷新后重置 · PNG 导出仅桌面版`;
- loader failure shows only mapped safe copy and one `Retry` button;
- retry increments generation and never reuses failed backend/store;
- Back starts a new generation and reopens the canonical seed;
- unmount aborts the current loader;
- late loader success, late `store.open()` and late failure from an old generation cannot replace the current editor;
- unpublished partial backend, published store and backend dispose in store-then-backend order;
- duplicate cleanup calls invoke each disposal at most once;
- an unknown error is rendered as `WEB_DEMO_INITIALIZATION_FAILED` copy without stack/path/raw message;
- a renderer failure stays inside existing PlanEditor 2D fallback; WebDemoApp does not replace the editor with its own renderer error.

Use one rejected load followed by one successful load to assert Retry creates a fresh generation:

```ts
const loadSeed = vi.fn()
  .mockRejectedValueOnce(new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE"))
  .mockResolvedValueOnce(seed);

render(<WebDemoApp dependencies={{ loadSeed, createBackend, createStore }} />);
await screen.findByRole("alert");
await userEvent.click(screen.getByRole("button", { name: "Retry" }));
await screen.findByTestId("plan-editor");
expect(loadSeed).toHaveBeenCalledTimes(2);
expect(screen.getAllByTestId("plan-editor")).toHaveLength(1);
```

Use a separate deferred loader for the late-result assertion:

```ts
const pending = deferred<SandboxProjectSeed>();
const rendered = render(
  <WebDemoApp dependencies={{
    loadSeed: vi.fn(() => pending.promise),
    createBackend,
    createStore,
  }} />,
);
rendered.unmount();
pending.resolve(seed);
await Promise.resolve();
expect(screen.queryByTestId("plan-editor")).not.toBeInTheDocument();
```

- [x] **Step 2: Run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/web-demo/web-demo-app.test.tsx
```

Expected: FAIL because `WebDemoApp` does not exist.

- [x] **Step 3: Implement a generation-owned session**

Use this state model:

```ts
type WebDemoState =
  | { readonly kind: "loading"; readonly generation: number }
  | {
      readonly kind: "ready";
      readonly generation: number;
      readonly backend: SandboxProjectBackend;
      readonly store: ProjectStore;
    }
  | {
      readonly kind: "error";
      readonly generation: number;
      readonly code: WebDemoErrorCode;
    };
```

Each effect invocation owns one `AbortController`, one local backend, one local store and one memoized `release()` promise:

```ts
useEffect(() => {
  const controller = new AbortController();
  let current = true;
  let backend: SandboxProjectBackend | null = null;
  let store: ProjectStore | null = null;
  let releasePromise: Promise<void> | null = null;
  const release = (): Promise<void> => {
    releasePromise ??= (async () => {
      if (store !== null) await store.dispose().catch(() => undefined);
      if (backend !== null) await backend.dispose().catch(() => undefined);
    })();
    return releasePromise;
  };

  setState({ kind: "loading", generation });
  void dependencies.loadSeed({ signal: controller.signal }).then(async (seed) => {
    if (!current) return;
    backend = dependencies.createBackend(seed);
    store = dependencies.createStore(backend);
    await store.open(seed.openedProject.projectPath);
    if (!current) return release();
    setState({ kind: "ready", generation, backend, store });
  }).catch(async (error) => {
    if (!current || controller.signal.aborted) return;
    await release();
    if (!current) return;
    setState({ kind: "error", generation, code: webDemoErrorCode(error) });
  });

  return () => {
    current = false;
    controller.abort();
    void release();
  };
}, [dependencies, generation]);
```

Keep the default dependency object module-stable so it does not restart the effect on every render.

- [x] **Step 4: Render truthful UI and reset behavior**

Use these exact branches:

```tsx
if (state.kind === "loading") {
  return (
    <main className="studio-web-demo-state">
      <StatusNotice>正在载入本地示例…</StatusNotice>
    </main>
  );
}

if (state.kind === "error") {
  return (
    <main className="studio-web-demo-state">
      <StatusNotice tone="error">{webDemoErrorMessage(state.code)}</StatusNotice>
      <Button onClick={() => setGeneration((value) => value + 1)}>Retry</Button>
    </main>
  );
}

return (
  <main className="studio-web-demo">
    <p className="studio-web-demo__notice" role="note">
      本地预览 · 修改将在刷新后重置 · PNG 导出仅桌面版
    </p>
    <PlanEditor
      store={state.store}
      backendMode="sandbox"
      exportBackend={null}
      onBack={() => setGeneration((value) => value + 1)}
    />
  </main>
);
```

Map the four codes to four fixed Chinese messages; do not render `error.message`, `error.stack`, URL or filename.

- [x] **Step 5: Add bounded styles**

```css
.studio-web-demo {
  display: grid;
  min-height: 100vh;
  grid-template-rows: auto minmax(0, 1fr);
}

.studio-web-demo__notice {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--aether-border);
  background: var(--aether-surface-2);
  color: var(--aether-text-muted);
  font-size: 12px;
  text-align: center;
}

.studio-web-demo-state {
  display: grid;
  min-height: 100vh;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 24px;
}
```

- [x] **Step 6: Run GREEN and regression checks**

```powershell
pnpm.cmd vitest run apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/scene-canvas.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: WebDemo lifecycle tests PASS; existing session/scene lifecycle tests PASS; Studio typecheck and diff check exit 0. JSDOM canvas notices, if emitted without failure, must be recorded rather than described as GPU evidence.

- [x] **Step 7: Review and commit**

```powershell
git add -- apps/studio/src/web-demo/web-demo-app.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/app.css docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md
git commit -m "feat: open the AetherTwin Web Demo editor"
```

---

### Task 4: Dedicated Vite Mode, Root Selection and Policy Lock

**Files:**
- Create: `apps/studio/src/studio-root.tsx`
- Create: `apps/studio/src/studio-root.test.tsx`
- Create: `apps/studio/vite.config.test.ts`
- Create: `tests/web-demo-policy.test.mjs`
- Modify: `apps/studio/src/main.tsx`
- Modify: `apps/studio/vite.config.ts`
- Modify: `apps/studio/package.json`

**Interfaces:**
- Consumes: Task 3 `WebDemoApp`, existing `App`, Vite `ConfigEnv.mode`.
- Produces: `StudioRoot`, `web-demo` and `build:web-demo` scripts, compile-time `VITE_AETHERTWIN_WEB_DEMO="1"` only in the dedicated mode and `"0"` in every ordinary mode.

- [x] **Step 1: Write root/config/policy RED tests**

`studio-root.test.tsx` mocks `App` and `WebDemoApp` and asserts exactly one is mounted:

```tsx
render(<StudioRoot webDemo />);
expect(screen.getByTestId("web-demo")).toBeInTheDocument();
expect(screen.queryByTestId("ordinary-app")).not.toBeInTheDocument();

render(<StudioRoot webDemo={false} />);
expect(screen.getByTestId("ordinary-app")).toBeInTheDocument();
```

`vite.config.test.ts` resolves the config function for `mode: "web-demo"` and `mode: "production"`, asserting:

```ts
expect(webDemo.define).toEqual({
  "import.meta.env.VITE_AETHERTWIN_WEB_DEMO": JSON.stringify("1"),
});
expect(production.define).toEqual({
  "import.meta.env.VITE_AETHERTWIN_WEB_DEMO": JSON.stringify("0"),
});
expect(webDemo.base).toBe("./");
expect(webDemo.build).toEqual({ outDir: "dist", emptyOutDir: true });
```

`tests/web-demo-policy.test.mjs` asserts the exact scripts, absence of committed `.env*`, absence of `dist/`, and that `select-backend.ts` contains neither `VITE_AETHERTWIN_WEB_DEMO` nor a production sandbox bypass.

- [x] **Step 2: Run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/studio-root.test.tsx apps/studio/vite.config.test.ts
node --test tests/web-demo-policy.test.mjs
```

Expected: FAIL because `StudioRoot`, the mode-specific define and both scripts are missing.

- [x] **Step 3: Add the exclusive root selector**

```tsx
import { App } from "./app";
import { WebDemoApp } from "./web-demo/web-demo-app";

export interface StudioRootProps {
  readonly webDemo?: boolean;
}

export function StudioRoot({
  webDemo = import.meta.env.VITE_AETHERTWIN_WEB_DEMO === "1",
}: StudioRootProps) {
  return webDemo ? <WebDemoApp /> : <App />;
}
```

Update `main.tsx` so `StrictMode` contains only `<StudioRoot />`. Do not import `WebDemoApp` directly from `main.tsx`.

- [x] **Step 4: Add the dedicated Vite flag and scripts**

```ts
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_AETHERTWIN_WEB_DEMO": JSON.stringify(
      mode === "web-demo" ? "1" : "0",
    ),
  },
  build: { outDir: "dist", emptyOutDir: true },
}));
```

Pinning ordinary modes to `"0"` prevents a process-level or uncommitted `.env` value from enabling the Demo outside `--mode web-demo`.

Add these exact package scripts without changing dependencies or lockfile:

```json
{
  "web-demo": "vite --mode web-demo --host 127.0.0.1 --port 4173 --strictPort",
  "build:web-demo": "vite build --mode web-demo"
}
```

- [x] **Step 5: Lock policy invariants**

`tests/web-demo-policy.test.mjs` must assert:

- only the two exact scripts contain `web-demo`;
- mode flag equals `"1"` only when `mode === "web-demo"` and equals `"0"` otherwise;
- ordinary `App` and `selectBackend()` files remain present and fail-closed tests remain runnable;
- no `.env`, remote URL, CDN, telemetry, localStorage/IndexedDB project storage, service worker, browser export backend or new `invoke(` appears in Web Demo sources;
- no new dependency or lockfile change;
- no generated output, `.twinproj` or export PNG is committed.

Reuse `tests/offline-source-policy.test.mjs` for the exact 12 invokes and 2 capabilities; do not duplicate its parser.

- [x] **Step 6: Run GREEN and source-level vertical checks**

```powershell
pnpm.cmd vitest run apps/studio/src/studio-root.test.tsx apps/studio/vite.config.test.ts apps/studio/src/web-demo/load-web-demo.test.ts apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts
node --test tests/web-demo-policy.test.mjs tests/showroom-demo.test.mjs tests/offline-source-policy.test.mjs tests/project-format-policy.test.mjs
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
git diff --check
```

Expected: all listed tests PASS; both typechecks exit 0; source policy still reports exact schema/native boundaries; no whitespace error. These commands do not prove browser layout or WebGL.

- [x] **Step 7: Review and commit**

```powershell
git add -- apps/studio/src/studio-root.tsx apps/studio/src/studio-root.test.tsx apps/studio/src/main.tsx apps/studio/vite.config.ts apps/studio/vite.config.test.ts apps/studio/package.json tests/web-demo-policy.test.mjs docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md
git commit -m "feat: add the AetherTwin localhost Web Demo mode"
```

---

### Task 5: Documentation and Source-Level Closure

**Files:**
- Modify: `packages/project-store/src/sandbox-backend.ts`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `apps/studio/src/web-demo/load-web-demo.ts`
- Modify: `apps/studio/src/web-demo/load-web-demo.test.ts`
- Modify: `apps/studio/package.json`
- Modify: `tests/web-demo-policy.test.mjs`
- Modify: `tests/visible-actions.test.mjs`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/ROADMAP.md`
- Modify: `HANDOFF.md`
- Modify: `PLANS.md`
- Modify: `docs/superpowers/specs/2026-08-14-aethertwin-local-web-demo-design.md`
- Modify: `docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md`

**Interfaces:**
- Consumes: verified source behavior from Tasks 1–4.
- Produces: truthful launch instructions, isolation constraints, current verification state and next runtime gate.

- [x] **Step 1: Update user-facing commands and limitations**

Add this README command block:

```powershell
pnpm.cmd --filter @aethertwin/studio web-demo
```

Document `http://127.0.0.1:4173`, auto-opened Showroom Demo, refresh reset, desktop-only PNG export, and that `file://` is unsupported. Do not claim the command has been visibly run until Task 6 completes.

- [x] **Step 2: Update architecture and product truth**

Record:

- `StudioRoot` is the only mode fork;
- Web Demo owns seed loading and in-memory lifecycle;
- `selectBackend()` and Tauri remain unchanged;
- `SandboxProjectBackend` remains the sole creator/revoker of seeded Web Demo asset Blob URLs, while ProjectStore owns source leases;
- default 2D and existing 3D/split are reused;
- no browser persistence or browser export.

Mark the design spec source implementation state as complete only if Tasks 1–4 gates are green. Mark runtime validation separately as pending.

- [x] **Step 3: Update handoff and plan ledgers**

`HANDOFF.md` and `PLANS.md` must record:

- branch and exact current HEAD;
- source implementation complete or exact remaining failure;
- commands actually run and actual results;
- build/dev/browser/GPU still unrun;
- three protected dirty files and integration guard;
- next action is Task 6 explicit runtime approval.

- [x] **Step 4: Run complete non-build source gates**

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
node --test tests/*.test.mjs
pnpm.cmd vitest run
git diff --check
```

Expected: every command exits 0. Record actual test counts, warnings and any retry. Do not run build/dev/browser as part of this step.

- [x] **Step 5: Independent review**

Use `requesting-code-review` against the complete Web Demo diff. The reviewer must check:

- seed validation atomicity and Blob ownership;
- digest/media/size and exact asset-to-record mapping;
- Abort/generation races and exact-once disposal;
- ordinary production Web fail-closed behavior;
- native/schema/capability invariants;
- disabled Export truthfulness;
- tests versus design acceptance;
- absence of runtime claims.

Resolve every Critical or Important finding, rerun affected gates, and record the clean verdict. Minor findings may remain only when explicitly documented and behavior-neutral.

The initial review found four Important and two Minor issues. After focused RED/GREEN repairs and documentation corrections, clean re-review returned Critical/Important/Minor 0, Spec Compliance Pass, Code Quality Approved, Ready Yes.

- [x] **Step 6: Commit source-level closure**

```powershell
git add -- packages/project-store/src/sandbox-backend.ts packages/project-store/src/project-store.test.ts apps/studio/src/web-demo/load-web-demo.ts apps/studio/src/web-demo/load-web-demo.test.ts apps/studio/package.json tests/web-demo-policy.test.mjs tests/visible-actions.test.mjs README.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/PRODUCT_SPEC.md docs/ROADMAP.md HANDOFF.md PLANS.md docs/superpowers/specs/2026-08-14-aethertwin-local-web-demo-design.md docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md
git commit -m "fix: close AetherTwin Web Demo source implementation"
```

After commit, `git status --short` must show only the three protected pre-existing dirty files.

---

### Task 6: Explicitly Approved Build and Localhost Runtime Acceptance

**Files:**
- Do not commit generated files.
- Runtime output only: `apps/studio/dist/` and one controlled dev-server process.
- Modify documentation only if actual runtime evidence changes the recorded state.

**Interfaces:**
- Consumes: source-level accepted implementation from Task 5.
- Produces: actual localhost URL and honest browser/WebGL evidence.

- [ ] **Step 1: Obtain current explicit approval**

Ask for approval to run exactly:

- `build:web-demo`;
- `web-demo` dev server on `127.0.0.1:4173`;
- in-app browser inspection;
- real WebGL interaction.

Do not include screenshot capture unless the user separately approves screenshots.

- [ ] **Step 2: Build the dedicated mode**

```powershell
pnpm.cmd --filter @aethertwin/studio build:web-demo
```

Expected: exit 0; `apps/studio/dist/index.html` exists; emitted asset URLs are relative; no remote runtime source is present. If this fails, report the actual error and do not start the server.

- [ ] **Step 3: Start the localhost server**

```powershell
pnpm.cmd --filter @aethertwin/studio web-demo
```

Expected: Vite listens on `http://127.0.0.1:4173` with no fallback port. Keep the controlled process identifier so it can be stopped or intentionally left available to the user.

- [ ] **Step 4: Inspect the real browser experience**

Open `http://127.0.0.1:4173` and verify:

1. Project Center never appears.
2. The exact persistent notice is visible.
3. canonical Showroom Demo opens in 2D.
4. floor, wall/openings, seven Showroom fixture families, generic fixture, hotspots, route and materials are present.
5. 3D and split can be selected; split remains 50/50.
6. selection and active floor synchronize between panes.
7. Export remains disabled with the desktop-only explanation.
8. Back restores a fresh exact Demo.
9. browser refresh restores a fresh exact Demo.
10. a forced WebGL/context failure preserves a complete usable 2D pane.
11. no remote request, Tauri invoke or persistence claim appears.

Record browser console errors and network failures exactly. Do not infer visual correctness from source tests.

- [ ] **Step 5: Record runtime evidence and remove generated output**

Update README/HANDOFF/PLANS/design/implementation plan with actual build/browser results. Remove only the verified `apps/studio/dist/` generated by Step 2; do not commit it. Stop the server unless the user asks to keep it running.

```powershell
$expectedDemoDist = [IO.Path]::GetFullPath(
  (Join-Path (Get-Location) "apps\studio\dist")
)
$resolvedDemoDist = (Resolve-Path -LiteralPath "apps\studio\dist").Path
if ($resolvedDemoDist -ne $expectedDemoDist) {
  throw "Refusing to remove an unexpected path"
}
Remove-Item -LiteralPath $resolvedDemoDist -Recurse -Force
```

Run:

```powershell
git status --short
git diff --check
```

Expected: no generated output is tracked or staged; only documentation evidence plus the three protected dirty files appear.

- [ ] **Step 6: Commit runtime acceptance**

```powershell
git add -- README.md HANDOFF.md PLANS.md docs/superpowers/specs/2026-08-14-aethertwin-local-web-demo-design.md docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md
git commit -m "test: accept the AetherTwin localhost Web Demo"
```

If any real browser or WebGL acceptance item fails, do not mark Task 6 complete and do not use this commit message. Create a narrowly scoped follow-up task from the observed failure.

---

## Dependency Order

```text
Task 1 seeded backend
  -> Task 2 verified loader
    -> Task 3 WebDemo lifecycle/editor
      -> Task 4 dedicated root/Vite/policy
        -> Task 5 source closure
          -> Task 6 approved runtime acceptance
```

No task may skip its predecessor because each public interface is consumed by the next task.

## Rollback

- Each task is an independent commit; revert only the failing task commit.
- Never use `git reset --hard`, `git checkout --`, rebase, merge or baseline replacement.
- For an uncommitted failure, reverse only that task's exact patch; preserve all unrelated working-tree entries.
- Loader failure rollback must leave ordinary `App` startup unchanged.
- Runtime failure cleanup removes only `apps/studio/dist/` produced by the approved build and stops only the captured Vite process.

## Definition of Done

- Tasks 1–5 source gates and independent review are green.
- Task 6 has explicit user approval and actual build/browser evidence.
- localhost opens exact canonical Showroom Demo with truthful limitations.
- ordinary production Web remains fail-closed.
- schema/native/capability counts remain unchanged.
- no remote source, persistence fake, browser export fake or generated output is committed.
- protected dirty files remain untouched and unstaged.
