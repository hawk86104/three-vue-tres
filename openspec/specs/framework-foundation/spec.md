# framework-foundation 规范

## 目的

定义 TvT.js 作为框架的稳定身份边界：项目本质是什么、核心技术栈是什么、哪些仓库级约定应被视为框架规则，而不是某个插件自己的实现细节。

## 职责边界

### 本规范覆盖

- 项目作为“三维可视化快速落地框架”的定位，而不是单一业务应用
- 以代码为准的框架级技术栈选择与版本锚点
- 会影响全部能力的仓库级目录约定
- 影响所有下游能力的全局构建与运行入口
- 哪些文件应被视为代码优先的事实来源

### 本规范不覆盖

- 插件页面路由细节
- 插件元数据字段规范
- 预览中心菜单行为
- 插件打包与安装流程
- `qiankun`、`uni-app`、`zone3Deditor`、`GoView` 的集成细节

## 主要代码依据

- `package.json`
- `.fes.js`
- `src/app.jsx`
- `README.md`
- `README_zh.md`

## 要求

### Requirement: 框架身份保持

仓库 SHALL 保持 TvT.js 作为“三维可视化快速落地框架”的定位。维护者在做结构调整时 SHALL 优先维护框架能力边界，而不是把仓库收缩为单一项目案例。

#### Scenario: 进行大规模结构调整

- GIVEN 维护者计划重构仓库结构
- WHEN 调整会影响多个插件、运行模式或集成能力
- THEN 调整 SHALL 以框架能力维持为前提
- AND 相关边界应先写入规范再实施

### Requirement: 代码优先事实源

当代码实现与说明文档出现冲突时，框架级事实 SHALL 默认以代码为准；文档应被视为解释层，而不是覆盖代码行为的更高来源。

#### Scenario: 文档与代码对 Node 基线不一致

- GIVEN `package.json` 与 README 中的 Node.js 版本要求不一致
- WHEN 维护者需要确定项目当前基线
- THEN SHALL 以 `package.json` 中的约束作为当前正式基线
- AND README 中的差异应被视为待同步文档问题，而不是覆盖代码事实

### Requirement: Node.js 基线

TvT.js 当前的 Node.js 基线 SHALL 以 `package.json` 中的 `engines.node` 为准。后续若要提升 Node.js 基线，应先改代码和包管理约束，再同步文档说明。

#### Scenario: 维护者更新运行环境要求

- GIVEN 维护者计划提高最低 Node.js 版本
- WHEN 该调整成为项目正式要求
- THEN SHALL 先修改 `package.json`
- AND 之后再同步 README 与其他说明文档
