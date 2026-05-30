import { FastMCP } from "fastmcp";
import { registerTools } from "../core/tools.js";

async function startServer() {
  try {
    const server = new FastMCP({
      name: "FileCollector MCP Server",
      version: "1.0.0"
    });

    registerTools(server);

    console.error(`FileCollector MCP Server initialized`);

    return server;
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

export default startServer;
