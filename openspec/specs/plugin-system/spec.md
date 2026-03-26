# plugin-system 规范

## 目的

定义 TvT.js 的插件契约：包括目录布局、路由发现规则、元数据约定、资源归属、依赖声明方式，以及跨插件复用的基本模式。

## 职责边界

### 本规范覆盖

- `src/plugins/<plugin>` 下的插件源码结构
- `public/plugins/<plugin>` 下的静态资源结构
- 基于 `src/plugins/**/pages/**/*.vue` 的路由发现机制
- 当前支持的页面嵌套层级
- `config.js` 作为插件元数据源的角色
- `preview` 与 `child[].preview` 的使用约定
- `require` 依赖声明的语义
- 通过 `index.js` 暴露共享能力
- 基于 `PLS` 别名的跨插件导入模式
- 开源仓库插件条目与插件市场源码交付的边界

### 本规范不覆盖

- 预览中心的分类展示逻辑与计数逻辑
- 运行模式切换细节
- 宿主应用或外部容器的集成行为
- 单个案例页面的内部实现细节

## 主要代码依据

- `src/app.jsx`
- `src/common/utils.js`
- `src/common/copySelectedPublicDirsPlugin.js`
- `pluginMaker/index.cjs`
- `src/components/forPreview/cardList.vue`
- `src/components/forPreview/oneImageQr.vue`
- `src/components/forPreview/suspenseLayout.vue`
- `src/plugins/basic/config.js`
- `src/plugins/goView/config.js`
- `src/plugins/qiankunTvt/config.js`
- `src/plugins/zone3Deditor/config.js`
- `src/plugins/uniAppView/config.js`

## 要求

### Requirement: 插件命名空间一致性

TvT.js 插件 SHALL 使用单一插件标识作为主命名空间，并在源码目录、公共资源目录、路由前缀和配置元数据中保持一致。默认情况下，该插件标识应与 `src/plugins/<plugin>` 的目录名一致；`config.js` 中的 `name` 也 SHALL 与该插件标识保持一致。

#### Scenario: 标准插件命名空间一致

- GIVEN 一个目录为 `src/plugins/water` 的插件
- WHEN 系统发现其页面和配置
- THEN 该插件的公共资源命名空间应位于 `public/plugins/water`
- AND 该插件的页面路由前缀应位于 `/plugins/water/...`
- AND `src/plugins/water/config.js` 中的 `name` 应为 `water`

#### Scenario: 维护者新增插件

- GIVEN 维护者通过脚手架或手工方式新建一个插件
- WHEN 该插件被纳入 TvT.js 插件系统
- THEN 维护者 SHALL 先确定唯一插件标识
- AND 后续目录、配置、资源、路由 SHALL 统一使用该标识

### Requirement: 插件页面发现与路由层级

可被 TvT.js 自动发现并注册路由的插件页面 SHALL 放在 `src/plugins/<plugin>/pages/` 下，且仅允许两种受支持的页面层级：`pages/<page>.vue` 与 `pages/<group>/<page>.vue`。维护者 SHALL 不依赖更深层级的页面目录作为正式路由契约。

#### Scenario: 一级页面路由

- GIVEN 存在页面文件 `src/plugins/foo/pages/bar.vue`
- WHEN 预览类模式启用插件路由发现
- THEN 系统 SHALL 为其注册路由 `/plugins/foo/bar`

#### Scenario: 二级页面路由

- GIVEN 存在页面文件 `src/plugins/basic/pages/base/theBasic.vue`
- WHEN 预览类模式启用插件路由发现
- THEN 系统 SHALL 为其注册路由 `/plugins/basic/base/theBasic`

#### Scenario: 不受支持的更深层级

- GIVEN 维护者尝试使用 `src/plugins/foo/pages/a/b/c.vue`
- WHEN 该页面被纳入插件设计
- THEN 该页面层级 SHALL 视为超出当前正式插件路由契约
- AND 维护者 SHALL 不将其作为受支持能力写入规范或技能

### Requirement: config.js 最小强制字段

每个正式插件的 `config.js` SHALL 至少包含以下强制字段：`name`、`title`、`intro`、`version`、`author`、`website`、`state`、`require`，以及一个展示入口字段：标准插件使用 `preview`，分组插件使用 `child`。当前仓库中的正式插件配置均满足这组最小字段约束，后续插件也 SHALL 遵循这组下限。

#### Scenario: 标准插件的最小字段集合

- GIVEN 一个普通插件采用平铺展示
- WHEN 维护者编写其 `config.js`
- THEN 该配置 SHALL 包含 `name`、`title`、`intro`、`version`、`author`、`website`、`state`、`require`、`preview`

#### Scenario: basic 分组插件的最小字段集合

- GIVEN 当前唯一正式分组插件 `basic`
- WHEN 维护者维护其 `config.js`
- THEN 该配置 SHALL 包含 `name`、`title`、`intro`、`version`、`author`、`website`、`state`、`require`、`child`
- AND 不要求同时再声明顶层 `preview`

### Requirement: config.js 推荐与条件字段

除最小强制字段外，`creatTime`、`updateTime` 应作为推荐字段保留；`tvtstore` 仅在插件需要被归入插件市场或区域场景编辑器分类时才作为条件字段出现。未进入这两类分类的插件 MAY 不声明 `tvtstore`。

#### Scenario: 常规案例插件

- GIVEN 一个普通案例型插件
- WHEN 其不需要进入插件市场或区域场景编辑器分类
- THEN 该插件 MAY 不声明 `tvtstore`

#### Scenario: 插件市场或区域类插件

- GIVEN 一个插件需要在预览中心按插件市场或区域场景编辑器类别展示
- WHEN 维护者定义其展示分类
- THEN 该插件 SHALL 通过 `tvtstore` 等分类相关字段进入对应类别

### Requirement: 分组插件支持范围

当前正式受支持的分组型插件 SHALL 仅有 `basic`。其他插件 SHALL 默认采用标准平铺插件模式，不应自行扩展为新的分组型插件规范；若未来确需新增分组型插件，应先更新规范再落地实现。

#### Scenario: 现有分组支持范围

- GIVEN 当前仓库中的插件集合
- WHEN 维护者定义分组型插件支持范围
- THEN 仅 `basic` SHALL 被视为正式分组型插件

#### Scenario: 新插件默认形态

- GIVEN 维护者新增一个非 `basic` 插件
- WHEN 未经过额外规范扩展
- THEN 该插件 SHALL 默认使用标准插件形态
- AND 不应直接引入新的 `child` 分组契约

### Requirement: 插件元数据源

每个被插件系统识别的插件 SHALL 在 `src/plugins/<plugin>/config.js` 中定义元数据。面向预览中心展示的标准插件 SHALL 提供 `preview` 数组；面向分组展示的插件 SHALL 提供 `child[].preview`。插件元数据至少 SHALL 明确插件身份与展示入口，不得将展示入口仅散落在页面文件中而缺失 `config.js`。

#### Scenario: 标准插件使用 preview

- GIVEN 一个普通插件采用平铺展示
- WHEN 预览中心读取该插件配置
- THEN 该插件的 `config.js` SHALL 提供 `preview`
- AND 对于指向本地页面的条目，`preview[].name` 应与对应页面文件名保持一致

#### Scenario: 分组插件使用 child

- GIVEN 一个类似 `basic` 的分组型插件
- WHEN 预览中心读取该插件配置
- THEN 该插件的 `config.js` SHALL 提供 `child`
- AND 每个子分组的展示入口 SHALL 位于对应的 `child[].preview`

#### Scenario: 外链或远程预览条目

- GIVEN 某个 `preview` 条目通过 `url` 直接跳转到外链或远程页面
- WHEN 维护者配置该条目
- THEN 该条目 MAY 不对应本地 `pages/*.vue` 文件
- AND 该条目仍 SHALL 保持稳定的 `name` 以供菜单、哈希和二维码等预览行为使用

### Requirement: preview 条目最小字段与运行时扩展

每个 `preview` 或 `child[].preview` 条目 SHALL 至少包含 `src`、`type`、`name`、`title`。当前预览渲染层正式支持 `img`、`text`、`video` 三类 `type`；`url`、`disableFPSGraph`、`disableSrcBtn`、`referenceSource` 作为可选运行时扩展字段 MAY 出现，并分别影响跳转目标、调试面板显示与参考来源展示。

#### Scenario: 本地页面驱动的预览条目

- GIVEN 一个普通案例页面需要进入预览中心
- WHEN 维护者编写对应 `preview` 条目
- THEN 该条目 SHALL 至少声明 `src`、`type`、`name`、`title`
- AND 若未声明 `url`，该条目 SHOULD 对应本地受支持的插件页面路由

#### Scenario: 带运行时扩展字段的预览条目

- GIVEN 某个预览条目需要跳转外链、隐藏调试按钮或展示参考出处
- WHEN 维护者编写该条目
- THEN 该条目 MAY 使用 `url`、`disableFPSGraph`、`disableSrcBtn`、`referenceSource`
- AND 这些字段 SHALL 被视为正式预览契约的一部分，而不是临时展示参数

### Requirement: 插件资源归属

插件的公共静态资源 SHALL 归属在 `public/plugins/<plugin>` 名下，包括但不限于预览图、模型、纹理、配置文件、音视频和运行时加载资源。插件实现可以按周边代码选择 `plugins/...`、`./plugins/...`、`/plugins/...` 或完整 `https://...` 地址的访问形式，但 SHALL 不将插件公共资源无序散落到其他插件命名空间中。

#### Scenario: 预览图归属到插件命名空间

- GIVEN 一个插件需要在预览中心显示缩略图
- WHEN 维护者新增预览图片
- THEN 该图片 SHALL 放在 `public/plugins/<plugin>/preview/` 或其下级目录

#### Scenario: 场景资源与模型归属

- GIVEN 一个插件需要加载模型、贴图或配置 JSON
- WHEN 维护者准备公共资源
- THEN 这些资源 SHALL 优先放在 `public/plugins/<plugin>/...`
- AND 不应默认放到其他插件的公共目录中复用

#### Scenario: 远程托管资源或外链预览

- GIVEN 某个预览图或跳转目标由外部站点托管
- WHEN 维护者配置该资源或预览条目
- THEN 该条目 MAY 使用完整 `https://...` 地址
- AND 这不改变该插件本地源码与公共资源仍以 `<plugin>` 命名空间归属的约定

### Requirement: 插件依赖声明

当一个插件在运行期、预览期或单插件构建期依赖其他插件资源或共享能力时，该插件 SHALL 在 `config.require` 中显式声明依赖项。非单插件模式下，系统 SHALL 对声明依赖进行存在性检查；单插件构建时，系统 SHALL 基于 `config.require` 保留目标插件及其依赖插件的公共资源目录。

#### Scenario: 本地缺失依赖插件

- GIVEN 某插件在 `config.require` 中声明依赖 `floor`
- WHEN 系统在非单插件模式下加载插件配置
- THEN 系统 SHALL 检查本地是否存在 `floor` 插件配置
- AND 当依赖不存在时，系统 SHALL 给出缺失提示并指向插件市场安装入口

#### Scenario: 单插件构建保留依赖资源

- GIVEN 当前单插件构建目标为 `qiankunTvt`
- AND `qiankunTvt` 在 `config.require` 中声明了 `floor` 与 `medical`
- WHEN 运行单插件构建流程
- THEN 构建输出 SHALL 保留 `qiankunTvt`、`floor`、`medical` 对应的公共资源目录

### Requirement: 共享导出与跨插件复用

当插件需要向其他插件暴露可复用组件、工具或组合能力时，该插件 SHALL 通过 `src/plugins/<plugin>/index.js` 作为公共导出面，并通过 `PLS/<plugin>` 被其他插件引用。维护者 SHALL 避免把私有实现细节作为默认跨插件导入路径。

#### Scenario: 导出公共能力

- GIVEN 插件 `floor` 需要暴露可被其他插件复用的能力
- WHEN 维护者设计该插件的公共接口
- THEN 这些能力 SHALL 从 `src/plugins/floor/index.js` 暴露
- AND 使用方插件 SHALL 优先通过 `PLS/floor` 导入

### Requirement: 插件市场与开源仓库边界

TvT.js 的开源仓库插件清单 SHALL 与插件市场中的源码交付能力解耦。开源仓库 MAY 仅保留某些市场插件的配置、预览资源或接入点，而不直接包含其完整源码实现；此类插件应被视为“可预览、可登记、可安装”的插件条目，而不是“源码已随仓库分发”的插件。此类条目 SHALL 被视为可扩展集合，而不是单一特例；`zone3Deditor` 在当前开源仓库中 SHALL 被视为此类条目之一，而不是唯一条目。

#### Scenario: zone3Deditor 在开源仓库中的形态

- GIVEN 当前开源仓库存在 `src/plugins/zone3Deditor/config.js`
- AND 当前开源仓库存在 `public/plugins/zone3Deditor/preview/...`
- AND 当前开源仓库未包含 `src/plugins/zone3Deditor/pages/...` 等完整编辑器源码
- WHEN 维护者阅读或扩展插件系统规范
- THEN SHALL 将 `zone3Deditor` 视为区域场景编辑器的配置/预览接入条目
- AND 不得默认推断其完整编辑器源码已随开源仓库一并提供

#### Scenario: 市场插件的授权安装

- GIVEN 某插件源码通过插件市场授权交付
- WHEN 维护者将插件 ZIP 放入 `pluginMaker/install/` 并执行安装命令
- THEN 该插件 SHALL 通过既有插件安装流程接入本地仓库
- AND 其源码是否进入仓库，应以授权交付与安装结果为准，而不是以预览清单是否存在为准
