# 插件工作流

## 新建插件

优先使用现有脚手架：

```bash
node pluginMaker/index.cjs create myPlugin
```

脚手架会初始化：

- `src/plugins/myPlugin/config.js`
- `src/plugins/myPlugin/pages/index.vue`
- 模板里自带的若干支持目录
- `public/plugins/myPlugin/preview/`

把它当作起步骨架，不要把模板代码继续往上叠。

## 给已有插件新增案例

普通插件：

1. 新增 `src/plugins/foo/pages/bar.vue`
2. 在 `config.js` 里新增匹配的预览项，`name: 'bar'`
3. 把预览图和静态数据放到 `public/plugins/foo/...`

分组插件，例如 `basic`：

1. 新增 `src/plugins/basic/pages/<group>/<page>.vue`
2. 更新 `src/plugins/basic/config.js` 里对应的 `child[]` 分组
3. 保持分组路由和预览命名与现有条目一致

## config.js 字段

当前仓库里稳定存在的最小字段：

- `name`
- `title`
- `intro`
- `version`
- `author`
- `website`
- `state`
- `require`
- `preview` 或 `child`

推荐保留的字段：

- `creatTime`
- `updateTime`

条件字段：

- `tvtstore`

只有明确沿用现有 `basic` 分组模式时才使用 `child`，不要随手发明新的分组插件形态。

## 预览条目字段

每个预览条目至少应保持这几个字段一致：

- `src`
- `type`
- `name`
- `title`

仓库里正式使用的行为扩展字段：

- `url`
- `disableFPSGraph`
- `disableSrcBtn`
- `referenceSource`

规则：

- 指向本地页面的条目里，`name` 要与本地页面名一致
- 使用 `url` 的条目可以没有本地 `.vue` 页面
- `type` 目前使用 `img`、`text`、`video`
- `name` 要稳定，因为菜单、哈希、卡片跳转、二维码逻辑都会依赖它

## 资源放置习惯

优先采用插件私有命名空间：

- `public/plugins/<plugin>/preview/...`
- `public/plugins/<plugin>/model/...`
- `public/plugins/<plugin>/json/...`
- 以及其他插件内聚的子目录

这个仓库里真实存在的资源 URL 风格：

- `plugins/<plugin>/...`
- `./plugins/<plugin>/...`
- `/plugins/<plugin>/...`
- 完整 `https://...`

没有充分理由时，优先跟随周边插件已有写法。

## 共享导出

- 通过 `src/plugins/<plugin>/index.js` 暴露可复用组件和工具
- 通过 `PLS/<plugin>` 进行导入
- 公共导出面要小而明确，不要把私有内部文件默认暴露出去

## require 的语义

`config.require` 需要认真维护，它会影响：

- 非单插件模式下的本地缺失依赖检查
- `pre.build.one` 时保留哪些公共资源
- 插件 ZIP 最少需要带哪些依赖资源才能正常交付

当你依赖别的插件这些内容时，就应考虑声明：

- 公共资源
- 共享导出
- 预览期或运行期的结构假设

## 打包与安装

命令：

```bash
node pluginMaker/index.cjs package myPlugin
node pluginMaker/index.cjs install myPlugin
node pluginMaker/index.cjs remove myPlugin
```

当前打包行为：

- ZIP 包含 `src/plugins/<plugin>`
- 若存在 `public/plugins/<plugin>`，也会一起打进 ZIP
- 安装流程默认依赖 ZIP 内部保持这套正式路径结构

只有在用户明确要求删除插件时，才使用 `remove`。
