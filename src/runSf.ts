import * as vscode from 'vscode';
import { spawn } from 'child_process';
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

function getWorkspaceRoot(): string | undefined {
  return (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders[0].uri.fsPath
  );
}

export async function runSfWithManifest(
  manifestPath: string,
  sfCmdBase: string
): Promise<SfRunResult> {
  const cwd = getWorkspaceRoot() || path.dirname(manifestPath);
  const parts = sfCmdBase.split(' ').filter(Boolean);
  const cmd = parts[0];

  const quotedManifest = `"${manifestPath}"`;
  const args = parts.slice(1).concat(['--manifest', quotedManifest, '--json']);

  return await new Promise<SfRunResult>((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: true });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()));

    child.on('close', (code) => {
      const cleaned = cleanCliOutput(stdout + '\n' + stderr);
      let parsed: any;

      try {
        parsed = stdout.trim() ? JSON.parse(stdout) : undefined;
      } catch {
        parsed = undefined;
      }

      resolve({
        parsed,
        cleaned,
        rawStdout: stdout,
        rawStderr: stderr,
        code,
      });
    });

    child.on('error', (err) => {
      resolve({
        parsed: undefined,
        cleaned: String(err),
        rawStdout: '',
        rawStderr: String(err),
        code: (err as any).code ?? 1,
      });
    });
  });
}
