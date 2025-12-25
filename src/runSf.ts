import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

function cleanCliOutput(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
  s = s.replace(/\r+/g, '\n');
  s = s.replace(/\n{2,}/g, '\n');
  return s.trim();
}

export interface SfRunResult {
  parsed?: any;
  cleaned: string;
  rawStdout: string;
  rawStderr: string;
  code: number | null;
}

function tryKillProcessTree(child: ChildProcess) {
  if (child.killed) return;
  const pid = child.pid;

  try {
    if (!pid) {
      child.kill();
      return;
    }

    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true });
      return;
    }

    child.kill('SIGTERM');
    setTimeout(() => {
      try {
        if (!child.killed) child.kill('SIGKILL');
      } catch {
      }
    }, 5000);
  } catch {
  }
}

function getWorkspaceRoot(): string | undefined {
  return (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders[0].uri.fsPath
  );
}

export async function runSfWithManifest(
  manifestPath: string,
  sfCmdBase: string,
  token?: vscode.CancellationToken,
  useJsonOutput: boolean = true,
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void
): Promise<SfRunResult> {
  const cwd = getWorkspaceRoot() || path.dirname(manifestPath);
  const parts = sfCmdBase.split(' ').filter(Boolean);
  const cmd = parts[0];

  const quotedManifest = `"${manifestPath}"`;
  const args = parts.slice(1).concat(['--manifest', quotedManifest]);
  if (useJsonOutput) args.push('--json');

  return await new Promise<SfRunResult>((resolve) => {
    let settled = false;
    const finish = (result: SfRunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    if (token?.isCancellationRequested) {
      finish({
        parsed: undefined,
        cleaned: 'Cancelled',
        rawStdout: '',
        rawStderr: '',
        code: null,
      });
      return;
    }

    const child = spawn(cmd, args, { cwd, shell: true });

    let stdout = '';
    let stderr = '';

    const cancelDisposable = token?.onCancellationRequested(() => {
      tryKillProcessTree(child);
      finish({
        parsed: undefined,
        cleaned: 'Cancelled',
        rawStdout: stdout,
        rawStderr: stderr,
        code: null,
      });
    });

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onData?.(text, 'stdout');
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onData?.(text, 'stderr');
    });

    child.on('close', (code) => {
      cancelDisposable?.dispose();
      const cleaned = cleanCliOutput(stdout + '\n' + stderr);
      let parsed: any;

      try {
        parsed = useJsonOutput && stdout.trim() ? JSON.parse(stdout) : undefined;
      } catch {
        parsed = undefined;
      }

      finish({
        parsed,
        cleaned,
        rawStdout: stdout,
        rawStderr: stderr,
        code,
      });
    });

    child.on('error', (err) => {
      cancelDisposable?.dispose();
      finish({
        parsed: undefined,
        cleaned: String(err),
        rawStdout: '',
        rawStderr: String(err),
        code: (err as any).code ?? 1,
      });
    });
  });
}
