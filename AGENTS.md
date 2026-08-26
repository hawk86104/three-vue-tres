# Codex 项目规则

## 编码规范

- 代码架构简单，逻辑清晰，每次生成代码量精简。保证人类可以较好的review。

## 验证命令

- 在修改本项目代码后，不要自动运行构建或调试命令。
- 这包括 `npm run build`、`npm run dev`、`npm run serve`、`npm run preview`、`./package.json` 的 scripts 中的命令、Vite 的 dev/preview 命令、本地服务器启动，以及基于浏览器的调试或截图。
- 只有当用户在当前对话中明确要求进行这些验证时，才可以运行这些命令。
- 允许进行只读检查，例如查看 diff 或源码文件。
- 在汇报已完成的工作时，需要说明：由于该项目规则要求，已跳过 build/debug 验证。