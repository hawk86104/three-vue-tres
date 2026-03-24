# preview-center 规范

## 目的

定义预览首页这一项能力：插件元数据如何转换为可浏览的菜单、预览区块、线上菜单补充信息，以及不同分类在预览体验中的呈现方式。

## 职责边界

### 本规范覆盖

- `src/plugins/preview.vue` 作为预览中心主入口
- `basic`、`caseCenter`、`Tvtstore`、`zoneEditor` 的分类规则
- 预览侧的菜单计数、筛选、滚动定位、哈希跳转
- `getOnlinePluginConfig` 驱动的线上菜单补充逻辑
- 基于插件元数据的预览卡片行为
- 仅属于预览模式的 UI 约定，不应反向污染普通项目模式

### 本规范不覆盖

- 插件路由在构建或运行时是如何被发现的
- 插件如何被打包或安装
- `qiankun`、小程序或 `uni-app` 容器如何嵌入页面
- 单个案例页面的具体实现细节

## 主要代码依据

- `src/plugins/preview.vue`
- `src/common/utils.js`
- `src/stores/forPreview.js`
- `src/components/forPreview/cardList.vue`
- `src/components/forPreview/filterComFixed.vue`

## 要求

### Requirement: 预览分类规则

预览中心 SHALL 按稳定规则对插件进行分类：`basic` 作为基础功能分组专区；未声明 `tvtstore` 的普通插件归入 `caseCenter`；声明了 `tvtstore` 且插件名以 `zone` 开头的插件归入 `zoneEditor`；声明了 `tvtstore` 且插件名不以 `zone` 开头的插件归入 `Tvtstore`。

#### Scenario: basic 分类

- GIVEN 插件键名为 `basic`
- WHEN 预览中心生成左侧菜单和内容区
- THEN 该插件 SHALL 进入基础功能分组区域

#### Scenario: 普通案例分类

- GIVEN 某插件未声明 `tvtstore`
- WHEN 预览中心计算分类
- THEN 该插件 SHALL 归入 `caseCenter`

#### Scenario: 区域场景编辑器分类

- GIVEN 某插件声明了 `tvtstore`
- AND 插件名以 `zone` 开头
- WHEN 预览中心计算分类
- THEN 该插件 SHALL 归入 `zoneEditor`

#### Scenario: 插件市场分类

- GIVEN 某插件声明了 `tvtstore`
- AND 插件名不以 `zone` 开头
- WHEN 预览中心计算分类
- THEN 该插件 SHALL 归入 `Tvtstore`

### Requirement: 预览菜单与计数行为

预览中心 SHALL 将分类结果体现在左侧菜单、内容分区和计数统计中。`basic` 的计数 SHALL 汇总其 `child[].preview` 数量；其他分类插件的计数 SHALL 基于顶层 `preview.length` 计算。

#### Scenario: basic 计数

- GIVEN `basic` 插件存在多个 `child` 分组
- WHEN 预览中心计算基础功能数量
- THEN SHALL 汇总所有 `child[].preview` 的总数

#### Scenario: 非 basic 计数

- GIVEN 一个普通插件含有顶层 `preview`
- WHEN 预览中心计算对应分类数量
- THEN SHALL 使用该插件 `preview.length`

### Requirement: 线上菜单补充与本地优先

预览中心 MAY 从线上接口补充插件菜单信息，但本地代码配置 SHALL 始终是事实源。线上数据只允许补充本地缺失的插件条目或预览项，不得覆盖本地已有同名预览项。

#### Scenario: 本地已有预览项

- GIVEN 本地配置已存在某个 `preview.name`
- WHEN 线上接口返回同名预览项
- THEN 预览中心 SHALL 保留本地项为主
- AND 不得用线上项替换本地项

#### Scenario: 本地缺失预览项

- GIVEN 本地插件已存在，但线上返回了本地没有的预览项
- WHEN 预览中心合并菜单数据
- THEN 系统 SHALL 追加这些缺失项

#### Scenario: 本地缺失整个插件条目

- GIVEN 本地不存在某插件配置
- WHEN 线上接口返回了该插件条目
- THEN 系统 SHALL 允许将该插件作为补充条目加入预览中心

### Requirement: waitForGit 提示归属

当线上菜单补充引入了本地尚未同步的插件或预览项时，预览中心 SHALL 通过 `waitForGit` 等标记和提示文案向用户展示“线上已更新、本地待同步”的状态。这一提示属于预览中心的正式 UI 行为，而不是独立运维说明。

#### Scenario: 本地待同步提示

- GIVEN 预览项或插件条目来自线上补充而非本地代码
- WHEN 预览中心渲染卡片
- THEN 该条目 SHALL 带有待同步状态标记
- AND 预览界面 SHALL 显示对应提示文案

### Requirement: 预览交互为正式行为

预览中心的筛选、哈希跳转、分区滚动定位和分类展示 SHALL 被视为正式行为，不应视为偶然实现细节。后续若要调整这些行为，应先更新规范。

#### Scenario: 菜单点击滚动定位

- GIVEN 用户点击左侧菜单中的一个插件或分组
- WHEN 预览中心处理该交互
- THEN 内容区 SHALL 滚动到对应分区
- AND 路由哈希 SHALL 同步更新
