import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  findSkillctlOnPath,
  linkGlobalSkillctl,
  npmGlobalSkillctlPath,
  restoreGlobalSkillctl,
  type GlobalSkillctlLink,
} from './core/dev-global-link.js';

/** 从 src/dev-session.ts 解析仓库根目录，避免 dirname(../) 再退一层。 */
export function resolveDevelopmentEntry(moduleUrl = import.meta.url): string {
  const repoRoot = resolveDevelopmentRoot(moduleUrl);
  return join(repoRoot, 'bin/dev.js');
}

/** 解析当前开发仓库根目录。 */
export function resolveDevelopmentRoot(moduleUrl = import.meta.url): string {
  return fileURLToPath(new URL('..', moduleUrl));
}

const developmentRoot = resolveDevelopmentRoot();
const developmentEntry = resolveDevelopmentEntry();

/** 启动开发会话：挂上全局 skill-ctl，结束后按原状态恢复。 */
export async function runDevSession(argv = process.argv.slice(2)): Promise<number> {
  const link = linkGlobalSkillctl({
    binPath: findSkillctlOnPath(process.env.PATH ?? '') ?? npmGlobalSkillctlPath(readNpmPrefix()),
    developmentEntry,
  });
  logLink(link, developmentEntry);
  try {
    if (argv.length === 0) {
      console.log(`开发仓库 ${developmentRoot} · v${readPackageVersion(developmentRoot)}`);
      console.log('按 Ctrl+C 结束开发并恢复全局 skill-ctl');
      await waitForSignal();
      return 0;
    }
    return await runDevelopmentCli(argv);
  } finally {
    restoreGlobalSkillctl(link, developmentEntry);
    console.log(link.owned ? `已恢复全局 skill-ctl：${link.binPath}` : '未改动全局 skill-ctl');
  }
}

/** 读取 npm 全局前缀，作为尚未安装 skill-ctl 时的注册目录。 */
function readNpmPrefix(): string {
  return execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8' }).trim();
}

/** 把其余参数交给开发态 CLI，使 npm run dev -- manage 仍可用。 */
function runDevelopmentCli(argv: string[]): Promise<number> {
  const child = spawn(process.execPath, [developmentEntry, ...argv], {
    stdio: 'inherit',
  });
  return waitForChild(child);
}

/** 等待用户结束空会话，并保持事件循环活跃，避免 Node 报 unsettled top-level await。 */
function waitForSignal(): Promise<void> {
  return new Promise((resolvePromise) => {
    const keepAlive = setInterval(() => undefined, 60_000);
    if (process.stdin.isTTY) process.stdin.resume();
    const finish = (): void => {
      clearInterval(keepAlive);
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      if (process.stdin.isTTY) process.stdin.pause();
      resolvePromise();
    };
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });
}

/** 等待子进程退出，并把中断信号转发给开发态 CLI。 */
function waitForChild(child: ChildProcess): Promise<number> {
  return new Promise((resolvePromise) => {
    const forward = (signal: NodeJS.Signals): void => {
      if (child.pid) child.kill(signal);
    };
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.once('exit', (code, signal) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      if (signal) {
        resolvePromise(0);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

/** 说明本次是新建全局命令还是临时改写已有指向。 */
function logLink(link: GlobalSkillctlLink, target: string): void {
  if (!link.owned) {
    console.log(`全局 skill-ctl 已指向本仓库开发入口：${formatDevLink(link.binPath, target)}`);
    return;
  }
  if (link.previous.kind === 'none') {
    console.log(`未发现全局 skill-ctl，已注册：${formatDevLink(link.binPath, target)}`);
    return;
  }
  console.log(`全局 skill-ctl 已临时指向开发入口：${formatDevLink(link.binPath, target)}`);
}

/** 把全局命令路径和开发入口拼成可读的一行映射。 */
function formatDevLink(binPath: string, target: string): string {
  return `${binPath} -> ${target}`;
}

/** 读取当前开发仓库 package.json 中的版本号。 */
function readPackageVersion(repoRoot: string): string {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}
