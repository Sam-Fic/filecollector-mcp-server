import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const execAsync = promisify(exec);

const STATE_DIR = path.join(os.homedir(), '.config', 'filecollector');
const STATE_FILE = path.join(STATE_DIR, 'mcp_state.json');
const CLI_NAME = 'filecollector';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

async function loadOrInitState(): Promise<void> {
  ensureDir(STATE_DIR);
  if (!fs.existsSync(STATE_FILE)) {
    await execAsync(`${CLI_NAME} --clear --save ${shellQuote(STATE_FILE)}`);
  }
}

export class FileCollectorService {
  static async setWorkDir(directory: string): Promise<string> {
    await loadOrInitState();
    const cmd = [
      CLI_NAME,
      '--load', shellQuote(STATE_FILE),
      '--clear',
      '--work-dir', shellQuote(directory),
      '--save', shellQuote(STATE_FILE),
    ].join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      return stdout.trim() || `Working directory set to: ${directory}`;
    } catch (e: any) {
      throw new Error(`filecollector setWorkDir failed: ${e.message}`);
    }
  }

  static async addFiles(filePaths: string[]): Promise<string> {
    if (filePaths.length === 0) return 'No files provided.';
    await loadOrInitState();
    const fileArgs = filePaths.map(p => `--select-file ${shellQuote(p)}`).join(' ');
    const cmd = [
      CLI_NAME,
      '--load', shellQuote(STATE_FILE),
      fileArgs,
      '--save', shellQuote(STATE_FILE),
    ].join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      return stdout.trim() || `Added ${filePaths.length} file(s) to the queue.`;
    } catch (e: any) {
      throw new Error(`filecollector addFiles failed: ${e.message}`);
    }
  }

  static async addCustomPrompt(text: string): Promise<string> {
    await loadOrInitState();
    const cmd = [
      CLI_NAME,
      '--load', shellQuote(STATE_FILE),
      '--add-text', shellQuote(text),
      '--save', shellQuote(STATE_FILE),
    ].join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      return stdout.trim() || 'Custom text added to the queue.';
    } catch (e: any) {
      throw new Error(`filecollector addCustomPrompt failed: ${e.message}`);
    }
  }

  static async generateContext(
    outputPath?: string,
    includeHeader?: boolean,
  ): Promise<string> {
    await loadOrInitState();
    const outPath = outputPath || path.join(STATE_DIR, `filecollector_context_${Date.now()}.txt`);
    ensureDir(path.dirname(outPath));
    const headerFlag = includeHeader ? '--header' : '';
    const cmd = [
      CLI_NAME,
      '--load', shellQuote(STATE_FILE),
      '--export', shellQuote(outPath),
      headerFlag,
    ].filter(Boolean).join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
    } catch (e: any) {
      throw new Error(`filecollector generateContext failed: ${e.message}`);
    }
    const content = fs.readFileSync(outPath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const previewLen = Math.min(80, totalLines);
    const preview = lines.slice(0, previewLen).join('\n');
    return [
      `Context exported to: ${outPath}`,
      `  Lines: ${totalLines} | Characters: ${content.length}`,
      '',
      `--- Preview (first ${previewLen} of ${totalLines} lines) ---`,
      preview,
      totalLines > previewLen ? `... (${totalLines - previewLen} more lines)` : '',
    ].join('\n');
  }
}
