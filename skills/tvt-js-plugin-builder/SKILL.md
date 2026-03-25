---
name: tvt-js-plugin-builder
description: "理解并扩展 TvT.js / icegl-three-vue-tres 的插件体系。适用于 TvT.js 工作区中出现 新建插件、新建案例、src/plugins、public/plugins、config.js、预览元数据、tvtstore、FES_APP_PLSNAME、pluginMaker、PLS、qiankun、uniAppView、GoView 或 zone3Deditor 等场景。用它处理插件脚手架、页面或案例新增、preview 条目更新、插件 ZIP 打包安装、单插件预览或构建，以及 qiankun、uni-app、zone-editor 兼容约束。"
---

# TvT.js 插件构建技能

## 概览

优先遵循 TvT.js 现有约定，不要临时发明新的插件结构。先读取本地代码事实，再按任务类型加载对应 reference。

- [references/foundation.md](references/foundation.md)
- [references/plugin-workflow.md](references/plugin-workflow.md)
- [references/preview-runtime.md](references/preview-runtime.md)
- [references/integrations.md](references/integrations.md)

## 开始前

1. 先把请求归类为 `new-plugin`、`new-case`、`preview-metadata`、`package-install`、`runtime-debug` 或 `integration-aware`。
2. 编辑前先核对本地事实源：
   - `package.json`
   - `.fes.js`
   - `.fes.predev.js`
   - `.fes.predev.one.js`
   - `.env`
   - `.env.predev`
   - `.env.predev.one`
   - `src/app.jsx`
   - `src/common/utils.js`
   - `src/plugins/preview.vue`
   - `pluginMaker/index.cjs`
   - 目标插件的 `src/plugins/<name>/config.js`
3. 始终守住这些核心规则：
   - 路由来源是 `src/plugins/**/pages/**/*.vue`
   - 页面层级只正式支持两层
   - 预览菜单来源是 `config.js`
   - 共享导出来源是 `index.js`
   - 静态资源归属在 `public/plugins/<plugin>`
   - `PLS` 指向 `src/plugins`
   - `config.require` 同时影响依赖检查和单插件资源保留

## 如何选择 Reference

- 需要看仓库基线、运行模式、别名、单插件过滤时，读 [references/foundation.md](references/foundation.md)
- 需要新建插件、加案例、改 `config.js`、改 `preview`、打包安装时，读 [references/plugin-workflow.md](references/plugin-workflow.md)
- 需要处理预览中心分类、线上菜单合并、`waitForGit`、筛选、二维码或外链跳转时，读 [references/preview-runtime.md](references/preview-runtime.md)
- 需要处理 `qiankun`、`uni-app`、小程序 WebView、`GoView`、`zone3Deditor` 时，读 [references/integrations.md](references/integrations.md)

## 新建或扩展插件

- 优先使用 `node pluginMaker/index.cjs create <pluginName>` 生成骨架
- 不要在模板上继续堆模板，优先替换这些文件：
  - `src/plugins/<pluginName>/config.js`
  - `src/plugins/<pluginName>/pages/index.vue`
  - `public/plugins/<pluginName>/preview/*`
- 新增案例时，把页面放到 `src/plugins/<plugin>/pages`
- 只使用这两种受支持的页面层级：
  - `pages/foo.vue` -> `/plugins/<plugin>/foo`
  - `pages/group/foo.vue` -> `/plugins/<plugin>/group/foo`
- 避免更深层级，`src/app.jsx` 会跳过不受支持的路径
- 只有当插件要对外暴露可复用组件或工具时，才新增 `src/plugins/<plugin>/index.js`
- 只要依赖了别的插件资源、导出或运行时假设，就维护好 `config.require`

## 修改预览元数据时要小心

- 本地页面驱动的条目里，`preview[].name` 应与 Vue 文件名一致
- `url` 型条目允许跳到外链或远程页面，这类条目可以没有本地 `.vue` 页面，但仍然必须有稳定的 `name`
- 普通插件使用 `preview`
- 类似 `basic` 的分组插件使用 `child[].preview`
- 预览条目至少要和这四个字段保持一致：
  - `src`
  - `type`
  - `name`
  - `title`
- 这些可选字段只在确实改变行为时再加：
  - `url`
  - `disableFPSGraph`
  - `disableSrcBtn`
  - `referenceSource`
- 只有需要进入插件市场或区域编辑器分类时，才设置 `tvtstore`

## 复用组件和资源

- 通过 `PLS/<plugin>` 导入其他插件暴露的公共能力
- 公共导出面要克制，不要把任意内部文件都当成公共 API
- 预览图、模型、纹理、json、geojson、音频等资源都放在 `public/plugins/<plugin>/...`
- 资源 URL 写法跟随周边代码，这个仓库里真实存在：
  - `plugins/...`
  - `./plugins/...`
  - `/plugins/...`
  - 完整 `https://...`

## 用最小必要模式验证

- 普通应用模式用 `yarn dev`
- 预览中心行为用 `yarn pre.dev`
- 单插件范围内的问题用 `yarn pre.dev.one`
- 交付是否依赖 `config.require` 和公共资源裁剪时，用 `yarn pre.build.one`
- 声称单插件行为前，确认 `.env.predev.one` 和 `FES_APP_PLSNAME`
- 最终总结里说明你依赖了哪些本地文件，以及对 `preview`、`tvtstore`、`require`、运行模式、集成目标做了什么假设
