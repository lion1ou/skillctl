import type { SpawnOptions } from 'node:child_process';
import { lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export interface NpxSpawnSpec {
  command: string;
  args: string[];
  options: SpawnOptions;
}

/**
 * 解析调用 npx 的 spawn 参数。
 * - Windows：必须用 `npx.cmd` + `shell: true`。仅补 `.cmd` 在 Node 18.20+/22 会 EINVAL
 *   （CVE-2024-27980：禁止无 shell 直接 spawn `.cmd`/`.bat`）。
 * - 其他平台：直接 `npx`。
 */
export function resolveNpxSpawn(
  args: string[],
  platform: NodeJS.Platform = process.platform,
): NpxSpawnSpec {
  if (platform === 'win32') {
    return {
      command: 'npx.cmd',
      args,
      options: { shell: true, windowsHide: true },
    };
  }
  return { command: 'npx', args, options: {} };
}

/**
 * 创建指向目录的链接。
 * Windows 必须显式传 `dir`：省略 type 时易落成 junction，且 `lstat().isSymbolicLink()` 可能为 false，
 * 管理页会把链接当成真实目录，删除时误删源。
 */
export function linkDirectory(target: string, path: string): void {
  if (process.platform === 'win32') {
    symlinkSync(resolve(target), path, 'dir');
    return;
  }
  symlinkSync(target, path);
}

/** 是否为目录软链；Windows 上额外把 junction（readlink 可读、未必报 isSymbolicLink）算作链接。 */
export function isDirectoryLink(path: string): boolean {
  try {
    if (lstatSync(path).isSymbolicLink()) return true;
  } catch {
    return false;
  }
  if (process.platform !== 'win32') return false;
  try {
    readlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/** 比较链接目标是否指向同一路径（Windows 上会规范化绝对路径）。 */
export function isSameLinkTarget(linkPath: string, expected: string): boolean {
  try {
    return resolve(readlinkSync(linkPath)) === resolve(expected);
  } catch {
    return false;
  }
}
