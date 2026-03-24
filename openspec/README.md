# OpenSpec 基线说明

当前仓库还没有初始化 `OpenSpec` CLI，因此这里先采用手工方式建立一套基线规范目录，作为后续正式接入 `OpenSpec` 的基础。

当前目标：

- 在 `openspec/specs/` 下明确能力边界
- 所有规范默认以代码实现为准
- 文档与代码不一致的地方，统一记录为差异说明，并优先在规范中直接收口

后续本机安装好 `OpenSpec` 后，建议这样接入：

1. 安装 `OpenSpec`
2. 运行 `openspec init`
3. 保留当前这些能力目录，并将生成的 `config.yaml`、`AGENTS.md` 与现有内容合并

建议采用的能力目录结构：

```text
openspec/
|-- README.md
|-- changes/
|   `-- archive/
|       `-- .gitkeep
`-- specs/
    |-- framework-foundation/
    |   `-- spec.md
    |-- runtime-modes/
    |   `-- spec.md
    |-- plugin-system/
    |   `-- spec.md
    |-- preview-center/
    |   `-- spec.md
    |-- plugin-lifecycle/
    |   `-- spec.md
    `-- external-integrations/
        `-- spec.md
```
