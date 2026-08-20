import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { InstallMode } from './installer.js';

export interface InstallRecord {
  version: 1;
  managedBy: 'skillctl';
  skills: Record<string, {
    mode: InstallMode;
    installedAt: string;
    sourceHash: string | null;
  }>;
}

/** 读取 target 的安装记录，不存在时返回空记录。 */
export function readInstallRecord(file: string): InstallRecord {
  if (!existsSync(file)) {
    return { version: 1, managedBy: 'skillctl', skills: {} };
  }
  const record = JSON.parse(readFileSync(file, 'utf8')) as InstallRecord;
  if (record.version !== 1 || record.managedBy !== 'skillctl' || !record.skills) {
    throw new Error(`无效的安装记录：${file}`);
  }
  return record;
}

/** 写入只包含 skill 状态的 target 安装记录。 */
export function writeInstallRecord(file: string, record: InstallRecord): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}
