import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';

const execAsync = promisify(exec);

const STATE_DIR = path.join(os.homedir(), '.config', 'filecollector');
const STATE_FILE = path.join(STATE_DIR, 'mcp_state.fcol');
// CLI 命令名可配置：默认裸 `filecollector`（Flet 版，跨平台）。
// 仅装 GNOME flatpak 版时设为 `flatpak run com.github.samfic.filecollector`。
// 注意：GNOME flatpak 版 sandbox 下文件读写不可靠，仅适合作为 GUI 同步目标；
//       headless 真可用必须依赖 Flet 版。
const CLI_NAME = process.env.FILECOLLECTOR_CLI || 'filecollector';

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
    await execAsync(`${CLI_NAME} --no-ipc --clear --save ${shellQuote(STATE_FILE)}`);
  }
}

// ---------------------------------------------------------------------------
// GUI 探测 + IPC 同步（让 MCP 调用实时反映到运行中的 GUI，实现无缝衔接）
// ---------------------------------------------------------------------------

function ipcAddrFile(): string {
  // 与 filecollector/ipc.py 保持一致：Linux 下为 ~/.config/filecollector/ipc_addr.txt
  return path.join(STATE_DIR, 'ipc_addr.txt');
}

function ipcSockPath(): string {
  return path.join(STATE_DIR, 'ipc.sock');
}

/** GUI 是否正在运行（真实连接探测，避免 stalefile 误判导致每次调用超时）。 */
function isGuiRunning(): boolean {
  let addr: string;
  try {
    addr = fs.readFileSync(ipcAddrFile(), 'utf-8').trim();
  } catch {
    return false;
  }
  const sep = addr.indexOf(':');
  if (sep < 0) return false;
  const mode = addr.slice(0, sep);
  const value = addr.slice(sep + 1);
  try {
    if (mode === 'unix') {
      const s = net.createConnection({ path: value });
      s.destroy();
      return true;
    } else if (mode === 'tcp') {
      const s = net.createConnection({ host: '127.0.0.1', port: parseInt(value, 10) });
      s.destroy();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 向运行中的 GUI 发送 CLI 参数（复用 filecollector/ipc.py 的线协议）：
 *   4 字节大端长度头 + JSON(args) + 读 1 字节 ack（\x00 表示成功）。
 * 仅同步会修改 GUI 内存状态的操作（--work-dir/--select-file/--add-text/--clear），
 * 不含 --load/--save/--export/--no-ipc（这些由 MCP 自身 headless 完成）。
 * 失败仅告警，不影响 MCP 主流程返回。
 */
async function syncToGui(args: string[]): Promise<void> {
  let addrFile: string;
  try {
    addrFile = fs.readFileSync(ipcAddrFile(), 'utf-8').trim();
  } catch {
    return;
  }
  const sep = addrFile.indexOf(':');
  if (sep < 0) return;
  const mode = addrFile.slice(0, sep);
  const value = addrFile.slice(sep + 1);

  const payload = Buffer.from(JSON.stringify(args), 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);

  const sendOver = (sock: net.Socket): Promise<boolean> =>
    new Promise((resolve) => {
      let acked = false;
      const timer = setTimeout(() => {
        try { sock.destroy(); } catch { /* noop */ }
        resolve(false);
      }, 3000);
      sock.on('data', (d) => {
        acked = d.length > 0 && d[0] === 0x00;
      });
      sock.on('error', () => { clearTimeout(timer); resolve(false); });
      sock.on('close', () => { clearTimeout(timer); resolve(acked); });
      sock.write(header);
      sock.write(payload);
    });

  try {
    if (mode === 'unix') {
      const sock = net.createConnection({ path: value });
      await sendOver(sock);
    } else if (mode === 'tcp') {
      const sock = net.createConnection({ host: '127.0.0.1', port: parseInt(value, 10) });
      await sendOver(sock);
    }
  } catch {
    // 同步失败不影响 MCP 主流程
  }
}

// 构造仅用于 GUI 同步的参数（去掉 headless 专属标志）
function guiSyncArgs(extra: string[]): string[] {
  return extra;
}

// ---------------------------------------------------------------------------
// 核心服务
// ---------------------------------------------------------------------------

export class FileCollectorService {
  static async setWorkDir(directory: string): Promise<string> {
    await loadOrInitState();
    const cmd = [
      CLI_NAME,
      '--no-ipc',
      '--load', shellQuote(STATE_FILE),
      '--clear',
      '--work-dir', shellQuote(directory),
      '--save', shellQuote(STATE_FILE),
    ].join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      const result = stdout.trim() || `Working directory set to: ${directory}`;
      if (isGuiRunning()) await syncToGui(['--clear', '--work-dir', directory]);
      return result;
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
      '--no-ipc',
      '--load', shellQuote(STATE_FILE),
      fileArgs,
      '--save', shellQuote(STATE_FILE),
    ].join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      const result = stdout.trim() || `Added ${filePaths.length} file(s) to the queue.`;
      if (isGuiRunning()) await syncToGui(filePaths.map(p => `--select-file ${p}`));
      return result;
    } catch (e: any) {
      throw new Error(`filecollector addFiles failed: ${e.message}`);
    }
  }

  static async addCustomPrompt(text: string): Promise<string> {
    await loadOrInitState();
    const cmd = [
      CLI_NAME,
      '--no-ipc',
      '--load', shellQuote(STATE_FILE),
      '--add-text', shellQuote(text),
      '--save', shellQuote(STATE_FILE),
    ].join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      const result = stdout.trim() || 'Custom text added to the queue.';
      if (isGuiRunning()) await syncToGui(guiSyncArgs(['--add-text', text]));
      return result;
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
      '--no-ipc',
      '--load', shellQuote(STATE_FILE),
      '--export', shellQuote(outPath),
      headerFlag,
    ].filter(Boolean).join(' ');
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr) console.error('[filecollector:stderr]', stderr);
      if (isGuiRunning()) await syncToGui(['--export', outPath, ...(includeHeader ? ['--header'] : [])]);
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
