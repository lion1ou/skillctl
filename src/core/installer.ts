import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export type InstallMode = 'symlink' | 'copy';

export interface InstallOpts {
  source: string;
  dest: string;
  mode: InstallMode;
  force: boolean;
}

export type InstallStatus = 'create' | 'overwrite' | 'unchanged' | 'update' | 'skipped';

export interface InstallResult {
  status: InstallStatus;
  sourceHash: string | null;
  reason?: string;
}

export function installItem(opts: InstallOpts): InstallResult {
  const { source, dest, mode, force } = opts;
  if (!existsSync(source)) {
    throw new Error(`安装失败：源路径不存在 ${source}`);
  }
  const exists = existsSync(dest) || isSymlink(dest);
  if (mode === 'symlink') return installSymlink(source, dest, force, exists);
  return installCopy(source, dest, force, exists);
}

export function hashPath(p: string): string {
  const h = createHash('sha256');
  const stat = statSync(p);
  if (stat.isFile()) {
    h.update(readFileSync(p));
  } else {
    walk(p, (file) => {
      h.update(`${file.relative}\u0000`);
      h.update(readFileSync(file.abs));
    });
  }
  return `sha256:${h.digest('hex')}`;
}

function installSymlink(source: string, dest: string, force: boolean, exists: boolean): InstallResult {
  if (exists) {
    const stat = lstatSync(dest);
    if (stat.isSymbolicLink()) {
      if (readlinkSync(dest) === source) return { status: 'unchanged', sourceHash: null };
      if (!force) {
        return skip(dest, '已存在指向其他源的软链');
      }
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      symlinkSync(source, dest);
      return { status: 'overwrite', sourceHash: null };
    }
    if (!force) {
      return skip(dest, '已存在非软链文件/目录');
    }
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  symlinkSync(source, dest);
  return { status: 'create', sourceHash: null };
}

function installCopy(source: string, dest: string, force: boolean, exists: boolean): InstallResult {
  const newHash = hashPath(source);
  if (exists) {
    if (isSymlink(dest)) {
      if (!force) return skip(dest, '已存在软链');
      rmSync(dest, { recursive: true, force: true });
    } else {
      const oldHash = hashPath(dest);
      if (oldHash === newHash) return { status: 'unchanged', sourceHash: newHash };
      if (!force) return skip(dest, '已存在内容不同的文件/目录');
      rmSync(dest, { recursive: true, force: true });
      copyRecursive(source, dest);
      return { status: 'update', sourceHash: newHash };
    }
  }
  copyRecursive(source, dest);
  return { status: 'create', sourceHash: newHash };
}

function copyRecursive(src: string, dest: string): void {
  const stat = statSync(src);
  if (stat.isFile()) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === '.git') continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else if (entry.isFile()) copyFileSync(s, d);
  }
}

interface FileVisit {
  abs: string;
  relative: string;
}

function walk(root: string, fn: (f: FileVisit) => void, sub = ''): void {
  const dir = sub ? join(root, sub) : root;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name === '.DS_Store' || entry.name === '.git') continue;
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, fn, rel);
    else if (entry.isFile()) fn({ abs: join(root, rel), relative: rel });
  }
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function skip(dest: string, reason: string): InstallResult {
  return {
    status: 'skipped',
    sourceHash: null,
    reason: `${dest} ${reason}。使用 --force 覆盖。`,
  };
}
