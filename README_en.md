# FileCollector MCP Server

[简体中文](README.md) | [English](README_en.md)

MCP (Model Context Protocol) server that encapsulates the FileCollector CLI, enabling LLMs to autonomously explore codebases, collect files, insert custom text, and ultimately export structured TXT context files.

## How It Works

Programming tools (such as Claude Code, Cursor) invoke this service via MCP tools, which in turn call the `filecollector` command-line tool to perform the actual orchestration. Session state is persisted via `--load`/`--save` in `~/.config/filecollector/mcp_state.json`, ensuring state is not lost across multiple tool invocations.

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
- FileCollector installed and available in `$PATH`

Windows / Linux / macOS users:
[FileCollector Repository](https://github.com/Sam-Fic/filecollector)

GNOME desktop environment users (beautiful UI and more active maintenance):
[FileCollector-GNOME Repository](https://github.com/Sam-Fic/filecollector-gnome)


## Available Tools

| Tool | Description |
|---|---|
| `fc_set_work_dir` | Set the working directory. Each call clears the old state and switches to the new project root |
| `fc_add_files` | Batch add files to the orchestration queue. Accepts an array of file paths |
| `fc_add_custom_prompt` | Insert custom text blocks (explanations, guidance, unresolved issues, etc.) |
| `fc_generate_context` | Export all queued content as a TXT file. Returns the file path and content preview |

## Quick Start

```bash
# Install dependencies
npm install

# Build (TypeScript -> JavaScript)
npx tsc

# Output located at dist/index.js
```

## Configure in Cursor / Claude Desktop

Add to MCP client configuration (`~/.cursor/mcp.json` or Claude Desktop's `mcpServers`):

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

If you modify the source code, you need to rebuild:

```bash
npx tsc
```

## Typical Workflow

1. After the LLM explores the codebase, call `fc_set_work_dir` to set the working directory to the project root
2. Call `fc_add_files` to add key source files to the orchestration queue (can be called multiple times)
3. Call `fc_add_custom_prompt` to insert task descriptions, unresolved issues, or analysis conclusions
4. Call `fc_generate_context` to merge and export all content as a TXT file, with preview in the result

## State Management

- State file path: `~/.config/filecollector/mcp_state.json`
- Each tool call automatically `--load` to restore state → perform operation → `--save` to persist
- `fc_set_work_dir` calls `--clear` to clear old state and start a new session
- Manually deleting the state file resets the session; the next call will automatically initialize

## Project Structure

```
src/
├── index.ts                              # stdio entry
├── server/
│   └── server.ts                         # FastMCP server factory
├── core/
│   ├── tools.ts                          # Tool registration
│   └── services/
│       ├── filecollector-service.ts      # Encapsulation of filecollector CLI calls
│       └── index.ts                      # Service export
```