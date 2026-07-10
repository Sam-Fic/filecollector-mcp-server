# FileCollector MCP Server

[简体中文](README.md) | [English](README_en.md)

MCP (Model Context Protocol) 服务，封装 FileCollector CLI，让大模型自主探索代码库、收集文件、插入自定义文本，最终导出为结构化的 TXT 上下文文件。

## 工作原理

编程工具（如 Claude Code、Cursor）通过 MCP 工具调用本服务，本服务在底层调用 `filecollector` 命令行完成实际编排。会话状态通过 `--load` / `--save` 持久化在 `~/.config/filecollector/mcp_state.fcol`，确保连续多次工具调用间状态不丢失。

```
LLM Client (Cursor/Claude Desktop)
        |
    MCP Tools (stdio/SSE)
        |
FileCollector MCP Server (Node.js)
        |
filecollector CLI (Vala)  ———  ~/.config/filecollector/mcp_state.fcol
```

## 前置要求

- Node.js >= 18
- FileCollector 已安装并在 `$PATH` 中可用

Windows / Linux / macOS 用户：
[FileCollector 仓库地址](https://github.com/Sam-Fic/filecollector)

GNOME 桌面环境用户（美观的 UI 和更积极的维护）：
[FileCollector-GNOME 仓库地址](https://github.com/Sam-Fic/filecollector-gnome)

## 可用工具

| 工具                   | 说明                                                   |
| ---------------------- | ------------------------------------------------------ |
| `fc_set_work_dir`      | 设置工作目录。每次调用会清空旧状态并切换到新项目根目录 |
| `fc_add_files`         | 批量添加文件到编排队列。接收文件路径数组               |
| `fc_add_custom_prompt` | 插入自定义文本块（解释、引导词、待解决问题等自由文本） |
| `fc_generate_context`  | 导出队列中所有内容为 TXT 文件。返回文件路径及内容预览  |

## 快速开始

```bash
# 安装依赖
npm install

# 构建（TypeScript -> JavaScript）。环境有 bun 时用 `bun build`，否则用 tsc：
npx tsc            # 或: bun build src/index.ts --outdir dist --target node

# 产物位于 dist/index.js
```

## 让 `filecollector` 命令可用

MCP server 通过 `filecollector` 命令调用底层 CLI，需保证它在 `$PATH` 中：

- **Flet 版（推荐，跨平台，headless 可用）**：把仓库的启动脚本软链到 PATH，例如
  ```bash
  ln -s /path/to/filecollector/filecollector ~/.local/bin/filecollector
  ```
- **GNOME 版（flatpak，仅 Linux）**：命令名为 `flatpak run com.github.samfic.filecollector`。
  注意 flatpak 沙箱下 `--load/--save/--export` 的文件读写不可靠，**GNOME 版仅适合作为
  GUI 同步目标**——即 GNOME GUI 已运行时，MCP 调用会实时反映到 GUI；纯 MCP headless
  场景请使用 Flet 版。

可通过环境变量 `FILECOLLECTOR_CLI` 覆盖默认命令名，例如：

```json
{
  "mcpServers": {
    "filecollector": {
      "command": "node",
      "args": ["/absolute/path/to/filecollector-mcp-server/dist/index.js"],
      "env": {
        "FILECOLLECTOR_CLI": "flatpak run com.github.samfic.filecollector"
      }
    }
  }
}
```

## 在 Cursor / Claude Desktop 中配置

在 MCP 客户端配置中添加（`~/.cursor/mcp.json` 或 Claude Desktop 的 `mcpServers` 配置）：

```json
{
  "mcpServers": {
    "filecollector": {
      "command": "node",
      "args": ["/absolute/path/to/filecollector-mcp-server/dist/index.js"]
    }
  }
}
```

如果修改了源码需要重新构建：

```bash
npx tsc
```

## 典型工作流

1. **大模型探索代码库**后，调用 `fc_set_work_dir` 将工作目录指向项目根
2. 调用 `fc_add_files` 将关键源文件加入编排队列（可多次调用）
3. 调用 `fc_add_custom_prompt` 插入任务说明、待解决问题或分析结论
4. 调用 `fc_generate_context` 将所有内容合并导出为 TXT，并在返回结果中预览

## 状态管理

- 状态文件路径：`~/.config/filecollector/mcp_state.fcol`
- 每个工具调用自动 `--load` 恢复状态 → 执行操作 → `--save` 持久化
- 所有调用都带 `--no-ipc`，保证在无 GUI 的 headless 环境下状态正确落盘
- `fc_set_work_dir` 会调用 `--clear` 清空旧状态，开启新会话
- 手动删除状态文件可重置会话，下次调用将自动初始化

## 与 GUI 的无缝衔接

若检测到 FileCollector GUI 正在运行（IPC 地址文件/套接字可达），MCP 在每次操作后
会**额外**通过 IPC 把操作实时转发给 GUI（`--work-dir` / `--select-file` / `--add-text`
/ `--clear`），使 GUI 编排列表即时反映 MCP 的改动；同步失败不影响 MCP 自身返回结果。
同步仅发送会修改 GUI 内存状态的参数，不含 `--load` / `--save` / `--export` / `--no-ipc`。

## 项目结构

```
src/
├── index.ts                              # stdio 入口
├── server/
│   └── server.ts                         # FastMCP 服务器工厂
├── core/
│   ├── tools.ts                          # 工具注册
│   └── services/
│       ├── filecollector-service.ts      # filecollector CLI 调用封装
│       └── index.ts                      # 服务导出
```
