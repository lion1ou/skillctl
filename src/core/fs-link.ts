import { lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Windows 上 libuv 只自动补 `.exe`，认不出 `npx.cmd`。
 * 见 https://github.com/nodejs/node/issues/3675
 */
export function resolveNpxExecutable(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
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
