import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const DIRECTORY_PICK_KINDS = ['workspace', 'source', 'cache', 'restore'] as const;
export type DirectoryPickKind = (typeof DIRECTORY_PICK_KINDS)[number];

const DIRECTORY_PICK_PROMPTS: Record<DirectoryPickKind, string> = {
  workspace: '选择 Workspace 目录',
  source: '选择 Skill 源目录',
  cache: '选择缓存目录',
  restore: '选择要恢复的 Skill 源目录',
};

/** 调用当前系统的原生目录选择器，取消选择时返回 null。 */
export async function pickDirectory(kind: DirectoryPickKind): Promise<string | null> {
  const command = platformPicker(DIRECTORY_PICK_PROMPTS[kind]);
  try {
    const stdout = await execute(command.file, command.args);
    const selected = stdout.trim();
    return selected ? resolve(selected) : null;
  } catch (error) {
    const exitCode = (error as { code?: number | string }).code;
    if (exitCode === 1 || exitCode === 130) return null;
    throw new Error(`无法打开目录选择器：${error instanceof Error ? error.message : String(error)}`);
  }
}

function platformPicker(prompt: string): { file: string; args: string[] } {
  if (process.platform === 'darwin') {
    return {
      file: 'osascript',
      args: ['-e', `POSIX path of (choose folder with prompt ${appleScriptString(prompt)})`],
    };
  }
  if (process.platform === 'win32') {
    const selectedPath = homedir().replaceAll("'", "''");
    const description = prompt.replaceAll("'", "''");
    return {
      file: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
          `$dialog.Description = '${description}'`,
          `$dialog.SelectedPath = '${selectedPath}'`,
          'if ($dialog.ShowDialog() -eq "OK") { $dialog.SelectedPath } else { exit 1 }',
        ].join('; '),
      ],
    };
  }
  return {
    file: 'zenity',
    args: ['--file-selection', '--directory', `--title=${prompt}`],
  };
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function execute(file: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error);
      else resolvePromise(stdout);
    });
  });
}
