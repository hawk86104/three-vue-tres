# plugin-lifecycle 规范

## 目的

定义插件从创建、打包、安装、删除到单插件构建的整个生命周期，包括插件元数据如何影响最终交付产物。

## 职责边界

### 本规范覆盖

- `pluginMaker/index.cjs` 的 `create`、`package`、`install`、`remove` 命令
- 新建插件后的脚手架预期
- 源码与公共资源的 ZIP 打包边界
- 插件 ZIP 安装行为
- 单插件构建时的资源保留逻辑
- `config.require` 对单插件构建结果的影响

### 本规范不覆盖

- 插件具体场景或业务语义本身
- 预览中心分类逻辑
- 除生命周期必须遵守之外的路由实现细节
- 宿主应用的集成契约

## 主要代码依据

- `pluginMaker/index.cjs`
- `.fes.predev.one.js`
- `src/common/copySelectedPublicDirsPlugin.js`
- `src/common/utils.js`
- `.env.predev.one`
- `package.json`

## 要求

### Requirement: 生命周期命令范围

插件生命周期命令 SHALL 同时面向源码目录与公共资源目录这两个命名空间工作。`create`、`package`、`install`、`remove` 都属于正式生命周期命令集合。

#### Scenario: 打包插件

- GIVEN 维护者执行 `node pluginMaker/index.cjs package <plugin>`
- WHEN 插件存在
- THEN 系统 SHALL 以 `src/plugins/<plugin>` 为源码边界进行打包
- AND 若存在 `public/plugins/<plugin>`，也 SHALL 一并纳入包内容

#### Scenario: 安装插件

- GIVEN 维护者执行 `node pluginMaker/index.cjs install <plugin>`
- WHEN `pluginMaker/install/<plugin>.zip` 存在
- THEN 系统 SHALL 将插件安装到当前仓库的正式插件命名空间中

### Requirement: 模板脚手架地位

`template.zip` 生成的内容 SHALL 被视为插件初始化便利工具，而不是插件最终结构的全部规范来源。正式插件结构与约束应以 `plugin-system` 规范为准；脚手架只负责快速起步。

#### Scenario: 新建插件后继续定制

- GIVEN 维护者执行 `node pluginMaker/index.cjs create <plugin>`
- WHEN 脚手架生成了默认文件
- THEN 这些文件 SHALL 被视为可替换的初始化模板
- AND 维护者后续 SHALL 根据真实插件需求替换和完善实现

### Requirement: 单插件构建保留规则

单插件构建流程 SHALL 保留目标插件及其显式声明的依赖插件。其资源保留范围以目标插件名和 `config.require` 为准，而不是全量复制所有插件公共资源。

#### Scenario: 单插件资源裁剪

- GIVEN 当前单插件构建目标已通过 `FES_APP_PLSNAME` 指定
- WHEN 构建流程复制公共资源
- THEN 系统 SHALL 仅复制目标插件及其 `config.require` 中声明的依赖插件资源

### Requirement: remove 命令归属与约束

带破坏性的 `remove` 命令 SHALL 继续被视为插件生命周期规范的一部分，而不是拆到独立运维规范。由于其会删除源码与公共资源目录，维护者 SHALL 仅在显式确认删除时使用该命令。

#### Scenario: 删除插件

- GIVEN 维护者执行 `node pluginMaker/index.cjs remove <plugin>`
- WHEN 系统进入删除确认流程
- THEN 只有在维护者显式输入确认后
- 系统 SHALL 删除 `src/plugins/<plugin>` 与 `public/plugins/<plugin>` 中存在的对应目录
