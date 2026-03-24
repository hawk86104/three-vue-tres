# external-integrations 规范

## 目的

定义 TvT.js 与外部系统耦合或嵌入时的边界，包括 `qiankun` 宿主、小程序/`uni-app` WebView、`zone3Deditor` 导出链路，以及 `GoView` 低代码 UI 组合场景。

## 职责边界

### 本规范覆盖

- `qiankun` 子应用生命周期与宿主状态桥接
- `qiankun` 模式下的公共路径与容器感知约束
- `uni-app` 与小程序 WebView 的兼容预期
- 面向 `zone3Deditor` 的插件/导出友好性要求
- 与 `GoView` 相关、且会影响 TvT.js 插件开发的导入导出关系

### 本规范不覆盖

- 已由 `plugin-system` 负责的一般插件目录与配置约定
- 预览中心菜单逻辑
- 除非直接影响集成交付，否则不展开打包机制细节
- 外部产品自身的全部行为，只讨论 TvT.js 需要满足的契约部分

## 主要代码依据

- `.fes.js`
- `src/app.jsx`
- `src/components/forPreview/cardList.vue`
- `src/plugins/qiankunTvt/config.js`
- `src/plugins/uniAppView/config.js`
- `src/plugins/zone3Deditor/config.js`
- `src/plugins/goView/config.js`

## 要求

### Requirement: qiankun 硬性兼容要求

当 TvT.js 作为 `qiankun` 子应用运行时，系统 SHALL 兼容容器宿主模式，包括注入公共路径、暴露生命周期钩子，以及在需要时接收宿主全局状态。

#### Scenario: qiankun 公共路径注入

- GIVEN 当前运行环境由 `qiankun` 宿主驱动
- WHEN 子应用启动
- THEN 系统 SHALL 读取 `__INJECTED_PUBLIC_PATH_BY_QIANKUN__`
- AND SHALL 将该路径暴露给运行时使用

#### Scenario: qiankun 状态桥接

- GIVEN 宿主应用向子应用传递全局状态
- WHEN `mount` 生命周期执行
- THEN TvT.js SHALL 通过既有桥接逻辑接收状态变更

### Requirement: 嵌入式容器兼容基线

面向 `qiankun`、`uni-app` WebView、小程序 WebView 等嵌入式容器的页面与插件 SHALL 避免依赖会破坏容器宿主的全局假设，例如强依赖全屏、未防护的浏览器专属 API、不可控的全局副作用。

#### Scenario: WebView 中使用浏览器专属能力

- GIVEN 某插件计划在 WebView 或嵌入容器中运行
- WHEN 其需要访问浏览器专属全局对象或交互能力
- THEN 维护者 SHALL 先进行环境防护或降级处理

### Requirement: uni-app 与小程序接入要求

面向 `uni-app` 与小程序生态的预览跳转和页面接入 SHALL 通过稳定路由和显式桥接完成，不得默认假设桌面浏览器跳转语义总是成立。

#### Scenario: 小程序环境跳转

- GIVEN 当前页面运行在小程序容器中
- WHEN 预览中心跳转到具体案例
- THEN 系统 SHALL 使用适配小程序环境的跳转逻辑
- AND 不应直接假设 `window.open` 始终可用

### Requirement: zone3Deditor 友好性要求

当插件或场景目标包含 `zone3Deditor` 相关导出、再编辑或场景复用时，其实现 SHALL 尽量保持组件化、配置驱动、资源路径稳定。开源仓库中的 `zone3Deditor` 条目应被视为编辑器接入点与配置说明，而不是完整源码镜像。

#### Scenario: 面向编辑器的场景实现

- GIVEN 某场景未来需要进入区域场景编辑器链路
- WHEN 维护者设计其结构
- THEN 该场景 SHALL 优先采用可复用组件与配置驱动方式组织

### Requirement: GoView 集成归属

当前 `GoView` 相关能力 SHALL 继续归属在外部集成规范内，而不单独拆分为独立 spec。只有当其集成面明显扩大、已形成独立约束集合时，才应考虑拆出单独规范。

#### Scenario: 当前 GoView 规范归属

- GIVEN 维护者需要查阅 `GoView` 相关边界
- WHEN 当前集成面仍以导入导出和组合接入为主
- THEN 该边界 SHALL 继续由 `external-integrations` 管理
