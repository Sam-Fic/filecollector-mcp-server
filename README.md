# FileCollector MCP Server

[简体中文](README.md) | [English](README_en.md)

MCP (Model Context Protocol) 服务，封装 FileCollector CLI，让大模型自主探索代码库、收集文件、插入自定义文本，最终导出为结构化的 TXT 上下文文件。

## How It Works

编程工具（如 Claude Code、Cursor）通过 MCP 工具调用本服务，本服务在底层调用 `filecollector` 命令行完成实际编排。会话状态通过 `--load` / `--save` 持久化在 `~/.config/filecollector/mcp_state.json`，确保连续多次工具调用间状态不丢失。

```
LLM Client (Cursor/Claude Desktop)
        |
    MCP Tools (stdio/SSE)
        |
FileCollector MCP Server (Node.js)
        |
filecollector CLI (Vala)  ———  ~/.config/filecollector/mcp_state.json
```

## Prerequisites

- Node.js >= 18
- FileCollector 已安装并在 `$PATH` 中可用

Windows / Linux / macOS 用户：
[FileCollector 仓库地址](https://github.com/Sam-Fic/filecollector)

GNOME 桌面环境用户（美观的 UI 和更积极的维护）：
[FileCollector-GNOME 仓库地址](https://github.com/Sam-Fic/filecollector-gnome)


## Available Tools

| Tool | Description |
|---|---|
| `fc_set_work_dir` | 设置工作目录。每次调用会清空旧状态并切换到新项目根目录 |
| `fc_add_files` | 批量添加文件到编排队列。接收文件路径数组 |
| `fc_add_custom_prompt` | 插入自定义文本块（解释、引导词、待解决问题等自由文本） |
| `fc_generate_context` | 导出队列中所有内容为 TXT 文件。返回文件路径及内容预览 |

## Quick Start

```bash
# 安装依赖
npm install

# 构建（TypeScript -> JavaScript）
npx tsc

# 产物位于 dist/index.js
```

## Configure in Cursor / Claude Desktop

在 MCP 客户端配置中添加（`~/.cursor/mcp.json` 或 Claude Desktop 的 `mcpServers` 配置）：

```json
{
  "mcpServers": {
    "filecollector": {
      "command": "node",
      "args": ["/absolute/path/to/template-mcp-server/dist/index.js"]
    }
  }
}
```

如果修改了源码需要重新构建：

```bash
npx tsc
```

## Typical Workflow

1. **大模型探索代码库**后，调用 `fc_set_work_dir` 将工作目录指向项目根
2. 调用 `fc_add_files` 将关键源文件加入编排队列（可多次调用）
3. 调用 `fc_add_custom_prompt` 插入任务说明、待解决问题或分析结论
4. 调用 `fc_generate_context` 将所有内容合并导出为 TXT，并在返回结果中预览

## State Management

- 状态文件路径：`~/.config/filecollector/mcp_state.json`
- 每个工具调用自动 `--load` 恢复状态 → 执行操作 → `--save` 持久化
- `fc_set_work_dir` 会调用 `--clear` 清空旧状态，开启新会话
- 手动删除状态文件可重置会话，下次调用将自动初始化

## Project Structure

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