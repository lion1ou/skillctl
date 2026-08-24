import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { CLI_NAME } from './brand.js';

export const DEV_BACKUP_SUFFIX = '.skillctl-dev-backup';
export const DEV_LOCK_SUFFIX = '.skillctl-dev-lock';

export type GlobalSkillctlPrevious =
  | { kind: 'none' }
  | { kind: 'symlink'; target: string }
  | { kind: 'file'; backupPath: string };

export interface GlobalSkillctlLink {
  binPath: string;
  previous: GlobalSkillctlPrevious;
  owned: boolean;
}

/** 在 PATH 中查找已有的 CLI 可执行文件，不解析最终目标。 */
export function findSkillctlOnPath(envPath: string, pathDelimiter = delimiter): string | undefined {
  for (const dir of envPath.split(pathDelimiter)) {
    if (!dir) continue;
    const candidate = join(dir, CLI_NAME);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** 把 npm 全局前缀转换成 CLI 命令应注册的路径。 */
export function npmGlobalSkillctlPath(prefix: string): string {
  return join(prefix, 'bin', CLI_NAME);
}

/** 开发会话期间把全局 CLI 软链到本仓库入口；仅当另一个会话仍在运行时才不抢所有权。 */
export function linkGlobalSkillctl(input: {
  binPath: string;
  developmentEntry: string;
}): GlobalSkillctlLink {
  const binPath = resolve(input.binPath);
  const developmentEntry = resolve(input.developmentEntry);
  mkdirSync(dirname(binPath), { recursive: true });
  if (isLinkedTo(binPath, developmentEntry)) {
    if (hasLiveDevSession(binPath)) return { binPath, previous: { kind: 'none' }, owned: false };
    writeFileSync(`${binPath}${DEV_LOCK_SUFFIX}`, `${process.pid}\n`, 'utf8');
    return { binPath, previous: { kind: 'none' }, owned: true };
  }
  const previous = capturePrevious(binPath);
  if (existsSync(binPath)) unlinkSync(binPath);
  symlinkSync(developmentEntry, binPath);
  writeFileSync(`${binPath}${DEV_LOCK_SUFFIX}`, `${process.pid}\n`, 'utf8');
  return { binPath, previous, owned: true };
}

/** 仅在本进程拥有会话且当前仍指向开发入口时，恢复原先的全局 CLI。 */
export function restoreGlobalSkillctl(link: GlobalSkillctlLink, developmentEntry: string): void {
  if (!link.owned) return;
  const lockPath = `${link.binPath}${DEV_LOCK_SUFFIX}`;
  if (existsSync(lockPath)) unlinkSync(lockPath);
  const developmentPath = resolve(developmentEntry);
  if (existsSync(link.binPath) && !isLinkedTo(link.binPath, developmentPath)) return;
  if (isLinkedTo(link.binPath, developmentPath)) unlinkSync(link.binPath);
  if (link.previous.kind === 'none') return;
  if (link.previous.kind === 'symlink') {
    symlinkSync(link.previous.target, link.binPath);
    return;
  }
  if (!existsSync(link.previous.backupPath)) {
    throw new Error(`缺少全局 ${CLI_NAME} 备份：${link.previous.backupPath}`);
  }
  renameSync(link.previous.backupPath, link.binPath);
}

/** 判断残留软链是否仍被运行中的开发会话持有；锁缺失或进程已退出即视为残留。 */
function hasLiveDevSession(binPath: string): boolean {
  const lockPath = `${binPath}${DEV_LOCK_SUFFIX}`;
  if (!existsSync(lockPath)) return false;
  const pid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** 判断路径是否为指向开发入口的软链。 */
function isLinkedTo(binPath: string, developmentEntry: string): boolean {
  if (!existsSync(binPath)) return false;
  if (!lstatSync(binPath).isSymbolicLink()) return false;
  return resolve(dirname(binPath), readlinkSync(binPath)) === resolve(developmentEntry);
}

/** 记录替换前的文件或软链，普通文件先挪到旁路备份。 */
function capturePrevious(binPath: string): GlobalSkillctlPrevious {
  if (!existsSync(binPath)) return { kind: 'none' };
  if (lstatSync(binPath).isSymbolicLink()) {
    return { kind: 'symlink', target: readlinkSync(binPath) };
  }
  const backupPath = `${binPath}${DEV_BACKUP_SUFFIX}`;
  if (existsSync(backupPath)) unlinkSync(backupPath);
  renameSync(binPath, backupPath);
  return { kind: 'file', backupPath };
}
