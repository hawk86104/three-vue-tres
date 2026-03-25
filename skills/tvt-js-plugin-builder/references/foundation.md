# TvT.js 基础约定

## 本地事实源

- `package.json`
- `.env`
- `.env.predev`
- `.env.predev.one`
- `.fes.js`
- `.fes.predev.js`
- `.fes.predev.one.js`
- `src/app.jsx`
- `src/common/utils.js`
- `src/common/copySelectedPublicDirsPlugin.js`

## 核心技术栈

- Node.js 基线来自 `package.json`：`>=18.18`
- Vue：`3.5.x`
- Fes.js：`4.x`
- Tres.js：`5.x`
- three.js：`0.180.x`
- 构建链路：Fes 基于 Vite
- 会影响插件开发的仓库级附加能力：
  - UnoCSS
  - GLSL 加载
  - qiankun 微前端模式
  - module federation 动态组件场景

这些版本和构建钩子属于框架级约束，不是单个插件内部细节。

## 仓库布局

- `src/plugins/<plugin>`：插件源码
- `public/plugins/<plugin>`：插件公共资源
- `src/pages/index.vue`：普通应用模式首页
- `src/plugins/preview.vue`：启用预览首页时使用的入口
- `pluginMaker/`：创建、打包、安装、删除插件的工具目录

## 别名与发现机制

- `.fes.js` 把 `PLS` 映射到 `src/plugins`
- `src/app.jsx` 通过 `./plugins/**/pages/**/*.vue` 自动发现页面
- 正式支持的路由形态只有两种：
  - `src/plugins/<plugin>/pages/<page>.vue`
  - `src/plugins/<plugin>/pages/<group>/<page>.vue`
- 更深层级不在正式路由契约内
- `src/common/utils.js` 会读取 `PLS/*/config.js`，并缓存到 `window.pluginsConfig`

## 运行模式

- 普通应用模式：
  - `.env`
  - `FES_APP_PLUGINS=false`
  - `FES_APP_PREINDEX=false`
  - 脚本：`yarn dev`、`yarn build`
- 预览模式：
  - `.env.predev`
  - `FES_APP_PLUGINS=true`
  - `FES_APP_PREINDEX=true`
  - 脚本：`yarn pre.dev`、`yarn pre.build`
- 单插件预览或构建模式：
  - `.env.predev.one`
  - `FES_APP_PLUGINS=true`
  - `FES_APP_PREINDEX=true`
  - `FES_APP_PLSNAME='<plugin>'`
  - 脚本：`yarn pre.dev.one`、`yarn pre.build.one`

`FES_ENV` 与配置文件的映射：

- 默认 -> `.fes.js`
- `predev` -> `.fes.predev.js`
- `predev.one` -> `.fes.predev.one.js`

## 单插件过滤

当设置了 `FES_APP_PLSNAME`：

- `src/app.jsx` 只保留 `./plugins/<plugin>/pages/` 下的页面
- `src/common/utils.js` 只保留 `/src/plugins/<plugin>/config.js`
- `.fes.predev.one.js` 使用 `src/common/copySelectedPublicDirsPlugin.js`
- 最终复制到输出目录的公共资源只有：
  - 目标插件自己
  - `config.require` 里声明的依赖插件

## 额外注意点

- 只有在 `FES_APP_PREINDEX=true` 时，`src/app.jsx` 才会把 `/` 首页替换成 `src/plugins/preview.vue`
- `.fes.js` 会把 `src/plugins/goView/lib/scss/style.scss` 注入到 `src/plugins/goView` 和 `src/plugins/zone3Deditor` 下的样式处理中
- `.fes.js` 开启了 qiankun 微前端模式，并配合 `src/app.jsx` 处理注入公共路径
