# runtime-modes 规范

## 目的

定义 TvT.js 在普通项目模式、预览模式、单插件模式之间的切换方式，包括每种模式由哪些环境变量控制，以及这些变量如何影响路由和启动行为。

## 职责边界

### 本规范覆盖

- 通过 `.env`、`.env.predev`、`.env.predev.one` 进行模式切换
- `FES_APP_PLUGINS` 控制的行为
- `FES_APP_PREINDEX` 控制的行为
- `FES_APP_PLSNAME` 控制的行为
- `src/app.jsx` 如何根据不同模式修改路由与启动逻辑
- `package.json` 中模式脚本的职责边界
- `.fes.js`、`.fes.predev.js`、`.fes.predev.one.js` 的项目约定映射
- 预览相关远程菜单数据的加载条件

### 本规范不覆盖

- 单个插件内部如何组织实现
- 预览卡片字段设计
- ZIP 打包格式细节
- `qiankun` 或 `uni-app` 容器中的专属集成约束

## 主要代码依据

- `.env`
- `.env.predev`
- `.env.predev.one`
- `package.json`
- `src/app.jsx`
- `src/common/utils.js`
- `src/plugins/preview.vue`
- `.fes.js`
- `.fes.predev.js`
- `.fes.predev.one.js`

## 要求

### Requirement: 模式预设与脚本映射

TvT.js 仓库 SHALL 通过环境变量预设与 `package.json` 脚本来定义运行模式，而不是通过临时修改业务代码切换模式。普通项目模式、预览模式、单插件模式 SHALL 分别由稳定的脚本入口与环境文件组合驱动。

#### Scenario: 普通项目模式脚本

- GIVEN 维护者执行 `yarn dev` 或 `yarn build`
- WHEN 未显式切换到 `predev` 或 `predev.one`
- THEN 系统 SHALL 进入普通项目模式
- AND 其默认行为应以 `.env` 与 `.fes.js` 为基础

#### Scenario: 预览模式脚本

- GIVEN 维护者执行 `yarn pre.dev` 或 `yarn pre.build`
- WHEN `FES_ENV=predev`
- THEN 系统 SHALL 进入预览模式
- AND 其行为应以 `.env.predev` 与 `.fes.predev.js` 为基础

#### Scenario: 单插件模式脚本

- GIVEN 维护者执行 `yarn pre.dev.one` 或 `yarn pre.build.one`
- WHEN `FES_ENV=predev.one`
- THEN 系统 SHALL 进入单插件模式
- AND 其行为应以 `.env.predev.one` 与 `.fes.predev.one.js` 为基础

### Requirement: FES_ENV 与配置文件约定

TvT.js 项目 SHALL 将不同 `FES_ENV` 与配置文件的对应关系视为项目级运行约定：默认环境对应 `.fes.js`，`predev` 对应 `.fes.predev.js`，`predev.one` 对应 `.fes.predev.one.js`。维护者在调整脚本或环境配置时 SHALL 保持这组映射稳定。

#### Scenario: 维护脚本时保持映射稳定

- GIVEN 维护者调整 `package.json` 中的运行脚本
- WHEN 这些脚本继续代表普通、预览、单插件三种模式
- THEN 其 `FES_ENV` 与配置文件的对应关系 SHALL 保持不变

### Requirement: 普通项目模式行为

当 `FES_APP_PLUGINS=false` 时，系统 SHALL 将当前运行视为普通项目模式。在该模式下，系统 SHALL 不自动为 `src/plugins/**/pages/**/*.vue` 注册插件路由，并 SHALL 保持普通项目首页语义，不以预览中心替换默认首页。

#### Scenario: 普通项目模式不注入插件路由

- GIVEN 当前环境中 `FES_APP_PLUGINS=false`
- WHEN `src/app.jsx` 执行 `patchRoutes`
- THEN 系统 SHALL 不自动追加 `/plugins/...` 路由集合

#### Scenario: 普通项目模式不替换为预览首页

- GIVEN 当前环境中 `FES_APP_PLUGINS=false`
- WHEN `src/app.jsx` 执行 `modifyRoute`
- THEN 系统 SHALL 不以 `src/plugins/preview.vue` 替换根路由首页
- AND 应保持普通项目模式下的默认首页语义

### Requirement: 预览模式行为

当 `FES_APP_PLUGINS=true` 时，系统 SHALL 启用插件路由发现；当同时 `FES_APP_PREINDEX=true` 时，系统 SHALL 使用预览中心作为根首页。预览模式的目标是面向插件与案例展示，而不是普通业务项目首页。

#### Scenario: 预览模式发现插件页面

- GIVEN 当前环境中 `FES_APP_PLUGINS=true`
- WHEN `src/app.jsx` 扫描 `./plugins/**/pages/**/*.vue`
- THEN 系统 SHALL 根据受支持的页面层级注册 `/plugins/<plugin>/...` 路由

#### Scenario: 预览模式替换根首页

- GIVEN 当前环境中 `FES_APP_PREINDEX=true`
- WHEN `src/app.jsx` 执行 `modifyRoute`
- THEN 根路径 `/` 的首页组件 SHALL 被替换为 `src/plugins/preview.vue`
- AND 该首页的路由元信息 SHALL 标识为预览中心语义

### Requirement: 单插件模式过滤

当设置 `FES_APP_PLSNAME` 时，系统 SHALL 将当前运行限定为指定插件的单插件模式。该模式下，插件页面发现、插件配置发现以及单插件构建输出 SHALL 共同围绕目标插件及其显式声明依赖进行过滤。

#### Scenario: 单插件模式过滤页面路由

- GIVEN 当前环境中 `FES_APP_PLSNAME='qiankunTvt'`
- WHEN `src/app.jsx` 进行页面扫描
- THEN 系统 SHALL 仅保留 `./plugins/qiankunTvt/pages/` 下的页面参与路由注册

#### Scenario: 单插件模式过滤插件配置

- GIVEN 当前环境中 `FES_APP_PLSNAME='qiankunTvt'`
- WHEN `src/common/utils.js` 读取 `PLS/*/config.js`
- THEN 系统 SHALL 仅保留 `qiankunTvt` 的插件配置进入当前配置集合

#### Scenario: 单插件模式过滤公共资源

- GIVEN 当前环境中 `FES_APP_PLSNAME='qiankunTvt'`
- AND `qiankunTvt` 在 `config.require` 中声明了依赖插件
- WHEN 执行 `yarn pre.build.one`
- THEN 构建流程 SHALL 仅复制目标插件及其声明依赖所需的公共资源目录

### Requirement: 预览标签菜单设置加载条件

预览标签与徽标相关的 `menuSetup` 远程数据 SHALL 由 `src/app.jsx` 的启动前逻辑控制：当 `FES_APP_PLUGINS=true` 且处于开发环境时，或显式开启 `FES_APP_ONLINE_API` 时，系统 SHALL 调用 `getMenu()` 加载这类数据。该条件独立于是否处于单插件模式。

#### Scenario: 本地预览模式加载 menuSetup

- GIVEN 当前处于开发环境
- AND `FES_APP_PLUGINS=true`
- WHEN 应用执行启动前初始化
- THEN 系统 SHALL 调用 `getMenu()` 加载预览标签与徽标设置

#### Scenario: 普通项目模式不主动加载 menuSetup

- GIVEN 当前环境中 `FES_APP_PLUGINS=false`
- AND 未开启 `FES_APP_ONLINE_API`
- WHEN 应用执行启动前初始化
- THEN 系统 SHALL 不因预览机制而主动加载 `menuSetup` 远程数据

### Requirement: 线上插件菜单补充加载条件

预览中心中的 `getOnlinePluginConfig()` 线上插件菜单补充 SHALL 由 `src/plugins/preview.vue` 单独控制：仅当 `NODE_ENV='development'` 且未设置 `FES_APP_PLSNAME` 时，或显式开启 `FES_APP_ONLINE_API` 时，系统才 SHALL 拉取线上发布菜单并与本地配置合并。

#### Scenario: 本地多插件预览模式补充线上菜单

- GIVEN 当前处于开发环境
- AND 未设置 `FES_APP_PLSNAME`
- WHEN 预览中心初始化插件配置
- THEN 系统 SHALL 允许拉取线上发布菜单作为本地配置补充

#### Scenario: 单插件模式默认不做线上插件菜单补充

- GIVEN 当前处于本地单插件模式
- AND `FES_APP_PLSNAME` 已设置
- AND 未开启 `FES_APP_ONLINE_API`
- WHEN 预览中心决定是否拉取线上插件菜单补充
- THEN 系统 SHALL 默认跳过该线上补充逻辑

#### Scenario: 线上 API 开关覆盖默认条件

- GIVEN 当前已显式开启 `FES_APP_ONLINE_API`
- WHEN 应用进行预览初始化
- THEN `menuSetup` 加载与线上插件菜单补充 SHALL 都允许执行
- AND 不再受本地是否单插件模式的默认限制
