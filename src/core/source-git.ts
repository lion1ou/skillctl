import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

/** 判断输入是否为可 clone 的远程 git 地址。 */
export function isGitRemoteSource(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/i.test(trimmed);
}

/** 把常见 https git 地址规范为 SSH；file:// 与已有 SSH 保持可用。 */
export function toSshGitRemote(remote: string): string {
  const trimmed = remote.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (/^file:/i.test(trimmed)) return trimmed;
  if (/^git@/i.test(trimmed)) {
    return /\.git$/i.test(trimmed) ? trimmed : `${trimmed}.git`;
  }
  if (/^ssh:\/\//i.test(trimmed)) return trimmed;
  const https = trimmed.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (https) {
    return `git@${https[1]}:${https[2]!.replace(/\.git$/i, '')}.git`;
  }
  return trimmed;
}

/** 由远程地址推导 ~/.config/skillctl/sources/<owner>/<repo> 本地路径。 */
export function resolveGitSourceLocalPath(
  remote: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { owner, repo } = parseRemoteSlug(remote.trim());
  return join(resolveSkillctlConfigHome(env), 'sources', owner, repo);
}

/** clone 远程源到本地；已存在同 remote 仓库时复用。 */
export function ensureGitSourceCheckout(
  remote: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): { localPath: string; remote: string } {
  const normalized = toSshGitRemote(normalizeRemote(remote));
  const localPath = resolveGitSourceLocalPath(normalized, options.env);
  if (existsSync(join(localPath, '.git'))) {
    assertSameRemote(localPath, normalized);
    return { localPath, remote: normalized };
  }
  if (existsSync(localPath)) {
    const entries = readdirSync(localPath);
    if (entries.length > 0) {
      throw new Error(`本地源目录非空且不是 git 仓库：${localPath}`);
    }
  } else {
    mkdirSync(dirname(localPath), { recursive: true });
  }
  try {
    execFileSync('git', ['clone', '--', normalized, localPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error
      ? String((error as { stderr?: string }).stderr ?? error.message).trim()
      : error instanceof Error ? error.message : String(error);
    throw new Error(`克隆 skill 源失败：${normalized}\n${detail}`);
  }
  return { localPath, remote: normalized };
}

function resolveSkillctlConfigHome(env: NodeJS.ProcessEnv): string {
  const configHome = env.XDG_CONFIG_HOME
    ? resolve(env.XDG_CONFIG_HOME)
    : join(env.HOME ? resolve(env.HOME) : homedir(), '.config');
  return join(configHome, 'skillctl');
}

/** 从常见 git URL 提取 owner/repo；file:// 使用 file/<basename>。 */
function parseRemoteSlug(remote: string): { owner: string; repo: string } {
  const normalized = normalizeRemote(remote);
  if (/^file:\/\//i.test(normalized)) {
    const path = normalized.replace(/^file:\/\//i, '');
    const name = sanitizeSegment(basename(path)) || 'repo';
    return { owner: 'file', repo: name };
  }
  const sshMatch = normalized.match(/^git@[^:]+:(.+)$/i);
  const pathPart = sshMatch
    ? sshMatch[1]
    : normalized.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, '');
  const segments = pathPart
    .replace(/\.git$/i, '')
    .split('/')
    .map((segment) => sanitizeSegment(segment))
    .filter(Boolean);
  if (segments.length >= 2) {
    return {
      owner: segments[segments.length - 2]!,
      repo: segments[segments.length - 1]!,
    };
  }
  if (segments.length === 1) {
    return { owner: 'repo', repo: segments[0]! };
  }
  throw new Error(`无法解析 git 远程地址：${remote}`);
}

function normalizeRemote(remote: string): string {
  const trimmed = remote.trim();
  if (!trimmed) throw new Error('git 远程地址不能为空');
  if (!isGitRemoteSource(trimmed)) {
    throw new Error(`不是有效的 git 远程地址：${remote}`);
  }
  return trimmed.replace(/\/+$/, '');
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** 确认已有 clone 指向同一远程，避免覆盖无关目录。 */
function assertSameRemote(localPath: string, expectedRemote: string): void {
  if (!statSync(localPath).isDirectory()) {
    throw new Error(`本地源路径不是目录：${localPath}`);
  }
  let current = '';
  try {
    current = execFileSync('git', ['-C', localPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(`本地源目录已存在但无法读取 origin：${localPath}`);
  }
  if (normalizeComparableRemote(current) !== normalizeComparableRemote(expectedRemote)) {
    throw new Error(
      `本地源目录已被其他远程占用：${localPath}\n现有：${current}\n请求：${expectedRemote}`,
    );
  }
}

function normalizeComparableRemote(remote: string): string {
  return toSshGitRemote(remote).replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase();
}
