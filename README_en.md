# FileCollector MCP Server

[简体中文](README.md) | [English](README_en.md)

MCP (Model Context Protocol) server that encapsulates the FileCollector CLI, enabling LLMs to autonomously explore codebases, collect files, insert custom text, and ultimately export structured TXT context files.

## How It Works

Programming tools (such as Claude Code, Cursor) invoke this service via MCP tools, which in turn call the `filecollector` command-line tool to perform the actual orchestration. Session state is persisted via `--load`/`--save` in `~/.config/filecollector/mcp_state.fcol`, ensuring state is not lost across multiple tool invocations.

```
LLM Client (Cursor/Claude Desktop)
        |
    MCP Tools (stdio/SSE)
        |
FileCollector MCP Server (Node.js)
        |
filecollector CLI (Flet/Python or GNOME/Vala)  ———  ~/.config/filecollector/mcp_state.fcol
```

## Prerequisites

- Node.js >= 18
- FileCollector installed and available in `$PATH`

Windows / Linux / macOS users:
[FileCollector Repository](https://github.com/Sam-Fic/filecollector)

GNOME desktop environment users (beautiful UI and more active maintenance):
[FileCollector-GNOME Repository](https://github.com/Sam-Fic/filecollector-gnome)

## Available Tools

| Tool                   | Description                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `fc_set_work_dir`      | Set the working directory. Each call clears the old state and switches to the new project root |
| `fc_add_files`         | Batch add files to the orchestration queue. Accepts an array of file paths                     |
| `fc_add_custom_prompt` | Insert custom text blocks (explanations, guidance, unresolved issues, etc.)                    |
| `fc_generate_context`  | Export all queued content as a TXT file. Returns the file path and content preview             |

## Quick Start

```bash
# Install dependencies
npm install

# Build (TypeScript -> JavaScript). Use `bun build` if bun is available, otherwise tsc:
npx tsc            # or: bun build src/index.ts --outdir dist --target node

# Output located at dist/index.js
```

## Make the `filecollector` command available

The MCP server invokes the underlying CLI via the `filecollector` command, so it must be on your `$PATH`:

- **Flet edition (recommended, cross-platform, reliable for headless use)**: symlink the repo's launcher into PATH, e.g.
  ```bash
  ln -s /path/to/filecollector/filecollector ~/.local/bin/filecollector
  ```
- **GNOME edition (flatpak, Linux only)**: the command is `flatpak run com.github.samfic.filecollector`.
  Note that under the flatpak sandbox, `--load`/`--save`/`--export` file I/O is unreliable, so the
  **GNOME edition is only suitable as a GUI sync target** — when the GNOME GUI is running, MCP calls
  are reflected live in the GUI; for pure MCP headless usage, use the Flet edition.

Override the default command name via the `FILECOLLECTOR_CLI` environment variable, e.g.:

```json
{
  "mcpServers": {
    "filecollector": {
      "command": "node",
      "args": ["/absolute/path/to/filecollector-mcp-server/dist/index.js"],
      "env": { "FILECOLLECTOR_CLI": "flatpak run com.github.samfic.filecollector" }
    }
  }
}
```

## Configure in Cursor / Claude Desktop

Add to MCP client configuration (`~/.cursor/mcp.json` or Claude Desktop's `mcpServers`):

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

- State file path: `~/.config/filecollector/mcp_state.fcol`
- Each tool call automatically `--load` to restore state → perform operation → `--save` to persist
- All calls include `--no-ipc` so state is correctly persisted even in a headless environment with no GUI running
- `fc_set_work_dir` calls `--clear` to clear old state and start a new session
- Manually deleting the state file resets the session; the next call will automatically initialize

### Seamless integration with the GUI

If a FileCollector GUI is detected as running (IPC address file / socket reachable), after each
operation the MCP server **additionally** forwards the operation to the GUI over IPC
(`--work-dir` / `--select-file` / `--add-text` / `--clear`), so the GUI's orchestration list
updates in real time. A sync failure does not affect the MCP server's own result. Only parameters
that mutate the GUI's in-memory state are forwarded — never `--load` / `--save` / `--export` / `--no-ipc`.

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
