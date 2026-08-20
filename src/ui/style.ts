import chalk from 'chalk';

export const style = {
  ok: (s: string): string => chalk.green(s),
  warn: (s: string): string => chalk.yellow(s),
  err: (s: string): string => chalk.red(s),
  dim: (s: string): string => chalk.gray(s),
  path: (s: string): string => chalk.cyan(s),
  bold: (s: string): string => chalk.bold(s),
  /** OSC 8 file:// 链接，支持的终端可 Cmd/Ctrl+点击跳转 */
  fileLink: (absPath: string): string => {
    const href = pathToFileUrl(absPath);
    return `\u001b]8;;${href}\u0007${chalk.cyan.underline(absPath)}\u001b]8;;\u0007`;
  },
};

function pathToFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${withSlash.split('/').map(encodeURIComponent).join('/')}`;
}
