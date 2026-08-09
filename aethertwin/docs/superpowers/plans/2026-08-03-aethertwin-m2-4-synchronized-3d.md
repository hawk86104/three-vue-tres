# AetherTwin M2.4 同步 3D 实施计划

> 基线：codex/aethertwin-m2@a58e01e5。按 Task 0–18 顺序执行；每项任务均遵循 RED、最小实现、GREEN、聚焦验证、git diff --check、审查、独立提交。

## 目标与完成标准

M2.4 为 Showroom 增加与既有 2D 编辑器同步的 3D 预览，同时保持 ProjectStore 为唯一业务事实来源、保持 schema v3 和八个 Tauri 命令不变。

- Showroom 支持 2D、3D、固定 50/50 split，默认 2D。
- 活动楼层、选择、路线、材质、环境和降级资产问题双向同步。
- 3D 投影覆盖房间/区域、墙与开口、七类展具、兼容 generic 展具、热点和路线。
- 材质、纹理和环境通过可撤销、可重放、可恢复的 ProjectStore 命令持久化。
- WebGL 故障不影响 2D；资源、异步加载和上下文丢失均有精确生命周期。
- 向 M2.5 提供真实相机与离屏渲染端口，但 M2.4 不显示导出 UI。
- 不声称未经运行的真实 GPU、浏览器或视觉结果。

## 不可变约束

- CURRENT_SCHEMA_VERSION 保持 3；不增加 SQLite migration。
- Tauri invoke 数量保持 8；不增加 capability。
- 新日志命令为 scene.environment.patch，载荷严格为 before/after SceneEnvironment。
- AssetImportRole 增加 material-texture；只接受 PNG、JPEG、安全 SVG。
- Camera、view mode、renderer status 只存在 Zustand；材质、分配、环境只存在 ProjectStore。
- ProjectStore 是 blob URL 唯一所有者；3D 层不得自行 revoke。
- Market 保持纯 2D；不增加 GLTF、任意灯光、shader、3D 几何编辑、Player 或导出按钮。
- 不引入 CDN、远程运行时资产或绝对持久路径。
- 不运行 build、dev、debug、浏览器、Playwright、打包、截图或真实 GPU 验证，除非用户另行明确批准。
- 每项任务只暂存其所属文件；失败时只回滚该任务，不重置工作树。

## 受保护文件

以下用户修改必须保持当前内容、SHA、暂存状态和提交历史不变：

- crates/asset-io/Cargo.toml
  - SHA256: 9D22219E9F87C64E34BD201446C6CC2DC05EE91372C11C60A0D3FFA692DE7606
- crates/desktop-host/Cargo.toml
  - SHA256: 3713E909384117E3D3E8D63B246642A44FFEA51F90CCAF4D64B4C601B6C5900E

不得恢复、格式化、修改、暂存或提交这两个文件。

## 锁定接口与技术决策

### 持久化

- scene.environment.patch 的载荷严格为：

      { before: SceneEnvironment, after: SceneEnvironment }

- exact-before 在 apply、undo、redo 和恢复重放中均成立。
- material-texture 继续复用既有项目绑定导入、取消命令和自定义资产协议。
- 材质纹理导入必须在异步完成时复核 project、material exact-before 和 store generation。

### render-scene-3d 公共边界

- SceneRendererInput：snapshot、activeFloorId、selectedIds、活动 guided-route 投影、camera、assetIssues。
- SceneRecord：floor、wall-piece、opening、fixture-part、hotspot、route 六类稳定键记录。
- SceneProjectionIssue：稳定 code 和排序后的 source IDs；任一投影错误返回空场景，绝不发布部分结果。
- SceneRenderer/SceneRendererFactory：init、update、resize、frame、retry、destroy。
- SceneCameraState：position、target、fieldOfView。
- SceneExportPort：捕获不可变 scene/camera，列出所需纹理和 GPU 上限，等待纹理，以专用 render target 异步返回未翻转 RGBA。

### 几何、材质和环境

- 坐标固定为 (x / 1000, elevation / 1000, -y / 1000)。
- 楼面使用实体 elevation 或 0；墙高默认 3000 mm；路线高于基准面 30 mm。
- 墙沿中心线生成方头棱柱。开口生成前后全高段、门楣、窗台，并保留低对比轮廓/拾取代理；不使用 CSG。
- 七类展具使用 mode-showroom 描述符和持久尺寸；generic 兼容为单箱体，高度默认 1000 mm，但不进入 Showroom 目录。
- 默认材质：
  - space-floor：#445760 / roughness .90 / metalness 0 / opacity 1
  - wall：#c8d2d8 / roughness .82 / metalness 0 / opacity 1
  - fixture：#78909c / roughness .60 / metalness .08 / opacity 1
- UV 对整个目标局部边界只归一化一次：楼面平面映射、墙按累计长度/高度、展具按整体边界做确定性 box projection；不重复、不提供 UV 控件。
- 选择强调色为 #58b8c4，使用独立 overlay，不改底层材质。
- R3F 使用 demand frameloop、sRGB、ACES、一个环境光和一个方向光。
- 环境方向归一化后乘 10 m；阴影 radius = 1 + 7 * softness；阴影相机为场景边界加 10% padding。

### 生命周期

- R3F 自有资源设置 dispose={null}，由引用计数资源表唯一释放。
- 首次进入楼层自动 frame scene，之后按楼层恢复相机。
- 一次 context loss 自动重建一次；再次失败转 disabled，显式 retry 才开始新一轮。
- 新场景记录挂接完成后才释放旧记录；late resolve 以 generation 丢弃并释放。

---

## Task 0 — 保存计划基线

- [x] 完成
- 目标：保存本计划，锁定 HEAD、受保护文件、接口、任务顺序和验证边界。
- 前置条件：codex/aethertwin-m2@a58e01e5；M2.3 已验收。
- 涉及文件：docs/superpowers/plans/2026-08-03-aethertwin-m2-4-synchronized-3d.md。
- 实施步骤：
  1. 写入完整计划与基线。
  2. 核对两个受保护 manifest 的 SHA。
  3. 运行 git diff --check。
  4. 只暂存本文件并提交。
- 不应修改：任何产品源码、lockfile、受保护 manifest。
- 验收：文档覆盖 Task 0–18，基线和 SHA 精确。
- 测试命令：git diff --check。
- 预期：退出码 0。
- 失败检查：换行、尾随空格、错误工作树。
- 风险/回滚：只删除或修正文档提交，不影响产品状态。
- 提交：docs: plan AetherTwin M2.4 synchronized 3D

## Task 1 — TypeScript 环境命令

- [x] 完成
- 目标：在 project-store 增加可撤销的 scene.environment.patch。
- 前置条件：Task 0。
- 涉及文件：packages/project-store/src/scene-environment-command.ts、入口导出、project-store.ts、对应测试。
- 实施步骤：
  1. RED 覆盖严格键、边界、exact-before、after 规范化、逆载荷、apply/undo/redo。
  2. 实现命令解析和 ProjectStore.applySceneEnvironmentPatch。
  3. GREEN、类型检查、diff 检查。
- 不应修改：schema、Rust、Tauri 命令、其他集合命令。
- 验收：一次环境更新是一个可撤销、可重做的严格命令；无变化不发布。
- 测试命令：

      pnpm.cmd vitest run packages/project-store/src/scene-environment-command.test.ts packages/project-store/src/project-store.test.ts
      pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit

- 预期：全部通过。
- 失败检查：CommandBus codec、ProjectStore snapshot publication、SceneEnvironment validation。
- 风险/回滚：回滚 Task 1 提交；不得退化为通用 JSON patch。

## Task 2 — Rust 环境重放

- [x] 完成
- 目标：在 project-io/desktop-host 对 scene.environment.patch 实现同构重放与 allowlist。
- 前置条件：Task 1 接口已锁定。
- 涉及文件：project-io replay/model/tests、desktop-host payload validation/tests。
- 实施步骤：
  1. RED 覆盖 typed payload、exact-before、apply/undo/redo/recovery。
  2. 实现 Rust 命令解析与候选快照验证。
  3. 加入批次载荷 allowlist。
  4. GREEN、cargo check、diff 检查。
- 不应修改：schema、migration、八命令列表、capability、受保护 manifests。
- 验收：Rust 与 TypeScript 对合法/非法载荷一致；恢复不发布部分状态。
- 测试命令：

      cargo test -p project-io --test scene_environment_replay
      cargo test -p desktop-host --test command_contract scene_environment
      cargo check -p project-io -p desktop-host

- 预期：全部通过，原生命令仍为 8。
- 失败检查：journal replay dispatch、exact-before 比较、desktop-host payload allowlist。
- 风险/回滚：只回滚 Task 2；不得增加 migration 或 invoke。

## Task 3 — 材质纹理导入角色

- [x] 完成
- 目标：端到端增加 material-texture 导入角色。
- 前置条件：既有 asset-pipeline/import/cancel 边界可复用。
- 涉及文件：asset-pipeline、asset-io、Tauri DTO/适配器、Studio 选择器及测试。
- 实施步骤：
  1. RED 覆盖 PNG/JPEG/安全 SVG 接受，以及视频、远程 URL、未消毒 SVG、未知角色拒绝。
  2. 同步 TypeScript/Rust/Tauri 角色枚举和映射。
  3. GREEN、类型/Rust 验证、diff 检查。
- 不应修改：两个受保护 Cargo manifests、命令列表、自定义协议所有权。
- 验收：material-texture 只能通过既有本地项目绑定导入路径产生。
- 测试命令：聚焦 asset-pipeline、asset-io import pipeline、Tauri backend、desktop-host command contract。
- 预期：合法图片通过；所有不允许输入稳定拒绝。
- 失败检查：MIME/signature 映射、SVG sanitizer、DTO serde、picker accept。
- 风险/回滚：回滚新角色；不可用宽泛 image/* 或远程 fallback。

## Task 4 — ProjectStore 材质纹理事务与问题状态

- [x] 完成
- 目标：原子导入纹理并安全连接 MaterialDefinition。
- 前置条件：Task 3。
- 涉及文件：ProjectStore、资产引用/问题协调逻辑、测试。
- 实施步骤：
  1. RED 覆盖 import、cancel、undo/redo、project replace、stale completion、issue 保留/清理。
  2. 实现 importMaterialTexture(request, materialBefore)。
  3. 在一个 CommandBus 事务中增加 AssetRecord 并更新 MaterialDefinition。
  4. 只允许 transient ASSET_CODEC_PREVIEW_UNAVAILABLE 上报。
  5. 将 materials[].assetId 加入资产 issue 引用集合。
- 不应修改：持久 issue schema、blob URL 所有权、导入原生命令。
- 验收：异步完成前复核 project、material exact-before、store generation；失败不发布引用。
- 测试命令：ProjectStore 聚焦 Vitest 与 project-store TypeScript 检查。
- 预期：原子提交、精确撤销、stale completion 被丢弃。
- 失败检查：generation token、事务顺序、引用集合、cancel owner。
- 风险/回滚：回滚 Task 4，不允许先发布 AssetRecord 再补材质引用。

## Task 5 — 激活 render-scene-3d package

- [x] 完成
- 目标：创建真实 3D 包公共边界，不接入 UI。
- 前置条件：Task 0；网络可用于精确依赖。
- 涉及文件：packages/render-scene-3d/package.json、tsconfig.json、src/index.ts/公共类型、Studio package dependency、pnpm-lock.yaml、策略测试；删除 .gitkeep。
- 实施步骤：
  1. RED/策略测试锁定包边界和精确版本。
  2. 添加 react/react-dom 19.2.7、three 0.185.1、R3F 9.6.1、Drei 10.7.7。
  3. 更新 lockfile，运行 frozen install。
  4. typecheck 和 offline/workspace policy。
- 不应修改：UI、CDN、远程 runtime、依赖版本范围。
- 验收：包可独立类型检查，Studio 通过 workspace 引用使用。
- 测试命令：

      pnpm.cmd install --frozen-lockfile
      pnpm.cmd exec tsc -p packages/render-scene-3d/tsconfig.json --noEmit
      node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs

- 预期：精确依赖、无远程源、命令退出 0。
- 失败检查：peer dependency、lockfile importer、workspace policy。
- 风险/回滚：网络失败停止 Task 5；不换版本、不加 CDN。

## Task 6 — 坐标、楼面与投影失败原子性

- [x] 完成
- 目标：实现纯函数活动楼层楼面投影和原子错误。
- 前置条件：Task 5。
- 涉及文件：render-scene-3d projection/types/tests。
- 实施步骤：
  1. RED 覆盖正负轴、Transform2D、凹多边形、坏多边形、楼层过滤、深冻结、无部分场景。
  2. 实现毫米到米转换、稳定 key/source ID、不变 scene/bounds。
  3. 三角化 space-unit/zone 世界多边形并生成 positions/indices/UV。
  4. 汇总并排序错误 source IDs，错误时返回空场景。
- 不应修改：plan reference、boundary、dimension、普通 POI；它们必须被明确忽略。
- 验收：输入相同输出字节级稳定；任一投影错误无部分记录。
- 测试命令：render-scene-3d Task 6 聚焦 Vitest 和 package typecheck。
- 预期：全部通过。
- 失败检查：坐标符号、变换顺序、三角化、冻结、排序。
- 风险/回滚：回滚纯投影提交；不得把修复下放 Studio。

## Task 7 — 墙与门窗分段

- [x] 完成
- 目标：无 CSG 地生成稳定墙片和开口代理。
- 前置条件：Task 6。
- 涉及文件：render-scene-3d wall/opening projection/tests。
- 实施步骤：
  1. RED 覆盖直墙、折墙、多开口、门、窗、显式/默认高度、elevation、排序/source ID。
  2. 复用 wallMetricSegments/locateOpening。
  3. 按累计距离切分全高段、门楣、窗台。
  4. 生成低对比轮廓和可选拾取代理。
- 不应修改：2D wall geometry、持久记录、CSG。
- 验收：墙片选择映射 wall ID，开口代理映射 opening ID。
- 测试命令：render-scene-3d Task 7 聚焦 Vitest 和 typecheck。
- 预期：几何、排序和选择映射通过。
- 失败检查：累计距离、开口 clamp、折点切片、默认 3000 mm。
- 风险/回滚：回滚墙投影提交，不改变模型语义。

## Task 8 — 展具、热点和路线

- [x] 完成
- 目标：投影七类展具、generic、产品热点和 guided route。
- 前置条件：Tasks 6–7。
- 涉及文件：render-scene-3d fixture/content/route projection/tests。
- 实施步骤：
  1. RED 覆盖七类 descriptor、非均匀 XY scale、旋转、generic、热点、断开/过期路线和选择同步。
  2. 按 mode-showroom descriptor 投影每个 primitive part。
  3. generic 使用单箱体且默认高度 1000 mm。
  4. 热点使用克制标记；路线按 nodeIds 顺序抬升 30 mm。
- 不应修改：Showroom 目录、guided route 持久结构、route-engine。
- 验收：所有记录稳定键、源 ID、选择映射正确。
- 测试命令：render-scene-3d Task 8 聚焦 Vitest 和 typecheck。
- 预期：全部通过。
- 失败检查：descriptor 尺寸归一化、Transform2D、route validity、floor elevation。
- 风险/回滚：回滚投影层，不改变 durable fixture。

## Task 9 — 材质、UV 与环境映射

- [x] 完成
- 目标：确定性解析材质分配、纹理需求、UV、环境和选择 overlay。
- 前置条件：Tasks 4、6–8。
- 涉及文件：render-scene-3d material/environment projection/tests。
- 实施步骤：
  1. RED 覆盖三类 assignment、共享/缺失材质、UV 不重复、环境边界、非零方向和阴影开关。
  2. 实现 assignment 优先级与三类默认材质。
  3. 产生 requiredTextureAssetIds；故障纹理回退 baseColor。
  4. 映射 sRGB、透明度、整体目标 UV、环境和独立选择 overlay。
- 不应修改：MaterialDefinition、底层材质值、UV 控件、任意灯光。
- 验收：同一目标 UV 只归一化一次；故障纹理不阻断场景。
- 测试命令：render-scene-3d Task 9 聚焦 Vitest 和 typecheck。
- 预期：全部通过。
- 失败检查：assignment specificity、fingerprint、UV bounds、方向归一化。
- 风险/回滚：回滚映射提交；保持默认材质可用。

## Task 10 — 增量 reconciler 与资源表

- [x] 完成
- 目标：稳定 key 增量更新并精确一次释放资源。
- 前置条件：Tasks 6–9。
- 涉及文件：render-scene-3d reconciler/resource registry/tests。
- 实施步骤：
  1. RED 覆盖最小 upsert/remove、共享引用、材质更新、异步竞态、幂等销毁和精确一次 dispose。
  2. 几何按记录拥有；材质/纹理按指纹引用计数共享。
  3. 新记录挂接后释放旧资源。
  4. late texture resolve 以 generation 丢弃并释放。
  5. resolve/decode 失败上报安全 issue，保留 baseColor。
- 不应修改：ProjectStore blob URL 生命周期、R3F 自动 dispose。
- 验收：每一资源只由资源表释放一次；销毁可重复调用。
- 测试命令：render-scene-3d Task 10 聚焦 Vitest 和 typecheck。
- 预期：全部通过。
- 失败检查：ref count、generation、replacement order、failure cleanup。
- 风险/回滚：回滚 reconciler；不得以全场景重建隐藏泄漏。

## Task 11 — R3F、相机、上下文恢复和 M2.5 端口

- [x] 完成
- 目标：实现可注入的渲染器生命周期及真实离屏导出端口，不增加 UI。
- 前置条件：Task 10。
- 涉及文件：render-scene-3d renderer/R3F/camera/export port/tests。
- 实施步骤：
  1. RED 使用 fake R3F/Three/GL 覆盖相机、能力、纹理等待、readback、状态恢复和 dispose。
  2. 实现 Canvas、OrbitControls、点击选择、环境/阴影、frame scene/selection/route。
  3. 实现 WebGL 创建失败、context loss、一次自动重建、retry、初始化卸载和 replacement。
  4. SceneExportPort 捕获不可变 scene/camera，用独立 render target 异步读回未翻转 RGBA。
  5. 始终恢复可见 renderer 状态并释放临时资源。
- 不应修改：Studio UI、导出按钮、真实 GPU 声明。
- 验收：所有生命周期可通过 fake 注入精确验证；端口满足 M2.5。
- 测试命令：render-scene-3d Task 11 聚焦 Vitest 和 typecheck。
- 预期：全部通过，不声称浏览器/GPU。
- 失败检查：renderer state snapshot、context listener、auto retry counter、readback origin。
- 风险/回滚：回滚 renderer 提交；纯投影仍可保留。

## Task 12 — Zustand 会话状态与 Preview 工具策略

- [x] 完成
- 目标：增加瞬态 view/camera/status 和 Showroom Preview 工具组。
- 前置条件：Task 11 公共接口稳定。
- 涉及文件：editor-session、mode-showroom tool policy、visible actions、toolbar/Studio tests。
- 实施步骤：
  1. RED 覆盖 replaceSession 重置、scope-safe action、Market 隐藏、failed 禁用和真实回调。
  2. 增加 viewMode、按楼层 camera、renderer status/error。
  3. Showroom 增加 2D、3D、Split、Frame Selection、Frame Route。
  4. 不增加 Export。
- 不应修改：ProjectStore durable state、Market 工具、导出入口。
- 验收：默认 2D；replaceSession 清空 3D 会话；failed 禁用 3D/split。
- 测试命令：editor-session、mode-showroom tool policy、visible-actions、Studio typecheck。
- 预期：全部通过。
- 失败检查：session scope/generation、action registry、profile filter。
- 风险/回滚：回滚工具表面和状态一并提交，避免假按钮。

## Task 13 — SceneCanvas 与 2D/3D/split 集成

- [x] 完成
- 目标：把可注入 SceneRendererFactory 与现有编辑器完整同步。
- 前置条件：Tasks 11–12。
- 涉及文件：SceneCanvas、PlanEditor/布局、会话同步、CSS、测试。
- 实施步骤：
  1. RED 使用 fake renderer 覆盖模式切换、共享选择/楼层、拆装次数、错误降级、键盘树和焦点恢复。
  2. 生产路径复用 ProjectStore 资产源和 issue reporter。
  3. 3D 点击写共享 selectedIds；tree/2D 反向高亮。
  4. route、floor、camera、error 同步。
  5. split 固定 50/50，两个 renderer 同时挂载；失败回 2D，2D pane 永远保留。
  6. 用 session/project/floor generation 丢弃所有 late 事件。
- 不应修改：Market 2D、持久 camera、ProjectStore URL 所有权。
- 验收：切换无重复 renderer；失败不影响完整 2D 工作流。
- 测试命令：SceneCanvas/PlanEditor 聚焦 Vitest 和 Studio typecheck。
- 预期：全部通过。
- 失败检查：effect cleanup、factory identity、generation guards、focus owner。
- 风险/回滚：回滚 Studio 集成；render-scene-3d 保持独立。

## Task 14 — 材质 Inspector

- [x] 完成
- 目标：为 space-unit、zone、wall、fixture 提供 durable 材质编辑。
- 前置条件：Tasks 4、13。
- 涉及文件：material inspector、plan inspector/editor、asset picker/operation owner、CSS、测试。
- 实施步骤：
  1. RED 覆盖创建、切换、解除、共享编辑、边界、纹理进度/取消/修复、stale selection、重复提交、undo/redo。
  2. 显示折叠 Material 区域和 Default/已有/New Material。
  3. New 在一个事务中创建 definition+assignment；Default 只删 assignment。
  4. 编辑共享 definition 时显示影响对象数，不自动删除未引用 definition。
  5. 支持 baseColor、roughness、metalness、opacity、导入/替换/移除纹理。
- 不应修改：材质自动垃圾回收、多个 asset-operation owner、UV 控件。
- 验收：所有变更可撤销/重做；导入原子且 stale-safe。
- 测试命令：材质 Inspector/Studio/ProjectStore 聚焦 Vitest 与 Studio typecheck。
- 预期：全部通过。
- 失败检查：assignment target key、shared count、exact-before、operation owner。
- 风险/回滚：回滚 Inspector；不得绕过 ProjectStore。

## Task 15 — 环境 Inspector

- [x] 完成
- 目标：在 Project context 编辑已批准 singleton SceneEnvironment。
- 前置条件：Tasks 1–2、13。
- 涉及文件：environment inspector、plan inspector/editor、ProjectStore integration、Rust replay/recovery tests。
- 实施步骤：
  1. RED 覆盖表单验证、完整 payload、保存/undo/redo/reopen/recovery。
  2. 增加折叠 Environment 区域，仅显示批准字段。
  3. 一次提交完整 before/after；无变化不提交。
  4. 无效颜色、零方向、越界值停留 UI。
- 不应修改：schema、局部灯、任意环境集合。
- 验收：保存、撤销、重做、关闭重开、dirty recovery 完全一致。
- 测试命令：environment panel、ProjectStore payload、Studio integration、Rust replay/recovery。
- 预期：全部通过。
- 失败检查：form normalization、singleton lookup、command payload、recovery order。
- 风险/回滚：回滚 UI；保留底层命令兼容。

## Task 16 — 开发场景画廊

- [x] 完成
- 目标：提供确定性、本地、仅 DEV 的 3D 场景输入画廊。
- 前置条件：Task 13。
- 涉及文件：dev scene gallery、app route、deterministic fixture、tests。
- 实施步骤：
  1. RED 通过 fake renderer 验证路由和输入。
  2. 增加仅 import.meta.env.DEV 可达的 /dev/scene-gallery。
  3. 展示七类展具、墙/门/窗、凹楼面、热点、路线、缺失纹理、默认环境。
- 不应修改：生产工具栏、远程资产、浏览器测试。
- 验收：生产模式不可达；输入完全确定性和离线。
- 测试命令：scene gallery 聚焦 Vitest 和 Studio typecheck。
- 预期：fake renderer 断言通过。
- 失败检查：DEV guard、pathname routing、fixture IDs、remote URL policy。
- 风险/回滚：删除画廊路由即可，不影响产品运行。

## Task 17 — 完整 M2.4 垂直验收

- [x] 完成
- 实际证据：Studio 4/4、ProjectStore 1/1、render-scene-3d 2/2、project-io M2.4 1/1、schema_v3_recovery 8/8、scene_environment_replay 6/6、desktop-host command_contract 21/21、三组 TypeScript 检查、rustfmt 与 cargo check 通过；独立最终复审无 Critical/Important/Minor。
- 目标：用一个完整 schema-v3 showroom 验证 M2.4 全链路。
- 前置条件：Tasks 1–16。
- 涉及文件：聚焦集成/验收测试；仅修复验收暴露的 M2.4 缺口。
- 验收夹具：房间/区域、门窗、七类展具、generic、热点、guided route、三类材质和纹理。
- 实施步骤：
  1. RED/验收覆盖投影一致性、2D/3D/split、共享状态。
  2. 覆盖材质/环境 save-checkpoint-close-reopen 和 dirty recovery。
  3. 覆盖资源销毁和 WebGL 降级。
  4. 只修复明确缺口；做规格与代码审查。
- 不应修改：M2.5 UI、Market 3D、schema/命令边界。
- 验收：完整 fixture 可持久化、恢复、投影和安全降级。
- 测试命令：render-scene-3d、ProjectStore、Studio、project-io、desktop-host 聚焦测试及相关 typecheck。
- 预期：全部通过。
- 失败检查：按失败所属 Task 回溯，不弱化验收。
- 风险/回滚：回滚具体缺口修复，不回滚整分支。

## Task 18 — 文档、策略与全量非 build 门禁

- [x] 完成
- 当前状态：文档实现、完整非 build 门禁与最终独立 closure 复审均已完成；Task 18 与 M2.4 已验收关闭。
- 全量门禁实际证据：frozen install exit 0（14 个 workspace projects，Already up to date）；lint 首次 exit 1（M2.4 Task 5/16/17 引入的 8 个问题），五文件最小修正后 exit 0；typecheck exit 0（13/14）；Node 32/32；Vitest 68 files / 1355 tests；rustfmt exit 0；Rust tests 208 passed / 1 approved ignored；cargo check exit 0。schema v3、8 commands 与受保护 hashes 未变。
- 最终独立复审：Spec Compliance Pass；Code/Doc Quality Approved；Critical/Important/Minor None；Ready Yes。
- 目标：关闭 M2.4 文档与真实验证证据。
- 前置条件：Task 17。
- 涉及文件：README、ARCHITECTURE、PRODUCT_SPEC、PROJECT_FORMAT、ROADMAP、DECISIONS、HANDOFF、PLANS、本计划、恢复账本。
- 实施步骤：
  1. 更新 durable/transient 所有权、3D 边界、故障降级、M2.5 端口和明确排除项。
  2. 锁定 schema v3、八命令、离线源、无绝对路径、无 Export/Player/Market 假入口、Three 不拥有业务数据。
  3. 记录每条实际命令、测试数、失败与重试。
  4. 完成最终规格/代码审查并提交 closure。
- 不应修改：受保护 manifests、构建产物、凭据、无关文件。
- 验证命令：

      pnpm.cmd install --frozen-lockfile
      pnpm.cmd lint
      pnpm.cmd typecheck
      node --test tests/*.test.mjs
      pnpm.cmd vitest run
      cargo fmt --all -- --check
      cargo test -p asset-io
      cargo test -p project-io
      cargo test -p desktop-host
      cargo check -p asset-io -p project-io -p desktop-host
      git diff --check

- 预期：全部退出 0；如失败，记录原始失败、归因和重试，不声称未运行项。
- 失败检查：policy roots、lockfile、schema/command counters、Rust parity、stale docs。
- 风险/回滚：文档单独修正；实现失败回到所属任务提交，不重写历史。

---

## 每任务固定检查清单

- [ ] RED 测试先于实现，并确认因缺少目标行为而失败。
- [ ] 只实现让验收成立的最小行为。
- [ ] GREEN 和该任务列出的类型/Rust 检查实际通过。
- [ ] git diff --check 退出 0。
- [ ] 两个受保护 manifest SHA 与基线一致且未暂存。
- [ ] staged diff 只含该任务文件。
- [ ] 已完成规格符合性与代码质量审查。
- [ ] 一个任务一个提交，恢复账本已更新。

## 回滚和停止条件

- 依赖下载失败：停止 Task 5，不换版本、不添加 CDN。
- 发现 schema 或 Tauri invoke 必须变化：停止并回到设计决策，不自行扩边界。
- 发现需要修改任一受保护 manifest：停止并请求人工确认。
- 任一投影异常产生部分场景：视为阻断，不以警告降级。
- WebGL/R3F 故障不得阻断 2D；若无法保证，回滚 Studio 3D 集成。
- 未运行浏览器、截图或真实 GPU，因此最终不得宣称视觉正确性或 GPU 兼容性。
