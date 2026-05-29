import { FastMCP } from "fastmcp";
import { z } from "zod";
import { FileCollectorService } from "./services/filecollector-service.js";

export function registerTools(server: FastMCP) {
  server.addTool({
    name: "fc_set_work_dir",
    description: "Initialize or switch the working directory for the file collector session. Clears any previously queued items and sets a new project root. Call this first when starting work on a new project.",
    parameters: z.object({
      directory: z.string().describe("Absolute path to the project root directory"),
    }),
    execute: async (params) => {
      return await FileCollectorService.setWorkDir(params.directory);
    },
  });

  server.addTool({
    name: "fc_add_files",
    description: "Add one or more file paths to the collection queue. Use this after exploring the codebase to select relevant source files that should be included in the final context export.",
    parameters: z.object({
      filePaths: z.array(z.string()).describe("Array of absolute file paths to add to the collection queue"),
    }),
    execute: async (params) => {
      return await FileCollectorService.addFiles(params.filePaths);
    },
  });

  server.addTool({
    name: "fc_add_custom_prompt",
    description: "Insert a custom text block, instruction, or explanatory note into the collection. Use this to add context-specific guidance, questions for the reviewing LLM, or any free-form text that should appear in the exported context file.",
    parameters: z.object({
      text: z.string().describe("Custom text, prompt, or instruction to embed in the context"),
    }),
    execute: async (params) => {
      return await FileCollectorService.addCustomPrompt(params.text);
    },
  });

  server.addTool({
    name: "fc_generate_context",
    description: "Export all queued files and custom text blocks into a single structured TXT context file. Optionally include a header with the working directory path. After export, returns the file path and a preview of the content.",
    parameters: z.object({
      outputPath: z.string().optional().describe("Absolute path for the output TXT file. If omitted, a timestamped file is created in ~/.config/filecollector/"),
      includeHeader: z.boolean().optional().describe("Whether to prepend a header section with the working directory path. Default: false"),
    }),
    execute: async (params) => {
      return await FileCollectorService.generateContext(params.outputPath, params.includeHeader);
    },
  });
}
