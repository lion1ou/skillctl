import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/** 调用当前系统的原生目录选择器，取消选择时返回 null。 */
export async function pickWorkspaceDirectory(): Promise<string | null> {
  const command = platformPicker();
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

function platformPicker(): { file: string; args: string[] } {
  if (process.platform === 'darwin') {
    return {
      file: 'osascript',
      args: ['-e', 'POSIX path of (choose folder with prompt "选择要管理的 Workspace")'],
    };
  }
  if (process.platform === 'win32') {
    return {
      file: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
          `$dialog.SelectedPath = '${homedir().replaceAll("'", "''")}'`,
          'if ($dialog.ShowDialog() -eq "OK") { $dialog.SelectedPath } else { exit 1 }',
        ].join('; '),
      ],
    };
  }
  return {
    file: 'zenity',
    args: ['--file-selection', '--directory', '--title=选择要管理的 Workspace'],
  };
}

function execute(file: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error);
      else resolvePromise(stdout);
    });
  });
}
